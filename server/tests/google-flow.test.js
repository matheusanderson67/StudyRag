import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleFlow } from '../src/services/google.js';
const settings = { clientId: 'client', clientSecret: 'secret', redirectUri: 'http://localhost/callback' };
test('Google start uses unpredictable state and PKCE', () => {
  const flow = createGoogleFlow(settings);
  const a = flow.start(), b = flow.start();
  assert.notEqual(a.state, b.state);
  const params = new URL(a.url).searchParams;
  assert.equal(params.get('code_challenge_method'), 'S256');
  assert.equal(params.get('scope'), 'openid email profile');
});
test('Google rejects invalid state before contacting provider', async () => {
  const flow = createGoogleFlow(settings, () => { throw new Error('Should not call'); });
  await assert.rejects(() => flow.finish({ state: 'a', expectedState: 'b', verifier: 'v', code: 'c' }), /Sessão/);
});
test('Google exchanges code server-side and requires verified email', async () => {
  let verified = true;
  const flow = createGoogleFlow(settings, async (url, init) => {
    if (url.includes('/token')) {
      assert.equal(init.body.get('client_secret'), 'secret');
      assert.equal(init.body.get('code_verifier'), 'verifier');
      return { ok: true, json: async () => ({ access_token: 'access' }) };
    }
    assert.equal(init.headers.Authorization, 'Bearer access');
    return { ok: true, json: async () => ({ sub: '123', name: 'Aluno', email: 'A@example.com', email_verified: verified }) };
  });
  const input = { state: 'state', expectedState: 'state', verifier: 'verifier', code: 'code' };
  assert.equal((await flow.finish(input)).email, 'a@example.com');
  verified = false;
  await assert.rejects(() => flow.finish(input), /verificado/);
});
