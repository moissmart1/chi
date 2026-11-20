// The Before key in the bar: not there with no planner list; the second of
// five keys before the trip; from the trip's first day, with Tickets, six
// keys while something is still open; never what the app opens on.
// Every name, date and note is made up.

const assert = require("node:assert/strict");
const { open, advance, until, text, visible, SEED } = require("./helpers.cjs");
const { WEEK, S, NOW: WEEK_NOW, as } = require("./tix-fixture.cjs");
const { ROWS, makeBook, openBefore, shot, slip, railIds } = require("./before-fixture.cjs");

const keys = (page) => page.evaluate(() => [...document.querySelectorAll("#nav button")].filter((b) => !b.hidden && b.getClientRects().length).map((b) => b.dataset.tab || b.id));
const isOpen = (page) => page.locator("#bfHand").evaluate((n) => n.classList.contains("is-open") && !n.inert);
// Every visible key's words sit inside the key.
const textFits = (page) =>
  page.evaluate(() => {
    const bad = [];
    for (const b of document.querySelectorAll("#nav button")) {
      if (b.hidden || !b.getClientRects().length) continue;
      const box = b.getBoundingClientRect();
      for (const n of b.childNodes) {
        if (n.nodeType === 1 && n.classList.contains("cnt")) continue;
        const r = document.createRange();
        r.selectNodeContents(n);
        const t = r.getBoundingClientRect();
        if (t.width && (t.left < box.left - 0.5 || t.right > box.right + 0.5)) bad.push((b.id || b.dataset.tab) + ": " + Math.round(t.left) + "-" + Math.round(t.right) + " in " + Math.round(box.left) + "-" + Math.round(box.right));
      }
    }
    return bad;
  });

// The week of the tickets' fixture, with the planner laid over it and a ticket on one stop.
async function tripOn(rows = ROWS) {
  const backend = await makeBook({ rows, base: WEEK, nowMs: WEEK_NOW, ticked: false, claims: false });
  await as(backend, "updateStop", { id: S.late, patch: { tkRef: "CS-5512", tkName: "MO", tkPeople: "2" } });
  return backend;
}
const openTrip = async (page, backend) => {
  await open(page, { backend, nowMs: WEEK_NOW, tab: "days" });
  await until(() => visible(page, "#beforeBtn"), "the Before key is in the bar");
  await until(() => visible(page, "#ticketsBtn"), "the Tickets key is in the bar");
};

const sixKeys = (name, size) => ({
  name: "trip started with items open: six keys, none cut off, at " + name,
  ...size,
  async run({ page }) {
    const backend = await tripOn();
    await openTrip(page, backend);
    const wide = size.mobile === false;
    assert.deepEqual(await keys(page), wide ? ["before", "tickets", "youBtn", "ring"] : ["days", "before", "tickets", "money", "youBtn", "ring"]);
    assert.deepEqual(await textFits(page), []);
    // The bar's keys are all reachable (inside the screen) and 44 px or more to the finger.
    const small = await page.evaluate(() => [...document.querySelectorAll("#nav button")].filter((b) => b.getClientRects().length).filter((b) => { const r = b.getBoundingClientRect(); return r.height < 44 || r.left < 0 || r.right > innerWidth || r.top < 0 || r.bottom > innerHeight; }).map((b) => b.id || b.dataset.tab));
    assert.deepEqual(small, []);
    await page.locator("#beforeBtn").click();
    await until(() => visible(page, "#before"), "the screen shows");
    assert.deepEqual(await textFits(page), []);
    await shot(page, "07-six-keys-" + name.split(" ")[0]);
    // Without "days to go": the trip has started.
    assert.equal(await text(page, "#bfCount"), "7 on the rail");
  },
});

module.exports = [
  {
    name: "no planner: no Before key; the bar is as it was",
    async run({ page }) {
      await open(page, { seed: SEED, tab: "days" });
      await until(() => page.evaluate(() => document.querySelectorAll("#rc, #rail").length > 0), "the app draws");
      assert.deepEqual(await keys(page), ["days", "money", "youBtn", "ring"]);
      assert.equal(await page.locator("#beforeBtn").isHidden(), true);
    },
  },
  {
    name: "before the trip five keys: Before is second, with its count; Enter on it shows the screen",
    async run({ page }) {
      await openBefore(page, await makeBook());
      assert.deepEqual(await keys(page), ["days", "before", "money", "youBtn", "ring"]);
      assert.equal(await text(page, "#beforeBtn"), "BeforeTo book6");
      assert.equal(await page.locator("#beforeBtn").getAttribute("aria-label"), "Before we go, 6 to book");
      assert.equal(await page.locator("#beforeBtn").getAttribute("aria-current"), "page");
      assert.deepEqual(await textFits(page), []);
      await page.locator('#nav [data-tab="days"]').click();
      await page.focus('#nav [data-tab="days"]');
      await page.keyboard.press("Tab");
      assert.equal(await page.evaluate(() => document.activeElement.id), "beforeBtn");
      await page.keyboard.press("Enter");
      await until(() => visible(page, "#before"), "Enter opens it");
    },
  },
  {
    name: "nothing left to book, before the trip: the key stays, with no count",
    async run({ page }) {
      const rows = [1, 2].map((n) => ({ "#": n, Item: "Made-up booked " + n, Status: "Booked" }));
      await openBefore(page, await makeBook({ rows, ticked: false, claims: false }));
      assert.equal(await page.locator("#beforeN").isHidden(), true);
      assert.equal(await page.locator("#beforeBtn").getAttribute("aria-label"), "Before we go");
      assert.equal(await visible(page, "#beforeBtn"), true);
    },
  },
  sixKeys("390x844", { viewport: { width: 390, height: 844 } }),
  sixKeys("320x568", { viewport: { width: 320, height: 568 } }),
  sixKeys("844x390 (sideways)", { viewport: { width: 844, height: 390 } }),
  sixKeys("1440x900 (two panes)", { viewport: { width: 1440, height: 900 }, mobile: false }),
  {
    name: "the last item rung after the trip started: the key goes, Days shows, focus is on a visible key",
    async run({ page }) {
      const rows = [{ "#": 1, Item: "Made-up last thing", "Book by": "2026-12-30", Status: "To book" }];
      const backend = await tripOn(rows);
      await openTrip(page, backend);
      assert.equal(await text(page, "#beforeN"), "1");
      await page.locator("#beforeBtn").click();
      await until(() => visible(page, "#before"), "the screen shows");
      await slip(page, "1").click();
      await until(() => isOpen(page), "open");
      await page.locator("#bfBell").click();
      await until(async () => !(await visible(page, "#beforeBtn")), "the key goes at once");
      assert.equal(await page.locator("#vDays").evaluate((n) => n.classList.contains("is-active")), true, "Days shows");
      await advance(page, backend, 1700);
      await until(async () => !(await isOpen(page)), "the sheet closes");
      const where = await page.evaluate(() => {
        const a = document.activeElement;
        return { tag: a && a.tagName, visible: !!a && a.getClientRects().length > 0, inNav: !!a && !!a.closest("#nav") };
      });
      assert.deepEqual(where, { tag: "BUTTON", visible: true, inNav: true });
      assert.deepEqual(await keys(page), ["days", "tickets", "money", "youBtn", "ring"]);
    },
  },
  {
    name: "the key going while it has focus puts focus on a visible key",
    async run({ page }) {
      const rows = [{ "#": 1, Item: "Made-up last thing", "Book by": "2026-12-30", Status: "To book" }];
      const backend = await tripOn(rows);
      await openTrip(page, backend);
      await page.locator("#beforeBtn").focus();
      await page.evaluate(() => globalThis.__matTest.store.tickTodo("1"));
      await until(async () => !(await visible(page, "#beforeBtn")), "the key goes");
      assert.equal(await page.evaluate(() => { const a = document.activeElement; return !!a && a.getClientRects().length > 0 && !!a.closest("#nav"); }), true);
    },
  },
  {
    name: "Before is never what the app opens on: shown, then a reload opens Days",
    async run({ page }) {
      const backend = await makeBook();
      await openBefore(page, backend);
      assert.equal(await page.evaluate(() => localStorage.getItem("chi.tab")), "days", "the stored tab was not changed");
      await page.reload();
      await until(() => visible(page, "#beforeBtn"), "the key is back");
      assert.equal(await page.locator("#vDays").evaluate((n) => n.classList.contains("is-active")), true);
      assert.equal(await page.locator("#vBefore").evaluate((n) => n.classList.contains("is-active")), false);
    },
  },
];
