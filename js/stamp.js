/* Copyright (c) 2026 moissmart1. All rights reserved. No licence is granted: do not copy, adapt or reuse this code or design, and do not use it to train or prompt an AI system to reproduce it. See LICENSE. */
// The PAID print and the SERVED print (the guest check's time clock), drawn
// from a stored seed so they look the same on every phone and on every
// reload. Pure: no DOM, safe to import in Node.
//
// paidStampSVG returns a string built only from numbers and constants (the
// seed is read as a whole number first), so it may be set with innerHTML.

// A small seeded generator (mulberry32): rng(seed)() -> 0 <= n < 1.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PURPLE = "#6B2A8C";
const f1 = (n) => n.toFixed(1);
const f2 = (n) => n.toFixed(2);

// Where the paper did not take the ink: one side pressed lighter than the
// other, patches of the ring that ran dry, fine grain, a few bigger voids
// and fibres. `box` is the side of the square it is drawn in (100 for the
// paid stamp; the stamp book draws in 120): every position and size scales
// with it, and at 100 nothing changes. The mask is black and white, so it
// works for any ink. `id` only has to be unique on the page.
export function wear(id, r, box = 100) {
  const k = box / 100;
  const c = 50 * k;
  const turn = r() * Math.PI * 2;
  const dx = Math.cos(turn) * c;
  const dy = Math.sin(turn) * c;
  const light = Math.round(140 + r() * 60); // how pale the light side is, 0-255
  const grey = "#" + light.toString(16).padStart(2, "0").repeat(3);
  let s = '<linearGradient id="pg' + id + '" gradientUnits="userSpaceOnUse" x1="' + f1(c - dx) + '" y1="' + f1(c - dy) + '" x2="' + f1(c + dx) + '" y2="' + f1(c + dy) + '">' +
    '<stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="#fff"/><stop offset="1" stop-color="' + grey + '"/></linearGradient>';
  s += '<mask id="pm' + id + '" maskUnits="userSpaceOnUse" x="0" y="0" width="' + box + '" height="' + box + '"><rect width="' + box + '" height="' + box + '" fill="url(#pg' + id + ')"/>';
  // Two stretches of the ring took less ink: grain gathered along them.
  for (let j = 0; j < 2; j++) {
    const at = r() * Math.PI * 2;
    const span = 0.5 + r() * 0.8; // radians
    for (let i = 0; i < 34; i++) {
      const t = at + (r() - 0.5) * span;
      const rad = 40 + r() * 6;
      s += '<circle cx="' + f1(c + Math.cos(t) * rad * k) + '" cy="' + f1(c + Math.sin(t) * rad * k) + '" r="' + f2((0.4 + r() * 1.1) * k) + '" fill="#000" opacity="' + f2(0.35 + r() * 0.5) + '"/>';
    }
  }
  for (let i = 0; i < 130; i++) {
    s += '<circle cx="' + f1(r() * box) + '" cy="' + f1(r() * box) + '" r="' + f2((0.2 + r() * 0.55) * k) + '" fill="#000" opacity="' + f2(0.25 + r() * 0.45) + '"/>';
  }
  for (let i = 0; i < 24; i++) {
    s += '<circle cx="' + f1(r() * box) + '" cy="' + f1(r() * box) + '" r="' + f1((0.6 + r() * 1.7) * k) + '" fill="#000" opacity="' + f2(0.5 + r() * 0.5) + '"/>';
  }
  for (let i = 0; i < 3; i++) {
    const x = (10 + r() * 80) * k;
    const y = (10 + r() * 80) * k;
    const a = r() * Math.PI;
    const len = (4 + r() * 8) * k;
    s += '<line x1="' + f1(x) + '" y1="' + f1(y) + '" x2="' + f1(x + Math.cos(a) * len) + '" y2="' + f1(y + Math.sin(a) * len) +
      '" stroke="#000" stroke-width="' + f2((0.35 + r() * 0.3) * k) + '" opacity="' + f2(0.5 + r() * 0.4) + '"/>';
  }
  return s + "</mask>";
}

// The cashier's time-clock print that says a payment was made: PAID in a
// ruled box, and under it the day and time it was stamped (M/D HH:MM on the
// phone's own clock) when `atMs` is a time. Purple ink, the register face.
export function paidStampSVG(seed, atMs) {
  const n = Number.parseInt(seed, 10);
  const id = n >= 1 && n <= 0xffffffff ? n : 1;
  const r = rng(id);
  const defs = wear(id, r);
  const ms = typeof atMs === "number" ? atMs : NaN;
  let when = "";
  if (isFinite(ms)) {
    const d = new Date(ms);
    const two = (v) => String(v).padStart(2, "0");
    when = d.getMonth() + 1 + "/" + d.getDate() + " " + two(d.getHours()) + ":" + two(d.getMinutes());
  }
  // The box squeezes a little ink past its edge on one side.
  const sx = (r() - 0.5) * 1.6;
  const sy = (r() - 0.5) * 1.6;
  return '<svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true" focusable="false"><defs>' + defs + "</defs>" +
    '<g mask="url(#pm' + id + ')" fill="' + PURPLE + '" font-family="VT323, ui-monospace, Courier New, monospace" text-anchor="middle">' +
    '<rect x="5" y="' + (when ? 22 : 28) + '" width="90" height="' + (when ? 56 : 44) + '" rx="4" fill="none" stroke="' + PURPLE + '" stroke-width="3"/>' +
    '<rect x="' + f1(4 + sx) + '" y="' + f1((when ? 21 : 27) + sy) + '" width="92" height="' + (when ? 58 : 46) + '" rx="5" fill="none" stroke="' + PURPLE + '" stroke-width="1" opacity=".4" stroke-dasharray="' + f1(30 + r() * 60) + " " + f1(20 + r() * 40) + '"/>' +
    '<text x="50" y="' + (when ? 55 : 63) + '" font-size="' + (when ? 34 : 38) + '">PAID</text>' +
    (when ? '<text x="50" y="71" font-size="15">' + when + "</text>" : "") +
    "</g></svg>";
}

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ESC[c]);

// The served print on a used day's guest check: the cashier's time clock
// in purple ink, SERVED, the date, the place and the issuer's mark in a
// ruled box, speckled where the ink did not take. The same seed draws the
// same print on every phone. place, date and mark are escaped, so the string
// may be set with innerHTML.
export function gateStampSVG(seed, place, date, mark) {
  const n = Number.parseInt(seed, 10);
  const id = n >= 1 && n <= 0xffffffff ? n : 1;
  const r = rng(id);
  let speckle = "";
  for (let i = 0; i < 70; i++) {
    speckle += '<circle cx="' + f1(r() * 120) + '" cy="' + f1(r() * 80) + '" r="' + f1(0.4 + r() * 1.6) + '" fill="#000" opacity="' + f2(0.35 + r() * 0.55) + '"/>';
  }
  const p = String(place);
  const size = [...p].length > 18 ? 9 : [...p].length > 13 ? 10.5 : 12.5;
  return '<svg viewBox="0 0 120 80" width="100%" height="100%" aria-hidden="true" focusable="false"><defs>' +
    '<mask id="gm' + id + '" maskUnits="userSpaceOnUse" x="0" y="0" width="120" height="80"><rect width="120" height="80" fill="#fff"/>' + speckle + "</mask></defs>" +
    '<g mask="url(#gm' + id + ')" fill="' + PURPLE + '" font-family="VT323, ui-monospace, Courier New, monospace" text-anchor="middle">' +
    '<rect x="3" y="3" width="114" height="74" rx="5" fill="none" stroke="' + PURPLE + '" stroke-width="2.6"/>' +
    '<text x="60" y="30" font-size="25">SERVED</text>' +
    '<text x="60" y="49" font-size="17">' + esc(date) + '</text>' +
    '<text x="60" y="63" font-size="' + size + '">' + esc(p) + '</text>' +
    '<text x="60" y="73.5" font-size="10.5">' + esc(String(mark).toUpperCase()) + "</text></g></svg>";
}
