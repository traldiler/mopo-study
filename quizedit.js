/* Редактор мини-тестов для РОПа и разработчика.
   Исходные тесты не трогаем: каждая правка сохраняется новой версией, исходный вариант можно вернуть. */
const QE_TYPES = { single: "Один ответ", multi: "Несколько ответов", odd: "Убрать лишнее", match: "Соответствие" };

async function quizEditor({ quizId, sub, block, topic, lessons, onDone, mode, baseN }) {
  const exam = mode === "exam";
  let Q, stats = { tried: 0, passed: 0, retake: 0 }, source = null;
  try {
    if (exam) {
      const r = await api("admin.examGet", { sub: sub });
      Q = { include: r.include, questions: r.questions || [], locked: r.locked || [], demoNoKey: r.demoNoKey, editedAt: r.at, editedBy: r.by };
      if (quizId) source = (await api("admin.quizGet", { id: quizId })).quiz;
    } else if (quizId) { const r = await api("admin.quizGet", { id: quizId }); Q = JSON.parse(JSON.stringify(r.quiz)); stats = r.stats || stats; }
    else Q = { id: "", title: "Мини-тест: " + topic, pass: 3, version: 0, edited: false, original: false, questions: [qeBlank("single")] };
  } catch (e) { return fail(e); }
  Q.questions.forEach(x => { if (x.type !== "match") x.answer = [].concat(x.answer || []).map(String); });

  const back = el("div", "modal-back");
  back.innerHTML = `<div class="modal quizform" role="dialog" aria-modal="true">
    <div class="qe-top"><div><div class="flab">${exam ? "Вопросы в экзамене" : quizId ? "Мини-тест" : "Новый мини-тест"}</div><div class="qe-h">${esc(topic)}</div></div>
      <button class="x" type="button" data-a="0" title="Закрыть">×</button></div>
    ${exam ? `<div class="qe-meta">Здесь все вопросы экзамена по этим материалам — исходные и добавленные. Правьте, удаляйте, меняйте порядок и добавляйте, как в мини-тесте.
        Исправление сразу увидят те, кто начнёт экзамен после сохранения; прежние попытки остаются как были.${Q.editedBy ? ` Последняя правка: ${esc(Q.editedBy)}${Q.editedAt ? ", " + esc(dayRu(Q.editedAt)) : ""}.` : ""}</div>
      <label class="fck qe-inc"><input type="checkbox" id="qeinc" ${Q.include ? "checked" : ""}><u></u>Включить в экзамен</label>
      ${Q.demoNoKey ? `<div class="note warn">Демо: правильные ответы исходных вопросов знает только сервер, поэтому здесь они не отмечены. В рабочей версии отметки придут вместе с вопросами. Чтобы сохранить в демо — отметьте ответы сами.</div>` : ""}
      ${Q.locked.length ? `<details class="qe-locked"><summary>Ещё ${plural(Q.locked.length, "задание", "задания", "заданий")} только для просмотра — развёрнутый ответ или тренажёр</summary>
        ${Q.locked.map(x => `<div class="qe-lock"><span class="tag">${{ short: "развёрнутый ответ", sim_dsk: "тренажёр ДСК", sim_pick: "подбор оборудования", sim_chat: "переписка с клиентом" }[x.type] || x.type}${x.points > 1 ? " · " + x.points + " балла" : ""}</span>${esc(x.text)}</div>`).join("")}
        <p class="hint tiny">Такие задания проверяются по-особому (ИИ или схема), поэтому меняются в исходных файлах экзамена — напишите разработчику.</p></details>` : ""}`
    : `<div class="qe-meta">${quizId ? `${Q.edited ? `Изменён${Q.editedBy ? " · " + esc(Q.editedBy) : ""}${Q.editedAt ? " · " + esc(dayRu(Q.editedAt)) : ""}` : "Исходный вариант"}
      · проходили: ${stats.tried} · сдали: ${stats.passed}${stats.retake ? ` · ждут пересдачи: ${stats.retake}` : ""}` : "Тест появится у сотрудников в конце темы сразу после сохранения."}</div>
    <div class="qe-head">
      <div><label class="f">Название</label><input type="text" id="qetitle" value="${esc(Q.title || "")}"></div>
      <div><label class="f">Порог сдачи</label><select id="qepass"></select></div>
    </div>`}
    <div id="qelist"></div>
    <div class="qe-addrow"><button class="btn white qe-add" type="button" id="qeadd">＋ Написать вопрос</button>
      ${exam && source ? '<button class="btn white qe-add" type="button" id="qefrom">＋ Взять из мини-теста темы</button>' : ""}</div>
    <div class="mbtns">${!exam && Q.edited && Q.original ? '<button class="btn ghost" type="button" data-a="reset" style="margin-right:auto">Вернуть исходный тест</button>' : ""}
      <button class="btn ghost" type="button" data-a="0">Отмена</button>
      <button class="btn" type="button" data-a="1">${exam ? "Сохранить" : "Сохранить тест"}</button></div></div>`;
  document.body.appendChild(back); lockScroll(true);
  const $$ = s => back.querySelector(s), close = () => { back.remove(); lockScroll(false); };
  const refs = (lessons || []).filter(l => l.id);

  const fillPass = () => {
    if (exam) return;
    const n = Q.questions.length, sel = $$("#qepass");
    Q.pass = Math.min(Math.max(1, Number(Q.pass) || 1), Math.max(1, n));
    sel.innerHTML = Array.from({ length: Math.max(1, n) }, (_, i) => `<option value="${i + 1}">${i + 1} из ${n} верных</option>`).join("");
    sel.value = Q.pass;
  };
  const draw = () => {
    const host = $$("#qelist"); host.innerHTML = "";
    if (exam && !Q.questions.length) host.appendChild(el("p", "hint qe-empty", source
      ? "Вопросов пока нет. Возьмите их из мини-теста темы или напишите свои."
      : "Вопросов пока нет. Напишите их — у темы нет мини-теста, из которого можно взять."));
    Q.questions.forEach((x, i) => host.appendChild(qeCard(x, i)));
    fillPass();
  };
  const qeCard = (x, i) => {
    const c = el("div", "qe");
    const markType = x.type === "multi" ? "checkbox" : "radio";
    c.innerHTML = `<div class="qe-row"><span class="qe-n">Вопрос ${i + 1}</span>${exam ? (x.orig ? '<span class="tag">из исходного экзамена</span>' : '<span class="tag ok">добавлен</span>') : ""}${x.points > 1 ? `<span class="tag">${x.points} балла</span>` : ""}
        <select data-k="type">${Object.keys(QE_TYPES).map(t => `<option value="${t}">${QE_TYPES[t]}</option>`).join("")}</select>
        <span class="qe-tools"><button type="button" data-m="-1" title="Выше" ${i ? "" : "disabled"}>↑</button>
          <button type="button" data-m="1" title="Ниже" ${i < Q.questions.length - 1 ? "" : "disabled"}>↓</button>
          <button type="button" data-del="1" class="qe-del" title="Удалить вопрос">Удалить</button></span></div>
      <textarea data-k="text" rows="2" placeholder="Текст вопроса">${esc(x.text || "")}</textarea>
      ${x.type === "match"
        ? `<div class="qe-sub">Пары: слева — понятие, справа — верное к нему. Сотрудник увидит правые части вперемешку.</div>
           ${(x.pairs || []).map((p, j) => `<div class="qe-pair"><input type="text" data-pl="${j}" value="${esc(p.l)}" placeholder="Слева">
             <span>→</span><input type="text" data-pr="${j}" value="${esc(p.r)}" placeholder="Справа">
             <button type="button" class="qe-x" data-rp="${j}" title="Убрать пару">×</button></div>`).join("")}
           <button type="button" class="link" data-addp="1">＋ пара</button>`
        : `<div class="qe-sub">${x.type === "odd" ? "Отметьте кружком вариант, который выпадает из ряда." : x.type === "multi" ? "Отметьте галочками все верные варианты." : "Отметьте кружком верный вариант."}</div>
           ${(x.options || []).map((o, j) => `<label class="qe-opt${x.answer.includes(String(o.id)) ? " on" : ""}">
             <input type="${markType}" name="qe-${i}" data-ans="${esc(o.id)}" ${x.answer.includes(String(o.id)) ? "checked" : ""}>
             <input type="text" data-ot="${j}" value="${esc(o.t)}" placeholder="Вариант ответа">
             <button type="button" class="qe-x" data-ro="${j}" title="Убрать вариант">×</button></label>`).join("")}
           <button type="button" class="link" data-addo="1">＋ вариант</button>`}
      <label class="f">Пояснение, если ответили неверно</label>
      <textarea data-k="explain" rows="2" placeholder="Как правильно и почему — сотрудник увидит после проверки">${esc(x.explain || "")}</textarea>
      <label class="f">Где перечитать</label>
      <select data-k="ref"><option value="">— не указывать —</option>${refs.map(l => `<option value="${esc(l.id)}">${esc(l.title)}</option>`).join("")}</select>`;
    c.querySelector('[data-k="type"]').value = x.type;
    c.querySelector('[data-k="ref"]').value = x.ref && x.ref.id && refs.some(l => l.id === x.ref.id) ? x.ref.id : "";
    c.querySelector('[data-k="type"]').onchange = e => {
      const t = e.target.value;
      if ((t === "match") !== (x.type === "match")) {
        if (t === "match") { x.pairs = x.pairs && x.pairs.length ? x.pairs : [{ l: "", r: "" }, { l: "", r: "" }]; }
        else { x.options = x.options && x.options.length ? x.options : qeBlank("single").options; x.answer = []; }
      }
      if (t !== "multi" && x.answer && x.answer.length > 1) x.answer = x.answer.slice(0, 1);
      x.type = t; draw();
    };
    c.querySelector('[data-k="text"]').oninput = e => { x.text = e.target.value; };
    c.querySelector('[data-k="explain"]').oninput = e => { x.explain = e.target.value; };
    c.querySelector('[data-k="ref"]').onchange = e => {
      const l = refs.filter(r => r.id === e.target.value)[0];
      x.ref = l ? { id: l.id, title: l.title } : null;
    };
    c.querySelectorAll("[data-m]").forEach(b => b.onclick = () => {
      const j = i + Number(b.dataset.m); [Q.questions[i], Q.questions[j]] = [Q.questions[j], Q.questions[i]]; draw();
    });
    c.querySelector("[data-del]").onclick = async () => {
      if (!exam && Q.questions.length === 1) return toast("В тесте должен остаться хотя бы один вопрос");
      if ((x.text || "").trim() && !await ask({ title: "Удалить вопрос?", danger: true, ok: "Удалить", text: esc(x.text.slice(0, 160)) })) return;
      Q.questions.splice(i, 1); draw();
    };
    c.querySelectorAll("[data-ot]").forEach(inp => inp.oninput = () => { x.options[+inp.dataset.ot].t = inp.value; });
    c.querySelectorAll("[data-ans]").forEach(inp => inp.onchange = () => {
      const id = inp.dataset.ans;
      x.answer = x.type === "multi" ? (inp.checked ? [...new Set(x.answer.concat(id))] : x.answer.filter(a => a !== id)) : [id];
      c.querySelectorAll(".qe-opt").forEach(l => l.classList.toggle("on", l.querySelector("[data-ans]").checked));
    });
    c.querySelectorAll("[data-ro]").forEach(b => b.onclick = e => {
      e.preventDefault();
      if (x.options.length <= 2) return toast("Нужно минимум два варианта");
      const o = x.options.splice(+b.dataset.ro, 1)[0]; x.answer = x.answer.filter(a => a !== String(o.id)); draw();
    });
    const addo = c.querySelector("[data-addo]");
    if (addo) addo.onclick = () => { x.options.push({ id: qeOptId(x.options), t: "" }); draw(); };
    c.querySelectorAll("[data-pl]").forEach(inp => inp.oninput = () => { x.pairs[+inp.dataset.pl].l = inp.value; });
    c.querySelectorAll("[data-pr]").forEach(inp => inp.oninput = () => { x.pairs[+inp.dataset.pr].r = inp.value; });
    c.querySelectorAll("[data-rp]").forEach(b => b.onclick = () => {
      if (x.pairs.length <= 2) return toast("Нужно минимум две пары");
      x.pairs.splice(+b.dataset.rp, 1); draw();
    });
    const addp = c.querySelector("[data-addp]");
    if (addp) addp.onclick = () => { x.pairs.push({ l: "", r: "" }); draw(); };
    return c;
  };

  /* уже сдавшие: оставить зачёт или попросить пересдать */
  const askRetake = async what => {
    const done = stats.passed + stats.retake;
    if (!done) return false;
    return choose({ title: `Этот тест уже сдали: ${plural(stats.passed, "сотрудник", "сотрудника", "сотрудников")}`,
      text: `<p>Что сделать с их сдачей после того, как вы ${what}?</p>
        <ul class="qe-choice"><li><b>Оставить зачёт</b> — если поправили опечатку или формулировку. Для сдавших ничего не меняется.</li>
        <li><b>Попросить пересдать</b> — если тест изменился по сути. У сдавших тема снова станет незакрытой с пометкой «тест обновили». Следующие блоки у них останутся открытыми, но к экзамену допуск будет только после пересдачи. Прежние результаты и разборы сохранятся.</li></ul>`,
      buttons: [{ label: "Отмена", cls: "ghost", value: null }, { label: "Попросить пересдать", cls: "blue", value: "retake" }, { label: "Оставить зачёт", cls: "green", value: "keep" }] })
      .then(v => v === null ? null : v === "retake");
  };

  if (!exam) {
    $$("#qetitle").oninput = e => { Q.title = e.target.value; };
    $$("#qepass").onchange = e => { Q.pass = Number(e.target.value); };
  } else $$("#qeinc").onchange = e => { Q.include = e.target.checked; };
  $$("#qeadd").onclick = () => { Q.questions.push(qeBlank("single")); draw(); back.querySelector(".qe:last-child textarea").focus(); };
  if ($$("#qefrom")) $$("#qefrom").onclick = async () => {
    const have = new Set(Q.questions.map(x => String(x.text || "").trim()));
    const list = source.questions;
    const picked = await new Promise(res => {
      const pb = el("div", "modal-back");
      pb.innerHTML = `<div class="modal wide" role="dialog" aria-modal="true"><b>Вопросы из мини-теста</b>
        <p class="hint">Отметьте, какие вопросы добавить в экзамен. Потом их можно поправить — мини-тест от этого не изменится.</p>
        <div class="qe-pick">${list.map((x, i) => { const on = have.has(String(x.text).trim()); return `<label class="fck${on ? " dis" : ""}"><input type="checkbox" data-i="${i}" ${on ? "checked disabled" : ""}><u></u>
          <span>${esc(x.text)}<small>${QE_TYPES[x.type] || x.type}${on ? " · уже в экзамене" : ""}</small></span></label>`; }).join("")}</div>
        <div class="mbtns"><button class="btn ghost" type="button" data-a="0">Отмена</button>
          <button class="btn ghost" type="button" data-a="all">Отметить все</button>
          <button class="btn" type="button" data-a="1">Добавить выбранные</button></div></div>`;
      const done = v => { pb.remove(); lockScroll(false); res(v); };
      pb.querySelector('[data-a="0"]').onclick = () => done([]);
      pb.querySelector('[data-a="all"]').onclick = () => pb.querySelectorAll("input:not(:disabled)").forEach(c => c.checked = true);
      pb.querySelector('[data-a="1"]').onclick = () => done([...pb.querySelectorAll("input:checked:not(:disabled)")].map(c => list[+c.dataset.i]));
      document.body.appendChild(pb); lockScroll(true);
    });
    picked.forEach(x => {
      const c = JSON.parse(JSON.stringify(x));
      c.id = "e" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      if (c.type !== "match") c.answer = [].concat(c.answer || []).map(String);
      Q.questions.push(c);
    });
    if (picked.length) { Q.include = true; $$("#qeinc").checked = true; draw(); toast(plural(picked.length, "вопрос добавлен", "вопроса добавлено", "вопросов добавлено")); }
  };
  back.querySelectorAll('[data-a="0"]').forEach(b => b.onclick = close);
  $$('[data-a="1"]').onclick = async () => {
    if (exam) {
      const err = Q.questions.length ? quizCheck({ questions: Q.questions, pass: 1 }) : "";
      if (err) {
        toast(err);
        const m = err.match(/^Вопрос (\d+)/); if (m) back.querySelectorAll(".qe")[+m[1] - 1].scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      try {
        await api("admin.examSave", { data: { sub: sub, include: Q.include, questions: Q.questions } });
        close(); EX.data = null;
        toast(!Q.include ? "Снято с экзамена — эти вопросы сотрудникам не покажутся"
          : Q.questions.length || Q.locked.length ? "Сохранено: в экзамене " + plural(Q.questions.length + Q.locked.length, "вопрос", "вопроса", "вопросов") + " по этим материалам" : "Включено, но вопросов нет — в экзамене их пока не будет");
        if (onDone) onDone();
      } catch (e) { fail(e); }
      return;
    }
    const err = quizCheck(Q);
    if (err) {
      toast(err);
      const m = err.match(/^Вопрос (\d+)/); if (m) back.querySelectorAll(".qe")[+m[1] - 1].scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const retake = await askRetake("измените тест");
    if (retake === null) return;
    try {
      await api("admin.quizSave", { data: { id: Q.id, sub: sub || "", block: block, title: Q.title, pass: Q.pass, retake: retake, questions: Q.questions } });
      close(); QZ.data = null; PR.qOver = null; PR.program = null; toast(retake ? "Тест сохранён — сдавших попросили пересдать" : "Тест сохранён"); if (onDone) onDone();
    } catch (e) { fail(e); }
  };
  const rs = $$('[data-a="reset"]');
  if (rs) rs.onclick = async () => {
    if (!await ask({ title: "Вернуть исходный тест?", ok: "Вернуть", text: "Тест станет таким, каким был до правок в кабинете. Ваши правки останутся в истории таблицы." })) return;
    const retake = await askRetake("вернёте исходный тест");
    if (retake === null) return;
    try { await api("admin.quizReset", { id: Q.id, retake: retake }); close(); QZ.data = null; PR.qOver = null; toast("Исходный тест возвращён"); if (onDone) onDone(); }
    catch (e) { fail(e); }
  };
  draw();
}
function qeBlank(type) {
  return { id: "e" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), type: type, text: "", explain: "", ref: null, answer: [],
           options: [{ id: "a", t: "" }, { id: "b", t: "" }, { id: "c", t: "" }] };
}
function qeOptId(options) {
  const used = new Set(options.map(o => String(o.id)));
  for (const ch of "abcdefghijklmnopqrstuvwxyz") if (!used.has(ch)) return ch;
  return "o" + Date.now().toString(36);
}
