# Auditoria de reconciliação de jogatina — 2026-09-22

Execute `npx ts-node -r tsconfig-paths/register scripts/audit-entry-reconciliation.ts` no repositório da API para repetir a auditoria **somente leitura**. O script rejeita argumentos e não possui modo de aplicação.

## Resultado remoto da auditoria inicial

- 3.276 eventos em `z_entries`; 718 sem `processedAt`, distribuídos por 708 pares usuário/jogo.
- 85 pendentes são anteriores a um evento já processado do mesmo par; 633 não têm sucessor processado.
- Dos 708 pares afetados, 705 já coincidem com o último evento nos campos atuais de status, curtida e hype. Dois não têm `z_entries_read`; um tem uma mudança de curtida `true` para `false` ainda não refletida.
- O relatório ampliado encontra diferenças em campos derivados legados, como `likedEver` e `maxStatusReached`. Esses números **não** representam, por si, estados atuais incorretos.
- O extrato de Z-Coins contém `userId`, motivo e valor, mas não identifica o evento nem o jogo que gerou cada lançamento. Não é possível atribuir créditos pendentes a eventos específicos apenas por esse extrato.

## Procedimento atual

Esta auditoria registra o diagnóstico inicial; seus números não representam uma verificação posterior ao reparo. O procedimento aprovado está em [Política de reconciliação histórica](entry-reconciliation-policy.md) e [Rollout](feed-timeline-rollout.md).

Não usar `scripts/reconcile-unprocessed-entries.ts --apply` para esse histórico. A ausência de `processedAt` não comprova ausência de efeitos; as regras de recompensas mudaram e o extrato não identifica cada evento. O novo `scripts/apply-entry-reconciliation.ts` gera um manifesto com backup e hashes, reconstitui projeções e contadores e preserva integralmente extrato e saldos. Exige fontes estáveis, validações transacionais e pós-check antes de concluir.
