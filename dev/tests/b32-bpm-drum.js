// B-32 (0.131): барабан BPM — транзиентный фидбек колесного редактирования.
// Клик барабан НЕ открывает; колесо над полем открывает и докручивает;
// 1.2с тишины — сам закрывается; Esc/клик вне — сразу. Протяжка по полю
// остаётся быстрым шагом без барабана.
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

  console.log('=== 2. Колесо над полем открывает барабан ===');
  wheelField(-100); // +1
  await sleep(80);
  const p1 = pop();
  ok('барабан открыт', !!p1 && !p1.hidden);
  ok('центральная строка — 121', p1.querySelector('.bpm-drum-row.is-center').textContent === '121',
     p1.querySelector('.bpm-drum-row.is-center').textContent);
  ok('поле показывает 121', input.value === '121', input.value);
  wheelField(-100); // ещё +1
  await sleep(260);
  ok('второй тик → 122', input.value === '122', input.value);

  console.log('=== 3. Клавиши при открытом барабане ===');
  key('PageDown');
  await sleep(260);
  ok('PageDown → 112', input.value === '112', input.value);
  key('End');
  await sleep(260);
  ok('End → 300', input.value === '300', input.value);

  console.log('=== 4. Цифра — уходим в поле ===');
  key('4');
  ok('барабан закрылся', pop().hidden);
  ok('фокус в поле', d.activeElement === input);
  ok('в поле начат ввод: 4', input.value === '4', input.value);

  console.log('=== 5. Idle: барабан сам закрывается ===');
  input.value = '120';
  wheelField(-100);
  await sleep(80);
  ok('открыт колесом', !pop().hidden);
  await sleep(1500); // 1.2с тишины
  ok('закрылся сам', pop().hidden);
  ok('значение применено (121)', input.value === '121', input.value);

  console.log('=== 6. Резинка на краях + пружина ===');
  wheelField(-100);
  await sleep(80);
  const cyl = pop().querySelector('.bpm-drum-cylinder');
  pdown(cyl, 300);
  await sleep(120);
  pmove(cyl, 3400); // сильно за минимум
  const centerDuringDrag = w.eval('Math.round(bpmDrumCenterValue())');
  ok('во время резинки центр не ниже 40', centerDuringDrag >= 40, String(centerDuringDrag));
  await sleep(400); // подержали — idle снят на pointerdown
  ok('держим: барабан не закрылся', !pop().hidden);
  pup(cyl, 3400);
  await sleep(450);
  ok('после отпускания — пружина к 40', input.value === '40', input.value);
  await sleep(1500);
  ok('после тишины закрылся', pop().hidden);

  console.log('=== 7. Протяжка по полю — без барабана ===');
  input.value = '120';
  pdown(input, 200);
  await sleep(30);
  pmove(w, 194); // 6px вверх = +1
  await sleep(30);
  pup(w, 194);
  await sleep(300);
  ok('протяжка дала 121', input.value === '121', input.value);
  ok('барабан при протяжке не открывался', pop().hidden || !pop());

  console.log('=== 8. Клик вне — немедленное закрытие ===');
  wheelField(-100); // 122
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
