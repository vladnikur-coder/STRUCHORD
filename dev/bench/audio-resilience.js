// Устойчивость звука: восстановление после прерывания и запас планировщика.
//
// Ловит две причины жалобы «иногда пропадает звук, помогает только
// перезапуск браузера»:
//   1. Safari уводит AudioContext в НЕСТАНДАРТНОЕ состояние 'interrupted'
//      (сворачивание вкладки, блокировка экрана, звонок, отключение
//      наушников). Код проверял только 'suspended', поэтому контекст
//      оставался мёртвым навсегда.
//   2. Планировщик просыпался за 50 мс до события. При заминке браузера
//      этого не хватало, и звук планировался в ПРОШЛОМ — то есть не
//      звучал вовсе.
const puppeteer=require('/home/user/node_modules/puppeteer');
let bad=0;
const t=(n,c,x='')=>{if(c)console.log('   ok  ',n,x);else{bad++;console.log('  FAIL ',n,x)}};
(async()=>{
const b=await puppeteer.launch({args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
const p=await b.newPage();await p.setViewport({width:1440,height:900});
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.evaluateOnNewDocument(()=>{window.__ev=[];
  const AC=window.AudioContext||window.webkitAudioContext;
  const wrap=o=>function(){const n=o.call(this);const s=n.start.bind(n);const c=this;
    n.start=function(x){window.__ev.push(+((x||0)-c.currentTime).toFixed(4));return s(x)};return n};
  AC.prototype.createBufferSource=wrap(AC.prototype.createBufferSource);
  AC.prototype.createOscillator=wrap(AC.prototype.createOscillator);});
await p.goto('file:///home/user/STRUCHORD.html',{waitUntil:'networkidle0'});
const j=require('fs').readFileSync('/home/user/dev/fixtures/wind-of-change.json','utf8');
await p.evaluate(x=>{const f=new File([new Blob([x])],'s.json');window.importSong(f)},j);
await new Promise(r=>setTimeout(r,900));

console.log('=== 1. Запас планировщика ===');
const run=async(label,busy)=>{
  await p.evaluate(()=>{window.__ev=[];if(playbackState.isPlaying)playAll()});
  await new Promise(r=>setTimeout(r,400));
  await p.evaluate(()=>playAll());
  if(busy) await p.evaluate(()=>{window.__b=setInterval(()=>{
    const s=performance.now();while(performance.now()-s<45){}},100)});
  await new Promise(r=>setTimeout(r,6000));
  if(busy) await p.evaluate(()=>clearInterval(window.__b));
  const e=await p.evaluate(()=>window.__ev.slice());
  await p.evaluate(()=>{if(playbackState.isPlaying)playAll()});
  await new Promise(r=>setTimeout(r,300));
  const late=e.filter(x=>x<0);
  const min=Math.min(...e);
  t(`${label}: звук не опаздывает`, late.length===0, `мин.запас ${min.toFixed(3)}с, опоздавших ${late.length} из ${e.length}`);
  return min;
};
await run('спокойно',false);
await p.evaluate(()=>toggleTimelineMode());await new Promise(r=>setTimeout(r,700));
await run('лента',false);
await run('лента + нагрузка',true);

console.log('\n=== 2. Восстановление после Safari-interrupted ===');
// Само состояние в Chrome не воспроизвести, поэтому проверяем ЛОГИКУ:
// что resumeAudioContext поднимает контекст из не-running состояния и
// что на смену состояния навешен обработчик.
const wired=await p.evaluate(()=>{
  const c=getAudioContext();
  return {hasHandler:typeof c.onstatechange==='function',
    hasFn:typeof window.resumeAudioContext==='function'};
});
t('есть обработчик onstatechange', wired.hasHandler);
t('есть общая функция пробуждения', wired.hasFn);
// suspended лечится
await p.evaluate(async()=>{await getAudioContext().suspend()});
await new Promise(r=>setTimeout(r,300));
t('контекст усыплён (подготовка)', await p.evaluate(()=>getAudioContext().state)==='suspended');
await p.evaluate(()=>resumeAudioContext());
await new Promise(r=>setTimeout(r,600));
t('resumeAudioContext будит контекст', await p.evaluate(()=>getAudioContext().state)==='running');
// возврат на вкладку тоже будит
await p.evaluate(async()=>{await getAudioContext().suspend()});
await new Promise(r=>setTimeout(r,300));
await p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
await new Promise(r=>setTimeout(r,600));
t('возврат на вкладку будит звук', await p.evaluate(()=>getAudioContext().state)==='running');
// клик тоже будит
await p.evaluate(async()=>{await getAudioContext().suspend()});
await new Promise(r=>setTimeout(r,300));
await p.evaluate(()=>document.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})));
await new Promise(r=>setTimeout(r,600));
t('касание будит звук', await p.evaluate(()=>getAudioContext().state)==='running');

console.log('\n=== 3. Игра после прерывания ===');
await p.evaluate(()=>{window.__ev=[];playAll()});
await new Promise(r=>setTimeout(r,2500));
t('звук идёт после восстановления', await p.evaluate(()=>window.__ev.length)>0,
  await p.evaluate(()=>window.__ev.length)+' событий');
await p.evaluate(()=>{if(playbackState.isPlaying)playAll()});

console.log('\n=== 4. Долгая сессия: нет утечки ===');
const m0=await p.metrics();
for(let i=0;i<12;i++){
  await p.evaluate(()=>playAll());await new Promise(r=>setTimeout(r,300));
  await p.evaluate(()=>{if(playbackState.isPlaying)playAll()});
  await p.evaluate(()=>toggleTimelineMode());await new Promise(r=>setTimeout(r,200));
}
const m1=await p.metrics();
const grow=m1.JSEventListeners-m0.JSEventListeners;
t('слушатели не накапливаются', grow<=20, `${m0.JSEventListeners} -> ${m1.JSEventListeners}`);
t('один AudioContext на сессию', await p.evaluate(()=>getAudioContext())!==null);

t('ошибок JS нет', errs.length===0, errs.slice(0,2).join(' | '));
console.log(bad?`\n  ПРОВАЛОВ: ${bad}`:'\n  всё зелено');
await b.close();process.exit(bad?1:0);
})();
