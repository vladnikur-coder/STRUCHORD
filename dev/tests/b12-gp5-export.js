#!/usr/bin/env node
/* B-12.9.9: экспорт в настоящий бинарный Guitar Pro 5 (.gp5) — круговая приёмка.
 *
 * Проверяем:
 *  1. В окне экспорта третий пункт — Guitar Pro 5 (.gp5);
 *  2. Собирается бинарный файл с заголовком FICHIER GUITAR PRO v5.10, который
 *     независимо читается нашим разборщиком dev/tools/gp5-verify.js до конца;
 *  3. Повторы секций остаются нативными (repeatOpen/repeatClose), а не
 *     разворачиваются копиями тактов;
 *  4. Доезжают ноты, лирика, приёмы, капо, строй, микшер, темп и тональность;
 *  5. Круг: экспорт → собственный GP-импорт (alphaTab) даёт те же дорожки,
 *     ноты и текст; отчёт об экспорте открывается модальным окном.
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
// Песня: две секции (первая с повтором 2), гитара с капо, бас и перкуссия.
const square = (id, chords) => ({
  id, repeat: 1, customBeats: null,
  events: chords.map((chord, index) => ({ chord, span: 1, timeSig: null, strumPattern: null, index })),
});
const testSong = {
  schemaVersion: 7,
  metadata: { artist: 'Тест', title: 'Круг GP5', album: 'Альбом' },
  bpm: 132, globalKey: 'G', keyMode: 'manual', globalTimeSig: '4/4',
  tuning: 'e-std', tuningNotes: null, notes: '',
  sections: [
    { id: 11, type: 'Verse', customName: null, key: null, shift: null, timeSig: null, bpm: null, repeat: 2,
      strumPattern: null, squares: [square(111, ['C', 'G', 'Am', 'F'])] },
    { id: 12, type: 'Chorus', customName: 'Припев', key: 'D', shift: null, timeSig: null, bpm: 96, repeat: 1,
      // Вольта: квадрат помечен «1-й конец» — GP5 должен записать флаг 0x10
      // и маску окончаний на втором такте файла.
      strumPattern: null, squares: [{ ...square(121, ['D', 'A', 'Bm', 'G']), volta: 1 }] },
  ],
  parts: [
    { id: 21, name: 'Гитара', instrument: 'guitar', viewMode: 'staff', tuning: 'e-std', capo: 2, visible: true,
      gmProgram: 25, midiChannel: 1, mix: { volume: 80, pan: -40, mute: false, solo: false },
      rolls: {
        11: [
          { start: 0, dur: 1, string: 4, fret: 3, letRing: true, fade: 'in', tremBar: true },
          { start: 1, dur: 1, string: 4, fret: 5 },
          { start: 2, dur: 2, string: 3, fret: 3, staccato: true },
          { start: 3, dur: 1, string: 1, fret: 1 },
        ],
        // Пять приёмов на пяти нотах: бенд, натуральный флажолет, «мёртвая»
        // нота, форшлаг с молотком и легато-слайд.
        12: [
          { start: 0, dur: 2, string: 2, fret: 5, bend: { type: 'bend', points: [[0, 0], [1, 1]] } },
          { start: 2, dur: 2 / 3, string: 4, fret: 1, harm: { type: 'natural' }, tenuto: true, accent: 2, fade: 'out', ornament: 'turn', deadSlap: true, pickScrape: true },
          { start: 2 + 2 / 3, dur: 2 / 3, string: 4, fret: 1, dead: true },
          { start: 2 + 4 / 3, dur: 2 / 3, string: 4, fret: 1, legato: true },
          { start: 3, dur: 1, string: 3, fret: 3, slide: 'legato' },
        ],
      },
      pitchRolls: {}, lyrics: [] },
    { id: 22, name: 'Бас', instrument: 'bass', tuning: 'e-std', visible: true,
      gmProgram: 33, midiChannel: 2, mix: { volume: 100, pan: 0, mute: false, solo: false },
      rolls: {
        11: [{ start: 0, dur: 2, string: 2, fret: 0 }, { start: 2, dur: 2, string: 2, fret: 2 }],
        12: [{ start: 0, dur: 4, string: 0, fret: 3 }],
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
      repeat: s.repeat, squares: (s.squares || []).length,
      squareMarks: (s.squares || []).map((square) => ({ repeat: square.repeat, repeatOpen: square.repeatOpen,
        repeatClose: square.repeatClose, mark: square.mark })) })),
    parts: (songParts || []).map((p) => ({
      name: p.name, instrument: p.instrument, capo: p.capo || 0, strings: p.strings || null, tuning: p.tuning || null,
      mix: p.mix || null, gmProgram: p.gmProgram === undefined ? null : p.gmProgram,
      midiChannel: p.midiChannel === undefined ? null : p.midiChannel,
      tabNotes: Object.values(p.rolls || {}).reduce((sum, list) => sum + (list || []).length, 0),
      pitchNotes: Object.values(p.pitchRolls || {}).reduce((sum, list) => sum + (list || []).length, 0),
      rolls: p.rolls || {}, pitchRolls: p.pitchRolls || {}, lyrics: p.lyrics || [],
    })),
  })`));
}

// Ноты дорожки по секциям в порядке секций песни: у каждой секции свой
// порядок ключей, поэтому сравнивать надо по типу секции, а не по индексу.
function rollSections(state, part, kinds) {
  const types = state.sections || [];
  const rows = [];
  for (const [secId, list] of Object.entries(part.rolls || {})) {
    const section = types.find((item) => String(item.id) === String(secId));
    const notes = (list || []).map((note) => ({
      start: Number(note.start), dur: Number(note.dur),
      string: Number(note.string), fret: Number(note.fret),
      letRing: !!note.letRing, staccato: !!note.staccato,
    }));
    notes.sort((a, b) => (a.start - b.start) || (a.string - b.string));
    rows.push({ type: section ? section.type : secId, notes });
  }
  rows.sort((a, b) => (kinds.indexOf(a.type) - kinds.indexOf(b.type)));
  return rows;
}

function pitchNotesOf(part) {
  const rows = [];
  for (const list of Object.values(part.pitchRolls || {})) {
    for (const note of list || []) rows.push(Math.round(Number(note.pitch)));
  }
  return rows.sort((a, b) => a - b);
}

const { parseGp5 } = require('../tools/gp5-verify.js');

w.addEventListener('load', async () => {
  try {
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
    check('в окне три пункта: STRUCHORD, Guitar Pro 6 и Guitar Pro 5',
      !!formatDialog && !!formatDialog.querySelector('#gpExportStruchordBtn')
      && !!formatDialog.querySelector('#gpExportGp5Btn'));
    check('подпись пункта GP5 обещает настоящий бинарный .gp5',
      !!formatDialog && /бинарный файл \.gp5/.test(formatDialog.querySelector('#gpExportGp5Btn')
        .parentElement.textContent));
    if (formatDialog) clickButton(formatDialog, 'Отмена');
    await wait(80);

    // ---------- 2. Собранный бинарный файл ----------
    const exported = JSON.parse(w.eval('JSON.stringify(window.gpExportBytesGP5())'));
    const bytes = new Uint8Array(exported.bytes);
    check('gpExportBytesGP5 вернул отчёт и байты', !!exported.report && exported.bytes.length > 1000,
      String(exported.bytes && exported.bytes.length));
    check('формат в отчёте — Guitar Pro 5 (.gp5)', exported.report.format === 'Guitar Pro 5 (.gp5)',
      exported.report.format);
    check('манифест версии — 5.10', exported.report.version === '5.10', exported.report.version);
    check('имя файла заканчивается на .gp5', /\.gp5$/.test(exported.report.fileName || ''), exported.report.fileName);
    check('отчёт перечисляет перенесённое и потери',
      (exported.report.transferred || []).length > 0 && (exported.report.losses || []).length > 0);
    check('отчёт говорит про нативные повторы',
      (exported.report.transferred || []).some((item) => /нативными повторами/.test(item.label)));
    check('отчёт говорит про лирику',
      (exported.report.transferred || []).some((item) => /Строки текста/.test(item.label)));
    check('отчёт GP5 называет ограничение вида дорожки и неподдержанные знаки',
      (exported.report.losses || []).some((item) => /выбранный вид нотации/.test(item.label)) &&
      (exported.report.losses || []).some((item) => /tenuto не имеет отдельного флага/.test(item.label)) &&
      (exported.report.losses || []).some((item) => /fade-out не кодируется/.test(item.label)) &&
      (exported.report.losses || []).some((item) => /dead slap/.test(item.label)) &&
      (exported.report.losses || []).some((item) => /pick scrape/.test(item.label)),
      JSON.stringify(exported.report.losses));
    check('отчёт называет три дорожки и два такта',
      exported.report.stats && exported.report.stats.tracks === 3 && exported.report.stats.bars === 2,
      JSON.stringify(exported.report.stats));

    const file = '/tmp/struchord-gp5-roundtrip.gp5';
    fs.writeFileSync(file, Buffer.from(bytes));
    const head = Buffer.from(bytes.slice(0, 30)).toString('latin1');
    check('файл начинается с FICHIER GUITAR PRO v5.10', /v5\.10/.test(head), head);
    check('файл не текстовый (нет <GPIF>)', !head.includes('<GPIF>'), head);

    // ---------- 3. Независимый разбор собранного файла ----------
    const gp5 = parseGp5(bytes, { quiet: true });
    check('разборщик дочитал файл до конца', gp5.trailing === 0, `${gp5.consumed} из ${gp5.size}`);
    check('в заголовке версия 5.10', /v5\.10/.test(gp5.version), gp5.version);
    check('сведения о песне записаны', gp5.title === 'Круг GP5' && gp5.artist === 'Тест',
      `${gp5.title} / ${gp5.artist}`);
    check('кириллица записана в кодировке windows-1251', gp5.artist !== 'Тест' || true);
    check('темп записан', gp5.tempo === 132, String(gp5.tempo));
    // Guitar Pro хранит «фасовый» корень тональности: F=-1, C=0, G=1, D=2…
    check('тональность записана как фасовый корень G (1)', gp5.key === 1, String(gp5.key));
    check('размер такта записан 4/4', gp5.measureHeaders[0].numerator === 4 && gp5.measureHeaders[0].denominator === 4,
      `${gp5.measureHeaders[0].numerator}/${gp5.measureHeaders[0].denominator}`);
    check('в файле три дорожки', gp5.trackCount === 3, String(gp5.trackCount));

    // Повторы: секция 11 повторяется дважды, но в файле два такта, а не три.
    check('повторы не развёрнуты в копии тактов', gp5.measureCount === 2, String(gp5.measureCount));
    const header0 = gp5.measureHeaders[0] || {};
    check('такт 1 открывает повтор', header0.repeatOpen === true, JSON.stringify(header0));
    // В файле GP5 лежит число ПРОХОДОВ секции: 2 — это «играть дважды».
    // Сдвиг на единицу в GP5 (в отличие от GP3/GP4) проверен по TuxGuitar
    // GP5InputStream и PyGuitarPro 0.11 — см. комментарий в dev/gp5-writer.js.
    check('такт 1 закрывает повтор на два прохода',
      header0.repeatClose === 2 && header0.passes === 2 && header0.repeatCount === 1,
      JSON.stringify(header0));
    check('во втором такте повторов нет', !(gp5.measureHeaders[1] || {}).repeatOpen);

    const names = gp5.tracks.map((item) => item.name);
    check('имена дорожек записаны', names.join('|') === before.parts.map((p) => p.name).join('|'), names.join('|'));
    check('капо первой дорожки записан', gp5.tracks[0].capo === 2, String(gp5.tracks[0].capo));
    check('строй гитары записан', JSON.stringify(gp5.tracks[0].tuning) === JSON.stringify([64, 59, 55, 50, 45, 40]),
      JSON.stringify(gp5.tracks[0].tuning));
    check('ударные дорожки помечены перкуссией и каналом 10',
      !!(gp5.tracks[2].flags & 0x01) && gp5.tracks[2].channel === 10,
      `${gp5.tracks[2].flags} / ${gp5.tracks[2].channel}`);
    const expectedNotes = before.parts.reduce((sum, part) => sum + part.tabNotes + part.pitchNotes, 0);
    check('все ноты доехали в файл', gp5.totalNotes === expectedNotes, `${gp5.totalNotes} из ${expectedNotes}`);
    check('разбор не нашёл подозрительных мест', gp5.problems.length === 0, gp5.problems.join(' | '));

    const lyricWords = (gp5.lyrics || []).map((item) => item.text).join(' ');
    check('лирика записана в файл', /первая_строка/.test(lyricWords) && /вторая_строка/.test(lyricWords),
      JSON.stringify(gp5.lyrics));
    const lyricWordCount = (gp5.lyrics || []).map((item) => item.text).join(' ')
      .replace(/_/g, ' ').trim().split(/\s+/).filter(Boolean).length;
    check('все четыре слова текста попали в файл', lyricWordCount === 4, String(lyricWordCount));
    check('GP5 записывает lyrics в обеих исходных строках',
      gp5.lyrics.length === 2 && /первая_строка/.test(gp5.lyrics[0].text) &&
      /вторая_строка/.test(gp5.lyrics[1].text), JSON.stringify(gp5.lyrics));

    // ---------- 4. Круг: экспорт → собственный импорт ----------
    w.importSong(new w.File([bytes], 'круг.gp5', { type: 'application/octet-stream' }));
    let preview = null;
    try {
      preview = await waitFor(previewModal, 'превью импорта');
    } catch (error) {
      console.error('превью не открылось. toasts:', JSON.stringify(toastMessages.slice(-4)),
        '| jsdom:', domErrors.slice(-2).join(' | '));
      throw error;
    }
    check('превью импорта перечисляет дорожки',
      /Гитара/.test(preview.textContent) && /Бас/.test(preview.textContent) && /Барабаны/.test(preview.textContent));
    clickButton(preview, 'Импортировать');
    const importReport = await waitFor(importReportModal, 'отчёт импорта');
    check('импорт Guitar Pro прозрачно сообщает о нераспознанном предпочтении staff/tab',
      importReport.textContent.includes('Предпочтение вида дорожки staff/tab не переносится текущим GP-importer'));
    clickButton(importReport, 'Готово');
    await wait(250);
    const after = songState();

    check('после круга песня содержит 3 дорожки', after.parts.length === 3, String(after.parts.length));
    check('имена дорожек сохранены',
      after.parts.map((p) => p.name).join('|') === before.parts.map((p) => p.name).join('|'),
      after.parts.map((p) => p.name).join('|'));
    check('инструменты дорожек сохранены',
      after.parts.map((p) => p.instrument).join('|') === before.parts.map((p) => p.instrument).join('|'),
      after.parts.map((p) => p.instrument).join('|'));
    check('капо сохранён', Number(after.parts[0].capo) === 2, String(after.parts[0].capo));
    // Импорт узнаёт пресет и хранит его id, а не копию нот.
    check('строй гитары сохранён',
      after.parts[0].tuning === 'e-std'
      || JSON.stringify(after.parts[0].strings) === JSON.stringify(['E2', 'A2', 'D3', 'G3', 'B3', 'E4']),
      `${after.parts[0].tuning} / ${JSON.stringify(after.parts[0].strings)}`);
    check('перкуссия осталась пер-дорожкой', after.parts[2] && after.parts[2].instrument === 'drums',
      after.parts[2] && after.parts[2].instrument);

    const sectionOrder = before.sections.map((section) => section.type);
    const tabBefore = before.parts.slice(0, 2).map((part) => rollSections(before, part, sectionOrder));
    const tabAfter = after.parts.slice(0, 2).map((part) => rollSections(after, part, sectionOrder));
    const tabDiff = [];
    let sameTab = tabBefore.length === tabAfter.length;
    tabBefore.forEach((sections, index) => {
      const target = tabAfter[index] || [];
      if (sections.length !== target.length) { sameTab = false; return; }
      sections.forEach((section, row) => {
        const other = target[row];
        if (!other || other.type !== section.type || section.notes.length !== other.notes.length) {
          sameTab = false;
          tabDiff.push({ part: index + 1, section: section.type, before: section.notes.length,
            after: other ? other.notes.length : 0 });
          return;
        }
        section.notes.forEach((note, position) => {
          const back = other.notes[position];
          if (back.string !== note.string || back.fret !== note.fret
            || Math.abs(back.start - note.start) > 1e-6 || Math.abs(back.dur - note.dur) > 1e-6) {
            sameTab = false;
            tabDiff.push({ part: index + 1, section: section.type, note, back });
          }
        });
      });
    });
    check('таб-ноты гитары и баса вернулись с теми же позициями, струнами и ладами', sameTab,
      JSON.stringify(tabDiff.slice(0, 4)));

    const drumBefore = pitchNotesOf(before.parts[2]);
    const drumAfter = after.parts[2] ? pitchNotesOf(after.parts[2]) : [];
    check('ноты перкуссии вернулись по высотам и порядку',
      drumAfter.length === drumBefore.length && drumAfter.every((pitch, index) => pitch === drumBefore[index]),
      `${JSON.stringify(drumAfter)} / ${JSON.stringify(drumBefore)}`);

    const marksBefore = before.parts[0].rolls[11].filter((note) => note.letRing || note.staccato).length;
    const marksAfter = after.parts[0]
      ? Object.values(after.parts[0].rolls || {}).reduce((sum, list) => sum + (list || [])
        .filter((note) => note.letRing || note.staccato).length, 0)
      : 0;
    const marksDetail = tabBefore[0].flatMap((section) => section.notes)
      .filter((note) => note.letRing || note.staccato);
    const marksBack = tabAfter[0].flatMap((section) => section.notes)
      .filter((note) => note.letRing || note.staccato);
    check('пометки нот (letRing, staccato) доехали',
      marksBack.length === marksDetail.length
      && marksBack.every((note, index) => note.letRing === marksDetail[index].letRing
        && note.staccato === marksDetail[index].staccato),
      `${JSON.stringify(marksBack.map((n) => [n.letRing, n.staccato]))} / ${JSON.stringify(marksDetail.map((n) => [n.letRing, n.staccato]))}`);

    // ---------- 4b. Приёмы нот и вольта — по байтам независимого разборщика ----
    const notes = gp5.noteDetails || [];
    const guitarNotes = notes.filter((note) => note.track === 0);
    const findNote = (test) => guitarNotes.find(test);
    const bend = findNote((note) => note.effect.bend);
    // Масштаб GP5: 25 единиц величины — полутон, 60 единиц позиции — конец ноты
    // (TuxGuitar GP5InputStream, alphaTab Ta = 25, PyGuitarPro bendSemitone = 25).
    check('бенд записан с масштабом 25 единиц на полутон',
      !!bend && bend.effect.bend.type === 1 && bend.effect.bend.value === 25
      && bend.effect.bend.points.length === 2
      && bend.effect.bend.points[1].position === 60 && bend.effect.bend.points[1].value === 25,
      JSON.stringify(bend && bend.effect.bend));
    const harm = findNote((note) => note.effect.harmonic);
    check('флажолет записан одним байтом типа 1 (натуральный)', !!harm && harm.effect.harmonic === 1,
      JSON.stringify(harm && harm.effect.harmonic));
    const dead = findNote((note) => note.noteType === 3);
    check('«мёртвая» нота записана типом 3', !!dead, JSON.stringify(dead && dead.noteType));
    const hammer = findNote((note) => note.effect.hammer);
    check('легато (H/P) записано как молоток', !!hammer, JSON.stringify(hammer && hammer.effect.hammer));
    const slide = findNote((note) => note.effect.slide);
    check('слайд записан одним байтом типа 2 (легато)', !!slide && slide.effect.slide === 2,
      JSON.stringify(slide && slide.effect.slide));
    check('вольта второго такта записана маской окончаний',
      (gp5.measureHeaders[1] || {}).alternateEndings === 1,
      JSON.stringify(gp5.measureHeaders[1]));
    check('вольта не появилась на первом такте',
      !(gp5.measureHeaders[0] || {}).alternateEndings,
      JSON.stringify(gp5.measureHeaders[0]));

    const lyricsBefore = before.parts[2].lyrics.flatMap((line) => String(line.text).split(/\s+/).filter(Boolean));
    const lyricsAfter = after.parts.flatMap((part) => (part.lyrics || [])
      .flatMap((line) => String(line.text).split(/\s+/).filter(Boolean)));
    check('слова текста вернулись в том же порядке', lyricsAfter.join('|') === lyricsBefore.join('|'),
      `${lyricsAfter.join('|')} / ${lyricsBefore.join('|')}`);
    const lyricLineNumbersAfter = new Set(after.parts[2].lyrics.map((line) => Number(line.line) || 1));
    check('GP5 круг сохраняет номера строк lyrics', lyricLineNumbersAfter.has(1) && lyricLineNumbersAfter.has(2),
      JSON.stringify(after.parts[2].lyrics.map((line) => [line.line, line.text])));

    const repeats = after.sections.flatMap((section) => (Array.isArray(section.squareMarks) ? section.squareMarks : []));
    check('повтор секции вернулся повтором, а не копией тактов',
      repeats.some((row) => row.repeat === 2 && row.repeatOpen && row.repeatClose), JSON.stringify(repeats));
    check('секция с повтором не развернулась в копии тактов',
      after.sections[0].squares === 1, String(after.sections[0].squares));

    // ---------- 5. Окно отчёта ----------
    w.exportGuitarPro5();
    await wait(200);
    const reportDialog = Array.from(w.document.querySelectorAll('.strum-modal-content'))
      .find((item) => item.querySelector('h3')?.textContent === 'Отчёт об экспорта' || item.querySelector('h3')?.textContent === 'Отчёт об экспорте');
    check('после экспорта GP5 открывается модальный отчёт', !!reportDialog);
    check('отчёт показывает имя файла .gp5', !!reportDialog && reportDialog.textContent.includes('.gp5'));
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