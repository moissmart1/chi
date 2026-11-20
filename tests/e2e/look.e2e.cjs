// Look C, "The guest check" (phase 2): the three main screens at the four
// sizes the brief names (393x852, 320x568, 844x390 and 1440x900). Each case
// checks the screen is drawn in the guest check's materials, that nothing
// runs sideways, that no word is cut inside its box, and that what matters
// is clear of the bottom bar.

const assert = require("node:assert/strict");
const { WITH_PLAN, NOON28, makeBackend, open, until, text } = require("./helpers.cjs");

// Seven day stamps over the fixture week, at made-up Chicago places, and the placemat's own.
const PLACES = ["Midway", "Millennium Park", "West Loop", "The Loop", "Uptown", "The River", "O’Hare"];
const DEFS = [
  ...PLACES.map((place, i) => ({ id: "c" + (i + 1), date: "2026-12-" + (26 + i <= 31 ? 26 + i : "") , name_ja: "", name_en: place, place, motif: "", ink: ["shu", "ai", "matsu"][i % 3], shape: "round" })),
  { id: "iss", date: "", name_ja: "", name_en: "Issued", place: "", motif: "crest", ink: "shu", shape: "round" },
];
DEFS[6].date = "2027-01-01";

const SIZES = [
  { name: "393x852", viewport: { width: 393, height: 852 } },
  { name: "320x568", viewport: { width: 320, height: 568 } },
  { name: "844x390", viewport: { width: 844, height: 390 } },
  { name: "1440x900", viewport: { width: 1440, height: 900 }, mobile: false },
];

// No sideways scroll on the page or in the screens.
const noSideways = (page) => page.evaluate(() => {
  const out = [];
  if (document.documentElement.scrollWidth > innerWidth) out.push("page " + document.documentElement.scrollWidth);
  for (const v of document.querySelectorAll(".view.is-active")) if (v.scrollWidth > v.clientWidth + 1) out.push(v.id + " " + v.scrollWidth);
  return out;
});

// Text cut inside its own box (wider than the box, with the overflow hidden).
const cutText = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s)]
  .filter((n) => n.getClientRects().length && n.scrollWidth > n.clientWidth + 1)
  .map((n) => n.textContent.trim()), sel);

const cases = [];
for (const size of SIZES) {
  cases.push({
    name: "Days at " + size.name + ": today as a guest check",
    viewport: size.viewport,
    mobile: size.mobile,
    async run({ page }) {
      await open(page, { seed: WITH_PLAN, nowMs: NOON28, tab: "days" });
      await until(() => page.evaluate(() => document.querySelectorAll("#rail .tk").length === 7), "the checks draw");
      const t = '#rail .pg[data-date="2026-12-28"] .tk';
      await until(async () => (await text(page, t + " .gc-t")) !== null, "today's check");
      assert.match(await text(page, t + " .gc-t"), /^Guest Check/);
      // The check's paper, its brown rules and the slab face of its printed words.
      const look = await page.evaluate((sel) => {
        const tk = document.querySelector(sel);
        const cs = (el) => getComputedStyle(el);
        return {
          paper: cs(tk).backgroundColor,
          rule: cs(tk.querySelector(".gc-box")).borderBottomColor,
          slab: cs(tk.querySelector(".gc-t")).fontFamily,
          // The linen counter: on the phone, or held sideways on the page around it.
          ground: [document.getElementById("phone"), document.documentElement].map((n) => cs(n).backgroundColor).find((c) => c !== "rgba(0, 0, 0, 0)"),
          body: cs(document.body).fontFamily,
        };
      }, t);
      assert.equal(look.paper, "rgb(251, 245, 227)");
      assert.equal(look.rule, "rgb(122, 85, 48)");
      assert.match(look.slab, /Zilla Slab/);
      assert.equal(look.ground, "rgb(233, 225, 206)");
      assert.match(look.body, /^"Libre Franklin"/);
      assert.deepEqual(await noSideways(page), []);
      assert.deepEqual(await cutText(page, t + " .gc-box b"), [], "no box's value is cut");
      // The top line: the date of the day in view, large, then its count.
      assert.equal(await text(page, ".bar-d"), "Mon Dec 28");
    },
  });
}

for (const size of SIZES) {
  cases.push({
    name: "Money at " + size.name + ": the week's tab as a guest check, its settling at its foot",
    viewport: size.viewport,
    mobile: size.mobile,
    async run({ page }) {
      await open(page, { seed: WITH_PLAN, nowMs: NOON28, tab: "money" });
      await until(() => page.evaluate(() => !!document.querySelector("#slip .s-row") && !!document.querySelector("#rc .rc-row")), "the tab draws");
      await until(async () => (await text(page, "#rc .gc-t")) === "Guest CheckThe whole week", "the tab's heading");
      assert.equal(await text(page, "#rc .gc-box"), "Date12/26 onTable2Guests2ServerBothNo.TAB");
      assert.equal(await text(page, "#vMoney .money-bar"), "The tab");
      // The tab comes first and the settling is its foot, on the same paper.
      const order = await page.evaluate(() => {
        const rc = document.getElementById("rc").getBoundingClientRect();
        const slip = document.getElementById("slip").getBoundingClientRect();
        return { joined: Math.abs(slip.top - rc.bottom) < 1, paper: getComputedStyle(document.getElementById("slip")).backgroundColor };
      });
      assert.equal(order.joined, true, "the slip continues the tab");
      assert.equal(order.paper, "rgb(251, 245, 227)");
      assert.equal(await text(page, "#slip .ghost"), "PAID");
      assert.deepEqual(await noSideways(page), []);
      assert.deepEqual(await cutText(page, "#rc .gc-box b, #rc .rc-amt, #slip .s-amt"), [], "no figure is cut");
    },
  });
}

for (const size of SIZES) {
  cases.push({
    name: "the placemat at " + size.name + ": the souvenir map, a spot a day where it is, and the legend",
    viewport: size.viewport,
    mobile: size.mobile,
    async run({ page }) {
      const backend = makeBackend(WITH_PLAN, { now: NOON28 });
      for (const d of DEFS) backend.fake.tables.StampDefs.push({ ...d });
      await open(page, { backend, nowMs: NOON28, tab: "days" });
      await until(() => page.evaluate(() => { const b = document.getElementById("stampBtn"); return b && !b.hidden; }), "the Placemat pill");
      await page.click("#stampBtn");
      await until(() => page.evaluate(() => {
        const b = document.getElementById("book");
        return b.classList.contains("is-open") && Math.abs(b.getBoundingClientRect().bottom - document.getElementById("phone").getBoundingClientRect().bottom) < 1;
      }), "the placemat opens");
      assert.equal(await text(page, ".bk-title"), "Placemat");
      assert.ok((await page.locator("#bookMap").innerHTML()).includes("Souvenir of Chicago"));
      const spots = await page.evaluate(() => {
        const map = document.getElementById("bookPage").getBoundingClientRect();
        return [...document.querySelectorAll("#bookGrid .bk-cell .bk-well")].map((w) => {
          const r = w.getBoundingClientRect();
          return { id: w.parentElement.dataset.def, x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, inside: r.left >= map.left - 1 && r.right <= map.right + 1 && r.top >= map.top - 1 && r.bottom <= map.bottom + 1 };
        });
      });
      assert.equal(spots.length, 8);
      for (const s of spots) assert.ok(s.inside, "on the map: " + JSON.stringify(s));
      for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) {
        assert.ok(Math.hypot(spots[i].x - spots[j].x, spots[i].y - spots[j].y) >= spots[i].w, spots[i].id + " and " + spots[j].id + " overlap");
      }
      // Today's spot says today in red, and its line in the legend says to stamp it.
      assert.equal(await text(page, '#bookGrid .bk-cell[data-def="c3"] .bk-ghost'), "today");
      assert.equal(await text(page, '#bookLeg .bk-row[data-def="c3"] em'), "Stamp it today");
      assert.equal(await text(page, '#bookGrid .bk-cell[data-def="c3"] .bk-cap'), "West Loop");
      assert.deepEqual(await noSideways(page), []);
      assert.equal(await page.evaluate(() => document.getElementById("bookScroll").scrollWidth <= document.getElementById("bookScroll").clientWidth + 1), true);
      // A tap on today's line in the legend presses today's stamp, as its spot does.
      await page.click('#bookLeg .bk-row[data-def="c3"]');
      await until(() => page.evaluate(() => !!document.querySelector('#bookGrid .bk-cell[data-def="c3"] .bk-st')), "pressed from the legend");
      assert.match(await text(page, '#bookLeg .bk-row[data-def="c3"] em'), /^Stamped \d\d:\d\d$/);
    },
  });
}

cases.push({
  name: "the tab goes on the spindle when the last debt is stamped, and Undo takes it off",
  async run({ page }) {
    await open(page, { seed: WITH_PLAN, nowMs: NOON28, tab: "money" });
    await until(() => page.evaluate(() => !!document.querySelector("#slip .spot[data-key]")), "an open debt");
    const spiked = () => page.evaluate(() => document.getElementById("rc").classList.contains("is-spiked"));
    assert.equal(await spiked(), false);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("#rc .rc-spike svg")).display), "none", "a dashed spot, no spike yet");
    for (;;) {
      const key = await page.evaluate(() => { const b = document.querySelector("#slip .spot[data-key]"); return b ? b.dataset.key : null; });
      if (!key) break;
      const sel = '#slip .spot[data-key="' + key + '"]';
      await page.click(sel);
      await until(() => page.evaluate((s) => !!document.querySelector(s + ".is-armed"), sel), "armed");
      await page.click(sel);
      await until(() => page.evaluate((s) => !document.querySelector(s), sel), "stamped");
    }
    await until(spiked, "on the spindle");
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("#rc .rc-spike svg")).display), "block", "the spike shows");
    assert.ok((await page.evaluate(() => document.querySelector("#slip .stamp").innerHTML)).includes(">PAID<"), "the PAID print");
    await page.click("#ubarU");
    await until(async () => !(await spiked()), "Undo takes it off the spindle");
    assert.equal(await page.locator("#slip .spot[data-key]").count() > 0, true, "the debt is open again");
  },
});

module.exports = cases;
