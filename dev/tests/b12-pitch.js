#!/usr/bin/env node
/*
 * b12-pitch.js — B-12.9.2: негитарные дорожки и абсолютный MIDI pitch.
 * Проверяем миграцию/санитайзер, две независимые модели таба и pitch,
 * гриф-пикер, GM-пэды, голоса, рендер, звук и операции секций/дорожек.
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
    createBuffer: (channels, len) => ({ getChannelData: () => new Float32Array(len) }),
  };
};

let pass = 0;
let fail = 0;
function check(name, condition, details) {
  if (condition) {
    pass++;
    console.log('ok   ' + name);
  } else {
    fail++;
    console.error('FAIL ' + name + (details ? ' — ' + details : ''));
  }
}
function json(expr) { return JSON.parse(w.eval(`JSON.stringify(${expr})`)); }
function loadSong(song) {
  w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
  w.loadSong(0);
}
function setInstrument(id) {
  const select = w.document.getElementById('ptInstrument');
  select.value = id;
  select.dispatchEvent(new w.Event('change', { bubbles: true }));
  w.eval('renderPartsScreen()');
}
function setVoice(voice) {
  const select = w.document.getElementById('ptVoice');
  select.value = String(voice);
  select.dispatchEvent(new w.Event('change', { bubbles: true }));
}
function clickFret(line, fret) {
  const cell = w.document.querySelector(`#ptFretboard [data-string="${line}"][data-fret="${fret}"]`);
  if (!cell) throw new Error(`fret cell ${line}/${fret} not found`);
  cell.click();
  w.eval('renderPartsScreen()');
}
const baseSong = {
  schemaVersion: 5,
  metadata: { artist: 'Тест', title: 'Pitch' },
  bpm: 100, globalKey: 'C', keyMode: 'manual', globalTimeSig: '4/4',
  tuning: 'e-std', tuningNotes: null, notes: '', date: '2026-10-13',
  sections: [{
    id: 1, type: 'Verse', customName: null, key: null, shift: null,
    timeSig: null, bpm: null, repeat: 1, strumPattern: null,
    squares: [{ id: 2, repeat: 1, customBeats: 4, events: [
      { chord: 'C', span: 4, timeSig: null, strumPattern: null },
    ] }],
  }],
  nextId: 100, rhythmPool: null, userFingerings: [], preferredFingerings: [],
  parts: [{
    id: 10, name: 'Keys', sourceName: 'Imported Synth', gmProgram: 89, midiChannel: 3,
    instrument: 'keys', tuning: 'e-std', visible: true,
    rolls: { '1': [{ start: 0, dur: 1, string: 5, fret: 3 }] },
    pitchRolls: { '1': [
      { start: 0, dur: 1, pitch: 60, line: 4, velocity: 1 },
      { start: 0, dur: 1, pitch: 62, line: 4, voice: 2, velocity: 127 },
      { start: 1, dur: 1, pitch: 127, line: 0, voice: 4, velocity: 128 },
      { start: 2, dur: 1, pitch: 61, line: 4, voice: 5, velocity: 0 },
      // Та же ячейка и голос: должна проиграть первая запись.
      { start: 2, dur: 1, pitch: 65, line: 4, voice: 1 },
      { start: 3, dur: 1, pitch: '63', line: 4 },
      { start: 3, dur: 1, pitch: null, line: 4 },
    ] },
  }],
};

w.addEventListener('load', () => {
  try {
    // MIDI-пикер нужен только на ручном вводе; тесты звука ниже вызывают
    // синтез напрямую, поэтому не создаём зависимости от WebAudio в jsdom.
    w.eval('previewPartPitchNote = function() {}; previewPartNote = function() {};');
    w.confirm = () => true;
    loadSong(baseSong);
    w.eval('togglePartsMode(true); renderPartsScreen()');

    let part = json('songParts[0]');
    const pitchNotes = part.pitchRolls['1'];
    check('v5 мигрировала через v6/v7 в v8 с отдельным pitchRoll',
      w.eval('SONG_SCHEMA_VERSION') === 8 && Array.isArray(pitchNotes) && pitchNotes.length === 4,
      JSON.stringify(pitchNotes));
    check('pitch — строго целый MIDI 0–127; строка и null отброшены',
      pitchNotes.every((note) => Number.isInteger(note.pitch) && note.pitch >= 0 && note.pitch <= 127) &&
        !pitchNotes.some((note) => note.pitch === 63), JSON.stringify(pitchNotes));
    check('одна нота на линию/позицию/голос, отдельные голоса сохранены',
      pitchNotes.some((note) => note.pitch === 60 && !note.voice) &&
        pitchNotes.some((note) => note.pitch === 62 && note.voice === 2) &&
        pitchNotes.some((note) => note.pitch === 61 && !note.voice) &&
        !pitchNotes.some((note) => note.pitch === 65), JSON.stringify(pitchNotes));
    check('velocity 1 и 127 принимаются; недопустимые значения не записаны',
      pitchNotes.find((note) => note.pitch === 60).velocity === 1 &&
        pitchNotes.find((note) => note.pitch === 62).velocity === 127 &&
        !pitchNotes.find((note) => note.pitch === 127).velocity &&
        !pitchNotes.find((note) => note.pitch === 61).velocity, JSON.stringify(pitchNotes));
    check('исходные имя, GM program и MIDI channel сохранены',
      part.sourceName === 'Imported Synth' && part.gmProgram === 89 && part.midiChannel === 3,
      JSON.stringify({ sourceName: part.sourceName, gmProgram: part.gmProgram, midiChannel: part.midiChannel }));
    check('роли имеют отдельные временные списки звуков без RSE-семплов',
      ['drums', 'keys', 'vocal', 'other'].every((role) =>
        w.eval(`soundListFor('${role}').length === 1 && soundListFor('${role}')[0].id === 'acoustic'`)));
    check('таб-roll и pitchRoll хранятся независимо',
      part.rolls['1'].length === 1 && part.rolls['1'][0].fret === 3 && pitchNotes.length === 4);
    check('C4=60 и частота MIDI строится от абсолютной высоты',
      w.eval('partPitchLabel(60, songParts[0], sections[0])') === 'C4' &&
        Math.abs(w.eval('partPitchFrequency(60)') - 261.625565) < 0.001);

    const svg = w.document.querySelector('#partsTrack .pt-score-staff-svg');
    const c4 = svg && svg.querySelector('.pt-score-note[data-pitch="60"]');
    const d4 = svg && svg.querySelector('.pt-score-note[data-pitch="62"]');
    const high = svg && svg.querySelector('.pt-score-note[data-pitch="127"]');
    const noteY = (node) => node && node.querySelector('.pt-score-notehead')?.getAttribute('cy');
    check('GM keys показывается на нотном стане, а C4 читается из высоты',
      !!svg && !!c4 && c4.querySelector('title').textContent.includes('C4'));
    check('одновременные ноты разных голосов получают разные позиции стана',
      !!c4 && !!d4 && noteY(c4) !== noteY(d4), `${noteY(c4)} / ${noteY(d4)}`);
    const staffViewBox = svg && svg.getAttribute('viewBox').split(/\s+/).map(Number);
    check('высота MIDI 127 остаётся видимой с динамически расширенным станом',
      !!high && Number(high.getAttribute('data-pitch')) === 127 && staffViewBox &&
        Number(noteY(high)) > 0 && Number(noteY(high)) < staffViewBox[3]);

    // Сохранение/загрузка схемы и pitch-массива.
    w.saveCurrentSong();
    let savedList = JSON.parse(w.localStorage.getItem('struchord_songs'));
    let saved = savedList[savedList.length - 1];
    check('serialization записывает schemaVersion 8, viewMode и pitchRolls',
      saved.schemaVersion === 8 && saved.parts[0].viewMode === 'staff' && saved.parts[0].pitchRolls['1'].length === 4 &&
        saved.parts[0].sourceName === 'Imported Synth' && saved.parts[0].gmProgram === 89 &&
        saved.parts[0].midiChannel === 3, JSON.stringify(saved.parts && saved.parts[0]));
    w.localStorage.setItem('struchord_songs', JSON.stringify([saved]));
    w.loadSong(0);
    w.eval('togglePartsMode(true); renderPartsScreen()');
    part = json('songParts[0]');
    check('pitch, velocity, голоса и таб-roll переживают перезагрузку',
      part.pitchRolls['1'].length === 4 && part.pitchRolls['1'].find((n) => n.pitch === 62).voice === 2 &&
        part.pitchRolls['1'].find((n) => n.pitch === 60).velocity === 1 && part.rolls['1'][0].fret === 3);

    // Гриф-пикер: B3 + лад 1 = C4 (60). Четыре голоса могут звучать
    // одновременно в одной линии; повторный ввод в том же голосе заменяет ноту.
    w.document.getElementById('ptInstrumentViewToggle').click();
    check('для pitched-дорожки открывается гриф-пикер',
      !w.document.getElementById('ptInstrumentPanel').hidden &&
        !w.document.getElementById('ptFretboard').hidden && w.document.getElementById('ptDrumPads').hidden);
    const c4Cell = w.document.querySelector('#ptFretboard [data-string="4"][data-fret="1"]');
    check('гриф-пикер подписывает B3+1 как C4 / MIDI 60',
      !!c4Cell && c4Cell.title.includes('C4') && c4Cell.title.includes('MIDI 60'), c4Cell && c4Cell.title);
    setVoice(3);
    clickFret(4, 3); // D4, pitch 62, voice 3
    setVoice(4);
    clickFret(4, 5); // E4, pitch 64, voice 4
    setVoice(3);
    clickFret(4, 4); // replace voice 3 with D#4, pitch 63
    part = json('songParts[0]');
    const atZero = part.pitchRolls['1'].filter((note) => note.start === 0 && note.line === 4);
    check('клик по грифу переводит позицию в абсолютный MIDI pitch C4',
      atZero.some((note) => note.pitch === 60 && !note.voice), JSON.stringify(atZero));
    check('4 голоса сохраняют одновременные ноты в одной линии',
      [1, 2, 3, 4].every((voice) => atZero.some((note) => Number(note.voice || 1) === voice)) && atZero.length === 4,
      JSON.stringify(atZero));
    check('повторный ввод заменяет только ячейку своего голоса',
      atZero.find((note) => note.voice === 3).pitch === 63 && !atZero.some((note) => note.pitch === 62 && note.voice === 3),
      JSON.stringify(atZero));
    check('ручные правки pitch-дорожки идут командами songStore.dispatch',
      w.songStore.log().filter((command) => command.label === 'part/pitch-input').length >= 3);
    const pitchesBeforeTuning = json('songParts[0].pitchRolls["1"]');
    w.eval('applyPartStrings(["C2", "G2", "D3"])');
    w.eval('renderPartsScreen()');
    const pitchesAfterTuning = json('songParts[0].pitchRolls["1"]');
    check('смена строя/числа линий у keys не транспонирует и не удаляет pitch',
      JSON.stringify(pitchesAfterTuning) === JSON.stringify(pitchesBeforeTuning) &&
        w.eval('partStringCount(songParts[0])') === 3 &&
        w.eval('partPitchLabel(songParts[0].pitchRolls["1"][0].pitch, songParts[0], sections[0])') === 'C4');

    // Переключение роли ничего не конвертирует и не стирает ни один домен.
    const beforeRoles = json('songParts[0]');
    setInstrument('guitar');
    part = json('songParts[0]');
    check('смена на гитару показывает tab-roll, не уничтожая pitchRoll',
      part.rolls['1'].length === 1 && part.pitchRolls['1'].length === beforeRoles.pitchRolls['1'].length &&
        w.document.getElementById('ptVoice').disabled && w.document.getElementById('ptInstrumentViewToggle').hidden);
    setInstrument('keys');
    part = json('songParts[0]');
    check('возврат на keys сохраняет pitch- и tab-домены',
      part.pitchRolls['1'].length === beforeRoles.pitchRolls['1'].length && part.rolls['1'].length === 1);

    // Секционный клон копирует оба слоя, удаление чистит оба.
    const originalSection = json('sections[0]');
    w.eval('cloneSection(1)');
    const clonedSection = json('sections[1]');
    part = json('songParts[0]');
    check('клон секции копирует pitch-roll отдельными объектами',
      part.pitchRolls[String(clonedSection.id)].length === part.pitchRolls['1'].length &&
        part.pitchRolls[String(clonedSection.id)][0] !== part.pitchRolls['1'][0]);
    check('клон секции также копирует tab-roll',
      part.rolls[String(clonedSection.id)].length === part.rolls['1'].length);
    w.eval(`removeSection(${clonedSection.id})`);
    part = json('songParts[0]');
    check('удаление секции очищает pitch-roll и tab-roll',
      !part.pitchRolls[String(clonedSection.id)] && !part.rolls[String(clonedSection.id)]);

    // GM-пэды: разные одновременно звучащие удары сохраняются, выбранный
    // pitch можно удалить адресно, не задев другой удар той же позиции.
    setInstrument('drums');
    if (w.document.getElementById('ptInstrumentPanel').hidden) {
      w.document.getElementById('ptInstrumentViewToggle').click();
    }
    const pads = w.document.getElementById('ptDrumPads');
    check('для ударных открыт GM-выборщик вместо грифа',
      !w.document.getElementById('ptInstrumentPanel').hidden && !pads.hidden &&
        w.document.getElementById('ptFretboard').hidden && pads.querySelector('[data-pitch="36"]'));
    setVoice(1);
    pads.querySelector('[data-pitch="36"]').click(); // kick
    pads.querySelector('[data-pitch="38"]').click(); // snare
    part = json('songParts[0]');
    let drumAtZero = part.pitchRolls['1'].filter((note) => note.start === 0 && (note.pitch === 36 || note.pitch === 38));
    check('GM-пэды добавляют kick и snare одновременно разными pitch',
      drumAtZero.length === 2 && drumAtZero.some((note) => note.pitch === 36 && note.line === 0) &&
        drumAtZero.some((note) => note.pitch === 38 && note.line === 1), JSON.stringify(drumAtZero));
    pads.querySelector('[data-pitch="36"]').click();
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
    part = json('songParts[0]');
    drumAtZero = part.pitchRolls['1'].filter((note) => note.start === 0 && (note.pitch === 36 || note.pitch === 38));
    check('Backspace удаляет выбранный GM pitch и оставляет другой удар',
      drumAtZero.length === 1 && drumAtZero[0].pitch === 38, JSON.stringify(drumAtZero));
    check('ударным нельзя ввести ноту ладом',
      (w.eval('partPitchPositions(songParts[0], 60)').length === 0) &&
        w.eval('partInstrumentId(songParts[0])') === 'drums');

    // Звук: scheduler маршрутизирует каждый pitch отдельно, а простые
    // генераторы используют высоту и velocity без обращения к строю.
    w.eval(`
      window.__scheduledPitch = [];
      window.__realPartSchedulePitchNote = partSchedulePitchNote;
      partSchedulePitchNote = function(ctx, p, note, at, dur) {
        window.__scheduledPitch.push({ instrument: p.instrument, pitch: note.pitch, at, dur, velocity: note.velocity || 90 });
      };
      schedulePartsForEvent({}, sections[0], sections[0].squares[0], 0, 5, 2);
    `);
    const scheduled = json('window.__scheduledPitch');
    check('планировщик играет каждую pitch-ноту внутри окна события',
      scheduled.length === json('songParts[0].pitchRolls["1"]').filter((note) => note.start < 4).length &&
        scheduled.some((note) => note.pitch === 60 && note.at === 5), JSON.stringify(scheduled));

    w.eval(`
      window.__oscillators = [];
      window.__gainPeaks = [];
      partSchedulePitchNote = window.__realPartSchedulePitchNote;
      mixerChannelForVoice = function(ctx) { return { dry: ctx.destination }; };
      const param = () => ({ value: 0, values: [], setValueAtTime(v) { this.value = v; this.values.push(v); },
        linearRampToValueAtTime(v) { this.value = v; this.values.push(v); },
        exponentialRampToValueAtTime(v) { this.value = v; this.values.push(v); } });
      const ctx = { currentTime: 0, destination: {},
        createGain() { const gain = { gain: param(), connect() {} }; window.__gainPeaks.push(gain.gain); return gain; },
        createOscillator() { const osc = { frequency: param(), connect() {}, start() {}, stop() {}, type: '' };
          window.__oscillators.push(osc); return osc; },
        createBufferSource() { return { connect() {}, start() {}, stop() {} }; },
        createBuffer(channels, len) { return { getChannelData() { return new Float32Array(len); } }; },
        createBiquadFilter() { return { frequency: param(), connect() {}, type: '' }; },
      };
      partSchedulePitchNote(ctx, { id: 77, instrument: 'keys' }, { pitch: 60, velocity: 127 }, 0, 0.5);
      partSchedulePitchNote(ctx, { id: 78, instrument: 'keys' }, { pitch: 60, velocity: 1 }, 1, 0.5);
      partSchedulePitchNote(ctx, { id: 79, instrument: 'drums' }, { pitch: 36, velocity: 127 }, 2, 0.5);
      partSchedulePitchNote(ctx, { id: 80, instrument: 'drums' }, { pitch: 38, velocity: 90 }, 3, 0.5);
    `);
    const oscillators = json('window.__oscillators.map((o) => ({ type:o.type, frequency:o.frequency.values[0] }))');
    const gainPeaks = json('window.__gainPeaks.map((g) => Math.max(...g.values))');
    check('keys звучат простым тоном на частоте MIDI 60',
      oscillators.some((o) => o.type === 'triangle' && Math.abs(o.frequency - 261.625565) < 0.01),
      JSON.stringify(oscillators));
    check('velocity меняет громкость синтетической ноты',
      gainPeaks.length >= 4 && Math.max(...gainPeaks) > Math.min(...gainPeaks), JSON.stringify(gainPeaks));
    check('разные GM-удары используют отдельные синтетические генераторы',
      oscillators.some((o) => Math.abs(o.frequency - 145) < 0.1) &&
        oscillators.some((o) => Math.abs(o.frequency - 185) < 0.1), JSON.stringify(oscillators));

    // Клон дорожки deep-copies оба домена; удаление дорожки чистит её из модели.
    setInstrument('keys');
    const beforeClone = json('songParts[0]');
    w.eval('clonePartTrack()');
    let parts = json('songParts');
    const clone = parts[1];
    check('клон дорожки копирует pitch-roll и tab-roll',
      !!clone && clone.pitchRolls['1'].length === beforeClone.pitchRolls['1'].length &&
        clone.rolls['1'].length === beforeClone.rolls['1'].length &&
        clone.pitchRolls['1'][0] !== parts[0].pitchRolls['1'][0]);
    w.eval('removePartTrack()');
    parts = json('songParts');
    check('удаление клона дорожки не трогает оригинал',
      parts.length === 1 && parts[0].pitchRolls['1'].length === beforeClone.pitchRolls['1'].length);

    console.log(`\nитого: ${pass} ok, ${fail} FAIL`);
    if (fail) process.exitCode = 1;
  } catch (error) {
    console.error('ОШИБКА:', error && error.stack ? error.stack : error);
    process.exitCode = 1;
  }
});
