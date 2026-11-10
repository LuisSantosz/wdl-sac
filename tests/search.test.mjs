import test from 'node:test';
import assert from 'node:assert/strict';
import {searchRecords} from '../dist/search.mjs';
const records=[{id:'1',cliente:'Ângelo Ramos',crmCodigo:'009686',contato:'(11) 99999-1234',descricao:'Produto com falha elétrica',rastreio:'AP499488931BR',status:'a'},{id:'2',cliente:'Clínica Saúde',crmCodigo:'009687',status:'b'}];
test('pesquisa nomes sem acento, códigos, telefones e rastreios',()=>{
 for(const query of ['angelo','009686','11999991234','AP499488931BR','falha eletrica'])assert.equal(searchRecords(records,query)[0].id,'1');
});
test('não limita pesquisa à etapa visível e aceita vários termos',()=>{
 assert.equal(searchRecords(records,'saude 009687')[0].id,'2');
 assert.equal(searchRecords(records,'envio',[{id:'b',nome:'Aguardando envio'}])[0].id,'2');
 assert.equal(searchRecords(records,'inexistente').length,0);
 assert.equal(searchRecords(records,'').length,2);
 assert.equal(searchRecords(records,'!!!').length,0);
});
