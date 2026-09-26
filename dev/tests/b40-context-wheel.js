// B-40 — контекстный круг аккордов.
// Контракт первой визуальной итерации: круг больше не модальный, он
// геометрически привязан к ячейке, даёт временно сравнить «над/вокруг»,
// закрывается вне ячейки и по повторному клику отдаёт ячейку в ручной ввод.
const fs = require('fs');
const { JSDOM } = require('jsdom');

const dom = new JSDOM(fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8'), {
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
const ok = (name, condition, detail = '') => {
  console.log(`   ${condition ? 'ok  ' : 'FAIL'} ${name}${!condition && detail ? ` — ${detail}` : ''}`);
  if (!condition) bad++;
};

w.addEventListener('load', () => {
  try {
    const d = w.document;
    // Высокий десктопный viewport: проверяем именно штатное центрирование
    // варианта «вокруг», а не его осознанный fallback у нижней кромки.
    Object.defineProperty(w, 'innerWidth', { value: 1400, configurable: true });
    Object.defineProperty(w, 'innerHeight', { value: 1200, configurable: true });
    w.eval("addSection('Verse'); render();");
    const input = d.querySelector('.chord-input');
    const owner = input.closest('.chord-wrapper');
    const modal = d.getElementById('chordWheelModal');
    const container = modal.querySelector('.wheel-container');
    const wheel = container.querySelector('.wheel-svg-wrap');

    // jsdom не раскладывает CSS. Даём функции якорения честную геометрию,
    // чтобы проверить именно формулы B-40, а не нулевые rect среды.
    owner.getBoundingClientRect = () => ({ left: 420, top: 500, width: 180, height: 90, right: 600, bottom: 590 });
    container.getBoundingClientRect = () => ({
      left: Number.parseFloat(container.style.left) || 0,
      top: Number.parseFloat(container.style.top) || 0,
      width: 432,
      height: 590,
      right: (Number.parseFloat(container.style.left) || 0) + 432,
      bottom: (Number.parseFloat(container.style.top) || 0) + 590,
    });
    wheel.getBoundingClientRect = () => ({
      left: Number.parseFloat(container.style.left) || 0,
      top: (Number.parseFloat(container.style.top) || 0) + 50,
      width: 384,
      height: 384,
      right: (Number.parseFloat(container.style.left) || 0) + 384,
      bottom: (Number.parseFloat(container.style.top) || 0) + 434,
    });

    console.log('=== 1. Разметка больше не модальная ===');
    ok('нет затемняющего .wheel-overlay', !modal.querySelector('.wheel-overlay'));
    ok('слой стартует скрытым для AT', modal.getAttribute('aria-hidden') === 'true');
    ok('в SVG квадратный viewBox для полного круга', d.getElementById('circleSvg').getAttribute('viewBox') === '0 0 540 540');
    ok('временного переключателя вариантов больше нет', !d.querySelector('[data-wheel-variant]'));

    console.log('\n=== 2. Открытие и центрирование «Вокруг» ===');
    w.eval('openChordWheel(document.querySelector(".chord-input")); positionContextualChordWheel();');
    ok('слой открыт', modal.classList.contains('open'));
    ok('слой объявлен видимым для AT', modal.getAttribute('aria-hidden') === 'false');
    ok('режим при открытии — трезвучия', w.eval('wheelMode') === 'triads');
    ok('геометрия помечена вокруг', container.dataset.side === 'around');
    ok('центр SVG выровнен по центру ячейки',
      Math.abs((Number.parseFloat(container.style.left) + 192) - 510) < 1 &&
      Math.abs((Number.parseFloat(container.style.top) + 242) - 545) < 1,
      `${container.style.left}, ${container.style.top}`);
    ok('контекст подписывает текущий аккорд', d.getElementById('wheelContextLabel').textContent.includes(input.value));

    console.log('\n=== 3. У края круг не смещается от ячейки ===');
    Object.defineProperty(w, 'innerHeight', { value: 700, configurable: true });
    w.eval('positionContextualChordWheel();');
    ok('центр остаётся на ячейке, даже когда низ выходит из viewport',
      Math.abs((Number.parseFloat(container.style.top) + 242) - 545) < 1,
      `${container.style.top} при viewport ${w.innerHeight}`);

    console.log('\n=== 4. Вне слоя — закрытие без смены аккорда ===');
    const beforeOutside = input.value;
    d.body.dispatchEvent(new w.Event('pointerdown', { bubbles: true }));
    ok('клик вне круга закрыл слой', !modal.classList.contains('open'));
    ok('клик вне круга не меняет аккорд', input.value === beforeOutside);

    console.log('\n=== 5. Повторный клик ячейки — ручной ввод ===');
    w.eval('openChordWheel(document.querySelector(".chord-input"));');
    owner.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok('повторный клик закрыл круг', !modal.classList.contains('open'));
    ok('повторный клик снял readonly', !input.hasAttribute('readonly'));
    // Не оставляем тестовую ячейку в режиме ввода: это же проверяет
    // обычный единый commit, не создавая изменения модели.
    w.eval('saveCurrentChord();');

    console.log('\n=== 6. Клик по реальному сектору фиксирует и закрывает ===');
    w.eval('openChordWheel(document.querySelector(".chord-input"));');
    const firstSector = d.querySelector('#circleSvg path');
    firstSector.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok('клик по сектору закрыл слой', !modal.classList.contains('open'));
    ok('клик по сектору записал аккорд в модель', w.eval('sections[0].squares[0].events[0].chord') === 'C');

    if (bad) process.exitCode = 1;
    else console.log('\nALL OK — B-40 context wheel');
  } catch (error) {
    console.error(error.stack || error);
    process.exitCode = 1;
  }
});
