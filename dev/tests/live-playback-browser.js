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
const FIXTURE = process.env.PLAYBACK_FIXTURE || path.join(ROOT, 'dev', 'fixtures', 'wind-of-change.json');
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
      window.__liveMedia = [];
      const NativeAudioElement = window.Audio;
      if (NativeAudioElement) {
        window.Audio = function (...args) {
          const audio = new NativeAudioElement(...args);
          window.__liveMedia.push(audio);
          return audio;
        };
        window.Audio.prototype = NativeAudioElement.prototype;
      }
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

    const sourceText = fs.readFileSync(FIXTURE, 'utf8');
    const songData = JSON.parse(sourceText);
    const hasBackingAudio = !!songData.backingTrack;
    const firstSection = (songData.sections || [])[0];
    const firstEvent = firstSection && firstSection.squares && firstSection.squares[0] &&
      firstSection.squares[0].events && firstSection.squares[0].events[0];
    const startPattern = firstSection && (firstSection.strumPattern || (firstEvent && firstEvent.strumPattern));
    let hasStrumPattern = !!(startPattern && Array.isArray(startPattern.steps) &&
      startPattern.steps.some((step) => Array.isArray(step) ? step.length > 0 : !!step));
    // Ensure even a rhythm-free smoke fixture exercises the animation path
    // from the very first event; this is test data only, not app mutation.
    let songText = sourceText;
    if (!hasStrumPattern && firstSection) {
      const numerator = Number(String(firstSection.timeSig || songData.globalTimeSig || '4/4').split('/')[0]) || 4;
      firstSection.strumPattern = {
        mode: 'strum', subdivision: 1,
        steps: Array.from({ length: numerator }, (_, i) => i % 2 ? 'U' : 'D'),
      };
      songText = JSON.stringify(songData);
      hasStrumPattern = true;
    }
    await page.evaluate((text) => {
      window.importSong(new File([new Blob([text])], 'playback-regression.json'));
    }, songText);
    await wait(250);
    if (hasBackingAudio) {
      await page.waitForFunction(() => window.__liveMedia.some((audio) => audio.readyState >= 1), { timeout: 20000 });
      check('embedded backing audio is decoded and loaded before Play', true,
        `${await page.evaluate(() => window.__liveMedia[0]?.duration || 0)} s`);
    }

    // The default fixture deliberately exercises the old-name migration flow.
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
      backing: window.__liveMedia.map((audio) => ({ paused: audio.paused, time: audio.currentTime })),
    }));
    check('real Play click starts audio and highlights the sounding chord',
      editorStart.playing && editorStart.state === 'running' && editorStart.active &&
        (hasBackingAudio ? editorStart.backing.some((audio) => !audio.paused && audio.time > 0) : editorStart.sources > 0),
      JSON.stringify(editorStart));
    const svgDimensions = await page.evaluate(() => {
      const svg = document.querySelector('#fingering-tooltip svg');
      return svg ? { width: svg.getAttribute('width'), height: svg.getAttribute('height'), style: svg.getAttribute('style') || '' } : null;
    });
    check('fingering SVG uses unitless dimensions and CSS rem sizing (Safari-safe)',
      !!svgDimensions && /^\d+(?:\.\d+)?$/.test(svgDimensions.width) &&
        /^\d+(?:\.\d+)?$/.test(svgDimensions.height) && /width:\s*[^;]+rem/.test(svgDimensions.style) &&
        /height:\s*[^;]+rem/.test(svgDimensions.style), JSON.stringify(svgDimensions));
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
    const editorRhythm = await page.evaluate(async () => {
      let peak = 0, previews = 0;
      const until = performance.now() + 1200;
      while (performance.now() < until) {
        const sec = sections[playbackState.currentSectionIndex];
        const els = fingeringStrumStepEls.get('current') || (sec && strumPreviewStepEls.get(sec.id)) || [];
        previews = Math.max(previews, els.length);
        peak = Math.max(peak, els.reduce((n, el) => n + Number(el.classList.contains('strum-step-active')), 0));
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return { peak, previews };
    });
    check('editor playback visibly animates the current strum or picking step',
      !hasStrumPattern || (editorRhythm.previews > 0 && editorRhythm.peak > 0),
      hasStrumPattern ? JSON.stringify(editorRhythm) : 'skipped: fixture has no stored strum/picking pattern');
    const nextChordPreview = await page.evaluate(async () => {
      let visibleMs = 0, chord = '';
      let previous = performance.now();
      const until = previous + 1200;
      while (performance.now() < until) {
        const now = performance.now();
        const tip = document.getElementById('preview-tooltip');
        if (tip && tip.style.display === 'block' && tip.classList.contains('visible')) {
          visibleMs += now - previous;
          chord = tip.querySelector('.fingering-chord-name')?.textContent.trim() || chord;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
        previous = now;
      }
      return { visibleMs: Math.round(visibleMs), chord };
    });
    check('editor keeps the next chord fingering preview visible during playback',
      !hasStrumPattern || (nextChordPreview.visibleMs >= 200 && !!nextChordPreview.chord),
      hasStrumPattern ? JSON.stringify(nextChordPreview) : 'skipped: fixture has no starting rhythm pattern');
    const stopButtonReceivesHit = await page.evaluate(() => {
      const button = document.getElementById('btnPlay');
      const rect = button.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return !!hit && (hit === button || button.contains(hit));
    });
    check('visible fingering popup does not intercept the Play/Stop hit target', stopButtonReceivesHit);
    await page.click('#btnPlay');
    await wait(200);
    check('real Play button stops editor playback',
      !(await page.evaluate(() => playbackState.isPlaying)));

    await page.evaluate(() => openStrumPatternEditor('section', sections[0].id));
    if (!(await page.$('#patternGrid .pattern-step-btn.filled'))) {
      await page.click('#patternGrid .pattern-step-btn[data-step-index="0"]');
    }
    await page.click('#preview-pattern');
    const editorPreview = await page.evaluate(async () => {
      let peak = 0;
      const until = performance.now() + 1000;
      while (performance.now() < until) {
        peak = Math.max(peak, document.querySelectorAll('.pattern-step-btn.is-playing').length);
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return {
        playing: typeof _patternPreviewPlaying !== 'undefined' && _patternPreviewPlaying,
        active: peak,
        audioState: getAudioContext() && getAudioContext().state,
      };
    });
    check('pattern editor preview plays and visibly highlights its current step',
      editorPreview.playing && editorPreview.active > 0 && editorPreview.audioState === 'running',
      JSON.stringify(editorPreview));
    await page.click('#preview-pattern');
    await page.click('#cancel-pattern');
    // Preview notes have a 1.7 s natural decay; let those scheduled voices
    // finish before measuring playback frame cadence on the backing track.
    await wait(1800);

    await page.click('#btnModeToggle');
    await wait(400);
    const before = await page.evaluate(() => ({
      scroll: document.getElementById('timelineViewport').scrollLeft,
      ctx: getAudioContext() && getAudioContext().currentTime,
    }));
    await page.click('#btnPlay');
    await wait(3200);
    const after = await page.evaluate((withBackingAudio) => ({
      playing: playbackState.isPlaying,
      time: getAudioContext() && getAudioContext().currentTime,
      eventIndex: playbackState.currentEventIndex,
      scroll: document.getElementById('timelineViewport').scrollLeft,
      active: !!document.querySelector('.tl-cell.tl-active'),
      backingPlaying: !withBackingAudio || window.__liveMedia.some((audio) => !audio.paused && audio.currentTime > 0),
    }), hasBackingAudio);
    check('real Play click advances the ribbon and highlights its current cell',
      after.playing && after.time > before.ctx + 2.7 && after.scroll > before.scroll + 40 && after.active && after.backingPlaying,
      JSON.stringify({ before, after }));
    const ribbonRhythm = await page.evaluate(async () => {
      let peak = 0, hits = 0;
      const until = performance.now() + 1200;
      while (performance.now() < until) {
        const cell = timelineActiveCell;
        const d = cell && cell.dataset;
        const els = d ? timelineHitEls.get(timelineKey(d.sec, d.square, d.ei, d.secPass, d.sqPass)) || [] : [];
        hits = Math.max(hits, els.length);
        peak = Math.max(peak, els.reduce((n, el) => n + Number(el.classList.contains('tl-hit-on')), 0));
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return { peak, hits };
    });
    check('ribbon rhythm track visibly animates the current strum or picking step',
      !hasStrumPattern || (ribbonRhythm.hits > 0 && ribbonRhythm.peak > 0),
      hasStrumPattern ? JSON.stringify(ribbonRhythm) : 'skipped: fixture has no stored strum/picking pattern');

    // Measure frame cadence only after a real, unblocked start. The test
    // rejects broad jank, rather than a single noisy frame in a shared VM.
    const frames = await page.evaluate(async () => {
      const times = [];
      const track = document.getElementById('timelineTrack');
      let previousTransform = null, transformChanges = 0, raf = 0;
      const start = performance.now();
      await new Promise((resolve) => {
        const tick = (time) => {
          times.push(time);
          const transform = track && track.style.transform;
          if (transform !== previousTransform) { transformChanges++; previousTransform = transform; }
          if (time - start >= 3000) resolve();
          else raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      });
      cancelAnimationFrame(raf);
      const gaps = times.slice(1).map((time, i) => time - times[i]).sort((a, b) => a - b);
      const quantile = (q) => gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * q))] || Infinity;
      const over20 = gaps.filter((gap) => gap > 20).length;
      return { frames: gaps.length, median: quantile(0.5), p95: quantile(0.95), over20, over20Pct: over20 / gaps.length, transformChanges };
    });
    check('live ribbon transform updates smoothly at display cadence without sustained stalls',
      frames.frames > 100 && frames.median < 19 && frames.p95 < 24 && frames.over20Pct < 0.1 && frames.transformChanges > frames.frames * 0.5,
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
