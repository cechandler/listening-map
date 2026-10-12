# Themes

A theme is one CSS file in `src/client/themes/<id>.css` plus an entry in `LOOKS` in `src/client/looks.js`. The base look (Studio) is `src/client/styles.css`.

## How a theme works
- Write the file as plain CSS, as if it were the only stylesheet after `styles.css`. The build scopes every rule to `:root[data-skin="<id>"]`, so `.btn { ... }` becomes `:root[data-skin="keycap"] .btn { ... }` and `:root { ... }` becomes `:root[data-skin="keycap"] { ... }`. `@media` blocks are scoped inside; `@keyframes` are left alone.
- Start with the color tokens on `:root` (`--bg`, `--surface`, `--surface-2`, `--line`, `--fg`, `--muted`, `--accent`, `--focus`, `--wave`, `--grid`, `--mk`, the ten block colors `--c-rose` to `--c-slate`, and the fonts `--display`, `--ui`, `--mono`). Most of the page follows from these.
- Give dark mode the same tokens twice, as `styles.css` does: once under `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ... } }` (System) and once under `:root[data-theme="dark"]` (Dark chosen).
- Then restyle elements: `.btn`, `.btn.pri`, `.play`, `.readout`, `.card`, `.transport`, `.tl`, `.menu` and `.mi` (the Settings menu), `.chip`, `kbd`, and on the timeline `.lab` (lane names), `.sp` (blocks; `--cc` is the block's color), `.mk-g` (marker glyphs), `.is` (instrument entries; their texture is drawn in `::before` with `--tx` as the ink), `.ph` (playhead); also `.bigclock`, `.addb` (the add buttons on the Audio lane), `.mv` (reorder arrows), and `.cmpill` (comment titles as pills).
- Change looks only. Don't hide controls or change row heights the page measures (the ruler and marker rows).

## Register it
Add an entry to `LOOKS` in `src/client/looks.js`: `id` (the file name), `name`, `blurb`, `fonts` (the Google Fonts `family=` part of the URL), and `light`/`dark` swatches (five colors: page, panel, accent, second color, ink) for its card in the theme picker (Settings → Theme). The build stops if the list and the files don't match.

Then name it in a course's `THEMES` (and `THEME` to make it the default), and run `npm test` and `npm run test:ui`. The browser test applies every theme in light and dark and saves screenshots to `dist/screens/`.
