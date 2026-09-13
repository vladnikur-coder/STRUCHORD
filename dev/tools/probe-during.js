// Двигается ли ритм ВО ВРЕМЯ жеста (не после).
const fs=require('fs'),{JSDOM}=require('jsdom');
const root=__dirname+'/../..';
const song=JSON.parse(fs.readFileSync(root+'/uploads/Дешевые Драмы.struchord-3.json','utf8'));
const dom=new JSDOM(fs.readFileSync(root+'/STRUCHORD.html','utf8'),{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/',beforeParse(w){w.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText:()=>({width:10}),clearRect(){},beginPath(){},arc(){},fill(){},stroke(){},moveTo(){},lineTo(){},closePath(){},save(){},restore(){},translate(){},rotate(){},fillText(){},strokeText(){},setTransform(){},scale(){},setLineDash(){},createLinearGradient:()=>({addColorStop(){}})});}});
const w=dom.window;w.AudioContext=w.webkitAudioContext=function(){return{currentTime:0,state:'running',resume(){}}};
const W=800;
w.addEventListener('load',()=>{
 w.localStorage.setItem('struchord_songs',JSON.stringify([song]));w.loadSong(0);try{w.render()}catch(e){}
 setTimeout(()=>{
  const sq=w.document.querySelectorAll('.square-inner')[1];
  sq.getBoundingClientRect=()=>({left:0,right:W,width:W,top:0,bottom:60,height:60});
  sq.querySelectorAll('.chord-wrapper').forEach(cw=>{cw.getBoundingClientRect=()=>({left:0,right:100,width:100,top:0,bottom:60,height:60})});
  // абсолютные позиции ударов ПОДСКАЗКИ в % ширины квадрата
  // Только ЗВУЧАЩИЕ удары: паузы «_» тоже рисуются, но их слышно нет.
  const hint=()=>{const o=[];w.document.querySelectorAll('.rhythm-hint').forEach(s=>{
    const L=parseFloat(s.style.left)||0,WD=parseFloat(s.style.width)||0;
    s.querySelectorAll('.rhythm-hint-hit').forEach(h=>{
      if(h.classList.contains('rest')) return;
      o.push(+(L+WD*(parseFloat(h.style.left)||0)/100).toFixed(2));});});
    return o.sort((a,b)=>a-b);};
  const gs=W/16, h=sq.querySelectorAll('.resize-handle')[1];
  const d=new w.MouseEvent('pointerdown',{bubbles:true,cancelable:true,clientX:0});
  if(typeof h.onpointerdown==='function')h.onpointerdown(d);else h.dispatchEvent(d);
  // Разбивка по ячейкам: видно, ушёл ли удар к соседу или исчез.
  const byCell=()=>Array.from(w.document.querySelectorAll('.rhythm-hint')).map(s=>{
    const L=parseFloat(s.style.left)||0,WD=parseFloat(s.style.width)||0;
    const v=[];s.querySelectorAll('.rhythm-hint-hit').forEach(h=>{
      if(h.classList.contains('rest'))return;
      v.push(+(L+WD*(parseFloat(h.style.left)||0)/100).toFixed(2));});
    return v.join(',');});
  const base=hint();
  console.log('POINTERDOWN ('+base.length+'):');
  console.log('  ',base.join(' '));
  console.log('  по ячейкам:'); byCell().forEach((v,i)=>console.log('    #'+i+': '+v));
  w.__byCell=byCell;
  const snaps=[];
  let step=0;
  const tick=()=>{
    step++;
    w.document.dispatchEvent(new w.MouseEvent('pointermove',{bubbles:true,cancelable:true,clientX:gs*step/4}));
    setTimeout(()=>{
      const cur=hint();
      snaps.push({at:step, n:cur.length, s:cur.join(' ')});
      if(step<4) tick(); else {
        console.log();
        console.log('  по ячейкам В КОНЦЕ:');
        w.__byCell().forEach((v,i)=>console.log('    #'+i+': '+v));
        console.log();
        snaps.forEach(x=>{
          const moved = x.s!==base.join(' ');
          console.log('move '+x.at+'/4 ('+x.n+' ударов) ' + (moved?'ДВИГАЛСЯ':'на месте'));
          if(moved){
            const cur=x.s.split(' ').map(Number);
            const gone=base.filter(v=>!cur.some(u=>Math.abs(u-v)<0.15));
            const add=cur.filter(v=>!base.some(u=>Math.abs(u-v)<0.15));
            if(gone.length) console.log('     пропали  :',gone.join(' '));
            if(add.length)  console.log('     появились:',add.join(' '));
          }
        });
      }
    },60);
  };
  tick();
 },350);
});
