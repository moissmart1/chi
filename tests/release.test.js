// The release rules (scripts/release-lib.mjs, scripts/scan.mjs): what may be
// pushed, when a version number is owed, what counts as private, and that the
// backend stamp matches the backend files.
import test from "node:test";
import assert from "node:assert/strict";
import { backendFiles, backendHash, config, judgePush, needsBump, stampIn, writtenBackendStamp } from "../scripts/release-lib.mjs";
import { findings } from "../scripts/scan.mjs";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { askUntil, migrateUntilCurrent, checkKey, ownerKey, tripLoaded, withoutKeys } from "../scripts/release-lib.mjs";

test("I4: the live load is asked again for about 30 seconds; ship never advises rolling the backend back", async () => {
  const waits = [];
  const answers = [{ ok: false, error: "bad_key" }, null, { ok: true, data: { days: [1], stops: [] } }];
  let n = 0;
  const r = await askUntil(async () => answers[n++], tripLoaded, { sleep: async (ms) => waits.push(ms) });
  assert.equal(tripLoaded(r), true);
  assert.deepEqual(waits, [5000, 5000], "asked three times, five seconds apart");
  let m = 0;
  const never = await askUntil(async () => { m++; return { ok: false }; }, tripLoaded, { sleep: async (ms) => waits.push(ms) });
  assert.equal(m, 7, "seven tries, about 30 seconds of waiting");
  assert.equal(tripLoaded(never), false);
  const ship = readFileSync(join(ROOT, "scripts", "ship.mjs"), "utf8");
  assert.equal(/roll back the backend first|go back to if this goes wrong/.test(ship), false);
  assert.match(ship, /never roll the\s*\n?\/\/ backend back|never roll back past/);
  assert.match(ship, /askUntil\(\(\) => call\(cfg\.apiUrl, KEY, "load"\), tripLoaded\)/);
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");
  assert.match(readme, /never roll the backend back/i);
});


const ok = { unit: { pass: 10, fail: 0 }, e2e: { pass: 5, fail: 0 } };
const push = (over) => judgePush({ remoteRef: "refs/heads/main", localSha: "a".repeat(40), receipt: ok, commitStamp: "abc", live: "abc", ...over });

test("backend/Stamp.js matches the backend files (run npm run stamp)", () => {
  assert.equal(writtenBackendStamp(), backendHash());
  assert.ok(!backendFiles().includes("Stamp.js"));
  assert.ok(backendFiles().includes("appsscript.json"));
});

test("a push goes out only as main, with a receipt, behind its own backend", () => {
  assert.equal(push({}), null);
  assert.match(push({ remoteRef: "refs/original/refs/heads/main" }), /refs\/original/);
  assert.match(push({ remoteRef: "refs/heads/ticks-build" }), /Only main/);
  assert.match(push({ localSha: "0".repeat(40) }), /never deleted/);
  assert.match(push({ receipt: null }), /npm run gate/);
  assert.match(push({ receipt: { unit: { pass: 9, fail: 1 }, e2e: { pass: 5, fail: 0 } } }), /failing tests/);
  assert.match(push({ receipt: { unit: { pass: 9, fail: 0 }, e2e: { pass: 5, fail: 2 } } }), /failing tests/);
  assert.match(push({ live: "old" }), /backend goes first/);
  assert.match(push({ live: "" }), /backend goes first/);
  // A commit from before the stamp existed has nothing to compare.
  assert.equal(push({ commitStamp: "", live: "" }), null);
});

test("a change to what the phones run owes a new version number", () => {
  const shell = ["./", "index.html", "js/app.js", "css/base.css"];
  assert.equal(needsBump(["js/app.js"], shell), true);
  assert.equal(needsBump(["index.html"], shell), true);
  assert.equal(needsBump(["sw.js"], shell), true);
  assert.equal(needsBump(["backend/Actions.js", "tests/store.test.js", "README.md", "scripts/ship.mjs"], shell), false);
  assert.equal(needsBump([], shell), false);
});

test("config and the stamp line are read as written", () => {
  const id = "AKfy" + "TESTtest_test-testTEST123"; // in two pieces: the scan refuses a whole one
  const c = config('export const API_URL = "https://script.google.com/macros/s/' + id + '/exec";\nexport const APP_VERSION = "23";\n');
  assert.equal(c.deployId, id);
  assert.equal(c.appVersion, "23");
  assert.equal(stampIn('// note\nvar BACKEND_STAMP = "0123456789";\n'), "0123456789");
  assert.equal(stampIn(""), "");
});

test("the scan finds what must not be public and leaves examples alone", () => {
  const rules = (text, opts) => findings(text, opts).map((f) => f.rule);
  assert.deepEqual(rules("mail mo@example.com, t@example.test, x@sub.example.org"), []);
  assert.deepEqual(rules('"playwright-core@1.48.0" and icon@2x.png and @google/clasp'), []);
  assert.equal(rules("write to someone" + "@" + "gmail.com").length, 1);
  const real = "AKfy" + "c".repeat(40);
  assert.deepEqual(rules("url " + real, { deployId: real }), []);
  assert.equal(rules("url " + real, { deployId: "AKfy" + "d".repeat(40) }).length, 1);
  assert.equal(rules("sheet 1" + "Ab_-9".repeat(8) + "xyz").length, 1);
  assert.equal(rules("a 0f1e2d3c4b5a69788796a5b4c3d2e1f0 hash").length, 0);
  assert.equal(rules("We stay at the Grand Snow Lodge", { words: ["grand snow lodge"] }).length, 1);
  assert.equal(findings("one\ntwo Secret Place\n", { words: ["secret place"] })[0].line, 2);
  // A finding never carries the text it matched.
  assert.deepEqual(Object.keys(findings("x " + "y@" + "real.org")[0]).sort(), ["line", "rule"]);
});

// ---- security (2026-11-18): a key never in an address, never in a log ----

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const filesIn = (dir, re) => readdirSync(join(ROOT, dir), { recursive: true }).filter((f) => re.test(f)).map((f) => join(dir, f));

// Lines that put a key in a query string: "?k=" / "&k=", or a k parameter set on a URL.
function keyInQuery(text) {
  const out = [];
  text.split("\n").forEach((line, i) => {
    if (/[?&]k=/.test(line) || /searchParams\.(set|append)\(\s*["']k["']/.test(line) || /URLSearchParams\(\s*\{[^}]*\bk\s*:/.test(line)) out.push(i + 1);
  });
  return out;
}

test("no script or click-through test builds an address with a key in its query string", () => {
  assert.deepEqual(keyInQuery('page.goto(SITE + "?k=" + key)'), [1], "the check catches one");
  assert.deepEqual(keyInQuery('u.searchParams.set("k", key)'), [1]);
  assert.deepEqual(keyInQuery('page.goto(SITE + "#k=" + key)'), [], "a fragment is fine");
  const bad = [];
  for (const f of [...filesIn("scripts", /\.(mjs|cjs|js)$/), ...filesIn("tests/e2e", /\.(cjs|js)$/)]) {
    for (const line of keyInQuery(readFileSync(join(ROOT, f), "utf8"))) bad.push(f + ":" + line);
  }
  assert.deepEqual(bad, []);
});

// Backend log calls (Logger.log, console.*) whose arguments name a key or a
// token, outside the owner's link functions (backend/Setup.js, item 8).
// Only the functions that do log a key, once (cancelLinkFor_, linksStatus and
// retireSharedLink never do, so they are not exempt).
const OWNER_FUNCTIONS = ["issueLinks", "newLinkFor_", "showInvite", "logLink_"];
function keyLogs(src) {
  const out = [];
  const heads = [...src.matchAll(/^function (\w+)\s*\(/gm)].map((m) => ({ name: m[1], at: m.index }));
  for (const m of src.matchAll(/\b(Logger\.log|console\.(?:log|error|warn|info))\s*\(/g)) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")") depth--;
    }
    const args = src.slice(start, i - 1).replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');
    const fn = heads.filter((h) => h.at < m.index).pop();
    const name = fn ? fn.name : "(top)";
    if (/key|token|secret|TRIP_KEY|CLAUDE_TOKEN/i.test(args) && !OWNER_FUNCTIONS.includes(name)) out.push(name + ": " + m[1] + "(" + args.trim() + ")");
  }
  return out;
}

test("no backend file passes a key or token to Logger.log or console.*, outside the owner's link functions", () => {
  assert.equal(keyLogs('function f() {\n  Logger.log("Trip key: " + tripKey_());\n}').length, 1, "the check catches one");
  assert.equal(keyLogs('function g() {\n  console.error("x " + token);\n}').length, 1);
  assert.equal(keyLogs('function issueLinks() {\n  Logger.log(name + key);\n}').length, 0, "allowed in an owner function");
  assert.equal(keyLogs('function h() {\n  Logger.log("the key words in a sentence");\n}').length, 0, "words in a sentence are not a key");
  const bad = [];
  for (const f of readdirSync(join(ROOT, "backend")).filter((f) => f.endsWith(".js"))) {
    for (const hit of keyLogs(readFileSync(join(ROOT, "backend", f), "utf8"))) bad.push(f + " " + hit);
  }
  assert.deepEqual(bad, []);
});

test("the release checks use the check key, the old shared key only without one, and never print either", () => {
  const SHARED_NAME = "CHI_" + "KEY";
  const S = "shared-" + "x".repeat(10), C = "check-" + "y".repeat(10), O = "owner-" + "z".repeat(10);
  assert.equal(checkKey({ CHI_CHECK_KEY: C, [SHARED_NAME]: S }), C);
  assert.equal(checkKey({ [SHARED_NAME]: S }), S);
  assert.equal(checkKey({}), "");
  assert.equal(ownerKey({ CHI_OWNER_KEY: O, [SHARED_NAME]: S, CHI_CHECK_KEY: C }), O);
  assert.equal(ownerKey({ CHI_CHECK_KEY: C }), "", "never the check key: its load hides the addresses");
  const env = { CHI_CHECK_KEY: C, [SHARED_NAME]: S };
  assert.equal(withoutKeys("goto https://x/#k=" + C + " and " + encodeURIComponent(S), env), "goto https://x/#k=(key) and (key)");
  const ship = readFileSync(join(ROOT, "scripts", "ship.mjs"), "utf8");
  assert.equal(ship.split("env." + SHARED_NAME).length - 1, 0, "ship reads its key only through checkKey");
  assert.match(ship, /const KEY = checkKey\(env\)/);
  assert.match(ship, /"#k=" \+ encodeURIComponent\(KEY\)/);
});

// ---------- the permission gate (review of the planner port, 2026-11-20, C1) ----------
// A backend that asks Google for more than the last release goes to the
// script's head only until Mo has approved it; the live deployment and the
// site are left alone. clasp is stubbed: every call is recorded, none is run.
import { backendPath, headOnlySteps, manifestAsks, manifestGains, shipBackend } from "../scripts/release-lib.mjs";

const OLD = JSON.stringify({ timeZone: "America/Chicago", oauthScopes: ["https://www.googleapis.com/auth/spreadsheets.currentonly", "https://www.googleapis.com/auth/script.external_request"] });
const NEW = readFileSync(join(ROOT, "backend", "appsscript.json"), "utf8");
const fakeClasp = (fails = {}) => {
  const calls = [];
  const clasp = (args) => {
    calls.push(args.join(" "));
    return fails[args[0]] ? { status: 1, stdout: "", stderr: "made-up clasp failure" } : { status: 0, stdout: "", stderr: "" };
  };
  return { calls, clasp };
};

test("C1: manifestGains names each scope and advanced service the next manifest adds, and nothing else", () => {
  assert.deepEqual(manifestGains(OLD, NEW), ["the permission https://www.googleapis.com/auth/spreadsheets", "the advanced service sheets v4"]);
  assert.deepEqual(manifestGains(NEW, NEW), [], "the same manifest gains nothing");
  // Order and other fields do not matter; a scope dropped is not a gain.
  const shuffled = JSON.stringify({ ...JSON.parse(NEW), timeZone: "UTC", oauthScopes: [...JSON.parse(NEW).oauthScopes].reverse() });
  assert.deepEqual(manifestGains(NEW, shuffled), []);
  // Going back to the old manifest drops a scope (not a gain) but also takes the service list out, which counts (R1-M2, below).
  assert.deepEqual(manifestGains(NEW, OLD), ["whatever Apps Script works out without the advanced service list (it was removed from the manifest)"]);
  assert.deepEqual(manifestGains(NEW, JSON.stringify({ ...JSON.parse(NEW), oauthScopes: JSON.parse(OLD).oauthScopes })), [], "a scope dropped, the list kept: no gain");
  // A new version of a service is a gain; no released manifest means everything is new.
  const v5 = JSON.stringify({ ...JSON.parse(NEW), dependencies: { enabledAdvancedServices: [{ userSymbol: "Sheets", version: "v5", serviceId: "sheets" }] } });
  assert.deepEqual(manifestGains(NEW, v5), ["the advanced service sheets v5"]);
  assert.equal(manifestGains(null, OLD).length, 2);
  assert.equal(manifestGains("not json", OLD).length, 2, "an unreadable released manifest counts as asking for nothing");
  assert.throws(() => manifestGains(OLD, "{ broken"), /can't be read/);
  assert.equal(manifestAsks("[]"), null);
});

test("C1: a backend with new permissions goes to the head only, unless --scopes-approved", () => {
  const gains = manifestGains(OLD, NEW);
  assert.equal(backendPath(gains, false), "head");
  assert.equal(backendPath(gains, true), "deploy");
  assert.equal(backendPath([], false), "deploy", "nothing new: deployed as always");

  const head = fakeClasp();
  assert.deepEqual(shipBackend({ path: "head", check: false, clasp: head.clasp, deployId: "dep", label: "v6 abc" }), { ok: true, did: "head" });
  assert.deepEqual(head.calls, ["push -f"], "pushed to the head; the live deployment is never touched");

  const go = fakeClasp();
  assert.deepEqual(shipBackend({ path: "deploy", check: false, clasp: go.clasp, deployId: "dep", label: "v6 abc" }), { ok: true, did: "deployed" });
  assert.deepEqual(go.calls, ["push -f", "create-deployment -i dep -d v6 abc"]);

  const bad = fakeClasp({ push: true });
  const r = shipBackend({ path: "deploy", check: false, clasp: bad.clasp, deployId: "dep", label: "x" });
  assert.deepEqual([r.ok, r.did, r.why], [false, "none", "clasp push failed."]);
  assert.deepEqual(bad.calls, ["push -f"], "no deployment after a failed push");
});

test("C1: --check says which path it would take and runs nothing", () => {
  const c = fakeClasp();
  assert.deepEqual(shipBackend({ path: "head", check: true, clasp: c.clasp, deployId: "dep", label: "x" }), { ok: true, did: "would-head" });
  assert.deepEqual(shipBackend({ path: "deploy", check: true, clasp: c.clasp, deployId: "dep", label: "x" }), { ok: true, did: "would-deploy" });
  assert.deepEqual(c.calls, []);
  const ship = readFileSync(join(ROOT, "scripts", "ship.mjs"), "utf8");
  assert.match(ship, /out\.did === "would-head"[\s\S]{0,400}head only and stop there/);
});

test("C1: after a push to the head ship stops with an error and the owner's next steps; it reads the released manifest from origin/main", () => {
  const steps = headOnlySteps(manifestGains(OLD, NEW), ["--migrate", "--check"]).join("\n");
  assert.match(steps, /auth\/spreadsheets/);
  assert.match(steps, /live deployment was not changed and the site was not published/);
  assert.match(steps, /checkPlanner/);
  assert.match(steps, /approve/);
  assert.match(steps, /npm run ship -- --migrate --scopes-approved$/m, "the command to run next keeps --migrate");
  assert.equal(headOnlySteps(["x"], ["--scopes-approved"]).join("\n").split("--scopes-approved").length - 1, 1);
  const ship = readFileSync(join(ROOT, "scripts", "ship.mjs"), "utf8");
  assert.match(ship, /git\(\["show", "origin\/main:backend\/appsscript\.json"\]\)/);
  assert.match(ship, /out\.did === "head"\) \{[\s\S]{0,200}stop\(headOnlySteps/, "a head-only push ends in stop(), which exits 1");
  // The deployment is made only through shipBackend, which a head-only path never reaches.
  assert.equal((ship.match(/create-deployment/g) || []).length, 0);
});

// ---------- re-check 1 (R1-M1, R1-M2) ----------
import { approvalNote } from "../scripts/release-lib.mjs";

test("R1-M2: taking oauthScopes or the advanced service list out of the manifest counts as a change", () => {
  const m = JSON.parse(NEW);
  const noScopes = JSON.stringify({ ...m, oauthScopes: undefined });
  assert.deepEqual(manifestGains(NEW, noScopes), ["the permissions Apps Script works out from the code (oauthScopes was removed from the manifest)"]);
  assert.equal(backendPath(manifestGains(NEW, noScopes), false), "head");
  const noServices = JSON.stringify({ ...m, dependencies: undefined });
  assert.deepEqual(manifestGains(NEW, noServices), ["whatever Apps Script works out without the advanced service list (it was removed from the manifest)"]);
  const neither = JSON.stringify({ timeZone: "America/Chicago" });
  assert.equal(manifestGains(NEW, neither).length, 2);
  // Never listed before and still not listed: nothing new. An empty list kept is not a removal.
  assert.deepEqual(manifestGains(neither, neither), []);
  assert.deepEqual(manifestGains(OLD, OLD), [], "the old manifest had no service list to take away");
  assert.deepEqual(manifestGains(NEW, JSON.stringify({ ...m, oauthScopes: m.oauthScopes.slice(0, 2) })), [], "fewer scopes, still listed: no change");
});

test("R1-M1: --scopes-approved with nothing new says so plainly and carries on; it is this run's only", () => {
  assert.match(approvalNote([], true), /^--scopes-approved was not needed: this backend asks Google for nothing new\. It counts for this run only/);
  assert.equal(approvalNote([], false), null);
  assert.equal(approvalNote(["the permission x"], true), null, "needed: no note");
  assert.equal(backendPath([], true), "deploy", "carries on as usual");
  // Per-run: the flag is read from this command line and nowhere else, and ship writes nothing a later run reads.
  const ship = readFileSync(join(ROOT, "scripts", "ship.mjs"), "utf8");
  assert.deepEqual(ship.match(/scopes-approved"\)/g), ['scopes-approved")'], "read once, from process.argv");
  assert.match(ship, /const scopesApproved = process\.argv\.includes\("--scopes-approved"\);/);
  assert.equal(/writeFileSync|appendFileSync|setItem|git\(\["config"/.test(ship), false, "ship stores nothing");
  const lib = readFileSync(join(ROOT, "scripts", "release-lib.mjs"), "utf8");
  assert.equal(/scopes-?[aA]pproved[^\n]*(writeFileSync|appendFileSync)/.test(lib), false);
  // A later run with a new permission and no flag goes to the head again.
  assert.equal(backendPath(manifestGains(OLD, NEW), false), "head");
  assert.match(ship, /if \(scopesApproved\) step\(approvalNote\(\[\], true\)\)/, "said too when the backend is already live");
  assert.match(ship, /const note = approvalNote\(gains, scopesApproved\);\s*\n\s*if \(note\) step\(note\);/);
});

test("migrate: an answer from the old backend is asked again; the new stamp's answer is trusted", async () => {
  const waits = [];
  const answers = [
    { ok: true, data: { added: [] } },
    { ok: true, data: { added: [], stamp: "old" } },
    { ok: false, error: "bad_input" },
    { ok: true, data: { added: ["Todos", "Expenses.planner_id"], stamp: "new" } },
  ];
  let n = 0;
  const r = await migrateUntilCurrent(async () => answers[n++], "new", { sleep: async (ms) => waits.push(ms) });
  assert.deepEqual(r, { ok: true, added: ["Todos", "Expenses.planner_id"], calls: 4 });
  assert.deepEqual(waits, [3000, 4500, 6750]);
});

test("migrate: never the new stamp stops with a message and no success", async () => {
  const waits = [];
  let n = 0;
  const r = await migrateUntilCurrent(async () => { n++; return { ok: true, data: { added: [], stamp: "old" } }; }, "new", { sleep: async (ms) => waits.push(ms) });
  assert.equal(r.ok, false);
  assert.match(r.why, /wrong backend/);
  assert.match(r.why, /old/);
  assert.equal(r.calls, n);
  assert.ok(waits.reduce((a, b) => a + b, 0) <= 120000, "bounded at about two minutes of waiting");
  assert.ok(waits.reduce((a, b) => a + b, 0) >= 90000);
  assert.equal(waits[0], 3000);
  assert.ok(Math.max(...waits) <= 15000);
  // A call that throws is an old/unreachable backend too, not a crash.
  const t = await migrateUntilCurrent(async () => { throw new Error("net"); }, "new", { sleep: async () => {}, budgetMs: 6000 });
  assert.equal(t.ok, false);
});

test("migrate: the new stamp the first time is trusted at once, with no wait", async () => {
  const waits = [];
  const r = await migrateUntilCurrent(async () => ({ ok: true, data: { added: [], stamp: "new" } }), "new", { sleep: async (ms) => waits.push(ms) });
  assert.deepEqual(r, { ok: true, added: [], calls: 1 });
  assert.deepEqual(waits, []);
});

test("ship settles migrate only through migrateUntilCurrent with the commit's stamp, and the backend's migrate answers its stamp", () => {
  const ship = readFileSync(join(ROOT, "scripts", "ship.mjs"), "utf8");
  assert.match(ship, /migrateUntilCurrent\(\(\) => call\(cfg\.apiUrl, KEY, "migrate"\), want\)/);
  assert.match(ship, /process\.exit\(1\)/);
  const actions = readFileSync(join(ROOT, "backend", "Actions.js"), "utf8");
  assert.match(actions, /ok_\(\{ added: added, stamp: typeof BACKEND_STAMP === "string" \? BACKEND_STAMP : "" \}/);
});

test("migrate wait refuses when there is no commit stamp to wait for (review minor 1)", async () => {
  const { migrateUntilCurrent } = await import("../scripts/release-lib.mjs");
  for (const wanted of [undefined, "", "  "]) {
    let asked = 0;
    const r = await migrateUntilCurrent(async () => { asked++; return { ok: true, data: { added: [] } }; }, wanted, { sleep: async () => {}, budgetMs: 0 });
    assert.equal(r.ok, false);
    assert.equal(asked, 0);
  }
});
