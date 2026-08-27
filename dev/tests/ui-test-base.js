// Длина рисунка (аналог base у пресетов): можно набрать короткий кусок,
// он повторится внутри такта. Ключевое — что плеер его принимает, а не
// откатывается на обычный бой.
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
  w.eval(`openStrumPatternEditor('section', ${secId})`);

  console.log('=== 1. Кнопки длины ===');
  const btns=[...d.querySelectorAll('#patternBaseBtns button')].map(b=>b.textContent);
  console.log('      доступно:', btns.join(', '), '(такт 4/4)');
  // Делители такта — рисунок повторяется внутри него; кратные —
  // рисунок длиннее такта (см. ui-test-long-pattern.js).
  ok('есть делители такта 1,2,4', ['1','2','4'].every(n=>btns.includes(n)), btns.join(','));
  ok('по умолчанию выбрана полная длина',
     d.querySelector('#patternBaseBtns .active').textContent==='4');

  console.log('\n=== 2. Смена длины на 2 ===');
  click([...d.querySelectorAll('#patternBaseBtns button')].find(b=>b.textContent==='2'));
  const cells=d.querySelectorAll('.pattern-step-btn').length;
  console.log('      ячеек в сетке:', cells, '(было 8 при sub=2)');
  ok('сетка укоротилась вдвое', cells===4, cells+'');
  console.log('      подпись:', JSON.stringify(d.getElementById('patternBaseNote').textContent));
  ok('показано число повторов', /× 2/.test(d.getElementById('patternBaseNote').textContent));

  console.log('\n=== 3. Рисунок сохраняется развёрнутым ===');
  // набираем D _ D U на 2 доли
  const steps=[...d.querySelectorAll('.pattern-step-btn')];
  const setTo=(el,sign)=>{for(let i=0;i<5&&el.textContent!==sign;i++)click(el);};
  setTo(steps[0],'↓'); setTo(steps[2],'↓'); setTo(steps[3],'↑');
  click(d.querySelector('#save-pattern'));
  const saved=JSON.parse(w.eval('JSON.stringify(sections[0].strumPattern)'));
  console.log('      steps:', saved.steps.map(x=>x||'_').join(''));
  ok('длина = такт × sub', saved.steps.length===8, saved.steps.length+'');
  ok('кусок повторён дважды',
     saved.steps.slice(0,4).join(',')===saved.steps.slice(4).join(','),
     saved.steps.join(','));

  console.log('\n=== 4. Плеер НЕ отбрасывает такой паттерн ===');
  // getSlicedPatternForEvent возвращает null, если длина не совпала с тактом
  const sliced=w.eval(`(function(){
    const sec=sections[0], sq=sec.squares[0];
    const r=getSlicedPatternForEvent(sec,sq,sq.events[0],0);
    return r?JSON.stringify(r.steps):'null';})()`);
  console.log('      срез для ячейки:', sliced);
  ok('паттерн принят плеером', sliced!=='null');

  console.log('\n=== 5. Повторное открытие показывает КУСОК ===');
  w.eval(`openStrumPatternEditor('section', ${secId})`);
  const cells2=d.querySelectorAll('.pattern-step-btn').length;
  const active=d.querySelector('#patternBaseBtns .active').textContent;
  console.log('      ячеек:', cells2, '| активная длина:', active);
  ok('открылся короткий рисунок, а не 2 копии', cells2===4 && active==='2',
     `ячеек ${cells2}, длина ${active}`);

  console.log('\n=== 6. Ячейка: длина берётся от её span ===');
  w.eval('document.querySelector("#cancel-pattern").click()');
  const sqId=w.eval('sections[0].squares[0].id');
  w.eval(`openStrumPatternEditor('event', ${secId}, ${sqId}, 0)`);
  const spanOf=w.eval('sections[0].squares[0].events[0].span');
  const bs=[...d.querySelectorAll('#patternBaseBtns button')].map(b=>+b.textContent);
  console.log('      span ячейки:', spanOf, '| кнопки:', bs.join(','));
  // Для ячейки длиннее её span уходить некуда — только делители.
  ok('предложены делители span', bs.every(n=>spanOf%n===0)&&bs.includes(spanOf), bs.join(','));

  console.log('\n=== 7. Единственный вариант — строка прячется ===');
  w.eval('document.querySelector("#cancel-pattern").click()');
  // ячейка в 1 долю: делитель только один
  w.eval('sections[0].squares[0].events[0].span=1; render();');
  w.eval(`openStrumPatternEditor('event', ${secId}, ${sqId}, 0)`);
  const row=d.getElementById('patternBaseRow');
  console.log('      кнопок:', d.querySelectorAll('#patternBaseBtns button').length,
              '| display:', JSON.stringify(row.style.display));
  ok('строка скрыта', row.style.display==='none', row.style.display);

  console.log(bad?`\nПРОВАЛОВ: ${bad}`:'\nвсе проверки пройдены');
  if(bad) process.exitCode=1;
});
