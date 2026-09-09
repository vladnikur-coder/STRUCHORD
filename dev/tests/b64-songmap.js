// B-64: панель структуры песни.
//
// Спека — допрос по R8 (2026-09-06): панель слева снаружи рабочей
// области, выезжает по наведению; секции столбиком; повторы ОДНОЙ
// строкой с «×N»; подсветка играющей; клик = прыжок, перетаскивание =
// порядок, Cmd+C/V = копия сразу после оригинала; горячие клавиши
// только при открытой панели.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8');
const police = JSON.parse(fs.readFileSync(__dirname + '/../../uploads/Police - Every breath you take.struchord-2.json', 'utf8'));
const hate = JSON.parse(fs.readFileSync(__dirname + '/../../uploads/Blue October - Hate me.struchord.json', 'utf8'));
let bad = 0;
const ok = (n, c, x) => { console.log(`   ${c ? 'ok  ' : 'FAIL'} ${n}${!c && x ? ' — ' + x : ''}`); if (!c) bad++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function boot(song) {
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/',
    beforeParse(w) { w.HTMLCanvasElement.prototype.getContext = () => ({ font: '', measureText: () => ({ width: 10 }),
      clearRect(){},beginPath(){},arc(){},fill(){},stroke(){},moveTo(){},lineTo(){},closePath(){},save(){},restore(){},
      translate(){},rotate(){},fillText(){},strokeText(){},setTransform(){},scale(){},setLineDash(){},
      createLinearGradient:()=>({addColorStop(){}}) }); } });
  const w = dom.window;
  w.AudioContext = w.webkitAudioContext = function () { return { currentTime: 0, state: 'running', resume() {} }; };
  w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
  w.loadSong(0);
  try { w.render(); } catch (e) {}
  return w;
}
const rows = (w) => [...w.document.querySelectorAll('.songmap-item')];

(async () => {
  console.log('=== 1. Панель показывает форму песни ===');
  {
    const w = boot(police);
    await sleep(300);
    const items = rows(w);
    ok('строк столько же, сколько секций', items.length === 10, String(items.length));
    const names = items.map((i) => i.querySelector('.songmap-name').textContent);
    ok('порядок совпадает с песней',
       names[0] === 'Интро' && names[9] === 'Аутро', names.join(','));
    ok('панель живёт СНАРУЖИ .container',
       !w.document.querySelector('.container').contains(w.document.getElementById('songmap')));
  }

  console.log('=== 2. Повторы — ОДНОЙ строкой с «×N» ===');
  {
    // Hate me: Verse ×2 дважды.
    const w = boot(hate);
    await sleep(300);
    const items = rows(w);
    ok('строк = число секций, а не проходов', items.length === 6, String(items.length));
    const badges = items.map((i) => { const b = i.querySelector('.songmap-repeat'); return b ? b.textContent : ''; });
    ok('повтор показан бейджем ×2', badges.filter((b) => b === '×2').length === 2, badges.join(','));
    ok('у секции без повтора бейджа нет', badges.filter((b) => b === '').length === 4, badges.join(','));
  }

  console.log('=== 3. Выезд по наведению ===');
  {
    const w = boot(police);
    await sleep(300);
    const panel = w.document.getElementById('songmap');
    const zone = w.document.getElementById('songmapZone');
    ok('в покое панель закрыта', !panel.classList.contains('is-open'));
    zone.dispatchEvent(new w.MouseEvent('mouseenter', { bubbles: true }));
    ok('наведение на зону открывает', panel.classList.contains('is-open'));
    panel.dispatchEvent(new w.MouseEvent('mouseleave', { bubbles: true }));
    await sleep(320);
    ok('уход мыши закрывает', !panel.classList.contains('is-open'));
  }

  console.log('=== 4. Клик выделяет секцию ===');
  {
    const w = boot(police);
    await sleep(300);
    const items = rows(w);
    items[2].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok('строка выделилась', items[2].classList.contains('is-selected'));
    items[5].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok('выделение перешло к другой', !items[2].classList.contains('is-selected')
       && rows(w)[5].classList.contains('is-selected'));
  }

  console.log('=== 5. Cmd+C / Cmd+V: копия после ВЫБРАННОЙ секции ===');
  {
    const w = boot(police);
    await sleep(300);
    const before = JSON.parse(w.eval('JSON.stringify(sections.map(s=>s.type))'));
    const panel = w.document.getElementById('songmap');
    w.document.getElementById('songmapZone').dispatchEvent(new w.MouseEvent('mouseenter', { bubbles: true }));
    // Выделяем «Припев» (индекс 2) и копируем.
    rows(w)[2].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    const key = (k) => w.document.dispatchEvent(new w.KeyboardEvent('keydown',
      { key: k, metaKey: true, bubbles: true, cancelable: true }));
    key('c');
    // B-64 (0.192, правка пользователя): вставка идёт после ВЫБРАННОЙ
    // СЕЙЧАС секции, а не после оригинала. Копируем «Припев» (#2), затем
    // выбираем другую секцию (#7) и вставляем туда.
    rows(w)[7].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    key('v');
    await sleep(250);
    const after = JSON.parse(w.eval('JSON.stringify(sections.map(s=>s.type))'));
    ok('секций стало на одну больше', after.length === before.length + 1,
       before.length + ' -> ' + after.length);
    ok('копия встала после ВЫБРАННОЙ (#7), а не после оригинала',
       after[8] === 'Chorus' && after[3] !== 'Chorus', after.join(','));
    ok('оригинал остался на месте', after[2] === 'Chorus', after.slice(0, 4).join(','));
    ok('панель обновилась', rows(w).length === after.length, String(rows(w).length));
  }

  console.log('=== 6. Горячие клавиши не работают при закрытой панели ===');
  {
    const w = boot(police);
    await sleep(300);
    rows(w)[1].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    const before = JSON.parse(w.eval('sections.length'));
    // Панель НЕ открыта.
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'c', metaKey: true, bubbles: true }));
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'v', metaKey: true, bubbles: true }));
    await sleep(150);
    ok('песня не изменилась', JSON.parse(w.eval('sections.length')) === before, String(before));
  }

  console.log('=== 7. Панель следует за моделью ===');
  {
    const w = boot(police);
    await sleep(300);
    const n0 = rows(w).length;
    w.eval('addSection("Solo")');
    try { w.eval('render()'); } catch (e) {}
    await sleep(200);
    ok('добавленная секция появилась в панели', rows(w).length === n0 + 1,
       n0 + ' -> ' + rows(w).length);
  }


  console.log('=== 8. Подсветка играющей секции ===');
  {
    const w = boot(police);
    await sleep(300);
    // Подсветка ставится по playbackState.currentSectionIndex.
    w.eval('playbackState.currentSectionIndex = 3');
    w.eval('updateSongMapCurrent()');
    const items = rows(w);
    ok('подсвечена секция №4', items[3].classList.contains('is-current'),
       items.map((i, n) => i.classList.contains('is-current') ? n : '').filter(String).join(','));
    ok('остальные не подсвечены',
       items.filter((i) => i.classList.contains('is-current')).length === 1);
    // Переезд подсветки.
    w.eval('playbackState.currentSectionIndex = 5');
    w.eval('updateSongMapCurrent()');
    ok('подсветка переехала', rows(w)[5].classList.contains('is-current')
       && !rows(w)[3].classList.contains('is-current'));
    // Остановка игры снимает подсветку.
    w.eval('playbackState.currentSectionIndex = -1');
    w.eval('updateSongMapCurrent()');
    ok('после остановки подсветки нет',
       rows(w).every((i) => !i.classList.contains('is-current')));
  }


  console.log('=== 9. Оформление: fade у края и цветной ховер ===');
  {
    // Правки пользователя (0.192): край панели уходит в лёгкий fade,
    // ховер красится в характерный цвет секции — как в ленте.
    // 0.193: маска заменена полупрозрачной подложкой с размывкой —
    // с прозрачным фоном маска гасила бы и текст пунктов. Мягкость края
    // теперь даёт сам фон, а не вырезание.
    // Проверяем СУТЬ: у панели нет рамки справа. Раньше тест искал
    // border-right: none, но в переписанной по промпту версии свойства
    // нет вовсе — это то же самое, только чище.
    ok('рамки справа нет', !/\.songmap\s*\{[^}]*border-right:\s*[0-9]/s.test(html));
    ok('подложка полупрозрачная', /\.songmap\s*\{[^}]*background:\s*color-mix/s.test(html));
    ok('фон размыт (панель не давит)', /\.songmap\s*\{[^}]*backdrop-filter:\s*blur/s.test(html));
    ok('панель не во всю высоту', /\.songmap\s*\{[^}]*max-height:\s*82vh/s.test(html));
    ok('тени нет', !/\.songmap\s*\{[^}]*box-shadow:\s*var\(--shadow-modal\)/s.test(html));
    const types = ['verse', 'chorus', 'bridge', 'intro', 'outro', 'solo', 'pre-chorus'];
    types.forEach((t) => {
      ok(`ховер ${t} берёт цвет типа`,
         new RegExp(`\\.songmap-item\\.${t}:hover[^}]*--label-`).test(html));
    });
  }


  console.log('=== 10. Нумерация одноимённых секций ===');
  {
    // Просьба пользователя (0.194): в списке из десяти строк четыре
    // одинаковых «Куплета» неотличимы. Нумеруем ТОЛЬКО те названия,
    // которые встречаются больше одного раза.
    const w = boot(police);
    await sleep(300);
    const names = rows(w).map((i) => i.querySelector('.songmap-name').textContent);
    console.log('      ', names.join(' | '));
    ok('куплеты пронумерованы по порядку',
       names[1] === 'Куплет 1' && names[3] === 'Куплет 2'
       && names[5] === 'Куплет 3' && names[8] === 'Куплет 4', names.join(','));
    ok('припевы нумеруются своей чередой',
       names[2] === 'Припев 1' && names[7] === 'Припев 2', names.join(','));
    ok('одиночная секция БЕЗ номера', names[0] === 'Интро' && names[4] === 'Бридж',
       names[0] + ' / ' + names[4]);
    ok('нумерация не зависит от типа, а идёт по подписи',
       names.filter((n) => n.startsWith('Куплет')).length === 4, names.join(','));
  }

  console.log('=== 11. Панель выезжает строго вбок ===');
  {
    // Правка пользователя: «пусть просто вылетает из края, а не снизу с
    // края». Причина была в том, что transform смешивал выезд и
    // центрирование, и браузер интерполировал их вместе — движение шло
    // по диагонали. Центрирование вынесено в отдельное свойство.
    ok('центрирование вынесено из transform',
       /\.songmap\s*\{[^}]*translate:\s*0\s+-50%/s.test(html));
    ok('в анимируемом transform только сдвиг вбок',
       /\.songmap\s*\{[^}]*transform:\s*translateX\(-100%\)\s*;/s.test(html));
    ok('открытая панель тоже без вертикали',
       /\.songmap\.is-open\s*\{\s*transform:\s*translateX\(0\)\s*;\s*\}/.test(html));
  }


  console.log('=== 12. Прыжок ставит секцию ПО ЦЕНТРУ экрана ===');
  {
    // Просьба пользователя (0.196): при скачке выбранная секция должна
    // появляться посередине экрана. До этого её ставили под sticky
    // .transport-bar, вплотную к верху.
    const w = boot(police);
    await sleep(300);
    const VH = 900;
    Object.defineProperty(w, 'innerHeight', { value: VH, configurable: true });
    const cards = [...w.document.querySelectorAll('.section-card')];
    cards.forEach((c, i2) => {
      c.getBoundingClientRect = () => ({ top: i2 * 200, height: 200, left: 0, right: 800, bottom: i2 * 200 + 200, width: 800 });
    });
    const bar = w.document.querySelector('.transport-bar');
    if (bar) bar.getBoundingClientRect = () => ({ top: 8, height: 64, left: 0, right: 800, bottom: 72, width: 800 });
    const calls = [];
    w.scrollTo = (o) => calls.push(o && o.top);
    const items = rows(w);

    items[2].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok('прокрутка вызвана', calls.length === 1, String(calls.length));
    // Верх карточки 400, окно 900, высота 200 -> 400 - 350 = 50.
    ok('середина карточки попадает в центр окна',
       calls[0] + VH / 2 === 400 + 100, `scroll=${calls[0]}`);

    calls.length = 0;
    items[5].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok('работает и для дальней секции', calls[0] === 650, String(calls[0]));

    // Секция ВЫШЕ экрана: центрировать нельзя — верх уедет за кромку.
    calls.length = 0;
    cards[3].getBoundingClientRect = () => ({ top: 600, height: 1400, left: 0, right: 800, bottom: 2000, width: 800 });
    items[3].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok('высокая секция показывает НАЧАЛО, а не центр',
       calls[0] === 512, String(calls[0]) + ' (600 минус панель 88)');

    calls.length = 0;
    items[0].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok('для первой секции прокрутка не отрицательная', calls[0] >= 0, String(calls[0]));
  }


  console.log('=== 13. Корешок с надписью «Структура» ===');
  {
    // Просьба пользователя (0.197): вместо безымянной полоски у края —
    // видимый краешек панели с вертикальной надписью, намекающий, что
    // её можно вытянуть.
    const w = boot(police);
    await sleep(300);
    const zone = w.document.getElementById('songmapZone');
    const panel = w.document.getElementById('songmap');
    ok('на корешке есть надпись', /Структура/.test(zone.textContent), zone.textContent.trim());
    ok('надпись вертикальная', /writing-mode:\s*vertical/.test(html));
    ok('корешок выглядит как торец панели (та же подложка)',
       /\.songmap-zone\s*\{[^}]*background:\s*color-mix/s.test(html));
    // Скругление может быть задано токеном (--border-radius-md = 10px)
    // — это предпочтительнее «магического» числа, поэтому принимаем оба.
    ok('скруглён справа, как выдвижной ящик',
       /\.songmap-zone\s*\{[^}]*border-radius:\s*0\s+(10px|var\(--border-radius-md\))/s.test(html));
    // Дубля заголовка внутри панели быть не должно.
    ok('заголовок внутри панели убран (не дублируем)',
       w.document.querySelectorAll('.songmap-head').length === 0);
    // Корешок прячется, пока панель открыта.
    zone.dispatchEvent(new w.MouseEvent('mouseenter', { bubbles: true }));
    ok('при открытии корешок скрыт', zone.classList.contains('is-hidden'));
    panel.dispatchEvent(new w.MouseEvent('mouseleave', { bubbles: true }));
    await sleep(320);
    ok('после закрытия корешок вернулся', !zone.classList.contains('is-hidden'));
  }

  console.log(bad ? `\nFAIL: ${bad}` : '\nALL OK');
  if (bad) process.exitCode = 1;
})();
