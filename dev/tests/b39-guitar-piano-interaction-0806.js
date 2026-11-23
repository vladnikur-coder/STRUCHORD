#!/usr/bin/env node
'use strict';

// 0.806 · B-39: комплексное исправление взаимодействия гитарных и клавишных дорожек:
// 1. Транспонирование песни, смена тональности и секционная модуляция на ВСЕХ дорожках
//    (вторичные аккорды, exactNotes, 'v:<chord>', ручные ноты patterns, формы вторичных гитар).
// 2. Ручной ввод аккорда на вторичной дорожке (подтверждение призрака, совпадение с главной,
//    очистка поверх пустой главной, syncEventChordDom без затирания ev.chord).
// 3. Сохранение track.saturation при загрузке файла и Undo/Redo.
// 4. Независимый autoAccomp на каждой клавишной дорожке (миграция старого файла).
// 5. Очистка несовместимых полей при setInstrument и загрузке старых файлов (clean_on_switch),
//    закрытие несовместимых модалок при смене инструмента.
// 6. Обновление #pinnedFingering и #fingering-tooltip при add/remove/instrument/reorder дорожек.
// 7. Перенос записанных ev.notes вместе с гитарной дорожкой при reorderTracks + снятие плашки
//    «♪ ноты» и разблокировка «Ввести по клавишам» на неглавной/клавишной дорожке.
// 8. Изоляция гитарных элементов в b39-keys-mode (CSS, пропуск getFingeringVariants, отказ от
//    тултипа на .b39-ghost, линейка ruler_only в #timelineRhythm без стрелок/струн гитары).
// 9. Обновление timelinePassHint при игре вторичной гитары на повторных проходах Ленты.
// 10-11. Копирование строя + аппликатур при addTrack('guitar') и полного набора настроек/обращений
//        при addTrack('keys') (copy_full).

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const rawHtml = fs.readFileSync(path.join(ROOT, 'STRUCHORD.html'), 'utf8');
const kbAudio = fs.readFileSync(path.join(ROOT, 'keyboard-audio.js'), 'utf8');
const kbAccomp = fs.readFileSync(path.join(ROOT, 'keyboard-accompaniment.js'), 'utf8');

const bundledHtml = rawHtml
  .replace('<script src="./keyboard-audio.js"></script>', () => `<script>${kbAudio}</script>`)
  .replace('<script src="./keyboard-accompaniment.js"></script>', () => `<script>${kbAccomp}</script>`);

let pass = 0;
function ok(name) {
  pass++;
  console.log('ok   ' + name);
}

const dom = new JSDOM(bundledHtml, {
  url: 'http://127.0.0.1:8080/STRUCHORD.html',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  beforeParse(win) {
    win.localStorage.setItem('struchord-default-instrument', 'guitar');
    win.matchMedia = () => ({
      matches: false,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
    });
    win.HTMLCanvasElement.prototype.getContext = () => ({
      font: '',
      measureText: (t) => ({ width: String(t || '').length * 8 }),
      clearRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {},
      moveTo() {}, lineTo() {}, closePath() {}, save() {}, restore() {},
      translate() {}, rotate() {}, fillText() {}, strokeText() {}, setTransform() {}, scale() {},
      createLinearGradient: () => ({ addColorStop() {} }),
    });
    const nodeStub = () => ({
      buffer: null,
      type: 'lowpass',
      gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} },
      pan: { value: 0, setValueAtTime() {} },
      playbackRate: { value: 1, setValueAtTime() {} },
      frequency: { value: 1000, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
      Q: { value: 1, setValueAtTime() {} },
      threshold: { value: -12 }, knee: { value: 10 }, ratio: { value: 4 }, attack: { value: 0.003 }, release: { value: 0.25 },
      connect() { return this; }, disconnect() {}, start() {}, stop() {},
    });
    win.AudioContext = win.webkitAudioContext = function () {
      this.currentTime = 10;
      this.state = 'running';
      this.sampleRate = 44100;
      this.destination = nodeStub();
      this.resume = () => Promise.resolve();
      this.createGain = nodeStub;
      this.createConvolver = nodeStub;
      this.createStereoPanner = nodeStub;
      this.createBiquadFilter = nodeStub;
      this.createOscillator = nodeStub;
      this.createDynamicsCompressor = nodeStub;
      this.createBufferSource = nodeStub;
      this.createBuffer = (_ch, len) => ({ getChannelData: () => new Float32Array(len) });
    };
  },
});
const w = dom.window;
const doc = w.document;
w.confirm = () => true;
w.HTMLElement.prototype.scrollIntoView = function () {};
const j = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

(async () => {
  await new Promise((r) => setTimeout(r, 80));
  const T = w.StruChordTracks;

  // --- 1. Транспонирование и модуляция секции на ВСЕХ дорожках ---
  w.eval(`startNewSongFromHome(); globalKey = 'C'; keyMode = 'manual'; addSection('Verse'); addSection('Chorus');`);
  {
    const s0 = w.eval(`sections[0]`), s1 = w.eval(`sections[1]`);
    s0.squares[0].events[0].chord = 'C';
    s0.squares[0].events[0].fingering = 'x,3,2,0,1,0';
    s1.squares[0].events[0].chord = 'F';
    const c0 = T.cellKey(s0, s0.squares[0], 0);
    const c1 = T.cellKey(s1, s1.squares[0], 0);

    const kId = T.addTrack('keys');
    T.setTrackChord(kId, c0, 'Am7');
    T.setTrackChord(kId, c1, 'Dm7');
    T.setExactNotes(kId, c0, 'Am7', [57, 60, 64, 67]);
    T.setVoicingForChord(kId, 'Dm7', 2);
    T.setPattern(kId, c1, {
      type: 'experimental-notes-v1',
      beats: 4,
      status: 'manual',
      notes: [{ midi: 62, beat: 0, duration: 1, velocity: 80, hand: 'right' }],
    });

    T.setActive(1);
    const g2Id = T.addTrack('guitar');
    T.setTrackChord(g2Id, c0, 'F');
    T.setGuitarShape(g2Id, c0, 'F', [1, 3, 3, 2, 1, 1], [1], null);

    w.eval(`transposeAllGlobal(2);`); // C -> D (+2 полутона)
    assert.strictEqual(T.trackChord(kId, c0), 'Bm7', 'аккорд клавишной дорожки транспонирован Am7 -> Bm7');
    assert.deepStrictEqual(j(T.exactNotes(kId, c0, 'Bm7')), [59, 62, 66, 69], 'exactNotes сдвинуты на +2');
    assert.strictEqual(T.voicingForChord(kId, 'Em7'), 2, 'обращение v:Dm7 переехало в v:Em7');
    assert.strictEqual(T.voicingForChord(kId, 'Dm7'), null, 'старый ключ v:Dm7 удалён');
    assert.strictEqual(T.patternFor(kId, c1).notes[0].midi, 64, 'ручная нота в patterns сдвинута 62 -> 64');
    assert.strictEqual(T.trackChord(g2Id, c0), 'G', 'аккорд второй гитары транспонирован F -> G');
    assert.deepStrictEqual(j(T.guitarShape(g2Id, c0, 'G').shape), [3, 5, 5, 4, 3, 3], 'баррэ-форма второй гитары сдвинута на +2');
    assert.deepStrictEqual(j(T.guitarShape(g2Id, c0, 'G').barreOff), [3], 'barreOff второй гитары сдвинут на +2');

    // Модуляция только второй секции (+3 полутона: D -> F, стиль бемолей!)
    w.eval(`setSectionModulation(sections[1].id, 3);`);
    assert.strictEqual(T.trackChord(kId, c0), 'Bm7', 'первая секция не затронута модуляцией второй');
    assert.strictEqual(T.trackChord(kId, c1), 'Gm7', 'вторая секция на клавишах модулирована Em7 -> Gm7');
    assert.strictEqual(T.patternFor(kId, c1).notes[0].midi, 67, 'ручная нота во второй секции сдвинута 64 -> 67');

    // Смена глобальной тональности с транспонированием (D -> E, +2 полутона на немодулированной секции)
    w.eval(`DOM.rootKey.value = 'E'; onKeyChange();`);
    doc.querySelector('.key-change-confirm-dialog .btn-transpose').click();
    await new Promise((r) => setTimeout(r, 20));
    assert.strictEqual(T.trackChord(kId, c0), 'C#m7', 'onKeyChange(transpose) транспонировал клавишную дорожку Bm7 -> C#m7');
    assert.deepStrictEqual(j(T.exactNotes(kId, c0, 'C#m7')), [61, 64, 68, 71], 'onKeyChange(transpose) сдвинул exactNotes');
    assert.strictEqual(T.trackChord(g2Id, c0), 'A', 'onKeyChange(transpose) транспонировал вторую гитару G -> A');
    assert.deepStrictEqual(j(T.guitarShape(g2Id, c0, 'A').shape), [5, 7, 7, 6, 5, 5], 'onKeyChange(transpose) сдвинул баррэ второй гитары');
    ok('1. Транспонирование песни, смена тональности и модуляция секции обновляют все дорожки, ноты и формы');
  }

  // --- 2. Ручной ввод аккорда на вторичной дорожке ---
  w.eval(`startNewSongFromHome(); addSection('Verse'); sections[0].squares[0].events[0].chord = 'C'; sections[0].squares[0].events[1].chord = ''; render();`);
  {
    const s0 = w.eval(`sections[0]`), sq0 = s0.squares[0];
    const c0 = T.cellKey(s0, sq0, 0);
    const c1 = T.cellKey(s0, sq0, 1);
    const kId = T.addTrack('keys');
    // Изначально kId получила копию 'C' в c0; очистим её, чтобы сделать призрак 'C'
    T.setTrackChord(kId, c0, '');
    w.eval(`render();`);
    assert.strictEqual(T.trackChord(kId, c0), null, 'в c0 призрачный аккорд');
    assert.strictEqual(doc.querySelector('.chord-wrapper[data-ei="0"] .chord-display').classList.contains('b39-ghost'), true);

    // 2a: Подтверждение призрака вводом 'C'
    w.eval(`{
      const inp = document.querySelector('.chord-wrapper[data-ei="0"] .chord-input');
      activateManualInput(inp);
      inp.value = 'C';
      saveCurrentChord();
    }`);
    assert.strictEqual(T.trackChord(kId, c0), 'C', 'ручной ввод подтверждает призрачный аккорд C');
    assert.strictEqual(doc.querySelector('.chord-wrapper[data-ei="0"] .chord-display').classList.contains('b39-ghost'), false);

    // 2b: Смена собственного 'Am' обратно на 'C' (совпадающий с главной)
    T.setTrackChord(kId, c0, 'Am');
    w.eval(`render(); {
      const inp = document.querySelector('.chord-wrapper[data-ei="0"] .chord-input');
      activateManualInput(inp);
      inp.value = 'C';
      saveCurrentChord();
    }`);
    assert.strictEqual(T.trackChord(kId, c0), 'C', 'ввод аккорда, совпадающего с главной, сохраняется во вторичную дорожку');
    assert.strictEqual(doc.querySelector('.chord-wrapper[data-ei="0"] .chord-input').value, 'C');

    // 2c: Очистка собственного 'G' в c1, когда главная в c1 пуста
    T.setTrackChord(kId, c1, 'G');
    w.eval(`render(); {
      const inp = document.querySelector('.chord-wrapper[data-ei="1"] .chord-input');
      activateManualInput(inp);
      inp.value = '';
      saveCurrentChord();
    }`);
    assert.strictEqual(T.trackChord(kId, c1), null, 'очистка аккорда на вторичной дорожке при пустой главной работает');
    ok('2. Ручной ввод аккордов на вторичной дорожке (призрак, совпадение с главной, очистка)');
  }

  // --- 3. Сохранение track.saturation при загрузке и Undo/Redo ---
  {
    w.eval(`startNewSongFromHome(); addSection('Verse'); sections[0].squares[0].events[0].chord = 'C';`);
    const kId = T.addTrack('keys');
    w.eval(`captureHistorySnapshot();`);
    T.setSaturation(kId, 84);
    w.eval(`captureHistorySnapshot();`);
    T.setSaturation(kId, 22);
    w.eval(`captureHistorySnapshot();`);
    w.eval(`undoEdit();`);
    assert.strictEqual(T.track(kId).saturation, 84, 'Undo сохраняет saturation=84 (не сбрасывает в 50)');
    w.eval(`redoEdit();`);
    assert.strictEqual(T.track(kId).saturation, 22, 'Redo возвращает saturation=22');

    w.eval(`saveCurrentSong();`);
    const saved = JSON.parse(w.localStorage.getItem('struchord_songs'))[0];
    T.load(saved);
    assert.strictEqual(T.track(kId).saturation, 22, 'загрузка .struchord сохраняет saturation=22');
    ok('3. track.saturation сохраняется в .struchord и при Undo/Redo');
  }

  // --- 4. Независимый autoAccomp на нескольких клавишных дорожках ---
  {
    w.eval(`startNewSongFromHome(); addSection('Verse'); sections[0].squares[0].events[0].chord = 'C'; sections[0].squares[0].events[1].chord = 'G'; render();`);
    const k1 = T.addTrack('keys');
    T.setActive(k1);
    w.StruChordAuto.open();
    doc.getElementById('b39AutoPrimary').value = 'pop';
    doc.getElementById('b39AutoApply').click();

    const k2 = T.addTrack('keys');
    T.setActive(k2);
    assert.strictEqual(T.autoAccompFor(k2), null, 'у новой клавишной дорожки свой чистый autoAccomp');
    w.StruChordAuto.open();
    assert.strictEqual(doc.getElementById('b39AutoOff'), null, 'в окне Авто для k2 нет чужой кнопки Отключить авто');
    doc.getElementById('b39AutoPrimary').value = 'jazz';
    doc.getElementById('b39AutoApply').click();

    assert.strictEqual(T.autoAccompFor(k1).primary, 'pop', 'k1 сохранила свой жанр pop');
    assert.strictEqual(T.autoAccompFor(k2).primary, 'jazz', 'k2 получила свой жанр jazz');

    // Смена аккорда на k1 перестраивает ноты k1!
    const sec0 = w.eval(`sections[0]`), cell0 = T.cellKey(sec0, sec0.squares[0], 0);
    T.setTrackChord(k1, cell0, 'Fmaj7');
    assert.strictEqual(T.patternFor(k1, cell0).chord, 'Fmaj7', 'смена аккорда на k1 автоматически пересобрала ноты k1');
    assert.strictEqual(T.patternFor(k2, cell0).chord, 'C', 'ноты k2 остались на своём аккорде C');

    // Добавление новой секции обновляет ОБЕ клавишные дорожки!
    w.eval(`addSection('Chorus');`);
    const sec1 = w.eval(`sections[1]`);
    assert.ok(T.autoAccompFor(k1).managed[String(sec1.id)], 'новая секция подхвачена autoAccomp k1');
    assert.ok(T.autoAccompFor(k2).managed[String(sec1.id)], 'новая секция подхвачена autoAccomp k2');
    assert.ok(T.patternFor(k1, 's:' + sec1.id).type.includes('pop'), 'в новой секции k1 создан pop-паттерн');
    assert.ok(T.patternFor(k2, 's:' + sec1.id).type.includes('jazz'), 'в новой секции k2 создан jazz-паттерн');
    ok('4. Независимый autoAccomp работает одновременно на нескольких клавишных дорожках');
  }

  // --- 5. Очистка несовместимых полей при setInstrument и загрузке старого файла (Oasis) ---
  {
    w.eval(`startNewSongFromHome();`);
    assert.strictEqual(T.isDefault(), true, 'свежая гитарная песня в дефолтном состоянии');
    T.setInstrument(1, 'keys');
    T.setPattern(1, 's:1', { type: 'keys-block', subdivision: 1, steps: ['B'] });
    T.setVoicingForChord(1, 'C', 2);
    T.setSaturation(1, 80);
    T.setTimbre(1, 'epiano');
    T.setInstrument(1, 'guitar');
    const tr = T.track(1);
    assert.deepStrictEqual(j(tr.patterns), {}, 'patterns очищены при переключении keys -> guitar');
    assert.deepStrictEqual(j(tr.voicings), {}, 'voicings очищены при переключении keys -> guitar');
    assert.strictEqual(tr.timbre, undefined, 'timbre очищен');
    assert.strictEqual(tr.saturation, undefined, 'saturation очищен');
    assert.strictEqual(T.isDefault(), true, 'возврат единственной дорожки в Гитару восстанавливает isDefault() === true');

    // Проверка на реальном пользовательском файле uploads/Oasis - Don't Look Back in Anger.struchord
    const oasisPath = path.join(ROOT, "uploads/Oasis - Don't Look Back in Anger.struchord");
    if (fs.existsSync(oasisPath)) {
      const oasisRaw = JSON.parse(fs.readFileSync(oasisPath, 'utf8'));
      const sanitized = T.attach(oasisRaw, oasisRaw);
      for (const t of sanitized.tracks) {
        if (t.instrument === 'guitar') {
          assert.strictEqual(Object.keys(t.patterns || {}).length, 0, 'Oasis: старый клавишный мусор на гитарной дорожке очищен при загрузке');
          assert.strictEqual(Object.keys(t.voicings || {}).length, 0, 'Oasis: старые voicings на гитарной дорожке очищены');
        }
      }
    }
    ok('5. setInstrument и загрузка файлов очищают несовместимые поля старого инструмента (включая Oasis)');
  }

  // --- 6. #pinnedFingering и #fingering-tooltip при добавлении и смене инструмента ---
  {
    w.eval(`startNewSongFromHome(); addSection('Verse'); sections[0].squares[0].events[0].chord = 'C'; render();`);
    const wrap = doc.querySelector('.chord-wrapper[data-ei="0"]');
    w.showFingeringTooltip('C', wrap, false);
    w.pinFingeringFromTooltip();
    assert.ok(doc.querySelector('#pinnedFingering svg:not(.b39-keys-svg)'), 'в доке показан гриф гитары');

    const kId = T.addTrack('keys');
    await new Promise((r) => setTimeout(r, 160));
    assert.ok(doc.querySelector('#pinnedFingering svg.b39-keys-svg'), 'после addTrack("keys") в доке показаны клавиши');

    T.setInstrument(kId, 'guitar');
    await new Promise((r) => setTimeout(r, 160));
    assert.ok(doc.querySelector('#pinnedFingering svg:not(.b39-keys-svg)'), 'после setInstrument("guitar") в доке показан гриф');
    w.unpinFingering();
    ok('6. #pinnedFingering мгновенно перерисовывается при addTrack / setInstrument / reorderTracks');
  }

  // --- 7. reorderTracks с записанными гитарными ev.notes ---
  {
    w.eval(`startNewSongFromHome(); addSection('Verse'); sections[0].squares[0].events[0].chord = 'C';
      sections[0].squares[0].events[0].notes = [{ start: 0, dur: 1, string: 2, fret: 3 }]; render();`);
    const s0 = w.eval(`sections[0]`), c0 = T.cellKey(s0, s0.squares[0], 0);
    const kId = T.addTrack('keys');
    T.setTrackChord(kId, c0, 'Fmaj7');
    w.eval(`render();`);
    assert.ok(!doc.querySelector('.chord-wrapper[data-ei="0"] .accomp-notes-plate'), 'на клавишной дорожке не видна гитарная плашка «♪ ноты»');

    T.reorderTracks(1, 0); // Клавиши становятся главной дорожкой, гитара — второй!
    assert.strictEqual(s0.squares[0].events[0].notes, undefined, 'ev.notes перенесены с главной ячейки в гитарную дорожку');
    assert.strictEqual(T.recordedNotes(1, c0).length, 1, 'гитарная дорожка сохранила свои записанные ноты');
    assert.strictEqual(w.StruChordKeys.beginNoteInput(c0), true, '«Ввести по клавишам» на новой главной клавишной дорожке не блокируется');

    // Проверим экспорт обеих партий
    const parts = w.StruChordExport.buildParts({ sections: w.eval('sections'), globalTimeSig: '4/4', globalKey: 'C' });
    const guitarPart = parts.find((p) => p.instrument === 'guitar');
    assert.strictEqual(guitarPart.rolls[s0.id].length, 1, 'вторичная гитара экспортирует свои записанные ноты в GP/MIDI');

    // Перетащим гитару обратно наверх — ev.notes возвращаются на место
    T.reorderTracks(1, 0);
    assert.strictEqual(s0.squares[0].events[0].notes.length, 1, 'обратный reorder возвращает ev.notes главной гитаре');
    assert.strictEqual(T.recordedNotes(1, c0), null, 'временная карта recordedNotes очищена');
    ok('7. reorderTracks переносит записанные ev.notes вместе с гитарной дорожкой без потерь и блокировок');
  }

  // --- 8 & 9. Изоляция b39-keys-mode, пропуск гитарного решателя, ruler_only в Ленте и timelinePassHint ---
  {
    w.eval(`startNewSongFromHome(); addSection('Verse'); sections[0].repeat = 2;
      sections[0].strumPattern = { mode: 'strum', subdivision: 2, steps: ['D','U','D','U','D','U','D','U'] };
      sections[0].squares[0].events[0].chord = 'C13'; render();`);
    const s0 = w.eval(`sections[0]`), c0 = T.cellKey(s0, s0.squares[0], 0);
    const kId = T.addTrack('keys');
    T.setPattern(kId, 's:' + s0.id, { type: 'keys-eighths', subdivision: 2, steps: ['B', 'C', 'B', 'C', 'B', 'C', 'B', 'C'] });
    w.StruChordKeys.close();

    // Подсчёт вызовов getFingeringVariants на клавишной дорожке
    let solverCalls = 0;
    const origSolver = w.getFingeringVariants;
    w.getFingeringVariants = function () { solverCalls++; return origSolver.apply(this, arguments); };
    w.showFingeringTooltip('C13', doc.querySelector('.chord-wrapper[data-ei="0"]'), false);
    w.getFingeringVariants = origSolver;
    assert.strictEqual(solverCalls, 0, 'showFingeringTooltip в клавишном режиме не вызывает getFingeringVariants');
    assert.ok(doc.querySelector('#fingering-tooltip svg.b39-keys-svg'), 'тултип показывает клавишную схему C13');

    // Призрачная ячейка не открывает тултип
    T.setTrackChord(kId, c0, '');
    w.eval(`render();`);
    w.showFingeringTooltip('C13', doc.querySelector('.chord-wrapper[data-ei="0"]'), false);
    assert.notStrictEqual(doc.getElementById('fingering-tooltip').style.display, 'block', 'призрачная ячейка не открывает тултип');

    // Лента на клавишной дорожке: линейка и счёт есть, гитарных .tl-hit нет (ruler_only)
    T.setTrackChord(kId, c0, 'C13');
    w.eval(`if (!timelineMode) toggleTimelineMode(); renderTimeline();`);
    const rhythmEl = doc.getElementById('timelineRhythm');
    assert.ok(rhythmEl.querySelectorAll('.tl-tick').length > 0, 'в Ленте на клавишах остаются деления тактовой линейки');
    assert.ok(rhythmEl.querySelectorAll('.tl-count').length > 0, 'в Ленте на клавишах остаётся счёт долей');
    assert.strictEqual(rhythmEl.querySelectorAll('.tl-hit').length, 0, 'в Ленте на клавишах скрыты гитарные стрелки и струны');
    w.eval(`if (timelineMode) toggleTimelineMode();`);
    ok('8. Изоляция b39-keys-mode: 0 вызовов гитарного решателя, защита призраков и ruler_only в Ленте');
  }

  // --- 10 & 11. addTrack copy_full для Drop D гитары и для клавиш ---
  {
    w.eval(`startNewSongFromHome(); addSection('Verse'); sections[0].squares[0].events[0].chord = 'D'; render();`);
    const s0 = w.eval(`sections[0]`), c0 = T.cellKey(s0, s0.squares[0], 0);
    T.setTuning(1, { id: 'drop-d', notes: null });
    w.eval(`sections[0].squares[0].events[0].fingering = '0,0,0,2,3,2'; sections[0].squares[0].events[0].fingeringTuning = tuningKeySuffix();`);

    const g2 = T.addTrack('guitar');
    assert.deepStrictEqual(j(T.tuning(g2)), { id: 'drop-d', notes: null }, 'новая гитара от Drop D копирует строй Drop D');
    assert.deepStrictEqual(j(T.guitarShape(g2, c0, 'D').shape), [0, 0, 0, 2, 3, 2], 'новая гитара от Drop D копирует аппликатуру');

    const k1 = T.addTrack('keys');
    T.setTimbre(k1, 'pad');
    T.setTrackKeyboardSize(k1, 49);
    T.setSaturation(k1, 77);
    T.setLinkedVoicings(k1, false);
    T.setVoicingForChord(k1, 'D', 1);
    T.setBassRole(k1, s0.id, 'nobass');

    const k2 = T.addTrack('keys');
    const tk2 = T.track(k2);
    assert.strictEqual(tk2.timbre, 'pad', 'копия клавиш сохраняет тембр');
    assert.strictEqual(tk2.keyboardSize, 49, 'копия клавиш сохраняет размер клавиатуры');
    assert.strictEqual(tk2.saturation, 77, 'копия клавиш сохраняет насыщенность');
    assert.strictEqual(tk2.linkedVoicings, false, 'копия клавиш сохраняет голосоведение');
    assert.strictEqual(T.voicingForChord(k2, 'D'), 1, 'копия клавиш сохраняет обращения');
    assert.strictEqual(T.bassRole(k2, s0.id), 'nobass', 'копия клавиш сохраняет роль баса');

    // А добавление гитары поверх активной КЛАВИШНОЙ дорожки создаёт гитару в E Standard с готовыми формами
    const g3 = T.addTrack('guitar');
    assert.deepStrictEqual(j(T.tuning(g3)), { id: 'e-std', notes: null }, 'гитара, созданная от клавишной дорожки, получает E Standard');
    assert.ok(Array.isArray(T.guitarShape(g3, c0, 'D')?.shape), 'гитара от клавишной дорожки сразу получает рассчитанную аппликатуру');

    // Закрытие несовместимых модалок при смене инструмента
    T.setActive(k1);
    w.StruChordAuto.open();
    assert.ok(doc.getElementById('b39AutoPanel'), 'окно Авто открыто на клавишах');
    T.setActive(1); // переключаемся на гитару
    assert.strictEqual(doc.getElementById('b39AutoPanel'), null, 'окно Авто закрыто при уходе на гитару');

    w.openFingeringEditor('D', 0, doc.querySelector('.chord-wrapper[data-ei="0"]'));
    assert.ok(doc.querySelector('.fe-modal'), 'редактор аппликатуры открыт на гитаре');
    T.setActive(k1); // переключаемся на клавиши
    assert.strictEqual(doc.querySelector('.fe-modal'), null, 'редактор аппликатуры закрыт при уходе на клавиши');

    // timelinePassHint при игре вторичной гитары на втором проходе секции (при пустой главной)
    w.eval(`startNewSongFromHome(); addSection('Verse'); sections[0].repeat = 2;
      sections[0].strumPattern = { mode: 'strum', subdivision: 1, steps: ['D','D','D','D'] };
      sections[0].squares[0].events = [{ chord: '', span: 4 }]; render();`);
    const sPass = w.eval(`sections[0]`), cPass = T.cellKey(sPass, sPass.squares[0], 0);
    const gSec = T.addTrack('guitar');
    T.setTrackChord(gSec, cPass, 'G');
    const seenPasses = w.eval(`(() => {
      const captured = [];
      const orig = schedulePatternForEvent;
      schedulePatternForEvent = function () { captured.push(timelinePassHint && timelinePassHint.secPass); return orig.apply(this, arguments); };
      try {
        const ctx = getAudioContext();
        playbackState.isPlaying = true;
        playbackState.currentSectionIndex = 0;
        playbackState.currentSquareIndex = 0;
        playbackState.currentEventIndex = 0;
        playbackState._sectionRepeatCount = {};
        playbackState._squareRepeatCount = {};
        playbackState._structureWalk = null;
        nextEventTime = ctx.currentTime + 0.2;
        scheduleNextEvent(ctx); // 1-й проход
        scheduleNextEvent(ctx); // 2-й проход
        return captured;
      } finally {
        stopPlayback();
        schedulePatternForEvent = orig;
      }
    })()`);
    assert.deepStrictEqual(j(seenPasses), [0, 1], 'вторичная гитара получает точный timelinePassHint на обоих проходах секции');
    ok('9-11. addTrack (copy_full), закрытие несовместимых модалок и timelinePassHint для вторичной гитары');
  }

  console.log(`\nИТОГО: ${pass} проверок пройдено успешно.`);
  process.exit(0);
})().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
