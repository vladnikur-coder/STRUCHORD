#!/usr/bin/env python3
"""Apply the sampled keyboard to 0.768. Sources must match the checked manifest."""
from pathlib import Path
import json,base64,hashlib,sys,os
root=Path(__file__).resolve().parents[1]; p=Path(sys.argv[1]); s=p.read_text(); assets=Path(os.environ.get('B39_SAMPLE_ROOT','/tmp/struchord-tone-assets')); manifest=json.loads((root/'assets/keyboard/manifest.json').read_text()); data={}
if 'keyboard-sounds.js' in s:raise SystemExit('Sounds are already in keyboard-sounds.js; do not inline them again')
for mode,items in manifest['banks'].items():
 bank='acoustic' if mode=='piano' else mode
 data[bank]=[]
 for item in items:
  b=(assets/mode/(str(item['midi'])+'.'+item['source'].split('.')[-1])).read_bytes()
  if hashlib.sha256(b).hexdigest()!=item['sha256']:raise SystemExit('Checksum mismatch: '+item['source'])
  entry={k:item[k] for k in ['midi','loopStart','loopEnd'] if k in item};entry['data']=base64.b64encode(b).decode();data[bank].append(entry)
def r(a,b):
 global s
 if s.count(a)!=1:raise SystemExit('Expected one occurrence: '+repr(a[:130])+f' found {s.count(a)}')
 s=s.replace(a,b,1)
r('  var B39_DEFAULT_KEYBOARD = 61;', "  var B39_DEFAULT_KEYBOARD = 61;\n  var B39_TIMBRES = ['acoustic','rhodes','organ','pad'];")
r('        keyboardSize: size, ...(inst===\'guitar\' ?', "        ...(inst==='keys' && B39_TIMBRES.includes(raw.timbre) ? {timbre:raw.timbre} : {}),\n        keyboardSize: size, ...(inst==='guitar' ?")
r('  function setVolume(id, v) {', "  function setTimbre(id, value) {var t=findTrack(id);if(!t || t.instrument!=='keys' || !B39_TIMBRES.includes(value))return false;if((t.timbre||'acoustic')===value)return true;if(HOST.captureHistorySnapshot)HOST.captureHistorySnapshot();var result=setTrackField(id,'timbre',value,'b39/track-timbre');if(HOST.captureHistorySnapshot)HOST.captureHistorySnapshot();return result;}\n  function setVolume(id, v) {")
r('    setMute: setMute, setSolo: setSolo,', '    setMute: setMute, setSolo: setSolo, setTimbre: setTimbre,')
r("    [['piano', 'Пианино'], ['simple', 'Простой тон'], ['epiano', 'Электропиано'], ['organ', 'Орган']]", "    [['acoustic', 'Акустическое пианино'], ['rhodes', 'Электропиано Rhodes'], ['organ', 'Электроорган'], ['pad', 'Синтезаторный pad']]")
r("    timbreSel = el('select'); timbreSel.setAttribute('aria-label', 'Тембр');", "    timbreSel = el('select'); timbreSel.id='b39KeysTimbre'; timbreSel.setAttribute('aria-label', 'Тембр');")
r("    timbreSel.addEventListener('change', function () {\n      var A = audio(); if (!A) return;\n      A.setMode(timbreSel.value === 'simple' ? 'simple' : 'piano');\n      A.setPartials(timbreSel.value === 'organ' ? 8 : timbreSel.value === 'epiano' ? 4 : 6);\n    });", """    var timbreRequest=0;
    timbreSel.addEventListener('change', function () {
      var A=audio(),T=tracks(),a=activeTrack(),value=timbreSel.value,request=++timbreRequest;
      if(!A || !T || !a || !a.track)return;
      var id=a.track.id,ctx=HOST.getAudioContext();if(!ctx)return;
      if(!A.timbreReady(value) && HOST.showToast)HOST.showToast('Подготовка тембра…');
      A.preloadTimbre(ctx,value).then(function(){
        var now=activeTrack();if(request!==timbreRequest || !now || !now.track || now.track.id!==id)return;
        T.setTimbre(id,value);renderPanel();
      }).catch(function(){if(request===timbreRequest){renderPanel();if(HOST.showToast)HOST.showToast('Не удалось подготовить тембр');}});
    });""")
r("field('Размер клавиатуры', trackSizeSel); field('Общий тембр клавиш', timbreSel);", """field('Размер клавиатуры', trackSizeSel); field('Тембр дорожки', timbreSel);
    var soundCredits=el('button','b39-acc-action','Источники звуков');soundCredits.type='button';soundCredits.addEventListener('click',function(){HOST.alert(HOST.StruChordSampleCredits);});controls.appendChild(soundCredits);""")
r("    var range = T.keyRange(active.track.id);\n    panel.classList.toggle('is-compact-range'", "    var range = T.keyRange(active.track.id);\n    if(timbreSel)timbreSel.value=active.track.timbre||'acoustic';\n    panel.classList.toggle('is-compact-range'")
# The audio notices are included in the standalone HTML as well as the repo.
credits=(root/'assets/keyboard/NOTICE.txt').read_text()
blob='window.__b39SampleData='+json.dumps(data,separators=(',',':'))+';\nwindow.StruChordSampleCredits='+json.dumps(credits,ensure_ascii=False)+';\n'+(root/'prototypes/keyboard-sample-bank.js').read_text()+'\n'
r("(function (HOST) {\n  'use strict';\n\n  var MODE = 'piano';              // 'simple' | 'piano'", blob+"(function (HOST) {\n  'use strict';\n\n  var MODE = 'acoustic';")
r('  function channelFor(ctx, trackId, gain) {','  function channelFor(ctx, trackId, gain, timbre) {')
r('      try { ch.input.gain.value = gain; } catch (e) {}\n      return ch;', '      try { ch.input.gain.value = gain; } catch (e) {}\n      ch.__timbre=timbre||null;return ch;')
r('    made.__ctx = ctx; made.__trackId = trackId;', '    made.__ctx = ctx; made.__trackId = trackId; made.__timbre=timbre||null;')
s=s.replace('channelFor(ctx, track.id, gain)', 'channelFor(ctx, track.id, gain, track.timbre)')
r('channelFor(ctx, trackId, gain); if (!channel) return false;', 'channelFor(ctx, trackId, gain, track.timbre); if (!channel) return false;')
r('    var channel = channelFor(ctx, trackId, gain);\n    if (!channel) return null;', '    var channel = channelFor(ctx, trackId, gain, track.timbre);\n    if (!channel) return null;')
r('  function playNote(ctx, channel, midi, start, dur, level, expression, highlightOwner) {', '''  function timbreFor(track) {return track && track.timbre || MODE;}
  function sampled(mode){return ['acoustic','rhodes','organ','pad'].indexOf(mode)>=0;}
  function timbreReady(mode){return !sampled(mode)||HOST.StruChordSampleBank.ready(mode);}
  function preloadTimbre(ctx,mode){return sampled(mode)?HOST.StruChordSampleBank.load(mode,ctx):Promise.resolve();}
  function preloadTracks(ctx,list){return Promise.all(list.filter(t=>t.instrument==='keys').map(t=>preloadTimbre(ctx,timbreFor(t))));}
  function playSample(ctx,target,mode,midi,start,dur,level){
    var bank=HOST.StruChordSampleBank, rec=bank.nearest(mode,midi);if(!rec || !hasRoom())return false;
    var src=ctx.createBufferSource(),g=ctx.createGain(),held=Math.max(.025,Math.min(30,Number(dur)||.4));
    var rate=Math.pow(2,(midi-rec.midi)/12),tail=mode==='pad'?.35:mode==='organ'?.08:mode==='rhodes'?.3:.22;
    src.buffer=rec.buffer;src.playbackRate.value=rate;
    if(rec.loopEnd && rec.loopStart>=0 && rec.loopEnd>rec.loopStart && rec.loopEnd<=rec.buffer.duration){src.loop=true;src.loopStart=rec.loopStart;src.loopEnd=rec.loopEnd;}
    if(!src.loop)held=Math.max(.025,Math.min(held,Math.max(.025,rec.buffer.duration/rate-tail-.02)));
    var attack=mode==='pad'?.14:.004,end=start+held,cal={acoustic:1.3,rhodes:.55,organ:1.1,pad:4},amp=Math.max(.0002,level*1.8*cal[mode]);
    g.gain.setValueAtTime(.0001,start);g.gain.exponentialRampToValueAtTime(amp,start+Math.min(attack,held*.5));
    var loopAt=rec.loopEnd?rec.loopEnd/rate:Infinity,levelAtEnd=amp;
    if(mode==='rhodes' && held>loopAt){g.gain.setValueAtTime(amp,start+loopAt);levelAtEnd=amp*Math.exp(-(held-loopAt)/12);g.gain.exponentialRampToValueAtTime(Math.max(.0002,levelAtEnd),end);}
    else g.gain.setValueAtTime(amp,end);
    g.gain.exponentialRampToValueAtTime(.0001,end+tail);
    src.connect(g);g.connect(target);src.start(start);src.stop(end+tail+.01);register(src);stats.notes++;return true;
  }
  function playNote(ctx, channel, midi, start, dur, level, expression, highlightOwner) {''')
r("    if (MODE === 'simple') playSimple(ctx, target, midi, start, dur, level);\n    else playPiano(ctx, target, midi, start, dur, level, expression);", """    var mode=channel.__timbre||MODE;
    if(mode==='simple')playSimple(ctx,target,midi,start,dur,level);
    else if(mode==='piano')playPiano(ctx,target,midi,start,dur,level,expression);
    else playSample(ctx,target,mode,midi,start,dur,level);""")
r("    var gain = effectiveGain(state, track); if (gain <= 0) return false;\n    ensureCtx(ctx); var channel = channelFor(ctx, trackId, gain, track.timbre);", """    var gain = effectiveGain(state, track); if (gain <= 0) return false;
    var mode=timbreFor(track);if(!timbreReady(mode)){
      var epoch=previewEpoch;if(HOST.showToast)HOST.showToast('Подготовка тембра…');preloadTimbre(ctx,mode).then(function(){if(epoch===previewEpoch)previewNote(ctx,trackId,midi);}).catch(function(){if(HOST.showToast)HOST.showToast('Не удалось подготовить тембр');});return true;
    }
    ensureCtx(ctx); var channel = channelFor(ctx, trackId, gain, track.timbre);""")
r('  var previewJobs = new Set();', '  var previewEpoch = 0;\n  var previewJobs = new Set();')
r("    if (!track || track.instrument !== 'keys') return null;\n    var gain = effectiveGain(state, track);", """    if (!track || track.instrument !== 'keys') return null;
    var mode=timbreFor(track);if(!timbreReady(mode)){
      var cancelled=false,inner=null,epoch=previewEpoch;
      preloadTimbre(ctx,mode).then(function(){if(!cancelled && epoch===previewEpoch)inner=previewPattern(chord,ctx,trackId,key,cfg,options);}).catch(function(){if(HOST.showToast)HOST.showToast('Не удалось подготовить тембр');});
      return function(){cancelled=true;if(inner)inner();};
    }
    var gain = effectiveGain(state, track);""")
r('  function stopAll() {\n    previewJobs.forEach', '  function stopAll() {\n    previewEpoch++;\n    previewJobs.forEach')
r('    setPatternPlanner: setPatternPlanner, refreshKeyHighlights: refreshKeyHighlights,', '    setPatternPlanner: setPatternPlanner, refreshKeyHighlights: refreshKeyHighlights,\n    timbreFor:timbreFor, timbreReady:timbreReady, preloadTimbre:preloadTimbre, preloadTracks:preloadTracks, previewGeneration:function(){return previewEpoch;},')
r("if (m === 'simple' || m === 'piano') MODE = m;", "if (['simple','piano','acoustic','rhodes','organ','pad'].indexOf(m)>=0) MODE = m;")
# General MIDI programs describe the closest sound; audio samples are not embedded in exports.
r('gmProgram: isKeys ? GM_PROGRAM.keys : GM_PROGRAM.guitar,', "gmProgram: isKeys ? ({rhodes:4,organ:16,pad:89}[track.timbre] ?? GM_PROGRAM.keys) : GM_PROGRAM.guitar,")
# Wait for all audible keyboard tracks before transport starts, keeping timing.
r('function stopPlayback() {', 'function stopPlayback() {\n  b39PendingTransport=0;')
r('// воспроизведение\nfunction playAll() {', "// воспроизведение\nvar b39PendingTransport=0;\nfunction playAll() {")
r('  // Откуда начинать. В режиме ленты — с того места, куда пользователь', '''  if(b39PendingTransport){b39PendingTransport=0;showToast('Подготовка отменена');return;}
  const ta=window.StruChordAudio,tt=window.StruChordTracks,ts=tt && tt.state();
  const audible=ts?ts.tracks.filter(t=>t.instrument==='keys' && ta && ta.effectiveGain(ts,t)>0):[];
  if(ta && audible.some(t=>!ta.timbreReady(ta.timbreFor(t)))){
    const ctx=audioPreflightForGesture();if(!ctx)return;
    const token=Date.now()+Math.random();b39PendingTransport=token;showToast('Подготовка клавишных звуков…');
    ta.preloadTracks(ctx,audible).then(()=>{if(b39PendingTransport!==token)return;b39PendingTransport=0;playAll();}).catch(()=>{if(b39PendingTransport===token){b39PendingTransport=0;showToast('Не удалось подготовить клавишные звуки');}});
    return;
  }

  // Откуда начинать. В режиме ленты — с того места, куда пользователь''')
r("    if (active && b39TrackGain(state, active) <= 0) return;\n    if (wrapper) {", """    if (active && b39TrackGain(state, active) <= 0) return;
    if(active && active.instrument==='keys' && window.StruChordAudio){
      const A=window.StruChordAudio,mode=A.timbreFor(active),id=active.id;
      if(!A.timbreReady(mode)){const epoch=A.previewGeneration();showToast('Подготовка тембра…');A.preloadTimbre(ctx,mode).then(()=>{const st=T.state();if(st.activeTrackId===id && A.previewGeneration()===epoch)playChord(c,wrapper,pendingPreview);}).catch(()=>showToast('Не удалось подготовить тембр'));return;}
    }
    if (wrapper) {""")
p.write_text(s)
