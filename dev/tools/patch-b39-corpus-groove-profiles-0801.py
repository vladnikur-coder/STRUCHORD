#!/usr/bin/env python3
"""Apply/update the 0.801 corpus-profile prototype in the self-contained page."""
from pathlib import Path
import json, re

HTML=Path('STRUCHORD.html')
PROFILE=Path('dev/audits/b39-corpus-groove-profiles.json')
s=HTML.read_text(encoding='utf-8')
data=json.loads(PROFILE.read_text(encoding='utf-8'))
if data.get('schema')!=1 or len(data.get('styleMap',{}))!=109 or len(data.get('profiles',{}))!=9:
    raise SystemExit('Profile dataset invalid or incomplete')
profiles=json.dumps(data['profiles'],ensure_ascii=False,separators=(',',':'))

def replace_once(old,new,label):
    global s
    if s.count(new)==1:
        return
    n=s.count(old)
    if n==1:
        s=s.replace(old,new,1)
    else:
        raise SystemExit(f'{label}: expected one old or already-patched anchor; old={n}, new={s.count(new)}')

anchor="const ROLE_ARC = Object.freeze({intro:4, verse:6, prechorus:9, chorus:11, bridge:6, solo:6, outro:5, custom:6});"
if s.count(anchor)!=1: raise SystemExit('role-arc anchor is not unique')
helpers="""\n// 0.801: compact aggregate groove descriptors; no source note sequences.\nconst CORPUS_PROFILES = PROFILE_DATA;\nfunction corpusProfileFor(genre,meter,role){const byGenre=CORPUS_PROFILES[genre],byMeter=byGenre&&byGenre[meter];return byMeter&&(byMeter[role]||byMeter.custom)||null;}\nfunction corpusGrooveIndex(patterns,profile,preferred,meter){\n  if(!profile||!Array.isArray(profile.a)||!patterns.length)return preferred;\n  const slots=meter==='4/4'?8:6, target=profile.a.slice(0,slots).map(x=>Number(x)||0), targetSum=target.reduce((a,b)=>a+b,0);\n  if(!targetSum)return preferred;\n  const avg=patterns.reduce((sum,p)=>sum+[...p.slice(0,slots)].reduce((n,c)=>n+(c==='C'?3:c==='p'?2:c==='s'?1:0),0),0)/patterns.length;\n  let best=preferred, bestScore=Infinity;\n  patterns.forEach((pattern,index)=>{\n    const weights=Array(slots).fill(0);let total=0;\n    for(let i=0;i<slots;i++){const c=pattern[i];weights[i]=c==='C'?3:c==='p'?2:c==='s'?1:0;total+=weights[i];}\n    if(!total)return;\n    let phase=0;for(let i=0;i<slots;i++)phase+=Math.abs(weights[i]/total-target[i]/targetSum);\n    const densityDistance=Math.abs(total-avg*(Number.isFinite(profile.d)?profile.d:1))/Math.max(1,avg);\n    const familyDistance=Math.min((index-preferred+patterns.length)%patterns.length,(preferred-index+patterns.length)%patterns.length)/Math.max(1,patterns.length);\n    const score=phase*0.62+Math.min(1,densityDistance)*0.23+familyDistance*0.15;\n    if(score<bestScore-1e-9){bestScore=score;best=index;}\n  });\n  return best;\n}\n"""
if 'const CORPUS_PROFILES = ' not in s:
    s=s.replace(anchor,anchor+helpers.replace('PROFILE_DATA',profiles))
else:
    table_pattern=r'const CORPUS_PROFILES = \{.*?\};'
    s,n=re.subn(table_pattern,'const CORPUS_PROFILES = '+profiles+';',s,count=1,flags=re.S)
    if n!=1: raise SystemExit(f'profile table update expected one table, found {n}')
    for fn in ('corpusProfileFor','corpusGrooveIndex'):
        if len(re.findall(r'function '+fn+r'\(',s))!=1: raise SystemExit(f'{fn} helper missing or duplicated')

binding="  const corpusProfile=Number.isInteger(phraseSeed)?corpusProfileFor(genre,meter,role):null;"
s=s.replace(binding+'\n'+binding,binding)
replace_once("const useSwing = resolveSwing(swing, sectionSwing), human = rng(seed ^ 0x6d2b79f5), beatsPerBar = METERS[meter];","const useSwing = resolveSwing(swing, sectionSwing), human = rng(seed ^ 0x6d2b79f5), beatsPerBar = METERS[meter];\n  const corpusProfile=Number.isInteger(phraseSeed)?corpusProfileFor(genre,meter,role):null;",'profile binding')
replace_once("const strength = ROLE[role]*(satN===null?1:0.75+satN/250), strong = downbeat ? 1 : (bassBeat ? 0.65 : 0.2);","const profileDensity=corpusProfile?1+(corpusProfile.d-1)*0.45:1;\n      const strength = ROLE[role]*(satN===null?1:0.75+satN/250)*profileDensity, strong = downbeat ? 1 : (bassBeat ? 0.65 : 0.2);",'role density scale')
replace_once("const pattern=GROOVES[grooveGenre][(lead+(bar%2?answer:0))%4];","const grooveSet=GROOVES[grooveGenre],preferred=(lead+(bar%2?answer:0))%grooveSet.length;\n        const grooveProfile=corpusProfile&&corpusProfileFor(grooveGenre,meter,role);\n        const pattern=grooveSet[corpusGrooveIndex(grooveSet,grooveProfile,preferred,meter)];",'groove matching')
replace_once("const position=modern && family!==0 ? (Math.floor(step/2)+Math.floor(step/(beatsPerBar*4))+family)%voice.right.length : Math.floor(choose(4)*voice.right.length);\n        emit('right',[voice.right[position]],66);","const basePosition=modern && family!==0 ? (Math.floor(step/2)+Math.floor(step/(beatsPerBar*4))+family)%voice.right.length : Math.floor(choose(4)*voice.right.length);\n        const registerShift=corpusProfile?Math.max(-1,Math.min(1,Math.round(corpusProfile.r/6))):0;\n        const position=Math.max(0,Math.min(voice.right.length-1,basePosition+registerShift));\n        emit('right',[voice.right[position]],66);",'single-note register influence')
replace_once("applyDynamics(notes, {role, genre, meter, beatsPerBar, totalBeats:beat, seed});","applyDynamics(notes, {role, genre, meter, beatsPerBar, totalBeats:beat, seed, corpusVelocityOffset:corpusProfile?corpusProfile.v*0.45:0});",'role velocity profile')
replace_once("const level = ROLE_LEVEL[o.role] ?? 75, metric = GENRE_METRIC[o.genre] ?? 1, arcAmp = ROLE_ARC[o.role] ?? 6;","const level = (ROLE_LEVEL[o.role] ?? 75) + (Number.isFinite(o.corpusVelocityOffset)?o.corpusVelocityOffset:0), metric = GENRE_METRIC[o.genre] ?? 1, arcAmp = ROLE_ARC[o.role] ?? 6;",'velocity level')
# Version header is changed once; update the label if patching from 0.800.
if s.count('· ver 0.800')==1: s=s.replace('· ver 0.800','· ver 0.801',1)
elif s.count('· ver 0.801')!=1: raise SystemExit('application version label is not 0.800/0.801')
HTML.write_text(s,encoding='utf-8')
print('Patched/updated 0.801 profiles:',len(profiles.encode('utf-8')),'bytes; source MIDI:',data['sourceMidiFiles'])
