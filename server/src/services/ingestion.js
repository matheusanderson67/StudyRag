import fs from 'node:fs/promises';
import { getAI } from '../ai/index.js';
import { config } from '../config.js';
import { query, tx } from '../db/pool.js';
import { AIError, PdfError } from '../lib/errors.js';
import { chunkPages } from '../lib/chunker.js';
import { extractPages } from '../lib/pdf.js';

/** PDF -> páginas -> trechos -> embeddings -> JSON MySQL. */
export async function ingestDocument(documentId) {
  const { rows } = await query('SELECT * FROM documents WHERE id = $1', [documentId]);
  const doc = rows[0];
  if (!doc) return;
  const ai = getAI();
  try {
    await query(`UPDATE documents SET status = 'processing', error = NULL WHERE id = $1`, [documentId]);
    const pages = await extractPages(await fs.readFile(doc.stored_path));
    const chunks = chunkPages(pages, config.rag.chunkSize, config.rag.chunkOverlap);
    const vectors = await ai.embedDocuments(chunks.map((c) => c.content));
    if (vectors.length !== chunks.length) throw new Error('Quantidade incorreta de embeddings.');
    await tx(async (c) => {
      await c.query('DELETE FROM chunks WHERE document_id = $1', [documentId]);
      for (let i = 0; i < chunks.length; i++) {
        const item = chunks[i];
        await c.query('INSERT INTO chunks (document_id, group_id, page, idx, content, embedding) VALUES ($1, $2, $3, $4, $5, $6)',
          [documentId, doc.group_id, item.page, item.idx, item.content, JSON.stringify(vectors[i])]);
      }
      await c.query(
        `UPDATE documents SET status = 'ready', error = NULL, page_count = $2, chunk_count = $3, embedding_model = $4 WHERE id = $1`,
        [documentId, pages.length, chunks.length, ai.embeddingModelId],
      );
    });
  } catch (err) {
    const friendly = err instanceof PdfError || err instanceof AIError ? err.message : 'Não foi possível processar o PDF.';
    if (!(err instanceof PdfError)) console.error('[ingestão]', documentId, err);
    await query(`UPDATE documents SET status = 'error', error = $2 WHERE id = $1`, [documentId, friendly]);
  }
}
