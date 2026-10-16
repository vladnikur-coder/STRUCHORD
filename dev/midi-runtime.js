/*
 * STRUCHORD Standard MIDI File (SMF) reader.
 *
 * A .mid/.midi file is a plain chunk stream, so no codec is needed:
 *
 *   "MThd" <length=6> <format> <track count> <division>
 *   "MTrk" <length> <events…>
 *
 * Events:
 *   meta  0xFF <type> <varlen length> <data>   — tempo (0x51), time signature
 *         (0x58), key signature (0x59), track name (0x03), text (0x01),
 *         marker (0x06), end of track (0x2F);
 *   sysex 0xF0 / 0xF7 <varlen length> <bytes>  — skipped by length;
 *   channel messages 0x8n…0xEn               — note on/off, program change,
 *         controllers, channel/poly aftertouch, pitch bend.
 *
 * Running status (a data byte reusing the previous status) is supported; a meta
 * or sysex event clears it. Delta times are variable-length quantities.
 *
 * Written for this project from the published SMF layout and verified against
 * real Guitar Pro exports; no runtime dependency, network access, or platform
 * API is used. The browser build is embedded in STRUCHORD.html as an inert
 * script and is activated only when a .mid file is imported.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.StruchordMidi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MAGIC = 'MThd';
  const TRACK_MAGIC = 'MTrk';
  const HEADER_LENGTH = 6;

  const LIMITS = Object.freeze({
    maxFileBytes: 16 * 1024 * 1024,
    maxTracks: 256,
    maxEvents: 400000,
    maxNotesPerTrack: 120000,
    maxTextBytes: 4096,
  });

  const META = Object.freeze({
    TEXT: 0x01,
    COPYRIGHT: 0x02,
    TRACK_NAME: 0x03,
    INSTRUMENT_NAME: 0x04,
    LYRIC: 0x05,
    MARKER: 0x06,
    TEMPO: 0x51,
    SMPTE_OFFSET: 0x54,
    TIME_SIGNATURE: 0x58,
    KEY_SIGNATURE: 0x59,
    END_OF_TRACK: 0x2f,
  });

  function fail(message) {
    const error = new Error(message);
    error.name = 'StruchordMidiError';
    throw error;
  }

  function isMidi(bytes) {
    return !!bytes && bytes.length >= 4 && bytes[0] === 0x4d && bytes[1] === 0x54 &&
      bytes[2] === 0x68 && bytes[3] === 0x64;
  }

  // Decodes Latin-1/ASCII without depending on TextDecoder: SMF meta text is
  // officially ASCII, and Latin-1 never throws on any byte.
  function decodeAscii(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
    return out;
  }

  function readVarLen(bytes, cursor) {
    let value = 0;
    let read = 0;
    while (true) {
      if (cursor.at >= bytes.length) fail('MIDI: событие оборвано в середине длины.');
      if (read > 4) fail('MIDI: слишком длинная переменная длина.');
      const byte = bytes[cursor.at++];
      value = (value << 7) | (byte & 0x7f);
      read++;
      if ((byte & 0x80) === 0) break;
    }
    return value >>> 0;
  }

  function readUint32(bytes, cursor) {
    if (cursor.at + 4 > bytes.length) fail('MIDI: файл оборван в заголовке трека.');
    const value = (bytes[cursor.at] << 24) | (bytes[cursor.at + 1] << 16) |
      (bytes[cursor.at + 2] << 8) | bytes[cursor.at + 3];
    cursor.at += 4;
    return value >>> 0;
  }

  function createTrack(index) {
    return {
      index,
      name: '',
      instrumentName: '',
      channel: null,
      program: null,
      notes: [],
      controllers: Object.create(null),
      pitchBends: 0,
      aftertouch: 0,
      markers: [],
      texts: [],
      lyrics: [],
      tempoEvents: [],
      timeSignatures: [],
      keySignatures: [],
      sysex: 0,
      danglingNoteOffs: 0,
      notesOverLimit: 0,
    };
  }

  function parseTrack(bytes, start, end, index, limits, warnings) {
    const track = createTrack(index);
    const cursor = { at: start };
    let tick = 0;
    let status = 0;
    const pending = new Map(); // key: `${channel}:${pitch}` -> note

    while (cursor.at < end) {
      tick += readVarLen(bytes, cursor);
      if (cursor.at >= end) break;
      let byte = bytes[cursor.at];

      if (byte === 0xff) {
        cursor.at++;
        const type = bytes[cursor.at++];
        const length = readVarLen(bytes, cursor);
        if (cursor.at + length > end) fail('MIDI: мета-событие выходит за пределы трека.');
        const dataAt = cursor.at;
        cursor.at += length;
        status = 0;
        if (type === META.END_OF_TRACK) break;
        if (type === META.TRACK_NAME) track.name = decodeAscii(bytes.subarray(dataAt, dataAt + length)).trim();
        else if (type === META.INSTRUMENT_NAME) track.instrumentName = decodeAscii(bytes.subarray(dataAt, dataAt + length)).trim();
        else if (type === META.MARKER) track.markers.push({ tick, text: decodeAscii(bytes.subarray(dataAt, dataAt + length)).trim() });
        else if (type === META.LYRIC) track.lyrics.push({ tick, text: decodeAscii(bytes.subarray(dataAt, dataAt + length)).trim() });
        else if (type === META.TEXT || type === META.COPYRIGHT) track.texts.push({ tick, text: decodeAscii(bytes.subarray(dataAt, dataAt + length)).trim() });
        else if (type === META.TEMPO && length === 3) {
          const micros = (bytes[dataAt] << 16) | (bytes[dataAt + 1] << 8) | bytes[dataAt + 2];
          if (micros > 0) track.tempoEvents.push({ tick, micros, bpm: Math.round(60000000 / micros * 1000) / 1000 });
        } else if (type === META.TIME_SIGNATURE && length >= 2) {
          track.timeSignatures.push({
            tick,
            numerator: bytes[dataAt],
            denominator: Math.pow(2, bytes[dataAt + 1]),
            metronome: length >= 4 ? bytes[dataAt + 2] : 24,
            beatUnit: length >= 4 ? bytes[dataAt + 3] : 8,
          });
        } else if (type === META.KEY_SIGNATURE && length >= 2) {
          track.keySignatures.push({ tick, sharps: (bytes[dataAt] << 24 >> 16) | bytes[dataAt + 1] });
        } else {
          warnings.push(`MIDI: мета-событие 0x${type.toString(16)} в треке ${index + 1} пропущено.`);
        }
        continue;
      }

      if (byte === 0xf0 || byte === 0xf7) {
        cursor.at++;
        const length = readVarLen(bytes, cursor);
        if (cursor.at + length > end) fail('MIDI: sysex выходит за пределы трека.');
        cursor.at += length;
        track.sysex++;
        status = 0;
        continue;
      }

      if (byte & 0x80) {
        status = byte;
        cursor.at++;
      } else if (!status) {
        fail('MIDI: событие без статуса в начале потока.');
      }

      const kind = status & 0xf0;
      const channel = status & 0x0f;
      const need = kind === 0xc0 || kind === 0xd0 ? 1 : 2;
      if (cursor.at + need > end) fail('MIDI: канальное событие выходит за пределы трека.');
      const data1 = bytes[cursor.at];
      const data2 = need > 1 ? bytes[cursor.at + 1] : 0;
      cursor.at += need;

      if (kind === 0x90) {
        const key = `${channel}:${data1}`;
        if (data2 === 0) {
          const open = pending.get(key);
          if (open) {
            const duration = Math.max(0, tick - open.tick);
            if (track.notes.length >= limits.maxNotesPerTrack) {
              track.notesOverLimit++;
            } else {
              track.notes.push({ tick: open.tick, duration, pitch: data1, velocity: open.velocity, channel });
            }
            pending.delete(key);
          } else {
            track.danglingNoteOffs++;
          }
        } else if (pending.has(key)) {
          // Same pitch struck again without a note off: close the previous note
          // at the new start so nothing hangs to the end of the file.
          const open = pending.get(key);
          track.notes.push({ tick: open.tick, duration: Math.max(0, tick - open.tick), pitch: data1, velocity: open.velocity, channel });
          pending.set(key, { tick, velocity: data2 });
        } else {
          pending.set(key, { tick, velocity: data2 });
        }
      } else if (kind === 0x80) {
        const key = `${channel}:${data1}`;
        const open = pending.get(key);
        if (open) {
          const duration = Math.max(0, tick - open.tick);
          if (track.notes.length >= limits.maxNotesPerTrack) track.notesOverLimit++;
          else track.notes.push({ tick: open.tick, duration, pitch: data1, velocity: open.velocity, channel });
          pending.delete(key);
        } else {
          track.danglingNoteOffs++;
        }
      } else if (kind === 0xb0) {
        if (data1 === 0) continue; // Bank select carries no musical meaning here.
        const previous = track.controllers[data1];
        if (previous === undefined) track.controllers[data1] = data2;
        else track.controllers[data1] = previous;
        if (data1 === 10 && track.channel === null) track.channel = channel;
      } else if (kind === 0xc0) {
        track.program = data1;
        if (track.channel === null) track.channel = channel;
      } else if (kind === 0xa0) {
        track.aftertouch++;
      } else if (kind === 0xd0) {
        track.aftertouch++;
      } else if (kind === 0xe0) {
        track.pitchBends++;
      }
    }

    if (pending.size) track.danglingNoteOffs += pending.size;
    return track;
  }

  function readMidi(input, options) {
    const settings = options || {};
    const limits = Object.assign({}, LIMITS, settings.limits || {});
    const warnings = [];
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input || []);
    if (bytes.length < HEADER_LENGTH + 4) fail('MIDI: файл слишком короткий.');
    if (bytes.length > limits.maxFileBytes) {
      fail(`MIDI: файл больше допустимых ${Math.round(limits.maxFileBytes / (1024 * 1024))} МБ.`);
    }
    if (!isMidi(bytes)) fail('MIDI: сигнатура MThd не найдена — это не Standard MIDI File.');

    const headerCursor = { at: 4 };
    const headerLength = readUint32(bytes, headerCursor);
    if (headerLength < HEADER_LENGTH) fail('MIDI: заголовок короче шести байт.');
    const format = (bytes[headerCursor.at] << 8) | bytes[headerCursor.at + 1];
    const declaredTracks = (bytes[headerCursor.at + 2] << 8) | bytes[headerCursor.at + 3];
    const divisionRaw = (bytes[headerCursor.at + 4] << 8) | bytes[headerCursor.at + 5];
    headerCursor.at += HEADER_LENGTH;
    if (headerLength > HEADER_LENGTH) headerCursor.at += headerLength - HEADER_LENGTH;

    if (format > 2) fail(`MIDI: формат ${format} не поддерживается (0, 1 и 2 — стандартные).`);
    const smpte = (divisionRaw & 0x8000) !== 0;
    if (smpte) fail('MIDI: деление по времени SMPTE не поддерживается — нужен формат с тиками на четверть.');
    const ticksPerQuarter = divisionRaw & 0x7fff;
    if (ticksPerQuarter <= 0) fail('MIDI: в заголовке указано нулевое деление.');
    if (declaredTracks > limits.maxTracks) {
      fail(`MIDI: дорожек ${declaredTracks} больше допустимых ${limits.maxTracks}.`);
    }

    const tracks = [];
    let cursor = headerCursor.at;
    let totalEvents = 0;
    while (cursor + 8 <= bytes.length && tracks.length < limits.maxTracks) {
      const magic = String.fromCharCode(bytes[cursor], bytes[cursor + 1], bytes[cursor + 2], bytes[cursor + 3]);
      if (magic !== TRACK_MAGIC) {
        if (tracks.length >= declaredTracks) break;
        fail(`MIDI: вместо MTrk на месте ${cursor} встречено «${magic}».`);
      }
      const lengthCursor = { at: cursor + 4 };
      const length = readUint32(bytes, lengthCursor);
      const start = lengthCursor.at;
      const end = start + length;
      if (end > bytes.length) fail('MIDI: трек объявлен длиннее оставшегося файла.');
      totalEvents += length;
      if (totalEvents > limits.maxEvents * 4) fail('MIDI: слишком много событий в файле.');
      tracks.push(parseTrack(bytes, start, end, tracks.length, limits, warnings));
      cursor = end;
    }

    if (!tracks.length) fail('MIDI: в файле не найдено ни одного трека.');
    if (declaredTracks && tracks.length < declaredTracks) {
      warnings.push(`MIDI: заголовок обещает ${declaredTracks} дорожек, прочитано ${tracks.length}.`);
    }

    const tempoEvents = [];
    const timeSignatures = [];
    const markers = [];
    const texts = [];
    const lyrics = [];
    const keySignatures = [];
    let notes = 0;
    for (const track of tracks) {
      tempoEvents.push(...track.tempoEvents.map((event) => ({ ...event, track: track.index })));
      timeSignatures.push(...track.timeSignatures.map((event) => ({ ...event, track: track.index })));
      keySignatures.push(...track.keySignatures.map((event) => ({ ...event, track: track.index })));
      for (const marker of track.markers) markers.push({ ...marker, track: track.index });
      for (const text of track.texts) texts.push({ ...text, track: track.index });
      for (const item of track.lyrics) lyrics.push({ ...item, track: track.index });
      notes += track.notes.length;
      if (track.notesOverLimit) warnings.push(`MIDI: в треке ${track.index + 1} отброшено нот — ${track.notesOverLimit}.`);
      if (track.danglingNoteOffs) warnings.push(`MIDI: в треке ${track.index + 1} ноты без закрытия — ${track.danglingNoteOffs}.`);
    }

    tempoEvents.sort((a, b) => a.tick - b.tick);
    timeSignatures.sort((a, b) => a.tick - b.tick);
    markers.sort((a, b) => a.tick - b.tick || a.track - b.track);

    const firstTempo = tempoEvents.find((event) => event.tick === 0) || tempoEvents[0] || null;
    const firstTimeSig = timeSignatures.find((event) => event.tick === 0) || timeSignatures[0] || null;
    const lastTick = tracks.reduce(
      (max, track) => Math.max(max,
        track.notes.reduce((noteMax, note) => Math.max(noteMax, note.tick + note.duration), 0),
        ...track.markers.map((marker) => marker.tick)), 0);

    return {
      format,
      division: ticksPerQuarter,
      declaredTracks,
      tracks,
      tempo: firstTempo ? firstTempo.bpm : 120,
      tempoEvents,
      timeSignatures,
      markers,
      texts,
      lyrics,
      keySignatures,
      notes,
      lastTick,
      warnings,
    };
  }

  return Object.freeze({
    MAGIC,
    TRACK_MAGIC,
    LIMITS,
    META,
    isMidi,
    readMidi,
  });
});
