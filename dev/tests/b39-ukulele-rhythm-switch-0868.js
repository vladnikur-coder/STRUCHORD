'use strict';
// 0.868 · B-39 Укулеле: смена инструмента дорожки гитара → укулеле.
// Чистый Node + vm (без зависимостей): бой переносится как есть,
// перебор заменяется ближайшим 4-струнным пресетом, рисунки песни не меняются,
// обратная смена возвращает исходный гитарный ритм.

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

function sliceBetween(startMarker, endMarker, label) {
  const i0 = HTML.indexOf(startMarker);
  assert(i0 >= 0, `start marker not found (${label})`);
  const i1 = HTML.indexOf(endMarker, i0 + startMarker.length);
  assert(i1 > i0, `end marker not found (${label})`);
  return HTML.slice(i0, i1);
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

// =====================================================================
// 1. Статические инварианты 0.871
// =====================================================================
{
  assert(HTML.includes('ver 0.871'), 'STRUCHORD.html header is ver 0.871');
  assert(SW.includes("const CACHE_NAME = 'struchord-v871';"), 'sw.js CACHE_NAME is struchord-v871');
  assert(README.includes('`0.871`'), 'README header is 0.871');
  assert(ROADMAP.includes('**0.871**'), 'ROADMAP header is 0.871');
  assert(HTML.includes('function b39MigrateRhythmForUke(raw)'), 'rhythm migrator exists');
  assert(HTML.includes('function b39UkePickPresetFor(raw)'), 'nearest ukulele pick preset resolver exists');
  assert(
    HTML.includes("var migratedPatterns = (prevInst === 'guitar' && inst === 'ukulele')"),
    'setInstrument migrates guitar rhythms to ukulele'
  );
  assert(
    HTML.includes('migrateRhythmForUke: b39MigrateRhythmForUke, migrateSongRhythmsToUke: b39MigrateSongRhythmsToUke,'),
    'migrator is exposed on StruChordTracks'
  );
  ok('Статические инварианты 0.871: версия, SW, перенос ритма в setInstrument и API');
}

// =====================================================================
// 2–5. Реальное поведение StruChordTracks
// =====================================================================
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
      style: {}, dataset: {}, classList: makeMockClassList(),
      setAttribute: () => {}, appendChild: () => {}, addEventListener: () => {},
    }),
  };
  const sb = {
    console, Math, Number, String, Array, Object, Set, Map, RegExp, JSON, Date,
    Error, TypeError, Uint8Array, Float32Array, setTimeout: () => 0, clearTimeout: () => {},
    document: mockDoc,
    localStorage: { getItem: () => null, setItem: () => {} },
    sections: [], globalKey: 'C', globalTimeSig: '4/4', keyMode: 'manual',
    userFingerings: new Map(), preferredFingerings: new Map(),
    tunerTuningId: 'e-std', tunerCustomNotes: null, songRhythmRolls: null,
    LABEL_RU: { Verse: 'Куплет', Chorus: 'Припев' },
  };
  sb.window = sb;
  sb.globalThis = sb;
  sb.self = sb;
  vm.createContext(sb);
  return { sb, docElClassList };
}

function bootTracks() {
  const { sb } = createSandbox();
  sb.songStore = { dispatch: (l, fn) => fn(), subscribe: () => () => {} };
  vm.runInContext(
    extractFn('noteToFrequency') + '\n' +
    tuningCode + '\n' +
    extractConst('STRUM_PRESETS', '\n];') + '\n' +
    tracksSlice,
    sb
  );
  const T = sb.StruChordTracks;
  assert(T, 'StruChordTracks initialized');
  return { sb, T };
}

const STRUM = { mode: 'strum', subdivision: 2, steps: ['D', null, 'D', 'U', null, 'U', 'D', 'U'] };
const PICK_SIX = { mode: 'pick', subdivision: 2, steps: [[6], [3], [2], [1], [2], [3]] };
const PICK_EIGHT = { mode: 'pick', subdivision: 2, steps: [[6], [3], [2], [3], [1], [3], [2], [3]] };
const PICK_CHORDS = { mode: 'pick', subdivision: 2, steps: [[6], [1, 2, 3], [1, 2, 3], [4], [1, 2, 3], [1, 2, 3]] };

function makeSong(sectionPattern, cellPattern) {
  return [{
    id: 1,
    type: 'Verse',
    timeSig: '4/4',
    strumPattern: JSON.parse(JSON.stringify(sectionPattern)),
    squares: [{
      id: 10,
      events: [
        { chord: 'C', span: 2, ...(cellPattern ? { strumPattern: JSON.parse(JSON.stringify(cellPattern)) } : {}) },
        { chord: 'Am', span: 2 },
      ],
    }],
  }];
}

// ---------------------------------------------------------------------
// 2. Бой сохраняется как есть
// ---------------------------------------------------------------------
{
  const { sb, T } = bootTracks();
  sb.sections = makeSong(STRUM, null);
  T.resetForNewSong();
  assert.strictEqual(T.state().tracks[0].instrument, 'guitar', 'main track starts as guitar');

  assert.strictEqual(T.setInstrument(1, 'ukulele'), true, 'main guitar track becomes ukulele');
  assert.strictEqual(T.state().tracks[0].instrument, 'ukulele', 'track instrument is ukulele');

  const section = T.patternFor(1, 's:1');
  assert(section, 'ukulele got a section rhythm');
  assert.strictEqual(section.mode, 'strum', 'strum stays a strum');
  assert.deepStrictEqual(H(section.steps), STRUM.steps, 'strum steps are copied verbatim');
  assert.strictEqual(section.subdivision, 2, 'strum subdivision is preserved');

  // Рисунок песни (гитарный домен) не тронут.
  assert.deepStrictEqual(H(sb.sections[0].strumPattern.steps), STRUM.steps, 'song strum pattern untouched');
  ok('Гитара → укулеле: бой сохраняется в track.patterns, песенный рисунок не меняется');
}

// ---------------------------------------------------------------------
// 3. Перебор меняется на похожий 4-струнный
// ---------------------------------------------------------------------
{
  const { sb, T } = bootTracks();
  sb.sections = makeSong(PICK_SIX, PICK_SIX);
  T.resetForNewSong();
  T.setInstrument(1, 'ukulele');

  const section = T.patternFor(1, 's:1');
  assert(section, 'ukulele got a section rhythm');
  assert.strictEqual(section.mode, 'pick', 'pick stays a pick');
  assert.deepStrictEqual(H(section.steps), [[4], [3], [2], [1], [2], [3]], 'guitar «Шестёрка» → uke «Шестёрка»');
  const cell = T.patternFor(1, '1:10:0');
  assert(cell, 'cell rhythm migrated too');
  assert.deepStrictEqual(H(cell.steps), [[4], [3], [2], [1], [2], [3]], 'cell pick migrated');
  for (const step of section.steps) {
    const items = Array.isArray(step) ? step : [];
    items.forEach((n) => assert(Number.isInteger(n) && n >= 1 && n <= 4, `string ${n} is 1..4`));
  }
  assert.deepStrictEqual(H(sb.sections[0].strumPattern.steps), PICK_SIX.steps, 'song pick pattern untouched');

  // Восьмёрка → Восьмёрка, «романс» с щипками аккорда → «Бас-щипок».
  const b = bootTracks();
  b.sb.sections = makeSong(PICK_EIGHT, null);
  b.T.resetForNewSong();
  b.T.setInstrument(1, 'ukulele');
  assert.deepStrictEqual(H(b.T.patternFor(1, 's:1').steps), [[4], [3], [2], [3], [1], [3], [2], [3]], 'guitar «Восьмёрка» → uke «Восьмёрка»');

  const c = bootTracks();
  c.sb.sections = makeSong(PICK_CHORDS, null);
  c.T.resetForNewSong();
  c.T.setInstrument(1, 'ukulele');
  assert.deepStrictEqual(H(c.T.patternFor(1, 's:1').steps), [[4], [1, 2, 3], [3], [1, 2, 3]], 'guitar «Романс» → uke «Бас-щипок»');
  ok('Перебор: «Шестёрка»→4-3-2-1-2-3, «Восьмёрка»→8 шагов, «Романс»→«Бас-щипок», струны только 1..4');
}

// ---------------------------------------------------------------------
// 4. Обратная смена: гитарный ритм песни возвращается, укулельный уходит
// ---------------------------------------------------------------------
{
  const { sb, T } = bootTracks();
  sb.sections = makeSong(STRUM, PICK_SIX);
  T.resetForNewSong();
  T.setInstrument(1, 'ukulele');
  assert(T.patternFor(1, 's:1'), 'ukulele has migrated rhythm');
  assert.strictEqual(T.setInstrument(1, 'guitar'), true, 'back to guitar');
  assert.strictEqual(T.patternFor(1, 's:1'), null, 'ukulele rhythm cleared on switch back');
  assert.strictEqual(T.patternFor(1, '1:10:0'), null, 'ukulele cell rhythm cleared on switch back');
  assert.deepStrictEqual(H(sb.sections[0].strumPattern.steps), STRUM.steps, 'song strum still intact');
  assert.deepStrictEqual(H(sb.sections[0].squares[0].events[0].strumPattern.steps), PICK_SIX.steps, 'song cell pick still intact');
  ok('Обратная смена: укулельные копии убираются, исходный гитарный ритм песни остаётся');
}

// ---------------------------------------------------------------------
// 5. Пустая/битая настройка не ломает смену инструмента
// ---------------------------------------------------------------------
{
  const { sb, T } = bootTracks();
  sb.sections = [{
    id: 1, type: 'Verse', timeSig: '4/4',
    strumPattern: { mode: 'strum', subdivision: 9, steps: ['D'] }, // битый subdivision
    squares: [{ id: 10, events: [{ chord: 'C', span: 4, strumPattern: null }] }],
  }];
  T.resetForNewSong();
  assert.strictEqual(T.setInstrument(1, 'ukulele'), true, 'switch survives broken pattern');
  assert.strictEqual(T.patternFor(1, 's:1'), null, 'broken pattern is dropped, not guessed');
  assert.strictEqual(T.state().tracks[0].instrument, 'ukulele', 'track is ukulele');

  const empty = bootTracks();
  empty.sb.sections = makeSong(null, null);
  empty.sb.sections[0].strumPattern = null;
  empty.T.resetForNewSong();
  assert.strictEqual(empty.T.setInstrument(1, 'ukulele'), true, 'switch with no rhythm at all');
  assert.deepStrictEqual(H(empty.T.state().tracks[0].patterns || {}), {}, 'no phantom rhythms appear');
  ok('Битый или пустой ритм не мешает смене инструмента и не рождает фантомных рисунков');
}

console.log(`\nB-39 Ukulele rhythm switch 0.868 (проверки версии 0.871): ${passed} groups passed, 0 failed.`);
