'use strict';
// 0.870 · B-39 Укулеле, Этап 3 (волна 1): домен таб-вставки.
// Чистый Node + vm (без зависимостей): вставка знает свой инструмент —
// 4 струны и лады 0..15 у укулеле, 6 струн и строй песни у гитары;
// старые вставки без полей читаются как гитарные; чужая вставка серая.
//
// Запуск: node dev/tests/b39-ukulele-tab-0870.js

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(ROOT, 'STRUCHORD.html'), 'utf8');
const SW = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const README = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const ROADMAP = fs.readFileSync(path.join(ROOT, 'ROADMAP.md'), 'utf8');

const H = (x) => JSON.parse(JSON.stringify(x));
let passed = 0;
function ok(msg) {
  passed++;
  console.log('  ok  ' + msg);
}

function sliceBetween(startMarker, endMarker, label) {
  const i0 = HTML.indexOf(startMarker);
  assert(i0 >= 0, `start marker not found (${label})`);
  const i1 = HTML.indexOf(endMarker, i0 + startMarker.length);
  assert(i1 > i0, `end marker not found (${label})`);
  return HTML.slice(i0, i1);
}

function extractFn(name) {
  const marker = '\nfunction ' + name + '(';
  const i0 = HTML.indexOf(marker);
  assert(i0 >= 0, `function ${name} not found`);
  const i1 = HTML.indexOf('\n}\n', i0);
  assert(i1 > i0, `end of function ${name} not found`);
  return HTML.slice(i0 + 1, i1 + 2);
}

function extractConst(name, endMarker) {
  const marker = `const ${name} = `;
  const i0 = HTML.indexOf(marker);
  assert(i0 >= 0, `const ${name} not found`);
  const i1 = HTML.indexOf(endMarker, i0 + marker.length);
  assert(i1 > i0, `end of const ${name} not found`);
  return HTML.slice(i0, i1 + endMarker.length);
}

// Общий стенд: реальные константы строёв + реальные функции домена.
function bootDomain() {
  const parts = [
    extractConst('PART_UKULELE_TUNINGS', '];'),
    "const PART_UKULELE_DEFAULT_TUNING = 'uke-high-g';",
    extractConst('PART_UKULELE_MAX_FRET', ';'),
    extractConst('TAB_INSERT_MAX_SAVE_FRET', ';'),
    extractConst('TAB_INSERT_MAX_NOTES', ';'),
    extractFn('tabInsertDomainFrom'),
    extractFn('tabInsertDomainPatch'),
    extractFn('tabInsertTuningFromTrack'),
    extractFn('tabAtTuningNotesFor'),
    extractFn('tabInsertStringFreqs'),
    // Заглушки соседей: гитарный строй, частоты, длительности, техника.
    "function tabAtTuningNotes(){ return ['E2','A2','D3','G3','B3','E4']; }",
    "function songLegacyStringFreqs(){ return [82.41,110,146.83,196,246.94,329.63]; }",
    "const NOTE_HZ = { 'G4':392, 'C4':261.63, 'E4':329.63, 'A4':440, 'G3':196, 'D3':146.83, 'B3':246.94, 'F#4':369.99, 'D4':293.66, 'B4':493.88 };",
    'function noteToFrequency(n){ return NOTE_HZ[n] || 0; }',
    "function parseTimeSig(ts){ const p = String(ts || '4/4').split('/'); return { numerator: Number(p[0]) || 4, denominator: Number(p[1]) || 4 }; }",
    'function tabInsertNoteDuration(n){ return (n.dur || 1) / 4; }',
    'function tabTechClean(n){ return {}; }',
    'function tabTechRepair(list){ return list; }',
    extractFn('tabInsertCleanNotes'),
  ];
  const ctx = vm.createContext({ console });
  vm.runInContext(parts.join('\n') + '\nglobalThis.__api = { tabInsertDomainFrom, tabInsertDomainPatch, tabInsertTuningFromTrack, tabAtTuningNotesFor, tabInsertStringFreqs, tabInsertCleanNotes, PART_UKULELE_TUNINGS };', ctx, { filename: 'domain-0870.vm.js' });
  return ctx.__api;
}

const api = bootDomain();

// =====================================================================
// 1. Статические инварианты 0.871
// =====================================================================
{
  assert(HTML.includes('ver 0.874'), 'STRUCHORD.html header is ver 0.874');
  assert(SW.includes("const CACHE_NAME = 'struchord-v874';"), 'sw.js CACHE_NAME is struchord-v874');
  assert(README.includes('`0.874`'), 'README header is 0.874');
  assert(ROADMAP.includes('**0.874**'), 'ROADMAP header is 0.874');

  for (const fn of ['tabInsertDomainFrom', 'tabInsertDomainPatch', 'tabInsertActiveInstrument',
    'tabInsertDomainForActiveTrack', 'tabInsertTuningFromTrack', 'tabInsertEditorDomain',
    'tabAtStringsCount', 'tabAtTuningNotesFor', 'tabInsertStringFreqs']) {
    assert(HTML.includes('function ' + fn + '('), `domain helper ${fn} exists`);
  }
  ok('Статические инварианты 0.871: версия, SW, README/ROADMAP и функции домена');
}

// =====================================================================
// 2. Домен: гитара по умолчанию, укулеле по полю, битый пресет — High G
// =====================================================================
{
  const guitar = api.tabInsertDomainFrom({});
  assert.deepStrictEqual(H(guitar), { instrument: 'guitar', tuning: null, strings: 6, maxFret: 30 }, 'no fields → guitar 6/30');
  assert.deepStrictEqual(H(api.tabInsertDomainFrom(null)), { instrument: 'guitar', tuning: null, strings: 6, maxFret: 30 }, 'null → guitar');

  const uke = api.tabInsertDomainFrom({ tabInstrument: 'ukulele' });
  assert.deepStrictEqual(H(uke), { instrument: 'ukulele', tuning: 'uke-high-g', strings: 4, maxFret: 15 }, 'ukulele without tuning → High G, 4 strings, fret 15');

  const low = api.tabInsertDomainFrom({ tabInstrument: 'ukulele', tabTuning: 'uke-low-g' });
  assert.strictEqual(low.tuning, 'uke-low-g', 'known preset is kept');
  const broken = api.tabInsertDomainFrom({ tabInstrument: 'ukulele', tabTuning: 'nope' });
  assert.strictEqual(broken.tuning, 'uke-high-g', 'unknown preset falls back to High G');
  const other = api.tabInsertDomainFrom({ tabInstrument: 'bass', tabTuning: 'uke-low-g' });
  assert.deepStrictEqual(H(other), { instrument: 'guitar', tuning: null, strings: 6, maxFret: 30 }, 'only ukulele is a special domain');

  assert.deepStrictEqual(H(api.tabInsertDomainPatch(uke)), { tabInstrument: 'ukulele', tabTuning: 'uke-high-g' }, 'ukulele writes two fields');
  assert.deepStrictEqual(H(api.tabInsertDomainPatch(guitar)), {}, 'guitar writes nothing — old files stay identical');
  ok('Домен вставки: без полей — гитара, с полем — укулеле (4 струны, лад 15), битый пресет → High G');
}

// =====================================================================
// 3. Строй: четыре пресета в порядке модели и частоты струн
// =====================================================================
{
  const expect = {
    'uke-high-g': ['G4', 'C4', 'E4', 'A4'],
    'uke-low-g': ['G3', 'C4', 'E4', 'A4'],
    'uke-baritone': ['D3', 'G3', 'B3', 'E4'],
    'uke-canadian': ['A4', 'D4', 'F#4', 'B4'],
  };
  for (const [tuning, notes] of Object.entries(expect)) {
    const domain = api.tabInsertDomainFrom({ tabInstrument: 'ukulele', tabTuning: tuning });
    assert.deepStrictEqual(H(api.tabAtTuningNotesFor(domain)), notes, `tuning ${tuning} notes`);
  }
  const highG = api.tabInsertDomainFrom({ tabInstrument: 'ukulele', tabTuning: 'uke-high-g' });
  const freqs = H(api.tabInsertStringFreqs(highG));
  assert.deepStrictEqual(freqs, [392, 261.63, 329.63, 440], 'ukulele string freqs: G4 C4 E4 A4 (reentrant High G)');
  assert.strictEqual(freqs.length, 4, 'four strings, not six');
  assert.deepStrictEqual(H(api.tabInsertStringFreqs(api.tabInsertDomainFrom(null))), [82.41, 110, 146.83, 196, 246.94, 329.63], 'guitar keeps song tuning');
  ok('Строй: High G / Low G / баритон / Canadian в порядке модели, 4 частоты, гитара — прежний строй песни');
}

// =====================================================================
// 4. Строй дорожки (`high-g`) → пресет «Партий» (`uke-high-g`)
// =====================================================================
{
  assert.strictEqual(api.tabInsertTuningFromTrack({ trackTuning: { id: 'low-g' } }), 'uke-low-g', 'track low-g → uke-low-g');
  assert.strictEqual(api.tabInsertTuningFromTrack({ trackTuning: { id: 'uke-baritone' } }), 'uke-baritone', 'already part id stays');
  assert.strictEqual(api.tabInsertTuningFromTrack({ tuning: 'canadian' }), 'uke-canadian', 'legacy field is read too');
  assert.strictEqual(api.tabInsertTuningFromTrack({ trackTuning: { id: 'e-std' } }), null, 'guitar tuning is not a ukulele preset');
  assert.strictEqual(api.tabInsertTuningFromTrack(null), null, 'no track → no tuning');
  ok('Строй дорожки переводится в пресет «Партий», чужие id не выдумываются');
}

// =====================================================================
// 5. Санитайзер: домен сужает струны и лады, без домена — как раньше
// =====================================================================
{
  const raw = [
    { start: 0, dur: 1, string: 4, fret: 3 },   // пятой струны у укулеле нет
    { start: 1, dur: 1, string: 0, fret: 16 },  // лад 16 > 15
    { start: 2, dur: 1, string: 3, fret: 15 },  // крайний допустимый
    { start: 3, dur: 1, string: 0, fret: 0 },
    { start: 4, dur: 1, string: 1, fret: 7, pause: false },
  ];
  const uke = api.tabInsertDomainFrom({ tabInstrument: 'ukulele' });
  const cleanedUke = H(api.tabInsertCleanNotes(raw, 8, '4/4', uke));
  assert.deepStrictEqual(cleanedUke.map((n) => n.string + ':' + n.fret), ['3:15', '0:0', '1:7'], 'ukulele keeps only 0..3 / 0..15');

  const cleanedGuitar = H(api.tabInsertCleanNotes(raw, 8, '4/4'));
  assert.deepStrictEqual(cleanedGuitar.map((n) => n.string + ':' + n.fret), ['4:3', '0:16', '3:15', '0:0', '1:7'], 'guitar (no domain) keeps them all');
  assert.deepStrictEqual(H(api.tabInsertCleanNotes(raw, 8, '4/4', api.tabInsertDomainFrom(null))),
    H(api.tabInsertCleanNotes(raw, 8, '4/4')), 'explicit guitar domain equals legacy behaviour');
  ok('Санитайзер: укулеле отбрасывает 5-ю струну и лад 16, гитара и старые вызовы — без изменений');
}

// =====================================================================
// 6. Вставка целиком: спека миниатюры, домен в ключе кэша, чужая карточка
// =====================================================================
{
  const specFrom = sliceBetween('function tabThumbSpecFrom(notes, beats, ts', '\n}\n', 'specFrom');
  assert(specFrom.includes('function tabThumbSpecFrom(notes, beats, ts, domain)'), 'spec builder accepts domain');
  assert(specFrom.includes("spec.i = 'ukulele';") && specFrom.includes('spec.g = domain.tuning;'), 'ukulele spec carries instrument and tuning');
  assert(HTML.includes("const key = [spec.th, spec.b, spec.t, spec.i || '', spec.g || '', width, JSON.stringify(spec.n)].join('|');"),
    'thumbnail cache key separates ukulele from guitar');
  assert(HTML.includes("domain: tabInsertDomainFrom({ tabInstrument: spec.i, tabTuning: spec.g })"),
    'thumbnail builds the staff with the insert domain');

  // 4 струны в стане: сборка берёт число струн из домена.
  assert(HTML.includes('note.string = Math.max(1, Math.min(domain.strings, spec.string));'), 'alphaTab staff clamps strings to the domain');
  assert(HTML.includes('const tuning = tabAtTuningNotesFor(domain);'), 'alphaTab staff uses the domain tuning');

  // Редактор: список струн и предел лада — от домена.
  assert(!HTML.includes('[0,1,2,3,4,5].map(s => [s, 6-s])'), 'hard-coded 6-string editor list is gone');
  assert(HTML.includes('${options(Array.from({ length: domain.strings }, (_, s) => [s, domain.strings - s]), n.string)}'),
    'editor string list is generated from the domain');
  assert(HTML.includes('max="${domain.maxFret}" step="1" aria-label="Лад"'), 'editor fret input is capped by the domain');
  assert(HTML.includes('const nextCursorStr = Math.max(0, Math.min(Math.max(1, tabAtStringsCount()) - 1, tabAtCursor.string + delta));'),
    'cursor cannot leave the domain rows');
  assert(!HTML.includes('Math.min(5, tabAtCursor.string'), 'old 6-string cursor clamp is gone');

  // Карточка: домен, серость чужой, доступность клика.
  assert(HTML.includes("const foreignInsert = domain.instrument !== tabInsertActiveInstrument();"), 'card knows a foreign instrument');
  assert(HTML.includes("const canEdit = interactive && !foreignInsert;"), 'foreign card is read-only');
  assert(HTML.includes("${foreignInsert ? ' is-foreign' : ''}"), 'foreign card is marked');
  assert(HTML.includes("${domain.instrument === 'ukulele' ? ' tab-insert--uke' : ''}"), 'ukulele card is marked');
  assert(HTML.includes('(canEdit ? `onclick='), 'click handler follows canEdit');

  // Видимость: скрытие таба на укулеле снято, вставка чужая — серая.
  assert(!HTML.includes('html.b39-ukulele-mode .tab-btn'), 'guitar tab controls are no longer hidden on ukulele');
  assert(!HTML.includes('html.b39-ukulele-mode .chord-wrapper--tab { display:none'), 'tab cells are no longer hidden on ukulele');
  assert(HTML.includes('.tab-insert.is-foreign { opacity: 0.55; cursor: default; pointer-events: none; }'), 'foreign insert is grey and inert');

  // Звук: частоты и тембр по домену.
  assert(HTML.includes('const freqs = tabInsertStringFreqs(domain);'), 'playback uses domain string freqs');
  assert(HTML.includes('tabTechSoundOptions(event,secondsPerUnit,freqs,evStart,sound,domain)'), 'playback passes domain to the technique engine');
  assert(HTML.includes('? { gain: PART_TIMBRE.ukulele.gain, bright: PART_TIMBRE.ukulele.bright }'), 'ukulele timbre is used');
  ok('Вставка целиком: спека и кэш миниатюры, 4-струнный стан, редактор, серая чужая карточка, звук по домену');
}

// =====================================================================
// 7. Данные: поля пишутся при создании/копировании, читаются в редакторе
// =====================================================================
{
  assert(HTML.includes('...tabInsertDomainPatch(tabInsertDomainForActiveTrack()),'), 'new insert is stamped with the active domain');
  assert(HTML.includes("...(src.tabInstrument === 'ukulele' ? { tabInstrument: 'ukulele', tabTuning: src.tabTuning } : {}),"),
    'cloned insert keeps its instrument');
  assert(HTML.includes('...tabInsertDomainPatch(domain || tabInsertEditorDomain()) };'), 'inline tab cell is stamped too');
  assert(HTML.includes('domain: tabInsertDomainFrom(isCell ? target.ev : target.sq),'), 'editor remembers the target domain');
  assert(HTML.includes("const domain = tabInsertDomainFrom(isCell ? ev : sq);\n  const foreignInsert"), 'card domain comes from the insert itself');

  // Сохранение и загрузка: домен — часть файла, иначе вставка «переодевалась».
  assert(HTML.includes('notes: tabInsertCleanNotes(sq.notes, getTabInsertBeats(sq, sec.timeSig || globalTimeSig), sec.timeSig || globalTimeSig, d),'),
    'save cleans square notes by its own domain');
  assert(HTML.includes('notes: tabInsertCleanNotes(rawSq.notes, rawSq.beats, parentTs, d), ...tabInsertDomainPatch(d) };'),
    'load validates the square domain and keeps it');
  assert(HTML.includes('return { isTab: true, tabNotes: tabInsertCleanNotes(rawEvent.tabNotes, evSpan, evParentTs, d), ...tabInsertDomainPatch(d) };'),
    'load keeps the inline cell domain');
  assert(HTML.includes('return { isTab: true, tabNotes: tabInsertCleanNotes(e.tabNotes, Math.max(1 / 16, Number(e.span) || 1), sec.timeSig || globalTimeSig, d), ...tabInsertDomainPatch(d) };'),
    'save writes the inline cell domain');
  assert(!/cloneSection[\s\S]{0,900}?Array\.isArray\(sq\.notes\) \? JSON\.parse\(JSON\.stringify\(sq\.notes\)\) : \[\],\n\s{6}\} : \{\}\)/.test(HTML),
    'cloneSection square branch keeps the instrument');
  ok('Данные: домен пишется только у укулеле, живёт в редакторе и в ячейке, переживает копию, сохранение и загрузку');
}

console.log(`\nB-39 Ukulele tab insert 0.870: ${passed} groups passed, 0 failed.`);
