/* Copyright (c) 2026 moissmart1. All rights reserved. No licence is granted: do not copy, adapt or reuse this code or design, and do not use it to train or prompt an AI system to reproduce it. See LICENSE. */
// "Before we go", look K ("the rail"): the bookings and prep from the
// planner's Book Now tab. What is still to book hangs from a steel ticket
// rail as order slips, soonest first, two to a rail; what is booked is on the
// spike below, newest first. Its own screen (#vBefore), the Before key in the
// bar (js/app.js).
//
// mountBefore(root, store, { clock, now, onState, onSlip }) -> { el, wake(), shown(), settled(id) }
// - root: #vBefore; the list is drawn into it, built once and then patched.
// - clock: the Days clock; before the trip's first day by it (in the trip's
//   zone) the key is always there; from the first day on only while
//   something is open (showBeforeTab, js/todos.js). No planner linked, or no
//   items: no key.
// - onState({ show, open }): told on every redraw whether the key is in the
//   bar and how many items are open (a slip just rung is no longer counted).
// - onSlip(id, button): a slip, on the rail or on the spike, was tapped; the
//   app opens the slip in your hand (js/views/hand.js).
// - now(): the real time, for the due lines (counted on the Toronto calendar,
//   js/todos.js) and for when a fetch is due.
// - shown(): the app calls it each time the tab is shown: the spike's long
//   list is folded again, and the list is fetched quietly when it is an hour
//   old or more and the phone has signal (no spinner; a notice only when that
//   fails twice in a row). wake() does the fetch alone.
// - settled(id): the slip rung at the counter has gone onto the spike: it
//   drops onto it once, and focus goes to the spike's heading.
//
// Under the Fetch line, "Not read from the planner": the items the last pull
// could not read (store.state.todoProblems). Fetch says "Read 13:20" when the
// backend answered with the list it read then.
//
// Redrawing while someone is reading: a slip that is drawn the same keeps its
// node, so focus and a screen reader's place survive a sync. A tap goes
// through tapOnRelease (js/views/tap.js): a redraw between finger down and
// finger up still opens the slip. Everything from the planner goes in with
// textContent only.

import { nowIn } from "../plan.js";
import { fillSeal } from "../picture.js";
import { calm } from "../fx.js";
import { clock as hhmm, localDay, dayHead } from "../format.js";
import { homeToday, dueLine, dueText, openTodos, doneTodos, plannerPending, isStale, showBeforeTab, todoProblemHead } from "../todos.js";
import { slipNo, slipTone, statusWord, slipTilt, printText, railWords, emptyWords, spikeShown, daysToGo } from "../before.js";
import { tapOnRelease } from "./tap.js";
import { TRIP_TZ } from "../trip.js";

// How long the Fetch key says how a fetch went.
const SAID_MS = 4000;
const FETCH = "Fetch";
const FETCHING = "Fetching…";
const FETCHED = "Up to date ✓";
const MORE = "More to fetch";
const NOT_FETCHED = "Not fetched";
const PROBLEMS = "Not read from the planner";
export const PENDING = "The planner hasn’t been updated yet.";
export const COMPUTES = "The planner works this one out itself, so the app left it as it was.";
export const WAITING = "will send when signal returns";
const AUTO_FAILED = "Couldn’t fetch the list from the planner.";

export function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

const list = (v) => (Array.isArray(v) ? v : []);
const online = (s) => s.online !== false && !(globalThis.navigator && globalThis.navigator.onLine === false);
const full = (text) => (/[.?!]$/.test(text) ? text : text + ".");

// "Nov 28": a moment's day on the phone's own calendar, without the weekday.
export function shortDay(ms) {
  return isFinite(ms) ? dayHead(localDay(ms), []).en.split(" ").slice(1).join(" ") : "";
}

// The small line under a slip, when one applies: a tick waiting for signal,
// one the planner computes itself, one the planner has not taken yet.
export function slipSmall(t, s) {
  if (t.pending && !online(s)) return WAITING;
  if (t.plannerComputes === true && String(t.tickedBy || "").trim() !== "") return COMPUTES;
  if (plannerPending(t)) return PENDING;
  return "";
}

// Who is on it, in words ("You’re on it", "Izzah’s on it"), or "".
export function onWords(t, me) {
  return !t.claimedBy ? "" : t.claimedBy === me ? "You’re on it" : t.claimedBy + "’s on it";
}

// What a slip is drawn from, to tell whether a redraw changed it.
const drawn = new WeakMap();

export function mountBefore(root, store, { clock, now = () => Date.now(), onState = () => {}, onSlip = () => {} } = {}) {
  const section = el("section", "bf");
  section.id = "before";
  section.hidden = true;
  section.setAttribute("aria-labelledby", "bfTitle");
  section.innerHTML = `
  <div class="bf-bar"><h2 class="bf-bar-d" id="bfTitle" tabindex="-1"></h2><span class="bf-bar-t" id="bfCount"></span></div>
  <div id="bfOpen" role="list" aria-label="Still to book"></div>
  <div class="bf-empty" id="bfEmpty" hidden></div>
  <div class="bf-sp" id="bfSpike" hidden>
    <h3 class="bf-sp-h" id="bfSpikeH" tabindex="-1"></h3>
    <div class="bf-rod" aria-hidden="true"></div>
    <div id="bfDone" role="list" aria-labelledby="bfSpikeH"></div>
    <div class="bf-base" aria-hidden="true"></div>
    <button type="button" class="bf-more" id="bfMore" hidden></button>
  </div>
  <div class="bf-foot"><span id="bfAt"></span><button type="button" id="bfFetch" aria-live="polite"></button></div>
  <div class="bf-prob" id="bfProblems" hidden></div>`;
  root.replaceChildren(section);
  const $ = (id) => section.querySelector("#" + id);
  const title = $("bfTitle");
  title.textContent = "Before we go";
  const count = $("bfCount");
  const rows = $("bfOpen");
  const empty = $("bfEmpty");
  const spike = $("bfSpike");
  const spikeH = $("bfSpikeH");
  const doneBox = $("bfDone");
  const more = $("bfMore");
  const at = $("bfAt");
  const fetchB = $("bfFetch");
  fetchB.textContent = FETCH;
  const probs = $("bfProblems");

  let me = null;
  let people = [];
  let allOpen = false; // the spike's whole list is showing

  // ---- drawing ----

  const picKey = (name) => {
    const p = people.find((x) => x.name === name);
    const v = p && typeof p.photo === "string" ? p.photo : "";
    return v ? v.length + v.slice(-24) : "";
  };

  function seal(name) {
    const s = el("span", "mini sm");
    s.setAttribute("aria-hidden", "true");
    fillSeal(s, people.find((p) => p.name === name) || null, name);
    return s;
  }

  function dueEl(d) {
    if (!d) return el("span", "bf-due none", "No date");
    const line = el("span", "bf-due" + (d.strong ? " soon" : ""));
    line.dataset.due = d.state;
    line.append(d.lead + " ", el("b", "", d.date), el("em", "", d.tail));
    return line;
  }

  function openSlip(t, today, position) {
    const wrap = el("div", "bf-hang");
    wrap.setAttribute("role", "listitem");
    wrap.dataset.id = t.id;
    wrap.style.setProperty("--r", slipTilt(t.id) + "deg");
    const d = dueLine(t.bookBy, today);
    const status = statusWord(t.status);
    const tone = slipTone(t.status);
    const who = onWords(t, me);
    const b = el("button", "bf-t" + (tone ? " " + tone : "") + (t.pending ? " is-pending" : ""));
    b.type = "button";
    b.dataset.act = "open";
    b.dataset.id = t.id;
    b.setAttribute("aria-label", [String(position + 1), t.item, status, d ? dueText(d) : "No date", who].filter(Boolean).map(full).join(" "));
    const top = el("span", "bf-top");
    top.append(el("b", "", slipNo(t.id, position)), el("span", "", status));
    b.append(top, el("span", "bf-n", t.item), dueEl(d));
    if (who) {
      const w = el("span", "bf-who");
      w.append(seal(t.claimedBy), who);
      b.append(w);
    }
    wrap.append(b);
    drawn.set(wrap, JSON.stringify(["o", t.id, slipNo(t.id, position), position, t.item, status, tone, t.bookBy, today, t.claimedBy, me, picKey(t.claimedBy), !!t.pending]));
    return wrap;
  }

  function spikedSlip(t, position, s) {
    const wrap = el("div");
    wrap.setAttribute("role", "listitem");
    wrap.dataset.id = t.id;
    const by = String(t.tickedBy || "").trim();
    const ms = Date.parse(t.tickedAt || "");
    const p = printText(t);
    const small = slipSmall(t, s);
    const b = el("button", "bf-slip" + (position % 2 === 0 ? " yel" : "") + (t.pending ? " is-pending" : ""));
    b.type = "button";
    b.dataset.act = "spiked";
    b.dataset.id = t.id;
    b.style.setProperty("--r", Math.round(slipTilt(t.id) * 16) / 10 + "deg");
    const day = shortDay(ms);
    b.setAttribute("aria-label", full(t.item) + " " + (by ? "Booked by " + by + (day ? ", " + day : "") + "." : "Booked in the planner."));
    const mark = el("span", "tclock", by ? p.big + " " + p.small : p.big + " · " + p.small);
    mark.setAttribute("aria-hidden", "true");
    b.append(el("s", "", t.item), el("i"), mark);
    if (small) b.append(el("small", "", small));
    wrap.append(b);
    drawn.set(wrap, JSON.stringify(["d", t.id, position % 2, t.item, by, t.tickedAt, !!t.pending, small]));
    return wrap;
  }

  // Puts `fresh` into `box` in order, keeping each node that is drawn the same.
  function patch(box, fresh) {
    const old = new Map();
    for (const n of box.children) if (n.dataset.id) old.set(n.dataset.id, n);
    const want = fresh.map((n) => {
      const keep = old.get(n.dataset.id);
      return keep && drawn.get(keep) === drawn.get(n) ? keep : n;
    });
    want.forEach((node, i) => {
      const here = box.children[i];
      if (here !== node) box.insertBefore(node, here || null);
    });
    while (box.children.length > want.length) box.lastElementChild.remove();
  }

  // The rails and their rows: a rail, then its row of up to two slips, and so on.
  // The slips already there keep their nodes (moved only when their place changed).
  function patchRail(slips) {
    const have = new Map();
    for (const row of rows.querySelectorAll(".bf-row")) for (const n of row.children) have.set(n.dataset.id, n);
    const want = slips.map((n) => {
      const keep = have.get(n.dataset.id);
      return keep && drawn.get(keep) === drawn.get(n) ? keep : n;
    });
    const pairs = Math.max(1, Math.ceil(want.length / 2));
    // rails and rows in order: rail, row, rail, row ...
    const wantKids = [];
    const rails = [...rows.querySelectorAll(":scope > .bf-rail")];
    const rowEls = [...rows.querySelectorAll(":scope > .bf-row")];
    for (let i = 0; i < pairs; i++) {
      wantKids.push(rails[i] || el("div", "bf-rail"));
      if (!want.length) break;
      wantKids.push(rowEls[i] || el("div", "bf-row"));
    }
    wantKids.forEach((node, i) => {
      if (node.classList.contains("bf-rail")) node.setAttribute("aria-hidden", "true");
      else node.setAttribute("role", "presentation");
      if (rows.children[i] !== node) rows.insertBefore(node, rows.children[i] || null);
    });
    while (rows.children.length > wantKids.length) rows.lastElementChild.remove();
    wantKids.filter((n) => n.classList.contains("bf-row")).forEach((row, i) => {
      const mine = want.slice(i * 2, i * 2 + 2);
      mine.forEach((node, j) => {
        if (row.children[j] !== node) row.insertBefore(node, row.children[j] || null);
      });
      while (row.children.length > mine.length) row.lastElementChild.remove();
    });
  }

  // Where focus is in the list, to put it back if a redraw replaced its node.
  function focusSpot() {
    const a = document.activeElement;
    if (!a || !section.contains(a)) return null;
    const r = a.closest("[data-id]");
    return { node: a, id: r ? r.dataset.id : null, act: a.dataset.act || null };
  }
  function restoreFocus(spot) {
    if (!spot || spot.node.isConnected || !spot.id) return;
    const r = section.querySelector('[data-id="' + CSS.escape(spot.id) + '"] button');
    if (r && typeof r.focus === "function") r.focus({ preventScroll: true });
  }

  // Before the trip's first day, by the Days clock, in the trip's zone.
  function beforeTrip(s) {
    const trip = s.trip;
    if (!trip || typeof trip.start !== "string" || !trip.start) return true;
    return nowIn(TRIP_TZ, clock ? clock.now() : now()).date < trip.start;
  }

  // "13:20" today, "Dec 3, 13:20" another day: the phone's own clock.
  function whenText(ms) {
    const day = localDay(ms);
    return day === localDay(now()) ? hhmm(ms) : shortDay(ms) + ", " + hhmm(ms);
  }

  // The items the last pull could not read. Planner text is untrusted:
  // textContent only. Redrawn only when the list changes, so a screen reader
  // is not read it again on every store change.
  let shownProblems = null;
  function drawProblems(s) {
    const tp = s.todoProblems && typeof s.todoProblems === "object" ? s.todoProblems : {};
    const all = list(tp.list).filter((p) => p && typeof p === "object");
    const extra = Number.isFinite(tp.more) && tp.more > 0 ? tp.more : 0;
    const key = all.length ? JSON.stringify([tp.at, all, extra]) : "";
    probs.hidden = !all.length;
    if (key === shownProblems) return;
    shownProblems = key;
    probs.replaceChildren();
    if (!all.length) return;
    const head = el("b", "", PROBLEMS);
    const ms = Date.parse(typeof tp.at === "string" ? tp.at : "");
    if (isFinite(ms)) head.append(el("small", "", whenText(ms)));
    probs.append(head);
    for (const p of all) {
      const one = el("div");
      one.append(el("b", "", todoProblemHead(p)), typeof p.message === "string" ? p.message : "");
      probs.append(one);
    }
    if (extra) probs.append(el("div", "", "and " + extra + " more"));
  }

  function fetchedText(s) {
    const ms = Date.parse(typeof s.todosPulledAt === "string" ? s.todosPulledAt : "");
    return isFinite(ms) ? "Read from the planner " + whenText(ms) : "From the planner";
  }

  function render() {
    const s = store.state;
    me = s.me;
    people = list(s.people);
    const todos = list(s.todos).filter((t) => t && typeof t.id === "string" && t.id && typeof t.item === "string");
    // The trip was taken off this phone: the list goes, with every word of it.
    if (s.status === "nokey") {
      allOpen = false;
      shownProblems = null;
      for (const box of [rows, doneBox, probs]) box.replaceChildren();
      for (const box of [count, spikeH, at, empty]) box.textContent = "";
    }
    const ready = s.status === "ready" && s.plannerLinked === true && todos.length > 0;
    const open = openTodos(todos);
    const show = showBeforeTab({ loaded: ready, beforeTrip: ready && beforeTrip(s), openCount: open.length });
    // The app puts the person on Days if this was their screen, then focus can follow.
    onState({ show, open: open.length });
    if (!show) {
      section.hidden = true;
      return;
    }
    const spot = focusSpot();
    section.hidden = false;
    const today = homeToday(now());
    const done = doneTodos(todos);

    count.textContent = railWords(open.length, daysToGo(s.trip, today));
    patchRail(open.map((t, i) => openSlip(t, today, i)));
    const nothing = open.length === 0;
    empty.hidden = !nothing;
    if (nothing) {
      const w = emptyWords(done.length);
      empty.replaceChildren(w.h, ...(w.s ? [el("small", "", w.s)] : []));
    }

    spike.hidden = !done.length;
    spikeH.textContent = "On the spike · " + done.length + " booked";
    const shown = spikeShown(done, allOpen);
    patch(doneBox, shown.list.map((t, i) => spikedSlip(t, i, s)));
    more.hidden = !(shown.more > 0 || (allOpen && done.length > 3));
    if (!more.hidden) {
      more.textContent = allOpen ? "Show fewer" : "and " + shown.more + " more under these";
      more.setAttribute("aria-expanded", String(allOpen));
    }

    at.textContent = fetchedText(s);
    drawProblems(s);
    restoreFocus(spot);
  }

  // ---- acting ----

  const tap = tapOnRelease(section, {
    pick: (t) => {
      const b = t.closest("button[data-act]");
      return b && b.dataset.id && section.contains(b) ? { act: b.dataset.act, id: b.dataset.id } : null;
    },
    act: ({ id }) => {
      const b = section.querySelector('button[data-id="' + CSS.escape(id) + '"]');
      if (b) onSlip(id, b);
    },
  });
  section.addEventListener("click", (ev) => {
    if (tap.skip(ev)) return;
    const t = ev.target;
    if (t.closest("#bfMore")) {
      allOpen = !allOpen;
      render();
      return;
    }
    if (t.closest("#bfFetch")) {
      fetchNow();
      return;
    }
    const b = t.closest("button[data-act]");
    if (!b || !b.dataset.id || !section.contains(b)) return;
    onSlip(b.dataset.id, b);
  });
  // iPhone Safari draws a pressed look (:active) on touch only when something listens.
  section.addEventListener("touchstart", () => {}, { passive: true });

  // ---- fetching ----

  let pull = null; // the fetch under way, if any
  let fails = 0; // quiet fetches failed in a row
  let sayTimer = null;
  function say(text, ms = 0) {
    clearTimeout(sayTimer);
    fetchB.textContent = text;
    if (ms) sayTimer = setTimeout(() => (fetchB.textContent = FETCH), ms);
  }

  async function fetchNow() {
    if (fetchB.disabled) return;
    fetchB.disabled = true;
    say(FETCHING);
    let r;
    try {
      // A quiet fetch under way finishes first; the tap still gets its own.
      if (pull) await pull;
      r = await store.syncTodos({ force: true });
    } catch {
      r = { ok: false };
    }
    fetchB.disabled = false;
    if (r.ok) fails = 0;
    // The backend's stored list (read within the last 30 seconds): when it was read, not "Up to date".
    const readAt = r.ok && r.stored ? Date.parse(r.pulledAt || "") : NaN;
    say(!r.ok ? NOT_FETCHED : r.more ? MORE : isFinite(readAt) ? "Read " + whenText(readAt) : FETCHED, SAID_MS);
  }

  // Fetch quietly when the list is an hour old or more (once per call).
  function wake() {
    const s = store.state;
    if (pull || s.status !== "ready" || s.plannerLinked !== true || !online(s)) return;
    if (!isStale(s.todosPulledAt, now())) return;
    pull = store.syncTodos({ quiet: true });
    pull.then((r) => {
      pull = null;
      if (r && r.ok) {
        fails = 0;
        return;
      }
      fails += 1;
      if (fails >= 2) {
        fails = 0;
        const refused = r && r.code && r.code !== "network" && r.code !== "server" && r.message;
        store.notify(refused ? r.message : AUTO_FAILED);
      }
    });
  }

  // Each time the tab is shown (js/app.js).
  function shown() {
    // The spike's long list is folded again on coming back.
    if (allOpen) {
      allOpen = false;
      render();
    }
    wake();
  }

  // A slip rung at the counter has gone onto the spike: it drops once.
  function settled(id) {
    render();
    const b = doneBox.querySelector('button[data-id="' + CSS.escape(id) + '"]');
    if (b && !calm()) {
      b.classList.add("is-new");
      b.addEventListener("animationend", () => b.classList.remove("is-new"), { once: true });
    }
    if (!spike.hidden) spikeH.focus({ preventScroll: true });
  }

  store.subscribe(render);
  if (clock && clock.subscribe) clock.subscribe(render);
  render();

  return { el: section, wake, shown, settled };
}
