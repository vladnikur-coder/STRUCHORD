// Подсечки шага: видны только когда шаг мельче доли, плотность
// соответствует масштабу, ярче во время перетаскивания.
const puppeteer=require('puppeteer');
(async()=>{
  const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-dev-shm-usage']});
  const p=await b.newPage();
  let bad=0; const ok=(n,c,x)=>{console.log(`   ${c?'ok  ':'FAIL'} ${n}${!c&&x!==undefined?' — '+x:''}`);if(!c)bad++;};
  p.on('pageerror',e=>{console.log('   ОШИБКА:',String(e).split('\n')[0]);bad++;});
  await p.setViewport({width:1440,height:800});
  await p.goto('file:///home/user/STRUCHORD.html',{waitUntil:'load'});
  await new Promise(r=>setTimeout(r,900));
  await p.evaluate(()=>{sections=[];addSection('Verse');
    sections[0].squares[0].events=[{chord:'Am',span:4},{chord:'F',span:4},
      {chord:'C',span:4},{chord:'G',span:4}];render();});
  await new Promise(r=>setTimeout(r,600));

  const probe=()=>p.evaluate(()=>{
    const el=document.querySelector('.chord-ticks-step');
    const cs=el?getComputedStyle(el):null;
    return {
      exists:!!el,
      opacity:cs?+cs.opacity:null,
      height:cs?parseFloat(cs.height):null,
      // Делитель и класс на body удалены: они пересчитывали все ячейки
      // (25 мс на 192) и роняли плавность на порогах. Плотность видна
      // по числу подсечек в стиле ячейки.
      subCount:(()=>{const e=document.querySelector('.chord-ticks-step');
        return ((e&&e.getAttribute('style')||'').match(/var\(--color-tick-substep\)/g)||[]).length/2;})(),
      resizing:document.body.classList.contains('is-resizing'),
      stepLabel:getResizeStepLabel(),
      zoom:squareZoom,
    };
  });

  console.log('=== 1× — шаг равен доле ===');
  let r=await probe();
  console.log(`      масштаб ${r.zoom}× (${r.stepLabel}), делитель ${r.divisor||'—'}, прозрачность ${r.opacity}`);
  ok('слой подсечек есть в разметке', r.exists);
  ok('при 1× подсечек нет', r.subCount===0, r.subCount+'');
  ok('класса is-substep нет', !r.substep);

  console.log('\n=== 1.5× — восьмые ===');
  await p.evaluate(()=>setSquareZoom(1.5));
  await new Promise(r=>setTimeout(r,300));
  r=await probe();
  console.log(`      масштаб ${r.zoom}× (${r.stepLabel}), подсечек ${r.subCount}`);
  ok('на восьмых подсечки есть', r.subCount>0, r.subCount+'');

  console.log('\n=== 2.5× — шестнадцатые ===');
  await p.evaluate(()=>setSquareZoom(2.5));
  await new Promise(r=>setTimeout(r,300));
  r=await probe();
  console.log(`      масштаб ${r.zoom}× (${r.stepLabel}), подсечек ${r.subCount}`);
  ok('на шестнадцатых их больше', r.subCount>0, r.subCount+'');

  console.log('\n=== Возврат к 1× ===');
  await p.evaluate(()=>resetSquareZoom());
  await new Promise(r=>setTimeout(r,400));
  r=await probe();
  ok('после сброса подсечек нет', r.subCount===0, r.subCount+'');

  console.log('\n=== Подсветка при перетаскивании ===');
  await p.evaluate(()=>setSquareZoom(2));
  await new Promise(r=>setTimeout(r,300));
  const beforeState=await probe();
  const before=beforeState.height;
  const h=await p.$('.resize-handle');
  const hb=await h.boundingBox();
  await p.mouse.move(hb.x+hb.width/2, hb.y+hb.height/2);
  await p.mouse.down();
  await p.mouse.move(hb.x+hb.width/2-20, hb.y+hb.height/2,{steps:4});
  await new Promise(r=>setTimeout(r,250));
  const during=await probe();
  console.log(`      высота подсечек: до ${before}px, во время ${during.height}px`);
  ok('класс is-resizing стоит', during.resizing);
  // Подсветка через высоту: цвет у подсечек собственный, приглушать его
  // прозрачностью нельзя — альфа перемножается и метки исчезают.
  ok('подсечки стали крупнее', during.height>before, `${before} -> ${during.height}`);
  await p.mouse.up();
  await new Promise(r=>setTimeout(r,400));
  const after=await probe();
  console.log(`      после отпускания ${after.height}px`);
  ok('класс снят', !after.resizing);
  ok('высота вернулась', Math.abs(after.height-before)<0.6, after.height+'');

  console.log('\n=== Плотность подсечек зависит от зума ===');
  // Подсечки перечислены явными точками в стиле ячейки, поэтому при
  // смене шага секция перерисовывается. Считаем метки в стиле.
  const countSub=async()=>p.evaluate(()=>{
    const el=document.querySelector('.chord-ticks-step');
    return ((el&&el.getAttribute('style')||'').match(/var\(--color-tick-substep\)/g)||[]).length;
  });
  await p.evaluate(()=>{setSquareZoom(1);
    sections[0].squares[0].events=[{chord:'Am',span:8},{chord:'F',span:8}];render();});
  await new Promise(r=>setTimeout(r,350));
  const c1=await countSub();
  await p.evaluate(()=>{setSquareZoom(2.5);render();});
  await new Promise(r=>setTimeout(r,350));
  const c25=await countSub();
  console.log(`      меток подсечек: 1× -> ${c1}, 2.5× -> ${c25}`);
  ok('плотность растёт с зумом', c25>c1, `${c1} -> ${c25}`);

  // --- Пиксельная проверка: подсечки должны быть РЕАЛЬНО видны ---
  // Первая версия задавала им общий с долями цвет под opacity 0.35.
  // Альфа перемножалась (0.22 x 0.35 = 0.077), контраст падал до 19
  // против 71 у долей — на экране пользователь видел только четверти.
  // Поэтому проверяем не наличие CSS-правил, а сами пиксели.
  console.log('\n=== Контраст меток на экране ===');
  const {PNG}=require('pngjs'); const fs=require('fs');
  const measure=async(zoom)=>{
    await p.evaluate((z)=>{setSquareZoom(1);
      sections[0].squares[0].events=[{chord:'Am',span:8},{chord:'F',span:8}];
      render(); setSquareZoom(z);},zoom);
    await new Promise(r=>setTimeout(r,400));
    const box=await p.evaluate(()=>{
      const w=document.querySelector('.chord-wrapper').getBoundingClientRect();
      return {x:Math.round(w.left)+4,y:Math.round(w.bottom)-9,
              width:Math.min(400,Math.round(w.width)-8),height:8};
    });
    await p.screenshot({path:'/tmp/_ticks.png',clip:box});
    const png=PNG.sync.read(fs.readFileSync('/tmp/_ticks.png'));
    const cols=[];
    for(let x=0;x<png.width;x++){
      let dark=255;
      for(let y=0;y<png.height;y++){
        const i=(png.width*y+x)<<2;
        const v=(png.data[i]+png.data[i+1]+png.data[i+2])/3;
        if(v<dark) dark=v;
      }
      cols.push(dark);
    }
    const bg=Math.max(...cols); const marks=[];
    let i=0;
    while(i<cols.length){
      if(bg-cols[i]>2){let j=i,min=cols[i];
        while(j<cols.length&&bg-cols[j]>2){min=Math.min(min,cols[j]);j++;}
        if(i>10) marks.push(+(bg-min).toFixed(0));   // пропускаем скруглённый угол
        i=j;} else i++;
    }
    return marks;
  };
  const m8=await measure(2);
  const strong=m8.filter(v=>v>60), weak=m8.filter(v=>v<=60);
  console.log(`      восьмые: метки ${m8.join(', ')}`);
  console.log(`      долей (сильных) ${strong.length}, подсечек ${weak.length}`);
  ok('подсечки вообще нарисованы', weak.length>0, JSON.stringify(m8));
  ok('подсечки заметны (контраст > 30)', weak.every(v=>v>30), JSON.stringify(weak));
  ok('доли всё равно заметнее подсечек',
     strong.length>0 && Math.min(...strong)>Math.max(...weak),
     `доли ${JSON.stringify(strong)} vs подсечки ${JSON.stringify(weak)}`);

  // --- Равномерность сетки: главное, что было сломано ---
  // Засечки рисовались внутри каждой ячейки от её левого края, поэтому
  // на каждой границе сетка стартовала заново. Замер показывал сдвиг до
  // 22px и расстояния между метками от 14 до 49 вместо ровных ~47.
  console.log('\n=== Равномерность сетки долей ===');
  const gridCheck=async(label,events)=>{
   try{
    await p.evaluate((ev)=>{
      setSquareZoom(1);
      document.body.classList.remove('is-resizing','is-substep');
      sections=[];globalTimeSig='4/4';addSection('Verse');
      sections[0].squares[0].events=ev.map(x=>({chord:x.c,span:x.s}));
      render();
      // Подсечки шага прячем: их метки чередуются с засечками долей и
      // дают промежутки вдвое короче, что для этой проверки шум.
      document.querySelectorAll('.chord-ticks-step').forEach(el=>{el.style.display='none';});
    },events);
    await p.mouse.move(2,2);
    await new Promise(r=>setTimeout(r,450));
    const geo=await p.evaluate(()=>{
      const inner=document.querySelector('.square-inner');
      const t=inner.getBoundingClientRect();
      return {x:Math.round(t.x),y:Math.round(t.bottom)-9,
              width:Math.round(t.width),height:8,
              beats:getSquareVisualBeats(sections[0].squares[0],'4/4')};
    });
    await p.screenshot({path:'/tmp/_grid.png',clip:{x:geo.x,y:geo.y,width:geo.width,height:geo.height}});
    const png=PNG.sync.read(fs.readFileSync('/tmp/_grid.png'));
    const cols=[];
    for(let x=0;x<png.width;x++){
      let dark=255;
      for(let y=0;y<png.height;y++){
        const i=(png.width*y+x)<<2;
        const v=(png.data[i]+png.data[i+1]+png.data[i+2])/3;
        if(v<dark)dark=v;
      }
      cols.push(dark);
    }
    const bg=Math.max(...cols);
    const marks=[]; let i=0;
    while(i<cols.length){
      if(bg-cols[i]>10){let j=i;
        while(j<cols.length&&bg-cols[j]>10)j++;
        // Края кадра — скруглённая рамка квадрата, а не засечки.
        if(i>6 && j<cols.length-6) marks.push((i+j-1)/2);
        i=j;} else i++;
    }
    const pitch=(geo.width+2)/geo.beats;
    // Границы ячеек тоже тёмные (зазор грида) и попадают в выборку.
    // Обычно они совпадают с узлами сетки и не мешают, но при затакте
    // край ячейки стоит в пол-доли от узла — такой промежуток не
    // характеризует сетку. Нормируем по ближайшему кратному шага и
    // отбрасываем явные половинки.
    const clean=marks;
    const gaps=clean.slice(1).map((v,k)=>v-clean[k])
      .filter(g=>Math.abs(g/pitch-Math.round(g/pitch))<0.25);
    // Там, где узел пришёлся на стык ячеек, метки нет — промежуток
    // становится кратным шагу. Нормируем и сравниваем «длину доли».
    const norm=gaps.map(g=>g/Math.max(1,Math.round(g/pitch)));
    const lo=norm.length?Math.min(...norm):0, hi=norm.length?Math.max(...norm):0;
    console.log(`      ${label}: шаг ${pitch.toFixed(1)}px, меток ${clean.length}, `+
      `доля ${lo.toFixed(1)}..${hi.toFixed(1)}px`);
    ok(`${label}: доли одинаковой длины`, norm.length>1 && (hi-lo)<=3,
       norm.length>1?`разброс ${(hi-lo).toFixed(1)}px`:`меток ${marks.length}`);
   }catch(e){ console.log(`   ОШИБКА в «${label}»: ${e.message}`); bad++; }
  };
  await gridCheck('ровный квадрат',[{c:'Am',s:4},{c:'F',s:4},{c:'C',s:4},{c:'G',s:4}]);
  await gridCheck('разные длины',[{c:'Am',s:2},{c:'F',s:6},{c:'C',s:4},{c:'G',s:4}]);
  await gridCheck('с затактом',[{c:'Am',s:0.5},{c:'F',s:3.5},{c:'C',s:4},{c:'G',s:8}]);
  await gridCheck('много мелких',[{c:'A',s:1},{c:'B',s:1},{c:'C',s:2},{c:'D',s:4},{c:'E',s:8}]);

  // --- Сетка едина по ВСЕЙ СЕКЦИИ, а не только внутри квадрата ---
  // Ширина квадрата считалась в колонках грида, а не в долях. Квадрат с
  // затактом даёт вдвое больше колонок при той же длине в долях, поэтому
  // ровный сосед получал 50% ширины вместо 100%, и доля в нём была вдвое
  // короче: 23px против 47px. Внутри каждого квадрата сетка выглядела
  // ровной — расходилась она между квадратами.
  console.log('\n=== Единая сетка по секции ===');
  const sectionCheck=async(label,squares,ts)=>{
    await p.evaluate((sqs,t)=>{
      setSquareZoom(1); document.body.classList.remove('is-resizing');
      sections=[]; globalTimeSig=t; addSection('Verse');
      const sec=sections[0]; sec.squares=[];
      sqs.forEach((ev,i)=>sec.squares.push({id:5000+i,repeat:1,strumPattern:null,
        customBeats:ev.reduce((a,x)=>a+x.s,0),
        events:ev.map(x=>({chord:x.c,span:x.s,timeSig:x.ts||null}))}));
      render();
    },squares,ts||'4/4');
    await new Promise(r=>setTimeout(r,420));
    const vals=await p.evaluate(()=>{
      const ts=sections[0].timeSig||globalTimeSig;
      return [...document.querySelectorAll('.square-inner')].map((inner,i)=>{
        const sq=sections[0].squares[i];
        const beats=sq.events.reduce((a,e)=>a+getEventVisualSpanInParentUnits(e,ts),0);
        return +(inner.getBoundingClientRect().width/beats).toFixed(2);
      });
    });
    const spread=+(Math.max(...vals)-Math.min(...vals)).toFixed(2);
    console.log(`      ${label}: доля = ${vals.join(', ')}px -> разброс ${spread}px`);
    ok(`${label}: доля одинакова во всех квадратах`, spread<1, `разброс ${spread}px`);
  };
  await sectionCheck('ровный + с затактом',[
    [{c:'Am',s:4},{c:'F',s:4},{c:'C',s:4},{c:'G',s:4}],
    [{c:'C',s:0.5},{c:'G',s:3.5},{c:'A',s:4},{c:'D',s:8}]]);
  await sectionCheck('затакт шестнадцатой',[
    [{c:'A',s:0.25},{c:'B',s:3.75},{c:'C',s:4},{c:'D',s:8}],
    [{c:'E',s:16}]]);
  await sectionCheck('квадраты разной длины',[
    [{c:'A',s:0.5},{c:'B',s:7.5}],
    [{c:'C',s:16}],
    [{c:'D',s:8}]]);
  await sectionCheck('составной размер 6/8',[
    [{c:'A',s:3},{c:'B',s:3}],
    [{c:'C',s:0.5},{c:'D',s:2.5},{c:'E',s:3}]],'6/8');

  // --- Засечки не дублируют границы ячеек ---
  // Границу рисует сам грид (зазор 2px во всю высоту). Засечка, попавшая
  // в ту же точку, ложится вплотную и читается как сдвоенная линия вдвое
  // толще прочих — замер до правки давал 4px против 2px. Такие метки
  // маскируются, поэтому в кадре не должно быть пятен шире 3px.
  console.log('\n=== Нет сдвоенных линий на стыках ===');
  const dblCheck=async(label,events)=>{
    await p.evaluate((ev)=>{
      setSquareZoom(1); document.body.classList.remove('is-resizing');
      sections=[];globalTimeSig='4/4';addSection('Verse');
      sections[0].squares[0].events=ev.map(x=>({chord:x.c,span:x.s}));
      render();
    },events);
    // Курсор мог остаться над ячейкой после предыдущих проверок: тогда
    // подсвечивается .resize-handle (полупрозрачная плашка 10px), и она
    // попадает в кадр как «сдвоенная линия». Уводим мышь в угол.
    await p.mouse.move(2,2);
    await new Promise(r=>setTimeout(r,420));
    const geo=await p.evaluate(()=>{
      const t=document.querySelector('.chord-ticks').getBoundingClientRect();
      return {x:Math.round(t.x),y:Math.round(t.y),
              width:Math.round(t.width),height:Math.round(t.height)};
    });
    await p.screenshot({path:'/tmp/_dbl.png',clip:geo});
    const png=PNG.sync.read(fs.readFileSync('/tmp/_dbl.png'));
    const cols=[];
    for(let x=0;x<png.width;x++){
      let d=255;
      for(let y=0;y<png.height;y++){
        const k=(png.width*y+x)<<2;
        const v=(png.data[k]+png.data[k+1]+png.data[k+2])/3;
        if(v<d)d=v;}
      cols.push(d);}
    const bg=Math.max(...cols);
    const marks=[];const dbg=[];let i=0;
    while(i<cols.length){
      if(bg-cols[i]>10){let e=i;while(e<cols.length&&bg-cols[e]>10)e++;
        // Края кадра занимает рамка квадрата со скруглением — это не
        // засечки, отбрасываем полосу в 10px с каждой стороны.
        if(i>10 && e<cols.length-10){marks.push(e-i); dbg.push(`${i}-${e-1}(${e-i})`);}
        i=e;}else i++;}
    const wide=marks.filter(w=>w>3);
    console.log(`      ${label}: меток ${marks.length}, ширины ${[...new Set(marks)].sort((a,b)=>a-b).join('/')}px`);
    ok(`${label}: нет сдвоенных`, wide.length===0, `${wide.length} шт. шире 3px`);
  };
  await dblCheck('ровный квадрат',[{c:'Am',s:4},{c:'F',s:4},{c:'C',s:4},{c:'G',s:4}]);
  await dblCheck('мелкие ячейки',[{c:'A',s:1},{c:'B',s:1},{c:'C',s:2},{c:'D',s:4},{c:'E',s:8}]);
  await dblCheck('с затактом',[{c:'A',s:0.5},{c:'B',s:3.5},{c:'C',s:4},{c:'D',s:8}]);

  // --- Маска стыков работает и при сильном зуме ---
  // Маска — градиент без своего размера: по умолчанию mask-repeat:repeat,
  // и браузер её замащивал, из-за чего окна вставали не там. Плюс окно
  // в 3px не накрывало засечку целиком — оставалась половинка вплотную
  // к разделителю, заметная при 400%.
  console.log('\n=== Стыки чистые на всех масштабах ===');
  for (const zoom of [1,2,4]) {
    await p.evaluate((z)=>{
      setSquareZoom(1); document.body.classList.remove('is-resizing');
      sections=[];globalTimeSig='4/4';addSection('Verse');
      sections[0].squares[0].events=[{chord:'Am',span:4},{chord:'F',span:4},
        {chord:'C',span:4},{chord:'G',span:4}];
      render(); setSquareZoom(z); render();
      // Прячем подсечки шага, чтобы в кадре остались только засечки
      // долей и разделители ячеек. Фон НЕ трогаем: разделитель — это
      // зазор грида, он рисуется фоном .square-inner, и обеление
      // сделало бы стыки невидимыми.
      const inner=document.querySelector('.square-inner');
      inner.querySelector('.chord-ticks-step').style.display='none';
    },zoom);
    await p.mouse.move(2,2);
    await new Promise(r=>setTimeout(r,500));
    const info=await p.evaluate(()=>{
      const inner=document.querySelector('.square-inner');
      const t=inner.getBoundingClientRect();
      const vis=getSquareVisualBeats(sections[0].squares[0],'4/4');
      const vp=inner.closest('.squares-viewport');
      const vr=vp?vp.getBoundingClientRect().right:Infinity;
      return {x:Math.round(t.x),y:Math.round(t.y),
        width:Math.min(Math.round(t.width),3000),height:8,
        viewportRight:Math.round(vr),
        y2:Math.round(t.bottom)-9,
        pitch:(t.width+2)/vis,
        edges:[...inner.querySelectorAll('.chord-wrapper')]
          .map(c=>+(c.getBoundingClientRect().left-t.left).toFixed(1)).filter(e=>e>1)};
    });
    // При зуме квадрат шире экрана, и правая часть в кадр не попадает.
    // Обрезает его НЕ окно браузера, а прокручиваемый .squares-viewport:
    // на 4× квадрат 3018px, окно 1400, а вьюпорт всего 756px. Считали по
    // окну (1076) — в зону проверки попадал стык на 755.5, лежащий ровно
    // на кромке обрезки: разделитель там виден лишь наполовину, и стенд
    // годами ругался на несуществующий дефект.
    const clipW=Math.min(info.viewportRight, p.viewport().width)-info.x-2;
    const visW=Math.max(0,Math.min(info.width, clipW));
    if(visW<50){ console.log(`      ${zoom}×: пропуск, слой вне окна`); continue; }
    await p.screenshot({path:'/tmp/_zoomtick.png',clip:{x:info.x,y:info.y2,
      width:visW,height:info.height}});
    const png=PNG.sync.read(fs.readFileSync('/tmp/_zoomtick.png'));
    const cols=[];
    for(let x=0;x<png.width;x++){let d=255;
      for(let y=0;y<png.height;y++){const k=(png.width*y+x)<<2;
        const v=(png.data[k]+png.data[k+1]+png.data[k+2])/3; if(v<d)d=v;}
      cols.push(d);}
    const bg=Math.max(...cols); const marks=[];let i=0;
    while(i<cols.length){
      if(bg-cols[i]>10){let e=i;while(e<cols.length&&bg-cols[e]>10)e++;
        marks.push({c:(i+e-1)/2,w:e-i});i=e;}else i++;}
    // у каждого стыка должна быть ровно ОДНА метка — сам разделитель (2px)
    let badEdge=0;
    // Отступ 8px мал: разделитель на самой кромке кадра виден частично.
    const seen=info.edges.filter(e=>e<visW-12);
    seen.forEach(e=>{
      const near=marks.filter(m=>Math.abs(m.c-e)<5);
      if(near.length!==1 || near[0].w>3) badEdge++;
    });
    console.log(`      ${zoom}×: шаг ${info.pitch.toFixed(1)}px, стыков в кадре ${seen.length}, лишних меток ${badEdge}`);
    ok(`${zoom}×: у стыков нет лишних засечек`, badEdge===0, `${badEdge} шт.`);
  }

  // --- Ряды квадратов совпадают по вертикали ---
  // Это то, что видно глазом: засечки верхнего и нижнего квадрата
  // должны стоять на одной линии. Раньше формула делила ширину ячейки
  // просто на число долей, забыв про зазоры грида (2px между
  // колонками), и метки уходили от разделителей на 1.5…3px —
  // расхождение копилось к правому краю.
  console.log('\n=== Ряды совпадают по вертикали ===');
  const rowMarks=async(row,limitRight)=>{
    const width=Math.min(row.w, limitRight-row.x-2);
    if(width<50) return null;
    await p.screenshot({path:'/tmp/_rowm.png',clip:{x:row.x,y:row.y,width,height:8}});
    const png=PNG.sync.read(fs.readFileSync('/tmp/_rowm.png'));
    const cols=[];
    for(let x=0;x<png.width;x++){let d=255;
      for(let y=0;y<png.height;y++){const k=(png.width*y+x)<<2;
        const v=(png.data[k]+png.data[k+1]+png.data[k+2])/3; if(v<d)d=v;}
      cols.push(d);}
    const bg=Math.max(...cols); const m=[];let i=0;
    while(i<cols.length){
      if(bg-cols[i]>10){let e=i;while(e<cols.length&&bg-cols[e]>10)e++;
        if(i>6&&e<cols.length-6) m.push((i+e-1)/2);
        i=e;}else i++;}
    return m;
  };
  for(const zoom of [1,2,4]){
    await p.evaluate((z)=>{
      setSquareZoom(1); document.body.classList.remove('is-resizing');
      sections=[]; globalTimeSig='4/4'; addSection('Verse');
      const sec=sections[0]; sec.squares=[];
      [[{c:'Am',s:4},{c:'F',s:4},{c:'C',s:4},{c:'G',s:4}],
       [{c:'C',s:0.5},{c:'G',s:3.5},{c:'A',s:4},{c:'D',s:8}]]
        .forEach((ev,i)=>sec.squares.push({id:7000+i,repeat:1,strumPattern:null,
          customBeats:ev.reduce((a,x)=>a+x.s,0),
          events:ev.map(x=>({chord:x.c,span:x.s,timeSig:null}))}));
      render(); setSquareZoom(z); render();
    },zoom);
    await p.mouse.move(2,2);
    await new Promise(r=>setTimeout(r,600));
    const g=await p.evaluate(()=>{
      const card=document.querySelector('.section-card');
      return {rows:[...card.querySelectorAll('.square-inner')].map(inner=>{
        const r=inner.getBoundingClientRect();
        return {x:Math.round(r.x),y:Math.round(r.bottom)-9,w:Math.round(r.width)};
      }), vpRight:Math.round(card.querySelector('.squares-viewport').getBoundingClientRect().right)};
    });
    const a=await rowMarks(g.rows[0],g.vpRight);
    const c=await rowMarks(g.rows[1],g.vpRight);
    if(!a||!c||!a.length||!c.length){console.log(`      ${zoom}×: ряд вне окна, пропуск`); continue;}
    let worst=0;
    c.forEach(x=>{
      const n=a.reduce((best,v)=>Math.abs(v-x)<Math.abs(best-x)?v:best,a[0]);
      if(Math.abs(n-x)<20) worst=Math.max(worst,Math.abs(n-x));
    });
    console.log(`      ${zoom}×: верх ${a.length} меток, низ ${c.length}, худшее расхождение ${worst.toFixed(1)}px`);
    // 1.5px — округление позиций до целых пикселей при отрисовке.
    ok(`${zoom}×: ряды совпадают`, worst<=1.5, `расхождение ${worst.toFixed(1)}px`);
  }

  console.log(bad?`\n  ПРОВАЛОВ: ${bad}`:'\n  все проверки пройдены');
  await b.close();
  process.exitCode=bad?1:0;
})();
