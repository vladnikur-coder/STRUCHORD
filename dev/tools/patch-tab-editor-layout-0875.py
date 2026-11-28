#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""0.875 · Регрессия 0.874: стан снова главный элемент окна редактора таб-вставки.

Что делает патч:
  1) стан получает гарантированный минимум высоты (clamp(13.75rem, 32vh, 34rem)
     — на экране 680 px это ровно 220 px) и растёт по flex, забирая свободное
     место; ни один медиазапрос больше не опускает его ниже этого минимума;
  2) палитра становится компактной: секции «Длительности», «Правка»,
     «Навигация», «Приёмы» — строки с заголовком-переключателем, вторичные
     на компьютере свёрнуты по умолчанию; панель ладов — одна строка без
     заголовка на отдельной строке; постоянная подсказка «Приём ставится на
     ноту…» уходит в «?» и tooltip, пустое место под «Приёмами» исчезает;
  3) строка «Такт N: M из K — не заполнен» живёт в полосе фиксированной
     высоты и больше не красная — это обычное состояние при вводе;
  4) стан сам прокручивается к курсору и только что введённой ноте.

Данные, формат сохранения, звук и горячие клавиши не меняются.
"""
import io
import sys

PATH = 'STRUCHORD.html'


def rep(text, old, new, count=1, label=''):
    n = text.count(old)
    if n != count:
        sys.exit('FAIL %s: expected %d, found %d for %r' % (label, count, n, old[:160]))
    return text.replace(old, new)


with io.open(PATH, encoding='utf-8') as f:
    html = f.read()
size0 = len(html.encode('utf-8'))

# ===========================================================================
# 1. Высоты: стан — минимум 220 px на 680 px и рост по свободному месту
# ===========================================================================
html = rep(
    html,
    """.tab-insert-editor {
  --tab-staff-min: 4.75rem;
  --tab-staff-max: clamp(6rem, 26vh, 15rem);
  --tab-status-slot: 1.35rem;
}""",
    """.tab-insert-editor {
  /* 0.875: стан — главный элемент окна. 13.75rem = 220 px: на экране 680 px
     (32vh = 218 px) кламп держит ровно этот минимум, на 900 px отдаёт стану
     288 px, на 800 px — 256 px. Верхняя граница только для очень высоких
     экранов, дальше стан растягивается по flex и забирает всё свободное. */
  --tab-staff-min: clamp(13.75rem, 32vh, 34rem);
  --tab-status-slot: 2rem;
}""",
    1,
    'editor vars',
)

html = rep(
    html,
    """.tab-at-host {
  position: relative;
  width: 100%;
  flex: 0 1 auto;
  min-height: var(--tab-staff-min);
  /* 0.874: стан не растягивает окно. Два такта и больше прокручиваются
     внутри стана, а панели инструментов остаются на экране. */
  max-height: var(--tab-staff-max);
  overflow-x: auto;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  cursor: text;
  outline: none;
}""",
    """.tab-at-host {
  position: relative;
  width: 100%;
  /* 0.875: стан не уступает панелям и не сжимается в полоску: у него
     собственный минимум высоты и рост по свободному месту, а длинная
     вставка прокручивается внутри стана (и сама подкручивается к курсору). */
  flex: 1 1 auto;
  min-height: var(--tab-staff-min);
  overflow-x: auto;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  cursor: text;
  outline: none;
}""",
    1,
    'staff grows',
)

html = rep(
    html,
    """.tab-editor-surface {
  position: relative;
  flex: 0 1 auto;
  min-height: 5.5rem;""",
    """.tab-editor-surface {
  position: relative;
  flex: 1 1 auto;
  /* Минимум поверхности = шапка стана + минимум самого стана. */
  min-height: calc(var(--tab-staff-min) + 2rem);""",
    1,
    'surface grows',
)

# --- медиазапросы, которые опускали стан ниже минимума ---------------------
html = rep(
    html,
    """  .tab-editor-surface { min-height: 8.25rem; padding: 0.25rem 0.4375rem 0.375rem; }
  .tab-at-host { min-height: 6.25rem; }""",
    """  .tab-editor-surface { min-height: calc(var(--tab-staff-min) + 1.75rem); padding: 0.25rem 0.4375rem 0.375rem; }
  .tab-at-host { min-height: var(--tab-staff-min); }""",
    1,
    '860px block',
)

html = rep(
    html,
    """  .tab-insert-editor {
    --tab-staff-min: 3.75rem;
    --tab-staff-max: clamp(4.5rem, 20vh, 9rem);
    --tab-status-slot: 1.2rem;
  }""",
    """  .tab-insert-editor {
    /* 0.875: минимум стана не зависит от высоты окна — иначе на 1366×680
       стан снова сжимался бы в полоску. */
    --tab-status-slot: 1.85rem;
  }""",
    1,
    'compact vars',
)

html = rep(
    html,
    """  .tab-editor-surface { min-height: 4.25rem; padding: 0.1875rem 0.375rem 0.25rem; }""",
    """  .tab-editor-surface { min-height: calc(var(--tab-staff-min) + 1.5rem); padding: 0.1875rem 0.375rem 0.25rem; }""",
    1,
    'compact surface',
)

html = rep(
    html,
    """  .tab-editor-surface {
    min-height: 6rem;
    flex: 0 0 auto;
    padding: 0.25rem 0.375rem 0.25rem;
  }
  .tab-at-host { min-height: 4.5rem; }""",
    """  .tab-editor-surface {
    min-height: calc(var(--tab-staff-min) + 1.75rem);
    flex: 0 0 auto;
    padding: 0.25rem 0.375rem 0.25rem;
  }
  .tab-at-host { min-height: var(--tab-staff-min); }""",
    1,
    'mobile surface/host',
)

html = rep(
    html,
    """  .tab-editor-surface {
    flex: 1 1 auto;
    min-height: 7.5rem;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 0.375rem 0.625rem 0.5rem;
  }
  .tab-at-host {
    margin: auto 0;
    min-height: 5.75rem;
  }""",
    """  .tab-editor-surface {
    flex: 1 1 auto;
    min-height: calc(var(--tab-staff-min) + 1.75rem);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 0.375rem 0.625rem 0.5rem;
  }
  .tab-at-host {
    margin: auto 0;
    min-height: var(--tab-staff-min);
  }""",
    1,
    'tablet surface/host',
)

html = rep(
    html,
    """  .tab-editor-surface { min-height: 5rem; padding: 0.1875rem 0.3125rem; }
  .tab-at-host { min-height: 3.75rem; }""",
    """  .tab-editor-surface { min-height: calc(var(--tab-staff-min) + 1.5rem); padding: 0.1875rem 0.3125rem; }
  .tab-at-host { min-height: var(--tab-staff-min); }""",
    1,
    'phone surface/host',
)

html = rep(
    html,
    """  .tab-editor-surface { min-height: 8.5rem; }
  .tab-at-host { min-height: 6.75rem; }""",
    """  .tab-editor-surface { min-height: calc(var(--tab-staff-min) + 1.5rem); }
  .tab-at-host { min-height: var(--tab-staff-min); }""",
    1,
    'phone tall surface/host',
)

# ===========================================================================
# 2. Строка статуса: фиксированная полоса и нейтральный цвет для «не заполнен»
# ===========================================================================
html = rep(
    html,
    """.tab-status-slot > .tab-gp-error { min-width: 0; }""",
    """.tab-status-slot > .tab-gp-error { min-width: 0; }
/* 0.875: обычное состояние ввода — «Такт N: M из K — не заполнен». Полоса
   на это время фиксируется по высоте, а текст становится серым: красный цвет
   остаётся настоящим ошибкам (переполнение, лады вне диапазона). */
.tab-status-slot.is-compact {
  height: var(--tab-status-slot);
  overflow: hidden;
}
.tab-status-slot.is-compact > .tab-gp-error {
  flex-wrap: nowrap;
  white-space: nowrap;
  overflow: hidden;
}
.tab-status-slot.is-compact .tab-gp-error-msg {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tab-status-slot.is-compact .tab-gp-error-actions { flex: 0 0 auto; }
/* Кнопка быстрого исправления обязана влезать в фиксированную полосу. */
.tab-status-slot.is-compact .tab-gp-fix-btn {
  min-height: 0;
  height: 1.5rem;
  padding: 0 0.5rem;
  font-size: 0.75rem;
}
.tab-gp-error.is-incomplete {
  color: var(--color-text-secondary);
  font-weight: 500;
}
.tab-gp-error.is-incomplete .tab-gp-fix-btn { color: var(--color-text-primary); }""",
    1,
    'incomplete status css',
)

# ===========================================================================
# 3. Подсказка «Приём ставится на ноту…» — не постоянная строка
# ===========================================================================
html = rep(
    html,
    """.tab-tech-status {
  min-height: 1.125rem;
  margin: 0.1875rem 0 0;
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}""",
    """.tab-tech-status {
  /* 0.875: строка живёт только когда есть что сказать (приём выбранной ноты).
     Постоянная подсказка ушла в «?» и в tooltip заголовка «Приёмы». */
  min-height: 0;
  margin: 0.1875rem 0 0;
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}
.tab-tech-status:empty { display: none; }""",
    1,
    'tech status css',
)

# ===========================================================================
# 4. Компактная палитра и панель ладов на компьютере
# ===========================================================================
html = rep(
    html,
    """@media (min-width: 64.0625rem) and (hover: hover) and (pointer: fine) {
  .tab-tools-row--frets {""",
    """/* 0.875: переключатели секций палитры нужны только на компьютере — на
   тач-раскладке разделы переключаются вкладками «Ноты / Приёмы / Правка». */
.tab-group-toggle { display: none; }
@media (min-width: 64.0625rem) and (hover: hover) and (pointer: fine) {
  .tab-tools-row--frets {""",
    1,
    'group toggle fallback',
)

html = rep(
    html,
    """  .tab-tools-row--frets[data-collapsed="true"] .tab-fret-pad { display: none; }""",
    """  /* 0.875: одна строка — переключатель и десять цифр рядом, без переносов. */
  .tab-tools-row--frets { flex-wrap: nowrap; }
  .tab-tools-row--frets[data-collapsed="true"] .tab-fret-pad { display: none; }""",
    1,
    'frets nowrap',
)

html = rep(
    html,
    """  .tab-tools-row--frets .tab-fret-pad { flex: 1 1 auto; min-width: 0; }
  .tab-tools-row--frets .tab-fret-key { min-height: 1.9rem; height: 1.9rem; font-size: 0.875rem; }
}""",
    """  /* flex-basis 0, а не auto: иначе 100-процентная ширина грифа выдавливала
     переключатель «Лады» на отдельную строку. */
  .tab-tools-row--frets .tab-fret-pad { flex: 1 1 0; min-width: 0; width: auto; }
  .tab-tools-row--frets .tab-fret-key { min-height: 1.9rem; height: 1.9rem; font-size: 0.875rem; }

  /* 0.875: палитра — компактные секции-строки. Заголовок каждой секции стал
     переключателем, вторичные секции на компьютере свёрнуты по умолчанию:
     стан забирает освободившуюся высоту. */
  .tab-palette { gap: 0.25rem; }
  .tab-palette-top-band {
    padding: 0.25rem 0.375rem;
    gap: 0.25rem 0.375rem;
    align-items: flex-start;
    border-radius: 0.625rem;
  }
  .tab-palette-group {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.1875rem 0.25rem;
    padding-top: 0.125rem;
    padding-bottom: 0.125rem;
  }
  .tab-palette-group[data-tab-group] { padding-right: 0.375rem; }
  .tab-palette-group--tech {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.1875rem 0.25rem;
    padding: 0.25rem 0.375rem;
    border-radius: 0.625rem;
  }
  .tab-palette-group--tech > [data-tab-tech-params],
  .tab-palette-group--tech > .tab-tech-status { flex: 1 1 100%; }
  .tab-palette-group[data-tab-group][data-open="false"] > .tab-tools-row,
  .tab-palette-group[data-tab-group][data-open="false"] > [data-tab-tech-params],
  .tab-palette-group[data-tab-group][data-open="false"] > .tab-tech-status { display: none; }
  .tab-group-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    flex: 0 0 auto;
    padding: 0.1875rem 0.375rem;
    font: inherit;
    font-size: 0.6875rem;
    font-weight: 650;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--color-text-secondary);
    background: transparent;
    border: 0.0625rem solid transparent;
    border-radius: 0.375rem;
  }
  .tab-group-toggle:hover {
    color: var(--color-text-primary);
    background: var(--color-surface);
    border-color: var(--color-border-light);
  }
  .tab-group-caret { font-size: 0.625rem; line-height: 1; transition: transform 0.14s; }
  .tab-palette-group[data-open="false"] .tab-group-caret { transform: rotate(-90deg); }
}""",
    1,
    'compact palette css',
)

# ===========================================================================
# 5. Разметка: заголовки секций — переключатели
# ===========================================================================
html = rep(
    html,
    """        <div class="tab-palette-group" data-mobile-pane="notes">
          <span class="tab-group-title">Длительности</span>""",
    """        <div class="tab-palette-group" data-mobile-pane="notes" data-tab-group="dur" data-open="${tabPaletteGroupOpen('dur') ? 'true' : 'false'}">
          <button type="button" class="tab-group-toggle" data-tab-group-toggle="dur" aria-expanded="${tabPaletteGroupOpen('dur') ? 'true' : 'false'}" title="Длительности, точки и триоли — открыть или свернуть секцию"><span class="tab-group-title">Длительности</span><span class="tab-group-caret" aria-hidden="true">▾</span></button>""",
    1,
    'durations group',
)

html = rep(
    html,
    """        <div class="tab-palette-group" data-mobile-pane="edit">
          <span class="tab-group-title">Правка</span>""",
    """        <div class="tab-palette-group" data-mobile-pane="edit" data-tab-group="edit" data-open="${tabPaletteGroupOpen('edit') ? 'true' : 'false'}">
          <button type="button" class="tab-group-toggle" data-tab-group-toggle="edit" aria-expanded="${tabPaletteGroupOpen('edit') ? 'true' : 'false'}" title="Очистка, отмена, копирование и вставка — открыть или свернуть секцию"><span class="tab-group-title">Правка</span><span class="tab-group-caret" aria-hidden="true">▾</span></button>""",
    1,
    'edit group',
)

html = rep(
    html,
    """        <div class="tab-palette-group" data-mobile-pane="notes">
          <span class="tab-group-title">Навигация</span>""",
    """        <div class="tab-palette-group" data-mobile-pane="notes" data-tab-group="nav" data-open="${tabPaletteGroupOpen('nav') ? 'true' : 'false'}">
          <button type="button" class="tab-group-toggle" data-tab-group-toggle="nav" aria-expanded="${tabPaletteGroupOpen('nav') ? 'true' : 'false'}" title="Стрелки по долям и струнам, такты — открыть или свернуть секцию"><span class="tab-group-title">Навигация</span><span class="tab-group-caret" aria-hidden="true">▾</span></button>""",
    1,
    'nav group',
)

html = rep(
    html,
    """  return `<div class="tab-palette-group tab-palette-group--tech tab-tech" data-mobile-pane="tech">
    <span class="tab-group-title">Приёмы</span>""",
    """  return `<div class="tab-palette-group tab-palette-group--tech tab-tech" data-mobile-pane="tech" data-tab-group="tech" data-open="${tabPaletteGroupOpen('tech') ? 'true' : 'false'}">
    <button type="button" class="tab-group-toggle" data-tab-group-toggle="tech" aria-expanded="${tabPaletteGroupOpen('tech') ? 'true' : 'false'}" title="Приём ставится на ноту под курсором, а при выделении — сразу на все выбранные ноты. Открыть или свернуть секцию"><span class="tab-group-title">Приёмы</span><span class="tab-group-caret" aria-hidden="true">▾</span></button>""",
    1,
    'tech group',
)

# ===========================================================================
# 6. JS: состояние секций, автопрокрутка к курсору, статус и подсказка приёмов
# ===========================================================================
helpers = r'''// 0.875: секции палитры. На компьютере вторичные секции свёрнуты, чтобы стан
// получил высоту; выбор владельца запоминается. На тач-раскладке CSS эти
// атрибуты игнорирует — там разделы переключаются вкладками.
const TAB_PALETTE_STATE_KEY = 'struchord-tab-palette';
const TAB_PALETTE_OPEN_DEFAULT = { dur: true, edit: false, nav: false, tech: false };
function tabPaletteState() {
  let saved = {};
  try {
    const raw = localStorage.getItem(TAB_PALETTE_STATE_KEY);
    saved = raw ? JSON.parse(raw) : {};
  } catch (_) {
    saved = {};
  }
  const out = { ...TAB_PALETTE_OPEN_DEFAULT };
  if (saved && typeof saved === 'object') {
    for (const key of Object.keys(out)) if (typeof saved[key] === 'boolean') out[key] = saved[key];
  }
  return out;
}
function tabPaletteGroupOpen(key) {
  const open = tabPaletteState()[key];
  return open === undefined ? true : !!open;
}
function tabApplyPaletteGroups(overlay) {
  const root = overlay || (tabInsertEditorState && tabInsertEditorState.overlay);
  if (!root) return;
  const state = tabPaletteState();
  root.querySelectorAll('[data-tab-group]').forEach((group) => {
    const key = group.getAttribute('data-tab-group');
    const open = state[key] === undefined ? true : !!state[key];
    group.setAttribute('data-open', open ? 'true' : 'false');
    const btn = group.querySelector('[data-tab-group-toggle]');
    if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
}
function tabTogglePaletteGroup(key, overlay) {
  const state = tabPaletteState();
  state[key] = !(state[key] === undefined ? true : !!state[key]);
  try {
    localStorage.setItem(TAB_PALETTE_STATE_KEY, JSON.stringify(state));
  } catch (_) {}
  tabApplyPaletteGroups(overlay);
}

// 0.875: стан сам подкручивается к курсору. Без этого на низком окне ноты и
// курсор уходили ниже видимой области, а scrollTop оставался нулём.
function tabAtScrollCursorIntoView() {
  const host = tabAtHostEl;
  if (!host || host.hidden) return false;
  const dot = host.querySelector('.tab-at-cursor-dot');
  if (!dot || dot.hidden) return false;
  const view = host.clientHeight || 0;
  const rendered = host.scrollHeight || 0;
  // Стан ещё не разложен (0 высоты или содержимое целиком влезает) — нечего делать.
  if (view <= 0 || rendered <= view + 1) return false;
  const boxH = dot.offsetHeight || 24;
  const top = dot.offsetTop;
  const bottom = top + boxH;
  const pad = Math.max(12, Math.round(boxH / 2));
  const current = host.scrollTop || 0;
  let next = current;
  if (top - pad < current) next = top - pad;
  else if (bottom + pad > current + view) next = bottom + pad - view;
  next = Math.max(0, Math.min(next, rendered - view));
  if (Math.abs(next - current) < 1) return false;
  host.scrollTop = next;
  return true;
}

'''
html = rep(
    html,
    """function tabGpSync(e) {""",
    helpers + """function tabGpSync(e) {""",
    1,
    'palette + scroll helpers',
)

# вызов автопрокрутки в конце tabAtPlaceCursor
html = rep(
    html,
    """  if (readout) {
    readout.textContent = text;
    readout.hidden = false;
  }
  if (dockedReadout) dockedReadout.textContent = headerText;
}""",
    """  if (readout) {
    readout.textContent = text;
    readout.hidden = false;
  }
  if (dockedReadout) dockedReadout.textContent = headerText;
  // 0.875: курсор и только что введённая нота обязаны быть видны.
  tabAtScrollCursorIntoView();
}""",
    1,
    'scroll on place cursor',
)

# подсказка приёмов: постоянную строку убираем
html = rep(
    html,
    """  root.querySelector('[data-tab-tech-status]').textContent = n
    ? tabTechLabel(n)
    : 'Приём ставится на ноту под курсором, а при выделении — сразу на все выбранные ноты.';""",
    """  // 0.875: постоянная подсказка больше не занимает строку под «Приёмами» —
  // она живёт в «?» и в tooltip заголовка секции, а строка говорит только
  // о приёме выбранной ноты.
  root.querySelector('[data-tab-tech-status]').textContent = n ? tabTechLabel(n) : '';""",
    1,
    'tech status text',
)

# «не заполнен» — не ошибка: нейтральный цвет и фиксированная полоса
html = rep(
    html,
    """    const text = blockingText || e.gpNotice || '';
    status.hidden = !text;
    status.classList.toggle('is-notice', !blockingText && !!e.gpNotice);""",
    """    const text = blockingText || e.gpNotice || '';
    // 0.875: недобор долей — обычное состояние ввода, а не ошибка: серый текст
    // и полоса фиксированной высоты, чтобы окно не прыгало.
    const underOnly =
      !e.gpError && !modelError && errors.length > 0 && errors.every((b) => b.used < meter - 1e-8);
    const incomplete = underOnly && !e.gpNotice;
    status.hidden = !text;
    status.classList.toggle('is-notice', !blockingText && !!e.gpNotice);
    status.classList.toggle('is-incomplete', incomplete);
    const slot = status.closest('.tab-status-slot');
    if (slot) slot.classList.toggle('is-compact', incomplete);""",
    1,
    'validate incomplete',
)

# обработчик переключателей секций
html = rep(
    html,
    """    if (event.target.closest('[data-tab-fret-toggle]')) {""",
    """    const groupBtn = event.target.closest('[data-tab-group-toggle]');
    if (groupBtn) {
      event.preventDefault();
      tabTogglePaletteGroup(groupBtn.getAttribute('data-tab-group-toggle'), editor.overlay);
      tabAtHostEl?.focus({ preventScroll: true });
      return;
    }
    if (event.target.closest('[data-tab-fret-toggle]')) {""",
    1,
    'group toggle handler',
)

# шпаргалка: подсказка про приёмы
html = rep(
    html,
    """    ['Ввод и длительности', [
""",
    """    ['Ввод и длительности', [
      ['Приём ставится на ноту под курсором (при выделении — на все выбранные)', 'L H P …'],
""",
    1,
    'shortcuts tech tip',
)

# ===========================================================================
# 7. Версия
# ===========================================================================
html = rep(html, '· ver 0.874', '· ver 0.875', 1, 'app version')

with io.open(PATH, 'w', encoding='utf-8') as f:
    f.write(html)

size1 = len(html.encode('utf-8'))
print('OK %d -> %d (%+d)' % (size0, size1, size1 - size0))
