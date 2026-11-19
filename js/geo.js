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

// Minutes on foot for a straight line: streets are about 1.3 times longer, at 80 m a minute.
export function walkMinutes(m) {
  return Math.ceil((m * 1.3) / 80);
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

// "280 m", "1.2 km", "24 km".
export function distanceText(m) {
  if (!Number.isFinite(m) || m < 0) return "";
  if (m < 995) return Math.max(10, Math.round(m / 10) * 10) + " m";
  if (m < 9950) return (m / 1000).toFixed(1) + " km";
  return Math.round(m / 1000) + " km";
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
