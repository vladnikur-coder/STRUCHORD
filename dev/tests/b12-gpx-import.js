#!/usr/bin/env node
/* B-12.9.6: импорт Guitar Pro 6 (.gpx) — предпросмотр, кодировка, вложения, отказ. */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const fixture = require('../tools/gpx-fixture');

const html = fs.readFileSync(path.join(__dirname, '..', '..', 'STRUCHORD.html'), 'utf8');
const domErrors = [];
const toastMessages = [];
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
function reportModal() {
  return Array.from(w.document.querySelectorAll('.strum-modal-content'))
    .find((item) => item.querySelector('h3')?.textContent === 'Отчёт об импорте Guitar Pro');
}
function previewModal() {
  return Array.from(w.document.querySelectorAll('.strum-modal-content'))
    .find((item) => item.querySelector('#gp35TrackList'));
}
function clickButton(modal, text) {
  const button = Array.from(modal.querySelectorAll('button')).find((item) => item.textContent.trim() === text);
  if (!button) throw new Error(`Button not found: ${text}`);
  button.click();
}
function closeReport() {
  const report = reportModal();
  if (report) clickButton(report, 'Готово');
}
async function openImport(bytes, fileName) {
  w.importSong(new w.File([bytes], fileName, { type: 'application/octet-stream' }));
  return waitFor(previewModal, `preview ${fileName}`);
}
function lastToast() { return toastMessages[toastMessages.length - 1] || ''; }
function currentState() {
  return JSON.parse(w.eval(`JSON.stringify({
    metadata: { artist: DOM.songArtist.value, title: DOM.songTitle.value },
    sections: sections.map((section) => ({ id: section.id, type: section.type, squares: section.squares.length })),
    parts: songParts.map((part) => ({
      name: part.name, instrument: part.instrument, sourceName: part.sourceName,
      gmProgram: part.gmProgram, midiChannel: part.midiChannel,
      notes: Object.values(part.rolls || {}).reduce((sum, list) => sum + (list ? list.length : 0), 0) +
        Object.values(part.pitchRolls || {}).reduce((sum, list) => sum + (list ? list.length : 0), 0),
    })),
    gpAssets: gpAssets.map((asset) => ({ ...asset })),
  })`));
}

const fixturesDir = path.join(__dirname, 'fixtures');
const sampleGp6 = new Uint8Array(fs.readFileSync(path.join(fixturesDir, 'sample-gp6.gpx')));
const brokenGp6 = new Uint8Array(fs.readFileSync(path.join(fixturesDir, 'sample-gp6-broken.gpx')));

// Windows-1251 для части фикстуры: GPIF пишется в однобайтовой кодировке,
// поэтому переключатель кодировок в предпросмотре должен это вылечить.
function toCp1251(text) {
  const out = [];
  for (const char of text) {
    const code = char.codePointAt(0);
    if (code >= 0x0410 && code <= 0x044f) out.push(0xc0 + (code - 0x0410));
    else if (char === 'ё') out.push(0xb1);
    else if (char === 'Ё') out.push(0xa1);
    else if (code < 0x80) out.push(code);
    else out.push(0x3f);
  }
  return new Uint8Array(out);
}
const zip = require('../gp78-zip-runtime');
const gp7Archive = zip.readArchive(new Uint8Array(fs.readFileSync(path.join(fixturesDir, 'sample-gp7.gp'))));
const gpifText = new TextDecoder('utf-8').decode(gp7Archive.entries.find((entry) => entry.fileName === 'score.gpif').data);
const cp1251Gp6 = fixture.compressBcfz(fixture.buildImage([
  { name: 'score.gpif', data: toCp1251(gpifText) },
  { name: 'thumbnail.png', data: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]) },
]));

(async () => {
  await waitFor(() => w.document.readyState === 'complete', 'app startup');
  await wait(40);

  // --- Предпросмотр ---------------------------------------------------------
  let preview = await openImport(sampleGp6, 'sample-gp6.gpx');
  let modal = preview.closest('.strum-modal-content');
  check('GP6 preview opens with its own heading and container label',
    modal.textContent.includes('Импорт Guitar Pro 6') && modal.textContent.includes('GP6 BCFZ'));
  check('GP6 preview keeps the encoding chooser visible with four options',
    preview.querySelector('#gp35Encoding') && !preview.querySelector('#gp35Encoding').parentElement.hidden &&
    Array.from(preview.querySelector('#gp35Encoding').options).map((option) => option.value).join(',') ===
    'auto,utf-8,windows-1251,windows-1252');
  check('GP6 preview preselects every track with role metadata',
    preview.querySelectorAll('input[type="checkbox"]:checked').length === 3 &&
    /Гитара/.test(preview.textContent) && /Ударные/.test(preview.textContent));
  check('GP6 preview explains the best-effort GPIF read',
    /BCFZ\/BCFS/.test(preview.textContent) && /best effort/.test(preview.textContent));

  // --- Импорт в новую песню -------------------------------------------------
  clickButton(modal, 'Импортировать');
  const report = await waitFor(reportModal, 'GP6 import report');
  let state = currentState();
  check('GP6 import creates a song with metadata and sections',
    state.metadata.title === 'Русская песня' && state.sections.length > 0 && state.parts.length === 3,
    JSON.stringify({ metadata: state.metadata, sections: state.sections.length, parts: state.parts.length }));
  check('GP6 import keeps every track and its notes',
    state.parts.every((part) => part.name) && state.parts.reduce((sum, part) => sum + part.notes, 0) > 0,
    JSON.stringify(state.parts.map((part) => part.name + ':' + part.notes)));
  check('GP6 report names the container and the GPIF caveat',
    report.textContent.includes('GP6 BCFZ') && report.textContent.includes('best-effort'));
  check('GP6 attachments land in the song media manifest',
    state.gpAssets.some((asset) => asset.name === 'thumbnail.png' && asset.category === 'image') &&
    report.textContent.includes('Вложения включены в песню'),
    JSON.stringify(state.gpAssets));
  closeReport();

  // --- Кодировка score.gpif -------------------------------------------------
  const cpPreview = await openImport(cp1251Gp6, 'cp1251.gpx');
  const cpModal = cpPreview.closest('.strum-modal-content');
  const titleLine = () => cpPreview.closest('.strum-modal-content').querySelectorAll('p')[1].textContent;
  const mojibakeTitle = titleLine();
  check('one-byte GPIF is decoded as UTF-8 by default (mojibake visible)',
    !mojibakeTitle.includes('Русская песня') && mojibakeTitle.length > 0, mojibakeTitle);
  const encodingSelect = cpPreview.querySelector('#gp35Encoding');
  encodingSelect.value = 'windows-1251';
  encodingSelect.dispatchEvent(new w.Event('change'));
  await wait(120);
  const restoredTitle = titleLine();
  const cpTrackName = cpPreview.textContent.includes('Гитара');
  check('switching to Windows-1251 restores the text fields',
    restoredTitle.includes('Русская песня') && restoredTitle.includes('Алексей') && cpTrackName,
    `${restoredTitle} / mojibake was ${mojibakeTitle}`);
  check('encoding notice reports the chosen encoding', /Windows-1251/.test(cpPreview.closest('.strum-modal-content').textContent));
  clickButton(cpModal, 'Отмена');

  // --- Файл с чужим расширением узнаётся по подписи -------------------------
  const sniffed = await openImport(sampleGp6, 'renamed-song.dat');
  check('a BCFZ container opens even without the .gpx extension',
    sniffed.closest('.strum-modal-content').textContent.includes('Импорт Guitar Pro 6'));
  clickButton(sniffed.closest('.strum-modal-content'), 'Отмена');

  // --- Append ---------------------------------------------------------------
  await wait(40);
  const partsBefore = currentState().parts.length;
  const appendPreview = await openImport(sampleGp6, 'append.gpx');
  const appendModal = appendPreview.closest('.strum-modal-content');
  const appendRadio = Array.from(appendModal.querySelectorAll('input[name="gp35ImportMode"]'))
    .find((input) => input.value === 'append');
  appendRadio.checked = true;
  clickButton(appendModal, 'Импортировать');
  const appendReport = await waitFor(reportModal, 'GP6 append report');
  state = currentState();
  check('append keeps the existing song and adds the imported tracks',
    state.parts.length === partsBefore * 2 && appendReport.textContent.includes('добавлено в текущую песню'),
    `${partsBefore} -> ${state.parts.length}`);
  closeReport();

  // --- Отказы -----------------------------------------------------------------
  toastMessages.length = 0;
  w.importSong(new w.File([brokenGp6], 'broken.gpx', { type: 'application/octet-stream' }));
  await wait(400);
  check('a damaged BCFZ container is refused with a readable message',
    /Не удалось прочитать Guitar Pro/.test(lastToast()) && /BCFZ/.test(lastToast()) && !reportModal(),
    lastToast());
  check('no partial import happens on a damaged container',
    currentState().parts.length === partsBefore * 2);

  toastMessages.length = 0;
  w.importSong(new w.File([new Uint8Array(fs.readFileSync(path.join(fixturesDir, 'sample-gp5.gp5')))], 'not-gp6.gpx',
    { type: 'application/octet-stream' }));
  await wait(400);
  check('a non-GP file named .gpx is refused without a partial import',
    /Не удалось прочитать Guitar Pro/.test(lastToast()) && currentState().parts.length === partsBefore * 2,
    lastToast());

  check('no uncaught jsdom errors during the GP6 import', domErrors.length === 0, domErrors.join(' | '));

  console.log(`${pass} ok, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});