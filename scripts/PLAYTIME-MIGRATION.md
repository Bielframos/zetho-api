# Demanda 6: migração de jogatina

`zetho-api/appwrite.config.json` é a fonte do esquema de produção. As mesmas colunas estão em `zerei/appwrite.config.json` para ambientes provisionados pelo frontend.

1. Publique as colunas opcionais `playedPlatform`, `completionType` e `playtimeMinutes` em `z_entries` e `z_entries_read`, e `completedPlaytimeMinutes` e `completedPlaytimeCount` em `z_entry_count`. Todas são aditivas. Aguarde os índices/esquema ficarem disponíveis.
2. Publique a API e o frontend juntos depois de revogar as permissões de escrita do cliente na tabela e nas linhas existentes (`scripts/revoke-client-row-writes.ts --apply`). A API processa as gravações e o outbox interno; durante o rollout, os logs antigos continuam válidos. Execute `scripts/reconcile-unprocessed-entries.ts` para revisar entradas ainda sem `processedAt` e use `--apply` apenas com as escritas pausadas. Se uma entrada pendente for anterior a outra já processada do mesmo usuário/jogo, o script aborta sem gravar; esse histórico exige reconstrução cronológica completa ou correção manual.
3. Rode `npx ts-node -r tsconfig-paths/register scripts/backfill-playtime-stats.ts` para contar os tempos históricos sem gravar. Se houver tempos a agregar, pause as escritas na API e repita com `--apply`, usando as mesmas variáveis de Appwrite da API. Retome as escritas após o script terminar. O script reconstitui todos os agregados com base no estado atual de `z_entries_read` e pode ser repetido enquanto as escritas estiverem pausadas.
4. Confira um jogo com `completed` e tempo positivo, depois altere o tempo e remova o status `completed`; a média deve refletir cada transição. Contagem zero deve aparecer como “Sem dados”.

Os minutos são inteiros. Somente uma linha atual por usuário e jogo com status `completed` e minutos positivos participa da média; zero, nulo e outros status não participam. O histórico em `z_entries` permanece append-only.
