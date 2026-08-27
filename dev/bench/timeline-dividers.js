// Разделители между аккордами на ленте + скругление краёв песни.
//
// Ловит дефект: границы КВАДРАТОВ и СЕКЦИЙ рисовались inset-тенью на
// .tl-square, а ячейка непрозрачна и лежит выше (z-index: 1, чтобы
// перекрывать линию указателя) — она закрывала тень собой. Замер по
// пикселям показывал разницу с фоном 0-2 из 255 на 16 стыках из 85:
// линии не было вовсе. Внутренние стыки ячеек при этом рисовались,
// у них своя border-right — оттого дефект и выглядел как «разделители
// не ВСЕГДА рисуются».
const puppeteer=require('/home/user/node_modules/puppeteer');
const {PNG}=require('/home/user/node_modules/pngjs');
let bad=0;
const t=(n,c,x='')=>{if(c)console.log('   ok  ',n,x);else{bad++;console.log('  FAIL ',n,x)}};
(async()=>{
const b=await puppeteer.launch({args:['--no-sandbox']});
const p=await b.newPage();await p.setViewport({width:1440,height:900});
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('file:///home/user/STRUCHORD.html',{waitUntil:'networkidle0'});
const j=require('fs').readFileSync('/home/user/dev/fixtures/wind-of-change.json','utf8');
await p.evaluate(d=>{const f=new File([new Blob([d])],'s.json');window.importSong(f)},j);
await new Promise(r=>setTimeout(r,900));
await p.evaluate(()=>toggleTimelineMode());
await new Promise(r=>setTimeout(r,900));

for(const theme of ['light','dark']){
  await p.evaluate(x=>{const r=document.documentElement;
    x==='dark'?r.setAttribute('data-theme','dark'):r.removeAttribute('data-theme')},theme);
  await new Promise(r=>setTimeout(r,600));
  console.log(`\n=== ${theme} ===`);
  const joints=await p.evaluate(()=>{
    const cells=[...document.querySelectorAll('.tl-cell')];const out=[];
    cells.forEach((c,i)=>{const n=cells[i+1];if(!n)return;
      const sqA=c.closest('.tl-square'),sqB=n.closest('.tl-square');
      const seA=c.closest('.tl-section'),seB=n.closest('.tl-section');
      out.push({left:cellContentLeft(c)+c.offsetWidth,
        kind:seA!==seB?'секция':(sqA!==sqB?'квадрат':'ячейка')});});
    return out;});
  const byKind={};
  for(const o of joints){
    await p.evaluate(l=>{document.getElementById('timelineViewport').scrollLeft=l-500},o.left);
    await new Promise(r=>setTimeout(r,110));
    const g=await p.evaluate(l=>{const vp=document.getElementById('timelineViewport');
      const r=vp.getBoundingClientRect();
      return {x:Math.round(r.left+(l-vp.scrollLeft)),y:Math.round(r.top+40)};},o.left);
    // узкая полоска: слева чистый фон ячейки, справа — стык
    const png=PNG.sync.read(await p.screenshot({clip:{x:g.x-45,y:g.y-2,width:52,height:4}}));
    const px=x=>{const i=(png.width*2+x)<<2;return png.data[i]+png.data[i+1]+png.data[i+2]};
    const bg=px(5);let mn=1e9,mx=-1;
    for(let dx=42;dx<=48;dx++){const v=px(dx);mn=Math.min(mn,v);mx=Math.max(mx,v);}
    const d=Math.max(Math.abs(bg-mn),Math.abs(mx-bg));
    byKind[o.kind]=byKind[o.kind]||{n:0,bad:0};byKind[o.kind].n++;
    if(d<20) byKind[o.kind].bad++;
  }
  for(const [kind,v] of Object.entries(byKind))
    t(`границы «${kind}» видны`, v.bad===0, `${v.n-v.bad} из ${v.n}`);

  // скругление краёв — как у блока квадратов в редакторе (18px)
  const rad=await p.evaluate(()=>{
    const f=document.querySelector('.tl-section:first-child .tl-square:first-child .tl-cell:first-child');
    const cells=[...document.querySelectorAll('.tl-cell')];
    const l=cells[cells.length-1];
    const mid=cells[Math.floor(cells.length/2)];
    return {first:getComputedStyle(f).borderRadius,
      last:getComputedStyle(l).borderRadius,
      mid:getComputedStyle(mid).borderRadius,
      // акцент начала песни — тенью по форме ячейки, не отдельной полосой
      shadow:getComputedStyle(f).boxShadow.includes('inset'),
      stub:getComputedStyle(
        document.querySelector('.tl-section:first-child .tl-square:first-child'),'::before').display};
  });
  t('первый аккорд скруглён слева', /^18px 0px 0px 18px/.test(rad.first), rad.first);
  t('последний аккорд скруглён справа', /^0px 18px 18px 0px/.test(rad.last), rad.last);
  t('середина ленты не скруглена', rad.mid==='0px', rad.mid);
  t('акцент начала — тенью по форме', rad.shadow && rad.stub==='none',
    `тень=${rad.shadow} полоса=${rad.stub}`);

  // Все три уровня границ — ОДИН цвет (--color-accent), разведены
  // прозрачностью: ячейка 30%, квадрат 55%, секция 100%. Так линии
  // читаются как одна система, а не как три случайных серых оттенка.
  //
  // Абсолютный контраст разделителя к фону здесь НЕ проверяется:
  // пробовали поднимать альфу до 0.55 ради заметности, но лента внутри
  // должна оставаться спокойной — разделители это подсказка о структуре,
  // а не главный элемент. Проверяем только иерархию и то, что линии
  // вообще рисуются (см. блок joints выше).
  const tone=await p.evaluate(()=>{
    const acc=getComputedStyle(document.documentElement)
      .getPropertyValue('--color-accent').trim();
    const rgb=[1,3,5].map(i=>parseInt(acc.slice(i,i+2),16));
    const parse=s=>{const m=s.match(/[\d.]+/g);return m?m.slice(0,3).map(Number):null};
    const alpha=s=>{const m=s.match(/[\d.]+/g);return m&&m.length>3?+m[3]:1};
    const cell=getComputedStyle(document.querySelector('.tl-cell')).borderRightColor;
    const sq=getComputedStyle(
      document.querySelector('.tl-square + .tl-square')||document.querySelector('.tl-square'),
      '::before').backgroundColor;
    const sec=getComputedStyle(
      document.querySelector('.tl-section + .tl-section .tl-square:first-child'),
      '::before').backgroundColor;
    const same=c=>{const p=parse(c);return p&&p.every((v,i)=>Math.abs(v-rgb[i])<=1)};
    return {acc, same:[same(cell),same(sq),same(sec)],
      alphas:[alpha(cell),alpha(sq),alpha(sec)]};
  });
  t('все границы — цвет акцента', tone.same.every(Boolean),
    `${tone.acc}: ячейка ${tone.same[0]}, квадрат ${tone.same[1]}, секция ${tone.same[2]}`);
  t('прозрачность растёт: ячейка < квадрат < секция',
    tone.alphas[0]<tone.alphas[1] && tone.alphas[1]<=tone.alphas[2],
    tone.alphas.join(' < '));
}
t('ошибок JS нет', errs.length===0, errs.slice(0,2).join(' | '));
console.log(bad?`\n  ПРОВАЛОВ: ${bad}`:'\n  всё зелено');
await b.close();process.exit(bad?1:0);
})();
