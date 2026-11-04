'use strict';
// 0.791 · B-119: варианты расположения — единый список listVoicingVariants
// (база + «широкие» с удвоением в октаву на 61+) и карточки в панели.
//
// Поведенческая часть: блок функций keys-модуля (mod12…voicingLabel) вырезается
// из STRUCHORD.html и гоняется в vm со stub-формулой C-dur. Сравнение массивов
// из vm — через JSON (cross-realm deepStrictEqual падает).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(ROOT, 'STRUCHORD.html'), 'utf8');
let groups = 0;
const ok = (msg) => { groups++; console.log('  ok  ' + msg); };
const J = (a) => JSON.stringify(a);

// --- поведенческий прогон вырезанного блока ---
const START = '  function mod12(n) { return ((n % 12) + 12) % 12; }\n  function firstMidiWithPc';
const END = '\n  // Обращения одного и того же набора звуков';
const i0 = HTML.indexOf(START), i1 = HTML.indexOf(END, i0);
assert(i0 > 0 && i1 > i0, 'границы блока функций найдены');
const slice = HTML.slice(i0, i1);
assert(slice.includes('function listVoicingVariants') && slice.includes('function voicingLabel'), 'новые функции в блоке');
const sandbox = {
  formula: () => ({
    chordFormula: (name) => name === 'C' ? {
      rootPc: 0, bass: null,
      tones: [{ degree: 1, semitones: 0 }, { degree: 3, semitones: 4 }, { degree: 5, semitones: 7 }],
    } : null,
  }),
};
vm.createContext(sandbox);
vm.runInContext(slice + '\nthis.__x = { listVoicingVariants, voicingLabel, generateKeysVoicings, handLimit };', sandbox);
const X = sandbox.__x;

// 1. На 88 клавишах широкие варианты добавлены в хвост, после базы
{
  const range = { low: 36, high: 96, size: 88 };
  const basic = X.generateKeysVoicings('C', 'C', range, null, {});
  const list = X.listVoicingVariants('C', 'C', range, null, {});
  assert(list.length > basic.length, 'широких добавлено: ' + basic.length + ' -> ' + list.length);
  for (let i = 0; i < basic.length; i++) assert.strictEqual(J(list[i]), J(basic[i]), 'базовые индексы не сдвинулись (' + i + ')');
  const wide = list[basic.length];
  const rh = basic[0].slice(1), top = Math.max.apply(null, rh);
  assert.strictEqual(Math.max.apply(null, wide), top + 12, 'широкий: верхняя нота RH +12');
  assert.strictEqual(wide.length, basic[0].length + 1, 'одна нота удвоена');
  assert(wide.every((n) => n >= range.low && n <= range.high), 'в пределах диапазона');
  const sigs = list.map((v) => v.join(','));
  assert.strictEqual(new Set(sigs).size, sigs.length, 'дубликатов нет');
  assert.strictEqual(X.voicingLabel(wide, basic.length, basic.length, { rootPc: 0 }), 'Широкое · удвоение в октаву');
  ok('88 клавиш: широкие в хвосте, база не сдвинута, без дублей, label «Широкое…»');
}

// 2. На 25/37/49 клавишах списка ровно как раньше (без широких)
for (const size of [25, 37, 49]) {
  const range = { low: 36, high: 36 + size - 1, size };
  const basic = X.generateKeysVoicings('C', 'C', range, null, {});
  const list = X.listVoicingVariants('C', 'C', range, null, {});
  assert.strictEqual(J(list), J(basic), 'size ' + size + ': список = база');
}
ok('25/37/49 клавиш: широких нет, прежний список и прежние индексы');

// 3. Рука не вмещает — широкого нет и на 61+
{
  // Узкий верх: high=64, верх RH базы 55, +12=67 > 64 → нет широкого
  const range = { low: 36, high: 64, size: 61 };
  const basic = X.generateKeysVoicings('C', 'C', range, null, {});
  const list = X.listVoicingVariants('C', 'C', range, null, {});
  assert.strictEqual(J(list), J(basic), 'верхняя нота +12 не влезает — без широкого');
  ok('61 клавиш с узким верхом: рука не позволяет — широкого нет');
}

// 4. Подписи базовых вариантов осмысленные
{
  const range = { low: 36, high: 96, size: 88 };
  const basic = X.generateKeysVoicings('C', 'C', range, null, {});
  const labels = basic.map((v, i) => X.voicingLabel(v, i, basic.length, { rootPc: 0 }));
  assert(labels.every((l) => typeof l === 'string' && l.length > 0 && !/^Вариант \d+$/.test(l) || l.startsWith('Вариант')), 'подписи читаемые: ' + labels.join(' | '));
  assert(labels.some((l) => ['Плотное', 'Компактное', 'Широкое', 'Обращение'].includes(l)), 'есть плотное/компактное/широкое/обращение');
  ok('подписи: ' + labels.join(' | '));
}

// --- статический контракт ---
// 5. R7: версия/кэш парой
{
  const VER = (HTML.match(/· ver (\d+\.\d+)/) || [])[1];
  assert(VER === '0.791', 'версия 0.791, а не ' + VER);
  assert(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').includes('struchord-v791'), 'CACHE_NAME v791');
  ok('R7: 0.791 + struchord-v791');
}

// 6. Единый список во всех точках ручного выбора и звука
for (const [needle, label] of [
  ['var variants=listVoicingVariants(chord,key,cache.range,cache.prev,{}), notes=null;', 'linkedSelection: ручной индекс по единому списку'],
  [': listVoicingVariants(name,(far.sec&&far.sec.key)||currentKey(),cache.range,null,{});', 'fallback 2048'],
  ['var variants = listVoicingVariants(lastChord, panelKey(), range, null, {});', 'stepVariant ±'],
  ['var variants = chord ? listVoicingVariants(chord, panelKey(), range, null, {}) : [];', 'renderPanel счётчик'],
  ['var variants = listVoicingVariants(chordName, key, range, prev, {});', 'voicingProvider (звук)'],
  ['(keys.listVoicingVariants||keys.generateKeysVoicings)', 'selectedShape'],
  ['(K.listVoicingVariants || K.generateKeysVoicings)', 'авто-модуль'],
  ['listVoicingVariants: listVoicingVariants, voicingLabel: voicingLabel,', 'API export'],
]) {
  assert(HTML.includes(needle), 'нет: ' + label);
}
assert(HTML.includes('var basic=generateKeysVoicings(chord,key,range,null,{});'), 'inversionCandidates остаётся на базе (авто не выбирает широкие)');
ok('все потребители ручного выбора/звука на едином списке; авто-голосоведение — на базе');

// 7. UI карточек
for (const [needle, label] of [
  ["varList = el('div', 'b39-keys-variants'); varList.id = 'b39KeysVariants';", 'создание #b39KeysVariants'],
  ['panel.appendChild(head);panel.appendChild(noteBar);panel.appendChild(body);panel.appendChild(varList);panel.appendChild(settings);', 'varList в DOM'],
  ['.b39-keys-panel.has-variants .b39-keys-variants { display: flex; }', 'CSS карточек'],
  ["card.addEventListener('click', function () { setVariantIndex(active.track.id, chord, lastCellKey, i, variants.length); renderPanel(); });", 'клик по карточке выбирает вариант'],
  ['card.setAttribute(\'aria-pressed\', v.join(\',\') === currentSig ? \'true\' : \'false\');', 'активная карточка подсвечена'],
]) {
  assert(HTML.includes(needle), 'нет: ' + label);
}
ok('UI: карточки #b39KeysVariants с мини-SVG, подписями и выбором по клику');

console.log('\n0.791 B-119 (варианты расположения): все проверки пройдены (' + groups + ' групп)');
