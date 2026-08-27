// Смена размера между РОДСТВЕННЫМИ размерами (8/8 <-> 4/4).
//
// Три дефекта, которые здесь закрыты:
//   1) длительности округлялись до целых — восьмые схлопывались в
//      четверти (span 1 -> 1 вместо 0.5), и сетку приходилось править
//      руками через зум;
//   2) render() пересоздаёт ряды, и прокрутка сбрасывалась в начало —
//      после каждого ресайза на зуме квадрат отматывался;
//   3) рисунок боя оставался размеченным по старому такту и уезжал по
//      фазе (16 шагов на такте, где нужно 8).
const puppeteer = require('/home/user/node_modules/puppeteer');
let bad = 0;
const t = (n, c, x = '') => { if (c) console.log('   ok  ', n, x); else { bad++; console.log('  FAIL ', n, x); } };
(async () => {
  const br = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
  });
  const p = await br.newPage();
  await p.setViewport({ width: 1500, height: 950 });
  p.setDefaultTimeout(90000);
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).split('\n')[0]));
  await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await new Promise((r) => setTimeout(r, 1100));

  console.log('=== 1. Длительности переносятся ТОЧНО (8/8 -> 4/4) ===');
  const mig = await p.evaluate(() =>
    [8, 4, 2, 1, 0.5, 0.25].map((span) => ({
      was: span,
      now: migrateEventsForTimeSig([{ chord: 'Am', span, timeSig: null }], '8/8', '4/4')[0].span,
      ideal: span / 2,
    })));
  mig.forEach((r) => console.log(`      ${String(r.was).padStart(5)} -> ${String(r.now).padStart(6)} (ожидаем ${r.ideal})`));
  t('все длительности пересчитаны без искажения',
    mig.every((r) => Math.abs(r.now - r.ideal) < 1e-9),
    JSON.stringify(mig.filter((r) => Math.abs(r.now - r.ideal) >= 1e-9)));

  console.log('\n=== 2. Музыка не меняется: сумма долей и порядок аккордов ===');
  const sq = await p.evaluate(() => {
    const square = { id: 1, repeat: 1, customBeats: 8,
      events: [{ chord: 'Am', span: 1 }, { chord: 'C', span: 1 },
        { chord: 'F', span: 2 }, { chord: 'G', span: 4 }] };
    const beforeSum = square.events.reduce((s, e) => s + e.span, 0);
    const beforeChords = square.events.map((e) => e.chord).join(',');
    migrateSquareForTimeSig(square, '8/8', '4/4');
    return {
      beforeSum, beforeChords,
      afterSum: square.events.reduce((s, e) => s + e.span, 0),
      afterChords: square.events.map((e) => e.chord).join(','),
      spans: square.events.map((e) => e.span),
      customBeats: square.customBeats,
    };
  });
  console.log(`      8/8: сумма ${sq.beforeSum} восьмых -> 4/4: сумма ${sq.afterSum} четвертей`);
  console.log(`      spans: ${JSON.stringify(sq.spans)}, customBeats ${sq.customBeats}`);
  t('длительность такта сохранилась', Math.abs(sq.afterSum - sq.beforeSum / 2) < 1e-9,
    `${sq.afterSum} против ${sq.beforeSum / 2}`);
  t('аккорды на месте и в том же порядке', sq.afterChords === sq.beforeChords, sq.afterChords);
  t('customBeats не разошёлся с содержимым', Math.abs(sq.customBeats - sq.afterSum) < 1e-9,
    `${sq.customBeats} против ${sq.afterSum}`);

  console.log('\n=== 3. Обратный переход 4/4 -> 8/8 возвращает исходное ===');
  const back = await p.evaluate(() => {
    const square = { id: 1, repeat: 1, customBeats: 8,
      events: [{ chord: 'Am', span: 1 }, { chord: 'C', span: 1 },
        { chord: 'F', span: 2 }, { chord: 'G', span: 4 }] };
    const orig = square.events.map((e) => e.span).join(',');
    migrateSquareForTimeSig(square, '8/8', '4/4');
    migrateSquareForTimeSig(square, '4/4', '8/8');
    return { orig, now: square.events.map((e) => e.span).join(',') };
  });
  console.log(`      было [${back.orig}] -> туда-обратно [${back.now}]`);
  t('переход туда-обратно не портит рисунок', back.orig === back.now, back.now);

  console.log('\n=== 4. Рисунок боя подстраивается под новый такт ===');
  const pat = await p.evaluate(() => {
    sections = [{ id: 1, type: 'Verse', repeat: 1, timeSig: '8/8',
      strumPattern: { mode: 'strum', subdivision: 2,
        steps: ['D', null, 'D', 'U', null, 'U', 'D', 'U', 'D', null, 'D', 'U', null, 'U', 'D', 'U'] },
      squares: [{ id: 1, repeat: 1, events: [{ chord: 'Am', span: 8 }] }] }];
    nextId = 9;
    const beforeSteps = sections[0].strumPattern.steps.join('|');
    setSectionTimeSig(1, '4/4');
    const pt = sections[0].strumPattern;
    return {
      beforeSteps,
      afterSteps: pt.steps.join('|'),
      sub: pt.subdivision,
      len: pt.steps.length,
      needed: getGridUnitsPerBar('4/4') * pt.subdivision,
    };
  });
  console.log(`      дробление стало ${pat.sub}, шагов ${pat.len}, нужно на такт ${pat.needed}`);
  t('рисунок укладывается в такт', pat.len === pat.needed, `${pat.len} против ${pat.needed}`);
  t('сами удары не изменились', pat.afterSteps === pat.beforeSteps);

  console.log('\n=== 5. Свой бой ячейки не теряется ===');
  const evPat = await p.evaluate(() => {
    const square = { id: 1, repeat: 1,
      events: [{ chord: 'Am', span: 4,
        strumPattern: { mode: 'strum', subdivision: 2, steps: ['D', null, 'U', 'D', null, 'U', 'D', null] } },
      { chord: 'C', span: 4 }] };
    migrateSquareForTimeSig(square, '8/8', '4/4');
    const ev = square.events[0];
    return { has: !!ev.strumPattern, sub: ev.strumPattern && ev.strumPattern.subdivision,
      len: ev.strumPattern && ev.strumPattern.steps.length };
  });
  t('рисунок ячейки пережил смену размера', evPat.has, JSON.stringify(evPat));

  console.log('\n=== 6. Прокрутка не сбрасывается при перерисовке ===');
  const scroll = await p.evaluate(async () => {
    sections = [{ id: 1, type: 'Verse', repeat: 1, squares: [{ id: 1, repeat: 1,
      events: [{ chord: 'Am', span: 4 }, { chord: 'C', span: 4 },
        { chord: 'F', span: 4 }, { chord: 'G', span: 4 }] }] }];
    nextId = 9; render();
    await new Promise((r) => setTimeout(r, 350));
    setSquareZoom(3); applySquareZoom(true);
    await new Promise((r) => setTimeout(r, 350));
    const vp = document.querySelector('.squares-viewport');
    vp.scrollLeft = 600;
    await new Promise((r) => setTimeout(r, 200));
    const before = vp.scrollLeft;
    render();
    await new Promise((r) => setTimeout(r, 400));
    return { before, after: document.querySelector('.squares-viewport').scrollLeft };
  });
  console.log(`      до ${scroll.before} -> после ${scroll.after}`);
  t('позиция прокрутки сохранена', Math.abs(scroll.after - scroll.before) < 4,
    `${scroll.before} -> ${scroll.after}`);

  console.log('\n=== 7. Прокрутка держится и при смене размера ===');
  const scroll2 = await p.evaluate(async () => {
    sections = [{ id: 1, type: 'Verse', repeat: 1, timeSig: '8/8',
      squares: [{ id: 1, repeat: 1, events: [{ chord: 'Am', span: 8 }, { chord: 'C', span: 8 }] }] }];
    nextId = 9; render();
    await new Promise((r) => setTimeout(r, 350));
    setSquareZoom(3); applySquareZoom(true);
    await new Promise((r) => setTimeout(r, 350));
    const vp = document.querySelector('.squares-viewport');
    const list = vp.querySelector('.squares-list');
    vp.scrollLeft = 500;
    const fracBefore = vp.scrollLeft / list.getBoundingClientRect().width;
    setSectionTimeSig(1, '4/4');
    await new Promise((r) => setTimeout(r, 500));
    const vp2 = document.querySelector('.squares-viewport');
    const list2 = vp2.querySelector('.squares-list');
    return { fracBefore: +fracBefore.toFixed(3),
      fracAfter: +(vp2.scrollLeft / list2.getBoundingClientRect().width).toFixed(3) };
  });
  console.log(`      доля содержимого: ${scroll2.fracBefore} -> ${scroll2.fracAfter}`);
  t('смотрим на то же место песни', Math.abs(scroll2.fracAfter - scroll2.fracBefore) < 0.02,
    `${scroll2.fracBefore} -> ${scroll2.fracAfter}`);

  console.log('\n=== 8. Звук после смены размера идёт ===');
  const play = await p.evaluate(async () => {
    sections = [{ id: 1, type: 'Verse', repeat: 1, timeSig: '8/8',
      strumPattern: { mode: 'strum', subdivision: 2,
        steps: ['D', null, 'D', 'U', null, 'U', 'D', 'U', 'D', null, 'D', 'U', null, 'U', 'D', 'U'] },
      squares: [{ id: 1, repeat: 1, events: [{ chord: 'Am', span: 4 }, { chord: 'C', span: 4 }] }] }];
    nextId = 9; render();
    await new Promise((r) => setTimeout(r, 300));
    setSectionTimeSig(1, '4/4');
    await new Promise((r) => setTimeout(r, 400));
    playAll();
    await new Promise((r) => setTimeout(r, 1200));
    const ok = playbackState.isPlaying;
    stopPlayback();
    return ok;
  });
  t('воспроизведение работает после миграции', play);

  console.log('\n=== 9. Неродственный переход (4/4 -> 3/4) не тронут ===');
  const odd = await p.evaluate(() => {
    const res = migrateEventsForTimeSig(
      [{ chord: 'Am', span: 4 }, { chord: 'C', span: 4 }], '4/4', '3/4');
    return res.map((e) => e.span);
  });
  console.log(`      spans: ${JSON.stringify(odd)}`);
  t('там по-прежнему целые доли', odd.every((v) => Number.isInteger(v)), JSON.stringify(odd));

  t('ошибок страницы нет', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё зелено');
  await br.close();
  process.exit(bad ? 1 : 0);
})();
