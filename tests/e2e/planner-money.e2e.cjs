// A planner line in Money (stage 2): a line the planner's payments brought in
// carries the sign "From the planner", and its sheet is locked: no Edit, the
// words say where to change it; Delete works and a pull does not bring it
// back. Every planner value here is made up.

const assert = require("node:assert/strict");
const { SEED, NOON28, open, until, text, visible } = require("./helpers.cjs");
const { shot } = require("./before-fixture.cjs");

const PLANNER_ID = "fakePlannerSheet_0123456789abcdefXYZ";
const PHEAD = ["payment_id", "date_paid", "payer", "description", "category", "vendor", "booking_ref", "amount", "currency", "amount_cad", "cad_is_exact", "split_between", "split_type", "status", "include_in_split", "source", "added_by", "notes"];
const prow = (o) => PHEAD.map((h) => (o[h] === undefined ? "" : o[h]));
const PX7 = { payment_id: "X7", date_paid: "2026-12-27", payer: "Mo", description: "Made-up rail pass", category: "transport", vendor: "Made-up rail", booking_ref: "AB12", amount: 247.5, currency: "USD", amount_cad: 221.52, cad_is_exact: "yes", split_between: "Mo, Izzah", split_type: "equal", status: "paid", include_in_split: "yes" };
const linkedSeed = (rows) => ({ ...JSON.parse(JSON.stringify(SEED)), planner: [PHEAD, ...rows.map(prow)], plannerId: PLANNER_ID });
const HAND = "seedexp002"; // a line rung up by hand in the seed

const rowOf = (page, words) => page.evaluate((w) => { const r = [...document.querySelectorAll("#rc .rc-row[data-id]")].find((x) => x.querySelector(".rc-t").firstChild.textContent === w); return r ? r.dataset.id : null; }, words);
const lineOpen = (page) => page.evaluate(() => document.getElementById("line").classList.contains("is-open"));
const regOpen = (page) => page.evaluate(() => document.getElementById("reg").classList.contains("is-open"));

async function openOn(page) {
  const backend = await open(page, { seed: linkedSeed([PX7]), nowMs: NOON28 });
  const id = await until(() => rowOf(page, "Made-up rail pass"), "the first pull brought the line in");
  return { backend, id };
}

module.exports = [
  {
    name: "a planner line has the sign; a hand-rung one has none",
    async run({ page }) {
      const { id } = await openOn(page);
      const row = '#rc .rc-row[data-id="' + id + '"]';
      assert.equal(await text(page, row + " .rc-pl .bf-sign"), "From the planner");
      assert.equal(await page.locator(row + " small.rc-pl").count(), 1);
      // The sign comes after the note.
      assert.equal(await page.evaluate((s) => { const n = document.querySelector(s + " .rc-note"); return !!n && n.nextElementSibling === document.querySelector(s + " .rc-pl"); }, row), true);
      assert.equal(await page.locator('#rc .rc-row[data-id="' + HAND + '"] .bf-sign').count(), 0);
      assert.equal(await page.locator("#rc .bf-sign").count(), 1, "only the one line");
      await page.locator(row).scrollIntoViewIfNeeded();
      await shot(page, "s2-2-money-with-the-sign");
    },
  },
  {
    name: "its sheet has no Edit and says where to change it; the note is shown, not editable; the register never opens for it",
    async run({ page }) {
      const { id } = await openOn(page);
      await page.click('#rc .rc-row[data-id="' + id + '"]');
      await until(() => lineOpen(page), "the line sheet opens");
      assert.equal(await page.locator("#lnEdit").isHidden(), true);
      assert.equal(await visible(page, "#lnDel"), true);
      assert.equal(await text(page, "#lnPl"), "From the planner. Change it there and it comes in here. Deleted here, it stays out.");
      assert.equal(await page.locator("#lnNote").inputValue(), "X7 · Made-up rail · ref AB12 · US$247.50 charged");
      assert.equal(await page.locator("#lnNote").evaluate((n) => n.readOnly), true);
      assert.equal(await page.locator("#lnNoteSave").isHidden(), true);
      await shot(page, "s2-3-locked-planner-line");
      // Even a click that reaches the hidden Edit key opens no register.
      await page.evaluate(() => document.getElementById("lnEdit").click());
      assert.equal(await regOpen(page), false);
      await page.keyboard.press("Escape");
      await until(async () => !(await lineOpen(page)), "closed");
      // By the keyboard: the same sheet.
      await page.focus('#rc .rc-row[data-id="' + id + '"]');
      await page.keyboard.press("Enter");
      await until(() => lineOpen(page), "opened by Enter");
      assert.equal(await page.locator("#lnEdit").isHidden(), true);
      await page.keyboard.press("Escape");
      await until(async () => !(await lineOpen(page)), "closed again");
      // A hand-rung line is as it was.
      await page.click('#rc .rc-row[data-id="' + HAND + '"]');
      await until(() => lineOpen(page), "the hand line's sheet opens");
      assert.equal(await visible(page, "#lnEdit"), true);
      assert.equal(await page.locator("#lnPl").isHidden(), true);
      assert.equal(await page.locator("#lnNote").evaluate((n) => n.readOnly), false);
      await page.locator("#lnEdit").click();
      await until(() => regOpen(page), "Edit opens the register for a hand line");
    },
  },
  {
    name: "Delete works and a pull does not bring it back; fromPlanner is in no request the phone sends",
    async run({ page }) {
      const { backend, id } = await openOn(page);
      // A note saved on a hand line, as a phone does it.
      await page.click('#rc .rc-row[data-id="' + HAND + '"]');
      await until(() => lineOpen(page), "the hand line opens");
      await page.locator("#lnNote").fill("made-up note");
      await page.locator("#lnNoteSave").click();
      await until(() => backend.requests.some((r) => r.action === "updateExpense"), "the note was sent");
      await page.keyboard.press("Escape");
      await until(async () => !(await lineOpen(page)), "closed");
      // The planner line is deleted.
      await page.click('#rc .rc-row[data-id="' + id + '"]');
      await until(() => lineOpen(page), "the planner line opens");
      await page.locator("#lnDel").click();
      await until(async () => (await rowOf(page, "Made-up rail pass")) === null, "gone from the receipt");
      await until(() => backend.fake.tables.Expenses.find((r) => r.id === id).deleted_at !== "", "deleted on the backend");
      // Pull now, from You.
      await page.locator("#youBtn").click();
      await until(() => visible(page, "#setPlanner"), "the Planner row");
      const pulls = backend.requests.filter((r) => r.action === "syncPayments").length;
      await page.locator("#setPlanner").click();
      await until(() => backend.requests.filter((r) => r.action === "syncPayments").length > pulls, "pulled");
      await until(async () => (await text(page, "#setPlannerV")) !== "Pulling…", "the pull answered");
      assert.equal(await text(page, "#setPlannerV"), "Nothing new");
      assert.equal(backend.fake.tables.Expenses.filter((r) => r.planner_id === "X7").length, 1, "no second line");
      assert.notEqual(backend.fake.tables.Expenses.find((r) => r.id === id).deleted_at, "", "still deleted");
      assert.equal(await rowOf(page, "Made-up rail pass"), null, "not back on the receipt");
      const fromPhone = backend.requests.filter((r) => r.via === "app");
      assert.ok(fromPhone.some((r) => r.action === "deleteExpense"));
      assert.equal(/fromPlanner/.test(JSON.stringify(fromPhone)), false);
    },
  },
];
