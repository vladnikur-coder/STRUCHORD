#!/usr/bin/env python3
"""B-39: подгонка панели к диапазону без изменения размеров клавиш, поверх 0.736."""
from pathlib import Path
p=Path('STRUCHORD.html');s=p.read_text(encoding='utf-8')
def rep(a,b):
 global s
 if s.count(a)!=1: raise SystemExit(f'{s.count(a)} совпадений: {a[:100]!r}')
 s=s.replace(a,b,1)
rep('  width:min(var(--b39-resize-width), calc(100vw - 1rem)); max-width:calc(100vw - 1rem);', '  min-width:min(14rem, 100%); width:min(var(--b39-resize-width), calc(100vw - 1rem)); max-width:calc(100vw - 1rem);')
rep('startKeyHeight:keyboardWhiteHeight, minWidth:Math.min(28 * rem, maxWidth), maxWidth:maxWidth,', 'startKeyHeight:keyboardWhiteHeight, minWidth:Math.min(14 * rem, maxWidth), maxWidth:maxWidth,')
rep('  var resizedWhiteWidth = null, resizedWhiteHeight = null, resizeDrag = null;', '  var resizedWhiteWidth = null, resizedWhiteHeight = null, resizeDrag = null, renderedRange = null;')
rep("    titleEl.textContent = chord;\n    var oldScroll = body.scrollLeft;", """    // При смене диапазона подгоняем рамку, но не изменяем масштаб клавиш.
    // Для длинной клавиатуры рамка ограничена окном, остальное прокручивается.
    var rangeKey = range.low + '|' + range.high;
    if (renderedRange !== null && renderedRange !== rangeKey && panel.classList.contains('is-user-sized')) {
      panel.style.setProperty('--b39-resize-width', 'max(14rem, calc(' + (res.width / 16) + 'rem + 1.425rem))');
    }
    renderedRange = rangeKey;
    titleEl.textContent = chord;
    var oldScroll = body.scrollLeft;""")
p.write_text(s,encoding='utf-8');print('Подгонка диапазона установлена')
