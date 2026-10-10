// Browser test: drives dist/<course>/preview.html. Run: npm run test:ui [-- <course>]
// Set CHROMIUM_PATH if Playwright's own browser isn't installed. Screenshots of every theme go to dist/screens/.
import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const course = process.argv[2] || "theory-example";
const url = "file://" + path.join(root, "dist", course, "preview.html");
const shots = path.join(root, "dist", "screens");
fs.mkdirSync(shots, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];
const step = async (name, fn) => { process.stdout.write("  " + name + " ... "); await fn(); console.log("ok"); };

async function open(q = "", opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, ...opts });
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" && !/fonts\.g|youtube|ERR_|net::/.test(m.text())) errors.push(m.text()); });
  await page.goto(url + q);
  await page.waitForFunction(() => typeof S === "object" && S && document.querySelector(".sp"));
  return page;
}
// The time under a screen x on the timeline, so zooming can be checked to keep the pointer's moment in place.
const timeAt = (page, x) => page.evaluate(x => (tl.scrollLeft + x - tl.getBoundingClientRect().left - gut()) / pps, x);
const frame = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

console.log(`UI test: ${course}`);
const page = await open();

await step("boots with the course's default theme and course name", async () => {
  const cfg = await page.evaluate(() => CONFIG);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.skin), cfg.THEME);
  assert.match(await page.textContent("#courseName"), new RegExp(cfg.COURSE));
});

await step("Ctrl + wheel zooms around the pointer (mouse wheel and Chrome trackpad pinch)", async () => {
  await page.click("#zFit");
  const box = await page.locator("#tl").boundingBox();
  const x = box.x + box.width * 0.6, y = box.y + 120;
  const p0 = await page.evaluate(() => pps), t0 = await timeAt(page, x);
  await page.mouse.move(x, y);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Control");
  await frame(page);
  const p1 = await page.evaluate(() => pps);
  assert.ok(p1 / p0 > 1.4 && p1 / p0 < 1.6, `one wheel notch should zoom about 1.5x, got ${p1 / p0}`);
  assert.ok(Math.abs((await timeAt(page, x)) - t0) < 0.05, "the moment under the pointer stays put");
  // A trackpad pinch: many small ctrl-wheel deltas in one frame are applied together.
  await page.evaluate(({ x, y }) => { for (let i = 0; i < 10; i++) tl.dispatchEvent(new WheelEvent("wheel", { deltaY: -4, ctrlKey: true, clientX: x, clientY: y, bubbles: true, cancelable: true })); }, { x, y });
  await frame(page);
  const p2 = await page.evaluate(() => pps);
  assert.ok(Math.abs(p2 / p1 - Math.exp(40 * 0.008)) < 0.01, `pinch steps should multiply, got ${p2 / p1}`);
  // Zooming out stops at the whole piece.
  await page.keyboard.down("Control");
  for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 100);
  await page.keyboard.up("Control");
  await frame(page);
  assert.ok(Math.abs((await page.evaluate(() => pps)) - (await page.evaluate(() => fitPps()))) < 1e-6, "zoom out stops at fit");
});

await step("the page itself doesn't zoom on Ctrl + wheel over the timeline", async () => {
  const prevented = await page.evaluate(() => { const e = new WheelEvent("wheel", { deltaY: -100, ctrlKey: true, bubbles: true, cancelable: true }); tl.dispatchEvent(e); return e.defaultPrevented; });
  assert.ok(prevented);
});

await step("Safari trackpad pinch (gesture events)", async () => {
  const box = await page.locator("#tl").boundingBox();
  const x = box.x + 300, p0 = await page.evaluate(() => pps), t0 = await timeAt(page, x);
  await page.evaluate(x => {
    const g = (type, scale) => { const e = new Event(type, { bubbles: true, cancelable: true }); Object.assign(e, { scale, clientX: x }); tl.dispatchEvent(e); };
    g("gesturestart", 1); g("gesturechange", 1.5); g("gesturechange", 2); g("gestureend", 2);
  }, x);
  await frame(page);
  const p1 = await page.evaluate(() => pps);
  assert.ok(Math.abs(p1 / p0 - 2) < 0.01, `gesture scale 2 should double the zoom, got ${p1 / p0}`);
  assert.ok(Math.abs((await timeAt(page, x)) - t0) < 0.05);
});

await step("Shift + wheel moves along the timeline", async () => {
  const s0 = await page.evaluate(() => tl.scrollLeft);
  await page.evaluate(() => tl.dispatchEvent(new WheelEvent("wheel", { deltaY: 120, shiftKey: true, bubbles: true, cancelable: true })));
  assert.ok((await page.evaluate(() => tl.scrollLeft)) > s0);
});

await step("touchscreen two-finger pinch", async () => {
  const tp = await open("", { hasTouch: true });
  await tp.click("#zFit");
  const box = await tp.locator("#tl").boundingBox();
  const cy = box.y + 140, p0 = await tp.evaluate(() => pps);
  const cdp = await tp.context().newCDPSession(tp);
  const pts = d => [{ x: box.x + 400 - d, y: cy, id: 1 }, { x: box.x + 400 + d, y: cy, id: 2 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts(40) });
  for (const d of [50, 60, 70, 80]) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts(d) }); await frame(tp); }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  const p1 = await tp.evaluate(() => pps);
  assert.ok(Math.abs(p1 / p0 - 2) < 0.05, `spreading fingers 80px to 160px should double the zoom, got ${p1 / p0}`);
  await tp.context().close();
});

await step("every theme applies, in light and dark", async () => {
  const looks = await page.evaluate(() => lookChoices().map(l => l.id));
  await page.click("#bLook");
  const seen = new Set();
  for (const id of looks) {
    for (const mode of ["light", "dark"]) {
      await page.click(`#lookPop [data-mode="${mode}"]`);
      await page.click(`.lookcard[data-look="${id}"]`);
      const got = await page.evaluate(() => ({ skin: document.documentElement.dataset.skin, theme: document.documentElement.dataset.theme,
        bg: getComputedStyle(document.body).backgroundColor, acc: getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() }));
      assert.equal(got.skin, id); assert.equal(got.theme, mode);
      seen.add(got.bg + got.acc);
      await page.screenshot({ path: path.join(shots, `${course}-${id}-${mode}.png`), fullPage: true });
    }
  }
  assert.equal(seen.size, looks.length * 2, "each theme and mode looks different");
  await page.click('#lookPop [data-mode="system"]');
  assert.equal(await page.evaluate(() => localStorage.getItem("listeningmap.mode")), null);
});

await step("the chosen theme is remembered on reload", async () => {
  await page.click('.lookcard[data-look="studio"]');
  await page.reload();
  await page.waitForFunction(() => typeof S === "object" && S);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.skin), "studio");
});

await step("instructor: submit, list, and open a submission", async () => {
  await page.waitForSelector("#bSubs:not([hidden])");
  await page.evaluate(() => { S.source = { type: "file", name: "piece.mp3", duration: 80 }; S.meta.title = "Test piece"; });
  await page.click("#bSubmit");
  await page.fill("#subName", "Ada Student");
  await page.click("#subGo");
  await page.waitForSelector("#banner:not([hidden])");
  assert.match(await page.textContent("#banner"), /Submitted/);
  await page.click("#bSubs");
  await page.waitForSelector("#subsList [data-sub]");
  assert.match(await page.textContent("#subsList"), /Ada Student/);
  await page.evaluate(() => { S.meta.title = "changed"; });
  await page.click("#subsList [data-sub]");
  await page.waitForFunction(() => S.meta.title === "Test piece");
});

await step("export downloads the analysis", async () => {
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#bExport")]);
  assert.match(dl.suggestedFilename(), /\.listening-map\.json$/);
});

await step("student view: Submit, no Submissions, and the demo can't be submitted", async () => {
  const sp = await open("?as=student");
  await sp.waitForSelector("#bSubmit:not([hidden])");
  assert.equal(await sp.isVisible("#bSubmit"), true);
  assert.equal(await sp.isVisible("#bSubs"), false);
  await sp.click("#bSubmit");
  await sp.fill("#subName", "Ada");
  await sp.click("#subGo");
  await sp.waitForSelector("#toast:not([hidden])");
  assert.match(await sp.textContent("#toast"), /your own audio/);
  await sp.context().close();
});

await browser.close();
if (errors.length) { console.error("Page errors:\n  " + errors.join("\n  ")); process.exit(1); }
console.log(`All passed. Screenshots in ${path.relative(root, shots)}/`);
