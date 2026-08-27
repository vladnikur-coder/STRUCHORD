// iPad: нажимаемость интерфейса пальцем.
//
// Ловит дефект: одиночный тап по ячейке аккорда через 250 мс открывал
// КОЛЕСО АККОРДОВ — модальное окно с z-index 10001. Его .wheel-overlay
// накрывал весь экран и перехватывал нажатия, поэтому после первого же
// касания «не нажималась ни одна кнопка».
//
// Причина была в связке двух механизмов: тап-показ кнопок ячейки
// (is-buttons-armed, добавлен для мобильной версии) и давняя логика
// «клик по ячейке → колесо». На мыши они не конфликтуют: наведение
// показывает кнопки, клик ведёт в колесо. На таче оба срабатывали от
// одного касания.
const puppeteer=require('/home/user/node_modules/puppeteer');
const IPAD='Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
let bad=0;
const t=(n,c,x='')=>{if(c)console.log('   ok  ',n,x);else{bad++;console.log('  FAIL ',n,x)}};
(async()=>{
const b=await puppeteer.launch({args:['--no-sandbox']});
const j=require('fs').readFileSync('/home/user/dev/fixtures/wind-of-change.json','utf8');

for(const [name,w,h] of [['iPad портрет',1024,1366],['iPad ландшафт',1366,1024],['iPad mini',768,1024]]){
  const p=await b.newPage();
  await p.setUserAgent(IPAD);
  await p.setViewport({width:w,height:h,deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file:///home/user/STRUCHORD.html',{waitUntil:'networkidle0'});
  await p.evaluate(x=>{const f=new File([new Blob([x])],'s.json');window.importSong(f)},j);
  await new Promise(r=>setTimeout(r,900));
  console.log(`\n=== ${name} ${w}x${h} ===`);
  const at=s=>p.evaluate(sel=>{const e=document.querySelector(sel);if(!e)return null;
    const b=e.getBoundingClientRect();return{x:b.left+b.width/2,y:b.top+b.height/2}},s);

  // 1. Ничего не перекрывает интерактивные элементы
  const blocked=await p.evaluate(()=>{
    const bad=[];
    document.querySelectorAll('button,select,input,textarea').forEach(e=>{
      const b=e.getBoundingClientRect();
      if(b.width<3||b.height<3||e.offsetParent===null) return;
      const cx=b.left+b.width/2, cy=b.top+b.height/2;
      if(cx<0||cy<0||cx>innerWidth||cy>innerHeight) return;
      if(e.closest('.chord-buttons')) return; // они скрыты до тапа
      const top=document.elementFromPoint(cx,cy);
      if(top&&top!==e&&!e.contains(top)&&!top.contains(e))
        bad.push(`${(e.id||e.className||'').slice(0,20)} <- ${top.tagName}.${(top.className+'').split(' ')[0]}`);
    });
    return bad;
  });
  t('ничего не перекрывает кнопки', blocked.length===0, blocked.slice(0,3).join(' | '));

  // 2. Первый тап по ячейке НЕ открывает колесо
  const c=await at('.chord-wrapper');
  await p.touchscreen.tap(c.x,c.y);
  await new Promise(r=>setTimeout(r,600));
  const st=await p.evaluate(()=>({
    armed:!!document.querySelector('.chord-wrapper.is-buttons-armed'),
    wheel:document.getElementById('chordWheelModal').classList.contains('open')}));
  t('первый тап открывает кнопки ячейки', st.armed, 'armed='+st.armed);
  t('первый тап НЕ открывает колесо', !st.wheel, 'колесо='+st.wheel);

  // 3. Кнопка внутри ячейки нажимается
  const n0=await p.evaluate(()=>sections[0].squares[0].events.length);
  const plus=await at('.chord-wrapper.is-buttons-armed .chord-btn-add');
  if(plus){await p.touchscreen.tap(plus.x,plus.y);await new Promise(r=>setTimeout(r,700));}
  const n1=await p.evaluate(()=>sections[0].squares[0].events.length);
  t('кнопка «+» на ячейке работает', n1>n0, `событий ${n0} -> ${n1}`);

  // 4. Второй тап по выбранной ячейке всё-таки открывает колесо
  const c2=await at('.chord-wrapper');
  await p.touchscreen.tap(c2.x,c2.y);await new Promise(r=>setTimeout(r,300));
  await p.touchscreen.tap(c2.x,c2.y);await new Promise(r=>setTimeout(r,700));
  t('второй тап открывает колесо', await p.evaluate(()=>
    document.getElementById('chordWheelModal').classList.contains('open')));
  await p.evaluate(()=>closeChordWheel());
  await new Promise(r=>setTimeout(r,400));

  // 5. Кнопки транспорта и режима.
  // Координаты берём ЗАНОВО: шаг 3 добавил ячейку и сдвинул раскладку,
  // а тултип аппликатуры мог остаться висеть — проверяем и это.
  // Внутри кнопки лежит <i class="ti"> — сам значок. Это НЕ чужой слой:
  // проверяем, что верхний элемент либо сама кнопка, либо её потомок.
  const overPlay=await p.evaluate(()=>{
    const e=document.getElementById('btnPlay');
    const b=e.getBoundingClientRect();
    const top=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);
    if(!top) return {desc:'null', own:false};
    return {desc:`${top.tagName}.${(top.className+'').split(' ')[0]}`,
      own: top===e || e.contains(top)};
  });
  t('над кнопкой ▶ нет чужого слоя', overPlay.own, overPlay.desc);
  const pl=await at('#btnPlay');
  await p.touchscreen.tap(pl.x,pl.y);
  await new Promise(r=>setTimeout(r,700));
  t('кнопка ▶ запускает игру', await p.evaluate(()=>playbackState.isPlaying));
  await p.evaluate(()=>{if(playbackState.isPlaying)playAll()});
  await new Promise(r=>setTimeout(r,400));

  const m0=await p.evaluate(()=>timelineMode);
  const mb=await at('#btnModeToggle');
  await p.touchscreen.tap(mb.x,mb.y);
  await new Promise(r=>setTimeout(r,800));
  t('кнопка «Лента» переключает режим', await p.evaluate(()=>timelineMode)!==m0);

  t('ошибок JS нет', errs.length===0, errs.slice(0,2).join(' | '));
  await p.close();
}

// Десктоп не должен пострадать: с мышью одиночный клик по-прежнему
// ведёт в колесо аккордов.
console.log('\n=== десктоп (мышь) — регрессия ===');
const d=await b.newPage();
await d.setViewport({width:1440,height:900});
await d.goto('file:///home/user/STRUCHORD.html',{waitUntil:'networkidle0'});
await d.evaluate(x=>{const f=new File([new Blob([x])],'s.json');window.importSong(f)},j);
await new Promise(r=>setTimeout(r,900));
const box=await d.evaluate(()=>{const e=document.querySelector('.chord-wrapper');
  const b=e.getBoundingClientRect();return{x:b.left+b.width/2,y:b.top+b.height/2}});
await d.mouse.click(box.x,box.y);
await new Promise(r=>setTimeout(r,600));
t('клик мышью открывает колесо, как раньше',
  await d.evaluate(()=>document.getElementById('chordWheelModal').classList.contains('open')));

console.log(bad?`\n  ПРОВАЛОВ: ${bad}`:'\n  всё зелено');
await b.close();process.exit(bad?1:0);
})();
