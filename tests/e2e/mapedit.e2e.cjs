// Where a stop is (look G, the Edit sheet's row): "Where it is", On the map /
// Not on the map, a small sign beside it (the city's grid spot, or NO CORNER
// YET), and a field to paste a Google Maps link. The position is read from the
// link (the place's own pin, else a place or search link's centre) and sent as
// the stop's lat and lng, always both or neither. A new place takes the old
// position off. This is a place's position, never the phone's. The plan is
// tests/fixtures/plan.json over the seed; 13:20 on Dec 28 in Chicago.

const assert = require("node:assert/strict");
const fs = require("fs");
const { WITH_PLAN, open, until, text } = require("./helpers.cjs");

const SHOTS = "/private/tmp/claude-501/chi-shots/where";
const shot = async (page, name) => {
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: SHOTS + "/" + name + ".png" });
};

const SKY = "planstop1203";
const DINNER = "planstop1204";
const LINK = "https://www.google.com/maps/place/Made+Up+Pier/@41.9089,-87.6391,17z/data=!3m1!4b1!4m6!3m5!1s0x6001!8m2!3d41.9090286!4d-87.6377472!16s";
const DIRECTIONS = "https://www.google.com/maps/dir/41.8954,-87.6589/Made+Up+Station/@41.88,-87.63,14z/data=!3m1!4b1!4m9!4m8!1m1!4e1!1m5!1m1!1s0x0:0x0!2m2!1d-87.6694!2d41.8962";
const row = (id) => '.r[data-id="' + id + '"]';

function seedAt(id, lat, lng) {
  const seed = JSON.parse(JSON.stringify(WITH_PLAN));
  Object.assign(seed.stops.find((s) => s.id === id), { lat, lng });
  return seed;
}

async function ready(page, opts = {}) {
  const backend = await open(page, { seed: WITH_PLAN, tab: "days", ...opts });
  await until(() => page.evaluate(() => document.querySelectorAll("#rail .pg .tk").length === 7), "the tickets draw");
  return backend;
}
const isOpen = (page, id) => page.evaluate((i) => !!document.getElementById(i) && document.getElementById(i).classList.contains("is-open"), id);
const waitSheet = (page) => until(() => page.evaluate(() => {
  const s = document.getElementById("stop");
  return !!s && s.classList.contains("is-open") && Math.abs(s.getBoundingClientRect().bottom - innerHeight) < 1;
}), "the stop sheet opens");
async function openEdit(page, id) {
  if (!(await page.evaluate((sel) => document.querySelector(sel).classList.contains("is-open"), row(id)))) await page.dispatchEvent(row(id) + " .r-b", "click");
  await until(() => page.evaluate((sel) => {
    const r = document.querySelector(sel);
    const d = r.querySelector(".r-more > div");
    return r.classList.contains("is-open") && d.clientHeight === d.scrollHeight;
  }, row(id)), "the stop opens");
  await page.dispatchEvent(row(id) + " .r-edit", "click");
  await waitSheet(page);
}
const stored = (backend, id) => {
  const r = backend.fake.tables.Stops.find((x) => x.id === id);
  return [String(r.lat || ""), String(r.lng || "")];
};
const saved = (page) => until(async () => !(await isOpen(page, "stop")), "the sheet closes, saved");
const sign = (page) => page.evaluate(() => {
  const m = document.getElementById("stAtM");
  return { text: m.textContent, off: m.classList.contains("off"), hidden: m.getAttribute("aria-hidden") };
});
const spotOf = async (lat, lng) => {
  const { gridSpot } = await import("../../js/geo.js");
  return gridSpot({ lat, lng });
};
const scrollRow = (page) => page.evaluate(() => document.getElementById("stPin").scrollIntoView({ block: "center" }));
// The row sits inside the sheet, nothing runs off sideways.
async function rowFits(page) {
  const got = await page.evaluate(() => {
    const s = document.getElementById("stop");
    const l = document.querySelector("#stop .st-at").getBoundingClientRect();
    const sh = s.getBoundingClientRect();
    return { sw: s.scrollWidth, cw: s.clientWidth, inside: l.left >= sh.left - 0.5 && l.right <= sh.right + 0.5 };
  });
  assert.ok(got.sw <= got.cw && got.inside, "the row fits the sheet: " + JSON.stringify(got));
}

const SIZES = [
  { tag: "393x852", viewport: { width: 393, height: 852 } },
  { tag: "320x568", viewport: { width: 320, height: 568 } },
  { tag: "844x390", viewport: { width: 844, height: 390 } },
  { tag: "1440x900", viewport: { width: 1440, height: 900 }, mobile: false },
];

module.exports = [
  {
    name: "a stop not on the map says so, with its sign switched off; a pasted Maps link puts it there",
    async run({ page }) {
      const backend = await ready(page);
      await openEdit(page, SKY);
      assert.equal(await text(page, "#stAtW"), "Not on the map");
      assert.deepEqual(await sign(page), { text: "NO CORNER YET", off: true, hidden: "true" });
      assert.equal(await text(page, "#stAtS"), "No distance or leave-by from where you are until it is. Paste the place’s Google Maps link.");
      await scrollRow(page);
      await shot(page, "edit-not-on-map");
      await page.fill("#stPin", LINK);
      assert.equal(await text(page, "#stAtW"), "On the map");
      const spot = await spotOf(41.9090286, -87.6377472);
      assert.match(spot, /^\d+ [NS] · \d+ [EW]$/);
      assert.deepEqual(await sign(page), { text: "ABOUT " + spot, off: false, hidden: "true" });
      assert.equal(await text(page, "#stAtS"), "From the pasted link.");
      await shot(page, "edit-pasted-link");
      await page.click("#stSave");
      await saved(page);
      assert.deepEqual(stored(backend, SKY), ["41.9090286", "-87.6377472"], "the pin, not the map's centre");
      const reqs = backend.requests.filter((b) => b.action === "updateStop");
      assert.deepEqual(reqs.at(-1).args.patch, { lat: "41.9090286", lng: "-87.6377472" }, "one request carries both");
      await openEdit(page, SKY);
      assert.equal(await text(page, "#stAtW"), "On the map");
      assert.equal(await text(page, "#stAtS"), "Wrong spot? Paste the place’s Google Maps link to move it.");
      assert.equal(await page.evaluate(() => document.getElementById("stPin").value), "", "the field starts empty");
      await scrollRow(page);
      await shot(page, "edit-on-map");
    },
  },
  {
    name: "a link with no position in it says so and sends nothing new",
    viewport: { width: 320, height: 568 },
    async run({ page }) {
      const backend = await ready(page);
      await openEdit(page, DINNER);
      await page.fill("#stPin", "https://maps.app.goo.gl/AbCd123");
      assert.equal(await text(page, "#stAtW"), "Not on the map");
      assert.equal(await text(page, "#stAtS"), "No position in that link. Copy the long link from Google Maps’ address bar.");
      assert.equal((await sign(page)).off, true);
      await scrollRow(page);
      await rowFits(page);
      await page.fill("#stDetail", "Counter seats");
      await page.click("#stSave");
      await saved(page);
      const req = backend.requests.filter((b) => b.action === "updateStop").at(-1);
      assert.deepEqual(req.args.patch, { detail: "Counter seats" }, "no lat or lng in it");
      assert.deepEqual(stored(backend, DINNER), ["", ""]);
    },
  },
  {
    name: "a new place takes the old position off the map, both together; the geocoder's wrong spot can be put right",
    async run({ page }) {
      const backend = await ready(page, { seed: seedAt(SKY, "40.70", "-80.50") });
      await openEdit(page, SKY);
      assert.equal(await text(page, "#stAtW"), "On the map");
      await page.fill("#stPlace", "Made Up Annex");
      assert.equal(await text(page, "#stAtW"), "Not on the map", "the old position was for the old place");
      await page.click("#stSave");
      await saved(page);
      assert.deepEqual(stored(backend, SKY), ["", ""]);
      const patch = backend.requests.filter((b) => b.action === "updateStop").at(-1).args.patch;
      assert.deepEqual(Object.keys(patch).sort(), ["lat", "lng", "place"], "lat and lng travel together");
      await openEdit(page, SKY);
      await page.fill("#stPin", LINK);
      await page.click("#stSave");
      await saved(page);
      assert.deepEqual(stored(backend, SKY), ["41.9090286", "-87.6377472"]);
    },
  },
  {
    name: "a directions link is refused and nothing is sent; a bare map view is not read either",
    async run({ page }) {
      const backend = await ready(page);
      await openEdit(page, DINNER);
      await page.fill("#stPin", DIRECTIONS);
      assert.equal(await text(page, "#stAtW"), "Not on the map");
      assert.equal(await text(page, "#stAtS"), "That’s a directions link. Paste the place’s own link.");
      assert.deepEqual(await sign(page), { text: "NO CORNER YET", off: true, hidden: "true" });
      await scrollRow(page);
      await shot(page, "edit-directions-link");
      await page.fill("#stPin", "https://www.google.com/maps/@41.8962,-87.6694,15z");
      assert.equal(await text(page, "#stAtW"), "Not on the map");
      await page.fill("#stDetail", "Counter seats");
      await page.click("#stSave");
      await saved(page);
      const req = backend.requests.filter((b) => b.action === "updateStop").at(-1);
      assert.deepEqual(req.args.patch, { detail: "Counter seats" });
      assert.equal(JSON.stringify(backend.requests).includes("41.8954"), false, "nothing of the link is sent");
      assert.equal(JSON.stringify(backend.requests).includes("41.8962"), false);
    },
  },
  {
    name: "a new place with no link sends lat and lng together, both empty",
    async run({ page }) {
      const backend = await ready(page);
      await page.dispatchEvent('#rail .pg[data-date="2026-12-28"] .tk-add', "click");
      await waitSheet(page);
      assert.equal(await text(page, "#stAtW"), "Not on the map");
      await page.fill("#stWhat", "Tea");
      await page.click("#stSave");
      await saved(page);
      const req = backend.requests.filter((b) => b.action === "addStop").at(-1);
      assert.equal(req.args.stop.lat, "");
      assert.equal(req.args.stop.lng, "");
    },
  },
  {
    name: "a new stop can be put on the map as it is added",
    async run({ page }) {
      const backend = await ready(page);
      await page.dispatchEvent('#rail .pg[data-date="2026-12-28"] .tk-add', "click");
      await waitSheet(page);
      await page.fill("#stWhat", "Tea");
      await page.fill("#stPin", "https://www.google.com/maps/place/Tea+house/@41.9037,-87.6788,16z");
      assert.equal(await text(page, "#stAtW"), "On the map");
      await page.click("#stSave");
      await saved(page);
      const r = backend.fake.tables.Stops.find((x) => x.title === "Tea");
      assert.deepEqual([String(r.lat), String(r.lng)], ["41.9037", "-87.6788"]);
    },
  },
  {
    name: "before migrate the save is refused with the backend's words and the sheet stays open",
    async run({ page }) {
      const old = { ...WITH_PLAN, missingColumns: ["Stops.lat", "Stops.lng", "Stays.lat", "Stays.lng", "Days.lat", "Days.lng"] };
      const backend = await ready(page, { seed: old });
      await openEdit(page, SKY);
      await page.fill("#stPin", LINK);
      await page.click("#stSave");
      await until(async () => (await text(page, "#stMsg")) === "The trip sheet needs updating first. Ask Mo to run migrate.", "the backend's words");
      assert.equal(await isOpen(page, "stop"), true, "the sheet stays");
      assert.equal(await page.evaluate(() => document.getElementById("stPin").value.length > 0), true, "what was pasted is kept");
      assert.equal(backend.fake.tables.Stops.find((x) => x.id === SKY).lat, undefined);
      // A stop saved with no position still saves.
      await page.fill("#stPin", "");
      await page.fill("#stDetail", "Counter seats");
      await page.click("#stSave");
      await saved(page);
    },
  },
  ...SIZES.map(({ tag, viewport, mobile }) => ({
    name: "the row holds at " + tag + ", not on the map and on the map",
    viewport,
    ...(mobile === false ? { mobile: false } : {}),
    async run({ page }) {
      await ready(page);
      await openEdit(page, SKY);
      await scrollRow(page);
      await rowFits(page);
      await shot(page, "edit-row-" + tag + "-off");
      await page.fill("#stPin", LINK);
      await scrollRow(page);
      await rowFits(page);
      await shot(page, "edit-row-" + tag + "-on");
    },
  })),
];
