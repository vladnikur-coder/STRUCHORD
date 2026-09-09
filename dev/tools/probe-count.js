const fs=require('fs'),{JSDOM}=require('jsdom');
const root=__dirname+'/../..';
const song=JSON.parse(fs.readFileSync(root+'/uploads/Дешевые Драмы.struchord-3.json','utf8'));
const d=new JSDOM(fs.readFileSync(root+'/STRUCHORD.html','utf8'),{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/',beforeParse(w){w.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText:()=>({width:10}),clearRect(){},beginPath(){},arc(){},fill(){},stroke(){},moveTo(){},lineTo(){},closePath(){},save(){},restore(){},translate(){},rotate(){},fillText(){},strokeText(){},setTransform(){},scale(){},setLineDash(){},createLinearGradient:()=>({addColorStop(){}})});}});
const w=d.window;w.AudioContext=w.webkitAudioContext=function(){return{currentTime:0,state:'running',resume(){}}};
w.addEventListener('load',()=>{
 w.localStorage.setItem('struchord_songs',JSON.stringify([song]));w.loadSong(0);try{w.render()}catch(e){}
 setTimeout(()=>{
  const sq=w.document.querySelectorAll('.square-inner')[1];
  const cells=[...sq.querySelectorAll('.chord-wrapper')];
  console.log('квадрат sq1, счёт под каждой ячейкой:');
  let off=0;
  const spans=[1.5,2.5,2,2,4,4];
  cells.forEach((c,i)=>{
    const name=(c.querySelector('.chord-display')||{}).textContent||'?';
    const counts=[...c.querySelectorAll('.chord-count')].map(e=>e.textContent.trim()).join(' ');
    // как ДОЛЖНО быть: узлы с шагом 1 доля от абсолютного смещения
    const want=[]; let b=Math.ceil(off-1e-9);
    while(b<off+spans[i]-1e-9){ want.push(String(b%4+1)); b+=1; }
    const ok = counts.replace(/\s+/g,' ')===want.join(' ');
    console.log(`  ${name.trim().slice(0,5).padEnd(6)} off ${String(off).padEnd(4)} показано: [${counts}]  ждём: [${want.join(' ')}]  ${ok?'ok':'<-- РАСХОЖДЕНИЕ'}`);
    off+=spans[i];
  });
 },400);
});
