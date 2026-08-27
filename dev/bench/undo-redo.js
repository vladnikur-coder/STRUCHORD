const puppeteer=require('/home/user/node_modules/puppeteer');
let ok=0,bad=0;
const t=(n,c)=>{ if(c){ok++;console.log('   ok  ',n);} else {bad++;console.log('  СБОЙ ',n);} };
(async()=>{
const b=await puppeteer.launch({args:['--no-sandbox']});
const p=await b.newPage();
await p.setViewport({width:1440,height:900});
await p.goto('file:///home/user/STRUCHORD.html',{waitUntil:'networkidle0'});
const json=require('fs').readFileSync('/home/user/dev/fixtures/wind-of-change.json','utf8');
await p.evaluate(d=>{const f=new File([new Blob([d])],'s.json');window.importSong(f)},json);
await new Promise(r=>setTimeout(r,900));

const st=()=>p.evaluate(()=>window.historyDebugState());
const nsec=()=>p.evaluate(()=>sections.length);

console.log('=== Старт ===');
t('история из одной точки', (await st()).length===1);
t('кнопка отмены выключена', await p.$eval('#btnUndo',e=>e.disabled));
const n0=await nsec();
console.log('   секций:',n0);

console.log('=== Правка: удаление секции ===');
await p.evaluate(()=>{sections.pop();requestRender()});
await new Promise(r=>setTimeout(r,700));
t('секций стало меньше', await nsec()===n0-1);
t('шаг записан', (await st()).length===2);
t('кнопка отмены включилась', !(await p.$eval('#btnUndo',e=>e.disabled)));

console.log('=== Отмена ===');
await p.evaluate(()=>window.undoEdit());
await new Promise(r=>setTimeout(r,700));
t('секция вернулась', await nsec()===n0);

console.log('=== Повтор ===');
await p.evaluate(()=>window.redoEdit());
await new Promise(r=>setTimeout(r,700));
t('секция снова удалена', await nsec()===n0-1);

console.log('=== Серия правок схлопывается в один шаг ===');
const before=(await st()).length;
await p.evaluate(()=>{for(let i=0;i<30;i++){sections[0].squares[0].events[0].span=1+(i%3);requestRender()}});
await new Promise(r=>setTimeout(r,800));
const after=(await st()).length;
console.log('   шагов было',before,'стало',after);
t('30 правок дали не больше одного шага', after-before<=1);

console.log('=== Ctrl+Z с клавиатуры ===');
const n1=await nsec();
await p.evaluate(()=>{sections.pop();requestRender()});
await new Promise(r=>setTimeout(r,700));
await p.keyboard.down('Control');await p.keyboard.press('KeyZ');await p.keyboard.up('Control');
await new Promise(r=>setTimeout(r,700));
t('Ctrl+Z вернул секцию', await nsec()===n1);

console.log('=== Ветка «вперёд» обрывается новой правкой ===');
await p.evaluate(()=>{sections.pop();requestRender()});
await new Promise(r=>setTimeout(r,700));
await p.evaluate(()=>window.undoEdit());
await new Promise(r=>setTimeout(r,700));
t('повтор доступен', !(await p.$eval('#btnRedo',e=>e.disabled)));
await p.evaluate(()=>{sections[0].squares[0].events[0].chord='Xyz';requestRender()});
await new Promise(r=>setTimeout(r,800));
t('после новой правки повтор недоступен', await p.$eval('#btnRedo',e=>e.disabled));

console.log('=== Загрузка песни сбрасывает историю ===');
await p.evaluate(d=>{const f=new File([new Blob([d])],'s.json');window.importSong(f)},json);
await new Promise(r=>setTimeout(r,900));
t('история обнулена', (await st()).length===1);
t('отменять нечего', await p.$eval('#btnUndo',e=>e.disabled));

console.log(bad?`\n  ПРОВАЛЕНО: ${bad}, пройдено ${ok}`:'\n  всё зелено');
await b.close();
process.exit(bad?1:0);
})();
