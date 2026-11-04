const normalize = value => value.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase();
export function groupRows(cells, tolerance) {
  const rows = [];
  for (const cell of cells.sort((a,b) => b.y - a.y)) {
    const row = rows.at(-1);
    if (row && row[0].y - cell.y <= tolerance) row.push(cell);
    else rows.push([cell]);
  }
  return rows.map(row => row.sort((a,b) => a.x - b.x));
}

const lineText = row => row.map(cell => cell.text).join(' ');
const formatDate = text => text.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/)?.slice(1).reverse().join('-') ?? '';
function orderFromNotes(rows, ocr = false) {
  const index = rows.findIndex(row => /COMPLEMENTARES/.test(normalize(lineText(row))));
  if (index < 0) return '';
  const right = rows[index].find(cell => /RESERVADO/.test(normalize(cell.text)))?.x ?? Infinity;
  const notes = rows.slice(index,index + 16).map(row => lineText(row.filter(cell => cell.x < right))).join(' ');
  const match = notes.match(ocr ? /\bS+[0O]\s*(\d+)\b/i : /\bS0\s*(\d+)\b/i);
  return match ? 'S0' + match[1] : '';
}
export function parseInvoice(pages) {
  const lines = pages.flat().map(row => row.map(cell => cell.text).join(' '));
  const text = lines.join('\n');
  const plain = normalize(text);
  const inline = (label, value) => plain.match(new RegExp(label + '[ \\t]*[:#-]?[ \\t\\n]*(' + value + ')'))?.[1] ?? '';
  const fields = {
    nf: inline('(?:N(?:[º°O.]|UMERO)?[ \\t]*(?:DA[ \\t]+)?N[. -]?F(?:-E)?|NOTA FISCAL(?: ELETRONICA)?|N[º°.]?)(?=[ \\t:#-]*\\d|[ \\t]*\\n\\d)', '\\d[\\d.]{0,11}(?=\\s|$)').replaceAll('.', ''),
    pedido: orderFromNotes(pages.flat())
  };
  const sections = pages.flat();
  function below(pattern, start = 0) {
    for (let i = start; i < sections.length - 1; i++) {
      const row = sections[i];
      const index = row.findIndex(c => pattern.test(normalize(c.text)));
      if (index < 0) continue;
      const x = row[index].x - 3;
      const right = (row[index + 1]?.x ?? Infinity) - 3;
      const value = sections[i + 1].filter(c => c.x >= x && c.x < right).map(c => c.text).join(' ').trim();
      if (value) return value;
    }
    return '';
  }
  const recipient = sections.findIndex(row => row.some(c => /DESTINATARIO\s*[/–-]\s*REMETENTE/.test(normalize(c.text))));
  if (recipient >= 0) {
    fields.cliente = below(/^NOME\s*[/–-]\s*RAZAO SOCIAL$/, recipient);
    fields.endereco = below(/^ENDERECO$/, recipient);
  }
  const date = inline('DATA (?:D[EA] )?(?:EMISSAO|FATURAMENTO)', '\\d{2}/\\d{2}/\\d{4}') || below(/^DATA (?:D[EA] )?(?:EMISSAO|FATURAMENTO)$/);
  const d = date.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (d) fields.data = [d[3], d[2], d[1]].join('-');
  const items = [];
  for (const page of pages) {
    let columns;
    for (const row of page) {
      const line = normalize(row.map(c => c.text).join(' '));
      if (/DADOS ADICIONAIS|INFORMACOES COMPLEMENTARES|RESERVADO AO FISCO|CALCULO DO ISSQN/.test(line)) columns = undefined;
      const desc = row.findIndex(c => /DESCRICAO (?:DOS? )?(?:PRODUTO|SERVICO)/.test(normalize(c.text)));
      if (desc > 0) {
        columns = {start:row[desc].x - 6, end:(row[desc + 1]?.x ?? Infinity) - 3};
        continue;
      }
      if (!columns) continue;
      const name = row.filter(c => c.x >= columns.start && c.x < columns.end).map(c => c.text).join(' ').trim();
      if (!name) continue;
      const code = row.filter(c => c.x < columns.start).map(c => c.text).join(' ').trim();
      const fiscal = row.some(c => c.x >= columns.end && /^\d{3,8}$/.test(c.text));
      if (code && fiscal) items.push(code + ' — ' + name);
      else if (!code && items.length && row.every(c => c.x >= columns.start && c.x < columns.end)) items[items.length - 1] += ' ' + name;
    }
  }
  return {fields, items};
}

export function parseScannedInvoice(words, width) {
  const rows = groupRows(words, width * 0.005);
  const lines = rows.map(lineText);
  const recipient = lines.findIndex(line => /DESTINAT.{2,5}.*REMETENTE/.test(normalize(line)));
  const nameLabel = lines.findIndex((line, index) => index > recipient && /NOME.*SOCIAL/.test(normalize(line)));
  const recipientValue = rows[nameLabel + 1] ?? [];
  const address = rows.slice(nameLabel + 2, nameLabel + 7).find(row =>
    /\b\d{5}-\d{3}\b/.test(lineText(row)) && row.some(cell => cell.x < width * 0.12));
  const districtX = rows.slice(nameLabel + 2, nameLabel + 7).flat().find(cell => normalize(cell.text) === 'BAIRRO')?.x;
  const fields = {
    nf: lines.slice(0,25).join(' ').match(/\b(\d{3}[.,]\d{3}[.,]\d{3})\b/)?.[1].replace(/[.,]/g,'') ?? '',
    pedido: orderFromNotes(rows,true),
    cliente: nameLabel >= 0 ? lineText(recipientValue.filter(cell => cell.x < width * 0.65)) : '',
    endereco: address && districtX ? lineText(address.filter(cell => cell.x < districtX - width * 0.01)) : '',
    data: nameLabel >= 0 ? formatDate(lineText(recipientValue)) : ''
  };
  const items = [];
  const products = lines.findIndex(line => /PRODUTOS.*SERVI[CÇ]OS.*(?:CFOP|QTD)/.test(normalize(line)));
  const notes = lines.findIndex(line => /COMPLEMENTARES|DADOS ADICIONAIS/.test(normalize(line)));
  for (let i = products + 1; products >= 0 && i < (notes < 0 ? rows.length : notes); i++) {
    const row = rows[i];
    const fiscal = row.findIndex(cell => /^\d{8}$/.test(cell.text));
    if (fiscal < 2 || !/^[A-Z0-9-]*\d[A-Z0-9-]*$/i.test(row[0].text)) continue;
    const details = row.slice(1,fiscal);
    const continuation = (rows[i + 1] ?? []).filter(cell => cell.x >= details[0].x - width * 0.008 && cell.x < row[fiscal].x - width * 0.008);
    const nextHasCode = rows[i + 1]?.some(cell => cell.x < details[0].x - width * 0.02);
    items.push(row[0].text + ' — ' + lineText(nextHasCode ? details : details.concat(continuation)));
  }
  return {fields, items};
}

export async function readInvoice(file, onScan = () => {}) {
  const pdfjs = await import('./pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('./pdf.worker.min.mjs', import.meta.url).href;
  const loading = pdfjs.getDocument({data: await file.arrayBuffer(), isEvalSupported:false});
  let scan;
  try {
    const pdf = await loading.promise;
    const pages = [];
    const scans = [];
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index);
      const {items} = await page.getTextContent();
      const cells = items.filter(item => item.str?.trim()).map(item => ({x:item.transform[4], y:item.transform[5], text:item.str.trim()}));
      if (cells.map(cell => cell.text).join('').length >= 40) {
        pages.push(groupRows(cells,2));
      } else {
        onScan(index,pdf.numPages);
        if (!scan) scan = await (await import('./scan.mjs')).startScan();
        scans.push(await scan.read(page));
      }
    }
    const result = parseInvoice(pages);
    for (const extracted of scans) {
      for (const [key,value] of Object.entries(extracted.fields)) {
        if (value && !result.fields[key]) result.fields[key] = value;
      }
      result.items.push(...extracted.items);
    }
    return {...result, usedOcr:scans.length > 0};
  } finally {
    try { await scan?.close(); } finally { await loading.destroy(); }
  }
}
