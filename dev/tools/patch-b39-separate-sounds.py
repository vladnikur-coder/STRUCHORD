#!/usr/bin/env python3
"""Extract only the existing embedded sound data from 0.770; leave audio bytes intact."""
from pathlib import Path
import sys
html=Path(sys.argv[1]); asset=Path(sys.argv[2]); s=html.read_text(encoding='utf-8')
marker='window.__b39SampleData='
i=s.index(marker); end=s.index(';\nwindow.StruChordSampleCredits=',i)+1
if s.count(marker)!=1:raise SystemExit('expected exactly one embedded sample bank')
bank=s[i:end]
script=s.rfind('<script>',0,i)
if script<0 or s.find('</script>',script)<i:raise SystemExit('unexpected script layout')
s=s[:i]+s[end:]
s=s[:script]+'<script src="./keyboard-sounds.js"></script>\n'+s[script:]
old='const banks=HOST.__b39SampleData, ready=new Map(), pending=new Map();'
if s.count(old)!=1:raise SystemExit('sample bank setup not found')
s=s.replace(old,'const banks=HOST.__b39SampleData || {}, ready=new Map(), pending=new Map();',1)
asset.write_text('// Звуки STRUCHORD: источники и лицензии доступны в настройках приложения.\n'+bank+'\n',encoding='utf-8')
html.write_text(s,encoding='utf-8')
