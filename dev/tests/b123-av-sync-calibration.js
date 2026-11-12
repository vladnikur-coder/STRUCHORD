#!/usr/bin/env node
'use strict';

// B-123 · user-calibrated audio/visual offset and transport auto-sync control.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');
const ROOT = path.resolve(__dirname, '..', '..');
const html = fs.readFileSync(path.join(ROOT, 'STRUCHORD.html'), 'utf8');
const dom = new JSDOM(html, {
  url: 'http://127.0.0.1:8080/STRUCHORD.html?view=editor',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  beforeParse(win) {
    win.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    win.HTMLCanvasElement.prototype.getContext = () => ({ measureText: text => ({ width: String(text || '').length * 8 }), clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, arc() {}, closePath() {}, save() {}, restore() {}, setTransform() {}, scale() {}, createLinearGradient: () => ({ addColorStop() {} }) });
  },
});
const w = dom.window;
let pass = 0;
const check = (name, fn) => {
  try { fn(); pass++; console.log('ok   ' + name); }
  catch (error) { console.error('FAIL ' + name + '\n' + (error.stack || error)); process.exitCode = 1; }
};

setTimeout(async () => {
  try {
    check('transport exposes a persistent auto-sync toggle', () => {
      const button = w.document.getElementById('btnAvSync');
      assert(button);
      assert.strictEqual(button.getAttribute('aria-pressed'), 'false');
      button.click();
      assert.strictEqual(button.getAttribute('aria-pressed'), 'true');
      assert.strictEqual(JSON.parse(w.localStorage.getItem('struchord-av-sync-v1')).enabled, true);
    });
    check('settings provide a 100 BPM tap-calibration workflow and manual fine adjustment', () => {
      w.openHomeSettings();
      w.document.getElementById('homeSettingsTabAvSync').click();
      assert.strictEqual(w.document.getElementById('homeSettingsPanelAvSync').hidden, false);
      assert.match(w.document.getElementById('homeAvSyncPanel')?.textContent || w.document.getElementById('homeSettingsPanelAvSync').textContent, /100 BPM/);
      assert(w.document.getElementById('homeAvSyncStart'));
      assert(w.document.getElementById('homeAvSyncTap').disabled);
      assert.strictEqual(w.document.getElementById('homeAvSyncOffset').min, '-250');
      assert.strictEqual(w.document.getElementById('homeAvSyncOffset').max, '250');
    });
    check('slider persists milliseconds and synchronizes settings with the transport button', () => {
      const range = w.document.getElementById('homeAvSyncOffset');
      range.value = '85';
      range.dispatchEvent(new w.Event('input', { bubbles: true }));
      const saved = JSON.parse(w.localStorage.getItem('struchord-av-sync-v1'));
      assert.strictEqual(saved.offsetMs, 85);
      assert.strictEqual(w.document.getElementById('homeAvSyncOffsetValue').textContent, '+85 мс');
      assert.match(w.document.getElementById('btnAvSync').title, /\+85 мс/);
      const enabled = w.document.getElementById('homeAvSyncEnabled');
      enabled.checked = false;
      enabled.dispatchEvent(new w.Event('change', { bubbles: true }));
      assert.strictEqual(w.document.getElementById('btnAvSync').getAttribute('aria-pressed'), 'false');
      assert.strictEqual(JSON.parse(w.localStorage.getItem('struchord-av-sync-v1')).offsetMs, 85);
    });
    const visualDelay = await w.eval(`new Promise((resolve) => {
      const basePerf = performance.now();
      const ctx = {
        get currentTime() { return 10 + (performance.now() - basePerf) / 1000; },
        getOutputTimestamp() { return { contextTime: this.currentTime, performanceTime: performance.now() }; },
      };
      avSyncSettings.enabled = true;
      avSyncSettings.offsetMs = 80;
      playbackState.isPlaying = true;
      const started = performance.now();
      schedulePlaybackVisualAt(ctx, ctx.currentTime + 0.06, () => {
        playbackState.isPlaying = false;
        resolve(performance.now() - started);
      });
    })`);
    check('воспроизведение применяет поправку к визуальному времени, не сдвигая звук', () => {
      assert(visualDelay >= 120 && visualDelay < 260, `${visualDelay.toFixed(1)} ms`);
    });
    console.log(`\nB-123 checks completed: ${pass} passed.`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    dom.window.close();
  }
}, 200);
