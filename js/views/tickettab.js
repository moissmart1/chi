/* Copyright (c) 2026 moissmart1. All rights reserved. No licence is granted: do not copy, adapt or reuse this code or design, and do not use it to train or prompt an AI system to reproduce it. See LICENSE. */
// The Tickets tab, look F ("stapled to the check", Mo's pick, 2026-11-19):
// the week's guest checks with their tickets stapled to them. Today's check
// first, its next ticket on the big stub with Show ticket under it, then the
// later days' checks, then the used ones, off their checks, with the time
// clock's USED print. From the trip's first day its key is in the bar
// (beside Days), as the Japan app's Tickets key is (its version 30), but
// only once a stop has a ticket: until then the bar is as it was.
//
// mountTicketTab(root, store, { clock, keep, onTicket, onBefore, onState }) -> { update(), setBefore(n) }
// - root: #vTickets.
// - The order and the counts are js/passcase.js passCase; this only draws it.
// - onTicket(stopId, button): the big stub, Show ticket or a stub was tapped;
//   the app holds up the same ticket a stop's Show ticket does (js/views/stub.js).
// - onState({ on, started, todayLeft }): told on every change whether the key
//   is in the bar and its badge. on: the trip's first day has begun (by the
//   Days clock) and a stop has a ticket, or the Before list still has
//   something open (its slip is on this tab, so the key must be there).
//   started: the trip's first day has begun.
// - setBefore(n): how many Before items are still open (the app tells it from
//   the first day on; 0 once none is). With n > 0 a slip is at the top,
//   "N still to book", and onBefore(button) is called when it is tapped: the
//   app puts the Before pad up as a sheet over this tab (the Japan app's way).
// - A ticket's first picture, small on the big stub, comes from the keep
//   (the pictures already on this phone); nothing is fetched here.
// - The "in N min" of the lead line is changed where it stands each minute:
//   nothing else is redrawn for it, so focus and the picture stay.
// - The trip taken off this phone (status "nokey"): the tab is emptied.
// Every title, detail, seat and reference goes in with textContent.

import { passCase } from "../passcase.js";
import { dayHead } from "../format.js";
import { checkDate } from "../plan.js";
import { tapOnRelease } from "./tap.js";
import { el, tixInfo, stubEl, resvEl, bigStubEl, staple, tclock, thumbEl, kindWord, bandDay, statusWords } from "./stubs.js";

// How often the tab looks again while the app is on screen: a ticket's time
// passing moves it to Used, and midnight on Day 1 brings the key.
const LOOK_MS = 30000;

function button(cls) {
  const b = el("button", cls);
  b.type = "button";
  return b;
}

export function mountTicketTab(root, store, { clock, keep, onTicket = () => {}, onBefore = () => {}, onState = () => {} } = {}) {
  const section = el("section", "tt");
  section.setAttribute("aria-labelledby", "ttTitle");
  root.replaceChildren(section);

  let sig = "";
  let lastState = "";
  let beforeOpen = 0; // Before items still open, from the trip's first day

  const stopOf = (id) => (store.state.stops || []).find((x) => x && x.id === id) || null;
  const have = (id) => !!keep && keep.have(id);
  const info = (t) => {
    const st = stopOf(t.id);
    return st ? tixInfo(st, store.state.tickets, have, store.state.me) : null;
  };
  const days = () => (Array.isArray(store.state.days) ? store.state.days : []);

  // One check's head: Date, what day, No.
  function checkHead(date, today) {
    const h = el("div", "ck-h");
    const d = el("div");
    d.append(el("small", "", "Date"), el("b", "", checkDate(date)));
    const mid = el("div", "mid");
    const head = dayHead(date).en; // "Mon Dec 28"
    const di = days().findIndex((x) => x && x.date === date);
    const title = di >= 0 && typeof days()[di].title === "string" ? days()[di].title.trim() : "";
    if (today) mid.append("Guest Check", el("i", "", head.split(" ")[0] + " · today"));
    else {
      mid.append(head);
      if (title) mid.append(el("i", "", title));
    }
    const no = el("div");
    // A stop outside the trip's days has no check number: none is printed.
    no.append(el("small", "", "No."), el("b", "", di >= 0 ? String(di + 1).padStart(4, "0") : "—"));
    h.append(d, mid, no);
    return h;
  }

  // A line of the check: the time, and what is stapled to it.
  function line(t, body) {
    const r = el("div", "cr");
    r.dataset.id = t.id;
    r.append(el("div", "cr-t", t.time || "—"), body);
    return r;
  }

  const label = (t, i) => (t.title || "Ticket") + (t.time ? ", " + t.time : "") + ", " + statusWords(i ? { kind: i.kind, saved: i.saved, label: i.count } : null, i && i.count);

  // A ticket still to come, stapled to its line: a button that holds it up.
  function slot(t) {
    const i = info(t);
    const b = button("cr-b tt-tk");
    b.dataset.id = t.id;
    b.dataset.act = "slot";
    b.setAttribute("aria-label", "Show ticket: " + label(t, i));
    if (!i || i.kind === "ref") b.append(resvEl({ name: t.title || "Reservation", ref: i ? i.ref : "" }));
    else b.append(stubEl({ stock: i.stock, edge: i.edge, kicker: kindWord(i.stock) + " · " + bandDay(t.date, ""), name: t.title || "Ticket", sub: i.count + " · " + (i.saved ? "on this phone" : "needs signal once"), ghost: !i.saved }));
    b.append(staple());
    return line(t, b);
  }

  // The next ticket: the lead line, the big stub and Show ticket.
  function nextLine(t) {
    const i = info(t);
    const box = el("div", "f-nx");
    if (t.lead) {
      const lv = el("div", "r-lv");
      lv.append(el("span", "tag", "Next"), el("span", "tt-lt", t.lead));
      box.append(lv);
    }
    const win = button("tt-win");
    win.id = "ttWin";
    win.dataset.id = t.id;
    win.dataset.act = "win";
    win.setAttribute("aria-label", "Show ticket: " + label(t, i));
    if (!i || i.kind === "ref") {
      const c = resvEl({ name: t.title || "Reservation", ref: i ? i.ref : "" });
      c.classList.add("is-big");
      win.append(staple(), c);
    } else {
      win.append(bigStubEl({
        stock: i.stock,
        band: kindWord(i.stock) + " · " + bandDay(t.date, t.time),
        name: t.title || "Ticket",
        sub: i.count + " · " + (i.saved ? "on this phone" : "needs signal once"),
        seat: i.seat,
        thumb: i.first ? thumbEl(keep, i.first) : null,
        ghost: !i.saved,
      }));
    }
    box.append(win);
    const show = button("showk");
    show.id = "ttShow";
    show.dataset.act = "show";
    show.dataset.id = t.id;
    show.append(el("span", "", "Show ticket"));
    if (i && i.kind !== "ref" && i.count) show.append(el("small", "", i.count));
    show.setAttribute("aria-label", "Show ticket: " + (t.title || "the next ticket"));
    box.append(show);
    return line(t, box);
  }

  // A used ticket, off its check, with the time clock's print.
  function used(t) {
    const i = info(t);
    const b = button("tt-used");
    b.dataset.id = t.id;
    b.dataset.act = "used";
    const day = dayHead(t.date).en.toUpperCase().split(" ");
    b.setAttribute("aria-label", "Used: " + (t.title || "Ticket") + ", " + dayHead(t.date).en + (t.time ? " " + t.time : ""));
    if (!i || i.kind === "ref") b.append(resvEl({ name: t.title || "Reservation", ref: i ? i.ref : "" }));
    else b.append(stubEl({ stock: i.stock, edge: i.edge, kicker: kindWord(i.stock), name: t.title || "Ticket", sub: i.count }));
    const holes = el("span", "sh");
    holes.setAttribute("aria-hidden", "true");
    b.append(holes, tclock("USED " + day[1] + " " + day[2]));
    return b;
  }

  function group(head, right) {
    const g = el("div", "gl");
    g.append(el("span", "", head), el("span", "", right));
    return g;
  }

  function draw(c) {
    const spot = (() => {
      const a = document.activeElement;
      if (!a || !section.contains(a)) return null;
      return { act: a.dataset.act || null, id: a.dataset.id || null };
    })();
    const nodes = [];
    const bar = el("div", "bar tt-bar");
    const h = el("h2", "bar-d tt-h", "Tickets");
    h.id = "ttTitle";
    // The space stands outside the date, so a narrow phone breaks the line there.
    h.append(" ", el("i", "", dayHead(c.date).en + " · today"));
    bar.append(h);
    if (c.toCome > 0) bar.append(el("span", "tt-come", c.toCome + " to come"));
    nodes.push(bar);
    if (beforeOpen > 0) {
      const slip = button("tt-bf");
      slip.id = "ttBefore";
      slip.dataset.act = "before";
      slip.setAttribute("aria-label", "Before we go: " + beforeOpen + " still to book. Open");
      slip.append(el("b", "", "Before we go"), el("span", "", beforeOpen + " still to book"), el("u", "", "Open"));
      nodes.push(slip);
    }

    const ahead = [c.next, ...c.today, ...c.later].filter(Boolean);
    if (!c.next) {
      const ck = el("div", "ck tt-none");
      ck.append(checkHead(c.date, true));
      const p = el("div", "tt-empty");
      if (c.empty) p.append(el("b", "", "No tickets on any stop yet."), el("span", "", "Open a stop, tap Edit, then add it under Ticket."));
      else p.append(el("b", "", "No ticket still to come."), el("span", "", "The used ones are below."));
      ck.append(p);
      nodes.push(ck);
    }
    let laterShown = false;
    const laterCount = ahead.filter((t) => t.date !== c.date).length;
    const dates = [...new Set(ahead.map((t) => t.date))];
    for (const date of dates) {
      if (date !== c.date && !laterShown) {
        laterShown = true;
        nodes.push(group("Later days", laterCount + ", on their checks"));
      }
      const ck = el("div", "ck");
      ck.dataset.date = date;
      ck.append(checkHead(date, date === c.date));
      for (const t of ahead.filter((x) => x.date === date)) ck.append(c.next && t.id === c.next.id ? nextLine(t) : slot(t));
      nodes.push(ck);
    }
    if (c.used.length) {
      nodes.push(group("Used", c.used.length + ", off their checks"));
      const loose = el("div", "loose");
      for (const t of c.used) loose.append(used(t));
      nodes.push(loose);
    }
    section.replaceChildren(...nodes);

    if (spot) {
      let target = null;
      if (spot.act === "before") target = section.querySelector("#ttBefore");
      else if (spot.id) target = section.querySelector('[data-act="' + spot.act + '"][data-id="' + CSS.escape(spot.id) + '"]') || section.querySelector('button[data-id="' + CSS.escape(spot.id) + '"]');
      if (!target) target = section.querySelector("#ttShow") || section.querySelector("#ttBefore") || document.getElementById("ticketsBtn");
      if (target) target.focus({ preventScroll: true });
    }
  }

  function update() {
    const s = store.state;
    const nowMs = clock ? clock.now() : Date.now();
    const c = passCase(s, nowMs, { have });
    // The key is in the bar once the trip has begun and has a ticket (a trip
    // with none keeps the bar as it was).
    // The slip of Before items still open is also kept here, so with one the key stays even with no ticket.
    const on = c.on && (!c.empty || beforeOpen > 0);
    const st = JSON.stringify([on, c.on, c.todayLeft]);
    if (st !== lastState) {
      lastState = st;
      onState({ on, started: c.on, todayLeft: c.todayLeft });
    }
    // The trip was taken off this phone (or the trip has not begun, or has no ticket): nothing of it stays here.
    if (s.status === "nokey" || !on) {
      if (sig !== "") {
        section.replaceChildren();
        sig = "";
      }
      return;
    }
    // The "in N min" line changes every minute: that text is updated where it
    // stands. Anything else that changed (a picture arriving, a stop changed) redraws.
    const pics = (s.tickets || []).filter((t) => t && !t.gone).map((t) => [t.id, t.stop, t.who, t.seat, t.page, have(t.id)]);
    const stops = (s.stops || []).filter((x) => x && (x.tkRef || x.tkName || x.tkPeople || x.tkSeat || pics.some((p) => p[1] === x.id))).map((x) => [x.id, x.title, x.detail, x.tkRef, x.tkName, x.tkPeople, x.tkSeat]);
    const next = JSON.stringify([beforeOpen, c.next ? { ...c.next, lead: !!c.next.lead } : null, { ...c, next: null }, pics, stops, s.me, (s.days || []).map((d) => d && [d.date, d.title])]);
    if (next === sig) {
      const lt = section.querySelector(".f-nx .tt-lt");
      const want = c.next && c.next.lead ? c.next.lead : "";
      if (lt && lt.textContent !== want) lt.textContent = want;
      return;
    }
    sig = next;
    draw(c);
  }

  // A picture arriving under the finger redraws every button here: the tap is
  // done on finger up on the button now in its place (js/views/tap.js).
  const tap = tapOnRelease(section, {
    pick: (t) => {
      const b = t.closest("button[data-act]");
      if (b && b.dataset.act === "before") return { act: "before", id: "" };
      return b && b.dataset.id ? { act: b.dataset.act, id: b.dataset.id } : null;
    },
    act: ({ act, id }) => {
      if (act === "before") return onBefore(section.querySelector("#ttBefore"));
      const b = section.querySelector('button[data-act="' + act + '"][data-id="' + CSS.escape(id) + '"]') || section.querySelector('button[data-id="' + CSS.escape(id) + '"]');
      if (b) onTicket(id, b);
    },
  });
  section.addEventListener("click", (ev) => {
    if (tap.skip(ev)) return;
    const b = ev.target.closest("button[data-act]");
    if (b && section.contains(b) && b.dataset.act === "before") return onBefore(b);
    if (!b || !section.contains(b) || !b.dataset.id) return;
    onTicket(b.dataset.id, b);
  });
  // iPhone Safari draws a pressed look (:active) on touch only when something listens.
  section.addEventListener("touchstart", () => {}, { passive: true });

  store.subscribe(update);
  if (clock && clock.subscribe) clock.subscribe(update);
  if (keep && keep.subscribe) keep.subscribe(update);
  let timer = null;
  const wake = () => {
    if (document.visibilityState !== "hidden" && !timer) {
      timer = setInterval(update, LOOK_MS);
      update();
    } else if (document.visibilityState === "hidden" && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
  document.addEventListener("visibilitychange", wake);
  wake();
  update();

  return {
    update,
    setBefore(n) {
      const v = Number.isFinite(n) && n > 0 ? n : 0;
      if (v === beforeOpen) return;
      beforeOpen = v;
      update();
    },
  };
}
