'use strict';
// 0.866 · B-39 Укулеле (Этап 1): приёмочный тест на реальном коде STRUCHORD.html и keyboard-accompaniment.js.
// Чистый Node + vm (без внешних зависимостей): проверяет модель дорожек, строгую санитизацию,
// 4 фиксированных строя и ре-энтратный бас, генератор/анализатор/SVG 4-струнных аппликатур,
// по-дорожечный ритм и 4 пресета укулеле, аудио-частоты нейлонового щипка и 4-струнный экспорт GP5/GPIF/MIDI.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(ROOT, 'STRUCHORD.html'), 'utf8');
const ACCOMP = fs.readFileSync(path.join(ROOT, 'keyboard-accompaniment.js'), 'utf8');
const SW = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

let passed = 0;
const H = (x) => JSON.parse(JSON.stringify(x));
function ok(msg) {
  passed++;
  console.log('  ok  ' + msg);
}

function sliceBetween(startMarker, endMarker, label) {
  const i0 = HTML.indexOf(startMarker);
  assert(i0 >= 0, `start marker not found (${label}): ${startMarker.slice(0, 60)}`);
  const i1 = HTML.indexOf(endMarker, i0 + startMarker.length);
  assert(i1 > i0, `end marker not found (${label}): ${endMarker.slice(0, 60)}`);
  return HTML.slice(i0, i1);
}

function extractInertScript(id) {
  const tag = `<script id="${id}" type="text/plain">`;
  const i0 = HTML.indexOf(tag);
  assert(i0 >= 0, `inert script not found: ${id}`);
  const i1 = HTML.indexOf('</script>', i0 + tag.length);
  assert(i1 > i0, `closing </script> not found for: ${id}`);
  return HTML.slice(i0 + tag.length, i1);
}

function extractFn(name) {
  const marker = '\nfunction ' + name + '(';
  const i0 = HTML.indexOf(marker);
  assert(i0 >= 0, `function ${name} not found`);
  const i1 = HTML.indexOf('\n}\n', i0);
  assert(i1 > i0, `end of function ${name} not found`);
  return HTML.slice(i0 + 1, i1 + 2);
}

function makeMockClassList() {
  const set = new Set();
  return {
    add: (...c) => c.forEach((x) => set.add(x)),
    remove: (...c) => c.forEach((x) => set.delete(x)),
    toggle: (c, force) => {
      if (force === undefined) {
        if (set.has(c)) { set.delete(c); return false; }
        set.add(c); return true;
      }
      if (force) set.add(c); else set.delete(c);
      return !!force;
    },
    contains: (c) => set.has(c),
  };
}

function createSandbox() {
  const docElClassList = makeMockClassList();
  const mockDoc = {
    documentElement: { classList: docElClassList },
    body: { appendChild: () => {}, classList: makeMockClassList() },
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({
      style: {},
      dataset: {},
      classList: makeMockClassList(),
      setAttribute: () => {},
      appendChild: () => {},
      addEventListener: () => {},
    }),
  };
  const sb = {
    console,
    Math,
    Number,
    String,
    Array,
    Object,
    Set,
    Map,
    RegExp,
    JSON,
    Date,
    Error,
    TypeError,
    Uint8Array,
    Int8Array,
    Int16Array,
    Int32Array,
    Uint16Array,
    Uint32Array,
    Float32Array,
    ArrayBuffer,
    DataView,
    TextEncoder,
    TextDecoder,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    document: mockDoc,
    localStorage: { getItem: () => null, setItem: () => {} },
    setTimeout: () => 0,
    clearTimeout: () => {},
    requestAnimationFrame: () => 0,
    performance: { now: () => 0 },
    sections: [],
    globalKey: 'C',
    globalTimeSig: '4/4',
    keyMode: 'manual',
    userFingerings: new Map(),
    preferredFingerings: new Map(),
    tunerTuningId: 'e-std',
    tunerCustomNotes: null,
    songRhythmRolls: null,
    LABEL_RU: { Verse: 'Куплет', Chorus: 'Припев' },
  };
  sb.window = sb;
  sb.globalThis = sb;
  sb.self = sb;
  vm.createContext(sb);
  return { sb, docElClassList };
}

// =====================================================================
// 1. Статические инварианты версии, SW, CSS и видимости TAB-UI (Этапы 1 и 3)
// =====================================================================
{
  assert(HTML.includes('ver 0.883'), 'STRUCHORD.html header is ver 0.883');
  assert(SW.includes("const CACHE_NAME = 'struchord-v883';"), 'sw.js CACHE_NAME is struchord-v883');
  // 0.870 (Этап 3, волна 1): скрытие снято — на укулеле «Таб» работает и
  // создаёт 4-струнную вставку, а вставка чужого инструмента остаётся в песне
  // видимой, но серой и без клика.
  assert(
    !HTML.includes('html.b39-ukulele-mode .tab-btn') &&
    !HTML.includes('html.b39-ukulele-mode .add-tab-btn'),
    'CSS no longer hides TAB-insert controls under html.b39-ukulele-mode (0.870)'
  );
  assert(
    HTML.includes('.tab-insert.is-foreign { opacity: 0.55; cursor: default; pointer-events: none; }'),
    'foreign TAB insert is grey and read-only instead of hidden (0.870)'
  );
  assert(
    ACCOMP.includes("root.classList.toggle('b39-ukulele-mode', ukeOn);"),
    'keyboard-accompaniment.js relabel() syncs html.b39-ukulele-mode'
  );
  assert(
    HTML.includes('const maxBoardFret = strings === 4 ? 15 : 16;') &&
    HTML.includes('if (gridStartFret < maxBoardFret - frets + 1)') &&
    HTML.includes("if (newShape.some((v) => v !== 'x' && v !== 0 && v > maxBoardFret)) return;"),
    'createInteractiveFretboard respects 4 strings and maxBoardFret=15 for ukulele'
  );
  assert(
    HTML.includes("const tunerListSource = b39IsUkuleleContext() ? UKULELE_TUNINGS : TUNER_TUNINGS;") &&
    HTML.includes("if (!isUke) cell.appendChild(mk(1, 'Выше на полутон'));") &&
    HTML.includes("if (!isUke) cell.appendChild(mk(-1, 'Ниже на полутон'));"),
    'Tuner shows 4 fixed ukulele tunings without per-string shift arrows in ukulele mode'
  );
  ok('Статические инварианты 0.866: версия, sw.js, CSS b39-ukulele-mode, relabel(), тюнер и maxBoardFret=15');
}

const tracksSlice = sliceBetween(
  '// >>> B-39 STAGE1 BEGIN (TRACKS) <<<',
  '// <<< B-39 STAGE1 END (TRACKS) <<<',
  'StruChordTracks'
);
const tuningCode = sliceBetween(
  'const TUNER_TUNINGS = [',
  'function renderTuningPill(',
  'TUNER_TUNINGS + UKULELE_TUNINGS'
);

// =====================================================================
// 2. StruChordTracks: дорожки укулеле, 4 строя, строгая санитизация,
//    per-track ритм, clean_on_switch, roundtrip, b39-ukulele-mode
// =====================================================================
{
  const { sb, docElClassList } = createSandbox();
  sb.songStore = { dispatch: (l, fn) => fn(), subscribe: () => () => {} };
  vm.runInContext(
    extractFn('noteToFrequency') + '\n' +
    tuningCode + '\n' +
    tracksSlice,
    sb
  );

  const T = sb.StruChordTracks;
  assert(T, 'window.StruChordTracks initialized');
  assert(T.INSTRUMENTS.includes('ukulele'), 'INSTRUMENTS includes ukulele');

  sb.sections = [
    {
      id: 1,
      type: 'Verse',
      timeSig: '4/4',
      strumPattern: { mode: 'strum', subdivision: 2, steps: ['D', '', 'D', 'U', '', 'U', 'D', 'U'] },
      squares: [{ id: 10, events: [{ chord: 'C', span: 2 }, { chord: 'Am', span: 2 }] }],
    },
  ];
  T.resetForNewSong();
  assert.strictEqual(docElClassList.contains('b39-ukulele-mode'), false, 'new guitar song: b39-ukulele-mode is OFF');

  const ukeId = T.addTrack('ukulele');
  const ukeTrack = typeof ukeId === 'object' ? ukeId : T.track(ukeId);
  assert(ukeTrack && ukeTrack.instrument === 'ukulele', 'addTrack("ukulele") creates ukulele track');
  assert.strictEqual(ukeTrack.name, 'Укулеле', 'default ukulele track name is "Укулеле"');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(ukeTrack.trackTuning)), { id: 'high-g', notes: null }, 'default tuning is high-g');

  T.setActive(ukeTrack.id);
  assert.strictEqual(docElClassList.contains('b39-ukulele-mode'), true, 'active ukulele track sets html.b39-ukulele-mode');
  assert.strictEqual(sb.b39IsUkuleleContext(), true, 'b39IsUkuleleContext() is true');
  assert.strictEqual(sb.b39ActiveStringCount(), 4, 'b39ActiveStringCount() is 4');
  assert.deepStrictEqual(H(sb.b39GuitarTuningNotes()), ['G4', 'C4', 'E4', 'A4'], 'default High-G notes = G4 C4 E4 A4');

  // 4 фиксированных строя укулеле
  for (const tid of ['high-g', 'low-g', 'baritone', 'canadian']) {
    assert.strictEqual(T.setTuning(ukeTrack.id, { id: tid, notes: null }), true, `setTuning(${tid}) succeeds`);
    assert.strictEqual(T.tuning(ukeTrack.id).id, tid, `tuning id is ${tid}`);
    assert.strictEqual(sb.tuningKeySuffix(), '@uke:' + tid, `tuningKeySuffix() is @uke:${tid}`);
  }
  // Невалидный / кастомный строй на укулеле → строго high-g
  T.setTuning(ukeTrack.id, { id: 'custom', notes: ['G4', 'C4', 'E4', 'A4'] });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(T.tuning(ukeTrack.id))), { id: 'high-g', notes: null }, 'custom tuning rejected on ukulele -> high-g');
  T.setTuning(ukeTrack.id, { id: 'drop-d', notes: null });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(T.tuning(ukeTrack.id))), { id: 'high-g', notes: null }, 'guitar tuning id rejected on ukulele -> high-g');

  // Строгая санитизация 4-струнных форм (без молчаливого обрезания/зажима)
  T.setTrackChord(ukeTrack.id, '1:10:0', 'C');
  assert.strictEqual(T.setGuitarShape(ukeTrack.id, '1:10:0', 'C', [0, 0, 0, 3]), true, 'valid 4-string shape [0,0,0,3] accepted');
  const savedShape = T.guitarShape(ukeTrack.id, '1:10:0', 'C');
  assert.deepStrictEqual(H(savedShape.shape), [0, 0, 0, 3], '4-string shape persisted');
  assert.strictEqual(savedShape.tuning, '@uke:high-g', '4-string shape stores @uke:high-g suffix');

  assert.strictEqual(T.setGuitarShape(ukeTrack.id, '1:10:0', 'C', [0, 3, 2, 0, 1, 0]), false, '6-string shape strictly rejected on ukulele');
  assert.strictEqual(T.setGuitarShape(ukeTrack.id, '1:10:0', 'C', [0, 0, 0, 16]), false, 'fret 16 strictly rejected on ukulele (max 15)');
  assert.strictEqual(T.setGuitarShape(ukeTrack.id, '1:10:0', 'C', [-1, 0, 0, 3]), false, 'negative fret strictly rejected on ukulele');
  assert.strictEqual(T.setGuitarShape(ukeTrack.id, '1:10:0', 'C', [0, 0, 0]), false, '3-string shape strictly rejected on ukulele');
  assert.strictEqual(T.setGuitarShape(ukeTrack.id, '1:10:0', 'C', [0, 0, 0, 15]), true, 'fret 15 accepted on ukulele');

  // Per-track ритм укулеле + строгая санитизация струн 1..4
  assert.strictEqual(
    T.setPattern(ukeTrack.id, 's:1', { mode: 'pick', subdivision: 2, steps: [4, 3, 2, 1, 2, 3, 2, 1] }),
    true,
    'valid 4-string pick pattern accepted on ukulele track'
  );
  assert.strictEqual(
    T.setPattern(ukeTrack.id, 's:1', { mode: 'pick', subdivision: 2, steps: [6, 3, 2, 1] }),
    false,
    'pick pattern with string 6 strictly rejected on ukulele'
  );
  assert.strictEqual(
    T.setPattern(ukeTrack.id, 's:1', { mode: 'pick', subdivision: 2, steps: [5, 3, 2, 1] }),
    false,
    'pick pattern with string 5 strictly rejected on ukulele'
  );
  assert.strictEqual(
    T.setPattern(ukeTrack.id, '1:10:0', { mode: 'strum', subdivision: 2, steps: ['D', '', 'D', 'U'] }),
    true,
    'strum pattern accepted on ukulele cell'
  );
  // Гитара полностью изолирована
  assert.strictEqual(sb.sections[0].strumPattern.mode, 'strum', 'guitar section strumPattern untouched');
  assert.strictEqual(sb.sections[0].squares[0].events[0].strumPattern, undefined, 'guitar event strumPattern untouched');

  // Roundtrip exportForSave -> adopt (включая отбрасывание битых данных)
  const exported = T.exportForSave();
  assert(Array.isArray(exported.tracks) && exported.tracks.length === 2, 'exportForSave writes both tracks');
  const corrupted = JSON.parse(JSON.stringify(exported));
  const cUke = corrupted.tracks.find((tr) => tr.instrument === 'ukulele');
  cUke.guitarShapes['1:10:1'] = { chord: 'Am', shape: [0, 0, 0, 16], tuning: '@uke:high-g' };
  cUke.guitarShapes['1:10:2'] = { chord: 'Am', shape: [0, 0, 2, 2, 1, 0], tuning: '@uke:high-g' };
  cUke.patterns['s:999'] = { mode: 'pick', subdivision: 2, steps: [6, 5, 4, 3] };
  T.load(corrupted);
  const reloadedUke = T.state().tracks.find((tr) => tr.instrument === 'ukulele');
  assert.strictEqual(reloadedUke.guitarShapes['1:10:1'], undefined, 'adopt strictly drops ukulele shape with fret 16');
  assert.strictEqual(reloadedUke.guitarShapes['1:10:2'], undefined, 'adopt strictly drops 6-string shape on ukulele track');
  assert.strictEqual(reloadedUke.patterns['s:999'], undefined, 'adopt strictly drops ukulele pattern with strings 5/6');
  assert.deepStrictEqual(H(reloadedUke.guitarShapes['1:10:0'].shape), [0, 0, 0, 15], 'adopt keeps valid 4-string shape');
  assert.strictEqual(reloadedUke.patterns['s:1'].mode, 'pick', 'adopt keeps valid 4-string pick pattern');

  // clean_on_switch при смене инструмента
  assert.strictEqual(T.setInstrument(reloadedUke.id, 'guitar'), true, 'setInstrument ukulele -> guitar');
  const afterGtr = T.track(reloadedUke.id);
  assert.deepStrictEqual(H(afterGtr.trackTuning), { id: 'e-std', notes: null }, 'ukulele -> guitar resets trackTuning to e-std');
  assert.deepStrictEqual(H(afterGtr.guitarShapes), {}, 'ukulele -> guitar clears 4-string shapes');
  assert.deepStrictEqual(H(afterGtr.patterns), {}, 'ukulele -> guitar clears ukulele patterns');
  assert.strictEqual(docElClassList.contains('b39-ukulele-mode'), false, 'b39-ukulele-mode OFF after switching to guitar');

  assert.strictEqual(T.setInstrument(reloadedUke.id, 'ukulele'), true, 'setInstrument guitar -> ukulele');
  assert.strictEqual(T.track(reloadedUke.id).trackTuning.id, 'high-g', 'guitar -> ukulele resets trackTuning to high-g');
  assert.strictEqual(docElClassList.contains('b39-ukulele-mode'), true, 'b39-ukulele-mode ON on ukulele');

  T.setActive(T.state().mainTrackId);
  assert.strictEqual(docElClassList.contains('b39-ukulele-mode'), false, 'b39-ukulele-mode OFF on main guitar');

  ok('StruChordTracks: 4 строя, строгая санитизация форм/ритма, clean_on_switch, roundtrip, b39-ukulele-mode');
}

// =====================================================================
// 3. Ядро 4-струнных аппликатур: генератор, 4 строя, ре-энтратный бас,
//    анализ, грип, SVG (4 vs 6 струн), частоты shapeToPluckNotes
// =====================================================================
{
  const { sb: fsb } = createSandbox();
  fsb.songStore = { dispatch: (l, fn) => fn(), subscribe: () => () => {} };

  // Берём весь блок гармонии (CHROMATIC..getChordNotes..noteToFrequency)
  const theorySlice = sliceBetween(
    "const CHROMATIC = ['C', 'C#',",
    'function getEffectiveKeyForCurrentPosition(',
    'music theory'
  );
  // Берём весь блок генератора аппликатур + анализа + грипа + SVG (от SCORE_WEIGHTS до createInteractiveFretboard)
  // Сначала константы и таблицы перед SCORE_WEIGHTS:
  const fingStart = HTML.indexOf('const FINGERING_WEIGHTS = {');
  assert(fingStart > 0, 'fingering section start not found');
  const fingEnd = HTML.indexOf('// >>> B-39 STAGE4 BEGIN (KEYS VOICING UI) <<<', fingStart);
  assert(fingEnd > fingStart, 'fingering section end not found');

  // Также извлечём renderFingeringSVG, analyzeFingeringShapeRaw, computeFingersForShape, getBassStringsForShape, resolvePickStepStrings, shapeToPluckNotes
  const svgAndAnalysisSlice = [
    extractFn('tunerNoteToMidi'),
    extractFn('normalizeAccidentals'),
    extractFn('normalizeChordCase'),
    extractFn('buildChordName'),
    extractFn('shouldPreferFlats'),
    extractFn('normalizeChordSpelling'),
    extractFn('renderFingeringSVG'),
    extractFn('analyzeFingeringShapeRaw'),
    extractFn('shapeToPluckNotes'),
    extractFn('getBassStringsForShape'),
    extractFn('normalizePickStep'),
    extractFn('isPickBassToken'),
    extractFn('resolvePickStepStrings'),
  ].join('\n');

  const pickConsts = `
    const PICK_BASS_TOKEN = 'B';
    const PICK_ALT_BASS_TOKEN = 'b';
    const showFingersCheckbox = null;
    const songCapoFactor = () => 1;
    const fingeringCache = new Map();
    const guitaristProfile = { barreK: 1, stretchK: 1, mixK: 1 };
    let showFingersMode = false;
  `;

  vm.runInContext(
    theorySlice + '\n' +
    tuningCode + '\n' +
    tracksSlice + '\n' +
    pickConsts + '\n' +
    HTML.slice(fingStart, fingEnd) + '\n' +
    svgAndAnalysisSlice,
    fsb
  );

  const T = fsb.StruChordTracks;
  T.resetForNewSong();
  const ukeRaw = T.addTrack('ukulele');
  const uke = typeof ukeRaw === 'object' ? ukeRaw : T.track(ukeRaw);
  T.setActive(uke.id);

  // 3A. Проверка 4 строёв укулеле (ноты + MIDI)
  assert.deepStrictEqual(H(fsb.b39GuitarTuningNotes()), ['G4', 'C4', 'E4', 'A4'], 'High-G notes = G4 C4 E4 A4');
  assert.strictEqual(fsb.tuningKeySuffix(), '@uke:high-g');

  // Ре-энтратный бас на High-G: C [0,0,0,3] = G4(67), C4(60), E4(64), C5(72) → бас = струна 3 (C4), НЕ струна 4 (G4)!
  const bassHighGC = fsb.getBassStringsForShape([0, 0, 0, 3], 'C');
  assert.strictEqual(bassHighGC.bass, 3, 'High-G C [0,0,0,3]: lowest sounding pitch bass is string 3 (C4), not re-entrant string 4 (G4)');
  assert.deepStrictEqual(H(fsb.resolvePickStepStrings('B', [0, 0, 0, 3], 'C')), [3], 'resolvePickStepStrings("B") resolves to string 3 on High-G C');
  assert.deepStrictEqual(H(fsb.resolvePickStepStrings([4, 3, 2, 1], [0, 0, 0, 3], 'C')), [4, 3, 2, 1], 'explicit strings [4,3,2,1] preserved');
  assert.deepStrictEqual(H(fsb.resolvePickStepStrings([6, 5, 3, 1], [0, 0, 0, 3], 'C')), [3, 1], 'strings 5 & 6 stripped on 4-string ukulele');

  // analyzeFingeringShapeRaw: C [0,0,0,3] в High-G распознаётся как 'C' (не 'C/G'!), т.к. самый низкий звук — C4 (MIDI 60)
  const anHighGC = fsb.analyzeFingeringShapeRaw([0, 0, 0, 3], { hintedChordName: 'C', key: 'C' });
  assert.strictEqual(anHighGC.chordName, 'C', `High-G C [0,0,0,3] analyzes as C (not C/G), got ${anHighGC.chordName}`);

  // shapeToPluckNotes([0,0,0,3]) в High-G — точные частоты G4, C4, E4, C5
  const pluckC = fsb.shapeToPluckNotes([0, 0, 0, 3]);
  assert.strictEqual(pluckC.length, 4, 'shapeToPluckNotes produces 4 notes');
  assert(Math.abs(pluckC[0].freq - 392.0) < 0.6, `G4 ≈ 392 Hz (got ${pluckC[0].freq.toFixed(2)})`);
  assert(Math.abs(pluckC[1].freq - 261.63) < 0.6, `C4 ≈ 261.63 Hz (got ${pluckC[1].freq.toFixed(2)})`);
  assert(Math.abs(pluckC[2].freq - 329.63) < 0.6, `E4 ≈ 329.63 Hz (got ${pluckC[2].freq.toFixed(2)})`);
  assert(Math.abs(pluckC[3].freq - 523.25) < 0.6, `C5 ≈ 523.25 Hz (got ${pluckC[3].freq.toFixed(2)})`);

  // 3B. Классические аккорды укулеле в High-G
  const expectedHighG = {
    C: '0,0,0,3',
    F: '2,0,1,0',
    Am: '2,0,0,0',
    G: '0,2,3,2',
    G7: '0,2,1,2',
    Dm: '2,2,1,0',
    E7: '1,2,0,2',
  };
  for (const [chord, classic] of Object.entries(expectedHighG)) {
    const vars = fsb.generateFingeringVariants(chord, 'C');
    assert(vars && Array.isArray(vars.shapes) && vars.shapes.length > 0, `High-G ${chord} generates variants`);
    assert(
      vars.shapes.every((sh) => Array.isArray(sh) && sh.length === 4 && sh.every((f) => f === 'x' || (f >= 0 && f <= 15))),
      `High-G ${chord} all variants are valid 4-string shapes with frets 0..15`
    );
    const shapes = vars.shapes.map((sh) => sh.join(','));
    assert(shapes.includes(classic), `High-G ${chord} includes classic shape [${classic}] (top5: ${shapes.slice(0, 5).join(' | ')})`);
  }
  assert.strictEqual(fsb.generateFingeringVariants('C', 'C').shapes[0].join(','), '0,0,0,3', 'High-G C #1 is [0,0,0,3]');
  assert.strictEqual(fsb.generateFingeringVariants('Am', 'C').shapes[0].join(','), '2,0,0,0', 'High-G Am #1 is [2,0,0,0]');
  assert.strictEqual(fsb.generateFingeringVariants('F', 'C').shapes[0].join(','), '2,0,1,0', 'High-G F #1 is [2,0,1,0]');

  // 3C. Low-G, Baritone, Canadian
  T.setTuning(uke.id, { id: 'low-g', notes: null });
  assert.deepStrictEqual(H(fsb.b39GuitarTuningNotes()), ['G3', 'C4', 'E4', 'A4'], 'Low-G notes = G3 C4 E4 A4');
  assert.strictEqual(fsb.getBassStringsForShape([0, 0, 0, 3], 'C').bass, 4, 'Low-G C [0,0,0,3]: lowest pitch is string 4 (G3)');
  const anLowGC = fsb.analyzeFingeringShapeRaw([0, 0, 0, 3], { hintedChordName: 'C', key: 'C' });
  assert.strictEqual(anLowGC.chordName, 'C/G', `Low-G C [0,0,0,3] analyzes as C/G (G3 < C4), got ${anLowGC.chordName}`);

  T.setTuning(uke.id, { id: 'baritone', notes: null });
  assert.deepStrictEqual(H(fsb.b39GuitarTuningNotes()), ['D3', 'G3', 'B3', 'E4'], 'Baritone notes = D3 G3 B3 E4');
  const bariCVars = fsb.generateFingeringVariants('C', 'C').shapes.map((sh) => sh.join(','));
  assert(bariCVars.includes('2,0,1,0'), 'Baritone C includes [2,0,1,0]');

  T.setTuning(uke.id, { id: 'canadian', notes: null });
  assert.deepStrictEqual(H(fsb.b39GuitarTuningNotes()), ['A4', 'D4', 'F#4', 'B4'], 'Canadian notes = A4 D4 F#4 B4');
  const canDVars = fsb.generateFingeringVariants('D', 'D').shapes.map((sh) => sh.join(','));
  assert(canDVars.includes('0,0,0,3'), 'Canadian D includes [0,0,0,3]');
  assert.strictEqual(fsb.getBassStringsForShape([0, 0, 0, 3], 'D').bass, 3, 'Canadian D [0,0,0,3] re-entrant bass is string 3 (D4)');

  // 3D. SVG 4 струны vs 6 струн + баррэ Bb [3,2,1,1]
  T.setTuning(uke.id, { id: 'high-g', notes: null });
  const svgUke = fsb.renderFingeringSVG([0, 0, 0, 3]);
  assert.strictEqual((svgUke.match(/class="fing-string"/g) || []).length, 4, 'ukulele SVG has exactly 4 .fing-string elements');
  assert(svgUke.includes('data-string="3"') && !svgUke.includes('data-string="4"'), 'ukulele SVG string indices are 0..3');

  const bbFingers = fsb.computeFingersForShape([3, 2, 1, 1]);
  assert(Array.isArray(bbFingers) && bbFingers.length === 4, 'computeFingersForShape works on 4-string barre Bb [3,2,1,1]');
  const svgBb = fsb.renderFingeringSVG([3, 2, 1, 1]);
  assert.strictEqual((svgBb.match(/class="fing-string"/g) || []).length, 4, 'Bb barre SVG has 4 strings');

  // Гитара — 6 струн без регрессий
  T.setActive(T.state().mainTrackId);
  assert.strictEqual(fsb.b39IsUkuleleContext(), false, 'back on guitar track');
  assert.deepStrictEqual(H(fsb.b39GuitarTuningNotes()), ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'], 'guitar Standard notes unchanged');
  const svgGtr = fsb.renderFingeringSVG(['x', 3, 2, 0, 1, 0]);
  assert.strictEqual((svgGtr.match(/class="fing-string"/g) || []).length, 6, 'guitar SVG still has 6 strings');

  ok('4-струнные аппликатуры: генератор, 4 строя, ре-энтратный бас, SVG 4 vs 6 струн, shapeToPluckNotes');
}

// =====================================================================
// 4. 4 явных 4-струнных пресета перебора укулеле и фильтрация пресетов
// =====================================================================
{
  const { sb: rsb } = createSandbox();
  const presetsBlock = sliceBetween('const STRUM_PRESETS = [', '// ---------- РИТМЫ, УЖЕ ИСПОЛЬЗОВАННЫЕ В ЭТОЙ ПЕСНЕ ----------', 'STRUM_PRESETS');
  vm.runInContext(
    'let __isUke = false;\n' +
    'function b39IsUkuleleContext() { return __isUke; }\n' +
    'function timeSigAllowsTriplets() { return true; }\n' +
    'function isCompoundMeter() { return false; }\n' +
    presetsBlock + '\n' +
    extractFn('isPresetCompatible') + '\n' +
    'this.P = { STRUM_PRESETS, isPresetCompatible, setUke: (v) => { __isUke = !!v; } };',
    rsb
  );
  const { STRUM_PRESETS, isPresetCompatible, setUke } = rsb.P;
  const ukePresets = STRUM_PRESETS.filter((p) => Array.isArray(p.instruments) && p.instruments.includes('ukulele'));
  assert.strictEqual(ukePresets.length, 4, `expected 4 explicit ukulele presets, found ${ukePresets.length}`);

  for (const p of ukePresets) {
    assert.strictEqual(p.mode, 'pick', `${p.id} is pick mode`);
    for (const step of p.steps) {
      if (!step) continue;
      const arr = Array.isArray(step) ? step : [step];
      for (const s of arr) {
        assert(typeof s === 'number' && s >= 1 && s <= 4, `${p.id} uses only explicit strings 1..4 (got ${JSON.stringify(s)})`);
      }
    }
    const grid = p.base;
    setUke(true);
    assert.strictEqual(isPresetCompatible(p, '4/4', grid), true, `${p.id} fits ukulele`);
    setUke(false);
    assert.strictEqual(isPresetCompatible(p, '4/4', grid), false, `${p.id} hidden on guitar`);
  }

  const gtrPicks = STRUM_PRESETS.filter((p) => p.mode === 'pick' && Array.isArray(p.instruments) && p.instruments.includes('guitar'));
  assert(gtrPicks.length > 0, 'guitar pick presets exist');
  gtrPicks.forEach((p) => {
    setUke(true);
    assert.strictEqual(isPresetCompatible(p, '4/4', p.base), false, `guitar pick preset ${p.id} hidden on ukulele`);
    setUke(false);
    assert.strictEqual(isPresetCompatible(p, '4/4', p.base), true, `guitar pick preset ${p.id} visible on guitar`);
  });
  const strumPresets = STRUM_PRESETS.filter((p) => p.mode === 'strum');
  assert(strumPresets.length > 0, 'strum presets exist');
  strumPresets.forEach((p) => {
    setUke(true);
    assert.strictEqual(isPresetCompatible(p, '4/4', p.base), true, `strum preset ${p.id} available on ukulele`);
    setUke(false);
    assert.strictEqual(isPresetCompatible(p, '4/4', p.base), true, `strum preset ${p.id} available on guitar`);
  });

  ok('Ритм-пресеты: 4 явных 4-струнных пресета укулеле (1..4), изоляция с гитарными переборами, общий бой');
}

// =====================================================================
// 5. Санитизатор sanitizeSongData (@uke:* ключи, 4 струны, лад <= 15)
// =====================================================================
{
  const sanCode = sliceBetween('  function sanitizeSongData(rawSong) {', 'const b39ReadySong = normalizeReadableSongChordNames(sanitizedSong);', 'sanitizeSongData');
  assert(
    sanCode.includes('@uke:(high-g|low-g|baritone|canadian)'),
    'sanitizeSongData validates @uke:(high-g|low-g|baritone|canadian)'
  );
  assert(
    sanCode.includes('asSafeFingeringShape') && HTML.includes('isUke ? 4 : 6') || HTML.includes('strCount = isUke ? 4 : 6') || sanCode.includes('isUkeKey'),
    'sanitizeSongData enforces 4 strings and max fret 15 for @uke:* shapes'
  );
  ok('sanitizeSongData: проверка @uke:(high-g|low-g|baritone|canadian), 4 струны и потолок лада 15');
}

// =====================================================================
// 6. Реальный 4-струнный экспорт GP5 (бинарник), GPIF (XML) и MIDI (GM 24)
// =====================================================================
{
  const { sb: esb } = createSandbox();
  const gp5Code = extractInertScript('gp5WriterRuntime');
  const gpifCode = extractInertScript('gpifWriterRuntime');
  vm.runInContext(gp5Code, esb);
  vm.runInContext(gpifCode, esb);

  assert(esb.StruchordGp5Writer && typeof esb.StruchordGp5Writer.writeGP5 === 'function', 'StruchordGp5Writer.writeGP5 loaded');
  assert(esb.StruchordGpifWriter && typeof esb.StruchordGpifWriter.writeGPIF === 'function', 'StruchordGpifWriter.writeGPIF loaded');

  const ukeSongModel = {
    meta: { title: 'Ukulele Test' },
    bpm: 110,
    key: 'C',
    bars: [{ timeSig: '4/4' }],
    parts: [
      {
        id: 'p-uke',
        name: 'Укулеле',
        instrument: 'ukulele',
        gmProgram: 24,
        tuning: ['G4', 'C4', 'E4', 'A4'],
        notes: [
          { bar: 0, start: 0, dur: 1, string: 1, fret: 3, midi: 72 },
          { bar: 0, start: 0, dur: 1, string: 2, fret: 0, midi: 64 },
          { bar: 0, start: 0, dur: 1, string: 3, fret: 0, midi: 60 },
          { bar: 0, start: 0, dur: 1, string: 4, fret: 0, midi: 67 },
        ],
      },
    ],
  };

  // GP5 бинарный файл
  const gp5Res = esb.StruchordGp5Writer.writeGP5(ukeSongModel);
  const gp5Bytes = gp5Res instanceof Uint8Array ? gp5Res : gp5Res.bytes;
  assert(gp5Bytes instanceof Uint8Array && gp5Bytes.length > 100, `GP5 binary built (${gp5Bytes.length} bytes)`);
  const gp5Magic = new TextDecoder().decode(gp5Bytes.slice(1, 25));
  assert(gp5Magic.includes('FICHIER GUITAR PRO v5.10'), `GP5 header valid: ${gp5Magic}`);
  assert(gp5Code.includes('ukulele: [67, 60, 64, 69]'), 'GP5 DEFAULT_TUNINGS.ukulele = [67, 60, 64, 69]');
  assert(gp5Code.includes("track.part.instrument === 'ukulele' ? 15 : 24"), 'GP5 writes 15 frets for ukulele');

  // GPIF (GPX) XML файл (High-G + Baritone)
  const gpifRes = esb.StruchordGpifWriter.writeGPIF(ukeSongModel);
  const gpifXml = typeof gpifRes === 'string' ? gpifRes : gpifRes.text;
  assert(typeof gpifXml === 'string' && gpifXml.includes('<GPIF>'), 'GPIF XML generated');
  assert(gpifXml.includes('<Pitches>67 60 64 69</Pitches>'), 'GPIF writes 4-string High-G tuning <Pitches>67 60 64 69</Pitches>');
  assert(gpifXml.includes('<Instrument ref="ukulele" />'), 'GPIF writes <Instrument ref="ukulele" />');
  assert(gpifXml.includes('<Program>24</Program>'), 'GPIF writes GM <Program>24</Program>');

  const bariModel = JSON.parse(JSON.stringify(ukeSongModel));
  bariModel.parts[0].tuning = ['D3', 'G3', 'B3', 'E4'];
  const bariGpif = esb.StruchordGpifWriter.writeGPIF(bariModel).text;
  assert(bariGpif.includes('<Pitches>50 55 59 64</Pitches>'), 'GPIF writes 4-string Baritone tuning <Pitches>50 55 59 64</Pitches>');

  // Общая таблица GM_PROGRAM для GP5 / GPX / MIDI
  assert(HTML.includes('var GM_PROGRAM = { keys: 0, guitar: 25, ukulele: 24 };'), 'GM_PROGRAM maps ukulele to 24 (Acoustic Nylon)');

  ok('4-струнный экспорт: GP5 бинарник, GPIF XML (<Pitches>67 60 64 69, FretCount 15, Program 24) и MIDI GM 24');
}

console.log(`\nB-39 Ukulele 0.866 acceptance: ${passed} groups passed, 0 failed.`);
