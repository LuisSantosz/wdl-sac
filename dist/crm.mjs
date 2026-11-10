const normalize = value => String(value ?? '').normalize('NFD').replace(/\p{M}/gu,'').replace(/[^a-z0-9]/gi,'').toLowerCase();
const aliases = {
  crmStatus:['status'],crmCodigo:['codigo','codigodasolicitacao','codigodochamado'],
  cliente:['solicitante','cliente','nomedocliente'],contato:['contatoclienteii','contato','telefone','contatocliente'],
  crmCriacao:['datacriacao','datadecriacao'],crmSituacao:['situacao','motivo'],crmObservacao:['observacao','observacoes','descricao']
};
function textValue(value) {
  if (value instanceof Date) return [String(value.getUTCDate()).padStart(2,'0'),String(value.getUTCMonth()+1).padStart(2,'0'),value.getUTCFullYear()].join('/');
  if (value && typeof value === 'object') return textValue(value.result ?? value.text ?? value.richText?.map(part=>part.text).join('') ?? '');
  return String(value ?? '').trim();
}
export function parseCrmRows(rows) {
  let header=-1,columns;
  for(let i=0;i<Math.min(30,rows.length);i++) {
    const labels=rows[i].map(normalize),map={};
    for(const [key,names] of Object.entries(aliases)) map[key]=labels.findIndex(label=>names.includes(label));
    if(map.crmCodigo>=0 && map.cliente>=0 && map.crmCriacao>=0){header=i;columns=map;break;}
  }
  if(header<0) throw new Error('Não encontrei as colunas Código, Solicitante/Cliente e Data Criação. Use a exportação de chamados do Star1CRM.');
  const calls=[],codes=new Set();
  for(const row of rows.slice(header+1)) {
    if(row.every(value=>!textValue(value)))continue;
    const call=Object.fromEntries(Object.entries(columns).map(([key,index])=>[key,index<0?'':textValue(row[index])]));
    const rawCode=call.crmCodigo;
    if(!/^\d{1,16}$/.test(rawCode) || !call.cliente) throw new Error('Há um chamado sem código ou cliente válido.');
    call.crmCodigo=rawCode.padStart(6,'0');
    if(codes.has(call.crmCodigo))throw new Error('O código '+call.crmCodigo+' aparece mais de uma vez na planilha.');
    const date=call.crmCriacao.match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})(?:\s+\d{2}:\d{2}(?::\d{2})?)?$/);
    if(!date)throw new Error('Data de criação inválida no chamado '+call.crmCodigo+'.');
    const year=date[3].length===2?2000+Number(date[3]):Number(date[3]);
    call.createdAt=Date.UTC(year,Number(date[2])-1,Number(date[1]),12);
    const value=new Date(call.createdAt);
    if(value.getUTCFullYear()!==year || value.getUTCMonth()!==Number(date[2])-1 || value.getUTCDate()!==Number(date[1]))throw new Error('Data inválida no chamado '+call.crmCodigo+'.');
    codes.add(call.crmCodigo);calls.push(call);
  }
  if(!calls.length)throw new Error('A planilha não contém chamados para importar.');
  if(calls.length>1000)throw new Error('Importe até 1.000 chamados por arquivo.');
  return calls;
}
export function parseCrmCells(cells) {
  if(cells.length%7)throw new Error('A tabela está incompleta. Selecione o arquivo original do CRM ou salve como .xlsx.');
  return parseCrmRows(Array.from({length:cells.length/7},(_,i)=>cells.slice(i*7,i*7+7)));
}
export function worksheetReference(text) {
  return text.match(/(?:href|src)\s*=\s*["']([^"']*sheet\d+\.html?)["']/i)?.[1] ?? null;
}
function decode(buffer) {
  try{return new TextDecoder('utf-8',{fatal:true}).decode(buffer);}catch{return new TextDecoder('windows-1252').decode(buffer);}
}
function missingSheet(reference) {
  const error=new Error('Este arquivo é apenas a página de abertura do Excel e não contém os chamados. Falta '+reference+'. Selecione a pasta de apoio ou abra no Excel e salve como Pasta de Trabalho do Excel (.xlsx).');
  error.code='CRM_MISSING_SHEET';return error;
}
let engine;
async function excelEngine() {
  if(!engine)engine=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src=new URL('./exceljs.min.js',import.meta.url).href;
    script.onload=()=>resolve(globalThis.ExcelJS);script.onerror=()=>{engine=null;script.remove();reject(new Error('Não foi possível carregar o leitor de Excel. Recarregue a página.'));};document.head.append(script);
  });
  return engine;
}
async function htmlCalls(text,files) {
  const doc=new DOMParser().parseFromString(text,'text/html');
  const cells=[...doc.querySelectorAll('table td,table th')].map(cell=>cell.textContent.trim());
  const reference=worksheetReference(text);
  if(!cells.length && reference) {
    const name=reference.split(/[\\/]/).at(-1).toLowerCase();
    const sheet=files.find(file=>file.name.toLowerCase()===name);
    if(!sheet)throw missingSheet(reference);
    if(sheet.size>5*1024*1024)throw new Error('Use arquivos de até 5 MB.');
    return htmlCalls(decode(await sheet.arrayBuffer()),[]);
  }
  if(!cells.length)throw new Error('Não há uma tabela de chamados neste arquivo. Use o arquivo original do CRM ou uma planilha .xlsx.');
  const rows=[...doc.querySelectorAll('table tr')].map(row=>[...row.children].filter(cell=>['TD','TH'].includes(cell.tagName)).map(cell=>cell.textContent.trim()));
  try{return parseCrmRows(rows);}catch(error){try{return parseCrmCells(cells);}catch{throw error;}}
}
export async function readCrm(file,files=[]) {
  if(file.size>5*1024*1024)throw new Error('Use uma exportação de até 5 MB.');
  const buffer=await file.arrayBuffer(),bytes=new Uint8Array(buffer);
  if(bytes[0]===0x50 && bytes[1]===0x4b) {
    const ExcelJS=await excelEngine(),workbook=new ExcelJS.Workbook();
    try{await workbook.xlsx.load(buffer);}catch{throw new Error('Não foi possível abrir o Excel. Abra o arquivo no Excel e salve novamente como .xlsx.');}
    for(const sheet of workbook.worksheets){
      if(sheet.rowCount>1030 || sheet.columnCount>100)throw new Error('Use a exportação de chamados com até 1.000 linhas e 100 colunas.');
      const rows=[];sheet.eachRow({includeEmpty:true},row=>rows.push(Array.from({length:Math.min(sheet.columnCount,100)},(_,i)=>row.getCell(i+1).value)));
      if(rows.length>1030)throw new Error('Importe até 1.000 chamados por arquivo.');
      try{return parseCrmRows(rows);}catch(error){if(sheet===workbook.worksheets.at(-1))throw error;}
    }
    throw new Error('O Excel não contém uma aba de chamados.');
  }
  if(bytes[0]===0xd0 && bytes[1]===0xcf)throw new Error('Este arquivo usa o Excel binário antigo. Abra no Excel e salve como .xlsx para importar.');
  return htmlCalls(decode(buffer),files);
}
export async function readCrmSelection(input) {
  const files=[...input];
  if(!files.length)throw new Error('Selecione um arquivo.');
  if(files.filter(file=>/\.xlsx?$/i.test(file.name)).length>1)throw new Error('Selecione apenas uma planilha principal por vez, junto dos seus arquivos de apoio.');
  const first=files.find(file=>/\.xlsx?$/i.test(file.name)) ?? files.find(file=>/sheet\d+\.html?$/i.test(file.name)) ?? files.find(file=>/\.html?$/i.test(file.name));
  if(!first)throw new Error('Selecione a planilha .xlsx, o .xls original ou a pasta com sheet001.htm.');
  return readCrm(first,files);
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
