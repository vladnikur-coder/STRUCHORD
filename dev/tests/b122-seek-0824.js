#!/usr/bin/env node
'use strict';

// B-122 / 0.824 · перемотки: клик по аккорду и «сдвиг записи».
//
// Жалоба владельца: «перемотка через клик в редакторе и перемотка в ленте
// недоработаны», уточнение — «сейчас перескакивают аккорды, но не запись».
//
// Что проверяется:
//   1. Клик по аккорду во время игры — ОДИН перезапуск транспорта: старая
//      запись гаснет, новая начинается на секунде нажатой ячейки, отсчёт
//      («4-3-2-1») не включается, тост не выскакивает.
//   2. Песня при этом тоже переезжает: индексы и `playbackStartTime` —
//      новые, а не прежние (иначе аккорды и запись снова разъедутся).
//   3. Поправка «Сдвиг записи» (`trackOffset`) учитывается и при старте, и
//      при предпросмотре: раньше все перемотки попадали мимо на её величину.
//   4. Панель волны сразу показывает, куда отмотали в Ленте (время и бегунок),
//      а не остаётся на прошлом месте.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const html = fs.readFileSync(path.join(ROOT, 'STRUCHORD.html'), 'utf8')
  .replace('<script src="./keyboard-audio.js"></script>', `<script>${fs.readFileSync(path.join(ROOT, 'keyboard-audio.js'), 'utf8')}</script>`)
  .replace('<script src="./keyboard-accompaniment.js"></script>', `<script>${fs.readFileSync(path.join(ROOT, 'keyboard-accompaniment.js'), 'utf8')}</script>`);

function fakeBuffer(options) {
  const o = options || {};
  const length = o.length || 48000;
  return {
    duration: o.duration === undefined ? 40 : o.duration,
    length,
    numberOfChannels: o.channels || 2,
    sampleRate: 48000,
    getChannelData: () => new Float32Array(o.samples || 4096),
  };
}

const dom = new JSDOM(html, {
  url: 'http://127.0.0.1:8080/STRUCHORD.html',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  beforeParse(win) {
    win.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    win.HTMLCanvasElement.prototype.getContext = function () {
      return { font: '', measureText: text => ({ width: String(text || '').length * 8 }), clearRect() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, fill() {}, closePath() {}, save() {}, restore() {}, translate() {}, rotate() {}, fillText() {}, strokeText() {}, setTransform() {}, scale() {}, createLinearGradient: () => ({ addColorStop() {} }) };
    };
    win.Blob = Blob;
    win.URL.createObjectURL = () => 'blob:b122-0824';
    win.URL.revokeObjectURL = () => {};
    win.HTMLAnchorElement.prototype.click = function () {};

    win.__ctxs = [];
    win.__sources = [];
    win.__gains = [];
    win.__decoded = fakeBuffer();
    function FakeCtx() {
      const ctx = this;
      this.currentTime = 100;
      this.state = 'running';
      this.sampleRate = 48000;
      this.outputLatency = 0.01;
      this.baseLatency = 0.005;
      this.destination = { connect() {}, disconnect() {} };
      this.close = () => Promise.resolve();
      this.decodeAudioData = () => Promise.resolve(win.__decoded);
      this.createBufferSource = () => {
        const source = {
          buffer: null,
          playbackRate: { value: 1 },
          started: null,
          stopped: null,
          connect(node) { source.node = node; },
          disconnect() {},
          start(when, offset) { source.started = { when, offset }; },
          stop(at) { source.stopped = at; },
        };
        win.__sources.push(source);
        return source;
      };
      this.createGain = () => {
        const node = {
          gain: {
            value: 1,
            setValueAtTime(v) { node.gain.value = v; },
            linearRampToValueAtTime(v) { node.gain.value = v; },
            setTargetAtTime(v) { node.gain.value = v; },
            cancelScheduledValues() {},
          },
          connect(target) { node.connected = target; },
          disconnect() {},
        };
        win.__gains.push(node);
        return node;
      };
      win.__ctxs.push(ctx);
    }
    win.AudioContext = win.webkitAudioContext = FakeCtx;

    win.__audioInstances = [];
    win.Audio = function () {
      const el = {
        paused: true, volume: 1, src: '', duration: 40,
        playCalls: 0, pauseCalls: 0, setCount: 0, rateSetCount: 0,
        _currentTime: 0, _rate: 1,
      };
      Object.defineProperty(el, 'currentTime', {
        get() { return el._currentTime; },
        set(v) { el._currentTime = v; el.setCount++; },
      });
      Object.defineProperty(el, 'playbackRate', {
        get() { return el._rate; },
        set(v) { el._rate = v; el.rateSetCount++; },
      });
      el.addEventListener = () => {};
      el.removeEventListener = () => {};
      el.setAttribute = () => {};
      el.removeAttribute = () => {};
      el.load = () => {};
      el.pause = () => { el.paused = true; el.pauseCalls++; };
      el.play = () => { el.paused = false; el.playCalls++; return Promise.resolve(); };
      win.__audioInstances.push(el);
      return el;
    };
  },
});

const w = dom.window;

function check(name, fn) {
  try { fn(); console.log('ok   ' + name); }
  catch (error) { console.error('FAIL ' + name + '\n' + (error.stack || error)); process.exitCode = 1; }
}

// Два квадрата по одному целому такту 4/4. Точки задают секунды записи:
// такт 1 -> 0 с, такт 3 -> 8 с (значит такт 2 приходится на 4-ю секунду).
const META = {
  id: 'seek-0824', name: 'take.mp3', type: 'audio/mpeg', size: 4096,
  duration: 40, speed: 1, volume: 80, mute: false, solo: true,
  points: [{ bar: 0, time: 0 }, { bar: 2, time: 8 }],
};

function scoreGlobals() {
  w.eval(`
    globalTimeSig = '4/4';
    sections = [{ id: 1, type: 'Verse', repeat: 1, timeSig: '4/4', squares: [
      { id: 1, repeat: 1, events: [{ chord: 'C', span: 4 }] },
      { id: 2, repeat: 1, events: [{ chord: 'G', span: 4 }] },
    ] }];
  `);
}

async function loadBacking(bt, meta) {
  await bt.importEmbedded({ backingTrack: { ...meta, embedded: Buffer.from('RIFF0000').toString('base64') } });
  await bt.loadSong({ backingTrack: meta });
}

setTimeout(async () => {
  try {
    const bt = w.StruChordBackingTrack;
    assert(bt, 'модуль фоновой записи загружен');
    scoreGlobals();
    const ctx = w.getAudioContext();
    assert(ctx, 'аудиоконтекст приложения доступен');

    // ── 1. Сдвиг записи учитывается при старте ────────────────────────────
    await loadBacking(bt, { ...META, trackOffset: 2 });
    let launch = ctx.currentTime + 0.12;
    bt.preparePlaybackStart(ctx, {
      currentSectionIndex: 0, currentSquareIndex: 1, currentEventIndex: 0,
      _sectionRepeatCount: {}, _squareRepeatCount: {},
    }, launch, launch, false);
    check('старт записи на скорости 100 % учитывает поправку «Сдвиг записи»', () => {
      const src = w.__sources[w.__sources.length - 1];
      assert(src && src.started, 'источник должен быть запущен');
      assert(Math.abs(src.started.offset - 6) < 0.05, `запись начинается с ${src.started.offset} с, а должна с 6 (4 с по сетке + 2 с поправки)`);
    });

    // ── 2. Предпросмотр (Лента/пауза) тоже с поправкой ────────────────────
    bt.stopAudio();
    bt.toggleDrawer(true);
    bt.loadSong({ backingTrack: { ...META, trackOffset: 2 } });
    const elapsedBeforeSeek = w.eval('(function(){return 0;})()');
    bt.syncPreviewToPosition({ sectionIndex: 0, squareIndex: 1, eventIndex: 0, sectionRepeatCount: {}, squareRepeatCount: {} });
    const el = w.__audioInstances[w.__audioInstances.length - 1];
    check('предпросмотр перемотки в Ленте ставит запись на ту же секунду с поправкой', () => {
      assert(el, 'элемент записи создан');
      assert(Math.abs(el._currentTime - 6) < 0.05, `элемент стоит на ${el._currentTime} с вместо 6`);
    });
    check('панель волны сразу показывает новое место', () => {
      const label = (w.document.getElementById('btPlayhead') || {}).textContent || '';
      assert(/0:0[56]/.test(label), `подпись «${label}» не обновилась на новое место`);
    });

    // ── 3. Клик по аккорду во время игры: один перезапуск ────────────────
    bt.resetForNewSong();
    scoreGlobals();
    await loadBacking(bt, { ...META, trackOffset: 2 });
    w.eval('playbackState.isPlaying = true');
    launch = ctx.currentTime + 0.12;
    bt.preparePlaybackStart(ctx, {
      currentSectionIndex: 0, currentSquareIndex: 0, currentEventIndex: 0,
      _sectionRepeatCount: {}, _squareRepeatCount: {},
    }, launch, launch, false);
    const before = w.__sources[w.__sources.length - 1];
    const sourcesBefore = w.__sources.length;
    // Часы сдвигаем: иначе «переехала ли сетка» не отличить от «стояла на месте».
    ctx.currentTime += 3;

    const shifted = w.eval('seekPlaybackToCell(0, 1, 0)');
    check('клик по аккорду во время игры выполняет перемотку', () => {
      assert.strictEqual(shifted, true, 'перемотка должна выполниться');
      assert.strictEqual(w.__sources.length, sourcesBefore + 1, 'запись должна перезапуститься ровно один раз');
      assert(before.stopped !== null, 'старая запись обязана замолчать');
    });
    const after = w.__sources[w.__sources.length - 1];
    check('запись встаёт на секунду нажатого аккорда', () => {
      assert(after && after.started, 'новый источник запущен');
      assert(Math.abs(after.started.offset - 6) < 0.05, `запись начинается с ${after.started.offset} с вместо 6`);
    });
    check('песня переезжает вместе с записью, а не продолжает старый отсчёт', () => {
      const ps = w.eval('({ si: playbackState.currentSectionIndex, sqi: playbackState.currentSquareIndex, playing: playbackState.isPlaying, start: playbackStartTime, next: nextEventTime })');
      assert.strictEqual(ps.playing, true, 'игра продолжается');
      assert.strictEqual(ps.sqi, 1, `квадрат ${ps.sqi}, а нажали второй`);
      assert(Math.abs(ps.start - (ctx.currentTime + 0.12)) < 0.05, `сетка начинается с ${ps.start}, а должна с ${ctx.currentTime + 0.12} — то есть заново, а не с прежнего места`);
      assert(ps.next >= ps.start - 1e-6, 'планировщик не должен остаться позади старта');
    });
    check('перемотка кликом идёт без отсчёта «4-3-2-1»', () => {
      const ps = w.eval('({ start: playbackStartTime })');
      const lead = ps.start - ctx.currentTime;
      assert(lead < 0.5, `перед стартом ${lead.toFixed(2)} с — похоже, включился отсчёт`);
    });

    // ── 4. Клик вне игры ничего не ломает ────────────────────────────────
    w.eval('stopPlayback()');
    const idle = w.eval('seekPlaybackToCell(0, 1, 0)');
    check('клик по аккорду на остановленной игре перемотку не запускает', () => {
      assert.strictEqual(idle, false);
      assert.strictEqual(w.eval('playbackState.isPlaying'), false);
    });

    // ── 5. Песня без записи: перемотка работает как раньше ───────────────
    bt.resetForNewSong();
    await bt.loadSong({ backingTrack: null });
    scoreGlobals();
    w.eval('playbackState.isPlaying = true');
    const noTrack = w.eval('seekPlaybackToCell(0, 1, 0)');
    check('без фоновой записи перемотка всё равно перезапускает песню', () => {
      assert.strictEqual(noTrack, true);
      assert.strictEqual(w.eval('playbackState.isPlaying'), true);
      assert.strictEqual(w.eval('playbackState.currentSquareIndex'), 1);
      assert.strictEqual(bt.getPathInfo().path, 'none');
    });
    w.eval('stopPlayback()');
  } catch (error) {
    console.error(error && error.stack || error);
    process.exitCode = 1;
  }
  console.log('\nB-122 / 0.824 checks completed.');
  process.exit(process.exitCode || 0);
}, 300);
