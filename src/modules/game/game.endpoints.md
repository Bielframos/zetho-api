# Game endpoints

## `POST /games/:gameId/ai-briefing`

Gera ou reutiliza um briefing em português usando
os dados catalogados do jogo. A resposta tem `overview`, `highlights`,
`bestFor`, `contentWarning`, `generatedAt` e `source` (`generated` ou `stored`).

O identificador é validado antes da consulta. Jogo inexistente retorna `404`;
indisponibilidade do provedor ou resposta fora do contrato retorna `502`.
O briefing é persistido. Jogos sem lançamento nos últimos 90 dias reutilizam o
registro existente indefinidamente; jogos recentes são regenerados após 45 dias.
O serviço usa o modelo configurado no provedor OpenAI do `AiModule`, portanto
requer `OPENAI_KEY` no ambiente de execução.

## `GET /games/search`

Parâmetros opcionais: `q` (até 128 caracteres), `genre` (id), `year`
(4 dígitos), `developer` e `publisher` (ids de empresa, por exemplo `igdb_5`),
`page` (inteiro positivo, padrão 1), `pageSize` (1–100, padrão 12) e `fingerprint`.
Os filtros são combinados com AND, inclusive nos títulos exatos.

Exemplos: `/games/search?q=fear`, `/games/search?q=gta`,
`/games/search?q=gow`, `/games/search?q=tlou&publisher=igdb_45`.
Também é possível filtrar por empresa sem informar `q`.

Resposta: `{ total, page, pageSize, pageCount, results }`. Cada resultado mantém
`$id`, `name`, `slug`, `coverUrl`, `releaseYear` e `zEntry`.
Consulta vazia sem filtros ou somente pontuação retorna uma lista vazia.
Não há importação, tradução nem gravação de capas no caminho da busca.

A normalização ignora caixa, acentos, pontos e apóstrofos; outros separadores
viram espaços. Todos os termos devem estar presentes como prefixos de palavras
ou siglas. Títulos normalizados exatos vêm primeiro; cada grupo é ordenado por
nome normalizado e `$id`, antes da paginação. Não há score calculado sobre uma
página isolada. Totais e offsets consideram os dois grupos sem duplicação.

Siglas são derivadas do título, dos subtítulos e dos nomes alternativos do IGDB,
com variantes para artigos/preposições. Isso cobre `fear`, `gta`, `gow`, `tlou`
e `botw` sem uma lista fixa de franquias. Siglas ambíguas podem retornar várias
franquias. Apelidos arbitrários precisam existir nos nomes alternativos;
a derivação de iniciais não consegue descobrir todos os hábitos da comunidade.
Não há correção de erros de digitação nem equivalência automática de números
romanos e arábicos.

### Ingestão e operação

O webhook do IGDB entrega referências numéricas, sem expansão. O recebimento cria
um jogo `basic` e um job em `game_search_jobs` na mesma transação. Para jogos já
existentes, apenas agenda uma atualização: não apaga capas, relações ou dados full.

O worker do `IGDBModule` roda a cada 5 segundos, resolve até 50 jogos por consulta
IGDB e grava os campos de descoberta junto com a conclusão dos jobs. Preenche
capas, gêneros e lançamento ausentes, resolve desenvolvedoras/publishers e mantém
aliases já cadastrados. O estado passa para `search_ready`; jogos `full` permanecem
`full`. Descrições, traduções, avaliações e relações não são alteradas pelo worker.

Reservas duram 10 minutos e podem ser retomadas após queda do processo. Falhas
transitórias voltam à fila com atraso crescente, limitado a 5 minutos. Atualizações
concorrentes são detectadas por snapshots validados após staging e pelo conflito
no commit da transação. Um webhook novo não pode ser confirmado por um worker de
uma geração anterior. O limitador Redis do IGDB é atômico e compartilhado, inclusive
nas retentativas. `GAME_SEARCH_WORKER_DISABLED=true` desativa o consumidor do app.

Na abertura, `enrich=true` solicita a ingestão completa. O mesmo checksum não
impede promover um registro incompleto para `full`. O cache distingue requisições
com e sem enriquecimento; um cache de dados básicos não suprime a ingestão full.

O índice `searchText` usa full-text com tokens codificados para evitar stemming,
stop words e limitações para palavras curtas. Inclui prefixos, siglas e os papéis
das empresas. Esta instalação do Appwrite 2.0.0 não aceita índices em arrays.
`searchName` tem índice separado para títulos exatos e ordenação.

### Backfill

O backfill usa o mesmo worker e a mesma fila do webhook. Ele não chama a ingestão
full nem executa tradução. As credenciais são as variáveis Appwrite/IGDB/Redis já
utilizadas pelo projeto. O SDK validado para esta implementação é `node-appwrite`
29.0.0, registrado nos lockfiles npm e pnpm.

```bash
# Schema aditivo; aguarda colunas e índices ficarem disponíveis
npm run games:backfill -- --schema --apply

# Inspeção do catálogo, sem enfileirar nem alterar jogos
npm run games:backfill

# Lote inicial de até 100 registros
npm run games:backfill -- --apply --canary

# Catálogo inteiro, consumo da fila e verificação final por cursor
npm run games:backfill -- --apply

# Para acelerar: consumidores adicionais em outro processo
SEARCH_BACKFILL_WORKERS=4 npm run games:backfill -- --worker --apply
# Neste modo o processo principal só alimenta a fila durante a leitura
SEARCH_BACKFILL_EXTERNAL_WORKERS=true npm run games:backfill -- --apply

# Confere os campos protegidos contra os snapshots originais
npm run games:search-audit
```

Antes de enfileirar, salva os registros originais em arquivos NDJSON privados em
`var/backfill-game-search/`, ignorados pelo Git. A memória é limitada ao lote atual.
Reexecutar ignora jogos com a versão atual do índice; `SEARCH_BACKFILL_AFTER` permite
retomar de um cursor. SIGTERM/SIGINT encerram consumidores ao fim do lote. O processo
`--worker` é contínuo: encerre-o após a conclusão do processo principal.

A execução só informa `phase: complete` após consumir os jobs e verificar todos os
documentos de busca por cursor, recalculando o índice a partir dos metadados locais.
Registros antigos sem metadados pesquisáveis são preservados e listados em
`withoutSearchableMetadata`; não recebem títulos inventados. O `total` do servidor
é limitado a 5.000 e não é usado como prova
de conclusão. O script de auditoria confere os dados protegidos; a normalização de
campos numéricos nulos para seus defaults zero pelo servidor é contabilizada à parte.
Alterações legítimas feitas pelo aplicativo durante o backfill também aparecem na
auditoria estrita e devem ser confrontadas com os snapshots e horários dos jobs;
não devem ser revertidas automaticamente.

Se uma consulta IGDB bem-sucedida não retornar um jogo, mantém os dados locais e
indexa o que está disponível, registrando `source_missing` no job concluído. Uma
falha HTTP não é tratada como jogo inexistente e permanece sujeita a retry.

Consultas textuais fazem duas leituras paginadas; `fingerprint` acrescenta uma leitura
em lote de zEntries. A paginação por offset mantém o contrato, com custo crescente
em páginas profundas. Os totais da API seguem os limites de contagem do servidor.

Referências: [consultas Appwrite](https://appwrite.io/docs/products/databases/tablesdb/queries)
e [transações](https://appwrite.io/docs/products/databases/tablesdb/transactions).
