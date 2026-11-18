// The settlement slip and the stamp (Task 10): arming a spot, the amount
// really sent, landing the stamp, part payments, the 8-second disarm, the
// stamp's look surviving a reload, removing a stamp, folding, reduced
// motion, someone else's stamp counted as new, no signal, and a double tap.

const assert = require("node:assert/strict");
const P = require("../../backend/Pure.js");
// Three people (Mo, Izzah, Sam): the slip here has more than one debt.
const { THREE: SEED, NOON28, open, advance, until, text, expectText, visible } = require("./helpers.cjs");

// ---- small tools for this file ----

const NAMES = ["Mo", "Izzah", "Sam"];
const TODAY = "Mon Dec 28"; // NOON28, on Chicago time
const money = () => import("../../js/money.js");
const fmt = () => import("../../js/format.js");

const openRows = (page) =>
  page.$$eval("#slip .s-row.is-open", (rows) =>
    rows.map((r) => ({ key: r.dataset.key, who: r.querySelector(".s-who").textContent, amt: (r.querySelector(".s-amt") || {}).textContent })),
  );
const paidRows = (page) =>
  page.$$eval("#slip .s-row.is-paid", (rows) =>
    rows.map((r) => ({ id: r.dataset.pid, who: r.querySelector(".s-who").textContent, amt: r.querySelector(".s-amt").textContent, sub: r.querySelector(".s-sub").textContent })),
  );
const waitOpen = (page, n) => until(async () => (await openRows(page)).length === n, "expected " + n + " open rows on the slip");
const saved = (backend) => backend.fake.primitives.readTable_("Settlements").map(P.paymentFromRow);
const idle = (page) => page.evaluate(() => globalThis.__matTest.store.idle());
const spot = (key) => '#slip button.spot[data-key="' + key + '"]';
const armed = (page) => page.$$eval("#slip .spot.is-armed", (els) => els.map((e) => e.dataset.key));
const ubar = (page) => text(page, "#ubarT");
// paidStampSVG(seed) as the browser serialises it (innerHTML writes <stop></stop>, not <stop/>).
const asDrawn = async (page, seed) => {
  const { paidStampSVG } = await import("../../js/stamp.js");
  return page.evaluate((svg) => {
    const d = document.createElement("div");
    d.innerHTML = svg;
    return d.innerHTML;
  }, paidStampSVG(seed));
};
const otherPhone = (backend, actor, action, args) => backend.handle({ key: "test-key", actor, via: "app", action, args });

async function ready(page, opts = {}) {
  const backend = await open(page, { seed: SEED, nowMs: NOON28, ...opts });
  await until(() => page.evaluate(() => document.querySelectorAll("#rc .rc-row").length > 0), "the receipt draws");
  return backend;
}

async function arm(page, key) {
  await page.click(spot(key));
  await until(async () => (await armed(page)).includes(key), key + " is armed");
}

// The seed's open transfers with Simplify on: Sam → Mo $1,124.29, Izzah → Mo $224.72.
const pay = (o) => ({ id: "seedpay" + o.n + "aaaa", from: o.from || "Izzah", to: o.to || "Mo", cad: o.cad, seed: o.seed || 100 + o.n, rot: o.rot === undefined ? 2 : o.rot, stampedBy: o.by, stampedAt: o.at, removed: false });

module.exports = [
  {
    name: "the slip is titled 旅費精算書 and lists one row per open transfer, each with a spot",
    async run({ page }) {
      await ready(page);
      const { owedList } = await money();
      const { dollars } = await fmt();
      const list = owedList(NAMES, SEED.expenses, [], true);
      assert.equal(list.length, 2);
      await expectText(page, "#slip .slip-t b", "旅費精算書");
      await waitOpen(page, list.length);
      const rows = await openRows(page);
      assert.deepEqual(
        rows,
        list.map((t) => ({ key: t.from + ">" + t.to, who: t.from + " → you", amt: dollars(t.cents) })),
      );
      for (const t of list) assert.equal(await page.locator(spot(t.from + ">" + t.to)).count(), 1);
      await expectText(page, "#slip .slip-f", "Stamp it the moment you send. What’s left is always what’s shown here.");
      await expectText(page, "#simp .simp-l", "Simplify: fewest payments");
      assert.equal(await page.getAttribute("#simp", "aria-checked"), "true");
      // Legible: the slip's figures are Zen Kaku Gothic, never the dot face.
      const font = await page.evaluate(() => getComputedStyle(document.querySelector("#slip .s-amt")).fontFamily);
      assert.ok(!font.includes("DotGothic16"), font);
      assert.equal(await page.evaluate(() => document.getElementById("slip").scrollWidth <= document.getElementById("slip").clientWidth), true, "no sideways scroll");
    },
  },
  {
    name: "tapping a spot arms it with the amount, asks to confirm and saves nothing; no address, no #sendTo",
    async run({ page }) {
      const backend = await ready(page);
      await waitOpen(page, 2);
      await arm(page, "Izzah>Mo");
      assert.equal(await page.inputValue("#stampAmt"), "224.72");
      assert.equal(await page.getAttribute("#stampAmt", "inputmode"), "decimal");
      const size = await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById("stampAmt")).fontSize));
      assert.ok(size >= 16, "no zoom on focus: " + size);
      await expectText(page, '#slip .s-row[data-key="Izzah>Mo"] .s-sub', "Did it land? Tap again to stamp.");
      assert.equal(await page.locator("#sendTo").count(), 0, "Mo has no e-Transfer address");
      assert.deepEqual(await armed(page), ["Izzah>Mo"], "only one row armed");
      await idle(page);
      assert.equal(backend.fake.tables.Settlements.length, 0, "nothing saved yet");
      assert.equal(backend.requests.filter((r) => r.action === "addPayment").length, 0);

      // Arming another row disarms the first.
      await arm(page, "Sam>Mo");
      assert.deepEqual(await armed(page), ["Sam>Mo"]);
      assert.equal(await page.inputValue("#stampAmt"), "1124.29");
    },
  },
  {
    name: "with the recipient's e-Transfer address set, the armed row shows it and Copy puts it on the clipboard",
    async run({ page }) {
      await ready(page, { seed: { ...SEED, people: { Mo: { etransfer: "mo@example.com" } } } });
      await waitOpen(page, 2);
      assert.equal(await page.locator("#sendTo").count(), 0, "not until a row is armed");
      await arm(page, "Izzah>Mo");
      await expectText(page, '#slip .s-row[data-key="Izzah>Mo"] #sendTo', "mo@example.com");
      await page.click("#copyTo");
      await until(async () => (await page.evaluate(() => navigator.clipboard.readText())) === "mo@example.com", "the address is on the clipboard");
      await expectText(page, "#ubarT", "Address copied.");
    },
  },
  {
    name: "the second tap stamps: saved, drawn with the hit, paid today, #say moves, and Undo reopens it",
    async run({ page }) {
      const backend = await ready(page);
      await waitOpen(page, 2);
      await expectText(page, "#say", "You’re owed $1,349.01.");
      await arm(page, "Izzah>Mo");
      await page.click(spot("Izzah>Mo"));
      // Drawn at once, with the hit, before the backend answers.
      await until(async () => (await paidRows(page)).length === 1, "a stamped row");
      assert.equal(await page.locator("#slip .s-row.is-paid .stamp.hit").count(), 1, "the stamp lands with the hit");
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("#slip .stamp")).mixBlendMode), "multiply");
      await idle(page);
      const rows = saved(backend);
      assert.equal(rows.length, 1);
      assert.deepEqual({ from: rows[0].from, to: rows[0].to, cad: rows[0].cad, stampedBy: rows[0].stampedBy }, { from: "Izzah", to: "Mo", cad: 224.72, stampedBy: "Mo" });
      const [paid] = await paidRows(page);
      assert.deepEqual(paid, { id: rows[0].id, who: "Izzah → you", amt: "$224.72", sub: "Paid " + TODAY + ". Nothing more to send." });
      assert.deepEqual((await openRows(page)).map((r) => r.key), ["Sam>Mo"], "open transfers first, the transfer is gone");
      await expectText(page, "#say", "Sam owes you $1,124.29.");
      await expectText(page, "#ubarT", "Stamped $224.72 to Mo.");
      assert.ok(await visible(page, "#ubarU"));

      await page.click("#ubarU");
      await until(async () => (await paidRows(page)).length === 0, "the stamp comes off");
      await waitOpen(page, 2);
      await idle(page);
      assert.equal(saved(backend)[0].removed, true, "undone on the backend (marked, never erased)");
      await expectText(page, "#say", "You’re owed $1,349.01.");
    },
  },
  {
    name: "a part payment: change the amount to 100, the remainder stays open beside the stamped row",
    async run({ page }) {
      const backend = await ready(page);
      await waitOpen(page, 2);
      await arm(page, "Izzah>Mo"); // arm one, then another
      await arm(page, "Sam>Mo");
      await page.fill("#stampAmt", "100");
      await page.click(spot("Sam>Mo"));
      await idle(page);
      const rows = saved(backend);
      assert.equal(rows.length, 1);
      assert.deepEqual({ from: rows[0].from, to: rows[0].to, cad: rows[0].cad }, { from: "Sam", to: "Mo", cad: 100 });
      const open = await openRows(page);
      assert.deepEqual(open, [
        { key: "Sam>Mo", who: "Sam → you", amt: "$1,024.29" },
        { key: "Izzah>Mo", who: "Izzah → you", amt: "$224.72" },
      ]);
      const paid = await paidRows(page);
      assert.equal(paid.length, 1);
      assert.deepEqual({ who: paid[0].who, amt: paid[0].amt, sub: paid[0].sub }, { who: "Sam → you", amt: "$100.00", sub: "Paid " + TODAY + "." }, "still more to send: no 'Nothing more to send.'");
      // The stamped row comes after every open row.
      const order = await page.$$eval("#slip .s-row", (els) => els.map((e) => (e.classList.contains("is-paid") ? "paid" : "open")));
      assert.deepEqual(order, ["open", "open", "paid"]);
    },
  },
  {
    name: "an amount of 0, empty or nonsense is refused with 'Enter what was sent.'",
    async run({ page }) {
      const backend = await ready(page);
      await waitOpen(page, 2);
      await arm(page, "Izzah>Mo");
      for (const bad of ["0", "", "-5", "12.345", "abc", "100001"]) {
        await page.fill("#stampAmt", bad);
        await page.click(spot("Izzah>Mo"));
        await expectText(page, '#slip .s-row[data-key="Izzah>Mo"] .s-sub', "Enter what was sent.");
        assert.deepEqual(await armed(page), ["Izzah>Mo"], "still armed after " + JSON.stringify(bad));
        assert.equal(await page.locator("#slip .stamp").count(), 0);
      }
      await idle(page);
      assert.equal(backend.fake.tables.Settlements.length, 0, "nothing saved");
      assert.equal(backend.requests.filter((r) => r.action === "addPayment").length, 0);
      // A good amount then goes through.
      await page.fill("#stampAmt", "250.3");
      await page.click(spot("Izzah>Mo"));
      await idle(page);
      assert.equal(saved(backend)[0].cad, 250.3);
    },
  },
  {
    name: "an untouched armed amount follows a sync; a typed one is kept",
    async run({ page }) {
      const backend = await ready(page);
      await waitOpen(page, 2);
      await arm(page, "Izzah>Mo");
      assert.equal(await page.inputValue("#stampAmt"), "224.72");
      // Another phone: Mo paid $30 that Izzah and Mo share, so Izzah owes $15 more.
      const lunch = { id: "otherexp001", day: "2026-12-28", title: "Lunch", amount: 30, currency: "CAD", paidBy: "Mo", split: ["Mo", "Izzah"], splitMode: "equal", splitVals: [], note: "", kind: "" };
      await otherPhone(backend, "Sam", "addExpense", { expense: lunch });
      await page.evaluate(() => globalThis.__matTest.store.checkRev());
      await until(async () => (await page.inputValue("#stampAmt")) === "239.72", "the field follows the new amount");
      assert.deepEqual(await armed(page), ["Izzah>Mo"], "still armed");

      // Typed by hand: a sync leaves it alone.
      await page.fill("#stampAmt", "200");
      await otherPhone(backend, "Sam", "addExpense", { expense: { ...lunch, id: "otherexp002" } });
      await page.evaluate(() => globalThis.__matTest.store.checkRev());
      // The seed's 8 lines plus the two lunches.
      await until(() => page.evaluate(() => document.querySelectorAll("#rc .rc-row").length === 10), "the second sync lands");
      assert.equal(await page.inputValue("#stampAmt"), "200");
      await page.click(spot("Izzah>Mo"));
      await idle(page);
      assert.equal(saved(backend)[0].cad, 200);
    },
  },
  {
    name: "an armed row left alone for 8 seconds disarms",
    async run({ page }) {
      const backend = await ready(page);
      await waitOpen(page, 2);
      await arm(page, "Izzah>Mo");
      await advance(page, backend, 7900);
      assert.deepEqual(await armed(page), ["Izzah>Mo"], "still armed at 7.9 s");
      await advance(page, backend, 200);
      await until(async () => (await armed(page)).length === 0, "disarmed after 8 s");
      assert.equal(await page.locator("#stampAmt").count(), 0);
      await expectText(page, '#slip .s-row[data-key="Izzah>Mo"] .s-amt', "$224.72");
    },
  },
  {
    name: "after a reload the stamp has the same rotation and the same drawing",
    async run({ page }) {
      const backend = await ready(page);
      await waitOpen(page, 2);
      await arm(page, "Izzah>Mo");
      await page.click(spot("Izzah>Mo"));
      await idle(page);
      const look = () => page.evaluate(() => {
        const s = document.querySelector("#slip .s-row.is-paid .stamp");
        return s ? { rot: s.style.getPropertyValue("--rot"), svg: s.innerHTML } : null;
      });
      const before = await look();
      const row = saved(backend)[0];
      assert.equal(before.rot, row.rot + "deg", "drawn from the stored rot");
      assert.equal(before.svg, await asDrawn(page, row.seed), "drawn from the stored seed");
      await page.reload();
      const after = await until(look, "the stamp after the reload");
      assert.deepEqual(after, before);
      assert.equal(await page.locator("#slip .stamp.hit").count(), 0, "no hit on a reload");
    },
  },
  {
    name: "tapping a stamped row offers 'Remove this stamp'; removing reopens it; Undo puts it back with the same seed",
    async run({ page }) {
      const seed = { ...SEED, payments: [pay({ n: 1, cad: 224.72, seed: 777, rot: 4 })] };
      const backend = await ready(page, { seed });
      await until(async () => (await paidRows(page)).length === 1, "the seeded stamp");
      await waitOpen(page, 1);
      const pid = (await paidRows(page))[0].id;
      const row = '#slip .s-row.is-paid[data-pid="' + pid + '"]';

      // Keep it: nothing changes.
      await page.click(row + " .s-amt");
      await expectText(page, row + " [data-rm]", "Remove this stamp");
      await page.click(row + " [data-keep]");
      assert.equal(await page.locator(row + " [data-rm]").count(), 0);

      await page.click(row);
      await page.click(row + " [data-rm]");
      await until(async () => (await paidRows(page)).length === 0, "the stamp is removed");
      await waitOpen(page, 2);
      await expectText(page, "#ubarT", "Stamp removed.");
      await idle(page);
      assert.equal(saved(backend)[0].removed, true);

      await page.click("#ubarU");
      await until(async () => (await paidRows(page)).length === 1, "the stamp is back");
      await idle(page);
      const back = saved(backend)[0];
      assert.equal(back.removed, false);
      assert.equal(back.seed, 777);
      assert.equal(await page.evaluate(() => document.querySelector("#slip .stamp").innerHTML), await asDrawn(page, 777));
      assert.equal(await page.evaluate(() => document.querySelector("#slip .stamp").style.getPropertyValue("--rot")), "4deg");
    },
  },
  {
    name: "four stamps fold to the newest two under '2 earlier payments'",
    async run({ page }) {
      const at = (min) => new Date(NOON28 - min * 60 * 1000).toISOString();
      const payments = [10, 20, 30, 40].map((cad, i) => pay({ n: i + 1, cad, at: at(240 - i * 60) }));
      await ready(page, { seed: { ...SEED, payments } });
      await until(async () => (await paidRows(page)).length === 2, "two stamped rows show");
      assert.deepEqual((await paidRows(page)).map((r) => r.amt), ["$40.00", "$30.00"], "newest first");
      await expectText(page, "#older", "2 earlier payments");
      await page.click("#older");
      await until(async () => (await paidRows(page)).length === 4, "all four show");
      assert.deepEqual((await paidRows(page)).map((r) => r.amt), ["$40.00", "$30.00", "$20.00", "$10.00"]);
      assert.equal(await page.locator("#older").count(), 0);
    },
  },
  {
    name: "with reduced motion the stamp appears without the hit",
    async run({ page }) {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await ready(page);
      await waitOpen(page, 2);
      await arm(page, "Izzah>Mo");
      await page.click(spot("Izzah>Mo"));
      await until(async () => (await page.locator("#slip .stamp").count()) === 1, "the stamp");
      assert.equal(await page.locator("#slip .stamp.hit").count(), 0);
    },
  },
  {
    name: "a stamp made by someone else since you looked counts in #histN; your own does not",
    async run({ page }) {
      const half = new Date(NOON28 - 30 * 60 * 1000).toISOString();
      const payments = [pay({ n: 1, cad: 10, by: "Izzah", at: half }), pay({ n: 2, cad: 5, from: "Sam", by: "Mo", at: half })];
      await ready(page, { seed: { ...SEED, payments }, storage: { "chi.seen": String(NOON28 - 60 * 60 * 1000) } });
      await expectText(page, "#histN", "1");
      assert.ok(await visible(page, "#histN"));
    },
  },
  {
    name: "any of the three can stamp any row: Izzah stamps Sam → Mo",
    async run({ page }) {
      const backend = await ready(page, { me: "Izzah" });
      await waitOpen(page, 2);
      assert.deepEqual((await openRows(page)).map((r) => r.who), ["Sam → Mo", "You → Mo"]);
      await arm(page, "Sam>Mo");
      await expectText(page, '#slip .s-row[data-key="Sam>Mo"] .s-sub', "Did Mo get it? Tap again to stamp.");
      await page.click(spot("Sam>Mo"));
      await idle(page);
      const [row] = saved(backend);
      assert.deepEqual({ from: row.from, to: row.to, cad: row.cad, stampedBy: row.stampedBy }, { from: "Sam", to: "Mo", cad: 1124.29, stampedBy: "Izzah" });
    },
  },
  {
    name: "stamping with no signal: the stamp stays, is never called unsaved, and goes once signal returns",
    async run({ page }) {
      const backend = await ready(page);
      await waitOpen(page, 2);
      backend.failWith = "network";
      await arm(page, "Izzah>Mo");
      await page.click(spot("Izzah>Mo"));
      await idle(page);
      assert.notEqual(await ubar(page), "No signal. That wasn’t saved.");
      assert.equal(await page.locator("#slip .s-row.is-paid").count(), 1, "the stamp stays on the slip");
      assert.deepEqual((await openRows(page)).map((r) => r.key), ["Sam>Mo"], "the transfer is not offered again");
      assert.deepEqual(await armed(page), [], "no row is left armed");
      assert.equal(await page.locator("#stampAmt").count(), 0, "the amount field is gone");
      assert.equal(backend.fake.tables.Settlements.length, 0);
      backend.failWith = null;
      await page.evaluate(() => globalThis.__matTest.store.checkRev());
      await idle(page);
      assert.equal(backend.fake.tables.Settlements.length, 1, "sent once");
      assert.equal(await page.locator("#slip .s-row.is-paid").count(), 1);
    },
  },
  {
    name: "a stamp whose reply is lost is resent with the same id: one payment on the Sheet",
    async run({ page }) {
      const backend = await ready(page);
      await waitOpen(page, 2);
      const handle = backend.handle;
      backend.handle = async (body) => {
        const env = await handle.call(backend, body);
        if (body.action === "addPayment") throw new Error("reply lost"); // it reached the Sheet
        return env;
      };
      await arm(page, "Izzah>Mo");
      await page.click(spot("Izzah>Mo"));
      await idle(page);
      assert.equal(backend.fake.tables.Settlements.length, 1);
      assert.equal(await page.locator("#slip .s-row.is-paid.is-pending").count(), 1, "still shown, as pending");
      await expectText(page, "#slip .s-row.is-paid.is-pending .s-sub", "Sending…");
      const faded = await page.evaluate(() => Number(getComputedStyle(document.querySelector("#slip .s-row.is-pending .s-l")).opacity));
      assert.ok(faded < 1, "faded like a pending line: " + faded);
      await expectText(page, "#net", /1 to send\.$/);
      assert.deepEqual((await openRows(page)).map((r) => r.key), ["Sam>Mo"]);
      backend.handle = handle;
      await page.evaluate(() => globalThis.__matTest.store.checkRev());
      await idle(page);
      const sent = backend.requests.filter((r) => r.action === "addPayment").map((r) => r.args.payment.id);
      assert.equal(sent.length, 2);
      assert.equal(sent[0], sent[1], "the same id both times");
      assert.equal(backend.fake.tables.Settlements.length, 1, "one payment, not two");
      assert.equal(await page.locator("#slip .s-row.is-paid").count(), 1);
      assert.equal(await page.locator("#slip .s-row.is-pending").count(), 0, "a normal paid row now");
      await expectText(page, "#slip .s-row.is-paid .s-sub", /^Paid /);
      assert.equal(await visible(page, "#net"), false);
    },
  },
  {
    name: "an unconfirmed stamp stays faded after its hit finishes, and reaches full strength once confirmed",
    async run({ page }) {
      const backend = await ready(page);
      await waitOpen(page, 2);
      const handle = backend.handle;
      backend.handle = async (body) => {
        const env = await handle.call(backend, body);
        if (body.action === "addPayment") throw new Error("reply lost");
        return env;
      };
      await arm(page, "Izzah>Mo");
      await page.click(spot("Izzah>Mo"));
      await idle(page);
      await page.waitForSelector("#slip .s-row.is-pending .stamp");
      const settled = () =>
        page.evaluate(() => {
          const st = document.querySelector("#slip .s-row.is-pending .stamp");
          return !!st && st.getAnimations().every((a) => a.playState === "finished");
        });
      await until(settled, "the hit animation has finished");
      const opacity = () => page.evaluate(() => Number(getComputedStyle(document.querySelector("#slip .stamp")).opacity));
      assert.ok((await opacity()) < 1, "pending stamp is faded: " + (await opacity()));
      backend.handle = handle;
      await page.evaluate(() => globalThis.__matTest.store.checkRev());
      await idle(page);
      await until(async () => (await page.locator("#slip .s-row.is-pending").count()) === 0, "confirmed");
      await until(() => page.evaluate(() => document.querySelector("#slip .stamp").getAnimations().every((a) => a.playState === "finished")), "animations done");
      assert.equal(await opacity(), 1);
    },
  },
  {
    name: "a double tap on an armed spot makes one payment, even a part payment whose row stays open",
    async run({ page }) {
      const backend = await ready(page);
      await waitOpen(page, 2);
      await arm(page, "Izzah>Mo");
      // A part payment: the row stays open under the finger, so only the
      // disarm before saving stops the second tap from stamping again.
      await page.fill("#stampAmt", "100");
      const box = await page.locator(spot("Izzah>Mo")).boundingBox();
      await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
      await until(async () => (await paidRows(page)).length >= 1, "a stamped row");
      await idle(page);
      assert.equal(backend.fake.tables.Settlements.length, 1, "one row in Settlements");
      assert.equal(backend.requests.filter((r) => r.action === "addPayment").length, 1, "one addPayment request");
      assert.equal(saved(backend)[0].cad, 100);
      assert.ok((await openRows(page)).some((r) => r.key === "Izzah>Mo"), "the remainder is still open");
      // A payment another phone adds meanwhile shows on the next load.
      await otherPhone(backend, "Sam", "addPayment", { payment: { id: "otherpay001", from: "Sam", to: "Mo", cad: 1, seed: 5, rot: 1 } });
      await page.evaluate(() => globalThis.__matTest.store.refresh());
      await until(async () => (await paidRows(page)).length === 2, "the other phone's stamp shows");
    },
  },
  {
    name: "on a phone in Tokyo a stamp made at 13:20 on Mon Dec 28 in Chicago reads 'Paid Tue Dec 29.' (the phone's own day)",
    timezoneId: "Asia/Tokyo",
    async run({ page }) {
      const backend = await ready(page);
      await waitOpen(page, 2);
      await arm(page, "Izzah>Mo");
      await page.click(spot("Izzah>Mo"));
      await until(async () => (await paidRows(page)).length === 1, "a stamped row");
      await idle(page);
      // 13:20 Mon Dec 28 in Chicago is 04:20 Tue Dec 29 in Tokyo.
      const [paid] = await paidRows(page);
      assert.equal(paid.sub, "Paid Tue Dec 29. Nothing more to send.");
      assert.equal(new Date(saved(backend)[0].stampedAt).getTime(), NOON28);
    },
  },
];
