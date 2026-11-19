// mailLinks (2026-11-18): the owner runs it in the script editor; for each
// person it makes a new personal key, stores its hash, and hands the link to
// the mail desk (DESK_URL) to mail to that person alone. A refused or failed
// hand-over puts the person's previous link back. No key or link is ever in a
// log line, an error, a Sheet row or a Script Property other than as a hash.
// Through the fake backend (the real Pure.js, Keys.js, Actions.js, Setup.js)
// with a stand-in desk; the real Env.js postJson_ over a stand-in UrlFetchApp.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createFakeBackend, sha256 } = require("./fake-backend.cjs");

const SEED = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "seed.json"), "utf8"));
const DESK = "https://script.google.com/macros/s/made-up-desk-for-tests/exec";
const SITE = "https://example.test/chi/";
const LINK_RE = /^https:\/\/example\.test\/chi\/#k=([0-9a-f]{64})$/;

function world({ props = { DESK_URL: DESK, SITE_URL: SITE }, lockFails, people } = {}) {
  const fake = createFakeBackend({ ...SEED, ...(people ? { addPeople: people } : {}) }, { lockFails });
  Object.assign(fake.props, props);
  return fake;
}

const keysOf = (fake) => JSON.parse(fake.props.PERSON_KEYS || "{}");
const linkKey = (post) => LINK_RE.exec(post.body.link)[1];

// Everything the backend kept or said, apart from PERSON_KEYS' hashes.
function everythingSaid(fake) {
  const props = { ...fake.props };
  delete props.PERSON_KEYS;
  return [fake.logged.join("\n"), fake.consoleLines.join("\n"), JSON.stringify(props), JSON.stringify(fake.tables)].join("\n");
}
function assertNoKeyOrLink(fake, extra = []) {
  const said = everythingSaid(fake) + "\n" + extra.map((x) => JSON.stringify(x)).join("\n");
  for (const p of fake.deskPosts) {
    const key = LINK_RE.exec(p.body.link) ? linkKey(p) : null;
    if (key) assert.equal(said.includes(key), false, "a key leaked");
    assert.equal(said.includes(p.body.link), false, "a link leaked");
  }
  assert.equal(/#k=/.test(said), false);
  assert.equal(/[0-9a-f]{64}/.test(fake.logged.join("\n")), false, "nothing shaped like a key in the run log");
}

test("mailLinks: for each person a new key, its hash stored (as next, beside any old one) before one POST of exactly the four fields; then that key opens the trip as them", async () => {
  const fake = world();
  const old = fake.personKey("Izzah");
  const oldHash = sha256(old);
  const seen = [];
  fake.desk = (url, body) => {
    // At the moment of the POST the new key's hash is already stored, as
    // next; the old one (Izzah's) is still there.
    const stored = keysOf(fake)[body.name];
    seen.push(!!stored && stored.next === sha256(LINK_RE.exec(body.link)[1]) && stored.hash === (body.name === "Izzah" ? oldHash : ""));
    return { ok: true };
  };
  fake.world.mailLinks();
  assert.deepEqual(seen, [true, true]);
  assert.equal(fake.deskPosts.length, 2);
  for (const [i, name] of ["Mo", "Izzah"].entries()) {
    const p = fake.deskPosts[i];
    assert.equal(p.url, DESK);
    assert.deepEqual(Object.keys(p.body).sort(), ["action", "app", "link", "name"]);
    assert.equal(p.body.action, "link");
    assert.equal(p.body.app, "chi");
    assert.equal(p.body.name, name);
    assert.match(p.body.link, LINK_RE);
    const env = await fake({ key: linkKey(p), action: "load", args: {} });
    assert.equal(env.ok, true);
    assert.equal(env.data.personal, true);
    assert.equal(env.data.me, name);
  }
  assert.notEqual(linkKey(fake.deskPosts[0]), linkKey(fake.deskPosts[1]));
  assert.equal((await fake({ key: old, action: "load", args: {} })).error, "bad_key", "the old link is replaced");
  assert.deepEqual(fake.logged, ["Sent to Mo.", "Sent to Izzah.", "Sent 2 of 2 links.", "The old shared link still works until you run retireSharedLink."]);
  assertNoKeyOrLink(fake);
});

test("a refused hand-over puts the previous link back exactly (or removes the new one) and logs the desk's word, never a key", async () => {
  const fake = world();
  const old = fake.personKey("Izzah");
  const before = keysOf(fake).Izzah;
  fake.desk = (url, body) => (body.name === "Izzah" ? { ok: false, error: "too soon" } : { ok: false, error: "not listed" });
  fake.world.mailLinks();
  assert.deepEqual(keysOf(fake).Izzah, before, "Izzah's previous entry is back");
  assert.equal(Object.prototype.hasOwnProperty.call(keysOf(fake), "Mo"), false, "Mo had none: the new one is removed");
  assert.equal((await fake({ key: old, action: "load", args: {} })).data.me, "Izzah", "the old link still works");
  for (const p of fake.deskPosts) assert.equal((await fake({ key: linkKey(p), action: "load", args: {} })).error, "bad_key", "the new one does not");
  assert.deepEqual(fake.logged, ["Not sent to Mo: not listed.", "Not sent to Izzah: too soon.", "Sent 0 of 2 links.", "The old shared link still works until you run retireSharedLink."]);
  assertNoKeyOrLink(fake);
});

test("no usable answer (unreachable, not JSON, a thrown error, an odd word, an error word holding the link) is 'no answer' and is undone", () => {
  const answers = [() => null, () => { throw new Error("DNS error for " + DESK); }, () => "ok", () => ({ ok: "true" }), () => ({}),
    (u, b) => ({ ok: false, error: "bad link " + b.link }), () => ({ ok: false, error: "Too Soon" }), () => ({ ok: false, error: { word: "x" } }),
    (u, b) => ({ ok: false, error: "x".repeat(60) })];
  for (const answer of answers) {
    const fake = world();
    fake.desk = answer;
    fake.world.mailLinkForPerson2();
    assert.equal(fake.props.PERSON_KEYS === undefined || !Object.prototype.hasOwnProperty.call(keysOf(fake), "Izzah"), true, String(answer));
    assert.deepEqual(fake.logged, ["Not sent to Izzah: no answer."], String(answer));
    assertNoKeyOrLink(fake);
    assert.equal(fake.logged.join("").includes("made-up-desk"), false, "the desk's address is never logged");
  }
});

test("mailLinkForPersonN: only that person; beyond the trip's people it says so and posts nothing", async () => {
  const fake = world();
  fake.world.mailLinkForPerson1();
  assert.deepEqual(fake.deskPosts.map((p) => p.body.name), ["Mo"]);
  assert.deepEqual(fake.logged, ["Sent to Mo."]);
  assert.deepEqual(Object.keys(keysOf(fake)), ["Mo"]);
  fake.logged.length = 0;
  fake.world.mailLinkForPerson6();
  assert.deepEqual(fake.logged, ["There is no person 6 on this trip."]);
  assert.equal(fake.deskPosts.length, 1);
  for (const n of [1, 2, 3, 4, 5, 6]) assert.equal(typeof fake.world["mailLinkForPerson" + n], "function");
});

test("guards: DESK_URL missing or not a script.google.com web app address, SITE_URL missing or not ending in /: nothing changes, nothing is posted", () => {
  const bads = [
    { SITE_URL: SITE }, { DESK_URL: "", SITE_URL: SITE }, { DESK_URL: "http://script.google.com/macros/s/x/exec", SITE_URL: SITE },
    { DESK_URL: "https://evil.example.test/macros/s/x/exec", SITE_URL: SITE }, { DESK_URL: DESK + "?x=1", SITE_URL: SITE },
    { DESK_URL: "https://script.google.com/macros/s/x/dev", SITE_URL: SITE }, { DESK_URL: "https://script.google.com.evil.test/macros/s/x/exec", SITE_URL: SITE },
    { DESK_URL: DESK }, { DESK_URL: DESK, SITE_URL: "https://example.test/chi" }, { DESK_URL: DESK, SITE_URL: "http://example.test/chi/" },
    { DESK_URL: DESK, SITE_URL: SITE + "?x=1" }, { DESK_URL: DESK, SITE_URL: SITE + "#k=abc" },
  ];
  for (const props of bads) {
    const fake = createFakeBackend({ ...SEED });
    for (const [k, v] of Object.entries(props)) fake.props[k] = v;
    const before = JSON.stringify(fake.props);
    fake.world.mailLinks();
    fake.world.mailLinkForPerson2();
    assert.equal(fake.deskPosts.length, 0, JSON.stringify(props));
    assert.equal(JSON.stringify(fake.props), before, JSON.stringify(props));
    assert.equal(fake.logged.length, 2);
    assert.ok(fake.logged.every((l) => /^Not done: the Script Property (DESK_URL|SITE_URL) /.test(l) && / Nothing was changed\.$/.test(l)), fake.logged.join("\n"));
    assert.equal(fake.logged.join("").includes("evil"), false, "the address is not repeated");
  }
});

test("guards: an empty or unreadable People tab, or a broken PERSON_KEYS, changes nothing and posts nothing", () => {
  const empty = world();
  empty.tables.People.length = 0;
  const before = JSON.stringify(empty.props);
  empty.world.mailLinks();
  assert.deepEqual(empty.logged, ["Not done: the People tab lists nobody. Nothing was changed."]);
  assert.equal(JSON.stringify(empty.props), before);
  const unreadable = world();
  unreadable.world.peopleNames_ = () => { throw new Error("Missing tab: People"); };
  unreadable.world.mailLinks();
  unreadable.world.mailLinkForPerson1();
  assert.deepEqual(unreadable.logged, ["Not done: the People tab can’t be read. Nothing was changed.", "Not done: the People tab can’t be read. Nothing was changed."]);
  for (const raw of ["not json", "[]", "\"x\""]) {
    const broken = world();
    broken.props.PERSON_KEYS = raw;
    broken.world.mailLinks();
    broken.world.mailLinkForPerson1();
    assert.equal(broken.props.PERSON_KEYS, raw);
    assert.equal(broken.deskPosts.length, 0);
    assert.ok(broken.logged.every((l) => l.startsWith("PERSON_KEYS can’t be read")), broken.logged.join("\n"));
  }
  for (const w of [empty, unreadable]) assert.equal(w.deskPosts.length, 0);
});

test("a busy app: nothing is posted for that person and nothing changes", () => {
  const fake = world({ lockFails: () => true });
  fake.world.mailLinks();
  assert.equal(fake.deskPosts.length, 0);
  assert.equal(fake.props.PERSON_KEYS, undefined);
  assert.deepEqual(fake.logged, ["Not sent to Mo: the app is busy saving. Nothing changed for Mo.", "Not sent to Izzah: the app is busy saving. Nothing changed for Izzah.",
    "Sent 0 of 2 links.", "The old shared link still works until you run retireSharedLink."]);
});

test("after retireSharedLink there is no reminder about the shared link", () => {
  const fake = world();
  fake.personKey("Mo");
  fake.personKey("Izzah");
  fake.world.retireSharedLink();
  fake.logged.length = 0;
  fake.world.mailLinks();
  assert.deepEqual(fake.logged, ["Sent to Mo.", "Sent to Izzah.", "Sent 2 of 2 links."]);
});

test("a name that can't hold a link is skipped and said; the others still go", () => {
  const fake = world();
  fake.tables.People.push({ ...fake.tables.People[1], name: "__proto__", order: 3 });
  fake.world.mailLinks();
  assert.deepEqual(fake.deskPosts.map((p) => p.body.name), ["Mo", "Izzah"]);
  assert.ok(fake.logged.includes("__proto__: no link made: that name can’t be used. Change it in the People tab."), fake.logged.join("\n"));
  assert.ok(fake.logged.includes("Sent 2 of 2 links."));
});

test("Env.js postJson_: one POST of the JSON body, redirects followed, its JSON answer; null for anything else", () => {
  const calls = [];
  const make = (fetch) => {
    const ctx = vm.createContext({ UrlFetchApp: { fetch: (url, opts) => { calls.push([url, opts]); return fetch(); } } });
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "backend", "Env.js"), "utf8"), ctx);
    return ctx;
  };
  const reply = (code, text) => () => ({ getResponseCode: () => code, getContentText: () => text });
  const ok = make(reply(200, '{"ok":true}'));
  assert.deepEqual(JSON.parse(JSON.stringify(ok.postJson_(DESK, { action: "link", app: "chi", name: "Izzah", link: "L" }))), { ok: true });
  assert.equal(calls[0][0], DESK);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0][1])), { method: "post", contentType: "application/json", payload: JSON.stringify({ action: "link", app: "chi", name: "Izzah", link: "L" }),
    muteHttpExceptions: true, followRedirects: true });
  assert.equal(make(reply(500, '{"ok":true}')).postJson_(DESK, {}), null);
  assert.equal(make(reply(200, "<html>Sorry</html>")).postJson_(DESK, {}), null);
  assert.equal(make(() => { throw new Error("Address unavailable"); }).postJson_(DESK, {}), null);
});

// ---- the hand-over (review fix, 2026-11-19) ----
// The new key's hash waits beside the old one as `next` while the desk works:
// the old link keeps working, so an open phone that asks during the desk call
// is not refused (a refusal clears the trip off it). On the desk's ok `next`
// takes the old one's place; on anything else `next` is dropped and the old
// link is untouched. A newLinkFor or cancelLinkFor during the call wins.
const P = require("../backend/Pure.js");
const hex = (c) => c.repeat(64);

test("personKeysFrom keeps a well-formed next beside the hash, or alone (hash \"\"); drops a malformed next", () => {
  const h = hex("a");
  const n = hex("b");
  assert.deepEqual(P.personKeysFrom(JSON.stringify({ Mo: { hash: h, at: "2026-11-18T00:00:00Z", next: n } })), { Mo: { hash: h, at: "2026-11-18T00:00:00Z", next: n } });
  assert.deepEqual(P.personKeysFrom(JSON.stringify({ Mo: { hash: "", at: "", next: n } })), { Mo: { hash: "", at: "", next: n } });
  assert.deepEqual(P.personKeysFrom(JSON.stringify({ Mo: { next: n } })), { Mo: { hash: "", at: "", next: n } });
  assert.deepEqual(P.personKeysFrom(JSON.stringify({ Mo: { hash: h, at: "x", next: "short" } })), { Mo: { hash: h, at: "x" } }, "a malformed next is left out");
  assert.deepEqual(P.personKeysFrom(JSON.stringify({ Mo: { hash: "", next: "short" }, Sam: { next: 5 } })), {}, "neither usable: no entry");
});

test("keyHolder: a person's next opens the trip as them, as their hash does; an empty hash never matches", () => {
  const people = { Mo: { hash: sha256("mo-old"), at: "", next: sha256("mo-new") }, Izzah: { hash: "", at: "", next: sha256("iz-new") } };
  const who = (k) => P.keyHolder(k, sha256(k), "", people, "");
  assert.deepEqual(who("mo-old"), { kind: "person", name: "Mo" });
  assert.deepEqual(who("mo-new"), { kind: "person", name: "Mo" });
  assert.deepEqual(who("iz-new"), { kind: "person", name: "Izzah" });
  assert.equal(who("other"), null);
  assert.equal(P.keyHolder("", sha256(""), "", { X: { hash: "", next: sha256("") } }, ""), null);
});

test("during the desk call the old link answers ok (a phone asking then is not cleared), and the new link already opens the trip as that person", async () => {
  for (const answer of [{ ok: true }, { ok: false, error: "unreachable" }, null]) {
    const fake = world();
    const old = fake.personKey("Izzah");
    let during = null;
    let fresh = null;
    fake.desk = (url, body) => {
      during = fake({ key: old, action: "load", args: {} });
      fresh = fake({ key: LINK_RE.exec(body.link)[1], action: "load", args: {} });
      return answer;
    };
    fake.world.mailLinkForPerson2();
    const d = await during;
    assert.equal(d.ok, true, JSON.stringify(answer) + ": old key during the call");
    assert.equal(d.data.me, "Izzah");
    const f = await fresh;
    assert.equal(f.ok, true, "the desk's check of the new link");
    assert.equal(f.data.personal, true);
    assert.equal(f.data.me, "Izzah");
    assertNoKeyOrLink(fake);
  }
});

test("refused: the old link still works, the new one never does; ok: the new one works, the old one does not", async () => {
  const no = world();
  const oldNo = no.personKey("Izzah");
  const before = keysOf(no).Izzah;
  no.desk = () => ({ ok: false, error: "too soon" });
  no.world.mailLinkForPerson2();
  assert.deepEqual(keysOf(no).Izzah, before, "exactly the previous entry, no next left behind");
  assert.equal((await no({ key: oldNo, action: "load", args: {} })).data.me, "Izzah");
  assert.equal((await no({ key: linkKey(no.deskPosts[0]), action: "load", args: {} })).error, "bad_key");
  assert.deepEqual(no.logged, ["Not sent to Izzah: too soon."]);

  const yes = world();
  const oldYes = yes.personKey("Izzah");
  yes.world.mailLinkForPerson2();
  const entry = keysOf(yes).Izzah;
  assert.deepEqual(Object.keys(entry).sort(), ["at", "hash"], "promoted: no next left");
  assert.equal(entry.hash, sha256(linkKey(yes.deskPosts[0])));
  assert.equal((await yes({ key: linkKey(yes.deskPosts[0]), action: "load", args: {} })).data.me, "Izzah");
  assert.equal((await yes({ key: oldYes, action: "load", args: {} })).error, "bad_key");
  assert.deepEqual(yes.logged, ["Sent to Izzah."]);
});

test("cancelLinkFor during the desk call wins over a later ok, and the log says the mailed link does not work", async () => {
  const fake = world();
  const old = fake.personKey("Izzah");
  fake.desk = () => {
    fake.world.cancelLinkForPerson2();
    return { ok: true };
  };
  fake.world.mailLinkForPerson2();
  assert.equal(Object.prototype.hasOwnProperty.call(keysOf(fake), "Izzah"), false, "still cancelled");
  assert.equal((await fake({ key: old, action: "load", args: {} })).error, "bad_key");
  assert.equal((await fake({ key: linkKey(fake.deskPosts[0]), action: "load", args: {} })).error, "bad_key");
  assert.deepEqual(fake.logged, ["Izzah: link cancelled.", "Sent to Izzah, but Izzah’s link was replaced or cancelled during this run, so the link just mailed does not work."]);
  assertNoKeyOrLink(fake);
});

test("newLinkFor during the desk call wins, whatever the desk answers", async () => {
  for (const answer of [{ ok: true }, { ok: false, error: "quota" }]) {
    const fake = world();
    const old = fake.personKey("Izzah");
    let newer = null;
    fake.desk = () => {
      fake.world.newLinkForPerson2();
      newer = keysOf(fake).Izzah;
      return answer;
    };
    fake.world.mailLinkForPerson2();
    assert.deepEqual(keysOf(fake).Izzah, newer, JSON.stringify(answer));
    assert.equal(newer.next, undefined);
    assert.equal((await fake({ key: old, action: "load", args: {} })).error, "bad_key");
    assert.equal((await fake({ key: linkKey(fake.deskPosts[0]), action: "load", args: {} })).error, "bad_key");
  }
});

test("a second mailing run while one is going is refused (the owner's own lock): no second key, no second POST", async () => {
  const fake = world();
  const old = fake.personKey("Izzah");
  let depth = 0; // a nested run that does post must not recurse for ever
  fake.desk = () => {
    if (depth++ === 0) {
      fake.world.mailLinkForPerson2();
      fake.world.mailLinks();
    }
    return { ok: false, error: "quota" };
  };
  fake.world.mailLinkForPerson2();
  assert.equal(fake.deskPosts.length, 1);
  assert.deepEqual(fake.logged, ["Not done: another mailLinks run is still going. Nothing was changed.", "Not done: another mailLinks run is still going. Nothing was changed.", "Not sent to Izzah: quota."]);
  assert.equal((await fake({ key: old, action: "load", args: {} })).data.me, "Izzah");
  // The lock is let go afterwards, also when the run throws.
  fake.desk = () => ({ ok: true });
  fake.world.mailLinkForPerson2();
  assert.equal(fake.deskPosts.length, 2);
});

test("two interleaved hand-overs (A stores, B stores, A undoes, B undoes) cannot bring back a key that was never delivered", async () => {
  for (const aDelivered of [false, true]) {
    const fake = world();
    const p = fake.personKey("Izzah");
    const w = fake.world;
    const hA = sha256("key-A");
    const hB = sha256("key-B");
    assert.equal(w.handOverStart_("Izzah", hA), "done");
    assert.equal(w.handOverStart_("Izzah", hB), "done");
    assert.equal(w.handOverEnd_("Izzah", hA, aDelivered), "superseded");
    assert.equal(w.handOverEnd_("Izzah", hB, false), "done");
    assert.deepEqual(Object.keys(keysOf(fake).Izzah).sort(), ["at", "hash"]);
    assert.equal(keysOf(fake).Izzah.hash, sha256(p), "the working link P is still the one");
    for (const k of ["key-A", "key-B"]) assert.equal((await fake({ key: k, action: "load", args: {} })).error, "bad_key", k);
    assert.equal((await fake({ key: p, action: "load", args: {} })).data.me, "Izzah");
  }
});

test("time budget: no new person is begun after about 4 minutes; the log says who is left and what to run", () => {
  const fake = world({ people: [{ name: "Sam", initials: "SA" }, { name: "Lee", initials: "LE" }] });
  let ms = 1000000;
  fake.world.clockMs_ = () => ms;
  fake.desk = () => {
    ms += 150 * 1000; // each hand-over takes two and a half minutes
    return { ok: true };
  };
  fake.world.mailLinks();
  assert.deepEqual(fake.deskPosts.map((p) => p.body.name), ["Mo", "Izzah"]);
  assert.deepEqual(fake.logged, ["Sent to Mo.", "Sent to Izzah.",
    "Stopped before the time limit. Not tried: Sam, Lee. Run mailLinkForPerson3 and mailLinkForPerson4 for the rest.",
    "Sent 2 of 2 links.", "The old shared link still works until you run retireSharedLink."]);
  assert.equal(Object.prototype.hasOwnProperty.call(keysOf(fake), "Sam"), false);
});

test("time budget: under 4 minutes everyone is tried", () => {
  const fake = world({ people: [{ name: "Sam", initials: "SA" }] });
  let ms = 0;
  fake.world.clockMs_ = () => ms;
  fake.desk = () => {
    ms += 70 * 1000;
    return { ok: true };
  };
  fake.world.mailLinks();
  assert.deepEqual(fake.deskPosts.map((p) => p.body.name), ["Mo", "Izzah", "Sam"]);
  assert.equal(fake.logged.some((l) => l.startsWith("Stopped")), false);
});

test("busy at the end (three tries): refused leaves the old link working (the unsent one too, until dropWaitingLinks); delivered leaves both working; both say so", async () => {
  let calls = 0;
  const no = world({ lockFails: () => { calls++; return calls >= 2 && calls <= 4; } });
  const oldNo = no.personKey("Izzah");
  no.desk = () => ({ ok: false, error: "quota" });
  no.world.mailLinkForPerson2();
  assert.equal((await no({ key: oldNo, action: "load", args: {} })).data.me, "Izzah", "the old link is never lost");
  assert.deepEqual(no.logged, ["Not sent to Izzah: quota. The app was busy, so the unsent link could not be withdrawn; Izzah’s old link still works. Run dropWaitingLinks later to withdraw it."]);
  assertNoKeyOrLink(no);

  let calls2 = 0;
  const yes = world({ lockFails: () => { calls2++; return calls2 >= 2 && calls2 <= 4; } });
  const oldYes = yes.personKey("Izzah");
  yes.world.mailLinkForPerson2();
  assert.equal((await yes({ key: oldYes, action: "load", args: {} })).data.me, "Izzah");
  assert.equal((await yes({ key: linkKey(yes.deskPosts[0]), action: "load", args: {} })).data.me, "Izzah");
  assert.deepEqual(yes.logged, ["Sent to Izzah. The app was busy, so Izzah’s old link was not turned off and both work. To turn the old one off, run mailLinkForPerson2 again (Izzah gets another mail)."]);
  assertNoKeyOrLink(yes);
});

test("linksStatus and retireSharedLink read a hand-over that did not finish; issueLinks keeps it", () => {
  const fake = world();
  fake.personKey("Mo");
  assert.equal(fake.world.handOverStart_("Mo", sha256("m2")), "done");
  assert.equal(fake.world.handOverStart_("Izzah", sha256("i2")), "done");
  fake.world.linksStatus();
  assert.match(fake.logged[0], /^1\. Mo: has a link \(issued \d{4}-\d\d-\d\d\), and a new one is waiting for the mail desk\. If no mailLinks run is going, one stopped half way: both links work until you run dropWaitingLinks \(which keeps the old one\) or mailLinkForPerson1\.$/);
  assert.equal(fake.logged[1], "2. Izzah: no link yet, but one is waiting for the mail desk. If no mailLinks run is going, one stopped half way: run dropWaitingLinks to withdraw it, or mailLinkForPerson2 again.");
  fake.logged.length = 0;
  fake.world.retireSharedLink();
  assert.deepEqual(fake.logged, ["Not retired: Izzah has no personal link yet. Run issueLinks first."]);
  fake.logged.length = 0;
  const before = keysOf(fake).Mo;
  fake.world.issueLinks();
  assert.deepEqual(keysOf(fake).Mo, before, "Mo's hand-over is kept");
  assert.equal(keysOf(fake).Izzah.next, undefined, "Izzah had no working link: issueLinks gives her one, and the waiting one is dropped");
  assert.equal(fake.logged.filter((l) => /’s link: /.test(l)).length, 1);
});

test("Env.js withOwnerRunLock_: the user lock (not the script lock phones use), tried briefly, always let go; busy when taken", () => {
  const make = (gets) => {
    const ctx = vm.createContext({ LockService: {
      getUserLock: () => { gets.push("user"); return { tryLock: (ms) => { gets.push("try " + ms); return gets.free; }, releaseLock: () => gets.push("release") }; },
      getScriptLock: () => { gets.push("script"); return { tryLock: () => true, releaseLock: () => {} }; },
    } });
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "backend", "Env.js"), "utf8"), ctx);
    return ctx;
  };
  const free = [];
  free.free = true;
  let ran = 0;
  assert.equal(make(free).withOwnerRunLock_(() => { ran++; }), true);
  assert.equal(ran, 1);
  assert.equal(free.includes("script"), false);
  assert.deepEqual([free[0], free[2]], ["user", "release"]);
  const thrown = [];
  thrown.free = true;
  assert.throws(() => make(thrown).withOwnerRunLock_(() => { throw new Error("x"); }));
  assert.equal(thrown[thrown.length - 1], "release");
  const taken = [];
  taken.free = false;
  assert.equal(make(taken).withOwnerRunLock_(() => { ran++; }), false);
  assert.equal(ran, 1);
  assert.equal(taken.includes("release"), false);
});

// ---- fix round 1 (second review, 2026-11-19) ----

test("a refusal whose word is \"ok\" is not a delivery: the old link still works, the new one never does, the log says Not sent", async () => {
  for (const answer of [{ ok: false, error: "ok" }, { ok: "ok", error: "ok" }, { error: "ok" }]) {
    const fake = world();
    const old = fake.personKey("Izzah");
    const before = keysOf(fake).Izzah;
    fake.desk = () => answer;
    fake.world.mailLinkForPerson2();
    assert.deepEqual(keysOf(fake).Izzah, before, JSON.stringify(answer));
    assert.equal((await fake({ key: old, action: "load", args: {} })).data.me, "Izzah");
    assert.equal((await fake({ key: linkKey(fake.deskPosts[0]), action: "load", args: {} })).error, "bad_key");
    assert.deepEqual(fake.logged, ["Not sent to Izzah: no answer."], JSON.stringify(answer));
  }
  assert.equal(world().world.deskWord_({ ok: false, error: "ok" }), "no answer", "deskWord_ never says ok for a refusal");
  assert.equal(world().world.deskWord_({ ok: true, error: "too soon" }), "ok");
});

test("one busy lock at the end is tried again: the hand-over still finishes", async () => {
  let calls = 0;
  const fake = world({ lockFails: () => ++calls === 2 });
  const old = fake.personKey("Izzah");
  fake.world.mailLinkForPerson2();
  assert.deepEqual(fake.logged, ["Sent to Izzah."]);
  assert.deepEqual(Object.keys(keysOf(fake).Izzah).sort(), ["at", "hash"]);
  assert.equal((await fake({ key: old, action: "load", args: {} })).error, "bad_key");
});

test("dropWaitingLinks: removes every waiting link without mail; working links are untouched; only names are logged", async () => {
  const fake = world({ people: [{ name: "Sam", initials: "SA" }] });
  const mo = fake.personKey("Mo");
  const sam = fake.personKey("Sam");
  assert.equal(fake.world.handOverStart_("Mo", sha256("m2")), "done");
  assert.equal(fake.world.handOverStart_("Izzah", sha256("i2")), "done");
  fake.world.dropWaitingLinks();
  assert.deepEqual(fake.logged, ["Withdrew the waiting link of Mo and Izzah. Working links are unchanged."]);
  assert.deepEqual(Object.keys(keysOf(fake)).sort(), ["Mo", "Sam"]);
  assert.deepEqual(Object.keys(keysOf(fake).Mo).sort(), ["at", "hash"]);
  for (const k of ["m2", "i2"]) assert.equal((await fake({ key: k, action: "load", args: {} })).error, "bad_key");
  assert.equal((await fake({ key: mo, action: "load", args: {} })).data.me, "Mo");
  assert.equal((await fake({ key: sam, action: "load", args: {} })).data.me, "Sam");
  assert.equal(fake.deskPosts.length, 0);
  fake.logged.length = 0;
  const before = fake.props.PERSON_KEYS;
  fake.world.dropWaitingLinks();
  assert.deepEqual(fake.logged, ["No link was waiting. Nothing was changed."]);
  assert.equal(fake.props.PERSON_KEYS, before);
  assertNoKeyOrLink(fake);
});

test("dropWaitingLinks: refused while a mailing run is going, when the app is busy, and when PERSON_KEYS is broken", () => {
  const during = world();
  during.desk = () => {
    during.world.dropWaitingLinks();
    return { ok: true };
  };
  during.world.mailLinkForPerson2();
  assert.deepEqual(during.logged, ["Not done: a mailLinks run is still going. Nothing was changed.", "Sent to Izzah."]);
  const busy = world({ lockFails: () => true });
  busy.world.dropWaitingLinks();
  assert.deepEqual(busy.logged, ["The app is busy saving. Run it again in a moment."]);
  const broken = world();
  broken.props.PERSON_KEYS = "{bad";
  broken.world.dropWaitingLinks();
  assert.equal(broken.props.PERSON_KEYS, "{bad");
  assert.ok(broken.logged.length === 1 && broken.logged[0].startsWith("PERSON_KEYS can’t be read"), broken.logged.join("\n"));
});

test("a PERSON_KEYS broken during the desk call is said as broken, not as a busy app", async () => {
  for (const answer of [{ ok: true }, { ok: false, error: "quota" }]) {
    const fake = world();
    fake.personKey("Izzah");
    fake.desk = () => {
      fake.props.PERSON_KEYS = "{bad";
      return answer;
    };
    fake.world.mailLinkForPerson2();
    assert.equal(fake.props.PERSON_KEYS, "{bad");
    assert.equal(fake.logged.some((l) => /busy/.test(l)), false, fake.logged.join("\n"));
    assert.equal(fake.logged.length, 2, fake.logged.join("\n"));
    assert.equal(fake.logged[0], answer.ok
      ? "Sent to Izzah, but PERSON_KEYS can’t be read, so Izzah’s old link was not turned off."
      : "Not sent to Izzah: quota. PERSON_KEYS can’t be read, so the unsent link could not be withdrawn: run dropWaitingLinks once it is mended.");
    assert.match(fake.logged[1], /^PERSON_KEYS can’t be read/);
    assertNoKeyOrLink(fake);
  }
  // Broken before a person is begun (by hand, between two people): the run stops there.
  const fake = world();
  fake.desk = () => {
    fake.props.PERSON_KEYS = "{bad";
    return { ok: false, error: "quota" };
  };
  fake.world.mailLinks();
  assert.deepEqual(fake.deskPosts.map((p) => p.body.name), ["Mo"]);
  assert.equal(fake.logged.some((l) => /busy/.test(l)), false, fake.logged.join("\n"));
  assert.ok(fake.logged.includes("Not sent to Izzah: PERSON_KEYS can’t be read. Stopped here."), fake.logged.join("\n"));
});

test("the time-budget line names only functions that exist (six); beyond that it says to add one", () => {
  const more = ["P3", "P4", "P5", "P6", "P7", "P8"].map((name) => ({ name, initials: name }));
  const fake = world({ people: more });
  let ms = 0;
  fake.world.clockMs_ = () => ms;
  fake.desk = () => {
    ms += 250 * 1000;
    return { ok: true };
  };
  fake.world.mailLinks();
  assert.deepEqual(fake.deskPosts.map((p) => p.body.name), ["Mo"]);
  const line = fake.logged.find((l) => l.startsWith("Stopped"));
  assert.equal(line, "Stopped before the time limit. Not tried: Izzah, P3, P4, P5, P6, P7, P8. Run mailLinkForPerson2, mailLinkForPerson3, mailLinkForPerson4, mailLinkForPerson5 and mailLinkForPerson6 for the rest. P7 and P8 come after the sixth person, and there is no mailLinkForPerson function for them: add one in Setup.js.");
  assert.equal(/mailLinkForPerson[7-9]/.test(fake.logged.join("\n")), false);
});

test("a name listed twice in the People tab is mailed once", () => {
  const fake = world({ people: [{ name: "Izzah", initials: "IZ" }] });
  fake.world.mailLinks();
  assert.deepEqual(fake.deskPosts.map((p) => p.body.name), ["Mo", "Izzah"]);
  assert.ok(fake.logged.includes("Izzah: listed twice in the People tab; mailed once."), fake.logged.join("\n"));
  assert.ok(fake.logged.includes("Sent 2 of 2 links."), fake.logged.join("\n"));
});
