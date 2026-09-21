#!/usr/bin/env node
/* B-89 / 0.338 — Safari wheel: максимум 1 BPM доезда и точное закрытие. */
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
    const committed = () => w.eval('bpmDrum && bpmDrum.committed');
    const targetValue = () => w.eval('bpmWheelTarget');
    const isOpen = () => w.eval('bpmDrumOpen');
    const reset = (value) => {
      if (w.eval('powerGeneratorState')) w.clearPowerGeneratorPrototype(false);
      if (w.eval('bpmDrumOpen')) w.closeBpmDrum();
      input.value = String(value);
    };

    console.log('=== 1. Синхронная Safari-серия отстаёт максимум на 1 BPM ===');
    reset(120);
    for (let i = 0; i < 10; i++) wheel(12);
    ok(targetValue() === 130, '10 быстрых дистанций сохраняют полную цель 130', targetValue());
    ok(input.value === '129' && center() === '129', 'сразу после событий центр только на 1 BPM позади цели', `${input.value}/${center()}`);
    ok(Math.abs(Number(center()) - targetValue()) <= 1, 'видимое и целевое значения никогда не расходятся больше чем на 1 BPM');
    ok(committed() === 120, 'фактический BPM не коммитится во время жеста', committed());
    await sleep(170);
    ok(input.value === '130' && center() === '130' && targetValue() === 130, 'одна строка мягко доехала до общей цели');
    ok(committed() === 120, 'до окончания 260-мс тишины commit остаётся прежним', committed());
    await sleep(150);
    ok(committed() === 130 && input.value === '130' && center() === '130', 'после остановки поле, центр и commit равны 130');
    await sleep(950);
    ok(!isOpen() && input.value === '130' && center() === '130', 'автозакрытие оставляет ровно последнее центральное число');

    console.log('=== 2. Немедленное закрытие сначала сводит центр и поле ===');
    reset(120);
    for (let i = 0; i < 10; i++) wheel(12);
    ok(input.value === '129' && center() === '129' && targetValue() === 130, 'перед ранним закрытием остаётся только однострочный доезд');
    w.closeBpmDrum();
    ok(!isOpen() && input.value === '130' && center() === '130' && committed() === 130,
      'после раннего закрытия поле равно последнему центру 130');

    console.log('=== 3. Дробные delta копятся, разворот сначала гасит остаток ===');
    reset(120);
    for (let i = 0; i < 4; i++) wheel(1);
    for (let i = 0; i < 4; i++) wheel(-1);
    await sleep(300);
    ok(input.value === '120' && committed() === 120, 'равные встречные остатки не создают ложного шага');
    for (let i = 0; i < 12; i++) wheel(-1);
    await sleep(300);
    ok(input.value === '119' && committed() === 119, 'после погашения полный обратный путь даёт −1');

    console.log('=== 4. Мышь, Shift и границы сохраняют контракт ===');
    reset(120);
    wheel(100);
    await sleep(300);
    ok(input.value === '121', 'крупный дискретный тик мыши даёт +1', input.value);
    wheel(100, true);
    await sleep(300);
    ok(input.value === '126', 'Shift ускоряет дискретный тик до +5', input.value);
    reset(298);
    for (let i = 0; i < 5; i++) wheel(12);
    await sleep(300);
    ok(input.value === '300' && center() === '300' && committed() === 300, 'верхняя граница 300 едина для цели, центра и commit');
    reset(42);
    for (let i = 0; i < 5; i++) wheel(-12);
    await sleep(300);
    ok(input.value === '40' && center() === '40' && committed() === 40, 'нижняя граница 40 едина для цели, центра и commit');

    console.log('=== 5. Проход через 220 запускает сцену только после остановки ===');
    reset(219);
    w.eval('currentSongSeal = LIGHTNING_SONG_SEAL');
    for (let i = 0; i < 5; i++) wheel(12); // логическая цель 224
    ok(input.value === '223' && center() === '223' && targetValue() === 224 && !w.eval('powerGeneratorState'),
      'сразу после серии центр 223, цель 224, сцены ещё нет');
    await sleep(170);
    ok(input.value === '224' && center() === '224' && !w.eval('powerGeneratorState'), 'однострочный доезд завершён, но сцена ещё не стартовала');
    await sleep(150);
    let state = w.eval('powerGeneratorState');
    ok(input.value === '224' && committed() === 224, 'конечный фактический BPM остаётся 224');
    ok(state && state.unlockAchievement, 'проход 219 → 224 через 220 запускает production-генератор');

    reset(221);
    for (let i = 0; i < 5; i++) wheel(-12); // логическая цель 216
    await sleep(320);
    state = w.eval('powerGeneratorState');
    ok(input.value === '216' && state && state.unlockAchievement, 'обратный проход 221 → 216 также считается');

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
