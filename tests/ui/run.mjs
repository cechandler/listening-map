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

async function open(q = "", { keepExample, ...opts } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, ...opts });
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" && !/fonts\.g|youtube|ERR_|net::/.test(m.text())) errors.push(m.text()); });
  await page.goto(url + q);
  await page.waitForFunction(() => typeof S === "object" && S && document.querySelector(".sp"));
  // The steps below are written against the demo track's analysis, whichever example the course opens with.
  if (!keepExample) await page.evaluate(() => openExample("demo"));
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

await step("the course's example opens first, and Settings lists both examples", async () => {
  const ep = await open("", { keepExample: true });
  const want = (await ep.evaluate(() => CONFIG.EXAMPLE)) || "demo";
  const s = await ep.evaluate(() => ({ title: S.meta.title, example: isExample(), levels: S.tiers.length, markers: S.markers.map(m => m.label) }));
  if (want === "k545") {
    assert.match(s.title, /K\. 545/);
    assert.equal(s.levels, 3);
    assert.ok(s.markers.includes("Recap in F"));
    // Blocks on each level run end to end, in order, across the recording.
    const ok = await ep.evaluate(() => S.tiers.every(t => t[0].start === 0 && Math.abs(t[t.length - 1].end - dur()) < 1e-6 && t.every((b, i) => !i || Math.abs(b.start - t[i - 1].end) < 1e-6 && b.end > b.start)));
    assert.ok(ok, "each level covers the recording without gaps or overlaps");
  }
  assert.equal(s.example, true);
  await ep.click("#bMenu");
  assert.deepEqual(await ep.locator("#exampleList .mi").allTextContents(), ["Demo track (generated)", "Mozart, Piano Sonata K. 545, I"]);
  await ep.click("[data-ex=demo]");
  assert.equal(await ep.evaluate(() => S.source.type), "demo");
  await ep.context().close();
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
  await frame(page); // let the zoom it queued land before the next step measures
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
  // Start on a block: tapping one selects it and redraws before the browser sends touchstart.
  const blk = await tp.locator(".sp").first().boundingBox();
  const cy = blk.y + blk.height / 2, p0 = await tp.evaluate(() => pps);
  const cdp = await tp.context().newCDPSession(tp);
  const pts = d => [{ x: box.x + 400 - d, y: cy, id: 1 }, { x: box.x + 400 + d, y: cy, id: 2 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts(40) });
  for (const d of [50, 60, 70, 80]) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts(d) }); await frame(tp); }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  const p1 = await tp.evaluate(() => pps);
  assert.ok(Math.abs(p1 / p0 - 2) < 0.05, `spreading fingers 80px to 160px should double the zoom, got ${p1 / p0}`);
  await tp.context().close();
});

await step("header: Settings menu holds import, export, theme, and shortcuts", async () => {
  assert.equal(await page.locator("#bReport").count(), 0, "no separate text report");
  assert.equal(await page.isVisible("#menu"), false);
  await page.click("#bMenu");
  for (const id of ["#bImport", "#bExport", "#bLook", "#bKeys"]) assert.ok(await page.isVisible(id), id + " is in the menu");
  await page.click("#bKeys");
  assert.ok(await page.isVisible("#keysPop .keys"));
  await page.click("#keysClose");
  await page.click("#bMenu");
  await page.keyboard.press("Escape");
  assert.equal(await page.isVisible("#menu"), false, "Escape closes the menu");
  // Sources live in the transport; the piece and grid panel sits above it.
  assert.ok(await page.isVisible(".transport label[for=fAudio]"));
  assert.ok(await page.isVisible(".transport #bYT"));
  const order = await page.evaluate(() => [...document.querySelectorAll("#piece, .transport, #tl")].map(e => e.id || e.className));
  assert.deepEqual(order, ["piece", "transport", "tl"]);
  assert.ok(await page.isVisible("#gBpm"));
});

await step("label suggestions: Letters first (with w to z), then Recent; no symbols", async () => {
  await page.click(".sp");
  assert.equal(await page.textContent("#insp .chipgroup .eyebrow"), "Letters");
  for (const w of ["w", "x", "y", "z", "W", "Z"]) assert.equal(await page.locator(`#insp .chip[data-w="${w}"]`).count(), 1, w);
  assert.equal(await page.locator("#insp .chip.sym").count(), 0);
  await page.click('#insp .chip[data-w="Bridge"]');
  assert.equal(await page.evaluate(() => selSpans()[0].label), "Bridge");
  const heads = await page.locator("#insp .chipgroup .eyebrow").allTextContents();
  assert.deepEqual(heads.slice(0, 2), ["Letters", "Recent"]);
  assert.equal(await page.locator('#insp .chipgroup .chips').nth(1).locator('.chip[data-w="Bridge"]').count(), 1);
  await page.keyboard.press("Control+z");
});

await step("each block and instrument entry takes its own texture; instruments start solid", async () => {
  assert.equal(await page.evaluate(() => S.instruments.every(i => !i.texture)), true);
  await page.click('.lab[data-k="instlab"]');
  assert.equal(await page.locator('#insp [data-act="texture"]').count(), 0, "textures belong to entries, not the whole instrument");
  const first = page.locator(".is").first();
  const { inst, id } = await first.evaluate(e => ({ inst: e.dataset.inst, id: e.dataset.id }));
  await first.click();
  await page.click('#insp .istyle [data-act="texture"][data-t="crosshatch"]');
  assert.equal(await page.evaluate(({ inst, id }) => S.instruments.find(i => i.id === inst).spans.find(s => s.id === id).texture, { inst, id }), "crosshatch");
  assert.ok(await page.locator(`.is.tx-crosshatch[data-id="${id}"]`).count() === 1);
  const sp = page.locator(".sp").nth(1);
  await sp.click();
  await page.click('#insp .istyle [data-act="texture"][data-t="dashes"]');
  assert.equal(await page.evaluate(() => selSpans()[0].texture), "dashes");
  assert.ok(await page.locator(".sp.tx-dashes.sel").count() === 1);
  await page.keyboard.press("Escape");
});

await step("markers take their own color", async () => {
  await page.click(".mk .mk-g");
  await page.click('#insp .istyle [data-act="color"][data-c="green"]');
  const id = await page.evaluate(() => sel.id);
  assert.equal(await page.evaluate(id => S.markers.find(m => m.id === id).color, id), "green");
  const bg = await page.evaluate(id => getComputedStyle(document.querySelector(`.mk[data-id="${id}"] .mk-g`)).backgroundColor, id);
  const green = await page.evaluate(() => { const d = document.createElement("i"); d.style.color = "var(--c-green)"; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; });
  assert.equal(bg, green);
  await page.click('#insp .istyle [data-act="color"][data-c=""]');
  assert.equal(await page.evaluate(id => "color" in S.markers.find(m => m.id === id), id), false);
  await page.keyboard.press("Escape");
});

const seekTo = (pg, t) => pg.evaluate(t => { P.seek(t); }, t);
await page.waitForFunction(() => P.kind === "audio" && P.audio.readyState >= 1, null, { timeout: 20000 });

await step("undo with Ctrl/⌘ + Z, also from an untouched text box", async () => {
  const before = await page.evaluate(() => S.tiers[0][1].label);
  await page.locator('.sp[data-tier="0"]').nth(1).click();
  await page.click('#insp .chip[data-w="D"]');
  assert.equal(await page.evaluate(() => S.tiers[0][1].label), "D");
  await page.click("#iLabel");
  await page.keyboard.press("Control+z");
  assert.equal(await page.evaluate(() => S.tiers[0][1].label), before);
  await page.keyboard.press("Escape");
});

await step("J joins neighboring blocks selected with Shift + click", async () => {
  const n = await page.evaluate(() => S.tiers[0].length);
  await page.locator('.sp[data-tier="0"]').nth(1).click();
  await page.locator('.sp[data-tier="0"]').nth(2).click({ modifiers: ["Shift"] });
  await page.keyboard.press("j");
  assert.equal(await page.evaluate(() => S.tiers[0].length), n - 1);
  await page.keyboard.press("Control+z");
  assert.equal(await page.evaluate(() => S.tiers[0].length), n);
  await page.keyboard.press("Escape");
});

await step("number keys pick an instrument; E and X mark entries at the playhead; S splits it", async () => {
  await page.keyboard.press("4"); // Lead: plays 24–40 and 56–72
  assert.equal(await page.evaluate(() => laneFocus === "inst" && S.instruments.find(i => i.id === activeInst).name), "Lead");
  const lead = () => page.evaluate(() => S.instruments.find(i => i.name === "Lead").spans.map(s => [s.start, s.end]));
  await seekTo(page, 44); await page.keyboard.press("e");
  assert.deepEqual((await lead())[1], [44, 56]);
  await seekTo(page, 50); await page.keyboard.press("x");
  assert.deepEqual((await lead())[1], [44, 50]);
  await page.keyboard.press("4");
  await seekTo(page, 30); await page.keyboard.press("s");
  assert.deepEqual((await lead()).slice(0, 2), [[24, 30], [30, 40]], "S splits the instrument entry, not a level");
  for (let i = 0; i < 3; i++) await page.keyboard.press("Control+z");
  assert.equal((await lead()).length, 2);
  await page.locator('.sp[data-tier="0"]').first().click();
  await seekTo(page, 4); await page.keyboard.press("s");
  assert.equal(await page.evaluate(() => S.tiers[0][0].end), 4, "after a block is selected, S splits its level again");
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Escape");
});

await step("levels and instruments reorder; Audio's label adds a level or an instrument", async () => {
  const names = () => page.evaluate(() => S.instruments.map(i => i.name).join(","));
  const first = await names();
  await page.click('.lab[data-k="instlab"]');
  await page.click('.lab[data-k="instlab"].sel [data-k="mv"][data-dir="1"]');
  assert.equal(await names(), first.split(",").slice(1, 2).concat(first.split(",")[0], first.split(",").slice(2)).join(","));
  await page.keyboard.press("Control+z");
  const tiers = await page.evaluate(() => S.tierNames.join(","));
  await page.click('.lab[data-k="tierlab"][data-tier="0"]');
  await page.click('#insp [data-act="mvup"]');
  assert.equal(await page.evaluate(() => S.tierNames.join(",")), tiers.split(",").reverse().join(","));
  await page.keyboard.press("Control+z");
  assert.equal(await page.locator(".r-add").count(), 0);
  const [nt, ni] = await page.evaluate(() => [S.tiers.length, S.instruments.length]);
  await page.click('.audiolab [data-k="addlevel"]');
  await page.keyboard.press("Escape");
  await page.click('.audiolab [data-k="addinst"]');
  await page.keyboard.press("Escape");
  assert.deepEqual(await page.evaluate(() => [S.tiers.length, S.instruments.length]), [nt + 1, ni + 1]);
  await page.keyboard.press("Control+z"); await page.keyboard.press("Control+z");
  await page.keyboard.press("Escape");
});

await step("a block's label can sit at its right end", async () => {
  await page.locator('.sp[data-tier="1"]').first().click();
  await page.check("#iAlign");
  assert.equal(await page.locator('.sp[data-tier="1"].ar').count(), 1);
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Escape");
});

await step("comments filter by level, markers, and instrument, as dots or pills", async () => {
  await page.click('#cmFilters [data-cmf="mk"]');
  const heads = await page.locator("#comments .cm .meta").allTextContents();
  assert.ok(heads.length > 0 && heads.every(h => /^Marker/.test(h)), "only marker comments");
  await page.click('#cmFilters [data-cmf="t1"]');
  assert.ok((await page.locator("#comments .cm .meta").allTextContents()).some(h => /^Sections/.test(h)));
  await page.click('#cmFilters [data-cmf=""]');
  await page.click('[data-cmstyle="pills"]');
  assert.ok(await page.locator("#comments .cmpill").count() > 3);
  await page.click('[data-cmstyle="dots"]');
  assert.equal(await page.locator("#comments .cmpill").count(), 0);
});

await step("C shows a big clock for the room", async () => {
  await page.keyboard.press("c");
  assert.ok(await page.isVisible("#bigClock"));
  await seekTo(page, 65.4); await frame(page);
  assert.equal(await page.textContent("#bcTime"), "1:05.4");
  await page.keyboard.press("c");
  assert.equal(await page.isVisible("#bigClock"), false);
});

await step("every theme applies, in light and dark", async () => {
  const looks = await page.evaluate(() => lookChoices().map(l => l.id));
  await page.click("#bMenu");
  await page.click("#bLook");
  assert.equal(await page.isVisible("#menu"), false, "picking a menu item closes the menu");
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

await step("instructor: submit, list, and open a submission from the Settings menu", async () => {
  assert.equal(await page.locator("header .tools > #bSubmit, header .tools > #bSubs").count(), 0, "not in the header bar");
  await page.click("#bMenu");
  await page.waitForSelector("#bSubs:not([hidden])");
  assert.ok(await page.isVisible("#bSubmit"));
  await page.keyboard.press("Escape");
  await page.evaluate(() => { S.source = { type: "file", name: "piece.mp3", duration: 80 }; S.meta.title = "Test piece"; });
  await page.click("#bMenu"); await page.click("#bSubmit");
  assert.match(await page.textContent("#subWhat"), /piece\.mp3 \(the file itself is not sent\)/);
  await page.fill("#subName", "Ada Student");
  await page.click("#subGo");
  await page.waitForSelector("#subDone:not([hidden])");
  assert.match(await page.textContent("#subDone"), /Your instructor has it/);
  await page.click("#subCancel");
  await page.click("#bMenu"); await page.click("#bSubs");
  await page.waitForSelector("#subsList [data-sub]");
  assert.match(await page.textContent("#subsList"), /Ada Student/);
  await page.evaluate(() => { S.meta.title = "changed"; });
  await page.click("#subsList [data-sub]");
  await page.waitForFunction(() => S.meta.title === "Test piece");
  assert.match(await page.textContent("#banner"), /Viewing Ada Student’s submission/);
  await page.click("#subsBack");
  assert.ok(await page.isVisible("#subsPanel"));
  await page.click("#subsClose");
});

await step("export downloads the analysis", async () => {
  await page.click("#bMenu");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#bExport")]);
  assert.match(dl.suggestedFilename(), /\.listening-map\.json$/);
});

await step("student view: Submit, no Submissions, and the demo can't be submitted", async () => {
  const sp = await open("?as=student");
  await sp.waitForSelector("#bSubmit:not([hidden])", { state: "attached" });
  await sp.click("#bMenu");
  assert.equal(await sp.isVisible("#bSubmit"), true);
  assert.equal(await sp.isVisible("#bSubs"), false);
  await sp.click("#bSubmit");
  assert.equal(await sp.isDisabled("#subGo"), true, "the example analysis can't be sent");
  assert.match(await sp.textContent("#subNote"), /example analysis/);
  await sp.context().close();
});

await browser.close();
if (errors.length) { console.error("Page errors:\n  " + errors.join("\n  ")); process.exit(1); }
console.log(`All passed. Screenshots in ${path.relative(root, shots)}/`);
