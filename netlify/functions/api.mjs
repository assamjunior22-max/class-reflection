// Class Reflection 2026 - API (Netlify Function + Netlify Blobs)
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getStore } from "@netlify/blobs";
import DEF from "./form_def.mjs";

export const config = { path: "/api/*" };

// ------------------------------------------------------------------ storage
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function retry(fn, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) { try { return await fn(); } catch (e) { last = e; if (i < tries - 1) await sleep(250 * (i + 1)); } }
  throw last;
}
function makeStore() {
  const dir = process.env.LOCAL_STORE_DIR;
  if (dir) {
    // local testing only: file-based stand-in for Netlify Blobs
    fs.mkdirSync(dir, { recursive: true });
    const f = (k) => path.join(dir, encodeURIComponent(k) + ".json");
    return {
      kind: "local",
      async get(k) { try { return JSON.parse(fs.readFileSync(f(k), "utf8")); } catch { return null; } },
      async setJSON(k, v) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(f(k), JSON.stringify(v)); },
      async list({ prefix = "" } = {}) {
        return { blobs: fs.readdirSync(dir).map((n) => decodeURIComponent(n.replace(/\.json$/, ""))).filter((k) => k.startsWith(prefix)).map((key) => ({ key })) };
      },
    };
  }
  const s = getStore({ name: "reflection2026", consistency: "strong" });
  return {
    kind: "netlify-blobs",
    get: (k) => retry(() => s.get(k, { type: "json" })),
    setJSON: (k, v) => retry(() => s.setJSON(k, v)),
    list: (o) => retry(() => s.list(o)),
  };
}
const store = makeStore();

// -------------------------------------------------------------- class setup
const LEVEL_FORM = { Creche: "kg", PP1: "kg", PP2: "kg", 1: "lp", 2: "lp", 3: "lp" };
function defaultLevels() {
  const early = [["Creche", ["Magenta", "Orchid"]], ["PP1", ["Magenta", "Orchid", "Cameo"]], ["PP2", ["Magenta", "Orchid", "Cameo", "Amaranth"]],
    ["1", ["Magenta", "Orchid", "Cameo", "Amaranth"]], ["2", ["Magenta", "Orchid", "Cameo"]], ["3", ["Magenta", "Orchid", "Cameo"]]];
  const rest = Object.entries(DEF.streams).map(([g, ss]) => [g, ss]);
  return [...early, ...rest].map(([id, streams]) => ({ id: String(id), form: LEVEL_FORM[id] || "gr", streams }));
}
let _cfg, _cfgAt = 0;
async function loadConfig(force) {
  if (!force && _cfg && Date.now() - _cfgAt < 5000) return _cfg;
  let c = await store.get("config/classes");
  if (!c) { c = { levels: defaultLevels() }; await store.setJSON("config/classes", c); }
  _cfg = c; _cfgAt = Date.now(); return c;
}
const levelOf = (cfg, id) => cfg.levels.find((l) => l.id === id);
const classOk = (cfg, level, stream) => !!levelOf(cfg, level)?.streams.includes(stream);
const norm = (t) => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/grade/g, "").replace(/\bg(?=\d)/g, "").replace(/[^a-z0-9]/g, "");
function parseClass(cfg, t) {
  const n = norm(t);
  if (!n) return null;
  for (const l of cfg.levels) for (const s of l.streams) if (norm(l.id + s) === n) return `${l.id} ${s}`;
  return null;
}

// -------------------------------------------------------------- form model
const NB = DEF.partB.length, ND = DEF.partD.length, NE = DEF.partE.length, NF = DEF.partF.length, NG = DEF.partG.length;
const A_KEYS = ["teacher", "subjects", "roll_start", "roll_end", "present", "date"];
const bandFor = (level) => { const n = Number(level); return Object.values(DEF.bands).find((b) => b.grades.includes(n)) || DEF.bands.C3; };

function knownKeys(form, level) {
  const k = [];
  if (form === "gr") {
    const b = bandFor(level);
    A_KEYS.forEach((x) => k.push(`A.${x}`));
    for (let i = 0; i < NB; i++) k.push(`B.${i}`);
    for (let i = 0; i < b.questions.length; i++) k.push(`C.${i}.summary`, `C.${i}.count`);
    for (let i = 0; i < ND; i++) for (let j = 0; j < 4; j++) k.push(`D.${i}.${j}`);
    for (let i = 0; i < NE; i++) k.push(`E.${i}`);
    for (let i = 0; i < NF; i++) k.push(`F.${i}`);
    for (let i = 0; i < NG; i++) k.push(`G.${i}.rating`, `G.${i}.comment`);
    for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) k.push(`H1.${i}.${j}`); for (let j = 0; j < 5; j++) k.push(`H2.${i}.${j}`); }
    k.push("I.declaration", "I.date");
  } else {
    k.push("A.teacher", "A.roll", "P.by");
    for (const s of DEF.forms[form].sections) s.rows.forEach((_, i) => (s.kind === "list" ? k.push(`S${s.num}.${i}.0`, `S${s.num}.${i}.1`) : k.push(`S${s.num}.${i}`)));
  }
  return new Set(k);
}
const num = (x) => { const s = String(x ?? "").trim().replace(/,/g, ""); if (s === "") return null; const n = Number(s); return Number.isFinite(n) ? n : null; };

function validateNarrative(form, d) {
  const err = [], f = DEF.forms[form], blank = (k) => !String(d[k] ?? "").trim();
  if (blank("A.teacher")) err.push(`1. GENERAL INFORMATION: ${f.general[2]} is missing.`);
  const roll = num(d["A.roll"]);
  if (roll === null || roll < 0 || !Number.isInteger(roll)) err.push(`1. GENERAL INFORMATION: ${f.general[3]} must be a whole number.`);
  for (const s of f.sections) s.rows.forEach((r, i) => {
    if (s.kind === "list") {
      if (i === 0 && (blank(`S${s.num}.0.0`) || blank(`S${s.num}.0.1`))) err.push(`${s.num}. ${s.title}: row 1 needs both ${s.cols[0]} and ${s.cols[1]}.`);
      else if (i > 0 && (blank(`S${s.num}.${i}.0`) !== blank(`S${s.num}.${i}.1`))) err.push(`${s.num}. ${s.title}: row ${i + 1} is half filled.`);
    } else if (blank(`S${s.num}.${i}`)) err.push(`${s.num}. ${s.title}: "${r}" is empty (write N/A if it does not apply).`);
  });
  if (blank("P.by")) err.push("Prepared by: name is missing.");
  return err;
}
function validate(form, level, d) {
  if (form !== "gr") return validateNarrative(form, d);
  const err = [], b = bandFor(level), blank = (k) => !String(d[k] ?? "").trim();
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
const now = () => new Date(Date.now() + 3 * 3600e3).toISOString().replace("T", " ").slice(0, 19); // Nairobi time
const b64 = (b) => Buffer.from(b).toString("base64url");
const hashPw = (pw, salt = crypto.randomBytes(16).toString("hex")) => ({ salt, hash: crypto.scryptSync(pw, salt, 32).toString("hex") });
const checkPw = (pw, u) => { if (!u.salt || !u.hash) return false; const h = crypto.scryptSync(pw, u.salt, 32), g = Buffer.from(u.hash, "hex"); return h.length === g.length && crypto.timingSafeEqual(h, g); };
const defaultPassword = (name) => { const f = (String(name).trim().split(/\s+/)[0] || "User").replace(/[^A-Za-z]/g, "") || "User"; return f.charAt(0).toUpperCase() + f.slice(1).toLowerCase() + "@123"; };

let _users, _usersAt = 0;
async function loadUsers(force) {
  if (!force && _users && Date.now() - _usersAt < 5000) return _users;
  let db = await store.get("users"), dirty = false;
  if (!db) { db = { next: 2, users: [{ id: 1, username: "admin", full_name: "Admin", role: "admin", active: true, classes: [], ...hashPw("Admin@123") }] }; dirty = true; }
  if (!db.secret) { db.secret = crypto.randomBytes(32).toString("hex"); dirty = true; }
  if (dirty) await store.setJSON("users", db);
  _users = db; _usersAt = Date.now(); return db;
}
async function saveUsers(db) { await store.setJSON("users", db); _users = db; _usersAt = Date.now(); }
const secretOf = (db) => process.env.SESSION_SECRET || db.secret;
const sign = (db, payload) => { const p = b64(JSON.stringify(payload)); return p + "." + crypto.createHmac("sha256", secretOf(db)).update(p).digest("base64url"); };
function verify(db, tok) {
  const [p, sig] = String(tok || "").split(".");
  if (!p || !sig) return null;
  const good = crypto.createHmac("sha256", secretOf(db)).update(p).digest("base64url");
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  try { const o = JSON.parse(Buffer.from(p, "base64url").toString()); return o.exp > Date.now() ? o : null; } catch { return null; }
}
const pub = (u) => ({ id: u.id, username: u.username, full_name: u.full_name, role: u.role, active: u.active, classes: u.classes });
function makeUsername(db, name) {
  const parts = name.toLowerCase().split(/\s+/).map((p) => p.replace(/[^a-z]/g, "")).filter(Boolean);
  const base = parts.length > 1 ? parts[0] + "." + parts[parts.length - 1] : parts[0] || "teacher";
  let u = base, n = 1;
  while (db.users.some((x) => x.username === u)) u = base + ++n;
  return u;
}
async function audit(who, action, level, stream, detail = "") {
  try {
    const ts = now();
    await store.setJSON(`a/${ts.replace(/[ :-]/g, "")}-${crypto.randomBytes(3).toString("hex")}`, { ts, who, action, grade: level, stream, detail });
  } catch (e) { console.error("audit failed", e); } // never block the real action
}

// ----------------------------------------------------------------- records
const rkey = (l, s) => `r/${l}-${s}`;
const getRec = async (l, s) => (await store.get(rkey(l, s))) || { level: l, stream: s, data: {}, status: "none", updated_at: null, updated_by: null, submitted_at: null };
async function allRecs() {
  const { blobs } = await store.list({ prefix: "r/" });
  const out = {};
  await Promise.all(blobs.map(async (b) => {
    const r = await store.get(b.key); if (!r) return;
    const level = String(r.level ?? r.grade); out[`${level}|${r.stream}`] = { ...r, level, grade: level };
  }));
  return out;
}
const hasData = (r) => r.status !== "none" && Object.values(r.data || {}).some((v) => String(v).trim());

// ------------------------------------------------------------------ router
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export default async (req) => {
  try {
    const url = new URL(req.url);
    const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
    const method = req.method;

    if (parts[0] === "health") {
      const out = { store: store.kind, node: process.version, time: now() };
      try { await store.setJSON("config/health", { t: Date.now() }); out.write = "ok"; await store.get("config/health"); out.read = "ok"; const db = await loadUsers(true); out.users = db.users.length; const c = await loadConfig(true); out.levels = c.levels.length; out.ok = true; }
      catch (e) { out.ok = false; out.error = `${e.name}: ${e.message}`; }
      return json(out, out.ok ? 200 : 500);
    }

    const body = method === "GET" ? {} : await req.json().catch(() => ({}));
    const db = await loadUsers();

    if (parts[0] === "login" && method === "POST") {
      const u = db.users.find((x) => x.active && x.username.toLowerCase() === String(body.username || "").trim().toLowerCase());
      if (!u || !checkPw(String(body.password || ""), u)) { await sleep(600); return json({ error: "Wrong username or password." }, 401); }
      return json({ token: sign(db, { uid: u.id, exp: Date.now() + 12 * 3600e3 }), user: pub(u), defaultAdminPw: u.role === "admin" && checkPw("Admin@123", u) });
    }

    const tok = verify(db, (req.headers.get("authorization") || "").replace(/^Bearer /, ""));
    const me = tok && db.users.find((u) => u.id === tok.uid && u.active);
    if (!me) return json({ error: "Please log in again." }, 401);
    const isAdmin = me.role === "admin";
    const cfg = await loadConfig();

    if (parts[0] === "me") return json({ user: pub(me), defaultAdminPw: isAdmin && checkPw("Admin@123", me), config: cfg });
    if (parts[0] === "config") return json({ config: cfg });

    if (parts[0] === "password" && method === "POST") {
      const fresh = await loadUsers(true), u = fresh.users.find((x) => x.id === me.id);
      if (!checkPw(String(body.old || ""), u)) return json({ error: "Current password is wrong." }, 400);
      if (String(body.new || "").length < 6) return json({ error: "New password must be at least 6 characters." }, 400);
      Object.assign(u, hashPw(body.new)); await saveUsers(fresh); return json({ ok: true });
    }

    if (parts[0] === "my") {
      const out = [];
      for (const c of me.classes) {
        const i = c.indexOf(" "), level = c.slice(0, i), stream = c.slice(i + 1);
        if (!classOk(cfg, level, stream)) continue;
        const r = await getRec(level, stream);
        out.push({ level, grade: level, stream, form: levelOf(cfg, level).form, status: r.status, updated_at: r.updated_at, hasData: hasData(r) });
      }
      return json({ classes: out });
    }

    if (parts[0] === "reflection") {
      const level = parts[1], stream = parts[2];
      if (!classOk(cfg, level, stream)) return json({ error: "Class not found." }, 404);
      if (!isAdmin && !me.classes.includes(`${level} ${stream}`)) return json({ error: "Not your class." }, 403);
      const form = levelOf(cfg, level).form, rec = await getRec(level, stream);
      if (method === "GET") return json({ rec, form, editable: isAdmin || rec.status !== "submitted", teacherName: me.full_name });
      if (method === "PUT") {
        if (rec.status === "submitted" && !isAdmin) return json({ ok: false, errors: ["This reflection is already submitted. Ask the super admin to reopen it."] }, 409);
        const keys = knownKeys(form, level), data = {};
        for (const [k, v] of Object.entries(body.data || {})) if (keys.has(k)) data[k] = String(v).slice(0, 4000).trim();
        let status = rec.status === "none" ? "draft" : rec.status, errors = [];
        if (body.submit) { errors = validate(form, level, data); if (!errors.length) status = "submitted"; }
        const justSubmitted = status === "submitted" && rec.status !== "submitted";
        const next = { level, stream, data, status, updated_at: now(), updated_by: me.username, submitted_at: justSubmitted ? now() : rec.submitted_at };
        await store.setJSON(rkey(level, stream), next);
        await audit(me.username, justSubmitted ? "submitted" : isAdmin ? "admin edit" : "saved", level, stream);
        if (body.submit && errors.length) return json({ ok: false, saved: true, errors, status, at: next.updated_at });
        return json({ ok: true, status, at: next.updated_at, submitted: status === "submitted" });
      }
    }

    // ---- admin
    if (parts[0] === "admin") {
      if (!isAdmin) return json({ error: "Admin only." }, 403);
      if (parts[1] === "all") return json({ records: await allRecs(), users: db.users.map(pub), config: cfg });
      if (parts[1] === "audit") {
        const { blobs } = await store.list({ prefix: "a/" });
        const keys = blobs.map((b) => b.key).sort().reverse().slice(0, 300);
        return json({ rows: (await Promise.all(keys.map((k) => store.get(k)))).filter(Boolean) });
      }
      if (parts[1] === "reopen" && method === "POST") {
        const level = parts[2], s = parts[3]; if (!classOk(cfg, level, s)) return json({ error: "Class not found." }, 404);
        const r = await getRec(level, s); if (r.status === "none") return json({ ok: true });
        await store.setJSON(rkey(level, s), { ...r, status: "draft", submitted_at: null });
        await audit(me.username, "reopened", level, s); return json({ ok: true });
      }
      if (parts[1] === "classes" && method === "POST") {
        const c = await loadConfig(true), a = body.action, lv = levelOf(c, String(body.level || ""));
        const cleanName = (t) => String(t || "").trim().replace(/\s+/g, " ").replace(/^./, (x) => x.toUpperCase());
        let msg = "";
        if (a === "addStream") {
          const s = cleanName(body.stream);
          if (!lv) return json({ error: "Choose a class level." }, 400);
          if (!/^[A-Za-z][A-Za-z0-9 ]{1,24}$/.test(s)) return json({ error: "Stream name: letters and numbers only (2 to 25 characters)." }, 400);
          if (lv.streams.some((x) => x.toLowerCase() === s.toLowerCase())) return json({ error: `${s} already exists in that class.` }, 400);
          lv.streams.push(s); msg = `Added stream ${s} to ${lv.id}.`;
        } else if (a === "removeStream") {
          if (!lv || !lv.streams.includes(body.stream)) return json({ error: "Stream not found." }, 400);
          const r = await getRec(lv.id, body.stream);
          if (hasData(r)) return json({ error: `${lv.id} ${body.stream} already has saved reflection data, so it cannot be removed.` }, 400);
          if (db.users.some((u) => u.classes.includes(`${lv.id} ${body.stream}`))) return json({ error: "Unassign the teacher from this stream first (Teachers page)." }, 400);
          lv.streams = lv.streams.filter((x) => x !== body.stream); msg = `Removed ${lv.id} ${body.stream}.`;
        } else if (a === "addLevel") {
          const id = cleanName(body.id);
          if (!/^[A-Za-z0-9][A-Za-z0-9 ]{0,19}$/.test(id) || c.levels.some((l) => l.id.toLowerCase() === id.toLowerCase())) return json({ error: "Enter a new level name (for example 10 or PP3)." }, 400);
          if (!["kg", "lp", "gr"].includes(body.form)) return json({ error: "Choose which form this level uses." }, 400);
          c.levels.push({ id, form: body.form, streams: [] }); msg = `Added level ${id}.`;
        } else return json({ error: "Unknown action." }, 400);
        await store.setJSON("config/classes", c); _cfg = c; _cfgAt = Date.now();
        await audit(me.username, "classes: " + a, null, null, msg);
        return json({ ok: true, msg, config: c });
      }
      if (parts[1] === "users" && method === "POST") {
        const fresh = await loadUsers(true), find = () => fresh.users.find((u) => u.id === Number(body.uid) && u.role === "teacher");
        const a = body.action; let msg = "";
        if (a === "add") {
          const name = String(body.full_name || "").trim(); if (!name) return json({ error: "Enter the teacher's full name." }, 400);
          const uname = String(body.username || "").trim().toLowerCase() || makeUsername(fresh, name);
          if (fresh.users.some((u) => u.username === uname)) return json({ error: `Username '${uname}' is already taken.` }, 400);
          fresh.users.push({ id: fresh.next++, username: uname, full_name: name, role: "teacher", active: true, classes: [...new Set((body.classes || []).map((c) => parseClass(cfg, c)).filter(Boolean))], ...hashPw(defaultPassword(name)) });
          msg = `Added ${name}. Username: ${uname}  Password: ${defaultPassword(name)}`;
        } else if (a === "assign") { const u = find(), c = parseClass(cfg, body.cls); if (u && c && !u.classes.includes(c)) u.classes.push(c); }
        else if (a === "unassign") { const u = find(); if (u) u.classes = u.classes.filter((c) => c !== body.cls); }
        else if (a === "reset") { const u = find(); if (u) { Object.assign(u, hashPw(defaultPassword(u.full_name))); msg = `Password for ${u.full_name} reset to ${defaultPassword(u.full_name)}`; } }
        else if (a === "toggle") { const u = find(); if (u) u.active = !u.active; }
        else if (a === "import") {
          let added = 0, assigned = 0, skipped = 0;
          for (const r of body.rows || []) {
            const name = String(r.name || "").trim(); if (!name) continue;
            const c = parseClass(cfg, r.cls || "");
            let u = fresh.users.find((x) => x.role === "teacher" && x.full_name.toLowerCase() === name.toLowerCase());
            if (!u) {
              let un = String(r.username || "").trim().toLowerCase();
              if (!un || fresh.users.some((x) => x.username === un)) un = makeUsername(fresh, name);
              u = { id: fresh.next++, username: un, full_name: name, role: "teacher", active: true, classes: [], ...hashPw(defaultPassword(name)) }; fresh.users.push(u); added++;
            }
            if (c) { if (!u.classes.includes(c)) u.classes.push(c); assigned++; } else skipped++;
          }
          msg = `Import done: ${added} teachers added, ${assigned} class assignments made, ${skipped} rows with an unreadable class.`;
        } else return json({ error: "Unknown action." }, 400);
        await saveUsers(fresh); await audit(me.username, "users: " + a, null, null, msg);
        return json({ ok: true, msg, users: fresh.users.map(pub) });
      }
    }
    return json({ error: "Not found." }, 404);
  } catch (e) {
    console.error("API error", e);
    return json({ error: "Server error. Please try again.", detail: `${e?.name || "Error"}: ${e?.message || e}` }, 500);
  }
};
