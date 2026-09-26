// B-40 — контекстный круг аккордов.
// Контракт B-40: круг больше не модальный, геометрически окружает ячейку,
// а качества живой очереди идут двумя вложенными нижними дугами 4 + 3.
// Проверяем также открытие в качестве текущей ячейки и редкое закрепление.
const fs = require('fs');
const { JSDOM } = require('jsdom');

const dom = new JSDOM(fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8'), {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://localhost/',
  beforeParse(win) {
    win.HTMLCanvasElement.prototype.getContext = () => ({
      font: '', measureText: (text) => ({ width: String(text).length * 10 }),
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
    const modeTabs = container.querySelector('.mode-tabs');

    // jsdom не раскладывает CSS. Даём функции якорения честную геометрию,
    // чтобы проверить именно формулы B-40, а не нулевые rect среды.
    let ownerRect = { left: 420, top: 500, width: 180, height: 90, right: 600, bottom: 590 };
    owner.getBoundingClientRect = () => ownerRect;
    container.getBoundingClientRect = () => ({
      left: Number.parseFloat(container.style.left) || 0,
      top: Number.parseFloat(container.style.top) || 0,
      width: 384,
      height: 384,
      right: (Number.parseFloat(container.style.left) || 0) + 384,
      bottom: (Number.parseFloat(container.style.top) || 0) + 384,
    });
    wheel.getBoundingClientRect = () => ({
      left: Number.parseFloat(container.style.left) || 0,
      top: Number.parseFloat(container.style.top) || 0,
      width: 384,
      height: 384,
      right: (Number.parseFloat(container.style.left) || 0) + 384,
      bottom: (Number.parseFloat(container.style.top) || 0) + 384,
    });

    console.log('=== 1. Разметка больше не модальная ===');
    ok('нет затемняющего .wheel-overlay', !modal.querySelector('.wheel-overlay'));
    ok('слой стартует скрытым для AT', modal.getAttribute('aria-hidden') === 'true');
    ok('в SVG квадратный viewBox для полного круга', d.getElementById('circleSvg').getAttribute('viewBox') === '0 0 540 540');
    ok('временного переключателя вариантов больше нет', !d.querySelector('[data-wheel-variant]'));
    ok('слой качеств находится в координатах круга', modeTabs.parentElement === wheel);
    ok('прозрачный контейнер не перекрывает owner-ячейку', w.getComputedStyle(container).pointerEvents === 'none');
    ok('сами кнопки качеств остаются кликабельными', w.getComputedStyle(d.querySelector('.mode-tab')).pointerEvents === 'auto');
    ok('контекстная плашка полностью удалена',
      !container.querySelector('.wheel-popover-toolbar') && !d.getElementById('wheelContextLabel'));
    ok('сохранена раскладка живых типов 4 + 3',
      d.querySelectorAll('#wheelModeRow1 .mode-tab').length === 4 &&
      d.querySelectorAll('#wheelModeRow2 .mode-tab').length === 3);
    const near = d.querySelector('#wheelModeRow1 .mode-tab');
    const far = d.querySelector('#wheelModeRow2 .mode-tab');
    ok('ряды — две разные внешние вложенные дуги',
      near?.style.getPropertyValue('--wheel-mode-radius') === '13.5rem' &&
      far?.style.getPropertyValue('--wheel-mode-radius') === '16.5rem');
    ok('ближняя дуга несёт четыре типа, дальняя — три',
      d.querySelectorAll('#wheelModeRow1 .mode-tab').length === 4 &&
      d.querySelectorAll('#wheelModeRow2 .mode-tab').length === 3);
    ok('дуги собраны компактнее прежнего широкого разлёта',
      near?.style.getPropertyValue('--wheel-mode-angle') === '202deg' &&
      d.querySelector('#wheelModeRow1 .mode-tab:last-child')?.style.getPropertyValue('--wheel-mode-angle') === '158deg');
    ok('дальний ряд из трёх собран уже, как нижний ряд 0.410',
      far?.style.getPropertyValue('--wheel-mode-angle') === '192deg' &&
      d.querySelector('#wheelModeRow2 .mode-tab:last-child')?.style.getPropertyValue('--wheel-mode-angle') === '168deg');
    ok('ближняя дуга не наезжает на SVG-кольцо',
      Number.parseFloat(near?.style.getPropertyValue('--wheel-mode-radius')) >= 13.5);
    const wheelSource = fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8');
    ok('вход качеств не перезаписывает transform их позиционирования',
      /@keyframes wheel-quality-in\s*\{\s*from\s*\{\s*opacity:\s*0;\s*\}\s*to\s*\{\s*opacity:\s*1;\s*\}/.test(wheelSource));
    ok('длинная подпись сначала использует compact из ячеек',
      w.eval("fitWheelChordLabel('F#m(maj7)', 55, 24, 18, '600', '500')") === 'F#mΔ');
    ok('если compact не проходит, подпись оставляет корень и многоточие',
      w.eval("fitWheelChordLabel('F#mmaj13', 58, 24, 18, '600', '500')") === 'F#...');

    console.log('\n=== 2. Открытие и центрирование «Вокруг» ===');
    const fingeringTooltip = d.getElementById('fingering-tooltip');
    fingeringTooltip.style.display = 'block';
    w.eval('openChordWheel(document.querySelector(".chord-input")); positionContextualChordWheel();');
    ok('слой открыт', modal.classList.contains('open'));
    ok('открытие круга сразу скрывает тултип аппликатуры', fingeringTooltip.style.display === 'none');
    ok('слой объявлен видимым для AT', modal.getAttribute('aria-hidden') === 'false');
    ok('owner получает halo-состояние на время круга', owner.classList.contains('wheel-owner-active'));
    ok('круг помечает owner нейтральным selection-state для B-33', owner.classList.contains('is-cell-selected'));
    ok('режим при открытии — трезвучия', w.eval('wheelMode') === 'triads');
    ok('геометрия помечена вокруг', container.dataset.side === 'around');
    ok('центр SVG выровнен по центру ячейки',
      Math.abs((Number.parseFloat(container.style.left) + 192) - 510) < 1 &&
      Math.abs((Number.parseFloat(container.style.top) + 192) - 545) < 1,
      `${container.style.left}, ${container.style.top}`);

    console.log('\n=== 3. У края круг не смещается от ячейки ===');
    Object.defineProperty(w, 'innerHeight', { value: 700, configurable: true });
    w.eval('positionContextualChordWheel();');
    ok('центр остаётся на ячейке, даже когда низ выходит из viewport',
      Math.abs((Number.parseFloat(container.style.top) + 192) - 545) < 1,
      `${container.style.top} при viewport ${w.innerHeight}`);

    console.log('\n=== 4. Hover только показывает будущий аккорд ===');
    const beforePreview = input.value;
    const beforePreviewModel = w.eval('sections[0].squares[0].events[0].chord');
    const hoverSectors = Array.from(d.querySelectorAll('#circleSvg path.wheel-sector'));
    const hoverSector = hoverSectors[0];
    hoverSector.dispatchEvent(new w.Event('pointerover', { bubbles: true }));
    ok('hover включает временный preview в owner-ячейке', owner.classList.contains('wheel-preview'));
    ok('hover не меняет модель песни', w.eval('sections[0].squares[0].events[0].chord') === beforePreviewModel);
    hoverSectors[1].dispatchEvent(new w.Event('pointerover', { bubbles: true }));
    ok('между секторами остаётся outgoing ghost имени', !!owner.querySelector('.wheel-preview-ghost'));
    ok('следующее preview-имя входит отдельно от ghost', !!owner.querySelector('.wheel-preview-incoming'));
    ok('второй hover также не меняет модель песни', w.eval('sections[0].squares[0].events[0].chord') === beforePreviewModel);
    d.getElementById('circleSvg').dispatchEvent(new w.Event('pointerleave', { bubbles: true }));
    ok('уход с круга возвращает исходное имя ячейки', input.value === beforePreview);

    console.log('\n=== 5. Масштаб UI и прокрутка не отрывают круг от ячейки ===');
    Object.defineProperties(w, {
      scrollX: { value: 80, configurable: true },
      scrollY: { value: 120, configurable: true },
    });
    ownerRect = { left: 340, top: 440, width: 100, height: 80, right: 440, bottom: 520 };
    w.eval('writeUiScale(150);');
    ok('после UI-зумa круг заново привязан к document-координатам ячейки',
      Math.abs((Number.parseFloat(container.style.left) + 192) - 470) < 1 &&
      Math.abs((Number.parseFloat(container.style.top) + 192) - 600) < 1,
      `${container.style.left}, ${container.style.top}`);
    Object.defineProperties(w, {
      scrollX: { value: 0, configurable: true },
      scrollY: { value: 0, configurable: true },
    });
    ownerRect = { left: 420, top: 500, width: 180, height: 90, right: 600, bottom: 590 };
    w.eval('writeUiScale(125);');

    console.log('\n=== 6. Вне слоя — закрытие без смены аккорда ===');
    const beforeOutside = input.value;
    d.body.dispatchEvent(new w.Event('pointerdown', { bubbles: true }));
    ok('клик вне круга закрыл слой', !modal.classList.contains('open'));
    ok('клик вне круга не меняет аккорд', input.value === beforeOutside);
    ok('после закрытия у owner снят halo', !owner.classList.contains('wheel-owner-active'));
    ok('после обычного close у owner снят selection-state', !owner.classList.contains('is-cell-selected'));

    console.log('\n=== 7. Качество текущей ячейки и редкое закрепление ===');
    // 7 есть в штатной живой очереди: C7 открывается сразу в этом режиме.
    w.eval(`{
      const inp = document.querySelector('.chord-input');
      inp.value = 'C7';
      sections[0].squares[0].events[0].chord = 'C7';
      openChordWheel(inp);
    }`);
    ok('C7 открывает режим 7', w.eval('wheelMode') === '7', w.eval('wheelMode'));
    ok('7 подсвечена в дуге качеств', d.querySelector('.mode-tab.active')?.dataset.wheelMode === '7');
    d.querySelector('.mode-tab.active').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok('повторный клик качества возвращает трезвучия', w.eval('wheelMode') === 'triads');
    ok('смена качества мягко вводит новые подписи секторов', d.querySelectorAll('#circleSvg .wheel-label-entering').length > 0);
    const labelExitLayer = d.querySelector('#circleSvg .wheel-label-exit-layer');
    ok('смена качества сохраняет старые подписи до конца fade-out', !!labelExitLayer);
    ok('уходящие подписи не получают одновременно entering-анимацию',
      !labelExitLayer?.querySelector('.wheel-label-entering'));
    w.eval('closeChordWheel()');

    // Убираем 13 из живой очереди вручную, чтобы проверить именно
    // временную проекцию качества сохранённой ячейки, а не её обучение.
    w.eval(`{
      wheelExtModes.splice(0, wheelExtModes.length, ...WHEEL_EXT_DEFAULTS);
      renderWheelModeTabs();
      const inp = document.querySelector('.chord-input');
      inp.value = 'C13';
      sections[0].squares[0].events[0].chord = 'C13';
      openChordWheel(inp);
    }`);
    ok('редкое 13 закреплено на время открытия', w.eval('wheelPinnedExtension') === '13');
    ok('редкое 13 — первый и активный тип дуги',
      d.querySelector('.mode-tab')?.dataset.wheelMode === '13' &&
      d.querySelector('.mode-tab.active')?.dataset.wheelMode === '13');
    w.eval('closeChordWheel()');
    ok('после закрытия временное закрепление снято', w.eval('wheelPinnedExtension') === null);
    ok('13 не засорило живую очередь', !Array.from(d.querySelectorAll('.mode-tab')).some((b) => b.dataset.wheelMode === '13'));

    console.log('\n=== 8. Пустая ячейка — трезвучия ===');
    w.eval(`{
      const inp = document.querySelector('.chord-input');
      inp.value = '';
      sections[0].squares[0].events[0].chord = '';
      openChordWheel(inp);
    }`);
    ok('пустая ячейка открывает трезвучия', w.eval('wheelMode') === 'triads');
    ok('у пустой ячейки не подсвечен тип', d.querySelectorAll('.mode-tab.active').length === 0);
    w.eval('closeChordWheel()');

    console.log('\n=== 9. Повторный клик ячейки — ручной ввод ===');
    w.eval('openChordWheel(document.querySelector(".chord-input"));');
    owner.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok('повторный клик закрыл круг', !modal.classList.contains('open'));
    ok('повторный клик снял readonly', !input.hasAttribute('readonly'));
    ok('ручной ввод сохраняет selection-state owner-ячейки', owner.classList.contains('is-cell-selected'));
    ok('ручной ввод подавляет тултип аппликатуры', w.eval('isFingeringTooltipSuppressed(document.querySelector(".chord-wrapper"))'));
    // Не оставляем тестовую ячейку в режиме ввода: это же проверяет
    // обычный единый commit, не создавая изменения модели.
    w.eval('saveCurrentChord();');
    ok('после завершения ручного ввода тултип снова разрешён',
      !w.eval('isFingeringTooltipSuppressed(document.querySelector(".chord-wrapper"))'));
    ok('после commit ввода selection-state снят', !owner.classList.contains('is-cell-selected'));

    console.log('\n=== 10. Клик по реальному сектору фиксирует и закрывает ===');
    w.eval('openChordWheel(document.querySelector(".chord-input"));');
    const firstSector = d.querySelector('#circleSvg path');
    firstSector.dispatchEvent(new w.Event('pointerover', { bubbles: true }));
    const previewBeforeCommit = input.value;
    firstSector.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok('клик по сектору закрыл слой', !modal.classList.contains('open'));
    ok('клик по сектору записал аккорд в модель', w.eval('sections[0].squares[0].events[0].chord') === 'C');
    ok('commit оставляет уже показанное preview-имя без обратной подмены', input.value === previewBeforeCommit);
    ok('commit очищает transient preview-state', w.eval('wheelPreviewState') === null && !owner.classList.contains('wheel-preview'));
    ok('после commit имя аккорда получает короткое подтверждение', owner.classList.contains('wheel-commit-pop'));
    ok('после commit у owner снят halo круга', !owner.classList.contains('wheel-owner-active'));

    console.log('\n=== 11. Reduced motion не создаёт transitional слоёв ===');
    w.matchMedia = (query) => ({ matches: query.includes('prefers-reduced-motion: reduce') });
    w.eval('openChordWheel(document.querySelector(".chord-input")); setWheelMode("7");');
    ok('при reduced motion нет уходящего слоя подписей', !d.querySelector('#circleSvg .wheel-label-exit-layer'));
    const reducedSector = d.querySelectorAll('#circleSvg path.wheel-sector')[1];
    reducedSector.dispatchEvent(new w.Event('pointerover', { bubbles: true }));
    ok('при reduced motion preview не оставляет ghost', !owner.querySelector('.wheel-preview-ghost'));
    w.eval('closeChordWheel()');

    if (bad) process.exitCode = 1;
    else console.log('\nALL OK — B-40 context wheel');
  } catch (error) {
    console.error(error.stack || error);
    process.exitCode = 1;
  }
});
