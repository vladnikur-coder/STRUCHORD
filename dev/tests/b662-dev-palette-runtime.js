#!/usr/bin/env node
const fs=require('fs'); const {JSDOM}=require('jsdom');
const html=fs.readFileSync(__dirname+'/../../STRUCHORD.html','utf8');
// Версию берём из самой шапки приложения, а не вписываем числом: иначе
// сьют краснеет на КАЖДОМ релизе (так и случилось на 0.347), хотя
// проверяет он совсем другое — что диагностика вообще построилась.
const expectedVersion=(html.match(/·\s*ver\s+(\d+\.\d+)/)||[])[1];
if(!expectedVersion) throw new Error('ПРОВАЛ: в шапке STRUCHORD.html не найдена строка версии');
let runtimeError=null;
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/',beforeParse(w){
  w.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText:()=>({width:50}),clearRect(){},beginPath(){},arc(){},fill(){},stroke(){},moveTo(){},lineTo(){},closePath(){},save(){},restore(){},translate(){},rotate(){},fillText(){},strokeText(){},setTransform(){},scale(){},createLinearGradient:()=>({addColorStop(){}})});
}});
dom.window.addEventListener('error',e=>{runtimeError=e.error||new Error(e.message);});
dom.window.addEventListener('load',()=>{
  const w=dom.window,d=w.document,trigger=d.getElementById('devPanelTrigger');
  trigger.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  setTimeout(()=>{
    if(runtimeError) throw runtimeError;
    if(!d.querySelector('.dev-palette-overlay')) throw new Error('ПРОВАЛ: палитра не открылась по одиночному клику версии');
    if(!d.querySelector('.dev-palette-state')?.textContent.includes(`Версия: ${expectedVersion}`)) throw new Error(`ПРОВАЛ: диагностика не построилась (ждали «Версия: ${expectedVersion}»)`);
    console.log('ALL OK — dev-палитра реально открывается и строит диагностику.');
    dom.window.close();
  },40);
});
