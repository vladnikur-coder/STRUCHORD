#!/usr/bin/env python3
"""B-39, итерация 0.798 (бэклог №25): ползунок «Насыщенность» прямо в шапке
панели клавиш, рядом со стрелками ‹ › навигации (R8: next_nav + live_save + shared).

Ползунок читает/пишет общий track.saturation (тот же, что в диалоге авто),
на input сразу применяется (setSaturation + renderPanel — панель зависит от
насыщенности с 0.797) и сохраняется в дорожку. renderPanel синхронизирует
позицию ползунка при смене дорожки/загрузке; после диалога авто панель
обновляется через HOST.StruChordKeys.render().
"""
import sys

PATH = "STRUCHORD.html"

ANCHORS = [
    # 1. Объявление переменных ползунка.
    (
        "  var btn = null, panel = null, body = null, countEl = null, foot = null, titleEl = null;",
        "  var btn = null, panel = null, body = null, countEl = null, foot = null, titleEl = null;\n  var satInput = null, satVal = null;   // 0.798 (№25)",
    ),
    # 2. CSS ползунка в шапке + прячем в режиме ввода ноты вместе с nav.
    (
        ".b39-keys-panel.is-note-input .b39-keys-nav { display:none; }",
        ".b39-keys-panel.is-note-input .b39-keys-nav, .b39-keys-panel.is-note-input .b39-keys-sat { display:none; }   // 0.798 (№25)",
    ),
    (
        """.b39-keys-count { font-size: .8rem; min-width: 2.3rem; text-align: center;
  color: var(--color-text-secondary, #666); }""",
        """.b39-keys-count { font-size: .8rem; min-width: 2.3rem; text-align: center;
  color: var(--color-text-secondary, #666); }
/* 0.798 (№25): ползунок насыщенности в шапке, рядом с ‹ ›. */
.b39-keys-sat { display: inline-flex; align-items: center; gap: .2rem; }
.b39-keys-sat input[type='range'] { width: 4.5rem; min-height: 1.6rem; accent-color: var(--color-brand, #f08524); }
.b39-keys-sat-val { font-size: .75rem; min-width: 1.6rem; text-align: right; color: var(--color-text-secondary, #666); }""",
    ),
    (
        "  .b39-keys-nav { gap:.15rem; }\n  .b39-keys-count { min-width:1.7rem; }",
        "  .b39-keys-nav { gap:.15rem; }\n  .b39-keys-count { min-width:1.7rem; }\n  .b39-keys-sat input[type='range'] { width: 3.2rem; }   // 0.798 (№25)",
    ),
    # 3. Создание ползунка в шапке после nav (рядом со стрелками ‹ ›).
    (
        "    head.appendChild(identity); head.appendChild(nav); head.appendChild(settingsToggle); head.appendChild(close);",
        """    // 0.798 (№25): ползунок «Насыщенность» в шапке, сразу после ‹ › — live + общий track.saturation с диалогом авто.
    var satWrap = el('span', 'b39-keys-sat');
    satInput = el('input'); satInput.type='range'; satInput.id='b39KeysSaturation'; satInput.min='0'; satInput.max='100'; satInput.step='1'; satInput.value='50';
    satInput.setAttribute('aria-label','Насыщенность'); satInput.title='Насыщенность (0–100): влияет на автоаккомпанемент и на расположение в панели. Общее значение с диалогом автоаккомпанемента.';
    satVal = el('span', 'b39-keys-sat-val', '50');
    satInput.addEventListener('input', function () {
      satVal.textContent = satInput.value;
      var T = tracks(), a = activeTrack();
      if (T && a && a.track && a.track.instrument === 'keys') { T.setSaturation(a.track.id, Number(satInput.value)); renderPanel(); }
    });
    satWrap.appendChild(satInput); satWrap.appendChild(satVal);
    head.appendChild(identity); head.appendChild(nav); head.appendChild(satWrap); head.appendChild(settingsToggle); head.appendChild(close);""",
    ),
    # 4. renderPanel: синхронизация позиции ползунка с track.saturation.
    (
        "    countEl.textContent = noteDraft ? 'Ввод' : exact ? 'Своя' : !chord ? '—' : selected && selected.chord===chord ? (selected.limited ? 'Обычная' : selected.manual ? 'Ручная' : 'Авто') : (idx + 1) + '/' + Math.max(1, variants.length);",
        """    countEl.textContent = noteDraft ? 'Ввод' : exact ? 'Своя' : !chord ? '—' : selected && selected.chord===chord ? (selected.limited ? 'Обычная' : selected.manual ? 'Ручная' : 'Авто') : (idx + 1) + '/' + Math.max(1, variants.length);
    // 0.798 (№25): ползунок насыщенности в шапке синхронизирован с общим track.saturation (не трогаем, пока пользователь тащит).
    if (satInput && active && active.track) { var sv = Number.isInteger(active.track.saturation) ? active.track.saturation : 50; if (Number(satInput.value) !== sv && doc.activeElement !== satInput) { satInput.value = String(sv); satVal.textContent = String(sv); } }""",
    ),
    # 5. Диалог авто после применения обновляет панель (общее значение).
    (
        "        T().setAutoAccomp(next);T().setSaturation(dialogTrack,Number(saturationInput.value));   // 0.795 (№22): голосоведение — галочкой в панели, 13/9 — ползунком",
        "        T().setAutoAccomp(next);T().setSaturation(dialogTrack,Number(saturationInput.value));   // 0.795 (№22): голосоведение — галочкой в панели, 13/9 — ползунком\n        if (HOST.StruChordKeys && typeof HOST.StruChordKeys.render === 'function') HOST.StruChordKeys.render();   // 0.798 (№25): ползунок в шапке панели подхватит общее значение",
    ),
]


def main():
    with open(PATH, "r", encoding="utf-8") as f:
        s = f.read()
    for i, (old, new) in enumerate(ANCHORS, 1):
        n = s.count(old)
        if n != 1:
            print(f"ПАТЧ НЕ ПРИМЕНЁН: якорь {i} найден {n} раз (ожидался 1)")
            sys.exit(1)
        s = s.replace(old, new)
    with open(PATH, "w", encoding="utf-8") as f:
        f.write(s)
    print(f"OK: применено якорей {len(ANCHORS)}")


if __name__ == "__main__":
    main()
