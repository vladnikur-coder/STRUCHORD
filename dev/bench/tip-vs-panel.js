// Сравнение: тултип редактора против панели «Сейчас» в ленте.
// Скриншоты + разбор по вертикали, чтобы понять, чем именно они
// отличаются (отступы, положение сетки, строка кнопок).
const puppeteer = require('/home/user/node_modules/puppeteer');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--allow-file-access-from-files'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  await page.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1200));
  const fixture = fs.readFileSync('/home/user/dev/fixtures/praskovya.json', 'utf8');
  await page.evaluate((json) => {
    const d = JSON.parse(json);
    localStorage.setItem('struchord_songs', JSON.stringify([d]));
    loadSong(0);
  }, fixture);
  await new Promise((r) => setTimeout(r, 900));
  await page.evaluate(() => document.querySelectorAll('.key-change-confirm-overlay').forEach((e) => e.remove()));

  const cell = await page.evaluate(() => {
    const w = Array.from(document.querySelectorAll('.chord-wrapper')).find((x) => {
      const i = x.querySelector('input');
      return i && i.value.trim();
    });
    const r = w.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.move(cell.x - 60, cell.y - 60);
  await page.mouse.move(cell.x, cell.y, { steps: 6 });
  await new Promise((r) => setTimeout(r, 900));

  const dump = await page.evaluate(() => {
    const t = document.getElementById('fingering-tooltip');
    const tr = t.getBoundingClientRect();
    const name = t.querySelector('.fingering-chord-name');
    const svg = t.querySelector('svg');
    const sr = svg.getBoundingClientRect();
    const ys = [...svg.querySelectorAll('line')]
      .filter((l) => l.getAttribute('x1') !== l.getAttribute('x2'))
      .map((l) => +l.getAttribute('y1'));
    const scale = sr.height / (+svg.getAttribute('height') || 180);
    const rel = (v) => +(v - tr.top).toFixed(1);
    return {
      box: { w: +tr.width.toFixed(1), h: +tr.height.toFixed(1) },
      name: { top: rel(name.getBoundingClientRect().top), bottom: rel(name.getBoundingClientRect().bottom) },
      svg: { top: rel(sr.top), bottom: rel(sr.bottom), h: +sr.height.toFixed(1), attr: +svg.getAttribute('height') },
      gridTop: rel(sr.top + Math.min(...ys) * scale),
      gridBottom: rel(sr.top + Math.max(...ys) * scale),
      pencil: t.querySelector('.tooltip-edit-btn')
        ? { top: rel(t.querySelector('.tooltip-edit-btn').getBoundingClientRect().top),
            bottom: rel(t.querySelector('.tooltip-edit-btn').getBoundingClientRect().bottom) } : null,
      nav: t.querySelector('.tooltip-nav-left')
        ? { top: rel(t.querySelector('.tooltip-nav-left').getBoundingClientRect().top),
            bottom: rel(t.querySelector('.tooltip-nav-left').getBoundingClientRect().bottom) } : null,
      pad: getComputedStyle(t).padding,
      gap: getComputedStyle(t.querySelector('.fingering-content')).gap,
    };
  });
  console.log('ТУЛТИП РЕДАКТОРА (координаты от верха тултипа):');
  console.log(JSON.stringify(dump, null, 1));

  const tip = await page.$('#fingering-tooltip');
  let box = await tip.boundingBox();
  await page.screenshot({ path: '/home/user/dev/bench/cmp-editor.png',
    clip: { x: box.x - 10, y: box.y - 10, width: box.width + 20, height: box.height + 20 } });

  // Лента, пауза
  await page.evaluate(() => toggleTimelineMode());
  await new Promise((r) => setTimeout(r, 700));
  await page.evaluate(() => { if (!playbackState.isPlaying) playAll(); });
  await new Promise((r) => setTimeout(r, 1600));
  await page.evaluate(() => { if (playbackState.isPlaying) playAll(); });
  await new Promise((r) => setTimeout(r, 900));

  const dump2 = await page.evaluate(() => {
    const p = document.getElementById('tlPanelNow');
    const pr = p.getBoundingClientRect();
    const name = document.getElementById('tlNowChord');
    const f = document.getElementById('tlNowFing');
    const svg = f.querySelector('svg');
    if (!svg) return null;
    const sr = svg.getBoundingClientRect();
    const ys = [...svg.querySelectorAll('line')]
      .filter((l) => l.getAttribute('x1') !== l.getAttribute('x2'))
      .map((l) => +l.getAttribute('y1'));
    const scale = sr.height / (+svg.getAttribute('height') || 174);
    const rel = (v) => +(v - pr.top).toFixed(1);
    const bar = p.querySelector('.tl-fing-controls');
    return {
      box: { w: +pr.width.toFixed(1), h: +pr.height.toFixed(1) },
      name: { top: rel(name.getBoundingClientRect().top), bottom: rel(name.getBoundingClientRect().bottom) },
      svg: { top: rel(sr.top), bottom: rel(sr.bottom), h: +sr.height.toFixed(1), attr: +svg.getAttribute('height') },
      gridTop: rel(sr.top + Math.min(...ys) * scale),
      gridBottom: rel(sr.top + Math.max(...ys) * scale),
      bar: bar ? { top: rel(bar.getBoundingClientRect().top), bottom: rel(bar.getBoundingClientRect().bottom),
        h: +bar.getBoundingClientRect().height.toFixed(1) } : null,
      pad: getComputedStyle(p).padding,
    };
  });
  console.log('\nПАНЕЛЬ ЛЕНТЫ «СЕЙЧАС», пауза:');
  console.log(JSON.stringify(dump2, null, 1));

  const panel = await page.$('#tlPanelNow');
  box = await panel.boundingBox();
  await page.screenshot({ path: '/home/user/dev/bench/cmp-timeline.png',
    clip: { x: box.x - 10, y: box.y - 10, width: box.width + 20, height: box.height + 20 } });

  await browser.close();
})();
