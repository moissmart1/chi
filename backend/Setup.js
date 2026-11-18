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

// The planner sheet (R39, R46): run once from the script editor after
// linkPlanner, and again whenever the script asks for a new permission.
// Running it is how the owner grants the Sheets permission the pull and the
// "Before we go" write-back need. It logs how many payment rows and Book Now
// items there are, or what is wrong, and whether the Change Log is there:
// never a value from the sheet and never its id.
function checkPlanner() {
  // Google lets an owner grant only some of a script's permissions, and does
  // not ask again by itself when a new one is added. This asks for whatever
  // is still missing (the Sheets permission for the planner) and stops this
  // run; the next run then goes through.
  if (typeof ScriptApp !== "undefined" && ScriptApp.requireAllScopes) ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
  if (!plannerId_()) {
    Logger.log("Planner: not linked yet. Link it with linkPlanner first.");
    return;
  }
  checkPlannerPayments_();
  checkPlannerTodos_();
}

function checkPlannerPayments_() {
  var rows;
  try {
    rows = plannerRows_();
  } catch (e) {
    Logger.log("Planner: couldn’t read its Payments tab. Check the id and that this account can open the sheet.");
    return;
  }
  var read = paymentsFromRows(rows);
  if (read.missing) {
    Logger.log("Planner: " + read.missing);
    return;
  }
  var n = rows.slice(1).filter(function (r) { return !plannerBlank_(r); }).length;
  Logger.log("Planner: " + n + " payment rows, columns ok");
}

function checkPlannerTodos_() {
  try {
    // The year only fills in dates, which this does not show.
    var read = todosFromRows(plannerTab_("Book Now"), 2026);
    Logger.log("Book Now: " + (read.missing || read.items.length + " items, columns ok"));
    if (!read.missing) {
      // The app never writes over a formula: say how many Status cells are one
      // (or are filled by one placed elsewhere).
      var formulas = 0;
      try {
        read.items.forEach(function (it) {
          var computed = plannerCellComputed_("Book Now", it.row, it.statusCol);
          if (computed === null) throw new Error("unknown"); // a cell it could not tell: no count
          if (computed) formulas++;
        });
        Logger.log("Book Now: " + formulas + " Status cells are formulas (the app leaves those alone).");
      } catch (e2) {
        Logger.log("Book Now: couldn’t check its Status cells for formulas.");
      }
    }
  } catch (e) {
    Logger.log("Book Now: couldn’t read it.");
  }
  try {
    Logger.log("Change Log: " + (changeLogRow(plannerTab_("Change Log"), {}) ? "found" : "not found"));
  } catch (e) {
    Logger.log("Change Log: couldn’t read it.");
  }
}
