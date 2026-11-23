import {passwordProblem,recoveryIntent,cleanAuthUrl} from './password-utils.mjs';

export function setupPasswordRecovery(getCloud) {
  const $ = selector => document.querySelector(selector);
  const dialog = $('#password-dialog'), login = $('#login-dialog');
  const requestForm = $('#password-request'), updateForm = $('#password-update');
  const status = $('#password-status'), title = $('#password-title');
  const save = $('#password-save'), send = $('#password-send'), back = $('#password-back');
  let pending = recoveryIntent(location.href), verified = false, busy = false, finished = false;
  let cooldownUntil = 0, requiresLogout = pending;
  function show(mode) {
    title.textContent = mode === 'update' ? 'Definir nova senha' : 'Recuperar acesso';
    requestForm.hidden = mode !== 'request';
    updateForm.hidden = mode !== 'update';
    login.close();
    if (!dialog.open) dialog.showModal();
    if (mode === 'request') requestForm.elements.email.focus();
    else if (!save.disabled) updateForm.elements.password.focus();
  }
  function cleanUrl() { history.replaceState(null,'',cleanAuthUrl(location.href)); }
  function setBusy(value) {
    busy = value;
    send.disabled = value;
    save.disabled = value || !verified || finished;
    back.disabled = value;
  }
  function invalid() {
    pending = false; verified = false; cleanUrl();
    status.textContent = 'Este link expirou ou não é válido. Solicite um novo e-mail de recuperação.';
    show('request');
  }
  if (pending) {
    save.disabled = true;
    status.textContent = 'Validando seu link de recuperação…';
    show('update');
  }
  $('#forgot-password').onclick = () => {
    status.textContent = '';
    requestForm.elements.email.value = $('#login-form').elements.email.value;
    show('request');
  };
  $('#password-visible').onchange = event => {
    for (const name of ['password','confirmation']) updateForm.elements[name].type = event.target.checked ? 'text' : 'password';
  };
  dialog.addEventListener('cancel',event => { event.preventDefault(); if (!busy) back.click(); });
  back.onclick = async () => {
    if (busy) return;
    if (requiresLogout || verified || finished || pending) {
      setBusy(true);
      try { await getCloud().logout(); }
      catch {
        status.textContent = 'Não foi possível encerrar a sessão. Verifique a conexão e tente voltar ao login novamente.';
        setBusy(false); return;
      }
    }
    pending = verified = finished = requiresLogout = false;
    updateForm.reset(); requestForm.reset(); cleanUrl();
    for (const name of ['password','confirmation']) updateForm.elements[name].type = 'password';
    setBusy(false); dialog.close();
    if (!login.open) login.showModal();
    $('#login-form').elements.password.focus();
  };
  requestForm.onsubmit = async event => {
    event.preventDefault();
    if (busy || !requestForm.reportValidity()) return;
    const cloud = getCloud();
    if (!cloud) { status.textContent = 'A conexão ainda não está disponível. Aguarde e tente novamente.'; return; }
    if (Date.now() < cooldownUntil) { status.textContent = 'Aguarde um minuto antes de solicitar outro link.'; return; }
    setBusy(true); status.textContent = 'Solicitando link…';
    try {
      // Root URL also works for the dashboard recovery email; no extra redirect route required.
      await cloud.requestPasswordReset(requestForm.elements.email.value.trim());
      cooldownUntil = Date.now() + 60000;
      status.textContent = 'Se este e-mail estiver cadastrado, você receberá um link para definir a senha. Confira também o spam.';
    } catch (error) {
      status.textContent = error.status === 429
        ? 'Muitas solicitações. Aguarde alguns minutos antes de tentar novamente.'
        : 'Não foi possível enviar o link. Verifique sua conexão e tente novamente.';
    } finally { setBusy(false); }
  };
  updateForm.onsubmit = async event => {
    event.preventDefault();
    if (busy || finished || !verified || !updateForm.reportValidity()) return;
    const password = updateForm.elements.password.value;
    const problem = passwordProblem(password,updateForm.elements.confirmation.value);
    if (problem) { status.textContent = problem; return; }
    setBusy(true); status.textContent = 'Salvando nova senha…';
    try {
      await getCloud().updatePassword(password);
      finished = true;
      updateForm.reset();
      updateForm.hidden = true;
      title.textContent = 'Senha atualizada';
      status.textContent = 'Sua nova senha foi salva. Volte ao login para entrar com ela.';
      back.textContent = 'Voltar ao login';
      back.focus();
    } catch (error) {
      if (['session_not_found','refresh_token_not_found','bad_jwt'].includes(error.code) || error.status === 401) invalid();
      else status.textContent = error.code === 'same_password'
        ? 'Escolha uma senha diferente da anterior.'
        : error.code === 'weak_password'
          ? 'Essa senha não atende aos requisitos de segurança. Use uma senha mais forte.'
          : 'Não foi possível salvar a senha. Verifique a conexão e tente novamente.';
    } finally { setBusy(false); }
  };
  return {
    handleAuth(user,event) {
      if (event === 'PASSWORD_RECOVERY' && user) {
        pending = false; verified = true; finished = false; requiresLogout = true;
        cleanUrl(); status.textContent = 'Escolha uma nova senha com pelo menos 8 caracteres.';
        setBusy(false); show('update'); return true;
      }
      if (pending && event === 'INITIAL_SESSION') { invalid(); return true; }
      if (verified || pending || finished) {
        if (!user && !busy) invalid();
        return true;
      }
      return false;
    }
  };
}
