# Validação desta entrega

- Quatro testes automatizados do cliente REST passaram: filtro de documentos,
  criação de coleção e envio em lotes, exclusão com escopo e propagação de falhas.
  Estes testes usam respostas simuladas e não comprovam conexão com um Qdrant real.
- Os arquivos JavaScript do backend passaram pela verificação sintática do Node.
- A instalação `npm ci` falhou neste ambiente com “Exit handler never called”.
  A suíte unitária original não executou por dependências ausentes (`zod`).
- O Docker CLI está instalado, mas o Docker Engine não estava em execução.
  Não foi possível validar o fluxo completo com MySQL e Qdrant reais, nem o build
  do frontend. Nenhum banco existente do usuário foi alterado.

Após configurar os serviços, valide: envio e consulta de PDF; isolamento entre
grupos e documentos privados; mudança de visibilidade; reindexação; exclusão de
documento e grupo; migração por `npm run index:vectors`; falha e recuperação do Qdrant.
