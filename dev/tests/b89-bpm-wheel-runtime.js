#!/usr/bin/env node
/* B-89 / 0.339 — Safari wheel: единый выбранный BPM без числового доезда. */
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
    const remainder = () => w.eval('bpmWheelRemainder');
    const isOpen = () => w.eval('bpmDrumOpen');
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
      if (w.eval('powerGeneratorState')) w.clearPowerGeneratorPrototype(false);
      if (w.eval('bpmDrumOpen')) w.closeBpmDrum();
      w.eval(`
        clearTimeout(bpmCommitTimer);
        bpmCommitTimer = 0;
        bpmCommitPending = false;
        bpmWheelRemainder = 0;
        bpmWheelCrossed220 = false;
      `);
      input.value = String(value);
    };

    console.log('=== 1. Поле — единственное выбранное число, центр следует сразу ===');
    ok(!html.includes('bpmWheelTarget') && !html.includes('bpmDrum.committed') && !html.includes('followBpmWheelTarget'),
      'отдельные target/committed и числовой follow удалены');
    reset(120);
    let before = applyCount();
    for (let i = 0; i < 10; i++) wheel(12);
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
    await sleep(950);
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

    console.log('=== 3. Дробные delta копятся, разворот сначала гасит остаток ===');
    reset(120);
    for (let i = 0; i < 4; i++) wheel(1);
    for (let i = 0; i < 4; i++) wheel(-1);
    ok(input.value === '120' && center() === '120' && remainder() === 0,
      'равные встречные остатки сразу взаимно гасятся без ложного шага');
    await sleep(300);
    ok(input.value === '120' && pending() === false, 'подпороговый жест ничего не применяет');
    for (let i = 0; i < 12; i++) wheel(-1);
    ok(input.value === '119' && center() === '119', 'полный обратный путь сразу даёт −1');
    await sleep(300);
    ok(input.value === '119' && pending() === false, 'после тишины число 119 не меняется');

    console.log('=== 4. Мышь, Shift и границы сохраняют контракт ===');
    reset(120);
    wheel(100);
    ok(input.value === '121' && center() === '121', 'крупный дискретный тик мыши сразу даёт +1');
    wheel(100, true);
    ok(input.value === '126' && center() === '126', 'Shift сразу ускоряет дискретный тик до +5');
    await sleep(300);
    reset(298);
    for (let i = 0; i < 5; i++) wheel(12);
    ok(input.value === '300' && center() === '300', 'верхняя граница 300 едина для поля и центра');
    await sleep(300);
    reset(42);
    for (let i = 0; i < 5; i++) wheel(-12);
    ok(input.value === '40' && center() === '40', 'нижняя граница 40 едина для поля и центра');
    await sleep(300);

    console.log('=== 5. Проход через 220 запускает сцену только после остановки ===');
    reset(219);
    w.eval('currentSongSeal = LIGHTNING_SONG_SEAL');
    for (let i = 0; i < 5; i++) wheel(12); // выбранное число 224
    ok(input.value === '224' && center() === '224' && !w.eval('powerGeneratorState'),
      'сразу после прохода итог 224 уже показан, сцены ещё нет');
    await sleep(170);
    ok(input.value === '224' && center() === '224' && !w.eval('powerGeneratorState'),
      'до 260 мс число неизменно и сцена не стартует');
    await sleep(150);
    let state = w.eval('powerGeneratorState');
    ok(input.value === '224' && center() === '224' && pending() === false,
      'после commit конечный BPM остаётся 224');
    ok(state && state.unlockAchievement, 'проход 219 → 224 через 220 запускает production-генератор');

    reset(221);
    for (let i = 0; i < 5; i++) wheel(-12); // выбранное число 216
    await sleep(320);
    state = w.eval('powerGeneratorState');
    ok(input.value === '216' && center() === '216' && state && state.unlockAchievement,
      'обратный проход 221 → 216 также считается');

    reset(220);
    await sleep(320);
    ok(!w.eval('powerGeneratorState'), 'простая загрузка/подстановка 220 без wheel-жеста ничего не запускает');

    console.log(`\nALL OK — ${count} проверок B-89.`);
    w.close();
  } catch (error) {
    console.error(error);
    w.close();
    process.exit(1);
  }
});
