#!/usr/bin/env node
/*
 * b12-gp-import.js — B-12.9.3: offline GP3–GP5 import, encoding preview,
 * track selection, section/time-grid mapping, high frets, effects and overlay.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', '..', 'STRUCHORD.html'), 'utf8');
const runtimeTag = html.match(/<script\b[^>]*id="alphaTabRuntime"[^>]*type="text\/plain"[^>]*>/i);
const runtimeBody = runtimeTag && html.includes('alphaTab v1.8.4 (MPL-2.0)');
const domErrors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (error) => domErrors.push(String(error)));
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://localhost/',
  virtualConsole,
  beforeParse(win) {
    // alphaTab's GP string decoder uses the browser TextDecoder API.
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
  },
});
const w = dom.window;
const toastMessages = [];
const originalShowToast = w.showToast;
w.showToast = function (message) {
  toastMessages.push(String(message));
  return typeof originalShowToast === 'function' ? originalShowToast.apply(this, arguments) : undefined;
};
w.AudioContext = w.webkitAudioContext = function () {
  return {
    currentTime: 0, state: 'running', resume() {}, sampleRate: 44100,
    createBuffer: (channels, length) => ({ getChannelData: () => new Float32Array(length) }),
  };
};

let pass = 0;
let fail = 0;
function check(name, condition, detail) {
  if (condition) {
    pass++;
    console.log('ok   ' + name);
  } else {
    fail++;
    console.error('FAIL ' + name + (detail === undefined ? '' : ' — ' + detail));
  }
}
function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function waitFor(test, label, timeout = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = test();
    if (value) return value;
    await wait(20);
  }
  throw new Error(`Timed out waiting for ${label}`);
}
async function openImport(fileName) {
  const filePath = path.join(__dirname, 'fixtures', fileName);
  const bytes = fs.readFileSync(filePath);
  w.importSong(new w.File([bytes], fileName, { type: 'application/octet-stream' }));
  return waitFor(() => w.document.querySelector('#gp35TrackList'), `preview ${fileName}`);
}
function previewModal() {
  const trackList = w.document.querySelector('#gp35TrackList');
  return trackList && trackList.closest('.strum-modal-content');
}
function clickModalButton(modal, text) {
  const button = Array.from(modal.querySelectorAll('button')).find((item) => item.textContent.trim() === text);
  if (!button) throw new Error(`Button not found: ${text}`);
  button.click();
}
function closeReport() {
  const report = Array.from(w.document.querySelectorAll('.strum-modal-content'))
    .find((modal) => modal.querySelector('h3')?.textContent === 'Отчёт об импорте Guitar Pro');
  if (report) clickModalButton(report, 'Готово');
}
function songState() {
  return JSON.parse(w.eval(`JSON.stringify({
    metadata: { artist: DOM.songArtist.value, title: DOM.songTitle.value }, bpm: Number(DOM.bpmInput.value), globalKey, globalTimeSig, notes: DOM.notesArea.value,
    sections: sections.map((section) => ({
      id: section.id, type: section.type, customName: section.customName, timeSig: section.timeSig,
      squares: section.squares.map((square) => square.events.map((event) => ({ span: event.span, timeSig: event.timeSig }))),
    })),
    parts: songParts.map((part) => ({
      id: part.id, name: part.name, sourceName: part.sourceName, instrument: part.instrument,
      gmProgram: part.gmProgram, midiChannel: part.midiChannel, strings: part.strings,
      rolls: part.rolls, pitchRolls: part.pitchRolls,
    })),
    lastStoreCommand: songStore.log().slice(-1)[0]?.label,
  })`));
}
function loadSong(song) {
  w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
  w.loadSong(0);
}
function baselineSong() {
  return {
    schemaVersion: 6,
    metadata: { artist: 'Старый автор', title: 'Старая песня' },
    bpm: 100, globalKey: 'C', keyMode: 'manual', globalTimeSig: '4/4',
    tuning: 'e-std', tuningNotes: null, notes: 'Старые заметки', date: '2026-10-14',
    sections: [{
      id: 1, type: 'Verse', customName: null, key: null, shift: null,
      timeSig: null, bpm: null, repeat: 1,
      squares: [{ id: 2, repeat: 1, customBeats: 4, events: [
        { chord: 'Am', span: 4, timeSig: null },
      ] }],
    }],
    nextId: 50, rhythmPool: null, userFingerings: [], preferredFingerings: [],
    parts: [{
      id: 3, name: 'Старая партия', sourceName: 'Не менять', instrument: 'guitar',
      visible: true, tuning: null, rolls: { '1': [{ start: 0, dur: 1, string: 0, fret: 3 }] },
    }],
  };
}

(async () => {
  await waitFor(() => w.document.readyState === 'complete', 'application startup');
  await wait(50);
  check('alphaTab source is embedded inertly in the HTML', !!runtimeTag && !!runtimeBody &&
    !w.alphaTab, String(runtimeTag && runtimeBody && !!w.alphaTab));

  for (const [file, version] of [['sample-gp3.gp3', 'GP3.00'], ['sample-gp4.gp4', 'GP4.06']]) {
    const list = await openImport(file);
    const modal = previewModal();
    check(`${version} is detected and opens a preview`, modal && modal.textContent.includes(version), modal && modal.textContent.slice(0, 120));
    check(`${version} Russian text is auto-decoded as Windows-1251`,
      modal.textContent.includes('Русская песня') && modal.textContent.includes('Гитара') &&
      modal.querySelector('small').textContent.includes('Windows-1251'), modal.textContent.slice(0, 140));
    check(`${version} selects all source tracks by default`,
      Array.from(list.querySelectorAll('input[type="checkbox"]')).length === 3 &&
      Array.from(list.querySelectorAll('input[type="checkbox"]')).every((input) => input.checked));
    clickModalButton(modal, 'Отмена');
    await waitFor(() => !w.document.querySelector('#gp35TrackList'), `${version} preview closes`);
  }

  const list = await openImport('sample-gp5.gp5');
  let modal = previewModal();
  check('GP5 preview provides UTF-8 / Windows-1251 / Windows-1252 correction',
    ['auto', 'utf-8', 'windows-1251', 'windows-1252'].every((value) =>
      Array.from(modal.querySelector('#gp35Encoding').options).some((option) => option.value === value)));
  check('GP5 auto-detection recognizes Windows-1251 Russian metadata and names',
    modal.textContent.includes('Русская песня') && modal.textContent.includes('Клавиши') &&
    modal.querySelector('small').textContent.includes('Windows-1251'));
  check('GP5 preview classifies guitar, keys, and drums by label/staff',
    /Гитара/.test(list.textContent) && /Клавишные/.test(list.textContent) && /Ударные/.test(list.textContent), list.textContent);
  const encoding = modal.querySelector('#gp35Encoding');
  encoding.value = 'windows-1251';
  encoding.dispatchEvent(new w.Event('change', { bubbles: true }));
  await waitFor(() => modal.querySelector('small').textContent.includes('Windows-1251'), 'manual encoding reparse');
  check('manual encoding correction reparses labels without losing track selection',
    modal.textContent.includes('Клавиши') && Array.from(list.querySelectorAll('input[type="checkbox"]')).every((input) => input.checked));
  check('new song is the default destination and every track starts checked',
    modal.querySelector('input[name="gp35ImportMode"][value="new"]').checked &&
    Array.from(list.querySelectorAll('input[type="checkbox"]')).every((input) => input.checked));
  clickModalButton(modal, 'Импортировать');
  let report;
  try {
    report = await waitFor(() => Array.from(w.document.querySelectorAll('.strum-modal-content'))
      .find((item) => item.querySelector('h3')?.textContent === 'Отчёт об импорте Guitar Pro'), 'new song import report');
  } catch (error) {
    console.error('debug toast', toastMessages, 'overlay', w.document.querySelector('.strum-modal-overlay')?.textContent);
    throw error;
  }
  let state = songState();
  const guitar = state.parts.find((part) => part.instrument === 'guitar');
  const keys = state.parts.find((part) => part.instrument === 'keys');
  const drums = state.parts.find((part) => part.instrument === 'drums');
  const guitarNotes = Object.values(guitar?.rolls || {}).flat();
  const pitchNotes = Object.values(keys?.pitchRolls || {}).flat();
  const drumNotes = Object.values(drums?.pitchRolls || {}).flat();
  check('new song preserves Russian title/artist, tempo and section markers',
    state.metadata.title === 'Русская песня' && state.metadata.artist === 'Алексей' && state.bpm === 108 &&
    state.sections.length === 2 && state.sections[1].type === 'Chorus' && state.sections[1].timeSig === '3/4');
  check('new song imports each selected track into the independent role domain',
    state.parts.length === 3 && guitarNotes.length === 10 && pitchNotes.length === 10 && drumNotes.length === 10,
    JSON.stringify(state.parts.map((part) => [part.name, part.instrument, Object.values(part.rolls).flat().length, Object.values(part.pitchRolls).flat().length])));
  check('source names, channels and GM programs survive import',
    guitar?.sourceName === 'Гитара' && keys?.sourceName === 'Клавиши' && drums?.sourceName === 'Ударные' &&
    guitar?.midiChannel === 1 && keys?.midiChannel === 3 && drums?.midiChannel === 10 &&
    [guitar?.gmProgram, keys?.gmProgram, drums?.gmProgram].every((value) => Number.isInteger(value) && value >= 0 && value <= 127));
  check('high frets 25 and 30 are saved exactly, not clamped or removed',
    guitarNotes.some((note) => note.fret === 25) && guitarNotes.some((note) => note.fret === 30), JSON.stringify(guitarNotes.map((note) => note.fret)));
  check('high-fret bend curve transfers into the app bend model',
    guitarNotes.some((note) => note.fret === 30 && note.bend?.type === 'bend' &&
      JSON.stringify(note.bend.points) === JSON.stringify([[0, 0], [1, 1]])), JSON.stringify(guitarNotes.find((note) => note.fret === 30)));
  check('pitch notes retain absolute MIDI values and drum notes remain simultaneous pitch events',
    pitchNotes.every((note) => Number.isInteger(note.pitch) && note.pitch >= 0 && note.pitch <= 127) &&
    drumNotes.some((note) => note.pitch === 36) && drumNotes.some((note) => note.pitch === 38));
  check('GP dynamics map to optional velocity while the app default 90 stays implicit',
    pitchNotes.every((note) => note.velocity === 79) && drumNotes.every((note) => note.velocity === undefined));
  check('report separates transferred data from unsupported features and high frets',
    report.textContent.includes('Дорожек: 3 из 3') && report.textContent.includes('Нот: 30 из 30') &&
    report.textContent.includes('Ладов выше 24 сохранено: 2') && report.textContent.includes('Распознанных пометок/приёмов нот перенесено') &&
    report.textContent.includes('Динамики pitch-дорожек преобразованы в velocity'), report.textContent);
  closeReport();
  w.eval('togglePartsMode(true); renderPartsScreen()');
  check('high frets remain visible with the unplayable dashed style',
    w.document.querySelectorAll('.pt-note.is-unplayable').length >= 2,
    String(w.document.querySelectorAll('.pt-note.is-unplayable').length));
  w.eval('togglePartsMode(false)');

  // Overlay import: one existing measure receives the first source measure;
  // the extra GP measures become new sections after the existing material.
  loadSong(baselineSong());
  const original = songState();
  await openImport('sample-gp5.gp5');
  modal = previewModal();
  modal.querySelector('input[name="gp35ImportMode"][value="append"]').checked = true;
  clickModalButton(modal, 'Импортировать');
  const appendReport = await waitFor(() => Array.from(w.document.querySelectorAll('.strum-modal-content'))
    .find((item) => item.querySelector('h3')?.textContent === 'Отчёт об импорте Guitar Pro'), 'overlay import report');
  state = songState();
  check('append keeps original parts/sections and adds missing sections at the end',
    state.sections.length === 2 && state.sections[0].id === original.sections[0].id &&
    state.parts.length === 4 && state.parts[0].name === 'Старая партия' &&
    state.sections[1].type === 'Chorus' && state.sections[1].timeSig === '3/4', JSON.stringify({ sections: state.sections, parts: state.parts.map((part) => part.name) }));
  check('append overlays from the first bar and keeps old notes byte-for-byte',
    JSON.stringify(state.parts[0].rolls) === JSON.stringify(original.parts[0].rolls) &&
    state.parts.slice(1).every((part) => Object.keys(part.rolls).length + Object.keys(part.pitchRolls).length > 0));
  check('append adds source notes to the existing first section and preserves notes text',
    state.parts.slice(1).some((part) => Object.prototype.hasOwnProperty.call(part.rolls, '1') || Object.prototype.hasOwnProperty.call(part.pitchRolls, '1')) &&
    state.notes.includes('Старые заметки') && state.notes.includes('Текст'));
  check('append is one songStore command for undo and the report names moved/not-fit data',
    state.lastStoreCommand === 'gp/import-overlay' && appendReport.textContent.includes('Тактов: 3 из 3'), state.lastStoreCommand);
  closeReport();

  await openImport('sample-no-markers.gp5');
  modal = previewModal();
  check('a source with no section markers presents one continuous import',
    !modal.textContent.includes('Припев') && modal.textContent.includes('3 тактов'));
  clickModalButton(modal, 'Импортировать');
  const noMarkerReport = await waitFor(() => Array.from(w.document.querySelectorAll('.strum-modal-content'))
    .find((item) => item.querySelector('h3')?.textContent === 'Отчёт об импорте Guitar Pro'), 'no-marker import report');
  state = songState();
  check('a source without markers stays as one section with all three measures',
    state.sections.length === 1 && state.sections[0].squares.reduce((sum, events) => sum + events.length, 0) === 3 &&
    noMarkerReport.textContent.includes('одной секцией «Импорт»'));
  closeReport();

  await openImport('sample-invalid-meter.gp5');
  modal = previewModal();
  clickModalButton(modal, 'Импортировать');
  const invalidMeterReport = await waitFor(() => Array.from(w.document.querySelectorAll('.strum-modal-content'))
    .find((item) => item.querySelector('h3')?.textContent === 'Отчёт об импорте Guitar Pro'), 'invalid-meter report');
  state = songState();
  const importedBars = state.sections.reduce((sum, section) =>
    sum + section.squares.reduce((squareSum, events) => squareSum + events.length, 0), 0);
  check('an unrepresentable meter bar is omitted while later valid bars still import',
    importedBars === 2 && state.sections.length === 1, `bars=${importedBars}, sections=${state.sections.length}`);
  check('invalid-meter report distinguishes skipped geometry from representable unsupported meters',
    invalidMeterReport.textContent.includes('Тактов: 2 из 3; не поместилось 1') &&
    invalidMeterReport.textContent.includes('Геометрия 1 тактов не вмещается') &&
    !invalidMeterReport.textContent.includes('музыкальная длина сохранена'), invalidMeterReport.textContent);
  closeReport();

  check('lazy parser remains local (no external alphaTab script/link dependency)',
    !Array.from(w.document.querySelectorAll('script[src],link[rel="preload"]')).some((node) => /alphaTab/i.test(node.src || node.href || '')));
  check('no uncaught jsdom errors during GP parsing/rendering', domErrors.length === 0, domErrors.slice(0, 3).join(' | '));

  console.log(`\nитого: ${pass} ok, ${fail} FAIL`);
  dom.window.close();
  process.exit(fail ? 1 : 0);
})().catch((error) => {
  console.error(error.stack || error);
  dom.window.close();
  process.exit(1);
});
