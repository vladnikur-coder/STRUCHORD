/* Тесты этапа 2 (STAGE 2 / микшер) для STRUCHORD.
   Запуск: node test_stage2.js [базовый.html] [пропатченный.html]
   DOM-тесты требуют jsdom (в стеке STRUCHORD он есть); без него они
   пропускаются, структурные и модельные проверки всё равно выполняются. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const W = __dirname;
const basePath = process.argv[2] || path.join(W, '..', 'uploads', 'STRUCHORD.html');
const patchedPath = process.argv[3] || path.join(W, '..', 'patch-work', 'stage2', 'STRUCHORD.html');
const base = fs.readFileSync(basePath, 'utf8');
const patched = fs.readFileSync(patchedPath, 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}

// ---------- 1. СТРУКТУРА ----------
console.log('\nСтруктура: блоки и хуки на месте');
const needles = [
  ['маркер STAGE2', '// >>> B-39 STAGE2 BEGIN (MIXER UI) <<<'],
  ['маркер /STAGE2', '// <<< B-39 STAGE2 END (MIXER UI) <<<'],
  ['стили b39-', 'chord-display.b39-ghost'],
  ['кнопка микшера', "id = 'b39MixerBtn'"],
  ['хук chord-input (2 места)', "window.StruChordMixer.displayChord(sec, sq, ev, ei) : (ev.chord || '')"],
  ['хук chord-display (2 места)', "window.StruChordMixer.ghostClass(sec, sq, ei) : ''"],
  ['хук setEventChord', 'window.StruChordMixer.redirectChordWrite(ev, newChord, posCtx)'],
  ['хук strumChord', '!window.StruChordMixer.mainAudible()'],
  ['resetToEmpty в модели', "dispatch('b39/tracks-reset-empty'"],
];
for (const [name, needle] of needles) {
  const n = patched.split(needle).length - 1;
  ok(name + ' (>=1)', n >= 1, n);
}
ok('базовый файл без STAGE2', !base.includes('B-39 STAGE2 BEGIN'));
ok('getChordNotes / songStore / setEventChord / strumChord на месте',
  ['function getChordNotes(cn, ks) {', 'const songStore = (function () {',
   'function setEventChord(ev, newChord, posCtx, keepShape) {',
   'function strumChord(ctx, shape, chordName, key, startTime, duration, baseGain) {']
    .every(x => patched.includes(x)));
ok('хук chord-input применён ровно 2 раза',
  patched.split("window.StruChordMixer.displayChord(sec, sq, ev, ei) : (ev.chord || '')").length - 1 === 2);
ok('хук chord-display применён ровно 2 раза',
  patched.split("window.StruChordMixer.ghostClass(sec, sq, ei) : ''").length - 1 === 2);
ok('часть 1 не пострадала', patched.includes('window.StruChordTracks.attach(b39ReadySong, rawSong)'));
ok('часть 0 не пострадала', patched.includes('window.StruChordFormula = Object.freeze'));

// ---------- 2. МОДЕЛЬ: ПУСТАЯ ПЕСНЯ (без DOM) ----------
console.log('\nМодель: явное пустое состояние новой песни');
function markerBlock(src, begin, end) {
  const i = src.indexOf(begin), j = src.indexOf(end, i);
  if (i < 0 || j < 0) throw new Error('маркер не найден: ' + begin);
  return src.slice(i, j + end.length);
}
const b0 = markerBlock(patched, '// >>> B-39 STAGE0 BEGIN (B-102) <<<', '// <<< B-39 STAGE0 END (B-102) <<<');
const b1 = markerBlock(patched, '// >>> B-39 STAGE1 BEGIN (TRACKS) <<<', '// <<< B-39 STAGE1 END (TRACKS) <<<');
const b2 = markerBlock(patched, '// >>> B-39 STAGE2 BEGIN (MIXER UI) <<<', '// <<< B-39 STAGE2 END (MIXER UI) <<<');

function fakeSong(tracks) {
  return {
    schemaVersion: 9, globalKey: 'C', sections: [
      { id: 1, squares: [{ id: 10, events: [{ chord: 'Am', span: 1 }, { chord: 'F', span: 1 }] }] }
    ]
  };
}
const sandbox = {
  console, Math, JSON, Set, Map, Object, Array, String, Number, Boolean, Date,
  parseInt, parseFloat, isNaN, Infinity, NaN, undefined,
  setTimeout: function () { return 0; },
  clearTimeout: function () {},
  __b39Sections: [],
  songStore: { dispatch(l, m) { return m(); }, subscribe() { return () => {}; }, log() { return []; } },
  normalizeAccidentals: v => String(v).replace(/♭/g, 'b').replace(/♯/g, '#'),
  normalizeChordCase: v => String(v),
  getKeyStyle: k => (/b/i.test(String(k)) ? 'flat' : 'sharp'),
  chordNameForReadablePreference: v => v,
  CHROMATIC: ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'],
  SHARP_TO_FLAT: { 'C#':'Db','D#':'Eb','F#':'Gb','G#':'Ab','A#':'Bb', B:'Cb' },
  FLAT_TO_SHARP: { Db:'C#', Eb:'D#', Gb:'F#', Ab:'G#', Bb:'A#', Cb:'B' },
  expandChordName: v => String(v),
};
sandbox.window = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext('var sections = []; var globalKey = "C";\n' + b0 + '\n' + b1 + '\n' + b2, sandbox,
  { filename: 'b39-stage0+1+2.js' });
const T = sandbox.StruChordTracks;
const M = sandbox.StruChordMixer;
ok('StruChordMixer загрузился без DOM', !!M && typeof M.displayChord === 'function');
ok('resetToEmpty доступен', typeof T.resetToEmpty === 'function');

const legacy = fakeSong();
sandbox.sections = JSON.parse(JSON.stringify(legacy.sections));
sandbox.__b39Sections = sandbox.sections;
T.load(T.attach(legacy, legacy));
ok('старый файл -> одна гитара, isEmpty=false', T.state().tracks.length === 1 && !T.state().isEmpty);
ok('дефолтный сейв пустой', JSON.stringify(T.exportForSave()) === '{}');

T.resetToEmpty();
ok('resetToEmpty -> ноль дорожек', T.state().tracks.length === 0 && T.state().isEmpty);
ok('activeTrackId = 0', T.state().activeTrackId === 0);
const emptySave = T.exportForSave();
ok('пустое состояние пишется в файл ЯВНО', emptySave.tracks && emptySave.tracks.length === 0, emptySave);
const round = Object.assign({}, legacy, emptySave);
const attachedEmpty = T.attach(round, round);
ok('attach сохранил tracks: []', attachedEmpty.tracks.length === 0, attachedEmpty.tracks);
T.load(attachedEmpty);
ok('после загрузки всё ещё пусто (не превратилось в гитару)', T.state().isEmpty);
const firstId = T.addTrack('keys');
ok('первая дорожка создана', T.state().tracks.length === 1 && T.track(firstId).instrument === 'keys');
ok('первая дорожка стала главной и активной', T.state().mainTrackId === firstId && T.state().activeTrackId === firstId);
ok('после добавления состояние не дефолтное', !T.isDefault());

// ---------- 3. ОТОБРАЖЕНИЕ АКТИВНОЙ ДОРОЖКИ И ПРИЗРАК ----------
console.log('\nОтображение: активная дорожка и призрачный аккорд');
const song = fakeSong();
const secs = JSON.parse(JSON.stringify(song.sections));
sandbox.sections = secs; sandbox.__b39Sections = secs;
T.load(T.attach(song, song));
const gid = T.mainTrack().id;
const kid = T.addTrack('keys');
const sec = secs[0], sq = sec.squares[0];
ok('главная показывает свой аккорд', (T.setActive(gid), M.displayChord(sec, sq, sq.events[0], 0) === 'Am'));
ok('ghostClass пуст на главной', M.ghostClass(sec, sq, 0) === '');
T.setActive(kid);
ok('клавишная показывает скопированный аккорд', M.displayChord(sec, sq, sq.events[0], 0) === 'Am');
T.setTrackChord(kid, '1:10:0', 'Am7');
ok('свой аккорд клавишной виден', M.displayChord(sec, sq, sq.events[0], 0) === 'Am7');
ok('главная при этом не изменилась', sq.events[0].chord === 'Am');
T.setTrackChord(kid, '1:10:0', '');
ok('пустая ячейка показывает призрачный аккорд', M.displayChord(sec, sq, sq.events[0], 0) === 'Am');
ok('ghostClass подсвечивает призрак', M.ghostClass(sec, sq, 0) === ' b39-ghost');
ok('M/S по умолчанию звучат', M.mainAudible() === true);
T.setMute(gid, true);
ok('мьют главной глушит звук', M.mainAudible() === false);
T.setMute(gid, false);
T.setSolo(kid, true);
ok('соло на клавишной глушит единственный голос', M.mainAudible() === false);
T.setSolo(gid, true);
ok('соло на главной возвращает звук', M.mainAudible() === true);

// ---------- 4. ПЕРЕНАПРАВЛЕНИЕ ЗАПИСИ АККОРДА ----------
console.log('\nКруг пишет только в активную дорожку');
T.setSolo(kid, false); T.setSolo(gid, false);
T.setActive(gid);
ok('на главной редирект не срабатывает',
  M.redirectChordWrite(sq.events[0], 'C', { secId: 1, sqId: 10, ei: 0 }) === false);
T.setActive(kid);
const beforeMain = sq.events[0].chord;
const redirected = M.redirectChordWrite(sq.events[0], 'Dm9', { secId: 1, sqId: 10, ei: 0 });
ok('на неглавой редирект сработал', redirected === true);
ok('аккорд записан в клавишную', T.trackChord(kid, '1:10:0') === 'Dm9');
ok('главная осталась нетронутой', sq.events[0].chord === beforeMain, sq.events[0].chord);
ok('повторная запись того же аккорда не плодит команды',
  M.redirectChordWrite(sq.events[0], 'Dm9', { secId: 1, sqId: 10, ei: 0 }) === true);

// ---------- 5. DOM-ТЕСТЫ (jsdom, если установлен) ----------
let JSDOM = null;
try { JSDOM = require('jsdom').JSDOM; } catch (e) { /* нет jsdom — пропускаем */ }
if (!JSDOM) {
  console.log('\nDOM-тесты пропущены: jsdom не найден (NODE_PATH=/путь/к/node_modules).');
} else {
  console.log('\nDOM: кнопка, панель, строки, «+», «⋯», M/S, перетаскивание');
  const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>
    <div class="transport-bar">
      <button id="btnPlay"></button><button id="btnCountIn"></button>
      <div class="transport-dock-hint" id="transportDockHint"></div>
    </div></body></html>`, { runScripts: 'outside-only', url: 'http://localhost/' });
  const w = dom.window;
  const d = w.document;
  const uiSections = [{ id: 1, squares: [{ id: 10, events: [{ chord: 'Am', span: 1 }, { chord: 'F', span: 1 }] }] }];
  w.__b39Sections = uiSections;
  const subs = [], dispatchLog = [];
  w.songStore = {
    dispatch(label, mutator) { dispatchLog.push(label); const r = mutator(); subs.forEach(f => { try { f({ label, quiet: false }); } catch (e) {} }); return r; },
    subscribe(fn) { subs.push(fn); return () => {}; },
    log() { return []; }
  };
  w.normalizeAccidentals = v => String(v).replace(/♭/g, 'b').replace(/♯/g, '#');
  w.normalizeChordCase = v => String(v);
  w.getKeyStyle = k => (/b/i.test(String(k)) ? 'flat' : 'sharp');
  w.chordNameForReadablePreference = v => v;
  w.CHROMATIC = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  w.SHARP_TO_FLAT = { 'C#':'Db','D#':'Eb','F#':'Gb','G#':'Ab','A#':'Bb', B:'Cb' };
  w.FLAT_TO_SHARP = { Db:'C#', Eb:'D#', Gb:'F#', Ab:'G#', Bb:'A#', Cb:'B' };
  w.expandChordName = v => String(v);
  w.eval('var sections = window.__b39Sections; var globalKey = "C";');
  w.eval(b0); w.eval(b1); w.eval(b2);
  const UI = w.StruChordMixer, TT = w.StruChordTracks;
  UI.boot();
  TT.load(TT.attach({ schemaVersion: 9, globalKey: 'C', sections: uiSections },
                    { schemaVersion: 9, globalKey: 'C', sections: uiSections }));

  const $ = s => d.querySelector(s);
  const $$ = s => Array.from(d.querySelectorAll(s));
  const click = n => n.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

  ok('стили вставлены', !!d.getElementById('b39MixerCss'));
  ok('кнопка микшера создана', !!d.getElementById('b39MixerBtn'));
  ok('кнопка стоит в панели транспорта', !!$('.transport-bar #b39MixerBtn'));
  ok('панель изначально скрыта', UI.panel().hidden === true);
  click(d.getElementById('b39MixerBtn'));
  ok('клик открывает панель', UI.panel().hidden === false);
  UI.render();
  ok('строка гитары отрисовалась', $$('#b39MixerRows .b39-row').length === 1);
  ok('пустое состояние скрыто (в песне есть аккорды)', d.getElementById('b39MixerEmpty').hidden === true);

  click(d.getElementById('b39MixerAdd'));
  ok('«+» открыл выбор инструмента', UI.chooser().hidden === false);
  const keysChoice = $$('#b39MixerChooser .b39-choice').find(b => b.textContent.includes('Клавиши'));
  click(keysChoice);
  ok('появилась вторая дорожка', TT.state().tracks.length === 2);
  ok('новая дорожка — клавишная', TT.track(TT.state().activeTrackId).instrument === 'keys');
  ok('строк стало две', $$('#b39MixerRows .b39-row').length === 2);
  ok('chooser закрылся', UI.chooser().hidden === true);

  const row0 = $$('#b39MixerRows .b39-row')[0];
  const row1 = $$('#b39MixerRows .b39-row')[1];
  click(row0.querySelector('.b39-select'));
  ok('клик по строке сделал её активной', TT.state().activeTrackId === Number(row0.getAttribute('data-id')));
  ok('у активной строки есть класс', UI.rows().querySelector('.b39-row.is-active') !== null);

  const rowId0 = Number(row0.getAttribute('data-id'));
  click(row0.querySelector('.b39-ms button'));
  ok('M включил мьют', TT.track(rowId0).mute === true);
  click($$('#b39MixerRows .b39-row')[0].querySelector('.b39-ms button'));
  ok('M выключил мьют', TT.track(rowId0).mute === false);

  const vol = $$('#b39MixerRows .b39-row')[0].querySelector('.b39-vol');
  vol.value = '55';
  vol.dispatchEvent(new w.Event('change', { bubbles: true }));
  ok('громкость записалась', TT.track(Number(row0.getAttribute('data-id'))).volume === 55);

  const dots = $$('#b39MixerRows .b39-row')[1].querySelector('.b39-dots');
  click(dots);
  ok('«⋯» открыл меню инструмента', UI.menu().hidden === false);
  const guitarChoice = $$('#b39MixerMenu .b39-choice').find(b => b.textContent.includes('Гитара'));
  click(guitarChoice);
  ok('инструмент дорожки сменился', TT.track(Number($$('#b39MixerRows .b39-row')[1].getAttribute('data-id'))).instrument === 'guitar');

  // перетаскивание: синтетические прямоугольники строк
  const rowsBefore = $$('#b39MixerRows .b39-row');
  rowsBefore.forEach((r, i) => { r.getBoundingClientRect = () => ({ top: i * 40, height: 40, bottom: i * 40 + 40, left: 0, right: 320, width: 320 }); });
  const mainBefore = TT.state().mainTrackId;
  const handle = rowsBefore[1].querySelector('.b39-handle');
  handle.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true, clientY: 60, button: 0 }));
  d.dispatchEvent(new w.MouseEvent('pointermove', { bubbles: true, clientY: 10 }));
  d.dispatchEvent(new w.MouseEvent('pointerup', { bubbles: true, clientY: 10 }));
  ok('перетаскивание поменяло главную', TT.state().mainTrackId !== mainBefore,
     { before: mainBefore, after: TT.state().mainTrackId });
  ok('после драга осталось две строки', $$('#b39MixerRows .b39-row').length === 2);
  ok('все правки прошли через songStore', dispatchLog.filter(l => l.startsWith('b39/')).length >= 6, dispatchLog.slice(-8));

  // пустая песня
  TT.resetToEmpty(); UI.render();
  ok('пустая песня показывает заглушку', d.getElementById('b39MixerEmpty').hidden === false);
  ok('строки скрыты', UI.rows().hidden === true);
  dom.window.close();
}

console.log(`\n${fail === 0 ? '✅ ВСЕ ТЕСТЫ ЭТАПА 2 ПРОЙДЕНЫ' : '❌ ЕСТЬ ПАДЕНИЯ'}: ${pass} ok / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
