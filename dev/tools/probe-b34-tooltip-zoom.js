// Живой проб B-34 (пункт (в) спеки): ПЕРВОЕ открытие тултипа аппликатуры
// после зума должно стоять над ячейкой, а не грудой у левого верхнего
// угла окна. Сценарии:
//   1. baseline — обычное окно, без зума;
//   2. собственный зум сетки (setSquareZoom, рефлоу ряда — «путь 1»
//      attachPinchZoom без браузерного зума);
//   3. геометрия «двойного зума» из репро-видео: низкое узкое окно
//      (аналог Page Zoom, сжавшего layout-вьюпорт) + широкий зум сетки;
//   4. visual pinch (CDP setPageScaleFactor) — позиция бит-в-бит как
//      при scale=1 (решение 0.124).
const path = require('path');
const puppeteer = require(path.join(__dirname, '../../node_modules/puppeteer'));

const ver = (n) => Math.round(n * 10) / 10;

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/tmp/chrome/chrome',
    env: { ...process.env, LD_LIBRARY_PATH: '/tmp/chromelibs/lib' },
    args: ['--no-sandbox', '--disable-gpu', '--window-size=1280,900']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  // Песня с аккордами в localStorage — иначе приложение пустое и
  // наводиться не на что.
  await page.evaluateOnNewDocument(() => {
    const song = {
      schemaVersion: 2, name: 'B-34 probe', bpm: 100,
      globalKey: 'C', keyMode: 'manual', globalTimeSig: '4/4', notes: '',
      sections: [
        { id: 1, type: 'Verse', customName: null, key: null, shift: null, timeSig: null, bpm: null, repeat: 1, strumPattern: null,
          squares: [{ id: 2, repeat: 1, customBeats: null, strumPattern: null, events: [
            { chord: 'Am', span: 2, timeSig: null, strumPattern: null },
            { chord: 'F',  span: 2, timeSig: null, strumPattern: null },
            { chord: 'C',  span: 2, timeSig: null, strumPattern: null },
            { chord: 'G',  span: 2, timeSig: null, strumPattern: null },
          ]}]},
      ],
      nextId: 10, userFingerings: [], preferredFingerings: [], date: '',
    };
    try { localStorage.setItem('struchord_songs', JSON.stringify([song])); } catch (e) {}
  });
  await page.goto('file://' + path.join(__dirname, '../../STRUCHORD.html'), { waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, 900));
  // Автозагрузки из пула нет — грузим первую песню явно (как ui-тесты).
  await page.evaluate(() => loadSong(0));
  await new Promise((r) => setTimeout(r, 500));
  console.log('версия в шапке:', await page.$eval('.app-title span', (s) => s.textContent.trim()));

  const hoverCell = async (n) => {
    // Сначала уводим мышь в нейтральный угол и даём тултипу закрыться
    // (таймер скрытия 300мс) — иначе mouseover по той же ячейке не
    // приходит: указатель её не покидал, и тултип «висит» старый.
    await page.mouse.move(5, 5, { steps: 2 });
    await new Promise((r) => setTimeout(r, 450));
    await page.evaluate(() => {
      const tip = document.getElementById('fingering-tooltip');
      if (tip && tip.style.display !== 'none' && typeof hideFingeringTooltip === 'function') hideFingeringTooltip();
      window.__b34Cell = null;
    });
    // Наводим мышь на центр n-й ячейки с аккордом (реальные события).
    const handle = (await page.$$('.chord-wrapper'))[n];
    if (!handle) return null;
    // В маленьком окне ячейка может быть за пределами вьюпорта —
    // elementFromPoint там ничего не видит, mouseover не приходит.
    await handle.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'center' }));
    await new Promise((r) => setTimeout(r, 120));
    const box = await handle.boundingBox();
    if (!box) return null;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await new Promise((r) => setTimeout(r, 250));
    return page.evaluate(() => {
      const r1 = (n) => Math.round(n * 10) / 10;
      const tip = document.getElementById('fingering-tooltip');
      const cell = window.__b34Cell;
      if (!tip || tip.style.display !== 'block' || !cell) return null;
      const tr = tip.getBoundingClientRect();
      const cr = cell.getBoundingClientRect();
      return {
        tip: { left: r1(tr.left), top: r1(tr.top), w: r1(tr.width), h: r1(tr.height), cx: r1(tr.left + tr.width / 2) },
        cell: { left: r1(cr.left), top: r1(cr.top), w: r1(cr.width), h: r1(cr.height), cx: r1(cr.left + cr.width / 2) },
        win: { w: document.documentElement.clientWidth, h: document.documentElement.clientHeight }
      };
    });
  };
  // Запоминаем текущую ячейку: mouseover открывает тултип у wrapper'а,
  // найденного по e.target — пометим его из самого события.
  await page.evaluate(() => {
    document.addEventListener('mouseover', (e) => {
      const wr = e.target.closest && e.target.closest('.chord-wrapper');
      if (wr) window.__b34Cell = wr;
    }, true);
  });

  let fails = 0;
  const check = (name, cond, info) => {
    console.log(`   ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : ' — ' + info}`);
    if (!cond) fails++;
  };

  console.log('=== 1. Baseline: без зума ===');
  let m = await hoverCell(0);
  check('тултип открыт', !!m, JSON.stringify(m));
  if (m) {
    check('центрирован над ячейкой (|Δcx|≤2)', Math.abs(m.tip.cx - m.cell.cx) <= 2,
      `tip.cx=${m.tip.cx} cell.cx=${m.cell.cx}`);
    check('тултип НАД ячейкой', m.tip.top + m.tip.h <= m.cell.top + 2,
      `tip.bottom=${ver(m.tip.top + m.tip.h)} cell.top=${m.cell.top}`);
  }

  console.log('=== 2. Собственный зум сетки 2.6× (рефлоу ряда) ===');
  await page.evaluate(() => { window.__b34Cell = null; });
  await page.evaluate(() => setSquareZoom(2.6, true));
  await new Promise((r) => setTimeout(r, 300));
  m = await hoverCell(0);
  check('после зума тултип открыт (первое открытие)', !!m, JSON.stringify(m));
  if (m) {
    check('центрирован над ячейкой (|Δcx|≤2)', Math.abs(m.tip.cx - m.cell.cx) <= 2,
      `tip.cx=${m.tip.cx} cell.cx=${m.cell.cx}`);
    check('не у левого верхнего угла', !(m.tip.left <= 14 && m.tip.top <= 14),
      `tip=(${m.tip.left},${m.tip.top})`);
  }

  console.log('=== 3. Геометрия двойного зума: окно 480×280 + сетка 2.6× ===');
  await page.setViewport({ width: 480, height: 280 });
  await new Promise((r) => setTimeout(r, 300));
  await page.evaluate(() => { window.__b34Cell = null; });
  m = await hoverCell(0);
  check('в окне-карлике тултип открыт', !!m, JSON.stringify(m));
  if (m) {
    // Требование: тултип ПРИ ЯЧЕЙКЕ, не у угла окна. Вертикально — либо
    // над (якорь, возможно за экраном — принято 0.124), либо под, либо
    // перекрывает ячейку (неизбежно, когда окно ниже тултипа): главное,
    // его вертикальный диапазон соприкасается с ячейкой (допуск = margin).
    const touches = m.tip.top <= m.cell.top + m.cell.h + 14 && m.tip.top + m.tip.h >= m.cell.top - 14;
    check('вертикально соприкасается с ячейкой', touches,
      `tip.y=[${m.tip.top}..${ver(m.tip.top + m.tip.h)}] cell.y=[${m.cell.top}..${ver(m.cell.top + m.cell.h)}]`);
    check('не груда у левого верхнего угла (12,12)', !(m.tip.left <= 14 && m.tip.top >= 0 && m.tip.top <= 14),
      `tip=(${m.tip.left},${m.tip.top}) окно=${m.win.w}×${m.win.h}`);
    check('горизонталь — по центру ячейки (|Δcx|≤3)', Math.abs(m.tip.cx - m.cell.cx) <= 3,
      `tip.cx=${m.tip.cx} cell.cx=${m.cell.cx}`);
  }

  console.log('=== 4. Visual pinch (CDP 1.5×) на ОТКРЫТОМ тултипе: позиция как при scale=1 ===');
  await page.setViewport({ width: 1280, height: 900 });
  await page.evaluate(() => setSquareZoom(1, true));
  await new Promise((r) => setTimeout(r, 300));
  m = await hoverCell(0);
  check('тултип открыт (scale=1)', !!m, JSON.stringify(m));
  const basePos = m ? { left: m.tip.left, top: m.tip.top } : null;
  const client = await page.createCDPSession();
  await client.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1.5 });
  await new Promise((r) => setTimeout(r, 250));
  // Курсор неподвижен, тултип открыт: репозиция под pinch обязана
  // держать ЛАЯУТ-позицию (решение 0.124 — «то же место, что без зума»).
  // Хиттест синтетических событий под scale ненадёжен (урок 0.113),
  // поэтому проверяем позицию уже открытого тултипа.
  m = await page.evaluate(() => {
    const r1 = (n) => Math.round(n * 10) / 10;
    const tip = document.getElementById('fingering-tooltip');
    if (!tip || tip.style.display !== 'block') return null;
    const tr = tip.getBoundingClientRect();
    return { left: r1(tr.left), top: r1(tr.top) };
  });
  check('под scale 1.5 тултип жив', !!m, JSON.stringify(m));
  if (m && basePos) {
    check('позиция бит-в-бит как при scale=1', Math.abs(m.left - basePos.left) <= 1 && Math.abs(m.top - basePos.top) <= 1,
      `(${m.left},${m.top}) vs (${basePos.left},${basePos.top})`);
  }
  await client.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });

  console.log(fails ? `PROBE FAIL: ${fails}` : 'PROBE OK');
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
