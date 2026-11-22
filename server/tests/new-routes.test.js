import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
// Select local mocks before importing configuration; never contact real services.
process.env.VECTOR_STORE = 'mysql';
process.env.AI_PROVIDER = 'mock';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'segredo-local-para-testes-de-rotas';
const { config } = await import('../src/config.js');
const { pool } = await import('../src/db/pool.js');
const { signToken } = await import('../src/middleware/auth.js');
const { default: documents } = await import('../src/routes/documents.js');
const { default: google } = await import('../src/routes/google.js');
const { errorHandler } = await import('../src/middleware/error.js');
const { ask } = await import('../src/services/rag.js');
const { getAI, useAI } = await import('../src/ai/index.js');

const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const documentId = '33333333-3333-4333-8333-333333333333';
const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'studyrag-preview-'));
const pdf = path.join(folder, 'sample.pdf');
await fs.writeFile(pdf, '%PDF-1.4\npreview test');
const execute = pool.execute;
const originalAI = getAI();
let savedQuestions = 0;
pool.execute = async (sql, params) => {
  if (sql.includes('COUNT(*) AS n')) return [[{ n: 1 }]];
  if (sql.includes('SELECT c.id')) return [[{ id: 1, document_id: documentId, filename: 'material.pdf', page: 1, content: 'Dados são registros brutos.', embedding: [1, 0], uploader: 'Aluno' }]];
  if (sql.includes('INSERT INTO questions')) { savedQuestions++; return [{ affectedRows: 1 }]; }
  if (sql.includes('SELECT d.id')) {
    assert.match(sql, /JOIN group_members/);
    assert.match(sql, /visibility = 'group' OR d.uploader_id/);
    return [params.includes(other) ? [] : [{ id: documentId, uploader_id: owner, filename: 'material.pdf', stored_path: pdf, group_id: 'group' }]];
  }
  if (sql.includes('SELECT role')) return [[{ role: 'owner' }]];
  if (sql.includes('SELECT id, name, email FROM users')) return [[{ id: owner, name: 'Aluno', email: 'aluno@example.com' }]];
  throw new Error(`Unexpected query: ${sql}`);
};
const app = express();
app.use(express.json());
app.use('/api/auth/google', google);
app.use('/api', documents);
app.use(errorHandler);
after(async () => { useAI(originalAI); pool.execute = execute; await pool.end(); await fs.rm(folder, { recursive: true }); });

test('PDF endpoint requires authentication and current document access', async () => {
  assert.equal((await request(app).get(`/api/documents/${documentId}/file`)).status, 401);
  assert.equal((await request(app).get(`/api/documents/${documentId}/file`).auth(signToken(other), { type: 'bearer' })).status, 404);
  const response = await request(app).get(`/api/documents/${documentId}/file`).auth(signToken(owner), { type: 'bearer' });
  assert.equal(response.status, 200);
  assert.match(response.headers['content-type'], /application\/pdf/);
  assert.match(response.headers['cache-control'], /no-store/);
});
test('Google session exchange rejects missing cookie and foreign origin', async () => {
  assert.equal((await request(app).post('/api/auth/google/session').set('Origin', config.google.frontendUrl).send({})).status, 401);
  const token = jwt.sign({ sub: owner, purpose: 'google-handoff' }, config.jwt.secret, { expiresIn: '60s', audience: 'google-session' });
  assert.equal((await request(app).post('/api/auth/google/session').set('Origin', 'https://foreign.example').set('Cookie', `google_handoff=${token}`).send({})).status, 401);
  const response = await request(app).post('/api/auth/google/session').set('Origin', config.google.frontendUrl).set('Cookie', `google_handoff=${token}`).send({});
  assert.equal(response.status, 200);
  assert.equal(response.body.user.id, owner);
  assert.equal(jwt.verify(response.body.token, config.jwt.secret).sub, owner);
  assert.ok(response.headers['set-cookie'].some(c => c.includes('google_handoff=;')));
});
test('RAG saves only supported citations and abstains when evidence is absent', async () => {
  let generated = { found: true, answer: 'Dados são registros brutos [1].', citations: [{ passageId: 1, quote: 'Dados são registros brutos.' }] };
  useAI({ name: 'gemini', label: 'Test', embeddingModelId: 'test', minSimilarity: 0.1,
    embedQuery: async () => [1, 0], generateJson: async () => generated });
  const input = { groupId: 'group', userId: owner, question: 'O que são dados?' };
  const result = await ask(input);
  assert.equal(result.found, true);
  assert.equal(result.sources[0].documentId, documentId);
  assert.equal(result.sources[0].quote, 'Dados são registros brutos.');
  generated = { found: false };
  const absent = await ask(input);
  assert.equal(absent.found, false);
  assert.deepEqual(absent.sources, []);
  const before = savedQuestions;
  generated = { found: true, answer: 'Inventado [1].', citations: [{ passageId: 1, quote: 'Esta citação não existe.' }] };
  await assert.rejects(() => ask(input), /verificação das fontes/);
  assert.equal(savedQuestions, before);
});
