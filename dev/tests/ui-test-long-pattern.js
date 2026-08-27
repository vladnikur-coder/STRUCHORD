// Рисунок ДЛИННЕЕ такта («на два такта вперёд»): вторая половина обязана
// реально звучать, а не отбрасываться планировщиком.
const fs=require('fs');const {JSDOM}=require('jsdom');
const dom=new JSDOM(fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8'),{
  runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/',
  beforeParse(w){w.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText:()=>({width:10}),
    clearRect(){},beginPath(){},arc(){},fill(){},stroke(){},moveTo(){},lineTo(){},closePath(){},
    save(){},restore(){},translate(){},rotate(){},fillText(){},strokeText(){},setTransform(){},scale(){},
    createLinearGradient:()=>({addColorStop(){}})});}});
const w=dom.window;
w.AudioContext=w.webkitAudioContext=function(){return{currentTime:0,state:'running',resume(){}};};
let bad=0;
const ok=(n,c,x)=>{console.log(`   ${c?'ok  ':'FAIL'} ${n}${!c&&x?' — '+x:''}`);if(!c)bad++;};

w.addEventListener('load',()=>{
  const d=w.document;
  const click=el=>el.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  w.eval("addSection('Verse'); render();");
  const secId=w.eval('sections[0].id');

  console.log('=== 1. В списке длин есть значения больше такта ===');
  w.eval(`openStrumPatternEditor('section', ${secId})`);
  const btns=[...d.querySelectorAll('#patternBaseBtns button')].map(b=>+b.textContent);
  console.log('      доступно:', btns.join(', '), '| такт = 4 доли, квадрат = 16');
  ok('есть 8 (два такта)', btns.includes(8), btns.join(','));
  ok('есть делители 1,2,4', [1,2,4].every(n=>btns.includes(n)));
  // Потолок — два такта: длиннее рисунок не читается как единый жест.
  ok('потолок — два такта (8)', Math.max(...btns)===8, btns.join(','));
  ok('нет 12 и 16', !btns.includes(12) && !btns.includes(16), btns.join(','));

  console.log('\n=== 2. Выбор длины 8 ===');
  click([...d.querySelectorAll('#patternBaseBtns button')].find(b=>b.textContent==='8'));
  const cells=d.querySelectorAll('.pattern-step-btn').length;
  console.log('      ячеек:', cells, '| подпись:', JSON.stringify(d.getElementById('patternBaseNote').textContent));
  ok('сетка на 8 долей', cells===16, cells+' (ожидалось 16 при sub=2)');
  ok('подпись про два такта', /вперёд/.test(d.getElementById('patternBaseNote').textContent));
  // Длинный рисунок раскладывается по тактам в ряды, а не уезжает в
  // горизонтальную прокрутку.
  const grid=d.getElementById('patternGrid');
  ok('включён режим рядов', grid.classList.contains('pattern-grid--rows'), grid.className);
  ok('колонок = долей в такте', grid.style.getPropertyValue('--pattern-cols')==='4',
     grid.style.getPropertyValue('--pattern-cols'));

  console.log('\n=== 3. Разный рисунок в двух половинах ===');
  const steps=[...d.querySelectorAll('.pattern-step-btn')];
  const setTo=(el,sign)=>{for(let i=0;i<5&&el.textContent!==sign;i++)click(el);};
  setTo(steps[0],'↓');                 // такт 1: удар в начале
  setTo(steps[8],'↓'); setTo(steps[10],'×');   // такт 2: с глушением
  click(d.querySelector('#save-pattern'));
  const saved=JSON.parse(w.eval('JSON.stringify(sections[0].strumPattern)'));
  console.log('      сохранено:', saved.steps.map(x=>x||'_').join(''));
  ok('длина 16 сохранена', saved.steps.length===16, saved.steps.length+'');
  ok('половины различаются',
     saved.steps.slice(0,8).join()!==saved.steps.slice(8).join());

  console.log('\n=== 4. Вторая половина реально звучит ===');
  // getSlicedPatternForEvent показывает, что достанется каждой ячейке
  const slices=w.eval(`(function(){
    const sec=sections[0], sq=sec.squares[0];
    return JSON.stringify(sq.events.map((ev,i)=>{
      const r=getSlicedPatternForEvent(sec,sq,ev,i);
      return r?r.steps.map(x=>x||'_').join(''):'ОТБРОШЕН';
    }));})()`);
  const arr=JSON.parse(slices);
  arr.forEach((s2,i)=>console.log('      ячейка '+(i+1)+': '+s2));
  ok('ни одна ячейка не отброшена', !arr.includes('ОТБРОШЕН'));
  ok('ячейки 1 и 2 получили РАЗНОЕ', arr[0]!==arr[1], arr[0]+' vs '+arr[1]);
  ok('глушение из 2-го такта дошло', arr.some(x=>x.includes('X')), arr.join(' | '));

  console.log('\n=== 5. Обычные рисунки не сломались ===');
  w.eval(`sections[0].strumPattern={mode:'strum',subdivision:2,steps:['D',null,'D','U',null,'U','D','U']};`);
  const norm=w.eval(`(function(){
    const sec=sections[0], sq=sec.squares[0];
    const r=getSlicedPatternForEvent(sec,sq,sq.events[0],0);
    return r?r.steps.map(x=>x||'_').join(''):'ОТБРОШЕН';})()`);
  console.log('      рисунок на такт:', norm);
  ok('обычный паттерн принят', norm!=='ОТБРОШЕН');

  console.log(bad?`\nПРОВАЛОВ: ${bad}`:'\nвсе проверки пройдены');
  if(bad) process.exitCode=1;
});
