#!/usr/bin/env node
'use strict';

// B-123 removal guard: the unsupported A/V correction and calibration UI
// must stay removed; normal audible-output timing remains in playback.
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

setTimeout(() => {
  try {
    check('transport no longer exposes the nonfunctional A/V toggle', () => {
      assert.strictEqual(w.document.getElementById('btnAvSync'), null);
      assert.strictEqual(typeof w.toggleAvSync, 'undefined');
    });
    check('settings contain only the supported Visual and Instruments tabs', () => {
      w.openHomeSettings();
      const tabs = Array.from(w.document.querySelectorAll('.home-settings-tab')).map(tab => tab.textContent.trim());
      assert.deepStrictEqual(tabs, ['Визуал', 'Инструменты']);
      assert.strictEqual(w.document.getElementById('homeSettingsTabAvSync'), null);
      assert.strictEqual(w.document.getElementById('homeSettingsPanelAvSync'), null);
      assert.strictEqual(w.document.getElementById('homeAvSyncStart'), null);
    });
    check('A/V correction persistence and calibration APIs are removed', () => {
      for (const name of ['avSyncSettings', 'AV_SYNC_STORAGE_KEY', 'startAvSyncCalibration', 'tapAvSyncCalibration', 'cancelAvSyncCalibration', 'struchord-av-sync-v1']) {
        assert(!html.includes(name), `unexpected remaining reference: ${name}`);
      }
    });
    check('normal audible-output visual clock remains available without user offset', () => {
      assert.match(html, /function visualAudioContextTime\(ctx\)\s*\{\s*return audibleAudioContextTime\(ctx\);\s*\}/);
      assert.match(html, /function schedulePlaybackVisualAt\(ctx, contextTime, callback\)\s*\{\s*const visualTime = contextTime;/);
    });
    console.log(`\nB-123 removal checks completed: ${pass} passed.`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    dom.window.close();
  }
}, 200);
