const fs=require('fs'),{JSDOM}=require('jsdom');
const root='/home/user/STRUCHORD';
const html=fs.readFileSync(root+'/STRUCHORD.html','utf8');
const song=JSON.parse(fs.readFileSync(root+'/uploads/Дешевые Драмы.struchord.json','utf8'));
function boot(){const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/',beforeParse(win){win.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText:()=>({width:10}),clearRect(){},beginPath(){},arc(){},fill(){},stroke(){},moveTo(){},lineTo(){},closePath(){},save(){},restore(){},translate(){},rotate(){},fillText(){},strokeText(){},setTransform(){},scale(){},createLinearGradient:()=>({addColorStop(){}})});}});
const w=dom.window;w.AudioContext=w.webkitAudioContext=function(){return{currentTime:0,state:'running',resume(){}}};
w.localStorage.setItem('struchord_songs',JSON.stringify([song]));w.loadSong(0);try{w.render()}catch(e){}return w;}
const spans=w=>JSON.parse(w.eval(`JSON.stringify(sections[0].squares[1].events.map(e=>e.span))`));
const W=800,gs=W/16;
function g(w,hi,from,dxs){const sq=w.document.querySelectorAll('.square-inner')[1];
 sq.getBoundingClientRect=()=>({left:0,right:W,width:W,top:0,bottom:60,height:60});
 sq.querySelectorAll('.chord-wrapper').forEach(cw=>{cw.getBoundingClientRect=()=>({left:0,right:100,width:100,top:0,bottom:60,height:60})});
 const h=sq.querySelectorAll('.resize-handle')[hi];
 const e=new w.MouseEvent('pointerdown',{bubbles:true,cancelable:true,clientX:from});
 if(typeof h.onpointerdown==='function')h.onpointerdown(e);else h.dispatchEvent(e);
 dxs.forEach(x=>w.document.dispatchEvent(new w.MouseEvent('pointermove',{bubbles:true,cancelable:true,clientX:x})));
 w.document.dispatchEvent(new w.MouseEvent('pointerup',{bubbles:true,cancelable:true,clientX:dxs[dxs.length-1]}));}
(async()=>{
 const w=boot();
 console.log('старт:  ',spans(w).join(' | '));
 g(w,2,0,[20,40,gs]); await new Promise(r=>setTimeout(r,250));
 const mid=spans(w); console.log('вправо: ',mid.join(' | '),' сумма',mid.reduce((a,b)=>a+b,0));
 g(w,2,gs,[gs-20,20,0]); await new Promise(r=>setTimeout(r,250));
 const back=spans(w); console.log('назад:  ',back.join(' | '),' сумма',back.reduce((a,b)=>a+b,0));
 console.log('\nобратимость по сумме пары (1.75+2.25=4):', back[2]+back[3]===4?'OK 4':'СЛОМАНО '+(back[2]+back[3]));
 console.log('нетронутые F,E,F,E целы:', back[0]===2&&back[1]===2&&back[4]===4&&back[5]===4?'OK':'СЛОМАНО');
})();
