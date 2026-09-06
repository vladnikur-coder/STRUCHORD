// Матрица жестов по всем границам всех квадратов «Дешевых Драм».
const fs=require('fs'),{JSDOM}=require('jsdom');
const root=__dirname+'/../..';
const html=fs.readFileSync(root+'/STRUCHORD.html','utf8');
const song=JSON.parse(fs.readFileSync(root+'/uploads/Дешевые Драмы.struchord.json','utf8'));
function boot(){const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/',beforeParse(win){win.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText:()=>({width:10}),clearRect(){},beginPath(){},arc(){},fill(){},stroke(){},moveTo(){},lineTo(){},closePath(){},save(){},restore(){},translate(){},rotate(){},fillText(){},strokeText(){},setTransform(){},scale(){},setLineDash(){},createLinearGradient:()=>({addColorStop(){}})});}});
const w=dom.window;w.AudioContext=w.webkitAudioContext=function(){return{currentTime:0,state:'running',resume(){}}};
w.localStorage.setItem('struchord_songs',JSON.stringify([song]));w.loadSong(0);try{w.render()}catch(e){}return w;}
const W=800;
function state(w,qi){return w.eval(`(()=>{const s=sections[0],sq=s.squares[${qi}];
 return JSON.stringify({sp:sq.events.map(e=>e.span),
  snd:sq.events.map((e,i)=>{const x=rhythmSoundingForEvent(s,sq,e,i);return x?x.subdivision+'/'+x.steps.length:'-'})});})()`);}
(async()=>{
 const w0=boot();
 const nq=JSON.parse(w0.eval('JSON.stringify(sections[0].squares.map(q=>q.events.length))'));
 console.log('квадраты, ячеек:',nq.join(', '));
 for(let qi=0;qi<nq.length;qi++){
  for(let hi=0;hi<nq[qi]-1;hi++){
   for(const dir of [1,-1]){
    const w=boot();
    const before=JSON.parse(state(w,qi));
    const sq=w.document.querySelectorAll('.square-inner')[qi];
    if(!sq) continue;
    const cap=before.sp.reduce((a,b)=>a+b,0);
    const gs=W/cap;
    sq.getBoundingClientRect=()=>({left:0,right:W,width:W,top:0,bottom:60,height:60});
    sq.querySelectorAll('.chord-wrapper').forEach(cw=>{cw.getBoundingClientRect=()=>({left:0,right:100,width:100,top:0,bottom:60,height:60})});
    const h=sq.querySelectorAll('.resize-handle')[hi];
    if(!h) continue;
    const d=new w.MouseEvent('pointerdown',{bubbles:true,cancelable:true,clientX:0});
    if(typeof h.onpointerdown==='function')h.onpointerdown(d);else h.dispatchEvent(d);
    for(let k=1;k<=8;k++) w.document.dispatchEvent(new w.MouseEvent('pointermove',{bubbles:true,cancelable:true,clientX:dir*gs*k/8}));
    w.document.dispatchEvent(new w.MouseEvent('pointerup',{bubbles:true,cancelable:true,clientX:dir*gs}));
    await new Promise(r=>setTimeout(r,220));
    const after=JSON.parse(state(w,qi));
    const sum=after.sp.reduce((a,b)=>a+b,0);
    const problems=[];
    if(Math.abs(sum-cap)>1e-9) problems.push('ДЛИНА '+sum+'!='+cap);
    // чужие ячейки не должны меняться
    before.sp.forEach((v,i)=>{if(i!==hi&&i!==hi+1&&Math.abs(v-after.sp[i])>1e-9)problems.push('чужая#'+i+' '+v+'->'+after.sp[i]);});
    // дробность боя не должна прыгать
    before.snd.forEach((v,i)=>{const b=v.split('/')[0],a=after.snd[i].split('/')[0];
      if(b!=='-'&&a!=='-'&&b!==a)problems.push('sub#'+i+' '+b+'->'+a);});
    if(after.sp.some(v=>v<=0))problems.push('НЕПОЛОЖИТЕЛЬНЫЙ span');
    if(problems.length)console.log(`  sq${qi} ручка${hi} ${dir>0?'вправо':'влево'}: ${problems.join(' | ')}`);
   }
  }
 }
 console.log('готово');
})();
