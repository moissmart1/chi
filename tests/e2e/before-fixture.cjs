// Not a test: the made-up planner the Before screens' click-through tests
// share. A linked planner whose Book Now tab has 8 rows (one due in 2 days,
// one Decide, one Pending, one claimed by Izzah, one by Mo, one with no date,
// one ticked by Mo on Nov 28, one Booked in the planner), the app opened
// on Dec 1 at 14:07 Chicago time, before the trip. Every value is made up.

const { SEED, makeBackend } = require("./helpers.cjs");

const PLANNER_ID = "fakePlannerSheet_0123456789abcdefXYZ";
const NOW = Date.parse("2026-12-01T14:07:00-06:00");
const NOV28 = Date.parse("2026-11-28T11:30:00-06:00");
const BHEAD = ["#", "Item", "Book by", "Status", "Notes", "Booking link"];
const CHEAD = ["#", "Date / time", "Agent / session", "Tab", "Cell(s)", "Item", "Old value", "New value", "Why", "Proof / source", "Verified?"];
const brow = (o) => BHEAD.map((h) => (o[h] === undefined ? "" : o[h]));

const ROWS = [
  { "#": 1, Item: "Made-up rooftop table", "Book by": "2026-12-03", Status: "To book", Notes: "Window table if they have one. They take bookings 30 days out.", "Booking link": "https://dine.example.test/rooftop" },
  { "#": 2, Item: "Made-up city pass?", "Book by": "2026-12-05", Status: "Decide" },
  { "#": 3, Item: "Made-up river tour", "Book by": "2026-12-10", Status: "Pending", "Booking link": "http://insecure.example.test/tour" },
  { "#": 4, Item: "Made-up deep dish table", "Book by": "2026-12-12", Status: "To book" },
  { "#": 5, Item: "Made-up museum timed entry", "Book by": "2026-12-14", Status: "To book" },
  { "#": 6, Item: "Made-up warm boots", Status: "To book" },
  { "#": 7, Item: "Made-up river cruise", "Book by": "2026-12-04", Status: "To book" },
  { "#": 8, Item: "Made-up flights", "Book by": "2026-11-20", Status: "Booked" },
];

// The seed: SEED with the planner linked and its Book Now and Change Log tabs.
function bookSeed(rows = ROWS, base = SEED) {
  return { ...JSON.parse(JSON.stringify(base)), plannerId: PLANNER_ID, plannerTabs: { "Book Now": [BHEAD, ...rows.map(brow)], "Change Log": [CHEAD] } };
}

const asApp = (backend, actor, action, args) => backend.handle({ key: "test-key", actor, via: "app", action, args });

// A backend with the list already pulled, Mo's tick of #7 made on Nov 28, #4 claimed
// by Izzah and #5 by Mo. `claims` false leaves the claims out.
// base: a seed other than SEED to lay the planner over.
async function makeBook({ rows = ROWS, ticked = true, claims = true, nowMs = NOW, base = SEED } = {}) {
  const backend = makeBackend(bookSeed(rows, base), { now: NOV28 });
  await asApp(backend, "Mo", "syncTodos", { force: true });
  if (ticked) await asApp(backend, "Mo", "tickTodo", { id: "7" });
  if (claims) {
    await asApp(backend, "Izzah", "claimTodo", { id: "4", on: true });
    await asApp(backend, "Mo", "claimTodo", { id: "5", on: true });
  }
  backend.now = nowMs;
  await asApp(backend, "Mo", "syncTodos", { force: true });
  return backend;
}

// What a "who is on it" line says, without the seal's letters.
const whoText = (page, sel) => page.evaluate((s) => { const n = document.querySelector(s); return n ? n.lastChild.textContent : null; }, sel);
const slip = (page, id) => page.locator('#bfOpen .bf-hang[data-id="' + id + '"] .bf-t');
const spiked = (page, id) => page.locator('#bfDone [data-id="' + id + '"] .bf-slip');
// The ids on the rail, left to right and down.
const railIds = (page) => page.evaluate(() => [...document.querySelectorAll("#bfOpen .bf-hang")].map((n) => n.dataset.id));
const spikeIds = (page) => page.evaluate(() => [...document.querySelectorAll("#bfDone > div")].map((n) => n.dataset.id));

// Pictures of each state, only when asked: CHI_BEFORE_SHOTS=<folder> (never in the repo).
const fs = require("node:fs");
const SHOTS = process.env.CHI_BEFORE_SHOTS || "";
async function shot(page, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  // The page's clock is paused: let a sheet and the views' fade finish (the wait is Node's own).
  await new Promise((r) => setTimeout(r, 700));
  await page.screenshot({ path: SHOTS + "/" + name + ".png" });
}

// Opens the app on `page` against a book backend and shows the Before screen.
async function openBefore(page, backend, opts = {}) {
  const { open, until, visible } = require("./helpers.cjs");
  await open(page, { backend, nowMs: NOW, tab: "days", ...opts });
  await until(() => visible(page, "#beforeBtn"), "the Before key is in the bar");
  await page.locator("#beforeBtn").click();
  await until(() => visible(page, "#before"), "the Before screen shows");
}

module.exports = { whoText, shot, openBefore, PLANNER_ID, NOW, NOV28, ROWS, BHEAD, brow, bookSeed, makeBook, asApp, slip, spiked, railIds, spikeIds };
