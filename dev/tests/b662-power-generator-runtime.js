#!/usr/bin/env node
/* B-66.2 / 0.334 — генератор запускается, реагирует и строит процедурный звук. */
const fs=require('fs');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(__dirname+'/../../STRUCHORD.html','utf8');
let runtimeError=null;
class MockParam {
  constructor(value=0){this.value=value;}
  setValueAtTime(value){this.value=value;}
  setTargetAtTime(value){this.value=value;}
  exponentialRampToValueAtTime(value){this.value=value;}
  cancelScheduledValues(){}
}
class MockOscillator {
  constructor(){this.frequency=new MockParam();this.type='sine';this.started=false;this.stopped=false;}
  connect(){} start(){this.started=true;} stop(){this.stopped=true;}
}
class MockGain { constructor(){this.gain=new MockParam();} connect(){} disconnect(){} }
class MockAudioContext {
  static instances=[];
  constructor(){this.state='running';this.sampleRate=48000;this.currentTime=1;this.destination={};this.oscillators=[];MockAudioContext.instances.push(this);}
  resume(){this.state='running';return Promise.resolve();}
  close(){this.state='closed';return Promise.resolve();}
  createOscillator(){const node=new MockOscillator();this.oscillators.push(node);return node;}
  createGain(){return new MockGain();}
}
const dom=new JSDOM(html,{
  runScripts:'dangerously',
  pretendToBeVisual:true,
  url:'https://localhost/',
  beforeParse(w){
    w.AudioContext=w.webkitAudioContext=MockAudioContext;
    w.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText:()=>({width:50}),clearRect(){},beginPath(){},arc(){},fill(){},stroke(){},moveTo(){},lineTo(){},closePath(){},save(){},restore(){},translate(){},rotate(){},fillText(){},strokeText(){},setTransform(){},scale(){},createLinearGradient:()=>({addColorStop(){}})});
  }
});
dom.window.addEventListener('error',e=>{runtimeError=e.error||new Error(e.message);});
dom.window.addEventListener('load',()=>{
  setTimeout(()=>{
    try {
      const w=dom.window,d=w.document;
      if(runtimeError)throw runtimeError;
      if(typeof w.startPowerGeneratorPrototype!=='function')throw new Error('ПРОВАЛ: startPowerGeneratorPrototype не экспортирован в runtime');
      w.startPowerGeneratorPrototype();
      const scene=d.querySelector('.power-generator-scene');
      if(!scene)throw new Error('ПРОВАЛ: сцена генератора не создана');
      if(!scene.querySelector('[data-generator-handle]'))throw new Error('ПРОВАЛ: круговая ручка не создана');
      if(!scene.querySelector('[data-generator-needle]')||!scene.querySelector('[data-generator-rotor]'))throw new Error('ПРОВАЛ: прибор или ротор не создан');
      if(scene.querySelector('[data-generator-voltage]')?.textContent!=='0 V')throw new Error('ПРОВАЛ: стартовое напряжение не равно нулю');

      const state=w.eval('powerGeneratorState');
      state.phase='ready';
      const audio=w.ensurePowerGeneratorAudio(state);
      if(!audio||!audio.hum.started||!audio.harmonic.started)throw new Error('ПРОВАЛ: процедурный гул не запущен');
      state.angle=35;state.turns=1;state.storedVoltage=20;state.angularVelocity=7;
      w.updatePowerGeneratorGauge();w.updatePowerGeneratorFeedback(100);
      if(Number(scene.style.getPropertyValue('--generator-power'))<=0||Number(scene.style.getPropertyValue('--generator-speed'))<=0)throw new Error('ПРОВАЛ: CSS-отдача не следует состоянию');
      if(audio.ctx.oscillators.length<3)throw new Error('ПРОВАЛ: трещотка не отреагировала на угол');

      w.completePowerGeneratorPrototype();
      if(state.phase!=='complete'||!scene.classList.contains('is-powered'))throw new Error('ПРОВАЛ: финал 220 V не включён');
      if(state.currentVoltage!==220||state.voltage.textContent!=='220 V')throw new Error('ПРОВАЛ: финал не зафиксирован на 220 V');
      if(audio.ctx.oscillators.length<5)throw new Error('ПРОВАЛ: контактор и импульс питания не созданы');
      const hum=audio.hum,harmonic=audio.harmonic;
      w.clearPowerGeneratorPrototype(false);
      if(!hum.stopped||!harmonic.stopped)throw new Error('ПРОВАЛ: звук не остановлен при очистке сцены');
      if(d.querySelector('.power-generator-scene'))throw new Error('ПРОВАЛ: сцена не удалена');
      console.log('ALL OK — генератор строит шкалу и ротор, синтезирует гул/трещотку/финал, фиксирует 220 V и чисто останавливается.');
      dom.window.close();
    }catch(error){console.error(error);dom.window.close();process.exit(1);}
  },60);
});
