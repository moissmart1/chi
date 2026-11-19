/* Copyright (c) 2026 moissmart1. All rights reserved. No licence is granted: do not copy, adapt or reuse this code or design, and do not use it to train or prompt an AI system to reproduce it. See LICENSE. */
// One day as a diner guest check (look C, "The guest check"): the boxes
// across the top (date, table, guests, server, check number), "Guest Check"
// with the day's date and name, a double rule, the day's stops as check
// lines (time, what, price), the day's total and a tear-off stub. Built node
// by node: every name, title and note from the Sheet goes in with
// textContent, and a link or photo from the Sheet becomes an href or src
// only through safeHref.
//
// ticketEl(model) -> HTMLElement (an <article class="tk">), where
// model = { day, number, count, state, header, stops, stays, total, totalHome,
//           mark, people, server, stay, nextId, minutes, toGo, tripName, stampOpen }
// - day: the Days row ({ date, city, title, ... }); header: header(day) from
//   js/plan.js; stops: stopsFor(...) for the day, in order; stays: every stay
//   (the first stop's directions start from the night before's); number:
//   1-based, printed as the check's No.; mark: the issuer's mark (the app's
//   name), printed on a used day's SERVED print; people: how many are on
//   the trip (the check's Table and Guests); server: who is looking;
//   tripName: printed when the day has no line, route or city.
// - state: dayState(...) ("used", "today", "ahead"); minutes: the trip zone's
//   minutes past midnight; nextId: today's next stop (nextStopId, which keeps
//   a stop just started for a while, R38), else null;
//   total / totalHome: the day's logged spending in trip and home cents
//   (dayTotalTrip), printed as the check's total when above zero; toGo: days
//   until the trip starts (daysToGo), counted down on Day 1's stub;
//   stampOpen: today's stamp on the placemat is open and not yet pressed,
//   so the check carries a line, .tk-stampline, that opens the placemat.
// - stay: the night's stay (stayShownFor: on today's check before 04:00,
//   last night's), or null. Drawn after the stops as one
//   button, .tk-stay[data-stay], that opens the hotel card; no stay, no row.
// After the stops (before the stay) every check has ＋ Add a stop, a button
// .tk-add[data-date]; each open stop has an Edit button, .r-edit, beside its
// links. Both open the stop sheet (the Days view sees to the taps).
// Every row is drawn closed: the Days view opens one (.is-open on the .r, and
// aria-expanded on its [role=button], and un-inerts its .r-more).
// A used day's SERVED print is made once per day, place and mark, and reused.
// - tix: { [stopId]: tixInfo(...) } (js/views/stubs.js) for the stops that
//   have a ticket (look F): its stub (or the Reserved card) stapled under the
//   stop's name, with the time clock's USED print once the stop is over, and,
//   when the stop is open, the big stub (.r-tk) above the links: Show ticket.
//   Absent, a stop reads exactly as it did. ticketEl's second argument,
//   { keep }, is where the big stub's small picture of the code comes from.
// - ask: today's check asks, once, whether to use where the phone is: the
//   last thing in its heading, .tk-ask, with Use it (.yes) and Not now (.no)
//   (the Days view sees to the taps). No sign is drawn with it.
// - hereNext: leave by from where you are (js/plan.js hereLine) for today's
//   next stop: its sign line (.r-here: the sign, the miles and the walk) and
//   its leave line (late: .r-lv.is-late). Absent, today's line stands.

import { minutesOf, issueLine, isPast, nextLine, mapsUrl, safeHref, gateDate, checkDate } from "../plan.js";
import { dayHead, tripMoney, dollars } from "../format.js";
import { rng, gateStampSVG } from "../stamp.js";
import { onCheckEl, bigStubEl, kindWord, bandDay, thumbEl, statusWords } from "./stubs.js";
import { plainBlade, bladeEl } from "./sign.js";

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

const str = (v) => (typeof v === "string" ? v.trim() : "");

// What the day is about, under its date in the check's heading: the line
// and its route ("Blue Line · Clark/Lake → Jackson"), else the city, else
// the trip's name. English first; a name typed only in the Sheet's other
// column still prints rather than leave the line blank.
function where(h, tripName) {
  const line = h.line ? h.line.en || h.line.jp : "";
  const route = h.route ? (h.route.fromEn || h.route.fromJp) + " → " + (h.route.toEn || h.route.toJp) : "";
  const text = [line, route].filter(Boolean).join(" · ") || h.city || str(tripName);
  return text ? el("div", "tk-route", text) : null;
}

// A photo address that failed to load is not drawn again (this visit).
const failedPhotos = new Set();

// What shows when the stop is open: the photo, how to get there, the note,
// and the buttons (directions, and the stop's own link).
function more(stop, tix, keep) {
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
  // Show ticket: the ticket itself, stapled to the line (the Days view opens it).
  if (tix) inner.append(showKey(stop, tix, keep));
  const btns = el("div", "r-btns");
  const link = (cls, text, href) => {
    const a = el("a", cls, text);
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener";
    return a;
  };
  const map = mapsUrl(stop);
  if (map) btns.append(link("r-map", "Directions from here ↗", map));
  const own = safeHref(stop.link);
  if (own) btns.append(link("r-map alt", "Ticket or booking ↗", own));
  // Opens the stop sheet on this stop (js/views/stopsheet.js).
  const edit = el("button", "r-edit", "Edit");
  edit.type = "button";
  btns.append(edit);
  inner.append(btns);
  // Said once per visit (the Days view shows it on one stop only).
  if (map) {
    const why = el("p", "r-why", "Opens Maps from where your phone is, by train and bus.");
    why.hidden = true;
    inner.append(why);
  }
  wrap.append(inner);
  return wrap;
}

// The big stub on an open stop, a button: Show ticket.
function showKey(stop, tix, keep) {
  const b = el("button", "r-tk");
  b.type = "button";
  b.setAttribute("aria-label", "Show ticket: " + statusWords(tix, tix.count));
  if (tix.kind === "ref") {
    const c = el("span", "resv is-big");
    const l = el("span", "resv-l");
    l.append(el("span", "ts-k", "Reserved"), el("span", "ts-n", "Show ticket"));
    const r = el("span", "resv-r", "Reference only");
    if (tix.ref) r.append(el("b", "", tix.ref));
    c.append(l, r);
    const pin = el("span", "staple");
    pin.setAttribute("aria-hidden", "true");
    b.append(pin, c);
    return b;
  }
  b.append(bigStubEl({
    stock: tix.stock,
    band: kindWord(tix.stock) + " · " + bandDay(stop.date, stop.time),
    name: "Show ticket",
    sub: tix.count + " · " + (tix.saved ? "on this phone" : "needs signal once"),
    seat: tix.seat,
    thumb: tix.first ? thumbEl(keep, tix.first) : null,
    ghost: !tix.saved,
  }));
  return b;
}

function row(stop, i, model, keep) {
  const { state, minutes, nextId } = model;
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
  // From where you are: the sign, the miles and the walk.
  const hereNext = next && model.hereNext ? model.hereNext : null;
  const signed = hereNext;
  if (signed) {
    const h = el("div", "r-here");
    h.append(bladeEl(signed.from), el("span", "dist", signed.dist));
    body.append(h);
    r.classList.add("has-here");
  }
  const lead = hereNext ? hereNext.lead : next ? nextLine(stop, minutes) : "";
  const tix = model.tix && model.tix[stop.id] ? model.tix[stop.id] : null;
  const detail = str(stop.detail);
  if (lead || detail) {
    const s = el("div", "r-s");
    if (lead) s.append(el("b", hereNext && hereNext.late ? "r-lv is-late" : "r-lv", lead));
    if (lead && detail) s.append(" ");
    if (detail) s.append(detail);
    body.append(s);
  }
  // The ticket, stapled under the name; once the stop is over, the time clock's USED print across it.
  if (tix) {
    const used = r.classList.contains("is-done");
    body.append(onCheckEl(tix, { used, usedText: "USED", sm: true }));
    r.classList.add("has-tix");
  }
  // The price column of the check: a stop carries no price of its own (what
  // was paid is rung up on Money), so it holds the check's blank dot.
  const price = el("div", "r-j", "·");
  price.setAttribute("aria-hidden", "true");
  r.append(el("div", "r-t", minutesOf(stop.time) === null ? "—" : stop.time), body, price, more(stop, tix, keep));
  return r;
}

// Drawn once per day, place and mark; a redraw reuses the string.
const stamps = new Map();

// A used day's SERVED print, the same on every phone: seeded from the date's
// digits; its place the day's last station, else the city.
function gate(day, h, mark) {
  const seed = Number(day.date.replace(/-/g, "")) || 1;
  const place = str(day.toEn) || str(day.toJp) || h.city;
  const key = seed + "|" + place + "|" + mark;
  if (!stamps.has(key)) {
    stamps.set(key, { svg: gateStampSVG(seed, place, gateDate(day.date), mark), rot: (-10 + rng(seed)() * 7).toFixed(1) + "deg" });
  }
  const { svg, rot } = stamps.get(key);
  const insp = el("div", "insp");
  insp.style.setProperty("--rot", rot);
  insp.innerHTML = svg; // escaped by gateStampSVG
  return insp;
}

// The stub's left-hand side: on Day 1 before the trip, how many days until
// the check is good; otherwise the diner's thanks.
function validity(number, toGo) {
  if (number === 1 && toGo > 0) return el("span", "tk-valid", toGo === 1 ? "Valid tomorrow" : "Valid in " + toGo + " days");
  return el("span", "tk-valid", "Thank you, call again");
}

// Under the heading, on the day whose stamp is open and not yet pressed: a
// line that opens the placemat (the Days view sees to the tap).
function stampLine() {
  const b = el("button", "tk-stampline");
  b.type = "button";
  b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle class="d" cx="12" cy="12" r="9.5"/><circle cx="12" cy="12" r="4.2"/></svg>';
  b.append(el("span", "", "Today’s stamp is open"), el("i", "", "›"));
  return b;
}

// The one-time ask, under the heading of today's check.
function askLine() {
  const q = "Leave-by times from where you are?";
  const d = el("div", "tk-ask");
  d.setAttribute("role", "group");
  d.setAttribute("aria-label", q);
  const m = el("div", "ask-m");
  m.append(plainBlade("FROM HERE"));
  const keys = el("div", "ask-k");
  const key = (cls, text) => {
    const k = document.createElement("button");
    k.type = "button";
    k.className = cls;
    k.textContent = text;
    return k;
  };
  keys.append(key("yes", "Use it"), key("no", "Not now"));
  d.append(m, el("b", "ask-q", q), el("span", "ask-s", "Your location stays on this phone."), keys);
  return d;
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

// One box of the row across the top of the check.
function box(label, value, cls) {
  const d = el("div", cls);
  d.append(el("small", "", label), el("b", "", value));
  return d;
}

export function ticketEl(model, { keep = null } = {}) {
  const { day, number, header: h, stops, mark, tripName, state, total, toGo } = model;
  const date = day.date;
  const tk = el("article", "tk");

  const people = String(model.people || 2);
  const boxes = el("div", "gc-box");
  boxes.append(box("Date", checkDate(date)), box("Table", people), box("Guests", people), box("Server", str(model.server) || "—"), box("No.", String(number).padStart(4, "0"), "num"));

  const head = el("div", "tk-head");
  const title = el("div", "gc-t", "Guest Check");
  const when = el("i", "tk-date");
  when.append(el("span", "", dayHead(date).en));
  if (h.title) when.append(" · ", el("span", "tk-title", h.title));
  title.append(when);
  head.append(title);
  const w = where(h, tripName);
  if (w) head.append(w);
  if (model.stampOpen) head.append(stampLine());
  if (model.ask) head.append(askLine());

  const rows = el("div", "rows");
  if (stops.length) rows.append(...stops.map((stop, i) => row(stop, i, model, keep)));
  else rows.append(el("div", "r-none", "Nothing planned yet."));

  // The double rule under the heading; a used day's check has been on the spindle: a hole through it.
  const perf = el("div", "tk-perf");
  if (state === "used") perf.append(el("span", "punch"));
  tk.append(boxes, head, perf, rows);
  // A stay typed into the Sheet by hand with no id cannot be opened: no row.
  const stay = model.stay;
  // ＋ Add a stop: after the day's stops, before the night's stay.
  const add = el("button", "tk-add", "＋ Add a stop");
  add.type = "button";
  add.dataset.date = date;
  tk.append(add);
  if (stay && typeof stay.id === "string" && stay.id) tk.append(stayRow(stay));
  // The day's total, as a bill's: what was rung up for this day.
  if (total > 0) {
    const tot = el("div", "tk-kind");
    const fig = el("span", "tk-fig");
    fig.append(el("b", "fare", tripMoney(total)));
    if (model.totalHome > 0) fig.append(el("small", "", dollars(model.totalHome)));
    tot.append(el("span", "", "Today, about"), fig);
    tk.append(tot);
  }
  const foot = el("div", "tk-foot");
  foot.append(validity(number, toGo), el("span", "", issueLine(date)));
  tk.append(foot);
  // A used day: the cashier's SERVED print, on the stub.
  if (state === "used") tk.append(gate(day, h, mark));
  return tk;
}
