// Settings (Task 12): the "You" sheet.

const assert = require("node:assert/strict");
const { ORIGIN, SEED, THREE, NOON28, open, advance, until, text, expectText, visible } = require("./helpers.cjs");

// ---- small tools for this file ----

const isOpen = (page) => page.evaluate(() => document.getElementById("you").classList.contains("is-open"));
// Open, and risen all the way (the sheet slides up over 500 ms).
const waitYou = (page) =>
  until(
    () => page.evaluate(() => {
      const s = document.getElementById("you");
      return s.classList.contains("is-open") && Math.abs(s.getBoundingClientRect().bottom - innerHeight) < 1;
    }),
    "the settings sheet opens",
  );
const waitYouClosed = (page) => until(async () => !(await isOpen(page)), "the settings sheet closes");
const loads = (backend) => backend.requests.filter((r) => r.action === "load").length;
const setPersonRequests = (backend) => backend.requests.filter((r) => r.action === "setPerson").length;
const people = (backend) => backend.fake.primitives.readTable_("People");
const addressOf = (backend, name) => people(backend).find((p) => p.name === name).etransfer;
const mailValue = (page) => page.inputValue("#setMail");
const clipboard = (page) => page.evaluate(() => navigator.clipboard.readText());
const storage = (page, k) => page.evaluate((key) => localStorage.getItem(key), k);
const waitMail = (page, v) => until(async () => (await mailValue(page)) === v, "the address field reads " + JSON.stringify(v));

async function ready(page, opts = {}) {
  const backend = await open(page, { seed: SEED, nowMs: NOON28, ...opts });
  await until(() => page.evaluate(() => document.querySelectorAll("#rc .rc-row").length > 0), "the receipt draws");
  return backend;
}

async function openYou(page) {
  await page.click("#youBtn");
  await waitYou(page);
}

async function pick(page, name) {
  await page.click('#setWho [data-me="' + name + '"]');
  await until(async () => (await storage(page, "chi.me")) === name, "chi.me is " + name);
}

module.exports = [
  {
    name: "You opens the sheet, titled You, a dialog with focus inside, rows in order; Done, the scrim and Escape close it and focus returns to You",
    async run({ page }) {
      await ready(page);
      assert.equal(await isOpen(page), false);
      assert.equal(await page.evaluate(() => document.getElementById("you").inert), true);
      await openYou(page);
      assert.equal(await page.getAttribute("#you", "role"), "dialog");
      assert.equal(await page.getAttribute("#you", "aria-modal"), "true");
      assert.equal(await text(page, "#you .sheet-top span"), "You");
      assert.equal(await page.evaluate(() => document.getElementById("you").contains(document.activeElement)), true, "focus moves into the sheet");
      const order = await page.evaluate(() => {
        const ids = ["setWho", "setMail", "setSound", "setHist", "setFresh", "setDemo", "setHow", "setInstall", "setInvite", "setClaude", "setSheet", "setReport"];
        const all = [...document.querySelectorAll("#you *")];
        return ids.map((id) => all.indexOf(document.getElementById(id)));
      });
      assert.ok(order.every((n) => n > 0) && order.slice().sort((a, b) => a - b).join() === order.join(), "rows are in the asked order: " + order);

      await page.click("#youDone");
      await waitYouClosed(page);
      assert.equal(await page.evaluate(() => document.activeElement.id), "youBtn", "focus returns to You");
      await openYou(page);
      await page.mouse.click(195, 60); // the dimmed table above the sheet
      await waitYouClosed(page);
      await openYou(page);
      await page.keyboard.press("Escape");
      await waitYouClosed(page);
    },
  },
  {
    name: "one overlay at a time: Settings closes the register, the line sheet and History, and each of them closes Settings",
    async run({ page }) {
      await ready(page);
      const reg = () => page.evaluate(() => globalThis.__matTest.register.isOpen());
      const lineOpen = () => page.evaluate(() => document.getElementById("line").classList.contains("is-open"));
      const histOpen = () => page.evaluate(() => document.getElementById("hist").classList.contains("is-open"));
      // The register is open: You cannot be tapped under it, so open it from code, then use You from code's door (the button).
      await page.evaluate(() => globalThis.__matTest.register.open());
      await until(reg, "register opens");
      await page.evaluate(() => document.getElementById("youBtn").click());
      await waitYou(page);
      await until(async () => !(await reg()), "the register closed");

      await page.click("#youDone");
      await waitYouClosed(page);
      await page.click("#rc .rc-row");
      await until(lineOpen, "line sheet opens");
      await page.evaluate(() => document.getElementById("youBtn").click());
      await waitYou(page);
      await until(async () => !(await lineOpen()), "the line sheet closed");

      await page.evaluate(() => document.getElementById("histBtn").click());
      await until(histOpen, "history opens");
      assert.equal(await isOpen(page), false, "History closed Settings");
      await page.evaluate(() => document.getElementById("youBtn").click());
      await waitYou(page);
      await until(async () => !(await histOpen()), "History closed");

      await page.evaluate(() => document.getElementById("ring").click());
      await until(reg, "Ring up opens the register");
      assert.equal(await isOpen(page), false, "the register closed Settings");
    },
  },
  {
    name: "switching person stores chi.me and #say follows; the field then shows that person's own address and a half-typed one is dropped",
    async run({ page }) {
      const backend = await ready(page);
      await expectText(page, "#say", "Izzah owes you $694.72.");
      await openYou(page);
      assert.equal(await page.locator("#setWho [data-me]").count(), 2);
      assert.equal(await page.getAttribute('#setWho [data-me="Mo"]', "aria-pressed"), "true");
      await page.fill("#setMail", "mo@example.test");
      await page.click("#setMailSave");
      await until(() => addressOf(backend, "Mo") === "mo@example.test", "Mo's address saved");

      await page.fill("#setMail", "half-typed");
      await pick(page, "Izzah");
      await expectText(page, "#say", "You owe Mo $694.72.");
      assert.equal(await page.getAttribute('#setWho [data-me="Izzah"]', "aria-pressed"), "true");
      assert.equal(await page.getAttribute('#setWho [data-me="Mo"]', "aria-pressed"), "false");
      await waitMail(page, "");
      await page.fill("#setMail", "izzah@example.test");
      await page.click("#setMailSave");
      await until(() => addressOf(backend, "Izzah") === "izzah@example.test", "Izzah's address saved");
      assert.equal(addressOf(backend, "Mo"), "mo@example.test", "Mo's is untouched");
      await pick(page, "Mo");
      await waitMail(page, "mo@example.test");
      await pick(page, "Izzah");
      await waitMail(page, "izzah@example.test");
    },
  },
  {
    name: "e-Transfer: the field is built for an address, an unchanged save sends nothing, a save is kept after reopening, a failed one keeps what was typed",
    async run({ page }) {
      const backend = await ready(page);
      await openYou(page);
      const attrs = await page.$eval("#setMail", (i) => ({
        maxlength: i.getAttribute("maxlength"),
        autocapitalize: i.getAttribute("autocapitalize"),
        autocorrect: i.getAttribute("autocorrect"),
        inputmode: i.getAttribute("inputmode"),
        size: parseFloat(getComputedStyle(i).fontSize),
      }));
      assert.deepEqual({ ...attrs, size: undefined }, { maxlength: "80", autocapitalize: "none", autocorrect: "off", inputmode: "email", size: undefined });
      assert.ok(attrs.size >= 16, "at least 16 px, so iOS does not zoom");
      assert.equal(await page.isDisabled("#setMailSave"), true, "nothing to save yet");

      // An address with markup is shown as text, never as HTML.
      const odd = "<b>x</b>@example.test";
      await page.fill("#setMail", odd);
      await page.click("#setMailSave");
      await until(() => addressOf(backend, "Mo") === odd, "saved as typed");
      assert.equal(await page.locator("#you b", { hasText: "x" }).count(), 0, "no element made from the address");
      assert.equal(await mailValue(page), odd);

      // The same value again: Save is off and Enter sends nothing.
      const sent = setPersonRequests(backend);
      assert.equal(await page.isDisabled("#setMailSave"), true);
      await page.focus("#setMail");
      await page.keyboard.press("Enter");
      await page.evaluate(() => globalThis.__matTest.store.idle());
      assert.equal(setPersonRequests(backend), sent, "an unchanged address sends nothing");

      await page.click("#youDone");
      await waitYouClosed(page);
      await openYou(page);
      assert.equal(await mailValue(page), odd, "reopening shows it");

      // No signal: the typed text stays in the field and Save is still there to try again.
      backend.failWith = "network";
      await page.fill("#setMail", "new@example.test");
      await page.click("#setMailSave");
      await page.evaluate(() => globalThis.__matTest.store.idle());
      assert.equal(await mailValue(page), "new@example.test", "what was typed is kept");
      assert.equal(addressOf(backend, "Mo"), odd);
      assert.equal(await page.isDisabled("#setMailSave"), false, "Save can be tapped again");
      backend.failWith = null;
      await page.click("#setMailSave");
      await until(() => addressOf(backend, "Mo") === "new@example.test", "saved once the signal is back");
      assert.equal(await mailValue(page), "new@example.test");
    },
  },
  {
    name: "the stamp sound switch flips On and Off and chi.sound between on and off",
    async run({ page }) {
      await ready(page);
      await openYou(page);
      await expectText(page, "#setSoundV", "On");
      await page.click("#setSound");
      await expectText(page, "#setSoundV", "Off");
      assert.equal(await storage(page, "chi.sound"), "off");
      await page.click("#setSound");
      await expectText(page, "#setSoundV", "On");
      assert.equal(await storage(page, "chi.sound"), "on");
      await page.click("#setSound");
      await page.click("#youDone");
      await waitYouClosed(page);
      await openYou(page);
      await expectText(page, "#setSoundV", "Off"); // still off after reopening
    },
  },
  {
    name: "History closes Settings and opens the tape",
    async run({ page }) {
      await ready(page);
      await openYou(page);
      await page.click("#setHist");
      await waitYouClosed(page);
      await until(() => page.evaluate(() => document.getElementById("hist").classList.contains("is-open")), "the tape opens");
      await until(() => page.evaluate(() => document.querySelectorAll("#tape .tp-row").length > 0), "entries arrive");
    },
  },
  {
    name: "Last updated reads Up to date 13:20 like the receipt, and a tap fetches once",
    async run({ page }) {
      const backend = await ready(page);
      await openYou(page);
      await expectText(page, "#setFresh", "Up to date 13:20");
      assert.equal(await text(page, "#fresh"), await text(page, "#setFresh"), "the same words as the receipt");
      const before = loads(backend);
      await page.click("#setFresh");
      await until(() => loads(backend) === before + 1, "one load");
      await page.evaluate(() => globalThis.__matTest.store.idle());
      assert.equal(loads(backend), before + 1, "only one");
      await expectText(page, "#setFresh", "Up to date ✓");
      await advance(page, backend, 2000);
      await expectText(page, "#setFresh", "Up to date 13:20");
    },
  },
  {
    name: "How this works shows the three lines from first open, and folds away again",
    async run({ page }) {
      await ready(page);
      await openYou(page);
      assert.equal(await visible(page, "#setHowLines"), false);
      assert.equal(await page.getAttribute("#setHow", "aria-expanded"), "false");
      await page.click("#setHow");
      assert.equal(await page.getAttribute("#setHow", "aria-expanded"), "true");
      const lines = await page.$$eval("#setHowLines .how-l", (els) => els.map((e) => e.textContent));
      const { HOW_LINES } = await import("../../js/views/first.js");
      assert.deepEqual(lines, HOW_LINES);
      assert.deepEqual(lines, ["Ring up what you paid.", "The slip says who pays whom.", "Stamp it the moment you send."]);
      await page.click("#setHow");
      assert.equal(await visible(page, "#setHowLines"), false);
    },
  },
  {
    name: "the invite link copies origin + path + #k=<key>, the bar says so, and the key is never on screen",
    async run({ page }) {
      await ready(page);
      await openYou(page);
      await page.click("#setInvite");
      await expectText(page, "#ubarT", "Link copied.");
      const expected = await page.evaluate(() => location.origin + location.pathname + "#k=test-key");
      assert.equal(await clipboard(page), expected);
      assert.equal(expected, ORIGIN + "/#k=test-key");
      assert.equal(await page.evaluate(() => document.body.innerText.includes("test-key") || document.body.innerHTML.includes("test-key")), false, "the key is not drawn anywhere");
      assert.equal(await page.evaluate(() => location.hash), "", "and not in the address bar");
    },
  },
  {
    name: "Add to Home Screen copies the link, carries the key in the address and the manifest, shows two steps; closing takes it all back",
    async run({ page }) {
      await ready(page);
      await openYou(page);
      assert.ok(await visible(page, "#setInstall"));
      assert.equal(await page.evaluate(() => document.querySelector("#setInstall > span").firstChild.textContent), "Add to Home Screen");
      assert.equal(await text(page, "#setInstall small"), "Opens like an app, full screen");
      assert.equal(await visible(page, "#setInstallHow"), false, "the steps wait for the tap");
      const original = await page.evaluate(() => {
        const l = document.querySelector('link[rel="manifest"]');
        return { href: l.getAttribute("href"), count: document.querySelectorAll('link[rel="manifest"]').length };
      });
      assert.deepEqual(original, { href: "manifest.webmanifest", count: 1 });

      // The page's Content-Security-Policy lets no script fetch a blob: URL, so
      // the test reads the manifest from the Blob the app handed to createObjectURL.
      await page.evaluate(() => {
        const make = URL.createObjectURL.bind(URL);
        globalThis.__blobs = {};
        URL.createObjectURL = (blob) => {
          const url = make(blob);
          globalThis.__blobs[url] = blob;
          return url;
        };
      });
      await page.click("#setInstall");
      await expectText(page, "#ubarT", "Link copied.");
      assert.equal(await clipboard(page), ORIGIN + "/#k=test-key");
      assert.equal(await page.evaluate(() => location.hash), "#k=test-key");
      const steps = await page.$$eval("#setInstallHow > span", (els) => els.map((e) => e.textContent));
      assert.deepEqual(steps, ["1. Tap Share, then Add to Home Screen.", "2. If it asks for your trip link, paste: it’s already copied."]);
      assert.ok(await visible(page, "#setInstallHow"));
      const m = await until(
        () => page.evaluate(async () => {
          const links = document.querySelectorAll('link[rel="manifest"]');
          if (links.length !== 1 || !links[0].href.startsWith("blob:")) return null;
          return JSON.parse(await globalThis.__blobs[links[0].href].text());
        }),
        "a keyed manifest stands in",
      );
      assert.ok(m.start_url.endsWith("#k=test-key"), m.start_url);
      assert.equal(m.start_url, ORIGIN + "/#k=test-key");
      assert.equal(m.scope, ORIGIN + "/");
      assert.equal(m.id, ORIGIN + "/?app=chi");
      assert.equal(m.name, "Wendy’s Chicago 2026");
      assert.ok(m.icons.length > 0 && m.icons.every((i) => i.src.startsWith(ORIGIN + "/icons/")), "absolute icon URLs");
      assert.equal(await page.evaluate(() => document.body.innerText.includes("test-key")), false, "the key is not drawn");

      await page.click("#youDone");
      await waitYouClosed(page);
      assert.equal(await page.evaluate(() => location.hash), "", "the key leaves the address bar");
      const after = await page.evaluate(() => {
        const l = document.querySelectorAll('link[rel="manifest"]');
        return { href: l[0].getAttribute("href"), count: l.length };
      });
      assert.deepEqual(after, original, "the page's own manifest is back");
      await openYou(page);
      assert.equal(await visible(page, "#setInstallHow"), false, "the steps are folded away again");
    },
  },
  {
    name: "Add to Home Screen is hidden when the app already runs from the Home Screen",
    async run({ page, newPhone }) {
      // This Chrome cannot emulate display-mode, so the page is told it runs
      // standalone the two ways a phone says so: the media query, and iOS's
      // navigator.standalone.
      await page.addInitScript(() => {
        const real = window.matchMedia.bind(window);
        window.matchMedia = (q) => (/display-mode:\s*standalone/.test(q) ? { ...real(q), matches: true, media: q } : real(q));
      });
      await ready(page);
      assert.equal(await page.evaluate(() => matchMedia("(display-mode: standalone)").matches), true, "standalone is emulated");
      await openYou(page);
      assert.equal(await visible(page, "#setInstall"), false);
      assert.ok(await visible(page, "#setInvite"));
      assert.equal(await text(page, "#setInviteFor"), "For Izzah. Keep it between you.");

      const ios = await newPhone();
      await ios.addInitScript(() => Object.defineProperty(Navigator.prototype, "standalone", { get: () => true, configurable: true }));
      await ready(ios);
      await openYou(ios);
      assert.equal(await visible(ios, "#setInstall"), false, "hidden on an iPhone Home Screen app too");
    },
  },
  {
    name: "Google Sheet is a real link that opens in a new tab; with no sheet address the row is hidden",
    async run({ page }) {
      const backend = await ready(page);
      await openYou(page);
      assert.equal(await page.getAttribute("#setSheet", "href"), "https://example.test/sheet");
      assert.equal(await page.getAttribute("#setSheet", "target"), "_blank");
      assert.equal(await page.getAttribute("#setSheet", "rel"), "noopener");
      assert.equal(await page.evaluate(() => document.getElementById("setSheet").tagName), "A");
      assert.ok(await visible(page, "#setSheet"));

      // A backend that has no sheet address to give.
      const orig = backend.handle;
      backend.handle = async (body) => {
        const r = await orig.call(backend, body);
        if (r && r.ok && r.data && "sheetUrl" in r.data) r.data.sheetUrl = "";
        return r;
      };
      await page.click("#setFresh");
      await until(async () => !(await visible(page, "#setSheet")), "the row is hidden");
      assert.equal(await page.getAttribute("#setSheet", "href"), null);
    },
  },
  {
    name: "Report a problem copies who, Money, the version, the time and the five newest history sentences, never the key",
    async run({ page }) {
      const backend = await ready(page);
      await openYou(page);
      await page.click("#setReport");
      await expectText(page, "#ubarT", "Copied. Paste it to Mo or Claude.");
      const note = await clipboard(page);
      const { APP_VERSION } = await import("../../js/config.js");
      assert.match(note, /^Who: Mo$/m);
      assert.match(note, /^Screen: Money$/m);
      assert.ok(note.includes("App version: " + APP_VERSION));
      assert.match(note, /^Time: Mon Dec 28, 13:20$/m);
      const entries = await backend.handle({ key: "test-key", actor: "Mo", via: "app", action: "history", args: {} });
      const newest = entries.data.entries.slice(0, 5).map((e) => e.who + " " + e.summary + (e.via === "claude" ? " (through Claude)" : ""));
      assert.equal(newest.length, 5);
      assert.deepEqual(note.split("\n").filter((l) => l.startsWith("- ")), newest.map((x) => "- " + x));
      assert.equal(note.includes("test-key"), false, "no trip key in the note");
      // What the phone says about its screen, for a layout problem that only shows on one phone.
      assert.match(note, /^This phone’s screen:$/m);
      assert.match(note, /^  screen \d+ x \d+ · inner 390 x 844$/m);
      assert.ok(note.indexOf("This phone’s screen:") < note.indexOf("What went wrong:"));
      assert.equal(await page.isDisabled("#setReport"), false);
    },
  },
  {
    name: "Report a problem with no signal says history unavailable and still copies",
    async run({ page }) {
      const backend = await ready(page);
      await openYou(page);
      backend.failWith = "network";
      await page.click("#setReport");
      await expectText(page, "#ubarT", "Copied. Paste it to Mo or Claude.");
      const note = await clipboard(page);
      assert.match(note, /^Latest changes: history unavailable$/m);
      assert.equal(note.split("\n").some((l) => l.startsWith("- ")), false);
      assert.match(note, /^Who: Mo$/m);
      backend.failWith = null;
    },
  },
  {
    name: "Report a problem says it couldn’t copy when the note cannot be built",
    async run({ page }) {
      await ready(page);
      await openYou(page);
      await page.evaluate(() => navigator.clipboard.writeText("before"));
      await page.evaluate(() => {
        globalThis.__matTest.store.loadHistory = () => Promise.reject(new Error("test"));
      });
      await page.click("#setReport");
      await expectText(page, "#ubarT", "Couldn’t copy. Try again.");
      await until(async () => !(await page.isDisabled("#setReport")), "the button comes back");
      assert.equal(await clipboard(page), "before", "nothing was copied");
    },
  },
  {
    name: "Claude link copies the connector address",
    async run({ page }) {
      const backend = await ready(page);
      await openYou(page);
      assert.equal(await page.evaluate(() => document.querySelector("#setClaude > span").firstChild.textContent), "Claude link");
      assert.equal(await text(page, "#setClaude small"), "Lets your Claude add stops and expenses. Keep it to yourself.");
      assert.equal(await text(page, "#setClaude b"), "Copy");
      await page.click("#setClaude");
      await expectText(page, "#ubarT", "Claude link copied.");
      const { API_URL } = await import("../../js/config.js");
      assert.equal(await clipboard(page), API_URL + "?t=claude-token&as=Mo");
      assert.match(await clipboard(page), /\?t=claude-token&as=Mo$/);
      const seen = await page.evaluate(() => [document.body.innerText, document.body.innerHTML, JSON.stringify({ ...localStorage }), JSON.stringify({ ...sessionStorage }), location.href].join("|"));
      assert.equal(seen.includes("claude-token"), false, "the token is not drawn, stored or in the address");
      assert.equal(backend.requests.filter((r) => r.action === "claudeLink").length, 1);
      assert.equal(await page.isDisabled("#setClaude"), false, "the row can be tapped again");

      // iPhone Safari: the clipboard is written within the tap itself, as a
      // ClipboardItem whose text arrives later, never after the reply.
      await page.evaluate(() => globalThis.__matTest.store.clearNotice());
      const inTap = await page.evaluate(() => {
        const clip = navigator.clipboard;
        const write = clip.write.bind(clip);
        globalThis.__clip = { write: 0, writeText: 0 };
        clip.write = (items) => {
          globalThis.__clip.write++;
          return write(items);
        };
        const writeText = clip.writeText.bind(clip);
        clip.writeText = (t) => {
          globalThis.__clip.writeText++;
          return writeText(t);
        };
        document.getElementById("setClaude").click();
        return globalThis.__clip.write;
      });
      assert.equal(inTap, 1, "clipboard.write is called before the tap's handler returns");
      await expectText(page, "#ubarT", "Claude link copied.");
      assert.deepEqual(await page.evaluate(() => globalThis.__clip), { write: 1, writeText: 0 });
      assert.match(await clipboard(page), /\?t=claude-token&as=Mo$/);
    },
  },
  {
    name: "Claude link carries the viewer's own name, URL-encoded, and each tap asks again",
    async run({ page }) {
      // A name the URL has to encode, on a third person (the seed's lines
      // that name Sam are then set aside).
      const backend = await open(page, { seed: { ...THREE, people: { Sam: { name: "Tr én&t" } } }, me: "Tr én&t" });
      await until(() => page.evaluate(() => globalThis.__matTest.store.state.me === "Tr én&t"), "the app knows who this is");
      await openYou(page);
      await page.click("#setClaude");
      await expectText(page, "#ubarT", "Claude link copied.");
      assert.match(await clipboard(page), /\?t=claude-token&as=Tr%20%C3%A9n%26t$/);
      await page.evaluate(() => globalThis.__matTest.store.clearNotice());
      await pick(page, "Izzah");
      await page.click("#setClaude");
      await until(async () => /\?t=claude-token&as=Izzah$/.test(await clipboard(page)), "the second copy names Izzah");
      assert.equal(backend.requests.filter((r) => r.action === "claudeLink").length, 2, "the token is not kept between taps");
    },
  },
  {
    name: "Claude link with no signal says so and copies nothing",
    async run({ page }) {
      const backend = await ready(page);
      await openYou(page);
      await page.evaluate(() => navigator.clipboard.writeText("before"));
      backend.failWith = "network";
      await page.click("#setClaude");
      await expectText(page, "#ubarT", "No signal. Try again.");
      await page.evaluate(() => globalThis.__matTest.store.idle());
      assert.equal(await clipboard(page), "before", "nothing was copied");
      await until(async () => !(await page.isDisabled("#setClaude")), "the row comes back");
    },
  },
  {
    name: "Claude link: a trip with no token yet gives the backend's sentence; closing Settings while it is on its way copies nothing",
    async run({ page }) {
      const backend = await ready(page);
      await openYou(page);
      await page.evaluate(() => navigator.clipboard.writeText("before"));
      delete backend.fake.props.CLAUDE_TOKEN;
      await page.click("#setClaude");
      await expectText(page, "#ubarT", "The Claude link isn’t set up yet. Ask Mo to run migrate.");
      assert.equal(await clipboard(page), "before");

      backend.fake.props.CLAUDE_TOKEN = "claude-token";
      let release;
      let asked = 0;
      const gate = new Promise((r) => (release = r));
      const handle = backend.handle;
      backend.handle = async (body) => {
        if (body.action === "claudeLink") {
          asked++;
          await gate;
        }
        return handle(body);
      };
      await page.evaluate(() => globalThis.__matTest.store.clearNotice());
      await page.click("#setClaude");
      await until(() => asked === 1, "the token is asked for");
      await page.click("#youDone");
      await waitYouClosed(page);
      release();
      await until(async () => !(await page.isDisabled("#setClaude")), "the tap has finished");
      assert.equal(await clipboard(page), "before", "nothing was copied after Settings closed");
      assert.notEqual(await text(page, "#ubarT"), "Claude link copied.");
    },
  },
];
