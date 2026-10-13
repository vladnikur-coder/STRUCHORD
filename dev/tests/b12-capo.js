#!/usr/bin/env node
/*
 * b12-capo.js — B-12.5.4 «Каподастр» (итерация 4 кирпича 12.5).
 *
 * Проверяем:
 *  1. Модель: номер каподастра зажимается в 0…12, каподастр поднимает строй
 *     множителем 2^(N/12);
 *  2. Пересчёт аппликатуры (Adjust fingering): номера ладов меняются так,
 *     чтобы ВЫСОТЫ нот сохранялись; нота за грифом уходит октавой, а если и
 *     там не помещается — остаётся как была и попадает в список;
 *  3. Звук дорожки: каподастр слышен и в нотах, и в предпросмотре (струна
 *     берётся прижатой, а не открытой);
 *  4. Звук песни: каподастр поднимает аккомпанемент целиком, но НЕ трогает
 *     ни аккорды, ни аппликатуры — так решил пользователь;
 *  5. Файл: каподастр дорожки и песни уезжают в песню и читаются назад,
 *     мусор отбрасывается, «нет каподастра» не пишется;
 *  6. UI: выбор каподастра в панели дорожки и в карточке канала «Песня»,
 *     пометка «капо N» на карточке дорожки, плашка «играть с каподастром N»
 *     над лентой;
 *  7. Окно выбора режима (как Keep/Adjust fingering в Guitar Pro): открывается
 *     только когда у дорожки есть ноты, показывает последствия пересчёта ДО
 *     применения, «Отмена» не меняет модель;
 *  8. Отмену: и каподастр дорожки, и каподастр песни откатываются одним Ctrl+Z.
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
// Подписи опций выбора: первая, вторая и последняя — этого хватает, чтобы
// увидеть и «Нет», и шаг 1, и верхнюю границу.
function optionLabels(select) {
  const options = Array.from(select.options).map((o) => o.textContent);
  if (!options.length) return '';
  return `${options[0]}|${options[1]}|${options[options.length - 1]}`;
}

// Ноты дорожки: у пятой струны лад 5, у пятой же открытая (она и уедет
// октавой вверх при пересчёте вниз), плюс нота с форшлагом.
const notes = [
  { start: 0, dur: 1, string: 5, fret: 5 },
  { start: 1, dur: 1, string: 5, fret: 0 },
  { start: 2, dur: 1, string: 4, fret: 3, grace: { fret: 5, start: 0, dur: 0.25 } },
];
const square = (id, chord) => ({
  id, repeat: 1, customBeats: 4,
  events: [{ chord, span: 4, timeSig: null, strumPattern: null }],
});
const song = (parts, extra) => ({
  schemaVersion: 5, metadata: { artist: 'A', title: 'B' }, bpm: 120, globalKey: 'C',
  keyMode: 'manual', globalTimeSig: '4/4', tuning: 'e-std', tuningNotes: null, notes: '',
  sections: [
    {
      id: 11, type: 'Verse', customName: null, key: null, shift: null, timeSig: null,
      bpm: null, repeat: 1, strumPattern: null, squares: [square(21, 'C')],
    },
    {
      id: 12, type: 'Chorus', customName: null, key: null, shift: null, timeSig: null,
      bpm: null, repeat: 1, strumPattern: null, squares: [square(22, 'G')],
    },
  ],
  parts, nextId: 90, rhythmPool: null, userFingerings: [], preferredFingerings: [], date: '',
  ...(extra || {}),
});
const guitar = { id: 1, name: 'Соло', instrument: 'guitar', tuning: null, visible: true, rolls: { '11': notes, '12': [] } };
const bass = { id: 2, name: 'Бас', instrument: 'bass', tuning: null, visible: true, rolls: { '11': [], '12': [] } };

w.addEventListener('load', async () => {
  try {
    const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
    const settle = () => new Promise((resolve) => setTimeout(resolve, 460));
    const load = (parts, extra) => {
      w.localStorage.setItem('struchord_songs', JSON.stringify([song(parts, extra)]));
      w.loadSong(0);
      w.eval('render()');
      w.confirm = () => true;
    };
    const partsScreen = () => {
      w.eval('togglePartsMode(true)');
      w.eval('renderPartsScreen()');
    };
    const chId = (index) => `part:${w.eval(`songParts[${index}].id`)}`;
    const card = (id) => w.document.querySelector(`#mixChannels [data-ch="${id}"]`);
    const act = (id, action) => card(id).querySelector(`[data-act="${action}"]`);
    const partOf = (index) => JSON.parse(w.eval(`JSON.stringify(songParts[${index}])`));
    const capoOf = (index) => w.eval(`partCapoNumber(songParts[${index}])`);
    const capoSel = () => w.document.getElementById('ptCapo');
    const dialog = () => w.document.getElementById('partsCapo');
    const dialogRows = () =>
      Array.from(w.document.querySelectorAll('#ptCapoList .pt-capo-row')).map((el) => el.textContent);
    const ribbonCapo = () =>
      Array.from(w.document.querySelectorAll('.capo-mark')).map((el) => el.textContent.trim());
    const rollsOf = (index) => JSON.parse(w.eval(`JSON.stringify(songParts[${index}].rolls)`));
    const firstRolls = () =>
      rollsOf(0)[String(w.eval('sections[0].id'))];
    const setSelect = (select, value) => {
      select.value = String(value);
      select.dispatchEvent(new w.Event('change', { bubbles: true }));
    };
    const clickId = (id) =>
      w.document.getElementById(id).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    const fileOf = () => {
      const lib = JSON.parse(w.localStorage.getItem('struchord_songs'));
      return lib[lib.length - 1];
    };

    // ================= 1. Модель =================
    check('номер каподастра зажат в 0…12 и округляется',
      w.eval('capoNumber("3")') === 3 && w.eval('capoNumber(12.4)') === 12 &&
      w.eval('capoNumber(99)') === 12 && w.eval('capoNumber(-5)') === 0 &&
      w.eval('capoNumber("много")') === 0 && w.eval('capoNumber(null)') === 0 &&
      w.eval('capoNumber(undefined)') === 0,
      w.eval('JSON.stringify([capoNumber(99), capoNumber(-5), capoNumber("много")])'));
    check('каподастр поднимает строй множителем 2^(N/12)',
      Math.abs(w.eval('partCapoFactor({ capo: 12 })') - 2) < 1e-9 &&
      Math.abs(w.eval('partCapoFactor({})') - 1) < 1e-9 &&
      Math.abs(w.eval('partCapoFactor(null)') - 1) < 1e-9 &&
      Math.abs(w.eval('songCapoFactor()') - 1) < 1e-9);

    // ================= 2. Пересчёт аппликатуры =================
    const planDown = JSON.parse(w.eval(
      `JSON.stringify(partCapoPlan({ capo: 0, rolls: { '11': ${JSON.stringify(notes)} } }, 2))`
    ));
    check('пересчёт вниз: лады уменьшаются, чтобы высоты не изменились',
      planDown.rolls['11'][0].fret === 3 && planDown.rolls['11'][2].fret === 1,
      JSON.stringify(planDown.rolls['11'].map((n) => n.fret)));
    check('нота на открытой струне при пересчёте вниз уходит октавой вверх',
      planDown.rolls['11'][1].fret === 10 &&
      planDown.moved.some((m) => m.to === 10 && m.octave === 1),
      JSON.stringify(planDown.moved));
    check('форшлаг едет вместе со своей нотой',
      planDown.rolls['11'][2].grace.fret === 3,
      JSON.stringify(planDown.rolls['11'][2]));
    check('в списке изменённых — все три ноты, ничего не потеряно',
      planDown.moved.length === 3 && planDown.changed === 3 && planDown.kept.length === 0,
      JSON.stringify(planDown.moved));
    const planUp = JSON.parse(w.eval(
      `JSON.stringify(partCapoPlan({ capo: 5, rolls: { '11': [{ string: 5, fret: 24 }, { string: 5, fret: 20 }] } }, 0))`
    ));
    // Нота, которой не хватает грифа СВЕРХУ, уезжает октавой вниз — вверх
    // было бы ещё дальше. Это зеркало решения пользователя «неиграбельные —
    // октавой вверх» (он говорил про нижнюю границу, где вверх и надо).
    check('пересчёт вверх: нота выше грифа едет октавой вниз',
      planUp.rolls['11'][0].fret === 17 && planUp.rolls['11'][1].fret === 13 &&
      planUp.moved[1].octave === -1,
      JSON.stringify(planUp.rolls['11'].map((n) => n.fret)));
    // Защитная ветка: лад за пределами грифа (такая нота могла бы приехать
    // из очень старого файла — при каподастре до 12 и ладах до 24 недостижима).
    check('нота, которой не хватает грифа даже с октавой, остаётся как была',
      eqJson(JSON.parse(w.eval(
        `JSON.stringify(partCapoPlan({ capo: 12, rolls: { '11': [{ string: 5, fret: 30 }] } }, 0).kept)`
      )), [{ sec: 11, string: 5, fret: 30 }]) &&
      w.eval(`partCapoPlan({ capo: 12, rolls: { '11': [{ string: 5, fret: 30 }] } }, 0).rolls['11'][0].fret`) === 30);
    check('каподастр без изменений — план пуст',
      w.eval(`partCapoPlan({ capo: 3, rolls: { '11': [{ string: 5, fret: 4 }] } }, 3).moved.length`) === 0 &&
      w.eval(`partCapoPlan({ capo: 3, rolls: { '11': [{ string: 5, fret: 4 }] } }, 3).rolls['11'][0].fret`) === 4);

    // ================= 3. Звук дорожки =================
    load([guitar, bass]);
    partsScreen();
    const openNoCapo = JSON.parse(w.eval('JSON.stringify(partOpenFreqs(songParts[0]))'));
    const songOpenNoCapo = JSON.parse(w.eval('JSON.stringify(songStringFreqs())'));
    w.eval('songParts[0].capo = 3;');
    const openCapo3 = JSON.parse(w.eval('JSON.stringify(partOpenFreqs(songParts[0]))'));
    check('каподастр дорожки поднимает все её струны',
      openNoCapo.length === openCapo3.length &&
      openNoCapo.every((f, i) => Math.abs(openCapo3[i] - f * Math.pow(2, 3 / 12)) < 1e-9),
      JSON.stringify([openNoCapo[0], openCapo3[0]]));
    check('у дорожки без каподастра струна остаётся открытой',
      Math.abs(w.eval('partOpenFreqs(songParts[1])[0]') -
        w.eval('noteToFrequency(partTuningNotes(songParts[1])[0])')) < 1e-9);
    check('каподастр поднимает строй баса так же, как гитары',
      Math.abs(w.eval('partOpenFreqs(songParts[1])[0]') -
        w.eval('partOpenFreqs({ ...songParts[1], capo: 2 })[0]') * Math.pow(2, -2 / 12)) < 1e-9);
    // Предпросмотр ноты — тот же путь, что у планировщика: щипок должен
    // получить частоту от ПРИЖАТОЙ каподастром струны.
    w.eval('__pluckCalls = []; getPluckBuffer = function (ctx, freq) { __pluckCalls.push({ freq }); return { length: 1 }; };');
    const captureCtx = () => {
      const param = (v) => ({
        value: v, setValueAtTime() {}, linearRampToValueAtTime() {},
        exponentialRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {},
      });
      const mk = (kind) => {
        const node = { kind, connections: [], connect(d) { this.connections.push(d); return d; }, disconnect() {} };
        if (kind === 'gain') node.gain = param(1);
        if (kind === 'panner') node.pan = param(0);
        if (kind === 'filter') {
          node.frequency = param(1000); node.Q = param(1); node.gain = param(0); node.type = 'lowpass';
        }
        if (kind === 'source') {
          node.playbackRate = param(1); node.detune = param(0);
          node.start = () => {}; node.stop = () => {};
        }
        return node;
      };
      const made = [];
      return {
        made, currentTime: 0, sampleRate: 44100, state: 'running',
        destination: mk('destination'),
        createGain: () => mk('gain'), createStereoPanner: () => mk('panner'),
        createConvolver: () => mk('convolver'), createBiquadFilter: () => mk('filter'),
        createBufferSource: () => mk('source'), createWaveShaper: () => mk('shaper'),
        createBuffer: (ch, len) => ({ getChannelData: () => new Float32Array(len) }),
        resume() {}, close() { return Promise.resolve(); },
      };
    };
    w.__capoCtx = captureCtx();
    w.eval('mixerChannels = new Map(); guitarMasterGain = null; guitarMasterPanner = null; masterFilters = []; getAudioContext = function () { return __capoCtx; }; resumeAudioContext = function () {};');
    w.eval('previewPartNote(sections[0], 5, 0, 1, { start: 0, dur: 1, string: 5, fret: 0 });');
    const previewFreq = JSON.parse(w.eval('JSON.stringify(__pluckCalls.pop())')).freq;
    check('предпросмотр ноты щиплет прижатую каподастром струну',
      Math.abs(previewFreq - openCapo3[5]) < 1e-9,
      JSON.stringify([previewFreq, openCapo3[5]]));

    // ================= 4. Звук песни (аппликатуры не трогаем) =================
    const chordsBefore = w.eval('JSON.stringify(sections.map((s) => s.squares.map((q) => q.events.map((e) => e.chord))))');
    const rollsBefore = JSON.stringify(rollsOf(0));
    w.eval('setSongCapo(2)');
    const songOpenCapo = JSON.parse(w.eval('JSON.stringify(songStringFreqs())'));
    check('каподастр песни поднимает весь аккомпанемент',
      songOpenNoCapo.every((f, i) => Math.abs(songOpenCapo[i] - f * Math.pow(2, 2 / 12)) < 1e-9),
      JSON.stringify([songOpenNoCapo[0], songOpenCapo[0]]));
    check('аппликатура аккомпанемента считается от прижатой струны',
      Math.abs(w.eval('shapeToPluckNotes([0,0,0,0,0,0])[5].freq') - songOpenCapo[5]) < 1e-9,
      w.eval('JSON.stringify(shapeToPluckNotes([3,3,3,3,3,3]).map((n) => n.freq))'));
    check('каподастр песни НЕ трогает ни аккорды, ни аппликатуры партий',
      w.eval('JSON.stringify(sections.map((s) => s.squares.map((q) => q.events.map((e) => e.chord))))') === chordsBefore &&
      JSON.stringify(rollsOf(0)) === rollsBefore);
    check('каподастр песни читается моделью',
      w.eval('songCapo') === 2 &&
      Math.abs(w.eval('songCapoFactor()') - Math.pow(2, 2 / 12)) < 1e-9,
      String(w.eval('songCapo')));

    // ================= 5. Файл =================
    load([guitar, bass], { capo: 4 });
    partsScreen();
    check('каподастр песни приезжает из файла', w.eval('songCapo') === 4, String(w.eval('songCapo')));
    w.eval('songParts[0].capo = 3; songParts[1].capo = 1;');
    w.saveCurrentSong();
    const savedCapo = fileOf();
    check('каподастр дорожек уезжает в файл',
      savedCapo.parts[0].capo === 3 && savedCapo.parts[1].capo === 1,
      JSON.stringify(savedCapo.parts.map((p) => p.capo)));
    check('каподастр песни уезжает в файл', savedCapo.capo === 4, JSON.stringify(savedCapo.capo));
    w.loadSong(0);
    w.eval('render()');
    partsScreen();
    check('каподастр пережил перезагрузку песни',
      capoOf(0) === 3 && capoOf(1) === 1 && w.eval('songCapo') === 4,
      JSON.stringify([capoOf(0), capoOf(1), w.eval('songCapo')]));
    load([{ ...guitar, capo: 0 }], { capo: 0 });
    w.saveCurrentSong();
    check('«нет каподастра» в файл не пишется',
      fileOf().capo === undefined && fileOf().parts[0].capo === undefined,
      JSON.stringify(fileOf().parts[0]));
    load([{ ...guitar, capo: 'много' }, { ...bass, capo: 99 }], { capo: -3 });
    check('мусор в каподастре: нечисло и отрицательное пропадают, выход за 12 зажат',
      capoOf(0) === 0 && capoOf(1) === 12 && w.eval('songCapo') === 0,
      JSON.stringify([capoOf(0), capoOf(1), w.eval('songCapo')]));

    // ================= 6. UI =================
    load([guitar, bass], { capo: 0 });
    partsScreen();
    check('в панели дорожки выбор каподастра с 13 значениями',
      !!capoSel() && capoSel().options.length === 13 &&
      optionLabels(capoSel()) === 'Нет|Капо 1|Капо 12',
      JSON.stringify(Array.from(capoSel() ? capoSel().options : []).map((o) => o.textContent)));
    w.eval('songParts[0].capo = 3; syncPartsTrackBar();');
    check('выбор каподастра показывает значение дорожки', capoSel().value === '3', capoSel().value);
    check('каподастр песни выбирается в карточке канала «Песня»',
      !!act('song', 'songCapo') && act('song', 'songCapo').options.length === 13 &&
      optionLabels(act('song', 'songCapo')) === 'без каподастра|каподастр 1|каподастр 12' &&
      act('song', 'songCapo').value === '0',
      act('song', 'songCapo') ? optionLabels(act('song', 'songCapo')) : 'нет селекта');
    check('в карточке дорожки нет выбора каподастра песни',
      !act(chId(0), 'songCapo') && !!act(chId(0), 'sound'));
    w.eval('renderPartsScreen()');
    check('каподастр виден на карточке дорожки пометкой «капо N»',
      w.document.querySelector(`#partsTracks [data-part="${w.eval('songParts[0].id')}"] .pt-track-capo`).textContent === 'капо 3',
      w.document.querySelector('#partsTracks').textContent);
    check('у песни без каподастра плашки над лентой нет', ribbonCapo().length === 0);
    setSelect(act('song', 'songCapo'), 5);
    check('выбор в микшере ставит каподастр песни и подпись над лентой',
      w.eval('songCapo') === 5 && eqJson(ribbonCapo(), ['играть с каподастром 5', 'играть с каподастром 5']),
      JSON.stringify(ribbonCapo()));
    check('плашка каподастра переживает быстрый путь обновления шапки B-25',
      (w.eval('syncSectionHeaderDom(sections[0])'),
        eqJson(ribbonCapo(), ['играть с каподастром 5', 'играть с каподастром 5'])),
      JSON.stringify(ribbonCapo()));
    setSelect(act('song', 'songCapo'), 0);
    check('снятие каподастра убирает плашку', ribbonCapo().length === 0);

    // ================= 7. Окно выбора режима =================
    load([guitar, bass]);
    partsScreen();
    setSelect(capoSel(), 2);
    check('при смене каподастра у дорожки с нотами открывается окно выбора',
      !dialog().hidden && w.document.getElementById('ptCapoNote').textContent.indexOf('→') > 0,
      w.document.getElementById('ptCapoNote').textContent);
    check('в окне показаны последствия пересчёта, а ноты ещё не тронуты',
      dialogRows().length === 3 && dialogRows()[0].indexOf('лад 5 → 3') > 0 && capoOf(0) === 0,
      JSON.stringify([dialogRows(), capoOf(0)]));
    check('в окне перечислены ноты, уехавшие октавой',
      dialogRows().some((row) => row.indexOf('октавой выше') > 0),
      JSON.stringify(dialogRows()));
    clickId('ptCapoCancel');
    check('«Отмена» не меняет модель и возвращает выбор панели',
      capoOf(0) === 0 && dialog().hidden && capoSel().value === '0',
      JSON.stringify([capoOf(0), dialog().hidden, capoSel().value]));
    setSelect(capoSel(), 2);
    clickId('ptCapoAdjust');
    const adjusted = firstRolls();
    check('«Пересчитать» меняет лады по плану и ставит каподастр',
      capoOf(0) === 2 && adjusted[0].fret === 3 && adjusted[2].fret === 1 &&
      adjusted[2].grace.fret === 3 && dialog().hidden,
      JSON.stringify(adjusted.map((n) => n.fret)));
    await settle();
    w.undoEdit();
    await tick();
    check('пересчёт откатывается одним Ctrl+Z',
      capoOf(0) === 0 && firstRolls()[0].fret === 5,
      JSON.stringify([capoOf(0), firstRolls().map((n) => n.fret)]));
    w.eval('renderPartsScreen()');
    setSelect(capoSel(), 4);
    clickId('ptCapoKeep');
    const keptRolls = firstRolls();
    check('«Оставить аппликатуру» не меняет лады, но ставит каподастр',
      capoOf(0) === 4 && keptRolls[0].fret === 5 && keptRolls[2].grace.fret === 5 && dialog().hidden,
      JSON.stringify(keptRolls.map((n) => n.fret)));
    check('каподастр звучит: строй дорожки поднят на 4 лада',
      Math.abs(w.eval('partOpenFreqs(songParts[0])[5]') -
        w.eval('partOpenFreqs({ ...songParts[0], capo: 0 })[5]') * Math.pow(2, 4 / 12)) < 1e-9);
    w.eval('songParts[0].capo = 0; renderPartsScreen();');
    setSelect(capoSel(), 3);
    clickId('ptCapoKeep');
    await settle();
    w.undoEdit();
    await tick();
    check('каподастр дорожки откатывается одним Ctrl+Z', capoOf(0) === 0, String(capoOf(0)));
    w.eval('renderPartsScreen()');
    load([]);
    partsScreen();
    check('без дорожек каподастр не выбирается', capoSel().disabled === true, String(capoSel().disabled));
    load([guitar, bass]);
    partsScreen();
    w.eval('songParts[0].rolls = { "11": [], "12": [] }; renderPartsScreen();');
    setSelect(capoSel(), 7);
    check('у пустой дорожки спрашивать не о чем: каподастр ставится молча',
      dialog().hidden && capoOf(0) === 7, JSON.stringify([dialog().hidden, capoOf(0)]));

    // ================= 8. Отмена песни =================
    load([guitar, bass]);
    setSelect(w.document.querySelector('#mixChannels [data-act="songCapo"]'), 6);
    await settle();
    w.undoEdit();
    await tick();
    check('каподастр песни откатывается одним Ctrl+Z',
      w.eval('songCapo') === 0 && ribbonCapo().length === 0, String(w.eval('songCapo')));

    console.log(`\nитого: ${pass} ok, ${fail} FAIL`);
    if (fail) process.exitCode = 1;
  } catch (e) {
    console.error('ОШИБКА:', e && e.stack ? e.stack : e);
    process.exitCode = 1;
  }
});
