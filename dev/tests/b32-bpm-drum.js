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
  const pop = () => d.querySelector('.bpm-inline-drum');
const isOpen = () => { const q = pop(); return !!q && q.classList.contains('is-open'); };

  console.log('=== 1. Клик барабан не открывает ===');
  ok('исходное значение 120', input.value === '120', input.value);
  click(input);
  ok('после клика барабана нет', !pop() || !isOpen());

  console.log('=== 2. Колесо: вниз = темп вверх, лента вверх ===');
  wheelField(100); // колесо к себе — темп ВВЕРХ
  await sleep(80);
  const p1 = pop();
  ok('барабан открыт', !!p1 && p1.classList.contains('is-open'));
  ok('центральная строка — 121', p1.querySelector('.bpm-drum-row.is-center').textContent === '121',
     p1.querySelector('.bpm-drum-row.is-center').textContent);
  ok('поле показывает 121', input.value === '121', input.value);
  wheelField(-100); // от себя — темп вниз
  await sleep(260);
  ok('колесо от себя → 120', input.value === '120', input.value);

  console.log('=== 3. Скорость «как было»: одно событие = один шаг ===');
  // 5 тиков с человеческими паузами: каждый двигает цель на +1 от
  // текущего центра ленты (семантика 0.131 и ранее)
  for (let i = 0; i < 5; i++) { wheelField(100); await sleep(60); }
  await sleep(500);
  ok('после 5 тиков — 125', input.value === '125', input.value);
  wheelField(8); // мелкая трекпадная дельта — тоже один шаг, как раньше
  await sleep(320);
  ok('мелкая дельта (8px) — тоже +1 → 126', input.value === '126', input.value);

  console.log('=== 4. Клавиши при открытом барабане ===');
  key('PageUp');
  await sleep(320);
  ok('PageUp → 136', input.value === '136', input.value);
  key('End');
  await sleep(500);
  ok('End → 300', input.value === '300', input.value);

  console.log('=== 5. Цифра — уходим в поле ===');
  key('4');
  ok('барабан закрылся', !isOpen());
  ok('фокус в поле', d.activeElement === input);
  ok('в поле начат ввод: 4', input.value === '4', input.value);

  console.log('=== 6. Idle: барабан сам закрывается ===');
  input.value = '120';
  wheelField(100);
  await sleep(80);
  ok('открыт колесом', isOpen());
  await sleep(1500);
  ok('закрылся сам', !isOpen());
  ok('значение применено (121)', input.value === '121', input.value);

  console.log('=== 7. Резинка на краях + пружина ===');
  wheelField(100);
  await sleep(80);
  const cyl = pop();
  pdown(cyl, 300);
  await sleep(120);
  pmove(cyl, 3400); // сильно за минимум
  const centerDuringDrag = w.eval('Math.round(bpmDrumCenterValue())');
  ok('во время резинки центр не ниже 40', centerDuringDrag >= 40, String(centerDuringDrag));
  await sleep(400);
  ok('держим: барабан не закрылся', isOpen());
  pup(cyl, 3400);
  await sleep(450);
  ok('после отпускания — пружина к 40', input.value === '40', input.value);
  await sleep(1500);
  ok('после тишины закрылся', !isOpen());

  console.log('=== 8. Протяжка открывает пилюлю (0.139) ===');
  input.value = '120';
  pdown(input, 200);
  await sleep(30);
  pmove(w, 194); // 6px вверх = +1
  await sleep(80);
  ok('протяжка открыла пилюлю', isOpen());
  ok('протяжка дала 121', input.value === '121', input.value);
  pup(w, 194);
  await sleep(1500);
  ok('после отпускания и тишины пилюля сложилась', !isOpen());
  ok('значение применено (121)', input.value === '121', input.value);

  console.log('=== 9. Клик вне — немедленное закрытие ===');
  wheelField(100); // 122
  await sleep(80);
  ok('открыт', isOpen());
  key('ArrowUp'); // 123
  await sleep(200);
  d.body.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true }));
  ok('клик вне закрыл', !isOpen());
  ok('значение применено (123)', input.value === '123', input.value);

  console.log('=== 10. Закрытие анимируется: visibility в переходе (0.141) ===');
  // Регрессия «пилюля исчезает без анимации»: visibility НЕ входила в
  // transition, снималась мгновенно и маскировала сворачивание. Теперь:
  // закрытие — задержка ровно в длительность перехода (видима до конца),
  // открытие — без задержки. jsdom не проигрывает переходы, проверяем
  // объявленные правила (прецедент чтения styleSheets — layout-shift).
  {
    const rules = [];
    for (const sh of d.styleSheets) { try { for (const r of sh.cssRules) rules.push(r); } catch (e) {} }
    const base = rules.find((r) => r.selectorText === '.bpm-inline-drum');
    const open = rules.find((r) => r.selectorText === '.bpm-inline-drum.is-open');
    ok('правила барабана найдены', !!base && !!open);
    if (base && open) {
      const items = (s) => s.split(',').map((x) => x.trim());
      const baseVis = items(base.style.transition).filter((x) => x.startsWith('visibility'));
      const openVis = items(open.style.transition).filter((x) => x.startsWith('visibility'));
      ok('закрытие: visibility с задержкой до конца сворачивания',
        baseVis.length === 1 && /visibility\s+0s\s+linear\s+0\.34s/.test(baseVis[0]), baseVis[0]);
      ok('открытие: visibility без задержки',
        openVis.length === 1 && /^visibility\s+0s$/.test(openVis[0]), openVis[0]);
      ok('закрытие: height/opacity остались в переходе',
        /height\s+0\.34s/.test(base.style.transition) && /opacity\s+0\.28s/.test(base.style.transition));
      ok('сложено — не ловит тычки, открыто — ловит',
        /pointer-events:\s*none/.test(base.cssText) && /pointer-events:\s*auto/.test(open.cssText),
        `${base.cssText} / ${open.cssText}`);
    }
  }

  console.log(bad ? `FAIL: ${bad}` : 'ALL OK');
  w.close();
  process.exit(bad ? 1 : 0);
});
