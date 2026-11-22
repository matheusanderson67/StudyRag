# Fotos no chat e revisão dos erros

Esta atualização parte dos arquivos locais de `StudyRag-publicacao` e mantém as
integrações existentes de Google, Qdrant e MySQL/Aiven. Não contém `.env`, senhas
ou chaves. Não foi publicada no GitHub nem no Render automaticamente.

## Fotos

Na aba Conversa de um grupo, escolha uma foto e envie com ou sem legenda. A prévia
permite remover a seleção antes do envio. Clique em uma foto recebida para abrir
em tamanho maior.

São aceitos JPG, PNG e WebP estáticos de até 5 MB e 20 milhões de pixels. O backend
decodifica o arquivo, remove metadados, ajusta a orientação e converte para WebP
de até 1600 x 1600 pixels, com tamanho final máximo de 2 MB. SVG, GIF animado e
arquivos inválidos não são aceitos.

As fotos ficam na tabela `group_message_images` do MySQL, associadas à mensagem.
Elas não dependem do disco temporário do Render. A API exige login e participação
no grupo para ler o arquivo. A exclusão do grupo remove também as fotos.
As imagens ocupam armazenamento e banda do Aiven. Acompanhe o espaço disponível;
para uso em grande escala, migre os binários para armazenamento de objetos privado.

As fotos são anexos da conversa, não entram na busca vetorial nem são interpretadas
automaticamente pela IA. As cópias já baixadas por outro membro não podem ser
revogadas. O upload não utiliza o Gemini.

## Revisão após o simulado

Quando houver questões erradas ou em branco, o resultado oferece **Agendar revisão
dos erros**. O aluno escolhe data e horário e confirma. O lembrete pessoal aparece
no Planner, com o título do simulado e as questões a revisar. A descrição respeita
o limite de 500 caracteres já existente no Planner.

O aviso usa antecedência de 10 minutos e aparece no aplicativo. Não há envio de
e-mail, WhatsApp nem agendamento automático sem confirmação. O bloco só oferece
uma criação por sessão de resultado; uma nova tentativa pode gerar outra revisão.

## Atualizar localmente e no Render

1. Preserve os PDFs e seu `.env`. Copie os arquivos novos sobre a cópia do projeto
   conectada ao GitHub, sem substituir `.git`, `.env` nem a pasta `data`.
2. Execute `npm ci` e `npm run build`.
3. Inicie com `npm run dev` para testar localmente.
4. Confira `git status`, crie o commit e envie ao GitHub como na atualização anterior.
5. O Render precisa instalar dependências com `npm ci` e gerar o frontend com
   `npm run build`. O comando de início continua `npm start`.

A biblioteca nova é `sharp`. O `package.json` do servidor e o `package-lock.json`
da raiz devem ser enviados juntos. Não copie `node_modules` do Windows para o
Render. A instalação no Render obtém os binários para Linux automaticamente.

Na inicialização, a migração `004_chat_images.sql` cria a tabela de fotos. O usuário
do MySQL precisa de permissões para executar essa criação. Não há novas variáveis
de ambiente nem necessidade de recriar o banco, o cluster ou o cliente Google.

## Validação da entrega

Passaram 10 testes automatizados de chat, fotos, evidências e fluxo Google.
Os testes de foto usam um arquivo PNG real gerado como fixture, conversão WebP,
rejeição de arquivo inválido e acima do tamanho, e bloqueio para não membro.
O banco de dados é simulado nesses testes.

O build da interface passou. No navegador com APIs simuladas foram conferidos:
prévia, envio sem legenda, exibição das fotos e criação de exatamente um lembrete
contendo apenas as questões erradas. Ainda falta validar com o MySQL/Aiven real,
com o Render e em celulares reais. Nenhum serviço externo do usuário foi alterado.
