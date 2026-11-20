/* Copyright (c) 2026 moissmart1. All rights reserved. No licence is granted: do not copy, adapt or reuse this code or design, and do not use it to train or prompt an AI system to reproduce it. See LICENSE. */
// Small effects, in look C's materials (phase 2): paper lies flat on the
// counter with a soft shadow, the counter has its dot grid, the current day's
// square is filled, the register's display has an inset edge, keys have an
// edge and travel, a stamp that has just landed is wet, checks are ruled, and
// nothing costs scrolling (no backdrop filter, no CSS filter inside a list).
// Every item and name here is made up.

const assert = require("node:assert/strict");
const { SEED, WITH_PLAN, NOON28, makeBackend, open, advance, until, visible } = require("./helpers.cjs");

// 13:20 on Mon Dec 28 in Chicago, Day 3 of the trip.
const DAY3 = NOON28;

// The Days screen over a plan. No planner is linked here, and the Before list has no screen yet: no Before tab.
async function daysReady(page) {
  const backend = makeBackend(WITH_PLAN, { now: DAY3 });
  await open(page, { backend, nowMs: DAY3, tab: "days" });
  await until(() => page.evaluate(() => document.querySelectorAll("#rail .tk").length > 0), "the tickets draw");
  assert.equal(await page.locator("#beforeBtn").count(), 0, "no Before tab");
  return backend;
}

async function moneyReady(page, opts = {}) {
  const backend = await open(page, { seed: SEED, nowMs: NOON28, ...opts });
  await until(() => page.evaluate(() => document.querySelectorAll("#rc .rc-row").length > 0), "the receipt draws");
  await until(() => page.evaluate(() => document.querySelectorAll("#slip .spot").length > 0), "the slip draws");
  return backend;
}

// How many layers a computed box-shadow has: every layer has exactly one colour, and a computed colour is rgb( or rgba(.
const layers = (v) => (String(v).match(/rgba?\(/g) || []).length;
const style = (page, sel, pseudo = null) => page.evaluate(([s, p]) => {
  const c = getComputedStyle(document.querySelector(s), p);
  return { shadow: c.boxShadow, bg: c.backgroundImage, filter: c.filter, backdrop: c.backdropFilter, content: c.content, width: c.width, pos: c.position, anim: c.animationName, transform: c.transform };
}, [sel, pseudo]);

module.exports = [
  {
    name: "paper lies flat on the counter: a check has the thin edge and the soft shadow under it, no grain; the day stubs too",
    async run({ page }) {
      await daysReady(page);
      const tk = await style(page, "#rail .tk");
      assert.equal(layers(tk.shadow), 2, "check: " + tk.shadow);
      assert.doesNotMatch(tk.bg, /url\(/, "no grain or pattern on the check");
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("#rail .tk")).backgroundColor), "rgb(238, 244, 228)");
      // The fan motion is still on the check where the browser has it.
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("#rail .tk")).animationName !== undefined), true);
      // The all-days stubs.
      await page.click("#dayCount");
      await until(() => visible(page, ".ad-row"), "the all-days list shows");
      const ad = await style(page, ".ad-row");
      assert.equal(layers(ad.shadow), 2, "day stub: " + ad.shadow);
      assert.doesNotMatch(ad.bg, /url\(/);
    },
  },
  {
    name: "the tab and its settling, the History tape and the hotel card are check paper lying flat",
    async run({ page }) {
      await moneyReady(page);
      const paper = (sel) => page.evaluate((s) => getComputedStyle(document.querySelector(s)).backgroundColor, sel);
      const slip = await style(page, ".slip");
      assert.equal(layers(slip.shadow), 2, "settling: " + slip.shadow);
      assert.equal(await paper(".slip"), "rgb(238, 244, 228)");
      const rc = await style(page, ".rc");
      assert.ok(layers(rc.shadow) >= 1, "tab: " + rc.shadow);
      assert.equal(await paper(".rc"), "rgb(238, 244, 228)");
      // The tab is a guest check, not a till roll: no serrated edges.
      for (const p of ["::before", "::after"]) assert.equal((await style(page, ".rc", p)).content, "none", "no serration " + p);
      // History tape.
      await page.click("#youBtn");
      await until(() => visible(page, "#setHist"), "Settings opens");
      await page.click("#setHist");
      await until(() => visible(page, "#tape"), "the tape shows");
      const tape = await style(page, "#tape");
      assert.equal(layers(tape.shadow), 2, "tape: " + tape.shadow);
      assert.equal(await paper("#tape"), "rgb(238, 244, 228)");
    },
  },
  {
    name: "the hotel card is check paper with its weight",
    async run({ page }) {
      await daysReady(page);
      await page.click("#rail .tk-stay");
      await until(() => page.evaluate(() => document.getElementById("stay").classList.contains("is-open")), "the hotel card opens");
      const s = await style(page, "#stay");
      assert.ok(layers(s.shadow) >= 2, "hotel card: " + s.shadow);
      assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById("stay")).backgroundColor), "rgb(238, 244, 228)");
    },
  },
  {
    name: "the counter's dot grid sits behind the screens, not on the content, and does not scroll",
    async run({ page }) {
      await moneyReady(page);
      const phone = await style(page, "#phone");
      assert.match(phone.bg, /radial-gradient/, "the phone has the lamp");
      for (const sel of ["#vMoney", "#vDays", ".slip"]) {
        const s = await style(page, sel);
        assert.doesNotMatch(s.bg, /radial-gradient/, sel + " has no lamp of its own, so it does not scroll");
      }
      // A sheet is opaque ground: the lamp is not over it.
      const sheet = await page.evaluate(() => getComputedStyle(document.querySelector(".sheet")).backgroundImage);
      assert.doesNotMatch(sheet, /radial-gradient/);
    },
  },
  {
    name: "the current day's square is filled in ink and larger; a used day's in green; no square has a shadow",
    async run({ page }) {
      await daysReady(page);
      const sq = await page.evaluate(() => [...document.querySelectorAll("#pager .sq")].map((b) => { const c = getComputedStyle(b, "::before"); return [b.classList.contains("is-cur"), b.classList.contains("is-done"), c.backgroundColor, c.transform, c.boxShadow, getComputedStyle(b).boxShadow]; }));
      assert.ok(sq.length >= 3);
      assert.equal(sq.filter((s) => s[0]).length, 1, "one current square");
      for (const [cur, done, bg, transform, before, own] of sq) {
        assert.equal(own, "none");
        assert.equal(before, "none");
        if (cur) {
          assert.equal(bg, "rgb(19, 38, 31)");
          assert.notEqual(transform, "none", "the current square is larger");
        } else if (done) assert.equal(bg, "rgb(46, 122, 87)");
      }
    },
  },
  {
    name: "the register's display: an inset edge, and the amount in the time clock's face with its shadow",
    async run({ page }) {
      await moneyReady(page);
      await page.click("#ring");
      await until(() => page.evaluate(() => document.getElementById("reg").classList.contains("is-open")), "the register opens");
      const lcd = await style(page, ".lcd");
      assert.match(lcd.shadow, /inset/, "an inset layer: " + lcd.shadow);
      assert.match(lcd.bg, /linear-gradient/, "the top sheen");
      const amt = await page.evaluate(() => { const c = getComputedStyle(document.getElementById("xAmt")); return [c.textShadow, c.fontFamily]; });
      assert.match(amt[0], /1\.5px 1\.5px/, "the amount's shadow: " + amt[0]);
      assert.match(amt[1], /^"?VT323/, amt[1]);
    },
  },
  {
    name: "keys have an edge and move down 1.5 px when pressed, without moving their neighbours; the main key is paper with a paper edge",
    async run({ page }) {
      await moneyReady(page);
      await page.click("#ring");
      await until(() => page.evaluate(() => document.getElementById("reg").classList.contains("is-open")), "the register opens");
      await until(() => page.evaluate(() => getComputedStyle(document.getElementById("reg")).transform === "none" || /matrix\(1, 0, 0, 1, 0, 0\)/.test(getComputedStyle(document.getElementById("reg")).transform)), "the register has settled");
      const rects = () => page.evaluate(() => [...document.querySelectorAll("#pad .key")].map((k) => { const r = k.getBoundingClientRect(); return [Math.round(r.x * 10) / 10, Math.round(r.y * 10) / 10, Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10]; }));
      const key = await style(page, '.key[data-k="5"]');
      assert.match(key.shadow, /inset/, "an inset layer: " + key.shadow);
      assert.ok(layers(key.shadow) >= 3);
      assert.equal(key.transform, "none");
      const go = await style(page, "#kGo");
      assert.ok(layers(go.shadow) >= 3 && /inset/.test(go.shadow), "main key edge: " + go.shadow);
      const chip = await style(page, "#xQuick .chip");
      assert.match(chip.shadow, /inset/, "chip: " + chip.shadow);
      const before = await rects();
      const box = await (await page.$('.key[data-k="5"]')).boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await until(async () => (await style(page, '.key[data-k="5"]')).transform === "matrix(1, 0, 0, 1, 0, 1.5)", "the key moves down 1.5 px");
      const pressed = await style(page, '.key[data-k="5"]');
      assert.notEqual(pressed.shadow, key.shadow, "the pressed edge differs");
      const during = await rects();
      before.forEach((r, i) => {
        if (i !== 5) assert.deepEqual(during[i], r, "a neighbour did not move (key " + i + ")");
      });
      await page.mouse.up();
    },
  },
  {
    name: "a stamp that has just landed is wet and dries within 3 s; one drawn on load never is",
    async run({ page }) {
      // Money stamp.
      await moneyReady(page);
      assert.equal(await page.locator(".stamp.wet").count(), 0, "nothing wet on load");
      await page.click('#slip button.spot[data-key="Izzah>Mo"]');
      await until(() => page.locator('#slip button.spot.is-armed').count().then((n) => n === 1), "armed");
      await page.click('#slip button.spot[data-key="Izzah>Mo"]');
      await until(() => page.locator("#slip .s-row.is-paid .stamp.hit.wet").count().then((n) => n === 1), "the stamp lands wet");
      const f = await page.evaluate(() => getComputedStyle(document.querySelector("#slip .stamp.wet")).filter);
      assert.match(f, /saturate\(1\.35\)/);
      assert.match(f, /brightness\(1\.1\)/);
      assert.match(f, /drop-shadow/);
      await page.clock.fastForward(3000);
      assert.equal(await page.locator("#slip .stamp.wet").count(), 0, "dry within 3 s");
      // Drawn on load: a reload shows the stamp, never wet.
      await page.reload();
      await until(() => page.locator("#slip .s-row.is-paid .stamp").count().then((n) => n === 1), "the stamp is drawn again");
      assert.equal(await page.locator(".stamp.wet").count(), 0, "not wet on a reload");
    },
  },
  {
    name: "under reduced motion a stamp is never wet",
    async run({ page }) {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await moneyReady(page);
      await page.click('#slip button.spot[data-key="Izzah>Mo"]');
      await until(() => page.locator('#slip button.spot.is-armed').count().then((n) => n === 1), "armed");
      await page.click('#slip button.spot[data-key="Izzah>Mo"]');
      await until(() => page.locator("#slip .s-row.is-paid .stamp").count().then((n) => n === 1), "the stamp");
      assert.equal(await page.locator(".stamp.wet").count(), 0);
    },
  },
  {
    name: "every check is ruled: a double green rule under its heading, a dashed tear line over its stub, and no half-moon notches",
    async run({ page }) {
      await daysReady(page);
      const perfs = await page.$$eval("#rail .tk", (els) => els.map((tk) => {
        const perf = getComputedStyle(tk.querySelector(".tk-perf"));
        const foot = getComputedStyle(tk.querySelector(".tk-foot"));
        return [perf.borderTopStyle, perf.borderTopColor, foot.borderTopStyle, getComputedStyle(tk.querySelector(".tk-perf"), "::before").content];
      }));
      assert.ok(perfs.length >= 3, "rules on the checks");
      for (const p of perfs) assert.deepEqual(p, ["double", "rgb(46, 122, 87)", "dashed", "none"]);
    },
  },
  {
    name: "a seal with a picture has a thin ring set over it",
    async run({ page }) {
      await moneyReady(page);
      await page.evaluate((p) => globalThis.__matTest.store.setPerson("Mo", { photo: p }), require("../fixtures/picture.json").jpeg);
      await page.click("#ring");
      await until(() => page.evaluate(() => document.getElementById("reg").classList.contains("is-open")), "the register opens");
      await until(() => page.evaluate(() => !!document.querySelector("#xPayer .seal.has-pic")), "the seal shows the picture");
      const ring = await style(page, "#xPayer .seal.has-pic", "::after");
      assert.equal(ring.pos, "absolute");
      assert.equal(layers(ring.shadow), 2, ring.shadow);
      assert.match(ring.shadow, /inset/);
      const plain = await style(page, '#xPayer .seal[data-p="Izzah"]', "::after");
      assert.equal(plain.content === "none" || plain.content === "normal", true, "no ring on initials");
    },
  },
  {
    name: "scrolling stays cheap: no backdrop-filter anywhere, and no CSS filter inside the rail, the receipt, the tape or the list except a stamp that has just landed",
    async run({ page }) {
      await daysReady(page);
      const scan = () =>
        page.evaluate(() => {
          const bad = { backdrop: [], filter: [] };
          const inList = (e) => e.closest("#rail, #rc, #tape");
          for (const e of document.querySelectorAll("*")) {
            for (const p of [null, "::before", "::after"]) {
              const c = getComputedStyle(e, p);
              if (c.backdropFilter && c.backdropFilter !== "none") bad.backdrop.push(e.tagName + "." + e.className + (p || ""));
              if (p === null && inList(e) && c.filter !== "none" && !e.matches(".stamp.wet")) bad.filter.push(e.tagName + "." + e.className + " " + c.filter);
            }
          }
          return bad;
        });
      assert.deepEqual(await scan(), { backdrop: [], filter: [] }, "Days");
      await page.click('#nav button[data-tab="money"]');
      await until(() => page.evaluate(() => document.getElementById("vMoney").classList.contains("is-active")), "Money");
      assert.deepEqual(await scan(), { backdrop: [], filter: [] }, "Money");
      await page.click("#youBtn");
      await until(() => visible(page, "#setHist"), "Settings opens");
      await page.click("#setHist");
      await until(() => visible(page, "#tape"), "the tape shows");
      assert.deepEqual(await scan(), { backdrop: [], filter: [] }, "History");
    },
  },
];
