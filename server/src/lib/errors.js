export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const badRequest = (m = 'Requisição inválida.') => new HttpError(400, m);
export const unauthorized = (m = 'Faça login para continuar.') => new HttpError(401, m);
export const forbidden = (m = 'Você não tem permissão para isso.') => new HttpError(403, m);
export const notFound = (m = 'Não encontrado.') => new HttpError(404, m);
export const conflict = (m = 'Conflito.') => new HttpError(409, m);

/** Falha ao falar com o provedor de IA  */
export class AIError extends Error {}
/** PDF ilegível, vazio ou sem texto  */
export class PdfError extends Error {}
