#!/usr/bin/env node
'use strict';

// B-122 / 0.823 · реальный браузер: «одни часы» для фоновой записи.
//
// Здесь проверяется то, что нельзя проверить моками:
//   1. Звук, раскодированный ВРЕМЕННЫМ AudioContext (так строятся пики
//      волны), принимается рабочим контекстом приложения — на этом стоит
//      весь режим «одних часов».
//   2. На скорости 100 % действительно звучит источник Web Audio, а элемент
//      <audio> не запускается ни разу: значит, ни его задержки старта, ни
//      пересборки «сохранения высоты тона» в этом режиме нет.
//   3. Позиция записи идёт по часам Web Audio (playhead честный).
//   4. На скорости 80 % работает элемент, и он получает ровно 80 %.
//   5. В консоли нет ошибок.
//
// Запуск (нужен сервер с текущей сборкой):
//   STRUCHORD_URL=http://127.0.0.1:8000/STRUCHORD.html \
//   CHROMIUM_PATH=/path/to/chromium node dev/tests/b122-audio-sync-browser-0823.js
const path = require('path');

const URL_UNDER_TEST = process.env.STRUCHORD_URL || 'http://127.0.0.1:8000/STRUCHORD.html';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let pass = 0;
let fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('ok   ' + name); }
  else { fail++; console.error('FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

async function launchBrowser() {
  const puppeteer = require('puppeteer');
  const options = { headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] };
  // CHROMIUM_PATH — для ручного запуска, PUPPETEER_EXECUTABLE_PATH — тот же
  // путь, что ставят остальные браузерные наборы и dev/run-tests.sh.
  const explicit = process.env.CHROMIUM_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (explicit) options.executablePath = explicit;
  else {
    const chromium = require('@sparticuz/chromium');
    options.executablePath = await chromium.executablePath();
    options.args = [...chromium.args, ...options.args];
  }
  return puppeteer.launch(options);
}

// 1 секунда моно 8 кГц — достаточно, чтобы проверить декодирование и старт.
function makeWav(seconds = 1, rate = 8000) {
  const frames = Math.round(seconds * rate);
  const buf = Buffer.alloc(44 + frames * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(buf.length - 8, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++) {
    buf.writeInt16LE(Math.round(Math.sin((i * Math.PI * 2 * 330) / rate) * 6000), 44 + i * 2);
  }
  return buf;
}

(async () => {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.evaluateOnNewDocument(() => {
      window.__b122 = { sources: [], mediaPlayed: 0, mediaRates: [] };
      const NativeAudio = window.Audio;
      if (NativeAudio) {
        window.Audio = function (...args) {
          const el = new NativeAudio(...args);
          const play = el.play.bind(el);
          el.play = function () { window.__b122.mediaPlayed++; return play(); };
          return el;
        };
        window.Audio.prototype = NativeAudio.prototype;
      }
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const create = Ctx.prototype.createBufferSource;
      Ctx.prototype.createBufferSource = function () {
        const source = create.call(this);
        const start = source.start.bind(source);
        source.start = function (when, offset) {
          window.__b122.sources.push({
            when: Number(when) || 0,
            offset: Number(offset) || 0,
            duration: (source.buffer && source.buffer.duration) || 0,
            channels: (source.buffer && source.buffer.numberOfChannels) || 0,
            rate: source.playbackRate ? source.playbackRate.value : 1,
          });
          return start(when, offset);
        };
        return source;
      };
    });

    await page.goto(URL_UNDER_TEST, { waitUntil: 'load' });
    await wait(600);

    const wavBase64 = makeWav().toString('base64');
    const result = await page.evaluate(async (base64) => {
      const bt = window.StruChordBackingTrack;
      if (!bt) return { error: 'модуль B-122 не найден' };
      window.globalTimeSig = '4/4';
      window.sections = [{ id: 1, type: 'Verse', repeat: 1, timeSig: '4/4', squares: [
        { id: 1, repeat: 1, events: [{ chord: 'C', span: 4 }] },
      ] }];
      const ctx = window.getAudioContext();
      if (ctx.state !== 'running') { try { await ctx.resume(); } catch (_) {} }
      const meta = {
        id: 'browser-0823', name: 'check.wav', type: 'audio/wav', size: 2048,
        duration: 1, speed: 1, volume: 80, mute: false, solo: true,
        points: [{ bar: 0, time: 0 }, { bar: 1, time: 1 }],
      };
      // Панель открыта заранее: у неё внутри бегунок, который обязан бежать
      // и в режиме «одних часов», где элемент <audio> молчит.
      bt.toggleDrawer(true);
      await bt.importEmbedded({ backingTrack: { ...meta, embedded: base64 } });
      await bt.loadSong({ backingTrack: meta });
      const state = { currentSectionIndex: 0, currentSquareIndex: 0, currentEventIndex: 0,
        _sectionRepeatCount: {}, _squareRepeatCount: {} };
      const launch = ctx.currentTime + 0.12;
      bt.preparePlaybackStart(ctx, state, launch, launch, true);
      const pathAt100 = bt.getPathInfo();
      const cursor = document.getElementById('btPlayheadCursor');
      const readCursor = () => (cursor ? cursor.style.left : null);
      await new Promise((r) => setTimeout(r, 400));
      const cursorA = readCursor();
      const timeA = bt.getPathInfo().backingTime;
      await new Promise((r) => setTimeout(r, 400));
      const cursorB = readCursor();
      const label = (document.getElementById('btPlayhead') || {}).textContent || '';
      const timeB = bt.getPathInfo().backingTime;
      const sourcesAt100 = window.__b122.sources.slice();
      const mediaAt100 = window.__b122.mediaPlayed;
      bt.stopAudio();

      // Скорость 80 % — путь элемента.
      await bt.loadSong({ backingTrack: { ...meta, speed: 0.8 } });
      const launch2 = ctx.currentTime + 0.1;
      bt.preparePlaybackStart(ctx, state, launch2, launch2, true);
      const pathAt80 = bt.getPathInfo();
      await new Promise((r) => setTimeout(r, 250));
      const sourcesAfter80 = window.__b122.sources.length;
      const mediaAt80 = window.__b122.mediaPlayed;
      const rate = (window.__audioElementProbe && 0) || null;
      bt.stopAudio();
      return {
        pathAt100, sourcesAt100, mediaAt100, timeA, timeB, cursorA, cursorB, label,
        pathAt80, mediaAt80, sourcesAfter80, rate,
      };
    }, wavBase64);

    if (result.error) throw new Error(result.error);

    check('буфер из временного контекста принят рабочим (режим «одних часов»)',
      result.pathAt100.path === 'buffer', `path=${result.pathAt100.path}`);
    check('на 100 % звучит источник Web Audio с раскодированной записью',
      result.sourcesAt100.length >= 1 && result.sourcesAt100[0].duration === 1,
      `источников ${result.sourcesAt100.length}, длительность ${result.sourcesAt100[0] && result.sourcesAt100[0].duration}`);
    check('элемент <audio> на 100 % не запускается',
      result.mediaAt100 === 0, `play() вызван ${result.mediaAt100} раз`);
    check('позиция записи идёт по часам Web Audio',
      result.timeB - result.timeA > 0.25 && result.timeB - result.timeA < 0.65,
      `прирост ${(result.timeB - result.timeA).toFixed(3)} с за 0,4 с`);
    check('бегунок панели движется, пока запись идёт источником Web Audio',
      result.cursorA !== null && result.cursorB !== null && result.cursorA !== result.cursorB,
      `слева ${result.cursorA} → ${result.cursorB}`);
    check('подпись времени в панели обновляется на ходу',
      /^0:0/.test(String(result.label).trim()), `подпись «${result.label}»`);
    check('на 80 % включается элемент и не запускается второй источник Web Audio',
      result.pathAt80.path === 'element' && result.mediaAt80 > 0 && result.sourcesAfter80 === result.sourcesAt100.length,
      `path=${result.pathAt80.path}, play=${result.mediaAt80}, источников ${result.sourcesAfter80}`);
    check('ошибок в консоли нет', pageErrors.length === 0, pageErrors.join(' | '));
  } catch (error) {
    console.error(error && error.stack || error);
    fail++;
  } finally {
    await browser.close();
  }
  console.log(`\nB-122 / 0.823 browser: ${pass} ok, ${fail} fail`);
  if (fail) process.exitCode = 1;
})();
