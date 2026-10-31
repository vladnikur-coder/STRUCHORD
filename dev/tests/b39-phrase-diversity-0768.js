'use strict';
const assert=require('assert');
const {generatePerformance,GENRES}=require('../prototypes/keyboard-performance');
const base={chords:[{bassPc:0,tones:[0,4,7],beats:16}],low:36,high:96,bpm:100,meter:'4/4',role:'intro',swing:false,rhythmVersion:2};
function rhythm(notes,bar){return [...new Set(notes.filter(n=>n.hand==='right' && Math.floor(n.beat/4)===bar).map(n=>Math.round((n.beat-bar*4)*4)))].sort((a,b)=>a-b).join(',');}
let genres=new Set(),count=0;
for(const genre of Object.keys(GENRES)){
 const examples=new Set();let changing=0;
 for(let seed=1;seed<=40;seed++){
  const x=generatePerformance({...base,genre,seed});assert(x.ok,genre+seed);
  assert(x.notes.some(n=>n.beat>=4 && n.beat<8),`long intro must continue beyond beat 4: ${genre}/${seed}`);
  const bars=[0,1,2,3].map(b=>rhythm(x.notes,b));if(new Set(bars).size>1)changing++;
  examples.add(bars.join('|'));
  for(const n of x.notes){assert(n.beat>=0 && n.beat+n.duration<=16+1e-8);let sounding=x.notes.filter(z=>z.hand===n.hand && z.beat<=n.beat && n.beat<z.beat+z.duration-1e-9);assert(sounding.length<=(n.hand==='left'?1:4));}
  count++;
 }
 assert(examples.size>=12,`${genre} needs more than tiny variations`);assert(changing>=25,`${genre} phrases should usually develop across bars`);genres.add([...examples].sort().join(';'));
}
assert.equal(genres.size,9);
for(const meter of ['3/4','6/8'])for(const genre of Object.keys(GENRES))for(let seed=0;seed<10;seed++){
 const p=generatePerformance({...base,meter,genre,seed,chords:[{bassPc:0,tones:[0,4,7],beats:12}]});assert(p.ok);assert(p.notes.some(n=>n.beat>=3));
}
const o={...base,genre:'pop',seed:1};const old=generatePerformance({...o,rhythmVersion:1}),implicit=generatePerformance({...o,rhythmVersion:undefined});assert.deepStrictEqual(old,implicit,'unversioned saved sections keep old algorithm');
console.log(`Phrase variation: ${count} long-intro cases, 9 genres, 3 metres, legacy deterministic playback — OK; not a listening or pianist assessment`);
