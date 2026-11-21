// The nearest stop: on today's check, each stop with no time that is on the
// map and within 3,000 m along the grid gets the small green sign and its
// miles and walk; the nearest of two or more gets the NEAREST sign above its
// name. The order of the stops never changes. The made-up day of
// tests/e2e/where-fixture.cjs at 13:52: Loose one 320 m east, Loose two 160 m
// north (the nearest), Loose three 600 m north and 200 m west, Unmapped stop
// with no coordinates. Every name and place here is made up.

const assert = require("node:assert/strict");
const fs = require("fs");
const { open, advance, until } = require("./helpers.cjs");
const { geoStub, leaks, HERE } = require("./geostub.cjs");
const { whereBackend, clock, D28, ID, P, off } = require("./where-fixture.cjs");

const SHOTS = "/private/tmp/claude-501/chi-shots/where";
const shot = async (page, name) => {
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: SHOTS + "/" + name + ".png" });
};
const TODAY = '#rail .pg[data-date="' + D28 + '"]';
const row = (id) => TODAY + ' .r[data-id="' + id + '"]';
const MIN = 60000;

async function ready(page, { nowMs = clock("13:52"), storage = { "chi.where": "on" } } = {}) {
  const be = whereBackend({ nowMs });
  await open(page, { backend: be, nowMs, tab: "days", storage });
  await until(() => page.evaluate(() => document.querySelectorAll("#rail .pg .tk").length > 0), "the checks draw");
  return be;
}
async function clean(page, backend) {
  assert.deepEqual(await leaks(page, backend), [], "the phone's position is in no request and no storage");
  assert.equal(await page.evaluate(() => window.__geoWatch), 0, "never watchPosition");
}
// Each of today's rows: its id, whether NEAREST heads its name, and its sign line.
const rows = (page) =>
  page.evaluate((sel) =>
    [...document.querySelectorAll(sel + " .r[data-id]")].map((r) => {
      const n = r.querySelector(".r-n");
      const h = r.querySelector(".r-here");
      return { id: r.dataset.id, nearest: !!n && !!n.firstElementChild && n.firstElementChild.matches("svg.g-ow"), here: h ? h.outerHTML : null };
    }), TODAY);
const signs = (page) => until(() => page.evaluate((sel) => document.querySelectorAll(sel + " .r-here").length >= 4, TODAY), "today's signs are drawn");
const here = (blocks, word, letter, dist) =>
  '<div class="r-here"><span class="g-bl" role="img" aria-label="' + blocks + " " + (blocks === 1 ? "block" : "blocks") + " " + word + '"><b>' + blocks + "</b>" + (blocks === 1 ? "BLOCK" : "BLOCKS") + "<i>" + letter + '</i></span><span class="dist">' + dist + "</span></div>";

const ORDER = [ID.A, ID.B, ID.C, ID.L1, ID.L2, ID.L3, ID.NONE];

const SIZES = [
  { tag: "393x852", viewport: { width: 393, height: 852 } },
  { tag: "320x568", viewport: { width: 320, height: 568 } },
  { tag: "844x390", viewport: { width: 844, height: 390 } },
  { tag: "1440x900", viewport: { width: 1440, height: 900 }, mobile: false },
];

module.exports = [
  {
    name: "loose stops get their signs, the nearest gets NEAREST, and the order is kept",
    async run({ page }) {
      await geoStub(page);
      const backend = await ready(page);
      await signs(page);
      const got = await rows(page);
      assert.deepEqual(got.map((r) => r.id), ORDER, "the order never changes");
      const by = Object.fromEntries(got.map((r) => [r.id, r]));
      assert.equal(by[ID.L1].here, here(2, "east", "E", "0.2 mi · 5 min walk"));
      assert.equal(by[ID.L2].here, here(1, "north", "N", "0.1 mi · 3 min walk"));
      assert.equal(by[ID.L3].here, here(4, "north", "N", "0.5 mi · 12 min walk"));
      assert.equal(by[ID.NONE].here, null, "not on the map: no sign");
      assert.equal(by[ID.A].here, null, "a timed stop that is not next: no sign");
      assert.equal(by[ID.C].here, null);
      assert.deepEqual(got.filter((r) => r.nearest).map((r) => r.id), [ID.L2]);
      // NEAREST: the sign, then the name, on its own line above it.
      const n = await page.evaluate((sel) => {
        const nn = document.querySelector(sel + " .r-n");
        const svg = nn.firstElementChild;
        return { svg: svg.outerHTML.includes('aria-label="Nearest"') && svg.getAttribute("role") === "img", text: nn.textContent, below: svg.getBoundingClientRect().bottom <= nn.getBoundingClientRect().bottom - 10 };
      }, row(ID.L2));
      assert.deepEqual(n, { svg: true, text: "NEARESTLoose two", below: true });
      await clean(page, backend);
    },
  },
  {
    name: "off, refused, far: the same rows as with no geolocation at all",
    async run({ page, newPhone }) {
      await geoStub(page, { mode: "none" });
      await ready(page);
      await page.waitForTimeout(300);
      const base = await page.evaluate((sel) => document.querySelector(sel + " .rows").outerHTML, TODAY);
      for (const [tag, stub, storage] of [
        ["off", {}, { "chi.where": "off" }],
        ["refused", { mode: "refused", permission: "denied" }, { "chi.where": "refused" }],
        ["far", { ...off(P, 9000, 9000) }, { "chi.where": "on" }],
      ]) {
        const other = await newPhone();
        await geoStub(other, stub);
        const backend = await ready(other, { storage });
        if (tag === "far") await until(() => other.evaluate(() => window.__geoCalls.length > 0), "asked");
        await other.waitForTimeout(300);
        assert.equal(await other.evaluate((sel) => document.querySelector(sel + " .rows").outerHTML, TODAY), base, tag);
        assert.deepEqual(await leaks(other, backend, stub.lat ? stub : HERE, { latOnly: !!stub.lat }), []);
        assert.equal(await other.evaluate(() => window.__geoWatch), 0);
      }
    },
  },
  {
    name: "the phone moves: the numbers and NEAREST follow; an open stop stays open in the same node",
    async run({ page }) {
      await geoStub(page);
      const backend = await ready(page);
      await signs(page);
      await page.click(row(ID.L3) + " .r-b");
      await until(() => page.evaluate((sel) => document.querySelector(sel).classList.contains("is-open"), row(ID.L3)), "Loose three is open");
      const node = await page.evaluateHandle((sel) => document.querySelector(sel), row(ID.L3));
      const moving = await page.evaluateHandle((sels) => sels.map(s => document.querySelector(s)), [row(ID.L1), row(ID.L2)]);
      await page.focus(row(ID.L2) + " .r-b");
      // 300 m east: Loose one is now the nearest.
      await page.evaluate((p) => window.__geoSet({ lat: p.lat, lng: p.lng + 300 / (111195 * Math.cos((p.lat * Math.PI) / 180)) }), HERE);
      await advance(page, backend, 2 * MIN);
      await until(async () => (await rows(page)).find((r) => r.nearest)?.id === ID.L1, "NEAREST moves to Loose one");
      const got = await rows(page);
      assert.deepEqual(got.map((r) => r.id), ORDER);
      assert.equal(await moving.evaluate(nodes => nodes.every(n => n.isConnected)), true, "both rows keep their nodes");
      assert.equal(await page.locator(row(ID.L2) + " .r-b").evaluate(n => n === document.activeElement), true, "focus stays on the old nearest stop");
      const l3 = got.find((r) => r.id === ID.L3).here;
      assert.match(l3, /0\.7 mi · 16 min walk/, l3);
      assert.equal(await page.evaluate(([n, sel]) => n === document.querySelector(sel) && n.classList.contains("is-open"), [node, row(ID.L3)]), true, "the same node, still open");
      await clean(page, backend);
    },
  },
  {
    name: "another day's check: no sign and no NEAREST",
    async run({ page }) {
      await geoStub(page);
      const backend = await ready(page);
      await signs(page);
      assert.equal(await page.evaluate((sel) => [...document.querySelectorAll("#rail .r-here, #rail .g-ow")].filter((n) => !n.closest(sel)).length, TODAY), 0);
      await clean(page, backend);
    },
  },
  ...SIZES.map(({ tag, viewport, mobile }) => ({
    name: "today's check with its signs fits at " + tag,
    viewport,
    ...(mobile === false ? { mobile } : {}),
    async run({ page }) {
      await geoStub(page);
      const backend = await ready(page);
      await signs(page);
      await page.evaluate((sel) => document.querySelector(sel).scrollIntoView({ block: "start" }), row(ID.B));
      const bad = await page.evaluate((sel) => {
        const out = [];
        if (document.documentElement.scrollWidth > innerWidth) out.push("sideways scroll");
        const tk = document.querySelector(sel + " .tk").getBoundingClientRect();
        for (const h of document.querySelectorAll(sel + " .r-here, " + sel + " .g-ow")) {
          // What is drawn: the sign and the words (the line's own box reaches across the price column, as the stapled stub's does).
          for (const k of h.matches("svg") ? [h] : h.querySelectorAll("*")) {
            const r = k.getBoundingClientRect();
            if (r.left < tk.left - 0.5 || r.right > tk.right + 0.5) out.push("leaves the check: " + (k.className.baseVal ?? k.className));
          }
          // The price column's rule (its left edge) never crosses the sign or the words.
          const j = h.closest(".r").querySelector(".r-j").getBoundingClientRect();
          if (h.classList.contains("r-here")) {
            for (const k of h.children) {
              const r = k.getBoundingClientRect();
              // The words' box starts a few pixels above the letters.
              if (r.right > j.left && r.left < j.left + 1 && r.bottom > j.top + 0.5 && r.top + 3 < j.bottom) out.push("the price column's rule crosses " + k.className);
            }
          }
        }
        return out;
      }, TODAY);
      assert.deepEqual(bad, []);
      await shot(page, "check-signs-" + tag);
      await clean(page, backend);
    },
  })),
  {
    name: "the same check with location off, beside it on (pictures for Mo)",
    async run({ page, newPhone }) {
      await geoStub(page);
      await ready(page);
      await signs(page);
      await page.evaluate((sel) => document.querySelector(sel).scrollIntoView({ block: "start" }), row(ID.B));
      await shot(page, "check-on");
      const offPhone = await newPhone();
      await geoStub(offPhone);
      await ready(offPhone, { storage: { "chi.where": "off" } });
      await offPhone.waitForTimeout(300);
      await offPhone.evaluate((sel) => document.querySelector(sel).scrollIntoView({ block: "start" }), row(ID.B));
      await shot(offPhone, "check-off");
    },
  },
];
