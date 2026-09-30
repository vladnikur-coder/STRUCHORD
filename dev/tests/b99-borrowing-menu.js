#!/usr/bin/env node
// B-99 (0.546): меню заимствований на круге. Круг в режиме трезвучий —
// меню для сочинения: у каждого сектора ступень и все лады этой тональности,
// в которых аккорд работает. Это НЕ анализ прогрессии: строгие профили
// остаются в редакторе/ленте и в строке «Текущий аккорд».
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
  wheelMode = 'triads';
  document.getElementById('showDegrees').checked = true;
  drawWheel();
`);
const sector = (identity) => d.querySelector(`#circleSvg .wheel-sector[data-wheel-chord-identity="${identity}"]`);
const dotsGroupOf = (identity) =>
  d.querySelector(`#circleSvg .wheel-chord-label[data-wheel-chord-identity="${identity}"] .wheel-mode-dots`);
const dotModes = (identity) =>
  [...d.querySelectorAll(`#circleSvg .wheel-chord-label[data-wheel-chord-identity="${identity}"] .wheel-mode-dot`)]
    .map((c) => c.dataset.mode);
const degreeTexts = () => [...d.querySelectorAll('#circleSvg .wheel-degree-label')].map((t) => t.textContent);

ok('сектор D несёт ряд из трёх точек меню',
  dotModes('D').join(',') === 'melodic-minor,dorian,mixolydian',
  dotModes('D').join(','));
ok('сектор Am несёт ряд из пяти точек, база первая',
  dotModes('Am').join(',') === 'aeolian,harmonic-minor,melodic-minor,dorian,phrygian',
  dotModes('Am').join(','));
ok('точки живут внутри label-группы и ходят вместе с подписью карточки',
  !!dotsGroupOf('D')?.closest('.wheel-chord-label.wheel-hoverable') &&
  dotsGroupOf('D')?.getAttribute('pointer-events') === 'none',
  `${dotsGroupOf('D')?.parentElement?.className?.baseVal || ''}`);
ok('у сектора A# (=Bb) есть степень ♭II прямо на карточке',
  degreeTexts().includes('♭II') && degreeTexts().includes('♭V'),
  degreeTexts().join(' '));
ok('aria-альтернатива сообщает ступень и все лады сектора D',
  /ступень IV/.test(sector('D')?.getAttribute('aria-label') || '') &&
  /мелодический минор/.test(sector('D')?.getAttribute('aria-label') || '') &&
  /дорийский/.test(sector('D')?.getAttribute('aria-label') || ''),
  sector('D')?.getAttribute('aria-label') || '');
ok('title-подсказка сектора дублирует меню для наведения мышью',
  (sector('E')?.querySelector('title')?.textContent || '').includes('гармонический минор'),
  sector('E')?.querySelector('title')?.textContent || '');
ok('Fm без меню: ни точек, ни aria',
  !dotsGroupOf('Fm') && !(sector('Fm')?.getAttribute('aria-label')),
  `${!!dotsGroupOf('Fm')} / ${sector('Fm')?.getAttribute('aria-label')}`);

// ===== 4. Гейт настройкой «Ступени и цвета круга» =====
w.eval("document.getElementById('showDegrees').checked = false; updateCellsDegrees();");
ok('выключенные «Ступени» убирают aria/title меню у секторов',
  !d.getElementById('chordWheelModal').classList.contains('is-harmony-highlights-on') &&
  !(sector('D')?.getAttribute('aria-label')) &&
  !(sector('D')?.querySelector('title')),
  `${sector('D')?.getAttribute('aria-label') || '—'}`);
w.eval("document.getElementById('showDegrees').checked = true; updateCellsDegrees();");
ok('возврат настройки возвращает текстовые альтернативы без перерисовки',
  /ступень IV/.test(sector('D')?.getAttribute('aria-label') || ''),
  sector('D')?.getAttribute('aria-label') || '');

// ===== 5. Другие режимы круга остаются на строгой раскраске =====
w.eval("wheelMode = '7'; drawWheel();");
const e7 = sector('E7');
ok('режим 7 без меню: строгий профиль по-прежнему работает',
  d.querySelectorAll('#circleSvg .wheel-mode-dot').length === 0 &&
  (e7?.dataset.harmonyGroup === 'minor-variant' || e7?.dataset.harmonyProfile === 'harmonic-minor'),
  `${e7?.dataset.harmonyGroup || '—'}/${e7?.dataset.harmonyProfile || '—'}`);

// ===== 6. Легенда «?» объясняет меню, а не анализ =====
w.eval(`
  wheelMode = 'triads'; drawWheel();
  bindWheelHarmonyLegend();
  document.getElementById('wheelHarmonyLegendToggle').click();
`);
const legend = d.getElementById('wheelHarmonyLegend');
ok('легенда называет карту меню заимствований и сохраняет шкалу ладов',
  /меню заимствований/i.test(legend?.textContent || '') &&
  /Ионийский/.test(legend?.textContent || '') &&
  /Локрийский/.test(legend?.textContent || '') &&
  !/не подтверждён/i.test(legend?.textContent || ''),
  (legend?.textContent || '').replace(/\s+/g, ' ').slice(0, 120));

console.log(failures ? `\n${failures} FAIL` : '\nALL OK — B-99 borrowing menu');
process.exit(failures ? 1 : 0);
