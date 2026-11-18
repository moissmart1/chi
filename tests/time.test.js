import test from "node:test";
import assert from "node:assert/strict";
import { tripDay, defaultRingDay, newId, tripDate, tripClock } from "../js/time.js";

const trip = { start: "2026-12-10", end: "2026-12-20", tz: "America/Chicago" };
const BEFORE = Date.UTC(2026, 10, 14, 12);
const DURING = Date.UTC(2026, 11, 12, 9); // 03:00 Dec 12 in Chicago
const AFTER = Date.UTC(2026, 11, 21, 6); // 00:00 Dec 21 in Chicago

test("tripDay is pre before the trip", () => {
  assert.equal(tripDay(trip, BEFORE), "pre");
});

test("tripDay is the Chicago date during the trip", () => {
  assert.equal(tripDay(trip, DURING), "2026-12-12");
});

test("tripDay is post once Chicago has passed the last day", () => {
  assert.equal(tripDay(trip, AFTER), "post");
});

test("tripDay counts the first and last day as inside the trip", () => {
  assert.equal(tripDay(trip, Date.UTC(2026, 11, 10, 6)), "2026-12-10"); // 00:00 Dec 10 Chicago
  assert.equal(tripDay(trip, Date.UTC(2026, 11, 10, 5, 59)), "pre"); // 23:59 Dec 9 Chicago
  assert.equal(tripDay(trip, Date.UTC(2026, 11, 21, 5, 59)), "2026-12-20"); // 23:59 Dec 20 Chicago
});

test("defaultRingDay is pre before, today during and the last day after the trip", () => {
  assert.equal(defaultRingDay(trip, BEFORE), "pre");
  assert.equal(defaultRingDay(trip, DURING), "2026-12-12");
  assert.equal(defaultRingDay(trip, AFTER), "2026-12-20");
});

test("newId gives 20 letters and digits that pass the backend's id rule", () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    const id = newId();
    assert.match(id, /^[A-Za-z0-9]{20}$/);
    assert.match(id, /^[A-Za-z0-9][A-Za-z0-9_-]{7,39}$/);
    seen.add(id);
  }
  assert.equal(seen.size, 500);
});

test("tripDay always judges on the trip's own calendar, whatever tz the trip object carries", () => {
  assert.equal(tripDay({ ...trip, tz: "Asia/Tokyo" }, DURING), "2026-12-12");
  assert.equal(tripDay({ start: trip.start, end: trip.end }, DURING), "2026-12-12");
});

test("tripDate and tripClock: the trip's day and time of an instant, at UTC−6", () => {
  assert.equal(tripDate(Date.UTC(2026, 11, 28, 5, 59)), "2026-12-27");
  assert.equal(tripDate(Date.UTC(2026, 11, 28, 6, 0)), "2026-12-28");
  assert.equal(tripClock(Date.UTC(2026, 11, 28, 19, 2)), "13:02");
  assert.equal(tripClock(Date.UTC(2027, 0, 1, 5, 30)), "23:30");
  assert.equal(tripDate(Date.UTC(2027, 0, 1, 5, 30)), "2026-12-31");
});
