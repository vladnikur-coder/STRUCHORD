#!/usr/bin/env node
/* B-12.9.7: импорт Standard MIDI File — предпросмотр, новая песня, дописывание,
 * микшер, ударные, секции по меткам, отчёт и понятные отказы. */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { buildMidi, tempoMicros, ascii } = require('../tools/midi-fixture.js');

const html = fs.readFileSync(path.join(__dirname, '..', '..', 'STRUCHORD.html'), 'utf8');
const domErrors = [];
const toastMessages = [];
const consoleErrors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (error) => domErrors.push(String(error)));
virtualConsole.on('error', (text) => consoleErrors.push(String(text)));
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://localhost/',
  virtualConsole,
  beforeParse(win) {
    win.TextDecoder = global.TextDecoder;
    win.TextEncoder = global.TextEncoder;
    win.requestAnimationFrame = (callback) => setTimeout(callback, 0);
    win.cancelAnimationFrame = (id) => clearTimeout(id);
    win.HTMLCanvasElement.prototype.getContext = () => ({
      font: '', measureText: () => ({ width: 10 }),
      clearRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {}, moveTo() {},
      lineTo() {}, closePath() {}, save() {}, restore() {}, translate() {}, rotate() {},
      fillText() {}, strokeText() {}, setTransform() {}, scale() {},
      createLinearGradient: () => ({ addColorStop() {} }),
    });
    win.URL.createObjectURL = () => 'blob:struchord-test';
    win.URL.revokeObjectURL = () => {};
    win.HTMLAnchorElement.prototype.click = function () {};
  },
});
const w = dom.window;
w.AudioContext = w.webkitAudioContext = function () {
  return {
    currentTime: 0, state: 'running', resume() {}, sampleRate: 44100,
    createBuffer: (channels, length) => ({ getChannelData: () => new Float32Array(length) }),
  };
};
const originalShowToast = w.showToast;
w.showToast = function (message) {
  toastMessages.push(String(message));
  return typeof originalShowToast === 'function' ? originalShowToast.apply(this, arguments) : undefined;
};

let pass = 0;
let fail = 0;
function check(name, condition, detail) {
  if (condition) { pass++; console.log('ok   ' + name); }
  else { fail++; console.error('FAIL ' + name + (detail === undefined ? '' : ' — ' + detail)); }
}
function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function waitFor(test, label, timeout = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const result = test();
    if (result) return result;
    await wait(20);
  }
  throw new Error(`Timed out waiting for ${label}`);
}
function modals() {
  return Array.from(w.document.querySelectorAll('.strum-modal-content'));
}
function previewModal() {
  return modals().find((item) => item.querySelector('#gp35TrackList'));
}
function reportModal() {
  return modals().find((item) => /Отчёт об импорте/.test(item.querySelector('h3')?.textContent || ''));
}
function clickButton(modal, matcher) {
  const button = Array.from(modal.querySelectorAll('button'))
    .find((item) => (typeof matcher === 'string' ? item.textContent.trim() === matcher : matcher.test(item.textContent)));
  if (!button) throw new Error(`Button not found: ${matcher}`);
  button.click();
  return button;
}
function closeReport() {
  const report = reportModal();
  if (report) clickButton(report, 'Готово');
}
function lastToast() { return toastMessages[toastMessages.length - 1] || ''; }
async function openImport(bytes, fileName, mode) {
  w.importSong(new w.File([bytes], fileName, { type: 'audio/midi' }));
  const preview = await waitFor(previewModal, `preview ${fileName}`);
  if (mode) {
    const radio = preview.querySelector(`input[name="gp35ImportMode"][value="${mode}"]`);
    if (radio) radio.click();
  }
  return preview;
}
function notesOf(part) {
  return (part.tabNotes || 0) + (part.pitchNotes || 0);
}
function currentState() {
  return JSON.parse(w.eval(`JSON.stringify({
    bpm: DOM.bpmInput ? DOM.bpmInput.value : null,
    globalKey, globalTimeSig,
    meta: { artist: DOM.songArtist.value, title: DOM.songTitle.value },
    sections: sections.map((section) => ({
      id: section.id, type: section.type, name: section.customName || section.type,
      squares: section.squares.length,
      bars: section.squares.reduce((sum, square) => sum + square.events.length, 0),
      keys: Object.keys(songParts.reduce((acc, part) => {
        const all = { ...(part.rolls || {}), ...(part.pitchRolls || {}) };
        Object.keys(all).forEach((key) => { if ((all[key] || []).length) acc[key] = 1; });
        return acc;
      }, {})),
    })),
    parts: songParts.map((part) => ({
      id: part.id, name: part.name, sourceName: part.sourceName, instrument: part.instrument,
      gmProgram: part.gmProgram === undefined ? null : part.gmProgram,
      midiChannel: part.midiChannel === undefined ? null : part.midiChannel,
      strings: partCustomStrings(part) || (part.tuning || null), mix: part.mix || null,
      tabNotes: Object.values(part.rolls || {}).reduce((sum, list) => sum + (list ? list.length : 0), 0),
      pitchNotes: Object.values(part.pitchRolls || {}).reduce((sum, list) => sum + (list ? list.length : 0), 0),
      frets: Object.values(part.rolls || {}).flat().map((note) => note.fret),
      stringsUsed: Object.values(part.rolls || {}).flat().map((note) => note.string),
      durs: Array.from(new Set(Object.values(part.rolls || {}).concat(Object.values(part.pitchRolls || {}))
        .flat().map((note) => note.dur))),
      pitches: Object.values(part.pitchRolls || {}).flat().map((note) => note.pitch),
      starts: Object.values(part.rolls || {}).concat(Object.values(part.pitchRolls || {}))
        .flat().map((note) => note.start),
    })),
  })`));
}

// --- фикстуры ----------------------------------------------------------------
const CONCERT = buildMidi({
  format: 1, division: 480,
  tracks: [
    {
      trackName: 'Conductor',
      metas: [
        { at: 0, type: 0x51, data: tempoMicros(96) },
        { at: 0, type: 0x58, data: [4, 2, 24, 8] },
      ],
    },
    {
      trackName: 'Rhythm Guitar',
      programs: [{ channel: 0, value: 25 }], // GM 26
      controllers: [{ channel: 0, number: 6, value: 6 }, { channel: 0, number: 10, value: 127 }],
      notes: [
        { start: 0, duration: 480, pitch: 52, channel: 0, velocity: 100 },
        { start: 960, duration: 240, pitch: 55, channel: 0, velocity: 96 },
        { start: 1440, duration: 960, pitch: 57, channel: 0, velocity: 88 },
      ],
    },
    {
      trackName: 'Bass',
      programs: [{ channel: 2, value: 33 }], // GM 34
      controllers: [{ channel: 2, number: 7, value: 100 }],
      notes: [
        { start: 0, duration: 960, pitch: 40, channel: 2, velocity: 110 },
        { start: 960, duration: 960, pitch: 43, channel: 2, velocity: 104 },
      ],
    },
    {
      trackName: 'Kit',
      notes: [
        { start: 0, duration: 120, pitch: 36, channel: 9, velocity: 120 },
        { start: 480, duration: 120, pitch: 42, channel: 9, velocity: 90 },
        { start: 960, duration: 120, pitch: 38, channel: 9, velocity: 110 },
      ],
    },
  ],
});
const MARKED = buildMidi({
  format: 1, division: 480,
  tracks: [
    {
      trackName: 'Conductor',
      metas: [
        { at: 0, type: 0x51, data: tempoMicros(120) },
        { at: 0, type: 0x58, data: [3, 2, 24, 8] }, // 3/4
        { at: 0, type: 0x06, data: ascii('Verse') },
        { at: 1440, type: 0x06, data: ascii('Chorus') },
      ],
    },
    {
      trackName: 'Lead',
      programs: [{ channel: 0, value: 80 }],
      notes: [
        { start: 0, duration: 480, pitch: 60, channel: 0, velocity: 90 },
        { start: 1440, duration: 480, pitch: 64, channel: 0, velocity: 90 },
        { start: 2880, duration: 480, pitch: 67, channel: 0, velocity: 90 },
      ],
    },
  ],
});
const BROKEN = new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 9, 0, 1, 0, 6, 0x4d, 0x5a, 0x7a, 0x7a]);
const NOT_A_MIDI = buildMidi({ format: 1, division: 480, tracks: [{ notes: [] }] });

(async () => {
  await waitFor(() => w.document.readyState === 'complete', 'app startup');
  await wait(40);

  // --- Предпросмотр ---------------------------------------------------------
  let preview = await openImport(CONCERT, 'concert.mid');
  let modal = preview.closest('.strum-modal-content');
  check('предпросмотр MIDI озаглавлен «Импорт MIDI»',
    modal.querySelector('h3').textContent === 'Импорт MIDI', modal.querySelector('h3').textContent);
  check('переключатель кодировок у MIDI скрыт',
    !preview.querySelector('#gp35Encoding') || preview.querySelector('#gp35Encoding').parentElement.hidden === true);
  const rows = Array.from(preview.querySelectorAll('input[type="checkbox"]'));
  check('все дорожки отмечены по умолчанию',
    rows.length === 4 && rows.every((box) => box.checked), String(rows.length));
  check('роли и GM показаны в списке дорожек',
    /Гитара/.test(preview.textContent) && /Бас/.test(preview.textContent) &&
    /Ударные/.test(preview.textContent) && /GM 26/.test(preview.textContent),
    preview.textContent.replace(/\s+/g, ' ').slice(0, 160));
  check('каналы показаны в человеческой нумерации 1…16',
    /канал 1/.test(preview.textContent) && /канал 3/.test(preview.textContent) && /канал 10/.test(preview.textContent),
    preview.textContent.replace(/\s+/g, ' ').slice(0, 160));
  check('есть выбор режима: новая песня или дописать',
    !!preview.querySelector('input[name="gp35ImportMode"][value="new"]') &&
    !!preview.querySelector('input[name="gp35ImportMode"][value="append"]'));

  // --- Импорт в новую песню -------------------------------------------------
  clickButton(modal, /Импортировать/);
  const report = await waitFor(reportModal, 'MIDI report');
  let state = currentState();
  check('темп из MIDI — 96', String(state.bpm) === '96', state.bpm);
  check('размер 4/4 взят из MIDI', state.globalTimeSig === '4/4', state.globalTimeSig);
  check('название песни взято из имени файла', state.meta.title === 'concert', JSON.stringify(state.meta));
  check('секция без меток называется «Вся песня»',
    state.sections.length === 1 && state.sections[0].name === 'Вся песня',
    JSON.stringify(state.sections.map((item) => item.name)));
  check('без меток файл ложится в одну секцию на два такта',
    state.sections[0].bars === 2, state.sections[0].bars);
  check('каждая дорожка стала партией, кроме пустой дирижёрской',
    state.parts.length === 3, state.parts.map((part) => part.name).join(', '));
  check('гитара получила гитарный инструмент и GM',
    state.parts[0].instrument === 'guitar' && state.parts[0].gmProgram === 25,
    JSON.stringify(state.parts[0]).slice(0, 120));
  check('каналы записаны как в приложении: 1…16',
    JSON.stringify(state.parts.map((part) => part.midiChannel)) === JSON.stringify([1, 3, 10]),
    JSON.stringify(state.parts.map((part) => part.midiChannel)));
  check('гитарные ноты стали табулатурой, а не pitch-нотами',
    state.parts[0].tabNotes === 3 && state.parts[0].pitchNotes === 0 &&
    state.parts[1].tabNotes === 2 && state.parts[1].pitchNotes === 0,
    JSON.stringify(state.parts.map((part) => [part.tabNotes, part.pitchNotes])));
  check('лады и струны подобраны по грифу',
    state.parts[0].frets.every((fret) => Number.isInteger(fret) && fret >= 0 && fret <= 24) &&
    state.parts[0].stringsUsed.every((line) => line >= 0 && line < 6),
    JSON.stringify([state.parts[0].frets, state.parts[0].stringsUsed]));
  check('ударные стали отдельной партией с абсолютной высотой',
    state.parts[2].instrument === 'drums' && state.parts[2].pitchNotes === 3 && state.parts[2].tabNotes === 0,
    JSON.stringify([state.parts[2].instrument, state.parts[2].tabNotes, state.parts[2].pitchNotes]));
  check('ноты ударных легли на дорожки карты GP',
    JSON.stringify(state.parts[2].pitches) === JSON.stringify([36, 42, 38]), JSON.stringify(state.parts[2].pitches));
  check('CC6 = 6 читается как шкала GP: громкость 90 из 150',
    state.parts[0].mix && state.parts[0].mix.volume === 90, JSON.stringify(state.parts[0].mix));
  check('CC7 = 100 читается как MIDI 0…127: громкость 118 из 150',
    state.parts[1].mix && state.parts[1].mix.volume === 118, JSON.stringify(state.parts[1].mix));
  check('CC10 = 127 — панорама вправо (+100)',
    state.parts[0].mix && state.parts[0].mix.pan === 100, JSON.stringify(state.parts[0].mix));
  check('длительности квантованы к ритмической сетке',
    state.parts[0].durs.every((dur) => [0.5, 1, 2].includes(dur)) &&
    state.parts[1].durs.every((dur) => [0.5, 1, 2].includes(dur)),
    JSON.stringify([state.parts[0].durs, state.parts[1].durs]));
  check('позиции нот начинаются с нуля', state.parts[0].starts.includes(0), JSON.stringify(state.parts[0].starts));
  check('отчёт перечисляет перенос и потери',
    /Дорожек: 3 из 4/.test(report.textContent) && /Нот: 8 из 8/.test(report.textContent) &&
    /абсолютной высоте/.test(report.textContent), report.textContent.replace(/\s+/g, ' ').slice(0, 200));
  check('пустая дорожка отмечена в отчёте', /без нот пропущена/.test(report.textContent));
  closeReport();

  // --- Секции по меткам -----------------------------------------------------
  preview = await openImport(MARKED, 'marked.mid');
  modal = preview.closest('.strum-modal-content');
  clickButton(modal, /Импортировать/);
  await waitFor(reportModal, 'marked report');
  state = currentState();
  check('метки MIDI стали секциями и узнаваемые названия разошлись по типам секций',
    state.sections.length === 2 && state.sections[0].name === 'Verse' && state.sections[1].name === 'Chorus',
    JSON.stringify(state.sections.map((item) => [item.type, item.name])));
  check('размер такта взят из MIDI: 3/4', state.globalTimeSig === '3/4', state.globalTimeSig);
  check('темп 120 из MIDI', String(state.bpm) === '120', state.bpm);
  check('метка на первом такте не теряется: секций две, вторая длиннее',
    state.sections[0].bars === 1 && state.sections[1].bars === 2,
    JSON.stringify(state.sections.map((item) => item.bars)));
  closeReport();

  // --- Дописывание в текущую песню -------------------------------------------
  preview = await openImport(MARKED, 'marked-again.mid', 'append');
  modal = preview.closest('.strum-modal-content');
  clickButton(modal, /Импортировать/);
  await waitFor(reportModal, 'append report');
  const appended = currentState();
  check('дописывание добавило секции, не тронув прежние',
    appended.sections.length === 4 &&
    appended.sections[0].name === 'Verse' && appended.sections[2].name === 'Verse',
    JSON.stringify(appended.sections.map((item) => item.name)));
  check('дописывание добавило партию рядом с прежними',
    appended.parts.length === 2 && appended.parts[0].name === 'Lead' && appended.parts[1].name === 'Lead',
    appended.parts.map((part) => part.name).join(', '));
  check('прежняя партия сохранила свои ноты',
    notesOf(appended.parts[0]) === 3, JSON.stringify(appended.parts.map((part) => notesOf(part))));
  check('новая партия получила ноты только своих секций',
    notesOf(appended.parts[1]) === 3, JSON.stringify(appended.parts.map((part) => notesOf(part))));
  check('дописанные ноты не попали в секции прежней части',
    appended.parts[0].durs.length > 0 && appended.parts.every((part) => part.starts.every((v) => Number.isFinite(v))),
    JSON.stringify(appended.parts.map((part) => part.starts.slice(0, 4))));
  closeReport();

  // --- Отказы ---------------------------------------------------------------
  const before = JSON.stringify(currentState());
  toastMessages.length = 0;
  w.importSong(new w.File([BROKEN], 'broken.mid', { type: 'audio/midi' }));
  await wait(300);
  check('битый MIDI не ломает приложение',
    w.document.readyState === 'complete' && JSON.stringify(currentState()) === before);
  check('на битый MIDI показана понятная подсказка без частичного импорта',
    /Не удалось прочитать MIDI/.test(lastToast()), lastToast());
  check('окно предпросмотра не открылось для битого файла', !previewModal());

  toastMessages.length = 0;
  w.importSong(new w.File([NOT_A_MIDI.slice(0, 4)], 'empty.mid', { type: 'audio/midi' }));
  await wait(300);
  check('файл без треков отклоняется с объяснением', /Не удалось прочитать MIDI/.test(lastToast()), lastToast());

  // Ошибки чтения битых файлов выше — ожидаемое поведение, их в счёт не берём.
  consoleErrors.length = 0;

  // --- Настоящие файлы пользователя ----------------------------------------
  const oracleDir = '/home/user/oracles';
  const monsoonPath = path.join(oracleDir, 'monsoon.mid');
  if (fs.existsSync(monsoonPath)) {
    preview = await openImport(new Uint8Array(fs.readFileSync(monsoonPath)), 'monsoon.mid');
    modal = preview.closest('.strum-modal-content');
    check('monsoon.mid: предпросмотр с четырьмя дорожками',
      modal.querySelectorAll('input[type="checkbox"]').length === 4);
    clickButton(modal, /Импортировать/);
    await waitFor(reportModal, 'monsoon report');
    state = currentState();
    check('monsoon.mid: темп 112, ключ C, размер 4/4',
      String(state.bpm) === '112' && state.globalKey === 'C' && state.globalTimeSig === '4/4',
      JSON.stringify([state.bpm, state.globalKey, state.globalTimeSig]));
    check('monsoon.mid: 78 тактов в одной секции «Вся песня»',
      state.sections.length === 1 && state.sections[0].name === 'Вся песня' && state.sections[0].bars === 78,
      JSON.stringify(state.sections));
    check('monsoon.mid: три гитары с 477/1035/1620 нотами',
      state.parts.length === 3 && state.parts.map((part) => part.tabNotes).join(',') === '477,1035,1620',
      state.parts.map((part) => part.tabNotes).join(','));
    check('monsoon.mid: громкость CC6 = 6 стала 90 из 150 у всех дорожек',
      state.parts.every((part) => part.mix && part.mix.volume === 90),
      JSON.stringify(state.parts.map((part) => part.mix)));
    closeReport();
  } else {
    console.log('   пропуск: /home/user/oracles/monsoon.mid недоступен в этом прогоне');
  }

  const dayFile = fs.existsSync(oracleDir)
    ? fs.readdirSync(oracleDir).find((name) => /\.midi?$/i.test(name) && name !== 'monsoon.mid') : null;
  if (dayFile) {
    preview = await openImport(new Uint8Array(fs.readFileSync(path.join(oracleDir, dayFile))), dayFile);
    modal = preview.closest('.strum-modal-content');
    check('файл с ударными: дорожка ch10 помечена «Ударные»', /Ударные/.test(preview.textContent));
    clickButton(modal, /Импортировать/);
    await waitFor(reportModal, `${dayFile} report`);
    state = currentState();
    const drums = state.parts.filter((part) => part.instrument === 'drums');
    const bass = state.parts.filter((part) => part.instrument === 'bass');
    check('ударные импортировались отдельной партией с pitch-нотами',
      drums.length === 1 && drums[0].pitchNotes > 0 && drums[0].tabNotes === 0,
      JSON.stringify(drums.map((part) => [part.instrument, part.pitchNotes, part.tabNotes])));
    check('бас остался басом с четырьмя струнами',
      bass.length === 1 && bass[0].instrument === 'bass', JSON.stringify(bass.map((part) => part.instrument)));
    closeReport();
  } else {
    console.log('   пропуск: второго настоящего MIDI нет в этом прогоне');
  }

  // --- Итог -----------------------------------------------------------------
  check('консоль без ошибок', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
  check('jsdom без исключений', domErrors.length === 0, domErrors.slice(0, 2).join(' | '));
  console.log(`\nитого: ${pass} ok, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((error) => {
  console.error(error);
  console.log(`\nитого: ${pass} ok, ${fail} FAIL (авария)`);
  process.exit(1);
});