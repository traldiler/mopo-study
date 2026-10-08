/* Экзамен в кабинете: вопросы приходят из data/exam.json (без ответов),
   проверку и подсчёт баллов делает сервер. */
const EX = { data: null, answers: {}, times: {}, cur: 0, startedAt: 0, away: { count: 0, sec: 0, since: 0 }, running: false,
             mode: "exam", retakeId: "" };
/* черновик ответов в браузере: у пересдачи свой, чтобы не смешаться с основным экзаменом */
const LSKEY = () => (EX.mode === "retake" ? "mopo-retake-draft-" + EX.retakeId + "-" : "mopo-exam-draft-") + (APP.user ? APP.user.id : "x");

/* исходный экзамен + вопросы тем, добавленные в «Материалах»; разделы идут в порядке блоков программы */
async function examData() {
  if (EX.data && !EX.data.retake) return EX.data;
  const d = JSON.parse(await matLoad("data/exam.json"));
  try { if (!PR.program) PR.program = await api("program"); } catch (e) { /* без программы — исходный порядок */ }
  let extra = [], off = new Set();
  let replaced = new Set();
  try {                                              /* вопросы тем уже пришли при входе — отдельный запрос не нужен */
    const x = (!APP.demo && PR.examX) ? PR.examX : await api("exam.extra");
    extra = x.topics || []; off = new Set(x.excludeLessons || []); replaced = new Set(x.excludeIds || []);
  } catch (e) { /* без добавленных вопросов */ }
  d.blocks.forEach(b => b.questions = b.questions.filter(q => !(q.ref && off.has(q.ref)) && !replaced.has(q.id)));   /* снятые темы и исходные вопросы, заменённые правкой */   /* тему сняли с экзамена — убираем и её исходные вопросы */
  d.blocks = d.blocks.filter(b => b.questions.length);
  const prog = (PR.program && PR.program.blocks) || [], title = n => (prog.filter(b => Number(b.n) === Number(n))[0] || {}).title;
  extra.forEach(t => {
    const mine = d.blocks.filter(b => Number(b.n) === Number(t.block));
    const plain = mine.filter(b => !b.questions.every(q => String(q.type).startsWith("sim")));   /* не в раздел тренажёров */
    if (mine.length) (plain.length ? plain : mine).slice(-1)[0].questions.push(...t.questions);
    else d.blocks.push({ n: t.block, title: title(t.block) || t.title, short: title(t.block) || t.title, questions: t.questions.slice() });
  });
  if (prog.length) {
    const pos = n => { const i = prog.findIndex(b => Number(b.n) === Number(n)); return i < 0 ? 999 : i; };
    d.blocks = d.blocks.filter(b => pos(b.n) < 999)                                 /* спрятанный блок в экзамен не идёт */
      .map((b, i) => Object.assign(b, { _i: i })).sort((x, y) => pos(x.n) - pos(y.n) || x._i - y._i);
  }
  EX.data = d;
  return EX.data;
}
const exAll = () => EX.data.blocks.flatMap(b => b.questions);
const exGiven = q => EX.answers[q.id];
function exAnswered(q) {
  const a = exGiven(q);
  if (a == null) return false;
  if (q.type === "multi") return Array.isArray(a) && a.length > 0;
  if (q.type === "match") return a && Object.keys(a).length === q.pairs.l.length && Object.values(a).every(v => v !== "");
  if (q.type === "short") return String(a).trim().length > 2;
  if (q.type === "sim_dsk") return Array.isArray(a) && a.length >= 3;
  if (q.type === "sim_pick") return (a.set || []).length > 0 && String(a.why || "").trim().length > 2;
  if (q.type === "sim_chat") return Object.keys(a.steps || {}).length === q.steps.length && String(a.final || "").trim().length > 2;
  if (q.type === "order") return Array.isArray(a) && a.length >= 2;
  if (q.type === "sim_calc") return (q.need || []).every(k => String((a || {})[k] == null ? "" : a[k]).trim() !== "");
  return String(a).length > 0;
}
function exSave() { try { localStorage.setItem(LSKEY(), JSON.stringify({ answers: EX.answers, times: EX.times, startedAt: EX.startedAt, away: { count: EX.away.count, sec: EX.away.sec } })); } catch (_) { } }

/* ---------- экран «до экзамена» ---------- */
async function screenExamIntro() {
  if (EX.mode === "retake") { EX.mode = "exam"; EX.retakeId = ""; EX.data = null; }
  $("#htitle").textContent = "Экзамен";
  $("#timer").hidden = true;
  const d = await examData();
  const draft = (() => { try { return JSON.parse(localStorage.getItem(LSKEY()) || "null"); } catch (_) { return null; } })();
  const n = exAll.call ? d.blocks.reduce((s, b) => s + b.questions.length, 0) : 0;
  $("#app").innerHTML = `<div class="card">
    <h2>Экзамен по итогам обучения</h2>
    <p class="lead">Проверяем, насколько уверенно вы пользуетесь материалом и готовы к работе с клиентами.
      ${d.blocks.length} разделов, ${n} заданий, ${d.minutes} минут. Порог сдачи — ${Math.round(d.pass * 100)}%.</p>
    <div class="note"><b>Как это работает.</b> Ответы сохраняются в браузере: если страница закроется, работа не потеряется.
      Время фиксируется, но экзамен не обрывается — после ${d.minutes} минут появится отметка о превышении.
      Проверка идёт на сервере: правильных ответов в этой странице нет.</div>
    <div class="note warn"><b>Во время экзамена документы компании закрыты.</b> Переходы на другие вкладки фиксируются в отчёте руководителю.</div>
    <div class="foot">
      <button class="btn" id="exgo" type="button">${draft ? "Продолжить экзамен" : "Начать экзамен"}</button>
      ${draft ? '<button class="btn ghost" id="exnew" type="button">Начать заново</button>' : ""}
    </div></div>`;
  $("#exgo").onclick = () => {
    if (draft) { EX.answers = draft.answers || {}; EX.times = draft.times || {}; EX.startedAt = draft.startedAt || Date.now(); EX.away = { count: draft.away.count, sec: draft.away.sec, since: 0 }; }
    else { EX.answers = {}; EX.times = {}; EX.startedAt = Date.now(); EX.away = { count: 0, sec: 0, since: 0 }; }
    EX.cur = 0; EX.running = true; exSave(); renderNav(); examScreen();
  };
  if (draft) $("#exnew").onclick = async () => {
    if (!await ask({ title: "Начать заново", danger: true, ok: "Стереть и начать", text: "Сохранённые ответы будут удалены, время пойдёт с нуля." })) return;
    localStorage.removeItem(LSKEY()); screenExamIntro();
  };
}

/* ---------- индивидуальная пересдача: задания по ошибкам, собранные руководителем ---------- */
async function retakeData(info) {
  const r = await api("retake.start");
  try { if (!PR.program) PR.program = await api("program"); } catch (e) { /* без названий блоков */ }
  const prog = (PR.program && PR.program.blocks) || [], title = n => (prog.filter(b => Number(b.n) === Number(n))[0] || {}).title || "Блок " + blockNum(n);
  const pos = n => { const i = prog.findIndex(b => Number(b.n) === Number(n)); return i < 0 ? 999 : i; };
  const by = {};
  (r.questions || []).forEach(q => {
    const b = by[q.block] || (by[q.block] = { n: q.block, title: title(q.block), short: title(q.block), questions: [] });
    b.questions.push({ id: q.id, type: q.type, text: q.text, points: Number(q.points) || 1, b: q.block, opts: q.opts || [] });
  });
  return { retake: true, id: r.id, version: "retake", minutes: r.minutes || info.minutes || 30, pass: 0.9, schemes: {},
           blocks: Object.keys(by).map(k => by[k]).sort((x, y) => pos(x.n) - pos(y.n) || blockNum(x.n) - blockNum(y.n)) };
}
async function screenRetakeIntro(info) {
  EX.mode = "retake"; EX.retakeId = info.id;
  if (!(EX.data && EX.data.retake && EX.data.id === info.id)) EX.data = null;
  $("#htitle").textContent = "Экзамен";
  $("#timer").hidden = true;
  const draft = (() => { try { return JSON.parse(localStorage.getItem(LSKEY()) || "null"); } catch (_) { return null; } })();
  $("#app").innerHTML = `<div class="card retake-card">
    <div class="qhead"><div><h3>Руководитель открыл</h3><h2>Индивидуальная пересдача</h2></div><div class="chip">${info.count} заданий</div></div>
    <p class="lead">Задания составлены по материалам уроков, больше всего — по темам, где в экзамене было больше ошибок. Почти все вопросы новые.
      ${plural(info.count, "задание", "задания", "заданий")}, время — 2 часа, как у экзамена. Порог сдачи — 90%.</p>
    <div class="note"><b>Как это работает.</b> Ответы сохраняются в браузере: если страница закроется, работа не потеряется.
      Время фиксируется, но пересдача не обрывается — после 2 часов появится только отметка о превышении. Проверка идёт на сервере.</div>
    <div class="note warn"><b>Пока идёт пересдача, разбор прошлой попытки закрыт.</b> Он снова появится здесь после отправки ответов.</div>
    <div class="foot">
      <button class="btn" id="rtgo" type="button">${draft ? "Продолжить пересдачу" : "Начать пересдачу"}</button>
      ${draft ? '<button class="btn ghost" id="rtnew" type="button">Начать заново</button>' : ""}
    </div></div>`;
  $("#rtgo").onclick = once(async () => {
    try { if (!EX.data) EX.data = await retakeData(info); } catch (e) { return fail(e); }
    if (!exAll().length) return toast("В пересдаче нет заданий — сообщите руководителю");
    if (draft) { EX.answers = draft.answers || {}; EX.times = draft.times || {}; EX.startedAt = draft.startedAt || Date.now(); EX.away = { count: draft.away.count, sec: draft.away.sec, since: 0 }; }
    else { EX.answers = {}; EX.times = {}; EX.startedAt = Date.now(); EX.away = { count: 0, sec: 0, since: 0 }; }
    EX.cur = 0; EX.running = true; exSave(); renderNav(); examScreen();
  });
  if (draft) $("#rtnew").onclick = async () => {
    if (!await ask({ title: "Начать заново", danger: true, ok: "Стереть и начать", text: "Сохранённые ответы пересдачи будут удалены, время пойдёт с нуля." })) return;
    localStorage.removeItem(LSKEY()); screenRetakeIntro(info);
  };
}

/* ---------- экзамен ---------- */
function examScreen() {
  $("#timer").hidden = false;
  $("#app").innerHTML = `<div class="shell"><div class="nav" id="exnav"></div><div><div id="exblk"></div></div></div>`;
  exNav(); exBlock(); exTimer();
}
function exNav() {
  const n = $("#exnav"); if (!n) return;
  n.innerHTML = "";
  EX.data.blocks.forEach((b, i) => {
    const done = b.questions.filter(exAnswered).length;
    const btn = el("button", done === b.questions.length ? "done" : "", `<span>${esc(b.short || b.title)}</span><small>${done}/${b.questions.length}</small>`);
    btn.type = "button"; btn.title = b.title;
    btn.setAttribute("aria-current", i === EX.cur ? "true" : "false");
    btn.onclick = () => { EX.cur = i; exBlock(); exNav(); window.scrollTo(0, 0); };
    n.appendChild(btn);
  });
  exProg();
}
/* строка «Отвечено N из M» и полоса: обновляем и без перерисовки раздела,
   иначе после набранного текста счётчик отстаёт на один ответ */
function exProg() {
  const all = exAll(), done = all.filter(exAnswered).length;
  const line = document.querySelector("#exblk .prog"), bar = document.querySelector("#exblk .bar i");
  if (line) line.textContent = "Отвечено " + done + " из " + all.length;
  if (bar) bar.style.width = Math.round(done / all.length * 100) + "%";
}
let exT = Date.now();
function exTouch(q, soft) {
  const now = Date.now();
  EX.times[q.id] = (EX.times[q.id] || 0) + Math.min(180, Math.round((now - exT) / 1000)); exT = now;
  exSave(); if (soft) exProg(); else exNav();
}
function exBlock() {
  const b = EX.data.blocks[EX.cur], host = $("#exblk"); if (!host) return;
  const all = exAll(), done = all.filter(exAnswered).length;
  host.innerHTML = "";
  const head = el("div", "card");
  head.innerHTML = `<div class="qhead"><div><h3>Раздел ${EX.cur + 1} из ${EX.data.blocks.length}</h3><h2>${esc(b.title)}</h2></div>
    <div class="chip">${b.questions.length} заданий</div></div>
    ${b.intro ? `<p class="lead">${esc(b.intro)}</p>` : ""}
    <div class="bar"><i style="width:${Math.round(done / all.length * 100)}%"></i></div>
    <div class="foot"><span class="prog">Отвечено ${done} из ${all.length}</span></div>`;
  host.appendChild(head);
  let num = 0; EX.data.blocks.slice(0, EX.cur).forEach(x => num += x.questions.length);
  b.questions.forEach((q, i) => host.appendChild(exCard(q, num + i + 1)));
  const nav = el("div", "foot");
  if (EX.cur > 0) { const p = el("button", "btn ghost", "← Предыдущий"); p.type = "button"; p.onclick = () => { EX.cur--; exBlock(); exNav(); window.scrollTo(0, 0); }; nav.appendChild(p); }
  if (EX.cur < EX.data.blocks.length - 1) { const x = el("button", "btn", "Следующий →"); x.type = "button"; x.onclick = () => { EX.cur++; exBlock(); exNav(); window.scrollTo(0, 0); }; nav.appendChild(x); }
  const fin = el("button", "btn" + (EX.cur < EX.data.blocks.length - 1 ? " ghost" : ""), "Завершить и отправить");
  fin.type = "button"; fin.onclick = () => exFinish(false); nav.appendChild(fin);
  host.appendChild(nav);
  exT = Date.now();
}
function exCard(q, idx) {
  const c = el("div", "q" + (exAnswered(q) ? " answered" : "")); c.id = "q-" + q.id;
  const kind = { single: "один ответ", multi: "несколько ответов", short: "короткий ответ", match: "соответствие",
    odd: "убрать лишнее", sim_dsk: "тренажёр: соберите линию", sim_pick: "подбор оборудования", sim_chat: "переписка с клиентом",
    order: "расставьте по порядку", sim_calc: "тренажёр: просчёт по файлу завода" }[q.type] || "задание";
  c.appendChild(el("div", "qn", `<b>ВОПРОС ${idx}</b><i>${kind}</i>${q.points > 1 ? `<i>${plural(q.points, "балл", "балла", "баллов")}</i>` : ""}`));
  c.appendChild(el("p", "qt", esc(q.text)));
  if (q.scheme && EX.data.schemes[q.scheme])
    c.appendChild(el("figure", "figure", EX.data.schemes[q.scheme].svg + `<figcaption>${esc(EX.data.schemes[q.scheme].name)}</figcaption>`));
  const box = el("div", "opts");
  const set = v => { EX.answers[q.id] = v; exTouch(q); exBlock(); };
  if (q.type === "single" || q.type === "multi" || q.type === "odd") {
    const multi = q.type === "multi";
    q.opts.forEach(o => {
      const on = multi ? (exGiven(q) || []).includes(o.id) : exGiven(q) === o.id;
      const lab = el("label", "opt" + (on ? (q.type === "odd" ? " strike" : " on") : ""));
      lab.innerHTML = `<input type="${multi ? "checkbox" : "radio"}" name="${q.id}" ${on ? "checked" : ""}><span>${esc(o.t)}</span>`;
      lab.querySelector("input").onchange = ev => {
        if (multi) { const s = new Set(exGiven(q) || []); ev.target.checked ? s.add(o.id) : s.delete(o.id); set([...s]); }
        else set(o.id);
      };
      box.appendChild(lab);
    });
    if (q.type === "odd") c.appendChild(el("p", "hint", "Отметьте позицию, которая выпадает из ряда."));
  } else if (q.type === "short") {
    const ta = el("textarea"); ta.value = exGiven(q) || ""; ta.placeholder = "1–3 предложения своими словами";
    ta.oninput = () => { EX.answers[q.id] = ta.value; exTouch(q, true); }; ta.onblur = exNav;
    box.appendChild(ta); box.appendChild(el("p", "hint", "Ответ оценивается по смыслу, дословная формулировка не нужна."));
  } else if (q.type === "match") {
    const a = exGiven(q) || {};
    q.pairs.l.forEach((L, i) => {
      const row = el("div", "mrow", `<span>${esc(L)}</span>`);
      const sel = el("select");
      sel.innerHTML = `<option value="">— выберите —</option>` + matchOrder(q.pairs.r).map(o => `<option value="${o.j}" ${a[i] == o.j ? "selected" : ""}>${esc(o.t)}</option>`).join("");
      sel.onchange = () => { const cur = Object.assign({}, exGiven(q) || {}); cur[i] = sel.value; EX.answers[q.id] = cur; exTouch(q); exNav(); };
      row.appendChild(sel); box.appendChild(row);
    });
  } else if (q.type === "sim_dsk") {
    box.appendChild(simDsk(q, set));
  } else if (q.type === "order") {
    box.appendChild(simOrder(q, set));
  } else if (q.type === "sim_calc") {
    box.appendChild(simCalc(q));
  } else if (q.type === "sim_pick") {
    const a = exGiven(q) || { set: [], why: "" };
    q.opts.forEach(o => {
      const on = (a.set || []).includes(o.id);
      const lab = el("label", "opt" + (on ? " on" : ""));
      lab.innerHTML = `<input type="checkbox" ${on ? "checked" : ""}><span>${esc(o.t)}</span>`;
      lab.querySelector("input").onchange = ev => {
        const s = new Set((exGiven(q) || {}).set || []); ev.target.checked ? s.add(o.id) : s.delete(o.id);
        set(Object.assign({}, exGiven(q) || { why: "" }, { set: [...s] }));
      };
      box.appendChild(lab);
    });
    box.appendChild(el("p", "hint", q.ask || "Коротко объясните выбор."));
    const ta = el("textarea"); ta.value = a.why || ""; ta.placeholder = "Почему такой набор";
    ta.oninput = () => { EX.answers[q.id] = Object.assign({}, exGiven(q) || { set: [] }, { why: ta.value }); exTouch(q, true); };
    ta.onblur = exNav; box.appendChild(ta);
  } else if (q.type === "sim_chat") {
    const a = exGiven(q) || { steps: {}, final: "" };
    q.steps.forEach((st, i) => {
      const wrap = el("div", "chat");
      wrap.appendChild(el("div", "msg", `<b>Клиент:</b> ${esc(st.client)}`));
      const opts = el("div", "opts");
      st.opts.forEach(o => {
        const on = (a.steps || {})[i] === o.id;
        const lab = el("label", "opt" + (on ? " on" : ""));
        lab.innerHTML = `<input type="radio" name="${q.id}-${i}" ${on ? "checked" : ""}><span>${esc(o.t)}</span>`;
        lab.querySelector("input").onchange = () => {
          const cur = Object.assign({ steps: {}, final: "" }, exGiven(q) || {});
          cur.steps = Object.assign({}, cur.steps, { [i]: o.id }); set(cur);
        };
        opts.appendChild(lab);
      });
      wrap.appendChild(opts); box.appendChild(wrap);
    });
    box.appendChild(el("div", "msg", `<b>Клиент:</b> ${esc(q.final.client)}`));
    const ta = el("textarea"); ta.value = a.final || ""; ta.placeholder = "Ваш ответ клиенту";
    ta.oninput = () => { EX.answers[q.id] = Object.assign({ steps: {} }, exGiven(q) || {}, { final: ta.value }); exTouch(q, true); };
    ta.onblur = exNav; box.appendChild(ta);
  }
  c.appendChild(box);
  return c;
}

/* ---------- тренажёр линии ---------- */
function simDsk(q, set) {
  const host = el("div", "sim"), pal = el("div", "pal"), chainBox = el("div", "chainbox");
  const get = () => (exGiven(q) || []).slice();
  const paint = () => {
    const c = get();
    chainBox.innerHTML = c.length ? "" : '<div class="empty">Пусто — добавьте узлы из списка выше</div>';
    c.forEach((k, i) => {
      const u = el("div", "unit", U[k].g + `<span>${U[k].n}</span><i>${U[k].r}</i>`);
      const x = el("button", "ux", "×"); x.type = "button";
      x.onclick = () => { const v = get(); v.splice(i, 1); set(v); };
      const mv = el("div", "umv"), L = el("button", "", "‹"), R = el("button", "", "›");
      L.type = R.type = "button"; L.disabled = i === 0; R.disabled = i === c.length - 1;
      L.onclick = () => { const v = get(); const t = v[i - 1]; v[i - 1] = v[i]; v[i] = t; set(v); };
      R.onclick = () => { const v = get(); const t = v[i + 1]; v[i + 1] = v[i]; v[i] = t; set(v); };
      mv.appendChild(L); mv.appendChild(R); u.appendChild(x); u.appendChild(mv);
      chainBox.appendChild(u);
      if (i < c.length - 1) chainBox.appendChild(el("div", "arr", k === "cabinet" || c[i + 1] === "cabinet" ? "·" : "→"));
    });
    pal.querySelectorAll("button[data-k]").forEach(b => b.disabled = !U[b.dataset.k].many && get().includes(b.dataset.k));
  };
  PALG.forEach(g => {
    pal.appendChild(el("h4", "", g[0]));
    g[1].forEach(k => {
      const b = el("button", "", U[k].g + `<span>${U[k].n}</span>`); b.type = "button"; b.dataset.k = k;
      b.onclick = () => { const v = get(); if (U[k].many || !v.includes(k)) { v.push(k); set(v); } };
      pal.appendChild(b);
    });
  });
  const rst = el("button", "btn ghost", "Собрать заново"); rst.type = "button"; rst.onclick = () => set([]);
  host.appendChild(el("h3", "", "Оборудование")); host.appendChild(pal);
  host.appendChild(el("h3", "", "Ваша линия")); host.appendChild(chainBox);
  host.appendChild(el("p", "hint", "Порядок меняется стрелками ‹ ›, крестик убирает узел. Правильных вариантов несколько."));
  host.appendChild(rst);
  paint();
  return host;
}

/* ---------- расставить по порядку: цепочка из нужных шагов, лишние в неё не берут ---------- */
function simOrder(q, set) {
  const host = el("div", "sim order"), pal = el("div", "opal"), chain = el("ol", "ochain");
  const get = () => (exGiven(q) || []).slice(), txt = id => ((q.opts || []).filter(o => o.id === id)[0] || {}).t || id;
  const paint = () => {
    const c = get();
    chain.innerHTML = c.length ? "" : '<li class="empty">Пусто — добавьте шаги из списка выше</li>';
    c.forEach((id, i) => {
      const li = el("li", "ostep", `<b>${i + 1}</b><span>${esc(txt(id))}</span>`);
      const mv = el("div", "omv"), U = el("button", "", "↑"), D = el("button", "", "↓"), X = el("button", "ox", "×");
      U.type = D.type = X.type = "button"; U.title = "выше"; D.title = "ниже"; X.title = "убрать";
      U.disabled = i === 0; D.disabled = i === c.length - 1;
      U.onclick = () => { const v = get(); [v[i - 1], v[i]] = [v[i], v[i - 1]]; set(v); };
      D.onclick = () => { const v = get(); [v[i + 1], v[i]] = [v[i], v[i + 1]]; set(v); };
      X.onclick = () => { const v = get(); v.splice(i, 1); set(v); };
      mv.appendChild(U); mv.appendChild(D); mv.appendChild(X); li.appendChild(mv); chain.appendChild(li);
    });
    pal.querySelectorAll("button[data-id]").forEach(b => { b.disabled = c.includes(b.dataset.id); });
  };
  q.opts.forEach(o => {
    const b = el("button", "", `<span>＋</span>${esc(o.t)}`); b.type = "button"; b.dataset.id = o.id;
    b.onclick = () => { const v = get(); if (!v.includes(o.id)) { v.push(o.id); set(v); } };
    pal.appendChild(b);
  });
  const rst = el("button", "btn ghost", "Собрать заново"); rst.type = "button"; rst.onclick = () => set([]);
  host.appendChild(el("h3", "", "Действия")); host.appendChild(pal);
  host.appendChild(el("h3", "", "Ваша последовательность")); host.appendChild(chain);
  host.appendChild(el("p", "hint", "Нажмите на действие, чтобы добавить его в цепочку. Порядок меняется стрелками ↑ ↓, крестик убирает шаг. Лишние действия в цепочку не берите."));
  host.appendChild(rst);
  paint();
  return host;
}

/* ---------- тренажёр «просчёт по файлу завода» ----------
   Форма как на сайте treidcalc.ru. Серые подсказки — образцы, не данные. Цена продажи считается по формуле сайта,
   расходы 10–17 — примерно (пропорционально фурам, массе и цене); МОПО может их исправить, как на сайте.
   Верность проверяет только сервер — правильных значений в браузере нет. */
const calcNum = v => { const t = String(v == null ? "" : v).replace(/\s/g, "").replace(",", "."); return t === "" || isNaN(+t) ? null : +t; };
const calcFmt = (v, d) => v == null || !isFinite(v) ? "—" : v.toLocaleString("ru-RU", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
function calcExp(q, a) {                                   /* расходы, которые сайт подставил бы сам */
  const m = q.calc || {}, price = calcNum(a.price) || 0, mass = calcNum(a.mass) || 0, tr = calcNum(a.trucks) || 0, r100 = x => Math.round(x / 100) * 100;
  return { e10: r100(m.ferry * tr), e11: r100(m.svh * tr), e12: r100(m.dk0 + m.dk * price), e13: r100(m.dk0 + m.dk * price),
           e14: r100(m.ad0 + m.ad * price), e16: 0, e17: r100(m.cap * mass) };
}
function calcOut(q, a) {                                   /* цена продажи, себестоимость, ЗП — как считает сайт */
  const m = q.calc || {}, P = calcNum(a.price), r = calcNum(a.rate), duty = calcNum(a.duty), p = calcNum(a.profit);
  const E = ["e10", "e11", "e12", "e13", "e14", "e16", "e17"].reduce((s, k) => s + (calcNum(a[k]) || 0), 0);
  if (P == null || r == null || p == null) return { E: E };
  const base = P * r, d = base * (duty || 0) / 100, den = m.k1 * (1 / (1 + m.vat) - m.zp - m.k2) - p / 100;
  if (den <= 0) return { E: E };
  const S = m.k1 * (base + d + E) / den, Sy = Math.round(S / r), Sr = Math.round(Sy * r * 100) / 100, zp = Math.round(Sr * m.zp * 100) / 100;
  return { E: E, Sy: Sy, Sr: Sr, zp: zp, cost: Math.round(S * (1 - p / 100) * 100) / 100, tot: E + zp };
}
function calcFile(q) {                                     /* файл завода — окном поверх задания, уходом со страницы не считается */
  const ov = el("div", "fov"), box = el("div", "fbox");
  let z = 100;
  const img = el("img"); img.alt = q.file.name;
  const sc0 = el("p", "hint", "Загружаем файл…");
  if (q.file.img) img.src = q.file.img;
  else matLoad(q.file.path).then(t => { q.file.img = String(t).trim(); img.src = q.file.img; sc0.remove(); })
    .catch(e => { sc0.textContent = "Файл не загрузился: " + (e.message || e) + ". Закройте окно и откройте ещё раз."; });
  const bar = el("div", "fbar", `<b>${esc(q.file.name)}</b>`), zm = el("span", "fz", "100%");
  const btn = (t, f) => { const b = el("button", "btn ghost", t); b.type = "button"; b.onclick = f; return b; };
  const zoom = d => { z = Math.max(50, Math.min(300, z + d)); img.style.width = z + "%"; zm.textContent = z + "%"; };
  bar.appendChild(btn("−", () => zoom(-25))); bar.appendChild(zm); bar.appendChild(btn("+", () => zoom(25)));
  const close = () => { ov.remove(); document.removeEventListener("keydown", esc_); };
  const esc_ = e => { if (e.key === "Escape") close(); };
  bar.appendChild(btn("× Закрыть", close));
  const sc = el("div", "fscroll"); if (!q.file.img) sc.appendChild(sc0); sc.appendChild(img);
  box.appendChild(bar); box.appendChild(sc); ov.appendChild(box);
  ov.onclick = e => { if (e.target === ov) close(); };
  document.addEventListener("keydown", esc_);
  document.body.appendChild(ov);
}
function simCalc(q) {
  const host = el("div", "calc"), a0 = () => Object.assign({}, exGiven(q) || {});
  const top = el("div", "ctop");
  const fb = el("button", "btn", "📄 Файл завода"); fb.type = "button"; fb.onclick = () => calcFile(q);
  top.appendChild(fb); top.appendChild(el("span", "hint", "Откроется окном поверх задания — уходом со страницы это не считается."));
  host.appendChild(top);
  const out = {}, inp = {};
  const field = (f, wrap) => {
    const w = el("label", "cf" + (f.req ? " req" : "") + (f.ro ? " ro" : ""), `<span>${esc(f.label)}</span>`);
    if (f.ro) { const o = el("div", "cout", f.val != null ? esc(f.val) : "—"); if (f.val == null) out[f.k] = o; w.appendChild(o); }
    else {
      const i = el("input"); i.type = "text"; i.inputMode = f.text ? "text" : "decimal"; i.placeholder = f.ph || ""; i.dataset.k = f.k;
      i.oninput = () => {
        const a = a0(); a[f.k] = i.value;
        if (/^e1/.test(f.k)) { a.edited = Object.assign({}, a.edited || {}, { [f.k]: true }); }
        EX.answers[q.id] = calcSync(q, a); exTouch(q, true); paint();
      };
      inp[f.k] = i; w.appendChild(i);
    }
    wrap.appendChild(w);
  };
  q.form.forEach(g => {
    const sec = el("div", "cblk " + (g.tone || ""), `<div class="ch"><b>${esc(g.title)}</b>${g.tag ? `<i>${esc(g.tag)}</i>` : ""}</div>`);
    const grid = el("div", "cgrid"); g.fields.forEach(f => field(f, grid)); sec.appendChild(grid); host.appendChild(sec);
  });
  host.appendChild(el("p", "hint", "НДС = 22%, налог на прибыль = 25% — как на сайте. Кнопок «Скачать PNG» и «Сохранить» в задании нет: вопрос о них — отдельно."));
  const paint = () => {
    const a = calcSync(q, a0()), c = calcOut(q, a);
    Object.keys(inp).forEach(k => { if (document.activeElement !== inp[k]) inp[k].value = a[k] == null ? "" : a[k]; });
    if (out.sy) out.sy.textContent = calcFmt(c.Sy); if (out.sr) out.sr.textContent = calcFmt(c.Sr, 1);
    if (out.zp) out.zp.textContent = calcFmt(c.zp, 2); if (out.cost) out.cost.textContent = calcFmt(c.cost, 2);
    if (out.tot) out.tot.textContent = calcFmt(c.tot, 2);
  };
  if (!exGiven(q)) EX.answers[q.id] = calcSync(q, Object.assign({}, q.start || {}));
  paint();
  return host;
}
function calcSync(q, a) {                                  /* расходы, которые МОПО не правил руками, пересчитываются сами */
  const auto = calcExp(q, a), ed = a.edited || {};
  Object.keys(auto).forEach(k => { if (!ed[k]) a[k] = String(auto[k]); });
  return a;
}

/* ---------- время и внимание ---------- */
function exTimer() {
  clearInterval(window.__exti);
  window.__exti = setInterval(() => {
    if (!EX.running) return;
    const t = $("#timer"); if (!t) return;
    const left = EX.data.minutes * 60 - Math.round((Date.now() - EX.startedAt) / 1000);
    const a = Math.abs(left);
    t.querySelector("b").textContent = (left < 0 ? "+" : "") + String(Math.floor(a / 3600)).padStart(2, "0") + ":" +
      String(Math.floor(a % 3600 / 60)).padStart(2, "0") + ":" + String(a % 60).padStart(2, "0");
    t.className = "tmr" + (left < 0 ? " over" : left < 900 ? " warn" : "");
    t.querySelector("span").textContent = left < 0 ? "время вышло, ответы принимаются" : "осталось";
    if (left === 900 || left === 300) toast(left === 900 ? "Осталось 15 минут." : "Осталось 5 минут. Экзамен не оборвётся, время фиксируется.");
  }, 1000);
}
document.addEventListener("visibilitychange", () => {
  if (!EX.running) return;
  if (document.hidden) { EX.away.since = Date.now(); EX.away.count++; }
  else if (EX.away.since) { EX.away.sec += Math.round((Date.now() - EX.away.since) / 1000); EX.away.since = 0; exSave(); }
});

/* ---------- окно завершения: сколько без ответа по разделам (только пропуски, без подсказок о верности) ---------- */
function exFinishDialog(miss) {
  return new Promise(res => {
    const back = el("div", "modal-back");
    const rows = EX.data.blocks.map((b, i) => ({ i: i, title: b.short || b.title, k: b.questions.filter(q => !exAnswered(q)).length }))
      .filter(r => r.k);
    const none = miss.length === exAll().length;
    back.innerHTML = none
      ? `<div class="modal finish" role="dialog" aria-modal="true">
          <b>Вы ещё не ответили ни на один вопрос</b>
          <p>Пустой экзамен отправить нельзя. Ответьте хотя бы на часть вопросов — ответы сохраняются сами.</p>
          <div class="mbtns"><button type="button" class="btn blue" data-a="0">Вернуться к экзамену</button></div></div>`
      : miss.length
      ? `<div class="modal finish" role="dialog" aria-modal="true">
          <b>Есть вопросы без ответа</b>
          <p>Вы не ответили на ${plural(miss.length, "вопрос", "вопроса", "вопросов")}:</p>
          <div class="misslist">${rows.map(r => `<button type="button" class="missrow" data-i="${r.i}">
              <span>Раздел ${r.i + 1}. ${esc(r.title)}</span><b>${r.k}</b></button>`).join("")}</div>
          <div class="note warn">Если завершить экзамен сейчас, за вопросы без ответа будет <strong style="display:inline">0 баллов</strong>.</div>
          <div class="mbtns"><button type="button" class="btn green" data-a="0">Вернуться к экзамену</button>
            <button type="button" class="btn red" data-a="1">Завершить</button></div></div>`
      : `<div class="modal finish" role="dialog" aria-modal="true">
          <b>Завершить экзамен?</b>
          <p>Вы ответили на все вопросы. Вы уверены, что хотите завершить экзамен и отправить ответы? Изменить их после этого будет нельзя.</p>
          <div class="mbtns"><button type="button" class="btn blue" data-a="0">Вернуться к экзамену</button>
            <button type="button" class="btn green" data-a="1">Завершить экзамен</button></div></div>`;
    const done = v => { back.remove(); lockScroll(false); res(v); };
    back.querySelector('[data-a="0"]').onclick = () => done(false);
    const fin = back.querySelector('[data-a="1"]'); if (fin) fin.onclick = () => done(true);
    back.querySelectorAll("[data-i]").forEach(b => b.onclick = () => {   /* клик по разделу — сразу туда */
      done(false); EX.cur = Number(b.dataset.i); exBlock(); exNav(); window.scrollTo(0, 0);
    });
    back.onclick = ev => { if (ev.target === back) done(false); };
    document.body.appendChild(back); lockScroll(true);
  });
}

/* ---------- отправка ---------- */
async function exFinish(silent) {                 /* silent === true — без окна (уход со страницы, повторная отправка) */
  silent = silent === true;
  const all = exAll(), miss = all.filter(q => !exAnswered(q));
  if (!silent && !await exFinishDialog(miss)) return;
  EX.running = false; clearInterval(window.__exti); $("#timer").hidden = true; renderNav();
  $("#app").innerHTML = `<div class="card"><h2>Отправляем ответы</h2>
    <p class="lead" id="exst">Проверка идёт на сервере, включая развёрнутые ответы. Это занимает до минуты — не закрывайте страницу.</p>
    <div class="bar"><i style="width:45%"></i></div></div>`;
  const payload = {
    version: EX.data.version, startedAt: new Date(EX.startedAt).toISOString(),
    durationSec: Math.round((Date.now() - EX.startedAt) / 1000),
    overtimeSec: Math.max(0, Math.round((Date.now() - EX.startedAt) / 1000) - EX.data.minutes * 60),
    away: { count: EX.away.count, sec: EX.away.sec },
    answers: all.map(q => ({ id: q.id, given: exGiven(q) === undefined ? null : exGiven(q), sec: EX.times[q.id] || 0 }))
  };
  try {
    const retake = EX.mode === "retake";
    const r = retake ? await api("retake.submit", { data: Object.assign(payload, { id: EX.retakeId }) })
                     : await api("exam.submit", { data: payload });
    localStorage.removeItem(LSKEY());
    if (retake) { EX.data = null; EX.mode = "exam"; EX.retakeId = ""; r.kind = "retake"; }
    else if (PR.progress) { PR.progress.examAllowed = false; PR.progress.examForce = false; }   /* повтор — только через руководителя */
    if (typeof MX !== "undefined") MX.data = null;
    exResult(r);
  } catch (e) {
    $("#exst").innerHTML = "Не удалось отправить: " + esc(e.message) + ". Ответы сохранены — нажмите «Отправить ещё раз».";
    const b = el("button", "btn", "Отправить ещё раз"); b.type = "button"; b.onclick = () => exFinish(true);
    $("#app").querySelector(".card").appendChild(b);
  }
}
function exResult(r) {
  const v = r.verdict === "сдал" ? "ok" : r.verdict === "пересдача" ? "retry" : "fail";
  const rt = r.kind === "retake";
  const txt = r.verdict === "сдал" ? (rt ? "Пересдача сдана." : "Экзамен сдан.") + " Руководитель посмотрит результат и откроет следующий этап."
    : r.verdict === "пересдача" ? (rt ? "Пересдача не сдана" : "Экзамен не сдан") + ", но результат допускает пересдачу. Руководитель пришлёт разбор ошибок."
    : (rt ? "Пересдача не сдана." : "Экзамен не сдан.") + " Материал нужно пройти заново — руководитель пришлёт разбор и план подготовки.";
  $("#app").innerHTML = `<div class="card"><h2>${rt ? "Пересдача завершена" : "Экзамен завершён"}</h2>
    <div class="res">
      <div><b>${r.score} / ${r.max}</b><span>баллов</span></div>
      <div><b>${r.percent}%</b><span>результат</span></div>
      <div><b>${r.correct} / ${r.total}</b><span>верных заданий</span></div>
    </div>
    <div class="verdict ${v}"><b>${r.verdict === "сдал" ? "Сдано" : r.verdict === "пересдача" ? "Допуск к пересдаче" : "Не сдано"}</b><p>${txt}</p></div>
    <h3>По разделам</h3>
    <table class="bt"><tr><th>Блок</th><th>Баллы</th><th>%</th></tr>
      ${(r.byBlock || []).slice().sort((x, y) => blockNum(x.n) - blockNum(y.n)).map(b => `<tr><td>${blockNum(b.n)}. ${esc(b.title)}</td><td>${b.got} / ${b.max}</td><td>${b.max ? Math.round(b.got / b.max * 100) : 0}%</td></tr>`).join("")}
    </table>
    <p class="hint">Правильные ответы здесь не показываются. Разбор ошибок появится во вкладке «Экзамен», когда руководитель его отправит.</p>
    ${r.needsReview ? `<div class="note">Часть развёрнутых ответов (${plural(r.needsReview, "задание", "задания", "заданий")}) проверит руководитель вручную — итог может немного измениться.</div>` : ""}
    <div class="foot"><button class="btn" id="exhome" type="button">Вернуться в кабинет</button></div></div>`;
  const home = $("#exhome");
  if (home) home.onclick = () => go("cabinet");           /* без этой кнопки с экрана результата было не уйти */
}

/* ---------- демо-подсчёт (без сервера): ответы разбираем по ключу мини-тестов и заглушкам ---------- */
function demoGrade(data) {
  const all = exAll ? exAll() : [];
  let max = 0, pts = 0, ok = 0;
  const by = {}, answers = [];
  const optText = (q, id) => ((q.opts || []).filter(o => o.id === id)[0] || {}).t || String(id);
  all.forEach(q => {
    const a = (data.answers || []).filter(x => x.id === q.id)[0] || { given: null, sec: 0 };
    const g = a.given;
    const filled = g !== null && g !== "" && !(Array.isArray(g) && !g.length) &&
                   !(g && typeof g === "object" && !Array.isArray(g) && !Object.keys(g).length);
    max += q.points;
    const p = filled ? Math.round(q.points * 0.7) : 0;      /* в демо считаем условно */
    pts += p; if (filled) ok++;
    const b = by[q.b] || (by[q.b] = { n: q.b, title: (EX.data.blocks.filter(x => x.n === q.b)[0] || {}).title || "", got: 0, max: 0 });
    b.got += p; b.max += q.points;
    let givenText = "— нет ответа —";
    if (filled) {
      if (q.type === "single" || q.type === "odd") givenText = optText(q, g);
      else if (q.type === "multi") givenText = g.map(x => optText(q, x)).join("; ");
      else if (q.type === "short") givenText = String(g);
      else if (q.type === "match") givenText = q.pairs.l.map((L, i) => L + " → " + (q.pairs.r[Number(g[i])] || "?")).join("; ");
      else if (q.type === "sim_dsk") givenText = g.join(" → ");
      else if (q.type === "sim_pick") givenText = "Набор: " + (g.set || []).map(x => optText(q, x)).join("; ") + ". Обоснование: " + (g.why || "");
      else if (q.type === "sim_chat") givenText = "Шаги: " + Object.keys(g.steps || {}).length + ". Финальный ответ: " + (g.final || "");
      else if (q.type === "order") givenText = g.map((x, i) => (i + 1) + ") " + optText(q, x)).join("; ");
      else if (q.type === "sim_calc") givenText = (q.form || []).flatMap(f => f.fields).filter(f => !f.ro).map(f => f.label + ": " + (g[f.k] || "—")).join("; ");
    }
    answers.push({ id: q.id, block: q.b, type: q.type, given: g, sec: a.sec || 0, points: p, max: q.points,
      correct: p === q.points, text: q.text, givenText: givenText,
      right: "(в демо эталоны не показываются — их знает только сервер)",
      explain: "В рабочей версии здесь будет разбор из ключа.", source: "демо" });
  });
  const percent = max ? Math.round(pts / max * 100) : 0;
  return { score: pts, max: max, percent: percent, correct: ok, total: all.length,
           verdict: percent >= 90 ? "сдал" : percent >= 60 ? "пересдача" : "не сдал",
           byBlock: Object.keys(by).map(k => by[k]).sort((x, y) => x.n - y.n), answers: answers, demo: true };
}
