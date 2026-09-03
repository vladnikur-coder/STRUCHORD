// B-34: тултип аппликатуры при зуме (Safari, трекпадный щипок/Page Zoom).
// Регрессии по трём пунктам спеки:
//  (а) tooltipViewportMetrics: начало координат — из бокса <html>
//      (один конвейер координат с rect ячейки), размер — clientWidth/Height;
//  (б) gesturestart/gesturechange/gestureend инвалидируют кэш ректов
//      ячеек и пересчитывают ОТКРЫТЫЙ тултип;
//  (в) мягкие клэмпы: окно меньше тултипа — позиция якорная (над
//      ячейкой), а не грудой у левого верхнего угла; при большом окне
//      (scale=1) — бит-в-бит прежнее.
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

  // Песня с аккордами — как в ui-test-fingering (для секции 4).
  const song = {
    schemaVersion: 2, name: 'B-34', bpm: 100,
    globalKey: 'C', keyMode: 'manual', globalTimeSig: '4/4', notes: '',
    sections: [
      { id: 1, type: 'Verse', customName: null, key: null, shift: null, timeSig: null, bpm: null, repeat: 1, strumPattern: null,
        squares: [{ id: 2, repeat: 1, customBeats: null, strumPattern: null, events: [
          { chord: 'Am', span: 2, timeSig: null, strumPattern: null },
          { chord: 'F',  span: 2, timeSig: null, strumPattern: null },
        ]}]},
    ],
    nextId: 10, userFingerings: [], preferredFingerings: [], date: '',
  };
  w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
  w.loadSong(0);
  await sleep(300); // render планируется через rAF — даём DOM построиться

  console.log('=== 1. Метрики: окно = layout-вьюпорт (0,0,clientW/H) ===');
  {
    const de = d.documentElement;
    // Имитируем прокрученную страницу: у корневого элемента rect.top =
    // −scrollY. Гипотеза B-34-«а» брала отсюда начало координат — живой
    // замер показал spaceTop→∞ и тултип за экраном. Начало обязано
    // оставаться (0,0): тултип position:fixed, живёт в layout-вьюпорте.
    const origRect = de.getBoundingClientRect.bind(de);
    de.getBoundingClientRect = () => ({ left: 0, top: -317, width: 480, height: 200, right: 480, bottom: -117, x: 0, y: -317 });
    Object.defineProperty(de, 'clientWidth', { get: () => 480, configurable: true });
    Object.defineProperty(de, 'clientHeight', { get: () => 200, configurable: true });
    const m = w.eval('tooltipViewportMetrics()');
    ok('начало (0,0) даже при «уехавшем» боксе <html>', m.visLeft === 0 && m.visTop === 0, JSON.stringify(m));
    ok('размер из clientWidth/Height', m.visW === 480 && m.visH === 200, JSON.stringify(m));
    de.getBoundingClientRect = origRect;
  }

  console.log('=== 2. Мягкие клэмпы: окно меньше тултипа — якорь, а не угол ===');
  {
    const de = d.documentElement;
    const origRect = de.getBoundingClientRect.bind(de);
    de.getBoundingClientRect = () => ({ left: 0, top: 0, width: 480, height: 200, right: 480, bottom: 200, x: 0, y: 0 });
    Object.defineProperty(de, 'clientWidth', { get: () => 480, configurable: true });
    Object.defineProperty(de, 'clientHeight', { get: () => 200, configurable: true });
    let tip = d.getElementById('fingering-tooltip');
    if (!tip) { tip = d.createElement('div'); tip.id = 'fingering-tooltip'; d.body.appendChild(tip); }
    tip.style.display = 'block';
    // Широкая ячейка с сильным зумом наполовину за окном, окно низкое:
    // раньше все ветки проваливались в «центр окна» + клэмпы → (130,12),
    // груда у верхней кромки. Теперь — якорь над ячейкой.
    w.__fake = { getBoundingClientRect: () => ({ left: 30, top: 150, width: 520, height: 40, right: 550, bottom: 190 }) };
    w.eval('positionMainTooltip(window.__fake)');
    // jsdom без раскладки: offsetWidth/Height = 0 → tw/th = 220/220.
    // Якорь: left = 30 + 520/2 − 110 = 180; top = 150 − 220 − 12 = −82.
    ok('тултип по центру ячейки (left=180)', tip.style.left === '180px', tip.style.left);
    ok('тултип над ячейкой, не прижат к кромке (top=-82)', tip.style.top === '-82px', tip.style.top);
    de.getBoundingClientRect = origRect;
  }

  console.log('=== 3. Большое окно (scale=1) — бит-в-бит прежнее ===');
  {
    const de = d.documentElement;
    const origRect = de.getBoundingClientRect.bind(de);
    de.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 700, right: 1000, bottom: 700, x: 0, y: 0 });
    Object.defineProperty(de, 'clientWidth', { get: () => 1000, configurable: true });
    Object.defineProperty(de, 'clientHeight', { get: () => 700, configurable: true });
    const tip = d.getElementById('fingering-tooltip');
    w.__fake = { getBoundingClientRect: () => ({ left: 100, top: 300, width: 80, height: 40, right: 180, bottom: 340 }) };
    w.eval('positionMainTooltip(window.__fake)');
    // spaceTop = 300−232 = 68 ≥ 0 → «над ячейкой»: left = 100+40−110 = 30.
    ok('ветка «над ячейкой» прежняя (left=30)', tip.style.left === '30px', tip.style.left);
    ok('top = 300−220−12 = 68', tip.style.top === '68px', tip.style.top);
    de.getBoundingClientRect = origRect;
  }

  console.log('=== 4. gesture*: кэш ректов инвалидируется, тултип пересчитывается ===');
  {
    // Открываем тултип наведением на реальную ячейку с аккордом.
    const cb = d.getElementById('showFingering');
    if (cb && !cb.checked) cb.checked = true;
    const wrapper = d.querySelector('.chord-wrapper .chord-input')
      ? d.querySelector('.chord-wrapper') : null;
    ok('ячейка с аккордом найдена', !!wrapper);
    if (wrapper) {
      const input = wrapper.querySelector('.chord-input');
      input.value = input.value || 'Am';
      wrapper.dispatchEvent(new w.MouseEvent('mouseover', { bubbles: true }));
      const tip = d.getElementById('fingering-tooltip');
      await sleep(60);
      ok('тултип открыт наведением', !!tip && tip.style.display === 'block');

      // Кэш строим движением мыши — флаг чист.
      d.dispatchEvent(new w.MouseEvent('mousemove', { bubbles: true, clientX: 5, clientY: 5 }));
      await sleep(30);
      ok('кэш ректов чист до жеста', w.eval('chordWrapperRectsDirty') === false);

      // Шпион на репозицию открытого тултипа.
      const orig = w.positionMainTooltip;
      let calls = 0;
      w.positionMainTooltip = (x) => { calls++; return orig(x); };
      d.dispatchEvent(new w.Event('gesturechange'));
      await sleep(80);
      ok('gesturechange пометил кэш устаревшим', w.eval('chordWrapperRectsDirty') === true);
      ok('открытый тултип пересчитан (reposition)', calls > 0, String(calls));
      d.dispatchEvent(new w.Event('gesturestart'));
      d.dispatchEvent(new w.Event('gestureend'));
      await sleep(80);
      ok('gesturestart/gestureend тоже подхвачены (кэш снова dirty)', w.eval('chordWrapperRectsDirty') === true);
      w.positionMainTooltip = orig;
    }
  }

  console.log('=== 5. Собственный зум (setSquareZoom) инвалидирует кэш ===');
  {
    d.dispatchEvent(new w.MouseEvent('mousemove', { bubbles: true, clientX: 5, clientY: 5 }));
    await sleep(30);
    ok('кэш чист до зума', w.eval('chordWrapperRectsDirty') === false);
    w.eval('setSquareZoom(2.2, true)');
    ok('после setSquareZoom кэш устарел', w.eval('chordWrapperRectsDirty') === true);
    w.eval('setSquareZoom(1, true)');
  }

  console.log(bad ? `FAIL: ${bad}` : 'ALL OK');
  w.close();
  process.exit(bad ? 1 : 0);
});
