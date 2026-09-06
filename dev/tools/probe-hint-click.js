// Зонд 0.169: клик (без движения) по границе ячеек «кастом | наследник со
// срезом B-30» — покадровая история мини-превью и полос подсказки B-15
// (без скриншотов: печатаются только кадры, где что-то поменялось).
// Требует http://127.0.0.1:8000 (python3 -m http.server 8000) и
// распакованные libs @sparticuz/chromium (al2023.tar.br → /tmp/libs/lib).
// Ручной зонд, в тесты не входит.
const path = require('path');
const fs = require('fs');
const sparticuz = require('@sparticuz/chromium').default;
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({
    args: [...sparticuz.args, '--no-sandbox'],
    executablePath: await sparticuz.executablePath(),
    headless: 'shell',
    defaultViewport: { width: 1400, height: 900 },
    env: { ...process.env, LD_LIBRARY_PATH: '/tmp/libs/lib' },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('[pageerror]', String(e)));
  page.on('console', (m) => { if (m.type() === 'error') console.error('[console]', m.text()); });
  await page.goto(`http://127.0.0.1:8000/STRUCHORD.html?probe=${Date.now()}`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction('typeof addSection === "function"');
  await page.evaluate((mode) => {
    const strum = (sub, s) => ({ mode: 'strum', subdivision: sub, steps: s.split('') });
    sections = [{ id: 1, type: 'Verse', customName: null, key: 'C', timeSig: null, bpm: 0,
      repeat: 1, strumPattern: strum(2, 'DUDUDUDU'), squares: [
        { id: 2, repeat: 1, customBeats: null, strumPattern: null, events: [
          { chord: 'C', span: 2, timeSig: null, strumPattern: strum(2, 'DDUU') },
          { chord: 'G', span: 2, timeSig: null, strumPattern: null },
        ]},
      ]
    }];
    if (songRhythmRolls) {
      for (const key of [...songRhythmRolls.refs.keys()]) songRhythmRolls.refs.delete(key);
      songRhythmRolls.sectionRolls.delete(1);
    }
    ensureSquareRhythmRefs(sections[0], sections[0].squares[0]);
    if (songRhythmRolls) setSectionRhythmRoll(sections[0], sections[0].strumPattern);
    render();
  });
  await sleep(400);
  await page.evaluate(() => {
    window.__log = [];
    window.__on = true;
    const t0 = performance.now();
    const sample = () => {
      if (!window.__on) return;
      const bi = document.querySelector('.square-inner');
      const prevs = [...bi.querySelectorAll('.event-strum-preview')].map((b) => {
        const cs = getComputedStyle(b);
        const steps = [...b.querySelectorAll('.strum-step')];
        const r0 = steps[0] ? steps[0].getBoundingClientRect() : null;
        return `${b.dataset.ei}:${b.classList.contains('has-pattern') ? 'P' : '-'}${b.classList.contains('is-rhythm-return-target') ? 'T' : ''}${b.classList.contains('is-rhythm-removing') ? 'R' : ''} n=${steps.length} op=${(+cs.opacity).toFixed(2)} disp=${cs.display}${r0 ? ` x0=${r0.left.toFixed(0)},y0=${r0.top.toFixed(0)}` : ''}`;
      });
      const ov = bi.querySelector('.rhythm-hints') || document.querySelector('body > .rhythm-hints');
      let hints = '';
      if (ov) {
        hints = (ov.parentElement === document.body ? 'ghost ' : 'live ') + [...ov.querySelectorAll('.rhythm-hint')].map((h) => {
          const cs = getComputedStyle(h);
          const hits = [...h.querySelectorAll('.rhythm-hint-hit')];
          const r0 = hits[0] ? hits[0].getBoundingClientRect() : null;
          const r1 = hits[1] ? hits[1].getBoundingClientRect() : null;
          return `[${h.classList.contains('is-in') ? 'in' : '--'} op=${(+cs.opacity).toFixed(2)} hits=${hits.length}${r0 ? ` h0=${r0.left.toFixed(0)},${r0.top.toFixed(0)}` : ''}${r1 ? ` h1=${r1.left.toFixed(0)},${r1.top.toFixed(0)}` : ''}]`;
        }).join(' ');
      }
      const sq = document.querySelector('.square');
      window.__log.push(`${(performance.now() - t0).toFixed(0).padStart(5)}ms  ${prevs.join(' | ')}  sq=${[...sq.classList].filter((c) => /hint|rhythm/.test(c)).join(',')}  ${hints}`);
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  const handle = await page.$('.chord-wrapper[data-ei="0"] .resize-handle');
  const box = await handle.boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await sleep(100);
  await page.mouse.down();
  await sleep(500);
  await page.mouse.up();
  await sleep(1200);
  const log = await page.evaluate(() => { window.__on = false; return window.__log; });
  // печатаем только строки, где что-то поменялось
  let prev = '';
  for (const l of log) {
    const body = l.slice(8);
    if (body !== prev) console.log(l);
    prev = body;
  }
  await browser.close();
})();
