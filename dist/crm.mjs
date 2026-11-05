const normalize = value => value.normalize('NFD').replace(/\p{M}/gu,'').replace(/\s+/g,' ').trim().toLowerCase();
export function parseCrmCells(cells) {
  const labels = ['status','codigo','solicitante','contato cliente ii','data criacao','situacao','observacao'];
  if (cells.length < 14 || labels.some((label,index) => normalize(cells[index]) !== label) || cells.length % 7) {
    throw new Error('Use a exportação de chamados do Star1CRM com as sete colunas originais.');
  }
  const calls = [], codes = new Set();
  for (let i = 7; i < cells.length; i += 7) {
    const [crmStatus,rawCode,cliente,contato,crmCriacao,crmSituacao,crmObservacao] = cells.slice(i,i+7).map(value => value.trim());
    if (!/^\d{1,16}$/.test(rawCode) || !cliente) throw new Error('Há um chamado sem código ou cliente válido.');
    const crmCodigo = rawCode.padStart(6,'0');
    if (codes.has(crmCodigo)) throw new Error('O código '+crmCodigo+' aparece mais de uma vez na planilha.');
    const date = crmCriacao.match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
    if (!date) throw new Error('Data de criação inválida no chamado '+crmCodigo+'.');
    const year = date[3].length === 2 ? 2000 + Number(date[3]) : Number(date[3]);
    const createdAt = Date.UTC(year,Number(date[2])-1,Number(date[1]),12);
    const value = new Date(createdAt);
    if (value.getUTCFullYear() !== year || value.getUTCMonth() !== Number(date[2])-1 || value.getUTCDate() !== Number(date[1])) throw new Error('Data inválida no chamado '+crmCodigo+'.');
    codes.add(crmCodigo);
    calls.push({crmCodigo,cliente,contato,crmStatus,crmCriacao,crmSituacao,crmObservacao,createdAt});
  }
  if (calls.length > 1000) throw new Error('Importe até 1.000 chamados por arquivo.');
  return calls;
}
export async function readCrm(file) {
  if (file.size > 5*1024*1024) throw new Error('Use uma exportação de até 5 MB.');
  const buffer = await file.arrayBuffer();
  let text;
  try { text = new TextDecoder('utf-8',{fatal:true}).decode(buffer); }
  catch { text = new TextDecoder('windows-1252').decode(buffer); }
  if (!/<table[\s>]/i.test(text)) throw new Error('Esta importação aceita o arquivo .xls em formato de tabela gerado pelo Star1CRM.');
  const document = new DOMParser().parseFromString(text,'text/html');
  return parseCrmCells([...document.querySelectorAll('td,th')].map(cell => cell.textContent.trim()));
}
export function whatsappContacts(contact) {
  return String(contact ?? '').split(/[;\/\n,]+/).flatMap(value => {
    let number = value.replace(/\D/g,'');
    if (number.startsWith('0055')) number = number.slice(2);
    if (/^0\d{10,11}$/.test(number)) number = number.slice(1);
    if (/^\d{10,11}$/.test(number)) number = '55'+number;
    return /^55[1-9]\d{9,10}$/.test(number) ? [{number,label:value.trim()}] : [];
  });
}
export function whatsappUrl(record,number) {
  const code = record.crmCodigo ? ' '+record.crmCodigo : '';
  return 'https://wa.me/'+number+'?text='+encodeURIComponent('Olá, '+record.cliente+'! Aqui é o SAC Edel White. Entramos em contato sobre a sua solicitação'+code+'.');
}
