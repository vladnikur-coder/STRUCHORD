#!/usr/bin/env node
/* B-12.9.5: standalone ZIP/ZIP64 reader, raw DEFLATE, safety rejections. */
const zlib = require('zlib');
const zip = require('../gp78-zip-runtime');

let pass = 0;
let fail = 0;
function check(name, condition, detail) {
  if (condition) { pass++; console.log('ok   ' + name); }
  else { fail++; console.error('FAIL ' + name + (detail ? ' — ' + detail : '')); }
}
function eqBytes(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
function expectCode(name, callback, code) {
  try { callback(); check(name, false, `expected ${code}`); }
  catch (error) { check(name, error && error.code === code, `${error && error.code}: ${error && error.message}`); }
}
function findEocd(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 22 - 0xffff); offset--) {
    if (view.getUint32(offset, true) === 0x06054b50 && offset + 22 + view.getUint16(offset + 20, true) <= bytes.length) return offset;
  }
  throw new Error('EOCD not found in test archive');
}
function upgradeToZip64(input, forceEntryZip64 = false) {
  const source = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
  const eocd = findEocd(source);
  const oldCentralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  const entryCount = view.getUint16(eocd + 10, true);
  let oldPosition = centralOffset;
  const centralRecords = [];
  let first = true;
  while (oldPosition < centralOffset + oldCentralSize) {
    const nameLength = view.getUint16(oldPosition + 28, true);
    const extraLength = view.getUint16(oldPosition + 30, true);
    const commentLength = view.getUint16(oldPosition + 32, true);
    const oldLength = 46 + nameLength + extraLength + commentLength;
    const record = source.slice(oldPosition, oldPosition + oldLength);
    if (forceEntryZip64 && first) {
      const out = new Uint8Array(oldLength + 28);
      out.set(record.subarray(0, 46 + nameLength + extraLength));
      out.set(record.subarray(46 + nameLength + extraLength), 46 + nameLength + extraLength + 28);
      const outView = new DataView(out.buffer);
      const uncompressed = view.getUint32(oldPosition + 24, true);
      const compressed = view.getUint32(oldPosition + 20, true);
      const localOffset = view.getUint32(oldPosition + 42, true);
      outView.setUint32(20, 0xffffffff, true);
      outView.setUint32(24, 0xffffffff, true);
      outView.setUint16(30, extraLength + 28, true);
      outView.setUint32(42, 0xffffffff, true);
      const extraAt = 46 + nameLength + extraLength;
      outView.setUint16(extraAt, 0x0001, true);
      outView.setUint16(extraAt + 2, 24, true);
      outView.setBigUint64(extraAt + 4, BigInt(uncompressed), true);
      outView.setBigUint64(extraAt + 12, BigInt(compressed), true);
      outView.setBigUint64(extraAt + 20, BigInt(localOffset), true);
      centralRecords.push(out);
      first = false;
    } else {
      centralRecords.push(record);
      first = false;
    }
    oldPosition += oldLength;
  }
  if (centralRecords.length !== entryCount) throw new Error('Central-directory entry count mismatch in test archive');
  const centralSize = centralRecords.reduce((sum, record) => sum + record.length, 0);
  const central = new Uint8Array(centralSize);
  let cursor = 0;
  for (const record of centralRecords) { central.set(record, cursor); cursor += record.length; }
  const prefix = source.slice(0, centralOffset);
  const zip64Offset = centralOffset + centralSize;
  const output = new Uint8Array(prefix.length + central.length + 56 + 20 + 22);
  output.set(prefix, 0);
  output.set(central, prefix.length);
  const result = new DataView(output.buffer);
  cursor = zip64Offset;
  result.setUint32(cursor, 0x06064b50, true);
  result.setBigUint64(cursor + 4, 44n, true);
  result.setUint16(cursor + 12, 45, true);
  result.setUint16(cursor + 14, 45, true);
  result.setUint32(cursor + 16, 0, true);
  result.setUint32(cursor + 20, 0, true);
  result.setBigUint64(cursor + 24, BigInt(entryCount), true);
  result.setBigUint64(cursor + 32, BigInt(entryCount), true);
  result.setBigUint64(cursor + 40, BigInt(centralSize), true);
  result.setBigUint64(cursor + 48, BigInt(centralOffset), true);
  cursor += 56;
  result.setUint32(cursor, 0x07064b50, true);
  result.setUint32(cursor + 4, 0, true);
  result.setBigUint64(cursor + 8, BigInt(zip64Offset), true);
  result.setUint32(cursor + 16, 1, true);
  cursor += 20;
  result.setUint32(cursor, 0x06054b50, true);
  result.setUint16(cursor + 4, 0, true);
  result.setUint16(cursor + 6, 0, true);
  result.setUint16(cursor + 8, 0xffff, true);
  result.setUint16(cursor + 10, 0xffff, true);
  result.setUint32(cursor + 12, 0xffffffff, true);
  result.setUint32(cursor + 16, 0xffffffff, true);
  result.setUint16(cursor + 20, 0, true);
  return output;
}

const source = Buffer.from('Guitar Pro ZIP/ZIP64 test · длина и контрольная сумма\n'.repeat(64), 'utf8');
const repetitive = Buffer.from('A'.repeat(50000), 'ascii');
const binary = Buffer.from(Array.from({ length: 4096 }, (_, index) => (index * 73 + (index >>> 2)) & 0xff));
for (const [label, bytes] of [['dynamic text', source], ['repetitive data', repetitive], ['binary data', binary]]) {
  const deflated = zlib.deflateRawSync(bytes, { level: 9 });
  const inflated = zip.inflateRaw(deflated, bytes.length);
  check(`raw DEFLATE inflates ${label}`, eqBytes(inflated, bytes));
}
check('raw DEFLATE handles an empty stream', zip.inflateRaw(zlib.deflateRawSync(Buffer.alloc(0)), 0).length === 0);
expectCode('raw DEFLATE rejects a declared output shorter than its stream',
  () => zip.inflateRaw(zlib.deflateRawSync(Buffer.from('longer')), 2), 'deflate-invalid');

const archive = zip.writeStoredArchive([
  { name: 'Content/score.gpif', data: source },
  { name: 'Content/μ.png', data: Uint8Array.from([0x89, 0x50, 0x4e, 0x47]) },
]);
const roundTrip = zip.readArchive(archive);
check('stored ZIP writer and reader preserve UTF-8 names and bytes',
  roundTrip.entries.length === 2 && roundTrip.entries[0].name === 'Content/score.gpif' && eqBytes(roundTrip.entries[0].data, source));

const zip64 = upgradeToZip64(archive);
const zip64Decoded = zip.readArchive(zip64);
check('ZIP64 end records resolve and all entries inflate',
  zip64Decoded.zip64 && zip64Decoded.entries.length === 2 && eqBytes(zip64Decoded.entries[0].data, source));
const entryZip64 = zip.readArchive(upgradeToZip64(archive, true));
check('ZIP64 per-entry size and local-offset extra fields resolve',
  entryZip64.zip64 && eqBytes(entryZip64.entries[0].data, source), JSON.stringify(entryZip64.entries[0] && [entryZip64.entries[0].compressedSize, entryZip64.entries[0].uncompressedSize]));

const encrypted = archive.slice();
{
  const view = new DataView(encrypted.buffer, encrypted.byteOffset, encrypted.byteLength);
  const eocd = findEocd(encrypted);
  const centralOffset = view.getUint32(eocd + 16, true);
  const localOffset = view.getUint32(centralOffset + 42, true);
  view.setUint16(centralOffset + 8, view.getUint16(centralOffset + 8, true) | 1, true);
  view.setUint16(localOffset + 6, view.getUint16(localOffset + 6, true) | 1, true);
}
expectCode('encrypted ZIP entries are rejected', () => zip.readArchive(encrypted), 'zip-encrypted');

const multiVolume = archive.slice();
{
  const view = new DataView(multiVolume.buffer, multiVolume.byteOffset, multiVolume.byteLength);
  view.setUint16(findEocd(multiVolume) + 4, 1, true);
}
expectCode('multi-volume ZIP archives are rejected', () => zip.readArchive(multiVolume), 'zip-multivolume');

const corrupt = archive.slice();
{
  const view = new DataView(corrupt.buffer, corrupt.byteOffset, corrupt.byteLength);
  const centralOffset = view.getUint32(findEocd(corrupt) + 16, true);
  view.setUint32(centralOffset + 16, view.getUint32(centralOffset + 16, true) ^ 0x100, true);
}
expectCode('CRC-32 mismatches are rejected', () => zip.readArchive(corrupt), 'zip-crc');

const zip64Multi = upgradeToZip64(archive);
{
  const view = new DataView(zip64Multi.buffer, zip64Multi.byteOffset, zip64Multi.byteLength);
  const eocd = findEocd(zip64Multi);
  view.setUint32(eocd - 4, 2, true); // ZIP64 locator: total number of disks.
}
expectCode('ZIP64 multi-volume locator is rejected', () => zip.readArchive(zip64Multi), 'zip-multivolume');

console.log(`\nитого: ${pass} ok, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
