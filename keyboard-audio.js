// STRUCHORD · Звук клавишных дорожек
// Вынесено из STRUCHORD.html (0.776). Блок по-прежнему исполняется
// в прежнем месте встроенного скрипта: файл только регистрирует
// фабрику window.__b39Modules.audio, а HTML вызывает её там, где блок
// лежал раньше. Порядок запуска поэтому не меняется.

(function () {
  var HOST = window;
  HOST.__b39Modules = HOST.__b39Modules || {};
  HOST.__b39Modules.audio = function () {
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

  window.StruChordSampleCredits="Источники клавишных звуков STRUCHORD\n\nПианино: Salamander Grand Piano V3, Alexander Holm, три слоя силы (velocity 3/8/14) из npm-пакетов @audio-samples/piano-mp3-velocity* (https://www.npmjs.com/package/@audio-samples/piano-mp3-velocity8), исходная библиотека https://archive.org/details/SalamanderGrandPianoV3 ; часть нот — версия MP3 из Tone.js https://github.com/Tonejs/audio/tree/efd8296360f9526e379bfbe5c1698ff54d6a1d34/salamander . Автор объявил библиотеку общественным достоянием с 4 марта 2022: https://rytmenpinne.wordpress.com/sounds-and-such/salamander-grandpiano/ . Историческая лицензия CC BY 3.0: https://creativecommons.org/licenses/by/3.0/ . Изменения: отбор нот, выбор слоя силы, высота изменяется при проигрывании; огибающая, фильтр яркости; release-записи не используются.\n\nRhodes: jRhodes GM, Jeff Learman, CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/ . GM-версия: https://github.com/sfzinstruments/Discord-SFZ-GM-Bank/blob/7a9c478fe331f94f246d33332f0adedb25bbbe27/Discord%20GM/Melodic/005-Electric%20Piano%201.sfz . WAV сэмплы выбраны из данного набора; высота и огибающая изменяются при проигрывании. У других версий jRhodes другие лицензии.\n\nОрган: tonewheel organ sound samples by hammondman, CC0 1.0, https://freesound.org/people/hammondman/packs/18844/ ; обработанные MP3 из https://github.com/t-hamano/piano-block/tree/897256cd5506a5c2cba14f6bb48fef8113dc39b5/assets/instruments/organ . Изменения: отбор нот, высота, огибающая и сглаженный цикл. Точная модель органа не подтверждена.\n\nPad: FluidR3 warm pad, Frank Wen и участники, перекодированные MP3 из educandu/abcjs-soundfonts, https://github.com/educandu/abcjs-soundfonts/tree/ebd5724f5d334b5b6347562b0044f75e16df90b7/FluidR3_Salamander_GM/pad_2_warm-mp3 . Промежуточный midi-js-soundfonts указывает CC BY 3.0: https://creativecommons.org/licenses/by/3.0/ . Изменения: отбор нот, высота, огибающая, сглаженный цикл.\n\nFluid (R3) SoundFont\nCopyright (c) 2000-2002, 2008 Frank Wen\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the \"Software\"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.\n\nThe MIT License (MIT)\nCopyright (c) 2023 Educandu Team\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the \"Software\"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.\nCopyright (C) 2012 Benjamin Gleitzman (gleitz@mit.edu)\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the \"Software\"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.\n";
  // Записанные звуки лежат отдельными mp3 в sounds/ (0.776). Браузер качает
  // только выбранный тембр и только нужные слои; в git их несёт папка sounds,
  // а не 10 МБ base64 внутри скрипта. У пианино три слоя силы: тихая,
  // средняя и громкая записи одной ноты — это и есть живость, которой не даёт
  // один слой, растянутый фильтром.
  (function (HOST) {
    'use strict';
    var MANIFEST = './sounds/manifest.json';
    var manifest = null, manifestTask = null;
    var ready = new Map(), pending = new Map();
    function getJSON(url) {
      return HOST.fetch(url, { cache: 'force-cache' }).then(function (r) {
        if (!r.ok) throw Error('Звуки недоступны');
        return r.json();
      });
    }
    function loadManifest() {
      if (manifest) return Promise.resolve(manifest);
      if (manifestTask) return manifestTask;
      manifestTask = getJSON(MANIFEST).then(function (m) { manifest = m; return m; },
        function (e) { manifestTask = null; throw e; });
      return manifestTask;
    }
    // Crossfade a copy of the recorded tail into its loop start. MP3 has no
    // reliable original loop metadata. This is not a Leslie simulation.
    // 0.776: склейка длиннее (120 мс вместо 60) — у органа она качала уровень
    // на 2–4 дБ, потому что окно было коротким.
    function makeSustain(ctx, buf, fadeSeconds) {
      if (buf.duration < 1) return { buffer: buf };
      var copy = ctx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate), rate = buf.sampleRate;
      var start = Math.floor(Math.min(.45, buf.duration * .22) * rate), end = Math.floor((buf.duration - .08) * rate);
      var fade = Math.max(1, Math.min(Math.floor((fadeSeconds || .12) * rate), Math.floor((end - start) / 3)));
      for (var c = 0; c < buf.numberOfChannels; c++) {
        var input = buf.getChannelData(c), out = copy.getChannelData(c);
        out.set(input);
        for (var i = 0; i < fade; i++) {
          var t = (i + 1) / fade;
          out[end - fade + i] = input[end - fade + i] * (1 - t) + input[start + i] * t;
        }
      }
      return { buffer: copy, loopStart: (start + fade) / rate, loopEnd: end / rate };
    }
    // Один сбой сети не должен лишать тембра: пробуем ещё раз, а если
    // запись так и не пришла — пропускаем только её (см. load()).
    function fetchBuffer(ctx, url, attempt) {
      var tries = attempt || 0;
      return HOST.fetch(url, { cache: 'force-cache' }).then(function (r) {
        if (!r.ok) throw Error('Звуки недоступны');
        return r.arrayBuffer();
      }).then(function (a) { return ctx.decodeAudioData(a); })
        .catch(function (err) {
          if (tries >= 2) throw err;
          return new Promise(function (done) { HOST.setTimeout(done, 120 * (tries + 1)); })
            .then(function () { return fetchBuffer(ctx, url, tries + 1); });
        });
    }
    // Одна запись (или один слой силы одной записи) -> буфер с метаданными.
    function decodeEntry(ctx, mode, base, item) {
      return fetchBuffer(ctx, './sounds/' + (item.file || base.file)).then(function (buf) {
        var rec = { midi: base.midi, velocity: Number(item.velocity) || 0, buffer: buf };
        if (mode === 'organ') {
          var loop = makeSustain(ctx, buf, Number(item.loopFade) || .12);
          rec.buffer = loop.buffer;
          if (loop.loopStart) { rec.loopStart = loop.loopStart; rec.loopEnd = loop.loopEnd; }
        } else if (mode === 'pad') {
          var padLoop = makeSustain(ctx, buf, .09);
          rec.buffer = padLoop.buffer;
          if (padLoop.loopStart) { rec.loopStart = padLoop.loopStart; rec.loopEnd = padLoop.loopEnd; }
        } else if (Number.isFinite(item.loopStart) && Number.isFinite(item.loopEnd)) {
          rec.loopStart = item.loopStart; rec.loopEnd = item.loopEnd;
        }
        return rec;
      });
    }
    function load(mode, ctx) {
      if (ready.has(mode)) return Promise.resolve(ready.get(mode));
      if (pending.has(mode)) return pending.get(mode);
      if (!ctx || typeof ctx.decodeAudioData !== 'function') return Promise.reject(Error('Звуки недоступны'));
      var task = loadManifest().then(function (all) {
        var rows = all && all[mode];
        if (!rows || !rows.length) throw Error('Звуки недоступны');
        var jobs = [];
        rows.forEach(function (base) {
          var variants = Array.isArray(base.layers) && base.layers.length ? base.layers : [base];
          variants.forEach(function (item) {
            jobs.push(decodeEntry(ctx, mode, base, item).catch(function () { return null; }));
          });
        });
        // Потерянная запись выпадает из банка: соседняя нота сыграет её
        // место транспозицией, а весь тембр из-за одного файла не пропадёт.
        return Promise.all(jobs).then(function (list) {
          var good = list.filter(Boolean);
          if (!good.length) throw Error('Звуки недоступны');
          return good;
        });
      }).then(function (list) {
        var byMidi = new Map();
        list.forEach(function (rec) {
          if (!byMidi.has(rec.midi)) byMidi.set(rec.midi, []);
          byMidi.get(rec.midi).push(rec);
        });
        byMidi.forEach(function (layers) { layers.sort(function (a, b) { return a.velocity - b.velocity; }); });
        var entries = Array.from(byMidi, function (pair) { return { midi: pair[0], layers: pair[1] }; });
        entries.sort(function (a, b) { return a.midi - b.midi; });
        ready.set(mode, entries);
        pending.delete(mode);
        return entries;
      }, function (err) { pending.delete(mode); throw err; });
      pending.set(mode, task);
      return task;
    }
    // Ближайшая записанная нота и ближайший слой силы к желаемой velocity.
    function nearest(mode, midi, velocity) {
      var list = ready.get(mode);
      if (!list || !list.length) return null;
      var entry = list.reduce(function (p, q) { return Math.abs(q.midi - midi) < Math.abs(p.midi - midi) ? q : p; });
      var layers = entry.layers, target = Number(velocity) || 0, rec = layers[0];
      if (target > 0 && layers.length > 1) {
        rec = layers.reduce(function (p, q) {
          return Math.abs(q.velocity - target) < Math.abs(p.velocity - target) ? q : p;
        });
      } else if (layers.length > 1) {
        rec = layers[Math.min(layers.length - 1, (layers.length / 2) | 0)];
      }
      var out = { midi: entry.midi, velocity: rec.velocity, buffer: rec.buffer, layers: layers.length };
      if (rec.loopStart >= 0 && rec.loopEnd > rec.loopStart) { out.loopStart = rec.loopStart; out.loopEnd = rec.loopEnd; }
      return out;
    }
    HOST.StruChordSampleBank = Object.freeze({ load: load, ready: function (m) { return ready.has(m); }, nearest: nearest, manifest: function () { return manifest; } });
  })(window);

  (function (HOST) {
    'use strict';

    var MODE = 'acoustic';
    var PEDAL = false;
    var MAX_VOICES = 320;             // 8 нот × (6 парциалов + молоток) × ~5 аккордов
    var PARTIALS = 6;
    var HEADROOM = 0.16;            // суммарная громкость ноты до шины канала

    var ctxRef = null;
    var voices = new Set();         // живые источники Web Audio
    var previewEpoch = 0;
    var previewJobs = new Set();    // отмена таймеров длинного предпрослушивания
    var channels = new Map();       // trackId -> канал микшера
    var prevByTrack = new Map();    // голосоведение: предыдущие MIDI-ноты
    var hammer = null;              // общий буфер шума молоточка
    var voicingProvider = null;     // STAGE 4 подменяет голосоведение
    var eventNotifier = null;       // STAGE 4 следит за текущим аккордом
    var patternPlanner = null;      // STAGE 5 раскладывает аккорд по шагам
    var stats = { notes: 0, events: 0, skippedGhost: 0, skippedMuted: 0, capped: 0 };

    function tracks() { return HOST.StruChordTracks || null; }
    function formula() { return HOST.StruChordFormula || null; }

    // Одна очередь для всех нот, привязанная к часам AudioContext, а не к
    // моменту планирования ячейки. Перекрывающиеся ноты учитываются отдельно.
    var keyHighlights = [], keyTimer = null;
    function refreshKeyHighlights() {
      var T=tracks(), panel=HOST.document && HOST.document.querySelector('#b39KeysPanel');
      if (!panel || !T) return;
      var state=T.state(), id=state.activeTrackId, active=T.track(id), now=ctxRef ? ctxRef.currentTime : 0;
      var sounding=new Set(), live=false, gain=effectiveGain(state,active);
      keyHighlights.forEach(function(n){if(!n.owner.cancelled && n.trackId===id && n.end>now){live=true;if(gain>0 && n.start<=now)sounding.add(n.midi);}});
      var body=panel.querySelector('.b39-keys-body');if(body)body.classList.toggle('b39-key-live',live);
      panel.querySelectorAll('.b39-keys-body rect[data-midi]').forEach(function(k){k.classList.toggle('b39-key-sounding',sounding.has(Number(k.getAttribute('data-midi'))));});
    }
    function tickKeyHighlights() {
      keyTimer=null;
      if (!ctxRef || ctxRef.state==='closed') { keyHighlights=[]; refreshKeyHighlights(); return; }
      var now=ctxRef.currentTime;
      keyHighlights=keyHighlights.filter(function(n){return !n.owner.cancelled && n.end>now;});
      refreshKeyHighlights();
      if(keyHighlights.length)keyTimer=HOST.setTimeout(tickKeyHighlights,25);
    }
    function scheduleKeyHighlight(ctx, channel, midi, start, dur, owner) {
      keyHighlights.push({trackId:channel.__trackId,midi:midi,start:start,end:start+dur,owner:owner||{cancelled:false}});
      if(!keyTimer)tickKeyHighlights();
    }
    function clearKeyHighlights() {
      if(keyTimer)HOST.clearTimeout(keyTimer);keyTimer=null;keyHighlights=[];refreshKeyHighlights();
    }
    function ensureCtx(ctx) {
      if (ctxRef === ctx) return;
      // Контекст пересоздан (audioPreflightForGesture): старые узлы уже мертвы.
      clearKeyHighlights(); voices.clear(); channels.clear(); hammer = null; ctxRef = ctx;
    }

    // ---------- Шина дорожки ----------
    function channelFor(ctx, trackId, gain, timbre) {
      var ch = channels.get(trackId);
      if (ch && ch.__ctx === ctx) {
        try { ch.input.gain.value = gain; } catch (e) {}
        ch.__timbre=timbre||null;return ch;
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
      made.__ctx = ctx; made.__trackId = trackId; made.__timbre=timbre||null;
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

    function playPiano(ctx, target, midi, start, dur, level, expression) {
      if (!hasRoom()) return;
      var f0 = frequencyOf(midi);
      // Нота сначала звучит заданную длительность, затем плавно затухает.
      // Прежняя огибающая гасила даже длинные ноты сразу после атаки.
      var held = Math.max(0.025, Math.min(12, Number(dur) || 0.4));
      var tail = PEDAL ? 0.6 : 0.18;
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
        var brightness = Number.isFinite(expression) ? Math.max(0.65,Math.min(1,expression)) : 1;
        var amp = level / Math.pow(n, 1.45 + (1-brightness)*0.7);
        // Высокие призвуки затухают быстрее основного тона.
        var releaseAt = start + held;
        var sustain = Math.max(0.0002, amp * Math.exp(-held * Math.pow(n, 0.45) / 2.4));
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, amp), start + 0.004);
        g.gain.exponentialRampToValueAtTime(sustain, releaseAt);
        g.gain.exponentialRampToValueAtTime(0.0001, releaseAt + tail);
        osc.connect(g); g.connect(bus);
        osc.start(start); osc.stop(releaseAt + tail + 0.02);
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

    function timbreFor(track) {return track && track.timbre || MODE;}
    function sampled(mode){return ['acoustic','rhodes','organ','pad'].indexOf(mode)>=0;}
    function timbreReady(mode){return !sampled(mode)||HOST.StruChordSampleBank.ready(mode);}
    function preloadTimbre(ctx,mode){return sampled(mode)?HOST.StruChordSampleBank.load(mode,ctx):Promise.resolve();}
    function preloadTracks(ctx,list){return Promise.all(list.filter(t=>t.instrument==='keys').map(t=>preloadTimbre(ctx,timbreFor(t))));}
    // 0.776: сила удара управляет не только громкостью.
    //  * У пианино на каждую ноту есть три записи (тихая/средняя/громкая) —
    //    берегётся ближайшая, поэтому яркость настоящая, а не фильтрованная.
    //  * У пианино и Rhodes поверх идёт фильтр, срез которого следует за силой:
    //    тихий удар глуше, громкий ярче. Это и есть «яркость от силы».
    //  * У органа силы удара нет по природе: акцент даёт щелчок клавиши и
    //    перкуссия, а не громкость.
    function strengthOf(expression) {
      return Number.isFinite(expression) ? Math.max(0, Math.min(1, expression)) : .85;
    }
    function velocityOf(expression) { return 1 + strengthOf(expression) * 15; }
    function brightnessHz(mode, f0, expression) {
      var e = strengthOf(expression);
      var base = mode === 'rhodes' ? 3.2 : 2.4, span = mode === 'rhodes' ? 12 : 10;
      return Math.max(600, Math.min(15000, f0 * (base + span * e)));
    }
    // Щелчок клавиши и перкуссия тон-колёс: короткий шум и затухающий тон
    // на третьей гармонике. Именно этого не хватает «электронному» органу.
    function organAttack(ctx, target, midi, start, level, expression) {
      var e = strengthOf(expression), f0 = frequencyOf(midi);
      var nb = hammerBuffer(ctx);
      if (nb && hasRoom() && typeof ctx.createBufferSource === 'function') {
        try {
          var src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
          src.buffer = nb;
          bp.type = 'bandpass';
          bp.frequency.value = Math.min(5200, Math.max(900, f0 * 3.2));
          bp.Q.value = 1.1;
          src.connect(bp); bp.connect(g); g.connect(target);
          g.gain.setValueAtTime(Math.max(.0002, level * (.9 + 1.4 * e)), start);
          g.gain.exponentialRampToValueAtTime(.0001, start + .012);
          src.start(start); src.stop(start + .02);
          register(src);
        } catch (err) {}
      }
      if (hasRoom()) {
        try {
          var osc = ctx.createOscillator(), pg = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = Math.min(8000, f0 * 3);
          osc.connect(pg); pg.connect(target);
          pg.gain.setValueAtTime(.0001, start);
          pg.gain.exponentialRampToValueAtTime(Math.max(.0002, level * (.18 + .38 * e)), start + .006);
          pg.gain.exponentialRampToValueAtTime(.0001, start + .28);
          osc.start(start); osc.stop(start + .3);
          register(osc);
        } catch (err) {}
      }
    }
    function playSample(ctx,target,mode,midi,start,dur,level,expression){
      var bank=HOST.StruChordSampleBank;
      var vel=velocityOf(expression);
      var rec=bank.nearest(mode,midi,vel);if(!rec || !hasRoom())return false;
      var voiceTail=mode==='pad'?.35:mode==='organ'?.08:mode==='rhodes'?.3:.22;
      var held=Math.max(.025,Math.min(30,Number(dur)||.4));
      var rate=Math.pow(2,(midi-rec.midi)/12);
      var src=ctx.createBufferSource(),g=ctx.createGain();
      src.buffer=rec.buffer;src.playbackRate.value=rate;
      if(rec.loopEnd && rec.loopStart>=0 && rec.loopEnd>rec.loopStart && rec.loopEnd<=rec.buffer.duration){src.loop=true;src.loopStart=rec.loopStart;src.loopEnd=rec.loopEnd;}
      if(!src.loop)held=Math.max(.025,Math.min(held,Math.max(.025,rec.buffer.duration/rate-voiceTail-.02)));
      var attack=mode==='pad'?.14:.004,end=start+held;
      // Калибровка по тембру: записи разной громкости, чтобы Rhodes не лез
      // вперёд, а pad не заливал. Орган на силу удара не реагирует: у него
      // акцент даёт атака (щелчок и перкуссия), поэтому громкость почти ровная.
      var cal=({acoustic:1.3,rhodes:.55,organ:1.1,pad:4}[mode])||1;
      var unit=rec.velocity?Math.pow(vel/Math.max(1,rec.velocity),0.85):1;
      var strength=mode==='organ'?0.35:1;
      var amp=Math.max(.0002,level*1.8*cal*unit*Math.pow(strengthOf(expression),strength));
      var head=src;
      if(mode==='acoustic'||mode==='rhodes'){
        if(typeof ctx.createBiquadFilter==='function'){
          // Два каскада: один биквад даёт всего 12 дБ/окт, и разница между
          // тихим и громким ударом была почти неслышной.
          var cut=brightnessHz(mode,frequencyOf(midi),expression);
          var lp=ctx.createBiquadFilter();
          lp.type='lowpass';lp.frequency.value=cut;lp.Q.value=.5;
          var lp2=ctx.createBiquadFilter();
          lp2.type='lowpass';lp2.frequency.value=cut;lp2.Q.value=.5;
          var lp2b=lp2;
          src.connect(lp);lp.connect(lp2b);head=lp2b;
          // Записи Rhodes тёмные: одного среза мало, громкому удару нужна
          // «кора» в районе 1,8 кГц, тихому — наоборот, мягкость.
          var shelf=ctx.createBiquadFilter();
          shelf.type='highshelf';
          shelf.frequency.value=1800;
          shelf.gain.value=Math.max(-6,Math.min(7,(strengthOf(expression)-.45)*12));
          head.connect(shelf);head=shelf;
        }
      }
      g.gain.setValueAtTime(.0001,start);g.gain.exponentialRampToValueAtTime(amp,start+Math.min(attack,held*.5));
      var loopAt=rec.loopEnd?rec.loopEnd/rate:Infinity,levelAtEnd=amp;
      if(mode==='rhodes' && held>loopAt){g.gain.setValueAtTime(amp,start+loopAt);levelAtEnd=amp*Math.exp(-(held-loopAt)/12);g.gain.exponentialRampToValueAtTime(Math.max(.0002,levelAtEnd),end);}
      else g.gain.setValueAtTime(amp,end);
      g.gain.exponentialRampToValueAtTime(.0001,end+voiceTail);
      head.connect(g);g.connect(target);src.start(start);src.stop(end+voiceTail+.01);register(src);stats.notes++;
      if(mode==='organ')organAttack(ctx,target,midi,start,level,expression);
      return true;
    }
    function playNote(ctx, channel, midi, start, dur, level, expression, highlightOwner) {
      var target = voiceTarget(channel);
      if (!target) return;
      var mode=channel.__timbre||MODE;
      if(mode==='simple')playSimple(ctx,target,midi,start,dur,level);
      else if(mode==='piano')playPiano(ctx,target,midi,start,dur,level,expression);
      else playSample(ctx,target,mode,midi,start,dur,level,expression);
      scheduleKeyHighlight(ctx, channel, midi, start, dur, highlightOwner);
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
        var channel = channelFor(ctx, track.id, gain, track.timbre);
        if (!channel) return;
        var range = T.keyRange(track.id);
        var prev = prevByTrack.get(track.id) || null;
        var notes = voicingProvider
          ? (voicingProvider(chord, key, range, prev, track.id, cell) || voicingFor(chord, key, range, prev))
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
              var dynamics=Number.isFinite(st.gain) ? st.gain : null;
              playNote(ctx, channel, midi, evStart + at, len, level * (dynamics===null ? 1 : dynamics), dynamics);
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
    function preview(chordName, ctx, now, wrapper, key) {
      var T = tracks();
      if (!T || !ctx || !chordName) return;
      ensureCtx(ctx);
      var state = T.state();
      if (state.mainTrackId === null) return;
      var ds = wrapper && wrapper.dataset ? wrapper.dataset : null;
      var cell = ds ? (ds.sec + ':' + ds.square + ':' + ds.ei) : null;
      state.tracks.forEach(function (track) {
        if (track.instrument !== 'keys' || track.id !== state.activeTrackId) return;
        var chord = chordName;
        if (!chord) return;
        var gain = effectiveGain(state, track);
        if (gain <= 0) return;
        var channel = channelFor(ctx, track.id, gain, track.timbre);
        if (!channel) return;
        var range = T.keyRange(track.id), effectiveKey = key || currentKey();
        var notes = voicingProvider
          ? (voicingProvider(chord, effectiveKey, range, null, track.id, cell) || voicingFor(chord, effectiveKey, range, null))
          : voicingFor(chord, effectiveKey, range, null);
        var acc=HOST.StruChordAccomp, sec=acc && acc.sectionFromCell(cell);
        if(acc && sec)notes=acc.stripBass(track.id,sec,notes);
        var level = HEADROOM / Math.sqrt(Math.max(1, notes.length));
        notes.forEach(function (midi) { playNote(ctx, channel, midi, now, 0.55, level); });
      });
      if (cell && eventNotifier) {
        try { eventNotifier({cell:cell}); } catch (e) {}
      }
    }

    // Нота панели не зависит от аккорда или наличия секций и не пишет в песню.
    function previewNote(ctx, trackId, midi) {
      var T = tracks(); if (!T || !ctx || !Number.isInteger(midi)) return false;
      var state = T.state(), track = T.track(trackId), range = T.keyRange(trackId);
      if (!track || track.instrument !== 'keys' || state.activeTrackId !== trackId || !range || midi < range.low || midi > range.high) return false;
      var gain = effectiveGain(state, track); if (gain <= 0) return false;
      var mode=timbreFor(track);if(!timbreReady(mode)){
        var epoch=previewEpoch;if(HOST.showToast)HOST.showToast('Подготовка тембра…');preloadTimbre(ctx,mode).then(function(){if(epoch===previewEpoch)previewNote(ctx,trackId,midi);}).catch(function(){if(HOST.showToast)HOST.showToast('Не удалось загрузить тембр: проверьте файл keyboard-sounds.js рядом с приложением');});return true;
      }
      ensureCtx(ctx); var channel = channelFor(ctx, trackId, gain, track.timbre); if (!channel) return false;
      // .02 с, а не .01: с записанными сэмплами на первую ноту уходит
      // несколько лишних миллисекунд (фильтры яркости, буфер), и нота
      // иначе планируется в прошлое — Web Audio молча играет её сразу.
      playNote(ctx, channel, midi, ctx.currentTime + .02, .55, HEADROOM / Math.sqrt(4));
      return true;
    }

    function previewPattern(chord, ctx, trackId, key, cfg, options) {
      var T = tracks(), Acc = HOST.StruChordAccomp;
      if (!T || !Acc || !ctx || !chord) return null;
      var state = T.state(), track = T.track(trackId);
      if (!track || track.instrument !== 'keys') return null;
      var mode=timbreFor(track);if(!timbreReady(mode)){
        var cancelled=false,inner=null,epoch=previewEpoch;
        preloadTimbre(ctx,mode).then(function(){if(!cancelled && epoch===previewEpoch)inner=previewPattern(chord,ctx,trackId,key,cfg,options);}).catch(function(){if(HOST.showToast)HOST.showToast('Не удалось загрузить тембр: проверьте файл keyboard-sounds.js рядом с приложением');});
        return function(){cancelled=true;if(inner)inner();};
      }
      var gain = effectiveGain(state, track);
      if (gain <= 0) return null;
      ensureCtx(ctx);
      var channel = channelFor(ctx, trackId, gain, track.timbre);
      if (!channel) return null;
      var opt = options || {}, range = T.keyRange(trackId), ranges = T.ranges();
      var desired = opt.keyboardSize === null ? state.keyboardSize : opt.keyboardSize;
      if (ranges[desired]) range = Object.assign({size:desired}, ranges[desired]);
      var effectiveKey = key || currentKey();
      var notes = voicingProvider ? (voicingProvider(chord, effectiveKey, range, null, trackId, opt.cell) || voicingFor(chord, effectiveKey, range, null)) : voicingFor(chord, effectiveKey, range, null);
      var span = Math.max(.25, Number(opt.span) || 4), bpm = Math.max(20, Number(opt.bpm) || 120);
      var unit = typeof getGridUnitDurationSeconds === 'function' ? getGridUnitDurationSeconds(bpm, opt.ts || '4/4') : 60 / bpm;
      var steps = Acc.plan({ trackId:trackId, chord:chord, key:effectiveKey, range:range, notes:notes,
        ts:opt.ts || '4/4', span:span, dur:span * unit, ev:{span:span}, sq:{events:[]}, ei:0,
        pattern:cfg, patternSource:opt.scope, sec:opt.sec, bassMode:opt.bassMode, noHighlight:true });
      var start = ctx.currentTime + .05, level = HEADROOM / Math.sqrt(Math.max(1, notes.length));
      var owned = new Set(), index = 0, timer = null, stopped = false, highlightOwner={cancelled:false};
      // Не создаём все источники двухтактовой фразы сразу: будущие ноты
      // иначе занимают общий лимит раньше, чем начинают звучать.
      var deadline = Date.now() + Math.ceil((span * unit + 1) * 1000);
      function cancel() {
        if (stopped) return;
        stopped=true; highlightOwner.cancelled=true; if(keyTimer)HOST.clearTimeout(keyTimer);tickKeyHighlights(); if (timer) clearTimeout(timer); timer=null; previewJobs.delete(cancel);
        owned.forEach(function (v) { try { v.stop(); } catch (e) {} voices.delete(v); }); owned.clear();
      }
      function tick() {
        timer=null;
        if (stopped) return;
        if (ctxRef!==ctx || ctx.state==='closed' || Date.now()>deadline) { cancel(); return; }
        if (ctx.state==='running') {
          var horizon=ctx.currentTime+.20;
          while (index<steps.length && start+steps[index].at<=horizon) {
            var step=steps[index++], before=new Set(voices);
            step.notes.forEach(function (midi) {
              var d=Number.isFinite(step.gain)?step.gain:null;
              playNote(ctx,channel,midi,Math.max(ctx.currentTime+.005,start+step.at),step.dur,level*(d===null?1:d),d,highlightOwner);
            });
            voices.forEach(function (v) { if (!before.has(v)) owned.add(v); });
          }
        }
        if (index<steps.length) timer=setTimeout(tick,40);
        else previewJobs.delete(cancel);
      }
      previewJobs.add(cancel); tick();
      return cancel;
    }
    function currentKey() {
      try { return (typeof globalKey !== 'undefined' && globalKey) || 'C'; } catch (e) { return 'C'; }
    }

    function stopAll() {
      previewEpoch++;
      previewJobs.forEach(function (cancel) { cancel(); }); previewJobs.clear();
      clearKeyHighlights();
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
      scheduleEvent: scheduleEvent, preview: preview, previewNote: previewNote, previewPattern: previewPattern, stopAll: stopAll, reset: reset,
      setVoicingProvider: setVoicingProvider, setEventNotifier: setEventNotifier,
      setPatternPlanner: setPatternPlanner, refreshKeyHighlights: refreshKeyHighlights,
      timbreFor:timbreFor, timbreReady:timbreReady, preloadTimbre:preloadTimbre, preloadTracks:preloadTracks, previewGeneration:function(){return previewEpoch;},
    // 0.776: один голос тембра без состояния приложения — для замеров
    // офлайн-рендером (тест b39-timbre-voice-0776).
    renderSample:function(ctx,target,mode,midi,start,dur,level,expression){return playSample(ctx,target,mode,midi,start,dur,level,expression);},
      voicingFor: voicingFor, effectiveGain: effectiveGain, frequencyOf: frequencyOf,
      setMode: function (m) { if (['simple','piano','acoustic','rhodes','organ','pad'].indexOf(m)>=0) MODE = m; return MODE; },
      getMode: function () { return MODE; },
      setPedal: function (on) { PEDAL = !!on; return PEDAL; },
      setPartials: function (n) { var v = Number(n); if (v >= 1 && v <= 12) PARTIALS = Math.round(v); return PARTIALS; },
      setHeadroom: function (v) { var n = Number(v); if (n > 0 && n <= 1) HEADROOM = n; return HEADROOM; },
      stats: function () { return Object.assign({}, stats, { liveVoices: voices.size, channels: channels.size }); }
    });
    HOST.StruChordAudio = api;
  })(typeof window !== 'undefined' ? window : globalThis);
  // <<< B-39 STAGE3 END (KEYS AUDIO) <<<
  };
})();
