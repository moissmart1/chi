/* Copyright (c) 2026 moissmart1. All rights reserved. No licence is granted: do not copy, adapt or reuse this code or design, and do not use it to train or prompt an AI system to reproduce it. See LICENSE. */
// How figures, days and sentences are written on screen. Pure: no DOM.

import { HOME_CURRENCY, HOME_SIGN, TRIP_SIGN } from "./trip.js";

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WK = ["日", "月", "火", "水", "木", "金", "土"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const grouped = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

const cents = (sign, c) => {
  const v = Math.round(c);
  const abs = Math.abs(v);
  return (v < 0 ? "-" : "") + sign + grouped(Math.floor(abs / 100)) + "." + String(abs % 100).padStart(2, "0");
};

// Integer cents at home (Canadian): dollars(13063) -> "$130.63".
export function dollars(c) {
  return cents(HOME_SIGN, c);
}

// Integer cents of the trip's currency: tripMoney(285000) -> "US$2,850.00".
// Never a bare $: both currencies are dollars.
export function tripMoney(c) {
  return cents(TRIP_SIGN, c);
}

// The figure as it was entered, in its own currency.
export function typed(e) {
  const c = Math.round(e.amount * 100);
  return e.currency === HOME_CURRENCY ? dollars(c) : tripMoney(c);
}

const parts = (date) => date.split("-").map(Number); // "2026-12-11" -> [2026, 12, 11]
const weekday = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();

// A receipt day heading: { jp, en, city }.
export function dayHead(day, days) {
  if (day === "pre") return { jp: "出発前", en: "Before the trip", city: "" };
  const [y, m, d] = parts(day);
  const w = weekday(y, m, d);
  const row = (days || []).find((x) => x.date === day);
  return { jp: m + "月" + d + "日(" + WK[w] + ")", en: WD[w] + " " + MON[m - 1] + " " + d, city: (row && row.city) || "" };
}

// The register's day: "Sat 12", or "Before" for before the trip.
export function dayShort(day) {
  if (day === "pre") return "Before";
  const [y, m, d] = parts(day);
  return WD[weekday(y, m, d)] + " " + d;
}

// The trip's dates in short: "Dec 10 to 20", or "Dec 28 to Jan 3".
export function tripSpan(trip) {
  const [, m1, d1] = parts(trip.start);
  const [, m2, d2] = parts(trip.end);
  return MON[m1 - 1] + " " + d1 + " to " + (m1 === m2 ? "" : MON[m2 - 1] + " ") + d2;
}

// The issuer's mark: first letters of the names, in order ("MAT").
export function issuer(people) {
  return people.map((p) => [...String(p.name)][0] || "").join("").toUpperCase();
}

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

// HTML for a figure, escaped first, with . , $ each in <span class="pt">.
export function pt(str) {
  return String(str)
    .replace(/[&<>"']/g, (c) => ESC[c])
    .replace(/[.,$]/g, '<span class="pt">$&</span>');
}

// "13:20" in the phone's own time zone.
export function clock(ms) {
  const d = new Date(ms);
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

// The day of a moment in the phone's own time zone, as "YYYY-MM-DD" ("" when ms is not a time).
export function localDay(ms) {
  if (!isFinite(ms)) return "";
  const d = new Date(ms);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

// "Up to date 13:20": how fresh the figures on screen are (the receipt and Settings both show it).
export function freshText(ms) {
  return "Up to date " + clock(ms);
}

// Who a change came through, after its sentence: " (through Claude)", " (from the planner)" or "".
export function viaText(via) {
  return via === "claude" ? " (through Claude)" : via === "planner" ? " (from the planner)" : "";
}

// A history entry as one sentence: "Izzah rang up Deep dish US$42.50".
export function historySentence(entry) {
  return entry.who + " " + entry.summary + viaText(entry.via);
}

// Where the viewer stands, from money.js standing().
export function sentence(s) {
  if (s.kind === "owed") return s.who ? s.who + " owes you " + dollars(s.cents) + "." : "You’re owed " + dollars(s.cents) + ".";
  if (s.kind === "owe") return s.who ? "You owe " + s.who + " " + dollars(s.cents) + "." : "You owe " + dollars(s.cents) + ".";
  if (s.kind === "even") return "You’re even overall.";
  return "You’re square.";
}

// The undo bar's line for the store's lastChange.
export function changeText(c) {
  const item = c.item || {};
  if (c.kind === "stop") {
    switch (c.action) {
      case "add": return "Added " + item.title + ".";
      case "edit": return "Changed " + item.title + ".";
      case "delete": return "Removed " + item.title + ".";
      case "restore": return "Put back " + item.title + ".";
      default: return "Undone.";
    }
  }
  if (c.kind === "todo") {
    switch (c.action) {
      case "tick": return "Ticked off " + item.item + ".";
      case "claim": return "You’re on " + item.item + ".";
      case "takeover": return "Took over " + item.item + ".";
      case "unclaim": return "Handed back " + item.item + ".";
      default: return "Undone.";
    }
  }
  switch (c.action) {
    case "add": return "Rang up " + item.title + " " + typed(item) + ".";
    case "edit": return "Changed " + item.title + ".";
    case "delete": return "Deleted " + item.title + ".";
    case "restore": return "Brought back " + item.title + ".";
    case "stamp": return "Stamped " + dollars(Math.round(item.cad * 100)) + " to " + item.to + ".";
    case "unstamp": return "Stamp removed.";
    case "restamp": return "Stamp put back.";
    default: return "Undone.";
  }
}
