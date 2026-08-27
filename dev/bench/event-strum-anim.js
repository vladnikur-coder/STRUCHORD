// Анимация мини-превью боя ВНУТРИ ячейки, когда бой разделён по ячейкам
// (у каждой свой ev.strumPattern).
//
// Два дефекта, которые ловит стенд:
//   1) шаги в ячейке вообще не подсвечивались — schedulePatternForEvent
//      анимировал бейдж секции и «сейчас играет», но не мини-превью;
//   2) паузы «_» не качались, если показанный кусок паттерна нечётной
//      длины — направление маятника выставлялось только при построении.
//
// ВАЖНО про аппликатуры. В редакторе анимируется ровно ОДИН источник
// ритма (см. anim-source.js): показаны аппликатуры — виджет в тултипе,
// выключены — бейдж секции и мини-превью ячеек. Этот стенд проверяет
// мини-превью, поэтому аппликатуры здесь выключены. Раздел 7 отдельно
// следит за тем, что при включённых аппликатурах превью МОЛЧИТ.
const puppeteer = require('puppeteer'); const fs = require('fs');
(async () => {
  const song = JSON.parse(fs.readFileSync('/home/user/dev/fixtures/wind-of-change.json', 'utf8'));
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage(); await p.setViewport({ width: 1400, height: 1000 });
  let bad = 0; const ok = (n, c, x) => { console.log(`   ${c ? 'ok  ' : 'FAIL'} ${n}${!c && x !== undefined ? ' — ' + x : ''}`); if (!c) bad++; };
  p.on('pageerror', e => { console.log('   ОШИБКА:', String(e).split('\n')[0]); bad++; });
  await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 900));
  await p.evaluate(s => { localStorage.setItem('struchord_songs', JSON.stringify([s])); loadSong(0); }, song);
  await new Promise(r => setTimeout(r, 700));
  // Мини-превью анимируется, только когда аппликатуры скрыты.
  await p.evaluate(() => { document.getElementById('showFingering').checked = false; toggleFingering(); });
  await new Promise(r => setTimeout(r, 300));

  // Ставит каждой ячейке первого квадрата свой паттерн и играет N мс,
  // собирая, какие шаги мини-превью успели побывать подсвеченными.
  const run = (steps, ms) => p.evaluate(async (steps, ms) => {
    if (playbackState.isPlaying) stopPlayback();
    const sq = sections[0].squares[0];
    sq.events.forEach((ev) => {
      ev.strumPattern = { mode: 'strum', subdivision: 2, steps: steps.slice() };
    });
    render();
    document.getElementById('bpmInput').value = 220;
    playAll();
    const cls = new Set(), moved = new Set(), tf = new Set();
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      document.querySelectorAll('.event-strum-preview .strum-step.strum-step-active').forEach((e) => {
        cls.add(e.className);
        const t = getComputedStyle(e).transform;
        if (t && t !== 'none' && t !== 'matrix(1, 0, 0, 1, 0, 0)') {
          moved.add(e.className.replace(' strum-step-active', ''));
          if (e.classList.contains('rest')) tf.add(t);
        }
      });
      await new Promise(r => setTimeout(r, 16));
    }
    const liveBox = document.querySelector('.event-strum-preview.is-live');
    const res = {
      classes: [...cls],
      moved: [...moved],
      restDirs: [...cls].filter(c => c.includes('rest')).map(c => c.includes('rest-down') ? 'down' : c.includes('rest-up') ? 'up' : 'none'),
      restShift: [...tf].map(t => +(t.match(/,\s*(-?[\d.]+)\)$/) || [0, 0])[1]),
      liveBoxes: document.querySelectorAll('.event-strum-preview.is-live').length,
      previewSteps: liveBox ? liveBox.querySelectorAll('.strum-step').length : 0,
    };
    stopPlayback();
    return res;
  }, steps, ms);

  console.log('=== 1. Чётный кусок: 8 шагов ===');
  let r = await run(['D', null, 'D', null, null, 'U', 'D', 'U'], 4000);
  console.log(`      подсвечено типов шагов ${r.classes.length}, из них с движением ${r.moved.length}`);
  ok('шаги в ячейке подсвечиваются', r.classes.length > 0, `${r.classes.length}`);
  ok('удары двигаются', r.moved.some(c => /down|up(?!\w)/.test(c) && !c.includes('rest')));
  ok('паузы двигаются', r.moved.some(c => c.includes('rest')), JSON.stringify(r.moved));
  ok('у пауз проставлено направление', r.restDirs.length > 0 && !r.restDirs.includes('none'), JSON.stringify(r.restDirs));

  console.log('\n=== 2. Нечётный кусок: 3 шага (тут паузы раньше стояли) ===');
  r = await run(['D', null, 'U'], 4000);
  console.log(`      подсвечено ${r.classes.length}, элементов в превью ${r.previewSteps}`);
  ok('шаги подсвечиваются', r.classes.length > 0);
  ok('пауза качается', r.moved.some(c => c.includes('rest')), JSON.stringify(r.moved));
  ok('смещение паузы ненулевое', r.restShift.some(v => Math.abs(v) > 0.5), JSON.stringify(r.restShift));

  console.log('\n=== 3. Нечётный кусок: 5 шагов ===');
  r = await run(['D', null, 'U', null, 'D'], 4500);
  ok('шаги подсвечиваются', r.classes.length > 0);
  ok('паузы качаются', r.moved.some(c => c.includes('rest')), JSON.stringify(r.moved));

  console.log('\n=== 4. Обе стороны маятника встречаются ===');
  r = await run(['D', null, null, 'U', 'D', null, null, 'U'], 5000);
  const dirs = new Set(r.restDirs);
  console.log(`      направления пауз: ${[...dirs].join(', ')}`);
  ok('есть и rest-down, и rest-up', dirs.has('down') && dirs.has('up'), [...dirs].join(','));

  console.log('\n=== 5. Тройное деление: паузу не качаем (фаза неизвестна) ===');
  r = await p.evaluate(async () => {
    if (playbackState.isPlaying) stopPlayback();
    const sq = sections[0].squares[0];
    sq.events.forEach((ev) => { ev.strumPattern = { mode: 'strum', subdivision: 3, steps: ['D', null, 'U', 'D', null, 'U'] }; });
    render();
    document.getElementById('bpmInput').value = 220;
    playAll();
    const cls = new Set();
    const t0 = Date.now();
    while (Date.now() - t0 < 4000) {
      document.querySelectorAll('.event-strum-preview .strum-step.rest.strum-step-active').forEach(e => cls.add(e.className));
      await new Promise(r => setTimeout(r, 16));
    }
    stopPlayback();
    return { classes: [...cls] };
  });
  ok('при триолях направление паузе не навязано',
    r.classes.every(c => !c.includes('rest-down') && !c.includes('rest-up')), JSON.stringify(r.classes));

  console.log('\n=== 6. Второй круг воспроизведения тоже анимируется ===');
  r = await p.evaluate(async () => {
    if (playbackState.isPlaying) stopPlayback();
    const sq = sections[0].squares[0];
    sq.events.forEach((ev) => { ev.strumPattern = { mode: 'strum', subdivision: 2, steps: ['D', null, 'D', null, null, 'U', 'D', 'U'] }; });
    render();
    document.getElementById('bpmInput').value = 240;
    playAll();
    const rounds = [];
    for (let k = 0; k < 2; k++) {
      const cls = new Set();
      const t0 = Date.now();
      while (Date.now() - t0 < 2500) {
        document.querySelectorAll('.event-strum-preview .strum-step.strum-step-active').forEach(e => cls.add(e.className));
        await new Promise(r => setTimeout(r, 16));
      }
      rounds.push(cls.size);
    }
    stopPlayback();
    return { rounds };
  });
  console.log(`      подсвечено за два окна: ${r.rounds.join(' / ')}`);
  ok('анимация не пропадает со временем', r.rounds.every(n => n > 0), JSON.stringify(r.rounds));

  console.log('\n=== 7. С аппликатурами превью в ячейке молчит ===');
  // Обратная сторона правила «один источник»: когда тултип аппликатуры
  // на экране, ритм оживает там, а мини-превью и бейдж секции стоят.
  r = await p.evaluate(async () => {
    if (playbackState.isPlaying) stopPlayback();
    document.getElementById('showFingering').checked = true;
    toggleFingering();
    const sq = sections[0].squares[0];
    sq.events.forEach((ev) => { ev.strumPattern = { mode: 'strum', subdivision: 2, steps: ['D', null, 'D', null, null, 'U', 'D', 'U'] }; });
    render();
    document.getElementById('bpmInput').value = 220;
    playAll();
    const cell = new Set(), sec = new Set(), tip = new Set();
    const t0 = Date.now();
    while (Date.now() - t0 < 4000) {
      document.querySelectorAll('.event-strum-preview .strum-step.strum-step-active').forEach(e => cell.add(e.className));
      document.querySelectorAll('.section-card .strum-step.strum-step-active').forEach(e => sec.add(e.className));
      document.querySelectorAll('#tooltipLiveStrum .strum-step.strum-step-active').forEach(e => tip.add(e.className));
      await new Promise(r => setTimeout(r, 16));
    }
    stopPlayback();
    document.getElementById('showFingering').checked = false;
    toggleFingering();
    return { cell: cell.size, sec: sec.size, tip: tip.size };
  });
  console.log(`      подсвечено: тултип ${r.tip}, ячейка ${r.cell}, секция ${r.sec}`);
  ok('тултип анимируется', r.tip > 0, String(r.tip));
  ok('мини-превью ячейки молчит', r.cell === 0, String(r.cell));
  ok('бейдж секции молчит', r.sec === 0, String(r.sec));

  console.log(bad ? `\nПРОВАЛОВ: ${bad}` : '\nвсё зелено');
  await b.close(); process.exit(bad ? 1 : 0);
})();
