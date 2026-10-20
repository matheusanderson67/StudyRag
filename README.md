# StudyRAG — MySQL + Gemini | Visual 2.0

Plataforma web de estudo colaborativo com **professor particular de IA**, biblioteca de PDFs, busca RAG com fontes, resumos, simulados, dashboard de evolução e mapas mentais clicáveis.

**Tecnologias:** React 19 + Vite, Node.js 22 + Express, MySQL 8.0+ com `mysql2`, Gemini (Google AI Studio), JWT, PDF e embeddings em JSON.

## 1. Antes de começar (Windows)

- MySQL Server 8.0+ instalado e iniciado (MySQL Workbench sozinho não é o servidor).
- Node.js 22+ instalado (`node -v`).
- VS Code para abrir a pasta `studyrag-js`.
- Senha do seu usuário MySQL (pode ser `root`, ou um usuário separado com permissão de criar banco).
- Chave Gemini se quiser usar a IA real: https://aistudio.google.com/apikey

**Este projeto usa o MySQL da sua máquina e NÃO precisa do Docker.**

## 2. Instalar e configurar

Na pasta `studyrag-js`, abra o terminal:

```powershell
npm install
npm run setup
```

Abra o arquivo `.env` na raiz (não é `server/.env`). Ajuste os campos de acordo com o **MySQL instalado no seu PC**:

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=SUA_SENHA_DO_MYSQL
DB_NAME=studyrag
```

O banco `studyrag` é criado automaticamente no primeiro início, se o usuário tiver a permissão `CREATE`. Alternativamente, no MySQL Workbench execute:

```sql
CREATE DATABASE IF NOT EXISTS studyrag CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Se a senha contiver `#` ou espaço, envolva-a em aspas no `.env`. **Nunca envie a senha ou chave Gemini para alguém, nem publique o `.env`.**

## 3. Ativar o Gemini

No mesmo `.env`:

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=SUA_CHAVE_AQUI
GEMINI_MODEL=gemini-flash-latest
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
```

- `AI_PROVIDER=mock` funciona sem chave e simula o comportamento da IA para demonstração.
- Se receber erro de modelo, use `npm run check:ai` para consultar os modelos disponíveis para sua chave e edite o `.env`.
- Nunca coloque a chave em `web/src` ou no navegador.

## 4. Iniciar o sistema

```powershell
npm run check:db
npm run dev
```

Acesse **http://localhost:5173**.

Na primeira execução a API prepara automaticamente as tabelas do MySQL. O projeto já inclui o arquivo `iniciar.bat`, que instala dependências se faltar, cria `.env` caso não exista e executa o app. **Configure a senha do MySQL no `.env` antes de usar o BAT.**

Se quiser rodar separado:

```powershell
npm run dev -w server
npm run dev -w web
```

## 5. Funcionalidades

- **Contas e grupos:** criar, entrar com convite, membros, funções, proteção de acesso.
- **Biblioteca:** upload de PDF com visibilidade pública do grupo ou privada; processamento e reindexação.
- **Perguntas com RAG:** respostas restritas aos PDFs, trechos, arquivo e página.
- **Professor com IA:** básico, intermediário, avançado; explicações, exemplos, passo a passo e exercícios.
- **Resumo com IA:** síntese de conteúdo disponível com fontes.
- **Simulados:** 10–30 questões, três dificuldades, cronômetro visual, comentários e ranking.
- **Dashboard:** taxa de acertos, tentativas, melhor resultado, evolução e histórico.
- **Mapas mentais:** relações visuais entre conceitos com seleção clicável e explicação.
- **Interface renovada:** dashboard inicial, navegação lateral, telas de estudo, gráficos e layout responsivo.

## 6. Como funciona o RAG no MySQL

1. O aluno envia um PDF. O texto é extraído, dividido em trechos com indicação da página.
2. O Gemini gera um embedding de 768 dimensões para cada trecho.
3. Os embeddings são gravados em uma coluna **JSON** do MySQL, junto ao texto e ao PDF.
4. Em uma pergunta, o backend gera o embedding da pergunta e recupera os trechos visíveis ao aluno.
5. O Node.js calcula similaridade de cosseno e uma pontuação lexical; combina rankings por **Reciprocal Rank Fusion (RRF)**.
6. Só os trechos relevantes são enviados ao Gemini para gerar a resposta e as fontes.

**Limitação importante:** a busca vetorial acontece em memória no Node.js, com limite de 4.000 trechos candidatos por consulta. É adequada para trabalhos, testes e grupos pequenos/médios, mas não substitui um índice vetorial nativo para bases gigantes. Como os vetores pertencem a modelos, trocas entre modo mock e Gemini exigem reindexar PDFs antigos.

## 7. Testes

```powershell
npm test
```

Os testes de integração usam **outro banco**, `studyrag_test`, criado automaticamente; requerem que o MySQL esteja ativo. Testes de integração **apagam os dados de `studyrag_test`**. NÃO guarde arquivos importantes nele. Para usar credenciais diferentes nos testes, configure `DB_HOST_TEST`, `DB_PORT_TEST`, `DB_USER_TEST` e `DB_PASSWORD_TEST`.

## 8. Dicas / problemas comuns

- **ECONNREFUSED**: serviço MySQL parado ou porta diferente de 3306.
- **Access denied for user**: usuário/senha ou permissões incorretos em `.env`.
- **Unknown database**: seu usuário não tem permissão para criar bancos; crie `studyrag` no Workbench.
- **Gemini 429**: limite de requisições da conta atingido.
- **Sem material pronto**: aguarde indexação; confira status na Biblioteca.
- **Documento desatualizado**: mudou o modelo de embedding ou provedor; clique em Reindexar.
- **Banco PostgreSQL anterior**: dados do PostgreSQL NÃO são migrados automaticamente. Esta distribuição cria uma base MySQL nova; se quiser preservar dados antigos será necessário exportá-los, convertê-los e importar separadamente, além de reindexar os PDFs.

## Estrutura resumida

```text
studyrag-js/
  .env.example
  iniciar.bat
  server/
    src/config.js
    src/db/{pool.js,migrate.js,migrations/001_init.sql}
    src/services/{ingestion.js,retrieval.js,rag.js,quiz.js,learning.js}
    src/routes/
  web/
    src/components/
    src/pages/
    src/styles.css
```

**Nota de validação:** a sintaxe dos arquivos JS/JSX foi conferida, mas a execução end-to-end depende de uma instalação real de MySQL, Node e chave Gemini, que precisam ser testadas no seu PC.

## 8. Módulos adicionados — Estudo individual + StudyRAG Planner

Esta versão **acrescenta** dois espaços no menu lateral, sem substituir as páginas existentes:

- **Estudo individual (`/individual`)**: biblioteca privada, perguntas com RAG, Professor IA, resumos, mapas mentais, simulados e acompanhamento pessoal. Reutiliza os serviços originais de RAG. Cada conta recebe uma área exclusiva que não aparece na lista de grupos, não aceita convites e não pode ser consultada por outras contas.
- **Planner IA (`/planner`)**: chat para pedir lembretes em português, confirmação antes de salvar, cadastro manual, calendário, provas, entregas, estudos diários/semanais/em dias específicos, aviso antecipado, conclusão e exclusão.

**Para atualizar seu projeto em funcionamento:** guarde uma cópia de segurança da pasta e do banco MySQL, pare `npm run dev`, substitua apenas os arquivos do projeto pelos desta versão **sem apagar seu `.env` nem a pasta `data/uploads`**, execute `npm install` caso seja necessário e inicie de novo com `npm run dev`. A migração `002_personal_planner.sql` será aplicada automaticamente e acrescentará somente as novas tabelas. Não é necessário apagar nem recriar o banco existente.

**Sobre as notificações:** enquanto o StudyRAG estiver aberto, o site verifica os avisos automaticamente. O botão *Ativar notificações do navegador* solicita permissão para exibir avisos do sistema **enquanto a aplicação estiver em execução**. Se o navegador/site estiver fechado, os avisos continuam pendentes no banco e são mostrados ao retornar. **Esta versão não envia push com o navegador fechado, e-mail nem WhatsApp.** Para isso será necessária outra integração (serviço de push/agenda com servidor ativo). O agendador de repetições usa o fuso horário informado pelo navegador; transições raras de horário de verão podem exigir ajuste manual.

**Comandos para experimentar:** “Amanhã às 19h estudar Java”; “Prova de Redes dia 28/10 às 08h”; “Toda segunda às 20h estudar SQL”. Confira a interpretação antes de salvar. O Gemini pode ajudar a interpretar pedidos mais livres quando habilitado; comandos simples funcionam também no modo mock. Cada pedido gera uma proposta para confirmação; o chat não executa lembretes sem o aluno aprovar.

**Testes:** `npm run test -w server` (utiliza o banco `studyrag_test`, e por isso requer MySQL configurado). Novos testes em `server/tests/planner.test.js` verificam isolamento, interpretação e lembretes.

## 9. Revisão de tempo de resposta — edição com limite de 15 segundos

**Objetivo:** evitar que o aluno fique esperando indefinidamente. As solicitações de geração de **Perguntas RAG, Professor IA, Resumos, Simulados, Mapas mentais e interpretação do Planner** passam a ter um prazo de **14,5 segundos no servidor** e **15 segundos no navegador**. Se o Gemini não concluir nesse prazo, o aluno recebe uma mensagem de tempo esgotado, em vez de aguardar mais. **Não é possível garantir que toda resposta será gerada em até 15 segundos**: em caso de lentidão/cota do Google, a solicitação pode terminar com mensagem de erro dentro desse prazo.

As chamadas de RAG que precisam de embedding + geração compartilham **o mesmo prazo**, evitando somar 30s+30s. Erros 429 e 503 têm no máximo uma nova tentativa curta, somente se houver tempo restante. Quando o Google pede uma espera longa ou a cota diária está esgotada, a API não fica presa repetindo requisições. O Gemini 3 mantém raciocínio `low` e saída limitada para reduzir latência. Para diminuir prompts extensos, resumos e mapas consideram até 12 trechos, simulados até 16 (se `MAX_CONTEXT_CHUNKS` for menor, o valor menor prevalece).

**PDF:** o upload continua respondendo rapidamente e a indexação de embeddings acontece em segundo plano. O processamento de PDFs grandes pode demorar mais de 15 segundos — isso é intencional, para não falhar arquivos grandes por causa do limite da tela. O progresso continua aparecendo na Biblioteca.

**Arquivos alterados nessa revisão:** `server/src/ai/gemini.js`, `server/src/middleware/ai-deadline.js` (novo), `server/src/middleware/error.js`, `server/src/routes/study.js`, `server/src/routes/planner.js`, `server/src/services/rag.js`, `server/src/services/learning.js`, `server/src/services/quiz.js`, `web/src/api.js` e testes relacionados. As rotas antigas, estilos, tabelas e arquivos de banco **não foram removidos ou reescritos**.

**Verificações efetuadas:** sintaxe de todos os arquivos `.js` do servidor; 9 testes isolados do Gemini (429, 503, quota diária, tempo de espera, embeddings e espaçamento de chamadas). **Pendências de validação:** a instalação das dependências não concluiu neste ambiente; por isso não foi possível executar o conjunto completo de testes, compilar o React com Vite, conectar a um MySQL real ou chamar sua chave Gemini. Depois de instalar com `npm install`, rode `npm test` (atenção: usa/limpa `studyrag_test`) e `npm run build`. Faça backup antes de substituir arquivos. Preserve `.env` e `data/uploads` do projeto anterior.

**Para um resultado mais rápido:** na geração de simulados, escolha 10 questões quando possível; 20 a 30 questões podem exigir mais tempo que 15s na API gratuita do Gemini. Se receber 429 por cota diária, aguarde a renovação ou revise os limites do projeto no Google AI Studio: o código não aumenta a cota da conta.
