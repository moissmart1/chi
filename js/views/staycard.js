/* Copyright (c) 2026 moissmart1. All rights reserved. No licence is granted: do not copy, adapt or reuse this code or design, and do not use it to train or prompt an AI system to reproduce it. See LICENSE. */
// The hotel card: where you sleep, to hold up to a taxi driver. A sheet on
// the ticket's own stock, opened from a ticket's stay row.
//
// mountStayCard(root, store) -> { open(stayId), close(restoreFocus), isOpen() }
// root is the phone. The card draws from store.state.stays only, so it opens
// with no signal; nothing is fetched. It redraws on every store change while
// open, and closes itself when its stay is gone. The name and the address are
// large, in Japanese when there is Japanese; under them "Please take me here."
// (Please take me here.), the note, a map link and the booking link. A stay's optional photo comes
// first, as a stop's does on its ticket. Text from
// the Sheet goes in with textContent; a link only through safeHref.

import { safeHref, stayMapsUrl } from "../plan.js";

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

// The card's contents for one stay.
function card(stay) {
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
  const jp = str(stay.nameJp);
  const en = str(stay.name);
  const big = jp || en;
  if (big) nodes.push(el("div", "sy-name", big));
  if (jp && en) nodes.push(el("div", "sy-en", en));
  const address = str(stay.addressJp);
  if (address) nodes.push(el("div", "sy-ad", address));
  const ask = el("div", "sy-ask");
  ask.append(el("b", "", "Please take me here."));
  nodes.push(ask);
  const note = str(stay.note);
  if (note) nodes.push(el("div", "sy-note", note));
  const btns = el("div", "r-btns");
  const map = stayMapsUrl(stay);
  if (map) btns.append(link("r-map sy-map", "Map ↗", map));
  const booking = safeHref(stay.link);
  if (booking) btns.append(link("r-map alt", "Booking ↗", booking));
  if (btns.childElementCount) nodes.push(btns);
  return nodes;
}

export function mountStayCard(root, store) {
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

  const current = () => (store.state.stays || []).find((s) => s && s.id === stayId && !s.deleted) || null;
  const isOpen = () => sheet.classList.contains("is-open");

  function render() {
    if (!isOpen()) return;
    const stay = current();
    if (!stay) {
      close(false);
      return;
    }
    const sig = JSON.stringify(stay);
    if (sig === shown) return;
    shown = sig;
    body.replaceChildren(...card(stay));
  }

  function open(id) {
    stayId = id;
    if (!current()) {
      stayId = null;
      return false;
    }
    shown = "";
    sheet.classList.add("is-open");
    sheet.inert = false;
    scrim.hidden = false;
    root.classList.add("stay-open");
    sheet.scrollTop = 0;
    render();
    done.focus({ preventScroll: true });
    return true;
  }

  // restoreFocus: give focus back to the stay row on the ticket in view.
  function close(restoreFocus = true) {
    if (!isOpen()) return;
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

  return { open, close: (restoreFocus) => close(restoreFocus), isOpen };
}
