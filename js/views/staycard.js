/* Copyright (c) 2026 moissmart1. All rights reserved. No licence is granted: do not copy, adapt or reuse this code or design, and do not use it to train or prompt an AI system to reproduce it. See LICENSE. */
// The hotel card: where you sleep, to hold up to a taxi driver. A sheet on
// the ticket's own stock, opened from a ticket's stay row.
//
// mountStayCard(root, store, { where }) -> { open(stayId), close(restoreFocus), isOpen() }
// root is the phone. The card draws from store.state.stays only, so it opens
// with no signal; nothing is fetched. It redraws on every store change while
// open, and closes itself when its stay is gone. The name and the address are
// large, the English name first; under them "Please take me here.", the
// note, a map link and the booking link. A stay's optional photo comes
// first, as a stop's does on its check. Text from
// the Sheet goes in with textContent; a link only through safeHref.
//
// With a usable position (js/where.js) and the stay on the map, the card
// also says how far, up to 50 km along the grid: the small green sign and
// "1.4 mi from here", after the note and before the keys. Otherwise nothing
// is added. While the card is open it looks again every 15 seconds and on
// every new position, so the line goes once the position is no longer
// usable. Only that line is changed then: the keys keep their nodes and focus.

import { safeHref, stayMapsUrl, stayDistance } from "../plan.js";
import { bladeEl } from "./sign.js";

const MARKUP = `
<div class="sheet-top"><span>Where you sleep</span><button type="button" id="stayDone">Done</button></div>
<div class="sy" id="stayBody"></div>`;

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

const str = (v) => (typeof v === "string" ? v.trim() : "");

function link(cls, text, href) {
  const a = el("a", cls, text);
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener";
  return a;
}

// A photo address that failed to load is not drawn again (this visit).
const failedPhotos = new Set();

const RECHECK_MS = 15000;

// How far the stay is: the sign and "1.4 mi from here".
function distEl(far) {
  const d = el("div", "sy-dist");
  d.append(bladeEl(far.from), el("span", "dist", far.text));
  return d;
}

// The card's contents for one stay. far: stayDistance(...), or null.
function card(stay, far = null) {
  const nodes = [];
  const photo = safeHref(stay.photo);
  if (photo && !failedPhotos.has(photo)) {
    const img = el("img", "sy-ph");
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => {
      failedPhotos.add(photo);
      img.remove();
    }, { once: true });
    img.src = photo;
    nodes.push(img);
  }
  // The name large (English first); a second name from the Sheet, if any, under it.
  const jp = str(stay.nameJp);
  const en = str(stay.name);
  const big = en || jp;
  if (big) nodes.push(el("div", "sy-name", big));
  if (jp && en) nodes.push(el("div", "sy-en", jp));
  const address = str(stay.addressJp);
  if (address) nodes.push(el("div", "sy-ad", address));
  const ask = el("div", "sy-ask");
  ask.append(el("b", "", "Please take me here."));
  nodes.push(ask);
  const note = str(stay.note);
  if (note) nodes.push(el("div", "sy-note", note));
  if (far) nodes.push(distEl(far));
  const btns = el("div", "r-btns");
  const map = stayMapsUrl(stay);
  if (map) btns.append(link("r-map sy-map", "Map ↗", map));
  const booking = safeHref(stay.link);
  if (booking) btns.append(link("r-map alt", "Booking ↗", booking));
  if (btns.childElementCount) nodes.push(btns);
  return nodes;
}

export function mountStayCard(root, store, { where = null } = {}) {
  const scrim = el("div", "scrim");
  scrim.id = "stayScrim";
  scrim.hidden = true;
  const sheet = el("div", "sheet stay");
  sheet.id = "stay";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-label", "Where you sleep");
  sheet.inert = true;
  sheet.innerHTML = MARKUP;
  root.append(scrim, sheet);

  const body = sheet.querySelector("#stayBody");
  const done = sheet.querySelector("#stayDone");
  let stayId = null;
  let shown = ""; // what the card was last drawn from
  let shownStay = ""; // the stay alone, as last drawn
  let recheck = null; // while open: is the distance still from a usable position?

  const current = () => (store.state.stays || []).find((s) => s && s.id === stayId && !s.deleted) || null;
  const isOpen = () => sheet.classList.contains("is-open");

  function render() {
    if (!isOpen()) return;
    const stay = current();
    if (!stay) {
      close(false);
      return;
    }
    // How far, from a usable position (read here and dropped).
    const far = where ? stayDistance(stay, where.current()) : null;
    const sig = JSON.stringify([stay, far]);
    if (sig === shown) return;
    shown = sig;
    const same = JSON.stringify(stay);
    // Only the distance changed: only its line is touched.
    if (same === shownStay) {
      const was = body.querySelector(".sy-dist");
      const next = far ? distEl(far) : null;
      if (was && next) was.replaceWith(next);
      else if (was) was.remove();
      else if (next) body.insertBefore(next, body.querySelector(".r-btns"));
      return;
    }
    shownStay = same;
    body.replaceChildren(...card(stay, far));
  }

  function open(id) {
    stayId = id;
    if (!current()) {
      stayId = null;
      return false;
    }
    shown = "";
    shownStay = "";
    sheet.classList.add("is-open");
    sheet.inert = false;
    scrim.hidden = false;
    root.classList.add("stay-open");
    if (where && !recheck) recheck = setInterval(render, RECHECK_MS);
    sheet.scrollTop = 0;
    render();
    done.focus({ preventScroll: true });
    return true;
  }

  // restoreFocus: give focus back to the stay row on the ticket in view.
  function close(restoreFocus = true) {
    if (!isOpen()) return;
    clearInterval(recheck);
    recheck = null;
    const id = stayId;
    stayId = null;
    sheet.classList.remove("is-open");
    sheet.inert = true;
    scrim.hidden = true;
    root.classList.remove("stay-open");
    if (sheet.contains(document.activeElement)) document.activeElement.blur();
    if (restoreFocus === true) {
      const rows = [...root.querySelectorAll(".tk-stay")].filter((b) => b.dataset.stay === id);
      const rail = root.querySelector("#rail");
      // The row on the ticket in view: the one nearest the rail's middle.
      const mid = rail ? rail.getBoundingClientRect().left + rail.getBoundingClientRect().width / 2 : 0;
      const off = (b) => Math.abs(b.getBoundingClientRect().left + b.getBoundingClientRect().width / 2 - mid);
      rows.sort((a, b) => off(a) - off(b));
      if (rows[0]) rows[0].focus({ preventScroll: true });
    }
  }

  done.addEventListener("click", () => close());
  scrim.addEventListener("click", () => close());
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") close();
  });
  store.subscribe(render);
  if (where) where.subscribe(render);

  return { open, close: (restoreFocus) => close(restoreFocus), isOpen };
}
