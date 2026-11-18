// Money maths in integer Canadian cents. Pure: no DOM, no globals, no imports.
//
// A line is in the home currency ("CAD", HOME_CURRENCY in js/trip.js; this
// file can't import it, tests/money.test.js checks the two agree) or in the
// trip's (US dollars). Both have 100 cents to the unit. e.rate is how many
// trip dollars one home dollar bought that day (about 0.72).

export function cadCents(e) {
  return e.currency === "CAD" ? Math.round(e.amount * 100) : Math.round((e.amount / e.rate) * 100);
}

// The line in the trip's currency, in cents.
export function tripCents(e) {
  return e.currency === "CAD" ? Math.round(e.amount * e.rate * 100) : Math.round(e.amount * 100);
}

export function shares(cents, names) {
  const n = names.length;
  const base = Math.floor(cents / n);
  const extra = cents - base * n;
  const out = {};
  names.forEach((name, i) => { out[name] = base + (i < extra ? 1 : 0); });
  return out;
}

export function sharesWeighted(cents, names, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return shares(cents, names);
  const rows = names.map((name, i) => {
    const num = cents * weights[i];
    return { name, i, floor: Math.floor(num / total), rem: num % total };
  });
  let left = cents - rows.reduce((a, r) => a + r.floor, 0);
  const order = rows.slice().sort((a, b) => b.rem - a.rem || a.i - b.i);
  const out = {};
  rows.forEach((r) => { out[r.name] = r.floor; });
  for (const r of order) {
    if (left <= 0) break;
    out[r.name] += 1;
    left -= 1;
  }
  return out;
}

export function expenseShares(e) {
  const cents = cadCents(e);
  const mode = e.splitMode || "equal";
  if (mode === "parts") return sharesWeighted(cents, e.split, e.splitVals);
  if (mode === "exact") return sharesWeighted(cents, e.split, e.splitVals.map((v) => Math.round(v * 100)));
  return shares(cents, e.split);
}

export function balances(people, expenses, payments) {
  const bal = Object.fromEntries(people.map((p) => [p, 0]));
  for (const e of expenses) {
    if (e.deleted) continue;
    bal[e.paidBy] += cadCents(e);
    const s = expenseShares(e);
    for (const name of Object.keys(s)) bal[name] -= s[name];
  }
  for (const p of payments) {
    if (p.removed) continue;
    const c = Math.round(p.cad * 100);
    bal[p.from] += c;
    bal[p.to] -= c;
  }
  return bal;
}

export function transfers(bal) {
  const names = Object.keys(bal);
  const order = (a, b) => b.c - a.c || a.i - b.i;
  const debtors = names.map((n, i) => ({ n, i, c: -bal[n] })).filter((x) => x.c > 0).sort(order);
  const creditors = names.map((n, i) => ({ n, i, c: bal[n] })).filter((x) => x.c > 0).sort(order);
  const out = [];
  while (debtors.length && creditors.length) {
    const d = debtors[0];
    const c = creditors[0];
    const cents = Math.min(d.c, c.c);
    out.push({ from: d.n, to: c.n, cents });
    d.c -= cents;
    c.c -= cents;
    if (d.c === 0) debtors.shift();
    if (c.c === 0) creditors.shift();
    debtors.sort(order);
    creditors.sort(order);
  }
  return out;
}

export function direct(people, expenses, payments) {
  // owe[a][b] = cents a owes b, before netting
  const owe = {};
  for (const a of people) { owe[a] = {}; for (const b of people) owe[a][b] = 0; }
  for (const e of expenses) {
    if (e.deleted) continue;
    const s = expenseShares(e);
    for (const name of Object.keys(s)) if (name !== e.paidBy) owe[name][e.paidBy] += s[name];
  }
  for (const p of payments) {
    if (p.removed) continue;
    owe[p.from][p.to] -= Math.round(p.cad * 100);
  }
  // net each pair to one direction
  const d = {};
  for (const a of people) { d[a] = {}; for (const b of people) d[a][b] = 0; }
  for (const a of people) {
    for (const b of people) {
      if (a !== b) d[a][b] = Math.max(0, owe[a][b] - owe[b][a]);
    }
  }
  // remove three-person loops by their smallest leg
  let changed = true;
  while (changed) {
    changed = false;
    for (const a of people) for (const b of people) for (const c of people) {
      if (a === b || b === c || a === c) continue;
      const m = Math.min(d[a][b], d[b][c], d[c][a]);
      if (m > 0) {
        d[a][b] -= m; d[b][c] -= m; d[c][a] -= m;
        changed = true;
      }
    }
  }
  const out = [];
  for (const a of people) for (const b of people) if (d[a][b] > 0) out.push({ from: a, to: b, cents: d[a][b] });
  return out;
}

export function owedList(people, expenses, payments, simplify) {
  return simplify ? transfers(balances(people, expenses, payments)) : direct(people, expenses, payments);
}

export function standing(me, list, bal) {
  const mine = list.filter((t) => t.from === me || t.to === me);
  const who = mine.length === 1 ? (mine[0].from === me ? mine[0].to : mine[0].from) : null;
  const b = bal[me];
  if (b > 0) return { kind: "owed", who, cents: b };
  if (b < 0) return { kind: "owe", who, cents: -b };
  return { kind: mine.length ? "even" : "square", who: null, cents: 0 };
}

export function working(name, expenses, payments) {
  let paid = 0, share = 0, sent = 0, received = 0;
  for (const e of expenses) {
    if (e.deleted) continue;
    if (e.paidBy === name) paid += cadCents(e);
    const s = expenseShares(e);
    if (name in s) share += s[name];
  }
  for (const p of payments) {
    if (p.removed) continue;
    const c = Math.round(p.cad * 100);
    if (p.from === name) sent += c;
    if (p.to === name) received += c;
  }
  return { paid, share, sent, received };
}

export function routedVia(transfer, directList, people) {
  const has = directList.some((t) => t.from === transfer.from && t.to === transfer.to && t.cents >= transfer.cents);
  if (has) return null;
  if (people.length === 3) return people.find((p) => p !== transfer.from && p !== transfer.to) ?? "others";
  return "others";
}
