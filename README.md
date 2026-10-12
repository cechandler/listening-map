# Listening Map

A browser tool for analyzing recorded music on a timeline. Students map form in nested levels, mark cadences and other moments, track when instruments enter and exit, and write commentary tied to timestamps. Analyses export as a `.listening-map.json` file that can be imported back into the tool.

Each course gets its own **Google Apps Script web app**, the same way Theory Lab is set up: its own Google Sheet and its own settings (name, instructors, label vocabulary, default theme, example analysis). Students export their analysis (**Settings → Export analysis**) and hand in the `.json` file; instructors open it with **Settings → Import analysis**. The page is no longer hosted on the personal website.

## Sources
- **Audio file** from the student's computer (nothing is uploaded; the exported analysis holds only the file's name)
- **YouTube link**

## Workflow
1. Load audio or a YouTube link (**Source**, at the right of the transport).
2. While listening, press `S` at each boundary to split the active lane (the level, or instrument, you selected last).
3. Select neighboring blocks (`Shift` + click) and press `G` to group them on the level above, or `J` to join them into one.
4. Label blocks, mark them auxiliary or elided (or set the label at the block's right end), add markers (`M`) and instrument lanes. To mark instruments while listening, press `1`–`9` to pick one, then `E` when it enters and `X` when it exits. Label suggestions start with **Letters** (A–F, W–Z, a–f, w–z), then **Recent** (labels you used lately, kept on your device), then the course's groups.
5. Export the analysis (**Settings → Export analysis**) and hand in the `.json` file.

**Settings** (top right) holds the Examples, Import analysis, Export analysis, the theme, and the keyboard shortcuts. **Piece and grid** (title, composer, analyst, notes, and the measure grid) sits above the transport and folds away; the page remembers whether it is folded.

Add a level or an instrument from the **Audio** lane's name (levels go above it, instruments below). Reorder levels and instruments with the arrows on their lane names or **Move up**/**Move down** in the inspector. Undo is `⌘Z` (`Ctrl+Z` on Windows), and **Big clock** (`C`) shows a large time readout for the room. **Comments** can be narrowed to some levels, the markers, or some instruments, and shown with color dots or with each title in a colored pill.

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
| `score` | Engraved paper for theory: serif headings, ruled lanes, and blocks drawn as analysis brackets. |
| `chalk` | The classroom board: hand-lettered labels and marker strokes; a whiteboard in light, a chalkboard in dark. |

Adding a theme: see [docs/THEMES.md](docs/THEMES.md).

## Courses
One file per course in `courses/`. Two examples are included: `theory-example.json` (Keycap by default, classical form and phrase vocabulary, cadence chips) and `musictech-example.json` (Tape deck by default, song form and production vocabulary, production marker chips). Copy one for each offering.

| Setting | What it does |
|---|---|
| `id`, `scriptId`, `deploymentId` | The course's file name and its Apps Script project (see [docs/DEPLOY.md](docs/DEPLOY.md)). |
| `COURSE` | The name shown on the page. |
| `TEACHERS` | Instructor emails, kept by the course's Apps Script server. |
| `ACCESS` | Who can open the web app: `DOMAIN` (your school, the default), `ANYONE` (any Google account), `ANYONE_ANONYMOUS` (no sign-in), `MYSELF`. |
| `THEME`, `THEMES` | The default theme, and the themes students may choose from. |
| `VOCAB` | Label suggestion groups: `Letters`, `Song form`, `Classical form`, `Phrase and theme`, `Production`, or your own `{"name": "Fugue", "words": ["Subject", "Answer", "Episode"]}`. `Letters` (A to F and W to Z, in capitals and lowercase) always comes first unless the course lists it somewhere else. |
| `MARKER_CHIPS` | Quick labels for markers (for example `PAC`, `HC`, or `Drop`, `Riser`). |
| `LEVEL_NAMES` | Names for new levels, bottom up (for example `Phrases`, `Sections`, `Large form`). |
| `EXAMPLE` | The example analysis shown when the page opens: `demo` (a short generated track, the default) or `k545` (Mozart, Piano Sonata in C, K. 545, first movement, from a score-synced YouTube video). Both are under **Settings → Examples**. |
| `WELCOME` | Optional text for the banner over the example analysis. |

## Layout
```
src/client/shell.html     The page markup.
src/client/styles.css     Layout and the Studio look.
src/client/themes/*.css   One file per theme, written as plain CSS; the build scopes each to :root[data-skin="<id>"].
src/client/looks.js       Theme and light/dark choice (runs in <head>).
src/client/app.js         The timeline, editing, playback, gestures, files.
src/server/Code.js        Apps Script server: serves the page. (It still has the submission functions, which the page no longer calls.)
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

The feature set is modeled on Brian Edward Jarvis's BriFormer.
