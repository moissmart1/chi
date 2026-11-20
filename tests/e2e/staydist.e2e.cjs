// The hotel card, how far: with a usable position and the stay on the map,
// within 50 km along the grid, one line after the note (or "Please take me
// here.") and before the keys: the small green sign and "1.4 mi from here".
// Otherwise nothing is added. While the card is open it looks again every 15
// seconds, so the line goes once the position is no longer usable. The
// made-up stay of tests/e2e/where-fixture.cjs, Test lodge, 2,250 m north of
// the stood-in phone. Every name and place here is made up.

const assert = require("node:assert/strict");
const fs = require("fs");
const { open, advance, until } = require("./helpers.cjs");
const { geoStub, leaks } = require("./geostub.cjs");
const { whereBackend, clock, D28, P, off } = require("./where-fixture.cjs");

const SHOTS = "/private/tmp/claude-501/chi-shots/where";
const shot = async (page, name) => {
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: SHOTS + "/" + name + ".png" });
};
const TODAY = '#rail .pg[data-date="' + D28 + '"]';
const MIN = 60000;

async function ready(page, { storage = { "chi.where": "on" }, coords = true } = {}) {
  const nowMs = clock("13:52");
  const be = whereBackend({ nowMs, coords });
  await open(page, { backend: be, nowMs, tab: "days", storage });
  await until(() => page.evaluate(() => document.querySelectorAll("#rail .pg .tk").length > 0), "the checks draw");
  return be;
}
async function openCard(page) {
  await page.evaluate((sel) => document.querySelector(sel + " .tk-stay").click(), TODAY);
  await until(() => page.evaluate(() => document.getElementById("stay").classList.contains("is-open")), "the hotel card opens");
  // Risen all the way (it slides up in real time), for the pictures.
  await until(() => page.evaluate(() => getComputedStyle(document.getElementById("stay")).transform === "none" || Math.abs(document.getElementById("stay").getBoundingClientRect().bottom - innerHeight) < 1), "the hotel card has risen", 3000);
}
async function clean(page, backend, pos) {
  assert.deepEqual(await leaks(page, backend, pos, { latOnly: !!pos }), [], "the phone's position is in no request and no storage");
  assert.equal(await page.evaluate(() => window.__geoWatch), 0, "never watchPosition");
}
const line = (page) => page.evaluate(() => {
  const d = document.querySelector("#stayBody .sy-dist");
  return d ? d.outerHTML : null;
});
const LINE = '<div class="sy-dist"><span class="g-bl" role="img" aria-label="11 blocks north"><b>11</b>BLOCKS<i>N</i></span><span class="dist">1.4 mi from here</span></div>';

module.exports = [
  {
    name: "the line and its sign, after Please take me here and before the keys",
    async run({ page }) {
      await geoStub(page);
      const backend = await ready(page);
      await until(() => page.evaluate(() => window.__geoCalls.length > 0), "asked");
      await openCard(page);
      await until(async () => (await line(page)) === LINE, "the line shows");
      const order = await page.evaluate(() => [...document.getElementById("stayBody").children].map((n) => n.className));
      const i = order.indexOf("sy-dist");
      assert.equal(order[i - 1], "sy-ask");
      assert.equal(order[i + 1], "r-btns");
      await shot(page, "stay-with-line");
      await clean(page, backend);
    },
  },
  ...[
    ["off", {}, { "chi.where": "off" }],
    ["refused", { mode: "refused", permission: "denied" }, { "chi.where": "refused" }],
    ["no answer", { mode: "silent" }, { "chi.where": "on" }],
    ["stale", { ageMs: 200000 }, { "chi.where": "on" }],
    ["rough", { accuracy: 400 }, { "chi.where": "on" }],
    ["no geolocation", { mode: "none" }, { "chi.where": "on" }],
  ].map(([tag, stub, storage]) => ({
    name: "no line when the position is " + tag,
    async run({ page }) {
      await geoStub(page, stub);
      const backend = await ready(page, { storage });
      await openCard(page);
      await page.waitForTimeout(300);
      assert.equal(await line(page), null);
      if (tag === "off") await shot(page, "stay-without-line");
      await clean(page, backend);
    },
  })),
  {
    name: "no line when the stay is not on the map",
    async run({ page }) {
      await geoStub(page);
      const backend = await ready(page, { coords: false });
      await until(() => page.evaluate(() => window.__geoCalls.length > 0), "asked");
      await openCard(page);
      await page.waitForTimeout(300);
      assert.equal(await line(page), null);
      await clean(page, backend);
    },
  },
  {
    name: "30 miles still says so, past 16 blocks the sign holds only the letter; over 50 km says nothing",
    async run({ page, newPhone }) {
      const far = off(P, 2250 - 48000, 37);
      await geoStub(page, far);
      const backend = await ready(page);
      await until(() => page.evaluate(() => window.__geoCalls.length > 0), "asked");
      await openCard(page);
      await until(() => line(page), "the line shows");
      assert.equal(await line(page), '<div class="sy-dist"><span class="g-bl far" role="img" aria-label="north"><i>N</i></span><span class="dist">30 mi from here</span></div>');
      await clean(page, backend, far);
      const away = off(P, 2250 - 51000, 37);
      const other = await newPhone();
      await geoStub(other, away);
      const b2 = await ready(other);
      await until(() => other.evaluate(() => window.__geoCalls.length > 0), "asked");
      await openCard(other);
      await other.waitForTimeout(300);
      assert.equal(await line(other), null);
      await clean(other, b2, away);
    },
  },
  {
    name: "the line goes once the position is stale, and the keys keep their nodes and focus",
    async run({ page }) {
      await geoStub(page);
      const backend = await ready(page);
      await until(() => page.evaluate(() => window.__geoCalls.length > 0), "asked");
      await openCard(page);
      await until(async () => (await line(page)) === LINE, "the line shows");
      await page.focus("#stayBody .r-btns a");
      const key = await page.evaluateHandle(() => document.querySelector("#stayBody .r-btns a"));
      await page.evaluate(() => window.__geoSet({ mode: "silent" }));
      await advance(page, backend, 3 * MIN + 20000);
      await until(async () => (await line(page)) === null, "the line goes");
      assert.equal(await page.evaluate((k) => k === document.querySelector("#stayBody .r-btns a") && document.activeElement === k, key), true);
      await clean(page, backend);
    },
  },
];
