// FPS во время ВОСПРОИЗВЕДЕНИЯ — главный сценарий: лента едет под
// метку 60 раз в секунду, пока учитель играет. Просадка здесь видна
// глазом как рывок ленты.
const puppeteer=require('/home/user/node_modules/puppeteer');
const SONG=process.argv[2]||'wind-of-change';
(async()=>{
// БЕЗ --disable-gpu-vsync: с ним rAF крутится свободно и медиана
// падает до 0.2 мс — «5000 fps». Такой замер бессмыслен: нам нужно
// знать, попадает ли приложение в реальный кадр 16.7 мс.
const b=await puppeteer.launch({args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
const p=await b.newPage();await p.setViewport({width:1440,height:900});
await p.goto('file:///home/user/STRUCHORD.html',{waitUntil:'networkidle0'});
const j=require('fs').readFileSync(`/home/user/dev/fixtures/${SONG}.json`,'utf8');
await p.evaluate(x=>{const f=new File([new Blob([x])],'s.json');window.importSong(f)},j);
await new Promise(r=>setTimeout(r,900));

const measure=async(label,seconds)=>{
  await p.evaluate(()=>{window.__f=[];window.__raf=0;
    const loop=()=>{window.__f.push(performance.now());window.__raf=requestAnimationFrame(loop)};
    window.__raf=requestAnimationFrame(loop);});
  await new Promise(r=>setTimeout(r,seconds*1000));
  const f=await p.evaluate(()=>{cancelAnimationFrame(window.__raf);return window.__f});
  const d=[];for(let i=1;i<f.length;i++)d.push(f[i]-f[i-1]);
  d.sort((a,b)=>a-b);
  const q=x=>d[Math.min(d.length-1,Math.floor(d.length*x))];
  const over=(ms)=>d.filter(v=>v>ms).length;
  const fps=1000/q(.5);
  console.log(`  ${label.padEnd(30)} кадров ${String(d.length).padStart(4)} | медиана ${q(.5).toFixed(1)}мс (${fps.toFixed(0)} fps)`+
    ` | p95 ${q(.95).toFixed(1)} | худший ${d[d.length-1].toFixed(1)} | >20мс: ${over(20)} (${(over(20)/d.length*100).toFixed(1)}%)`);
  return {med:q(.5),p95:q(.95),worst:d[d.length-1],over:over(20),n:d.length};
};

console.log(`\n### ${SONG} ###`);
console.log('\n=== РЕДАКТОР ===');
await measure('покой',3);
await p.evaluate(()=>playAll());
await new Promise(r=>setTimeout(r,700));
await measure('воспроизведение',6);
await p.evaluate(()=>{if(playbackState.isPlaying)playAll()});
await new Promise(r=>setTimeout(r,600));

console.log('\n=== ЛЕНТА ===');
await p.evaluate(()=>toggleTimelineMode());
await new Promise(r=>setTimeout(r,900));
await measure('покой',3);
await p.evaluate(()=>playAll());
await new Promise(r=>setTimeout(r,700));
const play=await measure('воспроизведение (лента едет)',8);
await p.evaluate(()=>{if(playbackState.isPlaying)playAll()});
await new Promise(r=>setTimeout(r,600));

// прокрутка ленты пальцем/трекпадом
await p.evaluate(()=>{window.__sc=setInterval(()=>{
  const vp=document.getElementById('timelineViewport');vp.scrollLeft+=12;},16)});
await measure('ручная прокрутка',4);
await p.evaluate(()=>clearInterval(window.__sc));

console.log('\n итог по главному сценарию (лента+игра):',
  play.med<=17.5&&play.over/play.n<0.05 ? 'СТАБИЛЬНЫЕ 60 fps' :
  `медиана ${play.med.toFixed(1)}мс, просадок ${(play.over/play.n*100).toFixed(1)}%`);
await b.close();
})();
