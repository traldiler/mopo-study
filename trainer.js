/* Глифы и названия узлов для тренажёра ДСК. Собирается из schemes.html, руками не правим. */
const GB={
 bunker:'<path d="M4 6 L44 6 L32 28 L16 28 Z" fill="#FDF6F1" stroke="#232227" stroke-width="2.4" stroke-linejoin="round"/><rect x="18" y="28" width="12" height="5" fill="#E66023"/>',
 feeder:'<path d="M4 6 L16 6 L16 16 L44 24 L44 30 L12 30 L4 18 Z" fill="#FDF6F1" stroke="#232227" stroke-width="2.2" stroke-linejoin="round"/><path d="M18 20 L42 27" stroke="#E66023" stroke-width="2"/>',
 plate:'<rect x="4" y="15" width="40" height="13" rx="6.5" fill="#fff" stroke="#232227" stroke-width="2.2"/><path d="M9 15 L39 15" stroke="#E66023" stroke-width="3.2" stroke-dasharray="5 2"/><circle cx="10.5" cy="21.5" r="3" fill="#232227"/><circle cx="37.5" cy="21.5" r="3" fill="#232227"/><polygon points="17,5 29,3 32,12 19,13" fill="#FDF6F1" stroke="#232227" stroke-width="1.8"/>',
 scraper:'<g fill="none" stroke="#E66023" stroke-width="2.2"><circle cx="9" cy="17" r="4.5"/><circle cx="19" cy="17" r="4.5"/><circle cx="29" cy="17" r="4.5"/><circle cx="39" cy="17" r="4.5"/></g><polygon points="18,4 30,3 32,11 20,11" fill="#FDF6F1" stroke="#232227" stroke-width="1.8"/><g fill="#98969C"><circle cx="14" cy="27" r="1.6"/><circle cx="24" cy="30" r="1.6"/><circle cx="34" cy="27" r="1.6"/></g>',
 belt:'<rect x="5" y="13" width="38" height="10" rx="5" fill="#fff" stroke="#232227" stroke-width="2.2"/><circle cx="10" cy="18" r="5" fill="none" stroke="#E66023" stroke-width="2"/><circle cx="38" cy="18" r="5" fill="none" stroke="#E66023" stroke-width="2"/><path d="M14 26 L20 33 M34 26 L28 33" stroke="#232227" stroke-width="2" stroke-linecap="round"/>',
 magnet:'<path d="M12 30 L12 17 a12 12 0 0 1 24 0 L36 30 L29 30 L29 17 a5 5 0 0 0 -10 0 L19 30 Z" fill="#fff" stroke="#232227" stroke-width="2.2" stroke-linejoin="round"/><rect x="12" y="30" width="7" height="4" fill="#E66023"/><rect x="29" y="30" width="7" height="4" fill="#E66023"/>',
 jaw:'<path d="M6 5 L42 5 L42 10 L28 31 L20 31 L6 10 Z" fill="#fff" stroke="#232227" stroke-width="2.4" stroke-linejoin="round"/><path d="M13 9 L22 29" stroke="#232227" stroke-width="3.2" stroke-linecap="round"/><path d="M35 9 L26 29" stroke="#E66023" stroke-width="3.2" stroke-linecap="round"/>',
 cone:'<path d="M6 7 L42 7 L36 30 L12 30 Z" fill="#fff" stroke="#232227" stroke-width="2.4" stroke-linejoin="round"/><polygon points="24,11 33,28 15,28" fill="#E66023"/>',
 rotor:'<rect x="5" y="7" width="38" height="24" rx="3" fill="#fff" stroke="#232227" stroke-width="2.4"/><circle cx="24" cy="19" r="8" fill="none" stroke="#E66023" stroke-width="2.4"/><g fill="#232227"><rect x="21" y="8" width="6" height="5" rx="1"/><rect x="34" y="16" width="5" height="6" rx="1"/><rect x="21" y="25" width="6" height="5" rx="1"/><rect x="9" y="16" width="5" height="6" rx="1"/></g>',
 vsi:'<path d="M7 8 L41 8 L36 30 L12 30 Z" fill="#fff" stroke="#232227" stroke-width="2.4" stroke-linejoin="round"/><ellipse cx="24" cy="19" rx="11" ry="4" fill="#E66023"/><path d="M24 10 L24 16" stroke="#E66023" stroke-width="2.4" stroke-linecap="round"/>',
 roll:'<rect x="5" y="6" width="38" height="26" rx="4" fill="#fff" stroke="#232227" stroke-width="2.4"/><circle cx="16.5" cy="19" r="8" fill="none" stroke="#E66023" stroke-width="2.4"/><circle cx="31.5" cy="19" r="8" fill="none" stroke="#E66023" stroke-width="2.4"/>',
 hammer:'<rect x="7" y="6" width="34" height="26" rx="4" fill="#fff" stroke="#232227" stroke-width="2.4"/><circle cx="24" cy="19" r="3.5" fill="#E66023"/><path d="M24 19 L24 9 M24 19 L34 19 M24 19 L24 29 M24 19 L14 19" stroke="#E66023" stroke-width="2.6" stroke-linecap="round"/>',
 box:'<rect x="3" y="7" width="42" height="26" rx="3" fill="#fff" stroke="#232227" stroke-width="2.4"/><path d="M16 7 l3 -3 3 3 3 -3 3 3 3 -3 3 3" fill="none" stroke="#98969C" stroke-width="1.6"/><circle cx="24" cy="21" r="3.5" fill="#E66023"/><path d="M24 21 L24 13 M24 21 L32 21 M24 21 L24 29 M24 21 L16 21" stroke="#E66023" stroke-width="2.6" stroke-linecap="round"/>',
 cabinet:'<rect x="12" y="4" width="24" height="30" rx="2.5" fill="#fff" stroke="#232227" stroke-width="2.4"/><rect x="16" y="8" width="16" height="7" rx="1" fill="#FDF6F1" stroke="#232227" stroke-width="1.4"/><g fill="#232227"><rect x="16" y="19" width="3" height="5" rx=".6"/><rect x="21" y="19" width="3" height="5" rx=".6"/><rect x="26" y="19" width="3" height="5" rx=".6"/></g><circle cx="18" cy="29" r="1.8" fill="#E66023"/><circle cx="24" cy="29" r="1.8" fill="#D14343"/>',
 screen:'<g transform="rotate(8 24 18)"><rect x="5" y="9" width="38" height="19" rx="4" fill="#fff" stroke="#232227" stroke-width="2.4"/><path d="M9 16 L39 16 M9 22 L39 22" stroke="#E66023" stroke-width="2"/></g>'
};
const U={
 bunker:{n:"Приёмный бункер",s:"Бункер",r:"Приём",out:"Попадает в бункер и сходит вниз по наклонной стенке"},
 feeder:{n:"Вибропитатель",s:"Вибропитатель",r:"Подача",out:"Едет по вибрирующему лотку — ровным слоем, без рывков"},
 plate:{n:"Пластинчатый питатель",s:"Пластинчатый",r:"Подача",out:"Едет на стальных пластинах цепи — без вибрации"},
 scraper:{n:"Скребковый питатель",s:"Скребковый",r:"Подача",out:"Валки двигают камень вперёд, глина проваливается вниз"},
 belt:{n:"Ленточный конвейер",s:"Конвейер",r:"Транспорт",out:"Едет на ленте к следующему узлу",many:true},
 magnet:{n:"Магнитный сепаратор",s:"Сепаратор",r:"Над лентой",out:"Проходит под магнитом — металл вытягивает вверх, порода едет дальше",many:true},
 jaw:{n:"Щековая дробилка",s:"Щековая",r:"Первичное",out:"Зажимается между щеками и раздавливается"},
 cone:{n:"Конусная дробилка",s:"Конусная",r:"Вторичное",out:"Идёт в зазоре между конусом и чашей, раздавливается непрерывно",many:true},
 rotor:{n:"Роторная дробилка",s:"Роторная",r:"Вторичное",out:"Получает удар билом и разбивается о броню корпуса"},
 vsi:{n:"Вертикально-ударная",s:"ВУД",r:"Третичное",out:"Разгоняется ротором и бьётся о бронеплиты"},
 roll:{n:"Двухвалковая дробилка",s:"Двухвалковая",r:"Тонкое",out:"Затягивается в зазор между валами и раздавливается"},
 hammer:{n:"Молотковая дробилка",s:"Молотковая",r:"Мягкие породы",out:"Разбивается ударами молотков о футеровку"},
 box:{n:"Коробчатая дробилка",s:"Коробчатая",r:"Стройотходы",out:"Бьётся о молотки и броню по нескольку раз за проход"},
 cabinet:{n:"Шкаф управления",s:"Шкаф",r:"Управление",out:""},
 screen:{n:"Грохот",s:"Грохот",r:"Сортировка",out:"Ползёт по декам: крупное сходит сверху, мелочь проваливается ниже",many:true}
};
Object.keys(U).forEach(k=>U[k].g='<svg viewBox="0 0 48 36" aria-hidden="true">'+GB[k]+'</svg>');
/* палитра разбита на группы — так проще найти нужное */
const PALG=[["Приём и подача",["bunker","feeder","plate","scraper"]],
            ["Дробление",["jaw","cone","rotor","vsi","roll","hammer","box"]],
            ["Транспорт, защита, сортировка",["belt","magnet","screen"]],
            ["Управление линией",["cabinet"]]];
