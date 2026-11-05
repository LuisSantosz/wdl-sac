import test from 'node:test';
import assert from 'node:assert/strict';
import {saoPauloToday,validDate,deadlineInfo,reorderStages} from '../dist/case-utils.mjs';

test('usa o calendário de São Paulo na virada do dia UTC',()=>{
  assert.equal(saoPauloToday(new Date('2026-11-06T01:00:00Z')),'2026-11-05');
  assert.equal(saoPauloToday(new Date('2026-11-06T04:00:00Z')),'2026-11-06');
});
test('rejeita datas inexistentes e aceita ano bissexto',()=>{
  assert.equal(validDate('2026-02-30'),false);
  assert.equal(validDate('2026-02-29'),false);
  assert.equal(validDate('2028-02-29'),true);
  assert.equal(validDate('não é uma data'),false);
});
test('distingue atrasado, hoje, futuro, sem data e concluído',()=>{
  const today='2026-11-05';
  for(const [data,kind] of [['2026-11-04','late'],['2026-11-05','today'],['2026-11-06','scheduled'],['','none']]) {
    assert.equal(deadlineInfo({proximaAcaoData:data},today).kind,kind);
  }
  assert.equal(deadlineInfo({proximaAcaoData:'2026-11-04',proximaAcaoFeita:true},today).kind,'done');
  assert.equal(deadlineInfo({proximaAcaoData:'2026-11-04',status:'concluida'},today).kind,'done');
  assert.match(deadlineInfo({proximaAcaoData:'2026-11-02'},today).label,/3 dias/);
});
test('reordena sem remover etapas ou alterar o array original',()=>{
  const stages=[{id:'a'},{id:'b'},{id:'c'}];
  assert.deepEqual(reorderStages(stages,'c','a'),['c','a','b']);
  assert.deepEqual(stages.map(stage=>stage.id),['a','b','c']);
  assert.deepEqual(reorderStages(stages,'inexistente','a'),['a','b','c']);
});
