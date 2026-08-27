// Загрузка песен: ошибки в консоли и согласованность ленты с моделью.
//
// Ловит дефект: renderTimelineSectionNav() вызывался только при ВХОДЕ в
// режим ленты, поэтому загрузка или импорт песни на уже открытой ленте
// оставляли навигацию от предыдущей песни — восемь пунктов Wind of
// Change над лентой Прасковьи, и клик уводил в несуществующие секции.
const puppeteer=require('/home/user/node_modules/puppeteer');
const fs=require('fs');
let bad=0;
const t=(n,c,x='')=>{if(c)console.log('   ok  ',n,x);else{bad++;console.log('  FAIL ',n,x)}};
(async()=>{
const b=await puppeteer.launch({args:['--no-sandbox']});
const p=await b.newPage();await p.setViewport({width:1440,height:900});
const errs=[];
p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE: '+m.text())});
await p.goto('file:///home/user/STRUCHORD.html',{waitUntil:'networkidle0'});
const wind=fs.readFileSync('/home/user/dev/fixtures/wind-of-change.json','utf8');
const pra=fs.readFileSync('/home/user/dev/fixtures/praskovya.json','utf8');
const imp=async d=>{await p.evaluate(x=>{const f=new File([new Blob([x])],'s.json');window.importSong(f)},d);
  await new Promise(r=>setTimeout(r,900));};
// Лента, дорожка и навигация строятся из одной модели — обязаны совпадать.
const agree=async name=>{
  const d=await p.evaluate(()=>({exp:sections.reduce((a,x)=>a+Math.max(1,x.repeat||1),0),
    nav:document.querySelectorAll('.tl-secnav-item').length,
    bars:document.querySelectorAll('.tl-section').length}));
  t(name, d.nav===d.exp&&d.bars===d.exp, `навигация ${d.nav}, полос ${d.bars}, секций ${d.exp}`);
};

console.log('=== 1. Загрузка и импорт в режиме ленты ===');
await imp(wind);
await p.evaluate(()=>toggleTimelineMode());
await new Promise(r=>setTimeout(r,800));
await agree('после входа в ленту');
await imp(pra);
await agree('после импорта ДРУГОЙ песни на открытой ленте');
await imp(wind);
await agree('после импорта обратно');

console.log('\n=== 2. Хранилище ===');
await p.evaluate(()=>saveCurrentSong());
await new Promise(r=>setTimeout(r,500));
await imp(pra);
await p.evaluate(()=>saveCurrentSong());
await new Promise(r=>setTimeout(r,500));
await p.evaluate(()=>loadSong(0));
await new Promise(r=>setTimeout(r,900));
await agree('после loadSong в ленте');
await p.evaluate(()=>{window.confirm=()=>true;clearAll()});
await new Promise(r=>setTimeout(r,800));
await agree('после сброса');

console.log('\n=== 3. Битые данные не роняют приложение ===');
for(const [name,data] of [['пустой объект','{}'],['не JSON','мусор'],
  ['sections не массив','{"name":"x","sections":"нет"}'],['null','null']]){
  const be=errs.length;
  await p.evaluate(d=>{const f=new File([new Blob([d])],'x.json');window.importSong(f)},data);
  await new Promise(r=>setTimeout(r,400));
  t(name+' — обработан без падения', errs.length===be, errs.slice(be).join(' | '));
}

console.log('\n=== 4. Гонки ===');
await imp(wind);
await p.evaluate(()=>saveCurrentSong());
await new Promise(r=>setTimeout(r,400));
await p.evaluate(()=>{for(let i=0;i<5;i++) loadSong(0)});
await new Promise(r=>setTimeout(r,1000));
await agree('пять загрузок подряд');
await p.evaluate(()=>{loadSong(0);if(!timelineMode)toggleTimelineMode();});
await new Promise(r=>setTimeout(r,900));
await agree('загрузка + мгновенный вход в ленту');

console.log('\n=== 5. Метка сбрасывается в начало ===');
// scrollLeft живёт на .timeline-viewport, который при смене песни не
// пересоздаётся. Новая лента короче — старое значение упирается в конец,
// и слушатель прокрутки ставит метку на ПОСЛЕДНЮЮ ячейку: человек
// открывал песню и видел её конец.
const posOf=()=>p.evaluate(()=>{
  const vp=document.getElementById('timelineViewport');
  const first=timelineCellByKey.values().next().value;
  const act=document.querySelector('.tl-cell.tl-active');
  return {sl:Math.round(vp.scrollLeft),
    si:timelineStartPosition?timelineStartPosition.sectionIndex:null,
    ei:timelineStartPosition?timelineStartPosition.eventIndex:null,
    onFirst:!!(act&&first&&act===first)};
});
await imp(wind);
if(!await p.evaluate(()=>timelineMode)){await p.evaluate(()=>toggleTimelineMode());await new Promise(r=>setTimeout(r,800));}
// уезжаем вглубь и грузим другую песню
await p.evaluate(()=>{document.getElementById('timelineViewport').scrollLeft=8000});
await new Promise(r=>setTimeout(r,700));
const far=await posOf();
t('перемотка вглубь сработала', far.sl>1000, 'scrollLeft '+far.sl);
await imp(pra);
let z=await posOf();
t('после импорта лента в начале', z.sl===0, 'scrollLeft '+z.sl);
t('после импорта позиция — первое событие', z.si===0&&z.ei===0, `sec${z.si}/ei${z.ei}`);
t('метка на первой ячейке', z.onFirst, String(z.onFirst));
// то же для загрузки из хранилища
await imp(wind);
await p.evaluate(()=>saveCurrentSong());
await new Promise(r=>setTimeout(r,400));
await p.evaluate(()=>{document.getElementById('timelineViewport').scrollLeft=6000});
await new Promise(r=>setTimeout(r,700));
await p.evaluate(()=>loadSong(0));
await new Promise(r=>setTimeout(r,1200));
z=await posOf();
t('после loadSong лента в начале', z.sl===0, 'scrollLeft '+z.sl);
t('после loadSong позиция — первое событие', z.si===0&&z.ei===0, `sec${z.si}/ei${z.ei}`);
// а вот правки мотать НЕ должны
await p.evaluate(()=>{document.getElementById('timelineViewport').scrollLeft=6000});
await new Promise(r=>setTimeout(r,700));
await p.evaluate(()=>{sections[0].squares[0].events[0].chord='Bm';requestRender()});
await new Promise(r=>setTimeout(r,900));
const keep=await posOf();
t('правка аккорда НЕ мотает ленту', keep.sl>1000, 'scrollLeft '+keep.sl);
// сброс: позиция не должна указывать в удалённую песню
await p.evaluate(()=>{window.confirm=()=>true;clearAll()});
await new Promise(r=>setTimeout(r,1000));
const cl=await posOf();
t('после сброса позиция обнулена', cl.si===null&&cl.sl===0, `sl=${cl.sl} sec=${cl.si}`);

t('ошибок в консоли нет', errs.length===0, errs.slice(0,3).join(' | '));
console.log(bad?`\n  ПРОВАЛОВ: ${bad}`:'\n  всё зелено');
await b.close();process.exit(bad?1:0);
})();
