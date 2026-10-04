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
    const state = await page.evaluate(() => {
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
      const markerWhenDegreesOff = getComputedStyle(grid(1), '::before').backgroundColor;
      const harmonyClassWhenDegreesOff = document.body.classList.contains('is-harmony-highlights-on');
      bindWheelHarmonyLegend();
      const legendToggle = document.getElementById('wheelHarmonyLegendToggle');
      const legendHiddenWhenDegreesOff = legendToggle.hidden && getComputedStyle(legendToggle).display === 'none';
      legendToggle.click();
      const legendStaysClosedWhenDegreesOff = document.getElementById('wheelHarmonyLegend').hidden;
      document.getElementById('showDegrees').checked = true;
      updateCellsDegrees();
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
        markerWhenDegreesOff,
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
        gridMarker: getComputedStyle(grid(1), '::before').backgroundColor,
        ionianGridMarker: getComputedStyle(grid(0), '::before').backgroundColor,
        neutralGridMarker: getComputedStyle(grid(3), '::before').backgroundColor,
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
        legendHasAlterations: /♯VII/.test(document.getElementById('wheelHarmonyLegend').textContent) &&
          /♭II/.test(document.getElementById('wheelHarmonyLegend').textContent),
        legendHasNoArrows: !/[↑↓]/.test(document.getElementById('wheelHarmonyLegend').textContent),
        legendHasVx: /V\/x/.test(document.getElementById('wheelHarmonyLegend').textContent),
        legendHasCurrentChord: !!document.getElementById('wheelHarmonyLegendCurrent'),
      };
    });
    const minorLine = await page.evaluate(() => {
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
      // Pane-layout coverage below intentionally uses all nine profiles;
      // the exact production defaults are asserted before this fixture override.
      wheelHarmonyDisabledModes.clear();
      persistWheelHarmonyModeVisibility();
      document.getElementById('showDegrees').checked = true;
      render();
      timelineMode = true;
      renderTimeline();
      const grid = (ei) => document.querySelector(`.chord-wrapper[data-sec="91"][data-square="92"][data-ei="${ei}"]`);
      const timeline = (ei) => document.querySelector(`.tl-cell[data-sec="91"][data-square="92"][data-ei="${ei}"]`);
      return {
        defaultModes: { enabled: defaultEnabledModes, disabled: defaultDisabledModes },
        editorDegrees: [0, 1, 2, 3].map((ei) => grid(ei).querySelector('.degree-hint')?.textContent),
        timelineDegrees: [0, 1, 2, 3].map((ei) => timeline(ei).querySelector('.tl-degree')?.textContent),
        profiles: [0, 1, 2, 3].map((ei) => grid(ei).dataset.harmonyProfile),
        editorMarkers: [2, 3].map((ei) => getComputedStyle(grid(ei), '::before').backgroundColor),
        timelineProfiles: [0, 1, 2, 3].map((ei) => timeline(ei).dataset.harmonyProfile),
        wheelMenu: (() => {
          activeChordInput = grid(2).querySelector('.chord-input');
          activeSectionKey = null;
          wheelMode = 'triads';
          drawWheel();
          const fMinor = document.querySelector('#circleSvg .wheel-sector[data-wheel-chord-identity="Fm"]');
          const eMajor = document.querySelector('#circleSvg .wheel-sector[data-wheel-chord-identity="E"]');
          return {
            legendCurrentAbsent: !document.getElementById('wheelHarmonyLegendCurrent'),
            fMinorModes: fMinor?.dataset.wheelModes || '',
            eMajorModes: eMajor?.dataset.wheelModes || '',
            eMajorAria: eMajor?.getAttribute('aria-label') || '',
          };
        })(),
        panePresentation: (() => {
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
          return {
            layouts,
            expectedLayouts: ['solid', 'two-inner-outer', 'two-clockwise-halves', 'three-single-inner',
              'three-single-outer', 'four-window', 'five-window-2-inner-3-outer'],
            paneCount: groups.length,
            paneLabelOverrideCount,
            dividerSample,
            twoColorRingFillGap,
            multiColorDividerWidths,
            light,
            dark,
            selectedD: selectedD?.classList.contains('is-wheel-selected'),
          };
        })(),
      };
    });
    const exactMinorDefaults = ['aeolian', 'dorian', 'phrygian', 'locrian', 'harmonic-minor', 'melodic-minor'];
    const allHarmonyModes = ['ionian', 'aeolian', 'harmonic-minor', 'melodic-minor', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'locrian'];
    ok('в миноре по умолчанию включены только шесть минорных ладов',
      [...minorLine.defaultModes.enabled].sort().join(',') === [...exactMinorDefaults].sort().join(',') &&
      [...minorLine.defaultModes.disabled].sort().join(',') ===
        allHarmonyModes.filter((mode) => !exactMinorDefaults.includes(mode)).sort().join(','),
      JSON.stringify(minorLine.defaultModes));
    ok('Am–C–D–E visibly receives i–III–IV–V and exact aeolian/melodic/harmonic-minor colours',
      minorLine.editorDegrees.join(',') === 'i,III,IV,V' && minorLine.timelineDegrees.join(',') === 'i,III,IV,V' &&
      minorLine.profiles.join(',') === 'aeolian,aeolian,melodic-minor,harmonic-minor' &&
      minorLine.timelineProfiles.join(',') === 'aeolian,aeolian,melodic-minor,harmonic-minor' &&
      minorLine.editorMarkers[0] !== minorLine.editorMarkers[1] &&
      minorLine.wheelMenu.legendCurrentAbsent && minorLine.wheelMenu.fMinorModes === '' &&
      minorLine.wheelMenu.eMajorModes === 'harmonic-minor,melodic-minor,lydian' &&
      /E: ступень V в Am/.test(minorLine.wheelMenu.eMajorAria) &&
      /Гармонический минор/.test(minorLine.wheelMenu.eMajorAria), JSON.stringify(minorLine));
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
          return { x: screen.x, y: screen.y, paneKey: layer.dataset.paneKey };
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
      const editorColorBefore = getComputedStyle(editorD, '::before').backgroundColor;
      const timelineColorBefore = getComputedStyle(timelineD, '::after').backgroundColor;
      const bodyMapClassBefore = document.body.classList.contains('is-harmony-highlights-on');
      const melodicToggle = document.querySelector('#wheelHarmonyModeList [data-wheel-harmony-mode="melodic-minor"]');
      const amGroupBefore = document.querySelector('#circleSvg .wheel-mode-diagram[data-wheel-chord-identity="Am"][data-wheel-hover-ring="minor"]');
      const amSectorBefore = document.querySelector('#circleSvg .wheel-sector[data-wheel-chord-identity="Am"][data-wheel-ring="minor"]');
      const fullModesBefore = amSectorBefore?.dataset.wheelModes || '';
      melodicToggle.checked = false;
      melodicToggle.dispatchEvent(new Event('change', { bubbles: true }));
      const amGroupAfter = document.querySelector('#circleSvg .wheel-mode-diagram[data-wheel-chord-identity="Am"][data-wheel-hover-ring="minor"]');
      const amSectorAfter = document.querySelector('#circleSvg .wheel-sector[data-wheel-chord-identity="Am"][data-wheel-ring="minor"]');
      const paneReflowed = amGroupBefore?.dataset.paneLayout === 'five-window-2-inner-3-outer' &&
        Number(amGroupBefore?.dataset.paneCount) === 5 &&
        amGroupAfter?.dataset.paneLayout === 'four-window' && Number(amGroupAfter?.dataset.paneCount) === 4 &&
        amGroupAfter?.dataset.paneModes === 'aeolian,harmonic-minor,dorian,phrygian';
      const menuDataPreserved = amSectorAfter?.dataset.wheelModes === fullModesBefore &&
        fullModesBefore.includes('melodic-minor') &&
        !amSectorAfter?.dataset.wheelVisibleModes.includes('melodic-minor') &&
        !amSectorAfter?.getAttribute('aria-label')?.includes('мелодический минор');
      const editorColorAfter = getComputedStyle(editorD, '::before').backgroundColor;
      const timelineColorAfter = getComputedStyle(timelineD, '::after').backgroundColor;
      const bodyMapClassAfter = document.body.classList.contains('is-harmony-highlights-on');
      activeChordInput = editorD.querySelector('.chord-input');
      activeSectionKey = null;
      wheelMode = '7';
      drawWheel();
      const standardD = document.querySelector('#circleSvg .wheel-sector[data-wheel-chord-identity="D7"][data-wheel-ring="major"]');
      const standardProfileMuted = standardD?.dataset.harmonyProfile === 'melodic-minor' &&
        standardD.classList.contains('wheel-harmony-mode-muted');
      melodicToggle.checked = true;
      melodicToggle.dispatchEvent(new Event('change', { bubbles: true }));
      return {
        paneReflowed,
        menuDataPreserved,
        editorStable: editorColorBefore === editorColorAfter,
        timelineStable: timelineColorBefore === timelineColorAfter,
        bodyMapClassStable: bodyMapClassBefore === bodyMapClassAfter,
        standardProfileMuted,
        disabledAttribute: DOM.chordWheelModal.dataset.wheelHarmonyDisabledModes || '',
      };
    });
    ok('флажки перестраивают круговые pane-поля 5→4 без изменения меню/редактора/ленты',
      wheelToggleScope.paneReflowed && wheelToggleScope.menuDataPreserved && wheelToggleScope.editorStable &&
      wheelToggleScope.timelineStable && wheelToggleScope.bodyMapClassStable && wheelToggleScope.standardProfileMuted &&
      !wheelToggleScope.disabledAttribute.includes('melodic-minor'), JSON.stringify(wheelToggleScope));

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
        ownerModes: ownerFm?.dataset.wheelModes || '',
        ownerSelected: ownerFm?.classList.contains('is-wheel-selected'),
        legendCurrentAbsent: !document.getElementById('wheelHarmonyLegendCurrent'),
      };
    });
    ok('круг не приписывает Fm тональности Am: Fm нейтрален и как candidate, и как owner',
      strictWheel.highlightsOn && strictWheel.candidateModes === '' && strictWheel.ownerModes === '' &&
      strictWheel.ownerSelected && strictWheel.legendCurrentAbsent,
      JSON.stringify(strictWheel));
    ok('выключенные «Ступени» не показывают B-99 marker',
      !state.harmonyClassWhenDegreesOff && state.markerWhenDegreesOff === 'rgba(0, 0, 0, 0)', JSON.stringify(state));
    ok('editor keeps V/x text semantics without a colored marker; other profiles stay colored',
      state.groups.join(',') === 'diatonic,secondary-function,' &&
      state.profiles.join(',') === 'ionian,secondary-function,' &&
      state.gridMarker === 'rgba(0, 0, 0, 0)' && state.ionianGridMarker !== 'rgba(0, 0, 0, 0)' &&
      state.neutralGridMarker === 'rgba(0, 0, 0, 0)' && /вторичная доминанта V\/V/.test(state.gridFunctionText), JSON.stringify(state));
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
    ok('question mark floats with the wheel on open and sinks on close', state.legendToggleFloats,
      JSON.stringify({ floats: state.legendToggleFloats }));
    const paletteValues = [...Object.values(state.modePalette.light), ...Object.values(state.modePalette.dark)];
    ok('mode palette has distinct, more separated colors in both themes',
      Object.keys(state.modePalette.light).length === 9 && Object.keys(state.modePalette.dark).length === 9 &&
      new Set(Object.values(state.modePalette.light)).size === 9 && new Set(Object.values(state.modePalette.dark)).size === 9 &&
      state.modePalette.distances.light.minimum >= 25 && state.modePalette.distances.dark.minimum >= 25 &&
      state.modePalette.light.mixolydian === '#4f8a32' && state.modePalette.dark.mixolydian === '#9bcb64',
      JSON.stringify({ minimumLabDistance: state.modePalette.distances, paletteValues }));
    const sectorHoverTooltip = await page.evaluate(async () => {
      const setTheme = (theme) => document.documentElement.setAttribute('data-theme', theme);
      activeChordInput = document.querySelector('.chord-input[data-sec="91"][data-square="92"][data-ei="2"]');
      activeSectionKey = null;
      wheelMode = 'triads';
      DOM.chordWheelModal.classList.add('open', 'is-harmony-highlights-on');
      drawWheel();
      bindWheelHarmonyLegend();
      setWheelHarmonyLegendOpen(true);
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
          })),
        };
      };
      const amSectorBeforeToggle = document.querySelector('#circleSvg .wheel-sector[data-wheel-chord-identity="Am"][data-wheel-ring="minor"]');
      const amAllModesTooltip = hoverModes(amSectorBeforeToggle);
      const melodicToggle = document.querySelector('#wheelHarmonyModeList [data-wheel-harmony-mode="melodic-minor"]');
      melodicToggle.checked = false;
      melodicToggle.dispatchEvent(new Event('change', { bubbles: true }));
      const amSectorAfterToggle = document.querySelector('#circleSvg .wheel-sector[data-wheel-chord-identity="Am"][data-wheel-ring="minor"]');
      const amFilteredTooltip = hoverModes(amSectorAfterToggle);
      const amFourPaneCount = document.querySelector('#circleSvg .wheel-mode-diagram[data-wheel-chord-identity="Am"][data-wheel-hover-ring="minor"]')?.dataset.paneCount;
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
        }));
        const legendRect = document.getElementById('wheelHarmonyLegend').getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        const circleRect = document.getElementById('circleSvg').getBoundingClientRect();
        const result = {
          chord: title?.textContent || '',
          context: context?.textContent || '',
          hidden: tooltip.hidden,
          modes,
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
        amAllModesTooltip,
        amFilteredTooltip,
        amFourPaneCount,
        hiddenAfterLeave: tooltip.hidden,
        nativeTitleRestored: !!sector.querySelector('title'),
      };
    });
    ok('Am tooltip перечисляет все 5 активных ладов и после выключения Melodic Minor показывает только 4; геометрия тоже 5→4',
      sectorHoverTooltip.amAllModesTooltip.chord === 'Am' &&
      /Ступень i/.test(sectorHoverTooltip.amAllModesTooltip.context) &&
      sectorHoverTooltip.amAllModesTooltip.degrees.join(',') === 'i,i,i,i,i' &&
      sectorHoverTooltip.amAllModesTooltip.modes.map(({ name }) => name).join(',') ===
        'Эолийский,Гармонический минор,Мелодический минор,Дорийский,Фригийский' &&
      sectorHoverTooltip.amAllModesTooltip.modes.find(({ name }) => name === 'Эолийский')?.change
        .includes('Натуральный минор') &&
      sectorHoverTooltip.amFilteredTooltip.degrees.join(',') === 'i,i,i,i' &&
      sectorHoverTooltip.amFilteredTooltip.modes.map(({ name }) => name).join(',') ===
        'Эолийский,Гармонический минор,Дорийский,Фригийский' &&
      sectorHoverTooltip.amFilteredTooltip.modes.find(({ name }) => name === 'Эолийский')?.change
        .includes('Натуральный минор') &&
      sectorHoverTooltip.amFourPaneCount === '4', JSON.stringify(sectorHoverTooltip));
    ok('наведение на сектор показывает все включённые лады, ступень и изменения лада; tooltip не пропадает при zoom',
      ['light', 'dark'].every((theme) => sectorHoverTooltip[theme].chord === 'D' &&
        /Ступень IV/.test(sectorHoverTooltip[theme].context) &&
        sectorHoverTooltip[theme].modes.map((mode) => mode.name).join(',') ===
          'Мелодический минор,Дорийский,Миксолидийский' &&
        sectorHoverTooltip[theme].modes.every((mode) => mode.degree === 'IV' && mode.change) &&
        !sectorHoverTooltip[theme].hidden && !sectorHoverTooltip[theme].overlapsLegend &&
        !sectorHoverTooltip[theme].overlapsCircle && !sectorHoverTooltip[theme].hasNativeTitleWhileOpen &&
        sectorHoverTooltip[theme].tooltipInsideViewport) &&
      sectorHoverTooltip.hiddenAfterLeave && sectorHoverTooltip.nativeTitleRestored, JSON.stringify(sectorHoverTooltip));
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
