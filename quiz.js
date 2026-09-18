/* Мини-тест после блока: 5 вопросов, порог 3, попытки не ограничены (но считаются). */
const QZ = { data: null, key: null, cur: null, answers: {}, from: null };
async function quizBack() {
  const f = QZ.from;
  APP.screen = "cabinet"; renderNav();
  if (!f) return screenCabinet();
  try { await loadCabinet(); } catch (e) { return fail(e); }
  openBlock(f.block, null, f.sub); window.scrollTo(0, f.y || 0);
}
const quizBackLabel = () => QZ.from ? "Вернуться к теме" : "Вернуться в кабинет";

/* исходные тесты — data/quiz.json; правки РОПа/разработчика приходят с сервера (quiz.overrides) и перекрывают их */
async function quizData(fresh) {
  if (fresh) QZ.data = null;
  await quizFiles();
  if (!QZ.data) {
    const data = { quizzes: Object.assign({}, QZ.base.quizzes) };
    try {                                             /* правки тестов уже пришли при входе — второй запрос не нужен */
      const over = !fresh && PR && PR.qOver ? PR.qOver : (await api("quiz.overrides")).quizzes;
      Object.assign(data.quizzes, over || {});
      if (fresh && PR) PR.qOver = null;
    } catch (e) { /* без правок — исходные тесты */ }
    QZ.data = data;
  }
  return QZ.data;
}
async function quizFiles() {
  if (!QZ.base) QZ.base = JSON.parse(await matLoad("data/quiz.json"));
  if (APP.demo && !QZ.key) QZ.key = await fetch("data/quiz_demo_key.json", { cache: "no-store" }).then(r => r.json());
}
/* тот же вид «без ответов», что собирает сервер */
function quizPublicOf(q) {
  return { id: q.id, title: q.title, pass: q.pass, version: q.version, questions: q.questions.map(x => {
    const item = { id: x.id, type: x.type, text: x.text };
    if (x.type === "match") item.pairs = { l: x.pairs.map(p => p.l), r: x.pairs.map(p => p.r) };
    else item.opts = (x.options || []).map(o => ({ id: o.id, t: o.t }));
    return item;
  }) };
}
/* проверка теста перед сохранением (то же проверяет сервер) — вернёт текст ошибки или "" */
function quizCheck(d) {
  const qs = (d && d.questions) || [];
  if (!qs.length) return "В тесте нет ни одного вопроса";
  for (let i = 0; i < qs.length; i++) {
    const x = qs[i], n = "Вопрос " + (i + 1) + ": ";
    if (!String(x.text || "").trim()) return n + "нет текста";
    if (x.type === "match") {
      if ((x.pairs || []).length < 2 || x.pairs.some(p => !String(p.l || "").trim() || !String(p.r || "").trim())) return n + "нужно минимум две заполненные пары";
    } else {
      if ((x.options || []).length < 2 || x.options.some(o => !String(o.t || "").trim())) return n + "нужно минимум два заполненных варианта";
      const ans = [].concat(x.answer || []);
      if (!ans.length) return n + (x.type === "odd" ? "отметьте лишний вариант" : "отметьте правильный ответ");
      if (x.type !== "multi" && ans.length !== 1) return n + "правильный ответ должен быть один";
    }
  }
  const pass = Number(d.pass);
  if (!(pass >= 1 && pass <= qs.length)) return "Порог должен быть от 1 до " + qs.length;
  return "";
}
/* правые части «соответствия» показываем по алфавиту — иначе верный ответ всегда «по диагонали» */
const matchOrder = r => r.map((t, j) => ({ t, j })).sort((a, b) => a.t.localeCompare(b.t, "ru"));
async function startQuiz(quizId, title) {
  const d = await quizData();
  const q = d.quizzes[quizId];
  if (!q) { toast("Мини-тест по этому блоку ещё готовится"); return; }
  QZ.cur = q; QZ.answers = {};
  /* откуда пришли: после теста вернём в ту же тему и на ту же прокрутку */
  QZ.from = document.getElementById("subs") && PR.block ? { block: PR.block, sub: PR.sub, y: window.scrollY } : null;
  quizScreen(title);
}
function quizScreen(title) {
  const q = QZ.cur;
  $("#htitle").textContent = "Мини-тест";
  $("#app").innerHTML = `<div class="card">
    <div class="qhead"><div><h3>Самопроверка</h3><h2>${esc(title || q.title || "Мини-тест")}</h2></div>
      <div class="chip">${q.questions.length} вопросов · порог ${q.pass}</div></div>
    <p class="lead">Это не экзамен: попытки не ограничены. После ответа сразу покажем, где ошибка и что перечитать.</p>
    <div id="qzlist"></div>
    <div class="foot"><button class="btn" id="qzgo" type="button">Проверить</button>
      <button class="btn ghost" id="qzback" type="button">${quizBackLabel()}</button></div></div>`;
  const host = $("#qzlist");
  q.questions.forEach((x, i) => host.appendChild(quizCard(x, i + 1)));
  $("#qzback").onclick = quizBack;
  $("#qzgo").onclick = quizSubmit;
}
function quizCard(x, idx) {
  const c = el("div", "q"); c.id = "qz-" + x.id;
  const kind = { single: "один ответ", multi: "несколько ответов", odd: "убрать лишнее", match: "соответствие" }[x.type];
  c.appendChild(el("div", "qn", `<b>ВОПРОС ${idx}</b><i>${kind}</i>`));
  c.appendChild(el("p", "qt", esc(x.text)));
  const box = el("div", "opts");
  if (x.type === "match") {
    QZ.answers[x.id] = QZ.answers[x.id] || {};
    x.pairs.l.forEach((L, i) => {
      const row = el("div", "mrow", `<span>${esc(L)}</span>`);
      const sel = el("select");
      sel.innerHTML = `<option value="">— выберите —</option>` + matchOrder(x.pairs.r).map(o => `<option value="${o.j}">${esc(o.t)}</option>`).join("");
      sel.onchange = () => { QZ.answers[x.id][i] = sel.value; };
      row.appendChild(sel); box.appendChild(row);
    });
  } else {
    const multi = x.type === "multi";
    x.opts.forEach(o => {
      const lab = el("label", "opt");
      lab.innerHTML = `<input type="${multi ? "checkbox" : "radio"}" name="qz-${x.id}"><span>${esc(o.t)}</span>`;
      lab.querySelector("input").onchange = ev => {
        if (multi) { const s = new Set(QZ.answers[x.id] || []); ev.target.checked ? s.add(o.id) : s.delete(o.id); QZ.answers[x.id] = [...s]; }
        else QZ.answers[x.id] = o.id;
        box.querySelectorAll(".opt").forEach(l2 => l2.classList.toggle("on", !!l2.querySelector("input").checked));
      };
      box.appendChild(lab);
    });
  }
  c.appendChild(box);
  return c;
}
async function quizSubmit() {
  const q = QZ.cur;
  const unanswered = q.questions.filter(x => {
    const a = QZ.answers[x.id];
    if (a == null) return true;
    if (x.type === "multi") return !a.length;
    if (x.type === "match") return Object.keys(a).length !== x.pairs.l.length || Object.values(a).some(v => v === "");
    return !String(a).length;
  });
  if (unanswered.length && !await ask({ title: "Не на все ответили", ok: "Всё равно проверить", cancel: "Дозаполнить",
      text: `Без ответа осталось ${unanswered.length} из ${q.questions.length}.` })) return;
  $("#qzgo").disabled = true; $("#qzgo").textContent = "Проверяем…";
  try {
    const r = await api("quiz.submit", { quiz: q.id, answers: QZ.answers });
    if (PR.progress) {                                  /* сперва прогресс — от него зависит вердикт */
      const cur = PR.progress.quizzes[q.id] || { attempts: 0, best: 0, total: r.total, passed: false };
      cur.attempts++; cur.best = Math.max(cur.best, r.score); cur.total = r.total; cur.passed = cur.passed || r.passed;
      if (cur.passed) cur.retake = false;
      PR.progress.quizzes[q.id] = cur;
    }
    quizResult(r);
  } catch (e) { fail(e); $("#qzgo").disabled = false; $("#qzgo").textContent = "Проверить"; }
}
function quizResult(r) {
  const q = QZ.cur;
  const cls = r.passed ? "ok" : "retry";
  const verd = quizVerdict(q.id);
  $("#app").innerHTML = `<div class="card">
    <h2>${r.passed ? "Мини-тест сдан" : "Ещё не сдан"}</h2>
    <div class="res"><div><b>${r.score} / ${r.total}</b><span>верных ответов</span></div>
      <div><b>${q.pass}</b><span>порог</span></div>
      <div><b>${r.attempts || "—"}</b><span>попыток всего</span></div></div>
    <div class="verdict ${cls}"><b>${r.passed ? verd.head : "Нужно повторить материал"}</b>
      <p>${r.passed ? verd.text : "Попытки не ограничены — перечитайте темы ниже и попробуйте снова."}</p></div>
    ${(r.details || []).filter(d => !d.correct).length ? "<h3>Что перечитать</h3>" : ""}
    ${(r.details || []).filter(d => !d.correct).map(d => `<div class="q bad">
        <p class="qt">${esc(d.text || "")}</p>
        <div class="hint"><b>Как правильно:</b> ${esc(d.explain || "")}</div>
        ${d.ref ? `<div class="hint"><b>Где смотреть:</b> <button class="link" data-ref="${esc(d.ref.id)}" type="button">${esc(d.ref.title)}</button></div>` : ""}</div>`).join("")}
    <div class="foot"><button class="btn" id="qzagain" type="button">Пройти ещё раз</button>
      <button class="btn ghost" id="qzhome" type="button">${quizBackLabel()}</button></div></div>`;
  document.querySelectorAll("[data-ref]").forEach(b => b.onclick = () => openLessonById(b.dataset.ref));
  $("#qzagain").onclick = () => { QZ.answers = {}; quizScreen(q.title); };
  $("#qzhome").onclick = quizBack;
}
/* что написать после сдачи: тема закрыта, блок целиком или только часть */
function quizVerdict(quizId) {
  const prog = PR && PR.program;
  if (!prog) return { head: "Тест сдан", text: "Отличный результат." };
  let block = null, sub = null;
  prog.blocks.forEach(b => {
    if (b.quiz === quizId) block = b;
    b.subs.forEach(s2 => { if (s2.quiz === quizId) { block = b; sub = s2; } });
  });
  if (!block) return { head: "Тест сдан", text: "Отличный результат." };
  const st = blockStat(block);
  if (sub) {
    const mine = sub.lessons.filter(l => l.ready && !PR.progress.lessons[l.id]).length;
    if (mine) return { head: "Мини-тест сдан",
      text: "В самой теме остались неотмеченные материалы: " + mine + ". Отметьте их — и тема закроется." };
    const left = block.subs.filter(s2 => {
      const dn = s2.lessons.filter(l => PR.progress.lessons[l.id]).length;
      const qq = s2.quiz ? PR.progress.quizzes[s2.quiz] : null;
      return !(dn === s2.lessons.length && (!s2.quiz || (qq && qq.passed)));
    }).length;
    return left
      ? { head: "Тема закрыта", text: "В блоке " + blockNum(block.n) + " осталось тем: " + left + ". Можно идти к следующей." }
      : { head: "Тема закрыта", text: "Это была последняя тема блока " + blockNum(block.n) + " — осталось сдать контрольный тест по блоку." };
  }
  return st.ready
    ? { head: "Блок засчитан", text: "Следующий блок открыт. Можно идти дальше." }
    : { head: "Тест сдан", text: "В блоке ещё остались непройденные материалы — отметьте их, и блок закроется." };
}

async function showQuizReview(quizId, title) {
  let r;
  try { r = await api("quiz.review", { quiz: quizId }); } catch (e) { return fail(e); }
  if (!r || !r.details || !r.details.length) { toast("Разбор появится после первой попытки"); return; }
  const back = el("div", "modal-back");
  const wrong = r.details.filter(d => !d.correct);
  back.innerHTML = `<div class="modal wide" role="dialog" aria-modal="true">
    <b>Разбор: ${esc(title)}</b>
    ${r.changed ? '<div class="note warn">После этой попытки тест изменили — ниже вопросы в том виде, в каком вы их проходили.</div>' : ""}
    <p class="hint">Последняя попытка от ${esc(String(r.at || "").slice(0, 10))}: ${r.score} из ${r.total},
      ${r.passed ? "тест сдан" : "тест не сдан"}. Всего попыток: ${r.attempts}.</p>
    ${r.details.map(d => `<div class="q ${d.correct ? "" : "bad"}">
        <div class="qn"><b>${d.correct ? "верно" : "неверно"}</b></div>
        <p class="qt">${esc(d.text || "")}</p>
        <div class="hint"><b>Ваш ответ:</b> ${esc(d.givenText || "— нет ответа —")}</div>
        ${d.correct ? "" : `<div class="hint"><b>Как правильно:</b> ${esc(d.explain || "")}</div>
          ${d.ref ? `<div class="hint"><b>Где смотреть:</b> <button class="link" data-ref="${esc(d.ref.id)}" type="button">${esc(d.ref.title)}</button></div>` : ""}`}
      </div>`).join("")}
    <div class="mbtns"><button class="btn ghost" data-a="0" type="button">Закрыть</button>
      <button class="btn" data-a="1" type="button">Пройти ещё раз</button></div></div>`;
  document.body.appendChild(back); lockScroll(true);
  back.querySelector('[data-a="0"]').onclick = () => { back.remove(); lockScroll(false); };
  back.querySelector('[data-a="1"]').onclick = () => { back.remove(); lockScroll(false); startQuiz(quizId, title); };
  back.querySelectorAll("[data-ref]").forEach(b2 => b2.onclick = () => openLessonById(b2.dataset.ref));
}

function demoGiven(q, a) {
  if (a == null) return "";
  if (q.type === "match") return [].concat(a).map((x, i) => (q.pairs[i] ? q.pairs[i].l : "") + " → " +
    (q.pairs[Number(x)] ? q.pairs[Number(x)].r : "—")).join("; ");
  const names = {};
  (q.options || []).forEach(o => names[o.id] = o.t);
  return [].concat(a).map(x => names[x] || x).join("; ");
}

/* демо-проверка: ключ лежит рядом только в демо-режиме, в рабочей версии считает сервер */
async function demoQuizDef(id) {
  await quizFiles();                                   /* не quizData(): она сама спрашивает правки — был бы круг */
  const rows = (DEMO.quizEdits || {})[id] || [], e = rows[rows.length - 1], base = QZ.key.quizzes[id], pub = QZ.base.quizzes[id];
  const orig = base ? { id: id, title: pub ? pub.title : "", pass: base.pass,
    questions: Object.keys(base.questions).map(k => Object.assign({ id: k }, base.questions[k])) } : null;
  if (!e) return orig && Object.assign(orig, { version: 0, retakeAt: "", edited: false, original: true });
  const common = { version: e.version, retakeAt: e.retakeAt || "", editedAt: e.at, editedBy: e.by };
  if (e.reset) return orig && Object.assign(orig, common, { edited: false, original: true });
  return Object.assign({ id: id, title: e.data.title, pass: e.data.pass, questions: JSON.parse(JSON.stringify(e.data.questions)) }, common, { edited: true, original: !!base });
}
async function demoQuizGrade(quizId, answers) {
  const k = await demoQuizDef(quizId), det = [];
  let score = 0;
  k.questions.forEach(q => {
    const id = q.id, a = answers[id];
    let ok = false;
    if (a != null) {
      if (q.type === "single" || q.type === "odd") ok = a === [].concat(q.answer)[0];
      else if (q.type === "multi") ok = JSON.stringify([].concat(a).sort()) === JSON.stringify([].concat(q.answer).sort());
      else if (q.type === "match") ok = q.pairs.every((p, i) => q.pairs[Number(a[i])] && q.pairs[Number(a[i])].r === p.r);
    }
    if (ok) score++;
    det.push({ id: id, correct: ok, text: q.text, explain: q.explain, source: q.source,
               ref: q.ref || null, givenText: demoGiven(q, a) });
  });
  const total = k.questions.length;
  return { score: score, total: total, passed: score >= k.pass, details: det, attempts: null, version: k.version };
}
