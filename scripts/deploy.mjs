// Deploy one course to its Apps Script project: npm run deploy -- --course theory-example
// Requires: npx clasp login (once), and scriptId set in courses/<course>.json.
// With deploymentId set, the course's existing web app URL is updated in place, so links in your course site keep working.
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { build } from "./build.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const arg = (name, d) => { const i = process.argv.indexOf("--" + name); return i > 0 ? process.argv[i + 1] : d; };
const courseId = arg("course", "");
if (!courseId) { console.error("Name the course: npm run deploy -- --course <id> (a file in courses/)"); process.exit(1); }

const run = (cmd, cwd = root) => { console.log("$ " + cmd); execSync(cmd, { cwd, stdio: "inherit" }); };
run("npm test");
const r = build(courseId);
if (!r.scriptId) { console.error(`courses/${courseId}.json has no scriptId. See docs/DEPLOY.md.`); process.exit(1); }
run("npx clasp push -f", r.gas);
const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
if (r.deploymentId) run(`npx clasp update-deployment ${r.deploymentId} -d "v${version}"`, r.gas);
else console.log("\nPushed. No deploymentId yet: create the web app deployment once in the Apps Script editor (docs/DEPLOY.md), then add its ID to the course file.");
