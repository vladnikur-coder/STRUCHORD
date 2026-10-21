// Независимый alphaTab: только поставляемый vendor-бандл, без функций STRUCHORD.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '../../..', 'STRUCHORD.html'), 'utf8');
const context = { exports: {}, TextDecoder, TextEncoder, URL, Uint8Array, ArrayBuffer,
  Map, Set, process, require, console, setTimeout, clearTimeout };
context.module = { exports: context.exports };
vm.runInNewContext(html.split('\n').find(line => line.startsWith('!function(t,e)')), context);
const alphaTab = context.exports;
// GP7 ZIP-обёртка только для независимого чтения score.gpif из GPX.
// Контейнер BCFS проверяется отдельно; XML читается vendor-движком, не нашим импортом.
function gpifZip(xml) {
  const data = Buffer.from(xml), name = Buffer.from('Content/score.gpif');
  let crc = 0xffffffff;
  for (const byte of data) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  crc = (crc ^ 0xffffffff) >>> 0;
  const local = Buffer.alloc(30), central = Buffer.alloc(46), end = Buffer.alloc(22);
  local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
  central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
  central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12); end.writeUInt32LE(local.length + name.length + data.length, 16);
  return Buffer.concat([local, name, data, central, name, end]);
}
function readScore(bytes) { const settings = new alphaTab.Settings(); settings.importer.encoding = 'windows-1251'; return alphaTab.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(bytes), settings); }
function notes(score, name) {
  const out = [];
  for (const track of score.tracks.filter(t => !name || t.name === name))
    for (const staff of track.staves) for (const bar of staff.bars) for (const voice of bar.voices)
      for (const beat of voice.beats) for (const note of beat.notes) out.push({
        track: track.name, bar: bar.index, start: beat.playbackStart, dur: beat.playbackDuration,
        string: note.string, fret: note.fret, pitch: note.realValue, tie: note.isTieDestination,
      });
  return out;
}
module.exports = { alphaTab, gpifZip, readScore, notes };
