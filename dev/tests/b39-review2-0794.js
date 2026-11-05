'use strict';
// 0.794 · доведение по ревью преподавателя №2 (после 0.793), 4 пункта:
//  п.1 endAccent и нотная автопартия: шаги StruChordNoteCandidate — отдельные
//      ноты без блоковых атак (H/R), акцент к ним не применяется по смыслу;
//      тест: одна и та же нотная партия при вкл/выкл опции идентична,
//      блоковый рисунок — с/без 13-й; title чекбокса оговаривает.
//  п.2 спан-проверка по ВСЕМ нотам правой руки (C.rh из tokenContext),
//      а не st.notes.slice(1) — при nobrass первая нота тоже RH.
//  п.3 честный комментарий parallelPerfects: внутри RH намеренное
//      октавное удвоение мелодии от двух голосов не отличить; штраф мягкий.
//  п.4 voicingsVersion: старые песни (поля нет) резолвят индексы по прежнему
//      generateKeysVoicings, новые дорожки/записи — v2 по listVoicingVariants;
//      гейт trackVariantList во всех звуковых путях.
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(ROOT, 'STRUCHORD.html'), 'utf8');
const ACCOMP = fs.readFileSync(path.join(ROOT, 'keyboard-accompaniment.js'), 'utf8');
let groups = 0;
const ok = (msg) => { groups++; console.log('  ok  ' + msg); };
const J = (a) => JSON.stringify(a);
const H = (a) => JSON.parse(JSON.stringify(a));

// ---------- vm: блок keys-модуля (mod12…listVoicingVariants) ----------
const START = '  function mod12(n) { return ((n % 12) + 12) % 12; }\n  function firstMidiWithPc';
const END = '\n  function motionCost';
const i0 = HTML.indexOf(START), i1 = HTML.indexOf(END, i0);
assert(i0 > 0 && i1 > i0);
const slice = HTML.slice(i0, i1);
const FORMULAS = {
  C: { rootPc: 0, bass: null, tones: [{ degree: 1, semitones: 0 }, { degree: 3, semitones: 4 }, { degree: 5, semitones: 7 }] },
};
const sb = { formula: () => ({ chordFormula: (n) => FORMULAS[n] || null }) };
vm.createContext(sb);
vm.runInContext(slice + '\nthis.X={voicingVariantStructure,listVoicingVariants,generateKeysVoicings};', sb);
const X = sb.X;

// ---------- п.4: trackVariantList выбирает список по voicingsVersion ----------
{
  const range = { low: 36, high: 96, size: 88 };
  const oldList = X.generateKeysVoicings('C', 'C', range, null, {});
  const newList = X.listVoicingVariants('C', 'C', range, null, {});
  assert(oldList.length && newList.length, 'оба списка непустые');
  assert(J(oldList[0]) !== J(newList[0]) || J(oldList) !== J(newList),
    'порядок вариантов реально разный — voicingsVersion имеет смысл');

  const f0 = HTML.indexOf('  function trackVariantList(trackId, chord, key, range, prev) {');
  const f1 = HTML.indexOf('\n  function linkedSelection', f0);
  assert(f0 > 0 && f1 > f0, 'trackVariantList в keys-модуле');
  const src = HTML.slice(f0, f1);
  const mk = (track) => {
    const s = {
      tracks: () => ({ track: () => track }),
      listVoicingVariants: () => ['NEW'],
      generateKeysVoicings: () => ['OLD'],
    };
    vm.createContext(s);
    vm.runInContext(src + '\nthis.f=trackVariantList;', s);
    return s.f;
  };
  assert.deepStrictEqual(mk({ voicingsVersion: 2 })('t', 'C', 'C', range, null), ['NEW'], 'v2 → новый список');
  assert.deepStrictEqual(mk({})('t', 'C', 'C', range, null), ['OLD'], 'поля нет (старая песня) → прежний список');
  assert.deepStrictEqual(mk({ voicingsVersion: 1 })('t', 'C', 'C', range, null), ['OLD'], 'v1 → прежний список');
  ok('trackVariantList: v2 → listVoicingVariants, absent/v1 → generateKeysVoicings (старый индекс не переезжает)');
}

// ---------- п.1 + п.2: plan() в keyboard-accompaniment.js ----------
function bootAccomp(trackExtra, noteCandidate) {
  const win = {};
  win.window = win; win.document = undefined;
  win.setTimeout = () => 0; win.clearTimeout = () => {}; win.console = console;
  win.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ pad: [] }) });
  win.songStore = { subscribe: () => {} };
  const TRACK = Object.assign({
    id: 1, instrument: 'keys', timbre: 'acoustic', volume: 100, mute: false, solo: false,
    linkedVoicings: true, voicings: {}, patterns: { 's:A': { type: 'keys-block', subdivision: 1, swing: null } }, chords: {}, bassRoles: {}
  }, trackExtra || {});
  win.StruChordTracks = {
    state: () => ({ mainTrackId: 1, activeTrackId: 1, tracks: [TRACK] }),
    track: () => TRACK,
    cellKey: (s, q, i) => s.id + ':' + q.id + ':' + i,
    trackChord: () => 'C13', keyRange: () => ({ low: 36, high: 84, size: 49 }),
    exactNotes: () => null, voicingForChord: () => null, bassRole: () => 'legacy'
  };
  win.StruChordKeys = { linkedSelection: () => null, voiceLead: () => null };
  if (noteCandidate) win.StruChordNoteCandidate = { plan: () => H(noteCandidate) };
  win.mixerChannelForVoice = () => ({ input: { gain: { value: 0 } }, dry: {} });
  const FORMULAS = {
    C13: { rootPc: 0, bass: { pitchClass: 0 }, tones: [
      { degree: '1', semitones: 0, pitchClass: 0 }, { degree: '3', semitones: 4, pitchClass: 4 },
      { degree: '5', semitones: 7, pitchClass: 7 }, { degree: '7', semitones: 10, pitchClass: 10 },
      { degree: '9', semitones: 14, pitchClass: 2 }, { degree: '13', semitones: 21, pitchClass: 9 }] },
  };
  win.StruChordFormula = { chordFormula: (n) => FORMULAS[n] || null };
  const sandbox = vm.createContext(win);
  vm.runInContext(ACCOMP, sandbox, { filename: 'keyboard-accompaniment.js' });
  win.__b39Modules.accomp();
  return win.StruChordAccomp;
}
function planWith(A, notes, extra) {
  return A.plan(Object.assign({
    trackId: 1, chord: 'C13', key: 'C', range: { low: 36, high: 84, size: 49 },
    notes, ts: '4/4', span: 4, dur: 8, bpm: 120,
    ev: { span: 4 }, sec: { id: 'A', key: 'C' }, sq: { id: 'q1', events: [{ span: 4 }] }, ei: 0,
    cell: 'A:q1:0', noHighlight: true
  }, extra || {}));
}
{
  // п.1: нотная автопартия при вкл/выкл endAccent — идентична (акцент не применяется)
  const canned = [
    { at: 0, dur: 1, notes: [60], gain: 80 }, { at: 1, dur: 1, notes: [64], gain: 80 },
    { at: 2, dur: 1, notes: [67], gain: 80 }, { at: 3, dur: 1, notes: [69], gain: 80 },
  ];
  const aOn = bootAccomp({}, canned);   // старая песня: endAccent absent = вкл
  const aOff = bootAccomp({ endAccent: false }, canned);
  const rOn = planWith(aOn, [36, 55, 60, 64, 67]);
  const rOff = planWith(aOff, [36, 55, 60, 64, 67]);
  assert.strictEqual(J(rOn), J(rOff), 'ночная партия: опция endAccent не меняет ноты');
  assert.strictEqual(J(rOn.map((s) => s.notes)), J(canned.map((s) => s.notes)), 'ноты ровно из партии');   // cross-realm: через JSON
  // тот же аккорд блоковым рисунком: опция меняет последнюю атаку
  const bOn = bootAccomp({});
  const bOff = bootAccomp({ endAccent: false });
  const compact = [36, 55, 58, 64, 67];   // RH спан 12, 13-я=69 → спан 14 <= 15
  const sOn = planWith(bOn, compact), sOff = planWith(bOff, compact);
  assert(sOn[sOn.length - 1].notes.includes(69), 'блок: endAccent вкл → 13-я (69) в конце такта');
  assert(!sOff[sOff.length - 1].notes.includes(69), 'блок: endAccent выкл → 13-й нет');
  ok('п.1: нотная автопартия при вкл/выкл идентична; блоковый рисунок — с/без 13-й (сценарий сравнения нот)');
}
{
  // п.2: nobrass — первая нота события тоже правая рука; спан считаем по C.rh
  // ноты [36,50,60,64,67], bassMode nobrass: бас 36 отбрасывается, RH = [50,60,64,67].
  // 13-я сверху = 69:спан RH с ней = 19 > 15 → украшение пропускается.
  // (старый slice(1) брал бы rh=[60,64,67], спан 9 — добавил бы 69 сспаном 19)
  const A = bootAccomp({});   // endAccent absent = вкл (старая песня)
  const steps = planWith(A, [36, 50, 60, 64, 67], { bassMode: 'nobass' });
  const last = steps[steps.length - 1];
  assert(!last.notes.includes(69), 'nobrass: 13-я (69) дала быспан 19 > 15 — пропущена: ' + last.notes);
  // контроль: компактная RH при nobrass — акцент срабатывает (RH [55,60,64,67], спан с 69 = 14)
  const steps2 = planWith(A, [36, 55, 60, 64, 67], { bassMode: 'nobass' });
  assert(steps2[steps2.length - 1].notes.includes(69), 'nobrass + компактно: 13-я добавлена: ' + steps2[steps2.length - 1].notes);
  // контроль: тот же широкий набор с басом — то же решение (спан по всем нотам RH)
  const steps3 = planWith(A, [36, 50, 60, 64, 67]);
  assert(!steps3[steps3.length - 1].notes.includes(69), 'с басом: спан по RH [50,60,64,67] — 19 > 15, пропуск');
  ok('п.2: размах добавленной ноты проверяется по ВСЕМ нотам правой руки (C.rh), incl. nobrass/RH-only');
}

// ---------- п.3: честные формулировки про удвоения ----------
{
  assert(HTML.includes('не отличить'), 'комментарий: удвоение мелодии от двух голосов не отличить — честно сказано');
  assert(!HTML.includes('удвоение мелодии oktавой штрафом не задеваются'), 'прежнее сильное обещание убрано');
  assert(HTML.includes('cost += pp.fifths * 2 + pp.octaves * 4;'), 'штрафы мягкие, не запрет — без изменений');
  ok('п.3: обещание «удвоения не штрафуются» ослаблено до честного (мягкий штраф, не запрет)');
}

// ---------- статический контракт ----------
{
  const VER = (HTML.match(/· ver (\d+\.\d+)/) || [])[1];
  assert(VER && VER.length > 0, 'версия читается: ' + VER);
  assert(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').includes('struchord-v' + VER.split('.')[1]), 'CACHE_NAME парой с версией (динамический контракт)');
  ok('R7: версия ' + VER + ' + struchord-v' + VER.split('.')[1] + ' парой');
}
for (const [needle, label] of [
  // п.1
  ['акцент 13/9 к ней не применяется', 'accomp: комментарий — акцент не применяется к нотной партии'],
  // п.2
  ['var rh = (C && Array.isArray(C.rh) && C.rh.length) ? C.rh : st.notes.slice(1);', 'accomp: спан по C.rh (все ноты руки)'],
  // п.4
  ['function trackVariantList(trackId, chord, key, range, prev)', 'helper trackVariantList'],
  ['trackVariantList: trackVariantList,', 'helper экспортирован'],
  ['var variants=trackVariantList(trackId,chord,key,cache.range,cache.prev), notes=null;', 'linkedSelection резолв'],
  [': trackVariantList(trackId,name,(far.sec&&far.sec.key)||currentKey(),cache.range,null);', 'linkedSelection fallback'],
  ['var variants = trackVariantList(trackId, chordName, currentKey(), range, o.prev || null);', 'renderKeysVoicingSVG'],
  ['var variants = chord ? trackVariantList(active.track.id, chord, panelKey(), range, null) : [];', 'панель'],
  ['var variants = trackVariantList(trackId, chordName, key, range, prev);', 'voicingProvider'],
  ['keys.trackVariantList?keys.trackVariantList(id,chord,key,t.keyRange(id),null)', 'selectedShape'],
  ['K.trackVariantList ? K.trackVariantList(track.id, chord, key, T.keyRange(track.id), null)', 'авто-модуль'],
  ["t.voicings[key] = n; t.voicingsVersion = 2;", 'setVoicing пишет v2'],
  ["t.voicings['v:' + chord] = n;\n      t.voicingsVersion = 2;", 'setVoicingForChord пишет v2'],
  ['raw.voicingsVersion===2 ? {voicingsVersion:2} : {}', 'sanitize: v2 сохраняется, absent = v1'],
  ['{linkedVoicings:true, endAccent:false, voicingsVersion:2, saturation:50}', 'новая дорожка: voicingsVersion:2, насыщенность 50 (0.795)'],
]) {
  assert(HTML.includes(needle) || ACCOMP.includes(needle), 'нет: ' + label + ' :: ' + needle.slice(0, 60));
}
ok('п.4: voicingsVersion во всех звуковых путях + запись v2 при ручном выборе; п.1/2 — на месте');
// 0.795 (№22): чекбокс 13/9 (accRow) убран из UI; оговорка про нотную партию остаётся в комментарии кода выше.
assert(!HTML.includes('accRow.title='), 'чекбокс 13/9 с title убран из UI (0.795)');
assert(!HTML.includes("acc.id='b39AutoEndAccent'"), 'id #b39AutoEndAccent убран (0.795)');

console.log('\n0.794 (ревью №2, доведение): все проверки пройдены (' + groups + ' групп)');
