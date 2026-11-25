#!/usr/bin/env python3
"""
Патч B-39 «Укулеле» (Этап 1) — версия 0.866 (struchord-v866).

Реализует:
  1. Полноценный тип дорожки `ukulele` в B-39 (модель, микшер, выбор при
     первом запуске / в настройках, copy_full, clean_on_switch, санитайзер).
  2. Четыре фиксированных строя укулеле (High G, Low G, Баритон, Canadian)
     с единой таблицей MIDI, единой пилюлей строя #tuningPill и 4-струнным тюнером.
  3. 4-струнный движок аппликатур (0–15 ладов, все 4 строя, анатомический
     расчёт пальцев и баррэ, распознавание аккордов с учётом re-entrant баса),
     4-струнный SVG и 4-струнный редактор аппликатур.
  4. Подорожечное хранение ритма укулеле (track.patterns для секций и ячеек),
     4 стартовых пресета перебора укулеле (струны 4, 3, 2, 1), токен «Б» по
     самой низкой звучащей ноте, 4-струнный выбор струн в редакторе, живые
     бейджи, Лента и вибрация 4 струн.
  5. Локальный офлайн Web Audio тембр нейлоновой укулеле через b39TrackBus.
  6. 4-струнный экспорт в GP5, GPX/GPIF и MIDI SMF format 1 (GM 24).
  7. Скрытие кнопки TAB на активной дорожке укулеле в рамках Этапа 1.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HTML_PATH = ROOT / "STRUCHORD.html"


def replace_once(src: str, old: str, new: str, label: str) -> str:
    count = src.count(old)
    if count != 1:
        raise RuntimeError(f"[{label}] expected exactly 1 match, found {count}")
    return src.replace(old, new, 1)


def main() -> None:
    src = HTML_PATH.read_text(encoding="utf-8")

    # 1. Версия в шапке приложения (0.865 -> 0.866)
    src = replace_once(
        src,
        '<span class="app-title">STRUCHORD <span id="devPanelTrigger" title="Открыть панель разработчика">· ver 0.865</span></span>',
        '<span class="app-title">STRUCHORD <span id="devPanelTrigger" title="Открыть панель разработчика">· ver 0.866</span></span>',
        "version-header",
    )

    # 2. GP5 Writer: поддержка 4-струнной укулеле (DEFAULT_TUNINGS, defaultView, 15 ладов)
    src = replace_once(
        src,
        """  const DEFAULT_TUNINGS = {
    guitar: [40, 45, 50, 55, 59, 64],
    bass: [28, 33, 38, 43],
    // Клавиши в GP5 хранятся как гриф: даём им шесть струн от E2, чтобы ноты
    // оставались играбельными и в табулатуре, и в нотах.
    keys: [40, 45, 50, 55, 59, 64],
    drums: null,
  };""",
        """  const DEFAULT_TUNINGS = {
    guitar: [40, 45, 50, 55, 59, 64],
    // 0.866 (B-39 Укулеле): High G (G4=67, C4=60, E4=64, A4=69) — re-entrant строй.
    ukulele: [67, 60, 64, 69],
    bass: [28, 33, 38, 43],
    // Клавиши в GP5 хранятся как гриф: даём им шесть струн от E2, чтобы ноты
    // оставались играбельными и в табулатуре, и в нотах.
    keys: [40, 45, 50, 55, 59, 64],
    drums: null,
  };""",
        "gp5-default-tunings",
    )

    src = replace_once(
        src,
        "      const defaultView = track.isDrums || (track.part.instrument !== 'guitar' && track.part.instrument !== 'bass')",
        "      const defaultView = track.isDrums || (track.part.instrument !== 'guitar' && track.part.instrument !== 'bass' && track.part.instrument !== 'ukulele')",
        "gp5-default-view",
    )

    src = replace_once(
        src,
        "      writer.i32(24); // ладов",
        "      writer.i32(track.part.instrument === 'ukulele' ? 15 : 24); // ладов (0.866: 15 для укулеле)",
        "gp5-fret-count",
    )

    # 3. GPIF Writer: поддержка 4-струнной укулеле
    src = replace_once(
        src,
        """  function defaultTuning(instrument) {
    return instrument === 'bass'
      ? ['E1', 'A1', 'D2', 'G2']
      : ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'];
  }""",
        """  function defaultTuning(instrument) {
    if (instrument === 'ukulele') return ['G4', 'C4', 'E4', 'A4']; // 0.866: High G
    return instrument === 'bass'
      ? ['E1', 'A1', 'D2', 'G2']
      : ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'];
  }""",
        "gpif-default-tuning",
    )

    src = replace_once(
        src,
        "      const isTab = instrument === 'guitar' || instrument === 'bass';\n      const defaultView = isTab ? 'tab' : 'staff';",
        "      const isTab = instrument === 'guitar' || instrument === 'bass' || instrument === 'ukulele';\n      const defaultView = isTab ? 'tab' : 'staff';",
        "gpif-is-tab",
    )

    src = replace_once(
        src,
        "      out.push(`<Instrument ref=\"${track.isPercussion ? 'd-drums' : track.isTab ? 'e-gtr6' : 'p-no-voc'}\" />`);",
        "      out.push(`<Instrument ref=\"${track.isPercussion ? 'd-drums' : track.part.instrument === 'ukulele' ? 'ukulele' : track.isTab ? 'e-gtr6' : 'p-no-voc'}\" />`);",
        "gpif-instrument-ref",
    )

    # 4. B-39 STAGE1 (StruChordTracks): полноценная поддержка ukulele
    src = replace_once(
        src,
        """  var B39_INSTRUMENTS = Object.freeze(['guitar', 'keys']);
  var B39_KEYBOARD_SIZES = Object.freeze([25, 37, 49, 61, 76, 88]);""",
        """  // 0.866 (B-39 Укулеле): добавлен полноценный инструмент ukulele и 4 фиксированных строя.
  var B39_INSTRUMENTS = Object.freeze(['guitar', 'keys', 'ukulele']);
  var B39_UKULELE_TUNINGS = Object.freeze(['high-g', 'low-g', 'baritone', 'canadian']);
  function b39IsStringInst(inst) { return inst === 'guitar' || inst === 'ukulele'; }
  var B39_KEYBOARD_SIZES = Object.freeze([25, 37, 49, 61, 76, 88]);""",
        "b39-instruments-const",
    )

    src = replace_once(
        src,
        """  function b39MakeTrack(id, instrument, name) {
    return {
      id: id, instrument: instrument, name: name,
      volume: 100, mute: false, solo: false,
      chords: {}, voicings: {}, patterns: {}, guitarShapes: {}, guitarShapeHistory: {},
      keyboardSize: null,
      // 0.780: новая клавишная дорожка сразу получает голосоведение.
      // У старых песен поля нет — они звучат как прежде, без миграции.
      ...(instrument === 'keys' ? {linkedVoicings:true, endAccent:false, voicingsVersion:2, saturation:50} : {}),   // 0.795 (№22): насыщенность по умолчанию; 0.793: endAccent выкл у новых; 0.794: voicingsVersion=2 — новый порядок вариантов
      ...(instrument === 'guitar' ? {guitarShapesVersion:1,trackTuning:{id:'e-std',notes:null}} : {})
    };
  }
  function b39DefaultName(inst, n) {
    var base = inst === 'keys' ? 'Клавиши' : 'Гитара';
    return n > 1 ? base + ' ' + n : base;
  }""",
        """  function b39MakeTrack(id, instrument, name) {
    return {
      id: id, instrument: instrument, name: name,
      volume: 100, mute: false, solo: false,
      chords: {}, voicings: {}, patterns: {}, guitarShapes: {}, guitarShapeHistory: {},
      keyboardSize: null,
      // 0.780: новая клавишная дорожка сразу получает голосоведение.
      // У старых песен поля нет — они звучат как прежде, без миграции.
      ...(instrument === 'keys' ? {linkedVoicings:true, endAccent:false, voicingsVersion:2, saturation:50} : {}),   // 0.795 (№22): насыщенность по умолчанию; 0.793: endAccent выкл у новых; 0.794: voicingsVersion=2 — новый порядок вариантов
      ...(instrument === 'guitar' ? {guitarShapesVersion:1,trackTuning:{id:'e-std',notes:null}} : {}),
      ...(instrument === 'ukulele' ? {guitarShapesVersion:1,trackTuning:{id:'high-g',notes:null}} : {})   // 0.866: укулеле по умолчанию High G
    };
  }
  function b39DefaultName(inst, n) {
    var base = inst === 'keys' ? 'Клавиши' : inst === 'ukulele' ? 'Укулеле' : 'Гитара';
    return n > 1 ? base + ' ' + n : base;
  }""",
        "b39-make-track-and-name",
    )

    src = replace_once(
        src,
        """  function cleanGuitarShape(v) {
    if (!b39IsObj(v) || typeof v.chord !== 'string' || !/^[A-G][#b]?/.test(v.chord) || !Array.isArray(v.shape) || v.shape.length !== 6 || !v.shape.every(function(n){return n==='x' || (Number.isInteger(n) && n>=0 && n<=16);})) return null;
    var result={chord:v.chord.slice(0,B39_LIMITS.MAX_CHORD),shape:v.shape.slice(),tuning:typeof v.tuning==='string'?v.tuning.slice(0,160):''};
    if(Array.isArray(v.barreOff)) result.barreOff=v.barreOff.filter(function(n){return Number.isInteger(n)&&n>=1&&n<=24;}).slice(0,6);
    if(Array.isArray(v.fingers) && v.fingers.length===6 && v.fingers.every(function(n){return n===null || n==='x' || /^[0-4]$/.test(String(n));})) result.fingers=v.fingers.slice();
    return result;
  }
  function guitarShapeFromEvent(ev) {
    if(!ev || !ev.chord || !ev.fingering)return null;
    var shape=Array.isArray(ev.fingering)?ev.fingering:typeof ev.fingering==='string'?ev.fingering.split(',').map(function(v){return v.trim()==='x'?'x':Number(v);}):null;
    return cleanGuitarShape({chord:ev.chord,shape:shape,tuning:ev.fingeringTuning||'',barreOff:ev.barreOff,fingers:ev.fingers});
  }
  function cleanTrackTuning(value, fallback) {
    var base=fallback || {id:'e-std',notes:null};
    if(!b39IsObj(value) || typeof value.id!=='string' || !TUNER_TUNINGS.some(function(x){return x.id===value.id;}))return b39Clone(base);
    if(value.notes != null && (!Array.isArray(value.notes) || value.notes.length!==6 || !value.notes.every(function(n){return typeof n==='string' && /^[A-G][#b]?-?\d$/.test(n) && noteToFrequency(n);})))return b39Clone(base);
    return {id:value.id,notes:value.notes ? value.notes.slice() : null};
  }
  function legacyTrackTuning(song) {
    return cleanTrackTuning({id:song && song.tuning,notes:song && song.tuningNotes},{id:'e-std',notes:null});
  }
  function cleanShapeHistory(raw) {
    if(!Array.isArray(raw))return null;
    var list=raw.slice(-128).map(cleanGuitarShape).filter(Boolean);
    return list.length?list:null;
  }""",
        """  // 0.866: проверка формы с учётом инструмента (6 струн / 0..16 для гитары, 4 струны / 0..15 для укулеле).
  // Битые значения отбрасываются целиком, никогда не обрезаются.
  function cleanGuitarShape(v, inst) {
    var isUke = inst === 'ukulele';
    var nStr = isUke ? 4 : 6;
    var maxFret = isUke ? 15 : 16;
    if (!b39IsObj(v) || typeof v.chord !== 'string' || !/^[A-G][#b]?/.test(v.chord) || !Array.isArray(v.shape) || v.shape.length !== nStr || !v.shape.every(function(n){return n==='x' || (Number.isInteger(n) && n>=0 && n<=maxFret);})) return null;
    var result={chord:v.chord.slice(0,B39_LIMITS.MAX_CHORD),shape:v.shape.slice(),tuning:typeof v.tuning==='string'?v.tuning.slice(0,160):''};
    if(Array.isArray(v.barreOff)) result.barreOff=v.barreOff.filter(function(n){return Number.isInteger(n)&&n>=1&&n<=(isUke?15:24);}).slice(0,nStr);
    if(Array.isArray(v.fingers) && v.fingers.length===nStr && v.fingers.every(function(n){return n===null || n==='x' || /^[0-4]$/.test(String(n)) || (!isUke && String(n).toUpperCase()==='T');})) result.fingers=v.fingers.slice();
    return result;
  }
  function guitarShapeFromEvent(ev, inst) {
    if(!ev || !ev.chord || !ev.fingering)return null;
    var shape=Array.isArray(ev.fingering)?ev.fingering:typeof ev.fingering==='string'?ev.fingering.split(',').map(function(v){return v.trim()==='x'?'x':Number(v);}):null;
    var useInst = inst || (typeof ev.fingeringTuning === 'string' && ev.fingeringTuning.indexOf('@uke:') === 0 ? 'ukulele' : 'guitar');
    return cleanGuitarShape({chord:ev.chord,shape:shape,tuning:ev.fingeringTuning||'',barreOff:ev.barreOff,fingers:ev.fingers}, useInst);
  }
  // 0.866: у укулеле строго 4 строя (без своего строя), неверный id -> 'high-g'.
  function cleanTrackTuning(value, fallback, inst) {
    if (inst === 'ukulele') {
      var uBase = fallback && B39_UKULELE_TUNINGS.indexOf(fallback.id) >= 0 ? { id: fallback.id, notes: null } : { id: 'high-g', notes: null };
      if (!b39IsObj(value) || typeof value.id !== 'string' || B39_UKULELE_TUNINGS.indexOf(value.id) < 0) return b39Clone(uBase);
      return { id: value.id, notes: null };
    }
    var base=fallback || {id:'e-std',notes:null};
    if(!b39IsObj(value) || typeof value.id!=='string' || !TUNER_TUNINGS.some(function(x){return x.id===value.id;}))return b39Clone(base);
    if(value.notes != null && (!Array.isArray(value.notes) || value.notes.length!==6 || !value.notes.every(function(n){return typeof n==='string' && /^[A-G][#b]?-?\d$/.test(n) && noteToFrequency(n);})))return b39Clone(base);
    return {id:value.id,notes:value.notes ? value.notes.slice() : null};
  }
  function legacyTrackTuning(song) {
    return cleanTrackTuning({id:song && song.tuning,notes:song && song.tuningNotes},{id:'e-std',notes:null},'guitar');
  }
  function cleanShapeHistory(raw, inst) {
    if(!Array.isArray(raw))return null;
    var list=raw.slice(-128).map(function(item){return cleanGuitarShape(item, inst);}).filter(Boolean);
    return list.length?list:null;
  }
  // 0.866: валидатор подорожечных ритмов укулеле (бой/перебор на 4 струнах).
  // Струны вне 1..4 отбрасывают паттерн целиком (без зажатия в границы).
  function cleanUkePatternValue(raw) {
    if (!b39IsObj(raw)) return null;
    var mode = raw.mode === 'pick' ? 'pick' : raw.mode === 'strum' ? 'strum' : raw.mode === 'mixed' ? 'mixed' : null;
    var sub = [1, 2, 3, 4].indexOf(Number(raw.subdivision)) >= 0 ? Number(raw.subdivision) : null;
    if (!mode || !sub || !Array.isArray(raw.steps) || !raw.steps.length || raw.steps.length > 256) return null;
    var steps = [];
    for (var i = 0; i < raw.steps.length; i++) {
      var st = raw.steps[i];
      if (st === null || st === undefined || st === '' || st === '_') { steps.push(st === '_' && mode === 'mixed' ? '_' : null); continue; }
      if (mode === 'strum') {
        if (st === 'D' || st === 'U' || st === 'X') { steps.push(st); continue; }
        return null;
      }
      if (mode === 'mixed' && (st === 'D' || st === 'U' || st === 'X')) { steps.push(st); continue; }
      var items = Array.isArray(st) ? st : [st];
      var safe = [];
      for (var j = 0; j < items.length; j++) {
        var it = items[j];
        if (it === 'B' || it === 'A') { if (safe.indexOf(it) < 0) safe.push(it); continue; }
        var sn = Number(it);
        if (!Number.isInteger(sn) || sn < 1 || sn > 4) return null; // 5/6 струн на укулеле отбрасываем целиком
        if (safe.indexOf(sn) < 0) safe.push(sn);
      }
      steps.push(safe.length ? safe : null);
    }
    var out = { mode: mode, subdivision: sub, steps: steps };
    if (raw.swing === true && (sub === 2 || sub === 4)) out.swing = true;
    return out;
  }""",
        "b39-clean-helpers",
    )

    src = replace_once(
        src,
        """        patterns: inst === 'keys' ? sanitizeMap(raw.patterns, validKeys, patternValue, false, true) : {},
        guitarShapes: inst === 'guitar' ? sanitizeMap(raw.guitarShapes, validKeys, cleanGuitarShape, false, false) : {},
        guitarShapeHistory: inst === 'guitar' ? sanitizeMap(raw.guitarShapeHistory, validKeys, cleanShapeHistory, false, false) : {},
        ...(inst === 'guitar' && Object.keys(recNotes).length ? {recordedNotes:recNotes} : {}),
        ...(inst === 'keys' && Object.keys(cleanBassRoles(raw.bassRoles, song.sections)).length ? {bassRoles:cleanBassRoles(raw.bassRoles, song.sections)} : {}),
        ...(inst === 'keys' && typeof raw.linkedVoicings==='boolean' ? {linkedVoicings:raw.linkedVoicings} : {}),   // 0.796 (№23): явное false не теряется
        ...(inst === 'keys' && raw.endAccent===false ? {endAccent:false} : {}),   // 0.793: у старых песен поля нет — акцент остаётся как в 0.789
        ...(inst === 'keys' && raw.voicingsVersion===2 ? {voicingsVersion:2} : {}),   // 0.794: у старых песен поля нет — ручные индексы резолвятся по прежнему списку (v1)
        ...(inst === 'keys' && raw.saturation !== undefined && raw.saturation !== null && Number.isInteger(satNum) && satNum >= 0 && satNum <= 100 ? {saturation:satNum} : {}),
        ...(inst==='keys' && B39_TIMBRES.includes(raw.timbre) ? {timbre:raw.timbre} : {}),
        ...(trackAuto ? {autoAccomp:trackAuto} : {}),
        keyboardSize: size, ...(inst==='guitar' ? {guitarShapesVersion:raw.guitarShapesVersion===1?1:0,trackTuning:Object.prototype.hasOwnProperty.call(raw,'trackTuning')?cleanTrackTuning(raw.trackTuning):legacyTrackTuning(song)} : {})""",
        """        patterns: inst === 'keys' ? sanitizeMap(raw.patterns, validKeys, patternValue, false, true) : inst === 'ukulele' ? sanitizeMap(raw.patterns, validKeys, cleanUkePatternValue, false, true) : {},
        guitarShapes: b39IsStringInst(inst) ? sanitizeMap(raw.guitarShapes, validKeys, function(v){return cleanGuitarShape(v, inst);}, false, false) : {},
        guitarShapeHistory: b39IsStringInst(inst) ? sanitizeMap(raw.guitarShapeHistory, validKeys, function(v){return cleanShapeHistory(v, inst);}, false, false) : {},
        ...(inst === 'guitar' && Object.keys(recNotes).length ? {recordedNotes:recNotes} : {}),
        ...(inst === 'keys' && Object.keys(cleanBassRoles(raw.bassRoles, song.sections)).length ? {bassRoles:cleanBassRoles(raw.bassRoles, song.sections)} : {}),
        ...(inst === 'keys' && typeof raw.linkedVoicings==='boolean' ? {linkedVoicings:raw.linkedVoicings} : {}),   // 0.796 (№23): явное false не теряется
        ...(inst === 'keys' && raw.endAccent===false ? {endAccent:false} : {}),   // 0.793: у старых песен поля нет — акцент остаётся как в 0.789
        ...(inst === 'keys' && raw.voicingsVersion===2 ? {voicingsVersion:2} : {}),   // 0.794: у старых песен поля нет — ручные индексы резолвятся по прежнему списку (v1)
        ...(inst === 'keys' && raw.saturation !== undefined && raw.saturation !== null && Number.isInteger(satNum) && satNum >= 0 && satNum <= 100 ? {saturation:satNum} : {}),
        ...(inst==='keys' && B39_TIMBRES.includes(raw.timbre) ? {timbre:raw.timbre} : {}),
        ...(trackAuto ? {autoAccomp:trackAuto} : {}),
        keyboardSize: size, ...(inst==='guitar' ? {guitarShapesVersion:raw.guitarShapesVersion===1?1:0,trackTuning:Object.prototype.hasOwnProperty.call(raw,'trackTuning')?cleanTrackTuning(raw.trackTuning,null,'guitar'):legacyTrackTuning(song)} : inst==='ukulele' ? {guitarShapesVersion:1,trackTuning:cleanTrackTuning(raw.trackTuning,null,'ukulele')} : {})""",
        "b39-sanitize-tracks",
    )

    src = replace_once(
        src,
        """  function normaliseState() {
    if (!state.tracks.length) { state.activeTrackId = 0; return; }
    if (!state.tracks.some(function (t) { return t.id === state.activeTrackId; })) {
      state.activeTrackId = state.tracks[0].id;
    }
    if (!B39_KEYBOARD_SIZES.includes(state.keyboardSize)) state.keyboardSize = B39_DEFAULT_KEYBOARD;
    if (!Number.isInteger(state.nextTrackId)) state.nextTrackId = 2;
  }
  function afterMutation() { normaliseState(); }""",
        """  function syncUkuleleModeClass() {
    try {
      var doc = HOST.document;
      if (!doc || !doc.documentElement || !doc.documentElement.classList) return;
      var active = findTrack(state.activeTrackId);
      doc.documentElement.classList.toggle('b39-ukulele-mode', !!(active && active.instrument === 'ukulele'));
    } catch (e) {}
  }
  function normaliseState() {
    if (!state.tracks.length) { state.activeTrackId = 0; syncUkuleleModeClass(); return; }
    if (!state.tracks.some(function (t) { return t.id === state.activeTrackId; })) {
      state.activeTrackId = state.tracks[0].id;
    }
    if (!B39_KEYBOARD_SIZES.includes(state.keyboardSize)) state.keyboardSize = B39_DEFAULT_KEYBOARD;
    if (!Number.isInteger(state.nextTrackId)) state.nextTrackId = 2;
    syncUkuleleModeClass();
  }
  function afterMutation() { normaliseState(); }""",
        "b39-sync-ukulele-mode",
    )

    src = replace_once(
        src,
        """    repairMain();
    if(HOST.StruChordKeys && HOST.StruChordKeys.clearLinkedCache) HOST.StruChordKeys.clearLinkedCache();
    return snapshot();""",
        """    repairMain();
    syncUkuleleModeClass();
    if(HOST.StruChordKeys && HOST.StruChordKeys.clearLinkedCache) HOST.StruChordKeys.clearLinkedCache();
    return snapshot();""",
        "b39-adopt-sync-uke",
    )

    src = replace_once(
        src,
        """  function tuning(id) {var t=findTrack(id);return t && t.instrument==='guitar' ? b39Clone(t.trackTuning) : null;}
  function setTuning(id,value) {
    var t=findTrack(id);if(!t || t.instrument!=='guitar')return false;
    var cleaned=cleanTrackTuning(value);if(window.captureHistorySnapshot)window.captureHistorySnapshot();
    var result=dispatch('b39/track-tuning',function(){
      var changed=JSON.stringify(t.trackTuning)!==JSON.stringify(cleaned);
      if(changed && isMain(id))eachCell(null,function(sec,sq,ev,ei,key){rememberShape(t,key,guitarShapeFromEvent(ev));});
      t.trackTuning=cleaned;
      if(changed && isMain(id)){
        var suffix=b39WithTrackTuning(id,function(){return tuningKeySuffix();});
        eachCell(null,function(sec,sq,ev,ei,key){applyEventShape(ev,recalledShape(t,key,ev.chord,suffix));});
      }
      return true;
    });
    if(window.captureHistorySnapshot)window.captureHistorySnapshot();return result;
  }
  function setInstrument(id, inst) {
    var t = findTrack(id);
    if (!t || B39_INSTRUMENTS.indexOf(inst) < 0) return false;
    if (t.instrument === inst) return true;
    var ok = dispatch('b39/track-instrument', function () {
      t.instrument = inst;
      if (inst === 'guitar') {
        t.voicings = {};
        t.patterns = {};
        t.keyboardSize = null;
        delete t.bassRoles;
        delete t.linkedVoicings;
        delete t.endAccent;
        delete t.voicingsVersion;
        delete t.timbre;
        delete t.saturation;
        delete t.autoAccomp;
        t.guitarShapesVersion = 1;
        if (!t.trackTuning) t.trackTuning = { id: 'e-std', notes: null };
        if (!isMain(id)) {
          eachCell(null, function (sec, sq, ev, ei, key) {
            var ch = t.chords[key];
            if (!ch || t.guitarShapes[key]) return;
            var sh = b39WithTrackTuning(id, function () { return defaultGuitarShape(ch, key, null, false, { sec: sec, sq: sq, ei: ei }); });
            if (sh) t.guitarShapes[key] = sh;
          });
        }
      } else {
        t.guitarShapes = {};
        t.guitarShapeHistory = {};
        delete t.recordedNotes;
        delete t.guitarShapesVersion;
        delete t.trackTuning;
        t.linkedVoicings = true;
        t.endAccent = false;
        t.voicingsVersion = 2;
        t.saturation = 50;
        if (isMain(id)) {
          eachCell(null, function (sec, sq, ev, ei) {
            delete ev.fingering; delete ev.fingeringTuning; delete ev.barreOff; delete ev.fingers; delete ev.notes;
            if (typeof HOST.dropPreferredFingeringsAt === 'function') HOST.dropPreferredFingeringsAt(sec.id, sq.id, ei);
          });
        }
      }
      state.autoAccomp = effectiveAutoAccomp(state.tracks, state.activeTrackId);
      // Имя меняем только если оно было дефолтным: свой текст не трогаем.
      if (/^(Гитара|Клавиши)( \d+)?$/.test(t.name)) t.name = b39DefaultName(inst, state.tracks.indexOf(t) + 1);
      return true;
    });
    if (typeof renderTuningPill === 'function') renderTuningPill();
    if (document.querySelector('.tuner-modal') && typeof tunerRenderTuning === 'function') tunerRenderTuning();
    if (ok && inst === 'guitar' && typeof scheduleWarmSongFingeringCache === 'function') {
      scheduleWarmSongFingeringCache();
    }
    return ok;
  }""",
        """  function tuning(id) {var t=findTrack(id);return t && b39IsStringInst(t.instrument) ? b39Clone(t.trackTuning) : null;}
  function setTuning(id,value) {
    var t=findTrack(id);if(!t || !b39IsStringInst(t.instrument))return false;
    var cleaned=cleanTrackTuning(value,null,t.instrument);if(window.captureHistorySnapshot)window.captureHistorySnapshot();
    var result=dispatch('b39/track-tuning',function(){
      var changed=JSON.stringify(t.trackTuning)!==JSON.stringify(cleaned);
      if(changed && isMain(id))eachCell(null,function(sec,sq,ev,ei,key){rememberShape(t,key,guitarShapeFromEvent(ev,t.instrument));});
      t.trackTuning=cleaned;
      if(changed && isMain(id)){
        var suffix=b39WithTrackTuning(id,function(){return tuningKeySuffix();});
        eachCell(null,function(sec,sq,ev,ei,key){applyEventShape(ev,recalledShape(t,key,ev.chord,suffix));});
      }
      if(changed && !isMain(id) && t.instrument==='ukulele'){
        var suffix2=b39WithTrackTuning(id,function(){return tuningKeySuffix();});
        eachCell(null,function(sec,sq,ev,ei,key){
          if(t.guitarShapes[key])rememberShape(t,key,t.guitarShapes[key]);
          var ch=t.chords[key];
          if(!ch){delete t.guitarShapes[key];return;}
          var rec=recalledShape(t,key,ch,suffix2);
          if(rec){t.guitarShapes[key]=rec;return;}
          var fresh=b39WithTrackTuning(id,function(){return defaultGuitarShape(ch,key,null,false,{sec:sec,sq:sq,ei:ei});});
          if(fresh)t.guitarShapes[key]=fresh; else delete t.guitarShapes[key];
        });
      }
      return true;
    });
    if(window.captureHistorySnapshot)window.captureHistorySnapshot();return result;
  }
  function setInstrument(id, inst) {
    var t = findTrack(id);
    if (!t || B39_INSTRUMENTS.indexOf(inst) < 0) return false;
    if (t.instrument === inst) return true;
    var ok = dispatch('b39/track-instrument', function () {
      t.instrument = inst;
      // 0.866 (clean_on_switch): смена инструмента очищает несовместимые данные старого инструмента.
      if (b39IsStringInst(inst)) {
        t.voicings = {};
        t.patterns = {};
        t.guitarShapes = {};
        t.guitarShapeHistory = {};
        delete t.recordedNotes;
        t.keyboardSize = null;
        delete t.bassRoles;
        delete t.linkedVoicings;
        delete t.endAccent;
        delete t.voicingsVersion;
        delete t.timbre;
        delete t.saturation;
        delete t.autoAccomp;
        t.guitarShapesVersion = 1;
        t.trackTuning = inst === 'ukulele' ? { id: 'high-g', notes: null } : { id: 'e-std', notes: null };
        if (isMain(id)) {
          eachCell(null, function (sec, sq, ev, ei) {
            delete ev.fingering; delete ev.fingeringTuning; delete ev.barreOff; delete ev.fingers; delete ev.notes;
            if (typeof HOST.dropPreferredFingeringsAt === 'function') HOST.dropPreferredFingeringsAt(sec.id, sq.id, ei);
          });
        } else {
          eachCell(null, function (sec, sq, ev, ei, key) {
            var ch = t.chords[key];
            if (!ch) return;
            var sh = b39WithTrackTuning(id, function () { return defaultGuitarShape(ch, key, null, false, { sec: sec, sq: sq, ei: ei }); });
            if (sh) t.guitarShapes[key] = sh;
          });
        }
      } else {
        t.guitarShapes = {};
        t.guitarShapeHistory = {};
        t.patterns = {};
        delete t.recordedNotes;
        delete t.guitarShapesVersion;
        delete t.trackTuning;
        t.linkedVoicings = true;
        t.endAccent = false;
        t.voicingsVersion = 2;
        t.saturation = 50;
        if (isMain(id)) {
          eachCell(null, function (sec, sq, ev, ei) {
            delete ev.fingering; delete ev.fingeringTuning; delete ev.barreOff; delete ev.fingers; delete ev.notes;
            if (typeof HOST.dropPreferredFingeringsAt === 'function') HOST.dropPreferredFingeringsAt(sec.id, sq.id, ei);
          });
        }
      }
      state.autoAccomp = effectiveAutoAccomp(state.tracks, state.activeTrackId);
      // Имя меняем только если оно было дефолтным: свой текст не трогаем.
      if (/^(Гитара|Клавиши|Укулеле)( \d+)?$/.test(t.name)) t.name = b39DefaultName(inst, state.tracks.indexOf(t) + 1);
      return true;
    });
    if (typeof fingeringCache !== 'undefined') fingeringCache.clear();
    if (typeof renderTuningPill === 'function') renderTuningPill();
    if (document.querySelector('.tuner-modal') && typeof tunerRenderTuning === 'function') tunerRenderTuning();
    if (ok && b39IsStringInst(inst) && typeof scheduleWarmSongFingeringCache === 'function') {
      scheduleWarmSongFingeringCache();
    }
    return ok;
  }""",
        "b39-tuning-and-set-instrument",
    )

    src = replace_once(
        src,
        """  function defaultGuitarShape(chord,cell,ev,legacy,f) {
    f=f||findEvent(cell,null); var sec=f && f.sec, key=sec && sec.key || currentKey();
    if(!f || !chord || typeof HOST.resolveFingeringShape!=='function')return null;
    var pos=legacy && typeof HOST.buildFingeringPositionKey==='function' ? HOST.buildFingeringPositionKey(chord,key,sec.id,f.sq.id,f.ei):null;
    var target=legacy && ev && sameChord(ev.chord,chord) ? ev : undefined;
    var shape=HOST.resolveFingeringShape(chord,key,pos,target);
    var suffix=typeof tuningKeySuffix==='function'?tuningKeySuffix():'';
    return shape ? cleanGuitarShape({chord:chord,shape:shape,tuning:suffix,barreOff:target && target.barreOff,fingers:target && target.fingers}) : null;
  }""",
        """  function defaultGuitarShape(chord,cell,ev,legacy,f) {
    f=f||findEvent(cell,null); var sec=f && f.sec, key=sec && sec.key || currentKey();
    if(!f || !chord || typeof HOST.resolveFingeringShape!=='function')return null;
    var pos=legacy && typeof HOST.buildFingeringPositionKey==='function' ? HOST.buildFingeringPositionKey(chord,key,sec.id,f.sq.id,f.ei):null;
    var target=legacy && ev && sameChord(ev.chord,chord) ? ev : undefined;
    var shape=HOST.resolveFingeringShape(chord,key,pos,target);
    var suffix=typeof tuningKeySuffix==='function'?tuningKeySuffix():'';
    var shapeInst = Array.isArray(shape) && shape.length === 4 ? 'ukulele' : 'guitar';
    return shape ? cleanGuitarShape({chord:chord,shape:shape,tuning:suffix,barreOff:target && target.barreOff,fingers:target && target.fingers}, shapeInst) : null;
  }""",
        "b39-default-guitar-shape",
    )

    src = replace_once(
        src,
        "        if(t.instrument==='guitar' && !t.guitarShapes[key]){var choice=b39WithTrackTuning(id,function(){return defaultGuitarShape(cleaned,key,null,false);});if(choice)t.guitarShapes[key]=choice;}",
        "        if(b39IsStringInst(t.instrument) && !t.guitarShapes[key]){var choice=b39WithTrackTuning(id,function(){return defaultGuitarShape(cleaned,key,null,false);});if(choice)t.guitarShapes[key]=choice;}",
        "b39-set-track-chord-string",
    )

    src = replace_once(
        src,
        """      if (t.instrument === 'guitar' && !isMain(t.id)) {
        if (delta && t.recordedNotes) {""",
        """      if (b39IsStringInst(t.instrument) && !isMain(t.id)) {
        if (delta && t.instrument === 'guitar' && t.recordedNotes) {""",
        "b39-transpose-string-tracks",
    )

    src = replace_once(
        src,
        """  function guitarShape(id, key, chord) {
    var t=findTrack(id), v=t && t.guitarShapes[key];
    if(!t || t.instrument!=='guitar')return null;
    var suffix=typeof tuningKeySuffix==='function'?b39WithTrackTuning(id,function(){return tuningKeySuffix();}):'';
    if(!v || !Array.isArray(v.shape) || !sameChord(v.chord,chord) || (v.tuning||'')!==suffix)v=recalledShape(t,key,chord,suffix);
    return v ? b39Clone(v) : null;
  }
  function activeGuitarInfo(cell,chord) {
    var t=findTrack(state.activeTrackId), secondary=!!(t && t.instrument==='guitar' && !isMain(t.id));
    return secondary ? {id:t.id,shape:guitarShape(t.id,cell,chord)} : null;
  }
  function setGuitarShape(id,key,chord,shape,barreOff,fingers) {
    var t=findTrack(id), val=cleanGuitarShape({chord:chord,shape:shape,tuning:typeof tuningKeySuffix==='function'?b39WithTrackTuning(id,function(){return tuningKeySuffix();}):'',barreOff:barreOff,fingers:fingers});
    if(!t || t.instrument!=='guitar' || !/^\d+:\d+:\d+$/.test(String(key)) || !val || !sameChord(trackChord(id,key),chord))return false;
    return dispatch('b39/guitar-shape',function(){rememberShape(t,key,t.guitarShapes[key]);t.guitarShapes[key]=val;rememberShape(t,key,val);return true;});
  }
  function setVoicing(id, key, index) {
    var t = findTrack(id), n = Number(index);
    if (!t || !Number.isInteger(n) || n < 0 || n > 99) return false;
    return dispatch('b39/track-voicing', function () { t.voicings[key] = n; t.voicingsVersion = 2; return true; });   // 0.794: новая ручная запись — новый порядок вариантов (v2)
  }
  function setPattern(id, key, pattern) {
    var t = findTrack(id), v = patternValue(pattern);
    if (!t || !v) return false;
    // Ключ либо ячейка '1:2:0', либо секция 's:1' (STAGE 5).
    if (!/^(\d+:\d+:\d+|s:\d{1,9})$/.test(String(key))) return false;
    return dispatch('b39/track-pattern', function () { t.patterns[key] = v; return true; });
  }""",
        """  function guitarShape(id, key, chord) {
    var t=findTrack(id), v=t && t.guitarShapes[key];
    if(!t || !b39IsStringInst(t.instrument))return null;
    var suffix=typeof tuningKeySuffix==='function'?b39WithTrackTuning(id,function(){return tuningKeySuffix();}):'';
    if(!v || !Array.isArray(v.shape) || !sameChord(v.chord,chord) || (v.tuning||'')!==suffix)v=recalledShape(t,key,chord,suffix);
    return v ? b39Clone(v) : null;
  }
  function activeGuitarInfo(cell,chord) {
    var t=findTrack(state.activeTrackId), secondary=!!(t && b39IsStringInst(t.instrument) && !isMain(t.id));
    return secondary ? {id:t.id,shape:guitarShape(t.id,cell,chord)} : null;
  }
  function setGuitarShape(id,key,chord,shape,barreOff,fingers) {
    var t=findTrack(id), val=t ? cleanGuitarShape({chord:chord,shape:shape,tuning:typeof tuningKeySuffix==='function'?b39WithTrackTuning(id,function(){return tuningKeySuffix();}):'',barreOff:barreOff,fingers:fingers}, t.instrument) : null;
    if(!t || !b39IsStringInst(t.instrument) || !/^\\d+:\\d+:\\d+$/.test(String(key)) || !val || !sameChord(trackChord(id,key),chord))return false;
    return dispatch('b39/guitar-shape',function(){rememberShape(t,key,t.guitarShapes[key]);t.guitarShapes[key]=val;rememberShape(t,key,val);return true;});
  }
  function setVoicing(id, key, index) {
    var t = findTrack(id), n = Number(index);
    if (!t || !Number.isInteger(n) || n < 0 || n > 99) return false;
    return dispatch('b39/track-voicing', function () { t.voicings[key] = n; t.voicingsVersion = 2; return true; });   // 0.794: новая ручная запись — новый порядок вариантов (v2)
  }
  function setPattern(id, key, pattern) {
    var t = findTrack(id);
    if (!t) return false;
    var v = t.instrument === 'ukulele' ? cleanUkePatternValue(pattern) : patternValue(pattern);
    if (!v) return false;
    // Ключ либо ячейка '1:2:0', либо секция 's:1' (STAGE 5 / 0.866 Укулеле).
    if (!/^(\\d+:\\d+:\\d+|s:\\d{1,9})$/.test(String(key))) return false;
    return dispatch('b39/track-pattern', function () { t.patterns[key] = v; return true; });
  }""",
        "b39-guitar-shape-and-pattern-api",
    )

    src = replace_once(
        src,
        """  function addTrack(instrument, copyFromActive) {
    var inst = B39_INSTRUMENTS.indexOf(instrument) >= 0 ? instrument : 'keys';
    var src = copyFromActive === false ? mainTrack() : (findTrack(state.activeTrackId) || mainTrack());
    var copied = [], copiedShapes = [], copiedRec = {};
    var sameGuitar = !!(src && src.instrument === 'guitar' && inst === 'guitar');
    var sameKeys = !!(src && src.instrument === 'keys' && inst === 'keys');
    if (src) {
      eachCell(null, function (sec, sq, ev, ei, key) {
        var c = trackChord(src.id, key, ev);
        if (c) copied.push([key, c]);
        if (sameGuitar && c) {
          var shape = b39WithTrackTuning(src.id, function () {
            return isMain(src.id)
              ? (guitarShapeFromEvent(ev) || defaultGuitarShape(c, key, ev, true, { sec: sec, sq: sq, ei: ei }))
              : (guitarShape(src.id, key, c) || defaultGuitarShape(c, key, null, false, { sec: sec, sq: sq, ei: ei }));
          });
          if (shape) copiedShapes.push([key, shape]);
        }
        if (sameGuitar) {
          var rn = isMain(src.id) ? cleanRecordedNotes(ev && ev.notes) : (src.recordedNotes && cleanRecordedNotes(src.recordedNotes[key]));
          if (rn) copiedRec[key] = rn;
        }
      });
    }
    var id = state.nextTrackId;
    dispatch('b39/track-add', function () {
      state.nextTrackId++;
      var count = state.tracks.filter(function (t) { return t.instrument === inst; }).length;
      var t = b39MakeTrack(id, inst, b39DefaultName(inst, count + 1));
      copied.forEach(function (pair) { t.chords[pair[0]] = pair[1]; });
      if (inst === 'guitar') {
        if (sameGuitar) {
          t.trackTuning = cleanTrackTuning(src.trackTuning);
          copiedShapes.forEach(function (pair) { t.guitarShapes[pair[0]] = pair[1]; });
          if (src.guitarShapeHistory) t.guitarShapeHistory = b39Clone(src.guitarShapeHistory);
          if (Object.keys(copiedRec).length) t.recordedNotes = copiedRec;
        } else {
          t.trackTuning = { id: 'e-std', notes: null };
        }
      } else if (sameKeys) {
        t.voicings = b39Clone(src.voicings || {});
        t.keyboardSize = src.keyboardSize;
        if (src.timbre && B39_TIMBRES.includes(src.timbre)) t.timbre = src.timbre;
        if (Number.isInteger(src.saturation)) t.saturation = src.saturation;
        if (typeof src.linkedVoicings === 'boolean') t.linkedVoicings = src.linkedVoicings;
        if (src.endAccent === false) t.endAccent = false; else delete t.endAccent;
        if (src.voicingsVersion === 2) t.voicingsVersion = 2; else delete t.voicingsVersion;
        if (src.bassRoles) t.bassRoles = b39Clone(src.bassRoles);
      }
      state.tracks.push(t);
      if (inst === 'guitar' && !sameGuitar) {
        b39WithTrackTuning(id, function () {
          eachCell(null, function (sec, sq, ev, ei, key) {
            var ch = t.chords[key];
            if (!ch) return;
            var sh = defaultGuitarShape(ch, key, null, false, { sec: sec, sq: sq, ei: ei });
            if (sh) t.guitarShapes[key] = sh;
          });
        });
      }
      state.activeTrackId = id;
      state.autoAccomp = effectiveAutoAccomp(state.tracks, state.activeTrackId);
      if(typeof renderTuningPill==='function')renderTuningPill();
      if(document.querySelector('.tuner-modal') && typeof tunerRenderTuning==='function')tunerRenderTuning();
      return true;
    });
    if (inst === 'guitar' && typeof scheduleWarmSongFingeringCache === 'function') {
      scheduleWarmSongFingeringCache();
    }
    return id;
  }""",
        """  function addTrack(instrument, copyFromActive) {
    var inst = B39_INSTRUMENTS.indexOf(instrument) >= 0 ? instrument : 'keys';
    var src = copyFromActive === false ? mainTrack() : (findTrack(state.activeTrackId) || mainTrack());
    var copied = [], copiedShapes = [], copiedRec = {};
    var sameGuitar = !!(src && src.instrument === 'guitar' && inst === 'guitar');
    var sameUke = !!(src && src.instrument === 'ukulele' && inst === 'ukulele');
    var sameString = sameGuitar || sameUke;
    var sameKeys = !!(src && src.instrument === 'keys' && inst === 'keys');
    if (src) {
      eachCell(null, function (sec, sq, ev, ei, key) {
        var c = trackChord(src.id, key, ev);
        if (c) copied.push([key, c]);
        if (sameString && c) {
          var shape = b39WithTrackTuning(src.id, function () {
            return isMain(src.id)
              ? (guitarShapeFromEvent(ev, inst) || defaultGuitarShape(c, key, ev, true, { sec: sec, sq: sq, ei: ei }))
              : (guitarShape(src.id, key, c) || defaultGuitarShape(c, key, null, false, { sec: sec, sq: sq, ei: ei }));
          });
          if (shape) copiedShapes.push([key, shape]);
        }
        if (sameGuitar) {
          var rn = isMain(src.id) ? cleanRecordedNotes(ev && ev.notes) : (src.recordedNotes && cleanRecordedNotes(src.recordedNotes[key]));
          if (rn) copiedRec[key] = rn;
        }
      });
    }
    var id = state.nextTrackId;
    dispatch('b39/track-add', function () {
      state.nextTrackId++;
      var count = state.tracks.filter(function (t) { return t.instrument === inst; }).length;
      var t = b39MakeTrack(id, inst, b39DefaultName(inst, count + 1));
      copied.forEach(function (pair) { t.chords[pair[0]] = pair[1]; });
      if (b39IsStringInst(inst)) {
        if (sameString) {
          t.trackTuning = cleanTrackTuning(src.trackTuning, null, inst);
          copiedShapes.forEach(function (pair) { t.guitarShapes[pair[0]] = pair[1]; });
          if (src.guitarShapeHistory) t.guitarShapeHistory = b39Clone(src.guitarShapeHistory);
          if (sameGuitar && Object.keys(copiedRec).length) t.recordedNotes = copiedRec;
          if (sameUke && src.patterns) t.patterns = b39Clone(src.patterns); // 0.866 (copy_full): копируем ритм укулеле
        } else {
          t.trackTuning = inst === 'ukulele' ? { id: 'high-g', notes: null } : { id: 'e-std', notes: null };
        }
      } else if (sameKeys) {
        t.voicings = b39Clone(src.voicings || {});
        t.keyboardSize = src.keyboardSize;
        if (src.timbre && B39_TIMBRES.includes(src.timbre)) t.timbre = src.timbre;
        if (Number.isInteger(src.saturation)) t.saturation = src.saturation;
        if (typeof src.linkedVoicings === 'boolean') t.linkedVoicings = src.linkedVoicings;
        if (src.endAccent === false) t.endAccent = false; else delete t.endAccent;
        if (src.voicingsVersion === 2) t.voicingsVersion = 2; else delete t.voicingsVersion;
        if (src.bassRoles) t.bassRoles = b39Clone(src.bassRoles);
      }
      state.tracks.push(t);
      if (b39IsStringInst(inst) && !sameString) {
        b39WithTrackTuning(id, function () {
          eachCell(null, function (sec, sq, ev, ei, key) {
            var ch = t.chords[key];
            if (!ch) return;
            var sh = defaultGuitarShape(ch, key, null, false, { sec: sec, sq: sq, ei: ei });
            if (sh) t.guitarShapes[key] = sh;
          });
        });
      }
      state.activeTrackId = id;
      state.autoAccomp = effectiveAutoAccomp(state.tracks, state.activeTrackId);
      if(typeof renderTuningPill==='function')renderTuningPill();
      if(document.querySelector('.tuner-modal') && typeof tunerRenderTuning==='function')tunerRenderTuning();
      return true;
    });
    if (b39IsStringInst(inst) && typeof scheduleWarmSongFingeringCache === 'function') {
      scheduleWarmSongFingeringCache();
    }
    return id;
  }""",
        "b39-add-track",
    )

    src = replace_once(
        src,
        """        var prior=oldMain && oldMain.instrument==='guitar' ? b39WithTrackTuning(oldMain.id,function(){return guitarShapeFromEvent(ev)||defaultGuitarShape(ev.chord,key,ev,true,{sec:sec,sq:sq,ei:ei});}) : null;
        if(prior){oldMain.guitarShapes[key]=prior;rememberShape(oldMain,key,prior);}
        var incoming=newMain.instrument==='guitar' ? guitarShape(newMain.id,key,newChords[key]) : null;""",
        """        var prior=oldMain && b39IsStringInst(oldMain.instrument) ? b39WithTrackTuning(oldMain.id,function(){return guitarShapeFromEvent(ev,oldMain.instrument)||defaultGuitarShape(ev.chord,key,ev,true,{sec:sec,sq:sq,ei:ei});}) : null;
        if(prior){oldMain.guitarShapes[key]=prior;rememberShape(oldMain,key,prior);}
        var incoming=b39IsStringInst(newMain.instrument) ? guitarShape(newMain.id,key,newChords[key]) : null;""",
        "b39-reorder-tracks-string",
    )

    src = replace_once(
        src,
        """  function resetForNewSong() {
    var instrument = 'guitar';
    try { if ((HOST.getDefaultInstrument && HOST.getDefaultInstrument()) === 'keys') instrument = 'keys'; } catch (e) {}
    return dispatch('b39/tracks-reset-new', function () {
      state.tracks = [b39MakeTrack(1, instrument, instrument === 'keys' ? 'Клавиши' : 'Гитара')];
      state.activeTrackId = 1;
      state.nextTrackId = 2;
      state.keyboardSize = B39_DEFAULT_KEYBOARD;
      state.autoAccomp = null;
      return true;
    });
  }""",
        """  function resetForNewSong() {
    var instrument = 'guitar';
    try {
      var pref = HOST.getDefaultInstrument && HOST.getDefaultInstrument();
      if (B39_INSTRUMENTS.indexOf(pref) >= 0) instrument = pref;
    } catch (e) {}
    return dispatch('b39/tracks-reset-new', function () {
      state.tracks = [b39MakeTrack(1, instrument, b39DefaultName(instrument, 1))];
      state.activeTrackId = 1;
      state.nextTrackId = 2;
      state.keyboardSize = B39_DEFAULT_KEYBOARD;
      state.autoAccomp = null;
      return true;
    });
  }""",
        "b39-reset-new-song",
    )

    # 5. Микшер UI (chooser, menu, buildRow badge)
    src = replace_once(
        src,
        """    [['guitar', '🎸 Гитара'], ['keys', '🎹 Клавиши']].forEach(function (pair) {
      var b = el('button', 'b39-choice', pair[1]);
      b.type = 'button';
      b.addEventListener('click', function () { chooseInstrument(pair[0]); });
      choices.appendChild(b);
    });""",
        """    [['guitar', '🎸 Гитара'], ['ukulele', '🪕 Укулеле'], ['keys', '🎹 Клавиши']].forEach(function (pair) {
      var b = el('button', 'b39-choice', pair[1]);
      b.type = 'button';
      b.addEventListener('click', function () { chooseInstrument(pair[0]); });
      choices.appendChild(b);
    });""",
        "b39-mixer-chooser",
    )

    src = replace_once(
        src,
        """    [['guitar', '🎸 Гитара'], ['keys', '🎹 Клавиши']].forEach(function (pair) {
      var b = el('button', 'b39-choice', pair[1]);
      b.type = 'button';
      b.addEventListener('click', function () {
        var t = T();
        if (t && menuTrackId !== null) t.setInstrument(menuTrackId, pair[0]);
        menu.hidden = true; menuTrackId = null; render();
      });
      menuChoices.appendChild(b);
    });""",
        """    [['guitar', '🎸 Гитара'], ['ukulele', '🪕 Укулеле'], ['keys', '🎹 Клавиши']].forEach(function (pair) {
      var b = el('button', 'b39-choice', pair[1]);
      b.type = 'button';
      b.addEventListener('click', function () {
        var t = T();
        if (t && menuTrackId !== null) t.setInstrument(menuTrackId, pair[0]);
        menu.hidden = true; menuTrackId = null; render();
      });
      menuChoices.appendChild(b);
    });""",
        "b39-mixer-menu",
    )

    src = replace_once(
        src,
        "    select.appendChild(el('span', 'b39-badge', track.instrument === 'keys' ? 'Клавиши' : 'Гитара'));",
        "    select.appendChild(el('span', 'b39-badge', track.instrument === 'keys' ? 'Клавиши' : track.instrument === 'ukulele' ? 'Укулеле' : 'Гитара'));",
        "b39-mixer-badge",
    )

    # 6. CSS режима укулеле (Этап 1: скрываем кнопку TAB на укулеле)
    src = replace_once(
        src,
        """html.b39-keys-mode .tab-btn,
html.b39-keys-mode .add-tab-btn,
html.b39-keys-mode .chord-wrapper--tab { display:none !important; }""",
        """html.b39-keys-mode .tab-btn,
html.b39-keys-mode .add-tab-btn,
html.b39-keys-mode .chord-wrapper--tab { display:none !important; }
/* 0.866 (B-39 Укулеле, Этап 1): 6-струнный TAB-редактор скрыт на укулеле до Этапа 2 */
html.b39-ukulele-mode .tab-btn,
html.b39-ukulele-mode .add-tab-btn,
html.b39-ukulele-mode .chord-wrapper--tab { display:none !important; }""",
        "css-ukulele-hide-tab",
    )

    # 7. Движок аппликатур: detectAllBarres, analyzeShapeGrip, asSafeFingers, computeFingersForShape, 4-string ukulele generator
    src = replace_once(
        src,
        """function detectAllBarres(shape) {
  const out = [];
  let maxFret = 0;
  for (let s = 0; s < 6; s++) {
    const f = shape[s];
    if (f !== 'x' && f !== 0 && f > maxFret) maxFret = f;
  }
  for (let f = 1; f <= maxFret; f++) {
    let segStart = null;
    for (let s = 0; s <= 6; s++) {
      const val = s < 6 ? shape[s] : 'x';
      const isValidOnFret = s < 6 && val !== 'x' && val !== 0 && val >= f;""",
        """function detectAllBarres(shape) {
  const out = [];
  const nStr = Array.isArray(shape) ? shape.length : 6;
  let maxFret = 0;
  for (let s = 0; s < nStr; s++) {
    const f = shape[s];
    if (f !== 'x' && f !== 0 && f > maxFret) maxFret = f;
  }
  for (let f = 1; f <= maxFret; f++) {
    let segStart = null;
    for (let s = 0; s <= nStr; s++) {
      const val = s < nStr ? shape[s] : 'x';
      const isValidOnFret = s < nStr && val !== 'x' && val !== 0 && val >= f;""",
        "detect-all-barres-nstr",
    )

    src = replace_once(
        src,
        """function analyzeShapeGrip(shape) {
  const fretted = [];
  const opens = [];
  const mutes = [];
  for (let s = 0; s < 6; s++) {
    const f = shape[s];
    if (f === 'x') mutes.push(s);
    else if (f === 0) opens.push(s);
    else fretted.push({ s, fret: Number(f) });
  }
  const grip = {
    shape,
    fretted,
    opens,
    mutes,
    minFret: fretted.length ? Math.min(...fretted.map((v) => v.fret)) : 0,
    maxFret: fretted.length ? Math.max(...fretted.map((v) => v.fret)) : 0,
    barreOptions: [],
    ban: null,
    chosen: null,
  };
  if (!fretted.length) {
    // Нет зажатых струн: руке делать нечего, форма играбельна.
    grip.chosen = { b: null, runs: [], fingers: 0, usesThumb: false, assignment: { barre: null, runs: [], thumb: null, fingers: 0, usesThumb: false, cost: 0 } };
    return grip;
  }
  grip.barreOptions = detectAllBarres(shape);

  // Ширина позиции — жёсткая во всех строях.
  if (grip.maxFret - grip.minFret > 4) {
    grip.ban = 'spread';
    return grip;
  }

  // Открытые струны, зажатые с обеих сторон.
  for (const o of opens) {
    let left = -1;
    let right = -1;
    for (let s = o - 1; s >= 0; s--) {
      if (shape[s] !== 'x' && shape[s] !== 0) {
        left = s;
        break;
      }
    }
    for (let s = o + 1; s < 6; s++) {""",
        """// 0.866 (B-39 Укулеле): анатомический разбор 4-струнного хвата (4 пальца, без большого пальца сверху).
function analyzeShapeGripUkulele(shape) {
  const fretted = [];
  const opens = [];
  const mutes = [];
  for (let s = 0; s < 4; s++) {
    const f = shape[s];
    if (f === 'x') mutes.push(s);
    else if (f === 0) opens.push(s);
    else fretted.push({ s, fret: Number(f) });
  }
  const grip = {
    shape, fretted, opens, mutes,
    minFret: fretted.length ? Math.min(...fretted.map((v) => v.fret)) : 0,
    maxFret: fretted.length ? Math.max(...fretted.map((v) => v.fret)) : 0,
    barreOptions: [], ban: null, chosen: null,
  };
  if (!fretted.length) {
    grip.chosen = { b: null, runs: [], fingers: 0, usesThumb: false, assignment: { barre: null, runs: [], thumb: null, fingers: 0, usesThumb: false, cost: 0 } };
    return grip;
  }
  grip.barreOptions = detectAllBarres(shape);
  if (grip.maxFret - grip.minFret > 4) { grip.ban = 'spread'; return grip; }
  // Без баррэ: до 4 зажатых струн ставится 4 пальцами (если нет невозможной растяжки).
  let chosenBarre = null;
  if (grip.barreOptions.length) {
    const fullOrEdge = grip.barreOptions.find((b) => b.fret === grip.minFret && b.coveredStrings >= 3)
      || (fretted.length >= 4 && grip.barreOptions.find((b) => b.fret === grip.minFret && b.last === 3 && b.coveredStrings >= 2))
      || null;
    // Баррэ используем когда оно реально упрощает (3+ струны на minFret или 4 зажатые струны с 2+ на minFret у края, напр. Bb = 3,2,1,1).
    if (fullOrEdge) chosenBarre = Object.assign({}, fullOrEdge, { finger: 1 });
  }
  const covered = new Set(chosenBarre ? chosenBarre.strings : []);
  const rem = fretted.filter((v) => !(chosenBarre && v.fret === chosenBarre.fret && covered.has(v.s)));
  const fingersUsed = (chosenBarre ? 1 : 0) + rem.length;
  if (fingersUsed > 4) { grip.ban = 'fingers'; return grip; }
  const cost = (grip.maxFret - grip.minFret) * 1.2 + (chosenBarre ? 1.5 : 0) + fingersUsed * 0.5;
  grip.chosen = {
    b: chosenBarre,
    runs: rem.map((v) => ({ fret: v.fret, strings: [v.s] })),
    fingers: fingersUsed,
    usesThumb: false,
    assignment: { barre: chosenBarre, runs: rem, thumb: null, fingers: fingersUsed, usesThumb: false, cost },
  };
  return grip;
}

function analyzeShapeGrip(shape) {
  if (Array.isArray(shape) && shape.length === 4) return analyzeShapeGripUkulele(shape);
  const fretted = [];
  const opens = [];
  const mutes = [];
  for (let s = 0; s < 6; s++) {
    const f = shape[s];
    if (f === 'x') mutes.push(s);
    else if (f === 0) opens.push(s);
    else fretted.push({ s, fret: Number(f) });
  }
  const grip = {
    shape,
    fretted,
    opens,
    mutes,
    minFret: fretted.length ? Math.min(...fretted.map((v) => v.fret)) : 0,
    maxFret: fretted.length ? Math.max(...fretted.map((v) => v.fret)) : 0,
    barreOptions: [],
    ban: null,
    chosen: null,
  };
  if (!fretted.length) {
    // Нет зажатых струн: руке делать нечего, форма играбельна.
    grip.chosen = { b: null, runs: [], fingers: 0, usesThumb: false, assignment: { barre: null, runs: [], thumb: null, fingers: 0, usesThumb: false, cost: 0 } };
    return grip;
  }
  grip.barreOptions = detectAllBarres(shape);

  // Ширина позиции — жёсткая во всех строях.
  if (grip.maxFret - grip.minFret > 4) {
    grip.ban = 'spread';
    return grip;
  }

  // Открытые струны, зажатые с обеих сторон.
  for (const o of opens) {
    let left = -1;
    let right = -1;
    for (let s = o - 1; s >= 0; s--) {
      if (shape[s] !== 'x' && shape[s] !== 0) {
        left = s;
        break;
      }
    }
    for (let s = o + 1; s < 6; s++) {""",
        "analyze-shape-grip-4str",
    )

    # Генератор 4-струнных аппликатур укулеле + перехват в generateFingeringVariants
    src = replace_once(
        src,
        """function generateFingeringVariants(chordName, key, prevChordName = null) {
  if (!chordName) return [];
  // Строй входит в ключ: в Drop D у того же аккорда другой набор форм,
  // и общий кэш выдавал бы формы от чужих струн.
  const cacheKey =
    buildFingeringChordKey(chordName, key) + (prevChordName ? '|' + prevChordName : '');
  if (fingeringCache.has(cacheKey)) return fingeringCache.get(cacheKey);""",
        """// 0.866 (B-39 Укулеле): канонические формы для GCEA (High G / Low G) и генератор
// для всех 4 строёв укулеле (High G, Low G, Баритон DGBE, Canadian ADF#B).
const UKULELE_OPEN_GCEA = {
  C: [[0,0,0,3]], Cm: [[0,3,3,3]], C7: [[0,0,0,1]], Cmaj7: [[0,0,0,2]], Cm7: [[3,3,3,3]],
  Csus4: [[0,0,1,3]], Csus2: [[0,2,3,3]], Cdim: [[2,3,2,3]], Caug: [[1,0,0,3]],
  'C#': [[1,1,1,4]], 'C#m': [[1,1,0,4],[6,4,4,4]], 'C#7': [[1,1,1,2]], 'C#m7': [[1,1,0,2]],
  Db: [[1,1,1,4]], Dbm: [[1,1,0,4]], Db7: [[1,1,1,2]],
  D: [[2,2,2,0]], Dm: [[2,2,1,0]], D7: [[2,2,2,3],[2,0,2,0]], Dmaj7: [[2,2,2,4]], Dm7: [[2,2,1,3]],
  Dsus4: [[2,2,3,0]], Dsus2: [[2,2,0,0]], Ddim: [[1,2,1,2]],
  Eb: [[0,3,3,1]], Ebm: [[3,3,2,1]], Eb7: [[3,3,3,4]], Ebmaj7: [[3,3,3,5]],
  'D#': [[0,3,3,1]], 'D#m': [[3,3,2,1]],
  E: [[1,4,0,2],[4,4,4,2]], Em: [[0,4,3,2]], E7: [[1,2,0,2]], Emaj7: [[1,3,0,2]], Em7: [[0,2,0,2]],
  F: [[2,0,1,0]], Fm: [[1,0,1,3]], F7: [[2,3,1,0]], Fmaj7: [[2,4,1,3],[5,5,0,0]], Fm7: [[1,3,1,3]],
  'F#': [[3,1,2,1]], 'F#m': [[2,1,2,0]], 'F#7': [[3,4,2,4]], 'F#m7': [[2,4,2,4]],
  Gb: [[3,1,2,1]], Gbm: [[2,1,2,0]],
  G: [[0,2,3,2]], Gm: [[0,2,3,1]], G7: [[0,2,1,2]], Gmaj7: [[0,2,2,2]], Gm7: [[0,2,1,1]], Gsus4: [[0,2,3,3]],
  Ab: [[5,3,4,3]], Abm: [[1,3,4,2],[4,3,4,2]], Ab7: [[1,3,2,3]],
  'G#': [[5,3,4,3]], 'G#m': [[1,3,4,2],[4,3,4,2]],
  A: [[2,1,0,0]], Am: [[2,0,0,0]], A7: [[0,1,0,0]], Amaj7: [[1,1,0,0]], Am7: [[0,0,0,0]], Asus4: [[2,2,0,0]], Asus2: [[2,4,5,2]],
  Bb: [[3,2,1,1]], Bbm: [[3,1,1,1]], Bb7: [[1,2,1,1]], Bbmaj7: [[3,2,1,0]], Bbm7: [[1,1,1,1]],
  'A#': [[3,2,1,1]], 'A#m': [[3,1,1,1]],
  B: [[4,3,2,2]], Bm: [[4,2,2,2]], B7: [[2,3,2,2]], Bmaj7: [[3,3,2,2]], Bm7: [[2,2,2,2]], Bdim: [[4,2,1,2]],
};

function generateUkuleleFingeringVariants(chordName, key, prevChordName) {
  const cacheKey = buildFingeringChordKey(chordName, key) + (prevChordName ? '|' + prevChordName : '');
  if (fingeringCache.has(cacheKey)) return fingeringCache.get(cacheKey);

  const main = chordName.split('/')[0].trim();
  const bassNote = chordName.includes('/') ? chordName.split('/')[1].trim() : null;
  const ks = getKeyStyle(key);
  const chordNotes = getChordNotes(main, ks) || [];
  const rootMatch = main.match(/^([A-G][#b]?)/);
  const rootNote = rootMatch ? rootMatch[1] : '';
  const dimColor = dimColorPc(main);

  const openNotes = b39GuitarTuningNotes(); // 4 ноты с октавами
  const openMidis = openNotes.map((n) => tunerNoteToMidi(n));
  const openPcs = openNotes.map((n) => CHROMATIC.indexOf(toSharpNote(n.replace(/-?\\d+$/, ''))));
  const targetPcs = new Set(chordNotes.map((n) => CHROMATIC.indexOf(toSharpNote(String(n).replace(/-?\\d+$/, '')))));
  if (Number.isInteger(dimColor)) targetPcs.add(dimColor);
  const rootPc = rootNote ? CHROMATIC.indexOf(toSharpNote(rootNote)) : -1;
  const bassPc = bassNote ? CHROMATIC.indexOf(toSharpNote(bassNote)) : -1;
  if (bassPc >= 0) targetPcs.add(bassPc);
  const essentialPcs = [];
  chordNotes.forEach((n) => {
    const pc = CHROMATIC.indexOf(toSharpNote(String(n).replace(/-?\\d+$/, '')));
    if (pc >= 0 && !essentialPcs.includes(pc)) essentialPcs.push(pc);
  });
  const fifthPc = rootPc >= 0 ? (rootPc + 7) % 12 : -1;

  // Пользовательские формы текущего строя укулеле
  const userEntries = (userFingerings.get(buildFingeringChordKey(chordName, key)) || [])
    .map((entry) => {
      const sh = ufEntryShape(entry);
      return sh && sh.length === 4 ? { shape: sh, method: 'user', barreOff: ufEntryBarre(entry), fingers: ufEntryFingers(entry) } : null;
    })
    .filter(Boolean);

  if (!chordNotes.length || openPcs.length !== 4 || openMidis.some((m) => m === null)) {
    const res = {
      shapes: userEntries.map((e) => e.shape),
      methods: userEntries.map((e) => e.method),
      barreOffs: userEntries.map((e) => e.barreOff || null),
      fingers: userEntries.map((e) => e.fingers || null),
    };
    fingeringCache.set(cacheKey, res);
    return res;
  }

  // Каноническая подсказка для строёв GCEA и перенос на Canadian (+2) / Baritone (DGBE)
  const canonSet = new Set();
  const ukeId = b39TunerId();
  if (!bassNote) {
    if (ukeId === 'high-g' || ukeId === 'low-g') {
      const list = UKULELE_OPEN_GCEA[main];
      if (list) list.forEach((sh) => canonSet.add(sh.join(',')));
    } else if (ukeId === 'canadian' && typeof transposeChord === 'function') {
      const shiftedName = transposeChord(main, -2);
      const list = UKULELE_OPEN_GCEA[shiftedName];
      if (list) list.forEach((sh) => canonSet.add(sh.join(',')));
    }
  }

  // Для каждой из 4 струн находим допустимые лады 0..15, дающие тон аккорда
  const fretsPerStr = openPcs.map((opc) => {
    const arr = [];
    for (let f = 0; f <= 15; f++) {
      if (targetPcs.has((opc + f) % 12)) arr.push(f);
    }
    return arr;
  });

  const seen = new Set();
  const candidates = [];

  function evaluateShape(sh) {
    const k = sh.join(',');
    if (seen.has(k)) return;
    seen.add(k);

    const fretted = [];
    const presentPcs = new Set();
    let lowestMidi = 999;
    let lowestPc = -1;
    let muted = 0;
    let openCount = 0;
    for (let s = 0; s < 4; s++) {
      const f = sh[s];
      if (f === 'x') { muted++; continue; }
      if (f === 0) openCount++; else fretted.push(f);
      const midi = openMidis[s] + f;
      const pc = (openPcs[s] + f) % 12;
      presentPcs.add(pc);
      if (midi < lowestMidi) { lowestMidi = midi; lowestPc = pc; }
    }
    if (4 - muted < 3) return;
    if (fretted.length) {
      const minF = Math.min(...fretted), maxF = Math.max(...fretted);
      if (maxF - minF > 4) return;
    }
    // Проверяем присутствие обязательных тонов аккорда (на 4 струнах квинту можно опустить у 4+ тоновых аккордов)
    if (rootPc >= 0 && !presentPcs.has(rootPc)) return;
    if (bassPc >= 0 && lowestPc !== bassPc) return;
    let missingNonFifth = 0;
    let missingFifth = 0;
    for (const pc of essentialPcs) {
      if (!presentPcs.has(pc)) {
        if (pc === fifthPc) missingFifth++;
        else missingNonFifth++;
      }
    }
    if (essentialPcs.length <= 3 && (missingNonFifth > 0 || missingFifth > 0)) {
      // Для обычного трезвучия требуем все 3 тона (кроме dim, где возможна замена)
      if (!Number.isInteger(dimColor) || missingNonFifth > 0) return;
    } else if (essentialPcs.length === 4 && missingNonFifth > 0) {
      return;
    } else if (essentialPcs.length > 4 && missingNonFifth > 1) {
      return;
    }

    const grip = analyzeShapeGripUkulele(sh);
    if (grip.ban) return;

    const maxF = fretted.length ? Math.max(...fretted) : 0;
    const minF = fretted.length ? Math.min(...fretted) : 0;
    const span = fretted.length ? maxF - minF : 0;
    let score = 200;
    const isCanon = canonSet.has(k);
    if (isCanon) score += 120;
    score -= maxF * 6;
    score -= minF * 3;
    score -= span * 8;
    score += openCount * 14;
    score -= muted * 65;
    score -= missingFifth * 15;
    score -= missingNonFifth * 40;
    if (lowestPc === (bassPc >= 0 ? bassPc : rootPc)) score += 18;
    if (grip.chosen && grip.chosen.b) score -= 12;
    score -= (grip.chosen ? grip.chosen.fingers : 0) * 4;
    // Бонус за 4 разные ноты у 4-тоновых аккордов
    score += presentPcs.size * 10;

    candidates.push({ shape: sh, method: isCanon ? 'open' : (maxF <= 5 ? 'caged' : 'auto'), score });
  }

  // Полный перебор в окнах по 4 лада + открытые струны (4^4 = очень быстро)
  for (let winStart = 1; winStart <= 12; winStart++) {
    const winEnd = Math.min(15, winStart + 3);
    const opts = fretsPerStr.map((arr) => {
      const sub = arr.filter((f) => f === 0 || (f >= winStart && f <= winEnd));
      return sub;
    });
    if (opts.some((o) => !o.length)) continue;
    for (const f0 of opts[0]) {
      for (const f1 of opts[1]) {
        for (const f2 of opts[2]) {
          for (const f3 of opts[3]) {
            evaluateShape([f0, f1, f2, f3]);
          }
        }
      }
    }
  }
  // Также проверяем явно канонические формы (если вдруг размах 4 лада)
  canonSet.forEach((k) => {
    const sh = k.split(',').map((v) => (v === 'x' ? 'x' : Number(v)));
    if (sh.length === 4 && sh.every((f, s) => f === 'x' || targetPcs.has((openPcs[s] + f) % 12))) {
      evaluateShape(sh);
    }
  });
  // Если без заглушённых струн вариантов не нашлось (редкий slash или сложный аккорд), пробуем 1 заглушённую струну
  if (!candidates.length) {
    for (let muteStr = 0; muteStr < 4; muteStr++) {
      for (let winStart = 1; winStart <= 11; winStart++) {
        const winEnd = Math.min(15, winStart + 3);
        const opts = fretsPerStr.map((arr, s) => s === muteStr ? ['x'] : arr.filter((f) => f === 0 || (f >= winStart && f <= winEnd)));
        if (opts.some((o) => !o.length)) continue;
        for (const f0 of opts[0]) for (const f1 of opts[1]) for (const f2 of opts[2]) for (const f3 of opts[3]) {
          evaluateShape([f0, f1, f2, f3]);
        }
      }
    }
  }

  candidates.sort((a, b) => (b.score - a.score) || a.shape.join(',').localeCompare(b.shape.join(',')));

  // Объединяем пользовательские + лучшие найденные (до 16 разнообразных вариантов)
  const finalEntries = [];
  const usedIds = new Set();
  userEntries.forEach((e) => {
    const id = fingeringIdentity(e.shape, e.barreOff);
    if (!usedIds.has(id)) { usedIds.add(id); finalEntries.push(e); }
  });
  for (const c of candidates) {
    if (finalEntries.length >= 16) break;
    const id = fingeringIdentity(c.shape, null);
    if (!usedIds.has(id)) {
      usedIds.add(id);
      finalEntries.push({ shape: c.shape, method: c.method, barreOff: null, fingers: null });
    }
  }

  const res = {
    shapes: finalEntries.map((e) => e.shape),
    methods: finalEntries.map((e) => e.method),
    barreOffs: finalEntries.map((e) => e.barreOff || null),
    fingers: finalEntries.map((e) => e.fingers || null),
  };
  fingeringCache.set(cacheKey, res);
  return res;
}

function generateFingeringVariants(chordName, key, prevChordName = null) {
  if (!chordName) return [];
  if (typeof b39IsUkuleleContext === 'function' && b39IsUkuleleContext()) {
    return generateUkuleleFingeringVariants(chordName, key, prevChordName);
  }
  // Строй входит в ключ: в Drop D у того же аккорда другой набор форм,
  // и общий кэш выдавал бы формы от чужих струн.
  const cacheKey =
    buildFingeringChordKey(chordName, key) + (prevChordName ? '|' + prevChordName : '');
  if (fingeringCache.has(cacheKey)) return fingeringCache.get(cacheKey);""",
        "generate-ukulele-fingering-variants",
    )

    # asSafeFingers и computeFingersForShape (поддержка 4 струн)
    src = replace_once(
        src,
        """function asSafeFingers(raw) {
  if (!Array.isArray(raw) || raw.length !== 6) return null;""",
        """function asSafeFingers(raw, expectedLen) {
  if (!Array.isArray(raw)) return null;
  if (expectedLen ? raw.length !== expectedLen : (raw.length !== 6 && raw.length !== 4)) return null;""",
        "as-safe-fingers-4-or-6",
    )

    src = replace_once(
        src,
        """function computeFingersForShape(shape, customFingers, barreOff) {
  if (customFingers && Array.isArray(customFingers) && customFingers.length === 6) {""",
        """// 0.866: анатомическая раскладка пальцев 1..4 для 4-струнной формы укулеле.
function computeFingersForUkuleleShape(shape, customFingers, barreOff) {
  const result = new Array(4).fill(null);
  if (customFingers && Array.isArray(customFingers) && customFingers.length === 4) {
    let hasCustom = false;
    for (let s = 0; s < 4; s++) {
      if (shape[s] === 'x') result[s] = 'x';
      else if (shape[s] === 0 || shape[s] === '0') result[s] = 0;
      else if (customFingers[s] != null && customFingers[s] !== 'x' && customFingers[s] !== 0 && customFingers[s] !== '0') {
        result[s] = Number(customFingers[s]) || customFingers[s];
        hasCustom = true;
      }
    }
    if (hasCustom && result.every((v, s) => shape[s] === 'x' || shape[s] === 0 || shape[s] === '0' || v != null)) return result;
  }
  const fretted = [];
  for (let s = 0; s < 4; s++) {
    const f = shape[s];
    if (f === 'x') result[s] = 'x';
    else if (f === 0 || f === '0') result[s] = 0;
    else fretted.push({ s, fret: Number(f) });
  }
  if (!fretted.length) return result;
  const grip = analyzeShapeGripUkulele(shape);
  if (grip.ban) return null;
  const barre = grip.chosen ? grip.chosen.b : null;
  const barreSuppressed = barre && barreOff && normalizeBarreOffSet(barreOff) && normalizeBarreOffSet(barreOff).has(barre.fret);
  const barreStrings = (barre && !barreSuppressed) ? new Set(barre.strings) : new Set();
  if (barre && !barreSuppressed) {
    for (const s of barre.strings) {
      if (Number(shape[s]) === Number(barre.fret)) result[s] = 1;
    }
  }
  const rem = fretted.filter((v) => !(barre && !barreSuppressed && v.fret === barre.fret && barreStrings.has(v.s)));
  if (!rem.length) return result;
  const minF = grip.minFret;
  // Сортируем по ладу, затем от 4-й струны к 1-й (естественное положение пальцев на укулеле)
  rem.sort((a, b) => (a.fret - b.fret) || (a.s - b.s));
  // Одиночная нота на 3-м ладу (C = 0,0,0,3) — традиционно безымянный (3), на 2-м — средний (2), на 1-м — указательный (1)
  if (!barre && rem.length === 1 && rem[0].fret >= 1 && rem[0].fret <= 4) {
    result[rem[0].s] = rem[0].fret;
    return result;
  }
  let nextFinger = (barre && !barreSuppressed) ? 2 : 1;
  // Если без баррэ, все лады начинаются с 2-го и размах <= 2 и открытые есть (например G = 0,2,3,2 -> 1,3,2),
  // распределяем 1..4 по возрастанию лада.
  for (let i = 0; i < rem.length; i++) {
    const item = rem[i];
    if (!barre && minF === 1 && rem.length <= 3) {
      // Открытые позиции от 1-го лада: F (2,0,1,0) -> лад 1=1, лад 2=2; Dm (2,2,1,0) -> лад 1=1, лад 2=2,3
      const sameBefore = rem.slice(0, i).filter((x) => x.fret === item.fret).length;
      const desired = Math.min(4, Math.max(nextFinger, (item.fret - minF + 1) + sameBefore));
      result[item.s] = desired;
      nextFinger = Math.min(4, desired + 1);
    } else {
      result[item.s] = Math.min(4, nextFinger);
      nextFinger = Math.min(4, nextFinger + 1);
    }
  }
  return result;
}

function computeFingersForShape(shape, customFingers, barreOff) {
  if (Array.isArray(shape) && shape.length === 4) {
    return computeFingersForUkuleleShape(shape, customFingers, barreOff);
  }
  if (customFingers && Array.isArray(customFingers) && customFingers.length === 6) {""",
        "compute-fingers-ukulele",
    )

    # 8. renderFingeringSVG: 4 струны для укулеле
    src = replace_once(
        src,
        """function renderFingeringSVG(fingers, bottomPad, opts) {
  const padTop = 25;
  const stringSpacing = 18,
    fretSpacing = 25,
    strings = 6,
    frets = 5,
    dotRadius = 6;
  const fretWidth = (strings - 1) * stringSpacing;""",
        """function renderFingeringSVG(fingers, bottomPad, opts) {
  const padTop = 25;
  const strings = Array.isArray(fingers) && fingers.length === 4 ? 4 : 6;
  const stringSpacing = strings === 4 ? 22 : 18,
    fretSpacing = 25,
    frets = 5,
    dotRadius = 6;
  const fretWidth = (strings - 1) * stringSpacing;""",
        "render-fingering-svg-strings-count",
    )

    src = replace_once(
        src,
        """  let minFret = 99,
    maxFret = 0;
  for (let s = 0; s < 6; s++) {
    const val = fingers[s];""",
        """  let minFret = 99,
    maxFret = 0;
  for (let s = 0; s < strings; s++) {
    const val = fingers[s];""",
        "render-fingering-svg-min-max",
    )

    src = replace_once(
        src,
        """  for (let s = 0; s < 6; s++) {
    const val = fingers[s];
    const x = padLeft + s * stringSpacing;
    if (val === 'x') {""",
        """  for (let s = 0; s < strings; s++) {
    const val = fingers[s];
    const x = padLeft + s * stringSpacing;
    if (val === 'x') {""",
        "render-fingering-svg-dots-loop",
    )

    # 9. resolveFingeringShape: 4 или 6 струн строго по активному инструменту
    src = replace_once(
        src,
        """  const suffix = typeof tuningKeySuffix === 'function' ? tuningKeySuffix() : '';
  const sameTuning = !target || (target.fingeringTuning || '') === suffix;
  const onEvent = sameTuning && target && target.fingering;
  if (onEvent) {
    if (Array.isArray(onEvent) && onEvent.length === 6 && onEvent.every((v) => v === 'x' || Number.isFinite(v))) {
      return onEvent;
    }
    if (typeof onEvent === 'string') {
      const parsed = onEvent.split(',').map((v) => (v.trim() === 'x' ? 'x' : Number(v)));
      if (parsed.length === 6 && parsed.every((v) => v === 'x' || Number.isFinite(v))) {
        return parsed;
      }
    }
  }

  const result = window.getFingeringVariants ? window.getFingeringVariants(chordName, key) : null;
  const variants = result ? result.shapes : [];

  if (posKey) {
    const preferred = preferredFingeringByChord.get(posKey);
    if (preferred) {
      if (variants && variants.length) {
        const found = variants.find((v) => v.join(',') === preferred);
        if (found) return found;
      }
      if (Array.isArray(preferred) && preferred.length === 6 && preferred.every((v) => v === 'x' || Number.isFinite(v))) {
        return preferred;
      }
      if (typeof preferred === 'string') {
        const parsed = preferred.split(',').map((v) => (v.trim() === 'x' ? 'x' : Number(v)));
        if (parsed.length === 6 && parsed.every((v) => v === 'x' || Number.isFinite(v))) {
          return parsed;
        }
      }
    }
  }""",
        """  const isUke = typeof b39IsUkuleleContext === 'function' && b39IsUkuleleContext();
  const nStr = isUke ? 4 : 6;
  const maxF = isUke ? 15 : 24;
  const validShape = (arr) => Array.isArray(arr) && arr.length === nStr && arr.every((v) => v === 'x' || (Number.isInteger(v) && v >= 0 && v <= maxF));
  const suffix = typeof tuningKeySuffix === 'function' ? tuningKeySuffix() : '';
  const sameTuning = !target || (target.fingeringTuning || '') === suffix;
  const onEvent = sameTuning && target && target.fingering;
  if (onEvent) {
    if (validShape(onEvent)) return onEvent;
    if (typeof onEvent === 'string') {
      const parsed = onEvent.split(',').map((v) => (v.trim() === 'x' ? 'x' : Number(v)));
      if (validShape(parsed)) return parsed;
    }
  }

  const result = window.getFingeringVariants ? window.getFingeringVariants(chordName, key) : null;
  const variants = result ? result.shapes : [];

  if (posKey) {
    const preferred = preferredFingeringByChord.get(posKey);
    if (preferred) {
      if (variants && variants.length) {
        const found = variants.find((v) => v.join(',') === preferred);
        if (found) return found;
      }
      if (validShape(preferred)) return preferred;
      if (typeof preferred === 'string') {
        const parsed = preferred.split(',').map((v) => (v.trim() === 'x' ? 'x' : Number(v)));
        if (validShape(parsed)) return parsed;
      }
    }
  }""",
        "resolve-fingering-shape-nstr",
    )

    # 10. Тултип, закреплённая карточка, превью «Дальше», Лента и прогрев кэша для вторичных дорожек укулеле
    src = replace_once(
        src,
        "  const ownTooltip=!!(activeGuitar && activeGuitar.instrument==='guitar' && activeGuitar.id!==activeState.mainTrackId);",
        "  const ownTooltip=!!(activeGuitar && (activeGuitar.instrument==='guitar' || activeGuitar.instrument==='ukulele') && activeGuitar.id!==activeState.mainTrackId);",
        "tooltip-own-ukulele",
    )

    old_pin_own = "  const own=info.track && info.track.instrument==='guitar' && info.track.id!==info.state.mainTrackId;"
    new_pin_own = "  const own=info.track && (info.track.instrument==='guitar' || info.track.instrument==='ukulele') && info.track.id!==info.state.mainTrackId;"
    if src.count(old_pin_own) != 3:
        raise RuntimeError(f"[pinned-own-ukulele] expected 3 matches, found {src.count(old_pin_own)}")
    src = src.replace(old_pin_own, new_pin_own)

    src = replace_once(
        src,
        "  const mainIsGuitar = !tracks || (mainTrack && mainTrack.instrument === 'guitar');",
        "  const mainIsGuitar = !tracks || (mainTrack && (mainTrack.instrument === 'guitar' || mainTrack.instrument === 'ukulele'));",
        "warm-cache-main-ukulele",
    )
    src = replace_once(
        src,
        "          if (activeTrack && activeTrack.instrument === 'guitar') {",
        "          if (activeTrack && (activeTrack.instrument === 'guitar' || activeTrack.instrument === 'ukulele')) {",
        "warm-cache-active-ukulele",
    )
    src = replace_once(
        src,
        "    trackId:active && !active.main && active.instrument==='guitar' ? active.id : undefined,",
        "    trackId:active && !active.main && (active.instrument==='guitar' || active.instrument==='ukulele') ? active.id : undefined,",
        "tl-paused-trackid-ukulele",
    )
    src = replace_once(
        src,
        "  const own=active && active.instrument==='guitar' && active.id!==state.mainTrackId;",
        "  const own=active && (active.instrument==='guitar' || active.instrument==='ukulele') && active.id!==state.mainTrackId;",
        "tl-paused-own-ukulele",
    )
    old_tl_tid = "trackId:displayTrack && !displayTrack.main && displayTrack.instrument==='guitar' ? displayTrack.id : undefined,"
    new_tl_tid = "trackId:displayTrack && !displayTrack.main && (displayTrack.instrument==='guitar' || displayTrack.instrument==='ukulele') ? displayTrack.id : undefined,"
    if src.count(old_tl_tid) != 2:
        raise RuntimeError(f"[tl-display-trackid-ukulele] expected 2 matches, found {src.count(old_tl_tid)}")
    src = src.replace(old_tl_tid, new_tl_tid)

    # 11. Распознавание аккорда по 4-струнной аппликатуре (учёт re-entrant баса по MIDI!)
    src = replace_once(
        src,
        """function analyzeFingeringShapeRaw(shape, context = {}) {
  // Разбор «что за аккорд нарисован на грифе» зависит от строя и контекста (B-81).
  const stringNotes = songStringNotes();
  const isClassicC6Shape = ['x', 3, 2, 2, 1, 0].every((v, i) => String(shape[i]) === String(v));
  const chromatic = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  const notesWithStrings = [];
  for (let s = 0; s < 6; s++) {
    const val = shape[s];
    if (val === 'x') continue;
    const openNote = stringNotes[s];
    const openIdx = chromatic.indexOf(openNote);
    const noteIdx = (openIdx + (val === 0 ? 0 : val)) % 12;
    const note = chromatic[noteIdx];
    notesWithStrings.push({ string: s, fret: val, note });
  }
  if (notesWithStrings.length < 2) {
    return { chordName: '?', reason: 'too_few_notes', rootNote: null, intervals: null };
  }

  const uniqueNotes = [];
  for (const n of notesWithStrings) {
    if (!uniqueNotes.includes(n.note)) uniqueNotes.push(n.note);
  }

  const candidates = [];
  const bassNote = notesWithStrings[0].note;""",
        """function analyzeFingeringShapeRaw(shape, context = {}) {
  // Разбор «что за аккорд нарисован на грифе» зависит от строя и контекста (B-81).
  const nStr = Array.isArray(shape) ? shape.length : 6;
  const fullNotes = b39GuitarTuningNotes();
  const stringNotes = songStringNotes();
  const isClassicC6Shape = nStr === 6 && ['x', 3, 2, 2, 1, 0].every((v, i) => String(shape[i]) === String(v));
  const chromatic = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  const notesWithStrings = [];
  for (let s = 0; s < nStr; s++) {
    const val = shape[s];
    if (val === 'x') continue;
    const openNote = stringNotes[s];
    const openIdx = chromatic.indexOf(openNote);
    if (openIdx < 0) continue;
    const fretNum = val === 0 ? 0 : Number(val);
    const noteIdx = (openIdx + fretNum) % 12;
    const note = chromatic[noteIdx];
    const openMidi = fullNotes[s] ? tunerNoteToMidi(fullNotes[s]) : null;
    const midi = openMidi !== null ? openMidi + fretNum : null;
    notesWithStrings.push({ string: s, fret: val, note, midi });
  }
  if (notesWithStrings.length < 2) {
    return { chordName: '?', reason: 'too_few_notes', rootNote: null, intervals: null };
  }

  const uniqueNotes = [];
  for (const n of notesWithStrings) {
    if (!uniqueNotes.includes(n.note)) uniqueNotes.push(n.note);
  }

  const candidates = [];
  // 0.866: в re-entrant строях укулеле (High G, Canadian) самая низкая звучащая нота —
  // по минимальному MIDI (например C4 в C = 0,0,0,3), а не по индексу 0 (G4).
  let bassEntry = notesWithStrings[0];
  if (nStr === 4) {
    notesWithStrings.forEach((entry) => {
      if (entry.midi !== null && (bassEntry.midi === null || entry.midi < bassEntry.midi)) {
        bassEntry = entry;
      }
    });
  }
  const bassNote = bassEntry.note;""",
        "analyze-fingering-shape-4str",
    )

    # 12. Интерактивный редактор аппликатур: 4 струны, 0..15 ладов
    src = replace_once(
        src,
        """function createInteractiveFretboard(initialShape, onChange, opts = {}) {
  // B-78: гриф крупнее и «легче» прежнего (18→22 шаг струн, 25→28 шаг
  // ладов, точки 6→7) — цели клика комфортнее, но без раздутости.
  // Геометрия — единственное, что поменялось; логика окна ладов, баррэ,
  // кликов и API идентичны прежним.
  const strings = 6,
    frets = 5,
    dotRadius = 7;
  const stringSpacing = 22,
    fretSpacing = 28;
  const padLeft = 40,
    padTop = 34;
  const fretWidth = (strings - 1) * stringSpacing;
  const padRight = 34; // место под тумблер «разжать баррэ»
  const width = padLeft + fretWidth + padRight;
  const height = padTop + frets * fretSpacing + 22;

  let minFret = 99,
    maxFret = 0;
  for (let s = 0; s < 6; s++) {""",
        """function createInteractiveFretboard(initialShape, onChange, opts = {}) {
  // B-78 / 0.866 (B-39 Укулеле): 4 струны (0..15 ладов) для укулеле, 6 для гитары.
  const strings = Array.isArray(initialShape) && initialShape.length === 4 ? 4 : 6,
    frets = 5,
    dotRadius = 7;
  const maxBoardFret = strings === 4 ? 15 : 16;
  const stringSpacing = strings === 4 ? 26 : 22,
    fretSpacing = 28;
  const padLeft = 40,
    padTop = 34;
  const fretWidth = (strings - 1) * stringSpacing;
  const padRight = 34; // место под тумблер «разжать баррэ»
  const width = padLeft + fretWidth + padRight;
  const height = padTop + frets * fretSpacing + 22;

  let minFret = 99,
    maxFret = 0;
  for (let s = 0; s < strings; s++) {""",
        "interactive-fretboard-init",
    )

    src = replace_once(
        src,
        "    for (let s = 0; s < 6; s++) {\n      const val = shape[s];\n      const x = padLeft + s * stringSpacing;\n      const markY = padTop - 10;",
        "    for (let s = 0; s < strings; s++) {\n      const val = shape[s];\n      const x = padLeft + s * stringSpacing;\n      const markY = padTop - 10;",
        "interactive-fretboard-dots-loop",
    )

    src = replace_once(
        src,
        """  const gtTrack=gtState && gtState.tracks.find(t=>t.id===gtState.activeTrackId);
  const ownGuitar=!!(wrapper && gtTrack && gtTrack.instrument==='guitar' && gtTrack.id!==gtState.mainTrackId);
  const ownCell=ownGuitar ? wrapper.dataset.sec+':'+wrapper.dataset.square+':'+wrapper.dataset.ei : null;""",
        """  const gtTrack=gtState && gtState.tracks.find(t=>t.id===gtState.activeTrackId);
  const isUkeEditor = !!(gtTrack && gtTrack.instrument === 'ukulele');
  const editorStrings = isUkeEditor ? 4 : 6;
  const editorMaxFret = isUkeEditor ? 15 : 24;
  const ownGuitar=!!(wrapper && gtTrack && (gtTrack.instrument==='guitar' || gtTrack.instrument==='ukulele') && gtTrack.id!==gtState.mainTrackId);
  const ownCell=ownGuitar ? wrapper.dataset.sec+':'+wrapper.dataset.square+':'+wrapper.dataset.ei : null;""",
        "open-fingering-editor-uke",
    )

    src = replace_once(
        src,
        """  if (createMode) {
    // Аппликатура "с нуля": имя аккорда ещё не определено, поэтому
    // никаких вариантов не подгружаем — просто пустой гриф.
    currentShape = Array(6).fill('x');
    cacheKey = null;
  } else {
    // Строй входит в ключ: форма, собранная в Drop D, не должна
    // подставляться в стандартном строе — там она звучит иначе.
    cacheKey = buildFingeringChordKey(chordName, key);
    activeCacheKey = cacheKey;
    const result = window.getFingeringVariants ? window.getFingeringVariants(chordName, key) : null;
    const variants = result ? result.shapes : [];
    if (entrySnapshot && entrySnapshot.fingering) {
      const raw = entrySnapshot.fingering;
      const parsed = Array.isArray(raw)
        ? raw
        : (typeof raw === 'string' ? raw.split(',').map((v) => (v.trim() === 'x' ? 'x' : Number(v))) : null);
      if (parsed && parsed.length === 6 && parsed.every((v) => v === 'x' || Number.isFinite(v))) {
        currentShape = [...parsed];
      }
    }
    if(ownGuitar) {
      const own=gt.guitarShape(gtTrack.id,ownCell,chordName);
      if(own){currentShape=own.shape.slice();initialBarreOff=own.barreOff||null;initialFingers=own.fingers||null;}
    }
    if (!currentShape) {
      if (variants && variants[variantIndex]) {
        currentShape = [...variants[variantIndex]];
      } else if (variants && variants.length > 0) {
        currentShape = [...variants[0]];
      } else {
        currentShape = Array(6).fill('x');
      }
    }""",
        """  if (createMode) {
    // Аппликатура "с нуля": имя аккорда ещё не определено, поэтому
    // никаких вариантов не подгружаем — просто пустой гриф.
    currentShape = Array(editorStrings).fill('x');
    cacheKey = null;
  } else {
    // Строй входит в ключ: форма, собранная в Drop D или другом строе укулеле,
    // не должна подставляться в чужом строе.
    cacheKey = buildFingeringChordKey(chordName, key);
    activeCacheKey = cacheKey;
    const result = window.getFingeringVariants ? window.getFingeringVariants(chordName, key) : null;
    const variants = result ? result.shapes : [];
    const entrySuffix = typeof tuningKeySuffix === 'function' ? tuningKeySuffix() : '';
    if (entrySnapshot && entrySnapshot.fingering && (entrySnapshot.fingeringTuning || '') === entrySuffix) {
      const raw = entrySnapshot.fingering;
      const parsed = Array.isArray(raw)
        ? raw
        : (typeof raw === 'string' ? raw.split(',').map((v) => (v.trim() === 'x' ? 'x' : Number(v))) : null);
      if (parsed && parsed.length === editorStrings && parsed.every((v) => v === 'x' || (Number.isInteger(v) && v >= 0 && v <= editorMaxFret))) {
        currentShape = [...parsed];
      }
    }
    if(ownGuitar) {
      const own=gt.guitarShape(gtTrack.id,ownCell,chordName);
      if(own && own.shape && own.shape.length === editorStrings){currentShape=own.shape.slice();initialBarreOff=own.barreOff||null;initialFingers=own.fingers||null;}
    }
    if (!currentShape) {
      if (variants && variants[variantIndex]) {
        currentShape = [...variants[variantIndex]];
      } else if (variants && variants.length > 0) {
        currentShape = [...variants[0]];
      } else {
        currentShape = Array(editorStrings).fill('x');
      }
    }""",
        "open-fingering-editor-shape-init",
    )

    # 13. transposeFingeringShape: поддержка 4 и 6 струн
    src = replace_once(
        src,
        """function transposeFingeringShape(shapeStr, st) {
  if (!shapeStr || !st) return shapeStr || null;
  const parts = String(shapeStr).split(',');
  if (parts.length !== 6) return null;""",
        """function transposeFingeringShape(shapeStr, st) {
  if (!shapeStr || !st) return shapeStr || null;
  const parts = String(shapeStr).split(',');
  if (parts.length !== 6 && parts.length !== 4) return null;""",
        "transpose-fingering-shape-4-or-6",
    )

    # 14. Единая таблица 4 строёв укулеле, контекст дорожки, #tuningPill, тюнер 4 струны
    src = replace_once(
        src,
        """let b39TuningContext = null;
function b39WithTrackTuning(id, work) {
  const previous=b39TuningContext;b39TuningContext=id;
  try{return work();}finally{b39TuningContext=previous;}
}
function b39SelectedTuning() {
  const T=window.StruChordTracks;
  if(!T || b39TuningContext==='legacy')return null;
  if(b39TuningContext==='standard')return {id:'e-std',notes:null};
  return typeof b39TuningContext==='number' ? T.tuning(b39TuningContext) : T.activeTuning();
}
function b39GuitarTuningNotes() {
  const value=b39SelectedTuning();
  if(!value)return tunerCustomNotes || (TUNER_TUNINGS.find(t=>t.id===tunerTuningId)||TUNER_TUNINGS[0]).notes;
  return value.notes || (TUNER_TUNINGS.find(t=>t.id===value.id)||TUNER_TUNINGS[0]).notes;
}
function b39TunerId() {const value=b39SelectedTuning();return value?value.id:tunerTuningId;}
function b39ChangeTuning(id,notes) {
  const T=window.StruChordTracks, st=T && T.state(), t=st && st.tracks.find(x=>x.id===st.activeTrackId);
  if(t && t.instrument==='guitar')return T.setTuning(t.id,{id,notes});
  if(t)return false;
  tunerTuningId=id;tunerCustomNotes=notes;return true;
}
function tunerCurrentTuning() {
  return TUNER_TUNINGS.find((t) => t.id === b39TunerId()) || TUNER_TUNINGS[0];
}""",
        """// 0.866 (B-39 Укулеле): строго 4 фиксированных строя укулеле с единой таблицей MIDI.
const UKULELE_TUNINGS = Object.freeze([
  { id: 'high-g', group: 'Укулеле', name: 'High G', label: 'High G (стандартный)', notes: ['G4', 'C4', 'E4', 'A4'], midi: [67, 60, 64, 69], reentrant: true },
  { id: 'low-g', group: 'Укулеле', name: 'Low G', label: 'Low G', notes: ['G3', 'C4', 'E4', 'A4'], midi: [55, 60, 64, 69], reentrant: false },
  { id: 'baritone', group: 'Укулеле', name: 'Баритон', label: 'Баритон (DGBE)', notes: ['D3', 'G3', 'B3', 'E4'], midi: [50, 55, 59, 64], reentrant: false },
  { id: 'canadian', group: 'Укулеле', name: 'Canadian', label: 'Canadian (ADF#B)', notes: ['A4', 'D4', 'F#4', 'B4'], midi: [69, 62, 66, 71], reentrant: true },
]);
window.UKULELE_TUNINGS = UKULELE_TUNINGS;

let b39TuningContext = null;
function b39WithTrackTuning(id, work) {
  const previous=b39TuningContext;b39TuningContext=id;
  try{return work();}finally{b39TuningContext=previous;}
}
function b39ContextTrack() {
  const T = window.StruChordTracks;
  if (!T || b39TuningContext === 'legacy' || b39TuningContext === 'standard') return null;
  if (typeof b39TuningContext === 'number') return T.track(b39TuningContext);
  const st = T.state && T.state();
  if (!st || !Array.isArray(st.tracks)) return null;
  return st.tracks.find((x) => x.id === st.activeTrackId) || null;
}
function b39CurrentTrackInstrument() {
  const tr = b39ContextTrack();
  return tr ? tr.instrument : 'guitar';
}
function b39IsUkuleleContext() {
  return b39CurrentTrackInstrument() === 'ukulele';
}
function b39ActiveStringCount() {
  return b39IsUkuleleContext() ? 4 : 6;
}
function b39UkuleleTuningById(id) {
  return UKULELE_TUNINGS.find((t) => t.id === id) || UKULELE_TUNINGS[0];
}
function b39SelectedTuning() {
  const T=window.StruChordTracks;
  if(!T || b39TuningContext==='legacy')return null;
  if(b39TuningContext==='standard')return {id:'e-std',notes:null};
  return typeof b39TuningContext==='number' ? T.tuning(b39TuningContext) : T.activeTuning();
}
function b39GuitarTuningNotes() {
  if (b39IsUkuleleContext()) {
    const val = b39SelectedTuning();
    return b39UkuleleTuningById(val && val.id).notes;
  }
  const value=b39SelectedTuning();
  if(!value)return tunerCustomNotes || (TUNER_TUNINGS.find(t=>t.id===tunerTuningId)||TUNER_TUNINGS[0]).notes;
  return value.notes || (TUNER_TUNINGS.find(t=>t.id===value.id)||TUNER_TUNINGS[0]).notes;
}
function b39TunerId() {
  const value=b39SelectedTuning();
  if (b39IsUkuleleContext()) return b39UkuleleTuningById(value && value.id).id;
  return value?value.id:tunerTuningId;
}
function b39ChangeTuning(id,notes) {
  const T=window.StruChordTracks, st=T && T.state(), t=st && st.tracks.find(x=>x.id===st.activeTrackId);
  if(t && t.instrument==='ukulele')return T.setTuning(t.id,{id,notes:null});
  if(t && t.instrument==='guitar')return T.setTuning(t.id,{id,notes});
  if(t)return false;
  tunerTuningId=id;tunerCustomNotes=notes;return true;
}
function tunerCurrentTuning() {
  if (b39IsUkuleleContext()) return b39UkuleleTuningById(b39TunerId());
  return TUNER_TUNINGS.find((t) => t.id === b39TunerId()) || TUNER_TUNINGS[0];
}""",
        "ukulele-tunings-and-context",
    )

    src = replace_once(
        src,
        """function isStandardTuning() {
  return songStringNotes().join(',') === 'E,A,D,G,B,E';
}""",
        """function isStandardTuning() {
  if (b39IsUkuleleContext()) return false;
  return songStringNotes().join(',') === 'E,A,D,G,B,E';
}""",
        "is-standard-tuning-uke",
    )

    src = replace_once(
        src,
        """function shapeMatchesChord(shape, chordNotes, bassNote, extraPc) {
  if (!shape || !chordNotes || !chordNotes.length) return true;
  const sn = songStringNotes();
  const target = new Set(chordNotes.map((n) => toSharpNote(String(n).replace(/-?\\d+$/, ''))));
  if (Number.isInteger(extraPc)) target.add(CHROMATIC[extraPc]);
  let lowest = -1;
  for (let i = 0; i < 6; i++) {""",
        """function shapeMatchesChord(shape, chordNotes, bassNote, extraPc) {
  if (!shape || !chordNotes || !chordNotes.length) return true;
  const sn = songStringNotes();
  const nStr = Math.min(shape.length, sn.length);
  const target = new Set(chordNotes.map((n) => toSharpNote(String(n).replace(/-?\\d+$/, ''))));
  if (Number.isInteger(extraPc)) target.add(CHROMATIC[extraPc]);
  let lowest = -1;
  for (let i = 0; i < nStr; i++) {""",
        "shape-matches-chord-nstr",
    )

    src = replace_once(
        src,
        """function tuningKeySuffix() {
  return isStandardTuning() ? '' : '@' + b39GuitarTuningNotes().join('');
}""",
        """function tuningKeySuffix() {
  if (b39IsUkuleleContext()) return '@uke:' + b39TunerId();
  return isStandardTuning() ? '' : '@' + b39GuitarTuningNotes().join('');
}""",
        "tuning-key-suffix-uke",
    )

    # #tuningPill и #tuningPickerList (динамическая перестройка при смене гитара <-> укулеле)
    src = replace_once(
        src,
        """function toggleTuningPicker(force) {
  const list = document.getElementById('tuningPickerList');
  const btn = document.getElementById('tuningPill');
  if (!list || !btn) return;
  const show = force === undefined ? list.hidden : force;

  if (show && !list.children.length) {
    // Собираем при первом открытии: те же группы и тот же вид, что в
    // окне тюнера — список один и тот же, разводить их нельзя.
    let lastGroup = null;
    TUNER_TUNINGS.forEach((t) => {
      if (t.group !== lastGroup) {
        lastGroup = t.group;
        const head = document.createElement('div');
        head.className = 'tuner-tuning-group';
        head.textContent = t.group;
        list.appendChild(head);
      }
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'tuner-tuning-item';
      item.dataset.id = t.id;
      item.setAttribute('role', 'option');
      item.innerHTML =
        `<span>${t.name}</span><span class="tuner-tuning-notes">` +
        `${t.notes.map((n) => n.replace(/-?\\d+$/, '')).join(' ')}</span>`;
      item.onclick = () => {
        b39ChangeTuning(t.id,null);
        renderTuningPill();
        // Если окно тюнера открыто, оно должно показать то же самое.
        if (document.querySelector('.tuner-modal')) tunerRenderTuning();
        toggleTuningPicker(false);
        // Пересобрать аппликатуры под новый строй.
        onSongTuningChanged();
      };
      list.appendChild(item);
    });

    // «Свой» — не строй, а ДЕЙСТВИЕ: открывает тюнер, где строй
    // собирают стрелками у каждой струны. Своего набора нот у пункта
    // нет, поэтому он отделён чертой и подписан иначе, чем остальные.
    const own = document.createElement('button');
    own.type = 'button';
    own.className = 'tuner-tuning-item tuner-tuning-own';
    own.setAttribute('role', 'option');
    own.innerHTML =
      '<span>Свой</span>' +
      '<span class="tuner-tuning-notes">настроить вручную</span>';
    own.onclick = () => {
      toggleTuningPicker(false);
      // Тюнер здесь открываем намеренно: в нём и живут стрелки
      // подстройки. Текущий строй берётся как основа — человек правит
      // то, что уже стоит, а не начинает с пустого места.
      openTuner();
    };
    list.appendChild(own);
  }""",
        """function toggleTuningPicker(force) {
  const list = document.getElementById('tuningPickerList');
  const btn = document.getElementById('tuningPill');
  if (!list || !btn) return;
  const show = force === undefined ? list.hidden : force;
  const isUke = b39IsUkuleleContext();
  const modeKey = isUke ? 'ukulele' : 'guitar';

  if (show && (!list.children.length || list.dataset.tuningMode !== modeKey)) {
    list.innerHTML = '';
    list.dataset.tuningMode = modeKey;
    // 0.866: на укулеле показываем строго 4 строя (без «Свой»).
    const sourceList = isUke ? UKULELE_TUNINGS : TUNER_TUNINGS;
    let lastGroup = null;
    sourceList.forEach((t) => {
      if (t.group !== lastGroup) {
        lastGroup = t.group;
        const head = document.createElement('div');
        head.className = 'tuner-tuning-group';
        head.textContent = t.group;
        list.appendChild(head);
      }
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'tuner-tuning-item';
      item.dataset.id = t.id;
      item.setAttribute('role', 'option');
      item.innerHTML =
        `<span>${t.name}</span><span class="tuner-tuning-notes">` +
        `${t.notes.map((n) => n.replace(/-?\\d+$/, '')).join(' ')}</span>`;
      item.onclick = () => {
        b39ChangeTuning(t.id,null);
        renderTuningPill();
        if (document.querySelector('.tuner-modal')) tunerRenderTuning();
        toggleTuningPicker(false);
        onSongTuningChanged();
      };
      list.appendChild(item);
    });

    if (!isUke) {
      const own = document.createElement('button');
      own.type = 'button';
      own.className = 'tuner-tuning-item tuner-tuning-own';
      own.setAttribute('role', 'option');
      own.innerHTML =
        '<span>Свой</span>' +
        '<span class="tuner-tuning-notes">настроить вручную</span>';
      own.onclick = () => {
        toggleTuningPicker(false);
        openTuner();
      };
      list.appendChild(own);
    }
  }""",
        "toggle-tuning-picker-uke",
    )

    # Тюнер: 4 струны на укулеле + список 4 строёв укулеле
    src = replace_once(
        src,
        """  let lastGroup = null;
  TUNER_TUNINGS.forEach((t) => {
    if (t.group !== lastGroup) {
      lastGroup = t.group;
      const head = document.createElement('div');
      head.className = 'tuner-tuning-group';
      head.textContent = t.group;
      tuningList.appendChild(head);
    }
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'tuner-tuning-item';
    item.dataset.id = t.id;
    item.setAttribute('role', 'option');
    item.innerHTML =
      `<span>${t.name}</span><span class="tuner-tuning-notes">` +
      `${t.notes.map((n) => n.replace(/\\d/, '')).join(' ')}</span>`;
    item.onclick = () => {
      b39ChangeTuning(t.id,null);
      tunerRenderTuning();
      tunerToggleTuningList(false);
      onSongTuningChanged();
    };
    tuningList.appendChild(item);
  });""",
        """  const tunerListSource = b39IsUkuleleContext() ? UKULELE_TUNINGS : TUNER_TUNINGS;
  let lastGroup = null;
  tunerListSource.forEach((t) => {
    if (t.group !== lastGroup) {
      lastGroup = t.group;
      const head = document.createElement('div');
      head.className = 'tuner-tuning-group';
      head.textContent = t.group;
      tuningList.appendChild(head);
    }
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'tuner-tuning-item';
    item.dataset.id = t.id;
    item.setAttribute('role', 'option');
    item.innerHTML =
      `<span>${t.name}</span><span class="tuner-tuning-notes">` +
      `${t.notes.map((n) => n.replace(/-?\\d+$/, '')).join(' ')}</span>`;
    item.onclick = () => {
      b39ChangeTuning(t.id,null);
      tunerRenderTuning();
      tunerToggleTuningList(false);
      onSongTuningChanged();
    };
    tuningList.appendChild(item);
  });""",
        "tuner-modal-list-uke",
    )

    src = replace_once(
        src,
        """function tunerActiveTuningName() {
  const notes = tunerActiveNotes();
  const same = TUNER_TUNINGS.find((t) => t.notes.join() === notes.join());
  return same ? same.name : 'Свой строй';
}""",
        """function tunerActiveTuningName() {
  if (b39IsUkuleleContext()) return b39UkuleleTuningById(b39TunerId()).name;
  const notes = tunerActiveNotes();
  const same = TUNER_TUNINGS.find((t) => t.notes.join() === notes.join());
  return same ? same.name : 'Свой строй';
}""",
        "tuner-active-tuning-name-uke",
    )

    src = replace_once(
        src,
        """function tunerRenderTuning() {
  const nameEl = document.getElementById('tunerTuningName');
  if (nameEl) nameEl.textContent = tunerActiveTuningName();
  // Плашка в панели показывает то же самое — обновляем вместе.
  renderTuningPill();
  const box = document.getElementById('tunerStrings');
  if (!box) return;
  box.innerHTML = '';
  tunerActiveNotes().forEach((note, i) => {
    const freq = noteToFrequency(note);
    // Ячейка: стрелка вверх, кнопка ноты, стрелка вниз. Стрелки лежат в
    // потоке и всегда занимают место, а по наведению лишь проявляются —
    // если бы они появлялись из ниоткуда, ряд подпрыгивал бы под
    // курсором и попасть по кнопке стало бы труднее.
    const cell = document.createElement('div');
    cell.className = 'tuner-string-cell';

    // Класс иконки — ПОЛНЫМ ЛИТЕРАЛОМ, а не подстановкой `ti-${...}`:
    // subset-icons.py ищет имена регуляркой по тексту файла и
    // собранное из переменной не находит. Замер: chevron-up не попал в
    // сабсет, кнопка была пустой (иконка 0x0, глиф none), и снаружи
    // выглядело так, будто верхней стрелки нет вовсе.
    const mk = (dir, title) => {
      const a = document.createElement('button');
      a.type = 'button';
      a.className = 'tuner-string-arrow';
      a.title = title;
      a.setAttribute('aria-label', `${title}: струна ${6 - i}`);
      a.innerHTML = dir > 0
        ? '<i class="ti ti-chevron-up"></i>'
        : '<i class="ti ti-chevron-down"></i>';
      a.onclick = (e) => {
        // Иначе клик дойдёт до кнопки ноты и сыграет старую высоту.
        e.stopPropagation();
        tunerShiftString(i, dir);
      };
      return a;
    };

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tuner-string-btn';
    // Номер струны сверху мелким, нота крупным: на кнопку смотрят
    // мельком, и ищут на ней ноту, а не порядковый номер.
    btn.innerHTML =
      `<span class="tuner-string-num">${6 - i}</span>` +
      `<span class="tuner-string-label">${note.replace(/-?\\d+$/, '')}</span>`;
    btn.title = `${note} · ${freq.toFixed(2)} Гц`;
    btn.onclick = () => tunerPlayReference({ note, freq }, btn);

    cell.appendChild(mk(1, 'Выше на полутон'));
    cell.appendChild(btn);
    cell.appendChild(mk(-1, 'Ниже на полутон'));
    box.appendChild(cell);
  });
}""",
        """function tunerRenderTuning() {
  const nameEl = document.getElementById('tunerTuningName');
  if (nameEl) nameEl.textContent = tunerActiveTuningName();
  // Плашка в панели показывает то же самое — обновляем вместе.
  renderTuningPill();
  const box = document.getElementById('tunerStrings');
  if (!box) return;
  box.innerHTML = '';
  const isUke = b39IsUkuleleContext();
  const activeNotes = tunerActiveNotes();
  const totalStrings = activeNotes.length;
  activeNotes.forEach((note, i) => {
    const freq = noteToFrequency(note);
    const stringNo = totalStrings - i;
    const cell = document.createElement('div');
    cell.className = 'tuner-string-cell';

    const mk = (dir, title) => {
      const a = document.createElement('button');
      a.type = 'button';
      a.className = 'tuner-string-arrow';
      a.title = title;
      a.setAttribute('aria-label', `${title}: струна ${stringNo}`);
      a.innerHTML = dir > 0
        ? '<i class="ti ti-chevron-up"></i>'
        : '<i class="ti ti-chevron-down"></i>';
      a.onclick = (e) => {
        e.stopPropagation();
        tunerShiftString(i, dir);
      };
      return a;
    };

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tuner-string-btn';
    btn.innerHTML =
      `<span class="tuner-string-num">${stringNo}</span>` +
      `<span class="tuner-string-label">${note.replace(/-?\\d+$/, '')}</span>`;
    btn.title = `${note} · ${freq.toFixed(2)} Гц`;
    btn.onclick = () => tunerPlayReference({ note, freq }, btn);

    // 0.866: на укулеле строго 4 готовых строя — без ручного сдвига отдельных струн.
    if (!isUke) cell.appendChild(mk(1, 'Выше на полутон'));
    cell.appendChild(btn);
    if (!isUke) cell.appendChild(mk(-1, 'Ниже на полутон'));
    box.appendChild(cell);
  });
}""",
        "tuner-render-tuning-4str",
    )

    # 15. Web Audio тембр укулеле (pluckString, strumChord, strumChordDirectional, pluckSingleGuitarString, playChord, scheduleNextEvent)
    src = replace_once(
        src,
        """  const soundInstrument = opts.instrument === 'bass' ? 'bass' : 'guitar';
  const preset = soundPresetById(opts.sound || songSoundNow, soundInstrument);
  // Канал микшера ОБЩИЙ для всех дорожек (главная и остальные играют в
  // «Песню»), поэтому громкость дорожки в него запекать нельзя: она
  // перестала бы меняться после планирования. Голос дорожки идёт через свой
  // узел (b39TrackBusFor), и громкость дорожки живёт только там — тогда M/S
  // и ползунок слышны сразу, даже у уже звучащих голосов.
  const channel = mixerChannelForVoice(ctx, opts.channel);
  const trackBusNode = b39GuitarTrackId != null ? b39TrackBusFor(ctx, b39GuitarTrackId, channel) : null;
  const gain = (Number(opts.gain) || 0) * preset.gain * (trackBusNode ? 1 : b39GuitarGain);
  const duration = Math.min(6, (Number(opts.duration) || 0) * preset.ring);
  const brightness = Math.max(0.05, Math.min(1, (Number(opts.brightness) || 0) + preset.bright));""",
        """  const isUkeVoice = opts.instrument === 'ukulele' || (!opts.instrument && typeof b39IsUkuleleContext === 'function' && b39IsUkuleleContext());
  const soundInstrument = opts.instrument === 'bass' ? 'bass' : 'guitar';
  const preset = isUkeVoice
    ? { gain: 0.96, ring: 0.62, bright: 0.22, drive: 0, cab: 4200 } // 0.866: яркий короткий нейлоновый щипок укулеле
    : soundPresetById(opts.sound || songSoundNow, soundInstrument);
  // Канал микшера ОБЩИЙ для всех дорожек (главная и остальные играют в
  // «Песню»), поэтому громкость дорожки в него запекать нельзя: она
  // перестала бы меняться после планирования. Голос дорожки идёт через свой
  // узел (b39TrackBusFor), и громкость дорожки живёт только там — тогда M/S
  // и ползунок слышны сразу, даже у уже звучащих голосов.
  const channel = mixerChannelForVoice(ctx, opts.channel);
  const trackBusNode = b39GuitarTrackId != null ? b39TrackBusFor(ctx, b39GuitarTrackId, channel) : null;
  const gain = (Number(opts.gain) || 0) * preset.gain * (trackBusNode ? 1 : b39GuitarGain);
  const duration = Math.min(isUkeVoice ? 2.6 : 6, (Number(opts.duration) || 0) * preset.ring);
  const brightness = Math.max(0.05, Math.min(1, (Number(opts.brightness) || 0) + preset.bright));""",
        "pluck-string-ukulele-preset",
    )

    src = replace_once(
        src,
        """  const toneFilter = ctx.createBiquadFilter();
  toneFilter.type = 'lowpass';
  toneFilter.frequency.value = 1000 + brightness * 3400;
  toneFilter.Q.value = 0.4;
  // Перегруженный тракт: шейпер «сажает» пики, кабинет срезает верх, трим
  // возвращает громкость — иначе перегруз звучал бы просто громче.
  let voiceHead = toneFilter;""",
        """  const toneFilter = ctx.createBiquadFilter();
  toneFilter.type = 'lowpass';
  toneFilter.frequency.value = isUkeVoice ? (1600 + brightness * 3800) : (1000 + brightness * 3400);
  toneFilter.Q.value = isUkeVoice ? 0.55 : 0.4;
  // Перегруженный тракт: шейпер «сажает» пики, кабинет срезает верх, трим
  // возвращает громкость — иначе перегруз звучал бы просто громче.
  let voiceHead = toneFilter;
  if (isUkeVoice) {
    // 0.866: резонанс маленького нейлонового корпуса укулеле (без низкого гитарного гула).
    const ukeHp = ctx.createBiquadFilter();
    ukeHp.type = 'highpass';
    ukeHp.frequency.value = 210;
    ukeHp.Q.value = 0.6;
    const ukeBody = ctx.createBiquadFilter();
    ukeBody.type = 'peaking';
    ukeBody.frequency.value = 920;
    ukeBody.Q.value = 1.3;
    ukeBody.gain.value = 3.2;
    toneFilter.connect(ukeHp);
    ukeHp.connect(ukeBody);
    voiceHead = ukeBody;
  }""",
        "pluck-string-ukulele-body-filter",
    )

    src = replace_once(
        src,
        """  const strumSpacing = 0.014;
  notes.forEach((note, i) => {
    const stringIndex = note.stringIndex;
    const brightness = 0.45 + (stringIndex / 5) * 0.5;
    const pan = -0.28 + (stringIndex / 5) * 0.56;
    const levelJitter = 0.9 + Math.random() * 0.2;
    const gain = baseGain * levelJitter * (i === 0 ? 1.1 : 1);
    pluckString(ctx, {
      freq: note.freq,
      startTime: startTime + i * strumSpacing,
      duration,
      gain,
      pan,
      brightness,
    });
  });""",
        """  const isUke = typeof b39IsUkuleleContext === 'function' && b39IsUkuleleContext();
  const maxIdx = isUke ? 3 : 5;
  const strumSpacing = isUke ? 0.011 : 0.014;
  notes.forEach((note, i) => {
    const stringIndex = note.stringIndex;
    const norm = Math.min(1, Math.max(0, stringIndex / maxIdx));
    const brightness = (isUke ? 0.62 : 0.45) + norm * (isUke ? 0.34 : 0.5);
    const pan = (isUke ? -0.2 : -0.28) + norm * (isUke ? 0.4 : 0.56);
    const levelJitter = 0.9 + Math.random() * 0.2;
    const gain = baseGain * levelJitter * (i === 0 ? 1.1 : 1);
    pluckString(ctx, {
      freq: note.freq,
      startTime: startTime + i * strumSpacing,
      duration,
      gain,
      pan,
      brightness,
      instrument: isUke ? 'ukulele' : 'guitar',
    });
  });""",
        "strum-chord-ukulele",
    )

    src = replace_once(
        src,
        """  const strumSpacing = direction === 'up' ? 0.01 : 0.014;
  notes.forEach((note, i) => {
    const stringIndex = note.stringIndex;
    const brightness = 0.45 + (stringIndex / 5) * 0.5;
    const pan = -0.28 + (stringIndex / 5) * 0.56;
    const levelJitter = 0.9 + Math.random() * 0.2;
    const directionGain = direction === 'up' ? 0.82 : 1; // апстрок традиционно чуть тише даунстрока
    const gain = baseGain * levelJitter * directionGain * (i === 0 ? 1.05 : 1);
    pluckString(ctx, {
      freq: note.freq,
      startTime: startTime + i * strumSpacing,
      duration,
      gain,
      pan,
      brightness,
    });
  });""",
        """  const isUke = typeof b39IsUkuleleContext === 'function' && b39IsUkuleleContext();
  const maxIdx = isUke ? 3 : 5;
  const strumSpacing = direction === 'up' ? (isUke ? 0.008 : 0.01) : (isUke ? 0.011 : 0.014);
  notes.forEach((note, i) => {
    const stringIndex = note.stringIndex;
    const norm = Math.min(1, Math.max(0, stringIndex / maxIdx));
    const brightness = (isUke ? 0.62 : 0.45) + norm * (isUke ? 0.34 : 0.5);
    const pan = (isUke ? -0.2 : -0.28) + norm * (isUke ? 0.4 : 0.56);
    const levelJitter = 0.9 + Math.random() * 0.2;
    const directionGain = direction === 'up' ? 0.82 : 1; // апстрок традиционно чуть тише даунстрока
    const gain = baseGain * levelJitter * directionGain * (i === 0 ? 1.05 : 1);
    pluckString(ctx, {
      freq: note.freq,
      startTime: startTime + i * strumSpacing,
      duration,
      gain,
      pan,
      brightness,
      instrument: isUke ? 'ukulele' : 'guitar',
    });
  });""",
        "strum-chord-directional-ukulele",
    )

    src = replace_once(
        src,
        """  ensureGuitarBus(ctx);
  const stringIndex = 6 - stringNumber;
  if (stringIndex < 0 || stringIndex > 5) return;
  // Открытые частоты — из строя песни (см. songStringFreqs).
  const openFreqs = songStringFreqs();
  let freq = null;
  if (shape && shape[stringIndex] !== undefined && shape[stringIndex] !== 'x' && shape[stringIndex] !== null) {
    const fret = typeof shape[stringIndex] === 'number' ? shape[stringIndex] : parseInt(shape[stringIndex], 10);
    if (Number.isFinite(fret)) freq = openFreqs[stringIndex] * Math.pow(2, fret / 12);
  }
  if (!freq) freq = openFreqs[stringIndex]; // струна заглушена/неизвестна — берём открытую как приближение
  const brightness = 0.45 + (stringIndex / 5) * 0.5;
  const pan = -0.28 + (stringIndex / 5) * 0.56;
  pluckString(ctx, { freq, startTime, duration, gain: baseGain, pan, brightness });""",
        """  ensureGuitarBus(ctx);
  const openFreqs = songStringFreqs();
  const isUke = (Array.isArray(shape) && shape.length === 4) || openFreqs.length === 4 || (typeof b39IsUkuleleContext === 'function' && b39IsUkuleleContext());
  const nStr = isUke ? 4 : 6;
  const stringIndex = nStr - stringNumber;
  if (stringIndex < 0 || stringIndex >= nStr) return;
  let freq = null;
  if (shape && shape[stringIndex] !== undefined && shape[stringIndex] !== 'x' && shape[stringIndex] !== null) {
    const fret = typeof shape[stringIndex] === 'number' ? shape[stringIndex] : parseInt(shape[stringIndex], 10);
    if (Number.isFinite(fret)) freq = openFreqs[stringIndex] * Math.pow(2, fret / 12);
  }
  if (!freq) freq = openFreqs[stringIndex]; // струна заглушена/неизвестна — берём открытую как приближение
  const norm = stringIndex / Math.max(1, nStr - 1);
  const brightness = (isUke ? 0.62 : 0.45) + norm * (isUke ? 0.34 : 0.5);
  const pan = (isUke ? -0.2 : -0.28) + norm * (isUke ? 0.4 : 0.56);
  pluckString(ctx, { freq, startTime, duration, gain: baseGain, pan, brightness, instrument: isUke ? 'ukulele' : 'guitar' });""",
        "pluck-single-string-ukulele",
    )

    src = replace_once(
        src,
        """        if(active && active.instrument==='guitar' && active.id!==state.mainTrackId){
          const own=T.guitarShape(active.id,secId+':'+squareId+':'+eventIndex,c);
          shape=own ? own.shape : resolveFingeringShape(c,key,null);
        } else shape = resolveFingeringShape(c, key, posKey);
      }
    }
    if (active && active.instrument === 'keys') {
      if (window.StruChordAudio) window.StruChordAudio.preview(c, ctx, now, wrapper, key);
    } else {
      if (!shape) shape = resolveFingeringShape(c, key, null);
      b39WithGuitarGain(active ? b39TrackGain(state, active) : 1,
        () => strumChord(ctx, shape, c, key, now, STRUM_RING_SECONDS, 0.22));
    }""",
        """        if(active && (active.instrument==='guitar' || active.instrument==='ukulele') && active.id!==state.mainTrackId){
          const own=T.guitarShape(active.id,secId+':'+squareId+':'+eventIndex,c);
          shape=own ? own.shape : resolveFingeringShape(c,key,null);
        } else shape = resolveFingeringShape(c, key, posKey);
      }
    }
    if (active && active.instrument === 'keys') {
      if (window.StruChordAudio) window.StruChordAudio.preview(c, ctx, now, wrapper, key);
    } else {
      const tid = active ? active.id : null;
      b39WithTrackTuning(tid, () => {
        if (!shape) shape = resolveFingeringShape(c, key, null);
        b39WithGuitarGain(active ? b39TrackGain(state, active) : 1,
          () => strumChord(ctx, shape, c, key, now, STRUM_RING_SECONDS, 0.22), tid);
      });
    }""",
        "play-chord-ukulele",
    )

    # 16. Подорожечный ритм укулеле (хелперы, чтение, бейджи, редактор, 4 стартовых пресета, планировщик)
    src = replace_once(
        src,
        """function rhythmSoundingForEvent(sec, sq, ev, eventIndex) {
  const win = songRhythmRolls && sec && sq
    ? rhythmRollWindowFor(sec.id, sq, eventIndex, songRhythmRolls)
    : null;
  if (win) return win;
  return getSlicedPatternForEvent(sec, sq, ev, eventIndex);
}""",
        """// 0.866 (B-39 Укулеле): подорожечный ритм укулеле хранится в track.patterns
// ('s:<secId>' для секции и '<secId>:<sqId>:<ei>' для ячейки), не конфликтуя с гитарой.
function b39UkeTrackForRhythm() {
  const tr = typeof b39ContextTrack === 'function' ? b39ContextTrack() : null;
  return tr && tr.instrument === 'ukulele' ? tr : null;
}
function b39SectionStrumPattern(sec) {
  const uke = b39UkeTrackForRhythm();
  if (uke) return (uke.patterns && sec && uke.patterns['s:' + sec.id]) || null;
  return (sec && sec.strumPattern) || null;
}
function b39EventOwnStrumPattern(sec, sq, ev, ei) {
  const uke = b39UkeTrackForRhythm();
  if (uke) {
    if (!sec || !sq || ei == null) return null;
    return (uke.patterns && uke.patterns[sec.id + ':' + sq.id + ':' + ei]) || null;
  }
  const rollWinCell = songRhythmRolls && sec && sq ? rhythmRollWindowFor(sec.id, sq, ei, songRhythmRolls) : null;
  return rollWinCell || (ev && ev.strumPattern) || null;
}
function rhythmSoundingForEvent(sec, sq, ev, eventIndex) {
  if (b39UkeTrackForRhythm()) {
    return getSlicedPatternForEvent(sec, sq, ev, eventIndex);
  }
  const win = songRhythmRolls && sec && sq
    ? rhythmRollWindowFor(sec.id, sq, eventIndex, songRhythmRolls)
    : null;
  if (win) return win;
  return getSlicedPatternForEvent(sec, sq, ev, eventIndex);
}""",
        "rhythm-helpers-ukulele",
    )

    src = replace_once(
        src,
        """function getEffectiveStrumPattern(event, sq, sec) {
  if (event && event.strumPattern) return event.strumPattern;
  if (sec && sec.strumPattern) return sec.strumPattern;
  return null;
}

// Возвращает бой/перебор, который реально играет ИМЕННО в границах данной
// ячейки: если паттерн — собственный для ячейки, отдаёт его целиком; если
// унаследован от секции (циклический, на один такт), вырезает из него
// только тот кусок шагов, что приходится на эту конкретную ячейку (а не
// весь такт целиком). Используется для виджета боя внутри тултипа
// аппликатуры — там должен быть виден именно "свой" кусок, а не весь бой
// секции.
function getSlicedPatternForEvent(sec, sq, ev, eventIndex) {
  if (!sec || !sq || !ev) return null;
  const pattern = getEffectiveStrumPattern(ev, sq, sec);
  if (!pattern) return null;
  if (ev.strumPattern) {""",
        """function getEffectiveStrumPattern(event, sq, sec, eventIndex) {
  const uke = b39UkeTrackForRhythm();
  if (uke) {
    if (event && sec && sq && eventIndex != null) {
      const cellPat = uke.patterns && uke.patterns[sec.id + ':' + sq.id + ':' + eventIndex];
      if (cellPat) return cellPat;
    }
    return (uke.patterns && sec && uke.patterns['s:' + sec.id]) || null;
  }
  if (event && event.strumPattern) return event.strumPattern;
  if (sec && sec.strumPattern) return sec.strumPattern;
  return null;
}

// Возвращает бой/перебор, который реально играет ИМЕННО в границах данной
// ячейки: если паттерн — собственный для ячейки, отдаёт его целиком; если
// унаследован от секции (циклический, на один такт), вырезает из него
// только тот кусок шагов, что приходится на эту конкретную ячейку (а не
// весь такт целиком). Используется для виджета боя внутри тултипа
// аппликатуры — там должен быть виден именно "свой" кусок, а не весь бой
// секции.
function getSlicedPatternForEvent(sec, sq, ev, eventIndex) {
  if (!sec || !sq || !ev) return null;
  const uke = b39UkeTrackForRhythm();
  const ownUkePat = uke && uke.patterns ? uke.patterns[sec.id + ':' + sq.id + ':' + eventIndex] : null;
  const pattern = uke ? (ownUkePat || (uke.patterns && uke.patterns['s:' + sec.id]) || null) : getEffectiveStrumPattern(ev, sq, sec);
  if (!pattern) return null;
  if (uke ? !!ownUkePat : !!ev.strumPattern) {""",
        "effective-and-sliced-pattern-uke",
    )

    src = replace_once(
        src,
        """function resolvePickStepStrings(symbol, shape, chordName) {
  const items = normalizePickStep(symbol);
  if (!items.some(isPickBassToken)) return items;
  const { bass, alt } = getBassStringsForShape(shape, chordName);
  const nums = items.map((v) => (v === PICK_BASS_TOKEN ? bass : v === PICK_ALT_BASS_TOKEN ? alt : v));
  return Array.from(new Set(nums));
}""",
        """function resolvePickStepStrings(symbol, shape, chordName) {
  const items = normalizePickStep(symbol);
  const isUke = (Array.isArray(shape) && shape.length === 4) || (typeof b39IsUkuleleContext === 'function' && b39IsUkuleleContext());
  const maxStr = isUke ? 4 : 6;
  if (!items.some(isPickBassToken)) {
    return items.filter((v) => typeof v === 'number' && v >= 1 && v <= maxStr);
  }
  const { bass, alt } = getBassStringsForShape(shape, chordName);
  const nums = items
    .map((v) => (v === PICK_BASS_TOKEN ? bass : v === PICK_ALT_BASS_TOKEN ? alt : v))
    .filter((v) => typeof v === 'number' && v >= 1 && v <= maxStr);
  return Array.from(new Set(nums));
}""",
        "resolve-pick-step-strings-uke",
    )

    src = replace_once(
        src,
        "  const secPat = sec.strumPattern;\n  if (!secPat || !Array.isArray(secPat.steps) || !secPat.steps.length) return null;",
        "  const secPat = b39SectionStrumPattern(sec);\n  if (!secPat || !Array.isArray(secPat.steps) || !secPat.steps.length) return null;",
        "inherited-facade-slice-uke",
    )

    src = replace_once(
        src,
        """    const rollWinCell = songRhythmRolls ? rhythmRollWindowFor(secId, sq, ei, songRhythmRolls) : null;
    const ownPattern = rollWinCell || (ev && ev.strumPattern) || null;""",
        """    const ownPattern = b39EventOwnStrumPattern(sec, sq, ev, ei);""",
        "render-event-strum-previews-uke",
    )

    src = replace_once(
        src,
        """  const rollWinCell = sq && songRhythmRolls ? rhythmRollWindowFor(secId, sq, ei, songRhythmRolls) : null;
  const ownPattern = rollWinCell || (ev && ev.strumPattern) || null;""",
        """  const ownPattern = b39EventOwnStrumPattern(sec, sq, ev, ei);""",
        "restore-event-strum-preview-uke",
    )

    src = replace_once(
        src,
        """  // B-92: тишина — не повод рисовать бейдж (та же проверка, что в render).
  if (!sec || !sec.strumPattern || isSilentPattern(sec.strumPattern)) {
    if (wrap) wrap.remove();
    return;
  }
  if (!wrap) {
    wrap = document.createElement('span');
    wrap.className = 'strum-badge-wrap';
    wrap.onclick = (e) => {
      e.stopPropagation();
      openStrumPatternEditor('section', sec.id);
    };
    badgesDiv.appendChild(wrap);
  }
  wrap.title = 'Бой/перебор секции (по умолчанию для всех её квадратов) — нажмите, чтобы изменить';
  wrap.innerHTML = '';
  const refSq = getReferenceSquareForBadge(sec);
  const { modeBadge, preview } = buildStrumPreviewEls(sec.strumPattern, {""",
        """  // B-92 / 0.866: тишина — не повод рисовать бейдж; на укулеле читаем ритм дорожки.
  const secStrumPat = b39SectionStrumPattern(sec);
  if (!sec || !secStrumPat || isSilentPattern(secStrumPat)) {
    if (wrap) wrap.remove();
    return;
  }
  if (!wrap) {
    wrap = document.createElement('span');
    wrap.className = 'strum-badge-wrap';
    wrap.onclick = (e) => {
      e.stopPropagation();
      openStrumPatternEditor('section', sec.id);
    };
    badgesDiv.appendChild(wrap);
  }
  wrap.title = 'Бой/перебор секции (по умолчанию для всех её квадратов) — нажмите, чтобы изменить';
  wrap.innerHTML = '';
  const refSq = getReferenceSquareForBadge(sec);
  const { modeBadge, preview } = buildStrumPreviewEls(secStrumPat, {""",
        "restore-section-strum-badge-uke",
    )

    src = replace_once(
        src,
        """    if (sec.strumPattern && !isSilentPattern(sec.strumPattern)) {
      const strumWrap = document.createElement('span');
      strumWrap.className = 'strum-badge-wrap';
      strumWrap.title = 'Бой/перебор секции (по умолчанию для всех её квадратов) — нажмите, чтобы изменить';
      strumWrap.onclick = (e) => {
        e.stopPropagation();
        openStrumPatternEditor('section', sec.id);
      };
      const refSq = getReferenceSquareForBadge(sec);
      const { modeBadge, preview } = buildStrumPreviewEls(sec.strumPattern, {""",
        """    const secStrumPatRender = b39SectionStrumPattern(sec);
    if (secStrumPatRender && !isSilentPattern(secStrumPatRender)) {
      const strumWrap = document.createElement('span');
      strumWrap.className = 'strum-badge-wrap';
      strumWrap.title = 'Бой/перебор секции (по умолчанию для всех её квадратов) — нажмите, чтобы изменить';
      strumWrap.onclick = (e) => {
        e.stopPropagation();
        openStrumPatternEditor('section', sec.id);
      };
      const refSq = getReferenceSquareForBadge(sec);
      const { modeBadge, preview } = buildStrumPreviewEls(secStrumPatRender, {""",
        "render-section-strum-badge-uke",
    )

    src = replace_once(
        src,
        """  if (sec.strumPattern && !isSilentPattern(sec.strumPattern)) {
    const wrap = document.createElement('span');
    wrap.className = 'strum-badge-wrap';
    wrap.title = 'Бой/перебор секции (по умолчанию для всех её квадратов) — нажмите, чтобы изменить';
    wrap.onclick = (e) => {
      e.stopPropagation();
      openStrumPatternEditor('section', sec.id);
    };
    const refSq = getReferenceSquareForBadge(sec);
    const { modeBadge, preview } = buildStrumPreviewEls(sec.strumPattern, {""",
        """  const secStrumPatSync = b39SectionStrumPattern(sec);
  if (secStrumPatSync && !isSilentPattern(secStrumPatSync)) {
    const wrap = document.createElement('span');
    wrap.className = 'strum-badge-wrap';
    wrap.title = 'Бой/перебор секции (по умолчанию для всех её квадратов) — нажмите, чтобы изменить';
    wrap.onclick = (e) => {
      e.stopPropagation();
      openStrumPatternEditor('section', sec.id);
    };
    const refSq = getReferenceSquareForBadge(sec);
    const { modeBadge, preview } = buildStrumPreviewEls(secStrumPatSync, {""",
        "sync-section-rhythm-dom-uke",
    )

    # Вибрация струн при переборе (4 или 6 струн)
    src = replace_once(
        src,
        """        if (pattern.mode === 'pick' || (pattern.mode === 'mixed' && (Array.isArray(symbol) || typeof symbol === 'number'))) {
          const visualStrings = resolvePickStepStrings(symbol, shape, chord);
          vibrateFingeringStrings(ctx, visualStrings.map((n) => 6 - n), t, thisStepSeconds, 0);""",
        """        if (pattern.mode === 'pick' || (pattern.mode === 'mixed' && (Array.isArray(symbol) || typeof symbol === 'number'))) {
          const visualStrings = resolvePickStepStrings(symbol, shape, chord);
          const nVibStr = (Array.isArray(shape) && shape.length === 4) || (typeof b39IsUkuleleContext === 'function' && b39IsUkuleleContext()) ? 4 : 6;
          vibrateFingeringStrings(ctx, visualStrings.map((n) => nVibStr - n), t, thisStepSeconds, 0);""",
        "vibrate-fingering-strings-nstr",
    )

    # Планировщик scheduleNextEvent: главная и вторичные укулеле дорожки со своим ритмом, тембром и строем
    src = replace_once(
        src,
        """    const rollWin = songRhythmRolls
      ? rhythmRollWindowFor(next.section.id, next.square, next.eventIndex, songRhythmRolls)
      : null;
    const ownEventPattern = rollWin || next.event.strumPattern || null;
    const inheritedPattern = getEffectiveStrumPattern(null, next.square, next.section);
    const strumPattern = ownEventPattern || inheritedPattern;
    // 0.804 (B-120): в режиме Ленты карточки редактора скрыты — не тратим
    // ~50 мс на пересборку скрытых превью боя в секции и ячейке на каждом аккорде.
    if (!timelineMode) schedulePlaybackVisualAt(ctx, evStart, () => {
      if (!playbackState.isPlaying) return;
      setSectionLiveStrumBadge(next.section, strumPattern);
      setEventLiveStrumPreview(next.section.id, next.square.id, next.eventIndex, strumPattern, next.section.strumPattern || null);
    });
    currentPlayingStrumPattern = strumPattern;
    // B-12.5.3: какое звучание аккомпанемента звучит на этой позиции —
    // точки автоматизации тембра перекрывают исходное звучание канала.
    songSoundNow = songSoundAtEvent(next.section, next.square, next.eventIndex);
    // Главная дорожка хранит аккорд в ev.chord; клавиши уже запланированы выше.
    const trackState = window.StruChordTracks ? window.StruChordTracks.state() : null;
    const mainTrack = trackState && trackState.tracks.find(t => t.id === trackState.mainTrackId);
    const mainHasRecordedNotes = Array.isArray(next.event.notes) && next.event.notes.length;
    const mainUsesGuitarPattern = (!trackState || (mainTrack && mainTrack.instrument === 'guitar'))
      && !mainHasRecordedNotes;
    if (mainUsesGuitarPattern) {
      scheduleRhythmVisual(next.event.chord, posCtx, strumPattern, !!ownEventPattern);
    }
    const mainGain = !trackState ? 1 : (mainTrack && mainTrack.instrument === 'guitar' ? b39TrackGain(trackState, mainTrack) : 0);
    if (mainGain > 0) b39WithTrackTuning(mainTrack ? mainTrack.id : null, () => b39WithGuitarGain(mainGain, () => {
      // 0.838: id дорожки — чтобы голос играл через её узел громкости.
      if (mainHasRecordedNotes) {
        scheduleAccompNotes(next.event.notes, evStart, bpm, ts, next.event.chord, effectiveKey);
      } else if (strumPattern) {
        timelinePassHint = tlPass;
        schedulePatternForEvent(next.event.chord, evStart, dur, posCtx, strumPattern, bpm, ts,
          next.square, next.eventIndex, next.event.span || 1, !!ownEventPattern, next.section,
          { audio: true, visuals: false });
      } else {
        playChordScheduled(next.event.chord, evStart, dur, posCtx);
      }
    }, mainTrack ? mainTrack.id : null));
    globalKey = oldKey;
  } else if (!timelineMode) {
    // Пауза (в ячейке нет аккорда) — сбрасываем визуальные маркеры в момент,
    // когда началась слышимая пауза.
    schedulePlaybackVisualAt(ctx, evStart, () => {
      if (playbackState.isPlaying) clearAllLiveStrumIndicators();
    });
  }

  // Другие гитары могут иметь собственный аккорд даже при пустой главной.
  if (window.StruChordTracks) {
    const T = window.StruChordTracks, state = T.state();
    const cell = T.cellKey(next.section, next.square, next.eventIndex);
    const key = next.section.key || globalKey;
    const pos = { secId: next.section.id, squareId: next.square.id, eventIndex: next.eventIndex, key };
    const roll = songRhythmRolls ? rhythmRollWindowFor(next.section.id, next.square, next.eventIndex, songRhythmRolls) : null;
    const own = roll || next.event.strumPattern || null;
    const pattern = own || getEffectiveStrumPattern(null, next.square, next.section);
    state.tracks.forEach(track => {
      if (track.id === state.mainTrackId || track.instrument !== 'guitar') return;
      const recNotes = typeof T.recordedNotes === 'function' ? T.recordedNotes(track.id, cell) : null;
      const chord = T.trackChord(track.id, cell, next.event);
      const trackPos = { ...pos, trackId: track.id };
      if (chord && !(recNotes && recNotes.length)) {
        scheduleRhythmVisual(chord, trackPos, pattern, !!own);
      }
      const gain = b39TrackGain(state, track);
      if ((!chord && !(recNotes && recNotes.length)) || gain <= 0) return;
      b39WithTrackTuning(track.id, () => b39WithGuitarGain(gain, () => {
        if (recNotes && recNotes.length) {
          scheduleAccompNotes(recNotes, evStart, bpm, ts, chord || '', key);
        } else if (pattern) {
          timelinePassHint = tlPass;
          schedulePatternForEvent(chord, evStart, dur, trackPos, pattern, bpm, ts,
            next.square, next.eventIndex, next.event.span || 1, !!own, next.section,
            { audio: true, visuals: false });
        } else {
          playChordScheduled(chord, evStart, dur, trackPos);
        }
      }, track.id));
    });
  }""",
        """    const trackState = window.StruChordTracks ? window.StruChordTracks.state() : null;
    const mainTrack = trackState && trackState.tracks.find(t => t.id === trackState.mainTrackId);
    const activeTrack = trackState && trackState.tracks.find(t => t.id === trackState.activeTrackId);
    const mainIsString = !trackState || (mainTrack && (mainTrack.instrument === 'guitar' || mainTrack.instrument === 'ukulele'));
    const mainRhythm = b39WithTrackTuning(mainTrack ? mainTrack.id : null, () => {
      const ownP = b39EventOwnStrumPattern(next.section, next.square, next.event, next.eventIndex);
      const inhP = getEffectiveStrumPattern(null, next.square, next.section);
      return { own: ownP, pat: ownP || inhP };
    });
    const activeRhythm = b39WithTrackTuning(activeTrack ? activeTrack.id : null, () => {
      const ownP = b39EventOwnStrumPattern(next.section, next.square, next.event, next.eventIndex);
      const inhP = getEffectiveStrumPattern(null, next.square, next.section);
      const secDef = b39SectionStrumPattern(next.section);
      return { own: ownP, pat: ownP || inhP, secDef };
    });
    // 0.804 (B-120) / 0.866: в редакторе подсвечиваем ритм активной струнной дорожки.
    if (!timelineMode) schedulePlaybackVisualAt(ctx, evStart, () => {
      if (!playbackState.isPlaying) return;
      setSectionLiveStrumBadge(next.section, activeRhythm.pat);
      setEventLiveStrumPreview(next.section.id, next.square.id, next.eventIndex, activeRhythm.pat, activeRhythm.secDef || null);
    });
    currentPlayingStrumPattern = activeRhythm.pat;
    // B-12.5.3: какое звучание аккомпанемента звучит на этой позиции —
    // точки автоматизации тембра перекрывают исходное звучание канала.
    songSoundNow = songSoundAtEvent(next.section, next.square, next.eventIndex);
    // Главная дорожка хранит аккорд в ev.chord; клавиши уже запланированы выше.
    const mainHasRecordedNotes = mainTrack && mainTrack.instrument === 'guitar' && Array.isArray(next.event.notes) && next.event.notes.length;
    const mainUsesStringPattern = mainIsString && !mainHasRecordedNotes;
    if (mainUsesStringPattern && (!activeTrack || activeTrack.id === (mainTrack && mainTrack.id))) {
      b39WithTrackTuning(mainTrack ? mainTrack.id : null, () => {
        scheduleRhythmVisual(next.event.chord, posCtx, mainRhythm.pat, !!mainRhythm.own);
      });
    }
    const mainGain = !trackState ? 1 : (mainTrack && (mainTrack.instrument === 'guitar' || mainTrack.instrument === 'ukulele') ? b39TrackGain(trackState, mainTrack) : 0);
    if (mainGain > 0) b39WithTrackTuning(mainTrack ? mainTrack.id : null, () => b39WithGuitarGain(mainGain, () => {
      // 0.838: id дорожки — чтобы голос играл через её узел громкости.
      if (mainHasRecordedNotes) {
        scheduleAccompNotes(next.event.notes, evStart, bpm, ts, next.event.chord, effectiveKey);
      } else if (mainRhythm.pat) {
        timelinePassHint = tlPass;
        schedulePatternForEvent(next.event.chord, evStart, dur, posCtx, mainRhythm.pat, bpm, ts,
          next.square, next.eventIndex, next.event.span || 1, !!mainRhythm.own, next.section,
          { audio: true, visuals: false });
      } else {
        playChordScheduled(next.event.chord, evStart, dur, posCtx);
      }
    }, mainTrack ? mainTrack.id : null));
    globalKey = oldKey;
  } else if (!timelineMode) {
    // Пауза (в ячейке нет аккорда) — сбрасываем визуальные маркеры в момент,
    // когда началась слышимая пауза.
    schedulePlaybackVisualAt(ctx, evStart, () => {
      if (playbackState.isPlaying) clearAllLiveStrumIndicators();
    });
  }

  // Другие гитары и укулеле могут иметь собственный аккорд и свой ритм даже при пустой главной.
  if (window.StruChordTracks) {
    const T = window.StruChordTracks, state = T.state();
    const cell = T.cellKey(next.section, next.square, next.eventIndex);
    const key = next.section.key || globalKey;
    const pos = { secId: next.section.id, squareId: next.square.id, eventIndex: next.eventIndex, key };
    state.tracks.forEach(track => {
      if (track.id === state.mainTrackId || (track.instrument !== 'guitar' && track.instrument !== 'ukulele')) return;
      const recNotes = track.instrument === 'guitar' && typeof T.recordedNotes === 'function' ? T.recordedNotes(track.id, cell) : null;
      const chord = T.trackChord(track.id, cell, next.event);
      const trackPos = { ...pos, trackId: track.id };
      b39WithTrackTuning(track.id, () => {
        const own = b39EventOwnStrumPattern(next.section, next.square, next.event, next.eventIndex);
        const pattern = own || getEffectiveStrumPattern(null, next.square, next.section);
        if (chord && !(recNotes && recNotes.length) && (track.id === state.activeTrackId || !rhythmVisualScheduled)) {
          scheduleRhythmVisual(chord, trackPos, pattern, !!own);
        }
        const gain = b39TrackGain(state, track);
        if ((!chord && !(recNotes && recNotes.length)) || gain <= 0) return;
        b39WithGuitarGain(gain, () => {
          if (recNotes && recNotes.length) {
            scheduleAccompNotes(recNotes, evStart, bpm, ts, chord || '', key);
          } else if (pattern) {
            timelinePassHint = tlPass;
            schedulePatternForEvent(chord, evStart, dur, trackPos, pattern, bpm, ts,
              next.square, next.eventIndex, next.event.span || 1, !!own, next.section,
              { audio: true, visuals: false });
          } else {
            playChordScheduled(chord, evStart, dur, trackPos);
          }
        }, track.id);
      });
    });
  }""",
        "schedule-next-event-ukulele",
    )

    # 17. STRUM_PRESETS: тегирование гитарных переборов + 4 стартовых пресета укулеле (4, 3, 2, 1)
    src = replace_once(
        src,
        """  {
    id: 'pick-four',
    name: 'Четвёрка',
    hint: 'Ой-ё-ри-я-ри-ё',
    mode: 'pick',
    base: 4,
    subdivision: 1,
    steps: [['B'], [3], [1, 2], [3]],
  },
  {
    id: 'pick-six',
    name: 'Шестёрка',
    hint: 'С причала рыбачил апостол Андрей',
    mode: 'pick',
    base: 3,
    subdivision: 2,
    steps: [['B'], [3], [2], [1], [2], [3]],
  },
  {
    id: 'pick-eight',
    name: 'Восьмёрка',
    hint: 'Звонкой пеленой наполнил небо...',
    mode: 'pick',
    base: 4,
    subdivision: 2,
    steps: [['B'], [3], [2], [3], [1], [3], [2], [3]],
  },
  {
    id: 'pick-bass-chord',
    name: 'Романс',
    hint: 'Как здорово, что все мы здесь...',
    mode: 'pick',
    // 0.257: вальсовая метрика 3/4 (правка пользователя) — «Как здорово…»
    // трёхдольная; было base 2 / sub 3 (6/8-триольная развёртка).
    base: 3,
    subdivision: 2,
    steps: [['B'], [1, 2, 3], [1, 2, 3], ['A'], [1, 2, 3], [1, 2, 3]],
  },
];""",
        """  {
    id: 'pick-four',
    name: 'Четвёрка',
    hint: 'Ой-ё-ри-я-ри-ё',
    mode: 'pick',
    instruments: ['guitar'],
    base: 4,
    subdivision: 1,
    steps: [['B'], [3], [1, 2], [3]],
  },
  {
    id: 'pick-six',
    name: 'Шестёрка',
    hint: 'С причала рыбачил апостол Андрей',
    mode: 'pick',
    instruments: ['guitar'],
    base: 3,
    subdivision: 2,
    steps: [['B'], [3], [2], [1], [2], [3]],
  },
  {
    id: 'pick-eight',
    name: 'Восьмёрка',
    hint: 'Звонкой пеленой наполнил небо...',
    mode: 'pick',
    instruments: ['guitar'],
    base: 4,
    subdivision: 2,
    steps: [['B'], [3], [2], [3], [1], [3], [2], [3]],
  },
  {
    id: 'pick-bass-chord',
    name: 'Романс',
    hint: 'Как здорово, что все мы здесь...',
    mode: 'pick',
    instruments: ['guitar'],
    // 0.257: вальсовая метрика 3/4 (правка пользователя) — «Как здорово…»
    // трёхдольная; было base 2 / sub 3 (6/8-триольная развёртка).
    base: 3,
    subdivision: 2,
    steps: [['B'], [1, 2, 3], [1, 2, 3], ['A'], [1, 2, 3], [1, 2, 3]],
  },
  // 0.866 (B-39 Укулеле): 4 стартовых пресета перебора на 4 струнах (явные струны 4, 3, 2, 1).
  {
    id: 'uke-pick-four',
    name: 'Четвёрка',
    hint: 'Классический перебор на 4 струнах: 4 — 3 — (2+1) — 3',
    mode: 'pick',
    instruments: ['ukulele'],
    base: 4,
    subdivision: 1,
    steps: [[4], [3], [1, 2], [3]],
  },
  {
    id: 'uke-pick-six',
    name: 'Шестёрка 3/4',
    hint: 'Плавный арпеджио-перебор для размера 3/4: 4 — 3 — 2 — 1 — 2 — 3',
    mode: 'pick',
    instruments: ['ukulele'],
    base: 3,
    subdivision: 2,
    steps: [[4], [3], [2], [1], [2], [3]],
  },
  {
    id: 'uke-pick-eight',
    name: 'Восьмёрка',
    hint: 'Ровный перебор восьмыми: 4 — 3 — 2 — 3 — 1 — 3 — 2 — 3',
    mode: 'pick',
    instruments: ['ukulele'],
    base: 4,
    subdivision: 2,
    steps: [[4], [3], [2], [3], [1], [3], [2], [3]],
  },
  {
    id: 'uke-pick-bass-chord',
    name: 'Бас-щипок',
    hint: 'Чередование 4-й и 3-й струны с щипком аккорда (1+2+3)',
    mode: 'pick',
    instruments: ['ukulele'],
    base: 4,
    subdivision: 1,
    steps: [[4], [1, 2, 3], [3], [1, 2, 3]],
  },
];""",
        "strum-presets-ukulele",
    )

    # collectSongPatterns: на укулеле собираем из track.patterns
    src = replace_once(
        src,
        """function collectSongPatterns() {
  const found = [];""",
        """function collectSongPatterns() {
  const found = [];
  const ukeTrackForCollect = b39UkeTrackForRhythm();""",
        "collect-song-patterns-uke-header",
    )

    src = replace_once(
        src,
        """  (sections || []).forEach((sec) => {
    const secName = sec.type === 'Custom' ? sec.customName || 'Custom' : LABEL_RU[sec.type] || sec.type;
    add(sec.strumPattern, secName);
    (sec.squares || []).forEach((sq, sqi) => {
      (sq.events || []).forEach((ev, ei) => {
        const chord = ev.chord && ev.chord.trim();
        // Волна-4: рисунок ячейки — окно на рулон (кэша нет), иначе
        // легаси-вкрапление.
        const winP = songRhythmRolls ? rhythmRollWindowFor(sec.id, sq, ei, songRhythmRolls) : null;
        add(winP || ev.strumPattern, chord ? `${secName} · ${chord}` : secName);
      });
    });
  });""",
        """  (sections || []).forEach((sec) => {
    const secName = sec.type === 'Custom' ? sec.customName || 'Custom' : LABEL_RU[sec.type] || sec.type;
    if (ukeTrackForCollect) {
      add(ukeTrackForCollect.patterns && ukeTrackForCollect.patterns['s:' + sec.id], secName);
      (sec.squares || []).forEach((sq, sqi) => {
        (sq.events || []).forEach((ev, ei) => {
          const chord = ev.chord && ev.chord.trim();
          const cPat = ukeTrackForCollect.patterns && ukeTrackForCollect.patterns[sec.id + ':' + sq.id + ':' + ei];
          add(cPat, chord ? `${secName} · ${chord}` : secName);
        });
      });
      return;
    }
    add(sec.strumPattern, secName);
    (sec.squares || []).forEach((sq, sqi) => {
      (sq.events || []).forEach((ev, ei) => {
        const chord = ev.chord && ev.chord.trim();
        // Волна-4: рисунок ячейки — окно на рулон (кэша нет), иначе
        // легаси-вкрапление.
        const winP = songRhythmRolls ? rhythmRollWindowFor(sec.id, sq, ei, songRhythmRolls) : null;
        add(winP || ev.strumPattern, chord ? `${secName} · ${chord}` : secName);
      });
    });
  });""",
        "collect-song-patterns-uke-body",
    )

    # getBassStringsForShape: на укулеле токен «Б» выбирает самую низкую звучащую ноту по MIDI!
    src = replace_once(
        src,
        """function getBassStringsForShape(shape, chordName) {
  let bass = null;
  if (Array.isArray(shape)) {
    for (let idx = 0; idx < shape.length; idx++) {
      const v = shape[idx];
      if (v === 'x' || v === null || v === undefined) continue;
      const fret = typeof v === 'number' ? v : parseInt(v, 10);
      if (!Number.isFinite(fret)) continue;
      bass = 6 - idx;
      break;
    }
  }
  if (!bass) {
    const root = (String(chordName || '').trim().match(/^[A-Ha-h][#b]?/) || ['E'])[0].toUpperCase().replace('H', 'B');
    const byRoot = { E: 6, F: 6, 'F#': 6, Gb: 6, G: 6, 'G#': 6, Ab: 6, A: 5, 'A#': 5, Bb: 5, B: 5, C: 5, 'C#': 4, Db: 4, D: 4, 'D#': 4, Eb: 4 };
    bass = byRoot[root] || 6;
  }
  bass = Math.min(6, Math.max(3, bass));
  const alt = bass >= 5 ? 4 : bass === 4 ? 5 : 4;
  return { bass, alt };
}""",
        """function getBassStringsForShape(shape, chordName) {
  const isUke = (Array.isArray(shape) && shape.length === 4) || (typeof b39IsUkuleleContext === 'function' && b39IsUkuleleContext());
  if (isUke) {
    // 0.866 (B-39 Укулеле): токен «Б» берёт самую низкую по высоте (MIDI) звучащую струну аккорда.
    // В High G для C=[0,0,0,3] это 3-я струна (C4=60 < G4=67), в Low G и Баритоне — 4-я струна.
    const openNotes = b39GuitarTuningNotes();
    const sounding = [];
    const arr = Array.isArray(shape) && shape.length === 4 ? shape : [0, 0, 0, 0];
    for (let idx = 0; idx < 4; idx++) {
      const v = arr[idx];
      if (v === 'x' || v === null || v === undefined) continue;
      const fret = typeof v === 'number' ? v : parseInt(v, 10);
      if (!Number.isFinite(fret)) continue;
      const openMidi = openNotes[idx] ? tunerNoteToMidi(openNotes[idx]) : null;
      if (openMidi === null) continue;
      sounding.push({ stringNum: 4 - idx, midi: openMidi + fret });
    }
    if (sounding.length) {
      sounding.sort((a, b) => a.midi - b.midi || b.stringNum - a.stringNum);
      const bass = sounding[0].stringNum;
      const alt = sounding.length > 1 ? sounding[1].stringNum : (bass === 4 ? 3 : 4);
      return { bass, alt };
    }
    return { bass: 3, alt: 4 };
  }
  let bass = null;
  if (Array.isArray(shape)) {
    for (let idx = 0; idx < shape.length; idx++) {
      const v = shape[idx];
      if (v === 'x' || v === null || v === undefined) continue;
      const fret = typeof v === 'number' ? v : parseInt(v, 10);
      if (!Number.isFinite(fret)) continue;
      bass = 6 - idx;
      break;
    }
  }
  if (!bass) {
    const root = (String(chordName || '').trim().match(/^[A-Ha-h][#b]?/) || ['E'])[0].toUpperCase().replace('H', 'B');
    const byRoot = { E: 6, F: 6, 'F#': 6, Gb: 6, G: 6, 'G#': 6, Ab: 6, A: 5, 'A#': 5, Bb: 5, B: 5, C: 5, 'C#': 4, Db: 4, D: 4, 'D#': 4, Eb: 4 };
    bass = byRoot[root] || 6;
  }
  bass = Math.min(6, Math.max(3, bass));
  const alt = bass >= 5 ? 4 : bass === 4 ? 5 : 4;
  return { bass, alt };
}""",
        "get-bass-strings-ukulele",
    )

    # isPresetCompatible: фильтрация пресетов по текущему инструменту (guitar vs ukulele)
    src = replace_once(
        src,
        """function isPresetCompatible(preset, ts, gridUnits) {
  const base = preset && preset.base;
  if (!gridUnits || !base || gridUnits % base !== 0) return false;""",
        """function isPresetCompatible(preset, ts, gridUnits) {
  const base = preset && preset.base;
  if (!gridUnits || !base || gridUnits % base !== 0) return false;
  if (Array.isArray(preset.instruments)) {
    const curInst = (typeof b39IsUkuleleContext === 'function' && b39IsUkuleleContext()) ? 'ukulele' : 'guitar';
    if (!preset.instruments.includes(curInst)) return false;
  }""",
        "is-preset-compatible-instrument",
    )

    # openStrumPatternEditor: чтение/сохранение/сброс для укулеле + 4-струнный поповер выбора струн
    src = replace_once(
        src,
        """  // Волна-4: «свой» рисунок ячейки читаем окном на рулон (кэша нет);
  // встроенный байт — легаси-вкрапление (выливка при смене размера).
  const ownEventWin = scope === 'event' && songRhythmRolls
    ? rhythmRollWindowFor(sectionId, sq, eventIndex, songRhythmRolls)
    : null;
  const ownExisting = scope === 'event' ? (ownEventWin || evt.strumPattern) : sec.strumPattern;
  const inherited =
    scope === 'event' ? getEffectiveStrumPattern(null, sq, sec) : null;""",
        """  const ukeTrackEditor = b39UkeTrackForRhythm();
  // Волна-4 / 0.866: для укулеле читаем подорожечный ритм из track.patterns.
  const ownEventWin = !ukeTrackEditor && scope === 'event' && songRhythmRolls
    ? rhythmRollWindowFor(sectionId, sq, eventIndex, songRhythmRolls)
    : null;
  const ownExisting = ukeTrackEditor
    ? (scope === 'event'
      ? (ukeTrackEditor.patterns && ukeTrackEditor.patterns[sectionId + ':' + squareId + ':' + eventIndex]) || null
      : (ukeTrackEditor.patterns && ukeTrackEditor.patterns['s:' + sectionId]) || null)
    : (scope === 'event' ? (ownEventWin || evt.strumPattern) : sec.strumPattern);
  const inherited =
    scope === 'event' ? getEffectiveStrumPattern(null, sq, sec) : null;""",
        "strum-editor-read-uke",
    )

    src = replace_once(
        src,
        """    for (let num = 6; num >= 1; num--) {
      options.push({
        value: num,
        title: num === 6 ? 'Самая толстая (низкая E)' : num === 1 ? 'Самая тонкая (высокая e)' : `Струна ${num}`,
      });
    }""",
        """    const maxPickStr = ukeTrackEditor ? 4 : 6;
    for (let num = maxPickStr; num >= 1; num--) {
      options.push({
        value: num,
        title: ukeTrackEditor
          ? (num === 4 ? '4-я струна (верхняя)' : num === 1 ? '1-я струна (нижняя)' : `Струна ${num}`)
          : (num === 6 ? 'Самая толстая (низкая E)' : num === 1 ? 'Самая тонкая (высокая e)' : `Струна ${num}`),
      });
    }""",
        "strum-editor-pick-popover-4str",
    )

    src = replace_once(
        src,
        "  const editedOwnPattern = scope === 'event' ? evt.strumPattern : sec.strumPattern;",
        "  const editedOwnPattern = ownExisting;",
        "strum-editor-edited-own-pattern",
    )

    src = replace_once(
        src,
        """    if (scope === 'section') {
      // B-92: адресаты правки. Без allScope — только эта секция
      // (прежнее поведение). 'type' — все секции того же типа,
      // 'all' — вся песня.
      const targets =
        allScope === 'all'
          ? sections.slice()
          : allScope === 'type'
            ? sections.filter((s) => s.type === sec.type &&
                (s.type !== 'Custom' || (s.customName || '') === (sec.customName || '')))
            : [sec];
      targets.forEach((target) => {
        // Каждой секции — СВОЯ копия: общий объект связал бы их правки
        // между собой (правка одной меняла бы остальные).
        const copy = JSON.parse(JSON.stringify(saved));
        target.strumPattern = copy;
        // Волна-4: только секционный рулон — пула ячеек эта правка не
        // касается (волны-2/3 дропали пул целиком, спасал кэш ячеек).
        setSectionRhythmRoll(target, copy);
        // Волна-7: пины, совпавшие с НОВЫМ боем секции, сдаются — ячейки
        // снова наследуют секцию (звук не меняется на месте).
        demoteMatchingCellRhythmsInSection(target);
      });
      savedToCount = targets.length;
    } else {
      // Ячейка: хирургия по своей полосе общего рулона или форк в
      // приватный (см. saveEventPatternToRhythmRoll).
      saveEventPatternToRhythmRoll(sec, sq, evt, sectionId, squareId, eventIndex, saved, subSave);
      // Волна-7: окна, совпавшие с боем секции, пинов не носят — сверяем
      // весь квадрат (правка общего рулона могла совпасть и у соседей).
      demoteMatchingCellRhythms(sec, sq);
    }""",
        """    if (ukeTrackEditor && window.StruChordTracks) {
      // 0.866: сохраняем ритм в дорожку укулеле через songStore (Undo/Redo).
      if (scope === 'section') {
        const targets =
          allScope === 'all'
            ? sections.slice()
            : allScope === 'type'
              ? sections.filter((s) => s.type === sec.type &&
                  (s.type !== 'Custom' || (s.customName || '') === (sec.customName || '')))
              : [sec];
        targets.forEach((target) => {
          window.StruChordTracks.setPattern(ukeTrackEditor.id, 's:' + target.id, JSON.parse(JSON.stringify(saved)));
        });
        savedToCount = targets.length;
      } else {
        const secPat = window.StruChordTracks.patternFor(ukeTrackEditor.id, 's:' + sectionId);
        const cellKey = sectionId + ':' + squareId + ':' + eventIndex;
        if (secPat && patternsEqual(saved, secPat)) {
          window.StruChordTracks.clearPattern(ukeTrackEditor.id, cellKey);
        } else {
          window.StruChordTracks.setPattern(ukeTrackEditor.id, cellKey, saved);
        }
      }
    } else if (scope === 'section') {
      // B-92: адресаты правки. Без allScope — только эта секция
      // (прежнее поведение). 'type' — все секции того же типа,
      // 'all' — вся песня.
      const targets =
        allScope === 'all'
          ? sections.slice()
          : allScope === 'type'
            ? sections.filter((s) => s.type === sec.type &&
                (s.type !== 'Custom' || (s.customName || '') === (sec.customName || '')))
            : [sec];
      targets.forEach((target) => {
        // Каждой секции — СВОЯ копия: общий объект связал бы их правки
        // между собой (правка одной меняла бы остальные).
        const copy = JSON.parse(JSON.stringify(saved));
        target.strumPattern = copy;
        // Волна-4: только секционный рулон — пула ячеек эта правка не
        // касается (волны-2/3 дропали пул целиком, спасал кэш ячеек).
        setSectionRhythmRoll(target, copy);
        // Волна-7: пины, совпавшие с НОВЫМ боем секции, сдаются — ячейки
        // снова наследуют секцию (звук не меняется на месте).
        demoteMatchingCellRhythmsInSection(target);
      });
      savedToCount = targets.length;
    } else {
      // Ячейка: хирургия по своей полосе общего рулона или форк в
      // приватный (см. saveEventPatternToRhythmRoll).
      saveEventPatternToRhythmRoll(sec, sq, evt, sectionId, squareId, eventIndex, saved, subSave);
      // Волна-7: окна, совпавшие с боем секции, пинов не носят — сверяем
      // весь квадрат (правка общего рулона могла совпасть и у соседей).
      demoteMatchingCellRhythms(sec, sq);
    }""",
        "strum-editor-save-uke",
    )

    src = replace_once(
        src,
        """  modal.querySelector('#reset-pattern').onclick = () => {
    if (scope === 'section') {
      sec.strumPattern = null;""",
        """  modal.querySelector('#reset-pattern').onclick = () => {
    if (ukeTrackEditor && window.StruChordTracks) {
      const clearKey = scope === 'section' ? ('s:' + sectionId) : (sectionId + ':' + squareId + ':' + eventIndex);
      window.StruChordTracks.clearPattern(ukeTrackEditor.id, clearKey);
    } else if (scope === 'section') {
      sec.strumPattern = null;""",
        "strum-editor-reset-uke",
    )

    # 18. PART_INSTRUMENTS, partTuningNotes, ALLOWED_PART_INSTRUMENTS
    src = replace_once(
        src,
        """const PART_INSTRUMENTS = {
  guitar: { strings: 6, label: 'Гитара' },
  bass: { strings: 4, label: 'Бас' },""",
        """const PART_INSTRUMENTS = {
  guitar: { strings: 6, label: 'Гитара' },
  ukulele: { strings: 4, label: 'Укулеле' }, // 0.866 (B-39 Укулеле)
  bass: { strings: 4, label: 'Бас' },""",
        "part-instruments-ukulele",
    )

    src = replace_once(
        src,
        """  if (inst === 'bass') {
    return songTuningNotes()
      .slice(0, PART_INSTRUMENTS.bass.strings)
      .map((note) => bassOctaveDown(note));
  }
  if (inst !== 'guitar') return TUNER_TUNINGS.find((t) => t.id === 'e-std').notes.slice();""",
        """  if (inst === 'ukulele') return ['G4', 'C4', 'E4', 'A4'];
  if (inst === 'bass') {
    return songTuningNotes()
      .slice(0, PART_INSTRUMENTS.bass.strings)
      .map((note) => bassOctaveDown(note));
  }
  if (inst !== 'guitar') return TUNER_TUNINGS.find((t) => t.id === 'e-std').notes.slice();""",
        "part-tuning-notes-ukulele",
    )

    # 19. Первый выбор инструмента / настройки по умолчанию
    src = replace_once(
        src,
        """  function defaultInstrument() {
    try { const value = localStorage.getItem(DEFAULT_INSTRUMENT_KEY); if (value === 'guitar' || value === 'keys') return value; } catch (e) {}
    return sessionInstrument;
  }""",
        """  function defaultInstrument() {
    try { const value = localStorage.getItem(DEFAULT_INSTRUMENT_KEY); if (value === 'guitar' || value === 'keys' || value === 'ukulele') return value; } catch (e) {}
    return sessionInstrument;
  }""",
        "default-instrument-ukulele",
    )

    src = replace_once(
        src,
        "      button.disabled = id === 'ukulele' || id === 'bass';",
        "      button.disabled = id === 'bass';",
        "enable-ukulele-choice",
    )

    # 20. Санитайзер песни (ALLOWED_PART_INSTRUMENTS, 4-струнные аппликатуры и userFingerings укулеле)
    src = replace_once(
        src,
        "  const ALLOWED_PART_INSTRUMENTS = new Set(['guitar', 'bass', 'drums', 'keys', 'vocal', 'other']);",
        "  const ALLOWED_PART_INSTRUMENTS = new Set(['guitar', 'ukulele', 'bass', 'drums', 'keys', 'vocal', 'other']);",
        "allowed-part-instruments-ukulele",
    )

    src = replace_once(
        src,
        """  function asSafeFingering(value) {
    if (typeof value !== 'string') return null;
    const parts = value.split(',');
    if (parts.length !== 6) return null;
    for (const raw of parts) {
      const v = raw.trim();
      if (v === 'x') continue;
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0 || n > 24) return null;
    }
    return parts.map((v) => v.trim()).join(',');
  }""",
        """  function asSafeFingering(value, isUkeTuning) {
    if (typeof value !== 'string') return null;
    const parts = value.split(',');
    const expectedLen = isUkeTuning ? 4 : 6;
    const maxF = isUkeTuning ? 15 : 24;
    if (parts.length !== expectedLen) return null;
    for (const raw of parts) {
      const v = raw.trim();
      if (v === 'x') continue;
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0 || n > maxF) return null;
    }
    return parts.map((v) => v.trim()).join(',');
  }""",
        "as-safe-fingering-uke",
    )

    src = replace_once(
        src,
        """  function cloneSafeShape(shape) {
    if (!Array.isArray(shape) || shape.length !== 6) return null;
    const out = [];
    for (const value of shape) {
      if (value === 'x') out.push('x');
      else {
        const fret = Number(value);
        if (!Number.isInteger(fret) || fret < 0 || fret > 16) return null;
        out.push(fret);
      }
    }
    return out;
  }""",
        """  function cloneSafeShape(shape, isUke) {
    const expectedLen = isUke ? 4 : 6;
    const maxF = isUke ? 15 : 16;
    if (!Array.isArray(shape) || shape.length !== expectedLen) return null;
    const out = [];
    for (const value of shape) {
      if (value === 'x') out.push('x');
      else {
        const fret = Number(value);
        if (!Number.isInteger(fret) || fret < 0 || fret > maxF) return null;
        out.push(fret);
      }
    }
    return out;
  }""",
        "clone-safe-shape-uke",
    )

    src = replace_once(
        src,
        """            fingering: asSafeFingering(rawEvent.fingering),
            // Подпись строя — служебная строка вида «@D2A2D3G3B3E4».
            // Всё, что не похоже, отбрасываем.
            fingeringTuning:
              typeof rawEvent.fingeringTuning === 'string' &&
              /^@([A-G][#b]?-?\\d){6}$/.test(rawEvent.fingeringTuning)
                ? rawEvent.fingeringTuning
                : null,
            // B-74: разжатое баррэ. Старые файлы поля не имеют → null →
            // баррэ авто. Чистим так же строго, как остальное.
            barreOff: asSafeBarreOff(rawEvent.barreOff),
            // B-41: кастомные пальцы. Старые файлы поля не имеют → null →
            // расчёт на лету.
            fingers: asSafeFingers(rawEvent.fingers),""",
        """            ...(() => {
              const rawFt = typeof rawEvent.fingeringTuning === 'string' ? rawEvent.fingeringTuning : null;
              const isUkeFt = !!(rawFt && /^@uke:(high-g|low-g|baritone|canadian)$/.test(rawFt));
              const validFt = isUkeFt || (rawFt && /^@([A-G][#b]?-?\\d){6}$/.test(rawFt)) ? rawFt : null;
              return {
                fingering: asSafeFingering(rawEvent.fingering, isUkeFt),
                fingeringTuning: validFt,
                barreOff: asSafeBarreOff(rawEvent.barreOff),
                fingers: asSafeFingers(rawEvent.fingers, isUkeFt ? 4 : 6),
              };
            })(),""",
        "sanitize-event-fingering-uke",
    )

    src = replace_once(
        src,
        """        const shapes = entry[1]
          .slice(0, 100)
          .map((raw) => {
            if (Array.isArray(raw)) {
              const s = cloneSafeShape(raw);
              return s ? { shape: s, barreOff: null } : null;
            }
            if (raw && typeof raw === 'object') {
              const s = cloneSafeShape(raw.shape);
              if (!s) return null;
              const res = {
                shape: s,
                barreOff: asSafeBarreOff(raw.barreOff),
              };
              const fg = asSafeFingers(raw.fingers);
              if (fg) res.fingers = fg;
              return res;
            }
            return null;
          })""",
        """        const isUkeKey = /@uke:(high-g|low-g|baritone|canadian)$/.test(entry[0]);
        const shapes = entry[1]
          .slice(0, 100)
          .map((raw) => {
            if (Array.isArray(raw)) {
              const s = cloneSafeShape(raw, isUkeKey);
              return s ? { shape: s, barreOff: null } : null;
            }
            if (raw && typeof raw === 'object') {
              const s = cloneSafeShape(raw.shape, isUkeKey);
              if (!s) return null;
              const res = {
                shape: s,
                barreOff: asSafeBarreOff(raw.barreOff),
              };
              const fg = asSafeFingers(raw.fingers, isUkeKey ? 4 : 6);
              if (fg) res.fingers = fg;
              return res;
            }
            return null;
          })""",
        "sanitize-user-fingerings-uke",
    )

    src = replace_once(
        src,
        "        if (cloneSafeShape(entry[1].split(',').map((v) => (v === 'x' ? 'x' : Number(v))))) preferredFingerings.push([entry[0].slice(0, SONG_LIMITS.MAX_TEXT), entry[1].slice(0, SONG_LIMITS.MAX_TEXT)]);",
        "        const isUkePref = /@uke:(high-g|low-g|baritone|canadian)$/.test(entry[0]);\n        if (cloneSafeShape(entry[1].split(',').map((v) => (v === 'x' ? 'x' : Number(v))), isUkePref)) preferredFingerings.push([entry[0].slice(0, SONG_LIMITS.MAX_TEXT), entry[1].slice(0, SONG_LIMITS.MAX_TEXT)]);",
        "sanitize-preferred-fingerings-uke",
    )

    # 21. StruChordExport + GP/MIDI экспорты (GM_PROGRAM.ukulele = 24, 4-струнный экспорт)
    src = replace_once(
        src,
        "  var GM_PROGRAM = { keys: 0, guitar: 25 };",
        "  var GM_PROGRAM = { keys: 0, guitar: 25, ukulele: 24 }; // 0.866: GM 24 = Nylon Guitar (0-based)",
        "export-gm-program-ukulele",
    )

    src = replace_once(
        src,
        """    var ctx={secId:sec.id,squareId:sq.id,eventIndex:ei,key:sec.key||globalKey,trackId:track.id};
    var shape=resolveShapeForScheduledChord(chord,ctx).shape;
    if(!Array.isArray(shape) || shape.length!==6){stats.guitarMissingShape++;return [];}
    var roll=typeof songRhythmRolls!=='undefined' && songRhythmRolls ? rhythmRollWindowFor(sec.id,sq,ei,songRhythmRolls) : null;
    var own=roll || ev.strumPattern || null;
    var pattern=own || getEffectiveStrumPattern(null,sq,sec);
    var sub=pattern ? Math.max(1,pattern.subdivision||1) : 1;
    var valid=pattern && Array.isArray(pattern.steps) && pattern.steps.length;
    if(valid && !own && (!Number.isInteger(pattern.steps.length/sub) || pattern.steps.length/sub<1))valid=false;
    var hits=[];
    function add(line,fret,at,dead,brush) {
      if(!Number.isInteger(line) || line<0 || line>=shape.length || !Number.isFinite(fret))return;
      hits.push({start:at,string:line,fret:fret,dead:!!dead,brush:brush||null});
    }
    function strum(at,dead,brush) {
      shape.forEach(function(fret,line){if(fret!=='x' && fret!==null && fret!==undefined && Number.isFinite(Number(fret)))add(line,Number(fret),at,dead,brush);});
    }
    if(!valid) {stats.guitarBrush++;strum(0,false,null);}
    else {
      var ts=getEffectiveTimeSigForEvent(ev,sec), off=getSquareEventOffsetUnits(sq,ei,ts),
        first=own ? 0 : Math.round((((off % (pattern.steps.length/sub))+(pattern.steps.length/sub))%(pattern.steps.length/sub))*sub),
        base=Math.round((off+(Number(pattern.gridPhase)||0))*sub), steps=Math.max(1,Math.round(span*sub));
      for(var i=0;i<steps;i++){
        var rel=(base+i)/sub-off, symbol=pattern.steps[(first+i)%pattern.steps.length];
        if(rel>=span-1e-9)continue;
        if(rel < -1e-9){stats.guitarEarlySteps++;continue;}
        var at=Math.max(0,rel)*scale;
        if(pattern.mode==='pick' || (pattern.mode==='mixed' && (Array.isArray(symbol) || typeof symbol==='number'))) {
          var strings=resolvePickStepStrings(symbol,shape,chord);
          strings.forEach(function(num){var line=6-Number(num), fret=shape[line];""",
        """    var expectedStrings = track.instrument === 'ukulele' ? 4 : 6;
    var ctx={secId:sec.id,squareId:sq.id,eventIndex:ei,key:sec.key||globalKey,trackId:track.id};
    var shape=resolveShapeForScheduledChord(chord,ctx).shape;
    if(!Array.isArray(shape) || shape.length!==expectedStrings){stats.guitarMissingShape++;return [];}
    var own = track.instrument === 'ukulele'
      ? (track.patterns && track.patterns[cellKey]) || null
      : ((typeof songRhythmRolls!=='undefined' && songRhythmRolls ? rhythmRollWindowFor(sec.id,sq,ei,songRhythmRolls) : null) || ev.strumPattern || null);
    var pattern = own || (track.instrument === 'ukulele'
      ? (track.patterns && track.patterns['s:' + sec.id]) || null
      : getEffectiveStrumPattern(null,sq,sec));
    var sub=pattern ? Math.max(1,pattern.subdivision||1) : 1;
    var valid=pattern && Array.isArray(pattern.steps) && pattern.steps.length;
    if(valid && !own && (!Number.isInteger(pattern.steps.length/sub) || pattern.steps.length/sub<1))valid=false;
    var hits=[];
    function add(line,fret,at,dead,brush) {
      if(!Number.isInteger(line) || line<0 || line>=shape.length || !Number.isFinite(fret))return;
      hits.push({start:at,string:line,fret:fret,dead:!!dead,brush:brush||null});
    }
    function strum(at,dead,brush) {
      shape.forEach(function(fret,line){if(fret!=='x' && fret!==null && fret!==undefined && Number.isFinite(Number(fret)))add(line,Number(fret),at,dead,brush);});
    }
    if(!valid) {stats.guitarBrush++;strum(0,false,null);}
    else {
      var ts=getEffectiveTimeSigForEvent(ev,sec), off=getSquareEventOffsetUnits(sq,ei,ts),
        first=own ? 0 : Math.round((((off % (pattern.steps.length/sub))+(pattern.steps.length/sub))%(pattern.steps.length/sub))*sub),
        base=Math.round((off+(Number(pattern.gridPhase)||0))*sub), steps=Math.max(1,Math.round(span*sub));
      for(var i=0;i<steps;i++){
        var rel=(base+i)/sub-off, symbol=pattern.steps[(first+i)%pattern.steps.length];
        if(rel>=span-1e-9)continue;
        if(rel < -1e-9){stats.guitarEarlySteps++;continue;}
        var at=Math.max(0,rel)*scale;
        if(pattern.mode==='pick' || (pattern.mode==='mixed' && (Array.isArray(symbol) || typeof symbol==='number'))) {
          var strings=resolvePickStepStrings(symbol,shape,chord);
          strings.forEach(function(num){var line=expectedStrings-Number(num), fret=shape[line];""",
        "export-guitar-cell-roll-ukulele",
    )

    src = replace_once(
        src,
        """        gmProgram: isKeys ? ({rhodes:4,organ:16,pad:89}[track.timbre] ?? GM_PROGRAM.keys) : GM_PROGRAM.guitar,
        mix: { volume: clamp(track.volume, 0, 100), pan: 0 },
        b39TrackId: track.id,
        b39Instrument: track.instrument
      };
      if (!isKeys) {
        out.push(Object.assign({},base,{instrument:'guitar',viewMode:'tab',strings:b39WithTrackTuning(track.id,function(){return b39GuitarTuningNotes().slice();}),
          capo:Number(songData.capo)||0,rolls:rolls,pitchRolls:{}}));""",
        """        gmProgram: isKeys ? ({rhodes:4,organ:16,pad:89}[track.timbre] ?? GM_PROGRAM.keys) : (track.instrument === 'ukulele' ? GM_PROGRAM.ukulele : GM_PROGRAM.guitar),
        mix: { volume: clamp(track.volume, 0, 100), pan: 0 },
        b39TrackId: track.id,
        b39Instrument: track.instrument
      };
      if (!isKeys) {
        out.push(Object.assign({},base,{instrument: track.instrument === 'ukulele' ? 'ukulele' : 'guitar',viewMode:'tab',strings:b39WithTrackTuning(track.id,function(){return b39GuitarTuningNotes().slice();}),
          capo:Number(songData.capo)||0,rolls:rolls,pitchRolls:{}}));""",
        "export-build-parts-ukulele",
    )

    # GP & MIDI export loops: isTab включает ukulele (ровно 2 вхождения в блоках GP/MIDI экспорта)
    old_istab = "      const isTab = instrument === 'guitar' || instrument === 'bass';"
    new_istab = "      const isTab = instrument === 'guitar' || instrument === 'bass' || instrument === 'ukulele';"
    cnt_istab = src.count(old_istab)
    if cnt_istab != 2:
        raise RuntimeError(f"[export-is-tab-pair] expected 2 matches, found {cnt_istab}")
    src = src.replace(old_istab, new_istab)

    # Также поправим defaultRole в partNotationViewMode (line 82534)
    src = replace_once(
        src,
        "            const roleDefault = part.instrument === 'guitar' || part.instrument === 'bass' ? 'tab' : 'staff';",
        "            const roleDefault = part.instrument === 'guitar' || part.instrument === 'bass' || part.instrument === 'ukulele' ? 'tab' : 'staff';",
        "part-role-default-ukulele",
    )

    HTML_PATH.write_text(src, encoding="utf-8")
    print(f"Patched {HTML_PATH.name} cleanly to ver 0.866 ({len(src)} chars).")


if __name__ == "__main__":
    main()
