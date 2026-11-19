/* Copyright (c) 2026 moissmart1. All rights reserved. No licence is granted: do not copy, adapt or reuse this code or design, and do not use it to train or prompt an AI system to reproduce it. See LICENSE. */
// The board at the top of Days: what it says, and when it is closed. Pure: no
// DOM, no storage, no clock of its own (callers pass the instant). It reads
// only what the phone already holds (the store's state and, when there is
// one, where the phone is); nothing is asked of the backend.
//
// boardFor(state, nowMs, here) -> null, or one of
//   { kind: "before", small: "First day · Sat Dec 26", big: "37 days to go" }
//   { kind: "trip", name, time, tone: "hon" | "tow" | "red", l: { small, big }, r: { small, big } | null, from }
// - before the trip: the days to go.
// - on a trip day: today's next stop (plan.js nextStopId) and its leave line,
//   from where the phone is when that is usable, else from the plan's own
//   minutes. No timed stop still to come, a day the trip has no check for, or
//   the trip over: no board.
// - anything not ready (no trip, still loading): no board.
// `from` is the sign's reading ({ blocks, dir, miles, min, dist }) or null.
//
// A closed board stays closed for the rest of that day in the trip's zone and
// is there again the next: the only thing kept is the date it was closed on.

import { dateIn } from "./time.js";
import { STORAGE_PREFIX } from "./config.js";
import { dayHead } from "./format.js";
import { nowIn, daysToGo, stopsFor, nextStopId, hereLine, planLeave, span } from "./plan.js";

const str = (v) => (typeof v === "string" ? v.trim() : "");

export function boardFor(s, nowMs, here = null) {
  if (!s || s.status !== "ready" || !s.trip || !s.trip.start) return null;
  const tz = s.trip.tz || "America/Chicago";
  const toGo = daysToGo({ ...s.trip, tz }, nowMs);
  if (toGo > 0) {
    return { kind: "before", small: "First day · " + dayHead(s.trip.start).en, big: toGo + (toGo === 1 ? " day to go" : " days to go") };
  }
  const now = nowIn(tz, nowMs);
  if (s.trip.end && now.date > s.trip.end) return null;
  const days = Array.isArray(s.days) ? s.days : [];
  if (!days.some((d) => d && d.date === now.date)) return null;
  const stops = (Array.isArray(s.stops) ? s.stops : []).filter((x) => x && typeof x.id === "string" && x.id && typeof x.date === "string");
  const day = stopsFor(stops, now.date);
  const id = nextStopId(day, now.minutes);
  const stop = id ? day.find((x) => x.id === id) : null;
  if (!stop) return null;
  const h = here ? hereLine(stop, now.minutes, here) : null;
  const model = { kind: "trip", name: str(stop.title) || "Next stop", time: stop.time, tone: "hon", l: null, r: null, from: h ? h.from : null };
  if (h) {
    if (h.tone === "ok") Object.assign(model, { tone: "hon", l: { small: "Leave by", big: h.leaveBy }, r: { small: "In", big: span(h.spare) } });
    else if (h.tone === "near") Object.assign(model, { tone: "tow", l: { small: "By " + h.leaveBy, big: "Leave now" }, r: h.spare > 0 ? { small: "To spare", big: h.spare + " min" } : null });
    else Object.assign(model, { tone: "red", l: { small: "About", big: span(-h.spare) + " late" }, r: { small: "Leave", big: "Now" } });
    return model;
  }
  const p = planLeave(stop, now.minutes);
  if (p.kind === "leave") Object.assign(model, { tone: "hon", l: { small: "Leave by", big: p.leaveBy }, r: { small: "In", big: p.in } });
  else if (p.kind === "go") Object.assign(model, { tone: "tow", l: { small: "By " + p.leaveBy, big: "Leave now" } });
  else if (p.kind === "next") Object.assign(model, { tone: "hon", l: { small: "Starts in", big: p.in } });
  else Object.assign(model, { tone: "hon", l: { small: "On", big: "Now" } });
  return model;
}

// ---- closed until tomorrow ----

export const BOARD_KEY = STORAGE_PREFIX + "board"; // holds only the date the board was closed on

// What to keep when the board is closed now: the date in the trip's zone.
export const closedDate = (tz, nowMs) => dateIn(tz || "America/Chicago", nowMs);

// Whether what was kept says the board is closed now.
export const isClosed = (kept, tz, nowMs) => typeof kept === "string" && kept === closedDate(tz, nowMs);
