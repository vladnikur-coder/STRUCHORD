#!/usr/bin/env node
/*
 * dev/tools/gpx-fixture.js — BCFS/BCFZ writer for test fixtures.
 *
 * The reader used by the application (dev/gpx-bcfz-runtime.js) is deliberately
 * read-only; this companion encoder lives in dev and builds synthetic .gpx
 * containers so tests have deterministic files. It mirrors the block layout that
 * Guitar Pro 6 writes: magic, header block, folder record, file records with a
 * payload block list, and an optional BCFZ bit stream with literal and
 * back-reference chunks.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const BLOCK_SIZE = 4096;
const RECORD_FILE = 2;
const RECORD_FOLDER = 1;
const NAME_OFFSET = 4;
const NAME_MAX = 127;
const SIZE_OFFSET = 140;
const BLOCKS_OFFSET = 148;

function asBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (typeof value === 'string') return new TextEncoder().encode(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new TypeError('Expected bytes, string or ArrayBuffer.');
}

/** Build a BCFS image: header block, folder record, child list, file records and payload blocks. */
function buildImage(files) {
  const list = (files || []).map((file) => ({ name: String(file.name), data: asBytes(file.data) }));
  const blocks = [];
  // Block 0: header padding (Guitar Pro fills it with 0xFF after three zero bytes).
  const header = new Uint8Array(BLOCK_SIZE).fill(0xff);
  header[0] = 0; header[1] = 0; header[2] = 0;
  blocks.push(header);

  const folderIndex = blocks.length;
  blocks.push(new Uint8Array(BLOCK_SIZE));
  const childListIndex = blocks.length;
  blocks.push(new Uint8Array(BLOCK_SIZE));
  const recordIndexes = [];
  for (const file of list) {
    const recordIndex = blocks.length;
    blocks.push(new Uint8Array(BLOCK_SIZE));
    recordIndexes.push(recordIndex);
    const payload = [];
    const blockCount = Math.max(1, Math.ceil(file.data.length / BLOCK_SIZE));
    for (let index = 0; index < blockCount; index++) {
      payload.push(blocks.length);
      const chunk = new Uint8Array(BLOCK_SIZE);
      chunk.set(file.data.subarray(index * BLOCK_SIZE, (index + 1) * BLOCK_SIZE));
      blocks.push(chunk);
    }
    const record = blocks[recordIndex];
    const view = new DataView(record.buffer);
    view.setUint32(0, RECORD_FILE, true);
    const name = new TextEncoder().encode(file.name);
    if (name.length > NAME_MAX) throw new Error(`File name is too long for a BCFS record: ${file.name}`);
    record.set(name, NAME_OFFSET);
    view.setUint32(SIZE_OFFSET, file.data.length, true);
    payload.forEach((blockIndex, position) => view.setUint32(BLOCKS_OFFSET + 4 * position, blockIndex, true));
  }

  const folder = blocks[folderIndex];
  const folderView = new DataView(folder.buffer);
  folderView.setUint32(0, RECORD_FOLDER, true);
  folder.set(new TextEncoder().encode('/'), NAME_OFFSET);
  folderView.setUint32(SIZE_OFFSET, 4 * recordIndexes.length, true);
  folderView.setUint32(BLOCKS_OFFSET, childListIndex, true);

  const childList = blocks[childListIndex];
  const childView = new DataView(childList.buffer);
  recordIndexes.forEach((recordIndex, position) => childView.setUint32(4 * position, recordIndex, true));
  childView.setUint32(4 * recordIndexes.length, 0, true);

  const image = new Uint8Array(4 + blocks.length * BLOCK_SIZE);
  const magic = new TextEncoder().encode('BCFS');
  image.set(magic, 0);
  blocks.forEach((block, index) => image.set(block, 4 + index * BLOCK_SIZE));
  return image;
}

class BitWriter {
  constructor() {
    this.bytes = [];
    this.current = 0;
    this.used = 0;
  }

  writeBit(bit) {
    this.current = (this.current << 1) | (bit & 1);
    this.used += 1;
    if (this.used === 8) {
      this.bytes.push(this.current & 0xff);
      this.current = 0;
      this.used = 0;
    }
  }

  writeBits(value, count) {
    for (let index = count - 1; index >= 0; index--) this.writeBit(Math.floor(value / 2 ** index) & 1);
  }

  writeBitsReversed(value, count) {
    for (let index = 0; index < count; index++) this.writeBit(Math.floor(value / 2 ** index) & 1);
  }

  finish() {
    if (this.used) {
      this.bytes.push((this.current << (8 - this.used)) & 0xff);
      this.current = 0;
      this.used = 0;
    }
    return new Uint8Array(this.bytes);
  }
}

function bitsNeeded(value) {
  let count = 0;
  let rest = value;
  while (rest > 0) { count += 1; rest = Math.floor(rest / 2); }
  return count;
}

/** Compress a BCFS image into a BCFZ container (greedy LZ77, window 32767). */
function compressBcfz(image, options) {
  const input = asBytes(image);
  const minMatch = (options && options.minMatch) || 4;
  const window = (options && options.window) || 32767;
  const writer = new BitWriter();
  const out = [];
  let position = 0;
  let literals = [];

  const flushLiterals = () => {
    for (let index = 0; index < literals.length; index += 3) {
      const chunk = literals.slice(index, index + 3);
      writer.writeBit(0);
      writer.writeBitsReversed(chunk.length, 2);
      chunk.forEach((byte) => writer.writeBits(byte, 8));
    }
    literals = [];
  };

  const matchWordSize = (distance, count) => {
    let wordSize = Math.max(bitsNeeded(Math.max(distance, count)), 1);
    while ((count > 2 ** wordSize - 1 || distance > 2 ** wordSize - 1) && wordSize < 15) wordSize += 1;
    if (wordSize > 15 || count > 2 ** wordSize - 1 || distance > 2 ** wordSize - 1) return 0;
    return wordSize;
  };

  while (position < input.length) {
    let bestDistance = 0;
    let bestLength = 0;
    const maxLength = Math.min(input.length - position, 32767);
    if (maxLength >= minMatch) {
      const limit = Math.min(position, window);
      for (let distance = 1; distance <= limit; distance++) {
        let length = 0;
        while (length < maxLength && input[position - distance + length] === input[position + length]) length += 1;
        if (length > bestLength) { bestLength = length; bestDistance = distance; }
        if (bestLength >= 512) break;
      }
    }
    const wordSize = bestLength >= minMatch ? matchWordSize(bestDistance, bestLength) : 0;
    if (wordSize) {
      // Ссылка записывается только после отложенных литералов: их биты обязаны
      // физически предшествовать ссылке, иначе декодер склеит их иначе.
      flushLiterals();
      writer.writeBit(1);
      writer.writeBits(wordSize, 4);
      writer.writeBitsReversed(bestDistance, wordSize);
      writer.writeBitsReversed(bestLength, wordSize);
      position += bestLength;
      continue;
    }
    literals.push(input[position]);
    position += 1;
    if (literals.length === 3) flushLiterals();
  }
  flushLiterals();
  const payload = writer.finish();
  const header = new Uint8Array(8);
  header.set(new TextEncoder().encode('BCFZ'), 0);
  new DataView(header.buffer).setUint32(4, input.length, true);
  const out2 = new Uint8Array(header.length + payload.length);
  out2.set(header, 0);
  out2.set(payload, header.length);
  return out2;
}

/** Build a complete .gpx container. `compressed: false` writes a plain BCFS file. */
function writeContainer(files, options) {
  const image = buildImage(files);
  return options && options.compressed === false ? image : compressBcfz(image, options);
}

/** Build the fixture set used by dev/tests/b12-gpx-*.js. */
function fixtureFiles(options) {
  const zip = require('../gp78-zip-runtime');
  const archive = zip.readArchive(new Uint8Array(fs.readFileSync(path.join(__dirname, '..', 'tests', 'fixtures', 'sample-gp7.gp'))));
  const scoreEntry = archive.entries.find((entry) => entry.fileName === 'score.gpif');
  if (!scoreEntry) throw new Error('sample-gp7.gp does not contain score.gpif');
  const tinyPng = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
    0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xdd, 0x8d, 0xb0, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
    0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
  const prefix = options && options.scorePrefix ? new TextEncoder().encode(options.scorePrefix) : null;
  const scoreData = prefix
    ? new Uint8Array(scoreEntry.data.length + prefix.length)
    : scoreEntry.data;
  if (prefix) {
    scoreData.set(prefix, 0);
    scoreData.set(scoreEntry.data, prefix.length);
  }
  return [
    { name: 'score.gpif', data: scoreData },
    { name: 'misc.xml', data: '<?xml version="1.0" encoding="utf-8"?>\n<MISC/>\n' },
    { name: 'BinaryStylesheet', data: new Uint8Array(2048).map((_, index) => (index * 7) & 0xff) },
    { name: 'PartConfiguration', data: new Uint8Array([0, 0, 0, 3, 0, 0, 0, 0, 2, 3, 3, 0]) },
    { name: 'LayoutConfiguration', data: new Uint8Array([0, 0, 0, 4, 0, 0, 0, 0]) },
    { name: 'thumbnail.png', data: tinyPng },
  ];
}

function main() {
  const fixturesDir = path.join(__dirname, '..', 'tests', 'fixtures');
  const files = fixtureFiles();
  const compressed = writeContainer(files);
  fs.writeFileSync(path.join(fixturesDir, 'sample-gp6.gpx'), compressed);
  const plain = writeContainer(files, { compressed: false });
  fs.writeFileSync(path.join(fixturesDir, 'sample-gp6-bcfs.gpx'), plain);
  const broken = compressed.slice(0, Math.floor(compressed.length * 0.55));
  fs.writeFileSync(path.join(fixturesDir, 'sample-gp6-broken.gpx'), broken);
  console.log('sample-gp6.gpx', compressed.length, 'bytes');
  console.log('sample-gp6-bcfs.gpx', plain.length, 'bytes');
  console.log('sample-gp6-broken.gpx', broken.length, 'bytes');
}

if (require.main === module) main();

module.exports = { buildImage, compressBcfz, writeContainer, fixtureFiles, main };