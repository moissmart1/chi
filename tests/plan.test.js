import test from "node:test";
import assert from "node:assert/strict";
import { minutesOf, nowIn, instantOf, openDayIndex, dayState, daysToGo, stopsFor, nextStopId, isPast, nextLine, stayFor, stayShownFor, NEXT_GRACE_MIN, NIGHT_ENDS_MIN, safeHref, mapsUrl, stayMapsUrl, inkFor, header, dayTotalTrip, gateDate, issueLine, checkDate } from "../js/plan.js";

const TZ = "America/Chicago";
const TRIP = { start: "2026-12-26", end: "2027-01-01", tz: TZ };
const DAYS = ["2026-12-26", "2026-12-27", "2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01"].map((date) => ({ date }));
const at = (iso) => Date.parse(iso);
const stop = (id, time, more = {}) => ({ id, date: "2026-12-28", time, title: id, place: "", travelMin: 0, deleted: false, ...more });

test("Chicago time, whatever the phone thinks", () => {
  // 13:20 on Dec 28 in Chicago is 14:20 in Toronto and 04:20 on Dec 29 in Tokyo.
  assert.deepEqual(nowIn(TZ, at("2026-12-28T13:20:00-06:00")), { date: "2026-12-28", minutes: 800 });
  assert.equal(instantOf(TZ, "2026-12-28", 800), at("2026-12-28T13:20:00-06:00"));
});
test("which day opens", () => {
  assert.equal(openDayIndex(TRIP, DAYS, at("2026-12-01T12:00:00-06:00")), 0);
  assert.equal(openDayIndex(TRIP, DAYS, at("2026-12-28T13:20:00-06:00")), 2);
  assert.equal(openDayIndex(TRIP, DAYS, at("2026-12-29T00:30:00-06:00")), 3); // just past midnight
  assert.equal(openDayIndex(TRIP, DAYS, at("2027-01-05T12:00:00-06:00")), 6);
});
test("days to go", () => {
  assert.equal(daysToGo(TRIP, at("2026-12-01T12:00:00-06:00")), 25);
  assert.equal(daysToGo(TRIP, at("2026-12-25T23:59:00-06:00")), 1);
  assert.equal(daysToGo(TRIP, at("2026-12-26T00:00:00-06:00")), 0);
});
test("a day's stops: timed in order, untimed last, deleted and bad times handled", () => {
  const all = [stop("c", "19:00"), stop("x", ""), stop("a", "09:00"), stop("gone", "10:00", { deleted: true }), stop("odd", "9:5"), stop("other", "08:00", { date: "2026-12-29" })];
  assert.deepEqual(stopsFor(all, "2026-12-28").map((s) => s.id), ["a", "c", "x", "odd"]);
});
test("next and past", () => {
  const day = [stop("a", "09:00"), stop("b", "14:00"), stop("late", "23:50"), stop("x", "")];
  assert.equal(nextStopId(day, 800), "b");
  assert.equal(nextStopId(day, 23 * 60 + 40), "late");
  // R38: a stop just started is still next (until midnight, for the last one).
  assert.equal(nextStopId(day, 23 * 60 + 55), "late");
  assert.deepEqual(day.map((s) => isPast(s, 800)), [true, false, false, false]);
});
test("the next stop's line", () => {
  assert.equal(nextLine(stop("b", "14:00", { travelMin: 30 }), 800), "Leave by 13:30, in 10 min.");
  assert.equal(nextLine(stop("b", "14:00", { travelMin: 30 }), 815), "Leave now.");
  // Minutes from an old cache made before the backend rounded them: never a fraction.
  assert.equal(nextLine(stop("b", "14:00", { travelMin: 12.5 }), 800), "Leave by 13:47, in 27 min.");
  assert.equal(nextLine(stop("b", "14:00", { travelMin: "20" }), 800), "Leave by 13:40, in 20 min.");
  assert.equal(nextLine(stop("b", "14:00", { travelMin: -10 }), 800), "Next, in 40 min.");
  assert.equal(nextLine(stop("b", "14:00"), 800), "Next, in 40 min.");
  assert.equal(nextLine(stop("b", "15:25"), 800), "Next, in 2 h 5 min.");
  assert.equal(nextLine(stop("b", "14:20"), 800), "Next, in 1 h.");
  assert.equal(nextLine(stop("b", "13:20"), 800), "Now.");
});
test("where you sleep", () => {
  const stays = [{ id: "s1", name: "Asakusa", firstNight: "2026-12-26", lastNight: "2026-12-28", deleted: false }, { id: "s2", name: "Niseko", firstNight: "2026-12-29", lastNight: "2026-12-31", deleted: false }, { id: "s0", name: "Gone", firstNight: "2026-12-26", lastNight: "2027-01-01", deleted: true }];
  assert.equal(stayFor(stays, "2026-12-28").name, "Asakusa");
  assert.equal(stayFor(stays, "2026-12-29").name, "Niseko");
  assert.equal(stayFor(stays, "2027-01-01"), null);
});
test("directions: Maps starts from the phone's own position", () => {
  const day = [stop("Meiji Shrine", "09:00", { place: "Meiji Jingu" }), stop("Lunch", "12:30", { place: "https://maps.app.goo.gl/abc" })];
  assert.equal(mapsUrl(day[0]), "https://www.google.com/maps/dir/?api=1&travelmode=transit&destination=Meiji%20Jingu");
  assert.equal(mapsUrl(day[1]), "https://maps.app.goo.gl/abc");
  assert.equal(mapsUrl(stop("Dinner", "19:00")), "https://www.google.com/maps/dir/?api=1&travelmode=transit&destination=Dinner");
  assert.equal(mapsUrl(day[0], "Somewhere").includes("origin"), false, "a second argument is not an origin any more");
  assert.equal(stayMapsUrl({ name: "Lodge", place: "", addressJp: "北海道虻田郡" }), "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("北海道虻田郡"));
});
test("links from the Sheet", () => {
  assert.equal(safeHref("https://example.test/a"), "https://example.test/a");
  for (const bad of ["javascript:alert(1)", "data:text/html,x", " https://x.test", "https://x .test", "", null, 7]) assert.equal(safeHref(bad), "");
});
test("the header copes with a sparse or hand-edited day", () => {
  assert.deepEqual(header({ date: "2026-12-29", city: "Niseko" }), { line: null, colour: null, ink: null, route: null, city: "Niseko", title: "" });
  const full = header({ date: "2026-12-28", city: "Tokyo", title: "", lineJp: "山手線", lineEn: "Yamanote Line", lineColour: "#9ACD32", fromJp: "新宿", fromEn: "Shinjuku", toJp: "渋谷", toEn: "Shibuya" });
  assert.deepEqual([full.line.jp, full.colour, full.ink, full.route.toJp], ["山手線", "#9ACD32", "#15120F", "渋谷"]);
  assert.equal(header({ date: "2026-12-28", lineJp: "山手線", lineColour: "green" }).colour, null);
  assert.equal(header({ date: "2026-12-28", fromJp: "新宿" }).route, null);
  assert.equal(inkFor("#1A1A6E"), "#FFFFFF");
});
test("the fare and the small print", () => {
  const ex = [{ day: "2026-12-27", amount: 30, currency: "USD", rate: 0.72, deleted: false }, { day: "2026-12-27", amount: 10, currency: "CAD", rate: 0.72, deleted: false }, { day: "2026-12-27", amount: 999, currency: "USD", rate: 0.72, deleted: true }];
  assert.equal(dayTotalTrip(ex, "2026-12-27"), 3720); // US$30.00 + US$7.20, in cents
  assert.equal(gateDate("2026-12-27"), "12.27");
  assert.equal(gateDate("2027-01-01"), "01.01");
  // The guest check's own date box and its tear-off stub (no Japanese issue line).
  assert.equal(checkDate("2026-12-27"), "12/27");
  assert.equal(checkDate("2027-01-01"), "1/1");
  assert.equal(issueLine("2026-12-27"), "Guest receipt · 12/27");
});

test("a place from the Sheet is only a link when safeHref says so", () => {
  const evil = "javascript:alert(1)";
  const spaced = "http://x y";
  const url = mapsUrl(stop("Odd", "10:00", { place: evil }));
  assert.equal(url, "https://www.google.com/maps/dir/?api=1&travelmode=transit&destination=" + encodeURIComponent(evil));
  assert.equal(mapsUrl(stop("Odd", "10:00", { place: spaced })), "https://www.google.com/maps/dir/?api=1&travelmode=transit&destination=" + encodeURIComponent(spaced));
  assert.equal(stayMapsUrl({ name: "Inn", place: evil }), "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(evil));
  assert.equal(stayMapsUrl({ name: "Inn", place: spaced }), "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(spaced));
});
test("blank or missing fields never print undefined", () => {
  assert.equal(nextLine({ id: "x", time: "" }, 800), "");
  assert.equal(nextLine({ id: "x", time: "25:00" }, 800), "");
  assert.equal(minutesOf("25:00"), null);
  assert.equal(minutesOf("14:05"), 845);
  assert.equal(minutesOf(undefined), null);
  assert.equal(mapsUrl({ id: "x" }), "");
  assert.equal(stayMapsUrl({}), "");
  assert.deepEqual(header({}), { line: null, colour: null, ink: null, route: null, city: "", title: "" });
  assert.equal(stayFor([{ id: "s", name: "No dates" }], "2026-12-28"), null);
});
test("the open day when today is inside the trip but missing from the list", () => {
  const some = [{ date: "2026-12-26" }, { date: "2026-12-30" }];
  assert.equal(openDayIndex(TRIP, some, at("2026-12-28T12:00:00-06:00")), 0);
  assert.equal(openDayIndex(TRIP, some, at("2027-01-01T12:00:00-06:00")), 1);
  assert.equal(openDayIndex(TRIP, [{ date: "2026-12-31" }], at("2026-12-28T12:00:00-06:00")), 0);
  assert.equal(dayState("2026-12-27", "2026-12-28"), "used");
  assert.equal(dayState("2026-12-28", "2026-12-28"), "today");
  assert.equal(dayState("2026-12-29", "2026-12-28"), "ahead");
});

// R38: a late stop stays "next" for a while. One day: A 14:00, B 19:00 with
// 30 minutes to get there, C untimed.
const hm = (h, m) => h * 60 + m;
const lateDay = (bTime = "19:00", bTravel = 30) => [stop("A", "14:00"), stop("B", bTime, { travelMin: bTravel }), stop("C", "")];
const lineOf = (day, minutes) => {
  const id = nextStopId(day, minutes);
  return id ? nextLine(day.find((s) => s.id === id), minutes) : "";
};
test("R38: 13:59, A is next and counts down as before", () => {
  assert.equal(NEXT_GRACE_MIN, 30);
  assert.equal(nextStopId(lateDay(), hm(13, 59)), "A");
  assert.equal(lineOf(lateDay(), hm(13, 59)), "Next, in 1 min.");
});
test("R38: 14:00, A is next and reads Now.", () => {
  assert.equal(nextStopId(lateDay(), hm(14, 0)), "A");
  assert.equal(lineOf(lateDay(), hm(14, 0)), "Now.");
});
test("R38: 14:29, A is still next and reads Now.; it is not past", () => {
  assert.equal(nextStopId(lateDay(), hm(14, 29)), "A");
  assert.equal(lineOf(lateDay(), hm(14, 29)), "Now.");
  assert.equal(isPast(lateDay()[0], hm(14, 29), "A"), false);
});
test("R38: 14:30, B is next with its leave-by, and A is past", () => {
  assert.equal(nextStopId(lateDay(), hm(14, 30)), "B");
  assert.equal(lineOf(lateDay(), hm(14, 30)), "Leave by 18:30, in 4 h.");
  assert.equal(isPast(lateDay()[0], hm(14, 30), "B"), true);
});
test("R38: a started stop with minutes to get there reads Now., not Leave now.", () => {
  assert.equal(nextLine(stop("A", "14:00", { travelMin: 30 }), hm(14, 1)), "Now.");
  assert.equal(nextLine(stop("A", "14:00", { travelMin: 30 }), hm(13, 59)), "Leave now.");
});
test("R38: the grace ends when it is time to leave for the following stop", () => {
  assert.equal(nextStopId(lateDay("14:20", 5), hm(14, 14)), "A");
  assert.equal(lineOf(lateDay("14:20", 5), hm(14, 14)), "Now.");
  assert.equal(nextStopId(lateDay("14:20", 5), hm(14, 15)), "B");
  // The following stop with no minutes to get there: its own time.
  assert.equal(nextStopId(lateDay("14:20", 0), hm(14, 19)), "A");
  assert.equal(nextStopId(lateDay("14:20", 0), hm(14, 20)), "B");
});
test("R38: the grace never holds back a stop whose leave-by has come", () => {
  assert.equal(nextStopId(lateDay("14:10", 30), hm(13, 59)), "A");
  assert.equal(nextStopId(lateDay("14:10", 30), hm(14, 0)), "B");
});
test("R38: the last timed stop of the day", () => {
  assert.equal(nextStopId(lateDay(), hm(19, 29)), "B");
  assert.equal(lineOf(lateDay(), hm(19, 29)), "Now.");
  assert.equal(nextStopId(lateDay(), hm(19, 30)), null);
});
test("R38: untimed stops are never next", () => {
  assert.equal(nextStopId([stop("C", ""), stop("D", "9:5")], hm(10, 0)), null);
  assert.equal(nextStopId(lateDay(), hm(23, 0)), null);
});
test("R38: the grace does not cross midnight", () => {
  const all = [stop("late", "23:50"), stop("bus", "", { date: "2026-12-29" })];
  // At 00:10 on Dec 29 the 23:50 stop is on yesterday's ticket, not today's.
  assert.equal(nextStopId(stopsFor(all, "2026-12-29"), hm(0, 10)), null);
  // On its own day it is next until midnight.
  assert.equal(nextStopId(stopsFor(all, "2026-12-28"), hm(23, 59)), "late");
});

// R37: before 04:00, today's ticket shows last night's stay.
const X = { id: "X", name: "Asakusa", firstNight: "2026-12-27", lastNight: "2026-12-28", deleted: false };
const Y = { id: "Y", name: "Niseko", firstNight: "2026-12-29", lastNight: "2026-12-30", deleted: false };
const DEC13 = "2026-12-29";
test("R37: 00:30 on a hotel-change day shows last night's stay; 04:00 today's", () => {
  assert.equal(NIGHT_ENDS_MIN, 240);
  assert.equal(stayShownFor([X, Y], DEC13, { today: DEC13, minutes: hm(0, 30) }).id, "X");
  assert.equal(stayShownFor([X, Y], DEC13, { today: DEC13, minutes: hm(3, 59) }).id, "X");
  assert.equal(stayShownFor([X, Y], DEC13, { today: DEC13, minutes: hm(4, 0) }).id, "Y");
});
test("R37: the same stay both nights", () => {
  const Z = { id: "Z", name: "One", firstNight: "2026-12-27", lastNight: "2026-12-30", deleted: false };
  assert.equal(stayShownFor([Z], DEC13, { today: DEC13, minutes: hm(0, 30) }).id, "Z");
});
test("R37: no stay covers last night (first day, or a gap)", () => {
  assert.equal(stayShownFor([Y], DEC13, { today: DEC13, minutes: hm(0, 30) }).id, "Y");
  assert.equal(stayShownFor([X, Y], "2026-12-27", { today: "2026-12-27", minutes: hm(0, 30) }).id, "X");
});
test("R37: a stay covers last night but none tonight", () => {
  assert.equal(stayShownFor([X], DEC13, { today: DEC13, minutes: hm(0, 30) }).id, "X");
  assert.equal(stayShownFor([X], DEC13, { today: DEC13, minutes: hm(4, 0) }), null);
});
test("R37: a deleted stay never shows", () => {
  assert.equal(stayShownFor([{ ...X, deleted: true }, Y], DEC13, { today: DEC13, minutes: hm(0, 30) }).id, "Y");
  assert.equal(stayShownFor([{ ...X, deleted: true }], DEC13, { today: DEC13, minutes: hm(0, 30) }), null);
});
test("R37: other days' tickets are unchanged", () => {
  assert.equal(stayShownFor([X, Y], "2026-12-30", { today: DEC13, minutes: hm(0, 30) }).id, "Y");
  assert.equal(stayShownFor([X, Y], "2026-12-28", { today: DEC13, minutes: hm(0, 30) }).id, "X");
  assert.equal(stayShownFor([X, Y], DEC13, { today: "2026-12-30", minutes: hm(0, 30) }).id, "Y");
  assert.equal(stayShownFor([X, Y], DEC13, {}).id, "Y");
});

// ---- where you are: the rules the screens use (miles, the grid, 70 m a minute) ----
// Every place here is made up.
import { hereLine, nearStops, stayDistance, inPlace, planLeave, fromHere, NEAR_M, PLACE_M, STAY_FAR_M, LEAVE_M } from "../js/plan.js";
import { MILE_M } from "../js/geo.js";

const P = { lat: 41.9, lng: -87.7 };
const DEG = (6371008.8 * Math.PI) / 180;
const off = (base, n, e) => ({
  lat: +(base.lat + n / DEG).toFixed(6),
  lng: +(base.lng + e / (DEG * Math.cos((base.lat * Math.PI) / 180))).toFixed(6),
});
const txt = (p) => ({ lat: String(p.lat), lng: String(p.lng) });
const atOff = (id, time, n, e, more = {}) => stop(id, time, { ...txt(off(P, n, e)), ...more });

test("the constants", () => {
  assert.equal(LEAVE_M, MILE_M);
  assert.equal(NEAR_M, 3000);
  assert.equal(STAY_FAR_M, 50000);
  assert.equal(PLACE_M, MILE_M);
});

test("fromHere: the sign and the words for one place", () => {
  const f = fromHere(P, txt(off(P, -805, 0)));
  assert.deepEqual({ ...f, m: undefined }, { m: undefined, blocks: 4, dir: "S", miles: "0.5 mi", min: 12, dist: "0.5 mi · 12 min walk" });
  assert.equal(fromHere(P, txt(off(P, 3500, 0))).blocks, null);
  assert.equal(fromHere(null, P), null);
  assert.equal(fromHere(P, { lat: "", lng: "" }), null);
});

test("hereLine: the worked day, stop at 0.5 mi south", () => {
  const s = atOff("B", "14:30", -805, 0);
  const from = { blocks: 4, dir: "S", miles: "0.5 mi", min: 12, dist: "0.5 mi · 12 min walk" };
  const rows = [
    [600, "Leave by 14:18, in 4 h 18 min.", "ok", 258],
    [832, "Leave by 14:18, in 26 min.", "ok", 26],
    [852, "Leave by 14:18, in 6 min.", "ok", 6],
    [853, "Leave now. 5 min to spare.", "near", 5],
    [857, "Leave now. 1 min to spare.", "near", 1],
    [858, "Leave now.", "near", 0],
    [864, "About 6 min late. Leave now.", "late", -6],
    [869, "About 11 min late. Leave now.", "late", -11],
  ];
  for (const [minutes, lead, tone, spare] of rows) {
    const h = hereLine(s, minutes, P);
    assert.equal(h.lead, lead, String(minutes));
    assert.equal(h.tone, tone);
    assert.equal(h.spare, spare);
    assert.equal(h.late, tone === "late");
    assert.equal(h.dist, "0.5 mi · 12 min walk");
    assert.equal(h.leaveBy, "14:18");
    assert.deepEqual(h.from, from, "no raw metres in the answer");
  }
  assert.equal(hereLine(s, 870, P), null);
  assert.equal(hereLine(s, 880, P), null);
});

test("hereLine: a mile along the grid, no more", () => {
  assert.equal(hereLine(atOff("x", "14:30", 1600, 0), 832, P).lead, "Leave by 14:07, in 15 min.");
  assert.equal(hereLine(atOff("x", "14:30", 1600, 0), 832, P).from.dist, "1.0 mi · 23 min walk");
  assert.equal(hereLine(atOff("x", "14:30", 1600, 0), 832, P).from.blocks, 8);
  assert.equal(hereLine(atOff("x", "14:30", 1620, 0), 832, P), null);
  assert.equal(hereLine(atOff("x", "14:30", -1000, 1000), 832, P), null, "2,000 m on the grid though 1,414 m straight");
  assert.equal(hereLine(atOff("x", "14:30", -805, 0), 832, null), null);
  assert.equal(hereLine(stop("x", "14:30"), 832, P), null, "no coordinates");
  assert.equal(hereLine(atOff("x", "", -805, 0), 832, P), null, "no time");
});

test("nearStops: loose stops within 3,000 m on the grid; the nearest is marked", () => {
  const a = atOff("a", "", 0, 320), b = atOff("b", "", 160, 0), c = atOff("c", "", 600, -200);
  const d = atOff("d", "", 3010, 0), timed = atOff("t", "10:00", 100, 0), gone = atOff("g", "", 50, 0, { deleted: true });
  const out = nearStops([a, b, c, d, timed, gone], P);
  assert.deepEqual(out, {
    a: { from: { blocks: 2, dir: "E", miles: "0.2 mi", min: 5, dist: "0.2 mi · 5 min walk" }, dist: "0.2 mi · 5 min walk", near: false },
    b: { from: { blocks: 1, dir: "N", miles: "0.1 mi", min: 3, dist: "0.1 mi · 3 min walk" }, dist: "0.1 mi · 3 min walk", near: true },
    c: { from: { blocks: 4, dir: "N", miles: "0.5 mi", min: 12, dist: "0.5 mi · 12 min walk" }, dist: "0.5 mi · 12 min walk", near: false },
  });
  assert.deepEqual(Object.keys(out), ["a", "b", "c"], "the order never changes");
  assert.deepEqual(nearStops([a], P), { a: { ...out.a, near: false } });
  assert.deepEqual(nearStops([a, b], null), {});
  const w = nearStops([atOff("w", "", 0, -60)], P).w;
  assert.deepEqual(w.from, { blocks: 0, dir: "W", miles: "under 0.1 mi", min: 1, dist: "under 0.1 mi · 1 min walk" });
});

test("stayDistance: up to 50 km along the grid", () => {
  const at = (n) => stayDistance(txt(off(P, n, 0)), P);
  assert.equal(at(2250).text, "1.4 mi from here");
  assert.equal(at(2250).from.blocks, 11);
  assert.equal(at(2250).from.dir, "N");
  assert.equal(at(3300).text, "2.1 mi from here");
  assert.equal(at(3300).from.blocks, 16);
  assert.equal(at(3500).text, "2.2 mi from here");
  assert.equal(at(3500).from.blocks, null);
  assert.equal(at(3500).from.dir, "N");
  assert.equal(at(16500).text, "10 mi from here");
  assert.equal(at(16500).from.blocks, null);
  assert.equal(at(49000).text, "30 mi from here");
  assert.equal(at(50100), null);
  assert.equal("m" in at(2250).from, false);
  assert.equal(stayDistance(txt(off(P, 2250, 0)), null), null);
  assert.equal(stayDistance({ lat: "", lng: "" }, P), null);
  assert.equal(stayDistance(null, P), null);
});

test("inPlace: within a mile, straight line, of the day or one of its stops", () => {
  const day = (n, e, date = "2026-12-28") => ({ date, ...txt(off(P, n, e)) });
  assert.equal(inPlace(day(1600, 0), [], P), true);
  assert.equal(inPlace(day(1620, 0), [], P), false);
  assert.equal(inPlace(day(1200, 1200), [], P), false, "1,697 m straight");
  const far = day(9000, 0);
  const s = (more) => ({ id: "s", date: "2026-12-28", deleted: false, ...txt(off(P, 0, 320)), ...more });
  assert.equal(inPlace(far, [s()], P), true);
  assert.equal(inPlace(far, [s({ deleted: true })], P), false);
  assert.equal(inPlace(far, [s({ date: "2026-12-29" })], P), false);
  assert.equal(inPlace(far, [s({ lat: "", lng: "" })], P), false);
  assert.equal(inPlace({ date: "2026-12-28" }, [], P), false);
  assert.equal(inPlace(far, [s()], null), false);
  assert.equal(inPlace(null, [s()], P), false);
});

test("planLeave rebuilds nextLine for every minute", () => {
  const sentence = (p) => (!p ? "" : p.kind === "now" ? "Now." : p.kind === "go" ? "Leave now." : p.kind === "leave" ? "Leave by " + p.leaveBy + ", in " + p.in + "." : "Next, in " + p.in + ".");
  for (const s of [stop("t", "14:30", { travelMin: 25 }), stop("u", "14:30")]) {
    for (let m = 600; m <= 900; m++) assert.equal(sentence(planLeave(s, m)), nextLine(s, m), s.id + " " + m);
  }
  assert.equal(planLeave(stop("n", ""), 600), null);
  assert.deepEqual(planLeave(stop("t", "14:30", { travelMin: 25 }), 600), { kind: "leave", leaveBy: "14:05", in: "4 h 5 min" });
});
