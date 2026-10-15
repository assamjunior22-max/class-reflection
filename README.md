# End-of-Year Class Reflection 2026 (Netlify)
HTML/JS app in `public/`, API in `netlify/functions/api.mjs`, data in Netlify Blobs (built in, no setup, free plan is fine).

## Deploy (GitHub -> Netlify)
1. Create a new GitHub repository and upload everything in this folder (keep the folder structure).
2. Netlify -> Add new site -> Import from Git -> pick the repository. Leave build command empty. Publish directory `public` (already in netlify.toml). Deploy.
3. Open the site URL and log in as `admin` / `Admin@123`. Change that password first.
4. Teachers page: add or import teachers (Name, Grade, Stream). Teacher password = Firstname@123.
5. Share the site link with teachers. They can use it from home on any device.

## Notes
- Only the Netlify site stores the data (Netlify Blobs). Use "Download all responses (Excel)" regularly as a backup.
- Excel import/export loads a library from cdnjs, so those two buttons need internet.
- Wording of the form: edit `public/form_def.json`, then run `node sync-form.mjs` and commit both files.
- Local test (optional, needs Node 18+): `npm install` then `npm run dev` -> http://localhost:8888 (uses a local folder, not Netlify).
