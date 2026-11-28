#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""0.873 · таб-вставка: пустой хвост убирается при сохранении.

Стрелка → на последней доле добавляет настоящий такт (0.694). Пользователь,
набравший четыре ноты, получал «2 такта» и не понимал, откуда второй. Теперь
при «Применить» пустые такты в конце вставки убираются, а рядом с полем
«Длина» показывается короткая подсказка.

Границы правки:
  • пустые такты в СЕРЕДИНЕ не трогаются;
  • такт, заведённый человеком («+ Такт», поле «Длина», открытая песня),
    помечен `manualBar` и остаётся;
  • хотя бы один такт остаётся всегда — пустая вставка сохраняется как раньше.

Только точные замены с проверкой числа вхождений.
"""
import io
import sys

PATH = 'STRUCHORD.html'


def rep(text, old, new, count=1, label=''):
    n = text.count(old)
    if n != count:
        sys.exit('FAIL %s: expected %d, found %d for %r' % (label, count, n, old[:120]))
    return text.replace(old, new)


with io.open(PATH, encoding='utf-8') as f:
    html = f.read()
size0 = len(html.encode('utf-8'))

# ---------------------------------------------------------------------------
# 1. Хелперы «пустой хвост» перед tabGpValidate
# ---------------------------------------------------------------------------
helpers = r'''// 0.873: пустой такт в КОНЦЕ вставки — чаще всего след стрелки →, а не
// намерение человека. При «Применить» такие такты убираются. Такт, который
// завели сами («+ Такт», поле «Длина», открытая песня), помечен `manualBar`
// и остаётся; пустые такты в середине не трогаем никогда.
function tabGpBarIsEmpty(bar) {
  return Array.isArray(bar) && !bar.some((g) => g && ((g.notes || []).length || g.pad || g.keep));
}
function tabGpBarIsManual(bar) {
  return Array.isArray(bar) && bar.some((g) => g && g.manualBar);
}
function tabGpMarkManualBar(bar) {
  if (Array.isArray(bar) && bar.length && bar[0] && typeof bar[0] === 'object') bar[0].manualBar = true;
  return bar;
}
// Сколько тактов в конце вставки уберётся при сохранении. Хотя бы один такт
// остаётся всегда — пустая вставка сохраняется ровно как до 0.873.
function tabGpTrailingEmptyBars(e) {
  const bars = e && Array.isArray(e.gpBars) ? e.gpBars : null;
  if (!bars || bars.length < 2) return 0;
  let count = 0;
  for (let i = bars.length - 1; i > 0; i -= 1) {
    if (!tabGpBarIsEmpty(bars[i]) || tabGpBarIsManual(bars[i])) break;
    count += 1;
  }
  return count;
}
function tabGpTrimTrailingEmptyBars(e) {
  const count = tabGpTrailingEmptyBars(e);
  if (!count) return 0;
  const bars = e.gpBars;
  bars.length -= count;
  if (e.gpCursor && e.gpCursor.bar > bars.length - 1) e.gpCursor = { bar: bars.length - 1, index: 0 };
  if (e.gpSelection) {
    const clamp = (p) => (p && Number.isInteger(p.bar) ? { ...p, bar: Math.min(p.bar, bars.length - 1) } : p);
    e.gpSelection = { anchor: clamp(e.gpSelection.anchor), focus: clamp(e.gpSelection.focus) };
  }
  return count;
}
// Подсказка рядом с полем «Длина»: пустая строка — хвоста нет.
function tabGpLengthHintText(e) {
  const count = tabGpTrailingEmptyBars(e);
  if (!count) return '';
  return count === 1
    ? 'пустой такт в конце уберётся при сохранении'
    : `пустых тактов в конце: ${count} — уберутся при сохранении`;
}
const TAB_GP_LENGTH_HINT_TITLE = 'Такты, добавленные стрелкой →, при сохранении убираются. Такт, добавленный кнопкой «+ Такт», остаётся.';
function tabGpSyncLengthHint(e) {
  const host = e && e.overlay ? e.overlay.querySelector('[data-tab-length-hint]') : null;
  if (!host) return;
  const text = e.gpBars ? tabGpLengthHintText(e) : '';
  host.textContent = text;
  host.hidden = !text;
}

'''

html = rep(
    html,
    'function tabGpValidate(e) {',
    helpers + 'function tabGpValidate(e) {',
    1,
    'helpers before tabGpValidate',
)

# ---------------------------------------------------------------------------
# 2. Пометка «такт завёл человек»: импорт черновика, «Длина», «+ Такт», «Заполнить паузами»
# ---------------------------------------------------------------------------
html = rep(
    html,
    """    if (!groups.length) groups.push(tabGpBlank(e));
    else groups.push(...tabGpFillers(bar.end - offset, denom));
    return groups;
  });
  e.gpCursor = { bar: 0, index: 0 };""",
    """    if (!groups.length) groups.push(tabGpBlank(e));
    else groups.push(...tabGpFillers(bar.end - offset, denom));
    // 0.873: такт пришёл из песни — это данные человека, а не хвост стрелки.
    return tabGpMarkManualBar(groups);
  });
  e.gpCursor = { bar: 0, index: 0 };""",
    1,
    'mark imported bars',
)

html = rep(
    html,
    """    while (e.gpBars.length < count) e.gpBars.push([tabGpBlank(e)]);""",
    """    while (e.gpBars.length < count) e.gpBars.push(tabGpMarkManualBar([tabGpBlank(e)]));""",
    1,
    'mark resize bars',
)

html = rep(
    html,
    """      e.gpBars.forEach((bar) => bar.forEach((x) => delete x.autoAdded));
      e.gpBars.splice(e.gpCursor.bar, 0, [tabGpBlank(e)]);""",
    """      e.gpBars.forEach((bar) => bar.forEach((x) => delete x.autoAdded));
      // 0.873: «+ Такт» — явное действие: пустой такт останется и на сохранении.
      e.gpBars.splice(e.gpCursor.bar, 0, tabGpMarkManualBar([tabGpBlank(e)]));""",
    1,
    'mark + Такт',
)

html = rep(
    html,
    """      if (mode === 'pad' && used < meter - TAB_AT_EPS) {
        if (used < TAB_AT_EPS) {
          e.gpBars[b] = [tabGpBlank(e)];""",
    """      if (mode === 'pad' && used < meter - TAB_AT_EPS) {
        if (used < TAB_AT_EPS) {
          e.gpBars[b] = tabGpMarkManualBar([tabGpBlank(e)]);""",
    1,
    'mark padded bars',
)

# ---------------------------------------------------------------------------
# 3. «Применить»: сначала срезаем пустой хвост, потом валидация и запись
# ---------------------------------------------------------------------------
html = rep(
    html,
    """    if (event.target.closest('[data-tab-apply]')) {
      // 0.694: такт, добавленный стрелкой →, — настоящий: при сохранении
      // он больше не выбрасывается (раньше это были «временные» такты).
      if ((editor.gpBars || editor.gpError) && !tabGpValidate(editor)) {""",
    """    if (event.target.closest('[data-tab-apply]')) {
      // 0.873: пустой хвост (след стрелки →) в песню не пишется. Такты,
      // заведённые человеком, помечены manualBar и остаются, а длина и ноты
      // пересобираются уже от срезанного черновика.
      if (editor.gpBars && tabGpTrimTrailingEmptyBars(editor)) tabGpSync(editor);
      if ((editor.gpBars || editor.gpError) && !tabGpValidate(editor)) {""",
    1,
    'trim on apply',
)

# ---------------------------------------------------------------------------
# 4. Разметка: подсказка рядом с «Длина»
# ---------------------------------------------------------------------------
html = rep(
    html,
    """    <div class="tab-editor-meta">
      <div class="tab-editor-length"><span>Длина</span>${tabRenderSelectHtml('data-tab-beats aria-label="Длина"', beatsOptionsHtml)}</div>""",
    """    <div class="tab-editor-meta">
      <div class="tab-editor-length"><span>Длина</span>${tabRenderSelectHtml('data-tab-beats aria-label="Длина"', beatsOptionsHtml)}</div>
      <span class="tab-length-hint" data-tab-length-hint${editor.gpBars && tabGpTrailingEmptyBars(editor) ? '' : ' hidden'} title="${TAB_GP_LENGTH_HINT_TITLE}">${escapeHtml(tabGpLengthHintText(editor))}</span>""",
    1,
    'length hint markup',
)

# Живой путь перерисовки: разметку не пересобираем, подсказку обновляем точечно.
html = rep(
    html,
    """    tabSyncCustomSelects(editor.overlay);
    tabAtRender(editor);
    if(editor.gpBars)tabGpValidate(editor);
    return;""",
    """    tabSyncCustomSelects(editor.overlay);
    // 0.873: подсказка про пустой хвост живёт рядом с «Длина» и на живой
    // перерисовке (разметку тут пересобирать нельзя — мигнёт alphaTab).
    tabGpSyncLengthHint(editor);
    tabAtRender(editor);
    if(editor.gpBars)tabGpValidate(editor);
    return;""",
    1,
    'live path hint',
)

# ---------------------------------------------------------------------------
# 5. CSS подсказки
# ---------------------------------------------------------------------------
html = rep(
    html,
    """.tab-editor-length > span { flex: none; white-space: nowrap; }""",
    """.tab-editor-length > span { flex: none; white-space: nowrap; }
/* 0.873: короткая подсказка у «Длины»: пустой хвост при сохранении уберётся */
.tab-length-hint {
  font-size: 0.75rem;
  line-height: 1.3;
  color: var(--color-text-tertiary);
  max-width: 22rem;
}
.tab-length-hint[hidden] { display: none; }""",
    1,
    'hint css',
)

# ---------------------------------------------------------------------------
# 6. Версия
# ---------------------------------------------------------------------------
html = rep(html, '· ver 0.872', '· ver 0.873', 1, 'app version')

with io.open(PATH, 'w', encoding='utf-8') as f:
    f.write(html)

size1 = len(html.encode('utf-8'))
print('OK %d -> %d (%+d)' % (size0, size1, size1 - size0))
