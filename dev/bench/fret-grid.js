// Все точки аппликатуры должны лежать ВНУТРИ сетки грифа.
//
// Дефект (нашёл пользователь по пустому месту под грифом): правило
// «minFret <= 2 -> рисуем от порожка» применялось без оглядки на верхнюю
// ноту, а в сетке всего 5 ладов. У формы вроде C7 x,3,2,0,5,6 нижний лад
// 2, верхний 6 — точка шестого лада уезжала НИЖЕ последней линии и
// висела в пустоте под грифом. Замер до правки: 1011 форм из 35127.
const puppeteer = require('/home/user/node_modules/puppeteer');
let bad = 0;
const t = (n, c, x = '') => { if (c) console.log('   ok  ', n, x); else { bad++; console.log('  FAIL ', n, x); } };

(async () => {
  const br = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const p = await br.newPage();
  p.setDefaultTimeout(60000);
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).split('\n')[0]));
  await p.setViewport({ width: 1400, height: 950 });
  await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1200));

  console.log('=== 1. Полный обход таблиц ===');
  const all = await p.evaluate(() => {
    const roots = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
    const types = ['', 'm', '7', 'm7', 'maj7', 'sus2', 'sus4', 'dim', 'aug', '6', 'm6', '9', 'add9', '7sus4', 'm9'];
    const box = document.createElement('div');
    box.style.cssText = 'position:absolute;left:-9999px';
    document.body.appendChild(box);
    let total = 0;
    const outside = [], noNut = [];
    for (const r of roots) for (const ty of types) {
      const res = window.getFingeringVariants ? window.getFingeringVariants(r + ty, 'C') : null;
      if (!res || !res.shapes) continue;
      res.shapes.forEach((shape) => {
        total++;
        box.innerHTML = renderFingeringSVG(shape);
        const svg = box.querySelector('svg');
        const lines = [...svg.querySelectorAll('line')];
        const fretYs = lines
          .filter((l) => l.getAttribute('x1') !== l.getAttribute('x2'))
          .map((l) => +l.getAttribute('y1'));
        const topY = Math.min(...fretYs), botY = Math.max(...fretYs);
        const dots = [...svg.querySelectorAll('circle')].filter((c) => +c.getAttribute('r') === 6);
        dots.forEach((c) => {
          const cy = +c.getAttribute('cy');
          if (cy < topY - 1 || cy > botY + 1) {
            outside.push({ chord: r + ty, shape: shape.join(','), cy, topY, botY });
          }
        });
        // Если сетка НЕ от порожка, обязана быть подпись лада — иначе
        // непонятно, где играть.
        const nut = lines.some((l) => (l.getAttribute('stroke-width') || '') === '3');
        const label = svg.querySelector('text');
        const hasFrLabel = label && /fr/.test(label.textContent || '');
        const pressed = shape.filter((v) => v !== 'x' && v !== 0).length;
        if (!nut && !hasFrLabel && pressed > 0) {
          noNut.push({ chord: r + ty, shape: shape.join(',') });
        }
      });
    }
    box.remove();
    return { total, outside: outside.length, outEx: outside.slice(0, 4),
      noNut: noNut.length, noNutEx: noNut.slice(0, 4) };
  });
  console.log(`      проверено форм: ${all.total}`);
  t('ни одна точка не вылезла за сетку', all.outside === 0,
    `${all.outside} шт: ${JSON.stringify(all.outEx)}`);
  t('сетка без порожка всегда подписана ладом', all.noNut === 0,
    `${all.noNut} шт: ${JSON.stringify(all.noNutEx)}`);

  console.log('\n=== 2. Известные проблемные формы ===');
  const cases = await p.evaluate(() => {
    const box = document.createElement('div');
    box.style.cssText = 'position:absolute;left:-9999px';
    document.body.appendChild(box);
    const out = {};
    const probe = (name, shape) => {
      box.innerHTML = renderFingeringSVG(shape);
      const svg = box.querySelector('svg');
      const lines = [...svg.querySelectorAll('line')];
      const fretYs = lines.filter((l) => l.getAttribute('x1') !== l.getAttribute('x2'))
        .map((l) => +l.getAttribute('y1'));
      const dots = [...svg.querySelectorAll('circle')].filter((c) => +c.getAttribute('r') === 6)
        .map((c) => +c.getAttribute('cy'));
      const label = svg.querySelector('text');
      out[name] = { top: Math.min(...fretYs), bot: Math.max(...fretYs),
        lowestDot: dots.length ? Math.max(...dots) : null,
        label: label ? label.textContent : null,
        inside: dots.every((y) => y >= Math.min(...fretYs) - 1 && y <= Math.max(...fretYs) + 1) };
    };
    probe('C7 x,3,2,0,5,6', ['x', 3, 2, 0, 5, 6]);
    probe('C#m x,4,6,6,2,0', ['x', 4, 6, 6, 2, 0]);
    probe('Am x,0,2,2,1,0', ['x', 0, 2, 2, 1, 0]);
    probe('F барре 1,3,3,2,1,1', [1, 3, 3, 2, 1, 1]);
    box.remove();
    return out;
  });
  Object.entries(cases).forEach(([name, c]) => {
    console.log(`      ${name.padEnd(18)} сетка ${c.top}..${c.bot}, нижняя точка ${c.lowestDot}, подпись ${c.label || '—'}`);
    t(`${name}: точки внутри`, c.inside);
  });

  console.log('\n=== 3. Открытые аккорды по-прежнему от порожка ===');
  const open = await p.evaluate(() => {
    const box = document.createElement('div');
    box.style.cssText = 'position:absolute;left:-9999px';
    document.body.appendChild(box);
    const res = {};
    for (const [name, sh] of [['Am', ['x', 0, 2, 2, 1, 0]], ['C', ['x', 3, 2, 0, 1, 0]],
      ['G', [3, 2, 0, 0, 0, 3]], ['E', [0, 2, 2, 1, 0, 0]]]) {
      box.innerHTML = renderFingeringSVG(sh);
      const svg = box.querySelector('svg');
      res[name] = {
        nut: [...svg.querySelectorAll('line')].some((l) => l.getAttribute('stroke-width') === '3'),
        label: (svg.querySelector('text') || {}).textContent || null,
      };
    }
    box.remove();
    return res;
  });
  Object.entries(open).forEach(([name, o]) => {
    t(`${name}: порожек нарисован`, o.nut, `подпись ${o.label || '—'}`);
  });

  console.log('\n=== 4. Редактор аппликатур согласован с превью ===');
  // У createInteractiveFretboard СВОЯ копия логики выбора начального
  // лада. Пока правили только renderFingeringSVG, они разошлись: на
  // F#madd9 = 2,4,6,2,x,x превью сдвигало сетку и показывало 4 точки, а
  // редактор оставался от порожка и рисовал 3 — нота шестого лада не
  // попадала в сетку. Пользователь увидел это как «в редакторе
  // открывается обрезанная версия».
  const sync = await p.evaluate(() => {
    const roots = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
    const types = ['', 'm', '7', 'm7', 'maj7', 'sus2', 'sus4', 'add9', 'm9', '9'];
    const box = document.createElement('div');
    box.style.cssText = 'position:absolute;left:-9999px';
    document.body.appendChild(box);
    let total = 0;
    const mismatch = [], lost = [];
    for (const r of roots) for (const ty of types) {
      const res = window.getFingeringVariants ? window.getFingeringVariants(r + ty, 'C') : null;
      if (!res || !res.shapes) continue;
      // Первые пять вариантов каждого аккорда — их реально открывают.
      res.shapes.slice(0, 5).forEach((shape) => {
        total++;
        const need = shape.filter((v) => v !== 'x' && v !== 0).length;
        box.innerHTML = renderFingeringSVG(shape);
        const pv = [...box.querySelectorAll('circle')].filter((c) => +c.getAttribute('r') === 6).length;
        box.innerHTML = '';
        const fb = createInteractiveFretboard(shape, () => {});
        box.appendChild(fb.container);
        const ed = [...fb.container.querySelectorAll('circle')].filter((c) => +c.getAttribute('r') >= 5).length;
        box.innerHTML = '';
        if (ed !== need) lost.push({ chord: r + ty, shape: shape.join(','), need, ed });
        else if (pv !== ed) mismatch.push({ chord: r + ty, shape: shape.join(','), pv, ed });
      });
    }
    box.remove();
    return { total, lost: lost.length, lostEx: lost.slice(0, 4),
      mismatch: mismatch.length, mmEx: mismatch.slice(0, 4) };
  });
  console.log(`      проверено форм: ${sync.total}`);
  t('редактор рисует ВСЕ ноты формы', sync.lost === 0,
    `${sync.lost} шт: ${JSON.stringify(sync.lostEx)}`);
  t('редактор и превью показывают одинаково', sync.mismatch === 0,
    `${sync.mismatch} шт: ${JSON.stringify(sync.mmEx)}`);

  console.log('\n=== 5. Формы из Every Breath You Take ===');
  const song = await p.evaluate(() => {
    const box = document.createElement('div');
    box.style.cssText = 'position:absolute;left:-9999px';
    document.body.appendChild(box);
    const out = [];
    // Реальные формы из песни пользователя.
    for (const [name, f] of [['Aadd9', '5,7,9,6,x,x'], ['F#madd9', '2,4,6,2,x,x'],
      ['Dsus2', 'x,5,7,9,x,x'], ['D5', 'x,5,7,7,x,x'],
      ['Esus2', 'x,7,9,11,x,x'], ['E5', 'x,7,9,9,x,x']]) {
      const shape = f.split(',').map((v) => (v === 'x' ? 'x' : Number(v)));
      const need = shape.filter((v) => v !== 'x' && v !== 0).length;
      box.innerHTML = '';
      const fb = createInteractiveFretboard(shape, () => {});
      box.appendChild(fb.container);
      const ed = [...fb.container.querySelectorAll('circle')].filter((c) => +c.getAttribute('r') >= 5).length;
      box.innerHTML = '';
      out.push({ name, f, need, ed });
    }
    box.remove();
    return out;
  });
  song.forEach((o) => {
    t(`${o.name} ${o.f}: все ${o.need} нот в редакторе`, o.ed === o.need, `нарисовано ${o.ed}`);
  });

  t('ошибок страницы нет', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё зелено');
  await br.close();
  process.exit(bad ? 1 : 0);
})();
