#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""0.876 · Подсказка «Нажмите цифру на клавиатуре, чтобы поставить ноту» убрана.

Владелец: «подсказка поставьте цифру на клавиатуре не нужна». Убирается всё,
что её обслуживало: разметка, CSS и `tabSyncEmptyHint` с двумя вызовами.
Остальное (стан, секции палитры, полоса статуса, автопрокрутка) не трогается.
"""
import io
import sys

PATH = 'STRUCHORD.html'


def rep(text, old, new, count=1, label=''):
    n = text.count(old)
    if n != count:
        sys.exit('FAIL %s: expected %d, found %d for %r' % (label, count, n, old[:140]))
    return text.replace(old, new)


with io.open(PATH, encoding='utf-8') as f:
    html = f.read()
size0 = len(html.encode('utf-8'))

# 1. CSS подсказки
html = rep(
    html,
    """/* 0.874: в пустом стане видно, что делать дальше (цифра = лад). */
.tab-at-empty-hint {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 3;
  max-width: min(26rem, 92%);
  padding: 0.375rem 0.625rem;
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  line-height: 1.35;
  text-align: center;
  color: var(--color-text-secondary);
  background: color-mix(in srgb, var(--color-surface) 84%, transparent);
  pointer-events: none;
}
.tab-at-empty-hint[hidden] { display: none !important; }
""",
    '',
    1,
    'hint css',
)

# 2. Разметка подсказки
html = rep(
    html,
    """      <div class="tab-at-status" hidden></div>
      <div class="tab-at-empty-hint" data-tab-empty-hint hidden>Нажмите цифру на клавиатуре, чтобы поставить ноту</div>
    </div>""",
    """      <div class="tab-at-status" hidden></div>
    </div>""",
    1,
    'hint markup',
)

# 3. Функция tabSyncEmptyHint
html = rep(
    html,
    """// Подсказка в пустом стане: пока во вставке нет ни одной звучащей ноты.
function tabSyncEmptyHint(editor) {
  const overlay = editor && editor.overlay;
  if (!overlay) return;
  const hint = overlay.querySelector('[data-tab-empty-hint]');
  if (!hint) return;
  const notes = (editor.draft && editor.draft.notes) || [];
  const host = overlay.querySelector('.tab-at-host');
  // Стан недоступен (нет движка/своя ошибка) — там уже говорит .tab-at-status,
  // подсказка поверх него была бы кашей из двух текстов.
  const staffHidden = !host || host.hidden;
  hint.hidden = staffHidden || notes.some((n) => n && !n.pause);
}

""",
    '',
    1,
    'hint fn',
)

# 4. Вызовы
html = rep(
    html,
    """    // 0.874: подсказка пустого стана и состояние панели ладов — там же.
    tabSyncEmptyHint(editor);
    tabApplyFretPadState(editor);""",
    """    // 0.874: состояние панели ладов — там же.
    tabApplyFretPadState(editor);""",
    1,
    'hint call live',
)

html = rep(
    html,
    """  tabSyncCustomSelects(editor.overlay);
  tabSyncEmptyHint(editor);
  tabApplyFretPadState(editor);""",
    """  tabSyncCustomSelects(editor.overlay);
  tabApplyFretPadState(editor);""",
    1,
    'hint call full',
)

# 5. Версия
html = rep(html, '· ver 0.875', '· ver 0.876', 1, 'app version')

with io.open(PATH, 'w', encoding='utf-8') as f:
    f.write(html)
print('OK %d -> %d (%+d)' % (size0, len(html.encode('utf-8')), len(html.encode('utf-8')) - size0))
