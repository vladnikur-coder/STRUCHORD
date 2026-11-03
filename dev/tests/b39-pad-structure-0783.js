'use strict';
// 0.783 · B-111: pad на повторах и переходах между секциями.
//
// 0.782 угадывал «следующий аккорд» по плоскому списку sec.squares и не знал
// о sq.repeat / sec.repeat, вольтах, D.C./D.S./Coda, зацикливании и переходе
// в следующую секцию. На повторе план ставил слайд не в тот аккорд, на стыке
// секций не ставил вовсе, а лишние голоса гасли в КОНЦЕ новой ячейки — старый
// аккорд гудел поверх нового. Теперь плеер передаёт реальное следующее
// событие (findNextEvent на копиях счётчиков), а audio-слой гасит лишние
// голоса на границе.
//
// Проверяется без браузера: оба модуля грузятся в vm-песочнице с mock'ами
// Web Audio и модели песни. НЕ заменяет слуховую проверку владельцем.
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const RANGE = { low: 36, high: 84, size: 49 };

// A: q1(C,Am) ×2, q2(F,G) → B: q3(Dm,C). Подобрано так, что ни один
// штатный переход не создаёт «новую» ноту: при исправном плане реестр голосов
// должен оставаться ровно из четырёх источников на всём протяжении песни.
const V = {
  'A:q1:0': { chord: 'C', notes: [48, 55, 60, 64] },
  'A:q1:1': { chord: 'Am', notes: [45, 55, 60, 64] },
  'A:q2:0': { chord: 'F', notes: [45, 53, 57, 60] },
  'A:q2:1': { chord: 'G', notes: [43, 55, 59, 62] },
  'B:q3:0': { chord: 'Dm', notes: [50, 57, 62, 65] },
  'B:q3:1': { chord: 'C', notes: [48, 55, 60, 64] }
};
const q1 = { id: 'q1', repeat: 2, events: [{ chord: 'C', span: 4 }, { chord: 'Am', span: 4 }] };
const q2 = { id: 'q2', events: [{ chord: 'F', span: 4 }, { chord: 'G', span: 4 }] };
const q3 = { id: 'q3', events: [{ chord: 'Dm', span: 4 }, { chord: 'C', span: 4 }] };
const qE = { id: 'qE', events: [{ chord: null, span: 4 }] };   // пустая ячейка
const secA = { id: 'A', key: 'C', type: 'Verse', squares: [q1, q2] };
const secB = { id: 'B', key: 'C', type: 'Chorus', squares: [q3] };

function param() {
  return {
    value: 0, events: [],
    setValueAtTime(v, t) { this.events.push({ k: 'set', v, t }); this.value = v; return this; },
    exponentialRampToValueAtTime(v, t) { this.events.push({ k: 'ramp', v, t }); return this; },
    linearRampToValueAtTime(v, t) { this.events.push({ k: 'lin', v, t }); return this; },
    setValueCurveAtTime(c, t, d) { this.events.push({ k: 'curve', t, d, values: Array.from(c) }); return this; },
    cancelScheduledValues(t) { this.events.push({ k: 'cancel', t }); return this; },
    cancelAndHoldAtTime(t) { this.events.push({ k: 'hold', t }); return this; },
    setTargetAtTime(v, t, c) { this.events.push({ k: 'target', v, t, c }); return this; }
  };
}
function fakeBuffer() {
  const len = 22050, data = [new Float32Array(len)];
  return {
    numberOfChannels: 1, length: len, sampleRate: 44100, duration: 0.5,
    getChannelData: c => data[c]
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
  win.StruChordFormula = {
    chordFormula: () => ({
      tones: [{ semitones: 0, pitchClass: 0 }, { semitones: 4, pitchClass: 4 }, { semitones: 7, pitchClass: 7 }],
      rootPc: 0, bass: null
    })
  };
  const TRACK = {
    id: 1, instrument: 'keys', timbre: 'pad', volume: 100, mute: false, solo: false,
    linkedVoicings: true, voicings: {}, patterns: {}, chords: {}, bassRoles: {}
  };
  win.__track = TRACK;
  win.StruChordTracks = {
    state: () => ({ mainTrackId: 1, activeTrackId: 1, tracks: [TRACK] }),
    track: () => TRACK,
    cellKey: (s, q, i) => s.id + ':' + q.id + ':' + i,
    trackChord: (id, cell) => (V[cell] ? V[cell].chord : null),
    keyRange: () => RANGE, exactNotes: () => null, voicingForChord: () => null, bassRole: () => 'legacy'
  };
  win.StruChordKeys = {
    linkedSelection: (id, cell) => V[cell] ? { chord: V[cell].chord, notes: V[cell].notes.slice() } : null,
    voiceLead: () => null
  };
  const sources = [], gains = [];
  const ctx = {
    currentTime: 0, sampleRate: 44100, state: 'running',
    createBufferSource() {
      const s = {
        buffer: null, loop: false, loopStart: 0, loopEnd: 0, onended: null,
        playbackRate: param(), connect() {},
        start(t) { this.started = t; }, stop(t) { this.stopped = t; }
      };
      sources.push(s); return s;
    },
    createGain() { const g = { gain: param(), connect() {} }; gains.push(g); return g; },
    createBiquadFilter() { return { type: '', frequency: param(), Q: param(), gain: param(), connect() {} }; },
    createBuffer(ch, len, rate) {
      const d = []; for (let c = 0; c < ch; c++) d.push(new Float32Array(len));
      return { numberOfChannels: ch, length: len, sampleRate: rate, duration: len / rate, getChannelData: c => d[c] };
    },
    decodeAudioData() { return Promise.resolve(fakeBuffer()); }
  };
  const sandbox = vm.createContext(win);
  for (const f of ['keyboard-accompaniment.js', 'keyboard-audio.js'])
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
  win.__b39Modules.accomp(); win.__b39Modules.audio();
  win.StruChordAudio.setPatternPlanner(win.StruChordAccomp.plan);
  win.StruChordAudio.setVoicingProvider((chord, key, range, prev, trackId, cell) =>
    V[cell] ? V[cell].notes.slice() : null);
  return { win, ctx, sources, gains, A: win.StruChordAccomp, Audio: win.StruChordAudio, Bank: win.StruChordSampleBank };
}
function D(sec, sq, ei) { return { sec: sec, sq: sq, ei: ei, ev: sq.events[ei] }; }
function planAt(env, sec, sq, ei, cell, padNext) {
  const o = {
    trackId: 1, chord: V[cell].chord, key: 'C', range: RANGE, notes: V[cell].notes.slice(),
    ts: '4/4', span: 4, dur: 2, ev: sq ? sq.events[ei] : {}, sec: sec, sq: sq, ei: ei,
    cell: cell, noHighlight: true
  };
  if (padNext !== undefined) o.padNext = padNext;   // undefined = путь без плеера
  return env.A.plan(o);
}
function lastFade(g) {
  const r = g.gain.events.filter(e => e.k === 'ramp' && e.v === 0.0001);
  return r.length ? r[r.length - 1].t : null;
}

(async () => {
  const env = boot();
  const { A, Audio, Bank, ctx, sources, gains, win } = env;
  await Bank.load('pad', ctx);

  // ---- 1. plan() берёт реальное следующее событие -------------------------
  const pRepeat = planAt(env, secA, q1, 1, 'A:q1:1', D(secA, q1, 0));
  const repeatTo = pRepeat[pRepeat.length - 1].pad.map.filter(p => p.kind === 'glide').map(p => p.to);
  assert.deepStrictEqual(Array.from(repeatTo), [48], 'повтор ×2: слайд в C (48), а не в следующий квадрат F (53/57)');
  assert.equal(pRepeat[pRepeat.length - 1].pad.release, false, 'повтор — не тишина');
  console.log('  ok  повтор квадрата: слайд к реально следующему аккорду');

  const pSection = planAt(env, secA, q2, 1, 'A:q2:1', D(secB, q3, 0));
  const secMap = pSection[pSection.length - 1].pad.map;
  assert(secMap.some(p => p.kind === 'glide'), 'стык секций перетекает, а не держит все голоса');
  assert.deepStrictEqual(Array.from(secMap.filter(p => p.kind === 'glide').map(p => p.to).sort((a, b) => a - b)),
    [50, 57, 65], 'слайд идёт в первый аккорд секции B (Dm), а не в «ничего»');
  assert.equal(pSection[pSection.length - 1].pad.release, false, 'стык секций не гасится');
  console.log('  ok  переход A → B: перетекание к Dm, без затихания');

  // Повтор секции / D.C. / зацикливание: плеер уводит обратно к первой
  // ячейке секции A, а не «за пределы списка».
  const pJump = planAt(env, secB, q3, 0, 'B:q3:0', D(secA, q1, 0));
  const jumpTo = Array.from(pJump[pJump.length - 1].pad.map
    .filter(p => p.kind === 'glide').map(p => p.to).sort((a, b) => a - b));
  assert.deepStrictEqual(jumpTo, [48, 55, 60, 64], 'скачок назад ведёт к C, а не в тишину');
  assert.equal(pJump[pJump.length - 1].pad.release, false, 'скачок не гасит подложку');
  console.log('  ok  повтор секции / D.C.: слайд к первой ячейке, без гашения');

  const pEnd = planAt(env, secB, q3, 1, 'B:q3:1', null);
  assert.equal(pEnd[pEnd.length - 1].pad.release, true, 'конец песни гасит подложку');
  assert(pEnd[pEnd.length - 1].pad.map.every(p => p.kind === 'release'), 'все голоса уходят мягко');
  console.log('  ok  конец песни: мягкое гашение');

  const pEmpty = planAt(env, secA, q2, 0, 'A:q2:0', { sec: secA, sq: qE, ei: 0, ev: qE.events[0] });
  assert.equal(pEmpty[pEmpty.length - 1].pad.release, true, 'пустая следующая ячейка гасит линию');
  console.log('  ok  пустая ячейка: мягкое гашение без раннего слайда');

  const pHold = planAt(env, secA, q1, 0, 'A:q1:0', D(secA, q1, 0));
  assert(pHold[pHold.length - 1].pad.map.every(p => p.kind === 'hold'), 'повтор той же ячейки — hold, без слайда');
  console.log('  ok  повтор той же ячейки: hold без новой атаки');

  const pFallback = planAt(env, secA, q1, 1, 'A:q1:1');   // без плеера: превью/экспорт
  assert(Array.isArray(pFallback) && pFallback.length && pFallback[0].pad,
    'без padNext старый линейный путь работает (превью/экспорт не падают)');
  console.log('  ok  без плеера: запасной линейный путь жив');

  assert.equal(A.padGlideLead(), 0.35, 'опережение слайда не изменилось');
  win.__track.timbre = 'acoustic';
  const pAcoustic = planAt(env, secA, q1, 0, 'A:q1:0', D(secA, q1, 1));
  assert(pAcoustic.every(s => !s.pad), 'другие тембры pad-линии не получают');
  win.__track.timbre = 'pad';
  console.log('  ok  0,35 с и другие тембры не тронуты');

  // ---- 2. Реальный порядок воспроизведения --------------------------------
  // q1 ×2, затем q2, затем переход в секцию B и конец песни.
  const order = [
    [secA, q1, 0, 'A:q1:0', D(secA, q1, 1)],   // C → Am
    [secA, q1, 1, 'A:q1:1', D(secA, q1, 0)],   // Am → C  (повтор ×2)
    [secA, q1, 0, 'A:q1:0', D(secA, q1, 1)],   // C → Am  (второй проход)
    [secA, q1, 1, 'A:q1:1', D(secA, q2, 0)],   // Am → F  (повтор исчерпан)
    [secA, q2, 0, 'A:q2:0', D(secA, q2, 1)],   // F → G
    [secA, q2, 1, 'A:q2:1', D(secB, q3, 0)],   // G → Dm  (переход секции)
    [secB, q3, 0, 'B:q3:0', D(secB, q3, 1)],   // Dm → C
    [secB, q3, 1, 'B:q3:1', null]              // конец песни
  ];
  order.forEach(([sec, sq, ei, cell, padNext], i) => {
    const t = i * 2, n0 = sources.length;
    Audio.scheduleEvent(ctx, sec, sq, sq.events[ei], ei, t, 2, 120, '4/4', padNext);
    const added = sources.length - n0;
    assert.equal(added, i === 0 ? 4 : 0,
      `t=${t} ${cell}: новых источников ${added} (0.782 давал +3 на повторе и +4 на стыке секций)`);
  });
  assert.equal(sources.length, 4, 'ровно четыре живых голоса на всю песню');
  assert.equal(Audio.stats().liveVoices, 4, 'реестр не распадается');
  console.log('  ok  повтор и стык секций: ни одного лишнего источника, линия непрерывна');

  // Ни один голос не должен гаснуть или обрываться ДО конца песни.
  sources.forEach((s, k) => {
    const fade = lastFade(gains[k]);
    assert(fade !== null && Math.abs(fade - 16) < 1e-6,
      `src#${k}: гашение в ${fade}, а не в конце песни t=16`);
    assert(s.stopped >= 16 - 1e-6, `src#${k}: stop в ${s.stopped}, голос оборван раньше конца`);
  });
  console.log('  ok  старый аккорд не гудит поверх нового: гаснет только в t=16');

  const boundaries = [2, 4, 6, 8, 10, 12, 14, 16];
  sources.forEach((s, k) => {
    const curves = s.playbackRate.events.filter(e => e.k === 'curve');
    const seen = new Set();
    curves.forEach(c => {
      assert(boundaries.some(b => Math.abs(c.t + c.d - b) < 1e-6),
        `src#${k}: слайд приходит в ${c.t + c.d}, а не в границу ячейки`);
      assert(!seen.has(c.t), `src#${k}: две кривые на одной границе ${c.t}`);
      seen.add(c.t);
    });
    assert(curves.length > 0, `src#${k}: голос ни разу не переплыл`);
  });
  console.log('  ok  слайды приходят ровно в границы, без наложений');

  // ---- 3. Страховка: рассогласование плана гасит НА границе --------------
  const e2 = boot();
  await e2.Bank.load('pad', e2.ctx);
  // Первая ячейка готовит слайд в Dm, но реально дальше играет C: реестр
  // расходится с планом (так бывает при правке войсинга на ходу / скачке).
  e2.Audio.scheduleEvent(e2.ctx, secA, q1, q1.events[0], 0, 0, 2, 120, '4/4', D(secB, q3, 0));
  e2.Audio.scheduleEvent(e2.ctx, secA, q1, q1.events[0], 0, 2, 2, 120, '4/4', D(secA, q1, 1));
  const stale = e2.sources.filter(s => s.started === 0);
  assert.equal(stale.length, 4, 'четыре старых голоса');
  stale.forEach((s, i) => {
    const fade = lastFade(e2.gains[e2.sources.indexOf(s)]);
    assert(fade !== null && Math.abs(fade - 2.12) < 1e-6,
      `старый голос#${i} гаснет в ${fade}, а должен на границе 2 + 0,12`);
    assert(Math.abs(s.stopped - 2.13) < 1e-6, `старый голос#${i} живёт до ${s.stopped}`);
  });
  assert.equal(e2.sources.filter(s => s.started === 2).length, 4, 'четыре новых голоса на границе');
  console.log('  ok  при рассогласовании плана лишние голоса гаснут на границе, а не в конце ячейки');

  // ---- 4. Контракт с плеером (статическая проверка HTML) -----------------
  const html = fs.readFileSync(path.join(ROOT, 'STRUCHORD.html'), 'utf8');
  assert(html.includes('· ver 0.783'), 'версия в шапке');
  const iPrev = html.indexOf('const previewEvent = findNextEvent(');
  const iCall = html.indexOf('StruChordAudio.scheduleEvent(');
  assert(iPrev >= 0 && iCall > iPrev, 'реальное следующее событие считается ДО планирования звука');
  assert.equal(html.split('const previewEvent = findNextEvent(').length - 1, 1,
    'findNextEvent для превью вызывается один раз (счётчики не удваиваются)');
  assert(/evStart, dur, bpm, ts, padNext\)/.test(html), 'padNext передан в scheduleEvent');
  assert(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').includes("struchord-v783"),
    'R7: кэш выложен парой с версией');
  console.log('  ok  плеер отдаёт padNext до звука, один расчёт, версия/кэш парой');

  console.log('\nB-111 / 0.783: повторы и переходы между секциями — ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ');
})().catch(e => { console.error('ПРОВАЛ:', e && e.stack || e); process.exit(1); });
