import { AIError } from '../lib/errors.js';
import { contentTokens, splitSentences, stem } from '../lib/text.js';
import { EMBEDDING_DIM, NOT_FOUND_MARKER } from './constants.js';


function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

function embed(text) {
  const vec = new Array(EMBEDDING_DIM).fill(0);
  const counts = new Map();
  for (const t of contentTokens(text, { accents: false })) counts.set(stem(t), (counts.get(stem(t)) ?? 0) + 1);
  for (const [t, n] of counts) vec[fnv1a(t) % EMBEDDING_DIM] += 1 + Math.log(n);
  const norm = Math.hypot(...vec) || 1;
  return vec.map((x) => x / norm);
}

const stems = (s) => new Set(contentTokens(s, { accents: false }).map(stem));

function parseBlocks(prompt, withIndex) {
  const re = withIndex
    ? /\[Trecho \d+ \| (.+?) \| página (\d+)\]\n([\s\S]*?)(?=\n\n\[Trecho \d+ \||\n\nPERGUNTA:|$)/g
    : /\[(.+?) \| página (\d+)\]\n([\s\S]*?)(?=\n\n\[.+? \| página \d+\]\n|\n\nFaça|\n\nCrie|$)/g;
  return [...prompt.matchAll(re)].map((m) => ({ file: m[1], page: Number(m[2]), text: m[3].trim() }));
}

function answerQuestion(prompt) {
  const question = prompt.split('PERGUNTA:').pop().trim();
  const q = stems(question);
  const scored = [];
  for (const b of parseBlocks(prompt, true)) {
    for (const s of splitSentences(b.text)) {
      const overlap = [...stems(s)].filter((t) => q.has(t)).length;
      if (overlap > 0) scored.push({ ...b, sentence: s, overlap });
    }
  }
  if (!scored.length) return NOT_FOUND_MARKER;
  scored.sort((a, b) => b.overlap - a.overlap);
  const top = scored.slice(0, 2);
  return `${top.map((t) => t.sentence).join(' ')}\n\n(${top[0].file}, p. ${top[0].page}) [resposta simulada]`;
}

function summarize(prompt) {
  const blocks = parseBlocks(prompt, false);
  if (!blocks.length) throw new AIError('Não há material para resumir.');
  return (
    blocks
      .slice(0, 10)
      .map((b) => `- ${splitSentences(b.text)[0] ?? b.text.slice(0, 160)} (p. ${b.page})`)
      .join('\n') + '\n\n[resumo simulado]'
  );
}

function makeQuiz(prompt, count) {
  const pool = [];
  for (const b of parseBlocks(prompt, false)) {
    for (const s of splitSentences(b.text)) if (s.length >= 50 && s.length <= 260) pool.push({ s, page: b.page });
  }
  if (pool.length < 4) throw new AIError('O material é curto demais para gerar questões.');
  const n = Math.min(count, pool.length);
  const questions = [];
  for (let i = 0; i < n; i++) {
    const correct = pool[Math.floor((i * pool.length) / n)];
    const distractors = pool.filter((p) => p !== correct).filter((_, k) => k % 3 === i % 3).slice(0, 3);
    for (const p of pool) if (distractors.length < 3 && p !== correct && !distractors.includes(p)) distractors.push(p);
    questions.push({
      question: 'Qual das afirmações abaixo aparece no material? [questão simulada]',
      options: [correct.s, ...distractors.map((d) => d.s)],
      correctIndex: 0,
      explanation: `Trecho do material, página ${correct.page}.`,
      page: correct.page,
    });
  }
  return { questions };
}

export function createMockProvider({ minSimilarity } = {}) {
  return {
    name: 'mock',
    label: 'IA simulada (modo demonstração)',
    isMock: true,
    embeddingModelId: `mock:hash-bow:${EMBEDDING_DIM}`,
    minSimilarity: minSimilarity ?? 0.05,
    async embedDocuments(texts) { return texts.map(embed); },
    async embedQuery(text) { return embed(text); },
    async generateText({ prompt, task }) {
      if (task === 'summary') return summarize(prompt);
      return answerQuestion(prompt);
    },
    async generateJson({ prompt, count = 5, task }) {
      if (task === 'mindmap') {
        const blocks = parseBlocks(prompt, false);
        const nodes = blocks.slice(0, 8).map((b,i)=>({id:`n${i}`,label:(splitSentences(b.text)[0]||b.file).slice(0,70),description:`${b.file}, página ${b.page}`}));
        return {title:'Mapa de estudo (simulado)',nodes:nodes.length?nodes:[{id:'n0',label:'Material de estudo'}],edges:nodes.slice(1).map((n,i)=>({from:'n0',to:n.id,label:'relacionado'}))};
      }
      return makeQuiz(prompt, count);
    },
  };
}
