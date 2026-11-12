#!/usr/bin/env node
'use strict';

// B-123 / 0.824: Safari's Web Audio session must be explicitly playback.
// Chromium does not implement navigator.audioSession, so the browser test
// injects the small Safari surface and checks the actual app call sites.
const puppeteer = require('puppeteer');
const URL = process.env.STRUCHORD_URL || 'http://127.0.0.1:8000/STRUCHORD.html';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('ok   ' + name); }
  else { fail++; console.error('FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

(async () => {
  const options = { headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] };
  const executable = process.env.CHROMIUM_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (executable) options.executablePath = executable;
  const browser = await puppeteer.launch(options);
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.evaluateOnNewDocument(() => {
      const session = { type: 'auto', state: 'inactive' };
      Object.defineProperty(navigator, 'audioSession', {
        configurable: true, enumerable: true, value: session,
      });
    });
    await page.goto(URL, { waitUntil: 'load' });
    await wait(300);
    const result = await page.evaluate(async () => {
      const session = navigator.audioSession;
      const ctx = audioPreflightForGesture();
      const afterGesture = session.type;
      // Simulate Safari reverting the media session while an app is focused.
      session.type = 'auto';
      requestAudioResume('test-session-reassert');
      const afterResume = session.type;
      session.type = 'auto';
      hardRecoverAudioContext('test-session-rebuild', true);
      const afterRebuild = session.type;
      await new Promise(resolve => setTimeout(resolve, 120));
      const log = audioDiagnosticLog.map(x => x.type);
      return {
        contextCreated: !!ctx,
        afterGesture,
        afterResume,
        afterRebuild,
        events: log.filter(x => x.startsWith('audio-session-')),
        generation: audioContextGeneration,
        errors: log.filter(x => x === 'audio-session-playback-error'),
      };
    });
    check('playback-жест включает Safari session type', result.afterGesture === 'playback', result.afterGesture);
    check('сессия повторно выставляется при resume после reset', result.afterResume === 'playback', result.afterResume);
    check('восстановление контекста заново включает playback session', result.afterRebuild === 'playback', result.afterRebuild);
    check('создан свежий контекст без ошибок установки session', result.contextCreated && result.generation >= 2 && result.errors.length === 0,
      `ctx=${result.contextCreated}, generation=${result.generation}, errors=${result.errors.length}`);
    check('диагностика записала установку playback session', result.events.includes('audio-session-playback-set'), JSON.stringify(result.events));
    check('ошибок JavaScript в браузере нет', errors.length === 0, errors.join(' | '));
  } finally {
    await browser.close();
  }
  console.log(`\nB-123 / Safari audio session: ${pass} ok, ${fail} fail`);
  if (fail) process.exitCode = 1;
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
