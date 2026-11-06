#!/usr/bin/env python3
"""Read-only corpus audit of MIDI files inside ezkeys-data.zip."""
from __future__ import annotations
import io, json, math, re, statistics, sys, zipfile
from collections import Counter, defaultdict
from pathlib import PurePosixPath
import mido

ARCHIVE = sys.argv[1] if len(sys.argv) > 1 else "google_drive/ezkeys-data.zip"
OUT = sys.argv[2] if len(sys.argv) > 2 else "dev/audits/ezkeys-corpus.json"
ROLE_WORDS = {
 "intro":"intro", "verse":"verse", "pre_chorus":"pre-chorus", "pre-chorus":"pre-chorus",
 "chorus":"chorus", "bridge":"bridge", "solo":"solo", "interlude":"interlude",
 "outro":"outro", "ending":"ending", "fill":"fill", "break":"break", "riff":"riff",
 "theme":"theme", "variation":"variation", "variations":"variation", "pickup":"pickup", "transition":"transition",
 "breakdown":"breakdown", "buildup":"build-up", "build-up":"build-up", "main_patterns":"main-patterns",
 "additional_layers":"additional-layers", "bass":"bass",
}

def role_of(name):
 s=PurePosixPath(name).stem.lower().replace(' ', '_')
 for token, role in ROLE_WORDS.items():
  if token in s: return role
 return "unclassified"

def _voiceleading_steps(a, b):
 # Minimum-total semitone matching for simultaneous pitch stacks, allowing voices
 # from the smaller stack to match a subset of the larger stack.
 if len(a) > len(b): a, b = b, a
 states={0:0}
 for pitch in a:
  nxt={}
  for mask,total in states.items():
   for j,target in enumerate(b):
    if not (mask>>j)&1:
     key=mask|(1<<j); cost=total+abs(pitch-target)
     if key not in nxt or cost<nxt[key]: nxt[key]=cost
  states=nxt
 return min(states.values())/max(1,len(a)) if states else 0

def parse_one(raw, path):
 try: mid=mido.MidiFile(file=io.BytesIO(raw))
 except Exception as e: return {"path":path,"error":str(e)}
 tpq=mid.ticks_per_beat or 480
 tempos=[]; meters=[]; notes=[]; tracks=0
 # Merge each track separately in absolute ticks; track attribution matters for density, but all notes aggregate.
 for ti,tr in enumerate(mid.tracks):
  t=0; active=defaultdict(list); tracks += bool(any(m.type not in ('track_name','end_of_track') for m in tr))
  for m in tr:
   t += m.time
   if m.type=='set_tempo': tempos.append((t,m.tempo))
   elif m.type=='time_signature': meters.append((t,m.numerator,m.denominator))
   elif m.type=='note_on' and m.velocity>0: active[(m.channel,m.note)].append((t,m.velocity,ti))
   elif m.type=='note_off' or (m.type=='note_on' and m.velocity==0):
    k=(m.channel,m.note)
    if active[k]:
     st,v,track=active[k].pop(0)
     if t>st: notes.append((st,t,m.note,v,track))
 # Some files omit note offs. Count as malformed-ish but preserve measurable events at EOT.
 notes.sort()
 if not notes:
  return {"path":path,"error":"no complete note events","ticks_per_beat":tpq,"tracks":len(mid.tracks)}
 tempos.sort(); meters.sort()
 tempo=tempos[0][1] if tempos else 500000
 bpm=60000000/tempo
 num,den=(meters[0][1:] if meters else (4,4))
 barbeats=num*4/den
 end=max(n[1] for n in notes); bars=end/(tpq*barbeats)
 ons=[n[0]/tpq for n in notes]; pitches=[n[2] for n in notes]; velocities=[n[3] for n in notes]
 duration_beats=end/tpq
 # polyphony and pitch-span sampled from note event boundaries
 ev=[]
 for st,en,p,v,tr in notes: ev.extend(((st,1,p),(en,-1,p)))
 ev.sort(key=lambda x:(x[0],x[1]))
 live=Counter(); poly_max=0; poly_sum=0; last=0
 for tick,delta,p in ev:
  if tick>last: poly_sum+=sum(live.values())*(tick-last); last=tick
  live[p]+=delta
  if live[p]<=0: live.pop(p,None)
  poly_max=max(poly_max,sum(live.values()))
 # quantized onset positions in 16th-note units, with per-bar signatures
 step=tpq/4
 slots=[]
 for beat in ons: slots.append(int(round(beat*4)))
 bar_slots=max(1,int(round(barbeats*4)))
 bar_count=max(1,math.ceil(duration_beats/barbeats))
 bar_sigs=Counter(tuple(sorted(s%bar_slots for s in slots if int(s//bar_slots)==b)) for b in range(bar_count))
 nonempty_sigs=[sig for sig,count in bar_sigs.items() if sig]
 repeated=sum(count for sig,count in bar_sigs.items() if sig and count>1)
 repeated_bar_ratio=round(repeated/max(1,sum(bar_sigs.values())),4)
 # Onset phase counts are weighted by notes; unique attacks are separate.
 phase=Counter(s%bar_slots for s in slots)
 phase_velocity=Counter()
 for st,en,p,v,tr in notes: phase_velocity[int(round((st/tpq)*4))%bar_slots]+=v
 offgrid=sum(1 for x in ons if abs(x*4-round(x*4))>.08)
 unique_attacks=len(set(n[0] for n in notes))
 attack_stacks=defaultdict(list)
 for st,en,p,v,tr in notes: attack_stacks[st].append(p)
 chord_stacks=[sorted(set(ps)) for _,ps in sorted(attack_stacks.items()) if len(set(ps))>=2]
 voice_steps=[_voiceleading_steps(a,b) for a,b in zip(chord_stacks,chord_stacks[1:])]
 # duration articulation ratio / note density
 note_durs=[(en-st)/tpq for st,en,p,v,tr in notes]
 return {"path":path,"style":path.split('/')[1] if len(path.split('/'))>2 else "root",
  "role":role_of(path),"bpm":round(bpm,3),"meter":f"{num}/{den}","bars":round(bars,3),
  "beats":round(duration_beats,3),"notes":len(notes),"tracks":len(mid.tracks),"active_tracks":tracks,
  "pitch_min":min(pitches),"pitch_max":max(pitches),"pitch_span":max(pitches)-min(pitches),
  "pitch_mean":round(statistics.mean(pitches),2),"velocity_mean":round(statistics.mean(velocities),2),
  "velocity_sd":round(statistics.pstdev(velocities),2),"poly_max":poly_max,
  "poly_mean":round(poly_sum/end,3) if end else 0,"notes_per_bar":round(len(notes)/bars,2) if bars else len(notes),
  "onsets_per_beat":round(unique_attacks/duration_beats,3) if duration_beats else 0,
  "offgrid_ratio":round(offgrid/len(ons),4),"repeat_bar_ratio":repeated_bar_ratio,
  "duration_mean_beats":round(statistics.mean(note_durs),3),"phase_counts":dict(phase),"phase_velocity":dict(phase_velocity),
  "simultaneous_attack_stacks":len(chord_stacks),"voicelead_transitions":len(voice_steps),
  "voicelead_mean_semitones":round(statistics.mean(voice_steps),3) if voice_steps else None,
  "tempo_changes":len(tempos),"meter_changes":len(meters)}

with zipfile.ZipFile(ARCHIVE) as z:
 names=[i for i in z.infolist() if not i.is_dir() and i.filename.lower().endswith(('.mid','.midi')) and not i.filename.startswith('__MACOSX/')]
 rows=[]
 for idx,info in enumerate(names,1):
  try: rows.append(parse_one(z.read(info),info.filename))
  except Exception as e: rows.append({"path":info.filename,"error":f"read/parse: {e}"})
  if idx%5000==0: print(f"parsed {idx}/{len(names)}",file=sys.stderr)
with open(OUT,'w',encoding='utf-8') as f: json.dump({"archive":ARCHIVE,"file_count":len(names),"rows":rows},f,ensure_ascii=False,separators=(',',':'))
print(f"wrote {OUT}; files={len(names)} errors={sum('error' in r for r in rows)}")
