// Build one course: node scripts/build.mjs --course theory-example     (or --all for every file in courses/)
// Writes dist/<course>/appsscript/ (pushed to Apps Script with clasp) and dist/<course>/preview.html (open it in a
// browser; a stand-in plays the server, so Submit and Submissions work without saving anything).
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = p => fs.readFileSync(path.join(root, p), "utf8");
const arg = (name, d) => { const i = process.argv.indexOf("--" + name); return i > 0 ? process.argv[i + 1] : d; };

export const ACCESS = ["DOMAIN", "ANYONE", "ANYONE_ANONYMOUS", "MYSELF"];
const VOCAB_GROUPS = ["Song form", "Classical form", "Phrase and theme", "Production"];

// Theme ids: "studio" is the base look in styles.css; every other theme is src/client/themes/<id>.css.
export function themeIds() {
  return ["studio", ...fs.readdirSync(path.join(root, "src/client/themes")).filter(f => f.endsWith(".css")).map(f => f.slice(0, -4)).sort()];
}

// Scopes a theme's CSS to :root[data-skin="<id>"], so a theme is written as plain CSS but only applies when chosen.
// Handles rule lists, @media and @supports blocks (scoped inside), and @keyframes and @font-face (left as they are).
export function scopeCss(css, id) {
  const pre = `:root[data-skin="${id}"]`;
  css = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const scopeSel = sel => splitTop(sel, ",").map(s => {
    s = s.trim();
    if (!s) return s;
    if (/^:root\b/.test(s)) return pre + s.slice(5);
    if (/^html\b/.test(s)) return pre + s.slice(4);
    return pre + " " + s;
  }).join(",");
  let out = "", i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open < 0) { out += css.slice(i); break; }
    const head = css.slice(i, open).trim();
    const close = matchBrace(css, open);
    const body = css.slice(open + 1, close);
    if (/^@(media|supports|container)\b/.test(head)) out += `${head}{${scopeCss(body, id)}}\n`;
    else if (head.startsWith("@")) out += `${head}{${body}}\n`;
    else out += `${scopeSel(head)}{${body.trim().replace(/\s*\n\s*/g, " ")}}\n`;
    i = close + 1;
  }
  return out;
}
function matchBrace(s, open) {
  let depth = 0;
  for (let j = open; j < s.length; j++) {
    if (s[j] === "{") depth++;
    else if (s[j] === "}" && --depth === 0) return j;
  }
  throw new Error("Unbalanced braces in theme CSS");
}
function splitTop(s, sep) {
  const parts = []; let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (ch === sep && depth === 0) { parts.push(cur); cur = ""; } else cur += ch;
  }
  parts.push(cur);
  return parts;
}

export function checkCourse(course, file) {
  const errs = [], themes = themeIds();
  if (!course.COURSE) errs.push("COURSE (the course name) is missing");
  if (!Array.isArray(course.TEACHERS) || !course.TEACHERS.length) errs.push("TEACHERS needs at least one instructor email");
  if (course.ACCESS && !ACCESS.includes(course.ACCESS)) errs.push(`ACCESS must be one of ${ACCESS.join(", ")}`);
  const allowed = course.THEMES || themes;
  for (const t of allowed) if (!themes.includes(t)) errs.push(`THEMES: unknown theme "${t}" (known: ${themes.join(", ")})`);
  if (course.THEME && !allowed.includes(course.THEME)) errs.push(`THEME "${course.THEME}" must be one of THEMES`);
  for (const v of course.VOCAB || []) {
    if (typeof v === "string" && !VOCAB_GROUPS.includes(v)) errs.push(`VOCAB: unknown group "${v}" (known: ${VOCAB_GROUPS.join(", ")}, or {"name", "words"})`);
    if (typeof v === "object" && !(v && v.name && Array.isArray(v.words))) errs.push(`VOCAB: a custom group needs "name" and "words"`);
  }
  if (errs.length) throw new Error(`${file}:\n  ` + errs.join("\n  "));
}

// Apps Script's page server can read "//" inside a string as a comment and cut the rest of the line, which breaks
// the whole script. Page code must write URLs as "https:\/\/...". (Theory Lab found this the hard way.)
export function checkPageCode(name, src) {
  if (src.includes("</script")) throw new Error(`${name} must not contain </script`);
  const bad = src.split("\n").findIndex(l => /:\/\//.test(l));
  if (bad >= 0) throw new Error(`${name} line ${bad + 1} contains "://"; write it as ":\\/\\/"`);
}

export function build(courseId) {
  const course = JSON.parse(read(`courses/${courseId}.json`));
  checkCourse(course, `courses/${courseId}.json`);
  const pkg = JSON.parse(read("package.json"));
  let sha = "dev";
  try { sha = execSync("git rev-parse --short HEAD", { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch (e) {}
  const { id, scriptId, deploymentId, ...cfg } = course;
  cfg.VERSION = `${pkg.version}+${sha}`;
  const configJs = `// Generated from courses/${courseId}.json by scripts/build.mjs. Do not edit here.\nconst CONFIG = ${JSON.stringify(cfg, null, 2)};\n`;
  checkPageCode("course config", configJs);

  const themeCss = themeIds().slice(1).map(t => `/* ---- theme: ${t} ---- */\n` + scopeCss(read(`src/client/themes/${t}.css`), t)).join("\n");
  const styles = read("src/client/styles.css") + "\n" + themeCss;
  const looks = read("src/client/looks.js");
  const page = ["course.js", "app.js"].map(f => `// ---- ${f} ----\n` + read("src/client/" + f)).join("\n");
  const mock = read("src/client/preview-mock.js");
  for (const [n, s] of [["looks.js", looks], ["page code", page], ["preview-mock.js", mock]]) checkPageCode(n, s);
  const ids = [...looks.matchAll(/\{id: '([a-z]+)'/g)].map(m => m[1]).sort().join();
  if (ids !== themeIds().slice().sort().join()) throw new Error(`looks.js lists themes ${ids}, but the theme files are ${themeIds().join()}`);

  const shell = read("src/client/shell.html").replace("/*@@STYLES@@*/", () => styles);
  const head = `<script>${configJs}</script>\n<script>\n${looks}</script>`;
  const html = scripts => shell.replace("<!--@@HEAD@@-->", () => head).replace("<!--@@SCRIPTS@@-->", () => scripts);

  const out = path.join(root, "dist", courseId), gas = path.join(out, "appsscript");
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(gas, { recursive: true });
  fs.writeFileSync(path.join(gas, "Config.js"), configJs);
  fs.writeFileSync(path.join(gas, "Code.js"), read("src/server/Code.js"));
  const manifest = JSON.parse(read("src/server/appsscript.json"));
  manifest.webapp.access = course.ACCESS || "DOMAIN";
  fs.writeFileSync(path.join(gas, "appsscript.json"), JSON.stringify(manifest, null, 2) + "\n");
  fs.writeFileSync(path.join(gas, "Index.html"), html(`<script>\n${page}</script>`));
  if (scriptId) fs.writeFileSync(path.join(gas, ".clasp.json"), JSON.stringify({ scriptId, rootDir: "." }, null, 2) + "\n");
  fs.writeFileSync(path.join(out, "preview.html"), html(`<script>\n${mock}</script>\n<script>\n${page}</script>`));
  return { out, gas, scriptId, deploymentId, version: cfg.VERSION };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const ids = process.argv.includes("--all")
    ? fs.readdirSync(path.join(root, "courses")).filter(f => f.endsWith(".json")).map(f => f.slice(0, -5))
    : [arg("course", "theory-example")];
  for (const c of ids) {
    const r = build(c);
    console.log(`Built ${c} (${r.version})`);
    console.log(`  Apps Script: ${path.relative(root, r.gas)}/  ${r.scriptId ? "" : "(no scriptId yet; see docs/DEPLOY.md)"}`);
    console.log(`  Preview:     ${path.relative(root, path.join(r.out, "preview.html"))}`);
  }
}
