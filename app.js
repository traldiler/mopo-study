/* Платформа обучения МОПО — оболочка кабинета: вход, навигация, материалы.
   Экзамен живёт в exam.js, админка в admin.js. */

const $ = s => document.querySelector(s);
const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const APP = { user: null, token: localStorage.getItem("mopo-token") || "", screen: "cabinet", materials: null, demo: !window.API_URL };

/* ---------- обращение к серверу ---------- */
/* списки кабинета РОПа и разработчика: показываем из памяти сразу, свежие подтягиваем в фоне */
const SWR = {};
const SWR_READ = /^admin\.(users|students|attempts|attempt|questions|badges|materials|resets|examList|quizGet|examGet)$/;
function swrRedraw() {
  const busy = document.querySelector(".modal-back, .viewer") || /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || "");
  if (busy || !/^adm:/.test(APP.screen || "")) return;
  const y = window.scrollY;
  if (ADM.tab === "materials" && $("#ltbl")) admMaterials();          /* список остаётся на экране, пока готовится новый */
  else screenAdmin();
  setTimeout(() => window.scrollTo(0, y), 30);
}
async function api(action, data) {
  if (APP.demo) {                                  /* демо отвечает как сервер: отказ — ошибка, а не «успех» */
    const r = await demoApi(action, data);
    if (r && r.error) throw new Error(r.error);
    return r;
  }
  const key = action + JSON.stringify(data || {});
  if (SWR_READ.test(action)) {
    const c = SWR[key];
    if (c) {
      if (Date.now() - c.at > 15000 && !c.busy) {
        c.busy = true;
        apiRaw(action, data).then(v => {
          const changed = JSON.stringify(v) !== JSON.stringify(c.v);
          SWR[key] = { v: v, at: Date.now() };
          if (changed) swrRedraw();
        }).catch(() => { c.busy = false; });
      }
      return JSON.parse(JSON.stringify(c.v));
    }
    const v = await apiRaw(action, data);
    SWR[key] = { v: v, at: Date.now() };
    return JSON.parse(JSON.stringify(v));
  }
  if (/^admin\.|^question\./.test(action) && action !== "admin.boot") {       /* что-то поменяли — списки перечитаем, когда сервер закончит */
    const r = await apiRaw(action, data);
    Object.keys(SWR).forEach(k => delete SWR[k]);
    setTimeout(() => adminPrefetch(true), 300);
    return r;
  }
  return apiRaw(action, data);
}
async function apiRaw(action, data) {
  /* сервер Google иногда отвечает сбоем вместо данных — чтение повторяем сами, запись не дублируем */
  const safe = /^(boot|program|progress\.get|me|my\.questions|mat\.key|quiz\.overrides|exam\.extra|quiz\.review|admin\.(users|students|attempts|attempt|questions|badges|materials|resets|examList|examGet|quizGet))$/.test(action);
  let j = null;
  for (let tryN = 0; tryN < (safe ? 3 : 1); tryN++) {
    try {
      const r = await fetch(window.API_URL, {
        method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(Object.assign({ action: action, token: APP.token }, data || {}))
      });
      const txt = await r.text();
      j = JSON.parse(txt);
      break;
    } catch (e) {
      j = null;
      if (tryN === (safe ? 2 : 0)) throw new Error("Сервер не ответил — проверьте интернет и попробуйте ещё раз");
      await new Promise(res => setTimeout(res, 800 * (tryN + 1)));
    }
  }
  if (j && j.code === "auth") { logout(true); throw new Error("Сессия истекла — войдите заново"); }
  if (j && j.error) throw new Error(j.error);
  return j;
}


/* ---------- быстрый режим: копия данных в браузере + очередь сохранений ----------
   Google отвечает по 3–5 секунд, поэтому кабинет его не ждёт: показывает свою копию сразу,
   а изменения копит в очереди и отправляет пачкой в фоне. Очередь лежит в браузере — если закрыть вкладку,
   неотправленное уйдёт при следующем открытии; при закрытии браузер ещё и сам пытается дослать. */
const OUT = { q: [], busy: false, fail: 0, timer: null }, MYQ = { data: null, at: 0 };
const REFRESH = { busy: false, at: 0 };
const outKey = () => "mopo-out-" + (APP.user ? APP.user.id : "x");
const newId = p => (p || "n") + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
function outLoad() { try { OUT.q = JSON.parse(localStorage.getItem(outKey()) || "[]"); } catch (e) { OUT.q = []; } }
function outKeep() { try { localStorage.setItem(outKey(), JSON.stringify(OUT.q)); } catch (e) { /* без памяти браузера — только в этой вкладке */ } saveBadge(); }
function snapKeep() {
  if (APP.demo || !APP.user || !PR.program) return;
  try {
    localStorage.setItem("mopo-snap-" + APP.user.id, JSON.stringify({ user: APP.user, program: PR.program, progress: PR.progress, qOver: PR.qOver || null,
      examX: PR.examX || null, myq: MYQ.data, mat: MAT_HEX, at: Date.now() }));
    localStorage.setItem("mopo-last-user", APP.user.id);
  } catch (e) { /* не страшно */ }
}
function snapLoad() {
  try {
    const id = localStorage.getItem("mopo-last-user"), s = id && JSON.parse(localStorage.getItem("mopo-snap-" + id) || "null");
    return s && s.user && s.program && s.progress ? s : null;
  } catch (e) { return null; }
}
function snapDrop() {
  try { Object.keys(localStorage).filter(k => /^mopo-(snap|last-user)/.test(k)).forEach(k => localStorage.removeItem(k)); } catch (e) { }
}
/* ответ сервера при входе: всё, что нужно кабинету, одним куском */
function applyBoot(b) {
  if (b.user) APP.user = Object.assign(APP.user || {}, b.user);
  PR.program = b.program; PR.progress = b.progress; PR.qOver = b.quizzes || null; PR.examX = b.examX || null;
  if (b.mat) MAT_HEX = b.mat;
  if (b.myq) { MYQ.data = b.myq; MYQ.at = Date.now(); }
  OUT.q.forEach(it => applyLocal(it.action, it.data));
  if (typeof QZ !== "undefined") QZ.data = null;
  if (typeof EX !== "undefined" && !EX.running) EX.data = null;
  REFRESH.at = Date.now(); snapKeep();
  if (isStaff(APP.user)) adminPrefetch();
}
/* РОП и разработчик: все списки кабинета одним запросом в фоне — вкладки потом открываются мгновенно */
const PREF = { at: 0, busy: false };
async function adminPrefetch(force) {
  if (APP.demo || PREF.busy || (!force && Date.now() - PREF.at < 60000)) return;
  PREF.busy = true;
  try {
    const a = await apiRaw("admin.boot"), now = Date.now();
    const put = (action, data, v) => { SWR[action + JSON.stringify(data || {})] = { v: v, at: now }; };
    put("admin.students", null, { students: a.students });
    put("admin.attempts", null, { attempts: a.attempts });
    put("admin.users", null, { users: a.users });
    put("admin.resets", null, { resets: a.resets });
    put("admin.questions", { box: "rop" }, { questions: a.questionsRop });
    if (a.questionsDev) put("admin.questions", { box: "dev" }, { questions: a.questionsDev });
    put("admin.materials", null, a.materials);
    put("admin.examList", null, a.examList);
    put("admin.badges", null, a.badges);
    PREF.at = now;
    if (/^adm:/.test(APP.screen || "") && document.querySelector("#admbody .lead, #admbody .hint") && /Загружаем/.test(($("#admbody") || {}).textContent || "")) swrRedraw();
  } catch (e) { /* не вышло — вкладки загрузят сами */ }
  PREF.busy = false;
}
/* применить действие к своей копии — то же, что потом сделает сервер */
function applyLocal(action, d) {
  const P = PR.progress; if (!P) return;
  P.notes = P.notes || {}; P.lessons = P.lessons || {};
  if (action === "progress") { if (d.done) P.lessons[d.lessonId] = P.lessons[d.lessonId] || new Date().toISOString(); else delete P.lessons[d.lessonId]; }
  if (action === "note.save") {
    const list = P.notes[d.lessonId] = P.notes[d.lessonId] || [];
    if (!list.some(n => n.id === d.id)) list.push({ id: d.id, kind: d.kind || "note", text: d.text || "", time: d.time || "",
      quote: d.quote || "", color: Number(d.color) || 0, at: new Date().toISOString() });
  }
  if (action === "note.del") P.notes[d.lessonId] = (P.notes[d.lessonId] || []).filter(n => n.id !== d.id);
  if (action === "note.update") (P.notes[d.lessonId] || []).forEach(n => {
    if (n.id !== d.id) return;
    if (d.color != null) n.color = Number(d.color);
    if (d.text != null) n.text = d.text;
  });
  if (action === "lesson.open") P.lastLesson = d.lessonId;
}
/* сохранить: сразу в копию, в Google — в фоне */
function save(action, d) {
  d = Object.assign({}, d);
  if (action === "note.save" && !d.id) d.id = newId("n");
  applyLocal(action, d);
  if (APP.demo) { api(action, d).catch(() => { }); return d; }
  OUT.q.push({ qid: newId("q"), action: action, data: d });
  outKeep(); snapKeep(); outFlush();
  return d;
}
async function outFlush() {
  if (OUT.busy || !OUT.q.length || APP.demo || !APP.token) return;
  OUT.busy = true; saveBadge();
  const batch = OUT.q.slice(0, 30);
  try {
    const r = await api("batch", { items: batch });
    const done = new Set((r.results || []).map(x => x.qid));      /* отказ сервера повторять бессмысленно — тоже убираем */
    OUT.q = OUT.q.filter(x => !done.has(x.qid)); OUT.fail = 0;
  } catch (e) { OUT.fail++; }
  OUT.busy = false; outKeep();
  if (OUT.q.length) { clearTimeout(OUT.timer); OUT.timer = setTimeout(outFlush, OUT.fail ? Math.min(30000, 3000 * OUT.fail) : 50); }
}
function saveBadge() {
  let b = document.getElementById("savebadge");
  if (!b) { b = el("div", "savebadge"); b.id = "savebadge"; b.setAttribute("role", "status"); document.body.appendChild(b); }
  b.hidden = !OUT.q.length || !OUT.fail;                /* обычное сохранение идёт незаметно, показываем только проблемы со связью */
  b.classList.toggle("bad", !!OUT.fail);
  b.textContent = OUT.fail ? "Нет связи — сохраним, как только появится" : "Сохраняется…";
}
/* спрашиваем при закрытии, только если связь пропала и изменения правда не ушли. Текст окна браузер не даёт менять */
window.addEventListener("beforeunload", e => { if (OUT.q.length && OUT.fail && !APP.demo) { e.preventDefault(); e.returnValue = ""; } });
window.addEventListener("pagehide", () => {
  if (!OUT.q.length || APP.demo || !navigator.sendBeacon) return;
  try { navigator.sendBeacon(window.API_URL, new Blob([JSON.stringify({ action: "batch", token: APP.token, items: OUT.q.slice(0, 30) })], { type: "text/plain;charset=utf-8" })); }
  catch (e) { /* дошлём при следующем открытии */ }
});
window.addEventListener("online", () => outFlush());
/* свежие данные с сервера — тихо, не мешая человеку; то, что ещё в очереди, накладываем сверху */
async function refreshBg(force) {
  if (APP.demo || REFRESH.busy || !APP.token) return;
  if (!force && Date.now() - REFRESH.at < 45000) return;
  REFRESH.busy = true;
  try {
    const before = JSON.stringify([PR.program, PR.progress]);
    applyBoot(await api("boot"));
    const changed = before !== JSON.stringify([PR.program, PR.progress]);        /* ничего нового — экран не трогаем */
    const busy = document.querySelector(".viewer, .modal-back") || /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || "");
    if (changed && !busy && /^(cabinet|notes)$/.test(APP.screen)) { renderNav(); backToPlace(); }
  } catch (e) { /* нет связи — остаёмся на копии */ }
  REFRESH.busy = false;
}

/* ---------- диалоги ---------- */
function ask({ title, text, ok = "Да", cancel = "Отмена", danger }) {
  return new Promise(res => {
    const back = el("div", "modal-back");
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><b>${esc(title)}</b><p>${text}</p>
      <div class="mbtns"><button type="button" class="btn ghost" data-a="0">${esc(cancel)}</button>
      <button type="button" class="btn${danger ? " danger" : ""}" data-a="1">${esc(ok)}</button></div></div>`;
    const done = v => { back.remove(); lockScroll(false); res(v); };
    back.querySelector('[data-a="0"]').onclick = () => done(false);
    back.querySelector('[data-a="1"]').onclick = () => done(true);
    back.onclick = e => { if (e.target === back) done(false); };
    document.body.appendChild(back); lockScroll(true); back.querySelector('[data-a="1"]').focus();
  });
}
/* окно с несколькими действиями: вернёт value нажатой кнопки или null */
function choose({ title, text, buttons }) {
  return new Promise(res => {
    const back = el("div", "modal-back");
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><b>${esc(title)}</b><div class="mtext">${text}</div>
      <div class="mbtns">${buttons.map((b, i) => `<button type="button" class="btn ${b.cls || ""}" data-i="${i}">${esc(b.label)}</button>`).join("")}</div></div>`;
    const done = v => { back.remove(); lockScroll(false); res(v); };
    back.querySelectorAll("[data-i]").forEach(x => x.onclick = () => done(buttons[+x.dataset.i].value));
    back.onclick = e => { if (e.target === back) done(null); };
    document.body.appendChild(back); lockScroll(true);
  });
}
function lockScroll(on) {
  document.body.classList.toggle("noscroll", !!on || !!document.querySelector(".viewer, .modal-back"));
}
function toast(text) {
  document.querySelectorAll(".toast").forEach(t => t.remove());
  const t = el("div", "toast", esc(text)); document.body.appendChild(t);
  setTimeout(() => t.remove(), 6000);
}
function fail(e) { toast(String(e && e.message || e)); }

/* ---------- вход ---------- */
function screenLogin() {
  $("#nav").hidden = true; $("#htitle").textContent = "Вход";
  document.body.classList.add("is-login");
  const brand = document.querySelector(".top .brand"); if (brand) brand.textContent = "обучение";
  $("#app").innerHTML = `<div class="card login" style="max-width:520px">
    <h2>Вход в кабинет</h2>
    <p class="lead">Логин и пароль выдаёт руководитель. Здесь лежат уроки, конспекты, схемы и экзамен.</p>
    ${APP.demo ? `<div class="note warn"><b>Демо-режим.</b> Сервер не подключён, данные учебные. Три входа:<br>
      <b>demo</b> / <b>demo</b> — кабинет МОПО: два блока пройдено, третий в работе.<br>
      <b>admin</b> / <b>admin</b> — кабинет РОПа: ученики, экзамены, вопросы, материалы.<br>
      <b>dev</b> / <b>dev</b> — кабинет разработчика: всё, что у РОПа, плюс РОПы и вопросы от них.</div>` : ""}
    <label class="f" for="lg">Логин</label><input type="text" id="lg" autocomplete="username">
    <label class="f" for="pw">Пароль</label>
    <div class="pwrap"><input type="password" id="pw" autocomplete="current-password">
      <button type="button" id="pweye" aria-label="Показать пароль">показать</button></div>
    <div class="foot"><button class="btn" id="go" type="button">Войти</button><button class="link" id="forgot" type="button">Забыли пароль?</button>
      <span class="hint" id="err"></span></div></div>`;
  const go = async () => {
    const login = $("#lg").value.trim(), password = $("#pw").value;
    if (!login || !password) { $("#err").textContent = "Заполните оба поля."; return; }
    $("#go").disabled = true;
    try {
      const r = await api("login", { login: login, password: password });
      if (r.error) throw new Error(r.error);
      APP.token = r.token; APP.user = r.user; localStorage.setItem("mopo-token", r.token);
      start();
    } catch (e) { $("#err").textContent = e.message; $("#go").disabled = false; }
  };
  $("#pweye").onclick = () => {
    const i = $("#pw"), show = i.type === "password";
    i.type = show ? "text" : "password";
    $("#pweye").textContent = show ? "скрыть" : "показать";
    $("#pweye").setAttribute("aria-label", show ? "Скрыть пароль" : "Показать пароль");
    i.focus();
  };
  $("#go").onclick = go;
  $("#pw").onkeydown = e => { if (e.key === "Enter") go(); };
  $("#forgot").onclick = () => forgotPassword($("#lg").value.trim());
}
/* забыли пароль: разработчику — код на почту, МОПО — запрос РОПу, РОПу — запрос разработчику */
function forgotPassword(login0) {
  const back = el("div", "modal-back");
  const close = () => { back.remove(); lockScroll(false); };
  const step1 = () => {
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" style="max-width:460px">
      <b>Забыли пароль?</b>
      <p>Напишите логин. МОПО — РОП получит запрос и выдаст новый пароль. Разработчику придёт код на почту.</p>
      <label class="f">Логин</label><input type="text" id="fglogin" value="${esc(login0 || "")}" autocomplete="username">
      <div class="mbtns"><button class="btn ghost" data-a="0" type="button">Отмена</button>
        <button class="btn" data-a="1" type="button">Дальше</button></div></div>`;
    back.querySelector('[data-a="0"]').onclick = close;
    const inp = back.querySelector("#fglogin"); setTimeout(() => inp.focus(), 30);
    const send = async () => {
      const login = inp.value.trim(); if (!login) return toast("Напишите логин");
      try { const r = await api("password.forgot", { login: login }); r.kind === "mail" ? step2(login, r) : done(r, login); } catch (e) { fail(e); }
    };
    back.querySelector('[data-a="1"]').onclick = send;
    inp.onkeydown = e => { if (e.key === "Enter") send(); };
  };
  const done = (r, login) => {
    if (r.kind === "nomail") {
      back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" style="max-width:460px"><b>Почта не указана</b>
        <p>В профиле разработчика нет почты, код отправить некуда. Задайте DEV_EMAIL в свойствах скрипта Google Apps Script и повторите.</p>
        <div class="mbtns"><button class="btn" data-a="0" type="button">Понятно</button></div></div>`;
      back.querySelector('[data-a="0"]').onclick = close;
      return;
    }
    close();
    waNotice({ to: r.to, group: r.group, title: "Запрос отправлен",
      text: `Здравствуйте! Это ${login} — не могу войти в кабинет обучения, забыл(а) пароль. Задайте, пожалуйста, новый. Запрос уже в сервисе обучения МОПО.` });
  };
  const step2 = (login, r) => {
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" style="max-width:460px">
      <b>Код отправлен на ${esc(r.mail)}</b>
      <p>${r.demo ? "В демо письмо не уходит — так выглядит шаг в рабочей версии." : "Код действует 30 минут. Письма нет — проверьте «Спам»."}</p>
      <label class="f">Код из письма</label><input type="text" id="fgcode" inputmode="numeric" maxlength="6" autocomplete="one-time-code">
      <label class="f">Новый пароль</label>
      <div class="pwrow"><input type="text" id="fgpass" autocomplete="new-password" placeholder="не короче 6 символов">
        <button class="btn small white" type="button" id="fggen">Сгенерировать</button></div>
      <p class="hint tiny">Сохраните пароль в менеджере паролей браузера или запишите.</p>
      <div class="mbtns"><button class="btn ghost" data-a="0" type="button">Отмена</button>
        <button class="btn" data-a="1" type="button">Сменить пароль</button></div></div>`;
    back.querySelector('[data-a="0"]').onclick = close;
    back.querySelector("#fggen").onclick = () => { back.querySelector("#fgpass").value = genPassword(); };
    back.querySelector('[data-a="1"]').onclick = async () => {
      const code = back.querySelector("#fgcode").value.trim(), pass = back.querySelector("#fgpass").value;
      if (!code) return toast("Введите код из письма");
      if (pass.length < 6) return toast("Пароль — минимум 6 символов");
      try {
        await api("password.reset", { login: login, code: code, password: pass });
        close(); $("#lg").value = login; $("#pw").value = pass; toast("Пароль изменён — нажмите «Войти»");
      } catch (e) { fail(e); }
    };
  };
  step1(); document.body.appendChild(back); lockScroll(true);
}
async function logout(silent) {
  if ($("#me")) $("#me").hidden = true;
  if (!silent && !await ask({ title: "Выйти из кабинета", ok: "Выйти", text: "Прогресс сохранён — войдёте снова и продолжите." })) return;
  try { await api("logout"); } catch (_) { }
  APP.token = ""; APP.user = null; localStorage.removeItem("mopo-token");
  snapDrop(); PR.program = null; PR.progress = null; MAT_HEX = ""; MAT_KEY = null;
  try { caches.delete(DOCC); } catch (e) { }
  screenLogin();
}

/* ---------- роли и режимы ---------- */
const isStaff = u => !!u && (u.role === "admin" || u.role === "dev");
const modeKey = () => "mopo-mode-" + (APP.user ? APP.user.id : "");
function staffMode() { try { return localStorage.getItem(modeKey()) === "mopo" ? "mopo" : "admin"; } catch (e) { return "admin"; } }
function setMode(m) {
  try { localStorage.setItem(modeKey(), m); } catch (e) { /* не страшно */ }
  go(m === "mopo" ? "cabinet" : "adm:" + (ADM.tab || "students"));
}

/* ---------- навигация ---------- */
/* название раздела — только во вкладке браузера: в шапке его не дублируем */
function syncDocTitle() {
  const h = document.getElementById("htitle");
  if (h) document.title = (h.textContent ? h.textContent + " · " : "") + "Обучение МОПО · Пром-Импорт";
}
if (typeof MutationObserver !== "undefined") document.addEventListener("DOMContentLoaded", () => {
  const h = document.getElementById("htitle");
  if (h) new MutationObserver(syncDocTitle).observe(h, { childList: true, characterData: true, subtree: true });
});
function renderNav() {
  const n = $("#nav"); n.hidden = false; n.innerHTML = "";
  document.body.classList.remove("is-login");
  const examNow = typeof EX !== "undefined" && !!EX.running;   /* экзамен идёт — предупредим при уходе */
  const staff = isStaff(APP.user), dev = APP.user.role === "dev", mopo = !staff || staffMode() === "mopo";
  const items = mopo
    ? [["cabinet", "Обучение"], ["notes", "Мои записи"], ["questions", "Мои вопросы"], ["exam", "Экзамен"]]
    : [["adm:students", "Ученики"], ["adm:attempts", "Экзамены"], ["adm:questions", dev ? "Вопросы МОПОв" : "Вопросы"]]
        .concat(dev ? [["adm:devq", "Вопросы РОПов"]] : [["questions", "Разработчику"]])
        .concat([["adm:users", "Сотрудники"], ["adm:materials", "Материалы"], ["adm:settings", "Настройки"]]);
  items.forEach(([k, t]) => {
    const b = el("button", "", t); b.type = "button"; b.dataset.k = k;
    b.setAttribute("aria-current", APP.screen === k ? "true" : "false");
    b.onclick = () => examNow && k !== "exam" ? leaveExam(k) : go(k);
    n.appendChild(b);
  });
  if (staff) {
    const sw = el("button", "switch", mopo ? (dev ? "Кабинет разработчика" : "Кабинет РОПа") : "Кабинет МОПО"); sw.type = "button";
    sw.title = mopo ? "Вернуться в свой кабинет" : "Посмотреть кабинет глазами МОПО — все уроки открыты";
    sw.onclick = () => examNow ? leaveExam("mode:" + (mopo ? "admin" : "mopo")) : setMode(mopo ? "admin" : "mopo");
    n.appendChild(sw);
  }
  const out = el("button", "out", "Выйти"); out.type = "button";
  out.onclick = () => examNow ? leaveExam("logout") : logout();
  n.appendChild(out);
  const cur = n.querySelector('[aria-current="true"]');                /* на телефоне меню листается — текущий раздел в поле зрения */
  if (cur && n.scrollWidth > n.clientWidth) n.scrollLeft = Math.max(0, cur.getBoundingClientRect().left - n.getBoundingClientRect().left + n.scrollLeft - 12);
  const brand = document.querySelector(".top .brand");
  if (brand) brand.textContent = !staff ? "обучение"                     /* «Пром-Импорт» — логотип рядом */
    : mopo ? "кабинет МОПО глазами " + (dev ? "разработчика" : "РОПа") : (dev ? "кабинет разработчика" : "кабинет РОПа");
  const me = $("#me"); me.hidden = false;
  me.className = "me" + (examNow ? " exam-now" : "") + (APP.screen === "profile" ? " on" : "");
  me.innerHTML = examNow ? '<span class="dot"></span>Идёт экзамен'
    : avatarHtml(APP.user, 30) + `<span class="me-t"><span class="me-n">${esc(APP.user.fio)}</span><span class="me-r">${roleName(APP.user)}</span></span>`;
  me.title = examNow ? "" : "Профиль";
  me.onclick = () => examNow ? null : go("profile");
  if (staff && !mopo) refreshBadges();
}
function go(screen) {
  APP.screen = screen;
  if (isStaff(APP.user) && /^adm:/.test(screen)) { try { localStorage.setItem(modeKey(), "admin"); } catch (e) { /* — */ } }
  if (isStaff(APP.user) && /^(cabinet|notes|exam)$/.test(screen)) { try { localStorage.setItem(modeKey(), "mopo"); } catch (e) { /* — */ } }
  renderNav();
  if (screen === "cabinet") screenCabinet();
  if (screen === "notes") screenNotes();
  if (screen === "questions") screenQuestions();
  if (screen === "profile") screenProfile();
  if (screen === "exam") examGate();
  if (/^adm:/.test(screen)) screenAdmin(screen.slice(4));
}

/* ---------- кабинет: главная с карточками и экран блока ---------- */
const KIND = { видео:"▶", конспект:"✎", схема:"◆", тренажёр:"⚙", документ:"§", таблица:"▦",
               презентация:"▭", шаблон:"✎", файл:"⬓", сайт:"↗", практика:"✔", ссылка:"↗" };
const PR = { program: null, progress: null, block: null, sub: -1 };

async function loadCabinet(force) {
  if (APP.demo) {
    if (!PR.program || force) PR.program = await api("program");
    PR.progress = await api("progress.get");
  } else if (!PR.program || !PR.progress || force) {  /* один запрос: программа, прогресс, ключ материалов, правки тестов */
    applyBoot(await api("boot"));
  } else refreshBg();                                  /* копия уже есть — показываем её, свежее подтянем в фоне */
  try { await quizData(); } catch (e) { /* без описания тестов строки покажут общий текст */ }
  PR.progress.notes = PR.progress.notes || {};
  return PR;
}
/* номер блока на экране = его место в программе (порядок меняют в «Материалах»); n — постоянный код блока */
function blockNum(n) {
  const bs = (PR.program && PR.program.blocks) || [], i = bs.findIndex(b => Number(b.n) === Number(n));
  return i >= 0 ? (bs[i].num || i + 1) : n;
}
const subQuizzes = b => [b.quiz].concat(b.subs.map(s => s.quiz)).filter(Boolean);
/* материалы с пометкой «скоро» ещё не загружены — в прохождении их не считаем, пока не появятся */
const readyOf = ls => ls.filter(l => l.ready !== false);
function blockStat(b) {
  const all = b.subs.flatMap(s => s.lessons), lessons = readyOf(all);
  const done = lessons.filter(l => PR.progress.lessons[l.id]).length;
  const qs = subQuizzes(b), passed = qs.filter(q => (PR.progress.quizzes[q] || {}).passed).length;
  const kept = qs.filter(q => { const x = PR.progress.quizzes[q] || {}; return x.passed || x.retake; }).length;   /* тест обновили — следующий блок не запираем */
  return { lessons: lessons.length, soon: all.length - lessons.length, done: done, quizzes: qs, passed: passed,
           ready: done === lessons.length && passed === qs.length, opens: done === lessons.length && kept === qs.length, started: done > 0 || passed > 0 };
}
function openMap() {
  const out = {}; let allow = true;
  if (isStaff(APP.user)) { PR.program.blocks.forEach(b => out[b.n] = true); return out; }
  PR.program.blocks.forEach(b => { out[b.n] = allow; if (!blockStat(b).opens) allow = false; });
  return out;
}
/* «Продолжить»: последний открытый материал, если он ещё не отмечен пройденным; иначе — первый непройденный по порядку */
function continuePoint() {
  const id = PR.progress.lastLesson, f = id && lessonById(id);
  if (f && f.lesson.ready && !PR.progress.lessons[id] && openMap()[f.block.n]) return { block: f.block, lesson: f.lesson, last: true };
  return nextLesson();
}
function nextLesson() {                                   /* первый незакрытый материал по порядку */
  const open = openMap();
  for (const b of PR.program.blocks) {
    if (!open[b.n]) break;
    for (const sub of b.subs)
      for (const l of sub.lessons)
        if (l.ready && !PR.progress.lessons[l.id]) return { block: b, lesson: l };
    const st = blockStat(b);
    if (!st.ready) return { block: b, lesson: null };
  }
  return null;
}

async function screenCabinet(keep) {
  $("#htitle").textContent = "Обучение";
  $("#timer").hidden = true;
  if (!keep) $("#app").innerHTML = `<div class="card"><p class="lead">Загружаем программу…</p></div>`;
  try { await loadCabinet(); } catch (e) { return fail(e); }
  const open = openMap(), blocks = PR.program.blocks;
  const all = readyOf(blocks.flatMap(b => b.subs.flatMap(s => s.lessons)));
  const done = all.filter(l => PR.progress.lessons[l.id]).length;
  const qAll = blocks.flatMap(subQuizzes), qDone = qAll.filter(q => (PR.progress.quizzes[q] || {}).passed).length;
  const nx = continuePoint();
  $("#app").innerHTML = `
    <section class="hero">
      <div class="hero-main">
        <div class="eyebrow">Программа · ${plural(blocks.length, "блок", "блока", "блоков")}</div>
        <h2>Программа обучения</h2>
        <p>Блоки открываются по очереди: следующий — после мини-теста. Внутри блока можно свободно прыгать по темам,
           а к пройденному возвращаться в любой момент.</p>
        <div class="hstats">
          <span><b>${done}</b> из ${all.length} материалов</span>
          <span><b>${qDone}</b> из ${qAll.length} мини-тестов</span>
          <span><b>${pct(done, all.length)}%</b> пройдено</span>
        </div>
        <div class="hbar"><i style="width:${pct(done, all.length)}%"></i></div>
        <div class="hscale" aria-hidden="true">${blocks.map(b => {
          const s2 = blockStat(b), o2 = open[b.n];
          return `<i class="${s2.ready ? "done" : o2 ? "now" : "lock"}" style="--p:${pct(s2.done, s2.lessons)}%"><span>${blockNum(b.n)}</span></i>`;
        }).join("")}</div>
      </div>
      <div class="hero-side">
        <div class="hpct"><b>${pct(done, all.length)}</b><span>%</span></div>
        <div class="hpct-l">программы пройдено</div>
        ${nx ? `<button class="btn big" id="cont" type="button">${nx.last ? "Продолжить с того же места" : "Продолжить"}<small>${esc(nx.lesson ? nx.lesson.title : "блок " + blockNum(nx.block.n))}</small></button>` : ""}
      </div>
    </section>
    <div class="viewsw">
      <button type="button" data-v="grid">плитки</button><button type="button" data-v="list">лента</button></div>
    <div class="cards" id="cards"></div>`;
  const vw = localStorage.getItem("mopo-view") || "list";
  $("#app").querySelectorAll("[data-v]").forEach(b => {
    b.classList.toggle("on", b.dataset.v === vw);
    b.onclick = () => { localStorage.setItem("mopo-view", b.dataset.v); screenCabinet(); };
  });
  if (nx) $("#cont").onclick = () => {
    openBlock(nx.block.n, nx.lesson && nx.lesson.id);
    if (nx.last) openLesson(nx.lesson);                /* сразу открываем то, что смотрели */
  };
  const host = $("#cards");
  host.className = "cards " + (localStorage.getItem("mopo-view") || "list");
  blocks.forEach(b => {
    const st = blockStat(b), isOpen = open[b.n];
    const state = st.ready ? "done" : isOpen ? "now" : "lock";
    const c = el("button", "bcard " + state); c.type = "button";
    c.innerHTML = `<span class="bc-n" aria-hidden="true">${String(blockNum(b.n)).padStart(2, "0")}</span><div class="bc-ico">${blockIcon(b.n)}</div>
      <div class="bc-body">
        <div class="bc-line"><span class="bc-num">Блок ${blockNum(b.n)}</span>
          <span class="bc-state">${st.ready ? "пройден" : isOpen ? "идёт сейчас" : "закрыт"}</span></div>
        <h4>${esc(b.title)}</h4>
        <div class="bc-meta">${plural(st.lessons, "материал", "материала", "материалов")}${st.quizzes.length ? " · " + plural(st.quizzes.length, "тест", "теста", "тестов") : ""}</div>
      </div>
      <div class="bc-prog"><div class="hbar small"><i style="width:${pct(st.done, st.lessons)}%"></i></div>
        <span>${st.done} / ${st.lessons}${st.quizzes.length ? " · тесты " + st.passed + "/" + st.quizzes.length : ""}</span></div>`;
    c.onclick = () => isOpen ? openBlock(b.n) : toast("Блок откроется, когда закроете предыдущий: материалы и мини-тест.");
    host.appendChild(c);
  });
}

/* ---------- экран одного блока ---------- */
function openBlock(n, focusLesson, subIndex) {
  PR.block = n;
  const b = PR.program.blocks.filter(x => x.n === n)[0];
  if (!b) return screenCabinet();
  const st = blockStat(b), subs = b.subs;
  const many = subs.length > 1;
  const indexable = subs.length > 5;                           /* большой блок (продукты) — сначала список тем */
  let cur = subIndex;
  if (cur === undefined || cur < 0) {                                   /* открываем тот подблок, где человек остановился */
    cur = subs.findIndex(s => s.lessons.some(l => l.ready && !PR.progress.lessons[l.id]));
    if (cur < 0) cur = 0;
  }
  if (focusLesson) {
    const i = subs.findIndex(s => s.lessons.some(l => l.id === focusLesson));
    if (i >= 0) cur = i;
  }
  const notesCount = Object.keys(PR.progress.notes || {})
    .filter(k => subs.some(s => s.lessons.some(l => l.id === k)))
    .reduce((acc, k) => acc + (PR.progress.notes[k] || []).filter(x => !x.kind || x.kind === "note").length, 0);
  $("#htitle").textContent = "Блок " + n;
  $("#app").innerHTML = `
    <div class="crumbs"><button class="link" id="back" type="button">← Все блоки</button></div>
    <section class="bhero">
      <div class="bc-ico big">${blockIcon(n)}</div>
      <div><div class="bc-num">Блок ${n}${st.ready ? " · пройден" : ""}</div>
        <h2>${esc(b.title)}</h2>${b.intro ? `<p class="lead">${esc(b.intro)}</p>` : ""}</div>
    </section>
    <div class="res">
      <div><b>${st.done} / ${st.lessons}</b><span>материалов пройдено</span></div>
      <div><b>${st.passed} / ${st.quizzes.length}</b><span>мини-тестов сдано</span></div>
      <div><b>${pct(st.done, st.lessons)}%</b><span>готовность блока</span></div>
      <div><b>${notesCount}</b><span>ваших заметок</span></div>
    </div>
    ${st.soon ? `<p class="hint soonnote">Ещё ${plural(st.soon, "материал не загружен", "материала не загружено", "материалов не загружено")} — вернитесь позже. На закрытие блока это не влияет.</p>` : ""}
    ${many && !indexable ? `<div class="chips sticky" id="chips">
        ${subs.map((s, i) => {
          const rl = readyOf(s.lessons), dn = rl.filter(l => PR.progress.lessons[l.id]).length;
          const q = s.quiz ? PR.progress.quizzes[s.quiz] : null;
          const cls = dn === rl.length && (!s.quiz || (q && q.passed)) ? "ok" : dn ? "part" : "";
          return `<button type="button" data-i="${i}" class="${cls}${i === cur ? " on" : ""}">${esc(s.title || "Материалы")}<i>${dn}/${rl.length}</i></button>`;
        }).join("")}
        <button type="button" data-all="1" class="ghost">Показать все темы</button></div>` : ""}
    <div id="subs"></div>`;
  $("#back").onclick = screenCabinet;
  const host = $("#subs");

  const subStat = sub => {
    const rl = readyOf(sub.lessons), dn = rl.filter(l => PR.progress.lessons[l.id]).length;
    const q = sub.quiz ? PR.progress.quizzes[sub.quiz] : null;
    return { dn, q, total: rl.length, ok: dn === rl.length && (!sub.quiz || (q && q.passed)) };
  };
  const drawSub = (sub, i) => {
    const sec = el("section", "sub"); sec.id = "sub-" + i;
    const { dn, q } = subStat(sub);
    if (sub.title) sec.innerHTML = `<div class="subhead"><h3>${esc(sub.title)}</h3>
      <span>${dn} / ${readyOf(sub.lessons).length}${sub.quiz ? (q && q.passed ? " · тест сдан" : q && q.retake ? " · тест обновлён" : " · тест не сдан") : ""}</span>
      <div class="hbar small"><i style="width:${pct(dn, readyOf(sub.lessons).length)}%"></i></div></div>`;
    sub.lessons.forEach(l => sec.appendChild(lessonRow(l)));
    if (sub.quiz) sec.appendChild(quizRow(sub.quiz, "Мини-тест: " + (sub.title || b.title)));
    host.appendChild(sec);
  };

  /* --- большой блок: сперва список тем, потом одна тема --- */
  const drawIndex = () => {
    host.innerHTML = "";
    const done = subs.filter(s => subStat(s).ok).length;
    const head = el("div", "subhead plain");
    head.innerHTML = `<h3>Темы блока</h3><span>${done} / ${subs.length} закрыто</span>
      <div class="hbar small"><i style="width:${pct(done, subs.length)}%"></i></div>`;
    host.appendChild(head);
    const list = el("div", "tlist");
    subs.forEach((sub, i) => {
      const { dn, q, total, ok } = subStat(sub);
      const row = el("button", "trow " + (ok ? "ok" : dn ? "part" : "")); row.type = "button";
      row.innerHTML = `<span class="tnum">${i + 1}</span>
        <span class="tt">${esc(sub.title || "Материалы")}
          <small>${plural(total, "материал", "материала", "материалов")}${sub.quiz ? " · мини-тест" + (q && q.passed ? " сдан" : q && q.retake ? " обновлён — пересдайте" : "") : ""}</small></span>
        <span class="tpr"><span class="hbar small"><i style="width:${pct(dn, total)}%"></i></span><i>${dn}/${total}</i></span>
        <span class="tgo">${ok ? "✓" : "→"}</span>`;
      row.onclick = () => openBlock(n, null, i);
      list.appendChild(row);
    });
    host.appendChild(list);
    if (b.quiz) host.appendChild(quizRow(b.quiz, "Итоговый мини-тест по блоку " + blockNum(n)));
  };
  const drawTopic = () => {
    host.innerHTML = "";
    const nav = el("div", "crumbs sub");
    nav.innerHTML = `<button class="link" type="button" data-up="1">← Все темы блока ${n}</button>
      <span class="cpos">Тема ${cur + 1} из ${subs.length}</span>`;
    host.appendChild(nav);
    nav.querySelector("[data-up]").onclick = () => openBlock(n, null, -1);
    drawSub(subs[cur], cur);
    const near = el("div", "tnav");
    if (cur > 0) {
      const p = el("button", "go", '<span>← предыдущая тема</span><i>' + esc(subs[cur - 1].title || "") + "</i>");
      p.type = "button"; p.onclick = () => openBlock(n, null, cur - 1); near.appendChild(p);
    }
    if (cur < subs.length - 1) {
      const x = el("button", "go next", '<span>следующая тема →</span><i>' + esc(subs[cur + 1].title || "") + "</i>");
      x.type = "button"; x.onclick = () => openBlock(n, null, cur + 1); near.appendChild(x);
    }
    host.appendChild(near);
    if (focusLesson) {
      const row = document.getElementById("les-" + focusLesson);
      if (row) { row.scrollIntoView({ behavior: "smooth", block: "center" }); row.classList.add("flash"); }
    }
  };

  if (indexable) {
    if (subIndex === -1 || (subIndex === undefined && !focusLesson)) { PR.sub = -1; drawIndex(); }
    else { PR.sub = cur; drawTopic(); }
    return;
  }
  PR.sub = -1;

  const render = mode => {
    host.innerHTML = "";
    if (mode === "all" || !many) subs.forEach(drawSub);
    else drawSub(subs[cur], cur);
    if (b.quiz && (mode === "all" || !many || cur === subs.length - 1)) host.appendChild(quizRow(b.quiz, "Мини-тест по блоку " + blockNum(n)));
    if (focusLesson) {
      const row = document.getElementById("les-" + focusLesson);
      if (row) { row.scrollIntoView({ behavior: "smooth", block: "center" }); row.classList.add("flash"); }
    }
  };
  render();
  if (many) {
    const chips = $("#chips");
    chips.querySelectorAll("[data-i]").forEach(btn => btn.onclick = () => {
      cur = +btn.dataset.i; focusLesson = null;
      chips.querySelectorAll("button").forEach(x => x.classList.remove("on"));
      btn.classList.add("on"); render(); window.scrollTo({ top: chips.offsetTop - 70, behavior: "smooth" });
    });
    chips.querySelector("[data-all]").onclick = e => {
      const on = e.target.classList.toggle("on");
      e.target.textContent = on ? "Показать по темам" : "Показать все темы";
      chips.querySelectorAll("[data-i]").forEach(x => x.classList.remove("on"));
      render(on ? "all" : "one");
    };
  }
}
function lessonRow(l) {
  const done = !!PR.progress.lessons[l.id];
  const all = (PR.progress.notes || {})[l.id] || [], notes = all.filter(n => !n.kind || n.kind === "note"),
        hls = all.filter(n => n.kind === "hl").length, marked = all.some(n => n.kind === "bm");
  const row = el("div", "les" + (l.ready ? "" : " soon") + (done ? " done" : "")); row.id = "les-" + l.id;
  row.innerHTML = `<div class="ic">${KIND[l.kind] || "•"}</div>
    <div class="t">${esc(l.title)}<small>${esc(l.kind)}${l.note ? " · " + esc(l.note) : ""}${notes.length ? " · " + plural(notes.length, "заметка", "заметки", "заметок") : ""}${hls ? " · " + plural(hls, "выделение", "выделения", "выделений") : ""}</small></div>`;
  if (l.ready) {
    const ext = l.kind === "сайт" && NOFRAME.test(String(l.url));           /* такой сайт показывается только отдельной вкладкой */
    const open = el("button", "go", ext ? "Открыть в новой вкладке ↗" : "Открыть"); open.type = "button"; open.onclick = () => openLesson(l);
    if (ext) open.title = "Этот сайт не разрешает показывать себя внутри кабинета";
    const note = el("button", "go quiet", notes.length ? "Заметки" : "Заметка"); note.type = "button"; note.onclick = () => notesFor(l);
    const star = el("button", "star" + (marked ? " on" : ""), marked ? "★" : "☆"); star.type = "button";
    star.title = marked ? "Убрать из закладок" : "В закладки";
    star.onclick = async () => { await toggleBookmark(l); backToPlace(); };
    row.appendChild(star);
    const chk = el("button", "chk" + (done ? " on" : ""), done ? "✓" : "");
    chk.type = "button"; chk.title = done ? "Отметить непройденным" : "Отметить пройденным";
    chk.onclick = () => { save("progress", { lessonId: l.id, done: !done }); backToPlace(); };
    row.appendChild(note); row.appendChild(open); row.appendChild(chk);
  } else row.appendChild(el("span", "tag", "скоро"));
  return row;
}
function quizMeta(quizId) {
  const m = QZ.data && QZ.data.quizzes[quizId];
  const n = m ? m.questions.length : 5, pass = m ? m.pass : 3;
  return plural(n, "вопрос", "вопроса", "вопросов") + ", порог " + pass + " — попытки не ограничены";
}
function quizRow(quizId, title) {
  const q = (PR.progress.quizzes || {})[quizId] || { attempts: 0 };
  const row = el("div", "les quiz");
  row.innerHTML = `<div class="ic">✓</div><div class="t">${esc(title)}
    <small>${q.passed ? `сдан: ${q.best} из ${q.total}` : q.retake ? `<b class="upd">Тест обновили — пройдите его заново.</b> Прежняя сдача сохранена, следующие блоки открыты` : q.attempts ? `попыток: ${q.attempts}, лучший ${q.best} из ${q.total}` : quizMeta(quizId)}</small></div>`;
  if (q.attempts) {
    const r = el("button", "go quiet", "Разбор"); r.type = "button";
    r.title = "Посмотреть свои ответы и пояснения по последней попытке";
    r.onclick = () => showQuizReview(quizId, title);
    row.appendChild(r);
  }
  const b = el("button", "btn" + (q.passed ? " ghost" : ""), q.passed ? "Пройти ещё раз" : "Пройти тест");
  b.type = "button"; b.onclick = () => startQuiz(quizId, title);
  row.appendChild(b);
  return row;
}
function mmss(sec) {
  sec = Math.max(0, Math.round(sec));
  return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
}
function driveEmbed(url) {
  const m = String(url).match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (m) return "https://drive.google.com/file/d/" + m[1] + "/preview";
  const d = String(url).match(/docs\.google\.com\/(document|presentation|spreadsheets)\/d\/([^/]+)/);
  if (d && d[1] === "presentation") return `https://docs.google.com/presentation/d/${d[2]}/embed?start=false&loop=false`;   /* режим показа: без «редактировать» и «скачать» */
  if (d) return `https://docs.google.com/${d[1]}/d/${d[2]}/preview`;
  return url;
}
const NOFRAME = /(^|\/\/)(www\.)?prom-import\.com/i;   /* сайт Пром-Импорта пока запрещает встраивание (X-Frame-Options) */
function isInternal(u) { return /^(konspekt|shemy)\//.test(String(u)); }
/* маркеры для выделений: 5 цветов, одинаковые в кабинете и в конспекте */
const MARKERS = [null, { n: "жёлтый", c: "#FFE070" }, { n: "зелёный", c: "#8EDDA4" }, { n: "голубой", c: "#9CC4FF" },
                 { n: "розовый", c: "#FFA9C9" }, { n: "оранжевый", c: "#FFBE7D" }];
const isHl = n => n.kind === "hl";
const notesOf = id => (PR.progress.notes || {})[id] || [];
const dots = (cur, attr) => MARKERS.slice(1).map((m, i) =>
  `<button type="button" class="mk${cur === i + 1 ? " on" : ""}" ${attr}="${i + 1}" title="${m.n}" style="--mk:${m.c}"></button>`).join("");

async function toggleBookmark(l) {
  const bm = notesOf(l.id).filter(n => n.kind === "bm")[0];
  if (bm) save("note.del", { lessonId: l.id, id: bm.id });
  else save("note.save", { lessonId: l.id, kind: "bm", text: l.title });
  toast(bm ? "Убрано из закладок" : "Добавлено в закладки — они в «Моих записях»");
}

/* после закрытия окна — туда же, где его открывали, с той же прокруткой */
async function backToPlace() {
  const y = window.scrollY;
  if (document.getElementById("subs") && PR.block) { openBlock(PR.block, null, PR.sub); window.scrollTo(0, y); }
  else if (document.getElementById("cards")) { await screenCabinet(true); window.scrollTo(0, y); }
  else if (document.getElementById("nlist")) { await screenNotes(true); window.scrollTo(0, y); }
}

/* ---------- закрытые материалы ----------
   Конспекты, схемы и банк вопросов лежат на сайте зашифрованными. Ключ кабинет получает у сервера после входа
   и расшифровывает файлы прямо в браузере — быстро и без лишних запросов. */
let MAT_KEY = null, MAT_HEX = "";
async function matKey() {
  if (MAT_KEY) return MAT_KEY;
  const hex = (MAT_HEX || (await api("mat.key")).key || "").trim();
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error("сервер не дал ключ материалов — обновите код скрипта и разверните новую версию");
  const raw = new Uint8Array(hex.match(/../g).map(h => parseInt(h, 16)));      /* ключ приходит вместе с программой при входе */
  return (MAT_KEY = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]));
}
async function matLoad(path) {                       /* path: konspekt/dso.html, shemy/index.html, data/quiz.json */
  if (APP.demo) return fetch(path, { cache: "no-store" }).then(r => r.text());
  const name = path.replace("data/", "").replace("/", "__") + ".enc";
  const [key, b64] = await Promise.all([matKey(), fetch("m/" + name, { cache: "force-cache" }).then(r => {
    if (!r.ok) throw new Error("файл не найден на сайте (" + r.status + ")");
    return r.text();
  })]);
  const bytes = Uint8Array.from(atob(b64.trim()), c => c.charCodeAt(0));
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, key, bytes.slice(12));
  return new TextDecoder().decode(plain);
}
/* водяной знак: имя и дата поверх конспекта — чтобы пересылать снимки было неприятно */
function watermark(html) {
  const who = esc(APP.user.fio + " · " + new Date().toLocaleDateString("ru-RU"));
  const wm = `<style>.mopo-wm{position:fixed;right:10px;bottom:8px;z-index:2147483000;pointer-events:none;
    font:600 10px/1.2 Arial,sans-serif;color:rgba(0,0,0,.20);letter-spacing:.04em}
    @media print{.mopo-wm{color:rgba(0,0,0,.35)}}</style><div class="mopo-wm">${who}</div>`;
  return html.includes("</body>") ? html.replace("</body>", wm + "</body>") : html + wm;
}
/* ---------- документы Google через сервер ----------
   Документы и таблицы приходят HTML-копией (выделение маркером работает как в конспектах),
   презентации и PDF — файлом, листаются кликом по краю слайда. Копия хранится в браузере: открывается сразу,
   а сервер в фоне проверяет, не обновили ли оригинал. */
function gdocKind(l) {
  const u = String(l.url || "");
  if (/docs\.google\.com\/(document|spreadsheets)\//.test(u)) return "html";
  if (/docs\.google\.com\/presentation\//.test(u)) return "pdf";
  if (l.kind !== "видео" && /drive\.google\.com\/(file\/d\/|open\?id=)/.test(u)) return "pdf";
  return "";
}
const DOCC = "mopo-docs-v1";
async function docCacheGet(id) { try { const r = await (await caches.open(DOCC)).match("/__doc/" + encodeURIComponent(id)); return r ? await r.json() : null; } catch (e) { return null; } }
async function docCachePut(id, v) { try { await (await caches.open(DOCC)).put("/__doc/" + encodeURIComponent(id), new Response(JSON.stringify(v), { headers: { "Content-Type": "application/json" } })); } catch (e) { } }
const docPage = (text) => `<body style="font:15px/1.5 Arial,sans-serif;color:#232227;padding:28px">${text}</body>`;
const DOC_CSS = `<style>body{max-width:880px!important;margin:0 auto!important;padding:28px 36px 60px!important;background:#fff}
  img{max-width:100%!important;height:auto!important} table{max-width:100%}</style>`;
function docInject(html) {
  const head = SHIM_JS + HL_CSS + DOC_CSS;
  let h = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => m + head) : head + html;
  h = h.includes("</body>") ? h.replace("</body>", HL_JS + "</body>") : h + HL_JS;
  return watermark(h);
}
function pdfPage(b64) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;background:#2E2D33;overflow:hidden;font:13px Arial,sans-serif}
  #st{position:absolute;inset:0 0 46px 0;display:flex;align-items:center;justify-content:center}
  #pg{position:relative;background:#fff;box-shadow:0 8px 28px rgba(0,0,0,.45)} #pg canvas{display:block}
  .textLayer{position:absolute;inset:0;overflow:hidden;line-height:1;opacity:1}
  .textLayer span,.textLayer br{color:transparent;position:absolute;white-space:pre;cursor:text;transform-origin:0 0}
  .textLayer ::selection{background:rgba(230,96,35,.35)}
  .nav{position:absolute;top:0;bottom:46px;width:18%;z-index:3;cursor:pointer;display:flex;align-items:center;color:rgba(255,255,255,0);font-size:34px;transition:color .15s}
  .nav:hover{color:rgba(255,255,255,.75)} .nav.l{left:0;justify-content:flex-start;padding-left:14px} .nav.r{right:0;justify-content:flex-end;padding-right:14px}
  #bar{position:absolute;left:0;right:0;bottom:0;height:46px;display:flex;align-items:center;justify-content:center;gap:14px;color:#fff}
  #bar button{background:rgba(255,255,255,.12);border:0;color:#fff;border-radius:999px;padding:7px 14px;font:600 13px Arial;cursor:pointer}
  #msg{color:#fff;font-size:15px}</style></head><body>
  <div id="st"><div id="msg">Загружаем…</div></div><div class="nav l" id="prev">‹</div><div class="nav r" id="next">›</div>
  <div id="bar"><button id="b1">‹ Назад</button><span id="num"></span><button id="b2">Вперёд ›</button></div>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
  <script>(async function(){
    var W="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    try{ var wt=await (await fetch(W)).text(); pdfjsLib.GlobalWorkerOptions.workerSrc=URL.createObjectURL(new Blob([wt],{type:"text/javascript"})); }
    catch(e){ pdfjsLib.GlobalWorkerOptions.workerSrc=W; }
    var raw=atob("${b64}"), u=new Uint8Array(raw.length); for(var i=0;i<raw.length;i++) u[i]=raw.charCodeAt(i);
    var pdf=await pdfjsLib.getDocument({data:u}).promise, cur=1, busy=false, st=document.getElementById("st");
    async function show(n){
      if(busy||n<1||n>pdf.numPages) return; busy=true; cur=n;
      var page=await pdf.getPage(n), v1=page.getViewport({scale:1});
      var s=Math.min((st.clientWidth-24)/v1.width,(st.clientHeight-24)/v1.height), dpr=window.devicePixelRatio||1;
      var vp=page.getViewport({scale:s}), hv=page.getViewport({scale:s*dpr});
      var box=document.createElement("div"); box.id="pg"; box.style.width=vp.width+"px"; box.style.height=vp.height+"px";
      var c=document.createElement("canvas"); c.width=hv.width; c.height=hv.height; c.style.width=vp.width+"px"; c.style.height=vp.height+"px";
      box.appendChild(c); await page.render({canvasContext:c.getContext("2d"),viewport:hv,intent:"print"}).promise;
      var tl=document.createElement("div"); tl.className="textLayer"; tl.style.setProperty("--scale-factor",s); box.appendChild(tl);
      try{ await pdfjsLib.renderTextLayer({textContentSource:await page.getTextContent(),container:tl,viewport:vp}).promise; }catch(e){}
      st.innerHTML=""; st.appendChild(box); document.getElementById("num").textContent=n+" / "+pdf.numPages; busy=false;
    }
    document.getElementById("prev").onclick=document.getElementById("b1").onclick=function(){show(cur-1)};
    document.getElementById("next").onclick=document.getElementById("b2").onclick=function(){show(cur+1)};
    document.addEventListener("keydown",function(e){ if(e.key==="ArrowLeft"||e.key==="PageUp") show(cur-1); if(e.key==="ArrowRight"||e.key==="PageDown"||e.key===" ") show(cur+1); });
    window.addEventListener("resize",function(){ var n=cur; busy=false; show(n); });
    show(1);
  })().catch(function(e){ document.getElementById("st").innerHTML='<div id="msg">Не удалось показать файл: '+e.message+'</div>'; });<\/script></body></html>`;
}
function renderDoc(frame, r) {
  frame.srcdoc = r.kind === "html" ? docInject(r.html) : watermark(pdfPage(r.pdf));
}
async function loadDoc(frame, l) {
  const cached = await docCacheGet(l.id);
  if (cached) renderDoc(frame, cached);
  else frame.srcdoc = docPage("Загружаем документ… В первый раз это несколько секунд, дальше он откроется сразу.");
  try {
    const r = await api("doc.get", { lessonId: l.id, have: cached ? cached.mt : "" });
    if (r.same) return;
    await docCachePut(l.id, r);
    if (!frame.isConnected) return;
    renderDoc(frame, r);
    if (cached) toast("Документ обновили — показываем свежую версию");
  } catch (e) { if (!cached && frame.isConnected) frame.srcdoc = docPage("Не удалось открыть документ: " + esc(e.message)); }
}
async function loadInner(frame, url) {
  const [path, query] = String(url).split("?");
  const topic = new URLSearchParams(query || "").get("t") || "";
  try {
    const html = await matLoad(path);
    const shim = SHIM_JS;
    frame.srcdoc = shim + (topic ? `<script>window.__topic=${JSON.stringify(topic)}<\/script>` : "") + watermark(html);
  } catch (e) {
    frame.srcdoc = `<body style="font:15px/1.5 Arial,sans-serif;color:#232227;padding:24px">Не удалось открыть материал: ${esc(e.message)}<br><br>Обновите страницу и попробуйте ещё раз.</body>`;
  }
}
/* страница показана «изнутри» кабинета: якоря оглавления и история браузера иначе уводят на сам кабинет */
const SHIM_JS = `<script>(function(){
      var r=history.replaceState.bind(history),p=history.pushState.bind(history);
      history.replaceState=function(){try{r.apply(null,arguments)}catch(e){}};
      history.pushState=function(){try{p.apply(null,arguments)}catch(e){}};
      document.addEventListener("click",function(e){
        var a=e.target.closest&&e.target.closest("a[href]"); if(!a) return;
        var h=a.getAttribute("href")||"";
        if(h.charAt(0)==="#"){ e.preventDefault(); var id=decodeURIComponent(h.slice(1));
          var t=id?(document.getElementById(id)||document.querySelector('[name="'+id+'"]')):document.body;
          if(t) t.scrollIntoView({behavior:"smooth",block:"start"}); return; }
        if(/^https?:/i.test(h)){ e.preventDefault(); window.open(h,"_blank","noopener"); }
      },true);
    })();<\/script>`;
function openLesson(l, at, quote) {
  PR.progress.lastLesson = l.id;
  LOC.l = l.id;
  save("lesson.open", { lessonId: l.id });
  /* сайты, которые запрещают показывать себя внутри чужих страниц, — сразу отдельной вкладкой.
     Авито и Дром разрешают — они открываются внутри, с заметками сбоку и кнопкой «в новой вкладке» */
  if (l.kind === "сайт" && NOFRAME.test(String(l.url))) {
    LOC.l = null;
    const w = window.open(l.url, "_blank");
    if (w) { try { w.opener = null; } catch (e) { } toast("Сайт открыт в новой вкладке"); }
    else toast("Браузер не дал открыть вкладку — разрешите всплывающие окна для этого сайта");
    return;
  }
  const v = el("div", "viewer split");
  const gk = APP.demo ? "" : gdocKind(l), proxied = !!gk;                 /* документ Google — копией через сервер */
  const video = l.kind === "видео", inner = isInternal(l.url), framed = inner || proxied;
  const textual = /^konspekt\//.test(String(l.url)) || gk === "html";
  const slides = /docs\.google\.com\/presentation\//.test(String(l.url));
  const src = inner ? l.url : driveEmbed(l.url);
  let tab = quote && notesOf(l.id).some(n => isHl(n) && n.quote === quote) ? "hl" : "note";
  v.innerHTML = `<div class="vhead"><b>${esc(l.title)}</b>
      ${framed ? "" : '<button type="button" data-a="newtab" class="quiet">Открыть в новой вкладке ↗</button>'}
      <button type="button" data-a="notes" class="on first">Заметки</button>
      <button type="button" data-a="ask">${isStaff(APP.user) ? "Вопрос разработчику" : "Спросить РОПа"}</button>
      <button type="button" data-a="bm" class="bm"></button>
      <button type="button" data-a="close">Закрыть</button></div>
    <div class="vbody">
      <iframe ${framed ? "" : `src="${esc(src)}"`} allow="autoplay; fullscreen" ${framed ? "" : 'referrerpolicy="no-referrer"'}></iframe>
      <aside class="vnotes">
        ${textual ? `<div class="seg"><button type="button" data-tab="note">Заметки <i></i></button><button type="button" data-tab="hl">Выделения <i></i></button></div>`
                  : "<h4>Заметки к материалу</h4>"}
        <div class="pane" data-pane="note">
          ${video ? `<div class="tcbar">
              <button type="button" class="tcrun" data-a="tc">▶ 0:00</button>
              <button type="button" class="tcput" data-a="put">⏱ 0:00 → в заметку</button>
              <input type="text" class="ntime" placeholder="12:40" inputmode="numeric">
              <button type="button" class="link" data-a="tcreset">сброс</button>
            </div>
            <p class="hint tiny">Счётчик идёт по вашим кликам по видео: Google Диск не сообщает, на какой минуте плеер. Пока видео грузится и после перемотки время может разойтись — поправьте его в поле вручную.</p>` : ""}
          ${textual ? '<p class="hint tiny">Выделите фразу в конспекте: цветной маркер — в «Выделения», кнопка «Заметка» — сюда.</p>' : ""}
          ${gk === "pdf" ? '<p class="hint tiny">Листайте кликом по левому или правому краю, кнопками внизу или стрелками ← →. Текст на слайде можно выделить и скопировать в заметку.</p>'
            : slides ? '<p class="hint tiny">Текст со слайдов скопировать нельзя — Google показывает их картинками. Листайте стрелками ← → на клавиатуре или под слайдом.</p>'
            : !textual && !video ? '<p class="hint tiny">Маркер и цитаты по выделению работают только в конспектах. Здесь нужную фразу скопируйте (⌘C) и вставьте в заметку.</p>' : ""}
          <textarea class="ntext" placeholder="Пишите прямо во время просмотра — окно не закрывается"></textarea>
          <div class="nbtns"><button class="btn" data-a="save" type="button">Сохранить заметку</button>
            <button class="btn ghost" data-a="clear" type="button" hidden>Сбросить</button></div>
          <div class="nlist"></div>
        </div>
        ${textual ? `<div class="pane" data-pane="hl" hidden>
          <div class="hlfilter"><span>Показать:</span><button type="button" class="all on" data-hf="0">все</button>${dots(0, "data-hf")}</div>
          <p class="hint tiny">Фильтр действует и на список, и на подсветку в самом тексте. Цвет выделения можно поменять кружками.</p>
          <div class="hlist"></div></div>` : ""}
      </aside></div>`;
  const frame = () => v.querySelector("iframe").contentWindow;
  const hf = new Set();                              /* фильтр выделений по цвету */
  const hfOk = n => !hf.size || hf.has(n.color || 1);
  const marks = () => notesOf(l.id).filter(n => n.quote && (!isHl(n) || hfOk(n)))
    .map(n => ({ text: n.quote, color: isHl(n) ? (n.color || 1) : 0 }));
  const post = msg => { try { frame().postMessage(msg, "*"); } catch (e) { /* ещё грузится */ } };

  const close = () => {
    LOC.l = null;
    v.remove(); lockScroll(false); window.removeEventListener("message", onMsg);
    if (tick) clearInterval(tick);
    if (watchFocus) window.removeEventListener("blur", watchFocus);
    backToPlace();
  };
  v.querySelector('[data-a="close"]').onclick = close;
  if (v.querySelector('[data-a="newtab"]')) v.querySelector('[data-a="newtab"]').onclick = () => {      /* оригинал материала отдельной вкладкой: Диск, документ или страница кабинета */
    const w = window.open(l.url, "_blank");                    /* без noopener: иначе браузер всегда возвращает null */
    if (w) try { w.opener = null; } catch (e) { /* не страшно */ }
    if (!w && !APP.demo) toast("Браузер не дал открыть вкладку — разрешите всплывающие окна для этого сайта");
    else if (!w) toast("В демо-ссылке браузер блокирует новые вкладки. На вашем сайте кнопка откроет материал отдельно.");
  };
  const paintBm = () => {
    const on = notesOf(l.id).some(n => n.kind === "bm");
    const b = v.querySelector('[data-a="bm"]');
    b.textContent = on ? "★ В закладках" : "☆ В закладки"; b.classList.toggle("on", on);
  };
  v.querySelector('[data-a="bm"]').onclick = async () => { await toggleBookmark(l); paintBm(); };
  paintBm();
  v.querySelector('[data-a="ask"]').onclick = () => askRop(l);
  v.querySelector('[data-a="notes"]').onclick = () => {
    v.classList.toggle("nonotes");
    v.querySelector('[data-a="notes"]').classList.toggle("on", !v.classList.contains("nonotes"));
  };
  const showTab = t => {
    tab = t;
    v.querySelectorAll("[data-tab]").forEach(b => b.classList.toggle("on", b.dataset.tab === t));
    v.querySelectorAll("[data-pane]").forEach(p => p.hidden = p.dataset.pane !== t);
  };
  v.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => showTab(b.dataset.tab));
  v.querySelectorAll("[data-hf]").forEach(b => b.onclick = () => {
    const c = Number(b.dataset.hf);
    if (!c) hf.clear(); else hf.has(c) ? hf.delete(c) : hf.add(c);
    v.querySelectorAll("[data-hf]").forEach(x => { const k = Number(x.dataset.hf); x.classList.toggle("on", k ? hf.has(k) : !hf.size); });
    draw(); post({ mopo: "reset", list: marks() });
  });

  /* --- секундомер для видео: Диск не отдаёт позицию плеера, поэтому считаем сами --- */
  let tick = null, acc = 0, t0 = 0, watchFocus = null;
  const secs = () => acc + (t0 ? (Date.now() - t0) / 1000 : 0);
  if (video) {
    const btn = v.querySelector('[data-a="tc"]'), inp = v.querySelector(".ntime"), put = v.querySelector('[data-a="put"]');
    const paint = () => {
      btn.textContent = (t0 ? "⏸ " : "▶ ") + mmss(secs());
      btn.classList.toggle("on", !!t0);
      put.textContent = "⏱ " + mmss(secs()) + " → в заметку";
    };
    const run = on => {
      if (on && !t0) { t0 = Date.now(); if (!tick) tick = setInterval(paint, 500); }
      if (!on && t0) { acc = secs(); t0 = 0; }
      paint();
    };
    btn.onclick = () => run(!t0);
    put.onclick = () => { inp.value = mmss(secs()); toast("Таймкод " + inp.value + " добавлен к заметке"); };
    v.querySelector('[data-a="tcreset"]').onclick = () => { acc = 0; t0 = 0; paint(); };
    paint();
    /* Диск не сообщает, играет ли видео. Ловим клик по плееру: мышь над видео + фокус ушёл в плеер.
       После клика забираем фокус обратно, чтобы поймать и следующий клик (пауза). Первые 1,5 с после открытия не считаем. */
    const fr = v.querySelector("iframe"), openedAt = Date.now();
    let over = false;
    const sink = el("button", "tcsink"); sink.type = "button"; sink.tabIndex = -1; sink.setAttribute("aria-hidden", "true");
    v.appendChild(sink);
    fr.addEventListener("mouseenter", () => { over = true; });
    fr.addEventListener("mouseleave", () => { over = false; });
    watchFocus = () => {
      setTimeout(() => {
        if (document.activeElement !== fr || !over || Date.now() - openedAt < 1500) return;
        run(!t0);
        setTimeout(() => { try { sink.focus({ preventScroll: true }); } catch (e) { } }, 150);
      }, 60);
    };
    window.addEventListener("blur", watchFocus);
  }
  if (at) toast("Ваша отметка: " + at + " — перемотайте видео на это место");

  /* --- разговор с конспектом --- */
  const onMsg = async e => {
    const d = e.data || {};
    if (d.mopo === "ready") {
      post({ mopo: "reset", list: marks() });
      if (quote) setTimeout(() => post({ mopo: "focus", text: quote }), 250);
    }
    if (d.mopo === "quote") {
      if (v.classList.contains("nonotes")) {           /* панель была спрятана — показываем, иначе заметка «пропадёт» */
        v.classList.remove("nonotes"); v.querySelector('[data-a="notes"]').classList.add("on");
      }
      showTab("note");
      const ta = v.querySelector(".ntext");
      ta.dataset.quote = d.text; ta.focus();
      v.querySelector(".qprev") && v.querySelector(".qprev").remove();
      ta.insertAdjacentHTML("beforebegin", `<div class="nquote qprev"><span>«${esc(d.text)}»</span>
        <button type="button" class="qx" title="Убрать цитату">×</button></div>`);
      v.querySelector(".qprev .qx").onclick = () => { v.querySelector(".qprev").remove(); delete ta.dataset.quote; };
      v.querySelector('[data-a="clear"]').hidden = false;
    }
    if (d.mopo === "hl") {
      save("note.save", { lessonId: l.id, kind: "hl", quote: d.text, color: d.color });
      draw(); showTab("hl"); post({ mopo: "reset", list: marks() });
      toast("Выделение сохранено");
    }
  };
  if (framed) window.addEventListener("message", onMsg);

  const draw = () => {
    const all = notesOf(l.id).slice().reverse(), notes = all.filter(n => n.kind !== "hl" && n.kind !== "bm"), hlAll = all.filter(isHl), hls = hlAll.filter(hfOk);
    const cnt = v.querySelectorAll("[data-tab] i");
    if (cnt.length) { cnt[0].textContent = notes.length || ""; cnt[1].textContent = hlAll.length || ""; }
    v.querySelector(".nlist").innerHTML = notes.length ? notes.map(n => `<div class="note-item">
        <div class="ni-head"><b>${esc((n.at || "").slice(0, 10))}</b>${n.time ? `<span class="tc">▶ ${esc(n.time)}</span>` : ""}</div>
        ${n.quote ? `<div class="nquote">«${esc(n.quote)}»</div>` : ""}
        <p>${esc(n.text)}</p>
        <div class="ni-foot">${n.quote ? `<button class="btn small white" data-go="${esc(n.id)}" type="button">Перейти к месту</button>` : "<span></span>"}
          <button class="btn small red" data-del="${esc(n.id)}" type="button">Удалить</button></div></div>`).join("")
      : '<p class="hint">Заметок пока нет. Пишите по ходу — они сохранятся за вами.</p>';
    const hl = v.querySelector(".hlist");
    if (hl) hl.innerHTML = hls.length ? hls.map(n => `<div class="hl-item" style="--mk:${(MARKERS[n.color] || MARKERS[1]).c}">
        <p>${esc(n.quote)}</p>
        <div class="mkrow">${dots(n.color || 1, 'data-rc="' + esc(n.id) + '" data-c')}</div>
        <div class="ni-foot"><button class="btn small white" data-go="${esc(n.id)}" type="button">Перейти к месту</button>
          <button class="btn small red" data-del="${esc(n.id)}" type="button">Удалить</button></div></div>`).join("")
      : `<p class="hint">${hlAll.length ? "Выделений такого цвета нет." : "Выделений пока нет."}</p>`;
    v.querySelectorAll("[data-del]").forEach(b => b.onclick = () => {
      save("note.del", { lessonId: l.id, id: b.dataset.del }); draw(); post({ mopo: "reset", list: marks() });
    });
    v.querySelectorAll("[data-go]").forEach(b => b.onclick = () => {
      const n = notesOf(l.id).filter(x => x.id === b.dataset.go)[0];
      if (n && n.quote) post({ mopo: "focus", text: n.quote });
    });
    v.querySelectorAll("[data-rc]").forEach(b => b.onclick = () => {
      save("note.update", { id: b.dataset.rc, lessonId: l.id, color: Number(b.dataset.c) }); draw(); post({ mopo: "reset", list: marks() });
    });
  };
  const clearDraft = () => {
    const ta = v.querySelector(".ntext"), ti = v.querySelector(".ntime");
    ta.value = ""; delete ta.dataset.quote; if (ti) ti.value = "";
    v.querySelector(".qprev") && v.querySelector(".qprev").remove();
    v.querySelector('[data-a="clear"]').hidden = true;
  };
  v.querySelector('[data-a="clear"]').onclick = clearDraft;
  v.querySelector(".ntext").addEventListener("input", e => {
    v.querySelector('[data-a="clear"]').hidden = !e.target.value && !e.target.dataset.quote;
  });
  v.querySelector('[data-a="save"]').onclick = async () => {
    const ta = v.querySelector(".ntext"), ti = v.querySelector(".ntime");
    const text = ta.value.trim();
    if (!text) { toast("Напишите текст заметки"); return; }
    save("note.save", { lessonId: l.id, kind: "note", text: text, time: ti ? ti.value.trim() : "", quote: ta.dataset.quote || "" });
    clearDraft(); draw(); post({ mopo: "reset", list: marks() }); toast("Заметка сохранена");
  };
  draw(); showTab(textual ? tab : "note");
  document.body.appendChild(v); lockScroll(true);
  if (inner) loadInner(v.querySelector("iframe"), l.url);
  else if (proxied) loadDoc(v.querySelector("iframe"), l);
}

/* ---------- переход к материалу по id ---------- */
function lessonById(id) {
  for (const b of (PR.program ? PR.program.blocks : []))
    for (const sub of b.subs)
      for (const l of sub.lessons) if (l.id === id) return { block: b, lesson: l };
  return null;
}
function openLessonById(id, at) {
  const f = lessonById(id);
  if (!f) { toast("Материал не найден"); return; }
  if (!f.lesson.ready) { toast("Этот урок ещё не записан"); return; }
  openLesson(f.lesson, at);
}

/* ---------- заметки ---------- */
function notesFor(l) {
  const back = el("div", "modal-back");
  const drawM = () => {
    const list = notesOf(l.id).filter(n => !n.kind || n.kind === "note").slice().reverse();
    const hls = notesOf(l.id).filter(isHl).length;
    back.innerHTML = `<div class="modal wide" role="dialog" aria-modal="true">
      <b>Заметки: ${esc(l.title)}</b>
      <p class="hint">Заметки видите только вы. Исходный документ не меняется — обновим материал, ваши записи останутся.${hls ? " Выделений в тексте: " + hls + " — они в самом материале." : ""}</p>
      ${l.kind === "видео" ? '<label class="f">Момент в видео (необязательно)</label><input type="text" id="ntime" placeholder="12:40" style="max-width:140px">' : ""}
      <label class="f">Новая заметка</label><textarea id="ntext" placeholder="Что важно запомнить"></textarea>
      <div class="mbtns"><button class="btn ghost" data-a="0" type="button">Закрыть</button>
        <button class="btn" data-a="1" type="button">Сохранить</button></div>
      <div class="notes">${list.length ? list.map(n => `<div class="note-item">
          <div class="ni-head"><b>${esc((n.at || "").slice(0, 10))}</b>${n.time ? `<span class="tc">▶ ${esc(n.time)}</span>` : ""}</div>
          ${n.quote ? `<div class="nquote">«${esc(n.quote)}»</div>` : ""}<p>${esc(n.text)}</p>
          <div class="ni-foot"><button class="btn small white" data-go="${esc(n.id)}" type="button">Открыть материал</button>
            <button class="btn small red" data-del="${esc(n.id)}" type="button">Удалить</button></div></div>`).join("")
        : '<p class="hint">Заметок пока нет.</p>'}</div></div>`;
    back.querySelector('[data-a="0"]').onclick = () => { back.remove(); lockScroll(false); backToPlace(); };
    back.querySelector('[data-a="1"]').onclick = async () => {
      const text = back.querySelector("#ntext").value.trim();
      const time = back.querySelector("#ntime") ? back.querySelector("#ntime").value.trim() : "";
      if (!text) { toast("Напишите текст заметки"); return; }
      save("note.save", { lessonId: l.id, kind: "note", text: text, time: time }); drawM(); toast("Заметка сохранена");
    };
    back.querySelectorAll("[data-del]").forEach(b => b.onclick = async () => {
      save("note.del", { lessonId: l.id, id: b.dataset.del }); drawM();
    });
    back.querySelectorAll("[data-go]").forEach(b => b.onclick = () => {
      const n = notesOf(l.id).filter(x => x.id === b.dataset.go)[0];
      back.remove(); lockScroll(false); openLesson(l, n && n.time, n && n.quote);
    });
  };
  drawM(); document.body.appendChild(back); lockScroll(true);
}

/* ---------- умный поиск: опечатки, «блок 3», формат, тема ---------- */
const snorm = s => String(s == null ? "" : s).toLowerCase().replace(/ё/g, "е").replace(/[«»"'`().,:;!?/\\—–\-]+/g, " ");
function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
function wordHit(tokens, w) {
  if (tokens.some(t => t.includes(w))) return true;
  if (w.length < 4) return false;
  const tol = w.length >= 8 ? 2 : 1;               /* «комлекс» → «комплекс», но не «комплект» */
  return tokens.some(t => {
    if (lev(t, w, tol) <= tol) return true;
    for (let k = w.length - 1; k <= w.length + 1; k++)   /* начало длинного слова: «дробилк» ~ «дробилками» */
      if (t.length > k && k >= 4 && lev(t.slice(0, k), w, tol) <= tol) return true;
    return false;
  });
}
/* 0 — не подходит, 2 — нашлось в самом тексте, 1 — только в названии/теме/формате. «блок 3» — точно по номеру */
function smartMatch(query, content, meta, blockN) {
  let q = snorm(query).trim();
  if (!q) return 2;
  const m = q.match(/(?:^|\s)б(?:л|лк|ло|лок|локи|лока)?\s*(\d{1,2})(?=\s|$)/);
  if (m) { if (blockN !== Number(m[1])) return 0; q = q.replace(m[0], " ").trim(); if (!q) return 2; }
  const words = q.split(/\s+/).filter(Boolean);
  const ct = snorm(content).split(/\s+/).filter(Boolean), all = ct.concat(snorm(meta).split(/\s+/).filter(Boolean));
  if (words.every(w => wordHit(ct, w))) return 2;
  return words.every(w => wordHit(all, w)) ? 1 : 0;
}

/* выпадающий фильтр: одна кнопка на группу, внутри — галочки */
function filterDrop(g, state, onChange) {
  const d = el("div", "fdrop");
  const set = state[g.key];
  d.innerHTML = `<button type="button" class="fbtn">${esc(g.title)} <i></i><span>▾</span></button>
    <div class="fpanel" hidden>
      ${g.items.map(it => `<label class="fck">
        <input type="checkbox" value="${esc(it.v)}"><u></u>${g.swatch ? `<span class="sw" style="--mk:${it.color}"></span>` : ""}${esc(it.t)}</label>`).join("")}
      <div class="ffoot"><button type="button" class="link" data-clear="1">Очистить</button>
        <button type="button" class="btn small white" data-done="1">Готово</button></div></div>`;
  const panel = d.querySelector(".fpanel"), badge = d.querySelector(".fbtn i");
  const paint = () => { badge.textContent = set.size || ""; d.classList.toggle("active", !!set.size); };
  d.querySelector(".fbtn").onclick = e => {
    e.stopPropagation();
    const open = panel.hidden;
    document.querySelectorAll(".fpanel").forEach(p => p.hidden = true);
    panel.hidden = !open;
  };
  panel.onclick = e => e.stopPropagation();
  document.addEventListener("click", () => { panel.hidden = true; });
  d.querySelectorAll("input[type=checkbox]").forEach(c => {
    const val = g.num ? Number(c.value) : c.value;
    c.checked = set.has(val);
    c.onchange = () => { c.checked ? set.add(val) : set.delete(val); paint(); onChange(); };
  });
  d.querySelector("[data-clear]").onclick = () => {
    set.clear(); d.querySelectorAll("input[type=checkbox]").forEach(c => c.checked = false); paint(); onChange();
  };
  d.querySelector("[data-done]").onclick = () => { panel.hidden = true; };
  paint();
  return d;
}

const QUI = { filter: "all" };
async function screenQuestions() {
  const staff = isStaff(APP.user);
  $("#htitle").textContent = staff ? "Разработчику" : "Мои вопросы";
  $("#timer").hidden = true;
  $("#app").innerHTML = `<div class="card"><p class="lead">Загружаем…</p></div>`;
  let r;
  try {                                              /* вопросы из памяти сразу, свежие — в фоне */
    await loadCabinet();
    if (MYQ.data && !APP.demo) {
      r = MYQ.data;
      if (Date.now() - MYQ.at > 20000) api("my.questions").then(x => {
        const changed = JSON.stringify(x) !== JSON.stringify(MYQ.data);
        MYQ.data = x; MYQ.at = Date.now();
        if (changed && APP.screen === "questions" && !document.querySelector(".modal-back")) screenQuestions();
      }).catch(() => { });
    } else { r = await api("my.questions"); MYQ.data = r; MYQ.at = Date.now(); }
  } catch (e) { return fail(e); }
  const list = (r.questions || []).slice().sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const nAns = list.filter(q => q.answer).length, nWait = list.length - nAns;
  $("#app").innerHTML = `<div class="card">
      <div class="qhead"><div><h2>${staff ? "Вопросы разработчику" : "Мои вопросы"}</h2>
        <p class="lead">${staff ? "Что-то не работает, нужна доработка или новый раздел — напишите здесь. Ответ придёт сюда же."
          : "Всё, что вы спрашивали у РОПа по материалам. Ответ приходит сюда — и остаётся, к нему можно вернуться."}</p></div></div>
      ${staff ? `<div class="devask"><textarea id="dqtext" placeholder="Опишите вопрос или задачу"></textarea>
        <button class="btn" id="dqsend" type="button">Отправить разработчику</button></div>` : ""}
      <div class="seg wide" id="qseg">
        <button type="button" data-f="all">Все <i>${list.length}</i></button>
        <button type="button" data-f="ans">Отвеченные <i>${nAns}</i></button>
        <button type="button" data-f="wait">Ждут ответа <i>${nWait}</i></button></div>
      <div id="qlist"></div></div>`;
  if (staff) $("#dqsend").onclick = async () => {
    const text = $("#dqtext").value.trim();
    if (text.length < 3) return toast("Напишите вопрос");
    try { await api("question.ask", { text: text }); MYQ.data = null; toast("Отправлено разработчику"); screenQuestions(); } catch (e) { fail(e); }
  };
  const draw = () => {
    $("#qseg").querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.f === QUI.filter));
    const host = $("#qlist"); host.innerHTML = "";
    const f = list.filter(q => QUI.filter === "all" || (QUI.filter === "ans" ? q.answer : !q.answer));
    if (!list.length) { host.innerHTML = '<p class="hint">Вопросов пока нет. Кнопка «Спросить РОПа» есть в каждом материале.</p>'; return; }
    if (!f.length) { host.innerHTML = '<p class="hint">В этом разделе пусто.</p>'; return; }
    f.forEach(q => {
      const c = el("div", "qitem " + (q.answer ? "answered" : "waiting"));
      c.innerHTML = `<div class="nc-head">
          <span class="tag ${q.answer ? "ok" : "wait"}">${q.answer ? "есть ответ" : "ждёт ответа"}</span>
          <b>${esc(q.lessonTitle || "Общий вопрос")}</b>
          <span class="hint">${esc((q.at || "").slice(0, 10))}</span></div>
        <p class="qq">${esc(q.text)}</p>
        ${q.answer ? `<div class="ans"><b>Ответ ${esc(q.answeredBy || "РОПа")}${q.answeredAt ? " · " + esc(String(q.answeredAt).slice(0, 10)) : ""}:</b>
            <p>${esc(q.answer)}</p></div>` : `<p class="hint">${staff ? "Разработчик" : "РОП"} ответит здесь. Если срочно — напишите ему в чат.</p>`}`;
      const foot = el("div", "ni-foot");
      const left = el("div", "ni-left");
      if (q.lessonId && lessonById(q.lessonId)) {
        const go2 = el("button", "btn small white", "Открыть материал"); go2.type = "button";
        go2.onclick = () => openLessonById(q.lessonId);
        left.appendChild(go2);
      }
      foot.appendChild(left);
      if (!q.answer) {
        const right = el("div", "ni-right");
        const ed = el("button", "btn small white", "Изменить"); ed.type = "button";
        const del = el("button", "btn small red", "Удалить"); del.type = "button";
        ed.onclick = () => {
          const p = c.querySelector(".qq");
          p.outerHTML = `<div class="qedit"><textarea>${esc(q.text)}</textarea>
            <div class="nbtns"><button class="btn small" type="button" data-ok="1">Сохранить</button>
            <button class="btn small ghost" type="button" data-no="1">Отмена</button></div></div>`;
          foot.hidden = true;
          const box = c.querySelector(".qedit"), ta = box.querySelector("textarea");
          ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
          box.querySelector("[data-no]").onclick = () => draw();
          box.querySelector("[data-ok]").onclick = async () => {
            const text = ta.value.trim();
            if (text.length < 3) return toast("Напишите вопрос");
            try { await api("question.edit", { id: q.id, text: text }); q.text = text; MYQ.at = 0; draw(); toast("Вопрос изменён"); }
            catch (e) { fail(e); }
          };
        };
        del.onclick = async () => {
          if (!await ask({ title: "Удалить вопрос?", danger: true, ok: "Удалить", cancel: "Не удалять",
              text: "Вы уверены, что хотите удалить вопрос? " + (isStaff(APP.user) ? "Разработчик" : "РОП") + " его больше не увидит.<br><br>«" + esc(q.text) + "»" })) return;
          try {
            await api("question.del", { id: q.id });
            if (MYQ.data) MYQ.data.questions = (MYQ.data.questions || []).filter(x => x.id !== q.id);
            toast("Вопрос удалён"); screenQuestions();
          } catch (e) { fail(e); }
        };
        right.appendChild(ed); right.appendChild(del); foot.appendChild(right);
      }
      if (foot.querySelector("button")) c.appendChild(foot);
      host.appendChild(c);
    });
  };
  $("#qseg").querySelectorAll("button").forEach(b => b.onclick = () => { QUI.filter = b.dataset.f; draw(); });
  draw();
}

const NUI = { q: "", mode: "note", blocks: new Set(), kinds: new Set(), colors: new Set() };
async function screenNotes(keep) {
  $("#htitle").textContent = "Мои записи";
  $("#timer").hidden = true;
  if (!keep) $("#app").innerHTML = `<div class="card"><p class="lead">Загружаем…</p></div>`;
  try { await loadCabinet(); } catch (e) { return fail(e); }
  const index = {};
  PR.program.blocks.forEach(b => b.subs.forEach(s => s.lessons.forEach(l => index[l.id] = { block: b, sub: s, lesson: l })));
  const byLesson = PR.progress.notes || {};
  const items = Object.keys(byLesson).flatMap(id => (byLesson[id] || []).map(n => ({ id: id, n: n, ref: index[id] })))
    .filter(x => x.ref).sort((a, b) => String(b.n.at).localeCompare(String(a.n.at)));
  const kindOf = n => n.kind === "hl" || n.kind === "bm" ? n.kind : "note";
  const cnt = k => items.filter(x => kindOf(x.n) === k).length;
  const kinds = [...new Set(PR.program.blocks.flatMap(b => b.subs.flatMap(s => s.lessons.map(l => l.kind))))].sort();
  $("#app").innerHTML = `<div class="card">
      <div class="qhead"><div><h2>Мои записи</h2>
        <p class="lead">Заметки, выделения и закладки по всем материалам. Из любой можно перейти прямо на её место.</p></div></div>
      <div class="seg wide" id="nseg">
        <button type="button" data-m="note">Заметки <i>${cnt("note")}</i></button>
        <button type="button" data-m="hl">Выделения <i>${cnt("hl")}</i></button>
        <button type="button" data-m="bm">Закладки <i>${cnt("bm")}</i></button></div>
      <div class="nbar"><input type="text" id="nq" placeholder="Поиск: слово, тема или «блок 3»" value="${esc(NUI.q)}">
        <div class="fdrops" id="fdrops"></div></div>
    </div><div id="nlist" style="margin-top:12px"></div>`;
  const G = {
    blocks: { key: "blocks", title: "Блоки", num: true, items: PR.program.blocks.map(b => ({ v: b.n, t: blockNum(b.n) + ". " + b.title })) },
    kinds:  { key: "kinds", title: "Формат", items: kinds.map(k => ({ v: k, t: k })) },
    colors: { key: "colors", title: "Цвет маркера", num: true, swatch: true, items: MARKERS.slice(1).map((m, i) => ({ v: i + 1, t: m.n, color: m.c })) } };
  const drops = () => {
    const h = $("#fdrops"); h.innerHTML = "";
    h.appendChild(filterDrop(G.blocks, NUI, draw));
    h.appendChild(filterDrop(G.kinds, NUI, draw));
    if (NUI.mode === "hl") h.appendChild(filterDrop(G.colors, NUI, draw));
  };
  const draw = () => {
    $("#nseg").querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.m === NUI.mode));
    const host = $("#nlist"); host.innerHTML = "";
    const pool = items.filter(x =>
      kindOf(x.n) === NUI.mode &&
      (!NUI.blocks.size || NUI.blocks.has(x.ref.block.n)) &&
      (!NUI.kinds.size || NUI.kinds.has(x.ref.lesson.kind)) &&
      (NUI.mode !== "hl" || !NUI.colors.size || NUI.colors.has(x.n.color || 1)))
      .map(x => Object.assign(x, { score: smartMatch(NUI.q,
        x.n.kind === "bm" ? x.ref.lesson.title : [x.n.text, x.n.quote].join(" "),
        [x.ref.lesson.title, x.ref.lesson.kind, x.ref.sub.title, "блок " + blockNum(x.ref.block.n), x.ref.block.title].join(" "),
        x.ref.block.n) }));
    const best = Math.max(0, ...pool.map(x => x.score));
    const f = pool.filter(x => x.score && x.score === best);
    if (!f.length) {
      host.appendChild(el("div", "card", NUI.mode === "bm" && !cnt("bm")
        ? '<p class="hint">Закладок пока нет. Звёздочка «В закладки» есть у каждого материала и в окне просмотра.</p>'
        : '<p class="hint">Ничего не найдено. Попробуйте другое слово или снимите фильтры.</p>'));
      return;
    }
    f.forEach(x => {
      const k = kindOf(x.n);
      const c = el("div", "card note-card" + (k === "hl" ? " hl-card" : k === "bm" ? " bm-card" : ""));
      if (k === "hl") c.style.setProperty("--mk", (MARKERS[x.n.color] || MARKERS[1]).c);
      c.innerHTML = `<div class="nc-head"><span class="tag">Блок ${blockNum(x.ref.block.n)}</span>
          <span class="tag">${esc(x.ref.lesson.kind)}</span><b>${k === "bm" ? "★ " : ""}${esc(x.ref.lesson.title)}</b>
          <span class="hint">${esc((x.n.at || "").slice(0, 10))}</span>
          ${x.n.time ? `<span class="tc">▶ ${esc(x.n.time)}</span>` : ""}
          <button class="link inblock" type="button" data-in="1">показать в блоке</button></div>
        ${k === "hl" ? `<p class="hlq">${esc(x.n.quote)}</p><div class="mkrow">${dots(x.n.color || 1, "data-c")}</div>`
          : k === "bm" ? `<p class="hint">${esc(x.ref.sub.title || x.ref.block.title)}</p>`
          : `${x.n.quote ? `<div class="nquote">«${esc(x.n.quote)}»</div>` : ""}<p>${esc(x.n.text)}</p>`}
        <div class="ni-foot">
          <button class="btn small white" type="button" data-go="1">${x.n.quote ? "Перейти к месту" : x.ref.lesson.kind === "видео" ? "Смотреть материал" : "Открыть материал"}</button>
          <button class="btn small red" type="button" data-del="1">${k === "bm" ? "Убрать из закладок" : "Удалить"}</button></div>`;
      c.querySelector("[data-in]").onclick = () => { APP.screen = "cabinet"; renderNav(); openBlock(x.ref.block.n, x.ref.lesson.id); };
      c.querySelector("[data-go]").onclick = () => openLesson(x.ref.lesson, x.n.time || null, x.n.quote || null);
      c.querySelector("[data-del]").onclick = async () => {
        save("note.del", { lessonId: x.id, id: x.n.id }); screenNotes(true);
      };
      c.querySelectorAll("[data-c]").forEach(b => b.onclick = async () => {
        save("note.update", { lessonId: x.id, id: x.n.id, color: Number(b.dataset.c) }); screenNotes(true);
      });
      host.appendChild(c);
    });
  };
  $("#nq").oninput = e => { NUI.q = e.target.value; draw(); };
  $("#nseg").querySelectorAll("button").forEach(b => b.onclick = () => { NUI.mode = b.dataset.m; drops(); draw(); });
  drops(); draw();
}

/* ---------- профиль ---------- */
const roleName = u => u && u.role === "dev" ? "Разработчик" : u && u.role === "admin" ? "РОП" : "МОПО";
function avatarHtml(u, size) {
  const s = size || 28;
  if (u && u.avatar) return `<img class="ava" src="${esc(u.avatar)}" alt="" style="width:${s}px;height:${s}px">`;
  const ini = String((u && u.fio) || "?").replace(/\(.*?\)/g, "").trim().split(/\s+/).slice(0, 2).map(w => w[0] || "").join("").toUpperCase();
  return `<span class="ava ini" style="width:${s}px;height:${s}px;font-size:${Math.round(s * .38)}px">${esc(ini)}</span>`;
}
const fmtRuDate = iso => { const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + "." + m[2] + "." + m[1] : ""; };

/* картинка из файла: createImageBitmap не зависит от ограничений страницы, запасной путь — data:URL */
async function loadPicture(file) {
  if (/heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name))
    throw new Error("Фото в формате HEIC браузер не читает. Сохраните его как JPG или PNG и загрузите снова.");
  try { return await createImageBitmap(file); }
  catch (e) {
    const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
    return await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; })
      .catch(() => { throw new Error("Не получилось прочитать фото. Подойдёт JPG или PNG."); });
  }
}
/* обрезка как в Telegram: круг, фото двигается пальцем/мышью, масштаб — ползунком, колесом или щипком */
function cropAvatar(src) {
  return new Promise(resolve => {
    const B = 300, W = src.width, H = src.height, base = Math.max(B / W, B / H);
    let z = 1, cx = W / 2, cy = H / 2;
    const back = el("div", "modal-back");
    back.innerHTML = `<div class="modal crop" role="dialog" aria-modal="true">
      <b>Фото профиля</b>
      <div class="cropbox"><canvas width="${B * 2}" height="${B * 2}"></canvas><div class="cropmask"></div></div>
      <div class="zoomrow"><span>−</span><input type="range" min="1" max="4" step="0.01" value="1"><span>+</span></div>
      <p class="hint tiny">Двигайте фото, приближайте ползунком или колёсиком.</p>
      <div class="mbtns"><button type="button" class="btn ghost" data-a="0">Отмена</button>
        <button type="button" class="btn" data-a="1">Готово</button></div></div>`;
    const cv = back.querySelector("canvas"), ctx = cv.getContext("2d"), range = back.querySelector("input");
    const clamp = () => {
      const half = B / (2 * base * z);
      cx = Math.min(Math.max(cx, half), W - half); cy = Math.min(Math.max(cy, half), H - half);
    };
    const paint = () => {
      clamp();
      const s = base * z * 2;                      /* канва в 2 раза чётче для ретины */
      ctx.fillStyle = "#232227"; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(src, cv.width / 2 - cx * s, cv.height / 2 - cy * s, W * s, H * s);
    };
    const setZoom = v => { z = Math.min(4, Math.max(1, v)); range.value = z; paint(); };
    range.oninput = () => setZoom(Number(range.value));
    const pts = new Map(); let pinch = 0;
    const box = back.querySelector(".cropbox");
    box.onpointerdown = e => { box.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); };
    box.onpointermove = e => {
      if (!pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2) {
        const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch) setZoom(z * d / pinch); pinch = d; return;
      }
      const k = box.clientWidth / B;                /* окно может быть уже 300px на телефоне */
      cx -= (e.clientX - prev[0]) / (base * z * k); cy -= (e.clientY - prev[1]) / (base * z * k); paint();
    };
    box.onpointerup = box.onpointercancel = e => { pts.delete(e.pointerId); pinch = 0; };
    box.onwheel = e => { e.preventDefault(); setZoom(z * (e.deltaY < 0 ? 1.08 : 1 / 1.08)); };
    const done = v => { back.remove(); lockScroll(false); resolve(v); };
    back.querySelector('[data-a="0"]').onclick = () => done(null);
    back.querySelector('[data-a="1"]').onclick = () => {
      clamp();
      const half = B / (2 * base * z), out = document.createElement("canvas"); out.width = out.height = 256;
      out.getContext("2d").drawImage(src, cx - half, cy - half, half * 2, half * 2, 0, 0, 256, 256);
      let q = .88, url = out.toDataURL("image/jpeg", q);
      while (url.length > 45000 && q > .4) { q -= .08; url = out.toDataURL("image/jpeg", q); }
      done(url);
    };
    document.body.appendChild(back); lockScroll(true); paint();
  });
}
/* дата рождения: ввод цифрами, точки ставятся сами */
function maskDate(inp) {
  inp.addEventListener("input", () => {
    const d = inp.value.replace(/\D/g, "").slice(0, 8);
    inp.value = d.length > 4 ? d.slice(0, 2) + "." + d.slice(2, 4) + "." + d.slice(4) : d.length > 2 ? d.slice(0, 2) + "." + d.slice(2) : d;
  });
}
/* {iso} или {error} — чтобы человек видел, что именно не так */
function parseRuDate(v) {
  const raw = String(v || "").trim();
  const m = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return { error: "Введите дату полностью: ДД.ММ.ГГГГ, например 14.05.1994" };
  const d = +m[1], mo = +m[2], y = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d)), now = new Date();
  if (mo < 1 || mo > 12 || dt.getUTCDate() !== d || dt.getUTCMonth() !== mo - 1) return { error: "Такой даты нет — проверьте день и месяц" };
  if (y < 1930) return { error: "Проверьте год рождения" };
  if (dt > now) return { error: "Дата рождения не может быть в будущем — проверьте год" };
  if (new Date(Date.UTC(y + 16, mo - 1, d)) > now) return { error: "Вам должно быть больше 16 лет, чтобы пользоваться сервисом" };
  return { iso: m[3] + "-" + m[2] + "-" + m[1] };
}
/* почта: без отправки письма — ловим опечатки и подсказываем исправление */
const MAIL_DOMAINS = ["gmail.com", "yandex.ru", "ya.ru", "mail.ru", "bk.ru", "inbox.ru", "list.ru", "rambler.ru",
                      "icloud.com", "outlook.com", "hotmail.com", "yahoo.com", "prom-import.ru"];
function checkEmail(v) {
  const e = String(v || "");
  if (!e.trim()) return {};
  if (/\s/.test(e.trim())) return { error: "В адресе почты не должно быть пробелов" };
  const at = e.trim().split("@");
  if (at.length !== 2) return { error: at.length < 2 ? "В адресе не хватает @" : "В адресе должен быть один знак @" };
  const [local, dom0] = at, dom = dom0.toLowerCase();
  if (!local) return { error: "Перед @ должно быть имя ящика" };
  if (!/^[A-Za-z0-9._%+-]+$/.test(local) || /^\.|\.$|\.\./.test(local)) return { error: "В имени ящика есть недопустимые символы — только латиница, цифры, точка, дефис" };
  if (!dom) return { error: "После @ не хватает домена, например gmail.com" };
  if (!dom.includes(".")) {
    const guess = MAIL_DOMAINS.filter(x => x.split(".")[0] === dom)[0];
    return { error: "Не дописан домен после @", fix: guess ? local + "@" + guess : "" };
  }
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(dom) || /\.\.|^-|-\./.test(dom)) return { error: "Проверьте часть после @ — похоже на опечатку" };
  if (MAIL_DOMAINS.indexOf(dom) < 0) {
    const tol = dom.length >= 8 ? 2 : 1;                 /* короткие домены — только одна опечатка */
    const near = MAIL_DOMAINS.map(x => [x, lev(dom, x, tol)]).filter(x => x[1] <= tol).sort((a, b) => a[1] - b[1])[0];
    if (near) return { error: "Похоже на опечатку в адресе", fix: local + "@" + near[0] };
  }
  return { ok: e.trim() };
}
function screenProfile(editing) {
  const u = APP.user, admin = u.role === "dev";            /* пароль меняет себе только разработчик */
  const empty = !u.birthday && !u.email;
  const edit = editing || false;
  $("#htitle").textContent = "Профиль";
  $("#timer").hidden = true;
  $("#app").innerHTML = `<div class="card profile">
      <div class="pf-top">
        <div class="pf-ava">${avatarHtml(u, 96)}</div>
        <div class="pf-id"><h2>${esc(u.fio)}</h2><div class="pf-role">${roleName(u)}</div>
          <div class="foot">
            <label class="btn small white">${u.avatar ? "Сменить фото" : "Загрузить фото"}<input type="file" id="pffile" accept="image/jpeg,image/png,image/webp" hidden></label>
            ${u.avatar ? '<button class="btn small red" id="pfdel" type="button">Убрать фото</button>' : ""}</div></div>
      </div>
      ${edit ? `<div class="pf-grid">
          ${admin ? `<div class="pf-wide"><label class="f">Имя и фамилия</label><input type="text" id="pffio" value="${esc(u.fio)}" autocomplete="name"></div>` : ""}
          <div><label class="f">Дата рождения</label><input type="text" id="pfbd" inputmode="numeric" placeholder="ДД.ММ.ГГГГ" value="${esc(fmtRuDate(u.birthday))}">
            <div class="ferr" id="bderr" hidden></div></div>
          <div><label class="f">Электронная почта</label><input type="email" id="pfmail" value="${esc(u.email || "")}" placeholder="name@prom-import.ru" autocomplete="email">
            <div class="ferr" id="mlerr" hidden></div></div>
        </div>
        <div class="foot"><button class="btn" id="pfsave" type="button">Сохранить</button>
          <button class="btn ghost" id="pfcancel" type="button">Отмена</button></div>`
      : `<dl class="pf-view">
          ${admin ? `<dt>Имя и фамилия</dt><dd>${esc(u.fio)}</dd>` : ""}
          <dt>Дата рождения</dt><dd>${u.birthday ? fmtRuDate(u.birthday) : '<span class="hint">не указана</span>'}</dd>
          <dt>Электронная почта</dt><dd>${u.email ? esc(u.email) : '<span class="hint">не указана</span>'}</dd>
        </dl>
        <div class="foot"><button class="btn small white" id="pfedit" type="button">${empty ? "Заполнить" : "Изменить"}</button>
          <span class="hint">${u.role === "employee" ? "Имя, логин и пароль меняет РОП." : admin ? "Логин меняется в разделе «Сотрудники»." : "Имя, логин и пароль меняет разработчик."}</span></div>`}
    </div>
    ${admin ? `<div class="card profile">
      <h3>Смена пароля</h3>
      <p class="hint">Старый пароль вводить не нужно — придумайте новый или сгенерируйте.
        ${u.email ? `Если забудете пароль, код для входа придёт на ${esc(u.email)}.` : "<b class=\"inl\">Укажите почту в профиле</b> — на неё придёт код, если забудете пароль."}</p>
      <label class="f">Новый пароль</label>
      <div class="pwrow"><input type="text" id="pf1" autocomplete="new-password" placeholder="не короче 6 символов">
        <button class="btn small white" type="button" id="pfgen">Сгенерировать</button>
        <button class="btn small white" type="button" id="pfcopy" hidden>Скопировать</button></div>
      <div class="foot"><button class="btn" id="pwsave" type="button">Сменить пароль</button></div></div>` : ""}`;
  const setAva = async val => {
    try { await api("profile.avatar", { avatar: val }); APP.user.avatar = val; renderNav(); screenProfile(); toast(val ? "Фото обновлено" : "Фото убрано"); }
    catch (e) { fail(e); }
  };
  $("#pffile").onchange = async e => {
    const f = e.target.files && e.target.files[0]; e.target.value = ""; if (!f) return;
    try { const url = await cropAvatar(await loadPicture(f)); if (url) await setAva(url); } catch (err) { fail(err); }
  };
  if ($("#pfdel")) $("#pfdel").onclick = () => setAva("");
  if ($("#pfedit")) $("#pfedit").onclick = () => screenProfile(true);
  if (edit) {
    maskDate($("#pfbd"));
    $("#pfcancel").onclick = () => screenProfile(false);
    const showErr = (id, inp, r, onFix) => {
      const box = $(id);
      inp.classList.toggle("bad", !!r.error);
      box.hidden = !r.error;
      if (!r.error) return;
      box.innerHTML = esc(r.error) + (r.fix ? ` <button type="button" class="link">Исправить на ${esc(r.fix)}</button>` : "");
      if (r.fix) box.querySelector("button").onclick = () => { onFix(r.fix); };
    };
    const vDate = () => { const raw = $("#pfbd").value.trim(); const r = raw ? parseRuDate(raw) : { iso: "" }; showErr("#bderr", $("#pfbd"), r); return r; };
    const vMail = () => {
      const r = checkEmail($("#pfmail").value);
      showErr("#mlerr", $("#pfmail"), r, fix => { $("#pfmail").value = fix; vMail(); });
      return r;
    };
    $("#pfbd").addEventListener("blur", vDate);
    $("#pfmail").addEventListener("blur", vMail);
    ["#pfbd", "#pfmail"].forEach(sel => $(sel).addEventListener("input", () => { $(sel).classList.remove("bad"); }));
    $("#pfsave").onclick = async () => {
      const rd = vDate(), rm = vMail();
      if (rd.error || rm.error) return;
      const d = { birthday: rd.iso || "", email: rm.ok || "" };
      if (admin) { d.fio = $("#pffio").value.trim().replace(/\s+/g, " "); if (d.fio.length < 2) return toast("Напишите имя и фамилию"); }
      try { await api("profile.save", d); Object.assign(APP.user, d); renderNav(); screenProfile(false); toast("Профиль сохранён"); } catch (e) { fail(e); }
    };
  }
  if (admin) {
    $("#pf1").oninput = () => { $("#pfcopy").hidden = !$("#pf1").value; };
    $("#pfgen").onclick = () => { $("#pf1").value = genPassword(); $("#pfcopy").hidden = false; };
    $("#pfcopy").onclick = async () => {
      try { await navigator.clipboard.writeText($("#pf1").value); toast("Пароль скопирован"); } catch (e) { $("#pf1").select(); toast("Скопируйте вручную: пароль выделен"); }
    };
    $("#pwsave").onclick = async () => {
      const b = $("#pf1").value;
      if (b.length < 6) return toast("Пароль — минимум 6 символов. Или нажмите «Сгенерировать»");
      try { await api("profile.password", { password: b }); $("#pf1").value = ""; $("#pfcopy").hidden = true; toast("Пароль изменён — сохраните его"); }
      catch (e) { fail(e); }
    };
  }
}

/* ---------- вопрос РОПу ---------- */
function askRop(l) {
  const back = el("div", "modal-back");
  back.innerHTML = `<div class="modal wide" role="dialog" aria-modal="true">
    <b>${isStaff(APP.user) ? "Вопрос разработчику" : "Спросить РОПа"}</b>
    <p class="hint">${isStaff(APP.user) ? "Вопрос увидит разработчик в своём кабинете, ответ придёт в раздел «Разработчику»."
      : "Вопрос сохранится в кабинете и будет виден РОПу вместе с уроком. После отправки можно продублировать его в рабочую группу WhatsApp — текст будет готов."}</p>
    <label class="f">Урок</label><input type="text" value="${esc(l.title)}" disabled>
    <label class="f">Вопрос</label><textarea id="qtext" placeholder="Что именно непонятно"></textarea>
    <div class="mbtns"><button class="btn ghost" data-a="0" type="button">Отмена</button>
      <button class="btn" data-a="1" type="button">Отправить</button></div></div>`;
  document.body.appendChild(back); lockScroll(true);
  back.querySelector('[data-a="0"]').onclick = () => { back.remove(); lockScroll(false); };
  back.querySelector('[data-a="1"]').onclick = async () => {
    const text = back.querySelector("#qtext").value.trim();
    if (!text) { toast("Напишите вопрос"); return; }
    try {
      await api("question.ask", { lessonId: l.id, lessonTitle: l.title, text: text }); MYQ.data = null;
      back.remove(); lockScroll(false);
      if (isStaff(APP.user)) toast("Вопрос отправлен разработчику");
      else waNotice({ to: "rop", group: PR.progress.waGroup || "", title: "Вопрос отправлен РОПу",
        text: `Оставил(а) вопрос в сервисе обучения МОПО по уроку «${l.title}»: ${text}` });
    } catch (e) { fail(e); }
  };
}

/* запрос уже лежит в кабинете РОПа/разработчика; WhatsApp — только чтобы увидели быстрее.
   Браузер не может спросить, установлен ли WhatsApp: пробуем открыть приложение и смотрим, ушёл ли фокус со страницы */
function waNotice({ to, group, title, text }) {
  const who = to === "dev" ? "разработчику" : "РОПу", whoIn = to === "dev" ? "разработчика" : "РОПа";
  const back = el("div", "modal-back");
  const close = () => { back.remove(); lockScroll(false); };
  const noApp = () => {
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" style="max-width:480px">
      <b>На этом устройстве не открылся WhatsApp</b>
      <p>Похоже, приложение WhatsApp здесь не установлено. Ничего страшного: ваше сообщение уже отправлено в сервис обучения МОПО и ждёт в кабинете ${whoIn}.</p>
      <div class="note warn">Сообщите ${who} лично или по телефону, что вы отправили сообщение в сервис обучения МОПО.</div>
      <div class="mbtns">${group ? `<a class="btn ghost" href="${esc(group)}" target="_blank" rel="noopener">Открыть через WhatsApp Web</a>` : ""}
        <button class="btn" data-a="0" type="button">Понятно</button></div></div>`;
    back.querySelector('[data-a="0"]').onclick = close;
  };
  back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" style="max-width:480px">
    <b>${esc(title)}</b>
    <p>✓ Сообщение уже в кабинете ${whoIn}.${group ? " Чтобы увидели быстрее, продублируйте его в рабочую группу WhatsApp — текст готов." : ""}</p>
    ${group ? `<label class="f">Сообщение</label><textarea id="watext" rows="3">${esc(text)}</textarea>
      <p class="hint tiny">Текст скопируется, и откроется группа. Нажмите на поле сообщения → «Вставить», поправьте при необходимости и отправьте.</p>
      <div class="mbtns"><button class="btn ghost" data-a="0" type="button">Не нужно</button>
        <button class="btn green" data-a="wa" type="button">Открыть группу WhatsApp</button></div>`
    : `<div class="note warn">Сообщите ${who}, что вы отправили сообщение в сервис обучения МОПО.</div>
      <div class="mbtns"><button class="btn" data-a="0" type="button">Понятно</button></div>`}</div>`;
  document.body.appendChild(back); lockScroll(true);
  back.querySelector('[data-a="0"]').onclick = close;
  const wa = back.querySelector('[data-a="wa"]');
  if (!wa) return;
  wa.onclick = async () => {
    const t = back.querySelector("#watext").value.trim();
    try { await navigator.clipboard.writeText(t); } catch (e) { /* без буфера — текст останется в окне */ }
    const code = (group.match(/chat\.whatsapp\.com\/(?:invite\/)?([A-Za-z0-9]+)/) || [])[1];
    let left = false;
    const away = () => { left = true; };
    window.addEventListener("blur", away); document.addEventListener("visibilitychange", away);
    wa.disabled = true; wa.textContent = "Открываем WhatsApp…";
    location.href = code ? "whatsapp://chat?code=" + code : "whatsapp://send?text=" + encodeURIComponent(t);
    setTimeout(() => {
      window.removeEventListener("blur", away); document.removeEventListener("visibilitychange", away);
      if (left) { close(); toast("Текст скопирован — вставьте его в группе и отправьте"); }
      else noApp();
    }, 5000);                                   /* 5 секунд — успеть ответить браузеру «Открыть WhatsApp?» */
  };
}

async function leaveExam(where) {
  if (!exAll().some(exAnswered)) {   /* ни одного ответа — отправлять нечего, просто выходим */
    EX.running = false; clearInterval(window.__exti); $("#timer").hidden = true;
    try { localStorage.removeItem(LSKEY()); } catch (_) { }
    if (where === "logout") return logout(true);
    renderNav(); return where.startsWith("mode:") ? setMode(where.slice(5)) : go(where);
  }
  const ok = await ask({ title: "Идёт экзамен", danger: true, ok: "Прекратить и выйти", cancel: "Остаться в экзамене",
    text: "Если уйти со страницы экзамена, он прекратится: ответы отправятся как есть, и вернуться к ним будет нельзя.<br>Повторная попытка — только с разрешения руководителя." });
  if (!ok) return;
  try { await exFinish(true); } catch (_) { }
  if (where === "logout") logout(true); else if (where.startsWith("mode:")) setMode(where.slice(5)); else go(where);
}

/* ---------- допуск к экзамену ---------- */
async function examGate() {
  $("#htitle").textContent = "Экзамен";
  $("#timer").hidden = true;
  $("#app").innerHTML = `<div class="card"><p class="lead">Проверяем доступ…</p></div>`;
  try { await loadCabinet(); } catch (e) { return fail(e); }
  const notReady = PR.program.blocks.filter(b => !blockStat(b).ready);
  const allowed = !!PR.progress.examAllowed, force = !!PR.progress.examForce;
  if (allowed && (!notReady.length || force)) {
    if (force && notReady.length) toast("Руководитель открыл экзамен досрочно: часть блоков ещё не закрыта.");
    return screenExamIntro();
  }
  $("#app").innerHTML = `<div class="card"><h2>Экзамен пока закрыт</h2>
    <p class="lead">К экзамену допускают, когда выполнены оба условия.</p>
    <div class="gate">
      <div class="${notReady.length ? "no" : "yes"}"><b>${notReady.length ? "✕" : "✓"}</b>
        <div><b>Все блоки пройдены</b><small>${notReady.length ? "Осталось закрыть: " + notReady.map(b => "блок " + blockNum(b.n)).join(", ") : "Материалы и мини-тесты закрыты"}</small></div></div>
      <div class="${allowed ? "yes" : "no"}"><b>${allowed ? "✓" : "✕"}</b>
        <div><b>Руководитель открыл экзамен</b><small>${allowed ? "Допуск выдан" : "Допуск ещё не выдан — сообщите руководителю, когда закроете блоки"}</small></div></div>
    </div>
    <div class="foot"><button class="btn ghost" id="gback" type="button">К обучению</button></div></div>`;
  $("#gback").onclick = () => go("cabinet");
}

/* ---------- запуск ---------- */
/* ---------- где человек сейчас: вкладка, блок, тема, открытый материал — в адресе страницы, чтобы обновление вернуло туда же ---------- */
const LOC = { l: null };
function locSave() {
  if (!APP.user) return;
  const q = new URLSearchParams();
  if (APP.screen) q.set("s", APP.screen);
  if (APP.screen === "cabinet" && PR.block != null && document.getElementById("subs")) { q.set("b", PR.block); if (PR.sub != null) q.set("u", PR.sub); }
  if (LOC.l) q.set("l", LOC.l);
  const h = "#" + q.toString();
  if (location.hash !== h) try { history.replaceState(null, "", h); } catch (e) { /* не страшно */ }
}
document.addEventListener("click", () => setTimeout(locSave, 80), true);
async function locRestore() {
  const q = new URLSearchParams(location.hash.slice(1)), sc = q.get("s") || "";
  const staff = isStaff(APP.user);
  if (/^adm:/.test(sc) && staff) { go(sc); return true; }
  if (/^(notes|questions|exam|profile)$/.test(sc)) { go(sc); return true; }
  if (sc === "cabinet") {
    APP.screen = "cabinet"; if (staff) try { localStorage.setItem(modeKey(), "mopo"); } catch (e) { }
    renderNav(); await screenCabinet();
    const b = q.get("b"), u = q.get("u"), l = q.get("l");
    if (b != null && PR.program.blocks.some(x => String(x.n) === String(b))) openBlock(Number(b), null, u != null ? Number(u) : undefined);
    if (l) openLessonById(l);
    return true;
  }
  return false;
}
async function start() {
  try {
    const snap = !APP.demo && !APP.user && snapLoad();
    if (snap) {                                      /* кабинет открывается сразу с прошлой копии, свежее придёт в фоне */
      APP.user = snap.user; PR.program = snap.program; PR.progress = snap.progress; PR.qOver = snap.qOver; PR.examX = snap.examX || null; MAT_HEX = snap.mat || "";
      outLoad(); OUT.q.forEach(it => applyLocal(it.action, it.data));
      if (snap.myq) MYQ.data = snap.myq;
      setTimeout(() => { refreshBg(true); outFlush(); }, 50);
    } else if (!APP.user) {                          /* первый вход на этом устройстве — всё одним запросом */
      $("#app").innerHTML = `<div class="card"><p class="lead">Загружаем кабинет…</p></div>`;
      const b = await api(APP.demo ? "me" : "boot");
      APP.user = b.user;
      if (!APP.demo) { outLoad(); applyBoot(b); outFlush(); }
    } else if (!APP.demo) { outLoad(); outFlush(); }
    if (!APP.demo && isStaff(APP.user)) setTimeout(() => adminPrefetch(), 1500);
    if (!(await locRestore().catch(() => false))) go(isStaff(APP.user) && staffMode() === "admin" ? "adm:students" : "cabinet");
    locSave();
  } catch (e) { screenLogin(); }
}
document.addEventListener("DOMContentLoaded", () => { APP.token ? start() : screenLogin(); });

/* ---------- демо-режим: две учётки, сотрудник и администратор ---------- */
const DEMO = {
  who: "emp",
  users: {
    emp:   { id: "u-emp",   fio: "Иван Петров", login: "demo",  role: "employee" },
    admin: { id: "u-admin", fio: "Анна Руководитель",      login: "admin", role: "admin" },
    dev:   { id: "u-dev",   fio: "Разработчик",            login: "dev",   role: "dev" }
  },
  state: {
    "u-emp":   { lessons: {}, quizzes: {}, examAllowed: false, examForce: false, seeded: false },
    "u-admin": { lessons: {}, quizzes: {}, examAllowed: true,  examForce: false, seeded: false },
    "u-dev":   { lessons: {}, quizzes: {}, examAllowed: true,  examForce: false, seeded: false }
  },
  attempts: [],
  resets: []
};
const DEMO_KEY = "mopo-demo-v3";
try {                                              /* демо помнит заметки, вопросы и прогресс в этом браузере */
  const saved = JSON.parse(localStorage.getItem(DEMO_KEY) || "null");
  if (saved) {
    const base = JSON.parse(JSON.stringify(DEMO.users)), baseState = JSON.parse(JSON.stringify(DEMO.state));
    delete saved.mat;
    Object.assign(DEMO, saved);
    Object.keys(baseState).forEach(id => { if (!DEMO.state[id]) DEMO.state[id] = baseState[id]; });
    Object.keys(base).forEach(k => DEMO.users[k] = Object.assign({}, base[k], DEMO.users[k] || {}, { id: base[k].id, login: base[k].login, role: base[k].role }));
    if (!DEMO.cleanTest) {                         /* разовая уборка: тема «тест» в блоке 1, созданная при проверке, и всё, что в неё положили */
      const ops = DEMO.matOps || [], ids = ops.filter(o => o.t === "sub" && Number(o.d.block) === 1 && String(o.d.title).trim().toLowerCase() === "тест").map(o => String(o.d.id));
      DEMO.matOps = ops.filter(o => !(o.t === "sub" && ids.includes(String(o.d.id))) && !(o.t === "subDel" && ids.includes(String(o.d.id)))
        && !(o.t === "lesson" && ids.includes(String(o.d.sub || ""))));
      DEMO.cleanTest = true;
    }
    DEMO.resets = DEMO.resets || [];
  }
} catch (e) { /* хранилище недоступно — демо просто начнётся заново */ }
function demoKeep() {
  try { localStorage.setItem(DEMO_KEY, JSON.stringify({ users: DEMO.users, state: DEMO.state, questions: DEMO.questions, attempts: DEMO.attempts, matOps: DEMO.matOps, resets: DEMO.resets, settings: DEMO.settings, quizEdits: DEMO.quizEdits, examExtra: DEMO.examExtra, cleanTest: true })); }
  catch (e) { /* не страшно */ }
}
const demoMe = () => DEMO.users[DEMO.who];
/* «Материалы» в демо: плоские таблицы блоков, тем и уроков — как листы Google-таблицы в рабочей версии */
async function demoBase() { return await fetch("data/program.json", { cache: "no-store" }).then(r => r.json()); }
/* демо хранит не копию программы, а список ваших правок — и накладывает его на свежую программу,
   иначе после первой правки демо перестало бы видеть обновления материалов */
async function demoMat() {
  const base = await demoBase(), mat = { blocks: [], subs: [], lessons: [] };
  base.blocks.forEach((b, bi) => {
    mat.blocks.push({ n: b.n, title: b.title, intro: b.intro || "", quiz: b.quiz || "", order: bi + 1, active: true });
    b.subs.forEach((sb, si) => {
      const sid = sb.title ? "s" + b.n + ":" + sb.title : "";
      if (sb.title) mat.subs.push({ id: sid, block: b.n, title: sb.title, order: si + 1, quiz: sb.quiz || "", active: true });
      sb.lessons.forEach((l, li) => mat.lessons.push({ id: l.id, block: b.n, sub: sid, order: (li + 1) * 10, title: l.title, kind: l.kind,
        url: l.url, note: l.note || "", ready: l.ready !== false, active: true }));
    });
  });
  (DEMO.matOps || []).forEach(op => { try { demoApply(mat, op); } catch (e) { /* правка к исчезнувшему материалу — пропускаем */ } });
  return mat;
}
function demoApply(m, op) {
  const d = op.d;
  if (op.t === "block") m.blocks.push({ n: d.n, title: d.title, intro: "", quiz: "", order: m.blocks.length + 1, active: true, createdBy: d.createdBy || "" });
  if (op.t === "sub") m.subs.push({ id: d.id, block: Number(d.block), title: d.title, order: m.subs.filter(x => Number(x.block) === Number(d.block)).length + 1, quiz: "", active: true, createdBy: d.createdBy || "" });
  if (op.t === "subDel") { m.lessons = m.lessons.filter(x => String(x.sub) !== String(d.id)); m.subs = m.subs.filter(x => String(x.id) !== String(d.id)); }
  if (op.t === "blockDel") { m.lessons = m.lessons.filter(x => Number(x.block) !== Number(d.n)); m.subs = m.subs.filter(x => Number(x.block) !== Number(d.n)); m.blocks = m.blocks.filter(x => Number(x.n) !== Number(d.n)); }
  if (op.t === "lessonDel") m.lessons = m.lessons.filter(x => x.id !== d.id);
  if (op.t === "blockMove") {
    const all = m.blocks.slice().sort((a, b) => a.order - b.order), i = all.findIndex(x => Number(x.n) === Number(d.n)), j = i + (d.dir < 0 ? -1 : 1);
    if (i >= 0 && j >= 0 && j < all.length) { const t = all[i]; all[i] = all[j]; all[j] = t; }
    all.forEach((x, k) => x.order = k + 1);
  }
  if (op.t === "subQuiz") m.subs.filter(x => String(x.id) === String(d.sub)).forEach(x => x.quiz = d.quiz);
  if (op.t === "blockQuiz") m.blocks.filter(x => Number(x.n) === Number(d.block)).forEach(x => x.quiz = d.quiz);
  if (op.t === "visible") (d.kind === "block" ? m.blocks.filter(x => Number(x.n) === Number(d.id)) : d.kind === "sub" ? m.subs.filter(x => String(x.id) === String(d.id))
    : m.lessons.filter(x => x.id === d.id)).forEach(x => x.active = d.active);
  if (op.t === "lesson") {
    const patch = { block: Number(d.block), sub: d.sub || "", title: d.title, kind: d.kind, url: d.url || "", note: d.note || "",
                    ready: d.ready !== false, active: d.active !== false };
    let me = m.lessons.filter(l => l.id === d.id)[0];
    const existed = !!me;
    if (me) Object.assign(me, patch); else { me = Object.assign({ id: d.id, order: 99999, createdBy: d.createdBy || "" }, patch); m.lessons.push(me); }
    const mates = m.lessons.filter(l => Number(l.block) === patch.block && String(l.sub || "") === patch.sub && l !== me).sort((a, b) => a.order - b.order);
    let pos = mates.length;
    if (d.after === "start") pos = 0;
    else if (d.after === "keep" && existed) pos = mates.filter(l => l.order < me.order).length;
    else if (d.after && d.after !== "end" && d.after !== "keep") { const k = mates.findIndex(l => l.id === d.after); if (k >= 0) pos = k + 1; }
    mates.splice(pos, 0, me);
    mates.forEach((l, k) => l.order = (k + 1) * 10);
  }
}
/* исходные вопросы экзамена по «теме» в демо: ответов в демо нет (их знает только сервер) — варианты приходят без отметок */
async function demoExamBase(unit) {
  const m = await demoMat(), ids = new Set(m.lessons.filter(l => (String(l.sub || "") || "b:" + l.block) === String(unit)).map(l => l.id));
  const ex = await fetch("data/exam.json", { cache: "no-store" }).then(r => r.json()), edit = [], locked = [];
  ex.blocks.forEach(b => b.questions.forEach(q => {
    if (!q.ref || !ids.has(q.ref)) return;
    if (["single", "multi", "odd", "match"].includes(q.type)) edit.push({ id: q.id, orig: q.id, type: q.type, text: q.text, points: q.points || 1, explain: "",
      options: q.opts ? q.opts.map(o => ({ id: o.id, t: o.t })) : undefined, answer: [], pairs: q.pairs ? q.pairs.l.map((l, i) => ({ l: l, r: q.pairs.r[i] })) : undefined });
    else locked.push({ id: q.id, type: q.type, text: q.text, points: q.points });
  }));
  if (edit.length || locked.length) edit.forEach(q => { if (q.type === "match") q.answer = []; });
  return { edit: edit, locked: locked };
}
const demoCanDel = row => demoMe().role === "dev" || (!!row.createdBy && row.createdBy === demoMe().id);
async function demoOp(t, d) { DEMO.matOps = DEMO.matOps || []; DEMO.matOps.push({ t: t, d: d }); }
async function demoProgram() {
  const base = await demoBase();
  if (!(DEMO.matOps || []).length) return base;
  const m = await demoMat();
  return { quizPass: base.quizPass, quizSize: base.quizSize, legacyIds: base.legacyIds,
    blocks: m.blocks.filter(b => b.active !== false).sort((a, b) => a.order - b.order).map((b, bi) => {
      const subs = m.subs.filter(x => x.block == b.n && x.active !== false).sort((a, c) => a.order - c.order);
      const les = m.lessons.filter(l => l.block == b.n && l.active !== false).sort((a, c) => a.order - c.order)
        .map(l => ({ id: l.id, title: l.title, kind: l.kind, url: l.url, note: l.note, ready: l.ready !== false, sub: l.sub }));
      const list = [{ title: "", quiz: "", lessons: les.filter(l => !l.sub) }]           /* без темы — перед темами */
        .concat(subs.map(x => ({ title: x.title, quiz: x.quiz || "", lessons: les.filter(l => l.sub === x.id) })));
      return { n: b.n, num: bi + 1, title: b.title, intro: b.intro, quiz: b.quiz || "", subs: list.filter(x => x.lessons.length) };
    }) };
}
function demoMigrate() {                           /* id уроков стали постоянными — переносим старый демо-прогресс (повторять безопасно) */
  const map = (PR.program && PR.program.legacyIds) || {};
  if (!Object.keys(map).length) return;
  Object.values(DEMO.state).forEach(st => {
    ["lessons", "notes"].forEach(k => {
      const src = st[k] || {}, out = {};
      Object.keys(src).forEach(id => { out[map[id] || id] = src[id]; });
      st[k] = out;
    });
    if (map[st.lastLesson]) st.lastLesson = map[st.lastLesson];
  });
  (DEMO.questions || []).forEach(q => { if (map[q.lessonId]) q.lessonId = map[q.lessonId]; });
}
const demoState = () => DEMO.state[demoMe().id];
/* «попросить пересдать»: сдача раньше правки теста не закрывает тему (сид-прогресс считаем сданным 14.09) */
function demoRetake(quizzes) {
  Object.keys(quizzes || {}).forEach(id => {
    const rows = (DEMO.quizEdits || {})[id] || [], since = rows.length ? rows[rows.length - 1].retakeAt : "", q = quizzes[id];
    if (since && q.passed && String(q.passedAt || "2026-09-14") < since) { q.passed = false; q.retake = true; }
  });
  return quizzes;
}
const demoResets = () => (DEMO.resets || []).filter(r => !r.doneAt && (demoMe().role === "dev" || r.role === "employee"));

function demoSeed(userId) {                     /* правдоподобный прогресс: блоки идут по очереди */
  const st = DEMO.state[userId];
  if (st.seeded || !PR.program) return;
  st.seeded = true;
  const blocks = PR.program.blocks;
  if (userId === "u-admin" || userId === "u-dev" || (Object.values(DEMO.users).filter(u => u.id === userId)[0] || {}).role !== "employee") {   /* у РОПа и разработчика открыто всё */
    blocks.forEach(b => {
      b.subs.forEach(s => s.lessons.forEach(l => st.lessons[l.id] = "2026-09-12"));
      [b.quiz].concat(b.subs.map(s => s.quiz)).filter(Boolean)
        .forEach(q => st.quizzes[q] = { attempts: 1, best: 5, total: 5, passed: true });
    });
    return;
  }
  blocks.slice(0, 2).forEach(b => {             /* сотрудник: два блока закрыты, третий в работе */
    b.subs.forEach(s => s.lessons.forEach(l => st.lessons[l.id] = "2026-09-14"));
    [b.quiz].concat(b.subs.map(s => s.quiz)).filter(Boolean)
      .forEach(q => st.quizzes[q] = { attempts: q === "b02" ? 2 : 1, best: q === "b02" ? 4 : 5, total: 5, passed: true });
  });
  DEMO.questions = DEMO.questions || [];         /* пара вопросов РОПу — чтобы панель было видно */
  if (!DEMO.questions.length) {
    const les = blocks[2].subs[3].lessons[0], les2 = blocks[1].subs[0].lessons[0];
    DEMO.questions.push(
      { id: "q-demo-1", userId: userId, lessonId: les.id, lessonTitle: les.title,
        text: "Клиент спрашивает про щековую 400×600: это размер куска, который она примет?",
        at: "2026-09-15T09:12:00Z", answer: "Нет, маркировка — это загрузочное окно. Кусок меньше окна: для 400×600 — около 340 мм, это разбирали в уроке по дробилкам.",
        answeredBy: "РОП", answeredAt: "2026-09-15T11:30:00Z" },
      { id: "q-demo-2", userId: userId, lessonId: les2.id, lessonTitle: les2.title,
        text: "Пример вопроса, который ещё ждёт ответа.",
        at: "2026-09-16T07:40:00Z", answer: "" });
  }
  const b3 = blocks[2];
  if (b3) {
    const subs = b3.subs;
    subs.slice(0, 2).forEach(s => s.lessons.forEach(l => st.lessons[l.id] = "2026-09-15"));
    if (subs[2]) subs[2].lessons.slice(0, 1).forEach(l => st.lessons[l.id] = "2026-09-16");
    if (subs[1] && subs[1].quiz) st.quizzes[subs[1].quiz] = { attempts: 1, best: 4, total: 5, passed: true };
    if (subs[2] && subs[2].quiz) st.quizzes[subs[2].quiz] = { attempts: 3, best: 2, total: 5, passed: false };
  }
}
/* разово (17.09): у РОПа и разработчика тема «Прессы» пройдена целиком — её добавили после первого входа,
   поэтому в уже сохранённом прогрессе этих учёток её не было */
function demoPressesDone(userId) {
  if (!["u-admin", "u-dev"].includes(userId) || !PR.program) return;
  const st = DEMO.state[userId];
  if (!st || st.pressesDone) return;
  PR.program.blocks.forEach(b => b.subs.filter(s => /пресс/i.test(s.title || "")).forEach(s => {
    s.lessons.forEach(l => { if (!st.lessons[l.id]) st.lessons[l.id] = "2026-09-17"; });
    if (s.quiz) st.quizzes[s.quiz] = Object.assign({ attempts: 1, best: 5, total: 5 }, st.quizzes[s.quiz] || {}, { passed: true });
  }));
  st.pressesDone = true;
  demoKeep();
}
async function demoApi(action, d) {
  await new Promise(r => setTimeout(r, 80));
  const tk = String(APP.token || "").replace(/^demo-/, "");
  DEMO.who = DEMO.users[tk] ? tk : "emp";
  const r = await demoCall(action, d || {});
  if (!/^(me|program|login|logout)$/.test(action)) demoKeep();
  return r;
}
async function demoCall(action, d) {
  switch (action) {
    case "login": {
      const who = Object.keys(DEMO.users).filter(k => {
        const u = DEMO.users[k];
        return String(u.login).toLowerCase() === String(d.login || "").toLowerCase() && (u.demoPass ? u.demoPass === d.password : d.password === u.login);
      })[0];
      if (!who) return { error: "В демо три входа: demo / demo — МОПО, admin / admin — РОП, dev / dev — разработчик" };
      if (DEMO.users[who].active === false) return { error: "Доступ закрыт. Обратитесь к РОПу." };
      DEMO.who = who; APP.token = "demo-" + who;
      return { token: "demo-" + who, user: demoMe() };
    }
    case "password.forgot": {
      const k = Object.keys(DEMO.users).filter(x => String(DEMO.users[x].login).toLowerCase() === String(d.login || "").trim().toLowerCase())[0];
      const u = k && DEMO.users[k];
      if (!u || u.active === false || u.archived) return { kind: "request", to: "rop" };
      if (u.role === "dev") return { kind: "mail", mail: u.email ? u.email.replace(/^(.)(.*)(@.*)$/, (m, a, b, c) => a + "***" + c) : "почту из профиля", demo: true };
      if (!DEMO.resets.some(r => r.userId === u.id && !r.doneAt))
        DEMO.resets.push({ id: "r" + Date.now(), userId: u.id, login: u.login, fio: u.fio, role: u.role, at: new Date().toISOString() });
      demoKeep();
      return { kind: "request", to: u.role === "employee" ? "rop" : "dev", group: (DEMO.settings || {}).waGroup || "" };
    }
    case "password.reset": return { error: "В демо письмо не отправляется, код проверить нельзя. Вход разработчика: dev / dev." };
    case "me": return demoMe().active === false ? { error: "Доступ закрыт" } : { user: demoMe() };
    case "logout": return { ok: true };
    case "program": return await demoProgram();
    case "progress.get": {
      if (!PR.program) PR.program = await demoProgram();
      demoMigrate();
      demoSeed(demoMe().id);
      demoPressesDone(demoMe().id);
      const set = DEMO.settings || {}, out = JSON.parse(JSON.stringify(demoState()));
      out.quizzes = demoRetake(out.quizzes);
      return Object.assign(out, { waGroup: set.waGroup || "" });
    }
    case "note.save": {
      const st = demoState(); st.notes = st.notes || {};
      const id = d.id || "n" + Date.now();
      (st.notes[d.lessonId] = st.notes[d.lessonId] || []).push({ id: id, kind: d.kind === "hl" || d.kind === "bm" ? d.kind : "note", text: d.text || "",
        time: d.time || "", quote: d.quote || "", color: Number(d.color) || 0, at: new Date().toISOString() });
      return { ok: true, id: id };
    }
    case "note.update": {
      const st = demoState(), n = ((st.notes || {})[d.lessonId] || []).filter(x => x.id === d.id)[0];
      if (n && d.color != null) n.color = Number(d.color);
      return { ok: true };
    }
    case "profile.avatar": demoMe().avatar = d.avatar || ""; return { ok: true };
    case "profile.save": {
      demoMe().birthday = d.birthday || ""; demoMe().email = d.email || "";
      if (d.fio !== undefined && demoMe().role === "dev") {
        const fio = String(d.fio || "").trim().replace(/\s+/g, " ");
        if (fio.length < 2) return { error: "Напишите имя и фамилию" };
        demoMe().fio = fio;
      }
      return { ok: true };
    }
    case "profile.password":
      if (!d.password || d.password.length < 6) return { error: "Новый пароль — минимум 6 символов" };
      return { error: "В демо пароль не меняется: вход остаётся dev / dev. В рабочей версии новый пароль сохранится сразу." };
    case "admin.resets": return { resets: demoResets() };
    case "quiz.overrides": {
      const out = {};
      for (const id of Object.keys(DEMO.quizEdits || {})) { const q = await demoQuizDef(id); if (q && q.edited) out[id] = quizPublicOf(q); }
      return { quizzes: out };
    }
    case "admin.quizGet": {
      const q = await demoQuizDef(d.id);
      if (!q) return { error: "Мини-тест не найден" };
      const st = Object.values(DEMO.users).filter(u => u.role === "employee" && DEMO.state[u.id])
        .map(u => demoRetake(JSON.parse(JSON.stringify(DEMO.state[u.id].quizzes || {})))[d.id]).filter(x => x && x.attempts);
      return { quiz: q, stats: { tried: st.length, passed: st.filter(x => x.passed).length, retake: st.filter(x => x.retake).length } };
    }
    case "admin.quizSave": {
      const err = quizCheck(d.data); if (err) return { error: err };
      let id = d.data.id;
      if (!id) {
        id = "q-new-" + Date.now();
        await demoOp(d.data.sub ? "subQuiz" : "blockQuiz", { sub: d.data.sub, block: d.data.block, quiz: id });
      }
      DEMO.quizEdits = DEMO.quizEdits || {};
      const rows = DEMO.quizEdits[id] = DEMO.quizEdits[id] || [], prev = rows[rows.length - 1];
      rows.push({ version: (prev ? prev.version : 0) + 1, at: new Date().toISOString(), by: demoMe().fio,
        retakeAt: d.data.retake ? new Date().toISOString() : prev ? prev.retakeAt || "" : "",
        data: { title: d.data.title || "", pass: Number(d.data.pass), questions: d.data.questions } });
      return { ok: true, id: id };
    }
    case "admin.quizReset": {
      const rows = (DEMO.quizEdits || {})[d.id] || [], prev = rows[rows.length - 1];
      if (!prev) return { ok: true };
      await quizFiles();
      if (!QZ.key.quizzes[d.id]) return { error: "Этот тест создан в кабинете — исходного варианта у него нет" };
      rows.push({ version: prev.version + 1, reset: true, at: new Date().toISOString(), by: demoMe().fio, retakeAt: d.retake ? new Date().toISOString() : prev.retakeAt || "" });
      return { ok: true };
    }
    case "admin.blockMove": await demoOp("blockMove", { n: d.n, dir: Number(d.dir) }); return { ok: true };
    case "exam.extra": {
      const m = await demoMat(), subs = {};
      m.subs.filter(x => x.active !== false).forEach(x => subs[x.id] = x);
      m.blocks.forEach(b => subs["b:" + b.n] = { block: b.n, title: b.title });                 /* материалы блока без темы */
      const blocksOn = new Set(m.blocks.filter(b => b.active !== false).map(b => Number(b.n)));
      const off = Object.keys(DEMO.examExtra || {}).filter(k => !DEMO.examExtra[k].include);
      return { excludeIds: [].concat(...Object.values(DEMO.examExtra || {}).map(r => r.replaces || [])), excludeLessons: m.lessons.filter(l => off.includes(String(l.sub || "") || "b:" + l.block)).map(l => l.id),
        topics: Object.keys(DEMO.examExtra || {}).map(id => Object.assign({ sub: id }, DEMO.examExtra[id]))
        .filter(t => t.include && (t.questions || []).length && subs[t.sub] && blocksOn.has(Number(subs[t.sub].block)))
        .map(t => ({ sub: t.sub, block: Number(subs[t.sub].block), title: subs[t.sub].title,
          questions: quizPublicOf({ questions: t.questions }).questions.map((q, i) => Object.assign(q, { b: Number(subs[t.sub].block), points: Number(t.questions[i].points) || 1, topic: subs[t.sub].title })) })) };
    }
    case "admin.examList": {
      const out = {};
      const removed = {};
      Object.keys(DEMO.examExtra || {}).forEach(k => {
        const r = DEMO.examExtra[k], qs = r.questions || [];
        if (r.include) out[k] = qs.filter(q => !q.orig).length;
        if ((r.replaces || []).length) removed[k] = r.replaces.length - qs.filter(q => q.orig).length;
      });
      return { topics: out, excluded: Object.keys(DEMO.examExtra || {}).filter(k => !DEMO.examExtra[k].include), removed: removed };
    }
    case "admin.examGet": {
      const r = (DEMO.examExtra || {})[d.sub], base = await demoExamBase(d.sub);
      const saved = r ? JSON.parse(JSON.stringify(r.questions || [])) : [], rep = (r && r.replaces) || [];
      const questions = rep.length ? base.edit.filter(q => !rep.includes(q.id)).concat(saved) : base.edit.concat(saved);
      return { include: r ? !!r.include : base.edit.length + base.locked.length > 0, questions: questions, locked: base.locked,
               at: r ? r.at : "", by: r ? r.by : "", saved: !!r, demoNoKey: base.edit.some(q => !q.answer.length && q.type !== "match") };
    }
    case "admin.examSave": {
      const qs = d.data.questions || [];
      if (d.data.include && qs.length) { const err = quizCheck({ questions: qs, pass: 1 }); if (err) return { error: err }; }
      DEMO.examExtra = DEMO.examExtra || {};
      const baseIds = (await demoExamBase(d.data.sub)).edit.map(q => q.id);
      DEMO.examExtra[d.data.sub] = { include: !!d.data.include, at: new Date().toISOString(), by: demoMe().fio, replaces: baseIds,
        questions: qs.map(x => Object.assign({}, x, { id: x.orig && baseIds.includes(x.orig) ? x.orig : "x-" + String(x.id).replace(/^x-/, "") })) };
      return { ok: true };
    }
    case "admin.visible": await demoOp("visible", { kind: d.kind, id: d.id, active: !!d.active }); return { ok: true };
    case "admin.setting": DEMO.settings = DEMO.settings || {}; DEMO.settings[d.key] = d.value; return { ok: true };
    case "note.del": {
      const st = demoState(); st.notes = st.notes || {};
      st.notes[d.lessonId] = (st.notes[d.lessonId] || []).filter(n => n.id !== d.id);
      return { ok: true };
    }
    case "question.ask": { DEMO.questions = DEMO.questions || []; DEMO.questions.unshift({ id: "q" + Date.now(), userId: demoMe().id, fio: demoMe().fio, lessonId: d.lessonId || "", lessonTitle: d.lessonTitle || "", text: d.text, at: new Date().toISOString(), answer: "", to: demoMe().role === "employee" ? "rop" : "dev" }); return { ok: true }; }
    case "my.questions": return { questions: (DEMO.questions || []).filter(q => q.userId === demoMe().id) };
    case "question.edit": case "question.del": {
      const q = (DEMO.questions || []).filter(x => x.id === d.id && x.userId === demoMe().id)[0];
      if (!q) return { error: "Вопрос не найден" };
      if (q.answer) return { error: "На вопрос уже ответили — изменить или удалить его нельзя" };
      if (action === "question.del") DEMO.questions = DEMO.questions.filter(x => x !== q); else q.text = d.text;
      return { ok: true };
    }
    case "admin.questions": {
      if (d.box === "dev" && demoMe().role !== "dev") return { error: "Нужны права разработчика" };
      return { questions: (DEMO.questions || []).filter(q => (q.to === "dev" ? "dev" : "rop") === (d.box === "dev" ? "dev" : "rop")) };
    }
    case "admin.badges": {
      const open = box => (DEMO.questions || []).filter(q => (q.to === "dev" ? "dev" : "rop") === box && !q.answer).length;
      return { questions: open("rop"), devQuestions: demoMe().role === "dev" ? open("dev") : 0, resets: demoResets().length };
    }
    case "admin.answer": {
      const q = (DEMO.questions || []).filter(x => x.id === d.id)[0];
      if (!q) return { error: "Вопрос не найден" };
      if (q.to === "dev" && demoMe().role !== "dev") return { error: "Нужны права разработчика" };
      q.answer = d.answer; q.answeredAt = new Date().toISOString(); q.answeredBy = demoMe().fio;
      return { ok: true };
    }
    case "lesson.open": demoState().lastLesson = d.lessonId; return { ok: true };
    case "progress": {
      const st = demoState();
      if (d.done) st.lessons[d.lessonId] = new Date().toISOString(); else delete st.lessons[d.lessonId];
      return { ok: true };
    }
    case "quiz.submit": {
      const r = await demoQuizGrade(d.quiz, d.answers), st = demoState();
      const cur = st.quizzes[d.quiz] || { attempts: 0, best: 0, total: r.total, passed: false };
      cur.attempts++; cur.best = Math.max(cur.best, r.score); cur.total = r.total; cur.passed = cur.passed || r.passed;
      if (r.passed) cur.passedAt = new Date().toISOString();
      st.quizzes[d.quiz] = cur;
      st.reviews = st.reviews || {};
      st.reviews[d.quiz] = { at: new Date().toISOString(), score: r.score, total: r.total, passed: r.passed,
                             attempts: cur.attempts, details: r.details, version: r.version };
      r.attempts = cur.attempts;
      return r;
    }
    case "quiz.review": {
      const st = demoState();
      if (st.reviews && st.reviews[d.quiz]) {
        const def = await demoQuizDef(d.quiz);
        return Object.assign({}, st.reviews[d.quiz], { changed: !!def && (def.version || 0) > (st.reviews[d.quiz].version || 0) });
      }
      if ((st.quizzes[d.quiz] || {}).attempts) {                 /* попытки «из прошлого» — соберём разбор по ключу */
        const k = (await (await fetch("data/quiz_demo_key.json")).json()).quizzes[d.quiz];
        const det = Object.keys(k.questions).map((id, i) => {
          const q = k.questions[id], right = i % 3 !== 1;
          const opt = x => ((q.options || []).filter(o => o.id === x)[0] || {}).t || "";
          return { id: id, correct: right, text: q.text,
                   givenText: right ? opt([].concat(q.answer)[0]) : "другой вариант",
                   explain: q.explain, ref: q.ref || null };
        });
        const sc = det.filter(d2 => d2.correct).length;
        return { at: "2026-09-15", score: sc, total: det.length, passed: sc >= k.pass,
                 attempts: st.quizzes[d.quiz].attempts, details: det };
      }
      return { details: [] };
    }
    case "exam.submit": {
      const r = demoGrade(d.data);
      DEMO.attempts.unshift(Object.assign({ id: "att-demo-" + Date.now(), userId: demoMe().id, fio: demoMe().fio,
        login: demoMe().login, finishedAt: new Date().toISOString(), durationSec: d.data.durationSec,
        overtimeSec: d.data.overtimeSec, away: d.data.away }, r));
      return r;
    }
    case "admin.attempts": return { attempts: DEMO.attempts.map(a => Object.assign({ archived: false }, a, { answers: undefined, byBlock: undefined })) };
    case "admin.attemptArchive": {
      const a = DEMO.attempts.filter(x => x.id === d.id)[0]; if (!a) return { error: "Попытка не найдена" };
      a.archived = !!d.archived; a.archivedAt = d.archived ? new Date().toISOString() : ""; return { ok: true };
    }
    case "admin.attemptDel": DEMO.attempts = DEMO.attempts.filter(x => x.id !== d.id); return { ok: true };
    case "admin.attempt": return DEMO.attempts.filter(a => a.id === d.id)[0] || { answers: [] };
    case "admin.users": return { users: Object.keys(DEMO.users).map(k => Object.assign({ active: true, archived: false }, DEMO.users[k]))
      .filter(u => demoMe().role === "dev" || u.role === "employee").map(u => { const c = Object.assign({}, u); delete c.demoPass; return c; }) };
    case "admin.userStatus": {
      const u = Object.values(DEMO.users).filter(x => x.id === d.id)[0];
      if (!u) return { error: "Сотрудник не найден" };
      if (u.id === demoMe().id) return { error: "Нельзя менять доступ самому себе" };
      if (demoMe().role !== "dev" && u.role !== "employee") return { error: "Доступ РОПов меняет разработчик" };
      u.active = d.status === "active"; u.archived = d.status === "archived";
      u.archivedAt = u.archived ? new Date().toISOString() : "";
      return { ok: true };
    }
    case "admin.userDelete":
      return { error: "В демо удаление выключено, чтобы не потерять учебную учётку. В рабочей версии сотрудник из архива удалится вместе со всеми данными." };
    case "admin.students": {
      if (!PR.program) PR.program = await demoProgram();
      Object.keys(DEMO.state).forEach(demoSeed);
      return { students: Object.keys(DEMO.users).filter(k => !DEMO.users[k].archived && DEMO.users[k].role === "employee").map(k => {
        const u = DEMO.users[k], st = DEMO.state[u.id];
        const mine = DEMO.attempts.filter(a => a.userId === u.id);
        return { id: u.id, fio: u.fio, login: u.login, role: u.role, avatar: u.avatar || "", email: u.email || "", birthday: u.birthday || "", active: u.active !== false,
                 lessons: st.lessons, quizzes: demoRetake(JSON.parse(JSON.stringify(st.quizzes))),
                 lessonsDone: Object.keys(st.lessons).length, examAllowed: st.examAllowed, examForce: st.examForce,
                 attempts: mine.length, lastVerdict: (mine[0] || {}).verdict, lastPercent: (mine[0] || {}).percent };
      }) };
    }
    case "admin.examAccess": {
      const st = DEMO.state[d.userId];
      if (st) { st.examAllowed = !!d.allow; st.examForce = !!d.allow && !!d.force; }
      return { ok: true };
    }
    case "admin.materials": return JSON.parse(JSON.stringify(await demoMat()));
    case "admin.userSave": {
      const me = demoMe(), roles = me.role === "dev" ? ["employee", "admin", "dev"] : ["employee"];
      if (roles.indexOf(d.data.role || "employee") < 0) return { error: "Эту роль назначает разработчик" };
      if (d.data.id) {
        const k = Object.keys(DEMO.users).filter(x => DEMO.users[x].id === d.data.id)[0];
        if (!k) return { error: "Сотрудник не найден" };
        if (me.role !== "dev" && DEMO.users[k].role !== "employee") return { error: "РОПов и разработчиков меняет разработчик" };
        Object.assign(DEMO.users[k], { fio: d.data.fio, role: d.data.role || DEMO.users[k].role });
        if (d.data.password && !/^(emp|admin|dev)$/.test(k)) DEMO.users[k].demoPass = d.data.password;
        if (d.data.password) DEMO.resets.filter(r => r.userId === d.data.id && !r.doneAt).forEach(r => { r.doneAt = new Date().toISOString(); r.doneBy = me.fio; });
        return { ok: true, id: d.data.id };
      }
      if (Object.values(DEMO.users).some(u => String(u.login).toLowerCase() === String(d.data.login).toLowerCase())) return { error: "Такой логин уже есть" };
      const id = "u-" + Date.now(), key = "x" + Date.now();
      DEMO.users[key] = { id: id, fio: d.data.fio, login: d.data.login, role: d.data.role || "employee", demoPass: d.data.password };
      DEMO.state[id] = { lessons: {}, quizzes: {}, examAllowed: false, examForce: false, seeded: true };
      return { ok: true, id: id };
    }
    case "admin.blockSave": {
      const m = await demoMat();
      const n = m.blocks.reduce((x, b) => Math.max(x, Number(b.n) || 0), 0) + 1;
      await demoOp("block", { n: n, title: d.data.title, createdBy: demoMe().id });
      return { ok: true, n: n };
    }
    case "admin.subSave": {
      const id = "s" + d.data.block + "-n" + Date.now();
      await demoOp("sub", { id: id, block: Number(d.data.block), title: d.data.title, createdBy: demoMe().id });
      return { ok: true, id: id };
    }
    case "admin.lessonDel": {
      const m = await demoMat(), l = m.lessons.filter(x => x.id === d.id)[0];
      if (!l) return { error: "Материал не найден" };
      if (!demoCanDel(l)) return { error: "РОП удаляет только материалы, которые добавил сам" };
      await demoOp("lessonDel", { id: d.id }); return { ok: true };
    }
    case "admin.subDel": {
      const m = await demoMat(), sub = m.subs.filter(x => String(x.id) === String(d.id))[0];
      if (!sub) return { error: "Тема не найдена" };
      if (!demoCanDel(sub) || m.lessons.some(l => String(l.sub) === String(d.id) && !demoCanDel(l))) return { error: "РОП удаляет только свои темы и только со своими материалами" };
      await demoOp("subDel", { id: d.id }); return { ok: true };
    }
    case "admin.blockDel": {
      const m = await demoMat(), b = m.blocks.filter(x => Number(x.n) === Number(d.n))[0];
      if (!b) return { error: "Блок не найден" };
      if (!demoCanDel(b) || m.lessons.some(l => Number(l.block) === Number(d.n) && !demoCanDel(l)) || m.subs.some(x => Number(x.block) === Number(d.n) && !demoCanDel(x)))
        return { error: "РОП удаляет только свои блоки и только со своими материалами" };
      await demoOp("blockDel", { n: d.n }); return { ok: true };
    }
    case "admin.lessonSave": {
      const m = await demoMat(), x = Object.assign({}, d.data);
      if (x.id && !m.lessons.some(l => l.id === x.id)) return { error: "Материал не найден" };
      if (!x.id) { x.id = "l-" + Date.now(); x.createdBy = demoMe().id; }
      await demoOp("lesson", x);
      return { ok: true, id: x.id };
    }
    default: return { error: "Демо-режим: действие недоступно" };
  }
}
