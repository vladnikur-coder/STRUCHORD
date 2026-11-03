// STRUCHORD · Клавишный аккомпанемент
// Вынесено из STRUCHORD.html (0.776). Блок по-прежнему исполняется
// в прежнем месте встроенного скрипта: файл только регистрирует
// фабрику window.__b39Modules.accomp, а HTML вызывает её там, где блок
// лежал раньше. Порядок запуска поэтому не меняется.

(function () {
  var HOST = window;
  HOST.__b39Modules = HOST.__b39Modules || {};
  HOST.__b39Modules.accomp = function () {
  // >>> B-39 STAGE5 BEGIN (KEYS ACCOMPANIMENT) <<<
  // ==========================================================================
  // B-39 · ЭТАП 5 (STAGE 5) — ТИПЫ АККОМПАНИМЕНТА ДЛЯ КЛАВИШНЫХ ДОРОЖЕК
  // --------------------------------------------------------------------------
  // Что здесь:
  //  1. Шесть пресетов: целый аккорд, арпеджио вверх, бас+аккорд, вальс,
  //     Альберти-бас, октавный бас. Шаги хранятся ТОКЕНАМИ-РОЛЯМИ, а не
  //     нотами: один и тот же рисунок сам следует за гармонией и за сменой
  //     позиции (варианта) аккорда.
  //  2. plan() — планировщик шагов. Уважает subdivision 1/2/3/4, свинг по
  //     АБСОЛЮТНОЙ сетке квадрата, фазу ячейки при ресайзе и наследование
  //     «ячейка -> секция -> пресет». Возвращает шаги с готовыми MIDI-нотами,
  //     смещением и длительностью — ровно их и играет звуковой слой STAGE 3.
  //  3. Панель «Аккомпанемент»: 6 кнопок, размер клавиатуры дорожки,
  //     дробность, свинг, «Рисунок на такт» с подсветкой шагов, применение
  //     к ячейке или к секции.
  //  4. Перехват кнопки «Бой/перебор»: на активной клавишной дорожке она
  //     называется «Аккомпанемент» и открывает ЭТУ панель. Гитара не тронута.
  //
  // Правило R12: в этом блоке нет гитарных аппликатур, струн и боёв. Ноты
  // берутся только из канонической формулы (STAGE 0) и голосоведения
  // (STAGE 4). Пятая и одиннадцатая ступени здесь НЕ выкидываются.
  //
  // Никакой правки чужой разметки: свои стили и DOM создаются динамически.
  // ==========================================================================
  (function (HOST) {
    'use strict';

    var doc = HOST.document;
    var HUB = HOST.__b39PanelHub || null;

    // ---------- Пресеты ----------
    var PRESETS = [
      { id: 'keys-block',        label: 'Целый аккорд', subdivision: 1, hint: 'аккорд на каждую долю' },
      { id: 'keys-arp-up',       label: 'Арпеджио ↑',   subdivision: 2, hint: 'тона аккорда снизу вверх' },
      { id: 'keys-bass-chord',   label: 'Бас + аккорд', subdivision: 1, hint: 'бас и аккорд через долю' },
      { id: 'keys-waltz',        label: 'Вальс',        subdivision: 1, hint: 'бас — аккорд — аккорд; обычно для размера 3/4' },
      { id: 'keys-alberti',      label: 'Альберти-бас', subdivision: 2, hint: 'корень — квинта — терция — квинта' },
      { id: 'keys-octave-bass',  label: 'Октавный бас', subdivision: 1, hint: 'бас через октаву и аккорд по очереди' },
      // Собственные двухтактовые рисунки: это не транскрипции видео.
      { id:'piano-soft-pulse', label:'Тихая опора', subdivision:2, phrase:true, lesson:true, presetSwing:false,
        hint:'Бас и аккорд чередуются с тихим средним звуком и паузами.',
        motif:[['B','R'],null,'M',null,'R',null,'M',null], secondMotif:['B',null,'M',null,'R',null,null,'M'],
        motif3:[['B','R'],null,'M',null,'R',null], second3:['B',null,'M',null,'R',null],
        motif6:[['B','R'],null,null,null,'M',null,'R',null,null,null,'M',null], second6:['B',null,null,null,'M',null,'R',null,null,null,'M',null] },
      { id:'piano-breathing-arp', label:'Перебор с паузами', subdivision:2, phrase:true, lesson:true, presetSwing:false,
        hint:'Перебор с паузами; второй такт отличается от первого.',
        motif:['B',null,'A','A',null,'A','A',null], secondMotif:['B',null,'A',null,'A','A',null,'A'],
        motif3:['B',null,'A','A',null,'A'], second3:['B',null,'A',null,'A','A'],
        motif6:['B',null,null,null,'A',null,'A',null,null,null,'A',null], second6:['B',null,'A',null,null,null,'A',null,'A',null,null,null] },
      { id:'piano-three-three-two', label:'Акценты 3+3+2', subdivision:2, phrase:true, lesson:true, presetSwing:false,
        hint:'В 4/4 акценты по группам 3+3+2 восьмых; в 3/4 и 6/8 — отдельная адаптация.',
        motif:[['B','R'],null,null,'R',null,null,'R',null], secondMotif:[['B','R'],null,null,'R',null,null,['B','R'],null],
        motif3:[['B','R'],null,'R',null,'M',null], second3:['B',null,'R',null,'M',null],
        motif6:[['B','R'],null,null,null,'M',null,'R',null,null,null,'M',null], second6:[['B','R'],null,null,null,'R',null,'M',null,null,null,'R',null] }
    ];
    // Ритмы по восемь восьмых в 4/4. Ноты относительны аккорду;
    // не имитируем ударные, динамику или отсутствующие в аккорде ступени.
    var STYLES = [
      ['pop','Поп',[
        ['Мягкое арпеджио',['B','A','t3','A','t5','A','t3','A']],
        ['Ровные аккорды',['H',null,'H',null,'H',null,'H',null]],
        ['Плотный припев',['B','H','H',null,'B','H','H',null]]]],
      ['rock','Рок',[
        ['Ровный рок',['B',null,'H','H','B',null,'H','H']],
        ['Октавная основа',['O',null,'H',null,'O','H','H',null]],
        ['Тихий куплет',['B',null,null,'A','H',null,'A',null]]]],
      ['punk','Панк',[
        ['Частые аккорды',['H','H','H','H','H','H','H','H']],
        ['Бас и аккорды',['B','H','H','H','B','H','H','H']],
        ['Акценты с паузами',['H','H',null,'H','H','H',null,'H']]]],
      ['country','Кантри',[
        ['Бас — аккорд',['B',null,'H',null,'B',null,'H',null]],
        ['Подвижный бас',['B',null,'H','A','B',null,'H','A']],
        ['Перебор',['t1','t5','t3','t5','t1','t5','t3','t5']]]],
      ['blues','Блюз',[
        ['Спокойный шаффл',['B',null,'H','H','B',null,'H','H'],true],
        ['Бас и аккорд',['B','H',null,'H','B','H',null,'H'],true],
        ['Плотный шаффл',['B','H','H','H','B','H','H','H'],true]]],
      ['jazz','Джаз',[
        ['Разреженные аккорды',[null,'H',null,null,'H',null,null,'H']],
        ['Свинговые акценты',['B',null,'H',null,null,'H',null,'H'],true],
        ['Бас и аккорды',['B',null,'H',null,'B','H',null,'H']]]],
      ['soul','Соул',[
        ['Мягкие аккорды',['H',null,null,null,'H',null,null,null]],
        ['Перебор',['B',null,'A','t3','t5',null,'A',null]],
        ['Пульс',['B',null,'H','H',null,'H','H',null]]]],
      ['funk','Фанк',[
        ['Синкопы',[null,'H',null,'H',null,null,'H','H']],
        ['С паузами',['H',null,null,'H',null,'H',null,'H']],
        ['Бас и акценты',['B',null,'H',null,null,'H','B','H']]]],
      ['fusion','Фьюжн',[
        ['Подвижный перебор',['B','t3','t5','A','t1','t5','t3','A']],
        ['Синкопы',['B',null,'H',null,'H',null,null,'H']],
        ['Бас с акцентами',['B','H',null,'H',null,'B','H',null]]]]
    ];
    STYLES.forEach(function (style) { style[2].forEach(function (entry, index) {
      PRESETS.push({ id:'style-'+style[0]+'-'+index, label:entry[0], genre:style[0], genreLabel:style[1], subdivision:2,
        hint:style[1]+' · '+entry[0]+(entry[2] ? ' · Swing' : ''), motif:entry[1].slice(), presetSwing:entry[2]===true });
    }); });
    // Самостоятельные семейства из пяти связанных вариантов на такт 4/4.
    // Старые пресеты и их идентификаторы остаются неизменными.
    // Порядок: вступление, куплет, переход, припев, окончание.
    var FAMILY_MOTIFS = {
      pop:[
        ['B',null,'t3',null,'t5',null,'t3',null],
        ['B',null,'t3','t5','B',null,'t3','t5'],
        ['B','t3','t5','A','B',null,'t3','t5'],
        [['B','H'],null,'H','t5',['B','H'],null,'H','t5'],
        ['B',null,'t3','t5',['B','H'],null,null,null]],
      rock:[
        ['B',null,'H',null,'B',null,'H',null],
        ['B',null,'H','H','B','t5','H',null],
        ['B',null,'H','H','O',null,'H','H'],
        [['O','H'],null,'H','H',['O','H'],null,'H','H'],
        ['B',null,'H','H',['O','H'],null,null,null]],
      punk:[
        ['B',null,'H',null,'B',null,'H',null],
        ['B','H','H',null,'B','H','H',null],
        ['B','H','H','H','B','H',null,null],
        [['B','H'],'H','H','H',['B','H'],'H','H','H'],
        ['B','H','H','H',['B','H'],null,null,null]],
      country:[
        ['B',null,'H',null,'t5',null,'H',null],
        ['B',null,'H','A','t5','t3','H','A'],
        ['B','t5','H','A','t5','t3','H','A'],
        [['B','H'],null,'H','A',['B','t5'],null,'H','A'],
        ['B',null,'H','A',['B','H'],null,null,null]],
      blues:[
        ['B',null,'H',null,'B',null,'H',null],
        ['B',null,'H','H','B','H','H',null],
        ['B','H',null,'H','B','H',null,'H'],
        [['B','H'],null,'H','H',['B','H'],null,'H','H'],
        ['B','H',null,'H',['B','H'],null,null,null]],
      jazz:[
        [null,'H',null,null,'B',null,'H',null],
        ['B',null,null,'H',null,'H',null,'H'],
        ['B',null,'H',null,null,'H','t5','H'],
        ['B','H',null,'H','B',null,'H','H'],
        ['B',null,'H',null,['B','H'],null,null,null]],
      soul:[
        ['B',null,null,'t3','H',null,null,null],
        ['B',null,'t3','t5','H',null,'t3',null],
        ['B',null,'t3','t5','H',null,'H','t5'],
        [['B','H'],null,'t3','H','B',null,'H','t5'],
        ['B',null,'t3','t5',['B','H'],null,null,null]],
      funk:[
        ['B',null,null,'H',null,null,'H',null],
        ['B',null,'H',null,null,'H',null,'H'],
        ['B',null,'H','H',null,'H','t5','H'],
        ['B','H',null,'H','B','H',null,'H'],
        ['B',null,'H','H',['B','H'],null,null,null]],
      fusion:[
        ['B',null,'t3','t5',null,null,'t3',null],
        ['B','t3','t5',null,'B',null,'t3','t5'],
        ['B','t3','t5','A',null,'H','t3','t5'],
        [['B','H'],'t3',null,'H','B','t5','H','A'],
        ['B','t3','t5','A',['B','H'],null,null,null]]
    };
    var FAMILY_ROLES = ['Вступление','Куплет','Переход','Припев','Аутро'];
    STYLES.forEach(function(style) {
      (FAMILY_MOTIFS[style[0]] || []).forEach(function(motif,i) {
        PRESETS.push({id:'family-'+style[0]+'-'+i, label:'Семейство · '+FAMILY_ROLES[i],
          genre:style[0],genreLabel:style[1],subdivision:2,motif:motif,
          hint:style[1]+' · связанный вариант: '+FAMILY_ROLES[i],
          presetSwing:style[0]==='blues' || style[0]==='jazz'});
      });
    });
    // Отдельные ID: прежние сохранённые рисунки не меняют звучание.
    STYLES.forEach(function(style) {
      var rows=FAMILY_MOTIFS[style[0]] || [], neighbors=[1,2,3,2,0];
      rows.forEach(function(motif,i) {
        var next=rows[neighbors[i]], second=motif.slice(0,4).concat(next.slice(4,8));
        // В 3/4 и 6/8 позиции 3 и 7 не входят в адаптацию, поэтому
        // обеспечиваем различие и в значимых позициях второго такта.
        if ([0,1,2,4,5,6].every(function(k){return JSON.stringify(motif[k])===JSON.stringify(second[k]);})) {
          var k=[5,6,4,2,1,0].find(function(j){return JSON.stringify(motif[j])!==JSON.stringify(next[j]);});
          if (k!==undefined) second[k]=next[k];
        }
        PRESETS.push({id:'perform-'+style[0]+'-'+i,label:'Исполнение · '+FAMILY_ROLES[i],
          genre:style[0],genreLabel:style[1],subdivision:2,motif:motif,secondMotif:second,
          phrase:true,hint:style[1]+' · двухтактовая фраза с акцентами',
          presetSwing:style[0]==='blues'||style[0]==='jazz'});
      });
    });
    var DEFAULT_TYPE = 'keys-block';
    var SUBDIVISIONS = [1, 2, 3, 4];
    var MAX_STEPS = 64;

    // Токены шагов. H — весь аккорд; B — бас; O — корень через октаву;
    // A — следующий тон арпеджио вверх; t* — тон по интервалу.
    var TOKENS = ['H', 'R', 'M', 'B', 'O', 'A', 't1', 't3', 't5', 't7', 't9', 't11', 't13'];
    // Семейства полутонов в порядке предпочтения. sus2/sus4 не теряют ноту:
    // для t3 есть запасные 2 и 5 полутона, для t13 — секста.
    var FAMILY = {
      t1: [0], t3: [4, 3, 2, 5], t5: [7, 6, 8, 5],
      t7: [10, 11, 9], t9: [14, 13, 15, 2],
      t11: [17, 18, 5], t13: [21, 20, 9]
    };

    var CSS = [
      '.b39-acc-editor > * { flex-shrink:0; }',
      '.b39-auto-panel { max-height:calc(100vh - 2rem); max-height:calc(100dvh - 2rem); overflow-y:auto; overscroll-behavior:contain; gap:.25rem; border-radius:.875rem; padding:.75rem 1rem; background:var(--color-surface); box-shadow:0 .5rem 1.5rem rgba(0,0,0,.12); }',
      '.b39-auto-panel h3 { font-size:1rem; color:var(--color-text-primary); }',
      '.b39-auto-panel .b39-auto-select { padding:.5rem .75rem; border-radius:.5rem; font-size:.8125rem; font-weight:500; color:var(--color-text-secondary); }',
      '.b39-auto-panel .b39-auto-select select { margin-left:auto; font-size:.8125rem; }',
      '.b39-auto-panel .b39-auto-select.tools-label { flex-wrap:nowrap; }',
      '.b39-auto-panel .b39-auto-note { padding:0 .75rem; line-height:1.35; }',
      '.b39-auto-panel .b39-acc-actions { border-top:.0625rem solid var(--color-border-light); padding-top:.5rem; }',
      '.b39-auto-section { display:block; }',
      '.b39-auto-note { font-size:.75rem; color:var(--color-text-secondary); }',
      '.b39-auto-select { display:flex; flex-wrap:wrap; align-items:center; gap:.5rem; font-size:.75rem; }',
      '.b39-auto-list { display:flex; flex-direction:column; gap:.125rem; max-height:14rem; overflow:auto; border-top:.0625rem solid var(--color-border-light); padding-top:.5rem; }',
      '.b39-auto-row { align-items:flex-start; line-height:1.35; }',
      '.b39-auto-row input { flex:none; }',
      '.b39-acc-preset[hidden] { display:none !important; }',
      '.b39-acc-genre { font:inherit; color:inherit; background:var(--color-surface); border:.0625rem solid var(--color-border-medium); border-radius:.6rem; padding:.3rem .5rem; max-width:100%; }',
      '.b39-acc-btn { display:inline-flex; align-items:center; gap:.3rem; padding:0 .5rem;',
      '  height:2.25rem; border-radius:.6rem; cursor:pointer; font:inherit; font-size:.75rem;',
      '  background:var(--color-surface,#fff); color:var(--color-text-primary,#1b1b1b);',
      '  border:1px solid var(--color-border-medium,#c9cdd4); }',
      '.b39-acc-btn[aria-pressed="true"] { border-color:var(--color-accent,#2f855a); }',
      '.b39-acc-panel { position:fixed; z-index:9999; right:.6rem; top:5.6rem;',
      '  width:min(24rem,calc(100vw - 1.2rem)); max-height:calc(100vh - 7rem); overflow:auto;',
      '  background:var(--color-surface,#fff); color:var(--color-text-primary,#1b1b1b);',
      '  border:1px solid var(--color-border-medium,#c9cdd4); border-radius:.875rem;',
      '  box-shadow:0 .75rem 2rem rgba(0,0,0,.22); padding:.65rem .75rem; font-size:.75rem; }',
      '.b39-acc-panel[hidden] { display:none; }',
      '.b39-acc-head { display:flex; align-items:center; gap:.4rem; margin-bottom:.5rem; }',
      '.b39-acc-title { font-size:.85rem; font-weight:700; flex:1; }',
      '.b39-acc-close { border:0; background:transparent; color:inherit; cursor:pointer; font-size:1rem; }',
      '.b39-acc-label { font-size:.68rem; color:var(--color-text-secondary,#666);',
      '  margin:.45rem 0 .25rem; text-transform:uppercase; letter-spacing:.04em; }',
      '.b39-acc-row { display:flex; align-items:center; flex-wrap:wrap; gap:.4rem; margin-top:.45rem; }',
      '.b39-acc-row select, .b39-acc-row button { font:inherit; font-size:.7rem; padding:.2rem .35rem;',
      '  border-radius:.4rem; border:1px solid var(--color-border-medium,#c9cdd4);',
      '  background:var(--color-surface,#fff); color:inherit; cursor:pointer; }',
      '.b39-acc-row button[aria-pressed="true"] { border-color:var(--color-accent,#2f855a); }',
      '.b39-acc-step.is-on { background:var(--color-accent,#2f855a); color:#fff;',
      '  transform:translateY(-2px); }',
      '.b39-acc-editor { max-height:calc(100vh - 1rem); max-height:calc(100dvh - 1rem); overflow-y:auto; overscroll-behavior:contain; }',
      '.b39-acc-editor .pattern-grid--rows { overflow-x:auto; justify-content:safe center; }',
      '.b39-acc-choice { border:.0625rem solid var(--color-border-medium); border-radius:.75rem; padding:.65rem; display:flex; flex-direction:column; gap:.5rem; }',
      '.b39-acc-choice[hidden] { display:none; }',
      '.b39-acc-choice-head { display:flex; justify-content:space-between; align-items:center; gap:.5rem; font-size:.75rem; font-weight:600; }',
      '.b39-acc-choice-options { display:flex; flex-wrap:wrap; gap:.3rem; }',
      '.b39-acc-choice-options .pattern-pick-toggle { width:auto; min-width:2.2rem; height:auto; min-height:2rem; border-radius:.6rem; padding:.25rem .5rem; }',
      '.b39-acc-choice-note { font-size:.6875rem; color:var(--color-text-secondary); }',
      '.b39-acc-foot { margin-top:.5rem; font-size:.65rem; line-height:1.45;',
      '  color:var(--color-text-tertiary,#999); }'
    ].join('\n');

    // ---------- Состояние ----------
    var booted = false, wrapped = false, observer = null;
    var btn = null, panel = null, gridEl = null, stepsEl = null, footEl = null;
    var subButtons = [], swingBtn = null, scopeCell = null, scopeSec = null, lengthRow = null, stepChoice = null, selectedStep = null, draftLength = 4, presetGenre = null, originalDraft = null, bassSelect = null, bassRow = null, draftBassMode = 'legacy';
    var draft = { type: DEFAULT_TYPE, subdivision: 1, swing: null }, regenSignature = null, regenMeta = null;
    var current = { secId: null, sqId: null, ei: null, cellKey: null, scope: 'section', ts: '4/4' };
    var sharedRhythm = null;       // подглядываем subdivision/swing у ритма секции
    var timers = [];
    var stepObserver = null;
    var presetButtons = [], overlay = null, scopeLabel = null, resetPending = false, previewStop = null, previewTimer = null, focusRelease = null, draftInherited = false, draftDefault = false, editingTrackId = null;

    function tracks() { return HOST.StruChordTracks || null; }
    function keys() { return HOST.StruChordKeys || null; }
    function audio() { return HOST.StruChordAudio || null; }
    function formula() { return HOST.StruChordFormula || null; }

    function mod12(n) { return ((n % 12) + 12) % 12; }
    function isMidi(n) { return Number.isFinite(Number(n)) && Number(n) >= 0 && Number(n) <= 127; }
    function asc(a, b) { return a - b; }
    function esc(v) {
      return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function el(tag, cls, text) {
      if (!doc || !doc.createElement) return null;
      var n = doc.createElement(tag);
      if (cls) n.className = cls;
      if (text !== undefined && text !== null) n.textContent = text;
      return n;
    }

    // ---------- Пресеты и рисунок шагов ----------
    function preset(id) {
      for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) return PRESETS[i];
      return null;
    }
    function list() {
      return PRESETS.map(function (p) {
        return { id: p.id, label: p.label, subdivision: p.subdivision, hint: p.hint };
      });
    }
    /** Битые значения ОТБРАСЫВАЮТСЯ (правило README), а не зажимаются. */
    function normalize(raw) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
      if (!preset(raw.type)) return null;
      var sub = Number(raw.subdivision);
      if (SUBDIVISIONS.indexOf(sub) < 0) return null;
      var swing = raw.swing === true ? true : (raw.swing === false ? false : null);
      var out = { type: raw.type, subdivision: sub, swing: swing };
      if (Array.isArray(raw.steps) && raw.steps.length > 0 && raw.steps.length <= MAX_STEPS) {
        var valid = raw.steps.every(function (step) {
          if (step === null) return true;
          if (typeof step === 'string') return TOKENS.indexOf(step) >= 0;
          return Array.isArray(step) && step.length > 0 && step.length <= 8 && step.every(function (v) { return TOKENS.indexOf(v) >= 0; });
        });
        if (valid) out.steps = raw.steps.map(function (v) { return Array.isArray(v) ? v.slice() : v; });
      }
      return out;
    }
    function numerator(ts) {
      var m = /(\d+)\s*\/\s*(\d+)/.exec(String(ts || '4/4'));
      if (!m) return 4;
      return Math.min(32, Math.max(1, Number(m[1]) || 4));
    }

    /**
     * Рисунок на такт. Длина кратна beats * subdivision; при ресайзе ячейки
     * планировщик берёт из него ОКНО, а не начинает заново.
     */
    function buildSteps(type, sub, beats) {
      var n = Math.max(1, Math.round((Number(beats) || 4) * sub));
      n = Math.min(n, MAX_STEPS);
      var out = [], alberti = ['t1', 't5', 't3', 't5'], i, beat;
      var chosen = preset(type);
      if (chosen && chosen.motif) {
        // Для трёхдольных размеров берём шестишаговую версию: две группы по
        // три восьмых; не используем четырёхдольный хвост как отдельный такт.
        var motif = chosen.motif, secondMotif = chosen.secondMotif;
        if(chosen.lesson && Number(beats)===3){motif=chosen.motif3;secondMotif=chosen.second3;}
        else if(chosen.lesson && Number(beats)===6){motif=chosen.motif6;secondMotif=chosen.second6;}
        else if (Number(beats) === 3 || Number(beats) === 6 || Number(beats) === 9 || Number(beats) === 12) {
          motif = [motif[0],motif[1],motif[2],motif[4],motif[5],motif[6]];
          if (secondMotif) secondMotif = [secondMotif[0],secondMotif[1],secondMotif[2],secondMotif[4],secondMotif[5],secondMotif[6]];
        }
        var count = chosen.phrase && n * 2 <= MAX_STEPS ? n * 2 : n;
        for (i = 0; i < count; i++) {
          var bar = i >= n && secondMotif ? secondMotif : motif;
          out.push(bar[Math.floor((i % n) * 2 / sub) % bar.length]);
        }
        return out;
      }
      for (i = 0; i < n; i++) {
        beat = Math.floor(i / sub);
        if (type === 'keys-arp-up') out.push('A');
        else if (type === 'keys-alberti') out.push((sub >= 2 || i % sub === 0) ? alberti[i % alberti.length] : null);
        else if (i % sub !== 0) out.push(null);
        else if (type === 'keys-block') out.push('H');
        else if (type === 'keys-bass-chord') out.push(beat % 2 === 0 ? 'B' : 'H');
        else if (type === 'keys-waltz') out.push(beat % 3 === 0 ? 'B' : 'H');
        else if (type === 'keys-octave-bass') out.push(beat % 2 === 0 ? 'O' : 'H');
        else out.push('H');
      }
      return out;
    }

    /** Наследование: ячейка -> секция -> дефолтный пресет. */
    function resolve(trackId, cellKey, sec) {
      var secId = sec && typeof sec === 'object' ? sec.id : sec;
      var T = tracks();
      var map = {};
      if (T && typeof T.track === 'function') {
        var t = T.track(trackId);
        if (t && t.patterns) map = t.patterns;
      }
      var v = null, source = 'default';
      if (cellKey) { v = normalize(map[String(cellKey)]); if (v) source = 'cell'; }
      if (!v && secId !== null && secId !== undefined) {
        v = normalize(map['s:' + secId]);
        if (v) source = 'section';
      }
      if (!v) {
        var p = preset(DEFAULT_TYPE);
        return { type: DEFAULT_TYPE, subdivision: p.subdivision, swing: null, source: 'default' };
      }
      return { type: v.type, subdivision: v.subdivision, swing: v.swing, steps: v.steps, source: source };
    }

    // ---------- Сетка, свинг, фаза ----------
    function swingOffset(node, sub, swing) {
      // Тот же закон, что у свинга приложения (B-56/B-63): пары восьмых
      // считаются от НАЧАЛА КВАДРАТА, вторая нота уезжает на 2/3.
      if (typeof swingStepOffsetUnits === 'function') {
        try { return swingStepOffsetUnits(node, sub, swing); } catch (e) {}
      }
      if (!swing || !(sub === 2 || sub === 4)) return node / sub;
      var pairIdx = Math.floor(node / 2);
      var inPair = ((node % 2) + 2) % 2;
      var pairsPerBeat = sub / 2;
      return pairIdx / pairsPerBeat + (inPair === 0 ? 0 : (1 / pairsPerBeat) * (2 / 3));
    }
    function squareOffset(sq, ei, ts) {
      if (typeof getSquareEventOffsetUnits === 'function') {
        try { return Number(getSquareEventOffsetUnits(sq, ei, ts)) || 0; } catch (e) {}
      }
      var sum = 0;
      if (sq && Array.isArray(sq.events)) {
        var lim = Math.min(Number(ei) || 0, sq.events.length);
        for (var i = 0; i < lim; i++) sum += Number(sq.events[i] && sq.events[i].span) || 1;
      }
      return sum;
    }

    function precedingSquares(sec, sq, ts) {
      if (!sec || !sq || !Array.isArray(sec.squares)) return 0;
      var total=0;
      for(var i=0;i<sec.squares.length;i++) {
        var item=sec.squares[i]; if(item===sq || item.id===sq.id) break;
        try { total += Math.max(0,Number(getSquareBeats(item,ts))||0) * Math.max(1,Number(item.repeat)||1); } catch(e) {}
      }
      return total;
    }

    function bassPolicy(trackId,sec,override) {
      var T=tracks(), mode=override===undefined && sec && T ? T.bassRole(trackId,sec.id) : override;
      if (['auto','bass','nobass'].indexOf(mode)<0) mode='legacy';
      // Это только подсказка: во вступлении, соло и завершении освобождаем низ.
      var include=mode!=='nobass' && !(mode==='auto' && sec && ['Intro','Solo','Outro'].indexOf(sec.type)>=0);
      return {mode:mode,include:include};
    }
    function sectionFromCell(key) {
      var id=String(key||'').split(':')[0];
      try { return sections.find(function(s){return String(s.id)===id;})||null; } catch(e) {return null;}
    }
    function stripBass(trackId,sec,notes,override) {
      var copy=Array.isArray(notes)?notes.slice():[];
      return !bassPolicy(trackId,sec,override).include ? copy.slice(1) : copy;
    }

    // Свинг нового авто наследуется только в его управляемых секциях;
    // прежние песни без поля swing продолжают наследовать старый ритм.
    function inheritedAutoSwing(trackId, sec, source) {
      var T=tracks(), sid=sec && typeof sec==='object' ? sec.id : sec, state=T && T.state(), track=T && T.track(trackId);
      var raw=track && track.patterns && track.patterns['s:'+sid], cfg=state && state.autoAccomp;
      if(source==='cell' && raw && raw.autoSwing===true && typeof raw.swing==='boolean') return raw.swing;
      if(cfg && cfg.trackId===trackId && cfg.managed[String(sid)] && typeof cfg.swing==='boolean') return cfg.swing;
      if(raw && raw.autoSwing===true && typeof raw.swing==='boolean') return raw.swing;
      return !!(sharedRhythm && sharedRhythm.swing===true);
    }

    // ---------- Токены -> MIDI-ноты ----------
    function tonePitchClass(f, token) {
      if (!f || !Array.isArray(f.tones)) return null;
      var fam = FAMILY[token];
      if (!fam) return null;
      for (var j = 0; j < fam.length; j++) {
        for (var k = 0; k < f.tones.length; k++) {
          if (f.tones[k].semitones === fam[j]) return mod12(f.tones[k].pitchClass);
        }
      }
      return null;
    }
    function pickMidi(notes, pc, low, high) {
      for (var i = 0; i < notes.length; i++) if (mod12(notes[i]) === pc) return notes[i];
      if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
      var m = low + mod12(pc - mod12(low));
      return m <= high ? m : null;
    }
    function tokenContext(o, notes) {
      var F = formula();
      var f = null;
      if (F && typeof F.chordFormula === 'function') {
        try { f = F.chordFormula(o.chord, o.key); } catch (e) { f = null; }
      }
      var range = o.range || {};
      var low = Number(range.low), high = Number(range.high);
      var omit=!bassPolicy(o.trackId,o.sec,o.bassMode).include;
      if(omit) { notes=notes.slice(1); if(Number.isFinite(low)) low+=12; }
      var bass = !omit && notes.length ? notes[0] : null;
      var rh = omit ? notes.slice() : (notes.length > 1 ? notes.slice(1) : notes.slice());
      return {
        notes: notes, rh: rh, bass: bass, formula: f,
        low: low, high: high,
        inRange: function (m) {
          return (!Number.isFinite(low) || m >= low) && (!Number.isFinite(high) || m <= high);
        }
      };
    }
    function tokenNotes(token, C, nextArp) {
      if (token === null || token === undefined || token === '' || token === '_') return [];
      var list = Array.isArray(token) ? token : [token];
      var out = [];
      list.forEach(function (t) {
        var midis = [];
        if (t === 'H') midis = C.notes.slice();
        // R и M не берут нижний бас даже для слэш-аккорда.
        else if (t === 'R' || t === 'M') {
          var hand=C.bass===null ? C.notes.slice() : C.notes.slice(1);
          midis=t==='R' ? hand : (hand.length ? [hand[Math.floor((hand.length-1)/2)]] : []);
        }
        else if (t === 'B') midis = C.bass === null ? [] : [C.bass];
        else if (t === 'O') {
          midis = C.bass === null ? [] : [C.bass, C.bass + 12].filter(C.inRange);
        } else if (t === 'A') {
          midis = C.rh.length ? [C.rh[nextArp() % C.rh.length]] : [];
        } else if (FAMILY[t]) {
          var pc = tonePitchClass(C.formula, t);
          var m = pc === null ? null : pickMidi(C.notes, pc, C.low, C.high);
          midis = m === null ? [] : [m];
        }
        midis.forEach(function (m) { if (out.indexOf(m) < 0) out.push(m); });
      });
      return out;
    }

    /**
     * Главный планировщик. Возвращает массив шагов:
     * { index, stepIndex, token, at, dur, notes, subdivision, swing, type, source }
     * at/dur — секунды ОТ начала ячейки; звук и подсветка берут их из одного
     * и того же массива, поэтому совпадают всегда.
     */
    // ---------------------------------------------------------------------
    // 0.776: тембр влияет на рисунок.
    //
    // До этого один и тот же рисунок игрался любым тембром с одинаковыми
    // длительностями. На слух это и давало «pad заливает», «орган стучит
    // стаккато», «пианино механическое». Теперь рисунок один, а исполнение
    // зависит от тембра:
    //   pad      — не играет рисунок вовсе: держит аккорд целиком до
    //              следующей смены гармонии (см. padFigure ниже);
    //   organ    — легато: нота тянется до следующей атаки, без провалов;
    //   acoustic — педаль и затухание, как было (0.774);
    //   rhodes   — как было: у него записанный сустейн и так тянется.
    // В плотных жанрах (фанк, панк, блюз) ничего не удлиняем: там
    // отрывистость — часть грува.
    var TIMBRE_ARTICULATION = {
      pad:      { legato: true, gapBeats: 0.10, minBeats: 1 },
      organ:    { legato: true, gapBeats: 0.02 },
      acoustic: { legato: false, gapBeats: 0.04 },
      rhodes:   { legato: false, gapBeats: 0.06 }
    };
    var DENSE_GENRE_FACTOR = { funk: 0.5, punk: 0.55, blues: 0.75, jazz: 0.9 };
    var GENRE_SWING = { jazz: true, blues: true };
    function trackTimbre(trackId) {
      try {
        var t = tracks() && tracks().track(trackId);
        return (t && t.timbre) || 'acoustic';
      } catch (e) { return 'acoustic'; }
    }
    function genreFactor() {
      try {
        var cfg = tracks() && tracks().state() && tracks().state().autoAccomp;
        var main = cfg && cfg.primary;
        var f = main && DENSE_GENRE_FACTOR[main];
        return typeof f === 'number' ? f : 1;
      } catch (e) { return 1; }
    }
    // 0.779: pad собирает СВОЙ рисунок, а не разрежает чужой. Разрежение
    // оставляло от аккорда одну басовую ноту, а иногда и тишину (замер 0.778:
    // pad играл 1 ноту из 4, в фанке второй удар был пустым). У pad нет
    // коротких нажатий: он держит гармонию, поэтому рисунок — это аккорд
    // целиком от одной смены аккорда до следующей. В плотных жанрах
    // (фанк, панк, блюз, джаз) добавляется вторая атака в середине такта,
    // иначе двухдольная пульсация пропадает совсем.
    // 0.782 · B-110: pad перетекает между аккордами, а не гаснет на стыке.
    // Замер по эталону uploads/Follow for daily chord progressions!.mp4
    // (кадр 3,7 с): границы аккордов идут 94 px/с, шаг 354 px ≈ 3,8 с;
    // изгиб голоса начинается за 28–36 px = 0,30–0,38 с ДО границы и
    // приходит ровно в неё, общие тоны идут горизонтально, разрывов нет.
    var PAD_GLIDE_LEAD = 0.35;   // с, опережение слайда
    var PAD_GLIDE_MAX_ST = 7;    // полутонов, предел portamento

    // Чистая раскладка голосов: что держится, что ползёт, что уходит,
    // что появляется. Отдаётся в API для проверок без браузера.
    function padVoiceMap(from, to, maxSt) {
      function clean(list) {
        return (Array.isArray(list) ? list : []).map(Number).filter(isMidi)
          .slice().sort(asc).filter(function (n, i, a) { return i === 0 || n !== a[i - 1]; });
      }
      var A = clean(from), B = clean(to), used = B.map(function () { return false; });
      var limit = Number.isFinite(maxSt) ? maxSt : PAD_GLIDE_MAX_ST;
      var out = [], i, j;
      // Общие тоны не перезапускаются вообще — главное отличие от 0.779.
      for (i = 0; i < A.length; i++) {
        j = B.indexOf(A[i]);
        if (j >= 0 && !used[j]) { used[j] = true; out.push({ from: A[i], to: B[j], kind: 'hold' }); }
      }
      // Оставшиеся голоса идут к ближайшей свободной высоте следующего аккорда.
      for (i = 0; i < A.length; i++) {
        if (out.some(function (p) { return p.from === A[i]; })) continue;
        var best = -1, dist = Infinity;
        for (j = 0; j < B.length; j++) {
          if (used[j]) continue;
          var d = Math.abs(B[j] - A[i]);
          if (d < dist) { dist = d; best = j; }
        }
        if (best >= 0 && dist <= limit) { used[best] = true; out.push({ from: A[i], to: B[best], kind: 'glide' }); }
        else out.push({ from: A[i], to: null, kind: 'release' });
      }
      for (j = 0; j < B.length; j++) if (!used[j]) out.push({ from: null, to: B[j], kind: 'new' });
      return out;
    }

    // Войсинг РЕАЛЬНО следующего события. Слайд за 0,35 с нельзя поставить
    // из следующей ячейки: плеер будит её лишь за 120 мс (scheduleNextEvent,
    // tWait = ... - 120). 0.783: плеер передаёт точный ответ через
    // o.padNext (findNextEvent на копиях счётчиков), поэтому повторы
    // квадратов/секций, вольты, D.C./D.S./Coda, зацикливание и переход в
    // следующую секцию больше не угадываются по геометрии нотного листа.
    // null — конец песни (мягкое гашение). undefined — превью/экспорт/
    // тесты без плеера: старый линейный путь внутри секции как запасной.
    function padNextVoicing(o, chord) {
      var T = tracks(), K = keys();
      if (!T || !o.sec || !o.sq || typeof o.ei !== 'number') return null;
      if (o.padNext !== undefined) {
        var n = o.padNext;
        if (!n || !n.sec || !n.sq) return { notes: [], silence: true, end: true };
        var cell = null;
        try { cell = T.cellKey(n.sec, n.sq, n.ei); } catch (e) {}
        if (!cell) return { notes: [], silence: true, end: true };
        var nextChord = null;
        try { nextChord = T.trackChord(o.trackId, cell, n.ev); } catch (e) {}
        if (!nextChord) return { notes: [], silence: true, end: false };  // пустая ячейка
        var notes = null, range = o.range || (T.keyRange ? T.keyRange(o.trackId) : null);
        if (K && typeof K.linkedSelection === 'function') {
          try { var sel = K.linkedSelection(o.trackId, cell); if (sel && sel.notes) notes = sel.notes.slice(); } catch (e) {}
        }
        if (!notes && K && typeof K.voiceLead === 'function' && range) {
          try { notes = K.voiceLead(nextChord, o.key || o.sec.key || 'C', range, chord, {}); } catch (e) {}
        }
        if (!notes || !notes.length) return { notes: [], silence: true, end: false };
        return { notes: notes.map(Number).filter(isMidi).sort(asc), silence: false,
                 end: false, section: n.sec !== o.sec };
      }
      var list = [];
      (o.sec.squares || []).forEach(function (sq) {
        (sq.events || []).forEach(function (ev, i) { list.push({ sq: sq, ev: ev, ei: i }); });
      });
      var here = -1;
      for (var k = 0; k < list.length; k++) {
        if (list[k].sq === o.sq && list[k].ei === o.ei) { here = k; break; }
      }
      if (here < 0 || here + 1 >= list.length) return null;   // граница секции (fallback)
      var nF = list[here + 1], cellF = null;
      try { cellF = T.cellKey(o.sec, nF.sq, nF.ei); } catch (e) { return null; }
      if (!cellF) return null;
      var nextChordF = null;
      try { nextChordF = T.trackChord(o.trackId, cellF, nF.ev); } catch (e) {}
      if (!nextChordF) return { notes: [], silence: true };    // пустая ячейка/пауза
      var notesF = null, rangeF = o.range || (T.keyRange ? T.keyRange(o.trackId) : null);
      if (K && typeof K.linkedSelection === 'function') {
        try { var selF = K.linkedSelection(o.trackId, cellF); if (selF && selF.notes) notesF = selF.notes.slice(); } catch (e) {}
      }
      if (!notesF && K && typeof K.voiceLead === 'function' && rangeF) {
        try { notesF = K.voiceLead(nextChordF, o.key || o.sec.key || 'C', rangeF, chord, {}); } catch (e) {}
      }
      if (!notesF || !notesF.length) return { notes: [], silence: true };
      return { notes: notesF.map(Number).filter(isMidi).sort(asc), silence: false };
    }

    function padFigure(steps, o, unit, beats) {
      var chord = (Array.isArray(o.notes) ? o.notes : []).map(Number).filter(isMidi).sort(asc);
      if (!chord.length) {
        var seen = {};
        steps.forEach(function (s) {
          (Array.isArray(s.notes) ? s.notes : []).forEach(function (n) { if (isMidi(n)) seen[n] = 1; });
        });
        chord = Object.keys(seen).map(Number).sort(asc);
      }
      if (!chord.length || !(unit > 0) || !(beats > 0)) return null;
      var dur = Number(o.dur);
      var bar = Math.min(beats, Math.max(1, numerator(o.ts || (current && current.ts) || '4/4')));
      if (!(bar > 0)) bar = beats;
      var at = [];
      for (var b = 0; b < beats - 1e-6; b += bar) at.push(b);
      // Плотность берём у самого рисунка, а не только у включённого
      // автоаккомпанемента: иначе предпросмотр фанка на pad звучал как поп.
      var ownGenre = preset(o.pattern && o.pattern.type);
      var dense = ownGenre && DENSE_GENRE_FACTOR[ownGenre.genre] !== undefined
        ? DENSE_GENRE_FACTOR[ownGenre.genre] < 1
        : genreFactor() < 1;
      if (dense) {
        var withHalf = at.slice();
        at.forEach(function (b) { if (b + bar / 2 < beats - 1e-6) withHalf.push(b + bar / 2); });
        at = withHalf.sort(asc);
      }
      if (!at.length) at = [0];
      // 0.782: паузы перед границей больше нет — нота держится до неё самой,
      // поэтому старый и новый аккорд перекрываются и звук не проваливается.
      var template = steps[0] || {};
      var next = padNextVoicing(o, chord);
      var lead = Math.max(0.05, Math.min(PAD_GLIDE_LEAD, (Number(o.dur) || 0) * 0.2));
      var plain = chord.map(function (n) { return { from: n, to: null, kind: 'hold' }; });
      var finalMap = next ? padVoiceMap(chord, next.notes, PAD_GLIDE_MAX_ST) : plain;
      var release = !!(next && next.silence);
      var out = [];
      at.forEach(function (beat, i) {
        var start = beat * unit;
        if (start >= dur - 0.005) return;
        var stop = (i + 1 < at.length ? at[i + 1] * unit : dur);
        var len = Math.max(unit * 0.5, stop - start);
        if (start + len > dur) len = Math.max(0.05, dur - start);
        var last = i === at.length - 1;
        out.push({
          index: out.length, stepIndex: 0, token: 'H', at: start, dur: len,
          notes: chord.slice(), subdivision: template.subdivision, swing: false,
          type: template.type, source: template.source, timbre: 'pad',
          // Промежуточная атака в плотном жанре остаётся в плане, но голос
          // не перезапускается: реестр в audio-слое просто продлевает его.
          pad: { lead: lead, final: last, map: last ? finalMap : plain, release: last && release }
        });
      });
      return out.length ? out : null;
    }

    // Рисунок остаётся тем же; меняется только исполнение: какие удары
    // звучат и как долго тянется нота. Ноты, высоты и порядок не меняются.
    function articulate(steps, options) {
      if (!Array.isArray(steps) || !steps.length) return steps;
      var o = options || {};
      var timbre = trackTimbre(o.trackId);
      var voice = TIMBRE_ARTICULATION[timbre];
      if (!voice) return steps;
      if (o.pattern && o.pattern.status === 'manual') return steps;   // ручное не трогаем
      if (o.noArticulation) return steps;
      var dur = Number(o.dur);
      if (!(dur > 0)) return steps;
      var beats = Number(o.beats) > 0 ? Number(o.beats) : (Number(o.span) || 1);
      var unit = dur / beats;
      // pad не разрежаем, а пересобираем: иначе от аккорда остаётся одна нота.
      if (timbre === 'pad') {
        var figure = padFigure(steps, o, unit, beats);
        if (figure) return figure;
      }
      var gap = Math.max(0.004, unit * (voice.gapBeats || 0.04));
      var dense = genreFactor() < 1;
      var at = steps.map(function (s) { return Number(s.at) || 0; });
      var keep = steps.map(function () { return true; });
      var result = [];
      for (var i = 0; i < steps.length; i++) {
        if (!keep[i]) continue;
        var step = steps[i];
        var nextAt = null;
        for (var j = i + 1; j < steps.length; j++) { if (keep[j]) { nextAt = at[j]; break; } }
        var stop = (nextAt === null ? dur : Math.min(nextAt, dur)) - gap;
        var wanted = stop - at[i];
        var minLen = voice.minBeats ? unit * voice.minBeats : 0;
        var own = Number(step.dur) || 0;
        var len = own;
        if (voice.legato && !dense) {
          // Легато (орган, pad): тянем до следующей атаки или до конца ячейки.
          // Пианино и Rhodes этой ветки не касаются: у них педаль 0.774 уже
          // посчитала длительности, и второй расчёт только разошёлся бы с ней.
          if (wanted > len) len = wanted;
        }
        if (minLen && len < minLen) len = minLen;
        if (len > dur - at[i]) len = Math.max(0.02, dur - at[i]);
        result.push(len === step.dur ? step : Object.assign({}, step, { dur: len, timbre: timbre }));
      }
      return result.length ? result : steps;
    }
    function plan(o) {
      o = o || {};
      var individual=HOST.StruChordNoteCandidate && HOST.StruChordNoteCandidate.plan(o);if(individual)return articulate(individual,o);
      var cfg = o.pattern ? normalize(o.pattern) : null;
      if (cfg) cfg.source = o.patternSource === 'cell' ? 'cell' : 'section';
      else cfg = resolve(o.trackId, o.cell, o.sec);
      var sub = cfg.subdivision;
      var ownPreset = preset(cfg.type);
      // 0.776: у джаза и блюза свинг включён по умолчанию. Ручное
      // выключение (cfg.swing === false) главнее; при смене жанра рисунок
      // собирается заново, и снова действует умолчание жанра.
      var genreSwing = !!(ownPreset && GENRE_SWING[ownPreset.genre]);
      var swingOn = !o.noSwing && (cfg.swing === true ||
        (cfg.swing === null && (genreSwing || inheritedAutoSwing(o.trackId,o.sec,cfg.source)))) &&
        (sub === 2 || sub === 4);
      var notes = (Array.isArray(o.notes) ? o.notes : [])
        .map(Number).filter(isMidi).slice().sort(asc);
      var ev = o.ev || {};
      var span = Math.max(0.25, Number(o.span) || Number(ev.span) || 1);
      var dur = Math.max(0.05, Number(o.dur) || 0.5);
      var unit = dur / span;
      var beats = cfg.source === 'cell' ? span : numerator(o.ts || current.ts);
      var base = cfg.steps && cfg.steps.length ? cfg.steps : buildSteps(cfg.type, sub, beats);
      var own = cfg.source === 'cell';
      var express = !!(preset(cfg.type) && preset(cfg.type).phrase);
      var offset = own ? 0 : squareOffset(o.sq, o.ei, o.ts) + (express ? precedingSquares(o.sec,o.sq,o.ts) : 0);
      var phase = own ? 0 : Math.max(0, Math.ceil((offset - 1e-9) * sub) / sub - offset);
      var baseNode = Math.round((offset + phase) * sub);
      var startStep = own ? 0 : ((baseNode % base.length) + base.length) % base.length;
      var count = Math.min(MAX_STEPS, Math.max(1, Math.round(span * sub)));
      var C = tokenContext(o, notes);
      // Без явного рисунка — один аккорд в начале каждой ячейки, как у гитары.
      // Явные пресеты, включая сохранённый keys-block, не меняем.
      if (cfg.source === 'default') {
        var single=[{index:0,stepIndex:0,token:'H',at:0,dur:dur,notes:tokenNotes('H',C,function(){return 0;}),subdivision:sub,swing:false,type:cfg.type,source:cfg.source}];
        // 0.782: pad держит гармонию и без сохранённого рисунка.
        var shaped = articulate(single, o);
        if (!o.noHighlight && o.ctx && typeof o.evStart === 'number') scheduleHighlights(o,shaped);
        if (stepObserver) { try { stepObserver({cell:o.cell,trackId:o.trackId,cfg:cfg,steps:shaped}); } catch(e) {} }
        return shaped;
      }
      // Номер звука арпеджио принадлежит всему рисунку секции, а не отдельной
      // ячейке. Считаем только шаги A (в том числе в сочетаниях) до её начала.
      // Свой рисунок ячейки начинается с нуля, как и раньше. Массив base
      // ограничен 64 элементами; циклы считаем арифметически, без длинного цикла.
      function arpCount(token) {
        return (Array.isArray(token) ? token : [token]).filter(function (v) { return v === 'A'; }).length;
      }
      var perCycle = base.reduce(function (sum, token) { return sum + arpCount(token); }, 0);
      var arp = own ? 0 : Math.floor(baseNode / base.length) * perCycle;
      if (!own) for (var j = 0; j < startStep; j++) arp += arpCount(base[j]);
      var out = [];
      for (var i = 0; i < count; i++) {
        var at = (swingOffset(baseNode + i, sub, swingOn) - offset) * unit;
        var next = (swingOffset(baseNode + i + 1, sub, swingOn) - offset) * unit;
        if (at < 0) at = 0;
        if (at >= dur - 0.005) break;             // шаг за правой границей ячейки
        var len = Math.max(0.02, next - at);
        if (at + len > dur) len = dur - at;
        var token = base[(startStep + i) % base.length];
        var dynamic=1;
        if (express && token !== null) {
          var step=(startStep+i)%base.length, strong=step % (sub*2) === 0;
          dynamic=strong ? 1 : step % sub === 0 ? 0.82 : 0.68;
          var lessonPreset=preset(cfg.type);
          if(lessonPreset && lessonPreset.lesson){
            var voices=Array.isArray(token)?token:[token];
            dynamic=voices.indexOf('B')>=0 || voices.indexOf('O')>=0 ? 0.95 : voices.indexOf('R')>=0 ? 0.82 : voices.indexOf('M')>=0 ? 0.52 : 0.68;
            // Не продлеваем ноту специально на последующие пустые шаги.
            len=Math.min(dur-at,Math.max(0.02,len*0.82));
          }
          // Ноты в паузах могут звучать до следующей атаки; короткий фанк
          // и панк оставляем более отрывистыми. Не пересекаем границу аккорда.
          if (lessonPreset && lessonPreset.lesson) { /* длительность уже задана выше */ }
          else if (/^perform-(funk|punk)-/.test(cfg.type)) len=Math.max(0.02,len*0.58);
          else {
            var gap=1;
            while(gap<base.length && base[(step+gap)%base.length]===null) gap++;
            if(gap>1) len=Math.min(dur-at,Math.max(len,(swingOffset(baseNode+i+gap,sub,swingOn)-offset)*unit-at)*0.9);
          }
        }
        out.push({
          index: out.length,
          stepIndex: (startStep + i) % base.length,
          token: token,
          at: at,
          dur: len,
          ...(express ? {gain:dynamic} : {}),
          notes: tokenNotes(token, C, function () { return arp++; }),
          subdivision: sub, swing: !!swingOn, type: cfg.type, source: cfg.source
        });
      }
      out = articulate(out, o);   // 0.776: исполнение зависит от тембра
      if (!o.noHighlight && o.ctx && typeof o.evStart === 'number') scheduleHighlights(o, out);
      if (stepObserver) {
        try { stepObserver({ cell: o.cell, trackId: o.trackId, cfg: cfg, steps: out }); } catch (e) {}
      }
      return out;
    }

    // ---------- Подсветка шагов ----------
    function scheduleHighlights(o, steps) {
      // DOM может появиться позже (boot на DOMContentLoaded), а звук уже идёт:
      // таймеры ставим всегда, highlightStep сам проверит наличие чипов.
      if (typeof HOST.setTimeout !== 'function') return;
      var now = o.ctx && Number.isFinite(o.ctx.currentTime) ? o.ctx.currentTime : 0;
      steps.forEach(function (st) {
        var delay = Math.max(0, (o.evStart + st.at - now) * 1000);
        var id = HOST.setTimeout(function () { highlightStep(st.index); }, delay);
        if (id !== undefined && id !== null) timers.push(id);
      });
    }
    function highlightStep(index) {
      if (!stepsEl || !stepsEl.children) return;
      for (var i = 0; i < stepsEl.children.length; i++) {
        stepsEl.children[i].classList.toggle('is-on', Number(stepsEl.children[i].dataset.step) === index);
      }
    }
    function clearHighlights() {
      if (typeof HOST.clearTimeout === 'function') {
        timers.forEach(function (id) { try { HOST.clearTimeout(id); } catch (e) {} });
      }
      timers = [];
      if (stepsEl && stepsEl.children) {
        for (var i = 0; i < stepsEl.children.length; i++) stepsEl.children[i].classList.remove('is-on');
      }
    }
    function setStepObserver(fn) { stepObserver = typeof fn === 'function' ? fn : null; return !!stepObserver; }

    /** Хук из schedulePatternForEvent: общий ритм секции (сетка и свинг). */
    function adoptRhythm(pattern, ts, bpm, sec, square, eventIndex, evStart, dur) {
      if (!pattern || typeof pattern !== 'object') return;
      var sub = Number(pattern.subdivision);
      sharedRhythm = {
        subdivision: SUBDIVISIONS.indexOf(sub) >= 0 ? sub : 1,
        swing: !!(pattern.swing && typeof patternHasSwing === 'function'
          ? patternHasSwing(pattern) : pattern.swing),
        ts: String(ts || '4/4'),
        secId: sec && sec.id !== undefined ? sec.id : null
      };
    }
    function rhythm() { return sharedRhythm ? Object.assign({}, sharedRhythm) : null; }

    // ---------- UI ----------
    function activeIsKeys() {
      var T = tracks();
      if (!T || typeof T.state !== 'function' || typeof T.track !== 'function') return false;
      var st = null;
      try { st = T.state(); } catch (e) { return false; }
      var t = T.track(st.activeTrackId);
      return !!(t && t.instrument === 'keys');
    }
    function injectCss() {
      if (!doc || !doc.createElement || (!doc.head && !doc.body)) return;
      if (doc.querySelector && doc.querySelector('[data-b39-acc-css]')) return;
      var st = doc.createElement('style');
      st.setAttribute('data-b39-acc-css', '1');
      st.textContent = CSS;
      (doc.head || doc.body).appendChild(st);
    }
    function buildDom() {
      if (!doc || !doc.body || panel) return;
      // Единственные точки входа — кнопки секции и ячейки, как у гитары.
      btn = el('button', 'b39-acc-btn'); btn.id = 'b39AccBtn'; btn.hidden = true;
      overlay = el('div', 'strum-modal-overlay b39-acc-overlay'); overlay.hidden = true;
      panel = el('div', 'strum-modal-content strum-modal-content--pattern b39-acc-editor');
      panel.id = 'b39AccPanel'; panel.hidden = true;
      panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
      panel.setAttribute('aria-label', 'Редактор аккомпанемента');
      if (HUB) HUB.register('acc', closePanel);
      scopeLabel = el('span', 'b39-acc-scope'); panel.appendChild(scopeLabel);
      // Сохранённая роль баса остаётся в песне; отдельный выбор больше не показываем.
      var presets = el('div', 'pattern-presets');
      presets.appendChild(el('div', 'pattern-presets-head', 'Пресеты'));
      presetGenre = el('select','b39-acc-genre'); presetGenre.id='b39AccGenre'; presetGenre.setAttribute('aria-label','Жанр пресетов');
      var common=el('option','','Общие'); common.value=''; presetGenre.appendChild(common);
      STYLES.forEach(function(style){var option=el('option','',style[1]);option.value=style[0];presetGenre.appendChild(option);});
      presetGenre.addEventListener('change',renderPanel); presets.appendChild(presetGenre);
      gridEl = el('div', 'pattern-preset-chips b39-acc-grid');
      PRESETS.forEach(function (p) {
        var button = el('button', 'pattern-preset-chip b39-acc-preset');
        button.type = 'button'; button.setAttribute('data-preset', p.id); button.title = p.hint;
        button.appendChild(el('span', 'pattern-preset-name', p.label));
        var preview = el('span', 'strum-preview'); preview.setAttribute('aria-hidden', 'true');
        button.appendChild(preview);
        button.addEventListener('click', function () {
          draft.type = p.id; draft.subdivision = p.subdivision; if (p.motif) draft.swing = p.presetSwing; delete draft.steps; draftLength = p.phrase && current.scope==='section' && scopeUnits()*2*draft.subdivision<=MAX_STEPS ? scopeUnits()*2 : scopeUnits(); draftInherited = false; selectedStep = null; resetPending = false; renderPanel();
        });
        presetButtons.push(button); gridEl.appendChild(button);
      });
      presets.appendChild(gridEl); panel.appendChild(presets);
      lengthRow = el('div', 'pattern-sub-row'); lengthRow.id = 'b39AccLength'; panel.appendChild(lengthRow);
      var row = el('div', 'pattern-sub-row'); row.appendChild(el('span', '', 'Нот на долю:'));
      [1,2,3,4].forEach(function (n) {
        var button = el('button', 'pattern-sub-btn', String(n)); button.type = 'button'; button.dataset.sub = String(n);
        button.addEventListener('click', function () {
          if (draft.subdivision === n) return;
          var old = draft.subdivision, oldSteps = draftSteps();
          var target = Math.max(1, Math.round(oldSteps.length * n / old));
          if (target > MAX_STEPS) { if (typeof HOST.showToast === 'function') HOST.showToast('Для такой длины слишком много шагов'); return; }
          var result = typeof resamplePatternSteps === 'function' ? resamplePatternSteps(oldSteps, old, n, target) : {steps: oldSteps, lost:0};
          if (result.lost && !HOST.confirm('При смене дробности не поместятся шаги: ' + result.lost + '. Продолжить?')) return;
          draft.subdivision = n; draft.steps = result.steps; draftInherited = false; selectedStep = null; resetPending = false;
          renderPanel();
        });
        subButtons.push(button); row.appendChild(button);
      });
      var swingLabel=el('label','tools-label'); swingLabel.id='b39AccSwingLabel'; swingBtn=el('input');swingBtn.type='checkbox';swingBtn.id='b39AccSwing';swingLabel.appendChild(swingBtn);swingLabel.appendChild(el('span','','Swing'));
      swingBtn.title = 'Свинг — качающиеся восьмые. Влияет только на звук';
      swingBtn.addEventListener('change', function () {
        var st=tracks() && tracks().state(); var on = draft.swing === true || (draft.swing === null && st && inheritedAutoSwing(st.activeTrackId,current.secId,current.scope));
        draft.swing = !on; resetPending = false; renderPanel(); if (previewStop) previewDraft();
      });
      row.appendChild(swingLabel); panel.appendChild(row);
      stepsEl = el('div', 'pattern-grid b39-acc-steps'); stepsEl.id = 'b39AccSteps'; panel.appendChild(stepsEl);
      stepChoice = el('div', 'b39-acc-choice'); stepChoice.id = 'b39AccStepChoice'; stepChoice.hidden = true; panel.appendChild(stepChoice);
      footEl = el('div', 'pattern-hint'); panel.appendChild(footEl);
      var regen=el('button','b39-acc-action','Создать другой рисунок');regen.id='b39AccRegenerate';regen.type='button';regen.hidden=true;
      regen.addEventListener('click',function(){
        var T=tracks(), state=T && T.state(), cfg=state && state.autoAccomp, sec;
        try {sec=sections.find(function(s){return String(s.id)===String(current.secId);});}catch(e){}
        if(!sec || !cfg || cfg.trackId!==editingTrackId || !cfg.managed[String(sec.id)] || !HOST.StruChordAuto)return;
        var old=T.patternFor(editingTrackId,'s:'+sec.id), priorDraft;try{priorDraft=JSON.parse(originalDraft);}catch(e){priorDraft={};}
        var currentDraft=Object.assign({},draft), compareDraft=Object.assign({},priorDraft);delete currentDraft.swing;delete compareDraft.swing;
        var changed=JSON.stringify(currentDraft)!==JSON.stringify(compareDraft);
        if((changed || (old && old.autoGenerated!==true)) && !HOST.confirm('Заменить собственный рисунок секции?'))return;
        var prior=Object.assign({},regenMeta || old || {},{autoSwing:true,swing:draft.swing,steps:draftSteps()}), variation=((Number((regenMeta || old || {}).autoVariation)||0)+1)%4;
        var generated=HOST.StruChordAuto.makePattern(sec,cfg.primary,cfg.secondary,{previous:prior,variation:variation,forceChange:true});
        if(!generated)return;
        var original=originalDraft;loadDraft(Object.assign({source:'section'},generated));originalDraft=original;
        regenMeta={autoSwing:true,autoVariation:variation,swing:draft.swing};regenSignature=JSON.stringify(draft);resetPending=false;renderPanel();if(previewStop)previewDraft();
      });panel.appendChild(regen);
      var previewRow = el('div', 'b39-acc-actions');
      var preview = el('button', 'b39-acc-action b39-acc-action--preview'); preview.id = 'b39AccPreview'; preview.type = 'button';
      var previewIcon = el('i', 'ti ti-player-play'); previewIcon.setAttribute('aria-hidden','true'); preview.appendChild(previewIcon); preview.appendChild(doc.createTextNode(' Прослушать'));
      preview.addEventListener('click', previewDraft); previewRow.appendChild(preview); panel.appendChild(previewRow);
      var actions = el('div', 'b39-acc-actions');
      var cancel = el('button', 'b39-acc-action', 'Отмена'); cancel.id = 'b39AccCancel'; cancel.type = 'button'; cancel.addEventListener('click', closePanel); actions.appendChild(cancel);
      var reset = el('button', 'b39-acc-action', 'Сбросить'); reset.id = 'b39AccReset'; reset.type = 'button';
      reset.addEventListener('click', function () { resetDraft(); renderPanel(); }); actions.appendChild(reset);
      var save = el('button', 'b39-acc-action b39-acc-save', 'Сохранить'); save.id = 'b39AccSave'; save.type = 'button';
      save.addEventListener('click', function () {
        var T = tracks(), currentTrack = T && T.track(editingTrackId);
        if (!currentTrack) { closePanel(); return; }
        var commit = function () {
          var transition=HOST.__b39NoteLegacy;
          if(transition && transition.trackId===editingTrackId && (resetPending || JSON.stringify(draft)!==originalDraft)){
            var map=currentTrack.patterns||{};Object.keys(map).forEach(function(k){if(map[k] && map[k].type==='experimental-notes-v1' && (transition.cell ? k===transition.cell : k.indexOf(String(transition.sectionId)+':')===0))T.clearPattern(editingTrackId,k);});
          }
          if (resetPending) clearScopes(); else if (!draftDefault || JSON.stringify(draft) !== originalDraft) apply();
        };
        if (HOST.songStore && typeof HOST.songStore.dispatch === 'function') HOST.songStore.dispatch('b39/accomp-edit', commit, {history:'atomic'});
        else commit();
        closePanel();
      }); actions.appendChild(save);
      panel.appendChild(actions); overlay.appendChild(panel); doc.body.appendChild(overlay);
      overlay.addEventListener('click', function (e) { if (e.target === overlay) closePanel(); });
      overlay.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); closePanel(); } });
    }

    function glyph(token) {
      if (token === null || token === undefined || token === '_') return '·';
      if (Array.isArray(token)) return '▮♪';
      if (token === 'H' || token === 'R') return '▮';
      if (token === 'M') return '♪';
      if (token === 'B') return '●';
      if (token === 'O') return '◎';
      if (token === 'A') return '↑';
      return '♪';
    }
    function scopeUnits() {
      if (current.scope === 'cell') {
        try { var sec = sections.find(function (s) { return s.id === current.secId; }); var sq = sec && sec.squares.find(function (q) { return q.id === current.sqId; }); var ev = sq && sq.events[current.ei]; if (ev) return Number(ev.span) || 1; } catch (e) {}
      }
      return numerator(current.ts || '4/4');
    }
    function draftSteps() {
      var beats = scopeUnits();
      var count = Math.min(MAX_STEPS, Math.max(1, Math.round(draftLength * draft.subdivision)));
      var selectedPreset=preset(draft.type);
      var base = draft.steps || buildSteps(draft.type, draft.subdivision, draftInherited || (selectedPreset && selectedPreset.phrase) ? numerator(current.ts) : draftLength);
      var offset = 0;
      if (draftInherited) {
        try { var sec2 = sections.find(function (s) { return s.id === current.secId; }); var sq2 = sec2 && sec2.squares.find(function (q) { return q.id === current.sqId; }); offset = Math.round((squareOffset(sq2, current.ei, current.ts) + (selectedPreset && selectedPreset.phrase ? precedingSquares(sec2,sq2,current.ts) : 0)) * draft.subdivision); } catch (e) {}
      }
      return Array.from({length:count}, function (_, i) { var v = base[(offset + i) % base.length]; return Array.isArray(v) ? v.slice() : v; });
    }
    function renderLength() {
      if (!lengthRow) return;
      var full = scopeUnits(), opts = [], maxUnits = full;
      if (current.scope === 'section') {
        try { var sec = sections.find(function (s) { return s.id === current.secId; }); var sq = sec && sec.squares && sec.squares[0]; maxUnits = Math.min(full * 2, Number(getSquareBeats(sq || {events:[]}, current.ts)) || full); } catch (e) {}
      }
      for (var n=1; n<=full; n++) if (full % n === 0) opts.push(n);
      if (full > 0 && opts.indexOf(full) < 0) opts.push(full);
      if (full * 2 <= maxUnits) opts.push(full * 2);
      if (opts.indexOf(draftLength) < 0) opts.push(draftLength);
      opts = opts.filter(function (x) { return x > 0 && Math.round(x * draft.subdivision) <= MAX_STEPS; }).sort(function(a,b){return a-b;});
      lengthRow.textContent = ''; lengthRow.appendChild(el('span', '', 'Длина рисунка:'));
      opts.forEach(function (length) {
        var b=el('button','pattern-sub-btn'+(length===draftLength?' active':''),String(length)); b.type='button'; b.dataset.length=String(length); b.setAttribute('aria-pressed',String(length===draftLength));
        b.title = length < full ? 'Рисунок повторяется' : length > full ? 'Рисунок продолжается в следующем такте' : 'Рисунок на всю длину';
        b.addEventListener('click',function(){
          if (length===draftLength) return;
          var old=draftSteps(), need=Math.max(1,Math.round(length*draft.subdivision));
          var removed=old.slice(need).filter(function(v){return v!==null && v!==undefined;}).length;
          if (removed && !HOST.confirm('При сокращении длины будут удалены шаги: '+removed+'. Продолжить?')) return;
          draft.steps=Array.from({length:need},function(_,i){var v=old[i%old.length];return Array.isArray(v)?v.slice():v;});
          draftLength=length; draftInherited=false; selectedStep=null; resetPending=false; renderPanel();
        }); lengthRow.appendChild(b);
      });
      var note=el('span','hint-inline',draftLength<full ? 'повторяется' : draftLength>full ? 'на следующий такт' : ''); lengthRow.appendChild(note);
    }
    var STEP_CHOICES = [
      ['H','Аккорд (бас по секции)'], ['R','Аккорд без баса'], ['M','Средний звук аккорда'], ['B','Бас'], ['O','Октава баса'], ['A','Арпеджио ↑'],
      ['t1','1 · основа'], ['t3','3 · терция'], ['t5','5 · квинта'], ['t7','7 · септима'],
      ['t9','9 · нона'], ['t11','11 · ундецима'], ['t13','13 · терцдецима']
    ];
    function stepName(token) {
      if (token == null) return 'Пауза';
      var values=Array.isArray(token)?token:[token];
      return values.map(function(v){var found=STEP_CHOICES.find(function(c){return c[0]===v;});return found?found[1]:v;}).join(' + ');
    }
    function stepGlyph(token) {
      if (token == null) return '';
      var values=Array.isArray(token)?token:[token];
      var text=values.map(function(v){return ({H:'А', R:'А−Б', M:'С', B:'Б', O:'О', A:'↑', t1:'1', t3:'3', t5:'5', t7:'7', t9:'9', t11:'11', t13:'13'})[v] || '?';}).join('+'); return text.length > 5 ? text.slice(0,4)+'…' : text;
    }
    function renderStepChoice() {
      if (!stepChoice) return;
      stepChoice.textContent=''; stepChoice.hidden=selectedStep === null;
      if (selectedStep === null) return;
      var arr=draftSteps(); if (selectedStep >= arr.length) { selectedStep=null; stepChoice.hidden=true; return; }
      var head=el('div','b39-acc-choice-head'); head.appendChild(el('span','','Шаг '+(selectedStep+1)+' · выберите звуки'));
      var close=el('button','pattern-sub-btn','Готово'); close.type='button'; close.addEventListener('click',function(){selectedStep=null;renderPanel();}); head.appendChild(close); stepChoice.appendChild(head);
      var options=el('div','b39-acc-choice-options'); options.setAttribute('role','group'); options.setAttribute('aria-label','Звуки шага '+(selectedStep+1));
      var values=arr[selectedStep]==null?[]:(Array.isArray(arr[selectedStep])?arr[selectedStep].slice():[arr[selectedStep]]);
      var pause=el('button','pattern-pick-toggle'+(!values.length?' active':''),'Пауза'); pause.type='button'; pause.setAttribute('aria-pressed',String(!values.length));
      pause.addEventListener('click',function(){var steps=draftSteps(); steps[selectedStep]=null; draft.steps=steps; draftInherited=false; resetPending=false; renderPanel();}); options.appendChild(pause);
      STEP_CHOICES.forEach(function(choice){
        var b=el('button','pattern-pick-toggle'+(values.indexOf(choice[0])>=0?' active':''),choice[1]); b.type='button'; b.dataset.token=choice[0]; b.setAttribute('aria-pressed',String(values.indexOf(choice[0])>=0));
        b.addEventListener('click',function(){
          var next=values.slice(), ix=next.indexOf(choice[0]);
          if(ix>=0) next.splice(ix,1); else if(next.length<8) next.push(choice[0]); else {if(typeof HOST.showToast==='function')HOST.showToast('Не больше 8 звуков на шаг');return;}
          var steps=draftSteps(); steps[selectedStep]=next.length===0?null:next.length===1?next[0]:next; draft.steps=steps; draftInherited=false; resetPending=false; renderPanel(); var again=stepChoice.querySelector('[data-token="'+choice[0]+'"]'); if (again) again.focus();
        }); options.appendChild(b);
      });
      stepChoice.appendChild(options);
      stepChoice.appendChild(el('div','b39-acc-choice-note','Можно выбрать несколько звуков. Ступени берутся из текущего аккорда; если ступени в нём нет, она не звучит.'));
    }
    function renderSteps() {
      if (!stepsEl) return;
      var arr = draftSteps(), sub = draft.subdivision;
      var barUnits = numerator(current.ts || '4/4'), beatLabels = [];
      if (typeof isCompoundMeter === 'function' && isCompoundMeter(current.ts) && typeof getBeatGrouping === 'function') {
        getBeatGrouping(current.ts).forEach(function (size, group) { for (var k=0;k<size;k++) beatLabels.push({text:k===0 ? String(group+1) : '·', strong:k===0}); });
      }
      stepsEl.classList.toggle('pattern-grid--rows', draftLength > barUnits); stepsEl.style.setProperty('--pattern-cols', String(barUnits));
      stepsEl.textContent = '';
      for (var start=0; start<arr.length; start+=sub) {
        var group = el('div','pattern-beat-group'), cells = el('div','pattern-beat-cells'), numbers = el('div','pattern-beat-numbers');
        for (var k=0; k<sub && start+k<arr.length; k++) (function (i, pos, beat) {
          var token=arr[i], name=stepName(token);
          var button=el('button', 'pattern-step-btn b39-acc-step' + (token==null ? '' : ' filled') + (selectedStep===i ? ' is-editing' : ''), stepGlyph(token));
          button.type='button'; button.dataset.step=String(i); button.setAttribute('aria-label','Шаг '+(i+1)+': '+name+'. Нажмите, чтобы изменить'); button.title=button.getAttribute('aria-label');
          button.addEventListener('click', function () { selectedStep = selectedStep===i ? null : i; renderPanel(); });
          cells.appendChild(button);
          var number=el('span','pattern-beat-number');
          if (pos===0) { var label=beatLabels.length ? beatLabels[beat%beatLabels.length] : null; number.textContent=label ? label.text : String((beat%barUnits)+1); number.classList.add('is-beat'); if (label && label.strong) number.classList.add('is-group-start'); }
          else number.textContent=typeof countLabelFor === 'function' ? countLabelFor(beat,pos,sub,barUnits) : 'и';
          numbers.appendChild(number);
        })(start+k,k,Math.floor(start/sub));
        group.appendChild(cells); group.appendChild(numbers); stepsEl.appendChild(group);
      }
    }
    function resolveForScope() {
      var T = tracks();
      if (!T || typeof T.state !== 'function') return null;
      var st = T.state();
      // Показываем настройку ИМЕННО выбранной области: редактируем секцию —
      // личный рисунок ячейки не должен подменять её пресет в панели.
      return resolve(st.activeTrackId, current.scope === 'cell' ? current.cellKey : null, current.secId);
    }
    function loadDraft(cfg) {
      draft = { type: cfg.type, subdivision: cfg.subdivision, swing: cfg.swing };
      draftDefault = cfg.source === 'default';
      draftInherited = current.scope === 'cell' && cfg.source !== 'cell' && !draftDefault;
      draftLength = !draftInherited && cfg.steps ? cfg.steps.length / cfg.subdivision : (preset(cfg.type) && preset(cfg.type).phrase && current.scope==='section' && scopeUnits()*2*cfg.subdivision<=MAX_STEPS ? scopeUnits()*2 : scopeUnits());
      selectedStep = null;
      if (cfg.steps) draft.steps = cfg.steps.map(function (v) { return Array.isArray(v) ? v.slice() : v; });
      else if (draftDefault) draft.steps = Array.from({length:Math.max(1,Math.round(draftLength * draft.subdivision))},function(_,i){return i===0?'H':null;});
      if (presetGenre) { var p = preset(cfg.type); presetGenre.value = p && p.genre || ''; }
      originalDraft = JSON.stringify(draft); regenSignature=null; regenMeta=null;
    }
    function renderPanel() {
      if (!panel) return;
      if (!panel.hidden && editingTrackId !== null) {
        var T = tracks(), state = T && T.state();
        if (!state || state.activeTrackId !== editingTrackId) { closePanel(); return; }
      }
      var active=tracks() && tracks().state(), inheritedSwing = draft.swing === null && active && inheritedAutoSwing(active.activeTrackId,current.secId,current.scope);
      presetButtons.forEach(function (b) {
        var id = b.getAttribute('data-preset'), p = preset(id), selected = id === draft.type && !draft.steps;
        b.setAttribute('aria-pressed', String(selected)); b.classList.toggle('active', selected);
        b.hidden = !!p && (p.genre || '') !== (presetGenre ? presetGenre.value : '');
        var preview = b.querySelector('.strum-preview');
        if (preview && p) {
          preview.textContent = '';
          buildSteps(p.id, p.subdivision, scopeUnits()).slice(0, 8).forEach(function (token) {
            preview.appendChild(el('span', 'strum-step', token === null ? '·' : stepGlyph(token)));
          });
        }
      });
      subButtons.forEach(function (b) { var n=Number(b.dataset.sub); b.classList.toggle('active', n===draft.subdivision); b.setAttribute('aria-pressed',String(n===draft.subdivision)); b.hidden = n===3 && typeof timeSigAllowsTriplets === 'function' && !timeSigAllowsTriplets(current.ts); });
      if (swingBtn) { var allowed = draft.subdivision === 2 || draft.subdivision === 4; var enabled = draft.swing === true || !!inheritedSwing; swingBtn.hidden = !allowed; var label=doc.getElementById('b39AccSwingLabel');if(label)label.hidden=!allowed; swingBtn.checked=!!(allowed && enabled); swingBtn.classList.toggle('active', allowed && enabled); swingBtn.setAttribute('aria-pressed', String(allowed && enabled)); }
      if (scopeLabel) { scopeLabel.hidden = current.scope !== 'cell'; scopeLabel.textContent = current.scope === 'cell' ? 'только для этой ячейки' : ''; }
      var resetButton = doc.getElementById('b39AccReset'); if (resetButton) resetButton.textContent = current.scope === 'cell' ? 'Сбросить к секции' : 'Убрать паттерн';
      var regen=doc.getElementById('b39AccRegenerate'), autoCfg=active && active.autoAccomp;
      if(regen) regen.hidden=!(current.scope==='section' && autoCfg && autoCfg.trackId===active.activeTrackId && autoCfg.managed[String(current.secId)]);
      renderLength(); renderSteps(); renderStepChoice();
      if (footEl) {
        var chosen=preset(draft.type), hint=chosen && chosen.lesson ? ' '+chosen.hint : '';
        footEl.textContent = resetPending ? 'После сохранения вернётся унаследованный рисунок.' : draftDefault && JSON.stringify(draft) === originalDraft ? 'По умолчанию — один удар на каждую ячейку. Выберите пресет или измените шаги для своего рисунка.' : 'Нажмите на шаг, чтобы выбрать звуки или паузу.'+hint;
      }
    }
    function stopPreview() { if (previewTimer) { clearTimeout(previewTimer); previewTimer = null; } if (previewStop) { previewStop(); previewStop = null; } }
    function previewDraft() {
      stopPreview();
      var T = tracks(), A = audio(); if (!T || !A || !HOST.getAudioContext) return;
      var sec = null; try { sec = sections.find(function (s) { return s.id === current.secId; }); } catch (e) {}
      var sq = sec && (sec.squares || []).find(function (q) { return q.id === current.sqId; });
      if (!sq && sec && sec.squares) sq = sec.squares[0];
      var ev = sq && sq.events && sq.events[current.ei || 0];
      var state = T.state(), cell = sec && sq ? T.cellKey(sec, sq, current.ei || 0) : null;
      var chord = cell && T.trackChord(state.activeTrackId, cell, ev);
      if (!chord && sec) {
        (sec.squares || []).some(function (q) { return (q.events || []).some(function (e, i) { var candidate=T.cellKey(sec,q,i); chord = T.trackChord(state.activeTrackId, candidate,e); if(chord)cell=candidate; return !!chord; }); });
      }
      if (!chord) { if (typeof HOST.showToast === 'function') HOST.showToast('Добавьте аккорд для прослушивания'); return; }
      var ctx = HOST.getAudioContext(); if (!ctx) return;
      if (typeof HOST.resumeAudioContext === 'function') HOST.resumeAudioContext();
      var key = sec && sec.key || (typeof globalKey !== 'undefined' ? globalKey : 'C');
      var bpm = sec && typeof getEffectiveBpm === 'function' ? getEffectiveBpm(sec) : 120;
      var span = Math.max(scopeUnits(), draftLength);
      var config = Object.assign({}, draft);
      if (draftInherited) config.steps = draftSteps();
      previewStop = A.previewPattern(chord, ctx, state.activeTrackId, key, config, {scope:current.scope, span:span, bpm:bpm, ts:current.ts, keyboardSize:T.track(state.activeTrackId).keyboardSize,sec:sec,cell:cell,bassMode:current.scope==='section'?draftBassMode:undefined});
      if (previewStop) { var unit = typeof getGridUnitDurationSeconds === 'function' ? getGridUnitDurationSeconds(bpm, current.ts) : 60 / bpm; previewTimer = setTimeout(function () { previewStop = null; previewTimer = null; }, Math.ceil((span * unit + .2) * 1000)); }
    }
    function resetDraft() {
      var T = tracks(), state = T && T.state(); if (!state) return;
      var cfg = current.scope === 'cell' ? resolve(state.activeTrackId, null, current.secId) : {type:DEFAULT_TYPE, subdivision:1, swing:null, source:'default'};
      loadDraft(cfg); resetPending = true;
    }
    function openPanel() {
      guessScope();
      var T = tracks(), state = T && T.state();
      editingTrackId = state ? state.activeTrackId : null;
      var cfg = resolveForScope(); if (cfg) loadDraft(cfg); resetPending = false;
      draftBassMode=state && current.secId!=null ? T.bassRole(state.activeTrackId,current.secId) : 'legacy';
      if(bassSelect)bassSelect.value=draftBassMode;if(bassRow)bassRow.hidden=current.scope!=='section';
      if (HUB) HUB.opened('acc');
      if (panel) { panel.hidden = false; overlay.hidden = false; }
      renderPanel();
      if (typeof trapFocus === 'function') focusRelease = trapFocus(panel, closePanel);
      var first = panel && panel.querySelector('button'); if (first) first.focus();
    }
    function closePanel() {
      HOST.__b39NoteLegacy=null;stopPreview(); selectedStep = null; if (HOST.StruChordAuto) HOST.StruChordAuto.close();
      if (focusRelease) { focusRelease(); focusRelease = null; }
      if (panel) { panel.hidden = true; overlay.hidden = true; }
      if (HUB) HUB.closed('acc');
    }
    function togglePanel() { if (panel && !panel.hidden) closePanel(); else openPanel(); }

    function guessScope() {
      if (current.secId !== null && current.secId !== undefined) return;
      var secs = [];
      try { if (typeof sections !== 'undefined' && Array.isArray(sections)) secs = sections; } catch (e) {}
      if (!secs.length && Array.isArray(HOST.__b39Sections)) secs = HOST.__b39Sections;
      if (!secs.length) return;
      var s0 = secs[0], q0 = s0 && Array.isArray(s0.squares) ? s0.squares[0] : null;
      if (!s0 || !q0) return;
      current.secId = s0.id;
      current.sqId = q0.id;
      current.ei = 0;
      current.cellKey = s0.id + ':' + q0.id + ':0';
      current.scope = 'section';
    }
    function setEditorScope(scope, secId, sqId, ei) {
      current.secId = secId;
      current.sqId = sqId;
      current.ei = ei;
      current.cellKey = (scope === 'event' && sqId !== undefined && sqId !== null &&
        ei !== undefined && ei !== null) ? secId + ':' + sqId + ':' + ei : null;
      current.scope = scope === 'event' ? 'cell' : 'section';
      try { var sec = sections.find(function (s) { return s.id === secId; }); var sq = sec && (sec.squares || []).find(function (q) { return q.id === sqId; }); var ev = sq && sq.events && sq.events[ei]; current.ts = (ev && ev.timeSig) || (sec && sec.timeSig) || globalTimeSig || '4/4'; } catch (e) { current.ts = '4/4'; }
    }
    function apply() {
      var T = tracks();
      if (!T || typeof T.setPattern !== 'function' || !activeIsKeys()) return false;
      var st = T.state();
      var key = current.scope === 'cell' && current.cellKey
        ? current.cellKey
        : (current.secId !== null && current.secId !== undefined ? 's:' + current.secId : null);
      if (!key) return false;
      var payload = { type: draft.type, subdivision: draft.subdivision };
      if (draft.steps || draftInherited) payload.steps = draftSteps().map(function (v) { return Array.isArray(v) ? v.slice() : v; });
      // null = «как в ритме секции». Явно не пишем, пока пользователь сам
      // не тронул галочку свинга — наследование тогда сохраняется.
      if (draft.swing !== null) payload.swing = draft.swing;
      var old = T.patternFor(st.activeTrackId, key);
      function withoutSwing(value){try{var o=JSON.parse(value);delete o.swing;return JSON.stringify(o);}catch(e){return '';}}
      var unchanged=withoutSwing(originalDraft)===withoutSwing(JSON.stringify(draft));
      var regenerated=regenSignature && withoutSwing(regenSignature)===withoutSwing(JSON.stringify(draft));
      if ((old && old.autoGenerated===true && unchanged) || regenerated) payload.autoGenerated=true;
      var meta=regenerated ? regenMeta : old;
      if(meta && meta.autoSwing===true) {payload.autoSwing=true;if(Number.isInteger(meta.autoVariation))payload.autoVariation=meta.autoVariation;}

      return T.setPattern(st.activeTrackId, key, payload);
    }
    function clearScopes() {
      var T = tracks();
      if (!T || typeof T.clearPattern !== 'function') return;
      var st = T.state();
      if (current.scope === 'cell' && current.cellKey) T.clearPattern(st.activeTrackId, current.cellKey);
      else if (current.secId !== null && current.secId !== undefined) T.clearPattern(st.activeTrackId, 's:' + current.secId);
      renderPanel();
    }

    /** Кнопка «Бой/перебор» на клавишной дорожке ведёт сюда. */
    function wrapEditor() {
      if (wrapped || typeof HOST.openStrumPatternEditor !== 'function') return;
      var orig = HOST.openStrumPatternEditor;
      HOST.openStrumPatternEditor = function (scope, sectionId, squareId, eventIndex) {
        if (activeIsKeys()) {
          if(!HOST.__b39NoteLegacy && HOST.StruChordNoteEditor && HOST.StruChordNoteEditor.open(scope,sectionId,squareId,eventIndex))return undefined;
          setEditorScope(scope, sectionId, squareId, eventIndex);
          openPanel();
          return undefined;
        }
        return orig.apply(this, arguments);
      };
      wrapped = true;
    }
    /** Свойство видимых кнопок: гитара — «Бой/перебор», клавиши — «Аккомпанемент». */
    function relabel() {
      if (!doc || !doc.querySelectorAll) return;
      var on = activeIsKeys();
      var root = doc.documentElement;
      if (root && root.classList) {
        if (on) root.classList.add('b39-keys-mode');
        else root.classList.remove('b39-keys-mode');
      }
      // Не оставлять раскрытый гитарный строй при смене активной дорожки.
      var tuningList = doc.getElementById('tuningPickerList');
      if (on && tuningList && !tuningList.hidden && typeof HOST.toggleTuningPicker === 'function') HOST.toggleTuningPicker(false);
      // Кнопок клавишных окон на гитаре нет — значит и открытые окна закрываем.
      if (!on) {
        try {
          var K = HOST.StruChordKeys;
          if (K && typeof K.panel === 'function' && typeof K.close === 'function') {
            var kp = K.panel();
            if (kp && !kp.hidden) K.close();
          }
        } catch (e) { /* чужой модуль не должен ломать режим */ }
        try { if (panel && !panel.hidden) closePanel(); } catch (e) { /* то же */ }
      }
      var nodes = doc.querySelectorAll('.chord-btn-strum, .strum-badge-wrap, [title*="Бой/перебор"], [data-b39-acc-label]');
      Array.prototype.forEach.call(nodes, function (n) {
        if (!n.dataset) return;
        if (n.dataset.b39AccOrigTitle === undefined) n.dataset.b39AccOrigTitle = n.getAttribute('title') || '';
        if (n.dataset.b39AccOrigText === undefined) n.dataset.b39AccOrigText = n.textContent || '';
        var want = on ? 'Аккомпанемент клавишной дорожки — нажмите, чтобы изменить'
          : n.dataset.b39AccOrigTitle;
        if ((n.getAttribute('title') || '') !== want) n.setAttribute('title', want);
        if (n.dataset.b39AccLabel !== '1') n.dataset.b39AccLabel = '1';
        if (n.classList && n.classList.contains('chord-btn-strum')) {
          var text = on ? 'аккомп.' : n.dataset.b39AccOrigText;
          if (n.textContent !== text) n.textContent = text;
        }
      });
    }
    function watchDom() {
      if (observer || !doc || !doc.body || typeof HOST.MutationObserver !== 'function') return;
      try {
        observer = new HOST.MutationObserver(function () { relabel(); });
        observer.observe(doc.body, { childList: true, subtree: true });
      } catch (e) { observer = null; }
    }

    function boot() {
      if (booted) return;
      if (!doc || !doc.body) return;
      booted = true;
      injectCss(); buildDom(); wrapEditor(); watchDom();
      var A = audio();
      if (A && typeof A.setPatternPlanner === 'function') A.setPatternPlanner(plan);
      var store = HOST.songStore;
      if (store && typeof store.subscribe === 'function') {
        try { store.subscribe(function () { relabel(); renderPanel(); }); } catch (e) {}
      }
      relabel(); renderPanel();
    }

    var api = Object.freeze({
      boot: boot, plan: plan, resolve: resolve, buildSteps: buildSteps,
      padVoiceMap: padVoiceMap, padGlideLead: function () { return PAD_GLIDE_LEAD; },
      bassPolicy:bassPolicy, stripBass:stripBass, sectionFromCell:sectionFromCell,
      normalize: normalize, preset: preset, list: list, styles: function () { return STYLES.map(function (s) { return {id:s[0],label:s[1]}; }); }, tokens: function () { return TOKENS.slice(); },
      adoptRhythm: adoptRhythm, rhythm: rhythm,
      open: openPanel, close: closePanel, toggle: togglePanel, render: renderPanel,
      setEditorScope: setEditorScope, apply: apply, clearScopes: clearScopes,
      relabel: relabel, activeIsKeys: activeIsKeys,
      highlightStep: highlightStep, clearHighlights: clearHighlights, setStepObserver: setStepObserver,
      button: function () { return btn; }, panel: function () { return panel; },
      stepsElement: function () { return stepsEl; },
      draft: function () { return Object.assign({}, draft); },
      scope: function () { return Object.assign({}, current); }
    });
    HOST.StruChordAccomp = api;

    if (typeof HOST.setTimeout === 'function') HOST.setTimeout(boot, 0);
    if (doc && doc.readyState === 'loading' && doc.addEventListener) doc.addEventListener('DOMContentLoaded', boot);
    else boot();
  })(typeof window !== 'undefined' ? window : globalThis);
  // <<< B-39 STAGE5 END (KEYS ACCOMPANIMENT) <<<
  };
})();
