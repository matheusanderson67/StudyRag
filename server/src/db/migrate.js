import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { config } from '../config.js';
import { pool, query } from './pool.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export async function migrate() {
  // Instalação local: cria o banco se o usuário tiver permissão.
  const admin = await mysql.createConnection({ ...config.mysql, database: undefined, multipleStatements: false });
  try {
    const name = config.mysql.database;
    if (!/^[a-zA-Z0-9_]+$/.test(name)) throw new Error('Nome do banco inválido.');
    await admin.query(`CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } finally { await admin.end(); }
  await query('CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(200) PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
  const applied = new Set((await query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await fs.readFile(path.join(dir, file), 'utf8');
    // Migrações DDL do MySQL fazem commit implícito; cada comando é idempotente no esquema inicial.
    const statements = sql.split(';').map((s) => s.trim()).filter(Boolean);
    for (const statement of statements) await pool.query(statement);
    await query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    console.log(`[mysql] migração aplicada: ${file}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => pool.end());
}
