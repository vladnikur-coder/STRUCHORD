#!/usr/bin/env node
/*
 * b12-tracks.js — B-12.3 «Дорожки», кирпич 3 серии «Партии».
 *
 * Проверяем:
 *  1. Стопку: все включённые дорожки рисуются рядами одной секции, активная
 *     одна, курсор только в ней, карточки над табулатурами;
 *  2. Переключение: карточка и Ctrl+↑/↓ (в GP это Next/Previous Track),
 *     на краях списка стоим на месте; клик по чужому табу выбирает дорожку;
 *  3. Инструменты: гитара 6 струн и бас 4 струны; строй по инструменту
 *     («как в песне» у баса — нижние 4 струны песни октавой ниже),
 *     басовые пресеты и их частоты;
 *  4. Звук: играют все включённые дорожки, каждая своим тембром, каждая от
 *     своих открытых струн; выключённая молчит;
 *  5. Операции: добавить / клонировать / переименовать / поднять-опустить /
 *     удалить — каждая одной командой Store;
 *  6. Включение и выключение дорожки; все выключены → пустое состояние с
 *     кнопкой «Включить дорожку»;
 *  7. Сужение (смена инструмента): confirm с числом нот, отказ откатывает
 *     выбор, согласие убирает недостижимые ноты, список строёв пересобран;
 *  8. Файл: инструмент и строй дорожки переживают сохранение и загрузку;
 *  9. История: операции дорожек откатываются Ctrl+Z и возвращаются Ctrl+Y;
 * 10. Ввод нот идёт в АКТИВНУЮ дорожку, соседние не трогает;
 * 11. Мусор в файле: чужой инструмент → гитара, чужой строй → «как в песне»,
 *     нота на несуществующей струне отбрасывается.
 *
 * Важно про id: при загрузке песни санитайз переназначает id секций и партий
 * (idFor) — тест берёт их из модели, а не из файла-заготовки.
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
  schemaVersion: 5, metadata: { artist: 'A', title: 'B' }, bpm: 120, globalKey: 'C',
  keyMode: 'manual', globalTimeSig: '4/4', tuning: 'e-std', tuningNotes: null, notes: '',
  sections: [{
    id: 1, type: 'Verse', customName: null, key: null, shift: null, timeSig: null,
    bpm: null, repeat: 1, strumPattern: null, squares: [square(11, 'C')],
  }],
  parts, nextId: 90, rhythmPool: null, userFingerings: [], preferredFingerings: [], date: '',
});
const guitar = {
  id: 1, name: 'Соло', instrument: 'guitar', tuning: null, visible: true,
  rolls: { '1': [{ start: 0, dur: 1, string: 5, fret: 7 }] },
};
const bass = {
  id: 2, name: 'Бас', instrument: 'bass', tuning: null, visible: true,
  rolls: { '1': [{ start: 0, dur: 2, string: 0, fret: 3 }] },
};

w.addEventListener('load', () => {
  try {
    const load = (parts) => {
      w.localStorage.setItem('struchord_songs', JSON.stringify([song(parts)]));
      w.loadSong(0);
      w.eval('render()');
      w.confirm = () => true;
    };
    const key = (k, opts) => {
      w.document.dispatchEvent(new w.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true }, opts || {})));
    };
    // id и содержимое — из модели после загрузки (см. заголовок файла).
    const P = (i, expr) => w.eval(`songParts[${i}]${expr === undefined ? '' : '.' + expr}`);
    const pid = (i) => w.eval(`songParts[${i}].id`);
    const roll = (i) => JSON.parse(w.eval(`JSON.stringify(songParts[${i}].rolls[String(sections[0].id)] || [])`));
    const names = () => w.eval('JSON.stringify(songParts.map(p => p.name))');
    const chip = (id) => w.document.querySelector(`#partsTracks .pt-track-chip[data-part="${id}"]`);
    const row = (id) => w.document.querySelector(`.pt-row[data-part="${id}"]`);

    // ---------- 1. Стопка дорожек ----------
    load([guitar, bass]);
    w.eval('togglePartsMode(true)');
    const G = pid(0);
    const B = pid(1);
    const track = w.document.getElementById('partsTrack');
    check('стопка: обе дорожки — рядами одной секции',
      track.querySelectorAll('.pt-row').length === 2 && track.querySelectorAll('.pt-section').length === 1,
      String(track.querySelectorAll('.pt-row').length));
    check('подписи дорожек видны',
      Array.from(track.querySelectorAll('.pt-row-label b')).map((el) => el.textContent).join('|') === 'Соло|Бас',
      Array.from(track.querySelectorAll('.pt-row-label b')).map((el) => el.textContent).join('|'));
    check('активный ряд — первый и он один',
      row(G).classList.contains('is-active') && track.querySelectorAll('.pt-row.is-active').length === 1);
    check('курсор только в активном ряду', track.querySelectorAll('.pt-cursor').length === 1);
    check('каждая дорожка нарисовала свою ноту своему ряду',
      row(G).querySelectorAll('.pt-note').length === 1 && row(B).querySelectorAll('.pt-note').length === 1,
      JSON.stringify([row(G).querySelectorAll('.pt-note').length, row(B).querySelectorAll('.pt-note').length]));
    check('карточки дорожек построены по порядку',
      Array.from(w.document.querySelectorAll('#partsTracks .pt-track-chip')).map((el) => el.dataset.part).join(',') ===
        `${G},${B}`,
      Array.from(w.document.querySelectorAll('#partsTracks .pt-track-chip')).map((el) => el.dataset.part).join(','));
    check('активна ровно одна карточка',
      chip(G).classList.contains('is-active') &&
      w.document.querySelectorAll('#partsTracks .pt-track-chip.is-active').length === 1);
    check('на карточке — имя и инструмент',
      chip(G).querySelector('.pt-track-name').textContent === 'Соло' &&
      chip(G).querySelector('.pt-track-kind').textContent === 'Гитара' &&
      chip(B).querySelector('.pt-track-kind').textContent === 'Бас');
    check('пилюля активной дорожки',
      w.document.getElementById('partsActiveName').textContent === 'Соло · Гитара',
      w.document.getElementById('partsActiveName').textContent);

    // ---------- 2. Переключение дорожек ----------
    chip(B).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    check('клик по карточке сделал бас активным',
      w.eval('partsActiveId') === B && row(B).classList.contains('is-active') && !row(G).classList.contains('is-active'),
      String(w.eval('partsActiveId')));
    check('пилюля обновилась', w.document.getElementById('partsActiveName').textContent === 'Бас · Бас',
      w.document.getElementById('partsActiveName').textContent);
    check('курсор остался в активном ряду', w.eval('partsCursor.partId') === B,
      JSON.stringify(w.eval('partsCursor')));
    key('ArrowDown', { code: 'ArrowDown', ctrlKey: true });
    check('на нижнем краю списка Ctrl+↓ ничего не делает', w.eval('partsActiveId') === B);
    key('ArrowUp', { code: 'ArrowUp', ctrlKey: true });
    check('Ctrl+↑ вернул на первую дорожку', w.eval('partsActiveId') === G, String(w.eval('partsActiveId')));
    key('ArrowUp', { code: 'ArrowUp', ctrlKey: true });
    check('на верхнем краю стоим на месте', w.eval('partsActiveId') === G);
    key('ArrowDown', { code: 'ArrowDown', ctrlKey: true });
    check('Ctrl+↓ дошёл до баса', w.eval('partsActiveId') === B, String(w.eval('partsActiveId')));
    check('панель подписана активной дорожкой',
      w.document.getElementById('ptTrackName').value === 'Бас',
      w.document.getElementById('ptTrackName').value);

    // ---------- 3. Клик по табу неактивной дорожки ----------
    const bassSvg = row(B).querySelector('.pt-svg');
    bassSvg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 96, height: 60, right: 96, bottom: 60 });
    bassSvg.dispatchEvent(new w.MouseEvent('pointerdown', { clientX: 12, clientY: 10, bubbles: true }));
    check('клик по табу баса сделал его активным', w.eval('partsActiveId') === B, String(w.eval('partsActiveId')));
    check('курсор встал в бас', w.eval('partsCursor && partsCursor.partId') === B, JSON.stringify(w.eval('partsCursor')));
    check('курсор не вышел за 4 струны баса', w.eval('partsCursor.string') <= 3,
      String(w.eval('partsCursor.string')));
    check('клик НЕ добавил ноту', roll(1).length === 1, JSON.stringify(roll(1)));

    // ---------- 4. Инструменты, строй, частоты ----------
    check('гитара — 6 струн', P(0, 'instrument') === 'guitar' && w.eval('partStringCount(songParts[0])') === 6);
    check('бас — 4 струны', w.eval('partStringCount(songParts[1])') === 4);
    check('гитара «как в песне» — строй песни',
      w.eval('partTuningName(songParts[0])') === 'Как в песне' &&
      w.eval('JSON.stringify(partTuningNotes(songParts[0]))') === '["E2","A2","D3","G3","B3","E4"]',
      w.eval('JSON.stringify(partTuningNotes(songParts[0]))'));
    check('бас «как в песне» — нижние 4 струны октавой ниже',
      w.eval('partTuningName(songParts[1])') === 'Как в песне (октавой ниже)' &&
      w.eval('JSON.stringify(partTuningNotes(songParts[1]))') === '["E1","A1","D2","G2"]',
      w.eval('JSON.stringify(partTuningNotes(songParts[1]))'));
    check('басовый пресет Drop D',
      (w.eval('songParts[1].tuning = "bass-drop-d"'),
      w.eval('partTuningName(songParts[1])') === 'Бас: Drop D (D A D G)' &&
        w.eval('JSON.stringify(partTuningNotes(songParts[1]))') === '["D1","A1","D2","G2"]') === true,
      w.eval('JSON.stringify(partTuningNotes(songParts[1]))'));
    check('басовый пресет D G C F',
      (w.eval('songParts[1].tuning = "bass-d-std"'),
      w.eval('JSON.stringify(partTuningNotes(songParts[1]))') === '["D1","G1","C2","F2"]') === true,
      w.eval('JSON.stringify(partTuningNotes(songParts[1]))'));
    w.eval('songParts[1].tuning = null');
    const bassF = w.eval('partOpenFreqs(songParts[1])[0]');
    const guitarF = w.eval('partOpenFreqs(songParts[0])[0]');
    check('бас «как в песне» звучит октавой ниже гитары', Math.abs(bassF * 2 - guitarF) < 0.01,
      `${bassF} vs ${guitarF}`);
    const bassFreqs = JSON.parse(w.eval('JSON.stringify(partOpenFreqs(songParts[1]).map((f) => Math.round(f * 100) / 100))'));
    check('частоты басовых струн — по таблице (E1 A1 D2 G2)',
      JSON.stringify(bassFreqs) === '[41.2,55,73.42,98]', JSON.stringify(bassFreqs));

    // ---------- 5. Звук: все включённые дорожки, каждая своим тембром ----------
    w.eval(`
      window.__plucks = [];
      pluckString = function(ctx, opts) {
        window.__plucks.push({ f: opts.freq, gain: opts.gain, b: opts.brightness, pan: opts.pan });
      };
    `);
    w.eval('schedulePartsForEvent({}, sections[0], sections[0].squares[0], 0, 0, 1)');
    const plucks = JSON.parse(w.eval('JSON.stringify(window.__plucks)'));
    check('играют обе дорожки', plucks.length === 2, JSON.stringify(plucks));
    check('гитара взяла ноту E4 + лад 7',
      plucks.some((p) => Math.abs(p.f - 329.63 * Math.pow(2, 7 / 12)) < 0.5), JSON.stringify(plucks));
    check('бас взял низкую ноту (E1 + лад 3)',
      plucks.some((p) => Math.abs(p.f - 41.203 * Math.pow(2, 3 / 12)) < 0.5), JSON.stringify(plucks));
    check('тембр баса темнее, чем у гитары',
      plucks.some((p) => p.b < 0.3) && plucks.some((p) => p.b > 0.4), JSON.stringify(plucks));
    check('громкость — из таблицы тембров (бас 0.5, гитара 0.42)',
      plucks.some((p) => Math.abs(p.gain - 0.5) < 1e-6) && plucks.some((p) => Math.abs(p.gain - 0.42) < 1e-6),
      JSON.stringify(plucks.map((p) => p.gain)));
    w.eval('window.__plucks = []; songParts[1].visible = false;');
    w.eval('schedulePartsForEvent({}, sections[0], sections[0].squares[0], 0, 0, 1)');
    check('выключенная дорожка молчит',
      JSON.parse(w.eval('JSON.stringify(window.__plucks)')).length === 1,
      w.eval('JSON.stringify(window.__plucks)'));
    w.eval('songParts[1].visible = true');

    // ---------- 6. Операции над дорожками ----------
    w.eval(`partsActiveId = ${G}; renderPartsScreen();`);
    w.document.getElementById('ptAddTrack').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    const NEW = pid(2);
    check('«+» добавил дорожку и сделал её активной',
      w.eval('songParts.length') === 3 && w.eval('partsActiveId') === w.eval('songParts[2].id'),
      String(w.eval('songParts.length')));
    check('новая дорожка пуста и унаследовала инструмент',
      w.eval('Object.keys(songParts[2].rolls).length') === 0 && P(2, 'instrument') === 'guitar');
    check('id дорожек уникальны',
      new Set(JSON.parse(w.eval('JSON.stringify(songParts.map(p => p.id))'))).size === 3);
    check('карточка новой дорожки появилась', !!chip(NEW));

    w.eval(`partsActiveId = ${G}; renderPartsScreen();`);
    w.document.getElementById('ptTrackClone').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    check('клон создан рядом с оригиналом',
      w.eval('songParts.length') === 4 && P(0, 'name') === 'Соло' && P(1, 'name') === 'Соло копия',
      names());
    check('ноты клона — своя копия (не те же объекты)',
      w.eval(`songParts[1].rolls[String(sections[0].id)][0] !== songParts[0].rolls[String(sections[0].id)][0]`) === true &&
      roll(1).length === 1 && roll(1)[0].fret === 7, JSON.stringify(roll(1)));
    check('активным стал клон', w.eval('partsActiveId') === pid(1));

    const nameInput = w.document.getElementById('ptTrackName');
    nameInput.value = 'Ритм-гитара';
    nameInput.dispatchEvent(new w.Event('blur', { bubbles: true }));
    check('переименование из панели', P(1, 'name') === 'Ритм-гитара', P(1, 'name'));
    check('карточка подписалась новым именем',
      w.document.querySelectorAll('#partsTracks .pt-track-name')[1].textContent === 'Ритм-гитара',
      w.document.querySelectorAll('#partsTracks .pt-track-name')[1].textContent);
    check('пустое имя не переписывает дорожку',
      (nameInput.value = '   ',
      nameInput.dispatchEvent(new w.Event('blur', { bubbles: true })),
      P(1, 'name') === 'Ритм-гитара') === true, P(1, 'name'));

    w.eval(`partsActiveId = ${G}; renderPartsScreen();`);
    w.document.getElementById('ptTrackDown').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    check('«↓» опустил дорожку', P(1, 'name') === 'Соло', names());
    check('вместе с дорожкой переехали её ноты', roll(1)[0].fret === 7, JSON.stringify(roll(1)));
    w.document.getElementById('ptTrackUp').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    check('«↑» вернул дорожку обратно', P(0, 'name') === 'Соло', names());

    const countBefore = w.eval('songParts.length');
    const lastId = w.eval('songParts[songParts.length - 1].id');
    w.eval(`partsActiveId = ${lastId}; renderPartsScreen();`);
    w.document.getElementById('ptTrackDelete').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    check('удаление убрало дорожку', w.eval('songParts.length') === countBefore - 1,
      String(w.eval('songParts.length')));
    check('после удаления активность осталась на живой дорожке',
      w.eval('!!partActivePart()') === true &&
      w.eval('songParts.some((p) => p.id === partsActiveId)') === true,
      String(w.eval('partsActiveId')));
    check('карточек ровно столько же, сколько дорожек',
      w.document.querySelectorAll('#partsTracks .pt-track-chip').length === w.eval('songParts.length'));

    // ---------- 7. Включение и выключение дорожки ----------
    load([guitar, bass]);
    w.eval('togglePartsMode(true)');
    const G2 = pid(0);
    const B2 = pid(1);
    w.eval(`partsActiveId = ${B2}; renderPartsScreen();`);
    const visBox = w.document.getElementById('ptVisible');
    check('галка «видна» стоит у включённой дорожки', visBox.checked === true);
    visBox.checked = false;
    visBox.dispatchEvent(new w.Event('change', { bubbles: true }));
    check('выключенная дорожка исчезла из стопки',
      !row(B2) && w.document.querySelectorAll('#partsTrack .pt-row').length ===
        w.eval('songParts.filter(p => p.visible !== false).length'),
      String(w.document.querySelectorAll('#partsTrack .pt-row').length));
    check('карточка помечена «выкл»',
      chip(B2).querySelector('.pt-track-kind').textContent.includes('выкл'),
      chip(B2).querySelector('.pt-track-kind').textContent);
    check('активность ушла к включённой дорожке', w.eval('partsActiveId') === G2, String(w.eval('partsActiveId')));
    check('панель обновила галку', w.document.getElementById('ptVisible').checked === true);

    chip(B2).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    check('клик по выключенной карточке возвращает дорожку на экран',
      w.eval('partsActiveId') === B2 && P(1, 'visible') === true && !!row(B2));

    w.eval('songParts.forEach((p) => { p.visible = false; }); renderPartsScreen();');
    check('все выключены: пустое состояние вместо пустого экрана',
      w.document.getElementById('partsEmpty').hidden === false);
    check('кнопка «Включить дорожку» доступна', w.document.getElementById('ptEnableTrack').hidden === false);
    check('текст объясняет, что все дорожки выключены',
      w.document.getElementById('partsEmptyText').textContent.includes('выключены'),
      w.document.getElementById('partsEmptyText').textContent);
    check('станков нет, пока все выключены',
      w.document.querySelectorAll('#partsTrack .pt-row').length === 0);
    w.document.getElementById('ptEnableTrack').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    check('кнопка включила дорожку и вернула станки',
      w.document.getElementById('partsEmpty').hidden === true &&
      w.document.querySelectorAll('#partsTrack .pt-row').length === 1,
      JSON.stringify({ empty: w.document.getElementById('partsEmpty').hidden,
        rows: w.document.querySelectorAll('#partsTrack .pt-row').length }));

    // ---------- 8. Смена инструмента: confirm и обрезка нот ----------
    load([{
      id: 1, name: 'Соло', instrument: 'guitar', tuning: null, visible: true,
      rolls: { '1': [{ start: 0, dur: 1, string: 5, fret: 7 }, { start: 1, dur: 1, string: 2, fret: 5 }] },
    }]);
    w.eval('togglePartsMode(true)');
    const G3 = pid(0);
    let asked = null;
    w.confirm = (msg) => { asked = msg; return false; };
    const instSel = w.document.getElementById('ptInstrument');
    instSel.value = 'bass';
    instSel.dispatchEvent(new w.Event('change', { bubbles: true }));
    check('при сужении спросили с числом нот', !!asked && asked.includes('1 нот'), String(asked));
    check('отказ оставил инструмент и ноты',
      P(0, 'instrument') === 'guitar' && roll(0).length === 2, w.eval('JSON.stringify(songParts[0])'));
    check('панель вернулась к гитаре после отказа',
      w.document.getElementById('ptInstrument').value === 'guitar',
      w.document.getElementById('ptInstrument').value);
    w.confirm = () => true;
    instSel.value = 'bass';
    instSel.dispatchEvent(new w.Event('change', { bubbles: true }));
    check('согласие сменило инструмент на бас', P(0, 'instrument') === 'bass');
    check('недостижимая нота убрана, играемая осталась',
      roll(0).length === 1 && roll(0)[0].string === 2, JSON.stringify(roll(0)));
    check('у баса 4 струны', w.eval('partStringCount(songParts[0])') === 4);
    check('список строёв пересобран под бас',
      w.document.getElementById('ptTuning').querySelector('option').textContent.includes('октавой ниже') &&
      Array.from(w.document.getElementById('ptTuning').options).every(
        (o) => !['E Standard', 'Drop D', 'DADGAD'].includes(o.textContent)),
      JSON.stringify(Array.from(w.document.getElementById('ptTuning').options).map((o) => o.textContent)));
    // 12.6.1 может добавить стану запас вокруг линеек под знаки приёмов:
    // тогда viewBox начинается выше нуля, и высота стана = y + height.
    const bassSvgEl = row(G3).querySelector('.pt-svg');
    const bassBox = bassSvgEl.getAttribute('viewBox').split(' ').map(Number);
    check('станок баса — 4 струны',
      bassSvgEl.querySelectorAll('.pt-string').length === 4 && bassBox[3] + bassBox[1] === 10 * 2 + 9 * 3,
      bassSvgEl.getAttribute('viewBox'));
    check('нот на басовом станке одна', row(G3).querySelectorAll('.pt-note').length === 1);
    // Ноты в пределах баса: смена инструмента их не трогает.
    w.eval('songParts[0].tuning = "bass-std"');
    asked = null;
    w.confirm = (msg) => { asked = msg; return true; };
    w.eval('setPartTuning("bass-std")');
    check('повторный выбор того же строя ничего не спрашивает', asked === null, String(asked));

    // ---------- 9. Файл: инструмент и строй дорожки ----------
    w.saveCurrentSong();
    const lib = JSON.parse(w.localStorage.getItem('struchord_songs'));
    const savedIndex = lib.findIndex((s) => s.parts && s.parts[0] && s.parts[0].instrument === 'bass');
    check('сохранённая запись несёт бас', savedIndex >= 0,
      JSON.stringify(lib.map((s) => s.parts && s.parts[0] && s.parts[0].instrument)));
    check('в файле есть инструмент и строй дорожки',
      savedIndex >= 0 && lib[savedIndex].parts[0].instrument === 'bass' &&
      lib[savedIndex].parts[0].tuning === 'bass-std',
      savedIndex >= 0 ? JSON.stringify(lib[savedIndex].parts[0]) : '—');
    w.loadSong(savedIndex);
    w.eval('render()');
    check('после перезагрузки бас остался басом', P(0, 'instrument') === 'bass', String(P(0, 'instrument')));
    check('строй баса пережил файл', P(0, 'tuning') === 'bass-std', String(P(0, 'tuning')));
    check('ноты дорожки пережили файл', roll(0).length === 1 && roll(0)[0].string === 2, JSON.stringify(roll(0)));

    // ---------- 10. История: операции дорожек откатываются ----------
    load([guitar, bass]);
    w.eval('resetHistory()');
    w.eval('togglePartsMode(true)');
    const G4 = pid(0);
    w.eval(`partsActiveId = ${G4}; renderPartsScreen();`);
    w.document.getElementById('ptTrackClone').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    check('клон добавил третью дорожку', w.eval('songParts.length') === 3, String(w.eval('songParts.length')));
    w.undoEdit();
    w.eval('render()');
    check('Ctrl+Z убрал клон',
      w.eval('songParts.length') === 2 && w.document.querySelectorAll('#partsTracks .pt-track-chip').length === 2,
      JSON.stringify({ parts: w.eval('songParts.length'),
        chips: w.document.querySelectorAll('#partsTracks .pt-track-chip').length }));
    w.redoEdit();
    w.eval('render()');
    check('Ctrl+Y вернул клон',
      w.eval('songParts.length') === 3 && w.document.querySelectorAll('#partsTrack .pt-row').length === 3,
      JSON.stringify({ parts: w.eval('songParts.length'),
        rows: w.document.querySelectorAll('#partsTrack .pt-row').length }));
    check('отменённая/возвращённая дорожка не потеряла свои ноты',
      w.eval('songParts[1].rolls[String(sections[0].id)][0].fret') === 7,
      w.eval('JSON.stringify(songParts[1].rolls)'));

    // ---------- 11. Ввод идёт в активную дорожку ----------
    load([guitar, bass]);
    w.eval('resetHistory()');
    w.eval('togglePartsMode(true)');
    const G5 = pid(0);
    const B5 = pid(1);
    chip(B5).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    const guitarBefore = JSON.stringify(roll(0));
    const bassBefore = roll(1).length;
    key('3');
    check('цифра набрала ноту в активную (басовую) дорожку',
      roll(1).length === bassBefore + 1 &&
      roll(1).some((n) => n.fret === 3 && n.string === 3 && Math.abs(n.start) < 1e-9),
      JSON.stringify(roll(1)));
    check('соседняя дорожка не тронута', JSON.stringify(roll(0)) === guitarBefore,
      JSON.stringify(roll(0)));
    check('введённая нота легла на струну баса (0–3)',
      roll(1).every((n) => n.string <= 3), JSON.stringify(roll(1)));

    // ---------- 12. Мусор в файле ----------
    w.localStorage.setItem('struchord_songs', JSON.stringify([song([
      {
        id: 1, name: 'X', instrument: 'theremin', tuning: 'bass-std', visible: true,
        rolls: { '1': [{ start: 0, dur: 1, string: 5, fret: 3 }, { start: 1, dur: 1, string: 7, fret: 3 }] },
      },
      {
        id: 2, name: 'Y', instrument: 'bass', tuning: 'drop-d', visible: true,
        rolls: { '1': [{ start: 0, dur: 1, string: 5, fret: 3 }, { start: 1, dur: 1, string: 3, fret: 5 }] },
      },
    ])]));
    w.loadSong(0);
    w.eval('render()');
    check('чужой инструмент → гитара, чужой строй → «как в песне»',
      P(0, 'instrument') === 'guitar' && P(0, 'tuning') === null,
      JSON.stringify([P(0, 'instrument'), P(0, 'tuning')]));
    check('нота на несуществующей струне гитары отброшена', roll(0).length === 1, JSON.stringify(roll(0)));
    check('гитарный строй у баса сброшен, нота с 5-й струной отброшена',
      P(1, 'tuning') === null && roll(1).length === 1 && roll(1)[0].string === 3,
      JSON.stringify([P(1, 'tuning'), roll(1)]));
    check('бас остался четырёхструнным', w.eval('partStringCount(songParts[1])') === 4 && P(1, 'instrument') === 'bass');

    // ---------- 13. Нет дорожек: панель скрыта, подсказка про переключение ----------
    load([]);
    w.eval('togglePartsMode(true)');
    check('без дорожек панель активной дорожки скрыта',
      w.document.getElementById('partsTrackBar').hidden === true);
    check('без дорожек пустое состояние предлагает создать партию',
      w.document.getElementById('partsEmpty').hidden === false &&
      w.document.getElementById('ptCreatePart').hidden === false);
    check('подсказка палитры знает про Ctrl+↑/↓',
      w.document.querySelector('.pt-pal-hint').textContent.includes('Ctrl+'));
    w.document.getElementById('ptCreatePart').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    // createPartFromEmptyState правит модель через Store, а окно
    // перерисовывается в следующем кадре (в jsdom rAF не тикает сам).
    w.eval('render()');
    check('после создания партии панель вернулась',
      w.document.getElementById('partsTrackBar').hidden === false && w.eval('songParts.length') === 1,
      JSON.stringify({ hidden: w.document.getElementById('partsTrackBar').hidden,
        parts: w.eval('songParts.length') }));

    console.log(`\nитого: ${pass} ok, ${fail} FAIL`);
    if (fail) process.exitCode = 1;
  } catch (e) {
    console.error('ОШИБКА:', e && e.stack ? e.stack : e);
    process.exitCode = 1;
  }
});
