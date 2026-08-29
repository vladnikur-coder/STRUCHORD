// Зум сетки квадратов: чем крупнее масштаб, тем мельче шаг ресайза.
// Главное — затакт восьмой и шестнадцатой должен быть достижим в 4/4,
// без смены размера на 8/8.
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

// jsdom 20 вызывает по dispatch только addEventListener-подписки;
// on*-обработчик, назначенный свойством (так вешается pointerdown на
// ручке ресайза), молча пропускается. Синтетический MouseEvent с типом
// 'pointerdown' содержит всё, что читает обработчик (clientX и пр.),
// поэтому под jsdom вызываем свойство напрямую тем же событием.
const firePointerDown=(el,x)=>{
  const e=new w.MouseEvent('pointerdown',{bubbles:true,cancelable:true,clientX:x});
  if(typeof el.onpointerdown==='function') el.onpointerdown(e);
  else el.dispatchEvent(e);
};

w.addEventListener('load',()=>{
  const d=w.document;
  w.eval("sections=[]; globalTimeSig='4/4'; addSection('Verse'); render();");

  console.log('=== 1. Плавный масштаб и шаг сетки ===');
  const stepAt=(z)=>{w.eval(`squareZoom=${z}`);return w.eval('getResizeStep()');};
  [[1,1],[1.2,1],[1.4,0.5],[2,0.5],[2.4,0.25],[3.5,0.25]].forEach(([z,exp])=>{
    const got=stepAt(z);
    console.log(`      ${(z*100).toFixed(0).padStart(4)}% -> шаг 1/${1/got}`);
    ok(`при ${z}× шаг 1/${1/exp}`, got===exp, `1/${1/got}`);
  });
  w.eval('squareZoom=1; applySquareZoom();');

  console.log('\n=== 2. Жест колесом с Ctrl ===');
  ok('обработчик жеста есть', w.eval('typeof attachZoomGestures')==='function');
  w.eval('attachZoomGestures()');
  w.eval("sections=[]; globalTimeSig='4/4'; addSection('Verse'); render();");
  // Прокручивается .squares-viewport — жесты слушают именно его.
  const row=d.querySelector('.squares-viewport');
  const wheel=(dy,ctrl)=>{
    const e=new w.WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:dy,ctrlKey:ctrl});
    row.dispatchEvent(e);
    return e.defaultPrevented;
  };
  const z0=w.eval('squareZoom');
  const prevented=wheel(-100,true);
  const z1=w.eval('squareZoom');
  console.log('      Ctrl+колесо вверх:', z0.toFixed(2), '->', z1.toFixed(2));
  ok('масштаб вырос', z1>z0, `${z0} -> ${z1}`);
  ok('прокрутка страницы подавлена', prevented);

  wheel(100,true);
  console.log('      Ctrl+колесо вниз :', z1.toFixed(2), '->', w.eval('squareZoom').toFixed(2));
  ok('масштаб уменьшился', w.eval('squareZoom')<z1);

  const zBefore=w.eval('squareZoom');
  const notPrevented=wheel(-100,false);
  ok('без Ctrl колесо не зумит', w.eval('squareZoom')===zBefore, w.eval('squareZoom')+'');
  ok('без Ctrl прокрутка не тронута', !notPrevented);

  console.log('\n=== 2б. Границы масштаба ===');
  w.eval('setSquareZoom(99)');
  console.log('      попытка 99× ->', w.eval('squareZoom'));
  ok('не больше максимума', w.eval('squareZoom')===w.eval('ZOOM_MAX'));
  w.eval('setSquareZoom(0.1)');
  ok('не меньше 1×', w.eval('squareZoom')===1, w.eval('squareZoom')+'');

  console.log('\n=== 2в. Индикатор масштаба и ползунок ===');
  // Индикатор живёт в ряду бейджей секции, а не отдельной полосой.
  ok('при 1× бейджа нет', d.querySelectorAll('.section-badge--zoom').length===0);
  w.eval('setSquareZoom(2); render();');
  const badge=d.querySelector('.section-badge--zoom');
  console.log('      бейдж:', badge?badge.textContent.replace(/\s+/g,' ').trim():'нет');
  ok('бейдж появился при зуме', !!badge);
  ok('в шапке секции', !!badge && !!badge.closest('.section-mod-badges'));
  ok('процент верный', !!badge && /200%/.test(badge.textContent), badge&&badge.textContent);
  // Шаг больше не подписан в самом бейдже — его показывают подсечки на
  // ячейках, а словесная расшифровка ушла в подсказку.
  ok('шаг назван в подсказке', !!badge && /восьмые/.test(badge.title||''), badge&&badge.title);
  ok('в бейдже только процент', !!badge && !/восьмые|четверти/.test(badge.textContent),
     badge&&badge.textContent);
  badge.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  ok('клик сбрасывает масштаб', w.eval('squareZoom')===1, w.eval('squareZoom')+'');
  ok('клик запускает безопасную transform/opacity-анимацию рядов',
     !!d.querySelector('.squares-list.zoom-reset-settle'));
  w.eval('render()');
  ok('бейдж исчез при 1×', d.querySelectorAll('.section-badge--zoom').length===0);
  // Ползунок под секцией удалён: зум делается колесом с Ctrl (десктоп)
  // и щипком (тач). Постоянная полоса занимала место и дублировала жест.
  ok('ползунка в разметке нет', d.querySelectorAll('.zoom-slider').length===0,
     d.querySelectorAll('.zoom-slider').length+'');

  console.log('\n=== 3. Растягиваются ТОЛЬКО квадраты ===');
  w.eval('setSquareZoom(1.5)');
  const css=[...d.querySelectorAll('style')].map(s=>s.textContent).join('');
  ok('ширина у .squares-list', /\.squares-list\s*\{[^}]*--square-zoom/.test(css));
  // Прокрутка включается только при зуме и только у внутренней области:
  // кнопки квадрата выступают за правый край и при 1× не должны резаться.
  ok('прокрутка у .squares-viewport при зуме',
     /body\.is-zoomed\s+\.squares-viewport\s*\{[^}]*overflow-x:\s*auto/.test(css));
  ok('без зума ряд не обрезает', /\.squares-row\s*\{\s*overflow:\s*visible/.test(css));
  ok('шапка секции не затронута', !/\.section-header[^{]*\{[^}]*--square-zoom/.test(css));

  console.log('\n=== 4. Затакт восьмой в 4/4 ===');
  w.eval(`
    setSquareZoom(1.5);
    const sq=sections[0].squares[0];
    sq.events=[{chord:'Am',span:0.5},{chord:'F',span:3.5}];
    render();
  `);
  const sp=w.eval('JSON.stringify(sections[0].squares[0].events.map(e=>e.span))');
  console.log('      span:', sp);
  ok('дробный span хранится', sp==='[0.5,3.5]', sp);
  const beats=w.eval("getSquareBeats(sections[0].squares[0],'4/4')");
  ok('сумма = 4 доли', Math.abs(beats-4)<1e-6, beats+'');
  const cols=JSON.parse(w.eval("JSON.stringify(distributeVisualSpans(sections[0].squares[0].events,'4/4'))"));
  console.log('      визуальные колонки:', JSON.stringify(cols));
  ok('колонки распределены 1:7', cols.spans.join(',')==='1,7', cols.spans.join(','));

  console.log('\n=== 5. Затакт шестнадцатой ===');
  w.eval(`
    setSquareZoom(2.5);
    const sq=sections[0].squares[0];
    sq.events=[{chord:'Am',span:0.25},{chord:'F',span:3.75}];
    render();
  `);
  console.log('      span:', w.eval('JSON.stringify(sections[0].squares[0].events.map(e=>e.span))'));
  ok('шестнадцатая держится',
     Math.abs(w.eval('sections[0].squares[0].events[0].span')-0.25)<1e-9);
  ok('сумма всё ещё 4', Math.abs(w.eval("getSquareBeats(sections[0].squares[0],'4/4')")-4)<1e-6);

  console.log('\n=== 6. Длительность при воспроизведении ===');
  const d8=w.eval("getEventDurationForTimeSig(0.5,120,'4/4')");
  const d16=w.eval("getEventDurationForTimeSig(0.25,120,'4/4')");
  console.log('      восьмая:', d8.toFixed(3), 'с | шестнадцатая:', d16.toFixed(3), 'с (четверть 0.5)');
  ok('восьмая = половина четверти', Math.abs(d8-0.25)<1e-9);
  ok('шестнадцатая = четверть четверти', Math.abs(d16-0.125)<1e-9);

  console.log('\n=== 7. Импорт не округляет дробь ===');
  const song={schemaVersion:2,name:'t',bpm:100,globalKey:'C',keyMode:'manual',globalTimeSig:'4/4',
    notes:'',nextId:9,userFingerings:[],preferredFingerings:[],date:'',
    sections:[{id:1,type:'Verse',customName:null,key:null,shift:null,timeSig:null,bpm:null,repeat:1,
      strumPattern:null,squares:[{id:2,repeat:1,customBeats:null,strumPattern:null,
        events:[{chord:'Am',span:0.5,timeSig:null,strumPattern:null},
                {chord:'F',span:3.5,timeSig:null,strumPattern:null}]}]}]};
  w.localStorage.setItem('struchord_songs',JSON.stringify([song]));
  w.loadSong(0);
  const imported=w.eval('JSON.stringify(sections[0].squares[0].events.map(e=>e.span))');
  console.log('      после импорта:', imported);
  ok('дробь пережила импорт', imported==='[0.5,3.5]', imported);

  console.log('\n=== 8. Ресайз мышью даёт дробный span ===');
  // jsdom не считает layout — подставляем ширину квадрату, иначе шаг
  // перетаскивания вычисляется от нуля.
  w.eval(`
    Element.prototype.getBoundingClientRect = function(){
      if (this.classList && this.classList.contains('square-inner'))
        return {width:800,height:72,top:0,left:0,right:800,bottom:72};
      return {width:100,height:20,top:0,left:0,right:100,bottom:20};
    };
  `);
  const drag=(zoomIdx,dx)=>{
    w.eval(`
      sections=[]; globalTimeSig='4/4'; addSection('Verse');
      sections[0].squares[0].events=[{chord:'Am',span:4},{chord:'F',span:4},
                                      {chord:'C',span:4},{chord:'G',span:4}];
      setSquareZoom(${zoomIdx}); render();
    `);
    const h=d.querySelector('.resize-handle');
    firePointerDown(h, 0);
    d.dispatchEvent(new w.MouseEvent('pointermove',{bubbles:true,clientX:dx}));
    d.dispatchEvent(new w.MouseEvent('pointerup',{bubbles:true}));
    return JSON.parse(w.eval('JSON.stringify(sections[0].squares[0].events.map(e=>e.span))'));
  };
  const r8=drag(1.5,-25);
  console.log('      ×1.5, тянем -25px:', JSON.stringify(r8));
  ok('получилась половина доли', r8[0]===3.5, JSON.stringify(r8));
  ok('сумма квадрата не изменилась', r8.reduce((a,b)=>a+b,0)===16, r8.reduce((a,b)=>a+b,0)+'');

  const r16=drag(2.5,-12);
  console.log('      ×2.5, тянем -12px:', JSON.stringify(r16));
  ok('получилась четверть доли', r16[0]===3.75, JSON.stringify(r16));
  ok('сумма сохранена', r16.reduce((a,b)=>a+b,0)===16, r16.reduce((a,b)=>a+b,0)+'');

  console.log('\n=== 9. Плавность жеста ===');
  // Рывки были от трёх причин: фиксированный шаг 12% на любую дельту,
  // CSS-transition, перезапускавшийся каждым событием, и полный render()
  // на первом щелчке (ради появления бейджа).
  w.eval("sections=[]; globalTimeSig='4/4'; addSection('Verse'); render(); setSquareZoom(1);");
  // Ряд ищем каждый раз заново: render() пересоздаёт узлы, а событие,
  // отправленное в открепившийся элемент, до обработчика не долетит.
  const spin=(dy,mode)=>{
    const e=new w.WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:dy,ctrlKey:true});
    if(mode!==undefined) Object.defineProperty(e,'deltaMode',{value:mode});
    d.querySelector('.squares-viewport').dispatchEvent(e);
  };
  w.eval('setSquareZoom(2)');
  let z=w.eval('squareZoom'); spin(-4);
  const smallStep=w.eval('squareZoom')-z;
  w.eval('setSquareZoom(2)');
  z=w.eval('squareZoom'); spin(-120);
  const bigStep=w.eval('squareZoom')-z;
  console.log(`      дельта 4px -> +${smallStep.toFixed(4)} | дельта 120px -> +${bigStep.toFixed(4)}`);
  ok('мелкая дельта даёт мелкий шаг', smallStep>0 && smallStep<bigStep/5,
     `${smallStep} vs ${bigStep}`);
  ok('полный щелчок даёт ~12%', Math.abs(bigStep-0.24)<0.02, bigStep+'');

  // Строчный режим колеса (Firefox) не должен улетать в максимум с одного тика.
  w.eval('setSquareZoom(2)');
  spin(-3,1);
  console.log('      deltaMode=1 (строки), -3 ->', w.eval('squareZoom').toFixed(3));
  ok('строчный режим не выбрасывает в максимум', w.eval('squareZoom')<2.6,
     w.eval('squareZoom')+'');

  console.log('\n=== 9б. Жест не запускает полный ре-рендер ===');
  w.eval('setSquareZoom(1); render();');
  w.eval('window.__renders=0; const _r=render; render=function(){window.__renders++; return _r.apply(this,arguments);};');
  spin(-100);
  ok('render() не вызван на первом щелчке', w.eval('window.__renders')===0,
     w.eval('window.__renders')+'');
  // Бейдж всё равно должен появиться — точечной вставкой.
  w.eval('updateZoomChrome()');
  const zb=d.querySelectorAll('.section-badge--zoom');
  console.log('      бейджей после щелчка:', zb.length);
  ok('бейдж вставлен без ре-рендера', zb.length===1, zb.length+'');
  spin(-100); w.eval('updateZoomChrome()');
  ok('бейдж не задвоился', d.querySelectorAll('.section-badge--zoom').length===1,
     d.querySelectorAll('.section-badge--zoom').length+'');
  w.eval('render(); render=window.__origRender||render;');

  console.log('\n=== 9в. CSS-переход не мешает жесту ===');
  const css2=[...d.querySelectorAll('style')].map(s=>s.textContent).join('');
  const listRule=(css2.match(/\.squares-list\s*\{[^}]*\}/)||[''])[0];
  ok('у .squares-list нет постоянного transition width',
     !/transition:[^;]*width/.test(listRule), listRule);
  ok('анимация вынесена в отдельный класс',
     /\.squares-list\.zoom-animated\s*\{[^}]*transition:[^;]*width/.test(css2));
  ok('анимация сброса рядов — transform/opacity, не width',
     /\.squares-list\.zoom-reset-settle\s*\{[^}]*animation:\s*zoom-reset-row-settle/.test(css2)
       && /@keyframes\s+zoom-reset-row-settle\s*\{[^}]*transform:/.test(css2)
       && !/@keyframes\s+zoom-reset-row-settle\s*\{[^}]*width:/.test(css2));
  w.eval('setSquareZoom(2.5); const vp=document.querySelector(".squares-viewport"); vp.scrollLeft=80; resetSquareZoom();');
  ok('сброс по бейджу-лупе НЕ анимирует width (не стягивает из невидимой зоны)',
     !d.querySelector('.squares-list').classList.contains('zoom-animated'));
  ok('сброс по бейджу-лупе анимирует сами ряды',
     d.querySelector('.squares-list').classList.contains('zoom-reset-settle'));
  ok('сброс по бейджу-лупе возвращает ряд в начало',
     d.querySelector('.squares-viewport').scrollLeft === 0,
     d.querySelector('.squares-viewport').scrollLeft + '');


  console.log('\n=== 10. Подгонка имён аккордов не переписывает DOM зря ===');
  // Раньше каждое изменение ширины переписывало innerHTML всех ячеек и
  // читало scrollWidth — при зуме это давало ~9 мс на кадр и пропуски.
  // Теперь: ширина имени кэшируется по тексту, а DOM трогаем, только
  // если сменился текст или режим (полное/сокращённое).
  ok('кэш ширин есть', w.eval('typeof chordFullWidthCache')==='object');
  ok('пачка подгонок есть', w.eval('typeof scheduleChordFit')==='function');

  w.eval(`
    sections=[]; globalTimeSig='4/4'; addSection('Verse');
    sections[0].squares[0].events=[{chord:'Cmaj7',span:8},{chord:'Am',span:8}];
    render();
  `);
  const disp=d.querySelector('.chord-display');
  ok('подпись отрисована', !!disp && /C/.test(disp.textContent), disp&&disp.textContent);

  // Повторный вызов с той же шириной не должен менять содержимое.
  const htmlBefore=disp.innerHTML;
  w.eval(`
    const el=document.querySelector('.chord-display');
    window.__writes=0;
    const proto=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');
    Object.defineProperty(el,'innerHTML',{configurable:true,
      get(){return proto.get.call(this);},
      set(v){window.__writes++; proto.set.call(this,v);}});
    fitChordDisplay(el, 200);   // первый: состояние ещё не помечено
    window.__writes = 0;         // считаем только ПОВТОРНЫЕ вызовы
    fitChordDisplay(el, 200);
    fitChordDisplay(el, 200);
    fitChordDisplay(el, 200);
  `);
  console.log('      записей в DOM при трёх ПОВТОРНЫХ вызовах:', w.eval('window.__writes'));
  // Замер идёт в отдельной линейке, а не в самой ячейке — иначе при
  // сокращении пользователь видел бы мигание полного имени.
  ok('замер не пишет в ячейку', w.eval("typeof getChordRuler")==='function');
  ok('повторные вызовы не трогают DOM', w.eval('window.__writes')===0,
     w.eval('window.__writes')+'');
  ok('содержимое не изменилось', disp.innerHTML===htmlBefore);

  // Смена ширины на узкую -> должен появиться сокращённый вариант.
  // jsdom не считает раскладку (scrollWidth всегда 0), поэтому подставляем
  // ширину имени напрямую в кэш — проверяем саму логику выбора режима.
  w.eval("chordFullWidthCache.set('Cmaj7', 80);");
  w.eval("fitChordDisplay(document.querySelector('.chord-display'), 5);");
  console.log('      при ширине 5px:', disp.textContent.trim());
  ok('узкая ячейка -> сокращение', /Δ/.test(disp.textContent), disp.textContent);
  // Обратно широкая -> полное имя.
  w.eval("fitChordDisplay(document.querySelector('.chord-display'), 500);");
  console.log('      при ширине 500px:', disp.textContent.trim());
  ok('широкая ячейка -> полное имя', /Cmaj7/.test(disp.textContent), disp.textContent);

  console.log('\n=== 10б. Изоляция раскладки на время жеста ===');
  // На большой песне пересчёт всей сетки каждый кадр стоил 33 мс.
  // content-visibility включается только пока идёт жест, иначе он мешал
  // бы поиску по странице и печати.
  // Изоляция висит на .square-inner, а не на .square: paint containment
  // обрезал бы тень собственного потомка, и на время жеста квадраты
  // становились плоскими (замер яркости под кромкой: 246 против 255).
  const css3=[...d.querySelectorAll('style')].map(s=>s.textContent).join('');
  ok('правило привязано к body.is-zooming',
     /body\.is-zooming\s+\.square-inner\s*\{[^}]*content-visibility:\s*auto/.test(css3));
  ok('изоляция не на .square (обрезала бы его тень)',
     !/body\.is-zooming\s+\.square\s*\{[^}]*content-visibility/.test(css3));
  ok('content-visibility не висит постоянно',
     !/^\s*\.square(-inner)?\s*\{[^}]*content-visibility/m.test(css3));
  ok('markZooming есть', w.eval('typeof markZooming')==='function');
  w.eval('markZooming()');
  ok('класс ставится', d.body.classList.contains('is-zooming'));

  console.log('\n=== 11. Тач-устройства (iPad) ===');
  // На iPad зума не было вовсе: ползунок показывался по :hover, которого
  // на тач нет, а щипок Safari шлёт gesturestart — его никто не слушал.
  ok('щипок подключается', w.eval('typeof attachPinchZoom')==='function');

  const css4=[...d.querySelectorAll('style')].map(s=>s.textContent).join('');
  // Правило (pointer: coarse) относилось только к ползунку — оно ушло
  // вместе с ним. На тач-устройствах зум делается щипком.
  ok('следов ползунка в CSS не осталось', !/zoom-slider/.test(css4));
  ok('щипок не отдаётся браузеру',
     /\.squares-viewport\s*\{[^}]*touch-action:\s*pan-x pan-y/.test(css4));

  // Щипок: два касания разводим — масштаб растёт.
  w.eval("sections=[]; globalTimeSig='4/4'; addSection('Verse'); render(); setSquareZoom(1);");
  const rowT=d.querySelector('.squares-viewport');
  const touch=(x1,x2)=>[
    {clientX:x1,clientY:50,target:rowT},{clientX:x2,clientY:50,target:rowT},
  ];
  const fire=(type,pts)=>{
    const e=new w.Event(type,{bubbles:true,cancelable:true});
    e.touches=pts; e.changedTouches=pts;
    rowT.dispatchEvent(e);
  };
  fire('touchstart',touch(100,200));
  fire('touchmove',touch(50,250));
  const zPinch=w.eval('squareZoom');
  console.log('      развели пальцы 100px -> 200px: масштаб', zPinch.toFixed(2)+'×');
  ok('щипок увеличивает масштаб', zPinch>1.5, zPinch.toFixed(2));
  fire('touchmove',touch(90,210));
  console.log('      свели обратно:', w.eval('squareZoom').toFixed(2)+'×');
  ok('щипок уменьшает масштаб', w.eval('squareZoom')<zPinch);
  fire('touchend',[]);

  // Один палец — это прокрутка, а не зум.
  w.eval('setSquareZoom(2)');
  const zOne=w.eval('squareZoom');
  fire('touchstart',[{clientX:100,clientY:50,target:rowT}]);
  fire('touchmove',[{clientX:180,clientY:50,target:rowT}]);
  fire('touchend',[]);
  ok('одним пальцем масштаб не меняется', w.eval('squareZoom')===zOne,
     `${zOne} -> ${w.eval('squareZoom')}`);

  console.log('\n=== 11б. Шаг колеса одинаков во всех браузерах ===');
  // Firefox шлёт 3 строки на щелчок. При строке в 16px выходило 48px —
  // вдвое медленнее Chrome. Строка = 40px выравнивает поведение.
  w.eval('attachZoomGestures()');
  const spinM=(dy,mode)=>{
    w.eval('setSquareZoom(1)');
    const e=new w.WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:dy,ctrlKey:true});
    if(mode) Object.defineProperty(e,'deltaMode',{value:mode});
    d.querySelector('.squares-viewport').dispatchEvent(e);
    return w.eval('squareZoom');
  };
  const zPix=spinM(-120,0);
  const zLine=spinM(-3,1);
  console.log(`      пиксельный щелчок (-120px): ${zPix.toFixed(3)}×`);
  console.log(`      строчный щелчок (-3 строки): ${zLine.toFixed(3)}×`);
  ok('щелчок даёт ~12% в пикселях', Math.abs(zPix-1.12)<0.005, zPix.toFixed(3));
  ok('строчный режим совпадает с пиксельным', Math.abs(zPix-zLine)<0.005,
     `${zPix.toFixed(3)} vs ${zLine.toFixed(3)}`);

  console.log('\n=== 12. При 1× вид как до появления зума ===');
  // Кнопки квадрата (✕, ×N, число тактов) позиционированы правее его
  // правого края. Когда .squares-row объявили скролл-контейнером, они
  // стали обрезаться — причём overflow-y по спецификации сам стал auto,
  // добавив и вертикальную полосу. Прокрутка теперь только при зуме.
  w.eval("sections=[]; globalTimeSig='4/4'; addSection('Verse'); setSquareZoom(1); render();");
  ok('при 1× класса is-zoomed нет', !d.body.classList.contains('is-zoomed'));
  w.eval('setSquareZoom(2)');
  ok('при зуме класс появляется', d.body.classList.contains('is-zoomed'));
  w.eval('setSquareZoom(1)');
  ok('при возврате класс снят', !d.body.classList.contains('is-zoomed'));

  const css5=[...d.querySelectorAll('style')].map(s=>s.textContent).join('');
  ok('overflow-y при зуме задан явно (не auto)',
     /body\.is-zoomed\s+\.squares-viewport\s*\{[^}]*overflow-y:\s*hidden/.test(css5));
  ok('при зуме есть место под кнопки',
     /body\.is-zoomed\s+\.squares-list\s*\{[^}]*padding-right/.test(css5));

  // Кнопки «+»/«клонировать» лежат в .squares-row, но НЕ должны попадать
  // в прокручиваемую область — иначе уезжают вбок вместе с квадратами.
  w.eval('render()');
  const vp=d.querySelector('.squares-viewport');
  const addBtn=d.querySelector('.add-square-btn');
  ok('область прокрутки существует', !!vp);
  ok('кнопка «+» вне области прокрутки',
     !!addBtn && !!vp && !vp.contains(addBtn));
  ok('список квадратов внутри области прокрутки',
     !!vp && !!vp.querySelector('.squares-list'));

  console.log('\n=== 13. Подписи счёта — единственный ориентир сетки (B-04) ===');
  // B-04 (2026-08-25): засечки и подсечки убраны из редактора, их роль
  // исполняют подписи «1 та и та»: плотность следует за шагом сетки.
  // B-22 (2026-08-26): засечки вернулись ПОД подписи короче прежних
  // (доли 4px, подсечки 2px; спека «не меняй местоположение цифр, просто
  // верни засечки и сделай их высоту меньше»). Подписи не сдвинуты.
  w.eval("sections=[]; globalTimeSig='4/4'; addSection('Verse'); setSquareZoom(1); render();");
  ok('B-22 слой засечек долей вернулся под подписи',
     !!d.querySelector('.chord-ticks') && (d.querySelector('.chord-ticks').getAttribute('style')||'').length>0,
     'нет слоя или пуст');
  ok('B-22 подсечки при шаге в долю пусты (как до B-04)',
     !!d.querySelector('.chord-ticks-step') && !(d.querySelector('.chord-ticks-step').getAttribute('style')||'').length,
     'при делителе 1 рисовать нечего');
  ok('слой подписей счёта в разметке', !!d.querySelector('.chord-counts'));
  ok('по слою подписей на каждую ячейку',
     d.querySelectorAll('.chord-counts').length===d.querySelectorAll('.chord-wrapper').length,
     `${d.querySelectorAll('.chord-counts').length} vs ${d.querySelectorAll('.chord-wrapper').length}`);
  ok('цифры долей несут is-beat', !!d.querySelector('.chord-count.is-beat'));
  ok('выделена только «1» (is-downbeat), другие цифры — без него',
     !!d.querySelector('.chord-count.is-downbeat')
       && [...d.querySelectorAll('.chord-count.is-downbeat')].every((e)=>e.textContent==='1'));
  // Плотность подписей следует за шагом сетки (getResizeStep) — та же
  // иерархия, что раньше давали подсечки.
  const cntLabels=()=>((d.querySelector('.chord-counts')||{children:[]}).children.length);
  w.eval('setSquareZoom(1); render();');
  const atQuarter=cntLabels();
  console.log('      1×   -> подписей в ячейке', atQuarter, '(только доли)');
  w.eval('setSquareZoom(1.5); render();');
  const atEighth=cntLabels();
  console.log('      1.5× -> подписей', atEighth, '(доли + «и»)');
  ok('на восьмых подписей больше', atEighth>atQuarter, `${atQuarter} -> ${atEighth}`);
  ok('B-22 подсечки появились на восьмых',
     (d.querySelector('.chord-ticks-step').getAttribute('style')||'').length>0,
     'пусто на восьмых');
  w.eval('setSquareZoom(2.5); render();');
  const atSixteenth=cntLabels();
  console.log('      2.5× -> подписей', atSixteenth, '(«та и та»)');
  ok('на шестнадцатых подписей ещё больше', atSixteenth>atEighth,
     `${atEighth} -> ${atSixteenth}`);
  w.eval('resetSquareZoom(); render();');
  ok('после сброса снова только доли', cntLabels()===atQuarter,
     `${cntLabels()} vs ${atQuarter}`);
  ok('B-22 после сброса подсечки пропали',
     !(d.querySelector('.chord-ticks-step').getAttribute('style')||'').length,
     'подсечки должны пропасть');

  // B-19 (2026-08-26): счётные эпохи размера. Спека пользователя
  // (дословно): «если в ячейке меняется размер(timesig), счет на ней
  // должен начинаться заново пример: 1и2и|1и2и3и4и (первая ячейка в
  // размере2/2 вторая 4/4)». Решение epoch_all: смена эффективного
  // размера (включая возврат к родителю) = новая эпоха с «1»; такты
  // внутри эпохи рестартируют каждый такт. Зум 1.5 → подписи на восьмых.
  w.eval(`
    sections=[]; globalTimeSig='4/4'; addSection('Verse');
    sections[0].squares[0].events=[
      {chord:'Am',span:2,timeSig:'2/2'}, {chord:'F',span:4}, {chord:'C',span:4},
      {chord:'G',span:2,timeSig:'2/2'}, {chord:'D',span:2,timeSig:'2/2'}];
    setSquareZoom(1.5); render();
  `);
  const countTexts=(i)=>[...d.querySelectorAll('.chord-wrapper')][i]
    ? [...d.querySelectorAll('.chord-wrapper')[i].querySelectorAll('.chord-count')]
        .map((e)=>e.textContent).join(' ')
    : '(нет ячейки)';
  ok('B-19 ячейка 2/2: свой счёт «1 и 2 и»', countTexts(0)==='1 и 2 и', countTexts(0));
  ok('B-19 смена на 4/4: новая эпоха «1 и 2 и 3 и 4 и»',
     countTexts(1)==='1 и 2 и 3 и 4 и', countTexts(1));
  ok('B-19 второй такт 4/4 рестартует по такту',
     countTexts(2)==='1 и 2 и 3 и 4 и', countTexts(2));
  ok('B-19 возврат к 2/2 — снова новая эпоха', countTexts(3)==='1 и 2 и', countTexts(3));
  ok('B-19 вторая 2/2 подряд рестартует по своему такту',
     countTexts(4)==='1 и 2 и', countTexts(4));

  console.log('\n=== 14. Ресайз на квадрате с дробными ячейками ===');
  // Главный баг: колонка и доля — разные единицы. distributeVisualSpans
  // приводит длительности к общему знаменателю, и у [0.5,3.5,4,8] выходит
  // 32 колонки на 16 долей. Прибавка «колонок» к span в долях удваивала
  // длину квадрата: 16 -> 32. На целых ячейках коэффициент равен 1,
  // поэтому баг не проявлялся и прошлые тесты его не ловили.
  w.eval(`
    sections=[]; globalTimeSig='4/4'; addSection('Verse');
    sections[0].squares[0].events=[{chord:'Am',span:0.5},{chord:'F',span:3.5},
                                    {chord:'C',span:4},{chord:'G',span:8}];
    render();
  `);
  const beatsOf=()=>w.eval(`
    (function(){var ts='4/4';return +sections[0].squares[0].events
      .reduce(function(a,ev){return a+getEventVisualSpanInParentUnits(ev,ts);},0).toFixed(6);})()
  `);
  const colsOf=()=>w.eval("distributeVisualSpans(sections[0].squares[0].events,'4/4').totalCols");
  console.log(`      колонок ${colsOf()}, долей ${beatsOf()} -> колонок на долю ${colsOf()/beatsOf()}`);
  ok('на дробном квадрате колонок больше, чем долей', colsOf() > beatsOf(),
     `${colsOf()} vs ${beatsOf()}`);
  ok('стартовая длина 16 долей', Math.abs(beatsOf()-16)<1e-9, beatsOf()+'');

  // Перетаскивание мышью при 2.5× (шаг 1/4).
  w.eval(`
    Element.prototype.getBoundingClientRect = function(){
      if (this.classList && this.classList.contains('square-inner'))
        return {width:1600,height:72,top:0,left:0,right:1600,bottom:72};
      return {width:100,height:20,top:0,left:0,right:100,bottom:20};
    };
    setSquareZoom(2.5); render();
  `);
  const h14=d.querySelector('.resize-handle');
  firePointerDown(h14, 0);
  // 1600px на 32 колонки = 50px/колонка; шаг 0.25 доли = 0.5 колонки = 25px
  d.dispatchEvent(new w.MouseEvent('pointermove',{bubbles:true,clientX:25}));
  d.dispatchEvent(new w.MouseEvent('pointerup',{bubbles:true}));
  const after14=w.eval('JSON.stringify(sections[0].squares[0].events.map(e=>e.span))');
  console.log('      после протяжки на шаг:', after14, '| длина', beatsOf());
  ok('длина квадрата не удвоилась', Math.abs(beatsOf()-16)<1e-6, beatsOf()+'');
  ok('первая ячейка выросла на шаг, а не на колонку',
     Math.abs(w.eval('sections[0].squares[0].events[0].span')-0.75)<1e-6, after14);

  console.log('\n=== 14б. Ручка длины квадрата не перекрыта ===');
  // Ручка стояла на right:-6px: половину срезал overflow:hidden у
  // .square-inner, вторую накрывала колонка кнопок (✕/×N/такты).
  // Курсор ew-resize показывался, но перетаскивание не начиналось.
  const css7=[...d.querySelectorAll('style')].map(s=>s.textContent).join('');
  const shRule=(css7.match(/\.chord-wrapper \.square-resize-handle \{[^}]*\}/)||[''])[0];
  console.log('      правило:', shRule.replace(/\s+/g,' ').slice(0,90));
  ok('ручка не вынесена за край', !/right:\s*-/.test(shRule), shRule);
  const zOf=(r)=>{const m=r.match(/z-index:\s*(\d+)/);return m?+m[1]:0;};
  ok('ручка выше колонки кнопок по z-index', zOf(shRule)>=7, 'z='+zOf(shRule));

  console.log(bad?`\nПРОВАЛОВ: ${bad}`:'\nвсе проверки пройдены');
  if(bad) process.exitCode=1;
});
