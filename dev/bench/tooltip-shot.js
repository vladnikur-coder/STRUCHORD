// Скриншоты тултипа аппликатуры в редакторе: пауза и игра.
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
  await new Promise((r) => setTimeout(r, 800));
  await page.evaluate(() => document.querySelectorAll('.key-change-confirm-overlay').forEach((e) => e.remove()));
  await page.waitForFunction(() => Array.from(document.querySelectorAll('.chord-wrapper')).some((x) => { const i = x.querySelector('input'); return i && i.value.trim(); }), { timeout: 20000 });

  const cell = await page.evaluate(() => {
    const w = Array.from(document.querySelectorAll('.chord-wrapper')).find((x) => {
      const i = x.querySelector('input');
      return i && i.value.trim();
    });
    const r = w.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });

  const shot = async (name) => {
    const t = await page.$('#fingering-tooltip');
    const box = await t.boundingBox();
    await page.screenshot({
      path: '/home/user/dev/bench/' + name,
      clip: { x: box.x - 12, y: box.y - 12, width: box.width + 24, height: box.height + 24 },
    });
  };

  await page.mouse.move(cell.x - 60, cell.y - 60);
  await page.mouse.move(cell.x, cell.y, { steps: 6 });
  await new Promise((r) => setTimeout(r, 900));
  await shot('tip-revert-pause.png');

  await page.evaluate(() => { if (!playbackState.isPlaying) playAll(); });
  await new Promise((r) => setTimeout(r, 1500));
  await page.mouse.move(cell.x - 40, cell.y - 40);
  await page.mouse.move(cell.x, cell.y, { steps: 6 });
  await new Promise((r) => setTimeout(r, 900));
  await shot('tip-revert-play.png');
  await page.evaluate(() => { if (playbackState.isPlaying) playAll(); });
  await browser.close();
  console.log('готово');
})();
