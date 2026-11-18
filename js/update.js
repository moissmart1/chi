/* Copyright (c) 2026 moissmart1. All rights reserved. No licence is granted: do not copy, adapt or reuse this code or design, and do not use it to train or prompt an AI system to reproduce it. See LICENSE. */
// A new release loads on its own.
//
// An app on the Home Screen has no reload button, and the phone keeps its
// page alive for days, so a page could stay on an old version long after a
// new one was published. When the offline worker (sw.js) says a new version
// has taken over, the page reloads itself: at once when nothing is open,
// otherwise as soon as that is so (it looks again every few seconds).
//
// createUpdater({ isSafe, reload, storage, now, later }) -> { newVersion(), check() }
//   newVersion(): a new version is waiting; reload when safe.
//   check(): try now (call it when the app comes back on screen, or a sheet
//     closes); true when it reloaded.
//   isSafe(): nothing would be lost by reloading now. One that throws counts
//     as not safe.
//   A page never reloads twice within RELOAD_GAP_MS (the time is kept in
//   storage, which lasts across the reload).

import { STORAGE_PREFIX } from "./config.js";

export const RELOAD_GAP_MS = 60 * 1000;
export const RETRY_MS = 3000;
const KEY = STORAGE_PREFIX + "reloadedAt";

export function createUpdater({ isSafe, reload, storage, now = () => Date.now(), later = (fn, ms) => setTimeout(fn, ms) }) {
  let wanted = false;
  let armed = false;

  const justReloaded = () => {
    try {
      const t = Number(storage.getItem(KEY));
      return Number.isFinite(t) && t > 0 && now() - t >= 0 && now() - t < RELOAD_GAP_MS;
    } catch {
      return false;
    }
  };
  const safe = () => {
    try {
      return isSafe() === true;
    } catch {
      return false;
    }
  };
  const arm = () => {
    if (armed) return;
    armed = true;
    later(() => {
      armed = false;
      check();
    }, RETRY_MS);
  };

  function check() {
    if (!wanted) return false;
    if (justReloaded() || !safe()) {
      arm();
      return false;
    }
    wanted = false;
    try {
      storage.setItem(KEY, String(now()));
    } catch {
      // the reload still goes ahead
    }
    reload();
    return true;
  }

  function newVersion() {
    wanted = true;
    check();
  }

  return { newVersion, check };
}
