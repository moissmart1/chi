// Forget this phone (security, 2026-11-18): js/forget.js. The Japan app is
// served from the same origin, so only this app's storage keys, caches,
// databases and worker may go.
import test from "node:test";
import assert from "node:assert/strict";
import { clearTrip, forgetPhone } from "../js/forget.js";

function memStorage(init = {}) {
  const map = new Map(Object.entries(init));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    key: (i) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  };
}

test("clearTrip removes every chi. key, keeps the Japan app's and others, and can write back the kept queue", () => {
  const s = memStorage({ "chi.key": "k", "chi.cache": "{}", "chi.queue": "[1]", "chi.sound": "on", "mat.key": "m", "mat.cache": "{}", other: "x" });
  clearTrip(s, { queue: "[2]" });
  assert.deepEqual([...s.map.keys()].sort(), ["chi.queue", "mat.cache", "mat.key", "other"]);
  assert.equal(s.getItem("chi.queue"), "[2]");
  clearTrip(s);
  assert.deepEqual([...s.map.keys()].sort(), ["mat.cache", "mat.key", "other"]);
});

test("forgetPhone deletes only this app's caches and databases, and unregisters only its own worker", async () => {
  const deleted = [];
  const caches = { keys: async () => ["chi-shell-abc", "chi-fonts", "mat-shell-def", "mat-fonts", "other"], delete: async (n) => deleted.push(n) };
  const dbsGone = [];
  const indexedDB = {
    databases: async () => [{ name: "chi.store" }, { name: "mat.store" }, { name: "someone-else" }],
    deleteDatabase(name) {
      dbsGone.push(name);
      const req = {};
      setTimeout(() => req.onsuccess && req.onsuccess(), 0);
      return req;
    },
  };
  const unregistered = [];
  const reg = (scope) => ({ scope, unregister: async () => unregistered.push(scope) });
  const serviceWorker = { getRegistrations: async () => [reg("https://example.test/chi/"), reg("https://example.test/mat/")] };
  const local = memStorage({ "chi.key": "k", "mat.key": "m" });
  const session = memStorage({ "chi.x": "1", "mat.y": "2" });
  await forgetPhone({ storages: [local, session], indexedDB, caches, serviceWorker, scope: "https://example.test/chi/" });
  assert.deepEqual(deleted.sort(), ["chi-fonts", "chi-shell-abc"]);
  assert.deepEqual(dbsGone, ["chi.store"]);
  assert.deepEqual(unregistered, ["https://example.test/chi/"]);
  assert.deepEqual([...local.map.keys()], ["mat.key"]);
  assert.deepEqual([...session.map.keys()], ["mat.y"]);
});

test("forgetPhone without a scope unregisters no worker, and never throws when a part is missing", async () => {
  const unregistered = [];
  const serviceWorker = { getRegistrations: async () => [{ scope: "https://example.test/chi/", unregister: async () => unregistered.push(1) }] };
  await forgetPhone({ storages: [], serviceWorker });
  assert.deepEqual(unregistered, []);
  await forgetPhone({ caches: { keys: async () => { throw new Error("no"); } }, indexedDB: { databases: async () => { throw new Error("no"); } } });
});
