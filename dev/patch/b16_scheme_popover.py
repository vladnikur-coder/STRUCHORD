#!/usr/bin/env python3
# B-16 (2026-08-26): выбор цветовой схемы длинным нажатием на кнопку темы.
# Решения: поповер у кнопки (мобильный — нижний лист), мышь: лонгпресс +
# правый клик, набор — все 16 схем клоном списка из панели «Тык».
import io, sys
PATH = '/home/user/STRUCHORD.html'
src = io.open(PATH, encoding='utf-8', errors='surrogateescape').read()
orig = src
edits = []

def apply(name, old, new):
    global src
    n = src.count(old)
    if n != 1:
        edits.append((name, False)); return False
    src = src.replace(old, new, 1)
    edits.append((name, True)); return True

# --- A. CSS: стили поповера (после правила тёмных свотчей схем) ---
old_css = """html[data-theme='dark'] .scheme-dots i {
  background: var(--c-d);
}"""
new_css = old_css + """

/* ---- B-16: поповер быстрого выбора схемы (лонгпресс на кнопке темы) ----
   Пункты — те же .scheme-item, что в панели «Тык» (клонируются из
   #schemeList в JS, источник правды один). Слой 2000: выше выпадашек
   (100-1000), ниже модалок (10000). */
.scheme-popover {
  position: fixed;
  z-index: 2000;
  display: none;
  min-width: 210px;
  padding: 4px;
  background: var(--color-surface);
  border: 1px solid var(--color-border-medium);
  border-radius: 12px;
  box-shadow: var(--shadow-modal);
}
.scheme-popover.is-open {
  display: block;
}
.scheme-popover-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: min(340px, 60vh);
  overflow-y: auto;
}
@media (max-width: 640px) {
  /* Нижний лист: до списка под шапкой на телефоне дотягиваться не всем
     удобно; выбор схемы идёт большим пальцем. */
  .scheme-popover {
    top: auto !important;
    left: 8px !important;
    right: 8px;
    bottom: 8px;
    min-width: 0;
  }
  .scheme-popover-list {
    max-height: 46vh;
  }
}"""
apply('A css scheme-popover', old_css, new_css)

# --- B. Разметка поповера перед </body> ---
old_html = """
    </script>
</body>
"""
new_html = """
    </script>
    <!-- B-16: быстрый выбор цветовой схемы. Открывается длинным
         нажатием (500мс) на кнопку темы, на десктопе ещё и правым
         кликом. Пункты клонируются из #schemeList панели «Тык». -->
    <div class="scheme-popover" id="schemePopover" aria-hidden="true">
      <div class="scheme-popover-list" id="schemePopoverList" role="listbox" aria-label="Быстрый выбор цветовой схемы"></div>
    </div>
</body>
"""
apply('B html popover markup', old_html, new_html)

# --- C. JS: жест + поповер (перед секцией анимации режима) ---
old_js = """  markSchemeItem(cur);
}

// ========== АНИМАЦИЯ СМЕНЫ РЕЖИМА =========="""
new_js = """  markSchemeItem(cur);
}

// ========== B-16: БЫСТРЫЙ ВЫБОР СХЕМЫ (ЛОНГПРЕСС НА КНОПКЕ ТЕМЫ) ==========
// Спека (2026-08-26): «выбор цветовой схемы при длинном нажатии на
// кнопку переключения темы». Решения ask_user: компактный поповер у
// кнопки (на мобильном — лист у низа экрана); на десктопе работает И
// лонгпресс мышью, И правый клик; набор — все 16 схем, тот же порядок
// и свотчи, что в «Тык» (пункты клонируются из #schemeList). Тап по
// кнопке по-прежнему переключает светло/темно: click после сработавшего
// лонгпресса глушится в capture-фазе, не долетая до toggleTheme().
const THEME_LONGPRESS_MS = 500;
let _themeLpTimer = null;
let _themeSuppressClick = false;

// Пункты — одноразовый клон списка из панели «Тык»: одинаковые имена,
// порядок и цветные тройки, никакой ручной синхронизации двух списков.
function buildSchemePopoverItems() {
  const src = document.getElementById('schemeList');
  const dst = document.getElementById('schemePopoverList');
  if (!src || !dst || dst.children.length > 0) return;
  src.querySelectorAll('.scheme-item').forEach((el) => {
    const id = el.getAttribute('data-scheme-id') || '';
    const item = el.cloneNode(true);
    item.removeAttribute('onclick');
    item.addEventListener('click', () => {
      applyScheme(id);
      closeSchemePopover();
    });
    dst.appendChild(item);
  });
}
function isSchemePopoverOpen() {
  const p = document.getElementById('schemePopover');
  return !!(p && p.classList.contains('is-open'));
}
function openSchemePopover() {
  buildSchemePopoverItems();
  const p = document.getElementById('schemePopover');
  const btn = document.getElementById('themeToggleBtn');
  if (!p || !btn || p.classList.contains('is-open')) return;
  // Схема могла поменяться из панели «Тык» — сверяем подсветку при
  // каждом открытии, специальной синхронизации между списками нет.
  const cur = document.documentElement.getAttribute('data-scheme') || '';
  p.querySelectorAll('.scheme-item').forEach((el) => {
    el.setAttribute('aria-selected',
      (el.getAttribute('data-scheme-id') || '') === cur ? 'true' : 'false');
  });
  p.classList.add('is-open');
  p.setAttribute('aria-hidden', 'false');
  btn.setAttribute('aria-expanded', 'true');
  // Под кнопкой, правым краем к её правому краю; ширина известна
  // только после показа. На мобильном CSS уводит в нижний лист и эти
  // координаты не играют.
  const r = btn.getBoundingClientRect();
  p.style.top = Math.round(r.bottom + 8) + 'px';
  let left = Math.round(r.right - p.offsetWidth);
  if (left < 8) left = 8;
  p.style.left = left + 'px';
}
function closeSchemePopover() {
  const p = document.getElementById('schemePopover');
  const btn = document.getElementById('themeToggleBtn');
  if (!p) return;
  p.classList.remove('is-open');
  p.setAttribute('aria-hidden', 'true');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}
function initThemeLongPress() {
  const btn = document.getElementById('themeToggleBtn');
  if (!btn) return;
  btn.setAttribute('aria-haspopup', 'listbox');
  let startX = 0;
  let startY = 0;
  const cancelTimer = () => {
    if (_themeLpTimer) {
      window.clearTimeout(_themeLpTimer);
      _themeLpTimer = null;
    }
  };
  btn.addEventListener('pointerdown', (e) => {
    // Правую кнопку отдаёт contextmenu (там открытие), прочие кроме
    // основной игнорируем.
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    startX = e.clientX;
    startY = e.clientY;
    cancelTimer();
    _themeLpTimer = window.setTimeout(() => {
      _themeLpTimer = null;
      _themeSuppressClick = true;
      openSchemePopover();
    }, THEME_LONGPRESS_MS);
  });
  // Сдвиг за порог — это скролл/драг, а не жест: таймер снимаем.
  btn.addEventListener('pointermove', (e) => {
    if (_themeLpTimer &&
        (Math.abs(e.clientX - startX) > 10 || Math.abs(e.clientY - startY) > 10)) {
      cancelTimer();
    }
  });
  btn.addEventListener('pointerup', cancelTimer);
  btn.addEventListener('pointercancel', cancelTimer);
  btn.addEventListener('pointerleave', cancelTimer);
  // Click после лонгпресса НЕ должен щёлкнуть тему. Capture-фаза идёт
  // раньше inline-onclick toggleTheme(). Обычный тап флага не несёт и
  // работает как раньше; открытый поповер при этом закрываем.
  btn.addEventListener('click', (e) => {
    if (_themeSuppressClick) {
      _themeSuppressClick = false;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return;
    }
    if (isSchemePopoverOpen()) closeSchemePopover();
  }, true);
  // Десктопный правый клик открывает тот же список; системное меню на
  // кнопке не нужно ни на какой платформе — глушим всегда.
  btn.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    openSchemePopover();
  });
  // Клик мимо поповера — закрыть; кнопку-якорь исключаем (её путь выше).
  document.addEventListener('pointerdown', (e) => {
    if (!isSchemePopoverOpen()) return;
    const p = document.getElementById('schemePopover');
    if (p && p.contains(e.target)) return;
    if (e.target && e.target.closest && e.target.closest('#themeToggleBtn')) return;
    closeSchemePopover();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isSchemePopoverOpen()) closeSchemePopover();
  });
  // Поповер привязан к кнопке абсолютными координатами: после ресайза
  // висел бы в старом месте — дешевле закрыть, чем пересчитывать.
  window.addEventListener('resize', () => {
    if (isSchemePopoverOpen()) closeSchemePopover();
  });
}

// ========== АНИМАЦИЯ СМЕНЫ РЕЖИМА =========="""
apply('C js longpress + popover', old_js, new_js)

# --- D. Вызов init ---
old_init = """initTheme();
initScheme();"""
new_init = """initTheme();
initScheme();
initThemeLongPress();"""
apply('D init call', old_init, new_init)

failed = [name for name, ok in edits if not ok]
if failed:
    print('ABORTED, no changes written:'); [print('  MISSING:', f) for f in failed]; sys.exit(1)
if src != orig:
    io.open(PATH, 'w', encoding='utf-8', errors='surrogateescape').write(src)
    print('PATCHED')
else:
    print('PATCHED (no byte changes)')
for name, ok in edits: print(('  OK   ' if ok else '  FAIL ') + name)
