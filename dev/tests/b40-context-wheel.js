// B-40 — контекстный круг аккордов.
// Контракт B-40: круг больше не модальный, геометрически окружает ячейку,
// а качества живой очереди идут двумя вложенными нижними дугами 4 + 3.
// Проверяем также открытие в качестве текущей ячейки и редкое закрепление.
const fs = require('fs');
const { JSDOM } = require('jsdom');

const resizeObservers = [];
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
    win.ResizeObserver = class {
      constructor(callback) { this.callback = callback; this.targets = []; resizeObservers.push(this); }
      observe(target) { this.targets.push(target); }
      unobserve(target) { this.targets = this.targets.filter((item) => item !== target); }
      disconnect() { this.targets = []; }
    };
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
    w.eval("addSection('Verse'); addSection('Chorus'); render();");
    const input = d.querySelector('.chord-input');
    w.eval(`{
      const inp = document.querySelector('.chord-input');
      inp.value = 'C';
      sections[0].squares[0].events[0].chord = 'C';
      syncChordDisplay(inp);
    }`);
    const owner = input.closest('.chord-wrapper');
    const targetInput = d.querySelectorAll('.chord-input')[1];
    const targetOwner = targetInput.closest('.chord-wrapper');
    targetInput.value = 'Cadd9';
    const modal = d.getElementById('chordWheelModal');
    const container = modal.querySelector('.wheel-container');
    const wheel = container.querySelector('.wheel-svg-wrap');
    const modeTabs = container.querySelector('.mode-tabs');

    // jsdom не раскладывает CSS. Даём функции якорения честную геометрию,
    // чтобы проверить именно формулы B-40, а не нулевые rect среды.
    let ownerRect = { left: 420, top: 500, width: 180, height: 90, right: 600, bottom: 590 };
    let targetOwnerRect = { left: 720, top: 650, width: 150, height: 70, right: 870, bottom: 720 };
    owner.getBoundingClientRect = () => ownerRect;
    targetOwner.getBoundingClientRect = () => targetOwnerRect;
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
    ok('закрытие зеркалит спокойную микрогеометрию opening',
      /@keyframes wheel-surface-in[\s\S]*?scale\(0\.985\)[\s\S]*?scale\(1\)/.test(wheelSource) &&
      /@keyframes wheel-surface-out[\s\S]*?scale\(1\)[\s\S]*?scale\(0\.985\)/.test(wheelSource));
    ok('opening и closing используют одинаковые тихие fade-дорожки',
      /wheel-surface-fade-in 0\.16s ease-in-out both/.test(wheelSource) &&
      /wheel-surface-fade-out 0\.16s ease-in-out both/.test(wheelSource));
    ok('дуги качеств тихо уходят вместе с closing, без мгновенного исчезновения',
      /wheel-quality-out 0\.12s ease-in-out both/.test(wheelSource));
    ok('hover сохраняет общий центр поверхности и подписи при spring/magnet-ответе',
      !/--wheel-hover-x/.test(wheelSource) &&
      /#circleSvg \.wheel-hoverable\.is-wheel-hovered[\s\S]*?translate: var\(--wheel-cursor-x, 0px\) var\(--wheel-cursor-y, 0px\);[\s\S]*?scale: var\(--wheel-cursor-scale, 1\);[\s\S]*?rotate: var\(--wheel-cursor-rotate, 0deg\);/.test(wheelSource) &&
      /transform-box: view-box;/.test(wheelSource) &&
      /--wheel-hover-origin-x/.test(wheelSource) &&
      /brightness\(1\.045\) saturate\(1\.06\)/.test(wheelSource) &&
      /transition: filter 0\.16s ease-in-out, opacity 0\.16s ease-in-out;/.test(wheelSource) &&
      !/transition: translate/.test(wheelSource) &&
      !/cubic-bezier\(0\.32, 1\.5, 0\.45, 1\)/.test(wheelSource) &&
      /function runWheelHoverTails\(timestamp\)/.test(wheelSource) &&
      /function runWheelNeighborReleases\(timestamp\)/.test(wheelSource) &&
      /function applyWheelHoverClasses\(state\)/.test(wheelSource) &&
      /requestAnimationFrame\(apply\)/.test(wheelSource));
    ok('карточки получают лёгкий theme-aware объём без смены geometry',
      /wheel-card-volume-overlay/.test(wheelSource) &&
      /rgba\(20, 30, 45, 0\.035\)/.test(wheelSource) &&
      /stop-opacity: 0\.045;/.test(wheelSource) &&
      /addWheelCardVolume =/.test(wheelSource) &&
      /pointer-events: none;/.test(wheelSource));
    ok('production объединяет четыре cursor-эффекта, а 0.410 доступен только явным Dev-переключателем',
      /const DEV_WHEEL_VARIANT_410 = '410'/.test(wheelSource) &&
      /function setDevWheelVariant\(variant\)/.test(wheelSource) &&
      /translate: var\(--wheel-cursor-x, 0px\)/.test(wheelSource) &&
      /rotate: var\(--wheel-cursor-rotate, 0deg\)/.test(wheelSource) &&
      /nx \* 3\.3/.test(wheelSource) &&
      /nx \* 2\.25/.test(wheelSource) &&
      /nx \* 1\.05/.test(wheelSource) &&
      /1\.03 \+ energy \* 0\.024/.test(wheelSource) &&
      /const WHEEL_CURSOR_RESPONSE_TAU_MS = 64/.test(wheelSource) &&
      /const WHEEL_CURSOR_ENTRY_TAU_MS = 100/.test(wheelSource) &&
      /const WHEEL_CURSOR_ENTRY_FRAMES = 12/.test(wheelSource) &&
      /const WHEEL_CURSOR_ENTRY_TARGET_MS = 260/.test(wheelSource) &&
      /entryTargetElapsed/.test(wheelSource) &&
      /const entryGain = entryPhase \* \(2 - entryPhase\)/.test(wheelSource) &&
      /response\.rawTarget/.test(wheelSource) &&
      /const WHEEL_CURSOR_TAIL_MS = 140/.test(wheelSource) &&
      /const WHEEL_NEIGHBOR_RELEASE_MS = 140/.test(wheelSource) &&
      /function beginWheelNeighborRelease\(nodes\)/.test(wheelSource) &&
      /sameRingIncomingNeighbors/.test(wheelSource) &&
      /is-wheel-neighbor-release/.test(wheelSource) &&
      /const WHEEL_CURSOR_GLOBAL_RANGE = 64/.test(wheelSource) &&
      /function wheelSvgPointerPoint\(event\)/.test(wheelSource) &&
      /Number\.isFinite\(event\?\.clientX\)/.test(wheelSource) &&
      /response\.anchor\.x/.test(wheelSource) &&
      !/sector\?\.getBoundingClientRect/.test(wheelSource) &&
      /function beginWheelHoverTail\(state\)/.test(wheelSource) &&
      /preserveSurfaceTail: !!previousState/.test(wheelSource) &&
      /is-wheel-handoff-out/.test(wheelSource) &&
      /entryFrames: WHEEL_CURSOR_ENTRY_FRAMES/.test(wheelSource) &&
      /function runWheelCursorResponseFrame\(timestamp\)/.test(wheelSource) &&
      /factor: 1 \+ energy \* 0\.63/.test(wheelSource) &&
      /const WHEEL_NEIGHBOR_REPEL_MAX = 0\.9/.test(wheelSource) &&
      /function getWheelNeighborRepulsion\(response, node, baseX, baseY\)/.test(wheelSource) &&
      /--wheel-neighbor-repel-x/.test(wheelSource) &&
      /function updateWheelCursorResponse\(nodes, event\)/.test(wheelSource) &&
      !/WHEEL_HOVER_PROTOTYPES/.test(wheelSource) &&
      !/wheel-hover':Object\.entries/.test(wheelSource));
    ok('hover раздвигает соседние пары в своём и соседнем ряду',
      /const WHEEL_HOVER_NEIGHBOR_DISTANCES = \[1\.6, 0\.8\]/.test(wheelSource) &&
      /majorToMinor: \{ aligned: 3\.2, side: 1\.6 \}/.test(wheelSource) &&
      /minorToMajor: \{ aligned: 3\.2, side: 1\.6 \}/.test(wheelSource) &&
      /const crossRing = ring === 'major' \? 'minor'/.test(wheelSource) &&
      /includeSelected: true/.test(wheelSource) &&
      /is-wheel-neighbor-spread/.test(wheelSource) &&
      /node\.classList\.contains\('is-wheel-selected'\)/.test(wheelSource));
    ok('выбранный аккорд получает явный marker без сжатия gap',
      /#circleSvg \.wheel-sector\.is-wheel-selected[\s\S]*?fill: color-mix\(in srgb, var\(--wheel-segment-fill-out\) 62%, var\(--color-accent\)\)/.test(wheelSource) &&
      /stroke: var\(--color-accent\);/.test(wheelSource) &&
      /Контур использует штатные 1\.2 SVG-px/.test(wheelSource) &&
      /html:not\(\[data-theme='dark'\]\) #circleSvg \.wheel-sector\.is-wheel-selected/.test(wheelSource) &&
      !/wheel-selected-label-badge/.test(wheelSource));
    ok('круг отслеживает layout-shift от hover-раскрытия секции',
      /function trackWheelAnchorDuringLayout\(duration = WHEEL_LAYOUT_TRACK_MS\)/.test(wheelSource) &&
      /document\.addEventListener\('transitionrun'/.test(wheelSource) &&
      /const chordLayoutObserver = new ResizeObserver\(\(\) =>/.test(wheelSource));
    ok('card-gap узкий и постоянный, углы явно скруглены, круг без обводок',
      /const WHEEL_CARD_GAP = 2\.5;/.test(wheelSource) &&
      /Math\.asin\(WHEEL_CARD_HALF_SEAM \/ outerRadius\)/.test(wheelSource) &&
      /Math\.asin\(WHEEL_CARD_HALF_SEAM \/ innerRadius\)/.test(wheelSource) &&
      /createWheelCardPath\(start, end, Ro - WHEEL_CARD_PERIMETER, Rs \+ WHEEL_CARD_HALF_SEAM\)/.test(wheelSource) &&
      /createWheelCardPath\(start, end, Rs - WHEEL_CARD_HALF_SEAM, Ri \+ WHEEL_CARD_PERIMETER\)/.test(wheelSource) &&
      /const WHEEL_CARD_CORNER = 10;/.test(wheelSource) &&
      /Q\$\{outerEnd\.x\}/.test(wheelSource) &&
      /const WHEEL_CARD_OUTLINE = 1\.2;/.test(wheelSource) &&
      /setAttribute\('stroke', 'var\(--color-border-medium\)'\)/.test(wheelSource) &&
      /setAttribute\('pointer-events', 'visibleFill'\)/.test(wheelSource) &&
      /gapCatcher\.setAttribute\('pointer-events', 'fill'\)/.test(wheelSource) &&
      !/classList\.add\('wheel-boundary'\)/.test(wheelSource));
    ok('переезд круга использует отдельный FLIP-retarget, не opening/closing',
      /function retargetChordWheel\(inp, \{ suppressOwnerClick = false, revealDirection = null \} = \{\}\)/.test(wheelSource) &&
      /function revealChordWheelOwnerForKeyboard\(inp, key\)/.test(wheelSource) &&
      /transform \${WHEEL_RETARGET_MS}ms/.test(wheelSource));
    ok('major-дуга оставляет безопасные поля для длинных accidental-подписей',
      /const WHEEL_MAJOR_LABEL_MAX_WIDTH = 72;/.test(wheelSource) &&
      /fitWheelChordLabel\(dm, WHEEL_MAJOR_LABEL_MAX_WIDTH, 28, 20/.test(wheelSource));
    // В реальном шрифте два символа корня заметно шире одной буквы. Этот
    // локальный метрический сценарий ловит именно D#add9/A#add9/G#add9:
    // полная подпись выходит за 72, а cell-compatible compact — нет.
    const nativeWheelTextWidth = w.getTextWidth;
    w.getTextWidth = (text, size) => String(text).length * Number(size) * 0.6;
    const sharpAdd9Label = w.eval("fitWheelChordLabel('D#add9', WHEEL_MAJOR_LABEL_MAX_WIDTH, 28, 20, '700', '500')");
    const plainAdd9Label = w.eval("fitWheelChordLabel('Cadd9', WHEEL_MAJOR_LABEL_MAX_WIDTH, 28, 20, '700', '500')");
    w.getTextWidth = nativeWheelTextWidth;
    ok('широкий D#add9 получает compact-подпись без потери значения', sharpAdd9Label === 'D#(9)', sharpAdd9Label);
    ok('короткий Cadd9 сохраняет полную подпись', plainAdd9Label === 'Cadd9', plainAdd9Label);
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
    ok('текущий аккорд ячейки сразу выделен на соответствующем секторе и подписи',
      d.querySelectorAll('#circleSvg .wheel-sector.is-wheel-selected').length === 1 &&
      d.querySelector('#circleSvg .wheel-sector.is-wheel-selected')?.dataset.wheelRing === 'major' &&
      d.querySelectorAll('#circleSvg .wheel-chord-label.is-wheel-selected').length === 1);
    const gapCatcher = d.querySelector('#circleSvg .wheel-gap-catcher');
    const beforeGapInput = input.value;
    let gapReachedDocument = false;
    const noteGapAtDocument = () => { gapReachedDocument = true; };
    d.addEventListener('pointerdown', noteGapAtDocument);
    const gapDown = new w.Event('pointerdown', { bubbles: true, cancelable: true });
    const gapClick = new w.MouseEvent('click', { bubbles: true, cancelable: true });
    gapCatcher?.dispatchEvent(gapDown);
    gapCatcher?.dispatchEvent(gapClick);
    d.removeEventListener('pointerdown', noteGapAtDocument);
    ok('межкарточные зазоры некликабельны и не проваливаются в редактор',
      Array.from(d.querySelectorAll('#circleSvg path.wheel-sector')).every((sector) =>
        sector.getAttribute('pointer-events') === 'visibleFill') &&
      gapDown.defaultPrevented && gapClick.defaultPrevented && !gapReachedDocument &&
      modal.classList.contains('open') && input.value === beforeGapInput);
    ok('геометрия помечена вокруг', container.dataset.side === 'around');
    ok('центр SVG выровнен по центру ячейки',
      Math.abs((Number.parseFloat(container.style.left) + 192) - 510) < 1 &&
      Math.abs((Number.parseFloat(container.style.top) + 192) - 545) < 1,
      `${container.style.left}, ${container.style.top}`);
    const sectionsRoot = d.getElementById('sectionsContainer');
    const layoutObserver = resizeObservers.find((observer) => observer.targets.includes(sectionsRoot));
    const nativeRaf = w.requestAnimationFrame;
    const beforeLayoutShiftTop = Number.parseFloat(container.style.top);
    w.requestAnimationFrame = (callback) => { callback(); return 1; };
    ownerRect = { left: 420, top: 560, width: 180, height: 90, right: 600, bottom: 650 };
    layoutObserver?.callback([]);
    ok('layout shift соседней секции немедленно перепривязывает открытый круг к owner',
      !!layoutObserver && Number.parseFloat(container.style.top) > beforeLayoutShiftTop + 40,
      `${beforeLayoutShiftTop} → ${container.style.top}`);
    w.requestAnimationFrame = nativeRaf;
    ownerRect = { left: 420, top: 500, width: 180, height: 90, right: 600, bottom: 590 };
    w.eval('positionContextualChordWheel();');

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
    const nativeHoverRaf = w.requestAnimationFrame;
    w.requestAnimationFrame = (callback) => { callback(); return 1; };
    hoverSector.dispatchEvent(new w.Event('pointerover', { bubbles: true }));
    ok('hover включает временный preview в owner-ячейке', owner.classList.contains('wheel-preview'));
    ok('hover не меняет модель песни', w.eval('sections[0].squares[0].events[0].chord') === beforePreviewModel);
    const hoveredChordLabel = d.querySelector('#circleSvg .wheel-chord-label.is-wheel-hovered');
    ok('имя сохраняет координаты своей сектор-карточки при её увеличении',
      hoveredChordLabel?.style.getPropertyValue('--wheel-hover-origin-x') === hoverSector.style.getPropertyValue('--wheel-hover-origin-x') &&
      hoveredChordLabel?.style.getPropertyValue('--wheel-hover-origin-y') === hoverSector.style.getPropertyValue('--wheel-hover-origin-y'));
    hoverSector.getBoundingClientRect = () => ({ left: 20, top: 30, width: 100, height: 80, right: 120, bottom: 110 });
    d.getElementById('circleSvg').getBoundingClientRect = () => ({ left: 20, top: 30, width: 100, height: 80, right: 120, bottom: 110 });
    const majorNear = Array.from(d.querySelectorAll('[data-wheel-hover-ring="major"][data-wheel-hover-index="1"]'));
    const majorFar = Array.from(d.querySelectorAll('[data-wheel-hover-ring="major"][data-wheel-hover-index="2"]'));
    const minorAligned = Array.from(d.querySelectorAll('[data-wheel-hover-ring="minor"][data-wheel-hover-index="0"]'));
    const minorSide = Array.from(d.querySelectorAll('[data-wheel-hover-ring="minor"][data-wheel-hover-index="1"]'));
    const spreadLength = (node) => Math.hypot(
      Number.parseFloat(node.style.getPropertyValue('--wheel-neighbor-x')) || 0,
      Number.parseFloat(node.style.getPropertyValue('--wheel-neighbor-y')) || 0
    );
    // В центре карточки cursor-push нейтрален: фиксируем базовую симметрию.
    hoverSector.dispatchEvent(new w.MouseEvent('pointermove', { bubbles: true, clientX: 70, clientY: 70 }));
    ok('внутренний ряд отступает внутрь настолько же, как внешний наружу',
      minorAligned.length > 0 && minorSide.length > 0 &&
      Math.abs(spreadLength(minorAligned[0]) - 3.2) < 0.02 &&
      Math.abs(spreadLength(minorSide[0]) - 1.6) < 0.02);
    const baselineNeighborSpread = spreadLength(majorNear[0]);
    hoverSector.dispatchEvent(new w.MouseEvent('pointermove', { bubbles: true, clientX: 100, clientY: 50 }));
    ok('rAF плавно объединяет рост, магнит, наклон и свет сектор-карточки',
      Number.parseFloat(hoverSector.style.getPropertyValue('--wheel-cursor-x')) > 1.5 &&
      Number.parseFloat(hoverSector.style.getPropertyValue('--wheel-cursor-scale')) > 1.03 &&
      Number.parseFloat(hoverSector.style.getPropertyValue('--wheel-cursor-rotate')) > 0.6 &&
      Number.parseFloat(hoverSector.style.getPropertyValue('--wheel-cursor-light-x')) > 1.3);
    // Настоящий rAF не должен перескакивать из нуля в target: два кадра
    // обязаны давать две возрастающие промежуточные позиции.
    const queuedCursorFrames = [];
    w.eval('clearWheelCursorResponse(wheelHoverState)');
    w.requestAnimationFrame = (callback) => { queuedCursorFrames.push(callback); return queuedCursorFrames.length; };
    hoverSector.dispatchEvent(new w.MouseEvent('pointermove', { bubbles: true, clientX: 70, clientY: 70 }));
    hoverSector.dispatchEvent(new w.MouseEvent('pointermove', { bubbles: true, clientX: 100, clientY: 50 }));
    queuedCursorFrames.shift()?.(100);
    const firstInterpolatedX = Number.parseFloat(hoverSector.style.getPropertyValue('--wheel-cursor-x'));
    queuedCursorFrames.shift()?.(116);
    const secondInterpolatedX = Number.parseFloat(hoverSector.style.getPropertyValue('--wheel-cursor-x'));
    ok('rAF ведёт cursor по непрерывным промежуточным кадрам, а не pointer-ступенями',
      firstInterpolatedX > 0 && firstInterpolatedX < 1.98 &&
      secondInterpolatedX > firstInterpolatedX && secondInterpolatedX < 1.98);
    w.eval('cancelWheelCursorResponseFrame()');
    w.requestAnimationFrame = (callback) => { callback(); return 1; };
    hoverSector.dispatchEvent(new w.MouseEvent('pointermove', { bubbles: true, clientX: 70, clientY: 70 }));
    hoverSector.dispatchEvent(new w.MouseEvent('pointermove', { bubbles: true, clientX: 100, clientY: 50 }));
    ok('cursor инерционно усиливает разъезд соседей от центра карточки',
      spreadLength(majorNear[0]) > baselineNeighborSpread);
    const repelLength = (node) => Math.hypot(
      Number.parseFloat(node.style.getPropertyValue('--wheel-neighbor-repel-x')) || 0,
      Number.parseFloat(node.style.getPropertyValue('--wheel-neighbor-repel-y')) || 0
    );
    ok('магнитящаяся card геометрически отталкивает все свои соседи',
      [majorNear[0], majorFar[0], minorAligned[0], minorSide[0]].every((node) =>
        node?.classList.contains('is-wheel-neighbor-spread') && repelLength(node) > 0));
    ok('hover раздвигает первую и вторую соседние пары пропорционально',
      majorNear.length > 0 && majorFar.length > 0 &&
      majorNear.every((node) => node.classList.contains('is-wheel-neighbor-spread')) &&
      majorFar.every((node) => node.classList.contains('is-wheel-neighbor-spread')) &&
      spreadLength(majorNear[0]) > spreadLength(majorFar[0]));
    ok('hover раздвигает ряд сверху/снизу: напротив сильнее, боковая пара слабее',
      minorAligned.every((node) => node.classList.contains('is-wheel-neighbor-spread')) &&
      minorSide.every((node) => node.classList.contains('is-wheel-neighbor-spread')) &&
      spreadLength(minorAligned[0]) > spreadLength(minorSide[0]));
    const selectedMajor = d.querySelector('[data-wheel-ring="major"].is-wheel-selected');
    // На A → B в одном кольце B уже была раздвинутым соседом A. Проверяем,
    // что прежде видимый geometry-gap переживает boundary отдельным хвостом,
    // а не превращается в перенос cursor-vector новой card.
    const releaseFrames = [];
    w.requestAnimationFrame = (callback) => { releaseFrames.push(callback); return releaseFrames.length; };
    const sameRingIncoming = Array.from(d.querySelectorAll('[data-wheel-hover-ring="major"][data-wheel-hover-index="1"]'));
    d.querySelector('[data-wheel-hover-ring="major"][data-wheel-hover-index="1"].wheel-sector')
      ?.dispatchEvent(new w.Event('pointerover', { bubbles: true }));
    const releaseLength = (node) => Math.hypot(
      Number.parseFloat(node.style.getPropertyValue('--wheel-neighbor-release-x')) || 0,
      Number.parseFloat(node.style.getPropertyValue('--wheel-neighbor-release-y')) || 0
    );
    ok('same-ring вход отдельно отпускает прежний neighbor-gap',
      sameRingIncoming.length > 0 &&
      sameRingIncoming.every((node) => node.classList.contains('is-wheel-neighbor-release')) &&
      releaseLength(sameRingIncoming[0]) > 1.5);
    // Сначала release переводит только geometry-channel к нулю, затем
    // отдельный rAF применяет neutral surface новой hovered-карточки.
    releaseFrames.splice(0).forEach((callback) => callback(100));
    w.requestAnimationFrame = (callback) => { callback(); return 1; };
    ok('выбранный marker не сдвигается, даже если он сосед hovered-карточки',
      !selectedMajor?.classList.contains('is-wheel-neighbor-spread') &&
      Array.from(d.querySelectorAll('[data-wheel-hover-ring="major"][data-wheel-hover-index="0"]'))
        .every((node) => !node.classList.contains('is-wheel-neighbor-spread')));
    const selectedIndex = selectedMajor?.dataset.wheelHoverIndex;
    const innerCounterpart = d.querySelector(`[data-wheel-hover-ring="minor"][data-wheel-hover-index="${selectedIndex}"].wheel-sector`);
    // Реальный pointerover уже несёт координаты. Оставляем первый sample
    // ровно в anchor, чтобы проверить исходный cross-ring gap без усиления.
    innerCounterpart?.dispatchEvent(new w.MouseEvent('pointerover', { bubbles: true, clientX: 70, clientY: 70 }));
    innerCounterpart?.dispatchEvent(new w.MouseEvent('pointermove', { bubbles: true, clientX: 70, clientY: 70 }));
    ok('внешний selected marker сильнее отступает при hover внутреннего ряда',
      selectedMajor?.classList.contains('is-wheel-neighbor-spread') &&
      Math.abs(spreadLength(selectedMajor) - 3.2) < 0.02);
    ok('между секторами остаётся outgoing ghost имени', !!owner.querySelector('.wheel-preview-ghost'));
    ok('следующее preview-имя входит отдельно от ghost', !!owner.querySelector('.wheel-preview-incoming'));
    ok('второй hover также не меняет модель песни', w.eval('sections[0].squares[0].events[0].chord') === beforePreviewModel);
    d.getElementById('circleSvg').dispatchEvent(new w.Event('pointerleave', { bubbles: true }));
    w.requestAnimationFrame = nativeHoverRaf;
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
    ok('после close остаётся короткая некликабельная closing-фаза', modal.classList.contains('closing'));
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
    ok('новое открытие отменяет незавершённую closing-фазу', !modal.classList.contains('closing'));
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
    const pinnedButtonBeforeClose = d.querySelector('.mode-tab');
    // Делаем lifecycle close детерминированным: не ждём реального времени,
    // чтобы другие отложенные задачи редактора не меняли fixture между
    // проверками. Захватываем только exit-timer круга и завершаем его вручную.
    const nativeSetTimeout = w.setTimeout.bind(w);
    const nativeClearTimeout = w.clearTimeout.bind(w);
    let finishClose = null;
    const closeTimerId = 981;
    w.setTimeout = (callback, delay, ...args) => {
      if (delay === 170) {
        finishClose = () => callback(...args);
        return closeTimerId;
      }
      return nativeSetTimeout(callback, delay, ...args);
    };
    w.clearTimeout = (id) => id === closeTimerId ? undefined : nativeClearTimeout(id);
    w.eval('closeChordWheel()');
    ok('после закрытия временное закрепление снято семантически', w.eval('wheelPinnedExtension') === null);
    ok('pinned-кнопки остаются теми же DOM-узлами на время fade-out',
      modal.classList.contains('closing') && d.querySelector('.mode-tab') === pinnedButtonBeforeClose &&
      pinnedButtonBeforeClose?.dataset.wheelMode === '13');
    ok('13 не засорило живую очередь', !w.eval('wheelExtModes.includes("13")'));
    finishClose?.();
    w.setTimeout = nativeSetTimeout;
    w.clearTimeout = nativeClearTimeout;
    ok('после exit-фазы pinned-кнопка очищена из DOM',
      !modal.classList.contains('closing') && !Array.from(d.querySelectorAll('.mode-tab')).some((b) => b.dataset.wheelMode === '13'));

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
    const firstSector = d.querySelector('#circleSvg path.wheel-sector');
    firstSector.dispatchEvent(new w.Event('pointerover', { bubbles: true }));
    const previewBeforeCommit = input.value;
    firstSector.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok('клик по сектору закрыл слой', !modal.classList.contains('open'));
    ok('клик по сектору записал аккорд в модель', w.eval('sections[0].squares[0].events[0].chord') === 'C');
    ok('commit оставляет уже показанное preview-имя без обратной подмены', input.value === previewBeforeCommit);
    ok('commit очищает transient preview-state', w.eval('wheelPreviewState') === null && !owner.classList.contains('wheel-preview'));
    ok('после commit имя аккорда получает короткое подтверждение', owner.classList.contains('wheel-commit-pop'));
    ok('после commit у owner снят halo круга', !owner.classList.contains('wheel-owner-active'));

    console.log('\n=== 10.5. Круг плавно переезжает к другой ячейке ===');
    w.eval('openChordWheel(document.querySelector(".chord-input"));');
    targetOwner.dispatchEvent(new w.Event('pointerdown', { bubbles: true, cancelable: true }));
    // В реальном браузере preventDefault обычно подавляет click; посылаем
    // его явно, чтобы проверить guard браузеров, которые click всё же шлют.
    targetOwner.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok('клик по другой ячейке не закрывает круг', modal.classList.contains('open') && !modal.classList.contains('closing'));
    ok('переезд сразу меняет active owner', w.eval('activeChordInput') === targetInput && targetOwner.classList.contains('wheel-owner-active'));
    ok('старый owner теряет halo и selection-state', !owner.classList.contains('wheel-owner-active') && !owner.classList.contains('is-cell-selected'));
    ok('click, породивший переезд, не включает ручной ввод', targetInput.hasAttribute('readonly') && targetOwner.classList.contains('is-cell-selected'));
    ok('контейнер идёт к точной новой document-привязке с transform-motion',
      Number.parseFloat(container.style.left) === 603 && Number.parseFloat(container.style.top) === 493 &&
      container.dataset.wheelRetargeting === 'true' && container.style.transition.includes('transform 200ms'));
    ok('режим нового owner обновлён в рамках того же переезда', w.eval('wheelMode') === 'add9');
    ok('переезд переносит выбранный marker на add9-сектор нового owner',
      d.querySelectorAll('#circleSvg .wheel-sector.is-wheel-selected').length === 1 &&
      d.querySelector('#circleSvg .wheel-sector.is-wheel-selected')?.dataset.wheelRing === 'major');
    w.eval('closeChordWheel()');

    console.log('\n=== 10.6. Стрелки сохраняют ряд zoomed-секции и показывают owner ===');
    w.eval('openChordWheel(document.querySelector(".chord-input"));');
    // Изолируем правило приоритета от штатных соседей fixture: ниже
    // добавлены ровно три конкурирующие readonly-ячейки с нужной геометрией.
    const temporarilyEditable = Array.from(d.querySelectorAll('.chord-input[readonly]')).filter((node) => node !== input);
    temporarilyEditable.forEach((node) => node.removeAttribute('readonly'));
    const currentViewport = owner.closest('.squares-viewport');
    const currentSquare = owner.closest('.square');
    const sameSquareOwner = d.createElement('div');
    sameSquareOwner.className = 'chord-wrapper';
    const sameSquareInput = d.createElement('input');
    sameSquareInput.className = 'chord-input';
    sameSquareInput.readOnly = true;
    sameSquareInput.dataset.ei = String(Number(input.dataset.ei) + 1);
    sameSquareOwner.appendChild(sameSquareInput);
    currentSquare.appendChild(sameSquareOwner);
    const sameViewportOwner = d.createElement('div');
    sameViewportOwner.className = 'chord-wrapper';
    const sameViewportInput = d.createElement('input');
    sameViewportInput.className = 'chord-input';
    sameViewportInput.readOnly = true;
    sameViewportOwner.appendChild(sameViewportInput);
    currentViewport.appendChild(sameViewportOwner);
    const lowerViewport = d.createElement('div');
    lowerViewport.className = 'squares-viewport';
    const lowerOwner = d.createElement('div');
    lowerOwner.className = 'chord-wrapper';
    const lowerInput = d.createElement('input');
    lowerInput.className = 'chord-input';
    lowerInput.readOnly = true;
    lowerOwner.appendChild(lowerInput);
    lowerViewport.appendChild(lowerOwner);
    d.body.appendChild(lowerViewport);
    sameSquareOwner.getBoundingClientRect = () => ({ left: 660, top: 500, width: 120, height: 90, right: 780, bottom: 590 });
    sameViewportOwner.getBoundingClientRect = () => ({ left: 660, top: 500, width: 120, height: 90, right: 780, bottom: 590 });
    lowerOwner.getBoundingClientRect = () => ({ left: 530, top: 550, width: 120, height: 90, right: 650, bottom: 640 });
    ok('ArrowRight выбирает логически следующую ячейку текущего квадрата, даже если нижняя ближе',
      w.eval('getDirectionalChordWheelInput("ArrowRight")') === sameSquareInput);
    sameSquareOwner.remove();
    ok('после конца квадрата ArrowRight предпочитает текущую zoomed-секцию нижней',
      w.eval('getDirectionalChordWheelInput("ArrowRight")') === sameViewportInput);
    sameViewportOwner.remove();
    lowerViewport.remove();
    temporarilyEditable.forEach((node) => node.setAttribute('readonly', ''));
    const targetViewport = targetOwner.closest('.squares-viewport');
    const localScrolls = [];
    const pageScrolls = [];
    const nativePageScrollTo = w.scrollTo;
    const nativeViewportRect = targetViewport?.getBoundingClientRect;
    if (targetViewport) {
      Object.defineProperties(targetViewport, {
        clientWidth: { value: 400, configurable: true },
        scrollWidth: { value: 1000, configurable: true },
      });
      targetViewport.scrollLeft = 100;
      targetViewport.getBoundingClientRect = () => ({ left: 160, top: 430, right: 600, bottom: 780, width: 440, height: 350 });
      targetViewport.scrollTo = (options) => { localScrolls.push(options); targetViewport.scrollLeft = options.left; };
    }
    Object.defineProperty(d.documentElement, 'scrollHeight', { value: 3000, configurable: true });
    w.scrollTo = (options) => pageScrolls.push(options);
    w.eval('openChordWheel(document.querySelector(".chord-input"));');
    const arrowRight = new w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    d.dispatchEvent(arrowRight);
    ok('ArrowRight подавляет штатный scroll браузера при открытом круге', arrowRight.defaultPrevented);
    ok('ArrowRight ретаргетит круг к ближайшей ячейке справа',
      w.eval('activeChordInput') === targetInput && modal.classList.contains('open') && targetOwner.classList.contains('wheel-owner-active'));
    ok('переезд стрелкой плавно прокручивает zoomed-секцию, затем страницу к owner',
      localScrolls.some((call) => call.left > 100 && call.behavior === 'smooth') &&
      pageScrolls.some((call) => call.top > 0 && call.behavior === 'smooth'));
    ok('переезд стрелкой не ставит click-guard ручного ввода', w.eval('wheelRetargetClickInput') === null);
    w.scrollTo = nativePageScrollTo;
    if (targetViewport) targetViewport.getBoundingClientRect = nativeViewportRect;
    w.eval('closeChordWheel()');

    console.log('\n=== 11. Reduced motion не создаёт transitional слоёв ===');
    w.matchMedia = (query) => ({ matches: query.includes('prefers-reduced-motion: reduce') });
    w.eval('openChordWheel(document.querySelector(".chord-input")); retargetChordWheel(document.querySelectorAll(".chord-input")[1]); setWheelMode("7");');
    ok('при reduced motion переезд сразу стоит на новой ячейке, без transform-слоя',
      w.eval('activeChordInput') === targetInput && !container.dataset.wheelRetargeting && !container.style.transition);
    ok('при reduced motion нет уходящего слоя подписей', !d.querySelector('#circleSvg .wheel-label-exit-layer'));
    const reducedSector = d.querySelectorAll('#circleSvg path.wheel-sector')[1];
    reducedSector.dispatchEvent(new w.Event('pointerover', { bubbles: true }));
    ok('при reduced motion preview не оставляет ghost', !targetOwner.querySelector('.wheel-preview-ghost'));
    w.eval('closeChordWheel()');
    ok('при reduced motion closing-фаза не задерживает скрытие', !modal.classList.contains('closing'));

    console.log('\n=== 12. Dev оставляет буквальный круг 0.410 для сравнения ===');
    // Вариант session-only и намеренно закрывает текущую поверхность: два
    // разных SVG и focus-trap не должны делить один открытый кадр.
    w.matchMedia = () => ({ matches: false });
    // Выбираем вариант именно тем маршрутом, которым пользуется разработчик,
    // а не скрытым вызовом функции: selector — часть согласованного Dev UX.
    w.eval('openDevPalette()');
    Array.from(d.querySelectorAll('.dev-command')).find((node) => node.textContent.includes('Круг аккордов'))?.click();
    Array.from(d.querySelectorAll('.dev-command')).find((node) => node.textContent.includes('Круг 0.410'))?.click();
    const legacyModal = d.getElementById('chordWheelModal');
    ok('Dev переключил только круг на 0.410 и закрыл текущую поверхность',
      legacyModal.classList.contains('is-dev-wheel-410') && !legacyModal.classList.contains('open') &&
      w.eval('devWheelVariant') === '410');
    ok('0.410 возвращает исходную modal-разметку и геометрию',
      !!legacyModal.querySelector('.wheel-overlay') && !!legacyModal.querySelector('.center-pencil-btn') &&
      d.getElementById('circleSvg')?.getAttribute('viewBox') === '0 0 540 460');
    w.eval('openChordWheel(document.querySelector(".chord-input"));');
    ok('0.410 открывается в исходных triads без production-card hover',
      legacyModal.classList.contains('open') && w.eval('wheelMode') === 'triads' &&
      d.querySelectorAll('#circleSvg path.wheel-sector').length === 0 &&
      d.querySelectorAll('#circleSvg path[stroke-width="0.8"]').length >= 12);
    const legacyArrow = new w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    d.dispatchEvent(legacyArrow);
    ok('0.410 не получает современный keyboard-retarget',
      !legacyArrow.defaultPrevented && w.eval('activeChordInput') === input);
    const legacySector = d.querySelector('#circleSvg path[stroke-width="0.8"]');
    legacySector?.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    ok('оригинальный Dev-круг всё ещё фиксирует корень и сразу закрывается',
      !legacyModal.classList.contains('open') && w.eval('sections[0].squares[0].events[0].chord') === 'C');
    w.eval('openDevPalette()');
    Array.from(d.querySelectorAll('.dev-command')).find((node) => node.textContent.includes('Круг аккордов'))?.click();
    Array.from(d.querySelectorAll('.dev-command')).find((node) => node.textContent.includes('Текущий круг'))?.click();
    ok('возврат к текущему кругу восстанавливает production-разметку без persistence',
      !legacyModal.classList.contains('is-dev-wheel-410') && !legacyModal.querySelector('.wheel-overlay') &&
      d.getElementById('circleSvg')?.getAttribute('viewBox') === '0 0 540 540' &&
      w.eval('devWheelVariant') === 'current');

    if (bad) process.exitCode = 1;
    else console.log('\nALL OK — B-40 context wheel');
  } catch (error) {
    console.error(error.stack || error);
    process.exitCode = 1;
  }
});
