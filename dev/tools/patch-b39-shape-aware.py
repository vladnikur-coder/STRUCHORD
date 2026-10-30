#!/usr/bin/env python3
"""Patch 0.763 note modules and add shape policy; do not apply twice."""
from pathlib import Path
import sys
p=Path(sys.argv[1]);s=p.read_text();root=Path(__file__).resolve().parents[1]/'prototypes'
def module(name,req):
 return '(function(){let module={exports:{}},require='+req+';\n'+(root/name).read_text()+'\nreturn module.exports;})()'
hand=module('keyboard-hand-voicings.js','function(){throw Error("unexpected require")}')
perf=module('keyboard-performance.js','function(){return hand}')
section=module('keyboard-section-adapter.js','function(){return perf}')
bridge=module('keyboard-runtime-bridge.js','function(){return section}')
draft=module('keyboard-note-draft.js','function(){throw Error("unexpected require")}')
renderer=module('keyboard-note-render.js','function(){return draft}')
bundle='(function(){const hand='+hand+',perf='+perf+',section='+section+',bridge='+bridge+',draft='+draft+',renderer='+renderer+';window.__keyModules={bridge,draft,renderer};})();\n'+(root/'keyboard-live-candidate.js').read_text()+'\n'+(root/'keyboard-note-editor-candidate.js').read_text()+'\n\n'
start=s.index('(function(){const hand=(function(){let module={exports:{}},require=function(){throw Error("unexpected require")};')
end=s.index('// B-39: выбор жанров и предварительный план автоаккомпанемента.',start)
s=s[:start]+bundle+s[end:]
def replace(a,b):
 global s
 if s.count(a)!=1:raise SystemExit('Expected exactly one match: '+a[:90])
 s=s.replace(a,b,1)
replace("...(raw.engine==='notes-v1'?{engine:'notes-v1'}:{})};", "...(raw.engine==='notes-v1'?{engine:'notes-v1'}:{}),...(raw.shapeAware===true?{shapeAware:true,followShape:raw.followShape===true}:{})};")
replace("    swingRow.appendChild(swing);swingRow.appendChild(element('span','','Swing'));box.appendChild(swingRow);", """    swingRow.appendChild(swing);swingRow.appendChild(element('span','','Swing'));box.appendChild(swingRow);
    var shapeRow=element('label','tools-label b39-auto-select'), shape=element('input');shape.type='checkbox';shape.id='b39AutoFollowShape';shape.checked=!!(cfg && cfg.trackId===dialogTrack && cfg.shapeAware && cfg.followShape);
    shapeRow.appendChild(shape);shapeRow.appendChild(element('span','','Держаться выбранной формы аккорда'));box.appendChild(shapeRow);""")
replace("managed:managed,autoBass:true,swing:swing.checked,engine:'notes-v1'};", "managed:managed,autoBass:true,swing:swing.checked,engine:'notes-v1',shapeAware:true,followShape:shape.checked};")
replace("if(prepared.some(function(x){return !x.result.ok;})){if(HOST.showToast)HOST.showToast('Не удалось создать партию: проверьте аккорды, размер и диапазон');return;}", """if(prepared.some(function(x){return !x.result.ok;})){if(HOST.showToast)HOST.showToast(shape.checked ? 'Не удалось сыграть выбранную форму: проверьте размах, диапазон и переходы между аккордами' : 'Не удалось создать партию: проверьте аккорды, размер и диапазон');return;}""")
p.write_text(s)
