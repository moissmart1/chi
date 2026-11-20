/* Copyright (c) 2026 moissmart1. All rights reserved. No licence is granted: do not copy, adapt or reuse this code or design, and do not use it to train or prompt an AI system to reproduce it. See LICENSE. */
// The board between Days' top line and its rail: green street-sign blades on
// a pole. What it says comes from js/board.js; this only draws it.
//
// mountBoard({ storage, now }) -> { el, update(model, tz), clear() }
// - el: the board's box (place it in Days, between the bar and the rail).
// - update(model, tz): model is what boardFor gives, or null (no board). The
//   board is there when there is a model and it was not closed today (the trip
//   zone's date, by the real clock: chi.board keeps only the date it was
//   closed on). Called on every Days redraw: a text that is the same is left
//   alone. It folds open and shut in 200 ms (none under reduced motion).
// - clear(): the trip was taken off the phone: out of the page at once with
//   every word taken off it (update(null) leaves the last words in the page).
// - The × closes it for today (44 px wide). A closed board is not in the
//   page's tab order. now(): the real time, never the demo's.
// - The plate (.g-pl): with a model that used the phone's position (from),
//   the sign and the miles and walk to the next stop; else hidden and empty.
// Every word on it is set with textContent.

import { BOARD_KEY, closedDate, isClosed } from "../board.js";
import { TRIP_TZ } from "../trip.js";
import { bladeEl } from "./sign.js";

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}
const calm = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const FOLD_MS = 200;

// <div class="g-X"><small></small><b></b></div>
function pair(cls) {
  const d = el("div", cls);
  const small = el("small");
  const big = el("b");
  d.append(small, big);
  return { d, small, b: big };
}

export function mountBoard({ storage = null, now = () => Date.now() } = {}) {
  const store = storage || (() => {
    try {
      return globalThis.localStorage;
    } catch {
      return null;
    }
  })();
  const get = () => {
    try {
      return store ? store.getItem(BOARD_KEY) : null;
    } catch {
      return null;
    }
  };
  const set = (v) => {
    try {
      if (store) store.setItem(BOARD_KEY, v);
    } catch {
      // nowhere to keep it: it is closed for this visit only
    }
  };

  const wrap = el("div", "brd-wrap");
  wrap.hidden = true;
  wrap.inert = true;
  const clip = el("div");
  const brd = el("div", "brd g-brd");
  brd.setAttribute("role", "group");
  brd.setAttribute("aria-label", "Next stop board");
  const pole = el("i", "g-pole");
  pole.setAttribute("aria-hidden", "true");

  const top = el("div", "g-blade g-top");
  const nm = pair("g-nm");
  const no = pair("g-no");
  top.append(nm.d, no.d);

  const lv = el("div", "g-blade g-lv");
  const left = pair("");
  const right = pair("");
  lv.append(left.d, right.d);

  const ft = el("div", "g-ft");
  const pl = el("div", "g-pl");
  pl.hidden = true;
  const x = el("button", "brd-x", "×");
  x.type = "button";
  x.setAttribute("aria-label", "Close the board for today");
  ft.append(pl, x);

  brd.append(pole, top, lv, ft);
  clip.append(brd);
  wrap.append(clip);

  let shown = false;
  let plate = ""; // what the plate says now ("" when it is hidden)
  let tzNow = TRIP_TZ;
  let foldTimer = null;

  function show(on) {
    if (on === shown) return;
    shown = on;
    clearTimeout(foldTimer);
    if (on) {
      wrap.hidden = false;
      wrap.inert = false;
      wrap.classList.remove("is-shut");
      return;
    }
    wrap.inert = true;
    if (calm()) {
      wrap.hidden = true;
      return;
    }
    wrap.classList.add("is-shut");
    // Out of the page once folded: when the fold ends, or soon after if it never reports.
    foldTimer = setTimeout(() => {
      if (!shown) wrap.hidden = true;
    }, FOLD_MS + 200);
  }
  wrap.addEventListener("transitionend", (ev) => {
    if (ev.target === wrap && !shown) wrap.hidden = true;
  });

  const put = (node, text) => {
    if (node.textContent !== text) node.textContent = text;
  };
  // The plate: its children are made again only when what it says changes.
  function drawPlate(from) {
    const want = from ? [from.blocks, from.dir, from.dist].join("|") : "";
    if (want === plate) return;
    plate = want;
    pl.hidden = !from;
    if (from) {
      const d = el("span", "dist", from.dist);
      pl.replaceChildren(bladeEl(from), d);
    } else pl.replaceChildren();
  }

  function update(model, tz) {
    tzNow = tz || TRIP_TZ;
    if (!model || isClosed(get(), tzNow, now())) {
      show(false);
      return;
    }
    brd.dataset.kind = model.kind;
    if (model.kind === "before") {
      brd.removeAttribute("data-tone");
      put(nm.small, model.small);
      put(nm.b, model.big);
      no.d.hidden = true;
      lv.hidden = true;
      drawPlate(null);
    } else {
      brd.dataset.tone = model.tone;
      put(nm.small, "Next stop");
      put(nm.b, model.name);
      no.d.hidden = false;
      put(no.small, "At");
      put(no.b, model.time);
      lv.hidden = false;
      const cls = "g-blade g-lv " + model.tone;
      if (lv.className !== cls) lv.className = cls;
      put(left.small, model.l.small);
      put(left.b, model.l.big);
      right.d.hidden = !model.r;
      if (model.r) {
        put(right.small, model.r.small);
        put(right.b, model.r.big);
      }
      drawPlate(model.from);
    }
    show(true);
  }

  x.addEventListener("click", () => {
    set(closedDate(tzNow, now()));
    // Focus goes to Days' own first control, not into the page's end.
    const view = wrap.closest("section, .view");
    const count = view && view.querySelector("#dayCount");
    if (count && !count.hidden) count.focus({ preventScroll: true });
    show(false);
  });

  function clear() {
    clearTimeout(foldTimer);
    shown = false;
    wrap.inert = true;
    wrap.hidden = true;
    wrap.classList.add("is-shut");
    for (const n of [nm.small, nm.b, no.small, no.b, left.small, left.b, right.small, right.b]) n.textContent = "";
    drawPlate(null);
  }

  return { el: wrap, update, clear };
}
