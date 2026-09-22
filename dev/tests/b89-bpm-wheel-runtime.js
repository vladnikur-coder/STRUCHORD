#!/usr/bin/env node
/* B-89 / 0.340 — Safari wheel и точный геометрический центр барабана. */
const fs = require('fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8');
let runtimeError = null;
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://localhost/',
  beforeParse(w) {
    w.AudioContext = w.webkitAudioContext = function () {
      return { currentTime: 0, state: 'running', resume() { return Promise.resolve(); } };
    };
    w.HTMLCanvasElement.prototype.getContext = () => ({
      font: '', measureText: () => ({ width: 10 }),
      clearRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {}, moveTo() {}, lineTo() {}, closePath() {},
      save() {}, restore() {}, translate() {}, rotate() {}, fillText() {}, strokeText() {}, setTransform() {}, scale() {},
      createLinearGradient: () => ({ addColorStop() {} })
    });
  }
});
const w = dom.window;
w.addEventListener('error', (event) => { runtimeError = event.error || new Error(event.message); });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let count = 0;
function ok(value, message, detail = '') {
  if (!value) throw new Error(`ПРОВАЛ: ${message}${detail ? ` — ${detail}` : ''}`);
  console.log('OK:', message);
  count++;
}

w.addEventListener('load', async () => {
  try {
    await sleep(80);
    if (runtimeError) throw runtimeError;
    const d = w.document;
    const input = d.getElementById('bpmInput');
    const wheel = (deltaY, shiftKey = false, target = input) => target.dispatchEvent(
      new w.WheelEvent('wheel', { deltaY, shiftKey, bubbles: true, cancelable: true })
    );
    const center = () => d.querySelector('.bpm-drum-row.is-center')?.textContent || '';
    const pending = () => w.eval('bpmCommitPending');
    const isOpen = () => w.eval('bpmDrumOpen');
    // Синтетическая серия dispatchEvent укладывается в ~0мс, из-за чего
    // оценка скорости по сэмплам была бы фиктивно огромной. Обнуляем
    // сэмплы: конец потока тогда детерминированно фиксирует целую строку.
    const calmStream = () => w.eval('if (bpmDrum) bpmDrum.wheelSamples = [];');
    w.eval(`
      window.__b89ApplyCount = 0;
      window.__b89OriginalApplyBpmChange = applyBpmChange;
      applyBpmChange = function () {
        window.__b89ApplyCount++;
        return window.__b89OriginalApplyBpmChange();
      };
    `);
    const applyCount = () => w.__b89ApplyCount;
    const reset = (value) => {
      if (w.eval('powerProloguePlaying')) w.finishPowerPrologueNow();
      if (w.eval('powerGeneratorState')) w.clearPowerGeneratorPrototype(false);
      if (w.eval('bpmDrumOpen')) w.closeBpmDrum();
      w.eval(`
        clearTimeout(bpmCommitTimer);
        bpmCommitTimer = 0;
        bpmCommitPending = false;
        clearTimeout(bpmWheelStreamTimer);
        bpmWheelStreamTimer = 0;
        bpmWheelDriving = false;
        bpmWheelCrossed220 = false;
        if (bpmDrum) { bpmDrum.wheelSamples = []; bpmDrumStopLoop(); bpmDrum.snapTo = null; bpmDrum.vel = 0; }
        clearTimeout(bpmDrumCloseTimer);
        bpmDrumCloseTimer = 0;
        bpmDrumClosing = false;
      `);
      input.value = String(value);
    };

    console.log('=== 1. Поле — единственное выбранное число, центр следует сразу ===');
    ok(!html.includes('bpmWheelTarget') && !html.includes('bpmDrum.committed') && !html.includes('followBpmWheelTarget'),
      'отдельные target/committed и числовой follow удалены');
    ok(!html.includes('bpmWheelRemainder'),
      'числовой пиксельный остаток удалён: недокрут живёт в offset самой ленты');
    reset(120);
    let before = applyCount();
    for (let i = 0; i < 10; i++) wheel(12);
    calmStream();
    ok(input.value === '130' && center() === '130',
      '10 быстрых дистанций сразу показывают 130 и в поле, и в центре', `${input.value}/${center()}`);
    ok(pending() === true && applyCount() === before,
      'до тишины ожидает только булев side-effect, тяжёлого apply ещё нет');
    await sleep(170);
    ok(input.value === '130' && center() === '130', 'через 170 мс число не доезжает и не меняется');
    ok(pending() === true && applyCount() === before, 'до 260 мс side-effect всё ещё не выполнен');
    await sleep(150);
    ok(input.value === '130' && center() === '130' && pending() === false, 'после commit отображаемое число остаётся 130');
    ok(applyCount() === before + 1, 'вся серия вызывает applyBpmChange ровно один раз');
    // Автозакрытие отсчитывается от ПОЛНОЙ остановки (конец wheel-потока
    // через 90 мс), поэтому выдержка чуть больше прежних 950 мс.
    await sleep(1150);
    ok(!isOpen() && input.value === '130' && center() === '130',
      'автозакрытие оставляет ровно последнее показанное число');

    console.log('=== 2. Раннее закрытие не меняет выбранное число ===');
    reset(120);
    before = applyCount();
    for (let i = 0; i < 10; i++) wheel(12);
    ok(input.value === '130' && center() === '130', 'перед ранним закрытием поле и центр уже равны 130');
    w.closeBpmDrum();
    ok(!isOpen() && input.value === '130' && center() === '130' && pending() === false,
      'после раннего закрытия остаётся то же число 130');
    ok(applyCount() === before + 1, 'раннее закрытие только один раз флашит side-effect');
    wheel(100);
    ok(input.value === '130' && !isOpen(),
      'momentum-хвост во время сворачивания не открывает барабан и не переписывает поле');

    console.log('=== 2.1. Закрытие активного движения сначала снапает целую строку ===');
    reset(130);
    w.openBpmDrum();
    w.eval(`
      bpmDrum.offset = bpmDrumRestOffset(130) + BPM_DRUM_ROW * 0.6;
      bpmDrum.vel = 2;
      bpmDrum.snapTo = null;
      bpmDrumRenderFrame();
    `);
    w.closeBpmDrum();
    ok(input.value === '131' && center() === '131' && !isOpen(),
      'явное закрытие останавливает инерцию на ближайшей строке 131');
    ok(w.eval('bpmDrum.offset === bpmDrumRestOffset(131) && bpmDrum.raf === 0'),
      'после закрытия офсет уже точный и отложенного rAF нет');
    reset(120);
    w.openBpmDrum();
    const stripStyle = d.querySelector('.bpm-drum-strip').style.transform;
    ok(/rem/.test(stripStyle) && !/translate3d\(0,-?\d+(?:\.\d+)?px/.test(stripStyle),
      'transform ленты задан в rem, а не в фиксированных экранных 38px', stripStyle);

    console.log('=== 2.2. Крупность цифры непрерывна, без скачка класса ===');
    ok(!/\.bpm-drum-row\.is-center\s*{[^}]*font-size/.test(html),
      'у .is-center больше нет скачка font-size — только вес шрифта');
    const scaleOf = (v) => {
      const t = w.eval(`bpmDrum.rows[${v} - CONFIG.MIN_BPM].style.transform`);
      return parseFloat((t.match(/scale\(([\d.]+)\)/) || [])[1]);
    };
    ok(Math.abs(scaleOf(120) - 1.235) < 0.001 && Math.abs(scaleOf(121) - 1) < 0.001,
      'в покое центр ×1.235, сосед ×1', `${scaleOf(120)}/${scaleOf(121)}`);
    w.eval('bpmDrum.offset = bpmDrumRestOffset(120) + BPM_DRUM_ROW / 2; bpmDrumRenderFrame();');
    ok(Math.abs(scaleOf(120) - 1.1175) < 0.001 && Math.abs(scaleOf(121) - 1.1175) < 0.001,
      'на полпути обе соседние строки в среднем масштабе', `${scaleOf(120)}/${scaleOf(121)}`);
    w.closeBpmDrum();

    console.log('=== 3. Недокрут живёт в offset, разворот гасит его естественно ===');
    reset(120);
    for (let i = 0; i < 4; i++) wheel(1);
    ok(w.eval('bpmDrum.offset') > w.eval('bpmDrumRestOffset(120)'),
      'подпороговый путь реально сдвигает ленту, а не копится в скрытом числе');
    for (let i = 0; i < 4; i++) wheel(-1);
    calmStream();
    ok(input.value === '120' && center() === '120' &&
      w.eval('bpmDrum.offset === bpmDrumRestOffset(120)'),
      'равный встречный путь возвращает ленту ровно на строку 120');
    await sleep(300);
    ok(input.value === '120' && pending() === false, 'подпороговый жест ничего не применяет');
    for (let i = 0; i < 12; i++) wheel(-1);
    calmStream();
    ok(input.value === '119' && center() === '119', 'полный обратный путь сразу даёт −1');
    await sleep(300);
    ok(input.value === '119' && pending() === false, 'после тишины число 119 не меняется');

    console.log('=== 4. Мышь, Shift и границы сохраняют контракт ===');
    reset(120);
    wheel(100);
    await sleep(220);
    ok(input.value === '121' && center() === '121',
      'крупный дискретный тик мыши плавно перелистывает ровно +1', `${input.value}/${center()}`);
    wheel(100, true);
    await sleep(220);
    ok(input.value === '126' && center() === '126',
      'Shift плавно перелистывает ровно +5 без пролёта', `${input.value}/${center()}`);
    ok(w.eval('bpmDrum.offset === bpmDrumRestOffset(126) && bpmDrum.raf === 0'),
      'после дискретной доездки лента стоит точно на строке без инерции');
    await sleep(300);
    reset(298);
    for (let i = 0; i < 5; i++) wheel(12);
    calmStream();
    ok(input.value === '300' && center() === '300', 'верхняя граница 300 едина для поля и центра');
    await sleep(300);
    reset(42);
    for (let i = 0; i < 5; i++) wheel(-12);
    calmStream();
    ok(input.value === '40' && center() === '40', 'нижняя граница 40 едина для поля и центра');
    await sleep(300);

    console.log('=== 4.1. Конец быстрого потока продолжает движение той же инерцией ===');
    reset(120);
    w.eval(`
      openBpmDrum();
      const t0 = performance.now();
      bpmDrum.offset = bpmDrumRestOffset(124);
      bpmDrum.lastValue = 124;
      DOM.bpmInput.value = 124;
      bpmDrum.wheelSamples = [
        { t: t0 - 60, off: bpmDrumRestOffset(122) },
        { t: t0, off: bpmDrumRestOffset(124) }
      ];
      bpmWheelDriving = true;
      bpmWheelStreamTimer = 1;
      bpmWheelStreamEnd();
    `);
    ok(w.eval('bpmDrum.vel') > 0.18 && w.eval('bpmDrum.raf') !== 0,
      'быстрый wheel-поток передаёт скорость той же инерции, что и drag');
    // затухание exp(-dt/260) при ~1.3 ед/мс длится около секунды + snap
    await sleep(1900);
    ok(w.eval('bpmDrum.raf === 0 && bpmDrum.snapTo == null'),
      'инерция сама затухает и snap ставит целую строку');
    ok(input.value === center() && Number(input.value) > 124,
      'после инерции поле и центр — одно число дальше точки отпускания',
      `${input.value}/${center()}`);
    ok(w.eval(`bpmDrum.offset === bpmDrumRestOffset(${input.value})`),
      'финальная строка стоит ровно в центре');
    w.closeBpmDrum();
    await sleep(400);

    console.log('=== 5. Проход через 220 запускает сцену только после остановки ===');
    reset(219);
    w.eval('currentSongSeal = LIGHTNING_SONG_SEAL');
    for (let i = 0; i < 5; i++) wheel(12); // выбранное число 224
    calmStream();
    ok(input.value === '224' && center() === '224' && !w.eval('powerProloguePlaying'),
      'сразу после прохода итог 224 уже показан, пролога ещё нет');
    await sleep(170);
    ok(input.value === '224' && center() === '224' && !w.eval('powerProloguePlaying'),
      'до 260 мс число неизменно и пролог не стартует');
    await sleep(150);
    ok(input.value === '224' && center() === '224' && pending() === false,
      'после commit конечный BPM остаётся 224');
    // B-66.2.1: сначала торжественный пролог, генератор — после его обрыва.
    ok(w.eval('powerProloguePlaying') && !w.eval('powerGeneratorState'),
      'проход 219 → 224 через 220 запускает пролог, генератора ещё нет');
    ok(d.querySelector('.power-prologue-digits')?.textContent === '220',
      'в прологе растёт именно цифра 220');
    w.finishPowerPrologueNow();
    let state = w.eval('powerGeneratorState');
    ok(!w.eval('powerProloguePlaying') && !d.querySelector('.power-prologue-overlay') &&
      state && state.unlockAchievement,
      'обрыв пролога убирает оверлей и запускает production-генератор');

    reset(221);
    for (let i = 0; i < 5; i++) wheel(-12); // выбранное число 216
    calmStream();
    await sleep(320);
    w.finishPowerPrologueNow();
    state = w.eval('powerGeneratorState');
    ok(input.value === '216' && center() === '216' && state && state.unlockAchievement,
      'обратный проход 221 → 216 также считается');

    reset(220);
    await sleep(320);
    ok(!w.eval('powerGeneratorState') && !w.eval('powerProloguePlaying'),
      'простая загрузка/подстановка 220 без wheel-жеста ничего не запускает');

    console.log(`\nALL OK — ${count} проверок B-89.`);
    w.close();
  } catch (error) {
    console.error(error);
    w.close();
    process.exit(1);
  }
});
