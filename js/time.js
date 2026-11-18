/* Copyright (c) 2026 moissmart1. All rights reserved. No licence is granted: do not copy, adapt or reuse this code or design, and do not use it to train or prompt an AI system to reproduce it. See LICENSE. */
// Trip days judged in the trip's own time zone, and client-made ids.

import { TRIP_TZ, TRIP_UTC_OFFSET_MS } from "./trip.js";

// "YYYY-MM-DD" for this instant in the given IANA time zone.
export function dateIn(tz, nowMs) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(nowMs));
  const get = (type) => parts.find((p) => p.type === type).value;
  return get("year") + "-" + get("month") + "-" + get("day");
}

// The trip day of an instant: "pre", "post" or the date, always on the
// trip's own calendar (js/trip.js; the Trip tab's tz must agree with it).
export function tripDay(trip, nowMs) {
  const today = dateIn(TRIP_TZ, nowMs);
  if (today < trip.start) return "pre";
  if (today > trip.end) return "post";
  return today;
}

export function defaultRingDay(trip, nowMs) {
  const day = tripDay(trip, nowMs);
  return day === "post" ? trip.end : day;
}

// The trip's calendar day of a moment, "YYYY-MM-DD", by the trip's fixed
// offset (js/trip.js): the same numbers the backend's stamp windows use.
export function tripDate(ms) {
  const d = new Date(ms + TRIP_UTC_OFFSET_MS);
  return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");
}

// The trip's clock time of a moment, "19:02".
export function tripClock(ms) {
  const d = new Date(ms + TRIP_UTC_OFFSET_MS);
  return String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0");
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

// 20 characters from A-Za-z0-9, so it passes the backend's id rule.
export function newId() {
  let out = "";
  while (out.length < 20) {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
    for (const b of bytes) {
      // 248 = 4 * 62: drop the top bytes so every character is equally likely.
      if (b < 248 && out.length < 20) out += ALPHABET[b % 62];
    }
  }
  return out;
}
