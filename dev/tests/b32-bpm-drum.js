// B-32 (0.132): барабан BPM — транзиентный фидбек колесного редактирования.
// Направление (0.132): колесо ВНИЗ (deltaY>0) = лента вверх = темп ВВЕРХ.
// Аккумулятор: быстрая серия тиков складывается в цель — лента разгоняется.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM(fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8'), {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/',
  beforeParse(w) {
    w.HTMLCanvasElement.prototype.getContext = () => ({
      font: '', measureText: () => ({ width: 10 }),
      clearRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {}, moveTo() {}, lineTo() {}, closePath() {},
      save() {}, restore() {}, translate() {}, rotate() {}, fillText() {}, strokeText() {}, setTransform() {}, scale() {},
      createLinearGradient: () => ({ addColorStop() {} })
    });
  }
});
const w = dom.window;
w.AudioContext = w.webkitAudioContext = function () { return { currentTime: 0, state: 'running', resume() {} }; };
let bad = 0;
const ok = (n, c, x) => { console.log(`   ${c ? 'ok  ' : 'FAIL'} ${n}${!c && x ? ' — ' + x : ''}`); if (!c) bad++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

w.addEventListener('load', async () => {
  const d = w.document;
  const input = d.getElementById('bpmInput');
  const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const pdown = (el, y) => el.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true, button: 0, clientY: y, clientX: 50 }));
  const pmove = (el, y) => el.dispatchEvent(new w.MouseEvent('pointermove', { bubbles: true, clientY: y, clientX: 50 }));
  const pup = (el, y) => el.dispatchEvent(new w.MouseEvent('pointerup', { bubbles: true, clientY: y, clientX: 50 }));
  const key = (k) => d.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  const wheelField = (dy) => input.dispatchEvent(new w.WheelEvent('wheel', { deltaY: dy, cancelable: true, bubbles: true }));
  const pop = () => d.querySelector('.bpm-drum-popover');

  console.log('=== 1. Клик барабан не открывает ===');
  ok('исходное значение 120', input.value === '120', input.value);
  click(input);
  ok('после клика барабана нет', !pop() || pop().hidden);

  console.log('=== 2. Колесо: вниз = темп вверх, лента вверх ===');
  wheelField(100); // колесо к себе — темп ВВЕРХ
  await sleep(80);
  const p1 = pop();
  ok('барабан открыт', !!p1 && !p1.hidden);
  ok('центральная строка — 121', p1.querySelector('.bpm-drum-row.is-center').textContent === '121',
     p1.querySelector('.bpm-drum-row.is-center').textContent);
  ok('поле показывает 121', input.value === '121', input.value);
  wheelField(-100); // от себя — темп вниз
  await sleep(260);
  ok('колесо от себя → 120', input.value === '120', input.value);

  console.log('=== 3. Аккумулятор: серия тиков складывается ===');
  // 5 тиков без пауз: цель убегает в 125, лента догоняя ускоряясь
  const t0 = Date.now();
  for (let i = 0; i < 5; i++) wheelField(100);
  ok('цель аккумулятора сразу 125 (тики сложились, не перезаписались)',
     w.eval('bpmDrum.targetValue') === 125, String(w.eval('bpmDrum.targetValue')));
  await sleep(60);
  const mid = +input.value;
  ok('поле едет вслед за лентой (121..124, а не стоит на 120)', mid > 120 && mid < 125, String(mid));
  await sleep(560);
  ok('после доезда — 125', input.value === '125', input.value);
  const settle = Date.now() - t0;
  ok('доехала быстрее, чем 5×130мс по-старому (' + settle + 'мс)', settle < 700);

  console.log('=== 3b. Трекпад: мелкие дельты копятся по порогу 60px ===');
  for (let i = 0; i < 3; i++) wheelField(15); // 45px — ниже порога
  await sleep(80);
  ok('3×15px (45px) — шага нет, всё ещё 125', input.value === '125', input.value);
  wheelField(15); // добили до 60px
  await sleep(320);
  ok('4-я дельта (60px суммарно) — ровно +1 → 126', input.value === '126', input.value);

  console.log('=== 4. Клавиши при открытом барабане ===');
  key('PageUp');
  await sleep(320);
  ok('PageUp → 136', input.value === '136', input.value);
  key('End');
  await sleep(500);
  ok('End → 300', input.value === '300', input.value);

  console.log('=== 5. Цифра — уходим в поле ===');
  key('4');
  ok('барабан закрылся', pop().hidden);
  ok('фокус в поле', d.activeElement === input);
  ok('в поле начат ввод: 4', input.value === '4', input.value);

  console.log('=== 6. Idle: барабан сам закрывается ===');
  input.value = '120';
  wheelField(100);
  await sleep(80);
  ok('открыт колесом', !pop().hidden);
  await sleep(1500);
  ok('закрылся сам', pop().hidden);
  ok('значение применено (121)', input.value === '121', input.value);

  console.log('=== 7. Резинка на краях + пружина ===');
  wheelField(100);
  await sleep(80);
  const cyl = pop().querySelector('.bpm-drum-cylinder');
  pdown(cyl, 300);
  await sleep(120);
  pmove(cyl, 3400); // сильно за минимум
  const centerDuringDrag = w.eval('Math.round(bpmDrumCenterValue())');
  ok('во время резинки центр не ниже 40', centerDuringDrag >= 40, String(centerDuringDrag));
  await sleep(400);
  ok('держим: барабан не закрылся', !pop().hidden);
  pup(cyl, 3400);
  await sleep(450);
  ok('после отпускания — пружина к 40', input.value === '40', input.value);
  await sleep(1500);
  ok('после тишины закрылся', pop().hidden);

  console.log('=== 8. Протяжка по полю — без барабана ===');
  input.value = '120';
  pdown(input, 200);
  await sleep(30);
  pmove(w, 194); // 6px вверх = +1 (жест не меняли)
  await sleep(30);
  pup(w, 194);
  await sleep(300);
  ok('протяжка дала 121', input.value === '121', input.value);
  ok('барабан при протяжке не открывался', pop().hidden || !pop());

  console.log('=== 9. Клик вне — немедленное закрытие ===');
  wheelField(100); // 122
  await sleep(80);
  ok('открыт', !pop().hidden);
  key('ArrowUp'); // 123
  await sleep(200);
  d.body.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true }));
  ok('клик вне закрыл', pop().hidden);
  ok('значение применено (123)', input.value === '123', input.value);

  console.log(bad ? `FAIL: ${bad}` : 'ALL OK');
  w.close();
  process.exit(bad ? 1 : 0);
});
