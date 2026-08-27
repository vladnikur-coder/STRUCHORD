const puppeteer=require('/home/user/node_modules/puppeteer');
function lum(c){const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*f(c[0])+0.7152*f(c[1])+0.0722*f(c[2])}
function cr(a,b){const l1=lum(a),l2=lum(b);return ((Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05)).toFixed(2)}
const P=s=>{const m=s.match(/[\d.]+/g);return m?m.slice(0,3).map(Number):[0,0,0]};
let bad=0;
const t=(n,c,x='')=>{if(c)console.log('   ok  ',n,x);else{bad++;console.log('  СБОЙ ',n,x)}};
const near=(c,r,tol=6)=>c.every((v,i)=>Math.abs(v-r[i])<=tol);
// Эталон читаем из темы: заливка светлой темы (#e08a5e) намеренно
// светлее тёмной (#cc7c5e). Зашитая константа ловила бы это как поломку.
const AMBER=[255,176,59];
let ORANGE=[204,124,94];
(async()=>{
const b=await puppeteer.launch({args:['--no-sandbox']});
const p=await b.newPage();
await p.setViewport({width:1440,height:900});
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('file:///home/user/STRUCHORD.html',{waitUntil:'networkidle0'});
const json=require('fs').readFileSync('/home/user/dev/fixtures/wind-of-change.json','utf8');
await p.evaluate(d=>{const f=new File([new Blob([d])],'s.json');window.importSong(f)},json);
await new Promise(r=>setTimeout(r,900));

for(const theme of ['light','dark']){
 await p.evaluate(t=>{const r=document.documentElement;
   t==='dark'?r.setAttribute('data-theme','dark'):r.removeAttribute('data-theme')},theme);
 await new Promise(r=>setTimeout(r,400));
 await new Promise(r=>setTimeout(r,300));
 ORANGE=await p.evaluate(()=>{
   const h=getComputedStyle(document.documentElement).getPropertyValue('--color-brand').trim();
   return [1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
 });
 for(const mode of ['редактор','лента']){
  if(mode==='лента'){await p.evaluate(()=>toggleTimelineMode());await new Promise(r=>setTimeout(r,450));}
  console.log(`\n=== ${theme} / ${mode} ===`);
  const idle=await p.evaluate(()=>{const e=document.getElementById('btnPlay');const g=getComputedStyle(e);
    const o=getComputedStyle(document.getElementById('btnMetronome'));
    return{bg:g.backgroundColor,fg:g.color,txt:e.textContent.trim(),other:o.backgroundColor}});
  if(theme==='light'){
    // В покое кнопка обычная, как остальные кружки транспорта: заливка
    // приберегается для состояния «играет», чтобы цвет означал работу.
    t('стоит: белая, как соседние кнопки', idle.bg===idle.other, idle.bg+' / '+idle.other);
    t('стоит: знак читается', +cr(P(idle.fg),P(idle.bg))>=4.5, 'контраст '+cr(P(idle.fg),P(idle.bg)));
  } else {
    // На тёмном фоне белый кружок сам по себе пятно — там заливка всегда.
    t('стоит: залита оранжевым', near(P(idle.bg),ORANGE), idle.bg+' знак '+idle.txt);
  }
  await p.evaluate(()=>playAll());
  await new Promise(r=>setTimeout(r,700));
  const act=await p.evaluate(()=>{const e=document.getElementById('btnPlay');const g=getComputedStyle(e);return{bg:g.backgroundColor,fg:g.color,bd:g.borderColor,txt:e.textContent.trim(),act:e.classList.contains('active')}});
  t('идёт игра: класс active', act.act);
  t('играет: НЕ жёлтая', !near(P(act.bg),AMBER), act.bg);
  t('играет: заливка фирменная', near(P(act.bg),ORANGE), `${idle.bg} -> ${act.bg}`);
  if(theme==='light') t('играет: рамка снята (не серый ободок)',
    /rgba\(0, 0, 0, 0\)|transparent/.test(act.bd), act.bd);
  t('знак сменился на паузу/стоп', act.txt!=='▶', 'знак '+act.txt);
  t('знак читается на заливке', +cr(P(act.fg),P(act.bg))>=4.5, 'контраст '+cr(P(act.fg),P(act.bg)));
  await p.screenshot({path:`/home/user/dev/bench/play-${theme}-${mode}.png`,clip:{x:322,y:280,width:800,height:80}});
  await p.evaluate(()=>{if(playbackState.isPlaying)playAll()});
  await new Promise(r=>setTimeout(r,500));
  if(mode==='лента'){await p.evaluate(()=>toggleTimelineMode());await new Promise(r=>setTimeout(r,450));}
 }
}
t('ошибок в консоли нет',errs.length===0,errs.join('|'));
console.log(bad?`\n  ПРОВАЛЕНО: ${bad}`:'\n  всё зелено');
await b.close();process.exit(bad?1:0);
})();
