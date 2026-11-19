// The outside-world primitives Actions.js uses besides the Sheet helpers.
// Apps Script only; tests/fake-backend.cjs supplies in-memory versions.

function getProp_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

function setProp_(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, String(value));
}

function delProp_(key) {
  PropertiesService.getScriptProperties().deleteProperty(key);
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

// Forgets the cached shared key, so a change to TRIP_KEY (or its deletion by
// retireSharedLink) takes effect at once.
function forgetTripKey_() {
  CacheService.getScriptCache().remove("TRIP_KEY");
}

// SHA-256 of a text (UTF-8), as 64 lower-case hex characters (personal keys:
// Keys.js). No new permission: Utilities needs none.
function sha256Hex_(text) {
  return hexOfBytes(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text), Utilities.Charset.UTF_8));
}

// A new personal key: two UUIDs without their dashes, 64 hex characters.
function newPersonKey_() {
  return Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
}

// A JSON body POSTed to an address (mailLinks, Setup.js: the mail desk), and
// its JSON answer; null when there is no usable answer. An Apps Script web app
// answers a POST with a redirect to its output, fetched as a GET
// (followRedirects). Nothing here is logged: the body holds a link.
function postJson_(url, body) {
  try {
    var res = UrlFetchApp.fetch(url, { method: "post", contentType: "application/json", payload: JSON.stringify(body),
      muteHttpExceptions: true, followRedirects: true });
    if (res.getResponseCode() !== 200) return null;
    return JSON.parse(res.getContentText());
  } catch (e) {
    return null;
  }
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

// Runs fn under the user lock, so two of the owner's mailLinks runs never
// overlap (Setup.js). It is not the script lock (withLock_) that phones use:
// holding it for a whole run never makes a phone wait. True when fn ran,
// false when another run holds it.
function withOwnerRunLock_(fn) {
  var lock = LockService.getUserLock();
  if (!lock.tryLock(1000)) return false;
  try {
    fn();
    return true;
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
