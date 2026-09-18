/* Иконки блоков и мелкие элементы оформления кабинета. */
const ICO = {
  1: '<path d="M4 20h16M6 20V9l6-4 6 4v11M10 20v-5h4v5"/>',                                   /* компания */
  2: '<path d="M7 4h7l4 4v12H7zM14 4v4h4M9.5 13h6M9.5 16h4"/>',                                /* документ */
  3: '<path d="M4 17l4-9 4 4 4-7 4 12z"/><circle cx="8" cy="8" r="2"/>',                        /* оборудование */
  4: '<circle cx="12" cy="8" r="3"/><path d="M5 20a7 7 0 0 1 14 0"/><circle cx="19" cy="6" r="2"/>', /* ЦА */
  5: '<path d="M4 19h16"/><path d="M6 15l4-4 3 3 5-6"/><path d="M18 8h2v2"/>',                                                 /* продажи */
  6: '<path d="M5 5h14v4H5zM7 9v3h10V9M9 12v3h6v-3M11 15v4"/>',                                 /* воронка */
  7: '<path d="M5 6h14v9H9l-4 4z"/><path d="M9 10h6"/>',                                        /* скрипты */
  9: '<path d="M5 7h14v10H5z"/><path d="M5 7l7 6 7-6"/>',                                       /* заявка */
  10: '<path d="M4 8h16v10H4z"/><path d="M8 8V6h8v2M4 12h16"/>',                                /* лизинг */
  11: '<path d="M7 3h7l4 4v14H7z"/><path d="M10 12h6M10 16h6"/>',                               /* документы */
  12: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 3"/>',                                 /* контроль */
  13: '<path d="M3 16V8l9-4 9 4v8l-9 4z"/><path d="M3 8l9 4 9-4M12 12v8"/>',                    /* приём-передача */
  14: '<path d="M5 19V9M10 19V5M15 19v-7M20 19v-4"/>',                                          /* отчётность */
  16: '<path d="M6 4h9l3 3v13H6z"/><path d="M9 11h6M9 15h6M9 7h3"/>',                           /* шаблоны */
  17: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4M7 9h6"/>'      /* CRM */
};
function blockIcon(n) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICO[n] || ICO[2]}</svg>`;
}
/* ровный процент и склонение */
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  return n + " " + (m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? few : many);
}
