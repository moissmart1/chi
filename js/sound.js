/* Copyright (c) 2026 moissmart1. All rights reserved. No licence is granted: do not copy, adapt or reuse this code or design, and do not use it to train or prompt an AI system to reproduce it. See LICENSE. */
// The stamp's thud: a short low thump made with the Web Audio API (no file,
// no network). On unless the stored sound is "off". Sound is never needed, so every
// failure is swallowed. Safe to import in Node: nothing runs until called.

import { STORAGE_PREFIX } from "./config.js";

const KEY = STORAGE_PREFIX + "sound";
let ac = null; // made on the first thud, which always follows a tap

export function soundOn() {
  try {
    return globalThis.localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSound(on) {
  try {
    globalThis.localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // nowhere to keep it: the default stands
  }
}

// Called within a tap whose thud comes later (after an answer): makes and
// wakes the audio while the tap still allows it, so the later thud can play.
export function primeSound() {
  if (!soundOn()) return;
  try {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    if (!ac) ac = new AC();
    if (ac.state === "suspended") {
      const p = ac.resume();
      if (p && typeof p.catch === "function") p.catch(() => {});
    }
  } catch {
    // no sound: nothing to wake
  }
}

export function thud() {
  if (!soundOn()) return;
  try {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    if (!ac) ac = new AC();
    if (ac.state === "suspended") {
      const p = ac.resume();
      if (p && typeof p.catch === "function") p.catch(() => {});
    }
    const t = ac.currentTime;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(g);
    g.connect(ac.destination);
    o.start(t);
    o.stop(t + 0.18);
  } catch {
    // no sound: the stamp still lands
  }
}

// The counter bell (the Before list's bell): two bright sine tones that ring
// out for about a second. Same switch as the thud (Stamp sound), same rule:
// never needed, every failure is swallowed.
export function bell() {
  if (!soundOn()) return;
  try {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    if (!ac) ac = new AC();
    if (ac.state === "suspended") {
      const p = ac.resume();
      if (p && typeof p.catch === "function") p.catch(() => {});
    }
    const t = ac.currentTime;
    for (const [hz, peak, ring] of [[2217, 0.22, 0.9], [5540, 0.08, 0.5]]) {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(hz, t);
      g.gain.setValueAtTime(peak, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + ring);
      o.connect(g);
      g.connect(ac.destination);
      o.start(t);
      o.stop(t + 1);
    }
  } catch {
    // no sound: the slip still goes on the spike
  }
}
