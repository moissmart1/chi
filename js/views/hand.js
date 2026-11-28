/* Copyright (c) 2026 moissmart1. All rights reserved. No licence is granted: do not copy, adapt or reuse this code or design, and do not use it to train or prompt an AI system to reproduce it. See LICENSE. */
// The slip in your hand (look K): what opens when a slip on the Before list is
// tapped. A sheet, like the line sheet (js/views/line.js): the slip itself
// with its note, the link to book it and the claim key, and under it the
// counter bell. Ringing the bell is the tick: it rings at once, the slip is
// printed BOOKED, the sheet closes by itself after a moment and the slip is on
// the spike. A slip already on the spike opens white, with its way back.
//
// mountHand(root, store, { now, onSettled(id) }) -> { open(id, opener), close(refocus), isOpen() }
// - root is the phone. The sheet draws from store.state and redraws when
//   what it shows has changed; it closes itself when its item is gone.
// - Put it back (the one closing key), Escape and the scrim close it; focus
//   goes back to the slip that opened it, or to the screen's title when that
//   slip has moved on.
// - The bell is the only write to the planner (store.tickTodo, and its undo:
//   store.untickTodo, "Not booked after all" on any slip ticked in the app,
//   on this visit or an earlier one); the sheet never calls the backend itself.
// - onSettled(id): the sheet closed by itself after a ring.
// Everything from the planner goes in with textContent only; a link becomes
// an <a> only through safeHref and only when it starts https://.
// Taps go through tapOnRelease (js/views/tap.js).

import { safeHref } from "../plan.js";
import { fillSeal } from "../picture.js";
import { calm, wetInk } from "../fx.js";
import { bell } from "../sound.js";
import { clock as hhmm, localDay } from "../format.js";
import { homeToday, dueLine, openTodos, doneTodos, isDone, isBooked } from "../todos.js";
import { slipNo, slipTone, statusWord, printText } from "../before.js";
import { tapOnRelease } from "./tap.js";
import { el, slipSmall, onWords, shortDay } from "./before.js";

// How long the rung form stays before the sheet closes by itself.
export const RING_MS = 1600;

// The bell's picture, drawn once from this constant (no outside text in it).
const BELL = `<svg class="bf-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>
<radialGradient id="bfChrome" cx=".36" cy=".2" r=".95"><stop offset="0" stop-color="#fff"/><stop offset=".28" stop-color="#DDE2DE"/><stop offset=".6" stop-color="#8E9791"/><stop offset=".82" stop-color="#C7CDC8"/><stop offset="1" stop-color="#5E6661"/></radialGradient>
<linearGradient id="bfKnob" x1="0" x2="1"><stop offset="0" stop-color="#7c857f"/><stop offset=".45" stop-color="#fff"/><stop offset="1" stop-color="#6c746f"/></linearGradient>
<symbol id="bfBellArt" viewBox="0 0 132 104">
<ellipse cx="66" cy="88" rx="60" ry="13" fill="#141414"/>
<ellipse cx="66" cy="84" rx="60" ry="13" fill="#2b2b2b"/>
<path d="M14 82 C14 44 38 26 66 26 C94 26 118 44 118 82 C104 90 28 90 14 82Z" fill="url(#bfChrome)" stroke="#4c544f" stroke-width="1"/>
<path d="M30 62 C34 44 48 35 62 33" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".85"/>
<rect x="60" y="12" width="12" height="16" fill="url(#bfKnob)"/>
<ellipse cx="66" cy="11" rx="13" ry="6" fill="url(#bfKnob)" stroke="#4c544f" stroke-width="1"/>
</symbol></defs></svg>`;

const list = (v) => (Array.isArray(v) ? v : []);
// Item texts compared as the backend's sameItem_ does: runs of spaces (non-breaking
// ones too) count as one, and the ends are trimmed.
const sameItem = (a, b) => String(a == null ? "" : a).replace(/[\s\u00a0]+/g, " ").trim() === String(b == null ? "" : b).replace(/[\s\u00a0]+/g, " ").trim();

export function mountHand(root, store, { now = () => Date.now(), onSettled = () => {} } = {}) {
  const scrim = el("div", "scrim");
  scrim.id = "bfHandScrim";
  scrim.hidden = true;
  const sheet = el("div", "sheet");
  sheet.id = "bfHand";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-label", "A thing to book");
  sheet.inert = true;
  sheet.innerHTML = `<div class="sheet-top"><span id="bfHandNo"></span><button type="button" id="bfBack">Put it back</button></div><div id="bfHandBody"></div>` + BELL;
  root.append(scrim, sheet);
  // iPhone Safari draws a pressed look (:active) on touch only when something listens.
  sheet.addEventListener("touchstart", () => {}, { passive: true });
  // A key held down repeats Enter and Space: one press is one action (the bell
  // is rung once, and a repeat never lands on the key focus moves to).
  sheet.addEventListener("keydown", (ev) => {
    if (ev.repeat && (ev.key === "Enter" || ev.key === " ")) ev.preventDefault();
  });
  sheet.tabIndex = -1; // focus can rest on the sheet itself after a ring

  const no = sheet.querySelector("#bfHandNo");
  const back = sheet.querySelector("#bfBack");
  const body = sheet.querySelector("#bfHandBody");

  let openId = null;
  let opener = null;
  let shownSig = "";
  let rungId = null; // the item whose bell was rung here and whose sheet is about to close
  let rungBuilt = false;
  let timer = null;

  const todos = () => list(store.state.todos).filter((t) => t && typeof t.id === "string" && t.id);
  const current = () => todos().find((t) => t.id === openId) || null;

  const person = (name) => list(store.state.people).find((p) => p.name === name) || null;
  const picKey = (name) => {
    const p = person(name);
    return p && typeof p.photo === "string" && p.photo ? p.photo.length + p.photo.slice(-24) : "";
  };

  function seal(name) {
    const s = el("span", "mini sm");
    s.setAttribute("aria-hidden", "true");
    return fillSeal(s, person(name), name);
  }

  // The slip's place in its own list (the rail, or the spike), for its number.
  function positionOf(t) {
    const all = todos();
    const where = isDone(t) ? doneTodos(all) : openTodos(all);
    return Math.max(0, where.findIndex((x) => x.id === t.id));
  }

  function bellEl(t, rung) {
    const b = el("button", "bf-bell" + (rung ? " rung" : ""));
    b.type = "button";
    b.id = "bfBell";
    b.disabled = rung;
    b.setAttribute("aria-label", "Booked: " + t.item);
    b.innerHTML = '<svg viewBox="0 0 132 104" aria-hidden="true" focusable="false"><use href="#bfBellArt"/></svg>';
    return b;
  }

  function slipEl(t, position, rung) {
    const big = el("div", "bf-big bf-hang");
    const tone = isDone(t) && !rung ? "white" : slipTone(t.status);
    const slip = el("div", "bf-t" + (tone ? " " + tone : "") + (rung ? " is-rung" : ""));
    slip.id = "bfHandSlip";
    big.append(slip);
    const top = el("div", "bf-top");
    top.append(el("b", "", slipNo(t.id, position)), el("span", "", rung || isDone(t) ? "Booked" : statusWord(t.status)));
    slip.append(top, el("div", "bf-n", t.item));
    return { big, slip };
  }

  function openForm(t, position, today) {
    const { big, slip } = slipEl(t, position, false);
    const d = dueLine(t.bookBy, today);
    if (d) {
      const due = el("div", "bf-due" + (d.strong ? " soon" : ""));
      due.append(d.lead + " ", el("b", "", d.date), " · " + d.tail);
      slip.append(due);
    }
    const note = typeof t.note === "string" ? t.note.trim() : "";
    if (note) slip.append(el("p", "bf-note", note));
    const ctl = el("div", "bf-ctl");
    const safe = safeHref(t.link);
    const href = /^https:\/\//i.test(safe || "") ? safe : "";
    if (href) {
      const a = el("a", "bf-link", "Open the booking ↗");
      a.href = href;
      a.target = "_blank";
      a.rel = "noopener";
      a.setAttribute("aria-label", "Open the booking for " + t.item);
      ctl.append(a);
    }
    const mine = !!t.claimedBy && t.claimedBy === store.state.me;
    const others = !!t.claimedBy && !mine;
    // On your own link someone else's claim is theirs: no Take it over.
    if (!(others && store.state.personal === true)) {
      const word = mine ? "Hand it back" : others ? "Take it over" : "I’ll do it";
      const claim = el("button", "", word);
      claim.type = "button";
      claim.dataset.act = "claim";
      claim.dataset.on = mine ? "0" : "1";
      claim.setAttribute("aria-label", word + ": " + t.item);
      ctl.append(claim);
    }
    slip.append(ctl);
    const who = onWords(t, store.state.me);
    if (who) {
      const w = el("div", "bf-hand-who");
      w.append(seal(t.claimedBy), who);
      slip.append(w);
    }
    const say = el("p");
    say.id = "bfSay";
    say.setAttribute("aria-live", "polite");
    const b = el("b", "", "Booked?");
    say.append(b, "Ring the bell. It tells the planner too.");
    const pass = el("div", "bf-pass");
    pass.append(say, bellEl(t, false));
    return [big, pass];
  }

  // The rung form: the print on the slip, the bell rocked, "Order up."
  function rungForm(t, position, today) {
    const { big, slip } = slipEl(t, position, true);
    const d = dueLine(t.bookBy, today);
    if (d) slip.append(el("div", "bf-due", d.lead + " " + d.date));
    const note = typeof t.note === "string" ? t.note.trim() : "";
    if (note) slip.append(el("p", "bf-note", note));
    const ms = Date.parse(t.tickedAt || "");
    const p = printText(t, localDay, hhmm(isFinite(ms) ? ms : now()));
    const print = el("span", "tclock bf-print" + (calm() ? "" : " hit"));
    print.setAttribute("aria-hidden", "true");
    const small = el("small", "", p.small);
    print.append(p.big, small);
    slip.append(print);
    if (!calm()) wetInk(print);
    const say = el("p");
    say.id = "bfSay";
    say.setAttribute("aria-live", "polite");
    say.append(el("b", "", "Order up."), "It’s on the spike.");
    const line = el("span", "bf-wait");
    line.id = "bfSayMore";
    say.append(line);
    const pass = el("div", "bf-pass");
    pass.append(say, bellEl(t, true));
    return [big, pass];
  }

  // A slip already on the spike: white, how it was booked, and what can be done.
  function spikedForm(t, position, today) {
    const { big, slip } = slipEl(t, position, false);
    const by = String(t.tickedBy || "").trim();
    const ms = Date.parse(t.tickedAt || "");
    const day = shortDay(ms);
    slip.append(el("div", "bf-due", by ? by + (day ? " · " + day : "") : "Booked in the planner"));
    const small = slipSmall(t, store.state);
    if (small) slip.append(el("p", "bf-note", small));
    const ctl = el("div", "bf-ctl");
    if (!by && (isBooked(t.status) || t.done === true)) {
      ctl.append(el("p", "", "Booked in the planner. Change it there."));
    } else {
      const u = el("button", "", "Not booked after all");
      u.type = "button";
      u.dataset.act = "untick";
      ctl.append(u);
    }
    slip.append(ctl);
    return [big];
  }

  function drawMore(t) {
    const line = body.querySelector("#bfSayMore");
    if (!line) return;
    const small = slipSmall(t, store.state);
    if (line.textContent !== small) {
      line.textContent = small;
      line.className = small ? "bf-wait" : "";
    }
  }

  function render() {
    if (!sheet.classList.contains("is-open")) return;
    const t = current();
    if (!t) {
      close(true);
      return;
    }
    // A slip put back while the sheet shows the ring (a refused tick, an Undo): open again.
    if (rungId === t.id && !isDone(t)) {
      rungId = null;
      clearTimeout(timer);
    }
    const rung = rungId === t.id;
    if (rung && rungBuilt) {
      drawMore(t);
      return;
    }
    const today = homeToday(now());
    const position = positionOf(t);
    const o = store.state;
    const sig = JSON.stringify([rung ? "rung" : isDone(t) ? "done" : "open", t.id, t.item, t.status, t.bookBy, t.note, t.link, t.claimedBy, t.tickedBy, t.tickedAt, !!t.pending, t.plannerComputes === true, o.me, o.personal === true, picKey(t.claimedBy), today, position]);
    if (sig === shownSig) return;
    shownSig = sig;
    no.textContent = slipNo(t.id, position);
    const act = document.activeElement && body.contains(document.activeElement) ? document.activeElement : null;
    const was = act ? act.dataset.act || act.id || (act.classList.contains("bf-link") ? "link" : "") : "";
    body.replaceChildren(...(rung ? rungForm(t, position, today) : isDone(t) ? spikedForm(t, position, today) : openForm(t, position, today)));
    rungBuilt = rung;
    if (rung) drawMore(t);
    if (was) {
      const again = body.querySelector('[data-act="' + was + '"]') || body.querySelector("#" + (CSS.escape(was))) || (was === "link" ? body.querySelector(".bf-link") : null);
      if (again) again.focus({ preventScroll: true });
      else if (rung) back.focus({ preventScroll: true });
    }
  }

  function open(id, from = null) {
    const t = todos().find((x) => x.id === id);
    if (!t) return false;
    openId = id;
    opener = from;
    shownSig = "";
    rungId = null;
    rungBuilt = false;
    clearTimeout(timer);
    sheet.classList.add("is-open");
    sheet.inert = false;
    scrim.hidden = false;
    root.classList.add("bfhand-open");
    sheet.scrollTop = 0;
    render();
    back.focus({ preventScroll: true });
    return true;
  }

  function visible(n) {
    return !!n && n.isConnected && n.getClientRects().length > 0;
  }

  // refocus: give focus back to the slip that opened the sheet when it is still
  // there, else to the screen's title.
  function close(refocus = true) {
    if (!sheet.classList.contains("is-open")) return;
    clearTimeout(timer);
    openId = null;
    rungId = null;
    rungBuilt = false;
    const from = opener;
    opener = null;
    sheet.classList.remove("is-open");
    sheet.inert = true;
    scrim.hidden = true;
    root.classList.remove("bfhand-open");
    if (sheet.contains(document.activeElement)) document.activeElement.blur();
    if (refocus === true) {
      const title = document.getElementById("bfTitle");
      const to = visible(from) ? from : visible(title) ? title : null;
      if (to) to.focus({ preventScroll: true });
    }
  }

  // ---- acting ----

  function ring() {
    const t = current();
    if (!t || isDone(t) || rungId === t.id) return;
    const id = t.id;
    // The sheet shows the rung form from the store's own change (it is drawn
    // at once), so it is marked before the tick is made.
    rungId = id;
    rungBuilt = false;
    shownSig = "";
    const token = store.tickTodo(id);
    if (!token) {
      // Refused at once: nothing changes here.
      rungId = null;
      return;
    }
    bell();
    render();
    sheet.focus({ preventScroll: true }); // the bell is spent; focus rests on the sheet (a held Enter does nothing there)
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (rungId !== id || openId !== id) return;
      close(false);
      onSettled(id);
    }, RING_MS);
  }

  function doAct(what) {
    const t = current();
    if (!t) return;
    if (what === "bell") return ring();
    if (what === "claim") {
      if (isDone(t)) return;
      const btn = body.querySelector('[data-act="claim"]');
      store.claimTodo(t.id, !btn || btn.dataset.on === "1");
    } else if (what === "untick") {
      if (!isDone(t) || !String(t.tickedBy || "").trim()) return;
      store.untickTodo(t.id);
      // Taken back: the sheet goes and focus is on the screen's title.
      close(false);
      const title = document.getElementById("bfTitle");
      if (visible(title)) title.focus({ preventScroll: true });
    }
  }

  // A redraw between finger down and finger up (a quiet pull, another phone's
  // claim) replaces the bell, so the tap is done on finger up. The bell press
  // keeps the open slip's # and item text: a pull that renumbered the planner
  // meanwhile can put another item under that #, and then nothing is rung (chi#13).
  const tap = tapOnRelease(sheet, {
    pick: (target) => {
      const b = target.closest("#bfBell, [data-act]");
      if (!b || !body.contains(b)) return null;
      if (b.id !== "bfBell") return b.dataset.act;
      const t = current();
      return t ? { bell: true, id: t.id, item: t.item } : null;
    },
    act: (what) => {
      if (what && typeof what === "object") {
        const t = current();
        if (what.bell && t && t.id === what.id && sameItem(t.item, what.item)) ring();
        return;
      }
      doAct(what);
    },
  });
  sheet.addEventListener("click", (ev) => {
    if (tap.skip(ev)) return;
    const b = ev.target.closest("#bfBell, [data-act]");
    if (!b || !body.contains(b)) return;
    doAct(b.id === "bfBell" ? "bell" : b.dataset.act);
  });
  back.addEventListener("click", () => close(true));
  scrim.addEventListener("click", () => close(true));
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && sheet.classList.contains("is-open")) close(true);
  });

  store.subscribe(render);

  return {
    open,
    close: (refocus) => {
      tap.clear();
      close(refocus);
    },
    isOpen: () => sheet.classList.contains("is-open"),
  };
}
