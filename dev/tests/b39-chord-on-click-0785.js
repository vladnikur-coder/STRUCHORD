'use strict';
// 0.785 · B-113: смена аккорда НАЧИНАЕТСЯ на щелчке, а не до него.
//
// Жалоба владельца после 0.784: «аккорд сменяется раньше клика». Read-only
// замер (/tmp/pad-early-audit-0784.js, в репозиторий не вошёл) на 4/4 @120:
// высота pad начинала ползти в 1,833 с при щелчке 2,000 с (−167 мс),
// середина перемены 1,917 с (−83 мс). 0.784 укоротил заход с 350 до 167 мс,
// но не перенёс его — весь переход лежал ДО удара. Владелец уточнил: ≈⅓
// доли раньше, на каждом аккорде; выбрал «слайд на щелчке и после него».
//
// 0.785: в padStep() конец голоса = boundary + lead, поэтому те же вызовы
// padGlide/padRelease/padVoice ставят переход на [щелчок, щелчок + ⅓ доли].
//
// Здесь проверяются РЕАЛЬНЫЕ события Web Audio из keyboard-audio.js и
// реальные часы метронома из STRUCHORD.html в vm-песочнице. НЕ заменяет
// слуховую проверку владельцем с включённым метрономом.
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
// 1. Статический контракт
// ---------------------------------------------------------------------------
const VER = (HTML.match(/· ver (\d+\.\d+)/) || [])[1];
assert.equal(VER, '0.785', 'версия в шапке 0.785');
assert(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').includes('struchord-v785'),
  'R7: кэш выложен парой с HTML');
assert(AUDIO.includes('var boundary = start + dur;') && AUDIO.includes('var end = boundary + lead;'),
  'padStep: конец голоса отодвинут на длину перехода');
assert(/scheduleKeyHighlight\(ctx, channel, v\.midi, start, dur\)/.test(AUDIO),
  'подсветка клавиш осталась в рамках ячейки');
assert(/padGlide\(v, p\.to, end - lead, end\)/.test(AUDIO) &&
  /padRelease\(v, end - lead, end\)/.test(AUDIO) &&
  /padVoice\(ctx, target, p\.to, end - lead, end, level, lead\)/.test(AUDIO),
  'изгиб / уход / наплыв по-прежнему ставятся относительно end');
assert(ACCOMP.includes('var PAD_GLIDE_BEAT_FRACTION = 1 / 3;') &&
  ACCOMP.includes('var PAD_GLIDE_LEAD = 0.35;'),
  'длина ⅓ доли и предел 0,35 с не изменились');
assert(HTML.includes('const padNext = previewEvent ?'), 'реальный padNext 0.783 цел');
assert(HTML.includes('let metronomeGridKey = null;') && HTML.includes('metronomeKeyFor(ts, bpm)'),
  'часы метронома 0.784 целы');
assert(HTML.includes('playbackState.squareAnchorTime = evStart - getSquareEventOffsetSeconds'),
  'якорь фазы такта не тронут');
ok('статический контракт: версия/кэш, boundary+lead, 0.783/0.784 не сломаны');

// ---------------------------------------------------------------------------
// 2. Песочница с реальными модулями и запоминающими узлами Web Audio
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
function boot() {
  const win = {};
  win.window = win; win.document = undefined;
  win.setTimeout = () => 0; win.clearTimeout = () => {}; win.console = console;
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
  return { win, ctx, sources, gains, V, A: win.StruChordAccomp, Audio: win.StruChordAudio,
    Bank: win.StruChordSampleBank };
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
function curves(env) {
  const out = [];
  env.sources.forEach((s, i) => s.playbackRate.events.forEach(e => {
    if (e.k === 'curve') out.push(Object.assign({ src: i }, e));
  }));
  return out;
}
function fades(env) {
  const out = [];
  env.gains.forEach((g, i) => g.gain.events.forEach(e => {
    if (e.k === 'ramp' && e.v === 0.0001) out.push(Object.assign({ gain: i }, e));
  }));
  return out;
}
const LEAD = 1 / 6;   // ⅓ четверти при 120 BPM

(async () => {
  // ---- 2. Главное: изгиб начинается НА щелчке -----------------------------
  const env = boot();
  await env.Bank.load('pad', env.ctx);
  const scene = setup(env, [
    { id: 's1:q1:0', chord: 'C', notes: [48, 55, 60, 64] },
    { id: 's1:q1:1', chord: 'Am', notes: [45, 55, 60, 64] },
    { id: 's1:q1:2', chord: 'F', notes: [45, 53, 57, 60] }
  ]);
  cell(env, scene, 0, 0, 2, 120, '4/4');
  let cs = curves(env);
  assert.equal(cs.length, 1, 'ровно один голос переплывает C → Am');
  assert(Math.abs(cs[0].t - 2) < 1e-9, 'слайд НАЧИНАЕТСЯ ровно на щелчке t=2');
  assert(Math.abs(cs[0].t + cs[0].d - (2 + LEAD)) < 1e-9,
    'слайд заканчивается через ⅓ доли ПОСЛЕ щелчка');
  assert(cs.every(c => c.t >= 2 - 1e-9), 'нет ни одного изгиба ДО щелчка');
  assert(env.A.padGlideLeadFor({ bpm: 120, ts: '4/4', dur: 2 }) === LEAD,
    'длина перехода по-прежнему от доли метронома');
  ok('4/4 @120: изгиб 2,000 → 2,167 с, ДО щелчка смены нет');

  // До 0.785 та же кривая начиналась в 2 − ⅓ доли. Фиксируем разницу.
  const before = 2 - LEAD;
  assert(Math.abs(cs[0].t - before - LEAD) < 1e-9,
    'сдвиг относительно 0.784 ровно на длину перехода');
  console.log('       до 0.785: ' + (before * 1000).toFixed(0) +
    ' мс (−167 мс) → после: ' + (cs[0].t * 1000).toFixed(0) + ' мс (0 мс)');
  ok('сдвиг «аккорд раньше клика» устранён полностью');

  // ---- 3. Ни одно событие смены не запланировано раньше щелчка -------------
  cell(env, scene, 1, 2, 2, 120, '4/4');
  cs = curves(env);
  assert.equal(cs.length, 3, 'добавлились два изгиба Am → F');
  assert(cs.every(c => c.t >= 2 - 1e-9), 'ни одна кривая не уходит в «до щелчка»');
  const earlyFades = fades(env).filter(e => e.t > 1.9 && e.t < 2 - 1e-9);
  assert.equal(earlyFades.length, 0, 'старые ноты не начинают гаснуть до щелчка');
  const earlyStarts = env.sources.map(s => s.started).filter(t => t > 0 && t < 2 - 1e-9);
  assert.equal(earlyStarts.length, 0, 'новые ноты не наплывают до щелчка');
  assert.equal(env.sources.length, 4, 'лишних источников нет (0.783 не сломан)');
  ok('ни кривых, ни гашения, ни новых нот ДО щелчка; 4 голоса на всю цепочку');

  // Голоса живут через границу — иначе изгиб оборвался бы на ударе.
  assert(env.sources.every(s => s.stopped > 4 + LEAD),
    'голоса доживают до щелчка + ⅓ доли + хвост');
  ok('голоса протянуты за границу, переход не обрывается');

  // ---- 4. Новая нота и мягкое гашение — тоже строго на щелчке -------------
  {
    const e = boot();
    await e.Bank.load('pad', e.ctx);
    const sc = setup(e, [
      { id: 's1:q1:0', chord: 'C', notes: [60, 64] },
      { id: 's1:q1:1', chord: 'Cadd9', notes: [60, 64, 67] },
      { id: 's1:q1:2', chord: null, notes: null }
    ]);
    cell(e, sc, 0, 0, 2, 120, '4/4');
    const newStarts = e.sources.map(s => s.started).filter(t => t > 0.001);
    assert.equal(newStarts.length, 1, 'появилась ровно одна новая нота');
    assert(Math.abs(newStarts[0] - 2) < 1e-9, 'новая нота стартует НА щелчке t=2');
    cell(e, sc, 1, 2, 2, 120, '4/4');
    const release = fades(e).filter(x => x.t > 3.9 && x.t < 4.3);
    assert(release.length > 0, 'пустая следующая ячейка гасит линию');
    assert(release.every(x => x.t > 4 - 1e-9), 'гашение начинается не раньше щелчка t=4');
    assert(release.every(x => Math.abs(x.t - (4 + LEAD)) < 1e-9),
      'гашение идёт ⅓ доли ПОСЛЕ щелчка');
    ok('новая нота и мягкое гашение тоже начинаются на щелчке');
  }

  // ---- 5. Разные темпы и размеры ------------------------------------------
  {
    const cases = [
      { bpm: 120, ts: '4/4', dur: 2, lead: LEAD, label: '4/4 @120' },
      { bpm: 180, ts: '4/4', dur: 4 / 3, lead: 1 / 9, label: '4/4 @180' },
      { bpm: 120, ts: '6/8', dur: 1.5, lead: 0.25, label: '6/8 @120' },
      { bpm: 120, ts: '4/4', dur: 0.5, lead: 0.1, label: 'короткая ячейка' }
    ];
    for (const c of cases) {
      const e = boot();
      await e.Bank.load('pad', e.ctx);
      const sc = setup(e, [
        { id: 's1:q1:0', chord: 'C', notes: [48, 55, 60, 64] },
        { id: 's1:q1:1', chord: 'Am', notes: [45, 55, 60, 64] }
      ]);
      cell(e, sc, 0, 0, c.dur, c.bpm, c.ts);
      const cs2 = curves(e);
      assert(cs2.length > 0, c.label + ': слайд поставлен');
      assert(cs2.every(x => Math.abs(x.t - c.dur) < 1e-9),
        c.label + ': слайд начинается ровно на щелчке');
      assert(cs2.every(x => Math.abs(x.d - c.lead) < 1e-9),
        c.label + ': длина ровно от доли/предела');
      assert(e.sources.every(s => s.started <= c.dur + 1e-9),
        c.label + ': ни один голос не зазвучал раньше щелчка');
    }
    ok('120 / 180 / 6/8 / короткая ячейка: везде старт на щелчке');
  }

  // ---- 6. Повторы и стык секций: 0 лишних источников, как в 0.783 ----------
  {
    const e = boot();
    await e.Bank.load('pad', e.ctx);
    const cells = [
      { id: 's1:q1:0', chord: 'C', notes: [48, 55, 60, 64] },
      { id: 's1:q1:1', chord: 'Am', notes: [45, 55, 60, 64] },
      { id: 's1:q1:2', chord: 'F', notes: [45, 53, 57, 60] },
      { id: 's1:q1:3', chord: 'G', notes: [43, 55, 59, 62] },
      { id: 's1:q1:4', chord: 'C', notes: [48, 55, 60, 64] }
    ];
    const sc = setup(e, cells);
    for (let i = 0; i < cells.length; i++) {
      const n0 = e.sources.length;
      cell(e, sc, i, i * 2, 2, 120, '4/4');
      assert.equal(e.sources.length - n0, i === 0 ? 4 : 0,
        't=' + (i * 2) + ': лишний источник');
    }
    assert.equal(e.Audio.stats().liveVoices, 4, 'реестр голосов не распадается');
    const all = curves(e);
    assert(all.every(c => [2, 4, 6, 8].some(b => Math.abs(c.t - b) < 1e-9)),
      'все слайды начинаются на границах-щелчках');
    ok('5 ячеек, повтор и стык: 0 лишних источников, все слайды на щелчках');
  }

  // ---- 7. Реальные часы метронома: клик совпадает со стартом смены ---------
  {
    function grab(name, from) {
      const s = HTML.indexOf('function ' + name + '(', from || 0);
      let i = HTML.indexOf('{', s), d = 0, j = i;
      for (; j < HTML.length; j++) { if (HTML[j] === '{') d++; else if (HTML[j] === '}') { d--; if (!d) break; } }
      return HTML.slice(s, j + 1);
    }
    const helpers = [grab('parseTimeSig', HTML.indexOf('function parseTimeSig(ts) {')),
      grab('isCompoundMeter'), grab('getBeatGrouping')].join('\n');
    const start = HTML.indexOf('let metronomeGridKey = null;');
    const end = HTML.indexOf('// В момент первой грозовой ачивки', start);
    const clicks = [];
    const ctx = { currentTime: 0 };
    let pending = null, frameId = 0;
    const sb = { playbackState: { isPlaying: true, metronomeMuted: false }, playbackStartTime: 0,
      globalTimeSig: '4/4', ctx, metronomeFrameId: null,
      requestAnimationFrame(fn) { pending = fn; return ++frameId; },
      cancelAnimationFrame(id) { if (id === frameId) pending = null; },
      scheduleClick(c, t, acc) { clicks.push({ t, acc: !!acc, playedAt: c.currentTime }); } };
    vm.createContext(sb);
    vm.runInContext(helpers + '\n' + HTML.slice(start, end), sb,
      { filename: 'metronome-from-0785.html' });
    vm.runInContext('scheduleMetronomeEvents(ctx, 0, "4/4", 120, true)', sb);
    let guard = 0;
    while (ctx.currentTime < 4.5 && guard++ < 5000) {
      ctx.currentTime = Math.min(4.5, ctx.currentTime + 0.01);
      const fn = pending; pending = null; if (fn) fn();
    }
    const starts = curves(env).map(c => c.t);
    for (const t of starts) {
      const near = clicks.reduce((best, c) => Math.abs(c.t - t) < Math.abs(best - t) ? c.t : best, Infinity);
      assert(Math.abs(near - t) < 1e-9,
        'старт смены ' + t.toFixed(3) + ' не совпал с щелчком ' + near.toFixed(3));
    }
    assert(clicks.some(c => Math.abs(c.t - 2) < 1e-9 && c.acc), 'щелчок t=2 — сильная доля');
    ok('реальные часы метронома: каждый старт смены ровно на клике, 0 мс');
  }

  console.log('\n0.785 · B-113: ' + groups + ' групп — ВСЕ ЗЕЛЁНЫЕ');
})().catch(e => { console.error('ПРОВАЛ:', e && e.stack || e); process.exit(1); });
