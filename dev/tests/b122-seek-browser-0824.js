#!/usr/bin/env node
'use strict';

// B-122 / 0.824 · перемотки в настоящем браузере.
//
// Здесь проверяется то, чего не видно в jsdom: как перемотка звучит и
// выглядит на живом звуке.
//   1. Клик по аккорду ВО ВРЕМЯ игры: старая запись гаснет, новая начинается
//      на секунде нажатой ячейки (с учётом поправки «Сдвиг записи»), а сетка
//      песни перезапускается — то есть аккорды и запись прыгают вместе.
//   2. Панель волны сразу показывает новое место (время и бегунок).
//   3. Перемотка в Ленте: после прокрутки и Play запись стартует на секунде
//      подсвеченной ячейки, а не с начала песни.
//   4. Ошибок в консоли нет.
//
//   STRUCHORD_URL=http://127.0.0.1:8000/STRUCHORD.html \
//   PUPPETEER_EXECUTABLE_PATH=/path/to/chromium node dev/tests/b122-seek-browser-0824.js
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
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
  const explicit = process.env.CHROMIUM_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (explicit) options.executablePath = explicit;
  else {
    const chromium = require('@sparticuz/chromium');
    options.executablePath = await chromium.executablePath();
    options.args = [...chromium.args, ...options.args];
  }
  return puppeteer.launch(options);
}

function makeWav(seconds = 20, rate = 8000) {
  const frames = Math.round(seconds * rate);
  const buf = Buffer.alloc(44 + frames * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(buf.length - 8, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++) {
    buf.writeInt16LE(Math.round(Math.sin((i * Math.PI * 2 * 220) / rate) * 5000), 44 + i * 2);
  }
  return buf;
}

(async () => {
  const browser = await launchBrowser();
  const pageErrors = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000 });
    page.on('pageerror', (e) => pageErrors.push(e.message));

    await page.evaluateOnNewDocument(() => {
      window.__b824 = { sources: [] };
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const create = Ctx.prototype.createBufferSource;
      Ctx.prototype.createBufferSource = function () {
        const source = create.call(this);
        const start = source.start.bind(source);
        source.start = function (when, offset) {
          window.__b824.sources.push({ when: Number(when) || 0, offset: Number(offset) || 0 });
          return start(when, offset);
        };
        return source;
      };
    });

    const fixture = fs.readFileSync(path.join(ROOT, 'dev', 'fixtures', 'wind-of-change.json'), 'utf8');
    const wav = makeWav().toString('base64');
    await page.goto(URL_UNDER_TEST, { waitUntil: 'load', timeout: 60000 });
    await wait(700);
    await page.evaluate((text) => window.importSong(new File([text], 'wind-of-change.json', { type: 'application/json' })), fixture);
    await wait(1300);
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button')).find((x) => (x.textContent || '').trim() === 'Продолжить');
      if (b) b.click();
    });
    await wait(1000);

    // Запись приходит со сдвигом 2 с — так владелец и выравнивает файл,
    // записанный с лишним вступлением.
    await page.evaluate((base64) => {
      window.__ready = false;
      const bt = window.StruChordBackingTrack;
      const meta = {
        id: 'seek-b824', name: 'take.mp3', type: 'audio/wav', size: 1000,
        duration: 20, speed: 1, volume: 80, mute: false, solo: true, trackOffset: 2,
        points: [{ bar: 0, time: 0 }, { bar: 4, time: 6 }],
      };
      bt.importEmbedded({ backingTrack: { ...meta, embedded: base64 } })
        .then(() => bt.loadSong({ backingTrack: meta }))
        .then(() => { bt.toggleDrawer(true); window.__ready = true; })
        .catch(() => { window.__ready = true; });
    }, wav);
    await page.waitForFunction('window.__ready === true', { timeout: 30000 });
    await wait(600);

    const lastDiagnostics = (count) => page.evaluate((n) => {
      let list = [];
      try { list = JSON.parse(localStorage.getItem('struchord-audio-diagnostics-v1') || '[]'); } catch (_) {}
      return list.slice(-n).map((e) => ({ type: e.type, offset: e.offset, target: e.target }));
    }, count);

    // ── A. Играем, затем клик по аккорду ─────────────────────────────────
    await page.evaluate(() => document.getElementById('btnPlay').click());
    await wait(1000);
    const playingBefore = await page.evaluate(() => ({
      playing: playbackState.isPlaying,
      sqi: playbackState.currentSquareIndex,
      start: playbackStartTime,
      label: (document.getElementById('btPlayhead') || {}).textContent,
    }));
    const clicked = await page.evaluate(() => {
      // Второй квадрат интро (его id в песне — 3): время по сетке — такт 2.
      const cell = Array.from(document.querySelectorAll('.chord-wrapper'))
        .find((c) => c.dataset.sec === '1' && c.dataset.square === '3' && Number(c.dataset.ei) === 0);
      if (!cell) return null;
      const box = { sec: cell.dataset.sec, square: cell.dataset.square, ei: cell.dataset.ei };
      cell.click();
      return box;
    });
    await wait(900);
    const afterClick = await page.evaluate(() => ({
      playing: playbackState.isPlaying,
      sqi: playbackState.currentSquareIndex,
      start: playbackStartTime,
      label: (document.getElementById('btPlayhead') || {}).textContent,
      cursorLeft: (document.getElementById('btPlayheadCursor') || {}).style ? document.getElementById('btPlayheadCursor').style.left : null,
      path: window.StruChordBackingTrack.getPathInfo().path,
      backingTime: window.StruChordBackingTrack.getPathInfo().backingTime,
    }));
    const sourcesAfterClick = await page.evaluate(() => window.__b824.sources.slice());

    check('клик по аккорду найден в редакторе', !!clicked, 'ячейка второго квадрата не найдена');
    check('игра продолжается после перемотки кликом', afterClick.playing === true);
    check('запись перезапущена и звучит новым источником',
      afterClick.path === 'buffer' && sourcesAfterClick.length >= 2);
    // Такт 2 = 1,5 с по сетке (точки: такт 1 -> 0, такт 5 -> 6), плюс сдвиг 2 с.
    const jumpOffset = sourcesAfterClick.length ? sourcesAfterClick[sourcesAfterClick.length - 1].offset : -1;
    check('запись встала на секунду нажатого аккорда с поправкой «Сдвиг записи»',
      Math.abs(jumpOffset - 3.5) < 0.25, `запись начинается с ${jumpOffset} с, ожидалось ≈3,5 (1,5 по сетке + 2 поправки)`);
    check('сетка песни перезапущена вместе с записью, а не осталась старой',
      afterClick.start > playingBefore.start + 0.5, `${playingBefore.start} → ${afterClick.start}`);
    check('панель волны показывает новое место, а не прежнее',
      Math.abs(Number(afterClick.backingTime) - 3.5) < 0.8, `в панели ${afterClick.backingTime} с`);

    // ── C. То же на скорости 80 % — там запись идёт элементом <audio> ────
    // Игра продолжается с прошлого шага: кнопка Play в редакторе работает
    // как «стоп», поэтому её здесь НЕ нажимаем.
    await page.evaluate(() => {
      const slider = document.getElementById('btSpeed');
      if (slider) { slider.value = '80'; slider.oninput && slider.oninput(); }
    });
    await wait(700);
    await page.evaluate(() => {
      const cell = Array.from(document.querySelectorAll('.chord-wrapper'))
        .find((c) => c.dataset.sec === '1' && c.dataset.square === '3' && Number(c.dataset.ei) === 0);
      if (cell) cell.click();
    });
    await wait(1200);
    const slow = await page.evaluate(() => ({
      path: window.StruChordBackingTrack.getPathInfo().path,
      backingTime: window.StruChordBackingTrack.getPathInfo().backingTime,
      playing: playbackState.isPlaying,
      sqi: playbackState.currentSquareIndex,
    }));
    check('на 80 % перемотка кликом тоже ставит запись на место',
      slow.playing === true && slow.path === 'element' && Math.abs(slow.backingTime - 3.5) < 1.0,
      `путь ${slow.path}, в записи ${slow.backingTime} с`);

    // Возвращаем 100 % — дальше проверяется «одни часы» в Ленте.
    await page.evaluate(() => {
      const slider = document.getElementById('btSpeed');
      if (slider) { slider.value = '100'; slider.oninput && slider.oninput(); }
    });
    await wait(400);

    // ── B. Лента: прокрутка и Play ───────────────────────────────────────
    // Сначала честно останавливаем игру (кнопка Play в редакторе = «стоп»).
    const wasPlaying = await page.evaluate(() => playbackState.isPlaying);
    if (wasPlaying) {
      await page.evaluate(() => document.getElementById('btnPlay').click());
      await wait(600);
    }
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button, [role="tab"]'))
        .find((x) => (x.textContent || '').trim() === 'Лента');
      if (b) b.click();
    });
    await wait(900);
    await page.evaluate(() => {
      const vp = document.getElementById('timelineViewport');
      if (!vp) return;
      vp.scrollLeft = Math.round(vp.scrollWidth * 0.3);
      vp.dispatchEvent(new Event('scroll'));
    });
    await wait(700);
    const afterScroll = await page.evaluate(() => ({
      label: (document.getElementById('btPlayhead') || {}).textContent || '',
      activeSec: (document.querySelector('.tl-cell.tl-active') || {}).dataset ? document.querySelector('.tl-cell.tl-active').dataset.sec : null,
    }));
    const sourcesBeforeTimeline = await page.evaluate(() => window.__b824.sources.length);
    await page.evaluate(() => document.getElementById('btnPlay').click());
    await wait(1000);
    const timelinePlaying = await page.evaluate(() => ({
      playing: playbackState.isPlaying,
      path: window.StruChordBackingTrack.getPathInfo().path,
      backingTime: window.StruChordBackingTrack.getPathInfo().backingTime,
    }));
    const sourcesTimeline = await page.evaluate(() => window.__b824.sources.slice());
    const timelineOffset = sourcesTimeline.length > sourcesBeforeTimeline ? sourcesTimeline[sourcesTimeline.length - 1].offset : -1;

    check('Лента: после прокрутки панель волны показывает новое место',
      afterScroll.activeSec !== null && afterScroll.label !== '', `метка ${afterScroll.activeSec}, подпись «${afterScroll.label}»`);
    check('Лента: Play включает запись', timelinePlaying.playing === true && timelinePlaying.path === 'buffer');
    check('Лента: запись стартует не с нуля, а с отмеченного места',
      timelineOffset > 1, `запись начинается с ${timelineOffset} с`);

    // ── D. Клик по волне в редакторе во время игры ───────────────────────
    const wasPlaying2 = await page.evaluate(() => playbackState.isPlaying);
    if (wasPlaying2) {
      await page.evaluate(() => document.getElementById('btnPlay').click());
      await wait(500);
    }
    await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll('button, [role="tab"]'))
        .find((x) => (x.textContent || '').trim() === 'Гитара');
      if (b) b.click();
    });
    await wait(900);
    await page.evaluate(() => {
      const slider = document.getElementById('btSpeed');
      if (slider) { slider.value = '100'; slider.oninput && slider.oninput(); }
      const bt = window.StruChordBackingTrack;
      if (bt && document.getElementById('btDrawer').hidden) bt.toggleDrawer(true);
    });
    await wait(500);
    await page.evaluate(() => document.getElementById('btnPlay').click());
    await wait(900);
    const waveBefore = await page.evaluate(() => ({
      playing: playbackState.isPlaying,
      start: playbackStartTime,
      sources: window.__b824.sources.length,
    }));
    await page.evaluate(() => {
      const canvas = document.getElementById('btWaveCanvas');
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = rect.left + rect.width * 0.45;
      const y = rect.top + Math.min(40, rect.height / 2);
      canvas.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true }));
    });
    await wait(1000);
    const waveAfter = await page.evaluate(() => ({
      playing: playbackState.isPlaying,
      start: playbackStartTime,
      sqi: playbackState.currentSquareIndex,
      time: window.StruChordBackingTrack.getPathInfo().backingTime,
      path: window.StruChordBackingTrack.getPathInfo().path,
      sources: window.__b824.sources.slice(),
    }));
    check('клик по волне найден и игра шла', waveBefore.playing === true);
    check('клик по волне во время игры тоже перезапускает запись и песню вместе',
      waveAfter.playing === true
        && waveAfter.sources.length > waveBefore.sources
        && waveAfter.start > waveBefore.start + 0.3,
      `источников ${waveBefore.sources} → ${waveAfter.sources.length}, старт ${waveBefore.start} → ${waveAfter.start}`);
    check('клик по волне ставит запись в выбранное место, а не в начало',
      Number(waveAfter.time) > 1, `в записи ${waveAfter.time} с`);

    check('ошибок в консоли нет', pageErrors.length === 0, pageErrors.join(' | '));

    const log = await lastDiagnostics(8);
    console.log('\nпоследние записи аудиожурнала: ' + JSON.stringify(log));
  } catch (error) {
    console.error(error && error.stack || error);
    fail++;
  } finally {
    await browser.close();
  }
  console.log(`\nB-122 / 0.824 seek browser: ${pass} ok, ${fail} fail`);
  if (fail) process.exitCode = 1;
})();
