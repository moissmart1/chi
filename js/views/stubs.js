/* Copyright (c) 2026 moissmart1. All rights reserved. No licence is granted: do not copy, adapt or reuse this code or design, and do not use it to train or prompt an AI system to reproduce it. See LICENSE. */
// The ticket stubs, look F ("stapled to the check", picked by Mo on
// 2026-11-19): each ticket is drawn as what it would be in a pocket, on its
// own stock, and stapled to its stop's line on the day's guest check.
// Shared by the Days check (js/views/ticket.js), the ticket held up
// (js/views/stub.js), the Tickets tab (js/views/tickettab.js) and bulk add.
//
// The stock comes from the stop's own words (stockOf): a flight's thermal
// boarding pass, a boat's blue boarding card, a museum's buff admission
// stub, else a game's long red-ended stock. A booking that is only a
// reference is a Reserved card. Nothing on a stub is made up: the end says
// how many it admits only when that is known, and the band carries the
// stock's word, the day and the time.
//
// Every builder makes spans (so a stub can sit inside a button) and puts
// text in with textContent. A picture is drawn only from the phone's own
// keep, as an <img> of a blob: address made here (thumbEl), one per picture,
// kept until forgetThumbs() (the trip taken off the phone).

import { dayHead } from "../format.js";
import { ticketMark, ticketKinds } from "../tickets.js";

const str = (v) => (typeof v === "string" ? v.trim() : "");

export function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

// ---------- words ----------

const FLY = /\b(flights?|fly|flying|plane|airport|airline|boarding pass|o[’']?hare|midway|terminal)\b/i;
const BOAT = /\b(boat|cruise|ferry|river tour|lake tour|water taxi)\b/i;
const MUS = /\b(museum|institute|gallery|aquarium|planetarium|zoo|exhibit|exhibition|observatory|skydeck|admission)\b/i;

// "fly" | "boat" | "mus" | "game", from the stop's title and detail line.
export function stockOf(stop) {
  const words = stop ? str(stop.title) + " " + str(stop.detail) : "";
  if (FLY.test(words)) return "fly";
  if (BOAT.test(words)) return "boat";
  if (MUS.test(words)) return "mus";
  return "game";
}

const KIND_WORD = { game: "TICKET", boat: "BOARDING CARD", mus: "ADMISSION", fly: "BOARDING PASS" };
export const kindWord = (stock) => KIND_WORD[stock] || KIND_WORD.game;

const EDGE_WORD = { game: "ADMIT", boat: "BOARD", mus: "ADMIT", fly: "PASS" };

// How many people a stop's pictures are for (one each), else 0.
function peopleIn(k) {
  if (!k || k.kind !== "pp") return 0;
  return new Set(k.list.map((t) => t.who).filter(Boolean)).size;
}

// The stub's end: { word, n }. n is how many it admits when that is known
// (one picture each, or a number typed as the stop's People), else "".
export function edgeOf(stock, k, stop) {
  const word = EDGE_WORD[stock] || EDGE_WORD.game;
  const each = peopleIn(k);
  if (each) return { word, n: String(each) };
  const m = /^\s*(\d{1,2})\b/.exec(str(stop && stop.tkPeople));
  return { word, n: m ? m[1] : "" };
}

// "2 tickets", "2 passes", "1 ticket for everyone", "3 pages".
export function countLine(k, stock) {
  if (!k || !k.kind) return "";
  const pass = stock === "fly";
  if (k.kind === "pp") {
    const n = peopleIn(k);
    return n + (pass ? (n === 1 ? " pass" : " passes") : n === 1 ? " ticket" : " tickets");
  }
  if (k.kind === "one") return pass ? "1 pass for everyone" : "1 ticket for everyone";
  return k.list.length + " pages";
}

// A seat in the boxes a ticket prints it in: [[label, value], ...], or null
// when any of it is something the boxes cannot hold (then it is printed as typed).
const SEAT_PART = /^(sec(?:tion)?|row|seats?|gate|table|car|box|stand|level|door)\s*[:#.]?\s*([A-Za-z0-9][A-Za-z0-9–-]*)$/i;
const SEAT_LABEL = { sec: "SEC", section: "SEC" };
export function seatParts(seat) {
  const s = str(seat);
  if (!s) return null;
  const bits = s.split(/\s*[,·;/]\s*|\s+(?=(?:sec(?:tion)?|row|seats?|gate|table|car|box|stand|level|door)\b)/i).filter(Boolean);
  const out = [];
  for (const b of bits) {
    const m = SEAT_PART.exec(b.trim());
    if (!m) return null;
    const key = m[1].toLowerCase();
    out.push([SEAT_LABEL[key] || key.toUpperCase(), m[2]]);
  }
  return out.length ? out : null;
}

// The sentence for staff on a reservation, in plain English; null without a name.
export function staffLine(stop) {
  const name = str(stop && stop.tkName);
  if (!name) return null;
  const people = str(stop.tkPeople);
  const time = /^\d{2}:\d{2}$/.test(str(stop.time)) ? stop.time : "";
  return "We have a booking" + (people ? " for " + people : "") + (time ? " at " + time : "") + " under " + name + ".";
}

// "MON DEC 28 · 19:30" for the band.
export function bandDay(date, time) {
  const head = date ? dayHead(date).en.toUpperCase() : "";
  return [head, /^\d{2}:\d{2}$/.test(str(time)) ? time : ""].filter(Boolean).join(" · ");
}

// ---------- pictures from the keep ----------

const thumbs = new Map(); // picture id -> blob: address, made once
export function forgetThumbs() {
  for (const u of thumbs.values()) URL.revokeObjectURL(u);
  thumbs.clear();
}

// A small picture of a ticket's code, from the keep (nothing is fetched here).
export function thumbEl(keep, id, cls = "ts-q") {
  const box = el("span", cls);
  box.setAttribute("aria-hidden", "true");
  if (!keep || !id) return box;
  const put = (u) => {
    const img = el("img");
    img.alt = "";
    img.decoding = "async";
    img.src = u;
    box.replaceChildren(img);
  };
  if (thumbs.has(id)) put(thumbs.get(id));
  else {
    Promise.resolve(keep.get(id)).then((blob) => {
      if (!blob) return;
      if (!thumbs.has(id)) thumbs.set(id, URL.createObjectURL(blob));
      put(thumbs.get(id));
    }).catch(() => {});
  }
  return box;
}

// ---------- the pieces ----------

export function staple(cls = "staple") {
  const s = el("span", cls);
  s.setAttribute("aria-hidden", "true");
  return s;
}

// The purple time-clock print (the one that prints PAID on Money).
export function tclock(main, small = "") {
  const t = el("span", "tclock", main);
  if (small) t.append(el("small", "", small));
  return t;
}

// Seat boxes, or the seat as typed when it cannot be boxed.
export function seatEl(seat, cls = "ts-seat") {
  const parts = seatParts(seat);
  const box = el("span", cls);
  if (!parts) {
    if (str(seat)) box.append(el("span", "ts-seat-t", str(seat)));
    else return null;
    return box;
  }
  for (const [label, v] of parts) {
    const i = el("span", "ts-sb");
    i.append(el("small", "", label), " ", v);
    box.append(i);
  }
  return box;
}

// A ticket stub: { stock, edge: { word, n }, kicker, name, sub, ghost }.
export function stubEl({ stock = "game", edge = null, kicker = "", name = "", sub = "", ghost = false, extra = null }) {
  const s = el("span", "ts is-" + stock + (ghost ? " is-ghost" : ""));
  const e = el("span", "ts-e");
  if (edge) {
    e.append(el("span", "", edge.word));
    if (edge.n) e.append(el("b", "", edge.n));
  }
  e.setAttribute("aria-hidden", "true");
  const b = el("span", "ts-b");
  if (kicker) b.append(el("span", "ts-k", kicker));
  if (name) b.append(el("span", "ts-n", name));
  if (sub) b.append(el("span", "ts-s", sub));
  if (extra) b.append(extra);
  const r = el("span", stock === "fly" ? "ts-bars" : "ts-r");
  r.setAttribute("aria-hidden", "true");
  s.append(e, b, r);
  return s;
}

// The Reserved card: a booking that is only a reference.
export function resvEl({ name = "", ref = "", note = "Reference only" } = {}) {
  const c = el("span", "resv");
  const l = el("span", "resv-l");
  l.append(el("span", "ts-k", "Reserved"));
  if (name) l.append(el("span", "ts-n", name));
  const r = el("span", "resv-r", note);
  if (ref) r.append(el("b", "", ref));
  c.append(l, r);
  return c;
}

// The big stub on the next ticket: a band across the top, the name, the
// count line, the seat boxes and the code's picture.
export function bigStubEl({ stock = "game", band = "", bandRight = "", name = "", sub = "", seat = "", thumb = null, ghost = false }) {
  const s = el("span", "bigst is-" + stock + (ghost ? " is-ghost" : ""));
  s.append(staple());
  const t = el("span", "bigst-t");
  t.append(el("span", "", band));
  if (bandRight) t.append(el("span", "", bandRight));
  const m = el("span", "bigst-m");
  const l = el("span", "bigst-l");
  l.append(el("span", "ts-n", name));
  if (sub) l.append(el("span", "ts-s", sub));
  const se = seatEl(seat);
  if (se) l.append(se);
  m.append(l);
  if (thumb) m.append(thumb);
  s.append(t, m);
  return s;
}

// What a stop's ticket says it is, for a screen reader: "2 tickets, on this phone".
export function statusWords(mark, count) {
  if (!mark) return "";
  if (mark.kind === "ref") return "reservation, reference only";
  return (count || mark.label) + (mark.saved ? ", on this phone" : ", needs signal once");
}

// ---------- a stop's ticket, as the screens draw it ----------

// What a stop's ticket is, for drawing (a plain object: it goes into a
// screen's signature), or null when the stop has no ticket:
// { kind: "pp" | "one" | "pages" | "ref", saved, stock, count, edge, ref,
//   name, seat, first } (first: the id of the picture shown small, this
// phone's person's first, only when it is on this phone).
export function tixInfo(stop, tickets, have, me) {
  const mark = ticketMark(stop, tickets, have);
  if (!mark) return null;
  const pics = (Array.isArray(tickets) ? tickets : []).filter((t) => t && t.stop === stop.id && !t.gone);
  const k = ticketKinds(pics);
  const stock = stockOf(stop);
  const info = { kind: mark.kind, saved: mark.saved, stock, count: countLine(k, stock), edge: k.kind ? edgeOf(stock, k, stop) : null, ref: str(stop.tkRef), name: str(stop.tkName), seat: str(stop.tkSeat), first: null };
  if (k.kind) {
    const sorted = k.list.slice().sort((a, b) => (a.who === me ? 0 : 1) - (b.who === me ? 0 : 1) || (Number(a.page) || 0) - (Number(b.page) || 0));
    const first = sorted[0];
    if (first && have(first.id)) info.first = first.id;
    if (!info.seat && first && str(first.seat)) info.seat = str(first.seat);
  }
  return info;
}

// The small stub stapled under a stop's name (or the Reserved card), with
// the time clock's USED print once the stop is over.
export function onCheckEl(info, { used = false, usedText = "USED", sm = false } = {}) {
  const on = el("span", "ts-on" + (sm ? " sm" : ""));
  if (info.kind === "ref") on.append(resvEl({ ref: info.ref, name: info.ref ? "" : info.name }));
  else on.append(stubEl({ stock: info.stock, edge: info.edge, kicker: kindWord(info.stock), name: info.count, sub: info.saved ? "" : "needs signal once", ghost: !info.saved }));
  on.append(staple());
  if (used) on.append(tclock(usedText));
  return on;
}
