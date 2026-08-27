// Три правки по ритму и темпу:
//   1. «×N» в ячейке считает и повторы ЗА пределами массива steps —
//      рисунок короче ячейки зацикливается планировщиком;
//   2. деление ячейки режет её ритм пополам, а показ следует за длиной
//      ячейки при любом ресайзе;
//   3. BPM меняется колесом мыши и протяжкой вверх/вниз.
const puppeteer = require('/home/user/node_modules/puppeteer');

let bad = 0;
const ok = (n, c, x) => {
  console.log(`   ${c ? 'ok  ' : 'FAIL'} ${n}${!c && x !== undefined ? ' — ' + x : ''}`);
  if (!c) bad++;
};

(async () => {
  const b = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--allow-file-access-from-files'],
    protocolTimeout: 60000,
  });
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 900 });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  p.on('dialog', (d) => d.accept());
  await p.goto('file:///home/user/STRUCHORD.html', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await new Promise((r) => setTimeout(r, 1000));

  console.log('=== 1. Счётчик ×N при зацикленном рисунке ===');
  const counter = await p.evaluate(async () => {
    const cases = [
      { tag: 'развёрнуто 8 шагов = 2 цикла', span: 4, sub: 2, steps: ['D', null, 'U', null, 'D', null, 'U', null] },
      { tag: 'рисунок КОРОЧЕ ячейки вдвое', span: 4, sub: 2, steps: ['D', null, 'U', null] },
      // span 4 при sub 1 — это 4 шага, рисунок DU укладывается ДВАЖДЫ.
      { tag: 'sub=1: 4 шага / 2 = ×2', span: 4, sub: 1, steps: ['D', 'U'] },
      { tag: 'вчетверо короче (sub=2)', span: 4, sub: 2, steps: ['D', null] },
      { tag: 'длина совпадает с ячейкой', span: 2, sub: 2, steps: ['D', null, 'U', null] },
      { tag: 'внутренний повтор × внешний', span: 4, sub: 2, steps: ['D', 'U', 'D', 'U'] },
    ];
    const out = [];
    for (const c of cases) {
      sections = [{ id: 1, type: 'Verse', repeat: 1, squares: [{ id: 1, repeat: 1,
        events: [{ chord: 'Am', span: c.span, strumPattern: { mode: 'strum', subdivision: c.sub, steps: c.steps } }] }] }];
      nextId = 9;
      render();
      await new Promise((r) => setTimeout(r, 350));
      const box = document.querySelector('.event-strum-preview');
      const rep = box && box.querySelector('.strum-repeat-count');
      out.push({ tag: c.tag, shown: rep ? rep.textContent : null });
    }
    return out;
  });
  counter.forEach((c) => console.log(`      ${c.tag.padEnd(30)} ${c.shown || '—'}`));
  ok('развёрнутый повтор даёт ×2', counter[0].shown === '×2', String(counter[0].shown));
  ok('КОРОТКИЙ рисунок тоже даёт ×2', counter[1].shown === '×2', String(counter[1].shown));
  ok('sub=1: 4 шага / 2 = ×2', counter[2].shown === '×2', String(counter[2].shown));
  ok('вчетверо короче — ×4', counter[3].shown === '×4', String(counter[3].shown));
  ok('точное совпадение — без счётчика', counter[4].shown === null, String(counter[4].shown));
  ok('повторы перемножаются (×4)', counter[5].shown === '×4', String(counter[5].shown));

  console.log('=== 2. Показ следует за длиной ячейки ===');
  // Планировщик крутит i % totalSteps ровно stepsInEvent раз. Раньше
  // getSlicedPatternForEvent возвращал свой паттерн ячейки целиком, и
  // после ресайза показ врал: span 2 — звучало D_U_, рисовалось D_U_DUX_.
  const follow = await p.evaluate(() => {
    const out = [];
    for (const span of [4, 2, 1, 6, 3]) {
      sections = [{ id: 1, type: 'Verse', repeat: 1, squares: [{ id: 1, repeat: 1,
        events: [{ chord: 'Am', span, strumPattern: { mode: 'strum', subdivision: 2,
          steps: ['D', null, 'U', null, 'D', 'U', 'X', null] } }] }] }];
      nextId = 9;
      const sq = sections[0].squares[0];
      const ev = sq.events[0];
      const total = ev.strumPattern.steps.length;
      const need = Math.round(span * 2);
      const heard = [];
      for (let i = 0; i < need; i++) heard.push(ev.strumPattern.steps[i % total]);
      const shown = getSlicedPatternForEvent(sections[0], sq, ev, 0);
      const fmt = (a) => a.map((x) => (x === null ? '_' : x)).join('');
      out.push({ span, heard: fmt(heard), shown: shown ? fmt(shown.steps) : null });
    }
    return out;
  });
  follow.forEach((f) => console.log(`      span=${String(f.span).padEnd(2)} звук=${f.heard.padEnd(14)} показ=${f.shown}`));
  ok('показ совпадает со звуком на всех длинах',
    follow.every((f) => f.heard === f.shown),
    follow.filter((f) => f.heard !== f.shown).map((f) => `span ${f.span}`).join(', '));

  console.log('=== 3. Деление ячейки режет ритм ===');
  const split = await p.evaluate(async () => {
    const out = {};
    const mk = () => {
      sections = [{ id: 1, type: 'Verse', repeat: 1, squares: [{ id: 1, repeat: 1,
        events: [{ chord: 'Am', span: 4, strumPattern: { mode: 'strum', subdivision: 2,
          steps: ['D', null, 'U', null, 'D', 'U', 'X', null] } }] }] }];
      nextId = 9;
      render();
    };
    const dump = () => sections[0].squares[0].events.map((e, i) => {
      const s = getSlicedPatternForEvent(sections[0], sections[0].squares[0], e, i);
      return `${e.span}:${s ? s.steps.map((x) => (x === null ? '_' : x)).join('') : '—'}`;
    }).join('  ');

    mk();
    await new Promise((r) => setTimeout(r, 300));
    addChordAfter(1, 1, 0);
    await new Promise((r) => setTimeout(r, 250));
    out.once = dump();
    // Ресайз половинок: рисунок обязан следовать за новой длиной.
    sections[0].squares[0].events[0].span = 1;
    sections[0].squares[0].events[1].span = 3;
    render();
    await new Promise((r) => setTimeout(r, 250));
    out.resized = dump();

    // Двойное деление — суммарное число шагов не меняется.
    mk();
    await new Promise((r) => setTimeout(r, 300));
    addChordAfter(1, 1, 0);
    await new Promise((r) => setTimeout(r, 150));
    addChordAfter(1, 1, 0);
    await new Promise((r) => setTimeout(r, 200));
    out.twice = dump();
    out.total = sections[0].squares[0].events.reduce((s, e, i) => {
      const x = getSlicedPatternForEvent(sections[0], sections[0].squares[0], e, i);
      return s + (x ? x.steps.length : 0);
    }, 0);

    // Нечётное число шагов пополам не делится — рисунок остаётся целым.
    sections = [{ id: 1, type: 'Verse', repeat: 1, squares: [{ id: 1, repeat: 1,
      events: [{ chord: 'Am', span: 1, strumPattern: { mode: 'strum', subdivision: 1, steps: ['D'] } }] }] }];
    nextId = 9;
    render();
    await new Promise((r) => setTimeout(r, 200));
    addChordAfter(1, 1, 0);
    await new Promise((r) => setTimeout(r, 200));
    out.odd = sections[0].squares[0].events.map((e) =>
      `${e.span}:${e.strumPattern ? e.strumPattern.steps.join('') : 'нет'}`).join('  ');

    // Перебор: шаг — массив струн, резаться должен так же.
    sections = [{ id: 1, type: 'Verse', repeat: 1, squares: [{ id: 1, repeat: 1,
      events: [{ chord: 'Am', span: 4, strumPattern: { mode: 'pick', subdivision: 2,
        steps: [['B'], [3], [2], [3], ['B'], [3], [2], [3]] } }] }] }];
    nextId = 9;
    render();
    await new Promise((r) => setTimeout(r, 200));
    addChordAfter(1, 1, 0);
    await new Promise((r) => setTimeout(r, 200));
    out.pick = sections[0].squares[0].events.map((e) => e.strumPattern ? e.strumPattern.steps.length : 0);
    return out;
  });
  console.log('      после деления:', split.once);
  console.log('      после ресайза:', split.resized);
  console.log('      двойное:      ', split.twice);
  ok('ритм разрезан между половинами', split.once === '2:D_U_  2:DUX_', split.once);
  ok('после ресайза показ следует за длиной', split.resized === '1:D_  3:DUX_DU', split.resized);
  ok('двойное деление не теряет шаги', split.total === 8, String(split.total));
  ok('нечётный шаг не дробится', /0\.5:D\s+0\.5:нет/.test(split.odd), split.odd);
  ok('перебор режется пополам', split.pick.join(',') === '4,4', split.pick.join(','));

  console.log('=== 3б. «×N» на плашке ритма в тултипе ===');
  // Счётчик прятался тем же правилом, что и бейдж режима:
  //   .tooltip-strum-slot .strum-mode-badge,
  //   .tooltip-strum-slot .strum-repeat-count { display: none }
  // Бейдж там действительно лишний, а счётчик — нет.
  const tip = await p.evaluate(async () => {
    sections = [{ id: 1, type: 'Verse', repeat: 1, squares: [{ id: 1, repeat: 1,
      events: [{ chord: 'Am', span: 4, strumPattern: { mode: 'strum', subdivision: 2,
        steps: ['D', null, 'U', null] } }] }] }];
    nextId = 9;
    render();
    await new Promise((r) => setTimeout(r, 300));
    // Плашка ритма в тултипе появляется только во время игры.
    playAll();
    await new Promise((r) => setTimeout(r, 1400));
    const t = document.getElementById('fingering-tooltip');
    const slot = t && t.querySelector('.tooltip-strum-slot');
    const rep = slot && slot.querySelector('.strum-repeat-count');
    const badge = slot && slot.querySelector('.strum-mode-badge');
    const out = {
      slot: !!slot,
      rep: rep ? rep.textContent : null,
      repShown: rep ? getComputedStyle(rep).display !== 'none' : false,
      badgeHidden: badge ? getComputedStyle(badge).display === 'none' : true,
    };
    if (slot && rep) {
      const sr = slot.getBoundingClientRect();
      const rr = rep.getBoundingClientRect();
      const pv = slot.querySelector('.strum-preview').getBoundingClientRect();
      out.fits = rr.right <= sr.right + 0.5 && rr.left >= sr.left - 0.5;
      out.rowFits = pv.right <= sr.right + 0.5 && pv.left >= sr.left - 0.5;
    }
    playAll();
    await new Promise((r) => setTimeout(r, 200));
    return out;
  });
  ok('плашка ритма в тултипе есть', tip.slot, String(tip.slot));
  ok('счётчик показывает ×2', tip.rep === '×2', String(tip.rep));
  ok('и он не скрыт стилями', tip.repShown, String(tip.repShown));
  ok('бейдж режима по-прежнему скрыт', tip.badgeHidden, String(tip.badgeHidden));
  ok('счётчик влезает в плашку', tip.fits !== false, String(tip.fits));
  ok('ряд шагов не вылез', tip.rowFits !== false, String(tip.rowFits));

  console.log('=== 4. BPM колесом и протяжкой ===');
  const box = await p.evaluate(() => {
    const e = document.getElementById('bpmInput');
    const r = e.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, cursor: getComputedStyle(e).cursor,
      min: e.min, max: e.max };
  });
  const val = () => p.evaluate(() => +document.getElementById('bpmInput').value);
  ok('курсор обещает вертикальное движение', box.cursor === 'ns-resize', box.cursor);
  ok('min/max поля совпадают с CONFIG', box.min === '40' && box.max === '300', `${box.min}..${box.max}`);

  await p.evaluate(() => { document.getElementById('bpmInput').value = 120; });
  await p.mouse.move(box.x, box.y, { steps: 4 });
  for (let i = 0; i < 5; i++) { await p.mouse.wheel({ deltaY: -100 }); await new Promise((r) => setTimeout(r, 40)); }
  await new Promise((r) => setTimeout(r, 400));
  ok('колесо вверх: 120 -> 125', (await val()) === 125, String(await val()));

  for (let i = 0; i < 3; i++) { await p.mouse.wheel({ deltaY: 100 }); await new Promise((r) => setTimeout(r, 40)); }
  await new Promise((r) => setTimeout(r, 400));
  ok('колесо вниз: 125 -> 122', (await val()) === 122, String(await val()));

  await p.keyboard.down('Shift');
  for (let i = 0; i < 4; i++) { await p.mouse.wheel({ deltaY: -100 }); await new Promise((r) => setTimeout(r, 40)); }
  await p.keyboard.up('Shift');
  await new Promise((r) => setTimeout(r, 400));
  ok('Shift даёт шаг 5: 122 -> 142', (await val()) === 142, String(await val()));

  await p.mouse.move(box.x, box.y);
  await p.mouse.down();
  for (let i = 1; i <= 10; i++) { await p.mouse.move(box.x, box.y - i * 6, { steps: 1 }); await new Promise((r) => setTimeout(r, 20)); }
  const spinning = await p.evaluate(() => document.getElementById('bpmInput').classList.contains('is-spinning'));
  await p.mouse.up();
  await new Promise((r) => setTimeout(r, 400));
  ok('протяжка 60px = +10', (await val()) === 152, String(await val()));
  ok('во время протяжки поле подсвечено', spinning, String(spinning));
  ok('подсветка снята после отпускания',
    !(await p.evaluate(() => document.getElementById('bpmInput').classList.contains('is-spinning'))));

  await p.evaluate(() => { document.getElementById('bpmInput').value = 298; });
  await p.mouse.move(box.x, box.y, { steps: 2 });
  for (let i = 0; i < 8; i++) { await p.mouse.wheel({ deltaY: -100 }); await new Promise((r) => setTimeout(r, 25)); }
  await new Promise((r) => setTimeout(r, 400));
  ok('упор в максимум 300', (await val()) === 300, String(await val()));

  await p.evaluate(() => { document.getElementById('bpmInput').value = 42; });
  for (let i = 0; i < 8; i++) { await p.mouse.wheel({ deltaY: 100 }); await new Promise((r) => setTimeout(r, 25)); }
  await new Promise((r) => setTimeout(r, 400));
  ok('упор в минимум 40', (await val()) === 40, String(await val()));

  ok('страница под курсором не прокрутилась', (await p.evaluate(() => window.scrollY)) === 0);

  // Ввод с клавиатуры не должен пострадать от pointerdown-обработчика.
  await p.mouse.click(box.x, box.y);
  await p.keyboard.down('Control');
  await p.keyboard.press('KeyA');
  await p.keyboard.up('Control');
  await p.keyboard.type('96');
  await p.keyboard.press('Enter');
  await new Promise((r) => setTimeout(r, 400));
  ok('ввод с клавиатуры работает', (await val()) === 96, String(await val()));

  ok('ошибок на странице нет', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(bad ? `\nПРОВАЛОВ: ${bad}` : '\nвсе проверки пройдены');
  process.exit(bad ? 1 : 0);
})();
