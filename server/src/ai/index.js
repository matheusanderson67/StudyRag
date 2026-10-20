import { config } from '../config.js';
import { createGeminiProvider } from './gemini.js';
import { createMockProvider } from './mock.js';

function build() {
  const minSimilarity = config.rag.minSimilarity;
  if (config.ai.provider === 'gemini') {
    return createGeminiProvider({
      apiKey: config.ai.geminiApiKey,
      model: config.ai.geminiModel,
      embeddingModel: config.ai.geminiEmbeddingModel,
      minSimilarity,
    });
  }
  return createMockProvider({ minSimilarity });
}

let current = build();

/** Provedor de IA ativo (Gemini ou simulado, conforme AI_PROVIDER). */
export const getAI = () => current;
/** Troca o provedor em tempo de execução (usado nos testes). */
export const useAI = (provider) => { current = provider; };
