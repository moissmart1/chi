/* Copyright (c) 2026 moissmart1. All rights reserved. No licence is granted: do not copy, adapt or reuse this code or design, and do not use it to train or prompt an AI system to reproduce it. See LICENSE. */
// The paid stamp (済), drawn from a stored seed so it looks the same on every
// phone and on every reload. Pure: no DOM, safe to import in Node.
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

const INK = "#D63C1E";
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

export function paidStampSVG(seed) {
  const n = Number.parseInt(seed, 10);
  const id = n >= 1 && n <= 0xffffffff ? n : 1;
  const r = rng(id);
  const defs = wear(id, r);
  // The ring squeezes a little ink past its edge on one side.
  const sx = (r() - 0.5) * 1.6;
  const sy = (r() - 0.5) * 1.6;
  const tx = 50 + (r() - 0.5) * 2.4;
  return '<svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true" focusable="false"><defs>' + defs + "</defs>" +
    '<g mask="url(#pm' + id + ')" fill="' + INK + '">' +
    '<circle cx="50" cy="50" r="43" fill="none" stroke="' + INK + '" stroke-width="5.5"/>' +
    '<circle cx="' + f1(50 + sx) + '" cy="' + f1(50 + sy) + '" r="45.4" fill="none" stroke="' + INK + '" stroke-width="1.2" opacity=".4" stroke-linecap="round" stroke-dasharray="' + f1(30 + r() * 60) + " " + f1(20 + r() * 40) + '"/>' +
    '<text x="' + f1(tx) + '" y="70" text-anchor="middle" font-family="Zen Antique, Hiragino Mincho ProN, Yu Mincho, serif" font-size="58">済</text>' +
    "</g></svg>";
}

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ESC[c]);

// The round red gate stamp on a used day's ticket: the place, the date and
// the issuer's mark between two rules, speckled where the ink did not take.
// The same seed draws the same stamp on every phone. place, date and mark are
// escaped, so the string may be set with innerHTML.
export function gateStampSVG(seed, place, date, mark) {
  const n = Number.parseInt(seed, 10);
  const id = n >= 1 && n <= 0xffffffff ? n : 1;
  const r = rng(id);
  let speckle = "";
  for (let i = 0; i < 60; i++) {
    speckle += '<circle cx="' + f1(r() * 100) + '" cy="' + f1(r() * 100) + '" r="' + f1(0.5 + r() * 2.2) + '" fill="#000" opacity="' + f2(0.45 + r() * 0.55) + '"/>';
  }
  const p = String(place);
  const size = [...p].length > 3 ? 13 : 17;
  return '<svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true" focusable="false"><defs>' +
    '<mask id="gm' + id + '" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect width="100" height="100" fill="#fff"/>' + speckle + "</mask></defs>" +
    '<g mask="url(#gm' + id + ')" fill="' + INK + '" font-family="Zen Kaku Gothic New, Hiragino Sans, sans-serif" font-weight="900" text-anchor="middle">' +
    '<circle cx="50" cy="50" r="45" fill="none" stroke="' + INK + '" stroke-width="3.5"/>' +
    '<path d="M9 36h82M9 64h82" stroke="' + INK + '" stroke-width="2.5"/>' +
    '<text x="50" y="29" font-size="' + size + '">' + esc(p) + '</text>' +
    '<text x="50" y="58" font-size="21">' + esc(date) + '</text>' +
    '<text x="50" y="82" font-size="13">' + esc(mark) + "</text></g></svg>";
}
