import multer from 'multer';
import { ZodError } from 'zod';
import { AIError, HttpError } from '../lib/errors.js';
import { config } from '../config.js';

export function errorHandler(err, req, res, _next) {
  if (res.headersSent) return; // Timeout já respondeu; não tente enviar JSON duas vezes.
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    return res.status(400).json({ error: issue?.message ?? 'Dados inválidos.', field: issue?.path?.join('.') });
  }
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err instanceof AIError) return res.status(502).json({ error: err.message });
  if (err instanceof multer.MulterError) {
    const tooBig = err.code === 'LIMIT_FILE_SIZE';
    return res.status(tooBig ? 413 : 400).json({
      error: tooBig ? `O arquivo passa do limite de ${Math.round(config.maxPdfBytes / 1048576)} MB.` : 'Falha no envio do arquivo.',
    });
  }
  if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Este registro já existe. Confira os dados e tente novamente.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido.' });
  if (config.env !== 'test') console.error(`[erro] ${req.method} ${req.originalUrl}`, err);
  res.status(500).json({ error: 'Erro interno. Tente novamente.' });
}
