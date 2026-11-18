/* Copyright (c) 2026 moissmart1. All rights reserved. No licence is granted: do not copy, adapt or reuse this code or design, and do not use it to train or prompt an AI system to reproduce it. See LICENSE. */
// The uneven split panel (#un), opened from the register. It works on the
// register's draft: draft.mode ("parts" | "exact" | null), draft.parts
// ({ name: 1..99 }), draft.exact ({ name: typed string }), plus the draft's
// amt, cur, rate and split. It changes those and calls onChange(); the
// register redraws everything, this panel included, through render().
//
// Amounts are handled in cents of the entered currency (Canadian or US
// dollars: both have cents).

import { expenseShares } from "../money.js";
import { tripMoney, dollars } from "../format.js";
import { HOME_CURRENCY } from "../trip.js";

export const MAX_PARTS = 99;
const MAX_DIGITS = 8;
// The least height the panel is ever given, in px.
const UN_MIN_ROOM = 120;

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

// A typed amount ("12.5", "1450") in cents. Both currencies have cents, so
// cur only says which sign to print (showUnits).
export function toUnits(str) {
  const [whole = "", dec = ""] = String(str || "").split(".");
  return Number(whole || 0) * 100 + Number((dec + "00").slice(0, 2));
}

// Cents back to the number the backend takes (12.5 for 1250 cents).
export const fromUnits = (units) => units / 100;
export const showUnits = (units, cur) => (cur === HOME_CURRENCY ? dollars(units) : tripMoney(units));

// What a typed amount can hold: digits, one point and two decimals.
export function cleanAmount(str) {
  const s = String(str).replace(/[^\d.]/g, "");
  const dot = s.indexOf(".");
  if (dot === -1) return s.slice(0, MAX_DIGITS);
  return s.slice(0, dot).slice(0, MAX_DIGITS) + "." + s.slice(dot + 1).replace(/\./g, "").slice(0, 2);
}

// How the draft splits: { mode, vals, ok, left }. Parts that are all the
// same are an equal split. Exact needs every amount at least one unit and
// the amounts to add up to the total (left === 0).
export function splitOf(d) {
  if (d.mode === "exact") {
    const total = toUnits(d.amt);
    const units = d.split.map((n) => toUnits(d.exact[n]));
    const left = total - units.reduce((a, u) => a + u, 0);
    const everyone = units.every((u) => u >= 1);
    return { mode: "exact", vals: units.map((u) => fromUnits(u)), units, left, everyone, ok: total > 0 && left === 0 && everyone };
  }
  if (d.mode === "parts") {
    const vals = d.split.map((n) => d.parts[n] || 1);
    if (vals.some((v) => v !== vals[0])) return { mode: "parts", vals, ok: true, left: 0 };
  }
  return { mode: "equal", vals: [], ok: true, left: 0 };
}

// mountUneven(host, { onChange }) -> { render(draft), open(), close(), isOpen() }
export function mountUneven(host, { onChange }) {
  const un = el("div", "un");
  un.id = "un";
  un.hidden = true;
  un.setAttribute("role", "group");
  un.setAttribute("aria-label", "Uneven split");
  const top = el("div", "un-top");
  const done = el("button", "", "Set split");
  done.type = "button";
  done.id = "unDone";
  top.append(el("span", "", "Uneven split"), done);
  const modes = el("div", "un-mode");
  modes.id = "unMode";
  for (const [mode, label] of [["parts", "Parts"], ["exact", "Exact amounts"]]) {
    const b = el("button", "chip", label);
    b.type = "button";
    b.dataset.mode = mode;
    modes.append(b);
  }
  const rows = el("div", "un-rows");
  const left = el("div", "un-left");
  left.id = "unLeft";
  left.setAttribute("aria-live", "polite");
  un.append(top, modes, rows, left);
  host.append(un);

  let draft = null;
  let shown = ""; // mode and people the rows were built for

  modes.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-mode]");
    if (!b || !draft || draft.mode === b.dataset.mode) return;
    draft.mode = b.dataset.mode;
    onChange();
  });
  rows.addEventListener("click", (ev) => {
    const b = ev.target.closest(".un-minus, .un-plus");
    if (!b || !draft) return;
    const name = b.closest(".un-row").dataset.p;
    const step = b.classList.contains("un-plus") ? 1 : -1;
    draft.parts[name] = Math.min(MAX_PARTS, Math.max(1, (draft.parts[name] || 1) + step));
    onChange();
  });
  rows.addEventListener("input", (ev) => {
    const input = ev.target.closest("input.un-val");
    if (!input || !draft) return;
    const clean = cleanAmount(input.value);
    if (clean !== input.value) input.value = clean;
    draft.exact[input.closest(".un-row").dataset.p] = clean;
    onChange();
  });
  done.addEventListener("click", () => {
    close();
    onChange();
  });
  // The phone turned sideways or back: the room above the register is not
  // what it was, and nothing else measures it again while the panel is open.
  if (typeof globalThis.addEventListener === "function") globalThis.addEventListener("resize", () => { if (!un.hidden) fit(); });

  function buildRows() {
    const exact = draft.mode === "exact";
    rows.replaceChildren(
      ...draft.split.map((name) => {
        const row = el("div", "un-row");
        row.dataset.p = name;
        const who = el("span", "un-who", name);
        const minus = el("button", "un-minus", "−");
        minus.type = "button";
        minus.setAttribute("aria-label", "One part less for " + name);
        const plus = el("button", "un-plus", "+");
        plus.type = "button";
        plus.setAttribute("aria-label", "One part more for " + name);
        let val;
        if (exact) {
          val = el("input", "un-val");
          val.type = "text";
          val.autocomplete = "off";
          val.setAttribute("aria-label", name + "’s amount");
        } else {
          val = el("span", "un-val");
        }
        minus.hidden = exact;
        plus.hidden = exact;
        row.append(who, minus, val, plus, el("span", "un-amt"));
        return row;
      }),
    );
  }

  function render(d) {
    draft = d;
    if (un.hidden) return;
    const sig = d.mode + "|" + d.split.join(",");
    if (sig !== shown) {
      shown = sig;
      buildRows();
    }
    for (const b of modes.children) b.classList.toggle("is-on", b.dataset.mode === d.mode);

    const total = toUnits(d.amt);
    const split = splitOf(d);
    let cents = null;
    if (d.mode === "parts" && total > 0 && (d.cur === HOME_CURRENCY || d.rate > 0)) {
      cents = expenseShares({ amount: fromUnits(total), currency: d.cur, rate: d.rate, split: d.split, splitMode: "parts", splitVals: d.split.map((n) => d.parts[n] || 1) });
    }
    for (const row of rows.children) {
      const name = row.dataset.p;
      const val = row.querySelector(".un-val");
      const amt = row.querySelector(".un-amt");
      if (d.mode === "exact") {
        val.inputMode = "decimal";
        val.placeholder = showUnits(0, d.cur);
        const v = d.exact[name] || "";
        if (val.value !== v) val.value = v;
        const u = toUnits(v);
        amt.textContent = u > 0 ? showUnits(u, d.cur) : "";
      } else {
        const n = d.parts[name] || 1;
        val.textContent = String(n);
        row.querySelector(".un-minus").disabled = n <= 1;
        row.querySelector(".un-plus").disabled = n >= MAX_PARTS;
        amt.textContent = cents ? dollars(cents[name]) : "";
      }
    }

    let say = "";
    if (d.mode === "exact" && total > 0) {
      if (split.left > 0) say = showUnits(split.left, d.cur) + " left to assign";
      else if (split.left < 0) say = showUnits(-split.left, d.cur) + " too much";
      else if (!split.everyone) say = "Give everyone an amount.";
    }
    left.textContent = say;
    left.hidden = !say;
    fit();
  }

  // The panel stands above the register: it may be no taller than the room
  // there (a Safari tab on a small phone has little), and its rows scroll
  // inside it while the title, Set split and the mode chips stay in view.
  function fit() {
    const phone = host.parentElement;
    if (!phone) return;
    const room = phone.clientHeight - host.offsetHeight - 16; // 8 px gap below, 8 above
    // Never so small that its title and Done are squeezed away (a keyboard
    // can shrink the layout viewport to almost nothing). With less room than
    // that it comes down over the top of the register by the shortfall, so
    // its top stays 8 px inside the screen instead of leaving it.
    un.style.setProperty("--un-room", Math.max(UN_MIN_ROOM, room) + "px");
    const short = UN_MIN_ROOM - room;
    if (short > 0) un.style.bottom = "calc(100% + 8px - " + short + "px)";
    else un.style.removeProperty("bottom");
  }

  function open() {
    if (!un.hidden) return;
    un.hidden = false;
    host.classList.add("un-open");
    shown = "";
  }

  function close() {
    un.hidden = true;
    host.classList.remove("un-open");
  }

  return { render, open, close, isOpen: () => !un.hidden };
}
