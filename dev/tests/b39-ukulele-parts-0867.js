'use strict';
// 0.867 · B-39 Укулеле (Этап 2 «Партии»): приёмочный тест на реальном коде STRUCHORD.html.
// Чистый Node + vm (без внешних зависимостей): 4-струнный домен «Партий»,
// четыре фиксированных строя, потолок лада 15, запрет своего строя,
// нотация/гриф/звук и 4-струнный GPIF-экспорт с GM 24.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(ROOT, 'STRUCHORD.html'), 'utf8');
const SW = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const README = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const ROADMAP = fs.readFileSync(path.join(ROOT, 'ROADMAP.md'), 'utf8');

const H = (x) => JSON.parse(JSON.stringify(x));

let passed = 0;
function ok(msg) {
  passed++;
  console.log('  ok  ' + msg);
}

function extractFn(name) {
  const marker = '\nfunction ' + name + '(';
  const i0 = HTML.indexOf(marker);
  assert(i0 >= 0, `function ${name} not found`);
  const i1 = HTML.indexOf('\n}\n', i0);
  assert(i1 > i0, `end of function ${name} not found`);
  return HTML.slice(i0 + 1, i1 + 2);
}

function extractConst(name, endMarker) {
  const marker = `const ${name} = `;
  const i0 = HTML.indexOf(marker);
  assert(i0 >= 0, `const ${name} not found`);
  const i1 = HTML.indexOf(endMarker, i0 + marker.length);
  assert(i1 > i0, `end of const ${name} not found`);
  return HTML.slice(i0, i1 + endMarker.length);
}

function extractInertScript(id) {
  const tag = `<script id="${id}" type="text/plain">`;
  const i0 = HTML.indexOf(tag);
  assert(i0 >= 0, `inert script not found: ${id}`);
  const i1 = HTML.indexOf('</script>', i0 + tag.length);
  assert(i1 > i0, `closing </script> not found for: ${id}`);
  return HTML.slice(i0 + tag.length, i1);
}

const NOTE_RE = /^([A-G])([#b]?)(-?\d)$/;
const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function midiOf(note) {
  const m = NOTE_RE.exec(String(note));
  assert(m, `bad note ${note}`);
  let semi = SEMI[m[1]];
  if (m[2] === '#') semi++;
  if (m[2] === 'b') semi--;
  return (Number(m[3]) + 1) * 12 + semi;
}

function makeSandbox() {
  const docEl = {
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  };
  const mockDoc = {
    documentElement: docEl,
    body: { appendChild() {}, classList: docEl.classList },
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({
      style: {}, dataset: {}, classList: docEl.classList,
      setAttribute() {}, appendChild() {}, addEventListener() {}, append() {},
    }),
  };
  const sb = {
    console, Math, Number, String, Array, Object, Set, Map, RegExp, JSON, Date,
    Error, TypeError, Uint8Array, Int8Array, Int16Array, Int32Array, Uint16Array,
    Uint32Array, Float32Array, ArrayBuffer, DataView, TextEncoder, TextDecoder,
    parseInt, parseFloat, isNaN, isFinite,
    document: mockDoc,
    localStorage: { getItem: () => null, setItem() {} },
    setTimeout: () => 0,
    clearTimeout() {},
    requestAnimationFrame: () => 0,
    performance: { now: () => 0 },
    sections: [],
    globalKey: 'C',
    globalTimeSig: '4/4',
    keyMode: 'manual',
    // ── окружение «Партий» ────────────────────────────────────────────────
    PART_MAX_FRET: 24,
    PART_STRING_LIMIT: 12,
    PART_NOTE_NAMES: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
    PART_NOTE_MIN_OCTAVE: 0,
    PART_NOTE_MAX_OCTAVE: 7,
    PART_DRUM_LANES: [{ id: 'kick' }, { id: 'snare' }, { id: 'hat' }, { id: 'tom' }, { id: 'cymbal' }, { id: 'percussion' }, { id: 'fx' }],
    TUNER_TUNINGS: [
      { id: 'e-std', group: 'Стандартные', name: 'E Standard', notes: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
      { id: 'drop-d', group: 'Стандартные', name: 'Drop D', notes: ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
    ],
    songTuningNotes: () => ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'],
    bassOctaveDown: (note) => note,
    tunerNoteToMidi: (note) => (NOTE_RE.test(String(note)) ? midiOf(note) : null),
    noteToFrequency: () => 440,
    showToast() {},
    partsInputEnabled: () => true,
  };
  sb.window = sb;
  sb.globalThis = sb;
  sb.self = sb;
  vm.createContext(sb);
  return sb;
}

function loadPartModel(sb) {
  const code = [
    extractConst('PART_INSTRUMENTS', '\n};'),
    extractFn('partNoteChoices'),
    extractFn('partCustomStrings'),
    extractConst('PART_BASS_TUNINGS', '\n];'),
    extractConst('PART_UKULELE_TUNINGS', '\n];'),
    extractConst('PART_UKULELE_DEFAULT_TUNING', ';'),
    extractConst('PART_UKULELE_MAX_FRET', ';'),
    extractFn('partTuningTable'),
    extractFn('partFretLimit'),
    extractFn('partSongDefaultNotes'),
    extractFn('partUsesPitchNotes'),
    extractFn('partInstrumentId'),
    extractFn('partDefaultNotationView'),
    extractFn('partNotationViewMode'),
    extractFn('partNotationFlags'),
    extractFn('partPitchPositions'),
    extractFn('partInstrument'),
    extractFn('partStringCount'),
    extractFn('partBaseStringCount'),
    extractFn('partTuningNotes'),
    extractFn('partTuningName'),
    extractFn('partUnplayableNotes'),
    extractFn('partStringsMatchPreset'),
  ].join('\n');
  vm.runInContext(code, sb);
  // const-объявления vm не попадают в объект песочницы — забираем явно.
  Object.assign(sb, vm.runInContext(
    '({ PART_INSTRUMENTS, PART_UKULELE_TUNINGS, PART_UKULELE_DEFAULT_TUNING, PART_UKULELE_MAX_FRET })', sb
  ));
}

// =====================================================================
// 1. Статические инварианты 0.867 и точки интеграции
// =====================================================================
{
  assert(HTML.includes('ver 0.874'), 'STRUCHORD.html header is ver 0.874');
  assert(SW.includes("const CACHE_NAME = 'struchord-v874';"), 'sw.js CACHE_NAME is struchord-v874');
  assert(README.includes('`0.874`'), 'README header is 0.874');
  assert(ROADMAP.includes('**0.874**'), 'ROADMAP header is 0.874');

  const table = extractConst('PART_UKULELE_TUNINGS', '\n];');
  ['uke-high-g', 'uke-low-g', 'uke-baritone', 'uke-canadian'].forEach((id) => {
    assert(table.includes(`'${id}'`), `ukulele tuning preset ${id}`);
  });
  assert(HTML.includes('const PART_UKULELE_MAX_FRET = 15;'), 'ukulele fret cap is 15');
  assert(HTML.includes('<option value="ukulele">Укулеле</option>'), 'parts instrument select offers ukulele');
  assert(
    !HTML.includes("const table = inst === 'bass' ? PART_BASS_TUNINGS : TUNER_TUNINGS;"),
    'no guitar/bass-only tuning table switch remains'
  );
  assert(HTML.includes('if (inst === \'ukulele\') return PART_UKULELE_TUNINGS[0].notes.slice();'),
    'ukulele falls back to its own default tuning, not E Standard');
  assert(HTML.includes("if (part && part.instrument === 'ukulele') return null;"),
    'ukulele rejects custom strings');
  assert(HTML.includes("const rawStrings = inst === 'ukulele' ? null : partStringsSanitize(rawPart.strings);"),
    'sanitizer drops custom strings for ukulele parts');
  assert(HTML.includes('inst === \'ukulele\' ? PART_UKULELE_MAX_FRET : SONG_LIMITS.MAX_PART_FRET'),
    'sanitizer caps ukulele part frets at 15');
  assert(HTML.includes('inst === \'ukulele\' ? 24 : 0'), 'MIDI export uses GM 24 for ukulele parts');
  assert(
    (HTML.match(/instrument === 'ukulele' \? 24 : null/g) || []).length === 2,
    'GP5 and GPX/GPIF export default to GM 24 for ukulele parts'
  );
  ok('Статические инварианты 0.867: версия, SW, таблица строёв, UI, санитайзер и GM 24');
}

// =====================================================================
// 2. Четыре строя и опознание инструмента
// =====================================================================
{
  const sb = makeSandbox();
  loadPartModel(sb);

  assert.strictEqual(sb.partInstrumentId({ instrument: 'ukulele' }), 'ukulele');
  assert.strictEqual(sb.partInstrumentId({ instrument: 'banjo' }), 'guitar');
  assert.strictEqual(sb.PART_INSTRUMENTS.ukulele.strings, 4);

  const uke = { instrument: 'ukulele' };
  assert.strictEqual(sb.partStringCount(uke), 4);
  assert.strictEqual(sb.partBaseStringCount(uke), 4);
  assert.deepStrictEqual(H(sb.partTuningNotes(uke)), ['G4', 'C4', 'E4', 'A4']);
  assert.deepStrictEqual(H(sb.partTuningNotes({ instrument: 'ukulele', tuning: 'uke-low-g' })), ['G3', 'C4', 'E4', 'A4']);
  assert.deepStrictEqual(H(sb.partTuningNotes({ instrument: 'ukulele', tuning: 'uke-baritone' })), ['D3', 'G3', 'B3', 'E4']);
  assert.deepStrictEqual(H(sb.partTuningNotes({ instrument: 'ukulele', tuning: 'uke-canadian' })), ['A4', 'D4', 'F#4', 'B4']);
  // Неизвестный строй не превращается в гитарный E Standard.
  assert.deepStrictEqual(H(sb.partTuningNotes({ instrument: 'ukulele', tuning: 'drop-d' })), ['G4', 'C4', 'E4', 'A4']);
  assert.deepStrictEqual(H(sb.partSongDefaultNotes('ukulele')), ['G4', 'C4', 'E4', 'A4']);

  assert.strictEqual(sb.partTuningName(uke), 'High G (стандартный)');
  assert.strictEqual(sb.partTuningName({ instrument: 'ukulele', tuning: 'uke-canadian' }), 'Укулеле: Canadian (A D F# B)');
  assert.strictEqual(sb.partTuningTable('ukulele').length, 4);
  assert.strictEqual(sb.partTuningTable('bass')[0].id, 'bass-std');
  assert(sb.partTuningTable('guitar').some((t) => t.id === 'e-std'), 'guitar keeps the song tuning table');

  ok('4 строя укулеле: High G по умолчанию, Low G, Баритон, Canadian и имена в UI');
}

// =====================================================================
// 3. Таб-домен, нотация, гриф 0..15 и неиграбельные ноты
// =====================================================================
{
  const sb = makeSandbox();
  loadPartModel(sb);
  const uke = { instrument: 'ukulele' };

  assert.strictEqual(sb.partUsesPitchNotes(uke), false);
  assert.strictEqual(sb.partUsesPitchNotes({ instrument: 'keys' }), true);
  assert.strictEqual(sb.partDefaultNotationView(uke), 'tab');
  assert.deepStrictEqual(H(sb.partNotationFlags(uke)), { staff: true, tab: true, slash: false });

  assert.strictEqual(sb.partFretLimit(uke), 15);
  assert.strictEqual(sb.partFretLimit({ instrument: 'guitar' }), 24);

  // Лад 15 — можно, 16 — нельзя; струна 4 существует, струна 5 — нет.
  assert.deepStrictEqual(
    H(sb.partUnplayableNotes({ instrument: 'ukulele', rolls: { 1: [{ start: 0, dur: 1, string: 3, fret: 15 }] } }, 'ukulele', 'uke-high-g', null)),
    []
  );
  const tooHigh = sb.partUnplayableNotes(
    { instrument: 'ukulele', rolls: { 1: [{ start: 0, dur: 1, string: 0, fret: 16 }] } }, 'ukulele', 'uke-high-g', null
  );
  assert.strictEqual(tooHigh.length, 1, 'fret 16 is unplayable on ukulele');
  const fifthString = sb.partUnplayableNotes(
    { instrument: 'ukulele', rolls: { 1: [{ start: 0, dur: 1, string: 4, fret: 0 }] } }, 'ukulele', 'uke-high-g', null
  );
  assert.strictEqual(fifthString.length, 1, '5th string does not exist on ukulele');

  // Позиции на грифе считаются по строю и не выходят за 15 ладов.
  const positions = H(sb.partPitchPositions({ instrument: 'ukulele', tuning: 'uke-high-g' }, midiOf('C4')));
  assert(positions.length >= 1, 'C4 is reachable on ukulele');
  positions.forEach((p) => assert(p.fret >= 0 && p.fret <= 15, `fret ${p.fret} within 0..15`));
  assert(positions.some((p) => p.line === 1 && p.fret === 0), 'C4 is the open C string (line 1)');

  ok('Таб-домен: нотация ТАБ, гриф 0..15, 4 струны и проверка неиграбельных нот');
}

// =====================================================================
// 4. Только четыре пресета: свой строй отклоняется
// =====================================================================
{
  const sb = makeSandbox();
  loadPartModel(sb);

  assert.strictEqual(sb.partCustomStrings({ instrument: 'ukulele', strings: ['G4', 'C4', 'E4', 'A4'] }), null);
  assert.deepStrictEqual(H(sb.partCustomStrings({ strings: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'] })),
    ['E2', 'A2', 'D3', 'G3', 'B3', 'E4']);

  assert.deepStrictEqual(
    H(sb.partStringsMatchPreset({ instrument: 'ukulele' }, ['A4', 'D4', 'F#4', 'B4'])),
    { tuning: 'uke-canadian', strings: null }
  );
  const custom = sb.partStringsMatchPreset({ instrument: 'ukulele' }, ['E3', 'A3', 'D4', 'G4']);
  assert.strictEqual(custom.unsupported, true, 'arbitrary ukulele tuning is rejected');
  assert.strictEqual(custom.strings, null);
  const guitarCustom = sb.partStringsMatchPreset({ instrument: 'guitar' }, ['E2', 'A2', 'D3', 'G3', 'B3', 'E4']);
  assert.strictEqual(guitarCustom.unsupported, undefined, 'guitar still supports custom strings');
  assert.strictEqual(HTML.includes("showToast('Для укулеле доступны четыре готовых строя');"), true);

  ok('Свой строй укулеле отклоняется, четыре готовых строя принимаются');
}

// =====================================================================
// 5. Экспорт: 4-струнный GPIF с GM 24
// =====================================================================
{
  const sb = makeSandbox();
  loadPartModel(sb);
  const bari = H(sb.partTuningNotes({ instrument: 'ukulele', tuning: 'uke-baritone' }));
  assert.deepStrictEqual(H(bari), ['D3', 'G3', 'B3', 'E4']);

  const gpifCode = extractInertScript('gpifWriterRuntime');
  vm.runInContext(gpifCode, sb);
  assert(sb.StruchordGpifWriter && typeof sb.StruchordGpifWriter.writeGPIF === 'function', 'gpif writer loaded');

  const model = {
    meta: { title: 'Ukulele parts' },
    bpm: 96,
    key: 'C',
    bars: [{ timeSig: '4/4' }],
    parts: [{
      name: 'Укулеле',
      instrument: 'ukulele',
      gmProgram: 24,
      viewMode: 'tab',
      tuning: bari,
      notes: [
        { bar: 0, start: 0, dur: 1, string: 1, fret: 1, midi: 60 },
        { bar: 0, start: 0, dur: 1, string: 2, fret: 0, midi: 59 },
        { bar: 0, start: 0, dur: 1, string: 3, fret: 0, midi: 55 },
        { bar: 0, start: 0, dur: 1, string: 4, fret: 2, midi: 52 },
      ],
    }],
  };
  const res = sb.StruchordGpifWriter.writeGPIF(model);
  const xml = typeof res === 'string' ? res : res.text;
  assert(typeof xml === 'string' && xml.includes('<GPIF>'), 'GPIF XML built');
  assert(xml.includes('<Pitches>50 55 59 64</Pitches>'), 'GPIF writes Baritone ukulele <Pitches>50 55 59 64</Pitches>');
  assert(xml.includes('<Instrument ref="ukulele" />'), 'GPIF writes <Instrument ref="ukulele" />');
  assert(xml.includes('<Program>24</Program>'), 'GPIF writes GM 24 (Nylon Guitar)');

  ok('4-струнный GPIF-экспорт: баритон 50 55 59 64, ref="ukulele", GM 24');
}

console.log(`\nB-39 Ukulele Parts 0.867 acceptance: ${passed} groups passed, 0 failed.`);
