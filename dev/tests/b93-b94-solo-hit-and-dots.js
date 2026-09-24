// B-93 + B-94 (2026-09-22): две правки по живым замечаниям пользователя.
//
// B-93. Дословная постановка: «если ритм выглядит так D___, то на ячейке
//   он должен выглядеть как одиночный D».
//   Рука бьёт один раз и ждёт — хвост пауз не добавляет ничего к тому,
//   ЧТО играть, но съедает узкую ширину ячейки.
//
//   Согласованные рамки (ask_user, резюме пользователя):
//     - сворачивается ТОЛЬКО «один удар и тишина» (D___, D_);
//       D_U_ и __D_ остаются как есть — там паузы несут ритм;
//     - только в мини-превью ЯЧЕЙКИ; бейдж секции, тултип аппликатуры и
//       список пресетов показывают рисунок целиком (там рисунки
//       сравнивают между собой);
//     - элементы пауз ОСТАЮТСЯ в DOM скрытыми, а не удаляются:
//       планировщик подсветки адресует шаг порядковым номером
//       (els[stepIdx % els.length]) — при удалении на «×N»-повторах
//       загорался бы не тот знак.
//
// B-94. «Кнопка метронома не должна просвечивать через кнопку с тремя
//   точками». Причина: фоном кружка стоял --color-border-medium, то есть
//   rgba(0,0,0,0.15) / rgba(255,255,255,0.12) — цвет ГРАНИЦЫ, по смыслу
//   полупрозрачный. Кружок сидит верхом на кнопке метронома, поэтому
//   сквозь него был виден её белый круг и обводка.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const file = process.argv[2] || __dirname + '/../../STRUCHORD.html';
const html = fs.readFileSync(file, 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://localhost/',
  beforeParse(w) {
    w.HTMLCanvasElement.prototype.getContext = () => ({
      font: '', measureText: () => ({ width: 10 }),
      clearRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {},
      moveTo() {}, lineTo() {}, closePath() {}, save() {}, restore() {},
      translate() {}, rotate() {}, fillText() {}, strokeText() {},
      setTransform() {}, scale() {},
      createLinearGradient: () => ({ addColorStop() {} }),
    });
  },
});
const w = dom.window;
w.AudioContext = w.webkitAudioContext = function () {
  return { currentTime: 0, state: 'running', resume() {} };
};
w.confirm = () => true;

let bad = 0;
const ok = (name, cond, extra) => {
  console.log(`   ${cond ? 'ok  ' : 'FAIL'} ${name}${!cond && extra !== undefined ? ' — ' + extra : ''}`);
  if (!cond) bad++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Скрытость проверяем по классу-метке + правилу в CSS: jsdom не считает
// каскад для display, поэтому getComputedStyle тут не свидетель.
const CSS_HIDES_COLLAPSED = /\.event-strum-preview\s+\.strum-step\.is-collapsed-rest\s*\{[^}]*display:\s*none/.test(html);

w.addEventListener('load', async () => {
  const d = w.document;
  const P = (sub, steps) => ({ mode: 'strum', base: 1, subdivision: sub, steps });

  const song = {
    name: 'b93', artist: '', globalKey: 'C', keyMode: 'major', globalTimeSig: '4/4', bpm: 100,
    sections: [
      { id: 1, type: 'Verse', customName: null, key: null, shift: null, timeSig: null, bpm: null, repeat: 1,
        strumPattern: null,
        squares: [
          { id: 2, repeat: 1, customBeats: null, strumPattern: null, events: [
            // ровно один удар, первым — сворачиваем
            { chord: 'Am', span: 1, timeSig: null, strumPattern: P(4, ['D', null, null, null]) },
            { chord: 'C',  span: 1, timeSig: null, strumPattern: P(2, ['D', null]) },
            // два удара — не трогаем
            { chord: 'F',  span: 1, timeSig: null, strumPattern: P(4, ['D', null, 'U', null]) },
            // удар не первый — пауза несёт момент удара, не трогаем
            { chord: 'G',  span: 1, timeSig: null, strumPattern: P(4, [null, null, 'D', null]) },
          ] },
        ] },
    ],
    nextId: 10, userFingerings: [], preferredFingerings: [], date: '',
  };
  w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
  w.loadSong(0);
  await sleep(300);

  const box = (ei) => d.querySelector(`.event-strum-preview[data-sec="1"][data-square="2"][data-ei="${ei}"]`);
  const steps = (ei) => [...(box(ei) || { querySelectorAll: () => [] }).querySelectorAll('.strum-step')];
  const shown = (ei) => steps(ei).filter((e) => !e.classList.contains('is-collapsed-rest'))
    .map((e) => e.textContent.trim()).join('');
  const domCount = (ei) => steps(ei).length;

  console.log('=== 1. B-93: «удар и тишина» сворачивается до одного знака ===');
  ok('CSS прячет хвост пауз в превью ячейки', CSS_HIDES_COLLAPSED);
  ok('D___ показан одним знаком', shown(0) === '↓', shown(0));
  ok('D_ (две доли) тоже одним знаком', shown(1) === '↓', shown(1));

  console.log('=== 2. Подсветка цела: скрытые паузы остались в DOM ===');
  ok('у D___ в DOM по-прежнему 4 шага', domCount(0) === 4, String(domCount(0)));
  ok('у D_ в DOM по-прежнему 2 шага', domCount(1) === 2, String(domCount(1)));
  ok('скрыт именно хвост, а не сам удар',
    steps(0)[0] && !steps(0)[0].classList.contains('is-collapsed-rest') &&
    steps(0).slice(1).every((e) => e.classList.contains('is-collapsed-rest')));
  ok('карта подсветки знает ячейку целиком',
    w.eval(`(eventStrumPreviewStepEls.get('1:2:0')||[]).length`) === 4);

  console.log('=== 3. Анти-переусердствование: остальные ритмы не тронуты ===');
  ok('D_U_ (два удара) показан полностью', shown(2) === '↓_↑_', shown(2));
  ok('__D_ (удар не первый) показан полностью', shown(3) === '__↓_', shown(3));
  ok('в D_U_ нет свёрнутых пауз', steps(2).every((e) => !e.classList.contains('is-collapsed-rest')));

  console.log('=== 4. Сворачивание живёт только в ячейке ===');
  w.eval(`
    sections[0].strumPattern = { mode:'strum', base:1, subdivision:4, steps:['D',null,null,null] };
    render();
  `);
  await sleep(150);
  const badge = d.querySelector('.strum-badge-wrap .strum-preview');
  ok('бейдж секции показывает рисунок целиком (4 знака)',
    !!badge && badge.querySelectorAll('.strum-step').length === 4,
    badge ? String(badge.querySelectorAll('.strum-step').length) : 'бейджа нет');
  ok('в бейдже секции никто не свёрнут',
    !!badge && ![...badge.querySelectorAll('.strum-step')].some((e) => e.classList.contains('is-collapsed-rest')));

  console.log('=== 5. Живой путь воспроизведения сворачивает так же ===');
  w.eval(`setEventLiveStrumPreview(1, 2, 0, ${JSON.stringify(P(4, ['D', null, null, null]))}, null)`);
  ok('во время игры D___ тоже один знак', shown(0) === '↓', shown(0));
  ok('во время игры в DOM все 4 шага (подсветка)', domCount(0) === 4, String(domCount(0)));
  w.eval(`restoreEventStrumPreview('1:2:0')`);
  await sleep(50);
  ok('после остановки свёрнутый вид вернулся', shown(0) === '↓', shown(0));

  console.log('=== 6. B-94: кружок настроек метронома непрозрачен ===');
  const dotsRule = html.match(/\.metronome-dots-btn\s*\{[^}]*\}/);
  const dotsCss = dotsRule ? dotsRule[0] : '';
  const bgMatch = dotsCss.match(/background:\s*var\((--[a-z-]+)\)/);
  const bgToken = bgMatch ? bgMatch[1] : null;
  ok('фон задан токеном, а не полупрозрачной границей',
    !!bgToken && bgToken !== '--color-border-medium', String(bgToken));
  // Токен обязан быть непрозрачным ВО ВСЕХ схемах и обеих темах: кружок
  // висит верхом на кнопке метронома, любая альфа вернёт просвечивание.
  // Ищем именно ОБЪЯВЛЕНИЯ токена (начало строки в блоке :root/темы),
  // иначе в выборку попадает и упоминание токена в комментарии рядом.
  const defs = [...html.matchAll(new RegExp(`^\\s*${bgToken}:\\s*([^;]+);`, 'gm'))].map((m) => m[1].trim());
  ok('токен определён во всех схемах (32 определения)', defs.length === 32, String(defs.length));
  ok('ни одно определение не полупрозрачно',
    defs.length > 0 && defs.every((v) => /^#[0-9a-f]{3,8}$/i.test(v)),
    defs.filter((v) => !/^#[0-9a-f]{3,8}$/i.test(v)).join(' | '));
  const hoverRule = html.match(/\.metronome-dots-btn:hover\s*\{[^}]*\}/);
  ok('ховер отличается от базового фона (кнопка отзывается на курсор)',
    !!hoverRule && !new RegExp(`background:\\s*var\\(${bgToken}\\)`).test(hoverRule[0]),
    hoverRule ? hoverRule[0].replace(/\s+/g, ' ') : 'правила нет');

  console.log(bad ? `FAIL: ${bad}` : 'ALL OK');
  process.exit(bad ? 1 : 0);
});
