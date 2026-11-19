/* Copyright (c) 2026 moissmart1. All rights reserved. No licence is granted: do not copy, adapt or reuse this code or design, and do not use it to train or prompt an AI system to reproduce it. See LICENSE. */
// The placemat (the keepsake, look C): a souvenir placemat with a hand-drawn
// map of Chicago and a spot for each day that each person stamps by hand,
// and under it the legend, one line a day. It replaces the stamp book's
// page; the rules for when a stamp can be pressed and the data are the
// same. A panel over the app like History: opened from the Days screen (the
// Placemat pill on its top line, or the line on today's check), closed by
// Done, the scrim or Escape.
//
// mountStampBook(root, store, { now, where }) -> { open(), close(restoreFocus), isOpen() }
// - In the place: pressed with a usable position (js/where.js) within a mile,
//   straight line, of that day's place or of one of that day's stops on the
//   map (js/plan.js inPlace), the press carries here: true and nothing else
//   about where. Such a stamp's caption is a small green sign, and held up it
//   reads "pressed in <place>". No position, or elsewhere: no mark, nothing
//   said. A press is never held up or refused because of a position.
// - root is the phone. now() is the real time (the phone's clock; a press is
//   judged by it, so the demo clock is never used here).
// - A stamp is open, not yet open, closed or held: js/stampbook.js stateOf, in
//   Chicago time whatever zone the phone is in. Tapping an open spot (or its
//   line in the legend) presses it (store.pressStamp: shown at once, kept on
//   the phone until the backend has it); a held stamp is held up large; a
//   spot that is not open says so in one line under the map and shakes a
//   little. Nothing is sent for those.
// - Where each spot sits: js/stampbook.js placemat (known places on their
//   own spot, the rest on free ones).
// - The landing is the app's own: the stamp's `hit`, the thud once the store
//   has taken the press, a small bump of the placemat and wet ink for half a
//   second. Under prefers-reduced-motion the stamp just appears.
// - Every name, place and person's name goes in with textContent; the
//   drawings come from bookStampSVG and the map from numbers and escaped
//   names only.
// - Redrawn only where something changed: a spot is replaced when its own
//   state or stamp did, so a press landing keeps its landing and a person
//   holding a stamp up is left alone.

import { bookStampSVG, countText, lockedLine, monthDay, placemat, stateOf, tiltOf, tripClock, tripDate, usableDefs, weekdayOf, esc, MAP_W, MAP_H } from "../stampbook.js";
import { tripSpan } from "../format.js";
import { calm, wetInk } from "../fx.js";
import { thud, primeSound } from "../sound.js";
import { fillSeal } from "../picture.js";
import { inPlace } from "../plan.js";
import { plainBlade } from "./sign.js";

const RULE = "One stamp a day, pressed on the day, where you are. New Year’s Eve gets the fireworks.";
const STAMPED = "Stamped.";
const LOOK_BACK = "Tap to put it back";
// How often an open book asks again which stamps are open (the clock moves on).
const LOOK_MS = 20000;
// The landing's bump on the page, in ms.
const BUMP_MS = 220;
// A second tap this soon after a press is the same tap again, not a wish to hold the new stamp up.
const SETTLE_MS = 700;

const MARKUP = `
<div class="bk-top"><span class="bk-title">Placemat</span><span class="bk-n" id="bookN"></span><button type="button" id="bookDone">Done</button></div>
<div class="bk-scroll" id="bookScroll" tabindex="-1">
  <div class="bk-page" id="bookPage">
    <div class="bk-map" id="bookMap"></div>
    <div class="bk-grid" id="bookGrid"></div>
  </div>
  <div class="bk-leg" id="bookLeg"></div>
  <p class="bk-say" id="bookSay" role="status" aria-live="polite"></p>
  <p class="bk-rule">${RULE}</p>
  <div class="bk-today" id="bookToday">
    <div class="bk-th" id="bookTH"></div>
    <div class="bk-who" id="bookWho"></div>
  </div>
</div>`;

// The placemat itself, behind the spots: the scalloped paper, the red
// border, the title, the street grid, the lake, the river and their names.
// Built from numbers and escaped names only.
function matSVG(sub) {
  const W = MAP_W;
  const H = MAP_H;
  let sc = "";
  const nx = Math.round((W - 14) / 14);
  const sx = (W - 14) / nx;
  const ny = Math.round((H - 14) / 14);
  const sy = (H - 14) / ny;
  for (let k = 0; k <= nx; k++) {
    const x = (7 + k * sx).toFixed(1);
    sc += '<circle cx="' + x + '" cy="7" r="7"/><circle cx="' + x + '" cy="' + (H - 7) + '" r="7"/>';
  }
  for (let k = 1; k < ny; k++) {
    const y = (7 + k * sy).toFixed(1);
    sc += '<circle cx="7" cy="' + y + '" r="7"/><circle cx="' + (W - 7) + '" cy="' + y + '" r="7"/>';
  }
  let grid = "";
  for (let x = 30; x < 300; x += 22) grid += '<line x1="' + x + '" y1="70" x2="' + x + '" y2="' + (H - 22) + '"/>';
  for (let y = 70; y < H - 20; y += 22) grid += '<line x1="22" y1="' + y + '" x2="300" y2="' + y + '"/>';
  return '<svg viewBox="0 0 ' + W + " " + H + '" width="100%" height="100%" aria-hidden="true" focusable="false">' +
    '<rect x="7" y="7" width="' + (W - 14) + '" height="' + (H - 14) + '" fill="#FFFDF5"/><g fill="#FFFDF5">' + sc + "</g>" +
    '<rect x="16" y="16" width="' + (W - 32) + '" height="' + (H - 32) + '" fill="none" stroke="#C2362B" stroke-width="1.5"/>' +
    '<text x="' + W / 2 + '" y="46" text-anchor="middle" font-family="Zilla Slab,Rockwell,Georgia,serif" font-weight="700" font-size="24" fill="#C2362B">Souvenir of Chicago</text>' +
    '<text x="' + W / 2 + '" y="62" text-anchor="middle" font-family="Libre Franklin,Helvetica Neue,Arial,sans-serif" font-weight="700" font-size="11" fill="#13261F">' + esc(sub) + "</text>" +
    '<g stroke="rgba(46,122,87,.18)" stroke-width="1">' + grid + "</g>" +
    '<path d="M300 70 C 292 130, 306 170, 290 210 S 300 300, 284 ' + (H - 22) + " L " + (W - 17) + " " + (H - 22) + " L " + (W - 17) + ' 70 Z" fill="#CDE4EE"/>' +
    '<text transform="translate(322 300) rotate(-90)" text-anchor="middle" font-family="Zilla Slab,Rockwell,Georgia,serif" font-weight="600" font-size="14" fill="#2F5FA8">Lake Michigan</text>' +
    '<path d="M292 206 L 150 206 L 132 196 L 118 72 M150 206 L 140 222 L 150 ' + (H - 22) + '" fill="none" stroke="#7FB4D3" stroke-width="7" stroke-linejoin="round"/>' +
    '<text transform="translate(160 330) rotate(90)" text-anchor="middle" font-family="Libre Franklin,Helvetica Neue,Arial,sans-serif" font-weight="700" font-size="9.5" fill="#2F5FA8">Chicago River</text>' +
    "</svg>";
}

const ARROW = { sw: "↙ ", nw: "↖ ", n: "↑ " };
const isNye = (d) => typeof d.date === "string" && d.date.slice(5) === "12-31";

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

const list = (v) => (Array.isArray(v) ? v : []);
const isoMs = (iso) => Date.parse(iso);

export function mountStampBook(root, store, { now = () => Date.now(), where = null } = {}) {
  const scrim = el("div", "scrim");
  scrim.id = "bookScrim";
  scrim.hidden = true;
  const panel = el("div", "bk");
  panel.id = "book";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", "Placemat");
  panel.inert = true;
  panel.innerHTML = MARKUP;
  root.append(scrim, panel);

  const $ = (id) => panel.querySelector("#" + id);
  const grid = $("bookGrid");
  const page = $("bookPage");
  const say = $("bookSay");
  const done = $("bookDone");
  const scroll = $("bookScroll");

  let opened = false;
  let hitId = null; // the ring whose stamp is landing right now (drawn once with its hit)
  let landed = { id: null, at: 0 }; // the last ring pressed, and when
  let held = null; // the def id of the stamp held up
  let look = null; // the held-up overlay
  let timer = null;
  const sigs = new Map(); // def id -> what its spot was drawn from
  let mapSub = null; // the map's second line, as last drawn

  // ---- what the book shows ----

  function model(s) {
    const defs = usableDefs(s.stampDefs);
    const mine = new Map();
    for (const x of list(s.stamps)) if (x && x.who === s.me && !x.gone) mine.set(x.def, x);
    const t = now();
    return { s, defs, mine, t, state: (d) => stateOf(d, defs, mine.has(d.id) ? [d.id] : [], t) };
  }

  function label(d, st, here = false) {
    const date = d.date ? monthDay(d.date) : "";
    if (!d.date) return st === "have" ? "The placemat’s own stamp, stamped. Hold it up." : st === "open" ? "Press the placemat’s own stamp" : "The placemat’s own stamp, closed";
    if (st === "have") return date + ", " + (d.name_en || d.place || "stamp") + ", stamped" + (here ? ", pressed in the place" : "") + ". Hold it up.";
    if (st === "open") return "Press the stamp for " + date;
    return st === "soon" ? date + ", not open yet" : date + ", closed";
  }

  // A spot not yet stamped: a dashed ring with the day's number (a burst on
  // New Year's Eve); open today, a solid red ring that says today.
  function ghost(d, st, n) {
    const g = el("span", "bk-ghost" + (isNye(d) ? " is-nye" : ""));
    const big = st === "open" ? "today" : d.date ? String(n) : "★";
    g.append(el("b", "", big));
    return g;
  }

  function cellEl(d, st, stamp, defs, hit, spot, n) {
    const b = el("button", "bk-cell is-" + st);
    b.type = "button";
    b.dataset.def = d.id;
    const marked = st === "have" && !!stamp && stamp.here === true && !!d.date;
    b.setAttribute("aria-label", label(d, st, marked));
    b.style.left = ((spot.x / MAP_W) * 100).toFixed(2) + "%";
    b.style.top = ((spot.y / MAP_H) * 100).toFixed(2) + "%";
    const well = el("span", "bk-well");
    if (st === "have" && stamp) {
      const seed = stamp.seed;
      well.style.setProperty("--rot", tiltOf(seed) + "deg");
      well.innerHTML = bookStampSVG(seed, d, defs); // escaped by bookStampSVG
      const svg = well.firstElementChild;
      if (hit && !calm()) {
        svg.classList.add("hit");
        wetInk(svg); // just landed: still wet (js/fx.js)
      }
    } else {
      well.append(ghost(d, st, n));
    }
    const cap = el("span", "bk-cap");
    if (d.date) {
      const words = (ARROW[spot.dir] || "") + (d.place || monthDay(d.date));
      // Pressed in the place: the same words, on a small green sign.
      if (marked) {
        cap.classList.add("is-here");
        cap.append(plainBlade(words, { cls: "g-cap" }));
      } else cap.append(words);
    }
    b.append(well, cap);
    return b;
  }

  function drawGrid(m) {
    const want = [];
    const spots = new Map(placemat(m.defs).map((p) => [p.id, p]));
    const days = m.defs.filter((d) => d.date);
    for (const d of m.defs) {
      const spot = spots.get(d.id);
      const n = days.indexOf(d) + 1;
      const st = m.state(d);
      const stamp = m.mine.get(d.id) || null;
      // Everything the ring prints: its state, its stamp and the definition. Not whether
      // the press is still on its way: the drawing is the same.
      const sig = JSON.stringify([st, stamp ? [stamp.seed, stamp.at, stamp.here === true] : null, d.date, d.name_en, d.place, d.ink, d.shape, spot.x, spot.y, n]);
      let node = grid.querySelector('.bk-cell[data-def="' + CSS.escape(d.id) + '"]');
      if (node && sigs.get(d.id) === sig) {
        want.push(node);
        continue;
      }
      const hit = d.id === hitId;
      if (hit) hitId = null;
      const fresh = cellEl(d, st, stamp, m.defs, hit, spot, n);
      const hadFocus = node && node === document.activeElement;
      sigs.set(d.id, sig);
      if (node) node.replaceWith(fresh);
      node = fresh;
      if (hadFocus) fresh.focus({ preventScroll: true });
      want.push(node);
    }
    want.forEach((node, i) => {
      if (grid.children[i] !== node) grid.insertBefore(node, grid.children[i] || null);
    });
    while (grid.children.length > want.length) grid.lastElementChild.remove();
    for (const id of [...sigs.keys()]) if (!m.defs.some((d) => d.id === id)) sigs.delete(id);
  }

  // The legend: one line a day, its number, place and date, and what it says now.
  function drawLegend(m) {
    const rows = m.defs.filter((d) => d.date).map((d, i) => {
      const st = m.state(d);
      const mine = m.mine.get(d.id);
      const b = el("button", "bk-row" + (st === "open" ? " is-now" : ""));
      b.type = "button";
      b.dataset.def = d.id;
      b.setAttribute("aria-label", label(d, st));
      const k = el("span", "bk-k" + (st === "have" ? " is-got" : ""), String(i + 1));
      const name = el("b", "", d.place || d.name_en || monthDay(d.date));
      name.append(el("small", "", weekdayOf(d.date) + " " + monthDay(d.date)));
      const at = mine ? isoMs(mine.at) : NaN;
      const word = st === "have" ? (isFinite(at) ? "Stamped " + tripClock(at) : "Stamped") : st === "open" ? "Stamp it today" : isNye(d) ? "Fireworks" : st === "missed" ? "Closed" : "";
      b.append(k, name, el("em", "", word));
      return b;
    });
    const leg = $("bookLeg");
    leg.replaceChildren(...rows);
    leg.hidden = !rows.length;
  }

  function drawToday(m) {
    const issue = m.defs.find((d) => !d.date) || null;
    const today = tripDate(m.t);
    const day = m.defs.find((d) => d.date === today) || null;
    const d = day || issue;
    const row = $("bookToday");
    row.hidden = !d;
    if (!d) return;
    const head = $("bookTH");
    head.replaceChildren(day ? "Today" : "The placemat’s own stamp");
    const people = list(m.s.people);
    const who = $("bookWho");
    const nodes = people.map((p) => {
      const x = list(m.s.stamps).find((st) => st && st.def === d.id && st.who === p.name && !st.gone);
      const item = el("div", "bk-p" + (x ? " is-in" : ""));
      const seal = el("i", "bk-seal");
      fillSeal(seal, p, p.name);
      const text = el("span");
      text.append(el("b", "", p.name === m.s.me ? "You" : p.name), el("i", "", x && isFinite(isoMs(x.at)) ? tripClock(isoMs(x.at)) : "not yet"));
      item.append(seal, text);
      return item;
    });
    who.replaceChildren(...nodes);
  }

  function render(s) {
    if (!opened) return;
    const m = model(s);
    const sub = [list(s.people).map((p) => p.name).join(" & "), s.trip && s.trip.start ? tripSpan(s.trip) : ""].filter(Boolean).join(" · ");
    if (mapSub !== sub) {
      mapSub = sub;
      $("bookMap").innerHTML = matSVG(sub); // numbers and escaped names only
    }
    drawGrid(m);
    drawLegend(m);
    $("bookN").textContent = countText(m.mine.size, m.defs.length);
    drawToday(m);
    // A held stamp that is no longer mine (lifted from History on another phone) is put back.
    if (held && !m.mine.has(held)) closeLook(false);
  }

  // ---- acting ----

  function bump() {
    if (calm()) return;
    page.classList.remove("thump");
    void page.offsetWidth; // play the bump again
    page.classList.add("thump");
    setTimeout(() => page.classList.remove("thump"), BUMP_MS + 80);
  }

  function press(d) {
    primeSound();
    hitId = d.id;
    // In the place? Only a yes goes with the press, never where.
    const day = d.date ? (store.state.days || []).find((x) => x && x.date === d.date) : null;
    const here = !!(where && day && inPlace(day, store.state.stops || [], where.current()));
    const token = store.pressStamp(d.id, { here });
    if (!token) {
      hitId = null;
      return;
    }
    // The store has taken the press: now the thud and the bump.
    landed = { id: d.id, at: now() };
    say.textContent = STAMPED;
    thud();
    bump();
  }

  function refuse(cell, d, st) {
    say.textContent = lockedLine(d, st);
    if (calm()) return;
    cell.classList.remove("nope");
    void cell.offsetWidth; // play the shake again
    cell.classList.add("nope");
  }

  function openLook(d, stamp) {
    closeLook(false);
    held = d.id;
    const b = el("button", "bk-look");
    b.type = "button";
    b.setAttribute("aria-label", "Put the stamp back");
    const card = el("span", "bk-card");
    card.innerHTML = bookStampSVG(stamp.seed, d, usableDefs(store.state.stampDefs)); // escaped by bookStampSVG
    const t = el("span", "bk-lt");
    t.append(d.name_en || d.place || (d.date ? "Stamp" : "Wendy’s"));
    if (d.place) t.append(el("i", "", d.place));
    const at = isoMs(stamp.at);
    const day = d.date || (isFinite(at) ? tripDate(at) : "");
    const when = (day ? weekdayOf(day) + " " + monthDay(day) : "") + (isFinite(at) ? (day ? " · " : "") + "stamped " + tripClock(at) : "");
    if (when) t.append(el("i", "", when));
    if (stamp.here === true && d.date) {
      const inl = el("i", "bk-in");
      inl.append(plainBlade(d.place || "Here"), "pressed in " + (d.place || "the day’s place"));
      t.append(inl);
    }
    card.append(t);
    b.append(card, el("span", "bk-lx", LOOK_BACK));
    b.addEventListener("click", () => closeLook(true));
    panel.append(b);
    look = b;
    // The rest of the book is not for reading while a stamp is held.
    scroll.inert = true;
    done.inert = true;
    b.focus({ preventScroll: true });
  }

  function closeLook(restoreFocus) {
    if (!look) return false;
    const id = held;
    look.remove();
    look = null;
    held = null;
    scroll.inert = false;
    done.inert = false;
    if (restoreFocus) {
      const cell = grid.querySelector('.bk-cell[data-def="' + CSS.escape(id) + '"]');
      if (cell) cell.focus({ preventScroll: true });
    }
    return true;
  }

  function tap(ev) {
    const hitEl = ev.target.closest(".bk-cell, .bk-row");
    if (!hitEl) return;
    // A line of the legend acts as its spot on the map.
    const cell = grid.querySelector('.bk-cell[data-def="' + CSS.escape(hitEl.dataset.def) + '"]');
    if (!cell) return;
    const m = model(store.state);
    const d = m.defs.find((x) => x.id === cell.dataset.def);
    if (!d) return;
    const st = m.state(d);
    if (st === "have") {
      if (landed.id === d.id && now() - landed.at < SETTLE_MS) return;
      const stamp = m.mine.get(d.id);
      if (stamp) openLook(d, stamp);
    } else if (st === "open") press(d);
    else refuse(cell, d, st);
  }
  grid.addEventListener("click", tap);
  $("bookLeg").addEventListener("click", tap);

  // ---- opening and closing ----

  function open() {
    if (opened) return;
    opened = true;
    say.textContent = "";
    render(store.state);
    panel.classList.add("is-open");
    panel.inert = false;
    scrim.hidden = false;
    root.classList.add("book-open");
    scroll.scrollTop = 0;
    done.focus({ preventScroll: true });
    clearInterval(timer);
    timer = setInterval(() => render(store.state), LOOK_MS);
  }

  // restoreFocus: give focus back to the Days stamp button.
  function close(restoreFocus = true) {
    if (!opened) return;
    closeLook(false);
    opened = false;
    clearInterval(timer);
    timer = null;
    panel.classList.remove("is-open");
    panel.inert = true;
    scrim.hidden = true;
    root.classList.remove("book-open");
    if (panel.contains(document.activeElement)) document.activeElement.blur();
    if (restoreFocus === true) {
      const btn = document.getElementById("stampBtn");
      if (btn && !btn.hidden) btn.focus({ preventScroll: true });
    }
  }

  done.addEventListener("click", () => close());
  scrim.addEventListener("click", () => close());
  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape" || !opened) return;
    // A held stamp is put back first.
    if (!closeLook(true)) close();
  });
  store.subscribe(render);

  return { open, close: (restoreFocus) => close(restoreFocus), isOpen: () => opened };
}
