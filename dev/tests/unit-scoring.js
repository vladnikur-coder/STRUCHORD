// Скоринг аппликатур: порядок выдачи должен совпадать с тем, что реально
// играют гитаристы. Отдельно — слэш-аккорды: у них бас обязан быть указанным
// в имени, иначе звучит другой аккорд.
const fs=require('fs');const {JSDOM}=require('jsdom');
const dom=new JSDOM(fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8'),{
  runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/',
  beforeParse(w){w.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText:()=>({width:10}),
    clearRect(){},beginPath(){},arc(){},fill(){},stroke(){},moveTo(){},lineTo(){},closePath(){},
    save(){},restore(){},translate(){},rotate(){},fillText(){},strokeText(){},setTransform(){},scale(){},
    createLinearGradient:()=>({addColorStop(){}})});}});
const w=dom.window;
w.AudioContext=w.webkitAudioContext=function(){return{currentTime:0,state:'running',resume(){}};};
const CH=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'],OPEN=['E','A','D','G','B','E'];
const bassOf=s=>{const a=s.split(','),i=a.findIndex(v=>v!=='x');
  return CH[(CH.indexOf(OPEN[i])+Number(a[i]))%12];};
let bad=0;
const ok=(n,c,x)=>{console.log(`   ${c?'ok  ':'FAIL'} ${n}${!c&&x?' — '+x:''}`);if(!c)bad++;};

w.addEventListener('load',()=>{
  console.log('=== 1. Эталонная аппликатура первой ===');
  // Таблица обновлена 2026-08-13 по калибровке с гитаристом (35 пар
  // «что удобнее», см. README и dev/tools/probe-comfort-pairs.js).
  // Отличия от старой таблицы — прямые следствия самих пар:
  //  B: 7,9,9,8,7,7 — как в паре Bb, где 6,8,8,7,6,6 > x,1,3,3,3,1
  //     (мажорная A-форма с плоским безымянным хуже E-формы выше);
  //  Cm/C#m: E-форма выше — тот же принцип (баррэ на 3–4 ладу туже);
  //  Bm7: x,2,0,2,0,2 — открытая полная форма легче Em7-повторения;
  //  Bm остался x,2,4,4,3,2: пара «Bm чуть лучше 7,9,9,7,7,7».
  // Уточнённая волна-4 (тот же день): стена «open вперёд» оставлена
  //  (его вопрос «действительно 8,7,5,0,5,6 нужно показывать раньше,
  //  чем x,3,2,3,1,0?» — нет), поэтому G снова 3,2,0,0,3,3, а Bm —
  //  x,2,4,4,3,2; снята только фора caged в общем пуле (на первые
  //  места этой таблицы она не влияла, кроме E6 вне таблицы).
  const GT={'C':'x,3,2,0,1,0','G':'3,2,0,0,3,3','D':'x,x,0,2,3,2','A':'x,0,2,2,2,0',
    'E':'0,2,2,1,0,0','Am':'x,0,2,2,1,0','Em':'0,2,2,0,0,0','Dm':'x,x,0,2,3,1',
    'E7':'0,2,0,1,0,0','A7':'x,0,2,0,2,0','D7':'x,x,0,2,1,2','G7':'3,2,0,0,0,1',
    'F':'1,3,3,2,1,1','Bm':'x,2,4,4,3,2','B':'7,9,9,8,7,7','Fm':'1,3,3,1,1,1',
    'Bb':'6,8,8,7,6,6','C#m':'9,11,11,9,9,9','F#m':'2,4,4,2,2,2','Cm':'8,10,10,8,8,8',
    'Bm7':'x,2,0,2,0,2','F#m7':'2,4,2,2,2,2'};
  let hit=0,n=0;
  for(const [c,want] of Object.entries(GT)){
    const first=w.eval(`getFingeringVariants('${c}','C').shapes[0].join(',')`);
    n++; if(first===want)hit++; else console.log('      '+c+': '+first+' вместо '+want);
  }
  console.log('      совпало: '+hit+'/'+n);
  ok('не меньше 90% попаданий', hit/n>=0.9, Math.round(100*hit/n)+'%');

  console.log('\n=== 2. Слэш-аккорды: бас из имени ===');
  [['G/B','B'],['D/F#','F#'],['C/E','E'],['C/G','G'],['Am/C','C'],['F/A','A'],['D/A','A']].forEach(([c,want])=>{
    const arr=JSON.parse(w.eval(`(function(){const v=getFingeringVariants('${c}','C');
      return v?JSON.stringify(v.shapes.slice(0,5).map(s=>s.join(','))):'[]';})()`));
    if(!arr.length){ok(c+' даёт варианты',false);return;}
    const wrong=arr.filter(s=>bassOf(s)!==want).length;
    ok(c+': бас '+want+' во всех топ-5', wrong===0,
       'неверных '+wrong+', первый бас '+bassOf(arr[0]));
  });

  console.log('\n=== 3. Скоринг различает удобное и неудобное ===');
  const sc=(shape,chord)=>w.eval(`(function(){const n=getChordNotes('${chord}',getKeyStyle('C'))||[];
    return Math.round(scoreShape(${JSON.stringify(shape)},n,n[0].replace(/\\d+$/,''),null));})()`);
  const open=sc(['x',0,2,2,1,0],'Am'), barre5=sc([5,7,7,5,5,5],'Am'),
        barre12=sc([12,14,14,12,12,12],'Am'), holes=sc([0,'x',2,'x',1,'x'],'Am');
  console.log(`      открытая ${open} > баррэ5 ${barre5} > баррэ12 ${barre12}; с дырками ${holes}`);
  ok('открытая лучше баррэ', open>barre5);
  ok('низкая позиция лучше высокой', barre5>barre12);
  ok('форма с дырками штрафуется', open>holes);

  console.log('\n=== 4. Штраф за чужой бас работает ===');
  const s1=w.eval(`(function(){const n=getChordNotes('G',getKeyStyle('C'))||[];
    return Math.round(scoreShape([3,2,0,0,3,3],n,'G','B'));})()`);
  const s2=w.eval(`(function(){const n=getChordNotes('G',getKeyStyle('C'))||[];
    return Math.round(scoreShape(['x',2,0,0,3,3],n,'G','B'));})()`);
  ok('форма с нужным басом оценена выше', s2>s1, `бас G: ${s1}, бас B: ${s2}`);

  console.log(bad?`\nПРОВАЛОВ: ${bad}`:'\nвсе проверки пройдены');
  if(bad) process.exitCode=1;
});
