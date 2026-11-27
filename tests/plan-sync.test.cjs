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

// ---------- the pull, through the fake backend ----------

const { createFakeBackend, CHECK_KEY } = require("./fake-backend.cjs");
const KEY = "test-key";
const PLANNER_ID = "fakePlannerSheet_0123456789abcdefXYZ";
// A stop with every column the app owns filled in.
const FULL = { id: "teststop0001", date: "2026-12-28", time: "10:00", title: "Corner museum", detail: "Our own line", gettingThere: "Walk two blocks west", travelMin: 9, fixed: false, place: "https://maps.example.test/place/x", signJp: "Made-up sign", booked: true, link: "https://book.example.test/a", photo: "https://img.example.test/a.jpg", note: "Our note", lat: "41.88", lng: "-87.63", tkRef: "ZZ00001", tkName: "Sam Example", tkPeople: "Mo, Izzah", tkSeat: "Row C" };
const APP_PIER = { id: "teststop0002", date: "2026-12-29", time: "", title: "Pier stop", booked: false };
const APP_SHOW = { id: "teststop0003", date: "2026-12-30", time: "19:30", title: "Late show", booked: true, fixed: true };

// A fake whose clock can be moved (at.now), following the planner unless follow is false.
function linked({ stops = [FULL, APP_PIER, APP_SHOW], plan = [HEAD, prow(MUSEUM), prow(PIER), prow(SHOW)], tickets, follow = true, over = {} } = {}) {
  const at = { now: "2026-12-20T15:00:00.000Z" };
  const plannerTabs = { Plan: plan };
  if (tickets) plannerTabs.Tickets = tickets;
  const fake = createFakeBackend({ plannerId: PLANNER_ID, plannerTabs, stops, props: follow ? { PLAN_FOLLOW: "on" } : {}, ...over }, { clock: () => at.now });
  const call = (action, args = {}, actor = "Mo") => fake({ key: KEY, actor, action, args });
  call.fake = fake;
  call.at = at;
  return call;
}
const later = (call, seconds) => { call.at.now = new Date(Date.parse(call.at.now) + seconds * 1000).toISOString(); };
const stored = (call, id) => call.fake.tables.Stops.find((r) => r.id === id);
const planOf = (call) => call.fake.planner.tabs.Plan;
const setPlan = (call, ...rows) => { call.fake.planner.tabs.Plan = [HEAD, ...rows.map(prow)]; };
const planReads = (call) => call.fake.planner.calls.filter((c) => c.op === "read").length;
const logRows = (call) => call.fake.tables.Log;
const loadStops = async (call) => (await call("load")).data.stops;
const counts = (d) => [d.added, d.changed, d.removed, d.restored, d.adopted, d.same];
// Every scenario ends here: the planner received no write, and was never read under the app's lock.
function clean(call) {
  assert.deepEqual(call.fake.planner.writes, [], "nothing was written to the planner");
  assert.equal(call.fake.planner.calls.some((c) => c.op !== "read"), false, "only reads reached the planner");
  assert.equal(call.fake.planner.calls.some((c) => c.appLock), false, "never read under the app's lock (R49)");
}
// The columns of a Stops row a pull may never change.
const PULL_COLS = ["date", "time", "title", "booked", "fixed", "deleted_at", "planner", "tk_planner", "moved_from", "tk_ref", "tk_name", "tk_people", "tk_seat"];
const others = (row) => Object.fromEntries(Object.entries(row).filter(([k]) => !PULL_COLS.includes(k)));

test("off is off: with PLAN_FOLLOW unset syncPlan answers off and reads nothing; load says not following and no stop is the planner's", async () => {
  const call = linked({ follow: false, stops: [{ ...FULL, fromPlanner: true, tkFromPlanner: true, movedFrom: "2026-12-27" }, APP_PIER] });
  const r = await call("syncPlan", {});
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.data, { added: 0, changed: 0, removed: 0, restored: 0, adopted: 0, same: 0, problems: [], more: false, pulledAt: "", off: true, skipped: true });
  assert.equal((await call("syncPlan", { auto: true })).data.off, true);
  assert.equal(planReads(call), 0, "no planner read at all");
  const l = (await call("load")).data;
  assert.deepEqual([l.planFollow, l.planPulledAt, l.planProblems], [false, "", { at: "", list: [], more: 0 }]);
  assert.ok(l.stops.every((s) => s.fromPlanner === false && s.tkFromPlanner === false && s.movedFrom === ""));
  // The stop whose planner cell says yes is edited, removed and undone as today.
  const e = await call("updateStop", { id: FULL.id, patch: { time: "12:00", title: "Renamed here", tkRef: "ZZ00002" } });
  assert.equal(e.ok, true, JSON.stringify(e));
  assert.equal((await call("undo", { logId: e.data.logId })).ok, true);
  assert.equal(stored(call, FULL.id).title, "Corner museum");
  const d = await call("deleteStop", { id: FULL.id });
  assert.equal(d.ok, true);
  assert.equal((await call("undo", { logId: d.data.logId })).ok, true);
  assert.equal(stored(call, FULL.id).deleted_at, "");
  // With no planner linked at all: as for payments.
  const none = linked({ follow: false, over: { plannerId: undefined } });
  assert.equal((await none("syncPlan", {})).error, "no_planner");
  clean(call);
});

test("bad input and an old Sheet: auto must be a boolean; no moved_from column says migrate", async () => {
  const call = linked();
  assert.equal((await call("syncPlan", { auto: "yes" })).error, "bad_input");
  const old = linked({ over: { missingColumns: ["Stops.planner", "Stops.tk_planner", "Stops.moved_from"] } });
  const r = await old("syncPlan", {});
  assert.deepEqual([r.ok, r.error], [false, "needs_migrate"]);
  assert.equal(planReads(old), 0);
  clean(call);
});

test("the first sync: 20 stops the Plan tab already lists are adopted 15 then 5, with no History line, and only the planner column written", async () => {
  const stops = [];
  for (let i = 1; i <= 20; i++) stops.push({ ...FULL, id: "teststop" + String(i).padStart(4, "0"), title: "Stop " + i });
  const plan = [HEAD, ...stops.map((s) => prow({ stop_id: s.id, date: s.date, time: s.time, what: s.title, booked: "yes" }))];
  const call = linked({ stops, plan });
  const before = JSON.parse(JSON.stringify(call.fake.tables.Stops));
  const logged = logRows(call).length;
  const rev = (await call("rev")).rev;
  const one = await call("syncPlan", { auto: true });
  assert.equal(one.ok, true, JSON.stringify(one));
  assert.deepEqual([...counts(one.data), one.data.more], [0, 0, 0, 0, 15, 0, true]);
  assert.equal(one.data.pulledAt, "", "not done while more remain");
  assert.equal(one.rev, rev + 1, "rev moves once");
  assert.equal((await call("load")).data.planPulledAt, "");
  const two = await call("syncPlan", { auto: true });
  assert.deepEqual([...counts(two.data), two.data.more], [0, 0, 0, 0, 5, 15, false]);
  assert.equal(two.data.pulledAt, call.at.now);
  later(call, 20);
  const three = await call("syncPlan", {});
  assert.deepEqual([...counts(three.data), three.data.more], [0, 0, 0, 0, 0, 20, false]);
  assert.equal(logRows(call).length, logged, "no History line for an adoption");
  call.fake.tables.Stops.forEach((row, i) => {
    assert.deepEqual({ ...row, planner: "" }, { ...before[i], planner: "" }, "nothing but the planner column");
    assert.equal(row.planner, "yes");
  });
  assert.ok((await loadStops(call)).every((s) => s.fromPlanner === true));
  clean(call);
});

test("each kind of change lands once, logged via the planner in the first person's name; rev moves once a pull; the app's own columns never change", async () => {
  const call = linked();
  const full = others(stored(call, FULL.id));
  const first = await call("syncPlan", {}, "Izzah");
  assert.deepEqual(counts(first.data), [0, 0, 0, 0, 3, 0]);
  const steps = [
    ["change", [{ ...MUSEUM, time: "11:30", what: "Corner museum, east wing" }, PIER, SHOW], [0, 1, 0, 0, 0, 2], "edit", "renamed Corner museum to Corner museum, east wing"],
    ["move", [{ ...MUSEUM, date: "2026-12-31", time: "11:30", what: "Corner museum, east wing" }, PIER, SHOW], [0, 1, 0, 0, 0, 2], "edit", "moved Corner museum, east wing to Thu Dec 31 11:30"],
    ["add", [{ ...MUSEUM, date: "2026-12-31", time: "11:30", what: "Corner museum, east wing" }, PIER, SHOW, { stop_id: "teststop0009", date: "Dec 27", time: "9:00 am", what: "Breakfast counter" }], [1, 0, 0, 0, 0, 3], "add", "added Breakfast counter to Sun Dec 27"],
    ["removal", [PIER, SHOW, { stop_id: "teststop0009", date: "Dec 27", time: "9:00 am", what: "Breakfast counter" }], [0, 0, 1, 0, 0, 3], "delete", "removed Corner museum, east wing from Thu Dec 31"],
    ["return", [{ ...MUSEUM, date: "2026-12-31", time: "11:30", what: "Corner museum, east wing" }, PIER, SHOW, { stop_id: "teststop0009", date: "Dec 27", time: "9:00 am", what: "Breakfast counter" }], [0, 0, 0, 1, 0, 3], "restore", "put back Corner museum, east wing on Thu Dec 31"],
  ];
  for (const [name, rows, want, action, summary] of steps) {
    later(call, 20);
    setPlan(call, ...rows);
    const rev = (await call("rev")).rev;
    const logged = logRows(call).length;
    const r = await call("syncPlan", {}, "Izzah");
    assert.equal(r.ok, true, name + JSON.stringify(r));
    assert.deepEqual(counts(r.data), want, name);
    assert.equal(r.rev, rev + 1, name + ": rev moves once");
    const lines = logRows(call).slice(logged);
    assert.deepEqual(lines.map((l) => [l.who, l.via, l.action, l.kind, l.summary]), [["Mo", "planner", action, "stop", summary]], name);
    assert.deepEqual(others(stored(call, FULL.id)), full, name + ": the app's own columns are byte-identical");
    // The same read again changes nothing.
    later(call, 20);
    assert.deepEqual(counts((await call("syncPlan", {})).data).slice(0, 5), [0, 0, 0, 0, 0], name + " twice");
  }
  const museum = (await loadStops(call)).find((s) => s.id === FULL.id);
  assert.deepEqual([museum.date, museum.time, museum.title, museum.deleted, museum.fromPlanner, museum.movedFrom], ["2026-12-31", "11:30", "Corner museum, east wing", false, true, "2026-12-28"]);
  const added = (await loadStops(call)).find((s) => s.id === "teststop0009");
  assert.deepEqual([added.date, added.time, added.title, added.fromPlanner, added.detail, added.photo], ["2026-12-27", "09:00", "Breakfast counter", true, "", ""]);
  // History: each planner line says so and has no Undo.
  const hist = (await call("history")).data.entries.filter((e) => e.via === "planner");
  assert.equal(hist.length, 5);
  assert.ok(hist.every((e) => e.canUndo === false));
  clean(call);
});

test("unreadable: a Plan read that throws changes nothing and never says the planner's id; no tab or no header says which", async () => {
  const call = linked();
  call.fake.planner.fails = true;
  const props = JSON.stringify(call.fake.props);
  const stops = JSON.stringify(call.fake.tables.Stops);
  for (const args of [{}, { auto: true }]) {
    const r = await call("syncPlan", args);
    assert.deepEqual([r.ok, r.error, r.message], [false, "planner_unreadable", "Couldn’t read the planner sheet. Ask Mo to check its permission."]);
    assert.equal(JSON.stringify(r).includes(PLANNER_ID), false);
  }
  assert.equal(JSON.stringify(call.fake.props), props, "no property changed");
  assert.equal(JSON.stringify(call.fake.tables.Stops), stops, "no stop changed");
  assert.equal(JSON.stringify(await call("load")).includes(PLANNER_ID), false);
  call.fake.planner.fails = false;
  delete call.fake.planner.tabs.Plan;
  assert.deepEqual(await call("syncPlan", {}).then((r) => [r.error, r.message]), ["planner_columns", "The planner has no Plan tab to read."]);
  call.fake.planner.tabs.Plan = [["stop_id", "date", "what"], prow(MUSEUM)];
  assert.deepEqual(await call("syncPlan", {}).then((r) => [r.error, r.message]), ["planner_columns", "The planner’s Plan tab has no row with the columns stop_id, date, time and what."]);
  assert.equal(JSON.stringify(call.fake.tables.Stops), stops);
  clean(call);
});

test("the gap: an auto ask within a minute of the last pull reads nothing; a plain one after 15 seconds reads", async () => {
  const call = linked();
  await call("syncPlan", {});
  const reads = planReads(call);
  later(call, 10);
  assert.equal((await call("syncPlan", {})).data.skipped, true, "within 15 seconds even a plain ask is answered from what is there");
  later(call, 40);
  const auto = await call("syncPlan", { auto: true });
  assert.deepEqual([auto.data.skipped, auto.data.pulledAt], [true, "2026-12-20T15:00:00.000Z"]);
  assert.equal(planReads(call), reads, "nothing read");
  const plain = await call("syncPlan", {});
  assert.equal(plain.data.skipped, undefined);
  assert.equal(planReads(call), reads + 1);
  later(call, 61);
  await call("syncPlan", { auto: true });
  assert.equal(planReads(call), reads + 2, "an auto ask a minute on reads");
  clean(call);
});

test("an older read landing after a newer one is dropped", async () => {
  const call = linked();
  await call("syncPlan", {});
  later(call, 20);
  // Another pull reads the planner a moment later and lands while this one is between its read and the lock.
  const read = call.fake.world.plannerTab_;
  call.fake.world.plannerTab_ = (tab) => {
    const rows = read(tab);
    call.fake.props.PLAN_READ_AT = new Date(Date.parse(call.at.now) + 1000).toISOString();
    return rows;
  };
  setPlan(call, { ...MUSEUM, time: "08:00" }, PIER, SHOW);
  const logged = logRows(call).length;
  const r = await call("syncPlan", {});
  assert.equal(r.data.skipped, true);
  assert.equal(logRows(call).length, logged, "nothing written");
  assert.equal(stored(call, FULL.id).time, "10:00");
  call.fake.world.plannerTab_ = read;
  later(call, 20);
  assert.equal((await call("syncPlan", {})).data.changed, 1, "a later read goes through");
  clean(call);
});

test("the print: an unchanged tab on an auto ask takes no lock and reads no Stops; an app write since, or a plain ask, pulls in full", async () => {
  const call = linked();
  let locks = 0;
  const withLock = call.fake.world.withLock_;
  call.fake.world.withLock_ = (fn) => { locks++; return withLock(fn); };
  await call("syncPlan", { auto: true });
  assert.equal(locks, 1);
  later(call, 61);
  const stopReads = call.fake.tableReads.Stops || 0;
  const r = await call("syncPlan", { auto: true });
  assert.deepEqual([r.data.unchanged, r.data.pulledAt], [true, call.at.now]);
  assert.equal(locks, 1, "no lock");
  assert.equal(call.fake.tableReads.Stops || 0, stopReads, "no Stops read");
  assert.equal((await call("load")).data.planPulledAt, call.at.now, "counted as a pull for the gap");
  // A plain ask ignores the print.
  later(call, 20);
  assert.equal((await call("syncPlan", {})).data.unchanged, undefined);
  assert.equal(locks, 2);
  // An app write moves rev: the next auto ask pulls in full.
  assert.equal((await call("updateStop", { id: FULL.id, patch: { note: "A new note" } })).ok, true);
  later(call, 61);
  const locksNow = locks;
  const full = await call("syncPlan", { auto: true });
  assert.equal(full.data.unchanged, undefined);
  assert.equal(locks, locksNow + 1, "the pull takes the lock");
  clean(call);
});

// ---------- the guards on a phone's and the connector's writes ----------

const T = { t: "claude-token" };
const rpc = (name, args) => ({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
const mcpText = (r) => JSON.stringify(r);
const LED = "The day, time and name of this stop come from the planner. Change them there and they come in here.";

// A world where the three stops are already the planner's (one pull done).
async function adopted(opts) {
  const call = linked(opts);
  const r = await call("syncPlan", {});
  assert.equal(r.data.adopted, 3, JSON.stringify(r));
  later(call, 20);
  return call;
}

test("guards: a planner stop's day, time, name, booked and fixed are refused from a phone and the connector; its own detail saves; a restated value passes", async () => {
  const call = await adopted();
  for (const patch of [{ time: "12:00" }, { date: "2026-12-29" }, { title: "Renamed here" }, { booked: false }, { fixed: true }, { note: "ok", title: "Renamed here" }]) {
    const r = await call("updateStop", { id: FULL.id, patch });
    assert.deepEqual([r.ok, r.error, r.message], [false, "planner_led", LED], JSON.stringify(patch));
  }
  const viaClaude = call.fake.mcp(rpc("change_stop", { id: FULL.id, time: "12:00" }), T);
  assert.ok(mcpText(viaClaude).includes(LED), mcpText(viaClaude));
  assert.equal(stored(call, FULL.id).time, "10:00");
  // An older phone's whole-stop patch, restating the five as they are, saves its detail.
  const whole = { date: "2026-12-28", time: "10:00", title: " Corner museum ", booked: true, fixed: false, detail: "A new line of ours" };
  const ok = await call("updateStop", { id: FULL.id, patch: whole });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(ok.data.stop.detail, "A new line of ours");
  assert.equal(ok.data.stop.fromPlanner, true);
  const viaClaudeOk = call.fake.mcp(rpc("change_stop", { id: FULL.id, note: "From the connector" }), T);
  assert.equal(viaClaudeOk.result.isError, undefined, mcpText(viaClaudeOk));
  assert.equal(stored(call, FULL.id).note, "From the connector");
  clean(call);
});

test("guards: a planner stop can't be removed; one the planner took off can't be put back; an app stop works as today", async () => {
  const call = await adopted({ stops: [FULL, APP_PIER, APP_SHOW, { id: "teststop0004", date: "2026-12-28", title: "Our own extra" }] });
  const own = "This stop comes from the planner. Take its row out there and it goes from here.";
  const r = await call("deleteStop", { id: FULL.id });
  assert.deepEqual([r.ok, r.error, r.message], [false, "planner_led", own]);
  assert.ok(mcpText(call.fake.mcp(rpc("remove_stop", { id: FULL.id }), T)).includes(own));
  assert.equal(stored(call, FULL.id).deleted_at, "");
  // The planner takes the pier off; it can't be put back here.
  setPlan(call, MUSEUM, SHOW);
  assert.equal((await call("syncPlan", {})).data.removed, 1);
  const back = await call("restoreStop", { id: "teststop0002" });
  assert.deepEqual([back.ok, back.error, back.message], [false, "planner_led", "This stop was taken off in the planner. Put its row back there and it comes back here."]);
  assert.notEqual(stored(call, "teststop0002").deleted_at, "");
  // The app's own stop: removed and put back as today.
  assert.equal((await call("deleteStop", { id: "teststop0004" })).ok, true);
  assert.equal((await call("restoreStop", { id: "teststop0004" })).ok, true);
  const edit = await call("updateStop", { id: "teststop0004", patch: { time: "08:00", title: "Our own breakfast" } });
  assert.equal(edit.ok, true, JSON.stringify(edit));
  clean(call);
});

test("guards: a planner change can't be undone; an older app change on a stop the planner now leads undoes only its own detail", async () => {
  const call = linked({ follow: false, plan: [HEAD, prow({ ...MUSEUM, time: "10:45" }), prow(PIER), prow(SHOW)] });
  // Before following: the app changed the museum's note and time; the Plan tab was made with that time.
  const e = await call("updateStop", { id: FULL.id, patch: { note: "Changed in the app", time: "10:45" } });
  assert.equal(e.ok, true);
  call.fake.props.PLAN_FOLLOW = "on";
  assert.deepEqual(counts((await call("syncPlan", {})).data), [0, 0, 0, 0, 3, 0], "adopted: no line of its own");
  // Undo of that older change: the note goes back, the planner's time stays.
  const u = await call("undo", { logId: e.data.logId });
  assert.equal(u.ok, true, JSON.stringify(u));
  assert.deepEqual([stored(call, FULL.id).note, stored(call, FULL.id).time], ["Our note", "10:45"]);
  assert.equal(u.data.stop.fromPlanner, true);
  // A change from the planner: refused, from a phone and the connector.
  later(call, 20);
  setPlan(call, { ...MUSEUM, time: "11:00" }, PIER, SHOW);
  assert.equal((await call("syncPlan", {})).data.changed, 1);
  const planLine = logRows(call).at(-1);
  assert.deepEqual([planLine.via, planLine.action, planLine.who], ["planner", "edit", "Mo"]);
  const u1 = await call("undo", { logId: Number(planLine.id) });
  assert.deepEqual([u1.ok, u1.error, u1.message], [false, "stale", "That change came from the planner. Change it there and it comes in here."]);
  const viaClaude = call.fake.mcp(rpc("undo", { log_id: Number(planLine.id) }), T);
  assert.ok(mcpText(viaClaude).includes("That change came from the planner."), mcpText(viaClaude));
  assert.equal(stored(call, FULL.id).time, "11:00");
  // An app change on it after the planner's: undone as today (its own detail).
  const own = await call("updateStop", { id: FULL.id, patch: { detail: "Second line" } });
  assert.equal((await call("undo", { logId: own.data.logId })).ok, true);
  assert.deepEqual([stored(call, FULL.id).detail, stored(call, FULL.id).time], ["Our own line", "11:00"]);
  clean(call);
});

test("guards: undo of an app add, once the planner leads that stop, has nothing of its own to put back", async () => {
  const call = linked({ stops: [FULL, APP_PIER, APP_SHOW] });
  const add = await call("addStop", { stop: { id: "teststop0004", date: "2026-12-28", title: "Our own extra" } });
  assert.equal(add.ok, true);
  setPlan(call, MUSEUM, PIER, SHOW, { stop_id: "teststop0004", date: "2026-12-28", what: "Our own extra" });
  assert.equal((await call("syncPlan", {})).data.adopted, 4);
  const u = await call("undo", { logId: add.data.logId });
  assert.deepEqual([u.ok, u.error, u.message], [false, "stale", LED]);
  assert.equal(stored(call, "teststop0004").deleted_at, "");
  clean(call);
});

test("guards hold only while following: with the switch off the same stop is the app's in every way", async () => {
  const call = await adopted();
  delete call.fake.props.PLAN_FOLLOW;
  const r = await call("updateStop", { id: FULL.id, patch: { time: "12:00" } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.stop.fromPlanner, false, "a reply says so too");
  assert.equal((await call("deleteStop", { id: FULL.id })).ok, true);
  clean(call);
});

test("picture C (PLAN_APP_STOPS_ false): no stop is added on a phone or through the connector while following", async () => {
  const call = await adopted();
  call.fake.world.PLAN_APP_STOPS_ = false;
  const off = "New stops go in the planner’s Plan tab. They come in here within a few minutes.";
  const r = await call("addStop", { stop: { id: "teststop0004", date: "2026-12-28", title: "Our own extra" } });
  assert.deepEqual([r.ok, r.error, r.message], [false, "planner_led", off]);
  assert.ok(mcpText(call.fake.mcp(rpc("add_stop", { date: "2026-12-28", title: "Our own extra" }), T)).includes(off));
  assert.equal(stored(call, "teststop0004"), undefined);
  delete call.fake.props.PLAN_FOLLOW;
  assert.equal((await call("addStop", { stop: { id: "teststop0004", date: "2026-12-28", title: "Our own extra" } })).ok, true, "not following: as today");
  clean(call);
});

test("moved: load lists a stop the planner moved to another day while its directions wait for a look; editing them clears it", async () => {
  const call = await adopted();
  setPlan(call, { ...MUSEUM, date: "2026-12-30" }, PIER, SHOW);
  await call("syncPlan", {});
  const moved = { id: FULL.id, message: "Moved from Mon Dec 28 in the planner. Check how to get there.", row: null, what: "Corner museum" };
  const l = (await call("load")).data;
  assert.deepEqual(l.planProblems.list, [moved]);
  assert.equal(l.stops.find((s) => s.id === FULL.id).movedFrom, "2026-12-28");
  // Under the check key too: no private value is in it.
  assert.deepEqual((await call.fake({ key: CHECK_KEY, action: "load", args: {} })).data.planProblems.list, [moved]);
  // A detail edit leaves it; a change of directions clears it.
  await call("updateStop", { id: FULL.id, patch: { note: "Still to check" } });
  assert.equal((await call("load")).data.planProblems.list.length, 1);
  const r = await call("updateStop", { id: FULL.id, patch: { gettingThere: "Bus 6 south" } });
  assert.equal(r.data.stop.movedFrom, "");
  assert.deepEqual((await call("load")).data.planProblems.list, []);
  assert.equal(stored(call, FULL.id).moved_from, "");
  // Minutes count as a look too.
  later(call, 20);
  setPlan(call, MUSEUM, PIER, SHOW);
  await call("syncPlan", {});
  assert.equal((await call("load")).data.planProblems.list.length, 1, "moved back: from Dec 30 now");
  await call("updateStop", { id: FULL.id, patch: { travelMin: 15 } });
  assert.deepEqual((await call("load")).data.planProblems.list, []);
  clean(call);
});

test("load's planProblems: the pull's own list after the moved lines, at most 20, more counting the rest", async () => {
  const rows = [];
  for (let i = 1; i <= 25; i++) rows.push({ stop_id: "", date: "2026-12-28", what: "Row " + i });
  const call = await adopted();
  setPlan(call, MUSEUM, PIER, SHOW, ...rows);
  const r = await call("syncPlan", {});
  assert.equal(r.data.problems.length, 25);
  const p = (await call("load")).data.planProblems;
  assert.equal(p.at, call.at.now);
  assert.deepEqual([p.list.length, p.more], [20, 5]);
  assert.deepEqual(p.list[0], { id: "", message: "That row has no id, so it wasn’t brought in.", row: 5, what: "Row 1" });
  clean(call);
});

// ---------- planDiff, the dry run ----------

test("planDiff: for the check key and the first person on their own link only; it writes nothing; it works with the switch off; its lists are what the next pull does", async () => {
  const call = linked({ follow: false, stops: [FULL, APP_PIER, APP_SHOW, { id: "teststop0004", date: "2026-12-28", title: "Our own extra" }, { id: "teststop0005", date: "2026-12-31", title: "Gone stop", deleted: true }] });
  // The planner: the museum moved, the pier unchanged, the show gone, a new stop, the deleted one back, a bad row.
  setPlan(call, { ...MUSEUM, date: "2026-12-29", time: "11:00" }, PIER, { stop_id: "teststop0009", date: "Dec 27", time: "9:00 am", what: "Breakfast counter", fixed: "yes" }, { stop_id: "teststop0005", date: "2026-12-31", what: "Gone stop" }, { stop_id: "teststop0010", date: "2027-03-01", what: "Off the trip" });
  // Make the pier and the show the planner's already, so the show's going counts.
  call.fake.tables.Stops.filter((r) => r.id === "teststop0002" || r.id === "teststop0003").forEach((r) => { r.planner = "yes"; });
  const mo = call.fake.personKey("Mo");
  const izzah = call.fake.personKey("Izzah");
  const tables = JSON.stringify(call.fake.tables);
  const props = JSON.stringify(call.fake.props);
  const asCheck = await call.fake({ key: CHECK_KEY, action: "planDiff", args: {} });
  const asMo = await call.fake({ key: mo, action: "planDiff", args: {} });
  assert.equal(asCheck.ok, true, JSON.stringify(asCheck));
  assert.deepEqual(asMo.data, asCheck.data);
  const refused = "Only Mo can run the plan check.";
  for (const key of [izzah, KEY]) {
    const r = await call.fake({ key, actor: "Mo", action: "planDiff", args: {} });
    assert.deepEqual([r.ok, r.error, r.message], [false, "bad_input", refused]);
  }
  const viaClaude = await call.fake.claude("planDiff", {});
  assert.deepEqual([viaClaude.ok, viaClaude.error], [false, "bad_input"]);
  assert.equal(JSON.stringify(call.fake.tables), tables, "no table changed");
  assert.equal(JSON.stringify(call.fake.props), props, "no property changed");
  const d = asCheck.data;
  assert.deepEqual(d.adds, [{ id: "teststop0009", row: 4, date: "2026-12-27", time: "09:00", title: "Breakfast counter", booked: false, fixed: true }]);
  assert.deepEqual(d.edits, [
    { id: "teststop0001", row: 2, title: "Corner museum", action: "edit", changes: { date: ["2026-12-28", "2026-12-29"], time: ["10:00", "11:00"] } },
    { id: "teststop0005", row: 5, title: "Gone stop", action: "restore", changes: { deleted: [true, false] } },
  ]);
  assert.deepEqual(d.removals, [{ id: "teststop0003", date: "2026-12-30", time: "19:30", title: "Late show" }]);
  assert.deepEqual(d.onlyInApp, [{ id: "teststop0004", date: "2026-12-28", time: "", title: "Our own extra" }]);
  assert.deepEqual([d.same, d.held, d.tickets], [1, 0, []], "the pier is the planner's and the same");
  assert.deepEqual(d.problems, [{ id: "teststop0010", message: "Pick a day of the trip.", row: 6, what: "Off the trip" }]);
  // The museum: adopted with its change (it was the app's); the pier is the same.
  // Then follow, and the pull does exactly that.
  call.fake.props.PLAN_FOLLOW = "on";
  const r = await call("syncPlan", {});
  assert.deepEqual(counts(r.data), [1, 1, 1, 1, 0, 1]);
  assert.deepEqual(r.data.problems, d.problems);
  later(call, 20);
  const after = (await call.fake({ key: CHECK_KEY, action: "planDiff", args: {} })).data;
  assert.deepEqual([after.adds, after.edits, after.removals, after.same], [[], [], [], 4], "nothing left to do");
  clean(call);
});

test("planDiff: no planner, an unreadable planner and a missing tab say so, never with the planner's id", async () => {
  const none = linked({ over: { plannerId: undefined } });
  assert.equal((await none.fake({ key: CHECK_KEY, action: "planDiff", args: {} })).error, "no_planner");
  const call = linked();
  call.fake.planner.fails = true;
  const r = await call.fake({ key: CHECK_KEY, action: "planDiff", args: {} });
  assert.deepEqual([r.ok, r.error], [false, "planner_unreadable"]);
  assert.equal(JSON.stringify(r).includes(PLANNER_ID), false);
  call.fake.planner.fails = false;
  delete call.fake.planner.tabs.Plan;
  assert.equal((await call.fake({ key: CHECK_KEY, action: "planDiff", args: {} })).error, "planner_columns");
  // An old Sheet without the planner column: nobody led yet.
  const old = linked({ over: { missingColumns: ["Stops.planner", "Stops.tk_planner", "Stops.moved_from"] } });
  const o = (await old.fake({ key: CHECK_KEY, action: "planDiff", args: {} })).data;
  assert.deepEqual(o.edits.map((e) => e.action), ["adopt", "adopt", "adopt"]);
  clean(call);
  clean(old);
});
