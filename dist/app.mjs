import {showMessages} from './portal-messages.mjs';
import {cloudConfig} from './cloud-config.mjs';
const useCloud = true;
import {readInvoice} from './invoice.mjs';
const $ = selector => document.querySelector(selector);
const statuses = {nova:'Nova', andamento:'Em andamento', concluida:'Concluída'};
const editor = $('#editor'), form = $('#form'), whole = $('#whole'), pdf = $('#pdf');
const fields = ['cliente','vendedor','nf','pedido','data','endereco','problema','descricao','status','novaNF','rastreio','transportadora','entrega'];
let cloud;
function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}
let records = [], current, attachment, uploadRun = 0, reading = false, saving = false;
function render() {
  const query = $('#search').value.trim().toLocaleLowerCase('pt-BR');
  const metrics = $('#metrics'), board = $('#columns');
  metrics.replaceChildren();
  board.replaceChildren();
  for (const [key,label] of [['total','Total de solicitações'],...Object.entries(statuses)]) {
    const count = key === 'total' ? records.length : records.filter(record => record.status === key).length;
    const metric = el('article','metric '+key);
    const title = el('span');
    title.append(el('i','dot'), label);
    metric.append(title,el('strong','',count));
    metrics.append(metric);
    if (key === 'total') continue;
    const group = el('section','column '+key), heading = el('h3','column-head');
    const list = records.filter(record => record.status === key && [record.cliente,record.vendedor,record.nf].some(value => value.toLocaleLowerCase('pt-BR').includes(query)));
    heading.append(el('span','',label),el('span','',list.length));
    group.append(heading);
    if (!list.length) group.append(el('p','empty',query ? 'Nenhum resultado nesta etapa.' : 'Nenhuma solicitação nesta etapa.'));
    for (const record of list) {
      const card = el('button','card');
      card.type = 'button';
      card.append(el('strong','',record.cliente),el('small','',record.vendedor+' · NF '+record.nf),el('span','tag',record.problema));
      card.addEventListener('click',() => open(record));
      group.append(card);
    }
    board.append(group);
  }
}
function addItem(name = '', selected = false) {
  const row = el('div','item');
  const check = el('input');
  check.type = 'checkbox';
  check.checked = selected;
  check.disabled = whole.checked;
  check.setAttribute('aria-label','Marcar item afetado');
  const input = el('input');
  input.type = 'text';
  input.placeholder = 'Código e descrição do produto';
  input.setAttribute('aria-label',input.placeholder);
  input.value = name;
  const remove = el('button','secondary','×');
  remove.type = 'button';
  remove.setAttribute('aria-label','Remover item');
  remove.onclick = () => row.remove();
  row.append(check,input,remove);
  $('#items').append(row);
  return input;
}
function setPdfInfo(message) {
  $('#pdf-info').textContent = message;
  $('#open-pdf').hidden = !attachment && !current?.pdfPath;
}
function open(record) {
  current = record;
  attachment = record?.pdf;
  form.reset();
  $('#items').replaceChildren();
  $('#history').replaceChildren();
  $('#tracking').hidden = !record;
  $('#delete').hidden = !record;
  $('#copy-status').textContent = '';
  $('#form-title').textContent = record ? 'Solicitação · NF '+record.nf : 'Nova solicitação';
  $('#error').textContent = '';
  if (record) {
    for (const field of fields) form.elements[field].value = record[field] ?? '';
    whole.checked = record.inteira;
    for (const item of record.items) addItem(item.name,item.selected);
    for (const entry of record.history.slice().reverse()) {
      $('#history').append(el('li','',new Date(entry.at).toLocaleString('pt-BR')+' · '+entry.text));
    }
  }
  setPdfInfo(attachment?.name ?? record?.pdfName ?? '');
  editor.showModal();
  $('.form-body').scrollTop = 0;
  openPortal(record);
}
function syncBusy() {
  for (const selector of ['#save','#delete','#copy']) $(selector).disabled = saving || reading;
}
const deleteDialog = $('#delete-dialog');
$('#delete').onclick = () => {
  if (!current || saving || reading) return;
  $('#delete-description').textContent = 'A solicitação da NF '+current.nf+' e o PDF anexado serão removidos do SAC.';
  $('#delete-error').textContent = '';
  deleteDialog.showModal();
};
deleteDialog.addEventListener('cancel',event => { if (saving) event.preventDefault(); });
$('#confirm-delete').onclick = async () => {
  if (!current || saving) return;
  const id = current.id;
  saving = true;
  syncBusy();
  $('#confirm-delete').disabled = $('#keep').disabled = true;
  $('#delete-error').textContent = '';
  try {
    await cloud.remove(current);
    records = records.filter(record => record.id !== id);
    render();
    deleteDialog.close();
    editor.close();
    $('#new').focus();
  } catch {
    $('#delete-error').textContent = 'Não foi possível excluir a solicitação. Tente novamente.';
  } finally {
    $('#confirm-delete').disabled = $('#keep').disabled = false;
    saving = false;
    syncBusy();
  }
};
const formatDeliveryDate = value => value ? value.split('-').reverse().join('/') : '';
$('#copy').onclick = async () => {
  const status = $('#copy-status');
  const value = name => form.elements[name].value.trim();
  const lines = [
    'Cliente, '+value('cliente')+'! Como está?',
    'Segue as informações da sua solicitação SAC',
    'Número da NF: '+(value('novaNF') || value('nf') || 'Não informado'),
    'Transportadora: '+(value('transportadora') || 'Não informada'),
    value('rastreio') && 'Rastreio: '+value('rastreio'),
    'Data de entrega: '+(formatDeliveryDate(value('entrega')) || 'Não informada')
  ];
  const text = lines.filter(Boolean).join('\n');
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const buffer = el('textarea','clipboard-buffer');
      buffer.value = text;
      buffer.readOnly = true;
      editor.append(buffer);
      try {
        buffer.select();
        if (!document.execCommand('copy')) throw new Error('Clipboard indisponível');
      } finally {
        buffer.remove();
        $('#copy').focus();
      }
    }
    status.textContent = 'Dados copiados.';
  } catch {
    status.textContent = 'O navegador bloqueou a cópia.';
  }
};

$('#new').onclick = () => open();
const search = $('#search');
search.oninput = render;
search.form.onsubmit = event => {
  event.preventDefault();
  render();
};
search.form.onreset = event => {
  event.preventDefault();
  search.value = '';
  render();
  search.focus();
};
for (const button of form.querySelectorAll('.close')) button.onclick = () => { if (!saving) editor.close(); };
editor.addEventListener('cancel',event => { if (saving) event.preventDefault(); });
editor.addEventListener('close',() => { uploadRun++; reading = false; syncBusy(); });
whole.onchange = () => {
  for (const check of $('#items').querySelectorAll('input[type=checkbox]')) check.disabled = whole.checked;
};
$('#add').onclick = () => addItem().focus();
$('#open-pdf').onclick = async () => {
  let file = attachment;
  const name = file?.name ?? current?.pdfName;
  if (!file && cloud && current?.pdfPath) {
    const button = $('#open-pdf');
    button.disabled = true;
    try { file = await cloud.download(current); }
    catch { setPdfInfo('Não foi possível baixar o PDF.'); return; }
    finally { button.disabled = false; }
  }
  if (!file) return;
  const url = URL.createObjectURL(file);
  const link = el('a');
  link.href = url;
  link.download = name || 'nota-fiscal.pdf';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url),30000);
};
pdf.onchange = async () => {
  const file = pdf.files[0];
  if (!file) return;
  const run = ++uploadRun;
  if (!/\.pdf$/i.test(file.name) || file.size > 20 * 1024 * 1024) {
    reading = false;
    syncBusy();
    setPdfInfo('Selecione um arquivo PDF de até 20 MB.');
    return;
  }
  reading = true;
  syncBusy();
  setPdfInfo('Lendo '+file.name+'…');
  try {
    if (!(await file.slice(0,1024).text()).includes('%PDF-')) throw new TypeError('Arquivo inválido');
    if (run !== uploadRun) return;
    attachment = file;
    const result = await readInvoice(file,(page,total) => {
      if (run === uploadRun) setPdfInfo('Reconhecendo texto da imagem · página '+page+' de '+total+'…');
    });
    if (run !== uploadRun) return;
    let count = 0;
    for (const [field,value] of Object.entries(result.fields)) {
      if (value && !form.elements[field].value) {
        form.elements[field].value = value;
        if (form.elements[field].value) count++;
      }
    }
    const existing = new Set([...$('#items').querySelectorAll('input[type=text]')].map(input => input.value.trim()));
    for (const name of new Set(result.items)) if (!existing.has(name)) addItem(name);
    setPdfInfo(file.name+' · '+(count || result.items.length ? (result.usedOcr ? 'Leitura por imagem. Confira os dados e os itens com a nota original.' : 'Revise os dados sugeridos e complete os campos restantes.') : 'Não foi possível identificar os campos. Preencha os dados manualmente.'));
  } catch {
    if (run === uploadRun) setPdfInfo('Não foi possível ler este PDF. Preencha os dados manualmente.');
  } finally {
    if (run === uploadRun) { reading = false; syncBusy(); }
  }
};
form.onsubmit = async event => {
  event.preventDefault();
  if (reading || saving) return;
  const error = $('#error');
  error.textContent = '';
  const data = Object.fromEntries(fields.map(field => [field,form.elements[field].value.trim()]));
  const items = [...$('#items').children].map(row => ({
    name:row.querySelector('input[type=text]').value.trim(),
    selected:row.querySelector('input[type=checkbox]').checked
  })).filter(item => item.name);
  if (!data.cliente || !data.vendedor || !data.nf) { error.textContent = 'Informe cliente, vendedor e número da NF.'; return; }
  if (!whole.checked && !items.some(item => item.selected)) { error.textContent = 'Selecione ao menos um item afetado ou marque a NF inteira.'; return; }
  const at = Date.now();
  const changes = [];
  if (!current) changes.push('Solicitação cadastrada.');
  else {
    if (current.status !== data.status) changes.push('Status alterado para '+statuses[data.status]+'.');
    for (const [field,label] of [['novaNF','Nova NF'],['rastreio','Rastreio'],['transportadora','Transportadora'],['entrega','Data de entrega']]) {
      if ((current[field] ?? '') !== data[field]) {
        const value = field === 'entrega' ? formatDeliveryDate(data[field]) : data[field];
        changes.push(label+' — '+(value || 'Removido'));
      }
    }
    const note = form.elements.nota.value.trim();
    if (note) changes.push(note);
  }
  const record = {...data,id:current?.id ?? Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2,'0')).join(''),createdAt:current?.createdAt ?? at,inteira:whole.checked,items,pdf:attachment,history:[...(current?.history ?? []),...changes.map(text => ({at,text}))]};
  saving = true;
  syncBusy();
  try {
    await cloud.save(record,current);
    await refresh();
    editor.close();
  } catch {
    error.textContent = 'Não foi possível concluir a operação. Confira a conexão e recarregue antes de tentar novamente.';
  } finally { saving = false; syncBusy(); }
};
function theme(value) {
  document.documentElement.dataset.theme = value;
  $('#theme').checked = value === 'dark';
}
try { theme(localStorage.getItem('wdl-sac-theme') || 'light'); } catch { theme('light'); }
$('#theme').onchange = event => {
  const value = event.currentTarget.checked ? 'dark' : 'light';
  theme(value);
  try { localStorage.setItem('wdl-sac-theme',value); } catch {}
};
async function refresh() {
  records = (await cloud.list()).sort((a,b) => b.createdAt - a.createdAt);
  render();
}
render();
{
  const login = $('#login-dialog'), loginForm = $('#login-form'), error = $('#login-error');
  const dashboard = $('main');
  dashboard.hidden = true;
  login.addEventListener('cancel',event => event.preventDefault());
  login.showModal();
  if (!cloudConfig.url || !cloudConfig.publishableKey) {
    $('#login-submit').disabled = true;
    error.textContent = 'Configure a URL e a chave pública do Supabase para usar o SAC.';
  }
  loginForm.onsubmit = async event => {
    event.preventDefault();
    if (!cloud) return;
    const button = $('#login-submit');
    button.disabled = true;
    error.textContent = '';
    try {
      await cloud.login(loginForm.elements.email.value,loginForm.elements.password.value);
      loginForm.reset();
    } catch { error.textContent = 'Não foi possível entrar. Confira o e-mail e a senha.'; }
    finally { button.disabled = false; }
  };
  if (cloudConfig.url && cloudConfig.publishableKey) import('./cloud-store.mjs').then(({connect}) => {
    cloud = connect(cloudConfig);
    cloud.observe(async user => {
      dashboard.hidden = true;
      $('#logout').hidden = true;
      records = [];
      render();
      if (!login.open) login.showModal();
      if (!user) return;
      try {
        await refresh();
        $('.foot').textContent = 'WDL SAC · Dados compartilhados do SAC';
        error.textContent = '';
        dashboard.hidden = false;
        $('#logout').hidden = false;
        login.close();
      } catch {
        await cloud.logout();
        error.textContent = 'Não foi possível acessar o SAC. Confira a conexão ou solicite a liberação da conta.';
      }
    });
    $('#logout').onclick = () => cloud.logout().catch(() => {
      $('.foot').textContent = 'Não foi possível sair. Tente novamente.';
    });
  }).catch(() => { error.textContent = 'Não foi possível conectar ao armazenamento do SAC.'; });
}

const clock = $('#clock');
const saoPauloTime = new Intl.DateTimeFormat('pt-BR', {
  timeZone:'America/Sao_Paulo', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23'
});
function updateClock() {
  const now = new Date();
  clock.dateTime = now.toISOString();
  clock.textContent = saoPauloTime.format(now);
}
updateClock();
setInterval(updateClock,1000);

const portalSection = $('#staff-portal');
const portalLink = $('#portal-link');
const portalReply = $('#portal-reply');
const portalStatus = $('#portal-status');
const portalControls = [...portalSection.querySelectorAll('button')];
let portalView = 0;

function showPortal(data) {
  const active = Boolean(data.link?.ativo);
  portalLink.value = active ? new URL('acompanhar.html#'+data.link.token,location.href).href : '';
  for (const id of ['portal-link-label','portal-copy','portal-revoke']) $('#'+id).hidden = !active;
  $('#portal-create').hidden = active;
  showMessages($('#portal-messages'),data.mensagens);
}

function openPortal(record) {
  portalView++;
  portalSection.hidden = !record;
  portalReply.value = '';
  portalStatus.textContent = '';
  showPortal({mensagens:[]});
  if (record) runPortal();
}

async function runPortal(action, message = '') {
  const id = current?.id;
  if (!id) return;
  const view = portalView;
  const isCurrent = () => view === portalView && editor.open;
  portalControls.forEach(button => {button.disabled = true;});
  portalReply.disabled = true;
  portalStatus.textContent = 'Carregando…';
  try {
    if (action) await action(id);
    if (isCurrent() && message === 'Resposta enviada.') portalReply.value = '';
    const data = await cloud.portal(id);
    if (isCurrent()) {
      showPortal(data);
      portalStatus.textContent = message;
    }
  } catch {
    if (isCurrent()) portalStatus.textContent = 'Não foi possível concluir. Atualize a conversa antes de tentar novamente.';
  } finally {
    if (isCurrent()) {
      portalControls.forEach(button => {button.disabled = false;});
      portalReply.disabled = false;
    }
  }
}

$('#portal-create').onclick = () => runPortal(id => cloud.createPortal(id),'Link gerado.');
$('#portal-revoke').onclick = () => runPortal(id => cloud.revokePortal(id),'Link revogado.');
$('#portal-refresh').onclick = () => runPortal();
$('#portal-copy').onclick = async () => {
  try {
    await navigator.clipboard.writeText(portalLink.value);
    portalStatus.textContent = 'Link copiado.';
  } catch {
    portalLink.select();
    portalStatus.textContent = 'Copie o endereço selecionado.';
  }
};
$('#portal-send').onclick = () => {
  const message = portalReply.value.trim();
  if (!message) {
    portalStatus.textContent = 'Digite uma resposta.';
    portalReply.focus();
    return;
  }
  runPortal(id => cloud.reply(id,message),'Resposta enviada.');
};
