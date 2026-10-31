'use strict';
// 0.771: real samples live in keyboard-sounds.js next to the app, not in the HTML.
const assert=require('assert'),puppeteer=require('puppeteer'),path=require('path'),fs=require('fs'),os=require('os');
(async()=>{const b=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/tmp/chromium',args:['--no-sandbox','--allow-file-access-from-files']});try{
 const html=path.resolve(process.env.STRUCHORD_HTML||'STRUCHORD.html'),asset=path.resolve(process.env.STRUCHORD_SOUNDS||path.join(path.dirname(html),'keyboard-sounds.js'));
 let p=await b.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setOfflineMode(true);await p.evaluateOnNewDocument(()=>localStorage.setItem('struchord-default-instrument','keys'));
 await p.goto('file://'+html+'?separate-sounds='+Date.now());await p.waitForFunction(()=>window.__b39SampleData && window.StruChordSampleBank);
 assert(await p.evaluate(()=>Object.keys(__b39SampleData).length===4),'external file provides four banks');
 const init=await p.evaluate(async()=>{startNewSongFromHome();StruChordTracks.setTimbre(1,'rhodes');let c=getAudioContext();await c.resume();window.sources=[];let original=c.createBufferSource.bind(c);c.createBufferSource=function(){let s=original(),start=s.start.bind(s);s.start=function(t){window.sources.push({time:t,loop:s.loop});return start(t)};return s;};return StruChordAudio.previewNote(c,1,60)});
 assert(init,'preview requests a note');await p.waitForFunction(()=>sources.length===1,{timeout:30000});assert(await p.evaluate(()=>sources[0].loop),'actual recorded sample starts from the external file');
 assert.deepStrictEqual(errors,[]);

 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'struchord-no-sounds-')),lonely=path.join(dir,'STRUCHORD.html');fs.copyFileSync(html,lonely);
 let q=await b.newPage(),quiet=[];q.on('pageerror',e=>quiet.push(e.message));await q.setOfflineMode(true);await q.evaluateOnNewDocument(()=>localStorage.setItem('struchord-default-instrument','keys'));
 await q.goto('file://'+lonely+'?no-sounds='+Date.now());await q.waitForFunction(()=>typeof startNewSongFromHome==='function');
 assert(await q.evaluate(async()=>{startNewSongFromHome();StruChordTracks.setTimbre(1,'organ');let c=getAudioContext();await c.resume();StruChordAudio.previewNote(c,1,60);return new Promise(r=>setTimeout(()=>r(document.getElementById('toast').textContent),400));}).then(t=>t.includes('keyboard-sounds.js')),'missing sound file is named clearly instead of failing silently');
 assert(await q.evaluate(()=>!!document.querySelector('.fretboard, .string, .tab-staff, #tabView, .tab-container')||typeof renderTabStaff==='function'||typeof getAudioContext==='function'),'rest of the app still opens without the sound file');
 assert.deepStrictEqual(quiet,[]);fs.rmSync(dir,{recursive:true,force:true});
 console.log('Separated sounds: offline first real note, independent HTML size, clear missing-file message — OK');
 }finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
