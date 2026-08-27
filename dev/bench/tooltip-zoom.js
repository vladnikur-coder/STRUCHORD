// Тултип аппликатуры при ЗУМЕ СТРАНИЦЫ (Cmd +/-) — не зуме квадратов.
//
// Два дефекта, которые ловит стенд.
//
// 1. ПОЯВЛЕНИЕ. Скрытый тултип сохраняет left/top от прошлого показа, а
//    на них висит transition 0.3s. Новый тултип 300 мс ЕХАЛ от старого
//    места к новому, проявляясь на ходу: замер показал left 343 -> 906px.
//
// 2. ЗУМ НА ЛЕТУ. Координаты тултипа — абсолютные пиксели, посчитанные
//    в момент показа. Cmd +/- меняет всю геометрию, а left/top остаются
//    прежними: тултип отрывается от ячейки. Замер до правки: 125% —
//    центр уехал на 187.5px, 200% — на 243.8px, зазор 457.6px.
//
// Зум браузера моделируется так же, как он работает на самом деле:
// вьюпорт в CSS-пикселях делится на масштаб, deviceScaleFactor умножается
// на него. Физический размер окна при этом не меняется — ровно как при
// Cmd +/- на настоящем мониторе.
const puppeteer = require('/home/user/node_modules/puppeteer');
let bad = 0;
const t = (n, c, x = '') => { if (c) console.log('   ok  ', n, x); else { bad++; console.log('  FAIL ', n, x); } };

(async () => {
  const br = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const p = await br.newPage();
  p.setDefaultTimeout(60000);
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).split('\n')[0]));
  const PW = 1400, PH = 950;
  await p.setViewport({ width: PW, height: PH, deviceScaleFactor: 1 });
  await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1100));
  await p.evaluate(() => {
    sections = [{ id: 1, type: 'Verse', repeat: 1, squares: [{ id: 1, repeat: 1,
      events: [{ chord: 'Am', span: 4 }, { chord: 'C', span: 4 },
        { chord: 'F', span: 4 }, { chord: 'G', span: 4 }] }] }];
    nextId = 9; render();
  });
  await new Promise((r) => setTimeout(r, 500));

  // Замер ВСЕГДА относительно той ячейки, к которой тултип привязан
  // (currentTooltipWrapper), а не «ячейки №1»: при зуме под курсором
  // оказывается уже другая ячейка, и сравнение с ней врёт.
  const snap = () => p.evaluate(() => {
    const el = document.getElementById('fingering-tooltip');
    const shown = el.style.display === 'block' && el.classList.contains('visible');
    const w = currentTooltipWrapper || lastTooltipWrapper;
    const t = el.getBoundingClientRect();
    if (!shown || !w || t.width === 0) return { shown: false };
    const c = w.getBoundingClientRect();
    // positionMainTooltip ставит тултип с той стороны ячейки, где есть
    // место: сверху, снизу, слева или справа. На крупном масштабе окно
    // низкое, и сверху места нет — тултип уезжает вбок. Это штатно,
    // поэтому меряем не «центр над ячейкой», а РАССТОЯНИЕ между
    // прямоугольниками: тултип обязан примыкать к своей ячейке, с какой
    // бы стороны он ни встал.
    const dxRect = Math.max(0, c.left - t.right, t.left - c.right);
    const dyRect = Math.max(0, c.top - t.bottom, t.top - c.bottom);
    // СОСЕДНИЕ ячейки тултип накрывать не должен: закрытый чужой аккорд
    // на уроке читать невозможно. Свою ячейку накрыть допустимо — её имя
    // написано в самом тултипе.
    const covered = [...document.querySelectorAll('.chord-wrapper')].filter((x) => {
      if (x === w) return false;
      const r = x.getBoundingClientRect();
      return !(t.right < r.left || t.left > r.right || t.bottom < r.top || t.top > r.bottom);
    }).map((x) => (x.querySelector('.chord-input') || {}).value);
    return {
      covered,
      shown: true,
      dx: +((t.left + t.width / 2) - (c.left + c.width / 2)).toFixed(2),
      gap: +(c.top - t.bottom).toFixed(2),
      // Зазор до ячейки по обеим осям: 0 — касаются/перекрываются.
      dist: +Math.hypot(dxRect, dyRect).toFixed(2),
      side: dyRect > 0 ? (t.bottom <= c.top ? 'сверху' : 'снизу')
        : dxRect > 0 ? (t.right <= c.left ? 'слева' : 'справа') : 'вплотную',
      inWin: t.left >= -1 && t.top >= -1 && t.right <= innerWidth + 1 && t.bottom <= innerHeight + 1,
      win: `${innerWidth}x${innerHeight}`,
    };
  });
  const hoverCell = async (i) => {
    // На крупном масштабе окно становится маленьким (200% -> 700x475), и
    // ячейка может оказаться ниже нижнего края: курсор в её «центре»
    // тогда попадает за пределы окна и mouseover не приходит вовсе.
    // Это ограничение стенда, а не дефект приложения — прокручиваем.
    await p.evaluate((k) => {
      document.querySelectorAll('.chord-wrapper')[k]
        .scrollIntoView({ block: 'center', behavior: 'instant' });
    }, i);
    await new Promise((r) => setTimeout(r, 350));
    const pt = await p.evaluate((k) => {
      const r = document.querySelectorAll('.chord-wrapper')[k].getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    }, i);
    await p.mouse.move(pt.x - 25, pt.y - 25);
    await p.mouse.move(pt.x, pt.y);
    await new Promise((r) => setTimeout(r, 900));
    return pt;
  };
  const zoom = async (z) => {
    await p.setViewport({ width: Math.round(PW / z), height: Math.round(PH / z), deviceScaleFactor: z });
    await new Promise((r) => setTimeout(r, 700));
  };

  console.log('=== 1. Появление: тултип не «приезжает» ===');
  await hoverCell(0);
  await p.mouse.move(8, 8);
  await new Promise((r) => setTimeout(r, 500));
  const far = await p.evaluate(() => {
    const r = document.querySelectorAll('.chord-wrapper')[3].getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });
  await p.mouse.move(far.x, far.y);
  const frames = [];
  for (let k = 0; k < 8; k++) {
    await new Promise((r) => setTimeout(r, 55));
    frames.push(await p.evaluate(() => {
      const el = document.getElementById('fingering-tooltip');
      return +el.getBoundingClientRect().left.toFixed(1);
    }));
  }
  const settled = frames[frames.length - 1];
  const spread = Math.max(...frames.filter((v) => v > 0)) - Math.min(...frames.filter((v) => v > 0));
  console.log('      кадры left:', frames.join(' '));
  t('тултип сразу на конечном месте', spread < 2, `разброс ${spread.toFixed(1)}px`);
  t('и это место верное', Math.abs(frames[0] - settled) < 2, `${frames[0]} против ${settled}`);

  console.log('\n=== 2. Зум страницы: тултип держится за ячейку ===');
  for (const z of [1, 1.25, 1.5, 2, 0.8]) {
    await zoom(z);
    // После смены масштаба наводимся заново: реальный пользователь
    // либо держит курсор, либо ведёт им — тултип должен быть точен.
    await hoverCell(1);
    const m = await snap();
    console.log(`      ${(z * 100).toFixed(0)}%`.padEnd(12), JSON.stringify(m));
    t(`${(z * 100).toFixed(0)}%: тултип виден`, m.shown);
    if (m.shown) {
      t(`${(z * 100).toFixed(0)}%: тултип примыкает к ячейке`, m.dist <= 16,
        `${m.side}, зазор ${m.dist}px`);
      t(`${(z * 100).toFixed(0)}%: целиком в окне`, m.inWin);
      t(`${(z * 100).toFixed(0)}%: соседние аккорды не закрыты`,
        m.covered.length === 0, m.covered.join(', '));
      t(`${(z * 100).toFixed(0)}%: сторона вертикальная`,
        m.side === 'сверху' || m.side === 'снизу' || m.side === 'вплотную', m.side);
    }
  }

  console.log('\n=== 3. Зум НА ЛЕТУ при открытом тултипе ===');
  await zoom(1);
  await hoverCell(1);
  const before = await snap();
  console.log('      до зума   ', JSON.stringify(before));
  for (const z of [1.25, 1.5]) {
    // Курсор НЕ трогаем — только меняем масштаб, как Cmd +.
    await p.setViewport({ width: Math.round(PW / z), height: Math.round(PH / z), deviceScaleFactor: z });
    await new Promise((r) => setTimeout(r, 700));
    const m = await snap();
    console.log(`      ${(z * 100).toFixed(0)}% на лету`.padEnd(20), JSON.stringify(m));
    if (m.shown) {
      t(`${(z * 100).toFixed(0)}%: тултип догнал ячейку`, m.dist <= 16,
        `${m.side}, зазор ${m.dist}px`);
      t(`${(z * 100).toFixed(0)}%: целиком в окне`, m.inWin);
      t(`${(z * 100).toFixed(0)}%: соседние аккорды не закрыты`,
        m.covered.length === 0, m.covered.join(', '));
    }
  }

  console.log('\n=== 4. Сильный зум: шапка тултипа не срезана ===');
  // Пользователь прислал скриншот: видны только карандаш и «1/5», ни
  // грифа, ни имени аккорда. Тултип (274px) выше окна, и коррекция
  // границ считала top = wh - th - margin = отрицательное число —
  // верх уезжал за экран. Прижатие к верхнему краю должно идти
  // ПОСЛЕДНИМ: обрезать можно только низ.
  for (const z of [2.5, 3, 4]) {
    await zoom(z);
    await hoverCell(1);
    const m = await p.evaluate(() => {
      const el = document.getElementById('fingering-tooltip');
      const t = el.getBoundingClientRect();
      const part = (sel) => {
        const n = el.querySelector(sel);
        if (!n) return null;
        const r = n.getBoundingClientRect();
        return { top: +r.top.toFixed(0), vis: r.top >= -1 && r.bottom <= innerHeight + 1 };
      };
      return { win: `${innerWidth}x${innerHeight}`, th: el.offsetHeight,
        tipTop: +t.top.toFixed(0), taller: el.offsetHeight > innerHeight,
        name: part('.fingering-chord-name'), svg: part('.fingering-svg-container') };
    });
    console.log(`      ${(z * 100).toFixed(0)}%  окно ${m.win}  тултип h=${m.th}` +
      `${m.taller ? ' (ВЫШЕ окна)' : ''}  top=${m.tipTop}`);
    t(`${(z * 100).toFixed(0)}%: верх тултипа не за экраном`, m.tipTop >= -1, `top=${m.tipTop}`);
    t(`${(z * 100).toFixed(0)}%: имя аккорда видно`, m.name && m.name.vis, JSON.stringify(m.name));
    t(`${(z * 100).toFixed(0)}%: гриф видно`, m.svg && m.svg.vis, JSON.stringify(m.svg));
  }

  console.log('\n=== 5. Залипшая панель транспорта не накрывает тултип ===');
  // Панель стала sticky (z-index 60) и висит сверху при прокрутке.
  // Тултип (z-index 10000) обязан рисоваться ПОВЕРХ неё, иначе гриф
  // окажется под кнопками.
  //
  // Щуп ставим в СЕРЕДИНУ области пересечения и в девять точек, а не в
  // угол: у тултипа скруглённые углы, там он прозрачен, и
  // elementFromPoint возвращает то, что под ним. На этом я один раз
  // уже ошибся и принял исправную картинку за дефект.
  for (const z of [1.5, 3]) {
    await zoom(z);
    // Панель транспорта на узких экранах прячется мобильной раскладкой —
    // проверять нечего, пропускаем.
    if (!(await p.evaluate(() => !!document.querySelector('.transport-bar')))) {
      console.log(`      ${(z * 100).toFixed(0)}%: панели транспорта нет в раскладке, пропуск`);
      continue;
    }
    // Прокручиваем так, чтобы панель ЗАЛИПЛА, но ячейки остались на
    // экране: на крупном масштабе окно низкое, и scrollTo(500) уводит
    // все ячейки за край — проверять было бы нечего.
    await p.evaluate(() => {
      const bar = document.querySelector('.transport-bar');
      window.scrollTo(0, bar.offsetTop + 40);
    });
    await new Promise((r) => setTimeout(r, 400));
    const pt = await p.evaluate(() => {
      const vis = [...document.querySelectorAll('.chord-wrapper')].find((c) => {
        const r = c.getBoundingClientRect();
        return r.top > 0 && r.bottom < innerHeight && r.left > 0 && r.right < innerWidth && r.width > 20;
      });
      if (!vis) return null;
      const r = vis.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    });
    if (!pt) { console.log(`      ${(z * 100).toFixed(0)}%: видимой ячейки нет, пропуск`); continue; }
    await p.mouse.move(pt.x - 20, pt.y - 20);
    await p.mouse.move(pt.x, pt.y);
    await new Promise((r) => setTimeout(r, 950));
    const m = await p.evaluate(() => {
      const tip = document.getElementById('fingering-tooltip');
      const t = tip.getBoundingClientRect();
      const barEl = document.querySelector('.transport-bar');
      const bar = barEl.getBoundingClientRect();
      const ix1 = Math.max(t.left, bar.left), ix2 = Math.min(t.right, bar.right);
      const iy1 = Math.max(t.top, bar.top), iy2 = Math.min(t.bottom, bar.bottom);
      const zTip = +getComputedStyle(tip).zIndex, zBar = +getComputedStyle(barEl).zIndex;
      if (ix2 <= ix1 || iy2 <= iy1) return { overlap: false, zTip, zBar };
      const pts = [];
      for (const fx of [0.3, 0.5, 0.7]) for (const fy of [0.3, 0.5, 0.7]) {
        const el = document.elementFromPoint(ix1 + (ix2 - ix1) * fx, iy1 + (iy2 - iy1) * fy);
        pts.push(!!(el && (el === tip || tip.contains(el))));
      }
      return { overlap: true, zTip, zBar, area: `${(ix2 - ix1).toFixed(0)}x${(iy2 - iy1).toFixed(0)}`,
        onTop: pts.every(Boolean), hits: pts.filter(Boolean).length };
    });
    if (!m.overlap) {
      console.log(`      ${(z * 100).toFixed(0)}%: с панелью не пересекается`);
    } else {
      console.log(`      ${(z * 100).toFixed(0)}%: пересечение ${m.area}, тултип сверху в ${m.hits}/9 точках`);
      t(`${(z * 100).toFixed(0)}%: тултип поверх панели`, m.onTop, `${m.hits}/9`);
    }
    t(`${(z * 100).toFixed(0)}%: слой тултипа выше панели`, m.zTip > m.zBar, `${m.zTip} против ${m.zBar}`);
  }
  await p.evaluate(() => window.scrollTo(0, 0));
  await new Promise((r) => setTimeout(r, 300));

  console.log('\n=== 6. overflow-x: clip не обрезает тултип ===');
  // Ради sticky-панели body и .container получили overflow-x: clip.
  // Тултипы — position: fixed и прямые дети body; clip на них влиять
  // не должен. Проверяем ПИКСЕЛЯМИ: rect остаётся прежним, даже если
  // элемент визуально срезан.
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await new Promise((r) => setTimeout(r, 600));
  const clip = await p.evaluate(async () => {
    const tip = document.getElementById('fingering-tooltip');
    tip.classList.add('no-move-transition');
    tip.querySelector('.fingering-content').innerHTML =
      '<div id="clipProbe" style="width:140px;height:100px;background:rgb(255,0,0)"></div>';
    tip.style.display = 'block'; tip.classList.add('visible'); tip.style.opacity = '1';
    tip.style.top = '200px'; tip.style.left = '-70px';
    await new Promise((r) => setTimeout(r, 200));
    const pr = document.getElementById('clipProbe').getBoundingClientRect();
    // Точка внутри красного блока, но левее нулевой координаты быть не
    // может — берём первую видимую колонку.
    const el = document.elementFromPoint(2, pr.top + 20);
    return { bodyOv: getComputedStyle(document.body).overflowX,
      probeL: +pr.left.toFixed(0), probeR: +pr.right.toFixed(0),
      visibleAtEdge: !!(el && tip.contains(el)) };
  });
  console.log('   ', JSON.stringify(clip));
  t('body действительно с clip', clip.bodyOv === 'clip', clip.bodyOv);
  t('часть тултипа за краем окна не срезана', clip.visibleAtEdge,
    `слева ${clip.probeL}, точка (2, …)`);
  await p.setViewport({ width: PW, height: PH, deviceScaleFactor: 1 });
  await new Promise((r) => setTimeout(r, 400));

  console.log('\n=== 6б. Раскладка как в панели ленты ===');
  // Тултип редактора приведён к виду панели «Сейчас»: гриф опущен ниже
  // имени аккорда, а «‹ 1/3 › ✎» стоят ОДНОЙ строкой поверх пустого
  // места под сеткой (абсолютный слой внутри контейнера грифа).
  // Высота SVG остаётся 180 — запас под сеткой и есть место под строку.
  //
  // Во время игры на месте строки кнопок — плашка ритма ПОВЕРХ нижних
  // (пустых) ладов, см. раздел 6в.
  await p.setViewport({ width: PW, height: PH, deviceScaleFactor: 1 });
  await new Promise((r) => setTimeout(r, 400));
  await p.evaluate(() => {
    sections = [{ id: 1, type: 'Verse', repeat: 1, squares: [{ id: 1, repeat: 1,
      events: [{ chord: 'Am', span: 4 }, { chord: 'C', span: 4 }] }] }];
    nextId = 9; render();
    hideFingeringTooltip(false);
    document.querySelectorAll('.key-change-confirm-overlay').forEach((el) => el.remove());
  });
  await new Promise((r) => setTimeout(r, 500));
  const cc = await p.evaluate(() => {
    const el = document.querySelectorAll('.chord-wrapper')[0];
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });
  await p.mouse.move(8, 8);
  await new Promise((r) => setTimeout(r, 300));
  await p.mouse.move(cc.x - 40, cc.y - 40, { steps: 4 });
  await p.mouse.move(cc.x, cc.y, { steps: 6 });
  await new Promise((r) => setTimeout(r, 1100));
  const comp = await p.evaluate(() => {
    const t = document.getElementById('fingering-tooltip');
    const tr = t.getBoundingClientRect();
    const svg = t.querySelector('svg');
    const pencil = t.querySelector('.tooltip-edit-btn');
    const nav = t.querySelector('.tooltip-nav-left');
    const sr = svg ? svg.getBoundingClientRect() : null;
    const pr = pencil ? pencil.getBoundingClientRect() : null;
    const nr = nav ? nav.getBoundingClientRect() : null;
    let clickable = ['.tooltip-nav-left', '.tooltip-nav-right', '.tooltip-edit-btn']
      .every((sel) => {
        const b = t.querySelector(sel);
        if (!b) return true;
        const r = b.getBoundingClientRect();
        const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!(el && (el === b || b.contains(el)));
      });
    const ctrl = t.querySelector('.tooltip-controls');
    const cr = ctrl ? ctrl.getBoundingClientRect() : null;
    const ys = [...svg.querySelectorAll('line')]
      .filter((l) => l.getAttribute('x1') !== l.getAttribute('x2'))
      .map((l) => +l.getAttribute('y1'));
    const scale = sr.height / (+svg.getAttribute('height') || 180);
    const gridBottom = sr.top + Math.max(...ys) * scale;
    const nameEl = t.querySelector('.fingering-chord-name');
    return {
      h: Math.round(tr.height),
      svgH: sr ? Math.round(sr.height) : null,
      svgAttr: svg ? +svg.getAttribute('height') : null,
      // Строка лежит В ЗАПАСЕ под сеткой, не ниже рисунка.
      inGap: cr ? cr.top >= gridBottom - 4 && cr.bottom <= sr.bottom + 1 : null,
      // Один ряд: карандаш и стрелки на одной высоте.
      oneRow: cr && pr && nr ? Math.abs(pr.top - nr.top) < 4 : null,
      // Гриф опущен ниже имени, как в панели ленты.
      gapUnderName: nameEl && sr
        ? Math.round(sr.top - nameEl.getBoundingClientRect().bottom) : null,
      insideTip: cr ? cr.bottom <= tr.bottom + 0.5 : true,
      noSlot: !t.querySelector('.tooltip-strum-slot'),
      hasCtrlRow: !!ctrl,
      clickable,
    };
  });
  console.log('   ', JSON.stringify(comp));
  t('высота SVG 180', comp.svgAttr === 180, String(comp.svgAttr));
  t('строка управления одна', comp.hasCtrlRow === true);
  t('карандаш и стрелки в один ряд', comp.oneRow === true);
  t('строка лежит в запасе под сеткой', comp.inGap === true);
  t('гриф опущен ниже имени', comp.gapUnderName >= 8, `${comp.gapUnderName}px`);
  t('всё внутри тултипа', comp.insideTip === true);
  t('в паузе плашки ритма нет', comp.noSlot === true);
  t('кнопки кликабельны', comp.clickable === true);

  console.log('\n=== 6в. Ритм — плашкой поверх нижних ладов ===');
  // Отдельным блоком под грифом виджет растил тултип с 226 до 270px:
  // окно дёргалось ровно тогда, когда на него смотрят. В запас под
  // сеткой он не влезает — у перебора номера струн стоят столбиком,
  // это 61px при запасе 30px.
  //
  // Поэтому ритм лежит ПЛАШКОЙ поверх нижней части грифа: там пусто у
  // подавляющего большинства форм. Слой абсолютный — габариты тултипа
  // не меняются вовсе.
  await p.evaluate(() => {
    sections = [{ id: 1, type: 'Verse', repeat: 1, squares: [{ id: 1, repeat: 1,
      events: [{ chord: 'Am', span: 4 }, { chord: 'C', span: 4 }] }],
      strumPattern: { mode: 'strum', subdivision: 4,
        steps: ['D', null, 'U', null, 'D', 'U', null, 'U', 'D', null, 'U', null, 'D', 'U', null, 'U'] } }];
    nextId = 9; render();
    hideFingeringTooltip(false);
    document.querySelectorAll('.key-change-confirm-overlay').forEach((el) => el.remove());
  });
  await new Promise((r) => setTimeout(r, 500));
  const cell2 = await p.evaluate(() => {
    const el = document.querySelectorAll('.chord-wrapper')[0];
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });
  await p.mouse.move(8, 8);
  await new Promise((r) => setTimeout(r, 300));
  await p.mouse.move(cell2.x - 40, cell2.y - 40, { steps: 4 });
  await p.mouse.move(cell2.x, cell2.y, { steps: 6 });
  await new Promise((r) => setTimeout(r, 1100));
  const pause = await p.evaluate(() => {
    const r = document.getElementById('fingering-tooltip').getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  const playBtn = await p.evaluate(() => {
    const r = document.getElementById('btnPlay').getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });
  await p.mouse.click(playBtn.x, playBtn.y);
  await new Promise((r) => setTimeout(r, 1800));
  const play = await p.evaluate(() => {
    const t = document.getElementById('fingering-tooltip');
    const tr = t.getBoundingClientRect();
    const strum = t.querySelector('#tooltipLiveStrum');
    const slot = t.querySelector('.tooltip-strum-slot');
    const svg = t.querySelector('svg');
    const steps = strum ? [...strum.querySelectorAll('.strum-step')] : [];
    const sr = slot ? slot.getBoundingClientRect() : null;
    const vr = svg ? svg.getBoundingClientRect() : null;
    const ys = svg ? [...svg.querySelectorAll('line')]
      .filter((l) => l.getAttribute('x1') !== l.getAttribute('x2'))
      .map((l) => +l.getAttribute('y1')) : [];
    const scale = vr && svg ? vr.height / (+svg.getAttribute('height') || 180) : 1;
    const gridBottom = vr ? vr.top + Math.max(...ys) * scale : null;
    const cs = slot ? getComputedStyle(slot) : null;
    return { w: Math.round(tr.width), h: Math.round(tr.height),
      hasStrum: !!strum,
      absolute: cs ? cs.position === 'absolute' : null,
      opaque: cs ? !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor) : null,
      overGrid: sr && vr ? sr.top < vr.bottom && sr.bottom > vr.top : null,
      // Накрывает НИЖНЮЮ часть грифа, а не середину.
      lowerHalf: sr && vr && gridBottom ? sr.top > (vr.top + gridBottom) / 2 : null,
      oneRow: sr ? sr.height <= 32 : null,
      pencilHidden: !t.querySelector('.tooltip-edit-btn'),
      ctrlHidden: !t.querySelector('.tooltip-controls'),
      strumW: sr ? Math.round(sr.width) : null,
      outside: steps.filter((e) => {
        const r = e.getBoundingClientRect();
        return r.left < tr.left - 0.5 || r.right > tr.right + 0.5 || r.bottom > tr.bottom + 0.5;
      }).length };
  });
  console.log(`      пауза ${pause.w}x${pause.h}  игра ${play.w}x${play.h}  бой ${play.strumW}px`);
  t('виджет боя показан', play.hasStrum);
  t('ритм — абсолютная плашка', play.absolute === true);
  t('с непрозрачной подложкой', play.opaque === true);
  t('лежит поверх грифа', play.overGrid === true);
  t('накрывает нижнюю часть', play.lowerHalf === true);
  // Высота плашки зависит от ритма: у боя одна строка, у щипка
  // нескольких струн цифры стоят СТОЛБИКОМ и плашка выше. Это норма —
  // проверяем не «одну строку», а что гриф читается: плашка не лезет
  // выше середины сетки.
  t('не закрывает середину грифа', play.lowerHalf === true);
  t('карандаш на время игры скрыт', play.pencilHidden === true);
  t('строка кнопок убрана', play.ctrlHidden === true);
  // Габариты не меняются вовсе: плашка абсолютная, тултип не растёт ни
  // по высоте, ни по ширине.
  // Высота не меняется НИКОГДА: плашка абсолютная.
  t('высота не изменилась', pause.h === play.h, `${pause.h} -> ${play.h}`);
  t('бой не вылезает за края', play.outside === 0, `${play.outside} шагов снаружи`);

  // Длинный НЕПЕРИОДИЧНЫЙ рисунок: findRepeatUnit его не схлопывает, и
  // ряду нужно больше ширины, чем у грифа. Раньше .strum-preview с
  // min-width: 0 ужимался ниже содержимого — шаги налезали друг на
  // друга и торчали за края (замер: 8 вне плашки, 6 вне тултипа).
  // Теперь под ритм раздвигается сам тултип (setTooltipStrumWidth).
  await p.evaluate(() => { if (playbackState.isPlaying) playAll(); });
  await new Promise((r) => setTimeout(r, 400));
  await p.evaluate(() => {
    sections = [{ id: 1, type: 'Verse', repeat: 1, squares: [{ id: 1, repeat: 1,
      events: [{ chord: 'Am', span: 16 }] }],
      strumPattern: { mode: 'strum', subdivision: 4,
        steps: ['D', null, 'U', 'U', 'D', null, 'U', null,
                'D', 'U', 'U', null, 'D', 'U', null, 'U'] } }];
    nextId = 9; render();
    hideFingeringTooltip(false);
    document.querySelectorAll('.key-change-confirm-overlay').forEach((el) => el.remove());
  });
  await new Promise((r) => setTimeout(r, 500));
  const cell3 = await p.evaluate(() => {
    const el = document.querySelectorAll('.chord-wrapper')[0];
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });
  await p.evaluate(() => { if (!playbackState.isPlaying) playAll(); });
  await new Promise((r) => setTimeout(r, 1300));
  await p.mouse.move(8, 8);
  await new Promise((r) => setTimeout(r, 250));
  await p.mouse.move(cell3.x - 40, cell3.y - 40, { steps: 4 });
  await p.mouse.move(cell3.x, cell3.y, { steps: 6 });
  await new Promise((r) => setTimeout(r, 1000));
  const wide = await p.evaluate(() => {
    const t = document.getElementById('fingering-tooltip');
    const tr = t.getBoundingClientRect();
    const slot = t.querySelector('.tooltip-strum-slot');
    const svg = t.querySelector('svg');
    const row = slot ? slot.querySelector('.strum-preview') : null;
    const steps = slot ? [...slot.querySelectorAll('.strum-step')] : [];
    const vr = svg ? svg.getBoundingClientRect() : null;
    return {
      w: Math.round(tr.width), h: Math.round(tr.height),
      steps: steps.length,
      // Ряд не ужат ниже содержимого.
      squeezed: row ? row.scrollWidth > row.clientWidth + 1 : null,
      offLeft: tr.left < -0.5, offRight: tr.right > innerWidth + 0.5,
      gridCentered: vr ? Math.abs((vr.left - tr.left) - (tr.right - vr.right)) < 2 : null,
      outside: steps.filter((e) => {
        const r = e.getBoundingClientRect();
        return r.left < tr.left - 0.5 || r.right > tr.right + 0.5;
      }).length,
    };
  });
  console.log('   широкий ритм:', JSON.stringify(wide));
  t('шагов много', wide.steps >= 12, String(wide.steps));
  t('ряд не ужат', wide.squeezed === false);
  t('тултип раздвинулся', wide.w > play.w, `${play.w} -> ${wide.w}`);
  t('высота та же', wide.h === pause.h, `${pause.h} -> ${wide.h}`);
  t('ничего не вылезает', wide.outside === 0, `${wide.outside} шагов снаружи`);
  t('за экран не уехал', wide.offLeft === false && wide.offRight === false);
  t('гриф остался по центру', wide.gridCentered === true);
  // После закрытия расширение снимается: иначе скрытый тултип держит
  // min-width от прошлого рисунка.
  const reset = await p.evaluate(() => {
    hideFingeringTooltip(false);
    return document.getElementById('fingering-tooltip').style.minWidth || '';
  });
  t('после закрытия ширина сброшена', reset === '', reset);

  // Щипок НЕСКОЛЬКИХ струн разом — цифры друг под другом, как в бейдже
  // секции. Одной строкой «Б 2» читается как два последовательных
  // щипка. Раньше здесь стоял flex-direction: row ради высоты плашки.
  await p.evaluate(() => { if (playbackState.isPlaying) playAll(); });
  await new Promise((r) => setTimeout(r, 400));
  await p.evaluate(() => {
    sections = [{ id: 1, type: 'Verse', repeat: 1, squares: [{ id: 1, repeat: 1,
      events: [{ chord: 'Am', span: 8 }] }],
      strumPattern: { mode: 'pick', subdivision: 2,
        steps: [['B'], ['2'], ['B', '2'], ['3'], ['B'], ['2'], ['B', '2'], ['3']] } }];
    nextId = 9; render();
    hideFingeringTooltip(false);
    document.querySelectorAll('.key-change-confirm-overlay').forEach((el) => el.remove());
  });
  await new Promise((r) => setTimeout(r, 500));
  const cell4 = await p.evaluate(() => {
    const el = document.querySelectorAll('.chord-wrapper')[0];
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });
  await p.evaluate(() => { if (!playbackState.isPlaying) playAll(); });
  await new Promise((r) => setTimeout(r, 1300));
  await p.mouse.move(8, 8);
  await new Promise((r) => setTimeout(r, 250));
  await p.mouse.move(cell4.x - 40, cell4.y - 40, { steps: 4 });
  await p.mouse.move(cell4.x, cell4.y, { steps: 6 });
  await new Promise((r) => setTimeout(r, 1000));
  const stack = await p.evaluate(() => {
    const t = document.getElementById('fingering-tooltip');
    const tr = t.getBoundingClientRect();
    const slot = t.querySelector('.tooltip-strum-slot');
    if (!slot) return null;
    // Тот же шаг в бейдже секции — эталон.
    const ref = document.querySelector('.section-card .strum-preview .strum-step.pick');
    const step = [...slot.querySelectorAll('.strum-step.pick')]
      .find((x) => x.querySelectorAll('.strum-pick-num').length > 1);
    if (!step) return { noMulti: true };
    const nums = [...step.querySelectorAll('.strum-pick-num')]
      .map((n) => n.getBoundingClientRect());
    const cs = getComputedStyle(step);
    const refCs = ref ? getComputedStyle(ref) : null;
    const sr = slot.getBoundingClientRect();
    return {
      dir: cs.flexDirection,
      sameAsBadge: refCs ? cs.flexDirection === refCs.flexDirection &&
        cs.gap === refCs.gap && cs.fontSize === refCs.fontSize : null,
      // Цифры в одной колонке и на разных строках.
      sameCol: nums.every((r) => Math.abs((r.left + r.width / 2) -
        (nums[0].left + nums[0].width / 2)) < 3),
      diffRow: nums.every((r, i) => i === 0 || Math.abs(r.top - nums[i - 1].top) > 4),
      insideTip: sr.left >= tr.left - 0.5 && sr.right <= tr.right + 0.5 &&
        sr.bottom <= tr.bottom + 0.5,
      h: Math.round(tr.height),
    };
  });
  console.log('   щипок нескольких струн:', JSON.stringify(stack));
  if (stack && !stack.noMulti) {
    t('цифры стоят столбиком', stack.dir === 'column-reverse', stack.dir);
    t('в одной колонке', stack.sameCol === true);
    t('на разных строках', stack.diffRow === true);
    t('оформлен как бейдж секции', stack.sameAsBadge === true);
    t('плашка внутри тултипа', stack.insideTip === true);
    // Высота РАСТЁТ намеренно: столбик выше строки боя, и рисунок
    // разводится с плашкой, чтобы та не села на сетку (раздел 6г).
    // Требовать неизменности здесь нельзя — проверяем разумность.
    t('высота выросла умеренно', stack.h >= pause.h && stack.h <= pause.h + 40,
      `${pause.h} -> ${stack.h}`);
  }
  await p.evaluate(() => { if (playbackState.isPlaying) playAll(); });
  await new Promise((r) => setTimeout(r, 400));
  await p.evaluate(() => { if (playbackState.isPlaying) playAll(); });
  await new Promise((r) => setTimeout(r, 500));

  console.log('\n=== 6г. Высокая плашка не залезает на сетку ===');
  // У щипка нескольких струн плашка выше боя (47 и 68px против 26).
  // Рисунок приподнимается на величину нахлёста: сначала в зазор над
  // ним, потом добором поля снизу.
  //
  // Считаем от НИЖНЕЙ ЛИНИИ СЕТКИ, а не от самой нижней точки. По
  // точкам правило молчало, когда под ними пусто, — и плашка съедала
  // два нижних лада (скриншот пользователя: Б2 _ Б₂ 3 …, гриф выглядел
  // обрезанным). Сетка это часть рисунка, закрывать её нельзя.
  //
  // Подъём ограничен ЗАЗОРОМ до имени аккорда: у холста непрозрачный
  // фон, и сдвиг сверх зазора закрывал заголовок этим фоном.
  const lifts = [];
  for (const [nm, pat, slotH] of [
    ['бой', { mode: 'strum', subdivision: 2,
      steps: ['D', null, 'D', 'U', 'D', null, 'D', 'U'] }, 26],
    ['щипок x2', { mode: 'pick', subdivision: 2,
      steps: [['B'], ['2'], ['B', '2'], ['3'], ['B'], ['2'], ['B', '2'], ['3']] }, 47],
    ['щипок x3', { mode: 'pick', subdivision: 2,
      steps: [['B', '2', '3'], ['1'], ['B', '2', '3'], ['2'],
              ['B'], ['3'], ['B', '1'], ['2']] }, 68],
  ]) {
    await p.evaluate((pt) => {
      // Форма с точкой у САМОГО НИЗА сетки — иначе накрывать нечего.
      sections = [{ id: 1, type: 'Verse', repeat: 1, squares: [{ id: 1, repeat: 1,
        events: [{ chord: 'Am', span: 8, fingering: '1,3,3,2,1,5' }] }],
        strumPattern: pt }];
      nextId = 9; render();
      hideFingeringTooltip(false);
      document.querySelectorAll('.key-change-confirm-overlay').forEach((el) => el.remove());
    }, pat);
    await new Promise((r) => setTimeout(r, 450));
    const cc2 = await p.evaluate(() => {
      const el = document.querySelectorAll('.chord-wrapper')[0];
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    });
    await p.evaluate(() => { if (!playbackState.isPlaying) playAll(); });
    await new Promise((r) => setTimeout(r, 1200));
    await p.mouse.move(8, 8);
    await new Promise((r) => setTimeout(r, 200));
    await p.mouse.move(cc2.x - 40, cc2.y - 40, { steps: 4 });
    await p.mouse.move(cc2.x, cc2.y, { steps: 6 });
    await new Promise((r) => setTimeout(r, 900));
    const m = await p.evaluate(() => {
      const t = document.getElementById('fingering-tooltip');
      const tr = t.getBoundingClientRect();
      const slot = t.querySelector('.tooltip-strum-slot');
      const svg = t.querySelector('svg');
      if (!slot || !svg) return null;
      const sr = slot.getBoundingClientRect();
      const dots = [...svg.querySelectorAll('circle')]
        .filter((c) => c.getAttribute('fill') !== 'none');
      const covered = dots.filter((d) => {
        const r = d.getBoundingClientRect();
        return r.bottom > sr.top + 0.5 && r.top < sr.bottom - 0.5 &&
               r.right > sr.left + 0.5 && r.left < sr.right - 0.5;
      }).length;
      const lines = [...svg.querySelectorAll('line')]
        .filter((l) => l.getAttribute('x1') !== l.getAttribute('x2'));
      const gridOverlap = lines.length
        ? Math.round(Math.max(...lines.map((l) => l.getBoundingClientRect().bottom)) - sr.top)
        : null;
      const name = t.querySelector('.fingering-chord-name');
      const marks = [...svg.querySelectorAll('text, circle, line')]
        .map((e) => e.getBoundingClientRect().top);
      return {
        covered,
        gridOverlap,
        slotH: Math.round(sr.height),
        tf: svg.style.transform || '',
        pad: svg.parentElement.style.paddingBottom || '',
        gapToName: name && marks.length
          ? Math.round(Math.min(...marks) - name.getBoundingClientRect().bottom) : null,
        insideTip: svg.getBoundingClientRect().top >= tr.top - 0.5,
      };
    });
    lifts.push([nm, slotH, m]);
    await p.evaluate(() => { if (playbackState.isPlaying) playAll(); });
    await new Promise((r) => setTimeout(r, 300));
  }
  lifts.forEach(([nm, slotH, m]) => console.log(`   ${nm}: ${JSON.stringify(m)}`));
  lifts.forEach(([nm, slotH, m]) => {
    t(`${nm}: точки не закрыты`, m && m.covered === 0, m ? String(m.covered) : 'нет данных');
    t(`${nm}: сетка не закрыта`, m && m.gridOverlap <= 0,
      m ? `${m.gridOverlap}px нахлёста` : 'нет данных');
    t(`${nm}: плашка ${slotH}px`, m && Math.abs(m.slotH - slotH) <= 2, m ? String(m.slotH) : '');
    t(`${nm}: имя аккорда не накрыто`, m && m.gapToName >= 0, m ? String(m.gapToName) : '');
    t(`${nm}: рисунок внутри тултипа`, m && m.insideTip === true);
  });
  // Чем выше плашка, тем сильнее разводятся рисунок и ритм. У боя
  // хватает подъёма на пару пикселей, у щипка трёх струн добирается
  // ещё и поле снизу.
  const shift = (m) => {
    const mt = m && m.tf ? /translateY\((-?\d+)/.exec(m.tf) : null;
    return (mt ? Math.abs(+mt[1]) : 0) + (m && m.pad ? parseInt(m.pad, 10) || 0 : 0);
  };
  console.log(`   развод: бой ${shift(lifts[0][2])}px, x2 ${shift(lifts[1][2])}px, ` +
    `x3 ${shift(lifts[2][2])}px`);
  t('чем выше плашка, тем больше развод',
    shift(lifts[0][2]) < shift(lifts[1][2]) && shift(lifts[1][2]) < shift(lifts[2][2]));

  console.log('\n=== 7. Слушатель поставлен один раз ===');
  const once = await p.evaluate(() => {
    const a = !!window.__tooltipZoomReady;
    attachTooltipZoomReposition();
    attachTooltipZoomReposition();
    return { ready: a, fn: typeof repositionFingeringTooltips };
  });
  t('флаг защиты от дублей стоит', once.ready);
  t('функция перепозиционирования есть', once.fn === 'function', once.fn);

  t('ошибок страницы нет', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё зелено');
  await br.close();
  process.exit(bad ? 1 : 0);
})();
