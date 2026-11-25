const defaults = ['Defeito','Problema elétrico','Pedido incompleto','Veio algo que não pedi','Produto quebrado','Não recebi a mercadoria'];
export function problemPicker(input) {
  const label = input.closest('label');
  input.removeAttribute('list');
  const select = document.createElement('select');
  select.required = true;
  select.setAttribute('aria-label', input.name === 'problema' ? 'Qual o problema?' : 'Motivo do chamado');
  const customLabel = document.createElement('label');
  customLabel.textContent = 'Descreva o outro motivo';
  label.insertAdjacentElement('afterend',customLabel);
  label.append(select);
  customLabel.append(input);
  const custom = '__outro_motivo__';
  function set(value = '') {
    select.replaceChildren(new Option('Selecione o motivo',''));
    const options = [...defaults];
    if (value && !options.includes(value)) options.push(value);
    for (const text of options) select.add(new Option(text,text));
    select.add(new Option('Outro motivo…',custom));
    select.value = value;
    input.value = value;
    input.required = false;
    customLabel.hidden = true;
  }
  select.onchange = () => {
    const other = select.value === custom;
    customLabel.hidden = !other;
    input.required = other;
    input.value = other ? '' : select.value;
    if (other) input.focus();
  };
  set(input.value);
  return {set,focus:() => select.focus()};
}
