#!/usr/bin/env python3
"""0.772: add performance dynamics to the embedded keyboard generator.

The code is taken verbatim from dev/prototypes/keyboard-performance.js, so the
prototype and the application cannot drift. Only velocity is affected: pitch,
start and duration code is untouched.
"""
from pathlib import Path
import sys
html = Path(sys.argv[1]); s = html.read_text(encoding='utf-8')
src = (Path(__file__).resolve().parents[1] / 'prototypes' / 'keyboard-performance.js').read_text(encoding='utf-8')
role = "const ROLE = Object.freeze({intro:0.72, verse:0.82, prechorus:1.0, chorus:1.16, bridge:0.94, solo:0.72, outro:0.62, custom:0.9});"
meters = "\nconst METERS = Object.freeze("
extra = src[src.index(role) + len(role):src.index(meters)]
call_from = "    beat = end;\n  }\n  // 0.772:"
call_to = "applyDynamics(notes, {role, genre, meter, beatsPerBar, totalBeats:beat, seed});\n"
call = src[src.index(call_from):src.index(call_to) + len(call_to)]
if 'ROLE_LEVEL' in s:
    raise SystemExit('dynamics already applied; refusing to patch twice')
if s.count(role) != 1 or s.count('    beat = end;\n  }\n') != 1:
    raise SystemExit('unexpected generator layout')
s = s.replace(role, role + extra, 1)
s = s.replace('    beat = end;\n  }\n', call, 1)
old = 'module.exports = {generatePerformance, resolveSwing, GENRES, METERS};'
if s.count(old) != 1:
    raise SystemExit('module exports not found')
s = s.replace(old, 'module.exports = {generatePerformance, resolveSwing, GENRES, METERS, applyDynamics};', 1)
html.write_text(s, encoding='utf-8')
print('dynamics inserted, HTML', html.stat().st_size, 'bytes')
