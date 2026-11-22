import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query, tx } from '../db/pool.js';
import { signToken } from '../middleware/auth.js';
import { unauthorized } from '../lib/errors.js';
import { createGoogleFlow } from '../services/google.js';

const router = Router();
const enabled = Boolean(config.google.clientId && config.google.clientSecret);
const flow = createGoogleFlow(config.google);
const options = { httpOnly: true, sameSite: 'lax', secure: config.env === 'production', path: '/api/auth/google' };
const cookie = (req, key) => (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${key}=`))?.slice(key.length + 1);
const landing = (status) => `${config.google.frontendUrl}/login?google=${status}`;

router.get('/config', (_req, res) => res.json({ enabled }));
router.get('/start', (_req, res) => {
  if (!enabled) return res.redirect(landing('disabled'));
  res.clearCookie('google_handoff', options);
  const start = flow.start();
  res.cookie('google_state', start.state, { ...options, maxAge: 600000 });
  res.cookie('google_verifier', start.verifier, { ...options, maxAge: 600000 });
  res.redirect(start.url);
});
router.get('/callback', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.clearCookie('google_state', options);
  res.clearCookie('google_verifier', options);
  try {
    if (!enabled || req.query.error) return res.redirect(landing('cancelled'));
    const profile = await flow.finish({ state: req.query.state, expectedState: cookie(req, 'google_state'),
      verifier: cookie(req, 'google_verifier'), code: req.query.code });
    const known = await query('SELECT user_id FROM google_accounts WHERE google_sub = $1', [profile.sub]);
    let id = known.rows[0]?.user_id;
    if (!id) {
      // Never merge accounts merely because their email addresses match.
      const exists = await query('SELECT id FROM users WHERE lower(email) = $1', [profile.email]);
      if (exists.rowCount) return res.redirect(landing('existing'));
      id = randomUUID();
      const hash = await bcrypt.hash(randomBytes(48).toString('hex'), 10);
      await tx(async c => {
        await c.query('INSERT INTO users (id, name, email, password_hash) VALUES ($1, $2, $3, $4)', [id, profile.name, profile.email, hash]);
        await c.query('INSERT INTO google_accounts (google_sub, user_id) VALUES ($1, $2)', [profile.sub, id]);
      });
    }
    // Temporary HttpOnly handoff; no access token or app JWT in redirect URLs.
    const handoff = jwt.sign({ sub: id, purpose: 'google-handoff' }, config.jwt.secret, { expiresIn: '60s', audience: 'google-session' });
    res.cookie('google_handoff', handoff, { ...options, maxAge: 60000 });
    res.redirect(landing('success'));
  } catch (err) {
    console.error('[google-login]', err.code || err.name);
    res.redirect(landing('failed'));
  }
});
router.post('/session', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (req.headers.origin !== config.google.frontendUrl) throw unauthorized('Origem inválida.');
  res.clearCookie('google_handoff', options);
  let payload;
  try {
    payload = jwt.verify(cookie(req, 'google_handoff'), config.jwt.secret, { audience: 'google-session', algorithms: ['HS256'] });
    if (payload.purpose !== 'google-handoff') throw new Error();
  } catch { throw unauthorized('Entre novamente com Google.'); }
  const { rows } = await query('SELECT id, name, email FROM users WHERE id = $1', [payload.sub]);
  if (!rows[0]) throw unauthorized();
  res.json({ token: signToken(payload.sub), user: rows[0] });
});
export default router;
