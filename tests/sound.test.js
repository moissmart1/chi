/* Copyright (c) 2026 moissmart1. All rights reserved. No licence is granted: do not copy, adapt or reuse this code or design, and do not use it to train or prompt an AI system to reproduce it. See LICENSE. */
// The counter bell's sound (js/sound.js): off with the Stamp sound switch,
// silent and harmless without Web Audio.
import test from "node:test";
import assert from "node:assert/strict";
import { bell, setSound } from "../js/sound.js";

function fakeAudio() {
  const log = { made: 0, osc: [], gains: [] };
  class AC {
    constructor() {
      log.made++;
      this.currentTime = 5;
      this.state = "running";
      this.destination = {};
    }
    createOscillator() {
      const o = { type: "", started: null, stopped: null, hz: null, frequency: { setValueAtTime: (v) => (o.hz = v) }, connect() {}, start: (t) => (o.started = t), stop: (t) => (o.stopped = t) };
      log.osc.push(o);
      return o;
    }
    createGain() {
      const g = { ramps: [], sets: [], connect() {}, gain: { setValueAtTime: (v, t) => g.sets.push([v, t]), exponentialRampToValueAtTime: (v, t) => g.ramps.push([v, t]) } };
      log.gains.push(g);
      return g;
    }
  }
  globalThis.AudioContext = AC;
  return log;
}

test("bell: with sound off no audio is made; without AudioContext it never throws", () => {
  const mem = new Map();
  globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
  const log = fakeAudio();
  setSound(false);
  bell();
  assert.equal(log.made, 0);
  setSound(true);
  delete globalThis.AudioContext;
  delete globalThis.webkitAudioContext;
  assert.doesNotThrow(() => bell());
});

test("bell: two sine tones at 2217 and 5540 Hz, gains 0.22 and 0.08 dying away, stopped at one second", () => {
  const mem = new Map();
  globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
  const log = fakeAudio();
  setSound(true);
  bell();
  assert.deepEqual(log.osc.map((o) => [o.type, o.hz, o.started, o.stopped]), [["sine", 2217, 5, 6], ["sine", 5540, 5, 6]]);
  assert.deepEqual(log.gains.map((g) => [g.sets[0][0], g.ramps[0][0], g.ramps[0][1]]), [[0.22, 0.0001, 5.9], [0.08, 0.0001, 5.5]]);
  delete globalThis.AudioContext;
  delete globalThis.localStorage;
});
