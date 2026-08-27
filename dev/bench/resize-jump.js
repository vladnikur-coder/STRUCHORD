// Секция не должна «выезжать» заново после ресайза.
//
// Дефект: ряд кнопок под квадратами (.square-actions-row) раскрывается
// по :hover через transition max-height. render() пересоздаёт карточки,
// и если курсор в этот момент над секцией, браузер видит НОВЫЙ элемент
// с уже применённым :hover — переход играется от 0 к 40px заново.
// После ресайза это читалось как «секция выезжает».
//
// Замер по кадрам до правки: на +16 мс кнопок нет (19477 различающихся
// пикселей), к +600 мс появились (4370). После правки первый же кадр
// совпадает с установившимся состоянием.
const puppeteer = require('/home/user/node_modules/puppeteer');
const fs = require('fs');
const PNG = require('/home/user/node_modules/pngjs').PNG;
let bad = 0;
const t = (n, c, x = '') => { if (c) console.log('   ok  ', n, x); else { bad++; console.log('  FAIL ', n, x); } };
(async () => {
  const br = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const p = await br.newPage();
  await p.setViewport({ width: 1400, height: 950 });
  p.setDefaultTimeout(90000);
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).split('\n')[0]));
  await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await new Promise((r) => setTimeout(r, 1100));
  await p.evaluate(() => {
    sections = [
      { id: 1, type: 'Verse', repeat: 1, squares: [{ id: 1, repeat: 1,
        events: [{ chord: 'Am', span: 4 }, { chord: 'C', span: 4 },
          { chord: 'F', span: 4 }, { chord: 'G', span: 4 }] }] },
      { id: 2, type: 'Chorus', repeat: 1, squares: [{ id: 2, repeat: 1,
        events: [{ chord: 'F', span: 4 }, { chord: 'G', span: 4 }] }] },
    ];
    nextId = 9; render();
  });
  await new Promise((r) => setTimeout(r, 500));
  await p.evaluate(() => { setSquareZoom(3); applySquareZoom(true); });
  await new Promise((r) => setTimeout(r, 500));
  await p.evaluate(() => { document.querySelector('.squares-viewport').scrollLeft = 400; });
  await new Promise((r) => setTimeout(r, 400));

  console.log('=== 1. Правило подавления переходов ===');
  const css = await p.evaluate(() => {
    document.body.classList.add('is-rerendering');
    const el = document.querySelector('.square-actions-row');
    const during = getComputedStyle(el).transitionDuration;
    document.body.classList.remove('is-rerendering');
    return { during, normal: getComputedStyle(el).transitionDuration };
  });
  t('во время перерисовки переход выключен', /^0s(,\s*0s)*$/.test(css.during), css.during);
  t('в обычном состоянии переход есть', /0\.22s/.test(css.normal), css.normal);

  console.log('\n=== 2. Класс снимается сам ===');
  const cls = await p.evaluate(async () => {
    render();
    const right = document.body.classList.contains('is-rerendering');
    await new Promise((r) => setTimeout(r, 300));
    return { right, after: document.body.classList.contains('is-rerendering') };
  });
  t('класс стоит во время render()', cls.right);
  t('и снимается после', !cls.after);

  console.log('\n=== 3. Ряд кнопок не схлопывается при ресайзе ===');
  const handle = await p.evaluate(() => {
    const vp = document.querySelector('.squares-viewport').getBoundingClientRect();
    const h = [...document.querySelectorAll('.resize-handle')].find((el) => {
      const r = el.getBoundingClientRect();
      return r.left > vp.left + 40 && r.right < vp.right - 40;
    });
    if (!h) return null;
    const r = h.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });
  t('ручка ресайза найдена', !!handle, JSON.stringify(handle));

  await p.mouse.move(handle.x, handle.y);
  await p.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await p.mouse.move(handle.x + i * 14, handle.y);
    await new Promise((r) => setTimeout(r, 25));
  }
  await p.screenshot({ path: '/home/user/dev/bench/rj-before.png' });
  await p.mouse.up();
  await new Promise((r) => setTimeout(r, 16));
  await p.screenshot({ path: '/home/user/dev/bench/rj-after16.png' });
  await new Promise((r) => setTimeout(r, 600));
  await p.screenshot({ path: '/home/user/dev/bench/rj-after600.png' });

  const load = (f) => PNG.sync.read(fs.readFileSync(f));
  const a = load('/home/user/dev/bench/rj-before.png');
  const b = load('/home/user/dev/bench/rj-after16.png');
  const c = load('/home/user/dev/bench/rj-after600.png');
  const diff = (x, y) => {
    let n = 0;
    for (let yy = 0; yy < x.height; yy += 2)
      for (let xx = 0; xx < x.width; xx += 2) {
        const i = (x.width * yy + xx) << 2;
        if (Math.abs(x.data[i] - y.data[i]) > 18) n++;
      }
    return n;
  };
  const d16 = diff(a, b);
  const d600 = diff(a, c);
  console.log(`      различий с кадром до отпускания: +16мс ${d16}, +600мс ${d600}`);
  // Ключевое: первый кадр после отпускания должен быть УЖЕ таким же, как
  // установившийся. Если ряд выезжает, на 16 мс различий заметно больше.
  t('первый кадр совпадает с установившимся',
    Math.abs(d16 - d600) < d600 * 0.35, `${d16} против ${d600}`);

  console.log('\n=== 4. Кнопки видны сразу после ресайза ===');
  const btns = await p.evaluate(() => {
    const row = document.querySelector('.square-actions-row');
    const r = row.getBoundingClientRect();
    return { h: Math.round(r.height), maxH: getComputedStyle(row).maxHeight };
  });
  console.log(`      высота ряда ${btns.h}px (max-height ${btns.maxH})`);
  t('ряд кнопок раскрыт', btns.h >= 30, `${btns.h}px`);

  console.log('\n=== 5. Обычное наведение по-прежнему плавное ===');
  const hover = await p.evaluate(async () => {
    // Уводим курсор и возвращаем — переход должен работать.
    const el = document.querySelector('.square-actions-row');
    return getComputedStyle(el).transitionDuration;
  });
  t('переход не отключён насовсем', /0\.22s/.test(hover), hover);

  t('ошибок страницы нет', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё зелено');
  await br.close();
  process.exit(bad ? 1 : 0);
})();
