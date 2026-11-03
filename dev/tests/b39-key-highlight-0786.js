'use strict';
// 0.786 · B-114: подсветка клавиш показывает ЗВУЧАЩИЙ аккорд.
//
// Жалоба владельца после принятой 0.785 («звук хорош»): «но теперь на
// клавишах подсветка не совпадает с тем, что звучит при воспроизведении».
// Уточнения: `ahead` — горят ноты СЛЕДУЮЩЕГО аккорда заранее; `panel` —
// панель клавиш; `by_chord` — «по аккорду, смена на щелчке»; `switch_clean`
// — уходящие гаснут сразу на щелчке; `full`; `final_yes`.
//
// Read-only замер (4/4 @120, C -> Am -> F, щелчки 2,000 / 4,000 с) ДО правки:
//
//   t=1,00  звучит C  [48,55,60,64]  горело [45,55,60,64]  (уже Am)
//   t=2,05  звучит 48->45            горело [45,53,57,60]  (уже F)
//   t=3,00  звучит Am                горело [45,53,57,60]  (уже F)
//   t=4,05  звучит переход           горело []             (пустота)
//   новая нота 67 подсвечена с t=0, а звучит только с t=2.
//
// Причина: padGlide() ставит v.midi = toMidi (ноту СЛЕДУЮЩЕГО аккорда) ещё
// в момент планирования карты, а подсветка в padStep() читала v.midi. До
// 0.785 звук подъезжал к этой ноте перед щелчком; после переноса перехода
// НА щелчок звук весь такт остаётся старым — опережение стало целой ячейкой.
//
// Здесь проверяются РЕАЛЬНАЯ очередь keyHighlights из keyboard-audio.js
// (через фейковую панель #b39KeysPanel и тик по часам AudioContext) и
// РЕАЛЬНЫЕ события Web Audio. НЕ заменяет визуальную проверку владельцем.
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(ROOT, 'STRUCHORD.html'), 'utf8');
const ACCOMP = fs.readFileSync(path.join(ROOT, 'keyboard-accompaniment.js'), 'utf8');
const AUDIO = fs.readFileSync(path.join(ROOT, 'keyboard-audio.js'), 'utf8');
let groups = 0;
const ok = (msg) => { groups++; console.log('  ok  ' + msg); };

// ---------------------------------------------------------------------------
// 1. Статический контракт: звук 0.785 не тронут, подсветка больше не читает
//    подготовленную будущую ноту, версия и кэш выложены парой (R7).
// ---------------------------------------------------------------------------
const VER = (HTML.match(/· ver (\d+\.\d+)/) || [])[1];
assert.equal(VER, '0.786', 'версия в шапке 0.786');
assert(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').includes('struchord-v786'),
  'R7: кэш выложен парой с HTML');
assert(AUDIO.includes('var nextLine = [], used = [], litNotes = [];'),
  'padStep: список litNotes');
assert(AUDIO.includes('litNotes.push(p.from);') &&
  /litNotes\.forEach\(function \(m\) \{\s*\n\s*scheduleKeyHighlight\(ctx, channel, m, start, dur\);/.test(AUDIO),
  'padStep: подсветка берёт p.from и остаётся в [start, start + dur]');
assert(!AUDIO.includes('scheduleKeyHighlight(ctx, channel, v.midi'),
  '0.785-чтение v.midi для подсветки удалено');
// Звуковое расписание 0.785 — ни одного изменения.
assert(AUDIO.includes('var boundary = start + dur;') && AUDIO.includes('var end = boundary + lead;'),
  'padStep: boundary + lead цел');
assert(AUDIO.includes('padGlide(v, p.to, end - lead, end)') &&
  AUDIO.includes('padRelease(v, end - lead, end)') &&
  AUDIO.includes('padVoice(ctx, target, p.to, end - lead, end, level, lead)'),
  'изгиб / уход / наплыв по-прежнему ставятся относительно end');
assert(AUDIO.includes('v.midi = toMidi; v.rate = target;'), 'padGlide не переписан');
assert(ACCOMP.includes('var PAD_GLIDE_BEAT_FRACTION = 1 / 3;') &&
  ACCOMP.includes('var PAD_GLIDE_LEAD = 0.35;'),
  'длина ⅓ доли и предел 0,35 с не изменились');
assert(HTML.includes('const padNext = previewEvent ?'), 'реальный padNext 0.783 цел');
assert(HTML.includes('let metronomeGridKey = null;') && HTML.includes('metronomeKeyFor(ts, bpm)'),
  'часы метронома 0.784 целы');
ok('статический контракт: 0.786 + кэш, litNotes = p.from, звук 0.785 цел');

// ---------------------------------------------------------------------------
// 2. Песочница: реальные модули + панель клавиш, тики по часам AudioContext
// ---------------------------------------------------------------------------
function param(kind) {
  return {
    value: 0, events: [],
    setValueAtTime(v, t) { this.events.push({ k: 'set', v, t, kind }); this.value = v; return this; },
    exponentialRampToValueAtTime(v, t) { this.events.push({ k: 'ramp', v, t, kind }); return this; },
    linearRampToValueAtTime(v, t) { this.events.push({ k: 'lin', v, t, kind }); return this; },
    setValueCurveAtTime(c, t, d) {
      this.events.push({ k: 'curve', t, d, v0: c[0], v1: c[c.length - 1], kind }); return this;
    },
    cancelScheduledValues(t) { this.events.push({ k: 'cancel', t, kind }); return this; },
    cancelAndHoldAtTime(t) { this.events.push({ k: 'hold', t, kind }); return this; },
    setTargetAtTime(v, t, c) { this.events.push({ k: 'target', v, t, kind }); return this; }
  };
}
const KEY_MIDIS = [36, 38, 40, 41, 43, 45, 48, 53, 55, 57, 59, 60, 62, 64, 67];

function boot() {
  const win = {};
  win.window = win; win.console = console;
  // Панель клавиш 0.763: запоминаем, какие rect[data-midi] горят.
  const keys = KEY_MIDIS.map(midi => {
    const set = new Set();
    return { midi, getAttribute: () => String(midi),
      classList: { toggle(c, on) { if (on) set.add(c); else set.delete(c); } },
      has: c => set.has(c) };
  });
  const body = { classList: { toggle() {} } };
  const panel = {
    querySelector: sel => sel === '.b39-keys-body' ? body : null,
    querySelectorAll: () => keys
  };
  win.document = { querySelector: sel => sel === '#b39KeysPanel' ? panel : null };
  // В модуле есть и другие таймеры (загрузка сэмплов). Нужен только тик
  // подсветки: иначе посторонний таймер перезаписывает его и замер врёт.
  const env = { pending: null, seq: 0, keys };
  win.setTimeout = (fn) => {
    if (fn && fn.name === 'tickKeyHighlights') env.pending = fn;
    return ++env.seq;
  };
  win.clearTimeout = () => { env.pending = null; };
  win.fetch = u => String(u).indexOf('manifest') >= 0
    ? Promise.resolve({ ok: true, json: () => Promise.resolve({ pad: [{ midi: 60, file: 'pad/60.mp3' }] }) })
    : Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });
  win.mixerChannelForVoice = () => ({ input: { gain: { value: 0 } }, dry: {} });
  win.songStore = { subscribe: () => {} };
  win.StruChordFormula = { chordFormula: () => ({
    tones: [{ semitones: 0, pitchClass: 0 }, { semitones: 4, pitchClass: 4 }, { semitones: 7, pitchClass: 7 }],
    rootPc: 0, bass: null }) };
  const TRACK = { id: 1, instrument: 'keys', timbre: 'pad', volume: 100, mute: false, solo: false,
    linkedVoicings: true, voicings: {}, patterns: {}, chords: {}, bassRoles: {} };
  win.__track = TRACK;
  const V = {};
  win.StruChordTracks = {
    state: () => ({ mainTrackId: 1, activeTrackId: 1, tracks: [TRACK] }), track: () => TRACK,
    cellKey: (s, q, i) => s.id + ':' + q.id + ':' + i,
    trackChord: (id, cell) => V[cell] ? V[cell].chord : null,
    keyRange: () => ({ low: 36, high: 84, size: 49 }), exactNotes: () => null,
    voicingForChord: () => null, bassRole: () => 'legacy'
  };
  win.StruChordKeys = {
    linkedSelection: (id, cell) => V[cell] ? { chord: V[cell].chord, notes: V[cell].notes.slice() } : null,
    voiceLead: () => null
  };
  const sources = [], gains = [];
  const ctx = {
    currentTime: 0, sampleRate: 44100, state: 'running',
    createBufferSource() {
      const s = { buffer: null, loop: false, loopStart: 0, loopEnd: 0, onended: null,
        playbackRate: param('rate'), connect() {}, start(t) { this.started = t; }, stop(t) { this.stopped = t; } };
      sources.push(s); return s;
    },
    createGain() { const g = { gain: param('gain'), connect() {} }; gains.push(g); return g; },
    createBiquadFilter() { return { type: '', frequency: param('f'), Q: param('q'), gain: param('g'), connect() {} }; },
    createBuffer(ch, len, rate) {
      const d = []; for (let c = 0; c < ch; c++) d.push(new Float32Array(len));
      return { numberOfChannels: ch, length: len, sampleRate: rate, duration: len / rate, getChannelData: c => d[c] };
    },
    decodeAudioData() {
      return Promise.resolve({ numberOfChannels: 1, length: 22050, sampleRate: 44100,
        duration: 0.5, getChannelData: () => new Float32Array(22050) });
    }
  };
  const sandbox = vm.createContext(win);
  vm.runInContext(ACCOMP, sandbox, { filename: 'keyboard-accompaniment.js' });
  vm.runInContext(AUDIO, sandbox, { filename: 'keyboard-audio.js' });
  win.__b39Modules.accomp(); win.__b39Modules.audio();
  win.StruChordAudio.setPatternPlanner(win.StruChordAccomp.plan);
  win.StruChordAudio.setVoicingProvider((chord, key, range, prev, trackId, cell) =>
    V[cell] ? V[cell].notes.slice() : null);
  Object.assign(env, { win, ctx, sources, gains, V, A: win.StruChordAccomp,
    Audio: win.StruChordAudio, Bank: win.StruChordSampleBank });
  return env;
}
function setup(env, cells) {
  cells.forEach(c => { env.V[c.id] = { chord: c.chord, notes: c.notes }; });
  const sq = { id: 'q1', events: cells.map(c => ({ chord: c.chord, span: 4 })) };
  const sec = { id: 's1', key: 'C', type: 'Verse', squares: [sq] };
  return { sq, sec, next: (i) => i + 1 < cells.length
    ? { sec, sq, ei: i + 1, ev: sq.events[i + 1] } : null };
}
function cell(env, scene, i, t, dur, bpm, ts) {
  env.Audio.scheduleEvent(env.ctx, scene.sec, scene.sq, scene.sq.events[i], i,
    t, dur, bpm || 120, ts || '4/4', scene.next(i));
}
function lit(env) {
  return env.keys.filter(k => k.has('b39-key-sounding')).map(k => k.midi);
}
function advance(env, t) {
  env.ctx.currentTime = t;
  const fn = env.pending; env.pending = null;
  if (fn) fn();
  return lit(env);
}
function curves(env) {
  const out = [];
  env.sources.forEach((s, i) => s.playbackRate.events.forEach(e => {
    if (e.k === 'curve') out.push(Object.assign({ src: i }, e));
  }));
  return out;
}
const LEAD = 1 / 6;   // ⅓ четверти при 120 BPM
const C = [48, 55, 60, 64], AM = [45, 55, 60, 64], F = [45, 53, 57, 60];
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

(async () => {
  // ---- 3. Главный замер: C -> Am -> F, подсветка по звучащему аккорду -----
  const env = boot();
  await env.Bank.load('pad', env.ctx);
  const scene = setup(env, [
    { id: 's1:q1:0', chord: 'C', notes: C },
    { id: 's1:q1:1', chord: 'Am', notes: AM },
    { id: 's1:q1:2', chord: 'F', notes: F }
  ]);
  // Планируем все три ячейки заранее, как это делает плеер (за 120 мс).
  cell(env, scene, 0, 0, 2, 120, '4/4');
  cell(env, scene, 1, 2, 2, 120, '4/4');
  cell(env, scene, 2, 4, 2, 120, '4/4');

  assert(same(advance(env, 1.00), C), 't=1,00: звучит C — горит C, а не Am');
  assert(same(advance(env, 1.99), C), 't=1,99: перед щелчком всё ещё C');
  console.log('       t=1,00  звучит C   подсвечено ' + JSON.stringify(C) +
    '  (до 0.786 было [45,55,60,64])');
  ok('середина ячейки: подсветка перестала опережать звук на целый аккорд');

  assert(same(advance(env, 2.00), AM), 't=2,00: смена ровно на щелчке');
  assert(same(advance(env, 2.05), AM), 't=2,05: во время изгиба уже Am, не F и не пусто');
  assert(same(advance(env, 2.30), AM), 't=2,30: Am пришёл — горит Am');
  assert(same(advance(env, 3.00), AM), 't=3,00: середина Am — горит Am, а не F');
  console.log('       t=3,00  звучит Am  подсвечено ' + JSON.stringify(AM) +
    '  (до 0.786 было [45,53,57,60])');
  ok('переключение ровно на щелчке; весь такт Am не показывает F');

  assert(same(advance(env, 4.00), F), 't=4,00: смена на F на втором щелчке');
  assert(same(advance(env, 4.05), F), 't=4,05: пустоты на стыке больше нет');
  assert(same(advance(env, 5.00), F), 't=5,00: середина F');
  assert(same(advance(env, 6.01), []), 't=6,01: после конца песни подсветка гаснет');
  console.log('       t=4,05  звучит переход  подсвечено ' + JSON.stringify(F) +
    '  (до 0.786 было [])');
  ok('второй стык: F на щелчке, без провала панели');

  // ---- 4. Звук 0.785 НЕ изменился ------------------------------------------
  const cs = curves(env);
  assert.equal(cs.length, 3, 'три изгиба: C->Am и два Am->F');
  assert(cs.filter(c => Math.abs(c.t - 2) < 1e-9 && Math.abs(c.d - LEAD) < 1e-9).length === 1,
    'изгиб 2,000 → 2,167 с на месте');
  assert(cs.filter(c => Math.abs(c.t - 4) < 1e-9 && Math.abs(c.d - LEAD) < 1e-9).length === 2,
    'изгибы 4,000 → 4,167 с на месте');
  assert.equal(env.sources.length, 4, 'ровно 4 источника: лишних нет');
  assert(env.sources.every(s => s.stopped > 4 + LEAD), 'голоса живут через границу');
  ok('звуковое расписание 0.785 побайтно прежнее: 2,000→2,167 / 4,000→4,167, 4 голоса');

  // ---- 5. Новая нота: больше не загорается за такт до своего звучания -----
  {
    const e = boot();
    await e.Bank.load('pad', e.ctx);
    const sc = setup(e, [
      { id: 's1:q1:0', chord: 'C', notes: [60, 64] },
      { id: 's1:q1:1', chord: 'Cadd9', notes: [60, 64, 67] },
      { id: 's1:q1:2', chord: null, notes: null }
    ]);
    cell(e, sc, 0, 0, 2, 120, '4/4');
    cell(e, sc, 1, 2, 2, 120, '4/4');
    assert(same(advance(e, 0.50), [60, 64]), 't=0,50: ноты 67 ещё нет — она не звучит');
    assert(same(advance(e, 1.99), [60, 64]), 't=1,99: перед щелчком 67 всё ещё не горит');
    assert(same(advance(e, 2.00), [60, 64, 67]), 't=2,00: 67 загорелась со своим звуком');
    assert(same(advance(e, 2.05), [60, 64, 67]), 't=2,05: 67 не погасла на изгибе');
    const starts = e.sources.map(s => s.started).filter(t => t > 0.001);
    assert(starts.length === 1 && Math.abs(starts[0] - 2) < 1e-9,
      'звук новой ноты по-прежнему стартует на щелчке');
    ok('новая нота 67: подсвечена с t=2, а не с t=0; звук не сдвинут');
  }

  // ---- 6. Уходящие (release) ноты горят до щелчка и гаснут на нём ---------
  {
    const e = boot();
    await e.Bank.load('pad', e.ctx);
    const sc = setup(e, [
      { id: 's1:q1:0', chord: 'C', notes: [48, 55, 60, 64] },
      { id: 's1:q1:1', chord: 'low', notes: [36, 38, 40, 41] }
    ]);
    cell(e, sc, 0, 0, 2, 120, '4/4');
    cell(e, sc, 1, 2, 2, 120, '4/4');
    assert(same(advance(e, 1.50), [48, 55, 60, 64]),
      't=1,50: уходящие ноты подсвечены, пока звучат');
    const at2 = advance(e, 2.00);
    assert(same(at2, [36, 38, 40, 41]),
      't=2,00: switch_clean — уходящие погасли сразу на щелчке; получено ' + JSON.stringify(at2));
    ok('release-голоса подсвечены до удара и сняты на ударе');
  }

  // ---- 7. Разные темпы/размеры: интервал подсветки = [start, start+dur] ---
  {
    const cases = [
      { bpm: 120, ts: '4/4', dur: 2, label: '4/4 @120' },
      { bpm: 180, ts: '4/4', dur: 4 / 3, label: '4/4 @180' },
      { bpm: 120, ts: '6/8', dur: 1.5, label: '6/8 @120' },
      { bpm: 120, ts: '4/4', dur: 0.5, label: 'короткая ячейка' }
    ];
    for (const c of cases) {
      const e = boot();
      await e.Bank.load('pad', e.ctx);
      const sc = setup(e, [
        { id: 's1:q1:0', chord: 'C', notes: C },
        { id: 's1:q1:1', chord: 'Am', notes: AM }
      ]);
      cell(e, sc, 0, 0, c.dur, c.bpm, c.ts);
      cell(e, sc, 1, c.dur, c.dur, c.bpm, c.ts);
      assert(same(advance(e, c.dur * 0.5), C), c.label + ': середина — C');
      assert(same(advance(e, c.dur - 0.001), C), c.label + ': перед щелчком — C');
      assert(same(advance(e, c.dur), AM), c.label + ': на щелчке — Am');
    }
    ok('120 / 180 / 6/8 / короткая ячейка: смена подсветки на каждом щелчке');
  }

  // ---- 8. Не-pad тембры: legacy-подсветка playNote не тронута -------------
  assert(/scheduleKeyHighlight\(ctx, channel, midi, start, dur, highlightOwner\);/.test(AUDIO),
    'playNote по-прежнему подсвечивает свою ноту');
  assert(/function refreshKeyHighlights\(\)/.test(AUDIO) &&
    /n\.end>now/.test(AUDIO) && /n\.start<=now/.test(AUDIO),
    'фильтр актуальных нот по часам AudioContext не переписан');
  ok('очередь keyHighlights, playNote и фильтр по часам не переписаны');

  console.log('\n0.786 · B-114: ' + groups + ' групп — ВСЕ ЗЕЛЁНЫЕ');
})().catch(e => { console.error('ПРОВАЛ:', e && e.stack || e); process.exit(1); });
