import { validateEvidence } from './evidence.js';
import { AIError } from '../lib/errors.js';
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
    isMock: Boolean(ai.isMock),
  };

  let answer = NOT_FOUND_ANSWER;
  let found = false;
  let sources = [];
  if (relevant.length && ai.name === 'gemini') {
    const prompt = qaPrompt(question, relevant) + '\n\nRetorne somente JSON: {"found":true,"answer":"Resposta direta com referências [1]","citations":[{"passageId":1,"quote":"cópia literal de uma frase do trecho"}]}. Se faltar evidência para responder à pergunta, retorne {"found":false}. Cada afirmação deve ter uma referência [N]. Nunca invente citações. Em comparações, explique os dois conceitos e a diferença apenas se houver apoio para ambos. Não substitua a resposta por assuntos relacionados.';
    const raw = await ai.generateJson({ system: SYSTEM_QA, prompt, task: 'qa', temperature: 0.1 });
    let checked;
    try { checked = validateEvidence(raw, relevant); }
    catch { throw new AIError('A resposta não passou na verificação das fontes. Reformule a pergunta e tente novamente.'); }
    found = checked.found;
    if (found) {
      answer = checked.answer;
      sources = checked.cited.map(h => ({ documentId: h.document_id, filename: h.filename,
        page: h.page, uploader: h.uploader, snippet: h.content, quote: h.quote, passageId: h.passageId,
        similarity: Number(h.similarity.toFixed(3)) }));
    }
  } else if (relevant.length) {
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
