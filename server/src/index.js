import { createApp } from './app.js';
import { getAI } from './ai/index.js';
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { pool, query } from './db/pool.js';

try {
  await migrate();
} catch (err) {
  console.error('\nNão consegui preparar o banco de dados.');
  console.error(`Confirme o serviço MySQL local e DB_HOST/DB_PORT/DB_USER/DB_PASSWORD no .env (banco ${config.mysql.database}).`);
  console.error(err.message);
  process.exit(1);
}

// Documentos que ficaram "processando" quando o servidor caiu não terminam sozinhos.
await query(`UPDATE documents SET status = 'error', error = 'Processamento interrompido. Use Reindexar.' WHERE status = 'processing'`);

const app = createApp();
const server = app.listen(config.port, () => {
  console.log(`StudyRAG API em http://localhost:${config.port}  |  IA: ${getAI().label}`);
});

const shutdown = () => server.close(() => pool.end().then(() => process.exit(0)));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
