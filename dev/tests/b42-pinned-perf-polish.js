// B-42 (0.156): закреп — производительность и полировка.
// 1) Перф: ховер того же аккорда не рендерит заново; updatePinnedShift не
//    пишет одинаковое значение; кругляшок пишет переменную только при
//    заметном изменении.
// 2) Переплывание: закрепление (is-appearing c blur) и открепление
//    (is-dissolving, display:none ПОСЛЕ анимации; перезакрепление в этот
//    интервал отменяет растворение).
// 3) Вид: масштаб --pinned-scale на ряду; карточка светлее поверхности
//    (color-mix с белым) + рамка + переходы темы.
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
    schemaVersion: 2, name: 'B-42', bpm: 100,
    globalKey: 'C', keyMode: 'manual', globalTimeSig: '4/4', notes: '',
    sections: [
      { id: 1, type: 'Verse', customName: null, key: null, shift: null, timeSig: null, bpm: null, repeat: 1, strumPattern: null,
        squares: [
          { id: 2, repeat: 1, customBeats: null, strumPattern: null, events: [
            { chord: 'Am', span: 4, timeSig: null, strumPattern: null }] },
          { id: 3, repeat: 1, customBeats: null, strumPattern: null, events: [
            { chord: 'F', span: 4, timeSig: null, strumPattern: null }] },
        ]},
    ],
    nextId: 10, userFingerings: [], preferredFingerings: [], date: '',
  };
  w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
  w.loadSong(0);
  await sleep(300);

  const css = [...d.styleSheets].flatMap((s) => {
    try { return [...s.cssRules].map((r) => r.cssText); } catch (e) { return []; }
  }).join('\n');
  const rowEl = () => d.getElementById('pinnedRow');
  const pinCell = (sel) => w.eval(`
    currentTooltipWrapper = document.querySelector('${sel}');
    lastTooltipWrapper = currentTooltipWrapper;
    document.getElementById('fingering-tooltip').dataset.currentShape = 'x,0,2,2,1,0';
    pinFingeringFromTooltip();
  `);
  const hover = (sel) =>
    d.querySelector(sel).dispatchEvent(new w.MouseEvent('mouseover', { bubbles: true }));

  console.log('=== 1. CSS-контракт: стекло, без transform, без transition ===');
  const rowRule = (css.match(/\.pinned-row\s*\{[^}]*\}/) || [''])[0];
  ok('ряд без --pinned-scale и без transform',
    !/--pinned-scale/.test(rowRule) && !/transform\s*:/.test(rowRule), rowRule.slice(0, 140));
  const cardRule = (css.match(/\.pinned-fingering\s*\{[^}]*\}/) || [''])[0];
  ok('карточка — ОБЫЧНЫЙ цвет: поверхность, без стекла и подмесок',
    /background:\s*var\(--color-surface\)/.test(cardRule) &&
    !/backdrop-filter/.test(cardRule) && !/color-mix/.test(cardRule),
    cardRule.slice(0, 140));
  ok('карточка без transform (раскладка честная)', !/transform\s*:/.test(cardRule));
  ok('карточка без transition темы (артефакты WebKit)', !/transition\s*:/.test(cardRule));
  const nextRule = (css.match(/(^|\n)\.pinned-next\s*\{[^}]*\}/) || [''])[0];
  ok('превью — стекло 55% + blur 10px, без transform и transition',
    /55%, transparent/.test(nextRule) && /blur\(10px\)/.test(nextRule) &&
    !/transform\s*:/.test(nextRule) && !/transition\s*:/.test(nextRule));
  ok('переплывание анимирует КАРТОЧКИ, а не ряд (WebKit backdrop)',
    /\.pinned-row\.is-appearing \.pinned-fingering/.test(css) &&
    /\.pinned-row\.is-dissolving \.pinned-next/.test(css) &&
    !/\.pinned-row\.is-appearing\s*\{[^}]*animation/.test(css));
  ok('переплывание ярче: blur 14px, подъём 16px',
    /struchord-pin-in-card/.test(css) && /struchord-pin-out-card/.test(css) &&
    /blur\(14px\)/.test(css) && /translateY\(-16px\)/.test(css));
  ok('длительности 0.42/0.34 синхронизированы с JS',
    /0\.42s/.test(css) && /0\.34s/.test(css));
  const prevTipRule = (css.match(/(^|\n)#preview-tooltip\s*\{[^}]*\}/) || [''])[0];
  ok('всплывающее превью — такое же стекло (55% + blur + пунктир)',
    /55%, transparent/.test(prevTipRule) && /blur\(10px\)/.test(prevTipRule) &&
    /2px dashed/.test(prevTipRule), prevTipRule.slice(0, 100));
  const prevStyle = d.getElementById('preview-tooltip').getAttribute('style');
  ok('у превью-тултипа нет инлайн-фона/непрозрачности',
    !/background/.test(prevStyle) && !/opacity/.test(prevStyle), prevStyle);
  ok('reduced-motion гасит анимации ряда', /prefers-reduced-motion/.test(css));

  console.log('=== 2. Переплывание: закрепление ===');
  pinCell('.chord-wrapper[data-sec="1"][data-square="2"][data-ei="0"]');
  ok('ряд показан', rowEl().style.display === 'flex');
  ok('класс появления повешен', rowEl().classList.contains('is-appearing'));
  ok('таймер появления живёт на элементе', !!rowEl().__appearingTimer);
  const cardSvg = d.querySelector('#pinnedFingering svg');
  ok('SVG карточки БЕЗ внутренней плашки',
    cardSvg && ![...cardSvg.children].some((c) => c.getAttribute('fill') === 'var(--color-surface)'),
    cardSvg && cardSvg.innerHTML.slice(0, 80));
  const anySvg = w.eval(`renderFingeringSVG('x,0,2,2,1,0')`);
  ok('плашка отсутствует ГЛОБАЛЬНО (любой рендер грифа)',
    !anySvg.includes('var(--color-surface)'),
    anySvg.slice(0, 120));
  ok('SVG карточки крупнее базы (атрибуты ×1.08)',
    cardSvg && +cardSvg.getAttribute('width') > 124 && +cardSvg.getAttribute('height') > 174,
    cardSvg && cardSvg.getAttribute('width') + '×' + cardSvg.getAttribute('height'));
  ok('viewBox прежний (пропорции честные)',
    cardSvg && cardSvg.getAttribute('viewBox').split(' ').slice(2).map(Number).reduce((a, b) => a + b, 0) > 0);

  console.log('=== 3. Перф: тот же аккорл при ховере — ноль рендеров ===');
  hover('.chord-wrapper[data-sec="1"][data-square="3"][data-ei="0"] .chord-input');
  await sleep(250);
  const renders = w.eval(`(() => {
    const orig = renderPinnedFingering;
    let n = 0;
    renderPinnedFingering = (...a) => { n++; return orig(...a); };
    window.__renderCount = () => n;
    return n;
  })()`);
  hover('.chord-wrapper[data-sec="1"][data-square="3"][data-ei="0"] .chord-input');
  await sleep(80);
  ok('повторный ховер того же аккорда — без рендера', w.eval('window.__renderCount()') === renders,
    `${renders} → ${w.eval('window.__renderCount()')}`);
  hover('.chord-wrapper[data-sec="1"][data-square="2"][data-ei="0"] .chord-input');
  await sleep(80);
  ok('ховер ДРУГОГО аккорда — рендер случился', w.eval('window.__renderCount()') > renders);
  await sleep(250);

  console.log('=== 4. Перф: updatePinnedShift не пишет одинаковое ===');
  const writes = w.eval(`(() => {
    const grid = document.getElementById('sectionsContainer');
    const sp = grid.style.setProperty.bind(grid.style);
    let n = 0;
    grid.style.setProperty = (k, v) => { n++; return sp(k, v); };
    window.__shiftWrites = () => n;
    updatePinnedShift();
    return n;
  })()`);
  w.eval('updatePinnedShift()');
  w.eval('updatePinnedShift()');
  ok('два повторных вызова — ноль записей', w.eval('window.__shiftWrites()') === writes,
    `${writes} → ${w.eval('window.__shiftWrites()')}`);

  console.log('=== 5. Перф: кругляшок пишет только при изменении ===');
  w.eval(`playbackState.isPlaying = true; playbackState.cellStart = -1; playbackState.cellDur = 4`);
  w.eval(`renderPinnedNext({ secId: 1, squareId: 3, eventIndex: 0, chord: 'F' })`);
  await sleep(80);
  const tw = w.eval(`(() => {
    const el = document.getElementById('pinnedNextTimer');
    const sp = el.style.setProperty.bind(el.style);
    let n = 0;
    el.style.setProperty = (k, v) => { n++; return sp(k, v); };
    window.__timerWrites = () => n;
    updatePinnedNextTimer();
    return n;
  })()`);
  w.eval('updatePinnedNextTimer()');
  w.eval('updatePinnedNextTimer()');
  ok('тот же прогресс — ноль записей', w.eval('window.__timerWrites()') === tw,
    `${tw} → ${w.eval('window.__timerWrites()')}`);
  w.eval('playbackState.cellStart = -2; updatePinnedNextTimer()');
  ok('заметный сдвиг — запись прошла', w.eval('window.__timerWrites()') > tw);

  console.log('=== 6. Переплывание: открепление и перезакрепление ===');
  w.eval('playbackState.isPlaying = false; restorePinnedFingering()');
  await sleep(250);
  w.eval('unpinFingering()');
  ok('растворение началось', rowEl().classList.contains('is-dissolving'));
  ok('таймер появления погашен при откреплении', !rowEl().__appearingTimer);
  ok('ряд ещё виден (display не none)', rowEl().style.display !== 'none');
  // перезакрепление СРАЗУ — отменяет растворение
  pinCell('.chord-wrapper[data-sec="1"][data-square="2"][data-ei="0"]');
  ok('быстрое перезакрепление отменило растворение',
    !rowEl().classList.contains('is-dissolving') && rowEl().style.display === 'flex');
  // теперь до конца
  await sleep(350);
  w.eval('unpinFingering()');
  await sleep(420);
  ok('ряд скрыт после растворения', rowEl().style.display === 'none');
  ok('таймер растворения погашен', !rowEl().__dissolveTimer);

  console.log(bad ? `FAIL: ${bad}` : 'ALL OK');
  process.exit(bad ? 1 : 0);
});
