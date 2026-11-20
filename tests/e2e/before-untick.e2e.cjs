// "Not booked after all" from the spike (stage 2): any tick made in the app,
// on this visit or an earlier one, is taken back through the store
// (store.untickTodo): this phone's own write while it holds it, otherwise the
// item's newest tick in History. Every name, date and note is made up.

const assert = require("node:assert/strict");
const { advance, until, text } = require("./helpers.cjs");
const { makeBook, openBefore, shot, slip, spiked, railIds, spikeIds, asApp } = require("./before-fixture.cjs");

const isOpen = (page) => page.locator("#bfHand").evaluate((n) => n.classList.contains("is-open") && !n.inert);
const statusOf = (backend, row) => backend.fake.planner.tabs["Book Now"][row][3];
const focusedIs = (page, sel) => page.evaluate((s) => document.activeElement === document.querySelector(s), sel);
const tickEntry = (backend, id) => backend.fake.tables.Log.filter((r) => r.kind === "todo" && r.ref === id && r.action === "tick").at(-1);
const sentSince = (backend, from, action) => backend.requests.slice(from).filter((r) => r.action === action);

async function openSpiked(page, id) {
  await spiked(page, id).click();
  await until(() => isOpen(page), "the spiked slip #" + id + " opens");
}

module.exports = [
  {
    name: "a tick made before a reload is taken back from the spike: one undo of that tick's entry, the planner's cell put back, the slip back on the rail",
    async run({ page }) {
      const backend = await makeBook();
      await openBefore(page, backend);
      await slip(page, "1").click();
      await until(() => isOpen(page), "the sheet opens for #1");
      await page.locator("#bfBell").click();
      await advance(page, backend, 1700);
      await until(async () => !(await isOpen(page)), "closed after the ring");
      await until(() => statusOf(backend, 1) === "Booked", "the planner took the tick");
      const tick = Number(tickEntry(backend, "1").id);

      // A new visit: the phone no longer holds the tick's own write.
      await page.reload();
      await until(() => page.locator("#beforeBtn").isVisible(), "the key is back");
      await page.locator("#beforeBtn").click();
      await until(() => page.locator("#before").isVisible(), "the Before screen shows");
      assert.equal(await text(page, "#beforeN"), "5");
      const from = backend.requests.length;
      await openSpiked(page, "1");
      assert.equal(await text(page, "#bfHand .bf-ctl button"), "Not booked after all");
      assert.equal(await page.locator("#bfHand [data-act='history']").count(), 0, "no History key");
      assert.equal(/open History/.test(await text(page, "#bfHand .bf-ctl")), false, "no History words");
      await shot(page, "s2-1-older-tick-not-booked-after-all");
      await page.locator("#bfHand [data-act='untick']").click();
      await until(async () => !(await isOpen(page)), "the sheet closes at once");
      assert.equal(await focusedIs(page, "#bfTitle"), true, "focus is on the title after a take-back");
      await until(async () => (await railIds(page)).includes("1"), "back on the rail");
      assert.deepEqual(await railIds(page), ["1", "2", "3", "4", "5", "6"], "in its place");
      assert.equal(await text(page, "#beforeN"), "6");
      assert.deepEqual(sentSince(backend, from, "history").map((r) => r.args), [{ ref: "1" }]);
      assert.deepEqual(sentSince(backend, from, "undo").map((r) => r.args), [{ logId: tick }]);
      assert.equal(sentSince(backend, from, "tickTodo").length, 0);
      await until(() => statusOf(backend, 1) === "To book", "the planner's cell is put back");
      await until(() => page.locator("#ubar").isVisible(), "the undo bar shows");
    },
  },
  {
    name: "a tick from another phone gets the same key; when the planner can't be changed back the undo bar says so",
    async run({ page }) {
      const backend = await makeBook();
      await openBefore(page, backend);
      assert.equal(statusOf(backend, 7), "Booked");
      await openSpiked(page, "7");
      assert.equal(await text(page, "#bfHand .bf-due"), "Mo · Nov 28");
      assert.equal(await text(page, "#bfHand .bf-ctl button"), "Not booked after all");
      backend.fake.planner.cellFails = true; // the planner refuses the write back
      await page.locator("#bfHand [data-act='untick']").click();
      await until(async () => (await railIds(page)).includes("7"), "back on the rail");
      await until(async () => /planner couldn’t be changed back/.test((await text(page, "#ubarT")) || ""), "the undo bar says what the planner kept");
      assert.equal(await text(page, "#ubarT"), "Undone. The planner couldn’t be changed back, so it may still say Booked.");
      assert.equal(backend.fake.tables.Todos.find((r) => r.id === "7").ticked_by, "");
      // The planner's own Booked (#8) is still final here.
      await openSpiked(page, "8");
      assert.equal(await text(page, "#bfHand .bf-ctl"), "Booked in the planner. Change it there.");
      assert.equal(await page.locator("#bfHand .bf-ctl button").count(), 0);
    },
  },
  {
    name: "someone else's newer change refuses it with the backend's words: the slip stays on the spike",
    async run({ page }) {
      const backend = await makeBook();
      const tick = Number(tickEntry(backend, "7").id);
      // While this phone reads #7's History, Izzah takes Mo's tick back and ticks it herself.
      const handle = backend.handle;
      let raced = false;
      backend.handle = async (body) => {
        const env = await handle(body);
        if (body.action === "history" && body.args && body.args.ref === "7" && !raced) {
          raced = true;
          await asApp(backend, "Izzah", "undo", { logId: tick });
          await asApp(backend, "Izzah", "tickTodo", { id: "7" });
        }
        return env;
      };
      await openBefore(page, backend);
      const from = backend.requests.length;
      await openSpiked(page, "7");
      await page.locator("#bfHand [data-act='untick']").click();
      await until(async () => (await text(page, "#ubarT")) === "That’s already been undone.", "the backend's words");
      const undos = sentSince(backend, from, "undo").filter((r) => r.actor === "Mo");
      assert.deepEqual(undos.map((r) => r.args), [{ logId: tick }], "one undo, of the tick it read");
      assert.equal((await spikeIds(page)).includes("7"), true, "still on the spike");
      assert.equal((await railIds(page)).includes("7"), false);
      await openSpiked(page, "7");
      assert.equal(await text(page, "#bfHand .bf-due"), "Izzah · Dec 1", "it shows what the backend has");
      assert.equal(backend.fake.tables.Todos.find((r) => r.id === "7").ticked_by, "Izzah");
    },
  },
];
