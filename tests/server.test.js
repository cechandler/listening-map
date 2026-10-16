// Server tests: src/server/Code.js against small stand-ins for the Apps Script services.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function fakeSheet(name) {
  const rows = [];
  const sh = {
    name, rows,
    getLastRow: () => rows.length,
    getLastColumn: () => Math.max(0, ...rows.map(r => r.length)),
    appendRow: r => { rows.push(r.slice()); return sh; },
    setFrozenRows() {},
    getRange(r, c, nr = 1, nc = 1) {
      if (typeof r === "string") return { setValue() {} };
      return {
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (rows[r - 1 + i] || [])[c - 1 + j] ?? "")),
        setFontWeight() { return this; }
      };
    }
  };
  return sh;
}
function load({ email = "", teachers = ["prof@school.edu"], submit } = {}) {
  const sheets = {}, files = {}, props = {};
  let user = email, n = 0;
  const ss = {
    getId: () => "sheet1", getName: () => "Course sheet",
    getSheetByName: name => sheets[name] || null,
    insertSheet: name => (sheets[name] = fakeSheet(name))
  };
  const folder = {
    getId: () => "folder1", getName: () => "Submissions",
    createFile(name, text) { const id = "file" + (++n); files[id] = { name, text }; return { getId: () => id, getUrl: () => "drive/" + id }; },
    createFolder() { return folder; }
  };
  const ctx = {
    CONFIG: { COURSE: "Test course", TEACHERS: teachers, ...(submit === undefined ? {} : { SUBMIT: submit }) },
    Session: { getActiveUser: () => ({ getEmail: () => user }), getScriptTimeZone: () => "UTC" },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
    DriveApp: {
      getFolderById: () => folder, getRootFolder: () => folder,
      getFileById: id => {
        if (id === "sheet1") return { getParents: () => ({ hasNext: () => true, next: () => folder }) };
        if (!files[id]) throw new Error("no file");
        return { getBlob: () => ({ getDataAsString: () => files[id].text }) };
      }
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: { formatDate: () => "2026-10-10_1200" },
    HtmlService: {}
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(new URL("../src/server/Code.js", import.meta.url), "utf8"), ctx);
  return { ctx, sheets, files, as: e => { user = e; } };
}
const analysis = (o = {}) => JSON.stringify({ app: "listening-map", version: 1, meta: { title: "Song", composer: "Band", student: "Ada", notes: "" },
  source: { type: "youtube", youtubeId: "abcdefghijk", duration: 100 }, grid: {}, tierNames: ["Phrases"],
  tiers: [[{ id: "a", start: 0, end: 50, comment: "x" }, { id: "b", start: 50, end: 100, comment: "" }]], markers: [{ id: "m", time: 3, comment: "y" }], instruments: [], ...o });

test("setup makes the tabs and the folder", () => {
  const s = load({ email: "prof@school.edu" });
  assert.match(s.ctx.setup(), /Ready/);
  assert.ok(s.sheets.Submissions && s.sheets.Assignments);
  assert.equal(s.sheets.Submissions.rows[0][0], "Submitted");
});

test("a student submits; the row and file are written", () => {
  const s = load({ email: "ada@school.edu" });
  s.ctx.setup();
  const r = s.ctx.submitAnalysis({ assignment: "", json: analysis() });
  assert.ok(r.id && r.when);
  const row = s.sheets.Submissions.rows[1];
  assert.equal(row[1], "ada@school.edu");
  assert.equal(row[6], "https://youtu.be/abcdefghijk");
  assert.deepEqual([row[7], row[8], row[9]], [2, 1, 2]);
  assert.equal(s.files[r.id].text, analysis());
  assert.equal(s.ctx.getSession().mine.length, 1);
});

test("submissions need a signed-in user, a real analysis, and an open assignment", () => {
  const s = load({ email: "" });
  s.ctx.setup();
  assert.throws(() => s.ctx.submitAnalysis({ json: analysis() }), /SIGNIN/);
  s.as("ada@school.edu");
  assert.throws(() => s.ctx.submitAnalysis({ json: "{}" }), /FORMAT/);
  assert.throws(() => s.ctx.submitAnalysis({ json: analysis({ source: { type: "demo" } }) }), /DEMO/);
  assert.throws(() => s.ctx.submitAnalysis({ json: analysis({ source: { type: "youtube", youtubeId: "I_AX4R-d29o", example: true } }) }), /DEMO/);
  s.sheets.Assignments.appendRow(["Map 1", ""]); s.sheets.Assignments.appendRow(["Map 2", "no"]);
  assert.deepEqual(s.ctx.getSession().assignments, ["Map 1"]);
  assert.throws(() => s.ctx.submitAnalysis({ assignment: "Map 2", json: analysis() }), /ASSIGNMENT/);
  assert.equal(s.ctx.submitAnalysis({ assignment: "Map 1", json: analysis() }).assignment, "Map 1");
});

test("SUBMIT false turns submitting off", () => {
  const s = load({ email: "ada@school.edu", submit: false });
  s.ctx.setup();
  assert.equal(s.ctx.getSession().canSubmit, false);
  assert.throws(() => s.ctx.submitAnalysis({ json: analysis() }), /CLOSED/);
});

test("only instructors list submissions; students open only their own; nobody opens other Drive files", () => {
  const s = load({ email: "ada@school.edu" });
  s.ctx.setup();
  const mine = s.ctx.submitAnalysis({ json: analysis() }).id;
  s.as("bo@school.edu");
  const theirs = s.ctx.submitAnalysis({ json: analysis() }).id;
  assert.throws(() => s.ctx.listSubmissions(), /TEACHER/);
  assert.throws(() => s.ctx.getSubmission(mine), /NOTFOUND/);
  assert.equal(s.ctx.getSubmission(theirs), analysis());
  s.as("prof@school.edu");
  assert.equal(s.ctx.getSession().teacher, true);
  assert.equal(s.ctx.listSubmissions().length, 2);
  assert.equal(s.ctx.getSubmission(mine), analysis());
  s.files.secret = { text: "gradebook" };
  assert.throws(() => s.ctx.getSubmission("secret"), /NOTFOUND/);
});

test("feedback lands on the Feedback tab; an empty message is refused", () => {
  const s = load({ email: "ada@school.edu" });
  s.ctx.setup();
  assert.throws(() => s.ctx.sendFeedback({ kind: "Question", text: "  " }), /EMPTY/);
  assert.equal(s.ctx.sendFeedback({ kind: "Problem", text: "Play does nothing", piece: "Song, Band", browser: "UA" }).ok, true);
  s.ctx.sendFeedback({ kind: "Nonsense", text: "Hi" });
  const rows = s.sheets.Feedback.rows;
  assert.equal(rows[0][0], "Received");
  assert.deepEqual([...rows[1].slice(1)], ["ada@school.edu", "Problem", "Play does nothing", "Song, Band", "UA"]);
  assert.equal(rows[2][2], "Question", "an unknown kind is filed as a question");
});
