#!/usr/bin/env node
/* B-66.2 / 0.335 — утечка, независимый unlock 220 и процедурный звук. */
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
  connect(){} disconnect(){} start(){this.started=true;} stop(){this.stopped=true;}
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
    // Имитируем профиль 0.334, где 220 ошибочно уже открыло Грозу.
    w.localStorage.setItem('struchord-storm-unlocked','1');
    w.localStorage.setItem('struchord-storm-enabled','1');
    w.localStorage.setItem('struchord-storm-achievements','["220-volts"]');
    w.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText:()=>({width:50}),clearRect(){},beginPath(){},arc(){},fill(){},stroke(){},moveTo(){},lineTo(){},closePath(){},save(){},restore(){},translate(){},rotate(){},fillText(){},strokeText(){},setTransform(){},scale(){},createLinearGradient:()=>({addColorStop(){}})});
  }
});
dom.window.addEventListener('error',e=>{runtimeError=e.error||new Error(e.message);});
dom.window.addEventListener('load',()=>{
  setTimeout(async ()=>{
    try {
      const w=dom.window,d=w.document;
      if(runtimeError)throw runtimeError;
      if(w.eval('stormUnlocked')||w.eval('powerAchievementSeen'))throw new Error('ПРОВАЛ: миграция не отозвала старые unlock');
      if(w.localStorage.getItem('struchord-storm-unlocked')!==null||w.localStorage.getItem('struchord-storm-achievements')!==null)throw new Error('ПРОВАЛ: старые ключи Грозы остались');
      if(w.localStorage.getItem('struchord-secret-routing-v335')!=='1')throw new Error('ПРОВАЛ: миграция 0.335 не помечена');

      w.startPowerGeneratorPrototype();
      const scene=d.querySelector('.power-generator-scene');
      if(!scene||!scene.querySelector('[data-generator-handle]'))throw new Error('ПРОВАЛ: сцена или ручка не созданы');
      if(!scene.querySelector('[data-generator-needle]')||!scene.querySelector('[data-generator-rotor]'))throw new Error('ПРОВАЛ: прибор или ротор не создан');
      const state=w.eval('powerGeneratorState');
      state.phase='ready';
      const audio=w.ensurePowerGeneratorAudio(state);
      if(!audio||!audio.hum.started||!audio.harmonic.started)throw new Error('ПРОВАЛ: процедурный гул не запущен');

      state.storedVoltage=100;state.turns=100/205*12;state.currentVoltage=100;state.angularVelocity=0;state.idleStartedAt=100;
      w.updatePowerGeneratorDecay(state,1099,1);
      if(state.storedVoltage!==100)throw new Error('ПРОВАЛ: утечка началась раньше одной секунды');
      w.updatePowerGeneratorDecay(state,1100,1);
      if(state.storedVoltage!==85)throw new Error('ПРОВАЛ: скорость утечки не равна 15 V/с');
      for(let i=0;i<10;i++)w.updatePowerGeneratorDecay(state,2100+i*1000,1);
      if(state.storedVoltage!==0||state.turns!==0)throw new Error('ПРОВАЛ: напряжение и прогресс не упали до нуля');
      w.rotatePowerGenerator(Math.PI/2);
      if(state.storedVoltage<=0||state.storedVoltage>=10)throw new Error('ПРОВАЛ: новый поворот вернул старый пик вместо набора с нуля');

      state.angle=35;state.angularVelocity=7;
      w.updatePowerGeneratorGauge();w.updatePowerGeneratorFeedback(100);
      if(Number(scene.style.getPropertyValue('--generator-power'))<=0||Number(scene.style.getPropertyValue('--generator-speed'))<=0)throw new Error('ПРОВАЛ: CSS-отдача не следует состоянию');
      if(audio.ctx.oscillators.length<3)throw new Error('ПРОВАЛ: трещотка не отреагировала на угол');
      w.completePowerGeneratorPrototype();
      if(state.currentVoltage!==220||state.voltage.textContent!=='220 V')throw new Error('ПРОВАЛ: финал не зафиксирован на 220 V');
      w.updatePowerGeneratorDecay(state,99999,10);
      if(state.currentVoltage!==220||state.storedVoltage===0)throw new Error('ПРОВАЛ: утечка действует после завершения');
      w.beginPowerGeneratorRestore();
      await new Promise(resolve=>w.requestAnimationFrame(resolve));
      if(state.phase!=='restoring'||!scene.classList.contains('is-restoring'))throw new Error('ПРОВАЛ: восстановление питания не началось');
      if(!d.body.classList.contains('power-ui-waking'))throw new Error('ПРОВАЛ: интерфейс не получил wake-up класс');
      if(w.eval('powerAchievementSeen')||w.eval('stormUnlocked'))throw new Error('ПРОВАЛ: dev-генератор выдал production-unlock');
      const hum=audio.hum,harmonic=audio.harmonic;
      w.clearPowerGeneratorPrototype(false);
      if(d.body.classList.contains('power-ui-waking'))throw new Error('ПРОВАЛ: wake-up класс не очищен вместе со сценой');
      if(!hum.stopped||!harmonic.stopped)throw new Error('ПРОВАЛ: звук не остановлен при очистке сцены');

      // Само загруженное значение 220 ничего не делает. Только ручной commit.
      w.eval('currentSongSeal = LIGHTNING_SONG_SEAL');
      d.documentElement.setAttribute('data-scheme','storm');
      d.getElementById('bpmInput').value='220';
      if(d.querySelector('.power-generator-scene'))throw new Error('ПРОВАЛ: простая установка значения уже запустила сцену');
      w.applyBpmChange();
      // B-66.2.1: ручной commit 220 сначала играет торжественный пролог.
      if(!w.eval('powerProloguePlaying'))throw new Error('ПРОВАЛ: ручной BPM 220 не запустил пролог');
      if(d.querySelector('.power-prologue-digits')?.textContent!=='220')throw new Error('ПРОВАЛ: в прологе нет растущей цифры 220');
      if(w.eval('powerGeneratorState'))throw new Error('ПРОВАЛ: генератор стартовал до обрыва пролога');
      w.finishPowerPrologueNow();
      if(d.querySelector('.power-prologue-overlay'))throw new Error('ПРОВАЛ: оверлей пролога не убран');
      const production=w.eval('powerGeneratorState');
      if(!production||!production.unlockAchievement)throw new Error('ПРОВАЛ: ручной BPM 220 не запустил production-генератор');
      if(w.eval('stormUnlocked'))throw new Error('ПРОВАЛ: схема Гроза повлияла на unlock 220');
      production.phase='ready';w.completePowerGeneratorPrototype();
      if(!w.eval('powerAchievementSeen')||w.localStorage.getItem('struchord-achievement-220-v1')!=='1')throw new Error('ПРОВАЛ: отдельная ачивка 220 не сохранена');
      if(w.eval('stormUnlocked'))throw new Error('ПРОВАЛ: завершение 220 разблокировало Грозу');
      w.clearPowerGeneratorPrototype(false);
      w.applyBpmChange();
      if(d.querySelector('.power-generator-scene'))throw new Error('ПРОВАЛ: одноразовая ачивка запустилась повторно');

      console.log('ALL OK — 0.335 отзывает старый unlock, напряжение падает 15 V/с до нуля, а ручной BPM 220 выдаёт только независимую ачивку.');
      dom.window.close();
    }catch(error){console.error(error);dom.window.close();process.exit(1);}
  },60);
});
