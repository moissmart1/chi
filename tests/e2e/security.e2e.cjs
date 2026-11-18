// Security release (2026-11-18): a personal link per person. A refused key
// takes the trip off the phone; Forget this phone; an old phone's queued
// line after its link was replaced; the release check's read-only key.

const assert = require("node:assert/strict");
const { SEED, WITH_PLAN, NOON28, ORIGIN, open, until, text, expectText, visible } = require("./helpers.cjs");

const chiKeys = (page) => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("chi.")).sort());
const drawsTrip = (page) => page.evaluate(() => document.body.innerText.includes("Niseko lodge") || document.body.innerText.includes("Rail passes"));
const store = (page, f) => page.evaluate(f);

async function ready(page, opts = {}) {
  const backend = await open(page, { seed: SEED, nowMs: NOON28, ...opts });
  await until(() => page.evaluate(() => document.querySelectorAll("#rc .rc-row").length > 0), "the receipt draws");
  return backend;
}

async function openYou(page) {
  await page.dispatchEvent("#youBtn", "click");
  await until(() => page.evaluate(() => document.getElementById("you").classList.contains("is-open")), "the settings sheet opens");
}

module.exports = [
  {
    name: "a refused key takes the saved trip off the phone and shows the no-key screen; a reload shows nothing of the trip",
    async run({ page }) {
      const backend = await ready(page, { own: "Izzah" });
      assert.ok((await chiKeys(page)).includes("chi.cache"));
      assert.equal(await drawsTrip(page), true);
      backend.fake.world.cancelLinkForPerson2(); // Izzah is the second person
      await store(page, () => globalThis.__matTest.store.checkRev());
      await until(() => visible(page, "#gate"), "the no-key screen shows");
      assert.equal(await text(page, "#gate p"), "That trip link didn’t work. Ask Mo for the current one. The trip was taken off this phone.");
      assert.deepEqual(await chiKeys(page), [], "the saved trip, the key and every setting are gone");
      await until(async () => !(await drawsTrip(page)), "nothing of the trip is drawn");
      assert.equal(await page.evaluate(() => document.querySelectorAll("#rc .rc-row").length), 0);

      await page.reload();
      await until(() => visible(page, "#gate"), "the no-key screen after a reload");
      assert.equal(await text(page, "#gate p"), "This phone needs the trip link. Open it from your chat again, or paste it here.");
      assert.equal(await drawsTrip(page), false);
      assert.equal(await store(page, () => globalThis.__matTest.store.state.expenses.length), 0);
      assert.deepEqual(await chiKeys(page), []);
    },
  },
  {
    name: "the shared link, once retired, is refused the same way",
    async run({ page }) {
      const backend = await ready(page);
      for (const n of ["Mo", "Izzah"]) backend.fake.personKey(n);
      backend.fake.world.retireSharedLink();
      await store(page, () => globalThis.__matTest.store.checkRev());
      await until(() => visible(page, "#gate"), "the no-key screen shows");
      assert.deepEqual(await chiKeys(page), []);
      assert.equal(await drawsTrip(page), false);
    },
  },
  {
    name: "Forget this phone: the row asks once more in itself, then takes everything off and shows the no-key screen",
    async run({ page }) {
      await ready(page, { own: "Mo" });
      await openYou(page);
      const ids = await page.evaluate(() => [...document.querySelectorAll("#you .set > *")].map((e) => e.id).filter(Boolean));
      assert.equal(ids.at(-1), "setForget", "the last row");
      assert.equal(await text(page, "#setForget > span"), "Forget this phoneTakes the trip and your link off this phone");
      assert.equal(await text(page, "#setForgetV"), "Forget");
      await page.dispatchEvent("#setForget", "click");
      assert.equal(await text(page, "#setForgetV"), "Tap again");
      assert.equal(await text(page, "#setForgetS"), "Tap again to take everything off this phone");
      assert.ok((await chiKeys(page)).includes("chi.key"), "nothing is forgotten on the first tap");
      // Left alone, the row goes back to how it was.
      await page.clock.fastForward(5100);
      assert.equal(await text(page, "#setForgetV"), "Forget");
      assert.ok((await chiKeys(page)).includes("chi.cache"));

      await page.dispatchEvent("#setForget", "click");
      await page.dispatchEvent("#setForget", "click");
      await until(() => visible(page, "#gate"), "the no-key screen shows");
      assert.equal(await text(page, "#gate p"), "This phone needs the trip link. Open it from your chat again, or paste it here.");
      assert.deepEqual(await chiKeys(page), []);
      assert.equal(await page.evaluate(() => document.getElementById("you").classList.contains("is-open")), false, "Settings closed");
      assert.equal(await drawsTrip(page), false);
      await page.reload();
      await until(() => visible(page, "#gate"), "still no trip after a reload");
      assert.equal(await drawsTrip(page), false);
    },
  },
  {
    name: "an old phone with a queued line whose link is then replaced: the line is kept, and goes out as that person once the new link is pasted",
    async run({ page }) {
      const backend = await ready(page, { own: "Izzah" });
      backend.failWith = "network";
      await store(page, () => {
        const s = globalThis.__matTest.store;
        s.addExpense({ day: "2026-12-28", title: "Queued taxi", amount: 3000, currency: "USD", paidBy: "Izzah", split: ["Mo", "Izzah"], splitMode: "equal", splitVals: [], note: "", kind: "" });
        return s.idle();
      });
      assert.equal(await store(page, () => JSON.parse(localStorage.getItem("chi.queue") || "[]").length), 1);
      backend.failWith = null;
      backend.fake.logged.length = 0;
      backend.fake.world.newLinkForPerson2();
      const fresh = /#k=([0-9a-f]{64})$/.exec(backend.fake.logged.find((l) => l.startsWith("Izzah’s link")))[1];
      await store(page, () => globalThis.__matTest.store.flush());
      await until(() => visible(page, "#gate"), "the no-key screen shows");
      assert.equal(await text(page, "#gate p"), "That trip link didn’t work. Ask Mo for the current one. The trip was taken off this phone. Your unsent line is kept: it goes out once you open your new link.");
      assert.deepEqual(await chiKeys(page), ["chi.queue"]);
      assert.equal(backend.fake.tables.Expenses.some((e) => e.title === "Queued taxi"), false);

      await page.fill("#keyPaste", "https://example.test/chi/#k=" + fresh);
      await page.dispatchEvent("#keyGo", "click");
      await until(() => backend.fake.tables.Expenses.some((e) => e.title === "Queued taxi"), "the kept line is sent");
      assert.equal(backend.fake.tables.Expenses.find((e) => e.title === "Queued taxi").added_by, "Izzah");
      await until(() => page.evaluate(() => globalThis.__matTest.store.state.personal === true && globalThis.__matTest.store.state.me === "Izzah"), "the phone is Izzah again");
      await until(async () => !(await visible(page, "#gate")), "the trip is back");
      assert.equal(await page.evaluate(() => (localStorage.getItem("chi.key") || "").length), 64);
    },
  },
  {
    name: "the release check's read-only key: the phone starts, the trip's day count shows, nothing is written",
    async run({ page }) {
      const backend = await open(page, { seed: WITH_PLAN, nowMs: NOON28, tab: "days", key: "test-check-key", me: null });
      await expectText(page, "#dayCount", /^Day 3 of 7/);
      assert.equal(await store(page, () => globalThis.__matTest.store.state.me), null);
      const writes = backend.requests.filter((r) => !["load", "rev", "history"].includes(r.action));
      assert.deepEqual(writes.map((r) => r.action), [], "the start asks for nothing the check key may not have");
    },
  },
  {
    name: "C1 (the Japan review, fixed from the start): an old Home Screen icon carrying the shared key, on a phone that holds its own link, opened again and again before and after retirement, stays on its own link",
    async run({ page }) {
      const backend = await ready(page, { own: "Izzah", hash: "#k=test-key" });
      const own = backend.ownKeys.Izzah;
      const onOwn = async (why) => {
        await until(() => page.evaluate(() => globalThis.__matTest && globalThis.__matTest.store.state.personal === true && globalThis.__matTest.store.state.me === "Izzah"), why);
        assert.equal(await page.evaluate(() => localStorage.getItem("chi.key")), own, why + ": the stored key is unchanged");
        assert.equal(await page.evaluate(() => location.hash), "", why + ": the address key is taken out");
        assert.equal(await visible(page, "#gate"), false, why);
        assert.ok((await chiKeys(page)).includes("chi.cache"), why + ": nothing wiped");
      };
      await onOwn("first open");
      for (let i = 0; i < 2; i++) {
        await page.goto("about:blank"); // a cold launch: a new page load, not a hash change
        await page.goto(ORIGIN + "/#k=test-key");
        await onOwn("opened again " + (i + 1));
      }
      backend.fake.personKey("Mo");
      backend.fake.world.retireSharedLink();
      for (let i = 0; i < 3; i++) {
        await page.goto("about:blank"); // a cold launch: a new page load, not a hash change
        await page.goto(ORIGIN + "/#k=test-key");
        await onOwn("after retirement " + (i + 1));
        await expectText(page, "#ubarT", "That link didn’t work. This phone stays on the link it already had.");
        assert.equal(await drawsTrip(page), true);
      }
    },
  },
  {
    name: "Forget this phone's second line says how many entries not sent yet will be lost",
    async run({ page }) {
      const backend = await ready(page, { own: "Mo" });
      backend.failWith = "network";
      await store(page, () => {
        const s = globalThis.__matTest.store;
        for (const title of ["One", "Two", "Three"]) s.addExpense({ day: "2026-12-28", title, amount: 1000, currency: "USD", paidBy: "Mo", split: ["Mo", "Izzah"], splitMode: "equal", splitVals: [], note: "", kind: "" });
        return s.idle();
      });
      await openYou(page);
      await page.dispatchEvent("#setForget", "click");
      assert.equal(await text(page, "#setForgetS"), "Tap again to take everything off this phone. 3 entries not sent yet will be lost.");
    },
  },
];
