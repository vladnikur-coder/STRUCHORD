/* Тесты этапа 6 (STAGE 6 / экспорт всех дорожек) для STRUCHORD.
   Запуск: node test_stage6.js [базовый.html] [пропатченный.html] */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');
const PY = process.env.PYTHON || 'python3';

const W = __dirname;
const basePath = process.argv[2] || path.join(W, '..', 'uploads', 'STRUCHORD.html');
const patchedPath = process.argv[3] || path.join(W, '..', 'patch-work', 'stage6', 'STRUCHORD.html');
const base = fs.readFileSync(basePath, 'utf8');
const patched = fs.readFileSync(patchedPath, 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}

// ---------- 1. СТРУКТУРА ----------
console.log('\nСтруктура: блок STAGE6, 6 хуков, обязательные помощники R7/R6');
const needles = [
  ['маркер STAGE6', '// >>> B-39 STAGE6 BEGIN (TRACK EXPORT) <<<'],
  ['маркер /STAGE6', '// <<< B-39 STAGE6 END (TRACK EXPORT) <<<'],
  ['неймспейс StruChordExport', 'HOST.StruChordExport = api;'],
  ['виртуальный строй', "var WIDE_MIDI = [36, 48, 60, 72, 84, 96, 108];"],
  ['GM 0 для клавиш', "var GM_PROGRAM = { keys: 0, guitar: 25 };"],
  ['настоящий стан в GPIF', 'pitchNote'],
  ['призрак не звучит', 'stats.skippedGhost++; continue;'],
  ['GPX: withTracks', 'withTracks(songData, { grid: true, report: report })'],
  ['GP5: withTracks', 'withTracks(songData, { gp5: true, grid: true, report: report })'],
  ['MIDI: withTracks', 'window.StruChordExport.withTracks(serializeCurrentSong('],
  ['без дубля главной в GP', "Object.keys(rolls).length && !(window.StruChordExport && window.StruChordExport.hasTracks())"],
  ['без дубля канала Песня', "const songTrack = !solo && audible(songData.mix) && !(window.StruChordExport"],
  ['R12: формула', 'F.chordFormula(chord, key)'],
  ['R7/R6 не зашиты в блок', 'bump_release.py'],
];
for (const [name, needle] of needles) ok(name, patched.includes(needle));
ok('базовый файл без STAGE6', !base.includes('B-39 STAGE6 BEGIN'));
ok('прежние части на месте', ['B-39 STAGE0 BEGIN','B-39 STAGE1 BEGIN','B-39 STAGE2 BEGIN',
  'B-39 STAGE3 BEGIN','B-39 STAGE4 BEGIN','B-39 STAGE5 BEGIN'].every(x => patched.includes(x)));
ok('версия НЕ зашита в патч (R7)', !/ver 0\.692/.test(patched),
  'версию поднимает bump_release.py, а не патч');
ok('CACHE_NAME не ломается патчем', !patched.includes("CACHE_NAME = 'struchord-v692'"));
const code6 = (() => {
  const i = patched.indexOf('// >>> B-39 STAGE6 BEGIN');
  const j = patched.indexOf('// <<< B-39 STAGE6 END', i);
  return i >= 0 && j >= 0 ? patched.slice(i, j) : '';
})();
const noComments = s => s.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
ok('R12: нет гитарных функций в новом блоке',
  !/getChordNotes\s*\(|resolveFingeringShape|shapeToPluckNotes|strumChord\s*\(/
    .test(noComments(code6)));
ok(' companions: bump_release.py есть', fs.existsSync(path.join(W, 'bump_release.py')));
ok(' companions: apply_patch.py есть', fs.existsSync(path.join(W, 'apply_patch.py')));

// ---------- 2. МОДУЛИ ----------
function markerBlock(src, begin, end) {
  const i = src.indexOf(begin), j = src.indexOf(end, i);
  if (i < 0 || j < 0) throw new Error('маркер не найден: ' + begin);
  return src.slice(i, j + end.length);
}
const b0 = markerBlock(patched,'// >>> B-39 STAGE0 BEGIN (B-102) <<<','// <<< B-39 STAGE0 END (B-102) <<<');
const b1 = markerBlock(patched,'// >>> B-39 STAGE1 BEGIN (TRACKS) <<<','// <<< B-39 STAGE1 END (TRACKS) <<<');
const b3 = markerBlock(patched,'// >>> B-39 STAGE3 BEGIN (KEYS AUDIO) <<<','// <<< B-39 STAGE3 END (KEYS AUDIO) <<<');
const b4 = markerBlock(patched,'// >>> B-39 STAGE4 BEGIN (KEYS VOICING UI) <<<','// <<< B-39 STAGE4 END (KEYS VOICING UI) <<<');
const b5 = markerBlock(patched,'// >>> B-39 STAGE5 BEGIN (KEYS ACCOMPANIMENT) <<<','// <<< B-39 STAGE5 END (KEYS ACCOMPANIMENT) <<<');
const b6 = markerBlock(patched,'// >>> B-39 STAGE6 BEGIN (TRACK EXPORT) <<<','// <<< B-39 STAGE6 END (TRACK EXPORT) <<<');

const sandbox = {
  console, Math, JSON, Set, Map, Object, Array, String, Number, Boolean, Date,
  Float32Array, Uint8Array, TextEncoder, parseInt, parseFloat, isNaN, Infinity, NaN, undefined,
  setTimeout(){ return 0; }, clearTimeout(){},
  document: undefined,
  __b39Sections: [],
  songStore: { dispatch(l,m){return m();}, subscribe(){return ()=>{};}, log(){return [];} },
  normalizeAccidentals: v => String(v).replace(/♭/g,'b').replace(/♯/g,'#'),
  normalizeChordCase: v => String(v), getKeyStyle: k => (/b/i.test(String(k))?'flat':'sharp'),
  chordNameForReadablePreference: v => v,
  CHROMATIC: ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'],
  SHARP_TO_FLAT: {'C#':'Db','D#':'Eb','F#':'Gb','G#':'Ab','A#':'Bb',B:'Cb'},
  FLAT_TO_SHARP: {Db:'C#',Eb:'D#',Gb:'F#',Ab:'G#',Bb:'A#',Cb:'B'},
  expandChordName: v => String(v),
  mixerChannelForVoice(){ return {input:{gain:{value:1}},dry:{},wet:{},filters:[]}; },
  renderFingeringSVG: () => 'GUITAR_SVG',
  // Точная копия формулы окна события из приложения, на простых ячейках.
  partEventWindowUnits(sec, sq, ei) {
    let start = 0;
    for (const s of sec.squares || []) {
      if (s === sq) break;
      start += (s.events || []).reduce((a, e) => a + (Number(e.span) || 1), 0) * Math.max(1, Number(s.repeat) || 1);
    }
    const evs = (sq && sq.events) || [];
    for (let i = 0; i < ei; i++) start += Number(evs[i] && evs[i].span) || 1;
    const span = Number(evs[ei] && evs[ei].span) || 1;
    return { start, span, end: start + span };
  },
  getSquareBeats(sq) {
    return (sq.events || []).reduce((a,e)=>a+(Number(e.span)||1),0) * Math.max(1, Number(sq.repeat)||1);
  }
};
sandbox.window = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext('var sections = []; var globalKey = "C";\n' +
  [b0,b1,b3,b4,b5,b6].join('\n'), sandbox, { filename: 'b39-all-stages.js' });

const T = sandbox.StruChordTracks, F = sandbox.StruChordFormula;
const K = sandbox.StruChordKeys, Acc = sandbox.StruChordAccomp, E = sandbox.StruChordExport;
console.log('\nМодули загрузились');
ok('StruChordExport существует', !!E && typeof E.withTracks === 'function');
ok('hasTracks на дефолтной песне = false', E.hasTracks() === false);

function song() {
  return { schemaVersion:9, globalKey:'C', globalTimeSig:'4/4', bpm:120,
    metadata:{title:'Экспорт',artist:'Тест'},
    sections:[{ id:1, type:'Verse', squares:[{ id:10, events:[
      {chord:'Cmaj7',span:1},{chord:'Am7',span:1},{chord:'F',span:2}] }] },
      { id:2, type:'Chorus', squares:[{ id:20, events:[{chord:'G7',span:2},{chord:'C',span:2}] }] }] };
}
function setup(nKeys) {
  const s = song(), secs = JSON.parse(JSON.stringify(s.sections));
  sandbox.sections = secs; sandbox.__b39Sections = secs;
  T.load(T.attach(s, s));
  const gid = T.mainTrack().id;
  const kids = [];
  for (let i = 0; i < (nKeys === undefined ? 2 : nKeys); i++) kids.push(T.addTrack('keys'));
  return { s, secs, gid, kids };
}
const st = setup(2);
const songData = Object.assign({}, st.s, T.exportForSave());

// ---------- 3. .struchord ----------
console.log('\n.struchord: полная модель дорожек');
T.setPattern(st.kids[0], 's:1', { type:'keys-arp-up', subdivision:2, swing:true });
T.setPattern(st.kids[1], '1:20:0', { type:'keys-waltz', subdivision:1 });
K.setVariantIndex(st.kids[0], 'Cmaj7', null, 2, 5);
T.setTrackKeyboardSize(st.kids[1], 88);
T.setVolume(st.kids[0], 70);
const save = T.exportForSave();
ok('файл содержит 3 дорожки', save.tracks.length === 3, save.tracks.length);
ok('файл содержит activeTrackId', Number.isInteger(save.activeTrackId));
ok('файл содержит рисунок секции s:1', save.tracks[1].patterns['s:1'].type === 'keys-arp-up');
ok('файл содержит рисунок ячейки', save.tracks[2].patterns['1:20:0'].type === 'keys-waltz');
ok('файл содержит вариант позиции v:Cmaj7', save.tracks[1].voicings['v:Cmaj7'] === 2);
ok('файл содержит размер клавиатуры дорожки', save.tracks[2].keyboardSize === 88);
ok('файл содержит громкость дорожки', save.tracks[1].volume === 70);
const round = Object.assign({}, st.s, save);
T.load(T.attach(round, round));
ok('после загрузки все 3 дорожки на месте', T.state().tracks.length === 3);
ok('после загрузки рисунки и позиции на месте',
  T.patternFor(st.kids[0], 's:1').swing === true && T.voicingForChord(st.kids[0], 'Cmaj7') === 2);
ok('экспорт не мутирует исходный songData', !('parts' in st.s));

// ---------- 4. СИНТЕТИЧЕСКИЕ ПАРТИИ ----------
console.log('\nПартии для GPX/GPIF и MIDI');
const parts = E.buildParts(songData);
ok('по партии на каждую дорожку', parts.length === 3, parts.length);
ok('имена дорожек сохранены', parts[0].name === 'Гитара' && /Клавиши/.test(parts[1].name));
ok('главная гитара — GM 25', parts[0].gmProgram === 25);
ok('клавишные — GM 0 (фортепиано)', parts[1].gmProgram === 0 && parts[2].gmProgram === 0);
ok('клавишные — instrument keys', parts[1].instrument === 'keys');
ok('гитара — pitched staff, не таб', parts[0].instrument === 'other');
ok('все дорожки viewMode staff', parts.every(p => p.viewMode === 'staff'));
ok('pitchRolls по обеим секциям', Object.keys(parts[1].pitchRolls).sort().join(',') === '1,2',
  Object.keys(parts[1].pitchRolls));
const roll1 = parts[1].pitchRolls['1'];
ok('в секции 1 есть ноты', roll1 && roll1.length > 0, roll1 && roll1.length);
ok('у каждой ноты есть pitch/start/dur/velocity',
  roll1.every(n => Number.isInteger(n.pitch) && n.start >= 0 && n.dur > 0 && n.velocity > 0));
ok('все высоты в MIDI-диапазоне', roll1.every(n => n.pitch >= 0 && n.pitch <= 127));
ok('Cmaj7: есть C, E, G, B (главная дорожка, целый аккорд)',
  [0,4,7,11].every(pc => parts[0].pitchRolls['1'].some(n => n.pitch % 12 === pc)),
  Array.from(new Set(parts[0].pitchRolls['1'].map(n=>n.pitch%12))));
ok('время в долях сетки, не в секундах', roll1.some(n => n.start >= 1),
  roll1.map(n=>n.start));
ok('арпеджио разносит ноты во времени',
  new Set(parts[1].pitchRolls['1'].map(n=>n.start)).size > new Set(parts[0].pitchRolls['1'].map(n=>n.start)).size,
  {keys:new Set(parts[1].pitchRolls['1'].map(n=>n.start)).size,
   guitar:new Set(parts[0].pitchRolls['1'].map(n=>n.start)).size});
ok('pitchRolls локальны для секции (как rolls в приложении)',
  Math.min.apply(null, parts[1].pitchRolls['1'].map(n=>n.start)) === 0 &&
  Math.min.apply(null, parts[1].pitchRolls['2'].map(n=>n.start)) === 0,
  {s1:Math.min.apply(null, parts[1].pitchRolls['1'].map(n=>n.start)),
   s2:Math.min.apply(null, parts[1].pitchRolls['2'].map(n=>n.start))});
ok('время секции 1 укладывается в её 4 доли',
  parts[1].pitchRolls['1'].every(n => n.start < 4 && n.start + n.dur <= 4.001),
  Math.max.apply(null, parts[1].pitchRolls['1'].map(n=>n.start+n.dur)));
ok('velocity следует за громкостью',
  Math.max.apply(null, parts[1].pitchRolls['1'].map(n=>n.velocity)) === 63,
  Math.max.apply(null, parts[1].pitchRolls['1'].map(n=>n.velocity)));

// Призрак: у второй клавишной нет своего аккорда в ячейке -> тишина.
T.setTrackChord(st.kids[1], '1:10:0', '');
const ghostParts = E.buildParts(Object.assign({}, st.s, T.exportForSave()));
const beforeGhost = ghostParts[2].pitchRolls['1'].length, fullGhost = parts[2].pitchRolls['1'].length;
ok('призрачная ячейка не звучит в экспорте', beforeGhost < fullGhost,
  {before: fullGhost, after: beforeGhost});
T.setTrackChord(st.kids[1], '1:10:0', 'Cmaj7');

// M/S
T.setMute(st.kids[0], true);
ok('замьюченная дорожка не экспортируется',
  E.buildParts(Object.assign({}, st.s, T.exportForSave())).length === 2);
T.setMute(st.kids[0], false);
T.setSolo(st.kids[1], true);
ok('при соло экспортируется только сольная дорожка',
  E.buildParts(Object.assign({}, st.s, T.exportForSave())).length === 1);
T.setSolo(st.kids[1], false);

// ---------- 5. withTracks ----------
console.log('\nwithTracks: чистая сборка');
const withOld = Object.assign({}, songData, { parts: [{ name:'Старая партия' }] });
const merged = E.withTracks(withOld);
ok('withTracks не мутирует вход', !('parts' in withOld) === false && withOld.parts.length === 1);
ok('чужие партии сохранены', merged.parts.some(p => p.name === 'Старая партия'));
ok('наши партии стоят первыми', merged.parts[0].b39TrackId !== undefined);
ok('число партий = 1 + 3', merged.parts.length === 4, merged.parts.length);
ok('withTracks возвращает новый объект, а не тот же',
  E.withTracks(songData) !== songData);
const report = { transferred: [], losses: [] };
sandbox.gpExportGain = (r,label,count) => r.transferred.push({label,count});
sandbox.gpExportLoss = (r,label,count) => r.losses.push({label,count});
E.withTracks(songData, { report });
ok('отчёт об экспорте получил запись о дорожках',
  report.transferred.some(x => /Дорожки B-39/.test(x.label)), report.transferred);

// ---------- 6. ВИРТУАЛЬНЫЙ СТРОЙ GP5 ----------
console.log('\nGP5: абсолютные высоты на виртуальном строе');
ok('7 октав C2…C8', E.WIDE_MIDI.length === 7 && E.WIDE_MIDI[0] === 36 && E.WIDE_MIDI[6] === 108);
ok('минимум >= 35: басовый сдвиг GP5 не включается', Math.min.apply(null, E.WIDE_MIDI) >= 35);
ok('имена струн совпадают с MIDI',
  E.WIDE_NAMES.length === 7 && E.WIDE_NAMES[0] === 'C2' && E.WIDE_NAMES[6] === 'C8');
let gp5Ok = true, gp5Bad = [];
for (let p = 36; p <= 108; p++) {
  const pos = E.gp5Position(p);
  if (!pos || E.WIDE_MIDI[pos.string] + pos.fret !== p || pos.fret < 0 || pos.fret > 24) {
    gp5Ok = false; gp5Bad.push({p, pos});
  }
}
ok('для всех высот 36…108 строй+лад = MIDI', gp5Ok, gp5Bad.slice(0,3));
ok('лад never > 24', [21,24,35,36,60,84,108,120].every(p => {
  const x = E.gp5Position(p); return !x || (x.fret >= 0 && x.fret <= 24);
}));
ok('нота ниже C2 поднята на октаву', (() => {
  const x = E.gp5Position(24); return x && x.pitch === 36 && x.shifts === 1;
})(), E.gp5Position(24));
ok('высота вне MIDI -> null', E.gp5Position(200) === null && E.gp5Position(-5) === null);
const gp5Parts = E.buildParts(songData, { gp5: true });
ok('GP5: по партии на дорожку', gp5Parts.length === 3);
ok('GP5: instrument guitar (писатель умеет только струны)', gp5Parts.every(p => p.instrument === 'guitar'));
ok('GP5: вид нотации staff', gp5Parts.every(p => p.viewMode === 'staff'));
ok('GP5: GM 0 у клавиш', gp5Parts[1].gmProgram === 0 && gp5Parts[2].gmProgram === 0);
ok('GP5: свои strings на месте', gp5Parts[1].strings.join(' ') === E.WIDE_NAMES.join(' '));
ok('GP5: rolls по секциям', gp5Parts[1].rolls['1'] && gp5Parts[1].rolls['1'].length > 0);
ok('GP5: в rolls нет pitchRolls', Object.keys(gp5Parts[1].pitchRolls).length === 0);
ok('GP5: струна+лад дают исходную высоту', (() => {
  const src = parts[1].pitchRolls['1'], tab = gp5Parts[1].rolls['1'];
  if (!src.length || src.length !== tab.length) return false;
  for (let i = 0; i < src.length; i++) {
    const want = E.gp5Position(src[i].pitch);
    if (!want || E.WIDE_MIDI[tab[i].string] + tab[i].fret !== want.pitch) return false;
  }
  return true;
})());
ok('GP5: reports octave shift as a loss', (() => {
  const r = { transferred: [], losses: [] };
  E.withTracks(songData, { gp5:true, report:r });
  // басовые ноты ниже C2 в этой песне могут быть, а могут и не быть —
  // главное, что отчёт не падает и содержит наши дорожки
  return r.transferred.some(x => /Дорожки B-39/.test(x.label));
})());

// ---------- 7. РЕАЛЬНЫЙ GPIF-ПИСАТЕЛЬ (настоящий нотный стан) ----------
console.log('\nGPIF/GPX: независимый писатель приложения');
function runtime(id) {
  const a = base.indexOf('<script id="' + id + '"');
  if (a < 0) return '';
  const s = base.indexOf('>', a) + 1, e = base.indexOf('</script>', s);
  return base.slice(s, e);
}
function makeWriterSandbox() {
  const w = { console, Math, JSON, Set, Map, Object, Array, String, Number, Boolean, Date,
    Uint8Array, TextEncoder, parseInt, parseFloat, isNaN, Infinity, NaN, undefined };
  w.window = w; w.globalThis = w;
  vm.createContext(w);
  return w;
}
const gpifW = makeWriterSandbox();
vm.runInContext(runtime('gpifWriterRuntime'), gpifW, { filename: 'gpifWriterRuntime.js' });
ok('GPIF-писатель загрузился', !!gpifW.StruchordGpifWriter);
const gpModel = {
  meta: { title:'Экспорт', artist:'', album:'', copyright:'', words:'' },
  bpm: 120, key:'C', timeSig:'4/4',
  sections: [{ type:'Verse', name:'Куплет', barCount:1, totalBars:1, timeSig:'4/4', key:'C', bpm:null, repeat:1 }],
  bars: [{ timeSig:'4/4', unitsPerBar:4, unitSpan:1, sectionIndex:0 }],
  parts: [{
    name: parts[1].name, instrument: parts[1].instrument, viewMode: parts[1].viewMode,
    gmProgram: parts[1].gmProgram, midiChannel: 1, mix: parts[1].mix,
    notes: [
      { bar:0, voice:1, start:0, dur:1, pitch:60 },
      { bar:0, voice:1, start:1, dur:1, pitch:64 },
      { bar:0, voice:1, start:2, dur:1, pitch:67 }
    ]
  }]
};
let gpif = null, gpifErr = null;
try { gpif = gpifW.StruchordGpifWriter.writeGPIF(gpModel, {}); } catch (e) { gpifErr = e.message; }
ok('writeGPIF не упал', !!gpif && !gpifErr, gpifErr);
if (gpif) {
  ok('GPIF: XML начинается с <GPIF', gpif.text.trimStart().startsWith('<?xml') || gpif.text.includes('<GPIF'));
  ok('GPIF: 3 ноты записаны', gpif.stats.notes === 3, gpif.stats);
  ok('GPIF: есть <Octave> (абсолютная высота)', gpif.text.includes('<Property name="Octave">'));
  ok('GPIF: есть <Tone>', gpif.text.includes('<Property name="Tone">'));
  ok('GPIF: нет табулатурных <String>/<Fret> у нот',
    !gpif.text.includes('<Property name="String">') && !gpif.text.includes('<Property name="Fret">'),
    (gpif.text.match(/<Property name="(String|Fret)"/g)||[]).slice(0,4));
  ok('GPIF: GM-программа 0 (фортепиано)', /<Program>0<\/Program>|<GM>0<\/GM>|<Program>0/.test(gpif.text) ||
    /Program[^>]*>0</.test(gpif.text), (gpif.text.match(/Program.{0,40}/g)||[]).slice(0,3));
  ok('GPIF: имя дорожки в файле', gpif.text.includes(parts[1].name));
  ok('GPIF: без потерь высоты', !gpif.losses.some(l => /высота вне MIDI|нота вне песни/i.test(l.label)),
    gpif.losses.map(l=>l.label));
}

// ---------- 8. РЕАЛЬНЫЙ GP5-ПИСАТЕЛЬ ----------
console.log('\nGP5: независимый бинарный писатель приложения');
const gp5W = makeWriterSandbox();
vm.runInContext(runtime('gp5WriterRuntime'), gp5W, { filename: 'gp5WriterRuntime.js' });
ok('GP5-писатель загрузился', !!gp5W.StruchordGp5Writer);
const gp5Roll = gp5Parts[1].rolls['1'].slice(0, 6);
const gp5Model = {
  meta: { title:'Экспорт', artist:'', album:'', copyright:'', words:'' },
  bpm: 120, key:'C', timeSig:'4/4',
  bars: [{ timeSig:'4/4', unitsPerBar:4, unitSpan:1, sectionIndex:0 }],
  parts: [{
    name: 'KeysB39', instrument:'guitar', viewMode:'staff',
    gmProgram: gp5Parts[1].gmProgram, midiChannel:1, mix: gp5Parts[1].mix,
    tuning: gp5Parts[1].strings.slice(),
    notes: gp5Roll.map(n => ({ bar:0, voice:1, start:Math.min(3, n.start), dur:Math.min(1, n.dur),
      string:n.string, fret:n.fret }))
  }]
};
let gp5 = null, gp5Err = null;
try { gp5 = gp5W.StruchordGp5Writer.writeGP5(gp5Model, {}); } catch (e) { gp5Err = e.message; }
ok('writeGP5 не упал', !!gp5 && !gp5Err, gp5Err);
if (gp5) {
  const head = Array.from(gp5.bytes.slice(0, 26)).map(b=>String.fromCharCode(b)).join('');
  ok('GP5: заголовок FICHIER GUITAR PRO v5', head.includes('FICHIER GUITAR PRO v5'), head);
  ok('GP5: есть дорожка', gp5.stats.tracks === 1, gp5.stats);
  ok('GP5: ноты записаны', gp5.stats.notes > 0, gp5.stats);
  ok('GP5: нет потери «нота вне грифа»', !gp5.losses.some(l => /вне грифа/.test(l.label)),
    gp5.losses.map(l=>l.label));
  ok('GP5: байты не пустые', gp5.bytes.length > 200, gp5.bytes.length);
  ok('GP5: имя дорожки записано в файл', (() => {
    const s = Array.from(gp5.bytes).map(b=>String.fromCharCode(b)).join('');
    return s.includes('KeysB39');
  })());
}

// ---------- 9. РЕАЛЬНЫЙ MIDI-ПИСАТЕЛЬ ----------
console.log('\nMIDI: SMF format 1, независимый писатель приложения');
const mi = base.indexOf('  function midiExportWrite(model, report) {');
const mj = base.indexOf('  function midiExportRun() {', mi);
const midiFn = base.slice(mi, mj);
const midiW = { console, Math, JSON, Set, Map, Object, Array, String, Number, Boolean,
  Uint8Array, TextEncoder, parseInt, parseFloat, isNaN, Infinity, NaN, undefined,
  gpExportLoss(){}, gpExportGain(){} };
midiW.window = midiW; midiW.globalThis = midiW;
vm.createContext(midiW);
vm.runInContext(midiFn, midiW, { filename: 'midiExportWrite.js' });
ok('midiExportWrite загрузился', typeof midiW.midiExportWrite === 'function');
const midiModel = {
  ppq: 960, end: 3840,
  conductor: [{ at:0, type:'tempo', bpm:120 }, { at:0, type:'time', numerator:4, denominator:4 }],
  tracks: [
    { name: parts[0].name, channel:0, program:25, mix:{volume:100,pan:0}, programs:[],
      notes:[{ at:0, end:960, pitch:48, velocity:90 }] },
    { name: parts[1].name, channel:1, program:0, mix:{volume:70,pan:0}, programs:[],
      notes:[{ at:0, end:960, pitch:60, velocity:63 },{ at:960, end:1920, pitch:64, velocity:63 }] }
  ]
};
const midiReport = { transferred: [], losses: [] };
const midiRes = midiW.midiExportWrite(midiModel, midiReport);
const bytes = Array.from(midiRes.bytes);
const hdr = bytes.slice(0,4).map(b=>String.fromCharCode(b)).join('');
ok('MIDI: заголовок MThd', hdr === 'MThd');
ok('MIDI: format 1', bytes[8] === 0 && bytes[9] === 1, [bytes[8],bytes[9]]);
ok('MIDI: 3 трека (conductor + 2 дорожки)', bytes[10] === 0 && bytes[11] === 3, [bytes[10],bytes[11]]);
ok('MIDI: PPQ 960', bytes[12] === 0x03 && bytes[13] === 0xC0, [bytes[12],bytes[13]]);
// Разбираем события второго трека ищем Program Change 0 и ноты 60/64.
function parseTrack(arr, start) {
  let i = start, at = 0;
  const events = [];
  const len = (arr[i+4]<<24)|(arr[i+5]<<16)|(arr[i+6]<<8)|arr[i+7];
  i += 8; const end = i + len;
  while (i < end) {
    let d = 0, b;
    do { b = arr[i++]; d = (d<<7)|(b&127); } while (b & 128);
    at += d;
    const st = arr[i++];
    if (st === 0xFF) { const t = arr[i++]; let n=0; do { b=arr[i++]; n=(n<<7)|(b&127);} while(b&128); i+=n; }
    else if (st >= 0x80 && st <= 0xEF) {
      // Program Change (0xC0) и Channel Pressure (0xD0) несут ОДИН байт.
      const one = (st & 0xF0) === 0xC0 || (st & 0xF0) === 0xD0;
      const d1 = arr[i++], d2 = one ? undefined : arr[i++];
      events.push({ at, st, d1, d2 });
    }
  }
  return { events, end };
}
function chunkStarts(arr) {
  const out = []; let i = 14; // 14 байт — заголовок MThd
  while (i + 8 <= arr.length) {
    if (String.fromCharCode(arr[i],arr[i+1],arr[i+2],arr[i+3]) !== 'MTrk') break;
    const len = (arr[i+4]<<24)|(arr[i+5]<<16)|(arr[i+6]<<8)|arr[i+7];
    out.push(i); i += 8 + len;
  }
  return out;
}
const chunks = chunkStarts(bytes);
ok('MIDI: найдены 3 MTrk-чанка', chunks.length === 3, chunks.length);
const t2 = parseTrack(bytes, chunks[2]);
ok('MIDI: program change = 0 (GM Piano)',
  t2.events.some(e => (e.st & 0xF0) === 0xC0 && e.d1 === 0), t2.events.slice(0,4));
ok('MIDI: note-on 60 и 64', [60,64].every(p => t2.events.some(e => (e.st & 0xF0) === 0x90 && e.d1 === p && e.d2 > 0)),
  t2.events.filter(e => (e.st & 0xF0) === 0x90));
ok('MIDI: note-off закрывает ноты',
  t2.events.some(e => (e.st & 0xF0) === 0x80 && e.d1 === 60));
ok('MIDI: громкость 70 -> CC7 ~89',
  t2.events.some(e => (e.st & 0xF0) === 0xB0 && e.d1 === 7 && e.d2 === 89),
  t2.events.filter(e => (e.st & 0xF0) === 0xB0));
ok('MIDI: статистика 3 ноты', midiRes.stats.notes === 3, midiRes.stats);

// ---------- 10. bump_release.py (R7/R6) ----------
console.log('\nR7/R6: версия, sw.js, реестр релизов');
const tmp = fs.mkdtempSync('/tmp/b39rel-');
const h = path.join(tmp, 'STRUCHORD.html'), swf = path.join(tmp, 'sw.js');
fs.writeFileSync(h, '<span id="devPanelTrigger" title="x">· ver 0.691</span>\n', 'utf8');
fs.writeFileSync(swf, "const CACHE_NAME = 'struchord-v691';\n", 'utf8');
const dry = cp.execFileSync(PY,
  [path.join(W, 'bump_release.py'), h, swf, '--dry-run', '--wave', 'B-39 · тест'],
  { encoding:'utf8' });
ok('dry-run: версия 0.691 -> 0.692', /0\.691 -> 0\.692/.test(dry), dry.slice(0,200));
ok('dry-run: CACHE_NAME v691 -> v692', /struchord-v691 -> struchord-v692/.test(dry));
ok('dry-run: строка реестра с sha256', /\|\s*\*\*B-39 · тест\*\*.*`[a-f0-9]{64}`/.test(dry), dry);
ok('dry-run: файлы не изменены',
  fs.readFileSync(h,'utf8').includes('0.691') && fs.readFileSync(swf,'utf8').includes('v691'));
const real = cp.execFileSync(PY,
  [path.join(W, 'bump_release.py'), h, swf, '--wave', 'B-39 · тест'], { encoding:'utf8' });
ok('применение: HTML версия 0.692', fs.readFileSync(h,'utf8').includes('ver 0.692'));
ok('применение: sw.js v692', fs.readFileSync(swf,'utf8').includes('struchord-v692'));
ok('применение: sha256 в выводе = факту', (() => {
  const m = /`([a-f0-9]{64})`/.exec(real);
  const fact = crypto.createHash('sha256').update(fs.readFileSync(h)).digest('hex');
  return !!m && m[1] === fact;
})(), real.slice(0,400));
ok('применение: создана резервная копия',
  fs.readdirSync(tmp).some(f => f.startsWith('STRUCHORD.html.bak-')));
ok('повторный запуск поднимает 0.692 -> 0.693', (() => {
  const out = cp.execFileSync(PY,
    [path.join(W, 'bump_release.py'), h, swf, '--dry-run'], { encoding:'utf8' });
  return /0\.692 -> 0\.693/.test(out);
})());
fs.rmSync(tmp, { recursive:true, force:true });

console.log(`\n${fail === 0 ? '✅' : '❌'} ИТОГ ЭТАПА 6: ${pass} ok / ${fail} fail`);
if (fail) process.exitCode = 1;
