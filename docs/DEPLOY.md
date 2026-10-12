# Deploying a course

Each course offering gets its own Google Sheet and Apps Script project in the instructor's school Google account, like Theory Lab. The code comes from this repo; don't edit it in the Apps Script editor, because the next deploy replaces it.

## One-time setup on your computer
1. Node.js 20 or newer.
2. `git clone https://github.com/cechandler/listening-map.git`, then `cd listening-map` and `npm install`.
3. Turn on the Apps Script API for your school account at https://script.google.com/home/usersettings.
4. `npx clasp login` and choose your school account. (If you already did this for Theory Lab, it's done.)

## Set up a course
1. In your school Google Drive, make a Google Sheet, for example "Listening Map, AMU 101 Fall 2026".
2. In the Sheet, **Extensions > Apps Script**. In **Project Settings** (gear), copy the **Script ID**.
3. Copy `courses/theory-example.json` (or `musictech-example.json`) to `courses/<id>.json`, for example `courses/amu101-fa26.json`, and set:
   - `id`: the same as the file name.
   - `scriptId`: the Script ID from step 2.
   - `COURSE`, `TEACHERS`, and anything else in the README's Courses table.
4. Push the code: `npm run deploy -- --course <id>`.
5. In the Apps Script editor, reload, choose `setup` in the function menu, and **Run**. Approve the permissions (the Sheet, Drive for the submissions folder, and your email). This makes the **Submissions** and **Assignments** tabs and a Drive folder named "Listening Map submissions (<course>)" next to the Sheet.
6. **Deploy > New deployment**, type **Web app**. The manifest already sets *Execute as: Me* and the access from `ACCESS`. Click **Deploy**, copy the **Web app URL** (for students) and the **Deployment ID**.
7. Put the Deployment ID in the course file as `deploymentId` and commit it. From now on `npm run deploy -- --course <id>` updates that same URL.
8. Link the Web app URL from your course site (Moodle, Canvas, Google Classroom, or a Google Site; it can also be embedded in a Google Site, since the page allows framing).

## Assignments

## Several courses
Repeat **Set up a course** for each one. Each has its own Sheet, folder, URL, and course file, so a theory section and a music technology section never see each other's work. `npm run build:all` builds every course; deploy each with its own `--course`.

## Who can open it
`ACCESS` in the course file sets this:
- `DOMAIN` (default): anyone signed in to your school's Google accounts.
- `ANYONE`: any Google account.
- `ANYONE_ANONYMOUS`: no sign-in at all.

Students hand in work by exporting the analysis (**Settings → Export analysis**) and sending you the `.json` file; open it with **Settings → Import analysis**.

## Moving off the personal website
The page used to be served from this repository's root `index.html` at christopherchandlermusic.com/listening-map/. That file is gone; the page is now built per course. To take the old address down completely, turn off GitHub Pages for this repository (**Settings > Pages > Build and deployment**: set Source to None, or unpublish). If the personal site links to the old page, point that link at a course's Web app URL or remove it.

## Things to check on the first deploy
- **YouTube** inside the Apps Script frame: load a YouTube link and press play. If a browser blocks it, the banner says so and students can use an audio file.
- **Export** inside the frame: some browsers block downloads from Apps Script pages without a message. After Export, the banner offers the text to copy into a file.
