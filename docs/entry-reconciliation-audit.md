# Auditoria de reconciliação de jogatina — 2026-09-22

Execute `npx ts-node -r tsconfig-paths/register scripts/audit-entry-reconciliation.ts` no repositório da API para repetir a auditoria **somente leitura**. O script rejeita argumentos e não possui modo de aplicação.

## Resultado remoto

- 3.276 eventos em `z_entries`; 718 sem `processedAt`, distribuídos por 708 pares usuário/jogo.
- 85 pendentes são anteriores a um evento já processado do mesmo par; 633 não têm sucessor processado.
- Dos 708 pares afetados, 705 já coincidem com o último evento nos campos atuais de status, curtida e hype. Dois não têm `z_entries_read`; um tem uma mudança de curtida `true` para `false` ainda não refletida.
- O relatório ampliado encontra diferenças em campos derivados legados, como `likedEver` e `maxStatusReached`. Esses números **não** representam, por si, estados atuais incorretos.
- O extrato de Z-Coins contém `userId`, motivo e valor, mas não identifica o evento nem o jogo que gerou cada lançamento. Não é possível atribuir créditos pendentes a eventos específicos apenas por esse extrato.

## Decisão

Não usar `scripts/reconcile-unprocessed-entries.ts --apply` no estado atual. O método `syncEntry` pode tratar um evento futuro como anterior quando falta o read model, e repetir entradas antigas pode sobrescrever projeções recentes ou duplicar contadores e créditos.

Antes de qualquer escrita: pausar as entradas pela API, clientes antigos e webhooks; repetir a auditoria em snapshot estável; classificar diferenças de status, curtida, hype, campos derivados, contadores e extrato; produzir um plano de operações idempotentes por par e usuário; revisar esse plano; aplicar em lotes transacionais com pós-check independente; retomar as escritas. A pausa deve ser combinada junto ao corte coordenado da release.
