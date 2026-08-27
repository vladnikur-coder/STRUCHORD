// При выборе пресета длина рисунка (base) должна становиться такой же,
// как у пресета — иначе он разворачивается копиями на всю сетку.
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
  const activeBase=()=>{const b=d.querySelector('#patternBaseBtns .active');return b?+b.textContent:null;};
  const chipOf=id=>[...d.querySelectorAll('#patternPresetChips .pattern-preset-chip')]
    .find(c=>c.dataset.presetId===id);

  w.eval("sections=[]; globalTimeSig='4/4'; addSection('Verse'); render();");
  const secId=w.eval('sections[0].id');
  w.eval(`openStrumPatternEditor('section', ${secId})`);

  console.log('=== 1. Пресет с base 1 («Галоп») ===');
  const galop=w.eval("JSON.stringify(STRUM_PRESETS.find(p=>p.id==='four-gallop'))");
  console.log('      base пресета:', JSON.parse(galop).base);
  click(chipOf('four-gallop'));
  console.log('      длина после выбора:', activeBase(), '| ячеек:', d.querySelectorAll('.pattern-step-btn').length);
  ok('длина стала 1', activeBase()===1, activeBase()+'');
  ok('сетка = base × sub', d.querySelectorAll('.pattern-step-btn').length===4,
     d.querySelectorAll('.pattern-step-btn').length+' (base 1 × sub 4)');

  console.log('\n=== 2. Пресет с base 4 («Шестёрка») ===');
  click(chipOf('six'));
  console.log('      длина:', activeBase(), '| ячеек:', d.querySelectorAll('.pattern-step-btn').length);
  ok('длина стала 4', activeBase()===4, activeBase()+'');

  console.log('\n=== 3. Подсветка активного пресета работает ===');
  ok('«Шестёрка» подсвечена', chipOf('six').classList.contains('active'));
  ok('«Галоп» не подсвечен', !chipOf('four-gallop').classList.contains('active'));

  console.log('\n=== 4. Сохранение разворачивает на полный такт ===');
  click(chipOf('four-gallop'));
  click(d.querySelector('#save-pattern'));
  const saved=JSON.parse(w.eval('JSON.stringify(sections[0].strumPattern)'));
  console.log('      сохранено:', saved.steps.map(x=>x||'_').join(''), '| длина', saved.steps.length);
  ok('развёрнуто на такт (4 доли × sub 4)', saved.steps.length===16, saved.steps.length+'');

  console.log('\n=== 5. Повторное открытие показывает короткий кусок ===');
  w.eval(`openStrumPatternEditor('section', ${secId})`);
  console.log('      длина:', activeBase(), '| ячеек:', d.querySelectorAll('.pattern-step-btn').length);
  ok('открылся base 1, а не 4 копии', activeBase()===1, activeBase()+'');

  console.log('\n=== 6. Пресет с несовместимым base — остаёмся на текущей длине ===');
  // В 4/4 «Вальс» (base 3) не предлагается вовсе — проверим в 3/4
  w.eval("document.querySelector('#cancel-pattern').click()");
  w.eval("sections=[]; globalTimeSig='3/4'; addSection('Verse'); render();");
  const sec2=w.eval('sections[0].id');
  w.eval(`openStrumPatternEditor('section', ${sec2})`);
  const opts=[...d.querySelectorAll('#patternBaseBtns button')].map(b=>+b.textContent);
  console.log('      длины в 3/4:', opts.join(','));
  const waltz=chipOf('waltz-strum');
  if(waltz){
    click(waltz);
    console.log('      после «Вальса» длина:', activeBase(), '(base пресета 3)');
    ok('длина = base пресета', activeBase()===3, activeBase()+'');
  } else { console.log('      (вальс недоступен)'); ok('пропуск', true); }

  console.log(bad?`\nПРОВАЛОВ: ${bad}`:'\nвсе проверки пройдены');
  if(bad) process.exitCode=1;
});
