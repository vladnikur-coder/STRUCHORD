// Паузы «_» в превью боя качаются по принципу маятника — но только там,
// где фазу можно определить достоверно.
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

w.addEventListener('load',()=>{
  const d=w.document;
  const build=(mode,sub,steps)=>{
    const r=w.eval(`(function(){
      const {preview}=buildStrumPreviewEls({mode:'${mode}',subdivision:${sub},steps:${JSON.stringify(steps)}});
      return JSON.stringify([...preview.querySelectorAll('.strum-step')].map(e=>e.className));
    })()`);
    return JSON.parse(r);
  };
  const dirOf=c=>c.includes('rest-down')?'вниз':c.includes('rest-up')?'вверх':
                 c.includes('rest')?'—':(c.includes('down')?'D':c.includes('up')?'U':'X');

  console.log('=== «Восьмёрка»: sub 2, чётная длина ===');
  let cls=build('strum',2,['D',null,'D','U',null,'U','D','U']);
  console.log('      ', cls.map(dirOf).join(' '));
  ok('паузы получили направление', cls.filter(c=>c.includes('rest-')).length>0);
  ok('пауза на нечётной позиции — вниз', cls[1].includes('rest-up'), cls[1]);
  ok('пауза на позиции 4 — вниз', cls[4].includes('rest-down'), cls[4]);

  console.log('\n=== Триоли sub 3: НЕ трогаем ===');
  cls=build('strum',3,['D',null,null,'U',null,'U']);
  console.log('      ', cls.map(dirOf).join(' '));
  ok('у пауз нет направления', cls.filter(c=>c.includes('rest-')).length===0,
     cls.filter(c=>c.includes('rest-')).join(','));

  console.log('\n=== Нечётный кусок: фаза перевернулась бы при ×N ===');
  cls=build('strum',1,['D',null,'U']);
  console.log('      ', cls.map(dirOf).join(' '), '(кусок из 3 шагов)');
  ok('качание отключено', cls.filter(c=>c.includes('rest-')).length===0);

  console.log('\n=== Реальные пресеты приложения ===');
  const names=w.eval("JSON.stringify(STRUM_PRESETS.filter(p=>p.mode==='strum').map(p=>[p.name,p.subdivision,p.steps]))");
  JSON.parse(names).forEach(([name,sub,steps])=>{
    const c=build('strum',sub,steps);
    const swing=c.filter(x=>x.includes('rest-')).length;
    const rests=c.filter(x=>x.includes('rest')).length;
    console.log('      '+name.padEnd(20)+'sub '+sub+' | пауз '+rests+', качаются '+swing);
  });

  console.log('\n=== CSS-правила ===');
  const css=[...d.querySelectorAll('style')].map(s=>s.textContent).join('');
  ok('есть правило rest-down', /\.strum-step\.rest\.rest-down\.strum-step-active/.test(css));
  ok('есть правило rest-up', /\.strum-step\.rest\.rest-up\.strum-step-active/.test(css));
  const m=css.match(/\.strum-step\.rest\.rest-down\.strum-step-active\s*\{[^}]*translateY\(([\d.]+)px\)/);
  const restShift=m?parseFloat(m[1]):null;
  const m2=css.match(/\.strum-step\.down\.strum-step-active\s*\{[^}]*translateY\(([\d.]+)px\)/);
  const downShift=m2?parseFloat(m2[1]):null;
  console.log('      смещение паузы '+restShift+'px против удара '+downShift+'px');
  ok('амплитуда паузы меньше', restShift<downShift, `${restShift} vs ${downShift}`);
  ok('но не нулевая', restShift>0);

  console.log(bad?`\nПРОВАЛОВ: ${bad}`:'\nвсе проверки пройдены');
  if(bad) process.exitCode=1;
});
