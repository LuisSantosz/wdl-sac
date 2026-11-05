import {buildStages,baseStages} from './stages.mjs';
import {readCrm,whatsappContacts,whatsappUrl} from './crm.mjs';
import {showMessages} from './portal-messages.mjs';
import {cloudConfig} from './cloud-config.mjs';
const useCloud = true;
import {readInvoice} from './invoice.mjs';
const $ = selector => document.querySelector(selector);
let stages = buildStages(baseStages);
let statuses = Object.fromEntries(stages.map(stage => [stage.id,stage.nome]));
const editor = $('#editor'), form = $('#form'), whole = $('#whole'), pdf = $('#pdf');
const fields = ['cliente','vendedor','nf','pedido','data','endereco','problema','descricao','status','novaNF','rastreio','transportadora','entrega','contato'];
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
  for (const stage of [{id:'total',nome:'Total de solicitações',cor:'total'},...stages]) {
    const {id:key,nome:label,cor} = stage;
    const count = key === 'total' ? records.length : records.filter(record => record.status === key).length;
    const metric = el('article','metric '+cor);
    const title = el('span');
    title.append(el('i','dot'), label);
    metric.append(title,el('strong','',count));
    metrics.append(metric);
    if (key === 'total') continue;
    const group = el('section','column '+cor), heading = el('h3','column-head');
    const list = records.filter(record => record.status === key && [record.crmCodigo,record.cliente,record.contato,record.vendedor,record.nf].some(value => String(value ?? '').toLocaleLowerCase('pt-BR').includes(query)));
    group.dataset.stageId = key;
    heading.append(el('span','stage-name',label),el('span','stage-count',list.length));
    const editStage = el('button','stage-edit','✎');
    editStage.type = 'button';
    editStage.setAttribute('aria-label','Editar etapa '+label);
    editStage.title = 'Editar nome, cor ou excluir etapa';
    editStage.onclick = () => openStage(stage);
    heading.append(editStage);
    group.addEventListener('dragover',event => {
      if (!draggedId || movingCard) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      group.classList.add('drop-target');
      const boardRect = board.getBoundingClientRect();
      if (event.clientX > boardRect.right-70) board.scrollLeft += 18;
      if (event.clientX < boardRect.left+70) board.scrollLeft -= 18;
    });
    group.addEventListener('dragleave',event => { if (!group.contains(event.relatedTarget)) group.classList.remove('drop-target'); });
    group.addEventListener('drop',event => {
      event.preventDefault();
      group.classList.remove('drop-target');
      const record = records.find(record => record.id === draggedId);
      draggedId = null;
      if (record && record.status !== key) moveCard(record,key);
    });
    group.append(heading);
    if (!list.length) group.append(el('p','empty',query ? 'Nenhum resultado nesta etapa.' : 'Nenhuma solicitação nesta etapa.'));
    for (const record of list) {
      const card = el('article','card');
      const details = el('button','card-open');
      details.type = 'button';
      details.append(el('span','crm-code',record.crmCodigo ? 'SAC #'+record.crmCodigo : record.nf ? 'NF '+record.nf : 'SAC #'+record.id.slice(-8).toUpperCase()),el('strong','',record.cliente));
      if (record.crmCriacao) details.append(el('small','', 'Criado em '+record.crmCriacao));
      details.addEventListener('click',() => open(record));
      const reason = el('button','tag reason-edit',record.problema || record.crmSituacao || 'A classificar');
      reason.type = 'button';
      reason.setAttribute('aria-label','Editar motivo do chamado '+(record.crmCodigo || record.id));
      reason.title = 'Clique para editar o motivo';
      reason.onclick = () => openReason(record);
      const drag = el('span','drag-handle','⠿ Arrastar chamado');
      card.draggable = true;
      drag.title = 'Arraste para outra etapa';
      card.addEventListener('dragstart',event => {
        if (event.target.closest('a,input,select,.reason-edit') || movingCard) { event.preventDefault(); return; }
        draggedId = record.id;
        event.dataTransfer.setData('text/plain',record.id);
        event.dataTransfer.effectAllowed = 'move';
        card.classList.add('dragging');
      });
      card.addEventListener('dragend',() => {
        draggedId = null;
        card.classList.remove('dragging');
        board.querySelectorAll('.drop-target').forEach(column => column.classList.remove('drop-target'));
      });
      enableTouchDrag(drag,card,record,board);
      const process = el('select','card-status');
      process.setAttribute('aria-label','Processo do chamado '+(record.crmCodigo || record.nf || record.id));
      for (const [value,label] of Object.entries(statuses)) process.add(new Option(label,value));
      process.value = record.status;
      process.onchange = () => changeProcess(record,process);
      const contacts = el('div','card-contacts');
      fillWhatsApp(contacts,record);
      card.append(drag,details,reason,contacts,process);
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
  form.elements.status.replaceChildren(...stages.map(stage => new Option(stage.nome,stage.id)));
  $('#items').replaceChildren();
  $('#history').replaceChildren();
  $('#tracking').hidden = !record;
  $('#delete').hidden = !record;
  $('#copy-status').textContent = '';
  $('#crm-code').value = record?.crmCodigo || (record ? record.id.slice(-8).toUpperCase() : 'Gerado ao cadastrar');
  $('#crm-source').hidden = !record?.crmCodigo;
  $('#crm-source-title').textContent = record?.crmCodigo ? 'Star1CRM · '+record.crmCriacao+' · '+(record.crmSituacao || 'Sem classificação') : '';
  $('#crm-observation').textContent = record?.crmObservacao || '';
  fillWhatsApp($('#record-whatsapp'),record);

  $('#form-title').textContent = record ? (record.crmCodigo ? 'SAC #'+record.crmCodigo : 'Solicitação · NF '+record.nf) : 'Nova solicitação';
  $('#error').textContent = '';
  if (record) {
    for (const field of fields) form.elements[field].value = record[field] ?? '';
    whole.checked = record.inteira;
    for (const item of record.items ?? []) addItem(item.name,item.selected);
    for (const entry of (record.history ?? []).slice().reverse()) {
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
  $('#delete-description').textContent = 'A solicitação '+(current.crmCodigo ? '#'+current.crmCodigo : 'da NF '+current.nf)+' e o PDF anexado serão removidos do SAC.';
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
  if (!Object.hasOwn(statuses,data.status)) { error.textContent = 'Crie ou selecione uma etapa válida antes de salvar.'; return; }
  if (!data.cliente) { error.textContent = 'Informe o nome do cliente.'; return; }
  if (!whole.checked && !items.some(item => item.selected)) { error.textContent = 'Selecione ao menos um item afetado ou marque a NF inteira.'; return; }
  const at = Date.now();
  const changes = [];
  if (!current) changes.push('Solicitação cadastrada.');
  else {
    if (current.problema !== data.problema) changes.push('Motivo alterado para '+data.problema+'.');
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
  const record = {...current,...data,id:current?.id ?? Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2,'0')).join(''),createdAt:current?.createdAt ?? at,inteira:whole.checked,items,pdf:attachment,history:[...(current?.history ?? []),...changes.map(text => ({at,text}))]};
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
  const [cases,customStages] = await Promise.all([cloud.list(),cloud.listStages()]);
  stages = buildStages(customStages);
  statuses = Object.fromEntries(stages.map(stage => [stage.id,stage.nome]));
  records = cases.sort((a,b) => b.createdAt - a.createdAt);
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

function fillWhatsApp(container,record) {
  container.replaceChildren();
  if (!record) return;
  const contacts = whatsappContacts(record.contato);
  for (const contact of contacts) {
    const link = el('a','whatsapp-link','WhatsApp · '+contact.label);
    link.href = whatsappUrl(record,contact.number);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.title = 'Abra usando o WhatsApp do SAC · 11 2538-8588';
    container.append(link);
  }
  if (record.contato && !contacts.length) container.append(el('small','','Confira o telefone: '+record.contato));
}

form.elements.contato.addEventListener('input',() => fillWhatsApp($('#record-whatsapp'),{
  ...current,cliente:form.elements.cliente.value,contato:form.elements.contato.value
}));

let draggedId = null, movingCard = false;
async function changeProcess(record,select) {
  select.disabled = true;
  await moveCard(record,select.value);
  select.disabled = false;
}
async function moveCard(record,next) {
  if (movingCard || next === record.status || !Object.hasOwn(statuses,next)) return;
  movingCard = true;
  $('#board-message').textContent = 'Salvando processo…';
  try {
    await cloud.save({...record,status:next,history:[...(record.history ?? []),{
      at:Date.now(),text:'Status alterado para '+statuses[next]+'.'
    }]},record);
    await refresh();
    $('#board-message').textContent = 'Chamado movido para '+statuses[next]+'.';
  } catch {
    $('#board-message').textContent = 'Não foi possível mover. Atualize a página antes de tentar novamente.';
    render();
  } finally { movingCard = false; }
}

const crmDialog = $('#crm-dialog'), crmFile = $('#crm-file');
let importCalls = [], importing = false;
$('#crm-import').onclick = () => crmFile.click();
crmFile.onchange = async () => {
  const file = crmFile.files[0];
  if (!file || importing) return;
  $('#crm-import').disabled = true;
  $('#board-message').textContent = 'Lendo exportação do CRM…';
  try {
    importCalls = await readCrm(file);
    const codes = new Set(records.map(record => record.crmCodigo));
    const existing = importCalls.filter(call => codes.has(call.crmCodigo)).length;
    $('#crm-summary').textContent = importCalls.length+' chamados encontrados · '+existing+' já cadastrados.';
    $('#crm-error').textContent = '';
    const preview = $('#crm-preview');
    preview.replaceChildren();
    for (const call of importCalls) preview.append(el('p','','#'+call.crmCodigo+' · '+call.cliente));
    crmDialog.showModal();
    $('#board-message').textContent = '';
  } catch (error) {
    $('#board-message').textContent = error.message || 'Não foi possível ler a planilha.';
  } finally {
    $('#crm-import').disabled = false;
    crmFile.value = '';
  }
};
crmDialog.addEventListener('cancel',event => {if (importing) event.preventDefault();});
$('#crm-cancel').onclick = () => {if (!importing) crmDialog.close();};
$('#crm-confirm').onclick = async () => {
  if (importing || !importCalls.length) return;
  importing = true;
  $('#crm-confirm').disabled = $('#crm-cancel').disabled = true;
  $('#crm-error').textContent = '';
  try {
    const result = await cloud.importCrm(importCalls);
    importCalls = [];
    crmDialog.close();
    await refresh();
    $('#board-message').textContent = result.novos+' chamados novos · '+result.atualizados+' atualizados.';
  } catch {
    $('#crm-error').textContent = 'Não foi possível concluir. Reabra a importação para tentar novamente. Códigos existentes serão atualizados.';
    $('#board-message').textContent = 'Atualize a página para conferir os chamados.';
  } finally {
    importing = false;
    $('#crm-confirm').disabled = $('#crm-cancel').disabled = false;
  }
};

const stageDialog = $('#stage-dialog'), stageForm = $('#stage-form');
let creatingStage = false, editingStage = null;
function openStage(stage = null) {
  editingStage = stage;
  stageForm.reset();
  $('#stage-title').textContent = stage ? 'Editar etapa' : 'Nova etapa do atendimento';
  $('#stage-create').textContent = stage ? 'Salvar alterações' : 'Criar etapa';
  $('#stage-delete-area').hidden = !stage;
  $('#stage-delete').disabled = stages.length <= 1;
  $('#stage-error').textContent = '';
  if (stage) {
    stageForm.elements.nome.value = stage.nome;
    stageForm.elements.cor.value = stage.cor;
    $('#stage-destination').replaceChildren(...stages.filter(item => item.id !== stage.id).map(item => new Option(item.nome,item.id)));
    $('#stage-delete-info').textContent = stages.length <= 1 ? 'Mantenha ao menos uma etapa. Crie outra antes de excluir esta.' : 'Ao excluir, todos os chamados desta etapa serão movidos para a etapa escolhida abaixo.';
  }
  stageDialog.showModal();
  stageForm.elements.nome.focus();
}
$('#stage-new').onclick = () => openStage();
$('#stage-cancel').onclick = () => { if (!creatingStage) stageDialog.close(); };
stageDialog.addEventListener('cancel',event => { if (creatingStage) event.preventDefault(); });
function stageBusy(value) {
  creatingStage = value;
  $('#stage-create').disabled = $('#stage-cancel').disabled = value;
  $('#stage-delete').disabled = value || stages.length <= 1;
}
stageForm.onsubmit = async event => {
  event.preventDefault();
  if (creatingStage) return;
  const nome = stageForm.elements.nome.value.replace(/\s+/g,' ').trim();
  if (!nome || nome.length > 60) { $('#stage-error').textContent = 'Informe um nome de até 60 caracteres.'; return; }
  if (stages.some(stage => stage.id !== editingStage?.id && stage.nome.toLocaleLowerCase('pt-BR') === nome.toLocaleLowerCase('pt-BR'))) {
    $('#stage-error').textContent = 'Já existe uma etapa com esse nome.'; return;
  }
  stageBusy(true);
  $('#stage-error').textContent = '';
  try {
    const data = {nome,cor:stageForm.elements.cor.value};
    if (editingStage) await cloud.updateStage(editingStage.id,data);
    else await cloud.createStage(data);
    await refresh();
    stageDialog.close();
    $('#board-message').textContent = editingStage ? 'Etapa atualizada.' : 'Etapa criada. Selecione essa etapa no card para mover o chamado.';
  } catch (error) {
    $('#stage-error').textContent = error.code === '23505' ? 'Já existe uma etapa com esse nome.' : 'Não foi possível salvar a etapa. Recarregue a página para conferir antes de tentar novamente.';
  } finally { stageBusy(false); }
};
$('#stage-delete').onclick = async () => {
  if (creatingStage || !editingStage || stages.length <= 1) return;
  stageBusy(true);
  $('#stage-error').textContent = '';
  try {
    await cloud.deleteStage(editingStage.id,$('#stage-destination').value);
    await refresh();
    stageDialog.close();
    $('#board-message').textContent = 'Etapa excluída. Os chamados foram preservados na etapa de destino.';
  } catch { $('#stage-error').textContent = 'Não foi possível excluir. Atualize a página e confira as etapas antes de tentar novamente.'; }
  finally { stageBusy(false); }
};

const reasonDialog = $('#reason-dialog'), reasonForm = $('#reason-form');
let reasonRecord, savingReason = false;
function openReason(record) {
  reasonRecord = record;
  reasonForm.elements.motivo.value = record.problema || record.crmSituacao || '';
  $('#reason-error').textContent = '';
  reasonDialog.showModal();
  reasonForm.elements.motivo.focus();
}
$('#reason-cancel').onclick = () => { if (!savingReason) reasonDialog.close(); };
reasonDialog.addEventListener('cancel',event => { if (savingReason) event.preventDefault(); });
reasonForm.onsubmit = async event => {
  event.preventDefault();
  if (savingReason || !reasonRecord) return;
  const problema = reasonForm.elements.motivo.value.trim();
  if (!problema || problema.length > 120) { $('#reason-error').textContent = 'Informe um motivo de até 120 caracteres.'; return; }
  savingReason = true;
  $('#reason-save').disabled = $('#reason-cancel').disabled = true;
  try {
    await cloud.save({...reasonRecord,problema,history:[...(reasonRecord.history ?? []),{at:Date.now(),text:'Motivo alterado para '+problema+'.'}]},reasonRecord);
    await refresh();
    reasonDialog.close();
    $('#board-message').textContent = 'Motivo atualizado.';
  } catch { $('#reason-error').textContent = 'Não foi possível salvar. Atualize a página antes de tentar novamente.'; }
  finally { savingReason = false; $('#reason-save').disabled = $('#reason-cancel').disabled = false; }
};

function enableTouchDrag(handle,card,record,board) {
  let pointer = null, destination = null;
  const clear = () => {
    pointer = null;
    card.classList.remove('dragging');
    board.querySelectorAll('.drop-target').forEach(column => column.classList.remove('drop-target'));
  };
  handle.addEventListener('pointerdown',event => {
    if (event.pointerType === 'mouse' || movingCard || event.isPrimary === false) return;
    event.preventDefault();
    pointer = event.pointerId;
    destination = null;
    handle.setPointerCapture(pointer);
    card.classList.add('dragging');
  });
  handle.addEventListener('pointermove',event => {
    if (event.pointerId !== pointer) return;
    event.preventDefault();
    board.querySelectorAll('.drop-target').forEach(column => column.classList.remove('drop-target'));
    const column = document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-stage-id]');
    destination = column?.dataset.stageId ?? null;
    column?.classList.add('drop-target');
    if (event.clientY > innerHeight-70) window.scrollBy(0,18);
    if (event.clientY < 70) window.scrollBy(0,-18);
    const bounds = board.getBoundingClientRect();
    if (event.clientX > bounds.right-60) board.scrollLeft += 18;
    if (event.clientX < bounds.left+60) board.scrollLeft -= 18;
  });
  handle.addEventListener('pointerup',event => {
    if (event.pointerId !== pointer) return;
    const next = destination;
    clear();
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    if (next && next !== record.status) moveCard(record,next);
  });
  handle.addEventListener('pointercancel',clear);
}
