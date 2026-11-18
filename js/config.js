/* Copyright (c) 2026 moissmart1. All rights reserved. No licence is granted: do not copy, adapt or reuse this code or design, and do not use it to train or prompt an AI system to reproduce it. See LICENSE. */
// The trip's backend address. Empty until this trip has its own Sheet and
// script: the app then says plainly that it is not connected yet.
export const API_URL = "";
export const APP_VERSION = "1";
// Every key this app keeps in localStorage or sessionStorage starts with
// this. Another trip's app can be served from the same origin and so shares
// the same storage: a different prefix keeps their keys, caches and unsent
// lines apart.
export const STORAGE_PREFIX = "chi.";
// What sw.js says to the page when a new version has taken over; sw.js
// builds the same string from its own cache prefix ("chi-").
export const NEW_VERSION_MESSAGE = "chi-new-version";
