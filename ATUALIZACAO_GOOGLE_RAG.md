# Login Google, fontes em PDF e respostas com evidências

## Atualizar sem perder os seus dados

Extraia esta versão em uma pasta nova. Copie o seu `.env` atual para a raiz dela e
também os PDFs da pasta `data/uploads` (ou o caminho definido em `UPLOAD_DIR`).
Use a mesma configuração de MySQL e o mesmo Qdrant. Não apague o banco nem o volume
Docker. Se `stored_path` no banco apontar para a pasta antiga, mantenha essa pasta:
o visualizador e a reindexação precisam dos arquivos nesses caminhos.

Na pasta nova execute `npm ci`, depois `npm run dev`. A inicialização aplica a
migração `003_google_accounts.sql`, que cria a tabela de identidades Google.
Ela não modifica as contas existentes. Não é necessário reindexar por causa desta
atualização; isso só é necessário ao mudar o modelo de embeddings.

## Configurar o login Google

O login usa autorização OAuth no backend, com state, PKCE e cookies HttpOnly
temporários. Solicita apenas nome, e-mail e identidade, sem acesso ao Drive.

1. Acesse https://console.cloud.google.com/ e escolha/crie um projeto.
2. Em Google Auth Platform, configure Branding, Audience e os e-mails de teste,
   se o aplicativo estiver em teste.
3. Em Clients, crie um cliente OAuth do tipo **Web application**.
4. Adicione a URI de redirecionamento autorizada exatamente:
   `http://localhost:5173/api/auth/google/callback`.
5. Acrescente ao `.env` da raiz:

```dotenv
GOOGLE_CLIENT_ID=seu-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=seu-client-secret
GOOGLE_REDIRECT_URI=http://localhost:5173/api/auth/google/callback
FRONTEND_URL=http://localhost:5173
```

6. Reinicie a aplicação e abra **http://localhost:5173/login**. O botão aparece
   quando ID e segredo estiverem preenchidos. Não misture localhost e 127.0.0.1.

O segredo fica só no backend. Não publique seu `.env`. Em produção, use HTTPS,
`NODE_ENV=production`, `FRONTEND_URL` com a origem pública (sem caminho) e uma URI
de callback que encaminhe `/api/auth/google/callback` ao backend na mesma origem
do frontend. Cadastre essa URI exata no Google. Configure também `CORS_ORIGIN`.

Se já existe uma conta local com o mesmo e-mail, entre com a senha original.
Não fazemos vínculo automático por e-mail; esta versão não inclui uma tela para
vincular contas existentes. Uma conta nova criada pelo Google deve voltar a entrar
com Google. O cancelamento retorna à tela de login com uma mensagem.

Referência oficial: https://developers.google.com/identity/protocols/oauth2/web-server

## Respostas mais rastreáveis

Com `AI_PROVIDER=gemini` e uma chave válida, a resposta agora precisa indicar os
trechos usados por número, como `[1]`, e fornecer uma citação literal. O servidor
confere os números e a existência dos excertos no material recuperado. Referências
ou citações inválidas geram um erro explicativo, sem salvar uma resposta inválida.
Se o modelo indicar que falta apoio, retorna “não encontrei a resposta”.

A existência de uma citação não garante que toda a conclusão esteja correta.
Confira o conteúdo e avalie perguntas representativas dos seus PDFs. Não foi
possível medir a precisão com seus materiais nem chamar o Gemini sem sua chave.

No modo `mock`, aparece um aviso de demonstração: ele continua sendo um simulador,
sem a capacidade de interpretação do Gemini. Para mudar para Gemini, configure a
chave, reinicie e reindexe cada PDF pela biblioteca para gerar os novos embeddings.

## Abrir a fonte

Expanda uma fonte e clique em **Abrir PDF na página N**. A rota exige login e
confere novamente a participação no grupo e a visibilidade do documento.
O token não é colocado na URL. O PDF abre em nova aba no leitor do navegador;
o posicionamento `#page=N` depende do suporte desse leitor. O excerto citado fica
visível no cartão da fonte, sem marcação automática dentro do PDF.

## Validação

Testes automatizados cobrem state/PKCE, e-mail verificado, citações inválidas,
filtro vetorial, download autorizado e troca de sessão Google. Os serviços Google,
Gemini e MySQL são simulados nesses testes; a autenticação real depende das suas
credenciais. Veja o relatório de validação incluído para os resultados da entrega.
