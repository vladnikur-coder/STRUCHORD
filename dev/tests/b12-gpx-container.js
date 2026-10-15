#!/usr/bin/env node
/* B-12.9.6: BCFZ/BCFS container codec of Guitar Pro 6 (.gpx). */
const fs = require('fs');
const path = require('path');
const codec = require('../gpx-bcfz-runtime');
const fixture = require('../tools/gpx-fixture');

let pass = 0;
let fail = 0;
function check(name, condition, detail) {
  if (condition) { pass++; console.log('ok   ' + name); }
  else { fail++; console.error('FAIL ' + name + (detail === undefined ? '' : ' — ' + detail)); }
}

const fixturesDir = path.join(__dirname, 'fixtures');
const readFixture = (name) => new Uint8Array(fs.readFileSync(path.join(fixturesDir, name)));
const scoreGpiifFromGp7 = () => {
  const zip = require('../gp78-zip-runtime');
  const archive = zip.readArchive(readFixture('sample-gp7.gp'));
  const entry = archive.entries.find((item) => item.fileName === 'score.gpif');
  return entry ? entry.data : null;
};

// --- Подпись контейнера -----------------------------------------------------
check('sniff recognises BCFZ and BCFS', codec.sniff(readFixture('sample-gp6.gpx')) === 'BCFZ' &&
  codec.sniff(readFixture('sample-gp6-bcfs.gpx')) === 'BCFS');
check('sniff rejects foreign files', codec.sniff(readFixture('sample-gp5.gp5')) === '' &&
  codec.sniff(readFixture('sample-gp7.gp')) === '' && codec.sniff(new Uint8Array([1, 2, 3])) === '');

// --- Чтение сжатого контейнера ----------------------------------------------
const compressed = codec.readContainer(readFixture('sample-gp6.gpx'));
check('compressed container reports BCFZ and compression', compressed.container === 'BCFZ' &&
  compressed.compressed === true && compressed.truncated === false);
check('compressed container lists every file', compressed.entries.map((entry) => entry.name).join(',') ===
  'score.gpif,misc.xml,BinaryStylesheet,PartConfiguration,LayoutConfiguration,thumbnail.png',
  compressed.entries.map((entry) => entry.name).join(','));
check('folder record is not treated as a file', !compressed.entries.some((entry) => entry.name === '/') &&
  compressed.folders === 1);
check('score.gpif survives the round trip byte for byte',
  Buffer.compare(Buffer.from(compressed.entries[0].data), Buffer.from(scoreGpiifFromGp7())) === 0);
check('embedded PNG is readable', compressed.entries[5] &&
  compressed.entries[5].data[0] === 0x89 && compressed.entries[5].data[1] === 0x50 &&
  compressed.entries[5].size === 69);
check('payload blocks follow the declared size', compressed.entries[0].blockCount === Math.ceil(70121 / 4096));

// --- Чтение несжатого контейнера -------------------------------------------
const plain = codec.readContainer(readFixture('sample-gp6-bcfs.gpx'));
check('plain BCFS container lists the same files',
  plain.entries.map((entry) => entry.name).join(',') === compressed.entries.map((entry) => entry.name).join(',') &&
  plain.compressed === false);
check('both containers agree on the score bytes',
  Buffer.compare(Buffer.from(plain.entries[0].data), Buffer.from(compressed.entries[0].data)) === 0);

// --- Копирование с перекрытием (count больше distance) ----------------------
const overlapExpected = (() => {
  const expected = new Uint8Array(3 + 1200);
  expected.set(new TextEncoder().encode('BCA'), 0);
  expected.fill(0x41, 3); // ссылка с расстоянием 1 повторяет последний литерал
  return expected;
})();
const overlapPacked = (() => {
  // Ручной поток: литерал 'BCA' (не более трёх байт на флаг), затем ссылка
  // длиной 1200 байт с расстоянием 1 — копирование с перекрытием.
  const bits = [];
  const push = (value, count) => { for (let i = count - 1; i >= 0; i--) bits.push(Math.floor(value / 2 ** i) & 1); };
  const pushRev = (value, count) => { for (let i = 0; i < count; i++) bits.push(Math.floor(value / 2 ** i) & 1); };
  const literal = (bytes) => {
    for (let index = 0; index < bytes.length; index += 3) {
      const chunk = bytes.slice(index, index + 3);
      push(0, 1);
      pushRev(chunk.length, 2);
      chunk.forEach((byte) => push(byte, 8));
    }
  };
  literal(Array.from(new TextEncoder().encode('BCA')));
  const count = 1200;
  const wordSize = 12;
  push(1, 1); push(wordSize, 4); pushRev(1, wordSize); pushRev(count, wordSize);
  const bytes = [];
  for (let index = 0; index < bits.length; index += 8) {
    let byte = 0;
    for (let bit = 0; bit < 8; bit++) byte = (byte << 1) | (bits[index + bit] || 0);
    bytes.push(byte);
  }
  const out = new Uint8Array(8 + bytes.length);
  out.set(new TextEncoder().encode('BCFZ'), 0);
  new DataView(out.buffer).setUint32(4, overlapExpected.length, true);
  out.set(new Uint8Array(bytes), 8);
  return out;
})();
const overlapBack = codec.decompressBcfz(overlapPacked);
let overlapOk = overlapBack.data.length === overlapExpected.length && !overlapBack.truncated;
for (let index = 0; overlapOk && index < overlapExpected.length; index++) {
  if (overlapExpected[index] !== overlapBack.data[index]) overlapOk = false;
}
check('back reference longer than its distance repeats the tail', overlapOk,
  `len=${overlapBack.data.length}, truncated=${overlapBack.truncated}`);

// --- Кодировщик фикстур: полный круг BCFS -> BCFZ -> чтение ------------------
const sampleFiles = [
  { name: 'score.gpif', data: new TextEncoder().encode('<GPIF>' + 'abcdefgh'.repeat(500) + '</GPIF>') },
  { name: 'notes.txt', data: new Uint8Array(9000).map((_, index) => index % 251) },
];
const rebuilt = codec.readContainer(fixture.compressBcfz(fixture.buildImage(sampleFiles)));
check('encoder/decoder round trip keeps every file',
  rebuilt.entries.length === 2 &&
  Buffer.compare(Buffer.from(rebuilt.entries[0].data), Buffer.from(sampleFiles[0].data)) === 0 &&
  Buffer.compare(Buffer.from(rebuilt.entries[1].data), Buffer.from(sampleFiles[1].data)) === 0);
check('compression really shrinks repetitive data',
  fixture.compressBcfz(fixture.buildImage(sampleFiles)).length < fixture.buildImage(sampleFiles).length);

// --- Отказы вместо выдуманных данных ---------------------------------------
function codeOf(run) {
  try { run(); return 'без ошибки'; } catch (error) { return error && error.code || 'без кода'; }
}
check('truncated bit stream is refused', codeOf(() => codec.readContainer(readFixture('sample-gp6-broken.gpx'))) === 'bcfz-invalid');
check('a file that is not BCFZ/BCFS is refused', codeOf(() => codec.readContainer(readFixture('sample-gp5.gp5'))) === 'bcfz-invalid');
check('short file is refused', codeOf(() => codec.readContainer(new Uint8Array([0x42, 0x43, 0x46, 0x5a]))) === 'bcfz-invalid');
check('oversized file is refused', codeOf(() => codec.readContainer(readFixture('sample-gp6.gpx'), { maxFileBytes: 16 })) === 'bcfz-limit');
check('limits above the built-in ceiling are refused',
  codeOf(() => codec.readContainer(readFixture('sample-gp6.gpx'), { maxFileBytes: 1e12 })) === 'bcfz-limit');
check('BCFZ that claims a huge output is refused', codeOf(() => {
  const bytes = readFixture('sample-gp6.gpx').slice();
  new DataView(bytes.buffer, bytes.byteOffset).setUint32(4, 0xffffff00, true);
  return codec.readContainer(bytes);
}) === 'bcfz-limit');

// --- Повреждённая файловая система ------------------------------------------
function recordOffset(image, name) {
  const nameBytes = Array.from(new TextEncoder().encode(name));
  for (let block = 0; block * 4096 + 4 < image.length; block++) {
    const base = 4 + block * 4096;
    if (new DataView(image.buffer, image.byteOffset).getUint32(base, true) !== 2) continue;
    const slice = image.subarray(base + 4, base + 4 + nameBytes.length);
    if (slice.every((value, index) => value === nameBytes[index])) return base;
  }
  throw new Error(`Record ${name} not found in the test image`);
}

const damagedImage = fixture.buildImage(sampleFiles);
new DataView(damagedImage.buffer).setUint32(recordOffset(damagedImage, 'score.gpif') + 148, 9999, true);
const damaged = codec.readFilesystem(damagedImage);
check('file whose payload block is out of range is skipped, not invented',
  damaged.entries.length === 1 && damaged.entries[0].name === 'notes.txt' &&
  damaged.skipped.some((item) => item.name === 'score.gpif'),
  JSON.stringify(damaged.skipped));

const truncatedFs = fixture.buildImage(sampleFiles);
new DataView(truncatedFs.buffer).setUint32(recordOffset(truncatedFs, 'score.gpif') + 140, 4096 * 4, true);
const truncated = codec.readFilesystem(truncatedFs);
check('file with a size bigger than its blocks is skipped',
  truncated.entries.length === 1 && truncated.skipped.some((item) => item.reason.includes('обрезан')),
  JSON.stringify(truncated.skipped));

const nameTrash = fixture.buildImage(sampleFiles);
nameTrash[recordOffset(nameTrash, 'score.gpif') + 4] = 0x0f;
const trash = codec.readFilesystem(nameTrash);
check('record with a binary name is not treated as a file',
  trash.entries.length === 1 && trash.entries[0].name === 'notes.txt' && !trash.skipped.length);

const emptyFile = codec.readFilesystem(fixture.buildImage([{ name: 'empty.bin', data: new Uint8Array(0) }]));
check('empty file is kept with size 0', emptyFile.entries.length === 1 && emptyFile.entries[0].size === 0);

console.log(`${pass} ok, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
