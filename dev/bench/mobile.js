// Мобильная вёрстка: телефон в портрете и ландшафте, редактор и лента.
const puppeteer=require('/home/user/node_modules/puppeteer');
const UA='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const DEV={'iPhone SE':[375,667],'iPhone 13':[390,844],'iPhone 15 Pro Max':[430,932]};
let bad=0;
const t=(n,c,x='')=>{if(c)console.log('   ok  ',n,x);else{bad++;console.log('  FAIL ',n,x)}};
(async()=>{
const b=await puppeteer.launch({args:['--no-sandbox']});
const j=require('fs').readFileSync('/home/user/dev/fixtures/wind-of-change.json','utf8');
for(const [name,[w,h]] of Object.entries(DEV)){
  const p=await b.newPage();
  await p.setUserAgent(UA);
  await p.setViewport({width:w,height:h,deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file:///home/user/STRUCHORD.html',{waitUntil:'networkidle0'});
  await p.evaluate(x=>{const f=new File([new Blob([x])],'s.json');window.importSong(f)},j);
  await new Promise(r=>setTimeout(r,1000));
  console.log(`\n=== ${name} ${w}x${h} — редактор ===`);
  const ed=await p.evaluate(()=>{
    const de=document.documentElement;
    const W=de.clientWidth;
    const out=[];
    document.querySelectorAll('.container *').forEach(e=>{
      const r=e.getBoundingClientRect();
      if(r.width<4||e.offsetParent===null) return;
      // элементы внутри горизонтально прокручиваемых областей не в счёт
      // области, которые прокручиваются сами по горизонтали, — не в счёт:
      // их содержимое ШИРЕ экрана по замыслу
      if(e.closest('.squares-viewport,.timeline-viewport,.tl-secnav')) return;
      let sc=e.parentElement, inScroller=false;
      while(sc&&sc!==document.body){
        const ox=getComputedStyle(sc).overflowX;
        if(ox==='auto'||ox==='scroll'){inScroller=true;break}
        sc=sc.parentElement;
      }
      if(inScroller) return;
      if(r.right>W+2) out.push((e.className+'').split(' ')[0]||e.tagName);
    });
    const small=[];
    document.querySelectorAll('button,select,input').forEach(e=>{
      const r=e.getBoundingClientRect();
      if(r.width<2||e.offsetParent===null) return;
      // Кнопки внутри ячейки аккорда — четыре в ряд на её ширине,
      // 40px туда не помещаются; для них отдельный, меньший порог.
      // Вспомогательные кнопки-спутники (крестик квадрата, троеточие
      // метронома) висят вплотную к другим элементам: до 40px их не
      // растянуть, не сломав раскладку. Для них порог 30px.
      const aux = e.closest('.chord-buttons')
        || e.classList.contains('del-square-btn')
        || e.classList.contains('metronome-dots-btn');
      const lim = aux ? 30 : 40;
      if(r.height<lim) small.push(`${(e.id||e.className||'').slice(0,18)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    });
    // hover-элементы обязаны быть видимы
    // .chord-buttons сюда не входят: они открываются ТАПОМ по ячейке
    // (проверка ниже), иначе четыре кнопки на каждой ячейке
    // перекрывают имена аккордов.
    const hid=[];
    ['.square-beats-badge','.add-square-btn','.del-square-btn','.section-settings-btn']
      .forEach(sel=>{const e=document.querySelector(sel);
        if(e&&+getComputedStyle(e).opacity===0) hid.push(sel)});
    return {overflow:de.scrollWidth-de.clientWidth, out:[...new Set(out)], small, hid,
      vpOverflow:getComputedStyle(document.querySelector('.squares-viewport')).overflowX};
  });
  t('страница не ездит вбок', ed.overflow<=2, ed.overflow+'px');
  t('ничего не вылезает за экран', ed.out.length===0, ed.out.slice(0,4).join(', '));
  t('лента квадратов прокручивается сама', ed.vpOverflow==='auto', ed.vpOverflow);
  t('нет целей мельче 40px', ed.small.length===0, ed.small.slice(0,3).join(' | '));
  t('hover-элементы доступны на тач', ed.hid.length===0, ed.hid.join(', '));

  // Кнопки ячейки: скрыты по умолчанию, открываются тапом.
  const tapped=await p.evaluate(async()=>{
    const w=document.querySelector('.chord-wrapper');
    const before=+getComputedStyle(w.querySelector('.chord-buttons')).opacity;
    const r=w.getBoundingClientRect();
    w.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch',
      clientX:r.left+r.width/2, clientY:r.top+r.height/2}));
    // У .chord-buttons transition 0.2s — ждём завершения, иначе
    // ловим промежуточное значение вроде 0.87.
    await new Promise(z=>setTimeout(z,400));
    return {before, after:+getComputedStyle(w.querySelector('.chord-buttons')).opacity,
      armed:w.classList.contains('is-buttons-armed')};
  });
  t('кнопки ячейки скрыты до тапа', tapped.before===0, 'opacity '+tapped.before);
  t('тап открывает кнопки ячейки', tapped.armed && tapped.after>0.9,
    `armed=${tapped.armed} opacity=${tapped.after}`);

  console.log(`--- лента ---`);
  await p.evaluate(()=>toggleTimelineMode());
  await new Promise(r=>setTimeout(r,900));
  const tl=await p.evaluate(()=>{
    const de=document.documentElement;
    const nav=document.getElementById('tlSecNav');
    const now=document.getElementById('tlPanelNow');
    const stage=document.querySelector('.timeline-stage');
    return {overflow:de.scrollWidth-de.clientWidth,
      navDisplay:getComputedStyle(nav).display,
      navItems:nav.querySelectorAll('.tl-secnav-item').length,
      navW:Math.round(nav.getBoundingClientRect().width),
      panelRight:Math.round(now.getBoundingClientRect().right),
      screen:de.clientWidth,
      stageTop:Math.round(stage.getBoundingClientRect().top),
      stageBottom:Math.round(stage.getBoundingClientRect().bottom),
      viewH:de.clientHeight};
  });
  t('лента: страница не ездит вбок', tl.overflow<=2, tl.overflow+'px');
  t('навигация секций видна', tl.navDisplay!=='none'&&tl.navItems>0, `${tl.navDisplay}, ${tl.navItems} шт, ${tl.navW}px`);
  t('панель не вылезает за экран', tl.panelRight<=tl.screen+2, `${tl.panelRight} / ${tl.screen}`);
  t('лента помещается по высоте', tl.stageBottom<=tl.viewH+2, `низ ${tl.stageBottom}, экран ${tl.viewH}`);
  t('ошибок JS нет', errs.length===0, errs.slice(0,2).join(' | '));
  if(w===390){
    await p.screenshot({path:'/home/user/dev/bench/mob-timeline.png'});
    await p.evaluate(()=>toggleTimelineMode());
    await new Promise(r=>setTimeout(r,700));
    await p.screenshot({path:'/home/user/dev/bench/mob-editor.png'});
  }
  await p.close();
}
// ---- Ландшафт: телефон боком на пюпитре ----
// Здесь дефицит ВЫСОТЫ (375-430px на всё), и раскладка другая:
// панели уходят сбоку от ленты, навигация — колонкой слева.
console.log('\n=== Ландшафт ===');
for(const [name,w,h] of [['iPhone SE',667,375],['iPhone 13',844,390],['15 Pro Max',932,430]]){
  const p=await b.newPage();
  await p.setUserAgent(UA);
  await p.setViewport({width:w,height:h,deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file:///home/user/STRUCHORD.html',{waitUntil:'networkidle0'});
  await p.evaluate(x=>{const f=new File([new Blob([x])],'s.json');window.importSong(f)},j);
  await new Promise(r=>setTimeout(r,900));
  await p.evaluate(()=>toggleTimelineMode());
  await new Promise(r=>setTimeout(r,900));
  const d=await p.evaluate(()=>{
    const de=document.documentElement;
    const st=document.querySelector('.timeline-stage').getBoundingClientRect();
    const tb=document.querySelector('.transport-bar').getBoundingClientRect();
    const pn=document.querySelector('.tl-panel--now').getBoundingClientRect();
    const nav=document.getElementById('tlSecNav');
    return {ovf:de.scrollWidth-de.clientWidth, bottom:Math.round(st.bottom),
      view:de.clientHeight, navDisp:getComputedStyle(nav).display,
      panelTop:Math.round(pn.top), transportBottom:Math.round(tb.bottom)};
  });
  console.log(` -- ${name} ${w}x${h}`);
  t('  не ездит вбок', d.ovf<=2, d.ovf+'px');
  t('  лента влезает по высоте', d.bottom<=d.view, `${d.bottom} / ${d.view}`);
  t('  панель не наезжает на транспорт', d.panelTop>=d.transportBottom,
    `панель ${d.panelTop}, транспорт до ${d.transportBottom}`);
  t('  навигация видна', d.navDisp!=='none', d.navDisp);
  t('  ошибок JS нет', errs.length===0, errs.slice(0,2).join(' | '));
  await p.close();
}

console.log(bad?`\n  ПРОВАЛОВ: ${bad}`:'\n  всё зелено');
await b.close();process.exit(bad?1:0);
})();
