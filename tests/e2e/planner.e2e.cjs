// The planner link (ported from the Japan app, workings only): with a planner
// linked, its payments come in on their own while the app is open, at most
// once every 10 minutes, and nothing of the planner shows but the lines it
// brings: the Before list and the Planner payments row have no screen yet
// (their look is still to be picked). Every planner value here is made up.

const assert = require("node:assert/strict");
const { SEED, NOON28, open, advance, until } = require("./helpers.cjs");

const PLANNER_ID = "fakePlannerSheet_0123456789abcdefXYZ";
// Chicago's Payments columns, in its order.
const PHEAD = ["payment_id", "date_paid", "payer", "description", "category", "vendor", "booking_ref", "amount", "currency", "amount_cad", "cad_is_exact", "split_between", "split_type", "status", "include_in_split", "source", "added_by", "notes"];
const prow = (o) => PHEAD.map((h) => (o[h] === undefined ? "" : o[h]));
const PX7 = { payment_id: "X7", date_paid: "2026-12-27", payer: "Mo", description: "Made-up rail pass", category: "transport", vendor: "Made-up rail", booking_ref: "AB12", amount: 247.5, currency: "USD", amount_cad: 221.52, cad_is_exact: "yes", split_between: "Mo, Izzah", split_type: "equal", status: "paid", include_in_split: "yes" };
const linkedSeed = () => ({ ...JSON.parse(JSON.stringify(SEED)), planner: [PHEAD, prow(PX7)], plannerId: PLANNER_ID });

const onReceipt = (page, words) => page.evaluate((w) => [...document.querySelectorAll("#rc .rc-row[data-id]")].some((r) => r.textContent.includes(w)), words);
const pulls = (backend) => backend.requests.filter((r) => r.action === "syncPayments");

module.exports = [
  {
    name: "a linked planner: opening the app brings its payment onto the receipt with nobody asking, and there is no Before key, screen or Planner row",
    async run({ page }) {
      const backend = await open(page, { seed: linkedSeed(), nowMs: NOON28 });
      await until(() => onReceipt(page, "Made-up rail pass"), "the planner's payment is on the receipt");
      assert.deepEqual(pulls(backend).map((r) => r.args), [{ auto: true }], "one quiet pull when the app opened");
      assert.equal(backend.fake.tables.Expenses.filter((e) => e.planner_id === "X7").length, 1, "tied to its payment");
      assert.equal(await page.locator("#beforeBtn, #vBefore, #setPlanner, #setPlannerP").count(), 0, "no planner screen or row");
      assert.equal(JSON.stringify(await page.evaluate(() => ({ ...localStorage }))).includes(PLANNER_ID), false, "the planner's id never reaches the phone");
    },
  },
  {
    name: "a linked planner: looks within 10 minutes of the pull ask nothing; the first look after 10 minutes brings in a payment added meanwhile",
    async run({ page }) {
      const backend = await open(page, { seed: linkedSeed(), nowMs: NOON28 });
      await until(() => onReceipt(page, "Made-up rail pass"), "the first pull landed");
      backend.fake.planner.rows.push(prow({ ...PX7, payment_id: "X8", description: "Made-up deep dish", amount_cad: 61.2 }));
      // Five minutes of checks and a return to the app: nothing asked.
      await advance(page, backend, 5 * 60 * 1000);
      await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
      await until(() => backend.requests.filter((r) => r.action === "rev").length > 0, "the phone checked in");
      assert.equal(pulls(backend).length, 1, "not asked again within 10 minutes");
      assert.equal(await onReceipt(page, "Made-up deep dish"), false);
      // Past 10 minutes: the next look asks, and the new payment comes in.
      // The backend's clock moves first: advance() moves the page's first, and
      // a look the page's 20-second check makes inside that jump would reach a
      // backend still 5 minutes behind, which (rightly) skips it.
      backend.now += 5 * 60 * 1000 + 1000;
      await page.clock.fastForward(5 * 60 * 1000 + 1000);
      await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
      await until(() => onReceipt(page, "Made-up deep dish"), "the payment added to the planner is on the receipt");
      assert.deepEqual(pulls(backend).map((r) => r.args), [{ auto: true }, { auto: true }]);
    },
  },
];
