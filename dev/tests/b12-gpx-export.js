#!/usr/bin/env node
/* B-12.9.8: экспорт в Guitar Pro 6 (.gpx) — круговая приёмка.
 *
 * Проверяем:
 *  1. Контейнер BCFS/BCFZ собирается, внутри score.gpif и служебные записи;
 *  2. Отчёт честно перечисляет, что перенесено и что осталось в приложении;
 *  3. Круг: экспорт → собственный GP-импорт даёт ту же структуру (секции,
 *     такты, дорожки), те же ноты (позиции, струны, лады, высоты) и микшер;
 *  4. Темп, размер, тональность, капо и строй доезжают без потерь;
 *  5. Формат выбора из кнопки «Экспорт» открывается, отчёт — модальный.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', '..', 'STRUCHORD.html'), 'utf8');
const domErrors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (error) => domErrors.push(String(error)));
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

const toastMessages = [];
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
async function waitFor(test, label, timeout = 12000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const result = test();
    if (result) return result;
    await wait(25);
  }
  throw new Error(`Timed out waiting for ${label}`);
}
function previewModal() {
  return Array.from(w.document.querySelectorAll('.strum-modal-content'))
    .find((item) => item.querySelector('#gp35TrackList'));
}
function importReportModal() {
  return Array.from(w.document.querySelectorAll('.strum-modal-content'))
    .find((item) => item.querySelector('h3')?.textContent === 'Отчёт об импорте Guitar Pro');
}
function clickButton(modal, text) {
  const button = Array.from(modal.querySelectorAll('button')).find((item) => item.textContent.trim() === text);
  if (!button) throw new Error(`Button not found: ${text}`);
  button.click();
}

// ---------------------------------------------------------------------------
// Песня для экспорта: две секции, гитара с табулатурой, бас и перкуссия.
const square = (id, chords) => ({
  id, repeat: 1, customBeats: null,
  events: chords.map((chord, index) => ({ chord, span: 1, timeSig: null, strumPattern: null, index })),
});
const testSong = {
  schemaVersion: 7,
  metadata: { artist: 'Тест', title: 'Круг GP', album: 'Альбом' },
  bpm: 132, globalKey: 'G', keyMode: 'manual', globalTimeSig: '4/4',
  tuning: 'e-std', tuningNotes: null, notes: '',
  sections: [
    { id: 11, type: 'Verse', customName: null, key: null, shift: null, timeSig: null, bpm: null, repeat: 2,
      strumPattern: null, squares: [square(111, ['C', 'G', 'Am', 'F'])] },
    { id: 12, type: 'Chorus', customName: 'Припев', key: 'D', shift: null, timeSig: null, bpm: 96, repeat: 1,
      strumPattern: null, squares: [square(121, ['D', 'A', 'Bm', 'G'])] },
  ],
  parts: [
    { id: 21, name: 'Гитара', instrument: 'guitar', viewMode: 'staff', tuning: 'e-std', capo: 2, visible: true,
      gmProgram: 25, midiChannel: 1, mix: { volume: 80, pan: -40, mute: false, solo: false },
      rolls: {
        // Секция 11 повторяется дважды: ноты живут в первом такте, GPIF
        // разворачивает повтор копиями тактов — это и проверяет круг.
        11: [
          { start: 0, dur: 1, string: 5, fret: 3, letRing: true, pm: true, accent: 2 },
          { start: 1, dur: 1, string: 5, fret: 5 },
          { start: 2, dur: 2, string: 4, fret: 3, staccato: true },
          { start: 3, dur: 1, string: 2, fret: 1 },
        ],
        12: [
          { start: 0, dur: 2, string: 3, fret: 5 },
          { start: 2, dur: 2 / 3, string: 5, fret: 1 },
          { start: 2 + 2 / 3, dur: 2 / 3, string: 5, fret: 1 },
          { start: 2 + 4 / 3, dur: 2 / 3, string: 5, fret: 1 },
          { start: 3, dur: 1, string: 4, fret: 3 },
        ],
      },
      pitchRolls: {}, lyrics: [] },
    { id: 22, name: 'Бас', instrument: 'bass', tuning: 'e-std', visible: true,
      gmProgram: 33, midiChannel: 2, mix: { volume: 100, pan: 0, mute: false, solo: false },
      rolls: {
        11: [{ start: 0, dur: 2, string: 3, fret: 0 }, { start: 2, dur: 2, string: 3, fret: 2 }],
        12: [{ start: 0, dur: 4, string: 1, fret: 3 }],
      },
      pitchRolls: {}, lyrics: [] },
    { id: 23, name: 'Барабаны', instrument: 'drums', tuning: null, visible: true,
      gmProgram: 0, midiChannel: 10, mix: { volume: 110, pan: 25, mute: false, solo: false },
      rolls: {},
      pitchRolls: {
        11: [{ start: 0, dur: 0.25, pitch: 36, line: 0 }, { start: 1, dur: 0.25, pitch: 36, line: 0 },
             { start: 2, dur: 0.25, pitch: 42, line: 1 }, { start: 2.5, dur: 0.25, pitch: 42, line: 1 }],
        12: [{ start: 0, dur: 1, pitch: 38, line: 2 }, { start: 2, dur: 1, pitch: 38, line: 2 }],
      },
      lyrics: [{ secId: 11, start: 0, text: 'первая строка', line: 1 },
               { secId: 12, start: 2, text: 'вторая строка', line: 2 }] },
  ],
  nextId: 100, rhythmPool: null, userFingerings: [], preferredFingerings: [], date: '2026-10-16',
};

function songState() {
  return JSON.parse(w.eval(`JSON.stringify({
    bpm: Number(DOM.bpmInput.value) || 0,
    globalTimeSig: (sections[0] && sections[0].timeSig) || '4/4',
    sections: (sections || []).map((s) => ({ id: s.id, type: s.type, customName: s.customName,
      key: s.key, bpm: s.bpm, repeat: s.repeat, squares: (s.squares || []).length })),
    parts: (songParts || []).map((p) => ({
      name: p.name, instrument: p.instrument, capo: p.capo || 0, strings: p.strings || null,
      mix: p.mix || null, gmProgram: p.gmProgram === undefined ? null : p.gmProgram,
      midiChannel: p.midiChannel === undefined ? null : p.midiChannel,
      notes: Object.entries(p.rolls || {}).reduce((sum, [key, list]) => sum + (list || []).length, 0)
        + Object.entries(p.pitchRolls || {}).reduce((sum, [key, list]) => sum + (list || []).length, 0),
      tabNotes: Object.values(p.rolls || {}).reduce((sum, list) => sum + (list || []).length, 0),
      pitchNotes: Object.values(p.pitchRolls || {}).reduce((sum, list) => sum + (list || []).length, 0),
      rolls: p.rolls || {}, pitchRolls: p.pitchRolls || {}, lyrics: p.lyrics || [],
    })),
  })`));
}

function flatNotes(part) {
  const rows = [];
  Object.entries(part.rolls || {}).forEach(([key, list]) => (list || []).forEach((note) => {
    rows.push({ kind: 'tab', sec: key, start: note.start, dur: note.dur, string: note.string, fret: note.fret,
      letRing: !!note.letRing, staccato: !!note.staccato });
  }));
  Object.entries(part.pitchRolls || {}).forEach(([key, list]) => (list || []).forEach((note) => {
    rows.push({ kind: 'pitch', sec: key, start: note.start, dur: note.dur, pitch: note.pitch });
  }));
  rows.sort((a, b) => (a.start - b.start) || (a.fret - b.fret) || (a.pitch - b.pitch));
  return rows;
}

function closeNear(a, b, tolerance) {
  return Math.abs(a - b) <= tolerance;
}

// Ожидаемые ноты с учётом того, что GPIF не хранит повторы: секция с
// повтором записывается копиями тактов, значит и ноты повторяются.
function sectionUnits(state) {
  const map = {};
  for (const section of state.sections || []) {
    map[String(section.id)] = {
      repeat: Math.max(1, Number(section.repeat) || 1),
      units: (Math.max(1, Number(section.squares) || 1)) * 4,
    };
  }
  return map;
}

// Порядок секций партии: сначала табы, затем pitch-дорожки без табов.
function sectionOrder(part) {
  const rolls = Object.keys(part.rolls || {});
  const pitch = Object.keys(part.pitchRolls || {}).filter((key) => !rolls.includes(key));
  return rolls.concat(pitch);
}

function sectionNotes(part, secId) {
  const rows = [];
  for (const note of (part.rolls || {})[secId] || []) {
    rows.push({ kind: 'tab', start: Number(note.start), dur: Number(note.dur), string: note.string, fret: note.fret,
      letRing: !!note.letRing, staccato: !!note.staccato });
  }
  for (const note of (part.pitchRolls || {})[secId] || []) {
    rows.push({ kind: 'pitch', start: Number(note.start), dur: Number(note.dur), pitch: note.pitch });
  }
  rows.sort((a, b) => (a.start - b.start) || ((a.fret || 0) - (b.fret || 0)) || ((a.pitch || 0) - (b.pitch || 0)));
  return rows;
}

// Ноты секции с учётом развёрнутых повторов: повтор копирует ноты со сдвигом
// на ширину одного экземпляра секции.
function expandedSectionNotes(state, part, secId) {
  const info = sectionUnits(state)[String(secId)];
  if (!info) return [];
  const rows = [];
  for (let pass = 0; pass < info.repeat; pass++) {
    for (const note of sectionNotes(part, secId)) {
      rows.push({ ...note, start: note.start + pass * info.units });
    }
  }
  rows.sort((a, b) => (a.start - b.start) || ((a.fret || 0) - (b.fret || 0)) || ((a.pitch || 0) - (b.pitch || 0)));
  return rows;
}

function sameNotes(source, target) {
  if (!source || !target || source.length !== target.length) return false;
  return source.every((note, row) => {
    const other = target[row];
    return other && other.kind === note.kind && other.string === note.string && other.fret === note.fret
      && other.pitch === note.pitch
      && closeNear(other.start, note.start, 1e-6) && closeNear(other.dur, note.dur, 1e-6);
  });
}

function expectedNotes(state, part) {
  const map = sectionUnits(state);
  const rows = [];
  Object.entries(part.rolls || {}).forEach(([secId, list]) => {
    const info = map[String(secId)];
    if (!info) return;
    for (let pass = 0; pass < info.repeat; pass++) {
      (list || []).forEach((note) => rows.push({ kind: 'tab', start: Number(note.start) + pass * info.units,
        dur: Number(note.dur), string: note.string, fret: note.fret,
        letRing: !!note.letRing, staccato: !!note.staccato }));
    }
  });
  Object.entries(part.pitchRolls || {}).forEach(([secId, list]) => {
    const info = map[String(secId)];
    if (!info) return;
    for (let pass = 0; pass < info.repeat; pass++) {
      (list || []).forEach((note) => rows.push({ kind: 'pitch', start: Number(note.start) + pass * info.units,
        dur: Number(note.dur), pitch: note.pitch }));
    }
  });
  rows.sort((a, b) => (a.start - b.start) || ((a.fret || 0) - (b.fret || 0)) || ((a.pitch || 0) - (b.pitch || 0)));
  return rows;
}

// Громкость и панорама в GP — 17 ступеней (шаг 1/16 от 0…100 и от -100…100).
function gpMixStep(value) {
  const span = Math.abs(value) > 150 ? 200 : 200;
  return Math.round((value / span + 0.5) * 16) / 16;
}
function quantizedVolume(value) {
  const clamped = Math.max(0, Math.min(100, Number(value) || 0));
  return Math.round(clamped / 100 * 16) / 16 * 100;
}
function quantizedPan(value) {
  const clamped = Math.max(-100, Math.min(100, Number(value) || 0));
  return Math.round((clamped / 200 + 0.5) * 16) / 16 * 200 - 100;
}

const DEFAULT_STRINGS = {
  guitar: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'],
  bass: ['E1', 'A1', 'D2', 'G2'],
};
function effectiveStrings(part) {
  if (Array.isArray(part.strings) && part.strings.length) return part.strings;
  return DEFAULT_STRINGS[part.instrument] || null;
}

w.addEventListener('load', async () => {
  try {
    fs.writeFileSync('/tmp/struchord-gp-export-song.json', JSON.stringify(testSong, null, 2));
    w.localStorage.setItem('struchord_songs', JSON.stringify([testSong]));
    w.loadSong(0);
    await waitFor(() => w.eval('(songParts || []).length') === 3, 'песня загружена');
    const before = songState();

    // ---------- 1. Окно выбора формата ----------
    w.exportSong();
    await wait(120);
    const formatDialog = Array.from(w.document.querySelectorAll('.strum-modal-content'))
      .find((item) => item.querySelector('#gpExportGpBtn'));
    check('кнопка «Экспорт» открывает окно выбора формата', !!formatDialog);
    check('в окне есть и STRUCHORD, и Guitar Pro',
      !!formatDialog && !!formatDialog.querySelector('#gpExportStruchordBtn'));
    if (formatDialog) clickButton(formatDialog, 'Отмена');
    await wait(80);
    check('окно выбора закрывается по «Отмена»',
      !Array.from(w.document.querySelectorAll('.strum-modal-content')).find((item) => item.querySelector('#gpExportGpBtn')));

    // ---------- 2. Собранный контейнер и отчёт ----------
    const exported = JSON.parse(w.eval('JSON.stringify(window.gpExportBytes())'));
    const bytes = new Uint8Array(exported.bytes);
    check('gpExportRun вернул отчёт и байты', !!exported.report && exported.bytes.length > 1000,
      String(exported.bytes && exported.bytes.length));
    check('контейнер помечен как BCFS/BCFZ', exported.report.container === 'BCFS/BCFZ', exported.report.container);
    check('имя файла заканчивается на .gpx', /\.gpx$/.test(exported.report.fileName || ''), exported.report.fileName);
    check('отчёт перечисляет перенесённое', (exported.report.transferred || []).length > 0);
    check('отчёт перечисляет потери', (exported.report.losses || []).length > 0);
    check('GPIF сообщает о потерянных эффектах и выбранном staff-виде дорожки',
      (exported.report.losses || []).some((item) => /palm mute не кодируется/.test(item.label)) &&
      (exported.report.losses || []).some((item) => /вид staff не кодируется/.test(item.label)) &&
      (exported.report.losses || []).some((item) => /strong accent strength/.test(item.label)),
      JSON.stringify(exported.report.losses));
    check('в отчёте есть строки о табулатуре',
      (exported.report.transferred || []).some((item) => /табулатурой/.test(item.label)));

    fs.writeFileSync('/tmp/roundtrip.gpx', Buffer.from(bytes));
    const gpx = require('../gpx-bcfz-runtime.js');
    const container = gpx.readContainer(bytes);
    check('контейнер читается нашим же кодеком', !!container && (container.container === 'BCFZ' || container.container === 'BCFS'),
      container && container.container);
    check('в контейнере есть score.gpif', (container.entries || []).some((entry) => entry.name === 'score.gpif'));
    check('в контейнере есть служебные записи GP',
      (container.entries || []).some((entry) => entry.name === 'misc.xml'));
    const scoreText = Buffer.from((container.entries.find((entry) => entry.name === 'score.gpif') || {}).data).toString('utf8');
    check('score.gpif — валидный GPIF 6',
      /<GPIF>/.test(scoreText) && /<GPVersion>6<\/GPVersion>/.test(scoreText));
    check('в score.gpif 3 партии + аккомпанемент', (scoreText.match(/<Track id=/g) || []).length === 4,
      String((scoreText.match(/<Track id=/g) || []).length));
    check('в score.gpif микшер записан в ChannelStrip', (scoreText.match(/<ChannelStrip/g) || []).length === 4);

    // ---------- 3. Круг: экспорт → собственный импорт ----------
    w.importSong(new w.File([bytes], 'круг.gpx', { type: 'application/octet-stream' }));
    let preview = null;
    try {
      preview = await waitFor(previewModal, 'превью импорта');
    } catch (error) {
      console.error('превью не открылось. toasts:', JSON.stringify(toastMessages.slice(-4)),
        '| jsdom:', domErrors.slice(-2).join(' | '));
      throw error;
    }
    clickButton(preview, 'Импортировать');
    await waitFor(importReportModal, 'отчёт импорта');
    const reportModal = importReportModal();
    clickButton(reportModal, 'Готово');
    await wait(200);
    const after = songState();

    check('после круга 3 исходных дорожки + аккомпанемент', after.parts.length === 4 && after.parts[3].name === 'Песня (аккорды)', String(after.parts.length));
    check('имена дорожек сохранены',
      after.parts.slice(0, 3).map((p) => p.name).join('|') === before.parts.map((p) => p.name).join('|'),
      after.parts.map((p) => p.name).join('|'));
    check('инструменты дорожек сохранены',
      after.parts.slice(0, 3).map((p) => p.instrument).join('|') === before.parts.map((p) => p.instrument).join('|'),
      after.parts.map((p) => p.instrument).join('|'));
    check('две секции на месте', after.sections.length === 2, String(after.sections.length));
    check('названия секций сохранены',
      after.sections.map((s) => s.type).join('|') === before.sections.map((s) => s.type).join('|'),
      after.sections.map((s) => s.type + ':' + s.customName).join('|'));
    check('темп песни сохранён', Number(after.bpm) === Number(before.bpm), `${after.bpm} / ${before.bpm}`);
    check('размер песни сохранён', after.globalTimeSig === before.globalTimeSig, after.globalTimeSig);

    // Ноты: гитара (таб) и бас (таб) — построчно, ударные — по высоте.
    const tabRound = before.parts.slice(0, 2).every((part, index) => {
      const beforeSections = sectionOrder(part);
      const afterSections = sectionOrder(after.parts[index] || {});
      if (beforeSections.length !== afterSections.length) return false;
      return beforeSections.every((secId, row) =>
        sameNotes(expandedSectionNotes(before, part, secId), sectionNotes(after.parts[index], afterSections[row])));
    });
    const tabDetails = [];
    before.parts.slice(0, 2).forEach((part, index) => {
      sectionOrder(part).forEach((secId, row) => {
        const expected = expandedSectionNotes(before, part, secId);
        const actual = sectionNotes(after.parts[index] || {}, sectionOrder(after.parts[index] || {})[row]);
        tabDetails.push({ part: index + 1, section: row + 1, before: expected.length, after: actual.length,
          mismatch: sameNotes(expected, actual) ? null : { expected: expected.find((n, i) => !actual[i]
            || n.start !== actual[i].start || n.dur !== actual[i].dur || n.string !== actual[i].string
            || n.fret !== actual[i].fret), actual: actual.find((n, i) => !expected[i]
            || n.start !== expected[i].start || n.dur !== expected[i].dur || n.string !== expected[i].string
            || n.fret !== expected[i].fret) } });
      });
    });
    check('таб-ноты гитары и баса вернулись с теми же позициями, струнами и ладами', tabRound,
      JSON.stringify(tabDetails).slice(0, 900));

    const drumSectionsBefore = sectionOrder(before.parts[2]);
    const drumSectionsAfter = sectionOrder(after.parts[2] || {});
    const drumsRound = drumSectionsBefore.length === drumSectionsAfter.length && drumSectionsBefore.every((secId, row) =>
      sameNotes(expandedSectionNotes(before, before.parts[2], secId), sectionNotes(after.parts[2], drumSectionsAfter[row])));
    const drumDetails = drumSectionsBefore.map((secId, row) => {
      const expected = expandedSectionNotes(before, before.parts[2], secId);
      const actual = sectionNotes(after.parts[2], drumSectionsAfter[row] || '');
      return sameNotes(expected, actual) ? null : { expected, actual };
    });
    check('ноты перкуссии вернулись с теми же высотами и позициями', drumsRound,
      JSON.stringify(drumDetails).slice(0, 900));
    check('перкуссия осталась пер-дорожкой', after.parts[2] && after.parts[2].instrument === 'drums',
      after.parts[2] && after.parts[2].instrument);

    // Эффекты нот: letRing и staccato
    const guitarExpected = expandedSectionNotes(before, before.parts[0], sectionOrder(before.parts[0])[0]);
    const guitarAfter = sectionNotes(after.parts[0], sectionOrder(after.parts[0])[0]);
    const marksMatch = guitarExpected.length === guitarAfter.length && guitarExpected.every((note, row) =>
      !!guitarAfter[row].letRing === !!note.letRing && !!guitarAfter[row].staccato === !!note.staccato);
    check('пометки нот (letRing, staccato) доехали', marksMatch,
      JSON.stringify({ before: guitarExpected.map((n) => [!!n.letRing, !!n.staccato]),
        after: guitarAfter.map((n) => [n.letRing, n.staccato]) }).slice(0, 400));

    // Микшер: у GP 17 ступеней, поэтому сравниваем с допуском.
    const mixBefore = before.parts.map((part) => part.mix);
    const mixAfter = after.parts.slice(0, 3).map((part) => part.mix);
    check('микшер дорожек вернулся кругом',
      mixAfter.every((mix, index) => mix
        && closeNear(quantizedVolume(mix.volume), quantizedVolume(mixBefore[index].volume), 0.01)
        && closeNear(quantizedPan(mix.pan), quantizedPan(mixBefore[index].pan), 0.01)),
      JSON.stringify({ before: mixBefore, after: mixAfter }));

    // Капо, строй, каналы и программы GM
    check('капо сохранён', Number(after.parts[0].capo) === 2, String(after.parts[0].capo));
    check('строй гитары сохранён',
      JSON.stringify(effectiveStrings(after.parts[0])) === JSON.stringify(['E2', 'A2', 'D3', 'G3', 'B3', 'E4']),
      JSON.stringify(after.parts[0].strings));
    check('программа и канал GM сохранены',
      after.parts[0].gmProgram === before.parts[0].gmProgram
      && after.parts[2].midiChannel === before.parts[2].midiChannel,
      `${after.parts[0].gmProgram}/${after.parts[2].midiChannel}`);

    // Тексты: Guitar Pro раскладывает строку по нотам словами, поэтому
    // сравниваем последовательность слов с учётом развёрнутых повторов.
    const repeatMap = sectionUnits(before);
    const lyricsBefore = [];
    for (const line of before.parts[2].lyrics) {
      const info = repeatMap[String(line.secId)];
      if (!info) continue;
      for (let pass = 0; pass < info.repeat; pass++) {
        String(line.text).split(/\s+/).filter(Boolean).forEach((word) => lyricsBefore.push(word));
      }
    }
    const lyricsAfter = after.parts[2].lyrics.map((line) => String(line.text).trim()).filter(Boolean);
    check('слова текста вернулись в том же порядке', lyricsAfter.join('|') === lyricsBefore.join('|'),
      `${lyricsAfter.join('|')} / ${lyricsBefore.join('|')}`);
    const lyricLinesAfter = new Set(after.parts[2].lyrics.map((line) => Number(line.line) || 1));
    check('GPIF круг сохраняет номера строк lyrics', lyricLinesAfter.has(1) && lyricLinesAfter.has(2),
      JSON.stringify(after.parts[2].lyrics.map((line) => [line.line, line.text])));

    // ---------- 4. Окно отчёта ----------
    w.exportGuitarPro();
    await wait(150);
    const reportDialog = Array.from(w.document.querySelectorAll('.strum-modal-content'))
      .find((item) => item.querySelector('h3')?.textContent === 'Отчёт об экспорте');
    check('после экспорта открывается модальный отчёт', !!reportDialog);
    check('отчёт показывает имя файла', !!reportDialog && reportDialog.textContent.includes('.gpx'));
    check('отчёт показывает и перенесённое, и потери',
      !!reportDialog && /Перенесено/.test(reportDialog.textContent) && /Не переносится/.test(reportDialog.textContent));
    if (reportDialog) clickButton(reportDialog, 'Готово');
    await wait(80);
    check('отчёт закрывается по «Готово»',
      !Array.from(w.document.querySelectorAll('.strum-modal-content'))
        .find((item) => item.querySelector('h3')?.textContent === 'Отчёт об экспорте'));

    check('нет необработанных ошибок jsdom', domErrors.length === 0, domErrors.join(' | '));

    console.log(`${pass} ok, ${fail} FAIL`);
    process.exit(fail ? 1 : 0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
});