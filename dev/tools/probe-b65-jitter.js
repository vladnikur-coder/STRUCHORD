// Зонд B-65 (0.203): дребезг перестановки слота при качании курсора.
// Считает перестановки и снимает top всех карточек на каждом кадре при
// (1) медленном проезде вниз и обратно, (2) качании ±N px около границы.
// Ручной зонд. Нужен http://127.0.0.1:8000.
const sparticuz = require('@sparticuz/chromium').default;
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    args: [...sparticuz.args, '--no-sandbox'],
    executablePath: await sparticuz.executablePath(),
    headless: 'shell', defaultViewport: { width: 1400, height: 1000 },
    env: { ...process.env, LD_LIBRARY_PATH: '/tmp/libs/al2023/lib' },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('[pageerror]', String(e)));
  await page.goto(`http://127.0.0.1:8000/STRUCHORD.html?probe-jitter=${Date.now()}`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction('typeof addSection === "function"');
  await page.evaluate(() => {
    const mk = (id, type, n) => ({ id, type, customName: null, key: 'C', timeSig: null, bpm: 0, repeat: 1, strumPattern: null,
      squares: Array.from({ length: n }, (_, i) => ({ id: id * 100 + i, repeat: 1, customBeats: null, strumPattern: null,
        events: [{ chord: 'C', span: 4, timeSig: null, strumPattern: null }, { chord: 'G', span: 4, timeSig: null, strumPattern: null }] })) });
    // разные высоты: маленькая тащится через большие и наоборот
    sections = [mk(1, 'Intro', 1), mk(2, 'Verse', 1), mk(3, 'Chorus', 3), mk(4, 'Bridge', 2), mk(5, 'Outro', 1)];
    render();
    window.__swaps = [];
    const o = Node.prototype.insertBefore;
    Node.prototype.insertBefore = function (a, b) {
      if (a && a.classList && a.classList.contains('section-card') && sectionDrag && sectionDrag.active) {
        window.__swaps.push({ t: Math.round(performance.now()), y: sectionDrag.lastY, order: [...this.children].map((c) => c.dataset.id).join('') });
      }
      return o.call(this, a, b);
    };
  });
  await sleep(300);
  const snap = () => page.evaluate(() => [...document.querySelectorAll('.section-card')].map((c) => c.dataset.id + ':' + Math.round(c.getBoundingClientRect().top)).join(' '));
  console.log('старт:', await snap());

  const run = async (dragId, label, path) => {
    await page.evaluate(() => { window.__swaps = []; });
    const h = await page.$eval(`.section-card[data-id="${dragId}"] .drag-handle`, (e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await page.mouse.move(h.x, h.y); await page.mouse.down();
    await page.mouse.move(h.x + 6, h.y + 6, { steps: 2 }); await sleep(320);
    const frames = [];
    for (const [dy, hold] of path) {
      await page.mouse.move(h.x + 6, h.y + dy);
      frames.push([dy, await snap()]);
      if (hold) await sleep(hold);
    }
    const swaps = await page.evaluate(() => window.__swaps);
    console.log(`\n== ${label}: перестановок ${swaps.length}`);
    swaps.forEach((s) => console.log('   swap y=' + Math.round(s.y) + ' до=' + s.order));
    // ищем кадры, где какая-то карточка сдвинулась > 4px при |Δdy| <= 2 (дёрганье без движения курсора)
    let jit = 0;
    for (let i = 1; i < frames.length; i++) {
      const a = Object.fromEntries(frames[i - 1][1].split(' ').map((p) => p.split(':')));
      const b = Object.fromEntries(frames[i][1].split(' ').map((p) => p.split(':')));
      const moved = Object.keys(b).filter((k) => k !== String(dragId) && Math.abs((+b[k]) - (+a[k])) > 4);
      if (moved.length && Math.abs(frames[i][0] - frames[i - 1][0]) <= 2) { jit++; if (jit <= 6) console.log('   дёрг при dy=' + frames[i][0] + ': ' + moved.join(',') + '  ' + frames[i - 1][1] + ' -> ' + frames[i][1]); }
    }
    console.log('   кадров с движением соседей при почти неподвижном курсоре:', jit);
    await page.keyboard.press('Escape'); await sleep(900); await page.mouse.up(); await sleep(200);
  };

  // 1. медленно вниз на 500 и обратно, по 3px, с 16мс паузами
  const p1 = []; for (let d = 6; d <= 500; d += 3) p1.push([d, 16]); for (let d = 500; d >= 6; d -= 3) p1.push([d, 16]);
  await run(2, 'маленькая (Verse) вниз через большие и обратно', p1);
  // 2. качание ±6px у разных глубин
  const p2 = []; for (let base = 60; base <= 480; base += 60) { for (let k = 0; k < 24; k++) p2.push([base + (k % 2 ? 6 : -6), 16]); }
  await run(2, 'маленькая: качание ±6px по глубинам', p2);
  // 3. большая (Chorus) вверх медленно
  const p3 = []; for (let d = -6; d >= -400; d -= 3) p3.push([d, 16]); for (let d = -400; d <= -6; d += 3) p3.push([d, 16]);
  await run(3, 'большая (Chorus) вверх и обратно', p3);
  await browser.close();
})();
