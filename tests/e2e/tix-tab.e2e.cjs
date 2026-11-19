// The Tickets tab, look F (js/views/tickettab.js): the week's guest checks
// with their tickets stapled to them, the next one on the big stub with
// Show ticket, the used ones loose with the time clock's print; its key in
// the bar from the trip's first day. Ported from the Japan app's version 30
// tests. The week is tests/e2e/tix-fixture.cjs; 18:40 on Mon Dec 28 in Chicago.

const assert = require("node:assert/strict");
const { open, makeBackend, advance, until, text, expectText, visible } = require("./helpers.cjs");
const { NOW, S, WEEK, ticketed, ready, as, SIZES, sized, shot, ticketUp, lifted } = require("./tix-fixture.cjs");

// 23:57 on Fri Dec 25, three minutes before the trip's first day.
const EVE = Date.parse("2026-12-25T23:57:00-06:00");

const keys = (page) => page.evaluate(() => [...document.querySelectorAll("#nav button")].filter((b) => !b.hidden && b.getClientRects().length).map((b) => b.dataset.tab || b.id));
async function goTickets(page) {
  await until(() => visible(page, "#ticketsBtn"), "the Tickets key is in the bar");
  await page.click("#ticketsBtn");
  await until(() => page.evaluate(() => document.getElementById("vTickets").classList.contains("is-active") && !!document.querySelector("#vTickets .tt-bar")), "the tab shows");
  await until(() => page.evaluate(() => [...document.querySelectorAll(".view")].every((v) => getComputedStyle(v).opacity === (v.classList.contains("is-active") ? "1" : "0"))), "the views have faded");
}
// Every picture of the week on this phone (no stub still waiting to print).
const allKept = (page) => until(() => page.evaluate(() => {
  const s = globalThis.__matTest.store.state;
  return s.tickets.length > 0 && !document.querySelector("#vTickets .ts.is-ghost, #rail .ts.is-ghost");
}), "every picture is on this phone", 15000);
const closeTicket = async (page) => {
  await page.click("#tix [data-close]");
  await until(() => page.evaluate(() => document.getElementById("tix").hidden), "the ticket goes back");
};
const noSideways = (page) => page.evaluate(() => {
  const v = document.getElementById("vTickets");
  const r = v.getBoundingClientRect();
  const over = [...v.querySelectorAll("*")].filter((e) => e.getBoundingClientRect().right > r.right + 0.5).map((e) => e.className);
  return { doc: document.scrollingElement.scrollWidth <= innerWidth, view: v.scrollWidth <= v.clientWidth, over };
});

const cases = [];

cases.push({
  name: "the key: none before the first day, Tickets from 00:00 on Day 1 beside Days, Ring up still last; reached by keyboard; not remembered as the opening tab",
  async run({ page }) {
    const backend = await ticketed({ now: EVE });
    await ready(page, { backend, nowMs: EVE });
    assert.equal(await visible(page, "#ticketsBtn"), false, "no Tickets key before the trip");
    assert.deepEqual(await keys(page), ["days", "money", "youBtn", "ring"]);
    await advance(page, backend, 3 * 60 * 1000 + 31000);
    await until(() => visible(page, "#ticketsBtn"), "Day 1: the Tickets key");
    assert.deepEqual(await keys(page), ["days", "tickets", "money", "youBtn", "ring"]);
    await expectText(page, "#ticketsBtn", "TicketsStubs1"); // the flight to O’Hare is that day
    await page.focus('#nav [data-tab="days"]');
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement.id), "ticketsBtn");
    await page.keyboard.press("Enter");
    await until(() => page.evaluate(() => document.getElementById("vTickets").classList.contains("is-active")), "Enter opens Tickets");
    assert.equal(await page.evaluate(() => document.getElementById("ticketsBtn").getAttribute("aria-current")), "page");
    const k = await page.evaluate(() => {
      const css = (sel, p) => getComputedStyle(document.querySelector(sel))[p];
      return [css("#ticketsBtn", "height"), css('#nav [data-tab="money"]', "fontSize") === css("#ticketsBtn", "fontSize")];
    });
    assert.deepEqual(k, ["56px", true]);
    assert.notEqual(await page.evaluate(() => localStorage.getItem("chi.tab")), "tickets");
  },
});

for (const size of SIZES) {
  cases.push({
    name: size.tag + ": today's check with the next ticket on the big stub, Show ticket, the reservation; later days on their checks; used ones off them; the badge",
    ...sized(size),
    async run({ page }) {
      const backend = await ticketed();
      await ready(page, { backend });
      await goTickets(page);
      await allKept(page);
      await expectText(page, "#vTickets .tt-bar", "Tickets Mon Dec 28 · today6 to come");
      // Today: the hockey next (lead line, big stub, Show ticket), the jazz reserved.
      await expectText(page, '#vTickets .ck[data-date="2026-12-28"] .ck-h', "Date12/28Guest CheckMon · todayNo.0003");
      await expectText(page, "#vTickets .f-nx .r-lv", "NextLeave by 18:55 · in 15 min");
      await expectText(page, "#vTickets #ttWin .bigst-t", "TICKET · MON DEC 28 · 19:30");
      await expectText(page, "#vTickets #ttWin .bigst-l", "Blackhawks v. Blues2 tickets · on this phoneSEC 112ROW 8SEAT 4");
      await expectText(page, "#ttShow", "Show ticket2 tickets");
      await expectText(page, '#vTickets .cr[data-id="' + S.jazz + '"]', "22:15ReservedJazz, late setReference onlyJZ-5512");
      // Later days, each on its own check.
      await expectText(page, "#vTickets .gl", "Later days4, on their checks");
      assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll("#vTickets .ck")].map((c) => c.dataset.date)), ["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01"]);
      await expectText(page, '#vTickets .ck[data-date="2026-12-29"] .ck-h', "Date12/29Tue Dec 29River dayNo.0004");
      await expectText(page, '#vTickets .cr[data-id="' + S.boat + '"]', "10:00BOARD2BOARDING CARD · TUE DEC 29Architecture river cruise1 ticket for everyone · on this phone");
      await expectText(page, '#vTickets .cr[data-id="' + S.fly + '"]', "13:05PASS2BOARDING PASS · FRI JAN 1Flight to Toronto2 passes · on this phone");
      // Used: off their checks, the time clock's print.
      assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll("#vTickets .gl")].map((g) => g.textContent)), ["Later days4, on their checks", "Used2, off their checks"]);
      assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll("#vTickets .tt-used .tclock")].map((t) => t.textContent)), ["USED DEC 28", "USED DEC 26"]);
      assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll("#vTickets .tt-used")].map((b) => b.getAttribute("aria-label"))), ["Used: The Art Institute, Mon Dec 28 11:00", "Used: Flight to O’Hare, Sat Dec 26 08:00"]);
      // The badge: today's still to come.
      await expectText(page, "#ticketsN", "2");
      assert.equal(await page.evaluate(() => document.getElementById("ticketsBtn").getAttribute("aria-label")), "Tickets, 2 still to come today");
      assert.deepEqual(await noSideways(page), { doc: true, view: true, over: [] });
      await page.evaluate(() => { document.getElementById("vTickets").scrollTop = 0; });
      await shot(page, "F-2-tab-" + size.tag);
      // Show ticket holds up the same ticket a stop's Show ticket does.
      await page.click("#ttShow");
      await ticketUp(page);
      await expectText(page, "#tix .pp-pg:not([hidden]) .f-ttl b", "Blackhawks v. Blues");
      await closeTicket(page);
      assert.equal(await page.evaluate(() => document.activeElement.id), "ttShow", "focus back on Show ticket");
      // A stapled stub and a used one hold up theirs.
      await page.click('#vTickets .cr[data-id="' + S.boat + '"] .tt-tk');
      await ticketUp(page);
      await expectText(page, "#tix .f-ttl b", "Architecture river cruise");
      await closeTicket(page);
      await page.evaluate(() => document.querySelector("#vTickets .tt-used").scrollIntoView({ block: "center" }));
      await page.click("#vTickets .tt-used");
      await ticketUp(page);
      await expectText(page, "#tix .pp-pg:not([hidden]) .f-ttl b", "The Art Institute");
      if (size.tag !== "393") await shot(page, "F-1-ticket-from-tab-" + size.tag);
      await closeTicket(page);
    },
  });
}

cases.push({
  name: "the keyboard reaches every stub on the tab, each named for a screen reader",
  async run({ page }) {
    const backend = await ticketed();
    await ready(page, { backend });
    await goTickets(page);
    await allKept(page);
    const names = await page.evaluate(() => [...document.querySelectorAll("#vTickets button")].map((b) => b.getAttribute("aria-label")));
    assert.deepEqual(names, [
      "Show ticket: Blackhawks v. Blues, 19:30, 2 tickets, on this phone",
      "Show ticket: Blackhawks v. Blues",
      "Show ticket: Jazz, late set, 22:15, reservation, reference only",
      "Show ticket: Architecture river cruise, 10:00, 1 ticket for everyone, on this phone",
      "Show ticket: Field Museum, 11:00, 2 tickets, on this phone",
      "Show ticket: River cruise, sunset, 16:30, 2 pages, on this phone",
      "Show ticket: Flight to Toronto, 13:05, 2 passes, on this phone",
      "Used: The Art Institute, Mon Dec 28 11:00",
      "Used: Flight to O’Hare, Sat Dec 26 08:00",
    ]);
    assert.equal(await page.evaluate(() => document.querySelector("#vTickets section").getAttribute("aria-labelledby")), "ttTitle");
    await page.focus("#ttWin");
    await page.keyboard.press("Enter");
    await ticketUp(page);
    await page.keyboard.press("Escape");
    await until(() => page.evaluate(() => document.getElementById("tix").hidden), "Escape puts it back");
    assert.equal(await page.evaluate(() => document.activeElement.id), "ttWin");
  },
});

cases.push({
  name: "a ticket not on this phone yet: its stub is not printed, it says it needs signal once",
  async run({ page }) {
    const backend = await ticketed({ kinds: ["fly"] });
    await ready(page, { backend, storage: { "chi.tixFetch": "open" } });
    await goTickets(page);
    await expectText(page, '#vTickets #ttWin .bigst-l', /Flight to Toronto2 passes · needs signal once/);
    assert.equal(await page.evaluate(() => document.querySelector("#vTickets #ttWin .bigst").classList.contains("is-ghost")), true);
  },
});

cases.push({
  name: "with no signal the tab still shows everything from the phone, and a stub still holds up its ticket",
  async run({ page }) {
    const backend = await ticketed();
    await ready(page, { backend });
    await goTickets(page);
    await allKept(page);
    backend.failWith = "network";
    await page.reload();
    await until(() => page.evaluate(() => globalThis.__matTest && globalThis.__matTest.store.state.status !== "loading"), "the app opens from the cache");
    await goTickets(page);
    await expectText(page, "#vTickets .tt-bar", "Tickets Mon Dec 28 · today6 to come");
    await page.click('#vTickets .cr[data-id="' + S.field + '"] .tt-tk');
    await ticketUp(page);
    assert.equal(await page.evaluate(() => [...document.querySelectorAll("#tix img")].every((i) => i.naturalWidth > 0)), true);
  },
});

cases.push({
  name: "no ticket anywhere: no Tickets key, the bar as it was; the first ticket brings it",
  async run({ page }) {
    const backend = makeBackend(WEEK, { now: NOW });
    await ready(page, { backend });
    assert.equal(await visible(page, "#ticketsBtn"), false);
    assert.deepEqual(await keys(page), ["days", "money", "youBtn", "ring"]);
    await as(backend, "updateStop", { id: S.jazz, patch: { tkRef: "JZ-5512" } });
    await page.evaluate(() => globalThis.__matTest.store.checkRev());
    await until(() => visible(page, "#ticketsBtn"), "the key comes with the first ticket");
    await goTickets(page);
    await expectText(page, '#vTickets .cr[data-id="' + S.jazz + '"]', /JZ-5512/);
  },
});

cases.push({
  name: "nothing still to come: the used ones only, under a line that says so",
  async run({ page }) {
    const late = Date.parse("2027-01-01T22:00:00-06:00");
    const backend = await ticketed({ now: late, kinds: ["art", "fly"] });
    await ready(page, { backend, nowMs: late });
    await goTickets(page);
    await expectText(page, "#vTickets .tt-empty", "No ticket still to come.The used ones are below.");
    await expectText(page, "#vTickets .gl", "Used2, off their checks");
  },
});

for (const width of [320, 393]) {
  cases.push({
    name: "the bar at " + width + " px with the Tickets key: Days, Tickets, Money, You, Ring up on one line, nothing clipped, the badge inside its key",
    viewport: { width, height: 700 },
    async run({ page }) {
      const backend = await ticketed();
      await ready(page, { backend });
      await until(() => visible(page, "#ticketsN"), "the badge shows");
      for (const tab of ["days", "tickets"]) {
        await page.click('#nav button[data-tab="' + tab + '"]');
        const shape = await page.evaluate(() => {
          const items = [...document.querySelectorAll("#nav button")].filter((b) => !b.hidden);
          const nav = document.getElementById("nav").getBoundingClientRect();
          const rects = items.map((b) => b.getBoundingClientRect());
          const overlap = rects.some((a, i) => rects.some((c, j) => j > i && a.left < c.right - 0.5 && c.left < a.right - 0.5));
          const clipped = items.filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.id || b.dataset.tab);
          const p = document.getElementById("ticketsN").getBoundingClientRect();
          const k = document.getElementById("ticketsBtn").getBoundingClientRect();
          return { ids: items.map((b) => b.dataset.tab || b.id), overlap, clipped, inside: rects.every((r) => r.left >= nav.left - 0.5 && r.right <= nav.right + 0.5), pill: p.left >= k.left - 0.5 && p.right <= k.right + 0.5 && p.top >= k.top - 0.5, page: document.documentElement.scrollWidth <= innerWidth };
        });
        assert.deepEqual(shape, { ids: ["days", "tickets", "money", "youBtn", "ring"], overlap: false, clipped: [], inside: true, pill: true, page: true }, "on " + tab);
      }
    },
  });
}

cases.push({
  name: "320 × 568: the tab fits without sideways scroll, a long name wraps, every key a full tap target",
  viewport: { width: 320, height: 568 },
  async run({ page }) {
    const backend = await ticketed();
    await as(backend, "updateStop", { id: S.field, patch: { title: "Field Museum, the dinosaur hall and the whole of the second floor" } });
    await ready(page, { backend });
    await goTickets(page);
    await allKept(page);
    assert.deepEqual(await noSideways(page), { doc: true, view: true, over: [] });
    const small = await page.evaluate(() => [...document.querySelectorAll("#vTickets button")].map((b) => b.getBoundingClientRect()).filter((r) => r.height < 44 || r.width < 44).length);
    assert.equal(small, 0, "every control at least 44 px each way");
  },
});

cases.push({
  name: "reduced motion: the tab's keys do not move",
  async run({ page }) {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const backend = await ticketed({ kinds: ["hawks"] });
    await ready(page, { backend });
    await goTickets(page);
    const t = await page.evaluate(() => ["#ttShow", "#ttWin"].map((s) => getComputedStyle(document.querySelector(s)).transitionDuration));
    assert.ok(t.every((d) => parseFloat(d) <= 0.0001), t.join(" "));
  },
});

cases.push({
  name: "on a computer (1440 × 900): the tab stands in the Days pane, the rail's Tickets key opens it, Days is the way back, Money stays",
  viewport: { width: 1440, height: 900 },
  mobile: false,
  async run({ page }) {
    const backend = await ticketed();
    await open(page, { backend, nowMs: NOW, tab: "money" });
    await until(() => page.evaluate(() => document.querySelectorAll("#rail .pg .tk").length === 7), "both panes draw");
    await until(() => visible(page, "#ticketsBtn"), "the Tickets key is in the rail");
    assert.deepEqual(await keys(page), ["tickets", "youBtn", "ring"]);
    await page.click("#ticketsBtn");
    await until(() => page.evaluate(() => document.getElementById("vTickets").classList.contains("is-active") && !!document.querySelector("#vTickets .ck")), "the tab shows");
    const r = await page.evaluate(() => {
      const R = (id) => document.getElementById(id).getBoundingClientRect().toJSON();
      const v = (id) => getComputedStyle(document.getElementById(id));
      return { t: R("vTickets"), d: R("vDays"), m: R("vMoney"), mShown: v("vMoney").opacity === "1" && !document.getElementById("vMoney").inert, dInert: document.getElementById("vDays").inert };
    });
    assert.ok(Math.abs(r.t.left - r.d.left) < 1 && Math.abs(r.t.width - r.d.width) < 1, "the tab stands where the Days pane stands");
    assert.equal(r.mShown, true, "Money is still shown and usable");
    assert.equal(r.dInert, true);
    assert.deepEqual(await keys(page), ["days", "tickets", "youBtn", "ring"], "the Days key is the way back");
    await page.click("#ttShow");
    await ticketUp(page);
    const tix = await page.evaluate(() => document.getElementById("tix").getBoundingClientRect().toJSON());
    assert.ok(tix.right <= r.t.right + 60, "the ticket is held up over the Days pane");
    await closeTicket(page);
    await page.click('#nav [data-tab="days"]');
    await until(() => page.evaluate(() => document.getElementById("vDays").classList.contains("is-active")), "Days is back");
    assert.deepEqual(await keys(page), ["tickets", "youBtn", "ring"]);
    assert.equal(await page.evaluate(() => localStorage.getItem("chi.tab")), "money", "what the app remembers is left alone");
  },
});

cases.push({
  name: "a minute passing changes the lead line in place: focus returns to Show ticket after the ticket, and the picture is not redrawn",
  async run({ page }) {
    const backend = await ticketed();
    await ready(page, { backend });
    await goTickets(page);
    await allKept(page);
    await expectText(page, "#vTickets .f-nx .r-lv", "NextLeave by 18:55 · in 15 min");
    await until(() => page.evaluate(() => { const i = document.querySelector("#ttWin .ts-q img"); return !!i && i.complete && i.naturalWidth > 0; }), "the big stub's picture");
    await page.evaluate(() => {
      window.__ttKeep = { btn: document.querySelector("#ttShow"), win: document.querySelector("#ttWin"), img: document.querySelector("#ttWin .ts-q img") };
    });
    await page.click("#ttShow");
    await ticketUp(page);
    await advance(page, backend, 2 * 60 * 1000);
    await until(() => page.evaluate(() => document.querySelector("#vTickets .f-nx .r-lv").textContent.includes("in 13 min")), "the line counts down");
    await closeTicket(page);
    const r = await page.evaluate(() => ({
      focus: document.activeElement === window.__ttKeep.btn,
      sameWin: document.querySelector("#ttWin") === window.__ttKeep.win,
      sameImg: document.querySelector("#ttWin .ts-q img") === window.__ttKeep.img && window.__ttKeep.img.isConnected,
    }));
    assert.deepEqual(r, { focus: true, sameWin: true, sameImg: true });
  },
});

cases.push({
  name: "a refused key: the tab is emptied and its key leaves the bar",
  async run({ page }) {
    const backend = await ticketed({ kinds: ["hawks", "jazz"] });
    await ready(page, { backend, own: "Izzah" });
    await goTickets(page);
    backend.fake.world.cancelLinkForPerson2(); // Izzah
    await page.evaluate(() => globalThis.__matTest.store.checkRev());
    await until(() => visible(page, "#gate"), "the no-key screen shows");
    await until(() => page.evaluate(() => document.getElementById("vTickets").textContent === ""), "the tab is emptied");
    assert.equal(await page.evaluate(() => document.getElementById("ticketsBtn").hidden), true);
    assert.equal(await page.evaluate(() => document.querySelectorAll("img[src^='blob:']").length), 0);
  },
});

void lifted;
module.exports = cases;
