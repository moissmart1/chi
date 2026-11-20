// The stamp pressed in the place: pressed with a usable position within a
// mile (straight line) of that day's place or of one of that day's stops on
// the map, the press carries here: true and nothing else about where; the
// stamp's caption becomes a small green sign and, held up, it reads "pressed
// in <place>". Elsewhere, or with no usable position: no mark, nothing said,
// and the request has no here. The made-up day of tests/e2e/where-fixture.cjs
// (the day itself at the stood-in phone) with made-up stamps. Every name and
// place here is made up.

const assert = require("node:assert/strict");
const fs = require("fs");
const { open, until, text, advance } = require("./helpers.cjs");
const { geoStub, leaks } = require("./geostub.cjs");
const { whereBackend, clock, D28, P, off } = require("./where-fixture.cjs");

const SHOTS = "/private/tmp/claude-501/chi-shots/where";
const shot = async (page, name) => {
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: SHOTS + "/" + name + ".png" });
};
const KEY = "test-key";
const DAY = "pl28";
const DEFS = [
  { id: "pl27", date: "2026-12-27", name_ja: "", name_en: "Yesterday stamp", place: "Old quarter", motif: "lamp", ink: "ai", shape: "round" },
  { id: DAY, date: D28, name_ja: "", name_en: "Test stamp", place: "Test quarter", motif: "tower", ink: "shu", shape: "round" },
  { id: "iss", date: "", name_ja: "", name_en: "Issued", place: "", motif: "crest", ink: "shu", shape: "round" },
];
const NOW = clock("13:52");

async function ready(page, { storage = { "chi.where": "on" }, dayAt = P, backend = null } = {}) {
  const be = backend || whereBackend({ nowMs: NOW });
  for (const d of DEFS) be.fake.tables.StampDefs.push({ ...d });
  for (const r of be.fake.tables.Days) if (r.date === D28) Object.assign(r, { lat: String(dayAt.lat), lng: String(dayAt.lng) });
  await open(page, { backend: be, nowMs: NOW, tab: "days", storage });
  await until(() => page.evaluate(() => document.querySelectorAll("#rail .tk").length > 0), "the checks draw");
  return be;
}
const asked = (page) => until(() => page.evaluate(() => window.__geoCalls.length > 0), "the phone was asked");
async function openBook(page) {
  await page.click("#stampBtn");
  await until(() => page.evaluate(() => {
    const b = document.getElementById("book");
    return b.classList.contains("is-open") && Math.abs(b.getBoundingClientRect().bottom - innerHeight) < 1;
  }), "the placemat opens");
}
const cell = (id) => '#bookGrid .bk-cell[data-def="' + id + '"]';
const idle = (page) => page.evaluate(() => globalThis.__matTest.store.idle());
const presses = (be) => be.requests.filter((r) => r.action === "pressStamp").map((r) => r.args);
async function pressAndHold(page, id) {
  await page.click(cell(id));
  await until(() => page.evaluate((s) => !!document.querySelector(s + " .bk-st"), cell(id)), "the stamp is drawn");
  await idle(page);
}
// The caption, the ring's name for a screen reader, and the held-up words.
const caption = (page, id) => page.evaluate((s) => {
  const c = document.querySelector(s + " .bk-cap");
  return { cls: c.className, html: c.innerHTML, label: document.querySelector(s).getAttribute("aria-label") };
}, cell(id));
async function heldUp(page, id, be = null) {
  // A tap just after a press is not a hold (two quick taps press once).
  if (be) await advance(page, be, 3000);
  await page.click(cell(id));
  await until(() => page.locator("#book .bk-look").count().then((n) => n === 1), "held up");
  const inLine = await page.evaluate(() => {
    const i = document.querySelector("#book .bk-lt i.bk-in");
    return i ? i.outerHTML : null;
  });
  return inLine;
}
async function clean(page, backend, pos) {
  assert.deepEqual(await leaks(page, backend, pos, { latOnly: !!pos }), [], "the phone's position is in no request and no storage");
  assert.equal(await page.evaluate(() => window.__geoWatch), 0, "never watchPosition");
}

const MARKED = '<span class="g-bl pl g-cap" aria-hidden="true">';
const IN_LINE = '<i class="bk-in"><span class="g-bl pl" aria-hidden="true">Test quarter</span>pressed in Test quarter</i>';

module.exports = [
  {
    name: "pressed within a mile of the day's place: here: true and nothing else; the sign caption and the held-up line",
    async run({ page }) {
      await geoStub(page);
      const be = await ready(page);
      await asked(page);
      await page.waitForTimeout(200);
      await openBook(page);
      const plain = await caption(page, DAY);
      await pressAndHold(page, DAY);
      assert.deepEqual(presses(be).map((a) => Object.keys(a).sort()), [["at", "def", "here", "seed"]]);
      assert.equal(presses(be)[0].here, true);
      const got = await caption(page, DAY);
      assert.equal(got.cls, "bk-cap is-here");
      assert.equal(got.html, MARKED + plain.html + "</span>", "the same words as before, on a sign");
      assert.equal(got.label, "Dec 28, Test stamp, stamped, pressed in the place. Hold it up.");
      assert.equal(await page.evaluate((s) => getComputedStyle(document.querySelector(s + " .g-cap")).textTransform, cell(DAY)), "uppercase");
      await shot(page, "stamp-marked");
      assert.equal(await heldUp(page, DAY, be), IN_LINE);
      await shot(page, "stamp-marked-held");
      await clean(page, be);
    },
  },
  {
    name: "within a mile of one of the day's stops but not of the day's place: the same mark",
    async run({ page }) {
      await geoStub(page);
      const be = await ready(page, { dayAt: off(P, 9000, 0) });
      await asked(page);
      await page.waitForTimeout(200);
      await openBook(page);
      await pressAndHold(page, DAY);
      assert.equal(presses(be)[0].here, true);
      assert.equal((await caption(page, DAY)).cls, "bk-cap is-here");
      await clean(page, be);
    },
  },
  ...[
    ["elsewhere (10 km away)", { lat: 41.990061, lng: -87.580021 }, { "chi.where": "on" }],
    ["off", {}, { "chi.where": "off" }],
    ["stale", { ageMs: 200000 }, { "chi.where": "on" }],
    ["rough", { accuracy: 400 }, { "chi.where": "on" }],
  ].map(([tag, stub, storage], i) => ({
    name: "pressed " + tag + ": no mark, and the request has no here",
    async run({ page }) {
      await geoStub(page, stub);
      const be = await ready(page, { storage });
      if (storage["chi.where"] === "on") await asked(page);
      await page.waitForTimeout(200);
      await openBook(page);
      const plain = await caption(page, DAY);
      await pressAndHold(page, DAY);
      assert.equal(presses(be).length, 1, "the press is never held up");
      assert.equal("here" in presses(be)[0], false);
      const got = await caption(page, DAY);
      assert.equal(got.cls, "bk-cap");
      assert.equal(got.html, plain.html);
      assert.equal(got.label, "Dec 28, Test stamp, stamped. Hold it up.");
      if (i === 1) await shot(page, "stamp-unmarked");
      assert.equal(await heldUp(page, DAY, be), null);
      if (i === 1) await shot(page, "stamp-unmarked-held");
      await clean(page, be, stub.lat ? stub : undefined);
    },
  })),
  {
    name: "the placemat's own stamp never carries the mark",
    async run({ page }) {
      await geoStub(page);
      const be = await ready(page);
      await asked(page);
      await page.waitForTimeout(200);
      await openBook(page);
      await pressAndHold(page, "iss");
      assert.equal("here" in presses(be)[0], false);
      assert.equal(await heldUp(page, "iss", be), null);
      await clean(page, be);
    },
  },
  {
    name: "another phone shows the mark after its load; undo in History lifts the stamp as before",
    async run({ page }) {
      const be = whereBackend({ nowMs: NOW });
      for (const d of DEFS) be.fake.tables.StampDefs.push({ ...d });
      assert.equal((await be.fake({ key: KEY, actor: "Mo", action: "pressStamp", args: { def: DAY, at: new Date(NOW - 600000).toISOString(), seed: 4242, here: true } })).ok, true);
      be.fake.tables.StampDefs.length = 0;
      await geoStub(page, { mode: "none" });
      await ready(page, { backend: be });
      await openBook(page);
      assert.equal((await caption(page, DAY)).cls, "bk-cap is-here", "marked, from the Sheet");
      await page.click("#bookDone");
      await page.click("#youBtn");
      await page.click("#setHist");
      await until(() => page.locator("#tape .tp-row button.tp-undo").count().then((n) => n >= 1), "the tape shows");
      await page.click("#tape .tp-row button.tp-undo");
      await until(() => page.locator("#tape .tp-row.is-undone").count().then((n) => n === 1), "undone");
      await page.click("#histDone");
      await openBook(page);
      assert.equal(await page.locator(cell(DAY) + " .bk-ghost").count(), 1, "the ring is empty");
      assert.ok((await text(page, cell(DAY) + " .bk-cap")).endsWith("Test quarter"));
      assert.equal(await page.evaluate((s) => document.querySelector(s + " .bk-cap").className, cell(DAY)), "bk-cap");
      assert.deepEqual(await leaks(page, be), []);
    },
  },
];
