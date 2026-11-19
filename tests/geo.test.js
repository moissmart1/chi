/* Copyright (c) 2026 moissmart1. All rights reserved. No licence is granted: do not copy, adapt or reuse this code or design, and do not use it to train or prompt an AI system to reproduce it. See LICENSE. */
// Distances on the ground and the Maps-link reader (js/geo.js), ported from
// the Japan app (MAT 818a49a, 00ae93d). Pure: nothing here leaves the phone.
// Every place here is made up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { metres, walkMinutes, usable, distanceText, pointFromLink, linkProblem, DIRECTIONS_LINK, point, FRESH_MS, ROUGH_M } from "../js/geo.js";

const LOOP = { lat: 41.8781, lng: -87.6298 };
const NOW = Date.parse("2026-12-28T13:20:00-06:00");

test("metres: the haversine distance", () => {
  assert.equal(metres(LOOP, LOOP), 0);
  // One degree of latitude is about 111.2 km.
  assert.ok(Math.abs(metres({ lat: 41, lng: -87 }, { lat: 42, lng: -87 }) - 111195) < 20);
  // Two made-up points about 2.3 km apart.
  const d = metres({ lat: 41.8781, lng: -87.6298 }, { lat: 41.8917, lng: -87.6086 });
  assert.ok(d > 2200 && d < 2400, String(d));
  // Numbers as text, as the Sheet keeps them.
  assert.equal(metres({ lat: "41", lng: "-87" }, { lat: 41, lng: -87 }), 0);
  for (const bad of [null, {}, { lat: "", lng: "" }, { lat: 91, lng: 0 }, { lat: 0, lng: 181 }, { lat: "x", lng: 1 }]) assert.ok(Number.isNaN(metres(bad, LOOP)), JSON.stringify(bad));
});

test("walkMinutes: 1.3 times the straight line, at 80 m a minute, rounded up", () => {
  assert.equal(walkMinutes(0), 0);
  assert.equal(walkMinutes(1000), 17); // 1300 / 80 = 16.25
  assert.equal(walkMinutes(984.6), 16); // 1280 / 80 = 16, exactly
  assert.equal(walkMinutes(1), 1);
  assert.equal(walkMinutes(3000), 49);
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

test("distanceText", () => {
  assert.equal(distanceText(4), "10 m");
  assert.equal(distanceText(283), "280 m");
  assert.equal(distanceText(650), "650 m");
  assert.equal(distanceText(994), "990 m");
  assert.equal(distanceText(996), "1.0 km");
  assert.equal(distanceText(1204), "1.2 km");
  assert.equal(distanceText(2449), "2.4 km");
  assert.equal(distanceText(24400), "24 km");
  assert.equal(distanceText(NaN), "");
  assert.equal(distanceText(-1), "");
});

test("pointFromLink: the pin, else the map's centre, else nothing", () => {
  const full = "https://www.google.com/maps/place/Made+Up+Pier/@41.8916,-87.6100,17z/data=!3m1!4b1!4m6!3m5!1s0x6001!8m2!3d41.8917286!4d-87.6086472!16s";
  assert.deepEqual(pointFromLink(full), { lat: 41.8917286, lng: -87.6086472 });
  assert.deepEqual(pointFromLink("https://www.google.com/maps/place/Made+Up+Station/@41.8789,-87.6403,15z"), { lat: 41.8789, lng: -87.6403 });
  assert.deepEqual(pointFromLink("  https://www.google.com/maps/search/pizza/@-33.8688,151.2093,12z "), { lat: -33.8688, lng: 151.2093 });
  for (const none of ["https://maps.app.goo.gl/abc123", "Union Station", "", null, 7, "https://www.google.com/maps/@95.1,-87.1,15z"]) assert.equal(pointFromLink(none), null, String(none));
  assert.deepEqual(point({ lat: "41.1", lng: "-87.2" }), { lat: 41.1, lng: -87.2 });
});

test("a directions link is refused; the map's centre is read only from a place or search link", () => {
  const dir = "https://www.google.com/maps/dir/41.8781,-87.6298/Made+Up+Station/@41.88,-87.63,14z/data=!3m1!4b1!4m9!4m8!1m1!4e1!1m5!1m1!1s0x0:0x0!2m2!1d-87.6403!2d41.8789";
  assert.equal(DIRECTIONS_LINK, "That’s a directions link. Paste the place’s own link.");
  assert.equal(linkProblem(dir), DIRECTIONS_LINK);
  assert.equal(pointFromLink(dir), null, "never read, it may say where a person was");
  assert.equal(pointFromLink("https://www.google.com/maps/dir/?api=1&destination=x!3d41.1!4d-87.1"), null);
  // A bare map view's centre is where someone was looking (or standing): not read.
  assert.equal(pointFromLink("https://www.google.com/maps/@41.8789,-87.6403,15z"), null);
  assert.equal(linkProblem("https://www.google.com/maps/@41.8789,-87.6403,15z"), "");
  // The pin is read from any other Maps link, as before.
  assert.deepEqual(pointFromLink("https://www.google.com/maps/@1,2,3z/data=!3d41.5!4d-87.5"), { lat: 41.5, lng: -87.5 });
  assert.equal(linkProblem("https://www.google.com/maps/place/x/@41,-87,17z"), "");
  assert.equal(linkProblem(""), "");
});

test("the phone's reader and the backend's agree on every link", async () => {
  const { createRequire } = await import("node:module");
  const P = createRequire(import.meta.url)("../backend/Pure.js");
  const links = [
    "https://www.google.com/maps/place/Made+Up+Pier/@41.8916,-87.6100,17z/data=!3m1!4b1!4m6!3m5!1s0x6001!8m2!3d41.8917286!4d-87.6086472!16s",
    "https://www.google.com/maps/place/Made+Up+Station/@41.8789,-87.6403,15z",
    "https://www.google.com/maps/search/pizza/@41.89,-87.62,12z",
    "https://www.google.com/maps/@41.8789,-87.6403,15z",
    "https://www.google.com/maps/dir/41.8781,-87.6298/x/@41.88,-87.63,14z/data=!3d41.1!4d-87.1",
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
