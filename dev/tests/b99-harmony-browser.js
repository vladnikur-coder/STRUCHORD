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
      bindWheelHarmonyLegend();
      document.getElementById('wheelHarmonyLegendToggle').click();
      return {
        markerWhenDegreesOff,
        harmonyClassWhenDegreesOff,
        groups: [grid(0), grid(1), grid(3)].map((cell) => cell.dataset.harmonyGroup),
        profiles: [grid(0), grid(1), grid(3)].map((cell) => cell.dataset.harmonyProfile),
        gridMarker: getComputedStyle(grid(1), '::before').backgroundColor,
        neutralGridMarker: getComputedStyle(grid(3), '::before').backgroundColor,
        timelineGroups: [timeline(0), timeline(1), timeline(3)].map((cell) => cell.dataset.harmonyGroup),
        timelineProfiles: [timeline(0), timeline(1), timeline(3)].map((cell) => cell.dataset.harmonyProfile),
        timelineMarker: getComputedStyle(timeline(1), '::after').backgroundColor,
        neutralTimelineMarker: getComputedStyle(timeline(3), '::after').backgroundColor,
        selected: d7.classList.contains('is-wheel-selected'),
        wheelGroup: d7.dataset.harmonyGroup,
        wheelProfile: d7.dataset.harmonyProfile,
        legendOpen: !document.getElementById('wheelHarmonyLegend').hidden,
        legendExpanded: document.getElementById('wheelHarmonyLegendToggle').getAttribute('aria-expanded'),
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
        wheelCurrent: (() => {
          activeChordInput = grid(2).querySelector('.chord-input');
          activeSectionKey = null;
          wheelMode = 'triads';
          drawWheel();
          const current = document.getElementById('wheelHarmonyLegendCurrent');
          const fMinor = document.querySelector('#circleSvg .wheel-sector[data-wheel-chord-identity="Fm"]');
          const eMajor = document.querySelector('#circleSvg .wheel-sector[data-wheel-chord-identity="E"]');
          return {
            profile: current.dataset.harmonyProfile,
            text: current.textContent,
            fMinorModes: fMinor?.dataset.wheelModes || '',
            eMajorModes: eMajor?.dataset.wheelModes || '',
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
      minorLine.wheelCurrent.profile === 'melodic-minor' && /Мелодический минор/.test(minorLine.wheelCurrent.text) &&
      minorLine.wheelCurrent.fMinorModes === '' &&
      minorLine.wheelCurrent.eMajorModes === 'harmonic-minor,melodic-minor,lydian', JSON.stringify(minorLine));
    ok('B-99 pane layouts retain selection and use the 0.551 light-theme shade as a 2 px divider in both themes',
      minorLine.panePresentation.expectedLayouts.every((layout) => minorLine.panePresentation.layouts.includes(layout)) &&
      minorLine.panePresentation.paneCount > 0 &&
      minorLine.panePresentation.light.fillOpacity === '0.34' && minorLine.panePresentation.dark.fillOpacity === '0.45' &&
      minorLine.panePresentation.light.dividerStroke === 'rgba(0, 0, 0, 0.15)' &&
      minorLine.panePresentation.dark.dividerStroke === 'rgba(0, 0, 0, 0.15)' &&
      minorLine.panePresentation.light.dividerWidth === '2px' && minorLine.panePresentation.dark.dividerWidth === '2px' &&
      minorLine.panePresentation.paneLabelOverrideCount === 0 && minorLine.panePresentation.selectedD,
      JSON.stringify(minorLine.panePresentation));
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
        legend: document.getElementById('wheelHarmonyLegendCurrent')?.textContent || '',
      };
    });
    ok('круг не приписывает Fm тональности Am: Fm нейтрален и как candidate, и как owner',
      strictWheel.highlightsOn && strictWheel.candidateModes === '' && strictWheel.ownerModes === '' &&
      strictWheel.ownerSelected && strictWheel.legend === 'Fm',
      JSON.stringify(strictWheel));
    ok('выключенные «Ступени» не показывают B-99 marker',
      !state.harmonyClassWhenDegreesOff && state.markerWhenDegreesOff === 'rgba(0, 0, 0, 0)', JSON.stringify(state));
    ok('editor shows ionian / V/x only; ambiguous Bb is visually neutral',
      state.groups.join(',') === 'diatonic,secondary-function,' &&
      state.profiles.join(',') === 'ionian,secondary-function,' &&
      state.gridMarker !== 'rgba(0, 0, 0, 0)' && state.neutralGridMarker === 'rgba(0, 0, 0, 0)', JSON.stringify(state));
    ok('timeline carries the same confirmed profiles; ambiguous Bb has no marker',
      state.timelineGroups.join(',') === 'diatonic,secondary-function,' &&
      state.timelineProfiles.join(',') === 'ionian,secondary-function,' &&
      state.timelineMarker !== 'rgba(0, 0, 0, 0)' && state.neutralTimelineMarker === 'rgba(0, 0, 0, 0)', JSON.stringify(state));
    ok('wheel shows the separate applied V/V profile while selected marker survives',
      state.wheelGroup === 'secondary-function' && state.wheelProfile === 'secondary-function' && state.selected, JSON.stringify(state));
    ok('legend ? opens accessibly', state.legendOpen && state.legendExpanded === 'true', JSON.stringify(state));
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
