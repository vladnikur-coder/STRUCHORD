// >>> B-39 STAGE4 BEGIN (KEYS VOICING UI) <<<
// ==========================================================================
// B-39 · ЭТАП 4 (STAGE 4) — КЛАВИШНЫЕ АППЛИКАТУРЫ И ПАНЕЛЬ КЛАВИАТУРЫ
// --------------------------------------------------------------------------
// Что здесь:
//  1. renderFingeringSVG() оборачивается: когда активна клавишная дорожка,
//     вместо гитарного грифа рисуется компактная клавиатура (1–2 октавы)
//     с подсвеченными нотами, корнем и пальцами правой руки.
//  2. generateKeysVoicings() — варианты позиций (обращения/регистр) из
//     КАНОНИЧЕСКОЙ формулы: бас отдельной низкой нотой, минимальное движение
//     от предыдущего аккорда, при нехватке места приоритет тонов.
//  3. Отдельная закреплённая панель под панелью воспроизведения: ВСЯ
//     клавиатура выбранного размера (25/37/49/61/76/88), размер и тембр,
//     листание вариантов «‹ 2/5 ›», подсказка баса и пальцев.
//
// Правило R12: формула не урезается. Если выбранная клавиатура слишком мала
// и рука физически не берёт все тона, отбрасываются ПЕРВЫМИ квинта и
// ундецима, затем расширения; корень, терция и септима остаются всегда.
// Это ИНСТРУМЕНТНАЯ КОНВЕНЦИЯ, её надо занести в README.md (см. заметки).
//
// Никакой правки чужой разметки: свои стили и DOM создаются динамически.
// ==========================================================================
(function (HOST) {
  'use strict';

  var CSS = `
.b39-keys-btn { display: inline-flex; align-items: center; gap: .3rem;
  padding: 0 .5rem; height: 2.25rem; border-radius: .6rem; cursor: pointer;
  background: var(--color-surface, #fff); color: var(--color-text-primary, #1b1b1b);
  border: 1px solid var(--color-border-medium, #c9cdd4); font: inherit; font-size: .75rem; }
.b39-keys-btn[aria-pressed="true"] { border-color: var(--color-accent, #2f855a); }
.b39-keys-panel { position: fixed; z-index: 9998; max-width: calc(100vw - 1rem);
  background: var(--color-surface, #fff); color: var(--color-text-primary, #1b1b1b);
  border: 1px solid var(--color-border-medium, #c9cdd4); border-radius: .875rem;
  box-shadow: 0 .75rem 2rem rgba(0,0,0,.22); padding: .6rem .7rem; }
.b39-keys-panel[hidden] { display: none; }
.b39-keys-head { display: flex; align-items: center; gap: .45rem; flex-wrap: wrap;
  margin-bottom: .45rem; }
.b39-keys-title { font-size: .82rem; font-weight: 700; margin-right: .3rem; }
.b39-keys-panel select { font: inherit; font-size: .72rem; padding: .15rem .3rem;
  border-radius: .4rem; border: 1px solid var(--color-border-medium, #c9cdd4);
  background: var(--color-surface, #fff); color: inherit; }
.b39-keys-nav { display: inline-flex; align-items: center; gap: .25rem; }
.b39-keys-nav button { width: 1.4rem; height: 1.4rem; border-radius: .4rem;
  border: 1px solid var(--color-border-medium, #c9cdd4); background: transparent;
  color: inherit; cursor: pointer; padding: 0; font-size: .75rem; }
.b39-keys-count { font-size: .72rem; min-width: 2.6rem; text-align: center;
  color: var(--color-text-secondary, #666); }
.b39-keys-body { overflow-x: auto; overflow-y: hidden; }
.b39-keys-foot { margin-top: .35rem; font-size: .68rem; line-height: 1.4;
  color: var(--color-text-tertiary, #999); }
.fingering-svg-container svg.b39-keys-svg { max-width: 100%; height: auto; }
`;

  var WHITE_PC = [0, 2, 4, 5, 7, 9, 11];
  var VARIANT_COUNT = 5;
  var FINGERS = ['1', '2', '3', '4', '5'];
  var doc = HOST.document;
  var btn = null, panel = null, body = null, countEl = null, foot = null, titleEl = null;
  var sizeSel = null, timbreSel = null;
  var booted = false, wrapped = false;
  var lastChord = null, lastTrackId = null, lastCellKey = null;
  var variantState = new Map();       // 'trackId|chord' -> индекс (runtime-кэш)

  function tracks() { return HOST.StruChordTracks || null; }
  function formula() { return HOST.StruChordFormula || null; }
  function audio() { return HOST.StruChordAudio || null; }
  function mixer() { return HOST.StruChordMixer || null; }
  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function mod12(n) { return ((n % 12) + 12) % 12; }
  function firstMidiWithPc(low, pc) { return low + mod12(pc - mod12(low)); }
  function el(tag, cls, text) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  // ---------- Приоритет тонов (R12) ----------
  // Меньше ранг -> важнее. Квинта и ундецима уходят первыми.
  function toneRank(degree) {
    var d = String(degree || '');
    if (d === '1') return 0;
    if (d === '3' || d === 'b3') return 1;
    if (d === '7' || d === 'b7') return 2;
    if (d === '13' || d === 'b13' || d === '9' || d === 'b9' || d === '#9' || d === '6' || d === 'b6') return 3;
    if (d === '5' || d === 'b5' || d === '#5') return 4;
    if (d === '11' || d === '#11') return 5;
    return 6;
  }

  /** Сколько тонов реально помещается в правой руке. */
  function handLimit(size) { return size <= 25 ? 5 : size <= 49 ? 6 : 8; }

  /**
   * Варианты позиций. Возвращает массив массивов MIDI-нот.
   * Все варианты держат корень, терцию и септиму (приоритет тонов).
   */
  function generateKeysVoicings(chordName, key, range, prev, opts) {
    var F = formula();
    if (!F || typeof F.chordFormula !== 'function') return [];
    var f = F.chordFormula(chordName, key);
    if (!f || !f.tones || !f.tones.length) return [];
    var o = opts || {};
    var low = range.low, high = range.high;
    if (low > high) return [];
    var limit = o.maxTones || handLimit(range.size || 61);

    // Приоритет: сначала важные тона, потом второстепенные.
    var tones = f.tones.slice().sort(function (a, b) {
      return toneRank(a.degree) - toneRank(b.degree) || a.semitones - b.semitones;
    }).slice(0, limit).sort(function (a, b) { return a.semitones - b.semitones; });

    var rhLow = Math.max(low + 12, 48);
    var rhHigh = Math.min(high, 84);
    if (rhHigh < rhLow) rhHigh = Math.min(high, rhLow + 12);

    var bassPc = f.bass ? f.bass.pitchClass : f.rootPc;
    var bass = firstMidiWithPc(low, bassPc);
    if (bass > high) bass = high - mod12(high - bassPc);

    function fit(midis) {
      return midis.map(function (m) {
        while (m < rhLow) m += 12;
        while (m > rhHigh && m - 12 >= rhLow) m -= 12;
        return m;
      }).filter(function (m) { return m >= low && m <= high; });
    }
    function baseVoicing() {
      return fit(tones.map(function (t) { return firstMidiWithPc(rhLow, mod12(f.rootPc + t.semitones)); }));
    }
    var b0 = baseVoicing();
    var variants = [];
    function push(list) {
      var uniq = [];
      list.forEach(function (m) { if (uniq.indexOf(m) < 0) uniq.push(m); });
      uniq.sort(function (a, b) { return a - b; });
      var withBass = uniq.slice();
      if (bass >= low && bass <= high && withBass.indexOf(bass) < 0) withBass.unshift(bass);
      withBass = withBass.filter(function (m) { return m >= low && m <= high; }).slice(0, 9);
      if (!withBass.length) return;
      var sig = withBass.join(',');
      if (variants.some(function (v) { return v.signature === sig; })) return;
      variants.push({ signature: sig, notes: withBass });
    }

    // 0 — основная позиция; 1 — на октаву выше; 2 — первое обращение;
    // 3 — на октаву ниже; 4 — ближайшая к предыдущему аккорду.
    push(b0);
    push(fit(b0.map(function (m) { return m + 12 <= rhHigh ? m + 12 : m; })));
    if (b0.length > 1) push(fit(b0.slice(1).concat([b0[0] + 12])));
    push(fit(b0.map(function (m) { return m - 12 >= rhLow ? m - 12 : m; })));
    if (prev && prev.length) {
      var centre = prev.reduce(function (a, b) { return a + b; }, 0) / prev.length;
      push(fit(tones.map(function (t) {
        var pc = mod12(f.rootPc + t.semitones);
        var first = firstMidiWithPc(rhLow, pc), best = first, bestD = Math.abs(first - centre);
        for (var m = first + 12; m <= rhHigh; m += 12) {
          if (Math.abs(m - centre) < bestD) { best = m; bestD = Math.abs(m - centre); }
        }
        return best;
      })));
    }
    if (!variants.length) push(b0);
    return variants.map(function (v) { return v.notes; });
  }

  /** Индекс выбранного варианта: из модели дорожки или runtime-кэш. */
  function variantIndex(trackId, chord, cellKey) {
    var T = tracks();
    var fromModel = null;
    if (T && typeof T.voicingForChord === 'function') {
      fromModel = T.voicingForChord(trackId, chord);
      if (fromModel === null && cellKey && typeof T.track === 'function') {
        var t = T.track(trackId);
        if (t && t.voicings && Number.isInteger(t.voicings[cellKey])) fromModel = t.voicings[cellKey];
      }
    }
    if (Number.isInteger(fromModel)) return fromModel;
    var k = trackId + '|' + chord;
    return variantState.has(k) ? variantState.get(k) : 0;
  }
  function setVariantIndex(trackId, chord, cellKey, index, total) {
    var next = ((index % total) + total) % total;
    variantState.set(trackId + '|' + chord, next);
    var T = tracks();
    if (T && typeof T.setVoicingForChord === 'function') T.setVoicingForChord(trackId, chord, next);
    else if (T && cellKey && typeof T.setVoicing === 'function') T.setVoicing(trackId, cellKey, next);
    return next;
  }

  // ---------- Рендер клавиатуры в SVG ----------
  function keyLayout(low, high, whiteW, whiteH) {
    var keys = [], whites = 0;
    for (var m = low; m <= high; m++) {
      var pc = mod12(m), white = WHITE_PC.indexOf(pc) >= 0;
      var x = whites * whiteW;
      if (white) { keys.push({ midi: m, white: true, x: x }); whites++; }
      else keys.push({ midi: m, white: false, x: x });
    }
    return { keys: keys, whites: whites };
  }
  function noteLabel(midi, keyStyle) {
    var pc = mod12(midi);
    var sharp = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][pc];
    var flat = { 'C#':'Db','D#':'Eb','F#':'Gb','G#':'Ab','A#':'Bb', B:'Cb' };
    var name = keyStyle === 'flat' ? (flat[sharp] || sharp) : sharp;
    return name + (Math.floor(midi / 12) - 1);
  }

  /**
   * Рисует клавиатуру. low/high — границы MIDI, notes — подсвеченные ноты.
   * opts: { width, whiteW, whiteH, showFingers, rootPc, bassMidi, labelSpace }
   */
  function keyboardSVG(low, high, notes, opts) {
    var o = opts || {};
    var whiteW = o.whiteW || 16, whiteH = o.whiteH || 68;
    var blackW = Math.round(whiteW * 0.62), blackH = Math.round(whiteH * 0.62);
    var layout = keyLayout(low, high, whiteW, whiteH);
    var width = Math.max(1, layout.whites * whiteW);
    var labelSpace = o.labelSpace === undefined ? 22 : o.labelSpace;
    var height = whiteH + labelSpace;
    var accent = 'var(--color-accent, #2f855a)';
    var stroke = 'var(--color-border-medium, #c9cdd4)';
    var text = 'var(--color-text-primary, #1b1b1b)';
    var set = {}; (notes || []).forEach(function (n) { set[n] = true; });
    var parts = [];
    parts.push('<svg class="b39-keys-svg" xmlns="http://www.w3.org/2000/svg" ' +
      'viewBox="0 0 ' + width + ' ' + height + '" ' +
      (o.width ? 'width="' + o.width + '" ' : '') +
      'role="img" aria-label="Клавиши аккорда">');
    // белые
    layout.keys.forEach(function (k) {
      if (!k.white) return;
      var fill = set[k.midi] ? accent : 'var(--color-surface, #fff)';
      parts.push('<rect x="' + k.x + '" y="0" width="' + whiteW + '" height="' + whiteH +
        '" rx="2" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1"/>');
    });
    // чёрные
    layout.keys.forEach(function (k) {
      if (k.white) return;
      var x = k.x - blackW / 2;
      var fill = set[k.midi] ? accent : 'var(--color-text-primary, #1b1b1b)';
      parts.push('<rect x="' + x + '" y="0" width="' + blackW + '" height="' + blackH +
        '" rx="2" fill="' + fill + '" stroke="' + stroke + '" stroke-width="0.8"/>');
    });
    // подписи октав (только у ноты C)
    layout.keys.forEach(function (k) {
      if (k.white && mod12(k.midi) === 0) {
        parts.push('<text x="' + (k.x + 2) + '" y="' + (whiteH + 13) +
          '" font-size="9" fill="' + text + '">C' + (Math.floor(k.midi / 12) - 1) + '</text>');
      }
    });
    // корень — кружок, пальцы — цифры
    var rhNotes = (notes || []).filter(function (n) { return n >= low; });
    rhNotes.forEach(function (m, i) {
      var k = null;
      for (var j = 0; j < layout.keys.length; j++) if (layout.keys[j].midi === m) { k = layout.keys[j]; break; }
      if (!k) return;
      var cx = k.white ? k.x + whiteW / 2 : k.x;
      if (o.rootPc !== undefined && mod12(m) === o.rootPc) {
        parts.push('<circle cx="' + cx + '" cy="' + (whiteH - 10) + '" r="3.2" fill="#fff" opacity="0.9"/>');
      }
      if (o.showFingers) {
        var f = FINGERS[i % FINGERS.length];
        parts.push('<text x="' + cx + '" y="' + (whiteH - 3) + '" font-size="9" font-weight="700" ' +
          'text-anchor="middle" fill="' + text + '">' + f + '</text>');
      }
    });
    parts.push('</svg>');
    return { svg: parts.join(''), width: width, height: height, whites: layout.whites };
  }

  function showFingersEnabled() {
    try { var n = doc && doc.getElementById('showFingers'); return !!(n && n.checked); }
    catch (e) { return false; }
  }
  function currentKey() {
    try { return (typeof globalKey !== 'undefined' && globalKey) || 'C'; } catch (e) { return 'C'; }
  }
  function activeTrack() {
    var T = tracks(); if (!T) return null;
    var st = T.state(), out = null;
    st.tracks.forEach(function (t) { if (t.id === st.activeTrackId) out = t; });
    return { state: st, track: out };
  }

  /**
   * Компактная клавиатура для тултипа / закреплённой карточки / панели «Сейчас».
   * Показывает 1–2 октавы вокруг правой руки; бас вне окна — подписью.
   */
  function renderKeysVoicingSVG(chordName, trackId, opts) {
    var T = tracks(), F = formula();
    if (!T || !F || !chordName) return '';
    var o = opts || {};
    var range = T.keyRange(trackId);
    var variants = generateKeysVoicings(chordName, currentKey(), range, o.prev || null, {});
    if (!variants.length) return '';
    var idx = variantIndex(trackId, chordName, o.cellKey) % variants.length;
    var notes = variants[idx];
    var f = F.chordFormula(chordName, currentKey());
    var bass = notes.length ? notes[0] : null;
    var rh = notes.filter(function (n) { return n !== bass; });
    var lo = rh.length ? Math.min.apply(null, rh) : (bass || 60);
    var hi = rh.length ? Math.max.apply(null, rh) : lo;
    var start = Math.floor(lo / 12) * 12;
    var end = Math.max(start + 24, Math.ceil((hi + 1) / 12) * 12);
    if (end - start > 36) end = start + 36;
    var drawn = notes.filter(function (n) { return n >= start && n <= end; });
    var res = keyboardSVG(start, end, drawn, {
      whiteW: o.whiteW || 16, whiteH: o.whiteH || 66,
      showFingers: showFingersEnabled(), rootPc: f ? f.rootPc : undefined,
      labelSpace: 28
    });
    var extra = '';
    if (bass !== null && bass < start) extra = 'Бас: ' + esc(noteLabel(bass, f ? f.keyStyle : 'sharp'));
    var title = res.svg.replace('</svg>',
      '<text x="2" y="' + (res.height - 2) + '" font-size="9" fill="var(--color-text-tertiary,#999)">' +
      esc(extra || ('Окно ' + Math.round((end - start) / 12) + ' из ' + range.size + ' клавиш')) + '</text></svg>');
    return title;
  }

  /** Обёртка над renderFingeringSVG: гитара -> клавиши по активной дорожке. */
  function wrapFingeringRenderer() {
    if (wrapped || typeof HOST.renderFingeringSVG !== 'function') return;
    var original = HOST.renderFingeringSVG;
    HOST.renderFingeringSVG = function (fingers, bottomPad, opts) {
      var o = opts || {};
      var active = activeTrack();
      if (active && active.track && active.track.instrument === 'keys' && o.chord) {
        var svg = renderKeysVoicingSVG(o.chord, active.track.id, { cellKey: o.cellKey });
        if (svg) return svg;
      }
      return original.apply(this, arguments);
    };
    wrapped = true;
  }

  // ---------- Закреплённая панель клавиатуры ----------
  function injectCss() {
    if (!doc || doc.getElementById('b39KeysCss')) return;
    var st = el('style'); st.id = 'b39KeysCss'; st.textContent = CSS;
    (doc.head || doc.body).appendChild(st);
  }
  function buildDom() {
    if (!doc || !doc.body || btn) return;
    btn = el('button', 'transport-btn b39-keys-btn', '🎹 Клавиатура');
    btn.type = 'button'; btn.id = 'b39KeysBtn';
    btn.setAttribute('aria-pressed', 'false');
    btn.setAttribute('title', 'Показать клавиатуру выбранного размера');
    btn.addEventListener('click', togglePanel);

    panel = el('div', 'b39-keys-panel');
    panel.id = 'b39KeysPanel'; panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Клавиатура дорожки');

    var head = el('div', 'b39-keys-head');
    titleEl = el('span', 'b39-keys-title', 'Клавиши');
    sizeSel = el('select'); sizeSel.setAttribute('aria-label', 'Размер клавиатуры');
    [25, 37, 49, 61, 76, 88].forEach(function (n) {
      var op = el('option', '', n + ' клавиш'); op.value = String(n); sizeSel.appendChild(op);
    });
    sizeSel.addEventListener('change', function () {
      var T = tracks(); if (T) T.setKeyboardSize(Number(sizeSel.value));
      renderPanel();
    });
    timbreSel = el('select'); timbreSel.setAttribute('aria-label', 'Тембр');
    [['piano', 'Рояль'], ['simple', 'Простой тон'], ['epiano', 'Электропиано'], ['organ', 'Орган']]
      .forEach(function (pair) {
        var op = el('option', '', pair[1]); op.value = pair[0]; timbreSel.appendChild(op);
      });
    timbreSel.addEventListener('change', function () {
      var A = audio(); if (!A) return;
      A.setMode(timbreSel.value === 'simple' ? 'simple' : 'piano');
      A.setPartials(timbreSel.value === 'organ' ? 8 : timbreSel.value === 'epiano' ? 4 : 6);
    });
    var nav = el('div', 'b39-keys-nav');
    var prev = el('button', '', '‹'); prev.type = 'button'; prev.setAttribute('aria-label', 'Предыдущая позиция');
    prev.addEventListener('click', function () { stepVariant(-1); });
    countEl = el('span', 'b39-keys-count', '1/1');
    var next = el('button', '', '›'); next.type = 'button'; next.setAttribute('aria-label', 'Следующая позиция');
    next.addEventListener('click', function () { stepVariant(1); });
    nav.appendChild(prev); nav.appendChild(countEl); nav.appendChild(next);

    var close = el('button', '', '×'); close.type = 'button';
    close.setAttribute('aria-label', 'Закрыть'); close.style.cssText =
      'width:1.4rem;height:1.4rem;border-radius:.4rem;border:1px solid var(--color-border-medium,#c9cdd4);background:transparent;color:inherit;cursor:pointer';
    close.addEventListener('click', closePanel);

    head.appendChild(titleEl); head.appendChild(sizeSel); head.appendChild(timbreSel);
    head.appendChild(nav); head.appendChild(close);
    body = el('div', 'b39-keys-body');
    foot = el('div', 'b39-keys-foot', '');
    panel.appendChild(head); panel.appendChild(body); panel.appendChild(foot);
    doc.body.appendChild(panel);

    var mixerBtn = doc.getElementById('b39MixerBtn');
    var anchor = doc.getElementById('transportDockHint');
    if (mixerBtn && mixerBtn.parentNode) mixerBtn.parentNode.insertBefore(btn, mixerBtn.nextSibling);
    else if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(btn, anchor);
    else doc.body.appendChild(btn);
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panel && !panel.hidden) closePanel();
    });
  }
  function positionPanel() {
    if (!panel || !btn || !btn.getBoundingClientRect) return;
    var r = btn.getBoundingClientRect();
    var w = Math.min(760, (HOST.innerWidth || 1024) - 16);
    panel.style.width = w + 'px';
    panel.style.left = Math.max(8, Math.min((HOST.innerWidth || 1024) - w - 8, r.left)) + 'px';
    panel.style.top = (r.bottom + 8) + 'px';
  }
  function openPanel() { if (!panel) return; positionPanel(); panel.hidden = false; btn.setAttribute('aria-pressed', 'true'); renderPanel(); }
  function closePanel() { if (!panel) return; panel.hidden = true; btn.setAttribute('aria-pressed', 'false'); }
  function togglePanel() { if (!panel) return; panel.hidden ? openPanel() : closePanel(); }

  function stepVariant(delta) {
    var T = tracks(); if (!T || !lastChord) return;
    var active = activeTrack(); if (!active || !active.track) return;
    var range = T.keyRange(active.track.id);
    var variants = generateKeysVoicings(lastChord, currentKey(), range, null, {});
    if (!variants.length) return;
    var cur = variantIndex(active.track.id, lastChord, lastCellKey) % variants.length;
    setVariantIndex(active.track.id, lastChord, lastCellKey, cur + delta, variants.length);
    renderPanel();
    var M = mixer(); if (M && typeof M.render === 'function') { /* панель микшера не перерисовываем */ }
  }

  function renderPanel() {
    if (!panel || panel.hidden) return;
    var T = tracks(), F = formula();
    var active = activeTrack();
    if (!active || !active.track || active.track.instrument !== 'keys') {
      titleEl.textContent = 'Клавиши';
      body.innerHTML = '<div class="b39-keys-foot">Активная дорожка — гитара. Выберите клавишную строку в микшере.</div>';
      countEl.textContent = '—'; foot.textContent = '';
      return;
    }
    var range = T.keyRange(active.track.id);
    if (sizeSel && Number(sizeSel.value) !== range.size) sizeSel.value = String(range.size);
    var chord = lastChord || (F ? null : null);
    if (!chord) {
      // Берём первый непустой аккорд активной дорожки из сетки.
      try {
        T.eachCell(function (sec, sq, ev, ei, key) {
          if (chord) return;
          var c = T.trackChord(active.track.id, key, ev);
          if (c) { chord = c; lastCellKey = key; }
        });
      } catch (e) {}
    }
    if (!chord) {
      body.innerHTML = '<div class="b39-keys-foot">В песне пока нет аккордов.</div>';
      countEl.textContent = '—'; foot.textContent = '';
      return;
    }
    lastChord = chord; lastTrackId = active.track.id;
    var variants = generateKeysVoicings(chord, currentKey(), range, null, {});
    var idx = variantIndex(active.track.id, chord, lastCellKey) % Math.max(1, variants.length);
    var notes = variants.length ? variants[idx] : [];
    var f = F.chordFormula(chord, currentKey());
    var whiteW = range.size >= 88 ? 12 : range.size >= 61 ? 15 : 20;
    var res = keyboardSVG(range.low, range.high, notes, {
      whiteW: whiteW, whiteH: 78, showFingers: showFingersEnabled(),
      rootPc: f ? f.rootPc : undefined, labelSpace: 20
    });
    titleEl.textContent = chord;
    body.innerHTML = res.svg;
    countEl.textContent = (idx + 1) + '/' + Math.max(1, variants.length);
    var bass = notes.length ? notes[0] : null;
    foot.textContent = 'Размер ' + range.size + ' клавиш (' + range.first + '–' + range.last + ')' +
      (bass !== null ? ' · бас ' + noteLabel(bass, f ? f.keyStyle : 'sharp') : '') +
      (showFingersEnabled() ? ' · пальцы 1–5 — подсказка' : '');
  }

  function onAudioEvent(info) {
    var T = tracks(), active = activeTrack();
    if (T && active && active.track && info && info.ev) {
      var chord = T.trackChord(active.track.id, info.cell, info.ev);
      if (chord) lastChord = chord;
      lastCellKey = info.cell || lastCellKey;
      lastTrackId = active.track.id;
    }
    renderPanel();
  }

  function wrapAudioNotifier() {
    var A = audio();
    if (A && typeof A.setEventNotifier === 'function') A.setEventNotifier(onAudioEvent);
  }

  function setVoicingProvider() {
    var A = audio(), T = tracks();
    if (!A || typeof A.setVoicingProvider !== 'function' || !T) return;
    A.setVoicingProvider(function (chordName, key, range, prev, trackId) {
      var variants = generateKeysVoicings(chordName, key, range, prev, {});
      if (!variants.length) return null;
      var idx = variantIndex(trackId, chordName, null) % variants.length;
      return variants[idx];
    });
  }

  function boot() {
    if (booted) return;
    if (!doc || !doc.body) return;
    booted = true;
    injectCss();
    buildDom();
    wrapFingeringRenderer();
    wrapAudioNotifier();
    setVoicingProvider();
    var store = HOST.songStore;
    if (store && typeof store.subscribe === 'function') {
      try { store.subscribe(function () { renderPanel(); }); } catch (e) {}
    }
    renderPanel();
  }

  var api = Object.freeze({
    boot: boot, installRenderer: wrapFingeringRenderer,
    open: openPanel, close: closePanel, toggle: togglePanel, render: renderPanel,
    generateKeysVoicings: generateKeysVoicings, toneRank: toneRank, handLimit: handLimit,
    keyboardSVG: keyboardSVG, renderKeysVoicingSVG: renderKeysVoicingSVG,
    variantIndex: variantIndex, setVariantIndex: setVariantIndex, stepVariant: stepVariant,
    button: function () { return btn; }, panel: function () { return panel; },
    last: function () { return { chord: lastChord, cellKey: lastCellKey, trackId: lastTrackId }; }
  });
  HOST.StruChordKeys = api;

  // renderFingeringSVG и StruChordAudio определены позже по файлу —
  // оборачиваем после полной загрузки скрипта.
  if (typeof HOST.setTimeout === 'function') HOST.setTimeout(boot, 0);
  if (doc && doc.readyState === 'loading' && doc.addEventListener) doc.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
// <<< B-39 STAGE4 END (KEYS VOICING UI) <<<
