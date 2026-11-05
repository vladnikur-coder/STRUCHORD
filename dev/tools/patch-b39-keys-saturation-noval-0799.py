#!/usr/bin/env python3
"""B-39, итерация 0.799: у ползунка насыщенности в шапке панели убрано числовое
значение рядом (владелец: «число рядом с ползунком не нужно»). Остаётся только
range #b39KeysSaturation; поведение (live + общий track.saturation) не меняется.
"""
import sys

PATH = "STRUCHORD.html"

ANCHORS = [
    # 1. Объявление: без satVal.
    (
        "  var satInput = null, satVal = null;   // 0.798 (№25)",
        "  var satInput = null;   // 0.798 (№25), 0.799: значение-цифра убрано",
    ),
    # 2. CSS: без .b39-keys-sat-val.
    (
        """.b39-keys-sat input[type='range'] { width: 4.5rem; min-height: 1.6rem; accent-color: var(--color-brand, #f08524); }
.b39-keys-sat-val { font-size: .75rem; min-width: 1.6rem; text-align: right; color: var(--color-text-secondary, #666); }""",
        ".b39-keys-sat input[type='range'] { width: 4.5rem; min-height: 1.6rem; accent-color: var(--color-brand, #f08524); }   // 0.799: подписи-значения нет",
    ),
    # 3. Создание: без satVal.
    (
        """    satVal = el('span', 'b39-keys-sat-val', '50');
    satInput.addEventListener('input', function () {
      satVal.textContent = satInput.value;
      var T = tracks(), a = activeTrack();
      if (T && a && a.track && a.track.instrument === 'keys') { T.setSaturation(a.track.id, Number(satInput.value)); renderPanel(); }
    });
    satWrap.appendChild(satInput); satWrap.appendChild(satVal);""",
        """    satInput.addEventListener('input', function () {   // 0.799: без обновления цифры рядом
      var T = tracks(), a = activeTrack();
      if (T && a && a.track && a.track.instrument === 'keys') { T.setSaturation(a.track.id, Number(satInput.value)); renderPanel(); }
    });
    satWrap.appendChild(satInput);""",
    ),
    # 4. renderPanel: синхронизация без satVal.
    (
        "if (Number(satInput.value) !== sv && doc.activeElement !== satInput) { satInput.value = String(sv); satVal.textContent = String(sv); }",
        "if (Number(satInput.value) !== sv && doc.activeElement !== satInput) { satInput.value = String(sv); }   // 0.799",
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
