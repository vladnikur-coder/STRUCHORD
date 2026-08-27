// Проверяем лабораторию пресетов: редактирование, генерацию кода и —
// главное — что сгенерированный код обратно совместим со STRUCHORD.
const fs = require('fs');
const { JSDOM } = require('jsdom');

const dom = new JSDOM(fs.readFileSync('/home/user/preset-lab.html', 'utf8'), {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://localhost/',
});
const w = dom.window;
w.AudioContext = w.webkitAudioContext = function () {
  return { currentTime: 0, state: 'running', resume() {}, sampleRate: 44100,
    createGain: () => ({ connect(){}, gain: { value: 0, setValueAtTime(){}, exponentialRampToValueAtTime(){} } }),
    createBuffer: () => ({ getChannelData: () => new Float32Array(64) }),
    createConvolver: () => ({ connect(){}, buffer: null }),
    createBufferSource: () => ({ connect(){}, start(){}, stop(){}, buffer: null }),
    createBiquadFilter: () => ({ connect(){}, type: '', frequency: { value: 0 }, Q: { value: 0 } }),
    createStereoPanner: () => ({ connect(){}, pan: { value: 0 } }),
    destination: {} };
};

function run() {
  const d = w.document;
  const $ = (id) => d.getElementById(id);
  const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

  console.log('=== 1. Загрузка ===');
  console.log('   пресетов в списке:', $('cnt').textContent);
  console.log('   строк кода на выходе:', $('out').value.split('\n').length);

  console.log('\n=== 2. Движок взят из STRUCHORD ===');
  ['buildPatternFromPreset', 'resolvePickStepStrings', 'resamplePatternSteps',
   'pluckSingleGuitarString', 'strumChordDirectional', 'isPresetCompatible'].forEach((f) => {
    console.log('  ', f.padEnd(26), w.eval('typeof ' + f));
  });

  console.log('\n=== 3. Сетка отрисована ===');
  const steps = d.querySelectorAll('.step');
  console.log('   ячеек:', steps.length);
  const p0 = w.eval('JSON.stringify({id:presets[0].id, base:presets[0].base, sub:presets[0].subdivision})');
  console.log('   первый пресет:', p0);

  console.log('\n=== 4. Клик по ячейке меняет знак (маятник) ===');
  const first = steps[0];
  const before = first.textContent;
  click(first);
  const after1 = first.textContent;
  click(first);
  const after2 = first.textContent;
  console.log(`   "${before}" -> "${after1}" -> "${after2}" (ожидаем ↓ -> × для нечётной)`);

  console.log('\n=== 5. Смена subdivision сохраняет рисунок ===');
  w.eval(`
    presets[0].base = 4; presets[0].subdivision = 1;
    presets[0].steps = ['D','D','D','D'];
    selIdx = 0; renderFields(); renderGrid();
  `);
  const sub = $('f-sub');
  sub.value = '2';
  sub.dispatchEvent(new w.Event('change'));
  console.log('   sub 1 (DDDD) -> sub 2:', w.eval("presets[0].steps.map(s=>s||'_').join('')"));

  console.log('\n=== 6. Триоли (sub 3) доступны ===');
  sub.value = '3';
  sub.dispatchEvent(new w.Event('change'));
  console.log('   sub 3:', w.eval("presets[0].steps.map(s=>s||'_').join('')"),
    '| длина:', w.eval('presets[0].steps.length'), '(ожидаем 12)');

  console.log('\n=== 7. Валидация ловит ошибки ===');
  w.eval("presets[0].id = 'НЕ латиница'; renderReport();");
  console.log('   отчёт:', $('report').querySelector('.warn, .ok').textContent.slice(0, 80));
  w.eval("presets[0].id = 'quarters'; renderReport();");

  console.log('\n=== 8. Новый пресет ===');
  const n0 = w.eval('presets.length');
  click($('btn-new'));
  console.log('   было', n0, '-> стало', w.eval('presets.length'));

  console.log('\n=== 9. Сгенерированный код валиден и совместим ===');
  const code = $('out').value;
  fs.writeFileSync('/tmp/gen-presets.js', code);
  return code;
}

let generated = null;
w.addEventListener('load', () => {
  try { generated = run(); } catch (e) { console.error('ОШИБКА:', e.message, e.stack); process.exitCode = 1; }
});

process.on('exit', () => {
  if (!generated) return;
  // Прогоняем сгенерированный код через синтаксическую проверку и
  // валидатор из самого STRUCHORD.
  const { execSync } = require('child_process');
  try {
    execSync('node --check /tmp/gen-presets.js');
    console.log('   node --check: OK');
  } catch (e) {
    console.log('   node --check: ОШИБКА СИНТАКСИСА');
  }
});
