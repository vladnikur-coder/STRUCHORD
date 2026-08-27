// Редактор боя в размерах со знаменателем 8: нумерация должна следовать
// группировке (6/8 = две доли по три восьмых), а номера — стоять у
// НАЧАЛА доли, а не по её центру.
const fs=require('fs');const {JSDOM}=require('jsdom');
const dom=new JSDOM(fs.readFileSync('/home/user/STRUCHORD.html','utf8'),{
  runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/',
  beforeParse(w){w.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText:()=>({width:10}),
    clearRect(){},beginPath(){},arc(){},fill(){},stroke(){},moveTo(){},lineTo(){},closePath(){},
    save(){},restore(){},translate(){},rotate(){},fillText(){},strokeText(){},setTransform(){},scale(){},
    createLinearGradient:()=>({addColorStop(){}})});}});
const w=dom.window;
w.AudioContext=w.webkitAudioContext=function(){return{currentTime:0,state:'running',resume(){}};};
let bad=0;
const ok=(n,c,x)=>{console.log(`   ${c?'ok  ':'FAIL'} ${n}${!c&&x?' — '+x:''}`);if(!c)bad++;};
// Номера ДОЛЕЙ — первая подпись в каждой группе. Остальные подписи в
// группе это дробления («и», «та»), их сюда мешать нельзя: с тех пор
// как в редакторе появился полный счёт «1 та и та», сбор всех подряд
// давал «1 и 2 и ...» вместо «1 2 3 4».
const nums=d=>[...d.querySelectorAll('.pattern-beat-group')]
  .map(g=>{const n=g.querySelector('.pattern-beat-number');return n?n.textContent:'';})
  .join(' ');
// Полный счёт, как его видит человек: все подписи подряд.
const fullCount=d=>[...d.querySelectorAll('.pattern-beat-number')]
  .map(e=>e.textContent).filter(Boolean).join(' ');

w.addEventListener('load',()=>{
  const d=w.document;
  const openIn=(ts)=>{
    const c=d.querySelector('#cancel-pattern'); if(c) c.click();
    w.eval(`sections=[]; globalTimeSig='${ts}'; addSection('Verse'); render();`);
    const id=w.eval('sections[0].id');
    w.eval(`openStrumPatternEditor('section', ${id})`);
  };

  console.log('=== 1. Номер по центру первой ноты доли ===');
  openIn('4/4');
  const grp=d.querySelector('.pattern-beat-group');
  const align=w.getComputedStyle(grp).alignItems;
  console.log('      align-items группы:', align);
  ok('группа выровнена по левому краю', align==='flex-start', align);
  // Номер шириной с ячейку и центрирован — иначе цифра прижмётся к краю
  // ячейки, а не встанет над её серединой.
  const numEl=d.querySelector('.pattern-beat-number');
  const cellEl=d.querySelector('.pattern-step-btn');
  const ns=w.getComputedStyle(numEl), cs=w.getComputedStyle(cellEl);
  console.log('      ширина номера:', ns.width, '| ширина ячейки:', cs.width,
              '| text-align:', ns.textAlign);
  ok('ширина номера = ширине ячейки', ns.width===cs.width, `${ns.width} vs ${cs.width}`);
  ok('текст центрирован', ns.textAlign==='center', ns.textAlign);

  console.log('\n=== 2. Простой размер 4/4 — сквозная нумерация ===');
  console.log('      номера:', nums(d));
  ok('1 2 3 4', nums(d)==='1 2 3 4', nums(d));

  console.log('\n=== 2б. Полный счёт под ячейками ===');
  // Под каждой ячейкой своя подпись, а не одна цифра на долю: при
  // дроблении иначе не видно, куда попадает вторая-четвёртая ячейка.
  // Слова те же, что на дорожке ритма в ленте (countLabelFor).
  const sub2=d.querySelector('.pattern-sub-btn[data-sub="2"]');
  if(sub2){sub2.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));}
  console.log('      восьмые:', fullCount(d));
  ok('дробление на 2 даёт «1 и 2 и»', /^1 и 2 и/.test(fullCount(d)), fullCount(d));
  const sub4=d.querySelector('.pattern-sub-btn[data-sub="4"]');
  if(sub4){sub4.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));}
  console.log('      шестнадцатые:', fullCount(d));
  ok('дробление на 4 даёт «1 та и та»', /^1 та и та 2 та и та/.test(fullCount(d)), fullCount(d));
  const perCell=[...d.querySelectorAll('.pattern-beat-group')]
    .every(g=>g.querySelectorAll('.pattern-beat-number').length===g.querySelectorAll('.pattern-step-btn').length);
  ok('подписей столько же, сколько ячеек', perCell);
  const sub1=d.querySelector('.pattern-sub-btn[data-sub="1"]');
  if(sub1){sub1.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));}

  console.log('\n=== 3. Составной 6/8 — две доли по три восьмых ===');
  openIn('6/8');
  console.log('      единиц сетки:', d.querySelectorAll('.pattern-beat-group').length);
  console.log('      номера:', nums(d));
  ok('нумерация по группам «1 · · 2 · ·»', nums(d)==='1 · · 2 · ·', nums(d));
  const strong=[...d.querySelectorAll('.pattern-beat-number.is-group-start')].length;
  ok('сильные доли выделены', strong===2, strong+'');

  console.log('\n=== 4. Составной 9/8 — три доли ===');
  openIn('9/8');
  console.log('      номера:', nums(d));
  ok('«1 · · 2 · · 3 · ·»', nums(d)==='1 · · 2 · · 3 · ·', nums(d));

  console.log('\n=== 5. Составной 12/8 — четыре доли ===');
  openIn('12/8');
  console.log('      номера:', nums(d));
  ok('четыре сильные доли',
     [...d.querySelectorAll('.pattern-beat-number.is-group-start')].length===4);

  console.log('\n=== 6. 7/8 — НЕ составной, нумерация сквозная ===');
  openIn('7/8');
  console.log('      составной:', w.eval("isCompoundMeter('7/8')"));
  console.log('      номера:', nums(d));
  ok('1..7 без группировки', nums(d)==='1 2 3 4 5 6 7', nums(d));

  console.log('\n=== 7. Длинный рисунок: нумерация повторяется по тактам ===');
  openIn('6/8');
  const btn12=[...d.querySelectorAll('#patternBaseBtns button')].find(b=>b.textContent==='12');
  if(btn12){
    btn12.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
    console.log('      номера на 2 такта:', nums(d));
    ok('нумерация начинается заново', nums(d)==='1 · · 2 · · 1 · · 2 · ·', nums(d));
  } else {
    console.log('      (кнопки 12 нет — потолок два такта, пропускаем)');
    ok('пропущено', true);
  }

  console.log(bad?`\nПРОВАЛОВ: ${bad}`:'\nвсе проверки пройдены');
  if(bad) process.exitCode=1;
});
