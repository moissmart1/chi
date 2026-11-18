import test from "node:test";
import assert from "node:assert/strict";
import { createUpdater, RELOAD_GAP_MS, RETRY_MS } from "../js/update.js";

function rig({ safe = true, stored = {} } = {}) {
  const r = { safe, nowMs: 1_000_000, reloads: 0, timers: [], map: new Map(Object.entries(stored)) };
  r.updater = createUpdater({
    isSafe: () => r.safe,
    reload: () => { r.reloads++; },
    storage: { getItem: (k) => (r.map.has(k) ? r.map.get(k) : null), setItem: (k, v) => r.map.set(k, String(v)) },
    now: () => r.nowMs,
    later: (fn, ms) => { r.timers.push({ fn, ms }); },
  });
  r.runTimers = () => { const t = r.timers.splice(0); t.forEach((x) => x.fn()); };
  return r;
}

test("a new version with nothing open: the page reloads at once and notes when", () => {
  const r = rig();
  r.updater.newVersion();
  assert.equal(r.reloads, 1);
  assert.equal(r.map.get("chi.reloadedAt"), "1000000");
});

test("no new version: check() does nothing", () => {
  const r = rig();
  assert.equal(r.updater.check(), false);
  assert.equal(r.reloads, 0);
});

test("something is open: it waits, looks again every few seconds, and reloads once it is safe", () => {
  const r = rig({ safe: false });
  r.updater.newVersion();
  assert.equal(r.reloads, 0);
  assert.deepEqual(r.timers.map((t) => t.ms), [RETRY_MS], "one timer, not one per call");
  r.updater.check();
  assert.equal(r.timers.length, 1);
  r.runTimers();
  assert.equal(r.reloads, 0);
  assert.equal(r.timers.length, 1, "armed again");
  r.safe = true;
  r.runTimers();
  assert.equal(r.reloads, 1);
  r.runTimers();
  assert.equal(r.reloads, 1, "once");
});

test("reloaded less than a minute ago: it holds off, then reloads", () => {
  const r = rig({ stored: { "chi.reloadedAt": String(1_000_000 - 5000) } });
  r.updater.newVersion();
  assert.equal(r.reloads, 0);
  r.nowMs += RELOAD_GAP_MS;
  r.runTimers();
  assert.equal(r.reloads, 1);
});

test("storage that throws or holds rubbish never stops the reload", () => {
  const r = rig({ stored: { "chi.reloadedAt": "soon" } });
  r.updater.newVersion();
  assert.equal(r.reloads, 1);
  let n = 0;
  const u = createUpdater({ isSafe: () => true, reload: () => { n++; }, storage: { getItem() { throw new Error("no"); }, setItem() { throw new Error("no"); } }, now: () => 5, later: () => {} });
  u.newVersion();
  assert.equal(n, 1);
});

test("isSafe that throws counts as not safe", () => {
  let n = 0;
  const timers = [];
  const u = createUpdater({ isSafe: () => { throw new Error("x"); }, reload: () => { n++; }, storage: { getItem: () => null, setItem() {} }, now: () => 5, later: (fn) => timers.push(fn) });
  u.newVersion();
  assert.equal(n, 0);
  assert.equal(timers.length, 1);
});
