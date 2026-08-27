// Проверяем перенос из лаборатории: столбик струн, цветной бас,
// подсветка шагов и фиксированные длительности при прослушивании.
const fs=require('fs');const {JSDOM}=require('jsdom');
const dom=new JSDOM(fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8'),{
  runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/',
  beforeParse(win){win.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText:()=>({width:10}),
    clearRect(){},beginPath(){},arc(){},fill(){},stroke(){},moveTo(){},lineTo(){},closePath(){},
    save(){},restore(){},translate(){},rotate(){},fillText(){},strokeText(){},setTransform(){},scale(){},
    createLinearGradient:()=>({addColorStop(){}})});}
});
const w=dom.window;
const durations=[];
function node(){return{connect(){},disconnect(){},start(){},stop(){},
  gain:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){},linearRampToValueAtTime(){},cancelScheduledValues(){}},
  frequency:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}},
  Q:{value:0},pan:{value:0},type:'',buffer:null,onended:null};}
w.AudioContext=w.webkitAudioContext=function(){return{
  currentTime:0,state:'running',sampleRate:44100,resume(){},destination:node(),
  createGain:node,createConvolver:node,createBufferSource:node,createBiquadFilter:node,
  createStereoPanner:node,
  createBuffer:(c,len)=>({getChannelData:()=>new Float32Array(len),length:len,duration:len/44100}),
};};

w.addEventListener('load',()=>{
  const d=w.document,$=id=>d.getElementById(id);
  const click=el=>el.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  w.eval("addSection('Verse'); render();");
  const secId=w.eval('sections[0].id');
  w.eval(`openStrumPatternEditor('section', ${secId})`);

  console.log('=== 1. Перебор: струны столбиком ===');
  click(d.querySelector('.pattern-mode-tab[data-mode="pick"]'));
  // ставим Б + 3 струну в первую ячейку
  w.eval(`
    (function(){
      const m=document.querySelector('.strum-modal-content');
      const btn=m.querySelector('.pattern-step-btn');
      btn.click();
      const pop=document.querySelector('.pattern-pick-popover');
      [...pop.children].find(b=>b.textContent==='Б').click();
      [...pop.children].find(b=>b.textContent==='3').click();
    })()
  `);
  const cell=d.querySelector('.pattern-step-btn');
  const col=cell.querySelector('.pattern-step-pick');
  console.log('   столбик .pattern-step-pick создан:', !!col);
  console.log('   элементов в столбике:', col?col.children.length:0, '(ожидаем 2: Б и 3)');
  console.log('   содержимое:', col?[...col.children].map(c=>c.textContent).join('|'):'-');
  console.log('   бас помечен классом is-bass:', col?[...col.children].some(c=>c.className==='is-bass'):false);
  console.log('   строки «Б+3» больше нет:', !cell.textContent.includes('+'));

  console.log('\n=== 2. CSS-правила перенесены ===');
  const css=[...d.querySelectorAll('style')].map(s=>s.textContent).join('');
  console.log('   .pattern-step-pick:', css.includes('.pattern-step-pick'));
  console.log('   column-reverse   :', /\.pattern-step-pick\s*\{[^}]*column-reverse/.test(css));
  console.log('   .is-bass акцент  :', css.includes('.pattern-step-pick .is-bass'));
  console.log('   .is-playing      :', css.includes('.pattern-step-btn.is-playing'));

  console.log('\n=== 3. Подсветка при прослушивании ===');
  click(d.querySelector('.pattern-mode-tab[data-mode="strum"]'));
  w.eval(`
    (function(){
      const m=document.querySelector('.strum-modal-content');
      m.querySelectorAll('.pattern-step-btn').forEach(b=>{
        for(let i=0;i<4 && b.textContent!=='↓';i++) b.click();
      });
    })()
  `);
  click($('preview-pattern'));
  console.log('   прослушивание запущено:', w.eval('_patternPreviewPlaying'));
  console.log('   таймеров подсветки:', w.eval('_patternPreviewHighlightTimers.length'), '(было бы 0 до правки)');

  console.log('\n=== 4. Длительности не зависят от темпа ===');
  const code=w.eval('startPatternPreview.toString()');
  console.log('   щипок 1.7 фикс.  :', code.includes('stringNum, t, 1.7'));
  console.log('   удар  1.4 фикс.  :', code.includes("t, 1.4, 0.34"));
  // Комментарии из проверки выкидываем — иначе упоминание старой формулы
  // в пояснении считается за живой код.
  const codeNoComments = code.replace(/\/\/[^\n]*/g, '');
  console.log('   старое stepSeconds*2.4 убрано:', !codeNoComments.includes('stepSeconds * 2.4'));
  console.log('   старое stepSeconds*1.7 убрано:', !codeNoComments.includes('stepSeconds * 1.7'));

  console.log('\n=== 5. Остановка гасит подсветку ===');
  w.eval('stopPatternPreview()');
  console.log('   таймеров после стопа:', w.eval('_patternPreviewHighlightTimers.length'));
  console.log('   ячеек с .is-playing :', d.querySelectorAll('.pattern-step-btn.is-playing').length);
});
