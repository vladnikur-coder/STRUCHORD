// content-visibility пропускает раскладку скрытого — убеждаемся, что
// после жеста всё измеряется корректно и класс снимается.
const puppeteer=require('puppeteer');
(async()=>{
  const browser=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage(); page.setDefaultTimeout(30000);
  await page.setViewport({width:1440,height:900});
  let bad=0; const ok=(n,c,x)=>{console.log(`   ${c?'ok  ':'FAIL'} ${n}${!c&&x!==undefined?' — '+x:''}`);if(!c)bad++;};
  page.on('pageerror',e=>{console.log('   ОШИБКА СТРАНИЦЫ:',String(e).split('\n')[0]);bad++;});
  await page.goto('file:///home/user/STRUCHORD.html',{waitUntil:'load'});
  await new Promise(r=>setTimeout(r,800));
  await page.evaluate(()=>{
    sections=[];
    for(let i=0;i<6;i++){
      addSection(['Verse','Chorus','Bridge'][i%3]);
      const sec=sections[sections.length-1];
      while(sec.squares.length<16) sec.squares.push({id:nextId++,repeat:1,customBeats:16,
        strumPattern:null,events:[{chord:'Am',span:4},{chord:'F',span:4},
        {chord:'Cmaj7',span:4},{chord:'G7',span:4}]});
    }
    setSquareZoom(1); render();
  });
  await new Promise(r=>setTimeout(r,600));

  const box=await (await page.$('.squares-viewport')).boundingBox();
  const vp=page.viewport();
  await page.mouse.move(Math.round(Math.min(box.x+box.width/2,vp.width-20)),
                        Math.round(Math.min(box.y+40,vp.height-20)));
  await page.keyboard.down('Control');
  for(let i=0;i<40;i++){await page.mouse.wheel({deltaY:-6}); await new Promise(r=>setTimeout(r,16));}
  await page.keyboard.up('Control');

  ok('во время жеста класс is-zooming стоит',
     await page.evaluate(()=>document.body.classList.contains('is-zooming')));
  // Класс снимается по таймеру в 200 мс после последнего события —
  // ждём его, а не гадаем с фиксированной паузой.
  let cleared=false;
  for(let i=0;i<20;i++){
    await new Promise(r=>setTimeout(r,100));
    if(!await page.evaluate(()=>document.body.classList.contains('is-zooming'))){cleared=true;break;}
  }
  ok('после жеста класс снят', cleared);

  // Геометрия ячеек: все ли имеют ненулевой прямоугольник после жеста.
  const geo=await page.evaluate(()=>{
    const els=[...document.querySelectorAll('.chord-wrapper')];
    const zero=els.filter(e=>e.getBoundingClientRect().width<=0).length;
    return {total:els.length,zero};
  });
  console.log(`      ячеек ${geo.total}, с нулевой шириной ${geo.zero}`);
  ok('все ячейки измеримы после жеста', geo.zero===0, geo.zero+'');

  // Текст аккордов на месте (важно для Ctrl+F и печати).
  // Сверяем подписи с моделью: пустая подпись законна ровно там, где в
  // событии пустой аккорд (такие есть в квадратах по умолчанию).
  const txt=await page.evaluate(()=>{
    const d=[...document.querySelectorAll('.chord-display:not(.chord-display--ruler)')];
    let mismatch=0, empty=0;
    d.forEach(e=>{
      const inp=e.previousElementSibling;
      const raw=inp&&inp.classList.contains('chord-input')?(inp.value||'').trim():'';
      const shown=e.textContent.trim();
      if(!shown) empty++;
      if(raw && !shown) mismatch++;      // есть аккорд, но подписи нет
      if(!raw && shown) mismatch++;      // подпись без аккорда
    });
    return {total:d.length, empty, mismatch};
  });
  console.log(`      подписей ${txt.total}, пустых ${txt.empty} (пустые аккорды), расхождений ${txt.mismatch}`);
  ok('каждая непустая ячейка подписана', txt.mismatch===0, txt.mismatch+'');

  // Подгонка имён: при 1× ячейка ~186px, Cmaj7 помещается целиком, так
  // что сокращать нечего. Чтобы проверить механизм, делаем ячейку
  // действительно узкой — 16 событий в квадрате.
  await page.evaluate(()=>{
    resetSquareZoom();
    sections=[]; addSection('Verse');
    const sq=sections[0].squares[0];
    sq.events=Array.from({length:16},()=>({chord:'Cmaj7',span:1}));
    sq.customBeats=16;
    render();
  });
  await new Promise(r=>setTimeout(r,700));
  const narrow=await page.evaluate(()=>{
    const d=[...document.querySelectorAll('.chord-display:not(.chord-display--ruler)')];
    return {compact:d.filter(e=>/Δ/.test(e.textContent)).length,
            full:d.filter(e=>/Cmaj7/.test(e.textContent)).length,
            w:Math.round(d[0]?d[0].clientWidth:0)};
  });
  console.log(`      ячейка ${narrow.w}px: сокращённых ${narrow.compact}, полных ${narrow.full}`);
  ok('на узкой ячейке имя сокращается', narrow.compact>0, JSON.stringify(narrow));

  // Зум расширяет те же ячейки — имя должно развернуться обратно.
  // Это и проверяет, что кэш ширин не «залипает» на сокращённом виде.
  await page.evaluate(()=>{setSquareZoom(4);});
  await new Promise(r=>setTimeout(r,700));
  const wide=await page.evaluate(()=>{
    const d=[...document.querySelectorAll('.chord-display:not(.chord-display--ruler)')];
    return {full:d.filter(e=>/Cmaj7/.test(e.textContent)).length,
            compact:d.filter(e=>/Δ/.test(e.textContent)).length,
            w:Math.round(d[0]?d[0].clientWidth:0)};
  });
  console.log(`      при 4× ячейка ${wide.w}px: полных ${wide.full}, сокращённых ${wide.compact}`);
  ok('после расширения имя разворачивается', wide.full>0, JSON.stringify(wide));

  console.log(bad?`\n  ПРОВАЛОВ: ${bad}`:'\n  все проверки пройдены');
  await browser.close();
  process.exitCode=bad?1:0;
})();
