// B-30: наследник со срезом боя секции показывает фактический срез
// внутри ячейки. Репро пользователя: «если ячейка уменьшилась в результате
// ресайза, общий ритм внутри неё не становится кастомным (малолоопытному
// может стать непонятно, что играть)» + «когда ритм внутри ячейки не
// полностью совпадает с общим ритмом секции, ритм всё равно не рисуется
// внутри ячейки». Пин невозможен by design (B-20 демоция: пин, равный
// своему срезу фасада, снимается) — значит, показываем срез РЕНДЕРОМ.
const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://localhost/',
  beforeParse(win) {
    win.HTMLCanvasElement.prototype.getContext = () => ({
      font: '', measureText: () => ({ width: 10 }),
      clearRect(){}, beginPath(){}, arc(){}, fill(){}, stroke(){}, moveTo(){},
      lineTo(){}, closePath(){}, save(){}, restore(){}, translate(){}, rotate(){},
      fillText(){}, strokeText(){}, setTransform(){}, scale(){},
      createLinearGradient: () => ({ addColorStop(){} }),
    });
  },
});
const w = dom.window;
w.AudioContext = w.webkitAudioContext = function () {
  return { currentTime: 0, state: 'running', resume() {} };
};
let bad = 0;
const ok = (n, c, x) => { console.log(`   ${c ? 'ok  ' : 'FAIL'} ${n}${!c && x ? ' — ' + x : ''}`); if (!c) bad++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

w.addEventListener('load', async () => {
  const d = w.document;
  const FACADE = { mode: 'strum', subdivision: 1, steps: ['D', null, 'D', 'U'] };
  const song = {
    schemaVersion: 2, name: 'B-30', bpm: 100,
    globalKey: 'C', keyMode: 'manual', globalTimeSig: '4/4', notes: '',
    sections: [
      { id: 1, type: 'Verse', customName: null, key: null, shift: null, timeSig: null, bpm: null, repeat: 1,
        strumPattern: FACADE,
        squares: [
          // Квадрат A: две ячейки по 2 доли — срезы [D,·] и [D,U]
          { id: 2, repeat: 1, customBeats: null, strumPattern: null, events: [
            { chord: 'Am', span: 2, timeSig: null, strumPattern: null },
            { chord: 'F', span: 2, timeSig: null, strumPattern: null }] },
          // Квадрат B: ячейка на весь такт — срез == полный рисунок
          { id: 3, repeat: 1, customBeats: null, strumPattern: null, events: [
            { chord: 'C', span: 4, timeSig: null, strumPattern: null }] },
          // Квадрат C: 8 долей, ячейка на 8 — срез = рисунок ×2 (целый повтор)
          { id: 4, repeat: 1, customBeats: 8, strumPattern: null, events: [
            { chord: 'G', span: 8, timeSig: null, strumPattern: null }] },
        ]},
    ],
    nextId: 10, userFingerings: [], preferredFingerings: [], date: '',
  };
  w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
  w.loadSong(0);
  await sleep(300);

  const box = (sq, ei) =>
    d.querySelector(`.event-strum-preview[data-sec="1"][data-square="${sq}"][data-ei="${ei}"]`);
  const hasPat = (sq, ei) => {
    const b = box(sq, ei);
    return !!b && b.classList.contains('has-pattern');
  };
  const glyphs = (sq, ei) =>
    [...(box(sq, ei) || { querySelectorAll: () => [] }).querySelectorAll('.strum-step')]
      .map((el) => el.dataset.hit || el.textContent.trim()).join(',');

  console.log('=== 1. Репро: срезы видны в ячейках-наследниках ===');
  ok('ячейка Am (2 доли, срез [D,·]) показывает превью', hasPat(2, 0), 'превью нет');
  ok('ячейка F (2 доли, срез [D,U]) показывает превью', hasPat(2, 1), 'превью нет');
  ok('метка has-cell-rhythm на ячейке Am',
    !!d.querySelector('.chord-wrapper[data-square="2"][data-ei="0"]')?.closest('.chord-wrapper')?.classList.contains('has-cell-rhythm')
    || !!box(2, 0)?.parentElement?.classList.contains('has-cell-rhythm'));

  console.log('=== 2. Анти-шум: целый повтор рисунка НЕ показывается ===');
  ok('ячейка C (весь такт == полный рисунок) — без превью', !hasPat(3, 0), 'лишнее превью');
  ok('ячейка G (8 долей = рисунок ×2) — без превью', !hasPat(4, 0), 'лишнее превью');

  console.log('=== 3. Содержимое срезов соответствует звучанию ===');
  const g1 = glyphs(2, 0), g2 = glyphs(2, 1);
  ok('Am: два шага (D и пауза)', g1.split(',').length === 2, g1);
  ok('F: два удара (D и U)', g2.split(',').length === 2, g2);

  console.log('=== 4. Модель не тронута: пинов и рулонов не появилось ===');
  const refs = w.eval('songRhythmRolls ? songRhythmRolls.refs.size : 0');
  ok('ни одной ссылки в пуле (чистое наследование)', refs === 0, String(refs));

  console.log('=== 5. Живой путь: воспроизведение не стирает срез ===');
  w.eval(`setEventLiveStrumPreview(1, 2, 0,
    ${JSON.stringify(FACADE)}, ${JSON.stringify(FACADE)})`);
  ok('во время игры срез Am виден (is-live)', box(2, 0).classList.contains('has-pattern') &&
    box(2, 0).classList.contains('is-live'), 'стёрт');
  w.eval(`restoreEventStrumPreview('1:2:0')`);
  ok('после остановки срез вернулся', hasPat(2, 0), 'не вернулся');
  ok('срез не зарегистрирован в карте подсветки (индексация планировщика фасадная)',
    !w.eval(`eventStrumPreviewStepEls.has('1:2:0')`));

  console.log(bad ? `FAIL: ${bad}` : 'ALL OK');
  process.exit(bad ? 1 : 0);
});
