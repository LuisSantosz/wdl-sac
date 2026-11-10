import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCrmRows,parseCrmCells,worksheetReference} from '../dist/crm.mjs';
const headers=['Status','Código','Solicitante','Contato Cliente II','Data Criação','Situação','Observação'];
const row=['Aberto','42','Cliente Teste','11999999999','10/11/2026','Defeito','Conferir'];
test('preserva compatibilidade com as sete colunas originais',()=>{
  assert.equal(parseCrmCells([...headers,...row])[0].crmCodigo,'000042');
});
test('mapeia colunas reordenadas e campos opcionais ausentes',()=>{
  const result=parseCrmRows([['Observação','Solicitante','Data Criação','Código'],['Conferir','Teste','10/11/26',42]])[0];
  assert.equal(result.crmCodigo,'000042');assert.equal(result.cliente,'Teste');assert.equal(result.contato,'');
});
test('rejeita duplicatas, datas inválidas e tabelas sem chamados',()=>{
  assert.throws(()=>parseCrmRows([headers,row,row]),/mais de uma vez/);
  assert.throws(()=>parseCrmRows([headers,[...row.slice(0,4),'31/02/26',...row.slice(5)]]),/Data inválida/);
  assert.throws(()=>parseCrmRows([headers]),/não contém chamados/);
});
test('identifica referência a folha externa sem inventar células',()=>{
  const text='<html><link id="shLink" href="base_arquivos/sheet001.htm"><frameset><frame src="base_arquivos/sheet001.htm"></frameset></html>';
  assert.equal(worksheetReference(text),'base_arquivos/sheet001.htm');
  assert.equal(worksheetReference('<table></table>'),null);
});
