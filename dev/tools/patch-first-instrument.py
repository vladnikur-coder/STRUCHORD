#!/usr/bin/env python3
"""B-39: выбор инструмента по умолчанию. Строгие якоря для 0.704."""
from pathlib import Path
p = Path('STRUCHORD.html')
s = p.read_text(encoding='utf-8')
def replace(a,b):
 global s
 n=s.count(a)
 if n != 1: raise SystemExit(f'Патч не применён: якорь встречается {n} раз: {a[:100]!r}')
 s=s.replace(a,b,1)
replace("    if (!rawTracks.length) return [];", "    if (!rawTracks.length) return [b39MakeTrack(1, 'guitar', 'Гитара')];")
replace("    return out;\n  }\n\n  // ---------- attach: вызывается из sanitizeSongData", "    return out.length ? out : [b39MakeTrack(1, 'guitar', 'Гитара')];\n  }\n\n  // ---------- attach: вызывается из sanitizeSongData")
replace("  // Новая песня: явное пустое состояние (вызывается из clearAll).\n  function resetToEmpty()", """  // Новый документ получает выбранную в этом браузере первую дорожку.
  function resetForNewSong() {
    var instrument = 'guitar';
    try { if ((HOST.getDefaultInstrument && HOST.getDefaultInstrument()) === 'keys') instrument = 'keys'; } catch (e) {}
    return dispatch('b39/tracks-reset-new', function () {
      state.tracks = [b39MakeTrack(1, instrument, instrument === 'keys' ? 'Клавиши' : 'Гитара')];
      state.activeTrackId = 1;
      state.nextTrackId = 2;
      state.keyboardSize = B39_DEFAULT_KEYBOARD;
      return true;
    });
  }
  function resetToEmpty()""")
replace("    resetToEmpty: resetToEmpty,", "    resetToEmpty: resetToEmpty, resetForNewSong: resetForNewSong,")
replace("    if (!st.isEmpty && st.isDefault && !hasAnyChord()) t.resetToEmpty();\n", "")
replace("    var showEmpty = st.isEmpty || (st.isDefault && !hasAnyChord());", "    var showEmpty = st.isEmpty;")
replace("""  // Новая песня: сбрасываем дорожки в пустое состояние.
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

""", "")
replace("  // clearAll определяется позже по файлу — оборачиваем после полной загрузки.\n  if (typeof HOST.setTimeout === 'function') HOST.setTimeout(wrapClearAll, 0);", "")
replace("    songStore.dispatch('song/clear', () => {\n    sections = [];", "    songStore.dispatch('song/clear', () => {\n    if (window.StruChordTracks) window.StruChordTracks.resetForNewSong();\n    sections = [];")
# Appearance: vector artwork local and theme-aware, no font glyph dependency.
replace(".home-settings-sections { display: grid;", """.instrument-choice-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.65rem; }
.instrument-choice { display:flex; align-items:center; gap:.7rem; min-width:0; min-height:5rem; padding:.8rem; border:1px solid var(--color-border-light); border-radius:1rem; background:var(--color-background-secondary); color:var(--color-text-primary); font:inherit; text-align:left; cursor:pointer; }
.instrument-choice:not(:disabled):hover, .instrument-choice[aria-pressed='true'] { border-color:var(--color-accent); background:var(--color-surface); }
.instrument-choice:focus-visible { outline:2px solid var(--color-accent); outline-offset:2px; }
.instrument-choice:disabled { opacity:.5; cursor:not-allowed; }
.instrument-choice svg { flex:none; width:1.5rem; height:1.5rem; stroke:currentColor; fill:none; stroke-width:1.7; stroke-linecap:round; stroke-linejoin:round; }
.instrument-choice span { display:grid; gap:.2rem; min-width:0; }
.instrument-choice strong { font-size:.8rem; }
.first-instrument-modal .home-modal-actions:empty { display:none; }
.instrument-choice small { color:var(--color-text-secondary); font-size:.65rem; }
@media (max-width: 380px) { .instrument-choice-grid { grid-template-columns:1fr; } }
.home-settings-sections { display: grid;""")
# UI helpers in the home-screen scope.
replace("  window.openHomeSettings = function () {", """  const DEFAULT_INSTRUMENT_KEY = 'struchord-default-instrument';
  let sessionInstrument = null;
  function defaultInstrument() {
    try { const value = localStorage.getItem(DEFAULT_INSTRUMENT_KEY); if (value === 'guitar' || value === 'keys') return value; } catch (e) {}
    return sessionInstrument;
  }
  window.getDefaultInstrument = defaultInstrument;
  function saveDefaultInstrument(value) {
    sessionInstrument = value;
    try { localStorage.setItem(DEFAULT_INSTRUMENT_KEY, value); } catch (e) {}
  }
  function instrumentChoices(onSelect) {
    const grid = document.createElement('div');
    grid.className = 'instrument-choice-grid';
    const items = [
      ['guitar', 'Гитара', '<path d="M17 3l4-1 1 1-1 4-3 2-3-3zM16 7l-5 5M10 11c-2-1-4 0-4 2-1 1-4 1-4 4 0 3 3 5 6 5 3 0 3-3 4-4 2 0 3-2 2-4z"/><circle cx="9" cy="15" r="1"/>'],
      ['keys', 'Клавиши', '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 4v10M12 4v10M17 4v10M7 14v6M12 14v6M17 14v6M5 4v6M10 4v6M15 4v6M20 4v6"/>'],
      ['ukulele', 'Укулеле', '<path d="M17 3l4-1 1 1-1 4-3 2-3-3zM16 7l-5 5M10 11c-2-1-4 0-4 2-1 1-4 1-4 4 0 3 3 5 6 5 3 0 3-3 4-4 2 0 3-2 2-4z"/><circle cx="9" cy="15" r="1"/>'],
      ['bass', 'Бас', '<path d="M18 2l3 1 1 2-4 3-2-2zM17 7l-6 6M10 12c-2-1-4 0-4 2-2 1-4 2-4 4 0 3 3 4 6 4 3 0 4-2 4-4 2-1 3-3 1-5z"/>']
    ];
    items.forEach(([id, label, art]) => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'instrument-choice'; button.dataset.instrument = id;
      button.disabled = id === 'ukulele' || id === 'bass';
      button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + art + '</svg><span><strong>' + label + '</strong><small>' + (button.disabled ? 'Пока недоступно' : 'Для новых песен') + '</small></span>';
      if (!button.disabled) {
        button.setAttribute('aria-pressed', String(defaultInstrument() === id));
        button.addEventListener('click', () => { saveDefaultInstrument(id); onSelect(id, grid); });
      }
      grid.appendChild(button);
    });
    return grid;
  }
  function showFirstInstrumentChoice() {
    if (defaultInstrument()) return;
    const dialog = createHomeModal('На чём вы играете?', 'Выберите инструмент для новых песен. Позже его можно изменить в настройках.', 'first-instrument-modal');
    dialog.modal.querySelector('.home-modal-close').remove();
    // createHomeModal закрывает по фону и Escape; обязательный выбор требует
    // собственного захвата фокуса без обработчика отмены.
    const replacement = dialog.overlay.cloneNode(true);
    dialog.overlay.replaceWith(replacement);
    const modal = replacement.querySelector('.home-screen-modal');
    const content = replacement.querySelector('.home-modal-content');
    const grid = instrumentChoices(() => { removeModalOverlay(replacement); });
    content.appendChild(grid);
    replacement._releaseFocusTrap = trapFocus(modal, () => {});
    grid.querySelector('button:not(:disabled)').focus();
  }

  window.openHomeSettings = function () {""")
replace("    instrumentPanel.append(instrumentOptionsSection, readableNamesSection);", """    const defaultSection = document.createElement('section');
    defaultSection.className = 'home-settings-section';
    const defaultHeading = document.createElement('h3');
    defaultHeading.textContent = 'Инструмент новых песен';
    defaultSection.append(defaultHeading, instrumentChoices((id, grid) => {
      grid.querySelectorAll('button:not(:disabled)').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.instrument === id)));
    }));
    instrumentPanel.append(defaultSection, instrumentOptionsSection, readableNamesSection);""")
replace("    instrumentTab.textContent = 'Режим гитары и укулеле';", "    instrumentTab.textContent = 'Инструменты';")
replace("    syncHomeSettingsControls();\n  }\n\n  // Браузеры игнорируют", "    syncHomeSettingsControls();\n    showFirstInstrumentChoice();\n  }\n\n  // Браузеры игнорируют")
p.write_text(s, encoding='utf-8')
print('Патч применён')
