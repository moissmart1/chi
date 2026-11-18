import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { setAsideText } from "../js/views/money.js";
import { MAX_UNITS } from "../js/views/register.js";
import { createApi } from "../js/api.js";
import { createStore } from "../js/store.js";

const require = createRequire(import.meta.url);
const P = require("../backend/Pure.js");
const { createFakeBackend } = require("./fake-backend.cjs");

test("the receipt's line about rows left out: one, several, and why (F3)", () => {
  assert.equal(setAsideText([]), "");
  assert.equal(setAsideText([{ id: "a", reason: "name" }]), "1 line in the Sheet can’t be read (a name the app doesn’t know). It’s left out of the totals. Tell Mo.");
  assert.equal(setAsideText([{ id: "a", reason: "name" }, { id: "b", reason: "name" }]), "2 lines in the Sheet can’t be read (a name the app doesn’t know). They’re left out of the totals. Tell Mo.");
  assert.equal(setAsideText([{ id: "a", reason: "amount" }]), "1 line in the Sheet can’t be read (an amount the app can’t read). It’s left out of the totals. Tell Mo.");
  assert.equal(setAsideText([{ id: "a", reason: "name" }, { id: "b", reason: "amount" }]), "2 lines in the Sheet can’t be read (a name the app doesn’t know, or an amount the app can’t read). They’re left out of the totals. Tell Mo.");
});

test("the register's limit is exactly the backend's, in both currencies (F13)", () => {
  const ok = (amount, currency) => P.validateExpense({ id: "exp0000001", day: "pre", title: "x", amount, currency, paidBy: "Mo", split: ["Mo"] }, ["Mo"]).ok;
  assert.equal(ok(MAX_UNITS.USD / 100, "USD"), true);
  assert.equal(ok((MAX_UNITS.USD + 1) / 100, "USD"), false);
  assert.equal(ok(MAX_UNITS.CAD / 100, "CAD"), true);
  assert.equal(ok((MAX_UNITS.CAD + 1) / 100, "CAD"), false);
});

test("a key the trip refuses is told apart from no key at all, and a later boot starts clean (F5)", async () => {
  const fake = createFakeBackend();
  const map = new Map([["chi.key", "wrong-key-1"]]);
  const storage = { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
  const fetchImpl = async (url, init) => ({ ok: true, status: 200, text: async () => JSON.stringify(await fake(JSON.parse(init.body))) });
  const api = createApi({ url: "https://example.test/exec", getKey: () => storage.getItem("chi.key"), getActor: () => "Mo", fetchImpl });
  const store = createStore({ api, storage, wait: async () => {} });
  await store.boot();
  assert.deepEqual([store.state.status, store.state.keyRefused], ["nokey", true]);
  map.delete("chi.key");
  await store.boot();
  assert.deepEqual([store.state.status, store.state.keyRefused], ["nokey", false]);
  map.set("chi.key", "test-key");
  await store.boot();
  assert.deepEqual([store.state.status, store.state.keyRefused], ["ready", false]);
});
