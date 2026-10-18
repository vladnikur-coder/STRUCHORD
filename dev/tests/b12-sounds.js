#!/usr/bin/env node
/*
 * b12-sounds.js — B-12.5.3 «Звучания и автоматизации тембра».
 *
 * Проверяем:
 *  1. Пресеты тембра: у гитары пять (акустика, чистый, перегруз, соло,
 *     эмбиент), у баса четыре (без «соло»), неизвестное имя — акустика;
 *  2. Правило точек: переключение действует ДО следующего, даже если оно
 *     было в прошлой секции (как Sound Automation в GP), точки из будущего
 *     не влияют;
 *  3. Голос: пресет меняет громкость, яркость, сустейн и долю корпуса, а
 *     перегруз добавляет волновой шейпер и фильтр кабинета;
 *  4. Модель и файл: звучание канала и список переключений уезжают в песню и
 *     читаются назад; значение по умолчанию и пустой список не пишутся;
 *     мусор (чужое звучание, точка вне секции) отбрасывается;
 *  5. UI: выбор звучания в карточке канала, кнопка «A» и окно со списком,
 *     постановка точки в позиции курсора, удаление и «убрать все» — каждая
 *     правка одной командой Store;
 *  6. Знаки: подпись над станом в нужной доле, пометка в ячейке ленты у
 *     аккомпанемента;
 *  7. Отмену: и смена звучания, и точка откатываются одним Ctrl+Z.
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

const notes = [
  { start: 0, dur: 1, string: 5, fret: 7 },
  { start: 1, dur: 1, string: 5, fret: 5 },
  { start: 2, dur: 1, string: 4, fret: 3 },
  { start: 3, dur: 1, string: 4, fret: 2 },
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
const guitar = { id: 1, name: 'Соло', instrument: 'guitar', tuning: null, visible: true, rolls: { '11': notes, '12': notes } };
const bass = { id: 2, name: 'Бас', instrument: 'bass', tuning: null, visible: true, rolls: { '11': [], '12': [] } };

w.addEventListener('load', async () => {
  try {
    const settle = () => new Promise((resolve) => setTimeout(resolve, 460));
    const load = (parts, extra) => {
      w.localStorage.setItem('struchord_songs', JSON.stringify([song(parts, extra)]));
      w.loadSong(0);
      w.eval('render()');
      w.confirm = () => true;
    };
    const chId = (index) => `part:${w.eval(`songParts[${index}].id`)}`;
    const card = (id) => w.document.querySelector(`#mixChannels [data-ch="${id}"]`);
    const act = (id, action) => card(id).querySelector(`[data-act="${action}"]`);
    const clickAct = (id, action) =>
      act(id, action).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    const selectSound = (id, value) => {
      const select = act(id, 'sound');
      select.value = value;
      select.dispatchEvent(new w.Event('change', { bubbles: true }));
    };
    const partOf = (index) => JSON.parse(w.eval(`JSON.stringify(songParts[${index}])`));
    const sectionIds = () => JSON.parse(w.eval('JSON.stringify(sections.map((s) => s.id))'));
    const marks = () =>
      Array.from(w.document.querySelectorAll('#partsTrack .pt-sound-mark')).map((el) => ({
        text: el.textContent, x: Number(el.getAttribute('x')),
      }));
    const ribbonMarks = () =>
      Array.from(w.document.querySelectorAll('.sound-mark')).map((el) => el.textContent.trim());

    // ================= 1. Таблица пресетов =================
    check('у гитары пять звучаний: акустика, чистый, перегруз, соло, эмбиент',
      eqJson(JSON.parse(w.eval('JSON.stringify(PART_SOUNDS.guitar.map((p) => p.id))')),
        ['acoustic', 'clean', 'drive', 'lead', 'ambient']));
    check('у баса четыре — «соло» басу не выдумываем',
      eqJson(JSON.parse(w.eval('JSON.stringify(PART_SOUNDS.bass.map((p) => p.id))')),
        ['acoustic', 'clean', 'drive', 'ambient']));
    check('неизвестное имя звучания — это акустика (значение по умолчанию)',
      w.eval('soundPresetById("терменвокс", "guitar").id') === 'acoustic' &&
      w.eval('soundLabel("drive", "guitar")') === 'Перегруз' &&
      w.eval('soundIdValid("lead", "bass")') === false);
    const curve = JSON.parse(w.eval('JSON.stringify(Array.from(soundDriveCurve(1)))'));
    check('кривая перегруза: 1024 точки, края ±1, середина почти линейна',
      curve.length === 1024 && Math.abs(curve[0] + 1) < 1e-6 && Math.abs(curve[1023] - 1) < 1e-6 &&
      Math.abs(curve[512]) < 0.02 && Math.abs(curve[256] + curve[768]) < 1e-3 &&
      curve[256] < curve[512] && curve[512] < curve[768]);

    // ================= 2. Правило точек =================
    load([guitar, bass]);
    const ids = sectionIds();
    w.eval(`songSoundAuto = [
      { sec: ${ids[0]}, unit: 0, sound: 'clean' },
      { sec: ${ids[0]}, unit: 2, sound: 'drive' },
      { sec: ${ids[1]}, unit: 1, sound: 'ambient' }
    ];`);
    check('точка действует со своей доли и до следующей',
      w.eval(`songSoundAt(${ids[0]}, 0)`) === 'clean' &&
      w.eval(`songSoundAt(${ids[0]}, 1.5)`) === 'clean' &&
      w.eval(`songSoundAt(${ids[0]}, 2)`) === 'drive' &&
      w.eval(`songSoundAt(${ids[0]}, 3.9)`) === 'drive',
      w.eval(`JSON.stringify([songSoundAt(${ids[0]}, 1.5), songSoundAt(${ids[0]}, 2)])`));
    check('переключение из прошлой секции слышно в следующей (как в GP)',
      w.eval(`songSoundAt(${ids[1]}, 0)`) === 'drive',
      w.eval(`songSoundAt(${ids[1]}, 0)`));
    check('точка из будущего не влияет на текущую позицию',
      w.eval(`songSoundAt(${ids[0]}, 0)`) === 'clean' &&
      w.eval(`songSoundAt(${ids[1]}, 0.5)`) === 'drive');
    check('без точек звучит исходное звучание канала',
      w.eval('songSoundAuto = []; songSoundAt(' + ids[0] + ', 3)') === 'acoustic');
    w.eval(`songSoundAuto = [{ sec: ${ids[0]}, unit: 2, sound: 'drive' }];`);

    // ================= 3. Голос: пресет =================
    const fakeCtx = () => {
      const param = (v) => ({
        value: v, setValueAtTime() {}, linearRampToValueAtTime() {},
        exponentialRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {},
      });
      const made = [];
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
        if (kind === 'shaper') node.curve = null;
        made.push(node);
        return node;
      };
      return {
        made, currentTime: 0, sampleRate: 44100, state: 'running',
        destination: mk('destination'),
        createGain: () => mk('gain'),
        createStereoPanner: () => mk('panner'),
        createConvolver: () => mk('convolver'),
        createBiquadFilter: () => mk('filter'),
        createWaveShaper: () => mk('shaper'),
        createBufferSource: () => mk('source'),
        createBuffer: (ch, len) => ({ getChannelData: () => new Float32Array(len) }),
        resume() {}, close() { return Promise.resolve(); },
      };
    };
    // Буфер щипка не синтезируем: нам нужны аргументы, с которыми его просят.
    w.eval('__pluckCalls = []; getPluckBuffer = function (ctx, freq, duration, brightness) { __pluckCalls.push({ freq, duration, brightness }); return { length: 1 }; };');
    w.eval('mixerChannels = new Map(); guitarMasterGain = null; guitarMasterPanner = null; masterFilters = [];');
    const ctxClean = fakeCtx();
    w.__ctxClean = ctxClean;
    w.eval('pluckString(__ctxClean, { freq: 110, startTime: 0, duration: 1, gain: 0.4, pan: 0, brightness: 0.45, sound: "acoustic", instrument: "guitar" });');
    const acousticCall = JSON.parse(w.eval('JSON.stringify(__pluckCalls.pop())'));
    check('акустика: голос щиплется как раньше — громкость, яркость и звон без множителя',
      Math.abs(acousticCall.freq - 110) < 1e-9 &&
      Math.abs(acousticCall.duration - 1.4) < 1e-9 &&
      Math.abs(acousticCall.brightness - 0.45) < 1e-9, JSON.stringify(acousticCall));
    check('акустика: ни шейпера, ни кабинета, а в корпус уходит полная доля',
      ctxClean.made.filter((n) => n.kind === 'shaper').length === 0 &&
      ctxClean.made.filter((n) => n.kind === 'filter').length === 7 && // 1 тон + 3 EQ канала + 3 EQ мастера
      w.eval('mixerChannels.get("song").convolver.connections.length') >= 1);
    const ctxDrive = fakeCtx();
    w.__ctxDrive = ctxDrive;
    w.eval('pluckString(__ctxDrive, { freq: 110, startTime: 0, duration: 1, gain: 0.4, pan: 0, brightness: 0.45, sound: "drive", instrument: "guitar" });');
    const driveCall = JSON.parse(w.eval('JSON.stringify(__pluckCalls.pop())'));
    check('перегруз: тише, ярче и с более долгим звоном (сустейн)',
      Math.abs(driveCall.duration - 1.8) < 1e-6 &&
      Math.abs(driveCall.brightness - 0.55) < 1e-6 &&
      driveCall.duration > acousticCall.duration && driveCall.brightness > acousticCall.brightness,
      JSON.stringify(driveCall));
    check('перегруз: появились волновой шейпер и фильтр кабинета',
      ctxDrive.made.filter((n) => n.kind === 'shaper').length === 1 &&
      ctxDrive.made.filter((n) => n.kind === 'filter').length === 2,
      JSON.stringify(ctxDrive.made.map((n) => n.kind)));
    check('перегруз: трим возвращает громкость, а в корпус уходит меньшая доля',
      ctxDrive.made.some((n) => n.kind === 'gain' && Math.abs(n.gain.value - 1 / (1 + 0.9 * 0.45)) < 1e-6) &&
      ctxDrive.made.some((n) => n.kind === 'gain' && Math.abs(n.gain.value - 0.45) < 1e-6),
      JSON.stringify(ctxDrive.made.filter((n) => n.kind === 'gain').map((n) => n.gain.value)));
    const ctxAmbient = fakeCtx();
    w.__ctxAmbient = ctxAmbient;
    w.eval('pluckString(__ctxAmbient, { freq: 110, startTime: 0, duration: 1, gain: 0.4, pan: 0, brightness: 0.45, sound: "ambient", instrument: "guitar" });');
    check('эмбиент: глуше по яркости, дольше по звону и с большой долей корпуса',
      ctxAmbient.made.some((n) => n.kind === 'gain' && Math.abs(n.gain.value - 3.2) < 1e-6) &&
      JSON.parse(w.eval('JSON.stringify(__pluckCalls.pop())')).duration > 2.3);
    check('голос без явного звучания берёт текущее звучание канала «Песня»',
      w.eval('songSoundNow = "drive"; (function(){ const c = __ctxDrive; c.made.length = 0; pluckString(c, { freq: 110, startTime: 0, duration: 1, gain: 0.4, pan: 0, brightness: 0.45 }); return c.made.filter((n) => n.kind === "shaper").length; })()') === 1);
    w.eval('songSoundNow = "acoustic"; mixerChannels = new Map(); guitarMasterGain = null; guitarMasterPanner = null; masterFilters = [];');

    // ================= 4. Модель, файл, мусор =================
    load([guitar, bass]);
    w.eval('togglePartsMode(true)');
    w.eval("setPartsScoreEngine('native')"); // тест родной ленты: вид «Обычный»
    selectSound(chId(0), 'drive');
    check('выбор звучания в карточке дорожки уезжает в модель',
      partOf(0).sound === 'drive' && w.eval('soundChannelValue("' + chId(0) + '")') === 'drive',
      JSON.stringify(partOf(0).sound));
    selectSound('song', 'ambient');
    check('звучание аккомпанемента живёт в канале «Песня»',
      w.eval('songSoundId()') === 'ambient' && w.eval('soundChannelValue("song")') === 'ambient');
    check('на карточке мастера нет ни звучания, ни автоматизаций',
      !act('master', 'sound') && !act('master', 'soundAuto'));
    check('у дорожки-баса свой список звучаний — без «соло», но с перегрузом',
      eqJson(Array.from(act(chId(1), 'sound').options).map((o) => o.value),
        ['acoustic', 'clean', 'drive', 'ambient']),
      JSON.stringify(Array.from(act(chId(1), 'sound').options).map((o) => o.value)));

    // Точки ставим в позиции курсора: 2-я доля первой секции.
    const ids4 = sectionIds();
    w.eval(`setPartsCursorString(${ids4[0]}, 0, 5, 2)`);
    clickAct(chId(0), 'soundAuto');
    check('кнопка «A» открывает окно переключений звучания',
      w.document.getElementById('partsSounds').hidden === false);
    check('окно без переключений объясняет, что канал звучит одним тембром',
      w.document.getElementById('ptSoundList').textContent.indexOf('Переключений нет') !== -1,
      w.document.getElementById('ptSoundList').textContent);
    w.document.getElementById('ptSoundAdd').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    check('«Поставить здесь» ставит точку ровно в позиции курсора',
      eqJson(partOf(0).soundAuto, [{ sec: ids4[0], unit: 2, sound: 'drive' }]),
      JSON.stringify(partOf(0).soundAuto));
    check('строка списка называет секцию, такт, долю и звучание',
      /Куплет · такт 1, доля 3 — перегруз/.test(w.document.getElementById('ptSoundList').textContent),
      w.document.getElementById('ptSoundList').textContent);
    check('точка видна подписью над станом в своей доле',
      eqJson(marks(), [{ text: 'звук: перегруз', x: 2 * 24 + 2 }]), JSON.stringify(marks()));
    check('подпись появилась только в той секции, где стоит точка',
      marks().length === 1 && w.document.querySelectorAll('#partsTrack .pt-sound-mark').length === 1);
    check('подпись звучания подняла стан: у стана с точкой запас сверху больше',
      Number(w.document.querySelector('#partsTrack .pt-svg').getAttribute('viewBox').split(' ')[1]) < 0);
    // Вторая точка в припеве.
    w.eval(`setPartsCursorString(${sectionIds()[1]}, 0, 5, 0)`);
    selectSound(chId(0), 'clean');
    w.document.getElementById('ptSoundAdd').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    check('вторая точка встаёт в своей секции и с другим звучанием',
      partOf(0).soundAuto.length === 2 &&
      partOf(0).soundAuto[1].sec === sectionIds()[1] && partOf(0).soundAuto[1].sound === 'clean',
      JSON.stringify(partOf(0).soundAuto));
    check('в списке две строки — по одной на переключение',
      w.document.querySelectorAll('#ptSoundList .pt-sound-row').length === 2);
    // Удаление одной точки.
    w.document
      .querySelectorAll('#ptSoundList .pt-sound-del')[0]
      .dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    check('крестик убирает только свою точку',
      partOf(0).soundAuto.length === 1 && partOf(0).soundAuto[0].sec === sectionIds()[1],
      JSON.stringify(partOf(0).soundAuto));
    check('удалённая точка убирает и подпись',
      marks().length === 1 && marks()[0].text === 'звук: чистый', JSON.stringify(marks()));
    // Файл и чтение назад: возвращаем дорожку на перегруз — тогда видно, что
    // исходное звучание канала и точка в припеве живут отдельно.
    selectSound(chId(0), 'drive');
    w.saveCurrentSong();
    const lib = JSON.parse(w.localStorage.getItem('struchord_songs'));
    const saved = lib[lib.length - 1];
    check('файл хранит звучание дорожки, песни и её точки',
      saved.parts[0].sound === 'drive' && saved.sound === 'ambient' &&
      eqJson(saved.parts[0].soundAuto, [{ sec: sectionIds()[1], unit: 0, sound: 'clean' }]),
      JSON.stringify([saved.parts[0].sound, saved.sound, saved.parts[0].soundAuto]));
    check('значение по умолчанию и пустой список в файл не пишутся',
      saved.parts[1].sound === undefined && saved.parts[1].soundAuto === undefined &&
      saved.soundAuto === undefined);
    w.loadSong(lib.length - 1);
    w.eval('render()');
    selectSoundSilent();
    function selectSoundSilent() {}
    check('после перезагрузки песни звучания и точки на месте',
      w.eval('songSoundId()') === 'ambient' && w.eval('soundChannelValue("' + chId(0) + '")') === 'drive' &&
      JSON.stringify(partOf(0).soundAuto) === JSON.stringify([{ sec: sectionIds()[1], unit: 0, sound: 'clean' }]),
      JSON.stringify([w.eval('songSoundId()'), partOf(0)]));
    check('точка дорожки из прошлой секции слышна в следующей и после перезагрузки',
      w.eval(`partSoundAt(songParts[0], ${sectionIds()[0]}, 3)`) === 'drive' &&
      w.eval(`partSoundAt(songParts[0], ${sectionIds()[1]}, 0)`) === 'clean' &&
      w.eval(`partSoundAt(songParts[0], ${sectionIds()[1]}, 3)`) === 'clean');
    // Мусор в файле.
    load([guitar, bass], {
      sound: 'терменвокс',
      soundAuto: [{ sec: 11, unit: 1, sound: 'drive' }, { sec: 999, unit: 0, sound: 'drive' }, { sec: 11, unit: 99, sound: 'drive' }],
    });
    const dirty = JSON.parse(w.eval('JSON.stringify(songParts)'));
    check('мусорные точки песни отброшены: чужая секция и выход за её длину',
      JSON.parse(w.eval('JSON.stringify(songSoundAuto)')).length === 1 &&
      JSON.parse(w.eval('JSON.stringify(songSoundAuto)'))[0].unit === 1);
    check('неизвестное звучание песни не сохраняется — остаётся акустика',
      w.eval('songSoundId()') === 'acoustic' && dirty.length === 2);
    load([{ ...guitar, sound: 'терменвокс', soundAuto: [{ sec: 11, unit: 1, sound: 'выдумка' }, { sec: 11, unit: 0, sound: 'lead' }] }, bass]);
    check('у дорожки чужое звучание и чужая точка отброшены, своя осталась',
      partOf(0).sound === undefined && eqJson(partOf(0).soundAuto, [{ sec: sectionIds()[0], unit: 0, sound: 'lead' }]),
      JSON.stringify(partOf(0)));

    // ================= 5. Пометка в ленте у аккомпанемента =================
    load([guitar, bass], { sound: 'acoustic', soundAuto: [{ sec: 12, unit: 0, sound: 'drive' }] });
    w.eval('render()');
    check('переключение аккомпанемента помечено в своей ячейке ленты',
      eqJson(ribbonMarks(), ['♪ перегруз']), JSON.stringify(ribbonMarks()));
    load([guitar, bass], { soundAuto: [{ sec: 11, unit: 2, sound: 'drive' }] });
    w.eval('render()');
    check('точка внутри ячейки помечает именно эту ячейку',
      eqJson(ribbonMarks(), ['♪ перегруз']) && w.document.querySelectorAll('.sound-mark').length === 1);
    load([guitar, bass]);
    w.eval('render()');
    check('без точек лента чистая (лента 12.3 не меняется)', ribbonMarks().length === 0);

    // ================= 6. Планировщик: что звучит =================
    load([guitar, bass], { soundAuto: [{ sec: 11, unit: 0, sound: 'lead' }, { sec: 12, unit: 0, sound: 'ambient' }] });
    w.eval('__seen = []; __realStrum = strumChord; strumChord = function () { __seen.push(songSoundNow); }; getAudioContext = function () { return {}; };');
    w.eval(`playChordScheduled('C', 0, 1, { secId: ${sectionIds()[0]}, squareId: 21, eventIndex: 0, key: 'C' });`);
    w.eval(`playChordScheduled('G', 0, 1, { secId: ${sectionIds()[1]}, squareId: 22, eventIndex: 0, key: 'C' });`);
    check('аккомпанемент берёт звучание своей позиции в песне',
      eqJson(JSON.parse(w.eval('JSON.stringify(__seen)')), ['lead', 'ambient']),
      w.eval('JSON.stringify(__seen)'));
    w.eval('strumChord = __realStrum;');

    // Дорожки: звучание ноты берётся из точек дорожки.
    load([guitar, bass]);
    w.eval(`songParts[0].soundAuto = [{ sec: ${sectionIds()[0]}, unit: 1, sound: 'drive' }];`);
    w.eval('__plucks = []; __realPluck = pluckString; pluckString = function (ctx, opts) { __plucks.push({ sound: opts.sound, instrument: opts.instrument }); };');
    w.eval(`schedulePartsForEvent({}, sections[0], sections[0].squares[0], 0, 0, 4);`);
    check('ноты дорожки играют своим звучанием по времени ноты',
      eqJson(JSON.parse(w.eval('JSON.stringify(__plucks)')).map((p) => p.sound),
        ['acoustic', 'drive', 'drive', 'drive']) &&
      JSON.parse(w.eval('JSON.stringify(__plucks)'))[0].instrument === 'guitar',
      w.eval('JSON.stringify(__plucks)'));
    w.eval('pluckString = __realPluck;');

    // ================= 7. Окно и отмена =================
    load([guitar, bass]);
    w.eval('togglePartsMode(true)');
    w.eval("setPartsScoreEngine('native')"); // тест родной ленты: вид «Обычный»
    clickAct(chId(0), 'soundAuto');
    const before = JSON.stringify(partOf(0));
    clickAct(chId(0), 'soundAuto'); // окно уже открыто — повторное нажатие ничего не меняет
    check('открытие окна — не правка песни: модель не изменилась',
      JSON.stringify(partOf(0)) === before && w.eval('songStore.canUndo ? songStore.canUndo() : true') !== false);
    w.document.getElementById('ptSoundClear').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    check('«Убрать все» на пустом списке — не правка (и не ошибка)',
      JSON.stringify(partOf(0)) === before);
    w.eval(`setPartsCursorString(${sectionIds()[0]}, 0, 5, 0)`);
    w.document.getElementById('ptSoundAdd').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await settle();
    w.undoEdit();
    await new Promise((resolve) => setTimeout(resolve, 10));
    check('постановка точки отменяется одним Ctrl+Z',
      !partOf(0).soundAuto || partOf(0).soundAuto.length === 0, JSON.stringify(partOf(0).soundAuto));
    selectSound(chId(0), 'drive');
    await settle();
    w.undoEdit();
    await new Promise((resolve) => setTimeout(resolve, 10));
    check('смена звучания отменяется одним Ctrl+Z',
      partOf(0).sound === undefined && w.eval('soundChannelValue("' + chId(0) + '")') === 'acoustic',
      JSON.stringify(partOf(0).sound));
    // Окно закрывается вместе с окном партий.
    clickAct(chId(0), 'soundAuto');
    w.eval('togglePartsMode(false)');
    check('уход из окна партий закрывает окно звучаний',
      w.document.getElementById('partsSounds').hidden === true &&
      w.document.getElementById('partsBend').hidden === true);

    console.log(`\nитого: ${pass} ok, ${fail} FAIL`);
    process.exit(fail ? 1 : 0);
  } catch (e) {
    console.error('ОШИБКА в сьюте:', e && e.stack ? e.stack : e);
    process.exit(1);
  }
});
