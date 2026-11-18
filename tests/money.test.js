import test from "node:test";
import assert from "node:assert/strict";
import * as M from "../js/money.js";

const P = ["Mo", "Izzah", "Sam"];
const E = (o) => ({ id: "e", day: "pre", title: "x", currency: "USD", rate: 0.72, split: P, deleted: false, ...o });
const pay = (from, to, cad, removed = false) => ({ id: "p", from, to, cad, removed });

test("US dollars convert at the stored rate, Canadian dollars are exact; both in cents", () => {
  assert.equal(M.cadCents(E({ amount: 6.49 })), 901);
  assert.equal(M.cadCents(E({ amount: 622.8 })), 86500);
  assert.equal(M.cadCents(E({ amount: 130, currency: "CAD", rate: 999 })), 13000);
  assert.equal(M.tripCents(E({ amount: 130, currency: "CAD", rate: 0.72 })), 9360);
  assert.equal(M.tripCents(E({ amount: 12.5 })), 1250);
  assert.equal(M.tripCents(E({ amount: 0.01, currency: "CAD", rate: 0.7234 })), 1);
});

test("money.js's home currency is the trip's home currency (js/trip.js)", async () => {
  const { HOME_CURRENCY } = await import("../js/trip.js");
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("../js/money.js", import.meta.url), "utf8");
  const homes = [...src.matchAll(/e\.currency === "([A-Z]{3})"/g)].map((m) => m[1]);
  assert.ok(homes.length >= 2);
  assert.deepEqual([...new Set(homes)], [HOME_CURRENCY]);
});

test("equal shares always sum to the whole", () => {
  assert.deepEqual(M.shares(901, P), { Mo: 301, Izzah: 300, Sam: 300 });
  assert.deepEqual(M.shares(86486, P), { Mo: 28829, Izzah: 28829, Sam: 28828 });
  assert.deepEqual(M.shares(1001, ["Izzah", "Mo"]), { Izzah: 501, Mo: 500 });
});

test("parts and exact amounts always sum to the whole", () => {
  assert.deepEqual(M.sharesWeighted(1000, P, [2, 3, 3]), { Mo: 250, Izzah: 375, Sam: 375 });
  assert.deepEqual(M.sharesWeighted(1001, P, [2, 3, 3]), { Mo: 250, Izzah: 376, Sam: 375 });
  assert.deepEqual(M.sharesWeighted(100, ["Mo", "Izzah"], [1, 2]), { Mo: 33, Izzah: 67 });
  assert.deepEqual(M.expenseShares(E({ amount: 80, currency: "CAD", splitMode: "parts", splitVals: [2, 3, 3] })), { Mo: 2000, Izzah: 3000, Sam: 3000 });
  assert.deepEqual(M.expenseShares(E({ amount: 100, currency: "CAD", splitMode: "exact", splitVals: [50, 30, 20] })), { Mo: 5000, Izzah: 3000, Sam: 2000 });
  assert.deepEqual(M.expenseShares(E({ amount: 72, splitMode: "exact", splitVals: [36, 21.6, 14.4] })), { Mo: 5000, Izzah: 3000, Sam: 2000 });
  assert.deepEqual(M.expenseShares(E({ amount: 6.49 })), { Mo: 301, Izzah: 300, Sam: 300 });
});

test("one fronted expense: two transfers that sum to the balance", () => {
  const bal = M.balances(P, [E({ amount: 622.81, paidBy: "Mo" })], []);
  assert.deepEqual(bal, { Mo: 57667, Izzah: -28834, Sam: -28833 });
  assert.deepEqual(M.transfers(bal), [
    { from: "Izzah", to: "Mo", cents: 28834 },
    { from: "Sam", to: "Mo", cents: 28833 },
  ]);
});

test("payer outside the split, deleted expenses, removed payments, uneven parts", () => {
  const ex = [
    E({ amount: 300, currency: "CAD", paidBy: "Izzah", split: ["Mo", "Sam"] }),
    E({ amount: 999, currency: "CAD", paidBy: "Mo", deleted: true }),
  ];
  assert.deepEqual(M.balances(P, ex, [pay("Mo", "Izzah", 50, true)]), { Mo: -15000, Izzah: 30000, Sam: -15000 });
  const parts = [E({ amount: 80, currency: "CAD", paidBy: "Mo", splitMode: "parts", splitVals: [2, 3, 3] })];
  assert.deepEqual(M.balances(P, parts, []), { Mo: 6000, Izzah: -3000, Sam: -3000 });
});

test("a recorded payment reduces the debt; an overpayment flips it", () => {
  const ex = [E({ amount: 622.8, paidBy: "Mo" })];
  assert.equal(M.balances(P, ex, [pay("Izzah", "Mo", 100)]).Izzah, -18833);
  const over = M.balances(P, ex, [pay("Izzah", "Mo", 300)]);
  assert.deepEqual(M.transfers(over), [
    { from: "Sam", to: "Mo", cents: 27666 },
    { from: "Sam", to: "Izzah", cents: 1167 },
  ]);
});

// Mo owes Izzah $10, Izzah owes Sam $10.
const chain = [
  E({ amount: 20, currency: "CAD", paidBy: "Izzah", split: ["Mo", "Izzah"] }),
  E({ amount: 20, currency: "CAD", paidBy: "Sam", split: ["Izzah", "Sam"] }),
];

test("Simplify on routes one payment; off lists each direct debt", () => {
  assert.deepEqual(M.owedList(P, chain, [], true), [{ from: "Mo", to: "Sam", cents: 1000 }]);
  assert.deepEqual(M.owedList(P, chain, [], false), [
    { from: "Mo", to: "Izzah", cents: 1000 },
    { from: "Izzah", to: "Sam", cents: 1000 },
  ]);
});

test("a payment made under either setting settles both readings", () => {
  const routed = [pay("Mo", "Sam", 10)];
  assert.deepEqual(M.owedList(P, chain, routed, true), []);
  assert.deepEqual(M.owedList(P, chain, routed, false), []);
  const part = [pay("Mo", "Sam", 4)];
  assert.deepEqual(M.owedList(P, chain, part, true), [{ from: "Mo", to: "Sam", cents: 600 }]);
  assert.deepEqual(M.owedList(P, chain, part, false), [
    { from: "Mo", to: "Izzah", cents: 600 },
    { from: "Izzah", to: "Sam", cents: 600 },
  ]);
  const directPaid = [pay("Mo", "Izzah", 10)];
  assert.deepEqual(M.owedList(P, chain, directPaid, true), [{ from: "Izzah", to: "Sam", cents: 1000 }]);
  assert.deepEqual(M.owedList(P, chain, directPaid, false), [{ from: "Izzah", to: "Sam", cents: 1000 }]);
});

test("standing names the other person only when there is exactly one", () => {
  const bal = { Mo: 57657, Izzah: -28829, Sam: -28828 };
  const t = M.transfers(bal);
  assert.deepEqual(M.standing("Mo", t, bal), { kind: "owed", who: null, cents: 57657 });
  assert.deepEqual(M.standing("Izzah", t, bal), { kind: "owe", who: "Mo", cents: 28829 });
  assert.deepEqual(M.standing("Mo", [], { Mo: 0, Izzah: 0, Sam: 0 }), { kind: "square", who: null, cents: 0 });
  const ex = [chain[0], E({ amount: 20, currency: "CAD", paidBy: "Mo", split: ["Mo", "Sam"] })];
  assert.deepEqual(M.standing("Mo", M.direct(P, ex, []), M.balances(P, ex, [])), { kind: "even", who: null, cents: 0 });
});

test("the working adds up, and a routed payment names who it goes through", () => {
  const part = [pay("Mo", "Sam", 4)];
  const w = M.working("Mo", chain, part);
  assert.deepEqual(w, { paid: 0, share: 1000, sent: 400, received: 0 });
  assert.equal(w.paid - w.share + w.sent - w.received, M.balances(P, chain, part).Mo);
  const d = M.direct(P, chain, []);
  assert.equal(M.routedVia({ from: "Mo", to: "Sam", cents: 1000 }, d, P), "Izzah");
  assert.equal(M.routedVia({ from: "Mo", to: "Izzah", cents: 1000 }, d, P), null);
});

// ---- Extra pins for Review Focus 4 and 5 (deterministic) ----
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
const netOf = (list, people) => {
  const n = Object.fromEntries(people.map((p) => [p, 0]));
  for (const t of list) { n[t.from] -= t.cents; n[t.to] += t.cents; }
  return n;
};

test("shares and weighted shares always sum to the total and are never negative", () => {
  for (const total of [1, 2, 3, 100, 1001, 86486]) {
    for (const names of [P, ["Mo", "Izzah"], ["Mo"]]) {
      const s = M.shares(total, names);
      assert.equal(sum(s), total);
      assert.ok(Object.values(s).every((v) => v >= 0));
    }
    for (const w of [[1, 1, 1], [1, 2, 0], [7, 3, 5], [2, 3, 3], [1, 1000, 1]]) {
      const s = M.sharesWeighted(total, P, w);
      assert.equal(sum(s), total, `total ${total} weights ${w}`);
      assert.ok(Object.values(s).every((v) => v >= 0), `total ${total} weights ${w}`);
    }
    const two = M.sharesWeighted(total, ["Mo", "Izzah"], [1, 2]);
    assert.equal(sum(two), total);
    assert.ok(Object.values(two).every((v) => v >= 0));
  }
});

test("transfers always move exactly each person's balance", () => {
  const sets = [
    { Mo: 57657, Izzah: -28829, Sam: -28828 },
    { Mo: 27657, Izzah: 1171, Sam: -28828 },
    { Mo: -1, Izzah: 1, Sam: 0 },
    { Mo: 5, Izzah: 5, Sam: -10 },
    { Mo: 0, Izzah: 0, Sam: 0 },
  ];
  for (const bal of sets) {
    const t = M.transfers(bal);
    assert.deepEqual(netOf(t, P), bal);
    assert.ok(t.length <= P.length - 1);
    assert.ok(t.every((x) => x.cents > 0));
  }
  assert.deepEqual(M.transfers({ Mo: 0, Izzah: 0, Sam: 0 }), []);
});

test("both Simplify readings move the same money, and are empty together exactly when square", () => {
  const cases = [
    { ex: [E({ amount: 622.8, paidBy: "Mo" })], pays: [] },
    { ex: [E({ amount: 6.49, paidBy: "Izzah" }), E({ amount: 5.59, paidBy: "Sam", split: ["Mo", "Sam"] })], pays: [pay("Mo", "Izzah", 3.33)] },
    { ex: chain, pays: [pay("Mo", "Sam", 10)] },
    { ex: chain, pays: [pay("Mo", "Izzah", 10), pay("Izzah", "Sam", 10)] },
    { ex: [E({ amount: 100, currency: "CAD", paidBy: "Mo", splitMode: "parts", splitVals: [1, 1, 1] }),
           E({ amount: 55.55, currency: "CAD", paidBy: "Sam", splitMode: "exact", splitVals: [10, 20.55, 25] })],
      pays: [pay("Izzah", "Mo", 12.34), pay("Sam", "Izzah", 5, true)] },
    { ex: [E({ amount: 20, currency: "CAD", paidBy: "Mo", split: ["Mo", "Izzah"] }),
           E({ amount: 20, currency: "CAD", paidBy: "Izzah", split: ["Izzah", "Sam"] }),
           E({ amount: 20, currency: "CAD", paidBy: "Sam", split: ["Sam", "Mo"] })], pays: [] },
    { ex: [], pays: [] },
  ];
  for (const { ex, pays } of cases) {
    const bal = M.balances(P, ex, pays);
    const d = M.direct(P, ex, pays);
    const t = M.transfers(bal);
    assert.deepEqual(netOf(d, P), bal);
    assert.deepEqual(netOf(t, P), bal);
    assert.ok(d.every((x) => x.cents > 0));
    const square = Object.values(bal).every((v) => v === 0);
    assert.equal(d.length === 0, square);
    assert.equal(t.length === 0, square);
  }
});
