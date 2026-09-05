// Зонд 0.170: протяжка границы (аргумент: 1 вправо / -1 влево) — покадрово
// пары «edge-подпись счёта ↔ удар с тем же ключом узла», полосы и превью.
// Требования те же, что у probe-hint-click.js. Ручной зонд, в тесты не входит.
const sparticuz = require('@sparticuz/chromium').default;
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ args: [...sparticuz.args, '--no-sandbox'], executablePath: await sparticuz.executablePath(), headless: 'shell', defaultViewport: { width: 1400, height: 900 }, env: { ...process.env, LD_LIBRARY_PATH: '/tmp/libs/lib' } });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('[pageerror]', String(e)));
  await page.goto(`http://127.0.0.1:8000/STRUCHORD.html?p=${Date.now()}`, { waitUntil: 'load' });
  await page.waitForFunction('typeof addSection === "function"');
  await page.evaluate(() => {
    const strum = (sub, s) => ({ mode: 'strum', subdivision: sub, steps: s.split('') });
    sections = [{ id: 1, type: 'Verse', customName: null, key: 'C', timeSig: null, bpm: 0, repeat: 1, strumPattern: strum(2, 'DUDUDUDU'), squares: [
      { id: 2, repeat: 1, customBeats: null, strumPattern: null, events: [
        { chord: 'C', span: 2, timeSig: null, strumPattern: strum(2, 'DDUU') },
        { chord: 'G', span: 2, timeSig: null, strumPattern: null } ] } ] }];
    if (songRhythmRolls) { for (const k of [...songRhythmRolls.refs.keys()]) songRhythmRolls.refs.delete(k); songRhythmRolls.sectionRolls.delete(1); }
    ensureSquareRhythmRefs(sections[0], sections[0].squares[0]);
    setSectionRhythmRoll(sections[0], sections[0].strumPattern);
    render();
  });
  await sleep(400);
  await page.evaluate(() => {
    window.__log = []; window.__on = true; const t0 = performance.now();
    const sample = () => {
      if (!window.__on) return;
      const bi = document.querySelector('.square-inner');
      const cells = [...bi.querySelectorAll(':scope > .chord-wrapper')].map((c) => { const r = c.getBoundingClientRect(); return `${r.left.toFixed(0)}-${r.right.toFixed(0)}`; }).join(' ');
      const prevs = [...bi.querySelectorAll('.event-strum-preview')].map((b) => { const st = [...b.querySelectorAll('.strum-step')]; return `${b.dataset.ei}:n=${st.length} op=${(+getComputedStyle(b).opacity).toFixed(2)} x=[${st.map((s) => s.getBoundingClientRect().left.toFixed(0)).join(',')}]`; }).join(' | ');
      const ov = bi.querySelector('.rhythm-hints') || document.querySelector('body > .rhythm-hints');
      const edges = [...document.querySelectorAll('.resize-count-cell .chord-count.is-edge')].map((c) => {
        const key = c.dataset.resizeMetricKey;
        const hit = ov && ov.querySelector(`.rhythm-hint-hit[data-hint-node-key="${key}"]`);
        const cr = c.getBoundingClientRect();
        const hr = hit ? hit.getBoundingClientRect() : null;
        return `${c.textContent}@${cr.left.toFixed(1)}${hit ? ` hit${hit.classList.contains('is-live-edge') ? '*' : ''}@${(hr.left + hr.width / 2).toFixed(1)} tf=${getComputedStyle(hit).transform}` : ' nohit'}`;
      }).join(' ; ');
      const hints = ov ? [...ov.querySelectorAll('.rhythm-hint')].map((h) => `[${h.classList.contains('is-in') ? 'in' : '--'} ${[...h.querySelectorAll('.rhythm-hint-hit')].map((x) => { const r = x.getBoundingClientRect(); return r.left.toFixed(0) + ',' + r.top.toFixed(0); }).join(' ')}]`).join('') : '';
      window.__log.push(`${(performance.now() - t0).toFixed(0).padStart(5)} cells=${cells} EDGES[${edges}] prev: ${prevs}  hints: ${hints}`);
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  const h = await page.$('.chord-wrapper[data-ei="0"] .resize-handle');
  const b = await h.boundingBox();
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await page.mouse.move(x, y); await sleep(50);
  await page.mouse.down(); await sleep(400);
  const dir = +(process.argv[2] || 1); for (let i = 1; i <= 10; i++) { await page.mouse.move(x + dir * i * 6, y); await sleep(30); }
  await sleep(400);
  await page.mouse.up(); await sleep(1500);
  const log = await page.evaluate(() => { window.__on = false; return window.__log; });
  let prev = '';
  for (const l of log) { const body = l.slice(6); if (body !== prev) console.log(l); prev = body; }
  await browser.close();
})();
