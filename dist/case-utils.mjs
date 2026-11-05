export function saoPauloToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const part = type => parts.find(item => item.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return false;
  const date = new Date(value+'T12:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value;
}
export const displayDate = value => validDate(value) ? value.split('-').reverse().join('/') : '';
export function deadlineInfo(record,today = saoPauloToday()) {
  const date = record.proximaAcaoData;
  if (!validDate(date)) return {kind:'none',label:'Agendar próxima ação'};
  if (record.proximaAcaoFeita || record.status === 'concluida') return {kind:'done',label:'Ação concluída · '+displayDate(date)};
  if (date < today) {
    const days = Math.round((Date.parse(today+'T12:00:00Z')-Date.parse(date+'T12:00:00Z'))/86400000);
    return {kind:'late',label:`Atrasado há ${days} ${days === 1 ? 'dia' : 'dias'} · ${displayDate(date)}`};
  }
  return {kind:date === today ? 'today' : 'scheduled',label:date === today ? 'Retorno hoje · '+displayDate(date) : 'Próxima ação · '+displayDate(date)};
}
export function reorderStages(stages,source,target) {
  const ids = stages.map(stage => stage.id);
  if (source === target || !ids.includes(source) || !ids.includes(target)) return ids;
  ids.splice(ids.indexOf(source),1);
  ids.splice(ids.indexOf(target),0,source);
  return ids;
}
