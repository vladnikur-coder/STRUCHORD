'use strict';
// 0.772: динамика доходит до настоящего звука и экспорта, а не только до данных.
const assert=require('assert'),puppeteer=require('puppeteer'),chromium=require('@sparticuz/chromium').default;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
(async()=>{const b=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||await chromium.executablePath(),args:['--no-sandbox']});try{
 const p=await b.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.setViewport({width:1440,height:900});
 await p.evaluateOnNewDocument(()=>localStorage.setItem('struchord-default-instrument','keys'));
 await p.goto(process.env.STRUCHORD_URL||'http://127.0.0.1:8028/STRUCHORD.html',{waitUntil:'load'});
 await p.waitForFunction(()=>typeof startNewSongFromHome==='function');
 await p.evaluate(()=>{startNewSongFromHome();addSection('Verse');addSection('Chorus');for(const s of sections)['C','Am','F','G'].forEach((c,i)=>s.squares[0].events[i].chord=c);StruChordKeys.open();});
 await p.click('#b39KeysSettingsToggle');await p.click('#b39AutoOpen');await wait(400);await p.click('#b39AutoApply');await wait(700);

 const data=await p.evaluate(()=>{const out={};for(const s of sections){const q=s.squares[0];
   const gains=[],exported=[],velocities=[];
   q.events.forEach((ev,ei)=>{const cell=StruChordTracks.cellKey(s,q,ei);
     const o={trackId:1,cell,sec:s,sq:q,ev,ei,ts:'4/4',span:ev.span,dur:ev.span,chord:ev.chord,key:globalKey,range:StruChordTracks.keyRange(1),notes:[48,60,64,67]};
     StruChordAccomp.plan(o).forEach(x=>gains.push(x.gain));
     StruChordExport.stepsFor(StruChordTracks.track(1),cell,s,q,ev,ei,ev.chord,globalKey,o.range,o.notes,ev.span,'4/4').forEach(x=>exported.push(x.gain));
     velocities.push(...(StruChordTracks.patternFor(1,cell)||{notes:[]}).notes.map(n=>n.velocity));});
   out[s.type]={gains,exported,velocities};
 }return out;});
 const verse=data.Verse.gains,chorus=data.Chorus.gains;
 assert(verse.every(g=>Number.isFinite(g))&&chorus.every(g=>Number.isFinite(g)),'planned steps must carry a gain');
 assert(20*Math.log10(mean(chorus)/mean(verse))>=1.5,'chorus should be audibly louder than verse: '+mean(chorus).toFixed(2)+' vs '+mean(verse).toFixed(2));
 assert(Math.max(...chorus)/Math.min(...chorus)>=1.2,'dynamics inside the chorus should not be flat');
 assert.deepStrictEqual(chorus,data.Chorus.exported,'export must use the same dynamics as playback');
 const lvl=data.Chorus.velocities;
 assert(Math.max(...lvl)-Math.min(...lvl)>=15,'generated velocities inside the chorus vary, spread '+(Math.max(...lvl)-Math.min(...lvl)));

 const audio=await p.evaluate(async()=>{const ctx=getAudioContext();await ctx.resume();await window.StruChordSampleBank.load('acoustic',ctx);const rec=[];
   const original=ctx.createGain.bind(ctx);
   ctx.createGain=function(){const g=original();const set=g.gain.setValueAtTime.bind(g.gain),ramp=g.gain.exponentialRampToValueAtTime.bind(g.gain);
     g.gain.setValueAtTime=function(v,t){if(v>0.001)rec.push(v);return set(v,t);};
     g.gain.exponentialRampToValueAtTime=function(v,t){rec.push(v);return ramp(v,t);};return g;};
   const s=sections[1],q=s.squares[0];
   q.events.forEach((ev,i)=>StruChordAudio.scheduleEvent(ctx,s,q,ev,i,ctx.currentTime+0.1+i*2,2,120,'4/4'));
   StruChordAudio.stopAll();
   return rec;});
 const amps=[...new Set(audio.filter(v=>v>0.05).map(v=>+v.toFixed(3)))];
 assert(amps.length>=4,'real audio should use several levels, got '+amps.length+': '+amps.slice(0,8));
 const ratio=Math.max(...amps)/Math.min(...amps);
 assert(ratio>=1.35,'loud and soft notes must differ in amplitude, ratio '+ratio.toFixed(2)+': '+amps.slice(0,10));
 assert.deepStrictEqual(errors,[]);
 console.log('Keyboard dynamics in app: chorus '+mean(chorus).toFixed(2)+' vs verse '+mean(verse).toFixed(2)+' gain, '+amps.length+' audio levels, '+ratio.toFixed(2)+'x spread — OK');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
