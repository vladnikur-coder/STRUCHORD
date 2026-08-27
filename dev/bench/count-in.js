// Отсчёт перед стартом воспроизведения.
//
// Один такт щелчков метронома перед первой нотой, чтобы поймать темп.
// Отключается галкой в меню «Тык», выбор запоминается.
const puppeteer = require('/home/user/node_modules/puppeteer');
const fs = require('fs');
let bad = 0;
const t = (n, c, x = '') => { if (c) console.log('   ok  ', n, x); else { bad++; console.log('  FAIL ', n, x); } };
(async () => {
  const song = JSON.parse(fs.readFileSync('/home/user/dev/fixtures/wind-of-change.json', 'utf8'));
  const br = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
  });
  const p = await br.newPage();
  await p.setViewport({ width: 1400, height: 950 });
  p.setDefaultTimeout(90000);
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).split('\n')[0]));
  await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await new Promise((r) => setTimeout(r, 1100));
  await p.evaluate((s) => {
    localStorage.setItem('struchord_songs', JSON.stringify([s]));
    loadSong(0); render();
  }, song);
  await new Promise((r) => setTimeout(r, 700));

  console.log('=== 1. Настройка ===');
  // Отсчёт переехал из галочки в панели «Тык» в кнопку «321» рядом с
  // метрономом: это такое же включаемое состояние, и место ему в одном
  // ряду с play, циклом и метрономом.
  const ui = await p.evaluate(() => {
    const btn = document.getElementById('btnCountIn');
    const bar = btn ? btn.closest('.transport-bar') : null;
    return { exists: !!btn,
      inBar: !!bar,
      on: btn ? btn.classList.contains('is-on') : null,
      glyph: btn ? btn.textContent.trim() : null,
      aria: btn ? btn.getAttribute('aria-pressed') : null,
      oldBox: !!document.getElementById('countInEnabled'),
      overlay: !!document.getElementById('countInOverlay') };
  });
  t('кнопка есть в панели транспорта', ui.exists && ui.inBar);
  t('подписана цифрами 321', ui.glyph === '321', ui.glyph);
  t('по умолчанию выключена', ui.on === false && ui.aria === 'false');
  t('старой галки в «Тык» больше нет', ui.oldBox === false);
  t('элемент под цифру есть', ui.overlay);

  console.log('\n=== 2. Выключен — старт без задержки ===');
  const off = await p.evaluate(async () => {
    const ctx = getAudioContext();
    const t0 = ctx.currentTime;
    playAll();
    const lead = playbackStartTime - t0;
    const st = { lead: +lead.toFixed(3), playing: playbackState.isPlaying };
    stopPlayback();
    return st;
  });
  console.log(`      запас до первой ноты ${off.lead} с`);
  t('старт почти сразу (без отсчёта)', off.lead < 0.3, `${off.lead} с`);

  console.log('\n=== 3. Включаем кнопкой ===');
  const on = await p.evaluate(() => {
    const btn = document.getElementById('btnCountIn');
    btn.click();
    return { enabled: countInEnabled, saved: localStorage.getItem('struchord-count-in'),
      lit: btn.classList.contains('is-on'), aria: btn.getAttribute('aria-pressed') };
  });
  t('состояние взведено', on.enabled === true);
  t('кнопка подсвечена', on.lit === true && on.aria === 'true');
  t('выбор сохранён', on.saved === '1', on.saved);

  console.log('\n=== 4. Включён — старт сдвинут на такт ===');
  const res = await p.evaluate(async () => {
    const ctx = getAudioContext();
    const t0 = ctx.currentTime;
    playAll();
    const lead = playbackStartTime - t0;
    return { lead: +lead.toFixed(3), bpm: getEffectiveBpm(sections[0]),
      ts: sections[0].timeSig || globalTimeSig, playing: playbackState.isPlaying };
  });
  const [num, den] = res.ts.split('/').map(Number);
  const expect = num * (60 / res.bpm) * (4 / den);
  console.log(`      размер ${res.ts}, темп ${res.bpm} -> ожидаем ~${expect.toFixed(2)} с, получили ${res.lead} с`);
  t('первая нота отодвинута на длительность такта',
    Math.abs(res.lead - expect) < 0.25, `${res.lead} против ${expect.toFixed(2)}`);
  t('воспроизведение запущено', res.playing);

  console.log('\n=== 5. Цифра показывается ===');
  await new Promise((r) => setTimeout(r, 400));
  const vis = await p.evaluate(() => {
    const el = document.getElementById('countInOverlay');
    return { text: el.textContent, visible: el.classList.contains('is-visible'),
      opacity: getComputedStyle(el).opacity, pe: getComputedStyle(el).pointerEvents };
  });
  console.log(`      на экране «${vis.text}», видима: ${vis.visible}`);
  t('цифра отсчёта видна', vis.visible && /^[1-9]$/.test(vis.text), `«${vis.text}»`);
  t('цифра не перехватывает нажатия', vis.pe === 'none', vis.pe);

  console.log('\n=== 6. Остановка гасит отсчёт ===');
  const stopped = await p.evaluate(async () => {
    stopPlayback();
    await new Promise((r) => setTimeout(r, 100));
    const el = document.getElementById('countInOverlay');
    return { visible: el.classList.contains('is-visible'), playing: playbackState.isPlaying };
  });
  t('цифра убрана после остановки', !stopped.visible);
  t('воспроизведение остановлено', !stopped.playing);
  // Цифры не должны всплыть позже, уже после стопа.
  await new Promise((r) => setTimeout(r, 1500));
  const late = await p.evaluate(() =>
    document.getElementById('countInOverlay').classList.contains('is-visible'));
  t('цифры не всплывают после остановки', !late);

  console.log('\n=== 7. Отсчёт звучит при выключенном метрономе ===');
  const muted = await p.evaluate(async () => {
    metronomeMuted = true;
    const before = metronomeMuted;
    const ctx = getAudioContext();
    playAll();
    const after = metronomeMuted;
    const lead = playbackStartTime - ctx.currentTime;
    stopPlayback();
    metronomeMuted = false;
    return { before, after, lead: +lead.toFixed(2) };
  });
  t('мьют метронома восстановлен после отсчёта', muted.before === true && muted.after === true);
  t('отсчёт всё равно сдвигает старт', muted.lead > 0.5, `${muted.lead} с`);

  console.log('\n=== 7б. Клик по аккорду во время отсчёта ===');
  // Его жалоба: «когда я нажимаю на какой-то аккорд во время отсчёта,
  // после его окончания воспроизводится первый аккорд, а только потом
  // тот, который я нажал». Правило: пока идёт отсчёт, очередь пуста
  // (ничего не запланировано), а клик успевает переуказать индексы —
  // после окончания отсчёта первым звучит НАЖАТЫЙ аккорд.
  const seek = await p.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const cells = Array.from(document.querySelectorAll('.chord-wrapper')).filter((el) => {
      const i = el.querySelector('.chord-input');
      return i && i.value.trim();
    });
    if (cells.length < 2) return { error: 'мало ячеек с аккордами: ' + cells.length };
    // Нажимаем НЕ первую ячейку песни.
    const target = cells[Math.min(2, cells.length - 1)];
    const ctx = getAudioContext();
    playAll();
    const startAt = playbackStartTime;
    await sleep(300);
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await sleep(150);
    // Пока отсчёт идёт и песня не запланирована, активной ячейки нет.
    const early = document.querySelector('.chord-wrapper.playback-active');
    let firstHit = null;
    while (ctx.currentTime < startAt + 0.3) {
      const a = document.querySelector('.chord-wrapper.playback-active');
      if (a) {
        firstHit = { sec: a.dataset.sec, sq: a.dataset.square, ei: a.dataset.ei,
          lead: +(startAt - ctx.currentTime).toFixed(2) };
        break;
      }
      await sleep(40);
    }
    const want = { sec: target.dataset.sec, sq: target.dataset.square, ei: target.dataset.ei };
    const notFirst = want.sec !== cells[0].dataset.sec || want.sq !== cells[0].dataset.square || want.ei !== cells[0].dataset.ei;
    stopPlayback();
    return { early: early ? { ei: early.dataset.ei, sq: early.dataset.square } : null,
      firstHit, want, notFirst, cells: cells.length };
  });
  if (seek.error) {
    t('есть хотя бы 2 ячейки с аккордами', false, seek.error);
  } else {
    t('нажатая ячейка — не первая в песне', seek.notFirst, 'ячеек всего ' + seek.cells);
    t('во время отсчёта ничего не запланировано', seek.early === null,
      seek.early ? JSON.stringify(seek.early) : 'очередь пуста до конца отсчёта');
    t('первой после отсчёта звучит нажатая ячейка',
      !!seek.firstHit && seek.firstHit.sec === seek.want.sec && seek.firstHit.sq === seek.want.sq && seek.firstHit.ei === seek.want.ei,
      JSON.stringify(seek.firstHit) + ' против ' + JSON.stringify(seek.want));
  }

  console.log('\n=== 8. Настройка переживает перезагрузку ===');
  // НОВАЯ ВКЛАДКА вместо reload/goto: после проигрывания отсчёта на
  // странице живут AudioContext и таймеры, и навигация ждёт их до
  // таймаута (проверено: и reload, и goto висят по 60-90 с).
  // Вкладка того же браузера делит localStorage, а грузится начисто —
  // это ровно то, что проверяем.
  const p2 = await br.newPage();
  await p2.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1200));
  const after = await p2.evaluate(() => {
    const btn = document.getElementById('btnCountIn');
    return { lit: btn.classList.contains('is-on'), state: countInEnabled,
      aria: btn.getAttribute('aria-pressed') };
  });
  t('состояние восстановлено из памяти',
    after.lit === true && after.state === true && after.aria === 'true');

  // Включённая кнопка не должна сливаться с залитой ▶ по соседству.
  // В тёмной теме --color-ink равен --color-brand, и заливка ink
  // делала их неотличимыми (замер: у обеих rgb(204,124,94)).
  console.log('\n=== 9. Подсветка различима в обеих темах ===');
  for (const dark of [false, true]) {
    const c = await p2.evaluate((toDark) => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      if (toDark !== isDark) toggleTheme();
      const btn = document.getElementById('btnCountIn');
      const play = document.getElementById('btnPlay');
      const cb = getComputedStyle(btn);
      return { theme: toDark ? 'тёмная' : 'светлая',
        same: cb.backgroundColor === getComputedStyle(play).backgroundColor,
        border: cb.borderColor, color: cb.color };
    }, dark);
    console.log(`      ${c.theme}: рамка ${c.border}, цифры ${c.color}`);
    t(`${c.theme}: не сливается с ▶`, c.same === false || c.border !== 'rgba(0, 0, 0, 0)');
  }

  t('ошибок страницы нет', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё зелено');
  await br.close();
  process.exit(bad ? 1 : 0);
})();
