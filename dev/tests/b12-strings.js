#!/usr/bin/env node
/*
 * b12-strings.js — B-12.9.1 «Любой строй и любое число струн».
 *
 * Проверяем:
 *  1. Модель: свой строй массивом нот задаёт и строй, и число струн
 *     (7/8 у гитары, 5 у баса); мусор отбрасывается поштучно; лимит 12;
 *  2. Файл: свой строй уезжает в песню и читается назад; совпадение с
 *     пресетом или строем песни в файл не пишется (файл не пухнет);
 *  3. Санитайз: ноты на «лишней» седьмой струне сохраняются, если строй
 *     объявил семь струн, и отбрасываются, если строй сломан;
 *  4. Звук: частоты открытых струн считаются по своему строю (и с капо);
 *  5. Окно «Строй дорожки»: строки по струнам, готовые пресеты, «+ струна»,
 *     «− струна», «Как в песне», предупреждение о неиграбельных нотах;
 *  6. Применение: одна команда Store, Ctrl+Z возвращает прежний строй;
 *  7. Сужение: убранные струны спрашивают про ноты и не теряются молча;
 *  8. Таб: семь струн рисуются семью линиями, восьмая — восемью;
 *  9. Обычные дорожки не изменились (6 и 4 струны, «как в песне»).
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

const square = (id, chord) => ({
  id, repeat: 1, customBeats: 4,
  events: [{ chord, span: 4, timeSig: null, strumPattern: null }],
});
const song = (parts) => ({
  schemaVersion: 5, metadata: { artist: 'A', title: 'Строй' }, bpm: 120,
  globalKey: 'C', keyMode: 'manual', globalTimeSig: '4/4', tuning: 'e-std',
  tuningNotes: null, notes: '',
  sections: [{
    id: 1, type: 'Verse', customName: null, key: null, shift: null, timeSig: null,
    bpm: null, repeat: 1, strumPattern: null, squares: [square(11, 'C')],
  }],
  parts, nextId: 90, rhythmPool: null, userFingerings: [], preferredFingerings: [], date: '',
});
const guitar = (extra) => Object.assign({
  id: 1, name: 'Соло', instrument: 'guitar', tuning: null, visible: true,
  rolls: { '1': [{ start: 0, dur: 1, string: 5, fret: 7 }] },
}, extra || {});
const bass = (extra) => Object.assign({
  id: 2, name: 'Бас', instrument: 'bass', tuning: null, visible: true,
  rolls: { '1': [{ start: 0, dur: 2, string: 0, fret: 3 }] },
}, extra || {});

w.addEventListener('load', async () => {
  try {
    const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
    const settle = () => new Promise((resolve) => setTimeout(resolve, 460));
    const load = (parts) => {
      w.localStorage.setItem('struchord_songs', JSON.stringify([song(parts)]));
      w.loadSong(0);
      w.eval('render()');
      w.confirm = () => true;
    };
    const roll = (i) => JSON.parse(w.eval(`JSON.stringify(songParts[${i}].rolls[String(sections[0].id)] || [])`));
    const fileOf = () => {
      const lib = JSON.parse(w.localStorage.getItem('struchord_songs'));
      return lib[lib.length - 1];
    };
    const partOf = (i) => JSON.parse(w.eval(`JSON.stringify({
      strings: songParts[${i}].strings || null,
      tuning: songParts[${i}].tuning || null
    })`));

    // ================= 1. Модель =================
    const SEVEN = ['B1', 'E2', 'A2', 'D3', 'G3', 'B3', 'E4'];
    check('свой строй задаёт и строй, и число струн',
      w.eval(`partStringCount({instrument:'guitar', strings:${JSON.stringify(SEVEN)}})`) === 7 &&
      w.eval(`partStringCount({instrument:'bass', strings:['B0','E1','A1','D2','G2']})`) === 5 &&
      w.eval("partStringCount({instrument:'guitar'})") === 6 &&
      w.eval("partStringCount({instrument:'bass'})") === 4);
    check('свой строй важнее пресета',
      JSON.parse(w.eval(`JSON.stringify(partTuningNotes({instrument:'guitar', tuning:'drop-d', strings:${JSON.stringify(SEVEN)}}))`)).join(' ') === SEVEN.join(' ') &&
      JSON.parse(w.eval("JSON.stringify(partTuningNotes({instrument:'guitar', tuning:'drop-d'}))")).join(' ') === 'D2 A2 D3 G3 B3 E4');
    check('мусор в строю отбрасывается поштучно',
      JSON.parse(w.eval(`JSON.stringify(partCustomStrings({strings:['E2','ХХ','', 'A2', 'E9xx', 5, 'D3']}))`)).join(' ') === 'E2 A2 D3');
    check('строй длиннее лимита обрезается',
      w.eval(`partStringCount({instrument:'guitar', strings: new Array(20).fill('E2')})`) === 12);
    check('пустой и битый строй — обычное поведение инструмента',
      w.eval("partStringCount({instrument:'guitar', strings: []})") === 6 &&
      w.eval("partStringCount({instrument:'bass', strings: 'DADGAD'})") === 4 &&
      w.eval("partCustomStrings({strings: [1,2,3]})") === null);

    // ================= 2. Файл =================
    load([guitar({ strings: SEVEN }), bass()]);
    w.saveCurrentSong();
    const savedSong = fileOf();
    check('свой строй уезжает в файл',
      JSON.parse(JSON.stringify(savedSong.parts[0].strings)).join(' ') === SEVEN.join(' ') &&
      savedSong.parts[0].strings.length === 7,
      JSON.stringify(savedSong.parts[0]));
    check('у обычной дорожки поля строя в файле нет',
      savedSong.parts[1].strings === undefined && savedSong.parts[1].tuning === null,
      JSON.stringify(savedSong.parts[1]));
    w.loadSong(0);
    w.eval('render()');
    check('свой строй пережил перезагрузку песни',
      JSON.parse(w.eval('JSON.stringify(partTuningNotes(songParts[0]))')).join(' ') === SEVEN.join(' ') &&
      w.eval('partStringCount(songParts[0])') === 7,
      w.eval('JSON.stringify(partTuningNotes(songParts[0]))'));
    load([guitar({ strings: ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'] }), bass()]);
    w.saveCurrentSong();
    check('строй, совпавший с пресетом, хранится пресетом (файл не пухнет)',
      fileOf().parts[0].strings === undefined && fileOf().parts[0].tuning === 'drop-d',
      JSON.stringify(fileOf().parts[0]));
    w.loadSong(0);
    w.eval('render()');
    check('пресет из файла читается как пресет',
      JSON.parse(w.eval('JSON.stringify(partTuningNotes(songParts[0]))')).join(' ') === 'D2 A2 D3 G3 B3 E4');

    // ================= 3. Санитайз =================
    load([guitar({
      strings: SEVEN,
      rolls: { '1': [{ start: 0, dur: 1, string: 6, fret: 3 }, { start: 1, dur: 1, string: 0, fret: 5 }] },
    })]);
    check('нота на седьмой струне живёт, если строй объявил семь струн',
      roll(0).length === 2 && roll(0)[0].string === 6 && roll(0)[0].fret === 3,
      JSON.stringify(roll(0)));
    load([guitar({
      strings: ['E2', 'плохо'],
      rolls: { '1': [{ start: 0, dur: 1, string: 6, fret: 3 }, { start: 1, dur: 1, string: 5, fret: 7 }] },
    })]);
    check('битая запись строя отбрасывает строй целиком (иначе струны сдвинулись бы)',
      partOf(0).strings === null && roll(0).length === 1 && roll(0)[0].string === 5,
      JSON.stringify([partOf(0), roll(0)]));
    load([guitar({
      strings: new Array(20).fill('E2'),
      rolls: { '1': [{ start: 0, dur: 1, string: 11, fret: 3 }] },
    })]);
    check('строй из файла обрезается лимитом, ноты за лимитом не принимаются',
      partOf(0).strings.length === 12 && roll(0).length === 1 && roll(0)[0].string === 11,
      JSON.stringify([partOf(0).strings.length, roll(0)]));

    // ================= 4. Звук =================
    load([guitar({ strings: SEVEN })]);
    const freqs = JSON.parse(w.eval('JSON.stringify(partOpenFreqs(songParts[0]))'));
    check('частоты открытых струн идут по своему строю (семь частот)',
      freqs.length === 7 &&
      Math.abs(freqs[0] - w.eval('noteToFrequency("B1")')) < 1e-6 &&
      Math.abs(freqs[6] - w.eval('noteToFrequency("E4")')) < 1e-6,
      JSON.stringify(freqs.map((f) => Math.round(f * 100) / 100)));
    load([guitar({ strings: SEVEN, capo: 2 })]);
    const capoFreqs = JSON.parse(w.eval('JSON.stringify(partOpenFreqs(songParts[0]))'));
    check('каподастр поднимает и свой строй',
      Math.abs(capoFreqs[0] - w.eval('noteToFrequency("B1")') * Math.pow(2, 2 / 12)) < 1e-6,
      String(capoFreqs[0]));

    // ================= 5. Окно «Строй дорожки» =================
    load([guitar()]);
    w.eval('togglePartsMode(true)');
    const tuneSel = w.document.getElementById('ptTuning');
    check('в списке строёв есть пункт «Свой строй…»',
      !!tuneSel.querySelector('option[value="__custom__"]'));
    w.eval('openPartTuningDialog()');
    const overlay = w.document.getElementById('partsTuning');
    const rows = () => Array.from(w.document.querySelectorAll('#ptTuningRows .pt-tuning-row'));
    check('окно открыто и показывает шесть строк по струнам',
      overlay.hidden === false && rows().length === 6 &&
      rows()[0].querySelector('span').textContent === 'Струна 6',
      JSON.stringify([overlay.hidden, rows().length]));
    check('готовые строи инструмента доступны кнопками',
      Array.from(w.document.querySelectorAll('#ptTuningPresets .pt-pal-btn')).length > 3,
      String(w.document.querySelectorAll('#ptTuningPresets .pt-pal-btn').length));
    w.document.getElementById('ptTuningAdd').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    check('«+ струна» добавляет струну ниже самой низкой',
      rows().length === 7 && rows()[6].querySelector('span').textContent === 'Струна 1' &&
      w.eval('partsTuningDraft[0]') === 'B1',
      JSON.stringify([rows().length, w.eval('partsTuningDraft[0]')]));
    w.document.getElementById('ptTuningRemove').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    check('«− струна» убирает самую низкую', rows().length === 6 && w.eval('partsTuningDraft[0]') === 'E2');
    w.document.getElementById('ptTuningSong').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    check('«Как в песне» подставляет строй песни',
      rows().length === 6 && JSON.parse(w.eval('JSON.stringify(partsTuningDraft)')).join(' ') === 'E2 A2 D3 G3 B3 E4',
      w.eval('JSON.stringify(partsTuningDraft)'));
    w.document.getElementById('ptTuningCancel').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    check('«Отмена» закрывает окно и ничего не меняет',
      overlay.hidden === true && partOf(0).strings === null && partOf(0).tuning === null,
      JSON.stringify(partOf(0)));

    // Применение своего строя
    w.eval('openPartTuningDialog()');
    w.document.getElementById('ptTuningAdd').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    w.document.getElementById('ptTuningApply').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    check('«Готово» применяет свой строй и закрывает окно',
      overlay.hidden === true && partOf(0).strings && partOf(0).strings.length === 7 &&
      partOf(0).strings[0] === 'B1',
      JSON.stringify(partOf(0)));
    check('панель дорожки показывает «Свой строй (7)»',
      tuneSel.value === '__custom__' && tuneSel.querySelector('option[value="__custom__"]').textContent === 'Свой строй (7)…',
      tuneSel.value);
    check('карточка/панель называет свой строй нотами',
      w.eval('partTuningName(songParts[0])').indexOf('Свой строй: B1') === 0,
      w.eval('partTuningName(songParts[0])'));
    await settle();
    w.undoEdit();
    await tick();
    check('Ctrl+Z возвращает прежний строй',
      partOf(0).strings === null && partOf(0).tuning === null,
      JSON.stringify(partOf(0)));

    // ================= 6. Сужение спрашивает про ноты =================
    load([guitar({
      strings: SEVEN,
      rolls: { '1': [
        { start: 0, dur: 1, string: 6, fret: 3 },
        { start: 1, dur: 1, string: 5, fret: 7 },
      ] },
    })]);
    w.eval('togglePartsMode(true); setPartsEditMode("input")');
    let asked = null;
    w.confirm = (msg) => { asked = msg; return true; };
    w.eval('applyPartStrings(["E2","A2","D3","G3","B3","E4"])');
    check('сужение строя спрашивает про осиротевшие ноты',
      !!asked && asked.indexOf('1 нот') !== -1 && asked.indexOf('6 струн') !== -1,
      String(asked));
    check('согласие убирает ноту с исчезнувшей струны',
      partOf(0).strings === null && partOf(0).tuning === 'e-std' && roll(0).length === 1 && roll(0)[0].string === 5,
      JSON.stringify([partOf(0), roll(0)]));
    load([guitar({
      strings: SEVEN,
      rolls: { '1': [{ start: 0, dur: 1, string: 6, fret: 3 }] },
    })]);
    w.eval('togglePartsMode(true); setPartsEditMode("input")');
    w.confirm = () => false;
    w.eval('applyPartStrings(["E2","A2","D3","G3","B3","E4"])');
    check('отказ в подтверждении оставляет всё как было',
      partOf(0).strings.length === 7 && roll(0).length === 1 && roll(0)[0].string === 6,
      JSON.stringify([partOf(0), roll(0)]));
    load([guitar({
      strings: SEVEN,
      rolls: { '1': [{ start: 0, dur: 1, string: 6, fret: 3 }] },
    })]);
    w.eval('togglePartsMode(false); togglePartsMode(true)');
    let blockedConfirm = false;
    w.confirm = () => { blockedConfirm = true; return true; };
    w.eval('applyPartStrings(["E2","A2","D3","G3","B3","E4"])');
    check('Select блокирует сужение строя, если оно удалило бы ноту',
      !blockedConfirm && partOf(0).strings.length === 7 && roll(0).length === 1 && roll(0)[0].string === 6,
      JSON.stringify({ blockedConfirm, part: partOf(0), roll: roll(0) }));

    // ================= 7. Таб рисует все струны =================
    load([guitar({ strings: SEVEN })]);
    check('семь струн — семь линий стана',
      w.eval('buildPartTabSvg(songParts[0], sections[0], null).querySelectorAll(".pt-string").length') === 7,
      String(w.eval('buildPartTabSvg(songParts[0], sections[0], null).querySelectorAll(".pt-string").length')));
    load([guitar({ strings: ['F#1', 'B1', 'E2', 'A2', 'D3', 'G3', 'B3', 'E4'] })]);
    check('восемь струн — восемь линий и нота на восьмой струне',
      w.eval('buildPartTabSvg(songParts[0], sections[0], null).querySelectorAll(".pt-string").length') === 8 &&
      w.eval('partStringCount(songParts[0])') === 8,
      String(w.eval('partStringCount(songParts[0])')));

    // ================= 8. Обычные дорожки не изменились =================
    load([guitar(), bass()]);
    check('без своего строя всё как прежде',
      w.eval('partStringCount(songParts[0])') === 6 && w.eval('partStringCount(songParts[1])') === 4 &&
      JSON.parse(w.eval('JSON.stringify(partTuningNotes(songParts[1]))')).length === 4 &&
      w.eval('buildPartTabSvg(songParts[1], sections[0], null).querySelectorAll(".pt-string").length') === 4);
    check('список строёв показывает пресеты, пока своего строя нет',
      w.eval('(() => { togglePartsMode(true); return document.getElementById("ptTuning").value; })()') === '');

    console.log(`\nитого: ${pass} ok, ${fail} FAIL`);
    if (fail) process.exitCode = 1;
  } catch (e) {
    console.error('ОШИБКА:', e && e.stack ? e.stack : e);
    process.exitCode = 1;
  }
});
