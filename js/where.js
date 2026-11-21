/* Copyright (c) 2026 moissmart1. All rights reserved. No licence is granted: do not copy, adapt or reuse this code or design, and do not use it to train or prompt an AI system to reproduce it. See LICENSE. */
// Where the phone is, for leave-by times, distances and the stamp in the
// place. Ported from the Japan app (its js/where.js, with its fixes: a request
// the phone never answers stops blocking after 15 s; back on screen after a
// refusal, the permission is looked at again).
//
// A position never leaves the phone: it is kept in this module's memory only,
// never in the store, localStorage, a request or a log line. What is kept in
// localStorage (chi.where) is the choice alone: "on", "off" or "refused"
// (nothing yet: "unset").
//
// createWhere({ storage, geolocation, permissions, now, doc, every, stopEvery, later }) ->
//   { state(), supported(), ask(), turnOff(), reset(), current(), subscribe(fn), start() }
// - state(): "unset", "on", "off" or "refused". A phone with no geolocation
//   is always "off" (supported() false).
// - ask(): only from a tap (on a screen still to be built): the phone's own prompt
//   comes with the first request. The choice is "on" at once; the phone's no
//   makes it "refused", quietly, and nothing is asked again until a person
//   taps to turn it on.
// - current(): { lat, lng, at, accuracy } when the last position is usable
//   (js/geo.js usable: at most 3 minutes old, 300 m or better), else null.
//   Nothing ever waits for it.
// - The phone is asked only while the app is on screen and the choice is on,
//   at most once every 2 minutes, with getCurrentPosition (never
//   watchPosition): coarse, a position up to 2 minutes old is fine, 8 seconds.
//   A request the phone never answers (a suspended page) is given up after
//   STUCK_MS, so it cannot block asking for the rest of the visit.
// - reset(): the trip was taken off this phone: the choice goes back to
//   "unset" in memory (nothing is written), answers still on their way are
//   ignored, and the phone is not asked until ask() is called again.
// - subscribe(fn): fn() when the choice or the position changes.
// - why(): the phone's own answer to the last refused request, { code,
//   message } (message cut to 80 characters), or null. Memory only, like a
//   position: never stored, sent or logged. Cleared by a position that comes
//   while on, and by turning it off. Only code 1 (permission denied) makes
//   the choice "refused".

import { usable } from "./geo.js";
import { STORAGE_PREFIX } from "./config.js";

const KEY = STORAGE_PREFIX + "where";
export const ASK_GAP_MS = 2 * 60 * 1000;
export const OPTIONS = { enableHighAccuracy: false, maximumAge: 120000, timeout: 8000 };
export const STUCK_MS = 15000;
const DENIED = 1;

export function createWhere({ storage, geolocation, permissions, now = () => Date.now(), doc = globalThis.document, every = (f, ms) => setInterval(f, ms), stopEvery = (h) => clearInterval(h), later = (f, ms) => setTimeout(f, ms) } = {}) {
  const geo = geolocation && typeof geolocation.getCurrentPosition === "function" ? geolocation : null;
  const fns = [];
  let pos = null; // { lat, lng, at, accuracy }: memory only
  let lastAsk = -Infinity;
  let asking = false;
  let session = 0; // ignore callbacks from a trip that was removed
  let askNo = 0; // which request `asking` is about
  let timer = null;
  let reason = null; // { code, message } of the last refusal: memory only

  const read = () => {
    try {
      const v = storage && storage.getItem(KEY);
      return v === "on" || v === "off" || v === "refused" ? v : "unset";
    } catch {
      return "unset";
    }
  };
  let choice = read();
  const write = (v) => {
    choice = v;
    try {
      if (storage) storage.setItem(KEY, v);
    } catch {
      // kept for this visit only
    }
  };
  const tell = () => {
    for (const f of fns) {
      try {
        f();
      } catch {
        // one view's fault is not another's
      }
    }
  };
  const visible = () => !doc || doc.visibilityState !== "hidden";

  function request(force = false) {
    if (!geo || choice !== "on" || asking || !visible()) return;
    if (!force && now() - lastAsk < ASK_GAP_MS) return;
    lastAsk = now();
    asking = true;
    const trip = session;
    const mine = ++askNo;
    const done = () => {
      if (askNo === mine) asking = false;
    };
    later(done, STUCK_MS);
    try {
      geo.getCurrentPosition(
        (p) => {
          done();
          const c = p && p.coords;
          if (trip !== session || !c || choice !== "on") return;
          const t = Number(p.timestamp);
          pos = { lat: Number(c.latitude), lng: Number(c.longitude), at: Number.isFinite(t) ? t : now(), accuracy: Number(c.accuracy) };
          reason = null;
          tell();
        },
        (e) => {
          done();
          if (trip === session && choice === "on" && e && e.code === DENIED) {
            pos = null;
            reason = { code: DENIED, message: typeof e.message === "string" ? e.message.slice(0, 80) : "" };
            write("refused");
            tell();
          }
        },
        OPTIONS,
      );
    } catch {
      done();
    }
  }

  // Only while the app is on screen.
  function tick() {
    if (timer) stopEvery(timer);
    timer = null;
    if (choice !== "on" || !visible()) return;
    request();
    timer = every(() => request(), ASK_GAP_MS);
  }

  // A phone that already says yes or no (Settings changed since): the choice
  // follows it without asking.
  function checkPermission() {
    if (!geo || !permissions || typeof permissions.query !== "function") return;
    try {
      const trip = session;
      Promise.resolve(permissions.query({ name: "geolocation" })).then((st) => {
        if (trip !== session) return;
        const s = st && st.state;
        if (s === "denied" && choice === "on") {
          pos = null;
          write("refused");
          tick();
          tell();
        } else if (s === "granted" && choice === "refused") {
          write("on");
          tick();
          tell();
        }
      }, () => {});
    } catch {
      // not known here
    }
  }

  // Back on screen: ask again if due, and when the phone said no, look once
  // more at what Settings says now (someone may have turned it on there).
  // Only the permission is read: a "granted" turns it on; anything else
  // leaves it refused, and the phone's own prompt never comes up by itself.
  function onShown() {
    if (choice === "refused" && visible()) checkPermission();
    tick();
  }

  function start() {
    if (doc) doc.addEventListener("visibilitychange", onShown);
    checkPermission();
    tick();
  }

  return {
    supported: () => !!geo,
    state: () => (geo ? choice : "off"),
    ask() {
      if (!geo) return;
      write("on");
      tell();
      request(true);
      tick();
    },
    reset() {
      session++;
      asking = false;
      choice = "unset";
      pos = null;
      reason = null;
      lastAsk = -Infinity;
      tick();
      tell();
    },
    turnOff() {
      write("off");
      pos = null;
      reason = null;
      tick();
      tell();
    },
    current() {
      return geo && choice === "on" && usable(pos, now()) ? { ...pos } : null;
    },
    subscribe(f) {
      fns.push(f);
    },
    why: () => (reason ? { ...reason } : null),
    start,
  };
}
