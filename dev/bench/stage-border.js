// Край ленты: подложка должна отличаться от фона страницы, а КАЙМЫ
// вокруг ленты быть не должно.
//
// История: сначала край терялся вовсе (контраст 1.10..1.47), и была
// добавлена линия акцентом. Но во время воспроизведения она читалась
// как ВЫДЕЛЕНИЕ и спорила с оранжевой меткой «сейчас» того же цвета —
// по требованию пользователя кайма убрана. Край держит подложка
// (--tl-track-bg) плюс мягкая тень.
//
// Стенд следит за двумя вещами:
//   1) каймы нет и она не вернулась случайно;
//   2) подложка всё ещё отличается от фона — иначе лента сольётся
//      с листом и перестанет читаться как отдельный объект.
const puppeteer = require('/home/user/node_modules/puppeteer');
const fs = require('fs');
const PNG = require('/home/user/node_modules/pngjs').PNG;

const LIN = (c) => {
  const q = c.map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * q[0] + 0.7152 * q[1] + 0.0722 * q[2];
};
const cr = (a, b) => {
  const l1 = LIN(a);
  const l2 = LIN(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

// Порог отличия ПОДЛОЖКИ от фона страницы. Он заведомо мал (подложка
// намеренно близка к фону), но не равен 1.00 — иначе объекта нет вовсе.
const MIN = 1.05;
let bad = 0;
const t = (n, c, x = '') => {
  if (c) console.log('   ok  ', n, x);
  else {
    bad++;
    console.log('  FAIL ', n, x);
  }
};

const SCHEMES = ['(дефолт)', 'bean', 'bed', 'cloud', 'dawn', 'fog', 'forest', 'frost',
  'heat', 'ocean', 'pea', 'pepper', 'plum', 'raspberry', 'storm', 'sunset'];

(async () => {
  const song = JSON.parse(fs.readFileSync('/home/user/dev/fixtures/wind-of-change.json', 'utf8'));
  const br = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
  });
  const p = await br.newPage();
  await p.setViewport({ width: 1400, height: 900 });
  p.setDefaultTimeout(90000);
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).split('\n')[0]));

  for (const dark of [true, false]) {
    const rows = [];
    for (const sc of SCHEMES) {
      await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
      await new Promise((r) => setTimeout(r, 800));
      await p.evaluate((s, d, x) => {
        const r = document.documentElement;
        if (d) r.setAttribute('data-theme', 'dark');
        if (x !== '(дефолт)') r.setAttribute('data-scheme', x);
        localStorage.setItem('struchord_songs', JSON.stringify([s]));
        loadSong(0);
        render();
      }, song, dark, sc);
      await new Promise((r) => setTimeout(r, 700));
      await p.evaluate(() => toggleTimelineMode(true));
      // .theme-transition живёт 400 мс — ждём 650, иначе меряем полупереход.
      await new Promise((r) => setTimeout(r, 800));
      const buf = await p.screenshot();
      const png = PNG.sync.read(buf);
      const at = (x, y) => {
        const i = (png.width * y + x) << 2;
        return [png.data[i], png.data[i + 1], png.data[i + 2]];
      };
      const g = await p.evaluate(() => {
        const r = document.querySelector('.timeline-stage').getBoundingClientRect();
        return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top) };
      });
      const cx = Math.round((g.l + g.r) / 2);
      const page = at(cx, g.t - 10);
      let best = 0;
      for (let d = 0; d <= 3; d++) {
        const c = cr(at(cx, g.t + d), page);
        if (c > best) best = c;
      }
      rows.push({ sc, c: best });
    }
    rows.sort((a, b) => a.c - b.c);
    const worst = rows[0];
    console.log(`\n=== ${dark ? 'ТЁМНАЯ' : 'СВЕТЛАЯ'} ===`);
    console.log('   ' + rows.map((r) => `${r.sc} ${r.c.toFixed(2)}`).join(', '));
    t(`${dark ? 'тёмная' : 'светлая'}: подложка отличается от фона во всех ${SCHEMES.length} схемах`,
      worst.c >= MIN, `худшая — ${worst.sc}, контраст ${worst.c.toFixed(2)} (порог ${MIN})`);
  }

  // Каймы быть не должно — ни border на сцене, ни рамкой в ::after.
  // Заодно border на сцене сдвинул бы содержимое на 1px, а вся
  // геометрия ленты считается в пикселях от края.
  const geom = await p.evaluate(() => {
    const st = document.querySelector('.timeline-stage');
    const cs = getComputedStyle(st);
    const af = getComputedStyle(st, '::after');
    return { border: cs.borderWidth, shadow: cs.boxShadow,
      afterContent: af.content, afterBorder: af.borderTopWidth };
  });
  t('сцена без border (иначе сдвинулась бы геометрия)', geom.border === '0px', `border ${geom.border}`);
  t('каймы вокруг ленты нет', parseFloat(geom.afterBorder || 0) === 0,
    `::after border ${geom.afterBorder}`);
  t('край держит тень', /rgb/.test(geom.shadow) && geom.shadow !== 'none',
    geom.shadow.slice(0, 60));

  // Главное: контур виден НА ВЫСОТЕ ЯЧЕЙКИ, а не только там, где под
  // ним пусто. Ячейки лежат в своём слое (z-index: 1) и раньше
  // закрывали outline собой — замер давал 1.00 против 3.76 по ритму.
  await p.evaluate(() => { document.querySelector('.timeline-viewport').scrollLeft = 900; });
  await new Promise((r) => setTimeout(r, 500));
  const buf2 = await p.screenshot();
  const png2 = PNG.sync.read(buf2);
  const at2 = (x, y) => { const i = (png2.width * y + x) << 2; return [png2.data[i], png2.data[i + 1], png2.data[i + 2]]; };
  const rows = await p.evaluate(() => {
    const st = document.querySelector('.timeline-stage').getBoundingClientRect();
    const rh = document.querySelector('#timelineRhythm').getBoundingClientRect();
    const cell = [...document.querySelectorAll('.tl-cell')]
      .find((c) => { const r = c.getBoundingClientRect(); return r.left <= st.left + 2 && r.right > st.left + 20; });
    return { l: Math.round(st.left),
      cellY: cell ? Math.round(cell.getBoundingClientRect().top + 30) : null,
      rhythmY: Math.round(rh.top + 30) };
  });
  if (rows.cellY) {
    const page = at2(rows.l - 8, rows.cellY);
    let best = 0;
    for (let d = 0; d <= 3; d++) { const c = cr(at2(rows.l + d, rows.cellY), page); if (c > best) best = c; }
    // Сама ячейка непрозрачна, поэтому на её высоте край читается
    // всегда — это страховка от того, что лента «растворится» в фоне.
    t('край ленты различим на высоте ЯЧЕЙКИ',
      best >= MIN, `контраст ${best.toFixed(2)} (порог ${MIN})`);
  }

  t('ошибок страницы нет', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё зелено');
  await br.close();
  process.exit(bad ? 1 : 0);
})();
