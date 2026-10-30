'use strict';
const assert=require('assert'),puppeteer=require('puppeteer');
(async()=>{const b=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/tmp/chromium',args:['--no-sandbox']});try{
 const p=await b.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:1440,height:900});
 await p.evaluateOnNewDocument(()=>localStorage.setItem('struchord-default-instrument','keys'));await p.goto(process.env.STRUCHORD_URL||'http://127.0.0.1:8000/STRUCHORD.html');
 const result=await p.evaluate(()=>{let A=StruChordAccomp,Auto=StruChordAuto,bad=[],count=0;const genres=A.styles().map(x=>x.id),types=['Intro','Verse','PreChorus','Chorus','Bridge','Solo','Outro','Custom'];
  for(const g of genres)for(const second of [null,...genres.filter(x=>x!==g)])for(const type of types)for(const ts of ['4/4','3/4','6/8']){
   let sec={id:1,type,timeSig:ts},prev=Auto.makePattern(sec,g,second,{previous:{autoSwing:true,swing:false},variation:0});
   for(let v=1;v<=4;v++){let next=Auto.makePattern(sec,g,second,{previous:prev,variation:v%4,forceChange:true});if(!next || next.swing!==false || !A.normalize(next) || JSON.stringify(prev.steps)===JSON.stringify(next.steps))bad.push({g,second,type,ts,v});prev=next;count++;}
  }return{bad,count};});
 assert.equal(result.count,7776);assert.deepStrictEqual(result.bad,[]);assert.deepStrictEqual(errors,[]);console.log('Auto variation: 7776 successive editable variations preserve overrides and pass validation — OK');
 }finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
