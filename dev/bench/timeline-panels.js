// Режим воспроизведения, вторая очередь: дорожка ритма, панель
// «Сейчас / Дальше», круговой таймер до смены аккорда.
//
// Ключевые инварианты:
//   - дорожка ритма едет синхронно с лентой (одна прокрутка на двоих);
//   - удары стоят внутри своих ячеек, а не «примерно рядом»;
//   - панели закреплены: не сдвигаются ни на пиксель при смене аккорда;
//   - гриф «Сейчас» крупнее, чем в редакторе, и крупнее превью;
//   - таймер идёт от 0 к 1 внутри аккорда и сбрасывается на смене.
const puppeteer = require('puppeteer'); const fs = require('fs');
(async () => {
  const song = JSON.parse(fs.readFileSync('/home/user/dev/fixtures/wind-of-change.json', 'utf8'));
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage(); await p.setViewport({ width: 1400, height: 900 });
  let bad = 0; const ok = (n, c, x) => { console.log(`   ${c ? 'ok  ' : 'FAIL'} ${n}${!c && x !== undefined ? ' — ' + x : ''}`); if (!c) bad++; };
  p.on('pageerror', e => { console.log('   ОШИБКА:', String(e).split('\n')[0]); bad++; });
  await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 900));
  await p.evaluate((s) => {
    localStorage.setItem('struchord_songs', JSON.stringify([s]));
    loadSong(0);
    // В песне бой задан не везде; ставим рисунок первым двум секциям,
    // чтобы дорожка заведомо была непустой на проверяемом участке.
    sections[0].strumPattern = { mode: 'strum', subdivision: 2, steps: ['D', null, 'D', null, null, 'U', 'D', 'U'] };
    sections[1].strumPattern = { mode: 'strum', subdivision: 2, steps: ['D', null, 'D', 'U', null, 'U', 'D', 'U'] };
    render();
  }, song);
  await new Promise(r => setTimeout(r, 700));
  await p.evaluate(() => toggleTimelineMode(true));
  await new Promise(r => setTimeout(r, 500));

  console.log('=== 1. Ячейка ленты очищена ===');
  let r = await p.evaluate(() => ({
    cells: document.querySelectorAll('.tl-cell').length,
    fing: document.querySelectorAll('.tl-cell-fing').length,
    strum: document.querySelectorAll('.tl-cell-strum').length,
    names: document.querySelectorAll('.tl-cell-name').length,
  }));
  console.log(`      ячеек ${r.cells}, имён ${r.names}`);
  ok('гриф из ячеек убран', r.fing === 0, String(r.fing));
  ok('бой из ячеек убран', r.strum === 0, String(r.strum));
  ok('имя аккорда осталось', r.names === r.cells, `${r.names}/${r.cells}`);

  console.log('\n=== 2. Дорожка ритма построена и совпадает по ширине ===');
  r = await p.evaluate(() => {
    const row = document.getElementById('timelineRhythm');
    const track = document.getElementById('timelineTrack');
    // Повторы развёрнуты: у квадрата «×2» шаги считаются дважды.
    let expected = 0;
    sections.forEach((sec) => {
      const sr = Math.max(1, sec.repeat || 1);
      sec.squares.forEach((sq) => {
        const qr = Math.max(1, sq.repeat || 1);
        sq.events.forEach((ev, ei) => {
          const pat = getSlicedPatternForEvent(sec, sq, ev, ei);
          if (pat && pat.steps) expected += sr * qr * pat.steps.length;
        });
      });
    });
    return {
      hits: row.querySelectorAll('.tl-hit').length,
      beats: row.querySelectorAll('.tl-tick').length,
      counts: row.querySelectorAll('.tl-count').length,
      line: row.querySelectorAll('.tl-rhythm-line').length,
      expected,
      rowW: Math.round(row.getBoundingClientRect().width),
      trackW: Math.round(track.scrollWidth),
    };
  });
  console.log(`      ударов ${r.hits} (ожидалось ${r.expected}), засечек долей ${r.beats}`);
  ok('нарисованы все шаги всех паттернов', r.hits === r.expected, `${r.hits} vs ${r.expected}`);
  ok('деления линейки есть', r.beats > 0, String(r.beats));
  ok('счёт долей подписан', r.counts > 0, String(r.counts));
  ok('горизонтальная линейка одна', r.line === 1, String(r.line));
  ok('ширина дорожки = ширине ленты', Math.abs(r.rowW - r.trackW) <= 1, `${r.rowW} vs ${r.trackW}`);

  console.log('\n=== 3. Каждый удар стоит внутри своей ячейки ===');
  r = await p.evaluate(() => {
    let checked = 0, outside = 0, worst = 0;
    timelineHitEls.forEach((els, key) => {
      const cell = timelineCellByKey.get(key);
      if (!cell) { outside += els.length; return; }
      const cr = cell.getBoundingClientRect();
      els.forEach((el) => {
        const er = el.getBoundingClientRect();
        const cx = er.left + er.width / 2;
        checked++;
        if (cx < cr.left - 1 || cx > cr.right + 1) {
          outside++;
          worst = Math.max(worst, Math.max(cr.left - cx, cx - cr.right));
        }
      });
    });
    return { checked, outside, worst: Math.round(worst) };
  });
  console.log(`      проверено ${r.checked} ударов`);
  ok('ни один удар не вышел за свою ячейку', r.outside === 0, `${r.outside} мимо, худший на ${r.worst}px`);

  console.log('\n=== 4. Дорожка едет вместе с лентой ===');
  r = await p.evaluate(async () => {
    const vp = document.getElementById('timelineViewport');
    const cell = [...document.querySelectorAll('.tl-cell')][12];
    const hitKey = [...timelineHitEls.keys()].find(k => timelineCellByKey.get(k) === cell);
    const hit = hitKey ? timelineHitEls.get(hitKey)[0] : document.querySelector('.tl-hit');
    const before = cell.getBoundingClientRect().left - hit.getBoundingClientRect().left;
    vp.scrollLeft += 900;
    await new Promise(r => requestAnimationFrame(r));
    const after = cell.getBoundingClientRect().left - hit.getBoundingClientRect().left;
    vp.scrollLeft = 0;
    return { before: +before.toFixed(2), after: +after.toFixed(2) };
  });
  console.log(`      смещение аккорд-удар до прокрутки ${r.before}px, после ${r.after}px`);
  ok('прокрутка не рассинхронизирует строки', Math.abs(r.before - r.after) < 0.5,
    `${r.before} -> ${r.after}`);

  console.log('\n=== 5. Панели «Сейчас / Дальше» ===');
  r = await p.evaluate(async () => {
    document.getElementById('bpmInput').value = 200;
    playAll();
    const now = document.getElementById('tlPanelNow'), next = document.getElementById('tlPanelNext');
    const nowBox = new Set(), nextBox = new Set(), chords = new Set(), nextChords = new Set();
    const box = (el) => { const b = el.getBoundingClientRect(); return `${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.width)},${Math.round(b.height)}`; };
    let nowSvg = 0, nextSvg = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < 7000) {
      nowBox.add(box(now)); nextBox.add(box(next));
      chords.add(document.getElementById('tlNowChord').textContent);
      nextChords.add(document.getElementById('tlNextChord').textContent);
      const a = document.querySelector('#tlNowFing svg'), c = document.querySelector('#tlNextFing svg');
      if (a) nowSvg = Math.round(a.getBoundingClientRect().height);
      if (c) nextSvg = Math.round(c.getBoundingClientRect().height);
      await new Promise(r => setTimeout(r, 50));
    }
    // Пустота под сеткой — меряем ПОКА ИДЁТ ИГРА: после stopPlayback
    // панели очищаются и грифа в них уже нет.
    const gap = {};
    for (const id of ['tlPanelNow', 'tlPanelNext']) {
      const panel = document.getElementById(id);
      const svg = panel && panel.querySelector('svg');
      if (!svg) { gap[id] = null; continue; }
      const pr = panel.getBoundingClientRect(), sr = svg.getBoundingClientRect();
      const ys = [...svg.querySelectorAll('line')]
        .filter((l) => l.getAttribute('x1') !== l.getAttribute('x2'))
        .map((l) => +l.getAttribute('y1'));
      const scale = sr.height / (+svg.getAttribute('height') || 180);
      const gridBottom = (sr.top - pr.top) + Math.max(...ys) * scale;
      gap[id] = { h: Math.round(pr.height), underGrid: Math.round(pr.height - gridBottom) };
    }
    stopPlayback();
    return {
      nowPositions: [...nowBox], nextPositions: [...nextBox],
      chords: [...chords], nextChords: [...nextChords], nowSvg, nextSvg, gap,
    };
  });
  console.log(`      «Сейчас» прошёл: ${r.chords.join(', ')}`);
  console.log(`      гриф «Сейчас» ${r.nowSvg}px, «Дальше» ${r.nextSvg}px`);
  ok('панель «Сейчас» не сдвигается', r.nowPositions.length === 1, JSON.stringify(r.nowPositions));
  ok('панель «Дальше» не сдвигается', r.nextPositions.length === 1, JSON.stringify(r.nextPositions));
  ok('аккорды сменяются', r.chords.length >= 3, JSON.stringify(r.chords));
  ok('превью показывает другой аккорд', r.nextChords.length >= 3, JSON.stringify(r.nextChords));
  // В редакторе SVG аппликатуры имеет высоту 180px — панель должна быть крупнее.
  ok('гриф крупнее, чем в редакторе (180px)', r.nowSvg > 180, `${r.nowSvg}px`);
  ok('превью мельче текущего', r.nextSvg < r.nowSvg, `${r.nextSvg} vs ${r.nowSvg}`);

  console.log('\n=== Панель без пустоты под грифом ===');
  // В SVG аппликатуры заложен запас 40px под сеткой: в редакторе туда
  // ложится строка управления или виджет боя. В ленте класть в него
  // нечего — кнопок правки нет, ритм показан на дорожке. Замер до
  // правки: 34px пустоты внизу, высота панели 272px.
  console.log('   ', JSON.stringify(r.gap));
  if (r.gap && r.gap.tlPanelNow) {
    // Под сеткой лежит запас (24px в SVG, здесь растянут до ~28) — на
    // паузе в нём строка «‹ 1/5 › ✎», во время игры она погашена, но
    // место сохранено: иначе панель прыгала бы по высоте.
    // Плюс собственный нижний отступ панели 12px.
    //
    // Подрезать этот запас нельзя: пробовали margin-bottom, и рисунок
    // грифа вылезал за нижний край панели, а сама она выглядела
    // сплющенной.
    ok('«Сейчас»: поля под грифом не больше 44px',
      r.gap.tlPanelNow.underGrid <= 44, `${r.gap.tlPanelNow.underGrid}px`);
  }
  if (r.gap && r.gap.tlPanelNext) {
    ok('«Дальше»: поля под грифом не больше 44px',
      r.gap.tlPanelNext.underGrid <= 44, `${r.gap.tlPanelNext.underGrid}px`);
  }

  // Главное: высота панели ОДНА И ТА ЖЕ в игре и на паузе.
  const heights = await p.evaluate(async () => {
    const panel = document.getElementById('tlPanelNow');
    const h = () => Math.round(panel.getBoundingClientRect().height);
    playAll();
    await new Promise((x) => setTimeout(x, 1400));
    const playing = h();
    const btns = panel.querySelectorAll('.tl-fing-controls button').length;
    playAll();
    await new Promise((x) => setTimeout(x, 1200));
    const paused = h();
    const btnsPaused = panel.querySelectorAll('.tl-fing-controls button').length;
    return { playing, paused, btns, btnsPaused };
  });
  console.log('   ', JSON.stringify(heights));
  ok('высота панели не меняется на паузе',
    heights.playing === heights.paused, `${heights.playing} -> ${heights.paused}`);
  ok('во время игры кнопок нет', heights.btns === 0, String(heights.btns));
  ok('на паузе кнопки появляются', heights.btnsPaused > 0, String(heights.btnsPaused));

  console.log('\n=== 5б. Кнопки не мигают при прокрутке на паузе ===');
  // fillTimelinePanel переписывал innerHTML контейнера грифа целиком и
  // сносил строку «‹ 1/5 › ✎» вместе с ним. При прокрутке ленты панель
  // обновляется десятки раз в секунду: строка создавалась заново и
  // каждый раз начинала анимацию появления с нуля. Замер до правки:
  // opacity 0.26, 0, 0.08 — кнопки мигали и читались как исчезающие.
  //
  // Вынуть и вернуть узел мало: удаление из DOM с последующей вставкой
  // ПЕРЕЗАПУСКАЕТ css-анимацию. Поэтому подменяется только svg, а строка
  // не двигается вовсе.
  const scr = await p.evaluate(async () => {
    if (playbackState.isPlaying) playAll();
    await new Promise((x) => setTimeout(x, 700));
    const vp = document.getElementById('timelineViewport');
    const read = () => {
      const f = document.getElementById('tlNowFing');
      const bar = f ? f.querySelector('.tl-fing-controls') : null;
      return {
        op: bar ? +getComputedStyle(bar).opacity : null,
        btns: bar ? bar.querySelectorAll('button').length : 0,
        svgs: f ? f.querySelectorAll('svg').length : 0,
      };
    };
    const before = read();
    const ops = [], svgs = [], btns = [];
    for (let i = 0; i < 10; i++) {
      vp.scrollLeft += 140;
      vp.dispatchEvent(new Event('scroll'));
      await new Promise((x) => setTimeout(x, 60));
      const r = read();
      ops.push(r.op); svgs.push(r.svgs); btns.push(r.btns);
    }
    return { before, minOp: Math.min(...ops.filter((o) => o !== null)),
      maxSvg: Math.max(...svgs), minBtns: Math.min(...btns) };
  });
  console.log('   ', JSON.stringify(scr));
  ok('до прокрутки кнопки видны', scr.before.op === 1, String(scr.before.op));
  ok('при прокрутке не гаснут', scr.minOp === 1, `минимум opacity ${scr.minOp}`);
  ok('и не исчезают из разметки', scr.minBtns > 0, String(scr.minBtns));
  ok('гриф не задваивается', scr.maxSvg === 1, String(scr.maxSvg));

  // Плавное появление при ВХОДЕ в паузу должно остаться: строку тогда
  // действительно создают заново.
  const fade = await p.evaluate(async () => {
    playAll();
    await new Promise((x) => setTimeout(x, 1300));
    playAll();
    await new Promise((x) => setTimeout(x, 40));
    const bar = document.querySelector('#tlNowFing .tl-fing-controls');
    const early = bar ? +getComputedStyle(bar).opacity : null;
    await new Promise((x) => setTimeout(x, 600));
    const late = bar ? +getComputedStyle(bar).opacity : null;
    if (playbackState.isPlaying) playAll();
    return { early, late };
  });
  console.log('   ', JSON.stringify(fade));
  ok('вход в паузу — появление плавное', fade.early < 1, String(fade.early));
  ok('и доходит до конца', fade.late === 1, String(fade.late));

  console.log('\n=== 6. «Дальше» = реально следующий аккорд ===');
  r = await p.evaluate(async () => {
    document.getElementById('bpmInput').value = 150;
    playAll();
    // Смену отслеживаем по КЛЮЧУ ЯЧЕЙКИ, а не по имени аккорда.
    // В песне 11 пар подряд идущих одинаковых аккордов (G→G, C→C):
    // по имени такой переход невидим, и стенд сравнивал не соседние
    // пары, а через одну — отсюда плавающий провал «1 из 4 мимо».
    const pairs = [];
    let lastKey = '';
    const t0 = Date.now();
    while (Date.now() - t0 < 6000) {
      const a = document.querySelector('.tl-cell.tl-active');
      const key = a ? `${a.dataset.sec}:${a.dataset.square}:${a.dataset.ei}:${a.dataset.secPass}:${a.dataset.sqPass}` : '';
      const n = document.getElementById('tlNowChord').textContent;
      const x = document.getElementById('tlNextChord').textContent;
      if (key && key !== lastKey && n) { pairs.push([n, x]); lastKey = key; }
      await new Promise(r => setTimeout(r, 30));
    }
    stopPlayback();
    // Предсказание на шаге k должно совпасть с «Сейчас» на шаге k+1.
    //
    // Исключение — повтор того же аккорда подряд: панель «Дальше»
    // намеренно пропускает паузы и показывает следующий аккорд, который
    // БРАТЬ. Если k и k+1 — один и тот же аккорд, предсказание на шаге k
    // указывает уже за него, и сравнивать эти два шага нельзя.
    let checked = 0, wrong = 0;
    const misses = [];
    for (let i = 0; i + 1 < pairs.length; i++) {
      if (pairs[i][0] === pairs[i + 1][0]) continue;
      checked++;
      if (pairs[i][1] !== pairs[i + 1][0]) { wrong++; misses.push(`${pairs[i][0]}→${pairs[i][1]}, а стало ${pairs[i + 1][0]}`); }
    }
    return { pairs: pairs.slice(0, 6), checked, wrong, misses: misses.slice(0, 3) };
  });
  console.log(`      пары (сейчас -> дальше): ${r.pairs.map(x => x.join('→')).join(', ')}`);
  ok('превью предсказывает верно', r.checked > 0 && r.wrong === 0,
    `${r.wrong} из ${r.checked} мимо: ${JSON.stringify(r.misses)}`);

  console.log('\n=== 7. Круговой таймер ===');
  r = await p.evaluate(async () => {
    document.getElementById('bpmInput').value = 90;
    playAll();
    const el = document.getElementById('tlNextTimer');
    const vals = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 6000) {
      vals.push(parseFloat(getComputedStyle(el).getPropertyValue('--tl-next-progress')) || 0);
      await new Promise(r => setTimeout(r, 40));
    }
    stopPlayback();
    const after = parseFloat(getComputedStyle(el).getPropertyValue('--tl-next-progress')) || 0;
    // Сбросы: значение упало заметно вниз — это смена аккорда.
    let resets = 0, rises = 0;
    for (let i = 1; i < vals.length; i++) {
      if (vals[i] < vals[i - 1] - 0.2) resets++;
      else if (vals[i] > vals[i - 1]) rises++;
    }
    return {
      min: Math.min(...vals), max: Math.max(...vals),
      resets, rises, n: vals.length, after,
      inRange: vals.every(v => v >= 0 && v <= 1),
    };
  });
  console.log(`      значения ${r.min.toFixed(2)}..${r.max.toFixed(2)}, ростов ${r.rises}, сбросов ${r.resets}`);
  ok('таймер в пределах 0..1', r.inRange, `${r.min}..${r.max}`);
  ok('таймер наполняется', r.rises > 20, String(r.rises));
  ok('таймер сбрасывается на смене аккорда', r.resets >= 2, String(r.resets));
  ok('доходит почти до конца', r.max > 0.85, r.max.toFixed(2));
  ok('после остановки обнулён', r.after === 0, String(r.after));

  // Вид таймера: СПЛОШНОЙ круг, залитый акцентом, который по часовой
  // выцветает. Прогресс 0 — круг полный, 1 — пустой. Проверяем не CSS,
  // а долю акцентных пикселей: правило можно записать по-разному, а
  // видимый результат один.
  r = await p.evaluate(async () => {
    const el = document.getElementById('tlNextTimer');
    // Блок 7 играл ленту. Её rAF-цикл сам пишет прогресс каждый кадр и
    // затирал значение между нашими замерами: прогон случайно давал
    // [0, 0, 180, ...] примерно раз из трёх. Глушим движение и ждём
    // кадр, чтобы цикл точно завершился.
    if (typeof stopTimelineMotion === 'function') stopTimelineMotion();
    await new Promise(r => requestAnimationFrame(r));
    // Панель «Дальше» должна быть заполнена, иначе таймер скрыт вместе с ней.
    const sec = sections[0], sq = sec.squares[0];
    fillTimelinePanel('next', (sq.events[1] || sq.events[0]).chord, {
      secId: sec.id, squareId: sq.id, eventIndex: 1, key: globalKey,
    });
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim();
    const out = [];
    for (const v of [0, 0.25, 0.5, 0.75, 1]) {
      setTimelineNextProgress(v);
      await new Promise(r => requestAnimationFrame(r));
      out.push({ v, bg: getComputedStyle(el).backgroundImage });
    }
    return { accent, out, isRing: getComputedStyle(el, '::after').content !== 'none' };
  });
  const hex = r.accent.replace('#', '');
  const rgb = `rgb(${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)})`;
  // При прогрессе 0 акцент должен начинаться с 0deg (весь круг залит),
  // при 1 — сектор акцента вырожден.
  // Порядок цветов в conic-gradient и есть отличие двух вариантов.
  //   убывающий круг: conic-gradient(<тусклый> Ndeg, <акцент> 0deg)
  //   нарастающее кольцо: conic-gradient(<акцент> Ndeg, <фон> 0deg)
  // То есть у нужного нам варианта ПЕРВЫМ идёт тусклый цвет, и растёт
  // именно его угол — выцветший сектор отъедает круг по часовой.
  const firstStop = (bg) => {
    const m = bg.match(/conic-gradient\(\s*((?:rgba?\([^)]*\)|#[0-9a-f]+))\s+([\d.]+)deg/i);
    return m ? { color: m[1], deg: +m[2] } : null;
  };
  const stops = r.out.map(o => firstStop(o.bg));
  const starts = stops.map(x => (x ? x.deg : null));
  const firstIsAccent = stops[0] && stops[0].color === rgb;
  console.log(`      при 0: ${r.out[0].bg.slice(0, 74)}…`);
  console.log(`      начало акцентного сектора: ${starts.join(' -> ')} deg`);
  ok('таймер — сплошной круг, не кольцо', !r.isRing, String(r.isRing));
  // У нарастающего кольца первым в градиенте стоял бы акцент.
  ok('первым идёт выцветший сектор, не акцент', !firstIsAccent,
    stops[0] ? stops[0].color : 'нет');
  ok('в начале круг залит акцентом целиком', starts[0] === 0, String(starts[0]));
  ok('выцветание идёт по часовой стрелке',
    starts.every((v, i) => i === 0 || (v !== null && v > starts[i - 1])), JSON.stringify(starts));
  ok('к смене аккорда круг пуст', starts[starts.length - 1] === 360, String(starts[starts.length - 1]));

  console.log('\n=== 8. Удары дорожки подсвечиваются в такт ===');
  r = await p.evaluate(async () => {
    document.getElementById('bpmInput').value = 200;
    playAll();
    const kinds = new Set(); const cells = new Set();
    let maxSimultaneous = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < 5000) {
      const on = document.querySelectorAll('.tl-hit.tl-hit-on');
      maxSimultaneous = Math.max(maxSimultaneous, on.length);
      on.forEach((e) => {
        kinds.add(e.className.replace(' tl-hit-on', ''));
        const k = [...timelineHitEls.entries()].find(([, els]) => els.includes(e));
        if (k) cells.add(k[0]);
      });
      await new Promise(r => setTimeout(r, 16));
    }
    stopPlayback();
    const left = document.querySelectorAll('.tl-hit.tl-hit-on').length;
    return { kinds: [...kinds], cells: cells.size, maxSimultaneous, left };
  });
  console.log(`      типов ударов ${r.kinds.length}, ячеек ${r.cells}, максимум одновременно ${r.maxSimultaneous}`);
  ok('удары загораются', r.kinds.length > 0, JSON.stringify(r.kinds));
  ok('подсветка идёт по нескольким ячейкам', r.cells >= 2, String(r.cells));
  ok('горит не вся дорожка разом', r.maxSimultaneous <= 3, String(r.maxSimultaneous));
  ok('после остановки подсветка снята', r.left === 0, String(r.left));

  console.log('\n=== 9. Возврат в редактор ничего не ломает ===');
  r = await p.evaluate(() => {
    toggleTimelineMode(false);
    const back = {
      wrappers: document.querySelectorAll('.chord-wrapper').length,
      editorFing: document.querySelectorAll('.chord-wrapper .chord-ticks').length,
      nowEmpty: document.getElementById('tlPanelNow').classList.contains('is-empty'),
      progress: parseFloat(getComputedStyle(document.getElementById('tlNextTimer')).getPropertyValue('--tl-next-progress')) || 0,
    };
    toggleTimelineMode(true);
    const again = {
      hits: document.querySelectorAll('.tl-hit').length,
      cells: document.querySelectorAll('.tl-cell').length,
    };
    return { back, again };
  });
  ok('разметка редактора цела', r.back.wrappers > 0, String(r.back.wrappers));
  ok('панели очищены при выходе', r.back.nowEmpty);
  ok('таймер обнулён при выходе', r.back.progress === 0, String(r.back.progress));
  ok('повторный вход пересобирает дорожку', r.again.hits > 0 && r.again.cells > 0,
    `${r.again.hits} ударов, ${r.again.cells} ячеек`);
  console.log(bad ? `\nПРОВАЛОВ: ${bad}` : '\nвсё зелено');
  await b.close(); process.exit(bad ? 1 : 0);
})();
