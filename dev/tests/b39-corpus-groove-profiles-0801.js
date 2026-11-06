// B-39 0.801: empirical groove-profile integration tests; no browser/UI needed.
const fs=require('fs');
const assert=require('assert');
const html=fs.readFileSync('STRUCHORD.html','utf8');
const sourceProfiles=require('../audits/b39-corpus-groove-profiles.json');
const allowed=new Set(['pop','rock','punk','country','blues','jazz','soul','funk','fusion']);
assert.strictEqual(sourceProfiles.schema,1);
assert.strictEqual(sourceProfiles.sourceMidiFiles,23707);
assert.strictEqual(Object.keys(sourceProfiles.styleMap).length,109,'all audited folders represented');
assert(Object.values(sourceProfiles.styleMap).every(x=>allowed.has(x)),'all source folders route to a supported app genre');

const dataStart=html.indexOf('const CORPUS_PROFILES = ');
const dataEnd=html.indexOf(';\nfunction corpusProfileFor',dataStart);
assert(dataStart>=0&&dataEnd>dataStart,'embedded offline profile table exists');
const embedded=JSON.parse(html.slice(dataStart+'const CORPUS_PROFILES = '.length,dataEnd));
assert.deepStrictEqual(embedded,sourceProfiles.profiles,'runtime table matches the generated corpus descriptors');
assert(!html.slice(dataStart,dataEnd).includes('"notes"'),'raw note sequences are not embedded');
assert(html.includes('Number.isInteger(phraseSeed)?corpusProfileFor(genre,meter,role):null'),'only phraseModel plans with a valid song seed enter the profile path');
assert(html.includes('Math.max(-1,Math.min(1,Math.round(corpusProfile.r/6)))'),'register influence is bounded to one existing chord-tone index');

const moduleStart=html.indexOf('perf=(function(){let module={exports:{}},require=function(){return hand}');
const moduleEnd=html.indexOf('return module.exports;})(),section=',moduleStart);
assert(moduleStart>=0&&moduleEnd>moduleStart,'keyboard performance module found');
let expression=html.slice(moduleStart,moduleEnd+'return module.exports;})()'.length);
expression=expression.replace('return module.exports;})()','return {generatePerformance,corpusProfileFor,corpusGrooveIndex,CORPUS_PROFILES,GROOVES,GENRES,METERS};})()');
const perf=new Function('hand','return '+expression.slice('perf='.length))({
  planSequence:({chords})=>({ok:true,voices:chords.map(()=>({left:[36],right:[60,64,67],omitted:[]}))})
});
const roles=['intro','verse','prechorus','chorus','bridge','solo','outro','custom'];
const meters=['4/4','3/4','6/8'];
let profileDrivenChoices=0;
for(const genre of allowed){
 assert(perf.GENRES[genre],`generator supports ${genre}`);
 for(const meter of meters){
  assert(perf.METERS[meter],`generator supports ${meter}`);
  for(const role of roles){
   const p=perf.corpusProfileFor(genre,meter,role);
   assert(p&&Array.isArray(p.a)&&p.a.length===8,`${genre}/${meter}/${role} profile`);
   assert.strictEqual(p.a.reduce((a,b)=>a+b,0),100,`${genre}/${meter}/${role} phase weights sum to 100`);
   assert(p.d>=0.9&&p.d<=1.1,'density adjustment is bounded to ten percent');
   assert(p.v>=-4&&p.v<=4,'source velocity difference is bounded');
   assert(p.r>=-12&&p.r<=12,'role-relative register proxy is bounded to one octave');
   const p2=perf.corpusProfileFor(genre,meter,role);
   assert.deepStrictEqual(p,p2,'profile lookup is deterministic');
   const groove=perf.GROOVES[genre];
   const chosen=perf.corpusGrooveIndex(groove,p,2,meter);
   assert(Number.isInteger(chosen)&&chosen>=0&&chosen<groove.length,'profile selects an authored groove candidate');
   if(chosen!==2)profileDrivenChoices++;
  }
 }
}
assert(profileDrivenChoices>0,'empirical profiles can move selection away from the family default');
const chords=Array.from({length:4},()=>({bassPc:0,tones:[0,4,7],beats:4}));
const opts={chords,low:36,high:88,bpm:100,meter:'4/4',genre:'pop',role:'verse',swing:false,seed:123,phraseSeed:456,rhythmVersion:2};
const a=perf.generatePerformance(opts),b=perf.generatePerformance(opts);
assert(a.ok&&b.ok,'new phrase-model request generates');
assert.deepStrictEqual(a,b,'same phrase seed and section inputs are reproducible');
for(const note of a.notes){assert(Number.isInteger(note.midi)&&note.midi>=0&&note.midi<=127);assert(note.beat>=0&&note.duration>0&&note.beat+note.duration<=a.beats+1e-8);assert(note.velocity>=30&&note.velocity<=118);}
const legacy=perf.generatePerformance({...opts,phraseSeed:null});
assert(legacy.ok,'legacy plan without phraseSeed remains supported');
console.log('B-39 corpus groove profiles 0.801: 9 genres × 3 meters × 8 roles and full generation passed');
