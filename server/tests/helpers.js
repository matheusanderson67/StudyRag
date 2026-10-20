// IMPORTANTE: este arquivo define o ambiente de teste ANTES de carregar a aplicação.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import mysql from 'mysql2/promise';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
loadEnv({ path: path.join(root, '.env'), quiet: true });

process.env.NODE_ENV = 'test';
process.env.AI_PROVIDER = 'mock';
delete process.env.GEMINI_API_KEY;
delete process.env.MIN_SIMILARITY;
process.env.JWT_SECRET = 'segredo-de-teste-com-mais-de-16-chars';
process.env.DB_HOST = process.env.DB_HOST_TEST ?? process.env.DB_HOST ?? '127.0.0.1';
process.env.DB_PORT = process.env.DB_PORT_TEST ?? process.env.DB_PORT ?? '3306';
process.env.DB_USER = process.env.DB_USER_TEST ?? process.env.DB_USER ?? 'root';
process.env.DB_PASSWORD = process.env.DB_PASSWORD_TEST ?? process.env.DB_PASSWORD ?? '';
process.env.DB_NAME = 'studyrag_test';
process.env.UPLOAD_DIR = 'data/test-uploads';

const admin = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD });
await admin.query('CREATE DATABASE IF NOT EXISTS studyrag_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
await admin.end();

const { createApp } = await import('../src/app.js');
const { migrate } = await import('../src/db/migrate.js');
const { pool } = await import('../src/db/pool.js');
const { default: request } = await import('supertest');
await migrate();

export const app = createApp();
export const api = request(app);
export { pool };

export const resetDb = async () => { for (const t of ['quiz_attempts','quizzes','questions','summaries','chunks','documents','group_members','groups','users']) await pool.query(`DELETE FROM \`${t}\``); };
export const closeDb = () => pool.end();

let counter = 0;
export async function signup(name = 'Aluno') {
  counter += 1;
  const res = await api.post('/api/auth/register').send({ name, email: `aluno${counter}@teste.com`, password: 'senha-forte-123' });
  return { token: res.body.token, user: res.body.user, auth: { Authorization: `Bearer ${res.body.token}` } };
}

export async function makePdf(pages) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const text of pages) {
    const page = doc.addPage([595, 842]);
    if (!text) continue;
    const words = text.split(' ');
    let line = '';
    let y = 780;
    for (const w of words) {
      if ((line + ' ' + w).length > 85) { page.drawText(line.trim(), { x: 40, y, size: 11, font }); y -= 16; line = w; }
      else line += ' ' + w;
    }
    page.drawText(line.trim(), { x: 40, y, size: 11, font });
  }
  return Buffer.from(await doc.save());
}

export async function uploadPdf(groupId, auth, buffer, { visibility = 'group', name = 'aula.pdf' } = {}) {
  const res = await api.post(`/api/groups/${groupId}/documents`).set(auth).field('visibility', visibility).attach('file', buffer, name);
  return res;
}

export async function waitReady(groupId, auth, docId, tries = 60) {
  for (let i = 0; i < tries; i++) {
    const res = await api.get(`/api/groups/${groupId}/documents`).set(auth);
    const doc = res.body.documents?.find((d) => d.id === docId);
    if (doc && doc.status !== 'processing') return doc;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Documento não terminou de processar a tempo');
}

export const SO_PAGES = [
  'Um processo é uma instância de um programa em execução. Cada processo possui seu próprio espaço de endereçamento e seus recursos. ' +
    'Uma thread é a menor unidade de execução dentro de um processo e compartilha a memória com outras threads do mesmo processo. ' +
    'Threads permitem concorrência dentro de um único programa.',
  'O escalonador de processos decide qual processo usa a CPU em cada momento. O algoritmo Round Robin atribui um quantum de tempo ' +
    'para cada processo em ordem circular. Prioridades podem favorecer processos mais importantes do sistema operacional.',
];
