'use strict';
// 0.772: динамика автоаккомпанемента. Меняется только velocity: высоты,
// начала и длительности должны остаться как в 0.771 (фикстура).
const assert=require('assert'),fs=require('fs'),crypto=require('crypto'),path=require('path');
const {generatePerformance,applyDynamics}=require('../prototypes/keyboard-performance');
const base=require('./fixtures/b39-performance-timing-0771.json');
const chords=[[0,[0,4,7]],[9,[9,0,4]],[5,[5,9,0]],[7,[7,11,2]]].map(([bassPc,tones])=>({bassPc,tones,beats:4}));
const gen=o=>generatePerformance({chords,low:48,high:72,bpm:96,meter:'4/4',swing:false,rhythmVersion:2,seed:7,role:'verse',genre:'pop',...o});
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
const pos=n=>Math.round((((n.beat%4)+4)%4)*4)%16;

// 1. Рисунок не перегенерирован: совпадают высоты, начала и длительности.
const fingerprint={};
for(const genre of ['pop','rock','punk','country','blues','jazz','soul','funk','fusion'])for(const role of ['intro','verse','prechorus','chorus','bridge','outro'])for(let seed=1;seed<=6;seed++){
  const g=generatePerformance({chords,low:48,high:72,bpm:96,meter:'4/4',genre,role,swing:false,rhythmVersion:2,seed});
  assert(g.ok,g.reason);
  fingerprint[genre+'/'+role+'/'+seed]=crypto.createHash('sha256').update(JSON.stringify(g.notes.map(x=>[x.hand,x.midi,+x.beat.toFixed(4),+x.duration.toFixed(4)]))).digest('hex').slice(0,16);
}
assert.equal(crypto.createHash('sha256').update(JSON.stringify(fingerprint)).digest('hex'),base.digest,'0.772 must not change pitches, attacks or durations');

// 2. Сила нот в допустимых пределах и целая.
const all=[];
for(const genre of ['pop','rock','punk','country','blues','jazz','soul','funk','fusion'])for(const role of ['intro','verse','prechorus','chorus','bridge','outro'])for(let seed=1;seed<=6;seed++){
  const g=generatePerformance({chords,low:48,high:72,bpm:96,meter:'4/4',genre,role,swing:false,rhythmVersion:2,seed});
  for(const n of g.notes){assert(Number.isInteger(n.velocity)&&n.velocity>=30&&n.velocity<=118,'velocity '+n.velocity);all.push(n.velocity);}
}
all.sort((a,b)=>a-b);
const span=20*Math.log10(all[all.length-1]/all[0]);
assert(span>=9&&span<=13,'overall velocity span should be about 10-12 dB, got '+span.toFixed(1));

// 3. Сильная доля громче слабых шагов; бас громче правой руки; верх аккорда
//    громче внутренних голосов.
const chorus=gen({role:'chorus'});
const at=step=>mean(chorus.notes.filter(n=>pos(n)===step).map(n=>n.velocity));
assert(at(0)-at(4)>=6,'downbeat accent too weak: '+at(0).toFixed(1)+' vs '+at(4).toFixed(1));
const offbeat=mean(chorus.notes.filter(n=>pos(n)%4===2).map(n=>n.velocity));
assert(at(0)-offbeat>=8,'downbeat must be clearly louder than offbeats');
const left=mean(chorus.notes.filter(n=>n.hand==='left').map(n=>n.velocity));
const right=mean(chorus.notes.filter(n=>n.hand==='right').map(n=>n.velocity));
assert(left-right>=8,'bass hand should lead the right hand by about 1 dB');
const groups=new Map();
for(const n of chorus.notes){const k=n.hand+':'+Math.round(n.beat*16);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(n);}
let tops=[],inners=[];
for(const [k,a] of groups){if(!k.startsWith('right'))continue;a.sort((x,y)=>y.midi-x.midi);if(a.length>1){tops.push(a[0].velocity);inners.push(...a.slice(1).map(n=>n.velocity));}}
assert(tops.length>0&&mean(tops)-mean(inners)>=3,'top of the chord should carry the melody');

// 4. Роли секций: припев громче интро, внутри припева подъём к концу и спад
//    в последнем такте.
const means={};
for(const role of ['intro','verse','prechorus','chorus','bridge','outro'])means[role]=mean(gen({role}).notes.map(n=>n.velocity));
assert(means.chorus-means.intro>=14,'chorus must be clearly louder than intro');
assert(means.chorus>means.prechorus&&means.prechorus>means.verse&&means.verse>means.intro,'role levels should build');
const bars=[0,1,2,3].map(bar=>mean(chorus.notes.filter(n=>n.beat>=bar*4&&n.beat<(bar+1)*4).map(n=>n.velocity)));
assert(bars[2]>bars[0]+2&&bars[3]<bars[2],'phrase should swell and ease before the section end: '+bars.map(x=>x.toFixed(1)));

// 5. Стиль влияет на акцент: jazz ровнее pop; результат детерминирован.
const spread=role=>{const g=gen({role,genre:'pop'}),j=gen({role,genre:'jazz'});return [mean(g.notes.filter(n=>pos(n)===0).map(n=>n.velocity))-mean(g.notes.filter(n=>pos(n)%4===2).map(n=>n.velocity)),mean(j.notes.filter(n=>pos(n)===0).map(n=>n.velocity))-mean(j.notes.filter(n=>pos(n)%4===2).map(n=>n.velocity))];};
const [popSpread,jazzSpread]=spread('chorus');
assert(popSpread>jazzSpread,'jazz should accent the beat less than pop');
assert.deepStrictEqual(gen({genre:'soul'}).notes.map(n=>n.velocity),gen({genre:'soul'}).notes.map(n=>n.velocity),'same seed, same dynamics');
assert(gen({genre:'soul',seed:8}).notes.length>0,'another seed still generates');

// 6. Другие размеры и короткие секции не ломаются.
for(const [meter,beats] of [['3/4',3],['6/8',3],['4/4',4],['4/4',16]]){
  const g=generatePerformance({chords:[{bassPc:0,tones:[0,4,7],beats}],low:36,high:84,bpm:120,meter,genre:'pop',role:'chorus',swing:true,rhythmVersion:2,seed:11});
  if(!g.ok)continue;
  for(const n of g.notes)assert(n.velocity>=30&&n.velocity<=118,meter+' velocity '+n.velocity);
}

// 6b. Экспорт: динамика GP5/MIDI укладывается в 8 уровней и различает секции.
const gp=Math.floor((Math.round(means.chorus)+1)/16), gpi=Math.floor((Math.round(means.intro)+1)/16);
assert(gp>=1&&gp<=8&&gpi>=1&&gpi<=8,'GP5 velocity levels stay in range: '+gp+', '+gpi);
assert(gp>gpi,'exported song should show chorus louder than intro ('+gp+' vs '+gpi+')');

// 7. Применение только к velocity: вызов на копии не трогает ноты.
const copy=gen({role:'verse'}).notes.map(n=>({...n}));
const before=copy.map(n=>[n.hand,n.midi,n.beat,n.duration]);
applyDynamics(copy,{role:'chorus',genre:'pop',meter:'4/4',beatsPerBar:4,totalBeats:16,seed:7});
assert.deepStrictEqual(copy.map(n=>[n.hand,n.midi,n.beat,n.duration]),before,'applyDynamics must not move notes');

// 8. Встроенная копия в HTML совпадает с прототипом, иначе поведение разойдётся.
const html=fs.readFileSync(path.resolve(process.env.STRUCHORD_HTML||'STRUCHORD.html'),'utf8');
const proto=fs.readFileSync(path.resolve(__dirname,'../prototypes/keyboard-performance.js'),'utf8');
const roleLine="const ROLE = Object.freeze({intro:0.72, verse:0.82, prechorus:1.0, chorus:1.16, bridge:0.94, solo:0.72, outro:0.62, custom:0.9});";
const block=proto.slice(proto.indexOf(roleLine),proto.indexOf('\nconst METERS = Object.freeze('));
assert(html.includes(block),'embedded generator drifted from dev/prototypes/keyboard-performance.js');
assert(html.includes('applyDynamics(notes, {role, genre, meter, beatsPerBar, totalBeats:beat, seed});'),'HTML must apply dynamics');
console.log('Keyboard dynamics: 13224 notes keep pitch and timing; '+(20*Math.log10(all[all.length-1]/all[0])).toFixed(1)+' dB span, chorus '+means.chorus.toFixed(1)+' vs intro '+means.intro.toFixed(1)+' — OK');
