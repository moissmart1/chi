// One-time setup, run by hand from the script editor. Safe to run twice.
// The trip key goes only to Script Properties (and, from showInvite, to the
// execution log). It is never returned and never written into the Sheet.

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(TABS).forEach(function (tab) {
    var sh = ss.getSheetByName(tab) || ss.insertSheet(tab);
    var wanted = TABS[tab];
    var have = sh.getLastColumn() === 0 ? [] : headersOf_(sh);
    wanted.forEach(function (h) {
      if (have.indexOf(h) === -1) {
        sh.getRange(1, have.length + 1).setValue(h);
        have.push(h);
      }
    });
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, have.length).setFontWeight("bold");
    have.forEach(function (h, i) {
      if (isTextColumn(tab, h)) sh.getRange(1, i + 1, sh.getMaxRows(), 1).setNumberFormat("@");
    });
  });

  var seed = setupSeedRows();
  seedIfEmpty_("Trip", seed.Trip);
  seedIfEmpty_("People", seed.People);
  seedIfEmpty_("Days", seed.Days);
  // A Trip tab typed for another trip is said now, not found later by the app.
  var wrong = tripMismatch(tripInfo_());
  if (wrong) throw new Error(wrong);

  var plain = ss.getSheetByName("Sheet1");
  if (plain && plain.getLastRow() === 0 && plain.getLastColumn() === 0 && ss.getSheets().length > 1) ss.deleteSheet(plain);

  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty("TRIP_KEY")) props.setProperty("TRIP_KEY", Utilities.getUuid().replace(/-/g, "").slice(0, 24));
  // The Claude connector's token. Not shown here: the app's Settings copies it.
  ensureClaudeToken_();

  // Last, so the tabs are there either way: a rate host that refuses Google's
  // servers must show up now, not as a silent stand-in rate on every line.
  requireLiveRate_();
}

function seedIfEmpty_(tab, objs) {
  var sh = sheet_(tab);
  if (sh.getLastRow() >= 2) return;
  var headers = headersOf_(sh);
  var rows = objs.map(function (o) { return objToRow(headers, o); });
  sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
}

function showInvite() {
  // The key is cached for six hours (tripKey_ in Env.js): forget the cached
  // copy so a key changed by hand in Script Properties takes effect now.
  CacheService.getScriptCache().remove("TRIP_KEY");
  var key = PropertiesService.getScriptProperties().getProperty("TRIP_KEY");
  Logger.log(key ? "Trip key: " + key : "No trip key yet. Run setup() first.");
}
