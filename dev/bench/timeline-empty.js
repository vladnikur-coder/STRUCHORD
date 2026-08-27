// Пустая песня в режиме ленты: «Пока здесь пусто» + кнопка «В редактор».
//
// Раньше вход в ленту с пустой песней показывал мёртвые (is-empty)
// панели и пустую ленту — режим выглядел сломанным. Теперь в центре
// полосы висит подсказка с выходом обратно.
//
// Проверяем:
//   1. пустая песня → в ленте видна подсказка и кнопка;
//   2. панели «Сейчас/Дальше» при этом погашены;
//   3. клик по «В редактор» возвращает в режим редактирования;
//   4. песня с аккордами → подсказки нет;
//   5. секция только с паузами (события без аккорда) — это тоже
//      пусто: ленте играть нечего, подсказка на месте.
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
  await p.goto('file:///home/user/STRUCHORD.html', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await new Promise((r) => setTimeout(r, 1000));

  console.log('=== 1. Пустая песня: подсказка на месте ===');
  await p.evaluate(() => {
    sections = [];
    render();
    toggleTimelineMode(true);
  });
  await new Promise((r) => setTimeout(r, 300));
  const empty1 = await p.evaluate(() => {
    const el = document.getElementById('tlEmpty');
    const cs = getComputedStyle(el);
    return {
      hidden: el.hidden,
      display: cs.display,
      text: el.querySelector('.tl-empty-text').textContent,
      btn: el.querySelector('.tl-empty-btn').textContent.trim(),
      icon: el.querySelector('.tl-empty-btn i').className,
      inTimeline: timelineMode === true,
    };
  });
  ok('подсказка показана', empty1.hidden === false && empty1.display === 'flex', JSON.stringify(empty1));
  ok('текст «Пока здесь пусто»', empty1.text === 'Пока здесь пусто', empty1.text);
  ok('кнопка «В редактор»', empty1.btn === 'В редактор', empty1.btn);
  ok('иконка из сабсета (arrow-back-up)', empty1.icon === 'ti ti-arrow-back-up', empty1.icon);

  console.log('\n=== 2. Панели при этом погашены ===');
  const panels = await p.evaluate(() => ({
    now: document.getElementById('tlPanelNow').classList.contains('is-empty'),
    next: document.getElementById('tlPanelNext').classList.contains('is-empty'),
  }));
  ok('обе панели is-empty', panels.now && panels.next, JSON.stringify(panels));

  console.log('\n=== 3. Кнопка возвращает в редактор ===');
  await p.click('.tl-empty-btn');
  await new Promise((r) => setTimeout(r, 300));
  const back = await p.evaluate(() => ({
    timeline: timelineMode,
    body: document.body.classList.contains('is-timeline'),
    stageShown: getComputedStyle(document.querySelector('.sections')).display !== 'none',
  }));
  ok('режим выключен', back.timeline === false && !back.body, JSON.stringify(back));
  ok('виден редактор', back.stageShown);

  console.log('\n=== 4. Песня с аккордами: подсказки нет ===');
  await p.evaluate(() => {
    sections = [{
      id: 1, type: 'Verse', repeat: 1,
      squares: [{ id: 1, repeat: 1, events: [{ chord: 'Am', span: 4 }, { chord: 'G', span: 4 }] }],
    }];
    nextId = 99;
    render();
    toggleTimelineMode(true);
  });
  await new Promise((r) => setTimeout(r, 300));
  const filled = await p.evaluate(() => ({
    hidden: document.getElementById('tlEmpty').hidden,
    display: getComputedStyle(document.getElementById('tlEmpty')).display,
  }));
  ok('подсказка скрыта', filled.hidden === true && filled.display === 'none', JSON.stringify(filled));

  console.log('\n=== 5. Только паузы — это тоже пусто ===');
  await p.evaluate(() => {
    toggleTimelineMode(false);
    sections = [{
      id: 1, type: 'Verse', repeat: 1,
      squares: [{ id: 1, repeat: 1, events: [{ chord: '', span: 4 }, { chord: '   ', span: 4 }] }],
    }];
    render();
    toggleTimelineMode(true);
  });
  await new Promise((r) => setTimeout(r, 300));
  const rests = await p.evaluate(() => document.getElementById('tlEmpty').hidden === false);
  ok('подсказка показана для событий без аккордов', rests);

  await p.evaluate(() => { toggleTimelineMode(false); sections = []; render(); });
  ok('страница без JS-ошибок', errs.length === 0, errs.slice(0, 2).join(' | '));
  await b.close();
  console.log(bad ? `\nПРОВАЛОВ: ${bad}` : '\nвсе проверки пройдены');
  process.exitCode = bad ? 1 : 0;
})();
