// A new release loads on its own (Mo, 2026-11-17: Home Screen apps "can't
// refresh"): when the offline worker says a new version has taken over, the
// page reloads itself as soon as nothing is open; and History shows at once
// from what the phone already holds.

const assert = require("node:assert/strict");
const { SEED, NOON12, open, until, advance } = require("./helpers.cjs");

const ready = async (page, opts = {}) => {
  const backend = await open(page, { seed: SEED, nowMs: NOON12, ...opts });
  await until(() => page.evaluate(() => document.querySelectorAll("#rc .rc-row").length > 0), "the receipt draws");
  return backend;
};
// What the worker sends each open page when a new version takes over; resolves true when the page answered.
const announce = (page) => page.evaluate(() => new Promise((resolve) => {
  const ch = new MessageChannel();
  ch.port1.onmessage = () => resolve(true);
  navigator.serviceWorker.dispatchEvent(new MessageEvent("message", { data: { type: "chi-new-version" }, ports: [ch.port2] }));
  setTimeout(() => resolve(false), 500);
}));
const mark = (page) => page.evaluate(() => { window.__notReloaded = true; });
const reloaded = (page) => page.evaluate(() => window.__notReloaded !== true).catch(() => true);

module.exports = [
  {
    name: "a new version with nothing open: the page answers the worker and reloads itself",
    async run({ page }) {
      await ready(page);
      await mark(page);
      const answered = announce(page).catch(() => true);
      await until(() => reloaded(page), "the page reloads");
      await answered;
      await until(() => page.evaluate(() => document.querySelectorAll("#rc .rc-row").length > 0), "the app is back");
    },
  },
  {
    name: "a new version while a sheet is open: it waits, and reloads once the sheet is closed",
    async run({ page }) {
      const backend = await ready(page);
      await page.click("#youBtn");
      await until(() => page.evaluate(() => document.getElementById("phone").classList.contains("you-open")), "You is open");
      await mark(page);
      assert.equal(await announce(page), true, "the page answers");
      await advance(page, backend, 10000);
      assert.equal(await reloaded(page), false, "not while You is open");
      await page.click("#youDone");
      await until(() => page.evaluate(() => !document.getElementById("phone").classList.contains("you-open")), "You closes");
      // Not awaited: the reload it sets off happens inside this call, which then never answers.
      page.clock.fastForward(4000).catch(() => {});
      await until(() => reloaded(page), "then it reloads");
    },
  },
  {
    name: "History shows at once from what the phone holds, then brings itself up to date",
    async run({ page }) {
      const backend = await ready(page);
      // The app fetched History quietly after starting.
      await until(() => backend.requests.some((r) => r.action === "history"), "History is fetched in the background");
      await until(() => page.evaluate(() => globalThis.__matTest.store.state.history.entries.length > 0 && !globalThis.__matTest.store.state.history.loading), "and held");
      // The next fetch is held back: the tape must not wait for it.
      let release;
      const gate = new Promise((r) => (release = r));
      const handle = backend.handle;
      backend.handle = async (body) => {
        if (body.action === "history") await gate;
        return handle(body);
      };
      await page.click("#histBtn");
      await until(() => page.evaluate(() => document.querySelectorAll("#hist .tp-row").length > 0), "rows show while the fetch is still out");
      release();
      backend.handle = handle;
    },
  },
];
