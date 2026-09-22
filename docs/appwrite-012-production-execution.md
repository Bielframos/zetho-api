# Appwrite 0.12.0 production schema and backfills — 2026-09-22

Project: `690a16460002c718253a` at `https://appwrite.adstrito.com/v1`, database `app`.

## Schema safety gate

A read-only snapshot found 37 existing tables. The API config described four additional tables, ten optional columns on existing tables, and three additional indexes. The frontend config is a partial and older schema; both configs differ from production in existing permissions, numeric bounds, index order metadata, and buckets. Running `appwrite push all` or `appwrite push tables` against them is unsafe.

`npm run appwrite:provision-012` passed against the live schema with 37 create-only operations. `npm run appwrite:provision-012 -- --apply` completed and passed its postcheck. A second live dry run reported zero remaining operations. No existing table permissions changed, and no existing table reported a lower row count after the schema operation. The create-only script does not update or delete rows, tables, columns, or indexes. Existing client write permissions remain until the coordinated API/frontend cutover.

## Backfills

- Feed: dry run found 14 ratings, 46 comments, 19 lists, 3,276 journal entries (1,645 latest owner/game states), and 206 list items. The main apply completed. A targeted second pass handled 149 latest invalid statuses. Final paginated count: 7,226 feed events, including 5,685 status events; independent validation found zero stale status sources and zero missing status sources.
- Achievements: dry run found 46 profiles, 1,235 unique completion events and zero badge candidates. Apply completed successfully; `completion_events` has 1,235 rows, `user_badges` and badge Z-Coin transactions have zero.
- Playtime: dry run found zero games with historical completed playtime; no apply was needed. The script scanned 55,770 existing `z_entry_count` rows without writing to them.
- Social counters: dry run found zero corrections; no apply was needed.

## Historical reconciliation policy and reviewed plan

The original audit found 718 entries without `processedAt`, including 85 older than an already processed entry for the same owner/game. These are not replay candidates. The later backup contains 3,283 source entries and 1,645 read models. Of the pending entries, 701 predate the API synchronization implementation recorded in Git; 705 of 708 affected pairs already match the latest source state. Two read-model rows are missing and one like change is not projected.

The earlier `scripts/reconcile-entry-history.ts` diagnostic reported 361 differences by comparing historical counters and ledger totals against today's reward rules. That comparison is superseded as a release gate: reward rules changed in May 2026, and the ledger cannot attribute credits to individual source entries. The correct treatment is [the historical reconciliation policy](entry-reconciliation-policy.md), which preserves every existing ledger entry and balance. It neither grants assumed missing credits nor debits historical rewards.

The verified backup at `.ops-backups/reconciliation-20260922-before-v2` covers 21 tables, including 55,770 game-counter rows and 1,799 ledger rows. The reviewed `scripts/apply-entry-reconciliation.ts` plan contains 845 projection/counter patches: 664 read models, 2 profiles and 179 game counters, followed by marking the 718 reconciled source entries. Its preflight has zero blockers and no financial changes. The manifest and journal are stored under `.ops-backups/reconciliation-preacl-plan.json`; these private backup artifacts must not be committed.

Apply completion must be established from the script's final verification, not from the plan or an intermediate batch checkpoint. The script verifies source content, existing `processedAt` values, ledger, balances, expected projections and derived counters. Appwrite expands the `game` relationship in transactional reads; the baseline comparison normalizes only this relationship to its ID. The journal allows a verified checkpoint to resume; an uncheckpointed commit requires manual inspection.

## Cutover and subsequent checks

Follow [the rollout procedure](feed-timeline-rollout.md) for permission revocation, repeat backfills, API/frontend publishing and release-readiness gating. The temporary frontend alone does not stop old browser tabs or API-key writers. Permission changes run after reconciliation's final verification because they update row metadata and would invalidate its baseline.

There were 21 pre-existing outbox events marked `FAILED` at the initial audit, including two `GAMEPLAY_SESSION_COMPLETED` events. The achievements backfill recomputes their achievement effects but does not change outbox statuses. Classify and record those separately from new release failures. Final deployment and reconciliation results must be appended after their actual verification.

## Reconciliação aplicada — 22/09/2026

- Backup integral com checksums de 21 tabelas salvo fora dos repositórios, com acesso restrito. Banco `app` temporariamente desabilitado para clientes durante o corte; o acesso por chave administrativa continua disponível.
- Manifesto revisado: 3.283 eventos, 718 pendentes, 708 pares com pendências. Aplicados 41 lotes transacionais: 664 reparos/criações de projeções, dois totais de perfis e 179 contadores de jogos. Duas projeções ausentes foram criadas; total final: 1.647.
- Verificação final do reconciliador: `status: verified`; snapshot SHA-256 `57d403416ca03ae7915b0141eb0ae44c54e4ac47552104f044006885a981cd56`. Novo plano sem pendências, mudanças ou bloqueios.
- Conteúdo dos eventos preservado, exceto marcação dos 718 `processedAt` e metadados de atualização. As 1.799 transações financeiras e os saldos dos 46 perfis foram preservados integralmente; nenhuma recompensa histórica foi reproduzida.
- O Appwrite materializou defaults `null → 0` ao atualizar contadores: `likes` em 55 linhas, `hypedCount` em 152, e cada agregado de playtime em 179. Todos esses defaults foram conferidos no schema remoto; a verificação mantém comparação exata para quaisquer outros campos/valores.
- O script antigo de replay agora é somente leitura; `--apply` falha antes de acessar o Appwrite. O procedimento autorizado é o manifesto descrito em `entry-reconciliation-policy.md`.
- Testes locais finais: 44 suítes / 247 testes passaram; build Nest concluído. Build Angular passou. Os avisos existentes de budget CSS e CommonJS permanecem.

### Corte de permissões e comparação integral

- Removidas concessões de escrita do cliente em 12 tabelas e 3.656 linhas; permissões de leitura mantidas. Configs locais de API e frontend refletem o destino somente leitura nas tabelas presentes em cada config.
- A primeira atualização de tabelas revelou que Appwrite usa `rowSecurity: false` quando esse parâmetro é omitido. A opção original foi restaurada em 11 tabelas enquanto o banco permanecia fechado para clientes. O script foi corrigido para enviar e verificar explicitamente `name`, `enabled` e `rowSecurity`.
- Alterar permissões das listas também materializou os defaults zero de `saveCount` e `likeCount` em nove linhas originalmente nulas, sem outros efeitos nos campos de negócio.
- Nova captura integral após a correção e comparação com o backup: 72.433 linhas originais verificadas nas 21 tabelas, nenhuma linha excluída, apenas os reparos planejados e a materialização de defaults documentada. Colunas, índices, nomes, opções e leituras das tabelas preservados. Zero concessões de escrita de clientes em todas as tabelas/linhas auditadas, incluindo as duas novas projeções.
- Backfill final de conquistas aplicado: 46 perfis, 1.235 conclusões únicas. Diagnóstico prévio: zero candidatos a badges; dados de conclusão, badges, extrato e saldos permaneceram iguais ao backup.
- Diagnósticos finais: contadores sociais sem nulos ou divergências; playtime sem jogos históricos com duração (55.770 linhas de contadores existentes, zero novas).
- Os 21 outbox `FAILED` preexistentes pertencem a eventos editoriais/jogatinas; foram preservados, sem replay de notificações históricas. Nenhum pendente foi encontrado no backup.

### Feed final antes dos deploys

- Backfill final concluído sobre 3.283 entradas, 1.648 estados finais usuário/jogo, 14 avaliações, 46 comentários, 19 listas e 206 itens.
- Auditoria independente: 7.242 eventos de feed, dos quais 5.701 de status; todos apontam para fontes existentes e todos os status correspondem ao evento mais recente e aos seguidores atuais. Nenhum evento esperado ausente ou obsoleto.
- Em relação ao primeiro backfill: 24 eventos derivados adicionados e oito removidos por estados finais que deixaram de ser elegíveis para o feed. Os eventos originais de jogatina continuam preservados.
- Configs dos dois repositórios comparados com o remoto após o corte: permissões, `rowSecurity` e `enabled` coincidem em todas as tabelas auditadas presentes em cada config. Divergências de schema anteriores e não relacionadas continuam protegidas pelo provisionador aditivo; não usar push global.
