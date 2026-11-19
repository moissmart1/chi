// A ticket on a stop, look F ("stapled to the check"): each ticket stapled
// to its stop's line on the day's guest check, the big stub on the open stop
// (Show ticket), and the ticket lifted on its staple and held up
// (js/views/stub.js), at the four sizes (393 x 852, 320 x 568, 844 x 390,
// 1440 x 900). Ported from the Japan app's version 29 tests. The week is
// tests/e2e/tix-fixture.cjs; it is 18:40 on Mon Dec 28 in Chicago.

const assert = require("node:assert/strict");
const { makeBackend, advance, until, text, expectText, visible } = require("./helpers.cjs");
const { NOW, S, WEEK, ticketed, ready, as, SIZES, sized, shot, row, openRow, ticketUp, showTicket, noSideways } = require("./tix-fixture.cjs");

const solid = (page, id, date) => page.evaluate((sel) => {
  const t = document.querySelector(sel + " .ts");
  return !!t && !t.classList.contains("is-ghost");
}, row(id, date));
const allKept = (page) => until(async () => (await Promise.all([[S.hawks], [S.art]].map(([id]) => solid(page, id)))).every(Boolean), "every picture of the day is on this phone", 10000);
const closeTicket = async (page) => {
  await page.click("#tix [data-close]");
  await until(() => page.evaluate(() => document.getElementById("tix").hidden), "the ticket goes back");
};
// Taps the corner of the ticket stapled underneath (the part that shows below the top one).
async function flipUp(page) {
  // A point where the corner itself is the top thing (it is tilted under the
  // ticket on top): the middle of the strip of it that shows.
  await page.evaluate(() => document.querySelector("#tix .nx").scrollIntoView({ block: "end" }));
  const b = await page.evaluate(() => {
    const nx = document.querySelector("#tix .nx");
    const r = nx.getBoundingClientRect();
    const x = r.left + r.width * 0.6;
    const hits = [];
    for (let y = Math.min(r.bottom, innerHeight) - 1; y > r.top; y -= 2) {
      const at = document.elementFromPoint(x, y);
      if (at && at.closest(".nx") === nx) hits.push(y);
    }
    return hits.length ? { x, y: hits[Math.floor(hits.length / 2)] } : null;
  });
  assert.ok(b, "the corner underneath shows");
  await page.mouse.click(b.x, b.y);
}
// The ticket on top (per person: the one not hidden).
const onTop = (page) => page.evaluate(() => {
  const pg = [...document.querySelectorAll("#tix .pp-pg")].find((p) => !p.hidden);
  return pg ? pg.dataset.who : null;
});

// Tue Dec 29 08:00 and Thu Dec 31 12:00 in Chicago: the boat's day, the sunset cruise's day.
const DAY29 = Date.parse("2026-12-29T08:00:00-06:00");
const DAY31 = Date.parse("2026-12-31T12:00:00-06:00");

const cases = [];
for (const size of SIZES) {
  cases.push({
    name: size.tag + ": stubs stapled to the check (used, next, reserved); one each, mine on top, Izzah’s underneath flips up; Back to the check",
    ...sized(size),
    async run({ page }) {
      const backend = await ticketed();
      await ready(page, { backend, me: "Izzah" });
      await allKept(page);
      // Used: the stub stays on the line with the time clock's print.
      await expectText(page, row(S.art) + " .ts-on", "ADMIT2ADMISSION2 ticketsUSED 11:00");
      assert.equal(await page.evaluate((sel) => getComputedStyle(document.querySelector(sel + " .tclock")).color, row(S.art)), "rgb(107, 42, 140)");
      // Reference only: the Reserved card, the reference large.
      await expectText(page, row(S.jazz) + " .ts-on", "ReservedReference onlyJZ-5512");
      // The next stop is open: its big stub is Show ticket.
      await openRow(page, S.hawks);
      await expectText(page, row(S.hawks) + " .r-tk .bigst-t", "TICKET · MON DEC 28 · 19:30");
      await expectText(page, row(S.hawks) + " .r-tk .bigst-l", "Show ticket2 tickets · on this phoneSEC 112ROW 8SEAT 5");
      assert.equal(await page.evaluate((sel) => document.querySelector(sel + " .r-tk").getAttribute("aria-label"), row(S.hawks)), "Show ticket: 2 tickets, on this phone");
      await until(() => page.evaluate((sel) => { const i = document.querySelector(sel + " .r-tk .ts-q img"); return !!i && i.naturalWidth > 0; }, row(S.hawks)), "the code shows small on the stub");
      await shot(page, "F-1-stop-" + size.tag);
      await page.dispatchEvent(row(S.hawks) + " .r-tk", "click");
      await ticketUp(page);
      assert.equal(await page.evaluate(() => document.getElementById("phone").classList.contains("stub-open")), true);
      // Izzah's own on top, Mo's underneath.
      assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll("#tix .pp-pg")].map((p) => p.dataset.who)), ["Izzah", "Mo"]);
      assert.equal(await onTop(page), "Izzah");
      await expectText(page, "#tix .tb span", "Mon Dec 28 · ticket 1 of 2");
      await expectText(page, "#tix .nx", "Underneath: MO · Sec 112 Row 8 Seat 4");
      await expectText(page, "#tix .pp-pg:not([hidden]) .f-band", "TICKET · 19:30No. 0003");
      await expectText(page, "#tix .pp-pg:not([hidden]) .f-ttl", "Blackhawks v. BluesMon Dec 28 · 19:30 · United Center");
      await expectText(page, "#tix .pp-pg:not([hidden]) .f-nm", "IZZAHSEC 112ROW 8SEAT 5");
      await expectText(page, "#tix .pp-pg:not([hidden]) .f-rf", "Booking refZX4K9Q");
      await expectText(page, "#tix .pp-pg:not([hidden]) .f-kt", "KEPTOn this phone. Works with no signal.");
      assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll("#tix .who button")].map((b) => [b.textContent, b.getAttribute("aria-pressed")])), [["IYou", "true"], ["MMo", "false"]]);
      // The code on pure white, at least 236 px wide on a 393 phone.
      const code = await page.evaluate(() => {
        const box = document.querySelector("#tix .pp-pg:not([hidden]) .stub-code");
        return { w: box.querySelector("img").getBoundingClientRect().width, bg: getComputedStyle(box).backgroundColor };
      });
      assert.equal(code.bg, "rgb(255, 255, 255)");
      if (size.tag === "393") assert.ok(code.w >= 236, "the code is " + code.w + " px");
      await noSideways(page);
      await shot(page, "F-1-ticket-" + size.tag);
      // Flip it up: Mo's on top, Izzah's underneath.
      await flipUp(page);
      await until(async () => (await onTop(page)) === "Mo", "Mo’s flips up");
      await expectText(page, "#tix .nx", "Underneath: IZZAH · Sec 112 Row 8 Seat 5");
      await expectText(page, "#tix .tb span", "Mon Dec 28 · ticket 2 of 2");
      await expectText(page, "#tix .pp-pg:not([hidden]) .f-nm", "MOSEC 112ROW 8SEAT 4");
      // The seal brings Izzah's back.
      await page.click("#tix .who button:nth-child(1)");
      await until(async () => (await onTop(page)) === "Izzah", "the seal flips Izzah’s up");
      await closeTicket(page);
      assert.equal(await page.evaluate(() => document.getElementById("phone").classList.contains("stub-open")), false);
      // Focus is back on Show ticket.
      assert.equal(await page.evaluate((sel) => document.activeElement === document.querySelector(sel + " .r-tk"), row(S.hawks)), true);
    },
  });

  cases.push({
    name: size.tag + ": one code for everyone, tap to enlarge; Escape takes the enlarged one away, then puts the ticket back",
    ...sized(size),
    async run({ page }) {
      const backend = await ticketed({ kinds: ["boat"], now: DAY29 });
      await ready(page, { backend, nowMs: DAY29 });
      await until(() => solid(page, S.boat, "2026-12-29"), "the picture is on this phone");
      await expectText(page, row(S.boat, "2026-12-29") + " .ts-on", "BOARD2BOARDING CARD1 ticket for everyone");
      await showTicket(page, S.boat, "2026-12-29");
      await expectText(page, "#tix .tb span", "Tue Dec 29 · ticket for everyone");
      await expectText(page, "#tix .f-nm", "BOTH");
      await expectText(page, "#tix .f-rf", "Booking refRC-2291");
      assert.equal(await page.evaluate(() => document.querySelectorAll("#tix .who, #tix .nx").length), 0);
      await noSideways(page);
      await shot(page, "F-1-ticket-one-" + size.tag);
      await page.click("#tix .stub-code.can-zoom");
      await until(() => page.evaluate(() => !!document.querySelector("#tix .zoom img")), "it is enlarged");
      await page.keyboard.press("Escape");
      await until(() => page.evaluate(() => !document.querySelector("#tix .zoom") && !document.getElementById("tix").hidden), "Escape takes the enlarged picture away first");
      await page.keyboard.press("Escape");
      await until(() => page.evaluate(() => document.getElementById("tix").hidden), "Escape puts it back");
    },
  });

  cases.push({
    name: size.tag + ": a PDF’s pages one under another; a tap on the dark puts it back",
    ...sized(size),
    async run({ page }) {
      const backend = await ticketed({ kinds: ["sunset"], now: DAY31 });
      await ready(page, { backend, nowMs: DAY31 });
      await until(() => solid(page, S.sunset, "2026-12-31"), "the pages are on this phone");
      await showTicket(page, S.sunset, "2026-12-31");
      await expectText(page, "#tix .f-nm", "E-TICKET");
      await expectText(page, "#tix .tb span", "Thu Dec 31 · e-ticket, 2 pages");
      assert.equal(await page.evaluate(() => document.querySelectorAll("#tix .stub-code.is-page img").length), 2);
      assert.equal(await page.evaluate(() => {
        const [a, b] = [...document.querySelectorAll("#tix .stub-code.is-page")].map((x) => x.getBoundingClientRect());
        return b.top >= a.bottom;
      }), true);
      await noSideways(page);
      await page.locator("#tix .stub-code.is-page").nth(1).click();
      await until(() => page.evaluate(() => !!document.querySelector("#tix .zoom img")), "the page is enlarged");
      await page.click("#tix .zoom-x");
      await until(() => page.evaluate(() => !document.querySelector("#tix .zoom")), "Back");
      await page.dispatchEvent("#tix .ov", "click");
      await until(() => page.evaluate(() => document.getElementById("tix").hidden), "the dark puts it back");
    },
  });

  cases.push({
    name: size.tag + ": reference only: the Reserved card, the reference large and a sentence for staff",
    ...sized(size),
    async run({ page }) {
      const backend = await ticketed({ kinds: ["jazz"] });
      await ready(page, { backend });
      await openRow(page, S.jazz);
      assert.equal(await page.evaluate((sel) => document.querySelector(sel + " .r-tk").getAttribute("aria-label"), row(S.jazz)), "Show ticket: reservation, reference only");
      await showTicket(page, S.jazz);
      await expectText(page, "#tix .ref-big", "Reserved · reference onlyJZ-5512We have a booking for 2 at 22:15 under MO.");
      await expectText(page, "#tix .f-band", "RESERVED · 22:15No. 0003");
      await expectText(page, "#tix .f-nm", "MO");
      await expectText(page, "#tix .f-kt", "TEXTText only, always on this phone.");
      assert.equal(await page.evaluate(() => document.querySelectorAll("#tix .stub-code").length), 0);
      await noSideways(page);
      await shot(page, "F-1-ticket-reserved-" + size.tag);
      await closeTicket(page);
    },
  });

  cases.push({
    name: size.tag + ": a picture not on this phone yet needs signal once, then saves",
    ...sized(size),
    async run({ page }) {
      const backend = await ticketed({ kinds: ["hawks"] });
      let block = true;
      const real = backend.handle.bind(backend);
      backend.handle = async (body) => {
        if (block && body.action === "ticket") throw new Error("network");
        return real(body);
      };
      await ready(page, { backend });
      await until(() => page.evaluate((sel) => !!document.querySelector(sel + " .ts.is-ghost"), row(S.hawks)), "the stub is not printed yet");
      await openRow(page, S.hawks);
      await expectText(page, row(S.hawks) + " .r-tk .bigst-l .ts-s", "2 tickets · needs signal once");
      await shot(page, "F-1-stop-needs-signal-" + size.tag);
      await page.dispatchEvent(row(S.hawks) + " .r-tk", "click");
      await ticketUp(page);
      await expectText(page, "#tix .pp-pg:not([hidden]) .miss", /The picture is not on this phone yet\..*Until then, show the booking ref below/);
      await expectText(page, "#tix .pp-pg:not([hidden]) .f-kt", "NOT YETNot on this phone yet. Needs signal once.");
      await expectText(page, "#tix .pp-pg:not([hidden]) .f-rf", /ZX4K9Q/);
      await noSideways(page);
      block = false;
      await advance(page, backend, 21000);
      await until(() => page.evaluate(() => {
        const img = document.querySelector("#tix .pp-pg:not([hidden]) .stub-code img");
        return !!img && img.naturalWidth > 0;
      }), "the picture saves and shows", 10000);
      await expectText(page, "#tix .pp-pg:not([hidden]) .f-kt", "KEPTOn this phone. Works with no signal.");
      await closeTicket(page);
      await until(() => solid(page, S.hawks), "the stub is printed");
    },
  });
}

cases.push({
  name: "after one fetch it opens with no signal",
  async run({ page }) {
    const backend = await ticketed({ kinds: ["hawks", "art"] });
    await ready(page, { backend });
    await allKept(page);
    backend.failWith = "network";
    await page.reload();
    await until(() => page.evaluate(() => document.querySelectorAll("#rail .pg .tk").length === 7), "the checks draw from the cache");
    await until(() => solid(page, S.hawks), "the stub is printed with no signal");
    await showTicket(page, S.hawks);
    assert.equal(await page.evaluate(() => [...document.querySelectorAll("#tix img")].every((i) => i.naturalWidth > 0 && i.src.startsWith("blob:"))), true);
  },
});

cases.push({
  name: "while the ticket is up, a new release waits; it can reload once it is put back",
  async run({ page }) {
    const backend = await ticketed({ kinds: ["hawks"] });
    await ready(page, { backend });
    await showTicket(page, S.hawks);
    assert.equal(await page.evaluate(() => /(^|\s)[a-z]+-open(\s|$)/.test(document.getElementById("phone").className)), true);
    await closeTicket(page);
    assert.equal(await page.evaluate(() => /(^|\s)[a-z]+-open(\s|$)/.test(document.getElementById("phone").className)), false);
  },
});

cases.push({
  name: "the keyboard reaches Show ticket, the corner underneath, the seals and Back; each has a name",
  async run({ page }) {
    const backend = await ticketed({ kinds: ["hawks"] });
    await ready(page, { backend });
    await openRow(page, S.hawks);
    await page.focus(row(S.hawks) + " .r-tk");
    await page.keyboard.press("Enter");
    await ticketUp(page);
    assert.equal(await page.evaluate(() => document.activeElement.textContent), "Back to the check");
    const names = await page.evaluate(() => [...document.querySelectorAll("#tix button")].filter((b) => !b.closest("[hidden]")).map((b) => b.getAttribute("aria-label") || b.textContent));
    assert.deepEqual(names, ["Back to the check", "Flip up Izzah’s ticket", "Your ticket", "Izzah’s ticket"]);
    assert.equal(await page.evaluate(() => document.querySelector("#tix .ov").getAttribute("aria-label")), "Ticket: Blackhawks v. Blues");
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement.className), "nx");
    await page.keyboard.press("Enter");
    await until(async () => (await onTop(page)) === "Izzah", "Enter flips it");
  },
});

cases.push({
  name: "reduced motion: the ticket is simply there, no lift and no flip",
  async run({ page }) {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const backend = await ticketed({ kinds: ["hawks"] });
    await ready(page, { backend });
    await showTicket(page, S.hawks);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("#tix .f-tk")).animationName), "none");
    await flipUp(page);
    assert.equal(await onTop(page), "Izzah");
    assert.equal(await page.evaluate(() => document.getElementById("tix").getAnimations({ subtree: true }).filter((a) => (a.animationName === "lift" || a.animationName === "flip") && a.playState === "running").length), 0);
    assert.equal(await page.evaluate(() => [...document.querySelectorAll("#tix .pp-pg")].some((p) => p.classList.contains("is-flip"))), false);
  },
});

cases.push({
  name: "no ticket anywhere (or before migrate): no stub, no Show ticket, the stop as it was; no Ticket pictures row",
  async run({ page, newPhone }) {
    const backend = makeBackend({ ...WEEK, missingTabs: ["Tickets", "TicketData"], missingColumns: ["Stops.tk_ref", "Stops.tk_name", "Stops.tk_people", "Stops.tk_seat"] }, { now: NOW });
    await ready(page, { backend });
    await openRow(page, S.hawks);
    assert.equal(await page.evaluate(() => document.querySelectorAll("#rail .ts-on, #rail .r-tk").length), 0);
    assert.equal(await page.evaluate(() => document.getElementById("tix").hidden), true);
    assert.equal(backend.requests.some((b) => b.action === "ticket"), false);
    assert.equal(await page.evaluate(() => document.getElementById("setTix").hidden), true);
    const other = await newPhone();
    await ready(other, { backend: makeBackend(WEEK, { now: NOW }) });
    await openRow(other, S.hawks);
    assert.equal(await other.evaluate(() => document.querySelectorAll("#rail .ts-on, #rail .r-tk").length), 0);
  },
});

cases.push({
  name: "another phone removes a picture while the ticket is up: it goes from the ticket",
  async run({ page }) {
    const backend = await ticketed({ kinds: ["hawks"] });
    await ready(page, { backend });
    await allKept(page).catch(() => {});
    await until(() => solid(page, S.hawks), "kept");
    await showTicket(page, S.hawks);
    const t = backend.fake.tables.Tickets.find((x) => x.who === "Izzah");
    await as(backend, "removeTicket", { id: t.id }, "Mo");
    await advance(page, backend, 21000);
    await until(() => page.evaluate(() => document.querySelectorAll("#tix .pp-pg").length === 1), "one ticket left");
    assert.equal(await page.evaluate(() => document.querySelectorAll("#tix .nx, #tix .who").length), 0);
    await expectText(page, "#tix .tb span", "Mon Dec 28 · ticket");
  },
});

cases.push({
  name: "You: Ticket pictures says how it fetches, and one tap changes it (kept on the phone as chi.tixFetch)",
  async run({ page }) {
    const backend = await ticketed({ kinds: ["jazz"] });
    await ready(page, { backend });
    await page.dispatchEvent("#youBtn", "click");
    await until(() => page.evaluate(() => document.getElementById("you").classList.contains("is-open")), "You opens");
    await expectText(page, "#setTix", "Ticket picturesEvery phone keeps every ticket, so they open with no signal. Up to about 50 MB in all.On Wi‑Fi and mobile");
    await page.dispatchEvent("#setTix", "click");
    await expectText(page, "#setTixV", "Only when I open one");
    assert.equal(await page.evaluate(() => localStorage.getItem("chi.tixFetch")), "open");
    await page.dispatchEvent("#setTix", "click");
    await expectText(page, "#setTixV", "On Wi‑Fi and mobile");
    assert.equal(await page.evaluate(() => localStorage.getItem("chi.tixFetch")), "all");
  },
});

cases.push({
  name: "Only when I open one: nothing is fetched in the background; Show ticket fetches its own, and only those",
  async run({ page }) {
    const backend = await ticketed({ kinds: ["hawks", "art"] });
    await ready(page, { backend, storage: { "chi.tixFetch": "open" } });
    await advance(page, backend, 21000);
    await until(() => page.evaluate((sel) => !!document.querySelector(sel + " .ts.is-ghost"), row(S.hawks)), "not printed yet");
    assert.equal(backend.requests.filter((b) => b.action === "ticket").length, 0, "nothing in the background");
    await showTicket(page, S.hawks);
    await until(() => page.evaluate(() => document.querySelectorAll("#tix .stub-code img").length === 2), "the ticket fetches its two codes", 10000);
    const asked = backend.requests.filter((b) => b.action === "ticket").map((b) => b.args.id).sort();
    assert.deepEqual(asked, backend.fake.tables.Tickets.filter((t) => t.stop === S.hawks).map((t) => t.id).sort());
    await closeTicket(page);
    await until(() => solid(page, S.hawks), "its stub is printed");
    assert.equal(await page.evaluate((sel) => !!document.querySelector(sel + " .ts.is-ghost"), row(S.art)), true, "the others still need signal once");
  },
});

cases.push({
  name: "a picture that arrives mid-lift: the redrawn ticket carries the lift on, not jumping to the end",
  async run({ page }) {
    const backend = await ticketed({ kinds: ["hawks"] });
    let release;
    const held = new Promise((r) => (release = r));
    const plain = backend.handle.bind(backend);
    backend.handle = async (body) => {
      if (body && body.action === "ticket") await held;
      return plain(body);
    };
    await ready(page, { backend, storage: { "chi.tixFetch": "open" } });
    await openRow(page, S.hawks);
    await page.dispatchEvent(row(S.hawks) + " .r-tk", "click");
    await until(() => page.evaluate(() => !!document.querySelector("#tix:not([hidden]) .f-tk")), "the ticket is up");
    const lifting = await page.evaluate(() => {
      const a = document.querySelector("#tix .f-tk").getAnimations().find((x) => x.animationName === "lift");
      if (!a) return false;
      a.currentTime = 100;
      a.playbackRate = 0.001;
      return true;
    });
    assert.equal(lifting, true, "the ticket lifts");
    release();
    await until(() => page.evaluate(() => document.querySelectorAll("#tix .stub-code img").length === 2), "the two codes arrive");
    const after = await page.evaluate(() => {
      const s = document.querySelector("#tix .f-tk");
      const a = s.getAnimations().find((x) => x.animationName === "lift");
      return { up: s.classList.contains("is-up"), at: a ? a.currentTime : null };
    });
    assert.equal(after.up, false, "the redrawn ticket is still lifting");
    assert.ok(after.at !== null && after.at >= 90, "its lift goes on from where it was: " + after.at);
  },
});

// How many pictures this phone's keep holds.
const keptCount = (page) => page.evaluate(async () => {
  const names = (await indexedDB.databases()).map((d) => d.name);
  if (!names.includes("chi-tickets")) return 0;
  return new Promise((resolve) => {
    const r = indexedDB.open("chi-tickets");
    r.onsuccess = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains("pics")) {
        db.close();
        resolve(0);
        return;
      }
      const q = db.transaction("pics", "readonly").objectStore("pics").getAllKeys();
      q.onsuccess = () => { db.close(); resolve(q.result.length); };
      q.onerror = () => { db.close(); resolve(-1); };
    };
    r.onerror = () => resolve(-1);
  });
});

cases.push({
  name: "a refused key: the ticket closes, every check and its stubs leave the page, no picture is drawn",
  async run({ page }) {
    const backend = await ticketed({ kinds: ["hawks", "jazz"] });
    await ready(page, { backend, own: "Izzah" });
    await until(() => solid(page, S.hawks), "kept");
    await showTicket(page, S.hawks);
    backend.fake.world.cancelLinkForPerson2(); // Izzah
    await page.evaluate(() => globalThis.__matTest.store.checkRev());
    await until(() => visible(page, "#gate"), "the no-key screen shows");
    await until(async () => (await keptCount(page)) === 0, "no picture is left on the phone");
    assert.equal(await page.evaluate(() => document.getElementById("tix").hidden), true);
    assert.equal(await page.evaluate(() => document.querySelectorAll("#rail .tk, img[src^='blob:']").length), 0);
    assert.equal(await page.evaluate(() => document.body.textContent.includes("JZ-5512") || document.body.textContent.includes("ZX4K9Q")), false, "no reference stays in the page");
  },
});

cases.push({
  name: "Forget this phone with the ticket up takes every picture off",
  async run({ page }) {
    const backend = await ticketed({ kinds: ["hawks"] });
    await ready(page, { backend, own: "Mo" });
    await until(() => solid(page, S.hawks), "kept");
    await showTicket(page, S.hawks);
    await page.keyboard.press("Escape");
    await page.dispatchEvent("#youBtn", "click");
    await until(() => page.evaluate(() => document.getElementById("you").classList.contains("is-open")), "You opens");
    await page.dispatchEvent("#setForget", "click");
    await page.dispatchEvent("#setForget", "click");
    await until(() => visible(page, "#gate"), "the no-key screen shows");
    await until(async () => (await keptCount(page)) === 0, "no picture is left on the phone");
    assert.equal(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("chi.")).length), 0);
    assert.equal(await text(page, "#rail"), "");
  },
});

module.exports = cases;
