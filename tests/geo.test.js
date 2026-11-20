/* Copyright (c) 2026 moissmart1. All rights reserved. No licence is granted: do not copy, adapt or reuse this code or design, and do not use it to train or prompt an AI system to reproduce it. See LICENSE. */
// Distances on the ground and the Maps-link reader (js/geo.js), ported from
// the Japan app (MAT 818a49a, 00ae93d). Pure: nothing here leaves the phone.
// Every place here is made up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { metres, walkMinutes, usable, gridMetres, gridParts, blocksOf, compass, milesText, gridSpot, GRID_ORIGIN, MILE_M, BLOCK_M, WALK_M_PER_MIN, pointFromLink, linkProblem, DIRECTIONS_LINK, point, FRESH_MS, ROUGH_M } from "../js/geo.js";

const LOOP = { lat: 41.8954, lng: -87.6589 };
const NOW = Date.parse("2026-12-28T13:20:00-06:00");

test("metres: the haversine distance", () => {
  assert.equal(metres(LOOP, LOOP), 0);
  // One degree of latitude is about 111.2 km.
  assert.ok(Math.abs(metres({ lat: 41, lng: -87 }, { lat: 42, lng: -87 }) - 111195) < 20);
  // Two made-up points about 2.3 km apart.
  const d = metres({ lat: 41.8954, lng: -87.6589 }, { lat: 41.9091, lng: -87.6377 });
  assert.ok(d > 2200 && d < 2400, String(d));
  // Numbers as text, as the Sheet keeps them.
  assert.equal(metres({ lat: "41", lng: "-87" }, { lat: 41, lng: -87 }), 0);
  for (const bad of [null, {}, { lat: "", lng: "" }, { lat: 91, lng: 0 }, { lat: 0, lng: 181 }, { lat: "x", lng: 1 }]) assert.ok(Number.isNaN(metres(bad, LOOP)), JSON.stringify(bad));
});

// A made-up spot, and a point `north` metres north and `east` metres east of a base.
const P = { lat: 41.9, lng: -87.7 };
const DEG = (6371008.8 * Math.PI) / 180;
const off = (base, north, east) => ({
  lat: +(base.lat + north / DEG).toFixed(6),
  lng: +(base.lng + east / (DEG * Math.cos((base.lat * Math.PI) / 180))).toFixed(6),
});

test("walkMinutes: 70 m a minute along the grid, rounded up, never under 1", () => {
  assert.equal(WALK_M_PER_MIN, 70);
  const table = [[0, 1], [1, 1], [70, 1], [71, 2], [140, 2], [805, 12], [1609, 23], [3000, 43]];
  for (const [m, want] of table) assert.equal(walkMinutes(m), want, String(m));
});

test("blocksOf: eight blocks to a mile", () => {
  assert.equal(MILE_M, 1609.344);
  assert.equal(BLOCK_M, MILE_M / 8);
  const table = [[0, 0], [100, 0], [101, 1], [805, 4], [1609.344, 8], [3300, 16], [3400, 17]];
  for (const [m, want] of table) assert.equal(blocksOf(m), want, String(m));
});

test("milesText", () => {
  const table = [[0, "under 0.1 mi"], [79, "under 0.1 mi"], [81, "0.1 mi"], [241, "0.1 mi"], [805, "0.5 mi"], [2250, "1.4 mi"], [15300, "9.5 mi"], [16020, "10 mi"], [NaN, ""], [-1, ""]];
  for (const [m, want] of table) assert.equal(milesText(m), want, String(m));
});

test("gridMetres is north-south plus east-west; metres stays the straight line", () => {
  const q = off(P, -400, 300);
  assert.ok(Math.abs(gridMetres(P, q) - 700) < 1, String(gridMetres(P, q)));
  assert.ok(Math.abs(metres(P, q) - 500) < 1, String(metres(P, q)));
  assert.ok(Number.isNaN(gridMetres(P, { lat: "", lng: "" })));
  assert.equal(gridParts(null, P), null);
});

test("compass: the longer way decides", () => {
  assert.equal(compass(P, off(P, -805, 0)), "S");
  assert.equal(compass(P, off(P, 0, 320)), "E");
  assert.equal(compass(P, off(P, 600, -200)), "N");
  assert.equal(compass(P, off(P, -100, -300)), "W");
  assert.equal(compass(P, P), "");
  assert.equal(compass(P, null), "");
});

test("gridSpot: the city's own grid", () => {
  assert.equal(gridSpot(off(GRID_ORIGIN, -201, 201)), "100 S · 100 E");
  assert.equal(gridSpot(off(GRID_ORIGIN, 1609, -805)), "800 N · 400 W");
  assert.equal(gridSpot(GRID_ORIGIN), "0 N · 0 E");
  assert.equal(gridSpot(off(GRID_ORIGIN, 40000, 0)), "");
  assert.equal(gridSpot({ lat: "", lng: "" }), "");
});

test("usable: at most 3 minutes old and 300 m or better", () => {
  assert.equal(ROUGH_M, 300);
  const pos = { ...LOOP, at: NOW, accuracy: 40 };
  assert.equal(usable(pos, NOW), true);
  assert.equal(usable({ ...pos, at: NOW - FRESH_MS }, NOW), true, "exactly 3 minutes");
  assert.equal(usable({ ...pos, at: NOW - FRESH_MS - 1 }, NOW), false, "stale");
  assert.equal(usable({ ...pos, accuracy: 300 }, NOW), true);
  assert.equal(usable({ ...pos, accuracy: 301 }, NOW), false, "rough");
  assert.equal(usable({ ...pos, accuracy: NaN }, NOW), false);
  assert.equal(usable({ ...pos, at: NOW + 2 * 60000 }, NOW), false, "from the future");
  assert.equal(usable({ ...pos, at: NOW + 30000 }, NOW), true, "a clock a little ahead");
  for (const bad of [null, undefined, {}, { lat: 41, lng: -87 }, { ...pos, lat: 99 }]) assert.equal(usable(bad, NOW), false, JSON.stringify(bad));
});

test("pointFromLink: the pin, else the map's centre, else nothing", () => {
  const full = "https://www.google.com/maps/place/Made+Up+Pier/@41.9089,-87.6391,17z/data=!3m1!4b1!4m6!3m5!1s0x6001!8m2!3d41.9090286!4d-87.6377472!16s";
  assert.deepEqual(pointFromLink(full), { lat: 41.9090286, lng: -87.6377472 });
  assert.deepEqual(pointFromLink("https://www.google.com/maps/place/Made+Up+Station/@41.8962,-87.6694,15z"), { lat: 41.8962, lng: -87.6694 });
  assert.deepEqual(pointFromLink("  https://www.google.com/maps/search/pizza/@-33.8515,151.1802,12z "), { lat: -33.8515, lng: 151.1802 });
  for (const none of ["https://maps.app.goo.gl/abc123", "Union Station", "", null, 7, "https://www.google.com/maps/@95.1,-87.1,15z"]) assert.equal(pointFromLink(none), null, String(none));
  assert.deepEqual(point({ lat: "41.1", lng: "-87.2" }), { lat: 41.1, lng: -87.2 });
});

test("a directions link is refused; the map's centre is read only from a place or search link", () => {
  const dir = "https://www.google.com/maps/dir/41.8954,-87.6589/Made+Up+Station/@41.88,-87.63,14z/data=!3m1!4b1!4m9!4m8!1m1!4e1!1m5!1m1!1s0x0:0x0!2m2!1d-87.6694!2d41.8962";
  assert.equal(DIRECTIONS_LINK, "That’s a directions link. Paste the place’s own link.");
  assert.equal(linkProblem(dir), DIRECTIONS_LINK);
  assert.equal(pointFromLink(dir), null, "never read, it may say where a person was");
  assert.equal(pointFromLink("https://www.google.com/maps/dir/?api=1&destination=x!3d41.1!4d-87.1"), null);
  // A bare map view's centre is where someone was looking (or standing): not read.
  assert.equal(pointFromLink("https://www.google.com/maps/@41.8962,-87.6694,15z"), null);
  assert.equal(linkProblem("https://www.google.com/maps/@41.8962,-87.6694,15z"), "");
  // The pin is read from any other Maps link, as before.
  assert.deepEqual(pointFromLink("https://www.google.com/maps/@1,2,3z/data=!3d41.5!4d-87.5"), { lat: 41.5, lng: -87.5 });
  assert.equal(linkProblem("https://www.google.com/maps/place/x/@41,-87,17z"), "");
  assert.equal(linkProblem(""), "");
});

test("the phone's reader and the backend's agree on every link", async () => {
  const { createRequire } = await import("node:module");
  const P = createRequire(import.meta.url)("../backend/Pure.js");
  const links = [
    "https://www.google.com/maps/place/Made+Up+Pier/@41.9089,-87.6391,17z/data=!3m1!4b1!4m6!3m5!1s0x6001!8m2!3d41.9090286!4d-87.6377472!16s",
    "https://www.google.com/maps/place/Made+Up+Station/@41.8962,-87.6694,15z",
    "https://www.google.com/maps/search/pizza/@41.89,-87.62,12z",
    "https://www.google.com/maps/@41.8962,-87.6694,15z",
    "https://www.google.com/maps/dir/41.8954,-87.6589/x/@41.88,-87.63,14z/data=!3d41.1!4d-87.1",
    "https://maps.app.goo.gl/abc123",
    "https://www.google.com/maps/place/x/@95.1,-87.1,17z",
    "",
  ];
  for (const l of links) {
    const a = pointFromLink(l);
    const b = P.pointFromLink(l);
    assert.deepEqual(a ? { lat: String(a.lat), lng: String(a.lng) } : null, b, l);
  }
});
