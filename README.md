# Listening Map

A browser tool for analyzing recorded music on a timeline. Students map form in nested section lanes, mark cadences and other moments, note when tracks (instruments, voices, or production layers) enter and exit, and write commentary tied to timestamps. Analyses export as a `.listening-map.json` file that can be imported back into the tool.

Each course gets its own **Google Apps Script web app**, the same way Theory Lab is set up: its own Google Sheet, its own Drive folder of submissions, and its own settings (name, instructors, label vocabulary, default theme). Students sign in with their school Google account and choose **Settings → Submit to your instructor**; instructors choose **Settings → Student submissions** to see every submission and open any of them on the timeline. The page is no longer hosted on the personal website.

## Sources
- **Audio file** from the student's computer (nothing is uploaded; only the analysis is submitted)
- **YouTube link**

## Workflow
1. Load audio or a YouTube link (**Source**, at the right of the transport).
2. While listening, press `S` at each boundary to split the active lane (the section lane, or track, you selected last). The new block is selected, but the cursor stays where it was.
3. Select neighboring blocks (`Shift` + click) and press `G` to group them on the section lane above, or `J` to join them into one.
4. Label blocks, mark them auxiliary or elided (or add a second label at the block's right end, leading into the next block), add markers (`M`) and track lanes. To mark tracks while listening, press `1`–`9` to pick one, then `E` when it enters and `X` when it exits. Label suggestions start with **Letters** (A–F, W–Z, a–f, w–z), then **Recent** (labels you used lately, kept on your device), then the course's groups.
5. **Submit to your instructor** (in a course; the dialog shows what will be sent), or export the analysis (**Settings → Export analysis**) and hand in the `.json` file.

**Settings** (top right) holds Import analysis, Export analysis, the theme, and the keyboard shortcuts. **Piece and grid** (title, composer, analyst, notes, and the measure grid) sits above the transport and folds away; the page remembers whether it is folded.

Add a section lane or a track from the **Audio** lane's name (**Section** goes above it, **Track** below). Reorder section lanes and tracks with the arrows on their lane names or **Move up**/**Move down** in the inspector. Undo is `⌘Z` (`Ctrl+Z` on Windows), and **Big clock** (`C`) shows a large time readout for the room. **Fade out** (`F`) brings the sound down over 5 seconds, stops, and puts the volume back (audio files and YouTube alike); press `F` again to cancel. **Comments** can be narrowed to some section lanes, the markers, or some tracks, and each title sits in a colored pill.

**Present** hides the editing tools and adds the commentary at the playhead under the timeline, in type large enough to read across a room: one row for the section lanes (and any marker just passed), one for the tracks playing. Cards change as the playhead crosses into a new block or entry, and a long comment scrolls through as its block plays. The Comments filters apply to it too.

**Question? Problem? Make a suggestion** (at the foot of the page and in Settings) sends a message to the Feedback tab of the course's Sheet, with the sender's email.

Color and texture sit beside the title of the inspector. Blocks take a color and a texture; each track takes a color and starts solid, and each of its entries can take its own texture (solid, stripes, dots, dashes, circles, lines, crosshatch, grid). Markers take their own color, or keep the theme's.

## Zooming the timeline
- **Trackpad:** pinch over the timeline (Chrome, Edge, Firefox, and Safari). The moment under the pointer stays put.
- **Mouse:** hold `Ctrl` (`⌘` on Mac) and scroll. One wheel notch zooms like the `+` and `−` keys. `Shift` and scroll moves along the timeline.
- **Touchscreen:** pinch with two fingers.
- **Keys and buttons:** `+`, `−`, `0` (fit), and the Zoom buttons.

Zooming out stops at the whole piece in view.

## Themes
Students choose a theme under **Settings → Theme** (kept on their device) and Light, Dark, or System. The course file sets the default and which themes are offered.

| Theme | Look |
|---|---|
| `studio` | The original: quiet and clean. |
| `keycap` | Theory Lab's keycap design: warm paper, ink outlines, hard shadows, and red keys that press down. |
| `tapedeck` | Studio hardware for music technology: an LCD readout and blocks drawn as DAW clips. |
| `score` | Engraved paper for theory: serif headings, ruled lanes, and blocks drawn as analysis brackets. |
| `chalk` | The classroom board: hand-lettered labels and marker strokes; a whiteboard in light, a chalkboard in dark. |

Adding a theme: see [docs/THEMES.md](docs/THEMES.md).

## Courses
One file per course in `courses/`. Two examples are included: `theory-example.json` (Keycap by default, classical form and phrase vocabulary, cadence chips) and `musictech-example.json` (Tape deck by default, song form and production vocabulary, production marker chips). Copy one for each offering.

| Setting | What it does |
|---|---|
| `id`, `scriptId`, `deploymentId` | The course's file name and its Apps Script project (see [docs/DEPLOY.md](docs/DEPLOY.md)). |
| `COURSE` | The name shown on the page and on the submissions folder. |
| `TEACHERS` | Instructor emails. They see **Student submissions** in the Settings menu. |
| `ACCESS` | Who can open the web app: `DOMAIN` (your school, the default), `ANYONE` (any Google account), `ANYONE_ANONYMOUS` (no sign-in; submitting is then off), `MYSELF`. |
| `SUBMIT` | `false` hides Submit to your instructor; students export files instead. |
| `THEME`, `THEMES` | The default theme, and the themes students may choose from. |
| `VOCAB` | Label suggestion groups: `Letters`, `Song form`, `Classical form`, `Phrase and theme`, `Production`, or your own `{"name": "Fugue", "words": ["Subject", "Answer", "Episode"]}`. `Letters` (A to F and W to Z, in capitals and lowercase) always comes first unless the course lists it somewhere else. |
| `MARKER_CHIPS` | Quick labels for markers (for example `PAC`, `HC`, or `Drop`, `Riser`). |
| `LEVEL_NAMES` | Names for new section lanes, bottom up (for example `Phrases`, `Sections`, `Large form`). |
| `FEEDBACK_URL` | Optional `https:` or `mailto:` link for **Question? Problem? Make a suggestion** when the page isn't connected to a course (a plain file). In a course, messages go to the Sheet's Feedback tab instead. |
| `EXAMPLE` | The example analysis shown when the page opens: `demo` (a short generated track, the default) or `k545` (Mozart, Piano Sonata in C, K. 545, first movement, from a score-synced YouTube video). Both are under **Settings → Examples**. |
| `WELCOME` | Optional text for the banner over the example analysis. |

## Layout
```
src/client/shell.html     The page markup.
src/client/styles.css     Layout and the Studio look.
src/client/themes/*.css   One file per theme, written as plain CSS; the build scopes each to :root[data-skin="<id>"].
src/client/looks.js       Theme and light/dark choice (runs in <head>).
src/client/course.js      Submit, and the instructor's Submissions list (google.script.run).
src/client/app.js         The timeline, editing, playback, gestures, files.
src/client/preview-mock.js Stands in for the server in previews.
src/server/Code.js        Apps Script server: page, sign-in, submissions, setup.
courses/<id>.json         One file per course offering.
scripts/build.mjs         Builds dist/<id>/appsscript/ (pushed with clasp) and dist/<id>/preview.html.
scripts/deploy.mjs        Tests, builds, and pushes a course to Apps Script.
tests/                    Build and server tests (npm test) and a browser test (npm run test:ui).
```

## Working on it
```
npm install
npm test                                  # build and server tests
npm run build -- --course theory-example  # then open dist/theory-example/preview.html
npm run test:ui                           # browser test (set CHROMIUM_PATH if needed)
```
The preview has a stand-in server, so Submit and Submissions work there (nothing is saved). Add `?as=student` to its address for the student view.

The feature set is modeled on Brian Edward Jarvis's BriFormer.
