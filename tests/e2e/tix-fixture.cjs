// A made-up Chicago week with tickets on it, for the ticket screens' tests
// (tix-*.e2e.cjs). Names follow the look F mock-up's samples; every
// reference, seat and picture is invented (pictures are drawn by
// tests/e2e/pictures.cjs and scan as nothing).
//
// It is 18:40 on Mon Dec 28 (Day 3) in Chicago: the Science hall visit (10:15)
// is over, the hockey (19:30) is next.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const { SEED, makeBackend, open, until } = require("./helpers.cjs");
const { png } = require("./pictures.cjs");

const NOW = Date.parse("2026-12-28T18:40:00-06:00");
const D28 = "2026-12-28";
const KEY = "test-key";

const S = {
  breakfast: "tixstop0001", sci: "tixstop0002", ribbon: "tixstop0003", hawks: "tixstop0004", late: "tixstop0005",
  boat: "tixstop0006", sunset: "tixstop0007", hall: "tixstop0008", fly: "tixstop0009", arrive: "tixstop0010", comedy: "tixstop0011",
};

const PLAN = {
  days: {
    "2026-12-26": { city: "Chicago", title: "Arrival" },
    "2026-12-28": { city: "Chicago", title: "Hawks night" },
    "2026-12-29": { city: "Chicago", title: "River day" },
    "2026-12-30": { city: "Chicago", title: "Science Campus" },
    "2027-01-01": { city: "Chicago", title: "Home" },
  },
  stops: [
    { id: S.arrive, date: "2026-12-26", time: "08:00", title: "Flight in" },
    { id: S.breakfast, date: D28, time: "08:30", title: "Breakfast", detail: "West Loop diner" },
    { id: S.sci, date: D28, time: "10:15", title: "Science hall", detail: "Museum day" },
    { id: S.ribbon, date: D28, time: "15:30", title: "The Ribbon", detail: "Skates, Maggie Daley Park" },
    { id: S.hawks, date: D28, time: "19:30", title: "Blackhawks v. Blues", detail: "United Center", travelMin: 35, gettingThere: "Green Line from Clark/Lake to Ashland, then the 20 Madison bus west. About 25 min." },
    { id: S.late, date: D28, time: "22:15", title: "Comedy, late set", detail: "Late room" },
    { id: S.boat, date: "2026-12-29", time: "10:00", title: "Architecture river cruise" },
    { id: S.hall, date: "2026-12-30", time: "10:15", title: "Science hall annex", detail: "Admission" },
    { id: S.comedy, date: "2026-12-30", time: "20:00", title: "Comedy show" },
    { id: S.sunset, date: "2026-12-31", time: "16:30", title: "River cruise, sunset" },
    { id: S.fly, date: "2027-01-01", time: "15:40", title: "Flight home" },
  ],
  stays: [],
};
const WEEK = { ...SEED, ...PLAN };

let n = 0;
const tid = () => "tixpic" + String(++n).padStart(6, "0");
const as = (backend, action, args, actor = "Izzah") => backend.fake({ key: KEY, actor, action, args });

// The week with every kind of ticket, added from "another phone" (Izzah's).
// kinds: which to add (default all).
async function ticketed({ now = NOW, kinds = null } = {}) {
  const backend = makeBackend(WEEK, { now });
  const want = (k) => !kinds || kinds.includes(k);
  const add = async (stop, who, seat, page, seed, w = 300, h = 300) => {
    const r = await as(backend, "addTicket", { ticket: { id: tid(), stop, who, seat, page, mime: "image/png", w, h, data: png(w, h, seed) } });
    assert.equal(r.ok, true, r.message);
  };
  if (want("hawks")) {
    await as(backend, "updateStop", { id: S.hawks, patch: { tkRef: "ZX4K9Q", tkName: "MO", tkPeople: "2" } });
    await add(S.hawks, "Mo", "Sec 112 Row 8 Seat 4", 1, 11);
    await add(S.hawks, "Izzah", "Sec 112 Row 8 Seat 5", 1, 23);
  }
  if (want("sci")) {
    await add(S.sci, "Mo", "", 1, 31);
    await add(S.sci, "Izzah", "", 1, 32);
  }
  if (want("late")) await as(backend, "updateStop", { id: S.late, patch: { tkRef: "CS-5512", tkName: "MO", tkPeople: "2" } });
  if (want("boat")) {
    await as(backend, "updateStop", { id: S.boat, patch: { tkRef: "RC-2291", tkPeople: "2 adults" } });
    await add(S.boat, "", "", 1, 51);
  }
  if (want("sunset")) {
    await add(S.sunset, "", "", 1, 61, 300, 424);
    await add(S.sunset, "", "", 2, 62, 300, 424);
  }
  if (want("hall")) {
    await add(S.hall, "Mo", "", 1, 71);
    await add(S.hall, "Izzah", "", 1, 72);
  }
  if (want("fly")) {
    await add(S.fly, "Mo", "Seat 14A", 1, 81);
    await add(S.fly, "Izzah", "Seat 14B", 1, 82);
  }
  if (want("arrive")) {
    await add(S.arrive, "Mo", "", 1, 91);
    await add(S.arrive, "Izzah", "", 1, 92);
  }
  return backend;
}

// Opens the app on Days (or `tab`) and waits for the week's seven checks.
async function ready(page, opts = {}) {
  const backend = await open(page, { tab: "days", nowMs: NOW, ...opts });
  await until(() => page.evaluate(() => document.querySelectorAll("#rail .pg .tk").length === 7), "the checks draw");
  return backend;
}

const SIZES = [
  { tag: "393", viewport: { width: 393, height: 852 } },
  { tag: "320", viewport: { width: 320, height: 568 } },
  { tag: "844", viewport: { width: 844, height: 390 } },
  { tag: "1440", viewport: { width: 1440, height: 900 }, mobile: false },
];
const sized = (size) => ({ viewport: size.viewport, ...(size.mobile === false ? { mobile: false } : {}) });

// Pictures of each state, only when asked: CHI_TIX_SHOTS=<folder> (never in the repo).
const SHOTS = process.env.CHI_TIX_SHOTS || "";
async function shot(page, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: SHOTS + "/" + name + ".png" });
}

const row = (id, date = D28) => '#rail .pg[data-date="' + date + '"] .r[data-id="' + id + '"]';

// Opens a stop (a dispatched click) and waits for it to finish opening.
async function openRow(page, id, date = D28) {
  const sel = row(id, date);
  const isOpen = await page.evaluate((s) => document.querySelector(s).classList.contains("is-open"), sel);
  if (!isOpen) await page.dispatchEvent(sel + " .r-b", "click");
  await until(() => page.evaluate((s) => {
    const r = document.querySelector(s);
    const d = r.querySelector(".r-more > div");
    return r.classList.contains("is-open") && d && d.clientHeight === d.scrollHeight;
  }, sel), "the stop opens");
}

// The lift has finished (a redraw replaces the ticket and cancels the old lift: wait on the one up now).
const lifted = (page) => page.evaluate(async () => {
  for (;;) {
    try {
      return await Promise.all(document.getElementById("tix").getAnimations({ subtree: true }).filter((a) => a.animationName === "lift" || a.animationName === "flip").map((a) => a.finished));
    } catch (e) {
      if (e.name !== "AbortError") throw e;
    }
  }
});

// The ticket is up and its pictures are drawn (or their places said).
async function ticketUp(page) {
  await until(() => page.evaluate(() => {
    const t = document.getElementById("tix");
    return !!t && !t.hidden && !!t.querySelector(".f-tk");
  }), "the ticket is up");
  await until(() => page.evaluate(() => [...document.querySelectorAll("#tix .stub-code")].filter((c) => !c.closest("[hidden]")).every((c) => {
    const img = c.querySelector("img");
    return (img && img.complete && img.naturalWidth > 0) || c.querySelector(".miss");
  })), "the ticket's pictures draw");
  await lifted(page);
}

async function showTicket(page, id, date = D28) {
  await openRow(page, id, date);
  await page.dispatchEvent(row(id, date) + " .r-tk", "click");
  await ticketUp(page);
}

const noSideways = async (page) => {
  const w = await page.evaluate(() => ({
    doc: document.scrollingElement.scrollWidth <= innerWidth,
    ov: (() => { const o = document.querySelector("#tix .ov"); return !o || o.scrollWidth <= o.clientWidth; })(),
    tk: (() => { const s = document.querySelector("#tix .f-tk"); return !s || s.getBoundingClientRect().right <= innerWidth + 0.5; })(),
  }));
  assert.deepEqual(w, { doc: true, ov: true, tk: true });
};

module.exports = { NOW, D28, KEY, S, WEEK, ticketed, ready, as, SIZES, sized, shot, row, openRow, ticketUp, showTicket, lifted, noSideways };
