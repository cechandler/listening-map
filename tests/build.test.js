// Build tests: course files, theme scoping, and the Apps Script output.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { build, scopeCss, checkCourse, checkPageCode, themeIds } from "../scripts/build.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const courses = fs.readdirSync(path.join(root, "courses")).filter(f => f.endsWith(".json")).map(f => f.slice(0, -5));

test("theme CSS is scoped to its data-skin", () => {
  const out = scopeCss(`/* c */ :root{--a:1} body{x:1} .a, .b > i{y:1}
@media (prefers-color-scheme: dark){ :root:not([data-theme="light"]){--a:2} }
:root[data-theme="dark"]{--a:3} @keyframes k{from{opacity:0}to{opacity:1}} .c:is(.d, .e){z:1}`, "t");
  assert.match(out, /^:root\[data-skin="t"\]\{--a:1\}/);
  assert.match(out, /:root\[data-skin="t"\] body\{x:1\}/);
  assert.match(out, /:root\[data-skin="t"\] \.a,:root\[data-skin="t"\] \.b > i\{y:1\}/);
  assert.match(out, /@media \(prefers-color-scheme: dark\)\{:root\[data-skin="t"\]:not\(\[data-theme="light"\]\)\{--a:2\}/);
  assert.match(out, /:root\[data-skin="t"\]\[data-theme="dark"\]\{--a:3\}/);
  assert.match(out, /@keyframes k\{from\{opacity:0\}to\{opacity:1\}\}/);
  assert.match(out, /:root\[data-skin="t"\] \.c:is\(\.d, \.e\)\{z:1\}/);
  assert.doesNotMatch(out, /\/\*/);
});

test("every theme file scopes cleanly and leaves nothing unscoped", () => {
  for (const id of themeIds().slice(1)) {
    const out = scopeCss(fs.readFileSync(path.join(root, `src/client/themes/${id}.css`), "utf8"), id);
    for (const rule of out.split("\n").filter(l => l.includes("{") && !l.startsWith("@"))) assert.match(rule, new RegExp(`^:root\\[data-skin="${id}"\\]`), rule.slice(0, 80));
  }
});

test("course files are checked", () => {
  assert.throws(() => checkCourse({ COURSE: "X", TEACHERS: ["a@b"], THEME: "nope" }, "x"), /THEME/);
  assert.throws(() => checkCourse({ COURSE: "X", TEACHERS: ["a@b"], THEMES: ["keycap", "neon"] }, "x"), /unknown theme "neon"/);
  assert.throws(() => checkCourse({ COURSE: "X", TEACHERS: [] }, "x"), /TEACHERS/);
  assert.throws(() => checkCourse({ COURSE: "X", TEACHERS: ["a@b"], VOCAB: ["Jazz"] }, "x"), /unknown group/);
  assert.throws(() => checkCourse({ COURSE: "X", TEACHERS: ["a@b"], ACCESS: "PUBLIC" }, "x"), /ACCESS/);
  assert.throws(() => checkCourse({ COURSE: "X", TEACHERS: ["a@b"], EXAMPLE: "bach" }, "x"), /EXAMPLE/);
  assert.doesNotThrow(() => checkCourse({ COURSE: "X", TEACHERS: ["a@b"], VOCAB: ["Song form", { name: "Fugue", words: ["Subject"] }] }, "x"));
});

test("page code may not contain :// (Apps Script would cut the line)", () => {
  assert.throws(() => checkPageCode("x", "a\nconst u = 'https://x';"), /line 2/);
  assert.doesNotThrow(() => checkPageCode("x", "const u = 'https:\\/\\/x';"));
});

for (const c of courses) test(`builds ${c}`, () => {
  const r = build(c);
  const html = fs.readFileSync(path.join(r.gas, "Index.html"), "utf8");
  const course = JSON.parse(fs.readFileSync(path.join(root, `courses/${c}.json`), "utf8"));
  assert.ok(!html.includes("@@"), "every placeholder is filled");
  assert.ok(html.indexOf("const CONFIG") < html.indexOf("const LOOKS"), "config loads before looks");
  assert.ok(!/Submit to your instructor|Student submissions/.test(html), "the page has no Submit or Submissions");
  for (const t of themeIds().slice(1)) assert.ok(html.includes(`:root[data-skin="${t}"]`), t);
  const manifest = JSON.parse(fs.readFileSync(path.join(r.gas, "appsscript.json"), "utf8"));
  assert.equal(manifest.webapp.access, course.ACCESS || "DOMAIN");
  assert.equal(manifest.webapp.executeAs, "USER_DEPLOYING");
  assert.ok(!fs.readFileSync(path.join(r.gas, "Config.js"), "utf8").includes("scriptId"), "IDs stay out of the page config");
});
