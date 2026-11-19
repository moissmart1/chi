/* Copyright (c) 2026 moissmart1. All rights reserved. No licence is granted: do not copy, adapt or reuse this code or design, and do not use it to train or prompt an AI system to reproduce it. See LICENSE. */
// The small green street sign ("blade"): printed wherever the app used the
// phone's position, and nowhere else. One place makes every sign. Nothing
// here reads a position: it is given a fromHere() answer (js/plan.js).

const NS = "http://www.w3.org/2000/svg";
const WORD = { N: "north", S: "south", E: "east", W: "west" };

function span(cls, text) {
  const s = document.createElement("span");
  s.className = cls;
  if (text !== undefined) s.textContent = text;
  return s;
}

// from: a fromHere() answer ({ blocks, dir }).
export function bladeEl(from) {
  const dir = from.dir;
  const word = WORD[dir] || "";
  if (from.blocks === 0) {
    const s = span("g-bl pl", "THIS BLOCK");
    s.setAttribute("role", "img");
    s.setAttribute("aria-label", "On this block");
    return s;
  }
  const letter = document.createElement("i");
  letter.textContent = dir;
  if (from.blocks === null) {
    const s = span("g-bl far");
    s.setAttribute("role", "img");
    s.setAttribute("aria-label", word);
    s.append(letter);
    return s;
  }
  const s = span("g-bl");
  s.setAttribute("role", "img");
  s.setAttribute("aria-label", from.blocks + (from.blocks === 1 ? " block " : " blocks ") + word);
  const n = document.createElement("b");
  n.textContent = String(from.blocks);
  s.append(n, document.createTextNode(from.blocks === 1 ? "BLOCK" : "BLOCKS"), letter);
  return s;
}

// A sign that only decorates words already beside it.
export function plainBlade(text, { off = false, cls = "" } = {}) {
  const s = span("g-bl pl" + (off ? " off" : "") + (cls ? " " + cls : ""), text);
  s.setAttribute("aria-hidden", "true");
  return s;
}

// The NEAREST sign.
export function nearestEl() {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "g-ow");
  svg.setAttribute("viewBox", "0 0 96 24");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Nearest");
  const make = (tag, attrs) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  };
  const text = make("text", { x: "38", y: "16", "text-anchor": "middle", "font-size": "10.5", "font-weight": "900", "letter-spacing": ".9", fill: "#151515" });
  text.textContent = "NEAREST";
  svg.append(make("rect", { width: "96", height: "24", rx: "3", fill: "#151515" }), make("path", { d: "M4.5 6.5h65v-4L92 12 69.5 21.5v-4h-65z", fill: "#fff" }), text);
  return svg;
}
