// Замер: (1) прыжок геометрии между последним кадром перетаскивания и
// состоянием после отпускания; (2) совпадение подписей счёта с узлами сетки.
const puppeteer = require('/home/user/node_modules/puppeteer');
(async () => {
  const br = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const p = await br.newPage();
  await p.setViewport({ width: 1400, height: 950 });
  p.setDefaultTimeout(90000);
  p.on('pageerror', (e) => console.log('PAGEERROR', String(e).split('\n')[0]));
  await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await new Promise((r) => setTimeout(r, 1100));
  await p.evaluate(() => {
    sections = [{ id: 1, type: 'Verse', repeat: 1, squares: [{ id: 1, repeat: 1,
      events: [{ chord: 'Am', span: 4 }, { chord: 'C', span: 4 },
        { chord: 'F', span: 4 }, { chord: 'G', span: 4 }] }] }];
    nextId = 9; render();
  });
  await new Promise((r) => setTimeout(r, 400));
  await p.evaluate(() => { setSquareZoom(3); applySquareZoom(true); });
  await new Promise((r) => setTimeout(r, 600));

  const snap = () => p.evaluate(() => {
    const inner = document.querySelector('.square-inner');
    const box = inner.getBoundingClientRect();
    const cells = [...inner.querySelectorAll('.chord-wrapper')].map((cw) => {
      const r = cw.getBoundingClientRect();
      const counts = [...cw.querySelectorAll('.chord-count')].map((c) => ({
        t: c.textContent,
        x: +(c.getBoundingClientRect().left - box.left).toFixed(2),
        // Узел сетки — ЦЕНТР подписи, а не её левый край: у «1» и «та»
        // разная ширина, и по краям шаг выглядел бы неровным.
        c: +(c.getBoundingClientRect().left + c.getBoundingClientRect().width / 2 - box.left).toFixed(2),
      }));
      const stepStyle = (cw.querySelector('.chord-ticks-step') || {}).getAttribute
        ? cw.querySelector('.chord-ticks-step').getAttribute('style') : '';
      return { l: +(r.left - box.left).toFixed(2), w: +r.width.toFixed(2), counts, stepStyle };
    });
    const card = document.querySelector('.section-card').getBoundingClientRect();
    return { boxW: +box.width.toFixed(2), boxL: +box.left.toFixed(2), boxT: +box.top.toFixed(2),
      cardT: +card.top.toFixed(2), cardH: +card.height.toFixed(2),
      scroll: document.querySelector('.squares-viewport').scrollLeft, cells };
  });

  const handle = await p.evaluate(() => {
    const vp = document.querySelector('.squares-viewport').getBoundingClientRect();
    const h = [...document.querySelectorAll('.resize-handle')].find((el) => {
      const r = el.getBoundingClientRect();
      return r.left > vp.left + 40 && r.right < vp.right - 40;
    });
    const r = h.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });
  const before = await snap();
  await p.mouse.move(handle.x, handle.y);
  await p.mouse.down();
  for (let i = 1; i <= 8; i++) { await p.mouse.move(handle.x + i * 12, handle.y); await new Promise((r) => setTimeout(r, 30)); }
  const during = await snap();
  await p.mouse.up();
  await new Promise((r) => setTimeout(r, 400));
  const after = await snap();

  const fmt = (s) => `boxW=${s.boxW} boxL=${s.boxL} boxT=${s.boxT} cardT=${s.cardT} cardH=${s.cardH} scroll=${s.scroll}\n  ` +
    s.cells.map((c, i) => `#${i} l=${c.l} w=${c.w} counts=[${c.counts.map((x) => x.t + '@' + x.x).join(' ')}]`).join('\n  ');
  console.log('=== ДО ===\n ', fmt(before));
  console.log('=== ВО ВРЕМЯ (последний кадр) ===\n ', fmt(during));
  console.log('=== ПОСЛЕ ОТПУСКАНИЯ ===\n ', fmt(after));

  console.log('\n=== Прыжок during -> after ===');
  console.log('boxW', (after.boxW - during.boxW).toFixed(2), ' boxL', (after.boxL - during.boxL).toFixed(2),
    ' boxT', (after.boxT - during.boxT).toFixed(2), ' cardT', (after.cardT - during.cardT).toFixed(2),
    ' cardH', (after.cardH - during.cardH).toFixed(2), ' scroll', after.scroll - during.scroll);
  during.cells.forEach((c, i) => {
    const a = after.cells[i];
    console.log(`  #${i} dl=${(a.l - c.l).toFixed(2)} dw=${(a.w - c.w).toFixed(2)} counts ${c.counts.length}->${a.counts.length}`);
  });
  let bad = 0;
  const t = (n, c, x = '') => { if (c) console.log('   ok  ', n, x); else { bad++; console.log('  FAIL ', n, x); } };
  console.log('\n=== Проверки ===');
  t('ширина квадрата не прыгает', Math.abs(after.boxW - during.boxW) < 0.5);
  during.cells.forEach((c, i) => {
    const a = after.cells[i];
    t(`ячейка #${i}: геометрия не прыгает`, Math.abs(a.l - c.l) < 0.5 && Math.abs(a.w - c.w) < 0.5);
    t(`ячейка #${i}: подписи счёта те же`,
      c.counts.length === a.counts.length &&
      c.counts.every((x, k) => x.t === a.counts[k].t && Math.abs(x.x - a.counts[k].x) < 0.6),
      `${c.counts.length} -> ${a.counts.length}`);
  });
  // Ровность шага счёта здесь НЕ проверяется намеренно. Первая подпись
  // каждой ячейки прижата к узлу (.is-edge), а не центрирована на нём:
  // в Safari центрированная цифра подрезается кромкой .square-inner.
  // Положение оставлено прежним по решению пользователя — стенд следит
  // только за тем, чтобы картинка не прыгала на отпускании.
  const steps = after.cells.slice(1).map((c) => {
    const xs = c.counts.map((i) => i.c);
    const d = xs.slice(1).map((v, i) => v - xs[i]);
    return Math.max(...d) - Math.min(...d);
  });
  console.log('      разброс шага счёта (справочно):',
    steps.map((v) => v.toFixed(2)).join(' '));
  console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё зелено');
  await br.close();
  process.exit(bad ? 1 : 0);
})();
