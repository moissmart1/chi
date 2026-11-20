/* Copyright (c) 2026 moissmart1. All rights reserved. No licence is granted: do not copy, adapt or reuse this code or design, and do not use it to train or prompt an AI system to reproduce it. See LICENSE. */
// The Money screen: where you stand, the settlement slip (js/views/slip.js)
// and the till receipt.
// mountMoney(root, store, { onRing(day), onLine(id), onHistory(), onPlanner() }) draws into
// root and redraws on every store change. The pill under the sentence ("2
// planner lines need a look") shows while the planner's payments could not be
// brought in; a tap calls onPlanner() (the app opens You on the Planner row). Every figure comes from money.js and
// format.js; text from people or the Sheet goes in with textContent only.

import { standing, tripCents, cadCents, shares } from "../money.js";
import { tripDay } from "../time.js";
import { mountSlip, viewerOwed } from "./slip.js";
import { tripMoney, dollars, typed, dayHead, pt, freshText, sentence, tripSpan } from "../format.js";
import { checkDate } from "../plan.js";
import { fillSeal } from "../picture.js";
import { lookWords } from "../before.js";

const UNREACHABLE = "Couldn’t reach the trip sheet.";
const STAND_IN_RATE = "US dollars are being converted at a stand-in rate of 0.72.";

// The one line about Sheet rows the app has left out (store.state.setAside).
export function setAsideText(list) {
  if (!list || !list.length) return "";
  const why = [...new Set(list.map((x) => (x.reason === "name" ? "a name the app doesn’t know" : "an amount the app can’t read")))].join(", or ");
  return list.length === 1
    ? "1 line in the Sheet can’t be read (" + why + "). It’s left out of the totals. Tell Mo."
    : list.length + " lines in the Sheet can’t be read (" + why + "). They’re left out of the totals. Tell Mo.";
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

// An element whose content is a figure: pt() escapes it before adding spans.
function fig(tag, cls, str) {
  const n = el(tag, cls);
  n.innerHTML = pt(str);
  return n;
}

const sum = (list, f) => list.reduce((a, x) => a + f(x), 0);
const after = (iso, ms) => ms !== null && typeof iso === "string" && Date.parse(iso) > ms;

// Added by someone else since the viewer last looked.
export function isNewLine(e, me, seenAt) {
  return !!e.addedBy && e.addedBy !== me && after(e.addedAt, seenAt);
}

function isNewStamp(p, me, seenAt) {
  return !p.removed && !!p.stampedBy && p.stampedBy !== me && after(p.stampedAt, seenAt);
}

// Each trip day up to today (all of them after the trip) and any later day
// that already has a line, newest first; then "pre", the oldest, at the bottom.
function receiptDays(s, live, nowMs) {
  const today = tripDay(s.trip, nowMs);
  const dates = new Set();
  for (const d of s.days) {
    if (d.date && (today === "post" || (today !== "pre" && d.date <= today))) dates.add(d.date);
  }
  for (const e of live) if (e.day !== "pre") dates.add(e.day);
  return [...[...dates].sort().reverse(), "pre"];
}

function drawLine(e, ctx) {
  const row = el("div", "rc-row");
  row.dataset.id = e.id;
  row.setAttribute("role", "button");
  row.tabIndex = 0;
  if (e.pending) row.classList.add("is-pending");
  if (e.failed) row.classList.add("is-failed");
  if (isNewLine(e, ctx.me, ctx.seenAt)) row.classList.add("is-new");

  const payer = ctx.people.find((p) => p.name === e.paidBy);
  const t = el("span", "rc-t", e.title);
  if (e.note) t.append(el("small", "rc-note", e.note));
  const only = !ctx.names.every((n) => e.split.includes(n));
  const uneven = !!e.splitMode && e.splitMode !== "equal";
  if (only || uneven) {
    // "Ajen + Trenton only · uneven", the names in bold
    const small = el("small");
    if (only) {
      e.split.forEach((n, i) => small.append(...(i ? [" + "] : []), el("b", "", n)));
      small.append(" only");
    }
    if (uneven) small.append((only ? " · " : "") + "uneven");
    t.append(small);
  }
  if (e.failed) t.append(el("small", "rc-fail", "not saved, tap to retry"));
  else if (e.pending && !ctx.online) t.append(el("small", "rc-wait", "will send when signal returns"));
  row.append(fillSeal(el("span", "mini"), payer, e.paidBy, { named: true }), t, fig("span", "rc-amt", typed(e)));
  return row;
}

function drawDay(day, lines, ctx) {
  const group = el("section", "rc-group");
  group.dataset.day = day;
  const h = dayHead(day, ctx.days);
  const head = el("div", "rc-day");
  head.append(el("span", "", h.en));
  if (h.city) head.append(el("span", "rc-city", h.city));
  group.append(head);
  if (!lines.length) {
    const empty = el("div", "rc-empty");
    const add = el("button", "", "Ring up");
    add.type = "button";
    add.dataset.addday = day;
    empty.append(el("span", "", "Nothing rung up yet"), add);
    group.append(empty);
  } else {
    for (const e of lines) group.append(drawLine(e, ctx));
    const sub = el("div", "rc-sub");
    sub.append(el("span", "", "Subtotal"), fig("b", "rc-cad", dollars(sum(lines, cadCents))), fig("b", "", tripMoney(sum(lines, tripCents))));
    group.append(sub);
  }
  group.append(el("div", "rule"));
  return group;
}

function drawReceipt(rc, s, live, ctx) {
  // The tab: a guest check for the whole week. The boxes across the top, then
  // "Guest Check" over the trip's name and dates; where the spindle goes
  // through it when everything is paid (.rc-spike, css/money.css).
  const boxes = el("div", "gc-box");
  const box = (label, value) => {
    const d = el("div");
    d.append(el("small", "", label), el("b", "", value));
    return d;
  };
  const people = String(s.people.length);
  boxes.append(box("Date", checkDate(s.trip.start) + " on"), box("Table", people), box("Guests", people), box("Server", s.people.length === 2 ? "Both" : "All"), box("No.", "TAB"));
  const spike = el("span", "rc-spike");
  spike.setAttribute("aria-hidden", "true");
  spike.innerHTML = '<svg viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="12" r="11" fill="#2b2b2b"/><circle cx="12" cy="12" r="8.5" fill="#B9BFC2"/><circle cx="9.5" cy="9" r="3.5" fill="#fff" opacity=".7"/><circle cx="12" cy="12" r="1.6" fill="#333"/></svg>';
  const head = el("div", "rc-h");
  const title = el("div", "gc-t", "Guest Check");
  title.append(el("i", "", "The whole week"));
  head.append(title, el("div", "rc-trip", [s.trip.name, tripSpan(s.trip)].filter(Boolean).join(", ")));
  if (s.loadedAt !== null) {
    const fresh = el("button", "rc-fresh", freshText(s.loadedAt));
    fresh.type = "button";
    fresh.id = "fresh";
    head.append(fresh);
  }

  // Newest line first. Sorted oldest first (the sort is stable) and then turned
  // over, so lines with the same time also flip: a later Sheet row sits higher.
  const newestFirst = live.slice().sort((a, b) => ((a.addedAt || "") < (b.addedAt || "") ? -1 : (a.addedAt || "") > (b.addedAt || "") ? 1 : 0)).reverse();
  const days = receiptDays(s, live, ctx.nowMs).map((day) => drawDay(day, newestFirst.filter((e) => e.day === day), ctx));

  const totalTrip = sum(live, tripCents);
  const tot = el("div", "rc-tot");
  tot.append(el("span", "", "Total"), fig("b", "", tripMoney(totalTrip)));
  const inDollars = el("div", "rc-sub");
  inDollars.append(el("span", "", "in dollars"), fig("b", "", dollars(sum(live, cadCents))));
  const each = el("div", "rc-sub");
  each.append(el("span", "", "Each, about"), fig("b", "", tripMoney(shares(totalTrip, ctx.names)[ctx.names[0]])));
  const foot = el("div", "rc-f", "Thank you, call again.");

  rc.replaceChildren(boxes, spike, head, el("div", "rule"), ...days, tot, inDollars, each, foot);
}

export function mountMoney(root, store, { onRing = () => {}, onLine = () => {}, onHistory = () => {}, onPlanner = () => {}, now = () => Date.now() } = {}) {
  const say = el("h1");
  say.id = "say";
  const sayP = el("p");
  sayP.id = "sayP";
  const histBtn = el("button", "hist-btn", "History");
  histBtn.type = "button";
  histBtn.id = "histBtn";
  const histN = el("span", "hist-n");
  histN.id = "histN";
  histN.hidden = true;
  histBtn.append(histN);
  const top = el("div", "say");
  // Plain warnings about the figures, under the trip summary: a stand-in rate,
  // and Sheet rows left out of the totals.
  const rateNote = el("p", "say-warn");
  rateNote.id = "rateNote";
  rateNote.hidden = true;
  const asideNote = el("p", "say-warn");
  asideNote.id = "asideNote";
  asideNote.setAttribute("role", "status");
  asideNote.hidden = true;
  const look = el("button", "pl-look");
  look.type = "button";
  look.id = "plLook";
  look.hidden = true;
  const lookN = el("i");
  const lookT = el("span");
  look.append(lookN, lookT);
  top.append(say, sayP, look, rateNote, asideNote, histBtn);
  const slip = el("div", "slip");
  slip.id = "slip";
  const rc = el("div", "rc");
  rc.id = "rc";
  // The week's tab first, its settling at its foot (the mock-up's order).
  const title = el("div", "bar money-bar");
  title.append(el("b", "bar-d", "The tab"));
  root.replaceChildren(title, top, rc, slip);
  mountSlip(slip, store);

  histBtn.addEventListener("click", () => onHistory());
  look.addEventListener("click", () => onPlanner());
  const act = (target) => {
    if (target.closest("#fresh")) return store.refresh();
    const add = target.closest("[data-addday]");
    if (add) return onRing(add.dataset.addday);
    const row = target.closest(".rc-row[data-id]");
    if (!row) return;
    onLine(row.dataset.id);
  };
  rc.addEventListener("click", (ev) => act(ev.target));
  rc.addEventListener("keydown", (ev) => {
    if ((ev.key === "Enter" || ev.key === " ") && ev.target.matches(".rc-row[data-id]")) {
      ev.preventDefault();
      act(ev.target);
    }
  });

  function render(s) {
    const names = s.people.map((p) => p.name);
    if (!s.trip || !s.trip.start || !names.length) {
      say.textContent = "";
      sayP.textContent = s.status === "error" ? UNREACHABLE : "";
      rateNote.hidden = true;
      asideNote.hidden = true;
      look.hidden = true;
      histBtn.hidden = true;
      slip.hidden = true;
      rc.replaceChildren();
      return;
    }
    histBtn.hidden = false;
    slip.hidden = false;
    // The same reading the slip shows (one source: viewerOwed).
    const { live, list, bal } = viewerOwed(s);
    say.textContent = s.me ? sentence(standing(s.me, list, bal)) : "";
    // The words stay dim; the three figures are bold and bright.
    sayP.replaceChildren("The trip so far is ", el("b", "", dollars(sum(live, cadCents))), ", about ", el("b", "", tripMoney(sum(live, tripCents))),
      ", across ", el("b", "", String(live.length)), live.length === 1 ? " receipt." : " receipts.");
    rateNote.hidden = s.rateSource !== "fallback";
    rateNote.textContent = rateNote.hidden ? "" : STAND_IN_RATE;
    // Planner payments that could not be brought in (the list is on You).
    const pp = s.paymentProblems && typeof s.paymentProblems === "object" ? s.paymentProblems : {};
    const lookCount = s.plannerLinked === true ? (Array.isArray(pp.list) ? pp.list.length : 0) + (Number.isFinite(pp.more) && pp.more > 0 ? pp.more : 0) : 0;
    look.hidden = lookCount < 1;
    if (lookCount > 0) {
      const words = lookWords(lookCount);
      lookN.textContent = String(lookCount);
      lookT.textContent = words.slice(String(lookCount).length + 1);
      look.setAttribute("aria-label", words);
    }
    const aside = setAsideText(s.setAside);
    asideNote.hidden = !aside;
    asideNote.textContent = aside;

    const ctx = { me: s.me, online: s.online, seenAt: s.seenAt, people: s.people, names, days: s.days, nowMs: now() };
    // The one count of what is new: lines and stamps by someone else since you looked.
    const fresh = live.filter((e) => isNewLine(e, s.me, s.seenAt)).length + s.payments.filter((p) => isNewStamp(p, s.me, s.seenAt)).length;
    histN.textContent = String(fresh);
    histN.hidden = fresh === 0;

    drawReceipt(rc, s, live, ctx);
    // Paid up: nothing left to send and at least one payment stamped. The tab
    // goes on the spindle; an undo that brings a debt back takes it off.
    const spiked = list.length === 0 && s.payments.some((p) => !p.removed);
    if (rc.classList.contains("is-spiked") !== spiked) {
      rc.classList.toggle("is-spiked", spiked);
      slip.classList.toggle("is-spiked", spiked);
    }
  }

  render(store.state);
  store.subscribe(render);
}
