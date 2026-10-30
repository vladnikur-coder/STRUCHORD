#!/usr/bin/env python3
"""Patch a temporary HTML candidate; special bounded note patterns only."""
from pathlib import Path
import sys
p=Path(sys.argv[1]);s=p.read_text(encoding='utf-8')
def replace(old,new):
 global s
 if s.count(old)!=1: raise SystemExit(f'expected unique match: {old[:80]}')
 s=s.replace(old,new,1)
replace("""    if (typeof text !== 'string' || text.length > B39_LIMITS.MAX_PATTERN_CHARS) return null;
    return b39Clone(raw);""", """    if (typeof text !== 'string') return null;
    if (raw.type === 'experimental-notes-v1') {
      if (text.length > 32768 || !Number.isFinite(raw.beats) || raw.beats<=0 || raw.beats>32 ||
          (raw.status!=='generated' && raw.status!=='manual') || !Array.isArray(raw.notes) || raw.notes.length>1024 ||
          !raw.notes.every(function(n){return n && Number.isInteger(n.midi) && n.midi>=0 && n.midi<=127 &&
            Number.isFinite(n.beat) && n.beat>=0 && n.beat<raw.beats && Number.isFinite(n.duration) && n.duration>0 && n.beat+n.duration<=raw.beats+1e-8 &&
            Number.isInteger(n.velocity) && n.velocity>=1 && n.velocity<=127 && (n.hand==='left' || n.hand==='right');})) return null;
    } else if (text.length > B39_LIMITS.MAX_PATTERN_CHARS) return null;
    return b39Clone(raw);""")
p.write_text(s,encoding='utf-8')
