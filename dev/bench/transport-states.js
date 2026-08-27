// Круглые кнопки транспорта: включённое состояние показывается ЦВЕТОМ,
// одинаково у всех переключателей.
//
// Было три разных вида в одном ряду: цикл не красился вовсе (правило
// потерялось из-за оборванного селектора), отсчёт получал обводку,
// метроном — заливку --color-ink. Плюс ▶ был залит всегда, даже в
// покое, и цвет переставал значить «работает».
const puppeteer = require('puppeteer');

let bad = 0;
const ok = (n, c, x) => { console.log(`   ${c ? 'ok  ' : 'FAIL'} ${n}${!c && x !== undefined ? ' — ' + x : ''}`); if (!c) bad++; };

(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 900 });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 1000));
  const bg = (id) => p.evaluate((i) => getComputedStyle(document.getElementById(i)).backgroundColor, id);

  for (const dark of [false, true]) {
    const theme = dark ? 'тёмная' : 'светлая';
    if (dark) { await p.evaluate(() => toggleTheme()); await new Promise(r => setTimeout(r, 400)); }

    console.log(`\n=== ${theme} тема ===`);
    const restPlay = await bg('btnPlay');
    const restLoop = await bg('btnLoop');

    // Включаем РЕАЛЬНЫМИ действиями, а не подстановкой классов.
    await p.evaluate(() => toggleLoop());
    await p.evaluate(() => { if (!countInEnabled) document.getElementById('btnCountIn').click(); });
    await new Promise(r => setTimeout(r, 350));
    const onLoop = await bg('btnLoop');
    const onCount = await bg('btnCountIn');

    console.log(`      покой play=${restPlay}  включено loop=${onLoop} 321=${onCount}`);
    ok(`${theme}: цикл при включении красится`, onLoop !== restLoop, `${restLoop} -> ${onLoop}`);
    ok(`${theme}: цикл и отсчёт одного цвета`, onLoop === onCount, `${onLoop} vs ${onCount}`);
    ok(`${theme}: ▶ в покое не залит`, restPlay !== onLoop, restPlay);

    await p.evaluate(() => toggleLoop());
    await p.evaluate(() => { if (countInEnabled) document.getElementById('btnCountIn').click(); });
    await new Promise(r => setTimeout(r, 250));
  }

  // Вернуть светлую тему для остальных проверок.
  await p.evaluate(() => toggleTheme());
  await new Promise(r => setTimeout(r, 300));

  console.log('\n=== ▶ красится только в работе ===');
  await p.evaluate(() => {
    sections = [{ id: 1, type: 'Verse', repeat: 1, squares: [{ id: 1, repeat: 1,
      events: [{ chord: 'Am', span: 4 }, { chord: 'C', span: 4 }] }] }];
    nextId = 9; render();
  });
  await new Promise(r => setTimeout(r, 400));
  const idle = await bg('btnPlay');
  await p.evaluate(() => playAll());
  await new Promise(r => setTimeout(r, 900));
  const playing = await bg('btnPlay');
  const icon = await p.evaluate(() => document.querySelector('#btnPlay i').className);
  await p.evaluate(() => { if (playbackState.isPlaying) playAll(); });
  await new Promise(r => setTimeout(r, 600));
  const stopped = await bg('btnPlay');
  console.log(`      покой ${idle} -> играет ${playing} -> стоп ${stopped}`);
  ok('в работе заливается', playing !== idle);
  ok('после остановки возвращается', stopped === idle);
  ok('значок сменился на стоп', /player-stop/.test(icon), icon);
  console.log('\n=== Подсветка берёт цвет ▶ и зависит от схемы и темы ===');
  // Включённый режим и работающее воспроизведение — одна мысль «сейчас
  // действует», цвет у них общий (--color-brand).
  //
  // Раньше стоял --color-accent-warm: замер по 6 схемам x 2 темы дал
  // всего 9 разных значений на 12 сочетаний (в дефолтной схеме #ffb03b
  // и в светлой теме, и в тёмной) — подсветка не менялась вместе с
  // темой. У brand все 12 значений разные.
  const matrix = await p.evaluate(async () => {
    const wait = (ms) => new Promise((x) => setTimeout(x, ms));
    const out = [];
    for (const id of ['', 'forest', 'plum', 'sunset', 'dawn', 'raspberry']) {
      applyScheme(id);
      for (const dark of [false, true]) {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        if (dark !== isDark) toggleTheme();
        await wait(200);
        if (!playbackState.isLooping) toggleLoop();
        if (!countInEnabled) document.getElementById('btnCountIn').click();
        if (playbackState.metronomeMuted) document.getElementById('btnMetronome').click();
        if (!playbackState.isPlaying) playAll();
        // Переходы 0.15s — ждём с запасом, иначе меряется цвет на
        // полпути и значения расходятся на пару единиц.
        await wait(700);
        const g = (i) => getComputedStyle(document.getElementById(i)).backgroundColor;
        const row = { scheme: id || 'дефолт', theme: dark ? 'тёмная' : 'светлая',
          play: g('btnPlay'), loop: g('btnLoop'), count: g('btnCountIn'), metro: g('btnMetronome') };
        if (playbackState.isPlaying) playAll();
        if (playbackState.isLooping) toggleLoop();
        if (countInEnabled) document.getElementById('btnCountIn').click();
        if (!playbackState.metronomeMuted) document.getElementById('btnMetronome').click();
        await wait(250);
        out.push(row);
      }
    }
    return out;
  });
  matrix.forEach((m) => console.log(
    `      ${m.scheme.padEnd(10)} ${m.theme.padEnd(8)} ${m.play}`));
  const sameAsPlay = matrix.every((m) =>
    m.loop === m.play && m.count === m.play && m.metro === m.play);
  const distinct = new Set(matrix.map((m) => m.loop)).size;
  ok('все режимы берут цвет ▶', sameAsPlay,
    matrix.filter((m) => m.loop !== m.play).map((m) => m.scheme + '/' + m.theme).join(', '));
  ok('цвет свой в каждой схеме и теме', distinct === matrix.length,
    `${distinct} разных из ${matrix.length}`);

  console.log('\n=== Плашка строя после BPM ===');
  // Строй дублируется в панели рядом с темпом: на уроке это такой же
  // параметр песни, и ради него не хочется открывать тюнер.
  const pill = await p.evaluate(() => {
    const el = document.getElementById('tuningPill');
    if (!el) return null;
    const ts = document.getElementById('globalTimeSig').getBoundingClientRect();
    const row = document.querySelector('.meta-row');
    const r = el.getBoundingClientRect();
    // Ноты у нестандартного строя — они там главное.
    tunerTuningId = 'drop-c';
    renderTuningPill();
    const dropText = el.textContent.trim().replace(/\s+/g, ' ');
    tunerTuningId = 'e-std';
    renderTuningPill();
    return {
      text: el.textContent.trim().replace(/\s+/g, ' '),
      dropText,
      inMetaRow: !!el.closest('.meta-row'),
      inTransport: !!el.closest('.transport-bar'),
      afterTimeSig: r.left > ts.right,
      rowHeight: Math.round(row.getBoundingClientRect().height),
      labels: [...row.querySelectorAll('.meta-label')].map((x) => x.textContent.trim()),
    };
  });
  console.log('   ', JSON.stringify(pill));
  // Строй — свойство песни, ему место рядом с тональностью и размером,
  // а не в строке управления воспроизведением.
  ok('плашка в панели с тональностью', pill.inMetaRow === true && pill.inTransport === false);
  ok('стоит после размера', pill.afterTimeSig === true);
  // Подписи укорочены: «(глобальная)» и «(глобальный)» убраны.
  ok('подписи без скобок', pill.labels.join('|') === 'Тональность|Размер|Строй',
    pill.labels.join('|'));
  // Панель обязана остаться в одну строку: ширина контейнера 860px, и
  // с полными нотами у E Standard она переполнялась (851 из 796).
  ok('панель в одну строку', pill.rowHeight <= 70, `${pill.rowHeight}px`);
  ok('у стандартного строя только название', pill.text === 'E Standard', pill.text);
  ok('у нестандартного видны ноты', /Drop C\s+C G C F A D/.test(pill.dropText), pill.dropText);

  // Клик открывает ВЫБОР СТРОЯ, а не тюнер: микрофон трогать незачем.
  const picker = await p.evaluate(async () => {
    document.getElementById('tuningPill').click();
    await new Promise((x) => setTimeout(x, 300));
    const list = document.getElementById('tuningPickerList');
    const lr = list.getBoundingClientRect();
    const pr = document.getElementById('tuningPill').getBoundingClientRect();
    return {
      opened: !list.hidden,
      tunerOpened: !!document.querySelector('.tuner-modal'),
      micOn: tunerState !== null,
      items: list.querySelectorAll('.tuner-tuning-item').length,
      groups: list.querySelectorAll('.tuner-tuning-group').length,
      current: list.querySelectorAll('.is-current').length,
      floats: getComputedStyle(list).position === 'absolute',
      // Список шире плашки втрое и раскрывается ВЛЕВО: равняем по
      // правому краю, иначе он уехал бы за экран.
      underPill: Math.abs(lr.right - pr.right) < 4 || Math.abs(lr.left - pr.left) < 4,
      fits: lr.right <= innerWidth + 0.5 && lr.left >= -0.5,
    };
  });
  console.log('   ', JSON.stringify(picker));
  ok('клик открывает список строёв', picker.opened === true);
  ok('тюнер при этом НЕ открывается', picker.tunerOpened === false);
  ok('микрофон не включается', picker.micOn === false);
  ok('строи с группами на месте', picker.items >= 20 && picker.groups >= 4,
    `${picker.items} строёв, ${picker.groups} групп`);
  ok('текущий помечен', picker.current === 1, String(picker.current));
  // Список ВЫПАДАЮЩИЙ: в потоке он раздвинул бы строку транспорта.
  ok('список выпадает поверх', picker.floats === true);
  ok('выровнен по плашке', picker.underPill === true);
  ok('влезает в окно', picker.fits === true);

  // Выбор меняет плашку и синхронизируется с тюнером.
  const sync = await p.evaluate(async () => {
    [...document.querySelectorAll('#tuningPickerList .tuner-tuning-item')]
      .find((x) => /Drop D/.test(x.textContent)).click();
    await new Promise((x) => setTimeout(x, 200));
    const pillText = document.getElementById('tuningPill').textContent.trim().replace(/\s+/g, ' ');
    const closed = document.getElementById('tuningPickerList').hidden;
    openTuner();
    await new Promise((x) => setTimeout(x, 400));
    const inTuner = document.getElementById('tunerTuningName').textContent;
    const notes = [...document.querySelectorAll('.tuner-string-label')].map((x) => x.textContent).join('');
    // Правка стрелками в тюнере обязана отразиться на плашке.
    document.querySelectorAll('.tuner-string-cell')[0]
      .querySelectorAll('.tuner-string-arrow')[1].click();
    await new Promise((x) => setTimeout(x, 200));
    const afterArrow = document.getElementById('tuningPill').textContent.trim().replace(/\s+/g, ' ');
    document.querySelector('.tuner-x').click();
    return { pillText, closed, inTuner, notes, afterArrow };
  });
  console.log('   ', JSON.stringify(sync));
  ok('выбор меняет плашку', /Drop D/.test(sync.pillText), sync.pillText);
  ok('список закрывается после выбора', sync.closed === true);
  ok('тюнер показывает тот же строй', sync.inTuner === 'Drop D' && sync.notes === 'DADGBE',
    `${sync.inTuner} ${sync.notes}`);
  ok('правка стрелками видна в плашке', /Свой строй/.test(sync.afterArrow), sync.afterArrow);

  // Пункт «Свой» — не строй, а действие: открывает тюнер, где строй
  // собирают стрелками у каждой струны.
  const own = await p.evaluate(async () => {
    document.getElementById('tuningPill').click();
    await new Promise((x) => setTimeout(x, 300));
    const item = document.querySelector('.tuner-tuning-own');
    const list = document.getElementById('tuningPickerList');
    const isLast = list.lastElementChild === item;
    if (!item) return { missing: true };
    item.click();
    await new Promise((x) => setTimeout(x, 500));
    const res = {
      isLast,
      text: item.textContent.trim().replace(/\s+/g, ' '),
      listClosed: list.hidden,
      tunerOpened: !!document.querySelector('.tuner-modal'),
      arrows: document.querySelectorAll('.tuner-string-arrow').length,
    };
    const x = document.querySelector('.tuner-x');
    if (x) x.click();
    return res;
  });
  console.log('   ', JSON.stringify(own));
  ok('пункт «Свой» есть', own.missing !== true && /Свой/.test(own.text), own.text);
  ok('стоит последним', own.isLast === true);
  ok('открывает тюнер с редактором', own.tunerOpened === true && own.arrows === 12,
    `стрелок ${own.arrows}`);
  ok('список при этом закрывается', own.listClosed === true);

  console.log('\n=== Кнопка тюнера ===');
  const t = await p.evaluate(() => {
    const btn = document.querySelector('.icon-round-btn');
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    const svg = btn.querySelector('svg');
    const tyk = [...document.querySelectorAll('.tools-toggle-inline')]
      .find(x => /Тык/.test(x.textContent));
    return {
      w: Math.round(r.width), h: Math.round(r.height),
      round: getComputedStyle(btn).borderRadius,
      hasSvg: !!svg,
      paths: svg ? svg.querySelectorAll('path').length : 0,
      svgW: svg ? Math.round(svg.getBoundingClientRect().width) : 0,
      leftOfTyk: tyk ? r.left < tyk.getBoundingClientRect().left : null,
      dupInToolbar: [...document.querySelectorAll('.toolbar .action-btn')]
        .filter(x => /Тюнер/.test(x.textContent)).length,
    };
  });
  console.log('   ', JSON.stringify(t));
  ok('кнопка круглая', t.round === '50%', t.round);
  ok('квадратная 36x36', t.w === 36 && t.h === 36, `${t.w}x${t.h}`);
  ok('внутри нарисованный камертон', t.hasSvg && t.paths === 4, `${t.paths} линий`);
  ok('иконка видна', t.svgW >= 16, String(t.svgW));
  ok('стоит слева от «Тык»', t.leftOfTyk === true);
  ok('дубля в панели инструментов нет', t.dupInToolbar === 0, String(t.dupInToolbar));

  const opens = await p.evaluate(() => {
    document.querySelector('.icon-round-btn').click();
    const shown = !!document.querySelector('.tuner-modal');
    const x = document.querySelector('.tuner-x'); if (x) x.click();
    return shown;
  });
  ok('открывает тюнер', opens === true);

  ok('ошибок страницы нет', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё зелено');
  await b.close();
})();
