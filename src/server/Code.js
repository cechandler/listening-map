/* Listening Map server (Apps Script, V8). One project per course, bound to that course's Google Sheet.
   CONFIG comes from courses/<id>.json (Config.js, written by scripts/build.mjs).
   - Students sign in with their school Google account and submit analyses. Each submission is saved as a
     .listening-map.json file in the course's Drive folder and logged as a row on the Submissions tab.
   - Instructors (CONFIG.TEACHERS) list submissions and open any of them in the page.
   - The Assignments tab lists what students can submit for; a "no" in its Open column closes one.
   The web app runs as the instructor, so every read of a Drive file is checked against the Submissions tab:
   nobody can open a file through this server that isn't a submission they are allowed to see. */

const SUB_HEAD = ["Submitted", "Email", "Name", "Assignment", "Title", "Composer", "Source", "Blocks", "Markers", "Comments", "File", "File ID"];
const MAX_JSON = 2 * 1024 * 1024;

function doGet() {
  return HtmlService.createHtmlOutputFromFile("Index")
    .setTitle(CONFIG.COURSE ? "Listening Map · " + CONFIG.COURSE : "Listening Map")
    .addMetaTag("viewport", "width=device-width, initial-scale=1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ---------- identity ---------- */
function email_() {
  try { return String(Session.getActiveUser().getEmail() || "").toLowerCase(); } catch (e) { return ""; }
}
function isTeacher_(em) {
  return !!em && (CONFIG.TEACHERS || []).map(x => String(x).toLowerCase()).indexOf(em) >= 0;
}

/* ---------- sheets ---------- */
function ss_() {
  const id = PropertiesService.getScriptProperties().getProperty("SHEET_ID");
  if (id) return SpreadsheetApp.openById(id);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("SETUP: The course isn't set up yet. Ask your instructor to run setup.");
  return ss;
}
function subSheet_() {
  const ss = ss_();
  let sh = ss.getSheetByName("Submissions");
  if (!sh) sh = ss.insertSheet("Submissions");
  if (sh.getLastRow() === 0) { sh.appendRow(SUB_HEAD); sh.setFrozenRows(1); sh.getRange(1, 1, 1, SUB_HEAD.length).setFontWeight("bold"); }
  return sh;
}
// Rows as objects, keyed by header (columns may be moved or added; headers must stay as they are).
function subRows_() {
  const sh = subSheet_(), n = sh.getLastRow() - 1;
  if (n < 1) return [];
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const col = name => head.indexOf(name);
  const need = ["Submitted", "Email", "File ID"].filter(h => col(h) < 0);
  if (need.length) throw new Error("SHEET: The Submissions tab is missing the " + need.join(", ") + " column.");
  return sh.getRange(2, 1, n, head.length).getValues().map(r => {
    const g = name => col(name) >= 0 ? r[col(name)] : "";
    const when = g("Submitted");
    return {
      id: String(g("File ID")), when: when instanceof Date ? when.toISOString() : String(when), email: String(g("Email")).toLowerCase(),
      name: String(g("Name")), assignment: String(g("Assignment")), title: String(g("Title")), composer: String(g("Composer")),
      source: String(g("Source")), blocks: Number(g("Blocks")) || 0, markers: Number(g("Markers")) || 0, comments: Number(g("Comments")) || 0
    };
  }).filter(r => r.id && r.email);
}
function openAssignments_() {
  const sh = ss_().getSheetByName("Assignments");
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues()
    .filter(([title, open]) => String(title).trim() && !/^(no|false|closed|n)$/i.test(String(open).trim()))
    .map(([title]) => String(title).trim());
}
function folder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty("FOLDER_ID");
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  throw new Error("SETUP: The course's submissions folder is missing. Ask your instructor to run setup.");
}

/* ---------- called from the page ---------- */
function getSession() {
  const em = email_();
  const mine = em ? subRows_().filter(r => r.email === em).reverse().slice(0, 20).map(r => ({ id: r.id, when: r.when, assignment: r.assignment, title: r.title })) : [];
  return {
    course: CONFIG.COURSE || "", email: em, name: "", teacher: isTeacher_(em),
    canSubmit: CONFIG.SUBMIT !== false && !!em, assignments: openAssignments_(), mine: mine
  };
}

function submitAnalysis(p) {
  const em = email_();
  if (!em) throw new Error("SIGNIN: Sign in with your school Google account to submit.");
  if (CONFIG.SUBMIT === false) throw new Error("CLOSED: Submissions are turned off for this course.");
  const json = String((p && p.json) || "");
  if (json.length > MAX_JSON) throw new Error("SIZE: This analysis is too large to submit (over 2 MB).");
  let d;
  try { d = JSON.parse(json); } catch (e) { throw new Error("FORMAT: That isn't a Listening Map analysis."); }
  if (!d || d.app !== "listening-map" || !Array.isArray(d.tiers) || !d.source) throw new Error("FORMAT: That isn't a Listening Map analysis.");
  if (d.source.type === "demo" || d.source.example) throw new Error("DEMO: Open your own audio or a YouTube link and make your analysis first.");
  const open = openAssignments_();
  let assignment = String((p && p.assignment) || "").trim();
  if (open.length && open.indexOf(assignment) < 0) throw new Error("ASSIGNMENT: That assignment isn't open for submissions.");
  if (!open.length) assignment = "";

  const meta = d.meta || {};
  const tiers = d.tiers.filter(Array.isArray), markers = Array.isArray(d.markers) ? d.markers : [];
  const comments = tiers.reduce((a, t) => a.concat(t), []).concat(markers).filter(x => x && x.comment).length
    + (Array.isArray(d.instruments) ? d.instruments.reduce((n, i) => n + (Array.isArray(i.spans) ? i.spans.filter(s => s && s.comment).length : 0), 0) : 0);
  const now = new Date();
  const slug = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  const stamp = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd_HHmm");
  const fname = [slug(meta.student) || slug(em.split("@")[0]), slug(assignment) || slug(meta.title) || "analysis", stamp].join("_") + ".listening-map.json";
  const file = folder_().createFile(fname, json, "application/json");
  const source = d.source.type === "youtube" ? "https:\/\/youtu.be/" + d.source.youtubeId : String(d.source.name || "");

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = subSheet_();
    const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    const vals = { "Submitted": now, "Email": em, "Name": String(meta.student || ""), "Assignment": assignment, "Title": String(meta.title || ""),
      "Composer": String(meta.composer || ""), "Source": source, "Blocks": tiers.reduce((n, t) => n + t.length, 0), "Markers": markers.length,
      "Comments": comments, "File": file.getUrl(), "File ID": file.getId() };
    sh.appendRow(head.map(h => Object.prototype.hasOwnProperty.call(vals, h) ? vals[h] : ""));
  } finally { lock.releaseLock(); }
  return { id: file.getId(), when: now.toISOString(), assignment: assignment, title: String(meta.title || "") };
}

function listSubmissions() {
  if (!isTeacher_(email_())) throw new Error("TEACHER: Only instructors can see submissions.");
  return subRows_().reverse().slice(0, 1000);
}

function getSubmission(id) {
  const em = email_();
  id = String(id || "");
  const row = subRows_().filter(r => r.id === id)[0];
  if (!row || !(isTeacher_(em) || (em && row.email === em))) throw new Error("NOTFOUND: That submission isn't available.");
  return DriveApp.getFileById(id).getBlob().getDataAsString();
}

/* ---------- run once from the editor ---------- */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("Open the course's Google Sheet, then Extensions > Apps Script, and run setup from there.");
  const props = PropertiesService.getScriptProperties();
  props.setProperty("SHEET_ID", ss.getId());
  subSheet_();
  let asg = ss.getSheetByName("Assignments");
  if (!asg) {
    asg = ss.insertSheet("Assignments");
    asg.appendRow(["Title", "Open"]);
    asg.setFrozenRows(1); asg.getRange(1, 1, 1, 2).setFontWeight("bold");
    asg.getRange("D1").setValue("One assignment per row. Students choose one when they submit. Type no in Open to stop taking submissions. With no rows, students submit without choosing.");
  }
  let folder = null;
  const id = props.getProperty("FOLDER_ID");
  if (id) { try { folder = DriveApp.getFolderById(id); } catch (e) { folder = null; } }
  if (!folder) {
    const parents = DriveApp.getFileById(ss.getId()).getParents();
    const parent = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
    folder = parent.createFolder("Listening Map submissions (" + (CONFIG.COURSE || ss.getName()) + ")");
    props.setProperty("FOLDER_ID", folder.getId());
  }
  return "Ready. Submissions go to the Drive folder \"" + folder.getName() + "\".";
}
