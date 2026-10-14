/*
 * STRUCHORD GP7/8 ZIP codec.
 *
 * Browser-safe ZIP/ZIP64 reader for Guitar Pro .gp files. It deliberately
 * accepts only single-disk, unencrypted archives and implements raw DEFLATE
 * itself (RFC 1951); no runtime dependency, server, or browser decompression
 * API is used. The browser build is embedded in STRUCHORD.html as an inert
 * script and activated only when a .gp file is imported.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.StruchordGp78Zip = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const LIMITS = Object.freeze({
    maxArchiveBytes: 64 * 1024 * 1024,
    maxUnpackedBytes: 128 * 1024 * 1024,
    maxEntries: 4096,
    maxNameBytes: 4096,
  });
  const U32_MAX = 0xffffffff;

  function zipError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function asBytes(source) {
    if (source instanceof Uint8Array) return source;
    if (source instanceof ArrayBuffer) return new Uint8Array(source);
    if (ArrayBuffer.isView(source)) return new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
    throw zipError('zip-invalid', 'Expected a byte array.');
  }

  function checkedU64(view, offset, label) {
    if (offset < 0 || offset + 8 > view.byteLength) {
      throw zipError('zip-invalid', `Truncated ZIP64 ${label}.`);
    }
    const low = view.getUint32(offset, true);
    const high = view.getUint32(offset + 4, true);
    if (high > 0x1fffff) throw zipError('zip-limit', `ZIP64 ${label} exceeds JavaScript safe integer range.`);
    const value = high * 0x100000000 + low;
    if (!Number.isSafeInteger(value)) throw zipError('zip-limit', `ZIP64 ${label} exceeds JavaScript safe integer range.`);
    return value;
  }

  function requireRange(bytes, offset, length, label) {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) ||
        offset < 0 || length < 0 || offset + length > bytes.byteLength) {
      throw zipError('zip-invalid', `Truncated ZIP ${label}.`);
    }
  }

  function decodeName(bytes, utf8) {
    try {
      if (utf8) return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (_) {
      throw zipError('zip-invalid', 'A ZIP entry has an invalid UTF-8 name.');
    }
    try {
      return new TextDecoder('ibm437').decode(bytes);
    } catch (_) {
      try { return new TextDecoder('windows-1252').decode(bytes); }
      catch (_) { return Array.from(bytes, (value) => String.fromCharCode(value)).join(''); }
    }
  }

  let crcTable = null;
  function crc32(bytes) {
    if (!crcTable) {
      crcTable = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let value = n;
        for (let bit = 0; bit < 8; bit++) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
        crcTable[n] = value >>> 0;
      }
    }
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function makeBitReader(bytes) {
    let byteOffset = 0;
    let bitOffset = 0;
    return {
      readBit() {
        if (byteOffset >= bytes.length) throw zipError('deflate-invalid', 'Truncated DEFLATE stream.');
        const bit = (bytes[byteOffset] >>> bitOffset) & 1;
        bitOffset++;
        if (bitOffset === 8) { bitOffset = 0; byteOffset++; }
        return bit;
      },
      readBits(count) {
        let value = 0;
        for (let bit = 0; bit < count; bit++) value |= this.readBit() << bit;
        return value >>> 0;
      },
      alignByte() {
        if (bitOffset) { bitOffset = 0; byteOffset++; }
      },
      readAlignedByte() {
        if (bitOffset !== 0) throw zipError('deflate-invalid', 'Misaligned DEFLATE stored block.');
        if (byteOffset >= bytes.length) throw zipError('deflate-invalid', 'Truncated DEFLATE stored block.');
        return bytes[byteOffset++];
      },
      readAlignedUint16() {
        const low = this.readAlignedByte();
        return low | (this.readAlignedByte() << 8);
      },
    };
  }

  function buildHuffman(lengths, label) {
    let maxBits = 0;
    const counts = new Uint16Array(16);
    for (let i = 0; i < lengths.length; i++) {
      const length = lengths[i];
      if (!Number.isInteger(length) || length < 0 || length > 15) {
        throw zipError('deflate-invalid', `Invalid ${label} Huffman code length.`);
      }
      if (length) { counts[length]++; if (length > maxBits) maxBits = length; }
    }
    if (maxBits === 0) throw zipError('deflate-invalid', `Empty ${label} Huffman tree.`);

    // Reject oversubscribed trees. Incomplete trees are legal in DEFLATE
    // (notably the one-symbol distance tree used by some encoders).
    let remaining = 1;
    for (let bits = 1; bits <= 15; bits++) {
      remaining = (remaining << 1) - counts[bits];
      if (remaining < 0) throw zipError('deflate-invalid', `Oversubscribed ${label} Huffman tree.`);
    }

    const nextCode = new Uint16Array(16);
    let code = 0;
    for (let bits = 1; bits <= 15; bits++) {
      code = (code + counts[bits - 1]) << 1;
      nextCode[bits] = code;
    }
    const maps = Array.from({ length: maxBits + 1 }, () => new Map());
    for (let symbol = 0; symbol < lengths.length; symbol++) {
      const length = lengths[symbol];
      if (length) maps[length].set(nextCode[length]++, symbol);
    }
    return { maxBits, maps };
  }

  function readHuffmanSymbol(reader, tree) {
    let code = 0;
    for (let length = 1; length <= tree.maxBits; length++) {
      code = (code << 1) | reader.readBit();
      const symbol = tree.maps[length].get(code);
      if (symbol !== undefined) return symbol;
    }
    throw zipError('deflate-invalid', 'Invalid DEFLATE Huffman code.');
  }

  function fixedTrees() {
    const literalLengths = new Uint8Array(288);
    literalLengths.fill(8, 0, 144);
    literalLengths.fill(9, 144, 256);
    literalLengths.fill(7, 256, 280);
    literalLengths.fill(8, 280, 288);
    return {
      literal: buildHuffman(literalLengths, 'fixed literal/length'),
      distance: buildHuffman(new Uint8Array(32).fill(5), 'fixed distance'),
    };
  }

  function dynamicTrees(reader) {
    const literalCount = reader.readBits(5) + 257;
    const distanceCount = reader.readBits(5) + 1;
    const codeCount = reader.readBits(4) + 4;
    if (literalCount > 286 || distanceCount > 32) throw zipError('deflate-invalid', 'Invalid DEFLATE dynamic tree size.');
    const order = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
    const codeLengths = new Uint8Array(19);
    for (let i = 0; i < codeCount; i++) codeLengths[order[i]] = reader.readBits(3);
    const codeTree = buildHuffman(codeLengths, 'code-length');
    const total = literalCount + distanceCount;
    const combined = new Uint8Array(total);
    let offset = 0;
    while (offset < total) {
      const symbol = readHuffmanSymbol(reader, codeTree);
      if (symbol <= 15) {
        combined[offset++] = symbol;
      } else if (symbol === 16) {
        if (offset === 0) throw zipError('deflate-invalid', 'DEFLATE repeat code has no previous value.');
        const count = reader.readBits(2) + 3;
        if (offset + count > total) throw zipError('deflate-invalid', 'DEFLATE code-length repeat overruns the tree.');
        combined.fill(combined[offset - 1], offset, offset + count);
        offset += count;
      } else if (symbol === 17) {
        const count = reader.readBits(3) + 3;
        if (offset + count > total) throw zipError('deflate-invalid', 'DEFLATE zero repeat overruns the tree.');
        offset += count;
      } else if (symbol === 18) {
        const count = reader.readBits(7) + 11;
        if (offset + count > total) throw zipError('deflate-invalid', 'DEFLATE long zero repeat overruns the tree.');
        offset += count;
      } else {
        throw zipError('deflate-invalid', 'Unknown DEFLATE code-length symbol.');
      }
    }
    const literalLengths = combined.subarray(0, literalCount);
    if (!literalLengths[256]) throw zipError('deflate-invalid', 'DEFLATE literal tree is missing the end-of-block code.');
    const distanceLengths = combined.subarray(literalCount);
    if (!distanceLengths.some((length) => length > 0)) {
      // RFC 1951 permits a single distance code with length zero when no
      // length/distance pair occurs. Give that otherwise-unused tree a
      // one-symbol code so it can be built without accepting any distance.
      return {
        literal: buildHuffman(literalLengths, 'dynamic literal/length'),
        distance: null,
      };
    }
    return {
      literal: buildHuffman(literalLengths, 'dynamic literal/length'),
      distance: buildHuffman(distanceLengths, 'dynamic distance'),
    };
  }

  const LENGTH_BASE = [
    3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31,
    35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258,
  ];
  const LENGTH_EXTRA = [
    0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2,
    3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
  ];
  const DISTANCE_BASE = [
    1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129,
    193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097,
    6145, 8193, 12289, 16385, 24577,
  ];
  const DISTANCE_EXTRA = [
    0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6,
    6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
  ];

  function inflateRaw(source, expectedLength, maxOutputBytes) {
    const bytes = asBytes(source);
    const limit = Number.isSafeInteger(maxOutputBytes) ? maxOutputBytes : LIMITS.maxUnpackedBytes;
    if (!Number.isSafeInteger(expectedLength) || expectedLength < 0 || expectedLength > limit) {
      throw zipError('zip-limit', 'A ZIP entry expands beyond the configured output limit.');
    }
    const output = new Uint8Array(expectedLength);
    const reader = makeBitReader(bytes);
    let outputOffset = 0;
    let finalBlock = false;
    const fixed = fixedTrees();

    const emit = (value) => {
      if (outputOffset >= output.length) throw zipError('deflate-invalid', 'DEFLATE output is longer than the declared ZIP size.');
      output[outputOffset++] = value;
    };

    while (!finalBlock) {
      finalBlock = reader.readBit() === 1;
      const blockType = reader.readBits(2);
      if (blockType === 0) {
        reader.alignByte();
        const length = reader.readAlignedUint16();
        const inverse = reader.readAlignedUint16();
        if (((length ^ inverse) & 0xffff) !== 0xffff) throw zipError('deflate-invalid', 'Invalid DEFLATE stored-block length.');
        for (let i = 0; i < length; i++) emit(reader.readAlignedByte());
        continue;
      }
      if (blockType === 3) throw zipError('deflate-invalid', 'Reserved DEFLATE block type.');
      const trees = blockType === 1 ? fixed : dynamicTrees(reader);
      while (true) {
        const symbol = readHuffmanSymbol(reader, trees.literal);
        if (symbol < 256) { emit(symbol); continue; }
        if (symbol === 256) break;
        if (symbol < 257 || symbol > 285) throw zipError('deflate-invalid', 'Reserved DEFLATE length code.');
        const lengthIndex = symbol - 257;
        const length = LENGTH_BASE[lengthIndex] + reader.readBits(LENGTH_EXTRA[lengthIndex]);
        if (!trees.distance) throw zipError('deflate-invalid', 'DEFLATE length code has no distance tree.');
        const distanceCode = readHuffmanSymbol(reader, trees.distance);
        if (distanceCode > 29) throw zipError('deflate-invalid', 'Reserved DEFLATE distance code.');
        const distance = DISTANCE_BASE[distanceCode] + reader.readBits(DISTANCE_EXTRA[distanceCode]);
        if (distance > outputOffset) throw zipError('deflate-invalid', 'DEFLATE back-reference points before the output.');
        for (let i = 0; i < length; i++) emit(output[outputOffset - distance]);
      }
    }
    if (outputOffset !== expectedLength) {
      throw zipError('deflate-invalid', `DEFLATE size mismatch: expected ${expectedLength}, got ${outputOffset}.`);
    }
    return output;
  }

  function entryBaseName(name) {
    const normalized = String(name || '').replace(/\\/g, '/');
    return normalized.slice(normalized.lastIndexOf('/') + 1).toLowerCase();
  }

  function readArchive(source, options) {
    const bytes = asBytes(source);
    const limits = { ...LIMITS, ...(options || {}) };
    if (bytes.length > limits.maxArchiveBytes) throw zipError('zip-limit', 'ZIP archive exceeds the configured compressed-size limit.');
    if (bytes.length < 22) throw zipError('zip-invalid', 'ZIP archive is too short.');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const minEocd = Math.max(0, bytes.length - 22 - 0xffff);
    let eocdOffset = -1;
    for (let offset = bytes.length - 22; offset >= minEocd; offset--) {
      if (view.getUint32(offset, true) !== 0x06054b50) continue;
      const commentLength = view.getUint16(offset + 20, true);
      if (offset + 22 + commentLength <= bytes.length) { eocdOffset = offset; break; }
    }
    if (eocdOffset < 0) throw zipError('zip-invalid', 'ZIP end-of-central-directory record was not found.');

    let entryCount = view.getUint16(eocdOffset + 10, true);
    const entriesOnDisk = view.getUint16(eocdOffset + 8, true);
    let centralSize = view.getUint32(eocdOffset + 12, true);
    let centralOffset = view.getUint32(eocdOffset + 16, true);
    const diskNumber = view.getUint16(eocdOffset + 4, true);
    const centralDiskNumber = view.getUint16(eocdOffset + 6, true);
    const locatorOffset = eocdOffset - 20;
    const hasZip64Locator = locatorOffset >= 0 && view.getUint32(locatorOffset, true) === 0x07064b50;
    const zip64Required = entryCount === 0xffff || entriesOnDisk === 0xffff ||
      centralSize === U32_MAX || centralOffset === U32_MAX;
    let usedZip64 = false;

    if (hasZip64Locator || zip64Required) {
      if (!hasZip64Locator) throw zipError('zip-invalid', 'ZIP64 end-of-central-directory locator is missing.');
      const recordDisk = view.getUint32(locatorOffset + 4, true);
      const recordOffset = checkedU64(view, locatorOffset + 8, 'end record offset');
      const diskCount = view.getUint32(locatorOffset + 16, true);
      if (recordDisk !== 0 || diskCount !== 1) {
        throw zipError('zip-multivolume', 'Multi-volume ZIP archives are not supported.');
      }
      requireRange(bytes, recordOffset, 56, 'ZIP64 end record');
      if (view.getUint32(recordOffset, true) !== 0x06064b50) throw zipError('zip-invalid', 'ZIP64 end record signature is invalid.');
      const recordSize = checkedU64(view, recordOffset + 4, 'end record size');
      if (recordSize < 44 || recordOffset + 12 + recordSize > locatorOffset) {
        throw zipError('zip-invalid', 'ZIP64 end record has an invalid size.');
      }
      const zip64Disk = view.getUint32(recordOffset + 16, true);
      const zip64CentralDisk = view.getUint32(recordOffset + 20, true);
      const zip64EntriesOnDisk = checkedU64(view, recordOffset + 24, 'entry count');
      entryCount = checkedU64(view, recordOffset + 32, 'total entry count');
      centralSize = checkedU64(view, recordOffset + 40, 'central directory size');
      centralOffset = checkedU64(view, recordOffset + 48, 'central directory offset');
      if (zip64Disk !== 0 || zip64CentralDisk !== 0 || zip64EntriesOnDisk !== entryCount) {
        throw zipError('zip-multivolume', 'Multi-volume ZIP archives are not supported.');
      }
      usedZip64 = true;
    } else if (diskNumber !== 0 || centralDiskNumber !== 0 || entriesOnDisk !== entryCount) {
      throw zipError('zip-multivolume', 'Multi-volume ZIP archives are not supported.');
    }

    if (entryCount > limits.maxEntries) throw zipError('zip-limit', `ZIP contains more than ${limits.maxEntries} entries.`);
    if (!Number.isSafeInteger(centralOffset) || !Number.isSafeInteger(centralSize)) throw zipError('zip-limit', 'ZIP central directory is too large.');
    requireRange(bytes, centralOffset, centralSize, 'central directory');
    const entries = [];
    let position = centralOffset;
    let totalUnpacked = 0;

    for (let index = 0; index < entryCount; index++) {
      requireRange(bytes, position, 46, 'central directory entry');
      if (view.getUint32(position, true) !== 0x02014b50) throw zipError('zip-invalid', 'Central directory entry signature is invalid.');
      const flags = view.getUint16(position + 8, true);
      const method = view.getUint16(position + 10, true);
      const checksum = view.getUint32(position + 16, true);
      let compressedSize = view.getUint32(position + 20, true);
      let uncompressedSize = view.getUint32(position + 24, true);
      const nameLength = view.getUint16(position + 28, true);
      const extraLength = view.getUint16(position + 30, true);
      const commentLength = view.getUint16(position + 32, true);
      let startDisk = view.getUint16(position + 34, true);
      let localOffset = view.getUint32(position + 42, true);
      if (nameLength > limits.maxNameBytes) throw zipError('zip-limit', 'ZIP entry name is too long.');
      requireRange(bytes, position + 46, nameLength + extraLength + commentLength, 'central directory fields');
      const nameBytes = bytes.subarray(position + 46, position + 46 + nameLength);
      const name = decodeName(nameBytes, (flags & 0x0800) !== 0);
      const extraStart = position + 46 + nameLength;
      let zip64Extra = null;
      let extraOffset = extraStart;
      const extraEnd = extraStart + extraLength;
      while (extraOffset + 4 <= extraEnd) {
        const tag = view.getUint16(extraOffset, true);
        const length = view.getUint16(extraOffset + 2, true);
        const body = extraOffset + 4;
        if (body + length > extraEnd) throw zipError('zip-invalid', 'ZIP extra field is truncated.');
        if (tag === 0x0001) zip64Extra = { offset: body, length };
        extraOffset = body + length;
      }
      if (extraOffset !== extraEnd) throw zipError('zip-invalid', 'ZIP extra-field list is malformed.');
      if (uncompressedSize === U32_MAX || compressedSize === U32_MAX || localOffset === U32_MAX || startDisk === 0xffff) {
        if (!zip64Extra) throw zipError('zip-invalid', `ZIP64 values for "${name}" are missing.`);
        let cursor = zip64Extra.offset;
        const limit = cursor + zip64Extra.length;
        const take64 = (label) => { if (cursor + 8 > limit) throw zipError('zip-invalid', `ZIP64 ${label} for "${name}" is missing.`); const value = checkedU64(view, cursor, label); cursor += 8; return value; };
        const take32 = (label) => { if (cursor + 4 > limit) throw zipError('zip-invalid', `ZIP64 ${label} for "${name}" is missing.`); const value = view.getUint32(cursor, true); cursor += 4; return value; };
        if (uncompressedSize === U32_MAX) uncompressedSize = take64('uncompressed size');
        if (compressedSize === U32_MAX) compressedSize = take64('compressed size');
        if (localOffset === U32_MAX) localOffset = take64('local header offset');
        if (startDisk === 0xffff) startDisk = take32('disk number');
      }
      if (startDisk !== 0) throw zipError('zip-multivolume', 'Multi-volume ZIP archives are not supported.');
      if ((flags & 0x0001) || (flags & 0x0040) || (flags & 0x2000)) {
        throw zipError('zip-encrypted', 'Encrypted ZIP archives are not supported.');
      }
      if (!Number.isSafeInteger(compressedSize) || !Number.isSafeInteger(uncompressedSize) || !Number.isSafeInteger(localOffset)) {
        throw zipError('zip-limit', `ZIP entry "${name}" is larger than the supported address range.`);
      }
      if (uncompressedSize > limits.maxUnpackedBytes || totalUnpacked + uncompressedSize > limits.maxUnpackedBytes) {
        throw zipError('zip-limit', `ZIP expanded data exceeds the ${Math.round(limits.maxUnpackedBytes / (1024 * 1024))} MiB safety limit.`);
      }
      totalUnpacked += uncompressedSize;
      const fileName = entryBaseName(name);
      requireRange(bytes, localOffset, 30, `local header for "${name}"`);
      if (view.getUint32(localOffset, true) !== 0x04034b50) throw zipError('zip-invalid', `Local header for "${name}" is invalid.`);
      const localFlags = view.getUint16(localOffset + 6, true);
      const localMethod = view.getUint16(localOffset + 8, true);
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      if ((localFlags & 0x0001) || (localFlags & 0x0040) || (localFlags & 0x2000)) {
        throw zipError('zip-encrypted', 'Encrypted ZIP archives are not supported.');
      }
      if (localMethod !== method) throw zipError('zip-invalid', `Compression method differs between ZIP headers for "${name}".`);
      requireRange(bytes, localOffset + 30, localNameLength + localExtraLength, `local header fields for "${name}"`);
      const localName = decodeName(bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength), (localFlags & 0x0800) !== 0);
      if (localName !== name) throw zipError('zip-invalid', `Entry name differs between ZIP headers for "${name}".`);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      requireRange(bytes, dataOffset, compressedSize, `compressed data for "${name}"`);
      const compressed = bytes.subarray(dataOffset, dataOffset + compressedSize);
      let data = null;
      let unsupportedReason = null;
      if (method === 0) {
        if (compressedSize !== uncompressedSize) throw zipError('zip-invalid', `Stored entry "${name}" has inconsistent sizes.`);
        data = compressed.slice();
      } else if (method === 8) {
        data = inflateRaw(compressed, uncompressedSize, limits.maxUnpackedBytes - (totalUnpacked - uncompressedSize));
      } else {
        unsupportedReason = `Unsupported ZIP compression method ${method}`;
        if (fileName === 'score.gpif') throw zipError('zip-compression', `The GPIF score uses unsupported ZIP compression method ${method}.`);
      }
      if (data && crc32(data) !== checksum) throw zipError('zip-crc', `CRC-32 check failed for ZIP entry "${name}".`);
      entries.push({
        name,
        fileName,
        flags,
        method,
        crc32: checksum,
        compressedSize,
        uncompressedSize,
        localOffset,
        data,
        unsupportedReason,
      });
      position += 46 + nameLength + extraLength + commentLength;
    }
    if (position > centralOffset + centralSize) throw zipError('zip-invalid', 'Central directory entries exceed the declared directory size.');
    return { entries, zip64: usedZip64, totalUnpackedBytes: totalUnpacked };
  }

  function writeStoredArchive(inputEntries) {
    const entries = (inputEntries || []).filter((entry) => entry && entry.data != null).map((entry) => ({
      name: String(entry.name || ''),
      data: asBytes(entry.data),
    }));
    if (!entries.length) throw zipError('zip-invalid', 'No ZIP entries to write.');
    if (entries.length > 0xffff) throw zipError('zip-limit', 'Too many entries for a normalized ZIP archive.');
    const encoder = new TextEncoder();
    const prepared = entries.map((entry) => {
      const name = encoder.encode(entry.name);
      if (!name.length || name.length > 0xffff || entry.name.includes('\0')) throw zipError('zip-invalid', 'Invalid ZIP entry name.');
      return { ...entry, nameBytes: name, crc: crc32(entry.data), offset: 0 };
    });
    let localSize = 0;
    for (const entry of prepared) localSize += 30 + entry.nameBytes.length + entry.data.length;
    let centralSize = 0;
    for (const entry of prepared) centralSize += 46 + entry.nameBytes.length;
    const totalSize = localSize + centralSize + 22;
    if (totalSize > LIMITS.maxUnpackedBytes || localSize > U32_MAX || centralSize > U32_MAX) {
      throw zipError('zip-limit', 'Normalized GPIF archive exceeds the supported size.');
    }
    const output = new Uint8Array(totalSize);
    const view = new DataView(output.buffer);
    let position = 0;
    for (const entry of prepared) {
      entry.offset = position;
      view.setUint32(position, 0x04034b50, true);
      view.setUint16(position + 4, 20, true);
      view.setUint16(position + 6, 0x0800, true); // UTF-8 name, no encryption or data descriptor.
      view.setUint16(position + 8, 0, true); // stored
      view.setUint16(position + 10, 0, true);
      view.setUint16(position + 12, 0, true);
      view.setUint32(position + 14, entry.crc, true);
      view.setUint32(position + 18, entry.data.length, true);
      view.setUint32(position + 22, entry.data.length, true);
      view.setUint16(position + 26, entry.nameBytes.length, true);
      view.setUint16(position + 28, 0, true);
      output.set(entry.nameBytes, position + 30);
      output.set(entry.data, position + 30 + entry.nameBytes.length);
      position += 30 + entry.nameBytes.length + entry.data.length;
    }
    const centralOffset = position;
    for (const entry of prepared) {
      view.setUint32(position, 0x02014b50, true);
      view.setUint16(position + 4, 20, true);
      view.setUint16(position + 6, 20, true);
      view.setUint16(position + 8, 0x0800, true);
      view.setUint16(position + 10, 0, true);
      view.setUint16(position + 12, 0, true);
      view.setUint16(position + 14, 0, true);
      view.setUint32(position + 16, entry.crc, true);
      view.setUint32(position + 20, entry.data.length, true);
      view.setUint32(position + 24, entry.data.length, true);
      view.setUint16(position + 28, entry.nameBytes.length, true);
      view.setUint16(position + 30, 0, true);
      view.setUint16(position + 32, 0, true);
      view.setUint16(position + 34, 0, true);
      view.setUint16(position + 36, 0, true);
      view.setUint32(position + 38, 0, true);
      view.setUint32(position + 42, entry.offset, true);
      output.set(entry.nameBytes, position + 46);
      position += 46 + entry.nameBytes.length;
    }
    const centralLength = position - centralOffset;
    view.setUint32(position, 0x06054b50, true);
    view.setUint16(position + 4, 0, true);
    view.setUint16(position + 6, 0, true);
    view.setUint16(position + 8, prepared.length, true);
    view.setUint16(position + 10, prepared.length, true);
    view.setUint32(position + 12, centralLength, true);
    view.setUint32(position + 16, centralOffset, true);
    view.setUint16(position + 20, 0, true);
    return output;
  }

  return Object.freeze({ LIMITS, crc32, inflateRaw, readArchive, writeStoredArchive });
});
