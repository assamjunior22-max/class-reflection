// Class Reflection 2026 - API (Netlify Function + Netlify Blobs)
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getStore } from "@netlify/blobs";
import DEF from "./form_def.mjs";

export const config = { path: "/api/*" };

// ------------------------------------------------------------------ storage
function makeStore() {
  const dir = process.env.LOCAL_STORE_DIR;
  if (dir) {
    // local testing only: file-based stand-in for Netlify Blobs
    fs.mkdirSync(dir, { recursive: true });
    const f = (k) => path.join(dir, encodeURIComponent(k) + ".json");
    return {
      async get(k) { try { return JSON.parse(fs.readFileSync(f(k), "utf8")); } catch { return null; } },
      async setJSON(k, v) { fs.writeFileSync(f(k), JSON.stringify(v)); },
      async list({ prefix = "" } = {}) {
        return { blobs: fs.readdirSync(dir).map((n) => decodeURIComponent(n.replace(/\.json$/, ""))).filter((k) => k.startsWith(prefix)).map((key) => ({ key })) };
      },
    };
  }
  const s = getStore({ name: "reflection2026", consistency: "strong" });
  return {
    get: (k) => s.get(k, { type: "json" }),
    setJSON: (k, v) => s.setJSON(k, v),
    list: (o) => s.list(o),
  };
}
const store = makeStore();

// -------------------------------------------------------------- form model
const CLASSES = Object.entries(DEF.streams).flatMap(([g, ss]) => ss.map((s) => [Number(g), s]));
const NB = DEF.partB.length, ND = DEF.partD.length, NE = DEF.partE.length, NF = DEF.partF.length, NG = DEF.partG.length;
const A_KEYS = ["teacher", "subjects", "roll_start", "roll_end", "present", "date"];
const bandFor = (g) => Object.values(DEF.bands).find((b) => b.grades.includes(Number(g)));
const classOk = (g, s) => (DEF.streams[String(g)] || []).includes(s);

function knownKeys(grade) {
  const b = bandFor(grade), k = A_KEYS.map((x) => `A.${x}`);
  for (let i = 0; i < NB; i++) k.push(`B.${i}`);
  for (let i = 0; i < b.questions.length; i++) k.push(`C.${i}.summary`, `C.${i}.count`);
  for (let i = 0; i < ND; i++) for (let j = 0; j < 4; j++) k.push(`D.${i}.${j}`);
  for (let i = 0; i < NE; i++) k.push(`E.${i}`);
  for (let i = 0; i < NF; i++) k.push(`F.${i}`);
  for (let i = 0; i < NG; i++) k.push(`G.${i}.rating`, `G.${i}.comment`);
  for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) k.push(`H1.${i}.${j}`); for (let j = 0; j < 5; j++) k.push(`H2.${i}.${j}`); }
  k.push("I.declaration", "I.date");
  return new Set(k);
}
const num = (x) => { const s = String(x ?? "").trim().replace(/,/g, ""); if (s === "") return null; const n = Number(s); return Number.isFinite(n) ? n : null; };

function validate(grade, d) {
  const err = [], b = bandFor(grade), blank = (k) => !String(d[k] ?? "").trim();
  if (blank("A.teacher")) err.push("Part A: teacher name is missing.");
  if (blank("A.subjects")) err.push("Part A: subject(s) taught is missing.");
  [["roll_start", "Learners on roll (start of year)"], ["roll_end", "Learners on roll (end of year)"], ["present", "Learners present at the session"]].forEach(([k, lab]) => {
    const v = num(d[`A.${k}`]); if (v === null || v < 0 || !Number.isInteger(v)) err.push(`Part A: '${lab}' must be a whole number.`);
  });
  if (blank("A.date")) err.push("Part A: date of session is missing.");
  const present = num(d["A.present"]), rollEnd = num(d["A.roll_end"]);
  if (present !== null && rollEnd !== null && present > rollEnd) err.push("Part A: learners present at the session cannot be more than learners on roll (end of year).");
  DEF.partB.forEach((lab, i) => {
    const k = `B.${i}`;
    if (i === 6) { if (blank(k)) err.push("Part B: awards or recognitions is empty (write 'None' if there were none)."); return; }
    const v = num(d[k]);
    if (v === null || v < 0) err.push(`Part B: '${lab}' needs a number (use 0 if none).`);
    else if (i === 0 && v > 100) err.push("Part B: average attendance cannot be more than 100%.");
  });
  b.questions.forEach((_, i) => { if (blank(`C.${i}.summary`)) err.push(`Part C: question ${i + 1} has no summary of what learners said.`); });
  DEF.partD.forEach((_, i) => {
    const raw = [0, 1, 2, 3].map((j) => String(d[`D.${i}.${j}`] ?? "").trim());
    if (raw.some((r) => r === "")) { err.push(`Part D: statement ${i + 1} needs all four counts (use 0 where none).`); return; }
    const tot = raw.reduce((a, r) => a + (num(r) || 0), 0);
    if (tot === 0) err.push(`Part D: statement ${i + 1} has no ratings.`);
    else if (present !== null && tot > present) err.push(`Part D: statement ${i + 1} has ${tot} ratings but only ${present} learners were present.`);
  });
  for (let i = 0; i < NE; i++) if (blank(`E.${i}`)) err.push(`Part E: item ${i + 1} is empty.`);
  for (let i = 0; i < NF; i++) if (blank(`F.${i}`)) err.push(`Part F: question ${i + 1} is empty.`);
  DEF.partG.forEach((a, i) => {
    const r = String(d[`G.${i}.rating`] ?? "").trim();
    if (!["1", "2", "3", "4"].includes(r)) err.push(`Part G: rating missing for '${a}'.`);
    else if ((r === "1" || r === "4") && blank(`G.${i}.comment`)) err.push(`Part G: a comment is needed for '${a}' because it is rated ${r}.`);
  });
  for (let i = 0; i < 3; i++) {
    if (blank(`H1.${i}.0`)) err.push(`Part H1: strength ${i + 1} is empty.`);
    if (blank(`H2.${i}.0`)) err.push(`Part H2: area for improvement ${i + 1} is empty.`);
    else if (blank(`H2.${i}.3`)) err.push(`Part H2: priority for improvement ${i + 1} is missing.`);
  }
  if (d["I.declaration"] !== "Yes") err.push("Part I: choose Yes in the declaration.");
  if (blank("I.date")) err.push("Part I: declaration date is missing.");
  return err;
}

// -------------------------------------------------------------------- auth
const now = () => { const d = new Date(Date.now() + 3 * 3600e3); return d.toISOString().replace("T", " ").slice(0, 19); }; // Nairobi time
const b64 = (b) => Buffer.from(b).toString("base64url");
let _secret;
async function secret() {
  if (_secret) return _secret;
  let s = await store.get("config/secret");
  if (!s) { s = { v: crypto.randomBytes(32).toString("hex") }; await store.setJSON("config/secret", s); s = (await store.get("config/secret")) || s; }
  return (_secret = s.v);
}
async function sign(payload) { const p = b64(JSON.stringify(payload)); return p + "." + crypto.createHmac("sha256", await secret()).update(p).digest("base64url"); }
async function verify(tok) {
  const [p, sig] = String(tok || "").split(".");
  if (!p || !sig) return null;
  const good = crypto.createHmac("sha256", await secret()).update(p).digest("base64url");
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  const o = JSON.parse(Buffer.from(p, "base64url").toString());
  return o.exp > Date.now() ? o : null;
}
const hashPw = (pw, salt = crypto.randomBytes(16).toString("hex")) => ({ salt, hash: crypto.scryptSync(pw, salt, 32).toString("hex") });
const checkPw = (pw, u) => { const h = crypto.scryptSync(pw, u.salt, 32), g = Buffer.from(u.hash, "hex"); return h.length === g.length && crypto.timingSafeEqual(h, g); };
const defaultPassword = (name) => { const f = (String(name).trim().split(/\s+/)[0] || "User").replace(/[^A-Za-z]/g, "") || "User"; return f.charAt(0).toUpperCase() + f.slice(1).toLowerCase() + "@123"; };

async function loadUsers() {
  let db = await store.get("users");
  if (!db) {
    db = { next: 2, users: [{ id: 1, username: "admin", full_name: "Admin", role: "admin", active: true, classes: [], ...hashPw("Admin@123") }] };
    await store.setJSON("users", db);
  }
  return db;
}
const saveUsers = (db) => store.setJSON("users", db);
const pub = (u) => ({ id: u.id, username: u.username, full_name: u.full_name, role: u.role, active: u.active, classes: u.classes });
function makeUsername(db, name) {
  const parts = name.toLowerCase().split(/\s+/).map((p) => p.replace(/[^a-z]/g, "")).filter(Boolean);
  const base = parts.length > 1 ? parts[0] + "." + parts[parts.length - 1] : parts[0] || "teacher";
  let u = base, n = 1;
  while (db.users.some((x) => x.username === u)) u = base + ++n;
  return u;
}
function parseClass(t) {
  const m = String(t).trim().match(/(\d+)[^A-Za-z]*([A-Za-z]+)\s*$/);
  if (!m) return null;
  const g = Number(m[1]), s = (DEF.streams[String(g)] || []).find((x) => x.toLowerCase() === m[2].toLowerCase());
  return s ? `${g} ${s}` : null;
}

async function audit(who, action, grade, stream, detail = "") {
  const ts = now();
  await store.setJSON(`a/${ts.replace(/[ :-]/g, "")}-${crypto.randomBytes(3).toString("hex")}`, { ts, who, action, grade, stream, detail });
}

// ----------------------------------------------------------------- records
const rkey = (g, s) => `r/${g}-${s}`;
const getRec = async (g, s) => (await store.get(rkey(g, s))) || { grade: g, stream: s, data: {}, status: "none", updated_at: null, updated_by: null, submitted_at: null };
async function allRecs() {
  const { blobs } = await store.list({ prefix: "r/" });
  const out = {};
  await Promise.all(blobs.map(async (b) => { const r = await store.get(b.key); if (r) out[`${r.grade}|${r.stream}`] = r; }));
  return out;
}

// ------------------------------------------------------------------ router
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export default async (req) => {
  try {
    const url = new URL(req.url);
    const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
    const method = req.method;
    const body = method === "GET" ? {} : await req.json().catch(() => ({}));
    const db = await loadUsers();

    if (parts[0] === "login" && method === "POST") {
      const u = db.users.find((x) => x.active && x.username.toLowerCase() === String(body.username || "").trim().toLowerCase());
      if (!u || !checkPw(String(body.password || ""), u)) { await new Promise((r) => setTimeout(r, 600)); return json({ error: "Wrong username or password." }, 401); }
      return json({ token: await sign({ uid: u.id, exp: Date.now() + 12 * 3600e3 }), user: pub(u), defaultAdminPw: u.role === "admin" && checkPw("Admin@123", u) });
    }

    const tok = await verify((req.headers.get("authorization") || "").replace(/^Bearer /, ""));
    const me = tok && db.users.find((u) => u.id === tok.uid && u.active);
    if (!me) return json({ error: "Please log in again." }, 401);
    const isAdmin = me.role === "admin";
    const needAdmin = () => (isAdmin ? null : json({ error: "Admin only." }, 403));

    if (parts[0] === "me") return json({ user: pub(me), defaultAdminPw: isAdmin && checkPw("Admin@123", me) });

    if (parts[0] === "password" && method === "POST") {
      if (!checkPw(String(body.old || ""), me)) return json({ error: "Current password is wrong." }, 400);
      if (String(body.new || "").length < 6) return json({ error: "New password must be at least 6 characters." }, 400);
      Object.assign(me, hashPw(body.new)); await saveUsers(db); return json({ ok: true });
    }

    if (parts[0] === "my") {
      const out = [];
      for (const c of me.classes) { const [g, s] = [Number(c.split(" ")[0]), c.split(" ")[1]]; const r = await getRec(g, s); out.push({ grade: g, stream: s, status: r.status, updated_at: r.updated_at, hasData: Object.values(r.data).some((v) => String(v).trim()) }); }
      return json({ classes: out });
    }

    if (parts[0] === "reflection") {
      const g = Number(parts[1]), s = parts[2];
      if (!classOk(g, s)) return json({ error: "Class not found." }, 404);
      if (!isAdmin && !me.classes.includes(`${g} ${s}`)) return json({ error: "Not your class." }, 403);
      const rec = await getRec(g, s);
      if (method === "GET") return json({ rec, editable: isAdmin || rec.status !== "submitted", teacherName: me.full_name });
      if (method === "PUT") {
        if (rec.status === "submitted" && !isAdmin) return json({ ok: false, errors: ["This reflection is already submitted. Ask the super admin to reopen it."] }, 409);
        const keys = knownKeys(g), data = {};
        for (const [k, v] of Object.entries(body.data || {})) if (keys.has(k)) data[k] = String(v).slice(0, 4000).trim();
        let status = rec.status === "none" ? "draft" : rec.status, errors = [];
        if (body.submit) { errors = validate(g, data); if (!errors.length) status = "submitted"; }
        const justSubmitted = status === "submitted" && rec.status !== "submitted";
        const next = { grade: g, stream: s, data, status, updated_at: now(), updated_by: me.username, submitted_at: justSubmitted ? now() : rec.submitted_at };
        await store.setJSON(rkey(g, s), next);
        await audit(me.username, justSubmitted ? "submitted" : isAdmin ? "admin edit" : "saved", g, s);
        if (body.submit && errors.length) return json({ ok: false, saved: true, errors, status, at: next.updated_at });
        return json({ ok: true, status, at: next.updated_at, submitted: status === "submitted" });
      }
    }

    // ---- admin
    if (parts[0] === "admin") {
      const deny = needAdmin(); if (deny) return deny;
      if (parts[1] === "all") return json({ records: await allRecs(), users: db.users.map(pub) });
      if (parts[1] === "audit") {
        const { blobs } = await store.list({ prefix: "a/" });
        const keys = blobs.map((b) => b.key).sort().reverse().slice(0, 300);
        return json({ rows: (await Promise.all(keys.map((k) => store.get(k)))).filter(Boolean) });
      }
      if (parts[1] === "reopen" && method === "POST") {
        const g = Number(parts[2]), s = parts[3]; if (!classOk(g, s)) return json({ error: "Class not found." }, 404);
        const r = await getRec(g, s); if (r.status === "none") return json({ ok: true });
        await store.setJSON(rkey(g, s), { ...r, status: "draft", submitted_at: null });
        await audit(me.username, "reopened", g, s); return json({ ok: true });
      }
      if (parts[1] === "users" && method === "POST") {
        const a = body.action, find = () => db.users.find((u) => u.id === Number(body.uid) && u.role === "teacher");
        let msg = "";
        if (a === "add") {
          const name = String(body.full_name || "").trim(); if (!name) return json({ error: "Enter the teacher's full name." }, 400);
          const uname = String(body.username || "").trim().toLowerCase() || makeUsername(db, name);
          if (db.users.some((u) => u.username === uname)) return json({ error: `Username '${uname}' is already taken.` }, 400);
          db.users.push({ id: db.next++, username: uname, full_name: name, role: "teacher", active: true, classes: [...new Set((body.classes || []).map(parseClass).filter(Boolean))], ...hashPw(defaultPassword(name)) });
          msg = `Added ${name}. Username: ${uname}  Password: ${defaultPassword(name)}`;
        } else if (a === "assign") { const u = find(), c = parseClass(body.cls); if (u && c && !u.classes.includes(c)) u.classes.push(c); }
        else if (a === "unassign") { const u = find(); if (u) u.classes = u.classes.filter((c) => c !== body.cls); }
        else if (a === "reset") { const u = find(); if (u) { Object.assign(u, hashPw(defaultPassword(u.full_name))); msg = `Password for ${u.full_name} reset to ${defaultPassword(u.full_name)}`; } }
        else if (a === "toggle") { const u = find(); if (u) u.active = !u.active; }
        else if (a === "import") {
          let added = 0, assigned = 0, skipped = 0;
          for (const r of body.rows || []) {
            const name = String(r.name || "").trim(); if (!name) continue;
            const c = parseClass(r.cls || `${r.grade} ${r.stream}`);
            let u = db.users.find((x) => x.role === "teacher" && x.full_name.toLowerCase() === name.toLowerCase());
            if (!u) {
              let un = String(r.username || "").trim().toLowerCase();
              if (!un || db.users.some((x) => x.username === un)) un = makeUsername(db, name);
              u = { id: db.next++, username: un, full_name: name, role: "teacher", active: true, classes: [], ...hashPw(defaultPassword(name)) }; db.users.push(u); added++;
            }
            if (c) { if (!u.classes.includes(c)) u.classes.push(c); assigned++; } else skipped++;
          }
          msg = `Import done: ${added} teachers added, ${assigned} class assignments made, ${skipped} rows with an unreadable class.`;
        } else return json({ error: "Unknown action." }, 400);
        await saveUsers(db); await audit(me.username, "users: " + a, null, null, msg);
        return json({ ok: true, msg, users: db.users.map(pub) });
      }
    }
    return json({ error: "Not found." }, 404);
  } catch (e) {
    console.error(e);
    return json({ error: "Server error. Please try again." }, 500);
  }
};
