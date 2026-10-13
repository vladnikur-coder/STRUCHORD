#!/usr/bin/env node
/*
 * b12-structure-tab.js — B-12.7.3 «Знаки структуры на табулатурах».
 *
 * Проверяем, что таб печатает те же знаки, что лента (модель одна):
 *  1. Метки Segno / Coda / Fine / To Coda — подписями над станом;
 *  2. Переходы D.C. / D.S. с целью — подписью над станом;
 *  3. Черты повтора — толстой чертой с двумя точками на границе квадрата
 *     (у |: точки справа, у :| слева);
 *  4. Вольты — скобкой с номером; соседние квадраты одной вольты — ОДНОЙ скобкой;
 *  5. Темп секции — знаком «♩=N» в начале системы (глобальный не дублируется);
 *  6. Знаки не наслаиваются на струны: все подписи и скобка выше верхней линейки,
 *     а стан без знаков сохраняет геометрию 12.3 (viewBox без запаса сверху);
 *  7. Работает и у баса (4 струны).
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', '..', 'STRUCHORD.html'), 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://localhost/',
  beforeParse(win) {
    win.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    win.cancelAnimationFrame = (id) => clearTimeout(id);
    win.HTMLCanvasElement.prototype.getContext = () => ({
      font: '', measureText: () => ({ width: 10 }),
      clearRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {}, moveTo() {},
      lineTo() {}, closePath() {}, save() {}, restore() {}, translate() {}, rotate() {},
      fillText() {}, strokeText() {}, setTransform() {}, scale() {},
      createLinearGradient: () => ({ addColorStop() {} }),
    });
  },
});
const w = dom.window;
w.AudioContext = w.webkitAudioContext = function () {
  return {
    currentTime: 0, state: 'running', resume() {}, sampleRate: 44100,
    createBuffer: (c, len) => ({ getChannelData: () => new Float32Array(len) }),
  };
};

let pass = 0;
let fail = 0;
function check(name, cond, details) {
  if (cond) {
    pass++;
    console.log('ok   ' + name);
  } else {
    fail++;
    console.error('FAIL ' + name + (details ? ' — ' + details : ''));
  }
}

// Каждый квадрат — такт 4/4 (customBeats 4), значит 4 единицы сетки:
// в системе координат таба это PART_TAB_UNIT * 4 = 96 на квадрат.
const square = (id, chord, extra) => ({
  id, repeat: 1, customBeats: 4,
  events: [{ chord, span: 4, timeSig: null, strumPattern: null }],
  ...(extra || {}),
});
const song = (squares, secExtra, instrument) => ({
  schemaVersion: 5, metadata: { artist: 'A', title: 'Знаки' }, bpm: 120,
  globalKey: 'C', keyMode: 'manual', globalTimeSig: '4/4', tuning: 'e-std',
  tuningNotes: null, notes: '',
  sections: [{
    id: 1, type: 'Verse', customName: null, key: null, shift: null, timeSig: null,
    bpm: null, repeat: 1, strumPattern: null, squares, ...(secExtra || {}),
  }],
  parts: [{
    id: 1, name: instrument === 'bass' ? 'Бас' : 'Соло', instrument: instrument || 'guitar',
    tuning: null, visible: true,
    rolls: { '1': [{ start: 0, dur: 1, string: instrument === 'bass' ? 0 : 5, fret: 7 }] },
  }],
  nextId: 90, rhythmPool: null, userFingerings: [], preferredFingerings: [], date: '',
});

w.addEventListener('load', () => {
  try {
    const load = (squares, secExtra, instrument) => {
      w.localStorage.setItem('struchord_songs', JSON.stringify([song(squares, secExtra, instrument)]));
      w.loadSong(0);
      w.eval('render()');
      // Таб строим напрямую — окно партий и его прокрутка для знаков не важны.
      return w.eval(`buildPartTabSvg(songParts[0], sections[0], null)`);
    };
    const inSvg = (svg, sel) => Array.from(svg.querySelectorAll(sel));
    const textsOf = (svg, sel) => inSvg(svg, sel).map((el) => el.textContent);
    const nums = (svg, sel, attr) => inSvg(svg, sel).map((el) => Number(el.getAttribute(attr)));

    // ---------- 1. Стан без знаков: геометрия 12.3 ----------
    let svg = load([square(11, 'C'), square(12, 'G')]);
    const plainBox = svg.getAttribute('viewBox').split(' ').map(Number);
    check('стан без знаков — геометрия как в 12.3 (без запаса сверху)',
      plainBox[1] === 0 && inSvg(svg, '[class^="pt-struct"]').length === 0,
      svg.getAttribute('viewBox'));

    // ---------- 2. Метки и переходы ----------
    svg = load([
      square(11, 'C', { mark: 'segno' }),
      square(12, 'G', { mark: 'toCoda' }),
      square(13, 'Am', { mark: 'fine' }),
      square(14, 'F', { mark: 'coda' }),
      square(15, 'Dm', { jump: { type: 'dc', target: 'fine' } }),
    ]);
    check('метки подписаны над станом',
      textsOf(svg, '.pt-struct-mark').join('|').indexOf('Segno') !== -1 &&
      textsOf(svg, '.pt-struct-mark').join('|').indexOf('To Coda') !== -1 &&
      textsOf(svg, '.pt-struct-mark').join('|').indexOf('Fine') !== -1 &&
      textsOf(svg, '.pt-struct-mark').join('|').indexOf('Coda') !== -1,
      textsOf(svg, '.pt-struct-mark').join('|'));
    check('переход D.C. с целью подписан над станом',
      textsOf(svg, '.pt-struct-jump').join('|') === 'D.C.→Fine',
      textsOf(svg, '.pt-struct-jump').join('|'));
    check('метка стоит у своего квадрата (96 единиц на квадрат)',
      nums(svg, '.pt-struct-mark', 'x').join(',') === '4,100,196,292',
      nums(svg, '.pt-struct-mark', 'x').join(','));
    check('знаки не наслаиваются на струны (всё выше верхней линейки)',
      inSvg(svg, '.pt-struct-mark').every((el) => Number(el.getAttribute('y')) < 10) &&
      inSvg(svg, '.pt-struct-jump').every((el) => Number(el.getAttribute('y')) < 10),
      JSON.stringify(inSvg(svg, '.pt-struct-mark').map((el) => el.getAttribute('y'))));
    check('стан со знаками растёт вверх, а не в струны',
      Number(svg.getAttribute('viewBox').split(' ')[1]) < 0,
      svg.getAttribute('viewBox'));

    // ---------- 3. Черты повтора ----------
    svg = load([
      square(11, 'C'),
      square(12, 'G', { repeatOpen: true }),
      square(13, 'Am', { repeatClose: true, repeat: 2 }),
    ]);
    const repeatLines = nums(svg, '.pt-struct-repeat', 'x1');
    check('черты повтора стоят на границах квадратов',
      repeatLines.join(',') === '96,288',
      repeatLines.join(','));
    check('черта повтора — толстая линия во весь стан с точками',
      inSvg(svg, '.pt-struct-repeat').every((el) => Number(el.getAttribute('y1')) < 10 &&
        Number(el.getAttribute('y2')) > 55 && el.getAttribute('stroke-width') === '3') &&
      inSvg(svg, '.pt-struct-repeat-dot').length === 4,
      JSON.stringify([inSvg(svg, '.pt-struct-repeat')[0].getAttribute('y1'),
        inSvg(svg, '.pt-struct-repeat-dot').length]));
    const dots = nums(svg, '.pt-struct-repeat-dot', 'cx');
    check('у |: точки справа от черты, у :| — слева',
      dots[0] > repeatLines[0] && dots[1] > repeatLines[0] &&
      dots[2] < repeatLines[1] && dots[3] < repeatLines[1],
      JSON.stringify([repeatLines, dots]));

    // ---------- 4. Вольты ----------
    svg = load([
      square(11, 'C', { repeatOpen: true }),
      square(12, 'G', { volta: 1, repeatClose: true, repeat: 2 }),
      square(13, 'Am', { volta: 2 }),
      square(14, 'F', { volta: 2 }),
    ]);
    const voltas = inSvg(svg, '.pt-struct-volta');
    check('вольты — скобками с номерами',
      voltas.length === 2 && textsOf(svg, '.pt-struct-mark').join('|') === '1.|2.',
      JSON.stringify([voltas.length, textsOf(svg, '.pt-struct-mark').join('|')]));
    check('соседние квадраты одной вольты — одной скобкой на всю группу',
      voltas[1].getAttribute('d').indexOf('192.00') !== -1 && voltas[1].getAttribute('d').indexOf('384.00') !== -1,
      voltas[1].getAttribute('d'));
    check('скобка вольты выше верхней линейки',
      Number(voltas[0].getAttribute('d').split(' ')[2].replace('L', '')) < 10,
      voltas[0].getAttribute('d'));

    // ---------- 5. Темп секции ----------
    svg = load([square(11, 'C')]);
    check('без своего темпа знака на стане нет', inSvg(svg, '.pt-struct-tempo').length === 0);
    svg = load([square(11, 'C')], { bpm: 96 });
    check('темп секции печатается знаком «♩=N» в начале системы',
      textsOf(svg, '.pt-struct-tempo').join('') === '♩=96' &&
      Number(inSvg(svg, '.pt-struct-tempo')[0].getAttribute('x')) === 2,
      textsOf(svg, '.pt-struct-tempo').join(''));

    // ---------- 6. Согласованность с лентой ----------
    const layout = JSON.parse(w.eval(`(function () {
      const sec = sections[0];
      return JSON.stringify(partStructureLayout(sec, null));
    })()`));
    check('раскладка знаков совпадает с подписями ленты',
      layout.marks.map((m) => m.text).join('|') ===
        w.eval('sections[0].squares.map((sq) => structureMarkOf(sq) ? STRUCTURE_MARKS[structureMarkOf(sq)] : "").filter(Boolean).join("|")') &&
      layout.tempo === w.eval('sections[0].bpm ? "♩=" + sections[0].bpm : null'),
      JSON.stringify(layout));

    // ---------- 7. Бас ----------
    svg = load([
      square(11, 'C', { mark: 'segno' }),
      square(12, 'G', { repeatClose: true, repeat: 2 }),
    ], null, 'bass');
    check('у баса знаки тоже на стане (струн четыре, стан ниже)',
      textsOf(svg, '.pt-struct-mark').join('') === 'Segno' &&
      inSvg(svg, '.pt-struct-repeat').length === 1 &&
      inSvg(svg, '.pt-note').length === 1,
      JSON.stringify([textsOf(svg, '.pt-struct-mark').join(''), inSvg(svg, '.pt-struct-repeat').length]));

    console.log(`\nитого: ${pass} ok, ${fail} FAIL`);
    if (fail) process.exitCode = 1;
  } catch (e) {
    console.error('ОШИБКА:', e && e.stack ? e.stack : e);
    process.exitCode = 1;
  }
});
