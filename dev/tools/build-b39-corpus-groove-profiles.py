#!/usr/bin/env python3
"""Build small, note-sequence-free B-39 groove profiles from the full MIDI audit JSON."""
import json, statistics, sys
from collections import defaultdict, Counter

INPUT=sys.argv[1] if len(sys.argv)>1 else 'dev/audits/ezkeys-corpus.json'
OUTPUT=sys.argv[2] if len(sys.argv)>2 else 'dev/audits/b39-corpus-groove-profiles.json'
APP_GENRES=('pop','rock','punk','country','blues','jazz','hiphop','funk','fusion')
METERS=('4/4','3/4','6/8')
ROLES=('intro','verse','prechorus','chorus','bridge','solo','outro','custom')

# 0.802: the soul pool is dissolved (owner decision: hip-hop replaces soul in
# the app). The 14 non-hip-hop soul-library folders were redistributed to the
# nearest surviving pool by measured descriptor distance (candidates funk/pop):
# phase-vector L1 + density/velocity/register z-scores over the supported-meter
# rows. gospel organs and retro soul/rnb land in funk; ballads, R&B, neo-soul
# and classic soul land in pop. See dev/specs/b39-hiphop-genre-0802.md.
SOUL_REDIST={
 'classic_soul':'pop','contemporary_r&b':'pop','contemporary_soul_ballads':'pop',
 'detroit_soul':'pop','ekx_soul_roads':'pop','gospel':'funk','gospel_organ':'funk',
 'modern_soul':'pop','neo_soul':'pop','r&b_themes':'pop','retro_soul':'funk',
 'rnb':'funk','soul_organ':'funk','traditional_gospel':'pop'}

# Folder names route reference pools to the app's broad genre families. The
# measured descriptors, not these labels, are what select a groove candidate.
def route(style):
 s=style.lower()
 if 'hip-hop' in s: return 'hiphop'
 if s in SOUL_REDIST: return SOUL_REDIST[s]
 if any(x in s for x in ('country','americana','folk','singer_songwriter')): return 'country'
 if any(x in s for x in ('blues','shuffle','boogie')): return 'blues'
 if any(x in s for x in ('jazz','big_band')): return 'jazz'
 if any(x in s for x in ('funk','disco','house','edm','reggae','techno','tropical')): return 'funk'
 if any(x in s for x in ('punk','metal','industrial','goth_rock')): return 'punk'
 if any(x in s for x in ('rock','aor','new_wave','british_invasion','seventies_prog')): return 'rock'
 if any(x in s for x in ('pop','ballad','songwriter','hook','eighties','sixties')): return 'pop'
 if any(x in s for x in ('latin','world','fusion','movie','cinematic','epic','mallet','orchestral','ambient','atmospheric','keys#strings')): return 'fusion'
 # General-purpose libraries are spread over the least-specialized families.
 return {'ezkeys_2':'pop','ezkeys_midi':'pop','beat_ideas':'fusion','music_theory_examples':'fusion'}.get(s,'fusion')

def role_key(role): return {'pre-chorus':'prechorus','main-patterns':'custom','additional-layers':'custom','variation':'custom','ending':'outro','break':'custom','riff':'custom','bass':'custom','theme':'custom','unclassified':'custom'}.get(role,role)

def quantize(vec):
 if not vec or sum(vec)<=0: return [12,13,13,12,13,12,13,12]
 raw=[100*x/sum(vec) for x in vec]
 out=[int(x) for x in raw]
 for i in sorted(range(len(raw)),key=lambda i:raw[i]-out[i],reverse=True)[:100-sum(out)]: out[i]+=1
 return out

def median(xs, default): return statistics.median(xs) if xs else default

blob=json.load(open(INPUT,encoding='utf-8'))
rows=[r for r in blob['rows'] if 'error' not in r and r.get('meter') in METERS]
styles=sorted({r['style'] for r in rows})
style_map={s:route(s) for s in styles}
by=defaultdict(list)
for r in rows:
 role=role_key(r.get('role','unclassified'))
 if role not in ROLES: role='custom'
 by[(style_map[r['style']],r['meter'],'*')].append(r)
 by[(style_map[r['style']],r['meter'],role)].append(r)

profiles={}
for genre in APP_GENRES:
 profiles[genre]={}
 for meter in METERS:
  base=by.get((genre,meter,'*'),[])
  base_density=median([r['notes_per_bar'] for r in base],12.0)
  base_velocity=median([r['velocity_mean'] for r in base],77.0)
  base_pitch=median([r['pitch_mean'] for r in base],60.0)
  profiles[genre][meter]={}
  for role in ROLES:
   q=by.get((genre,meter,role),[])
   if len(q)<8: q=base
   if not q: q=[r for r in rows if r['meter']==meter]
   phase=[0.0]*8
   for r in q:
    bar_slots=12 if meter in ('3/4','6/8') else 16
    counts=r.get('phase_velocity') or r.get('phase_counts') or {}
    local=[0.0]*8
    for pos,count in counts.items():
     try: p=int(pos)%bar_slots; ix=(p//2) if bar_slots==16 else min(5,p//2)
     except Exception: continue
     local[ix]+=float(count)
    # 3/4 and 6/8 have six eighth slots; pad to eight without inventing attacks.
    total=sum(local)
    if total:
     for i,x in enumerate(local): phase[i]+=x/total
   if len(q) and sum(phase): phase=[x/len(q) for x in phase]
   density=median([r['notes_per_bar'] for r in q],base_density)
   velocity=median([r['velocity_mean'] for r in q],base_velocity)
   density_ratio=max(.90,min(1.10,density/max(.01,base_density)))
   velocity_delta=max(-4,min(4,velocity-base_velocity))
   register_delta=max(-12,min(12,median([r['pitch_mean'] for r in q],base_pitch)-base_pitch))
   profiles[genre][meter][role]={
    'a':quantize(phase), 'd':round(density_ratio,3), 'v':round(velocity_delta,2), 'r':round(register_delta,2), 'n':len(by.get((genre,meter,role),[]))
   }

out={'schema':1,'sourceMidiFiles':len(rows),'genres':list(APP_GENRES),'meters':list(METERS),'roles':list(ROLES),
 'styleMap':style_map,'profiles':profiles}
with open(OUTPUT,'w',encoding='utf-8') as f: json.dump(out,f,ensure_ascii=False,separators=(',',':'))
print(json.dumps({'output':OUTPUT,'source_files':len(rows),'styles':len(style_map),'route_counts':dict(Counter(style_map.values())),'bytes':len(json.dumps(out,separators=(',',':')))},ensure_ascii=False))
