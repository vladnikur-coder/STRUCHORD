// Двойной клик по аккорду и паттерн D___ должны звучать одинаково.
// Ловим параметры, с которыми реально дёргаются струны, и сравниваем.
const fs=require('fs');const {JSDOM}=require('jsdom');
const dom=new JSDOM(fs.readFileSync('/home/user/STRUCHORD.html','utf8'),{
  runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/',
  beforeParse(w){w.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText:()=>({width:10}),
    clearRect(){},beginPath(){},arc(){},fill(){},stroke(){},moveTo(){},lineTo(){},closePath(){},
    save(){},restore(){},translate(){},rotate(){},fillText(){},strokeText(){},setTransform(){},scale(){},
    createLinearGradient:()=>({addColorStop(){}})});}});
const w=dom.window;
function node(){return{connect(){},disconnect(){},start(){},stop(){},
  gain:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){},linearRampToValueAtTime(){},cancelScheduledValues(){}},
  frequency:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}},
  Q:{value:0},pan:{value:0},type:'',buffer:null,onended:null,detune:{value:0}};}
w.AudioContext=w.webkitAudioContext=function(){return{
  currentTime:0,state:'running',sampleRate:44100,resume(){},destination:node(),
  createGain:node,createConvolver:node,createBufferSource:node,createBiquadFilter:node,
  createStereoPanner:node,createBuffer:(c,l)=>({getChannelData:()=>new Float32Array(l),length:l})};};

let bad=0;
const ok=(n,c,x)=>{console.log(`   ${c?'ok  ':'FAIL'} ${n}${!c&&x?' — '+x:''}`);if(!c)bad++;};

w.addEventListener('load',()=>{
  // перехватываем pluckString: он получает итоговые duration/gain
  w.eval(`
    window.__calls=[];
    const orig=pluckString;
    pluckString=function(ctx,opts){ window.__calls.push({d:opts.duration,g:opts.gain}); return orig(ctx,opts); };
  `);
  const grab=code=>{ w.eval('window.__calls=[]'); w.eval(code);
    return JSON.parse(w.eval('JSON.stringify(window.__calls)')); };

  w.eval("addSection('Verse'); sections[0].squares[0].events[0].chord='Am'; render();");

  console.log('=== Длительность звучания струны ===');
  const dbl = grab("playChord('Am', document.querySelector('.chord-wrapper'))");
  const sched = grab("playChordScheduled('Am', 0, 0.4, {key:'C'})");   // короткая ячейка!
  const patt = grab("strumChordDirectional(getAudioContext(), resolveFingeringShape('Am','C'),'Am','C',0,STRUM_RING_SECONDS,0.34,'down')");

  const d1=dbl[0]&&dbl[0].d, d2=sched[0]&&sched[0].d, d3=patt[0]&&patt[0].d;
  console.log('      двойной клик        :', d1, 'сек');
  console.log('      бой без паттерна    :', d2, 'сек  (ячейка была 0.4 сек)');
  console.log('      шаг паттерна D      :', d3, 'сек');

  ok('двойной клик = паттерн', d1===d3, `${d1} vs ${d3}`);
  ok('бой без паттерна = паттерн', d2===d3, `${d2} vs ${d3}`);
  ok('длительность не зависит от длины ячейки', d2===w.eval('STRUM_RING_SECONDS'),
     `dur=${d2}, ячейка 0.4`);

  console.log('\n=== Короткая ячейка на быстром темпе ===');
  const fast = grab("playChordScheduled('Am', 0, 0.2, {key:'C'})");
  console.log('      ячейка 0.2 сек -> звучание', fast[0].d, 'сек');
  ok('струна не обрывается на быстром темпе', fast[0].d>=1.0, fast[0].d+' сек');

  console.log('\n=== Все струны аккорда звучат одинаково долго ===');
  const uniq=[...new Set(dbl.map(c=>c.d))];
  ok('одна длительность на все струны', uniq.length===1, uniq.join(', '));

  console.log(bad?`\nПРОВАЛОВ: ${bad}`:'\nвсе проверки пройдены');
  if(bad) process.exitCode=1;
});
