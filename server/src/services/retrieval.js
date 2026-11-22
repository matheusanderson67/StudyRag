import { vectorStore } from '../vector/index.js';
import { getAI } from '../ai/index.js';
import { query } from '../db/pool.js';
import { notFound } from '../lib/errors.js';
import { contentTokens, stem } from '../lib/text.js';

// Local cosine search or Qdrant vector ranking, combined with lexical matches.
const LIMIT_CANDIDATES = 4000;
const RRF_K = 60;

export async function assertVisibleDocument(groupId, userId, documentId) {
  if (!documentId) return null;
  const { rowCount } = await query(
    `SELECT 1 FROM documents WHERE id = $1 AND group_id = $2 AND (visibility = 'group' OR uploader_id = $3)`,
    [documentId, groupId, userId],
  );
  if (!rowCount) throw notFound('Documento não encontrado.');
  return documentId;
}

export async function countReadyDocuments(groupId, userId, documentId = null) {
  const { rows } = await query(
    `SELECT COUNT(*) AS n FROM documents d WHERE d.group_id = $1 AND d.status = 'ready' AND d.embedding_model = $2
       AND (d.visibility = 'group' OR d.uploader_id = $3) AND ($4 IS NULL OR d.id = $4)`,
    [groupId, getAI().embeddingModelId, userId, documentId],
  );
  return Number(rows[0].n);
}

function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

function wordScore(tokens, content) {
  if (!tokens.length) return 0;
  const found = new Set(contentTokens(content, { accents: false }).map(stem));
  return tokens.reduce((count, token) => count + Number(found.has(token)), 0) / tokens.length;
}

export async function retrieve({ groupId, userId, documentId = null, question, queryVector, limit }) {
  const { rows } = await query(
    `SELECT c.id, c.content, c.page, ${vectorStore ? 'NULL' : 'c.embedding'} AS embedding, d.id AS document_id, d.filename, u.name AS uploader
       FROM chunks c JOIN documents d ON d.id = c.document_id JOIN users u ON u.id = d.uploader_id
      WHERE d.group_id = $1 AND d.status = 'ready' AND d.embedding_model = $2
        AND (d.visibility = 'group' OR d.uploader_id = $3) AND ($4 IS NULL OR d.id = $4)
      ORDER BY d.created_at DESC, c.id DESC LIMIT ${LIMIT_CANDIDATES}`,
    [groupId, getAI().embeddingModelId, userId, documentId],
  );
  let hits = null;
  if (vectorStore) {
    const visible = await query(
      `SELECT id FROM documents WHERE group_id = $1 AND status = 'ready' AND embedding_model = $2
       AND (visibility = 'group' OR uploader_id = $3) AND ($4 IS NULL OR id = $4)`,
      [groupId, getAI().embeddingModelId, userId, documentId],
    );
    hits = await vectorStore.search(getAI().embeddingModelId, queryVector, visible.rows.map(d => d.id));
    if (hits.length) {
      // Recheck current SQL permissions and status; never trust index payloads for access.
      const ids = hits.map(h => h.id);
      const extra = await query(
        `SELECT c.id, c.content, c.page, NULL AS embedding, d.id AS document_id, d.filename, u.name AS uploader
         FROM chunks c JOIN documents d ON d.id = c.document_id JOIN users u ON u.id = d.uploader_id
         WHERE c.id IN (${ids.map((_, i) => `$${i + 5}`).join(',')})
         AND d.group_id = $1 AND d.status = 'ready' AND d.embedding_model = $2
         AND (d.visibility = 'group' OR d.uploader_id = $3) AND ($4 IS NULL OR d.id = $4)`,
        [groupId, getAI().embeddingModelId, userId, documentId, ...ids],
      );
      const existing = new Set(rows.map(r => String(r.id)));
      rows.push(...extra.rows.filter(r => !existing.has(String(r.id))));
    }
  }
  const similarities = new Map((hits ?? []).map(h => [String(h.id), h.score]));
  const tokens = [...new Set(contentTokens(question, { accents: false }).map(stem))].slice(0, 20);
  const candidates = rows.map((r) => ({
    ...r,
    similarity: hits ? (similarities.get(String(r.id)) ?? 0) : cosine(queryVector, typeof r.embedding === 'string' ? JSON.parse(r.embedding) : r.embedding),
    lexical: wordScore(tokens, r.content),
  }));
  const vector = candidates.filter(r => !hits || similarities.has(String(r.id))).sort((a,b) => b.similarity - a.similarity).slice(0, 30);
  const textual = candidates.filter((r) => r.lexical > 0).sort((a,b) => b.lexical - a.lexical).slice(0, 30);
  const ranks = new Map();
  for (const list of [vector, textual]) list.forEach((r, i) => {
    ranks.set(r.id, (ranks.get(r.id) ?? 0) + 1 / (RRF_K + i + 1));
  });
  return candidates.filter((r) => ranks.has(r.id)).map(({ embedding, lexical, ...r }) => ({ ...r, score: ranks.get(r.id) }))
    .sort((a,b) => b.score - a.score || b.similarity - a.similarity).slice(0, limit);
}

export async function loadMaterial({ groupId, userId, documentId = null, onlyShared = false, max }) {
  const { rows } = await query(
    `SELECT c.content, c.page, d.filename, d.id AS document_id
       FROM chunks c JOIN documents d ON d.id = c.document_id
      WHERE d.group_id = $1 AND d.status = 'ready' AND d.embedding_model = $2
        AND ($3 IS NULL OR d.id = $3)
        AND (d.visibility = 'group' OR ($4 = 0 AND d.uploader_id = $5))
      ORDER BY d.created_at, c.page, c.idx`,
    [groupId, getAI().embeddingModelId, documentId, onlyShared ? 1 : 0, userId],
  );
  if (rows.length <= max) return rows;
  const step = rows.length / max;
  return Array.from({ length: max }, (_, i) => rows[Math.floor(i * step)]);
}

export const uniqueSources = (chunks) => {
  const seen = new Map();
  for (const c of chunks) seen.set(`${c.document_id}:${c.page}`, { documentId: c.document_id, filename: c.filename, page: c.page });
  return [...seen.values()];
};
