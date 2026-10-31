// Offline keyboard sample decoder; data comes from keyboard-sounds.js next to the app.
// No network requests and no synthesized substitution while samples load.
(function (HOST) {
  'use strict';
  const banks=HOST.__b39SampleData || {}, ready=new Map(), pending=new Map();
  function binary(base64){const s=HOST.atob(base64),a=new Uint8Array(s.length);for(let i=0;i<s.length;i++)a[i]=s.charCodeAt(i);return a.buffer;}
  // Crossfade a copy of the recorded tail into its loop start. MP3 has no
  // reliable original loop metadata. This is not a Leslie simulation.
  function makeSustain(ctx,buf){
    if(buf.duration<1)return {buffer:buf};
    const copy=ctx.createBuffer(buf.numberOfChannels,buf.length,buf.sampleRate),rate=buf.sampleRate;
    const start=Math.floor(Math.min(.45,buf.duration*.22)*rate),end=Math.floor((buf.duration-.08)*rate);
    const fade=Math.max(1,Math.min(Math.floor(.06*rate),Math.floor((end-start)/4)));
    for(let c=0;c<buf.numberOfChannels;c++){
      const input=buf.getChannelData(c),out=copy.getChannelData(c);out.set(input);
      for(let i=0;i<fade;i++){let t=(i+1)/fade;out[end-fade+i]=input[end-fade+i]*(1-t)+input[start+i]*t;}
    }
    return {buffer:copy,loopStart:(start+fade)/rate,loopEnd:end/rate};
  }
  function load(mode,ctx){
    if(ready.has(mode))return Promise.resolve(ready.get(mode));
    if(pending.has(mode))return pending.get(mode);
    if(!banks[mode]||!ctx||typeof ctx.decodeAudioData!=='function')return Promise.reject(Error('Звуки недоступны'));
    const task=Promise.all(banks[mode].map(e=>ctx.decodeAudioData(binary(e.data)).then(buf=>{
      const r=(mode==='organ'||mode==='pad')?makeSustain(ctx,buf):{buffer:buf};
      r.midi=e.midi;if(mode==='rhodes'){r.loopStart=e.loopStart;r.loopEnd=e.loopEnd;}
      return r;
    }))).then(v=>{ready.set(mode,v);pending.delete(mode);return v;},err=>{pending.delete(mode);throw err;});
    pending.set(mode,task);return task;
  }
  function nearest(mode,midi){const a=ready.get(mode);if(!a)return null;return a.reduce((p,q)=>Math.abs(q.midi-midi)<Math.abs(p.midi-midi)?q:p);}
  HOST.StruChordSampleBank=Object.freeze({load:load,ready:mode=>ready.has(mode),nearest:nearest});
  // Warm the default without starting sound or requiring an autoplay gesture.
  try{const Offline=HOST.OfflineAudioContext||HOST.webkitOfflineAudioContext;if(Offline)load('acoustic',new Offline(1,1,44100)).catch(()=>{});}catch(e){}
})(window);
