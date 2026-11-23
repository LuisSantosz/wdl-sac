export function passwordProblem(password,confirmation) {
  if (password.length < 8) return 'Use pelo menos 8 caracteres.';
  if (password.length > 128) return 'Use no máximo 128 caracteres.';
  if (password !== confirmation) return 'As senhas não coincidem.';
  return '';
}
export function recoveryIntent(href) {
  const url = new URL(href), hash = new URLSearchParams(url.hash.slice(1));
  return hash.get('type') === 'recovery' || hash.has('error') || hash.has('error_code') || url.searchParams.has('error');
}
export function cleanAuthUrl(href) {
  const url = new URL(href);
  const keys = ['access_token','refresh_token','expires_in','expires_at','token_type','type','error','error_code','error_description','code'];
  const hash = new URLSearchParams(url.hash.slice(1));
  if (keys.some(key => hash.has(key))) url.hash = '';
  for (const key of keys) url.searchParams.delete(key);
  return url.pathname + url.search + url.hash;
}
