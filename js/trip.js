/* Copyright (c) 2026 moissmart1. All rights reserved. No licence is granted: do not copy, adapt or reuse this code or design, and do not use it to train or prompt an AI system to reproduce it. See LICENSE. */
// The trip's fixed facts, in one place. The backend keeps the same values at
// the top of backend/Pure.js (tests/trip.test.js fails when the two differ).
// The Sheet's Trip tab has tz, home and currency too; they are data that must
// agree with these, never a way to change them: the backend refuses to load a
// Sheet that says otherwise.

// The trip's own clock: every "today", day boundary, countdown, leave-by and
// stamp window is judged here, whatever zone the phone is in.
export const TRIP_TZ = "America/Chicago";
// Chicago is UTC−6 for the whole trip (no clock change between Dec 26 and
// Jan 1). The stamp windows use this fixed offset, the same on the phone and
// the backend; tests/trip.test.js fails if the trip's dates ever cross a
// clock change.
export const TRIP_UTC_OFFSET_MS = -6 * 3600000;
// How the zone is named on screen: "Chicago time".
export const TRIP_ZONE_WORD = "Chicago time";

// Money: what people are paid back in (home) and what is spent on the trip.
export const HOME_CURRENCY = "CAD";
export const TRIP_CURRENCY = "USD";
// How each is printed in front of a figure. A trip amount is never a bare $.
export const HOME_SIGN = "$";
export const TRIP_SIGN = "US$";
// Minor units in one unit of each (cents).
export const HOME_MINOR = 100;
export const TRIP_MINOR = 100;

// The trip's first and last day (for the seed and the tests; the Trip tab's
// start and end are what the app reads).
export const TRIP_FIRST_DAY = "2026-12-26";
export const TRIP_LAST_DAY = "2027-01-01";
