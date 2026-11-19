// Asking: the one-time line on today's check ("Leave-by times from where you
// are?"), the phone's own prompt only after Use it, and the rules that keep a
// position on the phone. The made-up day of tests/e2e/where-fixture.cjs, Mon
// Dec 28 at 13:52 (the Corner stop next). navigator.geolocation is stood in
// (geostub.cjs). Every name and place here is made up.

const assert = require("node:assert/strict");
const fs = require("fs");
const { open, advance, until, text } = require("./helpers.cjs");
const { geoStub, leaks } = require("./geostub.cjs");
const { whereBackend, clock, D28, ID } = require("./where-fixture.cjs");

const SHOTS = "/private/tmp/claude-501/chi-shots/where";
const shot = async (page, name) => {
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: SHOTS + "/" + name + ".png" });
};
const TODAY = '#rail .pg[data-date="' + D28 + '"]';
const MIN = 60000;

async function ready(page, { nowMs = clock("13:52"), coords = true, storage = {}, backend = null } = {}) {
  const be = backend || whereBackend({ nowMs, coords });
  await open(page, { backend: be, nowMs, tab: "days", storage });
  await until(() => page.evaluate(() => document.querySelectorAll("#rail .pg .tk").length > 0), "the checks draw");
  return be;
}
const choice = (page) => page.evaluate(() => localStorage.getItem("chi.where"));
const calls = (page) => page.evaluate(() => window.__geoCalls.length);
const asks = (page) => page.evaluate(() => document.querySelectorAll("#rail .tk-ask").length);
const askShown = (page) => page.evaluate((sel) => !!document.querySelector(sel + " .tk-ask"), TODAY);
// The two checks every stage 2 file ends with.
async function clean(page, backend) {
  assert.deepEqual(await leaks(page, backend), [], "the phone's position is in no request and no storage");
  assert.equal(await page.evaluate(() => window.__geoWatch), 0, "never watchPosition");
}

const SIZES = [
  { tag: "393x852", viewport: { width: 393, height: 852 } },
  { tag: "320x568", viewport: { width: 320, height: 568 } },
  { tag: "844x390", viewport: { width: 844, height: 390 } },
  { tag: "1440x900", viewport: { width: 1440, height: 900 }, mobile: false },
];

const cases = [
  ...SIZES.map(({ tag, viewport, mobile }) => ({
    name: "the ask on today's check, once, at " + tag,
    viewport,
    ...(mobile === false ? { mobile } : {}),
    async run({ page }) {
      await geoStub(page);
      const backend = await ready(page);
      await until(() => askShown(page), "today's check asks");
      const got = await page.evaluate((sel) => {
        const a = document.querySelector(sel + " .tk-ask");
        const tk = a.closest(".tk").getBoundingClientRect();
        const r = a.getBoundingClientRect();
        const keys = [...a.querySelectorAll(".ask-k button")].map((b) => ({ t: b.textContent, cls: b.className, h: b.getBoundingClientRect().height, l: b.getBoundingClientRect().left, r: b.getBoundingClientRect().right }));
        return {
          html: a.outerHTML,
          last: a.parentElement.classList.contains("tk-head") && a.parentElement.lastElementChild === a,
          keys,
          inside: r.left >= tk.left - 0.5 && r.right <= tk.right + 0.5 && keys.every((k) => k.l >= tk.left - 0.5 && k.r <= tk.right + 0.5),
          sw: document.documentElement.scrollWidth,
          vw: innerWidth,
          align: getComputedStyle(a).textAlign,
        };
      }, TODAY);
      assert.equal(
        got.html,
        '<div class="tk-ask" role="group" aria-label="Leave-by times from where you are?"><div class="ask-m"><span class="g-bl pl" aria-hidden="true">FROM HERE</span></div><b class="ask-q">Leave-by times from where you are?</b><span class="ask-s">Your location stays on this phone.</span><div class="ask-k"><button type="button" class="yes">Use it</button><button type="button" class="no">Not now</button></div></div>',
      );
      assert.equal(got.last, true, "the last thing in the check's heading");
      assert.equal(got.align, "left");
      for (const k of got.keys) assert.ok(k.h >= 44, "a key a finger can hit: " + JSON.stringify(k));
      assert.ok(got.inside && got.sw <= got.vw, JSON.stringify(got));
      // Only today's check asks, no sign is anywhere, and nothing was asked of the phone.
      assert.equal(await asks(page), 1);
      assert.equal(await page.evaluate(() => document.querySelectorAll("#rail .r-here, #rail .g-ow, #vDays .g-pl:not([hidden])").length), 0, "never the ask and a sign together");
      assert.equal(await calls(page), 0);
      await page.evaluate((sel) => document.querySelector(sel + " .tk-ask").scrollIntoView({ block: "center" }), TODAY);
      await shot(page, "ask-" + tag);
      await clean(page, backend);
    },
  })),
  {
    name: "no ask when no stop on today's check has coordinates (a Sheet before migrate), nor on a day with nothing next",
    async run({ page, newPhone }) {
      await geoStub(page);
      const backend = await ready(page, { coords: false });
      await page.waitForTimeout(300);
      assert.equal(await asks(page), 0, "nothing could show from a position");
      await clean(page, backend);
      const late = await newPhone();
      await geoStub(late);
      await ready(late, { nowMs: clock("20:00") });
      await late.waitForTimeout(300);
      assert.equal(await asks(late), 0, "no next stop today");
    },
  },
  {
    name: "a phone with no geolocation: no ask",
    async run({ page }) {
      await geoStub(page, { mode: "none" });
      const backend = await ready(page);
      await page.waitForTimeout(300);
      assert.equal(await asks(page), 0);
      assert.deepEqual(await leaks(page, backend), []);
    },
  },
  {
    name: "Use it asks the phone once; the line is gone for good and focus is on the day counter",
    async run({ page }) {
      await geoStub(page);
      const backend = await ready(page);
      await until(() => askShown(page), "today's check asks");
      await page.focus(TODAY + " .tk-ask .yes");
      await page.keyboard.press("Enter");
      await until(async () => !(await askShown(page)), "the line goes");
      assert.equal(await calls(page), 1);
      assert.deepEqual(await page.evaluate(() => window.__geoCalls[0]), { enableHighAccuracy: false, maximumAge: 120000, timeout: 8000 });
      assert.equal(await choice(page), "on");
      assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), "dayCount");
      await page.reload();
      await until(() => page.evaluate(() => document.querySelectorAll("#rail .pg .tk").length > 0), "the checks draw again");
      await page.waitForTimeout(300);
      assert.equal(await asks(page), 0, "not asked again");
      await clean(page, backend);
    },
  },
  {
    name: "the phone's no is quiet: the line goes, nothing else is said, and it is not asked again",
    async run({ page }) {
      await geoStub(page, { mode: "refused" });
      const backend = await ready(page);
      await until(() => askShown(page), "today's check asks");
      await page.dispatchEvent(TODAY + " .tk-ask .yes", "click");
      await until(async () => (await choice(page)) === "refused", "refused is kept");
      assert.equal(await asks(page), 0);
      await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
      await advance(page, backend, 5 * MIN);
      assert.equal(await calls(page), 1, "asked once only");
      assert.equal(await page.evaluate(() => [...document.querySelectorAll(".ubar")].some((u) => !u.hidden && /location|position/i.test(u.textContent))), false, "no notice");
      await clean(page, backend);
    },
  },
  {
    name: "Not now hides it for good and asks nothing",
    async run({ page }) {
      await geoStub(page);
      const backend = await ready(page);
      await until(() => askShown(page), "today's check asks");
      await page.dispatchEvent(TODAY + " .tk-ask .no", "click");
      await until(async () => !(await askShown(page)), "the line goes");
      assert.equal(await choice(page), "off");
      assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), "dayCount");
      await advance(page, backend, 5 * MIN);
      assert.equal(await calls(page), 0);
      await page.reload();
      await until(() => page.evaluate(() => document.querySelectorAll("#rail .pg .tk").length > 0), "the checks draw again");
      await page.waitForTimeout(300);
      assert.equal(await asks(page), 0);
      await clean(page, backend);
    },
  },
  {
    name: "on: asked at most every 2 minutes while on screen, and never while hidden",
    async run({ page }) {
      await geoStub(page);
      const backend = await ready(page, { storage: { "chi.where": "on" } });
      await until(async () => (await calls(page)) === 1, "asked once on opening");
      await advance(page, backend, 60 * 1000);
      assert.equal(await calls(page), 1, "not again within 2 minutes");
      await advance(page, backend, 61 * 1000);
      await until(async () => (await calls(page)) === 2, "again after 2 minutes");
      await page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await advance(page, backend, 10 * MIN);
      assert.equal(await calls(page), 2, "nothing while hidden");
      await page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await until(async () => (await calls(page)) === 3, "asked again once back on screen");
      await clean(page, backend);
    },
  },
  {
    name: "a redraw of the check's heading while a finger is on Use it: the tap is neither lost nor doubled",
    async run({ page }) {
      await geoStub(page);
      const backend = await ready(page);
      await until(() => askShown(page), "today's check asks");
      await page.evaluate((sel) => document.querySelector(sel + " .tk-ask").scrollIntoView({ block: "center" }), TODAY);
      const b = await page.evaluate((sel) => {
        const r = document.querySelector(sel + " .tk-ask .yes").getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }, TODAY);
      await page.evaluate((sel) => (document.querySelector(sel + " .tk-ask").dataset.mark = "1"), TODAY);
      // The day's title changes on the Sheet: the heading is drawn again under the finger.
      for (const r of backend.fake.tables.Days) if (r.date === D28) r.title = "Test day, renamed";
      await page.mouse.move(b.x, b.y);
      await page.mouse.down();
      await page.evaluate(() => window.__matTest.store.refresh());
      await until(() => page.evaluate((sel) => !!document.querySelector(sel + " .tk-ask") && !document.querySelector(sel + " .tk-ask[data-mark]"), TODAY), "the heading is drawn again under the finger");
      await page.mouse.up();
      await until(async () => (await choice(page)) === "on", "the tap still says yes");
      await page.waitForTimeout(200);
      assert.equal(await calls(page), 1, "asked once, not twice");
      assert.equal(await asks(page), 0);
      await clean(page, backend);
    },
  },
  {
    name: "a refused link takes the trip off: the phone is not asked again and no chi.where or chi.board comes back",
    async run({ page }) {
      await geoStub(page);
      const backend = await ready(page, { storage: { "chi.where": "on", "chi.board": "2026-12-27" } });
      await until(async () => (await calls(page)) === 1, "asked on opening");
      backend.failWith = "bad_key";
      await page.evaluate(() => window.__matTest.store.refresh());
      await until(() => page.evaluate(() => document.querySelectorAll("#rail .pg").length === 0), "the checks are taken out");
      // Settings says yes now and the app comes back on screen: still nothing.
      await page.evaluate(() => window.__geoSet({ permission: "granted" }));
      await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
      await advance(page, backend, 10 * MIN);
      assert.equal(await calls(page), 1, "not asked again");
      const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k === "chi.where" || k === "chi.board"));
      assert.deepEqual(keys, []);
      await clean(page, backend);
    },
  },
  {
    name: "exactly today's: with no usable position the check and the board are byte for byte as with no geolocation at all",
    async run({ page, newPhone }) {
      const snap = (pg) =>
        pg.evaluate(() => {
          const rail = document.querySelector("#rail").cloneNode(true);
          const ask = rail.querySelector(".tk-ask");
          if (ask) ask.remove();
          return { rail: rail.outerHTML, board: document.querySelector("#vDays .brd-wrap").outerHTML, ask: !!ask };
        });
      await geoStub(page, { mode: "none" });
      await ready(page);
      await page.waitForTimeout(400);
      const base = await snap(page);
      assert.equal(base.ask, false);
      assert.ok(base.board.includes("Corner stop"), "the board is up");
      const FAR = { lat: 41.990061, lng: -87.580021 }; // about 10 km north and east of everything
      for (const [tag, stub, storage] of [
        ["off (after Not now)", {}, { "chi.where": "off" }],
        ["refused", { mode: "refused", permission: "denied" }, { "chi.where": "refused" }],
        ["on, no answer", { mode: "silent" }, { "chi.where": "on" }],
        ["on, stale", { ageMs: 200000 }, { "chi.where": "on" }],
        ["on, rough", { accuracy: 400 }, { "chi.where": "on" }],
        ["on, far", FAR, { "chi.where": "on" }],
        ["unset", {}, {}],
      ]) {
        const other = await newPhone();
        await geoStub(other, stub);
        const backend = await ready(other, { storage });
        if (storage["chi.where"] === "on") await until(() => other.evaluate(() => window.__geoCalls.length > 0), "asked: " + tag);
        await other.waitForTimeout(400);
        const got = await snap(other);
        assert.equal(got.ask, tag === "unset", "the ask: " + tag);
        assert.equal(got.rail, base.rail, "the check: " + tag);
        assert.equal(got.board, base.board, "the board: " + tag);
        assert.deepEqual(await leaks(other, backend, stub.lat ? stub : undefined), [], tag);
        assert.equal(await other.evaluate(() => window.__geoWatch), 0);
      }
    },
  },
];

module.exports = cases;
