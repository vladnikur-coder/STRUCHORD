/* Pure migration contract; does not claim that the application implements it. */
const assert=require('assert');
const {createTuningModel}=require('../prototypes/track-tuning-model');
const model=createTuningModel([
  {id:'e-std',notes:['E2','A2','D3','G3','B3','E4']},
  {id:'drop-d',notes:['D2','A2','D3','G3','B3','E4']}
]);
const legacy={tuning:'drop-d',tuningNotes:['C#2','A2','D3','G3','B3','E4']};
const a={instrument:'guitar'},b={instrument:'guitar'},keys={instrument:'keys'};
const first=model.migrate(a,legacy),second=model.migrate(b,legacy);
assert.deepStrictEqual(model.notes(first),legacy.tuningNotes);
assert.deepStrictEqual(model.notes(second),legacy.tuningNotes);
assert.notStrictEqual(first.notes,second.notes);
first.notes[0]='D2'; assert.equal(second.notes[0],'C#2'); assert.equal(legacy.tuningNotes[0],'C#2');
assert.equal(model.migrate(keys,legacy),null);
assert.deepStrictEqual(model.notes(model.standard()),['E2','A2','D3','G3','B3','E4']);
const persisted={instrument:'guitar',trackTuning:second};
assert.deepStrictEqual(model.migrate(persisted,legacy),second);
assert.deepStrictEqual(model.migrate({instrument:'guitar',trackTuning:{id:'unknown',notes:null}},legacy),model.standard());
assert.deepStrictEqual(model.migrate({instrument:'guitar',trackTuning:{id:'drop-d',notes:['bad']}},legacy),model.standard());
assert.deepStrictEqual(model.migrate({instrument:'guitar',trackTuning:null},legacy),model.standard());
assert.deepStrictEqual(model.legacy({tuning:'unknown',tuningNotes:['bad']}),model.standard());
const p=model.notes({id:'drop-d',notes:null});p[0]='E2';assert.equal(model.notes({id:'drop-d',notes:null})[0],'D2');
assert.throws(()=>createTuningModel([]),/standard/);
console.log('Модель строя: миграция, новый стандарт, валидация и изоляция — OK (в приложение ещё не подключена)');
