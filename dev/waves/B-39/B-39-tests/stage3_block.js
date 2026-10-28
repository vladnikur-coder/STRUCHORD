// >>> B-39 STAGE3 BEGIN (KEYS AUDIO) <<<
// ==========================================================================
// B-39 · ЭТАП 3 (STAGE 3) — ЗВУК ПИАНИНО И ГОЛОСА ДОРОЖЕК
// --------------------------------------------------------------------------
// До сих пор звучал ОДИН голос — гитарный канал «Песня». Теперь у каждой
// клавишной дорожки свой голос, своя громкость, свой мьют/соло. Главная
// гитарная дорожка продолжает звучать прежним strumChord(): старый звук
// не тронут ни одной строкой.
//
// Ноты для клавиш берутся ТОЛЬКО из chordFormula() (часть 1), а не из
// getChordNotes(): правило R12 запрещает переносить гитарные пропуски нот
// в фортепиано. C13 звучит всеми семью тонами.
//
// Два режима (решение владельца «сначала простой тон, потом синтез»):
//   'simple' — один triangle-осциллятор (запасной путь, как в Партиях);
//   'piano'  — 6 парциалов с негармоничностью + короткий шумовой молоток,
//              экспоненциальное затухание, общий хвост при педали.
// Сэмплов нет, сетевых запросов нет, размер файла не растёт.
//
// Шина: существующий mixerChannelForVoice() -> канал 'b39:keys:<id>' ->
// тот же мастер с EQ и панорамой. Громкость дорожки ставится в input.gain.
// Все источники регистрируются и глушатся из stopAllAudio().
// ==========================================================================
(function (HOST) {
  'use strict';

  var MODE = 'piano';              // 'simple' | 'piano'
  var PEDAL = false;
  var MAX_VOICES = 320;             // 8 нот × (6 парциалов + молоток) × ~5 аккордов
  var PARTIALS = 6;
  var HEADROOM = 0.16;            // суммарная громкость ноты до шины канала

  var ctxRef = null;
  var voices = new Set();         // живые источники Web Audio
  var channels = new Map();       // trackId -> канал микшера
  var prevByTrack = new Map();    // голосоведение: предыдущие MIDI-ноты
  var hammer = null;              // общий буфер шума молоточка
  var voicingProvider = null;     // STAGE 4 подменяет голосоведение
  var eventNotifier = null;       // STAGE 4 следит за текущим аккордом
  var patternPlanner = null;      // STAGE 5 раскладывает аккорд по шагам
  var stats = { notes: 0, events: 0, skippedGhost: 0, skippedMuted: 0, capped: 0 };

  function tracks() { return HOST.StruChordTracks || null; }
  function formula() { return HOST.StruChordFormula || null; }

  function ensureCtx(ctx) {
    if (ctxRef === ctx) return;
    // Контекст пересоздан (audioPreflightForGesture): старые узлы уже мертвы.
    voices.clear(); channels.clear(); hammer = null; ctxRef = ctx;
  }

  // ---------- Шина дорожки ----------
  function channelFor(ctx, trackId, gain) {
    var ch = channels.get(trackId);
    if (ch && ch.__ctx === ctx) {
      try { ch.input.gain.value = gain; } catch (e) {}
      return ch;
    }
    var made = null;
    try {
      if (typeof HOST.mixerChannelForVoice === 'function') {
        made = HOST.mixerChannelForVoice(ctx, 'b39:keys:' + trackId);
      } else if (typeof HOST.ensureMixerChannel === 'function') {
        made = HOST.ensureMixerChannel(ctx, 'b39:keys:' + trackId);
      }
    } catch (e) { made = null; }
    if (!made || !made.input) return null;
    try { made.input.gain.value = gain; } catch (e) {}
    made.__ctx = ctx;
    channels.set(trackId, made);
    return made;
  }
  function voiceTarget(ch) {
    // dry (0.9) -> input -> EQ -> панорама -> мастер. Рекомендуемый путь:
    // он не добавляет гитарную деку конволюции, но сохраняет общий микшер.
    return ch.dry || ch.input;
  }

  // M/S + громкость. Solo на любой дорожке глушит остальные.
  function effectiveGain(state, track) {
    if (!track || track.mute) return 0;
    var anySolo = false;
    for (var i = 0; i < state.tracks.length; i++) if (state.tracks[i].solo) anySolo = true;
    if (anySolo && !track.solo) return 0;
    var v = Number(track.volume);
    if (!Number.isFinite(v)) v = 100;
    return Math.max(0, Math.min(100, v)) / 100;
  }

  // ---------- Голосоведение (базовая версия; часть 5 добавит варианты) ----------
  function firstMidiWithPc(low, pc) {
    var m = low + (((pc - (low % 12)) % 12) + 12) % 12;
    return m;
  }
  function closestMidiWithPc(lo, hi, pc, prev) {
    var first = firstMidiWithPc(lo, pc);
    var candidates = [];
    for (var m = first; m <= hi; m += 12) candidates.push(m);
    if (!candidates.length) return null;
    if (!prev || !prev.length) return candidates[0];
    // Минимальное движение: держимся ближе к предыдущему голосу той же ноты.
    var centre = prev.reduce(function (a, b) { return a + b; }, 0) / prev.length;
    var best = candidates[0], bestD = Math.abs(best - centre);
    for (var i = 1; i < candidates.length; i++) {
      var d = Math.abs(candidates[i] - centre);
      if (d < bestD) { best = candidates[i]; bestD = d; }
    }
    return best;
  }
  /**
   * Строит MIDI-ноты аккорда в диапазоне выбранной клавиатуры.
   * Бас — отдельная низкая нота (корень или нота слэш-баса).
   * Правая рука — тона канонической формулы, корень удваивается.
   */
  function voicingFor(chordName, key, range, prev) {
    var F = formula();
    if (!F || typeof F.chordFormula !== 'function') return [];
    var f = F.chordFormula(chordName, key);
    if (!f || !f.tones || !f.tones.length) return [];
    var low = range.low, high = range.high;
    if (low > high) return [];

    var bassPc = f.bass ? f.bass.pitchClass : f.rootPc;
    var bass = firstMidiWithPc(low, bassPc);
    if (bass > high) bass = high - ((high - bassPc) % 12);

    var rhLow = Math.max(low + 12, 48);
    var rhHigh = Math.min(high, 84);
    if (rhHigh < rhLow) rhHigh = Math.min(high, rhLow + 12);

    var notes = [];
    f.pitchClasses.forEach(function (pc) {
      var m = closestMidiWithPc(rhLow, rhHigh, pc, prev);
      if (m !== null && m >= low && m <= high && notes.indexOf(m) < 0) notes.push(m);
    });
    // Удвоение корня октавой выше — делает аккорд плотнее.
    var rootMidi = firstMidiWithPc(rhLow, f.rootPc);
    if (rootMidi + 12 <= rhHigh && rootMidi >= rhLow && notes.indexOf(rootMidi + 12) < 0 && notes.length < 7) {
      notes.push(rootMidi + 12);
    }
    notes.sort(function (a, b) { return a - b; });
    if (bass !== null && bass >= low && bass <= high && notes.indexOf(bass) < 0) notes.unshift(bass);
    // 7 тонов канонической формулы + отдельный бас = 8 нот. Ничего не
    // выбрасываем: R12 запрещает переносить гитарные пропуски в пианино.
    return notes.filter(function (m) { return m >= low && m <= high; }).slice(0, 8);
  }

  // ---------- Синтез ----------
  function frequencyOf(midi) { return 440 * Math.pow(2, (Number(midi) - 69) / 12); }

  function hammerBuffer(ctx) {
    if (hammer) return hammer;
    try {
      var len = Math.max(1, Math.floor(ctx.sampleRate * 0.03));
      hammer = ctx.createBuffer(1, len, ctx.sampleRate);
      var data = hammer.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    } catch (e) { hammer = null; }
    return hammer;
  }

  function register(source) {
    voices.add(source);
    try {
      source.onended = function () { voices.delete(source); };
    } catch (e) {}
  }
  function hasRoom() {
    if (voices.size < MAX_VOICES) return true;
    stats.capped++;
    return false;
  }

  function playSimple(ctx, target, midi, start, dur, level) {
    if (!hasRoom()) return;
    var osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = frequencyOf(midi);
    var g = ctx.createGain();
    var end = start + Math.max(0.16, dur * 0.9);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), start + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(g); g.connect(target);
    osc.start(start); osc.stop(end + 0.02);
    register(osc);
    stats.notes++;
  }

  function playPiano(ctx, target, midi, start, dur, level) {
    if (!hasRoom()) return;
    var f0 = frequencyOf(midi);
    var decay = Math.max(0.38, Math.min(2.6, dur * 1.5)) * (PEDAL ? 1.85 : 1);
    var bus = ctx.createGain();
    bus.gain.value = 1;
    bus.connect(target);
    var B = 0.00035;                    // негармоничность (растяжка струн)
    for (var n = 1; n <= PARTIALS; n++) {
      if (!hasRoom()) break;
      var osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f0 * n * Math.sqrt(1 + B * n * n);
      var g = ctx.createGain();
      var amp = level / Math.pow(n, 1.45);
      var tau = Math.max(0.08, decay / Math.pow(n, 0.55));
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, amp), start + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, start + tau);
      osc.connect(g); g.connect(bus);
      osc.start(start); osc.stop(start + tau + 0.02);
      register(osc);
    }
    // Молоточек: короткий шумовой импульс, отфильтрованный по высоте ноты.
    var nb = hammerBuffer(ctx);
    if (nb && hasRoom() && typeof ctx.createBufferSource === 'function') {
      try {
        var src = ctx.createBufferSource(); src.buffer = nb;
        var bp = ctx.createBiquadFilter ? ctx.createBiquadFilter() : null;
        var ng = ctx.createGain();
        if (bp) { bp.type = 'bandpass'; bp.frequency.value = Math.min(6000, f0 * 4); bp.Q.value = 0.7; src.connect(bp); bp.connect(ng); }
        else src.connect(ng);
        ng.gain.setValueAtTime(Math.max(0.0002, level * 0.14), start);
        ng.gain.exponentialRampToValueAtTime(0.0001, start + 0.022);
        ng.connect(bus);
        src.start(start); src.stop(start + 0.03);
        register(src);
      } catch (e) {}
    }
    stats.notes++;
  }

  function playNote(ctx, channel, midi, start, dur, level) {
    var target = voiceTarget(channel);
    if (!target) return;
    if (MODE === 'simple') playSimple(ctx, target, midi, start, dur, level);
    else playPiano(ctx, target, midi, start, dur, level);
  }

  // ---------- Планирование ----------
  /**
   * Вызывается из scheduleNextEvent на КАЖДУЮ ячейку. Для каждой клавишной
   * дорожки берёт её собственный аккорд (пусто = призрак, звука нет) и
   * ставит ноты в Web Audio. Главная гитарная звучит прежним кодом.
   */
  function scheduleEvent(ctx, sec, sq, ev, ei, evStart, dur, bpm, ts) {
    var T = tracks();
    if (!T || !ctx || !sec || !sq || !ev) return;
    ensureCtx(ctx);
    var state = T.state();
    if (state.mainTrackId === null) return;
    stats.events++;
    var seconds = Math.max(0.18, Math.min(2.2, Number(dur) || 0.4));
    var key = sec.key || currentKey();
    var cell = T.cellKey(sec, sq, ei);
    state.tracks.forEach(function (track) {
      if (track.instrument !== 'keys') return;
      var chord = T.trackChord(track.id, cell, ev);
      if (!chord) { stats.skippedGhost++; return; }   // призрак не звучит
      var gain = effectiveGain(state, track);
      if (gain <= 0) { stats.skippedMuted++; return; }
      var channel = channelFor(ctx, track.id, gain);
      if (!channel) return;
      var range = T.keyRange(track.id);
      var prev = prevByTrack.get(track.id) || null;
      var notes = voicingProvider
        ? (voicingProvider(chord, key, range, prev, track.id) || voicingFor(chord, key, range, prev))
        : voicingFor(chord, key, range, prev);
      prevByTrack.set(track.id, notes);
      var level = HEADROOM / Math.sqrt(Math.max(1, notes.length));
      // B-39 STAGE5: рисунок аккомпанимента возвращает шаги со своими
      // нотами, смещением и длительностью. Нет планировщика или он вернул
      // пусто -> прежнее поведение (весь аккорд сразу).
      var steps = null;
      if (patternPlanner) {
        try {
          steps = patternPlanner({
            ctx: ctx, evStart: evStart, dur: dur, bpm: bpm, ts: ts,
            sec: sec, sq: sq, ev: ev, ei: ei, cell: cell,
            chord: chord, key: key, range: range, notes: notes,
            trackId: track.id, span: (ev && ev.span) || 1
          });
        } catch (e) { steps = null; }
      }
      if (steps && steps.length) {
        steps.forEach(function (st) {
          var at = Math.max(0, Number(st.at) || 0);
          var len = Math.max(0.02, Number(st.dur) || seconds);
          (Array.isArray(st.notes) ? st.notes : []).forEach(function (midi) {
            playNote(ctx, channel, midi, evStart + at, len, level);
          });
        });
      } else {
        notes.forEach(function (midi) { playNote(ctx, channel, midi, evStart, seconds, level); });
      }
    });
    if (eventNotifier) {
      try {
        eventNotifier({ sec: sec, sq: sq, ev: ev, ei: ei, cell: cell, key: key, state: state });
      } catch (e) {}
    }
  }

  /** Мгновенное прослушивание (двойной клик / круг). */
  function preview(chordName, ctx, now, wrapper) {
    var T = tracks();
    if (!T || !ctx || !chordName) return;
    ensureCtx(ctx);
    var state = T.state();
    if (state.mainTrackId === null) return;
    var ds = wrapper && wrapper.dataset ? wrapper.dataset : null;
    var cell = ds ? (ds.sec + ':' + ds.square + ':' + ds.ei) : null;
    state.tracks.forEach(function (track) {
      if (track.instrument !== 'keys') return;
      var chord = (cell && T.trackChord(track.id, cell)) || chordName;
      if (!chord) return;
      var gain = effectiveGain(state, track);
      if (gain <= 0) return;
      var channel = channelFor(ctx, track.id, gain);
      if (!channel) return;
      var notes = voicingFor(chord, currentKey(), T.keyRange(track.id), null);
      var level = HEADROOM / Math.sqrt(Math.max(1, notes.length));
      notes.forEach(function (midi) { playNote(ctx, channel, midi, now, 0.55, level); });
    });
  }

  function currentKey() {
    try { return (typeof globalKey !== 'undefined' && globalKey) || 'C'; } catch (e) { return 'C'; }
  }

  function stopAll() {
    voices.forEach(function (src) { try { src.stop(); } catch (e) {} });
    voices.clear();
    prevByTrack.clear();
    // B-39 STAGE5: снимаем подсветку шагов, если она была запланирована.
    var Acc = HOST.StruChordAccomp;
    if (Acc && typeof Acc.clearHighlights === 'function') {
      try { Acc.clearHighlights(); } catch (e) {}
    }
  }
  function reset() {
    stopAll(); channels.clear(); ctxRef = null; hammer = null;
    stats = { notes: 0, events: 0, skippedGhost: 0, skippedMuted: 0, capped: 0 };
  }

  function setVoicingProvider(fn) { voicingProvider = typeof fn === 'function' ? fn : null; return !!voicingProvider; }
  function setEventNotifier(fn) { eventNotifier = typeof fn === 'function' ? fn : null; return !!eventNotifier; }
  function setPatternPlanner(fn) { patternPlanner = typeof fn === 'function' ? fn : null; return !!patternPlanner; }

  var api = Object.freeze({
    scheduleEvent: scheduleEvent, preview: preview, stopAll: stopAll, reset: reset,
    setVoicingProvider: setVoicingProvider, setEventNotifier: setEventNotifier,
    setPatternPlanner: setPatternPlanner,
    voicingFor: voicingFor, effectiveGain: effectiveGain, frequencyOf: frequencyOf,
    setMode: function (m) { if (m === 'simple' || m === 'piano') MODE = m; return MODE; },
    getMode: function () { return MODE; },
    setPedal: function (on) { PEDAL = !!on; return PEDAL; },
    setPartials: function (n) { var v = Number(n); if (v >= 1 && v <= 12) PARTIALS = Math.round(v); return PARTIALS; },
    setHeadroom: function (v) { var n = Number(v); if (n > 0 && n <= 1) HEADROOM = n; return HEADROOM; },
    stats: function () { return Object.assign({}, stats, { liveVoices: voices.size, channels: channels.size }); }
  });
  HOST.StruChordAudio = api;
})(typeof window !== 'undefined' ? window : globalThis);
// <<< B-39 STAGE3 END (KEYS AUDIO) <<<
