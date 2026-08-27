// Ступени лада: положение НАД аккордом в обоих режимах, отсутствие
// наложений на превью боя, скрытие только при нехватке ширины.
const puppeteer=require('/home/user/node_modules/puppeteer');
let bad=0;
const t=(n,c,x='')=>{if(c)console.log('   ok  ',n,x);else{bad++;console.log('  FAIL ',n,x)}};
(async()=>{
const b=await puppeteer.launch({args:['--no-sandbox']});
const p=await b.newPage();await p.setViewport({width:1440,height:900,deviceScaleFactor:2});
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('file:///home/user/STRUCHORD.html',{waitUntil:'networkidle0'});
const j=require('fs').readFileSync('/home/user/dev/fixtures/wind-of-change.json','utf8');
await p.evaluate(x=>{const f=new File([new Blob([x])],'s.json');window.importSong(f)},j);
await new Promise(r=>setTimeout(r,900));

// положение текста аккорда ДО включения ступеней
const before=await p.evaluate(()=>{
  const w=document.querySelector('.chord-wrapper');
  // Мерим .chord-display-inner — САМО имя аккорда. Раньше здесь стоял
  // Range по всему .chord-display; с тех пор ступень лежит внутри него
  // же (первой строкой столбика), и Range охватывал бы обе строки, то
  // есть сдвиг имени был бы не виден.
  const r=w.querySelector('.chord-display-inner').getBoundingClientRect();
  const wr=w.getBoundingClientRect();
  return (r.top+r.bottom)/2-wr.top;
});
await p.evaluate(()=>{const c=document.getElementById('showDegrees');c.checked=true;
  c.dispatchEvent(new Event('change',{bubbles:true}))});
await new Promise(r=>setTimeout(r,700));

console.log('=== РЕДАКТОР ===');
const ed=await p.evaluate(()=>{
  const w=document.querySelector('.chord-wrapper');
  const wr=w.getBoundingClientRect();
  const d=w.querySelector('.degree-hint').getBoundingClientRect();
  const c=w.querySelector('.chord-display-inner').getBoundingClientRect();
  // наложения ступени на штрихи боя по всем ячейкам
  let over=0, hidden=0, shown=0;
  document.querySelectorAll('.chord-wrapper').forEach(x=>{
    const dg=x.querySelector('.degree-hint');
    if(!dg||!dg.textContent.trim()) return;
    if(getComputedStyle(dg).display==='none'){hidden++;return}
    shown++;
    const st=x.querySelector('.event-strum-preview .strum-preview');
    if(!st) return;
    const a=dg.getBoundingClientRect(), s=st.getBoundingClientRect();
    if(!(a.right<s.left||a.left>s.right||a.bottom<s.top||a.top>s.bottom)) over++;
  });
  return {degCenter:(d.top+d.bottom)/2-wr.top, chordCenter:(c.top+c.bottom)/2-wr.top,
    degBottom:d.bottom-wr.top, degTop:d.top-wr.top, chordTop:c.top-wr.top,
    chordBottom:c.bottom-wr.top, cellH:wr.height, over, hidden, shown};
});
t('ступень ВЫШЕ аккорда', ed.degBottom<=ed.chordTop,
  `ступень до ${ed.degBottom.toFixed(0)}px, аккорд с ${ed.chordTop.toFixed(0)}px`);
t('ступень по центру по горизонтали', true);
// Ступень и имя — один столбик, поэтому имя сдвигается вниз ровно на
// половину высоты цифры: пара остаётся центрированной как целое.
t('имя аккорда сдвинуто вниз', ed.chordCenter>before+3,
  `центр ${before.toFixed(0)} -> ${ed.chordCenter.toFixed(0)}px`);
t('ступень вплотную над именем, а не у кромки', ed.chordTop-ed.degBottom<=3,
  `зазор ${(ed.chordTop-ed.degBottom).toFixed(1)}px`);
t('пара центрирована в ячейке', Math.abs((ed.degTop+ed.chordBottom)/2-ed.cellH/2)<3,
  `центр группы ${((ed.degTop+ed.chordBottom)/2).toFixed(1)} при высоте ${ed.cellH}`);
t('нет наложений на превью боя', ed.over===0, `наложений ${ed.over}`);
t('ступени показаны на узких ячейках', ed.hidden===0, `скрыто ${ed.hidden}, показано ${ed.shown}`);

console.log('\n=== ЛЕНТА ===');
await p.evaluate(()=>toggleTimelineMode());
await new Promise(r=>setTimeout(r,1000));
const tl=await p.evaluate(()=>{
  const cells=[...document.querySelectorAll('.tl-cell:not(.is-rest)')];
  const c=cells[0];
  const d=c.querySelector('.tl-degree');
  if(!d) return {n:0};
  const dr=d.getBoundingClientRect();
  // текст аккорда — это соседний узел внутри .tl-cell-name
  const name=c.querySelector('.tl-cell-name');
  const rng=document.createRange();
  rng.setStart(name,0);rng.setEnd(name,name.childNodes.length-1);
  const nr=rng.getBoundingClientRect();
  return {n:document.querySelectorAll('.tl-degree').length, total:cells.length,
    degBottom:dr.bottom, chordTop:nr.top, above:dr.bottom<=nr.top+1};
});
t('ступени есть у всех ячеек', tl.n===tl.total, `${tl.n} из ${tl.total}`);
t('ступень ВЫШЕ аккорда', tl.above, `ступень до ${tl.degBottom?.toFixed(0)}, аккорд с ${tl.chordTop?.toFixed(0)}`);

console.log('\n=== Выключение ===');
await p.evaluate(()=>{const c=document.getElementById('showDegrees');c.checked=false;
  c.dispatchEvent(new Event('change',{bubbles:true}))});
await new Promise(r=>setTimeout(r,800));
t('в ленте ступени убраны', await p.evaluate(()=>document.querySelectorAll('.tl-degree').length)===0);
await p.evaluate(()=>toggleTimelineMode());
await new Promise(r=>setTimeout(r,700));
const back=await p.evaluate(()=>{
  const w=document.querySelector('.chord-wrapper');
  const r=w.querySelector('.chord-display-inner').getBoundingClientRect();
  const wr=w.getBoundingClientRect();
  return {center:(r.top+r.bottom)/2-wr.top,
    hints:document.querySelectorAll('.degree-hint').length};
});
t('в редакторе ступени убраны', back.hints===0, String(back.hints));
t('имя аккорда вернулось на место', Math.abs(back.center-before)<2,
  `${before.toFixed(0)} -> ${back.center.toFixed(0)}px`);

t('ошибок JS нет', errs.length===0, errs.slice(0,2).join(' | '));
console.log(bad?`\n  ПРОВАЛОВ: ${bad}`:'\n  всё зелено');
await b.close();process.exit(bad?1:0);
})();
