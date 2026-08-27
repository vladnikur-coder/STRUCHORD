const puppeteer=require('/home/user/node_modules/puppeteer');
function lum(c){const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*f(c[0])+0.7152*f(c[1])+0.0722*f(c[2])}
function cr(a,b){const l1=lum(a),l2=lum(b);return ((Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05)).toFixed(2)}
const P=s=>{const m=s.match(/[\d.]+/g);return m?m.slice(0,3).map(Number):[0,0,0]};
let bad=0;
const t=(n,c,extra='')=>{if(c){console.log('   ok  ',n,extra)}else{bad++;console.log('  СБОЙ ',n,extra)}};
(async()=>{
const b=await puppeteer.launch({args:['--no-sandbox']});
const p=await b.newPage();
await p.setViewport({width:1440,height:900});
await p.goto('file:///home/user/STRUCHORD.html',{waitUntil:'networkidle0'});
const json=require('fs').readFileSync('/home/user/dev/fixtures/wind-of-change.json','utf8');
await p.evaluate(d=>{const f=new File([new Blob([d])],'s.json');window.importSong(f)},json);
await new Promise(r=>setTimeout(r,900));

for(const theme of ['light','dark']){
  await p.evaluate(t=>document.documentElement.setAttribute('data-theme',t==='dark'?'dark':''),theme);
  await new Promise(r=>setTimeout(r,350));
  console.log(`\n=== ${theme} ===`);
  const d=await p.evaluate(()=>{
    const g=e=>getComputedStyle(e);
    const play=document.getElementById('btnPlay');
    const mode=document.getElementById('btnModeToggle');
    const title=document.querySelector('.app-title');
    return {
      playBg:g(play).backgroundColor, playFg:g(play).color,
      modeBg:g(mode).backgroundColor, modeFg:g(mode).color,
      titleImg:g(title).backgroundImage,
      brand:getComputedStyle(document.documentElement).getPropertyValue('--color-brand').trim(),
    };
  });
  // Эталон берём из САМОЙ темы: заливка в светлой теме светлее
  // (#e08a5e), чем в тёмной (#cc7c5e) — на белом листе тёмный оттенок
  // выглядел жжёным. Зашитая константа ловила бы это как поломку.
  const orange=P(d.brand.startsWith('#')
    ? `rgb(${parseInt(d.brand.slice(1,3),16)},${parseInt(d.brand.slice(3,5),16)},${parseInt(d.brand.slice(5,7),16)})`
    : d.brand);
  const near=(c,ref,tol=6)=>c.every((v,i)=>Math.abs(v-ref[i])<=tol);
  // В светлой теме ▶ в ПОКОЕ белая, как остальные кнопки транспорта:
  // заливка приберегается для состояния «играет» (см. play-button-color.js).
  // В тёмной она оранжевая всегда — белый кружок там был бы пятном.
  if(theme==='dark') t('▶ залита фирменным оранжевым', near(P(d.playBg),orange), d.playBg);
  else t('▶ в покое белая (заливка — только при игре)',
    near(P(d.playBg),[255,255,255],2), d.playBg);
  t('символ ▶ читается (AA 4.5)', +cr(P(d.playFg),P(d.playBg))>=4.5, 'контраст '+cr(P(d.playFg),P(d.playBg)));
  // Градиент заголовка — оранжевый, если в нём НЕТ синевы: у всех
  // оттенков марки красный заметно больше синего.
  const grad=[...d.titleImg.matchAll(/rgba?\(([^)]+)\)/g)].map(m=>m[1].split(',').map(Number));
  t('заголовок в оранжевом градиенте', grad.length>0 && grad.every(c=>c[0]>c[2]+40),
    grad.map(c=>`rgb(${c.slice(0,3).join(',')})`).join(' -> '));
  // Заголовок не должен уходить в бурый. Планка снизу — AA 3.0 для
  // крупного жирного текста, планка сверху — 4.6: всё темнее читается
  // как коричневый, а не оранжевый. В светлой теме сравниваем с листом,
  // в тёмной наоборот (там марка светлее фона).
  if(theme==='light'){
    const bad=grad.filter(c=>+cr(c,[255,255,255])>4.6);
    t('заголовок не бурый (контраст <= 4.6)', bad.length===0,
      grad.map(c=>cr(c,[255,255,255])).join(' / '));
    const dim=grad.filter(c=>+cr(c,[255,255,255])<3.0);
    t('заголовок читается (контраст >= 3.0)', dim.length===0,
      grad.map(c=>cr(c,[255,255,255])).join(' / '));
  }
  // включаем режим ленты
  await p.evaluate(()=>toggleTimelineMode());
  await new Promise(r=>setTimeout(r,500));
  const m=await p.evaluate(()=>{const e=document.getElementById('btnModeToggle');const g=getComputedStyle(e);return{bg:g.backgroundColor,fg:g.color}});
  t('переключатель в ленте оранжевый', near(P(m.bg),orange), m.bg);
  t('подпись на нём читается', +cr(P(m.fg),P(m.bg))>=4.5, 'контраст '+cr(P(m.fg),P(m.bg)));
  await p.screenshot({path:`/home/user/dev/bench/brand-${theme}-timeline.png`});
  await p.evaluate(()=>toggleTimelineMode());
  await new Promise(r=>setTimeout(r,500));
  await p.screenshot({path:`/home/user/dev/bench/brand-${theme}.png`});
}
console.log(bad?`\n  ПРОВАЛЕНО: ${bad}`:'\n  всё зелено');
await b.close();process.exit(bad?1:0);
})();
