import crypto from 'node:crypto';
import { z } from 'zod';
import { getAI } from '../ai/index.js';
import { SYSTEM_QUIZ, quizPrompt } from '../ai/prompts.js';
import { config } from '../config.js';
import { query } from '../db/pool.js';
import { AIError, badRequest } from '../lib/errors.js';
import { assertVisibleDocument, loadMaterial, uniqueSources } from './retrieval.js';

export const createQuizSchema = z.object({
  documentId: z.string().uuid().nullish(),
  count: z.coerce.number().int().min(3, 'Mínimo de 3 questões.').max(30, 'Máximo de 30 questões.').default(5),
  difficulty: z.enum(['facil','medio','dificil']).default('medio'),
  minutes: z.coerce.number().int().min(5).max(120).default(30),
});

const QuizSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string().min(5),
        options: z.array(z.string().min(1)).length(4),
        correctIndex: z.number().int().min(0).max(3),
        explanation: z.string().default(''),
        page: z.coerce.number().int().optional(),
      }),
    )
    .min(1),
});

function shuffleQuestion(q) {
  const order = [0, 1, 2, 3];
  for (let i = order.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { ...q, options: order.map((i) => q.options[i]), correctIndex: order.indexOf(q.correctIndex) };
}

/** Quizzes são compartilhados com o grupo; por isso usam só documentos compartilhados (nunca os privados). */
export async function createQuiz({ groupId, userId, documentId = null, count, difficulty = 'medio', minutes = 30 }) {
  const ai = getAI();
  await assertVisibleDocument(groupId, userId, documentId);
  const chunks = await loadMaterial({ groupId, userId, documentId, onlyShared: true, max: Math.min(config.rag.maxContextChunks, 16) });
  if (!chunks.length) throw badRequest('Nenhum documento compartilhado com o grupo está pronto. Envie um PDF com visibilidade "Grupo".');

  let parsed;
  for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
    const raw = await ai.generateJson({ system: SYSTEM_QUIZ, prompt: quizPrompt(chunks, count) + `\nDificuldade: ${difficulty}. Gere EXATAMENTE ${count} questões distintas.`, task: 'quiz', count, temperature: 0.4 });
    const result = QuizSchema.safeParse(raw);
    if (result.success) parsed = result.data;
  }
  if (!parsed) throw new AIError('A IA não conseguiu montar as questões no formato esperado. Tente de novo.');

  if(parsed.questions.length < count) throw new AIError('A IA gerou menos questões do que solicitado. Tente novamente.');
  const questions = parsed.questions.slice(0, count).map(shuffleQuestion);
  const label = documentId ? chunks[0].filename : 'Material do grupo';
  const title = `Simulado ${difficulty} — ${label} (${questions.length} questões)`;
  const id = crypto.randomUUID();
  await query(
    `INSERT INTO quizzes (id, group_id, created_by, title, questions, sources, minutes) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, groupId, userId, title, JSON.stringify(questions), JSON.stringify(uniqueSources(chunks)), minutes],
  );
  return { id, title, questionCount: questions.length, createdAt: new Date().toISOString() };
}

export const attemptSchema = z.object({
  answers: z.array(z.number().int().min(0).max(3).nullable()).min(1).max(50),
});

export function gradeAttempt(questions, answers) {
  if (answers.length !== questions.length) throw badRequest('Responda todas as questões (ou deixe em branco as que não souber).');
  const results = questions.map((q, i) => ({
    chosen: answers[i],
    correctIndex: q.correctIndex,
    correct: answers[i] === q.correctIndex,
    explanation: q.explanation,
    page: q.page ?? null,
  }));
  return { score: results.filter((r) => r.correct).length, total: questions.length, results };
}
