// Сдвиг вёрстки при наведении на секцию: ряд кнопок «добавить/клонировать
// квадрат» выезжает и смещает ячейки прямо из-под курсора. Чем меньше
// сдвиг, тем точнее попадание по аккордам.
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
const px=v=>parseFloat(v)||0;

w.addEventListener('load',()=>{
  const d=w.document;
  w.eval("addSection('Verse'); render();");

  // CSS-правила читаем из таблиц стилей: jsdom не считает layout,
  // но объявленные значения проверить можно.
  const rules=[];
  for(const sh of d.styleSheets){ try{ for(const r of sh.cssRules) rules.push(r); }catch(e){} }
  const find=sel=>rules.find(r=>r.selectorText===sel);

  console.log('=== Сдвиг при наведении ===');
  const hover=find('.section-card:hover .square-actions-row');
  // camelCase-аксессоры (style.maxHeight) в cssstyle/jsdom 20 не
  // реализованы — читаем то же объявление через getPropertyValue.
  const mh=px(hover.style.getPropertyValue('max-height')), mt=px(hover.style.getPropertyValue('margin-top'));
  console.log('      max-height '+mh+'px + margin-top '+mt+'px = '+(mh+mt)+'px');
  // 46px = кнопка 40 + отступ 6. Меньше делать нельзя: кнопки должны
  // помещаться целиком, но и расти сдвигу не даём — раньше было 56.
  ok('сдвиг не больше 48px', mh+mt<=48, (mh+mt)+'px');

  console.log('\n=== Размер кнопок ===');
  const btn=find('.add-square-btn,\n.clone-square-btn')||
            rules.find(r=>r.selectorText&&r.selectorText.includes('.add-square-btn')&&r.style.width);
  console.log('      кнопка '+btn.style.width+' × '+btn.style.height);
  // Размер кнопок намеренно оставлен прежним (40px) — по ним надо
  // попадать мышью, мельче неудобно.
  ok('кнопки 40px', px(btn.style.width)===40, btn.style.width);
  ok('ряд вмещает кнопку целиком', mh>=px(btn.style.height), `ряд ${mh}px, кнопка ${btn.style.height}`);

  console.log('\n=== Скрытие во время воспроизведения ===');
  ok('есть правило body.is-playing', !!find('body.is-playing .square-actions-row'));
  ok('класс снимается и ставится', w.eval('typeof setPlaybackBodyClass')==='function');
  w.eval('setPlaybackBodyClass(true)');
  ok('класс на body при игре', d.body.classList.contains('is-playing'));
  w.eval('stopPlayback()');
  ok('класс снят после остановки', !d.body.classList.contains('is-playing'));

  console.log('\n=== Бейдж ×1 не раздвигает вёрстку ===');
  // Показывается только при наведении. Если оставить его в потоке,
  // он добавляет к сдвигу ~25px — вдвое усиливая прыжок под курсором.
  //
  // Раньше он был absolute у края СЕКЦИИ, но при коротком последнем
  // квадрате висел в пустоте (замер: разрыв 342px). Теперь это sticky
  // внутри обёртки шириной с квадрат, а от прибавки высоты спасает
  // нулевая высота самой обёртки — проверяем именно её, а не position.
  const badge=d.querySelector('.section-repeat-badge-hover');
  ok('бейдж ×1 есть', !!badge);
  if(badge){
    const cs=w.getComputedStyle(badge);
    const row=badge.closest('.section-repeat-row--hover');
    ok('лежит в обёртке шириной с последний квадрат', !!row,
       badge.parentElement && badge.parentElement.className);
    ok('обёртка нулевой высоты — вёрстку не раздвигает',
       !!row && w.getComputedStyle(row).height==='0px',
       row && w.getComputedStyle(row).height);
    ok('обёртка выпускает бейдж наружу',
       !!row && w.getComputedStyle(row).overflow==='visible',
       row && w.getComputedStyle(row).overflow);
    ok('следует за краем квадрата (sticky)', cs.position==='sticky', cs.position);
    ok('скрыт до наведения', cs.visibility==='hidden', cs.visibility);
    ok('остался кликабельным', !!badge.getAttribute('onclick'));
  }

  console.log('\n=== Бейдж повтора идёт за краем последнего квадрата ===');
  // Если последний квадрат занимает не всю ширину, бейдж у края секции
  // висел бы в пустоте, оторванный от аккордов.
  const secId=w.eval('sections[0].id');
  w.eval(`addSquare(${secId}); render();`);
  w.eval('const q=sections[0].squares[1]; q.events=q.events.slice(0,2); q.customBeats=2; render();');
  // Проверяем ПОСТОЯННЫЙ бейдж (repeat > 1) — именно он привязан к краю
  // последнего квадрата. «×1» по наведению стоит у края секции и от
  // ширины квадрата не зависит (см. .section-repeat-badge-hover).
  w.eval('sections[0].repeat=3; render();');
  const widths=[...d.querySelectorAll('.square-inner')].map(e=>parseFloat(e.style.width));
  const lastW=widths[widths.length-1];
  const row=d.querySelector('.section-repeat-row');
  const bd=d.querySelector('.section-repeat-badge-absolute');
  console.log('      ширины квадратов:', widths.join('% , ')+'%');
  console.log('      ширина строки бейджа:', row && row.style.width);
  ok('последний квадрат уже секции', lastW<100, lastW+'%');
  // Бейдж живёт ВНУТРИ .squares-list — области, которая масштабируется
  // и прокручивается вместе с квадратами. Раньше он лежал в
  // .section-card снаружи, и при зуме квадрат уезжал вправо, а бейдж
  // застревал на месте (замер: край квадрата 3360px против бейджа на
  // 1071px).
  //
  // Теперь он лежит в обёртке шириной С ПОСЛЕДНИЙ КВАДРАТ и прилипает
  // (position: sticky) к её правому краю. Процентного отступа больше
  // нет: он держал бейдж у края квадрата, но край при зуме уходит за
  // пределы экрана вместе с бейджем — кликнуть было нельзя.
  const got=parseFloat((String(row && row.style.width).match(/([\d.]+)%/)||[])[1]);
  ok('ширина строки бейджа равна ширине последнего квадрата',
     Math.abs(got-lastW)<1e-3, `${got}%, ожидалось ${lastW}%`);
  ok('бейдж прилипающий', w.getComputedStyle(bd).position==='sticky',
     w.getComputedStyle(bd).position);
  ok('бейдж внутри прокручиваемой области',
     !!bd.closest('.squares-list'), bd.parentElement.className);
  w.eval('sections[0].repeat=1; render();');

  console.log('\n=== Кнопки остаются рабочими вне воспроизведения ===');
  const before=w.eval('sections[0].squares.length');
  const add=d.querySelector('.add-square-btn');
  add.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  w.eval('render()');
  ok('«добавить квадрат» работает', w.eval('sections[0].squares.length')===before+1);

  console.log(bad?`\nПРОВАЛОВ: ${bad}`:'\nвсе проверки пройдены');
  if(bad) process.exitCode=1;
});
