import crypto from 'node:crypto';
import { Router } from 'express';
import { query, tx } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// O espaço individual é uma área isolada que reutiliza o pipeline RAG já testado.
// O código não é compartilhado e a rota de entrada de grupos recusa espaços pessoais.
router.get('/space', async (req, res) => {
  const existing = (await query('SELECT group_id FROM personal_spaces WHERE user_id = $1', [req.userId])).rows[0];
  if (existing) return res.json({ groupId: existing.group_id });

  let groupId;
  try { groupId = await tx(async (client) => {
    const found = (await client.query('SELECT group_id FROM personal_spaces WHERE user_id = $1', [req.userId])).rows[0];
    if (found) return found.group_id;
    const id = crypto.randomUUID();
    const code = `P${crypto.randomBytes(9).toString('hex').toUpperCase()}`;
    await client.query(`INSERT INTO \`groups\` (id,name,description,subject,period,invite_code,owner_id) VALUES ($1,'Meu espaço individual','Biblioteca e atividades privadas','','',$2,$3)`, [id,code,req.userId]);
    await client.query(`INSERT INTO group_members (group_id,user_id,role) VALUES ($1,$2,'owner')`, [id,req.userId]);
    await client.query('INSERT INTO personal_spaces (user_id,group_id) VALUES ($1,$2)', [req.userId,id]);
    return id;
  }); } catch (error) {
    if (error.code !== 'ER_DUP_ENTRY') throw error;
    const same = (await query('SELECT group_id FROM personal_spaces WHERE user_id = $1', [req.userId])).rows[0];
    if (!same) throw error;
    groupId = same.group_id;
  }
  res.json({ groupId });
});

export default router;
