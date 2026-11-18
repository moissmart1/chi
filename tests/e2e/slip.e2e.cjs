// The slip's other half (Task 10): Simplify (each person's own, asked once
// when turned off), show the working, the routing sentence, a payment made
// under one reading settling the other, and Remind.

const assert = require("node:assert/strict");
const P = require("../../backend/Pure.js");
const { NOON28, SEED: TWO, open, until, text, expectText, visible } = require("./helpers.cjs");

// Task 2's chain, among three people (Simplify only shows with three or
// more): Mo owes Izzah $10, Izzah owes Sam $10.
const line = (o) => ({ day: "2026-12-27", currency: "CAD", rate: 0.72, splitMode: "equal", splitVals: [], note: "", kind: "", deleted: false, ...o });
const CHAIN = [
  line({ id: "chainexp001", title: "Izakaya", amount: 20, paidBy: "Izzah", split: ["Mo", "Izzah"] }),
  line({ id: "chainexp002", title: "Karaoke", amount: 20, paidBy: "Sam", split: ["Izzah", "Sam"] }),
];
const SEED = { expenses: CHAIN, payments: [], addPeople: [{ name: "Sam", initials: "SA" }] };
const ASK = "Pay each person directly? You’ll make more payments. The totals are the same.";
const ROUTE = "You pay Sam because you owe Izzah and Izzah owes Sam. Fewer payments, same totals.";

const openRows = (page) =>
  page.$$eval("#slip .s-row.is-open", (rows) => rows.map((r) => r.querySelector(".s-who").textContent + " " + r.querySelector(".s-amt").textContent));
const waitRows = (page, want) =>
  until(async () => JSON.stringify(await openRows(page)) === JSON.stringify(want), "slip rows " + JSON.stringify(want)).catch(async (e) => {
    throw new Error(e.message + ", got " + JSON.stringify(await openRows(page)));
  });
const person = (backend, name) => backend.fake.primitives.readTable_("People").map(P.personFromRow).find((p) => p.name === name);
const setPersonCalls = (backend) => backend.requests.filter((r) => r.action === "setPerson");
const idle = (page) => page.evaluate(() => globalThis.__matTest.store.idle());
const isOn = async (page) => (await page.getAttribute("#simp", "aria-checked")) === "true";
const row = (key) => '#slip .s-row[data-key="' + key + '"]';

async function ready(page, opts = {}) {
  const backend = await open(page, { seed: SEED, nowMs: NOON28, ...opts });
  await until(() => page.evaluate(() => document.querySelectorAll("#slip .s-row").length > 0), "the slip draws");
  return backend;
}

// Records navigator.share calls; `how`: "ok", "reject" (the sheet was closed) or "none" (no share).
async function stubShare(page, how) {
  await page.addInitScript((h) => {
    globalThis.__shared = [];
    const share = h === "none" ? undefined : async (data) => {
      globalThis.__shared.push(data);
      if (h === "reject") throw new DOMException("Share canceled", "AbortError");
    };
    Object.defineProperty(Navigator.prototype, "share", { value: share, configurable: true, writable: true });
  }, how);
}

module.exports = [
  {
    name: "with two people the slip has at most one debt, and no Simplify switch or question",
    async run({ page }) {
      const { owedList } = await import("../../js/money.js");
      const { dollars } = await import("../../js/format.js");
      const names = ["Mo", "Izzah"];
      const live = TWO.expenses.filter((e) => !e.deleted);
      for (const simplify of [true, false]) assert.equal(owedList(names, live, [], simplify).length, 1);
      const [t] = owedList(names, live, [], true);
      await ready(page, { seed: TWO });
      await waitRows(page, [t.from + " → you " + dollars(t.cents)]);
      assert.equal(await page.locator("#simp").count(), 0, "no switch");
      assert.equal(await page.locator("#simpAsk").count(), 0, "no question");
      assert.equal((await text(page, "#slip")).includes("Simplify"), false);
    },
  },
  {
    name: "with two people and Simplify off in the Sheet, the slip is the same one row",
    async run({ page }) {
      await ready(page, { seed: { ...TWO, people: { Mo: { simplify: false }, Izzah: { simplify: false } } } });
      const rows = await openRows(page);
      assert.equal(rows.length, 1, JSON.stringify(rows));
      assert.match(rows[0], /^Izzah → you \$/);
      assert.equal(await page.locator("#simp").count(), 0);
    },
  },
  {
    name: "Simplify is on: one routed row, Mo → Sam $10.00, with its routing sentence",
    async run({ page }) {
      await ready(page);
      assert.equal(await isOn(page), true);
      await waitRows(page, ["You → Sam $10.00"]);
      await expectText(page, "#say", "You owe Sam $10.00.");
      await expectText(page, row("Mo>Sam") + " .s-route", ROUTE);
      assert.equal(await page.locator(row("Mo>Sam") + " button.remind").count(), 0, "Mo is not owed: no Remind");
    },
  },
  {
    name: "the working: tapping the amount prints paid, share and sent; tapping 'paid' lists the lines",
    async run({ page }) {
      await ready(page);
      await waitRows(page, ["You → Sam $10.00"]);
      assert.equal(await page.locator(".s-work").count(), 0, "closed until asked");
      await page.click(row("Mo>Sam") + " .s-amt");
      const lines = await until(async () => {
        const l = await page.$$eval(row("Mo>Sam") + " .s-work .s-wl", (els) => els.map((e) => e.textContent.replace(/\s+/g, " ").trim()));
        return l.length ? l : null;
      }, "the working opens");
      assert.deepEqual(lines, ["You paid $0.00", "Your share came to $10.00", "Already sent $0.00"]);
      assert.equal(await page.getAttribute(row("Mo>Sam") + " .s-amt", "aria-expanded"), "true");
      await page.click(row("Mo>Sam") + " .s-work [data-paid]");
      await expectText(page, row("Mo>Sam") + " .s-lines", "Nothing yet.");
      // Tapping the amount again folds it away.
      await page.click(row("Mo>Sam") + " .s-amt");
      assert.equal(await page.locator(".s-work").count(), 0);
    },
  },
  {
    name: "the working names the other person, lists what they paid, and shows what they received",
    async run({ page }) {
      const pay = { id: "chainpay001", from: "Mo", to: "Izzah", cad: 4, seed: 9, rot: 1 };
      await ready(page, { me: "Sam", seed: { ...SEED, people: { Sam: { simplify: false } }, payments: [pay] } });
      await waitRows(page, ["Mo → Izzah $6.00", "Izzah → you $10.00"]);
      await page.click(row("Izzah>Sam") + " .s-amt");
      const lines = await until(async () => {
        const l = await page.$$eval(row("Izzah>Sam") + " .s-work .s-wl", (els) => els.map((e) => e.textContent.replace(/\s+/g, " ").trim()));
        return l.length ? l : null;
      }, "the working opens");
      assert.deepEqual(lines, ["Izzah paid $20.00", "Izzah’s share came to $20.00", "Already sent $0.00", "Already received $4.00"]);
      await page.click(row("Izzah>Sam") + " .s-work [data-paid]");
      const paid = await page.$$eval(row("Izzah>Sam") + " .s-lines li", (els) => els.map((e) => e.textContent.replace(/\s+/g, " ").trim()));
      assert.deepEqual(paid, ["Izakaya $20.00"]);
    },
  },
  {
    name: "turning Simplify off asks once; Keep leaves it on; Turn off saves simplify false",
    async run({ page }) {
      const backend = await ready(page);
      await waitRows(page, ["You → Sam $10.00"]);
      await page.click("#simp");
      await expectText(page, "#simpAsk .simp-q", ASK);
      assert.ok(await visible(page, "#simpAsk"));
      await page.click("#simpKeep");
      assert.equal(await visible(page, "#simpAsk"), false);
      assert.equal(await isOn(page), true);
      await idle(page);
      assert.equal(setPersonCalls(backend).length, 0, "nothing saved");

      await page.click("#simp");
      await page.click("#simpOff");
      await until(async () => !(await isOn(page)), "the switch is off");
      assert.equal(await visible(page, "#simpAsk"), false);
      await idle(page);
      assert.equal(person(backend, "Mo").simplify, false);
      assert.deepEqual(setPersonCalls(backend).map((r) => r.args), [{ name: "Mo", patch: { simplify: false } }]);

      // Off: each direct debt, no routing sentence.
      await waitRows(page, ["You → Izzah $10.00", "Izzah → Sam $10.00"]);
      await expectText(page, "#say", "You owe Izzah $10.00.");
      assert.equal(await page.locator("#slip .s-route").count(), 0);

      // On again: no question, saved at once.
      await page.click("#simp");
      assert.equal(await visible(page, "#simpAsk"), false, "turning it on asks nothing");
      await until(() => isOn(page), "the switch is on");
      await idle(page);
      assert.equal(person(backend, "Mo").simplify, true);
      await waitRows(page, ["You → Sam $10.00"]);
    },
  },
  {
    name: "Simplify is each person's own: Sam still sees the routed row",
    async run({ page }) {
      await ready(page, { me: "Sam", seed: { ...SEED, people: { Mo: { simplify: false } } } });
      assert.equal(await isOn(page), true);
      await waitRows(page, ["Mo → you $10.00"]);
      await expectText(page, row("Mo>Sam") + " .s-route", "Mo pays you because Mo owes Izzah and Izzah owes you. Fewer payments, same totals.");
    },
  },
  {
    name: "a payment made under the routed reading settles Mo's direct reading too",
    async run({ page }) {
      const pay = { id: "chainpay002", from: "Mo", to: "Sam", cad: 10, seed: 3, rot: -2, stampedBy: "Sam" };
      await ready(page, { seed: { ...SEED, people: { Mo: { simplify: false } }, payments: [pay] } });
      assert.equal(await isOn(page), false);
      await until(async () => (await page.locator("#slip .s-row.is-paid").count()) === 1, "the stamped row");
      await waitRows(page, []);
      await expectText(page, "#say", "You’re square.");
      await expectText(page, "#slip .s-row.is-paid .s-sub", "Paid Sun Dec 6. Nothing more to send.");
    },
  },
  {
    name: "if turning Simplify off gets no reply, the switch goes back and the bar says it is checking",
    async run({ page }) {
      const backend = await ready(page);
      await waitRows(page, ["You → Sam $10.00"]);
      backend.failWith = "network";
      await page.click("#simp");
      await page.click("#simpOff");
      await expectText(page, "#ubarT", "Couldn’t confirm that. Checking…");
      await until(() => isOn(page), "the switch is back on");
      await waitRows(page, ["You → Sam $10.00"]);
      backend.failWith = null;
    },
  },
  {
    name: "Remind opens the share sheet with the ready message, only on rows owed to the viewer",
    async run({ page }) {
      await stubShare(page, "ok");
      await ready(page, { me: "Sam", seed: { ...SEED, people: { Sam: { etransfer: "s@example.com" } } } });
      await waitRows(page, ["Mo → you $10.00"]);
      assert.equal(await page.locator('#slip button.remind[data-key="Mo>Sam"]').count(), 1);
      await page.click('#slip button.remind[data-key="Mo>Sam"]');
      const shared = await until(async () => {
        const s = await page.evaluate(() => globalThis.__shared);
        return s.length ? s : null;
      }, "share is called");
      assert.deepEqual(shared, [{ text: "Mo, you owe me $10.00 for the Chicago trip. e-Transfer: s@example.com" }]);
      assert.equal(await visible(page, "#ubar"), false, "a share says nothing on the bar");
    },
  },
  {
    name: "closing the share sheet is not an error and shows nothing",
    async run({ page }) {
      await stubShare(page, "reject");
      await ready(page, { me: "Sam" });
      await waitRows(page, ["Mo → you $10.00"]);
      await page.click('#slip button.remind[data-key="Mo>Sam"]');
      await until(() => page.evaluate(() => globalThis.__shared.length === 1), "share is called");
      await idle(page);
      assert.equal(await visible(page, "#ubar"), false);
    },
  },
  {
    name: "with no share sheet, Remind copies the message and says so",
    async run({ page }) {
      await stubShare(page, "none");
      await ready(page, { me: "Sam" });
      await waitRows(page, ["Mo → you $10.00"]);
      await page.click('#slip button.remind[data-key="Mo>Sam"]');
      await expectText(page, "#ubarT", "Copied. Paste it in your chat.");
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "Mo, you owe me $10.00 for the Chicago trip.");
    },
  },
  {
    name: "no Remind where the viewer is not the one owed",
    async run({ page }) {
      await ready(page, { me: "Sam", seed: { ...SEED, people: { Sam: { simplify: false } } } });
      await waitRows(page, ["Mo → Izzah $10.00", "Izzah → you $10.00"]);
      assert.equal(await page.locator('#slip button.remind[data-key="Mo>Izzah"]').count(), 0);
      assert.equal(await page.locator('#slip button.remind[data-key="Izzah>Sam"]').count(), 1);
      assert.equal(await page.locator("#slip button.remind").count(), 1);
    },
  },
];
