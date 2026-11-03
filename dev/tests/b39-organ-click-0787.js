'use strict';
// 0.787 · B-115: щелчок электрооргана реалистичнее.
//
// Жалоба владельца (log-идея ROADMAP после 0.782): у органа «есть какой-то
// щелчок, возможно он уместен, но не при каждом ударе». Read-only замер на
// моке Web Audio показал: на каждой ноте organAttack() добавлял шумовой
// щелчок пиком ×1,03–1,16 от пика ноты и перкуссию (синус 3-й гармоники,
// хвост 300 мс); орган на силу почти не реагирует (strength=0.35), поэтому
// щелчок одинаково выпирал при любой силе.
//
// Решения владельца (R8): щелчок остаётся на каждой ноте, но тише (~×0.3) и
// с детерминированным разбросом уровня (life.clickVar); перкуссия — только
// на новой атаке (life.percussive: повтор той же ноты дорожки в пределах
// 0,45 с перкуссии не даёт). Сэмплы, манифест, makeSustain, другие тембры,
// pad-расписание 0.782–0.786, метроном и экспорт не менялись. Стык петли
// mp3 здесь не тронут — отдельный кирпич, браузерный замер за владельцем.
//
// Здесь проверяются РЕАЛЬНЫЕ узлы Web Audio из keyboard-audio.js в
// vm-песочнице с моком банка сэмплов. НЕ заменяет слуховую проверку.
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(ROOT, 'STRUCHORD.html'), 'utf8');
const AUDIO = fs.readFileSync(path.join(ROOT, 'keyboard-audio.js'), 'utf8');
let groups = 0;
const ok = (msg) => { groups++; console.log('  ok  ' + msg); };

// ---------------------------------------------------------------------------
// 1. Статический контракт
// ---------------------------------------------------------------------------
const VER = (HTML.match(/· ver (\d+\.\d+)/) || [])[1];
assert.strictEqual(VER, '0.787', 'версия в шапке HTML — 0.787, было ' + VER);
assert(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').includes('struchord-v787'),
  'R7: кэш выложен парой с версией 0.787');
ok('R7: версия 0.787 в HTML и CACHE_NAME struchord-v787 в sw.js — парой');

assert(AUDIO.includes('function organAttack(ctx, target, midi, start, level, expression, life) {'),
  'organAttack получила параметр life');
assert(AUDIO.includes('level * (.27 + .42 * e) * clickVar'),
  'щелчок тише: старый gain level*(.9+1.4*e) заменён на level*(.27+.42*e)*clickVar');
assert(!AUDIO.includes('level * (.9 + 1.4 * e)'), 'старой громкости щелчка больше нет');
assert(AUDIO.includes('out.clickVar = .75 + rnd(4) * .5;'), 'детерминированный разброс уровня щелчка');
assert(AUDIO.includes('out.percussive = !(prevOrgan && at - prevOrgan.at >= 0 && at - prevOrgan.at < .45);'),
  'перкуссия только на новой атаке (окно повтора 0,45 с)');
assert(AUDIO.includes("if(mode==='organ')organAttack(ctx,target,midi,start,level,expression,life);"),
  'playSample передаёт life в organAttack');
assert(AUDIO.includes('(!life || life.percussive !== false) && hasRoom()'),
  'ветка перкуссии гейтится флагом percussive');
ok('контракт 0.787 в keyboard-audio.js: тихий щелчок + перкуссия только на новой атаке');

// ---------------------------------------------------------------------------
// 2. Мок Web Audio: реальные узлы organAttack из модуля
// ---------------------------------------------------------------------------
function makeWorld() {
  const nodes = [];   // стартовавшие источники
  const all = [];     // все созданные узлы
  function mkParam() {
    const p = { value: 0, calls: [] };
    p.setValueAtTime = (v, t) => { p.calls.push(v); p.value = v; return p; };
    p.exponentialRampToValueAtTime = (v, t) => { p.calls.push(v); p.value = v; return p; };
    p.linearRampToValueAtTime = (v, t) => { p.calls.push(v); p.value = v; return p; };
    return p;
  }
  function mkNode(kind) {
    const n = { kind, connectTo: [], started: null, stopped: null };
    all.push(n);
    n.connect = (d) => { n.connectTo.push(d); return d; };
    n.start = (t) => { n.started = t; nodes.push(n); };
    n.stop = (t) => { n.stopped = t; };
    n.gain = mkParam(); n.playbackRate = mkParam(); n.frequency = mkParam(); n.Q = mkParam();
    n.type = null;
    return n;
  }
  const ctx = {
    sampleRate: 44100, currentTime: 0, destination: { kind: 'destination' },
    createBufferSource: () => mkNode('bufferSource'),
    createOscillator: () => mkNode('oscillator'),
    createGain: () => mkNode('gain'),
    createBiquadFilter: () => mkNode('biquad'),
    createBuffer: (ch, len, sr) => ({ numberOfChannels: ch, length: len, sampleRate: sr, getChannelData: () => new Float32Array(len) }),
  };
  const HOST = { fetch: () => Promise.reject(new Error('offline')), setTimeout: (fn) => setTimeout(fn, 0) };
  const sandbox = { console };
  sandbox.window = HOST; sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(AUDIO, sandbox);
  vm.runInContext('window.__b39Modules.audio()', sandbox);
  HOST.StruChordSampleBank = {
    ready: () => true,
    nearest: (mode, midi) => ({ midi, velocity: 0, buffer: { duration: 2, numberOfChannels: 1, sampleRate: 44100, getChannelData: () => new Float32Array(88200) } }),
  };
  return { HOST, ctx, nodes, all, A: HOST.StruChordAudio };
}

function organNote(w, midi, start, expression, trackId) {
  w.nodes.length = 0; w.all.length = 0;
  const t2 = { kind: 'target', connectTo: [] };
  t2.connect = (d) => { t2.connectTo.push(d); return d; };
  const r = w.A.renderSample(w.ctx, t2, 'organ', midi, start, 0.5, 0.16, expression === undefined ? 0.85 : expression, trackId);
  assert.strictEqual(r, true, 'renderSample вернул true');
  const gains = w.all.filter(n => n.kind === 'gain').map(n => n.gain.calls.reduce((m, v) => Math.max(m, Math.abs(v)), 0));
  const oscs = w.all.filter(n => n.kind === 'oscillator');
  const srcs = w.all.filter(n => n.kind === 'bufferSource');
  // порядок создания gain: нота, шумовой щелчок, перкуссия
  return { note: gains[0] || 0, click: gains[1] || 0, perc: gains[2] || 0, oscs: oscs.length, srcs: srcs.length, oscFreq: oscs[0] ? oscs[0].frequency.value : 0 };
}

// --- 2a. одна нота: щелчок тихий, перкуссия на первой атаке ---
{
  const w = makeWorld();
  const r = organNote(w, 60, 0.1, 0.85, 1);
  const level = 0.16, e = 0.85;
  const noteExpected = level * 1.8 * 1.1 * Math.pow(e, 0.35);
  assert(Math.abs(r.note - noteExpected) < 1e-3, 'пик ноты как раньше: ' + r.note + ' vs ' + noteExpected);
  assert.strictEqual(r.srcs, 2, 'два bufferSource: сэмпл + шумовой щелчок');
  assert.strictEqual(r.oscs, 1, 'первая атака: перкуссия есть (1 осциллятор)');
  assert(Math.abs(r.oscFreq - 440 * Math.pow(2, (60 - 69) / 12) * 3) < 1, 'перкуссия на 3-й гармонике');
  const clickMax = level * (0.27 + 0.42 * e) * 1.25, clickMin = level * (0.27 + 0.42 * e) * 0.75;
  assert(r.click >= clickMin - 1e-4 && r.click <= clickMax + 1e-4,
    'щелчок в диапазоне ×0.3 с разбросом clickVar: ' + r.click.toFixed(4) + ' в [' + clickMin.toFixed(4) + ', ' + clickMax.toFixed(4) + ']');
  assert(r.click / r.note < 0.5, 'щелчок тише ноты: ratio ' + (r.click / r.note).toFixed(3) + ' (было ~1.12)');
  assert(Math.abs(r.perc - level * (0.18 + 0.38 * e)) < 1e-3, 'перкуссия без изменений по уровню');
  ok('одна нота: щелчок ~×0.3 от прежнего и тише ноты, перкуссия на первой атаке');
}

// --- 2b. повтор той же ноты в пределах 0,45 с: перкуссии нет, щелчок есть ---
{
  const w = makeWorld();
  const a = organNote(w, 60, 0.10, 0.85, 1);
  const b = organNote(w, 60, 0.30, 0.85, 1);   // через 0.2 с — повтор внутри рисунка
  assert.strictEqual(b.oscs, 0, 'повтор в пределах 0,45 с: перкуссии нет');
  assert.strictEqual(b.srcs, 2, 'щелчок на повторе остался');
  assert(b.click > 0, 'щелчок звучит и на повторе');
  const c = organNote(w, 60, 1.50, 0.85, 1);   // через 1.2 с — новая атака
  assert.strictEqual(c.oscs, 1, 'новая атака после паузы: перкуссия снова есть');
  const d = organNote(w, 62, 0.20, 0.85, 1);   // другая нота сразу — новая атака
  assert.strictEqual(d.oscs, 1, 'другая нота: перкуссия есть');
  const e2 = organNote(w, 60, 0.15, 0.85, 2);  // другая дорожка, та же нота
  assert.strictEqual(e2.oscs, 1, 'другая дорожка: счётчики независимы, перкуссия есть');
  ok('перкуссия только на новой атаке; повтор 0,2 с — без перкуссии, но со щелчком');
}

// --- 2c. детерминированность: два свежих мира дают одинаковые gain ---
{
  const run = () => {
    const w = makeWorld();
    return [organNote(w, 60, 0.10, 0.85, 1), organNote(w, 60, 0.30, 0.85, 1), organNote(w, 60, 1.50, 0.85, 1)];
  };
  const r1 = run(), r2 = run();
  r1.forEach((r, i) => {
    assert.strictEqual(r.click, r2[i].click, 'click детерминирован: ' + r.click + ' vs ' + r2[i].click);
    assert.strictEqual(r.note, r2[i].note, 'нота детерминирована');
    assert.strictEqual(r.oscs, r2[i].oscs, 'перкуссия детерминирована');
  });
  assert(r1[0].click !== r1[1].click, 'разброс clickVar реально различает повторы: ' + r1[0].click + ' vs ' + r1[1].click);
  ok('детерминизм: одинаковая последовательность в двух мирах даёт одинаковые gain; повторы различаются');
}

// --- 2d. другие тембры не тронуты: никакой organAttack ---
{
  const w = makeWorld();
  w.nodes.length = 0; w.all.length = 0;
  const t2 = { kind: 'target', connectTo: [], connect(d) { this.connectTo.push(d); return d; } };
  w.A.renderSample(w.ctx, t2, 'pad', 60, 0.1, 0.5, 0.16, 0.85, 1);
  assert.strictEqual(w.all.filter(n => n.kind === 'oscillator').length, 0, 'pad: осцилляторов нет');
  assert.strictEqual(w.all.filter(n => n.kind === 'bufferSource').length, 1, 'pad: только сэмпл');
  w.nodes.length = 0; w.all.length = 0;
  w.A.renderSample(w.ctx, t2, 'rhodes', 60, 0.1, 0.5, 0.16, 0.85, 1);
  assert.strictEqual(w.all.filter(n => n.kind === 'oscillator').length, 0, 'rhodes: осцилляторов нет (перкуссии органа нет)');
  ok('pad и rhodes не получили атаки органа');
}

console.log('\n0.787 B-115: все проверки пройдены (' + groups + ' групп)');
