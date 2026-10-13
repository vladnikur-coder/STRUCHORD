#!/usr/bin/env node
/*
 * b12-structure.js — B-12.7.1 «Знаки структуры»: модель и показ на ленте.
 *
 * Проверяем:
 *  1. Модель: вольта 1…9, метка Segno/Coda/Fine/To Coda, переход D.C./D.S. с
 *     целью (Fine/Coda/Конец), черты повтора — строго true; мусор отбрасывается;
 *  2. Файл: знаки уезжают в песню и читаются назад, «пусто» в файл не пишется,
 *     схема не меняется;
 *  3. Подпись у квадрата на ленте: «1.», «|:», «:|», Segno/Coda/Fine/To Coda,
 *     «D.C.→Fine»; пустая — «…» и не видна без наведения;
 *  4. Быстрый путь B-25: постановка знака обновляет подпись без полного render;
 *  5. Панель знаков: строки «Вольта/Черты/Метка/Переход/Цель», активные
 *     варианты, «Цель» не действует без перехода, закрытие по Escape и клику
 *     вне панели;
 *  6. Отмена: одна правка знака — одна команда Store и один Ctrl+Z.
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
function eqJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

const square = (id, chord, extra) => ({
  id, repeat: 1, customBeats: null,
  events: [{ chord, span: 4, timeSig: null, strumPattern: null }],
  ...(extra || {}),
});
const song = (squares, extra) => ({
  schemaVersion: 5, metadata: { artist: 'A', title: 'B' }, bpm: 120, globalKey: 'C',
  keyMode: 'manual', globalTimeSig: '4/4', tuning: 'e-std', tuningNotes: null, notes: '',
  sections: [
    {
      id: 11, type: 'Verse', customName: null, key: null, shift: null, timeSig: null,
      bpm: null, repeat: 1, strumPattern: null, squares,
    },
  ],
  parts: [], nextId: 90, rhythmPool: null, userFingerings: [], preferredFingerings: [], date: '',
  ...(extra || {}),
});

w.addEventListener('load', async () => {
  try {
    const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
    const settle = () => new Promise((resolve) => setTimeout(resolve, 460));
    const load = (squares, extra) => {
      w.localStorage.setItem('struchord_songs', JSON.stringify([song(squares, extra)]));
      w.loadSong(0);
      w.eval('render()');
      w.confirm = () => true;
    };
    const secId = () => w.eval('sections[0].id');
    const sqId = (index) => w.eval(`sections[0].squares[${index}].id`);
    const squareOf = (index) => JSON.parse(w.eval(`JSON.stringify(sections[0].squares[${index}])`));
    const badgeOf = (index) =>
      w.document.querySelector(
        `.section-card[data-id="${secId()}"] .square[data-square="${sqId(index)}"] .struct-badge`
      );
    const panel = () => w.document.querySelector('.structure-controls');
    const rowButtons = (rowIndex) =>
      Array.from(panel().querySelectorAll('.structure-controls-row')[rowIndex].querySelectorAll('.struct-opt'));
    const clickByText = (buttons, text) => {
      const btn = buttons.filter((b) => b.textContent === text)[0];
      if (!btn) throw new Error(`нет кнопки «${text}» среди ${buttons.map((b) => b.textContent).join(', ')}`);
      btn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      return btn;
    };
    const fileOf = () => {
      const lib = JSON.parse(w.localStorage.getItem('struchord_songs'));
      return lib[lib.length - 1];
    };

    // ================= 1. Модель: чистые функции =================
    check('вольта: только 1…9, остальное — «нет»',
      w.eval('structureVoltaOf({ volta: 2 })') === 2 &&
      w.eval('structureVoltaOf({ volta: "3" })') === 3 &&
      w.eval('structureVoltaOf({ volta: 0 })') === null &&
      w.eval('structureVoltaOf({ volta: 12 })') === null &&
      w.eval('structureVoltaOf({ volta: "первая" })') === null &&
      w.eval('structureVoltaOf({})') === null);
    check('метка: только из списка, чужое — «нет»',
      w.eval('structureMarkOf({ mark: "segno" })') === 'segno' &&
      w.eval('structureMarkOf({ mark: "toCoda" })') === 'toCoda' &&
      w.eval('structureMarkOf({ mark: "кода" })') === null &&
      w.eval('structureMarkOf({})') === null);
    check('переход: тип только dc/ds, неизвестная цель — «Конец»',
      eqJson(JSON.parse(w.eval('JSON.stringify(structureJumpOf({ jump: { type: "ds", target: "coda" } }))')),
        { type: 'ds', target: 'coda' }) &&
      eqJson(JSON.parse(w.eval('JSON.stringify(structureJumpOf({ jump: { type: "dc", target: "не туда" } }))')),
        { type: 'dc', target: 'end' }) &&
      w.eval('structureJumpOf({ jump: { type: "ff" } })') === null &&
      w.eval('structureJumpOf({ jump: "dc" })') === null &&
      w.eval('structureJumpOf({})') === null);
    check('черты повтора — строго true',
      w.eval('structureRepeatOpen({ repeatOpen: true })') === true &&
      w.eval('structureRepeatOpen({ repeatOpen: 1 })') === false &&
      w.eval('structureRepeatClose({ repeatClose: "да" })') === false);
    check('подпись квадрата собирается из всех знаков сразу',
      w.eval('structureBadgeText({ volta: 2, repeatOpen: true, repeatClose: true, mark: "segno", jump: { type: "dc", target: "fine" } })') ===
        '2. |: :| Segno D.C.→Fine' &&
      // На бейдже ленты черты не дублируются — они рисуются рамкой квадрата.
      w.eval('structureBadgeShort({ volta: 2, repeatOpen: true, repeatClose: true, mark: "segno", jump: { type: "dc", target: "fine" } })') ===
        '2. Segno D.C.→Fine' &&
      w.eval('structureBadgeShort({})') === '' &&
      w.eval('structureTitle({}).indexOf("Знаки структуры")') === 0 &&
      w.eval('structureSquareClass({ repeatOpen: true })') === ' square--repeat-open' &&
      w.eval('structureSquareClass({ repeatClose: true })') === ' square--repeat-close' &&
      w.eval('structureSquareClass({ repeatOpen: true, repeatClose: true })') ===
        ' square--repeat-open square--repeat-close');

    // ================= 2. Файл =================
    load([
      square(21, 'C', { volta: 1, repeatClose: true }),
      square(22, 'G', { mark: 'segno', jump: { type: 'ds', target: 'coda' }, volta: 2 }),
    ]);
    w.saveCurrentSong();
    const saved = fileOf().sections[0].squares;
    check('знаки уезжают в файл',
      saved[0].volta === 1 && saved[0].repeatClose === true && saved[0].repeatOpen === undefined &&
      saved[0].mark === undefined && saved[0].jump === undefined &&
      saved[1].volta === 2 && saved[1].mark === 'segno' &&
      eqJson(saved[1].jump, { type: 'ds', target: 'coda' }),
      JSON.stringify(saved));
    check('схема файла не меняется ради знаков',
      fileOf().schemaVersion === 5, String(fileOf().schemaVersion));
    w.loadSong(0);
    w.eval('render()');
    check('знаки пережили перезагрузку песни',
      squareOf(0).volta === 1 && squareOf(0).repeatClose === true &&
      squareOf(1).mark === 'segno' && squareOf(1).jump.type === 'ds' && squareOf(1).jump.target === 'coda',
      JSON.stringify([squareOf(0), squareOf(1)]));
    load([square(21, 'C'), square(22, 'G')]);
    w.saveCurrentSong();
    check('обычная песня в файле не растёт: пустых полей нет',
      fileOf().sections[0].squares.every((sq) =>
        sq.volta === undefined && sq.mark === undefined && sq.jump === undefined &&
        sq.repeatOpen === undefined && sq.repeatClose === undefined),
      JSON.stringify(fileOf().sections[0].squares));
    load([
      square(21, 'C', { volta: 0, mark: 'кода', jump: { type: 'ff' }, repeatOpen: 'да' }),
      square(22, 'G', { volta: 12, jump: { type: 'dc', target: 'не туда' }, repeatClose: true }),
    ]);
    check('мусор в знаках отбрасывается поштучно',
      squareOf(0).volta === undefined && squareOf(0).mark === undefined &&
      squareOf(0).jump === undefined && squareOf(0).repeatOpen === undefined &&
      squareOf(1).volta === undefined && squareOf(1).jump.target === 'end' &&
      squareOf(1).repeatClose === true,
      JSON.stringify([squareOf(0), squareOf(1)]));

    // ================= 3. Подпись на ленте =================
    load([
      square(21, 'C', { volta: 1, repeatClose: true }),
      square(22, 'G', { mark: 'coda' }),
      square(23, 'Am'),
    ]);
    const squareNode = (index) =>
      w.document.querySelector(`.section-card[data-id="${secId()}"] .square[data-square="${sqId(index)}"]`);
    check('подпись квадрата показывает вольту, а черта рисуется рамкой квадрата',
      badgeOf(0).textContent === '1.' && badgeOf(0).classList.contains('struct-badge--visible') &&
      squareNode(0).classList.contains('square--repeat-close') &&
      !squareNode(0).classList.contains('square--repeat-open') &&
      badgeOf(0).title.indexOf('Знаки структуры: 1. :|') === 0,
      JSON.stringify([badgeOf(0).textContent, squareNode(0).className, badgeOf(0).title]));
    check('подпись показывает метку', badgeOf(1).textContent === 'Coda', badgeOf(1).textContent);
    check('без знаков подпись пустая («…») и не видна без наведения',
      badgeOf(2).textContent === '…' && !badgeOf(2).classList.contains('struct-badge--visible') &&
      badgeOf(2).title.indexOf('Знаки структуры') === 0,
      JSON.stringify([badgeOf(2).textContent, badgeOf(2).className]));
    // Быстрый путь: подпись обновляется на месте, узел не пересобирается
    // (полный render заменил бы элемент новым).
    const badgeNodeBefore = badgeOf(2);
    w.eval(`applySquareStructure(${secId()}, ${sqId(2)}, { mark: 'fine', jump: { type: 'dc', target: 'fine' } });`);
    check('постановка знака обновляет подпись быстрым путём B-25',
      badgeOf(2).textContent === 'Fine D.C.→Fine' && badgeOf(2) === badgeNodeBefore,
      JSON.stringify([badgeOf(2).textContent, badgeOf(2) === badgeNodeBefore]));
    w.eval(`applySquareStructure(${secId()}, ${sqId(2)}, { repeatOpen: true });`);
    check('черта повтора без полного render появляется рамкой',
      badgeOf(2) === badgeNodeBefore && squareNode(2).classList.contains('square--repeat-open') &&
      badgeOf(2).textContent === 'Fine D.C.→Fine',
      JSON.stringify([squareNode(2).className, badgeOf(2).textContent]));
    w.eval(`applySquareStructure(${secId()}, ${sqId(2)}, { repeatOpen: null });`);
    await settle();
    w.undoEdit();
    await tick();
    check('знаки отменяются одним Ctrl+Z',
      squareOf(2).mark === undefined && squareOf(2).jump === undefined && squareOf(2).repeatOpen === undefined,
      JSON.stringify(squareOf(2)));

    // ================= 4. Темповый знак =================
    w.eval(`setSectionBpm(${secId()}, 100)`);
    w.eval('render()');
    const tempoBadge = w.document.querySelector('.section-badge--bpm');
    check('темп секции показывается знаком «♩=N»',
      !!tempoBadge && tempoBadge.textContent === '♩=100' && tempoBadge.title.indexOf('100 BPM') > 0,
      tempoBadge ? JSON.stringify([tempoBadge.textContent, tempoBadge.title]) : 'бейджа нет');
    w.eval(`setSectionBpm(${secId()}, null)`);
    w.eval('render()');
    check('без своего темпа знака нет (глобальный темп — в шапке)',
      !w.document.querySelector('.section-badge--bpm'));

    // ================= 5. Панель знаков =================
    w.eval('render()');
    const badge = badgeOf(0);
    badge.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    check('панель открывается у квадрата и знает, где он',
      !!panel() && panel().dataset.sec === String(secId()) &&
      panel().dataset.square === String(sqId(0)) &&
      panel().querySelectorAll('.structure-controls-row').length === 5,
      panel() ? panel().textContent : 'панели нет');
    check('активное состояние показывает, что уже стоит',
      rowButtons(0).filter((b) => b.classList.contains('is-on'))[0].textContent === '1.' &&
      rowButtons(1).filter((b) => b.classList.contains('is-on'))[0].textContent === 'Конец :|' &&
      rowButtons(2).filter((b) => b.classList.contains('is-on'))[0].textContent === 'Нет',
      JSON.stringify(rowButtons(0).map((b) => [b.textContent, b.className])));
    clickByText(rowButtons(2), 'Segno');
    check('метка ставится из панели и сразу видна на ленте',
      squareOf(0).mark === 'segno' && badgeOf(0).textContent === '1. Segno',
      JSON.stringify([squareOf(0), badgeOf(0).textContent]));
    clickByText(rowButtons(2), 'Нет');
    check('«Нет» в метке снимает знак',
      squareOf(0).mark === undefined && badgeOf(0).textContent === '1.',
      String(squareOf(0).mark));
    clickByText(rowButtons(3), 'D.C.');
    clickByText(rowButtons(4), 'Coda');
    check('переход и цель ставятся вместе и попадают в подпись',
      eqJson(squareOf(0).jump, { type: 'dc', target: 'coda' }) &&
      badgeOf(0).textContent === '1. D.C.→Coda',
      JSON.stringify([squareOf(0), badgeOf(0).textContent]));
    clickByText(rowButtons(3), 'Нет');
    check('«Нет» в переходе снимает переход целиком', squareOf(0).jump === undefined);
    const goalRow = rowButtons(4);
    check('без перехода строка «Цель» не действует',
      goalRow.every((b) => b.classList.contains('is-inactive')) &&
      (clickByText(goalRow, 'Fine'), squareOf(0).jump === undefined));
    clickByText(rowButtons(0), '3.');
    check('вольта ставится из панели', squareOf(0).volta === 3, String(squareOf(0).volta));
    clickByText(rowButtons(0), 'Нет');
    clickByText(rowButtons(1), 'Обе |: :|');
    check('черты повтора ставятся обе сразу',
      squareOf(0).repeatOpen === true && squareOf(0).repeatClose === true);
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    check('Escape закрывает панель', !panel());
    badgeOf(1).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    w.document.dispatchEvent(new w.Event('pointerdown', { bubbles: true }));
    check('клик вне панели закрывает её', !panel());
    await settle();
    w.undoEdit();
    await tick();
    check('вся цепочка правок отменяется одним Ctrl+Z',
      squareOf(0).repeatOpen === undefined && squareOf(0).repeatClose === true,
      JSON.stringify(squareOf(0)));

    console.log(`\nитого: ${pass} ok, ${fail} FAIL`);
    if (fail) process.exitCode = 1;
  } catch (e) {
    console.error('ОШИБКА:', e && e.stack ? e.stack : e);
    process.exitCode = 1;
  }
});
