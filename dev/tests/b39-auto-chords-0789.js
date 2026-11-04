'use strict';
// 0.789 · B-117: «аккорды в автоплане» — в блоковых авто-рисунках последний
// аккорд такта получает сверху 13-ю (или 9-ю) ступень, если она есть в
// аккорде, «как пианист» (top note на последнем ударе). R8: «зависит от
// жанра, как бы сделал пианист?» — final=yes 2026-11-04.
//
// Проверяется реальный plan() из keyboard-accompaniment.js в vm-песочнице
// (формула аккордов — минимальный stub, треки — mock как в 0784). Ручные
// рисунки ячеек и переборы не должны меняться. НЕ заменяет слуховую проверку.
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(ROOT, 'STRUCHORD.html'), 'utf8');
const ACCOMP = fs.readFileSync(path.join(ROOT, 'keyboard-accompaniment.js'), 'utf8');
let groups = 0;
const ok = (msg) => { groups++; console.log('  ok  ' + msg); };
const H = (a) => JSON.parse(JSON.stringify(a));   // host-копия массива из vm-песочницы (deepStrictEqual)

// ---------------------------------------------------------------------------
// 1. R7: версия/кэш парой (динамически) + статический контракт 0.789
// ---------------------------------------------------------------------------
const VER = (HTML.match(/· ver (\d+\.\d+)/) || [])[1];
assert(VER && /^\d+\.\d+$/.test(VER), 'версия читается: ' + VER);
assert(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').includes('struchord-v' + VER.split('.')[1]),
  'CACHE_NAME парой с версией');
assert(ACCOMP.includes('function applyExtensionAccent('), 'helper applyExtensionAccent на месте');
assert(ACCOMP.includes('0.789 (B-117)'), 'комментарий 0.789 на месте');
assert(ACCOMP.includes("if (cfg.source !== 'cell' && !(o.pattern && o.pattern.status === 'manual')) out = applyExtensionAccent(out, C, beats, sub);"),
  'вызов в plan() гейтится ручным рисунком');
ok('R7 ' + VER + ' + struchord-v' + VER.split('.')[1] + '; контракт 0.789 в keyboard-accompaniment.js');

// ---------------------------------------------------------------------------
// 2. Реальный plan() в vm: stub формулы и треков
// ---------------------------------------------------------------------------
function bootAccomp(patterns) {
  const win = {};
  win.window = win; win.document = undefined;
  win.setTimeout = () => 0; win.clearTimeout = () => {}; win.console = console;
  win.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ pad: [] }) });
  win.songStore = { subscribe: () => {} };
  const TRACK = {
    id: 1, instrument: 'keys', timbre: 'acoustic', volume: 100, mute: false, solo: false,
    linkedVoicings: true, voicings: {}, patterns: patterns || {}, chords: {}, bassRoles: {}
  };
  win.StruChordTracks = {
    state: () => ({ mainTrackId: 1, activeTrackId: 1, tracks: [TRACK] }),
    track: () => TRACK,
    cellKey: (s, q, i) => s.id + ':' + q.id + ':' + i,
    trackChord: () => 'C', keyRange: () => ({ low: 36, high: 84, size: 49 }),
    exactNotes: () => null, voicingForChord: () => null, bassRole: () => 'legacy'
  };
  win.StruChordKeys = { linkedSelection: () => null, voiceLead: () => null };
  win.mixerChannelForVoice = () => ({ input: { gain: { value: 0 } }, dry: {} });
  // Минимальная формула: только то, что читает планировщик (tones/pcs, rootPc, bass).
  const FORMULAS = {
    C:   { rootPc: 0, bass: { pitchClass: 0 }, tones: [{ degree: '1', semitones: 0, pitchClass: 0 }, { degree: '3', semitones: 4, pitchClass: 4 }, { degree: '5', semitones: 7, pitchClass: 7 }] },
    C9:  { rootPc: 0, bass: { pitchClass: 0 }, tones: [{ degree: '1', semitones: 0, pitchClass: 0 }, { degree: '3', semitones: 4, pitchClass: 4 }, { degree: '5', semitones: 7, pitchClass: 7 }, { degree: '7', semitones: 10, pitchClass: 10 }, { degree: '9', semitones: 14, pitchClass: 2 }] },
    C13: { rootPc: 0, bass: { pitchClass: 0 }, tones: [{ degree: '1', semitones: 0, pitchClass: 0 }, { degree: '3', semitones: 4, pitchClass: 4 }, { degree: '5', semitones: 7, pitchClass: 7 }, { degree: '7', semitones: 10, pitchClass: 10 }, { degree: '9', semitones: 14, pitchClass: 2 }, { degree: '13', semitones: 21, pitchClass: 9 }] },
    G7:  { rootPc: 7, bass: { pitchClass: 7 }, tones: [{ degree: '1', semitones: 0, pitchClass: 7 }, { degree: '3', semitones: 4, pitchClass: 11 }, { degree: '5', semitones: 7, pitchClass: 2 }, { degree: '7', semitones: 10, pitchClass: 5 }] }
  };
  win.StruChordFormula = { chordFormula: (name) => FORMULAS[name] || null };
  const sandbox = vm.createContext(win);
  vm.runInContext(ACCOMP, sandbox, { filename: 'keyboard-accompaniment.js' });
  win.__b39Modules.accomp();
  return win.StruChordAccomp;
}

function planWith(A, patterns, chord, notes, o) {
  return A.plan(Object.assign({
    trackId: 1, chord: chord, key: 'C', range: { low: 36, high: 84, size: 49 },
    notes: notes, ts: '4/4', span: 1, dur: 2, bpm: 120,
    ev: { span: 1 }, sec: { id: 'A', key: 'C' }, sq: { id: 'q1', events: [{ span: 1 }] }, ei: 0,
    cell: 'A:q1:0', noHighlight: true
  }, o || {}));
}

const C13_NOTES = [36, 55, 60, 64, 67, 70, 74];   // бас C2 + RH incl. 9-я (D5=74)
const C13_EXT = 81;                               // A5 = 13-я (pc 9) поверх блока

// --- 2a. блоковый пресет, 4/4: акцент только на последнем аккорде такта ---
{
  const A = bootAccomp({ 's:A': { type: 'keys-block', subdivision: 1, swing: null } });
  const steps = planWith(A, null, 'C13', C13_NOTES, { span: 4, dur: 8, ev: { span: 4 } });
  assert.strictEqual(steps.length, 4, 'keys-block sub=1, ячейка = takt 4/4: 4 шага');
  steps.forEach((s, i) => assert(s.token === 'H', 'шаг ' + i + ' = H'));
  for (let i = 0; i < 3; i++) assert(!steps[i].notes.includes(C13_EXT), 'шаг ' + i + ': 13-й нет');
  assert(steps[3].notes.includes(C13_EXT), 'последний аккорд такта (шаг 3) получил 13-ю сверху: ' + steps[3].notes);
  assert(steps[3].notes.indexOf(36) >= 0, 'бас в блоке остался');
  ok('keys-block 4/4, C13: 13-я (81) только на последнем аккорде такта');
}

// --- 2b. deux такта в ячейке (span=2): акцент на каждом последнем аккорде ---
{
  const A = bootAccomp({ 's:A': { type: 'keys-block', subdivision: 1, swing: null } });
  const steps = planWith(A, null, 'C13', C13_NOTES, { span: 8, ev: { span: 8 }, dur: 16 });
  assert.strictEqual(steps.length, 8, 'ячейка span=8 в 4/4: 8 шагов = 2 такта');
  assert(!steps[2].notes.includes(C13_EXT) && steps[3].notes.includes(C13_EXT), 'такт 1: акцент на шаге 3');
  assert(!steps[6].notes.includes(C13_EXT) && steps[7].notes.includes(C13_EXT), 'такт 2: акцент на шаге 7');
  ok('ячейка в 2 такта: акцент на последнем аккорде каждого такта');
}

// --- 2c. обычный C: ничего не добавляется ---
{
  const A = bootAccomp({ 's:A': { type: 'keys-block', subdivision: 1, swing: null } });
  const steps = planWith(A, null, 'C', [36, 48, 52, 55, 60], { span: 4, dur: 8, ev: { span: 4 } });
  const base = [36, 48, 52, 55, 60];
  steps.forEach((s, i) => assert.deepStrictEqual(H(s.notes).sort((a, b) => a - b), base, 'шаг ' + i + ' без изменений'));
  ok('обычный C: ни одна ступень не добавлена (в аккорде нет 9/13)');
}

// --- 2d. C9 без 9-й в воцинге: добавляется 9-я (pc 2) сверху ---
{
  const A = bootAccomp({ 's:A': { type: 'keys-block', subdivision: 1, swing: null } });
  const steps = planWith(A, null, 'C9', [36, 60, 64, 67, 70], { span: 4, dur: 8, ev: { span: 4 } });   // воцинг без 9-й
  assert(!steps[0].notes.includes(74), 'шаг 0: 9-й нет');
  assert(steps[3].notes.includes(74), 'последний аккорд получил 9-ю (74) сверху: ' + steps[3].notes);
  ok('C9: если 9-й нет в воцинге, она добавляется сверху на последнем аккорде');
}

// --- 2e. G7 (нет 9/13): без изменений ---
{
  const A = bootAccomp({ 's:A': { type: 'keys-block', subdivision: 1, swing: null } });
  const notes = [43, 59, 62, 65, 67];
  const steps = planWith(A, null, 'G7', notes, { span: 4, dur: 8, ev: { span: 4 } });
  steps.forEach((s, i) => assert(!s.notes.some(n => notes.indexOf(n) < 0), 'шаг ' + i + ': только ноты аккорда'));
  ok('G7: расширений нет — шаги не изменились');
}

// --- 2f. перебор (keys-arp-up): без изменений ---
{
  const A = bootAccomp({ 's:A': { type: 'keys-arp-up', subdivision: 2, swing: null } });
  const before = planWith(bootAccomp({}), null, 'C13', C13_NOTES, {}); // default-ветка НЕ должна...
  const steps = planWith(A, null, 'C13', C13_NOTES, { span: 4, dur: 8, ev: { span: 4 } });
  assert(steps.every(s => s.token === 'A'), 'все шаги A');
  assert(steps.every(s => !s.notes.includes(C13_EXT)), 'в переборе 13-я отдельно не добавляется (она и так в переборе, если в воцинге)');
  ok('keys-arp-up: перебор не тронут');
}

// --- 2g. вальс 3/4: акцент на аккорде 3-й доли ---
{
  const A = bootAccomp({ 's:A': { type: 'keys-waltz', subdivision: 1, swing: null } });
  const steps = planWith(A, null, 'C13', C13_NOTES, { ts: '3/4', span: 3, dur: 6, ev: { span: 3 } });
  assert.strictEqual(steps.length, 3, '3/4: 3 шага');
  assert.strictEqual(steps[0].token, 'B', 'долб 1 = бас');
  assert(!steps[1].notes.includes(C13_EXT), 'долб 2: без 13-й');
  assert(steps[2].notes.includes(C13_EXT), 'долб 3 (последний аккорд такта): 13-я сверху');
  ok('вальс 3/4: 13-я на аккорде третьей доли');
}

// --- 2h. ручной рисунок ячейки (source 'cell'): не трогаем ---
{
  const A = bootAccomp({ 'A:q1:0': { type: 'keys-block', subdivision: 1, swing: null } });
  const steps = planWith(A, null, 'C13', C13_NOTES, { span: 4, dur: 8, ev: { span: 4 } });
  assert(steps.every(s => !s.notes.includes(C13_EXT)), 'ручной рисунок ячейки: 13-я не добавляется');
  ok('ручной рисунок ячейки (source=cell) не изменён');
}

// --- 2i. default (нет сохранённого рисунка): один блок — акцент на нём ---
{
  const A = bootAccomp({});
  const steps = planWith(A, null, 'C13', C13_NOTES, { span: 4, dur: 8, ev: { span: 4 } });
  assert.strictEqual(steps.length, 1, 'default: один шаг на ячейку');
  assert(steps[0].token === 'H' && steps[0].notes.includes(C13_EXT), 'default-блок получил 13-ю сверху');
  ok('default (автоплан без рисунка): блоковой аккорд ячейки тоже с 13-й сверху');
}

// --- 2j. детерминизм: два мира, один план ---
{
  const p1 = planWith(bootAccomp({ 's:A': { type: 'keys-block', subdivision: 1, swing: null } }), null, 'C13', C13_NOTES, { span: 4, dur: 8, ev: { span: 4 } });
  const p2 = planWith(bootAccomp({ 's:A': { type: 'keys-block', subdivision: 1, swing: null } }), null, 'C13', C13_NOTES, { span: 4, dur: 8, ev: { span: 4 } });
  const sig = (p) => JSON.stringify(p.map(s => ({ t: s.token, n: s.notes, at: s.at, dur: s.dur })));
  assert.strictEqual(sig(p1), sig(p2), 'планы совпадают');
  ok('детерминизм: два свежих мира дают одинаковый план');
}

console.log('\n0.789 B-117: все проверки пройдены (' + groups + ' групп)');
