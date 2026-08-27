// Картинка ВО ВРЕМЯ перетаскивания должна совпадать с той, что после
// отпускания. Раньше при дробном шаге ячейки округлялись к целым
// колонкам при неизменной сетке грида: они вылезали за квадрат,
// и раскладка «разваливалась» под курсором, а render() чинил её только
// на отпускании.
const puppeteer=require('puppeteer'); const fs=require('fs');
(async()=>{
  const song=JSON.parse(fs.readFileSync('/home/user/dev/fixtures/wind-of-change.json','utf8'));
  const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-dev-shm-usage']});
  const p=await b.newPage(); await p.setViewport({width:1400,height:1000});
  let bad=0; const ok=(n,c,x)=>{console.log(`   ${c?'ok  ':'FAIL'} ${n}${!c&&x!==undefined?' — '+x:''}`);if(!c)bad++;};
  p.on('pageerror',e=>{console.log('   ОШИБКА:',String(e).split('\n')[0]);bad++;});
  await p.goto('file:///home/user/STRUCHORD.html',{waitUntil:'load'});
  await new Promise(r=>setTimeout(r,900));

  const load=async(z,useSong)=>{
    await p.evaluate((s,zz,us)=>{
      if(us){localStorage.setItem('struchord_songs',JSON.stringify([s]));loadSong(0);}
      else{sections=[];globalTimeSig='4/4';addSection('Verse');
        sections[0].squares[0].events=[{chord:'Am',span:4},{chord:'F',span:4},
          {chord:'C',span:4},{chord:'G',span:4}];render();}
      setSquareZoom(zz); render();
    },song,z,useSong);
    await new Promise(r=>setTimeout(r,700));
  };
  const shot=(sqIdx)=>p.evaluate((qi)=>{
    const sq=document.querySelectorAll('.section-card')[0].querySelectorAll('.square')[qi];
    const inner=sq.querySelector('.square-inner');
    const ir=inner.getBoundingClientRect();
    return {
      cols:(inner.style.gridTemplateColumns.match(/repeat\((\d+)/)||[])[1],
      // левые края ячеек относительно квадрата — это и есть «картинка»
      edges:[...sq.querySelectorAll('.chord-wrapper')]
        .map(c=>+(c.getBoundingClientRect().left-ir.left).toFixed(1)),
      widths:[...sq.querySelectorAll('.chord-wrapper')]
        .map(c=>+c.getBoundingClientRect().width.toFixed(1)),
      innerW:+ir.width.toFixed(1),
      ticks:(inner.querySelector('.square-ticks')||{}).style?.background?.slice(-30)||'',
    };
  },sqIdx);

  const cases=[
    ['песня, квадрат 2/4, зум 1×',   true, 1,   1, 0],
    ['песня, квадрат 2/4, зум 2×',   true, 2,   1, 0],
    ['песня, квадрат 2/4, зум 2.5×', true, 2.5, 1, 0],
    ['ровный квадрат, зум 2.5×',     false,2.5, 0, 0],
    ['ровный квадрат, зум 4×',       false,4,   0, 0],
  ];

  for(const [label,useSong,zoom,sqIdx,hIdx] of cases){
    await load(zoom,useSong);
    const step=await p.evaluate(()=>getResizeStep());
    const beatPx=await p.evaluate((qi)=>{
      const inner=document.querySelectorAll('.section-card')[0].querySelectorAll('.square-inner')[qi];
      const sq=sections[0].squares[qi];
      return inner.getBoundingClientRect().width/getSquareVisualBeats(sq,'4/4');
    },sqIdx);

    const pos=await p.evaluate((qi,h)=>{
      const el=document.querySelectorAll('.section-card')[0]
        .querySelectorAll('.square')[qi].querySelectorAll('.resize-handle')[h];
      el.scrollIntoView({block:'nearest',inline:'center'});
      const r=el.getBoundingClientRect();
      return {x:r.x+r.width/2,y:r.y+r.height/2};
    },sqIdx,hIdx);

    await p.mouse.move(pos.x,pos.y); await p.mouse.down();
    await p.mouse.move(pos.x+beatPx*step*1.2,pos.y);
    await new Promise(r=>setTimeout(r,80));
    const during=await shot(sqIdx);
    await p.mouse.up(); await new Promise(r=>setTimeout(r,400));
    const after=await shot(sqIdx);

    const sumW=during.widths.reduce((a,c)=>a+c,0);
    // допуск: зазоры грида (2px между ячейками) + рамка
    const gapAllow=during.widths.length*2+4;
    const fits=sumW<=during.innerW+1 && sumW>=during.innerW-gapAllow;
    const same=JSON.stringify(during.edges)===JSON.stringify(after.edges);

    console.log(`\n   ${label} (шаг ${step})`);
    console.log(`      во время: колонок=${during.cols} края=${JSON.stringify(during.edges)}`);
    console.log(`      после:    колонок=${after.cols} края=${JSON.stringify(after.edges)}`);
    ok('ячейки не вылезают за квадрат', fits,
       `сумма ${sumW.toFixed(1)} при ширине ${during.innerW}`);
    ok('картинка не прыгает на отпускании', same,
       `${JSON.stringify(during.edges)} -> ${JSON.stringify(after.edges)}`);
    ok('сетка засечек та же', during.ticks===after.ticks);
  }

  console.log(bad?`\n  ПРОВАЛОВ: ${bad}`:'\n  все проверки пройдены');
  await b.close();
  process.exitCode=bad?1:0;
})();
