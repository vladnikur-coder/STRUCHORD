#!/usr/bin/env node
'use strict';

// 0.808: проверка счёта долей «1 та и та» и делений линейки #timelineRhythm
// в режиме Ленты на синкопированных ячейках (например, C 1.75 -> G 2.25 в
// uploads/Oasis - Don't Look Back in Anger.struchord, где G начинается на
// четвёртую шестнадцатую второй доли barOffset = 1.75).

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const rawHtml = fs.readFileSync(path.join(ROOT, 'STRUCHORD.html'), 'utf8')
  .replace('<script src="./keyboard-audio.js"></script>', () => `<script>${fs.readFileSync(path.join(ROOT, 'keyboard-audio.js'), 'utf8')}</script>`)
  .replace('<script src="./keyboard-accompaniment.js"></script>', () => `<script>${fs.readFileSync(path.join(ROOT, 'keyboard-accompaniment.js'), 'utf8')}</script>`);

const dom = new JSDOM(rawHtml, {
  url: 'http://127.0.0.1:8080/STRUCHORD.html',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  beforeParse(win) {
    win.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    win.HTMLCanvasElement.prototype.getContext = () => ({
      font: '', measureText: () => ({ width: 8 }),
      clearRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {},
      moveTo() {}, lineTo() {}, closePath() {}, save() {}, restore() {},
      translate() {}, rotate() {}, fillText() {}, strokeText() {}, setTransform() {}, scale() {},
      createLinearGradient: () => ({ addColorStop() {} }),
    });
    Object.defineProperty(win.HTMLElement.prototype, 'offsetWidth', {
      get() { return parseFloat(this.style && this.style.width) || 100; },
    });
  },
});

const w = dom.window;
const doc = w.document;

setTimeout(() => {
  try {
    // 1. Синтетический такт 4/4 на шестнадцатых: C (1.75) -> G (2.25)
    w.eval(`
      startNewSongFromHome();
      addSection('Verse');
      sections[0].strumPattern = {
        mode: 'strum',
        subdivision: 4,
        steps: ['D', null, null, null, 'D', null, null, 'U', null, 'U', 'D', null, 'D', null, 'D', 'U']
      };
      sections[0].squares[0].events = [
        { chord: 'C', span: 1.75 },
        { chord: 'G', span: 2.25 }
      ];
      if (!timelineMode) toggleTimelineMode();
      renderTimeline();
    `);

    const counts = [...doc.querySelectorAll('#timelineRhythm .tl-count')].map((el) => ({
      text: el.textContent,
      isBeat: el.classList.contains('is-beat'),
    }));
    assert.deepStrictEqual(
      counts.map((c) => (c.isBeat ? `[${c.text}]` : c.text)),
      ['[1]', 'та', 'и', 'та', '[2]', 'та', 'и', 'та', '[3]', 'та', 'и', 'та', '[4]', 'та', 'и', 'та'],
      'синкопированный переход 1.75 -> 2.25 даёт непрерывный счёт [1] та и та [2] та и | та [3] та и та [4] та и та'
    );
    console.log('ok   синкопа 1.75 -> 2.25 сохраняет «та» на 1.75 и доли [3], [4] на своих местах');

    const ticks = [...doc.querySelectorAll('#timelineRhythm .tl-tick')].map((el) =>
      el.classList.contains('is-bar') ? 'bar' : el.classList.contains('is-beat') ? 'beat' : 'sub'
    );
    assert.deepStrictEqual(
      ticks,
      ['bar', 'sub', 'sub', 'sub', 'beat', 'sub', 'sub', 'sub', 'beat', 'sub', 'sub', 'sub', 'beat', 'sub', 'sub', 'sub'],
      'штрихи линейки ставят beat ровно на 0, 4, 8, 12 шестнадцатых, а не на начало синкопы 1.75'
    );
    console.log('ok   штрихи is-bar / is-beat / is-sub совпадают с метрической сеткой такта');

    // 2. Проверка на реальном файле uploads/Oasis - Don't Look Back in Anger.struchord
    const oasisPath = path.join(ROOT, "uploads/Oasis - Don't Look Back in Anger.struchord");
    if (fs.existsSync(oasisPath)) {
      const oasis = JSON.parse(fs.readFileSync(oasisPath, 'utf8'));
      w.localStorage.setItem('struchord_songs', JSON.stringify([oasis]));
      w.loadSong(0);
      w.eval(`if (!timelineMode) toggleTimelineMode(); renderTimeline();`);
      const oasisCounts = doc.querySelectorAll('#timelineRhythm .tl-count').length;
      const oasisHits = doc.querySelectorAll('#timelineRhythm .tl-hit').length;
      assert.strictEqual(oasisCounts, oasisHits, 'Oasis: каждому из 1536 шагов соответствует своя метка счёта без пропусков на синкопах');
      console.log(`ok   Oasis - Don't Look Back in Anger: ${oasisCounts}/${oasisHits} меток счёта без потерь на синкопах`);
    }

    process.exit(0);
  } catch (err) {
    console.error('FAIL:', err);
    process.exit(1);
  }
}, 100);
