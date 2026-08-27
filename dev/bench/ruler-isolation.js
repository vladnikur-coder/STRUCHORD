// Линейка — тоже .chord-display в body. Убеждаемся, что она не попадает
// в кэш координат ячеек, в наблюдатель размеров и в экспорт песни.
const puppeteer=require('puppeteer');
(async()=>{
  const browser=await puppeteer.launch({headless:'new',args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage();
  await page.setViewport({width:1440,height:900});
  let bad=0; const ok=(n,c,x)=>{console.log(`   ${c?'ok  ':'FAIL'} ${n}${!c&&x!==undefined?' — '+x:''}`);if(!c)bad++;};
  page.on('pageerror',e=>{console.log('   ОШИБКА:',String(e).split('\n')[0]);bad++;});
  await page.goto('file:///home/user/STRUCHORD.html',{waitUntil:'load'});
  await new Promise(r=>setTimeout(r,800));
  await page.evaluate(()=>{
    sections=[]; addSection('Verse');
    sections[0].squares[0].events=[{chord:'Cmaj7',span:8},{chord:'Am',span:8}];
    render();
  });
  await new Promise(r=>setTimeout(r,600));
  const r=await page.evaluate(()=>{
    // спровоцировать создание линейки
    fitChordDisplay(document.querySelector('.chord-display'), 5);
    const rulers=document.querySelectorAll('.chord-display--ruler');
    ensureChordWrapperRects && ensureChordWrapperRects();
    return {
      rulers: rulers.length,
      inBody: rulers[0] ? rulers[0].parentElement === document.body : false,
      // линейка не должна быть внутри секции
      inSection: [...rulers].some(x=>!!x.closest('.section-card')),
      // кэш координат строится по .chord-wrapper — линейки там быть не может
      wrappers: document.querySelectorAll('.chord-wrapper').length,
      rectCache: chordWrapperRectCache.length,
      // повторные замеры не плодят линейки
      after: (()=>{for(let i=0;i<5;i++) fitChordDisplay(document.querySelector('.chord-display'), 5+i);
                    return document.querySelectorAll('.chord-display--ruler').length;})(),
      // экспорт не содержит следов линейки
      exportClean: !JSON.stringify({sections}).includes('ruler'),
      cacheSize: chordFullWidthCache.size,
    };
  });
  console.log(`      линеек: ${r.rulers} (после 5 замеров: ${r.after}), кэш имён: ${r.cacheSize}`);
  console.log(`      .chord-wrapper: ${r.wrappers}, в кэше координат: ${r.rectCache}`);
  ok('линейка ровно одна', r.rulers===1, r.rulers+'');
  ok('повторные замеры не плодят линейки', r.after===1, r.after+'');
  ok('линейка лежит в body, не в секции', r.inBody && !r.inSection);
  ok('кэш координат совпадает с числом ячеек', r.rectCache===r.wrappers,
     `${r.rectCache} vs ${r.wrappers}`);
  ok('экспорт песни чист', r.exportClean);
  console.log(bad?`\n  ПРОВАЛОВ: ${bad}`:'\n  все проверки пройдены');
  await browser.close();
  process.exitCode=bad?1:0;
})();
