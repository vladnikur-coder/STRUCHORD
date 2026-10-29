#!/usr/bin/env python3
"""B-39: изменение размера панели и клавиш краями, поверх 0.735."""
from pathlib import Path
p=Path('STRUCHORD.html');s=p.read_text(encoding='utf-8')
def rep(a,b):
 global s
 if s.count(a)!=1:raise SystemExit(f'{s.count(a)} совпадений: {a[:110]!r}')
 s=s.replace(a,b,1)
rep('''.b39-keys-panel[hidden] { display: none; }''','''.b39-keys-panel[hidden] { display: none; }
.b39-keys-panel.is-user-sized {
  width:min(var(--b39-resize-width), calc(100vw - 1rem)); max-width:calc(100vw - 1rem);
  margin-left:calc((100% - min(var(--b39-resize-width), calc(100vw - 1rem))) / 2); margin-right:0;
}
.b39-keys-resize { position:absolute; z-index:2; padding:0; border:0; background:transparent; touch-action:none; }
.b39-keys-panel:not(.has-keyboard) .b39-keys-resize { display:none; }
.b39-keys-resize:focus-visible { outline:.125rem solid var(--color-accent); outline-offset:.1rem; }
.b39-keys-resize--left, .b39-keys-resize--right { top:1rem; bottom:1rem; width:.8rem; cursor:ew-resize; }
.b39-keys-resize--left { left:-.4rem; } .b39-keys-resize--right { right:-.4rem; }
.b39-keys-resize--bottom { left:1rem; right:1rem; bottom:-.45rem; height:.9rem; cursor:ns-resize; }
.b39-keys-resize::after { content:''; position:absolute; background:var(--color-text-secondary, #666); opacity:.48; border-radius:1rem; }
.b39-keys-resize--left::after, .b39-keys-resize--right::after { width:.15rem; height:1.7rem; left:calc(50% - .075rem); top:calc(50% - .85rem); }
.b39-keys-resize--bottom::after { height:.15rem; width:2rem; top:calc(50% - .075rem); left:calc(50% - 1rem); }''')
rep('''  var keyboardWhiteHeight = 40, keyboardFingers = false;''','''  var keyboardWhiteHeight = 40, keyboardFingers = false;
  // Только интерфейс текущей сессии; в песню и настройки дорожки не записывается.
  var resizedWhiteWidth = null, resizedWhiteHeight = null, resizeDrag = null;''')
rep('''    panel.appendChild(head);panel.appendChild(body);panel.appendChild(settings);
    var transport''','''    panel.appendChild(head);panel.appendChild(body);panel.appendChild(settings);
    installResizeHandles();
    var transport''')
rep('''    if (!panel.hidden) {
      var rem = parseFloat(HOST.getComputedStyle(doc.documentElement).fontSize) || 16;''','''    if (!panel.hidden && !resizeDrag) {
      var rem = parseFloat(HOST.getComputedStyle(doc.documentElement).fontSize) || 16;''')
rep('''      var h = Math.max(100, Math.min(112, Math.floor(free * 16 / rem - 16)));''','''      var h = resizedWhiteHeight !== null ? resizedWhiteHeight : Math.max(100, Math.min(112, Math.floor(free * 16 / rem - 16)));''')
rep('''  function openPanel() {
    if (!panel) return;
    if (HUB) HUB.opened('keys');''','''  // Во время перетягивания меняем только геометрию SVG и CSS-переменную панели.
  // Полный пересчёт нот и SVG — один раз после отпускания, не на pointermove.
  function installResizeHandles() {
    function makeHandle(axis, label, help) {
      var handle = el('button', 'b39-keys-resize b39-keys-resize--' + axis);
      handle.type = 'button'; handle.setAttribute('aria-label', label); handle.title = help;
      panel.appendChild(handle);
      handle.addEventListener('pointerdown', function(e) {
        if (e.button !== 0 || resizeDrag) return;
        var state = beginResize(axis); if (!state) return;
        resizeDrag = state; state.pointerId = e.pointerId; state.startX = e.clientX; state.startY = e.clientY;
        e.preventDefault(); e.stopPropagation(); handle.setPointerCapture(e.pointerId);
      });
      handle.addEventListener('pointermove', function(e) {
        if (!resizeDrag || resizeDrag.pointerId !== e.pointerId) return;
        e.preventDefault(); e.stopPropagation();
        moveResize(resizeDrag, e.clientX - resizeDrag.startX, e.clientY - resizeDrag.startY);
      });
      function finish(e) {
        if (!resizeDrag || resizeDrag.pointerId !== e.pointerId) return;
        e.stopPropagation(); finishResize();
      }
      handle.addEventListener('pointerup', finish); handle.addEventListener('pointercancel', finish);
      handle.addEventListener('lostpointercapture', finish);
      handle.addEventListener('keydown', function(e) {
        var horizontal = axis !== 'bottom', delta = 0;
        if (horizontal && e.key === 'ArrowRight') delta = 1;
        else if (horizontal && e.key === 'ArrowLeft') delta = -1;
        else if (!horizontal && e.key === 'ArrowDown') delta = 1;
        else if (!horizontal && e.key === 'ArrowUp') delta = -1;
        if (!delta || resizeDrag) return;
        var state = beginResize(axis); if (!state) return;
        e.preventDefault(); e.stopPropagation(); resizeDrag = state;
        moveResize(state, horizontal ? delta * state.rem / 2 : 0, horizontal ? 0 : delta * state.rem / 2);
        finishResize();
      });
    }
    makeHandle('left', 'Изменить ширину клавиатуры слева', 'Потяните за край или используйте стрелки влево и вправо');
    makeHandle('right', 'Изменить ширину клавиатуры справа', 'Потяните за край или используйте стрелки влево и вправо');
    makeHandle('bottom', 'Изменить высоту клавиатуры', 'Потяните за край или используйте стрелки вверх и вниз');
  }
  function beginResize(axis) {
    var svg = body && body.querySelector('svg'); if (!svg || !panel || panel.hidden) return null;
    var rect = panel.getBoundingClientRect(), svgRect = svg.getBoundingClientRect();
    var rem = parseFloat(HOST.getComputedStyle(doc.documentElement).fontSize) || 16;
    var center = (rect.left + rect.right) / 2;
    var maxWidth = Math.max(1, Math.min(HOST.innerWidth - rem, 2 * Math.min(center, HOST.innerWidth - center) - rem));
    return {axis:axis, svg:svg, rem:rem, startWidth:rect.width, svgWidth:svgRect.width,
      startKeyWidth:resizedWhiteWidth === null ? 28 : resizedWhiteWidth,
      startKeyHeight:keyboardWhiteHeight, minWidth:Math.min(28 * rem, maxWidth), maxWidth:maxWidth,
      newKeyWidth:resizedWhiteWidth === null ? 28 : resizedWhiteWidth,
      newKeyHeight:keyboardWhiteHeight, changed:false};
  }
  function moveResize(state, dx, dy) {
    var clamp = function(v, min, max) { return Math.max(min, Math.min(max, v)); };
    if (state.axis === 'bottom') {
      var h = Math.round(clamp(state.startKeyHeight + dy * 16 / state.rem, 48, 260) * 10) / 10;
      state.newKeyHeight = h; state.changed = state.changed || h !== state.startKeyHeight;
      // SVG масштабируется только во время жеста; после него текст и окружности
      // снова рисуются без искажений в новой геометрии клавиш.
      state.svg.setAttribute('preserveAspectRatio', 'none');
      state.svg.style.height = ((h + 16) / 16) + 'rem';
    } else {
      var edge = state.axis === 'right' ? dx : -dx;
      var targetWidth = clamp(state.startWidth + edge * 2, state.minWidth, state.maxWidth);
      var w = Math.round(clamp(state.startKeyWidth * (1 + (targetWidth - state.startWidth) / state.svgWidth), 14, 90) * 10) / 10;
      targetWidth = clamp(state.startWidth + (w / state.startKeyWidth - 1) * state.svgWidth, state.minWidth, state.maxWidth);
      state.newKeyWidth = w; state.changed = state.changed || w !== state.startKeyWidth || Math.abs(targetWidth - state.startWidth) > .5;
      panel.classList.add('is-user-sized');
      panel.style.setProperty('--b39-resize-width', (targetWidth / state.rem) + 'rem');
      state.svg.setAttribute('preserveAspectRatio', 'none');
      state.svg.style.width = (state.svgWidth * w / state.startKeyWidth / state.rem) + 'rem';
    }
  }
  function finishResize() {
    var state = resizeDrag; if (!state) return;
    resizeDrag = null;
    if (state.changed) {
      if (state.axis === 'bottom') { resizedWhiteHeight = state.newKeyHeight; keyboardWhiteHeight = state.newKeyHeight; }
      else resizedWhiteWidth = state.newKeyWidth;
    }
    renderPanel();
  }

  function openPanel() {
    if (!panel) return;
    if (HUB) HUB.opened('keys');''')
rep('''  function renderPanel() {
    if (!panel || panel.hidden) return;''','''  function renderPanel() {
    if (!panel || panel.hidden || resizeDrag) return;''')
rep("      titleEl.textContent = 'Клавиатура'; contextEl.textContent = ''; bassEl.textContent = ''; lastChord = null; lastTrackId = null;", "      panel.classList.remove('has-keyboard'); titleEl.textContent = 'Клавиатура'; contextEl.textContent = ''; bassEl.textContent = ''; lastChord = null; lastTrackId = null;")
rep("    if (!chord) {\n      titleEl.textContent = 'Клавиатура';", "    panel.classList.toggle('has-keyboard', !!chord);\n    if (!chord) {\n      titleEl.textContent = 'Клавиатура';")
rep('''    var whiteW = 28;
    var fingersVisible''','''    var whiteW = resizedWhiteWidth === null ? 28 : resizedWhiteWidth;
    var fingersVisible''')
rep('return {axis:axis, svg:svg, rem:rem, startWidth:rect.width, svgWidth:svgRect.width,','return {axis:axis, svg:svg, rem:rem, startWidth:rect.width, svgWidth:svgRect.width, svgHeight:svgRect.height,')
rep("      state.svg.setAttribute('preserveAspectRatio', 'none');\n      state.svg.style.width = (state.svgWidth * w / state.startKeyWidth / state.rem) + 'rem';","      state.svg.setAttribute('preserveAspectRatio', 'none');\n      state.svg.style.height = (state.svgHeight / state.rem) + 'rem';\n      state.svg.style.width = (state.svgWidth * w / state.startKeyWidth / state.rem) + 'rem';")
p.write_text(s,encoding='utf-8');print('Изменение размера панели установлено')
