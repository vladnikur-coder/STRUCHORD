// b12-midi-container.js — чтение Standard MIDI File (кирпич 12.9.7).
//
// Повод: импорт .mid должен работать офлайн и без внешних библиотек, как уже
// сделано для ZIP (12.9.5) и BCFZ (12.9.6). Сьют сторожит разбор байтов:
// заголовок и форматы, деление, running status, sysex, мета-события (темп,
// размер, маркеры, имя трека, тональность), пары note on/off, контроллеры и
// честные отказы на битых файлах.
const fs = require('fs');
const path = require('path');
const midi = require('../midi-runtime.js');
const { buildMidi, tempoMicros } = require('../tools/midi-fixture.js');

let pass = 0;
let fail = 0;
function ok(name, condition, detail) {
  if (condition) { pass++; console.log(`   ok   ${name}`); }
  else { fail++; console.log(`   FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
function throws(name, fn, pattern) {
  let message = '';
  try { fn(); } catch (error) { message = String(error && error.message || error); }
  const good = pattern ? message.includes(pattern) : !!message;
  ok(name, good, message ? 'сообщение: ' + message : 'исключения не было');
}

console.log('=== 1. сигнатура и опознание ===');
const simple = buildMidi({
  format: 1,
  division: 480,
  tracks: [
    { metas: [{ type: 0x51, data: tempoMicros(120), at: 0 }], length: 480 },
    {
      trackName: 'Lead',
      programs: [{ value: 29, channel: 2 }],
      notes: [
        { start: 0, duration: 240, pitch: 64, velocity: 100, channel: 2 },
        { start: 240, duration: 240, pitch: 67, velocity: 90, channel: 2 },
      ],
      length: 960,
    },
  ],
});
ok('isMidi() узнаёт собственный файл', midi.isMidi(simple));
ok('isMidi() отвергает посторонние байты', !midi.isMidi(Uint8Array.from([1, 2, 3, 4, 5, 6])));
throws('мусор без MThd отклоняется', () => midi.readMidi(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])), 'MThd');

console.log('=== 2. заголовок ===');
const parsed = midi.readMidi(simple);
ok('формат прочитан', parsed.format === 1, String(parsed.format));
ok('деление прочитано', parsed.division === 480, String(parsed.division));
ok('дорожек столько, сколько объявлено', parsed.tracks.length === 2, String(parsed.tracks.length));
ok('темп взят из первого Tempo', parsed.tempo === 120, String(parsed.tempo));

console.log('=== 3. события дорожки ===');
const lead = parsed.tracks[1];
ok('имя трека прочитано', lead.name === 'Lead', lead.name);
ok('программа прочитана', lead.program === 29, String(lead.program));
ok('канал прочитан', lead.channel === 2, String(lead.channel));
ok('ноты собраны в пары on/off', lead.notes.length === 2, String(lead.notes.length));
ok('позиция первой ноты', lead.notes[0].tick === 0 && lead.notes[0].pitch === 64);
ok('длительность первой ноты', lead.notes[0].duration === 240, String(lead.notes[0].duration));
ok('громкость первой ноты', lead.notes[0].velocity === 100, String(lead.notes[0].velocity));
ok('позиция второй ноты', lead.notes[1].tick === 240 && lead.notes[1].pitch === 67);
ok('последний тик файла', parsed.lastTick === 480, String(parsed.lastTick));

console.log('=== 4. мета-события ===');
const meta = midi.readMidi(buildMidi({
  tracks: [{
    trackName: 'Meta',
    markers: undefined,
    metas: [
      { type: 0x06, data: Array.from(Buffer.from('Verse 1', 'latin1')), at: 0 },
      { type: 0x06, data: Array.from(Buffer.from('Chorus', 'latin1')), at: 960 },
      { type: 0x58, data: [3, 2, 24, 8], at: 0 },
      { type: 0x59, data: [0, 2], at: 0 },
      { type: 0x01, data: Array.from(Buffer.from('Some words', 'latin1')), at: 240 },
      { type: 0x51, data: tempoMicros(120), at: 0 },
      { type: 0x51, data: tempoMicros(90), at: 960 },
    ],
    notes: [],
    length: 1920,
  }],
}));
ok('маркеры собраны и отсортированы', meta.markers.length === 2 &&
  meta.markers[0].tick === 0 && meta.markers[1].tick === 960, String(meta.markers.length));
ok('текст маркера прочитан', meta.markers[1].text === 'Chorus', meta.markers[1].text);
ok('размер прочитан', meta.timeSignatures[0].numerator === 3 && meta.timeSignatures[0].denominator === 4,
  JSON.stringify(meta.timeSignatures[0]));
ok('тональность прочитана', meta.keySignatures.length === 1 && meta.keySignatures[0].sharps === 2,
  JSON.stringify(meta.keySignatures[0]));
ok('текст песни прочитан', meta.texts.length === 1 && meta.texts[0].text === 'Some words',
  JSON.stringify(meta.texts));
ok('несколько темпов сохранены', meta.tempoEvents.length === 2, String(meta.tempoEvents.length));
ok('первый темп стал основным', meta.tempo === 120, String(meta.tempo));

const accent = midi.readMidi(buildMidi({
  tracks: [{
    trackName: 'Björk',
    metas: [{ type: 0x06, data: Array.from(Buffer.from('Guður', 'latin1')), at: 0 }],
    notes: [], length: 480,
  }],
}));
ok('имя трека с латиницей прочитано', accent.tracks[0].name === 'Björk', accent.tracks[0].name);
ok('маркер с латиницей прочитан', accent.markers[0].text === 'Guður', accent.markers[0].text);

console.log('=== 5. контроллеры, sysex, running status ===');
const ctrl = midi.readMidi(buildMidi({
  tracks: [{
    trackName: 'Ctrl',
    programs: [{ value: 26, channel: 1 }],
    controllers: [
      { number: 6, value: 6, at: 0, channel: 1 },
      { number: 10, value: 64, at: 0, channel: 1 },
      { number: 120, value: 0, at: 240, channel: 1 },
    ],
    sysex: [0x7e, 0x7f, 0x09, 0x01, 0xf7],
    notes: [
      { start: 0, duration: 240, pitch: 60, channel: 1 },
      { start: 240, duration: 240, pitch: 62, channel: 1 },
      { start: 480, duration: 240, pitch: 64, channel: 1 },
    ],
    rawStream: true,
    length: 960,
  }],
}));
ok('CC6 прочитан', ctrl.tracks[0].controllers[6] === 6, JSON.stringify(ctrl.tracks[0].controllers));
ok('CC10 прочитан', ctrl.tracks[0].controllers[10] === 64);
ok('sysex посчитан и пропущен', ctrl.tracks[0].sysex === 1, String(ctrl.tracks[0].sysex));
ok('running status не сбивает ноты', ctrl.tracks[0].notes.length === 3, String(ctrl.tracks[0].notes.length));
ok('позиции нот после running status', ctrl.tracks[0].notes[2].tick === 480, String(ctrl.tracks[0].notes[2].tick));

console.log('=== 6. граничные случаи нот ===');
const edges = midi.readMidi(buildMidi({
  tracks: [{
    notes: [
      { start: 0, duration: 120, pitch: 60, velocity: 0 },
      { start: 0, duration: 480, pitch: 60, velocity: 70 },
      { start: 120, duration: 240, pitch: 60, velocity: 80 },
    ],
    length: 960,
  }],
}));
const edgeNotes = edges.tracks[0].notes;
ok('note on с нулевой громкостью — это note off', edgeNotes.length === 2, String(edgeNotes.length));
ok('лишние note off посчитаны', edges.tracks[0].danglingNoteOffs === 2,
  String(edges.tracks[0].danglingNoteOffs));
ok('повторный on закрывает предыдущую ноту', edgeNotes[0].tick === 0 && edgeNotes[0].duration === 120,
  `${edgeNotes[0].tick}/${edgeNotes[0].duration}`);
ok('последняя нота закрыта своим off', edgeNotes[1].tick === 120 && edgeNotes[1].duration === 240,
  `${edgeNotes[1].tick}/${edgeNotes[1].duration}`);

console.log('=== 7. отказы на битых файлах ===');
throws('слишком короткий файл', () => midi.readMidi(Uint8Array.from([0x4d, 0x54, 0x68, 0x64, 0, 0, 0])), 'коротк');
throws('неизвестный формат', () => midi.readMidi(buildMidi({ format: 7, tracks: [{ notes: [] }] })), 'не поддерживается');
throws('нулевое деление', () => midi.readMidi(buildMidi({ division: 0, tracks: [{ notes: [] }] })), 'деление');
throws('SMPTE-деление отклоняется', () => midi.readMidi(buildMidi({ division: 0xe278, tracks: [{ notes: [] }] })), 'SMPTE');
throws('не MTrk вместо трека', () => midi.readMidi(buildMidi({
  tracks: [{ notes: [] }], declaredTracks: 2, tail: [0x58, 0x59, 0x5a, 0x5a, 0, 0, 0, 1],
})), 'вместо MTrk');

const truncated = simple.slice(0, simple.length - 6);
throws('обрезанный файл отклоняется', () => midi.readMidi(truncated));

console.log('=== 8. настоящие файлы пользователя ===');
const oracleDir = '/home/user/oracles';
const monsoonPath = path.join(oracleDir, 'monsoon.mid');
if (fs.existsSync(monsoonPath)) {
  const real = midi.readMidi(new Uint8Array(fs.readFileSync(monsoonPath)));
  ok('monsoon.mid: формат 1, деление 480', real.format === 1 && real.division === 480,
    `${real.format}/${real.division}`);
  ok('monsoon.mid: темп 112', real.tempo === 112, String(real.tempo));
  ok('monsoon.mid: размер 4/4', real.timeSignatures[0].numerator === 4 &&
    real.timeSignatures[0].denominator === 4, JSON.stringify(real.timeSignatures[0]));
  ok('monsoon.mid: четыре дорожки', real.tracks.length === 4, String(real.tracks.length));
  const named = real.tracks.slice(1).map(t => `${t.name}:${t.notes.length}`);
  ok('monsoon.mid: дорожки как у GP', JSON.stringify(named) ===
    JSON.stringify(['Overdriven Guitar:477', 'Jazz Guitar:1035', 'Steel Guitar:1620']), JSON.stringify(named));
  ok('monsoon.mid: громкость CC6 = 6 у всех дорожек',
    real.tracks.slice(1).every(t => t.controllers[6] === 6));
  ok('monsoon.mid: ноты посчитаны', real.notes === 3132, String(real.notes));
  ok('monsoon.mid: без потерь при разборе', real.warnings.length === 0, JSON.stringify(real.warnings));
} else {
  console.log('   пропуск: /tmp/oracles/monsoon.mid недоступен в этом прогоне');
}

console.log(`\nитого: ${pass} ok, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
