/* Copyright (c) 2026 moissmart1. All rights reserved. No licence is granted: do not copy, adapt or reuse this code or design, and do not use it to train or prompt an AI system to reproduce it. See LICENSE. */
// The day logic for the Days screen. Pure: no DOM, no storage, no clock of
// its own (callers pass the instant). Every field of a stop, stay or day may
// be missing or blank, because a person can type into the Sheet by hand.

import { dateIn } from "./time.js";
import { tripCents } from "./money.js";
import { MILE_M, metres, gridMetres, blocksOf, compass, milesText, walkMinutes } from "./geo.js";

const str = (v) => (typeof v === "string" ? v.trim() : "");

// "14:05" -> 845; anything that is not HH:MM (24 h) -> null.
export function minutesOf(time) {
  const m = /^(\d{2}):(\d{2})$/.exec(typeof time === "string" ? time : "");
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h > 23 || min > 59 ? null : h * 60 + min;
}

// The wall-clock fields of an instant in a zone.
function wall(tz, nowMs) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(nowMs));
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return { y: get("year"), mo: get("month"), d: get("day"), h: get("hour") % 24, mi: get("minute"), s: get("second") };
}

// { date, minutes }: the zone's date and minutes past midnight at this instant.
export function nowIn(tz, nowMs) {
  const w = wall(tz, nowMs);
  return { date: dateIn(tz, nowMs), minutes: w.h * 60 + w.mi };
}

// The ms instant at which the zone's wall clock reads `date` + `minutes`.
export function instantOf(tz, date, minutes) {
  const [y, mo, d] = date.split("-").map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, 0, minutes);
  const offsetAt = (ms) => {
    const w = wall(tz, ms);
    return Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s) - Math.floor(ms / 1000) * 1000;
  };
  let guess = asUtc - offsetAt(asUtc);
  guess = asUtc - offsetAt(guess); // once more, in case the zone changed offset between the two
  return guess;
}

export function openDayIndex(trip, days, nowMs) {
  const last = Math.max(0, days.length - 1);
  const today = dateIn(trip.tz, nowMs);
  if (today < trip.start) return 0;
  if (today > trip.end) return last;
  const exact = days.findIndex((d) => d.date === today);
  if (exact >= 0) return exact;
  let found = 0;
  days.forEach((d, i) => { if (d.date < today) found = i; });
  return found;
}

export function dayState(date, today) {
  return date < today ? "used" : date === today ? "today" : "ahead";
}

const dayNumber = (date) => {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};

export function daysToGo(trip, nowMs) {
  return Math.max(0, dayNumber(trip.start) - dayNumber(dateIn(trip.tz, nowMs)));
}

export function stopsFor(stops, date) {
  const mine = stops.filter((s) => s.date === date && !s.deleted);
  const timed = mine.filter((s) => minutesOf(s.time) !== null).sort((a, b) => minutesOf(a.time) - minutesOf(b.time));
  return timed.concat(mine.filter((s) => minutesOf(s.time) === null));
}

// A stop that has started stays the day's next stop for this long (R38).
export const NEXT_GRACE_MIN = 30;

// Whole minutes to get to a stop, even from an old cache made before the
// backend rounded them; 0 when there are none.
const travelOf = (stop) => {
  const raw = Number(stop.travelMin);
  return isFinite(raw) && raw > 0 ? Math.round(raw) : 0;
};

// The day's next stop: the first timed stop still to come, or one that has
// started and is still in its grace (R38): NEXT_GRACE_MIN minutes after its
// time, or until it is time to leave for the following timed stop, whichever
// comes first. `dayStops` in stopsFor order.
export function nextStopId(dayStops, minutes) {
  const timed = dayStops.filter((x) => minutesOf(x.time) !== null);
  const s = timed.find((x, i) => {
    const m = minutesOf(x.time);
    if (m > minutes) return true;
    const after = timed[i + 1];
    const leave = after ? minutesOf(after.time) - travelOf(after) : Infinity;
    return minutes < Math.min(m + NEXT_GRACE_MIN, leave);
  });
  return s ? s.id : null;
}

// A timed stop whose time has gone, unless it is still the next stop (R38).
export function isPast(stop, minutes, nextId = null) {
  const m = minutesOf(stop.time);
  return m !== null && m < minutes && stop.id !== nextId;
}

export const span = (n) => {
  if (n < 60) return n + " min";
  const h = Math.floor(n / 60);
  const r = n % 60;
  return r ? h + " h " + r + " min" : h + " h";
};
export const clock = (n) => String(Math.floor(n / 60)).padStart(2, "0") + ":" + String(n % 60).padStart(2, "0");

export function nextLine(stop, minutes) {
  const at = minutesOf(stop.time);
  if (at === null) return "";
  // Started and still next (R38): no countdown.
  if (minutes >= at) return "Now.";
  const travel = travelOf(stop);
  if (travel > 0) {
    const leave = Math.max(0, at - travel);
    return minutes >= leave ? "Leave now." : "Leave by " + clock(leave) + ", in " + span(leave - minutes) + ".";
  }
  return "Next, in " + span(at - minutes) + ".";
}

// ---- where you are (js/where.js gives the position; it never leaves the phone) ----
// Distances are along the city's grid (north-south plus east-west), eight
// blocks to a mile, walked at 70 m a minute.

export const LEAVE_M = MILE_M; // leave-by from where you are: up to a mile along the grid
export const NEAR_M = 3000; // a loose stop's distance: up to 3,000 m along the grid
export const STAY_FAR_M = 50000; // the hotel card: up to 50 km along the grid
export const PLACE_M = MILE_M; // the stamp: within a mile, straight line

// What the sign and the words beside it say for one place, or null (no position, no coordinates).
// -> { m, blocks, dir, miles, min, dist }
//    m: grid metres. blocks: 0..16, or null past 16. dir: "N" | "S" | "E" | "W" | "".
export function fromHere(here, place) {
  if (!here || !place) return null;
  const m = gridMetres(here, place);
  if (!Number.isFinite(m)) return null;
  const b = blocksOf(m);
  const min = walkMinutes(m);
  return { m, blocks: b > 16 ? null : b, dir: compass(here, place), miles: milesText(m), min, dist: milesText(m) + " · " + min + " min walk" };
}

// The answers carry `from` without its raw metres: a redraw is never forced by
// a metre and no raw distance sits in a redraw key.
const bare = (from) => {
  const { m, ...rest } = from;
  return rest;
};

// Leave by, from where you are: null when today's line stands (no time,
// already started, no coordinates, no usable position, or over a mile).
// `here`: a usable position (js/where.js current()), or null.
export function hereLine(stop, minutes, here) {
  const at = minutesOf(stop && stop.time);
  if (at === null || !here || minutes >= at) return null;
  const f = fromHere(here, stop);
  if (!f || f.m > LEAVE_M) return null;
  const from = bare(f);
  const walk = f.min;
  const spare = at - walk - minutes;
  const base = { from, dist: from.dist, leaveBy: clock(at - walk), spare };
  if (spare > 5) return { ...base, lead: "Leave by " + clock(at - walk) + ", in " + span(spare) + ".", late: false, tone: "ok" };
  if (spare > 0) return { ...base, lead: "Leave now. " + spare + " min to spare.", late: false, tone: "near" };
  if (spare === 0) return { ...base, lead: "Leave now.", late: false, tone: "near" };
  return { ...base, lead: "About " + span(-spare) + " late. Leave now.", late: true, tone: "late" };
}

// A loose day: each stop with no time and coordinates within NEAR_M gets its
// distance; the nearest is marked (near: true) when two or more have one.
// The order never changes. -> { [id]: { from, dist, near } }
export function nearStops(dayStops, here) {
  const out = {};
  if (!here) return out;
  const ms = {};
  let best = null;
  for (const s of dayStops || []) {
    if (!s || s.deleted || minutesOf(s.time) !== null) continue;
    const f = fromHere(here, s);
    if (!f || f.m > NEAR_M) continue;
    ms[s.id] = f.m;
    out[s.id] = { from: bare(f), dist: f.dist, near: false };
    if (best === null || f.m < ms[best]) best = s.id;
  }
  if (Object.keys(out).length > 1) out[best].near = true;
  return out;
}

// For the hotel card: null, or { from, text: "1.4 mi from here" }.
export function stayDistance(stay, here) {
  if (!here || !stay) return null;
  const f = fromHere(here, stay);
  return f && f.m <= STAY_FAR_M ? { from: bare(f), text: f.miles + " from here" } : null;
}

// Whether a stamp for this day is pressed in the place: a usable position
// within PLACE_M (straight line) of the day's coordinates or of one of the
// day's stops that has coordinates.
export function inPlace(day, stops, here) {
  if (!here || !day) return false;
  const near = (x) => Number.isFinite(metres(here, x)) && metres(here, x) <= PLACE_M;
  if (near(day)) return true;
  return (stops || []).some((s) => s && !s.deleted && s.date === day.date && near(s));
}

// The board's reading of the same four cases nextLine decides, as values.
export function planLeave(stop, minutes) {
  const at = minutesOf(stop && stop.time);
  if (at === null) return null;
  if (minutes >= at) return { kind: "now" };
  const travel = travelOf(stop);
  if (travel > 0) {
    const leave = Math.max(0, at - travel);
    return minutes >= leave ? { kind: "go", leaveBy: clock(leave) } : { kind: "leave", leaveBy: clock(leave), in: span(leave - minutes) };
  }
  return { kind: "next", in: span(at - minutes) };
}

export function stayFor(stays, date) {
  let best = null;
  for (const s of stays) {
    if (s.deleted || !s.firstNight || !s.lastNight) continue;
    if (s.firstNight <= date && date <= s.lastNight && (!best || s.firstNight < best.firstNight)) best = s;
  }
  return best;
}

// The night ends at 04:00 in the trip's zone (R37).
export const NIGHT_ENDS_MIN = 240;

// The stay a ticket shows: the night's stay (stayFor), except on today's
// ticket before NIGHT_ENDS_MIN, when it is the stay of the night just begun
// (last night's) if there is one and it differs from tonight's (R37).
// `today` and `minutes`: the Days clock in the trip's zone.
export function stayShownFor(stays, date, { today, minutes } = {}) {
  const tonight = stayFor(stays, date);
  if (date !== today || !(minutes < NIGHT_ENDS_MIN)) return tonight;
  const last = stayFor(stays, dayBefore(date));
  return last && last !== tonight ? last : tonight;
}

export function safeHref(v) {
  return typeof v === "string" && /^https?:\/\/\S+$/i.test(v) ? v : "";
}

const dayBefore = (date) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
};

// Directions: no starting point is given, so Maps starts from the phone's own position.
export function mapsUrl(stop) {
  const link = safeHref(stop.place);
  if (link) return link;
  const dest = str(stop.place) || str(stop.title);
  if (!dest) return "";
  return "https://www.google.com/maps/dir/?api=1&travelmode=transit&destination=" + encodeURIComponent(dest);
}

export function stayMapsUrl(stay) {
  const link = safeHref(stay.place);
  if (link) return link;
  const q = str(stay.place) || str(stay.addressJp) || str(stay.name);
  return q ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q) : "";
}

export function inkFor(hex) {
  if (typeof hex !== "string" || !/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  const lin = (i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const lum = 0.2126 * lin(1) + 0.7152 * lin(3) + 0.0722 * lin(5);
  return lum > 0.4 ? "#15120F" : "#FFFFFF";
}

export function header(day) {
  const d = day || {};
  const jp = str(d.lineJp);
  const en = str(d.lineEn);
  const ink = inkFor(d.lineColour);
  const fromJp = str(d.fromJp), fromEn = str(d.fromEn), toJp = str(d.toJp), toEn = str(d.toEn);
  return {
    line: jp || en ? { jp, en } : null,
    colour: ink ? d.lineColour : null,
    ink,
    route: (fromJp || fromEn) && (toJp || toEn) ? { fromJp, fromEn, toJp, toEn } : null,
    city: str(d.city),
    title: str(d.title),
  };
}

// The day's logged spending in the trip's currency, in cents.
export function dayTotalTrip(expenses, date) {
  let sum = 0;
  for (const e of expenses) {
    if (e.day !== date || e.deleted) continue;
    const v = tripCents(e);
    if (Number.isFinite(v)) sum += v;
  }
  return sum;
}

export function gateDate(date) {
  return date.slice(5).replace("-", ".");
}

// The guest check's date box: "12/28", "1/1".
export function checkDate(date) {
  return Number(date.slice(5, 7)) + "/" + Number(date.slice(8, 10));
}

// The check's tear-off stub: "Guest receipt · 12/28".
export function issueLine(date) {
  return "Guest receipt · " + checkDate(date);
}
