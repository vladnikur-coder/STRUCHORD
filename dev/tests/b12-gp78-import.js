#!/usr/bin/env node
/* B-12.9.5: GP7/8 GPIF import, structure, lyrics, attachments, ZIP64 app path. */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const zip = require('../gp78-zip-runtime');

const html = fs.readFileSync(path.join(__dirname, '..', '..', 'STRUCHORD.html'), 'utf8');
const baseGp = zip.readArchive(fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-gp7.gp')));
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
function clickButton(modal, text) {
  const button = Array.from(modal.querySelectorAll('button')).find((item) => item.textContent.trim() === text);
  if (!button) throw new Error(`Button not found: ${text}`);
  button.click();
}
function closeReport() {
  const report = reportModal();
  if (report) clickButton(report, 'Готово');
}
function makeGpArchive({ version = '7.0', structures = false, media = false } = {}) {
  const entries = baseGp.entries.map((entry) => ({ name: entry.name, data: entry.data.slice() }));
  const versionEntry = entries.find((entry) => entry.name.toLowerCase() === 'version');
  versionEntry.data = new TextEncoder().encode(version);
  if (structures) {
    const scoreEntry = entries.find((entry) => entry.name.toLowerCase().endsWith('/score.gpif'));
    let xml = new TextDecoder('utf-8').decode(scoreEntry.data);
    const first = '<Time>4/4</Time><Bars>0 1 2</Bars>';
    const last = '<Time>3/4</Time><Bars>6 7 8</Bars>';
    if (!xml.includes(first) || !xml.includes(last)) throw new Error('GPIF fixture master-bar pattern changed');
    xml = xml.replace(first,
      '<Time>4/4</Time><Repeat start="true" end="false"/><Directions><Target>Segno</Target></Directions><Bars>0 1 2</Bars>');
    xml = xml.replace(last,
      '<Time>3/4</Time><Repeat start="false" end="true" count="3"/><AlternateEndings>1 2</AlternateEndings>' +
      '<Directions><Target>Fine</Target><Jump>DaCapoAlFine</Jump></Directions><Bars>6 7 8</Bars>');
    scoreEntry.data = new TextEncoder().encode(xml);
  }
  if (media) {
    entries.push({ name: 'Content/Audio/bed.wav', data: new TextEncoder().encode('RIFF\u0008\u0000\u0000\u0000WAVE') });
    entries.push({ name: 'Content/Artwork/cover.png', data: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]) });
  }
  return zip.writeStoredArchive(entries);
}
function upgradeToZip64(input) {
  const source = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
  const eocd = source.length - 22;
  if (view.getUint32(eocd, true) !== 0x06054b50) throw new Error('test EOCD not found');
  const count = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  const recordOffset = centralOffset + centralSize;
  const output = new Uint8Array(source.length + 76);
  output.set(source.subarray(0, recordOffset), 0);
  const result = new DataView(output.buffer);
  let cursor = recordOffset;
  result.setUint32(cursor, 0x06064b50, true);
  result.setBigUint64(cursor + 4, 44n, true);
  result.setUint16(cursor + 12, 45, true);
  result.setUint16(cursor + 14, 45, true);
  result.setBigUint64(cursor + 24, BigInt(count), true);
  result.setBigUint64(cursor + 32, BigInt(count), true);
  result.setBigUint64(cursor + 40, BigInt(centralSize), true);
  result.setBigUint64(cursor + 48, BigInt(centralOffset), true);
  cursor += 56;
  result.setUint32(cursor, 0x07064b50, true);
  result.setBigUint64(cursor + 8, BigInt(recordOffset), true);
  result.setUint32(cursor + 16, 1, true);
  cursor += 20;
  result.setUint32(cursor, 0x06054b50, true);
  result.setUint16(cursor + 8, 0xffff, true);
  result.setUint16(cursor + 10, 0xffff, true);
  result.setUint32(cursor + 12, 0xffffffff, true);
  result.setUint32(cursor + 16, 0xffffffff, true);
  return output;
}
async function openImport(bytes, fileName) {
  w.importSong(new w.File([bytes], fileName, { type: 'application/octet-stream' }));
  return waitFor(() => w.document.querySelector('#gp35TrackList'), `preview ${fileName}`);
}
function currentState() {
  return JSON.parse(w.eval(`JSON.stringify({
    metadata: { artist: DOM.songArtist.value, title: DOM.songTitle.value },
    sections: sections.map((section) => ({
      id: section.id, type: section.type, customName: section.customName, timeSig: section.timeSig,
      squares: section.squares.map((square) => ({
        repeat: square.repeat, repeatOpen: square.repeatOpen, repeatClose: square.repeatClose,
        volta: square.volta, mark: square.mark, jump: square.jump, eventCount: square.events.length,
      })),
    })),
    parts: songParts.map((part) => ({
      name: part.name, instrument: part.instrument, sourceName: part.sourceName,
      gmProgram: part.gmProgram, midiChannel: part.midiChannel,
      rolls: part.rolls, pitchRolls: part.pitchRolls, lyrics: part.lyrics,
    })),
    gpAssets: gpAssets.map((asset) => ({ ...asset })),
    assetIds: Array.from(gpMediaAssetData.keys()),
    storeCommand: songStore.log().slice(-1)[0]?.label,
    notes: DOM.notesArea.value,
  })`));
}

(async () => {
  await waitFor(() => w.document.readyState === 'complete', 'app startup');
  await wait(40);

  let preview = await openImport(fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-gp7.gp')), 'sample-gp7.gp');
  let modal = preview.closest('.strum-modal-content');
  check('GP7 ZIP container opens the embedded GPIF import flow',
    modal.textContent.includes('Импорт Guitar Pro 7–8') && modal.textContent.includes('GP7/8 GPIF'));
  check('GP7 preview preselects all three tracks and shows their role metadata',
    preview.querySelectorAll('input[type="checkbox"]:checked').length === 3 &&
    /Гитара/.test(preview.textContent) && /Клавишные/.test(preview.textContent) && /Ударные/.test(preview.textContent));
  clickButton(modal, 'Импортировать');
  let report = await waitFor(reportModal, 'GP7 import report');
  let state = currentState();
  check('GP7 import carries beat.text into a time-aligned lyric record',
    state.parts[0]?.lyrics?.some((lyric) => lyric.text === 'текст' && lyric.secId === state.sections[0].id && lyric.start === 0),
    JSON.stringify(state.parts[0]?.lyrics));
  check('GP7 report exposes lyric counts and the GPIF best-effort caveat',
    report.textContent.includes('Lyrics: перенесено 1 из 1; пропущено 0') &&
    report.textContent.includes('GPIF обработан в режиме best-effort'));
  closeReport();

  const gp8Bytes = upgradeToZip64(makeGpArchive({ version: '8.0', structures: true, media: true }));
  preview = await openImport(gp8Bytes, 'sample-gp8.zip64.gp');
  modal = preview.closest('.strum-modal-content');
  check('GP8-labelled GPIF is accepted from a ZIP64 archive',
    modal.textContent.includes('GP7/8 GPIF') && modal.textContent.includes('3 тактов'), modal.textContent.slice(0, 160));
  check('GP8 preview says GPIF is parsed offline and does not offer legacy re-encoding',
    modal.textContent.includes('GPIF-текст декодирован как UTF-8') && modal.querySelector('#gp35Encoding').parentElement.hidden);
  clickButton(modal, 'Импортировать');
  report = await waitFor(reportModal, 'GP8 import report');
  state = currentState();
  const firstSquare = state.sections[0]?.squares[0];
  const lastSquare = state.sections[1]?.squares.at(-1);
  const gp8Guitar = state.parts.find((part) => part.instrument === 'guitar');
  const gp8Keys = state.parts.find((part) => part.instrument === 'keys');
  const gp8Drums = state.parts.find((part) => part.instrument === 'drums');
  check('GPIF title, tempo, marker-derived section, three roles and source notes survive import',
    state.metadata.title === 'Русская песня' && state.metadata.artist === 'Алексей' &&
    Number(w.document.getElementById('bpmInput').value) === 108 && state.sections.length === 2 &&
    state.sections[1].type === 'Chorus' && state.sections[1].timeSig === '3/4' &&
    Object.values(gp8Guitar?.rolls || {}).flat().length === 10 &&
    Object.values(gp8Keys?.pitchRolls || {}).flat().length === 10 &&
    Object.values(gp8Drums?.pitchRolls || {}).flat().length === 10);
  check('GPIF source name, GM program and MIDI channel are retained on every selected role',
    gp8Guitar?.sourceName === 'Гитара' && gp8Keys?.sourceName === 'Клавиши' && gp8Drums?.sourceName === 'Ударные' &&
    [gp8Guitar, gp8Keys, gp8Drums].every((part) => Number.isInteger(part.gmProgram) && Number.isInteger(part.midiChannel)));
  check('repeat start/end, three passes, first volta, Fine and D.C. target are mapped',
    firstSquare?.repeatOpen === true && lastSquare?.repeatClose === true && lastSquare.repeat === 3 &&
    lastSquare.volta === 1 && lastSquare.mark === 'fine' &&
    lastSquare.jump?.type === 'dc' && lastSquare.jump?.target === 'fine',
    JSON.stringify({ firstSquare, lastSquare }));
  check('report identifies ZIP64, preserved attachments, and the best-effort GPIF caveat',
    report.textContent.includes('Контейнер ZIP64 прочитан') && report.textContent.includes('аудио 1, изображения 1') &&
    report.textContent.includes('GPIF обработан в режиме best-effort'), report.textContent);
  check('audio and image attachments are in the song manifest and binary asset map',
    state.gpAssets.length === 2 && state.gpAssets.some((asset) => asset.category === 'audio') &&
    state.gpAssets.some((asset) => asset.category === 'image') && state.gpAssets.every((asset) => state.assetIds.includes(asset.id)),
    JSON.stringify({ assets: state.gpAssets, ids: state.assetIds }));
  check('unsupported second-ending detail is reported rather than silently discarded',
    report.textContent.includes('Дополнительные номера вольты на одном такте'));
  closeReport();

  // B-12.9.8: кнопка «Экспорт» спрашивает формат; JSON песни качает exportStruchordFile.
  const exported = await w.exportStruchordFile();
  check('export serializes lyrics, repeat markers, volta/jump data, and inline attachment bytes',
    exported.parts[0].lyrics?.some((lyric) => lyric.text === 'текст' && lyric.secId === exported.sections[0].id && lyric.dur > 0) &&
    exported.sections[0].squares[0].repeatOpen === true &&
    exported.sections[1].squares.at(-1).repeatClose === true &&
    exported.sections[1].squares.at(-1).volta === 1 &&
    exported.gpAssets?.length === 2 && exported.gpAssets.every((asset) => typeof asset.data === 'string' && asset.data.length > 0),
    JSON.stringify({ lyrics: exported.parts[0].lyrics, lastSquare: exported.sections[1].squares.at(-1), assets: exported.gpAssets?.map((asset) => [asset.name, !!asset.data]) }));
  w.localStorage.setItem('struchord_songs', JSON.stringify([exported]));
  w.eval('gpMediaAssetData.clear()');
  w.loadSong(0);
  state = currentState();
  check('saved/exported GP data reloads through schema sanitation without losing lyrics or structure',
    state.parts[0]?.lyrics?.some((lyric) => lyric.text === 'текст' && lyric.dur > 0) &&
    state.sections[0]?.squares[0]?.repeatOpen === true &&
    state.sections[1]?.squares.at(-1)?.jump?.target === 'fine', JSON.stringify({ lyrics: state.parts[0]?.lyrics, squares: state.sections.map((section) => section.squares) }));
  check('inline audio and image payloads restore after clearing the in-memory asset cache',
    state.gpAssets.length === 2 && state.gpAssets.every((asset) => state.assetIds.includes(asset.id)),
    JSON.stringify({ assets: state.gpAssets, ids: state.assetIds }));

  const badEntries = baseGp.entries.map((entry) => ({ name: entry.name, data: entry.data.slice() }));
  const badZip = zip.writeStoredArchive(badEntries);
  {
    const view = new DataView(badZip.buffer, badZip.byteOffset, badZip.byteLength);
    const eocd = badZip.length - 22;
    const centralOffset = view.getUint32(eocd + 16, true);
    const localOffset = view.getUint32(centralOffset + 42, true);
    view.setUint16(centralOffset + 8, view.getUint16(centralOffset + 8, true) | 1, true);
    view.setUint16(localOffset + 6, view.getUint16(localOffset + 6, true) | 1, true);
  }
  const beforeToast = toastMessages.length;
  w.importSong(new w.File([badZip], 'encrypted.gp', { type: 'application/octet-stream' }));
  await waitFor(() => toastMessages.slice(beforeToast).some((message) => message.includes('Зашифрованные ZIP-архивы')), 'readable encrypted ZIP error');
  check('encrypted .gp import fails with a clear Russian message and no preview',
    !w.document.querySelector('#gp35TrackList') && toastMessages.slice(beforeToast).some((message) => message.includes('Снимите пароль/шифрование')),
    toastMessages.slice(beforeToast).join(' | '));
  check('no uncaught jsdom errors during GP7/8, ZIP64, media export and reload', domErrors.length === 0, domErrors.slice(0, 3).join(' | '));

  console.log(`\nитого: ${pass} ok, ${fail} FAIL`);
  dom.window.close();
  process.exit(fail ? 1 : 0);
})().catch((error) => {
  console.error(error.stack || error);
  dom.window.close();
  process.exit(1);
});
