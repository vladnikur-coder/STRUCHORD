import os,urllib.parse,concurrent.futures,subprocess,pathlib,re,struct,json,hashlib
R=pathlib.Path('/tmp/struchord-tone-assets');R.mkdir(exist_ok=True)
repos={'piano':('Tonejs/audio','efd8296360f9526e379bfbe5c1698ff54d6a1d34'),'rhodes':('sfzinstruments/Discord-SFZ-GM-Bank','7a9c478fe331f94f246d33332f0adedb25bbbe27'),'organ':('t-hamano/piano-block','897256cd5506a5c2cba14f6bb48fef8113dc39b5'),'pad':('educandu/abcjs-soundfonts','ebd5724f5d334b5b6347562b0044f75e16df90b7')}
a=[]
def add(mode,midi,path):a.append((mode,midi,path))
add('piano',21,'salamander/A0.mp3')
for n in range(1,8):
 for note,pc in [('C',0),('Fs',6)]:add('piano',(n+1)*12+pc,f'salamander/{note}{n}.mp3')
add('piano',108,'salamander/C8.mp3')
for i,note in [(29,'F1'),(35,'B1'),(40,'E2'),(45,'A2'),(50,'D3'),(55,'G3'),(59,'B3'),(62,'D4'),(65,'F4'),(71,'B4'),(76,'E5'),(81,'A5'),(86,'D6'),(91,'G6'),(96,'C7')]:
 x=3 if i<=65 else 4;add('rhodes',i,f'Discord GM/Melodic/005-Electric Piano 1/A_{i:03d}__{note}_{x}.wav')
for n,mid in [('G2',43),('C3',48),('G3',55),('C4',60),('G4',67),('C5',72),('G5',79)]:add('organ',mid,f'assets/instruments/organ/{n}.mp3')
for octave in range(1,8):
 for name,pc in [('C',0),('Gb',6)]:add('pad',(octave+1)*12+pc,f'FluidR3_Salamander_GM/pad_2_warm-mp3/{name}{octave}.mp3')
add('pad',96,'FluidR3_Salamander_GM/pad_2_warm-mp3/C7.mp3') if False else None

def dl(t):
 mode,midi,path=t; repo,sha=repos[mode]; dest=R/mode/(str(midi)+'.'+path.split('.')[-1]);dest.parent.mkdir(exist_ok=True)
 api='repos/'+repo+'/contents/'+urllib.parse.quote(path,safe='/')+'?ref='+sha
 if not dest.exists():dest.write_bytes(subprocess.check_output(['gh','api','-H','Accept: application/vnd.github.raw+json',api]))
 data=dest.read_bytes();out={'midi':midi,'path':str(dest),'source':path,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)}
 if mode=='rhodes':
  offset=12
  while offset+8<len(data):
   typ,size=struct.unpack_from('<4sI',data,offset);offset+=8
   if typ==b'smpl':
    vals=struct.unpack_from('<9I',data,offset)
    if vals[7]:
     cue,typ,start,end,frac,cnt=struct.unpack_from('<6I',data,offset+36);out.update(loopStart=start/44100,loopEnd=(end+1)/44100)
    break
   offset+=size+(size%2)
  if 'loopStart' not in out:raise RuntimeError(path+' missing loop')
 return (mode,out)
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool: rows=list(pool.map(dl,a))
result={k:[] for k in repos}
for mode,rec in rows:result[mode].append(rec)
(R/'manifest.json').write_text(json.dumps({'repositories':repos,'banks':result},ensure_ascii=False,indent=2))
for k,v in result.items():print(k,len(v),sum(x['bytes'] for x in v))
