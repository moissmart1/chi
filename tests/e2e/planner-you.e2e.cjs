// The Planner row in You and the pill in Money: when the planner's payments were
// last pulled, a key that pulls them (and the Before list with them), and what
// could not be brought in, with the same count in red. Every planner value
// here is made up.

const assert = require("node:assert/strict");
const { SEED, NOON28, open, advance, until, text, visible } = require("./helpers.cjs");
const { shot } = require("./before-fixture.cjs");

const PLANNER_ID = "fakePlannerSheet_0123456789abcdefXYZ";
const PHEAD = ["payment_id", "date_paid", "payer", "description", "category", "vendor", "booking_ref", "amount", "currency", "amount_cad", "cad_is_exact", "split_between", "split_type", "status", "include_in_split", "source", "added_by", "notes"];
const prow = (o) => PHEAD.map((h) => (o[h] === undefined ? "" : o[h]));
const PX7 = { payment_id: "X7", date_paid: "2026-12-27", payer: "Mo", description: "Made-up rail pass", category: "transport", vendor: "Made-up rail", booking_ref: "AB12", amount: 247.5, currency: "USD", amount_cad: 221.52, cad_is_exact: "yes", split_between: "Mo, Izzah", split_type: "equal", status: "paid", include_in_split: "yes" };
const BAD = { ...PX7, payment_id: "bad id", description: "Made-up bad one" };
const linkedSeed = (rows) => ({ ...JSON.parse(JSON.stringify(SEED)), planner: [PHEAD, ...rows.map(prow)], plannerId: PLANNER_ID });

const onReceipt = (page, words) => page.evaluate((w) => [...document.querySelectorAll("#rc .rc-row[data-id]")].some((r) => r.textContent.includes(w)), words);
const openYou = async (page) => {
  await page.locator("#youBtn").click();
  await until(() => page.evaluate(() => { const s = document.getElementById("you"); return s.classList.contains("is-open") && Math.abs(s.getBoundingClientRect().bottom - innerHeight) < 1; }), "the settings sheet opens");
};

function hold(backend, action) {
  let release;
  const gate = new Promise((r) => (release = r));
  const handle = backend.handle;
  backend.handle = async (body) => {
    if (body.action === action) await gate;
    return handle(body);
  };
  return { release: () => release() };
}

module.exports = [
  {
    name: "no planner: the row is hidden",
    async run({ page }) {
      await open(page, { seed: SEED, nowMs: NOON28 });
      await until(() => page.evaluate(() => document.querySelectorAll("#rc .rc-row").length > 0), "the receipt draws");
      await openYou(page);
      assert.equal(await page.locator("#setPlanner").isHidden(), true);
      assert.equal(await page.locator("#setPlannerP").isHidden(), true);
      assert.equal(await page.locator("#plLook").isHidden(), true);
    },
  },
  {
    name: "Pull now → Pulling… → Added 1 → Pull now, and Last pulled moves",
    async run({ page }) {
      const backend = await open(page, { seed: linkedSeed([PX7]), nowMs: NOON28 });
      await until(() => onReceipt(page, "Made-up rail pass"), "the first pull landed");
      await openYou(page);
      assert.equal(await visible(page, "#setPlanner"), true);
      assert.equal(await text(page, "#setPlannerV"), "Pull now");
      assert.equal(await text(page, "#setPlannerS"), "Last pulled Mon Dec 28, 13:20");
      await page.locator("#setPlanner").scrollIntoViewIfNeeded();
      await shot(page, "12-planner-row-at-rest");
      backend.fake.planner.rows.push(prow({ ...PX7, payment_id: "X8", description: "Made-up deep dish", amount_cad: 61.2 }));
      await advance(page, backend, 5 * 60 * 1000);
      const h = hold(backend, "syncPayments");
      await page.locator("#setPlanner").click();
      await until(async () => (await text(page, "#setPlannerV")) === "Pulling…", "it says Pulling…");
      assert.equal(await page.locator("#setPlanner").isDisabled(), true);
      h.release();
      await until(async () => (await text(page, "#setPlannerV")) === "Added 1", "it says Added 1");
      assert.equal(await text(page, "#setPlannerS"), "Last pulled Mon Dec 28, 13:25");
      await shot(page, "13-planner-row-after-a-pull");
      assert.equal(await onReceipt(page, "Made-up deep dish"), true);
      assert.ok(backend.requests.some((r) => r.action === "syncTodos"), "the Before list is fetched with it");
      await advance(page, backend, 4100);
      await until(async () => (await text(page, "#setPlannerV")) === "Pull now", "back to Pull now");
    },
  },
  {
    name: "a payment that could not be brought in: '1 needs a look' in red, the list under it, the pill in Money, and the pill opens You on the row",
    async run({ page }) {
      await open(page, { seed: linkedSeed([PX7, BAD]), nowMs: NOON28 });
      await until(() => onReceipt(page, "Made-up rail pass"), "the first pull landed");
      await until(() => visible(page, "#plLook"), "the pill shows in Money");
      assert.equal(await text(page, "#plLook"), "1planner line needs a look");
      await shot(page, "15-money-with-the-pill");
      assert.equal(await page.locator("#plLook").getAttribute("aria-label"), "1 planner line needs a look");
      await page.locator("#plLook").click();
      await until(() => page.evaluate(() => document.getElementById("you").classList.contains("is-open")), "You opens");
      await until(() => page.evaluate(() => document.activeElement && document.activeElement.id === "setPlanner"), "focus is on the Planner row");
      assert.equal(await text(page, "#setPlannerV"), "1 needs a look");
      assert.equal(await page.locator("#setPlannerV").evaluate((n) => getComputedStyle(n).color), "rgb(194, 54, 43)", "in red");
      await until(() => visible(page, "#setPlannerP"), "the list shows");
      assert.match(await text(page, "#setPlannerP"), /^Not brought in from the planner/);
      assert.match(await text(page, "#setPlannerP"), /row 3 · Made-up bad one/);
      assert.match(await text(page, "#setPlannerP"), /isn’t usable/);
      await page.locator("#setPlannerP").scrollIntoViewIfNeeded();
      await shot(page, "14-planner-row-with-problems");
    },
  },
  {
    name: "the row at 320x568 and sideways: nothing cut off",
    viewport: { width: 320, height: 568 },
    async run({ page }) {
      await open(page, { seed: linkedSeed([PX7, BAD]), nowMs: NOON28 });
      await until(() => onReceipt(page, "Made-up rail pass"), "the first pull landed");
      await openYou(page);
      await until(() => visible(page, "#setPlannerP"), "the list shows");
      const over = await page.evaluate(() => {
        const s = document.getElementById("you").getBoundingClientRect();
        return [...document.querySelectorAll("#setPlanner, #setPlannerP")].filter((n) => { const r = n.getBoundingClientRect(); return r.left < s.left - 1 || r.right > s.right + 1; }).map((n) => n.id);
      });
      assert.deepEqual(over, []);
    },
  },
];
