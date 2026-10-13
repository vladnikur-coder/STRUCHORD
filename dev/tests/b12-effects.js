#!/usr/bin/env node
/*
 * b12-effects.js — B-12.6 «Приёмы», итерация 1: штрих и динамика.
 *
 * Проверяем:
 *  1. Палитру приёмов: девять кнопок, у каждой клавиша в подсказке;
 *  2. Клавиши GP: `[` палм-мьют, `I` let ring, `X` dead, `O` ghost,
 *     `;`/`Shift+;` акценты, `Shift+1` стаккато, `Shift+T` теното,
 *     `Shift+,`/`Shift+.` fade in/out; повторное нажатие снимает знак;
 *  3. Знаки не ломают 12.2: `Shift+1` не вводит лад, `_` по-прежнему
 *     удлиняет ноту, `Ctrl+.` — двойная точка;
 *  4. Рисование: PM, L.R., крестик dead, скобки ghost, акценты, артикуляция,
 *     fade и пунктир палм-мьюта по серии нот;
 *  5. Звук: палм-мьют короче/глуше/тише и обрывается, dead — щелчок,
 *     ghost — тише, акценты — громче, стаккато короче, теното держит
 *     написанное, let ring звенит до следующей ноты струны, fade in/out —
 *     плавный вход и спад;
 *  6. Файл: знаки уезжают в песню необязательными полями и читаются назад;
 *  7. Мусор в файле (`pm: 'yes'`, `accent: 7`, `fade: 'sideways'`)
 *     отбрасывается поштучно;
 *  8. Взаимоисключения: стаккато/теното и fade in/out не стоят вместе;
 *  9. Отмена: знак ставится и снимается одним шагом Ctrl+Z;
 * 10. Знаки не задевают соседние ноты и другие дорожки.
 * 11. Итерация 2: легато (H), слайды (S / Alt+S), вибрато (V / Alt+V),
 *     тремоло-пикинг — клавиши, палитра, рисование, звук и файл.
 * 13. Итерация 4: флажолеты (Y — натуральный, Alt+Y — искусственный через
 *     окно параметров), украшения (мордент, тёрн), трель (N), тремоло-бар
 *     (W) и поиск по палитре (Ctrl+E).
 * 12. Итерация 3: бенды — окно кривой (пресеты, типы, перетаскивание
 *     точек, добавление и удаление), величина словами, знак на табе,
 *     кривая высоты в звуке, санитайз и файл.
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

const square = (id, chord) => ({
  id, repeat: 1, customBeats: 4,
  events: [{ chord, span: 4, timeSig: null, strumPattern: null }],
});
const song = (parts) => ({
  schemaVersion: 5, metadata: { artist: 'A', title: 'B' }, bpm: 120, globalKey: 'C',
  keyMode: 'manual', globalTimeSig: '4/4', tuning: 'e-std', tuningNotes: null, notes: '',
  sections: [{
    id: 1, type: 'Verse', customName: null, key: null, shift: null, timeSig: null,
    bpm: null, repeat: 1, strumPattern: null, squares: [square(11, 'C')],
  }],
  parts, nextId: 90, rhythmPool: null, userFingerings: [], preferredFingerings: [], date: '',
});
// Три ноты на одной струне (для «звенит до следующей») и одна на другой.
const notes = [
  { start: 0, dur: 1, string: 5, fret: 7 },
  { start: 1, dur: 1, string: 5, fret: 5 },
  { start: 2, dur: 1, string: 4, fret: 3 },
];
const guitar = { id: 1, name: 'Соло', instrument: 'guitar', tuning: null, visible: true, rolls: { '1': notes } };

w.addEventListener('load', async () => {
  try {
    // jsdom не тикает requestAnimationFrame: он подменён на setTimeout, но
    // колбэк выполняется только когда освободится событийный цикл. Истории
    // правок это важно: флаг «идёт восстановление» снимается в кадре, и до
    // него следующая правка не попадёт в стек отмены.
    const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
    // История ссыпает серию быстрых правок в один шаг с задержкой 400 мс.
    // Там, где шаг должен быть отдельным, эту задержку надо переждать.
    const settle = () => new Promise((resolve) => setTimeout(resolve, 460));
    const load = (parts) => {
      w.localStorage.setItem('struchord_songs', JSON.stringify([song(parts)]));
      w.loadSong(0);
      w.eval('render()');
      w.confirm = () => true;
    };
    const key = (k, opts) => {
      w.document.dispatchEvent(new w.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true }, opts || {})));
    };
    const roll = (i) => JSON.parse(w.eval(`JSON.stringify(songParts[${i}].rolls[String(sections[0].id)] || [])`));
    const noteAt = (i, idx) => roll(i)[idx];
    // Курсор на ноту (idx) струны 5 активной дорожки.
    // secId передаём ЧИСЛОМ: partCursorState ищет секцию строгим сравнением.
    const cursorTo = (idx, string) =>
      w.eval(`setPartsCursorString(sections[0].id, 0, ${string === undefined ? 5 : string}, ${notes[idx].start})`);
    const chipText = () => Array.from(w.document.querySelectorAll('.pt-row.is-active .pt-note')).length;
    const markTexts = (cls) =>
      Array.from(w.document.querySelectorAll(`.pt-row.is-active .${cls}`)).map((el) => el.textContent);

    // ---------- 1. Палитра приёмов ----------
    load([guitar]);
    w.eval('togglePartsMode(true)');
    const toneButtons = w.document.querySelectorAll('#ptToneGroup .pt-pal-btn');
    check('в палитре шестнадцать кнопок приёмов (9 штриха + 6 новых + бенд)', toneButtons.length === 16, String(toneButtons.length));
    check('у каждой кнопки есть подсказка с клавишей',
      Array.from(toneButtons).every((b) => (b.title || '').length > 10 && /клавиш/i.test(b.title)),
      JSON.stringify(Array.from(toneButtons).map((b) => b.title)));
    check('подсказка палитры перечисляет клавиши приёмов',
      /палм-мьют/.test(w.document.querySelector('.pt-pal-hint').textContent) &&
      /стаккато/.test(w.document.querySelector('.pt-pal-hint').textContent),
      w.document.querySelector('.pt-pal-hint').textContent);

    // ---------- 2. Клавиши: постановка и снятие ----------
    cursorTo(0);
    key('[', { code: 'BracketLeft' });
    check('`[` поставил палм-мьют', noteAt(0, 0).pm === true, JSON.stringify(noteAt(0, 0)));
    key('[', { code: 'BracketLeft' });
    check('повторное `[` сняло палм-мьют', !('pm' in noteAt(0, 0)), JSON.stringify(noteAt(0, 0)));
    key('x', { code: 'KeyX' });
    check('`X` поставил dead note', noteAt(0, 0).dead === true, JSON.stringify(noteAt(0, 0)));
    key('o', { code: 'KeyO' });
    check('`O` поставил ghost note', noteAt(0, 0).ghost === true, JSON.stringify(noteAt(0, 0)));
    key('i', { code: 'KeyI' });
    check('`I` поставил let ring', noteAt(0, 0).letRing === true, JSON.stringify(noteAt(0, 0)));
    key(';', { code: 'Semicolon' });
    check('`;` поставил акцент', noteAt(0, 0).accent === 1, JSON.stringify(noteAt(0, 0)));
    key(':', { code: 'Semicolon', shiftKey: true });
    check('`Shift+;` поставил сильный акцент', noteAt(0, 0).accent === 2, JSON.stringify(noteAt(0, 0)));
    key(';', { code: 'Semicolon' });
    check('`;` на сильном акценте опускает его до обычного', noteAt(0, 0).accent === 1);
    key(';', { code: 'Semicolon' });
    check('второй `;` снял акцент вовсе', !('accent' in noteAt(0, 0)), JSON.stringify(noteAt(0, 0)));

    // ---------- 3. Артикуляция и fade ----------
    cursorTo(1);
    const beforeDigits = roll(0).length;
    key('!', { code: 'Digit1', shiftKey: true });
    check('`Shift+1` поставил стаккато', noteAt(0, 1).staccato === true, JSON.stringify(noteAt(0, 1)));
    check('`Shift+1` НЕ ввёл лад 1', roll(0).length === beforeDigits && noteAt(0, 1).fret === 5,
      JSON.stringify(noteAt(0, 1)));
    key('T', { code: 'KeyT', shiftKey: true });
    check('`Shift+T` поставил теното', noteAt(0, 1).tenuto === true, JSON.stringify(noteAt(0, 1)));
    check('теното сняло стаккато (взаимоисключение)', !('staccato' in noteAt(0, 1)),
      JSON.stringify(noteAt(0, 1)));
    key('!', { code: 'Digit1', shiftKey: true });
    check('стаккато в свою очередь сняло теното',
      noteAt(0, 1).staccato === true && !('tenuto' in noteAt(0, 1)), JSON.stringify(noteAt(0, 1)));
    key('>', { code: 'Period', shiftKey: true });
    check('`Shift+.` поставил fade out', noteAt(0, 1).fade === 'out', JSON.stringify(noteAt(0, 1)));
    key('<', { code: 'Comma', shiftKey: true });
    check('`Shift+,` поставил fade in и снял fade out',
      noteAt(0, 1).fade === 'in', JSON.stringify(noteAt(0, 1)));
    key('<', { code: 'Comma', shiftKey: true });
    check('повторный `Shift+,` снял fade', !('fade' in noteAt(0, 1)), JSON.stringify(noteAt(0, 1)));

    // ---------- 4. Регресс 12.2: клавиши длительностей и ладов ----------
    cursorTo(1);
    const durBefore = noteAt(0, 1).dur;
    key('_', { code: 'Minus', shiftKey: true });
    check('`_` по-прежнему удлиняет ноту (12.2 не сломан)',
      noteAt(0, 1).dur > durBefore, JSON.stringify([durBefore, noteAt(0, 1).dur]));
    key('=', { code: 'Equal' });
    key('=', { code: 'Equal' });
    check('`=` укорачивает ноту', noteAt(0, 1).dur < durBefore, String(noteAt(0, 1).dur));
    w.eval('partInput.dots = 0; partInput.triplet = false;');
    key('.', { code: 'Period' });
    key('.', { code: 'Period', ctrlKey: true });
    w.eval('setPartsDuration(4)');
    check('`Ctrl+.` ставит двойную точку', noteAt(0, 1).dots === 2, JSON.stringify(noteAt(0, 1)));
    w.eval('partInput.dots = 0; applyPartsInputToCursorNote();');
    w.eval('partInput.tone = partToneDefaults();');

    // ---------- 5. Рисование знаков ----------
    const longSong = song([{ ...guitar, rolls: { '1': [
      { start: 0, dur: 1, string: 5, fret: 7, pm: true, accent: 1 },
      { start: 1, dur: 1, string: 5, fret: 5, pm: true, letRing: true },
      { start: 2, dur: 1, string: 4, fret: 3, dead: true },
      { start: 3, dur: 1, string: 4, fret: 2, ghost: true, staccato: true },
      { start: 4, dur: 1, string: 3, fret: 9, faded: true },
    ] } }]);
    longSong.sections[0].squares.push({ id: 12, repeat: 1, customBeats: 4, events: [{ chord: 'F', span: 4, timeSig: null, strumPattern: null }] });
    w.localStorage.setItem('struchord_songs', JSON.stringify([longSong]));
    w.loadSong(0);
    w.eval('render()');
    w.eval('togglePartsMode(true)');
    w.eval('renderPartsScreen()');
    check('все пять нот нарисованы', chipText() === 5, String(chipText()));
    check('PM подписан над серией', markTexts('pt-mark-pm').length === 2, JSON.stringify(markTexts('pt-mark-pm')));
    check('L.R. подписан', markTexts('pt-mark-letring').length === 1, JSON.stringify(markTexts('pt-mark-letring')));
    check('акцент и стаккато нарисованы', markTexts('pt-mark-accent').join('') === '>',
      JSON.stringify(markTexts('pt-mark-accent')));
    check('стаккато нарисовано точкой', markTexts('pt-mark-artic').join('') === '•',
      JSON.stringify(markTexts('pt-mark-artic')));
    const rowTexts = () =>
      Array.from(w.document.querySelectorAll('.pt-row.is-active text')).map((el) => el.textContent);
    check('dead note — крестик вместо лада', rowTexts().includes('x'), JSON.stringify(rowTexts()));
    check('ghost note — номер в скобках', rowTexts().includes('(2)'), JSON.stringify(rowTexts()));
    check('пунктир палм-мьюта нарисован', w.document.querySelectorAll('.pt-row.is-active .pt-pm-line').length === 1,
      String(w.document.querySelectorAll('.pt-row.is-active .pt-pm-line').length));
    const pmLine = w.document.querySelector('.pt-row.is-active .pt-pm-line');
    const staff = JSON.parse(w.eval(`JSON.stringify({
      top: PART_TAB_TOP_PAD,
      strings: songParts[0].rolls[String(sections[0].id)].length,
      box: document.querySelector('.pt-row.is-active .pt-svg').getAttribute('viewBox').split(' ').map(Number),
    })`));
    check('пунктир PM вынесен над станом, а не по струнам',
      Number(pmLine.getAttribute('y1')) < staff.top, JSON.stringify({ y: pmLine.getAttribute('y1'), staff }));
    check('подписи знаков не пересекают строку пунктира',
      markTexts('pt-mark-pm').length === 2 &&
      Array.from(w.document.querySelectorAll('.pt-row.is-active .pt-mark-pm'))
        .every((el) => Number(el.getAttribute('y')) < Number(pmLine.getAttribute('y1'))),
      JSON.stringify(Array.from(w.document.querySelectorAll('.pt-row.is-active .pt-mark-pm'))
        .map((el) => el.getAttribute('y'))));
    check('пунктир тянется от первой ноты серии до последней',
      Math.abs(Number(pmLine.getAttribute('x1')) - 2) < 0.01 &&
      Math.abs(Number(pmLine.getAttribute('x2')) - 2 * 24) < 0.01,
      JSON.stringify({ x1: pmLine.getAttribute('x1'), x2: pmLine.getAttribute('x2') }));
    check('знак «faded» (неизвестное поле) ничего не рисует',
      markTexts('pt-mark-fade').length === 0, JSON.stringify(markTexts('pt-mark-fade')));
    // Полки вокруг стана: запас снизу — под артикуляцию и акцент.
    check('запас viewBox посчитан по занятым полкам',
      staff.box[1] === -41 && staff.box[3] === 65 + 41 + 28,
      JSON.stringify(staff.box));

    // Стан без знаков остаётся геометрией 12.3: запас не тратится зря.
    load([{ ...guitar, rolls: { '1': [{ start: 0, dur: 1, string: 5, fret: 7 }] } }]);
    w.eval('togglePartsMode(true)');
    const plainBox = w.eval(
      `document.querySelector('.pt-row.is-active .pt-svg').getAttribute('viewBox')`
    ).split(' ').map(Number);
    check('стан без знаков — геометрия 12.3 (без запаса вокруг)',
      plainBox[1] === 0 && plainBox[3] === 10 * 2 + 9 * 5, JSON.stringify(plainBox));

    // ---------- 6. Звук: заглушка pluckString ----------
    w.eval(`
      window.__plucks = [];
      pluckString = function(ctx, opts) { window.__plucks.push(opts); };
    `);
    const play = (noteJson) => {
      w.eval(`songParts[0].rolls[String(sections[0].id)] = [${JSON.stringify(noteJson)}];
        window.__plucks = [];
        schedulePartsForEvent({}, sections[0], sections[0].squares[0], 0, 0, 1);`);
      return JSON.parse(w.eval('JSON.stringify(window.__plucks)'))[0];
    };
    const base = play({ start: 0, dur: 1, string: 5, fret: 7 });
    check('обычная нота: базовые громкость и яркость',
      Math.abs(base.gain - 0.42) < 1e-6 && !base.releaseAt && !base.fadeIn && !base.fadeOut,
      JSON.stringify(base));
    const pm = play({ start: 0, dur: 1, string: 5, fret: 7, pm: true });
    check('палм-мьют короче, глуше и тише обычной ноты',
      pm.duration < base.duration && pm.brightness < base.brightness && pm.gain < base.gain,
      JSON.stringify([base, pm]));
    check('палм-мьют обрывается (releaseAt = конец звона)',
      Math.abs(pm.releaseAt - pm.duration) < 1e-6, JSON.stringify(pm));
    const dead = play({ start: 0, dur: 1, string: 5, fret: 7, dead: true });
    check('dead note — короткий щелчок с высокой яркостью',
      dead.duration <= 0.075 && dead.brightness > base.brightness && dead.gain < base.gain, JSON.stringify(dead));
    const ghost = play({ start: 0, dur: 1, string: 5, fret: 7, ghost: true });
    check('ghost note тише обычной', ghost.gain < base.gain && ghost.duration === base.duration, JSON.stringify(ghost));
    const acc1 = play({ start: 0, dur: 1, string: 5, fret: 7, accent: 1 });
    const acc2 = play({ start: 0, dur: 1, string: 5, fret: 7, accent: 2 });
    check('акценты громче обычной, сильный — сильнее',
      acc1.gain > base.gain && acc2.gain > acc1.gain, JSON.stringify([base.gain, acc1.gain, acc2.gain]));
    const stac = play({ start: 0, dur: 1, string: 5, fret: 7, staccato: true });
    check('стаккато короче и обрывается', stac.duration < base.duration && stac.releaseAt > 0, JSON.stringify(stac));
    // Теното: длинная нота, у которой базовый звон упёрся в потолок.
    w.eval(`songParts[0].rolls[String(sections[0].id)] = [
      { start: 0, dur: 8, string: 5, fret: 7, tenuto: true }];
      window.__plucks = [];
      schedulePartsForEvent({}, sections[0], sections[0].squares[0], 0, 0, 8);`);
    const tenuto = JSON.parse(w.eval('JSON.stringify(window.__plucks)'))[0];
    w.eval(`songParts[0].rolls[String(sections[0].id)] = [
      { start: 0, dur: 8, string: 5, fret: 7 }];
      window.__plucks = [];
      schedulePartsForEvent({}, sections[0], sections[0].squares[0], 0, 0, 8);`);
    const plain8 = JSON.parse(w.eval('JSON.stringify(window.__plucks)'))[0];
    check('теното держит написанное дольше обычного звона (3 с потолок → 6 с)',
      plain8.duration === 3 && tenuto.duration === 6, JSON.stringify([plain8.duration, tenuto.duration]));
    // Let ring: звенит до следующей ноты этой же струны.
    w.eval(`songParts[0].rolls[String(sections[0].id)] = [
      { start: 0, dur: 1, string: 5, fret: 7, letRing: true },
      { start: 3, dur: 1, string: 5, fret: 5 }];
      window.__plucks = [];
      schedulePartsForEvent({}, sections[0], sections[0].squares[0], 0, 0, 4);`);
    const lr = JSON.parse(w.eval('JSON.stringify(window.__plucks)'))[0];
    check('let ring звенит до следующей ноты той же струны (3 единицы = 2.98 с)',
      Math.abs(lr.duration - 2.98) < 0.02, JSON.stringify(lr));
    const fadeIn = play({ start: 0, dur: 1, string: 5, fret: 7, fade: 'in' });
    check('fade in доезжает до голоса как флаг', fadeIn.fadeIn === true, JSON.stringify(fadeIn));
    const fadeOut = play({ start: 0, dur: 1, string: 5, fret: 7, fade: 'out' });
    check('fade out доезжает до голоса как флаг', fadeOut.fadeOut === true, JSON.stringify(fadeOut));

    // ---------- 7. Файл и мусор ----------
    load([guitar]);
    w.eval('togglePartsMode(true)');
    cursorTo(0);
    key('[', { code: 'BracketLeft' });
    key(':', { code: 'Semicolon', shiftKey: true });
    w.saveCurrentSong();
    const lib = JSON.parse(w.localStorage.getItem('struchord_songs'));
    const saved = lib[lib.length - 1];
    const savedNote = saved.parts[0].rolls['1'][0];
    check('знаки уехали в файл', savedNote.pm === true && savedNote.accent === 2, JSON.stringify(savedNote));
    const savedIdx = lib.length - 1;
    w.loadSong(savedIdx);
    w.eval('render()');
    check('знаки пережили перезагрузку',
      noteAt(0, 0).pm === true && noteAt(0, 0).accent === 2, JSON.stringify(noteAt(0, 0)));
    // Мусор
    w.localStorage.setItem('struchord_songs', JSON.stringify([song([{
      id: 1, name: 'Соло', instrument: 'guitar', tuning: null, visible: true,
      rolls: { '1': [
        { start: 0, dur: 1, string: 5, fret: 7, pm: 'yes', accent: 7, fade: 'sideways', ghost: 1 },
        { start: 1, dur: 1, string: 5, fret: 5, accent: 2, staccato: true, tenuto: true, fade: 'out' },
      ] },
    }])]));
    w.loadSong(0);
    w.eval('render()');
    check('мусорные значения знаков отброшены',
      eqJson(Object.keys(roll(0)[0]).sort(), ['dur', 'fret', 'start', 'string']),
      JSON.stringify(roll(0)[0]));
    check('правильные значения приняты',
      roll(0)[1].accent === 2 && roll(0)[1].staccato === true && roll(0)[1].tenuto === true &&
      roll(0)[1].fade === 'out', JSON.stringify(roll(0)[1]));

    // ---------- 8. Отмена и соседи ----------
    load([guitar]);
    w.eval('resetHistory()');
    w.eval('togglePartsMode(true)');
    cursorTo(0);
    const neighbourBefore = JSON.stringify(noteAt(0, 1));
    key('[', { code: 'BracketLeft' });
    check('знак поставлен только на ноту под курсором',
      noteAt(0, 0).pm === true && JSON.stringify(noteAt(0, 1)) === neighbourBefore,
      JSON.stringify(roll(0)));
    w.undoEdit();
    w.eval('render()');
    await tick(); // отпускаем флаг восстановления до следующей правки
    check('Ctrl+Z снимает знак целиком',
      !('pm' in noteAt(0, 0)) && JSON.stringify(noteAt(0, 1)) === neighbourBefore, JSON.stringify(roll(0)));
    // Кнопка палитры делает то же, что клавиша.
    cursorTo(0);
    w.document.querySelector('#ptToneGroup .pt-pal-btn[data-tone="ghost"]')
      .dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    check('кнопка палитры ставит знак', noteAt(0, 0).ghost === true, JSON.stringify(noteAt(0, 0)));
    check('кнопка палитры подсвечена как активная',
      w.document.querySelector('#ptToneGroup .pt-pal-btn[data-tone="ghost"]').classList.contains('is-on'));
    w.eval('renderPartsScreen()');
    check('приёмы второй дорожки не тронуты',
      w.eval('songParts.length') === 1, String(w.eval('songParts.length')));

    // ═══════════ Итерация 12.6.2: легато, слайды, вибрато, тремоло ═══════════

    // ---------- 9. Клавиши и палитра 12.6.2 ----------
    load([guitar]);
    w.eval('togglePartsMode(true)');
    const toneBtn = (kind) => w.document.querySelector(`#ptToneGroup .pt-pal-btn[data-tone="${kind}"]`);
    check('шесть новых кнопок приёмов на месте',
      ['legato', 'slide', 'slideShift', 'vibrato', 'vibratoWide', 'tremolo'].every((kind) => !!toneBtn(kind)));
    check('подсказки новых кнопок называют клавиши и объясняют приём',
      ['legato', 'slide', 'slideShift', 'vibrato', 'vibratoWide', 'tremolo']
        .every((kind) => (toneBtn(kind).title || '').length > 20));
    cursorTo(0);
    key('h', { code: 'KeyH' });
    check('`H` поставил легато', noteAt(0, 0).legato === true, JSON.stringify(noteAt(0, 0)));
    key('s', { code: 'KeyS' });
    check('`S` заменил легато слайдом без атаки',
      noteAt(0, 0).slide === 'legato' && !('legato' in noteAt(0, 0)), JSON.stringify(noteAt(0, 0)));
    key('s', { code: 'KeyS', altKey: true });
    check('`Alt+S` — shift slide (с атакой)', noteAt(0, 0).slide === 'shift', JSON.stringify(noteAt(0, 0)));
    key('s', { code: 'KeyS', altKey: true });
    check('повтор `Alt+S` снял слайд', !('slide' in noteAt(0, 0)), JSON.stringify(noteAt(0, 0)));
    key('h', { code: 'KeyH' });
    key('s', { code: 'KeyS' });
    check('слайд снимает легато (приёмы одного смысла)',
      noteAt(0, 0).slide === 'legato' && !('legato' in noteAt(0, 0)), JSON.stringify(noteAt(0, 0)));
    w.eval('syncPartsPalette()');
    check('палитра подсвечивает кнопку слайда без атаки, а не обе',
      toneBtn('slide').classList.contains('is-on') && !toneBtn('slideShift').classList.contains('is-on'));
    key('s', { code: 'KeyS', altKey: true });
    w.eval('syncPartsPalette()');
    check('при shift slide подсвечена другая кнопка',
      toneBtn('slideShift').classList.contains('is-on') && !toneBtn('slide').classList.contains('is-on'));
    key('s', { code: 'KeyS' });
    key('v', { code: 'KeyV' });
    check('`V` — вибрато ±0,25 полутона', noteAt(0, 0).vibrato === 'slight', JSON.stringify(noteAt(0, 0)));
    key('v', { code: 'KeyV' });
    check('повтор `V` снял вибрато', !('vibrato' in noteAt(0, 0)), JSON.stringify(noteAt(0, 0)));
    key('v', { code: 'KeyV', altKey: true });
    check('`Alt+V` — широкое вибрато', noteAt(0, 0).vibrato === 'wide', JSON.stringify(noteAt(0, 0)));
    key('v', { code: 'KeyV' });
    check('`V` сужает широкое вибрато до обычного', noteAt(0, 0).vibrato === 'slight');
    key('v', { code: 'KeyV' });
    // Тремоло-пикинг: в GP клавиши нет — ставится палитрой.
    toneBtn('tremolo').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    check('кнопка палитры ставит тремоло-пикинг', noteAt(0, 0).tremolo === true, JSON.stringify(noteAt(0, 0)));
    check('кнопка тремоло подсвечена', toneBtn('tremolo').classList.contains('is-on'));
    toneBtn('tremolo').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    check('повторное нажатие сняло тремоло-пикинг', !('tremolo' in noteAt(0, 0)), JSON.stringify(noteAt(0, 0)));
    // Регресс 12.2: новые буквы не отобрали цифры и длительности.
    key('7', { code: 'Digit7' });
    check('цифра поверх ноты по-прежнему пишет лад (H/S/V не помешали)',
      noteAt(0, 0).fret === 7, JSON.stringify(noteAt(0, 0)));
    const durBeforeNew = noteAt(0, 0).dur;
    key('_', { code: 'Minus', shiftKey: true });
    check('`_` по-прежнему удлиняет ноту', noteAt(0, 0).dur > durBeforeNew, String(noteAt(0, 0).dur));
    // Приёмы как состояние ввода: включённый знак достаётся следующей ноте.
    w.eval('setPartsCursorString(sections[0].id, 0, 5, 3); partInput.tone = partToneDefaults();');
    key('v', { code: 'KeyV' });
    key('5', { code: 'Digit5' });
    const fresh = noteAt(0, roll(0).length - 1);
    check('новая нота унаследовала включённое вибрато',
      fresh.fret === 5 && fresh.vibrato === 'slight', JSON.stringify(fresh));

    // ---------- 10. Рисование 12.6.2 ----------
    const longSong2 = song([{ ...guitar, rolls: { '1': [
      { start: 0, dur: 1, string: 4, fret: 5 },
      { start: 1, dur: 1, string: 4, fret: 7, slide: 'legato' },
      { start: 2, dur: 1, string: 4, fret: 9, slide: 'shift' },
      { start: 3, dur: 1, string: 5, fret: 3, legato: true, vibrato: 'wide', tremolo: true },
      { start: 4, dur: 1, string: 5, fret: 5, legato: true },
    ] } }]);
    longSong2.sections[0].squares.push({ id: 12, repeat: 1, customBeats: 4, events: [{ chord: 'F', span: 4, timeSig: null, strumPattern: null }] });
    w.localStorage.setItem('struchord_songs', JSON.stringify([longSong2]));
    w.loadSong(0);
    w.eval('render()');
    w.eval('togglePartsMode(true)');
    const activeRow = () => w.document.querySelector('.pt-row.is-active');
    check('слайд рисуется линией от предыдущей ноты',
      activeRow().querySelectorAll('.pt-slide:not(.is-shift)').length === 1,
      String(activeRow().querySelectorAll('.pt-slide:not(.is-shift)').length));
    check('shift slide отличается от простого слайда (двойной штрих)',
      activeRow().querySelectorAll('.pt-slide.is-shift').length === 2,
      String(activeRow().querySelectorAll('.pt-slide.is-shift').length));
    check('лига легато рисуется только там, где есть предыдущая нота струны',
      activeRow().querySelectorAll('.pt-slur').length === 1,
      String(activeRow().querySelectorAll('.pt-slur').length));
    check('вибрато нарисовано волной', activeRow().querySelectorAll('.pt-vibrato').length === 1);
    check('тремоло-пикинг нарисован тремя чёрточками',
      activeRow().querySelectorAll('.pt-trem').length === 3,
      String(activeRow().querySelectorAll('.pt-trem').length));
    const wideWave = activeRow().querySelector('.pt-vibrato').getAttribute('d');
    check('полки снизу посчитаны по занятым рядам (вибрато + тремоло)',
      (() => {
        const box = activeRow().querySelector('.pt-svg').getAttribute('viewBox').split(' ').map(Number);
        return box[1] === 0 && box[3] === 65 + 13 + 9 + 6;
      })(),
      activeRow().querySelector('.pt-svg').getAttribute('viewBox'));
    load([{ ...guitar, rolls: { '1': [
      { start: 0, dur: 1, string: 5, fret: 5 },
      { start: 1, dur: 1, string: 5, fret: 7, vibrato: 'slight', legato: true },
    ] } }]);
    w.eval('togglePartsMode(true)');
    const slightWave = activeRow().querySelector('.pt-vibrato').getAttribute('d');
    check('узкое вибрато — та же волна, но ниже амплитуда', wideWave !== slightWave,
      JSON.stringify([wideWave, slightWave]));

    // ---------- 11. Звук 12.6.2 ----------
    const playAll = (arr, evDur) => {
      w.eval(`songParts[0].rolls[String(sections[0].id)] = ${JSON.stringify(arr)};
        window.__plucks = [];
        schedulePartsForEvent({}, sections[0], sections[0].squares[0], 0, 0, ${evDur});`);
      return JSON.parse(w.eval('JSON.stringify(window.__plucks)'));
    };
    const pair = playAll([{ start: 0, dur: 1, string: 5, fret: 7 }, { start: 1, dur: 1, string: 5, fret: 9, legato: true }], 4);
    check('легато: вторая нота играется со смещением (без щипка), громкость как у первой',
      pair.length === 2 && Math.abs(pair[1].skipAttack - 0.02) < 1e-6 && pair[1].gain === pair[0].gain,
      JSON.stringify(pair));
    check('легато само по себе не тянет высоту (хаммер ставит ноту сразу)',
      (pair[1].startRate || 1) === 1 && !(pair[1].glide > 0), JSON.stringify(pair[1]));
    const lone = playAll([{ start: 0, dur: 1, string: 5, fret: 9, legato: true }], 4);
    check('легато без предыдущей ноты струны не применяется',
      lone.length === 1 && !lone[0].skipAttack, JSON.stringify(lone[0]));
    const slidePair = playAll([{ start: 0, dur: 1, string: 5, fret: 7 }, { start: 1, dur: 1, string: 5, fret: 10, slide: 'legato' }], 4);
    const rate = slidePair[1].startRate;
    check('слайд доезжает от высоты предыдущей ноты (минус три лада = 2^(-3/12))',
      Math.abs(rate - Math.pow(2, -3 / 12)) < 1e-3 && slidePair[1].glide > 0, JSON.stringify(slidePair[1]));
    check('слайд без атаки играется со смещением буфера', Math.abs(slidePair[1].skipAttack - 0.02) < 1e-6,
      JSON.stringify(slidePair[1]));
    const shiftPair = playAll([{ start: 0, dur: 1, string: 5, fret: 7 }, { start: 1, dur: 1, string: 5, fret: 10, slide: 'shift' }], 4);
    check('shift slide тянет высоту, но берётся со щипком',
      Math.abs(shiftPair[1].startRate - Math.pow(2, -3 / 12)) < 1e-3 && !shiftPair[1].skipAttack,
      JSON.stringify(shiftPair[1]));
    const vib1 = playAll([{ start: 0, dur: 1, string: 5, fret: 7, vibrato: 'slight' }], 4);
    const vib2 = playAll([{ start: 0, dur: 1, string: 5, fret: 7, vibrato: 'wide' }], 4);
    check('вибрато уезжает в голос размахом ±0,25 и ±0,6',
      vib1[0].vibratoDepth === 0.25 && vib2[0].vibratoDepth === 0.6, JSON.stringify([vib1[0].vibratoDepth, vib2[0].vibratoDepth]));
    // Кривая высоты — чистая функция: проверяем без звуковых узлов.
    const curve = JSON.parse(w.eval('JSON.stringify(partRateCurve(0, 3, 2, { startRate: 0.5, glide: 0.1, vibratoDepth: 0.25 }))'));
    check('кривая слайда: старт с чужой высоты и приезд на место за glide',
      curve[0][0] === 0 && Math.abs(curve[0][1] - 0.5) < 1e-9 &&
      Math.abs(curve[1][0] - 0.1) < 1e-9 && Math.abs(curve[1][1] - 1) < 1e-9, JSON.stringify(curve.slice(0, 3)));
    const vibCurve = JSON.parse(w.eval('JSON.stringify(partRateCurve(0, 2, 1, { vibratoDepth: 0.25 }))'));
    const amps = vibCurve.slice(1).map((p) => p[1]);
    const ampMax = Math.max.apply(null, amps);
    const ampMin = Math.min.apply(null, amps);
    check('кривая вибрато качается вокруг единицы с размахом ±0,25 пт',
      ampMax > 1 && ampMin < 1 &&
      Math.abs(ampMax - (1 + (Math.pow(2, 0.25 / 12) - 1))) < 1e-6 &&
      Math.abs(ampMin - (1 - (Math.pow(2, 0.25 / 12) - 1))) < 1e-6,
      JSON.stringify({ ampMax, ampMin, points: vibCurve.length }));
    const period = vibCurve[2][0] - vibCurve[1][0];
    check('частота качания ~6 Гц (полупериод 1/12 с)', Math.abs(period - 1 / 12) < 1e-9, String(period));
    check('вибрато останавливается с концом ноты (не гонит рампы в бесконечность)',
      vibCurve[vibCurve.length - 1][0] <= 1.13, String(vibCurve[vibCurve.length - 1][0]));
    const trem = playAll([{ start: 0, dur: 1, string: 5, fret: 7, tremolo: true }], 4);
    const gaps = trem.slice(1).map((p, i) => Number((p.startTime - trem[i].startTime).toFixed(4)));
    check('тремоло-пикинг бьёт тем же ладом 1/16-ми (четверть = 1 с → четыре удара)',
      trem.length === 4 && gaps.every((g) => Math.abs(g - 0.25) < 1e-6) &&
      trem.every((p) => Math.abs(p.freq - trem[0].freq) < 1e-9),
      JSON.stringify({ count: trem.length, gaps }));
    check('тремоло не тянет высоту повторных ударов',
      trem.every((p, i) => i === 0 || (p.startRate || 1) === 1), JSON.stringify(trem.map((p) => p.startRate)));

    // ---------- 12. Файл 12.6.2 ----------
    load([guitar]);
    w.eval('togglePartsMode(true)');
    cursorTo(0);
    key('h', { code: 'KeyH' });
    key('v', { code: 'KeyV', altKey: true });
    w.saveCurrentSong();
    const lib2 = JSON.parse(w.localStorage.getItem('struchord_songs'));
    const savedNew = lib2[lib2.length - 1].parts[0].rolls['1'][0];
    check('легато и вибрато уехали в файл',
      savedNew.legato === true && savedNew.vibrato === 'wide', JSON.stringify(savedNew));
    load([guitar]);
    w.eval('togglePartsMode(true)');
    w.eval('setPartsCursorString(sections[0].id, 0, 5, 1)');
    key('s', { code: 'KeyS', altKey: true });
    toneBtn('tremolo').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    w.saveCurrentSong();
    const lib3 = JSON.parse(w.localStorage.getItem('struchord_songs'));
    const savedSlide = lib3[lib3.length - 1].parts[0].rolls['1'][1];
    check('shift slide и тремоло уехали в файл',
      savedSlide.slide === 'shift' && savedSlide.tremolo === true, JSON.stringify(savedSlide));
    w.loadSong(lib3.length - 1);
    w.eval('render()');
    check('приёмы пережили перезагрузку',
      noteAt(0, 1).slide === 'shift' && noteAt(0, 1).tremolo === true, JSON.stringify(noteAt(0, 1)));
    w.localStorage.setItem('struchord_songs', JSON.stringify([song([{
      id: 1, name: 'Соло', instrument: 'guitar', tuning: null, visible: true,
      rolls: { '1': [
        { start: 0, dur: 1, string: 5, fret: 7, slide: 'sideways', vibrato: true, legato: 'yes', tremolo: 1 },
        { start: 1, dur: 1, string: 5, fret: 5, slide: 'shift', vibrato: 'wide', legato: true, tremolo: true },
      ] },
    }])]));
    w.loadSong(0);
    w.eval('render()');
    check('мусорные значения приёмов 12.6.2 отброшены',
      eqJson(Object.keys(roll(0)[0]).sort(), ['dur', 'fret', 'start', 'string']),
      JSON.stringify(roll(0)[0]));
    check('правильные значения приёмов 12.6.2 приняты',
      roll(0)[1].slide === 'shift' && roll(0)[1].vibrato === 'wide' &&
      roll(0)[1].legato === true && roll(0)[1].tremolo === true, JSON.stringify(roll(0)[1]));

    // ---------- 13. Отмена знака 12.6.2 ----------
    load([guitar]);
    w.eval('resetHistory()');
    w.eval('togglePartsMode(true)');
    cursorTo(0);
    key('v', { code: 'KeyV' });
    check('вибрато поставлено', noteAt(0, 0).vibrato === 'slight', JSON.stringify(noteAt(0, 0)));
    w.undoEdit();
    w.eval('render()');
    await tick();
    check('Ctrl+Z снял вибрато одной командой', !('vibrato' in noteAt(0, 0)), JSON.stringify(noteAt(0, 0)));

    // ═══════════════════════ Итерация 12.6.3: бенды ═══════════════════════

    // ---------- 14. Величина бенда словами ----------
    const label = (v) => w.eval(`partBendAmountLabel(${v})`);
    check('величина бенда пишется долями тона, как в GP',
      label(2) === 'full' && label(1) === '½' && label(0.5) === '¼' && label(1.5) === '¾' &&
      label(2.5) === '1¼' && label(4) === '2' && label(0) === '',
      JSON.stringify([label(2), label(1), label(0.5), label(1.5), label(2.5), label(4), label(0)]));
    const arrow = (points) => w.eval(`partBendArrow(${JSON.stringify(points)})`);
    check('стрелка знака следует кривой',
      arrow([[0, 0], [1, 2]]) === '↗' && arrow([[0, 2], [1, 0]]) === '↘' &&
      arrow([[0, 2], [1, 2]]) === '↗' && arrow([[0, 0], [0.5, 2], [1, 0]]) === '↕',
      JSON.stringify([arrow([[0, 0], [1, 2]]), arrow([[0, 2], [1, 0]]), arrow([[0, 2], [1, 2]]), arrow([[0, 0], [0.5, 2], [1, 0]])]));

    // ---------- 15. Окно редактора: открытие, пресеты, типы ----------
    load([guitar]);
    w.eval('togglePartsMode(true)');
    const bendOverlay = () => w.document.getElementById('partsBend');
    const bendBtn = (sel) => w.document.querySelector(`#${sel} [data-${sel === 'ptBendTypes' ? 'bend' : 'preset'}="${arguments[1]}"]`);
    const typeBtn = (type) => w.document.querySelector(`#ptBendTypes [data-bend="${type}"]`);
    const presetBtn = (preset) => w.document.querySelector(`#ptBendPresets [data-preset="${preset}"]`);
    check('редактор бенда закрыт, пока его не позвали', bendOverlay().hidden === true);
    // Курсор на пустом месте: бенд ставится только на ноту.
    w.eval('setPartsCursorString(sections[0].id, 0, 5, 3)');
    key('b', { code: 'KeyB' });
    check('бенд без ноты под курсором не открывается', bendOverlay().hidden === true);
    cursorTo(0);
    key('b', { code: 'KeyB' });
    check('`B` открыл редактор кривой', bendOverlay().hidden === false);
    check('в заголовке окна — нота под курсором',
      /лад 7/.test(w.document.getElementById('ptBendNote').textContent),
      w.document.getElementById('ptBendNote').textContent);
    check('тип не выбран, пока кривой нет',
      Array.from(w.document.querySelectorAll('#ptBendTypes .pt-pal-btn')).every((b) => !b.classList.contains('is-on')));
    presetBtn('full').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    check('пресет «Full» даёт подъём на целый тон',
      eqJson(noteAt(0, 0).bend, { type: 'bend', points: [[0, 0], [1, 2]] }),
      JSON.stringify(noteAt(0, 0).bend));
    check('пресет подсветил тип «Подъём»',
      typeBtn('bend').classList.contains('is-on') && !typeBtn('release').classList.contains('is-on'));
    check('тип назван в заголовке', /подъём/.test(w.document.getElementById('ptBendNote').textContent),
      w.document.getElementById('ptBendNote').textContent);
    check('кнопка палитры «бенд» подсвечена у ноты с кривой',
      w.document.querySelector('#ptToneGroup [data-tone="bend"]').classList.contains('is-on'));
    presetBtn('half').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    check('пресет «1/2» — подъём на полтона',
      eqJson(noteAt(0, 0).bend.points, [[0, 0], [1, 1]]), JSON.stringify(noteAt(0, 0).bend));
    presetBtn('quarter').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    check('пресет «1/4» — четверть тона (0,5 полутона)',
      eqJson(noteAt(0, 0).bend.points, [[0, 0], [1, 0.5]]), JSON.stringify(noteAt(0, 0).bend));
    presetBtn('riseFall').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    check('пресет «Подъём и спуск» возвращает высоту назад',
      eqJson(noteAt(0, 0).bend.points, [[0, 0], [0.5, 2], [1, 0]]), JSON.stringify(noteAt(0, 0).bend));
    typeBtn('prebend').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    check('«Предбенд» берёт ноту уже подтянутой',
      noteAt(0, 0).bend.type === 'prebend' && noteAt(0, 0).bend.points[0][1] === 2,
      JSON.stringify(noteAt(0, 0).bend));
    typeBtn('release').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    check('«Спуск» отпускает подтянутую ноту к написанной высоте',
      noteAt(0, 0).bend.type === 'release' && eqJson(noteAt(0, 0).bend.points, [[0, 2], [1, 0]]),
      JSON.stringify(noteAt(0, 0).bend));
    typeBtn('prebend-release').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    check('«Подъём и спуск» — своя кривая',
      noteAt(0, 0).bend.type === 'prebend-release' && noteAt(0, 0).bend.points.length === 4,
      JSON.stringify(noteAt(0, 0).bend));
    check('первая точка кривой подъёма всегда в нуле',
      noteAt(0, 0).bend.points[0][1] === 0, JSON.stringify(noteAt(0, 0).bend));

    // ---------- 16. Мышь: тянуть, добавить, убрать ----------
    const grid = w.document.getElementById('ptBendGrid');
    grid.getBoundingClientRect = () => ({ left: 0, top: 0, width: 320, height: 150, right: 320, bottom: 150 });
    presetBtn('full').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await settle(); // пресет «Full» стал отдельным шагом истории
    const before = JSON.stringify(noteAt(0, 0).bend.points);
    const dot = grid.querySelector('.pt-bend-dot[data-point="1"]');
    check('точки кривой нарисованы', !!dot && grid.querySelectorAll('.pt-bend-dot').length === 2,
      String(grid.querySelectorAll('.pt-bend-dot').length));
    dot.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true, clientX: 320, clientY: 0, pointerId: 1 }));
    grid.dispatchEvent(new w.MouseEvent('pointermove', { bubbles: true, clientX: 192, clientY: 75, pointerId: 1 }));
    check('во время перетаскивания модель НЕ меняется (правило 60 fps)',
      JSON.stringify(noteAt(0, 0).bend.points) === before, JSON.stringify(noteAt(0, 0).bend.points));
    grid.dispatchEvent(new w.MouseEvent('pointerup', { bubbles: true, clientX: 192, clientY: 75, pointerId: 1 }));
    check('по отпускании мыши точка встала на новое место (движение — одной правкой)',
      Math.abs(noteAt(0, 0).bend.points[1][0] - 0.6) < 1e-6 && Math.abs(noteAt(0, 0).bend.points[1][1] - 1) < 1e-6,
      JSON.stringify(noteAt(0, 0).bend.points));
    await tick();
    w.undoEdit();
    w.eval('render()');
    check('Ctrl+Z возвращает кривую целиком (одна команда)',
      JSON.stringify(noteAt(0, 0).bend.points) === before, JSON.stringify(noteAt(0, 0).bend.points));
    await tick();
    // Первую точку не тянем и не убираем: она держит начало кривой.
    grid.querySelector('.pt-bend-dot[data-point="0"]')
      .dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 75, pointerId: 2 }));
    grid.dispatchEvent(new w.MouseEvent('pointermove', { bubbles: true, clientX: 60, clientY: 30, pointerId: 2 }));
    grid.dispatchEvent(new w.MouseEvent('pointerup', { bubbles: true, clientX: 60, clientY: 30, pointerId: 2 }));
    check('первая точка кривой не сдвигается', noteAt(0, 0).bend.points[0][0] === 0,
      JSON.stringify(noteAt(0, 0).bend.points));
    // Клик по пустому месту добавляет точку.
    grid.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true, clientX: 160, clientY: 25, pointerId: 3 }));
    check('клик по сетке добавил точку',
      noteAt(0, 0).bend.points.length === 3, JSON.stringify(noteAt(0, 0).bend.points));
    grid.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true, clientX: 240, clientY: 40, pointerId: 4 }));
    grid.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true, clientX: 80, clientY: 100, pointerId: 5 }));
    check('точек не больше восьми',
      noteAt(0, 0).bend.points.length <= 8, String(noteAt(0, 0).bend.points.length));
    const pointsBefore = noteAt(0, 0).bend.points.length;
    grid.querySelector('.pt-bend-dot[data-point="1"]')
      .dispatchEvent(new w.MouseEvent('dblclick', { bubbles: true }));
    check('двойной клик убрал точку', noteAt(0, 0).bend.points.length === pointsBefore - 1,
      String(noteAt(0, 0).bend.points.length));
    // Две точки — минимум кривой.
    presetBtn('full').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    grid.querySelector('.pt-bend-dot[data-point="1"]')
      .dispatchEvent(new w.MouseEvent('dblclick', { bubbles: true }));
    check('в кривой остаются хотя бы две точки',
      noteAt(0, 0).bend.points.length === 2, JSON.stringify(noteAt(0, 0).bend.points));
    presetBtn('none').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    check('«Убрать бенд» снимает кривую целиком', !('bend' in noteAt(0, 0)), JSON.stringify(noteAt(0, 0)));
    key('b', { code: 'KeyB' });
    check('повтор `B` закрыл редактор', bendOverlay().hidden === true);
    key('b', { code: 'KeyB' });
    check('`B` снова открыл редактор', bendOverlay().hidden === false);
    w.document.getElementById('ptBendClose').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    check('кнопка «Готово» закрывает окно', bendOverlay().hidden === true);
    key('b', { code: 'KeyB' });
    key('Escape', { key: 'Escape', code: 'Escape' });
    check('Esc закрывает окно бенда и НЕ выходит из партий',
      bendOverlay().hidden === true && w.document.body.classList.contains('is-parts'));

    // ---------- 17. Знак на табе и полки ----------
    load([{ ...guitar, rolls: { '1': [
      { start: 0, dur: 1, string: 5, fret: 7, bend: { type: 'bend', points: [[0, 0], [1, 2]] } },
      { start: 1, dur: 1, string: 5, fret: 5, bend: { type: 'release', points: [[0, 2], [1, 0]] } },
      { start: 2, dur: 1, string: 4, fret: 3 },
    ] } }]);
    w.eval('togglePartsMode(true)');
    check('знак бенда нарисован и пишет величину долями тона',
      markTexts('pt-mark-bend').join(' ') === '↗full ↘full',
      JSON.stringify(markTexts('pt-mark-bend')));
    const bendMark = w.document.querySelector('.pt-row.is-active .pt-mark-bend');
    check('знак бенда стоит над станом (своя полка)',
      Number(bendMark.getAttribute('y')) < 0, bendMark.getAttribute('y'));
    check('под полку бенда ушёл ровно один ряд (13 + 10)',
      (() => {
        const box = w.document.querySelector('.pt-row.is-active .pt-svg').getAttribute('viewBox').split(' ').map(Number);
        return box[1] === -23 && box[3] === 65 + 23;
      })(),
      w.document.querySelector('.pt-row.is-active .pt-svg').getAttribute('viewBox'));

    // ---------- 18. Звук бенда ----------
    w.eval(`
      window.__plucks = [];
      pluckString = function(ctx, opts) { window.__plucks.push(opts); };
    `);
    const bendPlucks = playAll([{ start: 0, dur: 1, string: 5, fret: 7, bend: { type: 'bend', points: [[0, 0], [1, 2]] } }], 4);
    check('кривая бенда уезжает в голос вместе с длительностью ноты',
      !!bendPlucks[0].bendPoints && bendPlucks[0].bendSpan === 1, JSON.stringify(bendPlucks[0]));
    const bendCurve = JSON.parse(w.eval(
      `JSON.stringify(partRateCurve(0, 2, 1, { bendPoints: [[0,0],[1,2]], bendSpan: 1 }))`
    ));
    check('кривая высоты идёт по точкам бенда: 0 пт → +2 пт за длительность ноты',
      Math.abs(bendCurve[0][0] - 0) < 1e-9 && Math.abs(bendCurve[0][1] - 1) < 1e-9 &&
      Math.abs(bendCurve[1][0] - 1) < 1e-9 && Math.abs(bendCurve[1][1] - Math.pow(2, 2 / 12)) < 1e-9,
      JSON.stringify(bendCurve));
    const prebendCurve = JSON.parse(w.eval(
      `JSON.stringify(partRateCurve(0, 2, 1, { bendPoints: [[0,2],[1,2]], bendSpan: 1 }))`
    ));
    check('предбенд начинает ноту уже подтянутой',
      Math.abs(prebendCurve[0][1] - Math.pow(2, 2 / 12)) < 1e-9 && Math.abs(prebendCurve[1][1] - Math.pow(2, 2 / 12)) < 1e-9,
      JSON.stringify(prebendCurve));
    const bendVib = JSON.parse(w.eval(
      `JSON.stringify(partRateCurve(0, 3, 2, { bendPoints: [[0,0],[1,1]], bendSpan: 1, vibratoDepth: 0.25 }))`
    ));
    const bendEndRate = Math.pow(2, 1 / 12); // бенд кончился на +1 полутоне
    const vibAfterBend = bendVib.slice(2).map((p) => p[1]);
    check('вибрато после бенда качается вокруг ПОДТЯНУТОЙ высоты, а не вокруг написанной',
      bendVib.length > 3 && Math.abs(bendVib[1][0] - 1) < 1e-9 &&
      Math.abs(Math.min.apply(null, vibAfterBend) - (bendEndRate - (Math.pow(2, 0.25 / 12) - 1))) < 1e-6 &&
      Math.abs(Math.max.apply(null, vibAfterBend) - (bendEndRate + (Math.pow(2, 0.25 / 12) - 1))) < 1e-6,
      JSON.stringify(bendVib.slice(0, 4)));
    const slideVsBend = playAll([
      { start: 0, dur: 1, string: 5, fret: 5 },
      { start: 1, dur: 1, string: 5, fret: 7, slide: 'legato', bend: { type: 'bend', points: [[0, 0], [1, 2]] } },
    ], 4);
    check('бенд и слайд вместе: кривую ведёт бенд, слайд не накладывается',
      (slideVsBend[1].startRate || 1) === 1 && (slideVsBend[1].glide || 0) === 0 && !!slideVsBend[1].bendPoints,
      JSON.stringify(slideVsBend[1]));

    // ---------- 19. Файл и мусор бенда ----------
    load([guitar]);
    w.eval('togglePartsMode(true)');
    cursorTo(0);
    key('b', { code: 'KeyB' });
    w.document.querySelector('#ptBendPresets [data-preset="riseFall"]')
      .dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    w.saveCurrentSong();
    const libBend = JSON.parse(w.localStorage.getItem('struchord_songs'));
    const savedBend = libBend[libBend.length - 1].parts[0].rolls['1'][0];
    check('кривая бенда уехала в файл',
      eqJson(savedBend.bend, { type: 'bend', points: [[0, 0], [0.5, 2], [1, 0]] }), JSON.stringify(savedBend.bend));
    w.loadSong(libBend.length - 1);
    w.eval('render()');
    check('кривая пережила перезагрузку',
      eqJson(noteAt(0, 0).bend, { type: 'bend', points: [[0, 0], [0.5, 2], [1, 0]] }),
      JSON.stringify(noteAt(0, 0).bend));
    const bendGarbage = (raw) => JSON.parse(w.eval(`JSON.stringify(partSanitizeBend(${JSON.stringify(raw)}))`));
    check('неизвестный тип бенда отбрасывает кривую целиком', bendGarbage({ type: 'sideways', points: [[0, 0], [1, 2]] }) === null);
    check('одна точка — не кривая', bendGarbage({ type: 'bend', points: [[0, 0]] }) === null);
    check('точки зажаты: t в 0..1, высота в ±24, шаг — четверть тона',
      eqJson(bendGarbage({ type: 'bend', points: [[2, 99], [0.5, 1.1]] }), { type: 'bend', points: [[0, 0], [1, 24]] }),
      JSON.stringify(bendGarbage({ type: 'bend', points: [[2, 99], [0.5, 1.1]] })));
    check('точек не больше восьми и по возрастанию времени',
      (() => {
        const many = [[0, 0]];
        for (let i = 1; i <= 12; i++) many.push([i / 13, i / 4]);
        const clean = bendGarbage({ type: 'bend', points: many });
        const times = clean.points.map((p) => p[0]);
        return clean.points.length === 8 && times.every((t, i) => i === 0 || t >= times[i - 1]);
      })());
    check('подъём всегда начинается с нуля (не «из ниоткуда»)',
      eqJson(bendGarbage({ type: 'bend', points: [[0, 2], [1, 3]] }).points[0], [0, 0]));
    check('предбенд сохраняет подтянутую первую точку',
      eqJson(bendGarbage({ type: 'prebend', points: [[0, 2], [1, 2]] }).points[0], [0, 2]));

    // ================= 20. Палитра 12.6.4 =================
    // Окно бенда осталось открытым от прошлого блока: оно перехватывает
    // буквенные клавиши, поэтому закрываем его явно (заодно проверяем, что
    // окно-инспектор переживает перерисовку окна партий и закрывается руками).
    load([guitar]);
    w.eval('togglePartsMode(true)');
    check('окно инспектора пережило переключение песни и закрывается', (() => {
      w.eval('openPartsBendEditor()');
      const openBefore = w.eval('partsBendOpen()');
      w.eval('renderPartsScreen()');
      const survived = w.eval('partsBendOpen()');
      w.eval('closePartsBendEditor()');
      return openBefore === true && survived === true && w.eval('partsBendOpen()') === false;
    })());
    const ornButtons = Array.from(w.document.querySelectorAll('#ptOrnGroup .pt-pal-btn'));
    check('в палитре появилась группа флажолетов и украшений (12 кнопок)',
      ornButtons.length === 12, String(ornButtons.length));
    check('у каждой кнопки новой группы есть подсказка',
      ornButtons.every((b) => (b.title || '').length > 10),
      JSON.stringify(ornButtons.map((b) => b.title)));
    const hintText = w.document.querySelector('.pt-pal-hint').textContent;
    check('подсказка палитры называет клавиши флажолетов, трели и трем-бара',
      /Alt\+Y/.test(hintText) && /\bY\b/.test(hintText) && /\bN\b/.test(hintText) &&
      /\bW\b/.test(hintText) && /Ctrl\+E/.test(hintText), hintText);

    // ================= 21. Клавиши и окно флажолета =================
    cursorTo(0);
    key('y', { code: 'KeyY' });
    check('`Y` поставил натуральный флажолет',
      !!noteAt(0, 0).harm && noteAt(0, 0).harm.type === 'natural', JSON.stringify(noteAt(0, 0)));
    key('y', { code: 'KeyY' });
    check('повторный `Y` снял флажолет', !noteAt(0, 0).harm, JSON.stringify(noteAt(0, 0)));
    key('Y', { code: 'KeyY', altKey: true });
    check('`Alt+Y` открыл окно параметров флажолета', w.eval('partsHarmOpen()') === true);
    check('окно само знак не ставит: без звучащей ноты флажолет не записать',
      !noteAt(0, 0).harm, JSON.stringify(noteAt(0, 0)));
    const harmNoteInput = w.document.getElementById('ptHarmSounding');
    // Струна 5 — высокая E (E4), лад 7; узел 7-го лада звучит на +19
    // полутонов от ОТКРЫТОЙ струны, то есть на высоте 19-го лада: B5.
    check('окно подставляет звучащую ноту узла (лад 7 = +19 полутонов)', harmNoteInput.value === 'B5',
      harmNoteInput.value);
    harmNoteInput.value = 'E6';
    harmNoteInput.dispatchEvent(new w.Event('change'));
    check('окно записало искусственный флажолет со звучащей нотой',
      eqJson(noteAt(0, 0).harm, { type: 'artificial', note: 'E6' }), JSON.stringify(noteAt(0, 0).harm));
    const typeSel = w.document.getElementById('ptHarmType');
    typeSel.value = 'pinch';
    typeSel.dispatchEvent(new w.Event('change'));
    check('смена типа в окне меняет знак на P.H.',
      noteAt(0, 0).harm.type === 'pinch' && noteAt(0, 0).harm.note === 'E6',
      JSON.stringify(noteAt(0, 0).harm));
    harmNoteInput.value = 'H9';
    harmNoteInput.dispatchEvent(new w.Event('change'));
    check('нечитаемая нота знак не меняет (знак без высоты — враньё)',
      eqJson(noteAt(0, 0).harm, { type: 'pinch', note: 'E6' }), JSON.stringify(noteAt(0, 0).harm));
    w.document.getElementById('ptHarmClose').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    check('«Готово» закрыло окно флажолета', w.eval('partsHarmOpen()') === false);
    // Тип знака и звучащая нота запоминаются палитрой: СЛЕДУЮЩАЯ введённая
    // нота берёт тот же флажолет (уже стоящие ноты знак не трогает — как в GP).
    // Свободное место (струна 5, четвёртая доля): цифра создаёт новую ноту.
    w.eval(`setPartsCursorString(sections[0].id, 0, 5, 3)`);
    key('5', { code: 'Digit5' });
    check('знак флажолета наследуется следующими нотами (тип + звучащая нота)',
      (() => {
        const created = roll(0).filter((n) => n.start === 3 && n.string === 5)[0];
        return !!created && eqJson(created.harm, { type: 'pinch', note: 'E6' });
      })(), JSON.stringify(roll(0)));
    check('уже стоящая нота при вводе цифры знак не теряет',
      eqJson(noteAt(0, 0).harm, { type: 'pinch', note: 'E6' }) && noteAt(0, 0).fret === 7,
      JSON.stringify(noteAt(0, 0)));
    cursorTo(1);
    key('n', { code: 'KeyN' });
    check('`N` поставил трель', noteAt(0, 1).trill === true, JSON.stringify(noteAt(0, 1)));
    key('n', { code: 'KeyN' });
    check('повторный `N` снял трель', !('trill' in noteAt(0, 1)), JSON.stringify(noteAt(0, 1)));
    key('w', { code: 'KeyW' });
    check('`W` поставил тремоло-бар', noteAt(0, 1).tremBar === true, JSON.stringify(noteAt(0, 1)));
    key('W', { code: 'KeyW', shiftKey: true });
    check('повторный `W` снял тремоло-бар', !('tremBar' in noteAt(0, 1)), JSON.stringify(noteAt(0, 1)));

    // ================= 22. Украшения и поиск по палитре =================
    const clickTone = (kind) =>
      w.document.querySelector(`#ptOrnGroup [data-tone="${kind}"]`)
        .dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    clickTone('mordent');
    check('мордент из палитры', noteAt(0, 1).ornament === 'mordent', JSON.stringify(noteAt(0, 1)));
    clickTone('turn');
    check('украшения не стоят вместе: тёрн заменил мордент',
      noteAt(0, 1).ornament === 'turn', JSON.stringify(noteAt(0, 1)));
    clickTone('turn');
    check('повторный клик по кнопке снял тёрн', !noteAt(0, 1).ornament, JSON.stringify(noteAt(0, 1)));
    key('e', { code: 'KeyE', ctrlKey: true });
    const searchBox = w.document.getElementById('ptPalSearch');
    check('Ctrl+E открыл поиск по палитре', searchBox.hidden === false);
    check('у поиска не занято имя приёма: до ввода видна вся палитра',
      Array.from(w.document.querySelectorAll('#partsPalette .pt-pal-btn')).every((b) => !b.hidden));
    searchBox.value = 'флажолет';
    searchBox.dispatchEvent(new w.Event('input'));
    const visiblePalette = () =>
      Array.from(w.document.querySelectorAll('#partsPalette .pt-pal-btn')).filter((b) => !b.hidden).length;
    check('поиск оставил только флажолеты (две кнопки)', visiblePalette() === 2, String(visiblePalette()));
    searchBox.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    check('Enter применяет первый найденный приём — натуральный флажолет',
      noteAt(0, 1).harm && noteAt(0, 1).harm.type === 'natural', JSON.stringify(noteAt(0, 1).harm));
    check('после Enter поиск очистился и палитра снова полная',
      searchBox.value === '' && visiblePalette() === 38, String(visiblePalette()));
    searchBox.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    check('Escape закрыл поиск', searchBox.hidden === true);
    check('палитра из окна партий закрывает оба окна-инспектора',
      (() => {
        w.eval('togglePartsMode(false)');
        const closed = !w.eval('partsBendOpen()') && !w.eval('partsHarmOpen()');
        w.eval('togglePartsMode(true)');
        return closed;
      })());

    // ================= 23. Знаки 12.6.4 на табе и полки =================
    load([{ ...guitar, rolls: { '1': [
      { start: 0, dur: 1, string: 0, fret: 12, harm: { type: 'natural' }, trill: true },
      { start: 1, dur: 1, string: 1, fret: 5, harm: { type: 'pinch', note: 'E6' }, ornament: 'turn' },
      { start: 2, dur: 1, string: 4, fret: 7, tremBar: true },
    ] } }]);
    w.eval('togglePartsMode(true)');
    const rowSvg = () => w.document.querySelector('.pt-row.is-active .pt-svg');
    check('натуральный флажолет показан номером лада в уголках, как в GP',
      markTexts('pt-mark-harm').indexOf('<12>') !== -1, JSON.stringify(markTexts('pt-mark-harm')));
    check('искусственный флажолет — аббревиатурой типа (P.H.)',
      markTexts('pt-mark-harm').indexOf('P.H.') !== -1, JSON.stringify(markTexts('pt-mark-harm')));
    check('трель и украшение показаны знаками tr и тёрн',
      markTexts('pt-mark-orn').indexOf('tr') !== -1 && markTexts('pt-mark-orn').indexOf('тёрн') !== -1,
      JSON.stringify(markTexts('pt-mark-orn')));
    check('тремоло-бар показан волной ~~~',
      markTexts('pt-mark-trembar').indexOf('~~~') !== -1, JSON.stringify(markTexts('pt-mark-trembar')));
    const markYs = Array.from(rowSvg().querySelectorAll('[class*="pt-mark-"]'))
      .map((el) => Number(el.getAttribute('y')));
    const staffTop = w.eval('PART_TAB_TOP_PAD');
    const staffBottom = staffTop + w.eval('PART_TAB_STRING_GAP') * (6 - 1);
    check('знаки приёмов стоят полками вокруг стана и не наслаиваются на струны',
      markYs.length >= 5 &&
      markYs.every((y) => y <= staffTop - 13 + 0.01 || y >= staffBottom + 13 - 0.01),
      JSON.stringify({ markYs, staffTop, staffBottom }));
    check('запас сверху посчитан по трём занятым полкам (13 + 2 * 9 + 10)',
      rowSvg().getAttribute('viewBox').split(' ').map(Number)[1] === -(13 + 2 * 9 + 10),
      rowSvg().getAttribute('viewBox'));
    load([guitar]);
    w.eval('togglePartsMode(true)');
    check('стан без знаков сохранил геометрию 12.3',
      (() => {
        const box = rowSvg().getAttribute('viewBox').split(' ').map(Number);
        return box[1] === 0 &&
          box[3] === w.eval('PART_TAB_TOP_PAD') * 2 + w.eval('PART_TAB_STRING_GAP') * (6 - 1);
      })(), rowSvg().getAttribute('viewBox'));

    // ================= 24. Звук 12.6.4 =================
    const open5 = w.eval('partOpenFreqs(songParts[0])[5]');
    const harm12 = playAll([{ start: 0, dur: 1, string: 5, fret: 12, harm: { type: 'natural' } }], 4);
    check('натуральный флажолет на 12-м ладу звучит октавой выше открытой струны',
      harm12.length === 1 && Math.abs(harm12[0].freq - open5 * 2) < 1e-6, String(harm12[0] && harm12[0].freq));
    const harm7 = playAll([{ start: 0, dur: 1, string: 5, fret: 7, harm: { type: 'natural' } }], 4);
    check('флажолет на 7-м ладу — +19 полутонов от открытой струны',
      Math.abs(harm7[0].freq - open5 * Math.pow(2, 19 / 12)) < 1e-6, String(harm7[0].freq));
    const plainNote = playAll([{ start: 0, dur: 1, string: 5, fret: 3 }], 4);
    const harmAH = playAll([{ start: 0, dur: 1, string: 5, fret: 3, harm: { type: 'artificial', note: 'E6' } }], 4);
    check('искусственный флажолет звучит ЗВУЧАЩЕЙ НОТОЙ окна, а не ладом',
      Math.abs(harmAH[0].freq - w.eval('noteToFrequency("E6")')) < 1e-6, String(harmAH[0].freq));
    check('флажолет звенит дольше обычной ноты той же длины',
      harmAH[0].duration > plainNote[0].duration, `${harmAH[0].duration} vs ${plainNote[0].duration}`);
    const mordent = playAll([{ start: 0, dur: 1, string: 5, fret: 7, ornament: 'mordent' }], 4);
    check('мордент: быстрая нижняя ступень, затем сама нота',
      mordent.length === 2 && Math.abs(mordent[0].startRate - Math.pow(2, -1 / 12)) < 1e-9 &&
      (mordent[1].startRate || 1) === 1 && mordent[1].startTime > mordent[0].startTime,
      JSON.stringify(mordent));
    const turn = playAll([{ start: 0, dur: 1, string: 5, fret: 7, ornament: 'turn' }], 4);
    check('тёрн: верхняя ступень, нота, нижняя ступень, потом остаток',
      turn.length === 4 && turn[0].startRate > 1 && (turn[1].startRate || 1) === 1 &&
      turn[2].startRate < 1 && (turn[3].startRate || 1) === 1 &&
      Math.abs(turn[0].startRate * turn[2].startRate - 1) < 1e-9, JSON.stringify(turn.map((p) => p.startRate)));
    const trill = playAll([{ start: 0, dur: 1, string: 5, fret: 7, trill: true }], 4);
    check('трель: четыре удара с чередованием соседней ступени (+1 лад)',
      trill.length === 4 && (trill[0].startRate || 1) === 1 && trill[1].startRate > 1 &&
      (trill[2].startRate || 1) === 1 && trill[3].startRate > 1 &&
      Math.abs(trill[1].startRate - Math.pow(2, 1 / 12)) < 1e-9, JSON.stringify(trill.map((p) => p.startRate)));
    const tremoloPicking = playAll([{ start: 0, dur: 1, string: 5, fret: 7, tremolo: true }], 4);
    check('тремоло-пикинг по-прежнему серия ударов (и трель его не подменила)',
      tremoloPicking.length === 4 && tremoloPicking.every((p) => (p.startRate || 1) === 1),
      String(tremoloPicking.length));
    check('флажолет и украшение вместе играют серией (украшение не теряется)',
      (() => {
        const both = playAll([{ start: 0, dur: 1, string: 5, fret: 12, harm: { type: 'natural' }, ornament: 'mordent' }], 4);
        return both.length === 2 && Math.abs(both[0].freq - open5 * 2) < 1e-6 &&
          Math.abs(both[0].startRate - Math.pow(2, -1 / 12)) < 1e-9;
      })());
    const tbPluck = playAll([{ start: 0, dur: 1, string: 5, fret: 7, tremBar: true }], 4);
    check('нырок тремоло-бара уезжает в голос вместе с длительностью ноты',
      tbPluck[0].tremBar === true && tbPluck[0].tremBarSpan === 1, JSON.stringify(tbPluck[0]));
    const tbCurve = JSON.parse(w.eval(
      `JSON.stringify(partRateCurve(0, 2, 1, { tremBar: true, tremBarSpan: 1 }))`
    ));
    const tbDip = tbCurve.filter((p) => Math.abs(p[0] - 0.45) < 1e-9)[0];
    const tbLast = tbCurve[tbCurve.length - 1];
    check('кривая трем-бара: нырок до −2 полутонов к 45% ноты и возврат к концу',
      tbCurve[0][0] === 0 && tbCurve[0][1] === 1 && !!tbDip &&
      Math.abs(tbDip[1] - Math.pow(2, -2 / 12)) < 1e-9 &&
      Math.abs(tbLast[0] - 1) < 1e-9 && Math.abs(tbLast[1] - 1) < 1e-9,
      JSON.stringify(tbCurve));
    check('бенд важнее нырка: рельс высоты ведёт кривая бенда',
      (() => {
        const both = JSON.parse(w.eval(
          `JSON.stringify(partRateCurve(0, 2, 1, { bendPoints: [[0,0],[1,2]], bendSpan: 1, tremBar: true, tremBarSpan: 1 }))`
        ));
        const a = JSON.parse(w.eval(`JSON.stringify(partRateCurve(0, 2, 1, { bendPoints: [[0,0],[1,2]], bendSpan: 1 }))`));
        return eqJson(both, a);
      })());

    // ================= 25. Файл и мусор 12.6.4 =================
    load([guitar]);
    w.eval('togglePartsMode(true)');
    cursorTo(0);
    key('y', { code: 'KeyY' });
    cursorTo(1);
    key('n', { code: 'KeyN' });
    clickTone('mordent');
    // Третья нота живёт на струне 4 (E2), а не на «курсорной» струне 5:
    // ведём курсор на её струну, иначе трем-бар некуда ставить.
    w.eval(`setPartsCursorString(sections[0].id, 0, 4, 2)`);
    key('w', { code: 'KeyW' });
    w.saveCurrentSong();
    const libOrn = JSON.parse(w.localStorage.getItem('struchord_songs'));
    const savedRoll = libOrn[libOrn.length - 1].parts[0].rolls['1'];
    check('флажолет, трель, украшение и трем-бар уехали в файл',
      eqJson(savedRoll[0].harm, { type: 'natural' }) && savedRoll[1].trill === true &&
      savedRoll[1].ornament === 'mordent' && savedRoll[2].tremBar === true,
      JSON.stringify(savedRoll));
    w.loadSong(libOrn.length - 1);
    w.eval('render()');
    check('знаки пережили перезагрузку песни',
      eqJson(noteAt(0, 0).harm, { type: 'natural' }) && noteAt(0, 1).trill === true &&
      noteAt(0, 1).ornament === 'mordent' && noteAt(0, 2).tremBar === true,
      JSON.stringify(roll(0)));
    const harmGarbage = (raw) => JSON.parse(w.eval(`JSON.stringify(partSanitizeHarm(${JSON.stringify(raw)}))`));
    check('неизвестный тип флажолета отбрасывается', harmGarbage({ type: 'weird' }) === null);
    check('искусственный флажолет без читаемой звучащей ноты отбрасывается',
      harmGarbage({ type: 'artificial' }) === null && harmGarbage({ type: 'pinch', note: 'H9' }) === null &&
      harmGarbage({ type: 'tap', note: '' }) === null && harmGarbage('natural') === null);
    check('натуральный флажолет читается без ноты, лишняя нота игнорируется',
      eqJson(harmGarbage({ type: 'natural', note: 'X' }), { type: 'natural' }));
    check('нота флажолета нормализуется (регистр и пробелы)',
      eqJson(harmGarbage({ type: 'pinch', note: ' e6 ' }), { type: 'pinch', note: 'E6' }));
    load([{ ...guitar, rolls: { '1': [
      { start: 0, dur: 1, string: 5, fret: 7, ornament: 'zigzag', trill: 'yes', tremBar: 1, harm: { type: 'weird' } },
      { start: 1, dur: 1, string: 5, fret: 7, ornament: 'turn', trill: true, tremBar: true, harm: { type: 'artificial', note: 'ZZ' } },
    ] } }]);
    check('мусор знаков отброшен поштучно, а верные знаки прочитаны',
      !('ornament' in noteAt(0, 0)) && !('trill' in noteAt(0, 0)) && !('tremBar' in noteAt(0, 0)) &&
      !noteAt(0, 0).harm && noteAt(0, 1).ornament === 'turn' && noteAt(0, 1).trill === true &&
      noteAt(0, 1).tremBar === true && !noteAt(0, 1).harm, JSON.stringify(roll(0)));

    // ================= 26. Отмена знака 12.6.4 =================
    load([guitar]);
    w.eval('togglePartsMode(true)');
    cursorTo(0);
    await settle();
    key('y', { code: 'KeyY' });
    check('флажолет поставлен перед проверкой отмены', !!noteAt(0, 0).harm && noteAt(0, 0).harm.type === 'natural');
    await tick();
    await settle();
    w.eval('undoEdit()');
    await tick();
    check('Ctrl+Z снимает флажолет одним шагом', !noteAt(0, 0).harm, JSON.stringify(noteAt(0, 0)));

    // ================= 27. Форшлаг, dead slap, pick scrape =================
    load([guitar]);
    w.eval('togglePartsMode(true)');
    cursorTo(0);
    key('g', { code: 'KeyG' });
    check('`G` поставил форшлаг на ступень ниже основной ноты (лад 7 → 6)',
      eqJson(noteAt(0, 0).grace, { fret: 6, onBeat: false }), JSON.stringify(noteAt(0, 0)));
    // jsdom не тикает rAF: панель сама перерисуется только в следующем кадре,
    // поэтому здесь и далее в блоке кадр подталкиваем руками.
    w.eval('render()');
    check('номер форшлага стоит на полке над станом и перечёркнут',
      (() => {
        const mark = w.document.querySelector('.pt-row.is-active .pt-mark-grace');
        const slash = w.document.querySelector('.pt-row.is-active .pt-grace-slash');
        if (!mark || !slash) return false;
        const staffTop = w.eval('PART_TAB_TOP_PAD');
        const staffBottom = staffTop + w.eval('PART_TAB_STRING_GAP') * (6 - 1);
        const y = Number(mark.getAttribute('y'));
        return y <= staffTop - 13 + 0.01 && y >= staffBottom + 12.99 === false;
      })(), JSON.stringify(markTexts('pt-mark-grace')));
    key('G', { code: 'KeyG', altKey: true });
    check('`Alt+G` переносит форшлаг на долю',
      noteAt(0, 0).grace.onBeat === true, JSON.stringify(noteAt(0, 0).grace));
    w.eval('render()');
    check('знак «на доле» отличается вертикальной чертой',
      markTexts('pt-mark-grace').indexOf('|6') !== -1, JSON.stringify(markTexts('pt-mark-grace')));
    // «Форшлаг с ладом» — команда с параметром, как в Command Palette GP.
    key('e', { code: 'KeyE', ctrlKey: true });
    const cmdBox = w.document.getElementById('ptPalSearch');
    cmdBox.value = 'форшлаг 3';
    cmdBox.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    check('«форшлаг 3» из поиска ставит форшлаг с заданным ладом',
      eqJson(noteAt(0, 0).grace, { fret: 3, onBeat: true }), JSON.stringify(noteAt(0, 0).grace));
    check('лад форшлага зажимается в 0..24 и в команде поиска',
      (() => {
        cmdBox.value = 'форшлаг 99';
        cmdBox.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        return eqJson(noteAt(0, 0).grace, { fret: 24, onBeat: true });
      })(), JSON.stringify(noteAt(0, 0).grace));
    key('e', { code: 'KeyE', ctrlKey: true });
    check('поиск закрыт перед работой с палитрой', w.document.getElementById('ptPalSearch').hidden === true);
    clickTone('deadSlap');
    check('dead slap — знак без звука (как в GP)',
      noteAt(0, 0).deadSlap === true, JSON.stringify(noteAt(0, 0)));
    clickTone('pickScrape');
    check('pick scrape — знак без звука (как в GP)',
      noteAt(0, 0).pickScrape === true, JSON.stringify(noteAt(0, 0)));
    w.eval('render()');
    check('знаки слэпа и скребка показаны на табе словами',
      markTexts('pt-mark-slap').indexOf('slap') !== -1 && markTexts('pt-mark-scrape').indexOf('scrape') !== -1,
      JSON.stringify([markTexts('pt-mark-slap'), markTexts('pt-mark-scrape')]));
    w.saveCurrentSong();
    const libGrace = JSON.parse(w.localStorage.getItem('struchord_songs'));
    const savedGrace = libGrace[libGrace.length - 1].parts[0].rolls['1'][0];
    check('форшлаг, slap и scrape уехали в файл',
      eqJson(savedGrace.grace, { fret: 24, onBeat: true }) && savedGrace.deadSlap === true &&
      savedGrace.pickScrape === true, JSON.stringify(savedGrace));
    w.loadSong(libGrace.length - 1);
    w.eval('render()');
    check('форшлаг пережил перезагрузку песни',
      eqJson(noteAt(0, 0).grace, { fret: 24, onBeat: true }), JSON.stringify(noteAt(0, 0).grace));
    const graceGarbage = (raw) => JSON.parse(w.eval(`JSON.stringify(partSanitizeGrace(${JSON.stringify(raw)}))`));
    check('форшлаг без лада отбрасывается целиком',
      graceGarbage({ onBeat: true }) === null && graceGarbage(5) === null && graceGarbage(null) === null);
    check('лад форшлага зажат в 0..24, «на доле» — строго true',
      eqJson(graceGarbage({ fret: 99, onBeat: 1 }), { fret: 24, onBeat: false }) &&
      eqJson(graceGarbage({ fret: -3 }), { fret: 0, onBeat: false }),
      JSON.stringify([graceGarbage({ fret: 99, onBeat: 1 }), graceGarbage({ fret: -3 })]));

    // ---- звук: последним, потому что playAll подменяет рулон партии ----
    const graceBefore = playAll([{ start: 1, dur: 1, string: 5, fret: 7, grace: { fret: 6, onBeat: false } }], 4);
    check('форшлаг «до доли» звучит коротким щипком ПЕРЕД нотой и на своём ладу',
      graceBefore.length === 2 && graceBefore[0].startTime < graceBefore[1].startTime &&
      Math.abs(graceBefore[0].duration - 0.1125) < 1e-9 &&
      Math.abs(graceBefore[0].freq - open5 * Math.pow(2, 6 / 12)) < 1e-6,
      JSON.stringify(graceBefore.map((p) => [p.freq, p.startTime, p.duration])));
    const graceOnBeat = playAll([{ start: 1, dur: 1, string: 5, fret: 7, grace: { fret: 6, onBeat: true } }], 4);
    check('форшлаг «на доле» бьёт в долю, а основная нота идёт за ним',
      graceOnBeat.length === 2 && Math.abs(graceOnBeat[0].startTime - 1) < 1e-9 &&
      Math.abs(graceOnBeat[1].startTime - 1.125) < 1e-9,
      JSON.stringify(graceOnBeat.map((p) => p.startTime)));
    const plainPluck = playAll([{ start: 1, dur: 1, string: 5, fret: 7 }], 4)[0];
    const signPlucks = playAll([{ start: 1, dur: 1, string: 5, fret: 7, deadSlap: true, pickScrape: true }], 4);
    check('знаки слэпа и скребка не добавляют и не меняют звук',
      signPlucks.length === 1 && eqJson(signPlucks[0], plainPluck), JSON.stringify(signPlucks));
    load([guitar]);
    w.eval('togglePartsMode(true)');
    cursorTo(0);
    key('g', { code: 'KeyG' });
    key('g', { code: 'KeyG' });
    check('повторный `G` снял форшлаг', !noteAt(0, 0).grace, JSON.stringify(noteAt(0, 0)));

    console.log(`\nитого: ${pass} ok, ${fail} FAIL`);
    if (fail) process.exitCode = 1;
  } catch (e) {
    console.error('ОШИБКА:', e && e.stack ? e.stack : e);
    process.exitCode = 1;
  }
});
