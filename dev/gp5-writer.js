/*
 * STRUCHORD Guitar Pro 5 writer.
 *
 * Builds a binary `.gp5` (Guitar Pro 5.1, "FICHIER GUITAR PRO v5.10") from the
 * same plain song model that the GPIF writer consumes: bars, sections, tracks,
 * notes, mixer, lyrics and metadata. The produced file is read back by the
 * application's own importer (through the bundled alphaTab engine) and by any
 * other Guitar Pro 3–5 reader, which is what the round-trip acceptance checks.
 *
 * Layout (verified against the field layout of real `.gp5` files and against
 * the reader/writer of an independent implementation):
 *   version string → info (9 strings + notices) → lyrics (track + 5 lines)
 *   → master RSE (19 bytes) → page setup → tempo label, tempo, hide tempo
 *   → key, octave → 64 MIDI channels → 19 repeat directions → master reverb
 *   → measure count, track count → measure headers → tracks (+ padding)
 *   → measures (timewise: for every bar, every track, two voices + line break)
 *
 * Notes are stored as string + fret, so pitch-only tracks get a default
 * tuning and drums become a percussion track whose strings are the drum lanes.
 * Words of a lyric line are bound to successive notes of the track, exactly the
 * way Guitar Pro 5 stores them.
 *
 * Written for this project; no runtime dependency, network access or platform
 * API is used. The browser build is embedded in STRUCHORD.html as an inert
 * script and is activated only when a song is exported to Guitar Pro 5.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.StruchordGp5Writer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const GP5_VERSION = 'FICHIER GUITAR PRO v5.10';
  const GP5_TRACK_NAME_LENGTH = 40;
  const GP5_MAX_TRACKS = 64;
  const GP5_MAX_STRING_COUNT = 7;
  const GP5_LYRIC_LINES = 5;

  const DEFAULT_TUNINGS = {
    guitar: [40, 45, 50, 55, 59, 64],
    bass: [28, 33, 38, 43],
    // Клавиши в GP5 хранятся как гриф: даём им шесть струн от E2, чтобы ноты
    // оставались играбельными и в табулатуре, и в нотах.
    keys: [40, 45, 50, 55, 59, 64],
    drums: null,
  };

  // --- Тональности: GP хранит корень (плюс тип в заголовках тактов) --------
  const MAJOR_KEYS = [
    ['Cb', -7], ['Gb', -6], ['Db', -5], ['Ab', -4], ['Eb', -3], ['Bb', -2], ['F', -1],
    ['C', 0], ['G', 1], ['D', 2], ['A', 3], ['E', 4], ['B', 5], ['F#', 6],
    ['C#', 7], ['G#', 8],
  ];
  const MINOR_KEYS = [
    ['Abm', -7], ['Ebm', -6], ['Bbm', -5], ['Fm', -4], ['Cm', -3], ['Gm', -2],
    ['Dm', -1], ['Am', 0], ['Em', 1], ['Bm', 2], ['F#m', 3], ['C#m', 4],
    ['G#m', 5], ['D#m', 6], ['A#m', 7], ['E#m', 8],
  ];
  const KEY_LOOKUP = new Map();
  MAJOR_KEYS.forEach(([name, root]) => KEY_LOOKUP.set(name, { root, type: 0 }));
  MINOR_KEYS.forEach(([name, root]) => KEY_LOOKUP.set(name, { root, type: 1 }));

  const EPS = 1e-6;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  // --- Кодировка строк: Guitar Pro 5 хранит однобайтовый текст --------------
  // Windows-1251 целиком: код символа → байт, которым Guitar Pro хранит текст.
  const CP1251_TABLE = [
    [0x0402, 0x80],[0x0403, 0x81],[0x201a, 0x82],[0x0453, 0x83],[0x201e, 0x84],[0x2026, 0x85],
    [0x2020, 0x86],[0x2021, 0x87],[0x20ac, 0x88],[0x2030, 0x89],[0x0409, 0x8a],[0x2039, 0x8b],
    [0x040a, 0x8c],[0x040c, 0x8d],[0x040b, 0x8e],[0x040f, 0x8f],[0x0452, 0x90],[0x2018, 0x91],
    [0x2019, 0x92],[0x201c, 0x93],[0x201d, 0x94],[0x2022, 0x95],[0x2013, 0x96],[0x2014, 0x97],
    [0x2122, 0x99],[0x0459, 0x9a],[0x203a, 0x9b],[0x045a, 0x9c],[0x045c, 0x9d],[0x045b, 0x9e],
    [0x045f, 0x9f],[0x00a0, 0xa0],[0x040e, 0xa1],[0x045e, 0xa2],[0x0408, 0xa3],[0x00a4, 0xa4],
    [0x0490, 0xa5],[0x00a6, 0xa6],[0x00a7, 0xa7],[0x0401, 0xa8],[0x00a9, 0xa9],[0x0404, 0xaa],
    [0x00ab, 0xab],[0x00ac, 0xac],[0x00ad, 0xad],[0x00ae, 0xae],[0x0407, 0xaf],[0x00b0, 0xb0],
    [0x00b1, 0xb1],[0x0406, 0xb2],[0x0456, 0xb3],[0x0491, 0xb4],[0x00b5, 0xb5],[0x00b6, 0xb6],
    [0x00b7, 0xb7],[0x0451, 0xb8],[0x2116, 0xb9],[0x0454, 0xba],[0x00bb, 0xbb],[0x0458, 0xbc],
    [0x0405, 0xbd],[0x0455, 0xbe],[0x0457, 0xbf],[0x0410, 0xc0],[0x0411, 0xc1],[0x0412, 0xc2],
    [0x0413, 0xc3],[0x0414, 0xc4],[0x0415, 0xc5],[0x0416, 0xc6],[0x0417, 0xc7],[0x0418, 0xc8],
    [0x0419, 0xc9],[0x041a, 0xca],[0x041b, 0xcb],[0x041c, 0xcc],[0x041d, 0xcd],[0x041e, 0xce],
    [0x041f, 0xcf],[0x0420, 0xd0],[0x0421, 0xd1],[0x0422, 0xd2],[0x0423, 0xd3],[0x0424, 0xd4],
    [0x0425, 0xd5],[0x0426, 0xd6],[0x0427, 0xd7],[0x0428, 0xd8],[0x0429, 0xd9],[0x042a, 0xda],
    [0x042b, 0xdb],[0x042c, 0xdc],[0x042d, 0xdd],[0x042e, 0xde],[0x042f, 0xdf],[0x0430, 0xe0],
    [0x0431, 0xe1],[0x0432, 0xe2],[0x0433, 0xe3],[0x0434, 0xe4],[0x0435, 0xe5],[0x0436, 0xe6],
    [0x0437, 0xe7],[0x0438, 0xe8],[0x0439, 0xe9],[0x043a, 0xea],[0x043b, 0xeb],[0x043c, 0xec],
    [0x043d, 0xed],[0x043e, 0xee],[0x043f, 0xef],[0x0440, 0xf0],[0x0441, 0xf1],[0x0442, 0xf2],
    [0x0443, 0xf3],[0x0444, 0xf4],[0x0445, 0xf5],[0x0446, 0xf6],[0x0447, 0xf7],[0x0448, 0xf8],
    [0x0449, 0xf9],[0x044a, 0xfa],[0x044b, 0xfb],[0x044c, 0xfc],[0x044d, 0xfd],[0x044e, 0xfe],
    [0x044f, 0xff]
  ];

  function buildCp1251Table() {
    const table = new Map();
    for (let code = 0; code < 0x80; code++) table.set(code, code);
    for (const [unicode, byte] of CP1251_TABLE) table.set(unicode, byte);
    return table;
  }
  const CP1251 = buildCp1251Table();

  function cp1251Encode(text) {
    const bytes = [];
    const losses = [];
    const value = String(text === undefined || text === null ? '' : text);
    for (const char of value) {
      const code = char.codePointAt(0);
      if (code < 0x80) { bytes.push(code); continue; }
      const byte = CP1251.get(code);
      if (byte === undefined) {
        losses.push(char);
        bytes.push(0x3f); // '?'
        continue;
      }
      bytes.push(byte);
    }
    return { bytes, losses: losses.join('') };
  }

  // --- Бинарный писатель ---------------------------------------------------
  function ByteWriter() {
    this.chunks = [];
    this.length = 0;
    this.unknownChars = '';
  }

  ByteWriter.prototype.push = function push(bytes) {
    this.chunks.push(bytes);
    this.length += bytes.length;
  };

  ByteWriter.prototype.u8 = function u8(value) {
    this.push(Uint8Array.of(value & 0xff));
  };

  ByteWriter.prototype.i8 = function i8(value) {
    this.push(Uint8Array.of(value & 0xff));
  };

  ByteWriter.prototype.i16 = function i16(value) {
    const buffer = new Uint8Array(2);
    new DataView(buffer.buffer).setInt16(0, value, true);
    this.push(buffer);
  };

  ByteWriter.prototype.u16 = function u16(value) {
    const buffer = new Uint8Array(2);
    new DataView(buffer.buffer).setUint16(0, value, true);
    this.push(buffer);
  };

  ByteWriter.prototype.i32 = function i32(value) {
    const buffer = new Uint8Array(4);
    new DataView(buffer.buffer).setInt32(0, value | 0, true);
    this.push(buffer);
  };

  ByteWriter.prototype.zeros = function zeros(count) {
    if (count > 0) this.push(new Uint8Array(count));
  };

  // Строка с префиксом-длиной в один байт, с обрезкой по максимуму.
  ByteWriter.prototype.byteSizeString = function byteSizeString(text, max) {
    const encoded = cp1251Encode(text).bytes.slice(0, max);
    this.u8(encoded.length);
    this.push(Uint8Array.from(encoded));
    if (encoded.length < max) this.zeros(max - encoded.length);
  };

  // Строка с префиксом-длиной в четыре байта.
  ByteWriter.prototype.intSizeString = function intSizeString(text) {
    const encoded = cp1251Encode(text);
    if (encoded.losses) this.unknownChars += encoded.losses;
    this.i32(encoded.bytes.length);
    this.push(Uint8Array.from(encoded.bytes));
  };

  // Строка формата GP3–GP5: четырёхбайтное целое с длиной + 1, затем байт с
  // реальной длиной и сами символы.
  ByteWriter.prototype.intByteSizeString = function intByteSizeString(text) {
    const encoded = cp1251Encode(text);
    if (encoded.losses) this.unknownChars += encoded.losses;
    this.i32(encoded.bytes.length + 1);
    this.u8(encoded.bytes.length);
    this.push(Uint8Array.from(encoded.bytes));
  };

  ByteWriter.prototype.result = function result() {
    const bytes = new Uint8Array(this.length);
    let at = 0;
    for (const chunk of this.chunks) { bytes.set(chunk, at); at += chunk.length; }
    return bytes;
  };

  // --- Ритмы ---------------------------------------------------------------
  // Длительность приходит в четвертях (единица приложения = 1/4). GP хранит
  // знаменатель доли и код = log2(знаменатель) - 2: целая -2, половинная -1,
  // четверть 0, восьмая 1, шестнадцатая 2, тридцатьвторая 3.
  const DURATIONS = [
    { denominator: 1, dots: 0 },
    { denominator: 2, dots: 0 }, { denominator: 2, dots: 1 },
    { denominator: 4, dots: 0 }, { denominator: 4, dots: 1 },
    { denominator: 8, dots: 0 }, { denominator: 8, dots: 1 }, { denominator: 8, dots: 2 },
    { denominator: 16, dots: 0 }, { denominator: 16, dots: 1 },
    { denominator: 32, dots: 0 }, { denominator: 32, dots: 1 },
    { denominator: 64, dots: 0 },
  ];

  function dottedFactor(dots) {
    return dots === 1 ? 1.5 : (dots === 2 ? 1.75 : 1);
  }

  // Переводит долю целой ноты в код GP, точки и, если нужно, триоль.
  function durationCode(whole) {
    if (!(Number(whole) > 0) || !Number.isFinite(Number(whole))) return null;
    const find = (target) => {
      let best = null;
      for (const duration of DURATIONS) {
        const actual = (1 / duration.denominator) * dottedFactor(duration.dots);
        const error = Math.abs(actual - target);
        if (!best || error < best.error) best = { duration, error, actual };
      }
      return best;
    };
    const plain = find(whole);
    if (plain.error <= 0.02) {
      return {
        code: Math.round(Math.log2(plain.duration.denominator)) - 2,
        dots: plain.duration.dots,
        units: plain.actual,
        tuplet: 0,
      };
    }
    // Триоль: длительность в 2/3 раза короче базовой.
    const triplet = find(whole * 1.5);
    if (triplet.error <= 0.02) {
      return {
        code: Math.round(Math.log2(triplet.duration.denominator)) - 2,
        dots: triplet.duration.dots,
        units: triplet.actual * (2 / 3),
        tuplet: 3,
      };
    }
    return null;
  }

  function tupletFactor(dur) {
    if (!dur || !dur.tuplet) return 1;
    return dur.units * (2 / 3);
  }

  // --- Утилиты модели ------------------------------------------------------
  function parseTimeSig(value) {
    const match = /(\d+)\s*\/\s*(\d+)/.exec(String(value || '4/4'));
    if (!match) return { numerator: 4, denominator: 4 };
    return {
      numerator: clamp(Number(match[1]) || 4, 1, 32),
      denominator: clamp(Number(match[2]) || 4, 1, 32),
    };
  }

  const NOTE_SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  function keyOf(value) {
    const text = String(value || 'C').trim();
    if (KEY_LOOKUP.has(text)) return KEY_LOOKUP.get(text);
    const upper = text.toUpperCase();
    for (const [name, info] of KEY_LOOKUP) {
      if (name.toUpperCase() === upper) return info;
    }
    return KEY_LOOKUP.get('C');
  }

  // Строй приходит из модели песни как список названий («E2», «A#1») или как
  // MIDI-номера. Guitar Pro хранит MIDI-номера, поэтому приводим оба вида.
  function tuningPitch(value) {
    if (Number.isFinite(Number(value)) && typeof value !== 'string') return Math.round(Number(value));
    const text = String(value == null ? '' : value).trim();
    if (/^-?\d+$/.test(text)) {
      const number = Number(text);
      return number >= 0 && number <= 127 ? number : null;
    }
    const match = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(text);
    if (!match) return null;
    const base = NOTE_SEMITONES[match[1].toUpperCase()];
    const accidental = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0;
    const octave = Number(match[3]);
    const pitch = (octave + 1) * 12 + base + accidental;
    return pitch >= 0 && pitch <= 127 ? pitch : null;
  }

  function tuningFor(part) {
    if (Array.isArray(part.tuning) && part.tuning.length) {
      const pitches = part.tuning.slice(0, GP5_MAX_STRING_COUNT).map(tuningPitch);
      if (pitches.every((value) => value !== null)) return pitches;
    }
    const preset = DEFAULT_TUNINGS[part.instrument] || DEFAULT_TUNINGS.keys;
    return preset ? preset.slice() : DEFAULT_TUNINGS.keys.slice();
  }

  function stringPositions(tuning, pitch) {
    const rows = [];
    tuning.forEach((open, index) => {
      const fret = pitch - open;
      if (fret >= 0 && fret <= 24) rows.push({ string: index + 1, fret });
    });
    rows.sort((a, b) => a.fret - b.fret || b.string - a.string);
    return rows;
  }

  // Перкуссионная дорожка: строки — лани ударных, нота кладётся на лад 0.
  function drumLanes(parts) {
    const pitches = new Set();
    for (const part of parts) {
      if (part.instrument !== 'drums') continue;
      for (const note of part.notes || []) {
        if (Number.isFinite(Number(note.pitch))) pitches.add(Number(note.pitch));
      }
    }
    return Array.from(pitches).sort((a, b) => a - b);
  }

  function lossOf(losses, label, count) {
    const found = losses.find((item) => item.label === label);
    if (found) found.count += count;
    else losses.push({ label, count });
  }

  // --- Раскладка нот по тактам и долям ------------------------------------
  const GP5_VOICE_COUNT = 2;

  function layoutTrack(part, tuning, lanes) {
    const placed = [];
    for (const note of part.notes || []) {
      const voice = clamp(Math.round(Number(note.voice) || 1), 1, 4);
      if ((Number(note.voice) || 1) > 2) {
        note.__lost = (note.__lost || '') + 'голоса 3 и 4 в Guitar Pro 5 не поддерживаются';
        continue;
      }
      const dur = durationCode(Number(note.dur) / 4);
      if (!dur) {
        note.__lost = (note.__lost || '') + `длительность ${note.dur} четверти не выражается ритмом Guitar Pro`;
        continue;
      }
      let string;
      let fret;
      if (part.instrument === 'drums') {
        // Перкуссионная дорожка GP5: строки — столбцы сетки ударов, а «лад»
        // хранит саму высоту удара (так записаны файлы Guitar Pro).
        const pitch = Math.round(Number(note.pitch));
        if (!Number.isFinite(pitch) || pitch < 0 || pitch > 127) {
          note.__lost = (note.__lost || '') + 'удар без высоты в MIDI-диапазоне';
          continue;
        }
        string = 1;
        fret = pitch;
      } else if (Number.isFinite(Number(note.fret)) && Number.isFinite(Number(note.string))) {
        // Модель песни нумерует струны с нуля (0 — самая низкая), а Guitar Pro
        // считает с единицы от самой высокой, поэтому номер отражаем.
        const index = Number(note.string);
        string = tuning.length - index;
        fret = Number(note.fret);
        if (index < 0 || index >= tuning.length || string < 1 || string > tuning.length) {
          note.__lost = (note.__lost || '') + `струна ${index + 1} вне строя дорожки`;
          continue;
        }
      } else {
        const positions = part.instrument === 'drums'
          ? lanes.map((pitch, index) => (pitch === Number(note.pitch) ? { string: index + 1, fret: 0 } : null)).filter(Boolean)
          : stringPositions(tuning, Math.round(Number(note.pitch)));
        if (!positions.length) {
          note.__lost = (note.__lost || '') + 'нота вне грифа дорожки';
          continue;
        }
        string = positions[0].string;
        fret = positions[0].fret;
      }
      placed.push({
        bar: Number(note.bar),
        start: Number(note.start),
        rawDur: Number(note.dur),
        preferredVoice: voice,
        string,
        fret,
        source: note,
      });
    }
    placed.sort((a, b) => (a.bar - b.bar) || (a.start - b.start) || (a.string - b.string));
    return spreadVoices(placed);
  }

  // В одном голосе Guitar Pro ноты не накладываются: нота, начавшаяся внутри
  // уже идущей, уходит во второй голос — ровно так же поступает сам Guitar Pro.
  // Если заняты оба голоса, нота обрезается до первого свободного места.
  function spreadVoices(placed) {
    const voices = [];
    for (let index = 0; index < GP5_VOICE_COUNT; index++) voices.push([]);
    const busy = [];
    for (let index = 0; index < GP5_VOICE_COUNT; index++) busy.push([]);
    for (const note of placed) {
      const start = note.start;
      const end = start + note.rawDur;
      let voice = -1;
      let cut = Infinity;
      for (let index = 0; index < GP5_VOICE_COUNT; index++) {
        const overlap = busy[index].some((segment) => segment.bar === note.bar
          && start < segment.end - EPS && segment.start < end - EPS);
        if (!overlap) { voice = index; break; }
        const blockedUntil = busy[index]
          .filter((segment) => segment.bar === note.bar && segment.start <= start + EPS && segment.end > start)
          .reduce((max, segment) => Math.max(max, segment.end), start);
        cut = Math.min(cut, blockedUntil);
      }
      if (voice < 0) {
        if (cut - start < 0.125) {
          note.source.__lost = (note.source.__lost || '') + 'оба голоса такта заняты';
          continue;
        }
        note.source.__trimmed = true;
        note.rawDur = cut - start;
      } else if (note.preferredVoice === 2 && voice === 0) {
        // Предпочтение второго голоса уступает свободному первому — так файл
        // выглядит в Guitar Pro аккуратнее, а музыка не меняется.
        note.source.__moved = true;
      }
      const dur = durationCode(note.rawDur / 4);
      if (!dur) {
        note.source.__lost = (note.source.__lost || '') + `длительность ${note.rawDur} четверти не выражается ритмом Guitar Pro`;
        continue;
      }
      note.dur = dur;
      voices[voice].push(note);
      busy[voice].push({ bar: note.bar, start, end: start + note.rawDur });
    }
    return voices;
  }

  function groupBeats(notes) {
    const beats = [];
    for (const note of notes) {
      const last = beats[beats.length - 1];
      if (last && last.bar === note.bar && Math.abs(last.start - note.start) < EPS) last.notes.push(note);
      else beats.push({ bar: note.bar, start: note.start, notes: [note] });
    }
    return beats;
  }

  // --- Эффекты -------------------------------------------------------------
  // Приёмы ноты в GP5: два байта флагов и данные в фиксированном порядке.
  function noteEffects(writer, note) {
    const source = note.source || {};
    let flags1 = 0;
    let flags2 = 0;
    if (source.bend) flags1 |= 0x01;
    if (source.hammer) flags1 |= 0x02;
    if (source.letRing) flags1 |= 0x08;
    if (source.grace) flags1 |= 0x10;
    if (source.staccato || source.tenuto) flags2 |= 0x01;
    if (source.pm) flags2 |= 0x02;
    if (source.tremolo) flags2 |= 0x04;
    if (source.slide || source.legato) flags2 |= 0x08;
    if (source.harmonic) flags2 |= 0x10;
    if (source.trill) flags2 |= 0x20;
    if (source.vibrato) flags2 |= 0x40;
    writer.u8(flags1);
    writer.u8(flags2);
    if (flags1 & 0x01) writeBend(writer, source.bend);
    if (flags1 & 0x10) writeGraceNote(writer, source.grace, note);
    if (flags2 & 0x04) writer.i8(pickLengthCode(source.tremolo));
    if (flags2 & 0x08) writer.u8(slideMask(source));
    if (flags2 & 0x10) writeHarmonic(writer, source.harmonic);
    if (flags2 & 0x20) {
      writer.i8(clamp(Math.round(Number(source.trillFret) || 24), 0, 36));
      writer.i8(1); // трель шестнадцатыми
    }
  }

  function pickLengthCode(value) {
    const text = String(value === true ? '' : value).toLowerCase();
    if (text.includes('32') || text.includes('тридцать')) return 3;
    if (text.includes('16') || text.includes('шестнадц')) return 2;
    return 1;
  }

  function slideMask(source) {
    let mask = 0;
    if (source.legato) mask |= 0x02; // легато вверх
    else if (source.slide) mask |= 0x01; // сдвиг на лад
    if (source.slideIn) mask |= 0x04;
    if (source.slideOut) mask |= 0x08;
    return mask;
  }

  function writeBend(writer, value) {
    const amount = clamp(Number(value) || 0.25, 0, 1);
    writer.i8(1); // обычный бенд
    writer.i32(Math.round(amount * 32 * 6));
    writer.i32(2); // две точки
    writer.i32(0);
    writer.i32(0);
    writer.u8(0);
    writer.i32(60);
    writer.i32(Math.round(amount * 32 * 6));
    writer.u8(0);
  }

  function writeGraceNote(writer, grace, note) {
    const info = typeof grace === 'object' && grace ? grace : {};
    writer.u8(clamp(Math.round(Number(info.fret) || note.fret), 0, 36));
    writer.u8(6); // динамика по умолчанию
    writer.u8(Number(info.transition) || 0);
    writer.u8(2);
    writer.u8(0);
  }

  function writeHarmonic(writer, value) {
    const info = typeof value === 'object' && value ? value : {};
    const type = String(info.type || value || 'natural').toLowerCase();
    if (type.includes('artificial') || type.includes('искус')) {
      writer.i8(2);
      writer.u8(0); // класс высоты: до
      writer.i8(0); // случайный знак
      writer.u8(1); // октава ottava
      return;
    }
    if (type.includes('tapped') || type.includes(' tapped') || type.includes('тап')) {
      writer.i8(3);
      writer.u8(clamp(Math.round(Number(info.fret) || 12), 0, 24));
      return;
    }
    if (type.includes('pinch') || type.includes('пинч')) { writer.i8(4); return; }
    if (type.includes('semi') || type.includes('полу')) { writer.i8(5); return; }
    writer.i8(1); // натуральный обертон
  }

  function writeNote(writer, note) {
    const source = note.source || {};
    const accent = Number(source.accent) > 0 || source.accent === true;
    const hasEffects = !!(source.letRing || source.pm || source.staccato || source.slide || source.hammer
      || source.bend || source.vibrato || source.legato || source.ghost || source.trill || source.tremolo);
    let flags = 0x20;
    if (hasEffects) flags |= 0x08;
    if (source.ghost) flags |= 0x04;
    if (accent) flags |= 0x40;
    if (Number.isFinite(Number(source.velocity))) flags |= 0x10;
    writer.u8(flags);
    writer.u8(1); // normal
    if (flags & 0x10) {
      // Динамика GP: (velocity + 16 - 15) / 16, округление вниз.
      const velocity = clamp(Math.round(Number(source.velocity)), 15, 127);
      writer.i8(Math.floor((velocity + 1) / 16));
    }
    writer.i8(note.fret);
    if (flags & 0x80) {
      writer.i8(Number(source.leftHandFinger) || 0);
      writer.i8(Number(source.rightHandFinger) || 0);
    }
    // GP5 добавляет байт случайных знаков перед приёмами ноты.
    writer.u8(0);
    if (flags & 0x08) noteEffects(writer, note);
  }

  function writeNotes(writer, beat) {
    let stringFlags = 0;
    for (const note of beat.notes) stringFlags |= 1 << (7 - note.string);
    writer.u8(stringFlags);
    for (const note of beat.notes.slice().sort((a, b) => a.string - b.string)) writeNote(writer, note);
  }

  // Смешение дорожки в начале такта GP5: инструмент, RSE-инструмент (четыре
  // целых), шесть значений микшера, название темпа, темп, длительности,
  // флаги, Wah-wah и две строки RSE-эффекта.
  function writeMixChange(writer, change) {
    writer.i8(Number.isFinite(change.instrument) ? change.instrument : -1);
    writer.i32(Number.isInteger(change.instrumentNumber) ? change.instrumentNumber : -1);
    writer.i32(1);
    writer.i32(0);
    writer.i32(0);
    const values = [
      Number.isFinite(change.volume) ? change.volume : -1,
      Number.isFinite(change.balance) ? change.balance : -1,
      -1, -1, -1, -1,
    ];
    for (const value of values) writer.i8(value);
    writer.intByteSizeString(change.tempoLabel || '');
    writer.i32(Number.isFinite(change.tempo) ? change.tempo : -1);
    let flags = 0;
    for (let index = 0; index < values.length; index++) {
      if (values[index] >= 0) {
        writer.i8(0); // длительность до конца такта
        if (index === 0 && change.volumeAllTracks) flags |= 0x01;
        if (index === 1 && change.balanceAllTracks) flags |= 0x02;
      }
    }
    if (Number.isFinite(change.tempo)) {
      writer.i8(0); // длительность темпа
      writer.u8(0); // показывать темп
    }
    writer.u8(flags);
    writer.i8(-1); // Wah-wah выключен
    writer.intByteSizeString('');
    writer.intByteSizeString('');
  }

  // Эффекты бита: два байта флагов и их данные (GP5).
  function writeBeatEffects(writer, beat) {
    const source = (beat.notes[0] && beat.notes[0].source) || {};
    let flags1 = 0;
    let flags2 = 0;
    if (source.vibrato) flags1 |= 0x02;
    if (source.fadeIn) flags1 |= 0x10;
    if (source.slap) flags1 |= 0x20;
    if (source.stroke || source.rasgueado) flags1 |= 0x40;
    if (source.pickStroke) flags2 |= 0x02;
    if (source.tremoloBar) flags2 |= 0x04;
    writer.u8(flags1);
    writer.u8(flags2);
    if (flags1 & 0x20) writer.i8(Number(source.slap) || 0);
    if (flags2 & 0x04) writeBend(writer, source.tremoloBar === true ? 0.5 : source.tremoloBar);
    if (flags1 & 0x40) {
      const stroke = clamp(Math.round(Number(source.stroke || 3)), 1, 4);
      writer.i8(source.strokeUp ? stroke : 0);
      writer.i8(source.strokeUp ? 0 : stroke);
    }
    if (flags2 & 0x02) writer.i8(Number(source.pickStroke) || 0);
  }

  // Пауза во всю длину такта: GP5 не допускает тактов без битов.
  // В GP5 биты идут подряд: позиция бита — это сумма предыдущих длительностей.
  // Поэтому разрыв перед нотой закрываем паузами, иначе Guitar Pro сдвинет ноту
  // к началу голоса. Паузы пишем крупными долями, остаток — мелкими.
  // Код длительности GP5: 2^(код+2) — знаменатель доли целой, поэтому
  // код -2 — целая, 0 — четверть, 2 — шестнадцатая. В долях четверти это
  // ровно 2^(-код) долей.
  function durationUnitsForCode(code) {
    return Math.pow(2, -code);
  }

  function restGapCodes(gapUnits) {
    const codes = [];
    let left = Number(gapUnits);
    while (left > 0.12) {
      let code = Math.floor(-Math.log2(left));
      if (!Number.isFinite(code)) code = 0;
      code = clamp(code, -2, 4);
      let units = durationUnitsForCode(code);
      if (units <= 0 || units > left + EPS) { code = 0; units = 1; }
      codes.push(code);
      left -= units;
      if (units < 0.25 && left <= 0.12) break;
    }
    return codes;
  }

  // План голоса такта: биты и паузы-заполнители между ними, в порядке записи.
  function voicePlan(barBeats) {
    const plan = [];
    let cursor = 0;
    for (const beat of barBeats) {
      const gap = Number(beat.start) - cursor;
      if (gap > 0.12) {
        for (const code of restGapCodes(gap)) plan.push({ rest: true, code });
        cursor += gap;
      }
      plan.push({ beat });
      cursor = Number(beat.start) + Number((beat.notes[0] && beat.notes[0].rawDur) || 0);
    }
    return plan;
  }

  function writeRestBeat(writer, durationCodeValue) {
    writer.u8(0x40); // у бита задан статус
    writer.u8(0x02); // пауза
    writer.i8(durationCodeValue);
    writer.u8(0); // ни одной струны
    writer.i16(0); // флаги отображения
  }

  // Длина такта в долях целой ноты: 4/4 — это одна целая.
  function wholeUnits(bar, model) {
    const sig = parseTimeSig(bar.timeSig || model.timeSig);
    const quarters = (sig.numerator / sig.denominator) * 4;
    return Math.max(0.125, quarters / 4);
  }

  function writeBeat(writer, beat, change) {
    const duration = beat.notes[0] ? beat.notes[0].dur : null;
    if (!duration) return;
    const hasTuplet = duration.tuplet > 0;
    const effects = beat.notes.some((note) => note.source
      && (note.source.staccato || note.source.tenuto || note.source.slap || note.source.rasgueado
        || note.source.vibrato || note.source.fadeIn));
    writer.u8((duration.dots ? 0x01 : 0) | (effects ? 0x08 : 0) | (hasTuplet ? 0x20 : 0) | (change ? 0x10 : 0));
    writer.i8(duration.code);
    if (hasTuplet) writer.i32(duration.tuplet);
    if (effects) writeBeatEffects(writer, beat);
    if (change) writeMixChange(writer, change);
    writeNotes(writer, beat);
    writer.i16(0); // флаги отображения GP5 (лучи, октавы, скобки тролей)
  }

  // --- Лирика --------------------------------------------------------------
  function escapeLyricWord(word) {
    // Символы, которые GP5 считает служебными: пробел разделяет слова,
    // «+» соединяет слоги, «-» пропускает ноту, «_» переносит строку,
  // «[» и «]» экранируют следующий символ.
    let out = '';
    for (const char of String(word || '')) {
      if (char === ' ') { out += '_'; continue; }
      if (char === '+' || char === '-' || char === '[' || char === ']' || char === '_') out += char;
      out += char;
    }
    return out;
  }

  function lyricLineText(words) {
    return words.map((word) => escapeLyricWord(word)).join(' ');
  }

  // --- Запись --------------------------------------------------------------
  function writeGP5(model, options) {
    const settings = options || {};
    const losses = [];
    const writer = new ByteWriter();

    const meta = model.meta || {};
    const parts = (model.parts || []).slice(0, GP5_MAX_TRACKS);
    if ((model.parts || []).length > GP5_MAX_TRACKS) {
      lossOf(losses, `Дорожек больше ${GP5_MAX_TRACKS}: лишние не записаны`, model.parts.length - GP5_MAX_TRACKS);
    }
    const bars = model.bars || [];
    if (!bars.length) throw new Error('В песне нет тактов — экспортировать нечего.');
    if (!parts.length) lossOf(losses, 'В песне нет дорожек: файл откроется пустым');

    const tempo = clamp(Math.round(Number(model.bpm) || 120), 15, 999);
    const songKey = keyOf(model.key);

    // Дорожки: строй, раскладка нот, перкуссионные лани.
    const lanes = drumLanes(parts);
    const tracks = parts.map((part, index) => {
      const isDrums = part.instrument === 'drums';
      // У перкуссионной дорожки Guitar Pro все строки «C-1»: высоту удара
      // несёт лад, а не строй.
      const tuning = isDrums ? [-1, -1, -1, -1, -1, -1] : tuningFor(part);
      const voices = layoutTrack(part, tuning, lanes);
      return {
        part,
        index,
        isDrums,
        tuning,
        voices,
        beats: voices.map((list) => groupBeats(list)),
        color: [255, 255, 255],
      };
    });

    let noteCount = 0;
    let beatCount = 0;
    for (const track of tracks) {
      for (const beats of track.beats) {
        for (const beat of beats) { beatCount++; noteCount += beat.notes.length; }
      }
    }
    if (settings.debug) {
      for (const track of tracks) {
        for (let voice = 0; voice < track.voices.length; voice++) {
          const list = track.voices[voice];
          if (!list.length) continue;
          console.error(`голос ${voice + 1}: ${list.length} нот`, JSON.stringify(list.map((note) => ({ bar: note.bar, start: note.start, string: note.string, fret: note.fret, code: note.dur && note.dur.code, lost: note.source.__lost }))));
        }
      }
    }

    // --- версия ---
    writer.byteSizeString(GP5_VERSION, 30);

    // --- сведения о песне ---
    writer.intByteSizeString(meta.title || '');
    writer.intByteSizeString(meta.subtitle || '');
    writer.intByteSizeString(meta.artist || '');
    writer.intByteSizeString(meta.album || '');
    writer.intByteSizeString(meta.words || '');
    writer.intByteSizeString(meta.music || '');
    writer.intByteSizeString(meta.copyright || '');
    writer.intByteSizeString('');
    writer.intByteSizeString('');
    writer.i32(0); // без примечаний

    // --- лирика: одна привязка к дорожке, пять строк ---
    const lyricTracks = tracks.filter((track) => (track.part.lyrics || []).length);
    const lyricTrackNumber = lyricTracks.length ? lyricTracks[0].index + 1 : 0;
    const lyricLines = [];
    if (lyricTracks.length) {
      const track = lyricTracks[0];
      const words = (track.part.lyrics || [])
        .slice()
        .sort((a, b) => (Number(a.bar) - Number(b.bar)) || (Number(a.start || 0) - Number(b.start || 0)));
      if (lyricTracks.length > 1) {
        lossOf(losses, 'Строки текста в Guitar Pro 5 привязаны к одной дорожке, лишние дорожки с текстом оставлены в приложении', lyricTracks.length - 1);
      }
      if (words.length) {
        const noteTimeline = (track.beats[0] || []).map((beat) => ({ bar: beat.bar, start: beat.start, text: '' }));
        let cursor = 0;
        let drift = 0;
        for (const word of words) {
          while (cursor < noteTimeline.length
            && (noteTimeline[cursor].bar < Number(word.bar)
              || (noteTimeline[cursor].bar === Number(word.bar)
                && noteTimeline[cursor].start + EPS < Number(word.start || 0)))) cursor++;
          if (cursor >= noteTimeline.length) {
            drift++;
            continue;
          }
          noteTimeline[cursor].text = String(word.text || '');
          cursor++;
        }
        const firstBar = noteTimeline.findIndex((row) => row.text) >= 0
          ? noteTimeline.find((row) => row.text).bar
          : 0;
        const text = lyricLineText(noteTimeline.filter((row) => row.text).map((row) => row.text));
        if (text) lyricLines.push({ bar: firstBar, text });
        if (drift) {
          lossOf(losses, 'Слова без ноты под ними в Guitar Pro 5 не ставятся на место — они сдвинулись по нотам дорожки', drift);
        }
        const extra = words.length - lyricLines.reduce((sum, line) => sum + line.text.split(' ').length, 0);
        if (extra > 0) lossOf(losses, 'Строки текста без нот не переносятся', extra);
      }
    }
    if (lyricLines.length > GP5_LYRIC_LINES) {
      lossOf(losses, `В Guitar Pro 5 не больше ${GP5_LYRIC_LINES} строк текста на дорожку`, lyricLines.length - GP5_LYRIC_LINES);
      lyricLines.length = GP5_LYRIC_LINES;
    }
    writer.i32(lyricTrackNumber);
    for (let line = 0; line < GP5_LYRIC_LINES; line++) {
      const value = lyricLines[line];
      writer.i32(value ? value.bar + 1 : 0);
      writer.intSizeString(value ? value.text : '');
    }

    // --- мастер-RSE (19 байт) ---
    const masterMix = model.masterMix || {};
    writer.i32(clamp(Math.round(Number(masterMix.volume) || 100), 0, 100));
    writer.i32(0);
    writer.zeros(11);

    // --- параметры страницы ---
    writer.i32(210); // A4, мм
    writer.i32(297);
    writer.i32(10); // поля
    writer.i32(10);
    writer.i32(10);
    writer.i32(10);
    writer.i32(100); // масштаб нотного стану
    writer.u8(0x03); // колонтитулы
    writer.u8(0);
    writer.intByteSizeString('');
    writer.intByteSizeString('');
    writer.intByteSizeString('');
    writer.intByteSizeString('');
    writer.intByteSizeString('');
    writer.intByteSizeString('');
    writer.intByteSizeString('');
    writer.intByteSizeString('');
    writer.intByteSizeString('');
    writer.intByteSizeString('');

    // --- темп, тональность ---
    writer.intByteSizeString('Tempo');
    writer.i32(tempo);
    writer.u8(0); // показывать темп
    writer.i8(songKey.root);
    writer.i32(0);

    // --- 64 MIDI-канала ---
    const channelOfTrack = new Map();
    tracks.forEach((track, index) => {
      const channel = clamp((track.part.midiChannel || index + 1), 1, 64);
      channelOfTrack.set(track.index, channel);
    });
    for (let channel = 1; channel <= 64; channel++) {
      const track = tracks.find((item) => channelOfTrack.get(item.index) === channel);
      const instrument = track && Number.isInteger(track.part.gmProgram) ? track.part.gmProgram : -1;
      writer.i32(instrument);
      const volume = track && track.part.mix ? clamp(Math.round(Number(track.part.mix.volume) || 100), 0, 100) : -1;
      const balance = track && track.part.mix ? clamp(Math.round(Number(track.part.mix.pan) || 0), -100, 100) : 0;
      writer.i8(mixShort(volume));
      writer.i8(mixShort(balance === 0 ? -1 : balance));
      writer.i8(-1);
      writer.i8(-1);
      writer.i8(-1);
      writer.i8(-1);
      writer.zeros(2);
    }

    // --- указатели повторов ---
    for (let index = 0; index < 19; index++) writer.i16(-1);

    // --- реверберация мастера ---
    writer.i32(0);

    // --- число тактов и дорожек ---
    writer.i32(bars.length);
    writer.i32(Math.max(1, tracks.length));

    // --- заголовки тактов ---
    let previousTimeSig = null;
    let previousKey = null;
    bars.forEach((bar, index) => {
      const timeSig = parseTimeSig(bar.timeSig || model.timeSig);
      const key = keyOf(bar.key || songKey ? bar.key || model.key : model.key);
      let flags = 0;
      if (index === 0 || !previousTimeSig
        || timeSig.numerator !== previousTimeSig.numerator
        || timeSig.denominator !== previousTimeSig.denominator) {
        flags |= 0x03;
      }
      if (bar.repeatOpen) flags |= 0x04;
      if (Number.isInteger(bar.repeatClose) && bar.repeatClose >= 0) flags |= 0x08;
      if (bar.marker) flags |= 0x20;
      if (!previousKey || key.root !== previousKey.root || key.type !== previousKey.type) flags |= 0x40;
      if (index > 0) writer.u8(0);
      writer.u8(flags);
      if (flags & 0x01) writer.i8(timeSig.numerator);
      if (flags & 0x02) writer.i8(timeSig.denominator);
      if (flags & 0x08) writer.i8(Math.max(1, bar.repeatClose) - 1);
      if (flags & 0x20) {
        writer.intByteSizeString(bar.marker);
        writer.u8(bar.color ? bar.color[0] : 255);
        writer.u8(bar.color ? bar.color[1] : 255);
        writer.u8(bar.color ? bar.color[2] : 255);
        writer.u8(0);
      }
      if (flags & 0x40) {
        writer.i8(key.root);
        writer.i8(key.type);
      }
      if (flags & 0x03) {
        writer.u8(8); // 8-я
        writer.u8(16); // 16-я
        writer.u8(0);
        writer.u8(0);
      }
      // В GP5 после лучей всегда идут два байта: альтернативные окончания
      // повтора и ощущение триолей (1 — восьмые).
      writer.u8(0);
      writer.u8(1);
      previousTimeSig = timeSig;
      previousKey = key;
    });

    // --- дорожки ---
    tracks.forEach((track, index) => {
      if (index === 0) writer.u8(0);
      let flags = 0x40; // RSE включён
      if (track.isDrums) flags |= 0x01;
      flags |= 0x08; // видимая
      writer.u8(flags);
      writer.byteSizeString(track.part.name || `Track ${index + 1}`, GP5_TRACK_NAME_LENGTH);
      // Guitar Pro хранит струны от самой высокой к самой низкой, а модель
      // песни — наоборот (индекс 0 — самая низкая). Пишем развёрнутым списком.
      const storedTuning = track.tuning.slice().reverse();
      writer.i32(Math.min(storedTuning.length, GP5_MAX_STRING_COUNT));
      for (let string = 0; string < GP5_MAX_STRING_COUNT; string++) {
        writer.i32(storedTuning[string] === undefined ? 0 : storedTuning[string]);
      }
      writer.i32(1); // порт
      writer.i32(channelOfTrack.get(track.index) || index + 1);
      writer.i32(channelOfTrack.get(track.index) || index + 1);
      writer.i32(24); // ладов
      writer.i32(clamp(Number(track.part.capo) || 0, 0, 12)); // капо
      writer.u8(track.color[0]);
      writer.u8(track.color[1]);
      writer.u8(track.color[2]);
      writer.u8(0);
      writer.u16(0x0003); // табулатура и ноты
      writer.u8(0); // автоакцент
      writer.u8(0); // банк
      writer.u8(0); // humanize
      writer.i32(track.isDrums ? 0 : (tuningOctaveShift(track.tuning)));
      writer.i32(track.isDrums ? 0 : 12);
      writer.i32(100);
      writer.zeros(12);
      writer.i32(track.isDrums ? 0 : (Number.isInteger(track.part.gmProgram) ? track.part.gmProgram : 25));
      writer.i32(1);
      writer.i32(0);
      writer.i32(0);
      writer.zeros(4); // трёхполосный эквалайзер RSE: три ручки и усиление
      writer.intByteSizeString('');
      writer.intByteSizeString('');
    });
    writer.u8(0); // хвост после дорожек

    // --- такты ---
    const changesByTrack = new Map();
    tracks.forEach((track) => {
      const change = {};
      const mix = track.part.mix;
      if (mix) {
        if (Number.isFinite(Number(mix.volume))) {
          change.volume = clamp(Math.round(Number(mix.volume)), 0, 15);
          if (Number(mix.volume) > 100) {
            lossOf(losses, `Дорожка «${track.part.name}»: громкость выше 100 записана как 100`, 1);
          }
        }
        if (Number.isFinite(Number(mix.pan)) && Number(mix.pan) !== 0) {
          change.balance = clamp(Math.round(Number(mix.pan) / 100 * 15), -15, 15);
        }
      }
      if (Number.isInteger(track.part.gmProgram)) change.instrument = track.part.gmProgram;
      if (Object.keys(change).length) changesByTrack.set(track.index, change);
    });

    const emptyTrack = { beats: [[]], part: { name: '' } };
    bars.forEach((bar, barIndex) => {
      for (let trackIndex = 0; trackIndex < Math.max(1, tracks.length); trackIndex++) {
        const track = tracks[trackIndex] || emptyTrack;
        const change = barIndex === 0 ? changesByTrack.get(track.index) : null;
        if (change) {
          if (Number.isFinite(Number(track.part.bpm)) && track.part.bpm && Number(track.part.bpm) !== tempo) {
            change.tempo = Math.round(Number(track.part.bpm));
          }
        }
        // GP5 держит в каждом такте ровно два голоса, и в каждом обязан быть
        // хотя бы один бит: для пустого голоса записываем паузу на такт.
        const rest = durationCode(wholeUnits(bar, model));
        const restCode = rest ? rest.code : -2;
        for (let voice = 0; voice < GP5_VOICE_COUNT; voice++) {
          const beats = (track.beats && track.beats[voice]) || [];
          const barBeats = beats.filter((beat) => beat.bar === barIndex);
          const plan = voicePlan(barBeats);
          writer.i32(plan.length || 1);
          let first = true;
          for (const item of plan) {
            if (item.rest) { writeRestBeat(writer, item.code); continue; }
            writeBeat(writer, item.beat, first ? change : null);
            first = false;
          }
          if (!plan.length) writeRestBeat(writer, restCode);
        }
        writer.u8(0); // разрыв строки
      }
    });

    // --- потери, о которых сообщаем наружу ---
    for (const track of tracks) {
      for (const note of track.part.notes || []) {
        if (note.__lost) lossOf(losses, `Дорожка «${track.part.name}»: ${note.__lost}`, 1);
      }
    }
    if (writer.unknownChars) {
      lossOf(losses, `Символы вне Windows-1251 заменены на «?»: ${writer.unknownChars.slice(0, 40)}`, 1);
    }

    return {
      bytes: writer.result(),
      losses,
      stats: {
        bars: bars.length,
        tracks: tracks.length,
        notes: noteCount,
        beats: beatCount,
        lyrics: lyricLines.length,
        bytes: writer.length,
      },
    };
  }

  // Микшер GP хранит 16 ступеней: значение -1 — «не задано».
  function mixShort(value) {
    if (!Number.isFinite(value)) return 127;
    const scaled = clamp(Math.round(value / 100 * 15), -15, 15);
    return scaled + 1;
  }

  // GP хранит в этом поле сдвиг нотной позиции для басовой дорожки:
  // у гитар и ударных он нулевой, у баса — 12 (как в файлах Guitar Pro).
  function tuningOctaveShift(tuning) {
    if (!tuning.length) return 0;
    return Math.min.apply(null, tuning) < 35 ? 12 : 0;
  }

  return Object.freeze({
    GP5_VERSION,
    writeGP5,
    durationCode,
    parseTimeSig,
    keyOf,
    tuningPitch,
    cp1251Encode,
  });
});