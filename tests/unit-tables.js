// Аудит базовых таблиц OPEN_CHORDS и CAGED_SHAPES по составу нот.
// Ловит ошибки, которые не видны глазом: терция в sus-аккорде, чистая
// квинта в aug, заглушённый корень. Одна такая ошибка в CAGED-шаблоне
// размножается на все 12 тональностей, поэтому проверка автоматическая.
const fs=require('fs');const {JSDOM}=require('jsdom');
const dom=new JSDOM(fs.readFileSync('/home/user/STRUCHORD.html','utf8'),{
  runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/',
  beforeParse(w){w.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText:()=>({width:10}),
    clearRect(){},beginPath(){},arc(){},fill(){},stroke(){},moveTo(){},lineTo(){},closePath(){},
    save(){},restore(){},translate(){},rotate(){},fillText(){},strokeText(){},setTransform(){},scale(){},
    createLinearGradient:()=>({addColorStop(){}})});}});
const w=dom.window;
w.AudioContext=w.webkitAudioContext=function(){return{currentTime:0,state:'running',resume(){}};};

const CH=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const OPEN=['E','A','D','G','B','E'];
const DEG={0:'1',1:'b9',2:'9',3:'b3',4:'3',5:'11',6:'b5',7:'5',8:'#5',9:'6',10:'b7',11:'7'};
// Ступени, недопустимые для типа: они меняют сам характер аккорда.
// (Отсутствие квинты в 7/6/9 — норма, её принято опускать, поэтому
// проверяем только ЛИШНИЕ ноты и наличие корня.)
const FORBID={maj:[3],m:[4],sus4:[3,4],sus2:[3,4],'5':[3,4],m7:[4],
  maj7:[3,10],'7':[3,11],m6:[4],'6':[3],dim:[4,7],aug:[7]};

let bad=0;
const ok=(n,c,x)=>{console.log(`   ${c?'ok  ':'FAIL'} ${n}${!c&&x?' — '+x:''}`);if(!c)bad++;};

w.addEventListener('load',()=>{
  console.log('=== OPEN_CHORDS ===');
  const open=JSON.parse(w.eval('JSON.stringify(OPEN_CHORDS)'));
  const openBad=[];
  for(const [name,shape] of Object.entries(open)){
    const m=name.match(/^([A-G][#b]?)(.*)$/); if(!m) continue;
    const type=w.eval(`detectBaseChordType(${JSON.stringify(m[2])})`);
    const forbid=FORBID[type]; if(!forbid) continue;
    const rootPc=CH.indexOf(w.eval(`toSharpNote('${m[1]}')`));
    const degs=new Set(), pressed=[];
    shape.forEach((v,s)=>{ if(v==='x')return;
      if(Number(v)>0)pressed.push(Number(v));
      degs.add(((CH.indexOf(OPEN[s])+Number(v))%12-rootPc+12)%12); });
    const wrong=[...degs].filter(d=>forbid.includes(d));
    const span=pressed.length?Math.max(...pressed)-Math.min(...pressed)+1:0;
    if(wrong.length) openBad.push(`${name}: чужая ступень ${wrong.map(d=>DEG[d])}`);
    else if(!degs.has(0)) openBad.push(`${name}: нет основного тона`);
    else if(span>4) openBad.push(`${name}: растяжка ${span}`);
  }
  console.log('      проверено форм:', Object.keys(open).length);
  ok('нет форм с чужими ступенями', openBad.length===0, openBad.join('; '));

  console.log('\n=== CAGED_SHAPES ===');
  const caged=JSON.parse(w.eval('JSON.stringify(CAGED_SHAPES)'));
  const cagedBad=[]; let count=0;
  for(const [type,list] of Object.entries(caged)){
    const forbid=FORBID[type]||[];
    list.forEach((t,i)=>{
      count++;
      const rootPc=(CH.indexOf(OPEN[t.rootStr])+t.rootFret)%12;
      const degs=new Set(), pressed=[];
      t.shape.forEach((v,s)=>{ if(v==='x')return;
        if(Number(v)>0)pressed.push(Number(v));
        degs.add(((CH.indexOf(OPEN[s])+Number(v))%12-rootPc+12)%12); });
      const wrong=[...degs].filter(d=>forbid.includes(d));
      const span=pressed.length?Math.max(...pressed)-Math.min(...pressed)+1:0;
      const label=`${type}#${i+1}`;
      if(wrong.length) cagedBad.push(`${label}: чужая ступень ${wrong.map(d=>DEG[d])}`);
      else if(!degs.has(0)) cagedBad.push(`${label}: нет основного тона`);
      else if(span>4) cagedBad.push(`${label}: растяжка ${span}`);
      // rootStr/rootFret — это лишь ОПОРА для расчёта сдвига по грифу;
      // корень не обязан звучать именно на этой струне (в m#1 и m6#3 он
      // берётся на другой). Достаточно, чтобы основной тон был в форме —
      // это уже проверено выше через degs.has(0).
    });
  }
  console.log('      проверено шаблонов:', count);
  ok('нет шаблонов с дефектами', cagedBad.length===0, cagedBad.join('; '));

  console.log('\n=== Выдача: топ-3 без чужих нот ===');
  const cases=[['Caug',[0,4,8]],['Eaug',[0,4,8]],['Aaug',[0,4,8]],['Esus2',[0,2,7]],
    ['Csus2',[0,2,7]],['Csus4',[0,5,7]],['Cm6',[0,3,7,9]],['Cmaj7',[0,4,7,11]]];
  const dirty=[];
  cases.forEach(([chord,want])=>{
    const root=chord.match(/^([A-G][#b]?)/)[1];
    const rootPc=CH.indexOf(root);
    const top=JSON.parse(w.eval(`(function(){const v=getFingeringVariants('${chord}','C');
      return v?JSON.stringify(v.shapes.slice(0,3).map(s=>s.join(','))):'[]';})()`));
    top.forEach((s,i)=>{
      const degs=s.split(',').map((v,idx)=>v==='x'?null:
        ((CH.indexOf(OPEN[idx])+Number(v))%12-rootPc+12)%12).filter(d=>d!==null);
      const extra=[...new Set(degs)].filter(d=>!want.includes(d));
      if(extra.length) dirty.push(`${chord} #${i+1}: ${extra.map(d=>DEG[d])}`);
    });
  });
  ok('в топ-3 нет чужих ступеней', dirty.length===0, dirty.join('; '));

  console.log(bad?`\nПРОВАЛОВ: ${bad}`:'\nвсе проверки пройдены');
  if(bad) process.exitCode=1;
});
