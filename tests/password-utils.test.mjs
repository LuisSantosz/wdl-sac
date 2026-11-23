import test from 'node:test';
import assert from 'node:assert/strict';
import {passwordProblem,recoveryIntent,cleanAuthUrl} from '../dist/password-utils.mjs';
test('validates password length and confirmation without trimming passwords',()=>{
  assert.ok(passwordProblem('short','short'));
  assert.ok(passwordProblem('a'.repeat(129),'a'.repeat(129)));
  assert.ok(passwordProblem('abcdefgh','abcdefgi'));
  assert.equal(passwordProblem('abcdefgh','abcdefgh'),'');
  assert.equal(passwordProblem(' 1234567',' 1234567'),'');
});
test('detects recovery or expired links, not normal navigation',()=>{
  assert.equal(recoveryIntent('https://example.com/#type=recovery&access_token=test'),true);
  assert.equal(recoveryIntent('https://example.com/#error=access_denied'),true);
  assert.equal(recoveryIntent('https://example.com/?error=expired'),true);
  assert.equal(recoveryIntent('https://example.com/#main-workspace'),false);
});
test('removes auth secrets from URL and preserves unrelated parameters',()=>{
  assert.equal(cleanAuthUrl('https://example.com/?tab=1#access_token=test&refresh_token=test&type=recovery'),'/?tab=1');
  assert.equal(cleanAuthUrl('https://example.com/?error=expired&error_description=test&tab=1'),'/?tab=1');
  assert.equal(cleanAuthUrl('https://example.com/#main-workspace'),'/#main-workspace');
});
