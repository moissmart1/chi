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

test("mailLinks: for each person a new key, its hash stored before one POST of exactly the four fields; then that key opens the trip as them", async () => {
  const fake = world();
  const old = fake.personKey("Izzah");
  const seen = [];
  fake.desk = (url, body) => {
    // At the moment of the POST the new key's hash is already stored.
    const stored = keysOf(fake)[body.name];
    seen.push(stored && stored.hash === sha256(LINK_RE.exec(body.link)[1]));
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

test("busy when putting the old link back: says the old link no longer works, still no key", async () => {
  let calls = 0;
  // The first lock (storing the new hash) is had; the second (putting the old back) is not.
  const fake = world({ lockFails: () => calls++ === 1 });
  const old = fake.personKey("Izzah");
  fake.desk = () => ({ ok: false, error: "quota" });
  fake.world.mailLinkForPerson2();
  assert.deepEqual(fake.logged, ["Not sent to Izzah: quota. The old link could not be put back (the app was busy), so it no longer works: run mailLinkForPerson2 again later."]);
  assert.equal((await fake({ key: old, action: "load", args: {} })).error, "bad_key");
  assertNoKeyOrLink(fake);
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
