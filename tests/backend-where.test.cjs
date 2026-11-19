/* Copyright (c) 2026 moissmart1. All rights reserved. No licence is granted: do not copy, adapt or reuse this code or design, and do not use it to train or prompt an AI system to reproduce it. See LICENSE. */
// Where things are, on the backend: Stops, Stays and Days gain lat and lng
// (numbers as text, "" when unknown); migrate adds them; `locate` geocodes
// what has none (region us, at most 40 lookups a call, one a row a call);
// the writers clear coordinates when a place changes; the app can set a
// stop's from a pasted Maps link; undo writes them back only when that change
// moved them; the connector reads them but cannot set them. Through the fake
// backend (the real Actions.js, Pure.js and Mcp.js) with a stand-in geocoder.
// Ported from the Japan app (MAT 818a49a and its fixes 2d910e2, 5499755,
// 00ae93d, 56f29a7, 33929c0, 33f7dc2, 3c6b53d, bb54753). Chicago's queries: a
// stop by its place then its title, each with its day's city; a stay by its
// name with its place; a day by its city. Every place here is made up or a
// fixture's.
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../backend/Pure.js");
const { createFakeBackend } = require("./fake-backend.cjs");
const PLAN = require("./fixtures/plan.json");

const KEY = "test-key";

function client(seed = PLAN) {
  const fake = createFakeBackend(JSON.parse(JSON.stringify(seed)));
  const call = (action, args = {}, extra = {}) => fake({ key: KEY, actor: "Mo", action, args, ...extra });
  call.fake = fake;
  return call;
}

// A stand-in geocoder: answers from a table, counts the questions.
function geocoder(call, table) {
  const asked = [];
  call.fake.geocoder.answer = (q, region) => {
    asked.push({ q, region });
    return Object.prototype.hasOwnProperty.call(table, q) ? table[q] : null;
  };
  return asked;
}

const locate = (call) => call.fake({ key: KEY, action: "locate", args: {} });
const stopById = (d, id) => d.stops.find((s) => s.id === id);
const TOKYO_DAY = "2026-12-28";
const CHI_DAY = "2026-12-30";
const HOTEL_ADDR = PLAN.stays[0].addressJp; // a fixture's own street address

test("the tabs have lat and lng, as text columns, after everything older", () => {
  for (const tab of ["Stops", "Stays", "Days"]) {
    assert.ok(P.TABS[tab].includes("lat") && P.TABS[tab].includes("lng"), tab);
    assert.equal(P.isTextColumn(tab, "lat"), true, "numbers as text");
  }
  assert.deepEqual(P.TABS.Stays.slice(-3), ["deleted_at", "lat", "lng"]);
  assert.deepEqual(P.TABS.Days.slice(-2), ["lat", "lng"]);
  assert.equal(P.TABS.Stops.indexOf("lat"), P.TABS.Stops.indexOf("tk_seat") + 1, "after the ticket facts");
});

test("load returns lat and lng as text, \"\" when unknown or not a coordinate", async () => {
  const call = client();
  const d = (await call("load")).data;
  for (const s of d.stops) assert.deepEqual([s.lat, s.lng], ["", ""]);
  for (const s of d.stays) assert.deepEqual([s.lat, s.lng], ["", ""]);
  for (const day of d.days) assert.deepEqual([day.lat, day.lng], ["", ""]);
  // Typed by hand: good numbers read back as text; anything else as "".
  const row = call.fake.tables.Stops.find((r) => r.id === "planstop1203");
  row.lat = "41.8789";
  row.lng = -87.6359;
  const row2 = call.fake.tables.Stops.find((r) => r.id === "planstop1204");
  row2.lat = "north";
  row2.lng = "-87";
  const d2 = (await call("load")).data;
  assert.deepEqual([stopById(d2, "planstop1203").lat, stopById(d2, "planstop1203").lng], ["41.8789", "-87.6359"]);
  assert.deepEqual([stopById(d2, "planstop1204").lat, stopById(d2, "planstop1204").lng], ["", ""], "half a coordinate is none");
});

test("migrate adds the columns to an older Sheet and is safe to repeat", async () => {
  const call = client({ ...PLAN, missingColumns: ["Stops.lat", "Stops.lng", "Stays.lat", "Stays.lng", "Days.lat", "Days.lng"] });
  // Before migrate: load works, with no coordinates; locate is refused.
  const d = (await call("load")).data;
  assert.equal(stopById(d, "planstop1203").lat, "");
  const early = await locate(call);
  assert.deepEqual([early.ok, early.error], [false, "needs_migrate"]);
  const added = (await call.fake({ key: KEY, action: "migrate", args: {} })).data.added;
  assert.deepEqual(added.sort(), ["Days.lat", "Days.lng", "Stays.lat", "Stays.lng", "Stops.lat", "Stops.lng"]);
  assert.deepEqual((await call.fake({ key: KEY, action: "migrate", args: {} })).data.added, []);
});

test("locate needs a trip key, geocodes in region us what has no coordinates, and says what it found", async () => {
  const call = client();
  const asked = geocoder(call, {
    "Shibuya Sky Tokyo": { lat: 35.6585, lng: 139.7023 },
    "Meiji Jingu Tokyo": { lat: 35.6764, lng: 139.6993 },
    [HOTEL_ADDR + " Chicago"]: { lat: 35.7119, lng: 139.7967 },
    Tokyo: { lat: 35.6812, lng: 139.7671 },
    "Dinner Tokyo": { lat: 35.68, lng: 139.77 },
  });
  assert.equal((await call.fake({ key: "wrong", action: "locate", args: {} })).error, "bad_key");
  const revBefore = (await call("load")).rev;
  const r = await locate(call);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.more, false);
  assert.ok(asked.length > 0);
  for (const a of asked) assert.equal(a.region, "us");
  const d = (await call("load")).data;
  assert.deepEqual([stopById(d, "planstop1203").lat, stopById(d, "planstop1203").lng], ["35.6585", "139.7023"]);
  assert.equal(stopById(d, "planstop1201").lat, "35.6764");
  // A stop with no place: its title plus the day's city.
  assert.equal(stopById(d, "planstop1204").lat, "35.68");
  const hotel = d.stays.find((s) => s.id === "planstay0001");
  assert.deepEqual([hotel.lat, hotel.lng], ["35.7119", "139.7967"], "a stay by its street address with its first night's city");
  assert.equal(d.days.find((x) => x.date === TOKYO_DAY).lat, "35.6812", "a day by its city");
  // Nothing found for the rest: "" and counted as missing; asked again next call.
  assert.ok(r.data.missing > 0, JSON.stringify(r.data));
  assert.equal(r.data.found, 3 + 1 + 2, JSON.stringify(r.data)); // stops 1201, 1203, 1204; one stay; the two Tokyo days
  assert.ok(r.rev > revBefore, "phones learn the new coordinates on their next check");
  // Nothing is logged in History.
  assert.equal(call.fake.tables.Log.filter((x) => x.action === "locate").length, 0);
  const again = asked.length;
  const r2 = await locate(call);
  assert.equal(r2.data.found, 0);
  assert.equal(r2.rev, r.rev, "nothing found: rev stays");
  assert.ok(asked.length > again, "the missing ones are asked again");
  assert.ok(!asked.slice(again).some((a) => a.q === "Shibuya Sky Tokyo"), "a found one is not asked again");
});

test("locate: Chicago's days are asked once for the city, and each answer is kept", async () => {
  const call = client();
  const asked = geocoder(call, { Chicago: { lat: 41.8781, lng: -87.6298 } });
  await locate(call);
  assert.equal(asked.filter((a) => a.q === "Chicago").length, 1, "the same question twice in a call is asked once");
  const d = (await call("load")).data;
  for (const date of ["2026-12-26", "2026-12-30", "2026-12-31", "2027-01-01"]) {
    assert.deepEqual([d.days.find((x) => x.date === date).lat, d.days.find((x) => x.date === date).lng], ["41.8781", "-87.6298"], date);
  }
});

test("locate: a stop's place first, then its title, each with the day's city; a stay's name with its place", async () => {
  const call = client();
  const asked = geocoder(call, { "Lunch in Harajuku Tokyo": { lat: 35.67, lng: 139.70 }, "Niseko lodge": null });
  await locate(call);
  const first = asked.map((a) => a.q);
  // Meiji: its place this call, its title with the day's city the next (one lookup a row a call).
  assert.ok(first.includes("Meiji Jingu Tokyo") && !first.includes("Meiji Shrine Tokyo"), first.join(" | "));
  await locate(call);
  const qs = asked.map((a) => a.q);
  assert.ok(qs.includes("Meiji Shrine Tokyo"), qs.join(" | "));
  assert.ok(qs.includes("Lunch in Harajuku Tokyo"), qs.join(" | "));
  // The hotel: its street address with its first night's city, then its name and place with that city.
  assert.ok(qs.includes(HOTEL_ADDR + " Chicago"), qs.join(" | "));
  assert.ok(qs.includes("Asakusa hotel Asakusa hotel Tokyo Chicago"), qs.join(" | "));
  // The lodge has no address or place: its name with the city of its first night.
  assert.ok(qs.includes("Niseko lodge Niseko"), qs.join(" | "));
  assert.equal(qs.some((q) => q.startsWith("undefined") || q.includes("undefined")), false);
});

test("locate: a deleted stop or stay is not looked up", async () => {
  const seed = JSON.parse(JSON.stringify(PLAN));
  seed.stops.push({ id: "gonestop0001", date: CHI_DAY, time: "", title: "Gone pier", deleted: true });
  seed.stays.push({ id: "gonestay0001", name: "Gone inn", firstNight: "2026-12-31", lastNight: "2026-12-31", deleted: true });
  const call = client(seed);
  const asked = geocoder(call, {});
  await locate(call);
  await locate(call);
  assert.equal(asked.some((a) => a.q.startsWith("Gone")), false, asked.map((a) => a.q).join(" | "));
});

test("locate: a place that is a Maps link with a position is read without a lookup", async () => {
  const seed = JSON.parse(JSON.stringify(PLAN));
  seed.stops.find((s) => s.id === "planstop1202").place = "https://www.google.com/maps/place/x/@41.1,-87.1,17z/data=!3d41.8827!4d-87.6233";
  const call = client(seed);
  const asked = geocoder(call, {});
  await locate(call);
  const d = (await call("load")).data;
  assert.deepEqual([stopById(d, "planstop1202").lat, stopById(d, "planstop1202").lng], ["41.8827", "-87.6233"]);
  assert.equal(asked.some((a) => a.q.includes("maps")), false);
});

test("locate: at most 40 lookups a call, then more: true", async () => {
  const seed = JSON.parse(JSON.stringify(PLAN));
  for (let i = 0; i < 50; i++) seed.stops.push({ id: "bulkstop" + String(i).padStart(4, "0"), date: CHI_DAY, time: "", title: "Spot " + i });
  const call = client(seed);
  let n = 0;
  call.fake.geocoder.answer = () => { n++; return null; };
  const r = await locate(call);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(n, 40);
  assert.equal(r.data.more, true);
  const r2 = await locate(call);
  assert.equal(r2.ok, true);
});

test("locate: a geocoder that throws on the first row stops the call, counts no try, and says so", async () => {
  const call = client();
  let n = 0;
  call.fake.geocoder.answer = () => { n++; throw new Error("quota"); };
  const r = await locate(call);
  assert.deepEqual([r.ok, r.error], [false, "geocoder"], JSON.stringify(r));
  assert.match(r.message, /0 found/);
  assert.equal(n, 1, "no further lookups after the throw");
  const d = (await call("load")).data;
  assert.ok(d.stops.every((s) => s.lat === "") && d.days.every((x) => x.lat === ""));
  // No try was counted: the next run asks the same first question again, not the weaker one.
  const asked = geocoder(call, {});
  const r2 = await locate(call);
  assert.equal(r2.ok, true, JSON.stringify(r2));
  assert.ok(asked.length > 0 && asked[0].q === "Chicago", asked.map((a) => a.q).join(" | "));
  const tried = JSON.parse(call.fake.props?.LOCATE_TRIED || "{}");
  assert.equal(Object.values(tried).every((t) => t.n === 1), true, JSON.stringify(tried));
});

test("locate: a throw on a later row keeps what was found, counts no try for that row, and does not fall through to its weaker query", async () => {
  const call = client();
  let n = 0;
  call.fake.geocoder.answer = (q) => {
    n++;
    if (q === "Chicago") return { lat: 41.9, lng: -87.6 };
    if (q === "Shibuya Sky Tokyo") throw new Error("timeout");
    return null;
  };
  const r = await locate(call);
  assert.deepEqual([r.ok, r.error], [false, "geocoder"], JSON.stringify(r));
  assert.match(r.message, /[1-9]\d* found/);
  const d = (await call("load")).data;
  assert.equal(d.days.find((x) => x.date === "2026-12-26").lat, "41.9", "what was found stays written");
  assert.equal(stopById(d, "planstop1203").lat, "");
  const before = n;
  // The row that threw has no try recorded: its next run asks its first form again, not its title.
  const tried = JSON.parse(call.fake.props.LOCATE_TRIED || "{}");
  assert.equal(tried["stop:planstop1203"], undefined, JSON.stringify(tried));
  const asked = geocoder(call, {});
  await locate(call);
  assert.equal(asked.some((a) => a.q === "Shibuya Sky Tokyo"), true, asked.map((a) => a.q).join(" | "));
  assert.ok(before > 1);
});

test("updateStop clears a stop's coordinates when its place changes, and keeps them otherwise", async () => {
  const call = client();
  geocoder(call, { "Shibuya Sky Tokyo": { lat: 35.6585, lng: 139.7023 } });
  await locate(call);
  let r = await call("updateStop", { id: "planstop1203", patch: { note: "Floor 14" } });
  assert.equal(r.data.stop.lat, "35.6585", "an unrelated change keeps them");
  r = await call("updateStop", { id: "planstop1203", patch: { place: "Shibuya Scramble Square" } });
  assert.deepEqual([r.data.stop.lat, r.data.stop.lng], ["", ""], "a new place clears them");
  // Undo puts the old place and its coordinates back.
  const u = await call("undo", { logId: r.data.logId });
  assert.equal(u.ok, true, JSON.stringify(u));
  assert.equal(u.data.stop.lat, "35.6585");
});

test("the app sets a stop's coordinates (from a pasted link); a place change with them keeps the new ones", async () => {
  const call = client();
  let r = await call("updateStop", { id: "planstop1204", patch: { lat: "41.8916", lng: "-87.6090" } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual([r.data.stop.lat, r.data.stop.lng], ["41.8916", "-87.609"]);
  assert.match(call.fake.tables.Log.at(-1).summary, /changed Dinner: map/);
  r = await call("updateStop", { id: "planstop1204", patch: { place: "Pier diner", lat: "41.89", lng: "-87.60" } });
  assert.deepEqual([r.data.stop.lat, r.data.stop.lng], ["41.89", "-87.6"]);
  // Taken off the map.
  r = await call("updateStop", { id: "planstop1204", patch: { lat: "", lng: "" } });
  assert.deepEqual([r.data.stop.lat, r.data.stop.lng], ["", ""]);
  for (const bad of [{ lat: "91", lng: "0" }, { lat: "41", lng: "" }, { lat: "x", lng: "y" }, { lat: 41, lng: -87 }]) {
    const e = await call("updateStop", { id: "planstop1204", patch: bad });
    assert.equal(e.error, "bad_input", JSON.stringify(bad));
  }
  // A new stop can carry them too.
  const add = await call("addStop", { stop: { id: "newstop00001", date: CHI_DAY, title: "Tea", lat: "41.0", lng: "-87.7" } });
  assert.deepEqual([add.data.stop.lat, add.data.stop.lng], ["41", "-87.7"]);
});

test("the connector reads coordinates but cannot set them", async () => {
  const call = client();
  geocoder(call, { "Shibuya Sky Tokyo": { lat: 35.6585, lng: 139.7023 } });
  await locate(call);
  const rpc = (name, args) => call.fake.mcp({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, { t: "claude-token" });
  const trip = rpc("get_trip", {});
  assert.ok(JSON.stringify(trip).includes("35.6585"), "get_trip shows them: " + JSON.stringify(trip).slice(0, 300));
  // Asked to change a stop's lat/lng, the connector refuses: they are not its arguments.
  const refused = rpc("change_stop", { id: "planstop1203", note: "x", lat: "1", lng: "1" });
  assert.match(JSON.stringify(refused), /unknown argument lat/);
  const d = (await call("load")).data;
  assert.equal(stopById(d, "planstop1203").lat, "35.6585");
  // Straight through handleAs_ as the connector: refused, for a change and for a new stop.
  const e = await call.fake.claude("updateStop", { id: "planstop1203", patch: { lat: "1", lng: "1" } });
  assert.equal(e.error, "bad_input");
  const a = await call.fake.claude("addStop", { stop: { id: "claudestop01", date: CHI_DAY, title: "Tea", lat: "41", lng: "-87" } });
  assert.equal(a.error, "bad_input");
  // Nor can it run locate.
  assert.equal((await call.fake.claude("locate", {})).ok, false);
});

test("the check key cannot run locate", async () => {
  const call = client();
  const r = await call.fake({ key: call.fake.CHECK_KEY, action: "locate", args: {} });
  assert.deepEqual([r.ok, r.error], [false, "bad_input"]);
});

// ---- undo, and what moves a position ----

test("undoing an older edit leaves coordinates found since; undoing an edit that set them puts the old ones back", async () => {
  const call = client();
  // An edit made before locate ran.
  const title = await call("updateStop", { id: "planstop1203", patch: { title: "Sky deck" } });
  geocoder(call, { "Shibuya Sky Tokyo": { lat: 35.6585, lng: 139.7023 } });
  await locate(call);
  assert.equal(stopById((await call("load")).data, "planstop1203").lat, "35.6585");
  const u = await call("undo", { logId: title.data.logId });
  assert.equal(u.ok, true, JSON.stringify(u));
  assert.equal(u.data.stop.title, "Shibuya Sky");
  assert.deepEqual([u.data.stop.lat, u.data.stop.lng], ["35.6585", "139.7023"], "the coordinates stay");
  // An edit that pasted a Maps link: its undo brings the old coordinates back.
  const pasted = await call("updateStop", { id: "planstop1203", patch: { lat: "35.6", lng: "139.6" } });
  const u2 = await call("undo", { logId: pasted.data.logId });
  assert.deepEqual([u2.data.stop.lat, u2.data.stop.lng], ["35.6585", "139.7023"]);
  // Undoing a stop's removal leaves coordinates alone too.
  const del = await call("deleteStop", { id: "planstop1203" });
  const u3 = await call("undo", { logId: del.data.logId });
  assert.equal(u3.data.stop.lat, "35.6585");
});

test("the same for a day's edit made before locate", async () => {
  const call = client();
  const e = await call("setDay", { date: CHI_DAY, patch: { title: "Busy" } });
  geocoder(call, { Chicago: { lat: 41.88, lng: -87.63 } });
  await locate(call);
  const u = await call("undo", { logId: e.data.logId });
  assert.equal(u.ok, true);
  assert.equal(u.data.day.lat, "41.88");
});

function withSpots(n, good = true) {
  const seed = JSON.parse(JSON.stringify(PLAN));
  for (let i = 0; i < n; i++) seed.stops.push({ id: "nowhere" + String(i).padStart(5, "0"), date: CHI_DAY, time: "", title: "Nowhere " + i, place: "Nowhere place " + i });
  if (good) seed.stops.push({ id: "goodstop0001", date: CHI_DAY, time: "", title: "Good", place: "Good place" });
  return seed;
}

test("failed lookups do not starve the rest: one lookup a row a call, untried rows first", async () => {
  const call = client(withSpots(25));
  const asked = geocoder(call, { "Good place Chicago": { lat: 41.9, lng: -87.6 } });
  const r = await locate(call);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(stopById((await call("load")).data, "goodstop0001").lat, "41.9", "the good one on the first call");
  assert.equal(r.data.more, false, "every row was tried once");
  // Each row cost one lookup at most.
  const byStop = asked.filter((a) => /^Nowhere/.test(a.q));
  assert.equal(byStop.length, 25, byStop.map((a) => a.q).join(" | "));
  // The next call tries their other form (title with the day's city).
  const before = asked.length;
  await locate(call);
  const next = asked.slice(before).map((a) => a.q);
  assert.ok(next.includes("Nowhere 0 Chicago"), next.join(" | "));
  assert.equal(next.includes("Nowhere place 0 Chicago"), false);
  // What was tried is kept in one Script Property, only for rows still there.
  const tried = JSON.parse(call.fake.props.LOCATE_TRIED);
  assert.ok(Object.keys(tried).length > 0 && !Object.keys(tried).some((k) => k.includes("goodstop0001")));
});

test("more is true only while untried rows remain; the next call takes those first", async () => {
  const call = client(withSpots(45));
  geocoder(call, { "Good place Chicago": { lat: 41.9, lng: -87.6 } });
  const r1 = await locate(call);
  assert.equal(r1.data.more, true);
  assert.equal(stopById((await call("load")).data, "goodstop0001").lat, "");
  const r2 = await locate(call);
  assert.equal(stopById((await call("load")).data, "goodstop0001").lat, "41.9", "untried rows go before rows tried already");
  assert.equal(r2.data.more, false);
  // A row that is gone is pruned from the tried list.
  call.fake.tables.Stops.find((x) => x.id === "nowhere00000").deleted_at = "2026-12-01T00:00:00Z";
  await locate(call);
  assert.equal("stop:nowhere00000" in JSON.parse(call.fake.props.LOCATE_TRIED), false);
});

test("a stop is looked up with its day's city, and an answer far from the day counts as not found", async () => {
  const call = client();
  const asked = geocoder(call, {
    Chicago: { lat: 41.8781, lng: -87.6298 },
    // Another Navy Pier, 1100 km away.
    "Navy Pier Chicago": { lat: 40.7128, lng: -74.006 },
    "Union Station Chicago": { lat: 41.8789, lng: -87.6403 },
  });
  const seed = JSON.parse(JSON.stringify(PLAN));
  seed.stops.push({ id: "pierstop0001", date: CHI_DAY, time: "", title: "The pier", place: "Navy Pier" });
  seed.stops.push({ id: "uniostop0001", date: CHI_DAY, time: "", title: "Train", place: "Union Station" });
  const call2 = client(seed);
  call2.fake.geocoder.answer = call.fake.geocoder.answer;
  const r = await locate(call2);
  const qs = asked.map((a) => a.q);
  assert.ok(qs.includes("Navy Pier Chicago") && !qs.includes("Navy Pier"), qs.join(" | "));
  const d = (await call2("load")).data;
  assert.equal(stopById(d, "pierstop0001").lat, "", "1100 km from the day: not taken");
  assert.equal(stopById(d, "uniostop0001").lat, "41.8789");
  assert.ok(r.data.missing > 0);
});

test("with the day not yet located, the answer is taken (nothing to check it against)", async () => {
  const seed = JSON.parse(JSON.stringify(PLAN));
  seed.stops.push({ id: "pierstop0001", date: CHI_DAY, time: "", title: "The pier", place: "Navy Pier" });
  const call = client(seed);
  geocoder(call, { "Navy Pier Chicago": { lat: 40.7128, lng: -74.006 } });
  await locate(call);
  assert.equal(stopById((await call("load")).data, "pierstop0001").lat, "40.7128");
});

test("a stay whose address or place changes loses its coordinates; a name or a note keeps them; undo puts them back", async () => {
  const call = client();
  const at = () => { const r = call.fake.tables.Stays.find((x) => x.id === "planstay0001"); r.lat = "41.8916"; r.lng = "-87.6090"; };
  const base = async () => { const s = (await call("load")).data.stays.find((x) => x.id === "planstay0001"); const { deleted, lat, lng, ...rest } = s; return rest; };
  at();
  let r = await call("saveStay", { stay: { ...(await base()), note: "Late check-in" } });
  assert.equal(r.data.stay.lat, "41.8916", "a note keeps them");
  r = await call("saveStay", { stay: { ...(await base()), name: "Lakeside hotel" } });
  assert.deepEqual([r.data.stay.name, r.data.stay.lat], ["Lakeside hotel", "41.8916"], "a name alone keeps them");
  const un = await call("undo", { logId: r.data.logId });
  assert.deepEqual([un.data.stay.name, un.data.stay.lat], ["Asakusa hotel", "41.8916"], "undoing a name change keeps them too");
  for (const change of [{ addressJp: "1 Made Up St" }, { place: "Lakeside hotel Chicago" }]) {
    at();
    r = await call("saveStay", { stay: { ...(await base()), ...change } });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual([r.data.stay.lat, r.data.stay.lng], ["", ""], JSON.stringify(change));
  }
  const u = await call("undo", { logId: r.data.logId });
  assert.equal(u.data.stay.lat, "41.8916", "undoing the change brings them back");
  // Through the connector (merge) too.
  at();
  const m = await call.fake.claude("saveStay", { stay: { id: "planstay0001", place: "Another inn" }, merge: true });
  assert.equal(m.data.stay.lat, "");
});

test("a day whose city changes loses its coordinates; another change keeps them", async () => {
  const call = client();
  const at = () => { const r = call.fake.tables.Days.find((x) => x.date === CHI_DAY); r.lat = "41.88"; r.lng = "-87.63"; };
  at();
  let r = await call("setDay", { date: CHI_DAY, patch: { title: "Busy" } });
  assert.equal(r.data.day.lat, "41.88");
  r = await call("setDay", { date: CHI_DAY, patch: { city: "Chicago" } });
  assert.equal(r.data.day.lat, "41.88", "the same city is no change");
  r = await call("setDay", { date: CHI_DAY, patch: { city: "Evanston" } });
  assert.deepEqual([r.data.day.lat, r.data.day.lng], ["", ""]);
  const u = await call("undo", { logId: r.data.logId });
  assert.equal(u.data.day.lat, "41.88");
});

test("an expense edit never runs the coordinates check nor answers with a stop's message", async () => {
  const call = client();
  const add = await call("addExpense", { expense: { id: "exp0000001", day: CHI_DAY, title: "Deep dish", amount: 42, currency: "USD", paidBy: "Mo", split: ["Mo", "Izzah"] } });
  assert.equal(add.ok, true, JSON.stringify(add));
  const e = await call("updateExpense", { id: "exp0000001", patch: { lat: "1", lng: "2" } });
  assert.deepEqual([e.ok, e.message], [false, "Only a line’s details can be changed."]);
  const ok = await call("updateExpense", { id: "exp0000001", patch: { title: "Deep dish pizza" } });
  assert.equal(ok.ok, true);
});

// ---- undo of a position edit that locate has answered since ----

test("undo: a stop's place changed with no coordinates, located at the new place, then undone: coordinates cleared, the old place found again", async () => {
  const call = client();
  geocoder(call, { "Shibuya Sky Tokyo": { lat: 35.6585, lng: 139.7023 }, "New spot Tokyo": { lat: 35.66, lng: 139.71 } });
  const e = await call("updateStop", { id: "planstop1203", patch: { place: "New spot" } });
  await locate(call);
  assert.equal(stopById((await call("load")).data, "planstop1203").lat, "35.66");
  const u = await call("undo", { logId: e.data.logId });
  assert.equal(u.ok, true, JSON.stringify(u));
  assert.equal(u.data.stop.place, "Shibuya Sky");
  assert.deepEqual([u.data.stop.lat, u.data.stop.lng], ["", ""]);
  await locate(call);
  const s = stopById((await call("load")).data, "planstop1203");
  assert.deepEqual([s.lat, s.lng], ["35.6585", "139.7023"]);
});

test("undo: the same for a stay's place and a stay's address", async () => {
  const call = client();
  const table = { [HOTEL_ADDR + " Chicago"]: { lat: 35.2, lng: 139.2 } };
  const asked = geocoder(call, table);
  const stay = async () => (await call("load")).data.stays.find((x) => x.id === "planstay0001");
  const base = async () => { const s = await stay(); const { deleted, lat, lng, ...rest } = s; return rest; };
  const e = await call("saveStay", { stay: { ...(await base()), place: "Other inn" } });
  assert.equal(e.ok, true, JSON.stringify(e));
  await locate(call);
  assert.equal((await stay()).lat, "35.2", asked.map((a) => a.q).join(" | "));
  const u = await call("undo", { logId: e.data.logId });
  assert.equal(u.data.stay.place, "Asakusa hotel Tokyo");
  assert.deepEqual([u.data.stay.lat, u.data.stay.lng], ["", ""]);
  table[HOTEL_ADDR + " Chicago"] = { lat: 35.7, lng: 139.8 };
  await locate(call);
  assert.equal((await stay()).lat, "35.7");
  // The address, changed while the stay had no coordinates: cleared again on its undo.
  call.fake.tables.Stays.find((x) => x.id === "planstay0001").lat = "";
  const a = await call("saveStay", { stay: { ...(await base()), addressJp: "2 Made Up St" } });
  assert.deepEqual([a.data.stay.lat, a.data.stay.lng], ["", ""]);
  table["2 Made Up St Chicago"] = { lat: 35.7, lng: 139.8 };
  await locate(call);
  assert.equal((await stay()).lat, "35.7");
  const ua = await call("undo", { logId: a.data.logId });
  assert.deepEqual([ua.data.stay.lat, ua.data.stay.lng], ["", ""]);
});

test("undo: the same for a day's city", async () => {
  const call = client();
  geocoder(call, { Evanston: { lat: 42.04, lng: -87.69 }, Chicago: { lat: 41.88, lng: -87.63 } });
  const e = await call("setDay", { date: CHI_DAY, patch: { city: "Evanston" } });
  await locate(call);
  const day = async () => (await call("load")).data.days.find((x) => x.date === CHI_DAY);
  assert.equal((await day()).lat, "42.04");
  const u = await call("undo", { logId: e.data.logId });
  assert.equal(u.data.day.city, "Chicago");
  assert.deepEqual([u.data.day.lat, u.data.day.lng], ["", ""]);
  await locate(call);
  assert.equal((await day()).lat, "41.88");
});

// ---- the Maps-link reader (the same rule as js/geo.js pointFromLink) ----

test("pointFromLink: the pin first, the map's centre only in a place or search link, never a directions link", () => {
  assert.deepEqual(P.pointFromLink("https://www.google.com/maps/place/Pier/@41.88,-87.62,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d41.8917!4d-87.6086"), { lat: "41.8917", lng: "-87.6086" });
  assert.deepEqual(P.pointFromLink("https://www.google.com/maps/place/Pier/@41.8917,-87.6086,17z"), { lat: "41.8917", lng: "-87.6086" });
  assert.deepEqual(P.pointFromLink("https://www.google.com/maps/search/pizza/@41.89,-87.62,15z"), { lat: "41.89", lng: "-87.62" });
  assert.equal(P.pointFromLink("https://www.google.com/maps/@41.89,-87.62,15z"), null, "a bare map view is not read");
  assert.equal(P.pointFromLink("https://www.google.com/maps/dir/41.80,-87.60/Pier/@41.85,-87.61,13z/data=!3d41.8917!4d-87.6086"), null, "a directions link is refused");
  assert.equal(P.pointFromLink("https://maps.app.goo.gl/abc123"), null);
  assert.equal(P.pointFromLink("https://www.google.com/maps/place/x/@95.1,-87.1,17z"), null, "out of range");
  assert.equal(P.pointFromLink(""), null);
  assert.equal(P.pointFromLink(undefined), null);
});

test("metresBetween_: along the ground, NaN without both", () => {
  const m = P.metresBetween_({ lat: 41.8781, lng: -87.6298 }, { lat: "41.8917", lng: "-87.6086" });
  assert.ok(m > 2200 && m < 2400, String(m));
  assert.ok(Number.isNaN(P.metresBetween_({ lat: "", lng: "" }, { lat: 1, lng: 1 })));
  assert.ok(Number.isNaN(P.metresBetween_(null, { lat: 1, lng: 1 })));
});

test("locate: a stay is asked by street address then name, each with its first night's city; a far answer is not taken", async () => {
  const call = client();
  const addrQ = HOTEL_ADDR + " Chicago";
  const nameQ = "Asakusa hotel Asakusa hotel Tokyo Chicago";
  // The city of its first night is found first (rows go days first), then the hotel's answers are checked against it.
  const asked = geocoder(call, { Chicago: { lat: 41.9, lng: -87.6 }, [addrQ]: { lat: 35.7, lng: 139.8 }, [nameQ]: { lat: 41.95, lng: -87.65 } });
  await locate(call);
  const stay = async () => (await call("load")).data.stays.find((x) => x.id === "planstay0001");
  assert.ok(asked.some((a) => a.q === addrQ), "the address goes first");
  assert.ok(!asked.some((a) => a.q === nameQ));
  assert.equal((await stay()).lat, "", "an answer 10,000 km from the day is not taken");
  await locate(call);
  assert.ok(asked.some((a) => a.q === nameQ), "then the name with the place");
  assert.deepEqual([(await stay()).lat, (await stay()).lng], ["41.95", "-87.65"]);
});
