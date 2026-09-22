# Agrupamento da biblioteca

O agrupamento por ano do registro foi removido. Os modos disponíveis são recentes sem agrupamento, ano de lançamento e A–Z. A coluna `statusChangedAt` e os scripts históricos abaixo permanecem preservados; não é necessário executar o backfill para usar os agrupamentos atuais.

`z_entries_read.statusChangedAt` é uma coluna datetime opcional. Guarda a data do evento que levou ao status atual, preservada em likes, alterações de plataforma e edições sem mudança de status. Quando há uma nova transição para `completed`, a data muda. Não representa a data real em que o usuário terminou o jogo fora do Zetho. Datas desconhecidas permanecem nulas; nunca usar `$createdAt`/`$updatedAt` da projeção como substituto.

Os anos de registro são calculados em UTC para evitar que o mesmo registro apareça em anos diferentes conforme o visitante. `games.releaseYear` representa o primeiro lançamento cadastrado do jogo, independentemente da plataforma jogada.

## Consulta e apresentação

`GET /profile/:fingerprint/entries` é público, assim como a biblioteca do perfil. Aceita `status` (`completed`, `backlog`, `playing`, `dropped`, `wishlist`), `group` (`release-year`, `alphabetical`, `none`), `limit` (1–100, padrão 32) e `offset` (padrão 0). A resposta é `{ rows, total }`; cada entrada inclui `game` e `groupKey`.

O padrão é a listagem por última atualização, sem agrupamento. Nos modos por ano, a ordem é decrescente. Dentro de cada ano, os títulos são ordenados em português, sem diferenciar acentos/maiúsculas, com desempate pelo ID da entrada. A–Z reúne iniciais acentuadas com sua letra e coloca números/símbolos em `#`, no final. Datas ausentes aparecem em “Ano não informado”. Sem agrupamento preserva a ordem por última atualização. Jogos removidos do catálogo são excluídos dos resultados e do total exibível.

A consulta busca os registros em lotes de 100 e os metadados dos jogos com até quatro consultas simultâneas, ordenando o conjunto antes de recortar a página. Evita duplicar nome/ano na projeção, mas o custo de cada página é proporcional à biblioteca inteira; não há cache persistente ou truncamento silencioso. Para bibliotecas muito grandes, medir latência antes de adotar campos de ordenação indexados ou snapshots em cache. A paginação por offset não congela a biblioteca entre requisições: alterações simultâneas podem mudar posições.

O frontend conserva `t` e `group` na URL, reúne seções contínuas entre páginas, descarta respostas de uma seleção anterior e permite repetir páginas que falharam.

## Ordem de implantação

1. Com as variáveis `APPWRITE_ENDPOINT`, `APPWRITE_PROJECT` e `APPWRITE_API_KEY` do ambiente correto, inspecionar a migração: `node scripts/provision-entry-status-date.cjs`. O comando é somente leitura por padrão.
2. Adicionar somente a coluna: `node scripts/provision-entry-status-date.cjs --apply`. Reexecutar sem `--apply` até confirmar `statusChangedAt already available`. Não publicar o handler antes dessa confirmação: o Appwrite rejeita campos ainda não provisionados.
3. Publicar API e frontend. As duas configurações Appwrite locais já incluem a coluna. O endpoint lê/enriquece/ordena toda a biblioteca antes de paginar a resposta, sem novos índices nem cópias de nome/ano do jogo na projeção.
4. Inspecionar recuperação histórica: `npx ts-node scripts/backfill-entry-status-dates.ts`. Somente as projeções com status definido e data ausente são candidatas. O script não altera dados sem `--apply`.
5. Aplicar: `npx ts-node scripts/backfill-entry-status-dates.ts --apply`. Ele reconstrói a última transição efetiva a partir dos snapshots, ordenados por instante e ID. Histórico vazio, inválido ou incompatível com a projeção fica sem data; eventos pendentes são ignorados até processamento. Projeções alteradas durante a leitura são ignoradas, e a escrita/checagem usa transação. Conflitos de commit interrompem a execução, que pode ser repetida de forma idempotente.
6. Conferir totais `planned`, `updated`, `unknown`, `pending`, `concurrent`. Reexecutar após resolver pendências. Nenhum comando altera eventos, contadores ou Z-Coins; somente o timestamp da projeção é preenchido.

Não é possível detectar lacunas históricas que já tenham sido removidas da origem; a recuperação presume snapshots íntegros. Havendo conhecimento de importação incompleta, manter essas datas desconhecidas em vez de tratá-las como data real de conclusão.

## Reconciliação e validação

O reconciliador de eventos pendentes também projeta `statusChangedAt` pelo mesmo helper. Não substitui o backfill integral, pois ignora grupos sem eventos pendentes. O aplicador continua verificando genericamente o plano e a linha original dentro da transação.

Testes cobrem likes/edições entre anos, nova conclusão após retomar o jogo, histórico fora de ordem, desempate por ID, datas inválidas e conflitos de escrita no backfill. Rollback do aplicativo pode deixar a coluna opcional no banco; não é necessário apagá-la. Evite processar eventos com o handler antigo durante o rollback, pois ele não atualizará a nova data.
