/* дата из профиля: 1990-05-14 → 14.05.1990 */
const fmtDate = d => { const m = String(d || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + "." + m[2] + "." + m[1] : esc(d); };
/* Кабинет РОПа и разработчика: разделы живут в шапке, тело — здесь. */
const ADM = { tab: "students", users: "work" };
const ADM_TITLES = { students: "Ученики", attempts: "Экзамены", users: "Сотрудники", questions: "Вопросы от МОПО",
                     devq: "Вопросы от РОПов", materials: "Материалы", settings: "Настройки" };

function screenAdmin(tab) {
  if (tab) ADM.tab = tab;
  if (ADM.tab === "devq" && !devUI()) ADM.tab = "questions";
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
  set("adm:materials", b.prepLeft || 0);        /* устаревшие копии таблиц: видно прямо на вкладке «Материалы» */
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
    card.querySelector('[data-a="access"]').onclick = once(async () => {
      let force = false;
      if (!st.examAllowed && notReady.length) {
        const ok = await ask({ title: "Блоки ещё не закрыты", danger: true, ok: "Всё равно допустить", cancel: "Отмена",
          text: `<p>У сотрудника не закрыто блоков: <b class="inl">${notReady.length}</b>:</p>
                 <ul class="notready">${notReady.map(b => `<li><b>${blockNum(b.n)}.</b> ${esc(b.title)}</li>`).join("")}</ul>
                 <p>Обычно к экзамену допускают после всех блоков. Открыть доступ досрочно?</p>` });
        if (!ok) return;
        force = true;
      }
      try {
        await api("admin.examAccess", { userId: st.id, allow: !st.examAllowed, force: force });
        toast(st.examAllowed ? "Экзамен закрыт" : force ? "Экзамен открыт досрочно" : "Экзамен открыт");
        admStudents();
      } catch (e) { fail(e); }
    });
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
      shown.map((a, i) => `<tr class="arow" data-i="${i}"><td>${esc(a.fio)}${a.kind === "retake" ? ' <span class="tag wait">пересдача</span>' : ""}${a.sentAt ? ' <span class="hint" title="Разбор отправлен в кабинет сотрудника">✉</span>' : ""}</td><td>${when(a)}</td>
        <td>${Math.round((a.durationSec || 0) / 60)} мин${a.overtimeSec ? " (+" + Math.round(a.overtimeSec / 60) + ")" : ""}</td>
        <td>${a.awayCount || 0}</td><td>${a.score} / ${a.max}</td><td>${a.percent}%</td>
        <td><span class="tag ${vcls(a.verdict)}">${esc(a.verdict)}</span></td>
        <td class="atact"><button class="btn small white" data-arch="${i}" type="button">${a.archived ? "Вернуть" : "В архив"}</button>
          <button class="mdel" data-del="${i}" type="button">Удалить</button></td></tr>`).join("");
    box.appendChild(t);
    t.querySelectorAll(".arow").forEach(r => r.onclick = ev => { if (ev.target.closest("button")) return; admAttempt(shown[+r.dataset.i].id); });
    t.querySelectorAll("[data-arch]").forEach(b => b.onclick = once(() => attemptArchive(shown[+b.dataset.arch], admAttempts)));
    t.querySelectorAll("[data-del]").forEach(b => b.onclick = once(() => attemptDelete(shown[+b.dataset.del], admAttempts)));
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
async function admAttempt(id, ready) {
  const host = $("#admbody");
  if (!ready) host.innerHTML = `<div class="card"><p class="lead">Загружаем ответы…</p></div>`;
  let a;
  try {
    a = ready || await api("admin.attempt", { id: id });
    /* ответ без самой попытки (сбой Google или старая копия в памяти) — перечитываем мимо кэша, пустой экран не показываем */
    const полная = x => x && Array.isArray(x.answers) && x.finishedAt;
    if (!полная(a)) { Object.keys(SWR).forEach(k => { if (k.indexOf("admin.attempt{") === 0) delete SWR[k]; }); a = await apiRaw("admin.attempt", { id: id }); }
    if (!полная(a)) throw new Error("Сервер прислал попытку без ответов (" + (a ? Object.keys(a).slice(0, 6).join(", ") || "пусто" : "пусто") + "). Обновите страницу и откройте ещё раз");
    if (!PR.program) PR.program = await api("program");
  } catch (e) { host.innerHTML = `<div class="card"><p class="lead">${esc(e.message)}</p><div class="foot"><button class="btn ghost" id="aback" type="button">← Ко всем</button></div></div>`; $("#aback").onclick = admAttempts; return fail(e); }
  const byBlock = (a.byBlock || []).slice().sort((x, y) => blockNum(x.n) - blockNum(y.n));
  const vcls = a.verdict === "сдал" ? "ok" : a.verdict === "пересдача" ? "retry" : "fail";
  host.innerHTML = `<div class="card">
    <div class="qhead"><div><h3>${a.kind === "retake" ? "Пересдача · " : ""}${new Date(a.finishedAt).toLocaleString("ru-RU")}</h3><h2>${esc(a.fio)}</h2></div>
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
    <div class="rtbox" id="rtbox"></div>
    ${(a.answers || []).some(r => r.needsReview) ? `<div class="note warn"><b>Ждут ручной проверки: ${(a.answers || []).filter(r => r.needsReview).length}.</b>
      ИИ не смог их оценить — поставьте балл сами. Пока они не проверены, в процент не входят.
      <button class="btn small white" id="aonlyrev" type="button">Показать только их</button></div>` : ""}
    <div class="foot" style="margin-top:6px"><button class="btn ghost" id="atoggle" type="button">Показать ответы по заданиям</button></div>
    <div id="alist" hidden>
    ${(a.answers || []).map((r, i) => `<div class="q ${r.correct === true ? "" : "bad"}">
      <div class="qn"><b>${i + 1} · блок ${blockNum(r.block)}</b><i>${esc(r.difficulty || r.type)}</i><i>${r.points}/${r.max} балла</i><i>${r.sec || 0} сек</i>
        ${r.needsReview ? '<span class="tag wait">нужна проверка</span>'
          : `<span class="tag ${r.correct === true ? "ok" : r.points ? "retry" : "fail"}">${r.correct === true ? "верно" : r.points ? "частично" : "неверно"}</span>`}</div>
      <p class="qt">${esc(r.text || r.id)}</p>
      <div class="hint"><b>Ответ:</b> ${esc(r.givenText || "")}</div>
      <div class="hint"><b>Эталон:</b> ${esc(r.right || "")}</div>
      ${r.ai ? `<div class="hint"><b>Проверка ИИ:</b> ${esc(r.ai.comment || "")}${r.ai.miss && r.ai.miss.length ? " · не раскрыто: " + esc(r.ai.miss.join("; ")) : ""}</div>` : ""}
      ${r.sim ? `<div class="hint"><b>Разбор задания:</b> ${esc((r.sim.notes || []).join("; ") || "выполнено верно")}</div>` : ""}
      <div class="hint"><b>Источник:</b> ${esc(r.source || "")}</div>
      ${r.manual ? `<div class="hint mgraded"><b>Проверено вручную:</b> ${esc(r.manual.by || "")} · ${esc(dayRu(r.manual.at))} ·
        было ${r.manual.first !== undefined ? r.manual.first : r.manual.prev}, стало ${r.points}${r.manual.note ? " — «" + esc(r.manual.note) + "»" : ""}</div>` : ""}
      <div class="agrade"><button class="btn small white" data-grade="${i}" type="button">${r.needsReview ? "Проверить вручную" : "Изменить балл"}</button></div></div>`).join("")}
    </div>
  </div>`;
  $("#atoggle").onclick = () => {
    const box = $("#alist"); box.hidden = !box.hidden;
    $("#atoggle").textContent = box.hidden ? "Показать ответы по заданиям" : "Скрыть ответы";
  };
  $("#aback").onclick = admAttempts;
  if ($("#aonlyrev")) $("#aonlyrev").onclick = () => {
    $("#alist").hidden = false; $("#atoggle").textContent = "Скрыть ответы";
    [...$("#alist").children].forEach((c, i) => { c.hidden = !(a.answers[i] && a.answers[i].needsReview); });
    $("#alist").scrollIntoView({ behavior: "smooth", block: "start" });
  };
  $("#alist").querySelectorAll("[data-grade]").forEach(btn => btn.onclick = () => gradeAnswer(a, a.answers[+btn.dataset.grade]));
  $("#aarch").onclick = once(() => attemptArchive(a, admAttempts));
  $("#adel").onclick = once(() => attemptDelete(a, admAttempts));
  $("#arep").onclick = () => printReport(a, "full");
  $("#afb").onclick = () => printReport(a, "feedback");
  attemptRetakeBox(a);
}

/* ---------- разбор в кабинет сотрудника и индивидуальная пересдача ---------- */
const RT_STATE = r => r.status === "done" ? { t: "сдана", c: "ok" }
  : r.available ? { t: "открыта сотруднику", c: "ok" }
  : r.status === "approved" && r.opensAt ? { t: "откроется " + new Date(r.opensAt).toLocaleDateString("ru-RU"), c: "wait" }
  : r.status === "approved" ? { t: "утверждена, доступ закрыт", c: "retry" }
  : { t: "черновик", c: "" };
function attemptRetakeBox(a) {
  const box = $("#rtbox"); if (!box) return;
  const wrong = (a.answers || []).filter(r => !r.needsReview && r.correct !== true).length;
  const rev = (a.answers || []).filter(r => r.needsReview).length;
  const list = a.retakes || [];
  box.innerHTML = `<h3>Разбор и пересдача</h3>
    <div class="rtline"><div><b>Разбор в кабинете сотрудника</b>
        <small>${a.sentAt ? "Отправлен — сотрудник видит свои ошибки с правильными ответами и ссылками на уроки. Скачать его нельзя." : "Сотрудник увидит разбор только после этой кнопки. Пока идёт пересдача, разбор у него скрыт."}</small></div>
      <button class="btn small ${a.sentAt ? "white" : ""}" id="asend" type="button">${a.sentAt ? "Убрать из кабинета" : "Отправить разбор в кабинет МОПО"}</button></div>
    ${list.map(r => { const st = RT_STATE(r); return `<div class="rtline"><div><b>Пересдача · ${r.count} ${plural(r.count, "задание", "задания", "заданий").replace(/^\d+\s/, "")}</b>
        <small><span class="tag ${st.c}">${esc(st.t)}</span></small></div>
      <button class="btn small white" data-rt="${esc(r.id)}" type="button">${r.status === "done" ? "Посмотреть" : "Открыть"}</button></div>`; }).join("")}
    ${a.kind !== "retake" && wrong ? `<div class="rtline"><div><b>Индивидуальная пересдача</b>
        <small>Ошибок: ${wrong}. ИИ составит ${wrong > 100 ? "100" : wrong > 80 ? wrong : "80"} заданий: не больше 15% — переформулировки заданий с ошибками, остальное — новые вопросы по материалам уроков. Больше всего — по блокам, где больше всего ошибок, дальше по убыванию, плюс по одному вопросу из блоков без ошибок. Время — 2 часа, как у экзамена. Получится черновик: вы его проверите, утвердите и откроете сотруднику — сразу или с нужной даты.${rev ? " Задания на ручной проверке (" + rev + ") не считаются ошибками — сначала поставьте по ним балл." : ""}</small></div>
      <button class="btn small" id="artgen" type="button">Сформировать пересдачу</button></div>` : ""}`;
  $("#asend").onclick = once(async () => {
    try {
      await api("admin.reportSend", { id: a.id, sent: !a.sentAt });
      a.sentAt = a.sentAt ? "" : new Date().toISOString();
      toast(a.sentAt ? "Разбор появился в кабинете сотрудника" : "Разбор убран из кабинета сотрудника");
      attemptRetakeBox(a);
    } catch (e) { fail(e); }
  });
  box.querySelectorAll("[data-rt]").forEach(b => b.onclick = () => admRetake(b.dataset.rt, a));
  if ($("#artgen")) $("#artgen").onclick = once(async () => {
    if (list.some(r => r.status !== "done") && !await ask({ title: "Уже есть пересдача", ok: "Сформировать ещё одну",
        text: "По этой попытке уже есть несданная пересдача. Новая соберётся отдельным черновиком — лишнюю потом можно удалить." })) return;
    const id = await retakeGenerate(a);
    if (id) admRetake(id, a);
  });
}
/* ИИ собирает черновик частями по 5 заданий, три части одновременно: иначе 80 заданий готовились бы четверть часа */
async function retakeGenerate(a) {
  const back = el("div", "modal-back");
  back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" style="max-width:520px">
    <b>Собираем пересдачу</b><p id="rgst">Считаем, сколько заданий нужно по каждому блоку…</p>
    <div class="bar"><i id="rgbar" style="width:3%"></i></div>
    <div id="rgplan" class="rgplan"></div>
    <p class="hint">Обычно 4–8 минут. Не закрывайте страницу — готовые задания сохраняются по ходу.</p>
    <div class="mbtns" id="rgbtns" hidden></div></div>`;
  document.body.appendChild(back); lockScroll(true);
  const close = () => { back.remove(); lockScroll(false); };
  const st = t => { back.querySelector("#rgst").textContent = t; };
  const bar = p => { back.querySelector("#rgbar").style.width = Math.max(3, Math.round(p * 100)) + "%"; };
  let head;
  try { head = await api("admin.retakeGenerate", { attemptId: a.id }); }
  catch (e) { close(); fail(e); return null; }
  const plan = (head.byBlock || []).slice().sort((x, y) => y.count - x.count || blockNum(x.n) - blockNum(y.n));
  /* конспекты на сайте зашифрованы — текст для ИИ расшифровывает этот браузер и отправляет вместе с частью */
  const texts = {};
  const textOf = async (id, url) => {
    if (texts[id] !== undefined) return texts[id];
    try {
      const html = await matLoad(String(url).split("?")[0]);
      const d = new DOMParser().parseFromString(html, "text/html");
      d.querySelectorAll("script,style,svg,noscript").forEach(x => x.remove());
      texts[id] = (d.body ? d.body.innerText || d.body.textContent : "").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim().slice(0, 40000);
    } catch (e) { texts[id] = ""; }
    return texts[id];
  };
  const textsFor = async k => { const out = {}; for (const x of ((head.need || [])[k] || [])) out[x.id] = await textOf(x.id, x.url); return out; };
  const bt = n => ((PR.program && PR.program.blocks || []).filter(b => Number(b.n) === Number(n))[0] || {}).title || "";
  back.querySelector("#rgplan").innerHTML = plan.length ? `<div class="hint"><b>План: ${plural(head.planned, "задание", "задания", "заданий")}</b></div>` +
    `<div class="hint">Новых по материалам — ${head.planned - (head.dup || 0)}, переформулировок заданий экзамена — ${head.dup || 0}</div>` +
    plan.map(b => `<div class="rgrow"><span>${blockNum(b.n)}. ${esc(bt(b.n))}${b.noText ? ' <em title="У блока нет текстовых материалов — новые вопросы по фактам из ключа экзамена">· нет текстов, по ключу</em>' : ""}</span><b>${b.count}</b><i>${b.errors ? "ошибок " + b.errors : "без ошибок"}</i></div>`).join("") : "";
  const todo = [...Array(head.chunks).keys()], failed = [];
  let done = 0, total = 0, stop = false;
  const paint = () => { st(`Составляем задания: готово ${done} из ${head.chunks} частей${total ? " · заданий " + total : ""}…`); bar(done / head.chunks); };
  const worker = async () => {
    while (todo.length && !stop) {
      const k = todo.shift();
      let ok = false;
      for (let tryN = 0; tryN < 2 && !ok; tryN++) {                 /* сбой Google или ИИ — одна повторная попытка сразу */
        try { const r = await api("admin.retakeGenerate", { attemptId: a.id, id: head.id, chunk: k, texts: await textsFor(k) }); total = Math.max(total, r.total); ok = true; }
        catch (e) { if (tryN) failed.push({ k: k, msg: e.message }); }
      }
      done++; paint();
    }
  };
  paint();
  await Promise.all([worker(), worker(), worker()]);
  /* что не получилось — предлагаем повторить только эти части */
  while (failed.length) {
    const list = failed.splice(0);
    const c = await new Promise(res => {
      st(`Не получилось частей: ${list.length} из ${head.chunks} (${list[0].msg}). Остальные задания сохранены.`);
      const b = back.querySelector("#rgbtns"); b.hidden = false;
      b.innerHTML = `<button class="btn ghost" data-c="skip" type="button">Дальше без них</button><button class="btn" data-c="retry" type="button">Повторить эти части</button>`;
      b.querySelectorAll("[data-c]").forEach(x => x.onclick = () => { b.hidden = true; res(x.dataset.c); });
    });
    if (c !== "retry") break;
    done = head.chunks - list.length; todo.push(...list.map(x => x.k)); paint();
    await Promise.all([worker(), worker(), worker()]);
  }
  bar(1); close();
  toast(total ? "Черновик готов: " + plural(total, "задание", "задания", "заданий") + ". Проверьте и утвердите." : "ИИ не смог составить задания — добавьте их вручную");
  return head.id;
}

/* редактор пересдачи: править можно, пока она закрыта для сотрудника */
async function admRetake(id, att) {
  const host = $("#admbody");
  host.innerHTML = `<div class="card"><p class="lead">Загружаем пересдачу…</p></div>`;
  let r, src = att;
  try {
    r = await api("admin.retakeGet", { id: id });
    if (!src || src.id !== r.fromAttempt) src = await api("admin.attempt", { id: r.fromAttempt }).catch(() => null);
    if (!PR.program) PR.program = await api("program");
  } catch (e) { return fail(e); }
  const orig = {}; ((src && src.answers) || []).forEach(x => orig[x.id] = x);
  const qs = JSON.parse(JSON.stringify(r.questions || []));
  const letters = "abcdef";
  const locked = r.status === "done" || r.available;
  const blocks = (PR.program.blocks || []);
  const st = RT_STATE(r);
  const kindName = { single: "один ответ", multi: "несколько ответов", short: "ответ своими словами" };
  const today = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  host.innerHTML = `<div class="card">
    <div class="qhead"><div><h3>Индивидуальная пересдача</h3><h2>${esc(r.fio)}</h2></div><div class="chip">${esc(st.t)}</div></div>
    <p class="lead">${r.status === "draft" ? "Черновик от ИИ. Проверьте каждое задание: формулировку, варианты и отмеченный верный ответ. Лишнее удалите, недостающее добавьте. Сотрудник ничего не увидит, пока вы не утвердите и не откроете пересдачу."
      : r.status === "done" ? "Пересдача сдана — результат лежит в «Экзаменах»."
      : r.available ? "Пересдача открыта сотруднику. Чтобы что-то поправить, сначала закройте доступ."
      : r.opensAt ? "Утверждена и откроется сотруднику " + new Date(r.opensAt).toLocaleDateString("ru-RU") + ". До этого дня её можно поправить."
      : "Утверждена, но сотруднику пока не видна. Откройте её сейчас или назначьте дату."}</p>
    <p class="hint rtmeta">Время — 2 часа, как у экзамена. Пересдача не обрывается: после 2 часов в отчёте появится отметка о превышении.</p>
    <div class="rtsum" id="rtsum"></div>
    <div id="rtlist"></div>
    ${locked ? "" : '<div class="foot"><button class="btn ghost" id="rtadd" type="button">+ Добавить задание</button></div>'}
    <div class="foot rtfoot" id="rtfoot"></div></div>`;
  const draw = () => {
    const cnt = {}; qs.forEach(q => cnt[q.block] = (cnt[q.block] || 0) + 1);
    const nNew = qs.filter(q => q.origin === "new").length, nKey = qs.filter(q => q.origin === "key").length;
    $("#rtsum").innerHTML = `<b>${plural(qs.length, "задание", "задания", "заданий")}</b><span class="hint">новых ${nNew} · переформулировок ${nKey}</span>` + Object.keys(cnt).sort((x, y) => cnt[y] - cnt[x])
      .map(n => `<span class="tag">блок ${blockNum(n)} — ${cnt[n]}</span>`).join("");
    const list = $("#rtlist"); list.innerHTML = "";
    if (!qs.length) list.appendChild(el("p", "hint", "Заданий пока нет."));
    qs.forEach((q, i) => {
      const o = q.origin === "new" || q.origin === "hand" ? null : orig[String(q.from || "").replace(/#\d+$/, "")];
      const c = el("div", "q rtq");
      const opts = q.options || [];
      const isOn = id => q.type === "single" ? q.answer === id : [].concat(q.answer || []).includes(id);
      c.innerHTML = `<div class="qn"><b>${i + 1}</b>
          ${locked ? `<i>${esc(kindName[q.type] || q.type)}</i><i>блок ${blockNum(q.block)}</i>`
            : `<select data-f="type">${Object.keys(kindName).map(k => `<option value="${k}" ${k === q.type ? "selected" : ""}>${kindName[k]}</option>`).join("")}</select>
               <select data-f="block">${blocks.map(b => `<option value="${b.n}" ${Number(b.n) === Number(q.block) ? "selected" : ""}>блок ${blockNum(b.n)}</option>`).join("")}</select>`}
          <i>${q.points} ${q.points === 1 ? "балл" : "балла"}</i>
          ${locked ? "" : `<button class="mdel" data-f="del" type="button">Удалить</button>`}</div>
        ${q.origin === "new" ? `<div class="rtorig rtnew">Новый вопрос по материалу${q.source ? " «" + esc(q.source) + "»" : ""}</div>` : ""}
        ${o ? `<details class="rtorig"><summary>${o.correct === true ? "Переформулировка задания экзамена (ответил верно)" : "Переформулировка задания с ошибкой"}</summary><p>${esc(o.text || "")}</p>
          <div class="hint"><b>Ответил:</b> ${esc(o.givenText || "")}</div><div class="hint"><b>Верно:</b> ${esc(o.right || "")}</div></details>` : ""}
        <label class="f">Вопрос</label><textarea data-f="text" ${locked ? "disabled" : ""}>${esc(q.text || "")}</textarea>
        ${q.type === "short" ? `<label class="f">Эталонный ответ</label><textarea data-f="model" ${locked ? "disabled" : ""}>${esc((q.answer && q.answer.model) || "")}</textarea>
          <label class="f">Что обязательно должно быть в ответе (по пункту в строке)</label>
          <textarea data-f="must" ${locked ? "disabled" : ""}>${esc(((q.answer && q.answer.must) || []).join("\n"))}</textarea>`
        : `<label class="f">Варианты — отметьте ${q.type === "single" ? "один верный" : "все верные"}</label>
          <div class="rtopts">${opts.map((x, j) => `<div class="rtopt ${isOn(x.id) ? "on" : ""}">
              <input type="${q.type === "single" ? "radio" : "checkbox"}" name="rt${i}" data-ok="${j}" ${isOn(x.id) ? "checked" : ""} ${locked ? "disabled" : ""}>
              <input type="text" data-opt="${j}" value="${esc(x.t)}" ${locked ? "disabled" : ""}>
              ${locked ? "" : `<button class="mdel" data-rmopt="${j}" type="button" title="Убрать вариант">×</button>`}</div>`).join("")}</div>
          ${locked || opts.length >= 6 ? "" : '<button class="btn small white" data-f="addopt" type="button">+ вариант</button>'}`}
        <label class="f">Почему так (увидит сотрудник в разборе)</label><textarea data-f="explain" ${locked ? "disabled" : ""}>${esc(q.explain || "")}</textarea>`;
      if (!locked) {
        const f = n => c.querySelector(`[data-f="${n}"]`);
        f("text").oninput = e => q.text = e.target.value;
        f("explain").oninput = e => q.explain = e.target.value;
        f("block").onchange = e => q.block = Number(e.target.value);
        f("type").onchange = e => {
          const t = e.target.value; if (t === q.type) return;
          if (t === "short") { q.answer = { model: "", must: [] }; q.points = 2; delete q.options; }
          else {
            if (!q.options || !q.options.length) q.options = ["", "", "", ""].map((x, j) => ({ id: letters[j], t: "" }));
            q.answer = t === "single" ? "" : []; q.points = t === "single" ? 1 : 2;
          }
          q.type = t; draw();
        };
        f("del").onclick = () => { qs.splice(i, 1); draw(); };
        if (q.type === "short") {
          f("model").oninput = e => { q.answer = q.answer || {}; q.answer.model = e.target.value; };
          f("must").oninput = e => { q.answer = q.answer || {}; q.answer.must = e.target.value.split("\n").map(x => x.trim()).filter(Boolean); };
        } else {
          c.querySelectorAll("[data-opt]").forEach(inp => inp.oninput = () => { q.options[+inp.dataset.opt].t = inp.value; });
          c.querySelectorAll("[data-ok]").forEach(inp => inp.onchange = () => {
            const id = q.options[+inp.dataset.ok].id;
            if (q.type === "single") q.answer = id;
            else { const set = new Set([].concat(q.answer || [])); inp.checked ? set.add(id) : set.delete(id); q.answer = [...set]; }
            draw();
          });
          c.querySelectorAll("[data-rmopt]").forEach(b => b.onclick = () => {
            const gone = q.options.splice(+b.dataset.rmopt, 1)[0];
            q.answer = q.type === "single" ? (q.answer === gone.id ? "" : q.answer) : [].concat(q.answer || []).filter(x => x !== gone.id);
            draw();
          });
          if (f("addopt")) f("addopt").onclick = () => {
            const used = new Set(q.options.map(x => x.id));
            q.options.push({ id: letters.split("").filter(x => !used.has(x))[0], t: "" }); draw();
          };
        }
      }
      list.appendChild(c);
    });
  };
  const payload = () => ({ id: r.id, questions: qs });
  const act = async (fn, okText) => {
    try { const upd = await fn(); if (okText) toast(okText); admRetake(r.id, src); return upd; } catch (e) { fail(e); }
  };
  const foot = $("#rtfoot");
  const btn = (txt, cls, fn) => { const b = el("button", "btn " + (cls || ""), txt); b.type = "button"; b.onclick = once(fn); foot.appendChild(b); return b; };
  btn("← К попытке", "ghost", () => src ? admAttempt(src.id) : admAttempts());
  if (r.status === "done") { if (r.attemptId) btn("Открыть результат", "", () => admAttempt(r.attemptId)); }
  else if (r.available || (r.status === "approved" && r.opensAt)) {
    btn("Закрыть доступ", "white", () => act(() => api("admin.retakeClose", { id: r.id }), "Доступ закрыт — пересдача снова только у вас"));
    if (!r.available) btn("Сохранить", "", () => act(() => api("admin.retakeSave", payload()), "Сохранено"));
  } else {
    btn("Сохранить", "white", () => act(() => api("admin.retakeSave", payload()), "Сохранено"));
    if (r.status === "draft") btn("Утвердить", "", () => act(async () => {
      await api("admin.retakeSave", payload()); return api("admin.retakeApprove", { id: r.id });
    }, "Утверждено. Сотрудник пока не видит пересдачу — откройте её сейчас или с даты"));
    else {
      const wrap = el("span", "rtdate"); wrap.innerHTML = `<label class="f">Дата, с которой пересдача откроется сама</label><input type="date" id="rtwhen" min="${today}" value="${today}">`;
      foot.appendChild(wrap);
      btn("Открыть сейчас", "", async () => {
        if (!await ask({ title: "Открыть пересдачу", ok: "Открыть", text: `<b>${esc(r.fio)}</b> сразу увидит пересдачу во вкладке «Экзамен». Разбор прошлой попытки у него скроется до сдачи.` })) return;
        await act(async () => { await api("admin.retakeSave", payload()); return api("admin.retakeOpen", { id: r.id, when: "now" }); }, "Пересдача открыта сотруднику");
      });
      btn("Открыть с даты", "white", async () => {
        const w = $("#rtwhen").value; if (!w) return toast("Выберите дату");
        await act(async () => { await api("admin.retakeSave", payload()); return api("admin.retakeOpen", { id: r.id, when: w }); },
          "Пересдача откроется " + new Date(w + "T00:00").toLocaleDateString("ru-RU"));
      });
    }
  }
  if (r.status !== "done") btn("Удалить", "red", async () => {
    if (!await ask({ title: "Удалить пересдачу?", danger: true, ok: "Удалить", text: "Задания этой пересдачи будут стёрты. Отменить нельзя." })) return;
    try { await api("admin.retakeDel", { id: r.id }); toast("Пересдача удалена"); src ? admAttempt(src.id) : admAttempts(); } catch (e) { fail(e); }
  });
  const bs = foot.querySelectorAll(".btn");                /* на телефоне кнопки по две в ряд: последняя без пары — во всю ширину */
  if (bs.length % 2) bs[bs.length - 1].classList.add("wide");
  if ($("#rtadd")) $("#rtadd").onclick = () => {
    qs.push({ id: "", from: "", origin: "hand", block: (qs[0] && qs[0].block) || (blocks[0] && blocks[0].n) || 1, type: "single", points: 1, text: "", explain: "",
              options: ["", "", "", ""].map((x, j) => ({ id: letters[j], t: "" })), answer: "" });
    draw(); const last = $("#rtlist").lastElementChild; if (last) last.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  draw();
}

/* ручная проверка задания: РОП ставит балл сам, итог попытки пересчитывается */
function gradeAnswer(a, r) {
  if (!r) return;
  const back = el("div", "modal-back");
  const баллы = Array.from({ length: (Number(r.max) || 0) + 1 }, (_, k) => k);
  back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" style="max-width:520px">
    <b>${r.needsReview ? "Проверить вручную" : "Изменить балл"}</b>
    <p class="qt" style="margin:8px 0 6px">${esc(r.text || r.id)}</p>
    <div class="hint"><b>Ответ:</b> ${esc(r.givenText || "— нет ответа —")}</div>
    ${r.right ? `<div class="hint"><b>Эталон:</b> ${esc(r.right)}</div>` : ""}
    ${r.ai ? `<div class="hint"><b>ИИ:</b> ${esc(r.ai.comment || "")}${r.ai.miss && r.ai.miss.length ? " · не раскрыто: " + esc(r.ai.miss.join("; ")) : ""}</div>` : ""}
    <label class="f">Балл за задание (из ${r.max})</label>
    <div class="seg gradeseg">${баллы.map(k => `<button type="button" data-p="${k}" class="${k === Number(r.points) ? "on" : ""}">${k}</button>`).join("")}</div>
    <label class="f">Комментарий (попадёт в отчёт)</label>
    <textarea id="gnote" placeholder="Например: суть раскрыта, ИИ придрался к формулировке">${esc((r.manual && r.manual.note) || "")}</textarea>
    <div class="mbtns"><button class="btn ghost" data-a="0" type="button">Отмена</button>
      <button class="btn" data-a="1" type="button">Сохранить балл</button></div></div>`;
  document.body.appendChild(back); lockScroll(true);
  let выбрано = Number(r.points) || 0;
  back.querySelectorAll("[data-p]").forEach(b => b.onclick = () => {
    выбрано = +b.dataset.p; back.querySelectorAll("[data-p]").forEach(x => x.classList.toggle("on", x === b));
  });
  const close = () => { back.remove(); lockScroll(false); };
  back.querySelector('[data-a="0"]').onclick = close;
  back.querySelector('[data-a="1"]').onclick = once(async () => {
    try {
      const upd = await api("admin.attemptGrade", { id: a.id, qid: r.id, points: выбрано, note: back.querySelector("#gnote").value.trim() });
      close();
      const y = window.scrollY;
      await admAttempt(a.id, upd);
      $("#alist").hidden = false; $("#atoggle").textContent = "Скрыть ответы";
      window.scrollTo(0, y);
      toast("Балл сохранён: " + upd.score + " из " + upd.max + " — " + upd.percent + "% · " + upd.verdict);
    } catch (e) { fail(e); }
  });
}

/* PDF по блокам: шапка и каждое задание снимаются отдельно и укладываются по страницам A4.
   Одним снимком длинный отчёт не получался — у браузера есть предел высоты холста, и страницы выходили пустыми */
const PDF_LIBS = ["https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",
                  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"];
const loadScript = src => new Promise((ok, bad) => {
  if ([...document.scripts].some(x => x.src === src)) return ok();
  const sc = document.createElement("script"); sc.src = src;
  sc.onload = ok; sc.onerror = () => bad(new Error("Не удалось загрузить модуль PDF — проверьте интернет"));
  document.head.appendChild(sc);
});
async function reportPdf(blocks, css, fileName) {
  for (const src of PDF_LIBS) await loadScript(src);
  const pdf = new window.jspdf.jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const W = 210, H = 297, M = 10, CW = W - 2 * M, PAGE = H - 2 * M, HOSTW = 760, mmPerPx = CW / HOSTW;
  const pagePx = PAGE / mmPerPx;                              /* высота листа в пикселях макета */
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:0;top:0;width:" + HOSTW + "px;z-index:9998;background:#fff";
  const cover = document.createElement("div");
  cover.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(35,34,39,.6);display:flex;align-items:center;justify-content:center;color:#fff;font:700 16px Arial,sans-serif";
  document.body.append(host, cover);
  const wrap = list => `<div class="rpaper" style="padding:0;margin:0;max-width:none;box-shadow:none;border:0;border-radius:0;background:#fff"><style>${css}</style>${list.join("")}</div>`;
  const height = list => { host.innerHTML = wrap(list); return host.getBoundingClientRect().height; };
  let first = true;
  /* снимаем то, что сейчас в макете, как один лист (или несколько, если блок выше листа) */
  const shoot = async list => {
    host.innerHTML = wrap(list);
    const box = host.getBoundingClientRect();
    const links = [...host.querySelectorAll("a[href]")].map(el => {
      const r = el.getBoundingClientRect(); return { url: el.href, x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height };
    });
    const canvas = await window.html2canvas(host, { scale: 1.3, backgroundColor: "#ffffff", useCORS: true, logging: false, windowWidth: HOSTW });
    const pxPerMm = canvas.width / CW, slice = Math.floor(PAGE * pxPerMm);
    for (let off = 0; off < canvas.height; off += slice) {
      if (!first) pdf.addPage(); first = false;
      const h = Math.min(slice, canvas.height - off), c = document.createElement("canvas");
      c.width = canvas.width; c.height = h;
      c.getContext("2d").drawImage(canvas, 0, off, canvas.width, h, 0, 0, canvas.width, h);
      pdf.addImage(c.toDataURL("image/jpeg", 0.72), "JPEG", M, M, CW, h / pxPerMm);
      links.forEach(l => {                                      /* ссылки на этом листе — кликабельные */
        const top = l.y * mmPerPx - off / pxPerMm;
        if (top >= 0 && top < h / pxPerMm) pdf.link(M + l.x * mmPerPx, M + top, l.w * mmPerPx, l.h * mmPerPx, { url: l.url });
      });
    }
  };
  try {
    let page = [];
    for (let i = 0; i < blocks.length; i++) {
      cover.textContent = "Готовим PDF… " + Math.round(i / blocks.length * 100) + "%";
      if (page.length && height(page.concat(blocks[i])) > pagePx) { await shoot(page); page = []; }   /* лист полон — снимаем */
      page.push(blocks[i]);
    }
    if (page.length) await shoot(page);
    pdf.save(fileName);
  } finally { host.remove(); cover.remove(); }
}

/* ---------- печать отчётов ---------- */
/* макет отчёта: один для PDF руководителя и для разбора в кабинете сотрудника.
   opts.inApp — ссылки «где посмотреть» открывают урок прямо в кабинете */
function reportParts(a, mode, opts) {
  opts = opts || {};
  const full = mode === "full";
  const all = a.answers || [];
  const isWrong = r => !r.needsReview && r.correct !== true;
  const wrong = all.filter(isWrong);
  const items = full ? all : wrong;
  const blocks = (a.byBlock || []).slice().sort((x, y) => blockNum(x.n) - blockNum(y.n));
  const pctOf = b => b.max ? Math.round(b.got / b.max * 100) : 0;
  const weak = blocks.filter(b => b.max && b.got / b.max < 0.9).sort((x, y) => x.got / x.max - y.got / y.max);
  const errByBlock = {}; wrong.forEach(r => { errByBlock[r.block] = (errByBlock[r.block] || 0) + 1; });
  const cnt = a.counts || {                             /* в кабинет сотрудника сервер присылает только ошибки и готовые счётчики */
    ok: all.filter(r => !r.needsReview && r.correct === true).length,
    part: all.filter(r => !r.needsReview && r.correct !== true && Number(r.points) > 0).length,
    rev: all.filter(r => r.needsReview).length,
    bad: all.filter(r => !r.needsReview && r.correct !== true && !Number(r.points)).length
  };
  const manual = all.filter(r => r.manual);
  const site = location.origin + location.pathname;
  const where = r => {                                   /* «где смотреть» — ссылкой прямо на урок + точное место из ключа */
    const ref = r.ref || null, title = (ref && ref.title) || r.source || "";
    if (!(ref && ref.id)) return esc(title);
    const link = opts.inApp ? `<a href="#" data-l="${esc(ref.id)}">${esc(title)}</a>`
      : `<a href="${esc(site + "#s=cabinet&l=" + encodeURIComponent(ref.id))}">${esc(title)}</a>`;
    const точнее = r.source && r.source !== title ? ` <span class="rp-src">(${esc(r.source)})</span>` : "";
    return link + точнее;
  };
  const manualNote = r => r.manual ? `<div class="rp-mn">✎ Балл изменён вручную: было ${r.manual.first !== undefined ? r.manual.first : r.manual.prev}, стало ${r.points}
      ${full ? `· ${esc(r.manual.by || "")}, ${esc(dayRu(r.manual.at))}${r.manual.note ? ` — «${esc(r.manual.note)}»` : ""}` : ""}</div>` : "";
  const vcls = a.verdict === "сдал" ? "ok" : a.verdict === "пересдача" ? "retry" : "fail";
  /* палитра проверена валидатором (цветовая слепота, контраст): верно · частично · на проверке · неверно */
  const C = { ok: "#14795A", part: "#B07A00", rev: "#3B6FB6", bad: "#B83434" };
  const total = all.length || 1;
  const seg = (k, label) => cnt[k] ? `<i style="flex:${cnt[k]};background:${C[k]}" title="${label}: ${cnt[k]}"></i>` : "";
  const legend = (k, label) => `<span><b style="background:${C[k]}"></b>${label} — ${cnt[k]}</span>`;
  const bars = list => list.map(b => {
    const p = pctOf(b), low = p < 90;
    return `<div class="rp-br"><div class="rp-bn">${blockNum(b.n)}. ${esc(b.title)}</div>
      <div class="rp-bt"><i style="width:${p}%"></i><em style="left:90%"></em></div>
      <div class="rp-bv">${p}%${errByBlock[b.n] ? ` · ошибок ${errByBlock[b.n]}` : ""}${low ? ' <span class="rp-up">подтянуть</span>' : ""}</div></div>`;
  }).join("");

  const css = `.rpaper{font-family:Manrope,Arial,sans-serif;color:#232227;font-size:10.5pt;line-height:1.45}
    .rpaper h1,.rpaper h2{font-family:inherit;letter-spacing:0;text-transform:none;color:#232227}
    .rpaper h1{font-size:19pt;margin:0 0 4px} .rpaper h2{font-size:12pt;margin:20px 0 8px;border-top:2px solid #232227;padding-top:8px;break-after:avoid;page-break-after:avoid}
    .rpaper .rp-meta{color:#4A4950;font-size:9.5pt;margin-bottom:12px}
    .rpaper .rp-hero{display:flex;gap:18px;align-items:center;flex-wrap:wrap;margin:10px 0 6px}
    .rpaper .rp-big{font-size:40pt;font-weight:800;line-height:1;letter-spacing:-.02em}
    .rpaper .rp-vd{display:inline-block;border-radius:999px;padding:4px 12px;font-weight:800;font-size:10pt}
    .rpaper .rp-vd.ok{background:#E4F4EC;color:#14795A} .rpaper .rp-vd.retry{background:#FDF3DE;color:#8A5F0A} .rpaper .rp-vd.fail{background:#FDF0F0;color:#B83434}
    .rpaper .rp-scale{position:relative;height:10px;border-radius:5px;background:#EDEBE7;margin:10px 0 18px}
    .rpaper .rp-scale i{position:absolute;left:0;top:0;bottom:0;border-radius:5px;background:#232227}
    .rpaper .rp-scale em{position:absolute;top:-4px;bottom:-4px;width:2px;background:#B83434}
    .rpaper .rp-scale span{position:absolute;top:14px;font-size:7.5pt;color:#6D6B72;transform:translateX(-50%);white-space:nowrap}
    .rpaper .rp-tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:8px 0}
    .rpaper .rp-tile{border:1px solid #E5E3DF;border-radius:10px;padding:8px 10px}
    .rpaper .rp-tile b{display:block;font-size:16pt;line-height:1.1} .rpaper .rp-tile span{font-size:8.5pt;color:#6D6B72}
    .rpaper .rp-stack{display:flex;gap:2px;height:14px;border-radius:7px;overflow:hidden;margin:10px 0 6px}
    .rpaper .rp-stack i{display:block;height:100%}
    .rpaper .rp-lg{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:9pt;color:#4A4950}
    .rpaper .rp-lg b{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px}
    .rpaper .rp-br{display:grid;grid-template-columns:minmax(0,1fr) 30% 180px;gap:10px;align-items:center;padding:4px 0;border-top:1px solid #F0EEEA;page-break-inside:avoid}
    .rpaper .rp-bn{font-size:9pt} .rpaper .rp-bv{font-size:9pt;color:#4A4950;white-space:nowrap}
    .rpaper .rp-bt{position:relative;height:8px;border-radius:4px;background:#EDEBE7}
    .rpaper .rp-bt i{position:absolute;left:0;top:0;bottom:0;border-radius:4px;background:#232227}
    .rpaper .rp-bt em{position:absolute;top:-3px;bottom:-3px;width:2px;background:#B83434}
    .rpaper .rp-up{display:inline-block;margin-left:4px;padding:0 6px;border-radius:999px;background:#FDF3DE;color:#8A5F0A;font-size:8pt;font-weight:700}
    .rpaper .rp-note9{font-size:8.5pt;color:#6D6B72;margin-top:4px}
    .rpaper .rp-q{border:1px solid #E5E3DF;border-radius:8px;padding:8px 10px;margin:6px 0;page-break-inside:avoid}
    .rpaper .rp-q.bad{border-color:#E8C3B4;background:#FEF9F7} .rpaper .rp-n{font-size:7.5pt;color:#98969C;font-weight:800;letter-spacing:.08em}
    .rpaper .rp-t{font-weight:700;margin:2px 0 5px} .rpaper .rp-r{font-size:9.5pt;margin:2px 0}
    .rpaper .rp-lbl{color:#6D6B72;display:inline-block;min-width:118px} .rpaper a{color:#C84E17} .rpaper .rp-src{color:#6D6B72;font-size:8.5pt}
    .rpaper .rp-mn{margin-top:5px;font-size:8.5pt;color:#14795A;font-weight:600}
    .rpaper ol{margin:4px 0 0 18px;padding:0} .rpaper li{margin:3px 0}
    @media (max-width:600px){ .rpaper .rp-tiles{grid-template-columns:repeat(2,1fr);} .rpaper .rp-br{grid-template-columns:1fr;gap:4px;} }
    @page{size:A4;margin:14mm 12mm}`;

  const scale = `<div class="rp-scale"><i style="width:${Math.min(100, a.percent)}%"></i>
      <em style="left:60%"></em><em style="left:90%"></em>
      <span style="left:60%">60% — пересдача</span><span style="left:90%">90% — сдано</span></div>`;
  const head = full ? `<h1>Отчёт по экзамену — ${esc(a.fio)}</h1>
    <div class="rp-meta">Сдан ${new Date(a.finishedAt).toLocaleString("ru-RU")} · время ${Math.round((a.durationSec || 0) / 60)} мин${a.overtimeSec ? " (превышение " + Math.round(a.overtimeSec / 60) + " мин)" : ""} · выходов со страницы ${(a.away && a.away.count) || 0}</div>
    <div class="rp-hero"><div class="rp-big">${a.percent}%</div>
      <div><span class="rp-vd ${vcls}">${esc(a.verdict)}</span><div class="rp-note9">${a.score} из ${a.max} баллов${cnt.rev ? " · " + cnt.rev + " на ручной проверке, в процент пока не входят" : ""}</div></div></div>
    ${scale}
    <div class="rp-tiles">
      <div class="rp-tile"><b>${cnt.ok}</b><span>верно</span></div><div class="rp-tile"><b>${cnt.part}</b><span>частично</span></div>
      <div class="rp-tile"><b>${cnt.bad}</b><span>неверно</span></div><div class="rp-tile"><b>${cnt.rev}</b><span>на ручной проверке</span></div></div>
    <div class="rp-stack">${seg("ok", "верно")}${seg("part", "частично")}${seg("rev", "на проверке")}${seg("bad", "неверно")}</div>
    <div class="rp-lg">${legend("ok", "верно")}${legend("part", "частично")}${legend("rev", "на проверке")}${legend("bad", "неверно")}</div>
    ${manual.length ? `<div class="rp-note9">✎ Ручных правок баллов: ${manual.length} — отмечены в заданиях ниже.</div>` : ""}
    <h2>Результат по блокам</h2>
    <div class="rp-note9">Полоса — процент баллов по блоку, красная черта — порог 90%.</div>${bars(blocks)}
    ${weak.length ? `<h2>Слабые места</h2><ol>${weak.slice(0, 3).map(b => `<li><b>${blockNum(b.n)}. ${esc(b.title)}</b> — ${pctOf(b)}%${errByBlock[b.n] ? ", ошибок " + errByBlock[b.n] : ""}</li>`).join("")}</ol>` : ""}
    <h2>Ответы по заданиям</h2>`
  : `<h1>Разбор экзамена — ${esc(a.fio)}</h1>
    <div class="rp-meta">${new Date(a.finishedAt).toLocaleDateString("ru-RU")} · этот разбор показывает, где были ошибки и что повторить</div>
    <div class="rp-hero"><div class="rp-big">${a.percent}%</div>
      <div><span class="rp-vd ${vcls}">${esc(a.verdict)}</span><div class="rp-note9">Ошибок: ${wrong.length} из ${a.total || all.length} заданий</div></div></div>
    ${scale}
    <div class="rp-stack">${seg("ok", "верно")}${seg("part", "частично")}${seg("rev", "на проверке")}${seg("bad", "неверно")}</div>
    <div class="rp-lg">${legend("ok", "верно")}${legend("part", "частично")}${legend("bad", "неверно")}${cnt.rev ? legend("rev", "проверяет руководитель") : ""}</div>
    ${weak.length ? `<h2>Где подтянуть</h2><div class="rp-note9">Блоки, где результат ниже 90%. Красная черта — порог.</div>${bars(weak)}
      <h2>С чего начать</h2><ol>${weak.slice(0, 3).map(b => `<li><b>${blockNum(b.n)}. ${esc(b.title)}</b> — ${b.got / b.max < 0.6 ? "стоит пройти блок заново." : "повторите материал и разберите ошибки ниже."}</li>`).join("")}</ol>` : ""}
    <h2>Задания с ошибками (${wrong.length})</h2>`;

  const cards = items.map((r, i) => `<div class="rp-q ${r.correct === true ? "" : "bad"}">
      <div class="rp-n">№${full ? i + 1 : r.n || all.indexOf(r) + 1} · блок ${blockNum(r.block)} · ${r.points}/${r.max} балла${r.needsReview ? " · на ручной проверке" : ""}</div>
      <div class="rp-t">${esc(r.text || r.id)}</div>
      <div class="rp-r"><span class="rp-lbl">${full ? "Ответ:" : "Ваш ответ:"}</span> ${esc(r.givenText || "— нет ответа —")}</div>
      <div class="rp-r"><span class="rp-lbl">${full ? "Эталон:" : "Как должно быть:"}</span> ${esc(r.right || "")}</div>
      ${!full && r.explain ? `<div class="rp-r"><span class="rp-lbl">Почему:</span> ${esc(r.explain)}</div>` : ""}
      ${r.ai && r.ai.comment ? `<div class="rp-r"><span class="rp-lbl">${full ? "Проверка ИИ:" : "Комментарий:"}</span> ${esc(r.ai.comment)}${r.ai.miss && r.ai.miss.length ? " Не хватает: " + esc(r.ai.miss.join("; ")) : ""}</div>` : ""}
      ${r.sim && (r.sim.notes || []).length ? `<div class="rp-r"><span class="rp-lbl">Что не так:</span> ${esc(r.sim.notes.join("; "))}</div>` : ""}
      <div class="rp-r"><span class="rp-lbl">Где посмотреть:</span> ${where(r)}</div>
      ${manualNote(r)}</div>`);
  const body = cards.join("") || (all.length || a.counts ? `<p>Ошибок нет — отличный результат.</p>` : `<p>По этой попытке нет данных об ответах.</p>`);

  const title = (full ? "Отчёт по экзамену" : "Разбор экзамена") + " — " + a.fio;
  return { css: css, head: head, cards: cards, body: body, title: title };
}
function printReport(a, mode) {
  const full = mode === "full";
  const { css, head, cards, body, title } = reportParts(a, mode);
  const v = el("div", "viewer report");
  v.innerHTML = `<div class="vhead"><b>${full ? "Отчёт для руководителя" : "Разбор для сотрудника"} — ${esc(a.fio)}</b>
      <button type="button" data-a="pdf">Скачать PDF</button>
      <button type="button" data-a="close">Закрыть</button></div>
    <div class="rpaper"><style>${css}</style>${head}${body}</div>`;
  v.querySelector('[data-a="close"]').onclick = () => v.remove();
  v.querySelector('[data-a="pdf"]').onclick = once(async () => {
    const name = title.replace(/[\\/:*?"<>|]/g, " ") + " " + dayRu(a.finishedAt) + ".pdf";
    try { await reportPdf([head].concat(cards.length ? cards : [body]), css, name); toast("PDF сохранён в «Загрузки»"); }
    catch (e) { fail(e); }
  });
  document.body.appendChild(v);
}

/* ---------- сотрудники ---------- */
const userStatus = u => u.archived ? "archived" : u.active === false ? "blocked" : "active";
/* этап: МОПО по умолчанию «учится», РОПы и разработчики — «работает» */
const userStage = u => u.stage === "work" || u.stage === "study" ? u.stage : ((u.role || "employee") === "employee" ? "study" : "work");
const STATUS_TAG = { active: '<span class="tag ok">работает</span>', blocked: '<span class="tag fail">доступ закрыт</span>',
                     archived: '<span class="tag">удалён</span>', study: '<span class="tag wait">учится</span>',
                     work: '<span class="tag ok">работает</span>' };
const statusTag = u => { const st = userStatus(u); return STATUS_TAG[st === "active" ? userStage(u) : st]; };
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
  const dev = devUI();
  const host = $("#admbody");
  host.innerHTML = `<div class="card"><div class="qhead"><div><h2>${dev ? "Сотрудники: РОПы и МОПО" : "Сотрудники"}</h2>
    <p class="lead">${dev ? "Все учётные записи платформы. Здесь же видны МОПО, которых завели РОПы."
      : "Здесь все, у кого есть доступ к кабинету. Заводить и менять вы можете МОПО: выдать логин и пароль, сменить статус, закрыть доступ или перенести в архив — прогресс сохранится. РОПов и разработчиков меняет разработчик."}</p></div>
    <button class="btn" id="uadd" type="button">${dev ? "Добавить" : "Добавить МОПО"}</button></div>
    <div id="ureset"></div><div class="seg wide" id="useg"></div><div id="utbl"></div></div>`;
  let list = [], resets = [];
  try { list = (await api("admin.users")).users || []; resets = (await api("admin.resets")).resets || []; } catch (e) { return fail(e); }
  if (!dev) resets = resets.filter(r => (r.role || "employee") === "employee");   /* пароль РОПам и разработчику выдаёт разработчик */
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
      <td>${statusTag(u)}${u.locked ? '<div><span class="tag fail">вход заблокирован</span></div>' : ""}${u.archived && u.archivedAt ? `<div class="hint tiny">с ${dayRu(u.archivedAt)}</div>` : ""}</td>
      <td>${dev || (u.role || "employee") === "employee" ? `<button class="btn small white" data-i="${i}" type="button">Управлять</button>`
        : '<span class="hint tiny" title="РОПов и разработчиков меняет разработчик">меняет разработчик</span>'}</td></tr>`).join("")
    : `<tr><td colspan="7" class="hint">${ADM.users === "arch" ? "В архиве пока никого." : "Сотрудников пока нет."}</td></tr>`);
  host.querySelector("#utbl").appendChild(t);
  t.querySelectorAll("[data-i]").forEach(b => b.onclick = () => userForm(shown[+b.dataset.i]));
  $("#uadd").onclick = () => userForm(null);
}
function userForm(u, reset) {
  const dev = devUI();
  const back = el("div", "modal-back");
  const st = u ? userStatus(u) : "active", self = u && APP.user && u.id === APP.user.id;
  back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" style="max-width:560px">
    <b>${u ? esc(u.fio) : dev ? "Новая учётная запись" : "Новый МОПО"}</b>
    ${u ? `<div class="ustat">${statusTag(u)}${u.locked ? ' <span class="tag fail">вход заблокирован</span>' : ""}</div>` : ""}
    ${u && u.locked ? `<div class="note warn">Вход закрыт после 5 неверных попыток пароля${u.lockedAt ? " — " + esc(dayRu(u.lockedAt)) : ""}.
      ${dev ? "Чтобы снять: сгенерируйте новый пароль и сохраните — блокировка снимется, пароль передайте сотруднику."
            : "Снять блокировку может только разработчик — напишите ему во «Вопросы разработчику»."}</div>` : ""}
    <label class="f">Имя и фамилия</label><input type="text" id="ufio" value="${esc(u ? u.fio : "")}">
    <label class="f">Логин</label><input type="text" id="ulogin" value="${esc(u ? u.login : "")}" ${u && !dev ? "disabled" : ""}>
    ${u && dev ? '<p class="hint tiny">Логин можно изменить. Сотрудник останется в кабинете и не потеряет прогресс — но войти в следующий раз сможет только с новым логином, передайте его.</p>'
      : u ? '<p class="hint tiny">Логин менять может разработчик.</p>' : ""}
    <label class="f">${u ? "Новый пароль (оставьте пустым — не менять)" : "Пароль"}</label>
    <div class="pwrow"><input type="text" id="upass" placeholder="виден вам, чтобы передать сотруднику" autocomplete="off">
      <button class="btn small white" type="button" id="ugen">Сгенерировать</button>
      <button class="btn small white" type="button" id="ucopy" hidden>Скопировать</button></div>
    <label class="f">Роль</label>
    ${dev ? `<select id="urole"><option value="employee">МОПО</option><option value="admin">РОП</option><option value="dev">Разработчик</option></select>`
          : `<input type="text" value="МОПО" disabled><input type="hidden" id="urole" value="employee">
             <p class="hint tiny">РОПов заводит разработчик.</p>`}
    ${!self ? `<label class="f">Статус</label>
    <select id="ustage">
      <option value="study">Учится — блоки открываются по очереди</option>
      <option value="work">Работает — действующий МОПО, открыты все уроки</option>
      ${u ? '<option value="gone">Удалён — в архив</option>' : ""}
    </select>
    <p class="hint tiny">«Работает» — тот же кабинет МОПО, только без очереди: все блоки доступны сразу, чтобы возвращаться к нужному.
      «Удалён» — сотрудник исчезает из учеников и не может войти, но прогресс и ответы хранятся: вернуть можно в любой момент.</p>` : ""}
    <div class="mbtns"><button class="btn ghost" data-a="0" type="button">Отмена</button>
      <button class="btn" data-a="1" type="button">Сохранить</button></div>
    ${u && !self ? `<div class="udanger">
      <div class="flab">Доступ</div>
      ${st === "active" ? `<button class="btn small white" data-s="blocked" type="button">Закрыть доступ</button>
          <p class="hint tiny">«Закрыть доступ» — вход заблокирован, в учениках остаётся. Для ушедших выберите статус «Удалён» выше.</p>` : ""}
      ${st === "blocked" ? `<button class="btn small green" data-s="active" type="button">Открыть доступ</button>
          <button class="btn small white" data-s="archived" type="button">Перенести в архив</button>` : ""}
      ${st === "archived" ? `<button class="btn small green" data-s="active" type="button">Вернуть из архива</button>
          <button class="btn small red" data-del="1" type="button">Удалить навсегда</button>
          <p class="hint tiny">Удаление сотрёт профиль, прогресс, заметки, вопросы и результаты экзаменов. Отменить нельзя.</p>` : ""}
    </div>` : ""}</div>`;
  document.body.appendChild(back); lockScroll(true);
  if (u && dev) back.querySelector("#urole").value = u.role || "employee";
  if (back.querySelector("#ustage")) back.querySelector("#ustage").value = u ? (st === "archived" ? "gone" : userStage(u)) : "study";
  const pass = back.querySelector("#upass"), copy = back.querySelector("#ucopy");
  if (reset) { pass.value = genPassword(); copy.hidden = false; setTimeout(() => pass.select(), 30); }
  back.querySelector("#ugen").onclick = () => { pass.value = genPassword(); copy.hidden = false; pass.select(); };
  copy.onclick = async () => {
    try { await navigator.clipboard.writeText(pass.value); toast("Пароль скопирован — передайте его сотруднику"); }
    catch (e) { pass.select(); toast("Скопируйте вручную: пароль выделен"); }
  };
  const close = () => { back.remove(); lockScroll(false); };
  back.querySelector('[data-a="0"]').onclick = close;
  back.querySelector('[data-a="1"]').onclick = once(async () => {
    const выбор = back.querySelector("#ustage") ? back.querySelector("#ustage").value : "";
    const d = { id: u ? u.id : "", fio: back.querySelector("#ufio").value.trim(), login: back.querySelector("#ulogin").value.trim(),
      password: pass.value, role: back.querySelector("#urole").value };
    if (выбор === "study" || выбор === "work") d.stage = выбор;
    if (!d.fio || (!u && (!d.login || !d.password))) { toast("Заполните имя, логин и пароль"); return; }
    if (u && dev && !d.login) { toast("Логин не может быть пустым"); return; }
    if (u && dev && /\s/.test(d.login)) { toast("В логине не должно быть пробелов"); return; }
    const логинСменили = u && dev && d.login.toLowerCase() !== String(u.login).toLowerCase();
    if (d.password && d.password.length < 6) { toast("Пароль — минимум 6 знаков. Нажмите «Сгенерировать»"); return; }
    if (u && выбор === "gone" && st !== "archived" && !await ask({ title: "Удалить сотрудника?",
        text: "Сотрудник пропадёт из списка учеников и не сможет войти. Всё, что он прошёл, сохранится — вернуть можно в любой момент в «Архиве».",
        ok: "Удалить", danger: true })) return;
    try {
      await api("admin.userSave", { data: d });
      /* «Удалён» — это архив; из архива обратно — возвращаем доступ */
      if (u && выбор === "gone" && st !== "archived") await api("admin.userStatus", { id: u.id, status: "archived" });
      else if (u && выбор && выбор !== "gone" && st === "archived") await api("admin.userStatus", { id: u.id, status: "active" });
      close(); admUsers(); refreshBadges();
      toast(u && выбор === "gone" && st !== "archived" ? "Сотрудник удалён — он в «Архиве», вернуть можно там же"
        : u && выбор !== "gone" && st === "archived" ? "Сотрудник возвращён из архива"
        : логинСменили ? "Логин изменён на «" + d.login + "» — передайте его сотруднику"
        : d.password ? "Сохранено — передайте новый пароль сотруднику" : "Сохранено");
    } catch (e) { fail(e); }
  });
  const TXT = { blocked: ["Закрыть доступ?", "Сотрудник больше не сможет войти. Прогресс сохранится, доступ можно вернуть.", "Закрыть доступ"],
                archived: ["Перенести в архив?", "Сотрудник пропадёт из списка учеников и не сможет войти. Всё, что он прошёл, сохранится — вернуть можно в любой момент.", "В архив"],
                active: ["Открыть доступ?", "Сотрудник снова сможет войти и продолжит с того места, где остановился.", "Открыть"] };
  back.querySelectorAll("[data-s]").forEach(b => b.onclick = once(async () => {
    const [title, text, ok] = TXT[b.dataset.s];
    if (!await ask({ title: title, text: text, ok: ok, danger: b.dataset.s !== "active" })) return;
    try { await api("admin.userStatus", { id: u.id, status: b.dataset.s }); close(); admUsers(); toast("Готово"); } catch (e) { fail(e); }
  }));
  const del = back.querySelector("[data-del]");
  if (del) del.onclick = once(async () => {
    if (!await ask({ title: "Удалить навсегда?", danger: true, ok: "Удалить",
        text: `<b>${esc(u.fio)}</b> — профиль, прогресс, заметки, вопросы и результаты экзаменов будут стёрты. Это нельзя отменить.` })) return;
    try { await api("admin.userDelete", { id: u.id }); close(); admUsers(); toast("Сотрудник удалён"); } catch (e) { fail(e); }
  });
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
/* тот же расчёт порядка, что делает сервер: материалы одной темы нумеруются по 10 */
function matReorder(lessons, me, after) {
  if (!me) return;
  const свои = lessons.filter(x => Number(x.block) === Number(me.block) && String(x.sub || "") === String(me.sub || "") && x.id !== me.id)
    .sort((a, b) => Number(a.order) - Number(b.order));
  let pos = свои.length;
  if (after === "start") pos = 0;
  else if (after === "keep") pos = свои.filter(x => Number(x.order) < Number(me.order)).length;
  else if (after && after !== "end") { const i = свои.findIndex(x => x.id === after); if (i >= 0) pos = i + 1; }
  свои.splice(pos, 0, me);
  свои.forEach((x, i) => x.order = (i + 1) * 10);
}

/* удалять: разработчик — всё, РОП — только то, что добавил сам */
const canDelMat = row => devUI() || (!!row.createdBy && row.createdBy === APP.user.id);
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
        : `<p class="hint">${kind === "lesson" ? "Удалить материал может только разработчик: его добавили не вы."
            : `Удалить ${kind === "block" ? "блок" : "тему"} может только разработчик: внутри есть материалы, добавленные не вами.`}</p>`}`,
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
      ${devUI() ? "Удалять можно любые материалы, темы и блоки." : "Удалять можно материалы, темы и блоки, которые добавили вы; спрятать — любые."}</p></div>
    <button class="btn" id="ladd" type="button">Добавить материал</button></div><div id="ltbl"><p class="hint">Загружаем…</p></div></div>`;
  let d;
  let exams = { topics: {}, excluded: [] }, base = {};
  try {
    /* четыре запроса подряд на сервере Google — это десятки секунд; спрашиваем разом */
    const [d0, , exams0, base0] = await Promise.all([
      local ? Promise.resolve(local) : matData(), quizData(), api("admin.examList"), examBaseCounts()
    ]);
    d = d0; exams = exams0; base = base0;
    if (local) {                                   /* свою копию тоже пересортируем: порядок мог поменяться */
      d.lessons = d.lessons.slice().sort((a, b) => (a.block - b.block) || (Number(a.order) - Number(b.order)));
      d.subs = d.subs.slice().sort((a, b) => (a.block - b.block) || (Number(a.order) - Number(b.order)));
    }
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
      mv.onclick = once(async () => {
        try { await api("admin.blockMove", { n: b.n, dir: dir }); PR.program = null; EX.data = null; await admMaterials(); toast("Порядок блоков изменён — номера пересчитаны"); }
        catch (e) { fail(e); }
      });
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
          ${truthy(l.active) || canDelMat(l) ? `<button class="mdel" type="button" title="${canDelMat(l) ? "Удалить или спрятать" : "Спрятать от сотрудников"}">${canDelMat(l) ? "Удалить" : "Спрятать"}</button>` : ""}`;
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
    <div class="mbtns">${l && canDelMat(l) ? '<button class="btn red" data-a="del" type="button" style="margin-right:auto"><span class="lbl-long">Удалить материал</span><span class="lbl-short">Удалить</span></button>' : ""}
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
  $$("#bdel button").onclick = once(async () => {
    const b = d.blocks.filter(x => Number(x.n) === Number(S.block))[0];
    if (!await ask({ title: "Удалить блок?", danger: true, ok: "Удалить", text: `Блок «${esc(b.title)}» пустой — в нём нет материалов. Удалить его?` })) return;
    try {
      await api("admin.blockDel", { n: b.n }); Object.assign(d, await matData());
      S.block = (d.blocks[0] || {}).n; S.sub = ""; S.after = l ? "keep" : "end"; redraw(); toast("Блок удалён");
    } catch (e) { fail(e); }
  });
  $$("#sdel button").onclick = once(async () => {
    const sub = d.subs.filter(x => String(x.id) === S.sub)[0];
    if (!await ask({ title: "Удалить тему?", danger: true, ok: "Удалить", text: `Тема «${esc(sub.title)}» пустая. Удалить её?` })) return;
    try {
      await api("admin.subDel", { id: sub.id }); Object.assign(d, await matData());
      S.sub = ""; S.after = "end"; redraw(); toast("Тема удалена");
    } catch (e) { fail(e); }
  });
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
  $$("#nbOk").onclick = once(async () => {
    const title = $$("#nbTitle").value.trim(); if (!title) return toast("Напишите название блока");
    try {
      const r = await api("admin.blockSave", { data: { title: title } });
      const nd = await matData(); Object.assign(d, nd);
      S.block = r.n; S.sub = ""; $$("#nbBox").hidden = true; $$("#nbTitle").value = "";
      redraw(); toast("Блок создан");
    } catch (e) { fail(e); }
  });
  $$("#nsOk").onclick = once(async () => {
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
  });
  const close = () => { back.remove(); lockScroll(false); };
  $$('[data-a="0"]').onclick = close;
  if ($$('[data-a="del"]')) $$('[data-a="del"]').onclick = async () => { if (await delMaterial("lesson", l, d)) { close(); admMaterials(); } };
  $$('[data-a="1"]').onclick = once(async () => {
    const data = { id: l ? l.id : "", block: S.block, sub: S.sub, title: $$("#ltitle").value.trim(), kind: $$("#lkind").value,
      url: $$("#lurl").value.trim(), note: $$("#lnote").value.trim(), after: S.after,
      ready: $$("#lready").checked, active: $$("#lact").checked };
    if (!data.title) { toast("Напишите название"); return; }
    if (data.ready && !data.url) { toast("У готового материала нужна ссылка. Или снимите «Материал готов»"); return; }
    const btn = $$('[data-a="1"]'); btn.disabled = true; btn.textContent = "Сохраняем…";   /* сервер думает несколько секунд — повторно не нажать */
    try {
      /* считаем ДО правки своей копии: иначе сравнивать уже не с чем */
      const переставили = !l || (data.after && data.after !== "keep") ||
                          String(l.sub || "") !== String(data.sub || "") || Number(l.block) !== Number(data.block);
      const r = await api("admin.lessonSave", { data: data });
      const fields = { block: data.block, sub: data.sub, title: data.title, kind: data.kind, url: data.url, note: data.note, ready: data.ready, active: data.active };
      if (l) Object.assign(l, fields); else d.lessons.push(Object.assign({ id: r.id, order: 99999, createdBy: APP.user.id }, fields));
      close(); PR.program = null;
      /* порядок пересчитывает сервер, но ждать его ответа 5–10 секунд нельзя:
         повторяем тот же расчёт у себя, чтобы список встал на место сразу */
      if (переставили) { matReorder(d.lessons, l ? l : d.lessons[d.lessons.length - 1], data.after); }
      admMaterials(d);
      /* сверку с сервером делает общий фоновой запрос (adminPrefetch) — отдельный тяжёлый
         запрос за материалами здесь только тормозил вкладку */
      toast(переставили && l ? "Сохранено — материал на новом месте" : "Сохранено");
    } catch (e) { btn.disabled = false; btn.textContent = "Сохранить"; fail(e); }
  });
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
  /* фильтры: кто спросил, по какому блоку, поиск по тексту, порядок */
  if (!PR.program) { try { PR.program = await api("program"); } catch (e) { /* без блоков — фильтр по блоку не покажем */ } }
  const blockOf = q => { const f = q.lessonId && lessonById(q.lessonId); return f ? f.block : null; };
  const people = [...new Set(list.map(q => q.fio).filter(Boolean))].sort((a, b) => String(a).localeCompare(b));
  const blocks = ((PR.program && PR.program.blocks) || []).filter(b => list.some(q => { const x = blockOf(q); return x && x.n === b.n; }));
  const F = ADM.qfl = ADM.qfl || {};
  const fk = box;                                              /* у «Вопросов МОПО» и «Вопросов РОПов» свои фильтры */
  F[fk] = F[fk] || { who: "", block: "", q: "", sort: "new" };
  const S = F[fk];
  if (list.length) $("#aqseg").insertAdjacentHTML("afterend", `<div class="atbar qbar">
      <select id="aqwho"><option value="">${dev ? "Все РОПы" : "Все сотрудники"}</option>${people.map(p => `<option>${esc(p)}</option>`).join("")}</select>
      <select id="aqblk"><option value="">Все блоки</option>${blocks.map(b => `<option value="${esc(b.n)}">${blockNum(b.n)}. ${esc(b.title)}</option>`).join("")}<option value="none">Общие вопросы (без урока)</option></select>
      <input type="text" id="aqq" placeholder="Поиск по тексту вопроса или ответа">
      <select id="aqsort"><option value="new">Сначала новые</option><option value="old">Сначала старые</option><option value="fio">По сотруднику (А–Я)</option></select></div>`);
  if (list.length) {
    $("#aqwho").value = S.who; $("#aqblk").value = S.block; $("#aqq").value = S.q; $("#aqsort").value = S.sort;
    $("#aqwho").onchange = e => { S.who = e.target.value; draw(); };
    $("#aqblk").onchange = e => { S.block = e.target.value; draw(); };
    $("#aqsort").onchange = e => { S.sort = e.target.value; draw(); };
    $("#aqq").oninput = e => { S.q = e.target.value; draw(); };
  }
  const draw = () => {
    $("#aqseg").querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.f === ADM.qf));
    const box2 = $("#qlist"); box2.innerHTML = "";
    const needle = String(S.q || "").trim().toLowerCase();
    const f = list.filter(q => ADM.qf === "all" || (ADM.qf === "ans" ? q.answer : !q.answer))
      .filter(q => !S.who || q.fio === S.who)
      .filter(q => { if (!S.block) return true; const x = blockOf(q); return S.block === "none" ? !x : x && String(x.n) === S.block; })
      .filter(q => !needle || [q.text, q.answer, q.lessonTitle, q.fio].join(" ").toLowerCase().includes(needle))
      .sort((x, y) => S.sort === "old" ? String(x.at).localeCompare(String(y.at))
        : S.sort === "fio" ? String(x.fio).localeCompare(y.fio) || String(y.at).localeCompare(String(x.at))
        : String(y.at).localeCompare(String(x.at)));
    if (!f.length) { box2.appendChild(el("div", "card", `<p class="hint">${S.who || S.block || needle ? "Под эти условия вопросов нет." : "Здесь пусто."}</p>`)); return; }
    f.forEach(q => {
      const c = el("div", "card note-card qitem " + (q.answer ? "answered" : "waiting"));
      c.innerHTML = `<div class="nc-head"><span class="tag ${q.answer ? "ok" : "wait"}">${q.answer ? "отвечен" : "ждёт ответа"}</span>
          <b>От: ${esc(q.fio || "—")}</b><span class="hint">${(() => { const x = blockOf(q); return x ? "блок " + blockNum(x.n) + " · " : ""; })()}${esc(q.lessonTitle || "общий вопрос")} · ${esc(dayRu(q.at))}</span></div>
        <p class="qq">${esc(q.text)}</p>
        ${q.answer ? `<div class="ans"><b>Ответ ${esc(q.answeredBy || "")}:</b><p>${esc(q.answer)}</p></div>` : ""}`;
      if (!q.answer) {
        const ta = el("textarea"); ta.placeholder = dev ? "Ответ РОПу" : "Ответ сотруднику";
        const b = el("button", "btn", "Ответить"); b.type = "button";
        b.onclick = once(async () => {
          if (!ta.value.trim()) { toast("Напишите ответ"); return; }
          try { await api("admin.answer", { id: q.id, answer: ta.value.trim() }); toast("Ответ сохранён"); refreshBadges(); admQuestions(box); }
          catch (e) { fail(e); }
        });
        c.appendChild(ta); c.appendChild(b);
      }
      box2.appendChild(c);
    });
  };
  $("#aqseg").querySelectorAll("button").forEach(b => b.onclick = () => { ADM.qf = b.dataset.f; draw(); });
  draw();
}

const PREP = { run: false, stop: false };
/* ---------- настройки ---------- */
async function admSettings() {
  const host = $("#admbody"), dev = devUI();
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
      <div id="drvres"></div></div>

    <div class="card" id="prepcard"><h2>Обновление копий таблиц</h2>
      <p class="lead">Каждый лист таблицы сервис печатает в PDF и хранит у себя — поэтому таблицы открываются сразу.
        Если таблицу поправили, копия устаревает: сервис перепечатает её сам при следующем открытии, но тогда первый сотрудник подождёт.
        Кнопка ниже готовит копии заранее.</p>
      <div id="prepstat" class="hint">Смотрим, что готово…</div>
      <div class="foot prepfoot"><button class="btn white" id="prep" type="button">Подготовить копии</button>
        <button class="btn white" id="prepcheck" type="button" title="Пройти по таблицам и посмотреть, у каких листов копии устарели">Проверить, что устарело</button></div>
      <div class="prepopts">
        <label class="chk"><input type="checkbox" id="prepall"><span>перепечатать все заново</span></label>
        ${dev ? '<label class="chk"><input type="checkbox" id="prepauto"><span>обновлять копии ночью автоматически</span></label>' : ""}</div>
      <p class="hint tiny">Готовые листы пропускаются — печатаются только новые и изменённые. Во время работы кнопка становится
        «Остановить»: можно прерваться и продолжить позже с того же места.${dev ? " Ночное обновление запускается в 3:00 и само доделывает остаток." : ""}</p>
      <div id="prepres"></div></div>

    ${dev ? `<div class="card" id="acccard"><h2>Доступ сотрудников к самим документам</h2>
      <p class="lead">Обычно сотрудник видит только копии в кабинете. Когда обучение пройдено, можно открыть ему чтение самих файлов
        на Диске — выбрать нужные галочками и нажать «Открыть». Так же одной кнопкой доступ закрывается.</p>
      <div class="tbar">
        <label class="f">Почта сотрудника</label>
        <input type="text" id="accmail" placeholder="ivanov@gmail.com" style="max-width:280px">
      </div>
      <div class="foot"><button class="btn white" id="accload" type="button">Показать список файлов</button></div>
      <div id="accres"></div></div>` : ""}`;

  $("#drvcheck").onclick = () => drvStatus();
  if ($("#accload")) $("#accload").onclick = () => accFiles();
  $("#csave").onclick = once(async () => {
    const g = $("#wagroup").value.trim();
    if (g && !/^https:\/\/chat\.whatsapp\.com\/\S+$/.test(g)) return toast("Ссылка на группу должна начинаться с https://chat.whatsapp.com/");
    try {
      await api("admin.setting", { key: "waGroup", value: g });
      if (PR.progress) PR.progress.waGroup = g;
      toast("Сохранено");
    } catch (e) { fail(e); }
  });

  /* быстрый ответ: включено ли ночное обновление и что известно о копиях */
  (async () => {
    try {
      const st = await api("admin.prepAutoStat");
      const ab = $("#prepauto");
      if (ab) {
        ab.checked = !!st.auto;
        if (st.auto === null) {                          /* Google ещё не дал разрешение на расписание */
          ab.closest("label").insertAdjacentHTML("afterend",
            '<span class="hint tiny">Чтобы включить ночное обновление, в редакторе скрипта выберите функцию prepNightly, нажмите «Выполнить» и разрешите доступ.</span>');
        }
      }
      await prepStat();                                  /* строку состояния рисует общая функция */
    } catch (e) { $("#prepstat").textContent = "Не удалось узнать состояние копий: " + (e.message || e); }
  })();

  if ($("#prepauto")) $("#prepauto").onchange = async () => {
    const box = $("#prepauto");
    box.disabled = true;
    try { await api("admin.prepAuto", { on: box.checked }); toast(box.checked ? "Ночное обновление включено — каждый день в 3:00" : "Ночное обновление выключено"); }
    catch (e) { fail(e); box.checked = !box.checked; }
    box.disabled = false;
  };

  const prepStat = async (heavy) => {                    /* строка «копии устарели у…»: лёгкий запрос, тяжёлый — по кнопке */
    try {
      const st = await api(heavy ? "admin.prepStat" : "admin.prepAutoStat");
      const l = heavy ? st : st.light;
      if (!l) { $("#prepstat").textContent = "Сколько листов готово — нажмите «Проверить, что устарело»."; return; }
      const ждут = Number(l.picSheets) || 0;                       /* листы, где копия есть, но не хватает снимков */
      const старые = Math.max(0, (Number(l.left) || 0) - ждут);
      $("#prepstat").innerHTML = (l.left
        ? `<b class="inl">Не готовы ${l.left} из ${l.total} листов.</b>` +
          (старые ? ` Копии устарели: ${старые}.` : "") + (l.ready != null ? " Готовых: " + l.ready + "." : "")
        : `Все ${l.total} листов готовы — сотрудники открывают таблицы сразу.`) +
        (l.picsLeft ? `<br>Ждут фото: ${l.picsLeft} ${plural(l.picsLeft, "снимок", "снимка", "снимков")} на ${l.picSheets} ${plural(l.picSheets, "листе", "листах", "листах")}.` : "") +
        (l.store === false ? ` <span class="hint tiny">Копии хранятся временно (около 6 часов): у сервиса нет разрешения сохранять файлы на Диск.</span>` : "");
    } catch (e) { /* не страшно: строка останется прежней */ }
  };

  $("#prepcheck").onclick = async () => {
    const b = $("#prepcheck");
    b.disabled = true; b.textContent = "Проверяем…";
    await prepStat(true);
    b.disabled = false; b.textContent = "Проверить, что устарело";
  };

  $("#prep").onclick = async () => {
    const b = $("#prep"), box = $("#prepres"), force = $("#prepall") && $("#prepall").checked;
    if (PREP.run) { PREP.stop = true; b.textContent = "Останавливаем…"; return; }
    PREP.run = true; PREP.stop = false;
    b.textContent = "Остановить";
    const t0 = Date.now();
    const mmss = ms => (ms >= 60000 ? Math.floor(ms / 60000) + " мин " : "") + Math.round(ms % 60000 / 1000) + " сек";
    let ready = 0, skip = 0, bad = [], total = 0, from = 0, last = "", pics = 0, picLast = "", picLeft = 0, plan = 0, more = true, rowsNote = "", note = "запрашиваем список листов…";
    let подряд = 0, молчит = false;                      /* сколько листов подряд сервер не ответил */
    const paint = () => {
      const gone = Date.now() - t0;
      const per = ready ? gone / ready : 0;
      const left = plan ? Math.max(0, plan - ready) : 0;         /* считаем по тем, что реально надо подготовить */
      box.innerHTML = `<p class="hint"><b>Напечатано: ${ready}${plan ? " из " + plan : ""}</b>${skip ? " · пропущено готовых: " + skip : ""}<br>
        ${rowsNote ? "<b>Длинный лист:</b> " + esc(rowsNote) + "<br>" : ""}
        ${pics ? "<b>Фото добавлено: " + pics + "</b>" + (picLast ? " — лист «" + esc(picLast) + "»" : "") + (picLeft ? ", осталось " + picLeft : "") + "<br>" : ""}
        Идёт ${mmss(gone)}${per && left ? " · осталось примерно " + mmss(per * left) : ""}<br>
        ${esc(note)}${last ? "<br>Последний готовый: " + esc(last) : ""}${bad.length ? "<br>Не получилось: " + bad.length : ""}</p>`;
    };
    paint();
    const tick = setInterval(paint, 1000);              /* время идёт, даже пока ждём ответ сервера */
    try { const st0 = await api("admin.prepAutoStat"); if (st0 && st0.light) plan = st0.light.left; } catch (e) { /* посчитаем по ходу */ }
    try {
      do {
        note = "печатаем лист… первый лист большой таблицы может готовиться до минуты";
        let r = null, tries = 0, err = null;
        while (!r && tries < 3) {
          tries++;
          try { r = await api("admin.prepare", { from: from, count: 1, force: force }); }
          catch (e) { err = e; note = "сервер не ответил, пробуем ещё раз (" + tries + " из 3)"; paint(); await new Promise(res => setTimeout(res, 1500 * tries)); }
        }
        if (!r) {                                         /* лист не дался три раза — пропускаем его и идём дальше */
          bad.push("лист №" + (from + 1) + " в списке — " + ((err && err.message) || "сервер не ответил") +
            ". Какой именно — покажет кнопка «Проверить, что устарело»");
          подряд++;
          if (подряд >= 3) { молчит = true; paint(); break; }   /* три листа подряд молчат — дело не в листах, а в связи */
          from = from + 1; more = total ? from < total : true;
          note = "пропустили лист, который не отвечает";
          paint();
          if (!more) break;
          continue;
        }
        подряд = 0;
        more = !!r.more;
        total = r.total || total;
        (r.items || []).forEach(x => {
          if (x.state === "ready" || x.state === "cached") { ready++; last = x.title; }
          else if (x.state === "pics") { pics += (x.added || 0); picLeft = x.left || 0; picLast = x.title;
            if (!x.left) { ready++; last = x.title; }          /* фото досталили — лист готов целиком */ note = "подставляем фото в лист «" + x.title + "»"; }
          else if (x.state === "more") { rowsNote = "лист «" + x.title + "»: собрано строк " + (x.rows || "…") + (x.rowsAll ? " из " + x.rowsAll : "");
            note = "длинный лист собираем частями по 600 строк — " + rowsNote; }
          else if (x.state === "skip") skip++;
          else bad.push(x.title + (x.why ? " — " + x.why : ""));
        });
        note = "";
        paint();
        if ((ready + skip) % 10 === 0) prepStat();           /* обновляем строку «копии устарели у…» по ходу */
        from = r.next || 0;
      } while (more && !PREP.stop);        /* лист с фото возвращает тот же номер — идём по нему дальше */
      note = молчит ? "Сервер не отвечает — остановились. Проверьте связь и нажмите кнопку ещё раз: продолжим с этого места."
           : PREP.stop ? "Остановлено. Нажмите кнопку ещё раз — продолжим с этого места." : "Готово.";
      paint(); prepStat();
      if (bad.length) box.insertAdjacentHTML("beforeend",
        `<div class="note warn">Не удалось напечатать ${bad.length}:<ul>${bad.slice(0, 12).map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>`);
    } catch (e) {
      note = "Остановились: " + (e.message || e) + ". Нажмите кнопку ещё раз — продолжим с этого места.";
      paint(); prepStat();
    }
    clearInterval(tick);
    PREP.run = false; b.disabled = false; b.textContent = "Подготовить копии";
  };
}

/* список всех файлов программы и ссылок: галочки + «Открыть» / «Закрыть» доступ конкретному сотруднику */
const ACC = { from: 0 };                                  /* проверка доступа сотрудника — место обрыва */

async function accFiles() {
  const box = $("#accres"), btn = $("#accload");
  btn.disabled = true; btn.textContent = "Загружаем…";
  let r;
  try { r = await api("admin.files"); } catch (e) { btn.disabled = false; btn.textContent = "Показать список файлов"; return fail(e); }
  btn.disabled = false; btn.textContent = "Обновить список";
  const files = r.files || [];
  const group = (t, list) => list.length ? `<div class="accgrp"><b>${esc(t)}</b> <button type="button" class="link" data-all="${esc(t)}">выбрать все</button>
    ${list.map(f => `<div class="accrow"><label><input type="checkbox" value="${esc(f.id)}" data-g="${esc(t)}"> <span>${esc(f.title)}</span></label>
      <a href="${esc(f.url || ("https://drive.google.com/open?id=" + f.id))}" target="_blank" rel="noopener">открыть ↗</a>
      <i class="accmark" data-id="${esc(f.id)}"></i></div>`).join("")}</div>` : "";
  box.innerHTML = `<div class="acc">
    ${group("Материалы программы", files.filter(f => !f.video && !f.link))}
    ${group("Документы по ссылкам", files.filter(f => f.link))}
    ${group("Видео", files.filter(f => f.video))}
    <div class="foot"><button class="btn green" id="accopen" type="button">Открыть доступ</button>
      <button class="btn white" id="accclose" type="button">Закрыть доступ</button>
      <button class="btn white" id="acccheck" type="button">Показать, что уже открыто</button>
      <span class="hint tiny" id="accinfo"></span></div></div>`;
  box.querySelectorAll("[data-all]").forEach(b => b.onclick = () => {
    const on = [...box.querySelectorAll(`input[data-g="${b.dataset.all}"]`)].some(x => !x.checked);
    box.querySelectorAll(`input[data-g="${b.dataset.all}"]`).forEach(x => x.checked = on);
  });
  const run = async open => {
    const mail = $("#accmail").value.trim();
    const ids = [...box.querySelectorAll("input:checked")].map(x => x.value);
    if (!mail) return toast("Впишите почту сотрудника");
    if (!ids.length) return toast("Отметьте галочками файлы");
    if (!open && !await ask({ title: "Закрыть доступ?", text: `Сотрудник ${esc(mail)} перестанет видеть ${ids.length} файлов на Диске.`, ok: "Закрыть", danger: true })) return;
    const b1 = $("#accopen"), b2 = $("#accclose"), info = $("#accinfo");
    b1.disabled = b2.disabled = true;
    let from = 0, done = 0, fail2 = [];
    try {
      do {
        const part = await api("admin.fileAccess", { data: { email: mail, ids: ids, open: open, from: from, count: 10 } });
        done += part.done; fail2 = fail2.concat(part.fail || []);
        info.textContent = (open ? "Открываем… " : "Закрываем… ") + (done + fail2.length) + " из " + ids.length;
        from = part.next || 0;
      } while (from);
      info.textContent = (open ? "Открыто: " : "Закрыто: ") + done + " из " + ids.length + (fail2.length ? ". Не вышло: " + fail2.length : "");
      if (fail2.length) box.insertAdjacentHTML("beforeend", `<div class="note warn">Не получилось у ${fail2.length}: сервис не может делиться чужими файлами.
        <ul>${fail2.slice(0, 10).map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>`);
    } catch (e) { fail(e); }
    b1.disabled = b2.disabled = false;
  };
  $("#accopen").onclick = () => run(true);
  $("#accclose").onclick = () => run(false);
  $("#acccheck").onclick = async () => {                 /* отмечаем зелёным то, к чему у сотрудника уже есть доступ */
    const mail = $("#accmail").value.trim();
    if (!mail) return toast("Впишите почту сотрудника");
    const b = $("#acccheck"), info = $("#accinfo");
    b.disabled = true;
    let from = ACC.from;                                 /* если прошлый раз оборвался — идём дальше с того же места */
    if (!from) box.querySelectorAll(".accmark").forEach(m => { m.textContent = ""; m.className = "accmark"; });
    while (true) {
      let part = null, беда = null;
      for (let try_ = 1; try_ <= 3 && !part; try_++) {    /* порция могла не успеть — повторяем, не теряя пройденное */
        try { part = await api("admin.fileWho", { data: { email: mail, from: from, count: try_ === 1 ? 10 : 4 } }); }
        catch (e) { беда = e; info.textContent = "Повторяем… " + from; await new Promise(r => setTimeout(r, 1200 * try_)); }
      }
      if (!part) {
        ACC.from = from; b.disabled = false; b.textContent = "Продолжить проверку";
        info.textContent = "Прервалось на " + from + " — нажмите «Продолжить проверку»";
        return fail(беда);
      }
      (part.has || []).forEach(id => {
        const m = box.querySelector(`.accmark[data-id="${id}"]`);
        if (m) { m.textContent = "открыт"; m.className = "accmark on"; }
      });
      info.textContent = "Проверяем… " + (part.done || from) + " из " + part.total;
      from = part.next || 0;
      if (!from) break;
    }
    ACC.from = 0; b.textContent = "Показать, что уже открыто";
    info.textContent = "Уже открыто файлов: " + box.querySelectorAll(".accmark.on").length;
    b.disabled = false;
  };
}

const DRV = { files: [], from: 0, account: "", total: 0, driveApi: false };   /* чтобы продолжать проверку с места обрыва */

/* доступ сервиса к файлам программы: чего не хватает и кнопки для видео */
async function drvStatus() {
  const box = $("#drvres"), btn = $("#drvcheck");
  btn.disabled = true; btn.textContent = "Проверяем…";
  /* файлов больше сотни — спрашиваем порциями, чтобы сервер успевал ответить.
     Если порция сорвалась, повторяем её и продолжаем с места обрыва, а не с нуля. */
  let r = DRV.files.length ? { account: DRV.account, total: DRV.total, driveApi: DRV.driveApi, files: DRV.files.slice() } : null;
  let from = DRV.from, стоп = false;
  while (!стоп) {
    let part = null, беда = null;
    for (let try_ = 1; try_ <= 3 && !part; try_++) {          /* три попытки: связь и Google иногда отвечают не сразу */
      try { part = await api("admin.driveStatus", { from: from, count: try_ === 1 ? 12 : 5 }); }
      catch (e) {
        беда = e;
        btn.textContent = "Повторяем… " + from + " из " + (r && r.total ? r.total : "?");
        await new Promise(res => setTimeout(res, 1200 * try_));
      }
    }
    if (!part) {                                              /* совсем не отвечает — сохраняем, что проверили */
      DRV.account = r && r.account; DRV.total = r && r.total; DRV.driveApi = r && r.driveApi;
      DRV.files = r ? r.files : []; DRV.from = from;
      btn.disabled = false; btn.textContent = "Продолжить проверку";
      box.innerHTML = `<div class="note warn">Проверено ${plural(from, "файл", "файла", "файлов")}${r && r.total ? " из " + r.total : ""}, дальше сервер не ответил.
        Нажмите «Продолжить проверку» — сервис пойдёт дальше с этого места.</div>`;
      return fail(беда);
    }
    if (!Array.isArray(part.files)) { r = part; break; }
    r = r ? { account: part.account, total: part.total, driveApi: part.driveApi, files: r.files.concat(part.files) }
          : { account: part.account, total: part.total, driveApi: part.driveApi, files: part.files };
    btn.textContent = "Проверяем… " + r.files.length + " из " + (part.total || "?");
    box.innerHTML = `<p class="hint">Проверено ${r.files.length} из ${part.total || "?"} — файлов много, это занимает до минуты.</p>`;
    from = part.next || 0;
    if (!from) стоп = true;
  }
  DRV.files = []; DRV.from = 0;                               /* дошли до конца — продолжать нечего */
  btn.disabled = false; btn.textContent = "Проверить ещё раз";
  if (!r || !Array.isArray(r.files)) {                      /* неожиданный ответ — показываем как есть, чтобы понять причину */
    box.innerHTML = `<div class="note warn">Сервер ответил не так, как ожидалось. Пришлите разработчику текст ниже:<pre class="drvraw">${esc(JSON.stringify(r).slice(0, 600))}</pre></div>`;
    return;
  }
  const docs = r.files.filter(f => !f.video), vids = r.files.filter(f => f.video);
  const noDoc = docs.filter(f => !f.ok), noVid = vids.filter(f => !f.ok);
  const open = vids.filter(f => f.ok && f.access === "ANYONE_WITH_LINK").length;
  const dev = devUI();
  box.innerHTML = `<div class="drv">
    <p>Кабинет работает от почты <b class="inl">${esc(r.account || "—")}</b>. Проверено файлов: ${r.files.length} — это материалы программы
      и документы, на которые они ссылаются изнутри (их сервис тоже открывает сотруднику).</p>
    <p><b class="inl">Документы, таблицы, презентации:</b> ${docs.length - noDoc.length} из ${docs.length} доступны.</p>
    ${noDoc.length ? `<div class="note warn">Нет доступа к ${plural(noDoc.length, "файлу", "файлам", "файлам")} — откройте их для ${esc(r.account)} с правом «Читатель»
      (проще всего — всю папку с материалами разом). Ссылка открывает сам файл — в нём «Поделиться» → добавьте почту выше:
      <ul>${noDoc.map(f => `<li>${esc(f.title)}${f.link ? " <i>(ссылка внутри другого документа)</i>" : ""} — <a href="https://drive.google.com/open?id=${esc(f.id)}" target="_blank" rel="noopener">открыть файл</a></li>`).join("")}</ul></div>` : ""}
    <p><b class="inl">Видео:</b> ${vids.length} в программе, открыто по ссылке — ${open}.</p>
    ${noVid.length ? `<div class="note warn">Нет доступа к ${plural(noVid.length, "видео", "видео", "видео")} — откройте ${esc(r.account)} хотя бы «Читатель»:
      <ul>${noVid.map(f => `<li>${esc(f.title)}</li>`).join("")}</ul></div>` : ""}
    <p class="hint tiny">Чтобы сотрудник смотрел видео, права «Редактор» не нужны — достаточно, чтобы видео было открыто по ссылке.
      «Редактор» нужен только кнопке ниже: она сама меняет доступ у файлов. Если его не хватит, кнопка перечислит, где именно.</p>
    ${dev ? `<div class="foot"><button class="btn green" id="vopen" type="button">Открыть видео по ссылке</button>
      <button class="btn white" id="vclose" type="button">Закрыть видео</button></div>
      <p class="hint tiny">«Открыть» — все видео программы смотрятся по ссылке, только просмотр. Ссылки видят лишь те, кто вошёл в кабинет.
        «Закрыть» — снова только для вас.${r.driveApi ? " Скачивание при этом запрещено." : ' Чтобы кнопка ещё и запрещала скачивание, в редакторе скрипта откройте «Сервисы» (слева, значок «+» рядом со словом «Сервисы») и добавьте Drive API.'}</p>` : ""}
  </div>`;
  const va = async open => {
    const b = $(open ? "#vopen" : "#vclose"), other = $(open ? "#vclose" : "#vopen");
    b.disabled = other.disabled = true;
    let from = 0, done = 0, bad = [], total = 0, noDownload = true;
    try {
      do {                                              /* по 8 видео за запрос: иначе Google не успевает ответить */
        const x = await api("admin.videoAccess", { open: open, from: from, count: 8 });
        done += x.done; bad = bad.concat(x.fail || []); total = x.total || total; noDownload = x.noDownload;
        b.textContent = (open ? "Открываем… " : "Закрываем… ") + (done + bad.length) + " из " + total;
        from = x.next || 0;
      } while (from);
      toast((open ? "Открыто видео: " : "Закрыто видео: ") + done + " из " + total + (bad.length ? ", не вышло: " + bad.length : "") +
        (open && !noDownload ? ". Скачивание не запрещено — подключите Drive API" : ""));
      if (bad.length) $("#drvres").insertAdjacentHTML("beforeend",
        `<div class="note warn">Не удалось изменить ${bad.length}: у почты кабинета нет права «Редактор» на эти файлы.
          <ul>${bad.slice(0, 10).map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>`);
      drvStatus();
    } catch (e) { fail(e); }
    b.disabled = other.disabled = false;
    b.textContent = open ? "Открыть видео по ссылке" : "Закрыть видео";
  };
  if (dev) { $("#vopen").onclick = () => va(true); $("#vclose").onclick = () => va(false); }
}
