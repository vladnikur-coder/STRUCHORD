'use strict';
// Browser data from the real application, analyzed by the isolated prototype.
// This does not assert application playback/export integration.
const assert=require('assert'),puppeteer=require('puppeteer');
const {formulaToChord,buildSection}=require('../prototypes/keyboard-section-adapter');
(async()=>{const browser=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/tmp/chromium',args:['--no-sandbox']});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewport({width:1440,height:900});await page.evaluateOnNewDocument(()=>localStorage.setItem('struchord-default-instrument','keys'));
 await page.goto(process.env.STRUCHORD_URL||'http://127.0.0.1:8024/STRUCHORD.html');
 const data=await page.evaluate(()=>{startNewSongFromHome();addSection('Verse');const T=StruChordTracks,id=T.state().activeTrackId,ranges=[];
   for(const size of [25,37,49,61,88]) {T.setTrackKeyboardSize(id,size);ranges.push(T.keyRange(id));}
   const roots=['C','Db','D','Eb','E','F','F#','G','Ab','A','Bb','B'],suffixes=['','m','7','m7','maj7','sus4','dim','aug','9','13'];
   const formulas=[];for(const root of roots)for(const suffix of suffixes){const name=root+suffix,formula=StruChordFormula.chordFormula(name,'C');if(formula)formulas.push({name,formula});}
   for(const name of ['C/E','Dm/F','G/B','C/F#']){const formula=StruChordFormula.chordFormula(name,'C');if(formula)formulas.push({name,formula});}
   return {ranges,formulas};
 });
 assert.strictEqual(data.ranges.length,5);assert(data.formulas.length>=100);
 let generated=0, failures=0;
 for(const range of data.ranges) for(const item of data.formulas) {
   const chord=formulaToChord(item.formula), original=item.formula.pitchClasses;
   assert(chord.tones.every(pc=>original.includes(pc)));
   const out=buildSection({cells:[{key:'1:1:0',beats:4,chord}],low:range.low,high:range.high,bpm:100,meter:'4/4',genre:'pop',role:'verse',swing:false,seed:1});
   if(!out.ok){failures++;continue;}generated++;
   for(const note of out.events['1:1:0']) {
     assert(note.midi>=range.low && note.midi<=range.high);
     assert(note.hand==='left' ? note.midi%12===chord.bassPc : original.includes(note.midi%12));
   }
 }
 assert(generated>=500, `unexpected feasibility ${generated}; failures ${failures}`);
 assert.deepStrictEqual(errors,[]);
 console.log(`Real formula inputs: ${generated} generated, ${failures} explicit failures across ${data.ranges.length} ranges; prototype only`);
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
