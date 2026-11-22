import { getAI } from '../src/ai/index.js';
import { pool, query } from '../src/db/pool.js';
import { vectorStore } from '../src/vector/index.js';

try {
  if (!vectorStore) throw new Error('Defina VECTOR_STORE=qdrant no .env.');
  const model = getAI().embeddingModelId;
  const docs = await query("SELECT id FROM documents WHERE status = 'ready' AND embedding_model = $1", [model]);
  let total = 0;
  for (const doc of docs.rows) {
    // Run with uploads/reindexing paused. Existing embeddings avoid new AI charges.
    await vectorStore.remove('document_id', doc.id);
    let last = 0;
    while (true) {
      const { rows } = await query('SELECT id, document_id, group_id, embedding FROM chunks WHERE document_id = $1 AND id > $2 ORDER BY id LIMIT 100', [doc.id, last]);
      if (!rows.length) break;
      await vectorStore.upsert(model, rows);
      total += rows.length;
      last = rows.at(-1).id;
    }
    console.log(`Indexado: ${doc.id}`);
  }
  console.log(`${total} trechos indexados. Documentos de outros modelos exigem reprocessamento pela biblioteca.`);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally { await pool.end(); }
