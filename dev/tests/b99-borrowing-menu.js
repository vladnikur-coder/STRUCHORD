#!/usr/bin/env node
// B-99 (0.546): меню заимствований на круге. Круг в режиме трезвучий —
// меню для сочинения: у каждого сектора ступень и все лады этой тональности,
// в которых аккорд работает. Это НЕ анализ прогрессии: строгие профили
// остаются в редакторе/ленте; круг отдельно показывает палитру ладов.
const fs = require('fs');
const { JSDOM } = require('jsdom');

const dom = new JSDOM(fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8'), {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://localhost/',
  beforeParse(w) {
    w.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    w.cancelAnimationFrame = (id) => clearTimeout(id);
    w.HTMLCanvasElement.prototype.getContext = () => ({
      font: '', measureText: () => ({ width: 10 }),
      clearRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {}, moveTo() {},
      lineTo() {}, closePath() {}, save() {}, restore() {}, translate() {}, rotate() {},
      fillText() {}, strokeText() {}, setTransform() {}, scale() {},
      createLinearGradient: () => ({ addColorStop() {} }),
    });
  },
});
const w = dom.window;
w.AudioContext = w.webkitAudioContext = function () {
  return { currentTime: 0, state: 'running', resume() {} };
};

let failures = 0;
function ok(name, condition, detail = '') {
  console.log(`   ${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures += 1;
}
const menu = (chord, key) => w.getBorrowingMenuProfile(chord, key);

// ===== 1. Модель меню: классические заимствования на месте =====
const amD = menu('D', 'Am');
ok('Am: D — IV дорийского, миксолидийского и мелодического минора',
  amD?.degree === 'IV' && amD?.modes.join(',') === 'melodic-minor,dorian,mixolydian',
  JSON.stringify(amD));

const amE = menu('E', 'Am');
ok('Am: E — V гармонического минора (первым в списке)',
  amE?.degree === 'V' && amE?.modes[0] === 'harmonic-minor',
  JSON.stringify(amE));

const amFsm = menu('F#m', 'Am');
ok('Am: F#m — #vi мелодического минора (регресс качеств vi=min закрыт)',
  amFsm?.degree === '#vi' && amFsm?.modes.includes('melodic-minor') && amFsm?.modes.includes('lydian'),
  JSON.stringify(amFsm));

const amBb = menu('A#', 'Am');
ok('Am: A# (=Bb) — осмысленная ♭II фригийского, а не «#I» от энгармоники',
  amBb?.degree === '♭II' && amBb?.modes.join(',') === 'phrygian,locrian',
  JSON.stringify(amBb));

const amTonic = menu('Am', 'Am');
ok('Am: тоника несёт базу и все минорные семейства, максимум 5 цветов',
  amTonic?.degree === 'i' && amTonic?.modes.length === 5 &&
  amTonic?.modes.join(',') === 'aeolian,harmonic-minor,melodic-minor,dorian,phrygian',
  JSON.stringify(amTonic));

const amFm = menu('Fm', 'Am');
ok('Am: Fm остаётся нейтральным — ни один классический лад его не содержит',
  amFm === null, JSON.stringify(amFm));

const amGdim = menu('G#dim', 'Am');
ok('Am: G#dim — #vii° гармонического и мелодического минора',
  amGdim?.degree === '#vii°' && amGdim?.modes.join(',') === 'harmonic-minor,melodic-minor',
  JSON.stringify(amGdim));

const amCaug = menu('Caug', 'Am');
ok('Am: Caug — III+ гармонического и мелодического минора',
  amCaug?.degree === 'III+' && amCaug?.modes.join(',') === 'harmonic-minor,melodic-minor',
  JSON.stringify(amCaug));

const cFm = menu('Fm', 'C');
ok('C: Fm — iv гармонического минора/фригийского/локрийского',
  cFm?.degree === 'iv' && cFm?.modes.join(',') === 'harmonic-minor,phrygian,locrian',
  JSON.stringify(cFm));

const cBb = menu('Bb', 'C');
ok('C: Bb — ♭VII дорийского и миксолидийского',
  cBb?.degree === '♭VII' && cBb?.modes.join(',') === 'dorian,mixolydian',
  JSON.stringify(cBb));

const cCm = menu('Cm', 'C');
ok('C: Cm — i параллельных минорных семейств',
  cCm?.degree === 'i' && cCm?.modes.length === 4,
  JSON.stringify(cCm));

const fshmB = menu('B', 'F#m');
ok('F#m: B — IV дорийского/миксолидийского/мелодического минора в минорной тональности с диезами',
  fshmB?.degree === 'IV' && fshmB?.modes.join(',') === 'melodic-minor,dorian,mixolydian',
  JSON.stringify(fshmB));

ok('sus/power-аккорды не получают меню: качество неоднозначно',
  menu('D5', 'Am') === null && menu('Dsus4', 'C') === null);

// ===== 2. Устойчивость ступени: одна ступень у всех ладов аккорда =====
// Прямая проверка через движок: степень одна и та же в каждом содержащем ладе.
const stabilityKeys = ['Am', 'C', 'Eb', 'F#m', 'Bb', 'C#m'];
let stabilityBroken = [];
const CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
for (const key of stabilityKeys) {
  for (const root of CHROMATIC) {
    for (const suffix of ['', 'm', 'dim', 'aug']) {
      const m = menu(root + suffix, key);
      if (!m) continue;
      // Каждая пара (ступень из содержащего лада) должна совпадать с menu.degree.
      const parsed = w.eval(`parseChordForKeyDetection(${JSON.stringify(root + suffix)})`);
      if (!parsed.quality && /aug|\+/.test(suffix)) parsed.quality = 'aug';
      const perMode = m.modes.map((mode) =>
        w.eval(`getBorrowingMenuDegree(${JSON.stringify(parsed)}, ${JSON.stringify(key)}, [${JSON.stringify(mode)}])`));
      if (new Set(perMode).size !== 1 || perMode[0] !== m.degree) {
        stabilityBroken.push(`${root}${suffix} in ${key}: ${m.degree} vs [${perMode.join('|')}]`);
      }
    }
  }
}
ok('ступень одна для всех ладов, содержащих аккорд (все тональности/качества)',
  stabilityBroken.length === 0, stabilityBroken.slice(0, 4).join('; '));

// ===== 3. Круг рисует меню: полосы, ступени, aria =====
const d = w.document;
w.eval(`
  globalKey = 'Am'; keyMode = 'manual';
  activeSectionKey = null; activeChordInput = null;
  // Pane-geometry checks intentionally expose the full palette; exact minor
  // defaults are asserted separately in b99-harmony-ui/browser tests.
  wheelHarmonyModeVisibilityLoaded = true;
  wheelHarmonyDisabledModes = new Set();
  wheelMode = 'triads';
  document.getElementById('showDegrees').checked = true;
  drawWheel();
`);
const sector = (identity) => d.querySelector(`#circleSvg .wheel-sector[data-wheel-chord-identity="${identity}"]`);
const diagramOf = (identity) =>
  d.querySelector(`#circleSvg .wheel-mode-diagram[data-wheel-chord-identity="${identity}"]`);
const wedgeModes = (identity) =>
  [...d.querySelectorAll(`#circleSvg .wheel-mode-diagram[data-wheel-chord-identity="${identity}"] .wheel-mode-pane`)]
    .map((w) => w.dataset.mode);
const degreeTexts = () => [...d.querySelectorAll('#circleSvg .wheel-degree-label')].map((t) => t.textContent);

ok('сектор D несёт pane-раскладку из трёх цветовых полей',
  wedgeModes('D').join(',') === 'melodic-minor,dorian,mixolydian',
  wedgeModes('D').join(','));
ok('сектор Am несёт pane-раскладку из пяти полей, база первая',
  wedgeModes('Am').join(',') === 'aeolian,harmonic-minor,melodic-minor,dorian,phrygian',
  wedgeModes('Am').join(','));
ok('поля Am обрезаны по форме карточки',
  (() => {
    const dg = d.querySelector('#circleSvg .wheel-mode-diagram[data-wheel-chord-identity="Am"]');
    const panes = [...(dg?.querySelectorAll('.wheel-mode-pane') || [])];
    const clipRef = dg?.getAttribute('clip-path') || '';
    const clipId = clipRef.match(/^url\(#([^)]+)\)$/)?.[1];
    const clip = clipId && d.getElementById(clipId);
    return panes.length === 5 && panes.every((pane) => /^M-?[\d.]+ -?[\d.]+ A/.test(pane.getAttribute('d') || '')) &&
      !!clip?.querySelector('path');
  })(),
  '5 оконных полей + clipPath по границе карточки');
ok('диаграмма — hover-узел карточки: магнит/разъезд/selected её не бросают',
  diagramOf('D')?.classList.contains('wheel-hoverable') &&
  diagramOf('D')?.getAttribute('pointer-events') === 'none' &&
  !!diagramOf('D')?.dataset.wheelHoverRing,
  `${diagramOf('D')?.className?.baseVal || ''} / ring=${diagramOf('D')?.dataset.wheelHoverRing}`);
ok('у сектора A# (=Bb) есть степень ♭II прямо на карточке',
  degreeTexts().includes('♭II') && degreeTexts().includes('♭V'),
  degreeTexts().join(' '));
ok('aria-альтернатива сообщает ступень и все лады сектора D',
  /ступень IV/.test(sector('D')?.getAttribute('aria-label') || '') &&
  /мелодический минор/i.test(sector('D')?.getAttribute('aria-label') || '') &&
  /дорийский/i.test(sector('D')?.getAttribute('aria-label') || ''),
  sector('D')?.getAttribute('aria-label') || '');
ok('title-подсказка сектора дублирует меню для наведения мышью',
  /гармонический минор/i.test(sector('E')?.querySelector('title')?.textContent || ''),
  sector('E')?.querySelector('title')?.textContent || '');
ok('Fm без меню: ни диаграммы, ни aria',
  !diagramOf('Fm') && !(sector('Fm')?.getAttribute('aria-label')),
  `${!!diagramOf('Fm')} / ${sector('Fm')?.getAttribute('aria-label')}`);

// ===== 4. Гейт настройкой «Ступени и цвета круга» =====
w.eval("document.getElementById('showDegrees').checked = false; updateCellsDegrees();");
ok('выключенные «Ступени» убирают aria/title меню у секторов',
  !d.getElementById('chordWheelModal').classList.contains('is-harmony-highlights-on') &&
  !(sector('D')?.getAttribute('aria-label')) &&
  !(sector('D')?.querySelector('title')),
  `${sector('D')?.getAttribute('aria-label') || '—'}`);
const harmonyLegendButton = d.getElementById('wheelHarmonyLegendToggle');
const hiddenLegendInRetarget = w.eval("wheelOrbitPositionNodes().includes(document.getElementById('wheelHarmonyLegendToggle'))");
ok('отключение «Ступеней и цветов» скрывает ? и закрывает палитру',
  harmonyLegendButton.hidden && d.getElementById('wheelHarmonyLegend').hidden &&
  harmonyLegendButton.getAttribute('aria-expanded') === 'false');
ok('скрытая ? не участвует в retarget-позиционировании вкладок', !hiddenLegendInRetarget);
harmonyLegendButton.click();
ok('скрытая ? не может повторно открыть палитру',
  harmonyLegendButton.hidden && d.getElementById('wheelHarmonyLegend').hidden);
w.eval("document.getElementById('showDegrees').checked = true; updateCellsDegrees();");
const visibleLegendInRetarget = w.eval("wheelOrbitPositionNodes().includes(document.getElementById('wheelHarmonyLegendToggle'))");
ok('возврат настройки возвращает текстовые альтернативы и делает ? доступной для retarget',
  /ступень IV/.test(sector('D')?.getAttribute('aria-label') || '') &&
  !harmonyLegendButton.hidden && visibleLegendInRetarget,
  sector('D')?.getAttribute('aria-label') || '');

// ===== 5. Оконная раскладка — единственная и включена по умолчанию =====
w.history.replaceState({}, '', '/');
w.eval(`
  globalKey = 'Am'; keyMode = 'manual'; activeSectionKey = null; activeChordInput = null;
  wheelMode = 'triads'; drawWheel();
`);
const defaultPaneGroups = [...d.querySelectorAll('#circleSvg .wheel-mode-diagram')];
ok('panes — единственная раскладка меню без query-параметров',
  w.location.search === '' && defaultPaneGroups.length > 0 &&
  defaultPaneGroups.every((group) => group.querySelectorAll('.wheel-mode-pane').length === Number(group.dataset.paneCount)),
  `search=${w.location.search || 'пусто'}, groups=${defaultPaneGroups.length}`);
const oldMenuQueries = ['pie', 'panes', 'base', 'hover', 'plain', 'strict'];
const oldMenuQueryResults = oldMenuQueries.map((style) => {
  w.history.replaceState({}, '', `/?menu=${style}`);
  w.eval('drawWheel()');
  const groups = [...d.querySelectorAll('#circleSvg .wheel-mode-diagram')];
  return groups.length > 0 && groups.every((group) =>
    group.querySelectorAll('.wheel-mode-pane').length === Number(group.dataset.paneCount));
});
ok('ни один старый menu-query не переключает единственную раскладку panes',
  oldMenuQueryResults.every(Boolean),
  `проверены: ${oldMenuQueries.join(', ')}`);
w.history.replaceState({}, '', '/');
const paneGroup = (identity, ring) => [...d.querySelectorAll('#circleSvg .wheel-mode-diagram')]
  .find((node) => node.dataset.wheelChordIdentity === identity && node.dataset.wheelHoverRing === ring);
const paneModes = (group) => [...(group?.querySelectorAll('.wheel-mode-pane') || [])].map((node) => node.dataset.mode);
const dividerLayerFor = (group) => [...d.querySelectorAll('#circleSvg .wheel-mode-divider-overlay')]
  .find((node) => node.dataset.paneKey === group?.dataset.paneKey);
const dividerCount = (group) => dividerLayerFor(group)?.querySelectorAll('.wheel-mode-divider').length || 0;
const cardVolumeFor = (group) => [...d.querySelectorAll('#circleSvg .wheel-sector-volume')]
  .find((node) => node.dataset.wheelChordIdentity === group?.dataset.wheelChordIdentity &&
    node.dataset.wheelHoverRing === group?.dataset.wheelHoverRing);
const followsInPaintOrder = (earlier, later) => !!(earlier && later &&
  (earlier.compareDocumentPosition(later) & w.Node.DOCUMENT_POSITION_FOLLOWING));
const panePaintStackIsCorrect = (group) => {
  const volume = cardVolumeFor(group);
  const dividerLayer = dividerLayerFor(group);
  return followsInPaintOrder(group, volume) &&
    (Number(group?.dataset.paneCount) === 1 ||
      (dividerLayer && dividerLayer.classList.contains('wheel-hoverable') &&
        dividerLayer.classList.contains('wheel-surface-stone') &&
        dividerLayer.getAttribute('clip-path') === group.getAttribute('clip-path') &&
        dividerLayer.getAttribute('aria-hidden') === 'true' &&
        dividerLayer.dataset.wheelHoverRing === group.dataset.wheelHoverRing &&
        dividerLayer.dataset.wheelHoverIndex === group.dataset.wheelHoverIndex &&
        dividerLayer.style.getPropertyValue('--wheel-hover-origin-x') === group.style.getPropertyValue('--wheel-hover-origin-x') &&
        dividerLayer.style.getPropertyValue('--wheel-hover-origin-y') === group.style.getPropertyValue('--wheel-hover-origin-y') &&
        followsInPaintOrder(volume, dividerLayer)));
};
const expectedDividerCount = (group) => Number(group?.dataset.paneCount) === 1 ? 0 :
  Number(group?.dataset.paneCount) === 3 ? 2 : Number(group?.dataset.paneCount) === 5 ? 4 :
    Number(group?.dataset.paneCount) === 4 ? 2 : 1;
const currentPaneGroups = [...d.querySelectorAll('#circleSvg .wheel-mode-diagram')];
ok('заливки остаются под card-volume, а каждый divider-layer рисуется поверх него',
  currentPaneGroups.length > 0 && currentPaneGroups.every((group) =>
    panePaintStackIsCorrect(group) && dividerCount(group) === expectedDividerCount(group)),
  `${currentPaneGroups.length} карточек; слои panes → volume → dividers`);
const onePane = paneGroup('B', 'major');
ok('1 цвет: одна сплошная pane целиком внутри clip карточки',
  onePane?.dataset.paneLayout === 'solid' && onePane.querySelectorAll('.wheel-mode-pane').length === 1 &&
  w.getComputedStyle(d.documentElement).getPropertyValue('--wheel-menu-pane-opacity').trim() === '0.34' && /^url\(#wheel-menu-clip-/.test(onePane.getAttribute('clip-path') || ''),
  `${onePane?.dataset.paneLayout}/${onePane?.querySelector('.wheel-mode-pane')?.dataset.mode}`);
const twoPanes = [...d.querySelectorAll('#circleSvg .wheel-mode-diagram[data-pane-count="2"][data-wheel-hover-ring="major"]')];
const twoColorRing = twoPanes.find((node) => node.dataset.paneLayout === 'two-inner-outer');
const twoColorRadial = twoPanes.find((node) => node.dataset.paneLayout === 'two-clockwise-halves');
const twoColorRingDivider = dividerLayerFor(twoColorRing)?.querySelector('.wheel-mode-divider');
const twoColorRingPanes = [...(twoColorRing?.querySelectorAll('.wheel-mode-pane') || [])];
const twoColorRingFillGap = twoColorRingPanes.length === 2
  ? Number(twoColorRingPanes[1].dataset.paneInnerRadius) - Number(twoColorRingPanes[0].dataset.paneOuterRadius)
  : Number.NaN;
const twoColorRadialLayer = dividerLayerFor(twoColorRadial);
const twoColorRadialDivider = twoColorRadialLayer?.querySelector('.wheel-mode-divider');
const cssStrokeWidth = (node) => Number.parseFloat(w.getComputedStyle(node).strokeWidth ||
  w.getComputedStyle(node).getPropertyValue('stroke-width'));
ok('2 цвета: оба разделителя имеют общий стиль 2px, а кольцевые поля сходятся без нейтрального зазора',
  twoPanes.some((node) => node.dataset.paneLayout === 'two-inner-outer') &&
  twoPanes.some((node) => node.dataset.paneLayout === 'two-clockwise-halves') &&
  twoPanes.every((node) => node.querySelectorAll('.wheel-mode-pane').length === 2 && dividerCount(node) === 1) &&
  twoColorRingDivider?.dataset.dividerAxis === 'arc' && cssStrokeWidth(twoColorRingDivider) === 2 &&
  twoColorRingFillGap === 0 &&
  twoColorRadialLayer?.dataset.paneLayout === 'two-clockwise-halves' &&
  twoColorRadialDivider?.dataset.dividerAxis === 'radial' && cssStrokeWidth(twoColorRadialDivider) === 2,
  `${twoPanes.map((node) => node.dataset.paneLayout).join(', ')} / ${cssStrokeWidth(twoColorRingDivider)}px, gap ${twoColorRingFillGap}px / ${cssStrokeWidth(twoColorRadialDivider)}px`);
const threePanes = [...d.querySelectorAll('#circleSvg .wheel-mode-diagram[data-pane-count="3"][data-wheel-hover-ring="major"]')];
const radialMidpointMatches = (node) => {
  const expected = (Number(node.dataset.sectorInnerRadius) + Number(node.dataset.sectorOuterRadius)) / 2;
  return Math.abs(Number(node.dataset.radialBandSplitRadius) - expected) < 0.0051;
};
const sharesAreUnequalAndComplete = (node) => {
  const shares = [...node.querySelectorAll('.wheel-mode-pane')].map((pane) => Number(pane.dataset.paneAreaShare));
  return Math.abs(shares.reduce((sum, share) => sum + share, 0) - 1) < 0.001 && new Set(shares).size > 1;
};
ok('3 цвета: два разделителя; 1+2 делятся посередине радиальной ширины с чередованием стороны',
  threePanes.some((node) => node.dataset.paneLayout === 'three-single-inner') &&
  threePanes.some((node) => node.dataset.paneLayout === 'three-single-outer') &&
  threePanes.every((node) => node.querySelectorAll('.wheel-mode-pane').length === 3 &&
    dividerCount(node) === 2 && radialMidpointMatches(node) && sharesAreUnequalAndComplete(node)),
  threePanes.map((node) => `${node.dataset.paneLayout}:${node.dataset.radialBandSplitRadius}`).join(', '));
const fourPanes = paneGroup('F', 'major');
ok('4 цвета: окно 2×2, четыре равных поля и два разделителя поверх overlay',
  fourPanes?.dataset.paneLayout === 'four-window' &&
  fourPanes.querySelectorAll('.wheel-mode-pane').length === 4 &&
  dividerCount(fourPanes) === 2 &&
  [...fourPanes.querySelectorAll('.wheel-mode-pane')].every((pane) => pane.dataset.paneAreaShare === '0.2500'),
  fourPanes?.dataset.paneLayout || 'нет диаграммы');
const fivePanes = paneGroup('Am', 'minor');
ok('5 цветов: окно 2+3, база внутри, радиальная граница посередине, порядок ладов сохранён',
  fivePanes?.dataset.paneLayout === 'five-window-2-inner-3-outer' &&
  paneModes(fivePanes).join(',') === menu('Am', 'Am').modes.join(',') &&
  [...fivePanes.querySelectorAll('.wheel-mode-pane')].filter((pane) => pane.dataset.paneBand === 'inner').length === 2 &&
  [...fivePanes.querySelectorAll('.wheel-mode-pane')].filter((pane) => pane.dataset.paneBand === 'outer').length === 3 &&
  radialMidpointMatches(fivePanes) && sharesAreUnequalAndComplete(fivePanes) &&
  dividerCount(fivePanes) === 4 &&
  `${fivePanes?.dataset.paneLayout || 'нет'} / ${paneModes(fivePanes).join(',')}`);
const colorPaneGroups = [...twoPanes, ...threePanes, fourPanes, fivePanes].filter(Boolean);
const colorDividerWidths = colorPaneGroups.flatMap((group) =>
  [...(dividerLayerFor(group)?.querySelectorAll('.wheel-mode-divider') || [])].map(cssStrokeWidth));
ok('разделители в раскладках на 2–5 цветов имеют одинаковую толщину 2px',
  colorDividerWidths.length > 0 && colorDividerWidths.every((width) => width === 2),
  [...new Set(colorDividerWidths)].join(', ') + 'px');
ok('подписи сохраняют штатное оформление; отдельная pane-hover-подпись удалена',
  d.querySelectorAll('#circleSvg .wheel-mode-pane-label').length === 0 &&
  !d.getElementById('wheelModeHoverLabel') &&
  !/wheel-mode-pane-label|wheel-mode-hover-label/.test(fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8')));

// ===== 6. Другие режимы круга остаются на строгой раскраске =====
w.eval("wheelMode = '7'; drawWheel();");
const e7 = sector('E7');
ok('режим 7 без меню: строгий профиль по-прежнему работает',
  d.querySelectorAll('#circleSvg .wheel-mode-pane').length === 0 &&
  (e7?.dataset.harmonyGroup === 'minor-variant' || e7?.dataset.harmonyProfile === 'harmonic-minor'),
  `${e7?.dataset.harmonyGroup || '—'}/${e7?.dataset.harmonyProfile || '—'}`);

// ===== 6. Легенда «?» — компактная палитра и переключатели цветов =====
w.eval(`
  wheelMode = 'triads'; drawWheel();
  bindWheelHarmonyLegend();
  document.getElementById('wheelHarmonyLegendToggle').click();
`);
const legend = d.getElementById('wheelHarmonyLegend');
const modeInputs = [...d.querySelectorAll('#wheelHarmonyModeList [data-wheel-harmony-mode]')];
const ionianModeInput = d.querySelector('#wheelHarmonyModeList [data-wheel-harmony-mode="ionian"]');
const aeolianModeInput = d.querySelector('#wheelHarmonyModeList [data-wheel-harmony-mode="aeolian"]');
ok('легенда компактно показывает все лады/цвета, изменения ступеней и названия натуральных ладов',
  !legend?.hidden && modeInputs.length === 9 &&
  /Ионийский/.test(legend?.textContent || '') && /Натуральный мажор/.test(legend?.textContent || '') &&
  /Эолийский/.test(legend?.textContent || '') && /Натуральный минор/.test(legend?.textContent || '') &&
  /Натуральный мажор/.test(ionianModeInput?.getAttribute('aria-label') || '') &&
  /Натуральный минор/.test(aeolianModeInput?.getAttribute('aria-label') || '') &&
  /♯VII/.test(legend?.textContent || '') && /♯VI/.test(legend?.textContent || '') &&
  /♭II/.test(legend?.textContent || '') && /♭V/.test(legend?.textContent || '') &&
  !/[↑↓]/.test(legend?.textContent || '') && !/V\/x/.test(legend?.textContent || '') && !d.getElementById('wheelHarmonyLegendCurrent') &&
  modeInputs.every((input) => input.checked),
  (legend?.textContent || '').replace(/\s+/g, ' ').slice(0, 180));
const naturalAliasMenuText = w.getBorrowingMenuText({ chord: 'Am', degree: 'i', modes: ['ionian', 'aeolian'] });
ok('текстовое описание меню тоже расшифровывает Ионийский и Эолийский',
  /Ионийский \(Натуральный мажор\)/.test(naturalAliasMenuText) &&
  /Эолийский \(Натуральный минор\)/.test(naturalAliasMenuText), naturalAliasMenuText);
const dorianToggle = d.querySelector('#wheelHarmonyModeList [data-wheel-harmony-mode="dorian"]');
const amSectorBeforeToggle = sector('Am');
const amPaneBeforeToggle = paneGroup('Am', 'minor');
const fakeEditor = d.createElement('div');
fakeEditor.className = 'chord-wrapper';
fakeEditor.dataset.harmonyProfile = 'dorian';
const fakeTimeline = d.createElement('div');
fakeTimeline.className = 'tl-cell';
fakeTimeline.dataset.harmonyProfile = 'dorian';
d.body.append(fakeEditor, fakeTimeline);
dorianToggle.checked = false;
dorianToggle.dispatchEvent(new w.Event('change', { bubbles: true }));
const amPaneAfterToggle = paneGroup('Am', 'minor');
const amSectorAfterToggle = sector('Am');
ok('отключение одного лада пересчитывает 3+2/5-панель в 2+2/4, сохраняя полный музыкальный список и scope круга',
  amPaneBeforeToggle?.dataset.paneLayout === 'five-window-2-inner-3-outer' &&
  Number(amPaneBeforeToggle?.dataset.paneCount) === 5 &&
  amPaneAfterToggle?.dataset.paneLayout === 'four-window' && Number(amPaneAfterToggle?.dataset.paneCount) === 4 &&
  paneModes(amPaneAfterToggle).join(',') === 'aeolian,harmonic-minor,melodic-minor,phrygian' &&
  amSectorBeforeToggle?.dataset.wheelModes.includes('dorian') &&
  amSectorAfterToggle?.dataset.wheelModes.includes('dorian') &&
  !amSectorAfterToggle?.dataset.wheelVisibleModes.includes('dorian') &&
  !amSectorAfterToggle?.getAttribute('aria-label')?.includes('дорийский') &&
  d.getElementById('chordWheelModal').dataset.wheelHarmonyDisabledModes.includes('dorian') &&
  !fakeEditor.classList.contains('wheel-harmony-mode-muted') && !fakeTimeline.classList.contains('wheel-harmony-mode-muted') &&
  !d.body.classList.contains('is-harmony-mode-disabled') &&
  JSON.parse(w.localStorage.getItem('struchord-wheel-harmony-visibility-v1') || '[]').includes('dorian'),
  `${amPaneBeforeToggle?.dataset.paneLayout} (${amPaneBeforeToggle?.dataset.paneModes}) -> ${amPaneAfterToggle?.dataset.paneLayout} (${amPaneAfterToggle?.dataset.paneModes})`);
dorianToggle.checked = true;
dorianToggle.dispatchEvent(new w.Event('change', { bubbles: true }));
const orbitBefore = w.eval(`(() => ({
  help: Number(document.getElementById('wheelHarmonyLegendToggle').dataset.wheelModeAngle),
  quality: Number(document.querySelector('#wheelModeRow1 .mode-tab').dataset.wheelModeAngle)
}))()`);
w.eval("globalKey = 'F#'; activeSectionKey = null; drawWheel();");
const orbitAfter = w.eval(`(() => ({
  help: Number(document.getElementById('wheelHarmonyLegendToggle').dataset.wheelModeAngle),
  quality: Number(document.querySelector('#wheelModeRow1 .mode-tab').dataset.wheelModeAngle)
}))()`);
ok('? synchronously follows the quality arc on key change',
  Math.abs((orbitAfter.help - orbitBefore.help) - (orbitAfter.quality - orbitBefore.quality)) < 1e-8 &&
  Math.abs(orbitAfter.help - orbitBefore.help) > 1 && Math.abs((orbitAfter.help - orbitAfter.quality) - 16) < 1e-8,
  JSON.stringify({ orbitBefore, orbitAfter }));

// ===== 7. Параллельные/альтерированные степени следуют за активным цветом =====
const visibleDegree = (identity) => d.querySelector(
  `#circleSvg .wheel-chord-label[data-wheel-chord-identity="${identity}"] .wheel-degree-label`
)?.textContent || '';
w.eval(`
  globalKey = 'C'; keyMode = 'manual'; activeSectionKey = null; activeChordInput = null;
  wheelMode = 'triads'; wheelHarmonyModeVisibilityLoaded = true;
  wheelHarmonyDisabledModes = getWheelHarmonyDisabledModesForEntryModes(WHEEL_HARMONY_MAJOR_ENTRY_MODES);
  document.getElementById('showDegrees').checked = true;
  drawWheel();
`);
const cMinorParallelOff = visibleDegree('Cm');
const cFlatDegreeOff = visibleDegree('A#');
const cMinorAriaOff = sector('Cm')?.getAttribute('aria-label') || '';
const cFlatAriaOff = sector('A#')?.getAttribute('aria-label') || '';
const cBaseDegreeOn = visibleDegree('C');
ok('C-major baseline degree stays visible while parallel-minor and altered degrees follow their colors',
  cBaseDegreeOn === 'I' && !cMinorParallelOff && !cFlatDegreeOff &&
  !/ступень i/i.test(cMinorAriaOff) && !/ступень ♭VII/i.test(cFlatAriaOff),
  JSON.stringify({ cBaseDegreeOn, cMinorParallelOff, cFlatDegreeOff, cMinorAriaOff, cFlatAriaOff }));
w.eval(`
  wheelHarmonyDisabledModes = getWheelHarmonyDisabledModesForEntryModes(['ionian', 'harmonic-minor']);
  drawWheel();
`);
const cMinorParallelOn = visibleDegree('Cm');
const cMinorAriaOn = sector('Cm')?.getAttribute('aria-label') || '';
const cFlatDegreeStillOff = visibleDegree('A#');
w.eval(`
  wheelHarmonyDisabledModes = getWheelHarmonyDisabledModesForEntryModes(['ionian', 'harmonic-minor', 'mixolydian']);
  drawWheel();
`);
const cFlatDegreeOn = visibleDegree('A#');
const cFlatAriaOn = sector('A#')?.getAttribute('aria-label') || '';
ok('parallel-minor i and ♭VII appear in labels/ARIA only after their matching colors are enabled',
  cMinorParallelOn === 'i' && /ступень i/.test(cMinorAriaOn) &&
  !cFlatDegreeStillOff && cFlatDegreeOn === '♭VII' && /ступень ♭VII/.test(cFlatAriaOn),
  JSON.stringify({ cMinorParallelOn, cMinorAriaOn, cFlatDegreeStillOff, cFlatDegreeOn, cFlatAriaOn }));
w.eval(`
  globalKey = 'Am';
  wheelHarmonyDisabledModes = getWheelHarmonyDisabledModesForEntryModes(WHEEL_HARMONY_MINOR_ENTRY_MODES);
  drawWheel();
`);
const aParallelMajorOff = visibleDegree('A');
const amBaseDegreeOn = visibleDegree('Am');
const harmonicFiveOn = visibleDegree('E');
w.eval(`
  wheelHarmonyDisabledModes = getWheelHarmonyDisabledModesForEntryModes(['aeolian']);
  drawWheel();
`);
const harmonicFiveOff = visibleDegree('E');
w.eval(`
  wheelHarmonyDisabledModes = getWheelHarmonyDisabledModesForEntryModes(['aeolian', 'harmonic-minor', 'lydian', 'phrygian']);
  drawWheel();
`);
const aParallelMajorOn = visibleDegree('A');
const aFlatTwoOn = visibleDegree('A#');
ok('parallel-major I and altered ♭II/V labels track Lydian, Phrygian and Harmonic-minor colors',
  !aParallelMajorOff && amBaseDegreeOn === 'i' && harmonicFiveOn === 'V' && !harmonicFiveOff &&
  aParallelMajorOn === 'I' && aFlatTwoOn === '♭II',
  JSON.stringify({ aParallelMajorOff, amBaseDegreeOn, harmonicFiveOn, harmonicFiveOff, aParallelMajorOn, aFlatTwoOn }));

// Degree analysis in the editor is independent from circle palette toggles.
w.eval(`
  globalKey = 'C'; keyMode = 'manual'; activeSectionKey = null; activeChordInput = null;
  wheelHarmonyModeVisibilityLoaded = true;
  wheelHarmonyDisabledModes = getWheelHarmonyDisabledModesForEntryModes(WHEEL_HARMONY_MAJOR_ENTRY_MODES);
  DOM.rootKey.value = 'C';
  document.getElementById('showDegrees').checked = true;
  sections = [{ id: 901, type: 'Verse', key: null, timeSig: '4/4', squares: [{ id: 902, events: [
    { chord: 'Cm', span: 1 }, { chord: 'Bb', span: 1 }
  ] }] }];
  render();
  drawWheel();
`);
const editorDegree = (index) => d.querySelector(
  `.chord-wrapper[data-sec="901"][data-square="902"][data-ei="${index}"] .degree-hint`
)?.textContent.trim() || '';
const editorBeforeModeColors = [editorDegree(0), editorDegree(1)];
const circleBeforeModeColors = [visibleDegree('Cm'), visibleDegree('A#')];
w.eval("setWheelHarmonyModeEnabled('harmonic-minor', true); setWheelHarmonyModeEnabled('mixolydian', true);");
const editorAfterModeColors = [editorDegree(0), editorDegree(1)];
const circleAfterModeColors = [visibleDegree('Cm'), visibleDegree('A#')];
ok('editor keeps parallel-minor and altered degrees regardless of circle palette toggles',
  editorBeforeModeColors.join(',') === 'i,♭VII' && editorAfterModeColors.join(',') === 'i,♭VII' &&
  circleBeforeModeColors.every((degree) => !degree) && circleAfterModeColors.join(',') === 'i,♭VII',
  JSON.stringify({ editorBeforeModeColors, editorAfterModeColors, circleBeforeModeColors, circleAfterModeColors }));

console.log(failures ? `\n${failures} FAIL` : '\nALL OK — B-99 borrowing menu');
process.exit(failures ? 1 : 0);
