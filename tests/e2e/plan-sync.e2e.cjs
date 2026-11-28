// The plan from the planner (chi#16), look A "Printed and pencilled": a
// planner stop's sheet prints the planner's five fields in a box and sends
// none of them; a stop only in the app is pencilled in on its day; You →
// Planner says when the plan was read and lists what needs a look and what is
// only in the app; the notice says when a pull changed the plan. With the
// switch off every screen is as it was. Every value here is made up.
// Pictures, only when asked: PLAN_SYNC_SHOTS=<folder> (never in the repo).

const assert = require("node:assert/strict");
const fs = require("fs");
const { SEED, NOON28, open, until, text, visible } = require("./helpers.cjs");

const SHOTS = process.env.PLAN_SYNC_SHOTS || "";
async function shot(page, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: SHOTS + "/" + name + ".png" });
}

// Moves the backend's clock, then the page's: the phone's own ask for the plan
// (on the 20-second look) then finds the backend's one-minute gap over.
async function later(page, backend, ms) {
  backend.now += ms;
  await page.clock.fastForward(ms);
}

const PLANNER_ID = "fakePlannerSheet_0123456789abcdefXYZ";
const DAY = "2026-12-28"; // today in the test (13:20 in Chicago)
const MUSEUM = { id: "teststop0001", date: DAY, time: "19:00", title: "Corner museum", detail: "West side. Bring the passes.", booked: true, fixed: true, fromPlanner: true, tkFromPlanner: true, tkRef: "ZZ99999", tkName: "Sam Example", tkPeople: "Mo, Izzah", tkSeat: "Row C" };
const PIER = { id: "teststop0002", date: DAY, time: "", title: "Pier stop", fromPlanner: true };
const COCOA = { id: "teststop0003", date: DAY, time: "15:30", title: "Hot cocoa on the way back" };
const PHEAD = ["stop_id", "date", "time", "what", "booked", "fixed", "notes"];
const prow = (s, o = {}) => [s.id, s.date, s.time, s.title, s.booked ? "yes" : "", s.fixed ? "yes" : "", "", ...[]].map((v, i) => (o[i] !== undefined ? o[i] : v));
const THEAD = ["ticket_id", "stop_id", "title", "traveler", "holder", "confirmation", "seat", "status"];
const TICKETS = [THEAD, ["T01", MUSEUM.id, "Museum entry", "Mo", "Sam Example", "ZZ99999", "Row C", "active"], ["T02", MUSEUM.id, "Museum entry", "Izzah", "Sam Example", "ZZ99999", "Row C", "active"]];
const PAYHEAD = ["payment_id", "date_paid", "payer", "description", "category", "vendor", "booking_ref", "amount", "currency", "amount_cad", "cad_is_exact", "split_between", "split_type", "status", "include_in_split", "source", "added_by", "notes"];

function seed({ follow = true, plan = [PHEAD, prow(MUSEUM), prow(PIER)], stops = [MUSEUM, PIER, COCOA] } = {}) {
  return {
    ...JSON.parse(JSON.stringify(SEED)),
    stops,
    planner: [PAYHEAD],
    plannerId: PLANNER_ID,
    plannerTabs: { Plan: plan, Tickets: TICKETS },
    props: follow ? { PLAN_FOLLOW: "on" } : {},
  };
}

const tk = '#rail .pg[data-date="' + DAY + '"]';
const row = (id) => '.r[data-id="' + id + '"]';
const isOpen = (page, id) => page.evaluate((i) => document.getElementById(i).classList.contains("is-open"), id);

async function ready(page, opts = {}) {
  const backend = await open(page, { tab: "days", nowMs: NOON28, ...opts });
  await until(() => page.evaluate((sel) => document.querySelectorAll(sel + " .r[data-id]").length >= 3, tk), "the day's stops draw");
  return backend;
}
// Waits for the first plan pull (on opening) to have landed on the phone.
const pulled = (backend) => until(() => backend.requests.some((r) => r.action === "syncPlan"), "the phone asked for the plan");

const waitSheet = (page) => until(() => page.evaluate(() => {
  const s = document.getElementById("stop");
  return s.classList.contains("is-open") && Math.abs(s.getBoundingClientRect().bottom - innerHeight) < 1;
}), "the stop sheet opens");
async function openEdit(page, id) {
  // Today's next stop is already open: a tap would close it.
  if (!(await page.evaluate((sel) => document.querySelector(sel).classList.contains("is-open"), row(id)))) await page.dispatchEvent(row(id) + " .r-b", "click");
  await until(() => page.evaluate((sel) => {
    const r = document.querySelector(sel);
    const d = r.querySelector(".r-more > div");
    return r.classList.contains("is-open") && d.clientHeight === d.scrollHeight;
  }, row(id)), "the stop opens");
  await page.dispatchEvent(row(id) + " .r-edit", "click");
  await waitSheet(page);
}
const hiddenAll = (page, ids) => page.evaluate((list) => list.map((i) => !!document.getElementById(i).closest("[hidden]")), ids);
const openYou = async (page) => {
  await page.locator("#youBtn").click();
  await until(() => page.evaluate(() => { const s = document.getElementById("you"); return s.classList.contains("is-open") && Math.abs(s.getBoundingClientRect().bottom - innerHeight) < 1; }), "the settings sheet opens");
};

module.exports = [
  {
    name: "a planner stop's sheet: the printed box, the fields it owns hidden and never sent, no Remove; its own detail saves",
    async run({ page }) {
      const backend = await ready(page, { seed: seed() });
      await pulled(backend);
      await openEdit(page, MUSEUM.id);
      assert.equal(await text(page, "#stHead"), "Change a stop");
      assert.equal(await visible(page, "#stPr"), true);
      assert.equal(await text(page, "#stPr .st-pr-k"), "PRINTED FROM THE PLANNER");
      assert.deepEqual([await text(page, "#stPrT"), await text(page, "#stPrN"), await text(page, "#stPrD"), await text(page, "#stPrB")], ["19:00", "Corner museum", "Mon Dec 28", "BOOKED"]);
      assert.equal(await visible(page, "#stPrF"), true);
      assert.equal(await text(page, "#stPrF"), "TIME CAN’T SLIP");
      assert.equal(await text(page, "#stPr .st-pr-w"), "To move it, rename it or take it off, change its row in the planner’s Plan tab. It comes in here within a few minutes.");
      assert.equal(await page.getAttribute("#stPr", "aria-label"), "From the planner");
      assert.equal(await page.evaluate(() => document.querySelectorAll("#stPr button, #stPr input, #stPr [tabindex]").length), 0, "nothing to press in the box");
      assert.equal(await text(page, "#stOurs"), "Ours to fill in");
      assert.deepEqual(await hiddenAll(page, ["stDay", "stWhat", "stTime", "stFixed", "stDel"]), [true, true, true, true, true]);
      assert.equal(await page.evaluate(() => !!document.getElementById("stWhat")), true, "hidden, never removed");
      // The ticket's four details come from the planner's Tickets tab: shown, not editable.
      assert.equal(await text(page, "#stTix .tkp-pr"), "PRINTED FROM THE PLANNER’S TICKETS");
      assert.deepEqual(await page.evaluate(() => ["stTkRef", "stTkName", "stTkPeople", "stTkSeat"].map((i) => [document.getElementById(i).value, document.getElementById(i).disabled])), [["ZZ99999", true], ["Sam Example", true], ["Mo, Izzah", true], ["Row C", true]]);
      assert.equal(await page.evaluate(() => document.getElementById("stTkFile").disabled), false, "pictures as today");
      await page.locator("#stDetail").scrollIntoViewIfNeeded();
      await page.evaluate(() => { document.getElementById("stop").scrollTop = 0; });
      await shot(page, "1-planner-stop-sheet");
      await page.fill("#stDetail", "West side. Passes in the blue folder.");
      await page.click("#stSave");
      await until(async () => !(await isOpen(page, "stop")), "the sheet closes, saved");
      const sent = backend.requests.filter((r) => r.action === "updateStop").at(-1);
      assert.deepEqual(Object.keys(sent.args.patch), ["detail"], "only what is ours");
      assert.equal(backend.fake.tables.Stops.find((r) => r.id === MUSEUM.id).detail, "West side. Passes in the blue folder.");
    },
  },
  {
    name: "an untimed, unbooked planner stop: no time in the box, NOT BOOKED, no fixed mark; a pull while it is open changes the box only",
    async run({ page }) {
      const backend = await ready(page, { seed: seed() });
      await pulled(backend);
      await openEdit(page, PIER.id);
      assert.equal(await visible(page, "#stPrT"), false);
      assert.deepEqual([await text(page, "#stPrN"), await text(page, "#stPrB")], ["Pier stop", "NOT BOOKED"]);
      assert.equal(await visible(page, "#stPrF"), false);
      const nameLeft = await page.evaluate(() => document.getElementById("stPrN").getBoundingClientRect().left - document.getElementById("stPr").getBoundingClientRect().left);
      assert.ok(nameLeft < 16, "the name starts at the left edge");
      // No ticket rows for it: its details are the app's.
      assert.equal(await page.evaluate(() => document.getElementById("stTkRef").disabled), false);
      await page.fill("#stDetail", "Typed, not saved");
      // The planner changes it while the sheet is open: the box follows, the field keeps what was typed.
      backend.fake.planner.tabs.Plan = [PHEAD, prow(MUSEUM), prow({ ...PIER, time: "16:15", title: "Pier stop, east end", booked: true })];
      await later(page, backend, 3 * 60 * 1000);
      await until(async () => (await text(page, "#stPrN")) === "Pier stop, east end", "the box follows the pull");
      assert.deepEqual([await text(page, "#stPrT"), await text(page, "#stPrB")], ["16:15", "BOOKED"]);
      assert.equal(await page.inputValue("#stDetail"), "Typed, not saved");
    },
  },
  {
    name: "the day: a stop only in the app is pencilled in, a planner stop is not; the add row pencils a stop in",
    async run({ page }) {
      const backend = await ready(page, { seed: seed() });
      await pulled(backend);
      await until(() => page.evaluate((sel) => !!document.querySelector(sel + ".is-pen"), row(COCOA.id)), "the pencilled stop");
      assert.equal(await text(page, row(COCOA.id) + " .r-pen"), "PENCILLED INOnly in the app until it’s in the planner.");
      assert.equal(await text(page, row(COCOA.id) + " .r-pen span"), "PENCILLED IN");
      for (const id of [MUSEUM.id, PIER.id]) {
        assert.equal(await page.evaluate((sel) => document.querySelector(sel).classList.contains("is-pen"), row(id)), false, id);
        assert.equal(await page.evaluate((sel) => !!document.querySelector(sel + " .r-pen"), row(id)), false, id);
      }
      assert.equal(await page.evaluate((sel) => getComputedStyle(document.querySelector(sel + " .r-n")).color, row(COCOA.id)), "rgb(85, 80, 74)", "the pencil's colour");
      assert.equal(await text(page, tk + " .tk-add"), "＋ Pencil in a stop");
      const cell = await page.evaluate((sel) => { const t = document.querySelector(sel + " .r-t"); return { sw: t.scrollWidth, cw: t.clientWidth, caveat: document.fonts.check("700 20px Caveat") }; }, row(COCOA.id));
      assert.ok(cell.sw <= cell.cw + 1, "the pencilled time fits its column at 390: " + JSON.stringify(cell));
      await page.evaluate((sel) => document.querySelector(sel).scrollIntoView({ block: "center" }), row(COCOA.id));
      await shot(page, "2-day-with-a-pencilled-stop");
      await page.dispatchEvent(tk + " .tk-add", "click");
      await waitSheet(page);
      assert.deepEqual([await text(page, "#stHead"), await text(page, "#stSave"), await text(page, "#stPenW")], ["Pencil in a stop", "Pencil it in", "Only in the app until it has a row in the planner."]);
      assert.equal(await visible(page, "#stPr"), false);
      assert.equal(await visible(page, "#stWhat"), true);
      await page.fill("#stWhat", "Late snack");
      await page.click("#stSave");
      await until(async () => !(await isOpen(page, "stop")), "pencilled in");
      const added = backend.fake.tables.Stops.find((r) => r.title === "Late snack");
      assert.ok(added && added.planner !== "yes", "the app's own");
    },
  },
  {
    name: "You → Planner: the plan's read time, the rows that need a look and the stops only in the app; Pull now pulls the plan too",
    async run({ page }) {
      const plan = [PHEAD, prow(MUSEUM), prow(PIER), ["", DAY, "20:00", "Late show", "", "", ""]];
      const backend = await ready(page, { seed: seed({ plan }) });
      await pulled(backend);
      await openYou(page);
      await until(async () => (await text(page, "#setPlannerV")) === "1 needs a look", "the count in red");
      assert.equal(await page.evaluate(() => document.getElementById("setPlannerV").classList.contains("red")), true);
      assert.match(await text(page, "#setPlannerS"), /^Plan read Mon Dec 28, 13:20 · payments Mon Dec 28, 13:20$/);
      assert.equal(await visible(page, "#setPlannerP"), false, "no payment problems: today's list stays hidden");
      assert.equal(await text(page, "#setPlanP h4"), "1 row of the Plan tab needs a look");
      assert.equal(await text(page, "#setPlanP div"), "row 4 · Late showThat row has no id, so it wasn’t brought in.");
      assert.equal(await text(page, "#setPlanA h4"), "1 stop is only in the app");
      assert.equal(await text(page, "#setPlanA div"), "Mon Dec 28 · 15:30 · Hot cocoa on the way back");
      assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById("setPlanA")).borderLeftColor), "rgb(122, 85, 48)");
      assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById("setPlanP")).borderLeftColor), "rgb(194, 54, 43)");
      // .set-pp + .set-pp{margin-top:8px}, on top of the list's own 6px gap.
      assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById("setPlanA")).marginTop), "8px");
      assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById("setPlanP")).marginTop), "-2px", "the first block as today's");
      await page.locator("#setPlanA").scrollIntoViewIfNeeded();
      await shot(page, "3-you-planner");
      // Two more of each: the plural headings, untimed stops without a time.
      backend.fake.planner.tabs.Plan = [...plan, ["", DAY, "", "Fireworks", "", "", ""]];
      await backend.fake({ key: "test-key", actor: "Mo", action: "addStop", args: { stop: { id: "teststop0004", date: "2026-12-29", time: "", title: "Snow walk" } } });
      await later(page, backend, 20 * 1000);
      const pulls = backend.requests.filter((r) => r.action === "syncPlan").length;
      await page.locator("#setPlanner").click();
      await until(() => backend.requests.filter((r) => r.action === "syncPlan").length > pulls, "Pull now pulls the plan");
      await until(async () => (await text(page, "#setPlanP h4")) === "2 rows of the Plan tab need a look", "two rows");
      await until(async () => (await text(page, "#setPlanA h4")) === "2 stops are only in the app", "two stops");
      assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll("#setPlanA div")].map((d) => d.textContent)), ["Mon Dec 28 · 15:30 · Hot cocoa on the way back", "Tue Dec 29 · Snow walk"]);
    },
  },
  {
    name: "the notice: the plan changed in the planner, in its words for each mix, never over another notice",
    async run({ page }) {
      const backend = await ready(page, { seed: seed() });
      await pulled(backend);
      const said = () => text(page, "#ubarT");
      // A stop added and one changed.
      backend.fake.planner.tabs.Plan = [PHEAD, prow(MUSEUM), prow({ ...PIER, time: "16:15" }), prow({ id: "teststop0009", date: DAY, time: "21:00", title: "Night bus" })];
      await later(page, backend, 3 * 60 * 1000);
      await until(async () => (await said()) === "The plan changed in the planner: 1 stop added, 1 changed.", "added and changed");
      assert.equal(await visible(page, "#ubarU"), false, "no button");
      // The page's clock is paused: let the bar's arrival finish for the picture.
      await page.evaluate(() => document.getElementById("ubar").getAnimations().forEach((a) => a.finish()));
      await shot(page, "4-notice");
      await page.evaluate(() => globalThis.__matTest.store.clearNotice());
      // Only a removal.
      backend.fake.planner.tabs.Plan = [PHEAD, prow(MUSEUM), prow({ ...PIER, time: "16:15" })];
      await later(page, backend, 3 * 60 * 1000);
      await until(async () => (await said()) === "The plan changed in the planner: 1 stop taken off.", "taken off");
      await page.evaluate(() => globalThis.__matTest.store.clearNotice());
      // Another notice showing (said just now, so it has not timed out): kept.
      backend.fake.planner.tabs.Plan = [PHEAD, prow(MUSEUM), prow({ ...PIER, time: "16:45" })];
      backend.now += 61 * 1000;
      await page.clock.fastForward(31 * 1000);
      await page.evaluate(() => globalThis.__matTest.store.notify("No signal. That wasn’t saved."));
      await page.evaluate(() => globalThis.__matTest.store.autoPlan({ front: true }));
      await until(() => page.evaluate(() => document.querySelector('.r[data-id="teststop0002"] .r-t').textContent === "16:45"), "the change landed");
      assert.equal(await said(), "No signal. That wasn’t saved.");
    },
  },
  {
    name: "a change line with its Undo is never replaced by the plan's notice",
    async run({ page }) {
      const backend = await ready(page, { seed: seed() });
      await pulled(backend);
      await page.clock.fastForward(31 * 1000);
      // A change of ours: its line and Undo show (the page's clock is paused, so it stays up).
      await page.evaluate((id) => globalThis.__matTest.store.updateStop(id, { detail: "A line of ours" }), COCOA.id);
      await until(async () => (await visible(page, "#ubarU")) && /Hot cocoa/.test(await text(page, "#ubarT")), "the change line and Undo");
      const line = await text(page, "#ubarT");
      // The planner changes a stop; the phone's own ask lands it.
      backend.fake.planner.tabs.Plan = [PHEAD, prow(MUSEUM), prow({ ...PIER, time: "16:15" })];
      backend.now += 61 * 1000;
      await page.evaluate(() => globalThis.__matTest.store.autoPlan({ front: true }));
      await until(() => page.evaluate(() => document.querySelector('.r[data-id="teststop0002"] .r-t').textContent === "16:15"), "the change landed");
      assert.equal(await text(page, "#ubarT"), line, "the change line stays");
      assert.equal(await visible(page, "#ubarU"), true, "its Undo stays");
    },
  },
  {
    name: "a stop the planner takes over while its sheet is open takes the printed look at once, and Remove is refused",
    async run({ page }) {
      const backend = await ready(page, { seed: seed() });
      await pulled(backend);
      await openEdit(page, COCOA.id);
      assert.deepEqual(await hiddenAll(page, ["stPr", "stWhat", "stDel"]), [true, false, false], "today's sheet: the app's own stop");
      await page.fill("#stDetail", "Typed while open");
      // The planner adopts it (a Plan row with its id).
      backend.fake.planner.tabs.Plan = [PHEAD, prow(MUSEUM), prow(PIER), prow(COCOA)];
      await later(page, backend, 3 * 60 * 1000);
      await until(async () => (await hiddenAll(page, ["stPr"]))[0] === false, "the printed box shows");
      assert.deepEqual(await hiddenAll(page, ["stDay", "stWhat", "stTime", "stFixed", "stDel"]), [true, true, true, true, true]);
      assert.deepEqual([await text(page, "#stPrT"), await text(page, "#stPrN")], ["15:30", "Hot cocoa on the way back"]);
      assert.equal(await page.inputValue("#stDetail"), "Typed while open", "what was typed stays");
      // Remove, reached anyway, is refused here and nothing is sent.
      const removes = () => backend.requests.filter((r) => r.action === "deleteStop").length;
      const before = removes();
      await page.evaluate(() => document.getElementById("stDel").click());
      assert.equal(await text(page, "#stMsg"), "This stop comes from the planner. Take its row out there and it goes from here.");
      assert.equal(removes(), before);
      assert.equal(await isOpen(page, "stop"), true);
      // Save sends only what is ours.
      await page.click("#stSave");
      await until(async () => !(await isOpen(page, "stop")), "saved");
      assert.deepEqual(Object.keys(backend.requests.filter((r) => r.action === "updateStop").at(-1).args.patch), ["detail"]);
    },
  },
  {
    name: "at 320 wide nothing overflows the printed box or a pencilled row",
    viewport: { width: 320, height: 640 },
    async run({ page }) {
      const long = { ...MUSEUM, title: "A very long made-up name for a museum stop on the west side" };
      const cocoa = { ...COCOA, title: "Hot cocoa and a long made-up walk back along the lake" };
      const backend = await ready(page, { seed: seed({ stops: [long, PIER, cocoa], plan: [PHEAD, prow(long), prow(PIER)] }) });
      await pulled(backend);
      await until(() => page.evaluate((sel) => !!document.querySelector(sel + ".is-pen"), row(COCOA.id)), "the pencilled stop");
      const over = (sel) => page.evaluate((s) => [...document.querySelectorAll(s)].filter((e) => e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().right > innerWidth + 0.5).map((e) => e.className || e.id), sel);
      const cell = await page.evaluate((sel) => { const t = document.querySelector(sel + " .r-t"); return { sw: t.scrollWidth, cw: t.clientWidth, caveat: document.fonts.check("700 20px Caveat"), font: getComputedStyle(t).fontFamily }; }, row(COCOA.id));
      // Under 350px wide the pencilled time is 16px, so it fits the row's 50px time column.
      assert.deepEqual(await over(row(COCOA.id) + ", " + row(COCOA.id) + " *"), [], JSON.stringify(cell));
      assert.equal(await page.evaluate((sel) => getComputedStyle(document.querySelector(sel + " .r-t")).fontSize, row(COCOA.id)), "16px");
      await openEdit(page, MUSEUM.id);
      assert.deepEqual(await over("#stPr, #stPr *"), []);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    },
  },
  {
    name: "with the switch off every screen is as it was",
    async run({ page }) {
      const backend = await ready(page, { seed: seed({ follow: false }) });
      await until(() => page.evaluate((sel) => !!document.querySelector(sel + " .tk-add"), tk), "the add row");
      assert.equal(await text(page, tk + " .tk-add"), "＋ Add a stop");
      assert.equal(await page.evaluate(() => document.querySelectorAll(".r.is-pen, .r-pen").length), 0);
      await openEdit(page, MUSEUM.id);
      assert.deepEqual(await hiddenAll(page, ["stPr", "stOurs", "stPenW"]), [true, true, true]);
      assert.deepEqual(await hiddenAll(page, ["stDay", "stWhat", "stTime", "stFixed", "stDel"]), [false, false, false, false, false]);
      assert.equal(await page.evaluate(() => document.getElementById("stTkRef").disabled), false);
      assert.equal(await page.evaluate(() => document.querySelector("#stTix .tkp-pr").hidden), true);
      await page.click("#stDone");
      await until(async () => !(await isOpen(page, "stop")), "closed");
      await page.dispatchEvent(tk + " .tk-add", "click");
      await waitSheet(page);
      assert.deepEqual([await text(page, "#stHead"), await text(page, "#stSave")], ["Add a stop", "Add stop"]);
      await page.click("#stDone");
      await openYou(page);
      assert.match(await text(page, "#setPlannerS"), /^(Last pulled .*|Not pulled yet)$/);
      assert.deepEqual(await hiddenAll(page, ["setPlanP", "setPlanA"]), [true, true]);
      assert.equal(backend.requests.some((r) => r.action === "syncPlan"), false, "the plan is never asked for");
    },
  },
];
