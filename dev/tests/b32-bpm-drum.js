// B-32: барабан BPM (поповер «как будильник iPhone»).
// Проверяем: открытие/закрытие по клику, стрелки/колесо/цифры, живое
// применение значения, резинку на краях, снап на целом BPM, то, что
// протяжка по самому полю (быстрый шаг) осталась рабочей.
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

  console.log('=== 1. Открытие/закрытие ===');
  ok('исходное значение 120', input.value === '120', input.value);
  click(input);
  const pop = d.querySelector('.bpm-drum-popover');
  ok('поповер создан и открыт', !!pop && !pop.hidden);
  ok('строк в барабане 261 (40..300)', pop.querySelectorAll('.bpm-drum-row').length === 261,
     String(pop.querySelectorAll('.bpm-drum-row').length));
  ok('центральная строка — 120', pop.querySelector('.bpm-drum-row.is-center').textContent === '120',
     pop.querySelector('.bpm-drum-row.is-center').textContent);
  ok('поле подсвечено (is-spinning)', input.classList.contains('is-spinning'));

  console.log('=== 2. Стрелки/колесо ===');
  key('ArrowUp');
  await sleep(260);
  ok('ArrowUp → 121', input.value === '121', input.value);
  key('PageDown');
  await sleep(260);
  ok('PageDown → 111', input.value === '111', input.value);
  key('Home');
  await sleep(260);
  ok('Home → 40', input.value === '40', input.value);
  pop.querySelector('.bpm-drum-cylinder').dispatchEvent(
    new w.WheelEvent('wheel', { deltaY: -100, cancelable: true, bubbles: true }));
  await sleep(260);
  ok('колесо по барабану → 41', input.value === '41', input.value);

  console.log('=== 3. Цифра — уходим в поле ===');
  key('4');
  ok('поповер закрылся', pop.hidden);
  ok('фокус в поле', d.activeElement === input);
  ok('в поле начат ввод: 4', input.value === '4', input.value);

  console.log('=== 4. Резинка на краях + снап ===');
  input.value = '120';
  click(input);
  ok('переоткрылся', !pop.hidden);
  const cyl = pop.querySelector('.bpm-drum-cylinder');
  // тянем ВНИЗ сильно за минимум (3040px от 120) → резинка не даёт уехать
  // за 40; подержали и отпустили (окно проб пустое → без флика) — пружина к 40
  pdown(cyl, 300);
  await sleep(120);
  pmove(cyl, 3400);
  const centerDuringDrag = w.eval('Math.round(bpmDrumCenterValue())');
  ok('во время резинки центр не ниже 40', centerDuringDrag >= 40, String(centerDuringDrag));
  await sleep(400); // подержали: скорость на отпускании должна стать ~0
  pup(cyl, 3400);
  await sleep(450);
  ok('после отпускания — пружина к 40', input.value === '40', input.value);

  console.log('=== 5. Протяжка по полю (быстрый шаг) осталась ===');
  key('Escape');
  ok('Esc закрыл барабан', pop.hidden);
  input.value = '120';
  pdown(input, 200);
  await sleep(30);
  pmove(w, 194); // 6px вверх = +1
  await sleep(30);
  pup(w, 194);
  click(input); // движение было — клик должен глотаться
  ok('клик после протяжки не открыл барабан', pop.hidden);
  await sleep(300);
  ok('протяжка дала 121', input.value === '121', input.value);

  console.log('=== 6. Клик вне — закрытие, коммит ===');
  click(input);
  ok('открыт', !pop.hidden);
  key('ArrowUp');
  await sleep(260);
  d.body.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true }));
  ok('клик вне закрыл', pop.hidden);
  ok('значение применено (122)', input.value === '122', input.value);

  console.log(bad ? `FAIL: ${bad}` : 'ALL OK');
  w.close();
  process.exit(bad ? 1 : 0);
});
