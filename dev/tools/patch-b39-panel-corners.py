#!/usr/bin/env python3
"""B-39: изменение размера панели за нижние углы, поверх 0.737."""
from pathlib import Path
p=Path('STRUCHORD.html'); s=p.read_text(encoding='utf-8')
def rep(a,b):
 global s
 if s.count(a)!=1:raise SystemExit(f'{s.count(a)} совпадений: {a[:120]!r}')
 s=s.replace(a,b,1)
rep(".b39-keys-resize--bottom { left:1rem; right:1rem; bottom:-.45rem; height:.9rem; cursor:ns-resize; }", """.b39-keys-resize--bottom { left:1rem; right:1rem; bottom:-.45rem; height:.9rem; cursor:ns-resize; }
.b39-keys-resize--bottom-left, .b39-keys-resize--bottom-right { bottom:-.4rem; width:1.25rem; height:1.25rem; z-index:3; }
.b39-keys-resize--bottom-left { left:-.4rem; cursor:nesw-resize; }
.b39-keys-resize--bottom-right { right:-.4rem; cursor:nwse-resize; }
.b39-keys-resize--bottom-left::after, .b39-keys-resize--bottom-right::after { width:.7rem; height:.15rem; top:.55rem; left:.3rem; }
.b39-keys-resize--bottom-left::after { transform:rotate(-45deg); }
.b39-keys-resize--bottom-right::after { transform:rotate(45deg); }""")
rep("""        var horizontal = axis !== 'bottom', delta = 0;
        if (horizontal && e.key === 'ArrowRight') delta = 1;
        else if (horizontal && e.key === 'ArrowLeft') delta = -1;
        else if (!horizontal && e.key === 'ArrowDown') delta = 1;
        else if (!horizontal && e.key === 'ArrowUp') delta = -1;
        if (!delta || resizeDrag) return;
        var state = beginResize(axis); if (!state) return;
        e.preventDefault(); e.stopPropagation(); resizeDrag = state;
        moveResize(state, horizontal ? delta * state.rem / 2 : 0, horizontal ? 0 : delta * state.rem / 2);""", """        var horizontal = axis !== 'bottom', vertical = axis === 'bottom' || axis.indexOf('bottom-') === 0;
        var dx = 0, dy = 0;
        if (horizontal && e.key === 'ArrowRight') dx = 1;
        else if (horizontal && e.key === 'ArrowLeft') dx = -1;
        else if (vertical && e.key === 'ArrowDown') dy = 1;
        else if (vertical && e.key === 'ArrowUp') dy = -1;
        if ((!dx && !dy) || resizeDrag) return;
        var state = beginResize(axis); if (!state) return;
        e.preventDefault(); e.stopPropagation(); resizeDrag = state;
        moveResize(state, dx * state.rem / 2, dy * state.rem / 2);""")
rep("    makeHandle('bottom', 'Изменить высоту клавиатуры', 'Потяните за край или используйте стрелки вверх и вниз');", """    makeHandle('bottom', 'Изменить высоту клавиатуры', 'Потяните за край или используйте стрелки вверх и вниз');
    makeHandle('bottom-left', 'Изменить размер клавиатуры за левый нижний угол', 'Потяните за угол или используйте стрелки');
    makeHandle('bottom-right', 'Изменить размер клавиатуры за правый нижний угол', 'Потяните за угол или используйте стрелки');""")
rep("    if (state.axis === 'bottom') {\n      var h =", "    var vertical = state.axis === 'bottom' || state.axis.indexOf('bottom-') === 0;\n    var horizontal = state.axis !== 'bottom';\n    if (dx !== 0) state.movedX = true; if (dy !== 0) state.movedY = true;\n    if (vertical && state.movedY) {\n      var h =")
rep("    } else {\n      var edge = state.axis === 'right' ? dx : -dx;", "    }\n    if (horizontal && state.movedX) {\n      var edge = state.axis === 'right' || state.axis === 'bottom-right' ? dx : -dx;")
rep("      state.svg.style.height = (state.svgHeight / state.rem) + 'rem';", "      if (!vertical || !state.movedY) state.svg.style.height = (state.svgHeight / state.rem) + 'rem';")
rep("""      if (state.axis === 'bottom') { resizedWhiteHeight = state.newKeyHeight; keyboardWhiteHeight = state.newKeyHeight; }
      else resizedWhiteWidth = state.newKeyWidth;""", """      if ((state.axis === 'bottom' || state.axis.indexOf('bottom-') === 0) && state.movedY) { resizedWhiteHeight = state.newKeyHeight; keyboardWhiteHeight = state.newKeyHeight; }
      if (state.axis !== 'bottom' && state.movedX) resizedWhiteWidth = state.newKeyWidth;""")
p.write_text(s,encoding='utf-8');print('Ручки в углах установлены')
