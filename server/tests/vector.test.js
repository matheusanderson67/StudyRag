import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createVectorStore } from '../src/vector/qdrant.js';

function client(handler) {
  return createVectorStore({ url: 'http://qdrant.test', fetchImpl: async (url, init) => {
    const result = await handler(url, init.body ? JSON.parse(init.body) : undefined, init);
    return { ok: (result.status ?? 200) < 400, status: result.status ?? 200, json: async () => result.body ?? {} };
  } });
}
test('search restricts documents before nearest-neighbor ranking', async () => {
  const store = client((url, body) => {
    assert.match(url, /\/points\/query$/);
    assert.deepEqual(body.filter.must, [{ key: 'document_id', match: { any: ['allowed'] } }]);
    assert.equal(body.with_vector, false);
    return { body: { result: { points: [{ id: 1, score: 0.9 }] } } };
  });
  assert.deepEqual(await store.search('model', [1, 0], ['allowed']), [{ id: 1, score: 0.9 }]);
  assert.deepEqual(await store.search('model', [1, 0], []), []);
});
test('upsert creates cosine collection and batches points', async () => {
  const batches = [];
  const store = client((url, body, init) => {
    if (init.method === 'GET') return { status: 404 };
    if (url.includes('/index')) assert.equal(body.field_schema, 'keyword');
    else if (!url.includes('/points')) assert.deepEqual(body.vectors, { size: 2, distance: 'Cosine' });
    else batches.push(body.points);
    return {};
  });
  await store.upsert('model', Array.from({ length: 101 }, (_, i) => ({ id: i + 1, document_id: 'd', group_id: 'g', embedding: '[1,0]' })));
  assert.deepEqual(batches.map(b => b.length), [100, 1]);
  assert.deepEqual(batches[0][0].payload, { document_id: 'd', group_id: 'g' });
  await assert.rejects(() => store.upsert('m', [{ embedding: [NaN] }]), /inválidos/);
});
test('delete is scoped to owned collections and selected document', async () => {
  const removed = [];
  const store = client((url, body) => {
    if (url.endsWith('/collections')) return { body: { result: { collections: [{ name: 'studyrag_a' }, { name: 'unrelated' }] } } };
    removed.push({ url, body });
    return {};
  });
  await store.remove('document_id', 'd');
  assert.equal(removed.length, 1);
  assert.deepEqual(removed[0].body.filter.must, [{ key: 'document_id', match: { value: 'd' } }]);
});
test('service failure is reported instead of returning empty results', async () => {
  const store = client(() => ({ status: 503 }));
  await assert.rejects(() => store.search('model', [1], ['d']), /503/);
});
