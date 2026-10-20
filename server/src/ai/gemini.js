import { AIError } from '../lib/errors.js';
import { aiDeadlineContext } from '../middleware/ai-deadline.js';
import { EMBEDDING_DIM } from './constants.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const EMBED_BATCH = 50;
const SINGLE_REQUEST_TIMEOUT_MS = 14_000;
const REQUEST_GAP_MS = 450;
const RETRY_LIMIT = 1;
const MAX_SHORT_RETRY_MS = 3_000;

const normalize = (vector) => {
  const norm = Math.hypot(...vector) || 1;
  return vector.map((x) => x / norm);
};

function parseJson(text) {
  const clean = text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  try { return JSON.parse(clean); }
  catch { throw new AIError('A IA devolveu um formato inesperado. Tente de novo.'); }
}

function retryAfterMs(value) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

function inspectFailure(raw) {
  try {
    const error = JSON.parse(raw).error ?? {};
    const details = Array.isArray(error.details) ? error.details : [];
    const violations = details.filter((d) => d['@type']?.includes('QuotaFailure'))
      .flatMap((d) => d.violations ?? [])
      .map((v) => `${v.quotaId ?? ''} ${v.description ?? ''}`).join(' ');
    const daily = /per.?day|daily|requestsperday|tokensperday/i.test(`${violations} ${error.message ?? ''}`);
    const retry = details.find((d) => d['@type']?.includes('RetryInfo'))?.retryDelay;
    const delay = typeof retry === 'string' ? retry.match(/^(\d+(?:\.\d+)?)s$/) : null;
    return { daily, retryMs: delay ? Number(delay[1]) * 1000 : null };
  } catch { return { daily: false, retryMs: null }; }
}

function timeoutError() {
  return new AIError('A IA demorou mais que o limite de 15 segundos. Tente uma pergunta mais curta ou outro horário.');
}

export function createGeminiProvider({
  apiKey, model, embeddingModel, minSimilarity,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  requestTimeoutMs = SINGLE_REQUEST_TIMEOUT_MS,
}) {
  // Fila de intervalos curtos entre INÍCIOS de chamadas; não bloqueia enquanto a IA gera.
  let queue = Promise.resolve();
  let nextStart = 0;

  const remaining = (operationDeadline) => Math.max(0, operationDeadline - Date.now());
  const ensureTime = (deadline) => {
    if (remaining(deadline) < 150) throw timeoutError();
  };

  async function wait(ms, deadline, signal) {
    ensureTime(deadline);
    if (signal?.aborted) throw timeoutError();
    if (ms <= 0) return;
    if (ms + 150 >= remaining(deadline)) throw timeoutError();
    // sleep é injetável para os testes; a interrupção da requisição cancela a espera.
    let listener;
    const aborted = signal ? new Promise((_, reject) => {
      listener = () => reject(timeoutError());
      signal.addEventListener('abort', listener, { once: true });
    }) : null;
    try { await (aborted ? Promise.race([sleep(ms), aborted]) : sleep(ms)); }
    finally { if (listener) signal.removeEventListener('abort', listener); }
    ensureTime(deadline);
  }

  async function waitForTurn(deadline, signal) {
    const turn = queue.catch(() => {}).then(async () => {
      await wait(Math.max(0, nextStart - Date.now()), deadline, signal);
      ensureTime(deadline);
      nextStart = Date.now() + REQUEST_GAP_MS;
    });
    queue = turn.catch(() => {});
    await turn;
  }

  async function post(path, body, { background = false } = {}) {
    const context = background ? null : aiDeadlineContext();
    // Indexação ocorre em segundo plano: não impor o prazo da interface ao processamento de PDFs.
    const callTimeoutMs = background ? 45_000 : requestTimeoutMs;
    const deadline = context?.deadline ?? (Date.now() + callTimeoutMs);
    const signal = context?.signal;
    for (let attempt = 0; attempt <= RETRY_LIMIT; attempt++) {
      await waitForTurn(deadline, signal);
      ensureTime(deadline);
      if (signal?.aborted) throw timeoutError();
      const controller = new AbortController();
      const ms = Math.min(callTimeoutMs, remaining(deadline));
      const timer = setTimeout(() => controller.abort(), ms);
      const onAbort = () => controller.abort();
      signal?.addEventListener('abort', onAbort, { once: true });
      try {
        const res = await fetchImpl(`${BASE}/${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (res.ok) {
          const data = await res.json();
          ensureTime(deadline);
          return data;
        }
        const detail = await res.text().catch(() => '');
        const failure = inspectFailure(detail);
        const isRetryable = [429, 500, 502, 503, 504].includes(res.status);
        const retryMs = retryAfterMs(res.headers?.get?.('retry-after')) ?? failure.retryMs ?? (res.status === 429 ? 1200 : 600);
        if (isRetryable && !failure.daily && attempt < RETRY_LIMIT && retryMs <= (background ? 12_000 : MAX_SHORT_RETRY_MS)
          && retryMs + 800 < remaining(deadline)) {
          console.warn(`[gemini] HTTP ${res.status}; nova tentativa curta em ${retryMs}ms.`);
          await wait(retryMs, deadline, signal);
          continue;
        }
        console.error(`[gemini] HTTP ${res.status} em ${path}: ${detail.slice(0, 450)}`);
        if (res.status === 429) throw new AIError(failure.daily
          ? 'A cota diária do Gemini foi atingida. Confira o Google AI Studio.'
          : 'O Gemini atingiu um limite temporário de uso. Aguarde alguns instantes e tente novamente.');
        if (res.status === 404) throw new AIError('Modelo Gemini não encontrado. Verifique GEMINI_MODEL no .env.');
        if (res.status === 401 || res.status === 403 || /API key/i.test(detail)) {
          throw new AIError('A chave GEMINI_API_KEY foi recusada. Confira o .env.');
        }
        throw new AIError('O Gemini não conseguiu concluir o pedido. Tente novamente.');
      } catch (error) {
        if (error instanceof AIError) throw error;
        if (controller.signal.aborted || signal?.aborted || remaining(deadline) < 150) throw timeoutError();
        if (attempt < RETRY_LIMIT && remaining(deadline) > 1500) {
          await wait(500, deadline, signal);
          continue;
        }
        console.error(`[gemini] Falha de rede em ${path}: ${error?.message ?? error}`);
        throw new AIError('Não consegui falar com o Gemini. Confira sua conexão e tente novamente.');
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      }
    }
    throw timeoutError();
  }

  async function generate({ system, prompt, temperature = 0.2, json = false, task = '', count = 5 }) {
    // Respostas curtas aceleram a conclusão e reduzem o consumo de tokens.
    const outputTokens = task === 'quiz' ? Math.min(4500, Math.max(1800, count * 150))
      : json ? 1800 : task === 'summary' ? 1300 : task === 'tutor' ? 1250 : 1050;
    const data = await post(`models/${model}:generateContent`, {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature,
        maxOutputTokens: outputTokens,
        ...(model.toLowerCase().startsWith('gemini-3') ? { thinkingConfig: { thinkingLevel: 'low' } } : {}),
        ...(json ? { responseMimeType: 'application/json' } : {}),
      },
    });
    if (data.promptFeedback?.blockReason) throw new AIError('A IA recusou processar este conteúdo.');
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim();
    if (!text) throw new AIError('A IA não devolveu resposta. Tente novamente.');
    return text;
  }

  return {
    name: 'gemini', label: `Gemini (${model})`, isMock: false,
    embeddingModelId: `gemini:${embeddingModel}:${EMBEDDING_DIM}`,
    minSimilarity: minSimilarity ?? 0.4,
    async embedDocuments(texts) {
      const out = [];
      for (let i = 0; i < texts.length; i += EMBED_BATCH) {
        const batch = texts.slice(i, i + EMBED_BATCH);
        const data = await post(`models/${embeddingModel}:batchEmbedContents`, {
          requests: batch.map((text) => ({
            model: `models/${embeddingModel}`,
            content: { parts: [{ text }] },
            taskType: 'RETRIEVAL_DOCUMENT', outputDimensionality: EMBEDDING_DIM,
          })),
        }, { background: true });
        if (data.embeddings?.length !== batch.length) throw new AIError('Quantidade inesperada de embeddings do Gemini.');
        out.push(...data.embeddings.map((e) => normalize(e.values)));
      }
      return out;
    },
    async embedQuery(text) {
      const data = await post(`models/${embeddingModel}:embedContent`, {
        model: `models/${embeddingModel}`, content: { parts: [{ text }] },
        taskType: 'RETRIEVAL_QUERY', outputDimensionality: EMBEDDING_DIM,
      });
      if (!data.embedding?.values) throw new AIError('O Gemini não retornou o embedding da pergunta.');
      return normalize(data.embedding.values);
    },
    generateText: (opts) => generate(opts),
    async generateJson(opts) { return parseJson(await generate({ ...opts, json: true })); },
  };
}
