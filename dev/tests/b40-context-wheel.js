// B-40: контекстный круг аккордов вместо полноэкранной модалки.
// Сторожит модель кликов, привязку к ячейке, точное расширение,
// постоянный контур и обратимый «живой» ручной ввод.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://localhost/',
  beforeParse(w) {
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    w.HTMLCanvasElement.prototype.getContext = () => ({
      font: '', measureText: (t) => ({ width: String(t || '').length * 10 }),
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
w.confirm = () => true;
let bad = 0;
const ok = (name, cond, extra) => {
  console.log(`   ${cond ? 'ok  ' : 'FAIL'} ${name}${!cond && extra !== undefined ? ' — ' + extra : ''}`);
  if (!cond) bad++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

w.addEventListener('load', async () => {
  const d = w.document;
  w.eval(`
    sections = [{
      id: 1, type: 'Verse', customName: null, note: null, key: null,
      shift: null, timeSig: null, bpm: null, repeat: 1,
      squares: [{ id: 2, repeat: 1, customBeats: null,
        events: [{ chord: 'Fmaj7', span: 2 }, { chord: 'G7', span: 2 }]
      }]
    }];
    nextId = 3; globalKey = 'C'; keyMode = 'manual'; render();
    previewChordNow = function () { window.__b40PreviewCount = (window.__b40PreviewCount || 0) + 1; };
  `);
  const modal = d.getElementById('chordWheelModal');
  Object.defineProperty(modal, 'offsetWidth', { configurable: true, get: () => 610 });
  Object.defineProperty(modal, 'offsetHeight', { configurable: true, get: () => 600 });
  let wrappers = Array.from(d.querySelectorAll('.chord-wrapper'));
  let rects = [
    { left: 360, right: 520, top: 700, bottom: 800, width: 160, height: 100 },
    { left: 520, right: 680, top: 700, bottom: 800, width: 160, height: 100 },
  ];
  wrappers.forEach((el, i) => { el.getBoundingClientRect = () => rects[i]; });

  console.log('=== 1. Первый клик: активная ячейка, звук и контекстный круг ===');
  click(wrappers[0]);
  ok('круг открыт сразу, без таймера', modal.classList.contains('open'));
  ok('aria-modal снят', modal.getAttribute('aria-modal') === 'false');
  ok('активна первая ячейка', wrappers[0].classList.contains('is-wheel-active'));
  ok('аккорд проигран один раз', w.__b40PreviewCount === 1, w.__b40PreviewCount);
  ok('Fmaj7 открыл режим maj7', w.eval('wheelMode') === 'maj7', w.eval('wheelMode'));
  ok('точно один сегмент выбран', d.querySelectorAll('#circleSvg .wheel-segment.is-selected').length === 1,
    d.querySelectorAll('#circleSvg .wheel-segment.is-selected').length);
  ok('поповер выбрал верхнюю сторону', w.eval('chordWheelSide') === 'above');
  ok('поповер поставлен над ячейкой', parseFloat(modal.style.top) < rects[0].top,
    `${modal.style.top} vs ${rects[0].top}`);

  console.log('=== 2. Другая ячейка: тот же поповер переезжает ===');
  click(wrappers[1]);
  ok('круг не закрылся', modal.classList.contains('open'));
  ok('активна вторая ячейка', wrappers[1].classList.contains('is-wheel-active'));
  ok('контур первой снят', !wrappers[0].classList.contains('is-wheel-active'));
  ok('G7 восстановил режим 7', w.eval('wheelMode') === '7', w.eval('wheelMode'));
  ok('новый аккорд тоже проигран', w.__b40PreviewCount === 2, w.__b40PreviewCount);
  ok('сторона не перевернулась при переезде', w.eval('chordWheelSide') === 'above');

  console.log('=== 3. Внешний клик закрывает круг, но оставляет выбор ===');
  d.body.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true }));
  ok('круг закрыт', !modal.classList.contains('open'));
  ok('контур второй ячейки остался', wrappers[1].classList.contains('is-wheel-active'));
  click(wrappers[1]);
  ok('первый клик новой операции снова открывает круг', modal.classList.contains('open'));
  ok('поле ещё readonly', wrappers[1].querySelector('.chord-input').hasAttribute('readonly'));

  console.log('=== 4. Повторный клик: ручной ввод; Esc полностью отменяет ===');
  click(wrappers[1]);
  const input2 = wrappers[1].querySelector('.chord-input');
  ok('круг закрылся перед вводом', !modal.classList.contains('open'));
  ok('readonly снят', !input2.hasAttribute('readonly'));
  input2.value = 'Dm9';
  input2.dispatchEvent(new w.Event('input', { bubbles: true }));
  ok('текст виден живьём в input', input2.value === 'Dm9');
  ok('модель до commit не изменилась', w.eval('sections[0].squares[0].events[1].chord') === 'G7',
    w.eval('sections[0].squares[0].events[1].chord'));
  input2.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  ok('Esc вернул исходный текст', input2.value === 'G7', input2.value);
  ok('Esc вернул readonly', input2.hasAttribute('readonly'));
  ok('Esc не менял модель', w.eval('sections[0].squares[0].events[1].chord') === 'G7');

  console.log('=== 5. Enter делает один итоговый commit ===');
  click(wrappers[1]); // круг
  click(wrappers[1]); // ручной ввод
  const editing = wrappers[1].querySelector('.chord-input');
  const beforeCommands = w.eval("songStore.log().filter(x => x.label === 'cell/chord').length");
  editing.value = 'Am9';
  editing.dispatchEvent(new w.Event('input', { bubbles: true }));
  editing.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  const afterCommands = w.eval("songStore.log().filter(x => x.label === 'cell/chord').length");
  ok('Enter сохранил модель', w.eval('sections[0].squares[0].events[1].chord') === 'Am9',
    w.eval('sections[0].squares[0].events[1].chord'));
  ok('в Store ровно одна команда', afterCommands - beforeCommands === 1,
    `${beforeCommands} -> ${afterCommands}`);
  ok('после commit поле readonly', editing.hasAttribute('readonly'));

  console.log('=== 6. Контур переживает полный render по идентичности события ===');
  w.eval('render()');
  wrappers = Array.from(d.querySelectorAll('.chord-wrapper'));
  ok('активен ровно один wrapper', d.querySelectorAll('.chord-wrapper.is-wheel-active').length === 1);
  ok('активна та же модельная ячейка',
    d.querySelector('.chord-wrapper.is-wheel-active')?.dataset.ei === '1');

  console.log('=== 7. Если ячейка ушла из viewport, поповер закрывается ===');
  const active = d.querySelector('.chord-wrapper.is-wheel-active');
  active.getBoundingClientRect = () => ({ left: 300, right: 450, top: 650, bottom: 750, width: 150, height: 100 });
  click(active);
  ok('круг открыт перед прокруткой', modal.classList.contains('open'));
  active.getBoundingClientRect = () => ({ left: 300, right: 450, top: -150, bottom: -50, width: 150, height: 100 });
  w.dispatchEvent(new w.Event('scroll'));
  await sleep(30);
  ok('круг закрылся вне viewport', !modal.classList.contains('open'));
  ok('постоянный контур сохранился', active.classList.contains('is-wheel-active'));

  console.log('=== 8. Визуальный контракт нового поповера ===');
  ok('полноэкранный overlay не перехватывает клики', /\.wheel-overlay\s*\{\s*display:\s*none/.test(html));
  ok('поповер absolute, а не fixed на весь экран', /\.chord-wheel-modal\s*\{[\s\S]*?position:\s*absolute/.test(html));
  ok('мягкая карточка использует color-mix с brand', /\.wheel-container\s*\{[\s\S]*?color-mix\([^)]*--color-brand/.test(html));
  ok('активная ячейка имеет inset-контур', /\.chord-wrapper\.is-wheel-active\s*\{[\s\S]*?inset/.test(html));
  ok('ряды расширений остались 4 + 3',
    d.querySelectorAll('#wheelModeRow1 .mode-tab').length === 4
      && d.querySelectorAll('#wheelModeRow2 .mode-tab').length === 3);

  console.log(bad ? `FAIL: ${bad}` : 'ALL OK');
  process.exit(bad ? 1 : 0);
});
