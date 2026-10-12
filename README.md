# Listening Map

A browser tool for analyzing recorded music on a timeline. Students map form in nested levels, mark cadences and other moments, track when instruments enter and exit, and write commentary tied to timestamps. Analyses export as a `.listening-map.json` file that can be imported back into the tool.

Each course gets its own **Google Apps Script web app**, the same way Theory Lab is set up: its own Google Sheet, its own Drive folder of submissions, and its own settings (name, instructors, label vocabulary, default theme). Students sign in with their school Google account and choose **Settings → Submit to your instructor**; instructors choose **Settings → Student submissions** to see every submission and open any of them on the timeline. The page is no longer hosted on the personal website.

## Sources
- **Audio file** from the student's computer (nothing is uploaded; only the analysis is submitted)
- **YouTube link**

## Workflow
1. Load audio or a YouTube link (**Source**, at the right of the transport).
2. While listening, press `S` at each boundary to split the active level.
3. Select neighboring blocks and press `G` to group them on the level above.
4. Label blocks, mark them auxiliary or elided, add markers (`M`) and instrument lanes. Label suggestions start with **Letters** (A–F, W–Z, a–f, w–z), then **Recent** (labels you used lately, kept on your device), then the course's groups.
5. **Submit to your instructor** (in a course; the dialog shows what will be sent), or export the analysis (**Settings → Export analysis**) and hand in the `.json` file.

**Settings** (top right) holds Import analysis, Export analysis, the theme, and the keyboard shortcuts. **Piece and grid** (title, composer, analyst, notes, and the measure grid) sits above the transport and folds away; the page remembers whether it is folded.

Color and texture sit beside the title of the inspector. Blocks take a color and a texture; each instrument takes a color and starts solid, and each of its entries can take its own texture (solid, stripes, dots, dashes, circles, lines, crosshatch, grid). Markers take their own color, or keep the theme's.

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
| `score` | Engraved paper for theory: serif headings, hairline rules, and blocks drawn as analysis brackets. |

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
| `LEVEL_NAMES` | Names for new levels, bottom up (for example `Phrases`, `Sections`, `Large form`). |
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
