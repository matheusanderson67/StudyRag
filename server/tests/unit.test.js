import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chunkPages, chunkText } from '../src/lib/chunker.js';
import { contentTokens, splitSentences } from '../src/lib/text.js';
import { createGeminiProvider } from '../src/ai/gemini.js';
import { createMockProvider } from '../src/ai/mock.js';
import { AIError } from '../src/lib/errors.js';
import { gradeAttempt } from '../src/services/quiz.js';

test('chunkText respeita o tamanho e a sobreposição', () => {
  const text = Array.from({ length: 600 }, (_, i) => `palavra${i}`).join(' ');
  const chunks = chunkText(text, 900, 150);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((c) => c.length <= 900));
  assert.ok(chunks[0].includes(chunks[1].slice(0, 20)), 'sobreposição entre trechos');
});

test('chunkPages preserva a página de origem e ignora páginas vazias', () => {
  const chunks = chunkPages([{ number: 1, text: 'texto da página um. '.repeat(5) }, { number: 2, text: '' }, { number: 3, text: 'texto da página três. '.repeat(5) }], 900, 150);
  assert.deepEqual(chunks.map((c) => c.page), [1, 3]);
  assert.deepEqual(chunks.map((c) => c.idx), [0, 1]);
});

test('contentTokens remove stopwords e splitSentences separa frases', () => {
  assert.deepEqual(contentTokens('O que é uma thread?'), ['thread']);
  assert.equal(splitSentences('Primeira frase. Segunda frase! Terceira?').length, 3);
});

test('provedor simulado: embeddings normalizados e relacionados ficam mais próximos', async () => {
  const ai = createMockProvider();
  const [a, b, c] = await ai.embedDocuments(['processo e thread em sistemas operacionais', 'thread compartilha memória do processo', 'receita de bolo de chocolate']);
  const cos = (x, y) => x.reduce((s, v, i) => s + v * y[i], 0);
  assert.ok(Math.abs(cos(a, a) - 1) < 1e-9);
  assert.ok(cos(a, b) > cos(a, c));
});

const okJson = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body), headers: new Headers() });

test('Gemini: monta o pedido de embeddings e normaliza o vetor', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, body: JSON.parse(init.body), key: init.headers['x-goog-api-key'] }); return okJson({ embeddings: [{ values: [3, 4] }] }); };
  const ai = createGeminiProvider({ apiKey: 'K', model: 'm', embeddingModel: 'emb', fetchImpl });
  const [v] = await ai.embedDocuments(['olá']);
  assert.deepEqual(v, [0.6, 0.8]);
  assert.match(calls[0].url, /models\/emb:batchEmbedContents$/);
  assert.equal(calls[0].key, 'K');
  assert.equal(calls[0].body.requests[0].taskType, 'RETRIEVAL_DOCUMENT');
  assert.equal(calls[0].body.requests[0].outputDimensionality, 768);
});

test('Gemini: recupera de 429 temporário com apenas uma tentativa extra', async () => {
  let n = 0;
  const fetchImpl = async () => (++n === 1
    ? { ok: false, status: 429, headers: new Headers(), text: async () => '' }
    : okJson({ candidates: [{ content: { parts: [{ text: 'resposta' }] } }] }));
  const ai = createGeminiProvider({ apiKey: 'K', model: 'm', embeddingModel: 'e', fetchImpl, sleep: async () => {} });
  assert.equal(await ai.generateText({ system: 's', prompt: 'p' }), 'resposta');
  assert.equal(n, 2);
});

test('Gemini: chave inválida vira mensagem amigável e JSON malformado vira AIError', async () => {
  const bad = async () => ({ ok: false, status: 400, headers: new Headers(), text: async () => 'API key not valid' });
  const ai1 = createGeminiProvider({ apiKey: 'x', model: 'm', embeddingModel: 'e', fetchImpl: bad, sleep: async () => {} });
  await assert.rejects(() => ai1.generateText({ system: 's', prompt: 'p' }), (e) => e instanceof AIError && /GEMINI_API_KEY/.test(e.message));
  const notJson = async () => okJson({ candidates: [{ content: { parts: [{ text: 'isto não é json' }] } }] });
  const ai2 = createGeminiProvider({ apiKey: 'x', model: 'm', embeddingModel: 'e', fetchImpl: notJson });
  await assert.rejects(() => ai2.generateJson({ system: 's', prompt: 'p' }), AIError);
});

test('gradeAttempt calcula a nota e exige uma resposta por questão', () => {
  const qs = [{ correctIndex: 1, explanation: 'x' }, { correctIndex: 2, explanation: 'y' }];
  const r = gradeAttempt(qs, [1, 0]);
  assert.equal(r.score, 1);
  assert.equal(r.total, 2);
  assert.throws(() => gradeAttempt(qs, [1]));
});
