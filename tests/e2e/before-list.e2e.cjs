// The Before list, look K: slips hanging from the rail, soonest first, two to a
// rail; the spike under them. Every name, date and note is made up.

const assert = require("node:assert/strict");
const { until, visible, text } = require("./helpers.cjs");
const { ROWS, makeBook, openBefore, slip, spiked, railIds, spikeIds } = require("./before-fixture.cjs");

const cls = (page, sel) => page.locator(sel).first().getAttribute("class");
const noSideways = (page) => page.evaluate(() => ({ doc: document.documentElement.scrollWidth <= innerWidth, view: [...document.querySelectorAll(".view.is-active")].every((v) => v.scrollWidth <= v.clientWidth + 1) }));
// Nothing in the list is cut off to the right of its view or past the screen's edge.
const inside = (page) =>
  page.evaluate(() => {
    const view = document.querySelector("#vBefore").getBoundingClientRect();
    return [...document.querySelectorAll("#before .bf-t, #before .bf-slip, #before .bf-foot, #before .bf-bar")].every((n) => {
      const r = n.getBoundingClientRect();
      return r.left >= view.left - 1 && r.right <= view.right + 1;
    });
  });

module.exports = [
  {
    name: "the rail: soonest first, two to a rail, the undated one last; the count in words",
    async run({ page }) {
      await openBefore(page, await makeBook());
      assert.deepEqual(await railIds(page), ["1", "2", "3", "4", "5", "6"]);
      assert.equal(await page.locator("#bfOpen .bf-rail").count(), 3);
      assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll("#bfOpen .bf-row")].map((r) => r.children.length)), [2, 2, 2]);
      assert.equal(await text(page, "#bfCount"), "6 on the rail · 25 days to go");
      assert.equal(await text(page, "#bfTitle"), "Before we go");
      assert.equal(await text(page, "#bfOpen .bf-hang[data-id='6'] .bf-due"), "No date");
      assert.equal(await text(page, "#bfOpen .bf-hang[data-id='1'] .bf-n"), "Made-up rooftop table");
      assert.equal(await text(page, "#bfOpen .bf-hang[data-id='1'] .bf-top"), "#1To book");
    },
  },
  {
    name: "tone and word per status; red only within 3 days; who is on it",
    async run({ page }) {
      await openBefore(page, await makeBook());
      assert.match(await cls(page, "#bfOpen [data-id='2'] .bf-t"), /\bpink\b/);
      assert.equal(await text(page, "#bfOpen [data-id='2'] .bf-top span"), "Decide");
      assert.match(await cls(page, "#bfOpen [data-id='3'] .bf-t"), /\bwhite\b/);
      assert.equal(await text(page, "#bfOpen [data-id='3'] .bf-top span"), "Pending");
      assert.doesNotMatch(await cls(page, "#bfOpen [data-id='1'] .bf-t"), /pink|white/, "yellow is plain");
      // Due in 2 days is red; in 4 days is not.
      assert.match(await cls(page, "#bfOpen [data-id='1'] .bf-due"), /\bsoon\b/);
      assert.doesNotMatch(await cls(page, "#bfOpen [data-id='2'] .bf-due"), /\bsoon\b/);
      assert.equal(await text(page, "#bfOpen [data-id='1'] .bf-due"), "by Thu Dec 3in 2 days");
      assert.equal(await text(page, "#bfOpen [data-id='4'] .bf-who"), "Izzah’s on it");
      assert.equal(await text(page, "#bfOpen [data-id='5'] .bf-who"), "You’re on it");
      assert.equal(await page.locator("#bfOpen [data-id='1'] .bf-who").count(), 0, "nobody on it: no line");
      assert.equal(await page.locator("#bfOpen [data-id='1'] .bf-t").getAttribute("aria-label"), "1. Made-up rooftop table. To book. by Thu Dec 3 · in 2 days.");
      assert.equal(await page.locator("#bfOpen [data-id='5'] .bf-t").getAttribute("aria-label"), "5. Made-up museum timed entry. To book. by Mon Dec 14 · in 13 days. You’re on it.");
      assert.equal(await page.locator("#bfOpen [data-id='2'] .bf-t").getAttribute("aria-label"), "2. Made-up city pass? Decide. by Sat Dec 5 · in 4 days.");
    },
  },
  {
    name: "a late item is first on the rail, in red, with its days late",
    async run({ page }) {
      const rows = [...ROWS, { "#": 9, Item: "Made-up late thing", "Book by": "2026-11-29", Status: "To book" }];
      await openBefore(page, await makeBook({ rows }));
      assert.equal((await railIds(page))[0], "9");
      assert.match(await cls(page, "#bfOpen [data-id='9'] .bf-due"), /\bsoon\b/);
      assert.equal(await text(page, "#bfOpen [data-id='9'] .bf-due"), "was due Sun Nov 29" + "2 days late");
    },
  },
  {
    name: "the spike holds the two booked slips with their prints; the print says who and when",
    async run({ page }) {
      await openBefore(page, await makeBook());
      assert.equal(await text(page, "#bfSpikeH"), "On the spike · 2 booked");
      assert.deepEqual(await spikeIds(page), ["7", "8"], "ticked ones newest first, then those booked in the planner");
      assert.equal(await text(page, "#bfDone [data-id='7'] .tclock"), "BOOKED NOV 28 MO");
      assert.equal(await text(page, "#bfDone [data-id='8'] .tclock"), "BOOKED · PLANNER");
      assert.equal(await page.locator("#bfDone [data-id='7'] .bf-slip").getAttribute("aria-label"), "Made-up river cruise. Booked by Mo, Nov 28.");
      assert.equal(await page.locator("#bfDone [data-id='8'] .bf-slip").getAttribute("aria-label"), "Made-up flights. Booked in the planner.");
      // The planner has not been updated for #7 yet? It has: the fake wrote Booked, so no small line.
      assert.equal(await page.locator("#bfDone small").count(), 0);
      assert.equal(await visible(page, "#bfMore"), false);
      assert.equal(await visible(page, "#bfEmpty"), false);
    },
  },
  {
    name: "more than three booked: the newest three and 'and N more under these', which opens and folds again on coming back",
    async run({ page }) {
      const rows = [{ "#": 1, Item: "Made-up open one", Status: "To book" }, ...[2, 3, 4, 5, 6].map((n) => ({ "#": n, Item: "Made-up booked " + n, Status: "Booked" }))];
      await openBefore(page, await makeBook({ rows, ticked: false, claims: false }));
      assert.equal((await spikeIds(page)).length, 3);
      assert.equal(await text(page, "#bfMore"), "and 2 more under these");
      assert.equal(await text(page, "#bfSpikeH"), "On the spike · 5 booked");
      await page.locator("#bfMore").click();
      assert.equal((await spikeIds(page)).length, 5);
      assert.equal(await text(page, "#bfMore"), "Show fewer");
      assert.equal(await page.locator("#bfMore").getAttribute("aria-expanded"), "true");
      // Away and back: folded again.
      await page.locator('#nav button[data-tab="days"]').click();
      await page.locator("#beforeBtn").click();
      await until(async () => (await spikeIds(page)).length === 3, "the spike is folded again");
      assert.equal(await text(page, "#bfMore"), "and 2 more under these");
      await page.locator("#bfMore").click();
      await page.locator("#bfMore").click();
      assert.equal((await spikeIds(page)).length, 3, "Show fewer folds it");
    },
  },
  {
    name: "nothing left to book: a bare rail, the words, the spike",
    async run({ page }) {
      const rows = [1, 2, 3].map((n) => ({ "#": n, Item: "Made-up booked " + n, Status: "Booked" }));
      await openBefore(page, await makeBook({ rows, ticked: false, claims: false }));
      assert.equal(await text(page, "#bfEmpty"), "Nothing left to book.All 3 are on the spike.");
      assert.equal(await page.locator("#bfOpen .bf-rail").count(), 1);
      assert.equal(await page.locator("#bfOpen .bf-row").count(), 0);
      assert.equal(await text(page, "#bfCount"), "25 days to go");
    },
  },
  {
    name: "planner text is text: markup in an item name prints as it is",
    async run({ page }) {
      const name = "<img src=x onerror=window.__hit=1><b>bold</b>";
      const rows = [{ "#": 1, Item: name, Notes: "<i>note</i>", Status: "To book", "Booking link": "javascript:alert(1)" }];
      await openBefore(page, await makeBook({ rows, ticked: false, claims: false }));
      assert.equal(await text(page, "#bfOpen .bf-n"), name);
      assert.equal(await page.locator("#before img, #before b:not(.bf-top b):not(.bf-due b)").count(), 0, "nothing in the list became markup");
      assert.equal(await page.evaluate(() => window.__hit), undefined);
    },
  },
  {
    name: "a sync while a slip has focus keeps the same node and the focus",
    async run({ page }) {
      await openBefore(page, await makeBook());
      await page.locator("#bfOpen [data-id='2'] .bf-t").focus();
      await page.evaluate(() => {
        window.__node = document.querySelector("#bfOpen [data-id='2'] .bf-t");
      });
      await page.evaluate(() => globalThis.__matTest.store.syncTodos({ force: true }));
      await page.evaluate(() => globalThis.__matTest.store.refresh());
      assert.equal(await page.evaluate(() => document.querySelector("#bfOpen [data-id='2'] .bf-t") === window.__node), true, "the slip was not replaced");
      assert.equal(await page.evaluate(() => document.activeElement === window.__node), true, "and it kept focus");
    },
  },
  {
    name: "at 320x568 nothing overflows; a long name wraps and the status is cut",
    viewport: { width: 320, height: 568 },
    async run({ page }) {
      const rows = [{ "#": 1, Item: "Made-up extraordinarily-long-unbroken-name-for-a-rooftop-table-booking", Status: "Pending: waiting on the restaurant to confirm a time", "Book by": "2026-12-03" }, ...ROWS.slice(1)];
      await openBefore(page, await makeBook({ rows }));
      assert.deepEqual(await noSideways(page), { doc: true, view: true });
      assert.equal(await inside(page), true);
      const w = await page.locator("#bfOpen [data-id='2'] .bf-t").evaluate((n) => n.getBoundingClientRect().width);
      assert.ok(w > 120 && w < 160, "a slip is about 137 px wide: " + w);
    },
  },
  {
    name: "at 390x844 nothing overflows",
    async run({ page }) {
      await openBefore(page, await makeBook());
      assert.deepEqual(await noSideways(page), { doc: true, view: true });
      assert.equal(await inside(page), true);
    },
  },
  {
    name: "held sideways (844x390) nothing overflows",
    viewport: { width: 844, height: 390 },
    async run({ page }) {
      await openBefore(page, await makeBook());
      assert.deepEqual(await noSideways(page), { doc: true, view: true });
      assert.equal(await inside(page), true);
    },
  },
  {
    name: "on a computer (1440x900) Before takes the Days pane, Money stays on the right",
    viewport: { width: 1440, height: 900 },
    mobile: false,
    async run({ page }) {
      await openBefore(page, await makeBook());
      assert.deepEqual(await noSideways(page), { doc: true, view: true });
      const box = await page.evaluate(() => {
        const b = document.querySelector("#vBefore").getBoundingClientRect();
        const m = document.querySelector("#vMoney").getBoundingClientRect();
        return { beforeRight: b.right, moneyLeft: m.left, moneyShown: document.querySelector("#vMoney").classList.contains("is-active") };
      });
      assert.ok(box.beforeRight <= box.moneyLeft + 1, "the panes do not overlap");
      assert.equal(box.moneyShown, true);
      assert.equal(await inside(page), true);
    },
  },
];
