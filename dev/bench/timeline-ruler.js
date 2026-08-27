// Дорожка ритма: линейка со счётом долей + панели над меткой.
//
// Проверяем:
//   - перебор набран тем же кеглем, что бой (был 13px против 20px);
//   - вертикальных засечек во всю высоту нет, вместо них горизонтальная
//     линейка с короткими штрихами над ней;
//   - счёт под линейкой соответствует дроблению паттерна;
//   - панель «Сейчас» центрирована по метке, «Дальше» справа от неё;
//   - ничего не вылезает за пределы яруса.
const puppeteer = require('puppeteer'); const fs = require('fs');
(async () => {
  const song = JSON.parse(fs.readFileSync('/home/user/dev/fixtures/wind-of-change.json', 'utf8'));
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage(); await p.setViewport({ width: 1400, height: 820 });
  let bad = 0; const ok = (n, c, x) => { console.log(`   ${c ? 'ok  ' : 'FAIL'} ${n}${!c && x !== undefined ? ' — ' + x : ''}`); if (!c) bad++; };
  p.on('pageerror', e => { console.log('   ОШИБКА:', String(e).split('\n')[0]); bad++; });
  await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1000));
  await p.evaluate((s) => { localStorage.setItem('struchord_songs', JSON.stringify([s])); loadSong(0); }, song);
  await new Promise(r => setTimeout(r, 700));

  // Ставит паттерн первой секции и открывает ленту заново.
  const withPattern = (pattern) => p.evaluate((pat) => {
    sections[0].strumPattern = pat;
    render();
    if (!timelineMode) toggleTimelineMode(true);
    else renderTimeline();
  }, pattern);

  console.log('=== 1. Линейка вместо частокола засечек ===');
  await withPattern({ mode: 'strum', subdivision: 2, steps: ['D', null, 'D', null, null, 'U', 'D', 'U'] });
  await new Promise(r => setTimeout(r, 600));
  let r = await p.evaluate(() => {
    const row = document.getElementById('timelineRhythm');
    const line = row.querySelector('.tl-rhythm-line');
    const rowRect = row.getBoundingClientRect();
    const lineRect = line ? line.getBoundingClientRect() : null;
    const track = document.getElementById('timelineTrack');
    const heights = [...new Set([...row.querySelectorAll('.tl-tick')]
      .map(e => Math.round(e.getBoundingClientRect().height)))].sort((a, b) => a - b);
    return {
      oldBeats: row.querySelectorAll('.tl-beat').length,
      lines: row.querySelectorAll('.tl-rhythm-line').length,
      lineW: lineRect ? Math.round(lineRect.width) : 0,
      trackW: Math.round(track.scrollWidth),
      lineH: lineRect ? Math.round(lineRect.height) : 0,
      tickHeights: heights,
      rowH: Math.round(rowRect.height),
      maxTick: heights.length ? heights[heights.length - 1] : 0,
      beatTick: Math.round((row.querySelector('.tl-tick.is-beat') || { getBoundingClientRect: () => ({ height: 0 }) }).getBoundingClientRect().height),
      barTick: Math.round((row.querySelector('.tl-tick.is-bar') || { getBoundingClientRect: () => ({ height: 0 }) }).getBoundingClientRect().height),
      countTop: Math.round(((row.querySelector('.tl-count') || { getBoundingClientRect: () => ({ top: rowRect.bottom }) }).getBoundingClientRect().top) - rowRect.top),
    };
  });
  console.log(`      линейка ${r.lineW}px (лента ${r.trackW}px), высоты штрихов: ${r.tickHeights.join(', ')}`);
  ok('старых засечек во всю высоту нет', r.oldBeats === 0, String(r.oldBeats));
  ok('горизонтальная линейка одна', r.lines === 1, String(r.lines));
  ok('линейка во всю длину ленты', Math.abs(r.lineW - r.trackW) <= 1, `${r.lineW} vs ${r.trackW}`);
  ok('линейка тонкая', r.lineH <= 2, `${r.lineH}px`);
  // Долевые и дробные штрихи короткие; тактовая черта — намеренно
  // длинная, она отбивает такты как в нотной записи.
  ok('долевые штрихи короткие', r.beatTick <= r.rowH / 4, `${r.beatTick} из ${r.rowH}`);
  ok('штрихи разной длины (доля/дробление)', r.tickHeights.length >= 3, JSON.stringify(r.tickHeights));
  ok('тактовая черта заметно длиннее долевой', r.barTick >= r.beatTick * 3, `${r.barTick} vs ${r.beatTick}`);
  ok('тактовая черта не перекрывает счёт', r.barTick <= r.countTop, `${r.barTick} vs ${r.countTop}`);

  console.log('\n=== 2. Счёт долей под линейкой ===');
  const counts = async (label) => {
    const got = await p.evaluate(() => {
      const row = document.getElementById('timelineRhythm');
      const line = row.querySelector('.tl-rhythm-line').getBoundingClientRect();
      const els = [...row.querySelectorAll('.tl-count')];
      const below = els.filter(e => e.getBoundingClientRect().top >= line.bottom - 1).length;
      return { seq: els.slice(0, 12).map(e => e.textContent), total: els.length, below };
    });
    console.log(`      ${label}: ${got.seq.join(' ')}`);
    return got;
  };
  let c = await counts('восьмые');
  ok('восьмые считаются «1 и 2 и»', c.seq.slice(0, 8).join(' ') === '1 и 2 и 3 и 4 и', c.seq.slice(0, 8).join(' '));
  ok('счёт стоит ПОД линейкой', c.below === c.total, `${c.below} из ${c.total}`);

  await withPattern({ mode: 'strum', subdivision: 4, steps: Array(16).fill('D') });
  await new Promise(r => setTimeout(r, 500));
  c = await counts('шестнадцатые');
  ok('шестнадцатые считаются «1 та и та»',
    c.seq.slice(0, 8).join(' ') === '1 та и та 2 та и та', c.seq.slice(0, 8).join(' '));

  await withPattern({ mode: 'strum', subdivision: 1, steps: ['D', 'D', 'D', 'D'] });
  await new Promise(r => setTimeout(r, 500));
  c = await counts('четверти');
  ok('четверти считаются «1 2 3 4»', c.seq.slice(0, 4).join(' ') === '1 2 3 4', c.seq.slice(0, 4).join(' '));

  await withPattern({ mode: 'strum', subdivision: 3, steps: Array(12).fill('D') });
  await new Promise(r => setTimeout(r, 500));
  c = await counts('триоли');
  ok('триоли считаются «1 та ти»', c.seq.slice(0, 6).join(' ') === '1 та ти 2 та ти', c.seq.slice(0, 6).join(' '));

  console.log('\n=== 2б. Удар стоит РОВНО над своим слогом счёта ===');
  // Раньше символ удара ставился в середину шага (i + 0.5), а штрих и
  // счёт — в его начало: вертикаль расходилась на полшага, то есть на
  // полдоли на четвертях. Ни один стенд этого не ловил.
  for (const [name, pat] of [
    ['восьмые', { mode: 'strum', subdivision: 2, steps: ['D', null, 'D', null, null, 'U', 'D', 'U'] }],
    ['шестнадцатые', { mode: 'strum', subdivision: 4, steps: Array(16).fill(null).map((_, i) => (i % 3 ? null : 'D')) }],
    ['четверти', { mode: 'strum', subdivision: 1, steps: ['D', 'D', 'D', 'D'] }],
    ['триоли', { mode: 'strum', subdivision: 3, steps: Array(12).fill('D') }],
    ['перебор', { mode: 'pick', subdivision: 2, steps: ['B', 3, 2, 3, 'B', 3, 2, [1, 2]] }],
  ]) {
    await withPattern(pat);
    await new Promise(r => setTimeout(r, 350));
    const a = await p.evaluate(() => {
      const cx = (el) => { const b = el.getBoundingClientRect(); return b.left + b.width / 2; };
      const hits = [...document.querySelectorAll('.tl-hit')].slice(0, 60);
      const counts = [...document.querySelectorAll('.tl-count')];
      const ticks = [...document.querySelectorAll('.tl-tick')];
      let worstCount = 0, worstTick = 0;
      hits.forEach((h) => {
        const x = cx(h);
        let dc = Infinity, dt = Infinity;
        counts.forEach((c) => { const d = Math.abs(cx(c) - x); if (d < dc) dc = d; });
        ticks.forEach((t) => { const d = Math.abs(cx(t) - x); if (d < dt) dt = d; });
        if (dc > worstCount) worstCount = dc;
        if (dt > worstTick) worstTick = dt;
      });
      return { n: hits.length, worstCount: +worstCount.toFixed(2), worstTick: +worstTick.toFixed(2) };
    });
    console.log(`      ${name}: ${a.n} ударов, удар↔счёт ${a.worstCount}px, удар↔штрих ${a.worstTick}px`);
    // Порог 1.5px: сам штрих шириной 1px, плюс субпиксельное округление.
    ok(`${name}: удар над своим слогом`, a.worstCount <= 1.5, `${a.worstCount}px`);
    ok(`${name}: удар над своим штрихом`, a.worstTick <= 1.5, `${a.worstTick}px`);
  }

  console.log('\n=== 2в. Ярусы не пересекаются, паузы на базовой линии ===');
  await withPattern({ mode: 'strum', subdivision: 2, steps: ['D', null, 'D', null, null, 'U', 'D', 'U'] });
  await new Promise(r => setTimeout(r, 400));
  r = await p.evaluate(() => {
    const row = document.getElementById('timelineRhythm').getBoundingClientRect();
    const rel = (el) => { const b = el.getBoundingClientRect(); return { top: +(b.top - row.top).toFixed(1), bottom: +(b.bottom - row.top).toFixed(1) }; };
    const hits = [...document.querySelectorAll('.tl-hit')];
    const rests = hits.filter(h => h.classList.contains('rest'));
    const arrows = hits.filter(h => h.classList.contains('down') || h.classList.contains('up'));
    // Наложение пауз на короткие штрихи линейки (тактовую черту не
    // считаем: она намеренно проходит через весь ярус ударов).
    const ticks = [...document.querySelectorAll('.tl-tick:not(.is-bar)')];
    let overlap = 0;
    rests.slice(0, 40).forEach((rst) => {
      const a = rst.getBoundingClientRect();
      ticks.forEach((t) => {
        const c = t.getBoundingClientRect();
        if (a.left < c.right && a.right > c.left && a.top < c.bottom && a.bottom > c.top) overlap++;
      });
    });
    const restBottoms = [...new Set(rests.slice(0, 30).map(e => Math.round(rel(e).bottom)))];
    const arrowBottoms = [...new Set(arrows.slice(0, 30).map(e => Math.round(rel(e).bottom)))];
    const tickTops = [...new Set(ticks.slice(0, 30).map(e => Math.round(rel(e).top)))];
    return {
      restBottoms, arrowBottoms, tickTops,
      lowestHit: Math.max(...hits.slice(0, 60).map(e => rel(e).bottom)),
      highestTick: Math.min(...tickTops),
      overlap,
    };
  });
  console.log(`      низ пауз ${r.restBottoms.join('/')}, низ стрелок ${r.arrowBottoms.join('/')}, верх штрихов ${r.tickTops.join('/')}`);
  ok('паузы выровнены по низу', r.restBottoms.length === 1, JSON.stringify(r.restBottoms));
  ok('паузы на одной линии со стрелками',
    r.restBottoms.length === 1 && r.arrowBottoms.length === 1 && r.restBottoms[0] === r.arrowBottoms[0],
    `${JSON.stringify(r.restBottoms)} vs ${JSON.stringify(r.arrowBottoms)}`);
  ok('паузы выше штрихов линейки', r.lowestHit <= r.highestTick, `${r.lowestHit} vs ${r.highestTick}`);
  ok('паузы не накладываются на штрихи', r.overlap === 0, String(r.overlap));

  console.log('\n=== 2г. Тактовая черта заметна ===');
  r = await p.evaluate(() => {
    const bars = [...document.querySelectorAll('.tl-tick.is-bar')];
    const beats = [...document.querySelectorAll('.tl-tick.is-beat')];
    const h = (e) => Math.round(e.getBoundingClientRect().height);
    const w = (e) => +e.getBoundingClientRect().width.toFixed(1);
    // Тактовые черты должны стоять через beatsPerBar долей.
    const xs = bars.map(e => e.getBoundingClientRect().left).sort((a, b) => a - b);
    const gaps = [];
    for (let i = 1; i < Math.min(xs.length, 12); i++) gaps.push(Math.round(xs[i] - xs[i - 1]));
    return {
      bars: bars.length, beats: beats.length,
      barH: bars[0] ? h(bars[0]) : 0, beatH: beats[0] ? h(beats[0]) : 0,
      barW: bars[0] ? w(bars[0]) : 0, beatW: beats[0] ? w(beats[0]) : 0,
      gaps: [...new Set(gaps)],
    };
  });
  console.log(`      тактовых черт ${r.bars}, высота ${r.barH}px против ${r.beatH}px у доли, шаг ${r.gaps.join('/')}px`);
  ok('тактовые черты есть', r.bars > 0, String(r.bars));
  ok('черта длиннее долевого штриха', r.barH > r.beatH * 3, `${r.barH} vs ${r.beatH}`);
  ok('черта толще долевого штриха', r.barW > r.beatW, `${r.barW} vs ${r.beatW}`);
  ok('черты стоят через равные промежутки', r.gaps.length <= 2, JSON.stringify(r.gaps));

  console.log('\n=== 3. Перебор той же величины, что бой ===');
  r = await p.evaluate(async () => {
    // Бой и перебор в одной песне: разные секции, один экран.
    sections[0].strumPattern = { mode: 'strum', subdivision: 2, steps: ['D', null, 'D', null, null, 'U', 'D', 'U'] };
    sections[1].strumPattern = { mode: 'pick', subdivision: 2, steps: ['B', 3, 2, 3, 'B', 3, 2, [1, 2]] };
    render();
    renderTimeline();
    await new Promise(r => setTimeout(r, 300));
    const strum = document.querySelector('.tl-hit.down');
    const pick = document.querySelector('.tl-hit.pick');
    const num = pick ? pick.querySelector('.strum-pick-num') : null;
    const px = (el) => (el ? parseFloat(getComputedStyle(el).fontSize) : 0);
    return { strumFont: px(strum), pickFont: px(pick), numFont: px(num), hasPick: !!pick };
  });
  console.log(`      бой ${r.strumFont}px, перебор ${r.pickFont}px, цифра струны ${r.numFont}px`);
  ok('перебор есть на дорожке', r.hasPick);
  ok('кегль перебора равен кеглю боя', r.pickFont === r.strumFont, `${r.pickFont} vs ${r.strumFont}`);
  ok('цифра струны того же кегля', r.numFont === r.strumFont, `${r.numFont} vs ${r.strumFont}`);

  console.log('\n=== 4. Ничего не вылезает за ярус ударов ===');
  r = await p.evaluate(async () => {
    // Столбики из 1..3 струн — самый высокий случай.
    sections[0].strumPattern = { mode: 'pick', subdivision: 2, steps: ['B', 3, [1, 2], 3, [1, 2, 3], 3, 'B', [2, 3]] };
    render();
    renderTimeline();
    await new Promise(r => setTimeout(r, 300));
    const row = document.getElementById('timelineRhythm').getBoundingClientRect();
    const line = document.querySelector('.tl-rhythm-line').getBoundingClientRect();
    let above = 0, onLine = 0, worst = 0;
    document.querySelectorAll('.tl-hit').forEach((h) => {
      const b = h.getBoundingClientRect();
      if (b.top < row.top) { above++; worst = Math.max(worst, row.top - b.top); }
      if (b.bottom > line.top + 1) onLine++;
    });
    return {
      hits: document.querySelectorAll('.tl-hit').length,
      stacks: document.querySelectorAll('.tl-hit.is-stack3').length,
      above, onLine, worst: Math.round(worst),
    };
  });
  console.log(`      ударов ${r.hits}, из них столбиков по 3 струны ${r.stacks}`);
  ok('ничего не выходит за верх дорожки', r.above === 0, `${r.above} шт., худший на ${r.worst}px`);
  ok('удары не заезжают на линейку', r.onLine === 0, String(r.onLine));

  console.log('\n=== 5. Панели над меткой таймлайна ===');
  r = await p.evaluate(async () => {
    document.getElementById('bpmInput').value = 120;
    playAll();
    await new Promise(r => setTimeout(r, 1500));
    const head = document.getElementById('timelinePlayhead').getBoundingClientRect();
    const now = document.getElementById('tlPanelNow').getBoundingClientRect();
    const next = document.getElementById('tlPanelNext').getBoundingClientRect();
    const stage = document.getElementById('timelineStage').getBoundingClientRect();
    const res = {
      headX: head.left + head.width / 2,
      nowX: now.left + now.width / 2,
      nextLeft: next.left,
      nowRight: now.right,
      nowBottom: now.bottom,
      stageTop: stage.top,
      nextIsRight: next.left >= now.right - 1,
      aboveTrack: now.bottom <= stage.top + 2,
    };
    stopPlayback();
    return res;
  });
  console.log(`      метка на ${Math.round(r.headX)}px, центр «Сейчас» на ${Math.round(r.nowX)}px`);
  ok('«Сейчас» центрирована по метке', Math.abs(r.headX - r.nowX) <= 2, `расхождение ${Math.abs(r.headX - r.nowX).toFixed(1)}px`);
  ok('«Дальше» справа от «Сейчас»', r.nextIsRight, `${Math.round(r.nextLeft)} vs ${Math.round(r.nowRight)}`);
  ok('панели над лентой, не поверх неё', r.aboveTrack, `${Math.round(r.nowBottom)} vs ${Math.round(r.stageTop)}`);

  console.log('\n=== 6. Панель «Сейчас» не ездит при смене аккорда ===');
  r = await p.evaluate(async () => {
    document.getElementById('bpmInput').value = 200;
    playAll();
    const xs = new Set(); const chords = new Set();
    const t0 = Date.now();
    while (Date.now() - t0 < 6000) {
      const b = document.getElementById('tlPanelNow').getBoundingClientRect();
      xs.add(Math.round(b.left + b.width / 2));
      chords.add(document.getElementById('tlNowChord').textContent);
      await new Promise(r => setTimeout(r, 60));
    }
    stopPlayback();
    return { positions: [...xs], chords: [...chords] };
  });
  console.log(`      аккорды: ${r.chords.join(', ')}; положений центра: ${r.positions.length}`);
  ok('центр панели неподвижен', r.positions.length === 1, JSON.stringify(r.positions));
  ok('аккорды при этом сменялись', r.chords.length >= 3, JSON.stringify(r.chords));

  console.log('\n=== 7. Шапка режима: название, тональность, размер ===');
  r = await p.evaluate(() => {
    const title = document.getElementById('tlSongTitle');
    const key = document.getElementById('tlRootKey');
    const ts = document.getElementById('tlTimeSig');
    return {
      hasAll: !!(title && key && ts),
      title: title.value,
      editorTitle: document.getElementById('songTitle').value,
      keyVal: key.value,
      editorKey: document.getElementById('rootKey').value,
      keyOpts: key.options.length,
      ts: ts.textContent,
      globalTs: globalTimeSig,
      // Размер только для чтения: это не поле ввода и не select.
      tsTag: ts.tagName,
      tsEditable: ts.isContentEditable,
    };
  });
  console.log(`      «${r.title}», тональность ${r.keyVal} (${r.keyOpts} вариантов), размер ${r.ts}`);
  ok('шапка на месте', r.hasAll);
  ok('название совпадает с редактором', r.title === r.editorTitle, `${r.title} vs ${r.editorTitle}`);
  ok('тональность совпадает с редактором', r.keyVal === r.editorKey, `${r.keyVal} vs ${r.editorKey}`);
  ok('список тональностей полный', r.keyOpts > 20, String(r.keyOpts));
  ok('размер показан верно', r.ts === r.globalTs, `${r.ts} vs ${r.globalTs}`);
  ok('размер НЕ редактируется', r.tsTag === 'SPAN' && !r.tsEditable, `${r.tsTag}`);

  console.log('\n=== 8. Правка из шапки доходит до модели ===');
  r = await p.evaluate(async () => {
    const title = document.getElementById('tlSongTitle');
    title.value = 'Проверка названия';
    title.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 150));
    const afterTitle = document.getElementById('songTitle').value;

    const key = document.getElementById('tlRootKey');
    const before = document.getElementById('rootKey').value;
    const other = [...key.options].map(o => o.value).find(v => v !== 'auto' && v !== before);
    key.value = other;
    key.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 300));
    const afterKey = document.getElementById('rootKey').value;
    return { afterTitle, before, picked: other, afterKey };
  });
  console.log(`      название -> «${r.afterTitle}», тональность ${r.before} -> ${r.afterKey}`);
  ok('название дошло до редактора', r.afterTitle === 'Проверка названия', r.afterTitle);
  ok('тональность дошла до редактора', r.afterKey === r.picked, `${r.afterKey} vs ${r.picked}`);

  console.log('\n=== 9. Аппликатура под меткой на паузе ===');
  r = await p.evaluate(async () => {
    const vp = document.getElementById('timelineViewport');
    vp.scrollLeft = Math.round((vp.scrollWidth - vp.clientWidth) * 0.35);
    await new Promise(r => setTimeout(r, 350));
    const cell = document.querySelector('.tl-cell.tl-active');
    return {
      marked: !!cell,
      chord: document.getElementById('tlNowChord').textContent,
      cellChord: cell ? cell.querySelector('.tl-cell-name').textContent : null,
      fing: !!document.querySelector('#tlNowFing svg'),
      nextEmpty: document.getElementById('tlPanelNext').classList.contains('is-empty'),
      controls: !!document.querySelector('.tl-fing-controls'),
      // Разметка копирует тултип редактора: те же классы и те же иконки.
      // Раньше сверялись текстовые глифы ✎ ◀ ▶ — после перевода на
      // Tabler сверяем ИМЯ ИКОНКИ внутри кнопки.
      counter: (document.querySelector('.tl-fing-controls span') || {}).textContent,
      editBtn: document.querySelectorAll('.tl-fing-controls .tooltip-edit-btn').length,
      navBtns: document.querySelectorAll('.tl-fing-controls .tooltip-nav-left, .tl-fing-controls .tooltip-nav-right').length,
      editIcon: (document.querySelector('.tl-fing-controls .tooltip-edit-btn i.ti') || {}).className,
      navIcons: [...document.querySelectorAll('.tl-fing-controls .tooltip-nav-left i.ti, .tl-fing-controls .tooltip-nav-right i.ti')].map(e => e.className).join(' '),
      timer: parseFloat(getComputedStyle(document.getElementById('tlNextTimer')).getPropertyValue('--tl-next-progress')) || 0,
    };
  });
  console.log(`      под меткой «${r.chord}», счётчик вариантов ${r.counter}`);
  ok('метка встала на ячейку', r.marked);
  ok('панель показывает аккорд под меткой', r.chord === r.cellChord, `${r.chord} vs ${r.cellChord}`);
  ok('аппликатура нарисована', r.fing);
  ok('превью «Дальше» скрыто на паузе', r.nextEmpty);
  ok('таймер обнулён', r.timer === 0, String(r.timer));
  ok('кнопки выбора варианта есть', r.controls);
  ok('карандаш как в редакторе (.tooltip-edit-btn, ti-pencil)',
    r.editBtn === 1 && /ti-pencil/.test(r.editIcon || ''), `${r.editBtn} шт., «${r.editIcon}»`);
  ok('стрелки как в редакторе (ti-chevron-left/right)',
    r.navBtns === 2 && /ti-chevron-left/.test(r.navIcons) && /ti-chevron-right/.test(r.navIcons),
    `${r.navBtns} шт., «${r.navIcons}»`);
  ok('счётчик показывает осмысленные формы', /^\d+\/\d+$/.test(r.counter || '') && +r.counter.split('/')[1] < 20,
    String(r.counter));

  console.log('\n=== 10. Переключение варианта и правка ===');
  r = await p.evaluate(async () => {
    const svgOf = () => (document.querySelector('#tlNowFing svg') || {}).outerHTML || '';
    const before = svgOf();
    const beforeCnt = (document.querySelector('.tl-fing-controls span') || {}).textContent;
    const right = document.querySelector('.tl-fing-controls .tooltip-nav-right');
    right.click();
    await new Promise(r => setTimeout(r, 250));
    const afterCnt = (document.querySelector('.tl-fing-controls span') || {}).textContent;
    const changed = svgOf() !== before;
    // Выбор должен закрепиться за КОНКРЕТНЫМ местом: проверяем, что
    // после перерисовки панели он остался.
    showPausedFingering(timelineActiveCell);
    await new Promise(r => setTimeout(r, 150));
    const persisted = (document.querySelector('.tl-fing-controls span') || {}).textContent;
    // Кнопка правки открывает редактор аппликатуры.
    const edit = document.querySelector('.tl-fing-controls .tooltip-edit-btn');
    edit.click();
    await new Promise(r => setTimeout(r, 400));
    const editorOpen = !!document.querySelector('#fingering-editor-fretboard');
    // Закрываем, чтобы не мешал следующим блокам.
    document.querySelectorAll('.fingering-editor-overlay, #fingering-editor-modal').forEach(e => e.remove());
    return { beforeCnt, afterCnt, changed, persisted, editorOpen };
  });
  console.log(`      счётчик ${r.beforeCnt} -> ${r.afterCnt}, редактор открылся: ${r.editorOpen}`);
  ok('счётчик сдвинулся', r.afterCnt !== r.beforeCnt, `${r.beforeCnt} -> ${r.afterCnt}`);
  ok('аппликатура сменилась', r.changed);
  ok('выбор закрепился за местом', r.persisted === r.afterCnt, `${r.persisted} vs ${r.afterCnt}`);
  ok('кнопка правки открывает редактор', r.editorOpen);

  console.log('\n=== 11. Во время игры кнопок выбора нет ===');
  r = await p.evaluate(async () => {
    document.getElementById('bpmInput').value = 180;
    playAll();
    await new Promise(r => setTimeout(r, 1500));
    const during = {
      controls: !!document.querySelector('.tl-fing-controls'),
      nextShown: !document.getElementById('tlPanelNext').classList.contains('is-empty'),
    };
    playAll(); // пауза
    await new Promise(r => setTimeout(r, 350));
    const after = { controls: !!document.querySelector('.tl-fing-controls') };
    stopPlayback();
    return { during, after };
  });
  ok('во время игры кнопок нет', r.during.controls === false);
  ok('во время игры превью показано', r.during.nextShown);
  ok('на паузе кнопки вернулись', r.after.controls === true);

  console.log('\n=== 12. Кнопки ОДИН В ОДИН с редактором ===');
  r = await p.evaluate(async () => {
    // Блок 11 закончился на stopPlayback(): панель очищена, кнопок нет.
    // Возвращаем метку на ячейку, иначе замерять нечего — первый прогон
    // вернул null по всем полям.
    onTimelineManualScroll();
    await new Promise(r => setTimeout(r, 300));
    // Снимаем оформление кнопок в ленте и в тултипе редактора и
    // сравниваем свойство в свойство.
    const pick = (el) => {
      if (!el) return null;
      const c = getComputedStyle(el);
      return {
        font: c.fontSize, weight: c.fontWeight, color: c.color,
        bg: c.backgroundColor, border: c.borderStyle, radius: c.borderRadius,
        padding: c.padding, text: el.textContent,
      };
    };
    const tlEdit = pick(document.querySelector('.tl-fing-controls .tooltip-edit-btn'));
    const tlNav = pick(document.querySelector('.tl-fing-controls .tooltip-nav-left'));
    const tlCount = pick(document.querySelector('.tl-fing-controls span'));

    // Открываем тултип редактора на том же аккорде.
    toggleTimelineMode(false);
    await new Promise(r => setTimeout(r, 300));
    const w = document.querySelector('.chord-wrapper');
    const chord = w.querySelector('.chord-input').value.trim();
    showFingeringTooltip(chord, w, false);
    await new Promise(r => setTimeout(r, 400));
    const edEdit = pick(document.querySelector('#fingering-tooltip .tooltip-edit-btn'));
    const edNav = pick(document.querySelector('#fingering-tooltip .tooltip-nav-left'));
    const edCount = pick(document.querySelector('#fingering-tooltip .tooltip-nav-left ~ span'));
    hideFingeringTooltip(false);
    toggleTimelineMode(true);
    await new Promise(r => setTimeout(r, 400));
    onTimelineManualScroll();
    await new Promise(r => setTimeout(r, 200));
    const same = (a, b, keys) => keys.every(k => a && b && a[k] === b[k]);
    return {
      tlEdit, edEdit, tlNav, edNav, tlCount, edCount,
      editSame: same(tlEdit, edEdit, ['font', 'color', 'bg', 'border', 'padding', 'text']),
      navSame: same(tlNav, edNav, ['font', 'color', 'bg', 'border', 'padding', 'text']),
      countSame: same(tlCount, edCount, ['font', 'color']),
    };
  });
  console.log(`      карандаш лента ${r.tlEdit && r.tlEdit.font}/${r.tlEdit && r.tlEdit.text} — редактор ${r.edEdit && r.edEdit.font}/${r.edEdit && r.edEdit.text}`);
  console.log(`      стрелка лента ${r.tlNav && r.tlNav.font}/${r.tlNav && r.tlNav.text} — редактор ${r.edNav && r.edNav.font}/${r.edNav && r.edNav.text}`);
  ok('карандаш совпадает с редактором', r.editSame,
    `${JSON.stringify(r.tlEdit)} vs ${JSON.stringify(r.edEdit)}`);
  ok('стрелки совпадают с редактором', r.navSame,
    `${JSON.stringify(r.tlNav)} vs ${JSON.stringify(r.edNav)}`);
  ok('счётчик совпадает с редактором', r.countSame,
    `${JSON.stringify(r.tlCount)} vs ${JSON.stringify(r.edCount)}`);

  console.log('\n=== 13. Тактовые черты совпадают с границами ===');
  r = await p.evaluate(() => {
    const cx = (el) => { const b = el.getBoundingClientRect(); return b.left + b.width / 2; };
    const bars = [...document.querySelectorAll('.tl-tick.is-bar')].map(cx).sort((a, b) => a - b);
    const sqLefts = [...document.querySelectorAll('.tl-square')].map(e => e.getBoundingClientRect().left);
    const secLefts = [...document.querySelectorAll('.tl-section')].map(e => e.getBoundingClientRect().left);
    const near = (arr, x) => arr.reduce((m, v) => Math.min(m, Math.abs(v - x)), Infinity);
    const gaps = [];
    for (let i = 1; i < bars.length; i++) gaps.push(Math.round(bars[i] - bars[i - 1]));
    // Сколько тактов должно быть по модели, с учётом повторов.
    let expect = 0;
    sections.forEach((s) => {
      const sr = Math.max(1, s.repeat || 1);
      const ts = s.timeSig || globalTimeSig;
      const bpb = getGridUnitsPerBar(ts);
      s.squares.forEach((q) => {
        const qr = Math.max(1, q.repeat || 1);
        let beats = 0;
        q.events.forEach((e) => { beats += getEventVisualSpanInParentUnits(e, ts); });
        expect += sr * qr * Math.ceil(beats / bpb);
      });
    });
    return {
      bars: bars.length, expect,
      gaps: [...new Set(gaps)].sort((a, b) => a - b),
      sqWorst: +Math.max(...sqLefts.map(x => near(bars, x))).toFixed(1),
      secWorst: +Math.max(...secLefts.map(x => near(bars, x))).toFixed(1),
    };
  });
  console.log(`      черт ${r.bars} (ожидалось ${r.expect}), шаги ${r.gaps.join('/')}px`);
  console.log(`      расхождение с границей квадрата ${r.sqWorst}px, секции ${r.secWorst}px`);
  ok('число тактовых черт верное', r.bars === r.expect, `${r.bars} vs ${r.expect}`);
  // Шагов ровно два: полный такт и такт вдвое короче (в песне есть
  // квадраты по 2 доли). Дробных значений вроде 194/386 быть не должно —
  // они означали бы, что border границ сдвигает сетку.
  ok('шаги между чертами без дробных сдвигов', r.gaps.length <= 2, JSON.stringify(r.gaps));
  ok('границы квадратов совпадают с чертами', r.sqWorst <= 1.5, `${r.sqWorst}px`);
  ok('границы секций совпадают с чертами', r.secWorst <= 1.5, `${r.secWorst}px`);

  console.log('\n=== 14. Светлая тема не хуже тёмной ===');
  r = await p.evaluate(async () => {
    const lum = (c) => {
      const m = c.match(/[\d.]+/g).map(Number);
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]);
    };
    const ratio = (a, b) => {
      const hi = Math.max(lum(a), lum(b)), lo = Math.min(lum(a), lum(b));
      return +((hi + 0.05) / (lo + 0.05)).toFixed(3);
    };
    const out = {};
    for (const t of ['light', 'dark']) {
      document.documentElement.setAttribute('data-theme', t);
      await new Promise(r => setTimeout(r, 350));
      const cs = (sel, pr) => { const e = document.querySelector(sel); return e ? getComputedStyle(e)[pr] : null; };
      const stage = cs('.timeline-stage', 'backgroundColor');
      const cell = cs('.tl-cell', 'backgroundColor');
      const container = cs('.container', 'backgroundColor');
      out[t] = {
        stageVsContainer: ratio(stage, container),
        cellVsStage: ratio(cell, stage),
        // Ни одна переменная ленты не должна быть пустой.
        emptyVars: ['--tl-cell-bg', '--tl-track-bg', '--tl-panel-bg', '--tl-panel-shadow']
          .filter(n => !getComputedStyle(document.documentElement).getPropertyValue(n).trim()),
      };
    }
    document.documentElement.setAttribute('data-theme', 'light');
    await new Promise(r => setTimeout(r, 300));
    return out;
  });
  console.log(`      светлая: подложка/лист ${r.light.stageVsContainer}, ячейка/подложка ${r.light.cellVsStage}`);
  console.log(`      тёмная:  подложка/лист ${r.dark.stageVsContainer}, ячейка/подложка ${r.dark.cellVsStage}`);
  ok('в светлой теме нет пустых переменных', r.light.emptyVars.length === 0, JSON.stringify(r.light.emptyVars));
  ok('в тёмной теме нет пустых переменных', r.dark.emptyVars.length === 0, JSON.stringify(r.dark.emptyVars));
  ok('в светлой лента отделена от листа', r.light.cellVsStage > 1.05, String(r.light.cellVsStage));
  ok('в тёмной лента отделена от листа', r.dark.cellVsStage > 1.05, String(r.dark.cellVsStage));
  // Главное требование: светлая не должна быть заметно бледнее тёмной.
  ok('темы сопоставимы по отделению ленты',
    Math.abs(r.light.cellVsStage - r.dark.cellVsStage) < 0.6,
    `светлая ${r.light.cellVsStage} vs тёмная ${r.dark.cellVsStage}`);

  console.log(bad ? `\nПРОВАЛОВ: ${bad}` : '\nвсё зелено');
  await b.close(); process.exit(bad ? 1 : 0);
})();
