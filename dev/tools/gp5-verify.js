#!/usr/bin/env node
/*
 * gp5-verify.js — независимый разбор .gp5 по схеме GP5.1 и сверка нашей записи.
 *
 * Использование: node dev/tools/gp5-verify.js <файл.gp5>
 * Печатает итог по дорожкам и списком подозрительных мест, если формат нарушен.
 */
const fs = require('fs');

const file = process.argv[2];
const options = {};
if (file && file.startsWith('--')) {
  options.trace = true;
  file = process.argv[3];
}
if (file && !options.trace) options.file = true;

/** Разбирает буфер .gp5 и возвращает полную картину файла. */
function parseGp5(input, opts = {}) {
const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
let at = 0;
const problems = [];
const note = (message) => {
  const line = `@${at}: ${message}`;
  if (problems.length < 20) problems.push(line);
  if (opts.trace) console.error(line);
};

function need(count) {
  if (at + count > buf.length) throw new Error(`файл закончился: нужно ${count} байт с ${at}, есть ${buf.length - at}`);
}
const u8 = () => { need(1); return buf[at++]; };
const i8 = () => { need(1); const v = buf.readInt8(at); at += 1; return v; };
const u16 = () => { need(2); const v = buf.readUInt16LE(at); at += 2; return v; };
const i16 = () => { need(2); const v = buf.readInt16LE(at); at += 2; return v; };
const i32 = () => { need(4); const v = buf.readInt32LE(at); at += 4; return v; };
const skip = (count) => { need(count); at += count; };
const f64 = () => { need(8); const v = buf.readDoubleLE(at); at += 8; return v; };
const byteString = (size) => { const length = u8(); const raw = buf.slice(at, at + size); at += size; return raw.slice(0, length).toString('latin1'); };
const intSizeString = () => { const length = i32(); if (length < 0 || length > buf.length) { note(`intSizeString с длиной ${length}`); throw new Error(`неверная длина строки ${length}`); } const raw = buf.slice(at, at + length); at += length; return raw.toString('latin1'); };
const intByteSizeString = () => {
  const count = i32();
  if (count < 1 || count > buf.length) { note(`intByteSizeString с длиной ${count}`); throw new Error(`неверная длина строки ${count}`); }
  const length = u8();
  const raw = buf.slice(at, at + count - 1);
  at += count - 1;
  return raw.slice(0, length).toString('latin1');
};

// Строки GP5 записаны в однобайтовой кодировке (обычно windows-1251).
const CP1251 = new TextDecoder('windows-1251');
const decodeText = (text) => {
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index++) bytes[index] = text.charCodeAt(index) & 0xff;
  return CP1251.decode(bytes);
};

const version = byteString(30).replace(/\0+$/, '');
const title = decodeText(intByteSizeString());
const subtitle = decodeText(intByteSizeString());
const artist = decodeText(intByteSizeString());
const album = decodeText(intByteSizeString());
const words = decodeText(intByteSizeString());
const music = decodeText(intByteSizeString());
const copyright = decodeText(intByteSizeString());
intByteSizeString();
intByteSizeString();
const noticeCount = i32();
if (noticeCount < 0 || noticeCount > 100) { note(`подозрительное число примечаний: ${noticeCount}`); throw new Error('битый info-блок'); }
for (let index = 0; index < noticeCount; index++) intByteSizeString();

const lyricTrack = i32();
const lyrics = [];
for (let line = 0; line < 5; line++) {
  const bar = i32();
  const text = decodeText(intSizeString());
  if (bar || text) lyrics.push({ bar, text });
}

// RSE мастера GP5.1: громкость, резерв и одиннадцатиполосный эквалайзер.
const masterVolume = i32();
i32();
const masterEq = [];
for (let band = 0; band < 11; band++) masterEq.push(i8());

// Параметры страницы: размер, поля, масштаб, флаги колонтитулов, 10 шаблонов.
const page = [i32(), i32(), i32(), i32(), i32(), i32(), i32()];
const headerFooter = i16();
for (let index = 0; index < 10; index++) intByteSizeString();

const tempoName = decodeText(intByteSizeString());
const tempo = i32();
const hideTempo = u8();
const key = i8();
const octave = i32();

const channels = [];
for (let channel = 0; channel < 64; channel++) {
  const instrument = i32();
  const values = [u8(), u8(), u8(), u8(), u8(), u8()];
  skip(2);
  if (instrument !== -1) channels.push({ channel: channel + 1, instrument, values });
}

const directions = [];
for (let index = 0; index < 19; index++) directions.push(i16());
const masterReverb = i32();
const measureCount = i32();
const trackCount = i32();
if (measureCount < 0 || measureCount > 10000) { note(`неверное число тактов: ${measureCount}`); throw new Error('битые счётчики'); }
if (trackCount < 0 || trackCount > 100) { note(`неверное число дорожек: ${trackCount}`); throw new Error('битые счётчики'); }

const measureHeaders = [];
for (let index = 0; index < measureCount; index++) {
  if (index > 0) skip(1);
  const flags = u8();
  const header = { index, flags };
  if (flags & 0x01) header.numerator = i8();
  if (flags & 0x02) header.denominator = i8();
  if (flags & 0x04) header.repeatOpen = true;
  if (flags & 0x08) {
    // GP5: байт — число ПРОХОДОВ повторяемой секции («×2» — это 2);
    // GP3/GP4 хранят в этом месте число дополнительных повторов.
    header.repeatClose = i8();
    header.passes = header.repeatClose;
    header.repeatCount = header.repeatClose - 1;
  }
  if (flags & 0x20) { header.marker = decodeText(intByteSizeString()); skip(4); }
  if (flags & 0x40) { header.keyRoot = i8(); header.keyType = i8(); }
  if (flags & 0x03) skip(4);
  header.alternateEndings = u8();
  header.tripletFeel = u8();
  measureHeaders.push(header);
}

const tracks = [];
for (let index = 0; index < trackCount; index++) {
  if (index === 0) skip(1);
  const flags = u8();
  const name = decodeText(byteString(40).replace(/\0+$/, ''));
  const stringCount = i32();
  const tuning = [];
  for (let string = 0; string < 7; string++) { const value = i32(); if (string < stringCount) tuning.push(value); }
  const port = i32();
  const channel = i32();
  const effectChannel = i32();
  const fretCount = i32();
  const capo = i32();
  const color = [u8(), u8(), u8(), u8()];
  const display = i16();
  const autoAccent = u8();
  const bank = u8();
  const humanize = u8();
  const clef = i32();
  const clefSecondary = i32();
  const unknown = i32();
  skip(12);
  const instrument = i32();
  const instrumentUnknown = i32();
  const soundBank = i32();
  const effectNumber = i32();
  skip(4); // трёхполосный эквалайзер
  const effect = intByteSizeString();
  const effectCategory = intByteSizeString();
  tracks.push({ index, name, flags, stringCount, tuning, port, channel, capo, display, instrument, effect, effectCategory });
}
skip(1); // хвост после дорожек

const barStats = [];
let totalBeats = 0;
let totalNotes = 0;
for (let bar = 0; bar < measureCount; bar++) {
  const barBeats = [];
  for (let trackIndex = 0; trackIndex < trackCount; trackIndex++) {
    for (let voice = 0; voice < 2; voice++) {
      const beatCount = i32();
      const trace = !!opts.trace && bar === 0;
      if (trace) console.error(`такт 0 дорожка ${trackIndex} голос ${voice}: позиция ${at}, битов ${beatCount}`);
      if (beatCount < 0 || beatCount > 1000) { note(`неверное число битов: ${beatCount}`); throw new Error(`битый такт ${bar}, дорожка ${trackIndex}, голос ${voice}`); }
      for (let index = 0; index < beatCount; index++) {
        const flags = u8();
        if (process.env.GP5_FIND_MIX && (flags & 0x10)) console.error('бит с mix change @' + (at - 1) + ' флаги 0x' + flags.toString(16));
        if (flags & 0x40) u8();
        const duration = i8();
        if (duration < -6 || duration > 12) note(`странный код длительности ${duration}`);
        if (flags & 0x20) i32();
        if (trace) console.error('  бит: позиция перед аккордом', at);
        if (flags & 0x02) {
          // диаграмма аккорда: старый формат GP3 или новый GP4
          const newFormat = u8();
          if (newFormat) {
            u8(); // sharp
            skip(3);
            u8(); u8(); u8(); // root, type, extension
            i32(); i32(); // bass, alteration тоники
            u8(); // добавить основу
            byteString(22); // название аккорда
            u8(); u8(); u8(); // alteration квинты, терции, секты
            i32(); // первый лад
            for (let fretIndex = 0; fretIndex < 7; fretIndex++) i32();
            u8(); // число баррэ
            skip(15);
            skip(7);
            skip(1);
            skip(7);
            u8();
          } else {
            intByteSizeString();
            const firstFret = i32();
            if (firstFret) skip(24);
          }
        }
        if (flags & 0x04) intByteSizeString();
        if (trace) console.error('  бит: позиция перед эффектами бита', at);
        if (flags & 0x08) {
          const flags1 = u8();
          const flags2 = u8();
          if (flags1 & 0x20) u8();
          if (flags2 & 0x04) { i8(); i32(); const points = i32(); for (let point = 0; point < points; point++) { i32(); i32(); u8(); } }
          if (flags1 & 0x40) { u8(); u8(); }
          if (flags2 & 0x02) u8();
        }
        if (trace) console.error('  бит: позиция перед mix change', at);
        if (flags & 0x10) {
          i8(); // инструмент
          i32(); i32(); i32(); i32(); // RSE-инструмент
          const values = [i8(), i8(), i8(), i8(), i8(), i8()];
          intByteSizeString(); // название темпа
          const mixTempo = i32();
          for (let index2 = 0; index2 < 6; index2++) if (values[index2] >= 0) u8();
          if (mixTempo >= 0) { u8(); u8(); }
          u8(); // флаги
          u8(); // wah
          intByteSizeString();
          intByteSizeString();
        }
        if (trace) console.error('  бит: позиция перед нотами', at);
        const stringFlags = u8();
        const strings = [];
        for (let string = 0; string < 7; string++) if (stringFlags & (1 << (6 - string))) strings.push(string);
        for (let string = 0; string < strings.length; string++) {
          const noteFlags = u8();
          if (noteFlags & 0x20) u8();
          if (noteFlags & 0x10) i8();
          if (noteFlags & 0x20) i8();
          if (noteFlags & 0x80) { i8(); i8(); }
          if (noteFlags & 0x01) f64();
          u8();
          if (noteFlags & 0x08) {
            const flags1 = u8();
            const flags2 = u8();
            if (flags1 & 0x01) {
              i8(); i32(); const count = i32();
              for (let point = 0; point < count; point++) { i32(); i32(); u8(); }
            }
            if (flags1 & 0x10) { u8(); u8(); u8(); u8(); u8(); }
            if (flags2 & 0x04) u8();
            if (flags2 & 0x08) u8();
            if (flags2 & 0x10) {
              const type = i8();
              if (type === 2 || type === 4 || type === 5) { u8(); i8(); u8(); } else if (type === 3) u8();
            }
            if (flags2 & 0x20) { i8(); i8(); }
          }
          totalNotes++;
        }
        const displayFlags = i16();
        if (displayFlags & 0x0800) u8();
        if (trace) console.error('  бит: позиция после нот', at);
        barBeats.push(strings.length);
        totalBeats++;
      }
    }
    if (at < buf.length) skip(1); // разрыв строки
  }
  barStats.push(barBeats.reduce((sum, value) => sum + value, 0));
}

const result = {
  version, title, subtitle, artist, album, words, music, copyright, noticeCount,
  lyricTrack, lyrics, masterVolume, masterEq, masterReverb, page, headerFooter,
  tempoName, tempo, hideTempo, key, octave, channels, measureCount, trackCount,
  measureHeaders, tracks, barStats, totalBeats, totalNotes, problems, size: buf.length,
  consumed: at, trailing: buf.length - at,
};
if (!opts.quiet) printReport(result, opts.file ? file : 'буфер');
return result;
}

/** Печатает человекочитаемый итог разбора файла. */
function printReport(result, file) {
const { version, title, subtitle, artist, album, words, music, copyright, noticeCount,
  lyricTrack, lyrics, masterVolume, masterEq, masterReverb, page, headerFooter,
  tempoName, tempo, hideTempo, key, octave, channels, measureCount, trackCount,
  measureHeaders, tracks, barStats, totalBeats, totalNotes, problems, size, consumed } = result;
console.log('файл:', file, '|', size, 'байт');
console.log('версия:', JSON.stringify(version));
console.log('сведения:', JSON.stringify({ title, subtitle, artist, album, words, music, copyright, noticeCount }));
console.log('лирика: дорожка', lyricTrack, JSON.stringify(lyrics));
console.log('мастер:', JSON.stringify({ masterVolume, masterEq, masterReverb }));
console.log('страница:', JSON.stringify({ page, headerFooter }));
console.log('темп:', JSON.stringify({ tempoName, tempo, hideTempo, key, octave }));
console.log('каналы:', JSON.stringify(channels.slice(0, 6)));
console.log('счётчики: тактов', measureCount, '| дорожек', trackCount);
console.log('заголовки тактов:', JSON.stringify(measureHeaders.slice(0, 4)));
console.log('дорожки:', JSON.stringify(tracks.map((track) => ({
  имя: track.name, струн: track.stringCount, строй: track.tuning, канал: track.channel,
  капо: track.capo, инструмент: track.instrument, перкуссия: !!(track.flags & 0x01), эффект: track.effect,
}))));
console.log('итог: битов', totalBeats, '| нот', totalNotes, '| нот по тактам', JSON.stringify(barStats.slice(0, 12)));
console.log('позиция после разбора:', consumed, 'из', size, consumed === size ? '(файл дочитан полностью)' : '(остаток: ' + (size - consumed) + ' байт)');
if (problems.length) console.log('замечания:', problems);
}
if (require.main === module) {
  if (!file) {
    console.error('Укажите файл: node dev/tools/gp5-verify.js song.gp5');
    process.exit(2);
  }
  try {
    parseGp5(fs.readFileSync(file), { file: true });
  } catch (error) {
    console.error(String(error.message || error));
    process.exit(1);
  }
}

module.exports = { parseGp5 };
