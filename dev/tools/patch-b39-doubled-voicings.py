#!/usr/bin/env python3
"""Replace only the embedded keyboard generator modules in the current HTML."""
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
p.write_text(s[:start]+bundle+s[end:])
