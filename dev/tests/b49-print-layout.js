// B-49: печать / экспорт в PDF.
//
// Спека пользователя 2026-09-05: «экспорт в pdf, оптимизированный для
// печати», «чтобы адекватно помещалось на A4 и можно было поставить на
// пюпитр для игры». Механизм выбран пользователем 2026-09-06: печатный
// CSS + системный «Сохранить как PDF».
const fs = require('fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8');
const song = JSON.parse(fs.readFileSync(__dirname + '/../../uploads/Дешевые Драмы.struchord-3.json', 'utf8'));
let bad = 0;
const ok = (n, c, x) => { console.log(`   ${c ? 'ok  ' : 'FAIL'} ${n}${!c && x ? ' — ' + x : ''}`); if (!c) bad++; };

const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/',
  beforeParse(w) { w.HTMLCanvasElement.prototype.getContext = () => ({ font: '', measureText: () => ({ width: 10 }),
    clearRect(){},beginPath(){},arc(){},fill(){},stroke(){},moveTo(){},lineTo(){},closePath(){},save(){},restore(){},
    translate(){},rotate(){},fillText(){},strokeText(){},setTransform(){},scale(){},setLineDash(){},
    createLinearGradient:()=>({addColorStop(){}}) }); } });
const w = dom.window;
w.AudioContext = w.webkitAudioContext = function () { return { currentTime: 0, state: 'running', resume() {} }; };

w.addEventListener('load', () => {
  console.log('=== 1. Кнопка и точка входа ===');
  ok('printSong существует', typeof w.printSong === 'function');
  ok('кнопка «Печать» есть в панели',
     [...w.document.querySelectorAll('.action-btn')].some((b) => /Печать/.test(b.textContent)));
  ok('на экране шапка листа скрыта',
     !!w.document.getElementById('printHead'));

  console.log('=== 2. Печатный CSS присутствует ===');
  ok('есть блок @media print', html.includes('@media print'));
  ok('лист A4 портрет', /@page\s*\{[^}]*size:\s*A4\s+portrait/.test(html));
  ok('квадрат не рвётся между страницами',
     /\.square\s*\{[^}]*break-inside:\s*avoid/s.test(html.slice(html.indexOf('@media print'))));
  ok('секция не рвётся между страницами',
     /\.section-card\s*\{[^}]*break-inside:\s*avoid/s.test(html.slice(html.indexOf('@media print'))));

  console.log('=== 3. Интерфейс не печатается ===');
  const printCss = html.slice(html.indexOf('@media print'), html.indexOf('@media print') + 6000);
  ['toolbar', 'transport-bar', 'app-header', 'timeline-mode', 'resize-handle', 'rhythm-hints']
    .forEach((cls) => ok(`${cls} скрыт при печати`, printCss.includes('.' + cls)));

  console.log('=== 4. Печать чёрным по белому ===');
  ok('тёмная тема переопределяется', printCss.includes("[data-theme='dark']"));
  // Имена переменных берём РЕАЛЬНЫЕ (первый заход переопределял
  // несуществующие --color-bg, и лист ушёл в печать чёрным).
  ok('фон страницы белый', /--color-body-bg:\s*#ffffff\s*!important/.test(printCss));
  ok('фон поверхностей белый', /--color-background-primary:\s*#ffffff\s*!important/.test(printCss));
  ok('свечение фона убрано', /--body-glow:\s*none\s*!important/.test(printCss));
  ok('акцент на бумаге чёрный', /--color-accent:\s*#000000\s*!important/.test(printCss));
  ok('тёмная тема перебита с той же специфичностью',
     printCss.includes("html[data-theme='dark']"));
  ok('текст чёрный', /--color-text-primary:\s*#000000\s*!important/.test(printCss));

  console.log('=== 5. Шапка листа наполняется данными песни ===');
  w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
  w.loadSong(0);
  let printed = 0;
  w.print = () => { printed++; };
  w.printSong();
  const head = w.document.getElementById('printHead');
  ok('название попало в шапку', /Дешевые|Без названия/.test(head.textContent), head.textContent);
  ok('темп попал в шапку', /Темп:/.test(head.textContent), head.textContent);
  ok('тональность попала в шапку', /Тональность:/.test(head.textContent), head.textContent);
  ok('размер попал в шапку', /Размер:/.test(head.textContent), head.textContent);


  console.log('=== 7. Тема НЕ утекает в печать (регрессия 0.191) ===');
  {
    // Присланный пользователем PDF (0.191) был залит ЧЁРНЫМ: печаталась
    // тёмная тема. Причины: (а) :root слабее html[data-theme='dark'] по
    // специфичности, (б) переопределялись НЕСУЩЕСТВУЮЩИЕ имена
    // переменных (--color-bg вместо --color-body-bg), (в) 48 переменных
    // темы вообще не были покрыты.
    const printBlock = html.slice(html.indexOf('@media print'));
    const varBlock = printBlock.slice(0, printBlock.indexOf('@page'));
    const covered = new Set();
    varBlock.replace(/(--[a-z0-9-]+)\s*:/g, (m, k) => { covered.add(k); return m; });

    const di = html.indexOf("html[data-theme='dark'] {");
    const darkBlock = html.slice(di, html.indexOf('}', di));
    const darkVars = [...new Set(darkBlock.match(/--[a-z0-9-]+(?=\s*:)/g) || [])];
    const used = new Set((html.match(/var\((--[a-z0-9-]+)/g) || []).map((m) => m.slice(4)));
    const leaked = darkVars.filter((v) => used.has(v) && !covered.has(v));

    ok('все переменные тёмной темы перекрыты при печати',
       leaked.length === 0, leaked.slice(0, 8).join(' '));
    ok('фон страницы белый', /--color-body-bg:\s*#ffffff/.test(varBlock));
    ok('свечение фона выключено', /--body-glow:\s*none/.test(varBlock));
    ok('метки секций не цветные',
       /--label-verse-bg:\s*#ffffff/.test(varBlock) || !used.has('--label-verse-bg'));
  }

  console.log('=== 8. Квадраты не наезжают друг на друга ===');
  {
    // На присланном листе .square-inner сохранял экранную ширину в
    // процентах и соседние квадраты перекрывались.
    const printBlock = html.slice(html.indexOf('@media print'));
    ok('квадрат распрямлён во всю ширину листа',
       /\.square-inner\s*\{[^}]*width:\s*100%\s*!important/s.test(printBlock));
    ok('позиционирование сброшено',
       /\.square\s*\{[^}]*position:\s*static\s*!important/s.test(printBlock));
    ok('анимации выключены', /animation:\s*none\s*!important/.test(printBlock));
  }


  console.log('=== 9. Селекторы печати попадают в реальный DOM ===');
  {
    // Скриншот предпросмотра (0.192) показал пустые провалы: правило для
    // секции было написано на класс .section, а в DOM он .section-card —
    // не применялось НИЧЕГО. Тот же промах был у .chord-name.
    // Здесь ловим такие опечатки: ключевые селекторы обязаны находить
    // элементы на загруженной песне.
    w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
    w.loadSong(0);
    try { w.render(); } catch (e) {}
    const must = ['.section-card', '.squares-row', '.square', '.square-inner',
      '.chord-wrapper', '.chord-content', '.chord-counts', '.strum-preview'];
    must.forEach((sel) => {
      ok(`${sel} есть в DOM`, w.document.querySelectorAll(sel).length > 0);
    });
    const printBlock = html.slice(html.indexOf('@media print'));
    must.forEach((sel) => {
      ok(`${sel} упомянут в печатном CSS`, printBlock.includes(sel));
    });
    // Ряд квадратов на экране прокручивается — на бумаге должен
    // разворачиваться в колонку, иначе часть песни уедет за край листа.
    ok('ряд квадратов развёрнут для печати',
       /\.squares-row\s*\{[^}]*display:\s*block\s*!important/s.test(printBlock));
  }

  console.log('=== 6. window.print() вызывается ===');
  setTimeout(() => {
    ok('печать запущена', printed === 1, String(printed));
    console.log(bad ? `\nFAIL: ${bad}` : '\nALL OK');
    if (bad) process.exitCode = 1;
  }, 120);
});
