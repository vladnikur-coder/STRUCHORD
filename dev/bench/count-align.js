// Совпадает ли ЦЕНТР подписи счёта с узлом сетки (тем же, где засечка).
const puppeteer = require('/home/user/node_modules/puppeteer');
(async () => {
  const br = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const p = await br.newPage();
  await p.setViewport({ width: 1400, height: 950 });
  p.setDefaultTimeout(90000);
  await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await new Promise((r) => setTimeout(r, 1100));
  await p.evaluate(() => {
    sections = [{ id: 1, type: 'Verse', repeat: 1, squares: [{ id: 1, repeat: 1,
      events: [{ chord: 'Am', span: 4 }, { chord: 'C', span: 4 },
        { chord: 'F', span: 4 }, { chord: 'G', span: 4 }] }] }];
    nextId = 9; render();
  });
  await new Promise((r) => setTimeout(r, 400));
  for (const z of [1, 1.6, 3]) {
    await p.evaluate((zz) => { setSquareZoom(zz); applySquareZoom(true); }, z);
    await new Promise((r) => setTimeout(r, 500));
    const res = await p.evaluate(() => {
      const out = [];
      const inner = document.querySelector('.square-inner');
      [...inner.querySelectorAll('.chord-wrapper')].slice(0, 2).forEach((cw, ci) => {
        const cwr = cw.getBoundingClientRect();
        // B-04: DOM-слоёв засечек больше нет — узлы сетки просим у самой
        // геометрии: buildInnerTicks отдаёт тот же градиент с точками,
        // что рисовал слой (span 4 доли, offset 4 на ячейку).
        const st = (typeof buildInnerTicks === 'function')
          ? buildInnerTicks(4, ci * 4, '--color-tick-substep', 4, 16) : '';
        const items = [...cw.querySelectorAll('.chord-count')].map((c) => {
          const r = c.getBoundingClientRect();
          return { t: c.textContent, c: +(r.left + r.width / 2 - cwr.left).toFixed(2),
            l: +(r.left - cwr.left).toFixed(2), edge: c.classList.contains('is-edge') };
        });
        out.push({ ci, w: +cwr.width.toFixed(2), items, hasTicks: !!st });
      });
      return out;
    });
    console.log(`\n=== zoom ${z} ===`);
    res.forEach((o) => {
      const centers = o.items.map((i) => i.c);
      const diffs = centers.slice(1).map((v, i) => +(v - centers[i]).toFixed(2));
      console.log(` ячейка#${o.ci} w=${o.w}`);
      console.log('   центры:', o.items.map((i) => `${i.t}${i.edge ? '*' : ''}@${i.c}`).join(' '));
      console.log('   шаги  :', diffs.join(' '));
    });
  }
  // B-21 уточнение (2026-08-26): «1 не будет жирнее чем остальные цифры,
  // только больше» — замеряем факт: размер больше, вес и цвет те же.
  await p.evaluate(() => { setSquareZoom(1); applySquareZoom(true); });
  await new Promise((r) => setTimeout(r, 400));
  const style = await p.evaluate(() => {
    const cs = (el) => { const c = getComputedStyle(el);
      return { size: c.fontSize, weight: c.fontWeight, color: c.color }; };
    const one = document.querySelector('.chord-count.is-downbeat');
    const two = [...document.querySelectorAll('.chord-count.is-beat')]
      .find((e) => e.textContent === '2');
    if (!one || !two) return null;
    return { one: cs(one), two: cs(two) };
  });
  console.log('\n=== B-21 уточнение: «1» vs «2» ===');
  if (!style) { console.log(' FAIL  цифры не найдены'); }
  else {
    console.log(`   «1»: ${style.one.size} / w${style.one.weight} / ${style.one.color}`);
    console.log(`   «2»: ${style.two.size} / w${style.two.weight} / ${style.two.color}`);
    const okSize = parseFloat(style.one.size) > parseFloat(style.two.size);
    const okWeight = style.one.weight === style.two.weight;
    const okColor = style.one.color === style.two.color;
    console.log(` ${okSize ? 'PASS' : 'FAIL'}  крупнее: ${okSize}`);
    console.log(` ${okWeight ? 'PASS' : 'FAIL'}  вес тот же: ${okWeight}`);
    console.log(` ${okColor ? 'PASS' : 'FAIL'}  цвет тот же: ${okColor}`);
  }
  await br.close();
})();
