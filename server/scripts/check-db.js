import mysql from 'mysql2/promise';
import { config } from '../src/config.js';

let connection;
try {
  connection = await mysql.createConnection({ ...config.mysql, database: undefined });
  const [rows] = await connection.query('SELECT VERSION() AS version');
  console.log('✅ MySQL acessível! Versão:', rows[0].version);
  console.log('Servidor:', `${config.mysql.host}:${config.mysql.port}`);
  console.log('Banco desejado:', config.mysql.database);
  console.log('Inicie a aplicação com: npm run dev');
} catch (error) {
  console.error('❌ Não consegui acessar o MySQL local.');
  console.error('Confira DB_HOST, DB_PORT, DB_USER e DB_PASSWORD no arquivo .env.');
  console.error('Detalhe técnico:', error.code || error.message);
  process.exitCode = 1;
} finally { await connection?.end(); }
