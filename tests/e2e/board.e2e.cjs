// The board at the top of Days (look G, green street-sign blades on a pole):
// before the trip the days to go; on a trip day the next stop, its time and
// when to leave, from the plan's own minutes (stage 1: no position is used).
// It can be closed for the day and is back the next trip day (only the date it
// was closed on is kept, as chi.board). On any day or state with nothing to
// say there is no board. Held at 393x852, 320x568, 844x390 and 1440x900.
// Every name and place here is made up (tests/e2e/where-fixture.cjs).

const assert = require("node:assert/strict");
const fs = require("fs");
const { open, advance, until, text, expectText, visible } = require("./helpers.cjs");
const { SEED_WHERE, whereBackend, clock, D28 } = require("./where-fixture.cjs");
const { geoStub, leaks } = require("./geostub.cjs");

const SHOTS = "/private/tmp/claude-501/chi-shots/where";
const MIN = 60000;
const BEFORE = Date.parse("2026-11-19T12:00:00-06:00"); // 37 days before the first day

async function ready(page, { nowMs = clock("08:00"), seed = SEED_WHERE, storage = {}, backend = null } = {}) {
  const be = backend || whereBackend({ nowMs, seed });
  await open(page, { backend: be, nowMs, tab: "days", storage });
  await until(() => page.evaluate(() => document.querySelectorAll("#rail .pg .tk").length > 0), "the tickets draw");
  return be;
}
const boardUp = (page) => visible(page, "#vDays .brd");
const lines = (page) =>
  page.evaluate(() => {
    const brd = document.querySelector("#vDays .brd");
    const q = (s) => {
      const n = brd.querySelector(s);
      return n && !n.hidden && !n.closest("[hidden]") ? n.textContent : null;
    };
    const lv = brd.querySelector(".g-lv");
    const kids = lv && !lv.hidden ? [...lv.children].map((d) => (d.hidden ? null : [d.querySelector("small").textContent, d.querySelector("b").textContent])) : null;
    return { kind: brd.dataset.kind, tone: brd.dataset.tone || null, nameSmall: q(".g-nm small"), name: q(".g-nm b"), noSmall: q(".g-no small"), no: q(".g-no b"), l: kids && kids[0], r: kids && kids[1] };
  });
const shot = async (page, name) => {
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.evaluate(() => (document.getElementById("vDays").scrollTop = 0));
  await page.waitForTimeout(350); // the fold has finished
  await page.screenshot({ path: SHOTS + "/" + name + ".png" });
};

// The board is inside the screen and the Days column, as wide as the check, with a 44 px close, and nothing sticks out.
const fits = (page) =>
  page.evaluate(() => {
    const bad = [];
    if (document.documentElement.scrollWidth > innerWidth) bad.push("sideways scroll");
    const view = document.getElementById("vDays");
    if (view.scrollWidth > view.clientWidth) bad.push("Days scrolls sideways");
    const brd = document.querySelector("#vDays .brd");
    const b = brd.getBoundingClientRect();
    const v = view.getBoundingClientRect();
    const bar = document.querySelector("#vDays .bar").getBoundingClientRect();
    if (b.left < v.left - 0.5 || b.right > v.right + 0.5) bad.push("the board leaves Days");
    if (b.bottom > bar.top + 14) bad.push("the board is over the top line");
    const x = brd.querySelector(".brd-x").getBoundingClientRect();
    if (x.width < 43.5 || x.height < 43.5) bad.push("the close is " + Math.round(x.width) + "x" + Math.round(x.height));
    if (x.right > b.right + 0.5) bad.push("the close leaves the board");
    for (const s of [".g-top", ".g-lv"]) {
      const n = brd.querySelector(s);
      if (!n || n.hidden) continue;
      const r = n.getBoundingClientRect();
      if (r.right > b.right + 0.5 || r.left < b.left - 0.5) bad.push(s + " leaves the board");
      for (const kid of n.querySelectorAll("small, b")) {
        const k = kid.getBoundingClientRect();
        if (kid.closest("[hidden]")) continue;
        if (k.right > r.right + 0.5) bad.push(s + " words run off the blade");
      }
    }
    return bad;
  });

function sizeCase(size, mobile, tag) {
  return {
    name: tag + ": the board fits before the trip and on a trip day",
    viewport: size,
    ...(mobile ? {} : { mobile: false }),
    async run({ page, newPhone }) {
      await ready(page, { nowMs: BEFORE });
      await until(() => boardUp(page), "the board shows before the trip");
      assert.deepEqual(await fits(page), []);
      await shot(page, "board-" + tag + "-before");
      const other = await newPhone();
      await other.setViewportSize(size);
      await ready(other, { nowMs: clock("13:52") });
      await until(() => boardUp(other), "the board shows on a trip day");
      assert.deepEqual(await fits(other), []);
      await shot(other, "board-" + tag + "-trip");
    },
  };
}

// The worked day of the brief, no position.
const WORKED = [
  ["08:00", "Pier stop", "10:00", "hon", ["Leave by", "09:40"], ["In", "1 h 40 min"]],
  ["09:45", "Pier stop", "10:00", "tow", ["By 09:40", "Leave now"], null],
  ["10:10", "Pier stop", "10:00", "hon", ["On", "Now"], null],
  ["10:31", "Corner stop", "14:30", "hon", ["Leave by", "14:05"], ["In", "3 h 34 min"]],
  ["13:52", "Corner stop", "14:30", "hon", ["Leave by", "14:05"], ["In", "13 min"]],
  ["15:00", "Harbor stop", "19:30", "hon", ["Starts in", "4 h 30 min"], null],
];

module.exports = [
  {
    name: "before the trip: one green blade, the first day and the days to go, and nothing else",
    async run({ page }) {
      await ready(page, { nowMs: BEFORE });
      await until(() => boardUp(page), "the board shows");
      assert.deepEqual(await lines(page), { kind: "before", tone: null, nameSmall: "First day · Sat Dec 26", name: "37 days to go", noSmall: null, no: null, l: null, r: null });
      // It sits above the date line, before the rail.
      const order = await page.evaluate(() => [...document.getElementById("vDays").children].filter((n) => !n.hidden).map((n) => n.className.split(" ")[0]));
      assert.deepEqual(order, ["brd-wrap", "bar", "rail"]);
      await shot(page, "board-before");
    },
  },
  {
    name: "the day before the first day: 1 day to go",
    async run({ page }) {
      await ready(page, { nowMs: Date.parse("2026-12-25T12:00:00-06:00") });
      await until(() => boardUp(page), "the board shows");
      assert.equal((await lines(page)).name, "1 day to go");
    },
  },
  ...WORKED.map(([clk, name, time, tone, l, r]) => ({
    name: "a trip day at " + clk + ": " + name + ", " + tone,
    async run({ page }) {
      await ready(page, { nowMs: clock(clk) });
      await until(() => boardUp(page), "the board shows");
      assert.deepEqual(await lines(page), { kind: "trip", tone, nameSmall: "Next stop", name, noSmall: "At", no: time, l, r });
      const names = { "08:00": "leave", "09:45": "now", "10:10": "on", "15:00": "starts" };
      if (names[clk]) await shot(page, "board-" + names[clk]);
    },
  })),
  {
    name: "with no position the board never turns red, and its strings are plain case (the CSS prints them in capitals)",
    async run({ page }) {
      await ready(page, { nowMs: clock("13:52") });
      await until(() => boardUp(page), "the board shows");
      const got = await page.evaluate(() => {
        const lv = document.querySelector("#vDays .g-lv");
        return { cls: lv.className, up: getComputedStyle(lv).textTransform, name: document.querySelector("#vDays .g-nm b").textContent };
      });
      assert.equal(got.up, "uppercase");
      assert.equal(got.name, "Corner stop");
      assert.equal(/\bred\b/.test(got.cls), false);
      assert.equal(await page.evaluate(() => document.querySelector("#vDays .g-pl").hidden), true, "no plate in stage 1");
    },
  },
  {
    name: "the minute changes the words in place: the same nodes, no redraw",
    async run({ page }) {
      const backend = await ready(page, { nowMs: clock("13:52") });
      await until(() => boardUp(page), "the board shows");
      const node = await page.evaluateHandle(() => document.querySelector("#vDays .g-lv b"));
      const brd = await page.evaluateHandle(() => document.querySelector("#vDays .brd"));
      await advance(page, backend, 3 * MIN);
      await expectText(page, "#vDays .g-lv>div:last-child b", "10 min");
      assert.equal(await page.evaluate(([n, b]) => n === document.querySelector("#vDays .g-lv b") && b === document.querySelector("#vDays .brd"), [node, brd]), true, "the same nodes");
      await advance(page, backend, 12 * MIN); // 14:07: leave now
      await until(async () => (await lines(page)).l[1] === "Leave now", "leave now");
      assert.equal((await lines(page)).tone, "tow");
      assert.equal((await lines(page)).r, null);
      assert.equal(await page.evaluate(([n]) => n === document.querySelector("#vDays .g-lv b"), [node]), true);
    },
  },
  {
    name: "no board: after the last timed stop, after the trip, on a day with no stops, before the plan has loaded",
    async run({ page, newPhone }) {
      await ready(page, { nowMs: clock("20:00") });
      await page.waitForTimeout(300);
      assert.equal(await boardUp(page), false, "no timed stop left today");
      const over = await newPhone();
      await ready(over, { nowMs: Date.parse("2027-01-02T10:00:00-06:00") });
      await over.waitForTimeout(300);
      assert.equal(await boardUp(over), false, "after the trip");
      const quiet = await newPhone();
      await ready(quiet, { nowMs: Date.parse("2026-12-29T10:00:00-06:00") });
      await quiet.waitForTimeout(300);
      assert.equal(await boardUp(quiet), false, "a day with no stops");
      // Before anything has loaded: no key to ask with, so nothing to draw.
      const cold = await newPhone();
      const dead = whereBackend({ nowMs: clock("08:00") });
      dead.failWith = "network";
      await open(cold, { backend: dead, nowMs: clock("08:00"), tab: "days" });
      await cold.waitForTimeout(500);
      assert.equal(await boardUp(cold), false, "the plan has not loaded");
    },
  },
  {
    name: "closing: × folds it away for today, it stays closed after a reload, and only the date it was closed on is kept",
    async run({ page }) {
      await ready(page, { nowMs: clock("13:52") });
      await until(() => boardUp(page), "the board shows");
      const before = await page.evaluate(() => Object.keys(localStorage).sort());
      assert.equal(before.includes("chi.board"), false, "nothing kept until it is closed");
      await page.dispatchEvent("#vDays .brd-x", "click");
      await until(async () => !(await boardUp(page)), "the board folds away");
      await until(() => page.evaluate(() => document.querySelector("#vDays .brd-wrap").hidden), "and is out of the page");
      const kept = await page.evaluate(() => ({ keys: Object.keys(localStorage).sort(), board: localStorage.getItem("chi.board") }));
      assert.equal(kept.board, D28);
      assert.deepEqual(kept.keys.filter((k) => !before.includes(k)), ["chi.board"], "one new key, and it is chi.board");
      await shot(page, "board-closed");
      await page.reload();
      await until(() => page.evaluate(() => document.querySelectorAll("#rail .pg .tk").length > 0), "the tickets draw again");
      await page.waitForTimeout(400);
      assert.equal(await boardUp(page), false, "still closed after a reload");
    },
  },
  {
    name: "closed until tomorrow: it is back when the trip's day turns over; another date kept shows",
    async run({ page, newPhone }) {
      const seed = { ...SEED_WHERE, stops: [...SEED_WHERE.stops, { id: "wherestop08", date: "2026-12-29", time: "09:00", title: "Morning stop" }] };
      const backend = await ready(page, { nowMs: clock("23:20"), seed, storage: { "chi.board": D28 } });
      await page.waitForTimeout(200);
      assert.equal(await boardUp(page), false, "nothing next tonight");
      await advance(page, backend, 55 * MIN); // 00:15 on the 29th
      await until(() => boardUp(page), "the 29th: the board is back");
      assert.equal((await lines(page)).name, "Morning stop");
      await page.dispatchEvent("#vDays .brd-x", "click");
      assert.equal(await page.evaluate(() => localStorage.getItem("chi.board")), "2026-12-29");
      const other = await newPhone();
      await ready(other, { nowMs: clock("08:00"), storage: { "chi.board": "2026-12-27" } });
      await until(() => boardUp(other), "yesterday's close does not hold today");
      const odd = await newPhone();
      await ready(odd, { nowMs: clock("08:00"), storage: { "chi.board": "20261228" } });
      await until(() => boardUp(odd), "something else kept does not close it");
    },
  },
  {
    name: "a closed board is not in the tab order, and closing leaves focus on the day counter",
    async run({ page }) {
      await ready(page, { nowMs: clock("13:52") });
      await until(() => boardUp(page), "the board shows");
      assert.equal(await page.evaluate(() => document.querySelector("#vDays .brd-wrap").inert), false);
      await page.focus("#vDays .brd-x");
      await page.keyboard.press("Enter");
      await until(async () => !(await boardUp(page)), "closed from the keyboard");
      assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), "dayCount");
      assert.equal(await page.evaluate(() => document.querySelector("#vDays .brd-wrap").inert), true);
    },
  },
  {
    name: "reduced motion: no fold, it is simply there and simply gone",
    async run({ page }) {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await ready(page, { nowMs: clock("13:52") });
      await until(() => boardUp(page), "the board shows");
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("#vDays .brd-wrap")).transitionDuration), "0s");
      await page.dispatchEvent("#vDays .brd-x", "click");
      await until(async () => !(await boardUp(page)), "gone at once");
      assert.equal(await page.evaluate(() => document.querySelector("#vDays .brd-wrap").hidden), true);
    },
  },
  {
    name: "with motion the board folds in 200 ms",
    async run({ page }) {
      await ready(page, { nowMs: clock("13:52") });
      await until(() => boardUp(page), "the board shows");
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("#vDays .brd-wrap")).transitionDuration), "0.2s");
    },
  },
  {
    name: "what people wrote is only ever text: markup in a stop's name is printed as written",
    async run({ page }) {
      const seed = { ...SEED_WHERE, stops: SEED_WHERE.stops.map((s) => (s.title === "Corner stop" ? { ...s, title: "<b>Corner</b> <img src=x onerror=alert(1)>" } : s)) };
      await ready(page, { nowMs: clock("13:52"), seed });
      await until(() => boardUp(page), "the board shows");
      assert.equal(await text(page, "#vDays .g-nm b"), "<b>Corner</b> <img src=x onerror=alert(1)>");
      assert.equal(await page.$("#vDays .brd img"), null);
      assert.equal(await page.$("#vDays .g-nm b b"), null);
    },
  },
  {
    name: "a long name takes two lines on the board and is then cut, inside the blade, at 320",
    viewport: { width: 320, height: 568 },
    async run({ page }) {
      const long = "A very long name for a place that no sign painter would ever fit on one blade of a board";
      const seed = { ...SEED_WHERE, stops: SEED_WHERE.stops.map((s) => (s.title === "Corner stop" ? { ...s, title: long } : s)) };
      await ready(page, { nowMs: clock("13:52"), seed });
      await until(() => boardUp(page), "the board shows");
      assert.deepEqual(await fits(page), []);
      const one = await page.evaluate(() => {
        const n = document.querySelector("#vDays .g-nm b");
        const lh = parseFloat(getComputedStyle(n).lineHeight);
        return { h: n.getBoundingClientRect().height, lh, clipped: n.scrollHeight > n.clientHeight + 1 };
      });
      assert.ok(one.h <= one.lh * 2 + 1, "two lines at most: " + JSON.stringify(one));
      assert.equal(one.clipped, true);
      await shot(page, "board-320-long");
    },
  },
  {
    name: "the board closed: Days is as it was without it, and the first check is not pushed down",
    async run({ page }) {
      await ready(page, { nowMs: clock("13:52"), storage: { "chi.board": D28 } });
      await page.waitForTimeout(300);
      assert.equal(await boardUp(page), false);
      assert.deepEqual(await page.evaluate(() => [...document.getElementById("vDays").children].filter((n) => !n.hidden).map((n) => n.className.split(" ")[0])), ["bar", "rail"]);
    },
  },
  // Stage 2: from where the phone is (the Corner stop is 0.5 mi south of the stood-in phone).
  ...[
    ["13:52", "hon", ["Leave by", "14:18"], ["In", "26 min"]],
    ["14:15", "tow", ["By 14:18", "Leave now"], ["To spare", "3 min"]],
    ["14:24", "red", ["About", "6 min late"], ["Leave", "Now"]],
  ].map(([clk, tone, l, r]) => ({
    name: "from where the phone is at " + clk + ": the plate and the " + tone + " blade",
    async run({ page }) {
      await geoStub(page);
      const backend = await ready(page, { nowMs: clock(clk), storage: { "chi.where": "on" } });
      await until(async () => (await lines(page)).tone === tone && !(await page.evaluate(() => document.querySelector("#vDays .g-pl").hidden)), "the board reads the position");
      assert.deepEqual(await lines(page), { kind: "trip", tone, nameSmall: "Next stop", name: "Corner stop", noSmall: "At", no: "14:30", l, r });
      assert.equal(
        await page.evaluate(() => document.querySelector("#vDays .g-pl").innerHTML),
        '<span class="g-bl" role="img" aria-label="4 blocks south"><b>4</b>BLOCKS<i>S</i></span><span class="dist">0.5 mi · 12 min walk</span>',
      );
      assert.deepEqual(await fits(page), []);
      await shot(page, "board-plate-" + tone);
      assert.deepEqual(await leaks(page, backend), []);
      assert.equal(await page.evaluate(() => window.__geoWatch), 0);
    },
  })),
  {
    name: "the plate keeps its nodes while the minutes pass, and goes when the position does",
    async run({ page }) {
      await geoStub(page);
      const backend = await ready(page, { nowMs: clock("13:52"), storage: { "chi.where": "on" } });
      await until(() => page.evaluate(() => !document.querySelector("#vDays .g-pl").hidden), "the plate shows");
      const sign = await page.evaluateHandle(() => document.querySelector("#vDays .g-pl .g-bl"));
      await advance(page, backend, MIN);
      await until(async () => (await lines(page)).r[1] === "25 min", "the minute passes");
      assert.equal(await page.evaluate((n) => n === document.querySelector("#vDays .g-pl .g-bl"), sign), true, "the same sign");
      await page.evaluate(() => window.__geoSet({ mode: "silent" }));
      await advance(page, backend, 3 * MIN); // 13:56: the last answer is 4 minutes old
      await until(() => page.evaluate(() => document.querySelector("#vDays .g-pl").hidden), "the plate goes");
      assert.equal(await page.evaluate(() => document.querySelector("#vDays .g-pl").childElementCount), 0);
      assert.deepEqual((await lines(page)).l, ["Leave by", "14:05"]);
      assert.deepEqual(await leaks(page, backend), []);
      assert.equal(await page.evaluate(() => window.__geoWatch), 0);
    },
  },
  sizeCase({ width: 393, height: 852 }, true, "393x852"),
  sizeCase({ width: 320, height: 568 }, true, "320x568"),
  sizeCase({ width: 844, height: 390 }, true, "844x390"),
  sizeCase({ width: 1440, height: 900 }, false, "1440x900"),
];
