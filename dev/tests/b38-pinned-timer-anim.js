// B-38 (0.154): (1) кругляшок «до смены аккорда» в превью закреплённого
// ряда — как tl-next-timer в ленте: полный в начале аккорда, пустой к
// смене, питается cellStart/cellDur планировщика; (2) смена аппликатуры
// в карточке и превью — уезд влево + приезд справа (не скачком), тот же
// аккорд перерисовывается тихо.
const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://localhost/',
  beforeParse(win) {
    win.HTMLCanvasElement.prototype.getContext = () => ({
      font: '', measureText: () => ({ width: 10 }),
      clearRect(){}, beginPath(){}, arc(){}, fill(){}, stroke(){}, moveTo(){},
      lineTo(){}, closePath(){}, save(){}, restore(){}, translate(){}, rotate(){},
      fillText(){}, strokeText(){}, setTransform(){}, scale(){},
      createLinearGradient: () => ({ addColorStop(){} }),
    });
  },
});
const w = dom.window;
w.AudioContext = w.webkitAudioContext = function () {
  return { currentTime: 0, state: 'running', resume() {} };
};
let bad = 0;
const ok = (n, c, x) => { console.log(`   ${c ? 'ok  ' : 'FAIL'} ${n}${!c && x ? ' — ' + x : ''}`); if (!c) bad++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

w.addEventListener('load', async () => {
  const d = w.document;
  const song = {
    schemaVersion: 2, name: 'B-38', bpm: 100,
    globalKey: 'C', keyMode: 'manual', globalTimeSig: '4/4', notes: '',
    sections: [
      { id: 1, type: 'Verse', customName: null, key: null, shift: null, timeSig: null, bpm: null, repeat: 1, strumPattern: null,
        squares: [
          { id: 2, repeat: 1, customBeats: null, strumPattern: null, events: [
            { chord: 'Am', span: 4, timeSig: null, strumPattern: null }] },
          { id: 3, repeat: 1, customBeats: null, strumPattern: null, events: [
            { chord: 'F', span: 4, timeSig: null, strumPattern: null }] },
        ]},
      { id: 4, type: 'Chorus', customName: null, key: null, shift: null, timeSig: null, bpm: null, repeat: 1, strumPattern: null,
        squares: [
          { id: 5, repeat: 1, customBeats: null, strumPattern: null, events: [
            { chord: 'C', span: 4, timeSig: null, strumPattern: null }] },
          { id: 6, repeat: 1, customBeats: null, strumPattern: null, events: [
            { chord: 'G', span: 4, timeSig: null, strumPattern: null }] },
        ]},
    ],
    nextId: 10, userFingerings: [], preferredFingerings: [], date: '',
  };
  w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
  w.loadSong(0);
  await sleep(300);

  const rowName = () =>
    ((d.querySelector('#pinnedFingering .fingering-chord-name') || {}).textContent || '').trim();
  const nextName = () =>
    ((d.querySelector('#pinnedNext .fingering-chord-name') || {}).textContent || '').trim();
  const pinCls = (l) => l.includes('pin-fade-out') || l.includes('pin-fade-in');
  const cardClasses = () => [...d.querySelector('#pinnedFingering .fingering-content').classList];
  const nextClasses = () => [...d.querySelector('#pinnedNext .fingering-content').classList];
  const timerVar = () =>
    d.getElementById('pinnedNextTimer').style.getPropertyValue('--pinned-next-progress');
  const pinCell = (sel) => w.eval(`
    currentTooltipWrapper = document.querySelector('${sel}');
    lastTooltipWrapper = currentTooltipWrapper;
    document.getElementById('fingering-tooltip').dataset.currentShape = 'x,0,2,2,1,0';
    pinFingeringFromTooltip();
  `);
  const shapeF = ['x', 0, 2, 2, 1, 0];

  console.log('=== 1. Разметка и CSS-контракт ===');
  ok('кругляшок лежит внутри превью', !!d.querySelector('#pinnedNext > #pinnedNextTimer'));
  const css = [...d.styleSheets].flatMap((s) => {
    try { return [...s.cssRules].map((r) => r.cssText); } catch (e) { return []; }
  }).join('\n');
  ok('CSS: conic-gradient по --pinned-next-progress',
    css.includes('.pinned-next-timer') && css.includes('--pinned-next-progress') &&
    css.includes('conic-gradient'));
  ok('CSS: ключевые кадры уезда/приезда',
    css.includes('struchord-pin-out') && css.includes('struchord-pin-in'));
  const nextRule = (css.match(/(^|\n)\.pinned-next\s*\{[^}]*\}/) || [''])[0];
  ok('CSS: превью — матовое стекло (backdrop-filter, Safari-префикс)',
    /-webkit-backdrop-filter/.test(nextRule) && /backdrop-filter\s*:\s*blur/.test(nextRule),
    nextRule.slice(0, 120));
  ok('CSS: полупрозрачность элемента убрана (было opacity 0.75)',
    !/opacity\s*:\s*0?\.75/.test(nextRule));

  console.log('=== 2. Первый показ карточки — приезд справа, без уезда ===');
  pinCell('.chord-wrapper[data-sec="1"][data-square="2"][data-ei="0"]');
  ok('карточка сразу показывает Am', rowName().includes('Am'), rowName());
  ok('класс приезда в момент показа', cardClasses().includes('pin-fade-in'));
  ok('класса уезда нет', !cardClasses().includes('pin-fade-out'));
  await sleep(300);
  ok('pin-классы убраны после приезда', !pinCls(cardClasses()), cardClasses().join(','));

  console.log('=== 3. Смена аккорда: уезд влево, потом приезд справа ===');
  w.eval(`renderPinnedFingering('F', ${JSON.stringify(shapeF)})`);
  ok('в момент смены ещё старый (Am)', rowName().includes('Am'), rowName());
  ok('класс уезда на середине', cardClasses().includes('pin-fade-out'));
  await sleep(180);
  ok('после уезда — новый (F)', rowName().includes('F'), rowName());
  ok('приезжает справа (pin-fade-in)', cardClasses().includes('pin-fade-in'));
  await sleep(300);
  ok('pin-классы чисты', !pinCls(cardClasses()), cardClasses().join(','));
  console.log('=== 3b. Тот же аккорд — тихо, без анимации ===');
  w.eval(`renderPinnedFingering('F', ${JSON.stringify(shapeF)})`);
  ok('контент обновлён немедленно', rowName().includes('F'));
  ok('без класса уезда', !cardClasses().includes('pin-fade-out'));

  console.log('=== 4. Кругляшок: прогресс ячейки ===');
  w.eval(`playbackState.isPlaying = true; playbackState.cellStart = -1; playbackState.cellDur = 4`);
  w.eval(`renderPinnedNext({ secId: 1, squareId: 3, eventIndex: 0, chord: 'F' })`);
  await sleep(50);   // RAF-цикл успел прочитать клетку
  ok('превью видно', d.getElementById('pinnedNext').style.display === 'block');
  ok('четверть прошла → 0.25', timerVar() === '0.2500', timerVar());
  w.eval('playbackState.cellStart = -10');
  w.eval('updatePinnedNextTimer()');
  ok('перехлёст клампится сверху → 1.0', timerVar() === '1.0000', timerVar());
  w.eval('playbackState.cellStart = 2');
  w.eval('updatePinnedNextTimer()');
  ok('забегание вперёд клампится снизу → 0.0', timerVar() === '0.0000', timerVar());

  console.log('=== 5. Смена в превью — той же анимацией ===');
  w.eval(`renderPinnedNext({ secId: 4, squareId: 5, eventIndex: 0, chord: 'C' })`);
  ok('в момент смены ещё старый (F)', nextName().includes('F'), nextName());
  ok('класс уезда на превью', nextClasses().includes('pin-fade-out'));
  await sleep(180);
  ok('приехал C', nextName().includes('C'), nextName());

  console.log('=== 6. Стоп: превью гаснет, кругляшок обнулён, RAF остановлен ===');
  w.eval('playbackState.isPlaying = false; restorePinnedFingering()');
  ok('превью скрыто', d.getElementById('pinnedNext').style.display === 'none');
  ok('прогресс снят', timerVar() === '', JSON.stringify(timerVar()));
  await sleep(50);
  ok('RAF-цикл остановлен', w.eval('pinnedTimerRAF') === 0);
  await sleep(250);   // возврат закреплённого аккорда — тоже свап
  ok('карточка вернула закреплённый Am', rowName().includes('Am'), rowName());

  console.log('=== 7. 0.165: дрожание струн В РЕДАКТОРЕ (тултип + закреп) ===');
  {
    // Сценарий 1: БЕЗ закрепа — текущий аккорд показывает тултип.
    w.eval('unpinFingering()');
    await sleep(420);
    w.eval(`showFingeringTooltip('Am',
      document.querySelector('.chord-wrapper[data-sec="1"][data-square="2"][data-ei="0"]'), false)`);
    await sleep(300);   // приезд контента
    w.eval('playbackState.isPlaying = true');
    w.eval(`vibrateFingeringStrings({ currentTime: 0 }, [1], 0, 0.5, 0)`);
    await sleep(40);
    const tipStr = d.querySelector('#fingering-tooltip .fing-string[data-string="1"]');
    ok('струна дрожит в тултипе у играющей ячейки (без закрепа)',
      tipStr && tipStr.classList.contains('is-vibrating'));
    await sleep(300);
    // Сценарий 2: С закрепом — тултип скрыт, текущий аккорд в карточке.
    pinCell('.chord-wrapper[data-sec="1"][data-square="2"][data-ei="0"]');
    await sleep(500);   // появление ряда
    w.eval(`vibrateFingeringStrings({ currentTime: 0 }, [2], 0, 0.5, 0)`);
    await sleep(40);
    const pinStr = d.querySelector('#pinnedFingering .fing-string[data-string="2"]');
    ok('струна дрожит и в закреплённой карточке (с закрепом)',
      pinStr && pinStr.classList.contains('is-vibrating'));
    w.eval(`renderPinnedNext({ secId: 1, squareId: 3, eventIndex: 0, chord: 'F' })`);
    const prevStr = d.querySelector('#pinnedNext .fing-string[data-string="1"]');
    ok('превью «Дальше» НЕ дрожит (ещё не звучит)',
      !prevStr || !prevStr.classList.contains('is-vibrating'));
    await sleep(350);   // life = 260мс
    ok('дрожание само снялось', !d.querySelector('.fing-string.is-vibrating'));
    w.eval('playbackState.isPlaying = false');
    w.eval(`vibrateFingeringStrings({ currentTime: 0 }, [1], 0, 0.5, 0)`);
    await sleep(40);
    ok('в покое дрожания нет', !d.querySelector('.fing-string.is-vibrating'));
    w.eval('playbackState.isPlaying = true');
    w.eval(`vibrateFingeringStrings({ currentTime: 0 }, [0], 0, 0.5, 0)`);
    await sleep(40);
    ok('дрожит снова', !!d.querySelector('.fing-string.is-vibrating'));
    w.eval('clearFingeringVibration()');
    ok('clearFingeringVibration гасит всё и сразу', !d.querySelector('.fing-string.is-vibrating'));
    w.eval('playbackState.isPlaying = false');
    // 0.166: в редакторе анимация приглушена (амплитуда 0.55, подсветка 1.8)
    ok('CSS: амплитуда через --vib-amp, редактор = 0.55',
      /--vib-amp:\s*0\.55/.test(css) && /var\(--vib-amp, 1\) \* 1\.2px/.test(css));
    ok('CSS: в редакторе подсветка тоньше (1.8 против 2.2)',
      /body:not\(\.is-timeline\) \.fing-string\.is-vibrating\s*\{[^}]*1\.8/.test(css));
  }

  console.log(bad ? `FAIL: ${bad}` : 'ALL OK');
  process.exit(bad ? 1 : 0);
});
