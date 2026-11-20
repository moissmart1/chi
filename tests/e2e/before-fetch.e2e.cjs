// Fetching the Before list: the Fetch key, the stored answer, the quiet
// fetch of an old list on showing the screen, and what could not be read.
// Every name and date is made up.

const assert = require("node:assert/strict");
const { advance, until, text, visible } = require("./helpers.cjs");
const { ROWS, brow, makeBook, openBefore, shot } = require("./before-fixture.cjs");

const HOUR = 60 * 60 * 1000;
const pulls = (backend) => backend.requests.filter((r) => r.action === "syncTodos");
const toDays = async (page) => page.locator('#nav [data-tab="days"]').click();
const toBefore = async (page) => {
  await page.locator("#beforeBtn").click();
  await until(() => visible(page, "#before"), "the screen shows");
};

// Holds the backend's answer to `action` until release() is called.
function hold(backend, action) {
  let release;
  const gate = new Promise((r) => (release = r));
  const handle = backend.handle;
  backend.handle = async (body) => {
    if (body.action === action) await gate;
    return handle(body);
  };
  return { release: () => release(), restore: () => (backend.handle = handle) };
}

module.exports = [
  {
    name: "Fetch says Fetching… then Up to date ✓, then Fetch again after 4 seconds",
    async run({ page }) {
      const backend = await makeBook();
      await openBefore(page, backend);
      assert.equal(await text(page, "#bfFetch"), "Fetch");
      assert.equal(await text(page, "#bfAt"), "Read from the planner 14:07");
      await advance(page, backend, 2 * 60 * 1000);
      const h = hold(backend, "syncTodos");
      await page.locator("#bfFetch").click();
      await until(async () => (await text(page, "#bfFetch")) === "Fetching…", "it says Fetching…");
      assert.equal(await page.locator("#bfFetch").isDisabled(), true);
      assert.equal(await page.locator("#bfFetch").getAttribute("aria-live"), "polite");
      h.release();
      await until(async () => (await text(page, "#bfFetch")) === "Up to date ✓", "it says Up to date ✓");
      assert.equal(await text(page, "#bfAt"), "Read from the planner 14:09");
      await advance(page, backend, 4100);
      await until(async () => (await text(page, "#bfFetch")) === "Fetch", "back to Fetch");
    },
  },
  {
    name: "a stored answer (within 30 seconds of the last read) says when it was read",
    async run({ page }) {
      const backend = await makeBook();
      await openBefore(page, backend);
      await page.locator("#bfFetch").click();
      await until(async () => (await text(page, "#bfFetch")) === "Read 14:07", "Read 14:07");
    },
  },
  {
    name: "an hour-old list is fetched once on showing the screen, and never while it is hidden",
    async run({ page }) {
      const backend = await makeBook();
      await openBefore(page, backend);
      await toDays(page);
      const before = pulls(backend).length;
      await advance(page, backend, HOUR + 5 * 60 * 1000);
      await until(() => backend.requests.some((r) => r.action === "rev"), "the phone checks in");
      assert.equal(pulls(backend).length, before, "nothing fetched while the screen is hidden");
      await toBefore(page);
      await until(() => pulls(backend).length === before + 1, "fetched on showing the screen");
      await toDays(page);
      await toBefore(page);
      await advance(page, backend, 1000);
      assert.equal(pulls(backend).length, before + 1, "a fresh list is not fetched again");
    },
  },
  {
    name: "two quiet failures in a row give the notice",
    async run({ page }) {
      const backend = await makeBook();
      await openBefore(page, backend);
      await toDays(page);
      await advance(page, backend, HOUR + 5 * 60 * 1000);
      // Counted here: a request that fails never reaches the fake's own list.
      let asks = 0;
      const handle = backend.handle;
      backend.handle = (body) => {
        if (body.action === "syncTodos") asks++;
        return handle(body);
      };
      backend.failWith = "server";
      await toBefore(page);
      await until(() => asks >= 1, "the first quiet fetch");
      await advance(page, backend, 100);
      assert.equal(await visible(page, "#ubar"), false, "one failure says nothing");
      await toDays(page);
      await toBefore(page);
      await until(() => page.locator("#ubar").isVisible(), "the second failure says so");
      assert.equal(await text(page, "#ubarT"), "Couldn’t fetch the list from the planner.");
      assert.equal(asks, 2);
    },
  },
  {
    name: "Not read from the planner lists the row, and goes when the row is fixed",
    async run({ page }) {
      const rows = [...ROWS, { "#": 1, Item: "Made-up repeat", Status: "To book" }];
      const backend = await makeBook({ rows });
      await openBefore(page, backend);
      await until(() => visible(page, "#bfProblems"), "the list shows");
      assert.match(await text(page, "#bfProblems"), /^Not read from the planner/);
      assert.match(await text(page, "#bfProblems"), /Made-up repeat/);
      assert.match(await text(page, "#bfProblems"), /twice/);
      assert.equal(await page.locator("#bfProblems").evaluate((n) => getComputedStyle(n).borderLeftColor), "rgb(194, 54, 43)", "red-edged");
      await page.locator("#bfProblems").scrollIntoViewIfNeeded();
      await shot(page, "06-not-read-from-the-planner");
      // Fixed in the planner, then Fetch.
      backend.fake.planner.tabs["Book Now"].pop();
      await advance(page, backend, 2 * 60 * 1000);
      await page.locator("#bfFetch").click();
      await until(async () => !(await visible(page, "#bfProblems")), "the list goes");
    },
  },
];
