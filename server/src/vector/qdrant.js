import { createHash } from 'node:crypto';

/** REST client; one collection per embedding model and dimension. */
export function createVectorStore({ url, apiKey, prefix = 'studyrag', timeoutMs = 15000, fetchImpl = fetch }) {
  const prepared = new Set();
  const collection = (model, size) => `${prefix}_${createHash('sha256').update(model).digest('hex').slice(0, 16)}_${size}`;
  async function request(path, method = 'GET', body, allow404 = false) {
    const response = await fetchImpl(`${url.replace(/\/$/, '')}${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(apiKey ? { 'api-key': apiKey } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(timeoutMs),
    });
    if (allow404 && response.status === 404) return null;
    if (!response.ok) throw new Error(`Qdrant indisponível (HTTP ${response.status}).`);
    return response.json();
  }
  async function ensure(model, size) {
    const name = collection(model, size);
    if (prepared.has(name)) return name;
    if (!await request(`/collections/${name}`, 'GET', undefined, true)) {
      try { await request(`/collections/${name}`, 'PUT', { vectors: { size, distance: 'Cosine' } }); }
      catch (err) { if (!await request(`/collections/${name}`, 'GET', undefined, true)) throw err; }
    }
    for (const field_name of ['document_id', 'group_id']) {
      await request(`/collections/${name}/index?wait=true`, 'PUT', { field_name, field_schema: 'keyword' });
    }
    prepared.add(name);
    return name;
  }
  return {
    async upsert(model, rows) {
      if (!rows.length) return;
      const vectors = rows.map(r => typeof r.embedding === 'string' ? JSON.parse(r.embedding) : r.embedding);
      const size = vectors[0]?.length;
      if (!size || vectors.some(v => !Array.isArray(v) || v.length !== size || v.some(x => !Number.isFinite(x)))) throw new Error('Embeddings inválidos.');
      if (rows.some(r => !Number.isSafeInteger(Number(r.id)) || Number(r.id) < 1)) throw new Error('ID de trecho inválido.');
      const name = await ensure(model, size);
      for (let start = 0; start < rows.length; start += 100) {
        await request(`/collections/${name}/points?wait=true`, 'PUT', { points: rows.slice(start, start + 100).map((r, i) => ({
          id: Number(r.id), vector: vectors[start + i], payload: { document_id: r.document_id, group_id: r.group_id },
        })) });
      }
    },
    async search(model, vector, documentIds, limit = 30) {
      if (!documentIds.length) return [];
      const name = collection(model, vector.length);
      const result = await request(`/collections/${name}/points/query`, 'POST', {
        query: vector, filter: { must: [{ key: 'document_id', match: { any: documentIds } }] },
        limit, with_payload: false, with_vector: false,
      });
      return result.result.points;
    },
    async remove(key, value) {
      const result = await request('/collections');
      for (const { name } of result.result.collections.filter(c => c.name.startsWith(`${prefix}_`))) {
        await request(`/collections/${encodeURIComponent(name)}/points/delete?wait=true`, 'POST', {
          filter: { must: [{ key, match: { value } }] },
        });
      }
    },
  };
}
