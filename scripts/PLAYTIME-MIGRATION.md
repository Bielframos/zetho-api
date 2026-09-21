# Demanda 6: migração de jogatina

`zetho-api/appwrite.config.json` é a fonte do esquema de produção. As mesmas colunas estão em `zerei/appwrite.config.json` para ambientes provisionados pelo frontend.

1. Publique as colunas opcionais `playedPlatform`, `completionType` e `playtimeMinutes` em `z_entries` e `z_entries_read`, e `completedPlaytimeMinutes` e `completedPlaytimeCount` em `z_entry_count`. Todas são aditivas. Aguarde os índices/esquema ficarem disponíveis.
2. Publique a API com a projeção e o delta transacional antes de publicar o frontend. Durante o rollout, os logs antigos continuam válidos.
3. Se existirem tempos importados ou registros projetados antes da atualização dos agregados, pause a escrita do webhook e rode `npx ts-node -r tsconfig-paths/register scripts/backfill-playtime-stats.ts` a partir de `zetho-api`, com as mesmas variáveis de Appwrite usadas pela API. Retome o webhook após o script terminar. O script reconstitui todos os agregados com base no estado atual de `z_entries_read` e pode ser repetido enquanto as escritas estiverem pausadas.
4. Publique o frontend. Confira um jogo com `completed` e tempo positivo, depois altere o tempo e remova o status `completed`; a média deve refletir cada transição. Contagem zero deve aparecer como “Sem dados”.

Os minutos são inteiros. Somente uma linha atual por usuário e jogo com status `completed` e minutos positivos participa da média; zero, nulo e outros status não participam. O histórico em `z_entries` permanece append-only.
