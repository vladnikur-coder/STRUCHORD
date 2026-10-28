// >>> B-39 STAGE1 BEGIN (TRACKS) <<<
// ==========================================================================
// B-39 · ЭТАП 1 (STAGE 1) — МОДЕЛЬ ДОРОЖЕК, МИГРАЦИЯ, STORE, .struchord
// --------------------------------------------------------------------------
// Что здесь. Лёгкий слой дорожек поверх СУЩЕСТВУЮЩЕЙ сетки песни.
// Секции/квадраты/ячейки не дублируются: дорожка хранит только РАЗЛИЧИЯ
// (свои аккорды, варианты позиций, рисунки аккомпанимента, настройки
// микшера). Главная дорожка — первая в массиве; её аккорды продолжают жить
// в привычном ev.chord, поэтому весь старый код (круг, гармония, лента,
// подбор аппликатур, звук гитары) работает без изменений.
//
// Почему так. В 0.691 модель песни — это глобальные переменные (sections,
// globalKey, ...), а не объект song. Переписывать их на объект нельзя:
// 125+ мест чтения. Поэтому состояние дорожек живёт в этом модуле, а в
// файл песни пишется тремя необязательными полями (tracks, activeTrackId,
// keyboardSize). Пока состояние «одна гитарная дорожка по умолчанию»,
// exportForSave() возвращает {} — старая песня сохраняется БАЙТ-В-БАЙТ
// как раньше (обязательное условие миграции из плана).
//
// Правила: битые значения ОТБРАСЫВАЮТСЯ, а не зажимаются (README, урок 4).
// Все мутации идут через songStore.dispatch -> история + рендер бесплатны.
// ==========================================================================
(function (HOST) {
  'use strict';

  var B39_INSTRUMENTS = Object.freeze(['guitar', 'keys']);
  var B39_KEYBOARD_SIZES = Object.freeze([25, 37, 49, 61, 76, 88]);
  var B39_KEY_RANGES = Object.freeze({
    25: { low: 48, high: 72, first: 'C3', last: 'C5' },
    37: { low: 36, high: 72, first: 'C2', last: 'C5' },
    49: { low: 36, high: 84, first: 'C2', last: 'C6' },
    61: { low: 36, high: 96, first: 'C2', last: 'C7' },
    76: { low: 28, high: 103, first: 'E1', last: 'G7' },
    88: { low: 21, high: 108, first: 'A0', last: 'C8' }
  });
  var B39_DEFAULT_KEYBOARD = 61;
  var B39_LIMITS = Object.freeze({
    MAX_TRACKS: 16,
    MAX_CELL_ENTRIES: 4096,
    MAX_NAME: 60,
    MAX_CHORD: 200,
    MAX_PATTERN_CHARS: 4096
  });

  function b39IsObj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
  function b39Clone(x) { try { return JSON.parse(JSON.stringify(x)); } catch (e) { return null; } }
  function b39MakeTrack(id, instrument, name) {
    return {
      id: id, instrument: instrument, name: name,
      volume: 100, mute: false, solo: false,
      chords: {}, voicings: {}, patterns: {},
      keyboardSize: null
    };
  }
  function b39DefaultName(inst, n) {
    var base = inst === 'keys' ? 'Клавиши' : 'Гитара';
    return n > 1 ? base + ' ' + n : base;
  }
  function b39DefaultState() {
    return {
      tracks: [b39MakeTrack(1, 'guitar', 'Гитара')],
      activeTrackId: 1,
      keyboardSize: B39_DEFAULT_KEYBOARD,
      nextTrackId: 2
    };
  }
  var state = b39DefaultState();

  // ---------- Сетка ячеек ----------
  // Ключ структурный: не зависит от аккорда и от номера прохода повтора.
  function cellKey(sec, sq, ei) { return String(sec.id) + ':' + String(sq.id) + ':' + String(ei); }

  // Глобальные sections появляются позже по файлу; в тестах их можно
  // подсунуть через window.__b39Sections.
  function runtimeSections() {
    try { if (Array.isArray(sections)) return sections; } catch (e) { /* TDZ / нет глобала */ }
    return Array.isArray(HOST.__b39Sections) ? HOST.__b39Sections : [];
  }
  function eachCell(secs, cb) {
    var list = Array.isArray(secs) ? secs : runtimeSections();
    for (var a = 0; a < list.length; a++) {
      var sec = list[a]; if (!sec || !Array.isArray(sec.squares)) continue;
      for (var b = 0; b < sec.squares.length; b++) {
        var sq = sec.squares[b]; if (!sq || !Array.isArray(sq.events)) continue;
        for (var i = 0; i < sq.events.length; i++) {
          cb(sec, sq, sq.events[i], i, cellKey(sec, sq, i));
        }
      }
    }
  }
  function validKeysFrom(song) {
    var out = new Set();
    eachCell(song && Array.isArray(song.sections) ? song.sections : null,
      function (sec, sq, ev, ei, key) { out.add(key); });
    return out;
  }
  function findEvent(key, secs) {
    var found = null;
    eachCell(secs, function (sec, sq, ev, ei, k) { if (k === key) found = { sec: sec, sq: sq, ev: ev, ei: ei, key: k }; });
    return found;
  }

  // ---------- Санитайзинг ----------
  // Написание аккорда в дорожке обязано совпадать с написанием в ячейках:
  // те же normalizeAccidentals / normalizeChordCase / читаемое имя (R12).
  function normalizeChordValue(value, song) {
    if (typeof value !== 'string') return null;
    var v = value.trim().slice(0, B39_LIMITS.MAX_CHORD);
    if (!v) return null;
    try { if (typeof normalizeAccidentals === 'function') v = normalizeAccidentals(v); } catch (e) {}
    try { if (typeof normalizeChordCase === 'function') v = normalizeChordCase(v); } catch (e) {}
    if (!/^[A-G][#b]?/.test(v)) return null;
    var key = (song && song.globalKey) || 'C';
    try {
      if (typeof chordNameForReadablePreference === 'function' && typeof getKeyStyle === 'function') {
        v = chordNameForReadablePreference(v, getKeyStyle(key), key);
      }
    } catch (e) {}
    return v;
  }
  function sanitizeMap(raw, validKeys, validator, allowChordKeys, allowSectionKeys) {
    var out = {};
    if (!b39IsObj(raw)) return out;
    var keys = Object.keys(raw), n = 0;
    for (var i = 0; i < keys.length && n < B39_LIMITS.MAX_CELL_ENTRIES; i++) {
      var k = keys[i];
      var cellKey = /^\d+:\d+:\d+$/.test(k);
      var chordKey = !!allowChordKeys && /^v:.{1,80}$/.test(k);
      // STAGE 5: 's:<id секции>' — рисунок аккомпанимента по умолчанию
      // для всей секции. Приоритет при чтении: ячейка -> секция -> пресет.
      var sectionKey = !!allowSectionKeys && /^s:\d{1,9}$/.test(k);
      if (!cellKey && !chordKey && !sectionKey) continue; // битый ключ — целиком
      if (cellKey && validKeys && !validKeys.has(k)) continue; // осиротевший — целиком
      var v = validator(raw[k]);
      if (v === null || v === undefined) continue;
      out[k] = v; n++;
    }
    return out;
  }
  function patternValue(raw) {
    if (!b39IsObj(raw)) return null;
    var text;
    try { text = JSON.stringify(raw); } catch (e) { return null; }
    if (typeof text !== 'string' || text.length > B39_LIMITS.MAX_PATTERN_CHARS) return null;
    return b39Clone(raw);
  }
  function sanitizeTracks(rawTracks, validKeys, song) {
    // Поля нет вообще -> старый файл: одна гитарная дорожка (миграция).
    // Явный пустой массив -> НОВАЯ песня без дорожек (решение владельца):
    // пустая сетка и кнопка «+ Добавить дорожку».
    if (!Array.isArray(rawTracks)) return [b39MakeTrack(1, 'guitar', 'Гитара')];
    if (!rawTracks.length) return [];
    var out = [], used = new Set();
    rawTracks.slice(0, B39_LIMITS.MAX_TRACKS).forEach(function (raw, idx) {
      if (!b39IsObj(raw)) return;
      var id = Number(raw.id);
      if (!Number.isInteger(id) || id < 1 || used.has(id)) id = idx + 1;
      while (used.has(id)) id++;
      used.add(id);
      var inst = B39_INSTRUMENTS.indexOf(raw.instrument) >= 0 ? raw.instrument : 'guitar';
      var vol = Number(raw.volume);
      var name = typeof raw.name === 'string' && raw.name.trim()
        ? raw.name.trim().slice(0, B39_LIMITS.MAX_NAME)
        : b39DefaultName(inst, out.length + 1);
      var sizeNum = Number(raw.keyboardSize);
      var size = raw.keyboardSize === null || raw.keyboardSize === undefined || !B39_KEYBOARD_SIZES.includes(sizeNum)
        ? null : sizeNum;
      out.push({
        id: id, instrument: inst, name: name,
        volume: Number.isFinite(vol) ? Math.max(0, Math.min(100, Math.round(vol))) : 100,
        mute: raw.mute === true, solo: raw.solo === true,
        chords: sanitizeMap(raw.chords, validKeys, function (v) { return normalizeChordValue(v, song); }),
        voicings: sanitizeMap(raw.voicings, validKeys, function (v) {
          var n = Number(v); return Number.isInteger(n) && n >= 0 && n <= 99 ? n : null;
        }, true),
        patterns: sanitizeMap(raw.patterns, validKeys, patternValue, false, true),
        keyboardSize: size
      });
    });
    return out;
  }

  // ---------- attach: вызывается из sanitizeSongData ----------
  // Старый файл (без tracks) -> одна гитарная дорожка, поля НЕ пишутся в
  // файл при сохранении (exportForSave вернёт {}).
  // Внутренняя подготовка: только новые поля.
  function prepare(song, rawSong) {
    if (!b39IsObj(song)) song = {};
    var raw = b39IsObj(rawSong) ? rawSong : song;
    var validKeys = validKeysFrom(song);
    var tracks = sanitizeTracks(raw.tracks, validKeys, song);
    var active = Number(raw.activeTrackId);
    if (!tracks.length) active = 0;
    else if (!tracks.some(function (t) { return t.id === active; })) active = tracks[0].id;
    var ks = Number(raw.keyboardSize);
    var keyboardSize = B39_KEYBOARD_SIZES.includes(ks) ? ks : B39_DEFAULT_KEYBOARD;
    return {
      tracks: b39Clone(tracks),
      activeTrackId: active,
      keyboardSize: keyboardSize,
      nextTrackId: Math.max.apply(null, tracks.map(function (t) { return t.id; }).concat([0])) + 1
    };
  }
  // Точка вставки в sanitizeSongData: ВОЗВРАЩАЕТ ВСЮ песню целиком.
  // Старый файл (без tracks) -> одна гитарная дорожка, поля НЕ пишутся в
  // файл при сохранении (exportForSave вернёт {}).
  function attach(song, rawSong) {
    var p = prepare(song, rawSong);
    var out = Object.assign({}, b39IsObj(song) ? song : {});
    out.tracks = p.tracks;
    out.activeTrackId = p.activeTrackId;
    out.keyboardSize = p.keyboardSize;
    return out;
  }

  // ---------- load / export ----------
  function adopt(song) {
    var p = prepare(song || {}, song || {});
    state = {
      tracks: p.tracks,
      activeTrackId: p.activeTrackId,
      keyboardSize: p.keyboardSize,
      nextTrackId: p.nextTrackId
    };
    repairMain();
    return snapshot();
  }
  function isDefaultState() {
    if (!state.tracks.length) return false;              // новая песня без дорожек
    if (state.tracks.length !== 1 || state.activeTrackId !== state.tracks[0].id) return false;
    if (state.keyboardSize !== B39_DEFAULT_KEYBOARD) return false;
    var t = state.tracks[0];
    if (t.instrument !== 'guitar' || t.name !== 'Гитара' || t.volume !== 100 ||
        t.mute || t.solo || t.keyboardSize !== null) return false;
    return !Object.keys(t.chords).length && !Object.keys(t.voicings).length && !Object.keys(t.patterns).length;
  }
  function exportForSave() {
    // Пустое состояние пишем ЯВНО: иначе при загрузке оно превратилось бы
    // в «старый файл» и молча обзавелось бы гитарной дорожкой.
    if (!state.tracks.length) return { tracks: [], activeTrackId: 0, keyboardSize: state.keyboardSize };
    return isDefaultState() ? {} : {
      tracks: b39Clone(state.tracks),
      activeTrackId: state.activeTrackId,
      keyboardSize: state.keyboardSize
    };
  }
  function snapshot() {
    return {
      tracks: b39Clone(state.tracks),
      activeTrackId: state.activeTrackId,
      keyboardSize: state.keyboardSize,
      mainTrackId: state.tracks.length ? state.tracks[0].id : null,
      isEmpty: state.tracks.length === 0,
      isDefault: isDefaultState()
    };
  }

  // ---------- Зеркала (главная дорожка <-> ev.chord) ----------
  // Главная дорожка НЕ хранит аккорды в своей карте: они живут в ev.chord.
  // Если после перестановки главной стала другая дорожка, её явные аккорды
  // переезжают в ev.chord, а прежняя главная получает их копию в свою карту.
  function repairMain() {
    if (!state.tracks.length) return;
    var main = state.tracks[0];
    var keys = Object.keys(main.chords);
    if (!keys.length) return;                      // нечего переносить
    keys.forEach(function (k) {
      var f = findEvent(k, null);
      if (f) f.ev.chord = main.chords[k] || '';
    });
    main.chords = {};
  }
  function normaliseState() {
    if (!state.tracks.length) { state.activeTrackId = 0; return; }
    if (!state.tracks.some(function (t) { return t.id === state.activeTrackId; })) {
      state.activeTrackId = state.tracks[0].id;
    }
    if (!B39_KEYBOARD_SIZES.includes(state.keyboardSize)) state.keyboardSize = B39_DEFAULT_KEYBOARD;
    if (!Number.isInteger(state.nextTrackId)) state.nextTrackId = 2;
  }
  function afterMutation() { normaliseState(); }

  function dispatch(label, mutator) {
    var run = function () { var r = mutator(); afterMutation(); return r; };
    var store = HOST.songStore;
    if (store && typeof store.dispatch === 'function') return store.dispatch(label, run);
    return run();                                  // тесты без Store
  }

  // ---------- Чтение ----------
  function findTrack(id) {
    for (var i = 0; i < state.tracks.length; i++) if (state.tracks[i].id === id) return state.tracks[i];
    return null;
  }
  function mainTrack() { return state.tracks[0] || null; }
  function isMain(id) { return !!mainTrack() && mainTrack().id === id; }
  function trackChord(id, key, ev) {
    var t = findTrack(id);
    if (!t) return null;
    if (isMain(id)) {
      var e = ev || (findEvent(key, null) || {}).ev;
      return e && e.chord ? e.chord : null;
    }
    return t.chords[key] || null;                  // пусто = призрачный аккорд, без звука
  }
  function ghostChord(key) {
    // Подсказка глазами: аккорд главной дорожки. НЕ звучит и НЕ анализируется.
    var m = mainTrack();
    return m ? trackChord(m.id, key) : null;
  }
  function keyRange(trackId) {
    var t = trackId === undefined || trackId === null ? findTrack(state.activeTrackId) : findTrack(trackId);
    var size = (t && t.keyboardSize) || state.keyboardSize;
    if (!B39_KEY_RANGES[size]) size = B39_DEFAULT_KEYBOARD;
    var r = B39_KEY_RANGES[size];
    return { size: size, low: r.low, high: r.high, first: r.first, last: r.last };
  }

  // ---------- Мутации (все через Store) ----------
  function setActive(id) {
    if (!findTrack(id)) return false;
    return dispatch('b39/track-active', function () { state.activeTrackId = id; return true; });
  }
  function setInstrument(id, inst) {
    var t = findTrack(id);
    if (!t || B39_INSTRUMENTS.indexOf(inst) < 0) return false;
    return dispatch('b39/track-instrument', function () {
      t.instrument = inst;
      // Имя меняем только если оно было дефолтным: свой текст не трогаем.
      if (/^(Гитара|Клавиши)( \d+)?$/.test(t.name)) t.name = b39DefaultName(inst, state.tracks.indexOf(t) + 1);
      return true;
    });
  }
  function setTrackField(id, field, value, label) {
    var t = findTrack(id);
    if (!t) return false;
    return dispatch(label, function () { t[field] = value; return true; });
  }
  function setVolume(id, v) {
    var n = Number(v);
    if (!Number.isFinite(n)) return false;
    return setTrackField(id, 'volume', Math.max(0, Math.min(100, Math.round(n))), 'b39/track-volume');
  }
  function setMute(id, on) { return setTrackField(id, 'mute', on === true, 'b39/track-mute'); }
  function setSolo(id, on) { return setTrackField(id, 'solo', on === true, 'b39/track-solo'); }
  function setKeyboardSize(size) {
    var n = Number(size);
    if (!B39_KEYBOARD_SIZES.includes(n)) return false;
    return dispatch('b39/keyboard-size', function () { state.keyboardSize = n; return true; });
  }
  function setTrackKeyboardSize(id, size) {
    var n = Number(size);
    if (size !== null && !B39_KEYBOARD_SIZES.includes(n)) return false;
    return setTrackField(id, 'keyboardSize', size === null ? null : n, 'b39/track-keyboard-size');
  }
  function setTrackChord(id, key, chord) {
    var t = findTrack(id);
    if (!t || !/^\d+:\d+:\d+$/.test(String(key))) return false;
    var cleaned = chord === null || chord === '' ? null : normalizeChordValue(String(chord), { globalKey: currentKey() });
    return dispatch('b39/track-chord', function () {
      if (isMain(id)) {
        var f = findEvent(key, null);
        if (!f) return false;
        f.ev.chord = cleaned || '';                // главная = существующее поле ячейки
      } else if (cleaned) {
        t.chords[key] = cleaned;                   // явный аккорд дорожки
      } else {
        delete t.chords[key];                       // пусто -> призрачная подсказка
      }
      return true;
    });
  }
  function setVoicing(id, key, index) {
    var t = findTrack(id), n = Number(index);
    if (!t || !Number.isInteger(n) || n < 0 || n > 99) return false;
    return dispatch('b39/track-voicing', function () { t.voicings[key] = n; return true; });
  }
  function setPattern(id, key, pattern) {
    var t = findTrack(id), v = patternValue(pattern);
    if (!t || !v) return false;
    // Ключ либо ячейка '1:2:0', либо секция 's:1' (STAGE 5).
    if (!/^(\d+:\d+:\d+|s:\d{1,9})$/.test(String(key))) return false;
    return dispatch('b39/track-pattern', function () { t.patterns[key] = v; return true; });
  }
  function patternFor(id, key) {
    var t = findTrack(id);
    if (!t || !t.patterns) return null;
    var v = t.patterns[String(key)];
    return v ? b39Clone(v) : null;
  }
  function clearPattern(id, key) {
    var t = findTrack(id);
    if (!t || !t.patterns || !(String(key) in t.patterns)) return false;
    return dispatch('b39/track-pattern-clear', function () { delete t.patterns[String(key)]; return true; });
  }
  function currentKey() {
    try { return (typeof globalKey !== 'undefined' && globalKey) || 'C'; } catch (e) { return 'C'; }
  }

  function addTrack(instrument, copyFromActive) {
    var inst = B39_INSTRUMENTS.indexOf(instrument) >= 0 ? instrument : 'keys';
    var src = copyFromActive === false ? mainTrack() : (findTrack(state.activeTrackId) || mainTrack());
    var copied = [];
    if (src) {
      eachCell(null, function (sec, sq, ev, ei, key) {
        var c = trackChord(src.id, key, ev);
        if (c) copied.push([key, c]);
      });
    }
    var id = state.nextTrackId;
    dispatch('b39/track-add', function () {
      state.nextTrackId++;
      var count = state.tracks.filter(function (t) { return t.instrument === inst; }).length;
      var t = b39MakeTrack(id, inst, b39DefaultName(inst, count + 1));
      copied.forEach(function (pair) { t.chords[pair[0]] = pair[1]; });
      state.tracks.push(t);
      state.activeTrackId = id;
      return true;
    });
    return id;
  }
  function removeTrack(id) {
    if (state.tracks.length <= 1) return false;
    var idx = -1;
    for (var i = 0; i < state.tracks.length; i++) if (state.tracks[i].id === id) idx = i;
    if (idx < 0) return false;
    // Главную не удаляем: сначала надо сделать главной другую дорожку
    // перетаскиванием — иначе сетка песни потеряет свои аккорды.
    if (idx === 0) return false;
    return dispatch('b39/track-remove', function () {
      state.tracks.splice(idx, 1);
      if (state.activeTrackId === id) state.activeTrackId = state.tracks[0].id;
      return true;
    });
  }
  function reorderTracks(from, to) {
    var n = state.tracks.length;
    if (n < 2) return false;
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= n || to >= n || from === to) return false;
    var oldMainId = state.tracks[0].id;
    // Снимок аккордов прежней главной ДО перестановки: они живут в ev.chord.
    var oldMainChords = [];
    eachCell(null, function (sec, sq, ev, ei, key) { if (ev.chord) oldMainChords.push([key, ev.chord]); });
    var arr = state.tracks.slice();
    var moved = arr.splice(from, 1)[0];
    arr.splice(to, 0, moved);
    var newMain = arr[0];
    var becomesMain = newMain.id !== oldMainId;
    return dispatch('b39/track-reorder', function () {
      state.tracks = arr;
      if (!becomesMain) return true;
      // 1. Прежняя главная уходит в неглавые — забирает свои аккорды с собой.
      var oldMain = null;
      for (var i = 0; i < arr.length; i++) if (arr[i].id === oldMainId) oldMain = arr[i];
      if (oldMain) {
        oldMain.chords = {};
        oldMainChords.forEach(function (pair) { oldMain.chords[pair[0]] = pair[1]; });
      }
      // 2. Новая главная: её явные аккорды становятся аккордами песни.
      var newChords = Object.assign({}, newMain.chords);
      eachCell(null, function (sec, sq, ev, ei, key) { ev.chord = newChords[key] || ''; });
      newMain.chords = {};
      return true;
    });
  }

  // Вариант позиции, выбранный для аккорда дорожки (ключ 'v:<имя>').
  function voicingForChord(id, chord) {
    var t = findTrack(id);
    if (!t || typeof chord !== 'string' || !chord) return null;
    var v = t.voicings['v:' + chord];
    return Number.isInteger(v) ? v : null;
  }
  function setVoicingForChord(id, chord, index) {
    var t = findTrack(id), n = Number(index);
    if (!t || typeof chord !== 'string' || !chord || !Number.isInteger(n) || n < 0 || n > 99) return false;
    return dispatch('b39/track-voicing-chord', function () {
      t.voicings['v:' + chord] = n;
      return true;
    });
  }

  // Новая песня: явное пустое состояние (вызывается из clearAll).
  function resetToEmpty() {
    return dispatch('b39/tracks-reset-empty', function () {
      state.tracks = [];
      state.activeTrackId = 0;
      return true;
    });
  }

  var api = Object.freeze({
    // точки вставки в существующий код
    attach: attach, load: adopt, exportForSave: exportForSave,
    // чтение
    state: snapshot, mainTrack: function () { return mainTrack() ? b39Clone(mainTrack()) : null; },
    track: function (id) { var t = findTrack(id); return t ? b39Clone(t) : null; },
    trackChord: trackChord, ghostChord: ghostChord, isDefault: isDefaultState,
    keyRange: keyRange, sizes: function () { return B39_KEYBOARD_SIZES.slice(); },
    ranges: function () { return b39Clone(B39_KEY_RANGES); },
    cellKey: cellKey, eachCell: function (cb) { eachCell(null, cb); },
    // мутации
    setActive: setActive, setInstrument: setInstrument, setVolume: setVolume,
    setMute: setMute, setSolo: setSolo,
    setKeyboardSize: setKeyboardSize, setTrackKeyboardSize: setTrackKeyboardSize,
    setTrackChord: setTrackChord, setVoicing: setVoicing, setPattern: setPattern,
    patternFor: patternFor, clearPattern: clearPattern,
    voicingForChord: voicingForChord, setVoicingForChord: setVoicingForChord,
    addTrack: addTrack, removeTrack: removeTrack, reorderTracks: reorderTracks,
    resetToEmpty: resetToEmpty,
    // константы для UI следующих этапов
    INSTRUMENTS: B39_INSTRUMENTS, DEFAULT_KEYBOARD: B39_DEFAULT_KEYBOARD, LIMITS: B39_LIMITS
  });

  HOST.StruChordTracks = api;
})(typeof window !== 'undefined' ? window : globalThis);
// <<< B-39 STAGE1 END (TRACKS) <<<
