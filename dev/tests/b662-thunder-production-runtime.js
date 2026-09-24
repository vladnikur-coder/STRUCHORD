#!/usr/bin/env node
/* B-66.2 / 0.407 — production-маршрут «Грохочет гром»: seal + схема storm. */
const fs=require('fs');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(__dirname+'/../../STRUCHORD.html','utf8');
let runtimeError=null;

const dom=new JSDOM(html,{
  runScripts:'dangerously',
  pretendToBeVisual:true,
  url:'https://localhost/',
  beforeParse(w){
    w.HTMLMediaElement.prototype.play=function(){return Promise.resolve();};
    w.HTMLMediaElement.prototype.pause=function(){};
    w.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText:()=>({width:50}),clearRect(){},beginPath(){},arc(){},fill(){},stroke(){},moveTo(){},lineTo(){},closePath(){},save(){},restore(){},translate(){},rotate(){},fillText(){},strokeText(){},setTransform(){},scale(){},createLinearGradient:()=>({addColorStop(){}})});
  }
});

dom.window.addEventListener('error',e=>{runtimeError=e.error||new Error(e.message);});
dom.window.addEventListener('load',()=>{
  setTimeout(()=>{
    try{
      const w=dom.window,d=w.document;
      if(runtimeError)throw runtimeError;

      // B-66.2 regression: Play before the first storm strike must be a
      // silent no-op, otherwise setPlaybackBodyClass() cancels the pending
      // strike callback and permanently loses the first plate.
      w.eval("stormSurprisePhase='armed'; playbackState.isPlaying=false");
      w.playAll();
      if(w.eval('playbackState.isPlaying'))throw new Error('ПРОВАЛ: Play стартовал до выстрела Грозы');
      if(!w.eval('stormBlocksTransport()'))throw new Error('ПРОВАЛ: armed-фаза не блокирует transport');
      w.eval("stormSurprisePhase='striking'");
      if(w.eval('stormBlocksTransport()'))throw new Error('ПРОВАЛ: после выстрела transport всё ещё заблокирован');
      w.eval(`
        window.__afterStrikeSentinel=()=>{};
        stormAfterStrikeCallback=window.__afterStrikeSentinel;
        setPlaybackBodyClass(true);
        window.__afterStrikePreserved=stormAfterStrikeCallback===window.__afterStrikeSentinel;
        stormAfterStrikeCallback=null;
      `);
      if(!w.__afterStrikePreserved)throw new Error('ПРОВАЛ: разрешённый Play отменил afterStrike плашки');
      w.eval("stormSurprisePhase='idle'; document.body.classList.remove('is-playing')");

      // Одна подпись без схемы «Гроза» ничего не выдаёт.
      w.eval("currentSongSeal = THUNDER_SONG_SEAL");
      d.documentElement.setAttribute('data-scheme','default');
      if(w.maybeUnlockStormSecret('song'))throw new Error('ПРОВАЛ: seal без схемы storm запустил ачивку');
      if(w.eval('stormUnlocked'))throw new Error('ПРОВАЛ: seal без storm уже открыл Грозу');

      // Первый production-вход: unlock, быстрый полный удар, плашка только в afterStrike.
      w.eval(`
        window.__stormCalls=[];
        startStormSurprise=function(options={}){
          window.__stormCalls.push({strikeDelayMs:options.strikeDelayMs,hasAfterStrike:typeof options.afterStrike==='function'});
          if(typeof options.afterStrike==='function') options.afterStrike();
          return true;
        };
      `);
      d.documentElement.setAttribute('data-scheme','storm');
      if(!w.maybeUnlockStormSecret('song'))throw new Error('ПРОВАЛ: подписанная песня + storm не запустили маршрут');
      const first=w.__stormCalls[0];
      if(!first||first.strikeDelayMs!==undefined)throw new Error('ПРОВАЛ: первый unlock форсирует быстрый удар вместо обычного таймера');
      if(!first.hasAfterStrike)throw new Error('ПРОВАЛ: первая плашка не привязана к завершению удара');
      if(!w.eval('stormUnlocked')||!w.eval('schemeSurprisesEnabled'))throw new Error('ПРОВАЛ: Гроза не разблокирована и не включена');
      if(!w.eval("stormSeenAchievements.has(THUNDER_ACHIEVEMENT_ID)"))throw new Error('ПРОВАЛ: ачивка Грохочет гром не записана в реестр');
      if(!w.localStorage.getItem('struchord-storm-achievements')?.includes('thunder-rumbles'))throw new Error('ПРОВАЛ: ачивка не сохранена в localStorage');
      const badge=d.querySelector('.storm-achievement.thunder-plate-achievement');
      if(!badge)throw new Error('ПРОВАЛ: не показана принятая woodcut-плашка');
      if(badge.parentElement!==d.documentElement)throw new Error('ПРОВАЛ: грозовая плашка висит внутри body и уезжает при scroll + shake');
      if(w.getComputedStyle(badge).position!=='fixed')throw new Error('ПРОВАЛ: грозовая плашка не закреплена во viewport');
      if(!badge.querySelector('.thunder-plate-card')||!badge.querySelector('.thunder-plate-mark-bolt'))throw new Error('ПРОВАЛ: нет woodcut-карты или видимой молнии');
      if(badge.querySelector('[class*="thunder-title"]'))throw new Error('ПРОВАЛ: production всё ещё содержит широкий титр');
      if(!w.getComputedStyle(badge.querySelector('.thunder-plate-main')).fontFamily.includes('Izhitsa'))throw new Error('ПРОВАЛ: плашка не просит шрифт Izhitsa');
      if(!badge.textContent.includes('СЕКРЕТ НАЙДЕН')||!badge.textContent.includes('Грохочет гром'))throw new Error('ПРОВАЛ: текст плашки неверный');
      if(!w.eval("audioDiagnosticLog.some(e=>e.type==='thunder-achievement-mp3-requested')"))throw new Error('ПРОВАЛ: mp3 Грохочет гром не запрошен при плашке');
      badge.remove();

      // Повторный явный вход: сразу запускает громовой маршрут, но без повторной плашки.
      w.__stormCalls=[];
      if(!w.maybeUnlockStormSecret('song'))throw new Error('ПРОВАЛ: повторный вход не запускает грозу');
      const repeat=w.__stormCalls[0];
      if(!repeat||repeat.strikeDelayMs!==undefined)throw new Error('ПРОВАЛ: повторный вход форсирует быстрый удар вместо обычного таймера');
      if(repeat.hasAfterStrike)throw new Error('ПРОВАЛ: повторный вход снова назначил плашку');
      if(d.querySelector('.storm-achievement'))throw new Error('ПРОВАЛ: повторный вход показал плашку повторно');

      if(typeof w.previewThunderTitleForDev==='function')throw new Error('ПРОВАЛ: старый dev-preview титра остался в runtime');
      w.previewThunderPlateForDev();
      const plate=d.querySelector('.storm-achievement.thunder-plate-achievement');
      if(!plate||!plate.querySelector('.thunder-plate-etching')||!plate.querySelector('.thunder-plate-mark-bolt')||!plate.querySelector('.thunder-plate-main'))throw new Error('ПРОВАЛ: dev-preview woodcut-плашки с видимой молнией не появился');
      if(plate.querySelector('.thunder-plate-hill')||plate.querySelector('.thunder-plate-tree'))throw new Error('ПРОВАЛ: в текстовую плашку вернулась пейзажная мини-сцена');
      if(w.getComputedStyle(plate).position!=='fixed')throw new Error('ПРОВАЛ: woodcut-плашка не закреплена во viewport');
      plate.remove();

      // Другая подписанная песня (B-66.1) не должна открывать «Грохочет гром».
      w.__stormCalls=[];
      w.eval("currentSongSeal = LIGHTNING_SONG_SEAL");
      if(w.maybeUnlockStormSecret('song'))throw new Error('ПРОВАЛ: Дима Билан — Молния запустила «Грохочет гром»');
      if(w.__stormCalls.length)throw new Error('ПРОВАЛ: неправильный seal дошёл до storm route');

      console.log('ALL OK — B-66.2 production требует seal «Дурак и молния» + storm, первый удар показывает принятую woodcut-плашку после грома, старый титр удалён, повторный вход гремит без повторной плашки.');
      dom.window.close();
    }catch(error){console.error(error);dom.window.close();process.exit(1);}
  },60);
});
