// The counter bell: ringing it is the tick. It rings at the tap, the slip is
// printed BOOKED, the sheet closes by itself and the slip is on the spike.
// Every name, date and note is made up.

const assert = require("node:assert/strict");
const { advance, until, text } = require("./helpers.cjs");
const { makeBook, openBefore, shot, slip, railIds, spikeIds, asApp, whoText } = require("./before-fixture.cjs");

const isOpen = (page) => page.locator("#bfHand").evaluate((n) => n.classList.contains("is-open") && !n.inert);
// The ticks this phone sent (the fixture already ticked #7, from another phone, before the page opened).
const ticks = (backend) => backend.requests.filter((r) => r.action === "tickTodo" && r.args.id !== "7");
const statusOf = (backend, row) => backend.fake.planner.tabs["Book Now"][row][3];
// chi#13: Mo renumbers his planner and Izzah's phone pulls it in, so #id is another item now.
const renumber = async (backend, row, item) => {
  backend.fake.planner.tabs["Book Now"][row][1] = item;
  backend.now += 60 * 1000; // a forced pull reads the planner again after 30 seconds
  const r = await asApp(backend, "Izzah", "syncTodos", { force: true });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(!!r.data.stored, false, "the planner was read again");
};
const tickedBy = (backend, id) => (backend.fake.tables.Todos.find((r) => String(r.id) === id) || {}).ticked_by;
// The finger goes down on the bell (and stays down), once the sheet has stopped sliding in.
const pressBell = async (page) => {
  await page.locator("#bfBell").hover();
  await page.mouse.down();
};
const CHANGED = "That number is another item in the planner now, so nothing was ticked. Check the list again.";
const focusedIs = (page, sel) => page.evaluate((s) => document.activeElement === document.querySelector(s), sel);
const ring = async (page, id) => {
  await slip(page, id).click();
  await until(() => isOpen(page), "the sheet opens for #" + id);
  await page.locator("#bfBell").click();
};
// A stand-in for Web Audio that counts what is made and played.
const spyAudio = (page) =>
  page.addInitScript(() => {
    window.__audio = { made: 0, tones: [] };
    window.AudioContext = class {
      constructor() {
        window.__audio.made++;
        this.currentTime = 1;
        this.state = "running";
        this.destination = {};
      }
      createOscillator() {
        const o = { type: "", frequency: { setValueAtTime: (v) => window.__audio.tones.push(v) }, connect() {}, start() {}, stop() {} };
        return o;
      }
      createGain() {
        return { connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } };
      }
    };
  });

module.exports = [
  {
    name: "the bell sends one tick, shows the print and Order up., closes after 1600 ms, and the slip is on the spike with the count one less",
    async run({ page }) {
      const backend = await makeBook();
      await openBefore(page, backend);
      assert.equal(await text(page, "#beforeN"), "6");
      await ring(page, "1");
      await until(() => ticks(backend).length === 1, "one tickTodo was sent");
      assert.deepEqual(ticks(backend)[0].args, { id: "1", item: "Made-up rooftop table" }, "the item as shown goes with the #");
      // The rung form.
      assert.equal(await text(page, "#bfHand .bf-print"), "BOOKEDDEC 01 14:07 MO");
      assert.equal(await text(page, "#bfSay"), "Order up.It’s on the spike.");
      assert.equal(await page.locator("#bfBell").isDisabled(), true);
      assert.match(await page.locator("#bfBell").getAttribute("class"), /\brung\b/);
      assert.equal(await page.locator("#bfHand .bf-link, #bfHand [data-act='claim']").count(), 0, "the link and the claim key are gone");
      assert.equal(await page.locator("#bfSay").getAttribute("aria-live"), "polite");
      assert.equal(await focusedIs(page, "#bfHand"), true, "focus rests on the sheet"); // a held Enter does nothing there
      // The list behind it already shows the slip on the spike, and the count.
      assert.deepEqual(await railIds(page), ["2", "3", "4", "5", "6"]);
      assert.equal((await spikeIds(page))[0], "1");
      assert.equal(await text(page, "#beforeN"), "5");
      assert.equal(await text(page, "#bfCount"), "5 on the rail · 25 days to go");
      assert.equal(await isOpen(page), true, "still open before 1600 ms");
      await shot(page, "03-rung-form");
      await advance(page, backend, 1500);
      assert.equal(await isOpen(page), true);
      await advance(page, backend, 200);
      await until(async () => !(await isOpen(page)), "the sheet closes by itself");
      assert.equal(await focusedIs(page, "#bfSpikeH"), true, "focus goes to the spike's heading");
      assert.equal(await text(page, "#bfSpikeH"), "On the spike · 3 booked");
      assert.equal(await text(page, "#bfDone [data-id='1'] .tclock"), "BOOKED DEC 01 MO");
      await shot(page, "04-list-after-ring");
      await until(() => statusOf(backend, 1) === "Booked", "the planner's Status cell reads Booked");
      assert.equal(ticks(backend).length, 1, "still one write");
    },
  },
  {
    name: "a double tap on the bell is one tick",
    async run({ page }) {
      const backend = await makeBook();
      await openBefore(page, backend);
      await slip(page, "2").click();
      await until(() => isOpen(page), "open");
      await page.locator("#bfBell").dblclick();
      await until(() => ticks(backend).length >= 1, "a tick was sent");
      await advance(page, backend, 2000);
      await until(async () => !(await isOpen(page)), "closed");
      assert.equal(ticks(backend).length, 1, "never two tickTodo calls");
      assert.equal(ticks(backend)[0].args.id, "2");
    },
  },
  {
    name: "Enter held down on the bell is one tick, and the repeats do not close the sheet or ring again",
    async run({ page }) {
      const backend = await makeBook();
      await openBefore(page, backend);
      await slip(page, "2").click();
      await until(() => isOpen(page), "open");
      await page.locator("#bfBell").focus();
      for (let i = 0; i < 6; i++) await page.keyboard.down("Enter");
      await page.keyboard.up("Enter");
      await until(() => ticks(backend).length >= 1, "a tick was sent");
      assert.equal(await isOpen(page), true, "the repeats did not close the sheet");
      assert.equal(ticks(backend).length, 1, "one tick");
      await advance(page, backend, 2000);
      await until(async () => !(await isOpen(page)), "it closes by itself");
      assert.equal(ticks(backend).length, 1);
    },
  },
  {
    name: "Undo on the bar puts the slip back on the rail in its place",
    async run({ page }) {
      const backend = await makeBook();
      await openBefore(page, backend);
      await ring(page, "2");
      await until(() => ticks(backend).length === 1, "ticked");
      await advance(page, backend, 1700);
      await until(async () => !(await isOpen(page)), "closed");
      assert.deepEqual(await railIds(page), ["1", "3", "4", "5", "6"]);
      await until(() => page.locator("#ubar").isVisible(), "the undo bar shows");
      assert.match(await text(page, "#ubarT"), /Made-up city pass\?/);
      await page.locator("#ubarU").click();
      await until(async () => (await railIds(page)).join() === "1,2,3,4,5,6", "the slip is back in its place");
      assert.equal(await text(page, "#beforeN"), "6");
      assert.equal(await text(page, "#bfSpikeH"), "On the spike · 2 booked");
      await until(() => statusOf(backend, 2) === "Decide", "the planner has its old status back");
    },
  },
  {
    name: "a tick the backend refuses puts the slip back and says why; the open sheet redraws as an open slip",
    async run({ page }) {
      const backend = await makeBook();
      await openBefore(page, backend);
      await slip(page, "1").click();
      await until(() => isOpen(page), "open");
      // The backend refuses the tick with its own sentence.
      backend.failWith = "bad_input";
      await page.locator("#bfBell").click();
      await until(() => page.locator("#ubar").isVisible(), "the store says why");
      assert.equal(await text(page, "#ubarT"), "test");
      backend.failWith = null;
      await until(async () => (await page.locator("#bfBell").isDisabled()) === false, "the bell is live again: the sheet shows an open slip");
      assert.equal(await page.locator("#bfHand .bf-print").count(), 0);
      assert.equal(await isOpen(page), true, "the sheet did not close by itself");
      await advance(page, backend, 2000);
      assert.equal(await isOpen(page), true, "no timer closes an open slip");
    },
  },
  {
    name: "the planner not updated yet is said on the spiked slip and in the sheet",
    async run({ page }) {
      const backend = await makeBook();
      backend.fake.planner.cellFails = true;
      await openBefore(page, backend);
      await ring(page, "1");
      await until(() => ticks(backend).length === 1, "ticked");
      await advance(page, backend, 1700);
      await until(async () => !(await isOpen(page)), "closed");
      await until(async () => (await text(page, "#bfDone [data-id='1'] small")) === "The planner hasn’t been updated yet.", "the small line is on the spiked slip");
      await page.locator("#bfDone [data-id='1'] .bf-slip").click();
      await until(() => isOpen(page), "the spiked slip opens");
      assert.match(await page.locator("#bfHandSlip").getAttribute("class"), /\bwhite\b/);
      assert.equal(await text(page, "#bfHand .bf-top span"), "Booked");
      assert.equal(await text(page, "#bfHand .bf-due"), "Mo · Dec 1");
      assert.match(await text(page, "#bfHand .bf-note"), /The planner hasn’t been updated yet\./);
      assert.equal(await page.locator("#bfBell").count(), 0, "no bell on a spiked slip");
    },
  },
  {
    name: "a slip rung here can be taken back from the spike; so can one from an earlier visit; the planner's own is final",
    async run({ page }) {
      const backend = await makeBook();
      await openBefore(page, backend);
      await ring(page, "1");
      await advance(page, backend, 1700);
      await until(async () => !(await isOpen(page)), "closed");
      await page.locator("#bfDone [data-id='1'] .bf-slip").click();
      await until(() => isOpen(page), "open");
      assert.equal(await text(page, "#bfHand .bf-ctl button"), "Not booked after all");
      await page.locator("#bfHand .bf-ctl button").click();
      await until(async () => !(await isOpen(page)), "closed after the take-back");
      await until(async () => (await railIds(page)).includes("1"), "back on the rail");
      assert.equal(await focusedIs(page, "#bfTitle"), true, "focus is on the title after a take-back");
      await until(() => statusOf(backend, 1) === "To book", "the planner has it back");
      // #7 was ticked before this visit: the same key (stage 2; before-untick.e2e.cjs takes it back).
      await page.locator("#bfDone [data-id='7'] .bf-slip").click();
      await until(() => isOpen(page), "open #7");
      assert.equal(await text(page, "#bfHand .bf-ctl button"), "Not booked after all");
      assert.equal(await page.locator("#bfHand [data-act='history'], #bfHand .bf-ctl p").count(), 0, "no History words or key");
      await page.locator("#bfBack").click();
      await until(async () => !(await isOpen(page)), "put back");
      // #8 is booked in the planner: nothing to undo here.
      await page.locator("#bfDone [data-id='8'] .bf-slip").click();
      await until(() => isOpen(page), "open #8");
      assert.equal(await text(page, "#bfHand .bf-due"), "Booked in the planner");
      assert.equal(await text(page, "#bfHand .bf-ctl"), "Booked in the planner. Change it there.");
      assert.equal(await page.locator("#bfHand .bf-ctl button").count(), 0);
    },
  },
  {
    name: "offline the tick is not saved: the slip is put back and the store says so",
    async run({ page }) {
      const backend = await makeBook();
      await openBefore(page, backend);
      backend.failWith = "network";
      await ring(page, "1");
      await until(async () => (await railIds(page)).includes("1"), "the slip is back on the rail");
      await until(() => page.locator("#ubar").isVisible(), "a notice");
      assert.equal(await text(page, "#beforeN"), "6");
      assert.equal(await page.locator("#bfHand .bf-print").count(), 0);
      assert.equal(await isOpen(page), true);
      assert.equal(await page.locator("#bfBell").isDisabled(), false);
    },
  },
  {
    name: "sound on: the bell makes one audio context and two tones; sound off: no audio context at all",
    async run({ page }) {
      await spyAudio(page);
      await openBefore(page, await makeBook());
      await ring(page, "1");
      await until(() => page.evaluate(() => window.__audio.tones.length === 2), "two tones");
      assert.deepEqual(await page.evaluate(() => [window.__audio.made, window.__audio.tones]), [1, [2217, 5540]]);
    },
  },
  {
    name: "sound off: no audio context is made",
    async run({ page }) {
      await spyAudio(page);
      const backend = await makeBook();
      await openBefore(page, backend, { storage: { "chi.sound": "off" } });
      await ring(page, "1");
      await until(() => ticks(backend).length === 1, "ticked");
      assert.equal(await page.evaluate(() => window.__audio.made), 0);
    },
  },
  {
    name: "reduced motion: the print has no landing and the slip does not drop",
    async run({ page }) {
      await page.emulateMedia({ reducedMotion: "reduce" });
      const backend = await makeBook();
      await openBefore(page, backend);
      await ring(page, "1");
      await page.locator("#bfHand .bf-print").waitFor();
      assert.doesNotMatch(await page.locator("#bfHand .bf-print").getAttribute("class"), /\b(hit|wet)\b/);
      await advance(page, backend, 1700);
      await until(async () => !(await isOpen(page)), "closed");
      assert.doesNotMatch((await page.locator("#bfDone [data-id='1'] .bf-slip").getAttribute("class")) || "", /is-new/);
    },
  },
  {
    name: "after a ring the print lands with the live hit animation and the slip drops onto the spike",
    async run({ page }) {
      const backend = await makeBook();
      await openBefore(page, backend);
      await ring(page, "1");
      await page.locator("#bfHand .bf-print").waitFor();
      assert.match(await page.locator("#bfHand .bf-print").getAttribute("class"), /\bhit\b/);
      await advance(page, backend, 1700);
      await until(async () => !(await isOpen(page)), "closed");
      assert.match((await page.locator("#bfDone [data-id='1'] .bf-slip").getAttribute("class")) || "", /\bis-new\b/);
    },
  },
  {
    name: "chi#13: a pull that puts another item under the open slip's # while a finger is on the bell: nothing is rung, the sheet shows the new item",
    async run({ page }) {
      const backend = await makeBook();
      await openBefore(page, backend);
      await slip(page, "1").click();
      await until(() => isOpen(page), "open");
      await pressBell(page);
      await renumber(backend, 1, "Made-up renumbered item");
      await page.evaluate(() => globalThis.__matTest.store.refresh());
      await until(async () => (await text(page, "#bfHand .bf-n")) === "Made-up renumbered item", "the sheet was redrawn with the new item");
      await page.mouse.up();
      await advance(page, backend, 300);
      await new Promise((r) => setTimeout(r, 300));
      assert.equal(ticks(backend).length, 0, "no tick sent");
      assert.equal(await page.locator("#bfHand .bf-print").count(), 0, "nothing printed");
      assert.equal(await page.locator("#bfBell").isDisabled(), false, "the bell is still live");
      assert.equal(await isOpen(page), true);
      assert.equal(tickedBy(backend, "1"), "");
      assert.equal(statusOf(backend, 1), "To book", "nothing written to the planner");
    },
  },
  {
    name: "chi#13: a redraw for the same item while a finger is on the bell still rings it",
    async run({ page }) {
      const backend = await makeBook();
      await openBefore(page, backend);
      await slip(page, "1").click();
      await until(() => isOpen(page), "open");
      await pressBell(page);
      // Izzah takes #1 while the finger is down: the sheet is drawn again, same item.
      await asApp(backend, "Izzah", "claimTodo", { id: "1", on: true });
      await page.evaluate(() => globalThis.__matTest.store.refresh());
      await until(async () => (await whoText(page, "#bfHand .bf-hand-who")) === "Izzah’s on it", "the sheet was redrawn");
      await page.mouse.up();
      await until(() => ticks(backend).length === 1, "the tap rang the bell");
      assert.deepEqual(ticks(backend)[0].args, { id: "1", item: "Made-up rooftop table" });
      await page.locator("#bfHand .bf-print").waitFor();
    },
  },
  {
    name: "chi#13: a bell rung on a sheet drawn before a pull put another item under that #: refused in a plain sentence, nothing ticked, the sheet shows the new item",
    async run({ page }) {
      const backend = await makeBook();
      await openBefore(page, backend);
      await slip(page, "1").click();
      await until(() => isOpen(page), "open");
      await renumber(backend, 1, "Made-up renumbered item");
      assert.equal(await text(page, "#bfHand .bf-n"), "Made-up rooftop table", "this phone still shows the old #1");
      await page.locator("#bfBell").click();
      await until(async () => (await text(page, "#ubarT")) === CHANGED, "the store says why, plainly");
      await until(async () => (await text(page, "#bfHand .bf-n")) === "Made-up renumbered item", "the list was fetched again");
      assert.equal(await page.locator("#bfBell").isDisabled(), false, "the bell is live again: an open slip");
      assert.equal(await page.locator("#bfHand .bf-print").count(), 0);
      assert.deepEqual(ticks(backend).map((r) => r.args), [{ id: "1", item: "Made-up rooftop table" }]);
      assert.equal(tickedBy(backend, "1"), "", "not ticked");
      assert.equal(statusOf(backend, 1), "To book", "nothing written to the planner");
      await advance(page, backend, 2000);
      assert.equal(await isOpen(page), true, "no timer closes an open slip");
    },
  },
];
