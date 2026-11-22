import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEvidence } from '../src/services/evidence.js';
const passages = [{ content: 'Dados são registros brutos. Informação é o resultado da interpretação dos dados.', page: 2 }];
test('accepts cited supporting excerpt and preserves its source', () => {
  const value = validateEvidence({ found: true, answer: 'Dados são registros brutos [1].', citations: [{ passageId: 1, quote: 'Dados são registros brutos.' }] }, passages);
  assert.equal(value.cited[0].page, 2);
});
test('rejects invented quote, passage and uncited reference', () => {
  for (const [passageId, quote, answer] of [[1, 'Texto que não existe nos documentos.', 'Resposta [1]'], [2, passages[0].content, 'Resposta [2]'], [1, passages[0].content, 'Resposta [9]']]) {
    assert.throws(() => validateEvidence({ found: true, answer, citations: [{ passageId, quote }] }, passages));
  }
});
test('missing evidence returns not found', () => {
  assert.equal(validateEvidence({ found: false }, passages).found, false);
  assert.throws(() => validateEvidence({ found: true, answer: 'Resposta', citations: [] }, passages));
});
