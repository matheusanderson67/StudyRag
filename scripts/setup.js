// Cria o .env a partir do .env.example e gera um JWT_SECRET aleatório. Seguro para rodar várias vezes.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');

if (fs.existsSync(envPath)) {
  console.log('.env já existe — nada a fazer.');
} else {
  const secret = crypto.randomBytes(32).toString('hex');
  const text = fs.readFileSync(path.join(root, '.env.example'), 'utf8').replace('JWT_SECRET=troque-este-valor', `JWT_SECRET=${secret}`);
  fs.writeFileSync(envPath, text);
  console.log('.env criado. Para usar o Gemini, edite AI_PROVIDER e GEMINI_API_KEY nele.');
}
