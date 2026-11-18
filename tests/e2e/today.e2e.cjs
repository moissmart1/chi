// Today on the ticket: used days, the faded and the next stop, leave-by,
// fixed times, the open stop, and the countdown before the trip.
// The plan is tests/fixtures/plan.json over the seed; the clock is 13:20 on
// Dec 28 in Chicago (Day 3) unless a case says otherwise.

const assert = require("node:assert/strict");
const path = require("path");
const { pathToFileURL } = require("url");
const { WITH_PLAN, SEED, NOON28, makeBackend, open, advance, until, text, expectText } = require("./helpers.cjs");

const chi = (iso) => Date.parse(iso + "-06:00");

async function ready(page, opts = {}) {
  const backend = await open(page, { seed: WITH_PLAN, tab: "days", ...opts });
  await until(() => page.evaluate(() => document.querySelectorAll("#rail .pg .tk").length === 7), "the tickets draw");
  return backend;
}

const tk = (date) => '#rail .pg[data-date="' + date + '"]';
const row = (id) => '.r[data-id="' + id + '"]';
const SKY = "planstop1203";
const MEIJI = "planstop1201";
const LUNCH = "planstop1202";
const DINNER = "planstop1204";
const GLOVES = "planstop1205";

const classes = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  return el ? [...el.classList] : null;
}, sel);
const has = async (page, sel, cls) => ((await classes(page, sel)) || []).includes(cls);
const count = (page, sel) => page.evaluate((s) => document.querySelectorAll(s).length, sel);
const openRows = (page) => page.evaluate(() => [...document.querySelectorAll("#rail .r.is-open")].map((r) => r.dataset.id));
// Taps a stop's name, which opens or closes it.
const tap = (page, id) => page.click(row(id) + " .r-n");

// The rail's day in view, once it sits squarely there.
function inView(page) {
  return page.evaluate(() => {
    const rail = document.getElementById("rail").getBoundingClientRect();
    const mid = rail.left + rail.width / 2;
    let best = null;
    for (const pg of document.querySelectorAll("#rail .pg")) {
      const r = pg.getBoundingClientRect();
      const off = Math.abs(r.left + r.width / 2 - mid);
      if (!best || off < best.off) best = { date: pg.dataset.date, off };
    }
    return best && best.off < 2 ? best.date : null;
  });
}

// A 1x1 PNG in place of a real photo.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==", "base64");

// The app goes to the background (hidden true) or comes back.
const setHidden = (page, hidden) => page.evaluate((h) => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (h ? "hidden" : "visible") });
  document.dispatchEvent(new Event("visibilitychange"));
}, hidden);

// "Fixed time" on the Sky row, on one line, as large as the detail line.
async function fixedMarkOnOneLine(page) {
  const mark = await page.evaluate((sel) => {
    const fx = document.querySelector(sel + " .r-fx");
    const en = fx.querySelector("span");
    const range = document.createRange();
    range.selectNodeContents(en);
    const lines = range.getClientRects().length;
    return { text: fx.textContent, en: en.textContent, lines, size: parseFloat(getComputedStyle(en).fontSize) };
  }, row(SKY));
  assert.equal(mark.text, "Fixed time", "English only");
  assert.equal(mark.en, "Fixed time");
  assert.equal(mark.lines, 1, "Fixed time is on one line");
  assert.ok(mark.size >= 12.5, "at least the detail line's size: " + mark.size);
}

async function seedWithSky(patch) {
  const seed = JSON.parse(JSON.stringify(WITH_PLAN));
  Object.assign(seed.stops.find((s) => s.id === SKY), patch);
  return seed;
}

// Every stop on the ticket has finished sliding open or shut: each open
// row's details at full height, each closed one's at none (flake-report.md:
// a tap inside a ticket while a row still moves can scroll the rail).
const settled = (page, date) => until(() => page.evaluate((sel) => [...document.querySelectorAll(sel + " .r[data-id]")].every((r) => {
  const inner = r.querySelector(".r-more > div");
  if (!inner) return true;
  const h = inner.getBoundingClientRect().height;
  return r.classList.contains("is-open") ? Math.abs(h - inner.scrollHeight) < 1 : h < 1;
}), tk(date)), "the stops have stopped moving");

module.exports = [
  {
    name: "past, next and later",
    async run({ page }) {
      await ready(page);
      for (const id of [MEIJI, LUNCH]) assert.equal(await has(page, row(id), "is-done"), true, id + " is done");
      await until(async () => (await has(page, row(SKY), "is-next")) && (await has(page, row(SKY), "is-open")), "Sky is next and open");
      const sky = await text(page, row(SKY));
      assert.ok(sky.includes("Next"), sky);
      assert.ok(sky.includes("Leave by 13:30, in 10 min."), sky);
      const dinner = await classes(page, row(DINNER));
      assert.equal(dinner.includes("is-done") || dinner.includes("is-next") || dinner.includes("is-open"), false, dinner.join(" "));
      // An untimed stop is neither past nor next.
      const gloves = await classes(page, row(GLOVES));
      assert.equal(gloves.includes("is-done") || gloves.includes("is-next"), false, gloves.join(" "));
      assert.equal(await count(page, "#rail .tag"), 1, "one Next tag on the rail");
    },
  },
  {
    name: "a fixed time says so",
    async run({ page }) {
      await ready(page);
      const sky = await text(page, row(SKY));
      assert.ok(sky.includes("Fixed time") && !sky.includes("指定"), sky);
      const others = await page.evaluate(() => [...document.querySelectorAll("#rail .r[data-id]")].filter((r) => r.dataset.id !== "planstop1203").map((r) => r.textContent));
      for (const t of others) assert.equal(/Fixed time/.test(t), false, t);
      await fixedMarkOnOneLine(page);
    },
  },
  {
    name: "a fixed time on a small phone is still one line",
    viewport: { width: 320, height: 568 },
    async run({ page }) {
      await ready(page);
      await fixedMarkOnOneLine(page);
    },
  },
  {
    name: "the open stop",
    async run({ page }) {
      await ready(page);
      await until(() => has(page, row(SKY), "is-open"), "Sky is open");
      const sky = await text(page, row(SKY));
      assert.ok(sky.includes("Yamanote Line, Harajuku to Shibuya. One stop."), sky);
      assert.ok(sky.includes("Entrance is on floor 14."), sky);
      const links = await page.evaluate((sel) => [...document.querySelectorAll(sel + " a")].map((a) => ({
        text: a.textContent, href: a.getAttribute("href"), target: a.getAttribute("target"), rel: a.getAttribute("rel"),
      })), row(SKY));
      assert.deepEqual(links, [
        { text: "Directions ↗", href: "https://www.google.com/maps/dir/?api=1&travelmode=transit&origin=Lunch%20in%20Harajuku&destination=Shibuya%20Sky", target: "_blank", rel: "noopener" },
        { text: "Ticket or booking ↗", href: "https://example.test/sky-ticket", target: "_blank", rel: "noopener" },
      ]);
      // The open stop's links are on screen and can be reached.
      const box = await page.evaluate((sel) => document.querySelector(sel + " .r-map").getBoundingClientRect().height, row(SKY));
      assert.ok(box > 20, "the Directions button is drawn: " + box);
      // A closed stop's links cannot be tabbed to.
      assert.equal(await page.evaluate((sel) => document.querySelector(sel + " .r-more").inert, row(DINNER)), true);
    },
  },
  {
    name: "the first stop of a day starts from the hotel",
    async run({ page }) {
      await ready(page);
      await tap(page, MEIJI);
      await until(() => has(page, row(MEIJI), "is-open"), "Meiji Shrine opens");
      const href = await page.evaluate((sel) => document.querySelector(sel + " a.r-map").getAttribute("href"), row(MEIJI));
      assert.ok(href.includes("origin=Asakusa%20hotel%20Tokyo&destination=Meiji%20Jingu"), href);
    },
  },
  {
    name: "one stop open at a time",
    async run({ page }) {
      await ready(page);
      await until(() => has(page, row(SKY), "is-open"), "Sky is open");
      await tap(page, DINNER);
      await until(async () => JSON.stringify(await openRows(page)) === JSON.stringify([DINNER]), "only Dinner is open");
      assert.equal(await page.evaluate((sel) => document.querySelector(sel + " [aria-expanded]").getAttribute("aria-expanded"), row(DINNER)), "true");
      await tap(page, DINNER);
      await until(async () => (await openRows(page)).length === 0, "none is open");
      assert.equal(await page.evaluate((sel) => document.querySelector(sel + " [aria-expanded]").getAttribute("aria-expanded"), row(DINNER)), "false");
    },
  },
  {
    name: "a stop opens from the keyboard",
    async run({ page }) {
      await ready(page);
      await page.focus(row(DINNER) + ' [role="button"]');
      await page.keyboard.press("Enter");
      await until(() => has(page, row(DINNER), "is-open"), "Enter opens Dinner");
      await page.keyboard.press(" ");
      await until(async () => !(await has(page, row(DINNER), "is-open")), "Space closes it");
    },
  },
  {
    name: "the minute moves on",
    async run({ page }) {
      const backend = await ready(page);
      await advance(page, backend, 11 * 60000);
      await until(async () => (await text(page, row(SKY) + " .r-s")).includes("Leave now."), "Sky says Leave now.");
      await advance(page, backend, 30 * 60000); // 14:01: Sky has started, and is still next (R38)
      await until(async () => (await text(page, row(SKY) + " .r-lv")) === "Now.", "Sky says Now.");
      assert.equal(await has(page, row(SKY), "is-done"), false, "Sky is not faded");
      assert.equal(await has(page, row(DINNER), "is-next"), false, "Dinner is not next yet");
      await advance(page, backend, 29 * 60000); // 14:30: Sky's half hour is up
      await until(() => has(page, row(SKY), "is-done"), "Sky is done");
      await until(() => has(page, row(DINNER), "is-next"), "Dinner is next");
      const dinner = await text(page, row(DINNER));
      assert.ok(dinner.includes("Next, in 4 h 30 min."), dinner);
      assert.equal(await has(page, row(DINNER), "is-open"), true, "the next stop opens itself");
    },
  },
  {
    name: "a late stop stays next for half an hour (R38)",
    // A phone short enough that the ticket still fills the screen once Sky
    // closes (the browser itself pulls a page back up that got shorter).
    viewport: { width: 390, height: 600 },
    async run({ page }) {
      const backend = await ready(page, { nowMs: chi("2026-12-28T13:59:00") });
      await until(async () => (await has(page, row(SKY), "is-next")) && (await has(page, row(SKY), "is-open")), "Sky is next and open");
      await settled(page, "2026-12-28");
      // Scrolled down a little, as someone reading the ticket would be.
      await page.evaluate(() => { document.getElementById("vDays").scrollTop = 120; });
      const mark = () => page.evaluate((ids) => ids.forEach((id) => { document.querySelector('.r[data-id="' + id + '"]').__kept = 1; }), [MEIJI, LUNCH, SKY, GLOVES]);
      const kept = () => page.evaluate((ids) => ids.filter((id) => document.querySelector('.r[data-id="' + id + '"]').__kept === 1), [MEIJI, LUNCH, SKY, GLOVES]);
      await mark();
      const before = await page.evaluate(() => ({ top: document.getElementById("vDays").scrollTop, left: document.getElementById("rail").scrollLeft }));
      assert.equal(before.top, 120, "the screen is scrolled");

      await advance(page, backend, 2 * 60000); // 14:01
      await until(async () => (await text(page, row(SKY) + " .r-lv")) === "Now.", "Sky says Now.");
      const sky = await classes(page, row(SKY));
      assert.ok(sky.includes("is-next") && sky.includes("is-open") && !sky.includes("is-done"), sky.join(" "));
      assert.ok((await text(page, row(SKY) + " .r-n")).includes("Next"));
      assert.equal(/Leave|min/.test(await text(page, row(SKY) + " .r-s")), false, "no countdown");
      assert.deepEqual(await kept(), [MEIJI, LUNCH, SKY, GLOVES], "no row was made again");
      assert.equal(await count(page, "#rail .tag"), 1, "one Next tag on the rail");

      await advance(page, backend, 29 * 60000); // 14:30, on the ordinary tick
      await until(() => has(page, row(DINNER), "is-next"), "Dinner is next");
      assert.equal(await has(page, row(SKY), "is-done"), true, "Sky is faded");
      assert.equal(await has(page, row(SKY), "is-next"), false);
      assert.deepEqual(await openRows(page), [DINNER], "Dinner opens itself");
      assert.deepEqual((await kept()).filter((id) => id !== SKY), [MEIJI, LUNCH, GLOVES], "rows that did not change are kept");
      const after = await page.evaluate(() => ({ top: document.getElementById("vDays").scrollTop, left: document.getElementById("rail").scrollLeft }));
      assert.deepEqual(after, before, "the screen did not move");
      await expectText(page, "#dayCount", /^Day 3 of 7 ?today$/);
    },
  },
  {
    name: "a stop opened by hand stays open when a late stop stops being next (R38, R32)",
    async run({ page }) {
      const backend = await ready(page, { nowMs: chi("2026-12-28T14:01:00") });
      await until(async () => (await text(page, row(SKY) + " .r-lv")) === "Now.", "Sky says Now.");
      await settled(page, "2026-12-28");
      await tap(page, MEIJI);
      await until(async () => JSON.stringify(await openRows(page)) === JSON.stringify([MEIJI]), "only Meiji Shrine is open");
      await settled(page, "2026-12-28");
      await advance(page, backend, 29 * 60000); // 14:30
      await until(() => has(page, row(DINNER), "is-next"), "Dinner is next");
      assert.deepEqual(await openRows(page), [MEIJI], "Meiji Shrine stays open");
      assert.equal(await inView(page), "2026-12-28");
    },
  },
  {
    name: "a late stop on a phone in Toronto (R38)",
    timezoneId: "America/Toronto",
    async run({ page }) {
      await ready(page, { nowMs: chi("2026-12-28T14:20:00") });
      assert.equal(await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone), "America/Toronto");
      await until(() => has(page, row(SKY), "is-next"), "Sky is next");
      assert.equal(await text(page, row(SKY) + " .r-lv"), "Now.");
      assert.equal(await has(page, row(SKY), "is-done"), false);
    },
  },
  {
    name: "a stop closed by hand stays closed until the day in view changes",
    async run({ page }) {
      const backend = await ready(page);
      await until(() => has(page, row(SKY), "is-open"), "Sky is open");
      await tap(page, SKY);
      await until(async () => (await openRows(page)).length === 0, "Sky is closed");
      await advance(page, backend, 70 * 60000); // 14:30 (R38: Sky is next until then)
      await until(() => has(page, row(DINNER), "is-next"), "Dinner is next");
      assert.deepEqual(await openRows(page), [], "Dinner does not open itself");
      await page.click("#pager .sq:nth-child(4)");
      await until(async () => (await inView(page)) === "2026-12-29", "Dec 29 is in view");
      await page.click("#pager .sq:nth-child(3)");
      await until(async () => (await inView(page)) === "2026-12-28", "Dec 28 is back");
      await until(async () => JSON.stringify(await openRows(page)) === JSON.stringify([DINNER]), "Dinner opens itself again");
    },
  },
  {
    name: "a sync does not close what you opened",
    async run({ page }) {
      const backend = await ready(page);
      await tap(page, MEIJI);
      await until(() => has(page, row(MEIJI), "is-open"), "Meiji Shrine opens");
      await page.focus(row(MEIJI) + ' [role="button"]');
      await advance(page, backend, 20000);
      const env = await backend.handle({ key: "test-key", actor: "Izzah", via: "app", action: "addStop", args: { stop: { id: "ajenstop0001", date: "2026-12-28", time: "16:00", title: "Tower Records" } } });
      assert.equal(env.ok, true, JSON.stringify(env));
      await advance(page, backend, 20000);
      await until(() => page.evaluate(() => !!document.querySelector('.r[data-id="ajenstop0001"]')), "Izzah’s stop is on the ticket");
      assert.deepEqual(await openRows(page), [MEIJI]);
      await expectText(page, "#dayCount", /^Day 3 of 7/);
      assert.equal(await page.evaluate(() => !!document.activeElement.closest('.r[data-id="planstop1201"]')), true, "focus stays on Meiji Shrine");
    },
  },
  {
    name: "yesterday is used",
    async run({ page }) {
      await ready(page);
      const d11 = tk("2026-12-27");
      assert.equal(await count(page, d11 + " .insp"), 1);
      assert.equal(await count(page, d11 + " .punch"), 1);
      const rows = await page.evaluate((sel) => [...document.querySelectorAll(sel + " .r[data-id]")].map((r) => r.classList.contains("is-done")), d11);
      assert.ok(rows.length > 0 && rows.every(Boolean), JSON.stringify(rows));
      const { tripCents } = await import(pathToFileURL(path.join(__dirname, "..", "..", "js", "money.js")).href);
      const { tripMoney } = await import(pathToFileURL(path.join(__dirname, "..", "..", "js", "format.js")).href);
      const total = SEED.expenses.filter((e) => e.day === "2026-12-27" && !e.deleted).reduce((a, e) => a + tripCents(e), 0);
      assert.equal(tripMoney(total), "US$182.45");
      await expectText(page, d11 + " .fare", tripMoney(total));
      await expectText(page, "#dayCount", /^Day 3 of 7 ?today$/);
      await page.click("#pager .sq:nth-child(2)");
      await expectText(page, "#dayCount", /^Day 2 of 7 ?used$/);
      const done = await page.evaluate(() => [...document.querySelectorAll("#pager .sq")].map((b) => b.classList.contains("is-done")));
      assert.deepEqual(done, [true, true, false, false, false, false, false]);
    },
  },
  {
    name: "the gate stamp is kept across redraws",
    async run({ page }) {
      const backend = await ready(page);
      await page.evaluate(() => { document.querySelector('#rail .pg[data-date="2026-12-27"] .insp').__kept = 1; });
      await advance(page, backend, 61000);
      await until(async () => (await text(page, row(SKY) + " .r-s")).includes("in 9 min."), "the minute ticks");
      assert.equal(await page.evaluate(() => document.querySelector('#rail .pg[data-date="2026-12-27"] .insp').__kept), 1);
    },
  },
  {
    name: "tomorrow is untouched",
    async run({ page }) {
      await ready(page);
      const d13 = tk("2026-12-29");
      assert.equal(await count(page, d13 + " .insp"), 0);
      assert.equal(await count(page, d13 + " .is-done"), 0);
      assert.equal(await count(page, d13 + " .tag"), 0, "no Next tag tomorrow");
    },
  },
  {
    name: "the same gate stamp on every phone",
    async run({ page, newPhone }) {
      const backend = await ready(page);
      const other = await newPhone();
      await ready(other, { backend });
      const insp = (p) => p.evaluate(() => document.querySelector('#rail .pg[data-date="2026-12-27"] .insp').outerHTML);
      const a = await insp(page);
      assert.ok(a.includes("渋谷") && a.includes("12.27") && a.includes("MI"), a.slice(0, 200));
      assert.equal(await insp(other), a);
    },
  },
  {
    name: "Chicago time on a phone in Tokyo (already the next morning there)",
    timezoneId: "Asia/Tokyo",
    async run({ page }) {
      await ready(page);
      await expectText(page, "#dayCount", /^Day 3 of 7/);
      await until(() => has(page, row(SKY), "is-next"), "Sky is next");
      assert.ok((await text(page, row(SKY))).includes("Leave by 13:30, in 10 min."));
    },
  },
  {
    name: "midnight",
    async run({ page }) {
      const backend = await ready(page, { nowMs: chi("2026-12-28T23:40:00") });
      assert.equal(await has(page, row(DINNER), "is-done"), true);
      await expectText(page, "#dayCount", /^Day 3 of 7/);
      assert.equal(await count(page, tk("2026-12-28") + " .insp"), 0);
      await advance(page, backend, 50 * 60000);
      await until(async () => (await count(page, tk("2026-12-28") + " .insp")) === 1, "Dec 28 is used without a reload");
      await expectText(page, "#dayCount", /^Day 3 of 7 ?used$/);
      assert.equal(await page.evaluate(() => document.querySelector("#pager .sq:nth-child(3)").classList.contains("is-done")), true, "the third square is filled");
      await page.reload();
      await until(() => page.evaluate(() => document.querySelectorAll("#rail .pg .tk").length === 7), "the tickets draw again");
      await expectText(page, "#dayCount", /^Day 4 of 7/);
    },
  },
  {
    name: "before the trip",
    async run({ page, newPhone }) {
      await ready(page, { nowMs: chi("2026-12-01T12:00:00") });
      await expectText(page, "#dayCount", /^Day 1 of 7 ?in 25 days$/);
      const d10 = await text(page, tk("2026-12-26") + " .tk-date");
      assert.ok(d10.includes("Valid in 25 days") && !d10.includes("あと"), d10);
      assert.equal(d10.includes("Good for this day only"), false, d10);
      assert.equal(await count(page, "#rail .insp"), 0);
      assert.equal(await count(page, "#rail .is-done"), 0);
      assert.equal(await count(page, "#rail .tag"), 0, "no Next tag before the trip");
      assert.ok((await text(page, tk("2026-12-27") + " .tk-date")).includes("Good for this day only"), "later days keep their line");

      const eve = await newPhone();
      await ready(eve, { nowMs: chi("2026-12-25T12:00:00") });
      await expectText(eve, "#dayCount", /^Day 1 of 7 ?tomorrow$/);
      const d10eve = await text(eve, tk("2026-12-26") + " .tk-date");
      assert.ok(d10eve.includes("Valid tomorrow"), d10eve);
    },
  },
  {
    name: "after the trip",
    async run({ page }) {
      await ready(page, { nowMs: chi("2027-01-05T12:00:00") });
      await expectText(page, "#dayCount", /^Day 7 of 7/);
      assert.equal(await count(page, "#rail .tk .insp"), 7);
    },
  },
  {
    name: "a hand-edited Sheet",
    async run({ page }) {
      const backend = makeBackend(WITH_PLAN, { now: NOON28 });
      const stop = backend.fake.tables.Stops[2];
      assert.equal(stop.id, MEIJI);
      Object.assign(stop, { link: "javascript:alert(1)", photo: "javascript:alert(2)", time: "25:00" });
      Object.assign(backend.fake.tables.Days.find((d) => d.date === "2026-12-28"), { line_colour: "green" });
      await ready(page, { backend });
      await page.reload();
      await until(() => page.evaluate(() => document.querySelectorAll("#rail .pg .tk").length === 7), "the tickets draw again");
      await expectText(page, row(MEIJI) + " .r-t", "—");
      await tap(page, MEIJI);
      await until(() => has(page, row(MEIJI), "is-open"), "Meiji Shrine opens");
      const bad = await page.evaluate(() => [...document.querySelectorAll("[href], [src]")]
        .map((n) => n.getAttribute("href") || n.getAttribute("src") || "")
        .filter((v) => /^\s*javascript:/i.test(v)));
      assert.deepEqual(bad, []);
      const titles = await page.evaluate((sel) => [...document.querySelectorAll(sel + " .r[data-id] .r-n")].map((n) => n.lastChild.textContent), tk("2026-12-28"));
      assert.deepEqual(titles, ["Lunch in Harajuku", "Shibuya Sky", "Dinner", "Meiji Shrine", "Buy gloves"]);
      const band = await page.evaluate((sel) => {
        const css = (el, p) => getComputedStyle(el).getPropertyValue(p).trim();
        return { line: css(document.querySelector(sel + " .tk"), "--line"), keyHi: css(document.documentElement, "--key-hi") };
      }, tk("2026-12-28"));
      assert.equal(band.line, band.keyHi, "a neutral band");
    },
  },
  {
    name: "a photo that fails to load is not shown",
    async run({ page }) {
      await ready(page, { seed: await seedWithSky({ photo: "https://example.test/missing.jpg" }) });
      await until(() => has(page, row(SKY), "is-open"), "Sky is open");
      await until(() => page.evaluate((sel) => {
        const img = document.querySelector(sel + " img");
        if (!img) return true;
        const r = img.getBoundingClientRect();
        return getComputedStyle(img).display === "none" || r.height === 0;
      }, row(SKY)), "no broken image box");
    },
  },
  {
    name: "a photo that loads is shown on the open stop",
    async run({ page, context }) {
      await context.route("https://example.test/sky.png", (route) => route.fulfill({ status: 200, contentType: "image/png", body: PNG }));
      await ready(page, { seed: await seedWithSky({ photo: "https://example.test/sky.png" }) });
      await until(() => has(page, row(SKY), "is-open"), "Sky is open");
      await until(() => page.evaluate((sel) => {
        const img = document.querySelector(sel + " img.r-ph");
        return !!img && img.complete && img.naturalWidth > 0 && img.getBoundingClientRect().height > 100;
      }, row(SKY)), "the photo shows");
    },
  },
  {
    name: "the clock rests while Money is showing",
    async run({ page }) {
      const backend = await ready(page, { nowMs: chi("2026-12-28T13:20:50") });
      await until(async () => (await text(page, row(SKY) + " .r-s")).includes("in 10 min."), "Sky reads 10 min");
      await page.click('[data-tab="money"]');
      await until(() => page.evaluate(() => document.getElementById("vMoney").classList.contains("is-active")), "Money shows");
      await advance(page, backend, 15000); // 13:21:05, before the first sync
      assert.ok((await text(page, row(SKY) + " .r-s")).includes("in 10 min."), "no tick off screen");
      await page.click('[data-tab="days"]');
      await until(async () => (await text(page, row(SKY) + " .r-s")).includes("in 9 min."), "back on Days it catches up at once");
    },
  },
  {
    name: "the next stop's line changes in place each minute",
    async run({ page, context }) {
      await context.route("https://example.test/sky.png", (route) => route.fulfill({ status: 200, contentType: "image/png", body: PNG }));
      const backend = await ready(page, { seed: await seedWithSky({ photo: "https://example.test/sky.png" }) });
      await until(() => page.evaluate((sel) => !!document.querySelector(sel + ".is-open img.r-ph"), row(SKY)), "Sky is open with its photo");
      await page.evaluate((sel) => {
        const r = document.querySelector(sel);
        r.__kept = 1;
        r.querySelector("img.r-ph").__kept = 1;
      }, row(SKY));
      assert.ok((await text(page, row(SKY) + " .r-lv")).includes("in 10 min."));
      await advance(page, backend, 60000);
      await until(async () => (await text(page, row(SKY) + " .r-lv")) === "Leave by 13:30, in 9 min.", "the line moves on");
      const kept = await page.evaluate((sel) => {
        const r = document.querySelector(sel);
        const img = r.querySelector("img.r-ph");
        return { row: r.__kept === 1, img: !!img && img.__kept === 1, open: r.classList.contains("is-open") };
      }, row(SKY));
      assert.deepEqual(kept, { row: true, img: true, open: true });
    },
  },
  {
    name: "a photo that failed is not asked for again",
    async run({ page }) {
      const MISSING = "https://example.test/missing.jpg";
      let asked = 0;
      page.on("request", (req) => { if (req.url() === MISSING) asked++; });
      const backend = await ready(page, { seed: await seedWithSky({ photo: MISSING }) });
      await until(() => has(page, row(SKY), "is-open"), "Sky is open");
      await until(() => page.evaluate((sel) => !document.querySelector(sel + " img"), row(SKY)), "the broken photo is gone");
      assert.equal(asked, 1);
      // Watch for any photo drawn again while the minute and two syncs pass.
      await page.evaluate(() => {
        globalThis.__photos = 0;
        new MutationObserver((ms) => {
          for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && (n.matches("img.r-ph") || n.querySelector("img.r-ph"))) globalThis.__photos++;
        }).observe(document.getElementById("rail"), { childList: true, subtree: true });
      });
      await advance(page, backend, 60000);
      await advance(page, backend, 20000);
      await advance(page, backend, 20000);
      await until(async () => (await text(page, row(SKY) + " .r-lv")).includes("in 9 min."), "the minutes passed");
      assert.equal(await page.evaluate(() => globalThis.__photos), 0, "no photo drawn again");
      assert.equal(await count(page, row(SKY) + " .r-ph"), 0);
      assert.equal(asked, 1, "asked for once");
    },
  },
  {
    name: "back after a night away, on today's ticket",
    async run({ page }) {
      const backend = await ready(page, { nowMs: chi("2026-12-28T23:40:00") });
      await expectText(page, "#dayCount", /^Day 3 of 7 ?today$/);
      await setHidden(page, true);
      await advance(page, backend, 50 * 60000);
      await setHidden(page, false);
      await expectText(page, "#dayCount", /^Day 4 of 7 ?today$/);
      await until(async () => (await inView(page)) === "2026-12-29", "Dec 29 is in view");
    },
  },
  {
    name: "back on Days after a night on Money, on today's ticket",
    async run({ page }) {
      const backend = await ready(page, { nowMs: chi("2026-12-28T23:40:00") });
      await expectText(page, "#dayCount", /^Day 3 of 7 ?today$/);
      await page.click('[data-tab="money"]');
      await until(() => page.evaluate(() => document.getElementById("vMoney").classList.contains("is-active")), "Money shows");
      await advance(page, backend, 50 * 60000);
      await page.click('[data-tab="days"]');
      await expectText(page, "#dayCount", /^Day 4 of 7 ?today$/);
      await until(async () => (await inView(page)) === "2026-12-29", "Dec 29 is in view");
    },
  },
  {
    name: "opened on Money, Days first tapped the next day, on today's ticket",
    async run({ page }) {
      const backend = await open(page, { seed: WITH_PLAN, tab: "money", nowMs: chi("2026-12-28T23:40:00") });
      await until(() => page.evaluate(() => document.getElementById("vMoney").classList.contains("is-active")), "Money shows");
      await until(() => page.evaluate(() => document.querySelectorAll("#rail .pg .tk").length === 7), "the tickets draw");
      await advance(page, backend, 50 * 60000);
      await page.click('[data-tab="days"]');
      await expectText(page, "#dayCount", /^Day 4 of 7 ?today$/);
      await until(async () => (await inView(page)) === "2026-12-29", "Dec 29 is in view");
    },
  },
  {
    name: "back the same day, the ticket in view stays",
    async run({ page }) {
      const backend = await ready(page);
      await page.click("#pager .sq:nth-child(6)");
      await until(async () => (await inView(page)) === "2026-12-31", "Dec 31 is in view");
      await setHidden(page, true);
      await advance(page, backend, 60 * 60000);
      await setHidden(page, false);
      await advance(page, backend, 1000);
      await expectText(page, "#dayCount", /^Day 6 of 7/);
      assert.equal(await inView(page), "2026-12-31");
    },
  },
];
