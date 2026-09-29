# Listening Map

A browser tool for analyzing recorded music on a timeline. Students map form in nested levels, mark cadences and other moments, track when instruments enter and exit, and write commentary tied to timestamps. Analyses export as a `.listening-map.json` file that can be re-opened in the tool, plus a plain text report.

Open it at **https://cechandler.github.io/listening-map/**

## Sources
- **Audio file** from your computer (nothing is uploaded; the file stays in the browser)
- **YouTube link**

## Workflow
1. Load audio or a YouTube link.
2. While listening, press `S` at each boundary to split the active level.
3. Select neighboring blocks and press `G` to group them on the level above.
4. Label blocks, mark them auxiliary or elided, add markers (`M`) and instrument lanes.
5. Export the analysis and submit the `.json` file.

The feature set is modeled on Brian Edward Jarvis's BriFormer.
