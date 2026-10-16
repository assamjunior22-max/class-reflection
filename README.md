# End-of-Year Class Reflection 2026 (Netlify)
HTML/JS app in `public/`, API in `netlify/functions/api.mjs`, data in Netlify Blobs (built in, no setup, free plan is fine).
Covers Creche, PP1, PP2 and Grades 1 to 9. Creche to PP2 use the Kindergarten form, Grades 1 to 3 the Lower Primary form, Grades 4 to 9 the class reflection (ratings) form.

## Deploy (GitHub -> Netlify)
1. Upload everything in this folder to your GitHub repository (replace the old files, keep the folder structure).
2. Netlify rebuilds automatically. Existing teachers, passwords and saved reflections are kept (they live in Netlify Blobs, not in the code).
3. Log in as `admin` / `Admin@123` (change it). Teacher password = Firstname@123.

## Adding streams or levels
Admin -> Classes. Add a stream to any level, or add a new level. A stream can be removed only while it has no saved reflection.

## If login ever shows "Server error"
Open `https://YOUR-SITE.netlify.app/api/health` in a browser. It reports whether storage reads and writes work and shows the exact error. The login screen also shows the error detail. In Netlify: Logs -> Functions -> api for the full log.

## Notes
- Download all responses (Excel) regularly as a backup. Excel import/export loads a library from cdnjs (needs internet).
- Logo: `public/logo.png`. Colours: variables at the top of `public/style.css`.
- Form wording: `public/form_def.json`; then run `node sync-form.mjs` and commit both files. `tools/extract_docx_forms.py` rebuilds the Kindergarten/Lower Primary forms from the Word files.
- Local test (Node 18+): `npm install`, `npm run dev`, open http://localhost:8888 (uses a local folder, not Netlify).
