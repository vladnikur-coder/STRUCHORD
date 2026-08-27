// Разделитель «|» в бейдже боя секции — перед нотой, на которой
// меняется аккорд.
const fs=require('fs');const {JSDOM}=require('jsdom');
const dom=new JSDOM(fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8'),{
  runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/',
  beforeParse(w){w.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText:()=>({width:10}),
    clearRect(){},beginPath(){},arc(){},fill(){},stroke(){},moveTo(){},lineTo(){},closePath(){},
    save(){},restore(){},translate(){},rotate(){},fillText(){},strokeText(){},setTransform(){},scale(){},
    createLinearGradient:()=>({addColorStop(){}})});}});
const w=dom.window;
w.AudioContext=w.webkitAudioContext=function(){return{currentTime:0,state:'running',resume(){}};};
let bad=0;
const ok=(n,c,x)=>{console.log(`   ${c?'ok  ':'FAIL'} ${n}${!c&&x?' — '+x:''}`);if(!c)bad++;};
const layout=el=>[...el.childNodes].map(n=>n.className==='strum-chord-sep'?'|':(n.textContent||'')).join('');

w.addEventListener('load',()=>{
  const d=w.document;
  w.eval("addSection('Verse'); render();");
  w.eval(`
    const sec=sections[0];
    sec.squares=[
      {id:801,repeat:1,customBeats:null,strumPattern:null,
       events:[{chord:'Am',span:2},{chord:'F',span:2}]},
      {id:802,repeat:1,customBeats:null,strumPattern:null,
       events:[{chord:'C',span:1},{chord:'G',span:3}]}];
    sec.strumPattern={mode:'strum',subdivision:2,steps:['D','U','D','U','D','U','D','U']};
    render();
  `);

  console.log('=== 1. Границы аккордов вычисляются ===');
  const u1=w.eval("JSON.stringify(getChordChangeUnits(sections[0].squares[0],'4/4'))");
  const u2=w.eval("JSON.stringify(getChordChangeUnits(sections[0].squares[1],'4/4'))");
  console.log('      квадрат 1 (Am 2 + F 2):', u1);
  console.log('      квадрат 2 (C 1 + G 3):', u2);
  ok('первый аккорд не считается границей', !JSON.parse(u1).includes(0));
  ok('смена на 2-й доле найдена', JSON.parse(u1)[0]===2, u1);

  console.log('\n=== 2. Компактный вид сохраняется, ×N считает до смены ===');
  const badge=d.querySelector('.strum-badge-wrap .strum-preview');
  console.log('      бейдж:', layout(badge));
  // Рисунок ↓↑ повторяется 4 раза за такт, аккорд меняется на 2-й доле
  // (после 2 повторов) — счётчик должен показать 2, а не 4.
  ok('вид остался компактным', badge.querySelectorAll('.strum-step').length===2,
     badge.querySelectorAll('.strum-step').length+' шагов');
  const cnt=badge.querySelector('.strum-repeat-count');
  console.log('      счётчик:', cnt.textContent, '| подсказка:', JSON.stringify(cnt.title));
  ok('×N считает повторы до смены аккорда', cnt.textContent==='×2', cnt.textContent);
  ok('подсказка объясняет смысл', /смена/.test(cnt.title), cnt.title);

  console.log('\n=== 3. Разделитель — только если помещается в кусок ===');
  w.eval(`
    sections[0].strumPattern={mode:'strum',subdivision:2,steps:['D',null,'D','U',null,'U','D','U']};
    render();
  `);
  const full=d.querySelector('.strum-badge-wrap .strum-preview');
  console.log('      бейдж:', layout(full));
  ok('в неповторяющемся рисунке разделитель есть',
     full.querySelectorAll('.strum-chord-sep').length===1,
     full.querySelectorAll('.strum-chord-sep').length+'');

  console.log('\n=== 4. Во время игры — по звучащему квадрату ===');
  w.eval(`
    playbackState.isPlaying=true;
    playbackState.currentSectionIndex=0;
    playbackState.currentSquareIndex=1;   // играет ВТОРОЙ квадрат
    setSectionLiveStrumBadge(sections[0], sections[0].strumPattern);
  `);
  const live=d.querySelector('.strum-badge-wrap .strum-preview');
  console.log('      бейдж:', layout(live));
  // Второй квадрат: C(1 доля) + G(3) — смена на 1-й доле, то есть
  // разделитель попадает внутрь развёрнутого рисунка.
  ok('разделитель по звучащему квадрату',
     layout(live).indexOf('|')===2, layout(live));
  w.eval('playbackState.isPlaying=false');

  console.log('\n=== 5. Один аккорд на квадрат — разделителей нет ===');
  w.eval(`
    sections[0].squares=[{id:803,repeat:1,customBeats:null,strumPattern:null,
      events:[{chord:'Am',span:4}]}];
    render();
  `);
  const single=d.querySelector('.strum-badge-wrap .strum-preview');
  console.log('      бейдж:', layout(single));
  ok('разделителей нет', single.querySelectorAll('.strum-chord-sep').length===0);

  console.log('\n=== 6. Пустая ячейка (пауза) не создаёт границу ===');
  w.eval(`
    sections[0].squares=[{id:804,repeat:1,customBeats:null,strumPattern:null,
      events:[{chord:'Am',span:2},{chord:'',span:2}]}];
    render();
  `);
  const withPause=d.querySelector('.strum-badge-wrap .strum-preview');
  console.log('      бейдж:', layout(withPause));
  ok('пауза не считается сменой аккорда',
     withPause.querySelectorAll('.strum-chord-sep').length===0);

  console.log('\n=== 7. Разделитель встаёт на удар, а не в паузу ===');
  // На реальной гитаре аккорд меняется не в тишине, а следующим
  // движением руки — разделитель обязан «доехать» до ближайшего удара.
  const draw=(steps,units,sub)=>w.eval(`(function(){
    const {preview}=buildStrumPreviewEls(
      {mode:'strum',subdivision:${sub},steps:${JSON.stringify(steps)}},
      {chordChangeUnits:${JSON.stringify(units)}});
    return [...preview.childNodes].map(n=>n.className==='strum-chord-sep'?'|'
      :({'↓':'D','↑':'U','×':'X'}[n.textContent]||n.textContent||'')).join('');
  })()`);
  const S=str=>str.split('').map(c=>c==='_'?null:c);
  const pat=S('D___D__U_UD_D_DU');

  const r1=draw(pat,[4],2);   // граница на 9-м шаге — там пауза
  console.log('      смена в паузу  :', r1);
  ok('сдвинулся на следующий удар', r1==='D___D__U_|UD_D_DU', r1);

  const r2=draw(pat,[0.5],2); // граница на 2-м шаге — тоже пауза
  console.log('      смена в паузу  :', r2);
  ok('сдвинулся к ближайшему D', r2==='D___|D__U_UD_D_DU', r2);

  const r3=draw(pat,[2],2);   // граница уже на ударе
  console.log('      смена на ударе :', r3);
  ok('на ударе не двигается', r3==='D___|D__U_UD_D_DU', r3);

  const r4=draw(S('D_D_____'),[2],2);  // дальше одни паузы
  console.log('      дальше тишина  :', r4);
  ok('без ударов разделителя нет', !r4.includes('|'), r4);

  console.log(bad?`\nПРОВАЛОВ: ${bad}`:'\nвсе проверки пройдены');
  if(bad) process.exitCode=1;
});
