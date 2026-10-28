// >>> B-39 STAGE2 BEGIN (MIXER UI) <<<
// ==========================================================================
// B-39 · ЭТАП 2 (STAGE 2) — МИКШЕР ДОРОЖЕК
// --------------------------------------------------------------------------
// Кнопка в панели воспроизведения открывает панель со строками дорожек.
// В строке: ручка перетаскивания, имя и инструмент, громкость, M, S, «⋯».
// Клик по строке делает дорожку активной. «+» спрашивает инструмент и
// создаёт копию активной дорожки. «⋯» меняет инструмент.
//
// ВСЁ создаётся динамически: ни одного изменения в HTML-разметке и CSS
// приложения. Свои стили — в отдельном <style> с префиксом b39-, цвета
// берутся из семантических переменных темы (светлая/тёмная, 15 палитр).
//
// 60 fps: при перетаскивании двигается ТОЛЬКО transform одной строки;
// прямоугольники строк измеряются один раз на pointerdown; коммит модели —
// один раз на pointerup. Полный render() на pointermove не вызывается.
// ==========================================================================
(function (HOST) {
  'use strict';

  var CSS = `
.b39-wrap { position: relative; display: inline-flex; align-items: center; }
.b39-btn { display: inline-flex; align-items: center; gap: .35rem;
  padding: 0 .55rem; height: 2.25rem; border-radius: .6rem; cursor: pointer;
  background: var(--color-surface, #fff); color: var(--color-text-primary, #1b1b1b);
  border: 1px solid var(--color-border-medium, #c9cdd4); font: inherit; }
.b39-btn:hover { border-color: var(--color-accent, #2f855a); }
.b39-btn[aria-expanded="true"] { border-color: var(--color-accent, #2f855a); }
.b39-btn-icon { width: 1rem; height: 1rem; display: inline-block; }
.b39-btn-label { font-size: .75rem; max-width: 6.5rem; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; color: var(--color-text-secondary, #666); }
.b39-panel { position: fixed; width: 20rem; max-width: calc(100vw - 1rem);
  max-height: 70vh; overflow: auto; z-index: 9999;
  background: var(--color-surface, #fff); color: var(--color-text-primary, #1b1b1b);
  border: 1px solid var(--color-border-medium, #c9cdd4); border-radius: .875rem;
  box-shadow: 0 .75rem 2rem rgba(0,0,0,.22); padding: .75rem; }
.b39-panel[hidden], .b39-chooser[hidden], .b39-menu[hidden], .b39-empty[hidden] { display: none; }
.b39-head { display: flex; align-items: center; gap: .5rem; margin-bottom: .5rem; }
.b39-head strong { font-size: .9rem; }
.b39-head .b39-hint { font-size: .68rem; color: var(--color-text-tertiary, #888); }
.b39-close { margin-left: auto; border: 0; background: transparent; cursor: pointer;
  font-size: 1.1rem; line-height: 1; color: inherit; padding: .2rem .4rem; }
.b39-row { display: flex; align-items: center; gap: .4rem; padding: .4rem;
  border-radius: .6rem; border: 1px solid transparent; margin-bottom: .3rem;
  background: var(--color-background-secondary, rgba(127,127,127,.07));
  touch-action: none; }
.b39-row.is-active { border-color: var(--color-accent, #2f855a); }
.b39-row.is-dragging { opacity: .9; z-index: 2; position: relative;
  box-shadow: 0 .4rem 1rem rgba(0,0,0,.25); }
.b39-row.is-drop-target { border-top: 2px solid var(--color-accent, #2f855a); }
.b39-handle { cursor: grab; user-select: none; color: var(--color-text-tertiary, #999);
  padding: 0 .15rem; font-size: 1rem; }
.b39-select { display: flex; align-items: center; gap: .35rem; flex: 1 1 auto;
  min-width: 0; border: 0; background: transparent; color: inherit; cursor: pointer;
  text-align: left; padding: .15rem; font: inherit; }
.b39-dot { width: .55rem; height: .55rem; border-radius: 50%; flex: 0 0 auto;
  background: transparent; border: 1px solid var(--color-text-tertiary, #999); }
.b39-row.is-active .b39-dot { background: var(--color-accent, #2f855a); border-color: transparent; }
.b39-name { font-size: .8rem; font-weight: 600; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; }
.b39-badge { font-size: .62rem; padding: .05rem .35rem; border-radius: .4rem;
  background: var(--color-background-secondary, rgba(127,127,127,.14));
  color: var(--color-text-secondary, #666); flex: 0 0 auto; }
.b39-vol { width: 4.5rem; flex: 0 0 auto; }
.b39-ms { display: inline-flex; gap: .15rem; flex: 0 0 auto; }
.b39-ms button, .b39-dots { width: 1.5rem; height: 1.5rem; border-radius: .4rem;
  border: 1px solid var(--color-border-medium, #c9cdd4); background: transparent;
  color: inherit; cursor: pointer; font-size: .68rem; font-weight: 700; padding: 0; }
.b39-ms button[aria-pressed="true"] { background: var(--color-accent, #2f855a);
  color: var(--color-on-accent, #fff); border-color: transparent; }
.b39-add { width: 100%; margin-top: .35rem; padding: .5rem; border-radius: .6rem;
  border: 1px dashed var(--color-border-medium, #c9cdd4); background: transparent;
  color: inherit; cursor: pointer; font: inherit; font-size: .8rem; }
.b39-add:hover { border-color: var(--color-accent, #2f855a); }
.b39-chooser, .b39-menu { margin-top: .4rem; padding: .5rem; border-radius: .6rem;
  border: 1px solid var(--color-border-medium, #c9cdd4);
  background: var(--color-background-secondary, rgba(127,127,127,.07)); }
.b39-chooser-title { font-size: .72rem; margin-bottom: .4rem;
  color: var(--color-text-secondary, #666); }
.b39-choices { display: flex; gap: .4rem; flex-wrap: wrap; }
.b39-choice { padding: .4rem .7rem; border-radius: .5rem; cursor: pointer;
  border: 1px solid var(--color-border-medium, #c9cdd4);
  background: var(--color-surface, #fff); color: inherit; font: inherit; font-size: .78rem; }
.b39-choice:hover, .b39-choice[aria-pressed="true"] { border-color: var(--color-accent, #2f855a); }
.b39-empty { text-align: center; padding: 1rem .5rem; }
.b39-empty p { font-size: .78rem; color: var(--color-text-secondary, #666); margin: 0 0 .7rem; }
.b39-foot { margin-top: .5rem; font-size: .66rem; line-height: 1.4;
  color: var(--color-text-tertiary, #999); }
.chord-display.b39-ghost { opacity: .42; }
`;

  var ICON = '<svg class="b39-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
    '<line x1="4" y1="7" x2="20" y2="7"/><circle cx="9" cy="7" r="2" fill="currentColor"/>' +
    '<line x1="4" y1="12" x2="20" y2="12"/><circle cx="15" cy="12" r="2" fill="currentColor"/>' +
    '<line x1="4" y1="17" x2="20" y2="17"/><circle cx="10" cy="17" r="2" fill="currentColor"/>' +
    '</svg>';

  var doc = HOST.document;
  var T = function () { return HOST.StruChordTracks || null; };
  var btn = null, panel = null, rowsEl = null, addBtn = null, chooser = null, menu = null;
  var menuTrackId = null, chooserPending = null, booted = false;

  function el(tag, cls, text) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function injectCss() {
    if (!doc || doc.getElementById('b39MixerCss')) return;
    var st = el('style');
    st.id = 'b39MixerCss';
    st.textContent = CSS;
    (doc.head || doc.body).appendChild(st);
  }

  function buildDom() {
    if (!doc || !doc.body || btn) return;
    var wrap = el('span', 'b39-wrap');
    btn = el('button', 'transport-btn b39-btn');
    btn.type = 'button';
    btn.id = 'b39MixerBtn';
    btn.setAttribute('aria-label', 'Микшер дорожек');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('title', 'Микшер дорожек');
    btn.innerHTML = ICON + '<span class="b39-btn-label" id="b39BtnLabel">Дорожки</span>';
    panel = el('div', 'b39-panel');
    panel.id = 'b39MixerPanel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Микшер дорожек');
    panel.hidden = true;

    var head = el('div', 'b39-head');
    head.appendChild(el('strong', '', 'Микшер'));
    head.appendChild(el('span', 'b39-hint', 'громкость · M · S'));
    var close = el('button', 'b39-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Закрыть микшер');
    close.addEventListener('click', closePanel);
    head.appendChild(close);

    var empty = el('div', 'b39-empty');
    empty.id = 'b39MixerEmpty';
    empty.appendChild(el('p', '', 'Дорожек пока нет. Добавьте первую — песня зазвучит.'));
    var emptyAdd = el('button', 'b39-add', '+ Добавить дорожку');
    emptyAdd.type = 'button';
    emptyAdd.addEventListener('click', function () { openChooser(null); });
    empty.appendChild(emptyAdd);

    rowsEl = el('div', 'b39-rows');
    rowsEl.id = 'b39MixerRows';

    addBtn = el('button', 'b39-add', '+ Добавить дорожку');
    addBtn.type = 'button';
    addBtn.id = 'b39MixerAdd';
    addBtn.addEventListener('click', function () { openChooser(null); });

    chooser = el('div', 'b39-chooser');
    chooser.id = 'b39MixerChooser';
    chooser.hidden = true;
    chooser.appendChild(el('div', 'b39-chooser-title', 'Инструмент новой дорожки'));
    var choices = el('div', 'b39-choices');
    [['guitar', '🎸 Гитара'], ['keys', '🎹 Клавиши']].forEach(function (pair) {
      var b = el('button', 'b39-choice', pair[1]);
      b.type = 'button';
      b.addEventListener('click', function () { chooseInstrument(pair[0]); });
      choices.appendChild(b);
    });
    chooser.appendChild(choices);

    menu = el('div', 'b39-menu');
    menu.id = 'b39MixerMenu';
    menu.hidden = true;
    menu.appendChild(el('div', 'b39-chooser-title', 'Инструмент дорожки'));
    var menuChoices = el('div', 'b39-choices');
    [['guitar', '🎸 Гитара'], ['keys', '🎹 Клавиши']].forEach(function (pair) {
      var b = el('button', 'b39-choice', pair[1]);
      b.type = 'button';
      b.addEventListener('click', function () {
        var t = T();
        if (t && menuTrackId !== null) t.setInstrument(menuTrackId, pair[0]);
        menu.hidden = true; menuTrackId = null; render();
      });
      menuChoices.appendChild(b);
    });
    menu.appendChild(menuChoices);

    var foot = el('div', 'b39-foot',
      'Главная — верхняя строка. Перетащите строку, чтобы сменить главную. ' +
      'Пока звучит один голос (главная дорожка); отдельные голоса появятся в следующей части.');

    panel.appendChild(head);
    panel.appendChild(empty);
    panel.appendChild(rowsEl);
    panel.appendChild(addBtn);
    panel.appendChild(chooser);
    panel.appendChild(menu);
    panel.appendChild(foot);
    wrap.appendChild(btn);
    doc.body.appendChild(panel);

    var anchor = doc.getElementById('transportDockHint');
    var bar = doc.querySelector ? doc.querySelector('.transport-bar') : null;
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(wrap, anchor);
    else if (bar) bar.appendChild(wrap);
    else doc.body.appendChild(wrap);

    btn.addEventListener('click', togglePanel);
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panel && !panel.hidden) closePanel();
    });
    HOST.addEventListener && HOST.addEventListener('resize', function () {
      if (panel && !panel.hidden) positionPanel();
    });
  }

  function positionPanel() {
    if (!panel || !btn || !btn.getBoundingClientRect) return;
    var r = btn.getBoundingClientRect();
    var w = 320;
    var left = r.right - w;
    var maxLeft = (HOST.innerWidth || 1024) - w - 8;
    if (left > maxLeft) left = maxLeft;
    if (left < 8) left = 8;
    panel.style.left = left + 'px';
    panel.style.top = (r.bottom + 8) + 'px';
  }
  function openPanel() { if (!panel) return; positionPanel(); panel.hidden = false; btn.setAttribute('aria-expanded', 'true'); render(); }
  function closePanel() { if (!panel) return; panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); if (chooser) chooser.hidden = true; if (menu) menu.hidden = true; }
  function togglePanel() { if (!panel) return; panel.hidden ? openPanel() : closePanel(); }

  function openChooser(id) {
    chooserPending = id;
    menu.hidden = true;
    chooser.hidden = false;
    render();
  }
  function chooseInstrument(inst) {
    var t = T();
    if (!t) return;
    // Новая песня: дефолтная «пустая гитара» заменяется выбранной дорожкой,
    // чтобы не появилось две строки там, где пользователь просил одну.
    var st = t.state();
    // Сбрасываем в пустую песню ТОЛЬКО когда интерфейс действительно
    // показывал заглушку: дефолтная гитара + в сетке нет ни одного аккорда.
    // Иначе «+» обязан добавить вторую строку, а не стирать существующую песню.
    if (!st.isEmpty && st.isDefault && !hasAnyChord()) t.resetToEmpty();
    t.addTrack(inst);                       // копия АКТИВНОЙ дорожки
    chooser.hidden = true;
    chooserPending = null;
    render();
  }

  function hasAnyChord() {
    var t = T(), found = false;
    if (!t || typeof t.eachCell !== 'function') return false;
    try { t.eachCell(function (sec, sq, ev) { if (ev && ev.chord) found = true; }); } catch (e) {}
    return found;
  }

  function render() {
    var t = T();
    if (!t || !rowsEl) return;
    var st = t.state();
    var showEmpty = st.isEmpty || (st.isDefault && !hasAnyChord());
    var emptyEl = doc.getElementById('b39MixerEmpty');
    if (emptyEl) emptyEl.hidden = !showEmpty;
    rowsEl.hidden = showEmpty;
    addBtn.hidden = showEmpty;
    var label = doc.getElementById('b39BtnLabel');
    if (label) {
      var active = null;
      for (var i = 0; i < st.tracks.length; i++) if (st.tracks[i].id === st.activeTrackId) active = st.tracks[i];
      label.textContent = active ? active.name : 'Дорожки';
    }
    while (rowsEl.firstChild) rowsEl.removeChild(rowsEl.firstChild);
    if (showEmpty) return;

    st.tracks.forEach(function (track, index) { rowsEl.appendChild(buildRow(track, index, st)); });
  }

  function buildRow(track, index, st) {
    var row = el('div', 'b39-row' + (track.id === st.activeTrackId ? ' is-active' : ''));
    row.setAttribute('data-id', String(track.id));
    row.setAttribute('tabindex', '0');
    row.setAttribute('role', 'button');
    row.setAttribute('aria-label', 'Дорожка ' + track.name + (track.id === st.mainTrackId ? ', главная' : ''));

    var handle = el('span', 'b39-handle', '≡');
    handle.setAttribute('aria-hidden', 'true');
    handle.setAttribute('title', 'Перетащить');
    handle.addEventListener('pointerdown', function (e) { startDrag(e, row, index); });

    var select = el('button', 'b39-select');
    select.type = 'button';
    select.appendChild(el('span', 'b39-dot'));
    select.appendChild(el('span', 'b39-name', (track.id === st.mainTrackId ? '★ ' : '') + track.name));
    select.appendChild(el('span', 'b39-badge', track.instrument === 'keys' ? 'Клавиши' : 'Гитара'));
    select.addEventListener('click', function () { var t = T(); if (t) t.setActive(track.id); });

    var vol = el('input', 'b39-vol');
    vol.type = 'range'; vol.min = '0'; vol.max = '100'; vol.step = '1';
    vol.value = String(track.volume);
    vol.setAttribute('aria-label', 'Громкость ' + track.name);
    vol.addEventListener('change', function () { var t = T(); if (t) t.setVolume(track.id, vol.value); });

    var ms = el('div', 'b39-ms');
    var m = el('button', '', 'M');
    m.type = 'button'; m.setAttribute('aria-label', 'Мьют ' + track.name);
    m.setAttribute('aria-pressed', track.mute ? 'true' : 'false');
    m.addEventListener('click', function () {
      var t = T(); if (!t) return;
      var cur = t.track(track.id);
      t.setMute(track.id, !(cur && cur.mute));
    });
    var s = el('button', '', 'S');
    s.type = 'button'; s.setAttribute('aria-label', 'Соло ' + track.name);
    s.setAttribute('aria-pressed', track.solo ? 'true' : 'false');
    s.addEventListener('click', function () {
      var t = T(); if (!t) return;
      var cur = t.track(track.id);
      t.setSolo(track.id, !(cur && cur.solo));
    });
    ms.appendChild(m); ms.appendChild(s);

    var dots = el('button', 'b39-dots', '⋯');
    dots.type = 'button'; dots.setAttribute('aria-label', 'Параметры ' + track.name);
    dots.addEventListener('click', function (e) {
      e.stopPropagation();
      menuTrackId = track.id;
      chooser.hidden = true;
      menu.hidden = false;
      render();
    });

    row.appendChild(handle);
    row.appendChild(select);
    row.appendChild(vol);
    row.appendChild(ms);
    row.appendChild(dots);
    row.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); var t = T(); if (t) t.setActive(track.id); }
    });
    return row;
  }

  // ---------- Перетаскивание (60 fps) ----------
  var drag = null;
  function startDrag(e, row, index) {
    if (e.button !== undefined && e.button !== 0) return;
    var t = T();
    if (!t || t.state().tracks.length < 2) return;
    var rows = Array.prototype.slice.call(rowsEl.querySelectorAll('.b39-row'));
    var rects = rows.map(function (r) { return r.getBoundingClientRect ? r.getBoundingClientRect() : { top: 0, height: 0 }; });
    drag = { el: row, from: index, to: index, y0: e.clientY, moved: false, rows: rows, rects: rects };
    if (row.setPointerCapture && e.pointerId !== undefined) {
      try { row.setPointerCapture(e.pointerId); } catch (err) {}
    }
    doc.addEventListener('pointermove', onDragMove);
    doc.addEventListener('pointerup', onDragEnd);
    doc.addEventListener('pointercancel', onDragEnd);
    if (e.preventDefault) e.preventDefault();
  }
  function onDragMove(e) {
    if (!drag) return;
    var dy = e.clientY - drag.y0;
    if (!drag.moved && Math.abs(dy) < 4) return;             // гистерезис
    drag.moved = true;
    drag.el.classList.add('is-dragging');
    drag.el.style.transform = 'translate3d(0,' + dy + 'px,0)';
    var to = 0;
    for (var i = 0; i < drag.rects.length; i++) {
      var r = drag.rects[i];
      if (e.clientY > r.top + r.height / 2) to = i;
    }
    if (to !== drag.to) {
      drag.rows.forEach(function (n) { n.classList.remove('is-drop-target'); });
      if (drag.rows[to]) drag.rows[to].classList.add('is-drop-target');
      drag.to = to;
    }
  }
  function onDragEnd() {
    if (!drag) return;
    var d = drag; drag = null;
    doc.removeEventListener('pointermove', onDragMove);
    doc.removeEventListener('pointerup', onDragEnd);
    doc.removeEventListener('pointercancel', onDragEnd);
    d.el.style.transform = '';
    d.el.classList.remove('is-dragging');
    d.rows.forEach(function (n) { n.classList.remove('is-drop-target'); });
    if (d.moved && d.to !== d.from) {
      var t = T();
      if (t) t.reorderTracks(d.from, d.to);
    }
    render();
  }

  // ---------- Хуки в чужой код ----------
  function displayChord(sec, sq, ev, ei) {
    var t = T();
    if (!t) return (ev && ev.chord) || '';
    var st = t.state();
    if (st.mainTrackId === null) return (ev && ev.chord) || '';
    var key = t.cellKey(sec, sq, ei);
    var own = t.trackChord(st.activeTrackId, key, ev);
    if (own) return own;
    if (st.activeTrackId === st.mainTrackId) return (ev && ev.chord) || '';
    return t.ghostChord(key) || '';
  }
  function ghostClass(sec, sq, ei) {
    var t = T();
    if (!t) return '';
    var st = t.state();
    if (st.mainTrackId === null || st.activeTrackId === st.mainTrackId) return '';
    return t.trackChord(st.activeTrackId, t.cellKey(sec, sq, ei)) ? '' : ' b39-ghost';
  }
  // Круг/ввод пишут аккорд ТОЛЬКО в активную дорожку. Главная не меняется.
  function redirectChordWrite(ev, newChord, posCtx) {
    var t = T();
    if (!t || !posCtx) return false;
    var st = t.state();
    if (st.mainTrackId === null || st.activeTrackId === st.mainTrackId) return false;
    var secId = posCtx.secId !== undefined ? posCtx.secId : posCtx.sectionId;
    var sqId = posCtx.sqId !== undefined ? posCtx.sqId : posCtx.squareId;
    var ei = posCtx.ei !== undefined ? posCtx.ei : posCtx.eventIndex;
    if (secId === undefined || sqId === undefined || ei === undefined) return false;
    var key = String(secId) + ':' + String(sqId) + ':' + String(ei);
    var chord = typeof newChord === 'string' ? newChord : '';
    if (String(t.trackChord(st.activeTrackId, key, ev) || '') === String(chord || '')) return true;
    t.setTrackChord(st.activeTrackId, key, chord);
    try { if (typeof HOST.learnWheelExtension === 'function') HOST.learnWheelExtension(chord); } catch (e) {}
    try { if (typeof HOST.requestRender === 'function') HOST.requestRender(); } catch (e) {}
    return true;
  }
  // Мьют/соло реально влияют на звук уже сейчас (звучит один голос — главной).
  function mainAudible() {
    var t = T();
    if (!t) return true;
    var st = t.state();
    if (st.mainTrackId === null) return true;
    var main = null, anySolo = false;
    st.tracks.forEach(function (x) { if (x.id === st.mainTrackId) main = x; if (x.solo) anySolo = true; });
    if (!main) return true;
    if (main.mute) return false;
    if (anySolo && !main.solo) return false;
    return true;
  }

  // Новая песня: сбрасываем дорожки в пустое состояние.
  function wrapClearAll() {
    if (typeof HOST.clearAll !== 'function' || HOST.clearAll.__b39Wrapped) return;
    var original = HOST.clearAll;
    var wrapped = function () {
      var r = original.apply(this, arguments);
      try { var t = T(); if (t) t.resetToEmpty(); } catch (e) {}
      return r;
    };
    wrapped.__b39Wrapped = true;
    HOST.clearAll = wrapped;
  }

  function boot() {
    if (booted) return;
    if (!doc || !doc.body) return;
    booted = true;
    injectCss();
    buildDom();
    var store = HOST.songStore;
    if (store && typeof store.subscribe === 'function') {
      try { store.subscribe(function () { render(); }); } catch (e) {}
    }
    render();
  }

  var api = Object.freeze({
    boot: boot, open: openPanel, close: closePanel, toggle: togglePanel, render: render,
    displayChord: displayChord, ghostClass: ghostClass,
    redirectChordWrite: redirectChordWrite, mainAudible: mainAudible,
    button: function () { return btn; }, panel: function () { return panel; },
    rows: function () { return rowsEl; }, chooser: function () { return chooser; },
    menu: function () { return menu; }, css: function () { return CSS; }
  });
  HOST.StruChordMixer = api;

  // clearAll определяется позже по файлу — оборачиваем после полной загрузки.
  if (typeof HOST.setTimeout === 'function') HOST.setTimeout(wrapClearAll, 0);
  if (doc && doc.readyState === 'loading' && doc.addEventListener) {
    doc.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
// <<< B-39 STAGE2 END (MIXER UI) <<<
