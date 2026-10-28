#!/usr/bin/env python3
"""B-39: безопасное удаление дорожек в микшере; якоря версии 0.706."""
from pathlib import Path
p = Path('STRUCHORD.html')
s = p.read_text(encoding='utf-8')
def rep(a, b):
 global s
 n = s.count(a)
 if n != 1: raise SystemExit('Патч не применён: якорь встречается %d раз: %r' % (n, a[:100]))
 s = s.replace(a, b, 1)
rep(".b39-choice:hover, .b39-choice[aria-pressed=\"true\"] { border-color: var(--color-accent, #2f855a); }", """.b39-choice:hover, .b39-choice[aria-pressed=\"true\"] { border-color: var(--color-accent, #2f855a); }
.b39-delete { display:block; width:100%; margin-top:.6rem; text-align:left;
  color:var(--color-danger, #b42318); }
.b39-delete:disabled { opacity:.55; cursor:not-allowed; }
.b39-delete:focus-visible { outline:2px solid var(--color-accent); outline-offset:2px; }
.b39-delete-hint { font-size:.72rem; line-height:1.4; color:var(--color-text-secondary, #666); margin:.4rem 0 0; }
.b39-delete-hint[hidden] { display:none; }""")
rep("    menu.appendChild(menuChoices);\n\n    var foot =", """    menu.appendChild(menuChoices);
    var removeButton = el('button', 'b39-choice b39-delete', 'Удалить дорожку');
    removeButton.type = 'button';
    removeButton.id = 'b39DeleteTrack';
    removeButton.setAttribute('aria-describedby', 'b39DeleteHint');
    var removeHint = el('p', 'b39-delete-hint');
    removeHint.id = 'b39DeleteHint';
    removeHint.hidden = true;
    removeButton.addEventListener('click', function () {
      var t = T();
      if (!t || menuTrackId === null) return;
      var id = menuTrackId, st = t.state(), track = t.track(id);
      if (!track || st.tracks.length <= 1 || id === st.mainTrackId) { render(); return; }
      if (!HOST.confirm('Удалить дорожку «' + track.name + '»? Её аккорды и настройки будут удалены.')) return;
      // Не смешивать удаление с предшествующей отложенной правкой в истории.
      if (typeof HOST.captureHistorySnapshot === 'function') HOST.captureHistorySnapshot();
      if (t.removeTrack(id)) {
        if (typeof HOST.captureHistorySnapshot === 'function') HOST.captureHistorySnapshot();
        menu.hidden = true; menuTrackId = null; render();
      }
    });
    menu.appendChild(removeButton);
    menu.appendChild(removeHint);

    var foot =""")
rep("""      'Главная — верхняя строка. Перетащите строку, чтобы сменить главную. ' +
      'Пока звучит один голос (главная дорожка); отдельные голоса появятся в следующей части.');""", """      'Главная — верхняя строка. Перетащите строку, чтобы сменить главную.');""")
rep("""    var showEmpty = st.isEmpty;
    var emptyEl""", """    var showEmpty = st.isEmpty;
    var removeButton = doc.getElementById('b39DeleteTrack');
    var removeHint = doc.getElementById('b39DeleteHint');
    if (removeButton && removeHint && menuTrackId !== null) {
      var selected = st.tracks.find(function (track) { return track.id === menuTrackId; });
      if (!selected) { menu.hidden = true; menuTrackId = null; }
      var reason = !selected ? '' : st.tracks.length <= 1
        ? 'В песне должна остаться хотя бы одна дорожка.'
        : selected.id === st.mainTrackId
          ? 'Главную дорожку нельзя удалить. Сначала перетащите другую дорожку наверх.'
          : '';
      removeButton.disabled = !selected || !!reason;
      removeHint.textContent = reason;
      removeHint.hidden = !reason;
    }
    var emptyEl""")
p.write_text(s,encoding='utf-8')
print('Патч применён')
