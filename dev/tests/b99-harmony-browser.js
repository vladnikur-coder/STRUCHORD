// B-99: Chromium proof that exact modal-profile colours reach real layout,
// while the selected wheel sector remains the existing accent state.
const path = require('path');
const { pathToFileURL } = require('url');
process.env.AWS_EXECUTION_ENV ||= 'AWS_Lambda_nodejs22.x';
const sparticuz = require('@sparticuz/chromium').default;
const puppeteer = require('puppeteer-core');
const { PNG } = require('pngjs');

let failures = 0;
function ok(name, condition, detail = '') {
  console.log(`   ${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures += 1;
}

(async () => {
  const browser = await puppeteer.launch({
    args: [...sparticuz.args, '--no-sandbox'],
    executablePath: await sparticuz.executablePath(),
    headless: 'shell',
    defaultViewport: { width: 1440, height: 1000 },
    env: {
      ...process.env,
      LD_LIBRARY_PATH: ['/tmp/al2023/lib', '/tmp/libs/al2023/lib', '/tmp/dist/Release/lib', process.env.LD_LIBRARY_PATH]
        .filter(Boolean).join(':'),
    },
  });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  try {
    const appUrl = pathToFileURL(path.resolve(__dirname, '../../STRUCHORD.html')).href;
    await page.goto(`${appUrl}?b99-harmony=${Date.now()}`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => typeof analyzeSectionHarmony === 'function' && typeof drawWheel === 'function');
    const tonalHighlightState = await page.evaluate(() => {
      globalKey = 'C';
      keyMode = 'auto';
      autoDetectedKey = null;
      activeChordInput = null;
      activeSectionKey = null;
      sections = [];
      wheelMode = 'triads';
      document.getElementById('showDegrees').checked = false;
      DOM.rootKey.value = 'auto';
      refreshAutoDetectedKey();
      updateAutoKeyBadge();
      wheelHarmonyModeVisibilityLoaded = false;
      wheelHarmonyDisabledModes = new Set();
      drawWheel();
      const noKey = {
        detectedKey: autoDetectedKey,
        effectiveKey: getEffectiveKey(),
        positionKey: getEffectiveKeyForCurrentPosition(),
        activeWheelKey: getActiveWheelHarmonyEffectiveKey(),
        autoLabel: document.getElementById('autoKeyOption').textContent.trim(),
        diatonicCards: document.querySelectorAll('#circleSvg .wheel-sector[data-wheel-diatonic="true"]').length,
      };
      keyMode = 'manual';
      globalKey = 'C';
      DOM.rootKey.value = 'C';
      activeChordInput = null;
      activeSectionKey = null;
      wheelHarmonyModeVisibilityLoaded = true;
      wheelHarmonyDisabledModes = new Set([...WHEEL_HARMONY_MODE_IDS].filter((mode) => mode !== 'ionian'));
      wheelMode = 'triads';
      const previousTheme = document.documentElement.getAttribute('data-theme');
      document.documentElement.setAttribute('data-theme', 'dark');
      document.getElementById('showDegrees').checked = false;
      drawWheel();
      const sector = (chord) => document.querySelector(`#circleSvg .wheel-sector[data-wheel-chord-identity="${chord}"][data-wheel-ring="major"]`);
      const cSector = sector('C');
      const dSector = sector('D');
      const aMinorSector = document.querySelector('#circleSvg .wheel-sector[data-wheel-chord-identity="Am"][data-wheel-ring="minor"]');
      const cVolume = document.querySelector('#circleSvg .wheel-sector-volume[data-wheel-diatonic="true"]');
      const dVolume = document.querySelector('#circleSvg .wheel-sector-volume[data-wheel-diatonic="false"]');
      const baselineOff = {
        coloringClass: document.getElementById('chordWheelModal').classList.contains('is-wheel-mode-coloring-on'),
        cDiatonic: cSector?.dataset.wheelDiatonic,
        dDiatonic: dSector?.dataset.wheelDiatonic,
        cFill: getComputedStyle(cSector).fill,
        dFill: getComputedStyle(dSector).fill,
        aMinorFill: getComputedStyle(aMinorSector).fill,
        cVolumeFill: getComputedStyle(cVolume).fill,
        dVolumeFill: getComputedStyle(dVolume).fill,
      };
      document.getElementById('showDegrees').checked = true;
      wheelHarmonyDisabledModes = new Set(WHEEL_HARMONY_MODE_IDS);
      updateCellsDegrees();
      const baselineAllModesOff = {
        coloringClass: document.getElementById('chordWheelModal').classList.contains('is-wheel-mode-coloring-on'),
        cFill: getComputedStyle(cSector).fill,
        dFill: getComputedStyle(dSector).fill,
        aMinorFill: getComputedStyle(aMinorSector).fill,
        cVolumeFill: getComputedStyle(cVolume).fill,
      };
      wheelHarmonyDisabledModes = new Set([...WHEEL_HARMONY_MODE_IDS].filter((mode) => mode !== 'ionian'));
      updateCellsDegrees();
      const baselineOn = {
        coloringClass: document.getElementById('chordWheelModal').classList.contains('is-wheel-mode-coloring-on'),
        cFill: getComputedStyle(cSector).fill,
        dFill: getComputedStyle(dSector).fill,
        cVolumeFill: getComputedStyle(cVolume).fill,
        dVolumeFill: getComputedStyle(dVolume).fill,
      };
      if (previousTheme === null) document.documentElement.removeAttribute('data-theme');
      else document.documentElement.setAttribute('data-theme', previousTheme);
      return { noKey, baselineOff, baselineAllModesOff, baselineOn };
    });
    ok('empty auto mode has no effective C key or tonic tint',
      tonalHighlightState.noKey.detectedKey === null && tonalHighlightState.noKey.effectiveKey === null &&
      tonalHighlightState.noKey.positionKey === null && tonalHighlightState.noKey.activeWheelKey === null &&
      tonalHighlightState.noKey.autoLabel === 'Автоматически' &&
      tonalHighlightState.noKey.diatonicCards === 0, JSON.stringify(tonalHighlightState.noKey));
    ok('baseline diatonic fill survives degrees/mode colors off and is removed beneath active mode colors',
      tonalHighlightState.baselineOff.coloringClass === false &&
      tonalHighlightState.baselineOff.cDiatonic === 'true' && tonalHighlightState.baselineOff.dDiatonic === 'false' &&
      tonalHighlightState.baselineOff.cFill !== tonalHighlightState.baselineOff.dFill &&
      tonalHighlightState.baselineAllModesOff.coloringClass === false &&
      tonalHighlightState.baselineAllModesOff.cFill === tonalHighlightState.baselineOff.cFill &&
      tonalHighlightState.baselineAllModesOff.dFill === tonalHighlightState.baselineOff.dFill &&
      tonalHighlightState.baselineAllModesOff.aMinorFill === tonalHighlightState.baselineOff.aMinorFill &&
      tonalHighlightState.baselineAllModesOff.cVolumeFill === tonalHighlightState.baselineOff.cVolumeFill &&
      tonalHighlightState.baselineOn.coloringClass === true &&
      tonalHighlightState.baselineOn.cFill === tonalHighlightState.baselineOn.dFill &&
      tonalHighlightState.baselineOn.cVolumeFill === tonalHighlightState.baselineOn.dVolumeFill,
      JSON.stringify(tonalHighlightState));
    const state = await page.evaluate(async () => {
      globalKey = 'C';
      globalTimeSig = '4/4';
      keyMode = 'manual';
      document.getElementById('showDegrees').checked = false;
      sections = [{ id: 81, type: 'Verse', key: null, timeSig: '4/4', squares: [{
 id: 82, events: [
        { chord: 'C', span: 1 }, { chord: 'D7', span: 1 }, { chord: 'G', span: 1 }, { chord: 'Bb', span: 1 },
      ] }] }];
      render();
      updateCellsDegrees();
      const grid = (ei) => document.querySelector(`.chord-wrapper[data-sec="81"][data-square="82"][data-ei="${ei}"]`);
      const cellFillWhenDegreesOff = getComputedStyle(grid(0)).backgroundColor;
      const neutralCellFillWhenDegreesOff = getComputedStyle(grid(3)).backgroundColor;
      const harmonyClassWhenDegreesOff = document.body.classList.contains('is-harmony-highlights-on');
      bindWheelHarmonyLegend();
      const legendToggle = document.getElementById('wheelHarmonyLegendToggle');
      const legendHiddenWhenDegreesOff = legendToggle.hidden && getComputedStyle(legendToggle).display === 'none';
      legendToggle.click();
      const legendStaysClosedWhenDegreesOff = document.getElementById('wheelHarmonyLegend').hidden;
      document.getElementById('showDegrees').checked = true;
      updateCellsDegrees();
      await new Promise((resolve) => setTimeout(resolve, 180));
      const legendVisibleWhenDegreesOn = !legendToggle.hidden && getComputedStyle(legendToggle).display !== 'none';
      const legendSurface = legendToggle.querySelector(':scope > .wheel-harmony-legend-toggle-surface');
      const modal = document.getElementById('chordWheelModal');
      modal.classList.add('open', 'wheel-opening', 'wheel-floating-surface');
      const helpOpenAnimation = getComputedStyle(legendSurface).animationName;
      const helpRiseDelay = getComputedStyle(legendSurface).getPropertyValue('--wheel-surface-rise-delay').trim();
      modal.classList.remove('open', 'wheel-opening');
      modal.classList.add('closing');
      const helpCloseAnimation = getComputedStyle(legendSurface).animationName;
      const helpCloseDirection = getComputedStyle(legendSurface).animationDirection;
      modal.classList.remove('closing', 'wheel-floating-surface');
      const modeNames = ['ionian', 'aeolian', 'harmonic-minor', 'melodic-minor', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian'];
      const previousTheme = document.documentElement.getAttribute('data-theme');
      const modePalette = (theme) => {
        document.documentElement.setAttribute('data-theme', theme);
        return Object.fromEntries(modeNames.map((mode) => [mode,
          getComputedStyle(document.documentElement).getPropertyValue(`--harmony-${mode}`).trim()]));
      };
      const toLab = (hex) => {
        const rgb = hex.match(/[0-9a-f]{2}/gi).map((part) => parseInt(part, 16) / 255);
        const linear = (value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        const [r, g, b] = rgb.map(linear);
        const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
        const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
        const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
        const f = (value) => value > (6 / 29) ** 3 ? value ** (1 / 3) : value / (3 * (6 / 29) ** 2) + 4 / 29;
        const [fx, fy, fz] = [x, y, z].map(f);
        return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
      };
      const minimumPaletteDistance = (palette) => {
        const colors = Object.entries(palette).map(([mode, color]) => [mode, toLab(color)]);
        let minimum = Infinity;
        let closest = [];
        for (let i = 0; i < colors.length; i += 1) for (let j = i + 1; j < colors.length; j += 1) {
          const delta = Math.hypot(...colors[i][1].map((value, index) => value - colors[j][1][index]));
          if (delta < minimum) { minimum = delta; closest = [colors[i][0], colors[j][0]]; }
        }
        return { minimum, closest };
      };
      const paletteLight = modePalette('light');
      const paletteDark = modePalette('dark');
      if (previousTheme === null) document.documentElement.removeAttribute('data-theme');
      else document.documentElement.setAttribute('data-theme', previousTheme);
      const modePaletteDistance = {
        light: minimumPaletteDistance(paletteLight),
        dark: minimumPaletteDistance(paletteDark),
      };
      timelineMode = true;
      renderTimeline();
      const timeline = (ei) => document.querySelector(`.tl-cell[data-sec="81"][data-square="82"][data-ei="${ei}"]`);
      activeChordInput = grid(1).querySelector('.chord-input');
      activeSectionKey = null;
      wheelMode = '7';
      drawWheel();
      const d7 = document.querySelector('#circleSvg .wheel-sector[data-wheel-chord-identity="D7"]');
      const d7Selected = d7.classList.contains('is-wheel-selected');
      const wheelAria = d7.getAttribute('aria-label') || '';
      const wheelTitle = d7.querySelector('title')?.textContent || '';
      d7.classList.remove('is-wheel-selected');
      const wheelVxFill = getComputedStyle(d7).fill;
      d7.removeAttribute('data-harmony-profile');
      const wheelFillWithoutProfile = getComputedStyle(d7).fill;
      d7.setAttribute('data-harmony-profile', 'secondary-function');
      d7.classList.toggle('is-wheel-selected', d7Selected);
      bindWheelHarmonyLegend();
      document.getElementById('wheelHarmonyLegendToggle').click();
      return {
        cellFillWhenDegreesOff,
        neutralCellFillWhenDegreesOff,
        harmonyClassWhenDegreesOff,
        legendHiddenWhenDegreesOff,
        legendStaysClosedWhenDegreesOff,
        legendVisibleWhenDegreesOn,
        legendToggleFloats: legendSurface?.classList.contains('wheel-surface-stone') &&
          helpOpenAnimation === 'wheel-floating-stone-rise' &&
          helpCloseAnimation === 'wheel-floating-stone-rise' && helpCloseDirection === 'reverse' && helpRiseDelay === '52ms',
        legendNoteAbsent: !document.querySelector('.wheel-harmony-legend-note'),
        modePalette: { light: paletteLight, dark: paletteDark, distances: modePaletteDistance },
        groups: [grid(0), grid(1), grid(3)].map((cell) => cell.dataset.harmonyGroup),
        profiles: [grid(0), grid(1), grid(3)].map((cell) => cell.dataset.harmonyProfile),
        secondaryCellFill: getComputedStyle(grid(1)).backgroundColor,
        ionianCellFill: getComputedStyle(grid(0)).backgroundColor,
        neutralCellFill: getComputedStyle(grid(3)).backgroundColor,
        gridFunctionText: grid(1).querySelector('.chord-input')?.getAttribute('aria-label') || '',
        timelineGroups: [timeline(0), timeline(1), timeline(3)].map((cell) => cell.dataset.harmonyGroup),
        timelineProfiles: [timeline(0), timeline(1), timeline(3)].map((cell) => cell.dataset.harmonyProfile),
        timelineMarker: getComputedStyle(timeline(1), '::after').backgroundColor,
        ionianTimelineMarker: getComputedStyle(timeline(0), '::after').backgroundColor,
        neutralTimelineMarker: getComputedStyle(timeline(3), '::after').backgroundColor,
        timelineFunctionText: timeline(1).querySelector('.harmony-a11y')?.textContent || '',
        selected: d7.classList.contains('is-wheel-selected'),
        wheelGroup: d7.dataset.harmonyGroup,
        wheelProfile: d7.dataset.harmonyProfile,
        wheelAria: `${wheelAria} ${wheelTitle}`,
        wheelVxFill,
        wheelFillWithoutProfile,
        legendOpen: !document.getElementById('wheelHarmonyLegend').hidden,
        legendExpanded: document.getElementById('wheelHarmonyLegendToggle').getAttribute('aria-expanded'),
        legendModeCount: document.querySelectorAll('#wheelHarmonyModeList [data-wheel-harmony-mode]').length,
        legendModeOrder: [...document.querySelectorAll('#wheelHarmonyModeList [data-wheel-harmony-mode]')]
          .map((input) => input.dataset.wheelHarmonyMode),
        legendHasAlterations: /♯VII/.test(document.getElementById('wheelHarmonyLegend').textContent) &&
          /♭II/.test(document.getElementById('wheelHarmonyLegend').textContent),
        legendHasNoArrows: !/[↑↓]/.test(document.getElementById('wheelHarmonyLegend').textContent),
        legendHasVx: /V\/x/.test(document.getElementById('wheelHarmonyLegend').textContent),
        legendHasCurrentChord: !!document.getElementById('wheelHarmonyLegendCurrent'),
      };
    });
    const minorLine = await page.evaluate(async () => {
      globalKey = 'Am';
      keyMode = 'manual';
      sections = [{ id: 91, type: 'Verse', key: null, timeSig: '4/4', squares: [{ id: 92, events: [
        { chord: 'Am', span: 1 }, { chord: 'C', span: 1 }, { chord: 'D', span: 1 }, { chord: 'E', span: 1 },
      ] }] }];
      enableWheelHarmonyModesOnTransition('C', 'Am');
      const defaultEnabledModes = WHEEL_HARMONY_LEGEND_MODES
        .filter(({ id }) => isWheelHarmonyModeEnabled(id)).map(({ id }) => id);
      const defaultDisabledModes = WHEEL_HARMONY_LEGEND_MODES
        .filter(({ id }) => !isWheelHarmonyModeEnabled(id)).map(({ id }) => id);
      // Defaults are asserted first; all profiles are then exposed so the
      // base-color priority and the alternative pane layouts can be tested.
      wheelHarmonyDisabledModes.clear();
      persistWheelHarmonyModeVisibility();
      document.getElementById('showDegrees').checked = true;
      render();
      timelineMode = true;
      renderTimeline();
      await new Promise((resolve) => setTimeout(resolve, 180));
      const grid = (ei) => document.querySelector(`.chord-wrapper[data-sec="91"][data-square="92"][data-ei="${ei}"]`);
      const timeline = (ei) => document.querySelector(`.tl-cell[data-sec="91"][data-square="92"][data-ei="${ei}"]`);
      const editorFills = [2, 3].map((ei) => getComputedStyle(grid(ei)).backgroundColor);
      const editorTintMixLight = getComputedStyle(document.documentElement)
        .getPropertyValue('--harmony-cell-profile-mix').trim();
      const previousCellTheme = document.documentElement.getAttribute('data-theme');
      document.documentElement.setAttribute('data-theme', 'dark');
      await new Promise((resolve) => setTimeout(resolve, 180));
      const editorFillsDark = [2, 3].map((ei) => getComputedStyle(grid(ei)).backgroundColor);
      const editorTintMixDark = getComputedStyle(document.documentElement)
        .getPropertyValue('--harmony-cell-profile-mix').trim();
      if (previousCellTheme === null) document.documentElement.removeAttribute('data-theme');
      else document.documentElement.setAttribute('data-theme', previousCellTheme);
      await new Promise((resolve) => setTimeout(resolve, 180));
      const profileCell = grid(2);
      profileCell.classList.add('is-cell-selected');
      await new Promise((resolve) => setTimeout(resolve, 180));
      const selectedCellState = {
        fill: getComputedStyle(profileCell).backgroundColor,
        boxShadow: getComputedStyle(profileCell).boxShadow,
      };
      profileCell.classList.remove('is-cell-selected');
      profileCell.classList.add('playback-active');
      await new Promise((resolve) => setTimeout(resolve, 180));
      const playbackCellState = {
        fill: getComputedStyle(profileCell).backgroundColor,
        boxShadow: getComputedStyle(profileCell).boxShadow,
      };
      profileCell.classList.remove('playback-active');
      return {
        defaultModes: { enabled: defaultEnabledModes, disabled: defaultDisabledModes },
        editorDegrees: [0, 1, 2, 3].map((ei) => grid(ei).querySelector('.degree-hint')?.textContent),
        timelineDegrees: [0, 1, 2, 3].map((ei) => timeline(ei).querySelector('.tl-degree')?.textContent),
        profiles: [0, 1, 2, 3].map((ei) => grid(ei).dataset.harmonyProfile),
        editorFills,
        editorFillsDark,
        editorTintMixLight,
        editorTintMixDark,
        selectedCellState,
        playbackCellState,
        timelineProfiles: [0, 1, 2, 3].map((ei) => timeline(ei).dataset.harmonyProfile),
        wheelMenu: (() => {
          activeChordInput = grid(2).querySelector('.chord-input');
          activeSectionKey = null;
          wheelMode = 'triads';
          drawWheel();
          const fMinor = document.querySelector('#circleSvg .wheel-sector[data-wheel-chord-identity="Fm"]');
          const eMajor = document.querySelector('#circleSvg .wheel-sector[data-wheel-chord-identity="E"]');
          const paneModesFor = (identity, ring) => [...document.querySelectorAll('#circleSvg .wheel-mode-diagram')]
            .find((group) => group.dataset.wheelChordIdentity === identity && group.dataset.wheelHoverRing === ring)
            ?.dataset.paneModes || '';
          const minorCorePaneModes = ['Am', 'C', 'Dm', 'Em', 'F', 'G']
            .map((identity) => paneModesFor(identity, identity.endsWith('m') ? 'minor' : 'major'));
          const minorDimModes = getWheelMenuPaneModes(getBorrowingMenuProfile('Bdim', 'Am')).join(',');
          wheelHarmonyDisabledModes.add('aeolian');
          drawWheel();
          const minorCoreModesWithoutAeolian = paneModesFor('Am', 'minor');
          wheelHarmonyDisabledModes.delete('aeolian');
          drawWheel();
          return {
            legendCurrentAbsent: !document.getElementById('wheelHarmonyLegendCurrent'),
            fMinorModes: fMinor?.dataset.wheelModes || '',
            eMajorModes: eMajor?.dataset.wheelModes || '',
            eMajorAria: eMajor?.getAttribute('aria-label') || '',
            naturalMinorCorePaneModes: minorCorePaneModes,
            naturalMinorDimModes: minorDimModes,
            minorCoreModesWithoutAeolian,
          };
        })(),
        panePresentation: (() => {
          // Exercise 1–4 alternative colors after the natural-minor override;
          // the Aeolian-on state is asserted above and restored before toggling.
          wheelHarmonyDisabledModes.add('aeolian');
          drawWheel();
          const groups = [...document.querySelectorAll('#circleSvg .wheel-mode-diagram')];
          const layouts = [...new Set(groups.map((group) => group.dataset.paneLayout))];
          const oneColor = groups.find((group) => group.dataset.paneLayout === 'solid');
          const twoColorRing = groups.find((group) => group.dataset.paneLayout === 'two-inner-outer');
          const twoColorRadial = groups.find((group) => group.dataset.paneLayout === 'two-clockwise-halves');
          const dividerLayerFor = (group) => [...document.querySelectorAll('#circleSvg .wheel-mode-divider-overlay')]
            .find((layer) => layer.dataset.paneKey === group?.dataset.paneKey);
          const dividerLayer = dividerLayerFor(twoColorRing);
          const radialDividerLayer = dividerLayerFor(twoColorRadial);
          const twoColorRingPanes = [...(twoColorRing?.querySelectorAll('.wheel-mode-pane') || [])];
          const twoColorRingFillGap = twoColorRingPanes.length === 2
            ? Number(twoColorRingPanes[1].dataset.paneInnerRadius) - Number(twoColorRingPanes[0].dataset.paneOuterRadius)
            : null;
          const divider = dividerLayer?.querySelector('.wheel-mode-divider');
          const radialDivider = radialDividerLayer?.querySelector('.wheel-mode-divider');
          const multiColorDividerWidths = groups
            .filter((group) => Number(group.dataset.paneCount) >= 3)
            .flatMap((group) => {
              const layer = dividerLayerFor(group);
              return [...(layer?.querySelectorAll('.wheel-mode-divider') || [])]
                .map((node) => getComputedStyle(node).strokeWidth);
            });
          const dividerPaneGroup = groups.find((group) => group.dataset.paneKey === dividerLayer?.dataset.paneKey);
          const dividerVolume = [...document.querySelectorAll('#circleSvg .wheel-sector-volume')].find((volume) =>
            volume.dataset.wheelChordIdentity === dividerLayer?.dataset.wheelChordIdentity &&
            volume.dataset.wheelHoverRing === dividerLayer?.dataset.wheelHoverRing);
          const radialDividerVolume = [...document.querySelectorAll('#circleSvg .wheel-sector-volume')].find((volume) =>
            volume.dataset.wheelChordIdentity === radialDividerLayer?.dataset.wheelChordIdentity &&
            volume.dataset.wheelHoverRing === radialDividerLayer?.dataset.wheelHoverRing);
          const followsInPaintOrder = (earlier, later) => !!(earlier && later &&
            (earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING));
          const paneLabelOverrideCount = document.querySelectorAll('#circleSvg .wheel-mode-pane-label').length;
          const dividerSample = (() => {
            if (!divider) return null;
            const length = divider.getTotalLength();
            const distance = length * 0.1;
            const screenPointAt = (offset) => {
              const point = divider.getPointAtLength(offset);
              const screen = new DOMPoint(point.x, point.y).matrixTransform(divider.getScreenCTM());
              return { x: screen.x, y: screen.y };
            };
            const point = screenPointAt(distance);
            const before = screenPointAt(Math.max(0, distance - 1));
            const after = screenPointAt(Math.min(length, distance + 1));
            const dx = after.x - before.x;
            const dy = after.y - before.y;
            const tangentLength = Math.hypot(dx, dy) || 1;
            return {
              paneKey: dividerLayer.dataset.paneKey,
              x: point.x,
              y: point.y,
              normalX: -dy / tangentLength,
              normalY: dx / tangentLength,
            };
          })();
          const previousTheme = document.documentElement.getAttribute('data-theme');
          const themePaint = (theme) => {
            document.documentElement.setAttribute('data-theme', theme);
            const dividerStyle = divider && getComputedStyle(divider);
            return {
              fillOpacity: oneColor && getComputedStyle(oneColor.querySelector('.wheel-mode-pane')).fillOpacity,
              dividerStroke: dividerStyle?.stroke,
              dividerWidth: dividerStyle?.strokeWidth,
              dividerVisible: !!dividerStyle && dividerStyle.stroke !== 'none' &&
                Number.parseFloat(dividerStyle.strokeOpacity) > 0 && dividerStyle.display !== 'none' &&
                dividerStyle.visibility !== 'hidden',
              radialDividerWidth: radialDivider ? getComputedStyle(radialDivider).strokeWidth : null,
              radialDividerVisible: !!radialDivider && getComputedStyle(radialDivider).stroke !== 'none' &&
                Number.parseFloat(getComputedStyle(radialDivider).strokeOpacity) > 0 &&
                getComputedStyle(radialDivider).display !== 'none' && getComputedStyle(radialDivider).visibility !== 'hidden',
              radialPaneLayout: radialDividerLayer?.dataset.paneLayout,
              radialAxis: radialDivider?.dataset.dividerAxis,
              panesBelowVolume: followsInPaintOrder(dividerPaneGroup, dividerVolume),
              dividersAboveVolume: followsInPaintOrder(dividerVolume, dividerLayer),
              radialDividerAboveVolume: followsInPaintOrder(radialDividerVolume, radialDividerLayer),
            };
          };
          const light = themePaint('light');
          const dark = themePaint('dark');
          if (previousTheme === null) document.documentElement.removeAttribute('data-theme');
          else document.documentElement.setAttribute('data-theme', previousTheme);
          const selectedD = document.querySelector('#circleSvg .wheel-sector[data-wheel-chord-identity="D"][data-wheel-ring="major"]');
          const presentation = {
            layouts,
            expectedLayouts: ['solid', 'two-inner-outer', 'two-clockwise-halves', 'three-single-inner',
              'three-single-outer', 'four-window'],
            paneCount: groups.length,
            paneLabelOverrideCount,
            dividerSample,
            twoColorRingFillGap,
            multiColorDividerWidths,
            light,
            dark,
            selectedD: selectedD?.classList.contains('is-wheel-selected'),
          };
          wheelHarmonyDisabledModes.delete('aeolian');
          drawWheel();
          return presentation;
        })(),
      };
    });
    const exactMinorDefaults = ['aeolian', 'harmonic-minor'];
    const allHarmonyModes = ['ionian', 'aeolian', 'harmonic-minor', 'melodic-minor', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian'];
    ok('в миноре по умолчанию включены только натуральный и гармонический минор',
      [...minorLine.defaultModes.enabled].sort().join(',') === [...exactMinorDefaults].sort().join(',') &&
      [...minorLine.defaultModes.disabled].sort().join(',') ===
        allHarmonyModes.filter((mode) => !exactMinorDefaults.includes(mode)).sort().join(','),
      JSON.stringify(minorLine.defaultModes));
    ok('Am–C–D–E stays intact; 13/15% profile tint, selection and playback',
      minorLine.editorDegrees.join(',') === 'i,III,IV,V' && minorLine.timelineDegrees.join(',') === 'i,III,IV,V' &&
      minorLine.profiles.join(',') === 'aeolian,aeolian,melodic-minor,harmonic-minor' &&
      minorLine.timelineProfiles.join(',') === 'aeolian,aeolian,melodic-minor,harmonic-minor' &&
      minorLine.editorFills[0] !== minorLine.editorFills[1] &&
      minorLine.editorFillsDark[0] !== minorLine.editorFillsDark[1] &&
      minorLine.editorTintMixLight === '13%' && minorLine.editorTintMixDark === '15%' &&
      minorLine.selectedCellState.fill === minorLine.editorFills[0] &&
      minorLine.selectedCellState.boxShadow !== 'none' &&
      /^rgba\(/.test(minorLine.playbackCellState.fill) &&
      minorLine.playbackCellState.fill !== minorLine.editorFills[0] &&
      minorLine.playbackCellState.boxShadow !== 'none' &&
      minorLine.wheelMenu.legendCurrentAbsent && minorLine.wheelMenu.fMinorModes === '' &&
      minorLine.wheelMenu.eMajorModes === 'ionian,harmonic-minor,melodic-minor,lydian' &&
      /E: ступень V в Am/.test(minorLine.wheelMenu.eMajorAria) &&
      /Гармонический минор/.test(minorLine.wheelMenu.eMajorAria) &&
      minorLine.wheelMenu.naturalMinorCorePaneModes.every((modes) => modes === 'aeolian') &&
      minorLine.wheelMenu.naturalMinorDimModes === 'aeolian,harmonic-minor' &&
      minorLine.wheelMenu.minorCoreModesWithoutAeolian === 'harmonic-minor,melodic-minor,dorian,phrygian',
      JSON.stringify(minorLine));
    const hoverSelector = '.chord-wrapper[data-sec="91"][data-square="92"][data-ei="2"]';
    await page.hover(hoverSelector);
    await new Promise((resolve) => setTimeout(resolve, 180));
    const editorHoverFill = await page.$eval(hoverSelector, (cell) => getComputedStyle(cell).backgroundColor);
    await page.mouse.move(0, 0);
    await new Promise((resolve) => setTimeout(resolve, 180));
    ok('editor hover keeps the active profile tint', editorHoverFill !== minorLine.editorFills[0], editorHoverFill);
    ok('B-99 dividers share one theme-aware 2px style and two-color ring panes meet at the rail',
      minorLine.panePresentation.expectedLayouts.every((layout) => minorLine.panePresentation.layouts.includes(layout)) &&
      minorLine.panePresentation.paneCount > 0 &&
      minorLine.panePresentation.light.fillOpacity === '0.34' && minorLine.panePresentation.dark.fillOpacity === '0.45' &&
      minorLine.panePresentation.light.dividerStroke === 'rgba(0, 0, 0, 0.15)' &&
      minorLine.panePresentation.dark.dividerStroke === 'rgba(255, 255, 255, 0.12)' &&
      minorLine.panePresentation.light.dividerWidth === '2px' && minorLine.panePresentation.dark.dividerWidth === '2px' &&
      minorLine.panePresentation.light.radialDividerWidth === '2px' && minorLine.panePresentation.dark.radialDividerWidth === '2px' &&
      minorLine.panePresentation.twoColorRingFillGap === 0 &&
      minorLine.panePresentation.multiColorDividerWidths.length > 0 &&
      minorLine.panePresentation.multiColorDividerWidths.every((width) => width === '2px') &&
      minorLine.panePresentation.light.radialAxis === 'radial' && minorLine.panePresentation.dark.radialAxis === 'radial' &&
      minorLine.panePresentation.light.radialPaneLayout === 'two-clockwise-halves' &&
      minorLine.panePresentation.dark.radialPaneLayout === 'two-clockwise-halves' &&
      minorLine.panePresentation.light.dividerVisible && minorLine.panePresentation.dark.dividerVisible &&
      minorLine.panePresentation.light.radialDividerVisible && minorLine.panePresentation.dark.radialDividerVisible &&
      minorLine.panePresentation.light.panesBelowVolume && minorLine.panePresentation.dark.panesBelowVolume &&
      minorLine.panePresentation.light.dividersAboveVolume && minorLine.panePresentation.dark.dividersAboveVolume &&
      minorLine.panePresentation.light.radialDividerAboveVolume && minorLine.panePresentation.dark.radialDividerAboveVolume &&
      minorLine.panePresentation.paneLabelOverrideCount === 0 && minorLine.panePresentation.selectedD,
      JSON.stringify(minorLine.panePresentation));
    // Compare real pixels on a fresh page so the moving owner-circle in the
    // main interaction test cannot shift the divider outside the viewport.
    const dividerPixelVisibility = {};
    const dividerPage = await browser.newPage();
    dividerPage.on('pageerror', (error) => pageErrors.push(`divider screenshot: ${String(error)}`));
    try {
      await dividerPage.goto(`${appUrl}?b99-divider-pixel=${Date.now()}`, { waitUntil: 'load', timeout: 60000 });
      await dividerPage.waitForFunction(() => typeof drawWheel === 'function');
      await dividerPage.evaluate(() => {
        globalKey = 'Am';
        keyMode = 'manual';
        autoDetectedKey = null;
        activeChordInput = null;
        activeSectionKey = null;
        wheelMode = 'triads';
        sections = [{ id: 1, type: 'Verse', key: null, timeSig: '4/4', squares: [{ id: 2, events: [
          { chord: 'Am', span: 1 }, { chord: 'C', span: 1 }, { chord: 'D', span: 1 }, { chord: 'E', span: 1 },
        ] }] }];
        document.getElementById('showDegrees').checked = true;
        wheelHarmonyModeVisibilityLoaded = true;
        wheelHarmonyDisabledModes = new Set();
        drawWheel();
        DOM.chordWheelModal.classList.add('open', 'is-harmony-highlights-on');
      });
      for (const theme of ['light', 'dark']) {
        const sample = await dividerPage.evaluate((themeName) => {
          document.documentElement.setAttribute('data-theme', themeName);
          const group = [...document.querySelectorAll('#circleSvg .wheel-mode-diagram')]
            .find((node) => node.dataset.paneLayout === 'two-inner-outer');
          const layer = [...document.querySelectorAll('#circleSvg .wheel-mode-divider-overlay')]
            .find((node) => node.dataset.paneKey === group?.dataset.paneKey);
          const divider = layer?.querySelector('.wheel-mode-divider');
          if (!divider) return null;
          const length = divider.getTotalLength();
          const point = divider.getPointAtLength(length * 0.1);
          const screen = new DOMPoint(point.x, point.y).matrixTransform(divider.getScreenCTM());
          divider.style.stroke = 'none';
          return { x: screen.x, y: screen.y, paneKey: layer.dataset.paneKey, paneModes: group.dataset.paneModes || '' };
        }, theme);
        if (!sample) {
          dividerPixelVisibility[theme] = { meanChannelDelta: 0, changedPixels: 0 };
          continue;
        }
        await new Promise((resolve) => setTimeout(resolve, 60));
        const withoutDivider = PNG.sync.read(await dividerPage.screenshot());
        await dividerPage.evaluate((paneKey) => {
          const layer = [...document.querySelectorAll('#circleSvg .wheel-mode-divider-overlay')]
            .find((node) => node.dataset.paneKey === paneKey);
          layer?.querySelector('.wheel-mode-divider')?.style.removeProperty('stroke');
        }, sample.paneKey);
        const withDivider = PNG.sync.read(await dividerPage.screenshot());
        let totalDelta = 0;
        let changedPixels = 0;
        let pixelCount = 0;
        const centerX = Math.round(sample.x);
        const centerY = Math.round(sample.y);
        for (let y = centerY - 5; y <= centerY + 5; y += 1) {
          for (let x = centerX - 5; x <= centerX + 5; x += 1) {
            if (x < 0 || y < 0 || x >= withDivider.width || y >= withDivider.height) continue;
            const offset = (y * withDivider.width + x) * 4;
            const delta = Math.abs(withDivider.data[offset] - withoutDivider.data[offset]) +
              Math.abs(withDivider.data[offset + 1] - withoutDivider.data[offset + 1]) +
              Math.abs(withDivider.data[offset + 2] - withoutDivider.data[offset + 2]);
            totalDelta += delta;
            if (delta >= 12) changedPixels += 1;
            pixelCount += 1;
          }
        }
        dividerPixelVisibility[theme] = {
          meanChannelDelta: totalDelta / Math.max(1, pixelCount * 3),
          changedPixels,
          paneModes: sample.paneModes,
        };
      }
    } finally {
      await dividerPage.close();
    }
    ok('кольцевый разделитель меняет реальные пиксели в обеих темах, а не только CSS-ширину',
      ['light', 'dark'].every((theme) => dividerPixelVisibility[theme]?.meanChannelDelta >= 3 &&
        dividerPixelVisibility[theme]?.changedPixels >= 20), JSON.stringify(dividerPixelVisibility));
    const wheelToggleScope = await page.evaluate(() => {
      const editorD = document.querySelector('.chord-wrapper[data-sec="91"][data-square="92"][data-ei="2"]');
      const timelineD = document.querySelector('.tl-cell[data-sec="91"][data-square="92"][data-ei="2"]');
      const editorColorBefore = getComputedStyle(editorD).backgroundColor;
      const timelineColorBefore = getComputedStyle(timelineD, '::after').backgroundColor;
      const bodyMapClassBefore = document.body.classList.contains('is-harmony-highlights-on');
      const melodicToggle = document.querySelector('#wheelHarmonyModeList [data-wheel-harmony-mode="melodic-minor"]');
      const eGroupBefore = document.querySelector('#circleSvg .wheel-mode-diagram[data-wheel-chord-identity="E"][data-wheel-hover-ring="major"]');
      const eSectorBefore = document.querySelector('#circleSvg .wheel-sector[data-wheel-chord-identity="E"][data-wheel-ring="major"]');
      const fullModesBefore = eSectorBefore?.dataset.wheelModes || '';
      melodicToggle.checked = false;
      melodicToggle.dispatchEvent(new Event('change', { bubbles: true }));
      const eGroupAfter = document.querySelector('#circleSvg .wheel-mode-diagram[data-wheel-chord-identity="E"][data-wheel-hover-ring="major"]');
      const eSectorAfter = document.querySelector('#circleSvg .wheel-sector[data-wheel-chord-identity="E"][data-wheel-ring="major"]');
      const paneReflowed = Number(eGroupBefore?.dataset.paneCount) === 4 &&
        Number(eGroupAfter?.dataset.paneCount) === 3 &&
        eGroupAfter?.dataset.paneModes === 'ionian,harmonic-minor,lydian';
      const menuDataPreserved = eSectorAfter?.dataset.wheelModes === fullModesBefore &&
        fullModesBefore.includes('melodic-minor') &&
        !eSectorAfter?.dataset.wheelVisibleModes.includes('melodic-minor') &&
        !eSectorAfter?.getAttribute('aria-label')?.includes('мелодический минор');
      const editorColorAfter = getComputedStyle(editorD).backgroundColor;
      const timelineColorAfter = getComputedStyle(timelineD, '::after').backgroundColor;
      const bodyMapClassAfter = document.body.classList.contains('is-harmony-highlights-on');
      activeChordInput = editorD.querySelector('.chord-input');
      activeSectionKey = null;
      wheelMode = '7';
      drawWheel();
      const standardD = document.querySelector('#circleSvg .wheel-sector[data-wheel-chord-identity="D7"][data-wheel-ring="major"]');
      const standardProfile = standardD?.dataset.harmonyProfile || '';
      const qualityProfileTracksEnabledMode = !!standardProfile &&
        (standardD?.dataset.wheelModes || '').split(',').includes(standardProfile) &&
        isWheelHarmonyModeEnabled(standardProfile) &&
        !standardD.classList.contains('wheel-harmony-mode-muted');
      melodicToggle.checked = true;
      melodicToggle.dispatchEvent(new Event('change', { bubbles: true }));
      return {
        paneReflowed,
        menuDataPreserved,
        editorStable: editorColorBefore === editorColorAfter,
        timelineStable: timelineColorBefore === timelineColorAfter,
        bodyMapClassStable: bodyMapClassBefore === bodyMapClassAfter,
        qualityProfileTracksEnabledMode,
        standardProfile,
        disabledAttribute: DOM.chordWheelModal.dataset.wheelHarmonyDisabledModes || '',
      };
    });
    ok('флажки перестраивают panes в трезвучиях, а вкладка качества выбирает включённый профиль',
      wheelToggleScope.paneReflowed && wheelToggleScope.menuDataPreserved && wheelToggleScope.editorStable &&
      wheelToggleScope.timelineStable && wheelToggleScope.bodyMapClassStable && wheelToggleScope.qualityProfileTracksEnabledMode &&
      !wheelToggleScope.disabledAttribute.includes('melodic-minor'), JSON.stringify(wheelToggleScope));
    const fullSeventhWheel = await page.evaluate(() => {
      const previous = {
        globalKey, keyMode, sections, activeChordInput, activeSectionKey, wheelMode,
        disabled: [...wheelHarmonyDisabledModes], loaded: wheelHarmonyModeVisibilityLoaded,
        showDegrees: document.getElementById('showDegrees').checked,
        rootKey: DOM.rootKey.value,
        modalOpen: DOM.chordWheelModal.classList.contains('open'),
      };
      globalKey = 'C'; keyMode = 'manual'; DOM.rootKey.value = 'C';
      sections = [{ id: 901, key: 'C', squares: [{ id: 902, events: [
        { chord: 'C7', span: 1 }, { chord: 'Gm7', span: 1 }, { chord: 'Bbmaj7', span: 1 },
      ] }] }];
      const syntheticOwner = document.createElement('div');
      syntheticOwner.className = 'chord-wrapper';
      const syntheticInput = document.createElement('input');
      syntheticInput.className = 'chord-input'; syntheticInput.value = 'C7';
      syntheticInput.dataset.sec = '901'; syntheticInput.dataset.square = '902'; syntheticInput.dataset.ei = '0';
      syntheticOwner.appendChild(syntheticInput); document.body.appendChild(syntheticOwner);
      activeChordInput = syntheticInput;
      activeSectionKey = null;
      wheelMode = '7';
      wheelHarmonyModeVisibilityLoaded = true;
      wheelHarmonyDisabledModes = new Set([...WHEEL_HARMONY_MODE_IDS].filter((mode) => mode !== 'mixolydian'));
      document.getElementById('showDegrees').checked = true;
      DOM.chordWheelModal.classList.add('open', 'is-harmony-highlights-on');
      drawWheel();
      const sector = (identity, ring) => document.querySelector(
        `#circleSvg .wheel-sector[data-wheel-chord-identity="${identity}"][data-wheel-ring="${ring}"]`);
      const gm7 = sector('Gm7', 'minor');
      const cMaj7 = sector('Cmaj7', 'major');
      const d7 = sector('D7', 'major');
      const fill = getComputedStyle(gm7).fill;
      const neutralFill = getComputedStyle(d7).fill;
      const d7Rect = d7.getBoundingClientRect();
      const hover = new PointerEvent('pointerover', {
        bubbles: true, clientX: d7Rect.left + d7Rect.width / 2,
        clientY: d7Rect.top + d7Rect.height / 2, pointerType: 'mouse',
      });
      d7.dispatchEvent(hover);
      const tooltip = document.getElementById('wheelHarmonyHoverTooltip');
      const result = {
        contextualMode: detectClearModalContext(['C7', 'Gm7', 'Bbmaj7'], 'C'),
        gm7Profile: gm7?.dataset.harmonyProfile || '',
        gm7Muted: gm7?.classList.contains('wheel-harmony-mode-muted'),
        gm7Degree: document.querySelector('#circleSvg .wheel-chord-label[data-wheel-chord-identity="Gm7"] .wheel-degree-label')?.textContent || '',
        cMaj7Profile: cMaj7?.dataset.harmonyProfile || '',
        d7Profile: d7?.dataset.harmonyProfile || '',
        d7Candidates: getWheelHarmonyHoverModes(d7).join(','),
        d7Function: d7?.dataset.wheelSecondaryFunction || '',
        d7HoverBound: wheelHarmonyHoverSector === d7,
        modalOpen: DOM.chordWheelModal.classList.contains('open'),
        d7TooltipVisible: !tooltip.hidden,
        d7TooltipModes: [...tooltip.querySelectorAll('.wheel-harmony-hover-mode-name')].map((node) => node.textContent).join(','),
        paneCount: document.querySelectorAll('#circleSvg .wheel-mode-pane').length,
        profileColorVisible: fill !== neutralFill,
      };
      hideWheelHarmonyHoverTooltip();
      wheelHarmonyDisabledModes.delete('lydian');
      drawWheel();
      const d7WithLydian = sector('D7', 'major');
      Object.assign(result, {
        d7ProfileWhenLydianEnabled: d7WithLydian?.dataset.harmonyProfile || '',
        d7MutedWhenLydianEnabled: d7WithLydian?.classList.contains('wheel-harmony-mode-muted'),
        d7FillWhenLydianEnabled: getComputedStyle(d7WithLydian).fill,
        d7DegreeWhenLydianEnabled: document.querySelector('#circleSvg .wheel-chord-label[data-wheel-chord-identity="D7"] .wheel-degree-label')?.textContent || '',
        paneCountWhenLydianEnabled: document.querySelectorAll('#circleSvg .wheel-mode-pane').length,
      });
      document.getElementById('showDegrees').checked = false;
      toggleDegreesOnWheel();
      const d7WithDegreesOff = sector('D7', 'major');
      const offRect = d7WithDegreesOff.getBoundingClientRect();
      d7WithDegreesOff.dispatchEvent(new PointerEvent('pointerover', {
        bubbles: true, clientX: offRect.left + offRect.width / 2,
        clientY: offRect.top + offRect.height / 2, pointerType: 'mouse',
      }));
      const tooltipWithDegreesOff = document.getElementById('wheelHarmonyHoverTooltip');
      Object.assign(result, {
        tooltipHiddenWhenDegreesOff: tooltipWithDegreesOff.hidden,
        ariaRemovedWhenDegreesOff: !d7WithDegreesOff.hasAttribute('aria-label'),
        titleRemovedWhenDegreesOff: !d7WithDegreesOff.querySelector('title'),
      });
      hideWheelHarmonyHoverTooltip();
      globalKey = previous.globalKey; keyMode = previous.keyMode; DOM.rootKey.value = previous.rootKey;
      sections = previous.sections; activeChordInput = previous.activeChordInput;
      activeSectionKey = previous.activeSectionKey; wheelMode = previous.wheelMode;
      wheelHarmonyModeVisibilityLoaded = previous.loaded;
      wheelHarmonyDisabledModes = new Set(previous.disabled);
      document.getElementById('showDegrees').checked = previous.showDegrees;
      updateCellsDegrees();
      DOM.chordWheelModal.classList.toggle('open', previous.modalOpen);
      syntheticOwner.remove();
      drawWheel();
      return result;
    });
    ok('вкладка септаккордов красит подтверждённый Mixolydian и включённый Lydian-кандидат без panes',
      fullSeventhWheel.contextualMode === 'mixolydian' && fullSeventhWheel.gm7Profile === 'mixolydian' &&
      !fullSeventhWheel.gm7Muted && fullSeventhWheel.gm7Degree === 'v' &&
      fullSeventhWheel.cMaj7Profile !== 'mixolydian' && !fullSeventhWheel.d7Profile &&
      fullSeventhWheel.d7Candidates === 'lydian' && fullSeventhWheel.d7Function === 'V/V' &&
      fullSeventhWheel.d7TooltipVisible && /Лидийский/.test(fullSeventhWheel.d7TooltipModes) &&
      fullSeventhWheel.d7ProfileWhenLydianEnabled === 'lydian' &&
      !fullSeventhWheel.d7MutedWhenLydianEnabled &&
      fullSeventhWheel.d7FillWhenLydianEnabled !== fullSeventhWheel.neutralFill &&
      fullSeventhWheel.d7DegreeWhenLydianEnabled === 'II' &&
      fullSeventhWheel.paneCount === 0 && fullSeventhWheel.paneCountWhenLydianEnabled === 0 &&
      fullSeventhWheel.profileColorVisible && fullSeventhWheel.tooltipHiddenWhenDegreesOff &&
      fullSeventhWheel.ariaRemovedWhenDegreesOff && fullSeventhWheel.titleRemovedWhenDegreesOff,
      JSON.stringify(fullSeventhWheel));

    const strictWheel = await page.evaluate(() => {
      const owner = document.querySelector('.chord-input[data-sec="91"][data-square="92"][data-ei="2"]');
      activeChordInput = owner;
      activeSectionKey = null;
      wheelMode = 'triads';
      drawWheel();
      const candidateFm = document.querySelector('#circleSvg .wheel-sector[data-wheel-chord-identity="Fm"]');
      owner.value = 'Fm';
      drawWheel();
      const ownerFm = document.querySelector('#circleSvg .wheel-sector[data-wheel-chord-identity="Fm"]');
      return {
        highlightsOn: document.getElementById('chordWheelModal').classList.contains('is-harmony-highlights-on'),
        candidateModes: candidateFm?.dataset.wheelModes || '',
        candidateProfile: candidateFm?.dataset.harmonyProfile || '',
        candidateAria: candidateFm?.getAttribute('aria-label') || '',
        candidateDegree: document.querySelector('#circleSvg .wheel-chord-label[data-wheel-chord-identity="Fm"] .wheel-degree-label')?.textContent || '',
        candidateBadge: document.querySelector('#circleSvg .wheel-chord-label[data-wheel-chord-identity="Fm"] .wheel-outside-orbit-label')?.textContent || '',
        ownerModes: ownerFm?.dataset.wheelModes || '',
        ownerSelected: ownerFm?.classList.contains('is-wheel-selected'),
        legendCurrentAbsent: !document.getElementById('wheelHarmonyLegendCurrent'),
      };
    });
    ok('круг не добавляет Fm искусственный профиль, ступень или текст; owner selection сохраняется',
      strictWheel.highlightsOn && strictWheel.candidateModes === '' && strictWheel.ownerModes === '' &&
      !strictWheel.candidateProfile && strictWheel.candidateAria === '' &&
      strictWheel.candidateDegree === '' && strictWheel.candidateBadge === '' &&
      strictWheel.ownerSelected && strictWheel.legendCurrentAbsent,
      JSON.stringify(strictWheel));
    ok('выключенные «Ступени» снимают ладовую заливку редактора',
      !state.harmonyClassWhenDegreesOff &&
      state.cellFillWhenDegreesOff === state.neutralCellFillWhenDegreesOff, JSON.stringify(state));
    ok('editor tints confirmed profiles only; V/x and unprofiled cells remain neutral',
      state.groups.join(',') === 'diatonic,secondary-function,' &&
      state.profiles.join(',') === 'ionian,secondary-function,' &&
      state.secondaryCellFill === state.neutralCellFill &&
      state.ionianCellFill !== state.neutralCellFill &&
      state.neutralCellFill === state.neutralCellFillWhenDegreesOff &&
      /вторичная доминанта V\/V/.test(state.gridFunctionText), JSON.stringify(state));
    ok('timeline keeps V/x text semantics without a colored marker; other profiles stay colored',
      state.timelineGroups.join(',') === 'diatonic,secondary-function,' &&
      state.timelineProfiles.join(',') === 'ionian,secondary-function,' &&
      state.timelineMarker === 'rgba(0, 0, 0, 0)' && state.ionianTimelineMarker !== 'rgba(0, 0, 0, 0)' &&
      state.neutralTimelineMarker === 'rgba(0, 0, 0, 0)' && /вторичная доминанта V\/V/.test(state.timelineFunctionText), JSON.stringify(state));
    ok('wheel keeps V/V semantic and selected marker but draws no V/x profile color',
      state.wheelGroup === 'secondary-function' && state.wheelProfile === 'secondary-function' && state.selected &&
      /V\/V/.test(state.wheelAria) && state.wheelVxFill === state.wheelFillWithoutProfile, JSON.stringify(state));
    ok('legend ? is hidden while degrees/colors are off and returns when enabled',
      state.legendHiddenWhenDegreesOff && state.legendStaysClosedWhenDegreesOff && state.legendVisibleWhenDegreesOn,
      JSON.stringify({ hiddenOff: state.legendHiddenWhenDegreesOff, staysClosed: state.legendStaysClosedWhenDegreesOff,
        visibleOn: state.legendVisibleWhenDegreesOn }));
    ok('legend ? opens accessibly', state.legendOpen && state.legendExpanded === 'true', JSON.stringify(state));
    ok('legend ? is a compact nine-mode palette; V/x has no color toggle and arrows are replaced',
      state.legendModeCount === 9 && state.legendHasAlterations && state.legendHasNoArrows &&
      !state.legendHasVx && !state.legendHasCurrentChord && state.legendNoteAbsent, JSON.stringify(state));
    ok('legend ? uses the major-context order without changing the set of modes',
      state.legendModeOrder.join(',') ===
        'ionian,mixolydian,lydian,aeolian,dorian,harmonic-minor,melodic-minor,phrygian,locrian',
      state.legendModeOrder.join(','));
    ok('question mark floats with the wheel on open and sinks on close', state.legendToggleFloats,
      JSON.stringify({ floats: state.legendToggleFloats }));
    const expectedModePalette = {
      light: {
        ionian: '#d4774d', aeolian: '#0594b8', 'harmonic-minor': '#9e3250', 'melodic-minor': '#dd95aa',
        dorian: '#8fb3fe', phrygian: '#7357bb', lydian: '#c8bd3c', mixolydian: '#6c5803', locrian: '#3c446a',
      },
      dark: {
        ionian: '#d89c47', aeolian: '#48b0a9', 'harmonic-minor': '#e55c85', 'melodic-minor': '#f8badf',
        dorian: '#aec1ff', phrygian: '#2f89fa', lydian: '#f3e667', mixolydian: '#a65f44', locrian: '#39659d',
      },
    };
    const matchesExpectedPalette = ['light', 'dark'].every((theme) =>
      Object.entries(expectedModePalette[theme]).every(([mode, color]) => state.modePalette[theme][mode] === color));
    const paletteValues = [...Object.values(state.modePalette.light), ...Object.values(state.modePalette.dark)];
    ok('approved mode palette separates all nine modes in both themes',
      Object.keys(state.modePalette.light).length === 9 && Object.keys(state.modePalette.dark).length === 9 &&
      new Set(Object.values(state.modePalette.light)).size === 9 && new Set(Object.values(state.modePalette.dark)).size === 9 &&
      state.modePalette.distances.light.minimum >= 25 && state.modePalette.distances.dark.minimum >= 25 &&
      matchesExpectedPalette,
      JSON.stringify({ matchesExpectedPalette, minimumLabDistance: state.modePalette.distances, paletteValues }));
    const allProfileCellTints = await (async () => {
      const profilePage = await browser.newPage();
      const errors = [];
      profilePage.on('pageerror', (error) => errors.push(String(error)));
      try {
        await profilePage.goto(`${appUrl}?b99-confirmed-profile-tints=${Date.now()}`, {
          waitUntil: 'load', timeout: 60000,
        });
        await profilePage.waitForFunction(() => typeof analyzeSectionHarmony === 'function');
        const captureTheme = (theme) => profilePage.evaluate(async (nextTheme) => {
          const fixtures = [
            { mode: 'ionian', key: 'C', chords: ['C', 'Dm', 'G'], sample: 'Dm' },
            { mode: 'aeolian', key: 'Am', chords: ['Am', 'Dm', 'Em'], sample: 'Am' },
            { mode: 'harmonic-minor', key: 'Am', chords: ['Am', 'Bdim', 'Caug', 'Dm', 'E', 'F', 'G#dim'], sample: 'Bdim' },
            { mode: 'melodic-minor', key: 'Am', chords: ['Am', 'Bm', 'Caug', 'D', 'E', 'F#dim', 'G#dim'], sample: 'Bm' },
            { mode: 'dorian', key: 'Cm', chords: ['Cm', 'Dm', 'F', 'Gm'], sample: 'F' },
            { mode: 'phrygian', key: 'Cm', chords: ['Cm', 'Db', 'Gdim', 'Bbm'], sample: 'Db' },
            { mode: 'lydian', key: 'C', chords: ['C', 'D', 'F#dim', 'G'], sample: 'D' },
            { mode: 'mixolydian', key: 'C', chords: ['C', 'Dm', 'F', 'Gm', 'Bb'], sample: 'Bb' },
            { mode: 'locrian', key: 'C', chords: ['Cdim', 'Db', 'Fm', 'Gb'], sample: 'Gb' },
          ];
          document.documentElement.setAttribute('data-theme', nextTheme);
          globalKey = 'C';
          keyMode = 'manual';
          DOM.rootKey.value = 'C';
          document.getElementById('showDegrees').checked = true;
          sections = fixtures.map((fixture, index) => ({
            id: 101 + index,
            type: fixture.mode,
            key: fixture.key,
            timeSig: '4/4',
            squares: [{ id: 201 + index, events: fixture.chords.map((chord) => ({ chord, span: 1 })) }],
          }));
          sections.push({ id: 120, type: 'Neutral', key: 'C', timeSig: '4/4', squares: [{
            id: 220, events: [{ chord: 'F#m', span: 1 }],
          }] });
          render();
          updateCellsDegrees();
          await new Promise((resolve) => setTimeout(resolve, 180));
          const profiles = Object.fromEntries(fixtures.map((fixture, index) => {
            const eventIndex = fixture.chords.indexOf(fixture.sample);
            const cell = document.querySelector(`.chord-wrapper[data-sec="${101 + index}"][data-ei="${eventIndex}"]`);
            const style = cell ? getComputedStyle(cell) : null;
            return [fixture.mode, {
              profile: cell?.dataset.harmonyProfile || '',
              color: style?.getPropertyValue('--harmony-profile-color').trim().toLowerCase() || '',
              fill: style?.backgroundColor || '',
            }];
          }));
          const neutral = document.querySelector('.chord-wrapper[data-sec="120"][data-ei="0"]');
          return {
            profiles,
            neutralProfile: neutral?.dataset.harmonyProfile || '',
            neutralFill: neutral ? getComputedStyle(neutral).backgroundColor : '',
          };
        }, theme);
        const light = await captureTheme('light');
        const dark = await captureTheme('dark');
        return { light, dark, errors };
      } finally {
        await profilePage.close();
      }
    })();
    const everyConfirmedProfileTinted = ['light', 'dark'].every((theme) =>
      Object.entries(expectedModePalette[theme]).every(([mode, color]) => {
        const sample = allProfileCellTints[theme].profiles[mode];
        return sample?.profile === mode && sample.color === color && sample.fill !== allProfileCellTints[theme].neutralFill;
      }) && new Set(Object.values(allProfileCellTints[theme].profiles).map((sample) => sample.fill)).size === 9 &&
      allProfileCellTints[theme].neutralProfile === '' &&
      allProfileCellTints[theme].profiles.ionian.fill !== allProfileCellTints[theme].neutralFill);
    ok('editor surfaces receive distinct tints for all nine confirmed profiles; unconfirmed cells stay neutral',
      everyConfirmedProfileTinted && allProfileCellTints.errors.length === 0,
      JSON.stringify(allProfileCellTints));
    const sectorHoverTooltip = await page.evaluate(async () => {
      const setTheme = (theme) => document.documentElement.setAttribute('data-theme', theme);
      activeChordInput = document.querySelector('.chord-input[data-sec="91"][data-square="92"][data-ei="2"]');
      activeSectionKey = null;
      wheelMode = 'triads';
      DOM.chordWheelModal.classList.add('open', 'is-harmony-highlights-on');
      drawWheel();
      bindWheelHarmonyLegend();
      setWheelHarmonyLegendOpen(true);
      const legendModeOrder = [...document.querySelectorAll('#wheelHarmonyModeList [data-wheel-harmony-mode]')]
        .map((input) => input.dataset.wheelHarmonyMode);
      const hoverModes = (target) => {
        const rect = target.getBoundingClientRect();
        const clientX = rect.left + rect.width / 2;
        const clientY = rect.top + rect.height / 2;
        const options = { bubbles: true, clientX, clientY, pageX: clientX + scrollX, pageY: clientY + scrollY, pointerType: 'mouse' };
        target.dispatchEvent(new PointerEvent('pointerover', options));
        target.dispatchEvent(new PointerEvent('pointermove', options));
        return {
          chord: document.querySelector('.wheel-harmony-hover-chord')?.textContent || '',
          context: document.querySelector('.wheel-harmony-hover-context')?.textContent || '',
          degrees: [...document.querySelectorAll('.wheel-harmony-hover-mode-degree')].map((node) => node.textContent),
          modes: [...document.querySelectorAll('.wheel-harmony-hover-mode')].map((row) => ({
            name: row.querySelector('.wheel-harmony-hover-mode-name')?.textContent || '',
            change: row.querySelector('.wheel-harmony-hover-mode-change')?.textContent || '',
            references: [...row.querySelectorAll('.wheel-harmony-reference-major, .wheel-harmony-reference-minor')]
              .map((node) => ({
                tone: node.classList.contains('wheel-harmony-reference-major') ? 'major' : 'minor',
                text: node.textContent,
                color: getComputedStyle(node).color,
              })),
          })),
          referenceColors: (() => {
            const modeNameColor = (mode) => getComputedStyle(document.querySelector(
              `#wheelHarmonyModeList [data-wheel-harmony-mode="${mode}"]`
            )?.closest('.wheel-harmony-mode-option')?.querySelector('.wheel-harmony-mode-name')).color;
            return { major: modeNameColor('ionian'), minor: modeNameColor('aeolian') };
          })(),
        };
      };
      const amSectorBeforeToggle = document.querySelector('#circleSvg .wheel-sector[data-wheel-chord-identity="Am"][data-wheel-ring="minor"]');
      const amAllModesTooltip = hoverModes(amSectorBeforeToggle);
      const melodicToggle = document.querySelector('#wheelHarmonyModeList [data-wheel-harmony-mode="melodic-minor"]');
      melodicToggle.checked = false;
      melodicToggle.dispatchEvent(new Event('change', { bubbles: true }));
      const amSectorAfterToggle = document.querySelector('#circleSvg .wheel-sector[data-wheel-chord-identity="Am"][data-wheel-ring="minor"]');
      const amFilteredTooltip = hoverModes(amSectorAfterToggle);
      const amPaneAfterToggle = document.querySelector('#circleSvg .wheel-mode-diagram[data-wheel-chord-identity="Am"][data-wheel-hover-ring="minor"]');
      const amPaneCount = amPaneAfterToggle?.dataset.paneCount;
      const amPaneModes = amPaneAfterToggle?.dataset.paneModes || '';
      const priorDisabledModes = [...wheelHarmonyDisabledModes];
      wheelHarmonyDisabledModes = new Set([...WHEEL_HARMONY_MODE_IDS]);
      drawWheel();
      const amSectorAllColorsOff = document.querySelector('#circleSvg .wheel-sector[data-wheel-chord-identity="Am"][data-wheel-ring="minor"]');
      const amAllColorsOffTooltip = hoverModes(amSectorAllColorsOff);
      const amAllColorsOffPaneCount = document.querySelectorAll('#circleSvg .wheel-mode-diagram').length;
      wheelHarmonyDisabledModes = new Set(priorDisabledModes);
      drawWheel();
      melodicToggle.checked = true;
      melodicToggle.dispatchEvent(new Event('change', { bubbles: true }));
      const sector = document.querySelector('#circleSvg .wheel-sector[data-wheel-chord-identity="D"][data-wheel-ring="major"]');
      const tooltip = document.getElementById('wheelHarmonyHoverTooltip');
      const sampleTheme = (theme) => {
        setTheme(theme);
        const rect = sector.getBoundingClientRect();
        const clientX = rect.left + rect.width / 2;
        const clientY = rect.top + rect.height / 2;
        const eventOptions = { bubbles: true, clientX, clientY, pageX: clientX + scrollX, pageY: clientY + scrollY, pointerType: 'mouse' };
        sector.dispatchEvent(new PointerEvent('pointerover', eventOptions));
        sector.dispatchEvent(new PointerEvent('pointermove', eventOptions));
        const title = tooltip.querySelector('.wheel-harmony-hover-chord');
        const context = tooltip.querySelector('.wheel-harmony-hover-context');
        const modes = [...tooltip.querySelectorAll('.wheel-harmony-hover-mode')].map((row) => ({
          degree: row.querySelector('.wheel-harmony-hover-mode-degree')?.textContent || '',
          name: row.querySelector('.wheel-harmony-hover-mode-name')?.textContent || '',
          change: row.querySelector('.wheel-harmony-hover-mode-change')?.textContent || '',
          color: getComputedStyle(row.querySelector('.wheel-harmony-hover-mode-name')).color,
          references: [...row.querySelectorAll('.wheel-harmony-reference-major, .wheel-harmony-reference-minor')]
            .map((node) => ({
              tone: node.classList.contains('wheel-harmony-reference-major') ? 'major' : 'minor',
              text: node.textContent,
              color: getComputedStyle(node).color,
            })),
        }));
        const modeNameColor = (mode) => getComputedStyle(document.querySelector(
          `#wheelHarmonyModeList [data-wheel-harmony-mode="${mode}"]`
        )?.closest('.wheel-harmony-mode-option')?.querySelector('.wheel-harmony-mode-name')).color;
        const referenceColors = { major: modeNameColor('ionian'), minor: modeNameColor('aeolian') };
        const legendRect = document.getElementById('wheelHarmonyLegend').getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        const circleRect = document.getElementById('circleSvg').getBoundingClientRect();
        const result = {
          chord: title?.textContent || '',
          context: context?.textContent || '',
          hidden: tooltip.hidden,
          modes,
          referenceColors,
          overlapsLegend: tooltipRect.left < legendRect.right && tooltipRect.right > legendRect.left &&
            tooltipRect.top < legendRect.bottom && tooltipRect.bottom > legendRect.top,
          overlapsCircle: tooltipRect.left < circleRect.right && tooltipRect.right > circleRect.left &&
            tooltipRect.top < circleRect.bottom && tooltipRect.bottom > circleRect.top,
          hasNativeTitleWhileOpen: !!sector.querySelector('title'),
          tooltipInsideViewport: tooltipRect.left >= 0 && tooltipRect.top >= 0 &&
            tooltipRect.right <= innerWidth + 1 && tooltipRect.bottom <= innerHeight + 1,
        };
        return result;
      };
      const light = sampleTheme('light');
      setTheme('dark');
      document.documentElement.style.setProperty('--ui-scale', '1.75');
      window.dispatchEvent(new Event('resize'));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const rect = sector.getBoundingClientRect();
      const clientX = rect.left + rect.width / 2;
      const clientY = rect.top + rect.height / 2;
      const zoomOptions = { bubbles: true, clientX, clientY, pageX: clientX + scrollX, pageY: clientY + scrollY, pointerType: 'mouse' };
      sector.dispatchEvent(new PointerEvent('pointermove', zoomOptions));
      const dark = sampleTheme('dark');
      clearWheelHover();
      document.documentElement.style.removeProperty('--ui-scale');
      setTheme('light');
      return {
        light,
        dark,
        legendModeOrder,
        amAllModesTooltip,
        amFilteredTooltip,
        amPaneCount,
        amPaneModes,
        amAllColorsOffTooltip,
        amAllColorsOffPaneCount,
        hiddenAfterLeave: tooltip.hidden,
        nativeTitleRestored: !!sector.querySelector('title'),
      };
    });
    ok('legend ? and its existing checkbox nodes follow the minor-context priority order',
      sectorHoverTooltip.legendModeOrder.join(',') ===
        'aeolian,harmonic-minor,dorian,melodic-minor,ionian,phrygian,mixolydian,lydian,locrian',
      sectorHoverTooltip.legendModeOrder.join(','));
    ok('Am tooltip сохраняет полный список режимов/ступеней при выключенных цветах; pane-поля продолжают следовать флажкам',
      sectorHoverTooltip.amAllModesTooltip.chord === 'Am' &&
      /Ступень i/.test(sectorHoverTooltip.amAllModesTooltip.context) &&
      sectorHoverTooltip.amAllModesTooltip.degrees.join(',') === 'i,i,i,i,i' &&
      sectorHoverTooltip.amAllModesTooltip.modes.map(({ name }) => name).join(',') ===
        'Эолийский,Гармонический минор,Дорийский,Мелодический минор,Фригийский' &&
      sectorHoverTooltip.amAllModesTooltip.modes.find(({ name }) => name === 'Эолийский')?.change
        .includes('Натуральный минор') &&
      sectorHoverTooltip.amAllModesTooltip.modes.find(({ name }) => name === 'Эолийский')?.references
        .some(({ tone, text }) => tone === 'minor' && text === 'минор') &&
      sectorHoverTooltip.amAllModesTooltip.modes.find(({ name }) => name === 'Эолийский')?.references
        .some(({ tone, text }) => tone === 'major' && text === 'мажора') &&
      sectorHoverTooltip.amFilteredTooltip.degrees.join(',') === 'i,i,i,i,i' &&
      sectorHoverTooltip.amFilteredTooltip.modes.map(({ name }) => name).join(',') ===
        'Эолийский,Гармонический минор,Дорийский,Мелодический минор,Фригийский' &&
      sectorHoverTooltip.amFilteredTooltip.modes.some(({ name }) => name === 'Мелодический минор') &&
      sectorHoverTooltip.amPaneCount === '1' && sectorHoverTooltip.amPaneModes === 'aeolian' &&
      sectorHoverTooltip.amAllColorsOffTooltip.chord === 'Am' &&
      sectorHoverTooltip.amAllColorsOffTooltip.degrees.join(',') === 'i,i,i,i,i' &&
      sectorHoverTooltip.amAllColorsOffTooltip.modes.map(({ name }) => name).join(',') ===
        'Эолийский,Гармонический минор,Дорийский,Мелодический минор,Фригийский' &&
      sectorHoverTooltip.amAllColorsOffPaneCount === 0,
      JSON.stringify(sectorHoverTooltip));
    ok('tooltip сохраняет лады и окрашивает ссылки на натуральный мажор/минор верными цветами в обеих темах',
      ['light', 'dark'].every((theme) => {
        const snapshot = sectorHoverTooltip[theme];
        const hasReference = (modeName, tone, text, expectedColor) =>
          snapshot.modes.find((mode) => mode.name === modeName)?.references.some((reference) =>
            reference.tone === tone && reference.text === text && reference.color === expectedColor);
        return snapshot.chord === 'D' && /Ступень IV/.test(snapshot.context) &&
          snapshot.modes.map((mode) => mode.name).join(',') ===
            'Дорийский,Мелодический минор,Ионийский,Миксолидийский' &&
          snapshot.modes.every((mode) => mode.degree === 'IV' && mode.change) &&
          snapshot.modes.find((mode) => mode.name === 'Ионийский')?.change ===
            'Натуральный мажор · ♯III · ♯VI · ♯VII от нат. минора' &&
          hasReference('Мелодический минор', 'minor', 'минора', snapshot.referenceColors.minor) &&
          hasReference('Дорийский', 'minor', 'минора', snapshot.referenceColors.minor) &&
          hasReference('Ионийский', 'major', 'мажор', snapshot.referenceColors.major) &&
          hasReference('Ионийский', 'minor', 'минора', snapshot.referenceColors.minor) &&
          hasReference('Миксолидийский', 'major', 'мажора', snapshot.referenceColors.major) &&
          !snapshot.hidden && !snapshot.overlapsLegend && !snapshot.overlapsCircle &&
          !snapshot.hasNativeTitleWhileOpen && snapshot.tooltipInsideViewport;
      }) && sectorHoverTooltip.hiddenAfterLeave && sectorHoverTooltip.nativeTitleRestored,
      JSON.stringify(sectorHoverTooltip));
    const menuAnnotations = await page.evaluate(() => {
      globalKey = 'C'; keyMode = 'manual'; activeSectionKey = null; activeChordInput = null;
      wheelMode = 'triads'; wheelHarmonyModeVisibilityLoaded = true;
      wheelHarmonyDisabledModes = new Set();
      document.getElementById('showDegrees').checked = true;
      DOM.chordWheelModal.classList.add('open', 'is-harmony-highlights-on');
      drawWheel();
      const tooltip = document.getElementById('wheelHarmonyHoverTooltip');
      const hover = (identity) => {
        const sector = document.querySelector(`#circleSvg .wheel-sector[data-wheel-chord-identity="${identity}"]`);
        const rect = sector.getBoundingClientRect();
        const clientX = rect.left + rect.width / 2;
        const clientY = rect.top + rect.height / 2;
        const options = { bubbles: true, clientX, clientY, pageX: clientX + scrollX, pageY: clientY + scrollY, pointerType: 'mouse' };
        sector.dispatchEvent(new PointerEvent('pointerover', options));
        sector.dispatchEvent(new PointerEvent('pointermove', options));
        return {
          identity,
          modes: sector.dataset.wheelModes || '',
          function: sector.dataset.wheelSecondaryFunction || '',
          profile: sector.dataset.harmonyProfile || '',
          degree: document.querySelector(`#circleSvg .wheel-chord-label[data-wheel-chord-identity="${identity}"] .wheel-degree-label`)?.textContent || '',
          annotation: document.querySelector(`#circleSvg .wheel-chord-label[data-wheel-chord-identity="${identity}"] .wheel-secondary-function-label`)?.textContent || '',
          hoverContext: tooltip.querySelector('.wheel-harmony-hover-context')?.textContent || '',
          paneCount: document.querySelector(`#circleSvg .wheel-mode-diagram[data-wheel-chord-identity="${identity}"]`)?.dataset.paneCount || '0',
          aria: sector.getAttribute('aria-label') || '',
          tooltipVisible: !tooltip.hidden,
          tooltipNote: tooltip.querySelector('.wheel-harmony-hover-note')?.textContent || '',
        };
      };
      const possibleVii = hover('A');
      const unprofiled = hover('F#m');
      wheelHarmonyDisabledModes = new Set(['lydian']);
      drawWheel();
      const possibleVvWithoutLydian = hover('D');
      globalKey = 'Am'; keyMode = 'manual';
      wheelHarmonyDisabledModes = new Set();
      drawWheel();
      const minorParallelMajorCandidate = hover('F#');
      globalKey = 'C'; keyMode = 'manual';
      wheelHarmonyDisabledModes = new Set();
      drawWheel();
      clearWheelHover();
      return { possibleVii, unprofiled, possibleVvWithoutLydian, minorParallelMajorCandidate };
    });
    ok('V/x хранится в меню и показывается в hover-tooltip, но не печатается на секторе; в миноре функций нет',
      menuAnnotations.possibleVii.modes === '' && menuAnnotations.possibleVii.function === 'V/ii' &&
      menuAnnotations.possibleVii.degree === '' && !/ступень VI/.test(menuAnnotations.possibleVii.aria) &&
      menuAnnotations.possibleVii.annotation === '' && menuAnnotations.possibleVii.paneCount === '0' &&
      !menuAnnotations.possibleVii.profile && menuAnnotations.possibleVii.tooltipVisible &&
      /возможная функция V\/ii/.test(menuAnnotations.possibleVii.hoverContext) &&
      /может вести к ii/.test(menuAnnotations.possibleVii.tooltipNote) &&
      menuAnnotations.unprofiled.degree === '' && menuAnnotations.unprofiled.annotation === '' &&
      menuAnnotations.unprofiled.paneCount === '0' && !menuAnnotations.unprofiled.profile &&
      !menuAnnotations.unprofiled.aria && !menuAnnotations.unprofiled.tooltipVisible &&
      !menuAnnotations.unprofiled.tooltipNote &&
      menuAnnotations.possibleVvWithoutLydian.degree === '' &&
      menuAnnotations.possibleVvWithoutLydian.function === 'V/V' &&
      menuAnnotations.possibleVvWithoutLydian.annotation === '' &&
      !/ступень II/.test(menuAnnotations.possibleVvWithoutLydian.aria) &&
      menuAnnotations.possibleVvWithoutLydian.tooltipVisible &&
      /возможная функция V\/V/.test(menuAnnotations.possibleVvWithoutLydian.hoverContext) &&
      /может вести к V/.test(menuAnnotations.possibleVvWithoutLydian.tooltipNote) &&
      !menuAnnotations.minorParallelMajorCandidate.function &&
      !/возможная функция|secondaryFunction/i.test(menuAnnotations.minorParallelMajorCandidate.hoverContext) &&
      !menuAnnotations.minorParallelMajorCandidate.tooltipNote &&
      menuAnnotations.minorParallelMajorCandidate.annotation === '',
      JSON.stringify(menuAnnotations));
    const legendIdleMotion = await page.evaluate(async () => {
      setWheelAnimationsEnabled(true, { persist: false, redraw: false });
      const showDegrees = document.getElementById('showDegrees');
      showDegrees.checked = true;
      updateCellsDegrees();
      const input = document.querySelector('.chord-input[data-sec="81"][data-square="82"][data-ei="1"]');
      activeChordInput = input;
      activeSectionKey = null;
      openChordWheel(input);
      const help = document.getElementById('wheelHarmonyLegendToggle');
      const surface = help.querySelector(':scope > .wheel-harmony-legend-toggle-surface');
      const hostBefore = help.getBoundingClientRect();
      const state = wheelModeTabsIdleMotionState;
      const tracked = !!state?.nodes.includes(help);
      surface.style.transition = 'none';
      if (state) writeWheelModeTabsIdleWater(state.startedAt + WHEEL_IDLE_WATER_PERIOD_MS / 8);
      void surface.offsetWidth;
      const idleX = help.style.getPropertyValue('--wheel-mode-idle-x');
      const idleY = help.style.getPropertyValue('--wheel-mode-idle-y');
      const surfaceStyle = getComputedStyle(surface);
      const hostStyle = getComputedStyle(help);
      const computedTranslate = surfaceStyle.translate;
      const visualFaceOnSurface = surfaceStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
        surfaceStyle.borderTopWidth === '1px' && hostStyle.backgroundColor === 'rgba(0, 0, 0, 0)' &&
        hostStyle.borderTopWidth === '0px';
      const hostAfter = help.getBoundingClientRect();
      const surfaceAfter = surface.getBoundingClientRect();
      const hostStationary = hostBefore.left === hostAfter.left && hostBefore.top === hostAfter.top;
      const visualSurfaceMatchesHost = Math.abs(surfaceAfter.width - hostAfter.width) < 0.1 &&
        Math.abs(surfaceAfter.height - hostAfter.height) < 0.1;
      surface.style.removeProperty('transition');
      closeChordWheel();
      const clearedOnClose = wheelModeTabsIdleMotionState === null &&
        !help.style.getPropertyValue('--wheel-mode-idle-x') && !help.style.getPropertyValue('--wheel-mode-idle-y');
      await new Promise((resolve) => setTimeout(resolve, 460));
      return {
        visible: !help.hidden,
        tracked,
        idleX,
        idleY,
        computedTranslate,
        vectorAppliedToSurface: computedTranslate === `${idleX} ${idleY}` && idleX !== '0px' && idleY !== '0px',
        visualFaceOnSurface,
        visualSurfaceMatchesHost,
        hostStationary,
        clearedOnClose,
      };
    });
    ok('в Chromium ? плавает собственной фазой, не сдвигает hit-target и очищается при закрытии',
      legendIdleMotion.visible && legendIdleMotion.tracked && legendIdleMotion.vectorAppliedToSurface &&
      legendIdleMotion.visualFaceOnSurface && legendIdleMotion.visualSurfaceMatchesHost &&
      legendIdleMotion.hostStationary && legendIdleMotion.clearedOnClose,
      JSON.stringify(legendIdleMotion));
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    const reducedLegendMotion = await page.evaluate(() => {
      const input = document.querySelector('.chord-input[data-sec="81"][data-square="82"][data-ei="1"]');
      activeChordInput = input;
      activeSectionKey = null;
      openChordWheel(input);
      const help = document.getElementById('wheelHarmonyLegendToggle');
      const surface = help.querySelector(':scope > .wheel-harmony-legend-toggle-surface');
      const result = {
        idleStateStopped: wheelModeTabsIdleMotionState === null,
        vectorsCleared: !help.style.getPropertyValue('--wheel-mode-idle-x') && !help.style.getPropertyValue('--wheel-mode-idle-y'),
        surfaceTransitionDuration: getComputedStyle(surface).transitionDuration,
        noOpeningOrFloatingClass: !DOM.chordWheelModal.classList.contains('wheel-opening') &&
          !DOM.chordWheelModal.classList.contains('wheel-floating-surface'),
      };
      closeChordWheel();
      return result;
    });
    ok('prefers-reduced-motion не запускает ?-плавание и убирает transition поверхности',
      reducedLegendMotion.idleStateStopped && reducedLegendMotion.vectorsCleared &&
      reducedLegendMotion.surfaceTransitionDuration === '0s' && reducedLegendMotion.noOpeningOrFloatingClass,
      JSON.stringify(reducedLegendMotion));
    await page.emulateMediaFeatures([]);
    const sectorClick = await (async () => {
      const clickPage = await browser.newPage();
      const errors = [];
      clickPage.on('pageerror', (error) => errors.push(String(error)));
      try {
        await clickPage.goto(`${appUrl}?b99-sector-hit-test=${Date.now()}`, {
          waitUntil: 'load', timeout: 60000,
        });
        await clickPage.waitForFunction(() => typeof openChordWheel === 'function');
        const setup = await clickPage.evaluate(() => {
          globalKey = 'C';
          keyMode = 'manual';
          DOM.rootKey.value = 'C';
          wheelMode = 'triads';
          wheelHarmonyModeVisibilityLoaded = true;
          wheelHarmonyDisabledModes = new Set();
          document.getElementById('showDegrees').checked = true;
          sections = [{ id: 501, type: 'Verse', key: 'C', timeSig: '4/4', squares: [{
            id: 502, events: [{ chord: 'C', span: 2 }, { chord: 'C', span: 2 }],
          }] }];
          render();
          updateCellsDegrees();
          return { initial: sections[0].squares[0].events.map((event) => event.chord) };
        });
        const clickCard = async ({ identity, ring, eventIndex, radius }) => {
          await clickPage.evaluate((ei) => {
            const input = document.querySelector(`.chord-input[data-sec="501"][data-square="502"][data-ei="${ei}"]`);
            activeChordInput = input;
            openChordWheel(input);
          }, eventIndex);
          await new Promise((resolve) => setTimeout(resolve, 230));
          const point = await clickPage.evaluate(({ identity: targetIdentity, ring: targetRing, radius: targetRadius }) => {
            const sectors = [...document.querySelectorAll(`#circleSvg .wheel-sector[data-wheel-ring="${targetRing}"]`)];
            const sector = sectors.find((node) => node.dataset.wheelChordIdentity === targetIdentity);
            if (!sector) throw new Error(`missing sector ${targetIdentity}/${targetRing}`);
            const index = sectors.indexOf(sector);
            const sectorAngle = -Math.PI / 2 - Math.PI / 12 + (index + 0.5) * (Math.PI / 6);
            const screenPoint = new DOMPoint(
              270 + targetRadius * Math.cos(sectorAngle),
              270 + targetRadius * Math.sin(sectorAngle)
            ).matrixTransform(sector.getScreenCTM());
            const hit = document.elementFromPoint(screenPoint.x, screenPoint.y);
            return {
              x: screenPoint.x,
              y: screenPoint.y,
              hitClass: hit?.getAttribute('class') || '',
              hitIdentity: hit?.dataset?.wheelChordIdentity || '',
              pointerEvents: getComputedStyle(sector).pointerEvents,
            };
          }, { identity, ring, radius });
          await clickPage.mouse.move(point.x, point.y);
          await new Promise((resolve) => setTimeout(resolve, 160));
          const hoverHit = await clickPage.evaluate(({ x, y }) => {
            const target = document.elementFromPoint(x, y);
            return {
              className: target?.getAttribute('class') || '',
              identity: target?.dataset?.wheelChordIdentity || '',
            };
          }, point);
          await clickPage.mouse.click(point.x, point.y);
          await new Promise((resolve) => setTimeout(resolve, 260));
          const committed = await clickPage.evaluate((ei) => ({
            value: document.querySelector(`.chord-input[data-sec="501"][data-square="502"][data-ei="${ei}"]`)?.value || '',
            model: sections[0].squares[0].events[ei].chord,
            open: DOM.chordWheelModal.classList.contains('open'),
          }), eventIndex);
          return { identity, ring, point, hoverHit, committed };
        };
        const major = await clickCard({ identity: 'D', ring: 'major', eventIndex: 0, radius: 230 });
        const minor = await clickCard({ identity: 'Am', ring: 'minor', eventIndex: 1, radius: 160 });
        return { setup, major, minor, errors };
      } finally {
        await clickPage.close();
      }
    })();
    const sectorsSelectableBySurface = ['D', 'Am'].every((identity) => {
      const result = identity === 'D' ? sectorClick.major : sectorClick.minor;
      return result.point.hitClass.includes('wheel-sector') && result.point.hitIdentity === identity &&
        result.point.pointerEvents === 'all' && result.hoverHit.className.includes('wheel-sector') &&
        result.hoverHit.identity === identity && result.committed.model === identity && !result.committed.open;
    });
    ok('клик по пустой части внешнего/внутреннего SVG-сектора записывает аккорд без нажатия на подпись',
      sectorsSelectableBySurface && sectorClick.errors.length === 0, JSON.stringify(sectorClick));
    ok('B-99 visual route completed without page errors', pageErrors.length === 0, pageErrors.join(' | '));
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} FAIL` : '\nALL OK — B-99 Chromium harmony UI');
  process.exit(failures ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
