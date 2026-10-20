import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { getAI } from '../ai/index.js';
import { NOT_FOUND_MARKER } from '../ai/constants.js';
import { SYSTEM_QA, SYSTEM_SUMMARY, qaPrompt, summaryPrompt } from '../ai/prompts.js';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { badRequest } from '../lib/errors.js';
import { assertVisibleDocument, countReadyDocuments, loadMaterial, retrieve, uniqueSources } from './retrieval.js';

export const NOT_FOUND_ANSWER =
  'Não encontrei a resposta no material disponível. Tente reformular a pergunta ou confira se o assunto está nos documentos do grupo.';
const NO_DOCS = 'Nenhum documento pronto neste grupo. Envie um PDF na aba Biblioteca e aguarde o processamento.';

export const askSchema = z.object({
  question: z.string().trim().min(3, 'Escreva uma pergunta.').max(1000, 'Pergunta muito longa.'),
  documentId: z.string().uuid().nullish(),
});

export async function ask({ groupId, userId, question, documentId = null }) {
  const ai = getAI();
  await assertVisibleDocument(groupId, userId, documentId);
  if (!(await countReadyDocuments(groupId, userId, documentId))) throw badRequest(NO_DOCS);

  const queryVector = await ai.embedQuery(question);
  const hits = await retrieve({ groupId, userId, documentId, question, queryVector, limit: config.rag.topK });
  const relevant = hits.filter((h) => h.similarity >= ai.minSimilarity);
  const diagnostics = {
    retrieved: hits.length,
    relevant: relevant.length,
    bestSimilarity: Number(Math.max(0, ...hits.map((h) => h.similarity)).toFixed(3)),
    threshold: ai.minSimilarity,
    provider: ai.label,
  };

  let answer = NOT_FOUND_ANSWER;
  let found = false;
  let sources = [];
  if (relevant.length) {
    const raw = await ai.generateText({ system: SYSTEM_QA, prompt: qaPrompt(question, relevant), task: 'qa', temperature: 0.1 });
    if (!raw.includes(NOT_FOUND_MARKER)) {
      found = true;
      answer = raw;
      // As fontes exibidas são exatamente os trechos enviados ao modelo.
      sources = relevant.map((h) => ({
        documentId: h.document_id,
        filename: h.filename,
        page: h.page,
        uploader: h.uploader,
        snippet: h.content,
        similarity: Number(h.similarity.toFixed(3)),
      }));
    }
  }

  const id = randomUUID();
  const createdAt = new Date().toISOString();
  await query('INSERT INTO questions (id, group_id, user_id, question, answer, found, sources) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [id, groupId, userId, question, answer, found, JSON.stringify(sources)]);
  return { id, question, answer, found, sources, diagnostics, createdAt };
}

export const summarySchema = z.object({ documentId: z.string().uuid().nullish() });

export async function summarize({ groupId, userId, documentId = null }) {
  const ai = getAI();
  await assertVisibleDocument(groupId, userId, documentId);
  const chunks = await loadMaterial({ groupId, userId, documentId, max: Math.min(config.rag.maxContextChunks, 12) });
  if (!chunks.length) throw badRequest(NO_DOCS);
  const content = await ai.generateText({ system: SYSTEM_SUMMARY, prompt: summaryPrompt(chunks), task: 'summary', temperature: 0.2 });
  const sources = uniqueSources(chunks);
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  await query('INSERT INTO summaries (id, group_id, user_id, content, sources) VALUES ($1, $2, $3, $4, $5)',
    [id, groupId, userId, content, JSON.stringify(sources)]);
  return { id, content, sources, createdAt };
}
