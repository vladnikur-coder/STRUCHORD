// >>> B-39 STAGE5 BEGIN (KEYS ACCOMPANIMENT) <<<
// ==========================================================================
// B-39 · ЭТАП 5 (STAGE 5) — ТИПЫ АККОМПАНИМЕНТА ДЛЯ КЛАВИШНЫХ ДОРОЖЕК
// --------------------------------------------------------------------------
// Что здесь:
//  1. Шесть пресетов: целый аккорд, арпеджио вверх, бас+аккорд, вальс,
//     Альберти-бас, октавный бас. Шаги хранятся ТОКЕНАМИ-РОЛЯМИ, а не
//     нотами: один и тот же рисунок сам следует за гармонией и за сменой
//     позиции (варианта) аккорда.
//  2. plan() — планировщик шагов. Уважает subdivision 1/2/3/4, свинг по
//     АБСОЛЮТНОЙ сетке квадрата, фазу ячейки при ресайзе и наследование
//     «ячейка -> секция -> пресет». Возвращает шаги с готовыми MIDI-нотами,
//     смещением и длительностью — ровно их и играет звуковой слой STAGE 3.
//  3. Панель «Аккомпанемент»: 6 кнопок, размер клавиатуры дорожки,
//     дробность, свинг, «Рисунок на такт» с подсветкой шагов, применение
//     к ячейке или к секции.
//  4. Перехват кнопки «Бой/перебор»: на активной клавишной дорожке она
//     называется «Аккомпанемент» и открывает ЭТУ панель. Гитара не тронута.
//
// Правило R12: в этом блоке нет гитарных аппликатур, струн и боёв. Ноты
// берутся только из канонической формулы (STAGE 0) и голосоведения
// (STAGE 4). Пятая и одиннадцатая ступени здесь НЕ выкидываются.
//
// Никакой правки чужой разметки: свои стили и DOM создаются динамически.
// ==========================================================================
(function (HOST) {
  'use strict';

  var doc = HOST.document;

  // ---------- Пресеты ----------
  var PRESETS = [
    { id: 'keys-block',        label: 'Целый аккорд', subdivision: 1, hint: 'аккорд на каждую долю' },
    { id: 'keys-arp-up',       label: 'Арпеджио ↑',   subdivision: 2, hint: 'тона аккорда снизу вверх' },
    { id: 'keys-bass-chord',   label: 'Бас + аккорд', subdivision: 1, hint: 'бас на 1 и 3, аккорд на 2 и 4' },
    { id: 'keys-waltz',        label: 'Вальс',        subdivision: 1, hint: 'бас — аккорд — аккорд' },
    { id: 'keys-alberti',      label: 'Альберти-бас', subdivision: 2, hint: 'корень — квинта — терция — квинта' },
    { id: 'keys-octave-bass',  label: 'Октавный бас', subdivision: 1, hint: 'корень через октаву + аккорд' }
  ];
  var DEFAULT_TYPE = 'keys-block';
  var SUBDIVISIONS = [1, 2, 3, 4];
  var MAX_STEPS = 64;

  // Токены шагов. H — весь аккорд; B — бас; O — корень через октаву;
  // A — следующий тон арпеджио вверх; t* — тон по интервалу.
  var TOKENS = ['H', 'B', 'O', 'A', 't1', 't3', 't5', 't7', 't9', 't11', 't13'];
  // Семейства полутонов в порядке предпочтения. sus2/sus4 не теряют ноту:
  // для t3 есть запасные 2 и 5 полутона, для t13 — секста.
  var FAMILY = {
    t1: [0], t3: [4, 3, 2, 5], t5: [7, 6, 8, 5],
    t7: [10, 11, 9], t9: [14, 13, 15, 2],
    t11: [17, 18, 5], t13: [21, 20, 9]
  };

  var CSS = [
    '.b39-acc-btn { display:inline-flex; align-items:center; gap:.3rem; padding:0 .5rem;',
    '  height:2.25rem; border-radius:.6rem; cursor:pointer; font:inherit; font-size:.75rem;',
    '  background:var(--color-surface,#fff); color:var(--color-text-primary,#1b1b1b);',
    '  border:1px solid var(--color-border-medium,#c9cdd4); }',
    '.b39-acc-btn[aria-pressed="true"] { border-color:var(--color-accent,#2f855a); }',
    '.b39-acc-panel { position:fixed; z-index:9999; right:.6rem; top:5.6rem;',
    '  width:min(24rem,calc(100vw - 1.2rem)); max-height:calc(100vh - 7rem); overflow:auto;',
    '  background:var(--color-surface,#fff); color:var(--color-text-primary,#1b1b1b);',
    '  border:1px solid var(--color-border-medium,#c9cdd4); border-radius:.875rem;',
    '  box-shadow:0 .75rem 2rem rgba(0,0,0,.22); padding:.65rem .75rem; font-size:.75rem; }',
    '.b39-acc-panel[hidden] { display:none; }',
    '.b39-acc-head { display:flex; align-items:center; gap:.4rem; margin-bottom:.5rem; }',
    '.b39-acc-title { font-size:.85rem; font-weight:700; flex:1; }',
    '.b39-acc-close { border:0; background:transparent; color:inherit; cursor:pointer; font-size:1rem; }',
    '.b39-acc-label { font-size:.68rem; color:var(--color-text-secondary,#666);',
    '  margin:.45rem 0 .25rem; text-transform:uppercase; letter-spacing:.04em; }',
    '.b39-acc-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.3rem; }',
    '.b39-acc-preset { text-align:left; padding:.35rem .45rem; border-radius:.5rem; cursor:pointer;',
    '  font:inherit; font-size:.72rem; line-height:1.25; color:inherit;',
    '  background:transparent; border:1px solid var(--color-border-medium,#c9cdd4); }',
    '.b39-acc-preset[aria-pressed="true"] { border-color:var(--color-accent,#2f855a);',
    '  background:var(--color-accent-soft,rgba(47,133,90,.12)); }',
    '.b39-acc-preset small { display:block; opacity:.7; font-size:.65rem; }',
    '.b39-acc-row { display:flex; align-items:center; flex-wrap:wrap; gap:.4rem; margin-top:.45rem; }',
    '.b39-acc-row select, .b39-acc-row button { font:inherit; font-size:.7rem; padding:.2rem .35rem;',
    '  border-radius:.4rem; border:1px solid var(--color-border-medium,#c9cdd4);',
    '  background:var(--color-surface,#fff); color:inherit; cursor:pointer; }',
    '.b39-acc-row button[aria-pressed="true"] { border-color:var(--color-accent,#2f855a); }',
    '.b39-acc-steps { display:flex; flex-wrap:wrap; gap:.15rem; margin-top:.3rem; }',
    '.b39-acc-step { width:1.35rem; height:1.35rem; display:grid; place-items:center;',
    '  border-radius:.3rem; border:1px solid var(--color-border-medium,#c9cdd4);',
    '  font-size:.65rem; transition:transform .05s linear, background-color .05s linear; }',
    '.b39-acc-step.is-on { background:var(--color-accent,#2f855a); color:#fff;',
    '  transform:translateY(-2px); }',
    '.b39-acc-foot { margin-top:.5rem; font-size:.65rem; line-height:1.45;',
    '  color:var(--color-text-tertiary,#999); }'
  ].join('\n');

  // ---------- Состояние ----------
  var booted = false, wrapped = false, observer = null;
  var btn = null, panel = null, gridEl = null, stepsEl = null, footEl = null;
  var sizeSel = null, subSel = null, swingBox = null, scopeCell = null, scopeSec = null;
  var draft = { type: DEFAULT_TYPE, subdivision: 1, swing: null };
  var current = { secId: null, sqId: null, ei: null, cellKey: null, scope: 'section', ts: '4/4' };
  var sharedRhythm = null;       // подглядываем subdivision/swing у ритма секции
  var timers = [];
  var stepObserver = null;
  var presetButtons = [];

  function tracks() { return HOST.StruChordTracks || null; }
  function keys() { return HOST.StruChordKeys || null; }
  function audio() { return HOST.StruChordAudio || null; }
  function formula() { return HOST.StruChordFormula || null; }

  function mod12(n) { return ((n % 12) + 12) % 12; }
  function isMidi(n) { return Number.isFinite(Number(n)) && Number(n) >= 0 && Number(n) <= 127; }
  function asc(a, b) { return a - b; }
  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function el(tag, cls, text) {
    if (!doc || !doc.createElement) return null;
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  // ---------- Пресеты и рисунок шагов ----------
  function preset(id) {
    for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) return PRESETS[i];
    return null;
  }
  function list() {
    return PRESETS.map(function (p) {
      return { id: p.id, label: p.label, subdivision: p.subdivision, hint: p.hint };
    });
  }
  /** Битые значения ОТБРАСЫВАЮТСЯ (правило README), а не зажимаются. */
  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    if (!preset(raw.type)) return null;
    var sub = Number(raw.subdivision);
    if (SUBDIVISIONS.indexOf(sub) < 0) return null;
    var swing = raw.swing === true ? true : (raw.swing === false ? false : null);
    return { type: raw.type, subdivision: sub, swing: swing };
  }
  function numerator(ts) {
    var m = /(\d+)\s*\/\s*(\d+)/.exec(String(ts || '4/4'));
    if (!m) return 4;
    return Math.min(32, Math.max(1, Number(m[1]) || 4));
  }

  /**
   * Рисунок на такт. Длина кратна beats * subdivision; при ресайзе ячейки
   * планировщик берёт из него ОКНО, а не начинает заново.
   */
  function buildSteps(type, sub, beats) {
    var n = Math.max(1, Math.round((Number(beats) || 4) * sub));
    n = Math.min(n, MAX_STEPS);
    var out = [], alberti = [['H', 't1'], 't5', 't3', 't5'], i, beat;
    for (i = 0; i < n; i++) {
      beat = Math.floor(i / sub);
      if (type === 'keys-arp-up') out.push('A');
      else if (type === 'keys-alberti') out.push((sub >= 2 || i % sub === 0) ? alberti[i % alberti.length] : null);
      else if (i % sub !== 0) out.push(null);
      else if (type === 'keys-block') out.push('H');
      else if (type === 'keys-bass-chord') out.push(beat % 2 === 0 ? 'B' : 'H');
      else if (type === 'keys-waltz') out.push(beat % 3 === 0 ? 'B' : 'H');
      else if (type === 'keys-octave-bass') out.push(beat % 2 === 0 ? 'O' : 'H');
      else out.push('H');
    }
    return out;
  }

  /** Наследование: ячейка -> секция -> дефолтный пресет. */
  function resolve(trackId, cellKey, sec) {
    var secId = sec && typeof sec === 'object' ? sec.id : sec;
    var T = tracks();
    var map = {};
    if (T && typeof T.track === 'function') {
      var t = T.track(trackId);
      if (t && t.patterns) map = t.patterns;
    }
    var v = null, source = 'default';
    if (cellKey) { v = normalize(map[String(cellKey)]); if (v) source = 'cell'; }
    if (!v && secId !== null && secId !== undefined) {
      v = normalize(map['s:' + secId]);
      if (v) source = 'section';
    }
    if (!v) {
      var p = preset(DEFAULT_TYPE);
      return { type: DEFAULT_TYPE, subdivision: p.subdivision, swing: null, source: 'default' };
    }
    return { type: v.type, subdivision: v.subdivision, swing: v.swing, source: source };
  }

  // ---------- Сетка, свинг, фаза ----------
  function swingOffset(node, sub, swing) {
    // Тот же закон, что у свинга приложения (B-56/B-63): пары восьмых
    // считаются от НАЧАЛА КВАДРАТА, вторая нота уезжает на 2/3.
    if (typeof swingStepOffsetUnits === 'function') {
      try { return swingStepOffsetUnits(node, sub, swing); } catch (e) {}
    }
    if (!swing || !(sub === 2 || sub === 4)) return node / sub;
    var pairIdx = Math.floor(node / 2);
    var inPair = ((node % 2) + 2) % 2;
    var pairsPerBeat = sub / 2;
    return pairIdx / pairsPerBeat + (inPair === 0 ? 0 : (1 / pairsPerBeat) * (2 / 3));
  }
  function squareOffset(sq, ei, ts) {
    if (typeof getSquareEventOffsetUnits === 'function') {
      try { return Number(getSquareEventOffsetUnits(sq, ei, ts)) || 0; } catch (e) {}
    }
    var sum = 0;
    if (sq && Array.isArray(sq.events)) {
      var lim = Math.min(Number(ei) || 0, sq.events.length);
      for (var i = 0; i < lim; i++) sum += Number(sq.events[i] && sq.events[i].span) || 1;
    }
    return sum;
  }

  // ---------- Токены -> MIDI-ноты ----------
  function tonePitchClass(f, token) {
    if (!f || !Array.isArray(f.tones)) return null;
    var fam = FAMILY[token];
    if (!fam) return null;
    for (var j = 0; j < fam.length; j++) {
      for (var k = 0; k < f.tones.length; k++) {
        if (f.tones[k].semitones === fam[j]) return mod12(f.tones[k].pitchClass);
      }
    }
    return null;
  }
  function pickMidi(notes, pc, low, high) {
    for (var i = 0; i < notes.length; i++) if (mod12(notes[i]) === pc) return notes[i];
    if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
    var m = low + mod12(pc - mod12(low));
    return m <= high ? m : null;
  }
  function tokenContext(o, notes) {
    var F = formula();
    var f = null;
    if (F && typeof F.chordFormula === 'function') {
      try { f = F.chordFormula(o.chord, o.key); } catch (e) { f = null; }
    }
    var range = o.range || {};
    var low = Number(range.low), high = Number(range.high);
    var bass = notes.length ? notes[0] : null;
    var rh = notes.length > 1 ? notes.slice(1) : notes.slice();
    return {
      notes: notes, rh: rh, bass: bass, formula: f,
      low: low, high: high,
      inRange: function (m) {
        return (!Number.isFinite(low) || m >= low) && (!Number.isFinite(high) || m <= high);
      }
    };
  }
  function tokenNotes(token, C, nextArp) {
    if (token === null || token === undefined || token === '' || token === '_') return [];
    var list = Array.isArray(token) ? token : [token];
    var out = [];
    list.forEach(function (t) {
      var midis = [];
      if (t === 'H') midis = C.notes.slice();
      else if (t === 'B') midis = C.bass === null ? [] : [C.bass];
      else if (t === 'O') {
        midis = C.bass === null ? [] : [C.bass, C.bass + 12].filter(C.inRange);
      } else if (t === 'A') {
        midis = C.rh.length ? [C.rh[nextArp() % C.rh.length]] : [];
      } else if (FAMILY[t]) {
        var pc = tonePitchClass(C.formula, t);
        var m = pc === null ? null : pickMidi(C.notes, pc, C.low, C.high);
        midis = m === null ? [] : [m];
      }
      midis.forEach(function (m) { if (out.indexOf(m) < 0) out.push(m); });
    });
    return out;
  }

  /**
   * Главный планировщик. Возвращает массив шагов:
   * { index, stepIndex, token, at, dur, notes, subdivision, swing, type, source }
   * at/dur — секунды ОТ начала ячейки; звук и подсветка берут их из одного
   * и того же массива, поэтому совпадают всегда.
   */
  function plan(o) {
    o = o || {};
    var cfg = resolve(o.trackId, o.cell, o.sec);
    var sub = cfg.subdivision;
    var swingOn = !o.noSwing && (cfg.swing === true ||
      (cfg.swing === null && sharedRhythm && sharedRhythm.swing === true)) &&
      (sub === 2 || sub === 4);
    var notes = (Array.isArray(o.notes) ? o.notes : [])
      .map(Number).filter(isMidi).slice().sort(asc);
    var ev = o.ev || {};
    var span = Math.max(0.25, Number(o.span) || Number(ev.span) || 1);
    var dur = Math.max(0.05, Number(o.dur) || 0.5);
    var unit = dur / span;
    var beats = cfg.source === 'cell' ? span : numerator(o.ts || current.ts);
    var base = buildSteps(cfg.type, sub, beats);
    var own = cfg.source === 'cell';
    var offset = own ? 0 : squareOffset(o.sq, o.ei, o.ts);
    var phase = own ? 0 : Math.max(0, Math.ceil((offset - 1e-9) * sub) / sub - offset);
    var baseNode = Math.round((offset + phase) * sub);
    var startStep = own ? 0 : ((baseNode % base.length) + base.length) % base.length;
    var count = Math.min(MAX_STEPS, Math.max(1, Math.round(span * sub)));
    var C = tokenContext(o, notes);
    var arp = 0, out = [];
    for (var i = 0; i < count; i++) {
      var at = (swingOffset(baseNode + i, sub, swingOn) - offset) * unit;
      var next = (swingOffset(baseNode + i + 1, sub, swingOn) - offset) * unit;
      if (at < 0) at = 0;
      if (at >= dur - 0.005) break;             // шаг за правой границей ячейки
      var len = Math.max(0.02, next - at);
      if (at + len > dur) len = dur - at;
      var token = base[(startStep + i) % base.length];
      out.push({
        index: out.length,
        stepIndex: (startStep + i) % base.length,
        token: token,
        at: at,
        dur: len,
        notes: tokenNotes(token, C, function () { return arp++; }),
        subdivision: sub, swing: !!swingOn, type: cfg.type, source: cfg.source
      });
    }
    if (o.ctx && typeof o.evStart === 'number') scheduleHighlights(o, out);
    if (stepObserver) {
      try { stepObserver({ cell: o.cell, trackId: o.trackId, cfg: cfg, steps: out }); } catch (e) {}
    }
    return out;
  }

  // ---------- Подсветка шагов ----------
  function scheduleHighlights(o, steps) {
    // DOM может появиться позже (boot на DOMContentLoaded), а звук уже идёт:
    // таймеры ставим всегда, highlightStep сам проверит наличие чипов.
    if (typeof HOST.setTimeout !== 'function') return;
    var now = o.ctx && Number.isFinite(o.ctx.currentTime) ? o.ctx.currentTime : 0;
    steps.forEach(function (st) {
      var delay = Math.max(0, (o.evStart + st.at - now) * 1000);
      var id = HOST.setTimeout(function () { highlightStep(st.index); }, delay);
      if (id !== undefined && id !== null) timers.push(id);
    });
  }
  function highlightStep(index) {
    if (!stepsEl || !stepsEl.children) return;
    for (var i = 0; i < stepsEl.children.length; i++) {
      stepsEl.children[i].classList.toggle('is-on', Number(stepsEl.children[i].dataset.step) === index);
    }
  }
  function clearHighlights() {
    if (typeof HOST.clearTimeout === 'function') {
      timers.forEach(function (id) { try { HOST.clearTimeout(id); } catch (e) {} });
    }
    timers = [];
    if (stepsEl && stepsEl.children) {
      for (var i = 0; i < stepsEl.children.length; i++) stepsEl.children[i].classList.remove('is-on');
    }
  }
  function setStepObserver(fn) { stepObserver = typeof fn === 'function' ? fn : null; return !!stepObserver; }

  /** Хук из schedulePatternForEvent: общий ритм секции (сетка и свинг). */
  function adoptRhythm(pattern, ts, bpm, sec, square, eventIndex, evStart, dur) {
    if (!pattern || typeof pattern !== 'object') return;
    var sub = Number(pattern.subdivision);
    sharedRhythm = {
      subdivision: SUBDIVISIONS.indexOf(sub) >= 0 ? sub : 1,
      swing: !!(pattern.swing && typeof patternHasSwing === 'function'
        ? patternHasSwing(pattern) : pattern.swing),
      ts: String(ts || '4/4'),
      secId: sec && sec.id !== undefined ? sec.id : null
    };
  }
  function rhythm() { return sharedRhythm ? Object.assign({}, sharedRhythm) : null; }

  // ---------- UI ----------
  function activeIsKeys() {
    var T = tracks();
    if (!T || typeof T.state !== 'function' || typeof T.track !== 'function') return false;
    var st = null;
    try { st = T.state(); } catch (e) { return false; }
    var t = T.track(st.activeTrackId);
    return !!(t && t.instrument === 'keys');
  }
  function injectCss() {
    if (!doc || !doc.createElement || (!doc.head && !doc.body)) return;
    if (doc.querySelector && doc.querySelector('[data-b39-acc-css]')) return;
    var st = doc.createElement('style');
    st.setAttribute('data-b39-acc-css', '1');
    st.textContent = CSS;
    (doc.head || doc.body).appendChild(st);
  }
  function buildDom() {
    if (!doc || !doc.body || btn) return;
    btn = el('button', 'transport-btn b39-acc-btn', '🎼 Аккомпанемент');
    if (!btn) return;
    btn.type = 'button'; btn.id = 'b39AccBtn';
    btn.setAttribute('aria-pressed', 'false');
    btn.setAttribute('title', 'Типы аккомпанимента клавишной дорожки');
    btn.addEventListener('click', togglePanel);

    panel = el('div', 'b39-acc-panel');
    panel.id = 'b39AccPanel'; panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Аккомпанемент');

    var head = el('div', 'b39-acc-head');
    head.appendChild(el('span', 'b39-acc-title', 'Аккомпанемент'));
    var close = el('button', 'b39-acc-close', '×');
    close.type = 'button'; close.setAttribute('aria-label', 'Закрыть');
    close.addEventListener('click', closePanel);
    head.appendChild(close);
    panel.appendChild(head);

    panel.appendChild(el('div', 'b39-acc-label', 'Тип рисунка'));
    gridEl = el('div', 'b39-acc-grid');
    PRESETS.forEach(function (p) {
      var b = el('button', 'b39-acc-preset');
      b.type = 'button';
      b.setAttribute('data-preset', p.id);
      b.setAttribute('aria-pressed', 'false');
      b.appendChild(el('span', '', p.label));
      b.appendChild(el('small', '', p.hint));
      b.addEventListener('click', function () {
        draft.type = p.id;
        draft.subdivision = p.subdivision;
        apply(); renderPanel();
      });
      presetButtons.push(b);
      gridEl.appendChild(b);
    });
    panel.appendChild(gridEl);

    panel.appendChild(el('div', 'b39-acc-label', 'Клавиатура'));
    var sizeRow = el('div', 'b39-acc-row');
    sizeSel = el('select');
    sizeSel.setAttribute('aria-label', 'Размер клавиатуры дорожки');
    sizeSel.addEventListener('change', function () {
      var T = tracks(); if (!T) return;
      var st = T.state();
      var v = sizeSel.value;
      T.setTrackKeyboardSize(st.activeTrackId, v === '' ? null : Number(v));
      var K = keys(); if (K && typeof K.render === 'function') K.render();
      renderPanel();
    });
    sizeRow.appendChild(sizeSel);
    panel.appendChild(sizeRow);

    panel.appendChild(el('div', 'b39-acc-label', 'Рисунок на такт'));
    var gridRow = el('div', 'b39-acc-row');
    subSel = el('select');
    subSel.setAttribute('aria-label', 'Дробность шагов');
    [1, 2, 3, 4].forEach(function (n) {
      var op = el('option', '', n === 1 ? '♩ четверти' : n === 2 ? '♪ восьмые' : n === 3 ? '♫ триоли' : '♬ шестнадцатые');
      op.value = String(n); subSel.appendChild(op);
    });
    subSel.addEventListener('change', function () {
      draft.subdivision = Number(subSel.value);
      apply(); renderPanel();
    });
    gridRow.appendChild(subSel);
    swingBox = el('input');
    swingBox.type = 'checkbox'; swingBox.id = 'b39AccSwing';
    swingBox.setAttribute('aria-label', 'Свинг');
    swingBox.addEventListener('change', function () {
      draft.swing = swingBox.checked;
      apply(); renderPanel();
    });
    var swingLabel = el('label', '');
    swingLabel.appendChild(swingBox);
    swingLabel.appendChild(doc.createTextNode(' свинг'));
    gridRow.appendChild(swingLabel);
    panel.appendChild(gridRow);

    stepsEl = el('div', 'b39-acc-steps');
    stepsEl.id = 'b39AccSteps';
    panel.appendChild(stepsEl);

    panel.appendChild(el('div', 'b39-acc-label', 'Применить к'));
    var scopeRow = el('div', 'b39-acc-row');
    scopeCell = el('button', '', 'ячейке'); scopeCell.type = 'button';
    scopeCell.setAttribute('data-scope', 'cell');
    scopeSec = el('button', '', 'секции'); scopeSec.type = 'button';
    scopeSec.setAttribute('data-scope', 'section');
    [scopeCell, scopeSec].forEach(function (b) {
      b.addEventListener('click', function () {
        current.scope = b.getAttribute('data-scope');
        apply(); renderPanel();
      });
    });
    var reset = el('button', '', 'сбросить');
    reset.type = 'button'; reset.setAttribute('aria-label', 'Сбросить свои рисунки');
    reset.addEventListener('click', clearScopes);
    scopeRow.appendChild(scopeCell); scopeRow.appendChild(scopeSec); scopeRow.appendChild(reset);
    panel.appendChild(scopeRow);

    footEl = el('div', 'b39-acc-foot', '');
    panel.appendChild(footEl);

    var wrap = el('span', 'b39-acc-wrap');
    wrap.appendChild(btn);
    var anchor = doc.getElementById('transportDockHint');
    var bar = doc.querySelector && doc.querySelector('.transport-bar');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(wrap, anchor);
    else if (bar) bar.appendChild(wrap);
    else doc.body.appendChild(wrap);
    doc.body.appendChild(panel);
  }

  function glyph(token) {
    if (token === null || token === undefined || token === '_') return '·';
    if (Array.isArray(token)) return '▮♪';
    if (token === 'H') return '▮';
    if (token === 'B') return '●';
    if (token === 'O') return '◎';
    if (token === 'A') return '↑';
    return '♪';
  }
  function renderSteps() {
    if (!stepsEl) return;
    var ts = (sharedRhythm && sharedRhythm.ts) || current.ts || '4/4';
    var arr = buildSteps(draft.type, draft.subdivision, numerator(ts));
    stepsEl.textContent = '';
    arr.forEach(function (token, i) {
      var c = el('span', 'b39-acc-step', glyph(token));
      c.dataset.step = String(i);
      c.title = 'Шаг ' + (i + 1) + (token ? ' · ' + (Array.isArray(token) ? token.join('+') : token) : ' · пауза');
      stepsEl.appendChild(c);
    });
  }
  function renderSizeOptions() {
    if (!sizeSel) return;
    var T = tracks();
    var songSize = 61, trackSize = null;
    if (T) {
      try {
        var st = T.state();
        songSize = st.keyboardSize || 61;
        var t = T.track(st.activeTrackId);
        trackSize = t && t.keyboardSize !== undefined ? t.keyboardSize : null;
      } catch (e) {}
    }
    sizeSel.textContent = '';
    var def = el('option', '', 'как в песне (' + songSize + ')');
    def.value = ''; sizeSel.appendChild(def);
    [25, 37, 49, 61, 76, 88].forEach(function (n) {
      var op = el('option', '', n + ' клавиш'); op.value = String(n); sizeSel.appendChild(op);
    });
    sizeSel.value = trackSize === null || trackSize === undefined ? '' : String(trackSize);
  }
  function resolveForScope() {
    var T = tracks();
    if (!T || typeof T.state !== 'function') return null;
    var st = T.state();
    // Показываем настройку ИМЕННО выбранной области: редактируем секцию —
    // личный рисунок ячейки не должен подменять её пресет в панели.
    return resolve(st.activeTrackId, current.scope === 'cell' ? current.cellKey : null, current.secId);
  }
  function renderPanel() {
    if (!panel) return;
    var cfg = resolveForScope();
    if (cfg) draft = { type: cfg.type, subdivision: cfg.subdivision, swing: cfg.swing };
    var inheritedSwing = draft.swing === null && sharedRhythm && sharedRhythm.swing === true;
    presetButtons.forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-preset') === draft.type));
    });
    if (subSel) subSel.value = String(draft.subdivision);
    if (swingBox) {
      swingBox.checked = draft.swing === true || !!inheritedSwing;
      swingBox.disabled = !(draft.subdivision === 2 || draft.subdivision === 4);
      swingBox.title = swingBox.disabled ? 'Свинг доступен при дробности 2 или 4' : 'Свинг';
    }
    if (scopeCell) scopeCell.setAttribute('aria-pressed', String(current.scope === 'cell'));
    if (scopeSec) scopeSec.setAttribute('aria-pressed', String(current.scope === 'section'));
    renderSizeOptions(); renderSteps();
    if (footEl) {
      footEl.textContent = activeIsKeys()
        ? 'Активная дорожка — Клавиши. Рисунок играет её же позицией аккорда; гитарный бой звучит отдельно.'
        : 'Активная дорожка — Гитара. Выберите клавишную дорожку в микшере, чтобы задать ей аккомпанемент.';
    }
  }
  function openPanel() {
    guessScope();
    if (panel) { panel.hidden = false; if (btn) btn.setAttribute('aria-pressed', 'true'); }
    renderPanel();
  }
  function closePanel() {
    if (panel) { panel.hidden = true; if (btn) btn.setAttribute('aria-pressed', 'false'); }
  }
  function togglePanel() { if (panel && !panel.hidden) closePanel(); else openPanel(); }

  function guessScope() {
    if (current.secId !== null && current.secId !== undefined) return;
    var secs = [];
    try { if (typeof sections !== 'undefined' && Array.isArray(sections)) secs = sections; } catch (e) {}
    if (!secs.length && Array.isArray(HOST.__b39Sections)) secs = HOST.__b39Sections;
    if (!secs.length) return;
    var s0 = secs[0], q0 = s0 && Array.isArray(s0.squares) ? s0.squares[0] : null;
    if (!s0 || !q0) return;
    current.secId = s0.id;
    current.sqId = q0.id;
    current.ei = 0;
    current.cellKey = s0.id + ':' + q0.id + ':0';
    current.scope = 'section';
  }
  function setEditorScope(scope, secId, sqId, ei) {
    current.secId = secId;
    current.sqId = sqId;
    current.ei = ei;
    current.cellKey = (scope === 'event' && sqId !== undefined && sqId !== null &&
      ei !== undefined && ei !== null) ? secId + ':' + sqId + ':' + ei : null;
    current.scope = scope === 'event' ? 'cell' : 'section';
  }
  function apply() {
    var T = tracks();
    if (!T || typeof T.setPattern !== 'function' || !activeIsKeys()) return false;
    var st = T.state();
    var key = current.scope === 'cell' && current.cellKey
      ? current.cellKey
      : (current.secId !== null && current.secId !== undefined ? 's:' + current.secId : null);
    if (!key) return false;
    var payload = { type: draft.type, subdivision: draft.subdivision };
    // null = «как в ритме секции». Явно не пишем, пока пользователь сам
    // не тронул галочку свинга — наследование тогда сохраняется.
    if (draft.swing !== null) payload.swing = draft.swing;
    return T.setPattern(st.activeTrackId, key, payload);
  }
  function clearScopes() {
    var T = tracks();
    if (!T || typeof T.clearPattern !== 'function') return;
    var st = T.state();
    if (current.cellKey) T.clearPattern(st.activeTrackId, current.cellKey);
    if (current.secId !== null && current.secId !== undefined) T.clearPattern(st.activeTrackId, 's:' + current.secId);
    renderPanel();
  }

  /** Кнопка «Бой/перебор» на клавишной дорожке ведёт сюда. */
  function wrapEditor() {
    if (wrapped || typeof HOST.openStrumPatternEditor !== 'function') return;
    var orig = HOST.openStrumPatternEditor;
    HOST.openStrumPatternEditor = function (scope, sectionId, squareId, eventIndex) {
      if (activeIsKeys()) {
        setEditorScope(scope, sectionId, squareId, eventIndex);
        openPanel();
        return undefined;
      }
      return orig.apply(this, arguments);
    };
    wrapped = true;
  }
  /** Свойство видимых кнопок: гитара — «Бой/перебор», клавиши — «Аккомпанемент». */
  function relabel() {
    if (!doc || !doc.querySelectorAll) return;
    var on = activeIsKeys();
    var nodes = doc.querySelectorAll('.chord-btn-strum, .strum-badge-wrap, [title*="Бой/перебор"], [data-b39-acc-label]');
    Array.prototype.forEach.call(nodes, function (n) {
      if (!n.dataset) return;
      if (n.dataset.b39AccOrigTitle === undefined) n.dataset.b39AccOrigTitle = n.getAttribute('title') || '';
      if (n.dataset.b39AccOrigText === undefined) n.dataset.b39AccOrigText = n.textContent || '';
      var want = on ? 'Аккомпанемент клавишной дорожки — нажмите, чтобы изменить'
        : n.dataset.b39AccOrigTitle;
      if ((n.getAttribute('title') || '') !== want) n.setAttribute('title', want);
      if (n.dataset.b39AccLabel !== '1') n.dataset.b39AccLabel = '1';
      if (n.classList && n.classList.contains('chord-btn-strum')) {
        var text = on ? 'аккомп.' : n.dataset.b39AccOrigText;
        if (n.textContent !== text) n.textContent = text;
      }
    });
  }
  function watchDom() {
    if (observer || !doc || !doc.body || typeof HOST.MutationObserver !== 'function') return;
    try {
      observer = new HOST.MutationObserver(function () { relabel(); });
      observer.observe(doc.body, { childList: true, subtree: true });
    } catch (e) { observer = null; }
  }

  function boot() {
    if (booted) return;
    if (!doc || !doc.body) return;
    booted = true;
    injectCss(); buildDom(); wrapEditor(); watchDom();
    var A = audio();
    if (A && typeof A.setPatternPlanner === 'function') A.setPatternPlanner(plan);
    var store = HOST.songStore;
    if (store && typeof store.subscribe === 'function') {
      try { store.subscribe(function () { relabel(); renderPanel(); }); } catch (e) {}
    }
    relabel(); renderPanel();
  }

  var api = Object.freeze({
    boot: boot, plan: plan, resolve: resolve, buildSteps: buildSteps,
    normalize: normalize, preset: preset, list: list, tokens: function () { return TOKENS.slice(); },
    adoptRhythm: adoptRhythm, rhythm: rhythm,
    open: openPanel, close: closePanel, toggle: togglePanel, render: renderPanel,
    setEditorScope: setEditorScope, apply: apply, clearScopes: clearScopes,
    relabel: relabel, activeIsKeys: activeIsKeys,
    highlightStep: highlightStep, clearHighlights: clearHighlights, setStepObserver: setStepObserver,
    button: function () { return btn; }, panel: function () { return panel; },
    stepsElement: function () { return stepsEl; },
    draft: function () { return Object.assign({}, draft); },
    scope: function () { return Object.assign({}, current); }
  });
  HOST.StruChordAccomp = api;

  if (typeof HOST.setTimeout === 'function') HOST.setTimeout(boot, 0);
  if (doc && doc.readyState === 'loading' && doc.addEventListener) doc.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
// <<< B-39 STAGE5 END (KEYS ACCOMPANIMENT) <<<
