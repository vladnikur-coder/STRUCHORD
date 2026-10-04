// B-99: Chromium proof that exact modal-profile colours reach real layout,
// while the selected wheel sector remains the existing accent state.
const path = require('path');
const { pathToFileURL } = require('url');
process.env.AWS_EXECUTION_ENV ||= 'AWS_Lambda_nodejs22.x';
const sparticuz = require('@sparticuz/chromium').default;
const puppeteer = require('puppeteer-core');

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
      const grid = (ei) => document.querySelector(`.chord-wrapper[data-sec="81"][data-square="82"][data-ei="${ei}"]`);
      const markerWhenDegreesOff = getComputedStyle(grid(1), '::before').backgroundColor;
      const harmonyClassWhenDegreesOff = document.body.classList.contains('is-harmony-highlights-on');
      document.getElementById('showDegrees').checked = true;
      updateCellsDegrees();
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
        legendHasAlterations: /↑VII/.test(document.getElementById('wheelHarmonyLegend').textContent) &&
          /↓II/.test(document.getElementById('wheelHarmonyLegend').textContent),
        legendHasVx: /V\/x/.test(document.getElementById('wheelHarmonyLegend').textContent),
        legendHasCurrentChord: !!document.getElementById('wheelHarmonyLegendCurrent'),
      };
    });
    const minorLine = await page.evaluate(() => {
      globalKey = 'Am';
      sections = [{ id: 91, type: 'Verse', key: null, timeSig: '4/4', squares: [{ id: 92, events: [
        { chord: 'Am', span: 1 }, { chord: 'C', span: 1 }, { chord: 'D', span: 1 }, { chord: 'E', span: 1 },
      ] }] }];
      document.getElementById('showDegrees').checked = true;
      render();
      timelineMode = true;
      renderTimeline();
      const grid = (ei) => document.querySelector(`.chord-wrapper[data-sec="91"][data-square="92"][data-ei="${ei}"]`);
      const timeline = (ei) => document.querySelector(`.tl-cell[data-sec="91"][data-square="92"][data-ei="${ei}"]`);
      return {
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
          const divider = document.querySelector('#circleSvg .wheel-mode-divider');
          const paneLabelOverrideCount = document.querySelectorAll('#circleSvg .wheel-mode-pane-label').length;
          const previousTheme = document.documentElement.getAttribute('data-theme');
          const themePaint = (theme) => {
            document.documentElement.setAttribute('data-theme', theme);
            return {
              fillOpacity: oneColor && getComputedStyle(oneColor.querySelector('.wheel-mode-pane')).fillOpacity,
              dividerStroke: divider && getComputedStyle(divider).stroke,
              dividerWidth: divider && getComputedStyle(divider).strokeWidth,
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
            light,
            dark,
            selectedD: selectedD?.classList.contains('is-wheel-selected'),
          };
        })(),
      };
    });
    ok('Am–C–D–E visibly receives i–III–IV–V and exact aeolian/melodic/harmonic-minor colours',
      minorLine.editorDegrees.join(',') === 'i,III,IV,V' && minorLine.timelineDegrees.join(',') === 'i,III,IV,V' &&
      minorLine.profiles.join(',') === 'aeolian,aeolian,melodic-minor,harmonic-minor' &&
      minorLine.timelineProfiles.join(',') === 'aeolian,aeolian,melodic-minor,harmonic-minor' &&
      minorLine.editorMarkers[0] !== minorLine.editorMarkers[1] &&
      minorLine.wheelMenu.legendCurrentAbsent && minorLine.wheelMenu.fMinorModes === '' &&
      minorLine.wheelMenu.eMajorModes === 'harmonic-minor,melodic-minor,lydian' &&
      /E: ступень V в Am/.test(minorLine.wheelMenu.eMajorAria) &&
      /Гармонический минор/.test(minorLine.wheelMenu.eMajorAria), JSON.stringify(minorLine));
    ok('B-99 pane layouts retain selection and use the 0.551 theme-matched divider token in both themes',
      minorLine.panePresentation.expectedLayouts.every((layout) => minorLine.panePresentation.layouts.includes(layout)) &&
      minorLine.panePresentation.paneCount > 0 &&
      minorLine.panePresentation.light.fillOpacity === '0.34' && minorLine.panePresentation.dark.fillOpacity === '0.45' &&
      minorLine.panePresentation.light.dividerStroke === 'rgba(0, 0, 0, 0.15)' &&
      minorLine.panePresentation.dark.dividerStroke === 'rgba(255, 255, 255, 0.12)' &&
      minorLine.panePresentation.light.dividerWidth === '2px' && minorLine.panePresentation.dark.dividerWidth === '2px' &&
      minorLine.panePresentation.paneLabelOverrideCount === 0 && minorLine.panePresentation.selectedD,
      JSON.stringify(minorLine.panePresentation));
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
    ok('legend ? opens accessibly', state.legendOpen && state.legendExpanded === 'true', JSON.stringify(state));
    ok('legend ? is a compact nine-mode palette; V/x has no color toggle',
      state.legendModeCount === 9 && state.legendHasAlterations && !state.legendHasVx && !state.legendHasCurrentChord, JSON.stringify(state));
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
          modes: [...document.querySelectorAll('.wheel-harmony-hover-mode-name')].map((node) => node.textContent),
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
      sectorHoverTooltip.amAllModesTooltip.modes.join(',') ===
        'Эолийский,Гармонический минор,Мелодический минор,Дорийский,Фригийский' &&
      sectorHoverTooltip.amFilteredTooltip.degrees.join(',') === 'i,i,i,i' &&
      sectorHoverTooltip.amFilteredTooltip.modes.join(',') ===
        'Эолийский,Гармонический минор,Дорийский,Фригийский' &&
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
