import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

const rootDir = fileURLToPath(new URL('../../', import.meta.url));
loadEnv({ path: path.join(rootDir, '.env'), quiet: true });

// Variáveis vazias no .env (ex.: "MIN_SIMILARITY=") são tratadas como "não definidas".
const env = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ''));

const DEV_SECRET = 'dev-secret-troque-isto-antes-de-publicar';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3001),
  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().default(3306),
  DB_USER: z.string().default('root'),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.string().regex(/^[a-zA-Z0-9_]+$/).default('studyrag'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET precisa ter pelo menos 16 caracteres').default(DEV_SECRET),
  JWT_EXPIRES_IN: z.string().default('7d'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  UPLOAD_DIR: z.string().default('data/uploads'),
  MAX_PDF_MB: z.coerce.number().positive().default(20),
  AI_PROVIDER: z.enum(['mock', 'gemini']).default('mock'),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-flash-latest'),
  GEMINI_EMBEDDING_MODEL: z.string().default('gemini-embedding-001'),
  CHUNK_SIZE: z.coerce.number().int().default(900),
  CHUNK_OVERLAP: z.coerce.number().int().default(150),
  TOP_K: z.coerce.number().int().default(6),
  MIN_SIMILARITY: z.coerce.number().optional(),
  MAX_CONTEXT_CHUNKS: z.coerce.number().int().default(24),
});

const parsed = schema.safeParse(env);
if (!parsed.success) {
  const msg = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Configuração inválida no .env:\n${msg}`);
}
const e = parsed.data;

if (e.NODE_ENV === 'production' && e.JWT_SECRET === DEV_SECRET) {
  throw new Error('Defina um JWT_SECRET próprio no .env antes de rodar em produção.');
}
if (e.AI_PROVIDER === 'gemini' && !e.GEMINI_API_KEY) {
  throw new Error('AI_PROVIDER=gemini exige GEMINI_API_KEY no .env (crie a chave no Google AI Studio).');
}
if (e.CHUNK_OVERLAP >= e.CHUNK_SIZE) throw new Error('CHUNK_OVERLAP precisa ser menor que CHUNK_SIZE.');

export const config = {
  env: e.NODE_ENV,
  port: e.PORT,
  mysql: { host: e.DB_HOST, port: e.DB_PORT, user: e.DB_USER, password: e.DB_PASSWORD, database: e.DB_NAME },
  jwt: { secret: e.JWT_SECRET, expiresIn: e.JWT_EXPIRES_IN },
  corsOrigin: e.CORS_ORIGIN,
  rootDir,
  uploadDir: path.resolve(rootDir, e.UPLOAD_DIR),
  maxPdfBytes: Math.round(e.MAX_PDF_MB * 1024 * 1024),
  ai: {
    provider: e.AI_PROVIDER,
    geminiApiKey: e.GEMINI_API_KEY,
    geminiModel: e.GEMINI_MODEL,
    geminiEmbeddingModel: e.GEMINI_EMBEDDING_MODEL,
  },
  rag: {
    chunkSize: e.CHUNK_SIZE,
    chunkOverlap: e.CHUNK_OVERLAP,
    topK: e.TOP_K,
    minSimilarity: e.MIN_SIMILARITY, // se indefinido, vale o padrão do provedor de IA
    maxContextChunks: e.MAX_CONTEXT_CHUNKS,
  },
};
