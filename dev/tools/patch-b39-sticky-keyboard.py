#!/usr/bin/env python3
"""B-39: удерживать встроенную клавиатуру под плеером; поверх 0.723."""
from pathlib import Path
p=Path('STRUCHORD.html');s=p.read_text(encoding='utf-8')
def rep(a,b):
 global s
 n=s.count(a)
 if n!=1: raise SystemExit(f'Патч не применён: {n} совпадений: {a[:100]!r}')
 s=s.replace(a,b,1)
rep('''.b39-keys-panel { box-sizing: border-box; min-width: 0; width: 100%; margin: 0 0 1.25rem;
  background:''','''.b39-keys-panel { box-sizing: border-box; min-width: 0; width: 100%; margin: 0 0 1.25rem;
  position: sticky; top: calc(.9rem + var(--b39-keys-stack, 0px)); z-index: 59;
  max-height: max(3rem, min(60vh, calc(100vh - var(--b39-keys-stack, 0px) - 4rem)));
  overflow-y: auto; overscroll-behavior-y: contain;
  background:''')
# Схема расположена перед настройками, чтобы при ограничении высоты
# клавиши оставались видимыми, а настройки были доступны прокруткой.
rep('''    panel.appendChild(head);panel.appendChild(controls);panel.appendChild(linkRow);panel.appendChild(autoChoiceBtn);panel.appendChild(body);panel.appendChild(foot);''','''    panel.appendChild(head);panel.appendChild(body);panel.appendChild(foot);panel.appendChild(controls);panel.appendChild(linkRow);panel.appendChild(autoChoiceBtn);''')
rep('''.b39-keys-foot { margin-top: .45rem; font-size: .75rem; line-height: 1.4;''','''.b39-keys-foot { margin: .45rem 0 .65rem; font-size: .75rem; line-height: 1.4;''')
rep('''    if (transport && transport.parentNode) transport.parentNode.insertBefore(panel, transport.nextSibling);
    else doc.body.appendChild(panel);

    var mixerBtn''','''    if (transport && transport.parentNode) transport.parentNode.insertBefore(panel, transport.nextSibling);
    else doc.body.appendChild(panel);
    // Меняются высота транспорта, размер экрана и закреплённая аппликатура.
    // ResizeObserver не вызывается на pointermove и срабатывает только при изменении размеров.
    if (transport && typeof HOST.ResizeObserver === 'function') {
      var stackObserver = new HOST.ResizeObserver(syncStickyOffset);
      stackObserver.observe(transport);
      var pinnedRow = doc.getElementById('pinnedRow'); if (pinnedRow) stackObserver.observe(pinnedRow);
    }
    if (doc.body && typeof HOST.MutationObserver === 'function') {
      new HOST.MutationObserver(syncStickyOffset).observe(doc.body, {attributes:true, attributeFilter:['class']});
    }
    HOST.addEventListener('resize', syncStickyOffset);
    syncStickyOffset();

    var mixerBtn''')
rep('''  function openPanel() {
    if (!panel) return;
    if (HUB) HUB.opened('keys');
    panel.hidden = false; btn.setAttribute('aria-pressed', 'true'); renderPanel();''','''  function syncStickyOffset() {
    if (!panel) return;
    var bar = doc.querySelector('.transport-bar'), row = doc.getElementById('pinnedRow');
    if (!bar) return;
    var stack = bar.offsetHeight;
    if (row && doc.body.classList.contains('has-pinned-fingering') &&
        !doc.body.classList.contains('is-timeline') && row.style.display !== 'none') {
      stack += row.offsetHeight + (parseFloat(HOST.getComputedStyle(doc.documentElement).fontSize) || 16) * 0.625;
    }
    var value = stack + 'px';
    if (panel.style.getPropertyValue('--b39-keys-stack') !== value) panel.style.setProperty('--b39-keys-stack', value);
  }
  function openPanel() {
    if (!panel) return;
    if (HUB) HUB.opened('keys');
    panel.hidden = false; btn.setAttribute('aria-pressed', 'true'); renderPanel(); syncStickyOffset();''')
p.write_text(s,encoding='utf-8');print('Закрепление панели клавиатуры применено')
