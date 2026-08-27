// Цветовые схемы: контрасты текста и ключевых элементов в каждой,
// в светлом и тёмном варианте.
const puppeteer=require('/home/user/node_modules/puppeteer');
const P=s=>{const m=s.match(/[\d.]+/g);return m?m.slice(0,3).map(Number):[0,0,0]};
const lum=c=>{const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};
  return .2126*f(c[0])+.7152*f(c[1])+.0722*f(c[2])};
const cr=(a,b)=>{const l1=lum(a),l2=lum(b);return (Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05)};
let bad=0;
(async()=>{
const b=await puppeteer.launch({args:['--no-sandbox']});
const p=await b.newPage();await p.setViewport({width:1440,height:900});
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('file:///home/user/STRUCHORD.html',{waitUntil:'networkidle0'});
const json=require('fs').readFileSync('/home/user/dev/fixtures/wind-of-change.json','utf8');
await p.evaluate(d=>{const f=new File([new Blob([d])],'s.json');window.importSong(f)},json);
await new Promise(r=>setTimeout(r,900));
const ids=await p.evaluate(()=>[...document.querySelectorAll('.scheme-item')].map(e=>({
  id:e.dataset.schemeId, name:e.textContent.trim()})));
console.log(`схем: ${ids.length}\n`);
console.log('схема         тема   текст  ячейка/лист  разделитель  play');
for(const {id,name} of ids){
  for(const theme of ['light','dark']){
    await p.evaluate((i,t)=>{
      const r=document.documentElement;
      t==='dark'?r.setAttribute('data-theme','dark'):r.removeAttribute('data-theme');
      applyScheme(i);
    },id,theme);
    // applyScheme включает .theme-transition на 400 мс: замер раньше
    // ловит цвета В СЕРЕДИНЕ анимации, и числа съезжают на строку.
    await new Promise(r=>setTimeout(r,650));
    const d=await p.evaluate(()=>{
      const g=e=>getComputedStyle(e);
      const cont=document.querySelector('.container');
      const cell=document.querySelector('.chord-wrapper .chord-content')||document.querySelector('.chord-wrapper');
      const play=document.getElementById('btnPlay');
      return {text:g(cont).color, contBg:g(cont).backgroundColor,
        cellBg:cell?g(cell).backgroundColor:null,
        divider:g(document.querySelector('.tl-cell')||cont).borderRightColor,
        playBg:g(play).backgroundColor, playFg:g(play).color};
    });
    const t1=cr(P(d.text),P(d.contBg));
    const t2=d.cellBg?cr(P(d.cellBg),P(d.contBg)):0;
    const t3=cr(P(d.playFg),P(d.playBg));
    const flag=t1<4.5||t3<4.5;
    if(flag) bad++;
    console.log(`${name.padEnd(13)} ${theme.padEnd(6)} ${t1.toFixed(2).padStart(5)}  ${t2.toFixed(3).padStart(6)}       ${'-'.padStart(6)}     ${t3.toFixed(2).padStart(5)} ${flag?' <-- НИЖЕ AA 4.5':''}`);
  }
}
// Разделители ячеек ленты — они задаются --tl-cell-divider и в схемах
// переопределяются; при слишком близком к фону значении границы аккордов
// снова становятся невидимыми (ровно та жалоба, из-за которой переменная
// и появилась).
console.log('\nразделители на ленте:');
await p.evaluate(()=>{if(!timelineMode) toggleTimelineMode()});
await new Promise(r=>setTimeout(r,800));
let dim=0;
for(const {id,name} of ids){
  for(const theme of ['light','dark']){
    await p.evaluate((i,t)=>{const r=document.documentElement;
      t==='dark'?r.setAttribute('data-theme','dark'):r.removeAttribute('data-theme');
      applyScheme(i)},id,theme);
    await new Promise(r=>setTimeout(r,650));
    const d=await p.evaluate(()=>{const c=document.querySelector('.tl-cell');
      if(!c) return null; const g=getComputedStyle(c);
      return {bg:g.backgroundColor,bd:g.borderRightColor}});
    if(!d) continue;
    const v=cr(P(d.bd),P(d.bg));
    if(v<1.15){dim++;bad++;console.log(`  ${name} / ${theme}: ${v.toFixed(3)} — граница сливается`);}
  }
}
if(!dim) console.log('  все схемы: границы аккордов различимы (>=1.15)');

console.log('\nошибок JS:',errs.length);
if(errs.length) bad++;
console.log(bad?`  ПРОВАЛОВ: ${bad}`:'  всё зелено');
process.exit(bad?1:0);
await b.close();
})();
