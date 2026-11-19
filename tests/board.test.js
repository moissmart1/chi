// The board's rules (js/board.js). Every place here is made up.
import test from "node:test";
import assert from "node:assert/strict";
import { boardFor, isClosed, closedDate, BOARD_KEY } from "../js/board.js";

const TZ = "America/Chicago";
const P = { lat: 41.9, lng: -87.7 };
const DEG = (6371008.8 * Math.PI) / 180;
const off = (base, n, e) => ({
  lat: +(base.lat + n / DEG).toFixed(6),
  lng: +(base.lng + e / (DEG * Math.cos((base.lat * Math.PI) / 180))).toFixed(6),
});
const txt = (p) => ({ lat: String(p.lat), lng: String(p.lng) });
const at = (iso) => Date.parse(iso);
const DATES = ["2026-12-26", "2026-12-27", "2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01"];
const mk = (over = {}) => ({
  status: "ready",
  trip: { start: "2026-12-26", end: "2027-01-01", tz: TZ },
  days: DATES.map((date) => ({ date })),
  stops: [
    { id: "A", date: "2026-12-28", time: "10:00", title: "Stop A", travelMin: 20 },
    { id: "B", date: "2026-12-28", time: "14:30", title: "Stop B", travelMin: 25, ...txt(off(P, -805, 0)) },
    { id: "C", date: "2026-12-28", time: "19:30", title: "Stop C", travelMin: 0 },
    { id: "L", date: "2026-12-28", time: "", title: "Loose", travelMin: 0 },
  ],
  ...over,
});
const day = (t) => at("2026-12-28T" + t + ":00-06:00");
const here = { ...P, at: 0, accuracy: 30 };
const FROM = { blocks: 4, dir: "S", miles: "0.5 mi", min: 12, dist: "0.5 mi · 12 min walk" };

test("before the trip: days to go", () => {
  assert.deepEqual(boardFor(mk(), at("2026-11-19T12:00:00-06:00"), here), { kind: "before", small: "First day · Sat Dec 26", big: "37 days to go" });
  assert.equal(boardFor(mk(), at("2026-12-25T12:00:00-06:00")).big, "1 day to go");
});

test("a trip day, no position", () => {
  const rows = [
    ["08:00", "A", "10:00", "hon", ["Leave by", "09:40"], ["In", "1 h 40 min"]],
    ["09:45", "A", "10:00", "tow", ["By 09:40", "Leave now"], null],
    ["10:10", "A", "10:00", "hon", ["On", "Now"], null],
    ["10:31", "B", "14:30", "hon", ["Leave by", "14:05"], ["In", "3 h 34 min"]],
    ["13:52", "B", "14:30", "hon", ["Leave by", "14:05"], ["In", "13 min"]],
    ["15:00", "C", "19:30", "hon", ["Starts in", "4 h 30 min"], null],
  ];
  for (const [clk, name, time, tone, l, r] of rows) {
    const m = boardFor(mk(), day(clk), null);
    assert.equal(m.kind, "trip");
    assert.equal(m.name, "Stop " + name, clk);
    assert.equal(m.time, time);
    assert.equal(m.tone, tone, clk);
    assert.deepEqual(m.l, { small: l[0], big: l[1] }, clk);
    assert.deepEqual(m.r, r && { small: r[0], big: r[1] }, clk);
    assert.equal(m.from, null);
  }
});

test("a trip day, with a position", () => {
  const rows = [
    ["13:52", "hon", ["Leave by", "14:18"], ["In", "26 min"], FROM],
    ["14:15", "tow", ["By 14:18", "Leave now"], ["To spare", "3 min"], FROM],
    ["14:18", "tow", ["By 14:18", "Leave now"], null, FROM],
    ["14:24", "red", ["About", "6 min late"], ["Leave", "Now"], FROM],
    ["14:30", "hon", ["On", "Now"], null, null],
  ];
  for (const [clk, tone, l, r, from] of rows) {
    const m = boardFor(mk(), day(clk), here);
    assert.equal(m.name, "Stop B", clk);
    assert.equal(m.tone, tone, clk);
    assert.deepEqual(m.l, { small: l[0], big: l[1] }, clk);
    assert.deepEqual(m.r, r && { small: r[0], big: r[1] }, clk);
    assert.deepEqual(m.from, from, clk);
  }
  // 1,620 m away: today's words, no sign.
  const m = boardFor(mk(), day("13:52"), off(P, 815, 0));
  assert.deepEqual(m.l, { small: "Leave by", big: "14:05" });
  assert.equal(m.from, null);
});

test("no board", () => {
  assert.equal(boardFor(mk(), day("20:00"), here), null, "no timed stop left");
  assert.equal(boardFor(mk(), at("2027-01-02T12:00:00-06:00"), here), null, "the trip is over");
  assert.equal(boardFor(mk({ days: DATES.slice(0, 2).map((date) => ({ date })) }), day("08:00"), here), null, "a day with no check");
  assert.equal(boardFor(mk({ status: "loading" }), day("08:00"), here), null);
  assert.equal(boardFor(null, day("08:00")), null);
  assert.equal(boardFor(mk({ trip: null }), day("08:00")), null);
});

test("a name is trimmed, and a blank one reads Next stop", () => {
  assert.equal(boardFor(mk({ stops: [{ id: "A", date: "2026-12-28", time: "10:00", title: "  ", travelMin: 0 }] }), day("08:00")).name, "Next stop");
});

test("closed until the trip's date changes", () => {
  assert.equal(BOARD_KEY, "chi.board");
  const now = day("08:00");
  assert.equal(closedDate(TZ, now), "2026-12-28");
  assert.equal(isClosed("2026-12-28", TZ, now), true);
  assert.equal(isClosed("2026-12-27", TZ, now), false);
  assert.equal(isClosed(null, TZ, now), false);
  assert.equal(isClosed(20261228, TZ, now), false);
});

test("the trip over: no board, even when a check is there for the day", () => {
  const late = mk({
    days: DATES.concat("2027-01-02").map((date) => ({ date })),
    stops: [{ id: "Z", date: "2027-01-02", time: "18:00", title: "Stop Z", travelMin: 0 }],
  });
  assert.equal(boardFor(late, at("2027-01-02T12:00:00-06:00"), null), null);
  // The same day inside the trip has a board, so the rule above is the trip's end.
  assert.equal(boardFor({ ...late, trip: { ...late.trip, end: "2027-01-02" } }, at("2027-01-02T12:00:00-06:00"), null).name, "Stop Z");
});
