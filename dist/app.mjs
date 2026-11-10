import {searchRecords} from './search.mjs';
import {saoPauloToday,validDate,displayDate,deadlineInfo,reorderStages} from './case-utils.mjs';
import {buildStages,baseStages} from './stages.mjs';
import {readCrmSelection,whatsappContacts,whatsappUrl} from './crm.mjs';
import {showMessages} from './portal-messages.mjs';
import {cloudConfig} from './cloud-config.mjs';
const useCloud = true;
import {readInvoice} from './invoice.mjs';
const $ = selector => document.querySelector(selector);
let stages = buildStages(baseStages);
let statuses = Object.fromEntries(stages.map(stage => [stage.id,stage.nome]));
const editor = $('#editor'), form = $('#form'), whole = $('#whole'), pdf = $('#pdf');
const fields = ['cliente','vendedor','nf','pedido','data','endereco','problema','descricao','status','novaNF','rastreio','transportadora','entrega','contato','proximaAcaoData','proximaAcao'];
let cloud;
function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}
let records = [], current, attachment, uploadRun = 0, reading = false, saving = false;
let boardToday = saoPauloToday();
let activeStage = 'total', listStage = 'total', viewMode = 'kanban', dueFilter = 'all';
try {viewMode = localStorage.getItem('wdl-sac-view') === 'list' ? 'list' : 'kanban';} catch {}
function render() {
  boardToday = saoPauloToday();
  const query = $('#search').value.trim().toLocaleLowerCase('pt-BR');
  const metrics = $('#metrics'), board = $('#columns');
  const scrollPositions = new Map([...board.querySelectorAll('.column')].map(column => [column.dataset.stageId,column.querySelector('.column-cards')?.scrollTop ?? 0]));
  metrics.replaceChildren();
  board.replaceChildren();
  for (const stage of [{id:'total',nome:'Total de solicitações',cor:'total'},...stages]) {
    const {id:key,nome:label,cor} = stage;
    const count = key === 'total' ? records.length : records.filter(record => record.status === key).length;
    const metric = el('button','metric '+cor);
    metric.type = 'button';
    metric.dataset.stageId = key;
    metric.setAttribute('aria-label',key === 'total' ? 'Ver todas as solicitações' : 'Ver chamados da etapa '+label);
    metric.setAttribute('aria-controls','columns');
    metric.setAttribute('aria-pressed',String(activeStage === key));
    metric.onclick = () => navigateStage(key);
    const title = el('span');
    title.append(el('i','dot'), label);
    metric.append(title,el('strong','',count));
    metrics.append(metric);
    if (key === 'total') continue;
    const group = el('section','column '+cor), heading = el('h3','column-head');
    const list = filteredRecords(query).filter(record => record.status === key);
    enableStageDrag(group,heading,stage);
    group.dataset.stageId = key;
    group.tabIndex = -1;
    group.setAttribute('aria-label',label);
    heading.append(el('span','stage-name',label),el('span','stage-count',list.length));
    const editStage = el('button','stage-edit','✎');
    editStage.type = 'button';
    editStage.setAttribute('aria-label','Editar etapa '+label);
    editStage.title = 'Editar nome, cor ou excluir etapa';
    editStage.onclick = () => openStage(stage);
    heading.append(editStage);
    group.addEventListener('dragover',event => {
      if (draggedStage) {
        event.preventDefault();
        group.classList.add('stage-drop-target');
        const bounds = board.getBoundingClientRect();
        if (event.clientX > bounds.right-70) board.scrollLeft += 18;
        if (event.clientX < bounds.left+70) board.scrollLeft -= 18;
        return;
      }
      if (!draggedId || movingCard) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      group.classList.add('drop-target');
      scrollCardList(group,event.clientY);
      const boardRect = board.getBoundingClientRect();
      if (event.clientX > boardRect.right-70) board.scrollLeft += 18;
      if (event.clientX < boardRect.left+70) board.scrollLeft -= 18;
    });
    group.addEventListener('dragleave',event => { if (!group.contains(event.relatedTarget)) group.classList.remove('drop-target','stage-drop-target'); });
    group.addEventListener('drop',event => {
      event.preventDefault();
      group.classList.remove('stage-drop-target');
      if (draggedStage) { const source = draggedStage; draggedStage = null; saveStageOrder(source,key); return; }
      group.classList.remove('drop-target');
      const record = records.find(record => record.id === draggedId);
      draggedId = null;
      if (record && record.status !== key) moveCard(record,key);
    });
    group.append(heading);
    const cardList = el('div','column-cards');
    cardList.tabIndex = 0;
    cardList.setAttribute('aria-label','Chamados da etapa '+label);
    group.append(cardList);
    cardList.dataset.scrollTop = scrollPositions.get(key) ?? 0;
    if (!list.length) cardList.append(el('p','empty',query ? 'Nenhum resultado nesta etapa.' : 'Nenhuma solicitação nesta etapa.'));
    for (const record of list) {
      const card = el('article','card');
      const details = el('button','card-open');
      details.type = 'button';
      details.append(el('span','crm-code',record.crmCodigo ? 'SAC #'+record.crmCodigo : record.nf ? 'NF '+record.nf : 'SAC #'+record.id.slice(-8).toUpperCase()),el('strong','',record.cliente));
      const description = String(record.descricao || record.crmObservacao || '').replace(/\s+/g,' ').trim();
      if (description) details.append(el('p','card-description',description.length > 240 ? description.slice(0,237)+'…' : description));

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
      const owner = el('small','card-owner','Atendimento: você');
      const deadline = deadlineButton(record);
      const state = deadlineInfo(record,boardToday);
      card.classList.toggle('overdue',state.kind === 'late');
      card.append(details,reason,owner,deadline,contacts,process,drag);
      cardList.append(card);
    }
    board.append(group);
  }
  updateWorkspaceOverview();
  renderSearchResults(query);
  renderCaseList(query);
  applyView();
  requestAnimationFrame(() => { updateCardViewports(); updateBoardNavigation(); });
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
  form.elements.proximaAcaoFeita.checked = Boolean(record?.proximaAcaoFeita);
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
  if (data.proximaAcaoData && !validDate(data.proximaAcaoData)) { error.textContent = 'Informe uma data válida para a próxima ação.'; return; }
  data.proximaAcaoFeita = form.elements.proximaAcaoFeita.checked;
  const at = Date.now();
  const changes = [];
  if (!current) changes.push('Solicitação cadastrada.');
  else {
    if (current.proximaAcaoData !== data.proximaAcaoData || current.proximaAcao !== data.proximaAcao || Boolean(current.proximaAcaoFeita) !== data.proximaAcaoFeita) changes.push('Próxima ação: '+(data.proximaAcao || 'Retorno')+' · '+(displayDate(data.proximaAcaoData) || 'Sem prazo')+(data.proximaAcaoFeita ? ' · Concluída' : ''));
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
async function previewCrm(files) {
  if (!files.length || importing) return;
  $('#crm-import').disabled = true;
  $('#board-message').textContent = 'Lendo exportação do CRM…';
  try {
    $('#import-help').hidden = true;
    importCalls = await readCrmSelection(files);
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
    $('#import-help').hidden = error.code !== 'CRM_MISSING_SHEET';
  } finally {
    $('#crm-import').disabled = false;
    crmFile.value = '';
    $('#crm-folder').value = '';
  }
}
crmFile.onchange = () => previewCrm([...crmFile.files]);
$('#crm-folder').onchange = () => previewCrm([...$('#crm-folder').files]);
$('#crm-folder-button').onclick = () => $('#crm-folder').click();
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
    if (column) scrollCardList(column,event.clientY);
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

const boardColumns = $('#columns');
function reducedMotion() { return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; }
function updateBoardNavigation() {
  const max = Math.max(0,boardColumns.scrollWidth-boardColumns.clientWidth);
  $('#board-prev').disabled = boardColumns.scrollLeft <= 2;
  $('#board-next').disabled = boardColumns.scrollLeft >= max-2;
}
function scrollBoard(left) {
  boardColumns.scrollTo({left,behavior:reducedMotion() ? 'instant' : 'smooth'});
  requestAnimationFrame(updateBoardNavigation);
}
function navigateStage(key) {
  if (viewMode === 'list') {listStage = key;activeStage = key;render();return;}
  const column = [...boardColumns.children].find(column => column.dataset.stageId === key);
  activeStage = key;
  if (key === 'total') {
    $('#search').value = '';
    render();
    scrollBoard(0);
    boardColumns.focus({preventScroll:true});
  } else if (column) {
    const target = boardColumns.scrollLeft+column.getBoundingClientRect().left-boardColumns.getBoundingClientRect().left;
    scrollBoard(target);
    column.focus({preventScroll:true});
  }
  $('#metrics').querySelectorAll('.metric').forEach(metric => metric.setAttribute('aria-pressed',String(metric.dataset.stageId === key)));
  boardColumns.scrollIntoView({block:'nearest',behavior:reducedMotion() ? 'instant' : 'smooth'});
}
function stepBoard(direction) {
  const columns = [...boardColumns.children];
  const left = boardColumns.getBoundingClientRect().left;
  const positions = columns.map(column => boardColumns.scrollLeft+column.getBoundingClientRect().left-left);
  const current = boardColumns.scrollLeft;
  const target = direction > 0 ? positions.find(position => position > current+3) : positions.reverse().find(position => position < current-3);
  if (target !== undefined) scrollBoard(target);
}
$('#board-prev').onclick = () => stepBoard(-1);
$('#board-next').onclick = () => stepBoard(1);
boardColumns.addEventListener('scroll',updateBoardNavigation,{passive:true});
window.addEventListener('resize',() => {updateCardViewports();updateBoardNavigation();});
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => {updateCardViewports();updateBoardNavigation();}).observe(boardColumns);

function updateCardViewports() {
  if (boardColumns.hidden) return;
  boardColumns.querySelectorAll('.column-cards').forEach(list => {
    const cards = [...list.querySelectorAll('.card')].slice(0,3);
    if (!cards.length) { list.style.maxHeight = ''; return; }
    const height = cards.reduce((total,card) => {
      const style = getComputedStyle(card);
      return total+card.getBoundingClientRect().height+(parseFloat(style.marginTop)||0)+(parseFloat(style.marginBottom)||0);
    },0);
    if (height > 0) list.style.maxHeight = Math.ceil(height)+'px';
    if (list.dataset.scrollTop !== undefined) {
      list.scrollTop = Number(list.dataset.scrollTop);
      delete list.dataset.scrollTop;
    }
  });
}
function scrollCardList(column,y) {
  const list = column.querySelector('.column-cards');
  if (!list) return;
  const bounds = list.getBoundingClientRect();
  if (y > bounds.bottom-48) list.scrollTop += 16;
  if (y < bounds.top+48) list.scrollTop -= 16;
}

function filteredRecords(query = $('#search').value.trim().toLocaleLowerCase('pt-BR')) {
  return searchRecords(records,query,stages).filter(record => {
    const kind = deadlineInfo(record,boardToday).kind;
    return dueFilter === 'all' || (kind === dueFilter && !(dueFilter === 'none' && record.status === 'concluida'));
  });
}
function deadlineButton(record) {
  const info = deadlineInfo(record,boardToday);
  const button = el('button','deadline deadline-'+info.kind);
  button.type = 'button';
  button.append(el('span','',info.label));
  if (record.proximaAcao) button.append(el('small','',record.proximaAcao));
  button.setAttribute('aria-label','Editar próxima ação de '+record.cliente);
  button.onclick = () => openDeadline(record);
  return button;
}
function stageSelect(record) {
  const select = el('select','list-status');
  select.setAttribute('aria-label','Etapa do chamado '+(record.crmCodigo || record.id));
  for (const stage of stages) select.add(new Option(stage.nome,stage.id));
  select.value = record.status;
  select.onchange = () => changeProcess(record,select);
  return select;
}
function renderCaseList(query) {
  const target = $('#case-list-body');
  target.replaceChildren();
  if (!stages.some(stage => stage.id === listStage)) listStage = 'total';
  const stageFilter = $('#list-stage');
  stageFilter.replaceChildren(new Option('Todas as etapas','total'),...stages.map(stage => new Option(stage.nome,stage.id)));
  stageFilter.value = listStage;
  let items = filteredRecords(query).filter(record => listStage === 'total' || record.status === listStage);
  if ($('#list-sort').value === 'deadline') items.sort((a,b) => {
    const active = record => ['late','today','scheduled'].includes(deadlineInfo(record,boardToday).kind) ? record.proximaAcaoData : '9999-12-31';
    return active(a).localeCompare(active(b)) || a.createdAt-b.createdAt;
  });
  $('#list-count').textContent = items.length+' chamados';
  $('#due-summary').textContent = records.filter(record => deadlineInfo(record,boardToday).kind === 'late').length+' retornos atrasados';
  for (const record of items) {
    const row = el('tr',deadlineInfo(record,boardToday).kind === 'late' ? 'overdue-row' : '');
    const client = el('td');
    const button = el('button','list-open');button.type='button';
    button.append(el('strong','',record.crmCodigo ? '#'+record.crmCodigo : record.nf || record.id.slice(-8)),el('span','',record.cliente));
    button.onclick = () => open(record);client.append(button);
    const description = String(record.descricao || record.crmObservacao || 'Sem descrição').replace(/\s+/g,' ').trim();
    const descriptionCell = el('td');descriptionCell.append(el('p','list-description',description));
    const reasonCell = el('td');const reason = el('button','list-reason',record.problema || record.crmSituacao || 'A classificar');reason.type='button';reason.onclick=()=>openReason(record);reasonCell.append(reason);
    const status = el('td');status.append(stageSelect(record));
    const deadline = el('td');deadline.append(deadlineButton(record));
    const contact = el('td');fillWhatsApp(contact,record);
    row.append(client,descriptionCell,reasonCell,status,deadline,contact);target.append(row);
  }
  if (!items.length) {const row=el('tr'),cell=el('td','empty','Nenhum chamado encontrado.');cell.colSpan=6;row.append(cell);target.append(row);}
}
function applyView() {
  const list = viewMode === 'list';
  $('#case-list').hidden = !list;$('#columns').hidden = list;$('.board-navigation').hidden = list;
  $('#view-kanban').setAttribute('aria-pressed',String(!list));$('#view-list').setAttribute('aria-pressed',String(list));
}
for (const [id,value] of [['#view-kanban','kanban'],['#view-list','list']]) $(id).onclick = () => {
  viewMode=value;try {localStorage.setItem('wdl-sac-view',value);} catch {}render();
};
$('#due-filter').onchange=event=>{dueFilter=event.target.value;render();};
$('#list-stage').onchange=event=>{listStage=event.target.value;activeStage=listStage;render();};
$('#list-sort').onchange=()=>render();

const deadlineDialog=$('#deadline-dialog'),deadlineForm=$('#deadline-form');
let deadlineRecord,savingDeadline=false;
function openDeadline(record) {
  deadlineRecord=record;deadlineForm.reset();
  deadlineForm.elements.data.value=record.proximaAcaoData || '';
  deadlineForm.elements.acao.value=record.proximaAcao || '';
  deadlineForm.elements.feita.checked=Boolean(record.proximaAcaoFeita);
  $('#deadline-error').textContent='';deadlineDialog.showModal();
}
$('#deadline-cancel').onclick=()=>{if(!savingDeadline)deadlineDialog.close();};
deadlineDialog.addEventListener('cancel',event=>{if(savingDeadline)event.preventDefault();});
deadlineForm.onsubmit=async event=>{
  event.preventDefault();if(savingDeadline || !deadlineRecord)return;
  const date=deadlineForm.elements.data.value,action=deadlineForm.elements.acao.value.trim(),done=deadlineForm.elements.feita.checked;
  if(date && !validDate(date)){$('#deadline-error').textContent='Informe uma data válida.';return;}
  savingDeadline=true;$('#deadline-save').disabled=$('#deadline-cancel').disabled=true;
  try{
    await cloud.save({...deadlineRecord,proximaAcaoData:date,proximaAcao:action,proximaAcaoFeita:done,history:[...(deadlineRecord.history ?? []),{at:Date.now(),text:'Próxima ação: '+(action || 'Retorno')+' · '+(displayDate(date) || 'Sem prazo')+(done ? ' · Concluída' : '')}]},deadlineRecord);
    await refresh();deadlineDialog.close();$('#board-message').textContent='Próxima ação atualizada.';
  }catch{$('#deadline-error').textContent='Não foi possível salvar. Recarregue antes de tentar novamente.';}
  finally{savingDeadline=false;$('#deadline-save').disabled=$('#deadline-cancel').disabled=false;}
};
let lastCalendarDay=saoPauloToday();
setInterval(()=>{const today=saoPauloToday();if(today!==lastCalendarDay){lastCalendarDay=today;render();}},60000);

let draggedStage=null,reorderingStages=false;
function enableStageDrag(column,heading,stage) {
  heading.draggable=true;
  heading.title='Arraste para reordenar a etapa';
  heading.addEventListener('dragstart',event=>{
    if(reorderingStages || event.target.closest('button')){event.preventDefault();return;}
    event.stopPropagation();draggedStage=stage.id;event.dataTransfer.setData('text/plain',stage.id);event.dataTransfer.effectAllowed='move';column.classList.add('stage-dragging');
  });
  heading.addEventListener('dragend',()=>{draggedStage=null;column.classList.remove('stage-dragging');document.querySelectorAll('.stage-drop-target').forEach(node=>node.classList.remove('stage-drop-target'));});
  const left=el('button','stage-order','‹'),right=el('button','stage-order','›');
  left.type=right.type='button';left.setAttribute('aria-label','Mover etapa '+stage.nome+' para a esquerda');right.setAttribute('aria-label','Mover etapa '+stage.nome+' para a direita');
  const index=stages.findIndex(item=>item.id===stage.id);left.disabled=index===0;right.disabled=index===stages.length-1;
  left.onclick=()=>saveStageOrder(stage.id,stages[index-1]?.id);
  right.onclick=()=>{const ids=stages.map(item=>item.id);[ids[index],ids[index+1]]=[ids[index+1],ids[index]];persistStageOrder(ids);};
  heading.append(left,right);
}
async function saveStageOrder(source,target) {
  if(!target || source===target)return;
  await persistStageOrder(reorderStages(stages,source,target));
}
async function persistStageOrder(ids) {
  if(reorderingStages)return;reorderingStages=true;$('#board-message').textContent='Salvando ordem das etapas…';
  try{await cloud.reorderStages(ids,stages.map(stage=>stage.id));await refresh();$('#board-message').textContent='Ordem das etapas salva.';}
  catch{$('#board-message').textContent='Não foi possível reordenar. Atualize a página antes de tentar novamente.';}
  finally{reorderingStages=false;}
}

render();

deadlineForm.elements.data.addEventListener('input',()=>{deadlineForm.elements.feita.checked=false;});
form.elements.proximaAcaoData.addEventListener('input',()=>{form.elements.proximaAcaoFeita.checked=false;});

function renderSearchResults(query) {
  const panel=$('#search-results'),list=$('#search-result-list');
  list.replaceChildren();
  if(!query.trim()){panel.hidden=true;return;}
  const matches=searchRecords(records,query,stages);
  $('#search-summary').textContent=matches.length ? matches.length+' '+(matches.length===1?'solicitação encontrada':'solicitações encontradas') : 'Nenhuma solicitação encontrada';
  for(const record of matches.slice(0,20)) {
    const item=el('li'),button=el('button','search-result');button.type='button';
    button.append(el('strong','',record.crmCodigo?'SAC #'+record.crmCodigo:record.nf?'NF '+record.nf:'Solicitação'),el('span','',record.cliente));
    const label=stages.find(stage=>stage.id===record.status)?.nome || 'Sem etapa';
    button.append(el('small','',label+' · '+(record.problema || record.crmSituacao || 'A classificar')));
    button.onclick=()=>{panel.hidden=true;open(record);};item.append(button);list.append(item);
  }
  $('#search-show-all').hidden=!matches.length;
  $('#search-show-all').textContent=matches.length>20?'Ver todos os '+matches.length+' resultados na lista':'Ver resultados na lista';
  panel.hidden=false;
}
search.onfocus=()=>{if(search.value.trim())renderSearchResults(search.value);};
search.addEventListener('keydown',event=>{if(event.key==='Escape'){$('#search-results').hidden=true;event.stopPropagation();}});
$('#search-show-all').onclick=()=>{
  viewMode='list';dueFilter='all';listStage='total';activeStage='total';$('#due-filter').value='all';
  try{localStorage.setItem('wdl-sac-view','list');}catch{}
  render();$('#search-results').hidden=true;$('#case-list').scrollIntoView({block:'nearest',behavior:reducedMotion()?'instant':'smooth'});
};
document.addEventListener('click',event=>{if(!event.target.closest('.search-area'))$('#search-results').hidden=true;});

function updateWorkspaceOverview() {
  const counts={late:0,today:0,none:0};
  for(const record of records){
    if(record.status==='concluida')continue;
    const kind=deadlineInfo(record,boardToday).kind;
    if(Object.hasOwn(counts,kind))counts[kind]++;
  }
  for(const kind of ['late','today']) {
    $('#nav-'+kind+'-count').textContent=counts[kind];
    $('#overview-'+kind+'-count').textContent=counts[kind];
  }
  $('#overview-unscheduled-count').textContent=counts.none;
  const nav=dueFilter==='late'?'nav-late':dueFilter==='today'?'nav-today':viewMode==='list'?'nav-list':'nav-workspace';
  for(const id of ['nav-workspace','nav-today','nav-late','nav-list']) {
    if(id===nav)$('#'+id).setAttribute('aria-current','page');else $('#'+id).removeAttribute('aria-current');
  }
  $('#workspace-context').textContent=dueFilter==='late'?'Retornos atrasados':dueFilter==='today'?'Retornos de hoje':viewMode==='list'?'Todas as solicitações':'Painel de atendimento';
}
function workspaceRoute(mode,filter='all') {
  viewMode=mode;dueFilter=filter;listStage='total';activeStage='total';
  $('#due-filter').value=filter;search.value='';
  try{localStorage.setItem('wdl-sac-view',mode);}catch{}
  render();setSidebar(false);
  $('#main-workspace').scrollIntoView({block:'start',behavior:reducedMotion()?'instant':'smooth'});
}
$('#nav-workspace').onclick=()=>workspaceRoute('kanban');
$('#nav-list').onclick=()=>workspaceRoute('list');
$('#nav-today').onclick=$('#overview-today').onclick=()=>workspaceRoute('list','today');
$('#nav-late').onclick=$('#overview-late').onclick=()=>workspaceRoute('list','late');
$('#overview-unscheduled').onclick=()=>workspaceRoute('list','none');
$('#nav-import').onclick=()=>{setSidebar(false);$('#crm-import').click();};
$('#nav-stage').onclick=()=>{setSidebar(false);$('#stage-new').click();};
function setSidebar(open) {
  const mobile=window.matchMedia('(max-width: 980px)').matches;
  const wasOpen=document.body.classList.contains('sidebar-open');
  document.body.classList.toggle('sidebar-open',open);
  $('#sidebar-toggle').setAttribute('aria-expanded',String(open));
  $('#sidebar-backdrop').hidden=!open;
  $('#app-sidebar').toggleAttribute('inert',!open && mobile);
  $('.app-frame').toggleAttribute('inert',open && mobile);
  if(open && mobile)($('#app-sidebar [aria-current=page]') ?? $('#nav-workspace')).focus();
  if(!open && wasOpen && mobile)$('#sidebar-toggle').focus();
}
$('#sidebar-toggle').onclick=()=>setSidebar(!document.body.classList.contains('sidebar-open'));
$('#sidebar-backdrop').onclick=()=>setSidebar(false);
document.addEventListener('keydown',event=>{if(event.key==='Escape' && document.body.classList.contains('sidebar-open'))setSidebar(false);});
window.addEventListener('resize',()=>{if(window.innerWidth>980)setSidebar(false);else $('#app-sidebar').toggleAttribute('inert',!document.body.classList.contains('sidebar-open'));});
setSidebar(false);
