/* Copyright (c) 2026 moissmart1. All rights reserved. No licence is granted: do not copy, adapt or reuse this code or design, and do not use it to train or prompt an AI system to reproduce it. See LICENSE. */
// "Before we go", look K ("the rail"): the rules the screens draw from. What
// is still to book hangs from the kitchen's ticket rail as an order slip;
// booked, it goes on the spike. Pure: no DOM, no storage, no clock of its own
// (callers pass the instant). The due lines and the order of the items are in
// js/todos.js; this file is only the words and numbers of the rail.

import { localDay as phoneDay } from "./format.js";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const NAME_MAX = 6;
const str = (v) => (typeof v === "string" ? v.trim() : "");

// "#7": the planner's own number when the id is one to three digits, else the
// slip's place on the rail.
export function slipNo(id, position) {
  const s = String(id === undefined || id === null ? "" : id).trim();
  return /^\d{1,3}$/.test(s) ? "#" + Number(s) : "#" + (position + 1);
}

// The colour of the slip: pink to decide, white while pending, yellow otherwise.
export function slipTone(status) {
  const s = str(status);
  if (/^decide/i.test(s)) return "pink";
  if (/^pending/i.test(s)) return "white";
  return "";
}

// The status as printed, or "To book" when the planner says nothing.
export function statusWord(status) {
  return str(status) || "To book";
}

// How far a slip hangs off the straight, in degrees: -1.0 to 1.0 in tenths,
// the same for an id every time (FNV-1a of the id).
export function slipTilt(id) {
  let h = 2166136261;
  for (const c of String(id === undefined || id === null ? "" : id)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return ((h >>> 0) % 21 - 10) / 10;
}

// What the time clock prints on a spiked slip: { big, small }. A tick made in
// the app: "DEC 01 IZZAH" (the day on the phone's own calendar, the name in
// capitals cut to six letters; the name alone when the time cannot be read).
// Booked in the planner by hand: "PLANNER". `at` ("14:07") goes between the
// day and the name, for the slip as it is printed.
export function printText(t, dayOf = phoneDay, at = "") {
  const name = str(t && t.tickedBy).toUpperCase().slice(0, NAME_MAX);
  if (!name) return { big: "BOOKED", small: "PLANNER" };
  const ms = Date.parse(str(t.tickedAt));
  const day = isFinite(ms) ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayOf(ms)) : null;
  const when = day && MONTHS[Number(day[2]) - 1] ? MONTHS[Number(day[2]) - 1] + " " + day[3] : "";
  return { big: "BOOKED", small: [when, at, name].filter(Boolean).join(" ") };
}

// "6 on the rail · 25 days to go"; the days part only while there are days.
export function railWords(open, daysToGo) {
  const days = Number.isFinite(daysToGo) && daysToGo > 0 ? daysToGo + (daysToGo === 1 ? " day to go" : " days to go") : "";
  const rail = open > 0 ? open + " on the rail" : "";
  return [rail, days].filter(Boolean).join(" · ");
}

// Nothing left to book: the headline and what is on the spike.
export function emptyWords(done) {
  return { h: "Nothing left to book.", s: done === 1 ? "It’s on the spike." : done > 1 ? "All " + done + " are on the spike." : "" };
}

// The spike's slips: every one when there are three or fewer or `all`; else
// the newest three and how many lie under them.
export function spikeShown(done, all) {
  const list = Array.isArray(done) ? done : [];
  if (list.length <= 3 || all) return { list, more: 0 };
  return { list: list.slice(0, 3), more: list.length - 3 };
}

// The pill in Money.
export function lookWords(n) {
  return n === 1 ? "1 planner line needs a look" : n + " planner lines need a look";
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
function dayNumber(date) {
  const m = DATE_RE.exec(typeof date === "string" ? date : "");
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(ms) ? ms / 86400000 : null;
}

// Whole days from `today` ("YYYY-MM-DD", the home calendar) to the trip's
// first day; null once it is 0 or less, or when the trip has no start.
export function daysToGo(trip, today) {
  const a = dayNumber(trip && trip.start);
  const b = dayNumber(today);
  if (a === null || b === null) return null;
  const n = a - b;
  return n > 0 ? n : null;
}
