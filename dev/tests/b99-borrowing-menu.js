#!/usr/bin/env node
// B-99: меню кандидатов на круге. В режиме трезвучий показываются подходящие
// ладовые профили и возможная вторичная функция; изменённые ступени следуют
// соответствующим цветовым флажкам. Это НЕ анализ прогрессии.
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
ok('Am: D — параллельный Ionian перед IV мелодического, дорийского и миксолидийского',
  amD?.degree === 'IV' && amD?.modes.join(',') === 'ionian,melodic-minor,dorian,mixolydian',
  JSON.stringify(amD));
const amDText = w.getBorrowingMenuText(amD);
ok('текст меню минорной тональности поясняет Ionian ступенями от натурального минора',
  amDText.includes('Ионийский (♯III · ♯VI · ♯VII от нат. минора)') &&
  !amDText.includes('Натуральный мажор'), amDText);

const amE = menu('E', 'Am');
ok('Am: E — параллельный Ionian перед V гармонического/мелодического и V лидийского',
  amE?.degree === 'V' && amE?.modes.join(',') === 'ionian,harmonic-minor,melodic-minor,lydian',
  JSON.stringify(amE));

const amFsm = menu('F#m', 'Am');
ok('Am: F#m — #vi параллельного Ionian/лидийского, но не мелодического минора',
  amFsm?.degree === '#vi' && !amFsm?.modes.includes('melodic-minor') &&
  amFsm?.modes.join(',') === 'ionian,lydian,mixolydian',
  JSON.stringify(amFsm));

const cAm = menu('Am', 'C');
const cAdim = menu('Adim', 'C');
const amFsharpMinor = menu('F#m', 'Am');
const amFsharpDim = menu('F#dim', 'Am');
ok('VI melodic minor is diminished: Am/F#m are excluded, Adim/F#dim are included in C/A minor',
  !cAm?.modes.includes('melodic-minor') && cAdim?.modes.includes('melodic-minor') &&
  !amFsharpMinor?.modes.includes('melodic-minor') && amFsharpDim?.modes.includes('melodic-minor') &&
  w.getHarmonyModeDegree(w.parseChordForKeyDetection('Am'), 'C', 'melodic-minor') === -1 &&
  w.getHarmonyModeDegree(w.parseChordForKeyDetection('Adim'), 'C', 'melodic-minor') === 5 &&
  w.getHarmonyModeDegree(w.parseChordForKeyDetection('F#m'), 'Am', 'melodic-minor') === -1 &&
  w.getHarmonyModeDegree(w.parseChordForKeyDetection('F#dim'), 'Am', 'melodic-minor') === 5,
  JSON.stringify({ cAm, cAdim, amFsharpMinor, amFsharpDim }));

const amBb = menu('A#', 'Am');
ok('Am: A# (=Bb) — осмысленная ♭II фригийского, а не «#I» от энгармоники',
  amBb?.degree === '♭II' && amBb?.modes.join(',') === 'phrygian,locrian',
  JSON.stringify(amBb));

const amTonic = menu('Am', 'Am');
ok('Am: тоника несёт базу и все минорные семейства, максимум 5 цветов',
  amTonic?.degree === 'i' && amTonic?.modes.length === 5 &&
  amTonic?.modes.join(',') === 'aeolian,harmonic-minor,melodic-minor,dorian,phrygian',
  JSON.stringify(amTonic));
const minorDisplayText = w.getBorrowingMenuText(amTonic);
const minorDisplayTextLower = minorDisplayText.toLocaleLowerCase('ru-RU');
const majorDisplayText = w.getBorrowingMenuText(menu('Bb', 'C'));
ok('поясняющие подписи сортируются по контексту без перестановки профилей меню',
  w.eval('getWheelHarmonyModeOrderForKey("C").join(",")') ===
    'ionian,mixolydian,lydian,aeolian,dorian,harmonic-minor,melodic-minor,phrygian,locrian' &&
  w.eval('getWheelHarmonyModeOrderForKey("Am").join(",")') ===
    'aeolian,harmonic-minor,dorian,melodic-minor,ionian,phrygian,mixolydian,lydian,locrian' &&
  minorDisplayTextLower.indexOf('эолийский') < minorDisplayTextLower.indexOf('гармонический минор') &&
  minorDisplayTextLower.indexOf('гармонический минор') < minorDisplayTextLower.indexOf('дорийский') &&
  minorDisplayTextLower.indexOf('дорийский') < minorDisplayTextLower.indexOf('мелодический минор') &&
  majorDisplayText.indexOf('миксолидийский') < majorDisplayText.indexOf('дорийский') &&
  amTonic.modes.join(',') === 'aeolian,harmonic-minor,melodic-minor,dorian,phrygian' &&
  amD.modes.join(',') === 'ionian,melodic-minor,dorian,mixolydian',
  JSON.stringify({ minorDisplayText, majorDisplayText, paneSourceOrder: amTonic.modes, amDSourceOrder: amD.modes }));

const amFm = menu('Fm', 'Am');
ok('Am: Fm не получает искусственный ладовой профиль или вторичную функцию',
  amFm?.modes.length === 0 && !amFm?.secondaryFunction && amFm?.degree === 'vi' &&
  !Object.hasOwn(amFm || {}, 'outsideOrbit'),
  JSON.stringify(amFm));

const amGdim = menu('G#dim', 'Am');
ok('Am: G#dim — vii° параллельного Ionian и гармонического/мелодического минора',
  amGdim?.degree === '#vii°' && amGdim?.modes.join(',') === 'ionian,harmonic-minor,melodic-minor',
  JSON.stringify(amGdim));

const amCaug = menu('Caug', 'Am');
ok('Am: Caug — III+ гармонического и мелодического минора',
  amCaug?.degree === 'III+' && amCaug?.modes.join(',') === 'harmonic-minor,melodic-minor',
  JSON.stringify(amCaug));

const cFm = menu('Fm', 'C');
ok('C: Fm — Aeolian-параллельный iv перед гармоническим минором/фригийским/локрийским',
  cFm?.degree === 'iv' && cFm?.modes.join(',') === 'aeolian,harmonic-minor,phrygian,locrian',
  JSON.stringify(cFm));

const cBb = menu('Bb', 'C');
ok('C: Bb — параллельный Aeolian перед ♭VII дорийского и миксолидийского',
  cBb?.degree === '♭VII' && cBb?.modes.join(',') === 'aeolian,dorian,mixolydian',
  JSON.stringify(cBb));

const cCm = menu('Cm', 'C');
ok('C: Cm — параллельный Aeolian перед четырьмя минорными семействами (всего 5)',
  cCm?.degree === 'i' && cCm?.modes.length === 5 &&
  cCm?.modes.join(',') === 'aeolian,harmonic-minor,melodic-minor,dorian,phrygian',
  JSON.stringify(cCm));

const cSecondaryMenus = ['A', 'E', 'B'].map((chord) => menu(chord, 'C'));
const cDSecondaryMenu = menu('D', 'C');
ok('C: A/E/B получают возможные V/ii, V/vi, V/iii, а D одновременно Lydian II и V/V',
  cSecondaryMenus.map((item) => item?.secondaryFunction).join(',') === 'V/ii,V/vi,V/iii' &&
  cSecondaryMenus.every((item) => item?.modes.length === 0 && !Object.hasOwn(item, 'outsideOrbit')) &&
  cDSecondaryMenu?.degree === 'II' && cDSecondaryMenu?.modes.includes('lydian') &&
  cDSecondaryMenu?.secondaryFunction === 'V/V' && !Object.hasOwn(cDSecondaryMenu || {}, 'outsideOrbit'),
  JSON.stringify({ cSecondaryMenus, cDSecondaryMenu }));
const cDSecondaryText = w.getBorrowingMenuText(cDSecondaryMenu);
const cPreviousVisibilityState = w.eval(`({
  loaded: wheelHarmonyModeVisibilityLoaded,
  disabled: [...wheelHarmonyDisabledModes],
})`);
w.eval(`
  wheelHarmonyModeVisibilityLoaded = true;
  wheelHarmonyDisabledModes = new Set(Object.keys(HARMONY_MODE_PROFILES));
`);
const cDSecondaryTextWithPaletteOff = w.getBorrowingMenuText(cDSecondaryMenu);
w.eval(`
  wheelHarmonyModeVisibilityLoaded = ${JSON.stringify(cPreviousVisibilityState.loaded)};
  wheelHarmonyDisabledModes = new Set(${JSON.stringify(cPreviousVisibilityState.disabled)});
`);
ok('getBorrowingMenuText описывает полный набор кандидатов независимо от видимости palette',
  cDSecondaryTextWithPaletteOff === cDSecondaryText &&
  /ступень II/.test(cDSecondaryTextWithPaletteOff) && /лидийский/.test(cDSecondaryTextWithPaletteOff) &&
  /V\/V/.test(cDSecondaryTextWithPaletteOff), cDSecondaryTextWithPaletteOff);
const cUnprofiled = ['F#m', 'C#m', 'G#m'].map((chord) => menu(chord, 'C'));
ok('C: F#m/C#m/G#m не получают искусственных ладовых кандидатов или функций',
  cUnprofiled.every((item) => item?.modes.length === 0 && !item?.secondaryFunction &&
    !!item?.degree && !Object.hasOwn(item, 'outsideOrbit')),
  JSON.stringify(cUnprofiled));
const degreeVisibility = w.eval(`(() => {
  const shown = (chord, key, enabled) => {
    const profile = getBorrowingMenuProfile(chord, key);
    return getWheelBorrowingDisplayDegree(profile, getScaleDegree(chord, key), enabled);
  };
  return {
    baseWithoutColor: shown('C', 'C', []),
    lydianOn: shown('D', 'C', ['lydian']),
    lydianOff: shown('D', 'C', []),
    functionWithoutMode: shown('A', 'C', []),
    unprofiledWithoutMode: shown('F#m', 'C', []),
    aeolianOn: shown('Bb', 'C', ['aeolian']),
    aeolianOff: shown('Bb', 'C', []),
  };
})()`);
ok('базовая ступень сохраняется; параллельная/альтерированная видна только с соответствующей подсветкой',
  degreeVisibility.baseWithoutColor === 'I' && degreeVisibility.lydianOn === 'II' &&
  degreeVisibility.lydianOff === '' && degreeVisibility.functionWithoutMode === '' &&
  degreeVisibility.unprofiledWithoutMode === '' && degreeVisibility.aeolianOn === '♭VII' &&
  degreeVisibility.aeolianOff === '', JSON.stringify(degreeVisibility));
const cFunctionAccessible = w.getWheelBorrowingAccessibleText(menu('A', 'C'), []);
const cUnprofiledAccessible = w.getWheelBorrowingAccessibleText(menu('F#m', 'C'), []);
ok('ARIA не показывает ступень без соответствующего цвета; функция остаётся текстом, неразобранный сектор — без пояснения',
  !/ступень VI/.test(cFunctionAccessible) && /возможная вторичная доминанта V\/ii/i.test(cFunctionAccessible) &&
  cUnprofiledAccessible === '',
  JSON.stringify({ cFunctionAccessible, cUnprofiledAccessible }));
const cSecondaryAccessible = w.getWheelBorrowingAccessibleText(menu('A', 'C'));
ok('текст кандидата называет возможную функцию и не выдаёт её за уже звучащую',
  /возможная вторичная доминанта V\/ii/i.test(cSecondaryAccessible) &&
  /может вести к ii/.test(cSecondaryAccessible), cSecondaryAccessible);
const amPossibleFunctions = ['F#', 'C#', 'G#'].map((chord) => menu(chord, 'Am'));
const emPossibleFunctions = ['C#', 'D#', 'G#'].map((chord) => menu(chord, 'Em'));
const amFunctionAccessible = w.getWheelBorrowingAccessibleText(menu('F#', 'Am'));
ok('в минорных ключах возможные функции ищут цель сначала в одноимённом Ionian',
  amPossibleFunctions.map((item) => item?.secondaryFunction).join(',') === 'V/ii,V/vi,V/iii' &&
  emPossibleFunctions.map((item) => item?.secondaryFunction).join(',') === 'V/ii,V/iii,V/vi' &&
  [...amPossibleFunctions, ...emPossibleFunctions].every((item) =>
    item?.secondaryFunctionMode === 'ionian' && item?.modes.length === 0 &&
    !Object.hasOwn(item, 'outsideOrbit')) &&
  /в контексте параллельного натурального мажора/.test(amFunctionAccessible),
  JSON.stringify({ amPossibleFunctions, emPossibleFunctions, amFunctionAccessible }));

const fshmB = menu('B', 'F#m');
ok('F#m: B — параллельный Ionian перед IV мелодического/дорийского/миксолидийского в диезной тональности',
  fshmB?.degree === 'IV' && fshmB?.modes.join(',') === 'ionian,melodic-minor,dorian,mixolydian',
  JSON.stringify(fshmB));

ok('sus/power-аккорды не получают меню: качество неоднозначно',
  menu('D5', 'Am') === null && menu('Dsus4', 'C') === null);

// ===== 2. Устойчивость ступени: одна ступень у всех ладов аккорда =====
// Прямая проверка через движок: степень одна и та же в каждом содержащем ладе.
const stabilityKeys = ['Am', 'C', 'Eb', 'F#m', 'Bb', 'C#m'];
let stabilityBroken = [];
const CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Regression sweep: all 12 major + 12 minor triads in four representative
// major/minor tonalities, under full-palette states (base mode on/off). No
// profile may create a sixth pane, duplicate a color, or layer alternatives
// over an enabled natural base. The unprofiled minor triads remain neutral;
// they do not get an extra classification or degree label.
const wheelAuditKeys = ['C', 'Am', 'G', 'Em'];
const expectedUnprofiledByKey = {
  C: ['C#m', 'F#m', 'G#m'],
  Am: ['D#m', 'Fm', 'A#m'],
  G: ['C#m', 'D#m', 'G#m'],
  Em: ['Cm', 'Fm', 'A#m'],
};
const unprofiledByKey = new Map();
const paneAuditErrors = [];
let maxPaneFields = 0;
let maxCandidateModes = 0;
for (const key of wheelAuditKeys) {
  const baseMode = key.endsWith('m') ? 'aeolian' : 'ionian';
  const baseCoreChords = w.eval(`(() => {
    const profile = HARMONY_MODE_PROFILES[${JSON.stringify(baseMode)}];
    const tonic = getHarmonyTonicIndex(${JSON.stringify(key)});
    return profile.intervals.map((interval, index) => {
      const quality = profile.qualities[index];
      const suffix = { maj: '', min: 'm', dim: 'dim', aug: 'aug' }[quality];
      return { quality, chord: CHROMATIC[(tonic + interval) % 12] + suffix };
    }).filter(({ quality }) => quality !== 'dim').map(({ chord }) => chord);
  })()`);
  for (const paletteState of [
    { name: 'all-enabled', disabled: [] },
    { name: 'natural-base-disabled', disabled: [baseMode] },
  ]) {
    w.eval(`
      globalKey = ${JSON.stringify(key)}; keyMode = 'manual';
      activeSectionKey = null; activeChordInput = null;
      wheelHarmonyModeVisibilityLoaded = true;
      wheelHarmonyDisabledModes = new Set(${JSON.stringify(paletteState.disabled)});
      wheelMode = 'triads';
    `);
    for (const root of CHROMATIC) {
      for (const suffix of ['', 'm']) {
        const chord = root + suffix;
        const profile = menu(chord, key);
        const panes = profile ? w.getWheelMenuPaneModes(profile) : [];
        if (!profile) paneAuditErrors.push(`${chord} in ${key}: no menu status for a valid triad`);
        maxPaneFields = Math.max(maxPaneFields, panes.length);
        maxCandidateModes = Math.max(maxCandidateModes, profile?.modes.length || 0);
        if (paletteState.name === 'all-enabled' && profile) {
          if (profile.modes.length === 0 && !profile.secondaryFunction) {
            const chords = unprofiledByKey.get(key) || [];
            chords.push(chord);
            unprofiledByKey.set(key, chords);
          }
          if (Object.hasOwn(profile, 'outsideOrbit')) {
            paneAuditErrors.push(`${chord} in ${key}: obsolete outside-orbit state remains`);
          }
        }
        if (profile && new Set(profile.modes).size !== profile.modes.length) {
          paneAuditErrors.push(`${chord} in ${key}/${paletteState.name}: duplicate candidates ${profile.modes.join(',')}`);
        }
        if (panes.length > 5 || new Set(panes).size !== panes.length) {
          paneAuditErrors.push(`${chord} in ${key}/${paletteState.name}: invalid panes ${panes.join(',')}`);
        }
        if (paletteState.name === 'all-enabled' && baseCoreChords.includes(chord) &&
            panes.join(',') !== baseMode) {
          paneAuditErrors.push(`${chord} in ${key}: natural triad double-colored as ${panes.join(',')}`);
        }
      }
    }
    w.eval('drawWheel()');
    const renderedGroups = [...w.document.querySelectorAll('#circleSvg .wheel-mode-diagram')];
    renderedGroups.forEach((group) => {
      const modes = [...group.querySelectorAll('.wheel-mode-pane')].map((pane) => pane.dataset.mode);
      if (modes.length > 5 || modes.length !== Number(group.dataset.paneCount) ||
          new Set(modes).size !== modes.length) {
        paneAuditErrors.push(`${group.dataset.wheelChordIdentity} in ${key}/${paletteState.name}: rendered ${modes.join(',')}`);
      }
    });
  }
}
const unprofiledSummary = Object.fromEntries(wheelAuditKeys.map((key) => [
  key,
  unprofiledByKey.get(key) || [],
]));
for (const key of wheelAuditKeys) {
  const unprofiled = unprofiledSummary[key];
  const expected = expectedUnprofiledByKey[key];
  if (unprofiled.join(',') !== expected.join(',')) {
    paneAuditErrors.push(`${key}: unexpected unprofiled candidates ${unprofiled.join(',')}`);
  }
}
ok('все 24 трезвучия в C/Am/G/Em: максимум 5 pane-полей; неразобранные аккорды без профиля/классификатора',
  paneAuditErrors.length === 0 && maxPaneFields <= 5 && maxCandidateModes <= 5,
  JSON.stringify({ keys: wheelAuditKeys, unprofiled: unprofiledSummary, maxPaneFields, maxCandidateModes, errors: paneAuditErrors.slice(0, 5) }));

for (const key of stabilityKeys) {
  for (const root of CHROMATIC) {
    for (const suffix of ['', 'm', 'dim', 'aug']) {
      const m = menu(root + suffix, key);
      if (!m?.modes.length) continue;
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
const visibleDegreeOf = (identity) => d.querySelector(
  `#circleSvg .wheel-chord-label[data-wheel-chord-identity="${identity}"] .wheel-degree-label`
)?.textContent || '';

const naturalMinorCorePaneModes = ['Am', 'C', 'Dm', 'Em', 'F', 'G'].map((identity) => wedgeModes(identity).join(','));
const naturalMinorDimPaneModes = w.eval("getWheelMenuPaneModes(getBorrowingMenuProfile('Bdim', 'Am')).join(',')");
ok('в миноре активный Эолийский задаёт один цвет для шести обычных ступеней, но не для dim',
  naturalMinorCorePaneModes.every((modes) => modes === 'aeolian') &&
  naturalMinorDimPaneModes === 'aeolian,harmonic-minor',
  JSON.stringify({ naturalMinorCorePaneModes, naturalMinorDimPaneModes }));

w.eval(`
  globalKey = 'C';
  wheelHarmonyDisabledModes = new Set();
  drawWheel();
`);
const naturalMajorCorePaneModes = ['C', 'Dm', 'Em', 'F', 'G', 'Am'].map((identity) => wedgeModes(identity).join(','));
const naturalMajorDimPaneModes = w.eval("getWheelMenuPaneModes(getBorrowingMenuProfile('Bdim', 'C')).join(',')");
ok('в мажоре активный Ионийский задаёт один цвет для шести обычных ступеней, но не для dim',
  naturalMajorCorePaneModes.every((modes) => modes === 'ionian') &&
  naturalMajorDimPaneModes === 'ionian,harmonic-minor,melodic-minor',
  JSON.stringify({ naturalMajorCorePaneModes, naturalMajorDimPaneModes }));
w.eval(`
  wheelHarmonyDisabledModes = getWheelHarmonyDisabledModesForEntryModes(['lydian', 'mixolydian']);
  drawWheel();
`);
const majorColorDistributionWithoutIonian = wedgeModes('C').join(',');
w.eval(`
  globalKey = 'Am';
  wheelHarmonyDisabledModes = getWheelHarmonyDisabledModesForEntryModes(['harmonic-minor', 'melodic-minor', 'dorian', 'phrygian']);
  drawWheel();
`);
const minorColorDistributionWithoutAeolian = wedgeModes('Am').join(',');
ok('при выключенном натуральном ладе другие включённые цвета снова делятся по профилям',
  majorColorDistributionWithoutIonian === 'lydian,mixolydian' &&
  minorColorDistributionWithoutAeolian === 'harmonic-minor,melodic-minor,dorian,phrygian',
  JSON.stringify({ majorColorDistributionWithoutIonian, minorColorDistributionWithoutAeolian }));

// Pane-geometry checks use all alternatives while the natural minor is off.
w.eval(`
  wheelHarmonyDisabledModes = new Set(['aeolian']);
  drawWheel();
`);

ok('сектор D в Am получает pane-поля параллельного Ionian перед семействами',
  wedgeModes('D').join(',') === 'ionian,melodic-minor,dorian,mixolydian',
  wedgeModes('D').join(','));
ok('после выключения натурального минора альтернативные цвета Am распределяются по четырём полям',
  wedgeModes('Am').join(',') === 'harmonic-minor,melodic-minor,dorian,phrygian',
  wedgeModes('Am').join(','));
ok('поля Am обрезаны по форме карточки',
  (() => {
    const dg = d.querySelector('#circleSvg .wheel-mode-diagram[data-wheel-chord-identity="Am"]');
    const panes = [...(dg?.querySelectorAll('.wheel-mode-pane') || [])];
    const clipRef = dg?.getAttribute('clip-path') || '';
    const clipId = clipRef.match(/^url\(#([^)]+)\)$/)?.[1];
    const clip = clipId && d.getElementById(clipId);
    return panes.length === 4 && panes.every((pane) => /^M-?[\d.]+ -?[\d.]+ A/.test(pane.getAttribute('d') || '')) &&
      !!clip?.querySelector('path');
  })(),
  '4 альтернативных поля + clipPath по границе карточки');
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
const minorDTooltipText = sector('D')?.getAttribute('aria-label') || '';
ok('минорная подсказка сортирует пояснения отдельно от pane-порядка и описывает Ionian от нат. минора',
  sector('D')?.dataset.wheelVisibleModes === 'dorian,melodic-minor,ionian,mixolydian' &&
  minorDTooltipText.indexOf('Дорийский') < minorDTooltipText.indexOf('Мелодический минор') &&
  minorDTooltipText.indexOf('Мелодический минор') < minorDTooltipText.indexOf('Ионийский') &&
  minorDTooltipText.indexOf('Ионийский') < minorDTooltipText.indexOf('Миксолидийский') &&
  minorDTooltipText.includes('♯III · ♯VI · ♯VII от нат. минора') &&
  wedgeModes('D').join(',') === 'ionian,melodic-minor,dorian,mixolydian',
  JSON.stringify({ visible: sector('D')?.dataset.wheelVisibleModes, pane: wedgeModes('D'), text: minorDTooltipText }));
ok('title-подсказка сектора дублирует меню для наведения мышью',
  /гармонический минор/i.test(sector('E')?.querySelector('title')?.textContent || ''),
  sector('E')?.querySelector('title')?.textContent || '');
ok('Fm без ладового профиля не получает дополнительную подпись, ступень или pane',
  !diagramOf('Fm') && !visibleDegreeOf('Fm') &&
  !sector('Fm')?.hasAttribute('aria-label') && !sector('Fm')?.querySelector('title') &&
  !sector('Fm')?.dataset.harmonyProfile && !sector('Fm')?.dataset.wheelOutsideOrbit &&
  !d.querySelector('#circleSvg .wheel-chord-label[data-wheel-chord-identity="Fm"] .wheel-outside-orbit-label'),
  `diagram=${!!diagramOf('Fm')}, degree=${visibleDegreeOf('Fm') || '—'}, aria=${sector('Fm')?.getAttribute('aria-label') || '—'}`);

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
const fourPanes = paneGroup('Am', 'minor');
ok('4 цвета без натурального минора: окно 2×2, четыре равных поля и два разделителя поверх overlay',
  fourPanes?.dataset.paneLayout === 'four-window' &&
  paneModes(fourPanes).join(',') === 'harmonic-minor,melodic-minor,dorian,phrygian' &&
  fourPanes.querySelectorAll('.wheel-mode-pane').length === 4 &&
  dividerCount(fourPanes) === 2 &&
  [...fourPanes.querySelectorAll('.wheel-mode-pane')].every((pane) => pane.dataset.paneAreaShare === '0.2500'),
  `${fourPanes?.dataset.paneLayout || 'нет'} / ${paneModes(fourPanes).join(',')}`);
const colorPaneGroups = [...twoPanes, ...threePanes, fourPanes].filter(Boolean);
const colorDividerWidths = colorPaneGroups.flatMap((group) =>
  [...(dividerLayerFor(group)?.querySelectorAll('.wheel-mode-divider') || [])].map(cssStrokeWidth));
ok('разделители в раскладках на 2–4 цвета имеют одинаковую толщину 2px',
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
  wheelHarmonyDisabledModes = new Set();
  wheelMode = 'triads'; drawWheel();
  bindWheelHarmonyLegend();
  document.getElementById('wheelHarmonyLegendToggle').click();
`);
const legend = d.getElementById('wheelHarmonyLegend');
const modeInputs = [...d.querySelectorAll('#wheelHarmonyModeList [data-wheel-harmony-mode]')];
const ionianModeInput = d.querySelector('#wheelHarmonyModeList [data-wheel-harmony-mode="ionian"]');
const aeolianModeInput = d.querySelector('#wheelHarmonyModeList [data-wheel-harmony-mode="aeolian"]');
ok('легенда компактно показывает все лады и контекстные изменения; минорный Ionian описан от натурального минора',
  !legend?.hidden && modeInputs.length === 9 &&
  /Ионийский/.test(legend?.textContent || '') &&
  !/Натуральный мажор/.test(ionianModeInput?.getAttribute('aria-label') || '') &&
  /♯III · ♯VI · ♯VII от нат\. минора/.test(ionianModeInput?.getAttribute('aria-label') || '') &&
  /Эолийский/.test(legend?.textContent || '') && /Натуральный минор/.test(legend?.textContent || '') &&
  /Натуральный минор/.test(aeolianModeInput?.getAttribute('aria-label') || '') &&
  /♯VII/.test(legend?.textContent || '') && /♯VI/.test(legend?.textContent || '') &&
  /♭II/.test(legend?.textContent || '') && /♭V/.test(legend?.textContent || '') &&
  !/[↑↓]/.test(legend?.textContent || '') && !/V\/x/.test(legend?.textContent || '') && !d.getElementById('wheelHarmonyLegendCurrent') &&
  modeInputs.every((input) => input.checked),
  (legend?.textContent || '').replace(/\s+/g, ' ').slice(0, 180));
const modeChangeDescription = (id) => d.querySelector(
  `#wheelHarmonyModeList [data-wheel-harmony-mode="${id}"]`
)?.closest('.wheel-harmony-mode-option')?.querySelector('.wheel-harmony-mode-change');
const modeReference = (id, tone) => modeChangeDescription(id)?.querySelector(`.wheel-harmony-reference-${tone}`);
ok('в минорном контексте Ionian помечен повышениями от натурального минора',
  modeChangeDescription('ionian')?.textContent === '♯III · ♯VI · ♯VII от нат. минора' &&
  modeReference('ionian', 'minor')?.textContent === 'минора' &&
  !modeReference('ionian', 'major'),
  modeChangeDescription('ionian')?.outerHTML || '');
w.eval("globalKey = 'C'; applyWheelHarmonyModeVisibility();");
ok('в мажорном контексте Ionian остаётся натуральным мажором без альтераций',
  modeChangeDescription('ionian')?.textContent === 'Натуральный мажор · без альтераций' &&
  modeReference('ionian', 'major')?.textContent === 'мажор' &&
  modeReference('aeolian', 'minor')?.textContent === 'минор' &&
  modeReference('aeolian', 'major')?.textContent === 'мажора' &&
  modeReference('harmonic-minor', 'minor')?.textContent === 'минора' &&
  modeReference('lydian', 'major')?.textContent === 'мажора',
  JSON.stringify({
    ionian: modeReference('ionian', 'major')?.outerHTML,
    aeolianMinor: modeReference('aeolian', 'minor')?.outerHTML,
    aeolianMajor: modeReference('aeolian', 'major')?.outerHTML,
    harmonicMinor: modeReference('harmonic-minor', 'minor')?.outerHTML,
    lydianMajor: modeReference('lydian', 'major')?.outerHTML,
  }));
w.eval("globalKey = 'Am'; applyWheelHarmonyModeVisibility();");
const naturalAliasMenuText = w.getBorrowingMenuText({ chord: 'Am', degree: 'i', modes: ['ionian', 'aeolian'] });
ok('текстовое описание меню тоже расшифровывает Ионийский и Эолийский',
  /Ионийский \(Натуральный мажор\)/.test(naturalAliasMenuText) &&
  /Эолийский \(Натуральный минор\)/.test(naturalAliasMenuText), naturalAliasMenuText);
const dorianToggle = d.querySelector('#wheelHarmonyModeList [data-wheel-harmony-mode="dorian"]');
const dSectorBeforeToggle = sector('D');
const dPaneBeforeToggle = paneGroup('D', 'major');
const fakeEditor = d.createElement('div');
fakeEditor.className = 'chord-wrapper';
fakeEditor.dataset.harmonyProfile = 'dorian';
const fakeTimeline = d.createElement('div');
fakeTimeline.className = 'tl-cell';
fakeTimeline.dataset.harmonyProfile = 'dorian';
d.body.append(fakeEditor, fakeTimeline);
dorianToggle.checked = false;
dorianToggle.dispatchEvent(new w.Event('change', { bubbles: true }));
const dPaneAfterToggle = paneGroup('D', 'major');
const dSectorAfterToggle = sector('D');
ok('отключение одного лада пересчитывает альтернативную 4→3-панель, сохраняя меню и scope только на круге',
  dPaneBeforeToggle?.dataset.paneLayout === 'four-window' &&
  Number(dPaneBeforeToggle?.dataset.paneCount) === 4 &&
  Number(dPaneAfterToggle?.dataset.paneCount) === 3 &&
  paneModes(dPaneAfterToggle).join(',') === 'ionian,melodic-minor,mixolydian' &&
  dSectorBeforeToggle?.dataset.wheelModes.includes('dorian') &&
  dSectorAfterToggle?.dataset.wheelModes.includes('dorian') &&
  !dSectorAfterToggle?.dataset.wheelVisibleModes.includes('dorian') &&
  !dSectorAfterToggle?.getAttribute('aria-label')?.includes('дорийский') &&
  d.getElementById('chordWheelModal').dataset.wheelHarmonyDisabledModes.includes('dorian') &&
  !fakeEditor.classList.contains('wheel-harmony-mode-muted') && !fakeTimeline.classList.contains('wheel-harmony-mode-muted') &&
  !d.body.classList.contains('is-harmony-mode-disabled') &&
  JSON.parse(w.localStorage.getItem('struchord-wheel-harmony-visibility-v1') || '[]').includes('dorian'),
  `${dPaneBeforeToggle?.dataset.paneLayout} (${dPaneBeforeToggle?.dataset.paneModes}) -> ${dPaneAfterToggle?.dataset.paneLayout} (${dPaneAfterToggle?.dataset.paneModes})`);
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
