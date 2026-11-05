import {cloudConfig} from './cloud-config.mjs';
import {showMessages} from './portal-messages.mjs';

const $ = id => document.getElementById(id);
const token = location.hash.slice(1);
const feedback = $('customer-feedback');
const form = $('customer-form');
const statuses = {nova:'Em aberto',andamento:'Em andamento',concluida:'Finalizado'};

async function load(message) {
  const controls = [$('customer-refresh'),...form.elements];
  controls.forEach(control => {control.disabled = true;});
  feedback.textContent = message ? 'Enviando…' : 'Carregando solicitação…';
  try {
    const response = await fetch(cloudConfig.url+'/rest/v1/rpc/sac_acompanhamento',{
      method:'POST',
      headers:{apikey:cloudConfig.publishableKey,'Content-Type':'application/json'},
      body:JSON.stringify({p_token:token,p_mensagem:message ?? null}),
      cache:'no-store'
    });
    if (!response.ok) {
      const error = await response.json();
      feedback.textContent = error.code === 'P0001'
        ? 'Aguarde um minuto antes de enviar outro comentário.'
        : 'Não foi possível concluir. Atualize a conversa antes de tentar novamente.';
      return;
    }
    const data = await response.json();
    if (!data) {
      $('customer-case').hidden = true;
      $('customer-messages').replaceChildren();
      feedback.textContent = 'Este link é inválido ou foi revogado.';
      return;
    }
    $('customer-protocol').textContent = data.protocolo;
    $('customer-status').textContent = data.etapa || statuses[data.status] || 'Em aberto';
    showMessages($('customer-messages'),data.mensagens);
    $('customer-case').hidden = false;
    if (message) form.reset();
    feedback.textContent = message ? 'Comentário enviado.' : '';
  } catch {
    feedback.textContent = 'Falha na conexão. Atualize a página para tentar novamente.';
  } finally {
    controls.forEach(control => {control.disabled = false;});
  }
}

$('customer-refresh').onclick = () => load();
form.onsubmit = event => {
  event.preventDefault();
  const message = form.elements.message.value.trim();
  if (message) load(message);
  else feedback.textContent = 'Digite um comentário.';
};
if (/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(token)) load();
else feedback.textContent = 'Abra o link completo enviado pela equipe do SAC.';
