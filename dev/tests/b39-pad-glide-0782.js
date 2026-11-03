'use strict';
// 0.782 · B-110: pad перетекает между аккордами, а не гаснет на стыке.
//
// Проверяется без браузера: оба модуля грузятся в vm-песочнице с mock'ами
// Web Audio и модели песни. Это НЕ заменяет слуховую проверку владельцем.
//
// Что именно проверяем:
//  * padVoiceMap — общие тоны держатся, отличающиеся ползут, лишние уходят;
//  * plan() — паузы перед границей нет, слайд только у последнего шага,
//    опережение 0,35 с, плотный жанр сохраняет второй шаг без перезапуска,
//    пустая следующая ячейка гасит линию, ручной рисунок не трогается,
//    другие тембры pad-метаданных не получают;
//  * звук — на второй ячейке общие тоны НЕ создают новых источников, один
//    голос получает smoothstep-кривую playbackRate, заканчивающуюся ровно
//    в границу, все источники доживают до конца ячейки (провала нет);
//    пустая ячейка рвёт линию, следующий аккорд начинает заново;
//    stopAll() чистит реестр.
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const RANGE = { low: 36, high: 84, size: 49 };

// C -> Am -> F -> (пусто) -> G. У C и Am три общих тона и один голос 48 -> 45,
// у Am и F два общих тона и два слайда. Пустая ячейка рвёт линию.
const CELLS = [
  { id: 's1:q1:0', chord: 'C', notes: [48, 55, 60, 64] },
  { id: 's1:q1:1', chord: 'Am', notes: [45, 55, 60, 64] },
  { id: 's1:q1:2', chord: 'F', notes: [45, 53, 57, 60] },
  { id: 's1:q1:3', chord: null, notes: null },
  { id: 's1:q1:4', chord: 'G', notes: [43, 55, 59, 62] }
];
const sq = { id: 'q1', events: CELLS.map(c => ({ chord: c.chord, span: 4 })) };
const sec = { id: 's1', key: 'C', type: 'Verse', squares: [sq] };
const VOICINGS = {};
CELLS.forEach(c => { if (c.notes) VOICINGS[c.id] = c.notes.slice(); });

function param() {
  return {
    value: 0, events: [],
    setValueAtTime(v, t) { this.events.push({ kind: 'set', v, t }); this.value = v; return this; },
    exponentialRampToValueAtTime(v, t) { this.events.push({ kind: 'ramp', v, t }); return this; },
    linearRampToValueAtTime(v, t) { this.events.push({ kind: 'lin', v, t }); return this; },
    setValueCurveAtTime(curve, t, d) {
      this.events.push({ kind: 'curve', values: Array.from(curve), t, d }); return this;
    },
    cancelScheduledValues(t) { this.events.push({ kind: 'cancel', t }); return this; },
    cancelAndHoldAtTime(t) { this.events.push({ kind: 'hold', t }); return this; },
    setTargetAtTime(v, t, c) { this.events.push({ kind: 'target', v, t, c }); return this; }
  };
}

function fakeBuffer() {
  const len = 22050, data = [new Float32Array(len)];
  return {
    numberOfChannels: 1, length: len, sampleRate: 44100, duration: len / 44100,
    getChannelData: c => data[c]
  };
}

function boot() {
  const win = {};
  win.window = win;
  win.document = undefined;              // boot() модулей выйдет раньше
  win.setTimeout = () => 0;
  win.clearTimeout = () => {};
  win.console = console;
  win.fetch = function (url) {
    if (String(url).indexOf('manifest') >= 0) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ pad: [{ midi: 60, file: 'pad/60.mp3' }] }) });
    }
    return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });
  };
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
    trackChord: (id, cell) => {
      const c = CELLS.find(x => x.id === cell);
      return c ? c.chord : null;
    },
    keyRange: () => RANGE,
    exactNotes: () => null,
    voicingForChord: () => null,
    bassRole: () => 'legacy'
  };
  win.StruChordKeys = {
    linkedSelection: (trackId, cell) => VOICINGS[cell]
      ? { chord: CELLS.find(x => x.id === cell).chord, notes: VOICINGS[cell].slice() }
      : null,
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
    createBiquadFilter() {
      return { type: '', frequency: param(), Q: param(), gain: param(), connect() {} };
    },
    createBuffer(ch, len, rate) {
      const data = []; for (let c = 0; c < ch; c++) data.push(new Float32Array(len));
      return {
        numberOfChannels: ch, length: len, sampleRate: rate, duration: len / rate,
        getChannelData: c => data[c]
      };
    },
    decodeAudioData() { return Promise.resolve(fakeBuffer()); }
  };

  const sandbox = vm.createContext(win);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'keyboard-accompaniment.js'), 'utf8'), sandbox,
    { filename: 'keyboard-accompaniment.js' });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'keyboard-audio.js'), 'utf8'), sandbox,
    { filename: 'keyboard-audio.js' });
  win.__b39Modules.accomp();
  win.__b39Modules.audio();
  win.StruChordAudio.setPatternPlanner(win.StruChordAccomp.plan);
  win.StruChordAudio.setVoicingProvider((chord, key, range, prev, trackId, cell) =>
    VOICINGS[cell] ? VOICINGS[cell].slice() : null);
  return { win, ctx, sources, gains, A: win.StruChordAccomp, Audio: win.StruChordAudio, Bank: win.StruChordSampleBank };
}

function planFor(env, idx, extra) {
  const c = CELLS[idx];
  return env.A.plan(Object.assign({
    trackId: 1, chord: c.chord, key: 'C', range: RANGE,
    notes: c.notes ? c.notes.slice() : [],
    ts: '4/4', span: 4, dur: 2, ev: { span: 4 }, sec: sec, sq: sq, ei: idx,
    cell: c.id, noHighlight: true
  }, extra || {}));
}

(async () => {
  const env = boot();
  const { A, Audio, Bank, ctx, sources, win } = env;

  // ---- 1. Чистая раскладка голосов ---------------------------------------
  const map = A.padVoiceMap([48, 55, 60, 64], [45, 55, 60, 64], 7);
  assert.equal(map.length, 4, 'четыре голоса на четыре');
  assert.equal(map.filter(p => p.kind === 'hold').length, 3, 'три общих тона держатся');
  const glide = map.filter(p => p.kind === 'glide');
  assert.equal(glide.length, 1, 'один голос переплывает');
  assert.equal(glide[0].from, 48);
  assert.equal(glide[0].to, 45);
  assert.equal(A.padGlideLead(), 0.35, 'опережение по замеру видео');
  const wide = A.padVoiceMap([60], [72], 7);
  assert(wide.some(p => p.kind === 'release') && wide.some(p => p.kind === 'new'),
    'скачок больше предела не превращается в сирену');
  const grown = A.padVoiceMap([60, 64], [60, 64, 67], 7);
  assert.equal(grown.filter(p => p.kind === 'new').length, 1, 'новая нота наплывает');
  console.log('  ok  padVoiceMap: hold / glide / release / new, предел интервала');

  // ---- 2. План ------------------------------------------------------------
  const p0 = planFor(env, 0);
  assert.equal(p0.length, 1, 'поп: одна атака на ячейку');
  assert.equal(p0[0].dur, 2, 'паузы перед границей больше нет');
  assert.equal(p0[0].timbre, 'pad');
  assert(p0[0].pad && p0[0].pad.final === true, 'последний шаг несёт слайд');
  assert(Math.abs(p0[0].pad.lead - 0.35) < 1e-9, 'опережение 0,35 с');
  const m0 = p0[0].pad.map;
  assert.equal(m0.filter(p => p.kind === 'hold').length, 3, 'C -> Am: три общих тона');
  assert.equal(m0.filter(p => p.kind === 'glide').length, 1, 'C -> Am: один слайд 48 -> 45');
  assert.deepStrictEqual(planFor(env, 0), p0, 'план детерминирован');
  console.log('  ok  plan: длительность до границы, слайд 0,35 с, детерминизм');

  const p1 = planFor(env, 1);
  assert.equal(p1[0].pad.map.filter(p => p.kind === 'hold').length, 2, 'Am -> F: два общих тона');
  assert.equal(p1[0].pad.map.filter(p => p.kind === 'glide').length, 2, 'Am -> F: два слайда');
  const p2 = planFor(env, 2);
  assert(p2[0].pad.release === true, 'пустая следующая ячейка гасит линию');
  assert(p2[0].pad.map.every(p => p.kind === 'release'), 'все голоса уходят мягко');
  const p4 = planFor(env, 4);
  assert(p4[0].pad.release === false, 'конец секции не выдумывает тишину');
  assert(p4[0].pad.map.every(p => p.kind === 'hold'), 'на границе секции без раннего слайда');
  console.log('  ok  plan: цепочка слайдов, пустая ячейка и граница секции');

  const funk = A.list().filter(p => /^perform-funk-/.test(p.id))[0];
  assert(funk, 'в каталоге есть perform-funk-*');
  const pf = planFor(env, 0, { pattern: { type: funk.id, subdivision: 2, swing: null } });
  assert.equal(pf.length, 2, 'плотный жанр сохраняет вторую атаку в плане');
  assert.equal(pf[0].pad.final, false, 'первая атака не несёт слайд');
  assert(pf[0].pad.map.every(p => p.kind === 'hold'), 'первая атака только продолжает голоса');
  assert.equal(pf[1].pad.final, true, 'слайд у последней атаки');
  console.log('  ok  plan: плотный жанр — два шага, перезапуска звука нет');

  const manual = planFor(env, 0, {
    pattern: { type: funk.id, subdivision: 2, swing: null, status: 'manual', steps: ['B', 'C', 'B', 'C'] }
  });
  assert(manual.length > 2 && manual.every(s => !s.pad), 'ручной рисунок не переписывается тембром');
  console.log('  ok  plan: ручной рисунок цел (0.779)');

  const track = win.__track;
  track.timbre = 'acoustic';
  const acoustic = planFor(env, 0);
  assert(acoustic.every(s => !s.pad), 'пианино не получает pad-линию');
  track.timbre = 'pad';
  console.log('  ok  plan: другие тембры не тронуты');

  // ---- 3. Живой звук ------------------------------------------------------
  await Bank.load('pad', ctx);
  assert(Bank.ready('pad'), 'банк pad загружен');
  const ev = i => sq.events[i];

  function allCurves() {
    const out = [];
    sources.forEach(s => s.playbackRate.events.forEach(e => { if (e.kind === 'curve') out.push(e); }));
    return out;
  }
  function checkGlide(c, fromMidi, toMidi, boundary) {
    assert(Math.abs(c.t - (boundary - 0.35)) < 1e-9, 'слайд начинается за 0,35 с до границы');
    assert(Math.abs(c.t + c.d - boundary) < 1e-9, 'слайд приходит ровно в границу');
    assert(c.values.length >= 8, 'кривая, а не скачок');
    assert(Math.abs(c.values[0] - Math.pow(2, (fromMidi - 60) / 12)) < 1e-6, 'начало от старой ноты');
    assert(Math.abs(c.values[c.values.length - 1] - Math.pow(2, (toMidi - 60) / 12)) < 1e-6, 'конец у новой ноты');
    const mid = c.values[Math.floor(c.values.length / 2)];
    const linear = (c.values[0] + c.values[c.values.length - 1]) / 2;
    assert(Math.abs(mid - linear) > 1e-6, 'S-кривая, а не линейный ход по времени');
  }

  // Ячейка C уже знает следующий аккорд (Am) и ставит слайд 48 -> 45
  // ЗА 0,35 с до границы t=2 — именно так выглядит изгиб в пиано-ролле.
  Audio.scheduleEvent(ctx, sec, sq, ev(0), 0, 0, 2, 120, '4/4');
  assert.equal(sources.length, 4, 'первая ячейка: четыре голоса');
  sources.forEach(s => {
    assert.equal(s.started, 0);
    assert(Math.abs(s.stopped - 2.36) < 1e-9, 'хвост запланирован, но не обрыв раньше границы');
  });
  let curves = allCurves();
  assert.equal(curves.length, 1, 'ровно один голос переплывает по высоте');
  checkGlide(curves[0], 48, 45, 2);
  console.log('  ok  audio: линия создана, слайд C -> Am за 0,35 с до границы t=2');

  // Am: два общих тона держатся БЕЗ новой атаки, два голоса ползут к F.
  Audio.scheduleEvent(ctx, sec, sq, ev(1), 1, 2, 2, 120, '4/4');
  assert.equal(sources.length, 4, 'общие тоны НЕ создают новые источники');
  curves = allCurves();
  assert.equal(curves.length, 3, 'добавились ровно два слайда Am -> F');
  const second = curves.filter(c => c.t > 3);
  assert.equal(second.length, 2, 'два слайда перед второй границей');
  assert(second.every(c => Math.abs(c.t - 3.65) < 1e-9), 'второй слайд тоже за 0,35 с');
  assert(second.every(c => Math.abs(c.t + c.d - 4) < 1e-9), 'второй слайд приходит в t=4');
  sources.forEach(s => assert(Math.abs(s.stopped - 4.36) < 1e-9, 'голоса доживают до конца второй ячейки'));
  assert.equal(Audio.stats().liveVoices, 4, 'реестр держит четыре живых голоса');
  console.log('  ok  audio: hold без рестарта, цепочка слайдов, провала нет');

  // F -> пустая ячейка: мягкое затухание, без раннего слайда в тишину.
  Audio.scheduleEvent(ctx, sec, sq, ev(2), 2, 4, 2, 120, '4/4');
  assert.equal(sources.length, 4, 'новых источников нет и на уходе линии');
  assert.equal(allCurves().length, 3, 'в пустоту слайд не ставится');
  assert(sources.every(s => Math.abs(s.stopped - 6.01) < 1e-9), 'линия гаснет к границе t=6');

  Audio.scheduleEvent(ctx, sec, sq, ev(3), 3, 6, 2, 120, '4/4');
  assert.equal(sources.length, 4, 'в тишине новых источников нет');
  assert(Audio.stats().skippedGhost >= 1, 'пустая ячейка честно пропущена');

  Audio.scheduleEvent(ctx, sec, sq, ev(4), 4, 8, 2, 120, '4/4');
  assert.equal(sources.length, 8, 'после тишины аккорд начинает новую линию');
  console.log('  ok  audio: пауза рвёт линию, следующий аккорд начинается заново');

  Audio.stopAll();
  Audio.scheduleEvent(ctx, sec, sq, ev(4), 4, 10, 2, 120, '4/4');
  assert.equal(sources.length, 12, 'Стоп чистит реестр: снова четыре новых голоса');
  console.log('  ok  audio: stopAll() рвёт непрерывную линию');

  console.log('\nB-110 / 0.782: pad перетекает между аккордами — ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ');
})().catch(e => { console.error('ПРОВАЛ:', e && e.stack || e); process.exit(1); });
