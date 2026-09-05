// Зонд B-46 (0.171): статистика кадров (p50/p90/p99/over25) и longtasks на
// протяжке границы ячейки в 100 шагов. Запуск: python3 -m http.server 8000 в
// корне репо, затем `node dev/tools/probe-resize-lag.js [STRUCHORD.html]`
// (нужен @sparticuz/chromium; LD_LIBRARY_PATH=/tmp/libs/lib в этой песочнице).
const sparticuz = require('@sparticuz/chromium').default;
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const file = process.argv[2] || 'STRUCHORD.html';
(async () => {
  const browser = await puppeteer.launch({ args: [...sparticuz.args, '--no-sandbox'], executablePath: await sparticuz.executablePath(), headless: 'shell', defaultViewport: { width: 1400, height: 900 }, env: { ...process.env, LD_LIBRARY_PATH: '/tmp/libs/lib' } });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:8000/${file}?p=${Date.now()}`, { waitUntil: 'load' });
  await page.waitForFunction('typeof loadSong === "function"');
  const fs = require('fs');
  const song = JSON.parse(fs.readFileSync('uploads/Scorpions - Wind of Change.struchord-6.json', 'utf8'));
  await page.evaluate((s) => { localStorage.setItem('struchord_songs', JSON.stringify([s])); loadSong(0); }, song);
  await sleep(600);
  const sel = '.chord-wrapper[data-sec="1"][data-square="3"][data-ei="1"]';
  await page.evaluate((sel) => document.querySelector(sel).scrollIntoView({ block: 'center' }), sel);
  if (process.env.CSS) await page.addStyleTag({ content: process.env.CSS });
  await sleep(200);
  await page.evaluate(() => {
    window.__frames = []; window.__on = true; let last = performance.now();
    const tick = (t) => { if (!window.__on) return; window.__frames.push(t - last); if (t - last > 25) (window.__slow || (window.__slow = [])).push((window.__ph || 'idle') + ':' + (t - last).toFixed(0)); last = t; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    window.__lt = []; window.__fn = [];
    const wrapFn = (name) => { const o = window[name]; if (typeof o !== 'function') return; window[name] = function () { const t = performance.now(); try { return o.apply(this, arguments); } finally { const d = performance.now() - t; if (d > 3) window.__fn.push((window.__ph || 'idle') + ':' + name + ':' + d.toFixed(0)); } }; };
    ['startRhythmHints','layoutRhythmHints','buildRhythmHintContent','rhythmHintEnterDeltas','collectRhythmHintData','applyResizePreviewAt','refreshChordWrapperRects','distributeVisualSpans','buildResizeMetricOverlay','freezeResizeMetric','startResizeMetricFreeze','updateResizeMetricCountEdges','getComputedStyle','renderEventStrumPreviews','syncRhythmHintLiveEdges'].forEach(wrapFn);
    const oraf = window.requestAnimationFrame; window.requestAnimationFrame = (cb) => oraf((t) => { const s0 = performance.now(); cb(t); const d = performance.now() - s0; if (d > 3) window.__fn.push((window.__ph || 'idle') + ':rAF:' + d.toFixed(0) + ':' + String(cb).slice(0, 60).replace(/\s+/g, ' ')); });
    const ost = window.setTimeout; window.setTimeout = (cb, ms, ...a) => ost(() => { const s0 = performance.now(); cb(...a); const d = performance.now() - s0; if (d > 3) window.__fn.push((window.__ph || 'idle') + ':timer' + ms + ':' + d.toFixed(0) + ':' + String(cb).slice(0, 60).replace(/\s+/g, ' ')); }, ms);
    document.addEventListener('pointerdown', () => { window.__t0 = performance.now(); }, true);
    document.addEventListener('pointerdown', () => { window.__fn.push('pointerdown-handlers:' + (performance.now() - window.__t0).toFixed(0)); }, false);
    new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push(Math.round(e.duration)))).observe({ entryTypes: ['longtask'] });
  });
  const h = await page.$(sel + ' .resize-handle');
  const b = await h.boundingBox();
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await page.mouse.move(x, y); await sleep(50);
  await page.evaluate(() => { window.__ph = 'down'; }); await page.mouse.down(); await sleep(350); await page.evaluate(() => { window.__ph = 'move'; });
  for (let i = 1; i <= 40; i++) { await page.mouse.move(x + i * 4, y); await sleep(16); }
  for (let i = 40; i >= -20; i--) { await page.mouse.move(x + i * 4, y); await sleep(16); }
  await sleep(200);
  await page.evaluate(() => { window.__ph = 'up'; }); await page.mouse.up(); await sleep(150); await page.evaluate(() => { window.__ph = 'after'; }); await sleep(1200);
  const r = await page.evaluate(() => { window.__on = false; const f = window.__frames.slice(5); f.sort((a, b) => a - b); return { n: f.length, p50: f[Math.floor(f.length * 0.5)].toFixed(1), p90: f[Math.floor(f.length * 0.9)].toFixed(1), p99: f[Math.floor(f.length * 0.99)].toFixed(1), max: f[f.length - 1].toFixed(1), over25: f.filter((v) => v > 25).length, longtasks: window.__lt, slow: window.__slow || [], fn: window.__fn }; });
  console.log(file, JSON.stringify(r));
  await browser.close();
})();
