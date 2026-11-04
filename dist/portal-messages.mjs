export function showMessages(list,messages) {
  list.replaceChildren();
  if (!messages.length) {
    const empty = document.createElement('li');
    empty.textContent = 'Nenhuma mensagem pública.';
    list.append(empty);
    return;
  }
  for (const message of messages) {
    const item = document.createElement('li');
    const title = document.createElement('strong');
    title.textContent = message.autor === 'equipe' ? 'Equipe SAC' : 'Cliente';
    const time = document.createElement('time');
    time.dateTime = message.criada_em;
    time.textContent = new Date(message.criada_em).toLocaleString('pt-BR');
    const text = document.createElement('p');
    text.textContent = message.mensagem;
    item.append(title,time,text);
    list.append(item);
  }
}
