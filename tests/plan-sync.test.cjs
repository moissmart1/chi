// The plan, led by the planner's Plan tab (chi#16). Pure helpers from
// Pure.js; the pull, its guards and the dry run through the fake backend (the
// real Actions.js and Mcp.js) and its fake planner, which records every read
// and write it receives. Every value here is made up: stops, ids, booking
// numbers, names and the sheet id.
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../backend/Pure.js");

// The trip's days, as the seed's Days tab has them.
const DAYS = ["2026-12-26", "2026-12-27", "2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01"];

// ---------- the Plan tab, as Sheets hands it back ----------

const HEAD = ["stop_id", "date", "time", "what", "booked", "fixed", "notes"];
const prow = (o) => HEAD.map((h) => (o[h] === undefined ? "" : o[h]));
const MUSEUM = { stop_id: "teststop0001", date: "2026-12-28", time: "10:00", what: "Corner museum", booked: "yes", fixed: "" };
const PIER = { stop_id: "teststop0002", date: "2026-12-29", time: "", what: "Pier stop", booked: "", fixed: "" };
const SHOW = { stop_id: "teststop0003", date: "2026-12-30", time: "19:30", what: "Late show", booked: "Booked (email)", fixed: "TRUE" };

// ---------- planDay ----------

test("planDay reads ISO text, month-name text with or without a year, and a serial day; a day not on the calendar is none", () => {
  assert.equal(P.planDay("2026-12-28", DAYS), "2026-12-28");
  assert.equal(P.planDay(" 2026-12-28 ", DAYS), "2026-12-28");
  assert.equal(P.planDay("2026-11-02", DAYS), "2026-11-02", "a real day off the trip is itself: validateStop judges it");
  assert.equal(P.planDay("Dec 29", DAYS), "2026-12-29");
  assert.equal(P.planDay("29 Dec", DAYS), "2026-12-29");
  assert.equal(P.planDay("29 Dec 2026", DAYS), "2026-12-29");
  assert.equal(P.planDay("Jan 1", DAYS), "2027-01-01", "a trip that crosses the year: the January of its second year");
  assert.equal(P.planDay("Mar 3", DAYS), "2026-03-03", "on no trip day: the first answer");
  assert.equal(P.planDay(46385, DAYS), "2026-12-29", "Sheets' day 46385");
  assert.equal(P.planDay("Feb 30", DAYS), "");
  for (const bad of ["", "soon", "2026-02-30", "12/29", null, undefined, true]) assert.equal(P.planDay(bad, DAYS), "", String(bad));
});

// ---------- planTime ----------

test("planTime reads 24-hour and am/pm text and a time cell; blank is no time; anything else is not ok", () => {
  const ok = (v, want) => assert.deepEqual(P.planTime(v), { ok: true, value: want }, String(v));
  ok("", "");
  ok("  ", "");
  ok(null, "");
  ok(undefined, "");
  ok("19:00", "19:00");
  ok("7:00", "07:00");
  ok("07:05", "07:05");
  ok(" 9:30 ", "09:30");
  ok("19:00:00", "19:00");
  ok("7:00 PM", "19:00");
  ok("7:00pm", "19:00");
  ok("7:00 p.m.", "19:00");
  ok("7:00 P.M", "19:00");
  ok("12:15 am", "00:15");
  ok("12:00 pm", "12:00");
  ok("11:59 AM", "11:59");
  ok(0.5, "12:00");
  ok(0, "00:00");
  for (const bad of ["24:00", "7 PM", "7pm", "0:30 am", "13:00 pm", "9:5", "9:60", "nine", "19:00x", 1, 1.5, -0.1, true]) {
    assert.deepEqual(P.planTime(bad), { ok: false }, String(bad));
  }
});

// ---------- planYes ----------

test("planYes: yes, a ticked box, y, x and a tick mark are yes; Booked text only for booked", () => {
  for (const v of ["yes", "YES", " Yes ", true, "TRUE", "true", "x", "X", "y", "✓"]) {
    assert.equal(P.planYes(v, false), true, String(v));
    assert.equal(P.planYes(v, true), true, String(v));
  }
  assert.equal(P.planYes("Booked (email)", true), true);
  assert.equal(P.planYes("booked", true), true);
  assert.equal(P.planYes("Booked", false), false, "Booked is not yes for fixed");
  for (const v of ["no", "pending", "", "   ", false, "FALSE", null, undefined, "Not booked", 0]) {
    assert.equal(P.planYes(v, true), false, String(v));
    assert.equal(P.planYes(v, false), false, String(v));
  }
});

// ---------- planFromRows ----------

test("planFromRows: the header on row 1; each stop with its own row number; booked and fixed read", () => {
  const r = P.planFromRows([HEAD, prow(MUSEUM), prow(PIER), prow(SHOW)], DAYS);
  assert.equal(r.missing, null);
  assert.deepEqual(r.problems, []);
  assert.equal(r.capped, false);
  assert.equal(r.blind, false);
  assert.deepEqual(r.stops, [
    { id: "teststop0001", row: 2, date: "2026-12-28", time: "10:00", timeOk: true, title: "Corner museum", booked: true, fixed: false },
    { id: "teststop0002", row: 3, date: "2026-12-29", time: "", timeOk: true, title: "Pier stop", booked: false, fixed: false },
    { id: "teststop0003", row: 4, date: "2026-12-30", time: "19:30", timeOk: true, title: "Late show", booked: true, fixed: true },
  ]);
});

test("planFromRows: the header on row 3 under a title, columns in another order and any case; a blank row does not end the table; a heading line is skipped silently", () => {
  const head = ["What", "Notes", "Time", " STOP_ID ", "Date"];
  const row = (o) => [o.what, "", o.time, o.stop_id, o.date];
  const rows = [["Our plan"], [], head, ["", "", "", "", ""], ["Tue Dec 29", "", "", "", ""], row(MUSEUM), [], [], row({ ...PIER, date: "Dec 29" }), head, row(SHOW)];
  const r = P.planFromRows(rows, DAYS);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.stops.map((s) => [s.id, s.row, s.date, s.time, s.title, s.booked, s.fixed]), [
    ["teststop0001", 6, "2026-12-28", "10:00", "Corner museum", false, false],
    ["teststop0002", 9, "2026-12-29", "", "Pier stop", false, false],
    ["teststop0003", 11, "2026-12-30", "19:30", "Late show", false, false],
  ], "no booked or fixed column reads as no; the header again is skipped");
  assert.equal(r.blind, false);
});

test("planFromRows: no id, an unusable id and an id twice (the first stands), each with its row number, make the read blind", () => {
  const rows = [HEAD, prow(MUSEUM), prow({ ...PIER, stop_id: "" }), prow({ ...PIER, stop_id: "short" }), prow({ ...SHOW, stop_id: "teststop0001", what: "Corner museum again" }), prow(SHOW)];
  const r = P.planFromRows(rows, DAYS);
  assert.deepEqual(r.problems, [
    { id: "", message: "That row has no id, so it wasn’t brought in.", row: 3, what: "Pier stop" },
    { id: "", message: "That row’s id isn’t usable.", row: 4, what: "Pier stop" },
    { id: "teststop0001", message: "That id is in the Plan tab twice.", row: 5, what: "Corner museum again" },
  ]);
  assert.deepEqual(r.stops.map((s) => [s.id, s.title]), [["teststop0001", "Corner museum"], ["teststop0003", "Late show"]]);
  assert.equal(r.blind, true);
  assert.equal(P.planFromRows([HEAD, prow({ ...PIER, stop_id: "" })], DAYS).blind, true);
});

test("planFromRows: a bad time is kept as not ok; the name is not cut; what is", () => {
  const long = "A very long name for a made-up stop that goes on and on past the sixty letters";
  const r = P.planFromRows([HEAD, prow({ ...MUSEUM, time: "7 PM", what: long })], DAYS);
  assert.deepEqual([r.stops[0].time, r.stops[0].timeOk, r.stops[0].title], ["", false, long]);
  assert.equal(r.blind, false, "a bad time is not a blind read");
});

test("planFromRows: 201 rows are cut at 200, capped and blind; no tab and no header are missing", () => {
  const rows = [HEAD];
  for (let i = 1; i <= 201; i++) rows.push(prow({ ...PIER, stop_id: "teststop" + String(i).padStart(4, "0") }));
  const r = P.planFromRows(rows, DAYS);
  assert.equal(r.stops.length, 200);
  assert.deepEqual([r.capped, r.blind], [true, true]);
  const exact = P.planFromRows(rows.slice(0, 201), DAYS);
  assert.deepEqual([exact.stops.length, exact.capped, exact.blind], [200, false, false]);
  assert.equal(P.planFromRows(null, DAYS).missing, "The planner has no Plan tab to read.");
  assert.equal(P.planFromRows([], DAYS).missing, "The planner has no Plan tab to read.");
  assert.equal(P.planFromRows([["stop_id", "date", "what"], prow(MUSEUM)], DAYS).missing, "The planner’s Plan tab has no row with the columns stop_id, date, time and what.");
});

// ---------- planJobs ----------

// A Stops row as the app's Sheet holds it, read back as stopFromRow does.
const STOP = { id: "teststop0001", date: "2026-12-28", time: "10:00", title: "Corner museum", detail: "Our own line", gettingThere: "", travelMin: 0, fixed: false, place: "Somewhere made up", signJp: "", booked: true, link: "", photo: "", note: "a note", lat: "", lng: "", tkRef: "", tkName: "", tkPeople: "", tkSeat: "" };
function cur(stop, { led = true, tkLed = false, deleted = false, movedFrom = "" } = {}) {
  const row = { ...P.stopToRow({ ...STOP, ...stop }), deleted_at: deleted ? "2026-12-01T00:00:00.000Z" : "", planner: led ? "yes" : "", tk_planner: tkLed ? "yes" : "", moved_from: movedFrom };
  const s = P.stopFromRow(row);
  return { stop: s, led: s.fromPlanner, tkLed: s.tkFromPlanner };
}
const NOTIX = { linked: false, byStop: {}, problems: [] };
const jobs = (rows, current, appStops = true) => P.planJobs(P.planFromRows([HEAD, ...rows.map(prow)], DAYS), NOTIX, current, DAYS, appStops);
const PIER_STOP = { id: "teststop0002", date: "2026-12-29", time: "", title: "Pier stop", booked: false };

test("planJobs: a new row is an add with the planner's five facts only", () => {
  const j = jobs([MUSEUM, PIER], [cur({})]);
  assert.equal(j.adds.length, 1);
  assert.deepEqual(j.adds[0].id, "teststop0002");
  assert.deepEqual([j.adds[0].row, j.adds[0].what], [3, "Pier stop"]);
  const v = j.adds[0].value;
  assert.deepEqual([v.date, v.time, v.title, v.booked, v.fixed, v.detail, v.place, v.gettingThere, v.photo], ["2026-12-29", "", "Pier stop", false, false, "", "", "", ""]);
  assert.deepEqual([j.edits, j.removals, j.same, j.held], [[], [], 1, 0]);
});

test("planJobs: a changed row writes only the changed columns; an unchanged one is same", () => {
  const j = jobs([{ ...MUSEUM, time: "11:15", what: "Corner museum " }], [cur({})]);
  assert.deepEqual(j.edits, [{ id: "teststop0001", row: 2, what: "Corner museum", cols: { time: "11:15" }, action: "edit", next: { date: "2026-12-28", time: "11:15", title: "Corner museum", booked: true, fixed: false } }]);
  assert.equal(jobs([MUSEUM], [cur({ time: "10:00" })]).same, 1);
  assert.equal(jobs([{ ...MUSEUM, time: "10:00 am" }], [cur({})]).same, 1, "10:00 am is the same time");
});

test("planJobs: adoption marks the planner column only; with a difference it is an edit", () => {
  const adopt = jobs([MUSEUM], [cur({}, { led: false })]);
  assert.deepEqual(adopt.edits.map((e) => [e.action, e.cols]), [["adopt", { planner: "yes" }]]);
  const differ = jobs([{ ...MUSEUM, booked: "" }], [cur({}, { led: false })]);
  assert.deepEqual(differ.edits.map((e) => [e.action, e.cols]), [["edit", { booked: false, planner: "yes" }]]);
});

test("planJobs: a row for a deleted stop puts it back", () => {
  const j = jobs([MUSEUM], [cur({}, { deleted: true, led: false })]);
  assert.deepEqual(j.edits.map((e) => [e.action, e.cols]), [["restore", { planner: "yes", deleted_at: "" }]]);
});

test("planJobs: a move to another day sets moved_from only when the stop has directions; moving back clears it; a time change does not", () => {
  const bare = jobs([{ ...MUSEUM, date: "2026-12-30" }], [cur({})]);
  assert.deepEqual(bare.edits[0].cols, { date: "2026-12-30" });
  const walked = jobs([{ ...MUSEUM, date: "2026-12-30" }], [cur({ gettingThere: "Walk north" })]);
  assert.deepEqual(walked.edits[0].cols, { date: "2026-12-30", moved_from: "2026-12-28" });
  const timed = jobs([{ ...MUSEUM, date: "2026-12-30" }], [cur({ travelMin: 12 })]);
  assert.deepEqual(timed.edits[0].cols, { date: "2026-12-30", moved_from: "2026-12-28" });
  const again = jobs([{ ...MUSEUM, date: "2026-12-31" }], [cur({ date: "2026-12-30", gettingThere: "Walk north" }, { movedFrom: "2026-12-28" })]);
  assert.deepEqual(again.edits[0].cols, { date: "2026-12-31" }, "the first day it came from stays");
  const back = jobs([MUSEUM], [cur({ date: "2026-12-30", gettingThere: "Walk north" }, { movedFrom: "2026-12-28" })]);
  assert.deepEqual(back.edits[0].cols, { date: "2026-12-28", moved_from: "" });
  const time = jobs([{ ...MUSEUM, time: "15:00" }], [cur({ gettingThere: "Walk north" })]);
  assert.deepEqual(time.edits[0].cols, { time: "15:00" });
});

test("planJobs: a bad row for a stop the app has leaves it as it was and is not a removal", () => {
  const j = jobs([{ ...MUSEUM, time: "7 PM" }, { ...PIER, date: "2027-02-01" }, { ...SHOW, what: "" }], [cur({}), cur(PIER_STOP), cur({ id: "teststop0003", date: "2026-12-30", title: "Late show" })]);
  assert.deepEqual(j.problems, [
    { id: "teststop0001", message: "Use a time like 14:30. Left as it was.", row: 2, what: "Corner museum" },
    { id: "teststop0002", message: "Pick a day of the trip. Left as it was.", row: 3, what: "Pier stop" },
    { id: "teststop0003", message: "Say what it is. Left as it was.", row: 4, what: "" },
  ]);
  assert.deepEqual([j.edits, j.removals, j.adds, j.held], [[], [], [], 0]);
  const fresh = jobs([{ ...PIER, what: "x".repeat(81) }], []);
  assert.deepEqual(fresh.problems.map((p) => p.message), ["Keep the name under 80 letters."]);
  assert.deepEqual(fresh.adds, []);
});

test("planJobs: a stop the planner no longer lists is taken off; one only in the app stays and is listed", () => {
  const current = [cur({}), cur(PIER_STOP), cur({ id: "teststop0003", date: "2026-12-30", title: "Late show" }), cur({ id: "teststop0004", title: "Our own extra" }, { led: false })];
  const j = jobs([MUSEUM, SHOW], current);
  assert.deepEqual(j.removals, [{ id: "teststop0002", what: "Pier stop" }]);
  assert.deepEqual(j.onlyInApp, [{ id: "teststop0004", date: "2026-12-28", time: "10:00", title: "Our own extra" }]);
  assert.equal(j.held, 0);
});

test("planJobs: a blind read takes nothing off and says how many it held", () => {
  const current = [cur({}), cur(PIER_STOP)];
  const j = P.planJobs(P.planFromRows([HEAD, prow(MUSEUM), prow({ ...SHOW, stop_id: "" })], DAYS), NOTIX, current, DAYS, true);
  assert.deepEqual(j.removals, []);
  assert.equal(j.held, 1);
  assert.deepEqual(j.problems.at(-1), { id: "", message: "1 stop is not in the Plan tab, and a row there has no usable id. Nothing was taken off: fix that row first.", row: null, what: "" });
  const two = P.planJobs(P.planFromRows([HEAD, prow({ ...SHOW, stop_id: "" })], DAYS), NOTIX, current, DAYS, true);
  assert.equal(two.problems.at(-1).message, "2 stops are not in the Plan tab, and a row there has no usable id. Nothing was taken off: fix that row first.");
});

test("planJobs: nine removals at once are held; so is more than half of the planner's stops", () => {
  const many = [];
  for (let i = 1; i <= 20; i++) many.push(cur({ id: "teststop" + String(i).padStart(4, "0"), title: "Stop " + i }));
  const keep = many.slice(9).map((c) => ({ ...MUSEUM, stop_id: c.stop.id, what: c.stop.title }));
  const nine = jobs(keep, many);
  assert.deepEqual([nine.removals, nine.held], [[], 9]);
  assert.equal(nine.problems.at(-1).message, "The Plan tab no longer lists 9 stops. That is too many to take off at once, so none were. If it’s meant, take them off a few at a time.");
  const eight = jobs(many.slice(8).map((c) => ({ ...MUSEUM, stop_id: c.stop.id, what: c.stop.title })), many);
  assert.deepEqual([eight.removals.length, eight.held], [8, 0]);
  // Four planner stops (and app stops that do not count); three would go.
  const few = [cur({}), cur(PIER_STOP), cur({ id: "teststop0003" }), cur({ id: "teststop0005" }), cur({ id: "teststop0006" }, { led: false }), cur({ id: "teststop0007" }, { led: false })];
  const half = jobs([MUSEUM], few);
  assert.deepEqual([half.removals, half.held], [[], 3]);
  const twoOfFour = jobs([MUSEUM, PIER], few);
  assert.deepEqual([twoOfFour.removals.length, twoOfFour.held], [2, 0], "exactly half may go");
});

test("planJobs with no app stops of their own (option C): an unlisted app stop is taken off and nothing is only in the app", () => {
  const current = [cur({}), cur({ id: "teststop0004", title: "Our own extra" }, { led: false }), cur(PIER_STOP), cur({ id: "teststop0003" })];
  const c = jobs([MUSEUM, PIER, SHOW], current, false);
  assert.deepEqual(c.removals, [{ id: "teststop0004", what: "Our own extra" }]);
  assert.deepEqual(c.onlyInApp, []);
  const a = jobs([MUSEUM, PIER, SHOW], current, true);
  assert.deepEqual(a.removals, []);
  assert.deepEqual(a.onlyInApp.map((x) => x.id), ["teststop0004"]);
});

test("a stop's fromPlanner, tkFromPlanner and movedFrom are read from their cells, never written by stopToRow and never kept in the Log", () => {
  const s = P.stopFromRow({ ...P.stopToRow(STOP), planner: "yes", tk_planner: "yes", moved_from: "2026-12-27" });
  assert.deepEqual([s.fromPlanner, s.tkFromPlanner, s.movedFrom], [true, true, "2026-12-27"]);
  const row = P.stopToRow(s);
  for (const k of ["planner", "tk_planner", "moved_from", "fromPlanner", "tkFromPlanner", "movedFrom"]) assert.equal(k in row, false, k);
  const v = P.validateStop({ ...STOP, fromPlanner: true, movedFrom: "2026-12-27" }, DAYS).value;
  assert.equal("fromPlanner" in v || "movedFrom" in v, false);
  const snap = P.logSnap_("stop", s);
  for (const k of ["fromPlanner", "tkFromPlanner", "movedFrom"]) assert.equal(k in snap, false, k);
  assert.equal(snap.title, "Corner museum");
  assert.equal(P.logSnap_("stay", s), s, "other kinds as they were");
});

test("canUndo: a stop change from the planner can't be undone; the app's own can", () => {
  const e = { id: 4, kind: "stop", ref: "teststop0001", action: "edit", undoneBy: null };
  assert.equal(P.canUndo({ ...e, via: "planner" }, []), false);
  assert.equal(P.canUndo({ ...e, via: "app" }, []), true);
  assert.equal(P.canUndo({ ...e, kind: "expense", via: "planner" }, []), true, "a payment's line still can");
});
