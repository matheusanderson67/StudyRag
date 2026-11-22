import multer from 'multer';
import { prepareChatImage } from '../services/chat-image.js';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { config } from '../config.js';
import { query, tx } from '../db/pool.js';
import { requireAuth, requireMember } from '../middleware/auth.js';
import { forbidden, badRequest, notFound } from '../lib/errors.js';

export function createChatRouter({ runQuery = query, runTx = tx, intervalMs = 1000 } = {}) {
  const router = Router({ mergeParams: true });
  const connections = new Map();
  const dto = r => ({ id: String(r.id), userId: r.user_id, name: r.name, content: r.content,
    createdAt: new Date(r.created_at).toISOString(), clientId: r.client_id, hasImage: Boolean(r.has_image) });
  const select = `SELECT m.id, m.user_id, m.client_id, m.content, m.created_at, u.name, EXISTS(SELECT 1 FROM group_message_images img WHERE img.message_id = m.id) AS has_image
    FROM group_messages m JOIN users u ON u.id = m.user_id
    JOIN group_members gm ON gm.group_id = m.group_id AND gm.user_id = $2
    WHERE m.group_id = $1`;
  const cursor = z.string().regex(/^[1-9]\d{0,19}$/).optional();
  router.use(requireAuth, requireMember);
  router.use(async (req, _res, next) => {
    if ((await runQuery('SELECT 1 FROM personal_spaces WHERE group_id = $1', [req.group.id])).rowCount) throw forbidden('O chat está disponível nos grupos de estudo.');
    next();
  });
  router.get('/messages', async (req, res) => {
    const before = cursor.parse(req.query.before);
    const params = [req.group.id, req.userId];
    const filter = before ? ' AND m.id < $3' : '';
    if (before) params.push(before);
    const { rows } = await runQuery(`${select}${filter} ORDER BY m.id DESC LIMIT 51`, params);
    const page = rows.slice(0, 50);
    res.set('Cache-Control', 'no-store').json({ messages: page.map(dto).reverse(),
      nextBefore: rows.length > 50 ? String(page.at(-1).id) : null });
  });
  const sendLimit = rateLimit({ windowMs: 60000, limit: 30, keyGenerator: req => req.userId,
    standardHeaders: true, legacyHeaders: false, message: { error: 'Limite de 30 mensagens por minuto. Aguarde um pouco.' } });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 2, fieldSize: 10000 } });
  const receivePhoto = (req, res, next) => upload.single('image')(req, res, err => {
    if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Envie uma foto de até 5 MB.' });
    next(err);
  });
  router.post('/messages', sendLimit, receivePhoto, async (req, res) => {
    const body = z.object({ content: z.string().trim().max(2000, 'Use até 2.000 caracteres.'), clientId: z.string().uuid() }).parse(req.body);
    if (!body.content && !req.file) throw badRequest('Escreva uma mensagem ou escolha uma foto.');
    const photo = req.file ? await prepareChatImage(req.file.buffer) : null;
    const persist = async run => {
    // Recheck membership in the write statement too. Retry with same clientId is idempotent.
    await run(`INSERT INTO group_messages (group_id, user_id, client_id, content)
      SELECT $1, $2, $3, $4 FROM group_members WHERE group_id = $1 AND user_id = $2
      ON DUPLICATE KEY UPDATE client_id = group_messages.client_id`, [req.group.id, req.userId, body.clientId, body.content]);
    if (photo) {
      const result = await run('SELECT id FROM group_messages WHERE group_id = $1 AND user_id = $2 AND client_id = $3', [req.group.id, req.userId, body.clientId]);
      if (!result.rows[0]) throw forbidden('Você não participa mais deste grupo.');
      await run('INSERT IGNORE INTO group_message_images (message_id, image_data, mime_type) VALUES ($1, $2, $3)', [result.rows[0].id, photo.data, photo.mime]);
    }
    };
    if (photo) await runTx(c => persist(c.query)); else await persist(runQuery);
    const { rows } = await runQuery(`${select} AND m.user_id = $2 AND m.client_id = $3`, [req.group.id, req.userId, body.clientId]);
    if (!rows[0]) throw forbidden('Você não participa mais deste grupo.');
    res.status(201).json({ message: dto(rows[0]) });
  });
  router.get('/messages/:messageId/image', async (req, res) => {
    const id = cursor.parse(req.params.messageId);
    const { rows } = await runQuery(`SELECT img.image_data, img.mime_type FROM group_message_images img
      JOIN group_messages m ON m.id = img.message_id
      JOIN group_members gm ON gm.group_id = m.group_id AND gm.user_id = $2
      WHERE m.group_id = $1 AND m.id = $3`, [req.group.id, req.userId, id]);
    if (!rows[0]) throw notFound('Foto não encontrada.');
    res.set({ 'Content-Type': 'image/webp', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }).send(rows[0].image_data);
  });
  router.get('/events', async (req, res) => {
    if ((connections.get(req.userId) || 0) >= 3) return res.status(429).json({ error: 'Feche outra aba de conversa antes de continuar.' });
    connections.set(req.userId, (connections.get(req.userId) || 0) + 1);
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    let closed = false, timer, last = '', ticks = 0;
    const token = req.headers.authorization.slice(7);
    const close = () => { if (closed) return; closed = true; clearTimeout(timer);
      const count = (connections.get(req.userId) || 1) - 1;
      if (count) connections.set(req.userId, count); else connections.delete(req.userId);
    };
    res.on('close', close);
    const send = (event, data) => {
      if (closed || res.writableEnded) return false;
      if (!res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)) { res.end(); close(); return false; }
      return true;
    };
    const tick = async () => {
      try {
        jwt.verify(token, config.jwt.secret);
        const member = await runQuery('SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2', [req.group.id, req.userId]);
        if (!member.rowCount) { send('revoked', {}); res.end(); close(); return; }
        const { rows } = await runQuery(`${select} ORDER BY m.id DESC LIMIT 50`, [req.group.id, req.userId]);
        const messages = rows.map(dto).reverse();
        const signature = messages.map(m => m.id).join(',');
        if (signature !== last || ticks === 0) { send('messages', { messages }); last = signature; }
        if (++ticks % 15 === 0) send('heartbeat', {});
      } catch (err) {
        send(err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError' ? 'expired' : 'unavailable', {});
        res.end(); close(); return;
      }
      if (!closed) timer = setTimeout(tick, intervalMs);
    };
    void tick();
  });
  return router;
}
export default createChatRouter();
