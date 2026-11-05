#!/usr/bin/env python3
"""B-39, этап 3 итерации 0.795 (бэклог №22): чистка UI настроек автоаккомпанемента.

Убираются из интерфейса: тоггл «Плотно|Широко» (#b39KeysDensity), кнопка
«Сбросить выбор позиции» (#b39LinkedReset), ряд «Плавные обращения для всей
dорожки» (#b39AutoLinked), чекбокс «Выделять 13/9 в конце такта» (#b39AutoEndAccent),
чекбокс «Держаться выбранной формы аккорда» (#b39AutoFollowShape).
Остаются: стрелки обращений, галочка голосоведения (#b39LinkedVoicings в панели),
ползунок «Насыщенность» (#b39AutoSaturation), жанр, swing.
Данные старых песен (endAccent/followShape/linkedVoicings) не мигрируются и
продолжают читаться кодом — UI их больше не показывает. R8 final=yes 2026-11-05.
"""
import sys

PATH = "STRUCHORD.html"

ANCHORS = [
    # 1. CSS тоггла плотности.
    (
        """.b39-keys-density { display: none; margin-left: .35rem; }
.b39-keys-panel.has-wide .b39-keys-density { display: inline-flex; }
.b39-density-btn { min-height: 1.6rem; padding: 0 .45rem; font-size: .72rem; cursor: pointer;
  border: .0625rem solid var(--color-border-medium, #c9cdd4); background: var(--color-surface, #fff); color: inherit; }
.b39-density-btn:first-child { border-radius: .5rem 0 0 .5rem; }
.b39-density-btn:last-child { border-radius: 0 .5rem .5rem 0; border-left: none; }
.b39-density-btn[aria-pressed="true"] { background: var(--color-accent, #2c3e66); border-color: var(--color-accent, #2c3e66); color: #fff; }
""",
        "",
    ),
    # 2. var-объявления toggl и кнопки сброса.
    (
        "  var densityEl = null, densityTight = null, densityWide = null;\n",
        "",
    ),
    (
        "  var linkedCache = new Map(), linkedToggle = null, autoChoiceBtn = null;",
        "  var linkedCache = new Map(), linkedToggle = null;",
    ),
    # 3. Создание тоггла в nav панели.
    (
        """    // 0.792: toggl «Плотно | Широко» рядом со стрелками обращений.
    densityEl = el('span', 'b39-keys-density'); densityEl.id = 'b39KeysDensity';
    densityEl.setAttribute('role', 'group'); densityEl.setAttribute('aria-label', 'Расположение правой руки: плотно или широко. Бас не меняется');
    densityTight = el('button', 'b39-density-btn', 'Плотно'); densityTight.type = 'button';
    densityTight.setAttribute('aria-pressed', 'true'); densityTight.title = 'Ноты правой руки плотно (в пределах потолка размаха генератора 15 полутонов — не норма руки)';
    densityWide = el('button', 'b39-density-btn', 'Широко'); densityWide.type = 'button';
    densityWide.setAttribute('aria-pressed', 'false'); densityWide.title = 'Раздвинуть расположение правой руки без добавления нот (на клавиатурах от 61 клавиши), если размах руки остаётся в пределах 15 полутонов; иначе широкого варианта нет';
    densityTight.addEventListener('click', function () { if (densityWide.getAttribute('aria-pressed') === 'true') toggleDensity(); });
    densityWide.addEventListener('click', function () { if (densityWide.getAttribute('aria-pressed') !== 'true') toggleDensity(); });
    densityEl.appendChild(densityTight); densityEl.appendChild(densityWide);
    nav.appendChild(densityEl);
""",
        "    // 0.795 (№22): toggl «Плотно|Широко» убран — насыщенность управляется ползунком в автоаккомпанементе.\n",
    ),
    # 4. Кнопка «Сбросить выбор позиции» и её добавление в настройки.
    (
        """    autoChoiceBtn=el('button','b39-keys-reset scheme-item','Сбросить выбор позиции');autoChoiceBtn.type='button';autoChoiceBtn.id='b39LinkedReset';autoChoiceBtn.title='Вернуть авто для этого аккорда и текущей ячейки';
    autoChoiceBtn.addEventListener('click',function(){var T=tracks(),a=activeTrack();if(!T || !a || !lastChord)return;if(!HOST.confirm('Сбросить ручную позицию этого аккорда на всей дорожке и в текущей ячейке?'))return;variantState.delete(a.track.id+'|'+lastChord);T.clearVoicingChoice(a.track.id,lastChord,lastCellKey);renderPanel();});
""",
        "",
    ),
    (
        "    settingsActions.appendChild(autoOpen); settingsActions.appendChild(autoChoiceBtn);",
        "    settingsActions.appendChild(autoOpen);   // 0.795 (№22): «Сбросить выбор позиции» убрана",
    ),
    (
        "    if(autoChoiceBtn)autoChoiceBtn.hidden=!active.track.linkedVoicings;\n",
        "",
    ),
    # 5. Функция toggleDensity и её экспорт.
    (
        """  // Тоггл «Плотно | Широко»: октавное удвоение верхней ноты правой руки.
  function toggleDensity() {
    var T = tracks(); if (!T || !lastChord || noteDraft) return;
    var active = activeTrack(); if (!active || !active.track) return;
    var range = T.keyRange(active.track.id);
    if (T.exactNotes(active.track.id, lastCellKey, lastChord)) return;
    var cur = currentVariantSlot(active.track.id, lastChord, lastCellKey, range);
    var target = cur.wide ? cur.slot.base : (cur.slot.wide >= 0 ? cur.slot.wide : cur.slot.base);
    if (target === cur.idx) return;
    setVariantIndex(active.track.id, lastChord, lastCellKey, target, cur.st.list.length);
    renderPanel();
  }
""",
        "",
    ),
    (
        "    toggleDensity: toggleDensity,\n",
        "",
    ),
    # 6. Обновление toggl/has-wide в renderPanel.
    (
        "      panel.classList.remove('has-wide');\n      return;",
        "      return;",
    ),
    (
        """    // 0.792: toggl «Плотно|Широко» и номер обращения в счётчике.
    if (densityEl) {
      if (chord && !noteDraft) {
        var st2 = voicingVariantStructure(chord, panelKey(), range);
        var hasWide = st2.slots.some(function (s) { return s.wide >= 0; });
        panel.classList.toggle('has-wide', hasWide);
        var cur2 = currentVariantSlot(active.track.id, chord, lastCellKey, range);
        densityTight.setAttribute('aria-pressed', String(!cur2.wide));
        densityWide.setAttribute('aria-pressed', String(cur2.wide));
        if (!exact && !(selected && selected.chord === chord && !selected.manual && !selected.limited)) {
          var mode = selected && selected.chord === chord ? (selected.manual ? 'Ручная' : 'Авто') : 'Вариант';
          countEl.textContent = 'Правая рука: ' + (cur2.inv + 1) + '/' + st2.slots.length + (cur2.wide ? ' · широко' : hasWide ? ' · плотно' : ' · плотно, широкого нет');
        }
      } else panel.classList.remove('has-wide');
    }
""",
        "",
    ),
    # 7. Ряды диалога авто: «Плавные обращения», «13/9», «Держаться формы».
    (
        """    var linkRow=element('label','tools-label b39-auto-select'), link=element('input');link.type='checkbox';link.id='b39AutoLinked';link.checked=track.linkedVoicings===true;
    linkRow.appendChild(link);linkRow.appendChild(element('span','','Плавные обращения для всей дорожки (ручные позиции сохраняются)'));box.appendChild(linkRow);
""",
        "    // 0.795 (№22): отдельной галочки «Плавные обращения» нет — ею управляет галочка голосоведения в панели клавиш.\n",
    ),
    (
        """    var accRow=element('label','tools-label b39-auto-select'), acc=element('input');acc.type='checkbox';acc.id='b39AutoEndAccent';acc.checked=track.endAccent!==false;
    accRow.appendChild(acc);accRow.appendChild(element('span','','Выделять 13/9 в конце такта'));
    accRow.title='Добавлять сверху 13-ю, иначе 9-ю ступень, если она есть в обозначении аккорда, на последней блоковой атаке такта. Может менять верхнюю линию и увеличивать размах. Выключение не удаляет 9/13 из самого аккорда — отключает только дополнительное выделение. В нотной автопартии (отдельные ноты) не применяется: там верхняя линия — сама сгенерированная партия.';
    box.appendChild(accRow);
""",
        "    // 0.795 (№22): чекбокса «13/9 в конце такта» нет — акцент управляется ползунком насыщенности (>=80).\n",
    ),
    (
        """    var shapeRow=element('label','tools-label b39-auto-select'), shape=element('input');shape.type='checkbox';shape.id='b39AutoFollowShape';shape.checked=!!(cfg && cfg.trackId===dialogTrack && cfg.shapeAware && cfg.followShape);
    shapeRow.appendChild(shape);shapeRow.appendChild(element('span','','Держаться выбранной формы аккорда'));box.appendChild(shapeRow);
""",
        "    // 0.795 (№22): чекбокса «Держаться выбранной формы» нет — при наличии ползунка насыщенности не нужен.\n",
    ),
    # 8. Применение: без followShape/linked/endAccent, только ползунок насыщенности.
    (
        "shapeAware:true,followShape:shape.checked};",
        "shapeAware:true};   // 0.795 (№22): followShape больше не выставляется из UI",
    ),
    (
        "shape.checked ? 'Не удалось сыграть выбранную форму: проверьте размах, диапазон и переходы между аккордами' : 'Не удалось создать партию: проверьте аккорды, размер и диапазон'",
        "'Не удалось создать партию: проверьте аккорды, размер и диапазон'",
    ),
    (
        "        T().setAutoAccomp(next);T().setLinkedVoicings(dialogTrack,link.checked);T().setEndAccent(dialogTrack,acc.checked);T().setSaturation(dialogTrack,Number(saturationInput.value));   // 0.795 (№22)",
        "        T().setAutoAccomp(next);T().setSaturation(dialogTrack,Number(saturationInput.value));   // 0.795 (№22): голосоведение — галочкой в панели, 13/9 — ползунком",
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
