/* Тесты этапа 1 (STAGE 1 / модель дорожек) для STRUCHORD.
   Запуск: node test_stage1.js [базовый.html] [пропатченный.html]
   Зависимостей нет — только Node.js. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const W = __dirname;
const basePath = process.argv[2] || path.join(W, '..', 'uploads', 'STRUCHORD.html');
const patchedPath = process.argv[3] || path.join(W, '..', 'patch-work', 'stage1', 'STRUCHORD.html');
const base = fs.readFileSync(basePath, 'utf8');
const patched = fs.readFileSync(patchedPath, 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}

// ---------- 1. СТРУКТУРНЫЕ ПРОВЕРКИ ПАТЧА ----------
console.log('\nСтруктура: хуки на месте, старый код не тронут');
const hooks = [
  ['attach в sanitizeSongData', 'window.StruChordTracks.attach(b39ReadySong, rawSong)'],
  ['exportForSave в serializeCurrentSong', "window.StruChordTracks.exportForSave() : {})"],
  ['load в loadSongFromObjectInner', 'window.StruChordTracks.load(song);'],
  ['маркер STAGE0', '// >>> B-39 STAGE0 BEGIN (B-102) <<<'],
  ['маркер /STAGE0', '// <<< B-39 STAGE0 END (B-102) <<<'],
  ['маркер STAGE1', '// >>> B-39 STAGE1 BEGIN (TRACKS) <<<'],
  ['маркер /STAGE1', '// <<< B-39 STAGE1 END (TRACKS) <<<'],
];
for (const [name, needle] of hooks) ok(name + ' (ровно 1)', patched.split(needle).length - 1 === 1, patched.split(needle).length - 1);
ok('getChordNotes остался на месте', patched.includes('function getChordNotes(cn, ks) {'));
ok('songStore остался на месте', patched.includes('const songStore = (function () {'));
ok('старый return sanitizeSongData убран (не продублирован)', patched.split('return normalizeReadableSongChordNames(sanitizedSong);').length - 1 === 0);
ok('новая точка return на месте', patched.split('const b39ReadySong = normalizeReadableSongChordNames(sanitizedSong);').length - 1 === 1);
ok('базовый файл без блоков', !base.includes('B-39 STAGE1 BEGIN'));

// ---------- 2. ПЕСОЧНИЦА ----------
function markerBlock(src, begin, end) {
  const i = src.indexOf(begin), j = src.indexOf(end, i);
  if (i < 0 || j < 0) throw new Error('маркер не найден: ' + begin);
  return src.slice(i, j + end.length);
}
const b0 = markerBlock(patched, '// >>> B-39 STAGE0 BEGIN (B-102) <<<', '// <<< B-39 STAGE0 END (B-102) <<<');
const b1 = markerBlock(patched, '// >>> B-39 STAGE1 BEGIN (TRACKS) <<<', '// <<< B-39 STAGE1 END (TRACKS) <<<');

const dispatchLog = [];
const sandbox = {
  console, Math, JSON, Set, Map, Object, Array, String, Number, Boolean, Date,
  parseInt, parseFloat, isNaN, Infinity, NaN, undefined,
  __b39Sections: [],
  songStore: {
    dispatch(label, mutator) { dispatchLog.push(label); return mutator(); },
    subscribe() { return () => {}; },
    log() { return []; }
  },
  // минимальные помощники написания (в приложении они настоящие)
  normalizeAccidentals: (v) => String(v).replace(/♭/g, 'b').replace(/♯/g, '#'),
  normalizeChordCase: (v) => String(v),
  getKeyStyle: (k) => (/b/i.test(String(k)) ? 'flat' : 'sharp'),
  chordNameForReadablePreference: (v) => v,
  CHROMATIC: ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'],
  SHARP_TO_FLAT: { 'C#':'Db','D#':'Eb','F#':'Gb','G#':'Ab','A#':'Bb', B:'Cb' },
  FLAT_TO_SHARP: { Db:'C#', Eb:'D#', Gb:'F#', Ab:'G#', Bb:'A#', Cb:'B' },
  expandChordName: (v) => String(v),
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext('var sections = []; var globalKey = "C";\n' + b0 + '\n' + b1, sandbox,
  { filename: 'b39-stage0+1.js' });
const T = sandbox.StruChordTracks;
const F = sandbox.StruChordFormula;

console.log('\nМодуль загрузился');
ok('window.StruChordTracks существует', !!T && typeof T.attach === 'function');
ok('STAGE0 тоже на месте', !!F && typeof F.chordFormula === 'function');
ok('6 размеров клавиатуры', T.sizes().join(',') === '25,37,49,61,76,88');

// ---------- 3. ТЕСТОВАЯ ПЕСНЯ ----------
function makeSong(withTracks) {
  const s = {
    schemaVersion: 9, globalKey: 'C', keyMode: 'manual', bpm: 120,
    metadata: { artist: 'Тест', title: 'Песня' },
    sections: [
      { id: 1, type: 'Verse', squares: [
        { id: 10, events: [{ chord: 'Am', span: 1 }, { chord: 'F', span: 1 }] },
        { id: 11, events: [{ chord: 'C', span: 1 }, { chord: 'G', span: 1 }] }
      ] },
      { id: 2, type: 'Chorus', squares: [
        { id: 20, events: [{ chord: 'F', span: 1 }, { chord: 'G', span: 1 }] }
      ] }
    ],
    parts: [], rhythmPool: null
  };
  if (withTracks) {
    s.tracks = withTracks;
    s.activeTrackId = 2;
    s.keyboardSize = 88;
  }
  return s;
}
function setSections(song) {
  const clone = JSON.parse(JSON.stringify(song.sections));
  sandbox.sections = clone;                 // глобальная модель приложения
  sandbox.__b39Sections = clone;
  return clone;
}

// ---------- 4. МИГРАЦИЯ СТАРОЙ ПЕСНИ ----------
console.log('\nМиграция: старый файл без tracks');
const legacy = makeSong(false);
const secs = setSections(legacy);
const beforeKeys = Object.keys(legacy).join(',');
const attached = T.attach(JSON.parse(JSON.stringify(legacy)), legacy);
ok('attach вернул ВСЮ песню, а не только новые поля', attached.sections === legacy.sections || Array.isArray(attached.sections));
ok('attach сохранил metadata/bpm/globalKey', attached.bpm === 120 && attached.globalKey === 'C' && attached.metadata.title === 'Песня');
ok('attach не испортил исходный объект', Object.keys(legacy).join(',') === beforeKeys && !legacy.tracks);
ok('появилась одна гитарная дорожка', attached.tracks.length === 1 && attached.tracks[0].instrument === 'guitar');
ok('главная дорожка НЕ хранит аккорды в карте', Object.keys(attached.tracks[0].chords).length === 0);
ok('keyboardSize по умолчанию 61', attached.keyboardSize === 61);
const st1 = T.load(attached);
ok('после load состояние дефолтное', T.isDefault() === true, st1);
ok('exportForSave() вернул {} — файл не изменится', JSON.stringify(T.exportForSave()) === '{}', T.exportForSave());
ok('аккорды ячеек не тронуты', secs[0].squares[0].events[0].chord === 'Am');

// ---------- 5. НОВЫЙ ФОРМАТ: КРУГОСВЕТКА ----------
console.log('\nНовый формат: сохранить → загрузить → то же состояние');
const twoTracks = [
  { id: 1, instrument: 'guitar', name: 'Гитара', volume: 100, mute: false, solo: false,
    chords: {}, voicings: {}, patterns: {}, keyboardSize: null },
  { id: 2, instrument: 'keys', name: 'Клавиши', volume: 80, mute: false, solo: true,
    chords: { '1:10:0': 'Am7', '1:10:1': 'Fmaj7', '2:20:0': 'C' },
    voicings: { '1:10:0': 2 }, patterns: {}, keyboardSize: 49 }
];
const song2 = makeSong(twoTracks);
setSections(song2);
const a2 = T.attach(JSON.parse(JSON.stringify(song2)), song2);
T.load(a2);
const saved = T.exportForSave();
ok('в сейв попали tracks/activeTrackId/keyboardSize', !!saved.tracks && saved.activeTrackId === 2 && saved.keyboardSize === 88, Object.keys(saved));
ok('сохранено 2 дорожки', saved.tracks.length === 2);
ok('сохранён явный аккорд Am7', saved.tracks[1].chords['1:10:0'] === 'Am7', saved.tracks[1].chords);
const roundTrip = Object.assign({}, song2, saved);
const a3 = T.attach(roundTrip, roundTrip);
T.load(a3);
const saved2 = T.exportForSave();
ok('сохранение–загрузка стабильны', JSON.stringify(saved2) === JSON.stringify(saved), { a: saved, b: saved2 });
ok('состояние не дефолтное', T.isDefault() === false);

// ---------- 6. САНИТАЙЗИНГ: МУСОР ОТБРАСЫВАЕТСЯ ----------
console.log('\nСанитайзинг: битые значения отбрасываются, а не выдумываются');
const dirty = [
  { id: 1, instrument: 'drums', name: '', volume: 999, mute: 'yes', solo: 1,
    chords: { '1:10:0': 'НЕАККОРД', '999:999:9': 'C', '1:10:1': 42 }, keyboardSize: 999 },
  { id: 1, instrument: 'keys', name: 'Клавиши', volume: -20,
    chords: { '1:10:0': 'Cm7♭5' }, keyboardSize: 88 }
];
const song3 = makeSong(dirty);
const secs3 = setSections(song3);
const a4 = T.attach(JSON.parse(JSON.stringify(song3)), song3);
ok('неизвестный инструмент -> guitar', a4.tracks[0].instrument === 'guitar', a4.tracks[0].instrument);
ok('пустое имя заменено дефолтным', a4.tracks[0].name === 'Гитара');
ok('громкость 999 -> 100 (край шкалы)', a4.tracks[0].volume === 100);
ok('громкость -20 -> 0', a4.tracks[1].volume === 0, a4.tracks[1].volume);
ok('mute "yes" -> false', a4.tracks[0].mute === false);
ok('дублирующийся id переопределён', a4.tracks[0].id !== a4.tracks[1].id, a4.tracks.map(t=>t.id));
ok('битый аккорд отброшен', !a4.tracks[0].chords['1:10:0'], a4.tracks[0].chords);
ok('осиротевший ключ отброшен', !a4.tracks[0].chords['999:999:9']);
ok('число вместо аккорда отброшено', !a4.tracks[0].chords['1:10:1']);
ok('недопустимый размер клавиатуры -> null', a4.tracks[0].keyboardSize === null);
ok('допустимый размер 88 сохранён', a4.tracks[1].keyboardSize === 88);
ok('♭ в аккорде приведено к b', a4.tracks[1].chords['1:10:0'] === 'Cm7b5', a4.tracks[1].chords['1:10:0']);

// ---------- 7. КЛАВИАТУРЫ ----------
console.log('\nРазмеры клавиатуры и диапазоны');
T.load(T.attach(JSON.parse(JSON.stringify(legacy)), legacy));
ok('по умолчанию 61 -> C2..C7', T.keyRange().first === 'C2' && T.keyRange().last === 'C7', T.keyRange());
T.setKeyboardSize(88);
ok('88 -> A0..C8, MIDI 21..108', T.keyRange().size === 88 && T.keyRange().low === 21 && T.keyRange().high === 108, T.keyRange());
T.setKeyboardSize(25);
ok('25 -> C3..C5, MIDI 48..72', T.keyRange().size === 25 && T.keyRange().low === 48, T.keyRange());
ok('недопустимый размер 60 отклонён', T.setKeyboardSize(60) === false);
const ranges = T.ranges();
ok('таблица содержит все 6 размеров', Object.keys(ranges).length === 6);

// ---------- 8. ДОРОЖКИ: ДОБАВЛЕНИЕ, АККОРДЫ, ПРИЗРАК ----------
console.log('\nДорожки: «+», свои аккорды, призрачная подсказка');
T.load(T.attach(JSON.parse(JSON.stringify(legacy)), legacy));
const secs4 = sandbox.sections;
const gid = T.mainTrack().id;
const kid = T.addTrack('keys');
ok('«+» создал вторую дорожку', T.state().tracks.length === 2 && kid !== gid);
ok('новая дорожка стала активной', T.state().activeTrackId === kid);
ok('инструмент новой дорожки keys', T.track(kid).instrument === 'keys');
const allKeys = [];
T.eachCell((sec, sq, ev, ei, key) => allKeys.push(key));
ok('все 6 ячеек скопированы в новую дорожку', Object.keys(T.track(kid).chords).length === allKeys.length, { copied: Object.keys(T.track(kid).chords).length, cells: allKeys.length });
ok('главная не изменила свои аккорды', secs4[0].squares[0].events[0].chord === 'Am');
ok('аккорд неглавой дорожки читается', T.trackChord(kid, '1:10:0') === 'Am');
ok('главная читается из ev.chord', T.trackChord(gid, '1:10:0') === 'Am');
T.setTrackChord(kid, '1:10:0', 'Am7');
ok('правка неглавой не тронула главную', secs4[0].squares[0].events[0].chord === 'Am' && T.trackChord(kid, '1:10:0') === 'Am7');
T.setTrackChord(kid, '1:10:0', '');
ok('пустая ячейка -> null (звука нет)', T.trackChord(kid, '1:10:0') === null);
ok('но призрачная подсказка видна', T.ghostChord('1:10:0') === 'Am');
ok('правка главной пишет прямо в ev.chord', (T.setTrackChord(gid, '1:10:0', 'C'), secs4[0].squares[0].events[0].chord === 'C'));
ok('и призрачная подсказка обновилась', T.ghostChord('1:10:0') === 'C');
ok('все мутации прошли через songStore.dispatch', dispatchLog.filter(l => l.startsWith('b39/')).length >= 5, dispatchLog.slice(-6));

// ---------- 9. ПЕРЕТАСКИВАНИЕ И ГЛАВНАЯ ----------
console.log('\nПеретаскивание: смена главной дорожки');
setSections(legacy);
T.load(T.attach(JSON.parse(JSON.stringify(legacy)), legacy));
const secs5 = sandbox.sections;
const mainId = T.mainTrack().id;
const keysId = T.addTrack('keys');
T.setTrackChord(keysId, '1:10:0', 'Dm9');
T.setTrackChord(keysId, '1:10:1', 'Bbmaj7');
T.setTrackChord(keysId, '1:11:0', 'F');
T.setTrackChord(keysId, '1:11:1', 'C');
T.setTrackChord(keysId, '2:20:0', 'Gm');
T.setTrackChord(keysId, '2:20:1', 'A7');
const okReorder = T.reorderTracks(1, 0);
ok('перетаскивание выполнено', okReorder === true);
ok('главной стала клавишная', T.mainTrack().instrument === 'keys', T.mainTrack());
ok('аккорды песни переехали из клавишной', secs5[0].squares[0].events[0].chord === 'Dm9', secs5[0].squares[0].events[0].chord);
ok('прежняя главная забрала свои аккорды', T.track(mainId).chords['1:10:0'] === 'Am', T.track(mainId).chords);
ok('новая главная очистила свою карту', Object.keys(T.mainTrack().chords).length === 0);
ok('недопустимый индекс отклонён', T.reorderTracks(0, 99) === false);
ok('удалить главную нельзя', T.removeTrack(T.mainTrack().id) === false);
ok('удалить неглавную можно', T.removeTrack(mainId) === true && T.state().tracks.length === 1);
ok('после удаления active валиден', T.state().activeTrackId === T.mainTrack().id);

// ---------- 10. РЕГРЕССИЯ STAGE 0 ----------
console.log('\nSTAGE 0 не пострадал');
ok('C13 по-прежнему 7 тонов', F.chordFormula('C13', 'C').intervals.length === 7);
ok('C11 по-прежнему с терцией', F.chordFormula('C11', 'C').intervals.includes(4));

console.log(`\n${fail === 0 ? '✅ ВСЕ ТЕСТЫ ЭТАПА 1 ПРОЙДЕНЫ' : '❌ ЕСТЬ ПАДЕНИЯ'}: ${pass} ok / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
