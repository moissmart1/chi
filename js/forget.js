/* Copyright (c) 2026 moissmart1. All rights reserved. No licence is granted: do not copy, adapt or reuse this code or design, and do not use it to train or prompt an AI system to reproduce it. See LICENSE. */
// Taking the trip off this phone (security, 2026-11-18).
//
// clearTrip(storage, { queue }): removes every key of this app (those that
//   start with STORAGE_PREFIX) from a storage (localStorage, sessionStorage,
//   or anything with length / key(i) / removeItem): the saved trip (which
//   holds the pictures too), the key, who you are, the unsent queue and
//   every small setting. queue, when given, is written back as the stored
//   queue afterwards (a refused key keeps the person's own unsent lines).
//   Never throws.
// forgetPhone({ storages, indexedDB, caches, serviceWorker, scope }):
//   clearTrip on each storage, then deletes this app's IndexedDB databases
//   and offline caches (names starting "chi-" or with STORAGE_PREFIX) and
//   unregisters this app's worker (the one whose scope is `scope`). The
//   Japan app is served from the same origin, so its storage keys, caches
//   and worker are never touched. Each step is best effort: resolves when
//   all have been tried.

import { CACHE_PREFIX, STORAGE_PREFIX } from "./config.js";

const PREFIX = STORAGE_PREFIX;
const ours = (name) => typeof name === "string" && (name.startsWith(CACHE_PREFIX) || name.startsWith(PREFIX));

function keysOf(storage) {
  const out = [];
  try {
    const n = storage.length;
    for (let i = 0; i < n; i++) {
      const k = storage.key(i);
      if (typeof k === "string") out.push(k);
    }
  } catch {
    // a storage that will not list its keys: nothing to remove
  }
  return out;
}

export function clearTrip(storage, { queue = null } = {}) {
  if (!storage) return;
  for (const k of keysOf(storage)) {
    if (!k.startsWith(PREFIX)) continue;
    try {
      storage.removeItem(k);
    } catch {
      // nothing more can be done for this one
    }
  }
  if (queue !== null) {
    try {
      storage.setItem(PREFIX + "queue", queue);
    } catch {
      // it could not be kept
    }
  }
}

export async function forgetPhone({ storages = [], indexedDB = null, caches = null, serviceWorker = null, scope = null } = {}) {
  for (const s of storages) clearTrip(s);
  const tries = [];
  try {
    if (indexedDB && typeof indexedDB.databases === "function") {
      const dbs = await indexedDB.databases();
      for (const db of dbs || []) if (db && ours(db.name)) tries.push(new Promise((done) => {
        const req = indexedDB.deleteDatabase(db.name);
        req.onsuccess = req.onerror = req.onblocked = () => done();
      }));
    }
  } catch {
    // no list of databases on this phone
  }
  try {
    if (caches && typeof caches.keys === "function") for (const name of (await caches.keys()).filter(ours)) tries.push(Promise.resolve(caches.delete(name)).catch(() => {}));
  } catch {
    // no caches here
  }
  try {
    if (serviceWorker && typeof serviceWorker.getRegistrations === "function") {
      for (const r of await serviceWorker.getRegistrations()) if (r && typeof scope === "string" && r.scope === scope) tries.push(Promise.resolve(r.unregister()).catch(() => {}));
    }
  } catch {
    // no worker here
  }
  await Promise.all(tries);
}
