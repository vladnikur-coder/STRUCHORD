#!/usr/bin/env node
/* B-66.2 / 0.332 — dev-прототип ручного генератора действительно запускается. */
const fs=require('fs');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(__dirname+'/../../STRUCHORD.html','utf8');
let runtimeError=null;
const dom=new JSDOM(html,{
  runScripts:'dangerously',
  pretendToBeVisual:true,
  url:'https://localhost/',
  beforeParse(w){
    w.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText:()=>({width:50}),clearRect(){},beginPath(){},arc(){},fill(){},stroke(){},moveTo(){},lineTo(){},closePath(){},save(){},restore(){},translate(){},rotate(){},fillText(){},strokeText(){},setTransform(){},scale(){},createLinearGradient:()=>({addColorStop(){}})});
  }
});
dom.window.addEventListener('error',e=>{runtimeError=e.error||new Error(e.message);});
dom.window.addEventListener('load',()=>{
  const w=dom.window,d=w.document;
  if(typeof w.startPowerGeneratorPrototype!=='function') throw new Error('ПРОВАЛ: startPowerGeneratorPrototype не экспортирован в runtime');
  w.startPowerGeneratorPrototype();
  setTimeout(()=>{
    if(runtimeError) throw runtimeError;
    const scene=d.querySelector('.power-generator-scene');
    if(!scene) throw new Error('ПРОВАЛ: сцена генератора не создана');
    if(!scene.classList.contains('is-failing')) throw new Error('ПРОВАЛ: сценарий не начал мигание питания');
    if(!scene.querySelector('[data-generator-handle]')) throw new Error('ПРОВАЛ: круговая ручка не создана');
    if(!scene.querySelector('[data-generator-needle]')) throw new Error('ПРОВАЛ: стрелка вольтметра не создана');
    if(scene.querySelector('[data-generator-voltage]')?.textContent!=='0 V') throw new Error('ПРОВАЛ: стартовое напряжение не равно нулю');
    console.log('ALL OK — dev-прототип генератора запускается, мигает и строит интерактивный прибор.');
    dom.window.close();
  },60);
});
