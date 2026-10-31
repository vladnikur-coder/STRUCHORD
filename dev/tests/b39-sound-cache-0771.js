'use strict';
// 0.771: the offline cache must include the separate sound file.
const assert=require('assert'),puppeteer=require('puppeteer');
(async()=>{const b=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/tmp/chromium',args:['--no-sandbox']});try{
 const p=await b.newPage();await p.goto(process.env.STRUCHORD_URL||'http://127.0.0.1:8028/STRUCHORD.html',{waitUntil:'load'});
 await p.evaluate(()=>navigator.serviceWorker.ready);await p.waitForFunction(async()=>{const keys=await caches.keys();if(!keys.length)return false;const c=await caches.open(keys[0]);return !!(await c.match('./keyboard-sounds.js'))&&!!(await c.match('./STRUCHORD.html'))},{timeout:30000});
 const info=await p.evaluate(async()=>{const keys=await caches.keys(),c=await caches.open(keys[0]);return {name:keys[0],sounds:(await c.match('./keyboard-sounds.js')).headers.get('content-type'),size:(await (await c.match('./keyboard-sounds.js')).arrayBuffer()).byteLength}});
 assert(info.name==='struchord-v771','cache name follows the release');assert(info.size>10_000_000,'sound file fully cached, '+info.size);
 console.log('Offline cache: '+info.name+' stores the 10 MB sound file next to the app — OK');
 }finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
