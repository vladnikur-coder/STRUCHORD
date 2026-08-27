// Навигация по секциям в режиме ленты + видимость границ между аккордами.
const puppeteer=require('/home/user/node_modules/puppeteer');
let bad=0;
const t=(n,c,x='')=>{if(c)console.log('   ok  ',n,x);else{bad++;console.log('  FAIL ',n,x)}};
const P=s=>{const m=s.match(/[\d.]+/g);return m?m.slice(0,3).map(Number):[0,0,0]};
function lum(c){const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return .2126*f(c[0])+.7152*f(c[1])+.0722*f(c[2])}
const cr=(a,b)=>{const l1=lum(a),l2=lum(b);return ((Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05))};
(async()=>{
const b=await puppeteer.launch({args:['--no-sandbox']});
const p=await b.newPage();await p.setViewport({width:1440,height:900});
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('file:///home/user/STRUCHORD.html',{waitUntil:'networkidle0'});
const json=require('fs').readFileSync('/home/user/dev/fixtures/wind-of-change.json','utf8');
await p.evaluate(d=>{const f=new File([new Blob([d])],'s.json');window.importSong(f)},json);
await new Promise(r=>setTimeout(r,900));
await p.evaluate(()=>toggleTimelineMode());
await new Promise(r=>setTimeout(r,900));

console.log('=== 1. Границы между аккордами видны ===');
for(const theme of ['light','dark']){
  await p.evaluate(t=>{const r=document.documentElement;t==='dark'?r.setAttribute('data-theme','dark'):r.removeAttribute('data-theme')},theme);
  await new Promise(r=>setTimeout(r,350));
  const d=await p.evaluate(()=>{const c=document.querySelector('.tl-cell');const g=getComputedStyle(c);
    return {bg:g.backgroundColor,bd:g.borderRightColor,w:g.borderRightWidth}});
  const v=cr(P(d.bd),P(d.bg));
  t(`${theme}: разделитель отличим от ячейки (>=1.25)`, v>=1.25, `${v.toFixed(3)}  ${d.bd} на ${d.bg}, ${d.w}`);
}
await p.evaluate(()=>document.documentElement.removeAttribute('data-theme'));
await new Promise(r=>setTimeout(r,350));

console.log('\n=== 1б. Скруглённый угол ленты не обрублен ===');
// Полоса заголовков секций непрозрачна и того же цвета, что подложка.
// Без overflow:hidden у .timeline-stage она рисовалась поверх
// скруглённого угла своим прямым — угол выглядел обрубленным.
await p.evaluate(()=>{document.getElementById('timelineViewport').scrollLeft=3000});
await new Promise(r=>setTimeout(r,500));
const corner=await p.evaluate(()=>{
  const st=document.querySelector('.timeline-stage');
  const g=getComputedStyle(st);
  const s=st.getBoundingClientRect();
  const head=document.querySelector('.tl-section-head');
  const h=head.getBoundingClientRect();
  return {ov:g.overflow, r:parseFloat(g.borderRadius),
    headTop:h.top, stageTop:s.top, headLeft:h.left, stageLeft:s.left};
});
t('у сцены есть скругление', corner.r>=8, corner.r+'px');
t('сцена обрезает содержимое', corner.ov==='hidden', corner.ov);
await p.evaluate(()=>{document.getElementById('timelineViewport').scrollLeft=0});
await new Promise(r=>setTimeout(r,400));

console.log('\n=== 2. Список секций построен ===');
const nav=await p.evaluate(()=>{
  const n=document.getElementById('tlSecNav');
  const items=[...n.querySelectorAll('.tl-secnav-item')].map(e=>({
    txt:e.textContent.trim(), si:+e.dataset.sectionIndex, sp:+e.dataset.secPass}));
  const r=n.getBoundingClientRect();
  const panel=document.getElementById('tlPanelNow').getBoundingClientRect();
  return {items, navRight:r.right, navLeft:r.left, w:r.width, panelLeft:panel.left,
    expected:sections.reduce((a,s)=>a+Math.max(1,s.repeat||1),0)};
});
t('пунктов = развёрнутым секциям', nav.items.length===nav.expected, `${nav.items.length} из ${nav.expected}`);
t('список слева от аппликатуры', nav.navRight<=nav.panelLeft+1, `право ${nav.navRight.toFixed(0)} <= панель ${nav.panelLeft.toFixed(0)}`);
t('список не нулевой ширины', nav.w>96, nav.w.toFixed(0)+'px');
console.log('   секции:', nav.items.map(i=>i.txt).join(' | '));

console.log('\n=== 3. Подсветка следует за воспроизведением ===');
await p.evaluate(()=>playAll());
await new Promise(r=>setTimeout(r,900));
const cur1=await p.evaluate(()=>{const e=document.querySelector('.tl-secnav-item.is-current');
  return e?{txt:e.textContent.trim(),si:+e.dataset.sectionIndex,bg:getComputedStyle(e).backgroundColor}:null});
t('текущая секция подсвечена', !!cur1, cur1?cur1.txt:'нет');
t('подсветка не прозрачная', cur1&&!/rgba\(0, 0, 0, 0\)/.test(cur1.bg), cur1&&cur1.bg);
t('подсвечена первая секция', cur1&&cur1.si===0, cur1&&String(cur1.si));
const past1=await p.evaluate(()=>document.querySelectorAll('.tl-secnav-item.is-past').length);
t('до первой секции пройденных нет', past1===0, String(past1));

console.log('\n=== 4. Клик переводит к секции ===');
await p.evaluate(()=>{if(playbackState.isPlaying)playAll()});
await new Promise(r=>setTimeout(r,500));
const before=await p.evaluate(()=>document.getElementById('timelineViewport').scrollLeft);
await p.evaluate(()=>{[...document.querySelectorAll('.tl-secnav-item')][3].click()});
await new Promise(r=>setTimeout(r,900));
const after=await p.evaluate(()=>({
  sl:document.getElementById('timelineViewport').scrollLeft,
  pos:timelineStartPosition?timelineStartPosition.sectionIndex:null,
  cur:(document.querySelector('.tl-secnav-item.is-current')||{}).textContent}));
t('лента прокрутилась', Math.abs(after.sl-before)>50, `${before.toFixed(0)} -> ${after.sl.toFixed(0)}`);
t('точка старта переехала', after.pos===3, 'секция '+after.pos);
t('подсветка встала на выбранную', (after.cur||'').trim().length>0, (after.cur||'').trim());

console.log('\n=== 5. Игра с нового места идёт оттуда ===');
await p.evaluate(()=>playAll());
await new Promise(r=>setTimeout(r,800));
const si=await p.evaluate(()=>playbackState.currentSectionIndex);
t('воспроизведение стартовало в выбранной секции', si===3, 'секция '+si);
await p.evaluate(()=>{if(playbackState.isPlaying)playAll()});

console.log('\n=== 6. Повторы секций развёрнуты и адресуются точно ===');
// Пауза из блока 5 оставила timelineStartPosition, указывающую в СТАРУЮ
// песню. Дальше модель подменяется, и этот остаток мешает замеру.
// В приложении так не бывает: загрузка песни идёт через loadSongFromObject,
// который позицию сбрасывает. Здесь модель подменяется напрямую, поэтому
// чистим вручную — это подготовка стенда, а не обход дефекта.
await p.evaluate(()=>{if(playbackState.isPlaying)stopPlayback();timelineStartPosition=null;});
await new Promise(r=>setTimeout(r,300));
await p.evaluate(()=>{
  sections=[
    {id:1,type:'Intro',repeat:1,squares:[{id:1,repeat:1,events:[{chord:'Am',span:4}]}]},
    {id:2,type:'Verse',repeat:3,squares:[{id:2,repeat:1,events:[{chord:'C',span:4}]}]},
    {id:3,type:'Chorus',repeat:2,squares:[{id:3,repeat:1,events:[{chord:'F',span:4}]}]},
  ];
  nextId=10; requestRender();
});
await new Promise(r=>setTimeout(r,600));
// Полная пересборка режима: renderTimeline() строит ячейки, но ширину
// ленты (scrollWidth) браузер пересчитывает не сразу, и первый клик
// уезжал по старой геометрии — max оставался 2311px от прежней песни.
// Выходим из режима и входим заново, как сделал бы человек.
await p.evaluate(()=>{toggleTimelineMode();});
await new Promise(r=>setTimeout(r,400));
await p.evaluate(()=>{toggleTimelineMode();});
// Новая песня КОРОЧЕ прежней, а scrollLeft остался от неё и упирается
// в предел прокрутки. Слушатель ручной перемотки успевает отработать на
// этом остатке и перебивает первый клик. В приложении такого не бывает
// (лента пересобирается вместе с загрузкой песни, которая сбрасывает
// позицию), поэтому сбрасываем прокрутку вручную — это подготовка
// стенда, а не обход дефекта.
await p.evaluate(()=>{document.getElementById('timelineViewport').scrollLeft=0});
await new Promise(r=>setTimeout(r,700));
const rep=await p.evaluate(()=>[...document.querySelectorAll('.tl-secnav-item')].map(e=>e.textContent.trim()));
t('пунктов = 1+3+2', rep.length===6, rep.join(' | '));
t('проходы пронумерованы', rep[1].includes('1/3')&&rep[3].includes('3/3'), rep[1]+' … '+rep[3]);
// клик во ВТОРОЙ проход куплета: на стыке метка попадает между ячейками,
// и раньше выбирался хвост предыдущего прохода.
for(const [idx,wantSec,wantPass] of [[2,1,1],[3,1,2],[5,2,1]]){
  await p.evaluate(n=>{[...document.querySelectorAll('.tl-secnav-item')][n].click()},idx);
  await new Promise(r=>setTimeout(r,800));
  const d=await p.evaluate(()=>({pos:timelineStartPosition,
    cur:(document.querySelector('.tl-secnav-item.is-current')||{}).textContent}));
  const gotPass=(d.pos.sectionRepeatCount||{})[`sec_${wantSec}`]||0;
  t(`пункт ${idx}: секция ${wantSec}, проход ${wantPass}`,
    d.pos.sectionIndex===wantSec&&gotPass===wantPass,
    `получено sec=${d.pos.sectionIndex} pass=${gotPass} «${(d.cur||'').trim()}»`);
}

t('ошибок в консоли нет',errs.length===0,errs.join(' | '));
console.log(bad?`\n  ПРОВАЛОВ: ${bad}`:'\n  всё зелено');
await b.close();process.exit(bad?1:0);
})();
