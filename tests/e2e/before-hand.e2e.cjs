// The slip in your hand: a sheet over the Before screen with the note, the link
// and the claim key. Every name, date and note is made up.

const assert = require("node:assert/strict");
const { until, visible, text } = require("./helpers.cjs");
const { makeBook, openBefore, shot, whoText, asApp, slip, railIds } = require("./before-fixture.cjs");

const isOpen = (page) => page.locator("#bfHand").evaluate((n) => n.classList.contains("is-open") && !n.inert);
const focusedIs = (page, sel) => page.evaluate((s) => document.activeElement === document.querySelector(s), sel);
const claimOf = (backend, id) => (backend.fake.tables.Todos.find((r) => String(r.id) === id) || {}).claimed_by;

module.exports = [
  {
    name: "a slip opens the sheet with its number, note and a link only for https",
    async run({ page }) {
      await openBefore(page, await makeBook());
      await slip(page, "1").click();
      await until(() => isOpen(page), "the sheet opens");
      assert.equal(await text(page, "#bfHandNo"), "#1");
      assert.equal(await text(page, "#bfHand .bf-n"), "Made-up rooftop table");
      assert.equal(await text(page, "#bfHand .bf-note"), "Window table if they have one. They take bookings 30 days out.");
      assert.equal(await text(page, "#bfHand .bf-due"), "by Thu Dec 3 · in 2 days");
      assert.equal(await page.locator("#bfHand .bf-link").getAttribute("href"), "https://dine.example.test/rooftop");
      assert.equal(await page.locator("#bfHand .bf-link").getAttribute("target"), "_blank");
      assert.match(await page.locator("#bfHand .bf-link").getAttribute("rel"), /noopener/);
      assert.equal(await text(page, "#bfHand .bf-pass"), "Booked?Ring the bell. It tells the planner too.");
      assert.equal(await focusedIs(page, "#bfBack"), true, "focus goes to the closing key");
      assert.equal(await page.locator("#bfHand").getAttribute("role"), "dialog");
      await shot(page, "02-slip-in-hand");
      await page.locator("#bfBack").click();
      await until(async () => !(await isOpen(page)), "the sheet closes");
      // An http:// link is not offered.
      await slip(page, "3").click();
      await until(() => isOpen(page), "the sheet opens for #3");
      assert.equal(await page.locator("#bfHand .bf-link").count(), 0, "plain http is not a link");
      assert.equal(await text(page, "#bfHand .bf-top span"), "Pending");
      assert.equal(await page.locator("#bfHand .bf-note").count(), 0, "no note, none drawn");
    },
  },
  {
    name: "I’ll do it puts the seal on the rail and says You’re on it; Hand it back takes it off",
    async run({ page }) {
      const backend = await makeBook();
      await openBefore(page, backend);
      await slip(page, "1").click();
      await until(() => isOpen(page), "the sheet opens");
      assert.equal(await text(page, '#bfHand [data-act="claim"]'), "I’ll do it");
      await page.locator('#bfHand [data-act="claim"]').click();
      await until(() => text(page, '#bfHand [data-act="claim"]').then((t) => t === "Hand it back"), "the key says Hand it back");
      assert.equal(await whoText(page, "#bfHand .bf-hand-who"), "You’re on it");
      assert.equal(await focusedIs(page, '#bfHand [data-act="claim"]'), true, "focus stays on the key");
      await until(() => claimOf(backend, "1") === "Mo", "the claim reached the backend");
      await page.locator("#bfBack").click();
      assert.equal(await whoText(page, "#bfOpen [data-id='1'] .bf-who"), "You’re on it");
      await slip(page, "1").click();
      await page.locator('#bfHand [data-act="claim"]').click();
      await until(async () => (await page.locator("#bfOpen [data-id='1'] .bf-who").count()) === 0, "the seal is off the rail");
      await until(() => claimOf(backend, "1") === "", "handed back at the backend");
    },
  },
  {
    name: "the other person's claim can be taken over",
    async run({ page }) {
      await openBefore(page, await makeBook());
      await slip(page, "4").click();
      await until(() => isOpen(page), "the sheet opens");
      assert.equal(await text(page, '#bfHand [data-act="claim"]'), "Take it over");
      assert.equal(await whoText(page, "#bfHand .bf-hand-who"), "Izzah’s on it");
    },
  },
  {
    name: "on a personal link there is no Take it over",
    async run({ page }) {
      await openBefore(page, await makeBook(), { own: "Mo" });
      await slip(page, "4").click();
      await until(() => isOpen(page), "the sheet opens");
      assert.equal(await page.locator('#bfHand [data-act="claim"]').count(), 0, "no key to take it over");
      assert.equal(await whoText(page, "#bfHand .bf-hand-who"), "Izzah’s on it");
      await page.locator("#bfBack").click();
      await slip(page, "5").click();
      assert.equal(await text(page, '#bfHand [data-act="claim"]'), "Hand it back", "your own claim can still be handed back");
    },
  },
  {
    name: "Put it back, Escape and the scrim close it, and focus returns to the slip",
    async run({ page }) {
      await openBefore(page, await makeBook());
      const back = "#bfOpen [data-id='2'] .bf-t";
      for (const how of ["key", "escape", "scrim"]) {
        await page.locator(back).focus();
        await page.locator(back).click();
        await until(() => isOpen(page), "open for " + how);
        if (how === "key") await page.locator("#bfBack").click();
        else if (how === "escape") await page.keyboard.press("Escape");
        else await page.locator("#bfHandScrim").click({ position: { x: 20, y: 20 } });
        await until(async () => !(await isOpen(page)), "closed by " + how);
        assert.equal(await focusedIs(page, back), true, "focus is back on the slip after " + how);
      }
    },
  },
  {
    name: "a redraw between finger down and finger up still opens the slip",
    async run({ page }) {
      const backend = await makeBook();
      await openBefore(page, backend);
      const box = await slip(page, "2").boundingBox();
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      // The other phone takes #2 while the finger is down: the slip is drawn again.
      await asApp(backend, "Izzah", "claimTodo", { id: "2", on: true });
      await page.evaluate(() => globalThis.__matTest.store.refresh());
      await until(async () => (await whoText(page, "#bfOpen [data-id='2'] .bf-who")) === "Izzah’s on it", "the slip was redrawn");
      await page.mouse.up();
      await until(() => isOpen(page), "the sheet opened from the tap");
      assert.equal(await text(page, "#bfHandNo"), "#2");
      assert.equal(await page.locator("#bfHand .bf-top span").textContent(), "Decide");
    },
  },
  {
    name: "the sheet opens in the Days pane on a computer, with Money still on the right",
    viewport: { width: 1440, height: 900 },
    mobile: false,
    async run({ page }) {
      await openBefore(page, await makeBook());
      await slip(page, "1").click();
      await until(() => isOpen(page), "the sheet opens");
      const r = await page.evaluate(() => {
        const s = document.getElementById("bfHand").getBoundingClientRect();
        const m = document.getElementById("vMoney").getBoundingClientRect();
        return { sheetRight: s.right, moneyLeft: m.left, sheetLeft: s.left, phoneLeft: document.getElementById("phone").getBoundingClientRect().left };
      });
      assert.ok(r.sheetRight <= r.moneyLeft + 1, "the sheet stays in its pane");
      assert.ok(Math.abs(r.sheetLeft - r.phoneLeft) < 2, "and starts at the block's left edge");
      assert.equal(await visible(page, "#bfBell"), true);
    },
  },
];
