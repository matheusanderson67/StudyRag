import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { query, tx } from '../db/pool.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { idParam, requireAuth, requireMember } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I para evitar confusão
const newCode = () => Array.from({ length: 8 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');

const groupSchema = z.object({
  name: z.string().trim().min(2, 'Dê um nome ao grupo.').max(80),
  description: z.string().trim().max(300).optional().default(''),
  subject: z.string().trim().max(80).optional().default(''),
  period: z.string().trim().max(40).optional().default(''),
});

async function insertGroup(client, userId, data) {
  for (let i = 0; i < 5; i++) {
    try {
      const id = crypto.randomUUID();
      const code = newCode();
      await client.query(
        `INSERT INTO \`groups\` (id, name, description, subject, period, invite_code, owner_id) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, data.name, data.description, data.subject, data.period, code, userId],
      );
      return { id, ...data, invite_code: code, owner_id: userId };
    } catch (e) {
      if (e.code !== 'ER_DUP_ENTRY') throw e; // código repetido: tenta outro
    }
  }
  throw new Error('Não consegui gerar um código de convite único.');
}

router.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT g.id, g.name, g.description, g.subject, g.period, gm.role,
            (SELECT COUNT(*) FROM group_members m WHERE m.group_id = g.id) AS member_count,
            (SELECT COUNT(*) FROM documents d WHERE d.group_id = g.id AND d.status = 'ready'
               AND (d.visibility = 'group' OR d.uploader_id = $1)) AS document_count
       FROM \`groups\` g JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = $1
      WHERE NOT EXISTS (SELECT 1 FROM personal_spaces ps WHERE ps.group_id = g.id)
      ORDER BY g.created_at DESC`,
    [req.userId],
  );
  res.json({ groups: rows });
});

router.post('/', async (req, res) => {
  const data = groupSchema.parse(req.body);
  const group = await tx(async (c) => {
    const g = await insertGroup(c, req.userId, data);
    await c.query(`INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'owner')`, [g.id, req.userId]);
    return g;
  });
  res.status(201).json({ group: { ...group, role: 'owner' } });
});

router.post('/join', async (req, res) => {
  const { code } = z.object({ code: z.string().trim().min(4, 'Informe o código de convite.').max(20) }).parse(req.body);
  const { rows } = await query('SELECT id, name FROM `groups` WHERE invite_code = $1 AND NOT EXISTS (SELECT 1 FROM personal_spaces ps WHERE ps.group_id = `groups`.id)', [code.toUpperCase()]);
  if (!rows[0]) throw notFound('Código de convite inválido.');
  await query(`INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'member') ON DUPLICATE KEY UPDATE group_id = group_id`, [rows[0].id, req.userId]);
  res.json({ group: rows[0] });
});

router.get('/:groupId', requireMember, async (req, res) => {
  const { rows } = await query('SELECT id, name, description, subject, period, invite_code, owner_id, created_at FROM `groups` WHERE id = $1', [req.group.id]);
  const members = await query(
    `SELECT u.id, u.name, gm.role, gm.joined_at FROM group_members gm JOIN users u ON u.id = gm.user_id
      WHERE gm.group_id = $1 ORDER BY gm.role DESC, gm.joined_at`,
    [req.group.id],
  );
  res.json({ group: { ...rows[0], role: req.group.role }, members: members.rows });
});

router.post('/:groupId/invite/rotate', requireMember, async (req, res) => {
  if (req.group.role !== 'owner') throw forbidden('Só o dono do grupo pode gerar um novo código.');
  if ((await query('SELECT 1 FROM personal_spaces WHERE group_id = $1', [req.group.id])).rowCount) throw forbidden('Este espaço individual não possui convites.');
  const inviteCode = newCode();
  await query('UPDATE `groups` SET invite_code = $2 WHERE id = $1', [req.group.id, inviteCode]);
  res.json({ inviteCode });
});

async function removeFiles(rows) {
  await Promise.all(rows.map((r) => fs.rm(r.stored_path, { force: true })));
}

router.post('/:groupId/leave', requireMember, async (req, res) => {
  if (req.group.role === 'owner') throw badRequest('O dono não pode sair do grupo. Exclua o grupo se quiser encerrá-lo.');
  const privateDocs = await query(`SELECT stored_path FROM documents WHERE group_id = $1 AND uploader_id = $2 AND visibility = 'private'`, [req.group.id, req.userId]);
  await query(`DELETE FROM documents WHERE group_id = $1 AND uploader_id = $2 AND visibility = 'private'`, [req.group.id, req.userId]);
  await removeFiles(privateDocs.rows);
  await query('DELETE FROM group_members WHERE group_id = $1 AND user_id = $2', [req.group.id, req.userId]);
  res.status(204).end();
});

router.delete('/:groupId/members/:userId', requireMember, idParam('userId'), async (req, res) => {
  if (req.group.role !== 'owner') throw forbidden('Só o dono do grupo pode remover membros.');
  if (req.params.userId === req.userId) throw badRequest('Use "Sair do grupo" para sair.');
  const privateDocs = await query(`SELECT stored_path FROM documents WHERE group_id = $1 AND uploader_id = $2 AND visibility = 'private'`, [req.group.id, req.params.userId]);
  await query(`DELETE FROM documents WHERE group_id = $1 AND uploader_id = $2 AND visibility = 'private'`, [req.group.id, req.params.userId]);
  await removeFiles(privateDocs.rows);
  await query('DELETE FROM group_members WHERE group_id = $1 AND user_id = $2', [req.group.id, req.params.userId]);
  res.status(204).end();
});

router.delete('/:groupId', requireMember, async (req, res) => {
  if (req.group.role !== 'owner') throw forbidden('Só o dono do grupo pode excluí-lo.');
  if ((await query('SELECT 1 FROM personal_spaces WHERE group_id = $1', [req.group.id])).rowCount) throw forbidden('O espaço individual não pode ser excluído como um grupo.');
  await query('DELETE FROM `groups` WHERE id = $1', [req.group.id]);
  await fs.rm(path.join(config.uploadDir, req.group.id), { recursive: true, force: true });
  res.status(204).end();
});

export default router;
