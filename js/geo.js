/* Copyright (c) 2026 moissmart1. All rights reserved. No licence is granted: do not copy, adapt or reuse this code or design, and do not use it to train or prompt an AI system to reproduce it. See LICENSE. */
// Distances on the ground. Pure: no DOM, no storage, no clock of its own.
// A position here is { lat, lng, at, accuracy } (degrees, ms, metres); it
// only ever lives in this phone's memory (js/where.js).

// The longest a position is trusted, and the roughest.
export const FRESH_MS = 3 * 60 * 1000;
export const ROUGH_M = 300;

const R = 6371008.8; // the Earth's mean radius, metres
const rad = (d) => (d * Math.PI) / 180;
const num = (v) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);

// { lat, lng } from numbers or numbers as text, else null.
export function point(v) {
  if (!v || typeof v !== "object") return null;
  const lat = num(v.lat);
  const lng = num(v.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

// Metres between two points along the ground (haversine).
export function metres(a, b) {
  const p = point(a);
  const q = point(b);
  if (!p || !q) return NaN;
  const dLat = rad(q.lat - p.lat);
  const dLng = rad(q.lng - p.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(p.lat)) * Math.cos(rad(q.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const MILE_M = 1609.344;
export const BLOCK_M = MILE_M / 8; // 201.168: eight blocks to a mile
export const WALK_M_PER_MIN = 70; // a winter pace

// How far north and east b is of a, in metres (negative: south, west). null when either is not a point.
export function gridParts(a, b) {
  const p = point(a);
  const q = point(b);
  if (!p || !q) return null;
  return { north: rad(q.lat - p.lat) * R, east: rad(q.lng - p.lng) * R * Math.cos(rad((p.lat + q.lat) / 2)) };
}

// Metres along the grid: north-south plus east-west. NaN when either is not a point.
export function gridMetres(a, b) {
  const g = gridParts(a, b);
  return g ? Math.abs(g.north) + Math.abs(g.east) : NaN;
}

// Minutes on foot for a grid distance, rounded up, never under 1.
export function walkMinutes(m) {
  return Math.max(1, Math.ceil(m / WALK_M_PER_MIN));
}

// Whole blocks for a grid distance.
export function blocksOf(m) {
  return Math.round(m / BLOCK_M);
}

// "N", "S", "E" or "W": the longer of the two parts decides; equal parts say N or S. "" when both are under half a metre.
export function compass(a, b) {
  const g = gridParts(a, b);
  if (!g || (Math.abs(g.north) < 0.5 && Math.abs(g.east) < 0.5)) return "";
  return Math.abs(g.north) >= Math.abs(g.east) ? (g.north >= 0 ? "N" : "S") : g.east >= 0 ? "E" : "W";
}

// "under 0.1 mi", "0.5 mi", "1.4 mi", "10 mi". "" for NaN or a negative.
export function milesText(m) {
  if (!Number.isFinite(m) || m < 0) return "";
  const mi = m / MILE_M;
  return mi < 0.05 ? "under 0.1 mi" : mi < 9.95 ? mi.toFixed(1) + " mi" : Math.round(mi) + " mi";
}

// The city's own grid: State and Madison are zero. Most miles count as 800 address numbers.
export const GRID_ORIGIN = { lat: 41.88195, lng: -87.62784 };

// "100 S · 100 E" for a place, to the nearest block; "" when it is not a point or is over 160 blocks (20 miles) out either way.
export function gridSpot(p) {
  const g = gridParts(GRID_ORIGIN, p);
  if (!g) return "";
  const ns = Math.round(g.north / BLOCK_M);
  const ew = Math.round(g.east / BLOCK_M);
  if (Math.abs(ns) > 160 || Math.abs(ew) > 160) return "";
  // A straight-line estimate "to the nearest block". South of Madison the
  // numbers run at different rates per mile: 1200 per mile from Madison to
  // Roosevelt (1200 S), 1000 to Cermak (2200 S), 900 to 31st (3100 S), then
  // 800 per mile.
  const south = Math.max(0, -g.north / MILE_M);
  const southBlocks = Math.round(12 * Math.min(south, 1)
    + 10 * Math.min(Math.max(south - 1, 0), 1)
    + 9 * Math.min(Math.max(south - 2, 0), 1)
    + 8 * Math.max(south - 3, 0));
  return (southBlocks ? southBlocks * 100 + " S" : Math.abs(ns) * 100 + " N") + " · " + Math.abs(ew) * 100 + (ew >= 0 ? " E" : " W");
}

// A position is used only when it is at most 3 minutes old and 300 m or better.
export function usable(pos, now) {
  if (!pos || !point(pos)) return false;
  const at = num(pos.at);
  const acc = num(pos.accuracy);
  if (!Number.isFinite(at) || !Number.isFinite(acc) || acc < 0 || acc > ROUGH_M) return false;
  // A phone's clock a little ahead is allowed; a minute ahead is not believed.
  return now - at <= FRESH_MS && at - now <= 60 * 1000;
}

// What a pasted directions link would give away: its start is often where
// someone was. Refused, never read.
export const DIRECTIONS_LINK = "That’s a directions link. Paste the place’s own link.";
const isDirections = (s) => /\/dir\//i.test(s);

// Why a pasted link cannot be used, or "".
export function linkProblem(text) {
  return typeof text === "string" && isDirections(text.trim()) ? DIRECTIONS_LINK : "";
}

// The position in a pasted Google Maps link: the place's own pin
// (!3d<lat>!4d<lng>) when the link has one, else, only in a place or search
// link, the map's centre (@<lat>,<lng>). null for a directions link (its
// start may be where someone was), a bare map view (its centre may be too)
// and a link with neither (a short maps.app.goo.gl link). Backend/Pure.js
// pointFromLink is the same rule.
export function pointFromLink(text) {
  if (typeof text !== "string") return null;
  const s = text.trim();
  if (isDirections(s)) return null;
  const pin = /!3d(-?\d{1,2}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/.exec(s);
  const at = /\/(?:place|search)\//i.test(s) ? /@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/.exec(s) : null;
  const m = pin || at;
  return m ? point({ lat: m[1], lng: m[2] }) : null;
}
