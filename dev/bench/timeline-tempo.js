// Играбельность ленты на быстрых песнях.
//
// Повод: на «Прасковье» (143 BPM) режим был неиграбельным — аккорды
// пролетали. Замер объяснил почему: масштаб был жёстким (96 px на долю),
// лента ехала 229 px/сек, в окно влезало 3.4 такта и 5.7 сек музыки, из
// них ВПЕРЁД всего 2.85 сек. Аккорд в три доли живёт 1.26 сек.
//
// Что проверяем:
//   - автомасштаб держит примерно постоянную СКОРОСТЬ на любом BPM;
//   - упреждения хватает, чтобы успеть прочитать следующий аккорд;
//   - ручной зум работает и удерживает место под меткой;
//   - движение ровное, без замираний на стыках ячеек.
const puppeteer = require('puppeteer'); const fs = require('fs');
(async () => {
  const song = JSON.parse(fs.readFileSync('/home/user/dev/fixtures/praskovya.json', 'utf8'));
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage(); await p.setViewport({ width: 1400, height: 900 });
  let bad = 0; const ok = (n, c, x) => { console.log(`   ${c ? 'ok  ' : 'FAIL'} ${n}${!c && x !== undefined ? ' — ' + x : ''}`); if (!c) bad++; };
  p.on('pageerror', e => { console.log('   ОШИБКА:', String(e).split('\n')[0]); bad++; });
  await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1100));
  await p.evaluate((s) => { localStorage.setItem('struchord_songs', JSON.stringify([s])); loadSong(0); }, song);
  await new Promise(r => setTimeout(r, 800));
  await p.evaluate(() => toggleTimelineMode(true));
  await new Promise(r => setTimeout(r, 700));

  console.log('=== 1. Скорость ленты почти не зависит от темпа ===');
  const rows = [];
  for (const bpm of [60, 90, 120, 143, 180, 240]) {
    rows.push(await p.evaluate(async (x) => {
      const inp = document.getElementById('bpmInput');
      inp.value = x; inp.dispatchEvent(new Event('change'));
      await new Promise(r => setTimeout(r, 250));
      const ppb = getTimelinePxPerBeat();
      const vp = document.getElementById('timelineViewport');
      const pxSec = ppb / (60 / x);
      return {
        bpm: x, ppb: +ppb.toFixed(1), pxSec: Math.round(pxSec),
        bars: +(vp.clientWidth / (ppb * 4)).toFixed(1),
        // Сколько секунд музыки видно ВПЕРЁД от метки.
        ahead: +((vp.clientWidth - getTimelineHeadOffset()) / pxSec).toFixed(1),
      };
    }, bpm));
  }
  rows.forEach(r => console.log(`      ${String(r.bpm).padStart(3)} BPM: ${String(r.ppb).padStart(5)} px/долю, ${String(r.pxSec).padStart(3)} px/сек, ${r.bars} тактов, вперёд ${r.ahead} сек`));
  const speeds = rows.map(r => r.pxSec);
  ok('скорость стабильна на всех темпах',
    Math.max(...speeds) - Math.min(...speeds) <= 15, `${Math.min(...speeds)}..${Math.max(...speeds)} px/сек`);
  ok('вперёд всегда видно минимум 4 секунды',
    rows.every(r => r.ahead >= 4), JSON.stringify(rows.map(r => r.ahead)));
  ok('в окно влезает минимум 2.5 такта',
    rows.every(r => r.bars >= 2.5), JSON.stringify(rows.map(r => r.bars)));
  // На быстрых темпах должно быть видно БОЛЬШЕ тактов, а не столько же.
  ok('чем быстрее темп, тем больше тактов в окне',
    rows[rows.length - 1].bars > rows[0].bars * 2, `${rows[0].bars} -> ${rows[rows.length - 1].bars}`);

  console.log('\n=== 2. Метка сдвинута влево, позади остаётся контекст ===');
  let r = await p.evaluate(() => {
    const vp = document.getElementById('timelineViewport');
    const ph = document.getElementById('timelinePlayhead');
    const off = ph.getBoundingClientRect().left - vp.getBoundingClientRect().left;
    return { off: Math.round(off), w: vp.clientWidth, frac: +(off / vp.clientWidth).toFixed(3) };
  });
  console.log(`      метка на ${r.off}px из ${r.w} (${Math.round(r.frac * 100)}%)`);
  ok('метка левее центра', r.frac < 0.45, String(r.frac));
  ok('позади остаётся место под контекст', r.frac > 0.2, String(r.frac));

  console.log('\n=== 3. Ручной зум ===');
  r = await p.evaluate(async () => {
    const inp = document.getElementById('bpmInput');
    inp.value = 143; inp.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 250));
    const base = getTimelinePxPerBeat();
    const label0 = document.getElementById('tlZoomValue').textContent;
    document.getElementById('tlZoomIn').click();
    await new Promise(r => setTimeout(r, 250));
    const up = getTimelinePxPerBeat();
    const label1 = document.getElementById('tlZoomValue').textContent;
    document.getElementById('tlZoomOut').click();
    document.getElementById('tlZoomOut').click();
    await new Promise(r => setTimeout(r, 250));
    const down = getTimelinePxPerBeat();
    document.getElementById('tlZoomValue').click();
    await new Promise(r => setTimeout(r, 250));
    return {
      base: +base.toFixed(1), up: +up.toFixed(1), down: +down.toFixed(1),
      label0, label1, reset: +getTimelinePxPerBeat().toFixed(1),
      labelReset: document.getElementById('tlZoomValue').textContent,
    };
  });
  console.log(`      ${r.base} -> «+» ${r.up} -> «−−» ${r.down} -> сброс ${r.reset}`);
  ok('«+» растягивает', r.up > r.base, `${r.base} -> ${r.up}`);
  ok('«−» сжимает', r.down < r.base, `${r.base} -> ${r.down}`);
  ok('клик по значению возвращает авто', Math.abs(r.reset - r.base) < 0.5, `${r.reset} vs ${r.base}`);
  ok('подпись показывает режим', r.label0 === 'авто' && r.label1 === '125%' && r.labelReset === 'авто',
    `${r.label0} / ${r.label1} / ${r.labelReset}`);

  console.log('\n=== 4. Зум удерживает место под меткой ===');
  r = await p.evaluate(async () => {
    const vp = document.getElementById('timelineViewport');
    vp.scrollLeft = Math.round((vp.scrollWidth - vp.clientWidth) * 0.45);
    await new Promise(r => setTimeout(r, 300));
    const key = () => {
      const a = document.querySelector('.tl-cell.tl-active');
      return a ? `${a.dataset.sec}:${a.dataset.square}:${a.dataset.ei}` : null;
    };
    const before = key();
    document.getElementById('tlZoomIn').click();
    await new Promise(r => setTimeout(r, 300));
    const afterIn = key();
    document.getElementById('tlZoomOut').click();
    document.getElementById('tlZoomOut').click();
    await new Promise(r => setTimeout(r, 300));
    const afterOut = key();
    document.getElementById('tlZoomValue').click();
    await new Promise(r => setTimeout(r, 200));

    // Теперь то же во время игры.
    playAll();
    await new Promise(r => setTimeout(r, 1500));
    const playBefore = key();
    document.getElementById('tlZoomIn').click();
    // Замеряем в ТОМ ЖЕ кадре, не выжидая: за 150 мс на 143 BPM аккорд
    // успевает смениться, и тогда мы сравниваем метку с уже следующей
    // ячейкой — прогон случайно проваливался примерно раз из трёх.
    await new Promise(r => requestAnimationFrame(r));
    const playAfter = key();
    const a = document.querySelector('.tl-cell.tl-active');
    const ph = document.getElementById('timelinePlayhead');
    let inside = false;
    if (a) {
      const ar = a.getBoundingClientRect(), pr = ph.getBoundingClientRect();
      const px = pr.left + pr.width / 2;
      inside = px >= ar.left - 6 && px <= ar.right + 6;
    }
    stopPlayback();
    document.getElementById('tlZoomValue').click();
    return { before, afterIn, afterOut, playBefore, playAfter, inside, hasActive: !!a };
  });
  console.log(`      пауза: ${r.before} -> ${r.afterIn} -> ${r.afterOut}; игра: ${r.playBefore} -> ${r.playAfter}`);
  ok('на паузе место сохраняется', r.before === r.afterIn && r.before === r.afterOut,
    `${r.before} / ${r.afterIn} / ${r.afterOut}`);
  // renderTimeline пересоздаёт ячейки: без восстановления ссылки
  // подсветка во время игры пропадала совсем.
  ok('во время игры подсветка не теряется', r.hasActive && r.playAfter !== null, String(r.playAfter));
  ok('метка остаётся внутри своей ячейки', r.inside);

  console.log('\n=== 5. Движение ровное, без замираний ===');
  r = await p.evaluate(async () => {
    const inp = document.getElementById('bpmInput');
    inp.value = 143; inp.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 250));
    // Предыдущий блок оставил ленту у конца песни, а она короткая
    // (13.4 сек). Упёршись в границу прокрутки, лента честно стоит —
    // и замер насчитывал 199 «замираний», которых на деле нет.
    // Начинаем с начала и меряем меньше длительности песни.
    stopAndRewind();
    await new Promise(r => setTimeout(r, 300));
    playAll();
    const vp = document.getElementById('timelineViewport');
    const stage = document.getElementById('timelineStage');
    const pos = [];
    let stop = false;
    const tick = () => {
      if (stop) return;
      // Эффективная позиция: scrollLeft умеет только целые пиксели,
      // дробный остаток добирается сдвигом содержимого.
      const sub = parseFloat(getComputedStyle(stage).getPropertyValue('--tl-subpx')) || 0;
      pos.push(vp.scrollLeft - sub);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    await new Promise(r => setTimeout(r, 8000));
    stop = true;
    const reachedEnd = vp.scrollLeft >= vp.scrollWidth - vp.clientWidth - 2;
    stopPlayback();
    const steps = [];
    for (let i = 1; i < pos.length; i++) steps.push(pos[i] - pos[i - 1]);
    // Песня короткая (13.4 сек): под конец лента упирается в границу
    // прокрутки и честно стоит. Эти кадры к плавности отношения не
    // имеют — отбрасываем хвост, где движения уже нет по факту.
    let last = steps.length;
    while (last > 0 && Math.abs(steps[last - 1]) < 0.01) last--;
    steps.length = last;
    const sorted = [...steps].sort((a, b) => a - b);
    const med = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
    const dev = steps.map(v => Math.abs(v - med)).sort((a, b) => a - b);
    return {
      frames: pos.length,
      medStep: +med.toFixed(2),
      /* eslint-disable-next-line */
      p95dev: +dev[Math.floor(dev.length * 0.95)].toFixed(2),
      frozen: steps.filter(v => Math.abs(v) < 0.01).length,
      back: steps.filter(v => v < -0.5).length,
      measured: steps.length,
      reachedEnd,
    };
  });
  console.log(`      кадров ${r.frames}, в движении ${r.measured}, шаг ${r.medStep}px, отклонение p95 ${r.p95dev}px, замираний ${r.frozen}`);
  ok('лента не откатывается', r.back === 0, String(r.back));
  // Планировщик сообщает о следующей ячейке за ~50мс до звука. Раньше
  // прогресс обрезался нулём и лента замирала на 10-13 кадрах из 360.
  ok('почти нет замерших кадров', r.frozen <= Math.max(5, r.measured * 0.05),
    `${r.frozen} из ${r.measured}`);
  ok('шаг ровный', r.medStep > 0 && r.p95dev <= r.medStep * 1.2,
    `откл. ${r.p95dev} при шаге ${r.medStep}`);

  console.log('\n=== 6. Субпиксельный доводчик ===');
  r = await p.evaluate(async () => {
    playAll();
    const stage = document.getElementById('timelineStage');
    const seen = new Set();
    const t0 = Date.now();
    while (Date.now() - t0 < 2500) {
      seen.add(getComputedStyle(stage).getPropertyValue('--tl-subpx').trim());
      await new Promise(r => setTimeout(r, 16));
    }
    stopPlayback();
    await new Promise(r => setTimeout(r, 200));
    const afterStop = getComputedStyle(stage).getPropertyValue('--tl-subpx').trim();
    // Сдвиг после остановки СОХРАНЯЕТСЯ намеренно: обнуление видно как
    // микрооткат назад (scrollLeft умеет только целые пиксели, перенести
    // в него дробный остаток нельзя). Обнуляет его renderTimeline.
    renderTimeline();
    await new Promise(r => setTimeout(r, 200));
    const afterRender = getComputedStyle(stage).getPropertyValue('--tl-subpx').trim();
    const values = [...seen].map(parseFloat).filter(v => !isNaN(v));
    const fractional = values.filter(v => Math.abs(v - Math.round(v)) > 0.01).length;
    return { unique: seen.size, fractional, afterStop, afterRender };
  });
  console.log(`      различных значений ${r.unique}, дробных ${r.fractional}, после пересборки «${r.afterRender}»`);
  ok('доводчик работает', r.unique > 10, String(r.unique));
  ok('значения дробные', r.fractional > 5, String(r.fractional));
  ok('пересборка ленты обнуляет сдвиг', parseFloat(r.afterRender || '0') === 0, r.afterRender);

  console.log(bad ? `\nПРОВАЛОВ: ${bad}` : '\nвсё зелено');
  await b.close(); process.exit(bad ? 1 : 0);
})();
