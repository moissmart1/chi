/* Copyright (c) 2026 moissmart1. All rights reserved. No licence is granted: do not copy, adapt or reuse this code or design, and do not use it to train or prompt an AI system to reproduce it. See LICENSE. */
// The trip's backend address. Empty until this trip has its own Sheet and
// script: the app then says plainly that it is not connected yet.
export const API_URL = "https://script.google.com/macros/s/AKfycbybW4pghUgkPGM5mV4x3HnmWq9o3zJ2vIf62eRzDl5gjPT5XkHoCXyh52iqUHe4b5NwyQ/exec";
// The app's name wherever a person reads it (Izzah’s word, with a typographic
// apostrophe). Inside the code the app stays "chi" (keys, caches, the folder).
export const APP_NAME = "Wendy’s";
export const APP_VERSION = "10";
// Every key this app keeps in localStorage or sessionStorage starts with
// this. Another trip's app can be served from the same origin and so shares
// the same storage: a different prefix keeps their keys, caches and unsent
// lines apart.
export const STORAGE_PREFIX = "chi.";
// What sw.js says to the page when a new version has taken over; sw.js
// builds the same string from its own cache prefix ("chi-").
export const NEW_VERSION_MESSAGE = "chi-new-version";
// The offline worker's cache names start with this (sw.js PREFIX); Forget this
// phone removes only these, never the Japan app's on the same origin.
export const CACHE_PREFIX = "chi-";
