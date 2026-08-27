// Проверка отката раскладки тултипа аппликатуры в РЕДАКТОРЕ:
//   - кнопки стоят ПОД грифом (карандаш, под ним стрелки), не поверх;
//   - высота SVG 180px (запас под сеткой 30px, как было изначально);
//   - виджет боя во время игры — отдельный блок под грифом;
//   - панель ленты «Сейчас» НЕ изменилась (гриф 200px, кнопки в запасе).
const puppeteer = require('/home/user/node_modules/puppeteer');
const path = 'file:///home/user/STRUCHORD.html';

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--allow-file-access-from-files'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1200));

  // Загружаем песню
  const fixture = require('fs').readFileSync('/home/user/dev/fixtures/praskovya.json', 'utf8');
  await page.evaluate((json) => {
    const data = JSON.parse(json);
    localStorage.setItem('struchord_songs', JSON.stringify([data]));
    loadSong(0);
  }, fixture);
  await new Promise((r) => setTimeout(r, 800));

  // диалоги, если появились
  await page.evaluate(() => {
    document.querySelectorAll('.key-change-confirm-overlay').forEach((e) => e.remove());
  });

  const cell = await page.evaluate(() => {
    const w = Array.from(document.querySelectorAll('.chord-wrapper')).find((x) => {
      const i = x.querySelector('input');
      return i && i.value.trim();
    });
    if (!w) return null;
    const r = w.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (!cell) {
    console.log('нет ячейки с аккордом');
    await browser.close();
    return;
  }

  await page.mouse.move(cell.x - 60, cell.y - 60);
  await page.mouse.move(cell.x, cell.y, { steps: 6 });
  await new Promise((r) => setTimeout(r, 900));

  const paused = await page.evaluate(() => {
    const t = document.getElementById('fingering-tooltip');
    if (!t || t.style.display !== 'block') return null;
    const r = t.getBoundingClientRect();
    const svg = t.querySelector('.fingering-svg-container svg');
    const edit = t.querySelector('.tooltip-edit-btn');
    const nav = t.querySelector('.tooltip-nav-left');
    const rects = (el) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { top: +b.top.toFixed(1), bottom: +b.bottom.toFixed(1), h: +b.height.toFixed(1) };
    };
    return {
      tip: { w: +r.width.toFixed(1), h: +r.height.toFixed(1), top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1) },
      svg: svg ? { h: +svg.getBoundingClientRect().height.toFixed(1), attr: svg.getAttribute('height') } : null,
      edit: rects(edit),
      nav: rects(nav),
      hasSlot: !!t.querySelector('.tooltip-strum-slot'),
      hasCtrlRow: !!t.querySelector('.tooltip-controls'),
    };
  });
  console.log('РЕДАКТОР, пауза:', JSON.stringify(paused, null, 1));

  // Проверки взаимного расположения
  if (paused) {
    const svgBottom = await page.evaluate(() => {
      const s = document.querySelector('#fingering-tooltip .fingering-svg-container svg');
      return s ? +s.getBoundingClientRect().bottom.toFixed(1) : null;
    });
    console.log(' низ SVG:', svgBottom, '| карандаш сверху стрелок:',
      paused.edit && paused.nav ? paused.edit.top < paused.nav.top : 'нет стрелок');
    console.log(' кнопки ПОД грифом:', paused.edit ? paused.edit.top >= svgBottom - 1 : '—');
    console.log(' всё внутри тултипа:',
      paused.nav ? paused.nav.bottom <= paused.tip.bottom + 0.5 : true);
  }

  // Играем — смотрим виджет боя
  await page.evaluate(() => {
    if (!playbackState.isPlaying) playAll();
  });
  await new Promise((r) => setTimeout(r, 1500));
  await page.mouse.move(cell.x - 40, cell.y - 40);
  await page.mouse.move(cell.x, cell.y, { steps: 6 });
  await new Promise((r) => setTimeout(r, 800));

  const playing = await page.evaluate(() => {
    const t = document.getElementById('fingering-tooltip');
    if (!t || t.style.display !== 'block') return null;
    const r = t.getBoundingClientRect();
    const strum = t.querySelector('.tooltip-live-strum');
    const sb = strum ? strum.getBoundingClientRect() : null;
    let overflow = 0;
    t.querySelectorAll('*').forEach((el) => {
      const b = el.getBoundingClientRect();
      if (b.width === 0) return;
      if (b.bottom > r.bottom + 1 || b.top < r.top - 1 || b.left < r.left - 1 || b.right > r.right + 1) overflow++;
    });
    return {
      tip: { w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
      strum: sb ? { w: +sb.width.toFixed(1), h: +sb.height.toFixed(1), top: +sb.top.toFixed(1) } : null,
      overflow,
    };
  });
  console.log('РЕДАКТОР, игра:', JSON.stringify(playing));

  await page.evaluate(() => {
    if (playbackState.isPlaying) playAll();
  });
  await new Promise((r) => setTimeout(r, 400));

  // ЛЕНТА — не должна измениться
  const tl = await page.evaluate(async () => {
    toggleTimelineMode();
    return true;
  });
  await new Promise((r) => setTimeout(r, 800));
  await page.evaluate(() => {
    if (!playbackState.isPlaying) playAll();
  });
  await new Promise((r) => setTimeout(r, 1600));
  const panel = await page.evaluate(() => {
    const p = document.getElementById('tlPanelNow');
    const f = document.getElementById('tlNowFing');
    if (!p || !f) return null;
    const pr = p.getBoundingClientRect();
    const svg = f.querySelector('svg');
    const sr = svg ? svg.getBoundingClientRect() : null;
    return {
      panel: { w: +pr.width.toFixed(1), h: +pr.height.toFixed(1) },
      svg: sr ? { h: +sr.height.toFixed(1), gapBottom: +(pr.bottom - sr.bottom).toFixed(1) } : null,
    };
  });
  console.log('ЛЕНТА, игра:', JSON.stringify(panel), 'кнопка ленты:', tl);

  await page.evaluate(() => {
    if (playbackState.isPlaying) playAll();
  });
  await new Promise((r) => setTimeout(r, 900));
  const panelPaused = await page.evaluate(() => {
    const p = document.getElementById('tlPanelNow');
    const f = document.getElementById('tlNowFing');
    if (!p || !f) return null;
    const pr = p.getBoundingClientRect();
    const svg = f.querySelector('svg');
    const bar = p.querySelector('.tl-fing-controls');
    return {
      panel: { w: +pr.width.toFixed(1), h: +pr.height.toFixed(1) },
      svgH: svg ? +svg.getBoundingClientRect().height.toFixed(1) : null,
      bar: bar ? +bar.getBoundingClientRect().height.toFixed(1) : null,
    };
  });
  console.log('ЛЕНТА, пауза:', JSON.stringify(panelPaused));
  console.log('ошибки страницы:', errors.length ? errors : 'нет');
  await browser.close();
})();
