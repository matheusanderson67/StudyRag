import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { getAI } from '../ai/index.js';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { idParam, requireAuth, requireMember } from '../middleware/auth.js';
import { ingestDocument } from '../services/ingestion.js';

const router = Router();
router.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxPdfBytes, files: 1 } });
const visibilitySchema = z.enum(['group', 'private'], { message: 'Visibilidade inválida.' });

const SELECT = `SELECT d.id, d.group_id, d.filename, d.size_bytes, d.visibility, d.status, d.error, d.page_count, d.chunk_count,
    d.created_at, d.uploader_id, u.name AS uploader_name, d.stored_path,
    (d.status = 'ready' AND NOT (d.embedding_model <=> $2)) AS outdated
  FROM documents d JOIN users u ON u.id = d.uploader_id`;

const dto = (d, userId, role) => ({
  id: d.id,
  filename: d.filename,
  sizeBytes: Number(d.size_bytes),
  visibility: d.visibility,
  status: d.status,
  error: d.error,
  pageCount: d.page_count,
  chunkCount: d.chunk_count,
  createdAt: d.created_at,
  uploaderId: d.uploader_id,
  uploaderName: d.uploader_name,
  outdated: Boolean(d.outdated),
  mine: d.uploader_id === userId,
  canDelete: d.uploader_id === userId || (role === 'owner' && d.visibility === 'group'),
});

const startIngestion = (id) => setImmediate(() => ingestDocument(id).catch((e) => console.error('[ingestão]', e)));

router.get('/groups/:groupId/documents', requireMember, async (req, res) => {
  const { rows } = await query(
    `${SELECT} WHERE d.group_id = $1 AND (d.visibility = 'group' OR d.uploader_id = $3) ORDER BY d.created_at DESC`,
    [req.group.id, getAI().embeddingModelId, req.userId],
  );
  res.json({ documents: rows.map((d) => dto(d, req.userId, req.group.role)) });
});

router.post('/groups/:groupId/documents', requireMember, upload.single('file'), async (req, res) => {
  if (!req.file) throw badRequest('Envie um arquivo PDF.');
  const visibility = visibilitySchema.parse(req.body.visibility || 'group');
  const buffer = req.file.buffer;
  if (!buffer.length) throw badRequest('O arquivo está vazio.');
  if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') throw badRequest('O arquivo não é um PDF válido.');

  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const dup = await query('SELECT 1 FROM documents WHERE group_id = $1 AND uploader_id = $2 AND sha256 = $3', [req.group.id, req.userId, sha256]);
  if (dup.rowCount) throw conflict('Você já enviou este PDF neste grupo.');

  // multer entrega o nome em latin1; reconverte para UTF-8 e remove caracteres perigosos.
  let name = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  name = path.basename(name).replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 120) || 'documento.pdf';
  if (!/\.pdf$/i.test(name)) name += '.pdf';

  const dir = path.join(config.uploadDir, req.group.id);
  await fs.mkdir(dir, { recursive: true });
  const storedPath = path.join(dir, `${sha256.slice(0, 16)}_${name}`);
  await fs.writeFile(storedPath, buffer);

  const id = crypto.randomUUID();
  try {
    await query(
      `INSERT INTO documents (id, group_id, uploader_id, filename, stored_path, size_bytes, sha256, visibility)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, req.group.id, req.userId, name, storedPath, buffer.length, sha256, visibility],
    );
  } catch (error) { await fs.rm(storedPath, { force: true }); throw error; }
  startIngestion(id);
  const doc = (await query(`${SELECT} WHERE d.id = $1`, [id, getAI().embeddingModelId])).rows[0];
  res.status(202).json({ document: dto(doc, req.userId, req.group.role) });
});

/** Carrega o documento só se o usuário for membro do grupo e puder vê-lo (privados: só o autor). */
async function loadDocument(req) {
  const { rows } = await query(
    `${SELECT} JOIN group_members gm ON gm.group_id = d.group_id AND gm.user_id = $3
      WHERE d.id = $1 AND (d.visibility = 'group' OR d.uploader_id = $3)`,
    [req.params.documentId, getAI().embeddingModelId, req.userId],
  );
  if (!rows[0]) throw notFound('Documento não encontrado.');
  const role = (await query('SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2', [rows[0].group_id, req.userId])).rows[0].role;
  return { doc: rows[0], role };
}

router.patch('/documents/:documentId', idParam('documentId'), async (req, res) => {
  const { visibility } = z.object({ visibility: visibilitySchema }).parse(req.body);
  const { doc, role } = await loadDocument(req);
  if (doc.uploader_id !== req.userId) throw forbidden('Só quem enviou o documento pode mudar a visibilidade.');
  await query('UPDATE documents SET visibility = $2 WHERE id = $1', [doc.id, visibility]);
  res.json({ document: dto({ ...doc, visibility }, req.userId, role) });
});

router.post('/documents/:documentId/reindex', idParam('documentId'), async (req, res) => {
  const { doc, role } = await loadDocument(req);
  if (!dto(doc, req.userId, role).canDelete) throw forbidden('Só quem enviou o documento (ou o dono do grupo, nos compartilhados) pode reindexar.');
  if (doc.status === 'processing') throw conflict('O documento já está sendo processado.');
  await query(`UPDATE documents SET status = 'processing', error = NULL WHERE id = $1`, [doc.id]);
  startIngestion(doc.id);
  res.status(202).json({ ok: true });
});

router.delete('/documents/:documentId', idParam('documentId'), async (req, res) => {
  const { doc, role } = await loadDocument(req);
  if (!dto(doc, req.userId, role).canDelete) throw forbidden('Você não pode excluir este documento.');
  await query('DELETE FROM documents WHERE id = $1', [doc.id]);
  await fs.rm(doc.stored_path, { force: true });
  res.status(204).end();
});

export default router;
