
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

const rootDir = fileURLToPath(
  new URL('../../', import.meta.url)
);

loadEnv({
  path: path.join(rootDir, '.env'),
  quiet: true,
});

// Ignora variáveis vazias
const env = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => value !== '')
);

const DEV_SECRET = 'dev-secret-troque-isto-antes-de-publicar';

// VALIDAÇÃO DAS VARIÁVEIS DE AMBIENTE
const schema = z.object({
  NODE_ENV: z.enum([
    'development',
    'test',
    'production',
  ]).default('development'),

  PORT: z.coerce.number().int().default(3001),

  // MYSQL
  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().default(3306),
  DB_USER: z.string().default('root'),
  DB_PASSWORD: z.string().default(''),

  DB_NAME: z.string()
    .regex(/^[a-zA-Z0-9_]+$/)
    .default('studyrag'),

  // SSL - AIVEN
  DB_SSL: z.enum(['true', 'false']).default('false'),
  DB_SSL_CA_BASE64: z.string().optional(),

  // SEGURANÇA
  JWT_SECRET: z.string()
    .min(16, 'JWT_SECRET precisa ter pelo menos 16 caracteres')
    .default(DEV_SECRET),

  JWT_EXPIRES_IN: z.string().default('7d'),

  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  // UPLOAD DE PDF
  UPLOAD_DIR: z.string().default('data/uploads'),
  MAX_PDF_MB: z.coerce.number().positive().default(20),

  // GEMINI
  AI_PROVIDER: z.enum(['mock', 'gemini']).default('mock'),

  GEMINI_API_KEY: z.string().optional(),

  GEMINI_MODEL: z.string()
    .default('gemini-flash-latest'),

  GEMINI_EMBEDDING_MODEL: z.string()
    .default('gemini-embedding-001'),

  // RAG
  CHUNK_SIZE: z.coerce.number().int().default(900),
  CHUNK_OVERLAP: z.coerce.number().int().default(150),
  TOP_K: z.coerce.number().int().default(6),
  MIN_SIMILARITY: z.coerce.number().optional(),
  MAX_CONTEXT_CHUNKS: z.coerce.number().int().default(24),
});

// VALIDAR CONFIGURAÇÕES
const parsed = schema.safeParse(env);

if (!parsed.success) {
  const msg = parsed.error.issues
    .map((issue) =>
      `  - ${issue.path.join('.')}: ${issue.message}`
    )
    .join('\n');

  throw new Error(
    `Configuração inválida no .env:\n${msg}`
  );
}

const e = parsed.data;

// SEGURANÇA EM PRODUÇÃO
if (
  e.NODE_ENV === 'production' &&
  e.JWT_SECRET === DEV_SECRET
) {
  throw new Error(
    'Defina um JWT_SECRET próprio antes de rodar em produção.'
  );
}

if (
  e.AI_PROVIDER === 'gemini' &&
  !e.GEMINI_API_KEY
) {
  throw new Error(
    'AI_PROVIDER=gemini exige GEMINI_API_KEY.'
  );
}

if (e.CHUNK_OVERLAP >= e.CHUNK_SIZE) {
  throw new Error(
    'CHUNK_OVERLAP precisa ser menor que CHUNK_SIZE.'
  );
}

// SSL PARA MYSQL AIVEN
function getMysqlSSL() {
  if (e.DB_SSL !== 'true') {
    return undefined;
  }

  const valor = e.DB_SSL_CA_BASE64?.trim();

  if (!valor) {
    throw new Error(
      'DB_SSL=true exige o certificado da Aiven em DB_SSL_CA_BASE64.'
    );
  }

  let ca = valor;

  // Se for Base64, converte para PEM
  if (!valor.includes('-----BEGIN CERTIFICATE-----')) {
    try {
      ca = Buffer.from(
        valor.replace(/\s/g, ''),
        'base64'
      ).toString('utf8');
    } catch {
      throw new Error(
        'Não foi possível decodificar o certificado SSL.'
      );
    }
  }

  // Converte caracteres \n em quebras de linha reais
  ca = ca.replace(/\\n/g, '\n').trim();

  if (
    !ca.includes('-----BEGIN CERTIFICATE-----') ||
    !ca.includes('-----END CERTIFICATE-----')
  ) {
    throw new Error(
      'Certificado SSL inválido. Confira DB_SSL_CA_BASE64 no Render.'
    );
  }

  return {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: true,
    ca,
  };
}

// CONFIGURAÇÃO EXPORTADA
export const config = {
  env: e.NODE_ENV,
  port: e.PORT,

  mysql: {
    host: e.DB_HOST,
    port: e.DB_PORT,
    user: e.DB_USER,
    password: e.DB_PASSWORD,
    database: e.DB_NAME,
    ssl: getMysqlSSL(),
  },

  jwt: {
    secret: e.JWT_SECRET,
    expiresIn: e.JWT_EXPIRES_IN,
  },

  corsOrigin: e.CORS_ORIGIN,

  rootDir,

  uploadDir: path.resolve(
    rootDir,
    e.UPLOAD_DIR
  ),

  maxPdfBytes: Math.round(
    e.MAX_PDF_MB * 1024 * 1024
  ),

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
    minSimilarity: e.MIN_SIMILARITY,
    maxContextChunks: e.MAX_CONTEXT_CHUNKS,
  },
};
