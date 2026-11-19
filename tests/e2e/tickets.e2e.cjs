// Ticket pictures on the phone, before any ticket screen exists (ported from
// the Japan app's version 29; the Chicago screens come later). What these
// cases hold: after a load with signal the phone fetches a picture the trip
// has and keeps it in its own database, chi-tickets; a refused key and
// Forget this phone take every picture off; Forget leaves the Japan app's
// database on the same origin alone; a trip sheet before migrate sends no
// tickets and the phone asks for none. Every picture is made up: a PNG
// signature and a few bytes.

const assert = require("node:assert/strict");
const { WITH_PLAN, NOON28, open, ownKey, until, visible } = require("./helpers.cjs");

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 7)]).toString("base64");
const SKY = "planstop1203";

// Another phone adds a picture to a stop: straight to the backend, on Izzah's
// own link (the same key a page opened with own: "Izzah" holds).
async function addElsewhere(backend, id, who = "") {
  const key = ownKey(backend, "Izzah");
  const r = await backend.fake({ key, action: "addTicket", args: { ticket: { id, stop: SKY, who, seat: "", page: 1, mime: "image/png", w: 10, h: 10, data: PNG } } });
  assert.equal(r.ok, true, r.message);
}

// The ids kept in this phone's chi-tickets database ([] when there is none).
const keptIds = (page) =>
  page.evaluate(async () => {
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
        q.onsuccess = () => {
          db.close();
          resolve(q.result.map(String).sort());
        };
        q.onerror = () => {
          db.close();
          resolve(["(unreadable)"]);
        };
      };
      r.onerror = () => resolve(["(unopenable)"]);
    });
  });

const databases = (page) => page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name).sort());

async function ready(page, opts = {}) {
  const backend = await open(page, { seed: WITH_PLAN, nowMs: NOON28, tab: "days", ...opts });
  await until(() => page.evaluate(() => globalThis.__matTest && globalThis.__matTest.store.state.status === "ready"), "the trip loads");
  return backend;
}

// The Japan app's own database on the same origin (as if MAT were open in this browser too).
const makeJapanDatabase = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const r = indexedDB.open("mat-tickets", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("pics");
        r.onsuccess = () => {
          const db = r.result;
          const tx = db.transaction("pics", "readwrite");
          tx.objectStore("pics").put({ type: "image/png", bytes: new ArrayBuffer(4) }, "japanpic01");
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
        };
      }),
  );

module.exports = [
  {
    name: "after a load with signal the phone fetches a picture the trip has and keeps it in chi-tickets; nothing changes on screen",
    async run({ page }) {
      const backend = await ready(page, { own: "Mo" });
      assert.equal(await page.evaluate(() => globalThis.__matTest.store.state.ticketsReady), true);
      const before = await page.evaluate(() => document.body.innerText);
      await addElsewhere(backend, "tktpicture01", "Izzah");
      await page.evaluate(() => globalThis.__matTest.store.refresh());
      await until(async () => (await keptIds(page)).includes("tktpicture01"), "the picture is kept on this phone");
      assert.equal(backend.requests.filter((r) => r.action === "ticket").length, 1, "asked for once");
      assert.deepEqual(await page.evaluate(() => globalThis.__matTest.store.state.tickets.map((t) => [t.id, t.who, "data" in t])), [["tktpicture01", "Izzah", false]]);
      // No ticket screen yet: the page reads exactly as it did.
      assert.equal(await page.evaluate(() => document.body.innerText), before);
      // A second load asks for nothing more.
      await page.evaluate(() => globalThis.__matTest.store.refresh());
      await page.evaluate(() => globalThis.__matTest.store.idle());
      await new Promise((r) => setTimeout(r, 300)); // Node's clock: the page's is paused
      assert.equal(backend.requests.filter((r) => r.action === "ticket").length, 1);
    },
  },
  {
    name: "a refused key takes every ticket picture off the phone",
    async run({ page }) {
      const backend = await ready(page, { own: "Izzah" });
      await addElsewhere(backend, "tktpicture02");
      await page.evaluate(() => globalThis.__matTest.store.refresh());
      await until(async () => (await keptIds(page)).includes("tktpicture02"), "the picture is kept on this phone");
      backend.fake.world.cancelLinkForPerson2(); // Izzah is the second person
      await page.evaluate(() => globalThis.__matTest.store.checkRev());
      await until(() => visible(page, "#gate"), "the no-key screen shows");
      await until(async () => (await keptIds(page)).length === 0, "no picture is left on the phone");
      assert.deepEqual(await page.evaluate(() => globalThis.__matTest.store.state.tickets), []);
    },
  },
  {
    name: "Forget this phone deletes chi-tickets and leaves the Japan app's mat-tickets alone",
    async run({ page }) {
      const backend = await ready(page, { own: "Mo" });
      await addElsewhere(backend, "tktpicture03");
      await page.evaluate(() => globalThis.__matTest.store.refresh());
      await until(async () => (await keptIds(page)).includes("tktpicture03"), "the picture is kept on this phone");
      await makeJapanDatabase(page);
      assert.deepEqual(await databases(page), ["chi-tickets", "mat-tickets"]);
      await page.dispatchEvent("#youBtn", "click");
      await until(() => page.evaluate(() => document.getElementById("you").classList.contains("is-open")), "the settings sheet opens");
      await page.dispatchEvent("#setForget", "click");
      await page.dispatchEvent("#setForget", "click");
      await until(() => visible(page, "#gate"), "the no-key screen shows");
      await until(async () => !(await databases(page)).includes("chi-tickets"), "chi-tickets is deleted");
      assert.deepEqual(await databases(page), ["mat-tickets"], "the Japan app's database stays");
      assert.equal(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("chi.")).length), 0);
    },
  },
  {
    name: "a trip sheet before migrate sends no tickets: ticketsReady is false and the phone asks for no picture",
    async run({ page }) {
      const backend = await ready(page, { seed: { ...WITH_PLAN, missingTabs: ["Tickets", "TicketData"], missingColumns: ["Stops.tk_ref", "Stops.tk_name", "Stops.tk_people", "Stops.tk_seat"] } });
      assert.equal(await page.evaluate(() => globalThis.__matTest.store.state.ticketsReady), false);
      assert.equal(backend.requests.some((r) => r.action === "ticket"), false);
      assert.deepEqual(await keptIds(page), []);
    },
  },
];
