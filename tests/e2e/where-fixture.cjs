// A made-up day for the location screens' tests (not a test itself: run.cjs
// only runs *.e2e.cjs). Every name and place here is invented; the places are
// metres from P, a spot no stop of the trip uses.
//
// 13:20 is not the clock here: callers pass nowMs. The day is Mon Dec 28:
//   A  10:00  Pier stop    20 travel minutes, at P north 100 m
//   B  14:30  Corner stop  25 travel minutes, 805 m south of P (0.5 mi, 4 blocks, 12 min)
//   C  19:30  Harbor stop  no travel minutes, 3 km east of P
//   three loose stops: Loose one 320 m east, Loose two 160 m north, Loose three 600 m north and 200 m west
//   and Unmapped stop, loose, with no coordinates.
// The stay, Test lodge, is 2,250 m north of P (1.4 mi, 11 blocks); the day itself is at P.

const { SEED, makeBackend } = require("./helpers.cjs");

const P = { lat: 41.9, lng: -87.7 };
const DEG = (6371008.8 * Math.PI) / 180;
const off = (base, north, east) => ({
  lat: +(base.lat + north / DEG).toFixed(6),
  lng: +(base.lng + east / (DEG * Math.cos((base.lat * Math.PI) / 180))).toFixed(6),
});
const D28 = "2026-12-28";
const ID = { A: "wherestop01", B: "wherestop02", C: "wherestop03", L1: "wherestop04", L2: "wherestop05", L3: "wherestop06", NONE: "wherestop07" };
const AT = {
  [ID.A]: off(P, 100, 0),
  [ID.B]: off(P, -805, 0),
  [ID.C]: off(P, 0, 3000),
  [ID.L1]: off(P, 0, 320),
  [ID.L2]: off(P, 160, 0),
  [ID.L3]: off(P, 600, -200),
};
const STAY = "wherestay01";
const STAY_AT = off(P, 2250, 0);

const STOPS = [
  { id: ID.A, date: D28, time: "10:00", title: "Pier stop", travelMin: 20 },
  { id: ID.B, date: D28, time: "14:30", title: "Corner stop", travelMin: 25 },
  { id: ID.C, date: D28, time: "19:30", title: "Harbor stop" },
  { id: ID.L1, date: D28, time: "", title: "Loose one" },
  { id: ID.L2, date: D28, time: "", title: "Loose two" },
  { id: ID.L3, date: D28, time: "", title: "Loose three" },
  { id: ID.NONE, date: D28, time: "", title: "Unmapped stop" },
];
const SEED_WHERE = {
  ...SEED,
  days: { [D28]: { city: "Chicago", title: "Test day" } },
  stops: STOPS,
  stays: [{ id: STAY, name: "Test lodge", firstNight: "2026-12-26", lastNight: "2026-12-28" }],
};

const clock = (t) => Date.parse("2026-12-28T" + t + ":00-06:00");

// A backend over the made-up day. coords: false leaves every place without
// coordinates (a Sheet before migrate).
function whereBackend({ nowMs = clock("08:00"), coords = true, seed = SEED_WHERE } = {}) {
  const backend = makeBackend(seed, { now: nowMs });
  if (coords) {
    for (const r of backend.fake.tables.Stops) if (AT[r.id]) Object.assign(r, { lat: String(AT[r.id].lat), lng: String(AT[r.id].lng) });
    for (const r of backend.fake.tables.Stays) if (r.id === STAY) Object.assign(r, { lat: String(STAY_AT.lat), lng: String(STAY_AT.lng) });
    for (const r of backend.fake.tables.Days) if (r.date === D28) Object.assign(r, { lat: String(P.lat), lng: String(P.lng) });
  }
  return backend;
}

module.exports = { P, off, ID, AT, STAY, STAY_AT, D28, SEED_WHERE, whereBackend, clock };
