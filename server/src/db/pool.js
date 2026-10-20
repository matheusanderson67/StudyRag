
import mysql from 'mysql2/promise';
import { config } from '../config.js';

// Pool de conexões com suporte a MySQL local e Aiven.
export const pool = mysql.createPool({
  ...config.mysql,
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true,
  timezone: 'Z',
});

export function bindSql(sql, params = []) {
  const values = [];

  const statement = sql.replace(/\$(\d+)/g, (_, index) => {
    const i = Number(index) - 1;

    if (i < 0 || i >= params.length) {
      throw new Error(
        `Parâmetro SQL inválido: $${index}`
      );
    }

    values.push(params[i]);

    return '?';
  });

  return {
    statement,
    values,
  };
}

async function execute(conn, sql, params = []) {
  const { statement, values } = bindSql(sql, params);

  const [result] = await conn.execute(statement, values);

  return {
    rows: Array.isArray(result) ? result : [],
    rowCount: Array.isArray(result)
      ? result.length
      : result.affectedRows,
    insertId: result.insertId,
  };
}

export const query = (sql, params) =>
  execute(pool, sql, params);

export async function tx(fn) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const out = await fn({
      query: (sql, params) =>
        execute(connection, sql, params),
    });

    await connection.commit();

    return out;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
