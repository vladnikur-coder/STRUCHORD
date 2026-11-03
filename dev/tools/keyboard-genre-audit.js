'use strict';
// Aggregate-only measurements. No MIDI phrases are copied or saved.
// Usage: node dev/tools/keyboard-genre-audit.js /path/to/licensed/MIDI
const fs=require('fs'),path=require('path'),{parseMidi}=require('midi-file');
const {generatePerformance,GENRES}=require('../prototypes/keyboard-performance');
const root=process.argv[2];if(!root)throw Error('Supply the MIDI directory');
function files(p){return fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(p,e.name)):/\.midi?$/i.test(e.name)?[path.join(p,e.name)]:[]);}
// Count unique quantised onset masks only, within a single common collection.
const sample=files(root).filter(f=>path.basename(path.dirname(f))==='4#4_90_G');let variations=new Set();
for(const f of sample){const midi=parseMidi(fs.readFileSync(f)),att=[];for(const tr of midi.tracks){let t=0;for(const e of tr){t+=e.deltaTime;if(e.type==='noteOn'&&e.velocity>0)att.push(Math.round(t/midi.header.ticksPerBeat*4));}}att.sort((a,b)=>a-b);variations.add([...new Set(att)].join(','));}
const chords=[[0,[0,4,7]],[9,[9,0,4]],[5,[5,9,0]],[7,[7,11,2]]].map(([bassPc,tones])=>({bassPc,tones,beats:4}));
const results={};for(const genre of Object.keys(GENRES)){let attacks=0,off=0,duration=0,noteCount=0;const phase=Array(16).fill(0),masks=new Set();
 for(let seed=1;seed<=64;seed++){const g=generatePerformance({chords,low:36,high:96,bpm:90,meter:'4/4',genre,role:'verse',swing:false,seed});if(!g.ok)throw Error(g.reason);const groups=new Set();for(const n of g.notes.filter(n=>n.hand==='right')){noteCount++;duration+=n.duration;groups.add(Math.round(n.beat*4));}const slots=[...groups].sort((a,b)=>a-b);masks.add(slots.join(','));for(const slot of slots){attacks++;phase[slot%16]++;if(slot%4!==0)off++;}}
 results[genre]={uniqueMasks:masks.size,gesturesPerBar:+(attacks/64/4).toFixed(2),offbeatShare:+(off/attacks).toFixed(3),avgNoteBeats:+(duration/noteCount).toFixed(3),phase:phase.map(v=>+(v/64/4).toFixed(3))};}
let pairs=[];const names=Object.keys(results);for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++){const a=results[names[i]].phase,b=results[names[j]].phase;const d=Math.sqrt(a.reduce((n,v,k)=>n+(v-b[k])**2,0));pairs.push({genres:[names[i],names[j]],rhythmDistance:+d.toFixed(3)});}pairs.sort((a,b)=>a.rhythmDistance-b.rhythmDistance);
console.log(JSON.stringify({midi:{sampleFiles:sample.length,uniqueOnsetMasks:variations.size,note:'Aggregate rhythm masks, not genre labels or stylistic proof'},generated:{settings:'C–Am–F–G, 4/4, 90 BPM, verse, 64 seeds per genre',results,nearest:pairs.slice(0,5),mostDifferent:pairs.slice(-5)}},null,2));
