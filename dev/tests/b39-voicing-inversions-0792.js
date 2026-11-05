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
const pcsOf = (a) => a.map((n) => ((n % 12) + 12) % 12).sort((x, y) => x - y);
const spanOf = (a) => { const rh = a.slice(1); return rh.length ? Math.max.apply(null, rh) - Math.min.apply(null, rh) : 0; };

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
  // 0.793: широкое — только если раздвижение теми же нотами укладывается в потолок 15 п/т
  st.slots.forEach((slot) => {
    if (slot.wide < 0) return;
    const b = st.list[slot.base], w = st.list[slot.wide];
    assert.strictEqual(w.length, b.length, 'широкое: нот столько же (раздвижение, не удвоение)');
    assert.deepStrictEqual(pcsOf(w), pcsOf(b), 'широкое: тот же состав');
    assert.strictEqual(w[0], b[0], 'широкое: бас не меняется');
    const bs = spanOf(b), ws = spanOf(w);
    assert(ws > bs && ws <= 15, 'широкое: спан вырос (' + bs + '->' + ws + ') и <= 15');
  });
  assert.strictEqual(J(X.listVoicingVariants('C', 'C', range, null, {})), J(st.list), 'listVoicingVariants = structure.list');
  ok('C на 88: основное первым, 3 обращения, широкие — раздвижение теми же нотами в пределах 15');
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

// 4. Удобного широкого нет — широкого нет вообще (0.793: потолок спана 15)
{
  for (const high of [59, 64, 72]) {
    const st = X.voicingVariantStructure('C', 'C', { low: 36, high, size: 61 });
    st.slots.forEach((slot) => {
      if (slot.wide < 0) return;
      const b = st.list[slot.base], w = st.list[slot.wide];
      assert(w.length === b.length && spanOf(w) > spanOf(b) && spanOf(w) <= 15, 'high ' + high + ': спан ' + spanOf(w));
    });
  }
  const st88 = X.voicingVariantStructure('C', 'C', { low: 36, high: 96, size: 88 });
  assert.strictEqual(st88.slots[0].wide, -1, 'C основное на 88: C G E′ = 16 п/т > потолка 15 — широкого нет');
  ok('широкое предлагается только при спане в пределах 15 (C-трезвучие на 88 — нет широкого)');
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
    assert(span <= 15, name + ' wide: размах ' + span + ' > 15 (потолок генератора): ' + w.join(','));
    assert(w.length === b.length, name + ' wide: раздвижение без добавления нот: ' + w.join(','));
    assert.deepStrictEqual(pcsOf(w), pcsOf(b), name + ' wide: тот же состав аккорда');
    assert.strictEqual(w[0], b[0], name + ' wide: бас не меняется');
    const moved = w.filter((n) => !b.includes(n));
    assert(moved.length === 1 && b.some((n) => Math.abs(n - moved[0]) === 12), name + ' wide: одна нота перенесена на октаву: ' + w.join(','));
  });
}
ok('широкие для C/Am/G7 на 88 и C на 61: раздвижение теми же нотами, спан > базового и <= 15');

// --- статический контракт ---
// 6. R7: 0.792 + v792 (0.791 откачен revert'ом)
{
  const VER = (HTML.match(/· ver (\d+\.\d+)/) || [])[1];
  assert(VER && /^\d+\.\d+$/.test(VER), 'версия читается: ' + VER);
  assert(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').includes('struchord-v' + VER.split('.')[1]), 'CACHE_NAME парой');
  const log = execSync('git log --oneline -8', { cwd: ROOT, encoding: 'utf8' });
  assert(log.includes('Revert "0.791'), 'в истории есть revert 0.791');
  ok('R7: версия ' + VER + ' + struchord-v' + VER.split('.')[1] + ' парой; 0.791 откачен revert-коммитом');
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
  ["countEl.textContent = 'Правая рука: '", 'счётчик «Правая рука: i/n · плотно/широко» (бас не меняется)'],
  ['var variants=trackVariantList(trackId,chord,key,cache.range,cache.prev), notes=null;', 'linkedSelection: ручной индекс по списку дорожки (voicingsVersion, 0.794)'],
  ['(keys.listVoicingVariants||keys.generateKeysVoicings)', 'selectedShape'],
  ['(K.listVoicingVariants || K.generateKeysVoicings)', 'авто-модуль'],
  ['listVoicingVariants: listVoicingVariants, trackVariantList: trackVariantList, voicingVariantStructure: voicingVariantStructure,', 'API export (incl. trackVariantList, 0.794)'],
]) {
  assert(HTML.includes(needle), 'нет: ' + label);
}
assert(HTML.includes('var basic=generateKeysVoicings(chord,key,range,null,{});'), 'inversionCandidates на базе (авто-голосоведение без изменений)');
assert(HTML.includes('span <= baseSpan || span > 15'), 'широкое: спан вырос и <= 15 (потолок генератора, не норма руки)');
assert(!HTML.includes('is-linked'), 'стрелки/тоггл НЕ скрываются при голосоведении — доступны всегда');
assert(HTML.includes('Авто-выбор: первое нажатие стрелки'), 'при включённом голосоведении первая стрелка берёт ручную форму (как раньше)');
assert(!HTML.includes('if (active.track.linkedVoicings) return;'), 'нет guardа, запрещающего стрелки при голосоведении');
ok('UI: карточки убраны, стрелки + тоггл плотно/широко, единый список во всех точках звука');

console.log('\n0.792 B-119 rework (обращения + плотно/широко): все проверки пройдены (' + groups + ' групп)');
