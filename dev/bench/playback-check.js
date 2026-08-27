// Воспроизведение в ОБОИХ режимах: что планировщик реально ставит в
// очередь, движется ли лента, попадают ли события в такт.
// Перехватываем сам Web Audio: считаем созданные источники звука.
const puppeteer=require('/home/user/node_modules/puppeteer');
let bad=0;
const t=(n,c,x='')=>{if(c)console.log('   ok  ',n,x);else{bad++;console.log('  FAIL ',n,x)}};
(async()=>{
const b=await puppeteer.launch({args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
const p=await b.newPage();await p.setViewport({width:1440,height:900});
const errs=[];p.on('pageerror',e=>errs.push(e.message));
p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});

// Счётчик звуков ставим ДО загрузки страницы.
await p.evaluateOnNewDocument(()=>{
  window.__snd={osc:0,buf:0,gain:0,starts:[]};
  const AC=window.AudioContext||window.webkitAudioContext;
  if(!AC) return;
  const oc=AC.prototype.createOscillator, bs=AC.prototype.createBufferSource, gn=AC.prototype.createGain;
  AC.prototype.createOscillator=function(){window.__snd.osc++;const n=oc.call(this);
    const s=n.start.bind(n);n.start=function(t){window.__snd.starts.push(t||0);return s(t)};return n};
  AC.prototype.createBufferSource=function(){window.__snd.buf++;const n=bs.call(this);
    const s=n.start.bind(n);n.start=function(t){window.__snd.starts.push(t||0);return s(t)};return n};
  AC.prototype.createGain=function(){window.__snd.gain++;return gn.call(this)};
});
await p.goto('file:///home/user/STRUCHORD.html',{waitUntil:'networkidle0'});
const j=require('fs').readFileSync('/home/user/dev/fixtures/wind-of-change.json','utf8');
await p.evaluate(x=>{const f=new File([new Blob([x])],'s.json');window.importSong(f)},j);
await new Promise(r=>setTimeout(r,900));

for(const mode of ['РЕДАКТОР','ЛЕНТА']){
  if(mode==='ЛЕНТА'){await p.evaluate(()=>toggleTimelineMode());await new Promise(r=>setTimeout(r,800));}
  console.log(`\n=== ${mode} ===`);
  await p.evaluate(()=>{window.__snd.osc=0;window.__snd.buf=0;window.__snd.starts=[]});

  const t0=Date.now();
  await p.evaluate(()=>playAll());
  await new Promise(r=>setTimeout(r,3000));

  const mid=await p.evaluate(()=>({
    playing:playbackState.isPlaying,
    sec:playbackState.currentSectionIndex,
    ev:playbackState.currentEventIndex,
    snd:window.__snd.osc+window.__snd.buf,
    ctxState:(window.getAudioContext&&getAudioContext())?getAudioContext().state:'?',
    ctxTime:(window.getAudioContext&&getAudioContext())?+getAudioContext().currentTime.toFixed(2):0,
    active:!!document.querySelector('.tl-cell.tl-active, .chord-wrapper.playback-active'),
    scroll: timelineMode? Math.round(document.getElementById('timelineViewport').scrollLeft):null,
  }));
  t('идёт воспроизведение', mid.playing, `секция ${mid.sec}, событие ${mid.ev}`);
  t('AudioContext запущен', mid.ctxState==='running', mid.ctxState+', время '+mid.ctxTime+'с');
  t('звук создаётся', mid.snd>0, mid.snd+' источников за 3с');
  t('подсветка идёт за игрой', mid.active);
  if(mode==='ЛЕНТА') t('лента прокручивается', mid.scroll>0, 'scrollLeft '+mid.scroll);

  // Продвижение позиции: за 3 секунды на 81 BPM должно смениться событие
  await new Promise(r=>setTimeout(r,3000));
  const later=await p.evaluate(()=>({
    ev:playbackState.currentEventIndex, sec:playbackState.currentSectionIndex,
    snd:window.__snd.osc+window.__snd.buf,
    scroll: timelineMode? Math.round(document.getElementById('timelineViewport').scrollLeft):null}));
  const moved = later.sec>mid.sec || later.ev!==mid.ev;
  t('позиция продвигается', moved, `${mid.sec}:${mid.ev} -> ${later.sec}:${later.ev}`);
  t('звук продолжает идти', later.snd>mid.snd, `${mid.snd} -> ${later.snd}`);
  if(mode==='ЛЕНТА') t('лента едет дальше', later.scroll>mid.scroll, `${mid.scroll} -> ${later.scroll}`);

  // Пауза/стоп
  await p.evaluate(()=>playAll());
  await new Promise(r=>setTimeout(r,600));
  t('остановка работает', !await p.evaluate(()=>playbackState.isPlaying));
  const after=await p.evaluate(()=>window.__snd.osc+window.__snd.buf);
  await new Promise(r=>setTimeout(r,1200));
  t('после стопа новый звук не планируется',
    await p.evaluate(()=>window.__snd.osc+window.__snd.buf)===after);
}

// Метроном отдельно
console.log('\n=== Метроном ===');
await p.evaluate(()=>{if(timelineMode)toggleTimelineMode()});
await new Promise(r=>setTimeout(r,600));
await p.evaluate(()=>{window.__snd.osc=0;window.__snd.buf=0});
await p.evaluate(()=>{toggleMetronome();playAll()});
await new Promise(r=>setTimeout(r,2500));
t('с метрономом звук идёт', await p.evaluate(()=>window.__snd.osc+window.__snd.buf)>0);
await p.evaluate(()=>{if(playbackState.isPlaying)playAll();toggleMetronome()});

// ---- Тайминг: события должны ложиться в музыкальную сетку ----
// Считаем не отдельные источники звука, а УДАРЫ: щипок каждой струны
// внутри одного удара разнесён на ~14 мс (имитация движения медиатора),
// и без группировки интервалы выглядят как 0.168 вместо 0.21.
console.log('\n=== Тайминг ударов ===');
await p.evaluate(()=>{if(timelineMode)toggleTimelineMode()});
await new Promise(r=>setTimeout(r,600));
const pra=require('fs').readFileSync('/home/user/dev/fixtures/praskovya.json','utf8');
await p.evaluate(x=>{const f=new File([new Blob([x])],'s.json');window.importSong(f)},pra);
await new Promise(r=>setTimeout(r,900));
const unit=await p.evaluate(()=>{
  const s=sections[0];
  const pat=getSlicedPatternForEvent(s,s.squares[0],s.squares[0].events[0],0);
  return getGridUnitDurationSeconds(+document.getElementById('bpmInput').value,
    s.timeSig||globalTimeSig)/Math.max(1,(pat&&pat.subdivision)||1);
});
for(const mode of ['редактор','лента']){
  if(mode==='лента'){await p.evaluate(()=>toggleTimelineMode());await new Promise(r=>setTimeout(r,800));}
  await p.evaluate(()=>{window.__snd.starts=[]});
  await p.evaluate(()=>playAll());
  await new Promise(r=>setTimeout(r,6000));
  const raw=await p.evaluate(()=>window.__snd.starts.slice());
  await p.evaluate(()=>{if(playbackState.isPlaying)playAll()});
  await new Promise(r=>setTimeout(r,400));
  const u=[...new Set(raw)].sort((a,b)=>a-b);
  // Начало удара = первый источник группы; всё, что ближе 60 мс к
  // предыдущему источнику, относится к тому же удару.
  const hits=[u[0]];let last=u[0];
  for(let i=1;i<u.length;i++){if(u[i]-last>=0.06) hits.push(u[i]); last=u[i];}
  const gaps=[];for(let i=1;i<hits.length;i++)gaps.push(hits[i]-hits[i-1]);
  const off=gaps.filter(g=>{const k=g/unit;return !(Math.abs(k-Math.round(k))<0.12&&Math.round(k)>=1)});
  t(`${mode}: удары в сетке (шаг ${unit.toFixed(3)}с)`, gaps.length>5&&off.length===0,
    `${gaps.length-off.length} из ${gaps.length}`);
}

t('ошибок JS нет', errs.length===0, errs.slice(0,3).join(' | '));
console.log(bad?`\n  ПРОВАЛОВ: ${bad}`:'\n  всё зелено');
await b.close();process.exit(bad?1:0);
})();
