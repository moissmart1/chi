// Add tickets, look F (js/views/bulkadd.js, js/bulk.js): many files and the
// list at once, opened from You. The sure ones come out clipped together,
// the loose ones ask "Which check?", the red stapler adds them all through
// the same addTicket path as a stop's Edit sheet. Ported from the Japan
// app's version 31 tests, with its fix rounds. Everything is made up: the
// files are drawn here (tests/e2e/pictures.cjs), the list's references and
// seats are invented. The week is tests/e2e/tix-fixture.cjs; 18:40 on Mon Dec 28.

const assert = require("node:assert/strict");
const { open, makeBackend, until, text, expectText, visible } = require("./helpers.cjs");
const { pngBytes, pdfBytes } = require("./pictures.cjs");
const { NOW, S, WEEK, shot } = require("./tix-fixture.cjs");

// The list, in the same format as the Japan app's (js/bulk.js REQUIRED and its header).
const HEAD = "ticket_id,booking_key,start_date,start_time,end_date,end_time,type,title,provider,confirmation,traveler,ticket_ref,seat,holder,how_to_use,file_url,manage_url,deadline,deadline_what,notes,status,book_now_no,updated,added_by";
const COLS = HEAD.split(",");
const row = (o) => COLS.map((c) => {
  const v = o[c] === undefined ? "" : String(o[c]);
  return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}).join(",");
const LIST = "﻿" + [HEAD,
  row({ ticket_id: "T001", start_date: "2026-12-28", start_time: "22:15", type: "activity", title: "Jazz, late set", provider: "Jazz Co", confirmation: "JZ-5512", traveler: "ALL", holder: "MO", notes: "two lines,\nwith a comma", status: "active" }),
  row({ ticket_id: "T005", start_date: "2026-12-28", start_time: "19:30", type: "activity", title: "Hockey", confirmation: "ZX4K9Q", traveler: "Mo", seat: "Sec 112 Row 8 Seat 4", status: "active" }),
  row({ ticket_id: "T006", start_date: "2026-12-28", start_time: "19:30", type: "activity", title: "Hockey", confirmation: "ZX4K9Q", traveler: "Izzah", seat: "Sec 112 Row 8 Seat 5", status: "active" }),
  row({ ticket_id: "T008", start_date: "2026-12-30", start_time: "11:00", type: "activity", title: "Field Museum entry", ticket_ref: "FM99120", traveler: "ALL", status: "active" }),
  row({ ticket_id: "T009", start_date: "2027-01-01", start_time: "13:05", type: "flight", title: "No file for this one", status: "active" }),
  row({ ticket_id: "T010", start_date: "2026-12-28", start_time: "22:15", type: "activity", title: "Old booking", status: "cancelled" }),
  row({ ticket_id: "T012", start_date: "2026-12-30", start_time: "23:30", type: "activity", title: "Comedy show", status: "active" }),
  row({ ticket_id: "T020", start_date: "2026-12-29", start_time: "10:00", type: "activity", title: "Calendar entry", status: "active" }),
].join("\r\n") + "\r\n";

const file = (name, mimeType, buffer) => ({ name, mimeType, buffer });
const FILES = () => [
  file("T001 Jazz.png", "image/png", pngBytes(360, 360, 11)),
  file("T005 Mo.png", "image/png", pngBytes(300, 300, 15)),
  file("T006 Izzah.png", "image/png", pngBytes(300, 300, 16)),
  file("T008 Field e-ticket.pdf", "application/pdf", pdfBytes(2)),
  file("T010 old.png", "image/png", pngBytes(300, 300, 20)),
  file("river cruise.png", "image/png", pngBytes(320, 320, 30)),
  file("T012 Comedy.png", "image/png", pngBytes(300, 300, 19)),
  file("T020 cal.ics", "text/calendar", Buffer.from("BEGIN:VCALENDAR\nEND:VCALENDAR\n")),
];
const listFile = () => file("Tickets.csv", "text/csv", Buffer.from(LIST, "utf8"));

async function ready(page, opts = {}) {
  const backend = await open(page, { nowMs: NOW, ...opts });
  await until(() => page.evaluate(() => document.querySelectorAll("#rail .pg").length > 0), "the app draws");
  // pdf.js and the sheet wait on timers: let the page's clock run.
  await page.clock.resume();
  return backend;
}
const sheetUp = (page, id) => page.evaluate((id) => {
  const s = document.getElementById(id);
  return !!s && s.classList.contains("is-open") && Math.abs(s.getBoundingClientRect().bottom - innerHeight) < 1;
}, id);
async function openBulk(page) {
  await page.dispatchEvent("#youBtn", "click");
  await until(() => sheetUp(page, "you"), "You opens");
  await until(() => page.evaluate(() => !document.getElementById("setBulk").hidden), "the Add tickets row shows");
  await page.evaluate(() => document.getElementById("setBulk").scrollIntoView({ block: "center" }));
  await page.dispatchEvent("#setBulk", "click");
  await until(() => sheetUp(page, "bulk"), "Add tickets opens");
}
const sorted = (page, n) => until(() => page.evaluate((n) => {
  const t = document.querySelector("#bulk .sheet-top i");
  return !!t && t.textContent.startsWith(n + (n === 1 ? " file" : " files")) && !document.querySelector("#bulk .prog");
}, n), n + " files sorted", 20000);
const added = (page) => until(() => page.evaluate(() => !!document.querySelector("#bulk .big")), "added", 30000);
const noSideways = (page) => page.evaluate(() => {
  const s = document.getElementById("bulk");
  const r = s.getBoundingClientRect();
  const over = [...s.querySelectorAll("*")].filter((e) => e.getClientRects().length && e.getBoundingClientRect().right > r.right + 0.5).map((e) => e.className || e.tagName);
  return { doc: document.scrollingElement.scrollWidth <= innerWidth, sheet: s.scrollWidth <= s.clientWidth, over };
});
const calls = (backend, action) => backend.requests.filter((b) => b.action === action);
const toTop = (page) => page.evaluate(() => { document.getElementById("bulk").scrollTop = 0; });
const lines = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s)].map((a) => a.textContent.replace(/\s+/g, " ").trim()), sel);

const cases = [];

cases.push({
  name: "393: the list and eight files; the sure ones clipped together, a loose one answered and one left; Staple adds through addTicket, facts only where empty; Not added; Open Day",
  viewport: { width: 393, height: 852 },
  async run({ page }) {
    const backend = makeBackend({ ...WEEK, stops: WEEK.stops.map((s) => (s.id === S.field ? { ...s, tkRef: "KEEP-1" } : s)) }, { now: NOW });
    await ready(page, { backend });
    await openBulk(page);
    // Empty: the envelope, the two keys, the stapler at rest, nothing sent.
    assert.equal(await page.getAttribute("#bulk", "role"), "dialog");
    await expectText(page, "#bulk .sheet-top", "Add ticketsCancel");
    await expectText(page, "#bulk .env", "Drop the ticket files here.PDFs and pictures, all at once. Add the list (.csv) too if you have it: fewer to check by hand.Choose filesPDF · PNG · JPGChoose list.csv, optional");
    await expectText(page, "#bulk .f-rest .fine", "Yours or Izzah’s. Wendy’s finds each one’s check; you only look at the odd ones. Nothing is sent until Staple.");
    assert.equal(await page.evaluate(() => document.activeElement.id), "bulkTop");
    await shot(page, "F-3-bulk-1-empty-393");

    await page.setInputFiles("#bulkList", listFile());
    await expectText(page, "#bulkChooseList", "List chosen8 lines");
    const before = backend.requests.length;
    await page.setInputFiles("#bulkFiles", FILES());
    await sorted(page, 8);
    assert.equal(backend.requests.slice(before).some((b) => b.action === "addTicket" || b.action === "updateStop"), false, "nothing is sent before Staple");
    await expectText(page, "#bulk .sheet-top i", "8 files · list of 8");
    await expectText(page, "#bulk .ba-bundle .d-band", "4 sorted, clipped togetherD3 to D5 · 3 stops · 2 one eachUnclip ›");
    // The top stub of the pile: the stop with one each, two seals.
    await expectText(page, "#bulk .pile .ts:last-of-type .ts-n", "Blackhawks v. Blues");
    await expectText(page, "#bulk .pile .ts:last-of-type .ts-k", "MON 19:30 · ONE EACH");
    assert.equal(await page.evaluate(() => document.querySelectorAll("#bulk .pile .ts:last-of-type .chip").length), 2);
    // The first loose one: the file with no line, two stops by its name.
    await expectText(page, "#bulk .secl", /^Loose ones to look at · 1 of 2/);
    await expectText(page, "#bulk .f-odd .odd-h", "Which check?not on the list");
    await expectText(page, "#bulk .f-odd .odd-t b", "Two stops have this name.");
    await expectText(page, "#bulk .f-odd .thumb small", "river cruise.png");
    assert.deepEqual(await lines(page, "#bulk .f-odd [data-choice]"), ["Date12/29Tue 10:00Architecture river cruise›", "Date12/31Thu 16:30River cruise, sunset›"]);
    await until(() => page.evaluate(() => { const i = document.querySelector("#bulk .f-odd .thumb img"); return !!i && i.naturalWidth > 0; }), "the loose one shows its picture");
    await expectText(page, "#bulk .f-nxo", "T012 · Comedy showno stop on D5");
    assert.deepEqual(await lines(page, "#bulk .quiet-l"), [
      "×1 isn’t a ticket file: T020 cal.ics. Left out.",
      "–1 not active on the list: T010 · Old booking (cancelled). Left out.",
      "–1 line on the list has no file here.",
    ]);
    await expectText(page, "#bulk .meter", "Pictures on the trip: 0 now, 5 after this · of 120");
    await expectText(page, "#bulkPunch", "Staple 4 nowthe 2 not looked at stay out · on both phones");
    assert.deepEqual(await noSideways(page), { doc: true, sheet: true, over: [] });
    await toTop(page);
    await shot(page, "F-3-bulk-2-sorted-393");

    // Unclip: the bundle as a list by day; a line opens to change it, then clip again.
    await page.click('#bulk [data-act="untie"]');
    assert.deepEqual(await lines(page, "#bulk .ba-lh"), ["D3 Mon", "D5 Wed"]);
    assert.equal(await page.evaluate(() => document.querySelectorAll("#bulk .ba-line").length), 4);
    await page.click("#bulk .ba-lh + .ba-line .ba-lb");
    await until(() => page.evaluate(() => !!document.querySelector("#bulk .ba-ed select")), "the line opens");
    await page.click('#bulk [data-act="untie"]');

    // The loose one: Tue's cruise.
    await page.click('#bulk .f-odd [data-choice$="|0"]');
    await expectText(page, "#bulk .secl", /^Loose ones to look at · 2 of 2/);
    await expectText(page, "#bulk .f-odd .odd-t b", "No stop on Day 5 at 23:30.");
    await expectText(page, "#bulk .ba-bundle .d-band", /^5 sorted, clipped together/);
    await expectText(page, "#bulkPunch", "Staple 5 nowthe 1 not looked at stays out · on both phones");

    // Staple: through the same path as a stop's Edit sheet.
    await page.click("#bulkPunch");
    await added(page);
    await expectText(page, "#bulk .sheet-top", "Add ticketsstapledDone");
    await expectText(page, "#bulk .big", "5 tickets added to 4 stops.");
    await expectText(page, "#bulk .after", "6 pictures, kept in the trip. Izzah’s phone shows them on its stops the next time it opens Wendy’s with signal.");
    await expectText(page, "#bulk .f-rest .d-band", "5 stapled4 sorted + 1 you checkedSee all ›");
    assert.equal(await page.evaluate(() => document.querySelectorAll("#bulk .f-row i").length), 5);
    assert.equal(calls(backend, "addTicket").length, 6);
    const rows = backend.fake.tables.Tickets.map((r) => [r.stop, r.who, r.seat, String(r.page)]).sort();
    assert.deepEqual(rows, [
      [S.hawks, "Izzah", "Sec 112 Row 8 Seat 5", "1"], [S.hawks, "Mo", "Sec 112 Row 8 Seat 4", "1"],
      [S.jazz, "", "", "1"], [S.field, "", "", "1"], [S.field, "", "", "2"], [S.boat, "", "", "1"],
    ].sort());
    // The facts: only where the stop's own field was empty.
    const st = (id) => backend.fake.tables.Stops.find((s) => s.id === id);
    assert.deepEqual([st(S.jazz).tk_ref, st(S.jazz).tk_name], ["JZ-5512", "MO"]);
    assert.equal(st(S.hawks).tk_ref, "ZX4K9Q");
    assert.equal(st(S.field).tk_ref, "KEEP-1", "never overwritten");
    assert.deepEqual(await lines(page, "#bulk .nol > div"), [
      "T012 · Comedy showleft out: no stop on D5",
      "T010 · Old bookingon the list as cancelled",
      "T020 cal.icsnot a ticket file",
    ]);
    await expectText(page, "#bulk .secl", "Not added · 3");
    await page.click('#bulk [data-act="seeall"]');
    assert.equal(await page.evaluate(() => document.querySelectorAll("#bulk .ba-list .ba-line").length), 5);
    await page.click('#bulk [data-act="seeall"]');
    assert.deepEqual(await noSideways(page), { doc: true, sheet: true, over: [] });
    await toTop(page);
    await shot(page, "F-3-bulk-3-added-393");
    await expectText(page, "#bulkOpenDay", "Open Day 3 · see the tickets");
    await page.click("#bulkOpenDay");
    await until(() => page.evaluate(() => !document.getElementById("bulk").classList.contains("is-open") && !document.getElementById("you").classList.contains("is-open") && document.getElementById("vDays").classList.contains("is-active")), "Days shows");
    await expectText(page, "#dayCount", /^Day 3 of 7/);
    // Done starts afresh.
    await openBulk(page);
    await expectText(page, "#bulk .big", "5 tickets added to 4 stops.");
    await page.click("#bulkTop");
    await openBulk(page);
    await until(() => page.evaluate(() => !!document.querySelector("#bulk .env")), "empty again");
    assert.equal(await text(page, "#bulk .sheet-top i"), "");
  },
});

cases.push({
  name: "already there is left out; with no signal the pictures wait on the phone and go up when it returns",
  async run({ page }) {
    const backend = makeBackend(WEEK, { now: NOW });
    await ready(page, { backend });
    const jazz = () => file("T001 Jazz.png", "image/png", pngBytes(360, 360, 11));
    await openBulk(page);
    await page.setInputFiles("#bulkList", listFile());
    await page.setInputFiles("#bulkFiles", [jazz()]);
    await sorted(page, 1);
    await page.click("#bulkPunch");
    await added(page);
    assert.equal(backend.fake.tables.Tickets.length, 1);
    await page.click("#bulkTop");
    await openBulk(page);
    await page.setInputFiles("#bulkList", listFile());
    await page.setInputFiles("#bulkFiles", [jazz(), file("T005 Mo.png", "image/png", pngBytes(300, 300, 15))]);
    await sorted(page, 2);
    await expectText(page, "#bulk .quiet-l", "2×1 already there: T001 · Jazz, late set is on Jazz, late set. Left out.");
    await expectText(page, "#bulkPunch", /^Staple 1 now/);
    backend.failWith = "network";
    await page.context().setOffline(true);
    await page.click("#bulkPunch");
    await added(page);
    await expectText(page, "#bulk .big", "1 ticket added to 1 stop.");
    await expectText(page, "#bulk .after", /They wait on this phone and go up when there is signal\.$/);
    await expectText(page, "#bulk .ba-wait", "T005 · Blackhawks v. Blueson this phone, goes up when there is signal");
    assert.equal(backend.fake.tables.Tickets.length, 1, "nothing reached the trip");
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("chi.queue") || "[]").filter((o) => o.ticket && o.ticket.who === "Mo" && !("data" in o.ticket)).length), 1);
    backend.failWith = null;
    await page.context().setOffline(false);
    await until(() => backend.fake.tables.Tickets.length === 2, "the waiting picture goes up", 15000);
    const mo = backend.fake.tables.Tickets.find((r) => r.who === "Mo");
    assert.deepEqual([mo.stop, mo.seat], [S.hawks, "Sec 112 Row 8 Seat 4"]);
  },
});

cases.push({
  name: "320: fits with no sideways scroll, empty and sorted; a refused list says so and the files are matched without it",
  viewport: { width: 320, height: 568 },
  async run({ page }) {
    const backend = makeBackend(WEEK, { now: NOW });
    await ready(page, { backend });
    await openBulk(page);
    assert.deepEqual(await noSideways(page), { doc: true, sheet: true, over: [] });
    await shot(page, "F-3-bulk-1-empty-320");
    await page.setInputFiles("#bulkList", file("bad.csv", "text/csv", Buffer.from("ticket_id,title\nT001,Thing\n")));
    await expectText(page, "#bulk .quiet-l.is-warn", "!The list has no start_date column, so it wasn’t used. The files are matched without it.");
    await page.setInputFiles("#bulkFiles", [
      file("T001 Jazz.png", "image/png", pngBytes(360, 360, 11)),
      file("river cruise with a very long file name to wrap on a small phone.png", "image/png", pngBytes(320, 320, 30)),
    ]);
    await sorted(page, 2);
    await expectText(page, "#bulk .secl", /^Loose ones to look at · 1 of 2/);
    await expectText(page, "#bulkPunch", /^Nothing to staple yet/);
    assert.equal(await page.evaluate(() => document.getElementById("bulkPunch").disabled), true);
    assert.deepEqual(await noSideways(page), { doc: true, sheet: true, over: [] });
    await page.click("#bulk [data-other]");
    await page.selectOption("#bulk [data-pick-for]", S.sunset);
    await page.click("#bulk [data-put]");
    await expectText(page, "#bulk .secl", /^Loose ones to look at · 2 of 2/);
    assert.deepEqual(await noSideways(page), { doc: true, sheet: true, over: [] });
    await toTop(page);
    await shot(page, "F-3-bulk-2-sorted-320");
    const other = await page.$("#bulk [data-other]");
    if (other) await other.click();
    await page.click("#bulk .f-odd [data-out]");
    await expectText(page, "#bulk .secl", "All 2 looked at");
    await expectText(page, "#bulkPunch", "Staple 1 nowon both phones");
  },
});

cases.push({
  name: "844 sideways: the sheet fits with no sideways scroll (over the rail, as You does); sorted and added",
  viewport: { width: 844, height: 390 },
  async run({ page }) {
    const backend = makeBackend(WEEK, { now: NOW });
    await ready(page, { backend });
    await openBulk(page);
    await page.setInputFiles("#bulkList", listFile());
    await page.setInputFiles("#bulkFiles", FILES().slice(0, 4));
    await sorted(page, 4);
    assert.deepEqual(await noSideways(page), { doc: true, sheet: true, over: [] });
    await page.click("#bulkPunch");
    await added(page);
    assert.deepEqual(await noSideways(page), { doc: true, sheet: true, over: [] });
  },
});

cases.push({
  name: "1440: the sheet in the Money pane; files and the list dropped on it; a loose one answered from the keyboard; Staple from the keyboard; Escape back to You",
  viewport: { width: 1440, height: 900 },
  mobile: false,
  async run({ page }) {
    const backend = makeBackend(WEEK, { now: NOW });
    await ready(page, { backend });
    await page.click("#youBtn");
    await until(() => sheetUp(page, "you"), "You opens");
    await page.focus("#setBulk");
    await page.keyboard.press("Enter");
    await until(() => sheetUp(page, "bulk"), "Add tickets opens");
    const box = await page.evaluate(() => {
      const s = document.getElementById("bulk").getBoundingClientRect();
      const m = document.getElementById("vMoney").getBoundingClientRect();
      return { left: Math.round(s.left - m.left), right: Math.round(m.right - s.right) };
    });
    assert.ok(Math.abs(box.left) <= 2 && Math.abs(box.right) <= 2, "over the Money pane: " + JSON.stringify(box));
    const drop = FILES().slice(0, 6).concat([listFile()]).map((f) => ({ name: f.name, type: f.mimeType, b64: f.buffer.toString("base64") }));
    await page.evaluate((list) => {
      const dt = new DataTransfer();
      for (const f of list) {
        const bin = atob(f.b64);
        const u = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        dt.items.add(new File([u], f.name, { type: f.type }));
      }
      const s = document.getElementById("bulk");
      s.dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true, cancelable: true }));
      s.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, drop);
    await sorted(page, 6);
    await expectText(page, "#bulk .sheet-top i", "6 files · list of 8");
    await toTop(page);
    await shot(page, "F-3-bulk-2-sorted-1440");
    await page.focus("#bulk .f-odd [data-choice]");
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement.dataset.choice || ""), await page.evaluate(() => document.querySelectorAll("#bulk .f-odd [data-choice]")[1].dataset.choice));
    await page.keyboard.press("Enter");
    await expectText(page, "#bulk .ba-bundle .d-band", /^5 sorted/);
    assert.deepEqual(await noSideways(page), { doc: true, sheet: true, over: [] });
    await page.focus("#bulkPunch");
    await page.keyboard.press("Enter");
    await added(page);
    assert.equal(backend.fake.tables.Tickets.filter((r) => r.stop === S.sunset).length, 1, "the second choice, Thu's cruise");
    await page.keyboard.press("Escape");
    await until(() => page.evaluate(() => !document.getElementById("bulk").classList.contains("is-open") && document.activeElement.id === "youBtn"), "closed, focus on You");
  },
});

// ---------- the Japan app's fix rounds ----------

const keptIds = (page) => page.evaluate(async () => {
  const names = (await indexedDB.databases()).map((d) => d.name);
  if (!names.includes("chi-tickets")) return [];
  return new Promise((resolve) => {
    const r = indexedDB.open("chi-tickets");
    r.onsuccess = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains("pics")) {
        db.close();
        resolve([]);
        return;
      }
      const q = db.transaction("pics", "readonly").objectStore("pics").getAllKeys();
      q.onsuccess = () => { db.close(); resolve(q.result.map(String)); };
      q.onerror = () => { db.close(); resolve([]); };
    };
    r.onerror = () => resolve([]);
  });
});
const queued = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("chi.queue") || "[]").filter((o) => o.ticket).map((o) => ({ id: o.ticket.id, data: "data" in o.ticket })));
const drawn = (page) => until(() => page.evaluate(() => document.querySelectorAll("#rail .pg").length > 0), "the app draws");

cases.push({
  name: "I2 and R1: no signal halfway through, Wendy’s closed and opened again, then signal: every confirmed ticket arrives exactly once, one at a time",
  async run({ page }) {
    const backend = makeBackend(WEEK, { now: NOW });
    await ready(page, { backend });
    await openBulk(page);
    await page.setInputFiles("#bulkList", listFile());
    await page.setInputFiles("#bulkFiles", FILES().slice(0, 4));
    await sorted(page, 4);
    const handle = backend.handle;
    let landed = 0;
    let out = 0;
    let most = 0;
    let sent = 0;
    const held = [];
    backend.handle = async (body) => {
      if (body.action !== "addTicket") return handle(body);
      sent += 1;
      out += 1;
      most = Math.max(most, out);
      try {
        await new Promise((r) => setTimeout(r, 40));
        if (landed >= 2) {
          held.push(body);
          backend.failWith = "network";
          throw new Error("network");
        }
        landed += 1;
        return await handle(body);
      } finally {
        out -= 1;
      }
    };
    await page.click("#bulkPunch");
    await until(() => held.length === 1, "two land, the third gets no reply", 20000);
    await until(async () => (await queued(page)).length === 3, "the three not landed are in chi.queue");
    assert.equal(sent, 3);
    assert.equal(most, 1, "at most one ticket request in flight");
    const q = await queued(page);
    assert.equal(q.some((x) => x.data), false, "no picture data in chi.queue");
    const kept = await keptIds(page);
    for (const x of q) assert.ok(kept.includes(x.id), "kept: " + x.id);
    await added(page);
    assert.equal(backend.fake.tables.Tickets.length, 2);
    backend.failWith = "network";
    await page.reload();
    await page.clock.resume();
    await drawn(page);
    assert.deepEqual((await queued(page)).map((x) => x.id).sort(), q.map((x) => x.id).sort(), "still waiting after the reload");
    assert.equal((await backend.fake(held[0])).ok, true);
    backend.failWith = null;
    landed = -100;
    await page.evaluate(() => globalThis.__matTest.store.checkRev());
    await until(async () => backend.fake.tables.Tickets.length === 5 && (await queued(page)).length === 0, "every confirmed ticket arrives", 20000);
    await page.evaluate(() => globalThis.__matTest.store.idle());
    assert.equal(most, 1, "at most one in flight after the reload too");
    const rows = backend.fake.tables.Tickets;
    assert.equal(new Set(rows.map((r) => r.id)).size, 5, "exactly once");
    for (const r of rows) assert.ok(backend.fake.tables.TicketData.some((d) => d.ticket === r.id), "data for " + r.id);
  },
});

cases.push({
  name: "R2: a trip load landing mid-run takes no picture off the phone; with no signal after it and Wendy’s reloaded, all arrive exactly once",
  async run({ page }) {
    const backend = makeBackend(WEEK, { now: NOW });
    await ready(page, { backend });
    await openBulk(page);
    await page.setInputFiles("#bulkList", listFile());
    await page.setInputFiles("#bulkFiles", FILES().slice(0, 4));
    await sorted(page, 4);
    const handle = backend.handle;
    let release;
    const gate = new Promise((r) => (release = r));
    let seen = 0;
    backend.handle = async (body) => {
      if (body.action === "addTicket") {
        seen += 1;
        if (seen === 1) {
          await gate;
          backend.failWith = "network";
          throw new Error("network");
        }
      }
      return handle(body);
    };
    await page.click("#bulkPunch");
    await until(() => seen >= 1, "the first picture leaves", 20000);
    const other = await handle({ key: "test-key", actor: "Izzah", action: "updateStop", args: { id: S.jazz, patch: { tkRef: "OTHER-2" } } });
    assert.equal(other.ok, true, other.message);
    await page.evaluate(() => globalThis.__matTest.store.checkRev());
    await until(() => page.evaluate((id) => globalThis.__matTest.store.state.stops.find((s) => s.id === id).tkRef === "OTHER-2", S.jazz), "this phone has the other phone's change");
    release();
    await added(page);
    await until(async () => (await queued(page)).length === 5, "all five wait on the phone");
    const q = await queued(page);
    await until(async () => {
      const kept = await keptIds(page);
      return q.every((x) => kept.includes(x.id));
    }, "every one of them is in the keep");
    await page.reload();
    await page.clock.resume();
    await drawn(page);
    backend.failWith = null;
    await page.evaluate(() => globalThis.__matTest.store.checkRev());
    await until(async () => backend.fake.tables.Tickets.length === 5 && (await queued(page)).length === 0, "every picture arrives", 20000);
    assert.equal(new Set(backend.fake.tables.Tickets.map((r) => r.id)).size, 5);
    assert.equal(await page.evaluate(() => globalThis.__matTest.store.state.notice || ""), "", "no lost-picture notice");
  },
});

cases.push({
  name: "I1: a stop's details filled on another phone while the pictures go up are not overwritten; it is listed",
  async run({ page }) {
    const backend = makeBackend(WEEK, { now: NOW });
    await ready(page, { backend });
    await openBulk(page);
    await page.setInputFiles("#bulkList", listFile());
    await page.setInputFiles("#bulkFiles", FILES().slice(0, 3));
    await sorted(page, 3);
    const handle = backend.handle;
    let release;
    const gate = new Promise((r) => (release = r));
    let seen = 0;
    backend.handle = async (body) => {
      if (body.action === "addTicket") {
        seen += 1;
        await gate;
      }
      return handle(body);
    };
    await page.click("#bulkPunch");
    await until(() => seen >= 1, "the pictures leave", 20000);
    const other = await handle({ key: "test-key", actor: "Izzah", action: "updateStop", args: { id: S.jazz, patch: { tkRef: "OTHER-1" } } });
    assert.equal(other.ok, true, other.message);
    await page.evaluate(() => globalThis.__matTest.store.checkRev());
    await until(() => page.evaluate((id) => globalThis.__matTest.store.state.stops.find((s) => s.id === id).tkRef === "OTHER-1", S.jazz), "this phone has the other phone's reference");
    release();
    await added(page);
    backend.handle = handle;
    const st = (id) => backend.fake.tables.Stops.find((s) => s.id === id);
    assert.equal(st(S.jazz).tk_ref, "OTHER-1", "never overwritten");
    assert.equal(st(S.jazz).tk_name, "", "a stop changed since the sort gets none of the list's details");
    assert.equal(st(S.hawks).tk_ref, "ZX4K9Q", "an unchanged stop's empty field is filled");
    assert.ok((await lines(page, "#bulk .nol > div")).includes("Jazz, late setdetails not filled: changed on another phone"));
    await expectText(page, "#bulk .quiet-l.is-warn", "!Details not filled can be added from the stop’s Edit sheet.");
  },
});

const SECRET_WORDS = ["T001", "T012", "Comedy", "Jazz.png", "river cruise", "JZ-5512", "ZX4K9Q", "cal.ics", "Tickets.csv"];
for (const how of ["Forget this phone", "a refused key"]) {
  cases.push({
    name: "I3: " + how + " with a sort held and the sheet closed: nothing of it stays, its pictures' addresses revoked",
    async run({ page }) {
      const backend = makeBackend(WEEK, { now: NOW });
      await ready(page, { backend, own: "Mo" });
      await openBulk(page);
      await page.setInputFiles("#bulkList", listFile());
      await page.setInputFiles("#bulkFiles", FILES());
      await sorted(page, 8);
      await until(() => page.evaluate(() => { const i = document.querySelector("#bulk .f-odd .thumb img"); return !!i && i.naturalWidth > 0; }), "the loose one's picture shows");
      const srcs = await page.evaluate(() => [...document.querySelectorAll("#bulk img")].map((i) => i.src).filter((u) => u.startsWith("blob:")));
      assert.ok(srcs.length > 0);
      await page.keyboard.press("Escape");
      await until(() => page.evaluate(() => !document.getElementById("bulk").classList.contains("is-open")), "closed");
      assert.ok((await page.evaluate(() => document.getElementById("bulk").textContent)).includes("T012"));
      await page.evaluate(() => {
        window.__revoked = [];
        const real = URL.revokeObjectURL;
        URL.revokeObjectURL = (u) => {
          window.__revoked.push(u);
          return real.call(URL, u);
        };
      });
      if (how === "a refused key") {
        backend.fake.world.cancelLinkForPerson1(); // Mo
        await page.evaluate(() => globalThis.__matTest.store.checkRev());
      } else {
        await page.dispatchEvent("#youBtn", "click");
        await until(() => page.evaluate(() => document.getElementById("you").classList.contains("is-open")), "settings open");
        await page.dispatchEvent("#setForget", "click");
        await page.dispatchEvent("#setForget", "click");
      }
      await until(() => visible(page, "#gate"), "the no-key screen shows", 10000);
      await until(() => page.evaluate(() => document.querySelector("#bulk .ba-body").childNodes.length === 0), "the sheet's body is emptied");
      const t = await page.evaluate(() => document.getElementById("bulk").textContent);
      for (const w of SECRET_WORDS) assert.equal(t.includes(w), false, w + " is still in the sheet");
      assert.equal(await page.evaluate(() => document.querySelectorAll("#bulk img").length), 0);
      assert.equal(await page.evaluate(() => document.getElementById("bulkFiles").files.length + document.getElementById("bulkList").files.length), 0);
      const revoked = await page.evaluate(() => window.__revoked);
      for (const u of srcs) assert.ok(revoked.includes(u), "revoked: " + u);
    },
  });
}

// What the worker sends each open page when a new version takes over (as tests/e2e/update.e2e.cjs).
const announce = (page) => page.evaluate(() => new Promise((resolve) => {
  const ch = new MessageChannel();
  ch.port1.onmessage = () => resolve(true);
  navigator.serviceWorker.dispatchEvent(new MessageEvent("message", { data: { type: "chi-new-version" }, ports: [ch.port2] }));
  setTimeout(() => resolve(false), 500);
}));
const markPage = (page) => page.evaluate(() => { window.__notReloaded = true; });
const reloaded = (page) => page.evaluate(() => window.__notReloaded !== true).catch(() => true);
// Pictures are held where the phone makes them (canvas.toBlob) until let go.
const holdPictures = (page) => page.evaluate(() => {
  const real = HTMLCanvasElement.prototype.toBlob;
  window.__held = [];
  HTMLCanvasElement.prototype.toBlob = function (...a) {
    window.__held.push(() => real.apply(this, a));
  };
  window.__letGo = () => {
    HTMLCanvasElement.prototype.toBlob = real;
    for (const f of window.__held.splice(0)) f();
  };
});

cases.push({
  name: "I4: with the sheet closed, a new release waits while files are read; it reloads once they are",
  async run({ page }) {
    const backend = makeBackend(WEEK, { now: NOW });
    await ready(page, { backend });
    await openBulk(page);
    await holdPictures(page);
    await page.setInputFiles("#bulkFiles", [file("T008 Field e-ticket.pdf", "application/pdf", pdfBytes(2))]);
    await until(() => page.evaluate(() => window.__held.length > 0), "reading is under way", 20000);
    await page.keyboard.press("Escape");
    await until(() => page.evaluate(() => !document.getElementById("phone").classList.contains("bulk-open")), "closed");
    await markPage(page);
    assert.equal(await announce(page), true, "the page answers");
    await page.clock.fastForward(7000);
    assert.equal(await reloaded(page), false, "not while files are read");
    await page.evaluate(() => window.__letGo());
    await until(() => reloaded(page), "then it reloads", 15000);
    await drawn(page);
  },
});

cases.push({
  name: "I4: with the sheet closed, a new release waits while adding; it reloads once the add is done, every picture in",
  async run({ page }) {
    const backend = makeBackend(WEEK, { now: NOW });
    await ready(page, { backend });
    await openBulk(page);
    await page.setInputFiles("#bulkList", listFile());
    await page.setInputFiles("#bulkFiles", [file("T008 Field e-ticket.pdf", "application/pdf", pdfBytes(2))]);
    await sorted(page, 1);
    await holdPictures(page);
    await page.click("#bulkPunch");
    await until(() => page.evaluate(() => window.__held.length > 0), "the pages are being made into pictures", 20000);
    await page.keyboard.press("Escape");
    await until(() => page.evaluate(() => !document.getElementById("phone").classList.contains("bulk-open")), "closed");
    await markPage(page);
    assert.equal(await announce(page), true, "the page answers");
    await page.clock.fastForward(7000);
    assert.equal(await reloaded(page), false, "not while adding");
    await page.evaluate(() => window.__letGo());
    await until(() => reloaded(page), "then it reloads", 20000);
    await drawn(page);
    await until(() => backend.fake.tables.Tickets.length === 2, "both pages went in", 15000);
  },
});

cases.push({
  name: "reduced motion: the stapler key and the choices do not move",
  async run({ page }) {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const backend = makeBackend(WEEK, { now: NOW });
    await ready(page, { backend });
    await openBulk(page);
    await page.setInputFiles("#bulkFiles", [file("river cruise.png", "image/png", pngBytes(320, 320, 30))]);
    await sorted(page, 1);
    const t = await page.evaluate(() => ["#bulkPunch", "#bulk .f-ch"].map((s) => getComputedStyle(document.querySelector(s)).transitionDuration));
    assert.ok(t.every((d) => parseFloat(d) <= 0.0001), t.join(" "));
  },
});

module.exports = cases;
