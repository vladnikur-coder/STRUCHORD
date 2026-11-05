// 0.797 · B-39 (бэклог №24): ползунок «Насыщенность» влияет на расположение
// выбранной ячейки в панели (авто-вариант); ручной выбор не насыщается.
// Запуск: node dev/tests/b39-saturation-panel-0797.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(ROOT, 'STRUCHORD.html'), 'utf8');

let passed = 0;
function ok(name) { passed++; console.log('  ok  ' + name); }

// --- Статика: хелпер и три точки применения + экспорт в API ---
assert(HTML.includes('function saturateNotes(trackId, notes, chordName, key, range)'),
  'хелпер saturateNotes объявлен (0.797)');
assert(HTML.includes('saturateNotes: saturateNotes,'), 'saturateNotes экспортирован в API (0.797)');
assert((HTML.match(/saturateNotes\(/g) || []).length === 5,
  'saturateNotes: объявление + экспорт + 3 вызова (voicingProvider, renderPanel, renderKeysVoicingSVG)');
assert(HTML.includes('if(linked.manual || Number.isInteger(manualIdx)) return linked.notes.slice();'),
  'voicingProvider: ручной выбор — якорь, без насыщения (0.797)');
assert(HTML.includes("return Number.isInteger(manualIdx) ? notes : saturateNotes(trackId, notes, chordName, key, range);"),
  'voicingProvider: авто-вариант насыщается (0.797)');
assert(HTML.includes("if (!Number.isInteger(tv[lastCellKey]) && !Number.isInteger(tv['v:'+chord])) notes=saturateNotes(active.track.id, notes, chord, panelKey(), range);"),
  'renderPanel: авто-расположение насыщается, ручной индекс пропускается (0.797)');
assert(HTML.includes("if (!Number.isInteger(tv2[o.cellKey]) && !Number.isInteger(tv2['v:'+chordName])) notes=saturateNotes(trackId, notes, chordName, currentKey(), range);"),
  'renderKeysVoicingSVG: авто-расположение насыщается (0.797)');
assert(HTML.includes('var m = top + (d === 0 ? 12 : d);'), 'nextPcAbove: октава при совпадении pc (0.797 fixup)');
ok('статические якоря 0.797 на месте (хелпер, 3 вызова, guard ручного, экспорт)');

// --- Динамика: вытаскиваем saturateNotes в vm с заглушками ---
const start = HTML.indexOf('  function saturateNotes(trackId, notes, chordName, key, range) {');
assert(start > 0, 'saturateNotes найден в HTML');
const end = HTML.indexOf('\n  }\n', start);
assert(end > start, 'конец saturateNotes найден');
const fnSrc = HTML.slice(start, end + 4);

const FORMULAS = {
  'C':   { rootPc: 0, tones: [{ pitchClass: 0, semitones: 0 }, { pitchClass: 4, semitones: 4 }, { pitchClass: 7, semitones: 7 }] },
  'C9':  { rootPc: 0, tones: [{ pitchClass: 0, semitones: 0 }, { pitchClass: 4, semitones: 4 }, { pitchClass: 7, semitones: 7 }, { pitchClass: 2, semitones: 14 }] },
  'C13': { rootPc: 0, tones: [{ pitchClass: 0, semitones: 0 }, { pitchClass: 4, semitones: 4 }, { pitchClass: 7, semitones: 7 }, { pitchClass: 9, semitones: 21 }] },
};
let SAT = 50;
const sandbox = {
  mod12: (n) => ((n % 12) + 12) % 12,
  tracks: () => ({ track: (id) => ({ id, saturation: SAT, voicings: {} }) }),
  formula: () => ({ chordFormula: (chord, key) => FORMULAS[chord] || null }),
};
vm.createContext(sandbox);
vm.runInContext(fnSrc + '\nthis.saturateNotes = saturateNotes;', sandbox);
const saturate = sandbox.saturateNotes;
assert(typeof saturate === 'function', 'saturateNotes исполняется в vm');
const R = { low: 36, high: 96 };

function run(sat, notes, chord, range) { SAT = sat; return saturate(1, notes, chord, 'C', range || R); }

// sat<60 — без изменений.
assert.deepStrictEqual(run(50, [60, 64, 67], 'C'), [60, 64, 67], 'sat 50: без насыщения');
// sat>=60 — октавное удвоение корня сверху.
assert.deepStrictEqual(run(60, [60, 64, 67], 'C'), [60, 64, 67, 72], 'sat 60: +root octave (72)');
// удвоение, когда верх уже корень: +12 (при спане <=15).
assert.deepStrictEqual(run(60, [67, 72, 76], 'C'), [67, 72, 76, 84], 'sat 60: верх=корень 72 -> +12 (84), спан 12');
assert.deepStrictEqual(run(60, [60, 64, 67, 72], 'C'), [60, 64, 67, 72], 'sat 60: 84 при спане 20>15 -> нет удвоения');
// не влезает в диапазон — без изменений.
assert.deepStrictEqual(run(60, [60, 64, 67], 'C', { low: 36, high: 71 }), [60, 64, 67], 'sat 60: 72 > high -> нет удвоения');
// спан руки >15 — без удвоения.
assert.deepStrictEqual(run(60, [48, 52, 55, 60], 'C'), [48, 52, 55, 60], 'sat 60: спан 72-52=20 >15 -> нет удвоения');
// sat>=80 — плюс 9-я (t9, pc 2), если ступени 13 нет в формуле.
assert.deepStrictEqual(run(80, [60, 64, 67], 'C9'), [60, 64, 67, 72, 74], 'sat 80 C9: +dbl 72 +9-я 74');
// sat>=80 — 13-я (pc 9), когда влезает по спану; удвоение тогда может не влезть.
assert.deepStrictEqual(run(80, [64, 67, 70, 73], 'C13'), [64, 67, 70, 73, 81], 'sat 80 C13: 13-я 81 (dbl 84 не влез по спану)');
// sat>=80 — 13-я не влезает по спану -> только удвоение.
assert.deepStrictEqual(run(80, [60, 64, 67], 'C13'), [60, 64, 67, 72], 'sat 80 C13: 13-я 81 спан 17>15 -> только dbl');
// нет поля saturation / короткий массив / нет формулы — без изменений.
SAT = null; assert.deepStrictEqual(saturate(1, [60, 64, 67], 'C', 'C', R), [60, 64, 67], 'нет saturation -> без изменений');
assert.deepStrictEqual(run(80, [60], 'C'), [60], 'одна нота -> без изменений');
assert.deepStrictEqual(run(80, [60, 64, 67], 'X'), [60, 64, 67], 'нет формулы -> без изменений');
// входной массив не мутируется.
const input = [60, 64, 67];
run(80, input, 'C9');
assert.deepStrictEqual(input, [60, 64, 67], 'входной массив не мутируется');
ok('saturateNotes: 11 динамических сценариев (пороги 60/80, диапазон, спан, 13/9, ручной нет)');

console.log(`\n0.797 (№24): насыщенность панели — все проверки пройдены (${passed} групп)`);
