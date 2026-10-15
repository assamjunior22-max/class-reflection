/* End-of-Year Class Reflection 2026 - front end (plain HTML/JS, talks to /api on Netlify) */
"use strict";
let DEF = null, TOKEN = null, USER = null, DEFAULT_ADMIN_PW = false;
try { TOKEN = localStorage.getItem("cr_token"); USER = JSON.parse(localStorage.getItem("cr_user") || "null"); } catch (e) {}
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (x) => { const s = String(x ?? "").trim().replace(/,/g, ""); if (s === "") return null; const n = Number(s); return Number.isFinite(n) ? n : null; };
const pct = (v) => (v === null || v === undefined ? "" : Math.round(v) + "%");
const f1 = (v) => (v === null || v === undefined ? "" : v.toFixed(1));
const lvl = (p) => (p === null || p === undefined ? "" : p >= 80 ? "hi" : p >= 60 ? "mid" : "lo");
const pillCls = (s) => s.replace(" ", "-");
const pwFor = (name) => { const f = (name.trim().split(/\s+/)[0] || "User").replace(/[^A-Za-z]/g, "") || "User"; return f[0].toUpperCase() + f.slice(1).toLowerCase() + "@123"; };
const nowStr = () => new Date().toLocaleString("en-GB");
const bandFor = (g) => Object.values(DEF.bands).find((b) => b.grades.includes(Number(g)));
const ALL_CLASSES = () => Object.entries(DEF.streams).flatMap(([g, ss]) => ss.map((s) => [Number(g), s]));
const ND = () => DEF.partD.length, NB = () => DEF.partB.length;

async function api(path, method = "GET", body) {
  const r = await fetch("/api/" + path, { method, headers: { "content-type": "application/json", ...(TOKEN ? { authorization: "Bearer " + TOKEN } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let j = {}; try { j = await r.json(); } catch (e) {}
  if (r.status === 401 && path !== "login") { logout(true); throw new Error("Please log in again."); }
  j._status = r.status; return j;
}
function logout(silent) { TOKEN = null; USER = null; try { localStorage.removeItem("cr_token"); localStorage.removeItem("cr_user"); } catch (e) {} if (!silent) location.hash = "#/login"; else location.hash = "#/login"; }

// ---------------------------------------------------------------- layout
let dirty = false, autosaveTimer = null;
function shell(content, banner = "", bannerCls = "") {
  const nav = USER ? `<nav><span class="who">${esc(USER.full_name)}${USER.role === "admin" ? " (Super Admin)" : ""}</span>${
    USER.role === "admin"
      ? `<a href="#/admin" class="${on("#/admin$")}">Dashboard</a><a href="#/admin/report" class="${on("#/admin/report")}">Analysed report</a><a href="#/admin/teachers" class="${on("#/admin/teachers")}">Teachers</a><a href="#/admin/audit">Activity</a>`
      : `<a href="#/home">My classes</a>`}<a href="#/account">Password</a><a href="#" id="logoutLink">Log out</a></nav>` : "";
  $("#app").innerHTML = `<div class="topbar noprint"><div class="brand">${esc(DEF.school)}<small>${esc(DEF.title)}</small></div>${nav}</div>${banner ? `<div class="banner ${bannerCls}">${banner}</div>` : ""}<main>${content}</main>`;
  const lo = $("#logoutLink"); if (lo) lo.onclick = (e) => { e.preventDefault(); logout(); };
}
function on(p) { return new RegExp(p).test(location.hash) ? "on" : ""; }
function flash(msg, kind = "ok") { const d = document.createElement("div"); d.className = "flash " + kind; d.textContent = msg; const m = $("main"); if (m) m.prepend(d); window.scrollTo(0, 0); }

// ---------------------------------------------------------------- router
async function route() {
  clearInterval(autosaveTimer); dirty = false; window.onbeforeunload = null;
  const h = location.hash || "#/home", [path, qs] = h.split("?"), q = new URLSearchParams(qs || ""), seg = path.replace(/^#\//, "").split("/").map(decodeURIComponent);
  if (!DEF) DEF = await (await fetch("form_def.json")).json();
  if (!TOKEN || !USER) return viewLogin();
  try {
    if (seg[0] === "login" || seg[0] === "") return (location.hash = USER.role === "admin" ? "#/admin" : "#/home");
    if (seg[0] === "home") return USER.role === "admin" ? (location.hash = "#/admin") : await viewHome();
    if (seg[0] === "account") return viewAccount();
    if (seg[0] === "form") return await viewForm(Number(seg[1]), seg[2]);
    if (seg[0] === "class-report") return await viewClassReport(Number(seg[1]), seg[2]);
    if (seg[0] === "admin") {
      if (USER.role !== "admin") return shell(`<div class="card"><h2>403</h2><p>You do not have access to this page.</p></div>`);
      if (!seg[1]) return await viewDash();
      if (seg[1] === "teachers") return await viewTeachers();
      if (seg[1] === "report") return await viewSchoolReport(q);
      if (seg[1] === "audit") return await viewAudit();
    }
    shell(`<div class="card"><h2>Page not found</h2><a class="btn" href="#/home">Back home</a></div>`);
  } catch (e) { shell(`<div class="card"><h2>Something went wrong</h2><p>${esc(e.message)}</p><a class="btn" href="#/home">Back</a></div>`); }
}
window.addEventListener("hashchange", route);
window.addEventListener("load", route);

// ---------------------------------------------------------------- login & account
function viewLogin() {
  const render = () => {
    shell(`<div class="login-box"><div class="card"><h2 style="margin-top:0;border:0">Log in</h2>
      <div id="loginErr"></div>
      <form id="lf"><p><label>Username</label><input name="username" autofocus autocomplete="username" required></p>
      <p><label>Password</label><input name="password" type="password" autocomplete="current-password" required></p>
      <button class="btn pink">Log in</button></form>
      <p class="muted">Your password is your first name followed by @123 (for example Brian@123) unless you have changed it. You can only open your own class.</p></div></div>`,
      `${esc(DEF.title)}<small>Class teachers: log in to complete your class reflection</small>`);
    $("#lf").onsubmit = async (e) => {
      e.preventDefault(); const f = new FormData(e.target), btn = $("#lf button"); btn.disabled = true;
      const r = await api("login", "POST", { username: f.get("username"), password: f.get("password") });
      btn.disabled = false;
      if (r.error) { $("#loginErr").innerHTML = `<div class="flash error">${esc(r.error)}</div>`; return; }
      TOKEN = r.token; USER = r.user; DEFAULT_ADMIN_PW = r.defaultAdminPw;
      try { localStorage.setItem("cr_token", TOKEN); localStorage.setItem("cr_user", JSON.stringify(USER)); } catch (e) {}
      location.hash = USER.role === "admin" ? "#/admin" : "#/home"; route();
    };
  };
  render();
}
function viewAccount() {
  shell(`<div class="card" style="max-width:420px"><h2 style="margin-top:0">Change password</h2><div id="pe"></div>
    <form id="pf"><p><label>Current password</label><input type="password" name="old" required></p>
    <p><label>New password</label><input type="password" name="new" required minlength="6"></p>
    <p><label>Repeat new password</label><input type="password" name="new2" required></p><button class="btn pink">Save</button></form></div>`);
  $("#pf").onsubmit = async (e) => {
    e.preventDefault(); const f = new FormData(e.target);
    if (f.get("new") !== f.get("new2")) return ($("#pe").innerHTML = `<div class="flash error">New passwords do not match.</div>`);
    const r = await api("password", "POST", { old: f.get("old"), new: f.get("new") });
    $("#pe").innerHTML = r.error ? `<div class="flash error">${esc(r.error)}</div>` : `<div class="flash ok">Password changed.</div>`;
    if (!r.error) { DEFAULT_ADMIN_PW = false; e.target.reset(); }
  };
}

// ---------------------------------------------------------------- teacher home
async function viewHome() {
  const r = await api("my"), cl = r.classes || [];
  const status = (c) => (c.status === "submitted" ? "Submitted" : c.status === "draft" && c.hasData ? "In progress" : "Not started");
  shell(!cl.length
    ? `<div class="card"><h3>No class assigned yet</h3><p>Your account is not linked to a class yet. Please ask the super admin to assign your stream.</p></div>`
    : `<h2 style="margin-top:0">Your class${cl.length > 1 ? "es" : ""}</h2><div class="classgrid">${cl.map((c) => { const s = status(c); return `<div class="classtile"><h3>Grade ${c.grade} ${esc(c.stream)}</h3>
      <p><span class="pill ${pillCls(s)}">${s}</span>${c.updated_at ? `<br><span class="muted">Last saved ${esc(c.updated_at)}</span>` : ""}</p>
      <a class="btn pink" href="#/form/${c.grade}/${c.stream}">${s === "Submitted" ? "View" : s === "In progress" ? "Continue" : "Start"}</a>
      ${s !== "Not started" ? `<a class="btn ghost" target="_blank" href="#/class-report/${c.grade}/${c.stream}">Print</a>` : ""}</div>`; }).join("")}</div>
    <div class="card" style="margin-top:18px"><h3>How it works</h3><ol>
      <li>Complete Parts A and B from your records before the class meeting.</li>
      <li>Hold the 1-hour class meeting (5 min welcome, 35 min Part C, 10 min Part D, 10 min wrap-up). Record Parts C and D.</li>
      <li>Complete Parts E to I afterwards, then choose <b>Yes</b> in Part I and press <b>Submit</b>.</li>
      <li>Use <b>Save draft</b> at any time and come back later. Do not name learners and do not record marks.</li></ol></div>`,
    `${esc(DEF.title)}<small>Reflect with your class, then record the results here. Only you can see and edit your own class.</small>`);
}

// ---------------------------------------------------------------- the form
const statusOf = (rec) => (rec.status === "submitted" ? "Submitted" : rec.status === "draft" && Object.values(rec.data || {}).some((v) => String(v).trim()) ? "In progress" : "Not started");
async function viewForm(grade, stream) {
  const r = await api(`reflection/${grade}/${encodeURIComponent(stream)}`);
  if (r.error) return shell(`<div class="card"><h2>${esc(r.error)}</h2><a class="btn" href="#/home">Back</a></div>`);
  const rec = r.rec, data = { ...rec.data }, editable = r.editable, isAdmin = USER.role === "admin", st = statusOf(rec), band = bandFor(grade);
  if (!data["A.teacher"] && !isAdmin) data["A.teacher"] = r.teacherName;
  const dis = editable ? "" : "disabled";
  const inp = (name, type = "text", opt = false, extra = "") => `<input name="${name}" type="${type}" value="${esc(data[name] || "")}" class="${opt ? "opt" : ""}" ${extra} ${dis}>`;
  const ta = (name, opt = false, rows = 3) => `<textarea name="${name}" rows="${rows}" class="${opt ? "opt" : ""}" ${dis}>${esc(data[name] || "")}</textarea>`;
  const sel = (name, opts) => `<select name="${name}" ${dis}><option value="">Choose</option>${opts.map((o) => `<option ${data[name] === o ? "selected" : ""}>${o}</option>`).join("")}</select>`;
  const tabsDef = [["A", "A Class"], ["B", "B Snapshot"], ["C", "C Learner voice"], ["D", "D Ratings"], ["E", "E Academics"], ["F", "F Teacher"], ["G", "G School rating"], ["H", "H Strengths & improvements"], ["I", "I Declaration"]];
  const A = DEF.partA;
  const html = `
  ${isAdmin ? `<div class="adminedit noprint">You are editing as <b>Super Admin</b>. Changes are logged. ${st === "Submitted" ? "This class is Submitted; saving keeps it Submitted." : ""} <a href="#/admin">Dashboard</a></div>`
    : st === "Submitted" ? `<div class="flash ok">This reflection has been <b>submitted</b> and is now locked. Contact the super admin if something must be corrected.</div>` : ""}
  <div class="note noprint">Class meeting: 1 hour (5 min welcome, 35 min Part C, 10 min Part D, 10 min wrap-up). Complete Parts A and B before the meeting and Parts E to I after it. Your answers are saved on the school system when you press <b>Save draft</b> or <b>Submit</b>. Do not name learners. Talk about behaviour and ideas, not individuals. Do not record marks or individual results.</div>
  <div class="tabs noprint" id="tabs">${tabsDef.map(([k, l], i) => `<button type="button" data-tab="${k}" class="${i === 0 ? "active" : ""}">${l}<span class="dot"></span></button>`).join("")}</div>
  <form id="rf" class="card ${editable ? "" : "readonly"}" onsubmit="return false">
  <section class="part active" data-part="A"><h2>A. Class information</h2><div class="fgrid">
    <div><label>Grade</label><div class="fixed">Grade ${grade}</div></div><div><label>Stream</label><div class="fixed">${esc(stream)}</div></div>
    <div><label>Teacher name</label>${inp("A.teacher")}</div><div><label>${A[0]}</label>${inp("A.subjects")}</div>
    <div><label>${A[1]}</label>${inp("A.roll_start", "number", false, 'min="0" step="1"')}</div><div><label>${A[2]}</label>${inp("A.roll_end", "number", false, 'min="0" step="1"')}</div>
    <div><label>${A[3]}</label>${inp("A.present", "number", false, 'min="0" step="1"')}</div><div><label>${A[4]}</label>${inp("A.date", "date")}</div></div></section>
  <section class="part" data-part="B"><h2>B. Class snapshot</h2><div class="note">Take these from your registers and records. Numbers only; do not name learners.</div><div class="fgrid">
    ${DEF.partB.map((lab, i) => `<div ${i === 6 ? 'class="full"' : ""}><label>${esc(lab)}</label>${i === 6 ? inp("B.6", "text", false, 'placeholder="Write None if there were none"') : i === 0 ? inp("B.0", "number", false, 'min="0" max="100" step="0.1"') : inp("B." + i, "number", false, 'min="0" step="1"')}</div>`).join("")}</div></section>
  <section class="part" data-part="C"><h2>C. Class Reflection Session and Learner Voice</h2><div class="note">${esc(DEF.partC_intro)}</div><h3>${esc(band.title)}</h3>
    <div class="note" style="background:#eaf7ef;border-color:#2e9e5e">${esc(band.tip)}</div>
    <table class="qtab"><tr><th>Question</th><th>What learners said (summary of responses)</th><th>Learners who shared this view (approx.)</th></tr>
    ${band.questions.map((q, i) => `<tr><td class="q">${esc(q)}</td><td>${ta(`C.${i}.summary`)}</td><td>${inp(`C.${i}.count`, "number", true, 'min="0" step="1" class="cnt"')}</td></tr>`).join("")}</table></section>
  <section class="part" data-part="D"><h2>D. Learner rating scale (number of learners per rating)</h2>
    <div class="note">${esc(DEF.scale_note)} Each row's total should not be more than the learners present at the session (<b id="presentShow">?</b>).</div>
    <table class="rate"><tr><th>Statement</th><th class="num">1</th><th class="num">2</th><th class="num">3</th><th class="num">4</th><th class="num">Total</th><th class="num">% agree (3 and 4)</th></tr>
    ${DEF.partD.map((s, i) => `<tr data-drow="${i}"><td style="background:#eaf7ef">${esc(s)}</td>${[0, 1, 2, 3].map((j) => `<td class="num">${inp(`D.${i}.${j}`, "number", false, 'min="0" step="1"')}</td>`).join("")}<td class="num pcol dtot"></td><td class="num pcol dpct"></td></tr>`).join("")}
    <tr><td><b>Overall % agree (all statements)</b></td><td colspan="5"></td><td class="num pcol" id="dall"></td></tr></table></section>
  <section class="part" data-part="E"><h2>E. Academics: the learning experience</h2><div class="note">${esc(DEF.partE_note)}</div>${DEF.partE.map((q, i) => `<p><label>${esc(q)}</label>${ta("E." + i, false, 4)}</p>`).join("")}</section>
  <section class="part" data-part="F"><h2>F. Teacher reflection</h2>${DEF.partF.map((q, i) => `<p><label>${esc(q)}</label>${ta("F." + i, false, 4)}</p>`).join("")}</section>
  <section class="part" data-part="G"><h2>G. School-wide rating</h2><div class="note">${esc(DEF.partG_note)}</div>
    <table><tr><th>Area</th><th style="width:130px">Rating (1 to 4)</th><th>Comment / evidence</th></tr>
    ${DEF.partG.map((a, i) => `<tr><td style="background:#eaf7ef">${esc(a)}</td><td>${sel(`G.${i}.rating`, ["1", "2", "3", "4"])}</td><td>${ta(`G.${i}.comment`, true, 2)}</td></tr>`).join("")}</table></section>
  <section class="part" data-part="H"><h2>H1. Top three strengths to celebrate</h2>
    <table><tr><th></th>${DEF.H1_cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>${[0, 1, 2].map((i) => `<tr><td class="num">${i + 1}</td>${[0, 1, 2].map((k) => `<td>${ta(`H1.${i}.${k}`, k > 0)}</td>`).join("")}</tr>`).join("")}</table>
    <h2>H2. Top three areas for improvement</h2>
    <table><tr><th></th>${DEF.H2_cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>${[0, 1, 2].map((i) => `<tr><td class="num">${i + 1}</td>${[0, 1, 2, 3, 4].map((k) => `<td>${k === 3 ? sel(`H2.${i}.3`, ["High", "Medium", "Low"]) : ta(`H2.${i}.${k}`, [1, 2, 4].includes(k))}</td>`).join("")}</tr>`).join("")}</table></section>
  <section class="part" data-part="I"><h2>I. Teacher declaration</h2><p>${esc(DEF.declaration)}</p>
    <div class="fgrid" style="max-width:520px"><div><label>Declaration</label>${sel("I.declaration", ["Yes", "No"])}</div><div><label>Date</label>${inp("I.date", "date")}</div></div>
    <div id="errbox" class="errbox" style="display:none"></div></section></form>
  ${editable ? `<div class="savebar noprint"><button class="btn ghost" id="prev" type="button">&larr; Back</button><button class="btn ghost" id="next" type="button">Next &rarr;</button>
      <button class="btn" id="saveBtn" type="button">Save draft</button>
      <button class="btn pink" id="submitBtn" type="button">${isAdmin ? (st === "Submitted" ? "Save changes" : "Save &amp; mark submitted") : "Submit"}</button><span class="msg" id="msg"></span></div>`
    : `<div class="savebar noprint"><a class="btn" target="_blank" href="#/class-report/${grade}/${stream}">Print this reflection</a><a class="btn ghost" href="#/home">Back</a></div>`}`;
  shell(html, `${esc(DEF.title)}: Grade ${grade} ${esc(stream)}<small>Status: <b id="statusText">${st}</b>${rec.updated_at ? " · last saved " + esc(rec.updated_at) : ""}</small>`, "noprint");

  const tabs = $$("#tabs button"), parts = $$(".part"); let cur = 0;
  const show = (i) => { cur = Math.max(0, Math.min(parts.length - 1, i)); tabs.forEach((t, k) => t.classList.toggle("active", k === cur)); parts.forEach((p, k) => p.classList.toggle("active", k === cur)); window.scrollTo({ top: 0, behavior: "smooth" }); };
  tabs.forEach((t, k) => (t.onclick = () => show(k)));
  if ($("#prev")) { $("#prev").onclick = () => show(cur - 1); $("#next").onclick = () => show(cur + 1); }
  const collect = () => { const d = {}; $$("#rf [name]").forEach((e) => (d[e.name] = e.value)); return d; };
  function recalc() {
    const present = num($('[name="A.present"]').value); $("#presentShow").textContent = present === null ? "?" : present;
    let T = 0, Ag = 0;
    $$("[data-drow]").forEach((tr) => {
      const v = [0, 1, 2, 3].map((j) => num($(`[name$=".${j}"]`, tr).value) || 0), t = v.reduce((a, b) => a + b, 0), ag = v[2] + v[3]; T += t; Ag += ag;
      $(".dtot", tr).textContent = t || ""; $(".dpct", tr).textContent = t ? Math.round((ag / t) * 100) + "%" : "";
      $(".dtot", tr).style.color = present !== null && t > present ? "#c0392b" : "";
    });
    $("#dall").textContent = T ? Math.round((Ag / T) * 100) + "%" : "";
    parts.forEach((p, k) => { const req = $$("[name]", p).filter((e) => !e.classList.contains("opt")); tabs[k].classList.toggle("done", req.length > 0 && req.every((e) => String(e.value).trim() !== "")); });
  }
  $$("#rf [name]").forEach((e) => { const f = () => { dirty = true; recalc(); }; e.addEventListener("input", f); e.addEventListener("change", f); });
  recalc();
  if (!editable) return;
  async function save(submit, quiet) {
    const msg = $("#msg"); if (!quiet) msg.textContent = "Saving…"; $("#errbox").style.display = "none";
    let j; try { j = await api(`reflection/${grade}/${encodeURIComponent(stream)}`, "PUT", { data: collect(), submit }); } catch (e) { msg.textContent = "Could not reach the server. Your answers are NOT saved yet; check the connection and try again."; return; }
    if (j._status === 409 || j._status === 403 || j.error) { msg.textContent = (j.errors && j.errors[0]) || j.error || "Could not save."; return; }
    dirty = false;
    if (j.errors && j.errors.length) {
      const b = $("#errbox"); b.style.display = "block";
      b.innerHTML = "<b>Your answers were saved as a draft, but cannot be submitted yet:</b><ul>" + j.errors.map((e) => `<li>${esc(e)}</li>`).join("") + "</ul>";
      show(parts.length - 1); msg.textContent = "Saved as draft. Please fix the items listed."; return;
    }
    $("#statusText").textContent = j.status === "submitted" ? "Submitted" : "In progress";
    msg.textContent = submit && j.submitted ? "Submitted. Thank you!" : "Saved at " + j.at.slice(11);
    if (submit && j.submitted) setTimeout(route, 900);
  }
  $("#saveBtn").onclick = () => save(false);
  $("#submitBtn").onclick = () => { if (isAdmin && st === "Submitted" ? true : confirm(isAdmin ? "Save and mark this class as submitted?" : "Submit your reflection? You will not be able to edit it afterwards.")) save(true); };
  autosaveTimer = setInterval(() => { if (dirty) save(false, true); }, 60000);
  window.onbeforeunload = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
}

// ---------------------------------------------------------------- metrics & analysis
const dCounts = (d, i) => [0, 1, 2, 3].map((j) => num(d[`D.${i}.${j}`]) || 0);
function metrics(d) {
  const agree = (rows) => { let t = 0, a = 0; rows.forEach((i) => { const c = dCounts(d, i); t += c[0] + c[1] + c[2] + c[3]; a += c[2] + c[3]; }); return t ? (a / t) * 100 : null; };
  return { attendance: num(d["B.0"]), whole_year: num(d["B.1"]), agree_all: agree([...Array(ND()).keys()]), agree_disc: agree([3, 4]), agree_resp: agree([8, 9]) };
}
let CACHE = null;
async function loadAll() { const r = await api("admin/all"); CACHE = r; return r; }
const teacherMap = (users) => { const m = {}; users.filter((u) => u.active && u.role === "teacher").forEach((u) => u.classes.forEach((c) => (m[c] = m[c] || []).push(u.full_name))); return m; };

// ---------------------------------------------------------------- admin dashboard
async function viewDash() {
  const { records, users } = await loadAll(), tm = teacherMap(users);
  const rows = ALL_CLASSES().map(([g, s]) => { const rec = records[`${g}|${s}`] || { status: "none", data: {} }; const as = (tm[`${g} ${s}`] || []).join(", ");
    return { grade: g, stream: s, rec, status: statusOf(rec), assigned: as, teacher: rec.data["A.teacher"] || as, m: metrics(rec.data), updated_at: rec.updated_at }; });
  const tot = { total: rows.length, sub: rows.filter((r) => r.status === "Submitted").length, inp: rows.filter((r) => r.status === "In progress").length, ns: rows.filter((r) => r.status === "Not started").length, un: rows.filter((r) => !r.assigned).length };
  const grades = [...new Set(rows.map((r) => r.grade))];
  const avg = (arr) => { const v = arr.filter((x) => x !== null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  shell(`${DEFAULT_ADMIN_PW ? `<div class="flash warn"><b>Change the super admin password.</b> It is still the default (Admin@123). <a href="#/account">Change it now</a>.</div>` : ""}
    ${tot.un ? `<div class="flash warn">${tot.un} class${tot.un > 1 ? "es have" : " has"} no teacher assigned yet. <a href="#/admin/teachers">Assign teachers</a>.</div>` : ""}
    <div class="stats"><div class="stat"><b>${tot.sub} / ${tot.total}</b><span>Submitted</span></div><div class="stat"><b>${tot.inp}</b><span>In progress</span></div><div class="stat"><b>${tot.ns}</b><span>Not started</span></div></div>
    <div class="row noprint" style="margin-bottom:12px"><a class="btn pink" href="#/admin/report">Open analysed report</a><button class="btn" id="xl">Download all responses (Excel)</button><a class="btn ghost" href="#/admin/teachers">Manage teachers</a></div>
    <h2>All classes</h2><table><tr><th>Grade</th><th>Stream</th><th>Teacher</th><th>Status</th><th class="num">Avg attendance (%)</th><th class="num">Present all year</th><th class="num">% agree: all</th><th class="num">% agree: discipline</th><th class="num">% agree: respect</th><th>Last saved</th><th></th></tr>
    ${rows.map((r) => `<tr><td>${r.grade}</td><td>${esc(r.stream)}</td><td>${esc(r.teacher) || "—"}</td><td><span class="pill ${pillCls(r.status)}">${r.status}</span></td>
      <td class="num">${f1(r.m.attendance)}</td><td class="num">${r.m.whole_year ?? ""}</td>
      <td class="num ${lvl(r.m.agree_all)}">${pct(r.m.agree_all)}</td><td class="num ${lvl(r.m.agree_disc)}">${pct(r.m.agree_disc)}</td><td class="num ${lvl(r.m.agree_resp)}">${pct(r.m.agree_resp)}</td>
      <td>${esc(r.updated_at || "")}</td><td style="white-space:nowrap"><a class="btn small" href="#/form/${r.grade}/${r.stream}">Open / edit</a>
      ${r.status !== "Not started" ? `<a class="btn small ghost" target="_blank" href="#/class-report/${r.grade}/${r.stream}">Print</a>` : ""}
      ${r.status === "Submitted" ? `<button class="btn small ghost" data-reopen="${r.grade}/${r.stream}">Reopen</button>` : ""}</td></tr>`).join("")}</table>
    <p class="legend muted">% agree colours: <span class="hi">80% and above</span><span class="mid">60 to 79%</span><span class="lo">below 60%</span></p>
    <h2>Summary by grade (submitted reflections only)</h2><table><tr><th>Grade</th><th class="num">Streams submitted</th><th class="num">Streams in grade</th><th class="num">In progress</th><th class="num">Avg attendance (%)</th><th class="num">Avg % agree: all</th><th class="num">Avg % agree: discipline</th><th class="num">Avg % agree: respect</th></tr>
    ${grades.map((g) => { const gr = rows.filter((r) => r.grade === g), sub = gr.filter((r) => r.status === "Submitted"); const a = (k) => avg(sub.map((r) => r.m[k]));
      return `<tr><td>${g}</td><td class="num">${sub.length}</td><td class="num">${gr.length}</td><td class="num">${gr.filter((r) => r.status === "In progress").length}</td><td class="num">${f1(a("attendance"))}</td>
      <td class="num ${lvl(a("agree_all"))}">${pct(a("agree_all"))}</td><td class="num ${lvl(a("agree_disc"))}">${pct(a("agree_disc"))}</td><td class="num ${lvl(a("agree_resp"))}">${pct(a("agree_resp"))}</td></tr>`; }).join("")}</table>`,
    `Management dashboard<small>Live view of every class. Open any class to read or edit it.</small>`);
  $("#xl").onclick = exportXlsx;
  $$("[data-reopen]").forEach((b) => (b.onclick = async () => { if (!confirm("Reopen this class so the teacher can edit it?")) return; const [g, s] = b.dataset.reopen.split("/"); await api(`admin/reopen/${g}/${s}`, "POST", {}); viewDash(); }));
}

// ---------------------------------------------------------------- teachers admin
async function viewTeachers(msg, kind) {
  const { users } = await loadAll(), ts = users.filter((u) => u.role === "teacher").sort((a, b) => a.full_name.localeCompare(b.full_name));
  const classes = ALL_CLASSES().map(([g, s]) => `${g} ${s}`);
  shell(`<div id="tmsg">${msg ? `<div class="flash ${kind || "ok"}">${esc(msg)}</div>` : ""}</div>
    <div class="row" style="align-items:stretch;gap:18px">
    <div class="card" style="flex:1;min-width:300px"><h3 style="margin-top:0">Add a teacher</h3><form id="addf">
      <p><label>Full name</label><input name="full_name" required placeholder="e.g. Jane Wanjiku"></p>
      <p><label>Username (optional; made from the name if left blank)</label><input name="username"></p>
      <p><label>Class(es) (hold Ctrl to choose more than one)</label><select name="classes" multiple size="7">${classes.map((c) => `<option>${c}</option>`).join("")}</select></p>
      <button class="btn pink">Add teacher</button></form></div>
    <div class="card" style="flex:1;min-width:300px"><h3 style="margin-top:0">Import many teachers</h3>
      <p class="muted">Upload an Excel or CSV file with the columns <b>Name</b>, <b>Grade</b>, <b>Stream</b> (one row per class; a teacher with two classes has two rows). <a href="#" id="tpl">Download a template</a>.</p>
      <p><input type="file" id="impf" accept=".xlsx,.csv"></p><button class="btn" id="impb">Import</button></div></div>
    <h2>Teachers (${ts.length})</h2><table><tr><th>Name</th><th>Username</th><th>Default password</th><th>Classes</th><th>Add class</th><th></th></tr>
    ${ts.map((u) => `<tr style="${u.active ? "" : "opacity:.55"}"><td>${esc(u.full_name)}${u.active ? "" : ' <span class="muted">(disabled)</span>'}</td><td>${esc(u.username)}</td><td class="muted">${esc(pwFor(u.full_name))} *</td>
      <td>${u.classes.map((c) => `<span class="pill" style="background:#e6e9f5;color:#0b1f4b">${c} <button data-un="${u.id}|${c}" title="Remove" style="border:0;background:none;cursor:pointer;color:#c0392b">&times;</button></span> `).join("") || '<span class="muted">none</span>'}</td>
      <td><select id="sel${u.id}" style="width:auto;padding:3px">${classes.map((c) => `<option>${c}</option>`).join("")}</select> <button class="btn small" data-as="${u.id}">Add</button></td>
      <td style="white-space:nowrap"><button class="btn small ghost" data-rs="${u.id}">Reset password</button> <button class="btn small ghost" data-tg="${u.id}">${u.active ? "Disable" : "Enable"}</button></td></tr>`).join("") || `<tr><td colspan="6" class="muted">No teachers yet. Add them above or import a list.</td></tr>`}</table>
    <p class="muted">* The password shown is the default. If a teacher changed theirs, "Reset password" returns it to the default.</p>`,
    `Teachers and class assignments<small>Each teacher password is their first name followed by @123 (for example Brian@123).</small>`);
  const act = async (body) => { const r = await api("admin/users", "POST", body); if (r.error) return viewTeachers(r.error, "error"); viewTeachers(r.msg); };
  $("#addf").onsubmit = (e) => { e.preventDefault(); const f = e.target; act({ action: "add", full_name: f.full_name.value, username: f.username.value, classes: [...f.classes.selectedOptions].map((o) => o.value) }); };
  $$("[data-un]").forEach((b) => (b.onclick = () => { const [uid, cls] = b.dataset.un.split("|"); act({ action: "unassign", uid, cls }); }));
  $$("[data-as]").forEach((b) => (b.onclick = () => act({ action: "assign", uid: b.dataset.as, cls: $("#sel" + b.dataset.as).value })));
  $$("[data-rs]").forEach((b) => (b.onclick = () => confirm("Reset this password to the default?") && act({ action: "reset", uid: b.dataset.rs })));
  $$("[data-tg]").forEach((b) => (b.onclick = () => act({ action: "toggle", uid: b.dataset.tg })));
  $("#tpl").onclick = (e) => { e.preventDefault(); download("teachers_template.csv", "Name,Grade,Stream\nJane Wanjiku,4,Orchid\nPeter Otieno,5,Magenta\n", "text/csv"); };
  $("#impb").onclick = async () => {
    const f = $("#impf").files[0]; if (!f) return flash("Choose a file first.", "error");
    let rows;
    try { if (/\.csv$/i.test(f.name)) rows = parseCsv(await f.text()); else { await loadXlsx(); const wb = XLSX.read(await f.arrayBuffer()); rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" }); } }
    catch (e) { return flash("Could not read that file.", "error"); }
    const head = (rows[0] || []).map((h) => String(h).trim().toLowerCase()), ix = (...n) => { for (const x of n) if (head.includes(x)) return head.indexOf(x); return -1; };
    const iN = ix("name", "teacher", "teacher name", "full name"), iG = ix("grade"), iS = ix("stream"), iC = ix("class", "tab"), iU = ix("username");
    if (iN < 0 || (iC < 0 && (iG < 0 || iS < 0))) return flash("Columns needed: Name, and either Grade + Stream or Class (for example '4 Orchid').", "error");
    act({ action: "import", rows: rows.slice(1).map((r) => ({ name: r[iN], cls: iC >= 0 ? r[iC] : `${r[iG]} ${r[iS]}`, username: iU >= 0 ? r[iU] : "" })) });
  };
}
function parseCsv(t) { return t.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split(",").map((c) => c.trim().replace(/^"|"$/g, ""))); }
function download(name, content, type) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([content], { type })); a.download = name; a.click(); }
function loadXlsx() { return window.XLSX ? Promise.resolve() : new Promise((res, rej) => { const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"; s.onload = res; s.onerror = () => rej(new Error("Could not load the Excel library (internet needed).")); document.head.appendChild(s); }); }

async function viewAudit() {
  const r = await api("admin/audit");
  shell(`<table><tr><th>Time</th><th>Who</th><th>Action</th><th>Class</th><th>Detail</th></tr>${(r.rows || []).map((x) => `<tr><td>${esc(x.ts)}</td><td>${esc(x.who)}</td><td>${esc(x.action)}</td><td>${x.grade ? x.grade + " " + esc(x.stream) : ""}</td><td>${esc(x.detail || "")}</td></tr>`).join("")}</table>`,
    `Activity log<small>Last 300 actions: saves, submissions, admin edits and changes to teachers.</small>`);
}

// ---------------------------------------------------------------- Excel export
async function exportXlsx() {
  try { await loadXlsx(); } catch (e) { return alert(e.message); }
  const { records, users } = CACHE || (await loadAll()), tm = teacherMap(users);
  const wb = XLSX.utils.book_new(), add = (name, aoa) => { const ws = XLSX.utils.aoa_to_sheet(aoa); ws["!cols"] = aoa[0].map((_, i) => ({ wch: i < 4 ? 12 : 30 })); XLSX.utils.book_append_sheet(wb, ws, name); };
  const all = ALL_CLASSES().map(([g, s]) => ({ g, s, rec: records[`${g}|${s}`] || { data: {}, status: "none" } }));
  const withData = all.filter((x) => x.rec.status !== "none");
  const base = (x) => [x.g, x.s, x.rec.data["A.teacher"] || "", statusOf(x.rec)], bh = ["Grade", "Stream", "Teacher", "Status"];
  const v = (d, k) => { const n = num(d[k]); return n !== null && /^\s*-?\d+(\.\d+)?\s*$/.test(d[k]) ? n : d[k] || ""; };
  add("Summary", [[...bh, "Subjects", "Roll start", "Roll end", "Present at session", "Session date", "Avg attendance (%)", "Present all year", "% agree: all", "% agree: discipline", "% agree: respect", "Submitted at", "Last updated"],
    ...all.map((x) => { const d = x.rec.data, m = metrics(d), r = (p) => (p === null ? "" : Math.round(p * 100) / 10000); return [...base(x), d["A.subjects"] || "", v(d, "A.roll_start"), v(d, "A.roll_end"), v(d, "A.present"), d["A.date"] || "", m.attendance ?? "", m.whole_year ?? "", r(m.agree_all), r(m.agree_disc), r(m.agree_resp), x.rec.submitted_at || "", x.rec.updated_at || ""]; })]);
  add("B Snapshot", [[...bh, ...DEF.partB], ...withData.map((x) => [...base(x), ...DEF.partB.map((_, i) => v(x.rec.data, "B." + i))])]);
  const dr = []; withData.forEach((x) => DEF.partD.forEach((st, i) => { const c = dCounts(x.rec.data, i), t = c.reduce((a, b) => a + b, 0); dr.push([...base(x), st, ...c, t, t ? (c[2] + c[3]) / t : ""]); }));
  add("D Ratings", [[...bh, "Statement", "1 Strongly disagree", "2 Disagree", "3 Agree", "4 Strongly agree", "Total", "% agree"], ...dr]);
  const cr = []; withData.forEach((x) => { const b = bandFor(x.g); b.questions.forEach((q, i) => cr.push([...base(x), b.title, q, x.rec.data[`C.${i}.summary`] || "", v(x.rec.data, `C.${i}.count`)])); });
  add("C Learner voice", [[...bh, "Version", "Question", "What learners said", "Approx. learners"], ...cr]);
  const er = []; withData.forEach((x) => { DEF.partE.forEach((q, i) => er.push([...base(x), "E", q, x.rec.data["E." + i] || ""])); DEF.partF.forEach((q, i) => er.push([...base(x), "F", q, x.rec.data["F." + i] || ""])); });
  add("E-F Academics & teacher", [[...bh, "Part", "Question", "Response"], ...er]);
  const gr = []; withData.forEach((x) => DEF.partG.forEach((a, i) => gr.push([...base(x), a, v(x.rec.data, `G.${i}.rating`), x.rec.data[`G.${i}.comment`] || ""])));
  add("G School rating", [[...bh, "Area", "Rating (1-4)", "Comment / evidence"], ...gr]);
  const h1 = [], h2 = []; withData.forEach((x) => [0, 1, 2].forEach((i) => { const d = x.rec.data;
    if (d[`H1.${i}.0`]) h1.push([...base(x), ...[0, 1, 2].map((k) => d[`H1.${i}.${k}`] || "")]); if (d[`H2.${i}.0`]) h2.push([...base(x), ...[0, 1, 2, 3, 4].map((k) => d[`H2.${i}.${k}`] || "")]); }));
  add("H1 Strengths", [[...bh, ...DEF.H1_cols], ...h1]); add("H2 Improvements", [[...bh, ...DEF.H2_cols], ...h2]);
  XLSX.writeFile(wb, `Class_Reflection_2026_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ---------------------------------------------------------------- reports
function analyse(records, gf, inc) {
  const recs = Object.values(records).filter((r) => (!gf || r.grade === gf) && (statusOf(r) === "Submitted" || (inc && statusOf(r) === "In progress")))
    .sort((a, b) => a.grade - b.grade || a.stream.localeCompare(b.stream));
  const grades = [...new Set(recs.map((r) => r.grade))].sort((a, b) => a - b), lab = (r) => `${r.grade} ${r.stream}`;
  const dTab = DEF.partD.map((label, i) => { const by = {}; let ta = 0, tt = 0;
    grades.forEach((g) => { let t = 0, a = 0; recs.filter((r) => r.grade === g).forEach((r) => { const c = dCounts(r.data, i); t += c[0] + c[1] + c[2] + c[3]; a += c[2] + c[3]; }); by[g] = t ? (a / t) * 100 : null; ta += a; tt += t; });
    return { label, by, all: tt ? (ta / tt) * 100 : null }; });
  const ranked = dTab.filter((r) => r.all !== null).sort((a, b) => a.all - b.all);
  const bIdx = [...Array(NB()).keys()].filter((i) => i > 0 && i !== 6), bLabels = bIdx.map((i) => DEF.partB[i]);
  const bRows = grades.map((g) => { const gr = recs.filter((r) => r.grade === g), att = gr.map((r) => num(r.data["B.0"])).filter((x) => x !== null), sum = (k) => gr.reduce((a, r) => a + (num(r.data[k]) || 0), 0);
    return { grade: g, classes: gr.length, rs: sum("A.roll_start"), re: sum("A.roll_end"), att: att.length ? att.reduce((a, b) => a + b, 0) / att.length : null, vals: bIdx.map((i) => sum("B." + i)) }; });
  const gTab = DEF.partG.map((label, i) => { const by = {}, allv = [], comments = []; let urgent = 0, excellent = 0;
    grades.forEach((g) => { const v = recs.filter((r) => r.grade === g).map((r) => num(r.data[`G.${i}.rating`])).filter((x) => x !== null); by[g] = v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; allv.push(...v); });
    recs.forEach((r) => { const rv = num(r.data[`G.${i}.rating`]), cm = r.data[`G.${i}.comment`]; if (rv === 1) urgent++; if (rv === 4) excellent++; if (cm && rv !== null) comments.push([lab(r), rv, cm]); });
    return { label, by, all: allv.length ? allv.reduce((a, b) => a + b, 0) / allv.length : null, urgent, excellent, comments }; });
  const strengths = [], improvements = [], pd = [], teach = [], learn = [];
  recs.forEach((r) => { const d = r.data; [0, 1, 2].forEach((i) => { if (d[`H1.${i}.0`]) strengths.push([lab(r), [0, 1, 2].map((k) => d[`H1.${i}.${k}`] || "")]); if (d[`H2.${i}.0`]) improvements.push([lab(r), [0, 1, 2, 3, 4].map((k) => d[`H2.${i}.${k}`] || "")]); });
    if (d["F.2"]) pd.push([lab(r), d["F.2"]]); if (d["E.2"]) teach.push([lab(r), d["E.2"]]); if (d["E.3"]) learn.push([lab(r), d["E.3"]]); });
  const ord = { High: 0, Medium: 1, Low: 2 }; improvements.sort((a, b) => (ord[a[1][3]] ?? 3) - (ord[b[1][3]] ?? 3));
  const comp = [...new Set(ALL_CLASSES().map((c) => c[0]))].filter((g) => !gf || g === gf).map((g) => { const sts = ALL_CLASSES().filter((c) => c[0] === g).map(([gg, s]) => statusOf(records[`${gg}|${s}`] || { status: "none", data: {} }));
    return { grade: g, total: sts.length, sub: sts.filter((s) => s === "Submitted").length, inp: sts.filter((s) => s === "In progress").length, ns: sts.filter((s) => s === "Not started").length }; });
  return { recs, grades, dTab, lowest: ranked.slice(0, 3), highest: ranked.slice(-3).reverse(), bRows, bLabels, gTab, strengths, improvements, pd, teach, learn, comp,
    prio: { High: improvements.filter((x) => x[1][3] === "High").length, Medium: improvements.filter((x) => x[1][3] === "Medium").length, Low: improvements.filter((x) => x[1][3] === "Low").length } };
}
const respTable = (rows) => `<table class="small"><tr><th style="width:70px">Class</th><th>Response</th></tr>${rows.map(([c, t]) => `<tr><td>${c}</td><td>${esc(t)}</td></tr>`).join("")}</table>`;
async function viewSchoolReport(q) {
  const gf = q.get("grade") ? Number(q.get("grade")) : null, inc = q.get("draft") === "1";
  const { records } = await loadAll(), a = analyse(records, gf, inc), grades = [...new Set(ALL_CLASSES().map((c) => c[0]))];
  const H2 = DEF.H2_cols, H1 = DEF.H1_cols;
  shell(`<form id="rf2" class="card noprint row"><div><label>Grade</label><select id="gsel" style="width:auto"><option value="">All grades</option>${grades.map((g) => `<option value="${g}" ${gf === g ? "selected" : ""}>Grade ${g}</option>`).join("")}</select></div>
    <div><label>&nbsp;</label><label style="font-weight:normal"><input type="checkbox" id="dchk" ${inc ? "checked" : ""} style="width:auto"> Include classes still in progress</label></div>
    <div style="margin-left:auto"><label>&nbsp;</label><button type="button" class="btn pink" onclick="window.print()">Print / save as PDF</button> <button type="button" class="btn" id="xl">Excel</button></div></form>
  <div class="report"><div class="printhead" style="display:none"><h1>${esc(DEF.school)}</h1><div>${esc(DEF.title)}: analysed report${gf ? ` (Grade ${gf})` : ""} · generated ${nowStr()}</div></div>
  <h2 style="margin-top:0">1. Completion</h2><table class="small"><tr><th>Grade</th><th class="num">Streams</th><th class="num">Submitted</th><th class="num">In progress</th><th class="num">Not started</th></tr>
  ${a.comp.map((c) => `<tr><td>Grade ${c.grade}</td><td class="num">${c.total}</td><td class="num">${c.sub}</td><td class="num">${c.inp}</td><td class="num">${c.ns}</td></tr>`).join("")}</table>
  <p class="muted">This report analyses ${a.recs.length} class reflection${a.recs.length !== 1 ? "s" : ""}${inc ? " (including drafts)" : " (submitted only)"}.</p>
  ${!a.recs.length ? `<div class="flash warn">No reflections to analyse yet. Figures appear here as teachers submit.</div>` : `
  <h2>2. Learner voice: % of learners who agree (ratings 3 and 4)</h2><table class="small"><tr><th>Statement</th>${a.grades.map((g) => `<th class="num">Gr ${g}</th>`).join("")}<th class="num">All</th><th style="width:140px"></th></tr>
  ${a.dTab.map((r) => `<tr><td>${esc(r.label)}</td>${a.grades.map((g) => `<td class="num ${lvl(r.by[g])}">${pct(r.by[g])}</td>`).join("")}<td class="num ${lvl(r.all)}">${pct(r.all)}</td><td><div class="bar"><i style="width:${r.all || 0}%"></i></div></td></tr>`).join("")}</table>
  <p class="legend muted">Colours: <span class="hi">80% and above</span><span class="mid">60 to 79%</span><span class="lo">below 60%</span> Figures combine all learner ratings recorded for that grade.</p>
  <div class="note"><b>Lowest agreement:</b> ${a.lowest.map((r) => `${esc(r.label)} (${pct(r.all)})`).join("; ")}.<br><b>Highest agreement:</b> ${a.highest.map((r) => `${esc(r.label)} (${pct(r.all)})`).join("; ")}.</div>
  <h2>3. Class snapshot (totals by grade)</h2><table class="small"><tr><th>Grade</th><th class="num">Classes</th><th class="num">Roll (start)</th><th class="num">Roll (end)</th><th class="num">Avg attendance (%)</th>${a.bLabels.map((l) => `<th class="num">${esc(l)}</th>`).join("")}</tr>
  ${a.bRows.map((b) => `<tr><td>Grade ${b.grade}</td><td class="num">${b.classes}</td><td class="num">${b.rs}</td><td class="num">${b.re}</td><td class="num">${f1(b.att)}</td>${b.vals.map((v) => `<td class="num">${v}</td>`).join("")}</tr>`).join("")}</table>
  <h2 class="pagebreak">4. School-wide rating (1 = needs urgent improvement, 4 = excellent)</h2><table class="small"><tr><th>Area</th>${a.grades.map((g) => `<th class="num">Gr ${g}</th>`).join("")}<th class="num">Average</th><th class="num">Rated 1</th><th class="num">Rated 4</th></tr>
  ${a.gTab.map((r) => `<tr><td>${esc(r.label)}</td>${a.grades.map((g) => `<td class="num">${f1(r.by[g])}</td>`).join("")}<td class="num"><b>${f1(r.all)}</b></td><td class="num ${r.urgent ? "lo" : ""}">${r.urgent}</td><td class="num ${r.excellent ? "hi" : ""}">${r.excellent}</td></tr>`).join("")}</table>
  <h3>Comments behind the ratings</h3>${a.gTab.filter((r) => r.comments.length).map((r) => `<p><b>${esc(r.label)}</b></p><table class="small"><tr><th style="width:70px">Class</th><th style="width:60px" class="num">Rating</th><th>Comment / evidence</th></tr>${r.comments.map(([c, rt, cm]) => `<tr><td>${c}</td><td class="num ${rt === 1 ? "lo" : rt === 4 ? "hi" : ""}">${rt}</td><td>${esc(cm)}</td></tr>`).join("")}</table>`).join("")}
  <h2 class="pagebreak">5. Areas for improvement (High priority first)</h2><p class="muted">High: ${a.prio.High} · Medium: ${a.prio.Medium} · Low: ${a.prio.Low}</p>
  <table class="small"><tr><th>Class</th><th>${esc(H2[3])}</th><th>${esc(H2[0])}</th><th>${esc(H2[1])}</th><th>${esc(H2[2])}</th><th>${esc(H2[4])}</th></tr>
  ${a.improvements.map(([c, v]) => `<tr><td>${c}</td><td class="num ${{ High: "lo", Medium: "mid", Low: "hi" }[v[3]] || ""}">${esc(v[3])}</td><td>${esc(v[0])}</td><td>${esc(v[1])}</td><td>${esc(v[2])}</td><td>${esc(v[4])}</td></tr>`).join("")}</table>
  <h2>6. Strengths to celebrate</h2><table class="small"><tr><th>Class</th><th>${esc(H1[0])}</th><th>${esc(H1[1])}</th><th>${esc(H1[2])}</th></tr>${a.strengths.map(([c, v]) => `<tr><td>${c}</td><td>${esc(v[0])}</td><td>${esc(v[1])}</td><td>${esc(v[2])}</td></tr>`).join("")}</table>
  <h2 class="pagebreak">7. Teaching and learning</h2><h3>What teachers should improve on (from learners' views)</h3>${respTable(a.teach)}<h3>What learners should improve on</h3>${respTable(a.learn)}<h3>Professional development or support teachers need next year</h3>${respTable(a.pd)}
  <p class="muted">Full learner-voice responses (Part C) and each class's own analysis are on the individual class reports, and in the Excel download.</p>`}</div>`,
    `Analysed report<small>Whole-school analysis of the End-of-Year Class Reflection. Use Print to save as PDF or print.</small>`, "noprint");
  const go = () => { location.hash = `#/admin/report?${$("#gsel").value ? "grade=" + $("#gsel").value + "&" : ""}${$("#dchk").checked ? "draft=1" : ""}`; };
  $("#gsel").onchange = go; $("#dchk").onchange = go; $("#xl").onclick = exportXlsx;
}

async function viewClassReport(grade, stream) {
  const r = await api(`reflection/${grade}/${encodeURIComponent(stream)}`);
  if (r.error) return shell(`<div class="card"><h2>${esc(r.error)}</h2></div>`);
  const rec = r.rec, d = rec.data, m = metrics(d), band = bandFor(grade), H1 = DEF.H1_cols, H2 = DEF.H2_cols;
  shell(`<div class="report"><div class="printhead" style="display:none"><h1>${esc(DEF.school)}</h1></div>
  <h1 style="margin-top:0">${esc(DEF.title)}: Grade ${grade} ${esc(stream)}</h1><p class="muted">Status: <b>${statusOf(rec)}</b>${rec.submitted_at ? " · submitted " + esc(rec.submitted_at) : ""} · printed ${nowStr()}</p>
  <h2>A. Class information</h2><table class="small"><tr><th>Teacher</th><td>${esc(d["A.teacher"])}</td><th>Subject(s)</th><td>${esc(d["A.subjects"])}</td></tr>
  <tr><th>Roll (start / end)</th><td>${esc(d["A.roll_start"])} / ${esc(d["A.roll_end"])}</td><th>Present at session</th><td>${esc(d["A.present"])}</td></tr><tr><th>Date of session</th><td colspan="3">${esc(d["A.date"])}</td></tr></table>
  <h2>B. Class snapshot</h2><table class="small">${DEF.partB.map((l, i) => `<tr><td>${esc(l)}</td><td class="num" style="width:120px">${esc(d["B." + i])}</td></tr>`).join("")}</table>
  <h2>Analysis: learner rating scale (Part D)</h2><table class="small"><tr><th>Statement</th><th class="num">1</th><th class="num">2</th><th class="num">3</th><th class="num">4</th><th class="num">Total</th><th class="num">% agree</th><th style="width:120px"></th></tr>
  ${DEF.partD.map((s, i) => { const c = dCounts(d, i), t = c.reduce((a, b) => a + b, 0), p = t ? ((c[2] + c[3]) / t) * 100 : null; return `<tr><td>${esc(s)}</td>${c.map((x) => `<td class="num">${x}</td>`).join("")}<td class="num">${t}</td><td class="num ${lvl(p)}">${pct(p)}</td><td><div class="bar"><i style="width:${p || 0}%"></i></div></td></tr>`; }).join("")}
  <tr><td colspan="6"><b>Overall % agree (all statements)</b></td><td class="num ${lvl(m.agree_all)}">${pct(m.agree_all)}</td><td></td></tr></table>
  <p class="legend muted"><span class="hi">80%+</span><span class="mid">60 to 79%</span><span class="lo">below 60%</span> Discipline: ${pct(m.agree_disc)} · Respect: ${pct(m.agree_resp)}</p>
  <h2 class="pagebreak">C. Learner voice: ${esc(band.title)}</h2><table class="small"><tr><th style="width:36%">Question</th><th>What learners said</th><th class="num" style="width:90px">Learners (approx.)</th></tr>${band.questions.map((q, i) => `<tr><td>${esc(q)}</td><td>${esc(d[`C.${i}.summary`])}</td><td class="num">${esc(d[`C.${i}.count`])}</td></tr>`).join("")}</table>
  <h2>E. Academics: the learning experience</h2><table class="small">${DEF.partE.map((q, i) => `<tr><td style="width:36%">${esc(q)}</td><td>${esc(d["E." + i])}</td></tr>`).join("")}</table>
  <h2>F. Teacher reflection</h2><table class="small">${DEF.partF.map((q, i) => `<tr><td style="width:36%">${esc(q)}</td><td>${esc(d["F." + i])}</td></tr>`).join("")}</table>
  <h2>G. School-wide rating</h2><table class="small"><tr><th>Area</th><th class="num" style="width:70px">Rating</th><th>Comment / evidence</th></tr>${DEF.partG.map((a, i) => `<tr><td>${esc(a)}</td><td class="num">${esc(d[`G.${i}.rating`])}</td><td>${esc(d[`G.${i}.comment`])}</td></tr>`).join("")}</table>
  <h2>H1. Strengths to celebrate</h2><table class="small"><tr>${H1.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>${[0, 1, 2].map((i) => `<tr>${[0, 1, 2].map((k) => `<td>${esc(d[`H1.${i}.${k}`])}</td>`).join("")}</tr>`).join("")}</table>
  <h2>H2. Areas for improvement</h2><table class="small"><tr>${H2.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>${[0, 1, 2].map((i) => `<tr>${[0, 1, 2, 3, 4].map((k) => `<td>${esc(d[`H2.${i}.${k}`])}</td>`).join("")}</tr>`).join("")}</table>
  <h2>I. Declaration</h2><p>${esc(DEF.declaration)}<br><b>${esc(d["I.declaration"] || "Not yet confirmed")}</b> · ${esc(d["I.date"])}</p></div>`,
    `Grade ${grade} ${esc(stream)}: printable reflection<small><button class="btn" style="margin-top:6px" onclick="window.print()">Print / save as PDF</button></small>`, "noprint");
}
