import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { notFound, unauthorized } from '../lib/errors.js';

export const signToken = (userId) => jwt.sign({ sub: userId }, config.jwt.secret, { expiresIn: config.jwt.expiresIn });

export function requireAuth(req, _res, next) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw unauthorized();
  try {
    req.userId = jwt.verify(token, config.jwt.secret).sub;
  } catch {
    throw unauthorized('Sessão expirada. Entre novamente.');
  }
  next();
}

const uuid = z.string().uuid();

/** Garante que o usuário logado é membro do grupo em :groupId. Não revela se o grupo existe. */
export async function requireMember(req, _res, next) {
  const groupId = uuid.safeParse(req.params.groupId);
  if (!groupId.success) throw notFound('Grupo não encontrado.');
  const { rows } = await query('SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2', [
    groupId.data,
    req.userId,
  ]);
  if (!rows.length) throw notFound('Grupo não encontrado.');
  req.group = { id: groupId.data, role: rows[0].role };
  next();
}

export const idParam = (name) => (req, _res, next) => {
  if (!uuid.safeParse(req.params[name]).success) throw notFound();
  next();
};
