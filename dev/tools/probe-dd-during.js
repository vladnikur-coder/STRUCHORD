// Что видно ВО ВРЕМЯ жеста: полосы подсказки и мини-превью в ячейках.
const fs=require('fs'),{JSDOM}=require('jsdom');
const root=__dirname+'/../..';
const html=fs.readFileSync(root+'/STRUCHORD.html','utf8');
const song=JSON.parse(fs.readFileSync(root+'/uploads/Дешевые Драмы.struchord.json','utf8'));
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/',beforeParse(win){win.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText:()=>({width:10}),clearRect(){},beginPath(){},arc(){},fill(){},stroke(){},moveTo(){},lineTo(){},closePath(){},save(){},restore(){},translate(){},rotate(){},fillText(){},strokeText(){},setTransform(){},scale(){},setLineDash(){},createLinearGradient:()=>({addColorStop(){}})});}});
const w=dom.window;w.AudioContext=w.webkitAudioContext=function(){return{currentTime:0,state:'running',resume(){}}};
w.localStorage.setItem('struchord_songs',JSON.stringify([song]));w.loadSong(0);try{w.render()}catch(e){}
const W=800,gs=W/16;
const sq=w.document.querySelectorAll('.square-inner')[1];
sq.getBoundingClientRect=()=>({left:0,right:W,width:W,top:0,bottom:60,height:60});
sq.querySelectorAll('.chord-wrapper').forEach(cw=>{cw.getBoundingClientRect=()=>({left:0,right:100,width:100,top:0,bottom:60,height:60})});
const snap=(tag)=>{
  const hints=Array.from(w.document.querySelectorAll('.rhythm-hint')).map(el=>(el.textContent||'').trim().replace(/\s+/g,'')||'∅');
  const prev=Array.from(sq.querySelectorAll('.event-strum-preview')).map(el=>(el.textContent||'').trim().replace(/\s+/g,'')||'∅');
  console.log('\n--- '+tag+' ---');
  console.log('  полосы подсказки:', hints.length?hints.join('  |  '):'нет');
  console.log('  мини-превью:     ', prev.length?prev.join('  |  '):'нет');
};
// ждём, пока догорят rAF после загрузки: иначе отложенный render()
// прилетает в середину жеста и это артефакт зонда, а не бага
setTimeout(main, 300);
function main(){
snap('до жеста');
const h=sq.querySelectorAll('.resize-handle')[2];
const d=new w.MouseEvent('pointerdown',{bubbles:true,cancelable:true,clientX:0});
if(typeof h.onpointerdown==='function')h.onpointerdown(d);else h.dispatchEvent(d);
snap('после pointerdown');
[20,40,gs].forEach(x=>w.document.dispatchEvent(new w.MouseEvent('pointermove',{bubbles:true,cancelable:true,clientX:x})));
setTimeout(()=>{snap('во время протяжки (граница +1 доля)');
 w.document.dispatchEvent(new w.MouseEvent('pointerup',{bubbles:true,cancelable:true,clientX:gs}));
 setTimeout(()=>snap('после pointerup'),600);},100);
}
