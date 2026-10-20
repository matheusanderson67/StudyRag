import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { conflict, unauthorized } from '../lib/errors.js';
import { requireAuth, signToken } from '../middleware/auth.js';

const router = Router();

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Informe seu nome.').max(80),
  email: z.string().trim().toLowerCase().email('E-mail inválido.').max(200),
  password: z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres.').max(72, 'Senha longa demais.'),
});
const loginSchema = z.object({ email: z.string().trim().toLowerCase().email('E-mail inválido.'), password: z.string().min(1, 'Informe a senha.') });

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email });
const DUMMY_HASH = bcrypt.hashSync('senha-falsa-para-igualar-o-tempo', 10);

router.post('/register', async (req, res) => {
  const { name, email, password } = registerSchema.parse(req.body);
  const exists = await query('SELECT 1 FROM users WHERE lower(email) = $1', [email]);
  if (exists.rowCount) throw conflict('Já existe uma conta com este e-mail.');
  const hash = await bcrypt.hash(password, 10);
  const id = randomUUID();
  await query('INSERT INTO users (id, name, email, password_hash) VALUES ($1, $2, $3, $4)', [id, name, email, hash]);
  res.status(201).json({ token: signToken(id), user: { id, name, email } });
});

router.post('/login', async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const { rows } = await query('SELECT * FROM users WHERE lower(email) = $1', [email]);
  const ok = await bcrypt.compare(password, rows[0]?.password_hash ?? DUMMY_HASH);
  if (!rows[0] || !ok) throw unauthorized('E-mail ou senha incorretos.');
  res.json({ token: signToken(rows[0].id), user: publicUser(rows[0]) });
});

router.get('/me', requireAuth, async (req, res) => {
  const { rows } = await query('SELECT id, name, email FROM users WHERE id = $1', [req.userId]);
  if (!rows[0]) throw unauthorized('Conta não encontrada. Entre novamente.');
  res.json({ user: rows[0] });
});

export default router;
