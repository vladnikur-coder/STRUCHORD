'use strict';
// 0.788 · B-116: орган — мягкая атака ~20 мс, без синтетического щелчка
// и перкуссии, WAV-сэмплы (tonejs-instrument-organ-wav, MIT).
//
// Жалоба после 0.787: «электроорган все ещё щелкает, атака слишком
// жесткая». Диагностика: mp3-сэмплы сами не щелкают (фронт ~20 мс,
// ВЧ-доля атаки 0,1–0,9 %), щелчок давал синтез в коде (organAttack),
// плюс рампа громкости сэмпла была всего 4 мс. Решения владельца (R8 №4):
// щелчок убрать, перкуссию убрать, атака ~20 мс, источник — WAV сразу.
//
// Здесь проверяются РЕАЛЬНЫЕ узлы Web Audio из keyboard-audio.js в
// vm-песочнице с моком банка сэмплов: у ноты органа ровно один
// bufferSource и ни одного осциллятора, а рампа gain поднимается до
// пика за start+0.02. НЕ заменяет слуховую проверку владельцем.
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
// 1. R7: версия/кэш парой (динамически)
// ---------------------------------------------------------------------------
const VER = (HTML.match(/· ver (\d+\.\d+)/) || [])[1];
assert(VER && /^\d+\.\d+$/.test(VER), 'версия читается: ' + VER);
assert(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').includes('struchord-v' + VER.split('.')[1]),
  'CACHE_NAME парой с версией');
ok('R7: версия ' + VER + ' + struchord-v' + VER.split('.')[1]);

// ---------------------------------------------------------------------------
// 2. Мок Web Audio: реальные узлы playSample из модуля
// ---------------------------------------------------------------------------
function makeWorld() {
  const all = [];
  function mkParam() {
    const p = { value: 0, calls: [] };
    p.setValueAtTime = (v, t) => { p.calls.push([v, t]); p.value = v; return p; };
    p.exponentialRampToValueAtTime = (v, t) => { p.calls.push([v, t]); p.value = v; return p; };
    p.linearRampToValueAtTime = (v, t) => { p.calls.push([v, t]); p.value = v; return p; };
    return p;
  }
  function mkNode(kind) {
    const n = { kind, connectTo: [], started: null, stopped: null };
    all.push(n);
    n.connect = (d) => { n.connectTo.push(d); return d; };
    n.start = (t) => { n.started = t; };
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
  return { HOST, ctx, all, A: HOST.StruChordAudio };
}

function note(w, mode, midi, start, dur, expression, trackId) {
  w.all.length = 0;
  const target = { kind: 'target', connectTo: [], connect(d) { this.connectTo.push(d); return d; } };
  const r = w.A.renderSample(w.ctx, target, mode, midi, start, dur || 0.5, 0.16, expression === undefined ? 0.85 : expression, trackId);
  assert.strictEqual(r, true, 'renderSample вернул true');
  const srcs = w.all.filter(n => n.kind === 'bufferSource');
  const oscs = w.all.filter(n => n.kind === 'oscillator');
  // gain ноты — первый созданный gain (до него фильтров у органа нет)
  const g = w.all.filter(n => n.kind === 'gain')[0];
  return { srcs, oscs, gainCalls: g ? g.gain.calls : [] };
}

// --- 2a. одна нота органа: ровно один сэмпл, ни щелчка, ни перкуссии ---
{
  const w = makeWorld();
  const r = note(w, 'organ', 60, 0.10);
  assert.strictEqual(r.srcs.length, 1, 'один bufferSource — только сэмпл, без шумового щелчка');
  assert.strictEqual(r.oscs.length, 0, 'ни одного осциллятора — перкуссии 3-й гармоники нет');
  const calls = r.gainCalls;
  assert(calls.length >= 3, 'у gain ноты минимум 3 точки: ' + JSON.stringify(calls));
  assert.strictEqual(calls[0][0], 0.0001, 'старт с тишины');
  const t0 = calls[0][1];   // start + джиттер клавиш (±2 мс у органа)
  assert(Math.abs(t0 - 0.10) < 0.003, 'старт около запрошенного: ' + t0);
  // рампа атаки: amp в start + 0.02 (а не 0.004)
  assert(Math.abs(calls[1][1] - (t0 + 0.02)) < 1e-9, 'рампа атаки заканчивается в start+0.02, было: ' + calls[1][1] + ' при start ' + t0);
  const amp = calls[1][0];
  assert(amp > 0.1, 'amp поднимается до пика ноты: ' + amp);
  ok('орган: 1 сэмпл, 0 осцилляторов, рампа атаки ровно 20 мс (start+0.02)');
}

// --- 2b. повтор той же ноты: по-прежнему никаких доп. узлов ---
{
  const w = makeWorld();
  const a = note(w, 'organ', 60, 0.10, 0.5, 0.85, 1);
  const b = note(w, 'organ', 60, 0.30, 0.5, 0.85, 1);   // повтор через 0.2 с
  const c = note(w, 'organ', 60, 1.50, 0.5, 0.85, 1);   // новая атака через 1.2 с
  for (const r of [a, b, c]) {
    assert.strictEqual(r.srcs.length, 1, 'повторы тоже: только сэмпл');
    assert.strictEqual(r.oscs.length, 0, 'ни на повторе, ни на новой атаке перкуссии нет');
  }
  ok('повтор и новая атака: перкуссии нет никогда (в 0.787 она была на новой атаке)');
}

// --- 2c. остальные тембры: атака как была (4 мс у пианино, 140 мс у pad) ---
{
  const w = makeWorld();
  const ac = note(w, 'acoustic', 60, 0.10);
  assert(Math.abs(ac.gainCalls[1][1] - (ac.gainCalls[0][1] + 0.004)) < 1e-9, 'acoustic: атака 4 мс, было ' + ac.gainCalls[1][1]);
  const pd = note(w, 'pad', 60, 0.10);
  assert(Math.abs(pd.gainCalls[1][1] - (pd.gainCalls[0][1] + 0.14)) < 1e-9, 'pad: атака 140 мс, было ' + pd.gainCalls[1][1]);
  assert.strictEqual(pd.oscs.length, 0, 'pad: осцилляторов нет');
  ok('acoustic 4 мс и pad 140 мс не изменились');
}

// --- 2d. детерминизм: два мира, одна последовательность — одинаковые gain ---
{
  const run = () => {
    const w = makeWorld();
    return [note(w, 'organ', 60, 0.10), note(w, 'organ', 60, 0.30), note(w, 'organ', 48, 1.50)];
  };
  const r1 = run(), r2 = run();
  r1.forEach((r, i) => assert.deepStrictEqual(r.gainCalls, r2[i].gainCalls, 'gain детерминирован, проход ' + i));
  ok('детерминизм: gain-кривые двух свежих миров совпадают до бита');
}

// ---------------------------------------------------------------------------
// 3. WAV-сэмплы органа на месте и с мягким фронтом
// ---------------------------------------------------------------------------
{
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'sounds', 'manifest.json'), 'utf8'));
  assert.strictEqual(manifest.organ.length, 7, '7 нот органа');
  for (const e of manifest.organ) {
    assert(e.file.endsWith('.wav'), e.file + ' — wav');
    const buf = fs.readFileSync(path.join(ROOT, 'sounds', e.file));
    assert.strictEqual(buf.slice(0, 4).toString('latin1'), 'RIFF', e.file + ' — RIFF');
    // фронт после обрезки ведущей тишины: первый 1 мс — без резкого скачка
    const sr = buf.readUInt32LE(24), bits = buf.readUInt16LE(34), ch = buf.readUInt16LE(22);
    const dataOff = 12;
    let pos = 12;
    while (pos + 8 <= buf.length) {
      const kind = buf.slice(pos, pos + 4).toString('latin1'), size = buf.readUInt32LE(pos + 4);
      if (kind === 'data') { pos += 8; break; }
      pos += 8 + size + (size % 2);
    }
    const n = Math.min(Math.floor(sr * 0.001), (buf.length - pos) / (bits / 8 * ch) | 0);
    let peak0 = 0;
    for (let i = 0; i < n; i++) peak0 = Math.max(peak0, Math.abs(buf.readInt16LE(pos + i * 2)));
    assert(peak0 / 32768 < 0.05, e.file + ': первый 1 мс тихий (обрезка тишины сработала), пик ' + (peak0 / 32768).toFixed(4));
  }
  ok('sounds/organ/*.wav: RIFF, ведущая тишина обрезана, фронт мягкий');
}

console.log('\n0.788 B-116: все проверки пройдены (' + groups + ' групп)');
