/* Copyright (c) 2026 moissmart1. All rights reserved. No licence is granted: do not copy, adapt or reuse this code or design, and do not use it to train or prompt an AI system to reproduce it. See LICENSE. */
// One day as a railway ticket: the line's band with the day number, the route
// in large type, the date, a perforation, the day's stops as printed rows and
// a fine-print footer. Ported from the mockup's ticket(), built node by node:
// every name, title and note from the Sheet goes in with textContent, and a
// link or photo from the Sheet becomes an href or src only through safeHref.
//
// ticketEl(model) -> HTMLElement (an <article class="tk">), where
// model = { day, number, count, state, header, stops, stays, total, mark,
//           stay, nextId, minutes, toGo, tripName, stampOpen }
// - day: the Days row ({ date, city, title, ... }); header: header(day) from
//   js/plan.js; stops: stopsFor(...) for the day, in order; stays: every stay
//   (the first stop's directions start from the night before's); number:
//   1-based; mark: the issuer's mark ("MAT"); tripName: printed when the day
//   has no route and no city.
// - state: dayState(...) ("used", "today", "ahead"); minutes: the trip zone's
//   minutes past midnight; nextId: today's next stop (nextStopId, which keeps
//   a stop just started for a while, R38), else null;
//   total: the day's logged spending in trip cents (dayTotalTrip), printed as the fare when above
//   zero; toGo: days until the trip starts (daysToGo), counted down on Day 1;
//   stampOpen: today's stamp in the stamp book is open and not yet pressed,
//   so the ticket carries a line, .tk-stampline, that opens the book.
// - stay: the night's stay (stayShownFor: on today's ticket before 04:00,
//   last night's), or null. Drawn after the stops as one
//   button, .tk-stay[data-stay], that opens the hotel card; no stay, no row.
// After the stops (before the stay) every ticket has ＋ Add a stop, a button
// .tk-add[data-date]; each open stop has an Edit button, .r-edit, beside its
// links. Both open the stop sheet (the Days view sees to the taps).
// Every row is drawn closed: the Days view opens one (.is-open on the .r, and
// aria-expanded on its [role=button], and un-inerts its .r-more).
// A used day's gate stamp is made once per day, place and mark, and reused.

import { minutesOf, issueLine, isPast, nextLine, originFor, mapsUrl, safeHref, gateDate } from "../plan.js";
import { dayHead, tripMoney } from "../format.js";
import { rng, gateStampSVG } from "../stamp.js";

const SVG = "http://www.w3.org/2000/svg";

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

const str = (v) => (typeof v === "string" ? v.trim() : "");

// The large type shrinks with the name's length, as the mockup's fsFor does.
// A Latin letter in this heavy face is about seven tenths as wide as a
// Japanese character, so it counts as that. `wide`: the name has the
// ticket's whole width to itself (no arrow, no second station), so it may be
// twice as long. Chicago's station names are English and often long
// ("Clark/Lake"), hence the two smaller steps; a name longer still is cut
// with an ellipsis (css/days.css) rather than run into the other station.
export function fsFor(name, wide = false) {
  let n = 0;
  for (const c of name) n += c.codePointAt(0) < 0x2e80 ? 0.7 : 1;
  if (wide) n /= 2;
  return n <= 2 ? 46 : n <= 3 ? 38 : n <= 4 ? 31 : n <= 5 ? 26 : n <= 6 ? 22 : n <= 8 ? 16 : 14;
}

// A station: its name large (Japanese when there is one), English under it.
function station(jp, en, cls, wide = false) {
  const s = el("div", cls);
  const big = jp || en;
  const b = el("b", "", big);
  b.style.fontSize = fsFor(big, wide) + "px";
  s.append(b);
  if (jp && en) s.append(el("span", "", en));
  return s;
}

function arrow() {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("class", "arr");
  svg.setAttribute("viewBox", "0 0 48 24");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG, "path");
  path.setAttribute("d", "M0 8h30V0l18 12-18 12v-8H0z");
  svg.append(path);
  return svg;
}

function band(h, number) {
  const b = el("div", "tk-band");
  if (h.line) {
    const name = el("span", "", h.line.jp || h.line.en);
    if (h.line.jp && h.line.en) name.append(el("i", "", h.line.en));
    b.append(name);
  } else if (h.city) {
    b.append(el("span", "", h.city));
  }
  const num = el("span", "num");
  num.append(el("small", "", "D"), " " + String(number).padStart(2, "0"));
  b.append(num);
  return b;
}

function route(h, tripName) {
  const r = el("div", "tk-route");
  if (h.route) {
    const { fromJp, fromEn, toJp, toEn } = h.route;
    r.append(station(fromJp, fromEn, "stn"), arrow(), station(toJp, toEn, "stn to"));
    return r;
  }
  // No route: the city alone, or the trip's name, across the whole ticket.
  r.classList.add("is-one");
  const name = h.city || str(tripName);
  if (name) r.append(station("", name, "stn", true));
  return r;
}

// A photo address that failed to load is not drawn again (this visit).
const failedPhotos = new Set();

// What shows when the stop is open: the photo, how to get there, the note,
// and the buttons (directions, and the stop's own link).
function more(stop, origin) {
  const wrap = el("div", "r-more");
  wrap.inert = true;
  const inner = el("div");
  const photo = safeHref(stop.photo);
  if (photo && !failedPhotos.has(photo)) {
    const img = el("img", "r-ph");
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => {
      failedPhotos.add(photo);
      img.remove();
    }, { once: true });
    img.src = photo;
    inner.append(img);
  }
  const go = str(stop.gettingThere);
  if (go) inner.append(el("div", "r-go", go));
  const note = str(stop.note);
  if (note) inner.append(el("div", "r-note", note));
  const btns = el("div", "r-btns");
  const link = (cls, text, href) => {
    const a = el("a", cls, text);
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener";
    return a;
  };
  const map = mapsUrl(stop, origin);
  if (map) btns.append(link("r-map", "Directions ↗", map));
  const own = safeHref(stop.link);
  if (own) btns.append(link("r-map alt", "Ticket or booking ↗", own));
  // Opens the stop sheet on this stop (js/views/stopsheet.js).
  const edit = el("button", "r-edit", "Edit");
  edit.type = "button";
  btns.append(edit);
  inner.append(btns);
  wrap.append(inner);
  return wrap;
}

function row(stop, i, model) {
  const { state, minutes, nextId, stops, stays, day } = model;
  const next = state === "today" && stop.id === nextId;
  const r = el("div", "r");
  r.dataset.id = stop.id;
  if (state === "used" || (state === "today" && isPast(stop, minutes, nextId))) r.classList.add("is-done");
  if (next) r.classList.add("is-next");

  // The name and the line under it: the part that opens and closes the stop.
  const body = el("div", "r-b");
  body.setAttribute("role", "button");
  body.tabIndex = 0;
  body.setAttribute("aria-expanded", "false");
  const title = str(stop.title);
  if (title || next) {
    const n = el("div", "r-n");
    if (next) n.append(el("span", "tag", "Next"));
    if (title) n.append(title);
    body.append(n);
  }
  // A time that cannot slip, under the name.
  if (stop.fixed === true) {
    const fx = el("div", "r-fx");
    fx.append(el("span", "", "Fixed time"));
    body.append(fx);
  }
  const lead = next ? nextLine(stop, minutes) : "";
  const detail = str(stop.detail);
  if (lead || detail) {
    const s = el("div", "r-s");
    if (lead) s.append(el("b", "r-lv", lead));
    if (lead && detail) s.append(" ");
    if (detail) s.append(detail);
    body.append(s);
  }
  r.append(el("div", "r-t", minutesOf(stop.time) === null ? "—" : stop.time), body, el("div", "r-j", str(stop.signJp)), more(stop, originFor(stops, i, stays, day.date)));
  return r;
}

// Drawn once per day, place and mark; a redraw reuses the string.
const stamps = new Map();

// A used day's gate stamp, the same on every phone: seeded from the date's
// digits; its place the day's last station, else the city.
function gate(day, h, mark) {
  const seed = Number(day.date.replace(/-/g, "")) || 1;
  const place = str(day.toJp) || h.city;
  const key = seed + "|" + place + "|" + mark;
  if (!stamps.has(key)) {
    stamps.set(key, { svg: gateStampSVG(seed, place, gateDate(day.date), mark), rot: (-14 + rng(seed)() * 22).toFixed(1) + "deg" });
  }
  const { svg, rot } = stamps.get(key);
  const insp = el("div", "insp");
  insp.style.setProperty("--rot", rot);
  insp.innerHTML = svg; // escaped by gateStampSVG
  return insp;
}

// The right-hand side of the date row: good for this day only, or on Day 1
// before the trip how many days until it is valid.
function validity(number, toGo) {
  if (number === 1 && toGo > 0) return el("span", "", toGo === 1 ? "Valid tomorrow" : "Valid in " + toGo + " days");
  return el("span", "", "Good for this day only");
}

// Under the date, on the day whose stamp is open and not yet pressed: a line
// that opens the stamp book (the Days view sees to the tap).
function stampLine() {
  const b = el("button", "tk-stampline");
  b.type = "button";
  b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle class="d" cx="12" cy="12" r="9.5"/><circle cx="12" cy="12" r="4.2"/></svg>';
  b.append(el("span", "", "Today’s stamp is open"), el("i", "", "›"));
  return b;
}

// Tonight and the stay's name: a button that opens the hotel card.
function stayRow(stay) {
  const b = el("button", "tk-stay");
  b.type = "button";
  b.dataset.stay = stay.id;
  const label = el("span", "tk-stay-l");
  label.append(el("span", "", "Tonight"));
  b.append(label);
  const name = str(stay.name) || str(stay.nameJp);
  if (name) b.append(el("span", "tk-stay-n", name));
  return b;
}

export function ticketEl(model) {
  const { day, number, header: h, stops, mark, tripName, state, total, toGo } = model;
  const date = day.date;
  const tk = el("article", "tk");
  // The line's colour; without a valid one the band stays neutral (css/days.css).
  if (h.colour) {
    tk.style.setProperty("--line", h.colour);
    tk.style.setProperty("--line-ink", h.ink);
  }

  const head = el("div", "tk-head");
  const kind = el("div", "tk-kind");
  const k = el("span", "", "1-Day Ticket");
  kind.append(k, el("span", "fare", total > 0 ? tripMoney(total) : ""));
  head.append(kind, route(h, tripName));
  if (h.title) head.append(el("div", "tk-title", h.title));
  // The date in English only for now ("Mon Dec 28"); the look is chosen later.
  const when = el("span", "", dayHead(date).en);
  const dateRow = el("div", "tk-date");
  dateRow.append(when, validity(number, toGo));
  head.append(dateRow);
  if (model.stampOpen) head.append(stampLine());
  if (state === "used") head.append(gate(day, h, mark));

  const rows = el("div", "rows");
  if (stops.length) rows.append(...stops.map((stop, i) => row(stop, i, model)));
  else rows.append(el("div", "r-none", "Nothing planned yet."));

  const foot = el("div", "tk-foot");
  foot.append(el("span", "", issueLine(date, number, mark)), el("span", "", "Good for this day only"));

  // A used day is punched on the perforation, clear of the print.
  const perf = el("div", "tk-perf");
  if (state === "used") perf.append(el("span", "punch"));
  tk.append(band(h, number), head, perf, rows);
  // A stay typed into the Sheet by hand with no id cannot be opened: no row.
  const stay = model.stay;
  // ＋ Add a stop: after the day's stops, before the night's stay.
  const add = el("button", "tk-add", "＋ Add a stop");
  add.type = "button";
  add.dataset.date = date;
  tk.append(add);
  if (stay && typeof stay.id === "string" && stay.id) tk.append(stayRow(stay));
  tk.append(foot);
  return tk;
}
