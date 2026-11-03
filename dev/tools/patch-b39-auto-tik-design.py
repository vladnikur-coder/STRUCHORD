#!/usr/bin/env python3
"""B-39: компактный автоплан и настройки в стиле «Тык», на основе 0.745."""
from pathlib import Path
p=Path('STRUCHORD.html');s=p.read_text(encoding='utf-8')
def rep(a,b):
 global s
 n=s.count(a)
 if n!=1:raise SystemExit(f'Expected one match, got {n}: {a[:100]}')
 s=s.replace(a,b,1)
rep(".b39-keys-settings .b39-keys-link { display:flex; align-items:flex-start; gap:.45rem; line-height:1.4; }", ".b39-keys-settings .b39-keys-link { align-items:center; margin:.15rem 0; padding:.25rem .5rem; line-height:1.3; }\n.b39-keys-settings .b39-keys-field { padding:.25rem .5rem; }\n.b39-keys-settings .b39-keys-field select { width:auto; font-size:.8125rem; }\n.b39-keys-settings .scheme-item { width:auto; min-height:0; font-size:.8125rem; }")
rep("var item = el('label', 'b39-keys-field');", "var item = el('label', 'tools-label b39-keys-field');")
rep("var linkRow=el('label','b39-keys-link');", "var linkRow=el('label','tools-label b39-keys-link');")
rep("autoChoiceBtn=el('button','b39-keys-reset b39-acc-action','Сбросить выбор позиции');", "autoChoiceBtn=el('button','b39-keys-reset scheme-item','Сбросить выбор позиции');")
rep("var autoOpen=el('button','b39-acc-action','Автоаккомпанемент');", "var autoOpen=el('button','scheme-item','Автоаккомпанемент');")
rep("    panel.setAttribute('aria-labelledby', 'b39AccTitle');", "    panel.setAttribute('aria-label', 'Редактор аккомпанемента');")
rep("    var top = el('div', 'b39-acc-editor-top');\n    var title = el('h3', '', 'Аккомпанемент'); title.id = 'b39AccTitle';\n    scopeLabel = el('span', 'b39-acc-scope'); top.appendChild(title); top.appendChild(scopeLabel); panel.appendChild(top);", "    scopeLabel = el('span', 'b39-acc-scope'); panel.appendChild(scopeLabel);")
rep("    if (scopeLabel) scopeLabel.textContent = current.scope === 'cell' ? 'только для этой ячейки' : 'по умолчанию для всей секции';", "    if (scopeLabel) { scopeLabel.hidden = current.scope !== 'cell'; scopeLabel.textContent = current.scope === 'cell' ? 'только для этой ячейки' : ''; }")
rep("    '.b39-auto-panel { max-height:calc(100vh - 2rem); max-height:calc(100dvh - 2rem); overflow-y:auto; overscroll-behavior:contain; }',", "    '.b39-auto-panel { max-height:calc(100vh - 2rem); max-height:calc(100dvh - 2rem); overflow-y:auto; overscroll-behavior:contain; gap:.25rem; border-radius:.875rem; padding:.75rem 1rem; background:var(--color-surface); box-shadow:0 .5rem 1.5rem rgba(0,0,0,.12); }',\n    '.b39-auto-panel h3 { font-size:1rem; color:var(--color-text-primary); }',\n    '.b39-auto-panel .b39-auto-select { padding:.5rem .75rem; border-radius:.5rem; font-size:.8125rem; font-weight:500; color:var(--color-text-secondary); }',\n    '.b39-auto-panel .b39-auto-select select { margin-left:auto; font-size:.8125rem; }',\n    '.b39-auto-panel .b39-auto-select.tools-label { flex-wrap:nowrap; }',\n    '.b39-auto-panel .b39-auto-note { padding:0 .75rem; line-height:1.35; }',\n    '.b39-auto-panel .b39-acc-actions { border-top:.0625rem solid var(--color-border-light); padding-top:.5rem; }',")
rep("    '.b39-auto-section { display:flex; flex-direction:row; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:.5rem; padding:.55rem .7rem; border:.0625rem solid var(--color-border-medium); border-radius:.75rem; background:var(--color-background-secondary); }',\n    '.b39-auto-section .b39-auto-row { flex:1 1 15rem; }',\n    '.b39-auto-section .b39-acc-genre { font-size:.75rem; }',", "    '.b39-auto-section { display:block; }',")
rep("    '.b39-auto-list { display:flex; flex-direction:column; gap:.45rem; max-height:14rem; overflow:auto; }',", "    '.b39-auto-list { display:flex; flex-direction:column; gap:.125rem; max-height:14rem; overflow:auto; border-top:.0625rem solid var(--color-border-light); padding-top:.5rem; }',")
rep("    '.b39-auto-row { display:flex; align-items:flex-start; gap:.45rem; font-size:.75rem; line-height:1.35; }',", "    '.b39-auto-row { align-items:flex-start; line-height:1.35; }',")
rep("    if(!planBox)return;var prior={};Array.from(planBox.querySelectorAll('[data-bass-sec]')).forEach(function(n){prior[n.dataset.bassSec]=n.value;});var checks={};", "    if(!planBox)return;var checks={};")
rep("var row=element('label','b39-auto-row'), cb=element('input');", "var row=element('label','tools-label b39-auto-row'), cb=element('input');")
rep("var card=element('div','pattern-presets b39-auto-section');", "var card=element('div','b39-auto-section');")
start="      var bass=element('select','b39-acc-genre');bass.dataset.bassSec=String(sec.id);bass.setAttribute('aria-label','Бас: '+sectionName(sec));\n"
end="      var saved=T().bassRole(dialogTrack,sec.id);bass.value=prior[String(sec.id)] || (saved!=='legacy'?saved:raw?'legacy':'auto');card.appendChild(bass);\n"
i=s.index(start);j=s.index(end,i)+len(end);s=s[:i]+s[j:]
rep("Проверьте рисунки и подсказки баса. Без баса басовые шаги станут паузами. Ручные рисунки защищены; настройки ячеек сохраняются.", "Проверьте план. При применении бас выбранных секций станет автоматическим по их типу; ручные рисунки защищены, настройки ячеек сохраняются.")
rep("var linkRow=element('label','b39-auto-select'), link=element('input');", "var linkRow=element('label','tools-label b39-auto-select'), link=element('input');")
rep("      var bassChoices={};Array.from(planBox.querySelectorAll('[data-bass-sec]')).forEach(function(n){bassChoices[n.dataset.bassSec]=n.value;});\n", "")
rep("      var next={primary:primary.value,secondary:secondary.value||null,trackId:dialogTrack,managed:managed};\n      if(selected.some(function(sec){return bassChoices[String(sec.id)]==='auto';}))next.autoBass=true;", "      var next={primary:primary.value,secondary:secondary.value||null,trackId:dialogTrack,managed:managed,autoBass:true};")
rep("T().setBassRole(dialogTrack,sec.id,bassChoices[String(sec.id)]);", "T().setBassRole(dialogTrack,sec.id,'auto');")
p.write_text(s,encoding='utf-8');print('B-39: авто и настройки в стиле Тык')
