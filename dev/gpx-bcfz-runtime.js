/*
 * STRUCHORD Guitar Pro 6 (.gpx) container codec — BCFZ decompressor + BCFS reader.
 *
 * A .gpx file written by Guitar Pro 6 is a proprietary container, not a ZIP:
 *
 *   BCFZ  LE32 decompressed-size  <bit stream>
 *   BCFS  <block 0 header> <directory slots> <file data blocks>   (uncompressed form)
 *
 * The BCFZ bit stream is read MSB-first from a byte boundary:
 *   1 bit  flag — 0: literal run (2 bits = byte count, then the bytes);
 *                  1: back reference (4 bits = word size, then `word size` bits of
 *                     distance LSB-first, then `word size` bits of length LSB-first);
 *   copying is byte-wise, so a reference may repeat the tail it just produced.
 *
 * The decompressed image is a BCFS filesystem: 4 magic bytes, then 4096-byte blocks.
 * Block 0 is the header; the remaining blocks are directory records (type 2 = file)
 * or file payload. Each record keeps its name at +4 (127 bytes, NUL-padded), the byte
 * size at +140, and the list of payload block indexes at +148.
 *
 * Written for this project from the format description and verified against real
 * Guitar Pro 6 files; no runtime dependency, network access, or platform API is used.
 * The browser build is embedded in STRUCHORD.html as an inert script and is activated
 * only when a .gpx file is imported.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.StruchordGpxBcfz = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const HEADER_BCFS = 'BCFS';
  const HEADER_BCFZ = 'BCFZ';
  const BLOCK_SIZE = 4096;
  const RECORD_FILE = 2;
  const RECORD_FOLDER = 1;
  const NAME_OFFSET = 4;
  const NAME_MAX = 127;
  const SIZE_OFFSET = 140;
  const BLOCKS_OFFSET = 148;

  const LIMITS = Object.freeze({
    maxFileBytes: 64 * 1024 * 1024,
    maxUnpackedBytes: 128 * 1024 * 1024,
    maxBlocks: 32768,
    maxEntries: 512,
    maxEntryBytes: 32 * 1024 * 1024,
    maxBlockRefs: 65536,
    maxStreamSteps: 96 * 1024 * 1024,
  });

  function containerError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function asBytes(source) {
    if (source instanceof Uint8Array) return source;
    if (source instanceof ArrayBuffer) return new Uint8Array(source);
    if (ArrayBuffer.isView(source)) return new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
    throw containerError('bcfz-invalid', 'Expected a byte array.');
  }

  function magic(bytes, offset) {
    if (offset < 0 || offset + 4 > bytes.byteLength) return '';
    return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
  }

  function readU32(bytes, offset) {
    if (offset < 0 || offset + 4 > bytes.byteLength) return -1;
    return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
  }

  function printableName(bytes, offset) {
    if (offset < 0 || offset + NAME_MAX > bytes.byteLength) return '';
    let name = '';
    for (let index = 0; index < NAME_MAX; index++) {
      const code = bytes[offset + index];
      if (code === 0) break;
      // Child-index blocks of a folder start with binary length fields; they must not
      // pass as file names, otherwise garbage entries reach the import.
      if (code < 0x20 || code > 0x7e) return '';
      name += String.fromCharCode(code);
    }
    return name;
  }

  /** MSB-first bit reader over a byte range; returns -1 at end of input. */
  function BitReader(bytes, offset) {
    this.bytes = bytes;
    this.position = offset;
    this.current = 0;
    this.available = 0;
  }

  BitReader.prototype.readBit = function readBit() {
    if (this.available === 0) {
      if (this.position >= this.bytes.byteLength) return -1;
      this.current = this.bytes[this.position];
      this.position += 1;
      this.available = 8;
    }
    this.available -= 1;
    return (this.current >> this.available) & 1;
  };

  BitReader.prototype.readBits = function readBits(count) {
    let value = 0;
    for (let index = 0; index < count; index++) {
      const bit = this.readBit();
      if (bit < 0) return -1;
      value = value * 2 + bit;
    }
    return value;
  };

  BitReader.prototype.readBitsReversed = function readBitsReversed(count) {
    let value = 0;
    for (let index = 0; index < count; index++) {
      const bit = this.readBit();
      if (bit < 0) return -1;
      value += bit * Math.pow(2, index);
    }
    return value;
  };

  BitReader.prototype.readByte = function readByte() {
    return this.readBits(8);
  };

  function resolveLimits(options) {
    const given = options || {};
    const maxFileBytes = Number.isSafeInteger(given.maxFileBytes) && given.maxFileBytes > 0
      ? given.maxFileBytes : LIMITS.maxFileBytes;
    const maxUnpackedBytes = Number.isSafeInteger(given.maxUnpackedBytes) && given.maxUnpackedBytes > 0
      ? given.maxUnpackedBytes : LIMITS.maxUnpackedBytes;
    if (maxFileBytes > LIMITS.maxFileBytes || maxUnpackedBytes > LIMITS.maxUnpackedBytes) {
      throw containerError('bcfz-limit', 'Requested limits exceed the built-in safety limits.');
    }
    return { maxFileBytes, maxUnpackedBytes };
  }

  /** Header sniff: 'BCFZ', 'BCFS' or '' when the file is not a Guitar Pro 6 container. */
  function sniff(source) {
    const bytes = asBytes(source);
    const head = magic(bytes, 0);
    return head === HEADER_BCFZ || head === HEADER_BCFS ? head : '';
  }

  /**
   * Decompress a BCFZ container into its BCFS image.
   * The returned bytes still start with the 'BCFS' magic written by Guitar Pro.
   */
  function decompressBcfz(source, options) {
    const bytes = asBytes(source);
    const limits = resolveLimits(options);
    if (magic(bytes, 0) !== HEADER_BCFZ) {
      throw containerError('bcfz-invalid', 'File does not start with the BCFZ signature.');
    }
    if (bytes.byteLength < 12) throw containerError('bcfz-invalid', 'BCFZ container is truncated.');
    const declared = readU32(bytes, 4);
    if (declared < 16) throw containerError('bcfz-invalid', 'BCFZ declares an implausible output size.');
    if (declared > limits.maxUnpackedBytes) {
      throw containerError('bcfz-limit', 'BCFZ container expands beyond the supported size.');
    }
    const reader = new BitReader(bytes, 8);
    const out = new Uint8Array(declared);
    let length = 0;
    let steps = 0;
    while (length < declared) {
      if (++steps > LIMITS.maxStreamSteps) throw containerError('bcfz-limit', 'BCFZ bit stream does not terminate.');
      const flag = reader.readBit();
      if (flag < 0) break;
      if (flag === 1) {
        const wordSize = reader.readBits(4);
        const distance = reader.readBitsReversed(wordSize);
        const lengthBits = reader.readBitsReversed(wordSize);
        if (wordSize < 1 || distance < 1 || distance > length || lengthBits < 1) {
          throw containerError('bcfz-invalid', 'BCFZ back reference points outside the decoded data.');
        }
        const count = Math.min(lengthBits, declared - length);
        const from = length - distance;
        for (let index = 0; index < count; index++) out[length++] = out[from + index];
      } else {
        const count = reader.readBitsReversed(2);
        for (let index = 0; index < count && length < declared; index++) {
          const byte = reader.readByte();
          if (byte < 0) break;
          out[length++] = byte;
        }
      }
    }
    if (length < declared) {
      // Guitar Pro stops the stream without padding the tail; keep what was decoded
      // and let the filesystem pass decide which files are still complete.
      return { data: out.subarray(0, length), declaredBytes: declared, truncated: true };
    }
    return { data: out, declaredBytes: declared, truncated: false };
  }

  /** Read the BCFS filesystem: every file record found in the block array. */
  function readFilesystem(source, options) {
    const image = asBytes(source);
    const limits = resolveLimits(options);
    if (magic(image, 0) !== HEADER_BCFS) {
      throw containerError('bcfz-invalid', 'Decompressed data is not a BCFS filesystem.');
    }
    const availableBlocks = Math.floor((image.byteLength - 4) / BLOCK_SIZE);
    if (availableBlocks > LIMITS.maxBlocks) throw containerError('bcfz-limit', 'BCFS filesystem exceeds the supported size.');
    const entries = [];
    const skipped = [];
    let folders = 0;
    for (let block = 0; block < availableBlocks; block++) {
      const base = 4 + block * BLOCK_SIZE;
      if (base + 4 > image.byteLength) break;
      const type = readU32(image, base);
      if (type === RECORD_FOLDER) { folders++; continue; }
      if (type !== RECORD_FILE) continue;
      const name = printableName(image, base + NAME_OFFSET);
      if (!name) continue;
      if (entries.length + skipped.length >= LIMITS.maxEntries) {
        skipped.push({ name: name.slice(0, NAME_MAX), reason: 'слишком много файлов в контейнере' });
        continue;
      }
      const size = readU32(image, base + SIZE_OFFSET);
      if (size < 0 || size > LIMITS.maxEntryBytes) {
        skipped.push({ name, reason: 'размер файла вне безопасного предела' });
        continue;
      }
      const indexes = [];
      let cursor = base + BLOCKS_OFFSET;
      let overflow = false;
      while (true) {
        const index = readU32(image, cursor);
        if (index < 0) break;
        if (index === 0) break;
        if (index >= availableBlocks) { overflow = true; break; }
        indexes.push(index);
        if (indexes.length > LIMITS.maxBlockRefs) { overflow = true; break; }
        cursor += 4;
      }
      if (overflow) {
        skipped.push({ name, reason: 'ссылка на блок вне контейнера' });
        continue;
      }
      const needed = Math.ceil(size / BLOCK_SIZE);
      if (indexes.length < needed) {
        skipped.push({ name, reason: 'файл обрезан: не хватает блоков' });
        continue;
      }
      const data = new Uint8Array(size);
      let written = 0;
      for (let position = 0; position < indexes.length && written < size; position++) {
        const start = 4 + indexes[position] * BLOCK_SIZE;
        const chunk = image.subarray(start, Math.min(start + BLOCK_SIZE, image.byteLength));
        const take = Math.min(chunk.length, size - written);
        data.set(chunk.subarray(0, take), written);
        written += take;
      }
      if (written < size) {
        skipped.push({ name, reason: 'файл обрезан: блоки кончились' });
        continue;
      }
      entries.push({ name, size, data, blockCount: indexes.length });
    }
    return { entries, skipped, folders, blockCount: availableBlocks };
  }

  /** Read a whole .gpx container: sniff, inflate when needed, list the files. */
  function readContainer(source, options) {
    const bytes = asBytes(source);
    const limits = resolveLimits(options);
    if (bytes.byteLength < 8) throw containerError('bcfz-invalid', 'Файл .gpx слишком короткий или повреждён.');
    if (bytes.byteLength > limits.maxFileBytes) {
      throw containerError('bcfz-limit', 'Файл .gpx больше допустимого размера.');
    }
    const header = magic(bytes, 0);
    let image;
    let compressed = false;
    let declaredBytes = 0;
    let truncated = false;
    if (header === HEADER_BCFZ) {
      const inflated = decompressBcfz(bytes, limits);
      image = inflated.data;
      declaredBytes = inflated.declaredBytes;
      truncated = inflated.truncated;
      compressed = true;
    } else if (header === HEADER_BCFS) {
      image = bytes;
      declaredBytes = bytes.byteLength;
    } else {
      throw containerError('bcfz-invalid', 'Файл не является контейнером Guitar Pro 6 (ожидалась подпись BCFZ или BCFS).');
    }
    if (image.byteLength > limits.maxUnpackedBytes) {
      throw containerError('bcfz-limit', 'Распакованный .gpx превышает безопасный лимит.');
    }
    const filesystem = readFilesystem(image, limits);
    return {
      container: header,
      compressed,
      declaredBytes,
      imageBytes: image.byteLength,
      truncated,
      entries: filesystem.entries,
      skipped: filesystem.skipped,
      folders: filesystem.folders,
      blockCount: filesystem.blockCount,
    };
  }

  return Object.freeze({
    HEADER_BCFS,
    HEADER_BCFZ,
    BLOCK_SIZE,
    LIMITS,
    sniff,
    decompressBcfz,
    readFilesystem,
    readContainer,
  });
});