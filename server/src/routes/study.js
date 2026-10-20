import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { notFound } from '../lib/errors.js';
import { idParam, requireAuth, requireMember } from '../middleware/auth.js';
import { aiDeadline } from '../middleware/ai-deadline.js';
import { ask, askSchema, summarize, summarySchema } from '../services/rag.js';
import { attemptSchema, createQuiz, createQuizSchema, gradeAttempt } from '../services/quiz.js';
import { tutor, tutorSchema, mindmap, mindmapSchema } from '../services/learning.js';

const router = Router();
router.use(requireAuth);

router.post('/groups/:groupId/tutor', aiDeadline, requireMember, async (req,res)=>{res.json(await tutor({groupId:req.group.id,userId:req.userId,...tutorSchema.parse(req.body)}));});
router.post('/groups/:groupId/mindmap', aiDeadline, requireMember, async (req,res)=>{res.json(await mindmap({groupId:req.group.id,userId:req.userId,...mindmapSchema.parse(req.body??{})}));});
router.get('/groups/:groupId/dashboard', requireMember, async(req,res)=>{
 const {rows}=await query(`SELECT a.id,a.score,a.total,a.created_at AS "createdAt",q.title FROM quiz_attempts a JOIN quizzes q ON q.id=a.quiz_id WHERE q.group_id=$1 AND a.user_id=$2 ORDER BY a.created_at DESC LIMIT 100`,[req.group.id,req.userId]);
 const total=rows.reduce((s,r)=>s+r.total,0),correct=rows.reduce((s,r)=>s+r.score,0);
 res.json({attempts:rows,stats:{attempts:rows.length,correct,total,percent:total?Math.round(100*correct/total):0}});
});
// ---------- perguntas (RAG) ----------
router.post('/groups/:groupId/ask', aiDeadline, requireMember, async (req, res) => {
  const { question, documentId } = askSchema.parse(req.body);
  res.json(await ask({ groupId: req.group.id, userId: req.userId, question, documentId }));
});

// O histórico é pessoal: respostas podem ter usado documentos privados do autor.
router.get('/groups/:groupId/history', requireMember, async (req, res) => {
  const { rows } = await query(
    `SELECT id, question, answer, found, sources, created_at AS "createdAt" FROM questions
      WHERE group_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 30`,
    [req.group.id, req.userId],
  );
  res.json({ history: rows });
});

// ---------- resumo ----------
router.post('/groups/:groupId/summary', aiDeadline, requireMember, async (req, res) => {
  const { documentId } = summarySchema.parse(req.body ?? {});
  res.json(await summarize({ groupId: req.group.id, userId: req.userId, documentId }));
});

router.get('/groups/:groupId/summaries', requireMember, async (req, res) => {
  const { rows } = await query(
    `SELECT id, content, sources, created_at AS "createdAt" FROM summaries
      WHERE group_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 10`,
    [req.group.id, req.userId],
  );
  res.json({ summaries: rows });
});

// ---------- quizzes ----------
router.post('/groups/:groupId/quizzes', aiDeadline, requireMember, async (req, res) => {
  const { documentId, count, difficulty, minutes } = createQuizSchema.parse(req.body ?? {});
  res.status(201).json({ quiz: await createQuiz({ groupId: req.group.id, userId: req.userId, documentId, count, difficulty, minutes }) });
});

router.get('/groups/:groupId/quizzes', requireMember, async (req, res) => {
  const { rows } = await query(
    `SELECT q.id, q.title, JSON_LENGTH(q.questions) AS "questionCount", q.created_at AS "createdAt", u.name AS "createdByName",
            (SELECT max(a.score) FROM quiz_attempts a WHERE a.quiz_id = q.id AND a.user_id = $2) AS "myBestScore"
       FROM quizzes q JOIN users u ON u.id = q.created_by WHERE q.group_id = $1 ORDER BY q.created_at DESC`,
    [req.group.id, req.userId],
  );
  res.json({ quizzes: rows });
});

async function loadQuiz(req) {
  const { rows } = await query(
    `SELECT q.* FROM quizzes q JOIN group_members gm ON gm.group_id = q.group_id AND gm.user_id = $2 WHERE q.id = $1`,
    [req.params.quizId, req.userId],
  );
  if (!rows[0]) throw notFound('Quiz não encontrado.');
  return rows[0];
}

// Para responder, o aluno recebe as questões SEM o gabarito.
router.get('/quizzes/:quizId', idParam('quizId'), async (req, res) => {
  const quiz = await loadQuiz(req);
  res.json({
    quiz: {
      id: quiz.id,
      title: quiz.title,
      minutes: quiz.minutes,
      questions: quiz.questions.map((q) => ({ question: q.question, options: q.options })),
    },
  });
});

router.post('/quizzes/:quizId/attempts', idParam('quizId'), async (req, res) => {
  const { answers } = attemptSchema.parse(req.body);
  const quiz = await loadQuiz(req);
  const graded = gradeAttempt(quiz.questions, answers);
  await query('INSERT INTO quiz_attempts (id, quiz_id, user_id, answers, score, total) VALUES ($1, $2, $3, $4, $5, $6)', [
    randomUUID(), quiz.id, req.userId, JSON.stringify(answers), graded.score, graded.total,
  ]);
  res.status(201).json(graded);
});

router.get('/groups/:groupId/ranking', requireMember, async (req, res) => {
  const { rows } = await query(
    `WITH best AS (
       SELECT a.user_id, a.quiz_id, max(a.score) AS score, max(a.total) AS total
         FROM quiz_attempts a JOIN quizzes q ON q.id = a.quiz_id WHERE q.group_id = $1 GROUP BY a.user_id, a.quiz_id)
     SELECT u.id, u.name, SUM(b.score) AS points, SUM(b.total) AS possible, COUNT(*) AS quizzes
       FROM best b JOIN users u ON u.id = b.user_id GROUP BY u.id, u.name ORDER BY points DESC, possible ASC, u.name`,
    [req.group.id],
  );
  res.json({ ranking: rows });
});

export default router;
