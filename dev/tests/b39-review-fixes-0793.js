'use strict';
// 0.793 · правки по ревью преподавателя:
//  1) единый потолок размаха 15 п/т, без обещаний удобства;
//  2) «Широко» = раздвижение теми же нотами (без удвоения), только если спан вырос и <= 15;
//  3) подписи «Правая рука: i/n» (бас не меняется);
//  4) parallelPerfects чинит обнаружение квинт (mod12 без min-свёртки), мягкие раздельные штрафы;
//  5) акцент 13/9 — опция endAccent (новые дорожки: выкл; старые песни: как в 0.789),
//     добавленная нота проходит проверку размаха <= 15.
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
const pcs = (a) => a.map((n) => ((n % 12) + 12) % 12).sort((x, y) => x - y);

// ---------- vm: блок keys-модуля (mod12…listVoicingVariants) ----------
const START = '  function mod12(n) { return ((n % 12) + 12) % 12; }\n  function firstMidiWithPc';
const END = '\n  function motionCost';
const i0 = HTML.indexOf(START), i1 = HTML.indexOf(END, i0);
assert(i0 > 0 && i1 > i0);
const slice = HTML.slice(i0, i1);
const FORMULAS = {
  C: { rootPc: 0, bass: null, tones: [{ degree: 1, semitones: 0 }, { degree: 3, semitones: 4 }, { degree: 5, semitones: 7 }] },
  Am: { rootPc: 9, bass: null, tones: [{ degree: 1, semitones: 0 }, { degree: 3, semitones: 3 }, { degree: 5, semitones: 7 }] },
};
const sb = { formula: () => ({ chordFormula: (n) => FORMULAS[n] || null }) };
vm.createContext(sb);
vm.runInContext(slice + '\nthis.X={voicingVariantStructure,listVoicingVariants,generateKeysVoicings,handLimit};', sb);
const X = sb.X;

// ---------- vm: parallelPerfects ----------
const p0 = HTML.indexOf('  /** Параллельные совершенные интервалы');
const p1 = HTML.indexOf('  /** Все позиции аккорда', p0);
assert(p0 > 0 && p1 > p0);
const sb2 = {};
vm.createContext(sb2);
vm.runInContext('function mod12(n){return ((n%12)+12)%12;}\n' + HTML.slice(p0, p1) + '\nthis.PP=parallelPerfects;', sb2);
const PP = sb2.PP;

// 4. обнаружение квинт/октав (старая min-свёртка квинту не видела)
{
  const r1 = PP([{ from: 60, to: 62 }, { from: 67, to: 69 }]);   // параллельная квинта C-G -> D-A
  assert.deepStrictEqual(H(r1), { fifths: 1, octaves: 0 }, 'квинта 7->7 ловится: ' + J(r1));
  const r2 = PP([{ from: 60, to: 62 }, { from: 72, to: 74 }]);   // параллельная октава
  assert.deepStrictEqual(H(r2), { fifths: 0, octaves: 1 }, 'октава 0->0 ловится');
  const r3 = PP([{ from: 60, to: 60 }, { from: 67, to: 69 }]);   // неподвижный голос — не параллель
  assert.deepStrictEqual(H(r3), { fifths: 0, octaves: 0 }, 'стоячий голос не считается');
  const r4 = PP([{ from: 60, to: 65 }, { from: 67, to: 69 }]);   // разные стороны (противоход)
  assert.deepStrictEqual(H(r4), { fifths: 0, octaves: 0 }, 'противоход — не параллель');
  const r5 = PP([{ from: 60, to: 62 }, { from: 65, to: 67 }]);   // 5->5 (кварта) — не квинта
  assert.deepStrictEqual(H(r5), { fifths: 0, octaves: 0 }, 'кварта не считается квинтой');
  ok('parallelPerfects: квинты/октавы ловятся честно (mod12 без свёртки), стоячие и противоход — нет');
}
assert(HTML.includes('cost += pp.fifths * 2 + pp.octaves * 4;'), 'мягкие раздельные штрафы в cost');
assert(!HTML.includes('Math.min(mod12(b.from - a.from), 12 - mod12(b.from - a.from))'), 'min-свёртка (баг) убрана');
ok('штрафы: квинты ×2, октавы/унисоны ×4 — мягко, не запрет');

// 2. «Широко» = раздвижение теми же нотами
{
  const range = { low: 36, high: 96, size: 88 };
  const st = X.voicingVariantStructure('C', 'C', range);
  assert.strictEqual(st.list[0].join(','), '36,48,52,55', 'C: основное первым');
  st.slots.forEach((slot) => {
    if (slot.wide < 0) return;
    const b = st.list[slot.base], w = st.list[slot.wide];
    assert.strictEqual(w.length, b.length, 'широкое: столько же нот (без удвоения)');
    assert.deepStrictEqual(pcs(w), pcs(b), 'широкое: тот же состав (pc)');
    assert.strictEqual(w[0], b[0], 'широкое: бас не меняется');
    const sb2s = Math.max.apply(null, b.slice(1)) - Math.min.apply(null, b.slice(1));
    const sw = Math.max.apply(null, w.slice(1)) - Math.min.apply(null, w.slice(1));
    assert(sw > sb2s, 'широкое: размах больше базового');
    assert(sw <= 15, 'широкое: размах <= 15 (потолок генератора): ' + w.join(','));
  });
  const am = X.voicingVariantStructure('Am', 'C', range);
  assert.strictEqual(am.list[0].join(','), '45,57,60,64', 'Am: основное первым (A C E + бас A)');
  if (am.slots[0].wide >= 0) {
    const w0 = am.list[am.slots[0].wide];
    const span = Math.max.apply(null, w0.slice(1)) - Math.min.apply(null, w0.slice(1));
    assert(span > 7 && span <= 15, 'Am широкое: спан ' + span + ' (вырос с 7, потолок 15): ' + w0.join(','));
  }
  ok('«Широко» = раздвижение теми же нотами: состав/бас/число голосов сохранены, спан вырос и <= 15');
}
{
  // C-трезвучие: удобного широкого (спан <=15 и > базового) нет — широкого нет вообще
  const st = X.voicingVariantStructure('C', 'C', { low: 36, high: 96, size: 88 });
  assert.strictEqual(st.slots[0].wide, -1, 'C основное: широкого нет (C G E′ = 16 п/т — выше потолка)');
  for (const size of [25, 37, 49]) {
    const s2 = X.voicingVariantStructure('C', 'C', { low: 36, high: 36 + size - 1, size });
    assert(s2.slots.every((s) => s.wide === -1), 'size ' + size + ': широких нет');
  }
  ok('если удобного широкого нет — его нет (C на 88: спан 16 > 15; на 25/37/49 тоггл не предлагается)');
}

// ---------- vm: plan() с опцией endAccent и проверкой размаха ----------
function bootAccomp(trackExtra) {
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
function planWith(A, notes) {
  return A.plan({
    trackId: 1, chord: 'C13', key: 'C', range: { low: 36, high: 84, size: 49 },
    notes, ts: '4/4', span: 4, dur: 8, bpm: 120,
    ev: { span: 4 }, sec: { id: 'A', key: 'C' }, sq: { id: 'q1', events: [{ span: 4 }] }, ei: 0,
    cell: 'A:q1:0', noHighlight: true
  });
}
{
  const COMPACT = [36, 55, 58, 64, 67];   // RH спан 12; 13-я сверху = 69, спан с ней 14 <= 15
  const WIDE = [36, 55, 60, 64, 67, 70, 74]; // RH спан 19; 13-я = 81, спан 26 > 15
  // старая песня (поля endAccent нет) + компактные ноты: акцент как в 0.789
  let A = bootAccomp({});
  let steps = planWith(A, COMPACT);
  assert(steps[3].notes.includes(69), 'endAccent absent (старая песня) + компактно: 13-я (69) добавлена: ' + steps[3].notes);
  // новая дорожка (endAccent:false): акцента нет даже компактно
  A = bootAccomp({ endAccent: false });
  steps = planWith(A, COMPACT);
  assert(!steps[3].notes.includes(69), 'endAccent:false — 13/9 в конце такта не выделяется');
  assert(steps.every((s) => s.notes.every((n) => [0, 4, 7, 10, 2, 9].includes(((n % 12) + 12) % 12))), 'состав аккорда не тронут (9/13 в самом аккорде остаются)');
  // старая песня, но широкие ноты: добавленная 13-я не проходит проверку размаха — пропускается
  A = bootAccomp({});
  steps = planWith(A, WIDE);
  assert(!steps[3].notes.includes(81), 'широкие ноты: 13-я (81) дала бы спан 26 > 15 — украшение пропущено: ' + steps[3].notes);
  ok('акцент 13/9: опция endAccent (новые дорожки выкл, старые песни как в 0.789); проверка размаха <=15; состав аккорда не меняется');
}

// ---------- статический контракт ----------
{
  const VER = (HTML.match(/· ver (\d+\.\d+)/) || [])[1];
  assert(VER === '0.794', 'версия 0.794, а не ' + VER);
  assert(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').includes('struchord-v794'), 'v794');
  ok('R7: 0.794 + struchord-v794');
}
for (const [needle, label] of [
  // 0.795 (№22): счётчик «Правая рука: i/n · плотно/широко» убран вместе с тогглом.
  // 0.795 (№22): текст счётчика «плотно, широкого нет» убран вместе с тогглом.
  ["prev.setAttribute('aria-label', 'Предыдущее расположение')", 'стрелка ‹ «Предыдущее расположение»'],
  ["next.setAttribute('aria-label', 'Следующее расположение')", 'стрелка › «Следующее расположение»'],
  ["nav.setAttribute('aria-label', 'Расположение правой руки (бас не меняется)')", 'nav aria: бас не меняется'],
  ["Удобство зависит от размера руки, темпа и способа исполнения", 'оговорка про удобство вместо «играбельно»'],
  ['last-start>15', 'потолок размаха 15 в inversionCandidates'],
  ['span > 15) continue;', 'широкое: спан <= 15'],
  ['span <= baseSpan || span > 15', 'широкое: спан вырос относительно базового'],
  ['function setEndAccent(id,on)', 'setEndAccent'],
  ["{linkedVoicings:true, endAccent:false, voicingsVersion:2, saturation:50}", 'новая дорожка: endAccent выкл, voicingsVersion:2 (0.794), насыщенность 50 (0.795)'],
  ["raw.endAccent===false ? {endAccent:false} : {}", 'старые песни: поля нет = акцент как в 0.789'],
  ['function endAccentEnabled(o)', 'endAccentEnabled в plan-модуле'],
  ['Math.max(Math.max.apply(null, rh), ext) - Math.min.apply(null, rh) <= 15', 'проверка размаха для добавленной ноты'],
  ['if (endAccentEnabled(o)) applyExtensionAccent(single', 'гейт акцента в default-ветке'],
]) {
  assert(HTML.includes(needle) || ACCOMP.includes(needle), 'нет: ' + label);
}
assert(!HTML.includes('обращение \' + (cur2.inv'), 'старой подписи «обращение i/n» нет');
// 0.795 (№22): чекбокс «13/9 в конце такта» убран из UI — акцент идёт от ползунка насыщенности.
assert(!HTML.includes("acc.id='b39AutoEndAccent'"), 'чекбокс «Выделять 13/9 в конце такта» убран (0.795)');
assert(ACCOMP.includes('t.saturation >= 80'), 'акцент 13/9 теперь от насыщенности >= 80 (0.795)');
ok('UI/модель: toggl/счётчик убраны (0.795), endAccent plumbing, лимит 15 — на месте');

console.log('\n0.793 (ревью преподавателя, актуально на 0.794): все проверки пройдены (' + groups + ' групп)');
