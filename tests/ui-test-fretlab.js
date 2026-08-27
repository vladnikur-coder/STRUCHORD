// Лаборатория аппликатур: правка базовых таблиц OPEN_CHORDS / CAGED_SHAPES
// и влияние правок на выдачу вариантов для реальных аккордов.
const fs=require('fs');const {JSDOM}=require('jsdom');
const dom=new JSDOM(fs.readFileSync('/home/user/fingering-lab.html','utf8'),
  {runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/'});
const w=dom.window;
let started=0;
function node(){return{connect(){},disconnect(){},start(){started++;},stop(){},
  gain:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){},linearRampToValueAtTime(){},cancelScheduledValues(){}},
  frequency:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}},
  Q:{value:0},pan:{value:0},type:'',buffer:null,onended:null};}
w.AudioContext=w.webkitAudioContext=function(){return{
  currentTime:0,state:'running',sampleRate:44100,resume(){},destination:node(),
  createGain:node,createConvolver:node,createBufferSource:node,createBiquadFilter:node,
  createStereoPanner:node,createBuffer:(c,l)=>({getChannelData:()=>new Float32Array(l),length:l})};};

let bad=0;
const ok=(n,c,x)=>{console.log(`   ${c?'ok  ':'FAIL'} ${n}${!c&&x?' — '+x:''}`);if(!c)bad++;};

w.addEventListener('load',()=>{
  const d=w.document,$=id=>d.getElementById(id);
  const click=el=>el.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));

  console.log('=== 1. Таблицы и движок на месте ===');
  ok('OPEN_CHORDS загружен', w.eval('Object.keys(OPEN_CHORDS).length')>0,
     w.eval('Object.keys(OPEN_CHORDS).length')+' форм');
  ok('CAGED_SHAPES загружен', w.eval('Object.keys(CAGED_SHAPES).length')>0,
     w.eval('Object.keys(CAGED_SHAPES).join(",")'));
  ok('generateFingeringVariants', w.eval('typeof generateFingeringVariants')==='function');
  ok('интерактивный гриф', !!d.querySelector('#fretboard svg'));
  ok('список форм отрисован', d.querySelectorAll('.titem').length>0,
     d.querySelectorAll('.titem').length+' строк');

  console.log('\n=== 2. Правка OPEN_CHORDS видна в выдаче ===');
  const before=w.eval("JSON.stringify(getFingeringVariants('C','C').shapes[0])");
  console.log('      C до правки :', before);
  w.eval(`
    selName='C'; tab='open';
    editShape=['x',3,2,0,1,3];   // меняем открытую C
    applyEdit();
  `);
  const after=w.eval("JSON.stringify(getFingeringVariants('C','C').shapes[0])");
  console.log('      C после     :', after);
  ok('выдача изменилась', before!==after);
  ok('новая форма первая', after==='["x",3,2,0,1,3]', after);
  ok('помечено как изменённое', w.eval("!eq(OPEN_CHORDS['C'], ORIG_OPEN['C'])"));

  console.log('\n=== 3. Возврат к исходной ===');
  w.eval('revertEdit()');
  const back=w.eval("JSON.stringify(getFingeringVariants('C','C').shapes[0])");
  ok('форма вернулась', back===before, back);

  console.log('\n=== 4. Правка CAGED влияет на МНОГО аккордов ===');
  // Смотрим ВЕСЬ список форм, а не первую тройку.
  //
  // Смысл проверки — что CAGED-шаблон общий: правка одного шаблона
  // отражается на всех аккордах этого типа. Раньше хватало и топ-3,
  // потому что порядок был блочный и CAGED всегда шли первыми. После
  // перехода на единый пул (сортировка по оценке, а не по
  // происхождению) изменённая форма попадает наверх только там, где
  // она действительно лучшая: у Am это 3-е место, у Cm — 15-е.
  // Проверять надо факт влияния, а не позицию в выдаче.
  const roots=['C','F','G','A','D'];
  const was=roots.map(r=>w.eval(`JSON.stringify(getFingeringVariants('${r}m','C').shapes.map(s=>s.join(',')))`));
  w.eval(`
    tab='caged'; cagedType='m'; selName=1;
    editShape=['x',0,2,2,1,3];
    document.getElementById('f-rootstr').value='1';
    document.getElementById('f-rootfret').value='0';
    applyEdit();
  `);
  const now=roots.map(r=>w.eval(`JSON.stringify(getFingeringVariants('${r}m','C').shapes.map(s=>s.join(',')))`));
  const changed=roots.filter((r,i)=>was[i]!==now[i]);
  ok('один шаблон затронул несколько аккордов', changed.length>1,
     'изменились: '+(changed.join(', ')||'ни одного'));
  console.log('      затронуто аккордов:', changed.length, 'из', roots.length);

  console.log('\n=== 5. Превью показывает результат ===');
  $('f-testchords').value='Cm, Fm, Gm';
  click($('btn-refresh'));
  ok('карточки аккордов отрисованы', d.querySelectorAll('.pcard').length>0,
     d.querySelectorAll('.pcard').length+' карточек');
  ok('SVG аппликатур в превью', d.querySelectorAll('.pcard svg').length>0);

  console.log('\n=== 6. Сброс всех правок ===');
  w.eval(`
    Object.keys(OPEN_CHORDS).forEach(k=>delete OPEN_CHORDS[k]);
    Object.assign(OPEN_CHORDS, JSON.parse(JSON.stringify(ORIG_OPEN)));
    Object.keys(CAGED_SHAPES).forEach(k=>delete CAGED_SHAPES[k]);
    Object.assign(CAGED_SHAPES, JSON.parse(JSON.stringify(ORIG_CAGED)));
    fingeringCache.clear();
  `);
  // Сравниваем с `was` — а он теперь снимается по ВСЕМУ списку форм
  // (см. раздел 4). Срез .slice(0,3) здесь сравнивал бы три формы с
  // полным списком и падал всегда.
  const restored=roots.map(r=>w.eval(`JSON.stringify(getFingeringVariants('${r}m','C').shapes.map(s=>s.join(',')))`));
  ok('всё вернулось к исходному', JSON.stringify(restored)===JSON.stringify(was));

  console.log('\n=== 7. Звук ===');
  started=0; w.eval("playShape(['x',0,2,2,1,0],'Am',false)");
  ok('бой звучит', started>0, 'узлов '+started);
  started=0; w.eval("playShape(['x',0,2,2,1,0],'Am',true)");
  ok('перебор звучит', started>0, 'узлов '+started);

  console.log('\n=== 8. Выгрузка кода ===');
  w.eval("selName='G'; tab='open'; editShape=[3,2,0,0,0,3]; applyEdit();");
  const code=$('out').value;
  ok('код содержит OPEN_CHORDS', code.includes('const OPEN_CHORDS'));
  ok('изменённое помечено', code.includes('// изменено'));
  fs.writeFileSync('/tmp/tables-out.js', code);
  try { require('child_process').execSync('node --check /tmp/tables-out.js'); ok('код валиден',true); }
  catch(e){ ok('код валиден',false,'синтаксическая ошибка'); }

  console.log(bad?`\nПРОВАЛОВ: ${bad}`:'\nвсе проверки пройдены');
  if(bad) process.exitCode=1;
});

// Проверки нот/баса и липкая колонка (правки после отзыва пользователя).
w.addEventListener('load',()=>{
  const d=w.document,$=id=>d.getElementById(id);
  let f=0; const t=(n,c,x)=>{console.log(`   ${c?'ok  ':'FAIL'} ${n}${!c&&x?' — '+x:''}`);if(!c)f++;};
  const issues=()=>[...d.querySelectorAll('.issue')].map(e=>e.textContent).join(' | ');

  console.log('\n=== 9. Разбор нот по струнам ===');
  w.eval("tab='open'; selName='Am'; editShape=['x',0,2,2,1,0]; renderReport();");
  const cells=[...d.querySelectorAll('.ncell')];
  t('6 ячеек струн', cells.length===6, cells.length+'');
  const notes=cells.map(c=>c.querySelector('.nnote').textContent).join(',');
  console.log('      ноты Am:', notes);
  t('первая струна заглушена', cells[0].classList.contains('muted'));
  t('корень подсвечен', cells.some(c=>c.classList.contains('is-root')));
  t('бас помечен', cells.some(c=>c.classList.contains('is-bass')));

  console.log('\n=== 10. Полный аккорд — без ошибок ===');
  console.log('      ', issues().slice(0,90));
  t('сообщает, что всё на месте', issues().includes('все ноты аккорда на месте'));
  t('бас — основной тон', issues().includes('бас — основной тон'));

  console.log('\n=== 11. Убрали терцию ===');
  w.eval("editShape=['x',0,2,2,'x',0]; renderReport();");
  console.log('      ', issues().slice(0,110));
  t('замечено отсутствие ноты', issues().includes('не хватает нот'));
  t('предупреждение про терцию', issues().includes('терци'));

  console.log('\n=== 12. Лишняя нота ===');
  w.eval("editShape=['x',0,2,2,1,1]; renderReport();");
  console.log('      ', issues().slice(0,90));
  t('лишняя нота найдена', issues().includes('лишние ноты'));

  console.log('\n=== 13. Обращение (бас не тоника) ===');
  w.eval("editShape=[0,0,2,2,1,0]; renderReport();");
  console.log('      ', issues().slice(0,120));
  t('распознано обращение', issues().includes('обращение') || issues().includes('вне аккорда'));

  console.log('\n=== 14. Нереальная растяжка ===');
  w.eval("editShape=[1,'x','x',10,'x','x']; renderReport();");
  t('растяжка отмечена', issues().includes('растяжка'));

  console.log('\n=== 15. CAGED: проверка по реальному аккорду ===');
  w.eval(`
    tab='caged'; cagedType='m'; selName=1;
    document.getElementById('f-rootstr').value='1';
    document.getElementById('f-rootfret').value='0';
    editShape=['x',0,2,2,1,0]; renderReport();
  `);
  const chordRow=[...d.querySelectorAll('#report tr')].map(r=>r.cells[1].textContent);
  console.log('      шаблон трактуется как аккорд:', chordRow[0]);
  t('шаблон сопоставлен с аккордом', chordRow[0]==='Am', chordRow[0]);
  t('есть пояснение про CAGED', issues().includes('шаблон CAGED'));

  console.log('\n=== 16. Компоновка ===');
  const work=d.querySelector('.work');
  t('рабочая зона существует', !!work);
  t('рабочая зона липкая', !!work && w.getComputedStyle(work).position==='sticky');
  // Три зоны в ряд: список форм, гриф, разбор нот.
  t('список форм на месте', !!d.getElementById('tlist'));
  t('гриф на месте', !!d.querySelector('#fretboard svg'));
  t('разбор нот на месте', !!d.getElementById('notes-grid'));
  // Превью и код вынесены под рабочую зону, во всю ширину.
  t('превью вне рабочей зоны', !!d.getElementById('results') && !work.contains(d.getElementById('results')));
  t('код свёрнут в <details>', !!d.querySelector('details #out'));

  if(f) process.exitCode=1;
});
