#!/usr/bin/env node
// E4: настоящие экспортные байты читаются независимым alphaTab, не импортом приложения.
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { readScore, gpifZip, notes } = require('./helpers/export-oracle');
const codec = require('../gpx-bcfz-runtime');
const root = path.resolve(__dirname, '../..');
const output = process.env.B12_E4_RESULTS ? path.resolve(process.env.B12_E4_RESULTS) : null;
const measurements = [];
if (output) fs.mkdirSync(output, { recursive: true });
const errors = [];
const vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(e.message));
const dom = new JSDOM(fs.readFileSync(process.env.STRUCHORD_HTML || path.join(root, 'STRUCHORD.html'), 'utf8'), {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/?view=editor', virtualConsole: vc,
  beforeParse(w) {
    w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder;
    w.HTMLCanvasElement.prototype.getContext = () => new Proxy({ measureText: () => ({ width: 10 }), createLinearGradient: () => ({ addColorStop() {} }) }, { get: (o,k) => k in o ? o[k] : () => {} });
    w.URL.createObjectURL = () => 'blob:export-test'; w.URL.revokeObjectURL = () => {};
    w.HTMLAnchorElement.prototype.click = () => {}; w.confirm = () => true;
  },
});
const w = dom.window, sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
function check(label, value, detail = '') { measurements.push({ label, ok: !!value }); console.log(`${value ? 'ok  ' : 'FAIL'} ${label} ${detail}`); value ? pass++ : fail++; }
async function test(label, fn) { try { await fn(); } catch (e) { check(label, false, e.stack); } }
const clone = o => JSON.parse(JSON.stringify(o));
function song(tuning = 'e-std') {
  return { schemaVersion: 9, metadata: { title: 'E4 шесть струн', artist: 'STRUCHORD' }, bpm: 120,
    globalTimeSig: '4/4', globalKey: 'C', keyMode: 'manual', tuning, tuningNotes: null, parts: [],
    sections: [{ id: 101, type: 'Verse', repeat: 1, squares: [{ id: 102, type: 'tab', beats: 8, repeat: 1, events: [],
      notes: Array.from({ length: 6 }, (_, string) => ({ start: string, dur: 1, string, fret: 0 })) }] }] };
}
async function load(value) {
  w.localStorage.setItem('struchord_songs', JSON.stringify([value])); w.loadSong(0); await sleep(100);
}
function xmlOf(result) {
  const files = codec.readContainer(Uint8Array.from(result.bytes)).entries;
  const file = files.find(f => f.name === 'score.gpif');
  return new TextDecoder().decode(file.data || file.bytes);
}
function midiEvents(midi) { return midi.tracks.flatMap((track,index) => { let at = 0; return track.map(e => { at += e.deltaTime; return { ...e, at, track: index }; }); }); }
async function artifacts(name) {
  if (!output) return;
  const source = await w.exportStruchordFile(), gp5 = w.gpExportBytesGP5(), gpx = w.gpExportBytes(), midi = w.midiExportBytes();
  const xml = xmlOf(gpx);
  const dump = {};
  fs.writeFileSync(path.join(output, name + '.struchord'), JSON.stringify(source, null, 2));
  for (const [ext, result] of Object.entries({ gp5, gpx, mid: midi })) fs.writeFileSync(path.join(output, `${name}.${ext}`), Buffer.from(result.bytes));
  fs.writeFileSync(path.join(output, name + '.score.gpif'), xml);
  for (const [ext, result] of Object.entries({ gp5, gpx })) {
    const score = readScore(ext === 'gpx' ? gpifZip(xml) : result.bytes);
    dump[ext] = { method: ext === 'gp5' ? 'alphaTab 1.8.4: original GP5 bytes' : 'alphaTab 1.8.4: original score.gpif in independent GP7 ZIP wrapper (not a GPX container test)',
      bars: score.masterBars.length, tuning: score.tracks.map(t => t.staves[0].tuning), notes: notes(score), report: result.report };
  }
  dump.midi = { method: 'midi-file 1.2.4 independent SMF parser', parsed: require('midi-file').parseMidi(midi.bytes), report: midi.report };
  fs.writeFileSync(path.join(output, name + '.oracle.json'), JSON.stringify(dump, null, 2));
}
async function main() {
  await sleep(250);
  for (const tuning of ['e-std', 'drop-d', 'custom']) await test(tuning, async () => {
    const value = song(tuning === 'custom' ? 'e-std' : tuning);
    if (tuning === 'custom') { value.tuningNotes = ['C2','G2','C3','F3','A3','D4']; value.capo = 2; }
    await load(value);
    const snapshot = () => w.eval('JSON.stringify({sections, tuning: songTuningNotes(), parts: songParts})');
    const before = snapshot();
    for (const format of ['GP5', 'GPX']) {
      const result = format === 'GP5' ? w.gpExportBytesGP5() : w.gpExportBytes();
      const xml = format === 'GPX' ? xmlOf(result) : null;
      const score = readScore(xml ? gpifZip(xml) : result.bytes), list = notes(score);
      console.log('oracle', format, tuning, JSON.stringify(list));
      check(`${format} ${tuning}: 6 нот`, list.length === 6);
      check(`${format} ${tuning}: все струны (alphaTab 1=низкая)`, list.map(n => n.string).join() === '1,2,3,4,5,6');
      check(`${format} ${tuning}: высоты`, list.map(n => n.pitch).join() === (tuning === 'custom' ? '38,45,50,55,59,64' : tuning === 'drop-d' ? '38,45,50,55,59,64' : '40,45,50,55,59,64'));
      check(`${format}: 2 настоящих такта`, score.masterBars.length === 2);
      if (tuning === 'custom') check(`${format}: произвольный строй и капо хранятся отдельно`, score.tracks[0].staves[0].tuning.join() === '62,57,53,48,43,36' && score.tracks[0].staves[0].capo === 2);
      check(`${format}: экспорт не навязывает свинг`, score.masterBars.every(b => b.tripletFeel === 0));
      check(`${format}: нет запасного строя`, !result.report.losses.some(l => /строй не распознан/.test(l.label)));
      check(`${format}: отчёт считает 6 нот`, result.report.stats.notes === 6);
    }
    check('экспорт не изменил песню', snapshot() === before);
    await artifacts('six-strings-' + tuning);
  });
  if (typeof w.midiExportBytes === 'function') await test('MIDI', async () => {
    await load(song('drop-d'));
    const result = w.midiExportBytes(), midi = require('midi-file').parseMidi(result.bytes);
    check('SMF format 1 + conductor', midi.header.format === 1 && midi.header.numTracks === 2);
    const on = midiEvents(midi).filter(e => e.type === 'noteOn');
    check('MIDI Drop D: шесть точных высот', on.map(e => e.noteNumber).join() === '38,45,50,55,59,64');
    check('MIDI: шесть точных начал', on.map(e => e.at).join() === '0,960,1920,2880,3840,4800');
    check('MIDI: шесть точных концов', midiEvents(midi).filter(e => e.type === 'noteOff').map(e => e.at).join() === '960,1920,2880,3840,4800,5760');
  });
  await test('ритм', async () => {
    const value = song(); value.capo = 2;
    value.sections[0].squares[0].beats = 4;
    value.sections[0].squares[0].notes = [
      { start: 0, dur: 1, dots: 1, string: 0, fret: 3 },
      { start: 1.5, dur: .5, pause: true },
      ...[2, 7/3, 8/3].map((start,i) => ({ start, dur: .5, triplet: true, string: i+1, fret: i+2 })),
      { start: 3, dur: .0625, dots: 1, string: 4, fret: 12 },
      { start: 3.25, dur: .0625, triplet: true, string: 5, fret: 24 },
    ];
    await load(value);
    for (const format of ['GP5', 'GPX']) {
      const result = format === 'GP5' ? w.gpExportBytesGP5() : w.gpExportBytes();
      const score = readScore(format === 'GPX' ? gpifZip(xmlOf(result)) : result.bytes), list = notes(score).filter(n => !n.tie);
      check(`${format}: пауза не стала нотой`, list.length === 6, JSON.stringify(list));
      check(`${format}: точные начала триолей/паузы`, list.map(n => n.start).join() === '0,1920,2240,2560,2880,3120', JSON.stringify(list));
      check(`${format}: точка и 1/64-триоль`, list.map(n => n.dur).join() === '1440,320,320,320,90,40');
      check(`${format}: капо 2`, list.map(n => n.pitch).join() === '45,49,55,61,73,90');
    }
    await artifacts('rhythm-capo');
    const midi = require('midi-file').parseMidi(w.midiExportBytes().bytes), list = midiEvents(midi).filter(e => e.type === 'noteOn');
    check('MIDI: пауза/точки/триоли/капо', list.map(e => e.at).join() === '0,1920,2240,2560,2880,3120' && list.map(e => e.noteNumber).join() === '45,49,55,61,73,90');
  });
  await test('6/8 и смены темпа', async () => {
    const value = song('drop-d'); value.globalTimeSig = '6/8';
    value.sections[0].squares[0].beats = 6;
    value.sections[0].squares[0].notes = [0,2,4].map(start => ({ start, dur: 2, string: 0, fret: start }));
    value.sections[0].bpm = 90;
    value.sections.push({ ...clone(value.sections[0]), id: 201, bpm: null, timeSig: '4/4', squares: [{ id: 202, type: 'tab', beats: 4, events: [], notes: [{ start: 0, dur: 1, string: 5, fret: 0 }] }] });
    await load(value);
    for (const format of ['GP5', 'GPX']) {
      const result = format === 'GP5' ? w.gpExportBytesGP5() : w.gpExportBytes();
      const score = readScore(format === 'GPX' ? gpifZip(xmlOf(result)) : result.bytes), list = notes(score);
      check(`${format}: 6/8 четверти, не восьмые`, list.slice(0,3).every(n => n.dur === 960) && list.map(n => n.start).join() === '0,960,1920,0');
      check(`${format}: 2 такта разных размеров`, score.masterBars.length === 2 && score.masterBars[0].timeSignatureNumerator === 6 && score.masterBars[1].timeSignatureNumerator === 4);
      console.log('tempo oracle', format, score.masterBars.map(b => b.tempoAutomations.map(t => t.value)));
      check(`${format}: темп 90 → 120`, score.masterBars[0].tempoAutomations.some(t => t.value === 90) && score.masterBars[1].tempoAutomations.some(t => t.value === 120));
    }
    await artifacts('meter-tempo');
    const midi = require('midi-file').parseMidi(w.midiExportBytes().bytes), events = midiEvents(midi);
    check('MIDI: 6/8 даёт 2880 тиков', events.filter(e => e.type === 'noteOn').map(e => e.at).join() === '0,960,1920,2880');
    check('MIDI: смена темпа', events.filter(e => e.type === 'setTempo').map(e => e.microsecondsPerBeat).join() === '666667,500000');
  });
  await test('повторы', async () => {
    const value = song(); value.sections[0].repeat = 2; value.sections[0].squares[0].repeat = 2;
    await load(value);
    const gp5 = readScore(w.gpExportBytesGP5().bytes), gpx = readScore(gpifZip(xmlOf(w.gpExportBytes())));
    check('GP5: квадрат развёрнут, секция — нативный повтор', gp5.masterBars.length === 4 && notes(gp5).length === 12 && gp5.masterBars[3].repeatCount === 2);
    check('GPX: оба повтора развёрнуты без потерь', gpx.masterBars.length === 8 && notes(gpx).length === 24);
    w.eval('playbackState.isLooping = true');
    const midi = require('midi-file').parseMidi(w.midiExportBytes().bytes);
    check('MIDI: 24 ноты, даже при включённом Loop конечен', midiEvents(midi).filter(e => e.type === 'noteOn').length === 24);
    check('экспорт не выключил Loop транспорта', w.eval('playbackState.isLooping') === true);
    w.eval('playbackState.isLooping = false');
  });
  await test('TAB → Em → тишина, партии и mute', async () => {
    const value = song(); const sec = value.sections[0];
    sec.squares[0].beats = 4; sec.squares[0].notes = sec.squares[0].notes.slice(0,4);
    sec.squares.push({ id: 103, events: [{ chord: 'Em', span: 4 }] }, { id: 104, events: [{ chord: '', span: 4 }] });
    value.parts = [
      { id: 501, name: 'Keys', instrument: 'keys', pitchRolls: { 101: [{ start: 0, dur: 1, pitch: 72, velocity: 60 }, { start: 4, dur: 1, pitch: 74 }] }, mix: { volume: 70, pan: -20 } },
      { id: 502, name: 'Muted drums', instrument: 'drums', pitchRolls: { 101: [{ start: 0, dur: 1, pitch: 36 }] }, mix: { mute: true } },
    ];
    await load(value);
    for (const format of ['GP5', 'GPX']) {
      const result = format === 'GP5' ? w.gpExportBytesGP5() : w.gpExportBytes();
      const score = readScore(format === 'GPX' ? gpifZip(xmlOf(result)) : result.bytes);
      check(`${format}: 3 такта на каждой из 4 дорожек`, score.masterBars.length === 3 && score.tracks.length === 4 && score.tracks.every(t => t.staves[0].bars.length === 3));
      const tab = notes({ tracks: [score.tracks[3]] }), accomp = notes({ tracks: [score.tracks[2]] });
      check(`${format}: TAB ровно 4 ноты, аккомпанемент не дублирует его`, tab.length === 4 && accomp.length === 6 && accomp.every(n => n.bar === 1));
      if (format === 'GPX') {
        const xml = new JSDOM(xmlOf(result), { contentType: 'text/xml' });
        check('GPIF: в MasterBar ровно 4 ссылки, все уникальные', [...xml.window.document.querySelectorAll('MasterBars > MasterBar > Bars')].every(n => n.textContent.trim().split(/\s+/).length === 4)); xml.window.close();
      }
    }
    await artifacts('tab-em-silence');
    const result = w.midiExportBytes(), midi = require('midi-file').parseMidi(result.bytes), events = midiEvents(midi);
    check('MIDI: mute-барабаны исключены', midi.header.numTracks === 3 && !events.some(e => e.type === 'noteOn' && e.noteNumber === 36));
    check('MIDI: TAB звучит 1 раз, затем 6 нот Em, затем тишина', events.filter(e => e.type === 'noteOn' && e.track === 1).map(e => e.at).join() === '0,960,1920,2880,3840,3840,3840,3840,3840,3840');
    check('MIDI: velocity и отдельная партия', events.some(e => e.type === 'noteOn' && e.track === 2 && e.noteNumber === 72 && e.velocity === 60));
    value.parts[0].mix.solo = true; await load(value);
    const solo = midiEvents(require('midi-file').parseMidi(w.midiExportBytes().bytes)).filter(e => e.type === 'noteOn');
    check('MIDI: Solo оставляет только Keys', solo.length === 2 && solo.map(e => e.noteNumber).join() === '72,74');
    value.mix = { master: { mute: true } }; await load(value);
    check('MIDI: mute мастера — только conductor', require('midi-file').parseMidi(w.midiExportBytes().bytes).header.numTracks === 1);
  });
  await test('MIDI: ударные, табовая партия и границы pitch', async () => {
    const value = song();
    value.parts = [
      { id: 501, name: 'Keys', instrument: 'keys', pitchRolls: { 101: [{ start: 0, dur: .5, pitch: 0 }, { start: 1, dur: 1, pitch: 127 }] } },
      { id: 502, name: 'Drums', instrument: 'drums', pitchRolls: { 101: [{ start: 0, dur: 1, pitch: 36 }, { start: 1, dur: .5, pitch: 38 }] } },
      { id: 503, name: 'Guitar', instrument: 'guitar', tuning: 'drop-d', capo: 3, rolls: { 101: [{ start: 0, dur: .5, string: 0, fret: 5 }] } },
    ];
    await load(value);
    const midi = require('midi-file').parseMidi(w.midiExportBytes().bytes), events = midiEvents(midi), on = events.filter(e => e.type === 'noteOn');
    check('MIDI: канал 10 только у ударных', on.filter(e => e.channel === 9).map(e => e.noteNumber).join() === '36,38');
    check('MIDI: абсолютные pitch 0/127 сохранены', on.filter(e => e.track === 2).map(e => e.noteNumber).join() === '0,127');
    check('MIDI: строй/капо табовой партии', on.filter(e => e.track === 4).map(e => e.noteNumber).join() === '46');
    check('MIDI: каналы гитары и Keys различаются', on.find(e => e.track === 4).channel !== on.find(e => e.track === 2).channel);
  });
  await test('лига через тактовую черту', async () => {
    const value = song(); value.sections[0].squares[0].notes = [{ start: 3, dur: 2, string: 0, fret: 7 }];
    await load(value);
    for (const format of ['GP5', 'GPX']) {
      const result = format === 'GP5' ? w.gpExportBytesGP5() : w.gpExportBytes();
      const list = notes(readScore(format === 'GPX' ? gpifZip(xmlOf(result)) : result.bytes));
      check(`${format}: отчёт считает 1 атаку и 2 нотных знака`, result.report.stats.notes === 1 && result.report.stats.noteheads === 2);
      check(`${format}: нота через черту — 2 фрагмента, второй связан`, list.length === 2 && list[0].start === 2880 && list[1].bar === 1 && list[1].tie && list.every(n => n.pitch === 47));
    }
  });
  await test('T17: вставка после 16 долей аккордов', async () => {
    const value = song(); value.sections[0].squares.unshift({ id: 200, events: Array.from({ length: 4 }, () => ({ chord: 'Em', span: 4 })) });
    await load(value);
    for (const format of ['GP5', 'GPX']) {
      const result = format === 'GP5' ? w.gpExportBytesGP5() : w.gpExportBytes();
      const score = readScore(format === 'GPX' ? gpifZip(xmlOf(result)) : result.bytes);
      const tab = notes({ tracks: [score.tracks[score.tracks.length - 1]] });
      check(`${format}: TAB начинается на 5-м такте и содержит 6 нот`, score.masterBars.length === 6 && tab.length === 6 && tab[0].bar === 4 && tab[0].start === 0);
    }
  });
  check('MIDI API существует', typeof w.midiExportBytes === 'function');
  check('нет ошибок страницы', errors.length === 0, errors.join(' | '));
  if (output) fs.writeFileSync(path.join(output, 'checks.json'), JSON.stringify({ checks: measurements, pass, fail }, null, 2));
  dom.window.close(); console.log(`${pass} ok / ${fail} FAIL`); process.exitCode = fail ? 1 : 0;
}
main().catch(e => { console.error(e.message); dom.window.close(); process.exitCode = 1; });
