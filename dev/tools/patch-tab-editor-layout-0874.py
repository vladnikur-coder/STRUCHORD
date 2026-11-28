#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""0.874 · Окно редактора таб-вставки: стан с ограниченной высотой и своей
прокруткой, панель инструментов всегда целиком видна (компактный режим на
низких экранах), строка статуса больше не двигает окно, панель ладов 0–9 на
компьютере (сворачиваемая) и подсказка в пустом стане.

Данные, звук и горячие клавиши не трогаются: правки только в разметке окна,
его CSS и двух обработчиках (свернуть панель ладов, показать/скрыть подсказку).
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

# ---------------------------------------------------------------------------
# 1. Переменные высот + стан с ограниченной высотой и собственной прокруткой
# ---------------------------------------------------------------------------
html = rep(
    html,
    """.tab-insert-editor .strum-modal-content {
  width: min(71rem, 96vw);
  max-width: min(71rem, 96vw) !important;""",
    """/* 0.874: высоты окна редактора. Стан ограничен и прокручивается сам,
   строка статуса заранее занимает место — окно не подпрыгивает. */
.tab-insert-editor {
  --tab-staff-min: 4.75rem;
  --tab-staff-max: clamp(6rem, 26vh, 15rem);
  --tab-status-slot: 1.35rem;
}
.tab-insert-editor .strum-modal-content {
  width: min(71rem, 96vw);
  max-width: min(71rem, 96vw) !important;""",
    1,
    'editor vars',
)

html = rep(
    html,
    """.tab-at-host {
  position: relative;
  width: 100%;
  flex: 0 0 auto;
  min-height: 10.5rem;
  overflow-x: auto;
  overflow-y: visible;
  cursor: text;
  outline: none;
}""",
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
    1,
    'staff clamp',
)

html = rep(
    html,
    """.tab-editor-surface {
  position: relative;
  flex: 0 0 auto;
  min-height: 9rem;""",
    """.tab-editor-surface {
  position: relative;
  flex: 0 1 auto;
  min-height: 5.5rem;""",
    1,
    'surface shrinkable',
)

# ---------------------------------------------------------------------------
# 2. Панели инструментов не сжимаются в полоску
# ---------------------------------------------------------------------------
html = rep(
    html,
    """.tab-palette {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}""",
    """.tab-palette {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  /* 0.874: панель не сжимается — при нехватке места уступает стан. */
  flex: 0 0 auto;
}""",
    1,
    'palette no shrink',
)

html = rep(
    html,
    """.tab-palette-top-band {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;""",
    """.tab-palette-top-band {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  align-items: stretch;""",
    1,
    'top band no shrink',
)

html = rep(
    html,
    """.tab-palette-group {
  display: flex;
  flex-direction: column;
  gap: 0.3125rem;""",
    """.tab-palette-group {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 0.3125rem;""",
    1,
    'group no shrink',
)

html = rep(
    html,
    """.tab-tools-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  align-items: center;
}""",
    """.tab-tools-row {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  gap: 0.25rem;
  align-items: center;
}""",
    1,
    'tools row no shrink',
)

# ---------------------------------------------------------------------------
# 3. Зарезервированное место под строку статуса
# ---------------------------------------------------------------------------
html = rep(
    html,
    """.tab-gp-error[hidden] { display: none !important; }""",
    """.tab-gp-error[hidden] { display: none !important; }
/* 0.874: место под строку статуса занято всегда — появление «Такт N: M из K»
   больше не сдвигает стан и панели вниз. Длинный текст прокручивается здесь. */
.tab-status-slot {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  min-height: var(--tab-status-slot);
  max-height: 4.5rem;
  overflow-y: auto;
}
.tab-status-slot > .tab-gp-error { min-width: 0; }""",
    1,
    'status slot',
)

# ---------------------------------------------------------------------------
# 4. Подсказка в пустом стане
# ---------------------------------------------------------------------------
html = rep(
    html,
    """.tab-at-host svg { display: block; }""",
    """.tab-at-host svg { display: block; }
/* 0.874: в пустом стане видно, что делать дальше (цифра = лад). */
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
.tab-at-empty-hint[hidden] { display: none !important; }""",
    1,
    'empty hint css',
)

# ---------------------------------------------------------------------------
# 5. Панель ладов 0–9 на компьютере + компактный режим низких экранов
# ---------------------------------------------------------------------------
desktop_frets = """/* 0.874: на компьютере тоже есть цифры ладов 0–9 (0.680 убирал панель на
   настольных экранах). Панель сворачивается, состояние помнит владелец,
   по умолчанию — показана. На тач-раскладке всё по-старому: панель закреплена
   снизу, переключателя там нет. */
.tab-fret-toggle { display: none; }
@media (min-width: 64.0625rem) and (hover: hover) and (pointer: fine) {
  .tab-tools-row--frets {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    flex: 0 0 auto;
    padding: 0.25rem 0.375rem;
    border: 0.0625rem solid var(--color-border-light);
    border-radius: 0.6875rem;
    background: var(--color-background-secondary);
  }
  .tab-tools-row--frets[data-collapsed="true"] .tab-fret-pad { display: none; }
  .tab-fret-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    flex: 0 0 auto;
    padding: 0.2rem 0.4375rem;
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
  .tab-fret-toggle:hover {
    color: var(--color-text-primary);
    background: var(--color-surface);
    border-color: var(--color-border-light);
  }
  .tab-fret-toggle-caret { font-size: 0.625rem; transition: transform 0.14s; }
  .tab-tools-row--frets[data-collapsed="true"] .tab-fret-toggle-caret { transform: rotate(-90deg); }
  .tab-tools-row--frets .tab-fret-pad { flex: 1 1 auto; min-width: 0; }
  .tab-tools-row--frets .tab-fret-key { min-height: 1.9rem; height: 1.9rem; font-size: 0.875rem; }
}

/* 0.874: низкие экраны (1366×680 и подобные). Уплотняем отступы и кнопки,
   чтобы стан, все панели и «Отмена/Применить» уместились без прокрутки окна. */
@media (max-height: 760px) {
  .tab-insert-editor {
    --tab-staff-min: 3.75rem;
    --tab-staff-max: clamp(4.5rem, 20vh, 9rem);
    --tab-status-slot: 1.2rem;
  }
  .tab-insert-editor .strum-modal-content {
    padding: 0.5rem 0.875rem;
    gap: 0.25rem;
    max-height: 97vh;
  }
  .tab-modal-topbar { padding-bottom: 0.25rem; }
  .tab-insert-editor h3#tabEditorTitle { font-size: 1rem; }
  .tab-editor-body { gap: 0.25rem; }
  .tab-editor-meta { gap: 0.375rem 0.875rem; }
  .tab-insert-editor .tab-select-pill { min-height: 1.75rem; padding: 0.25rem 0.5rem; }
  .tab-editor-surface { min-height: 4.25rem; padding: 0.1875rem 0.375rem 0.25rem; }
  .tab-surface-bar { min-height: 1.25rem; }
  .tab-palette { gap: 0.25rem; }
  .tab-palette-top-band,
  .tab-palette-group--tech { padding: 0.25rem 0.375rem; gap: 0.25rem 0.375rem; border-radius: 0.5rem; }
  .tab-palette-group { gap: 0.1875rem; padding-right: 0.375rem; }
  .tab-group-title { font-size: 0.625rem; }
  .tab-insert-editor .tab-tool { min-width: 1.55rem; height: 1.6rem; }
  .tab-insert-editor .tab-tool svg.tab-ico { width: 1rem; height: 1rem; }
  .tab-tools-row { gap: 0.1875rem; }
  .tab-tool-sep { height: 1.25rem; }
  .tab-editor-actions { padding-top: 0.25rem; }
  .tab-editor-actions button { min-height: 1.875rem; padding: 0.25rem 0.625rem; }
  .tab-tools-row--frets { padding: 0.125rem 0.25rem; }
  .tab-tools-row--frets .tab-fret-key { min-height: 1.5rem; height: 1.5rem; font-size: 0.75rem; }
}

"""
html = rep(
    html,
    """/* ===== Планшет (≤ 1024 px) и телефон (≤ 390–768 px): полноэкранное окно с вкладками и закреплённой клавиатурой ===== */""",
    desktop_frets + """/* ===== Планшет (≤ 1024 px) и телефон (≤ 390–768 px): полноэкранное окно с вкладками и закреплённой клавиатурой ===== */""",
    1,
    'desktop frets + compact',
)

# ---------------------------------------------------------------------------
# 6. Разметка: слот статуса, подсказка пустого стана, панель ладов с переключателем
# ---------------------------------------------------------------------------
html = rep(
    html,
    """    <div id="tabGpError" data-tab-gp-error class="tab-gp-error" role="status" hidden></div>""",
    """    <div class="tab-status-slot">
      <div id="tabGpError" data-tab-gp-error class="tab-gp-error" role="status" hidden></div>
    </div>""",
    1,
    'status slot markup',
)

html = rep(
    html,
    """      <div class="tab-at-status" hidden></div>
    </div>""",
    """      <div class="tab-at-status" hidden></div>
      <div class="tab-at-empty-hint" data-tab-empty-hint hidden>Нажмите цифру на клавиатуре, чтобы поставить ноту</div>
    </div>""",
    1,
    'empty hint markup',
)

html = rep(
    html,
    """    <div class="tab-tools-row tab-tools-row--frets">
      <div class="tab-fret-pad">${fretKeys}</div>
    </div>""",
    """    <div class="tab-tools-row tab-tools-row--frets" data-tab-fret-row data-collapsed="${tabFretPadCollapsed() ? 'true' : 'false'}">
      <button type="button" class="tab-fret-toggle" data-tab-fret-toggle aria-expanded="${tabFretPadCollapsed() ? 'false' : 'true'}" aria-controls="tabFretPad" title="${tabFretPadCollapsed() ? 'Показать цифры ладов 0–9' : 'Свернуть цифры ладов 0–9'}"><span class="tab-fret-toggle-label">Лады</span><span class="tab-fret-toggle-caret" aria-hidden="true">▾</span></button>
      <div class="tab-fret-pad" id="tabFretPad">${fretKeys}</div>
    </div>""",
    1,
    'fret row markup',
)

# ---------------------------------------------------------------------------
# 7. Логика: состояние панели ладов и подсказка пустого стана
# ---------------------------------------------------------------------------
helpers = r'''// 0.874: панель ладов 0–9 на компьютере. В 0.680 её убирали с настольных
// экранов; теперь она есть, но сворачивается, а выбор владельца запоминается.
// По умолчанию панель ПОКАЗАНА: свёрнутый вид — только осознанный выбор.
const TAB_FRET_PAD_KEY = 'struchord-tab-fret-pad';
function tabFretPadCollapsed() {
  try {
    return localStorage.getItem(TAB_FRET_PAD_KEY) === '0';
  } catch (_) {
    return false;
  }
}
function tabApplyFretPadState(editor) {
  const overlay = editor && editor.overlay;
  if (!overlay) return;
  const row = overlay.querySelector('[data-tab-fret-row]');
  const btn = overlay.querySelector('[data-tab-fret-toggle]');
  if (!row || !btn) return;
  const collapsed = tabFretPadCollapsed();
  row.setAttribute('data-collapsed', collapsed ? 'true' : 'false');
  btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  btn.title = collapsed ? 'Показать цифры ладов 0–9' : 'Свернуть цифры ладов 0–9';
}
function tabToggleFretPad() {
  const collapsed = !tabFretPadCollapsed();
  try {
    localStorage.setItem(TAB_FRET_PAD_KEY, collapsed ? '0' : '1');
  } catch (_) {}
  tabApplyFretPadState(tabInsertEditorState);
}
// Подсказка в пустом стане: пока во вставке нет ни одной звучащей ноты.
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

'''
html = rep(
    html,
    """function renderTabInsertEditor(editor) {""",
    helpers + """function renderTabInsertEditor(editor) {""",
    1,
    'editor layout helpers',
)

# живой путь перерисовки
html = rep(
    html,
    """    tabSyncCustomSelects(editor.overlay);
    // 0.873: подсказка про пустой хвост живёт рядом с «Длина» и на живой
    // перерисовке (разметку тут пересобирать нельзя — мигнёт alphaTab).
    tabGpSyncLengthHint(editor);""",
    """    tabSyncCustomSelects(editor.overlay);
    // 0.873: подсказка про пустой хвост живёт рядом с «Длина» и на живой
    // перерисовке (разметку тут пересобирать нельзя — мигнёт alphaTab).
    tabGpSyncLengthHint(editor);
    // 0.874: подсказка пустого стана и состояние панели ладов — там же.
    tabSyncEmptyHint(editor);
    tabApplyFretPadState(editor);""",
    1,
    'live path layout sync',
)

# полная перерисовка
html = rep(
    html,
    """  tabSyncCustomSelects(editor.overlay);
  tabAtRender(editor);
  if(editor.gpBars || editor.gpError)tabGpValidate(editor);
}""",
    """  tabSyncCustomSelects(editor.overlay);
  tabSyncEmptyHint(editor);
  tabApplyFretPadState(editor);
  tabAtRender(editor);
  if(editor.gpBars || editor.gpError)tabGpValidate(editor);
}""",
    1,
    'full render layout sync',
)

# обработчик переключателя
html = rep(
    html,
    """    const digit = event.target.closest('[data-tab-digit]');""",
    """    if (event.target.closest('[data-tab-fret-toggle]')) {
      tabToggleFretPad();
      tabAtHostEl?.focus({ preventScroll: true });
      return;
    }
    const digit = event.target.closest('[data-tab-digit]');""",
    1,
    'toggle handler',
)

# ---------------------------------------------------------------------------
# 8. Версия
# ---------------------------------------------------------------------------
html = rep(html, '· ver 0.873', '· ver 0.874', 1, 'app version')

with io.open(PATH, 'w', encoding='utf-8') as f:
    f.write(html)

size1 = len(html.encode('utf-8'))
print('OK %d -> %d (%+d)' % (size0, size1, size1 - size0))
