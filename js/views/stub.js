/* Copyright (c) 2026 moissmart1. All rights reserved. No licence is granted: do not copy, adapt or reuse this code or design, and do not use it to train or prompt an AI system to reproduce it. See LICENSE. */
// The ticket shown (look F, "stapled to the check"): Show ticket lifts the
// stop's ticket on its staple and holds it up on the dark, its code on
// white about 236 to 300 px wide, the name large and the booking ref under
// it. When each person has their own, the next one is stapled underneath
// and flips up (its corner, the seals or a swipe). Back to the check, Escape
// or a tap on the dark around it puts it back.
//
// mountStub(root, store, keep) -> { open(stopId, opener), close(restoreFocus), isOpen() }
// root is the phone (#tix is added to it; css/tickets.css puts it over Days,
// and in the computer layout inside the Days pane). keep is js/tickets.js's
// keep. While it is up, #phone has stub-open, so a new release waits to
// reload (js/update.js), and the screen is asked to stay on (Wake Lock,
// where the phone allows it; a refusal is silent).
//
// What it shows, by the stop's pictures (js/tickets.js ticketKinds), as the
// Japan app's stub does:
// - per-person codes: one ticket each; this phone's person's on top, then
//   the others in trip order, each flipped up in turn;
// - one code for everyone; a PDF's pages one under another (tap to enlarge);
// - no picture: the Reserved card, the reference large, with a sentence for staff.
// A picture not on this phone yet is fetched now when there is signal
// ("Saving to this phone"), else it says it needs signal once. Every name,
// ref and seat goes in with textContent; a picture only as an <img> from a
// blob: URL made from bytes whose type was checked (js/tickets.js sniff).
// Reduced motion: no lift and no flip, it is simply there (css/tickets.css).
// The trip taken off the phone (status "nokey"): it closes and keeps nothing.

import { ticketKinds, hasFacts, sniff, fromBase64 } from "../tickets.js";
import { dayHead } from "../format.js";
import { el, stockOf, kindWord, seatEl, staple, staffLine } from "./stubs.js";
import { tapOnRelease } from "./tap.js";

const str = (v) => (typeof v === "string" ? v.trim() : "");
const calm = () => !!(globalThis.matchMedia && globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches);

export function mountStub(root, store, keep) {
  const host = el("div", "tix");
  host.id = "tix";
  host.hidden = true;
  root.append(host);

  let stopId = null;
  let opener = null;
  let urls = [];
  let lock = null;
  let locked = false;
  let at = 0; // the per-person ticket on top, by its place in `order`
  let order = []; // per-person: whose each ticket is, in the order they flip
  let sig = "";
  let fetching = false;
  const failedNow = new Set(); // fetched this opening and refused: not again until it is opened again

  const isOpen = () => !host.hidden;
  const online = () => store.state.online !== false;
  const stopOf = () => (store.state.stops || []).find((s) => s && s.id === stopId && !s.deleted) || null;
  const picsOf = () => (store.state.tickets || []).filter((t) => t && t.stop === stopId && !t.gone);

  function forget() {
    for (const u of urls) URL.revokeObjectURL(u);
    urls = [];
  }

  // ---- the screen kept on ----
  async function wake() {
    try {
      if (!navigator.wakeLock || document.visibilityState !== "visible" || lock) return;
      lock = await navigator.wakeLock.request("screen");
      locked = true;
      lock.addEventListener("release", () => {
        lock = null;
      });
      if (!isOpen()) {
        lock.release();
        lock = null;
      }
    } catch {
      lock = null; // refused: say nothing
    }
    paintStay();
  }
  function sleep() {
    try {
      if (lock) lock.release();
    } catch {
      // nothing to do
    }
    lock = null;
  }
  document.addEventListener("visibilitychange", () => {
    if (isOpen() && document.visibilityState === "visible") wake();
  });

  // ---- the pieces ----

  function keptLine(kind, all) {
    const k = el("div", "f-kt");
    if (!kind) k.append(el("em", "", "TEXT"), el("span", "", "Text only, always on this phone."));
    else if (all) k.append(el("em", "", "KEPT"), el("span", "", "On this phone. Works with no signal."));
    else k.append(el("em", "is-dash", "NOT YET"), el("span", "", "Not on this phone yet. Needs signal once."));
    return k;
  }

  function missing(saving) {
    const m = el("div", "miss");
    if (saving) {
      m.append("Saving to this phone", el("div", "bar-p"), el("span", "", "Once, then it works with no signal."));
    } else {
      m.append("The picture is not on this phone yet.", el("span", "", "It saves the first time this phone opens Wendy’s with signal. Until then, show the booking ref below; staff can find it."));
    }
    return m;
  }

  // A slot for one picture: filled from the keep, or fetched now.
  function slot(pic, { zoom = false, page = false } = {}) {
    const box = el("div", "stub-code" + (page ? " is-page" : ""));
    box.dataset.id = pic.id;
    const fill = async () => {
      const blob = await keep.get(pic.id);
      if (!host.contains(box)) return;
      if (blob && (await sniff(blob)) === pic.mime && (pic.mime === "image/jpeg" || pic.mime === "image/png")) {
        if (!host.contains(box)) return;
        const url = URL.createObjectURL(blob);
        urls.push(url);
        const img = el("img", "code");
        img.alt = pic.who ? pic.who + "’s code" : page ? "Page " + pic.page : "The ticket";
        img.decoding = "async";
        img.src = url;
        if (zoom) {
          box.classList.add("can-zoom");
          box.tabIndex = 0;
          box.setAttribute("role", "button");
          box.setAttribute("aria-label", "Enlarge " + img.alt.toLowerCase());
        }
        box.replaceChildren(img);
        return;
      }
      const saving = online() && !failedNow.has(pic.id);
      box.replaceChildren(missing(saving));
      if (saving) fetchNow();
    };
    box.append(el("div", "miss-wait"));
    fill();
    return box;
  }

  // Fetches the pictures of this stop the phone lacks, one at a time, then redraws.
  async function fetchNow() {
    if (fetching) return;
    fetching = true;
    const gen = keep.gen;
    try {
      for (const t of picsOf()) {
        if (!isOpen() || keep.have(t.id) || failedNow.has(t.id)) continue;
        let got;
        try {
          got = await store.fetchTicket(t.id);
        } catch (err) {
          if (err && err.code === "network") break;
          failedNow.add(t.id);
          continue;
        }
        const blob = got && got.id === t.id && got.mime === t.mime ? fromBase64(got.data, got.mime) : null;
        if (!blob || !(await keep.put(t.id, blob, { gen }))) failedNow.add(t.id);
      }
    } finally {
      fetching = false;
    }
    if (isOpen()) paint(true);
  }

  function zoomOut() {
    const z = host.querySelector(".zoom");
    if (!z) return false;
    z.remove();
    return true;
  }
  function zoomIn(box) {
    const img = box.querySelector("img");
    if (!img) return;
    const z = el("div", "zoom");
    z.setAttribute("role", "dialog");
    z.setAttribute("aria-label", "Enlarged");
    const back = el("button", "zoom-x", "Back");
    back.type = "button";
    const big = el("img");
    big.src = img.src;
    big.alt = img.alt;
    z.append(back, big);
    host.append(z);
    back.focus({ preventScroll: true });
  }

  // ---- drawing ----

  // The facts under the perforation: the name large with the seat boxes,
  // then the booking ref and the other facts, each on its own line.
  function nameRow(name, seat) {
    const r = el("div", "f-nm");
    r.append(el("div", "nm", name));
    const s = seatEl(seat, "ts-seat bx3");
    if (s) r.append(s);
    return r;
  }
  function factRows(stop, { skipName = false } = {}) {
    const rows = [["Booking ref", str(stop.tkRef)], ["Name on booking", skipName ? "" : str(stop.tkName)], ["People", str(stop.tkPeople)]].filter((r) => r[1]);
    return rows.map(([label, v], i) => {
      const r = el("div", "f-rf" + (i ? " is-more" : ""));
      r.append(el("span", "", label), el("b", "", v));
      return r;
    });
  }

  // One ticket on the stock: the band, the title, the code(s), the perforation and the facts.
  function ticket(stop, { codes, name, seat, kind, all, num }) {
    const me = el("div", "me");
    me.append(staple());
    const band = el("div", "f-band");
    const stock = stockOf(stop);
    band.append(el("span", "", (kind === null ? "RESERVED" : kindWord(stock)) + (/^\d{2}:\d{2}$/.test(stop.time || "") ? " · " + stop.time : "")), el("span", "ser", "No. " + num));
    const ttl = el("div", "f-ttl");
    ttl.append(el("b", "", str(stop.title) || "Ticket"), el("span", "", [stop.date ? dayHead(stop.date).en : "", /^\d{2}:\d{2}$/.test(stop.time || "") ? stop.time : "", str(stop.detail)].filter(Boolean).join(" · ")));
    me.append(band, ttl, ...codes, el("div", "f-perf"), nameRow(name, seat), ...factRows(stop, { skipName: kind === null }), keptLine(kind, all));
    me.classList.add("is-" + stock);
    return me;
  }

  function reserved(stop) {
    const r = el("div", "ref-big");
    r.append(el("small", "", "Reserved · reference only"));
    if (str(stop.tkRef)) r.append(el("b", "", str(stop.tkRef)));
    const said = staffLine(stop);
    if (said) r.append(el("p", "", said));
    return r;
  }

  function signature() {
    const stop = stopOf();
    const pics = picsOf();
    return JSON.stringify([
      stop && [stop.title, stop.time, stop.detail, stop.date, stop.tkRef, stop.tkName, stop.tkPeople, stop.tkSeat],
      pics.map((t) => [t.id, t.who, t.seat, t.page, keep.have(t.id)]),
      store.state.me, online(),
    ]);
  }

  function paintStay() {
    const line = host.querySelector(".stay");
    if (!line) return;
    const flip = order.length > 1 ? "Flip it up for " + (order[(at + 1) % order.length] || "the next") + "’s. " : "";
    line.textContent = flip + (locked ? "Screen stays on while the ticket is up." : "");
    line.hidden = !line.textContent;
  }

  // Shows per-person ticket n on top, the next one underneath.
  function show(n, flipping = false) {
    const pages = [...host.querySelectorAll(".pp-pg")];
    if (!pages.length) return;
    at = ((n % pages.length) + pages.length) % pages.length;
    pages.forEach((p, i) => {
      p.hidden = i !== at;
      p.classList.toggle("is-flip", flipping && i === at && !calm());
    });
    const under = host.querySelector(".nx");
    if (under) {
      const next = pages[(at + 1) % pages.length];
      const who = next.dataset.who;
      const seat = next.dataset.seat;
      const b = under.querySelector("b");
      b.textContent = "Underneath: " + (who ? who.toUpperCase() : "ALL") + (seat ? " · " + seat : "");
      under.setAttribute("aria-label", "Flip up " + (who ? who + "’s" : "the next") + " ticket");
    }
    host.querySelectorAll(".who button").forEach((b, i) => {
      b.classList.toggle("on", i === at);
      b.setAttribute("aria-pressed", String(i === at));
    });
    const top = host.querySelector(".tb span");
    if (top && top.dataset.base) top.textContent = top.dataset.base + (pages.length > 1 ? " · ticket " + (at + 1) + " of " + pages.length : " · ticket");
    paintStay();
  }

  // Draws the ticket. again: a redraw of the one up (no lift, the ticket on top kept).
  function paint(again = false) {
    const s = store.state;
    const stop = stopOf();
    if (!stop) {
      close(false);
      return;
    }
    const pics = picsOf();
    if (!pics.length && !hasFacts(stop)) {
      close(false);
      return;
    }
    sig = signature();
    forget();
    const days = Array.isArray(s.days) ? s.days : [];
    const di = days.findIndex((d) => d && d.date === stop.date);
    const num = String(di >= 0 ? di + 1 : 0).padStart(4, "0");
    const people = (s.people || []).map((p) => p.name);
    const k = ticketKinds(pics);
    const keptAll = k.list.every((t) => keep.have(t.id));
    const was = again && order[at] !== undefined ? order[at] : null;

    const ov = el("div", "ov oa");
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-modal", "true");
    ov.setAttribute("aria-label", "Ticket: " + str(stop.title));
    const top = el("div", "tb");
    const where = el("span", "", stop.date ? dayHead(stop.date).en : "");
    const back = el("button", "pill", "Back to the check");
    back.type = "button";
    back.dataset.close = "";
    top.append(where, back);

    // A redraw while the ticket is still lifting (its pictures arriving)
    // carries the lift on from where it was, rather than jumping to the end.
    const wasUp = again ? host.querySelector(".f-tk") : null;
    const lifting = wasUp && typeof wasUp.getAnimations === "function" ? wasUp.getAnimations().find((a) => a.animationName === "lift" && a.playState === "running") : null;
    const liftAt = lifting ? lifting.currentTime : null;
    const stack = el("div", "f-tk" + (again && liftAt === null ? " is-up" : ""));
    const byPage = (a, b) => a.page - b.page;
    order = [];

    if (!k.kind) {
      const me = ticket(stop, { codes: [reserved(stop)], name: str(stop.tkName) || "RESERVED", seat: str(stop.tkSeat), kind: null, all: true, num });
      me.classList.add("is-resv");
      stack.append(me);
      where.textContent += " · reservation";
    } else if (k.kind === "pp") {
      const groups = new Map();
      for (const t of k.list.slice().sort(byPage)) {
        const g = t.who || "";
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g).push(t);
      }
      const rank = (n) => (n === "" ? 1e6 : n === s.me ? -1 : people.indexOf(n) === -1 ? 1e5 : people.indexOf(n));
      order = [...groups.keys()].sort((a, b) => rank(a) - rank(b));
      if (order.length > 1) {
        const nx = el("button", "nx");
        nx.type = "button";
        nx.dataset.flip = "";
        nx.append(el("b"));
        stack.append(nx);
      }
      order.forEach((who) => {
        const list = groups.get(who);
        const seat = str(list[0].seat) || str(stop.tkSeat);
        const pg = el("div", "pp-pg");
        pg.dataset.who = who;
        pg.dataset.seat = seat;
        pg.append(ticket(stop, { codes: list.map((t) => slot(t, { zoom: list.length > 1, page: list.length > 1 })), name: who ? who.toUpperCase() : "ALL", seat, kind: k.kind, all: keptAll, num }));
        stack.append(pg);
      });
      where.dataset.base = where.textContent;
    } else if (k.kind === "one") {
      const n = people.length;
      const name = n === 2 ? "BOTH" : n > 2 ? "ALL " + n : "ALL";
      stack.append(ticket(stop, { codes: [slot(k.list[0], { zoom: true })], name, seat: str(stop.tkSeat), kind: k.kind, all: keptAll, num }));
      where.textContent += " · ticket for everyone";
    } else {
      stack.append(ticket(stop, { codes: k.list.slice().sort(byPage).map((t) => slot(t, { zoom: true, page: true })), name: "E-TICKET", seat: str(stop.tkSeat), kind: k.kind, all: keptAll, num }));
      where.textContent += " · e-ticket, " + k.list.length + " pages";
    }

    const nodes = [top, stack];
    if (order.length > 1) {
      const who = el("div", "who");
      order.forEach((name, i) => {
        const b = el("button");
        b.type = "button";
        b.dataset.k = String(i);
        b.setAttribute("aria-label", name ? (name === s.me ? "Your ticket" : name + "’s ticket") : "The ticket for everyone");
        b.append(el("b", "", name ? [...name][0].toUpperCase() : "A"), el("span", "", name === s.me ? "You" : name || "All"));
        who.append(b);
      });
      nodes.push(who);
    }
    const stay = el("div", "stay");
    nodes.push(stay);
    ov.append(...nodes);
    host.replaceChildren(ov);
    if (liftAt !== null) for (const a of stack.getAnimations()) if (a.animationName === "lift") a.currentTime = liftAt;
    const keepAt = was !== null ? order.indexOf(was) : -1;
    if (order.length) show(keepAt >= 0 ? keepAt : 0);
    paintStay();
  }

  function open(id, from = null) {
    if (typeof id !== "string" || !id) return false;
    stopId = id;
    opener = from;
    at = 0;
    order = [];
    failedNow.clear();
    host.hidden = false;
    paint(false);
    if (!isOpen()) return false;
    root.classList.add("stub-open");
    const back = host.querySelector("[data-close]");
    if (back) back.focus({ preventScroll: true });
    wake();
    return true;
  }

  function close(restoreFocus = true) {
    if (!isOpen()) return;
    host.hidden = true;
    host.replaceChildren();
    tap.clear();
    forget();
    sleep();
    locked = false;
    root.classList.remove("stub-open");
    stopId = null;
    order = [];
    sig = "";
    const back = opener;
    opener = null;
    if (restoreFocus && back && back.isConnected) back.focus({ preventScroll: true });
  }

  // A picture arriving between finger down and finger up repaints the ticket and
  // replaces what the finger went down on, so the browser sends no click to it.
  // The tap is still the tap it was (the corner, a seal, Back), never a tap on
  // the dark around the ticket (js/views/tap.js).
  const tap = tapOnRelease(host, {
    pick: (t) => {
      if (!t.closest(".f-tk, .who, .tb")) return null;
      const w = t.closest(".who button");
      return { flip: !!t.closest("[data-flip]"), seal: w ? Number(w.dataset.k) : null, close: !!t.closest("[data-close]") };
    },
    act: (what) => {
      if (!isOpen()) return;
      if (what.flip) show(at + 1, true);
      else if (what.seal !== null && what.seal !== at) show(what.seal, true);
      else if (what.close) close();
    },
  });
  host.addEventListener("click", (ev) => {
    if (tap.skip(ev)) return;
    if (ev.target.closest(".zoom")) {
      zoomOut();
      return;
    }
    if (ev.target.closest("[data-close]")) {
      close();
      return;
    }
    if (ev.target.closest("[data-flip]")) {
      show(at + 1, true);
      return;
    }
    const seal = ev.target.closest(".who button");
    if (seal) {
      const n = Number(seal.dataset.k);
      if (n !== at) show(n, true);
      return;
    }
    const z = ev.target.closest(".stub-code.can-zoom");
    if (z) {
      zoomIn(z);
      return;
    }
    // The dark around the ticket.
    if (!ev.target.closest(".f-tk, .who, .tb")) close();
  });
  host.addEventListener("keydown", (ev) => {
    if ((ev.key === "Enter" || ev.key === " ") && ev.target.matches(".stub-code.can-zoom")) {
      ev.preventDefault();
      zoomIn(ev.target);
    }
  });
  // A sideways swipe on the ticket flips the next one up (or back).
  let swipe = null;
  host.addEventListener("pointerdown", (ev) => {
    if (order.length < 2 || !ev.target.closest(".f-tk")) return;
    swipe = { x: ev.clientX, y: ev.clientY };
  });
  host.addEventListener("pointerup", (ev) => {
    if (!swipe) return;
    const dx = ev.clientX - swipe.x;
    const dy = ev.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) show(at + (dx < 0 ? 1 : -1), true);
  });
  host.addEventListener("pointercancel", () => {
    swipe = null;
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape" || !isOpen() || ev.isComposing) return;
    if (!zoomOut()) close();
  });
  const again = () => {
    // The trip taken off this phone: nothing of it stays up.
    if (store.state.status === "nokey") {
      close(false);
      return;
    }
    if (isOpen() && signature() !== sig) paint(true);
  };
  store.subscribe(again);
  keep.subscribe(again);

  return { open, close, isOpen };
}
