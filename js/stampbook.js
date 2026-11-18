/* Copyright (c) 2026 moissmart1. All rights reserved. No licence is granted: do not copy, adapt or reuse this code or design, and do not use it to train or prompt an AI system to reproduce it. See LICENSE. */
// The placemat (the keepsake, look C), without a screen: where each day's
// spot sits on the souvenir map, the three inks, how a stamp is drawn from
// its seed, and when each one is open. Pure: no DOM, safe to import in Node.
//
// Which day gets which name, place, ink and shape is data in the Sheet (the
// StampDefs tab, arriving on load as stampDefs); this file holds the map's
// known places and the inks. The motif column is still read but no longer
// drawn: on the placemat the date is the picture, as in the mock-up.
//
// A definition: { id, date, name_ja, name_en, place, motif, ink, shape }.
// date is YYYY-MM-DD, or "" for the issue stamp (open from the start until
// the last day stamp closes). Every text here goes into markup only through
// esc(), so a name that holds markup is shown as text.
//
// When a stamp is open is decided in the trip's time (Chicago, fixed UTC−6:
// js/trip.js), never in the phone's own zone, and by the same numbers as the
// backend's stampWindow (backend/Pure.js): 00:00 on its date until 03:00 the
// next day, 27 hours.

import { rng, wear } from "./stamp.js";
import { TRIP_UTC_OFFSET_MS } from "./trip.js";
import { tripDate, tripClock } from "./time.js";

// The keys stay the Sheet's words; the inks are the check's red, the
// placemat's blue and the check's green.
export const INKS = { shu: "#C2362B", matsu: "#2E7A57", ai: "#2F5FA8" };

const OPEN_MS = 27 * 3600000;
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const has = (o, k) => typeof k === "string" && Object.prototype.hasOwnProperty.call(o, k);

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (v) => String(v === undefined || v === null ? "" : v).replace(/[&<>"']/g, (c) => ESC[c]);

// ---- the drawings ----
const round2 = (n) => Math.round(n * 100) / 100;
const SLAB = 'font-family="Zilla Slab,Rockwell,Georgia,serif" font-weight="700"';
const FRANKLIN = 'font-family="Libre Franklin,Helvetica Neue,Arial,sans-serif" font-weight="800"';

// The book's own stamp, the crest: a ring of twelve short ticks around the
// app's name and the year. Exported as the one drawing left in the library.
function crestTicks() {
  let ticks = "";
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    const c = Math.cos(a);
    const s = Math.sin(a);
    ticks += "M" + round2(60 + c * 34) + " " + round2(60 + s * 34) + "L" + round2(60 + c * 40) + " " + round2(60 + s * 40);
  }
  return '<path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" d="' + ticks + '"/>';
}
export const MOTIFS = { crest: crestTicks() };

// A twelve-pointed burst for New Year's Eve (the fireworks).
function burst(cx, cy, R, r) {
  let p = "";
  for (let k = 0; k < 24; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 12;
    const rr = k % 2 ? r : R;
    p += (k ? "L" : "M") + round2(cx + rr * Math.cos(a)) + " " + round2(cy + rr * Math.sin(a));
  }
  return p + "Z";
}

// ---- where each spot sits on the placemat's map ----
// The map is drawn in a 358 by 440 box (js/views/stampbook.js): the lake on
// the right, the river across the middle and up its north branch. These
// places have their own spot (a hand-drawn map, roughly where they are);
// any other place takes the next free spot, so the Sheet can name anywhere.
export const MAP_W = 358;
export const MAP_H = 440;
const PLACES = {
  "o'hare": [64, 104, "nw"], "midway": [58, 372, "sw"], "uptown": [190, 104, "n"], "andersonville": [150, 112, "n"],
  "wrigleyville": [232, 112], "lakeview": [232, 112], "lincoln park": [222, 150], "logan square": [62, 168], "wicker park": [96, 196],
  "bucktown": [70, 214], "the river": [272, 160], "river": [272, 160], "gold coast": [270, 122], "old town": [214, 186],
  "river north": [214, 186], "streeterville": [272, 232], "magnificent mile": [272, 232], "navy pier": [272, 232],
  "west loop": [90, 252], "the loop": [212, 256], "loop": [212, 256], "millennium park": [250, 306], "grant park": [250, 306],
  "south loop": [212, 330], "museum campus": [266, 360], "chinatown": [196, 384], "pilsen": [94, 316], "hyde park": [266, 396],
};
// Free spots, in the order they are handed out, clear of the river, the lake and the title.
const FREE = [[150, 300], [120, 140], [250, 196], [96, 400], [180, 220], [40, 300], [270, 270], [150, 362], [212, 130], [40, 236],
  [116, 360], [234, 362], [176, 150], [100, 286], [196, 288], [270, 100], [40, 136], [136, 250], [230, 400], [176, 96],
  [60, 330], [204, 326], [120, 210], [264, 330], [88, 130], [150, 400], [236, 226], [40, 400], [176, 260], [116, 100],
  [270, 400], [196, 360], [40, 196], [90, 220], [236, 160], [150, 196]];
// The book's own stamp: the corner under the lake's shore.
const ISSUE_AT = [230, 396];
const MIN_GAP = 40;
const placeKey = (v) => String(v === undefined || v === null ? "" : v).trim().toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, " ");

// [{ id, x, y, dir, issue }] in book order (usableDefs): where each stamp's
// spot is drawn. A place on the map gets its own spot unless another day
// already has it; everything else the next free spot at least MIN_GAP away
// from every spot taken. dir: the arrow of a place off the map's edge.
export function placemat(defs) {
  const taken = [];
  const clear = (x, y) => taken.every((t) => Math.hypot(t[0] - x, t[1] - y) >= MIN_GAP);
  const out = [];
  const list = usableDefs(defs);
  const issue = list.find((d) => dateOf(d) === "");
  if (issue) taken.push(ISSUE_AT);
  for (const d of list) {
    if (d === issue) continue;
    const k = placeKey(d.place);
    let spot = PLACES[k] || PLACES[k.replace(/^the /, "")] || null;
    if (spot && !clear(spot[0], spot[1])) spot = null;
    if (!spot) spot = FREE.find((f) => clear(f[0], f[1])) || null;
    if (!spot) {
      // More days than the map has room for: the point of a fine grid farthest from every spot taken.
      let best = -1;
      for (let y = 100; y <= 400; y += 20) {
        for (let x = 40; x <= 280; x += 20) {
          const near = Math.min(...taken.map((t) => Math.hypot(t[0] - x, t[1] - y)));
          if (near > best) {
            best = near;
            spot = [x, y];
          }
        }
      }
    }
    taken.push(spot);
    out.push({ id: d.id, x: spot[0], y: spot[1], dir: spot[2] || "", issue: false });
  }
  if (issue) out.push({ id: issue.id, x: ISSUE_AT[0], y: ISSUE_AT[1], dir: "", issue: true });
  return out;
}

// ---- dates and the trip's time ----

const validDay = (s) => {
  const m = typeof s === "string" ? DAY_RE.exec(s) : null;
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
};
const dayStart = (s) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))) - TRIP_UTC_OFFSET_MS;
const dateOf = (def) => (def && typeof def.date === "string" ? def.date : "");

// The trip's calendar day and clock time of a moment (js/time.js).
export { tripDate, tripClock };

// "Dec 13", "Sat Dec 12", "Sat", "12" and "12.13" (M.D) of a YYYY-MM-DD.
export const monthDay = (s) => MON[Number(s.slice(5, 7)) - 1] + " " + Number(s.slice(8, 10));
export const weekdayOf = (s) => WD[new Date(Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)))).getUTCDay()];
export const dayNumber = (s) => String(Number(s.slice(8, 10)));

// ---- the definitions ----

// The definitions the book can use, in book order: the day stamps by date,
// then the issue stamp. One with no id, an id seen already, or a date that is
// neither a day nor empty is left out.
export function usableDefs(defs) {
  const seen = new Set();
  const out = [];
  for (const d of Array.isArray(defs) ? defs : []) {
    if (!d || typeof d !== "object" || typeof d.id !== "string" || d.id === "" || seen.has(d.id)) continue;
    const date = dateOf(d);
    if (date !== "" && !validDay(date)) continue;
    seen.add(d.id);
    out.push(d);
  }
  const days = out.filter((d) => dateOf(d) !== "").sort((a, b) => (dateOf(a) < dateOf(b) ? -1 : dateOf(a) > dateOf(b) ? 1 : 0));
  return days.concat(out.filter((d) => dateOf(d) === ""));
}

// When a stamp can be pressed, in epoch ms: { opens, closes }. The same
// numbers as the backend's stampWindow.
export function windowOf(def, defs) {
  const date = dateOf(def);
  if (date === "") {
    let latest = null;
    for (const d of Array.isArray(defs) ? defs : []) {
      const x = dateOf(d);
      if (x === "" || !validDay(x)) continue;
      const c = dayStart(x) + OPEN_MS;
      if (latest === null || c > latest) latest = c;
    }
    return { opens: 0, closes: latest === null ? Infinity : latest };
  }
  if (!validDay(date)) return { opens: Infinity, closes: -Infinity };
  const opens = dayStart(date);
  return { opens, closes: opens + OPEN_MS };
}

const holds = (mine, id) => {
  if (!mine) return false;
  if (mine instanceof Set) return mine.has(id);
  if (Array.isArray(mine)) return mine.some((x) => x === id || (x && x.def === id));
  return has(mine, id);
};

// "have" (this person has pressed it), "open" (it can be pressed now), "soon"
// (not yet) or "missed" (its window has closed and it was never pressed).
export function stateOf(def, defs, mine, nowMs) {
  if (holds(mine, def && def.id)) return "have";
  const w = windowOf(def, defs);
  if (nowMs < w.opens) return "soon";
  if (nowMs >= w.closes) return "missed";
  return "open";
}

export const countText = (n, total) => n + " of " + total;

// A stamp's small tilt, in degrees, from its seed: -6 to 6.
export function tiltOf(seed) {
  const n = Number.parseInt(seed, 10);
  const r = rng(n >= 1 && n <= 0xffffffff ? n : 1)();
  return Math.round((r * 12 - 6) * 10) / 10;
}

// "2026.12.10 → 12.20": the first and last day stamp's dates ("" with none).
export function spanText(defs) {
  const days = usableDefs(defs).filter((d) => dateOf(d) !== "").map(dateOf);
  if (!days.length) return "";
  const a = days[0];
  const b = days[days.length - 1];
  return a.slice(0, 4) + "." + a.slice(5, 7) + "." + a.slice(8, 10) + (a === b ? "" : " → " + b.slice(5, 7) + "." + b.slice(8, 10));
}

// The refusal line under the page for a stamp that cannot be pressed.
export function lockedLine(def, state) {
  const date = dateOf(def);
  if (date === "") return "The book has closed.";
  return state === "missed" ? monthDay(date) + " has closed." : monthDay(date) + " opens on the day.";
}

// ---- drawing a stamp ----

// A short id for the parts of one stamp's drawing, from its definition id.
function tag(id) {
  let h = 0;
  for (const ch of String(id)) h = (Math.imul(h, 31) + ch.codePointAt(0)) >>> 0;
  return h.toString(36);
}

// How much a line of n letters has to shrink to fit `room` units of arc.
const fit = (n, each, room) => Math.min(1, room / Math.max(1, n * each));

// One stamp as an <svg> string, as the placemat's stamps are in the
// mock-up: a double ring (shape "round"), or a rounded square ("square"),
// or on New Year's Eve a fireworks burst; in the middle the date (DEC 28)
// in the slab and the weekday under it; the place's English name on the top
// arc. The book's own stamp (no date) is the crest: twelve ticks round the
// app's name and the year of the first day stamp in `defs`. The ink is the
// definition's (an unknown ink is red), worn by the seed so it looks the
// same on every phone. Every text is escaped, so the string may be set with
// innerHTML. The Japanese name and the motif are not drawn.
export function bookStampSVG(seed, def, defs) {
  const d = def && typeof def === "object" ? def : {};
  const n = Number.parseInt(seed, 10);
  const sid = n >= 1 && n <= 0xffffffff ? n : 1;
  const id = "b" + sid + tag(d.id);
  const r = rng(sid);
  const ink = has(INKS, d.ink) ? INKS[d.ink] : INKS.shu;
  const mask = wear(id, r, 120);
  const date = dateOf(d);
  const day = date !== "" && validDay(date);
  const nye = day && date.slice(5) === "12-31";

  let frame;
  if (nye) frame = '<path class="burst" d="' + burst(60, 60, 57, 44) + '" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><circle cx="60" cy="60" r="38" fill="none" stroke="currentColor" stroke-width="1"/>';
  else if (d.shape === "square") frame = '<rect x="5" y="5" width="110" height="110" rx="13" fill="none" stroke="currentColor" stroke-width="3.2"/><rect x="10.5" y="10.5" width="99" height="99" rx="9" fill="none" stroke="currentColor" stroke-width="1"/>';
  else frame = '<circle cx="60" cy="60" r="55" fill="none" stroke="currentColor" stroke-width="3.2"/><circle cx="60" cy="60" r="47" fill="none" stroke="currentColor" stroke-width="1.2"/>';

  let middle;
  let arc = "";
  if (date === "") {
    const first = usableDefs(defs).find((x) => dateOf(x) !== "");
    const year = first ? dateOf(first).slice(0, 4) : "";
    middle = MOTIFS.crest +
      '<text x="60" y="' + (year ? 58 : 65) + '" text-anchor="middle" ' + SLAB + ' font-size="17" fill="currentColor">WENDY’S</text>' +
      (year ? '<text x="60" y="76" text-anchor="middle" ' + FRANKLIN + ' font-size="11" letter-spacing="1.5" fill="currentColor">' + esc(year) + "</text>" : "");
  } else {
    const md = day ? MON[Number(date.slice(5, 7)) - 1].toUpperCase() + " " + Number(date.slice(8, 10)) : "";
    const wd = day ? weekdayOf(date).toUpperCase() : "";
    middle = (md ? '<text x="60" y="64" text-anchor="middle" ' + SLAB + ' font-size="21" fill="currentColor">' + esc(md) + "</text>" : "") +
      (wd ? '<text x="60" y="81" text-anchor="middle" ' + FRANKLIN + ' font-size="12" letter-spacing="1" fill="currentColor">' + esc(wd) + "</text>" : "");
    const name = String(d.name_en === undefined || d.name_en === null ? "" : d.name_en).trim().toUpperCase() || String(d.place === undefined || d.place === null ? "" : d.place).trim().toUpperCase();
    if (name) {
      const k = fit([...name].length, 7, 100);
      arc = '<text ' + FRANKLIN + ' font-size="' + round2(9.5 * k) + '" letter-spacing="' + round2(1.2 * k) + '" fill="currentColor"><textPath href="#ta' + id + '" startOffset="50%" text-anchor="middle">' + esc(name) + "</textPath></text>";
    }
  }
  return '<svg class="bk-st" viewBox="0 0 120 120" width="100%" height="100%" color="' + ink + '" aria-hidden="true" focusable="false" overflow="visible"><defs>' + mask +
    '<path id="ta' + id + '" d="M24 60A36 36 0 0 1 96 60" fill="none"/></defs>' +
    '<g mask="url(#pm' + id + ')">' + frame + arc + middle + "</g></svg>";
}

// What the Days screen shows of the book, from the store's state and the real
// time: { total, n, openToday } where total is the stamps the book has (0:
// nothing to show), n how many of them this person has, and openToday the
// date of today's stamp when it is open and not pressed yet (else "").
// Today is the trip's calendar day, whatever zone the phone is in.
export function summary(s, nowMs) {
  const defs = usableDefs(s && s.stampDefs);
  const mine = new Set();
  for (const x of Array.isArray(s && s.stamps) ? s.stamps : []) if (x && x.who === s.me && !x.gone) mine.add(x.def);
  const today = tripDate(nowMs);
  const day = defs.find((d) => dateOf(d) === today);
  return {
    total: defs.length,
    n: defs.filter((d) => mine.has(d.id)).length,
    openToday: day && stateOf(day, defs, mine, nowMs) === "open" ? today : "",
  };
}
