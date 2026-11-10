export const normalizeSearch = value => String(value ?? '').normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('pt-BR').replace(/\s+/g,' ').trim();
export function searchRecords(records,query,stages=[]) {
  const terms=normalizeSearch(query).split(' ').filter(Boolean);
  if(!terms.length)return [...records];
  return records.filter(record=>{
    const values=[record.crmCodigo,record.id,record.cliente,record.contato,record.vendedor,record.nf,record.pedido,record.endereco,record.descricao,record.crmObservacao,record.problema,record.crmSituacao,record.proximaAcao,record.proximaAcaoData,record.novaNF,record.rastreio,record.transportadora,record.entrega,stages.find(stage=>stage.id===record.status)?.nome,...(record.items ?? []).map(item=>item.name)];
    const text=normalizeSearch(values.join(' ')),compact=text.replace(/[^a-z0-9]/g,'');
    return terms.every(term=>text.includes(term) || (term.replace(/[^a-z0-9]/g,'').length>0 && compact.includes(term.replace(/[^a-z0-9]/g,''))));
  });
}
