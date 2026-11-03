#!/usr/bin/env python3
"""Apply 0.768 phrase generator to a 0.767 HTML copy, preserving all other code."""
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
def r(a,b):
 global s
 if s.count(a)!=1:raise SystemExit('expected one occurrence: '+a[:120])
 s=s.replace(a,b,1)
r("...(previous && Number.isInteger(previous.noteVariation)?{noteVariation:previous.noteVariation}:{})};", "...(previous && Number.isInteger(previous.noteVariation)?{noteVariation:previous.noteVariation}:{}),...(previous && previous.rhythmVersion===2?{rhythmVersion:2}:{})};")
r('if(generated && generated.result.writes.length)pattern.noteVariation=generated.result.variation;', 'if(generated && generated.result.writes.length){pattern.noteVariation=generated.result.variation;pattern.rhythmVersion=2;}')
p.write_text(s)
