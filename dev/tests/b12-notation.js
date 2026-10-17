#!/usr/bin/env node
/*
 * B-12.10.1 — read-only staff notation, shared measures, role defaults,
 * persistence, accidentals, rests, repeats, and synchronized playback cursor.
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
      font: '', measureText: () => ({ width: 10 }), clearRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {},
      moveTo() {}, lineTo() {}, closePath() {}, save() {}, restore() {}, translate() {}, rotate() {},
      fillText() {}, strokeText() {}, setTransform() {}, scale() {}, createLinearGradient: () => ({ addColorStop() {} }),
    });
  },
});
const w = dom.window;
w.AudioContext = w.webkitAudioContext = function () {
  return { currentTime: 0, state: 'running', resume() {}, sampleRate: 44100,
    createBuffer: (channels, length) => ({ getChannelData: () => new Float32Array(length) }) };
};

let pass = 0;
let fail = 0;
function check(name, condition, detail) {
  if (condition) { pass++; console.log('ok   ' + name); }
  else { fail++; console.error('FAIL ' + name + (detail ? ' — ' + detail : '')); }
}
function json(expr) { return JSON.parse(w.eval(`JSON.stringify(${expr})`)); }
const square = (id, chord, extra) => Object.assign({
  id, repeat: 1, customBeats: 4,
  events: [{ chord, span: 4, timeSig: null, strumPattern: null }],
}, extra || {});
const section = (id, type, repeat, squares, key) => ({
  id, type, customName: null, key: key || null, shift: null, timeSig: '4/4', bpm: null,
  repeat, strumPattern: null, squares,
});
function song(parts, schemaVersion, sections) {
  return {
    schemaVersion: schemaVersion || 8,
    metadata: { artist: 'Notation test', title: 'Read only' },
    bpm: 100, globalKey: 'G', keyMode: 'manual', globalTimeSig: '4/4',
    tuning: 'e-std', tuningNotes: null, notes: '',
    sections: sections || [section(1, 'Verse', 2, [
      square(11, 'C', { volta: 1, repeatOpen: true }),
      square(12, 'G', { repeat: 2, volta: 2, customBeats: 8, events: [
        { chord: 'G', span: 4, timeSig: null, strumPattern: null },
        { chord: 'Em', span: 4, timeSig: null, strumPattern: null },
      ] }),
      square(13, 'D'),
    ], 'G')],
    parts, nextId: 200, rhythmPool: null, userFingerings: [], preferredFingerings: [], date: '2026-10-17',
  };
}
function load(value) {
  w.localStorage.setItem('struchord_songs', JSON.stringify([value]));
  w.loadSong(0);
  w.confirm = () => true;
}

w.addEventListener('load', () => {
  try {
    // v7 -> v8 migration: role defaults, explicit overrides, and invalid data.
    const legacyRoll = [{ start: 0, dur: 1, string: 5, fret: 3 }];
    load(song([
      { id: 1, name: 'Guitar', instrument: 'guitar', rolls: { '1': legacyRoll } },
      { id: 2, name: 'Bass', instrument: 'bass', viewMode: 'staff', rolls: { '1': legacyRoll } },
      { id: 3, name: 'Keys', instrument: 'keys', rolls: {}, pitchRolls: { '1': [{ start: 0, dur: 1, pitch: 60, line: 4 }] } },
      { id: 4, name: 'Vocal', instrument: 'vocal', viewMode: 'tab', pitchRolls: { '1': [{ start: 0, dur: 1, pitch: 60, line: 4 }] } },
      { id: 5, name: 'Drums', instrument: 'drums', viewMode: 'invalid' },
      { id: 6, name: 'Other', instrument: 'other' },
    ], 7));
    const migrated = json('songParts.map(p => ({ instrument:p.instrument, viewMode:p.viewMode }))');
    check('схема v7 мигрирует в v8', w.eval('SONG_SCHEMA_VERSION') === 8 &&
      json('songParts.every(p => p.viewMode === "staff" || p.viewMode === "tab")'));
    check('гитара и бас по умолчанию используют табы, сохраняя явный выбор нот',
      migrated[0].viewMode === 'tab' && migrated[1].viewMode === 'staff', JSON.stringify(migrated.slice(0, 2)));
    check('keys, vocal, drums и other по умолчанию используют стан; явный выбор сохраняется',
      migrated[2].viewMode === 'staff' && migrated[3].viewMode === 'tab' &&
      migrated[4].viewMode === 'staff' && migrated[5].viewMode === 'staff', JSON.stringify(migrated));
    check('переход схемы не меняет старые таб-ноты и pitch-ноты',
      json('songParts[0].rolls[String(sections[0].id)]')[0].fret === 3 &&
      json('songParts[2].pitchRolls[String(sections[0].id)]')[0].pitch === 60);

    // Main mixed score: piano + guitar/bass + drum map + voice + other.
    const keyNotes = [
      { start: 0, dur: 1, pitch: 60, line: 4, voice: 1 },
      { start: 0, dur: 1, pitch: 64, line: 3, voice: 1 }, // same onset/voice: chord
      { start: 0, dur: 1, pitch: 67, line: 2, voice: 2 },
      { start: 0, dur: 2, pitch: 62, line: 1, voice: 3 },
      { start: 0, dur: 1, pitch: 72, line: 0, voice: 4 },
      { start: 1, dur: 1, pitch: 65, line: 4, voice: 1 },
      { start: 2, dur: 1, pitch: 65, line: 4, voice: 1 }, // accidental state in same bar
      { start: 3, dur: 2, pitch: 65, line: 4, voice: 4 }, // tied into measure 2
    ];
    const scoreParts = [
      { id: 20, name: 'Piano', instrument: 'keys', viewMode: 'staff', visible: true,
        pitchRolls: { '1': keyNotes } },
      { id: 21, name: 'Guitar', instrument: 'guitar', viewMode: 'staff', capo: 2, visible: true,
        rolls: { '1': [{ start: 0, dur: 1, string: 5, fret: 0 }, { start: 1, dur: 1, string: 4, fret: 2 }] } },
      { id: 22, name: 'Bass', instrument: 'bass', viewMode: 'staff', visible: true,
        rolls: { '1': [{ start: 0, dur: 2, string: 0, fret: 0 }] } },
      { id: 23, name: 'Drums', instrument: 'drums', viewMode: 'staff', visible: true,
        pitchRolls: { '1': [
          { start: 0, dur: 1, pitch: 36, line: 0, voice: 1 },
          { start: 1, dur: 1, pitch: 42, line: 4, voice: 1 },
        ] } },
      { id: 24, name: 'Vocal', instrument: 'vocal', viewMode: 'staff', visible: true,
        pitchRolls: { '1': [{ start: 0, dur: 2, pitch: 72, line: 4 }] } },
      { id: 25, name: 'Other', instrument: 'other', viewMode: 'staff', visible: true,
        pitchRolls: { '1': [{ start: 2, dur: 1, pitch: 48, line: 4 }] } },
      { id: 26, name: 'Legacy guitar', instrument: 'guitar', visible: true,
        rolls: { '1': [{ start: 0, dur: 1, string: 4, fret: 30 }] } },
      { id: 27, name: 'Synth', instrument: 'keys', gmProgram: 89, viewMode: 'staff', visible: true,
        pitchRolls: { '1': [{ start: 0, dur: 1, pitch: 48, line: 4 }] } },
    ];
    load(song(scoreParts));
    w.eval('togglePartsMode(true)');
    const track = w.document.getElementById('partsTrack');
    const partId = json('Object.fromEntries(songParts.map(p => [p.name, p.id]))');
    track.getBoundingClientRect = () => ({ left: 0, top: 0, right: 480, bottom: 400, width: 480, height: 400 });
    w.eval('renderPartsScreen()');
    check('в смешанной стопке строится единая нотная раскладка',
      track.querySelectorAll('.pt-score-system').length >= 2 &&
      track.querySelectorAll('.pt-score-measure-header').length === 4,
      `systems=${track.querySelectorAll('.pt-score-system').length}; headers=${track.querySelectorAll('.pt-score-measure-header').length}`);
    const rows = Array.from(track.querySelectorAll('.pt-score-row'));
    const layoutSnapshot = Array.from(track.querySelectorAll('.pt-score-system')).map((system) => ({
      headers: Array.from(system.querySelectorAll('.pt-score-measure-header')).map((node) => node.dataset.measure),
      rows: Array.from(system.querySelectorAll('.pt-score-row')).map((row) =>
        Array.from(row.querySelectorAll('.pt-score-bar')).map((node) => node.dataset.measure)),
    }));
    check('каждая дорожка использует те же меры и одинаковые границы систем',
      rows.length === scoreParts.length * layoutSnapshot.length && layoutSnapshot.every((system) =>
        system.rows.length === scoreParts.length && system.rows.every((rowMeasures) => rowMeasures.join('|') === system.headers.join('|'))),
      JSON.stringify(layoutSnapshot));
    const structuralSquareId = w.eval('sections[0].squares[1].id');
    const structuralSquareSvg = track.querySelector(`.pt-score-bar[data-square="${structuralSquareId}"] .pt-score-staff-svg`);
    check('повторённая секция печатается один раз, а квадратный повтор имеет нативные знаки',
      track.querySelectorAll('.pt-score-marker').length === 4 &&
      Array.from(track.querySelectorAll('.pt-score-marker')).some((node) => node.textContent.includes('×2')) &&
      structuralSquareSvg?.querySelectorAll('.pt-score-repeat-line').length >= 2 &&
      structuralSquareSvg.querySelectorAll('.pt-score-repeat-dot').length >= 2,
      `headers=${track.querySelectorAll('.pt-score-marker').length}; square repeat marks=${structuralSquareSvg && structuralSquareSvg.querySelectorAll('.pt-score-repeat-line').length}`);
    check('аккордовые обозначения показываются над общими тактами',
      Array.from(track.querySelectorAll('.pt-score-chord')).some((node) => node.textContent === 'C') &&
      Array.from(track.querySelectorAll('.pt-score-chord')).some((node) => node.textContent === 'G'));
    check('тональность G рисует ключевой знак F♯',
      track.querySelector('.pt-score-staff-svg .pt-score-key-accidental')?.textContent === '♯');
    const emptyAutoKey = w.eval(`(() => {
      const previous = { mode: keyMode, detected: autoDetectedKey, global: globalKey, section: sections[0].key };
      try {
        keyMode = 'auto'; autoDetectedKey = null; globalKey = 'Eb'; sections[0].key = null;
        return partNotationKey(sections[0]);
      } finally {
        keyMode = previous.mode; autoDetectedKey = previous.detected;
        globalKey = previous.global; sections[0].key = previous.section;
      }
    })()`);
    check('авторежим без найденной тональности не наследует старый ручной ключ', emptyAutoKey === 'C', emptyAutoKey);
    const scoreIds = json('({ section: sections[0].id, first: sections[0].squares[0].id, repeated: sections[0].squares[1].id })');
    const pianoRow = track.querySelector(`.pt-score-row[data-part="${partId.Piano}"]`);
    const pianoSvg = pianoRow && pianoRow.querySelector('.pt-score-staff-svg');
    check('GM Keys использует большой стан с двумя ключами и десятью линейками',
      !!pianoSvg && pianoSvg.querySelectorAll('.pt-score-staff-line').length === 10 &&
      pianoSvg.querySelectorAll('.pt-score-clef').length === 2,
      `lines=${pianoSvg && pianoSvg.querySelectorAll('.pt-score-staff-line').length}; clefs=${pianoSvg && pianoSvg.querySelectorAll('.pt-score-clef').length}`);
    const synthRow = track.querySelector(`.pt-score-row[data-part="${partId.Synth}"]`);
    const synthSvg = synthRow && synthRow.querySelector('.pt-score-staff-svg');
    check('GM-синтезатор использует один стан с ключом по диапазону высот',
      !!synthSvg && synthSvg.querySelectorAll('.pt-score-staff-line').length === 5 &&
      synthSvg.querySelectorAll('.pt-score-clef').length === 1 &&
      synthSvg.querySelector('.pt-score-clef[data-clef="bass"]'));
    const sectionRepeatLine = pianoSvg && pianoSvg.querySelector('.pt-score-repeat-line[x1="4"]');
    const pianoClefPath = pianoSvg && pianoSvg.querySelector('.pt-score-clef[data-clef="treble"] .pt-score-clef-mark');
    check('знак повтора не перекрывает скрипичный ключ в начале системы',
      !!sectionRepeatLine && pianoClefPath?.getAttribute('d')?.startsWith('M 32 '));
    const pianoNotes = pianoSvg ? Array.from(pianoSvg.querySelectorAll('.pt-score-note')) : [];
    check('четыре голоса сохраняются раздельно, ноты одного голоса группируются как аккорд',
      [1, 2, 3, 4].every((voice) => pianoNotes.some((node) => Number(node.dataset.voice) === voice)) &&
      pianoNotes.filter((node) => node.dataset.voice === '1' && node.dataset.start === '0.0000').length === 2,
      JSON.stringify(pianoNotes.map((node) => [node.dataset.pitch, node.dataset.voice, node.dataset.start])));
    check('старые ноты без явных пауз получают паузу из промежутка тишины',
      !!pianoSvg && pianoSvg.querySelectorAll('.pt-score-rest[data-voice="4"]').length >= 1 &&
      pianoSvg.querySelectorAll('.pt-score-rest[data-voice="4"] title').length >= 1);
    const pianoSecondBar = track.querySelector(`.pt-score-row[data-part="${partId.Piano}"] .pt-score-bar[data-square="${scoreIds.repeated}"] .pt-score-staff-svg`) ||
      track.querySelectorAll(`.pt-score-row[data-part="${partId.Piano}"]`)[1]?.querySelector('.pt-score-staff-svg');
    check('альтерация внутри такта не дублируется и сбрасывается на границе',
      pianoSvg && pianoSvg.querySelectorAll('.pt-score-accidental').length === 1 &&
      pianoSecondBar && pianoSecondBar.querySelectorAll('.pt-score-accidental').length === 1,
      `first=${pianoSvg && pianoSvg.querySelectorAll('.pt-score-accidental').length}; second=${pianoSecondBar && pianoSecondBar.querySelectorAll('.pt-score-accidental').length}`);
    check('длинная нота связана лигой при переносе в следующий такт',
      track.querySelectorAll('.pt-score-tie').length >= 2 &&
      track.querySelector('.pt-score-note.is-tied-continuation'),
      `ties=${track.querySelectorAll('.pt-score-tie').length}`);
    const guitarRow = track.querySelector(`.pt-score-row[data-part="${partId.Guitar}"]`);
    const guitarNote = guitarRow && guitarRow.querySelector('.pt-score-note[data-pitch="66"]');
    check('гитара пишет октавой выше; capo учитывается в звучащей высоте',
      !!guitarNote && Number(guitarNote.dataset.writtenPitch) === 78 && guitarNote.dataset.clef === 'treble' &&
      !!guitarRow.querySelector('.pt-score-clef-octave'));
    const bassRow = track.querySelector(`.pt-score-row[data-part="${partId.Bass}"]`);
    check('басовая таб-дорожка по запросу получает басовый ключ и октавный перенос',
      !!bassRow && bassRow.querySelector('.pt-score-note[data-pitch="28"]')?.dataset.clef === 'bass' &&
      !!bassRow.querySelector('.pt-score-clef-octave'));
    const drumRow = track.querySelector(`.pt-score-row[data-part="${partId.Drums}"]`);
    check('ударные используют перкуссионный ключ и GM-карту удара',
      !!drumRow && !!drumRow.querySelector('.pt-score-clef') &&
      drumRow.querySelector('.pt-score-staff-svg .pt-score-clef[data-clef="percussion"]') &&
      drumRow.querySelector('.pt-score-notehead[data-gm="36"]') &&
      drumRow.querySelector('.pt-score-notehead[data-gm="42"]'));
    check('паузы выводятся из молчания и на ударной дорожке',
      !!drumRow && !!drumRow.querySelector('.pt-score-staff-svg .pt-score-rest[data-voice="1"]'));
    check('дорожки вокала и Other по умолчанию имеют читаемый стан',
      track.querySelector(`.pt-score-row[data-part="${partId.Vocal}"] .pt-score-staff-svg`) &&
      track.querySelector(`.pt-score-row[data-part="${partId.Other}"] .pt-score-staff-svg`));
    const tabRow = track.querySelector('.pt-score-row[data-part="26"]');
    check('табовая дорожка остаётся в той же синхронной системе',
      !!tabRow && !!tabRow.querySelector('.pt-score-tab-svg') &&
      tabRow.querySelectorAll('.pt-score-bar').length ===
        tabRow.closest('.pt-score-system').querySelectorAll('.pt-score-measure-header').length);
    check('недоступный лад в смешанной партитуре остаётся видимым пунктирным',
      !!tabRow?.querySelector('.pt-score-tab-svg .pt-note.is-unplayable'));
    check('карточки показывают бейдж вида, панель даёт явный переключатель',
      w.document.querySelector(`#partsTracks .pt-track-chip[data-part="${partId['Legacy guitar']}"] .pt-track-view`)?.textContent === 'Табы' &&
      w.document.getElementById('ptNotationModeToggle').hidden === false);

    // View choice is metadata, not an undo step and not a sound/note mutation.
    const keyPartId = w.eval('songParts.find(p => p.name === "Piano").id');
    w.eval(`selectPartTrack(${keyPartId})`);
    const originalPitchNotes = json(`songParts.find(p => p.id === ${keyPartId}).pitchRolls[String(sections[0].id)]`);
    const historyCount = w.eval('songStore.log().length');
    w.document.getElementById('ptNotationModeToggle').click();
    const changedPart = json(`songParts.find(p => p.id === ${keyPartId})`);
    check('переключатель меняет только вид дорожки и не создаёт undo-команду',
      changedPart.viewMode === 'tab' && JSON.stringify(changedPart.pitchRolls[String(w.eval('sections[0].id'))]) === JSON.stringify(originalPitchNotes) &&
      w.eval('songStore.log().length') === historyCount);
    w.document.getElementById('ptNotationModeToggle').click();
    check('возврат на стан сохраняет прежние ноты и звучание pitch-roll',
      json(`songParts.find(p => p.id === ${keyPartId}).pitchRolls[String(sections[0].id)]`).length === originalPitchNotes.length &&
      w.eval(`partUsesPitchNotes(songParts.find(p => p.id === ${keyPartId}))`));
    w.saveCurrentSong();
    const saved = JSON.parse(w.localStorage.getItem('struchord_songs')).slice(-1)[0];
    const savedPiano = saved.parts.find((part) => part.id === keyPartId);
    check('выбранный вид сохраняется в песне и переживает загрузку',
      saved.schemaVersion === 8 && savedPiano.viewMode === 'staff');

    // Repeat-aware score cursor; counters are zero-based like timeline playback.
    const ids = json('({ section: sections[0].id, first: sections[0].squares[0].id, repeated: sections[0].squares[1].id })');
    w.eval(`syncPartsPlaybackHighlight(${ids.section}, 1, ${ids.repeated}, 1, 0)`);
    const firstRepeatedMeasure = track.querySelectorAll(`.pt-score-bar.is-playing[data-square="${ids.repeated}"][data-measure="2"]`);
    const firstHeader = track.querySelector(`.pt-score-measure-header[data-square="${ids.first}"]`);
    const repeatHeader = track.querySelector(`.pt-score-measure-header[data-square="${ids.repeated}"]`);
    check('playhead по событию выбирает точный такт квадрата на всех дорожках',
      firstRepeatedMeasure.length === scoreParts.length &&
      !track.querySelector(`.pt-score-bar.is-playing[data-square="${ids.repeated}"][data-measure="3"]`) &&
      !track.querySelector(`.pt-score-bar.is-playing[data-square="${ids.first}"]`),
      `playing rows=${firstRepeatedMeasure.length}`);
    check('индикаторы показывают второй проход секции и квадрата',
      firstHeader?.querySelector('.pt-score-pass-section')?.textContent === '2/2' &&
      repeatHeader?.querySelector('.pt-score-pass-square')?.textContent === '2/2');
    w.eval(`syncPartsPlaybackHighlight(${ids.section}, 1, ${ids.repeated}, 1, 1)`);
    const nextRepeatedMeasure = track.querySelectorAll(`.pt-score-bar.is-playing[data-square="${ids.repeated}"][data-measure="3"]`);
    check('второе событие одного многотактового квадрата переводит playhead во второй такт',
      nextRepeatedMeasure.length === scoreParts.length &&
      !track.querySelector(`.pt-score-bar.is-playing[data-square="${ids.repeated}"][data-measure="2"]`),
      `playing rows=${nextRepeatedMeasure.length}`);
    w.eval('clearPartsPlaybackHighlight()');
    check('остановка снимает playhead и скрывает номера проходов',
      track.querySelectorAll('.pt-score-bar.is-playing, .pt-score-measure-header.is-playing').length === 0 &&
      Array.from(track.querySelectorAll('.pt-score-pass-section, .pt-score-pass-square')).every((node) => node.hidden));

    // Pure-tab mode remains on the legacy continuous renderer (no score reflow).
    load(song([
      { id: 30, name: 'Guitar', instrument: 'guitar', visible: true, rolls: { '1': legacyRoll } },
      { id: 31, name: 'Bass', instrument: 'bass', visible: true, rolls: { '1': legacyRoll } },
    ]));
    w.eval('togglePartsMode(true); renderPartsScreen()');
    check('если все дорожки табовые, непрерывная таб-лента остаётся прежней',
      w.document.querySelectorAll('#partsTrack .pt-score-system').length === 0 &&
      w.document.querySelectorAll('#partsTrack .pt-score-marker').length === 2 &&
      w.document.querySelectorAll('#partsTrack .pt-section-segment').length === 4,
      `score=${w.document.querySelectorAll('#partsTrack .pt-score-system').length}; markers=${w.document.querySelectorAll('#partsTrack .pt-score-marker').length}; segments=${w.document.querySelectorAll('#partsTrack .pt-section-segment').length}; parts=${json('songParts.map(p => p.viewMode)')}`);

    console.log(`\nитого: ${pass} ok, ${fail} FAIL`);
    setTimeout(() => { w.close(); process.exitCode = fail ? 1 : 0; }, 600);
  } catch (error) {
    console.error(error && error.stack || error);
    setTimeout(() => { w.close(); process.exitCode = 1; }, 600);
  }
});
