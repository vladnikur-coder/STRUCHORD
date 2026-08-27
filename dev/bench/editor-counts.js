// Счёт долей в ГЛАВНОМ редакторе (сетка квадратов с аккордами).
//
// Раньше под ячейками были только чёрточки-засечки: видно узлы сетки,
// но не видно, какая это доля. Теперь под ними счёт «1 та и та», как на
// дорожке ритма в ленте.
const puppeteer = require('/home/user/node_modules/puppeteer');
let bad = 0;
const t = (n, c, x = '') => { if (c) console.log('   ok  ', n, x); else { bad++; console.log('  FAIL ', n, x); } };
(async () => {
  const br = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const p = await br.newPage();
  await p.setViewport({ width: 1500, height: 950 });
  p.setDefaultTimeout(90000);
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).split('\n')[0]));
  await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await new Promise((r) => setTimeout(r, 1100));

  const build = async (events, zoom) => {
    await p.evaluate((ev, z) => {
      sections = [{ id: 1, type: 'Verse', repeat: 1, squares: [{ id: 1, repeat: 1, events: ev }] }];
      nextId = 9; setSquareZoom(z || 1); applySquareZoom(true); requestRender();
    }, events, zoom);
    await new Promise((r) => setTimeout(r, 600));
    return p.evaluate(() => {
      const cells = [...document.querySelectorAll('.chord-wrapper')];
      return cells.map((c) => ({
        chord: (c.querySelector('.chord-input') || {}).value,
        counts: [...c.querySelectorAll('.chord-count')].map((e) => e.textContent),
        width: Math.round(c.getBoundingClientRect().width),
      }));
    });
  };

  console.log('=== 1. Целые доли: под ячейкой её номера ===');
  let r = await build([{ chord: 'Am', span: 4 }, { chord: 'C', span: 4 },
    { chord: 'F', span: 4 }, { chord: 'G', span: 4 }]);
  console.log(`      ${r.map((c) => c.chord + ':[' + c.counts.join(' ') + ']').join('  ')}`);
  t('счёт появился в редакторе', r.some((c) => c.counts.length > 0),
    JSON.stringify(r.map((c) => c.counts.length)));
  t('первая ячейка считается с «1»', r[0].counts[0] === '1', JSON.stringify(r[0].counts));
  t('в ячейке на 4 доли — четыре номера', r[0].counts.length === 4, JSON.stringify(r[0].counts));
  t('вторая ячейка продолжает счёт с «1»', r[1].counts[0] === '1', JSON.stringify(r[1].counts));

  console.log('\n=== 2. При зуме появляются дробления ===');
  // getResizeStep: >=1.4 -> восьмые, >=2.4 -> шестнадцатые
  r = await build([{ chord: 'Am', span: 4 }, { chord: 'C', span: 4 },
    { chord: 'F', span: 4 }, { chord: 'G', span: 4 }], 1.6);
  const flat8 = r[0].counts.join(' ');
  console.log(`      зум 160%: ${flat8}`);
  t('на восьмых появилось «и»', /и/.test(flat8), flat8);
  t('счёт читается «1 и 2 и»', /^1 и 2 и/.test(flat8), flat8);

  r = await build([{ chord: 'Am', span: 4 }, { chord: 'C', span: 4 },
    { chord: 'F', span: 4 }, { chord: 'G', span: 4 }], 2.6);
  const flat16 = r[0].counts.join(' ');
  console.log(`      зум 260%: ${flat16}`);
  t('на шестнадцатых счёт «1 та и та»', /^1 та и та 2 та и та/.test(flat16), flat16);

  console.log('\n=== 2б. Счёт следует за зумом БЕЗ перерисовки ===');
  // Дробность подписей задаёт getResizeStep, который меняется при зуме.
  // Раньше подписи строились только в render(), и при зуме «та и та»
  // не появлялось, пока пользователь не тронет что-то ещё.
  const live = await p.evaluate(async () => {
    const read = () => [...document.querySelector('.chord-wrapper')
      .querySelectorAll('.chord-count')].map((e) => e.textContent).join(' ');
    const out = {};
    for (const z of [1, 1.6, 2.6, 1]) {
      setSquareZoom(z); applySquareZoom(true);
      await new Promise((r) => setTimeout(r, 350));
      out[Math.round(z * 100)] = read();
    }
    return out;
  });
  console.log(`      100%: ${live[100]}`);
  console.log(`      160%: ${live[160]}`);
  console.log(`      260%: ${live[260]}`);
  t('при зуме дробления появляются сразу', /и/.test(live[160]), live[160]);
  t('на 260% счёт «1 та и та»', /^1 та и та/.test(live[260]), live[260]);
  t('возврат к 100% убирает дробления', live[100] === '1 2 3 4', live[100]);

  console.log('\n=== 3. Совпадает с лентой ===');
  const same = await p.evaluate(() => [1, 2, 3].map((s) => countLabelFor(0, s, 4, 4)));
  t('слова берутся из countLabelFor', same.join(',') === 'та,и,та', JSON.stringify(same));

  console.log('\n=== 4. Подписи стоят на узлах сетки ===');
  r = await build([{ chord: 'Am', span: 4 }, { chord: 'C', span: 4 },
    { chord: 'F', span: 4 }, { chord: 'G', span: 4 }]);
  const geo = await p.evaluate(() => {
    const cell = document.querySelector('.chord-wrapper');
    const cr = cell.getBoundingClientRect();
    const ticks = cell.querySelector('.chord-ticks').getBoundingClientRect();
    return [...cell.querySelectorAll('.chord-count')].map((e) => {
      const r = e.getBoundingClientRect();
      return { rel: +((r.left + r.width / 2 - cr.left) / cr.width).toFixed(3), text: e.textContent };
    });
  });
  console.log(`      доли на позициях: ${geo.map((g) => g.text + '@' + (g.rel * 100).toFixed(0) + '%').join(' ')}`);
  const expect = [0, 0.25, 0.5, 0.75];
  const okPos = geo.every((g, i) => Math.abs(g.rel - expect[i]) < 0.04);
  t('доли равномерно по ячейке (0/25/50/75%)', okPos,
    JSON.stringify(geo.map((g) => g.rel)));

  console.log('\n=== 5. Затакт: счёт не врёт ===');
  // Дробная доля не должна подписываться номером — цифра встала бы не
  // на своё место в такте.
  r = await build([{ chord: 'Am', span: 0.5 }, { chord: 'C', span: 3.5 },
    { chord: 'F', span: 4 }, { chord: 'G', span: 8 }]);
  console.log(`      затакт: ${r.map((c) => '[' + c.counts.join(' ') + ']').join(' ')}`);
  t('в затакте нет ложных номеров', !r[0].counts.includes('2'), JSON.stringify(r[0].counts));

  console.log('\n=== 6. Не ломает существующую разметку ===');
  const intact = await p.evaluate(() => ({
    ticks: document.querySelectorAll('.chord-ticks').length,
    steps: document.querySelectorAll('.chord-ticks-step').length,
    cells: document.querySelectorAll('.chord-wrapper').length,
    names: [...document.querySelectorAll('.chord-display-inner')].map((e) => e.textContent).filter(Boolean).length,
  }));
  console.log(`      ячеек ${intact.cells}, засечек ${intact.ticks}, имён ${intact.names}`);
  t('засечки на месте', intact.ticks === intact.cells);
  t('подсечки шага на месте', intact.steps === intact.cells);
  t('имена аккордов на месте', intact.names === intact.cells);

  t('ошибок страницы нет', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё зелено');
  await br.close();
  process.exit(bad ? 1 : 0);
})();
