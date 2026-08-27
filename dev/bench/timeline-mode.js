// Режим воспроизведения: вся песня одной горизонтальной лентой.
//
// Проверяем: полноту ленты, пропорциональность ширин длительностям,
// границы секций и квадратов, содержимое ячейки, следование за
// воспроизведением (текущий аккорд под неподвижным указателем),
// изоляцию от режима редактирования.
const puppeteer = require('puppeteer'); const fs = require('fs');
(async () => {
  const song = JSON.parse(fs.readFileSync('/home/user/dev/fixtures/wind-of-change.json', 'utf8'));
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage(); await p.setViewport({ width: 1400, height: 900 });
  let bad = 0; const ok = (n, c, x) => { console.log(`   ${c ? 'ok  ' : 'FAIL'} ${n}${!c && x !== undefined ? ' — ' + x : ''}`); if (!c) bad++; };
  p.on('pageerror', e => { console.log('   ОШИБКА:', String(e).split('\n')[0]); bad++; });
  await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 900));
  await p.evaluate(s => { localStorage.setItem('struchord_songs', JSON.stringify([s])); loadSong(0); }, song);
  await new Promise(r => setTimeout(r, 700));

  console.log('=== 1. Лента строится из всей песни ===');
  await p.evaluate(() => toggleTimelineMode(true));
  await new Promise(r => setTimeout(r, 500));
  let r = await p.evaluate(() => {
    // Повторы на ленте РАЗВЁРНУТЫ: квадрат «×2» лежит дважды, секция
    // «×N» — N раз. Поэтому ожидаемые количества считаем с учётом
    // repeat, а не по числу элементов модели.
    let events = 0, squares = 0, secBlocks = 0;
    sections.forEach((s) => {
      const sr = Math.max(1, s.repeat || 1);
      secBlocks += sr;
      s.squares.forEach((q) => {
        const qr = Math.max(1, q.repeat || 1);
        squares += sr * qr;
        events += sr * qr * q.events.length;
      });
    });
    return {
      events, squares, secBlocks, sections: sections.length,
      cells: document.querySelectorAll('.tl-cell').length,
      tlSquares: document.querySelectorAll('.tl-square').length,
      heads: document.querySelectorAll('.tl-section-head').length,
      headTexts: [...document.querySelectorAll('.tl-section-head > span:first-child')].map(e => e.textContent),
    };
  });
  console.log(`      секций ${r.sections} (блоков с повторами ${r.secBlocks}), квадратов ${r.squares}, событий ${r.events}`);
  ok('все аккорды на ленте', r.cells === r.events, `${r.cells} из ${r.events}`);
  ok('все квадраты размечены', r.tlSquares === r.squares, `${r.tlSquares} из ${r.squares}`);
  ok('у каждого прохода секции заголовок', r.heads === r.secBlocks, `${r.heads} из ${r.secBlocks}`);
  ok('заголовки названы', r.headTexts.every(t => t && t.trim()), JSON.stringify(r.headTexts));

  console.log('\n=== 2. Ширина пропорциональна длительности ===');
  r = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('.tl-cell').forEach((c) => {
      const sec = sections.find(s => s.id === +c.dataset.sec);
      const sq = sec.squares.find(q => q.id === +c.dataset.square);
      const ev = sq.events[+c.dataset.ei];
      const beats = getEventVisualSpanInParentUnits(ev, sec.timeSig || globalTimeSig);
      out.push({ beats, px: c.getBoundingClientRect().width });
    });
    const ratios = out.map(o => o.px / o.beats);
    return {
      n: out.length,
      min: Math.min(...ratios), max: Math.max(...ratios),
      distinctBeats: [...new Set(out.map(o => o.beats))].sort((a, b) => a - b),
    };
  });
  console.log(`      длительности на ленте: ${r.distinctBeats.join(', ')} долей`);
  console.log(`      пикселей на долю: ${r.min.toFixed(2)}..${r.max.toFixed(2)}`);
  ok('масштаб одинаков у всех ячеек', r.max - r.min < 0.5, `${r.min.toFixed(2)}..${r.max.toFixed(2)}`);
  ok('в песне есть ячейки разной длины', r.distinctBeats.length > 1, JSON.stringify(r.distinctBeats));

  console.log('\n=== 3. Содержимое ячейки ===');
  // Гриф и бой из ячейки убраны намеренно: аппликатура переехала в
  // закреплённую панель «Сейчас / Дальше», ритм — в сквозную дорожку.
  // Подробные проверки того и другого — в dev/bench/timeline-panels.js.
  r = await p.evaluate(() => {
    const cells = [...document.querySelectorAll('.tl-cell')];
    return {
      total: cells.length,
      names: cells.filter(c => c.querySelector('.tl-cell-name')).length,
      named: cells.filter(c => (c.querySelector('.tl-cell-name')?.textContent || '').trim() !== '').length,
      fing: cells.filter(c => c.querySelector('.tl-cell-fing')).length,
      strumBoxes: cells.filter(c => c.querySelector('.tl-cell-strum')).length,
      ticks: cells.filter(c => (c.querySelector('.tl-ticks')?.style.backgroundImage || '') !== '').length,
      hits: document.querySelectorAll('.tl-rhythm .tl-hit').length,
      panels: document.querySelectorAll('.tl-panel').length,
    };
  });
  console.log(`      имён ${r.names}/${r.total}, ударов на дорожке ${r.hits}, панелей ${r.panels}`);
  ok('имя аккорда есть у каждой ячейки', r.names === r.total);
  ok('имена не пустые', r.named === r.total, `${r.named}/${r.total}`);
  ok('гриф в ячейке не дублируется', r.fing === 0, String(r.fing));
  ok('бой в ячейке не дублируется', r.strumBoxes === 0, String(r.strumBoxes));
  ok('засечки долей проставлены', r.ticks > 0, String(r.ticks));
  ok('ритм вынесен на дорожку', r.hits > 0, String(r.hits));
  ok('панели «Сейчас / Дальше» на месте', r.panels === 2, String(r.panels));

  console.log('\n=== 4. Аппликатура в панели = та, что звучит ===');
  r = await p.evaluate(async () => {
    // Сравниваем не строки SVG, а координаты точек: браузер
    // пересериализует разметку (<rect/> становится <rect></rect>), и
    // посимвольное сравнение давало ложное расхождение на всех ячейках.
    const dots = (svgText) => {
      const box = document.createElement('div');
      box.innerHTML = svgText;
      return [...box.querySelectorAll('circle, text')]
        .map(e => `${e.tagName}:${e.getAttribute('cx') || e.getAttribute('x')},${e.getAttribute('cy') || e.getAttribute('y')}`)
        .sort().join('|');
    };
    document.getElementById('bpmInput').value = 200;
    playAll();
    let checked = 0, mismatch = 0;
    const seen = new Set();
    const t0 = Date.now();
    while (Date.now() - t0 < 6000) {
      const a = document.querySelector('.tl-cell.tl-active');
      const svg = document.querySelector('#tlNowFing svg');
      if (a && svg) {
        const key = `${a.dataset.sec}:${a.dataset.square}:${a.dataset.ei}`;
        if (!seen.has(key)) {
          seen.add(key);
          const sec = sections.find(s => s.id === +a.dataset.sec);
          const sq = sec.squares.find(q => q.id === +a.dataset.square);
          const ei = +a.dataset.ei;
          const chord = (sq.events[ei].chord || '').trim();
          if (chord) {
            const { shape } = resolveShapeForScheduledChord(chord, { secId: sec.id, squareId: sq.id, eventIndex: ei, key: sec.key || globalKey });
            if (shape) {
              checked++;
              if (dots(svg.outerHTML) !== dots(renderFingeringSVG(shape))) mismatch++;
            }
          }
        }
      }
      await new Promise(r => setTimeout(r, 40));
    }
    stopPlayback();
    return { checked, mismatch };
  });
  console.log(`      сверено ${r.checked} аккордов по ходу игры`);
  ok('панель успела показать несколько аккордов', r.checked >= 3, String(r.checked));
  ok('форма в панели совпадает со звучащей', r.mismatch === 0, `${r.mismatch} расхождений`);

  console.log('\n=== 5. Указатель неподвижен, лента едет непрерывно ===');
  r = await p.evaluate(async () => {
    document.getElementById('bpmInput').value = 120;
    playAll();
    const vp = document.getElementById('timelineViewport');
    const ph = document.getElementById('timelinePlayhead');
    // Первый кадр после старта — это возврат ленты к началу песни с той
    // позиции, где её оставил предыдущий блок стенда. Замер 1929 -> 2px
    // ловился как «откат назад», хотя это нормальная перемотка на старт.
    // Ждём, пока лента встанет на место, и только потом пишем.
    await new Promise(r => setTimeout(r, 250));
    const phX = [], offsets = [], actives = [], inside = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 6000) {
      phX.push(Math.round(ph.getBoundingClientRect().left));
      offsets.push(vp.scrollLeft);
      const a = document.querySelector('.tl-cell.tl-active');
      if (a) {
        actives.push(a.dataset.sec + ':' + a.dataset.square + ':' + a.dataset.ei);
        // Указатель обязан находиться ВНУТРИ активной ячейки: он
        // показывает текущий момент, а не центр аккорда.
        const ar = a.getBoundingClientRect(), pr = ph.getBoundingClientRect();
        const px = pr.left + pr.width / 2;
        inside.push(px >= ar.left - 4 && px <= ar.right + 4);
      }
      await new Promise(r => setTimeout(r, 50));
    }
    stopPlayback();
    // Шаги прокрутки: у непрерывного движения их много и они мелкие,
    // у прыжков от аккорда к аккорду — редкие и крупные.
    const steps = [];
    for (let i = 1; i < offsets.length; i++) {
      const d = offsets[i] - offsets[i - 1];
      if (d > 0.4) steps.push(d);
    }
    steps.sort((a, b) => a - b);
    return {
      phMoved: Math.max(...phX) - Math.min(...phX),
      scrolled: Math.max(...offsets) - Math.min(...offsets),
      uniqueActive: [...new Set(actives)].length,
      moves: steps.length,
      medianStep: steps.length ? steps[Math.floor(steps.length / 2)] : 0,
      maxStep: steps.length ? steps[steps.length - 1] : 0,
      insideRate: inside.length ? inside.filter(Boolean).length / inside.length : 0,
      backwards: (() => { let n = 0; for (let i = 1; i < offsets.length; i++) if (offsets[i] < offsets[i - 1] - 0.5) n++; return n; })(),
      backDetail: (() => { const o = []; for (let i = 1; i < offsets.length; i++) if (offsets[i] < offsets[i - 1] - 0.5) o.push({ from: Math.round(offsets[i - 1]), to: Math.round(offsets[i]) }); return o; })(),
    };
  });
  console.log(`      указатель сместился на ${r.phMoved}px, лента проехала ${Math.round(r.scrolled)}px`);
  console.log(`      шагов прокрутки ${r.moves}, медиана ${r.medianStep.toFixed(1)}px, максимум ${r.maxStep.toFixed(1)}px`);
  ok('указатель стоит на месте', r.phMoved <= 1, `${r.phMoved}px`);
  ok('лента движется', r.scrolled > 200, `${Math.round(r.scrolled)}px`);
  ok('подсветка идёт по аккордам', r.uniqueActive >= 3, String(r.uniqueActive));
  // Ключевая проверка: движение непрерывное, а не рывками между
  // аккордами. При скачках было бы несколько шагов по ~400px.
  ok('движение мелкими шагами', r.medianStep < 30, `медиана ${r.medianStep.toFixed(1)}px`);
  ok('нет скачков в целую ячейку', r.maxStep < 120, `максимум ${r.maxStep.toFixed(1)}px`);
  ok('указатель внутри активной ячейки', r.insideRate > 0.9, `${Math.round(r.insideRate * 100)}% замеров`);
  ok('лента не откатывается назад', r.backwards === 0,
    `${r.backwards} откатов: ${JSON.stringify(r.backDetail)}`);

  console.log('\n=== 6. Ритм на дорожке анимируется ===');
  r = await p.evaluate(async () => {
    // В исходной песне бой задан не везде. Ставим рисунок первой секции
    // явно: иначе стенд мог начать с ячейки без паттерна и «не увидеть»
    // анимацию, которая на деле работает.
    sections[0].strumPattern = { mode: 'strum', subdivision: 2, steps: ['D', null, 'D', null, null, 'U', 'D', 'U'] };
    render();
    document.getElementById('bpmInput').value = 200;
    playAll();
    const seen = new Set();
    let cellsAnimated = new Set();
    const t0 = Date.now();
    while (Date.now() - t0 < 5000) {
      document.querySelectorAll('.tl-rhythm .tl-hit.tl-hit-on').forEach((e) => {
        seen.add(e.className.replace(' tl-hit-on', ''));
        const entry = [...timelineHitEls.entries()].find(([, els]) => els.includes(e));
        if (entry) cellsAnimated.add(entry[0]);
      });
      await new Promise(r => setTimeout(r, 16));
    }
    stopPlayback();
    return { kinds: [...seen], cells: cellsAnimated.size, mapSize: timelineHitEls.size };
  });
  console.log(`      подсвечено типов ударов ${r.kinds.length} в ${r.cells} ячейках (карта: ${r.mapSize})`);
  ok('удары на дорожке подсвечиваются', r.kinds.length > 0, JSON.stringify(r.kinds));
  ok('анимация идёт в нескольких ячейках подряд', r.cells >= 2, String(r.cells));

  console.log('\n=== 7. Изоляция от режима редактирования ===');
  r = await p.evaluate(() => {
    const inTl = {
      editor: getComputedStyle(document.getElementById('sectionsContainer')).display,
      addBar: getComputedStyle(document.querySelector('.add-section-bar')).display,
      tip: document.getElementById('fingering-tooltip').style.display,
      preview: document.getElementById('preview-tooltip').style.display,
    };
    toggleTimelineMode(false);
    const back = {
      mode: timelineMode,
      editor: getComputedStyle(document.getElementById('sectionsContainer')).display,
      tl: getComputedStyle(document.getElementById('timelineMode')).display,
      wrappers: document.querySelectorAll('.chord-wrapper').length,
      label: document.getElementById('modeToggleLabel').textContent,
    };
    return { inTl, back };
  });
  console.log(`      в ленте: редактор ${r.inTl.editor}; после возврата: редактор ${r.back.editor}, ячеек ${r.back.wrappers}`);
  ok('редактор скрыт в режиме ленты', r.inTl.editor === 'none');
  ok('панель добавления секций скрыта', r.inTl.addBar === 'none', r.inTl.addBar);
  ok('тултипы не висят поверх ленты', r.inTl.tip !== 'block' && r.inTl.preview !== 'block',
    `${r.inTl.tip}/${r.inTl.preview}`);
  ok('возврат в редактор работает', r.back.mode === false && r.back.editor !== 'none');
  ok('лента скрыта в редакторе', r.back.tl === 'none', r.back.tl);
  ok('разметка редактора цела', r.back.wrappers > 0, String(r.back.wrappers));

  console.log('\n=== 8. Правка в редакторе отражается на ленте ===');
  r = await p.evaluate(() => {
    const sec = sections[0], sq = sec.squares[0];
    sq.events[0].chord = 'B7';
    render();
    toggleTimelineMode(true);
    const cell = document.querySelector(`.tl-cell[data-sec="${sec.id}"][data-square="${sq.id}"][data-ei="0"]`);
    const before = cell ? cell.querySelector('.tl-cell-name').textContent : null;
    // правка при УЖЕ открытой ленте
    sq.events[1].chord = 'A7';
    render();
    const cell2 = document.querySelector(`.tl-cell[data-sec="${sec.id}"][data-square="${sq.id}"][data-ei="1"]`);
    return { before, live: cell2 ? cell2.querySelector('.tl-cell-name').textContent : null };
  });
  ok('правка до открытия ленты видна', r.before === 'B7', String(r.before));
  ok('правка при открытой ленте видна', r.live === 'A7', String(r.live));

  console.log(bad ? `\nПРОВАЛОВ: ${bad}` : '\nвсё зелено');
  await b.close(); process.exit(bad ? 1 : 0);
})();
