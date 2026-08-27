// Режим воспроизведения, третья очередь:
//   - развёртка повторов в одну ленту (указатель не откатывается назад);
//   - транспорт: play/pause, стоп-в-начало, свободная перемотка;
//   - режим редактирования при этом НЕ меняется;
//   - в консоли нет отладочных логов.
const puppeteer = require('puppeteer'); const fs = require('fs');
(async () => {
  const song = JSON.parse(fs.readFileSync('/home/user/dev/fixtures/wind-of-change.json', 'utf8'));
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage(); await p.setViewport({ width: 1400, height: 900 });
  let bad = 0; const ok = (n, c, x) => { console.log(`   ${c ? 'ok  ' : 'FAIL'} ${n}${!c && x !== undefined ? ' — ' + x : ''}`); if (!c) bad++; };
  const consoleLogs = [];
  p.on('console', (m) => consoleLogs.push(`${m.type()}: ${m.text().slice(0, 90)}`));
  p.on('pageerror', e => { console.log('   ОШИБКА:', String(e).split('\n')[0]); bad++; });
  await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 900));
  await p.evaluate((s) => {
    localStorage.setItem('struchord_songs', JSON.stringify([s]));
    loadSong(0);
    sections[0].repeat = 2;
    sections[0].squares[0].repeat = 2;
    sections[0].strumPattern = { mode: 'strum', subdivision: 2, steps: ['D', null, 'D', null, null, 'U', 'D', 'U'] };
    render();
  }, song);
  await new Promise(r => setTimeout(r, 700));

  console.log('=== 1. Редактор не изменился ===');
  let r = await p.evaluate(() => ({
    loop: getComputedStyle(document.getElementById('btnLoop')).display,
    stop: getComputedStyle(document.getElementById('btnStop')).display,
    play: document.getElementById('btnPlay').textContent,
    loopHandler: document.getElementById('btnLoop').getAttribute('onclick'),
    playHandler: document.getElementById('btnPlay').getAttribute('onclick'),
  }));
  console.log(`      цикл ${r.loop}, стоп ${r.stop}, play «${r.play}»`);
  ok('кнопка цикла видна', r.loop !== 'none', r.loop);
  ok('кнопка стоп скрыта', r.stop === 'none', r.stop);
  ok('обработчик цикла прежний', r.loopHandler === 'toggleLoop()', String(r.loopHandler));
  ok('обработчик play прежний', r.playHandler === 'playAll()', String(r.playHandler));

  console.log('\n=== 2. В редакторе play = стоп (поведение не тронуто) ===');
  r = await p.evaluate(async () => {
    document.getElementById('bpmInput').value = 200;
    playAll();
    await new Promise(r => setTimeout(r, 1200));
    const during = { btn: document.getElementById('btnPlay').querySelector('i.ti').className, playing: playbackState.isPlaying };
    playAll();
    await new Promise(r => setTimeout(r, 200));
    const after = {
      playing: playbackState.isPlaying,
      // В редакторе точка старта не запоминается: следующий play — с начала.
      resume: typeof timelineStartPosition === 'object' ? timelineStartPosition : 'нет',
    };
    return { during, after };
  });
  ok('во время игры значок ⏹ (ti-player-stop)', r.during.btn === 'ti ti-player-stop', r.during.btn);
  ok('повторное нажатие останавливает', r.after.playing === false);
  ok('позиция для продолжения не сохраняется', r.after.resume === null, JSON.stringify(r.after.resume));

  console.log('\n=== 3. Повторы развёрнуты в линию ===');
  await p.evaluate(() => toggleTimelineMode(true));
  await new Promise(r => setTimeout(r, 500));
  r = await p.evaluate(() => {
    let expected = 0;
    sections.forEach((s) => {
      const sr = Math.max(1, s.repeat || 1);
      s.squares.forEach((q) => { expected += sr * Math.max(1, q.repeat || 1) * q.events.length; });
    });
    const heads = [...document.querySelectorAll('.tl-section-head > span:first-child')].map(e => e.textContent);
    return {
      cells: document.querySelectorAll('.tl-cell').length,
      expected,
      sectionBlocks: document.querySelectorAll('.tl-section').length,
      modelSections: sections.length,
      heads: heads.slice(0, 3),
      uniqueKeys: timelineCellByKey.size,
      hits: document.querySelectorAll('.tl-hit').length,
    };
  });
  console.log(`      ячеек ${r.cells} (ожидалось ${r.expected}), блоков секций ${r.sectionBlocks} при ${r.modelSections} в модели`);
  console.log(`      заголовки: ${r.heads.join(' | ')}`);
  ok('каждый повтор развёрнут отдельной ячейкой', r.cells === r.expected, `${r.cells} vs ${r.expected}`);
  ok('ключи ячеек уникальны', r.uniqueKeys === r.cells, `${r.uniqueKeys} vs ${r.cells}`);
  ok('повторённая секция лежит дважды', r.sectionBlocks > r.modelSections, `${r.sectionBlocks} vs ${r.modelSections}`);
  ok('в заголовке номер прохода', /1\/2/.test(r.heads[0]), r.heads[0]);
  ok('дорожка ритма развёрнута тоже', r.hits > 0, String(r.hits));

  console.log('\n=== 4. Указатель не откатывается назад на повторах ===');
  r = await p.evaluate(async () => {
    // Маленькая песня целиком из повторов: 3 прохода секции × 2 квадрата.
    const backup = JSON.parse(JSON.stringify(sections));
    sections.length = 1;
    sections[0].repeat = 3;
    sections[0].squares.length = 1;
    sections[0].squares[0].repeat = 2;
    render();
    await new Promise(r => setTimeout(r, 300));
    document.getElementById('bpmInput').value = 240;
    playAll();
    const vp = document.getElementById('timelineViewport');
    const offs = []; const keys = [];
    let stop = false;
    const tick = () => {
      if (stop) return;
      offs.push(vp.scrollLeft);
      const a = document.querySelector('.tl-cell.tl-active');
      if (a) {
        const k = `${a.dataset.sec}:${a.dataset.square}:${a.dataset.ei}:${a.dataset.secPass}:${a.dataset.sqPass}`;
        if (keys[keys.length - 1] !== k) keys.push(k);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    await new Promise(r => setTimeout(r, 13000));
    stop = true;
    stopPlayback();
    let back = 0, worst = 0;
    for (let i = 1; i < offs.length; i++) {
      const d = offs[i] - offs[i - 1];
      if (d < -0.5) { back++; worst = Math.min(worst, d); }
    }
    const passes = [...new Set(keys.map(k => k.split(':').slice(3).join('/')))];
    sections.length = 0; backup.forEach(x => sections.push(x));
    render();
    return { frames: offs.length, back, worst: Math.round(worst), visited: keys.length, passes };
  });
  console.log(`      кадров ${r.frames}, пройдено ячеек ${r.visited}, проходы: ${r.passes.join(', ')}`);
  ok('лента ни разу не откатилась', r.back === 0, `${r.back} откатов, худший ${r.worst}px`);
  ok('сыграны разные проходы повторов', r.passes.length >= 3, JSON.stringify(r.passes));

  console.log('\n=== 5. Транспорт в режиме ленты ===');
  await new Promise(r => setTimeout(r, 400));
  r = await p.evaluate(() => ({
    loop: getComputedStyle(document.getElementById('btnLoop')).display,
    stop: getComputedStyle(document.getElementById('btnStop')).display,
  }));
  ok('цикл скрыт', r.loop === 'none', r.loop);
  ok('стоп показан', r.stop !== 'none', r.stop);

  console.log('\n=== 6. Пауза сохраняет место, play продолжает ===');
  r = await p.evaluate(async () => {
    document.getElementById('bpmInput').value = 150;
    playAll();
    await new Promise(r => setTimeout(r, 3000));
    const playingBtn = document.getElementById('btnPlay').querySelector('i.ti').className;
    const at = { si: playbackState.currentSectionIndex, sqi: playbackState.currentSquareIndex };
    playAll(); // пауза
    await new Promise(r => setTimeout(r, 250));
    const paused = {
      btn: document.getElementById('btnPlay').querySelector('i.ti').className,
      playing: playbackState.isPlaying,
      saved: timelineStartPosition ? { ...timelineStartPosition } : null,
      stillMarked: !!document.querySelector('.tl-cell.tl-active'),
    };
    playAll(); // продолжение
    await new Promise(r => setTimeout(r, 300));
    const resumed = { playing: playbackState.isPlaying, si: playbackState.currentSectionIndex };
    stopPlayback();
    return { playingBtn, at, paused, resumed };
  });
  console.log(`      пауза на секции ${r.at.si}, продолжено с секции ${r.resumed.si}`);
  ok('во время игры значок ⏸ (ti-player-pause)', r.playingBtn === 'ti ti-player-pause', r.playingBtn);
  ok('пауза останавливает звук', r.paused.playing === false);
  ok('значок возвращается на ▶ (ti-player-play)', r.paused.btn === 'ti ti-player-play', r.paused.btn);
  ok('позиция запомнена', r.paused.saved !== null, JSON.stringify(r.paused.saved));
  ok('метка остаётся на паузе', r.paused.stillMarked);
  ok('продолжение играет', r.resumed.playing === true);
  ok('продолжено не с начала', r.resumed.si >= r.at.si, `${r.at.si} -> ${r.resumed.si}`);

  console.log('\n=== 7. Стоп отматывает в начало ===');
  r = await p.evaluate(async () => {
    document.getElementById('bpmInput').value = 200;
    playAll();
    await new Promise(r => setTimeout(r, 2500));
    const mid = document.getElementById('timelineViewport').scrollLeft;
    stopAndRewind();
    await new Promise(r => setTimeout(r, 300));
    const after = {
      playing: playbackState.isPlaying,
      scroll: document.getElementById('timelineViewport').scrollLeft,
      marked: !!document.querySelector('.tl-cell.tl-active'),
      saved: timelineStartPosition,
    };
    // Следующий play должен пойти с самого начала
    playAll();
    await new Promise(r => setTimeout(r, 250));
    const restarted = { si: playbackState.currentSectionIndex, sqi: playbackState.currentSquareIndex };
    stopPlayback();
    return { mid: Math.round(mid), after: { ...after, scroll: Math.round(after.scroll) }, restarted };
  });
  console.log(`      было ${r.mid}px, после стопа ${r.after.scroll}px`);
  ok('воспроизведение остановлено', r.after.playing === false);
  ok('лента отмотана в начало', r.after.scroll < 20, `${r.after.scroll}px`);
  ok('метка снята', r.after.marked === false);
  ok('точка продолжения сброшена', r.after.saved === null, JSON.stringify(r.after.saved));
  ok('следующий play — с начала песни', r.restarted.si === 0 && r.restarted.sqi === 0, JSON.stringify(r.restarted));

  console.log('\n=== 8. Свободная перемотка задаёт точку старта ===');
  r = await p.evaluate(async () => {
    const vp = document.getElementById('timelineViewport');
    vp.scrollLeft = Math.round((vp.scrollWidth - vp.clientWidth) * 0.45);
    await new Promise(r => setTimeout(r, 250));
    const found = findTimelineCellAtPlayhead();
    const saved = timelineStartPosition ? { ...timelineStartPosition } : null;
    const marked = document.querySelector('.tl-cell.tl-active');
    const markedKey = marked
      ? `${marked.dataset.sec}:${marked.dataset.square}:${marked.dataset.ei}:${marked.dataset.secPass}:${marked.dataset.sqPass}`
      : null;
    document.getElementById('bpmInput').value = 200;
    playAll();
    await new Promise(r => setTimeout(r, 200));
    const started = { si: playbackState.currentSectionIndex, sqi: playbackState.currentSquareIndex };
    stopPlayback();
    return { foundKey: found ? found.key : null, saved, markedKey, started };
  });
  console.log(`      под указателем ${r.foundKey}, старт с секции ${r.started.si}`);
  ok('ячейка под указателем найдена', r.foundKey !== null);
  ok('точка старта записана', r.saved !== null, JSON.stringify(r.saved));
  ok('метка встала под указатель', r.markedKey === r.foundKey, `${r.markedKey} vs ${r.foundKey}`);
  ok('play начал не с первой секции', r.started.si > 0, JSON.stringify(r.started));

  console.log('\n=== 9. Ритм крупнее ===');
  r = await p.evaluate(() => {
    const hit = document.querySelector('.tl-hit');
    const strum = document.querySelector('.transport-bar .strum-step');
    return {
      hit: hit ? parseFloat(getComputedStyle(hit).fontSize) : 0,
      row: parseFloat(getComputedStyle(document.getElementById('timelineRhythm')).height),
      colored: !!document.querySelector('.tl-hit.down') && !!document.querySelector('.tl-hit.up'),
    };
  });
  console.log(`      кегль удара ${r.hit}px, высота дорожки ${r.row}px`);
  ok('удары набраны 20px (как в транспортной строке)', r.hit === 20, `${r.hit}px`);
  ok('дорожка вмещает крупные стрелки', r.row >= 44, `${r.row}px`);
  ok('направления различаются цветом', r.colored);

  console.log('\n=== 10. Консоль чистая ===');
  const noisy = consoleLogs.filter(l => !l.startsWith('warning') && !l.startsWith('error'));
  console.log(`      сообщений всего ${consoleLogs.length}, информационных ${noisy.length}`);
  ok('нет отладочных логов', noisy.length === 0, JSON.stringify(noisy.slice(0, 4)));

  console.log('\n=== 11. Возврат в редактор восстанавливает транспорт ===');
  r = await p.evaluate(() => {
    toggleTimelineMode(false);
    return {
      loop: getComputedStyle(document.getElementById('btnLoop')).display,
      stop: getComputedStyle(document.getElementById('btnStop')).display,
      play: document.getElementById('btnPlay').querySelector('i.ti').className,
      saved: timelineStartPosition,
      wrappers: document.querySelectorAll('.chord-wrapper').length,
    };
  });
  ok('цикл снова виден', r.loop !== 'none', r.loop);
  ok('стоп снова скрыт', r.stop === 'none', r.stop);
  ok('значок play на месте (ti-player-play)', r.play === 'ti ti-player-play', r.play);
  ok('точка старта сброшена', r.saved === null, JSON.stringify(r.saved));
  ok('разметка редактора цела', r.wrappers > 0, String(r.wrappers));

  console.log(bad ? `\nПРОВАЛОВ: ${bad}` : '\nвсё зелено');
  await b.close(); process.exit(bad ? 1 : 0);
})();
