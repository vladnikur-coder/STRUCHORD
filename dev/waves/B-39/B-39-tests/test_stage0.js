/* Тесты этапа 0 (B-102) для STRUCHORD 0.691.
   Запуск: node test_stage0.js [оригинал.html] [пропатченный.html]
   Сравнивает getChordNotes ДО и ПОСЛЕ патча (регрессия гитары)
   и проверяет новую chordFormula на канонической полноте. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const W = __dirname;
// Использование:
//   node test_stage0.js [/путь/к/оригиналу.html] [/путь/к/пропатченному.html]
// Если второй путь не задан, пропатченная версия собирается в памяти из
// stage0_block.js — удобно проверить сам блок до применения патча.
const basePath = process.argv[2] || path.join(W, '..', 'uploads', 'STRUCHORD.html');
const patchedPath = process.argv[3] || null;
const base = fs.readFileSync(basePath, 'utf8');
const ANCHOR = 'function getChordNotes(cn, ks) {';
let patched;
if (patchedPath) {
  patched = fs.readFileSync(patchedPath, 'utf8');
  console.log('Проверяю применённый файл:', patchedPath);
} else {
  if (base.indexOf(ANCHOR) !== base.lastIndexOf(ANCHOR)) throw new Error('якорь getChordNotes не уникален');
  const block = fs.readFileSync(path.join(W, 'stage0_block.js'), 'utf8');
  patched = base.replace(ANCHOR, block + ANCHOR);
  console.log('Пропатченная версия собрана в памяти из stage0_block.js');
}

function between(src, a, b) {
  const i = src.indexOf(a);
  const j = src.indexOf(b, i + a.length);
  if (i < 0 || j < 0) throw new Error('не найден фрагмент: ' + a + ' -> ' + b);
  return src.slice(i, j);
}

function buildSandbox(html, withFormula) {
  const parts = [
    between(html, "const CHROMATIC = [", 'function noteToFrequency(note) {'),
    between(html, 'function expandChordName(chord) {', 'let needsRender = false,'),
    between(html, 'function normalizeAccidentals(name) {', 'function parseChordForKeyDetection(chordName) {'),
    between(html, 'function normalizeChordCase(ch) {', 'function toSharpNote(note) {'),
  ];
  if (withFormula) {
    parts.push(between(html, 'const FORMULA_SEMITONE_DEGREE', 'function getChordNotes(cn, ks) {'));
  }
  parts.push(between(html, 'function getChordNotes(cn, ks) {', 'function getKeyStyle(k) {'));
  parts.push(between(html, 'function getKeyStyle(k) {', 'function normalizeChordPart(p, ks) {'));
  const code = parts.join('\n') + `
    globalThis.__X = {
      getChordNotes,
      chordFormula: typeof chordFormula === 'function' ? chordFormula : null,
      chordFormulaNotes: typeof chordFormulaNotes === 'function' ? chordFormulaNotes : null,
      ns: (typeof window !== 'undefined' && window.StruChordFormula) || null
    };`;
  const sandbox = { window: {}, console, Math, Set, Object, String, Number, Array, parseInt, isNaN };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'struchord-chord-core.js' });
  return sandbox.__X;
}

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}

const B = buildSandbox(base, false);
const A = buildSandbox(patched, true);

// ---------- 1. РЕГРЕССИЯ ГИТАРЫ ----------
const roots = ['C','C#','Db','D','Eb','E','F','F#','Gb','G','Ab','A','Bb','B','Cb','E#','B#','Fb'];
const suffixes = ['', 'm','min','dim','°','ø','aug','+','sus2','sus4','5','6','69','6/9',
  '7','maj7','M7','Δ','Δ9','m7','mmaj7','m(maj7)','m7b5','dim7','9','maj9','m9',
  '11','13','maj13','add9','add11','add2','add4','(9)',
  '7b5','7#5','7b9','7#9','7#11','7b13','7alt','7sus4','13b9','b6','mb6',
  '7(#11)','7(b9)','+maj7','C-','-7','-maj7','7sus2','9sus4','m11','m13'];
const corpus = [];
for (const r of roots) for (const s of suffixes) corpus.push(r + s);
for (const r of ['C','G','Am','Em','F','Bb','Dm']) {
  for (const b of ['C','E','G','B','Bb','F#']) corpus.push(r + '/' + b);
}
let diffs = [];
for (const name of corpus) {
  for (const ks of ['sharp', 'flat']) {
    const a = JSON.stringify(B.getChordNotes(name, ks));
    const b = JSON.stringify(A.getChordNotes(name, ks));
    if (a !== b) diffs.push({ name, ks, a, b });
  }
}
console.log(`\nРегрессия гитары: ${corpus.length} имён × 2 стиля = ${corpus.length*2} сравнений`);
ok('getChordNotes после патча выдаёт ровно те же ноты', diffs.length === 0, diffs.slice(0, 3));
ok('корпус достаточно большой (>1000 имён)', corpus.length > 1000, corpus.length);

// ---------- 2. КАНОНИЧЕСКАЯ ФОРМУЛА ----------
console.log('\nКаноническая формула chordFormula()');
ok('функция опубликована', typeof A.chordFormula === 'function');
ok('неймспейс StruChordFormula доступен', !!A.ns && typeof A.ns.chordFormula === 'function');

const cases = [
  ['C',        [0,4,7]],
  ['Cm',       [0,3,7]],
  ['C-',       [0,3,7]],
  ['Cdim',     [0,3,6]],
  ['C°',       [0,3,6]],
  ['Caug',     [0,4,8]],
  ['C+',       [0,4,8]],
  ['Csus2',    [0,2,7]],
  ['Csus4',    [0,5,7]],
  ['C5',       [0,7]],
  ['C6',       [0,4,7,9]],
  ['C69',      [0,4,7,9,14]],
  ['C6/9',     [0,4,7,9,14]],
  ['C7',       [0,4,7,10]],
  ['Cmaj7',    [0,4,7,11]],
  ['CM7',      [0,4,7,11]],
  ['CΔ',       [0,4,7,11]],
  ['CΔ9',      [0,4,7,11,14]],
  ['Cm7',      [0,3,7,10]],
  ['C-7',      [0,3,7,10]],
  ['Cm(maj7)', [0,3,7,11]],
  ['C-maj7',   [0,3,7,11]],
  ['Cm7b5',    [0,3,6,10]],
  ['Cø',       [0,3,6,10]],
  ['Cdim7',    [0,3,6,9]],
  ['C9',       [0,4,7,10,14]],
  ['Cmaj9',    [0,4,7,11,14]],
  ['Cm9',      [0,3,7,10,14]],
  ['C11',      [0,4,7,10,14,17]],
  ['C13',      [0,4,7,10,14,17,21]],
  ['Cmaj13',   [0,4,7,11,14,17,21]],
  ['Cadd9',    [0,4,7,14]],
  ['Cadd2',    [0,4,7,14]],
  ['Cadd11',   [0,4,7,17]],
  ['Cadd4',    [0,4,7,17]],
  ['C(9)',     [0,4,7,14]],
  ['C7b5',     [0,4,6,10]],
  ['C7#5',     [0,4,8,10]],
  ['C7b9',     [0,4,7,10,13]],
  ['C7#9',     [0,4,7,10,15]],
  ['C7#11',    [0,4,7,10,18]],
  ['C7b13',    [0,4,7,10,20]],
  ['C7alt',    [0,4,7,10,13,15,18,20]],
  ['C7sus4',   [0,5,7,10]],
  ['C13b9',    [0,4,7,10,13,14,17,21]],
  ['C7(#11)',  [0,4,7,10,18]],
  ['C7(b9)',   [0,4,7,10,13]],
  ['C13(#11)', [0,4,7,10,14,17,18,21]],
  ['C+maj7',   [0,4,8,11]],
  ['Cmb6',     [0,3,7,8]],
];
for (const [name, want] of cases) {
  const f = A.chordFormula(name, 'C');
  ok(name.padEnd(12) + ' -> ' + want.join(','),
     !!f && JSON.stringify(f.intervals) === JSON.stringify(want),
     f && f.intervals);
}

// ---------- 3. КЛЮЧЕВОЕ ОТЛИЧИЕ ОТ ГИТАРЫ (R12) ----------
console.log('\nR12: гитарные пропуски не переезжают в формулу');
const f11 = A.chordFormula('C11', 'C');
const g11 = A.getChordNotes('C11', 'sharp');
ok('C11: формула содержит терцию (4)', f11.intervals.includes(4), f11.intervals);
ok('C11: гитара по-прежнему без терции', !g11.some(n => n.startsWith('E')), g11);
const f13 = A.chordFormula('C13', 'C');
ok('C13: формула содержит 11-ю (17)', f13.intervals.includes(17), f13.intervals);
ok('C13: формула содержит все 7 тонов', f13.intervals.length === 7, f13.intervals);
const fb13 = A.chordFormula('C7b13', 'C');
ok('C7b13: квинта (7) сохранена в формуле', fb13.intervals.includes(7), fb13.intervals);

// ---------- 4. СЛЭШ-БАС, СПЕЛЛИНГ, НЕВАЛИДНЫЕ ИМЕНА ----------
console.log('\nБас, тональности, граничные случаи');
const ce = A.chordFormula('C/E', 'C');
ok('C/E: бас E, pc=4, интервал 4', ce.bass && ce.bass.pitchClass === 4 && ce.bass.interval === 4, ce.bass);
ok('C/E: бас — отдельная низкая нота E3', ce.bass.noteWithOctave === 'E3', ce.bass.noteWithOctave);
const gb = A.chordFormula('G/B', 'C');
ok('G/B: бас B, pc=11', gb.bass && gb.bass.pitchClass === 11, gb.bass);
const csharp = A.chordFormula('C#dim7', 'F');
ok('C#dim7 в F: бемольный стиль', csharp.keyStyle === 'flat', csharp.keyStyle);
ok('C#dim7 в F: тоны написаны бемолями', csharp.tones.some(t => t.note.includes('b')), csharp.tones.map(t=>t.note));
const notes = A.chordFormulaNotes('C13', 'C');
ok('chordFormulaNotes(C13) даёт 7 нот', notes.length === 7, notes);
ok('chordFormulaNotes(C13) растёт по октавам', notes[0] === 'C4' && notes[6] === 'A5', notes);
ok('нераспознанное имя -> null', A.chordFormula('xyz', 'C') === null);
ok('пустое имя -> null', A.chordFormula('', 'C') === null);
ok('null -> null', A.chordFormula(null, 'C') === null);
ok('H7 (немецкий си) -> null', A.chordFormula('H7', 'C') === null);
const cb = A.chordFormula('Cb', 'C');
ok('Cb: корень распознан (pc=11)', cb && cb.rootPc === 11, cb && cb.rootPc);
const es = A.chordFormula('E#', 'C');
ok('E#: корень распознан (pc=5)', es && es.rootPc === 5, es && es.rootPc);

// ---------- 5. СТАБИЛЬНОСТЬ ПО 12 ТОНАЛЬНОСТЯМ ----------
console.log('\nСтабильность в 12 тональностях');
let stable = true, bad = [];
for (let pc = 0; pc < 12; pc++) {
  const r = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][pc];
  for (const suf of ['', 'm', '7', 'maj7', 'm7b5', '9', '11', '13', 'add9', 'sus4']) {
    const f = A.chordFormula(r + suf, 'C');
    if (!f || f.intervals[0] !== 0 || f.intervals.length !== A.chordFormula('C' + suf, 'C').intervals.length) {
      stable = false; bad.push(r + suf);
    }
    if (f && f.pitchClasses.length !== f.intervals.length) { stable = false; bad.push(r + suf + ':pcs'); }
  }
}
ok('формула одинаковой структуры во всех 12 тональностях', stable, bad.slice(0,5));

console.log(`\n${fail === 0 ? '✅ ВСЕ ТЕСТЫ ЭТАПА 0 ПРОЙДЕНЫ' : '❌ ЕСТЬ ПАДЕНИЯ'}: ${pass} ok / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
