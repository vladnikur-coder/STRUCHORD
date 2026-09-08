const sparticuz = require('@sparticuz/chromium').default;
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ args: [...sparticuz.args, '--no-sandbox'], executablePath: await sparticuz.executablePath(), headless: 'shell', defaultViewport: { width: 1400, height: 900 }, env: { ...process.env, LD_LIBRARY_PATH: '/tmp/libs/lib' } });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:8000/STRUCHORD.html?p=${Date.now()}`, { waitUntil: 'load' });
  await page.waitForFunction('typeof loadSong === "function"');
  const song = JSON.parse(fs.readFileSync('uploads/Scorpions - Wind of Change.struchord-6.json', 'utf8'));
  await page.evaluate((s) => { localStorage.setItem('struchord_songs', JSON.stringify([s])); loadSong(0); }, song);
  await sleep(800);
  if (process.env.CSS) await page.addStyleTag({ content: process.env.CSS });
  const sel = '.chord-wrapper[data-sec="1"][data-square="3"][data-ei="1"]';
  await page.evaluate((sel) => document.querySelector(sel).scrollIntoView({ block: 'center' }), sel);
  await sleep(300);
  const h = await page.$(sel + ' .resize-handle');
  const b = await h.boundingBox();
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await page.mouse.move(x, y); await sleep(100);
  await page.tracing.start({ path: 'dev/tmp/trace.json', categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink.user_timing', 'disabled-by-default-devtools.timeline.invalidationTracking', 'disabled-by-default-blink.invalidation'] });
  await page.evaluate(() => performance.mark('DOWN'));
  await page.mouse.down(); await sleep(400);
  await page.evaluate(() => performance.mark('MOVE'));
  for (let i = 1; i <= 0; i++) { await page.mouse.move(x + i * 4, y); await sleep(16); }
  await page.evaluate(() => performance.mark('UP'));
  await page.mouse.up(); await sleep(900);
  await page.tracing.stop();
  await browser.close();
  const tr = JSON.parse(fs.readFileSync('dev/tmp/trace.json', 'utf8'));
  const ev = tr.traceEvents.filter((e) => (e.dur > 4000 && !/RunTask|GPUTask/.test(e.name)) || e.cat.includes('user_timing')).sort((a, b) => a.ts - b.ts);
  const t0 = ev[0].ts;
  for (const e of ev) { const d = (e.args && e.args.data) || {}; console.log(((e.ts - t0) / 1000).toFixed(0).padStart(5), (e.dur ? (e.dur / 1000).toFixed(1) : '').padStart(6), e.name, d.functionName || d.type || (d.elementCount ? 'elems=' + d.elementCount : '') || (d.dirtyObjects ? 'dirty=' + d.dirtyObjects + '/' + d.totalObjects : '')); }
  if (process.env.INV) {
  const inv = {};
  for (const e of tr.traceEvents) { if (/Invalidat/.test(e.name) && e.args && e.args.data) { const d = e.args.data; const k = e.name + ' ' + (d.nodeName || '') + ' ' + (d.reason || '') + ' ' + (d.extraData || '') + ' ' + (d.selectorPart || ''); inv[k] = (inv[k] || 0) + 1; } }
  Object.entries(inv).sort((a, b) => b[1] - a[1]).slice(0, 40).forEach(([k, v]) => console.log(String(v).padStart(5), k));
  }
  const paints = tr.traceEvents.filter((e) => e.name === 'Paint' && e.dur > 3000); console.log('paints>3ms', paints.length, paints.map((e) => (e.dur / 1000).toFixed(1)).join(' '));
})();
