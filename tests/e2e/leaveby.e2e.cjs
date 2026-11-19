// Leave-by from where you are: on today's next stop, within a mile along the
// grid, a small green sign (blocks and the compass letter), the miles and the
// walk, and the leave line worked out from the walk (on time, cutting it
// close, late in red). Every case without a usable position, or with the stop
// too far, has today's line. The made-up day of tests/e2e/where-fixture.cjs:
// the Corner stop at 14:30 is 0.5 mi south of the stood-in phone (4 blocks,
// 12 min). Every name and place here is made up.

const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { open, advance, until, text } = require("./helpers.cjs");
const { geoStub, leaks, HERE } = require("./geostub.cjs");
const { whereBackend, clock, D28, ID, SEED_WHERE, P, off } = require("./where-fixture.cjs");

const TODAY = '#rail .pg[data-date="' + D28 + '"]';
const ROW = TODAY + ' .r[data-id="' + ID.B + '"]';
const MIN = 60000;

async function ready(page, { nowMs = clock("13:52"), coords = true, storage = { "chi.where": "on" }, seed = SEED_WHERE } = {}) {
  const be = whereBackend({ nowMs, coords, seed });
  await open(page, { backend: be, nowMs, tab: "days", storage });
  await until(() => page.evaluate(() => document.querySelectorAll("#rail .pg .tk").length > 0), "the checks draw");
  return be;
}
async function clean(page, backend) {
  assert.deepEqual(await leaks(page, backend), [], "the phone's position is in no request and no storage");
  assert.equal(await page.evaluate(() => window.__geoWatch), 0, "never watchPosition");
}
// The next stop's row: its leave line, its class, and the sign line's markup.
const next = (page) =>
  page.evaluate((sel) => {
    const r = document.querySelector(sel);
    const lv = r.querySelector(".r-lv");
    const h = r.querySelector(".r-here");
    return { lead: lv ? lv.textContent : null, lvCls: lv ? lv.className : null, here: h ? h.outerHTML : null, hasHere: r.classList.contains("has-here") };
  }, ROW);
const SIGN = '<div class="r-here"><span class="g-bl" role="img" aria-label="4 blocks south"><b>4</b>BLOCKS<i>S</i></span><span class="dist">0.5 mi · 12 min walk</span></div>';
const signed = (page) => until(async () => (await next(page)).hasHere, "the next stop has its sign");

// Today's line at 13:52, with no position: from the plan's own 25 minutes.
const TODAYS = { lead: "Leave by 14:05, in 13 min.", lvCls: "r-lv", here: null, hasHere: false };

const cases = [
  {
    name: "on time: the sign, the walk, and leave by from the walk",
    async run({ page }) {
      await geoStub(page);
      const backend = await ready(page);
      await signed(page);
      assert.deepEqual(await next(page), { lead: "Leave by 14:18, in 26 min.", lvCls: "r-lv", here: SIGN, hasHere: true });
      // The sign line sits in the name's column, after the name and before the leave line.
      const order = await page.evaluate((sel) => [...document.querySelector(sel + " .r-b").children].map((n) => n.className), ROW);
      assert.deepEqual(order, ["r-n", "r-here", "r-s"]);
      // The price column's rule is a short tick.
      assert.equal(await page.evaluate((sel) => getComputedStyle(document.querySelector(sel + " > .r-j")).height, ROW), "38px");
      await clean(page, backend);
    },
  },
  {
    name: "cutting it close, then late in red, as the minutes pass, in the same nodes",
    async run({ page }) {
      await geoStub(page);
      const backend = await ready(page, { nowMs: clock("14:15") });
      await signed(page);
      assert.equal((await next(page)).lead, "Leave now. 3 min to spare.");
      const nodes = await page.evaluateHandle((sel) => [document.querySelector(sel), document.querySelector(sel + " .r-lv")], ROW);
      await advance(page, backend, 3 * MIN); // 14:18
      await until(async () => (await next(page)).lead === "Leave now.", "leave now");
      await advance(page, backend, 6 * MIN); // 14:24
      await until(async () => (await next(page)).lead === "About 6 min late. Leave now.", "late");
      const got = await next(page);
      assert.equal(got.lvCls, "r-lv is-late");
      assert.equal(await page.evaluate((sel) => getComputedStyle(document.querySelector(sel + " .r-lv")).color, ROW), "rgb(194, 54, 43)", "red");
      assert.equal(await page.evaluate(([n, sel]) => n[0] === document.querySelector(sel) && n[1] === document.querySelector(sel + " .r-lv"), [nodes, ROW]), true, "the same row and the same line");
      await advance(page, backend, 6 * MIN); // 14:30: started
      await until(async () => (await next(page)).lead === "Now.", "today's Now. once it has started");
      assert.equal((await next(page)).hasHere, false);
      await clean(page, backend);
    },
  },
  ...[
    ["off", { mode: "granted" }, { "chi.where": "off" }],
    ["refused", { mode: "refused", permission: "denied" }, { "chi.where": "refused" }],
    ["no answer", { mode: "silent" }, { "chi.where": "on" }],
    ["stale", { ageMs: 200000 }, { "chi.where": "on" }],
    ["rough", { accuracy: 400 }, { "chi.where": "on" }],
    ["over a mile", { ...off(P, -2500, 0) }, { "chi.where": "on" }],
    ["no geolocation", { mode: "none" }, { "chi.where": "on" }],
  ].map(([tag, stub, storage]) => ({
    name: "today's line when the position is " + tag,
    async run({ page }) {
      await geoStub(page, stub);
      const backend = await ready(page, { storage });
      await page.waitForTimeout(300);
      assert.deepEqual(await next(page), TODAYS);
      if (stub.lat) assert.deepEqual(await leaks(page, backend, stub, { latOnly: true }), []);
      await clean(page, backend);
    },
  })),
  {
    name: "today's line when the next stop is not on the map",
    async run({ page }) {
      await geoStub(page);
      const backend = await ready(page, { coords: false });
      await until(() => page.evaluate(() => window.__geoCalls.length > 0), "the phone was asked");
      await page.waitForTimeout(200);
      assert.deepEqual(await next(page), TODAYS);
      await clean(page, backend);
    },
  },
  {
    name: "the position going away (stale) puts today's line back within the minute",
    async run({ page }) {
      await geoStub(page);
      const backend = await ready(page);
      await signed(page);
      await page.evaluate(() => window.__geoSet({ mode: "silent" }));
      await advance(page, backend, 4 * MIN); // 13:56: the last answer is 4 minutes old
      await until(async () => (await next(page)).lead === "Leave by 14:05, in 9 min.", "today's line is back");
      assert.equal((await next(page)).hasHere, false);
      await clean(page, backend);
    },
  },
  {
    name: "the phone moves 100 m: the open stop stays open, its photo and node and the focused key are the same",
    async run({ page, context }) {
      const png = fs.readFileSync(path.join(__dirname, "..", "..", "icons", "icon-180.png"));
      await context.route("https://example.test/corner.png", (route) => route.fulfill({ status: 200, contentType: "image/png", body: png }));
      const seed = { ...SEED_WHERE, stops: SEED_WHERE.stops.map((s) => (s.id === ID.B ? { ...s, photo: "https://example.test/corner.png" } : s)) };
      await geoStub(page);
      const backend = await ready(page, { seed });
      await signed(page);
      await until(() => page.evaluate((sel) => document.querySelector(sel).classList.contains("is-open") && document.querySelector(sel + " img.r-ph").naturalWidth > 0, ROW), "the next stop is open, its photo shown");
      await page.focus(ROW + " a.r-map");
      const before = await page.evaluateHandle((sel) => [document.querySelector(sel), document.querySelector(sel + " img.r-ph"), document.querySelector(sel + " .r-lv")], ROW);
      await page.evaluate((p) => window.__geoSet({ lat: p.lat - 100 / 111195, lng: p.lng }), HERE);
      await advance(page, backend, 2 * MIN);
      await until(async () => (await next(page)).lead === "Leave by 14:19, in 25 min.", "the line follows the phone");
      const same = await page.evaluate(
        ([b, sel]) => ({
          row: b[0] === document.querySelector(sel),
          img: !!b[1] && b[1] === document.querySelector(sel + " img.r-ph"),
          lv: b[2] === document.querySelector(sel + " .r-lv"),
          open: document.querySelector(sel).classList.contains("is-open"),
          focus: document.activeElement === document.querySelector(sel + " a.r-map"),
        }),
        [before, ROW],
      );
      assert.deepEqual(same, { row: true, img: true, lv: true, open: true, focus: true });
      assert.match((await next(page)).here, /0\.4 mi · 11 min walk/);
      await clean(page, backend);
    },
  },
  {
    name: "a stop row drawn again while a finger is on it (its sign comes): it opens once",
    async run({ page }) {
      await geoStub(page, { mode: "silent" });
      const backend = await ready(page, { storage: { "chi.where": "on" } });
      await until(() => page.evaluate(() => window.__geoCalls.length === 1), "asked on opening; no answer");
      // The next answer will come under the finger: its sign makes the next stop's row (the Corner stop) new.
      const corner = ROW;
      await page.evaluate((sel) => document.querySelector(sel).scrollIntoView({ block: "center" }), corner);
      await page.evaluate((sel) => (document.querySelector(sel).dataset.mark = "1"), corner);
      await page.evaluate(() => window.__geoSet({ mode: "granted" }));
      const b = await page.evaluate((sel) => {
        const r = document.querySelector(sel + " .r-b").getBoundingClientRect();
        return { x: r.left + 20, y: r.top + r.height / 2 };
      }, corner);
      await page.mouse.move(b.x, b.y);
      await page.mouse.down();
      await advance(page, backend, 2 * MIN);
      await until(() => page.evaluate((sel) => !!document.querySelector(sel + " .r-here") && !document.querySelector(sel + "[data-mark]"), corner), "the row is drawn again with its sign under the finger");
      const wasOpen = await page.evaluate((sel) => document.querySelector(sel).classList.contains("is-open"), corner);
      await page.mouse.up();
      await page.waitForTimeout(300);
      assert.equal(await page.evaluate((sel) => document.querySelector(sel).classList.contains("is-open"), corner), !wasOpen, "the tap toggled it, once");
      await clean(page, backend);
    },
  },
];

module.exports = cases;
