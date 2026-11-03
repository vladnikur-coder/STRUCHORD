#!/usr/bin/env python3
"""B-39: компактная закреплённая панель с приоритетом клавиатуры; 0.724."""
from pathlib import Path
p=Path('STRUCHORD.html');s=p.read_text(encoding='utf-8')
def rep(a,b):
 global s
 n=s.count(a)
 if n!=1:raise SystemExit(f'Патч не применён: {n} совпадений: {a[:100]!r}')
 s=s.replace(a,b,1)
rep('''  box-shadow: var(--shadow-card); padding: .85rem; scroll-margin-top: 8rem; }
.b39-keys-panel[hidden] { display: none; }
.b39-keys-head { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; margin-bottom: .65rem; }
.b39-keys-title { flex: 1 1 auto; font-size: 1rem; font-weight: 700; }
.b39-keys-context { flex-basis: 100%; font-size: .8rem; color: var(--color-text-secondary, #666); }
.b39-keys-close { margin-left: auto; min-width: 2.5rem; min-height: 2.5rem; border-radius: .5rem;
  border: .0625rem solid var(--color-border-medium); background: var(--color-surface); color: inherit; font: inherit; cursor: pointer; }''','''  box-shadow: var(--shadow-card); padding: .5rem .65rem; scroll-margin-top: 8rem; }
.b39-keys-panel[hidden] { display: none; }
.b39-keys-head { display: flex; align-items: center; gap: .3rem; flex-wrap: wrap; margin-bottom: .35rem; }
.b39-keys-identity { display:flex; align-items:baseline; gap:.45rem; flex:1 1 6rem; min-width:0; }
.b39-keys-title { font-size: 1rem; font-weight: 700; flex:0 0 auto; }
.b39-keys-context { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:.75rem; color:var(--color-text-secondary, #666); }
.b39-keys-close, .b39-keys-settings-toggle { flex:0 0 auto; min-width:2.2rem; min-height:2.2rem; border-radius:.5rem;
  border:.0625rem solid var(--color-border-medium); background:var(--color-surface); color:inherit; font:inherit; cursor:pointer; }
.b39-keys-settings-toggle[aria-expanded="true"] { border-color:var(--color-accent); }
.b39-keys-settings[hidden] { display:none; }
.b39-keys-settings { padding-top:.5rem; }''')
rep('''.b39-keys-nav button { min-width: 2.5rem; min-height: 2.5rem; border-radius: .5rem;''','''.b39-keys-nav button { min-width: 2.2rem; min-height: 2.2rem; border-radius: .5rem;''')
rep('''.b39-keys-count { font-size: .8rem; min-width: 3rem; text-align: center;''','''.b39-keys-count { font-size: .8rem; min-width: 2.3rem; text-align: center;''')
rep('''.b39-keys-body svg.b39-keys-svg { display: block; width: 100%; height: auto; max-width: none; }''','''.b39-keys-body svg.b39-keys-svg { display: block; height: auto; max-width: none; }''')
rep('''.b39-keys-foot { margin: .45rem 0 .65rem; font-size: .75rem; line-height: 1.4;''','''.b39-keys-foot { margin: .2rem 0 0; font-size: .7rem; line-height: 1.35;''')
rep("    head.appendChild(titleEl); head.appendChild(close); head.appendChild(contextEl);", """    var identity = el('div', 'b39-keys-identity'); identity.appendChild(titleEl); identity.appendChild(contextEl);
    var settingsToggle = el('button', 'b39-keys-settings-toggle', '⚙'); settingsToggle.type = 'button';
    settingsToggle.id = 'b39KeysSettingsToggle'; settingsToggle.setAttribute('aria-label', 'Настройки клавиатуры');
    settingsToggle.setAttribute('title', 'Настройки клавиатуры'); settingsToggle.setAttribute('aria-expanded', 'false');
    settingsToggle.setAttribute('aria-controls', 'b39KeysSettings');
    head.appendChild(identity); head.appendChild(nav); head.appendChild(settingsToggle); head.appendChild(close);""")
rep("    var position = el('div', 'b39-keys-field b39-keys-position'); position.appendChild(el('span', '', 'Расположение')); position.appendChild(nav); controls.appendChild(position);", "    nav.setAttribute('aria-label', 'Расположение аккорда');")
rep('''    panel.appendChild(head);panel.appendChild(body);panel.appendChild(foot);panel.appendChild(controls);panel.appendChild(linkRow);panel.appendChild(autoChoiceBtn);''','''    var settings = el('div', 'b39-keys-settings'); settings.id = 'b39KeysSettings'; settings.hidden = true;
    settings.appendChild(controls); settings.appendChild(linkRow); settings.appendChild(autoChoiceBtn);
    settingsToggle.addEventListener('click', function () {
      settings.hidden = !settings.hidden; settingsToggle.setAttribute('aria-expanded', String(!settings.hidden));
    });
    panel.appendChild(head);panel.appendChild(body);panel.appendChild(foot);panel.appendChild(settings);''')
rep("    contextEl.textContent = panelContext(active.track, cell);", "    contextEl.textContent = panelContext(active.track, cell); contextEl.title = contextEl.textContent;")
rep("    titleEl.textContent = 'Клавиатура · ' + chord;", "    titleEl.textContent = chord;")
rep("    var svg = body.querySelector('svg'); if (svg) svg.style.minWidth = (res.width / 16) + 'rem';", "    var svg = body.querySelector('svg'); if (svg) svg.style.width = (res.width / 16) + 'rem';")
rep('@media (max-width: 640px) {\n  .b39-keys-controls { grid-template-columns: repeat(2, minmax(0, 1fr)); }\n  .b39-keys-position { grid-column: 1 / -1; }\n}','@media (max-width: 640px) {\n  .b39-keys-controls { grid-template-columns: repeat(2, minmax(0, 1fr)); }\n  .b39-keys-identity { flex: 1 1 0; }\n  .b39-keys-title { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }\n  .b39-keys-context { position:absolute; width:.0625rem; height:.0625rem; overflow:hidden; clip-path:inset(50%); white-space:nowrap; }\n  .b39-keys-nav { gap:.15rem; }\n  .b39-keys-count { min-width:1.7rem; }\n}')
rep("    foot.textContent = 'Размер ' + range.size + ' клавиш (' + range.first + '–' + range.last + ')' +\n      (bass !== null ? ' · бас ' + noteLabel(bass, f ? f.keyStyle : 'sharp') : '') +\n      (showFingersEnabled() ? ' · цифры условны, это не аппликатура' : '') +\n      (body.scrollWidth > body.clientWidth ? ' · клавиатуру можно прокручивать вбок' : '');","    var footParts = [];\n    if (bass !== null) footParts.push('бас ' + noteLabel(bass, f ? f.keyStyle : 'sharp'));\n    if (body.scrollWidth > body.clientWidth) footParts.push('↔ прокрутка клавиш');\n    if (showFingersEnabled()) footParts.push('цифры условны, это не аппликатура');\n    foot.textContent = footParts.join(' · ');")
rep('  var lastChord = null, lastTrackId = null, lastCellKey = null, lastVisibleContext = null, contextEl = null;','  var lastChord = null, lastTrackId = null, lastCellKey = null, lastVisibleContext = null, contextEl = null, settingsContext = null;')
rep('.b39-keys-settings { padding-top:.5rem; }','.b39-keys-settings { padding-top:.5rem; }\n.b39-keys-settings-context { display:none; margin:0 0 .4rem; font-size:.75rem; color:var(--color-text-secondary, #666); overflow-wrap:anywhere; }')
rep('  .b39-keys-identity { flex: 1 1 0; }','  .b39-keys-identity { flex: 1 1 0; }\n  .b39-keys-settings-context { display:block; }')
rep('    settings.appendChild(controls); settings.appendChild(linkRow); settings.appendChild(autoChoiceBtn);',"    settingsContext = el('div', 'b39-keys-settings-context');\n    settings.appendChild(settingsContext); settings.appendChild(controls); settings.appendChild(linkRow); settings.appendChild(autoChoiceBtn);")
rep('    contextEl.textContent = panelContext(active.track, cell); contextEl.title = contextEl.textContent;','    contextEl.textContent = panelContext(active.track, cell); contextEl.title = contextEl.textContent; settingsContext.textContent = contextEl.textContent;')
rep('.b39-keys-controls { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));','.b39-keys-controls { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));')
p.write_text(s,encoding='utf-8');print('Компактная панель клавиатуры применена')
