import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGeminiProvider } from '../src/ai/gemini.js';
import { AIError } from '../src/lib/errors.js';

const response = (body) => ({ ok: true, status: 200, json: async () => body });
const content = response({ candidates: [{ content: { parts: [{ text: 'Resumo pronto' }] } }] });
const provider = (fetchImpl, sleep = async () => {}, options = {}) => createGeminiProvider({
  apiKey: 'teste', model: 'gemini-3-flash-preview', embeddingModel: 'gemini-embedding-001',
  fetchImpl, sleep, ...options,
});

test('429 temporário: tenta novamente uma vez dentro do prazo', async () => {
  let calls = 0;
  const waits = [];
  const ai = provider(async () => (++calls === 1
    ? { ok: false, status: 429, headers: new Headers({ 'retry-after': '1' }), text: async () => '{}' }
    : content), async (ms) => { waits.push(ms); });
  assert.equal(await ai.generateText({ system: 's', prompt: 'p' }), 'Resumo pronto');
  assert.equal(calls, 2);
  assert.ok(waits.includes(1000));
});

test('429 persistente: não gera fila longa de tentativas', async () => {
  let calls = 0;
  const ai = provider(async () => {
    calls++;
    return { ok: false, status: 429, headers: new Headers(), text: async () => '{}' };
  });
  await assert.rejects(() => ai.generateText({ system: 's', prompt: 'p' }),
    (error) => error instanceof AIError && /limite temporário/.test(error.message));
  assert.equal(calls, 2);
});

test('429 com Retry-After de 20s: recusa imediatamente, sem esperar', async () => {
  let calls = 0;
  const ai = provider(async () => {
    calls++;
    return { ok: false, status: 429, headers: new Headers({ 'retry-after': '20' }), text: async () => '{}' };
  });
  await assert.rejects(() => ai.generateText({ system: 's', prompt: 'p' }), AIError);
  assert.equal(calls, 1);
});

test('429 de cota diária: informa causa e não repete', async () => {
  let calls = 0;
  const ai = provider(async () => {
    calls++;
    return { ok: false, status: 429, headers: new Headers(), text: async () => JSON.stringify({ error: {
      message: 'Quota exceeded', details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
        violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }],
    } }) };
  });
  await assert.rejects(() => ai.generateText({ system: 's', prompt: 'p' }),
    (error) => error instanceof AIError && /cota diária/.test(error.message));
  assert.equal(calls, 1);
});

test('503: no máximo uma nova tentativa', async () => {
  let calls = 0;
  const ai = provider(async () => (++calls === 1
    ? { ok: false, status: 503, headers: new Headers(), text: async () => '{}' }
    : content));
  assert.equal(await ai.generateText({ system: 's', prompt: 'p' }), 'Resumo pronto');
  assert.equal(calls, 2);
});

test('Gemini 3 usa thinking low e saída curta', async () => {
  let body;
  const ai = provider(async (_url, init) => { body = JSON.parse(init.body); return content; });
  await ai.generateText({ system: 's', prompt: 'p', task: 'summary' });
  assert.equal(body.generationConfig.maxOutputTokens, 1300);
  assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, 'low');
});

test('tempo limite: aborta requisição externa e mostra mensagem em vez de travar', async () => {
  let aborted = false;
  const ai = provider((_url, init) => new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => {
      aborted = true;
      reject(new Error('AbortError'));
    }, { once: true });
  }), undefined, { requestTimeoutMs: 260 });
  await assert.rejects(() => ai.generateText({ system: 's', prompt: 'p' }),
    (error) => error instanceof AIError && /15 segundos/.test(error.message));
  assert.equal(aborted, true);
});

test('embeddings de PDF são de fundo, não usam o prazo curto da tela', async () => {
  let signal;
  const ai = provider(async (_url, init) => {
    signal = init.signal;
    return response({ embeddings: [{ values: [3, 4] }] });
  });
  const [vector] = await ai.embedDocuments(['texto']);
  assert.deepEqual(vector, [0.6, 0.8]);
  assert.equal(signal.aborted, false);
});

test('a fila evita rajadas simultâneas de chamadas', async () => {
  const waits = [];
  const ai = provider(async () => content, async (ms) => { waits.push(ms); });
  await Promise.all([
    ai.generateText({ system: 's', prompt: 'a' }),
    ai.generateText({ system: 's', prompt: 'b' }),
  ]);
  assert.ok(waits.some((ms) => ms > 0));
});
