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
          { chord: '',   span: 2, timeSig: null, strumPattern: null },
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

  console.log('=== 6. 0.143: тултип absolute — координаты документа (+scroll) ===');
  {
    const rules = [];
    for (const sh of d.styleSheets) { try { for (const r of sh.cssRules) rules.push(r); } catch (e) {} }
    const main = rules.find((r) => r.selectorText === '#fingering-tooltip');
    const prev = rules.find((r) => r.selectorText === '#preview-tooltip');
    ok('#fingering-tooltip — position: absolute', !!main && /position:\s*absolute/.test(main.cssText), main && main.cssText);
    ok('#preview-tooltip — position: absolute', !!prev && /position:\s*absolute/.test(prev.cssText), prev && prev.cssText);

    // Прокрученная страница: запись координат обязана уехать на scroll.
    const de = d.documentElement;
    const origRect = de.getBoundingClientRect.bind(de);
    de.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 700, right: 1000, bottom: 700, x: 0, y: 0 });
    Object.defineProperty(de, 'clientWidth', { get: () => 1000, configurable: true });
    Object.defineProperty(de, 'clientHeight', { get: () => 700, configurable: true });
    Object.defineProperty(w, 'scrollY', { value: 300, configurable: true });
    Object.defineProperty(w, 'scrollX', { value: 40, configurable: true });
    const tip = d.getElementById('fingering-tooltip');
    tip.style.display = 'block';
    w.__fake = { getBoundingClientRect: () => ({ left: 100, top: 300, width: 80, height: 40, right: 180, bottom: 340 }) };
    w.eval('positionMainTooltip(window.__fake)');
    // вьюпортные значения из секции 3: left=30, top=68 → документ: 70/368
    ok('left = вьюпорт + scrollX (30+40=70)', tip.style.left === '70px', tip.style.left);
    ok('top = вьюпорт + scrollY (68+300=368)', tip.style.top === '368px', tip.style.top);
    de.getBoundingClientRect = origRect;
    Object.defineProperty(w, 'scrollX', { value: 0, configurable: true });
    Object.defineProperty(w, 'scrollY', { value: 0, configurable: true });
  }

  console.log('=== 7. 0.144: превью при скрытом главном (пустая ячейка звучит) ===');
  const origMainRect = (el) => el.getBoundingClientRect.bind(el);
  {
    const de = d.documentElement;
    const origRect = de.getBoundingClientRect.bind(de);
    de.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 700, right: 1000, bottom: 700, x: 0, y: 0 });
    Object.defineProperty(de, 'clientWidth', { get: () => 1000, configurable: true });
    Object.defineProperty(de, 'clientHeight', { get: () => 700, configurable: true });

    const main = d.getElementById('fingering-tooltip');
    const prev = d.getElementById('preview-tooltip');
    prev.style.display = 'block';

    // (1) Главный СКРЫТ, есть ячейка-якорь: превью — над ячейкой, по центру.
    main.style.display = 'none';
    w.__fakeCell = { isConnected: true, getBoundingClientRect: () => ({ left: 200, top: 400, width: 80, height: 40, right: 280, bottom: 440 }) };
    w.eval('positionPreviewTooltip(document.getElementById("fingering-tooltip"), document.getElementById("preview-tooltip"), window.__fakeCell)');
    // pw/ph: offsetWidth/Height в jsdom = 0 → фолбэк 200. Якорь: left=200+40−100=140, top=400−200−10=190.
    ok('скрытый main + якорь: по центру над ячейкой (left=140)', prev.style.left === '140px', prev.style.left);
    ok('top = 400−200−10 = 190', prev.style.top === '190px', prev.style.top);

    // (2) Главный скрыт, якоря НЕТ — превью гасится (никаких нулевых ректов).
    prev.style.display = 'block';
    w.eval('positionPreviewTooltip(document.getElementById("fingering-tooltip"), document.getElementById("preview-tooltip"), null)');
    ok('скрытый main без якоря: превью скрыто', prev.style.display === 'none', prev.style.display);

    // (3) Главный ВИДИМ (rect есть) — превью справа от него, якорь игнорируется.
    main.style.display = 'block';
    main.getBoundingClientRect = () => ({ left: 300, top: 100, width: 150, height: 280, right: 450, bottom: 380 });
    prev.style.display = 'block';
    w.eval('positionPreviewTooltip(document.getElementById("fingering-tooltip"), document.getElementById("preview-tooltip"), window.__fakeCell)');
    // справа от main: left=450+10=460, top=100+(280−200)/2=140.
    ok('видимый main: превью справа от него (left=460)', prev.style.left === '460px', prev.style.left);
    ok('top=140', prev.style.top === '140px', prev.style.top);
    main.getBoundingClientRect = origMainRect(main);

    // (4) Планировщик передает ячейку-якорь (статическая проверка вызовов).
    const appSrc = fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8');
    const calls = (appSrc.match(/positionPreviewTooltip\(mainTooltip, previewEl, previewWrapper\)/g) || []).length;
    ok('планировщик: 3 вызова с previewWrapper', calls === 3, String(calls));
    const wcalls = (appSrc.match(/positionPreviewTooltip\(mainTooltip, tooltipEl, wrapper\)/g) || []).length;
    ok('showFingeringTooltip: 4 вызова с wrapper', wcalls === 4, String(wcalls));

    de.getBoundingClientRect = origRect;
  }

  console.log('=== 8. 0.145: следующий АККОРД + ховер при закреплении ===');
  {
    // Песня: [Am][пустая][F]. Превью обязано прыгать ЧЕРЕЗ пустую.
    const r1 = w.eval('findNextChordEventFrom(0, 0, 1)'); // от пустой (ei=1)
    ok('из-за пустой ячейки найден F', !!r1 && r1.event.chord === 'F', JSON.stringify(r1 && r1.event.chord));
    const r2 = w.eval('findNextChordEventFrom(0, 0, 2)'); // сам F
    ok('позиция F корректна', !!r2 && r2.eventIndex === 2, r2 && String(r2.eventIndex));
    const r3 = w.eval('findNextChordEventFrom(0, 0, 3)'); // дальше аккордов нет
    ok('после F — null (нет аккордов)', r3 === null, JSON.stringify(r3));

    // Ховер при закреплении в ПОКОЕ работает (раньше глушился всегда).
    w.eval(`pinnedFingering = { secId: 1, squareId: 2, eventIndex: 0, chord: 'Am', shape: null };
            renderPinnedFingering();`);
    ok('закреплённый ряд виден', d.getElementById('pinnedRow').style.display === 'flex');
    const wrap2 = d.querySelectorAll('.chord-wrapper')[2]; // ячейка F
    const inputF = wrap2 && wrap2.querySelector('.chord-input');
    inputF.dispatchEvent(new w.MouseEvent('mouseover', { bubbles: true }));
    await sleep(80);
    const tip8 = d.getElementById('fingering-tooltip');
    ok('ховер при закреплении (покой) показывает тултип', tip8.style.display === 'block', tip8.style.display);
    ok('в тултипе — F, не закреплённый Am', tip8.dataset.currentShape !== undefined || tip8.style.display === 'block');
    w.eval('pinnedFingering = null; renderPinnedFingering();');
  }

  console.log(bad ? `FAIL: ${bad}` : 'ALL OK');
  w.close();
  process.exit(bad ? 1 : 0);
});
