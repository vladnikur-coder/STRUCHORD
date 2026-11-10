#!/usr/bin/env node
'use strict';

// Real-browser regression: imports an actual fixture, resolves the legacy
// metadata dialog through its visible button, and starts/stops via real clicks.
// Unlike the older smoke script, this does not call playAll() directly (which
// bypasses modal hit-testing and can make a visually blocked UI look healthy).
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'dev', 'fixtures', 'wind-of-change.json');
const HTML = path.join(ROOT, 'STRUCHORD.html');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const checks = [];
function check(name, pass, detail = '') {
  checks.push({ name, pass: !!pass, detail });
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function launchBrowser() {
  const options = {
    headless: true,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
  };
  if (process.env.CHROMIUM_PATH) {
    options.executablePath = process.env.CHROMIUM_PATH;
  } else {
    const chromium = require('@sparticuz/chromium');
    options.executablePath = await chromium.executablePath();
    options.args = [...chromium.args, ...options.args];
  }
  return puppeteer.launch(options);
}

(async () => {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.evaluateOnNewDocument(() => {
      window.__liveAudioStarts = { oscillators: 0, buffers: 0 };
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      for (const [method, counter] of [['createOscillator', 'oscillators'], ['createBufferSource', 'buffers']]) {
        const originalCreate = Audio.prototype[method];
        if (typeof originalCreate !== 'function') continue;
        Audio.prototype[method] = function (...args) {
          const source = originalCreate.apply(this, args);
          const originalStart = source.start.bind(source);
          source.start = (...startArgs) => {
            window.__liveAudioStarts[counter]++;
            return originalStart(...startArgs);
          };
          return source;
        };
      }
    });
    await page.goto(`file://${HTML}`, { waitUntil: 'networkidle0' });

    const songText = fs.readFileSync(FIXTURE, 'utf8');
    await page.evaluate((text) => {
      window.importSong(new File([new Blob([text])], 'wind-of-change.json'));
    }, songText);
    await wait(250);

    // The fixture deliberately exercises the old-name migration flow.
    const migrationDialog = await page.$('.legacy-metadata-overlay');
    if (migrationDialog) {
      await page.click('#legacyMetadataConfirm');
      await page.waitForSelector('.legacy-metadata-overlay', { hidden: true });
    }
    check('legacy migration overlay is gone before transport input',
      !(await page.$('.legacy-metadata-overlay')));

    // Exercise the actual button hit target, not a JS call around it.
    await page.click('#btnPlay');
    await page.waitForFunction(() => !!document.querySelector('.chord-wrapper.playback-active'), { timeout: 2500 });
    const editorStart = await page.evaluate(() => ({
      playing: playbackState.isPlaying,
      state: getAudioContext() && getAudioContext().state,
      time: getAudioContext() && getAudioContext().currentTime,
      active: !!document.querySelector('.chord-wrapper.playback-active'),
      sources: window.__liveAudioStarts.oscillators + window.__liveAudioStarts.buffers,
    }));
    check('real Play click starts audio and highlights the sounding chord',
      editorStart.playing && editorStart.state === 'running' && editorStart.active && editorStart.sources > 0,
      JSON.stringify(editorStart));
    await wait(2200);
    const editorAdvance = await page.evaluate(() => ({
      playing: playbackState.isPlaying,
      time: getAudioContext() && getAudioContext().currentTime,
      eventIndex: playbackState.currentEventIndex,
      active: !!document.querySelector('.chord-wrapper.playback-active'),
    }));
    check('editor playback clock advances and retains a live chord highlight',
      editorAdvance.playing && editorAdvance.time > editorStart.time + 1.8 && editorAdvance.active,
      JSON.stringify(editorAdvance));
    await page.click('#btnPlay');
    await wait(200);
    check('real Play button stops editor playback',
      !(await page.evaluate(() => playbackState.isPlaying)));

    await page.evaluate(() => toggleTimelineMode(true));
    await wait(400);
    const before = await page.evaluate(() => ({
      scroll: document.getElementById('timelineViewport').scrollLeft,
      ctx: getAudioContext() && getAudioContext().currentTime,
    }));
    await page.click('#btnPlay');
    await wait(3200);
    const after = await page.evaluate(() => ({
      playing: playbackState.isPlaying,
      time: getAudioContext() && getAudioContext().currentTime,
      eventIndex: playbackState.currentEventIndex,
      scroll: document.getElementById('timelineViewport').scrollLeft,
      active: !!document.querySelector('.tl-cell.tl-active'),
    }));
    check('real Play click advances the ribbon and highlights its current cell',
      after.playing && after.time > before.ctx + 2.7 && after.scroll > before.scroll + 40 && after.active,
      JSON.stringify({ before, after }));

    // Measure frame cadence only after a real, unblocked start. The test
    // rejects broad jank, rather than a single noisy frame in a shared VM.
    const frames = await page.evaluate(async () => {
      const times = [];
      let raf = 0;
      const start = performance.now();
      await new Promise((resolve) => {
        const tick = (time) => {
          times.push(time);
          if (time - start >= 3000) resolve();
          else raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      });
      cancelAnimationFrame(raf);
      const gaps = times.slice(1).map((time, i) => time - times[i]).sort((a, b) => a - b);
      const quantile = (q) => gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * q))] || Infinity;
      const over20 = gaps.filter((gap) => gap > 20).length;
      return { frames: gaps.length, median: quantile(0.5), p95: quantile(0.95), over20, over20Pct: over20 / gaps.length };
    });
    check('live ribbon animation stays near 60 FPS without sustained frame stalls',
      frames.frames > 100 && frames.median < 19 && frames.p95 < 24 && frames.over20Pct < 0.1,
      JSON.stringify(frames));

    await page.click('#btnPlay');
    check('real Play button stops ribbon playback',
      !(await page.evaluate(() => playbackState.isPlaying)));
    check('no uncaught browser JavaScript errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  } finally {
    await browser.close();
  }
  const failed = checks.filter((result) => !result.pass);
  console.log(`\nLive playback browser checks: ${checks.length - failed.length}/${checks.length} passed`);
  process.exitCode = failed.length ? 1 : 0;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
