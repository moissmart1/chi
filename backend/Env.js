// The outside-world primitives Actions.js uses besides the Sheet helpers.
// Apps Script only; tests/fake-backend.cjs supplies in-memory versions.

function getProp_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

function setProp_(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, String(value));
}

// The trip key, from the script cache (six hours) so that a request does not
// cost a Script Properties read; Script Properties on a miss. After changing
// TRIP_KEY by hand, run showInvite() to drop the cached copy.
var TRIP_KEY_CACHE_S_ = 6 * 60 * 60;

function tripKey_() {
  var cache = CacheService.getScriptCache();
  var key = cache.get("TRIP_KEY");
  if (key) return key;
  key = getProp_("TRIP_KEY");
  if (key) cache.put("TRIP_KEY", key, TRIP_KEY_CACHE_S_);
  return key;
}

// Runs fn under the script lock. If the lock is not free within 8 seconds,
// returns the busy envelope instead (handle_ adds rev). Sheet writes are
// buffered: they are flushed before the lock is let go, so the next request
// never reads the Sheet without them.
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) {
    return { ok: false, error: "busy", message: "Someone else is saving right now. Try again in a moment." };
  }
  try {
    return fn();
  } finally {
    try {
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }
  }
}

// Runs fn under the planner lock, a different lock from withLock_'s (the
// script lock): the document lock of the Sheet this script is bound to (the
// user lock if it has none; the web app always runs as its deployer, so that
// is one lock too). The app's lock covers only the app's own Sheet; planner
// reads and writes happen under this one, never under both (R49). null when
// it cannot be had within 5 seconds: the planner write stays pending.
function withPlannerLock_(fn) {
  var lock = LockService.getDocumentLock() || LockService.getUserLock();
  if (!lock || !lock.tryLock(5000)) return null;
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// Milliseconds now, for timing retries (the connector's wait for the lock).
function clockMs_() {
  return Date.now();
}

function nowIso_() {
  return new Date().toISOString();
}

function sheetUrl_() {
  return SpreadsheetApp.getActiveSpreadsheet().getUrl();
}

// A new id for a stop or stay the connector adds: 20 letters and digits,
// starting with a letter (the backend's id rule).
function newId_() {
  return "m" + Utilities.getUuid().replace(/-/g, "").slice(0, 19);
}

// Today, "YYYY-MM-DD", in the trip's time zone (TRIP_TZ_ in Pure.js; the
// Trip tab's tz must agree with it).
function today_() {
  return Utilities.formatDate(new Date(), TRIP_TZ_, "yyyy-MM-dd");
}

// The token the Claude connector checks (Mcp.js), or null when there is none.
// Never logged, never written into the Sheet.
function claudeToken_() {
  return getProp_("CLAUDE_TOKEN") || null;
}

// Makes CLAUDE_TOKEN (32 hex characters) when it is missing; keeps one that
// is there. Run by setup() and the migrate action.
function ensureClaudeToken_() {
  if (claudeToken_()) return;
  setProp_("CLAUDE_TOKEN", Utilities.getUuid().replace(/-/g, ""));
}

// The planner sheet (R39, R45): Mo's own spreadsheet. The app reads it, and
// writes only what a "Before we go" tick needs (one Status cell, one Change
// Log row: Actions.js). Its id is kept only in PLANNER_ID: never logged,
// never in a reply.
function plannerId_() {
  return getProp_("PLANNER_ID") || null;
}

function setPlannerId_(id) {
  setProp_("PLANNER_ID", id);
}

// A tab's name as an A1 range prefix: 'Book Now'!
function plannerA1_(tab) {
  return "'" + String(tab).replace(/'/g, "''") + "'!";
}

// One range of the planner (tab: the tab it is on), through the Sheets
// advanced service: values unformatted, dates as the sheet shows them.
// null when the sheet opens but has no such tab; throws when it cannot read.
function plannerRange_(tab, range) {
  var id = plannerId_();
  try {
    var got = Sheets.Spreadsheets.Values.get(id, range, { valueRenderOption: "UNFORMATTED_VALUE", dateTimeRenderOption: "FORMATTED_STRING" });
    return (got && got.values) || [];
  } catch (e) {
    var info = Sheets.Spreadsheets.get(id, { fields: "sheets.properties.title" });
    var titles = ((info && info.sheets) || []).map(function (sh) { return sh && sh.properties ? sh.properties.title : ""; });
    if (titles.indexOf(tab) === -1) return null;
    throw e;
  }
}

// The planner's Payments tab, row 1 its column names.
function plannerRows_() {
  return plannerRange_("Payments", "Payments!A1:R");
}

// Another planner tab (Book Now, Change Log) from A1, so row i of what comes
// back is the sheet's row i + 1.
function plannerTab_(tab) {
  return plannerRange_(tab, plannerA1_(tab) + "A1:Z");
}

// Writes one cell ("E4") of a planner tab, as given (RAW: never a formula).
// Throws when it cannot (no permission yet, tab gone).
function plannerSetCell_(tab, cell, value) {
  Sheets.Spreadsheets.Values.update({ values: [[value]] }, plannerId_(), plannerA1_(tab) + cell, { valueInputOption: "RAW" });
}

// Whether the planner computes one cell (row is the sheet's row number, col a
// 0-based column), so the app must never write it: a formula entered in the
// cell, or a value with nothing entered (spilled there by an array formula
// placed elsewhere). An empty cell is not computed. -> true (computed) |
// false (plain) | null (unknown: the read failed, or came back in a shape
// not expected; write nothing and try again later).
function plannerCellComputed_(tab, row, col) {
  try {
    var got = Sheets.Spreadsheets.get(plannerId_(), { ranges: [plannerA1_(tab) + colLetter(col) + row], fields: "sheets.data.rowData.values(userEnteredValue,effectiveValue)" });
    var sheet = got && Array.isArray(got.sheets) ? got.sheets[0] : null;
    var data = sheet && Array.isArray(sheet.data) ? sheet.data[0] : null;
    if (!data || typeof data !== "object") return null;
    if (data.rowData === undefined) return false;
    if (!Array.isArray(data.rowData)) return null;
    var first = data.rowData[0];
    if (first === undefined || (first && first.values === undefined)) return false;
    if (!first || !Array.isArray(first.values)) return null;
    var cell = first.values[0];
    if (cell === undefined) return false;
    if (!cell || typeof cell !== "object") return null;
    if (cell.userEnteredValue) return cell.userEnteredValue.formulaValue !== undefined;
    return cell.effectiveValue !== undefined;
  } catch (e) {
    return null;
  }
}

// Appends one row (RAW) under the table whose header is on row headerRow,
// inserting a row for it. Throws when it cannot.
// firstCol (0-based) is the table's first column: Sheets writes an append from
// there, whatever the range starts at, so values must start at that column.
function plannerAppendRow_(tab, headerRow, firstCol, values) {
  var range = plannerA1_(tab) + colLetter(firstCol) + headerRow + ":" + colLetter(firstCol + values.length - 1) + headerRow;
  Sheets.Spreadsheets.Values.append({ values: [values] }, plannerId_(), range, { valueInputOption: "RAW", insertDataOption: "INSERT_ROWS" });
}

// Now in Toronto, as the planner's Change Log writes it: "YYYY-MM-DD HH:MM ET".
function torontoNow_() {
  return Utilities.formatDate(new Date(), "America/Toronto", "yyyy-MM-dd HH:mm") + " ET";
}
