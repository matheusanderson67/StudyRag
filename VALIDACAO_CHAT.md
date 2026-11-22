# Validação da entrega do chat

- Passaram os três testes de `server/tests/chat.test.js`. Eles cobrem envio,
  histórico, idempotência, limites, não membros, espaços individuais, duas conexões
  SSE recebendo a mesma mensagem e encerramento após revogação da participação.
- Os testes usam HTTP real local e SQL simulado, sem alterar banco do usuário.
- `npm run build` concluiu a compilação da interface.
- A tela foi aberta em Edge automatizado nas larguras de 1440 e 390 pixels, com
  APIs simuladas. O envio apareceu no histórico e HTML enviado permaneceu texto.
- Falta validar a migração e o fluxo completo com MySQL real, a reconexão em uma
  falha real de rede e o acesso por outros computadores. Não houve teste de carga.
- As mensagens de teste e as credenciais usadas na revisão não são incluídas no
  banco do projeto. O pacote não contém `.env` nem `node_modules`.
