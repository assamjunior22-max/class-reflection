// Run after editing public/form_def.json:  node sync-form.mjs
import fs from "node:fs";
const j = fs.readFileSync("public/form_def.json", "utf8");
fs.writeFileSync("netlify/functions/form_def.mjs", "// generated from public/form_def.json by sync-form.mjs\nexport default " + j + ";\n");
