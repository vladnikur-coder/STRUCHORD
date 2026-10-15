#!/usr/bin/env node
/*
 * midi-fixture.js — детерминированный генератор MIDI-файлов для тестов.
 *
 * Только dev: нужен, чтобы собирать байты SMF, которые нельзя приложить к
 * репозиторию (форматы 0/1/2, running status, sysex, битые заголовки).
 *
 * Использование:
 *   const { buildMidi } = require('./dev/tools/midi-fixture.js');
 *   const bytes = buildMidi({ format: 1, division: 480, tracks: [...] });
 */
'use strict';

function u16(value) {
  return [value >> 8 & 0xff, value & 0xff];
}

function u32(value) {
  return [value >> 24 & 0xff, value >> 16 & 0xff, value >> 8 & 0xff, value & 0xff];
}

function ascii(text) {
  const out = [];
  for (let i = 0; i < text.length; i++) out.push(text.charCodeAt(i) & 0xff);
  return out;
}

function varLen(value) {
  const bytes = [value & 0x7f];
  let rest = Math.floor(value / 128);
  while (rest > 0) {
    bytes.unshift((rest & 0x7f) | 0x80);
    rest = Math.floor(rest / 128);
  }
  return bytes;
}

// note: { start, duration, pitch, velocity, channel }
// controller: { number, value, at, channel }
// meta: { type, data, at }
// marker/text/trackName/tempo/timeSignature are shortcuts for meta.
function buildTrack(track) {
  const events = [];
  const push = (at, bytes) => events.push({ at, bytes });

  for (const note of track.notes || []) {
    const channel = note.channel || 0;
    push(note.start, [0x90 | channel, note.pitch, note.velocity === undefined ? 90 : note.velocity]);
    push(note.start + (note.duration === undefined ? 240 : note.duration), [0x80 | channel, note.pitch, 0x40]);
  }
  for (const controller of track.controllers || []) {
    const channel = controller.channel || 0;
    push(controller.at || 0, [0xb0 | channel, controller.number, controller.value]);
  }
  for (const program of track.programs || []) {
    const channel = program.channel || 0;
    push(program.at || 0, [0xc0 | channel, program.value]);
  }
  if (track.bends) {
    for (const bend of track.bends) push(bend.at || 0, [0xe0 | (bend.channel || 0), bend.value & 0x7f, (bend.value >> 7) & 0x7f]);
  }
  for (const item of track.metas || []) {
    push(item.at || 0, [0xff, item.type, ...varLen((item.data || []).length), ...(item.data || [])]);
  }
  if (track.trackName) push(0, [0xff, 0x03, ...varLen(track.trackName.length), ...ascii(track.trackName)]);
  if (track.sysex) push(0, [0xf0, ...varLen(track.sysex.length), ...track.sysex]);

  events.sort((a, b) => a.at - b.at);

  const body = [];
  let last = 0;
  let status = 0;
  for (const event of events) {
    let delta = event.at - last;
    if (delta < 0) delta = 0;
    last = event.at;
    const bytes = event.bytes.slice();
    const meta = bytes[0] === 0xff || bytes[0] === 0xf0 || bytes[0] === 0xf7;
    if (!meta && bytes[0] < 0x80) {
      // running status: повторяем последний статус без нового байта
      if (!status) throw new Error('running status без предыдущего статуса');
      if (track.rawStream) {
        // сырой поток без явных статус-байтов — проверим running status
        body.push(...varLen(delta), ...bytes);
        continue;
      }
    } else if (!meta) {
      status = bytes[0];
    } else {
      status = 0;
    }
    body.push(...varLen(delta), ...bytes);
  }
  body.push(...varLen(Math.max(0, (track.length || last) - last)), 0xff, 0x2f, 0x00);

  return [...ascii('MTrk'), ...u32(body.length), ...body];
}

function buildMidi(options) {
  const opts = options || {};
  const division = opts.division === undefined ? 480 : opts.division;
  const tracks = opts.tracks || [{ notes: [] }];
  const parts = [...ascii('MThd'), ...u32(6), ...u16(opts.format === undefined ? 1 : opts.format),
    ...u16(opts.declaredTracks === undefined ? tracks.length : opts.declaredTracks), ...u16(division)];
  for (const track of tracks) parts.push(...buildTrack(track));
  if (opts.tail) parts.push(...opts.tail);
  return Uint8Array.from(parts);
}

function tempoMicros(bpm) {
  const micros = Math.round(60000000 / bpm);
  return [(micros >> 16) & 0xff, (micros >> 8) & 0xff, micros & 0xff];
}

module.exports = { buildMidi, tempoMicros, ascii, varLen, u16, u32 };
