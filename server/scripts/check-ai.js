
import { config } from '../src/config.js';
import { getAI } from '../src/ai/index.js';

const ai = getAI();

console.log(`Provedor ativo: ${ai.label}\n`);

if (ai.isMock) {
  console.log('Você está no modo simulado (AI_PROVIDER=mock).');
  console.log('Configure AI_PROVIDER=gemini no .env para usar o Gemini.');
  process.exit(0);
}

let falhas = 0;

async function step(label, fn, obrigatorio = true) {
  try {
    const resultado = await fn();

    console.log(
      `✔ ${label}${resultado ? ` — ${resultado}` : ''}`
    );

    return true;
  } catch (erro) {
    console.log(`✘ ${label} — ${erro.message}`);

    if (obrigatorio) {
      falhas++;
    } else {
      console.log(
        '  Aviso: a listagem de modelos é opcional.'
      );
    }

    return false;
  }
}

await step(
  'Listar modelos disponíveis',
  async () => {
    const url =
      'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200';

    const res = await fetch(url, {
      headers: {
        'x-goog-api-key': config.ai.geminiApiKey,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      throw new Error(
        `HTTP ${res.status}. Não foi possível listar os modelos.`
      );
    }

    const data = await res.json();
    const models = data.models ?? [];

    const pick = (method) =>
      models
        .filter((m) =>
          m.supportedGenerationMethods?.includes(method)
        )
        .map((m) => m.name.replace('models/', ''));

    console.log(
      '   Geração:',
      pick('generateContent')
        .filter((name) => /gemini/i.test(name))
        .slice(0, 12)
        .join(', ')
    );

    console.log(
      '   Embeddings:',
      pick('embedContent').join(', ')
    );

    return `${models.length} modelos encontrados`;
  },
  false
);

console.log(
  `\nModelo de geração: ${config.ai.geminiModel}`
);

console.log(
  `Modelo de embeddings: ${config.ai.geminiEmbeddingModel}\n`
);

await step('Gerar texto', async () => {
  const texto = await ai.generateText({
    system: 'Responda em uma frase curta.',
    prompt: 'O que é um banco de dados?',
  });

  return texto.slice(0, 80) + '…';
});

await step('Embedding de pergunta', async () => {
  const vetor = await ai.embedQuery('teste');

  if (!Array.isArray(vetor) || vetor.length !== 768) {
    throw new Error(
      `Dimensão inesperada: ${vetor?.length}`
    );
  }

  return `${vetor.length} dimensões`;
});

await step('Embedding de documento', async () => {
  const vetores = await ai.embedDocuments(['teste']);
  const vetor = vetores[0];

  if (!Array.isArray(vetor) || vetor.length !== 768) {
    throw new Error(
      `Dimensão inesperada: ${vetor?.length}`
    );
  }

  return `${vetor.length} dimensões`;
});

if (falhas > 0) {
  console.log(
    `\n${falhas} teste(s) obrigatório(s) falharam.`
  );

  process.exitCode = 1;
} else {
  console.log(
    '\nTudo certo! As operações principais do Gemini funcionam.'
  );
}
