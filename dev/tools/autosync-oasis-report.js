#!/usr/bin/env node
'use strict';

// Real-audio acceptance harness for the DSP + joint Auto-Sync engine. This is not app
// code: Chromium is used only to decode the embedded MP3 into the AudioBuffer
// that the dependency-free analyzer expects in production.
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const chromiumPackage = require('@sparticuz/chromium');
const chromium = chromiumPackage.default;

const ROOT = path.resolve(__dirname, '..', '..');
const input = process.argv.slice(2).find((argument) => !argument.startsWith('--'))
  || "/tmp/arena-coding-uploads/Oasis - Don't Look Back in Anger.json";
const mode = process.argv.includes('--follow') ? 'follow' : 'steady';

(async () => {
  const project = JSON.parse(fs.readFileSync(input, 'utf8'));
  // The package skips its Lambda libraries on a generic Linux host even though
  // its bundled Chromium still needs them. Inflate them for this dev harness.
  const libraryRoot = '/tmp/al2023/lib';
  if (!fs.existsSync(path.join(libraryRoot, 'libnspr4.so'))) {
    const packageBuild = path.dirname(require.resolve('@sparticuz/chromium'));
    await chromiumPackage.inflate(path.resolve(packageBuild, '..', 'bin', 'al2023.tar.br'));
  }
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROMIUM_PATH || await chromium.executablePath(),
    headless: 'shell',
    args: [...chromium.args, '--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
    env: { ...process.env, LD_LIBRARY_PATH: ['/tmp/al2023/lib', process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') },
  });
  try {
    const page = await browser.newPage();
    page.on('console', (message) => {
      if (message.type() === 'error') console.error('browser:', message.text());
    });
    await page.goto('about:blank');
    await page.addScriptTag({ path: path.join(ROOT, 'dev', 'autosync-analyzer.js') });
    await page.addScriptTag({ path: path.join(ROOT, 'dev', 'autosync-joint-prototype.js') });
    const result = await page.evaluate(async (song, selectedMode) => {
      const encoded = song.backingTrack && song.backingTrack.embedded;
      if (!encoded) throw new Error('The project has no embedded backing audio.');
      const raw = atob(encoded);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      const context = new AudioContext();
      const audioBuffer = await context.decodeAudioData(bytes.buffer);
      let lastStage = '';
      const result = await window.StruChordAutoSyncAnalyzer.analyze(audioBuffer, song, {
        mode: selectedMode,
        tempoWindowSeconds: 30,
        pointToleranceSeconds: 0.020,
        workBudgetMs: 10,
        onProgress(update) {
          if (update.stage !== lastStage) {
            lastStage = update.stage;
            console.log('Auto-Sync:', update.stage);
          }
        },
      });
      await context.close();
      return result;
    }, project, mode);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
