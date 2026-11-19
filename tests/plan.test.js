import test from "node:test";
import assert from "node:assert/strict";
import { minutesOf, nowIn, instantOf, openDayIndex, dayState, daysToGo, stopsFor, nextStopId, isPast, nextLine, stayFor, stayShownFor, NEXT_GRACE_MIN, NIGHT_ENDS_MIN, safeHref, originFor, mapsUrl, stayMapsUrl, inkFor, header, dayTotalTrip, gateDate, issueLine, checkDate } from "../js/plan.js";

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
test("directions", () => {
  const stays = [{ id: "s1", name: "Asakusa hotel", place: "Asakusa hotel Tokyo", firstNight: "2026-12-26", lastNight: "2026-12-28", deleted: false }];
  const day = [stop("Meiji Shrine", "09:00", { place: "Meiji Jingu" }), stop("Lunch", "12:30", { place: "https://maps.app.goo.gl/abc" }), stop("Sky", "14:00", { place: "Shibuya Sky" })];
  assert.equal(originFor(day, 0, stays, "2026-12-28"), "Asakusa hotel Tokyo");
  assert.equal(originFor(day, 1, stays, "2026-12-28"), "Meiji Jingu");
  assert.equal(originFor(day, 2, stays, "2026-12-28"), "Lunch"); // a link cannot be an origin
  assert.equal(originFor(day, 0, [], "2026-12-28"), "");
  assert.equal(mapsUrl(day[0], "Asakusa hotel Tokyo"), "https://www.google.com/maps/dir/?api=1&travelmode=transit&origin=Asakusa%20hotel%20Tokyo&destination=Meiji%20Jingu");
  assert.equal(mapsUrl(day[1], "Meiji Jingu"), "https://maps.app.goo.gl/abc");
  assert.equal(mapsUrl(stop("Dinner", "19:00"), ""), "https://www.google.com/maps/dir/?api=1&travelmode=transit&destination=Dinner");
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
  const url = mapsUrl(stop("Odd", "10:00", { place: evil }), "");
  assert.equal(url, "https://www.google.com/maps/dir/?api=1&travelmode=transit&destination=" + encodeURIComponent(evil));
  assert.equal(mapsUrl(stop("Odd", "10:00", { place: spaced }), "Here"), "https://www.google.com/maps/dir/?api=1&travelmode=transit&origin=Here&destination=" + encodeURIComponent(spaced));
  assert.equal(stayMapsUrl({ name: "Inn", place: evil }), "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(evil));
  assert.equal(stayMapsUrl({ name: "Inn", place: spaced }), "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(spaced));
  // a hand-typed place is still text as an origin
  assert.equal(originFor([stop("a", "09:00", { place: evil }), stop("b", "10:00")], 1, [], "2026-12-28"), evil);
});
test("blank or missing fields never print undefined", () => {
  assert.equal(nextLine({ id: "x", time: "" }, 800), "");
  assert.equal(nextLine({ id: "x", time: "25:00" }, 800), "");
  assert.equal(minutesOf("25:00"), null);
  assert.equal(minutesOf("14:05"), 845);
  assert.equal(minutesOf(undefined), null);
  assert.equal(mapsUrl({ id: "x" }, ""), "");
  assert.equal(stayMapsUrl({}), "");
  assert.equal(originFor([{ id: "a" }, { id: "b" }], 1, [], "2026-12-28"), "");
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

// ---- where you are (ported from the Japan app: MAT eb3b690, dddb4e5, 9690e02, 6c7d5cc, cb13bce) ----
// The pure rules the screens will use; no screen calls them yet. Every place here is made up.
import { hereLine, nearStops, stayDistance, inPlace, NEAR_M, PLACE_M, STAY_FAR_M } from "../js/plan.js";
import { metres, walkMinutes } from "../js/geo.js";

const PIERAT = { lat: 41.9090286, lng: -87.6377472 };
// A point `m` metres north of p.
const north = (p, m) => ({ lat: p.lat + m / 111195, lng: p.lng });
const pierStop = (over = {}) => stop("The pier", "14:00", { lat: String(PIERAT.lat), lng: String(PIERAT.lng), travelMin: 30, ...over });

test("leave-by from where you are: on time, close, late", () => {
  const here = north(PIERAT, 1200);
  const m = metres(here, PIERAT);
  const walk = walkMinutes(m);
  assert.equal(walk, 20); // 1200 m * 1.3 / 80 = 19.5, up
  // 13:20; leave at 13:40 -> in 20 min.
  assert.deepEqual(hereLine(pierStop(), 800, here), { dist: "1.2 km · 20 min on foot", lead: "Leave by 13:40, in 20 min.", late: false });
  // 13:35: 5 min to spare.
  assert.deepEqual(hereLine(pierStop(), 815, here), { dist: "1.2 km · 20 min on foot", lead: "Leave now. 5 min to spare.", late: false });
  assert.equal(hereLine(pierStop(), 819, here).lead, "Leave now. 1 min to spare.");
  assert.equal(hereLine(pierStop(), 814, here).lead, "Leave by 13:40, in 6 min.");
  assert.equal(hereLine(pierStop(), 820, here).lead, "Leave now.");
  // 13:46: six minutes late.
  assert.deepEqual(hereLine(pierStop(), 826, here), { dist: "1.2 km · 20 min on foot", lead: "About 6 min late. Leave now.", late: true });
  // Well ahead: hours.
  assert.equal(hereLine(pierStop(), 600, here).lead, "Leave by 13:40, in 3 h 40 min.");
});

test("leave-by falls back to today's line", () => {
  const near = north(PIERAT, 500);
  assert.equal(hereLine(pierStop(), 800, null), null, "no usable position");
  assert.equal(hereLine(pierStop({ lat: "", lng: "" }), 800, near), null, "no coordinates");
  assert.equal(hereLine(pierStop({ time: "" }), 800, near), null, "no time");
  assert.equal(hereLine(pierStop(), 840, near), null, "started: Now. stands");
  assert.equal(hereLine(pierStop(), 850, near), null);
  assert.equal(hereLine(pierStop(), 800, north(PIERAT, NEAR_M + 10)), null, "over 3 km: a train, not a walk");
  assert.ok(hereLine(pierStop(), 800, north(PIERAT, NEAR_M - 10)));
  // A stop the geocoder put in another city: far, so it falls back.
  assert.equal(hereLine(pierStop({ lat: "40.7301", lng: "-74.035" }), 800, near), null);
});

test("nearest stop: distances on open stops to come, the nearest tagged, the order kept", () => {
  const here = PIERAT;
  const stops = [
    stop("Train", "09:10", { lat: "41.88", lng: "-87.64" }),
    stop("Museum", "", { id: "mus", lat: String(north(here, 900).lat), lng: String(here.lng) }),
    stop("Gallery", "", { id: "gal", lat: String(north(here, 650).lat), lng: String(here.lng) }),
    stop("Far", "", { id: "far", lat: String(north(here, 5000).lat), lng: String(here.lng) }),
    stop("Nowhere", "", { id: "now" }),
    stop("Dinner", "18:30", { lat: String(north(here, 100).lat), lng: String(here.lng), fixed: true }),
  ];
  const out = nearStops(stops, here);
  assert.deepEqual(Object.keys(out).sort(), ["gal", "mus"]);
  assert.deepEqual(out.gal, { dist: "650 m · 11 min on foot", near: true });
  assert.deepEqual(out.mus, { dist: "900 m · 15 min on foot", near: false });
  // One alone is not "nearest".
  assert.deepEqual(nearStops([stops[1]], here), { mus: { dist: "900 m · 15 min on foot", near: false } });
  assert.deepEqual(nearStops(stops, null), {});
  assert.deepEqual(nearStops(stops.map((s) => ({ ...s, deleted: true })), here), {});
});

test("lodging distance: nothing beyond 50 km", () => {
  const here = PIERAT;
  assert.equal(STAY_FAR_M, 50000);
  assert.equal(stayDistance({ lat: String(north(here, 2400).lat), lng: String(here.lng) }, here), "2.4 km from here");
  assert.equal(stayDistance({ lat: String(north(here, 33360).lat), lng: String(here.lng) }, here), "33 km from here");
  assert.equal(stayDistance({ lat: String(north(here, 49900).lat), lng: String(here.lng) }, here), "50 km from here");
  assert.equal(stayDistance({ lat: String(north(here, 51000).lat), lng: String(here.lng) }, here), "");
  assert.equal(stayDistance({ lat: "", lng: "" }, here), "");
  assert.equal(stayDistance({ lat: "41", lng: "-87" }, null), "");
  assert.equal(stayDistance(null, here), "");
});

test("the stamp in the place: within 15 km of the day's coordinates", () => {
  const here = PIERAT;
  assert.equal(inPlace({ lat: String(north(here, PLACE_M - 50).lat), lng: String(here.lng) }, here), true);
  assert.equal(inPlace({ lat: String(north(here, PLACE_M + 50).lat), lng: String(here.lng) }, here), false);
  assert.equal(inPlace({ lat: "", lng: "" }, here), false, "a day with no coordinates");
  assert.equal(inPlace({ lat: "41", lng: "-87" }, null), false, "no usable position");
  assert.equal(inPlace(null, here), false, "no such day (the placemat's own stamp)");
});
