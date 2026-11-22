# Conversa em tempo real nos grupos

## Atualização

Esta versão reúne chat, Qdrant, login Google e verificação de fontes.

1. Extraia em uma pasta nova e copie seu `.env` atual para a raiz.
2. Preserve os PDFs e os caminhos de `stored_path` usados no MySQL. Não apague a
   pasta anterior se o banco apontar para arquivos dentro dela.
3. Execute `npm ci` e `npm run dev`. A inicialização aplica automaticamente a
   migração `003_group_chat.sql`, criando a tabela `group_messages`.
4. Abra um grupo de estudo e selecione a aba **Conversa**.

Nenhuma nova chave de API nem pacote é necessário. As mensagens de texto não usam
o Gemini e não geram cobranças de IA. O MySQL deve permitir criar a nova tabela.
O chat não aparece no estudo individual.

## Teste em equipe

Abra o sistema no navegador normal e em uma janela anônima. Entre com duas contas,
coloque ambas no mesmo grupo e abra a aba Conversa. Envie mensagens nas duas
janelas. Confira nome, horário e persistência após recarregar a página.

Para acesso por outros computadores, hospede o frontend e a API no mesmo endereço
acessível à turma, com HTTPS. `localhost` em cada computador aponta para a própria
máquina. O projeto não foi publicado nesta entrega.

## Funcionamento e limites

- Texto de até 2.000 caracteres, com histórico paginado em lotes de 50 mensagens.
- Envio HTTP autenticado. Recebimento por SSE usando fetch com token no cabeçalho.
  A API verifica o MySQL a cada segundo e envia as últimas 50 mensagens quando
  surgem novos registros. As abas combinam os registros sem duplicar IDs.
- Atualização normalmente em cerca de um segundo, sujeita à rede e ao banco.
- Reconexão automática em caso de queda. As mensagens enviadas ficam no MySQL.
- Limite de 30 envios por minuto por usuário, por processo da API, e até três
  conexões simultâneas de recebimento por usuário em cada processo.
- Identificador por envio evita duplicação ao repetir a mesma tentativa.
- O servidor verifica participação no grupo também durante o recebimento. Após
  remoção ou saída, a conexão termina na próxima verificação. Consultas de
  mensagens também incluem a participação no grupo.
- A exclusão do grupo remove o histórico pelo relacionamento do MySQL. Sair do
  grupo não apaga as mensagens anteriores do participante.
- Texto renderizado pelo React, sem interpretação de HTML enviado pelo usuário.
- Sem anexos, edição/exclusão de mensagens, presença online, notificações fora da
  aba, criptografia ponta a ponta ou participação automática da IA nesta versão.

As consultas periódicas tornam esta implementação adequada para demonstrar e
validar grupos pequenos. Antes de escalar, medir carga e substituir as consultas
por publicação de eventos entre instâncias. Em múltiplas instâncias, compartilhar
os limites de uso. O proxy deve permitir streaming e não armazenar respostas SSE
em buffer.

## Testes

`node --test --test-timeout=20000 server/tests/chat.test.js`

Os testes usam SQL simulado, duas conexões HTTP reais locais, bloqueio para não
membros, leitura do histórico, paginação, limite de envio e
revogação da participação. Não alteram seu banco de dados.
