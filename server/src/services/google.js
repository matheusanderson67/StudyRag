import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function createGoogleFlow(settings, fetchImpl = fetch) {
  return {
    start() {
      const state = randomBytes(32).toString('base64url');
      const verifier = randomBytes(48).toString('base64url');
      const params = new URLSearchParams({ client_id: settings.clientId, redirect_uri: settings.redirectUri,
        response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account',
        code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url') });
      return { state, verifier, url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` };
    },
    async finish({ state, expectedState, verifier, code }) {
      if (typeof state !== 'string' || !expectedState || !verifier || typeof code !== 'string' ||
          state.length !== expectedState.length || !timingSafeEqual(Buffer.from(state), Buffer.from(expectedState))) {
        throw new Error('Sessão do Google inválida. Tente entrar novamente.');
      }
      const response = await fetchImpl('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: settings.clientId, client_secret: settings.clientSecret,
          redirect_uri: settings.redirectUri, grant_type: 'authorization_code', code_verifier: verifier }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error('Não foi possível validar o acesso com Google.');
      const tokens = await response.json();
      if (!tokens.access_token) throw new Error('Google não retornou credencial.');
      const info = await fetchImpl('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(10000),
      });
      if (!info.ok) throw new Error('Não foi possível consultar o perfil do Google.');
      const profile = await info.json();
      if (profile.email_verified !== true || typeof profile.sub !== 'string' || !profile.sub || profile.sub.length > 255 ||
          typeof profile.email !== 'string' || !profile.email.includes('@') || profile.email.length > 200) {
        throw new Error('O Google precisa fornecer um e-mail verificado.');
      }
      return { sub: profile.sub, email: profile.email.toLowerCase(), name: String(profile.name || profile.email).slice(0, 80) };
    },
  };
}
