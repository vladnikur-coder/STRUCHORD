// Счёт долей на дорожке ритма: номера обязаны идти подряд и совпадать
// с ШИРИНОЙ ячеек, а не с их звучащей длительностью.
//
// Ловит дефект: у ячейки со своим размером (2/4 внутри 4/4) визуальная
// длина считается по знаменателям, а логическая — по числителям.
// Разметка, взявшая логическое смещение, подписывала соседние доли как
// «1 и» / «3 и» — счёт получался «1 и 3 и» вместо «1 и 2 и».
const puppeteer=require('/home/user/node_modules/puppeteer');
let bad=0;
const ok=(n,c,x='')=>{if(c)console.log('   ok  ',n,x);else{bad++;console.log('  FAIL ',n,x)}};
(async()=>{
const b=await puppeteer.launch({args:['--no-sandbox']});
const p=await b.newPage();
await p.setViewport({width:1440,height:900});
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('file:///home/user/STRUCHORD.html',{waitUntil:'networkidle0'});

for(const fx of ['wind-of-change','praskovya']){
  const json=require('fs').readFileSync(`/home/user/dev/fixtures/${fx}.json`,'utf8');
  await p.evaluate(d=>{const f=new File([new Blob([d])],'s.json');window.importSong(f)},json);
  await new Promise(r=>setTimeout(r,900));
  if(!await p.evaluate(()=>timelineMode)) await p.evaluate(()=>toggleTimelineMode());
  await new Promise(r=>setTimeout(r,900));
  console.log(`\n=== ${fx} ===`);

  const d=await p.evaluate(()=>{
    const counts=[...document.querySelectorAll('.tl-count')]
      .map(e=>({t:e.textContent,x:parseFloat(e.style.left)})).sort((a,b)=>a.x-b.x);
    // ожидаемый счёт, посчитанный НЕЗАВИСИМО от отрисовки — по ширинам
    const exp=[];
    const bpb=getGridUnitsPerBar(globalTimeSig);
    timelineCellByKey.forEach((cell,key)=>{
      const [sid,qid,ei]=key.split(':').map(Number);
      const sec=sections.find(s=>s.id===sid); if(!sec) return;
      const sq=sec.squares.find(q=>q.id===qid); if(!sq) return;
      const ev=sq.events[ei]; if(!ev) return;
      const ts=sec.timeSig||globalTimeSig;
      let off=0; for(let i=0;i<ei;i++) off+=getEventVisualSpanInParentUnits(sq.events[i],ts);
      const beats=getEventVisualSpanInParentUnits(ev,ts);
      exp.push({x:cellContentLeft(cell),off,beats,bpb:getGridUnitsPerBar(ts)});
    });
    return {counts,exp,bpb};
  });

  // 1. номера долей идут по кругу 1..N без пропусков внутри каждой ячейки
  let jumps=0;
  const digits=d.counts.filter(c=>/^\d+$/.test(c.t));
  for(let i=1;i<digits.length;i++){
    const a=+digits[i-1].t, b=+digits[i].t;
    const nextOk = b===a+1 || b===1;   // следующая доля или начало нового такта
    if(!nextOk) jumps++;
  }
  ok('номера долей не перескакивают', jumps===0, `перескоков ${jumps}`);

  // 2. каждая доля стоит там, где предсказывает ВИЗУАЛЬНАЯ геометрия
  let off=0;
  d.exp.forEach(e=>{
    const first=Math.round(e.off)%e.bpb;
    if(Math.abs(e.off-Math.round(e.off))<1e-6){
      const near=d.counts.find(c=>Math.abs(c.x-e.x)<1.5);
      if(near && /^\d+$/.test(near.t) && +near.t!==first+1) off++;
    }
  });
  ok('первая доля ячейки подписана по её позиции в такте', off===0, `расхождений ${off}`);

  // 3. Слоги счёта складываются в осмысленные группы.
  //
  // Допустимых схем ТРИ, по дроблению паттерна:
  //   восьмые       «1 и»          — «и» сразу после цифры
  //   триоли        «1 та ти»
  //   шестнадцатые  «1 та и та»    — здесь «и» стоит после «та», и это норма
  // Первая версия стенда требовала цифру перед «и» и давала 96 ложных
  // срабатываний на шестнадцатых в Wind of Change.
  let stray=0;
  const seq=d.counts.map(c=>c.t);
  for(let i=0;i<seq.length;i++){
    if(seq[i]==='и'||seq[i]==='та'||seq[i]==='ти'){
      const prev=seq[i-1];
      // слог обязан к чему-то примыкать: слева цифра или другой слог
      if(!prev||!/^(\d+|та|ти|и)$/.test(prev)) stray++;
      // два «и» подряд не бывают ни в одной схеме
      if(seq[i]==='и'&&prev==='и') stray++;
    }
  }
  ok('слоги счёта примыкают к долям', stray===0, `нарушений ${stray}`);
}
ok('ошибок в консоли нет',errs.length===0,errs.join('|'));
console.log(bad?`\n  ПРОВАЛОВ: ${bad}`:'\n  всё зелено');
await b.close();process.exit(bad?1:0);
})();
