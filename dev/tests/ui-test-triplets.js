// Триоли: маятник по позиции в доле, кнопка «3», сохранение sub=3 при импорте.
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
const ok=(n,c,note)=>{console.log(`   ${c?'ok  ':'FAIL'} ${n}${!c&&note?' — '+note:''}`);if(!c)bad++;};

w.addEventListener('load',()=>{
  const d=w.document, $=id=>d.getElementById(id);
  const click=el=>el.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));

  console.log('=== 1. Пресеты на месте и валидны ===');
  ok('validateStrumPresets без замечаний', w.eval('validateStrumPresets().length')===0,
     w.eval('JSON.stringify(validateStrumPresets())'));
  ok('shuffle загружен', w.eval("!!STRUM_PRESETS.find(p=>p.id==='shuffle')"));
  ok('six-shuffle загружен', w.eval("!!STRUM_PRESETS.find(p=>p.id==='six-shuffle')"));

  console.log('\n=== 2. Кнопка «3» в редакторе ===');
  w.eval("addSection('Verse'); render();");
  const id=w.eval('sections[0].id');
  w.eval(`openStrumPatternEditor('section', ${id})`);
  const subs=[...d.querySelectorAll('.pattern-sub-btn[data-sub]')].map(b=>b.dataset.sub);
  ok('кнопки нот на долю: '+subs.join(','), subs.join(',')==='1,2,3,4');

  console.log('\n=== 3. Маятник при sub=3 (вниз-вниз-вверх) ===');
  click([...d.querySelectorAll('.pattern-sub-btn[data-sub]')].find(b=>b.dataset.sub==='3'));
  const cells=[...d.querySelectorAll('.pattern-step-btn')];
  ok('ячеек 12 (4 доли × 3)', cells.length===12, 'получено '+cells.length);
  cells.forEach(c=>{ for(let k=0;k<5 && c.textContent!=='';k++) click(c); });
  const first=cells.slice(0,6).map(c=>{click(c);const t=c.textContent;return t;});
  console.log('      первый клик по ячейкам 1..6:', first.join(' '));
  ok('позиции 0,1 -> ↓, позиция 2 -> ↑', first.join('')==='↓↓↑↓↓↑', 'получено '+first.join(''));

  console.log('\n=== 4. Полнота цикла сохранена ===');
  const cyc=i=>{const c=[...d.querySelectorAll('.pattern-step-btn')][i];const seq=[];for(let k=0;k<4;k++){click(c);seq.push(c.textContent||'_');}return seq;};
  const down=cyc(0), up=cyc(2);
  console.log('      ячейка «вниз» :', down.join(' → '));
  console.log('      ячейка «вверх»:', up.join(' → '));
  ok('в обеих доступны все 4 знака',
     new Set(down).size===4 && new Set(up).size===4);

  console.log('\n=== 5. sub=2 не сломался (двоичное чередование) ===');
  click([...d.querySelectorAll('.pattern-sub-btn[data-sub]')].find(b=>b.dataset.sub==='2'));
  // Сетку нужно очистить: в предыдущих пунктах по ячейкам уже кликали,
  // и цикл продолжился бы с текущего знака, а не с первого.
  [...d.querySelectorAll('.pattern-step-btn')].forEach(c=>{
    for(let k=0;k<5 && c.textContent!=='';k++) click(c);
  });
  const c2=[...d.querySelectorAll('.pattern-step-btn')].slice(0,4).map(c=>{click(c);return c.textContent;});
  ok('↓↑↓↑ по сквозному номеру', c2.join('')==='↓↑↓↑', 'получено '+c2.join(''));
  click(d.querySelector('#cancel-pattern'));

  console.log('\n=== 6. Импорт сохраняет subdivision 3 ===');
  const song={schemaVersion:2,name:'t',bpm:100,globalKey:'C',keyMode:'manual',globalTimeSig:'4/4',
    notes:'',nextId:9,userFingerings:[],preferredFingerings:[],date:'',
    sections:[{id:1,type:'Verse',customName:null,key:null,shift:null,timeSig:null,bpm:null,repeat:1,
      strumPattern:{mode:'strum',subdivision:3,steps:['D',null,null,'D',null,'U',null,null,'U','D',null,'U']},
      squares:[{id:2,repeat:1,customBeats:null,strumPattern:null,
        events:[{chord:'Am',span:4,timeSig:null,strumPattern:null}]}]}]};
  w.localStorage.setItem('struchord_songs',JSON.stringify([song]));
  w.loadSong(0);
  const got=w.eval('sections.length ? JSON.stringify(sections[0].strumPattern) : "null"');
  ok('триольный ритм пережил импорт', got!=='null' && JSON.parse(got).subdivision===3, got.slice(0,60));

  console.log('\n=== 7. Шаффл совместим с размерами ===');
  const compat=w.eval(`(function(){
    const p=STRUM_PRESETS.find(x=>x.id==='six-shuffle');
    return JSON.stringify(['4/4','3/4','12/8'].map(ts=>ts+':'+(isPresetCompatible(p,ts,getGridUnitsPerBar(ts))?'да':'нет')));
  })()`);
  console.log('      ', compat);

  console.log(bad? `\nПРОВАЛОВ: ${bad}` : '\nвсе проверки пройдены');
  if(bad) process.exitCode=1;
});
