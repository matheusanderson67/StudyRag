
import { AsyncLocalStorage } from 'node:async_hooks';

// Tempo máximo para a operação de IA: 60 segundos
export const AI_RESPONSE_BUDGET_MS = 60_000;

const scope = new AsyncLocalStorage();

export const aiDeadlineContext = () => scope.getStore();

export function aiDeadline(req, res, next) {
  const controller = new AbortController();

  const context = {
    signal: controller.signal,
    deadline: Date.now() + AI_RESPONSE_BUDGET_MS
  };

  const timer = setTimeout(() => {
    controller.abort();

    if (!res.headersSent && !res.writableEnded) {
      res.status(504).json({
        error:
          'A IA demorou mais de 60 segundos para responder. ' +
          'O Gemini pode estar sobrecarregado. ' +
          'Aguarde alguns instantes e tente novamente.'
      });
    }
  }, AI_RESPONSE_BUDGET_MS);

  const close = () => {
    clearTimeout(timer);

    if (!controller.signal.aborted) {
      controller.abort();
    }
  };

  res.once('finish', close);
  res.once('close', close);

  scope.run(context, next);
}
