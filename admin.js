/* дата из профиля: 1990-05-14 → 14.05.1990 */
const fmtDate = d => { const m = String(d || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + "." + m[2] + "." + m[1] : esc(d); };
/* Кабинет РОПа и разработчика: разделы живут в шапке, тело — здесь. */
const ADM = { tab: "students", users: "work" };
const ADM_TITLES = { students: "Ученики", attempts: "Экзамены", users: "Сотрудники", questions: "Вопросы от МОПО",
                     devq: "Вопросы от РОПов", materials: "Материалы", settings: "Настройки" };

function screenAdmin(tab) {
  if (tab) ADM.tab = tab;
  if (ADM.tab === "devq" && APP.user.role !== "dev") ADM.tab = "questions";
  $("#htitle").textContent = ADM_TITLES[ADM.tab] || "Кабинет";
  $("#timer").hidden = true;
  $("#app").innerHTML = `<div id="admbody"></div>`;
  ({ students: admStudents, attempts: admAttempts, users: admUsers, materials: admMaterials,
     questions: () => admQuestions("rop"), devq: () => admQuestions("dev"), settings: admSettings }[ADM.tab])();
}

/* кружок с числом неотвеченных — как непрочитанные в Telegram, горит, пока не ответишь */
async function refreshBadges() {
  if (!isStaff(APP.user)) return;
  let b;
  try { b = await api("admin.badges"); } catch (e) { return; }
  const set = (key, n) => {
    const btn = document.querySelector(`#nav [data-k="${key}"]`); if (!btn) return;
    let i = btn.querySelector(".badge");
    if (!n) { if (i) i.remove(); return; }
    if (!i) { i = el("i", "badge"); btn.appendChild(i); }
    i.textContent = n > 99 ? "99+" : n;
  };
  set("adm:questions", b.questions || 0);
  set("adm:devq", b.devQuestions || 0);
  set("adm:users", b.resets || 0);
}


/* ---------- ученики: визуальный прогресс ---------- */
async function admStudents() {
  const host = $("#admbody");
  host.innerHTML = `<div class="card"><h2>Ученики</h2><p class="lead" id="sst">Загружаем…</p></div><div id="slist"></div>`;
  let data, prog;
  try {
    prog = PR.program || await api("program");
    PR.program = prog;
    data = await api("admin.students");
  } catch (e) { $("#sst").textContent = e.message; return; }
  const list = data.students || [];
  const blocks = prog.blocks;
  const lessonsIn = b => readyOf(b.subs.flatMap(s => s.lessons)).length;       /* «скоро» не считаем */
  const quizzesIn = b => [b.quiz].concat(b.subs.map(s => s.quiz)).filter(Boolean);
  $("#sst").innerHTML = list.length
    ? `Всего сотрудников: ${list.length}. Цвет квадрата — состояние блока.`
    : "Сотрудники ещё не заведены. Добавьте их на вкладке «Сотрудники».";
  const host2 = $("#slist"); host2.innerHTML = "";
  list.forEach(st => {
    const card = el("div", "stud");
    const doneLessons = st.lessonsDone || 0;
    const totalLessons = blocks.reduce((s, b) => s + lessonsIn(b), 0);
    let current = null;
    const line = blocks.map(b => {
      const qs = quizzesIn(b);
      const passed = qs.filter(q => (st.quizzes || {})[q] && st.quizzes[q].passed).length;
      const lessons = readyOf(b.subs.flatMap(s => s.lessons));
      const dn = lessons.filter(l => (st.lessons || {})[l.id]).length;
      const ready = dn === lessons.length && passed === qs.length;
      const started = dn > 0 || passed > 0;
      if (!ready && !current) current = b.n;
      return `<span class="${ready ? "done" : started ? "part" : ""} ${!ready && current === b.n ? "now" : ""}" title="Блок ${blockNum(b.n)}: ${b.title} — материалов ${dn}/${lessons.length}, мини-тестов ${passed}/${qs.length}">${blockNum(b.n)}</span>`;
    }).join("");
    const pct = totalLessons ? Math.round(doneLessons / totalLessons * 100) : 0;
    card.innerHTML = `<div class="sh">${avatarHtml(st, 34)}<div class="who2"><h4>${esc(st.fio)}</h4>
          <small>${roleName(st)}${st.email ? " · " + esc(st.email) : ""}${st.birthday ? " · д.р. " + fmtDate(st.birthday) : ""}</small></div>
        <span class="tag">${esc(st.login)}</span>${st.active === false ? '<span class="tag fail">доступ закрыт</span>' : ""}
        ${st.examAllowed ? `<span class="tag ok">экзамен открыт${st.examForce ? " досрочно" : ""}</span>` : '<span class="tag">экзамен закрыт</span>'}
        ${st.attempts ? `<span class="tag ${st.lastVerdict === "сдал" ? "ok" : st.lastVerdict === "пересдача" ? "retry" : "fail"}">экзамен: ${esc(st.lastVerdict || "—")} ${st.lastPercent != null ? st.lastPercent + "%" : ""}</span>` : ""}
        <div class="acts">
          <button class="btn ghost" data-a="access" type="button">${st.examAllowed ? "Закрыть экзамен" : "Допустить к экзамену"}</button>
          ${st.attempts ? '<button class="btn ghost" data-a="report" type="button">Отчёты по экзамену</button>' : ""}
        </div></div>
      <div class="blocks-line">${line}</div>
      <div class="legend2">
        <i><u class="lg-done"></u> блок пройден</i>
        <i><u class="lg-part"></u> в процессе</i>
        <i><u class="lg-none"></u> не начат</i>
        <span style="margin-left:auto">материалов ${doneLessons} из ${totalLessons} · ${pct}%</span>
      </div>
      <div class="bar" style="margin-top:8px"><i style="width:${pct}%"></i></div>
      <div class="foot" style="margin-top:8px"><button class="btn ghost" data-a="detail" type="button">Подробно по блокам</button></div>
      <div class="sdetail" hidden></div>`;
    const notReady = blocks.filter(b => {
      const qs = quizzesIn(b), lessons = readyOf(b.subs.flatMap(s => s.lessons));
      const dn = lessons.filter(l => (st.lessons || {})[l.id]).length;
      const passed = qs.filter(q => (st.quizzes || {})[q] && st.quizzes[q].passed).length;
      return !(dn === lessons.length && passed === qs.length);
    });
    card.querySelector('[data-a="access"]').onclick = async () => {
      let force = false;
      if (!st.examAllowed && notReady.length) {
        const ok = await ask({ title: "Блоки ещё не закрыты", danger: true, ok: "Всё равно допустить", cancel: "Отмена",
          text: `У сотрудника не закрыто блоков: <b>${notReady.length}</b> (${notReady.slice(0, 6).map(b => blockNum(b.n)).join(", ")}${notReady.length > 6 ? "…" : ""}).<br>
                 Обычно к экзамену допускают после всех блоков. Открыть доступ досрочно?` });
        if (!ok) return;
        force = true;
      }
      try {
        await api("admin.examAccess", { userId: st.id, allow: !st.examAllowed, force: force });
        toast(st.examAllowed ? "Экзамен закрыт" : force ? "Экзамен открыт досрочно" : "Экзамен открыт");
        admStudents();
      } catch (e) { fail(e); }
    };
    card.querySelector('[data-a="detail"]').onclick = () => {
      const box = card.querySelector(".sdetail"), btn = card.querySelector('[data-a="detail"]');
      if (!box.innerHTML) {
        box.innerHTML = blocks.map(b => {
          const rows = b.subs.map(sub => {
            const lessons = readyOf(sub.lessons), dn = lessons.filter(l => (st.lessons || {})[l.id]).length;
            const q = sub.quiz ? (st.quizzes || {})[sub.quiz] : null;
            const pc = lessons.length ? Math.round(dn / lessons.length * 100) : 0;
            return `<div class="srow"><span>${esc(sub.title || b.title)}</span>
              <b>${dn} / ${lessons.length}</b>
              <div class="bar"><i style="width:${pc}%"></i></div>
              <em>${sub.quiz ? (q ? (q.passed ? "тест сдан " + q.best + "/" + q.total : q.retake ? "тест обновлён — ждём пересдачу" : "тест не сдан, попыток " + q.attempts) : "тест не пройден") : ""}</em></div>`;
          }).join("");
          const bq = b.quiz ? (st.quizzes || {})[b.quiz] : null;
          return `<div class="sblock"><h5>Блок ${blockNum(b.n)}. ${esc(b.title)}</h5>${rows}
            ${b.quiz ? `<div class="srow"><span>Мини-тест по блоку</span><b></b><div></div>
              <em>${bq ? (bq.passed ? "сдан " + bq.best + "/" + bq.total + ", попыток " + bq.attempts : bq.retake ? "тест обновлён — ждём пересдачу" : "не сдан, попыток " + bq.attempts) : "не пройден"}</em></div>` : ""}</div>`;
        }).join("");
      }
      box.hidden = !box.hidden;
      btn.textContent = box.hidden ? "Подробно по блокам" : "Свернуть";
    };
    const rep = card.querySelector('[data-a="report"]');
    if (rep) rep.onclick = () => { ADM.tab = "attempts"; ADM.filter = st.id; screenAdmin(); };
    host2.appendChild(card);
  });
}

/* ---------- экзамены ---------- */
async function admAttempts() {
  const host = $("#admbody");
  host.innerHTML = `<div class="card"><h2>Результаты экзаменов</h2><p class="lead" id="ast">Загружаем…</p>
    <div class="seg wide" id="atseg"></div>
    <div class="atbar" id="atbar" hidden>
      <select id="atwho"></select>
      <select id="atver"><option value="">Любой итог</option><option>сдал</option><option>пересдача</option><option>не сдал</option></select>
      <select id="atsort"><option value="new">Сначала новые</option><option value="old">Сначала старые</option>
        <option value="hi">Больше баллов</option><option value="lo">Меньше баллов</option><option value="fio">По сотруднику (А–Я)</option></select>
    </div><div id="atbl"></div></div>`;
  let list = [];
  try { list = (await api("admin.attempts")).attempts || []; } catch (e) { $("#ast").textContent = e.message; return; }
  const F = ADM.att = ADM.att || { seg: "work", who: "", ver: "", sort: "new" };
  const nArch = list.filter(a => a.archived).length;
  $("#ast").textContent = list.length ? "Нажмите на строку, чтобы открыть ответы. Старые и пробные попытки можно убрать в архив или удалить." : "Пока ни одной сданной попытки.";
  if (!list.length) return;
  $("#atbar").hidden = false;
  $("#atseg").innerHTML = `<button type="button" data-s="work">Актуальные <i>${list.length - nArch}</i></button><button type="button" data-s="arch">Архив <i>${nArch}</i></button>`;
  const people = [...new Set(list.map(a => a.fio))].sort((a, b) => String(a).localeCompare(b));
  $("#atwho").innerHTML = `<option value="">Все сотрудники</option>` + people.map(f => `<option>${esc(f)}</option>`).join("");
  $("#atwho").value = F.who; $("#atver").value = F.ver; $("#atsort").value = F.sort;
  const vcls = v => v === "сдал" ? "ok" : v === "пересдача" ? "retry" : "fail";
  const when = a => new Date(a.finishedAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const draw = () => {
    $("#atseg").querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.s === F.seg));
    const shown = list.filter(a => (F.seg === "arch" ? a.archived : !a.archived) && (!F.who || a.fio === F.who) && (!F.ver || a.verdict === F.ver))
      .sort((x, y) => F.sort === "old" ? String(x.finishedAt).localeCompare(String(y.finishedAt))
        : F.sort === "hi" ? (Number(y.percent) - Number(x.percent)) : F.sort === "lo" ? (Number(x.percent) - Number(y.percent))
        : F.sort === "fio" ? String(x.fio).localeCompare(y.fio) || String(y.finishedAt).localeCompare(String(x.finishedAt))
        : String(y.finishedAt).localeCompare(String(x.finishedAt)));
    const box = $("#atbl"); box.innerHTML = "";
    if (!shown.length) { box.appendChild(el("p", "hint", F.seg === "arch" ? "В архиве пусто." : "Под эти условия попыток нет.")); return; }
    const t = el("table", "bt");
    t.innerHTML = `<tr><th>Сотрудник</th><th>Когда</th><th>Время</th><th>Уходил</th><th>Баллы</th><th>%</th><th>Итог</th><th></th></tr>` +
      shown.map((a, i) => `<tr class="arow" data-i="${i}"><td>${esc(a.fio)}</td><td>${when(a)}</td>
        <td>${Math.round((a.durationSec || 0) / 60)} мин${a.overtimeSec ? " (+" + Math.round(a.overtimeSec / 60) + ")" : ""}</td>
        <td>${a.awayCount || 0}</td><td>${a.score} / ${a.max}</td><td>${a.percent}%</td>
        <td><span class="tag ${vcls(a.verdict)}">${esc(a.verdict)}</span></td>
        <td class="atact"><button class="btn small white" data-arch="${i}" type="button">${a.archived ? "Вернуть" : "В архив"}</button>
          <button class="mdel" data-del="${i}" type="button">Удалить</button></td></tr>`).join("");
    box.appendChild(t);
    t.querySelectorAll(".arow").forEach(r => r.onclick = ev => { if (ev.target.closest("button")) return; admAttempt(shown[+r.dataset.i].id); });
    t.querySelectorAll("[data-arch]").forEach(b => b.onclick = () => attemptArchive(shown[+b.dataset.arch], admAttempts));
    t.querySelectorAll("[data-del]").forEach(b => b.onclick = () => attemptDelete(shown[+b.dataset.del], admAttempts));
  };
  $("#atseg").querySelectorAll("button").forEach(b => b.onclick = () => { F.seg = b.dataset.s; draw(); });
  $("#atwho").onchange = e => { F.who = e.target.value; draw(); };
  $("#atver").onchange = e => { F.ver = e.target.value; draw(); };
  $("#atsort").onchange = e => { F.sort = e.target.value; draw(); };
  draw();
}
async function attemptArchive(a, then) {
  try { await api("admin.attemptArchive", { id: a.id, archived: !a.archived }); toast(a.archived ? "Попытка возвращена из архива" : "Попытка в архиве"); then(); }
  catch (e) { fail(e); }
}
async function attemptDelete(a, then) {
  if (!await ask({ title: "Удалить результат?", danger: true, ok: "Удалить",
      text: `Попытка <b>${esc(a.fio)}</b> от ${esc(new Date(a.finishedAt).toLocaleString("ru-RU"))} (${a.percent}%, ${esc(a.verdict)}) и все ответы по ней будут стёрты. Отменить нельзя.<br>Если нужно только убрать из списка — перенесите в архив.` })) return;
  try { await api("admin.attemptDel", { id: a.id }); toast("Результат удалён"); then(); } catch (e) { fail(e); }
}
async function admAttempt(id) {
  const host = $("#admbody");
  host.innerHTML = `<div class="card"><p class="lead">Загружаем ответы…</p></div>`;
  let a;
  try { a = await api("admin.attempt", { id: id }); if (!PR.program) PR.program = await api("program"); } catch (e) { return fail(e); }
  const byBlock = (a.byBlock || []).slice().sort((x, y) => blockNum(x.n) - blockNum(y.n));
  const vcls = a.verdict === "сдал" ? "ok" : a.verdict === "пересдача" ? "retry" : "fail";
  host.innerHTML = `<div class="card">
    <div class="qhead"><div><h3>${new Date(a.finishedAt).toLocaleString("ru-RU")}</h3><h2>${esc(a.fio)}</h2></div>
      <div class="chip">${a.percent}% · ${esc(a.verdict)}</div></div>
    <div class="res">
      <div><b>${a.score} / ${a.max}</b><span>баллов</span></div>
      <div><b>${a.correct} / ${a.total}</b><span>верных заданий</span></div>
      <div><b>${Math.round((a.durationSec || 0) / 60)} мин</b><span>время${a.overtimeSec ? ", превышение " + Math.round(a.overtimeSec / 60) + " мин" : ""}</span></div>
      <div><b>${(a.away && a.away.count) || 0}</b><span>выходов со страницы</span></div>
    </div>
    <div class="verdict ${vcls}"><b>Порог сдачи 90%, допуск к пересдаче 60%</b></div>
    <h3>По блокам</h3>
    <table class="bt"><tr><th>Блок</th><th>Баллы</th><th>%</th></tr>
      ${byBlock.map(b => `<tr><td>${blockNum(b.n)}. ${esc(b.title)}</td><td>${b.got} / ${b.max}</td><td>${b.max ? Math.round(b.got / b.max * 100) : 0}%</td></tr>`).join("")}</table>
    <div class="foot"><button class="btn ghost" id="aback" type="button">← Ко всем</button>
      <button class="btn ghost" id="arep" type="button">Отчёт для руководителя</button>
      <button class="btn ghost" id="afb" type="button">Разбор для сотрудника</button>
      <button class="btn small white" id="aarch" type="button" style="margin-left:auto">${a.archived ? "Вернуть из архива" : "В архив"}</button>
      <button class="btn small red" id="adel" type="button">Удалить</button></div>
    <div class="foot" style="margin-top:6px"><button class="btn ghost" id="atoggle" type="button">Показать ответы по заданиям</button></div>
    <div id="alist" hidden>
    ${(a.answers || []).map((r, i) => `<div class="q ${r.correct === true ? "" : "bad"}">
      <div class="qn"><b>${i + 1} · блок ${blockNum(r.block)}</b><i>${esc(r.difficulty || r.type)}</i><i>${r.points}/${r.max} балла</i><i>${r.sec || 0} сек</i>
        <span class="tag ${r.correct === true ? "ok" : r.points ? "retry" : "fail"}">${r.correct === true ? "верно" : r.points ? "частично" : "неверно"}</span></div>
      <p class="qt">${esc(r.text || r.id)}</p>
      <div class="hint"><b>Ответ:</b> ${esc(r.givenText || "")}</div>
      <div class="hint"><b>Эталон:</b> ${esc(r.right || "")}</div>
      ${r.ai ? `<div class="hint"><b>Проверка ИИ:</b> ${esc(r.ai.comment || "")}${r.ai.miss && r.ai.miss.length ? " · не раскрыто: " + esc(r.ai.miss.join("; ")) : ""}</div>` : ""}
      ${r.sim ? `<div class="hint"><b>Разбор задания:</b> ${esc((r.sim.notes || []).join("; ") || "выполнено верно")}</div>` : ""}
      <div class="hint"><b>Источник:</b> ${esc(r.source || "")}</div></div>`).join("")}
    </div>
  </div>`;
  $("#atoggle").onclick = () => {
    const box = $("#alist"); box.hidden = !box.hidden;
    $("#atoggle").textContent = box.hidden ? "Показать ответы по заданиям" : "Скрыть ответы";
  };
  $("#aback").onclick = admAttempts;
  $("#aarch").onclick = () => attemptArchive(a, admAttempts);
  $("#adel").onclick = () => attemptDelete(a, admAttempts);
  $("#arep").onclick = () => printReport(a, "full");
  $("#afb").onclick = () => printReport(a, "feedback");
}

/* ---------- печать отчётов ---------- */
function printReport(a, mode) {
  const full = mode === "full";
  const wrong = (a.answers || []).filter(r => r.correct !== true);
  const items = full ? (a.answers || []) : wrong;
  const weak = (a.byBlock || []).filter(b => b.max && b.got / b.max < 0.9).sort((x, y) => x.got / x.max - y.got / y.max);
  const css = `body{font-family:Manrope,Arial,sans-serif;color:#232227;font-size:10.5pt;line-height:1.45;margin:24px}
    h1{font-size:19pt;margin:0 0 4px} h2{font-size:12pt;margin:18px 0 6px;border-top:2px solid #232227;padding-top:8px}
    .meta{color:#4A4950;font-size:9.5pt;margin-bottom:10px} table{width:100%;border-collapse:collapse;font-size:9.5pt}
    th{text-align:left;font-size:7.5pt;letter-spacing:.1em;text-transform:uppercase;color:#98969C;padding:4px 6px}
    td{padding:4px 6px;border-top:1px solid #E5E3DF} .q{border:1px solid #E5E3DF;border-radius:8px;padding:8px 10px;margin:6px 0;page-break-inside:avoid}
    .q.bad{border-color:#E8C3B4;background:#FEF9F7} .n{font-size:7.5pt;color:#98969C;font-weight:800;letter-spacing:.08em}
    .t{font-weight:700;margin:2px 0 5px} .r{font-size:9.5pt;margin:2px 0} .lbl{color:#6D6B72;display:inline-block;min-width:92px}
    @page{size:A4;margin:14mm 12mm}`;
  const head = `<h1>${full ? "Отчёт по экзамену" : "Разбор экзамена"} — ${esc(a.fio)}</h1>
    <div class="meta">Дата: ${new Date(a.finishedAt).toLocaleString("ru-RU")} · Результат: <b>${a.percent}%</b> (${a.score} из ${a.max}) ·
      Итог: <b>${esc(a.verdict)}</b>${full ? ` · Время: ${Math.round((a.durationSec || 0) / 60)} мин · Выходов со страницы: ${(a.away && a.away.count) || 0}` : ""}</div>
    ${!full && weak.length ? `<h2>С чего начать подготовку</h2><ol>${weak.map(b => `<li><b>${blockNum(b.n)}. ${esc(b.title)}</b> — ${Math.round(b.got / b.max * 100)}%. ${b.got / b.max < 0.6 ? "Блок нужно пройти заново." : "Повторите материал и разберите ошибки ниже."}</li>`).join("")}</ol>` : ""}
    ${full ? `<h2>Результат по блокам</h2><table><tr><th>Блок</th><th>Баллы</th><th>%</th></tr>
      ${(a.byBlock || []).slice().sort((x, y) => blockNum(x.n) - blockNum(y.n)).map(b => `<tr><td>${blockNum(b.n)}. ${esc(b.title)}</td><td>${b.got} / ${b.max}</td><td>${b.max ? Math.round(b.got / b.max * 100) : 0}%</td></tr>`).join("")}</table>` : ""}
    <h2>${full ? "Ответы по заданиям" : `Разбор заданий с ошибками (${wrong.length})`}</h2>`;
  const body = items.map((r, i) => `<div class="q ${r.correct === true ? "" : "bad"}">
      <div class="n">№${i + 1} · блок ${blockNum(r.block)} · ${esc(r.difficulty || r.type)} · ${r.points}/${r.max} балла</div>
      <div class="t">${esc(r.text || r.id)}</div>
      <div class="r"><span class="lbl">${full ? "Ответ:" : "Ваш ответ:"}</span> ${esc(r.givenText || "")}</div>
      ${full ? `<div class="r"><span class="lbl">Эталон:</span> ${esc(r.right || "")}</div>` : ""}
      ${r.ai ? `<div class="r"><span class="lbl">Комментарий:</span> ${esc(r.ai.comment || "")}${r.ai.miss && r.ai.miss.length ? " Не хватает: " + esc(r.ai.miss.join("; ")) : ""}</div>` : ""}
      ${r.sim ? `<div class="r"><span class="lbl">Что не так:</span> ${esc((r.sim.notes || []).join("; "))}</div>` : ""}
      ${!full ? `<div class="r"><span class="lbl">Как правильно:</span> ${esc(r.explain || "")}</div>` : ""}
      <div class="r"><span class="lbl">Где смотреть:</span> ${esc(r.source || "")}</div></div>`).join("");
  const v = el("div", "viewer report");
  v.innerHTML = `<div class="vhead"><b>${full ? "Отчёт для руководителя" : "Разбор для сотрудника"} — ${esc(a.fio)}</b>
      <button type="button" data-a="print">Печать / сохранить PDF</button>
      <button type="button" data-a="close">Закрыть</button></div>
    <div class="rpaper"><style>${css}</style>${head}${body}</div>`;
  v.querySelector('[data-a="close"]').onclick = () => v.remove();
  v.querySelector('[data-a="print"]').onclick = () => {
    const paper = v.querySelector(".rpaper");
    const prev = document.body.innerHTML;
    document.body.innerHTML = `<div class="printroot">${paper.innerHTML}</div>`;
    window.print();
    document.body.innerHTML = prev;
    location.reload();                         /* после печати возвращаем страницу в рабочее состояние */
  };
  document.body.appendChild(v);
}

/* ---------- сотрудники ---------- */
const userStatus = u => u.archived ? "archived" : u.active === false ? "blocked" : "active";
const STATUS_TAG = { active: '<span class="tag ok">работает</span>', blocked: '<span class="tag fail">доступ закрыт</span>',
                     archived: '<span class="tag">в архиве</span>' };
/* надёжный пароль: 12 знаков из случайного набора, без похожих 0/O и 1/l/I, обязательно заглавная, строчная, цифра и знак */
function genPassword() {
  const sets = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnpqrstuvwxyz", "23456789", "!@#$%*-_+?"];
  const all = sets.join(""), rnd = n => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
  const out = sets.map(s => s[rnd(s.length)]);
  while (out.length < 12) out.push(all[rnd(all.length)]);
  for (let i = out.length - 1; i > 0; i--) { const j = rnd(i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out.join("");
}
async function admUsers() {
  const dev = APP.user.role === "dev";
  const host = $("#admbody");
  host.innerHTML = `<div class="card"><div class="qhead"><div><h2>${dev ? "Сотрудники: РОПы и МОПО" : "Сотрудники"}</h2>
    <p class="lead">${dev ? "Все учётные записи платформы. Здесь же видны МОПО, которых завели РОПы."
      : "Заведите МОПО и выдайте логин и пароль. Если человек ушёл — закройте доступ или перенесите в архив: прогресс сохранится."}</p></div>
    <button class="btn" id="uadd" type="button">${dev ? "Добавить" : "Добавить МОПО"}</button></div>
    <div id="ureset"></div><div class="seg wide" id="useg"></div><div id="utbl"></div></div>`;
  let list = [], resets = [];
  try { list = (await api("admin.users")).users || []; resets = (await api("admin.resets")).resets || []; } catch (e) { return fail(e); }
  if (resets.length) {
    const rb = $("#ureset");
    rb.className = "resets";
    rb.innerHTML = `<div class="flab">Забыли пароль · ${resets.length}</div>` + resets.map((r, i) => `<div class="rrow">
        <span><b>${esc(r.fio)}</b> <span class="hint">логин ${esc(r.login)} · ${roleName(r)} · ${esc(new Date(r.at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }))}</span></span>
        <button class="btn small" data-r="${i}" type="button">Задать новый пароль</button></div>`).join("") +
      `<p class="hint tiny">Нажмите, сгенерируйте пароль, сохраните и передайте его сотруднику лично. Запрос закроется сам.</p>`;
    rb.querySelectorAll("[data-r]").forEach(b => b.onclick = () => {
      const u = list.filter(x => x.id === resets[+b.dataset.r].userId)[0];
      if (u) userForm(u, true); else toast("Сотрудник не найден");
    });
  }
  const nArch = list.filter(u => u.archived).length;
  const seg = $("#useg");
  seg.innerHTML = `<button type="button" data-u="work">Работают <i>${list.length - nArch}</i></button>
    <button type="button" data-u="arch">Архив <i>${nArch}</i></button>`;
  seg.querySelectorAll("button").forEach(b => {
    b.classList.toggle("on", b.dataset.u === ADM.users);
    b.onclick = () => { ADM.users = b.dataset.u; admUsers(); };
  });
  const shown = list.filter(u => ADM.users === "arch" ? u.archived : !u.archived)
    .sort((a, b) => ({ dev: 0, admin: 1, employee: 2 }[a.role] - { dev: 0, admin: 1, employee: 2 }[b.role]) || String(a.fio).localeCompare(b.fio));
  const t = el("table", "bt");
  t.innerHTML = `<tr><th>Сотрудник</th><th>Логин</th><th>Роль</th><th>Почта</th><th>Дата рождения</th><th>Статус</th><th></th></tr>` +
    (shown.length ? shown.map((u, i) => `<tr class="${u.archived ? "arch" : ""}"><td><span class="ucell">${avatarHtml(u, 26)}${esc(u.fio)}</span></td><td>${esc(u.login)}</td>
      <td>${roleName(u)}</td><td>${u.email ? `<a href="mailto:${esc(u.email)}">${esc(u.email)}</a>` : '<span class="hint">—</span>'}</td>
      <td>${u.birthday ? fmtDate(u.birthday) : '<span class="hint">—</span>'}</td>
      <td>${STATUS_TAG[userStatus(u)]}${u.archived && u.archivedAt ? `<div class="hint tiny">с ${fmtDate(String(u.archivedAt).slice(0, 10))}</div>` : ""}</td>
      <td><button class="btn small white" data-i="${i}" type="button">Управлять</button></td></tr>`).join("")
    : `<tr><td colspan="7" class="hint">${ADM.users === "arch" ? "В архиве пока никого." : "Сотрудников пока нет."}</td></tr>`);
  host.querySelector("#utbl").appendChild(t);
  t.querySelectorAll("[data-i]").forEach(b => b.onclick = () => userForm(shown[+b.dataset.i]));
  $("#uadd").onclick = () => userForm(null);
}
function userForm(u, reset) {
  const dev = APP.user.role === "dev";
  const back = el("div", "modal-back");
  const st = u ? userStatus(u) : "active", self = u && APP.user && u.id === APP.user.id;
  back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" style="max-width:560px">
    <b>${u ? esc(u.fio) : dev ? "Новая учётная запись" : "Новый МОПО"}</b>
    ${u ? `<div class="ustat">${STATUS_TAG[st]}</div>` : ""}
    <label class="f">Имя и фамилия</label><input type="text" id="ufio" value="${esc(u ? u.fio : "")}">
    <label class="f">Логин</label><input type="text" id="ulogin" value="${esc(u ? u.login : "")}" ${u ? "disabled" : ""}>
    <label class="f">${u ? "Новый пароль (оставьте пустым — не менять)" : "Пароль"}</label>
    <div class="pwrow"><input type="text" id="upass" placeholder="виден вам, чтобы передать сотруднику" autocomplete="off">
      <button class="btn small white" type="button" id="ugen">Сгенерировать</button>
      <button class="btn small white" type="button" id="ucopy" hidden>Скопировать</button></div>
    <label class="f">Роль</label>
    ${dev ? `<select id="urole"><option value="employee">МОПО</option><option value="admin">РОП</option><option value="dev">Разработчик</option></select>`
          : `<input type="text" value="МОПО" disabled><input type="hidden" id="urole" value="employee">
             <p class="hint tiny">РОПов заводит разработчик.</p>`}
    <div class="mbtns"><button class="btn ghost" data-a="0" type="button">Отмена</button>
      <button class="btn" data-a="1" type="button">Сохранить</button></div>
    ${u && !self ? `<div class="udanger">
      <div class="flab">Доступ</div>
      ${st === "active" ? `<button class="btn small white" data-s="blocked" type="button">Закрыть доступ</button>
          <button class="btn small white" data-s="archived" type="button">Перенести в архив</button>
          <p class="hint tiny">«Закрыть доступ» — вход заблокирован, в учениках остаётся. «Архив» — для ушедших: скрыт из учеников, прогресс и ответы хранятся, можно вернуть.</p>` : ""}
      ${st === "blocked" ? `<button class="btn small green" data-s="active" type="button">Открыть доступ</button>
          <button class="btn small white" data-s="archived" type="button">Перенести в архив</button>` : ""}
      ${st === "archived" ? `<button class="btn small green" data-s="active" type="button">Вернуть из архива</button>
          <button class="btn small red" data-del="1" type="button">Удалить навсегда</button>
          <p class="hint tiny">Удаление сотрёт профиль, прогресс, заметки, вопросы и результаты экзаменов. Отменить нельзя.</p>` : ""}
    </div>` : ""}</div>`;
  document.body.appendChild(back); lockScroll(true);
  if (u && dev) back.querySelector("#urole").value = u.role || "employee";
  const pass = back.querySelector("#upass"), copy = back.querySelector("#ucopy");
  if (reset) { pass.value = genPassword(); copy.hidden = false; setTimeout(() => pass.select(), 30); }
  back.querySelector("#ugen").onclick = () => { pass.value = genPassword(); copy.hidden = false; pass.select(); };
  copy.onclick = async () => {
    try { await navigator.clipboard.writeText(pass.value); toast("Пароль скопирован — передайте его сотруднику"); }
    catch (e) { pass.select(); toast("Скопируйте вручную: пароль выделен"); }
  };
  const close = () => { back.remove(); lockScroll(false); };
  back.querySelector('[data-a="0"]').onclick = close;
  back.querySelector('[data-a="1"]').onclick = async () => {
    const d = { id: u ? u.id : "", fio: back.querySelector("#ufio").value.trim(), login: back.querySelector("#ulogin").value.trim(),
      password: pass.value, role: back.querySelector("#urole").value };
    if (!d.fio || (!u && (!d.login || !d.password))) { toast("Заполните имя, логин и пароль"); return; }
    if (d.password && d.password.length < 6) { toast("Пароль — минимум 6 знаков. Нажмите «Сгенерировать»"); return; }
    try { await api("admin.userSave", { data: d }); close(); admUsers(); refreshBadges(); toast(d.password ? "Сохранено — передайте новый пароль сотруднику" : "Сохранено"); } catch (e) { fail(e); }
  };
  const TXT = { blocked: ["Закрыть доступ?", "Сотрудник больше не сможет войти. Прогресс сохранится, доступ можно вернуть.", "Закрыть доступ"],
                archived: ["Перенести в архив?", "Сотрудник пропадёт из списка учеников и не сможет войти. Всё, что он прошёл, сохранится — вернуть можно в любой момент.", "В архив"],
                active: ["Открыть доступ?", "Сотрудник снова сможет войти и продолжит с того места, где остановился.", "Открыть"] };
  back.querySelectorAll("[data-s]").forEach(b => b.onclick = async () => {
    const [title, text, ok] = TXT[b.dataset.s];
    if (!await ask({ title: title, text: text, ok: ok, danger: b.dataset.s !== "active" })) return;
    try { await api("admin.userStatus", { id: u.id, status: b.dataset.s }); close(); admUsers(); toast("Готово"); } catch (e) { fail(e); }
  });
  const del = back.querySelector("[data-del]");
  if (del) del.onclick = async () => {
    if (!await ask({ title: "Удалить навсегда?", danger: true, ok: "Удалить",
        text: `<b>${esc(u.fio)}</b> — профиль, прогресс, заметки, вопросы и результаты экзаменов будут стёрты. Это нельзя отменить.` })) return;
    try { await api("admin.userDelete", { id: u.id }); close(); admUsers(); toast("Сотрудник удалён"); } catch (e) { fail(e); }
  };
}

/* ---------- материалы ---------- */
const MAT_KINDS = ["видео", "конспект", "схема", "тренажёр", "документ", "таблица", "презентация", "шаблон", "практика", "сайт", "ссылка"];
const truthy = v => !(v === false || v === "FALSE" || v === "false");
/* сколько исходных вопросов экзамена относится к каждому уроку (по уроку-источнику) */
async function examBaseCounts() {
  if (ADM.examBase) return ADM.examBase;
  const d = JSON.parse(await matLoad("data/exam.json")), out = {};                /* на сайте экзамен лежит зашифрованным */
  d.blocks.forEach(b => b.questions.forEach(q => { if (q.ref) out[q.ref] = (out[q.ref] || 0) + 1; }));
  return (ADM.examBase = out);
}
/* subId — id темы или b:<n> для материалов блока без темы */
const lessonUnit = l => String(l.sub || "") || "b:" + l.block;
function subExamState(d, subId, list, base) {
  const baseN = d.lessons.filter(l => lessonUnit(l) === String(subId)).reduce((s, l) => s + (base[l.id] || 0), 0);
  const added = list.topics[subId], excluded = (list.excluded || []).map(String).includes(String(subId));
  const left = Math.max(0, baseN - ((list.removed || {})[subId] || 0));                /* исходные, которые удалили в кабинете, не считаем */
  return { baseN: left, added: added || 0, excluded: excluded, on: !excluded && (added !== undefined || left > 0) };
}
function examStateText(st) {
  if (!st.on) return st.baseN ? "снята с экзамена (исходных вопросов по теме: " + st.baseN + ")" : "вопросов по теме в экзамене нет";
  const parts = [];
  if (st.baseN) parts.push("исходных вопросов: " + st.baseN);
  if (st.added) parts.push("добавленных: " + st.added);
  return "входит · " + (parts.join(", ") || "вопросов пока нет");
}
async function matData() {
  const d = await api("admin.materials");
  d.blocks = (d.blocks || []).slice().sort((a, b) => (Number(a.order) || Number(a.n)) - (Number(b.order) || Number(b.n)) || a.n - b.n);
  let k = 0; d.blocks.forEach(b => b.num = truthy(b.active) ? ++k : "");   /* номер = место среди видимых блоков */
  d.subs = (d.subs || []).slice().sort((a, b) => (a.block - b.block) || (a.order - b.order));
  d.lessons = (d.lessons || []).slice().sort((a, b) => (a.block - b.block) || (a.order - b.order));
  return d;
}
/* удалять: разработчик — всё, РОП — только то, что добавил сам */
const canDelMat = row => APP.user.role === "dev" || (!!row.createdBy && row.createdBy === APP.user.id);
/* удаление с выбором: «Спрятать» (зелёная — ничего не теряется) или «Удалить» навсегда */
async function delMaterial(kind, row, d) {
  const inB = l => Number(l.block) === Number(row.n), inS = l => String(l.sub) === String(row.id);
  const ls = kind === "block" ? d.lessons.filter(inB) : kind === "sub" ? d.lessons.filter(inS) : [];
  const subs = kind === "block" ? d.subs.filter(x => Number(x.block) === Number(row.n)) : [];
  const mayDel = canDelMat(row) && !ls.some(l => !canDelMat(l)) && !subs.some(x => !canDelMat(x));
  const shown = truthy(row.active);
  const what = kind === "block" ? `блок «${esc((row.num ? row.num + ". " : "") + row.title)}»` : kind === "sub" ? `тему «${esc(row.title)}»` : `материал «${esc(row.title)}»`;
  const inside = [subs.length ? plural(subs.length, "тема", "темы", "тем") : "", ls.length ? plural(ls.length, "материал", "материала", "материалов") : ""].filter(Boolean).join(" и ");
  if (!mayDel && !shown) return toast(kind === "block" ? "В блоке есть материалы, которые добавили не вы — удалить его может разработчик" : "Удалить это может разработчик");
  const v = await choose({ title: mayDel ? "Удалить или спрятать?" : "Спрятать?",
    text: `<p>${mayDel ? "Удалить" : "Спрятать"} ${what}?${inside ? ` Внутри: ${inside}.` : ""}</p>
      ${shown ? `<p class="hint"><b class="inl">Спрятать</b> — сотрудники перестанут видеть${kind === "block" ? " блок" : kind === "sub" ? " тему" : " материал"}, прогресс и заметки сохранятся, вернуть можно одной кнопкой.</p>` : ""}
      ${mayDel ? `<p class="hint"><b class="inl">Удалить</b> — пропадёт навсегда${inside ? " вместе со всем, что внутри" : ""}. Отменить нельзя.</p>`
        : `<p class="hint">Удалить ${kind === "block" ? "блок" : "тему"} может только разработчик: внутри есть материалы, добавленные не вами.</p>`}`,
    buttons: [{ label: "Отмена", cls: "ghost", value: null }]
      .concat(shown ? [{ label: "Спрятать", cls: "green", value: "hide" }] : [])
      .concat(mayDel ? [{ label: "Удалить навсегда", cls: "red", value: "del" }] : []) });
  if (!v) return false;
  if (v === "hide") return setVisible(kind, row, false, d);
  const undo = matPending(kind, row, "Удаляем…");
  try {
    if (kind === "block") await api("admin.blockDel", { n: row.n });
    else if (kind === "sub") await api("admin.subDel", { id: row.id });
    else await api("admin.lessonDel", { id: row.id });
    /* сервер закончил — убираем из своей копии списка, без повторной долгой загрузки */
    if (kind === "block") { d.lessons = d.lessons.filter(l => !inB(l)); d.subs = d.subs.filter(x => Number(x.block) !== Number(row.n)); d.blocks = d.blocks.filter(x => Number(x.n) !== Number(row.n)); }
    else if (kind === "sub") { d.lessons = d.lessons.filter(l => !inS(l)); d.subs = d.subs.filter(x => String(x.id) !== String(row.id)); }
    else d.lessons = d.lessons.filter(l => l.id !== row.id);
    PR.program = null; toast(kind === "block" ? "Блок удалён" : kind === "sub" ? "Тема удалена" : "Материал удалён");
    return true;
  } catch (e) { undo(); fail(e); return false; }
}
async function setVisible(kind, row, active, d) {
  const undo = matPending(kind, row, active ? "Показываем…" : "Прячем…");
  try {
    await api("admin.visible", { kind: kind, id: kind === "block" ? row.n : row.id, active: active });
    row.active = active;
    PR.program = null;
    toast(active ? "Снова видно сотрудникам" : (kind === "block" ? "Блок спрятан" : kind === "sub" ? "Тема спрятана" : "Материал спрятан") + " — вернуть можно кнопкой «Показать»");
    return true;
  } catch (e) { undo(); fail(e); return false; }
}
/* пока сервер думает (5–10 с), строка приглушена и кнопки не нажимаются — чтобы не удалить случайно что-то другое */
function matPending(kind, row, text) {
  const key = kind === "block" ? "b:" + row.n : kind === "sub" ? "s:" + row.id : "l:" + row.id;
  const els = [...document.querySelectorAll(`[data-mk="${CSS.escape(key)}"]`)];
  els.forEach(e => { e.classList.add("pending"); e.dataset.pend = text; e.querySelectorAll("button").forEach(b => b.disabled = true); });
  return () => els.forEach(e => { e.classList.remove("pending"); e.querySelectorAll("button").forEach(b => b.disabled = false); });
}
async function admMaterials(local) {                 /* local — своя копия списка после правки: рисуем сразу, без долгой загрузки */
  const y = window.scrollY, host = $("#admbody");
  const firstLoad = !$("#ltbl");
  if (firstLoad) host.innerHTML = `<div class="card"><div class="qhead"><div><h2>Материалы кабинета</h2>
    <p class="lead">Видео, конспекты, документы и мини-тесты по блокам и темам. Меняете здесь — сотрудники сразу видят новое.
      ${APP.user.role === "dev" ? "Удалять можно любые материалы, темы и блоки." : "Удалять можно материалы, темы и блоки, которые добавили вы; спрятать — любые."}</p></div>
    <button class="btn" id="ladd" type="button">Добавить материал</button></div><div id="ltbl"><p class="hint">Загружаем…</p></div></div>`;
  let d;
  let exams = { topics: {}, excluded: [] }, base = {};
  try {
    d = local || await matData(); await quizData();
    exams = await api("admin.examList"); base = await examBaseCounts();
  } catch (e) { return fail(e); }
  const box = $("#ltbl"); box.innerHTML = "";
  const quizInfo = id => { const q = QZ.data && QZ.data.quizzes[id]; return q ? plural(q.questions.length, "вопрос", "вопроса", "вопросов") + " · порог " + q.pass : "мини-тест"; };
  const reload = async ok => { if (ok) { await admMaterials(d); } };
  const headBtns = (wrap, kind, row) => {
    const shown = truthy(row.active);
    const sh = el("button", "mshow" + (shown ? "" : " on"), shown ? "Спрятать" : "Показать"); sh.type = "button";
    sh.title = shown ? "Скрыть от сотрудников, ничего не удаляя" : "Снова показать сотрудникам";
    sh.onclick = async () => reload(shown ? await delMaterial(kind, row, d) : await setVisible(kind, row, true, d));
    wrap.appendChild(sh);
  };
  const quizRowAdm = (quizId, label, opts) => {
    const r = el("div", "mrow mquiz");
    r.innerHTML = quizId
      ? `<span class="ic">✓</span><span class="t">${esc(label)}<small>${quizInfo(quizId)}</small></span>
         <button class="btn small white" type="button">Изменить тест</button>`
      : `<button class="link" type="button">＋ ${esc(label)}</button>`;
    r.querySelector("button").onclick = () => quizEditor(Object.assign({ quizId: quizId, onDone: admMaterials }, opts));
    return r;
  };
  const examRow = (g, b, hasTopics) => {
    const unit = g.s ? g.s.id : "b:" + b.n, loose = !g.s;
    const st = subExamState(d, unit, exams, base);
    const r = el("div", "mrow mexam" + (st.on ? " on" : ""));
    r.innerHTML = `<span class="ic">🎓</span><span class="t">Экзамен${loose && hasTopics ? " · материалы без темы" : ""}<small>${examStateText(st)}</small></span>
      <button class="btn small white" type="button">${st.on || st.baseN ? "Изменить" : "Добавить в экзамен"}</button>`;
    r.querySelector("button").onclick = () => quizEditor({ mode: "exam", sub: unit, block: b.n, topic: loose ? b.title + (hasTopics ? " — материалы без темы" : "") : g.s.title,
      quizId: loose ? (hasTopics ? "" : b.quiz || "") : g.s.quiz || "", lessons: g.ls, baseN: st.baseN, onDone: admMaterials });
    return r;
  };
  d.blocks.forEach((b, bi) => {
    const bShown = truthy(b.active);
    const sec = el("div", "mblock" + (bShown ? "" : " hidden-b"));
    sec.dataset.mk = "b:" + b.n;
    const subs = d.subs.filter(s => Number(s.block) === Number(b.n));
    const loose = d.lessons.filter(l => Number(l.block) === Number(b.n) && !String(l.sub || ""));
    const blockLessons = d.lessons.filter(l => Number(l.block) === Number(b.n) && truthy(l.active));
    const groups = (loose.length || !subs.length ? [{ s: null, ls: loose }] : [])
      .concat(subs.map(s => ({ s: s, ls: d.lessons.filter(l => Number(l.block) === Number(b.n) && String(l.sub) === String(s.id)) })));
    const hb = el("div", "mhead", `<h3>${b.num ? b.num + ". " : ""}${esc(b.title)}${bShown ? "" : ' <span class="tag">скрыт от сотрудников</span>'}</h3>`);
    const bb = el("span", "mbtn");
    [[-1, "↑", "Поднять блок выше"], [1, "↓", "Опустить блок ниже"]].forEach(([dir, t, tip]) => {
      const mv = el("button", "mmove", t); mv.type = "button"; mv.title = tip;
      mv.disabled = dir < 0 ? bi === 0 : bi === d.blocks.length - 1;
      mv.onclick = async () => {
        try { await api("admin.blockMove", { n: b.n, dir: dir }); PR.program = null; EX.data = null; await admMaterials(); toast("Порядок блоков изменён — номера пересчитаны"); }
        catch (e) { fail(e); }
      };
      bb.appendChild(mv);
    });
    headBtns(bb, "block", b); hb.appendChild(bb);
    sec.appendChild(hb);
    groups.forEach(g => {
      if (g.s) {
        const sShown = truthy(g.s.active);
        const ht = el("div", "mhead" + (sShown ? "" : " hidden-s"), `<div class="mtopic">${esc(g.s.title)} <i>${g.ls.length}</i>${sShown ? "" : ' <span class="mst off">скрыта</span>'}</div>`);
        ht.dataset.mk = "s:" + g.s.id;
        const sb = el("span", "mbtn"); headBtns(sb, "sub", g.s); ht.appendChild(sb);
        sec.appendChild(ht);
      }
      g.ls.forEach(l => {
        const r = el("div", "mrow" + (truthy(l.active) ? "" : " off") + (truthy(l.ready) ? "" : " soonrow"));
        r.dataset.mk = "l:" + l.id;
        r.innerHTML = `<span class="ic">${KIND[l.kind] || "•"}</span><span class="t">${esc(l.title)}
            <small>${esc(l.kind)}</small></span>
          ${truthy(l.ready) ? "" : '<span class="mst soon" title="Сотрудники видят строку с пометкой «скоро», открыть не могут">скоро</span>'}
          ${truthy(l.active) ? "" : '<span class="mst off" title="Сотрудники этот материал не видят">скрыт</span>'}
          <button class="btn small white" type="button">Изменить</button>
          ${truthy(l.active) ? "" : '<button class="mshow on" data-show="1" type="button">Показать</button>'}
          ${truthy(l.active) || canDelMat(l) ? '<button class="mdel" type="button" title="Удалить или спрятать">Удалить</button>' : ""}`;
        r.querySelector(".btn").onclick = () => lessonForm(l, d);
        if (r.querySelector("[data-show]")) r.querySelector("[data-show]").onclick = async () => reload(await setVisible("lesson", l, true, d));
        if (r.querySelector(".mdel")) r.querySelector(".mdel").onclick = async () => reload(await delMaterial("lesson", l, d));
        sec.appendChild(r);
      });
      if (!g.ls.length) sec.appendChild(el("div", "hint tiny", g.s ? "В этой теме пока нет материалов" : "В блоке пока нет материалов"));
      if (g.s) sec.appendChild(quizRowAdm(g.s.quiz || "", g.s.quiz ? "Мини-тест по теме" : "Добавить мини-тест к теме",
        { sub: g.s.id, block: b.n, topic: g.s.title, lessons: g.ls }));
      if (!g.s && !subs.length && g.ls.length && !b.quiz) sec.appendChild(quizRowAdm("", "Добавить мини-тест к блоку", { block: b.n, topic: b.title, lessons: blockLessons }));
      if (g.s || g.ls.length) sec.appendChild(examRow(g, b, subs.length > 0));
    });
    if (b.quiz) sec.appendChild(quizRowAdm(b.quiz, subs.length ? "Контрольный тест по блоку" : "Мини-тест по блоку", { block: b.n, topic: b.title, lessons: blockLessons }));
    else if (subs.length) sec.appendChild(quizRowAdm("", "Добавить контрольный тест по блоку", { block: b.n, topic: b.title, lessons: blockLessons }));
    box.appendChild(sec);
  });
  $("#ladd").onclick = () => lessonForm(null, d);
  if (!firstLoad) window.scrollTo(0, y);
}
function lessonForm(l, d) {
  const back = el("div", "modal-back");
  const S = { block: l ? Number(l.block) : (d.blocks[0] || {}).n, sub: l ? String(l.sub || "") : "", after: l ? "keep" : "end" };
  back.innerHTML = `<div class="modal matform" role="dialog" aria-modal="true">
    <b>${l ? "Материал" : "Новый материал"}</b>
    <div class="mf-grid"><div class="mf-left">
      <label class="f">Название</label><input type="text" id="ltitle" value="${esc(l ? l.title : "")}" placeholder="Например: Общее обучение по грохотам">
      <div class="mf-two">
        <div><label class="f">Тип</label><select id="lkind">${MAT_KINDS.map(k => `<option>${k}</option>`).join("")}</select></div>
        <div><label class="f">Пометка (необязательно)</label><input type="text" id="lnote" value="${esc(l ? l.note : "")}" placeholder="12 минут, 5 страниц…"></div>
      </div>
      <label class="f">Ссылка (Google Диск, документ или страница)</label><input type="text" id="lurl" value="${esc(l ? l.url : "")}" placeholder="https://drive.google.com/…">
      <label class="f">Блок</label>
      <select id="lblock"></select>
      <div class="mf-new" id="nbBox" hidden><input type="text" id="nbTitle" placeholder="Название нового блока"><button class="btn small" type="button" id="nbOk">Создать блок</button>
        <button class="x" type="button" data-x="nbBox" title="Не создавать">×</button></div>
      <div class="mf-del" id="bdel" hidden><button class="link" type="button"></button></div>
      <label class="f">Тема внутри блока</label>
      <select id="lsub"></select>
      <button class="link mf-link" type="button" id="nsOpen">＋ Создать новую тему</button>
      <div class="mf-new" id="nsBox" hidden><input type="text" id="nsTitle" placeholder="Название новой темы"><button class="btn small" type="button" id="nsOk">Создать тему</button>
        <button class="x" type="button" data-x="nsBox" title="Не создавать">×</button></div>
      <div class="mf-del" id="sdel" hidden><button class="link" type="button"></button></div>
      <label class="f">Экзамен</label>
      <div class="mf-examrow" id="lexam"></div>
      <label class="f">Где поставить</label>
      <select id="lafter"></select>
      <label class="fck"><input type="checkbox" id="lready" ${!l || truthy(l.ready) ? "checked" : ""}><u></u>Материал готов</label>
      <p class="hint tiny">Если урок ещё не записан — снимите галочку: сотрудники увидят строку с пометкой «скоро», но открыть не смогут.</p>
      <label class="fck"><input type="checkbox" id="lact" ${!l || truthy(l.active) ? "checked" : ""}><u></u>Видно сотрудникам</label>
      <p class="hint tiny">Снимите, чтобы спрятать материал из кабинета, не удаляя его. Прогресс и заметки по нему сохранятся.</p>
    </div>
    <div class="mf-right"><div class="flab">Как увидит сотрудник</div><div id="lprev"></div>
      <p class="pv-hint">Жёлтую строку можно перетащить мышкой — поле «Где поставить» поменяется само.</p></div></div>
    <div class="mbtns">${l && canDelMat(l) ? '<button class="btn red" data-a="del" type="button" style="margin-right:auto">Удалить материал</button>' : ""}
      <button class="btn ghost" data-a="0" type="button">Отмена</button>
      <button class="btn" data-a="1" type="button">Сохранить</button></div></div>`;
  document.body.appendChild(back); lockScroll(true);
  const $$ = s => back.querySelector(s);
  if (l) $$("#lkind").value = l.kind;
  const subsOf = n => d.subs.filter(s => Number(s.block) === Number(n));
  const matesOf = () => d.lessons.filter(x => Number(x.block) === Number(S.block) && String(x.sub || "") === S.sub && (!l || x.id !== l.id));
  const fillBlocks = () => {
    $$("#lblock").innerHTML = d.blocks.map(b => `<option value="${b.n}">${b.num ? b.num + ". " : "(скрыт) "}${esc(b.title)}</option>`).join("") + `<option value="__new">＋ Новый блок…</option>`;
    $$("#lblock").value = S.block;
  };
  const fillSubs = () => {
    const subs = subsOf(S.block);
    if (S.sub && !subs.some(s => String(s.id) === S.sub)) S.sub = subs.length ? String(subs[0].id) : "";
    $$("#lsub").innerHTML = `<option value="">Без темы — общим списком в начале блока</option>` +
      subs.map(s => `<option value="${esc(s.id)}">${esc(s.title)}</option>`).join("") + `<option value="__new">＋ Новая тема…</option>`;
    $$("#lsub").value = S.sub;
  };
  const fillAfter = () => {
    const mates = matesOf();
    $$("#lafter").innerHTML = (l ? `<option value="keep">Оставить на своём месте</option>` : "") +
      `<option value="end">В конец ${S.sub ? "темы" : "блока"}</option><option value="start">В начало</option>` +
      mates.map(m => `<option value="${esc(m.id)}">После: ${esc(m.title)}</option>`).join("");
    if (![...$$("#lafter").options].some(o => o.value === S.after)) S.after = l ? "keep" : "end";
    $$("#lafter").value = S.after;
  };
  const preview = () => {
    const mates = matesOf().slice();
    const me = { id: "__me", title: $$("#ltitle").value.trim() || "Название материала", kind: $$("#lkind").value,
                 note: $$("#lnote").value.trim(), ready: $$("#lready").checked, active: $$("#lact").checked };
    let pos = mates.length;
    if (S.after === "start") pos = 0;
    else if (S.after === "keep" && l) pos = mates.filter(x => x.order < l.order).length;
    else if (S.after !== "end") { const i = mates.findIndex(x => x.id === S.after); if (i >= 0) pos = i + 1; }
    mates.splice(pos, 0, me);
    const b = d.blocks.filter(x => Number(x.n) === Number(S.block))[0], s = d.subs.filter(x => String(x.id) === S.sub)[0];
    $$("#lprev").innerHTML = `<div class="pv-path">Блок ${b ? (b.num || "—") + " · " + esc(b.title) : "—"}${s ? " → " + esc(s.title) : ""}</div>
      <div class="sub pv">${mates.map(x => {
        const ready = x.id === "__me" ? me.ready : truthy(x.ready), act = x.id === "__me" ? me.active : truthy(x.active);
        return `<div class="les${ready ? "" : " soon"}${x.id === "__me" ? " pv-me" : ""}${act ? "" : " pv-off"}">
          <div class="ic">${KIND[x.kind] || "•"}</div><div class="t">${esc(x.title)}<small>${esc(x.kind)}${x.note ? " · " + esc(x.note) : ""}</small></div>
          ${ready ? '<span class="go">Открыть</span>' : '<span class="tag">скоро</span>'}</div>`;
      }).join("")}</div>
      ${me.active ? "" : '<p class="hint tiny">Этот материал спрятан — сотрудники его не увидят, в предпросмотре он приглушён.</p>'}`;
    const row = $$("#lprev .pv-me");
    if (row) row.onpointerdown = startDrag;
  };
  /* тянем свою строку: по высоте курсора считаем, между какими материалами она окажется */
  const startDrag = e => {
    e.preventDefault();
    const move = ev => {
      const rows = [...back.querySelectorAll("#lprev .les:not(.pv-me)")];
      let idx = rows.length;
      for (let i = 0; i < rows.length; i++) { const r = rows[i].getBoundingClientRect(); if (ev.clientY < r.top + r.height / 2) { idx = i; break; } }
      const mates = matesOf();
      const want = idx === 0 ? "start" : idx >= mates.length ? "end" : String(mates[idx - 1].id);
      if (want !== S.after) { S.after = want; fillAfter(); $$("#lafter").value = S.after; preview(); }
      const me = $$("#lprev .pv-me"); if (me) me.classList.add("drag");
    };
    const up = () => {
      document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up);
      const me = $$("#lprev .pv-me"); if (me) me.classList.remove("drag");
    };
    document.addEventListener("pointermove", move); document.addEventListener("pointerup", up);
    const me = $$("#lprev .pv-me"); if (me) me.classList.add("drag");
  };
  const refreshDel = () => {
    const blockLessons = d.lessons.filter(x => Number(x.block) === Number(S.block) && (!l || x.id !== l.id)).length;
    const b = d.blocks.filter(x => Number(x.n) === Number(S.block))[0];
    $$("#bdel").hidden = !b || blockLessons > 0 || !canDelMat(b);
    if (b) $$("#bdel button").textContent = `Удалить пустой блок «${b.title}»`;
    const sub = d.subs.filter(x => String(x.id) === S.sub)[0];
    $$("#sdel").hidden = !sub || matesOf().length > 0 || !canDelMat(sub);
    if (sub) $$("#sdel button").textContent = `Удалить пустую тему «${sub.title}»`;
  };
  /* экзамен считается по темам: у выбранной темы сразу видно, входит ли она, и можно переключить */
  let EXL = null;
  const refreshExam = async () => {
    const box = $$("#lexam");
    if (!EXL) {
      box.innerHTML = `<p class="hint tiny">Проверяем…</p>`;
      try { EXL = await api("admin.examList"); EXL.base = await examBaseCounts(); } catch (e) { EXL = { topics: {}, excluded: [], base: {} }; }
    }
    const unit = S.sub || "b:" + S.block, st = subExamState(d, unit, EXL, EXL.base);
    const sub = d.subs.filter(x => String(x.id) === S.sub)[0], blk = d.blocks.filter(x => Number(x.n) === Number(S.block))[0] || {};
    box.innerHTML = `<label class="fck"><input type="checkbox" id="lexamOn" ${st.on ? "checked" : ""}><u></u>${sub ? `Тема «${esc(sub.title)}» входит в экзамен` : `Материалы блока «${esc(blk.title || "")}» без темы входят в экзамен`}</label>
      <p class="hint tiny">${st.on ? examStateText(st).replace(/^входит · /, "Сейчас: ") + ". Добавить или поправить вопросы — в списке «Материалов», строка «Экзамен»."
        : st.baseN ? "Снято с экзамена: " + plural(st.baseN, "исходный вопрос", "исходных вопроса", "исходных вопросов") + " сотрудникам не показываются." : "Отметьте, чтобы по этим материалам были вопросы в итоговом экзамене."}</p>`;
    box.querySelector("#lexamOn").onchange = async e => {
      const want = e.target.checked, id = S.sub || "b:" + S.block;
      try {
        const cur = await api("admin.examGet", { sub: id });
        await api("admin.examSave", { data: { sub: id, include: want, questions: cur.questions || [] } });
        EXL.excluded = (EXL.excluded || []).filter(x => String(x) !== String(id));
        if (want) EXL.topics[id] = (cur.questions || []).length; else { delete EXL.topics[id]; EXL.excluded.push(id); }
        EX.data = null; toast(want ? "Включено в экзамен" : "Снято с экзамена"); refreshExam();
      } catch (err) { e.target.checked = !want; fail(err); }
    };
  };
  const redraw = () => { fillBlocks(); fillSubs(); fillAfter(); preview(); refreshDel(); refreshExam(); };
  back.querySelectorAll("[data-x]").forEach(b => b.onclick = () => { $$("#" + b.dataset.x).hidden = true; if (b.dataset.x === "nsBox") $$("#nsOpen").hidden = false; });
  $$("#nsOpen").onclick = () => { $$("#nsBox").hidden = false; $$("#nsOpen").hidden = true; $$("#nsTitle").focus(); };
  $$("#bdel button").onclick = async () => {
    const b = d.blocks.filter(x => Number(x.n) === Number(S.block))[0];
    if (!await ask({ title: "Удалить блок?", danger: true, ok: "Удалить", text: `Блок «${esc(b.title)}» пустой — в нём нет материалов. Удалить его?` })) return;
    try {
      await api("admin.blockDel", { n: b.n }); Object.assign(d, await matData());
      S.block = (d.blocks[0] || {}).n; S.sub = ""; S.after = l ? "keep" : "end"; redraw(); toast("Блок удалён");
    } catch (e) { fail(e); }
  };
  $$("#sdel button").onclick = async () => {
    const sub = d.subs.filter(x => String(x.id) === S.sub)[0];
    if (!await ask({ title: "Удалить тему?", danger: true, ok: "Удалить", text: `Тема «${esc(sub.title)}» пустая. Удалить её?` })) return;
    try {
      await api("admin.subDel", { id: sub.id }); Object.assign(d, await matData());
      S.sub = ""; S.after = "end"; redraw(); toast("Тема удалена");
    } catch (e) { fail(e); }
  };
  redraw();
  $$("#lblock").onchange = e => {
    if (e.target.value === "__new") { $$("#nbBox").hidden = false; $$("#nbTitle").focus(); e.target.value = S.block; return; }
    S.block = Number(e.target.value); S.after = l ? "keep" : "end"; fillSubs(); fillAfter(); preview(); refreshDel(); refreshExam();
  };
  $$("#lsub").onchange = e => {
    if (e.target.value === "__new") { $$("#nsBox").hidden = false; $$("#nsOpen").hidden = true; $$("#nsTitle").focus(); e.target.value = S.sub; return; }
    S.sub = e.target.value; S.after = "end"; fillAfter(); preview(); refreshDel(); refreshExam();
  };
  $$("#lafter").onchange = e => { S.after = e.target.value; preview(); };
  ["#ltitle", "#lkind", "#lnote", "#lready", "#lact"].forEach(sel => $$(sel).addEventListener("input", preview));
  ["#lready", "#lact", "#lkind"].forEach(sel => $$(sel).addEventListener("change", preview));
  $$("#nbOk").onclick = async () => {
    const title = $$("#nbTitle").value.trim(); if (!title) return toast("Напишите название блока");
    try {
      const r = await api("admin.blockSave", { data: { title: title } });
      const nd = await matData(); Object.assign(d, nd);
      S.block = r.n; S.sub = ""; $$("#nbBox").hidden = true; $$("#nbTitle").value = "";
      redraw(); toast("Блок создан");
    } catch (e) { fail(e); }
  };
  $$("#nsOk").onclick = async () => {
    const title = $$("#nsTitle").value.trim(); if (!title) return toast("Напишите название темы");
    try {
      const inExam = await choose({ title: `Включить тему «${title}» в экзамен?`,
        text: `<p>Если да — по этой теме в итоговом экзамене будут вопросы. Какие именно, выберете в «Материалах»: строка «Экзамен» у темы.
          Их можно взять из мини-теста темы или написать свои.</p><p class="hint">Решение можно поменять в любой момент.</p>`,
        buttons: [{ label: "Отмена", cls: "ghost", value: null }, { label: "Нет, без экзамена", cls: "white", value: "no" }, { label: "Да, включить", cls: "green", value: "yes" }] });
      if (!inExam) return;
      const r = await api("admin.subSave", { data: { block: S.block, title: title } });
      if (inExam === "yes") { await api("admin.examSave", { data: { sub: r.id, include: true, questions: [] } }); if (EXL) EXL.topics[String(r.id)] = 0; }
      const nd = await matData(); Object.assign(d, nd);
      S.sub = String(r.id); S.after = "end"; $$("#nsBox").hidden = true; $$("#nsOpen").hidden = false; $$("#nsTitle").value = "";
      redraw();
      toast(inExam === "yes" ? "Тема создана и включена в экзамен. Вопросы выберите в «Материалах» — строка «Экзамен» у темы" : "Тема создана, в экзамен не входит");
    } catch (e) { fail(e); }
  };
  const close = () => { back.remove(); lockScroll(false); };
  $$('[data-a="0"]').onclick = close;
  if ($$('[data-a="del"]')) $$('[data-a="del"]').onclick = async () => { if (await delMaterial("lesson", l, d)) { close(); admMaterials(); } };
  $$('[data-a="1"]').onclick = async () => {
    const data = { id: l ? l.id : "", block: S.block, sub: S.sub, title: $$("#ltitle").value.trim(), kind: $$("#lkind").value,
      url: $$("#lurl").value.trim(), note: $$("#lnote").value.trim(), after: S.after,
      ready: $$("#lready").checked, active: $$("#lact").checked };
    if (!data.title) { toast("Напишите название"); return; }
    if (data.ready && !data.url) { toast("У готового материала нужна ссылка. Или снимите «Материал готов»"); return; }
    const btn = $$('[data-a="1"]'); btn.disabled = true; btn.textContent = "Сохраняем…";   /* сервер думает несколько секунд — повторно не нажать */
    try {
      const r = await api("admin.lessonSave", { data: data });
      const fields = { block: data.block, sub: data.sub, title: data.title, kind: data.kind, url: data.url, note: data.note, ready: data.ready, active: data.active };
      if (l) Object.assign(l, fields); else d.lessons.push(Object.assign({ id: r.id, order: 99999, createdBy: APP.user.id }, fields));
      close(); PR.program = null; admMaterials(d); toast("Сохранено");
    } catch (e) { btn.disabled = false; btn.textContent = "Сохранить"; fail(e); }
  };
}

/* ---------- вопросы: от МОПО — РОПу, от РОПов — разработчику ---------- */
async function admQuestions(box) {
  const host = $("#admbody");
  const dev = box === "dev";
  host.innerHTML = `<div class="card"><h2>${dev ? "Вопросы от РОПов" : "Вопросы от МОПО"}</h2>
    <p class="lead" id="qst">Загружаем…</p>
    <div class="seg wide" id="aqseg"></div></div><div id="qlist"></div>`;
  let list = [];
  try { list = (await api("admin.questions", { box: box })).questions || []; } catch (e) { $("#qst").textContent = e.message; return; }
  const open = list.filter(q => !q.answer).length;
  $("#qst").textContent = list.length ? `Всего вопросов: ${list.length}, ждут ответа: ${open}.` : "Вопросов пока нет.";
  ADM.qf = ADM.qf || "wait";
  $("#aqseg").innerHTML = `<button type="button" data-f="wait">Ждут ответа <i>${open}</i></button>
    <button type="button" data-f="ans">Отвеченные <i>${list.length - open}</i></button><button type="button" data-f="all">Все <i>${list.length}</i></button>`;
  const draw = () => {
    $("#aqseg").querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.f === ADM.qf));
    const box2 = $("#qlist"); box2.innerHTML = "";
    const f = list.filter(q => ADM.qf === "all" || (ADM.qf === "ans" ? q.answer : !q.answer));
    if (!f.length) { box2.appendChild(el("div", "card", '<p class="hint">Здесь пусто.</p>')); return; }
    f.forEach(q => {
      const c = el("div", "card note-card qitem " + (q.answer ? "answered" : "waiting"));
      c.innerHTML = `<div class="nc-head"><span class="tag ${q.answer ? "ok" : "wait"}">${q.answer ? "отвечен" : "ждёт ответа"}</span>
          <b>${esc(q.fio)}</b><span class="hint">${esc(q.lessonTitle || "общий вопрос")} · ${esc(String(q.at).slice(0, 10))}</span></div>
        <p class="qq">${esc(q.text)}</p>
        ${q.answer ? `<div class="ans"><b>Ответ ${esc(q.answeredBy || "")}:</b><p>${esc(q.answer)}</p></div>` : ""}`;
      if (!q.answer) {
        const ta = el("textarea"); ta.placeholder = dev ? "Ответ РОПу" : "Ответ сотруднику";
        const b = el("button", "btn", "Ответить"); b.type = "button";
        b.onclick = async () => {
          if (!ta.value.trim()) { toast("Напишите ответ"); return; }
          try { await api("admin.answer", { id: q.id, answer: ta.value.trim() }); toast("Ответ сохранён"); refreshBadges(); admQuestions(box); }
          catch (e) { fail(e); }
        };
        c.appendChild(ta); c.appendChild(b);
      }
      box2.appendChild(c);
    });
  };
  $("#aqseg").querySelectorAll("button").forEach(b => b.onclick = () => { ADM.qf = b.dataset.f; draw(); });
  draw();
}

/* ---------- настройки ---------- */
async function admSettings() {
  const host = $("#admbody");
  host.innerHTML = `<div class="card"><h2>Настройки</h2>
    <p class="lead">Вопросы РОПу и запросы «Забыли пароль?» всегда приходят в кабинет. Чтобы их увидели быстрее,
      кабинет предложит сотруднику продублировать сообщение в рабочую группу WhatsApp с готовым текстом.</p>
    <label class="f">Ссылка на рабочую группу WhatsApp</label>
    <input type="text" id="wagroup" value="${esc((PR.progress && PR.progress.waGroup) || "")}" placeholder="https://chat.whatsapp.com/…">
    <p class="hint tiny">Кабинет скопирует готовый текст и откроет эту группу. Ссылку берут в WhatsApp: группа → «Пригласить по ссылке».
      Её увидит только тот, кто ввёл существующий логин. Если ссылка утечёт — сбросьте её там же и вставьте новую.</p>
    <div class="foot"><button class="btn" id="csave" type="button">Сохранить</button></div></div>
    <div class="card" id="drvcard"><h2>Доступ сервиса к материалам</h2>
      <p class="lead">Документы, таблицы и презентации сотрудники смотрят через кабинет — копией для чтения, без входа в Google.
        Для этого у почты, от которой работает кабинет, должен быть доступ к файлам. Видео Google Диск через кабинет не пропускает —
        их открываем «по ссылке, только просмотр» одной кнопкой.</p>
      <div class="foot"><button class="btn white" id="drvcheck" type="button">Проверить доступ к файлам</button></div>
      <div id="drvres"></div></div>`;
  $("#drvcheck").onclick = () => drvStatus();
  $("#csave").onclick = async () => {
    const g = $("#wagroup").value.trim();
    if (g && !/^https:\/\/chat\.whatsapp\.com\/\S+$/.test(g)) return toast("Ссылка на группу должна начинаться с https://chat.whatsapp.com/");
    try {
      await api("admin.setting", { key: "waGroup", value: g });
      if (PR.progress) PR.progress.waGroup = g;
      toast("Сохранено");
    } catch (e) { fail(e); }
  };
}

/* доступ сервиса к файлам программы: чего не хватает и кнопки для видео */
async function drvStatus() {
  const box = $("#drvres"), btn = $("#drvcheck");
  btn.disabled = true; btn.textContent = "Проверяем… до минуты";
  let r;
  try { r = await api("admin.driveStatus"); } catch (e) { btn.disabled = false; btn.textContent = "Проверить доступ к файлам"; return fail(e); }
  btn.disabled = false; btn.textContent = "Проверить ещё раз";
  if (!r || !Array.isArray(r.files)) {                      /* неожиданный ответ — показываем как есть, чтобы понять причину */
    box.innerHTML = `<div class="note warn">Сервер ответил не так, как ожидалось. Пришлите разработчику текст ниже:<pre class="drvraw">${esc(JSON.stringify(r).slice(0, 600))}</pre></div>`;
    return;
  }
  const docs = r.files.filter(f => !f.video), vids = r.files.filter(f => f.video);
  const noDoc = docs.filter(f => !f.ok), noVid = vids.filter(f => !f.ok || !f.canEdit);
  const open = vids.filter(f => f.ok && f.access === "ANYONE_WITH_LINK").length;
  const dev = APP.user.role === "dev";
  box.innerHTML = `<div class="drv">
    <p>Кабинет работает от почты <b class="inl">${esc(r.account || "—")}</b>. Проверено файлов: ${r.files.length}.</p>
    <p><b class="inl">Документы, таблицы, презентации:</b> ${docs.length - noDoc.length} из ${docs.length} доступны.</p>
    ${noDoc.length ? `<div class="note warn">Нет доступа к ${plural(noDoc.length, "файлу", "файлам", "файлам")} — откройте их для ${esc(r.account)} с правом «Читатель»
      (проще всего — всю папку с материалами разом):<ul>${noDoc.map(f => `<li>${esc(f.title)}</li>`).join("")}</ul></div>` : ""}
    <p><b class="inl">Видео:</b> ${vids.length} в программе, открыто по ссылке — ${open}.</p>
    ${noVid.length ? `<div class="note warn">Кнопка не сможет управлять ${plural(noVid.length, "видео", "видео", "видео")}: у ${esc(r.account)} нет права «Редактор».
      Дайте его на папку с видео:<ul>${noVid.map(f => `<li>${esc(f.title)}</li>`).join("")}</ul></div>` : ""}
    ${dev ? `<div class="foot"><button class="btn green" id="vopen" type="button">Открыть видео по ссылке</button>
      <button class="btn white" id="vclose" type="button">Закрыть видео</button></div>
      <p class="hint tiny">«Открыть» — все видео программы смотрятся по ссылке, только просмотр. Ссылки видят лишь те, кто вошёл в кабинет.
        «Закрыть» — снова только для вас. Чтобы кнопка ещё и запрещала скачивание, в редакторе скрипта добавьте сервис: «Сервисы» → «+» → Drive API.</p>` : ""}
  </div>`;
  const va = async open => {
    const b = $(open ? "#vopen" : "#vclose"); b.disabled = true; b.textContent = open ? "Открываем…" : "Закрываем…";
    try {
      const x = await api("admin.videoAccess", { open: open });
      toast((open ? "Открыто видео: " : "Закрыто видео: ") + x.done + (x.fail.length ? ", не вышло: " + x.fail.length : "") + (open && !x.noDownload ? ". Скачивание не запрещено — подключите Drive API" : ""));
      drvStatus();
    } catch (e) { fail(e); b.disabled = false; }
  };
  if (dev) { $("#vopen").onclick = () => va(true); $("#vclose").onclick = () => va(false); }
}
