// The trip's fixed facts: one place on the phone (js/trip.js), the same values
// at the top of backend/Pure.js, and a Trip tab that must agree with them.

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import * as T from "../js/trip.js";

const require = createRequire(import.meta.url);
const P = require("../backend/Pure.js");

test("the phone and the backend hold the same trip facts", () => {
  assert.equal(P.TRIP_TZ_, T.TRIP_TZ);
  assert.equal(P.TRIP_UTC_OFFSET_MS_, T.TRIP_UTC_OFFSET_MS);
  assert.equal(P.TRIP_ZONE_WORD_, T.TRIP_ZONE_WORD);
  assert.equal(P.HOME_CURRENCY_, T.HOME_CURRENCY);
  assert.equal(P.TRIP_CURRENCY_, T.TRIP_CURRENCY);
  assert.equal(P.TRIP_FIRST_DAY_, T.TRIP_FIRST_DAY);
  assert.equal(P.TRIP_LAST_DAY_, T.TRIP_LAST_DAY);
});

test("the trip is Chicago, Dec 26 2026 to Jan 1 2027, paid in US dollars and settled in Canadian", () => {
  assert.equal(T.TRIP_TZ, "America/Chicago");
  assert.equal(T.TRIP_FIRST_DAY, "2026-12-26");
  assert.equal(T.TRIP_LAST_DAY, "2027-01-01");
  assert.equal(T.HOME_CURRENCY, "CAD");
  assert.equal(T.TRIP_CURRENCY, "USD");
  assert.equal(T.TRIP_SIGN, "US$");
  assert.equal(T.HOME_SIGN, "$");
});

// The zone's offset from UTC at an instant, in ms, as Intl knows it.
function offsetAt(tz, ms) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(ms));
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - Math.floor(ms / 1000) * 1000;
}

test("the fixed offset holds for every hour of the trip, and the stamp window after it (no clock change)", () => {
  // From 00:00 on the first day to 03:00 after the last (the last stamp's window).
  const from = Date.parse(T.TRIP_FIRST_DAY + "T00:00:00Z") - T.TRIP_UTC_OFFSET_MS;
  const to = Date.parse(T.TRIP_LAST_DAY + "T00:00:00Z") - T.TRIP_UTC_OFFSET_MS + 27 * 3600000;
  for (let ms = from; ms <= to; ms += 3600000) {
    assert.equal(offsetAt(T.TRIP_TZ, ms), T.TRIP_UTC_OFFSET_MS, new Date(ms).toISOString());
  }
});

test("tripMismatch: a Trip tab that agrees (or leaves a cell empty) passes; any other zone or currency is named", () => {
  assert.equal(P.tripMismatch({ tz: "America/Chicago", home: "CAD", currency: "USD", name: "anything" }), null);
  assert.equal(P.tripMismatch({}), null);
  assert.equal(P.tripMismatch({ tz: " America/Chicago ", home: "", currency: "USD" }), null);
  const m = P.tripMismatch({ tz: "Asia/Tokyo", home: "CAD", currency: "JPY" });
  assert.equal(m, "The Trip tab doesn’t match this app (tz is Asia/Tokyo, not America/Chicago; currency is JPY, not USD). This app’s zone and currencies are fixed in its code: put the Trip tab back as it was.");
  assert.match(P.tripMismatch({ home: "USD" }), /home is USD, not CAD/);
});

test("the seed's Trip tab agrees with the app", () => {
  const trip = Object.fromEntries(P.setupSeedRows().Trip.map((r) => [r.key, r.value]));
  assert.equal(P.tripMismatch(trip), null);
  assert.equal(trip.tz, T.TRIP_TZ);
  assert.equal(trip.home, T.HOME_CURRENCY);
  assert.equal(trip.currency, T.TRIP_CURRENCY);
});
