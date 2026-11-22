# Banco vetorial do StudyRAG

O projeto agora oferece Qdrant para busca semântica e mantém o MySQL para dados,
textos, permissões e uma cópia dos embeddings. O modo original continua disponível.
Não é necessária alteração nas tabelas do MySQL nem dependência adicional no Node.

## Ativação local

1. Instale as dependências normalmente: `npm ci` (Node 22 ou superior).
2. Inicie o serviço: `docker compose -f compose.vector.yml up -d`.
3. No `.env` da raiz, configure:

```dotenv
VECTOR_STORE=qdrant
QDRANT_URL=http://127.0.0.1:6333
QDRANT_API_KEY=
QDRANT_COLLECTION_PREFIX=studyrag
QDRANT_TIMEOUT_MS=15000
```

4. Com o MySQL configurado e sem uploads/reindexações em andamento, execute
   `npm run index:vectors` para copiar os embeddings existentes. Use o mesmo
   `AI_PROVIDER` e modelo com que os documentos foram processados. O comando pode
   ser repetido após falhas; ele não chama a IA. Documentos de modelos anteriores
   devem ser reprocessados na biblioteca.
5. Inicie/reinicie a aplicação normalmente. Novos PDFs são indexados automaticamente.

O volume Docker conserva os vetores após reiniciar o contêiner. Para Qdrant Cloud,
use o endereço HTTPS e a API key fornecidos pelo serviço, somente no backend.
Os índices de payload `document_id` e `group_id` (tipo keyword) são criados
automaticamente. As coleções são criadas no primeiro upload ou
na migração, com nome derivado do modelo e da dimensão do embedding.

## Comportamento

- A pesquisa vetorial considera todos os documentos autorizados, além dos 4.000
  trechos recentes usados pela busca lexical original. Os rankings são combinados.
- As permissões e o status são consultados no MySQL antes da busca e novamente
  antes de carregar os resultados. Mudar a visibilidade não exige reindexar.
- Exclusão de documento, grupo e documentos privados de membros remove os vetores.
- Falha do Qdrant é propagada; não há troca silenciosa para a busca local. Um PDF
  só fica pronto após a gravação dos vetores. Use reindexar para repetir uma falha.
- MySQL e Qdrant não compartilham transações: uma falha de commit, encerramento
  abrupto ou exclusão concorrente pode deixar pontos órfãos. A validação SQL impede
  que eles exponham documentos excluídos. Reindexação limpa os pontos do documento.
- Para voltar ao comportamento original, defina `VECTOR_STORE=mysql` e reinicie.

Não execute a suíte de API contra uma base real: ela recria dados em `studyrag_test`.
Os testes do cliente Qdrant podem ser executados sem serviços externos:
`node --test server/tests/vector.test.js`.

Referências: https://qdrant.tech/documentation/search/filtering/ e
https://api.qdrant.tech/api-reference/search/query-points.
