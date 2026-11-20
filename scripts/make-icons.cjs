// Draws the Home Screen icons in look C, "The guest check": a green-ruled
// guest check, a little tilted, on the mint counter with its dot grid; its
// boxes across the top, "Guest Check" in the slab, three ruled lines and the
// purple PAID print of the time clock (paidStampSVG from js/stamp.js).
// Everything is drawn here (CSS and SVG); no picture comes from anywhere.
// Writes icons/icon-180.png (iOS), icons/icon-192.png and icons/icon-512.png
// (the check kept inside the middle 80%, so it is also safe as a maskable
// icon). None has any transparency.
//
// Run once with: node scripts/make-icons.cjs   (needs local Chrome)
// The faces are Zilla Slab and VT323 from Google Fonts when they can be
// reached, else Georgia and the system's monospace; it prints which it used.

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright-core");

const ROOT = path.join(__dirname, "..");
const GROUND = "#E9E1CE";
const SEED = 7; // a print whose wear reads well at icon size
// size -> how wide the check is, as a share of the icon
const ICONS = [
  { size: 180, file: "icon-180.png", share: 0.74 },
  { size: 192, file: "icon-192.png", share: 0.74 },
  { size: 512, file: "icon-512.png", share: 0.66 },
];

function page(paid, size, share, withFont) {
  const font = withFont
    ? '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=VT323&family=Zilla+Slab:wght@700&display=block">'
    : "";
  const w = Math.round(size * share);
  const u = w / 100; // one hundredth of the check's width
  return `<!doctype html><html><head><meta charset="utf-8">${font}<style>
html,body{margin:0;width:${size}px;height:${size}px;overflow:hidden;
  background:radial-gradient(rgba(60,40,15,.08) ${u * 0.9}px, transparent ${u * 1.3}px) 0 0/${u * 9}px ${u * 9}px, ${GROUND}}
body{display:grid;place-items:center}
.c{position:relative;width:${w}px;height:${Math.round(w * 1.18)}px;background:#FBF5E3;border-radius:${u * 1.5}px;transform:rotate(-6deg);
  box-shadow:0 ${u}px ${u}px rgba(0,0,0,.15),0 ${u * 9}px ${u * 12}px -${u * 8}px rgba(0,0,0,.55);overflow:hidden}
.b{display:grid;grid-template-columns:1.25fr .8fr .8fr 1fr;height:${u * 16}px;border-bottom:${u * 1.6}px solid #7A5530}
.b i{border-right:${u * 0.8}px solid #7A5530}.b i:last-child{border:0}
.t{text-align:center;font:700 ${u * 15.5}px/1 "Zilla Slab",Rockwell,Georgia,serif;color:#7A5530;padding:${u * 7}px 0 ${u * 6}px;border-bottom:${u * 2.4}px double #7A5530}
.l{height:${u * 15}px;border-bottom:${u * 0.8}px solid rgba(122,85,48,.42);background:linear-gradient(#7A5530,#7A5530) ${u * 20}px 0/${u * 0.8}px 100% no-repeat}
.p{position:absolute;right:${u * 4}px;bottom:${u * 2}px;width:${u * 56}px;height:${u * 56}px;transform:rotate(-8deg);mix-blend-mode:multiply}
</style></head><body><div class="c"><div class="b"><i></i><i></i><i></i><i></i></div><div class="t">Guest Check</div>
<div class="l"></div><div class="l"></div><div class="l"></div><div class="p">${paid}</div></div></body></html>`;
}

async function main() {
  const { paidStampSVG } = await import(pathToFileURL(path.join(ROOT, "js", "stamp.js")).href);
  const paid = paidStampSVG(SEED);
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    fs.mkdirSync(path.join(ROOT, "icons"), { recursive: true });
    let face = null;
    for (const icon of ICONS) {
      const ctx = await browser.newContext({ viewport: { width: icon.size, height: icon.size }, deviceScaleFactor: 1 });
      const p = await ctx.newPage();
      let web = false;
      try {
        await p.setContent(page(paid, icon.size, icon.share, true), { waitUntil: "load", timeout: 15000 });
        web = await p.evaluate(async () => {
          await document.fonts.load('700 20px "Zilla Slab"', "Guest Check");
          await document.fonts.load('20px "VT323"', "PAID");
          await document.fonts.ready;
          // check() is also true when no face matches at all, so look for the faces themselves.
          const has = (name) => [...document.fonts].some((f) => f.family.replace(/"/g, "") === name && f.status === "loaded");
          return has("Zilla Slab") && has("VT323");
        });
      } catch {
        web = false;
      }
      if (!web) await p.setContent(page(paid, icon.size, icon.share, false), { waitUntil: "load" });
      face = web ? "Zilla Slab and VT323" : "Georgia and the system monospace (Google Fonts could not be reached)";
      await p.screenshot({ path: path.join(ROOT, "icons", icon.file), omitBackground: false });
      await ctx.close();
      console.log("wrote icons/" + icon.file);
    }
    console.log("faces: " + face);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
