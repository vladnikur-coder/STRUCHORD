#!/usr/bin/env node
'use strict';

// Real-audio report for the experimental joint tempo/downbeat analyzer.
// This does not load STRUCHORD.html and does not touch application state.
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const chromiumPackage = require('@sparticuz/chromium');
const chromium = chromiumPackage.default;

const ROOT = path.resolve(__dirname, '..', '..');
const inputs = process.argv.slice(2).filter((argument) => !argument.startsWith('--'));
if (!inputs.length) {
  inputs.push(
    '/tmp/arena-coding-uploads/Король и Шут - Прыгну со скалы-3.json',
    "/tmp/arena-coding-uploads/Oasis - Don't Look Back in Anger.json",
  );
}
const runMatrix = process.argv.includes('--matrix');
const fixedArgument = process.argv.find((argument) => argument.startsWith('--fixed-start='));
const fixedStart = fixedArgument ? Number(fixedArgument.split('=')[1]) : null;

async function ensureChromiumLibraries() {
  const libraryRoot = '/tmp/al2023/lib';
  if (!fs.existsSync(path.join(libraryRoot, 'libnspr4.so'))) {
    const packageBuild = path.dirname(require.resolve('@sparticuz/chromium'));
    await chromiumPackage.inflate(path.resolve(packageBuild, '..', 'bin', 'al2023.tar.br'));
  }
}

(async () => {
  await ensureChromiumLibraries();
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROMIUM_PATH || await chromium.executablePath(),
    headless: 'shell',
    args: [...chromium.args, '--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
    env: { ...process.env, LD_LIBRARY_PATH: ['/tmp/al2023/lib', process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') },
  });
  try {
    const reports = [];
    for (const input of inputs) {
      const project = JSON.parse(fs.readFileSync(input, 'utf8'));
      const page = await browser.newPage();
      page.on('console', (message) => console.error(`[${path.basename(input)}]`, message.text()));
      await page.goto('about:blank');
      await page.addScriptTag({ path: path.join(ROOT, 'dev', 'autosync-analyzer.js') });
      await page.addScriptTag({ path: path.join(ROOT, 'dev', 'autosync-joint-prototype.js') });
      const report = await page.evaluate(async (song, matrix, manualStart) => {
        const encoded = song.backingTrack && song.backingTrack.embedded;
        if (!encoded) throw new Error('The project has no embedded backing audio.');
        const raw = atob(encoded);
        const bytes = new Uint8Array(raw.length);
        for (let index = 0; index < raw.length; index++) bytes[index] = raw.charCodeAt(index);
        const context = new AudioContext();
        const audioBuffer = await context.decodeAudioData(bytes.buffer);
        let lastStage = '';
        const options = {
          minBpm: 45,
          maxBpm: 220,
          ...(Number.isFinite(manualStart) ? { fixedStart: manualStart } : {}),
          workBudgetMs: 14,
          onProgress(update) {
            if (update.stage !== lastStage) {
              lastStage = update.stage;
              console.log(update.stage);
            }
          },
        };
        const bpms = matrix ? [100, 120, 180] : [song.bpm];
        const results = [];
        let score = null;
        for (const projectBpm of bpms) {
          // Each matrix row receives a real cloned project with the requested
          // BPM value. This deliberately repeats feature preparation so the
          // test would catch any BPM read in either prepare() or search().
          const variant = { ...song, bpm: projectBpm };
          const prepared = await window.StruChordJointAutoSyncPrototype.prepare(audioBuffer, variant, options);
          score ||= { bars: prepared.score.totalBars, quarters: prepared.score.totalQ, events: prepared.score.events.length, chordEvents: prepared.chordEvents.length };
          const result = await window.StruChordJointAutoSyncPrototype.search(prepared, options);
          results.push({ projectBpm, result });
        }
        await context.close();
        return { file: song.backingTrack.name, duration: audioBuffer.duration, score, results };
      }, project, runMatrix, fixedStart);
      if (runMatrix) {
        const signatures = report.results.map(({ result }) => JSON.stringify({ bpm:result.bpm, firstBar:result.firstBar, points:result.points }));
        if (!signatures.every((value) => value === signatures[0])) throw new Error(`${report.file}: result depends on project BPM`);
        const result = report.results[0].result;
        if (/Прыгну со скалы|Король и Шут/i.test(input + ' ' + report.file)) {
          if (Math.abs(result.bpm - 152) > .3 || result.firstBar < .55 || result.firstBar > .65 || result.points.length < 2 || result.points.length > 4) throw new Error(`${report.file}: acceptance target failed`);
        } else if (/Oasis|Look Back in Anger/i.test(input + ' ' + report.file)) {
          if (Math.abs(result.bpm - 81.4) > .2 || result.points.length < 2 || result.points.length > 3) throw new Error(`${report.file}: acceptance target failed`);
        }
      }
      reports.push(report);
      await page.close();
    }
    console.log(JSON.stringify(reports, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
