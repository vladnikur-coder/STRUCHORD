// 0.797 → 0.803 · B-39 (№24 → №27): ползунок «Насыщенность» влияет на
// расположение выбранной ячейки в панели (авто-вариант); ручной выбор не
// насыщается. С 0.803 пороги 60/80 заменены плавными вероятностями:
// октава корня — окно 40–90, надстройка 13/9 — окно 70–100; решение
// детерминировано по (дорожка, аккорд). Запуск: node dev/tests/b39-saturation-panel-0797.js
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
// 0.803 (№27): плавные вероятности, зеркалящие генератор.
assert(HTML.includes("satHashStr(trackId + '|' + chordName, 1) < satCurveBetween(sat, 40, 90)"),
  'октава корня: вероятность smoothstep в окне 40–90 (0.803)');
assert(HTML.includes("satHashStr(trackId + '|' + chordName, 2) < satCurveBetween(sat, 70, 100)"),
  'надстройка 13/9: вероятность smoothstep в окне 70–100 (0.803)');
assert(!HTML.includes('sat >= 60') && !HTML.includes('sat >= 80'),
  'пороги 60/80 в saturateNotes убраны (0.803)');
ok('статические якоря 0.797+0.803 на месте (хелпер, 3 вызова, guard ручного, кривые)');

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

// Якоря кривой: sat 40 — окна неактивны; sat 100 — вероятность 1 у обеих.
assert.deepStrictEqual(run(40, [60, 64, 67], 'C'), [60, 64, 67], 'sat 40: без насыщения');
assert.deepStrictEqual(run(100, [60, 64, 67], 'C'), [60, 64, 67, 72], 'sat 100: +root octave (72)');
// Удвоение, когда верх уже корень: +12 (при спане <=15).
assert.deepStrictEqual(run(100, [67, 72, 76], 'C'), [67, 72, 76, 84], 'sat 100: верх=корень 72 -> +12 (84), спан 12');
// Не влезает в диапазон — без изменений.
assert.deepStrictEqual(run(100, [60, 64, 67], 'C', { low: 36, high: 71 }), [60, 64, 67], 'sat 100: 72 > high -> нет удвоения');
// Спан руки >15 — без удвоения.
assert.deepStrictEqual(run(100, [48, 52, 55, 60], 'C'), [48, 52, 55, 60], 'sat 100: спан 72-52=20 >15 -> нет удвоения');
// sat 100: плюс 9-я (t9, pc 2), если ступени 13 нет в формуле.
assert.deepStrictEqual(run(100, [60, 64, 67], 'C9'), [60, 64, 67, 72, 74], 'sat 100 C9: +dbl 72 +9-я 74');
// sat 100: 13-я (pc 9), когда влезает по спану; удвоение тогда может не влезть.
assert.deepStrictEqual(run(100, [64, 67, 70, 73], 'C13'), [64, 67, 70, 73, 81], 'sat 100 C13: 13-я 81 (dbl 84 не влез по спану)');
// sat 100: 13-я не влезает по спану -> только удвоение.
assert.deepStrictEqual(run(100, [60, 64, 67], 'C13'), [60, 64, 67, 72], 'sat 100 C13: 13-я 81 спан 17>15 -> только dbl');
ok('якоря и границы: sat 40 ничего, sat 100 — октава и 13/9; диапазон и спан <=15 соблюдаются');

// Монотонность и «выросшее не убывает»: вероятность каждого решения растёт с
// ползунком, поэтому результат при большем sat — надмножество меньшего.
for (const chord of ['C', 'C9', 'C13']) {
  let prev = run(40, [60, 64, 67], chord);
  for (let sat = 45; sat <= 100; sat += 5) {
    const next = run(sat, [60, 64, 67], chord);
    for (const n of prev) assert(next.includes(n), `монотонность ${chord} sat ${sat}: ${n} пропало из ${next}`);
    prev = next;
  }
}
ok('монотонность: ноты, появившиеся при меньшем sat, не пропадают при большем (C/C9/C13, 40→100)');

// Детерминизм и одинаковые аккорды: одно и то же (дорожка, аккорд) — одно решение.
assert.deepStrictEqual(run(73, [60, 64, 67], 'C9'), run(73, [60, 64, 67], 'C9'), 'повторный вызов идентичен');
const otherChord = saturate(1, [60, 64, 67], 'C9', 'C', R);   // тот же аккорд другой ячейкой
assert.deepStrictEqual(run(73, [60, 64, 67], 'C9'), otherChord, 'одинаковые аккорды насыщаются одинаково');
ok('детерминизм: (дорожка, аккорд) полностью задаёт решение — панель зеркалит звук');

// Нет поля saturation / короткий массив / нет формулы — без изменений.
SAT = null; assert.deepStrictEqual(saturate(1, [60, 64, 67], 'C', 'C', R), [60, 64, 67], 'нет saturation -> без изменений');
assert.deepStrictEqual(run(100, [60], 'C'), [60], 'одна нота -> без изменений');
assert.deepStrictEqual(run(100, [60, 64, 67], 'X'), [60, 64, 67], 'нет формулы -> без изменений');
// Входной массив не мутируется.
const input = [60, 64, 67];
run(100, input, 'C9');
assert.deepStrictEqual(input, [60, 64, 67], 'входной массив не мутируется');
ok('guard-ы: нет поля/нот/формулы — без изменений; вход не мутируется');

console.log(`\n0.797+0.803 (№24+№27): насыщенность панели — все проверки пройдены (${passed} групп)`);
