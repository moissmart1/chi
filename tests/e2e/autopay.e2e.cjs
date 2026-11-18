// The planner's payments come in on their own when the app opens (Mo,
// 2026-11-17: "the payments need to be updated from the sheet more often").

const assert = require("node:assert/strict");
const { SEED, NOON12, open, until } = require("./helpers.cjs");

const PHEAD = ["payment_id", "date_paid", "payer", "description", "category", "vendor", "booking_ref", "amount", "currency", "amount_cad", "cad_is_exact", "split_between", "split_type", "status", "include_in_split", "source", "added_by", "notes"];
const prow = (o) => PHEAD.map((h) => (o[h] === undefined ? "" : o[h]));
const PX7 = { payment_id: "X7", date_paid: "2026-12-11", payer: "Mo", description: "Rail pass", category: "transport", vendor: "North Rail", booking_ref: "AB12", amount: 160.5, currency: "USD", amount_cad: 221.52, cad_is_exact: "yes", split_between: "Mo, Izzah", split_type: "equal", include_in_split: "yes" };

module.exports = [
  {
    name: "opening the app brings in a payment added to the planner, without tapping Fetch",
    async run({ page }) {
      const seed = { ...JSON.parse(JSON.stringify(SEED)), planner: [PHEAD, prow(PX7)], plannerId: "fakePlannerSheet_0123456789abcdefXYZ" };
      await open(page, { seed, nowMs: NOON12 });
      await until(() => page.evaluate(() => [...document.querySelectorAll("#rc .rc-row .rc-t")].some((t) => t.firstChild.textContent === "Rail pass")), "the planner's payment is on the receipt");
    },
  },
];
