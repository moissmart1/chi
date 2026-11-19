/* Copyright (c) 2026 moissmart1. All rights reserved. No licence is granted: do not copy, adapt or reuse this code or design, and do not use it to train or prompt an AI system to reproduce it. See LICENSE. */
// Starts the app: takes the trip key from the invite link, builds the api and
// the store, mounts the screens (Days, Tickets and Money) and boots.

import { API_URL, STORAGE_PREFIX, NEW_VERSION_MESSAGE } from "./config.js";
import { TRIP_TZ } from "./trip.js";
import { createApi } from "./api.js";
import { createStore } from "./store.js";
import { clearTrip, forgetPhone } from "./forget.js";
import { createClock } from "./clock.js";
import { dateIn, defaultRingDay, tripDay } from "./time.js";
import { mountDays } from "./views/days.js";
import { mountMoney } from "./views/money.js";
import { mountFirst } from "./views/first.js";
import { mountRegister } from "./views/register.js";
import { mountLine } from "./views/line.js";
import { mountHistory } from "./views/history.js";
import { mountYou } from "./views/you.js";
import { mountStayCard } from "./views/staycard.js";
import { mountAllDays } from "./views/alldays.js";
import { mountStopSheet } from "./views/stopsheet.js";
import { mountUndoBar } from "./views/ubar.js";
import { mountNet } from "./views/net.js";
import { mountStampBook } from "./views/stampbook.js";
import { createWhere } from "./where.js";
import { createUpdater } from "./update.js";
import { isWide, onWide } from "./shape.js";
import { createKeep, fetchMissing, toBase64, fetchesAll, pruneKeep } from "./tickets.js";
import { mountStub } from "./views/stub.js";
import { tixInfo, forgetThumbs } from "./views/stubs.js";
import { mountTicketTab } from "./views/tickettab.js";
import { mountBulkAdd } from "./views/bulkadd.js";

// How often a visible phone asks the backend whether anything changed.
const CHECK_MS = 20000;
const TABS = ["days", "money"];
// A demo left alone longer than this in the background is ended on return.
const DEMO_AWAY_MS = 10 * 60 * 1000;
// How often a running demo checks that the real day is still the one it started on.
const DEMO_GUARD_MS = 30000;

// localStorage, or a stand-in in memory when the browser will not give it.
function phoneStorage() {
  try {
    const s = globalThis.localStorage;
    s.getItem(STORAGE_PREFIX + "key");
    return s;
  } catch {
    const mem = new Map();
    return {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => mem.set(k, String(v)),
      removeItem: (k) => mem.delete(k),
      key: (i) => [...mem.keys()][i] ?? null,
      get length() {
        return mem.size;
      },
    };
  }
}

// The invite link carries the key as #k=<key>. Take it out of the address
// bar, so it is not left in history or a shared URL. Returns { key,
// candidate }:
// - no key stored yet (or the same one): it is kept on the phone and is
//   `key` (so it still works for this visit when the phone will not store it);
// - another key already stored (an old Home Screen icon or invite link
//   carrying the old shared key, or any link someone sends): it is NOT
//   stored. It is `candidate`, tried once by the store (boot), kept only if
//   the trip takes it, and never a reason to clear the phone.
function takeKey(storage) {
  const none = { key: null, candidate: null };
  const hash = location.hash.replace(/^#/, "");
  if (!hash) return none;
  const parts = hash.split("&");
  const found = parts.find((p) => p.startsWith("k="));
  if (found === undefined) return none;
  let key = found.slice(2);
  try {
    key = decodeURIComponent(key);
  } catch {
    // keep it as typed
  }
  const rest = parts.filter((p) => p !== found).join("&");
  history.replaceState(history.state, "", location.pathname + location.search + (rest ? "#" + rest : ""));
  if (!key) return none;
  let stored = null;
  try {
    stored = storage.getItem(STORAGE_PREFIX + "key");
  } catch {
    stored = null;
  }
  if (stored && stored !== key) return { key: null, candidate: key };
  try {
    storage.setItem(STORAGE_PREFIX + "key", key);
  } catch {
    // nowhere to keep it: it works for this visit only
  }
  return { key, candidate: null };
}

// The phone's storage, except that the stored key falls back to the key from this
// visit (its link, or a pasted one) when the phone could not keep it.
function withKey(storage, keyHere) {
  return {
    getItem(k) {
      let v = null;
      try {
        v = storage.getItem(k);
      } catch {
        v = null;
      }
      return v === null && k === STORAGE_PREFIX + "key" ? keyHere() : v;
    },
    setItem: (k, v) => storage.setItem(k, v),
    removeItem: (k) => storage.removeItem(k),
    key: (i) => storage.key(i),
    get length() {
      return storage.length;
    },
  };
}

// The screens. showTab(tab) shows one, marks its button and makes the
// others inert; with `remember` it keeps the choice (the stored tab) and the trip day
// it was made on (the stored tabDay, by the real time, never the demo clock).
// Tickets comes and goes with the trip (from its first day): it is never
// what the app opens on, and is not remembered.
function mountTabs(store, storage) {
  const views = { days: document.getElementById("vDays"), tickets: document.getElementById("vTickets"), money: document.getElementById("vMoney") };
  const nav = document.getElementById("nav");
  const read = (k) => {
    try {
      return storage.getItem(k);
    } catch {
      return null;
    }
  };
  const keptTab = TABS.includes(read(STORAGE_PREFIX + "tab")) ? read(STORAGE_PREFIX + "tab") : null;
  const keptDay = read(STORAGE_PREFIX + "tabDay");
  let tab = null;
  let settled = false; // the opening screen has been decided with the trip known
  const shownHooks = []; // called with the tab's name each time a tab is shown

  // A computer's window (WIDE) shows Money and Days side by side, Tickets
  // over the Days pane while it is the tab (as the Japan app does). `tab`
  // stays what a phone would show, so a narrower window goes back to it.
  let wide = isWide();
  let cameFrom = null; // WIDE: the tab Tickets was opened from
  const inPane = (t) => t === "tickets";
  const shows = (name, t) => (wide ? name === "money" || name === (inPane(t) ? t : "days") : name === t);

  function showTab(t, remember = true) {
    const changed = t !== tab;
    tab = t;
    for (const b of nav.querySelectorAll("button[data-tab]")) {
      const on = b.dataset.tab === t;
      b.classList.toggle("is-active", on);
      // WIDE hides the Days and Money keys (the panes are both there): only Tickets can be the current key.
      if (on && !(wide && !inPane(b.dataset.tab))) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    }
    for (const [name, view] of Object.entries(views)) {
      const on = shows(name, t);
      view.classList.toggle("is-active", on);
      view.inert = !on;
    }
    // The hooks are for arriving: a tap on the tab already showing leaves it as it is.
    if (changed) for (const f of shownHooks) f(t);
    // In WIDE there is nothing to choose between, so what is remembered is left as it was.
    // Tickets comes and goes with the trip: it is not what the app opens on.
    if (!remember || wide || inPane(t)) return;
    const trip = store.state.trip;
    try {
      storage.setItem(STORAGE_PREFIX + "tab", t);
      storage.setItem(STORAGE_PREFIX + "tabDay", dateIn(TRIP_TZ, Date.now()));
    } catch {
      // private mode: it opens on Days next time
    }
  }

  // The stored screen, except that on a new day of the trip it is the ticket;
  // with nothing stored it is the ticket.
  function opening(trip) {
    if (!keptTab) return "days";
    if (trip && trip.start) {
      const today = tripDay(trip, Date.now());
      if (today !== "pre" && today !== "post" && keptDay !== today) return "days";
    }
    return keptTab;
  }

  function settle(s) {
    if (settled || !(s.trip && s.trip.start)) return;
    settled = true;
    showTab(opening(s.trip));
  }

  showTab(opening(null), false);
  settle(store.state);
  store.subscribe(settle);
  // Crossing into or out of WIDE lays the views out again; nothing else changes.
  onWide((w) => {
    wide = w;
    if (tab) showTab(tab, false);
  });
  nav.addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-tab]");
    if (!b) return;
    settled = true;
    // WIDE: Tickets takes the Days pane and the Days key brings back the tab
    // it was opened from (Money's pane never went away).
    if (wide && inPane(b.dataset.tab) && !inPane(tab)) cameFrom = tab;
    else if (wide && b.dataset.tab === "days" && inPane(tab)) return showTab(cameFrom || "days");
    showTab(b.dataset.tab);
  });
  return { showTab, tab: () => tab, onShown: (f) => shownHooks.push(f) };
}

function start() {
  const raw = phoneStorage();
  const taken = takeKey(raw);
  let keyHere = taken.key;
  const storage = withKey(raw, () => keyHere);

  const connected = !!API_URL || typeof globalThis.MAT_FAKE_API === "function";
  let store;
  const api = createApi({
    url: API_URL,
    getKey: () => storage.getItem(STORAGE_PREFIX + "key"),
    // On its own link the backend knows who this is: no name is sent.
    getActor: () => (store && store.state.personal ? undefined : (store && store.state.me) || storage.getItem(STORAGE_PREFIX + "me")),
  });
  // Ticket pictures kept on this phone (IndexedDB "chi-tickets"): every phone
  // fetches every one after each load with signal, so it opens with none
  // (js/tickets.js), unless the Ticket pictures setting (chi.tixFetch) says
  // only when one is opened. The screens (look F, stapled to the check): the
  // stub on a stop's line (js/views/ticket.js), the ticket held up
  // (js/views/stub.js) and the Ticket part of a stop's Edit sheet.
  const keep = createKeep();
  const fetchAll = () => fetchesAll(raw);
  // A refused key takes the trip off the phone (js/store.js): the stored
  // keys, the key this visit came with, and every ticket picture.
  store = createStore({
    api,
    storage,
    clear: (queue) => {
      keyHere = null;
      clearTrip(raw, { queue });
      keep.wipe();
    },
    ticketData: async (id) => {
      const blob = await keep.get(id);
      return blob ? toBase64(blob) : null;
    },
    afterLoad: () => {
      pruneKeep(store, keep);
      if (fetchAll()) fetchMissing(store, keep, { allowed: fetchAll });
    },
  });
  // Where the phone is (js/where.js): a position is kept in memory only, never
  // sent or stored; chi.where holds the choice alone. The trip taken off this
  // phone (a refused link, Forget this phone) stops it asking and keeps no
  // choice: nothing of it is written again until a new link is in.
  let whereGone = false;
  const whereKeep = {
    getItem: (k) => raw.getItem(k),
    setItem: (k, v) => {
      if (!whereGone) raw.setItem(k, v);
    },
  };
  const where = createWhere({ storage: whereKeep, geolocation: navigator.geolocation, permissions: navigator.permissions });
  where.start();
  store.subscribe((s) => {
    if (s.status !== "nokey" || whereGone) return;
    const st = where.state();
    if (st !== "on" && st !== "refused") return;
    whereGone = true;
    where.turnOff();
  });

  // A picture just kept may unblock the next one once saving ends: look again then.
  store.subscribe(() => {
    if (!store.busy() && store.state.ticketsReady && fetchAll()) fetchMissing(store, keep, { allowed: fetchAll });
  });

  // The one clock the Days screen reads, in the trip's time zone.
  const clock = createClock({ getTz: () => TRIP_TZ });
  const tabs = mountTabs(store, raw);

  const phone = document.getElementById("phone");
  // Ring up on Days shows Money while the register is open, so each line is
  // seen printing onto the receipt, and goes back to Days when it closes.
  // Borrowed: the stored tab is left as it was.
  let borrowed = false;
  const register = mountRegister(phone, store, {
    storage: raw,
    onClose: () => {
      if (!borrowed) return;
      borrowed = false;
      tabs.showTab("days", false);
    },
  });
  // One sheet at a time: opening one closes the others.
  const history = mountHistory(phone, store);
  // The Days sheets: the hotel card, the list of every day and the stop sheet.
  const stayCard = mountStayCard(phone, store);
  const allDays = mountAllDays(phone, store, { clock, onPick: (i) => days.goDay(i) });
  const stopSheet = mountStopSheet(phone, store, { keep });
  // The stamp book, a panel like History, opened from the Days bar or today's ticket.
  const book = mountStampBook(phone, store);
  // The ticket, lifted off its stop's line and held up (js/views/stub.js).
  const stub = mountStub(phone, store, keep);
  // The trip taken off this phone: the small pictures drawn from the keep go too.
  store.subscribe((s) => {
    if (s.status === "nokey") forgetThumbs();
  });
  const closeDaySheets = () => {
    stub.close(false);
    stayCard.close(false);
    allDays.close(false);
    stopSheet.close(false);
    book.close(false);
  };
  // A tab switch closes them (they belong to Days).
  document.getElementById("nav").addEventListener("click", (ev) => {
    if (!ev.target.closest("button[data-tab]")) return;
    borrowed = false;
    closeDaySheets();
  });
  // A phone is never left pretending unseen (R34): the demo ends by itself
  // when the app comes back after more than 10 minutes away, or on another
  // real trip-zone day than the one it started on. Real time, not the demo's.
  const realToday = () => dateIn(TRIP_TZ, Date.now());
  let demoOn = null; // the real trip-zone day the demo was started on
  let hiddenAt = null;
  // The one rule: a running demo ends when it was left more than 10 minutes
  // in the background, or the real trip-zone day is no longer the one it
  // started on. Checked on return to the foreground and, while a demo runs,
  // by a slow timer (a visible phone is never left pretending unseen).
  const endStaleDemo = (away) => {
    if (clock.demoDay() && (away > DEMO_AWAY_MS || realToday() !== demoOn)) clock.stop();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
      return;
    }
    const away = hiddenAt === null ? 0 : Date.now() - hiddenAt;
    hiddenAt = null;
    endStaleDemo(away);
  });
  // The slow timer exists only while a demo runs.
  let demoGuard = null;
  clock.subscribe(() => {
    if (clock.demoDay() && !demoGuard) demoGuard = setInterval(() => endStaleDemo(0), DEMO_GUARD_MS);
    else if (!clock.demoDay() && demoGuard) {
      clearInterval(demoGuard);
      demoGuard = null;
    }
  });
  // Forget this phone while it runs (onForget), else null.
  let forgetting = null;
  const you = mountYou(phone, store, {
    demo: clock,
    getKey: () => storage.getItem(STORAGE_PREFIX + "key"),
    screen: () => (tabs.tab() === "tickets" ? "Tickets" : isWide() ? "Days and Money" : tabs.tab() === "days" ? "Days" : "Money"),
    // Try another day: Days follows the demo clock from the picked day's
    // 07:00. Nothing is stored, so a reload ends it.
    onDemo: (date) => {
      you.close(false);
      register.close();
      borrowed = false;
      closeDaySheets();
      tabs.showTab("days", false);
      demoOn = realToday();
      clock.start(date);
      // The clock's own change already jumped the rail; this is for picking
      // the day that is already running, which changes nothing it can see.
      days.goDay(Math.max(0, (store.state.days || []).findIndex((d) => d && d.date === date)));
    },
    onHistory: () => {
      you.close(false);
      history.open();
    },
    // Add tickets: its own sheet, where You stands (the Money pane on a computer).
    onBulk: () => {
      you.close(false);
      bulk.open();
    },
    // Ticket pictures: back to every one, the fetching starts at once.
    onTixMode: (mode) => {
      if (mode === "all" && store.state.ticketsReady) fetchMissing(store, keep, { allowed: fetchAll });
    },
    // Forget this phone (forgetAll, below). Kept while it runs, so a link pasted on the no-key screen meanwhile
    // (it shows as soon as the store forgets) waits for it to finish and is
    // never wiped by it.
    onForget: () => {
      if (!forgetting) forgetting = forgetAll().finally(() => {
        forgetting = null;
      });
      return forgetting;
    },
  });
  // Forget this phone: the trip, the key and every setting, the ticket
  // pictures, the offline copy and the worker, then the no-key screen.
  async function forgetAll() {
    keyHere = null;
    // The store is marked wiped first (nothing is written or sent after it),
    // then the ticket pictures: their open database would hold up its deletion.
    store.forgot();
    stub.close(false);
    await keep.wipe();
    let session = null;
    try {
      session = window.sessionStorage;
    } catch {
      session = null;
    }
    await forgetPhone({
      storages: [raw, session].filter(Boolean),
      indexedDB: globalThis.indexedDB || null,
      caches: globalThis.caches || null,
      serviceWorker: (navigator && navigator.serviceWorker) || null,
      // Only this app's worker: the Japan app shares the origin.
      scope: new URL("./", location.href).href,
    });
    you.close(false);
  }
  // Bulk add of tickets (js/views/bulkadd.js), opened from You. Whatever
  // closes You closes it too (a tab, another sheet, Forget); what it sorted, or
  // its adding, carries on behind and is there when it is opened again.
  const bulk = mountBulkAdd(phone, store, keep, {
    onOpenDay: (date) => {
      register.close();
      borrowed = false;
      closeDaySheets();
      tabs.showTab("days", false);
      days.goDay(Math.max(0, (store.state.days || []).findIndex((d) => d && d.date === date)));
    },
    onClose: (restoreFocus) => {
      const b = document.getElementById("youBtn");
      if (restoreFocus && b) b.focus({ preventScroll: true });
    },
  });
  const closeYou = you.close;
  you.close = (restoreFocus) => {
    bulk.close(false);
    closeYou(restoreFocus);
  };
  const line = mountLine(phone, store, {
    onEdit: (id) => {
      line.close(false);
      register.edit(id);
    },
  });
  const ring = (day) => {
    if (!(store.state.trip && store.state.trip.start)) return;
    line.close(false);
    history.close(false);
    you.close(false);
    closeDaySheets();
    if (tabs.tab() === "days") {
      borrowed = true;
      tabs.showTab("money", false);
    }
    register.open(day);
  };
  // Opening a Days sheet closes the register, the line sheet, History,
  // Settings and the other Days sheets.
  const closeForDays = () => {
    register.close();
    line.close(false);
    history.close(false);
    you.close(false);
    closeDaySheets();
  };
  const days = mountDays(document.getElementById("vDays"), store, {
    clock,
    storage: raw,
    where,
    onStay: (id) => {
      closeForDays();
      stayCard.open(id);
    },
    onAllDays: () => {
      closeForDays();
      allDays.open();
    },
    onStampBook: () => {
      closeForDays();
      book.open();
    },
    onAddStop: (date) => {
      closeForDays();
      stopSheet.add(date);
    },
    onStop: (id) => {
      closeForDays();
      stopSheet.edit(id);
    },
    // A stop being added or changed, or a ticket held up, is being looked at: the rail stays put.
    held: () => stopSheet.isOpen() || stub.isOpen(),
    tickets: { info: (stop, s) => (s.ticketsReady ? tixInfo(stop, s.tickets, keep.have, s.me) : null), keep, subscribe: (fn) => keep.subscribe(fn) },
    onTicket: (id, button) => {
      closeForDays();
      stub.open(id, button);
    },
  });
  // The Tickets tab (js/views/tickettab.js): its key is in the bar from the
  // trip's first day, beside Days; its count is today's tickets still to come.
  const ticketsBtn = document.getElementById("ticketsBtn");
  const ticketsN = document.getElementById("ticketsN");
  const focusAway = () => {
    const keys = [...document.querySelectorAll("#nav button")];
    const daysBtn = document.querySelector('#nav button[data-tab="days"]');
    const to = daysBtn && daysBtn.getClientRects().length ? daysBtn : keys.find((k) => k.getClientRects().length);
    if (to) to.focus({ preventScroll: true });
  };
  function layTickets({ on, todayLeft }) {
    const hadFocus = !on && document.activeElement === ticketsBtn;
    ticketsBtn.hidden = !on;
    ticketsN.hidden = !on || todayLeft < 1;
    ticketsN.textContent = todayLeft > 0 ? String(todayLeft) : "";
    ticketsBtn.setAttribute("aria-label", todayLeft > 0 ? "Tickets, " + todayLeft + " still to come today" : "Tickets");
    if (!on && tabs.tab() === "tickets") tabs.showTab("days", false);
    if (hadFocus) focusAway();
  }
  mountTicketTab(document.getElementById("vTickets"), store, {
    clock,
    keep,
    onTicket: (id, button) => {
      closeForDays();
      stub.open(id, button);
    },
    onState: layTickets,
  });
  mountMoney(document.getElementById("vMoney"), store, {
    onRing: ring,
    onLine: (id) => {
      register.close();
      history.close(false);
      you.close(false);
      closeDaySheets();
      line.open(id);
    },
    onHistory: () => {
      register.close();
      line.close(false);
      you.close(false);
      closeDaySheets();
      history.open();
    },
  });
  mountUndoBar(phone, store);
  mountNet(phone, store);
  mountFirst(phone, store, {
    connected,
    storage,
    // A key pasted on the no-key screen: keep it and start, without a reload.
    onKey: async (key) => {
      // Forget this phone still running: it would take this key off too.
      if (forgetting) await forgetting;
      keyHere = key;
      whereGone = false;
      try {
        raw.setItem(STORAGE_PREFIX + "key", key);
      } catch {
        // nowhere to keep it: it works for this visit only
      }
      // A new link after a wipe: the picture keep opens its database again, empty.
      keep.restart();
      store.boot();
    },
  });

  document.getElementById("ring").addEventListener("click", () => {
    if (store.state.trip && store.state.trip.start) ring(defaultRingDay(store.state.trip, Date.now()));
  });
  // Click-through tests reach the register and the store here; only when the
  // fake backend is in the page, never in the real app.
  if (typeof globalThis.MAT_FAKE_API === "function") globalThis.__matTest = { store, register, clock };
  document.getElementById("youBtn").addEventListener("click", () => {
    register.close();
    line.close(false);
    history.close(false);
    closeDaySheets();
    bulk.close(false);
    you.open();
  });

  // Staying in step with the other phones: ask whether anything changed
  // every 20 seconds while the app is on screen, at once when it comes back
  // on screen, and when signal returns (after sending what was waiting).
  // One check at a time: on weak signal a slow check is not joined by more.
  let checking = null;
  let inFlight = null;
  const check = () => {
    if (inFlight) return inFlight;
    const st = store.state.status;
    if (st !== "ready" && st !== "error") return Promise.resolve();
    inFlight = store.checkRev().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
  const look = () => {
    check();
  };
  const startChecking = () => {
    if (connected && !checking) checking = setInterval(look, CHECK_MS);
  };
  const stopChecking = () => {
    clearInterval(checking);
    checking = null;
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      store.markSeen();
      stopChecking();
    } else {
      look();
      startChecking();
    }
  });
  window.addEventListener("online", () => {
    if (!connected) return;
    store.flush().then(check);
  });

  if (connected) store.boot({ candidate: taken.candidate }).then(() => {
    // History is fetched quietly, so it opens at once (it then keeps itself up to date).
    if (store.state.status === "ready") store.loadHistory();
  });
  // A new release reloads the page only when nothing would be lost (js/update.js).
  // Nothing unsent or still sending, no notice waiting to be read (it would be
  // wiped), and Add tickets not reading or adding, open or closed.
  nothingUnsent = () => store.outbox().unsent === 0 && !store.busy() && !store.state.notice && !bulk.isBusy();
  if (document.visibilityState !== "hidden") startChecking();
}

// The offline shell (sw.js). Quietly does nothing where service workers are
// missing or blocked. A new worker takes over at once and tells this page,
// which reloads itself once nothing would be lost (someone may be mid-entry).
// An app on the Home Screen often comes back without loading again, so the
// worker is also asked to look for a new version whenever the app comes back
// on screen. Registered before start(), so a broken start still gets fixed.
// A new release loads on its own (js/update.js). Safe to reload: no sheet,
// register or History open, nothing being typed, nothing still to send.
let nothingUnsent = () => true;
function safeToReload() {
  const phone = document.getElementById("phone");
  if (!phone || /(^|\s)[a-z]+-open(\s|$)/.test(phone.className)) return false;
  const at = document.activeElement;
  if (at && /^(INPUT|TEXTAREA|SELECT)$/.test(at.tagName)) return false;
  return nothingUnsent();
}
let sessionStore = null;
try {
  sessionStore = window.sessionStorage;
} catch {
  sessionStore = null;
}
const updater = createUpdater({
  isSafe: safeToReload,
  reload: () => location.reload(),
  storage: { getItem: (k) => (sessionStore ? sessionStore.getItem(k) : null), setItem: (k, v) => { if (sessionStore) sessionStore.setItem(k, v); } },
});
// How often an open app asks whether a new release is out.
const UPDATE_LOOK_MS = 10 * 60 * 1000;

function registerWorker() {
  try {
    if (!("serviceWorker" in navigator)) return;
    // The worker says a new version has taken over: answer (so it leaves the
    // reloading to this page) and reload when safe.
    navigator.serviceWorker.addEventListener("message", (ev) => {
      if (!ev.data || ev.data.type !== NEW_VERSION_MESSAGE) return;
      try {
        if (ev.ports && ev.ports[0]) ev.ports[0].postMessage("ok");
      } catch {
        // the worker reloads the page itself
      }
      updater.newVersion();
    });
    document.addEventListener("visibilitychange", () => updater.check());
    let registration = null;
    Promise.resolve(navigator.serviceWorker.register("sw.js"))
      .then((r) => {
        registration = r || null;
        setInterval(() => {
          if (document.visibilityState === "hidden" || !registration || typeof registration.update !== "function") return;
          try {
            Promise.resolve(registration.update()).catch(() => {});
          } catch {
            // the next look asks again
          }
        }, UPDATE_LOOK_MS);
      })
      .catch(() => {});
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden" || !registration || typeof registration.update !== "function") return;
      try {
        Promise.resolve(registration.update()).catch(() => {});
      } catch {
        // nothing to do: the next open looks again
      }
    });
  } catch {
    // not allowed here
  }
}

registerWorker();
start();
