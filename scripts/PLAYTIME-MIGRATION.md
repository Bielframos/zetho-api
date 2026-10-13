# Demanda 6: migração de jogatina

Os arquivos Appwrite descrevem as colunas desejadas, mas diferem do remoto em atributos legados. Compare o schema remoto antes de qualquer provisionamento; não execute um push amplo dos arquivos de configuração.

1. Publique as colunas opcionais `playedPlatform`, `completionType` e `playtimeMinutes` em `z_entries` e `z_entries_read`, e `completedPlaytimeMinutes` e `completedPlaytimeCount` em `z_entry_count`. Todas são aditivas. Aguarde os índices/esquema ficarem disponíveis.
2. Siga a sequência de implantação: manutenção, backup verificado, reconciliação por manifesto com `scripts/apply-entry-reconciliation.ts`, revogação das permissões de escrita em tabelas e linhas, backfills e publicação protegida pelo gate de readiness. A reconciliação preserva extrato e saldos; não reproduza o histórico com `reconcile-unprocessed-entries.ts --apply`.
3. Rode `npx ts-node -r tsconfig-paths/register scripts/backfill-playtime-stats.ts` para contar os tempos históricos sem gravar. Se houver tempos a agregar, pause as escritas na API e repita com `--apply`, usando as mesmas variáveis de Appwrite da API. Retome as escritas após o script terminar. O script reconstitui todos os agregados com base no estado atual de `z_entries_read` e pode ser repetido enquanto as escritas estiverem pausadas.
4. Confira um jogo com `completed` e tempo positivo, depois altere o tempo e remova o status `completed`; a média deve refletir cada transição. Contagem zero deve aparecer como “Sem dados”.

Os minutos são inteiros. Somente uma linha atual por usuário e jogo com status `completed` e minutos positivos participa da média; zero, nulo e outros status não participam. O histórico em `z_entries` permanece append-only.
