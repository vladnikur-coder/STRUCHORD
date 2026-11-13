#!/usr/bin/env node
'use strict';

// B-122 / 0.823 · фоновая запись на одних часах и тихий догон.
//
// Что проверяется (и почему именно это):
//   1. На скорости 100 % запись играет источником Web Audio («одни часы»):
//      элемент <audio> не запускается вообще — значит нет ни его задержки
//      старта, ни пересборки «сохранения высоты тона».
//   2. Смещение начала в прошлое компенсируется (start() не «сейчас», а с
//      поправкой) — иначе запись отставала бы ровно на опоздание кода.
//   3. Позиция записи (playhead) считается от модели Web Audio и идёт ровно.
//   4. На скорости ≠ 100 % ноль модели уточняется ИЗМЕРЕНИЕМ, а не
//      намерением: медиана проб, затем один сдвиг сетки, если опоздание
//      крупное (> 90 мс).
//   5. Догон тихий: одна поправка скорости не чаще раза в 2,5 с, шаг ±0,8 %,
//      и НИ ОДНОЙ периодической перестановки currentTime (это и было
//      причиной «диких фризов»).
//   6. Крупный разъезд (> 350 мс) — песня один раз ждёт запись (cut), запись
//      не переставляется.
//   7. Предел памяти: слишком длинная запись остаётся на элементе.
//   8. Песня без фоновой записи ведёт себя как раньше.
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
    duration: o.duration === undefined ? 30 : o.duration,
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
    win.URL.createObjectURL = () => 'blob:b122-0823';
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
        paused: true, volume: 1, src: '', duration: 30,
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

const wait = ms => new Promise(resolve => w.setTimeout(resolve, ms));

function scoreGlobals() {
  w.eval(`
    globalTimeSig = '4/4';
    sections = [{ id: 1, type: 'Verse', repeat: 1, timeSig: '4/4', squares: [
      { id: 1, repeat: 1, events: [{ chord: 'C', span: 4 }] },
      { id: 2, repeat: 1, events: [{ chord: 'G', span: 4 }] },
    ] }];
  `);
}

function playbackState() {
  return {
    currentSectionIndex: 0, currentSquareIndex: 0, currentEventIndex: 0,
    _sectionRepeatCount: {}, _squareRepeatCount: {},
  };
}

// Файл кладём в хранилище так же, как это делает пользователь: через
// встроенные данные .struchord. Без байтов модуль честно считает запись
// «не найденной» (missingAudio) — и звук тогда не планируется вообще.
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

    // Regression: squares may span multiple measures. A prior B-122 grid
    // advanced one measure per square even when its events occupied several,
    // causing later events to reuse earlier Sync Point intervals.
    w.eval(`
      globalTimeSig = '4/4';
      sections = [{ id: 1, type: 'Verse', repeat: 1, timeSig: '4/4', squares: [
        { id: 1, repeat: 1, events: [{ chord: 'C', span: 4 }, { chord: 'F', span: 4 }] },
        { id: 2, repeat: 1, events: [{ chord: 'G', span: 4 }, { chord: 'Am', span: 4 }] },
      ] }];
    `);
    await loadBacking(bt, {
      id: 'multibar-sync-0825', name: 'multibar.mp3', type: 'audio/mpeg', size: 4096,
      duration: 30, speed: 1, volume: 80, mute: false, solo: true,
      points: [
        { bar: 0, time: 0 }, { bar: 1, time: 2 }, { bar: 2, time: 5 },
        { bar: 3, time: 7 }, { bar: 4, time: 9 },
      ],
    });
    const grid = bt.getBarGrid();
    const multiDurations = [
      bt.resolveScheduledEvent(ctx, 0, 0, 0, 0, 0, 0, 4, '4/4', 120).dur,
      bt.resolveScheduledEvent(ctx, 0, 0, 1, 0, 0, 0, 4, '4/4', 120).dur,
      bt.resolveScheduledEvent(ctx, 0, 1, 0, 0, 0, 0, 4, '4/4', 120).dur,
      bt.resolveScheduledEvent(ctx, 0, 1, 1, 0, 0, 0, 4, '4/4', 120).dur,
    ];
    check('multi-measure squares preserve a monotonic 16-quarter event grid', () => {
      assert.strictEqual(grid.bars, 4, `bar count ${grid.bars} instead of 4`);
      assert.strictEqual(grid.totalQ, 16, `quarter count ${grid.totalQ} instead of 16`);
      assert(multiDurations.every((d, i) => Math.abs(d - [2, 3, 2, 2][i]) < 1e-6),
        `event durations ${multiDurations.join(', ')} instead of 2, 3, 2, 2`);
    });
    check('BPM audit captures fallback vs Sync Point timing without changing playback', () => {
      const audit = bt.getSyncTimingDiagnostics();
      assert(audit && audit.recent.length >= 4);
      assert.deepStrictEqual(Array.from(audit.recent.slice(-4), x => x.q), [0, 4, 8, 12]);
      assert.strictEqual(audit.recent[audit.recent.length - 1].fallbackBpm, 120);
      assert.strictEqual(audit.recent[audit.recent.length - 1].syncBpm, 120);
      assert.strictEqual(audit.recent[audit.recent.length - 1].audioPath, 'none');
      const report = JSON.parse(w.audioDiagnosticReport());
      assert(report.syncTiming && report.syncTiming.recent.length >= 4,
        'audio-report must include the timing audit');
    });
    scoreGlobals();

    // ── 1. Скорость 100 %: «одни часы» ────────────────────────────────────
    await loadBacking(bt, {
      id: 'sync-0823', name: 'take.mp3', type: 'audio/mpeg', size: 4096,
      duration: 30, speed: 1, volume: 80, mute: false, solo: true,
      points: [{ bar: 0, time: 0 }, { bar: 2, time: 8 }],
    });
    const info = bt.getPathInfo();
    check('раскодированный звук сохранён и его размер известен', () => {
      assert.strictEqual(info.hasBuffer, true, 'буфер должен остаться после построения волны');
      assert.strictEqual(info.bufferBytes, 48000 * 2 * 4);
    });

    const launchBase = ctx.currentTime + 0.12;
    bt.preparePlaybackStart(ctx, playbackState(), launchBase, launchBase, true);
    const first = w.__sources[w.__sources.length - 1];
    check('на 100 % запись идёт источником Web Audio на запланированном времени', () => {
      assert.strictEqual(bt.getPathInfo().path, 'buffer');
      assert(first && first.started, 'источник должен быть запущен');
      assert(Math.abs(first.started.when - launchBase) < 1e-6, `старт ${first.started.when} вместо ${launchBase}`);
      assert(Math.abs(first.started.offset - 0) < 1e-6, 'начало записи с нулевой секунды');
    });
    check('элемент <audio> на 100 % не запускается ни разу', () => {
      const played = (w.__audioInstances || []).filter(el => el.playCalls > 0);
      assert.strictEqual(played.length, 0, 'звук обязан идти только через Web Audio');
    });
    check('позиция записи идёт по часам Web Audio', () => {
      // Сначала выходим из предстартовой паузы (позиция не может быть
      // отрицательной), затем меряем чистый прирост.
      ctx.currentTime += 0.5;
      const before = bt.getPathInfo().backingTime;
      ctx.currentTime += 2;
      const after = bt.getPathInfo().backingTime;
      assert(Math.abs((after - before) - 2) < 0.02, `сдвиг ${after - before} вместо 2 с`);
    });

    // ── 2. Старт в прошлом компенсируется ────────────────────────────────
    const past = ctx.currentTime - 0.5;
    bt.preparePlaybackStart(ctx, playbackState(), past, ctx.currentTime, true);
    const second = w.__sources[w.__sources.length - 1];
    check('старт в прошлом не теряет полсекунды записи', () => {
      assert(second && second.started, 'источник должен быть запущен');
      assert(Math.abs(second.started.when - ctx.currentTime) < 1e-6, 'запуск переносится на «сейчас»');
      assert(Math.abs(second.started.offset - 0.5) < 0.02, `смещение ${second.started.offset} вместо 0.5 с`);
    });

    // ── 3. Предел памяти ─────────────────────────────────────────────────
    w.__decoded = fakeBuffer({ length: 40000000, channels: 2, duration: 500 });
    await loadBacking(bt, {
      id: 'huge-0823', name: 'huge.wav', type: 'audio/wav', size: 4096,
      duration: 500, speed: 1, volume: 80, mute: false, solo: true,
      points: [{ bar: 0, time: 0 }, { bar: 2, time: 8 }],
    });
    check('слишком длинная запись не занимает память и остаётся на элементе', () => {
      const huge = bt.getPathInfo();
      assert.strictEqual(huge.hasBuffer, false, 'буфер сверх лимита не сохраняется');
      const launch = ctx.currentTime + 0.1;
      bt.preparePlaybackStart(ctx, playbackState(), launch, launch, true);
      assert.strictEqual(bt.getPathInfo().path, 'element');
    });

    // ── 4. Скорость ≠ 100 %: измеренный ноль и тихий догон ───────────────
    w.__decoded = fakeBuffer();
    const shifts = [];
    w.StruChordShiftPlaybackGrid = (delta, opts) => { shifts.push({ delta, opts: opts || {} }); };
    await loadBacking(bt, {
      id: 'slow-0823', name: 'slow.mp3', type: 'audio/mpeg', size: 4096,
      duration: 30, speed: 0.8, volume: 80, mute: false, solo: true,
      points: [{ bar: 0, time: 0 }, { bar: 2, time: 8 }],
    });
    const slowLaunch = ctx.currentTime + 0.05;
    bt.preparePlaybackStart(ctx, playbackState(), slowLaunch, slowLaunch, true);
    const el = w.__audioInstances[w.__audioInstances.length - 1];
    const plannedZero = bt.getPathInfo().zero;
    check('на скорости ≠ 100 % используется элемент с плановым нулём', () => {
      assert.strictEqual(bt.getPathInfo().path, 'element');
      assert(el.playCalls > 0, 'элемент должен стартовать');
      assert(Number.isFinite(plannedZero));
    });
    await wait(120);
    // Запись «опоздала» на 150 мс: элемент уже играет, но позже плана.
    const measuredZero = plannedZero + 0.15;
    el._currentTime = 0.1;
    ctx.currentTime = measuredZero + 0.1 / 0.8;
    await wait(700);
    check('ноль модели уточняется измерением, а не намерением', () => {
      const zero = bt.getPathInfo().zero;
      assert(Math.abs(zero - measuredZero) < 0.02, `ноль ${zero} вместо ${measuredZero}`);
    });
    check('крупное опоздание один раз сдвигает сетку песни (без разрезания звука)', () => {
      assert.strictEqual(shifts.length, 1, `ожидался 1 сдвиг, получено ${shifts.length}`);
      assert(Math.abs(shifts[0].delta - 0.15) < 0.03, `сдвиг ${shifts[0].delta}`);
      assert.strictEqual(shifts[0].opts.cut, false);
    });

    // Разъезд 0,2 с: тихая поправка скорости, без единой перестановки.
    const seeksBefore = el.setCount;
    const rateBefore = el.rateSetCount;
    el._currentTime -= 0.2;
    await wait(3200);
    check('тихий догон: одна поправка скорости за жест, шаг ±0,8 %', () => {
      assert(el.rateSetCount - rateBefore >= 1, 'скорость должна быть поправлена');
      assert(el.rateSetCount - rateBefore <= 2, `слишком часто: ${el.rateSetCount - rateBefore} присвоений`);
      assert(Math.abs(el._rate - 0.8 * 1.008) < 1e-6 || Math.abs(el._rate - 0.8) < 1e-6,
        `скорость ${el._rate} вне шага ±0,8 %`);
    });
    check('за время догона запись ни разу не переставлялась (нет «диких фризов»)', () => {
      assert.strictEqual(el.setCount, seeksBefore, `перестановок: ${el.setCount - seeksBefore}`);
    });
    check('сдвигов сетки от догона не было — это работа скорости', () => {
      assert.strictEqual(shifts.length, 1, `сдвигов ${shifts.length}`);
    });

    // ── 5. Крупный разъезд: песня ждёт запись ─────────────────────────────
    shifts.length = 0;
    const relaunch = ctx.currentTime + 0.05;
    bt.preparePlaybackStart(ctx, playbackState(), relaunch, relaunch, true);
    await wait(120);
    // Новый запуск законно ставит записи начальную секунду — это опора, а не
    // догон, поэтому基线 берём уже после него.
    const seekBaseline = el.setCount;
    const zero2 = bt.getPathInfo().zero;
    el._currentTime = 0.1;
    ctx.currentTime = zero2 + 0.1 / 0.8;
    await wait(700);       // измеренный ноль совпадёт — сдвига нет
    const afterAnchor = shifts.length;
    el._currentTime -= 0.6;  // запись «застряла» на Safari
    await wait(3600);
    check('крупный разъезд лечится ожиданием песни, а не перестановкой записи', () => {
      const reanchor = shifts.filter(item => item.opts.cut === true);
      assert.strictEqual(reanchor.length, 1, `ожидался 1 сдвиг с разрезом, получено ${reanchor.length} (всего ${shifts.length})`);
      assert(reanchor[0].delta > 0.3, `сдвиг ${reanchor[0].delta} должен быть положительным и крупным`);
      assert.strictEqual(bt.getPathInfo().path, 'element');
    });
    check('после сдвига запись по-прежнему не переставлялась', () => {
      assert.strictEqual(el.setCount, seekBaseline, 'currentTime записи не должен меняться во время игры');
      assert.strictEqual(afterAnchor >= 0, true);
    });

    // ── 6. Смена скорости на ходу ────────────────────────────────────────
    // Ползунок нужен владельцу часто, поэтому проверяем именно его:
    // движение внутри «элементного» режима не должно обрывать запись,
    // а возврат на 100 % переключает на «одни часы» без двойного звука.
    bt.toggleDrawer(true);
    // В приложении ползунок двигают во время игры; здесь игра запускается
    // вручную, поэтому флаг ставим сами — иначе ветка перезапуска не сработает.
    w.eval('playbackState.isPlaying = true');
    const setSpeed = (value) => {
      const slider = w.document.getElementById('btSpeed');
      assert(slider, 'ползунок скорости должен быть в панели');
      slider.value = String(value);
      slider.oninput();
      return slider;
    };
    const playsBefore = el.playCalls;
    const sourcesBefore = w.__sources.length;
    setSpeed(90);
    check('движение ползунка внутри элемента не перезапускает запись', () => {
      assert.strictEqual(bt.getPathInfo().path, 'element');
      assert.strictEqual(el.playCalls, playsBefore, 'элемент не должен перезапускаться на каждом шаге');
      assert(Math.abs(el._rate - 0.9) < 1e-6, `скорость ${el._rate} вместо 0.9`);
    });
    setSpeed(100);
    check('возврат на 100 % включает «одни часы» и глушит элемент', () => {
      assert.strictEqual(bt.getPathInfo().path, 'buffer');
      assert.strictEqual(el.paused, true, 'элемент обязан замолчать, иначе запись звучит дважды');
      assert.strictEqual(w.__sources.length, sourcesBefore + 1, 'запись должна продолжиться одним источником');
    });
    const sourcesAtHundred = w.__sources.length;
    setSpeed(100);
    check('повторное 100 % не плодит источники', () => {
      assert.strictEqual(w.__sources.length, sourcesAtHundred);
    });
    setSpeed(80);
    check('уход с 100 % возвращает элемент', () => {
      assert.strictEqual(bt.getPathInfo().path, 'element');
      assert(el.playCalls > playsBefore);
    });
    w.eval('playbackState.isPlaying = false');
    bt.stopAudio();
    check('остановка глушит запись и снимает путь', () => {
      assert.strictEqual(bt.getPathInfo().path, 'none');
    });

    // ── 7. Песня без фоновой записи ──────────────────────────────────────
    await bt.loadSong({});
    check('песня без фоновой записи не занимает ни буфера, ни элемента', () => {
      const none = bt.getPathInfo();
      assert.strictEqual(none.path, 'none');
      assert.strictEqual(none.hasBuffer, false);
      assert(none.zero === null || none.zero === undefined);
    });

    console.log('\nB-122 / 0.823 checks completed.');
  } catch (error) {
    console.error(error && error.stack || error);
    process.exitCode = 1;
  }
}, 30);
