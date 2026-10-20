import { AsyncLocalStorage } from 'node:async_hooks';

// O prazo é por operação HTTP (não por chamada separada de embedding/geração).
// Evita somar duas esperas de 15s no fluxo RAG.
export const AI_RESPONSE_BUDGET_MS = 14_500;
const scope = new AsyncLocalStorage();
export const aiDeadlineContext = () => scope.getStore();

export function aiDeadline(req, res, next) {
  const controller = new AbortController();
  const context = { signal: controller.signal, deadline: Date.now() + AI_RESPONSE_BUDGET_MS };
  const timer = setTimeout(() => {
    controller.abort();
    if (!res.headersSent) {
      res.status(504).json({ error: 'A IA não respondeu dentro de 15 segundos. Tente novamente com um PDF menor ou uma pergunta mais curta.' });
    }
  }, AI_RESPONSE_BUDGET_MS);
  const close = () => {
    clearTimeout(timer);
    controller.abort();
  };
  res.once('finish', close);
  res.once('close', close);
  scope.run(context, next);
}
