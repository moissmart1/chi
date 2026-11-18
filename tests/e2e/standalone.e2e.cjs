// A Home Screen app on an iPhone takes the whole screen's height (css/base.css).

const assert = require("node:assert/strict");
const { SEED, NOON28, open, until } = require("./helpers.cjs");

const SHORT = { width: 440, height: 878 };
const SCREEN = { width: 440, height: 956 };
const drawn = (page) => until(() => page.evaluate(() => document.querySelectorAll("#rc .rc-row").length > 0), "the receipt draws");

module.exports = [
  {
    // This browser cannot be put in Home Screen mode, so the rule is read from the stylesheet;
    // that it works on an iPhone was seen on Mo's (2026-12-03).
    name: "the stylesheet gives a Home Screen app the large viewport height, and a browser tab is unchanged",
    viewport: SHORT,
    screen: SCREEN,
    async run({ page }) {
      await open(page, { seed: SEED, nowMs: NOON28 });
      await drawn(page);
      const seen = await page.evaluate(async () => {
        const css = await (await fetch("css/base.css")).text();
        const at = css.indexOf("@media (display-mode: standalone)");
        return { rule: at < 0 ? "" : css.slice(at, css.indexOf("}", css.indexOf("}", at) + 1) + 1).replace(/\s+/g, " "), html: getComputedStyle(document.documentElement).height, nav: Math.round(document.querySelector(".nav").getBoundingClientRect().bottom) };
      });
      assert.equal(seen.rule, "@media (display-mode: standalone){ html{height:100%;height:max(100%, 100lvh)} }");
      assert.equal(seen.html, "878px");
      assert.equal(seen.nav, 878);
    },
  },
];
