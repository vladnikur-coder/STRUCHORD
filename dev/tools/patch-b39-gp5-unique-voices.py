#!/usr/bin/env python3
"""Prefer distinct virtual strings in a simultaneous GP5 chord.

Run on a candidate HTML path first; production HTML is modified only by patch.
"""
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit('usage: patch-b39-gp5-unique-voices.py <STRUCHORD.html>')
path = Path(sys.argv[1])
text = path.read_text(encoding='utf-8')
old = '''        for(var i=0;i<item.choices.length;i++){
          var candidate=item.choices[i];
          for(var voice=0;voice<2;voice++){
            var slot=candidate.string*2+voice;
            if(seen[slot])continue;
            seen[slot]=true;
            if(!occupied[slot] || assign(occupied[slot],seen)){
              occupied[slot]=item;
              result[item.index]={string:candidate.string,fret:candidate.fret};
              return true;
            }
          }
        }'''
new = '''        // В первом проходе пробуем все разные струны, прежде чем
        // занимать второй голос той же струны. Это оставляет второй голос
        // свободным для баса, звучащего под аккордом другой длительности.
        for(var voice=0;voice<2;voice++){
          for(var i=0;i<item.choices.length;i++){
            var candidate=item.choices[i];
            var slot=candidate.string*2+voice;
            if(seen[slot])continue;
            seen[slot]=true;
            if(!occupied[slot] || assign(occupied[slot],seen)){
              occupied[slot]=item;
              result[item.index]={string:candidate.string,fret:candidate.fret};
              return true;
            }
          }
        }'''
if text.count(old) != 1:
    raise SystemExit('expected unique GP5 assignment block')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
