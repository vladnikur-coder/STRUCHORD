// 0.796 · B-39 (бэклог №23): голосоведение (linkedVoicings) включено по умолчанию.
// Absent поля = вкл; явное false = выкл и переживает save/load. Запуск: node dev/tests/b39-linked-default-0796.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ROOT = path.join(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(ROOT, 'STRUCHORD.html'), 'utf8');

let passed = 0;
function ok(name) { passed++; console.log('  ok  ' + name); }

// linkedSelection: absent = вкл, выкл только явным false.
assert(HTML.includes('if(!t || t.linkedVoicings===false || !cell)return null;'),
  'linkedSelection: absent = вкл (0.796)');
assert(!HTML.includes('if(!t || !t.linkedVoicings || !cell)return null;'), 'старого guardа (absent = выкл) нет');
ok('linkedSelection: по умолчанию голосоведение включено');

// Галочка в панели при absent = вкл.
assert(HTML.includes('linkedToggle.checked=active.track.linkedVoicings!==false;'), 'чекбокс панели: вкл при absent (0.796)');
ok('UI: галочка голосоведения включена по умолчанию');

// setLinkedVoicings: выкл = явный false (не удаление поля), absent не считается выкл.
assert(HTML.includes("if((t.linkedVoicings!==false)===on)return true;"), 'setLinkedVoicings: сравнение с умолчанием (0.796)');
assert(HTML.includes('t.linkedVoicings=on;return true;'), 'setLinkedVoicings: false сохраняется явно (0.796)');
assert(!HTML.includes('else delete t.linkedVoicings'), 'поле больше не удаляется при выкл (иначе снова было бы "по умолчанию вкл")');
ok('setLinkedVoicings: выкл = явное false, поле не удаляется');

// Sanitize при загрузке: и true, и false переживают.
assert(HTML.includes("typeof raw.linkedVoicings==='boolean' ? {linkedVoicings:raw.linkedVoicings} : {}"),
  'sanitize: булевское значение (incl. false) сохраняется (0.796)');
ok('загрузка файла: явное false не теряется');

// Экспорт/превью guard переведён на ===false.
assert(HTML.includes("track.linkedVoicings!==false && cell"), 'guard экспорта/превью: absent = вкл (0.796)');
ok('прочие guardы (экспорт/превью) — по умолчанию вкл');

console.log(`\n0.796 (№23): голосоведение по умолчанию включено — все проверки пройдены (${passed} групп)`);
