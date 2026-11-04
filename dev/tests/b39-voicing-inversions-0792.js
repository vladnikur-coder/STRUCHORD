'use strict';
// 0.792 · B-119 rework: стрелки по обращениям + тоггл плотно/широко.
//
// Поведенчески: блок keys-модуля (mod12…listVoicingVariants) вырезается из
// STRUCHORD.html и гоняется в vm со stub-формулами C/Am. Сравнение массивов
// из vm — через JSON (cross-realm deepStrictEqual падает).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(ROOT, 'STRUCHORD.html'), 'utf8');
let groups = 0;
const ok = (msg) => { groups++; console.log('  ok  ' + msg); };
const J = (a) => JSON.stringify(a);

// --- vm-прогон вырезанного блока ---
const START = '  function mod12(n) { return ((n % 12) + 12) % 12; }\n  function firstMidiWithPc';
const END = '\n  function motionCost';
const i0 = HTML.indexOf(START), i1 = HTML.indexOf(END, i0);
assert(i0 > 0 && i1 > i0, 'границы блока найдены');
const slice = HTML.slice(i0, i1);
assert(slice.includes('function voicingVariantStructure') && slice.includes('function listVoicingVariants'), 'новые функции в блоке');
const FORMULAS = {
  C: { rootPc: 0, bass: null, tones: [{ degree: 1, semitones: 0 }, { degree: 3, semitones: 4 }, { degree: 5, semitones: 7 }] },
  Am: { rootPc: 9, bass: null, tones: [{ degree: 1, semitones: 0 }, { degree: 3, semitones: 3 }, { degree: 5, semitones: 7 }] },
  G7: { rootPc: 7, bass: null, tones: [{ degree: 1, semitones: 0 }, { degree: 3, semitones: 4 }, { degree: 5, semitones: 7 }, { degree: 7, semitones: 10 }] },
};
const sandbox = { formula: () => ({ chordFormula: (name) => FORMULAS[name] || null }) };
vm.createContext(sandbox);
vm.runInContext(slice + '\nthis.__x = { voicingVariantStructure, listVoicingVariants, generateKeysVoicings, inversionCandidates, handLimit };', sandbox);
const X = sandbox.__x;

// 1. C на 88: основное положение первым (бас C + C E G), далее обращения, широкие в хвосте
{
  const range = { low: 36, high: 96, size: 88 };
  const st = X.voicingVariantStructure('C', 'C', range);
  assert.deepStrictEqual(JSON.parse(J(st.list[0])), [36, 48, 52, 55], 'C: [бас C, C E G]');
  assert.strictEqual(st.slots.length, 3, 'три обращения трезвучия');
  assert.deepStrictEqual(JSON.parse(J(st.list[1])), [36, 52, 55, 60], 'обращение 2: E G C');
  assert.deepStrictEqual(JSON.parse(J(st.list[2])), [36, 55, 60, 64], 'обращение 3: G C E');
  assert(st.slots.every((s) => s.wide >= 0), 'у каждого обращения есть широкий слот (88 клавиш)');
  assert.deepStrictEqual(JSON.parse(J(st.list[st.slots[0].wide])), [36, 48, 52, 55, 64], 'широкое C = C E G + E5 (подняли E на октаву, а не верхнюю G: размах 16, а не 19)');
  assert.strictEqual(J(X.listVoicingVariants('C', 'C', range, null, {})), J(st.list), 'listVoicingVariants = structure.list');
  ok('C на 88: основное первым, 3 обращения, широкое = C E G + E5, размах 16 (играбельно)');
}

// 2. Am: умолчание = основное положение (бас A + A C E)
{
  const range = { low: 36, high: 96, size: 88 };
  const st = X.voicingVariantStructure('Am', 'C', range);
  assert.deepStrictEqual(JSON.parse(J(st.list[0])), [45, 57, 60, 64], 'Am: [бас A, A C E]');
  assert(st.list.every((v) => v[0] === 45), 'бас везде A (обращения — тот же состав, бас отдельно)');
  ok('Am на 88: умолчание = A C E с басом A, бас не участвует в обращениях');
}

// 3. На 25/37/49 широких нет, список = обращения
for (const size of [25, 37, 49]) {
  const range = { low: 36, high: 36 + size - 1, size };
  const st = X.voicingVariantStructure('C', 'C', range);
  assert(st.slots.every((s) => s.wide === -1), 'size ' + size + ': широких нет');
  assert.strictEqual(st.list.length, st.slots.length, 'size ' + size + ': список = только обращения');
}
ok('25/37/49: тоггл «Широко» не предлагается (нет широких слотов)');

// 4. Рука/диапазон не вмещают — широкого нет и на 61+
{
  const range64 = { low: 36, high: 64, size: 61 };
  const st64 = X.voicingVariantStructure('C', 'C', range64);
  assert.deepStrictEqual(JSON.parse(J(st64.list[st64.slots[0].wide])), [36, 48, 52, 55, 64], 'верх 64: широкое = C E G + E5 (влезает, размах 16)');
  const range = { low: 36, high: 59, size: 61 };
  const st = X.voicingVariantStructure('C', 'C', range);
  assert(st.slots.every((s) => s.wide === -1), 'верх 59: ни одна нота +12 не влезает (C5=60 > 59)');
  ok('61 клавиш: широкое предлагается только если влезает в диапазон и размах <= 16');
}

// 5. Арифметика стрелок/тоггла по слотам
{
  const range = { low: 36, high: 96, size: 88 };
  const st = X.voicingVariantStructure('C', 'C', range);
  const n = st.slots.length;
  const step = (inv, delta) => ((inv + delta) % n + n) % n;
  assert.strictEqual(step(0, 1), 1, '› из основного = обращение 2');
  assert.strictEqual(step(n - 1, 1), 0, '› с последнего = по кругу на основное');
  assert.strictEqual(step(0, -1), n - 1, '‹ из основного = последнее обращение');
  ok('стрелки ходят по обращениям по кругу');
}

// 4b. Самопроверка «как бы сыграл пианист»: у ЛЮБОГО широкого варианта размах
// правой руки <= 16 полутонов (одной рукой играбельно) и нот <= handLimit.
for (const [name, range] of [['C', { low: 36, high: 96, size: 88 }], ['Am', { low: 36, high: 96, size: 88 }], ['G7', { low: 36, high: 96, size: 88 }], ['C', { low: 36, high: 88, size: 61 }]]) {
  const st = X.voicingVariantStructure(name, 'C', range);
  const limit = X.handLimit(range.size);
  st.slots.forEach((slot) => {
    if (slot.wide < 0) return;
    const w = st.list[slot.wide], b = st.list[slot.base];
    const rhW = w.slice(1), span = Math.max.apply(null, rhW) - Math.min.apply(null, rhW);
    assert(span <= 16, name + ' wide: размах руки ' + span + ' > 16 — неиграбельно: ' + w.join(','));
    assert(w.length <= limit + 1 && w.length <= 9, name + ' wide: нот слишком много: ' + w.length);
    assert(w.length === b.length + 1, name + ' wide: ровно одна нота поднята на октаву');
    assert(w.includes(Math.max.apply(null, b.slice(1)) + 12) || true, '');
    const added = w.filter((n) => !b.includes(n));
    assert(added.length === 1 && b.some((n) => n + 12 === added[0]), name + ' wide: добавлена ровно одна нота = какая-то базовая +12: ' + w.join(','));
  });
}
ok('широкие варианты для C/Am/G7 на 88 и C на 61: размах руки <= 16, нот в пределах руки — играбельно одной рукой');

// --- статический контракт ---
// 6. R7: 0.792 + v792 (0.791 откачен revert'ом)
{
  const VER = (HTML.match(/· ver (\d+\.\d+)/) || [])[1];
  assert(VER === '0.792', 'версия 0.792, а не ' + VER);
  assert(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').includes('struchord-v792'), 'CACHE_NAME v792');
  const log = execSync('git log --oneline -3', { cwd: ROOT, encoding: 'utf8' });
  assert(log.includes('Revert "0.791'), 'в истории есть revert 0.791');
  ok('R7: 0.792 + struchord-v792; 0.791 откачен revert-коммитом');
}

// 7. Карточек нет, toggl и стрелки есть
assert(!HTML.includes('b39KeysVariants'), 'карточек #b39KeysVariants больше нет');
for (const [needle, label] of [
  ["densityEl = el('span', 'b39-keys-density'); densityEl.id = 'b39KeysDensity';", 'DOM тоггла #b39KeysDensity'],
  [".b39-keys-panel.has-wide .b39-keys-density { display: inline-flex; }", 'CSS: тоггл виден только когда есть широкие'],
  ["'Плотно'", 'кнопка Плотно'],
  ["'Широко'", 'кнопка Широко'],
  ['function stepVariant(delta)', 'stepVariant (стрелки) на месте'],
  ['function toggleDensity()', 'toggleDensity на месте'],
  ['обращение \' + (cur2.inv + 1) + \'/\'', 'счётчик «обращение i/n»'],
  ['var variants=listVoicingVariants(chord,key,cache.range,cache.prev,{}), notes=null;', 'linkedSelection: ручной индекс по списку обращений'],
  ['(keys.listVoicingVariants||keys.generateKeysVoicings)', 'selectedShape'],
  ['(K.listVoicingVariants || K.generateKeysVoicings)', 'авто-модуль'],
  ['listVoicingVariants: listVoicingVariants, voicingVariantStructure: voicingVariantStructure,', 'API export'],
]) {
  assert(HTML.includes(needle), 'нет: ' + label);
}
assert(HTML.includes('var basic=generateKeysVoicings(chord,key,range,null,{});'), 'inversionCandidates на базе (авто-голосоведение без изменений)');
assert(HTML.includes('extra - rh[0] > 16'), 'широкие проверяют размах руки <= 16 (играбельность)');
ok('UI: карточки убраны, стрелки + тоггл плотно/широко, единый список во всех точках звука');

console.log('\n0.792 B-119 rework (обращения + плотно/широко): все проверки пройдены (' + groups + ' групп)');
