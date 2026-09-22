# Política de reconciliação histórica de jogatinas

## Evidência e origem dos registros pendentes

A leitura remota de 22/09/2026 encontrou 3.283 eventos, dos quais 718 estavam sem `processedAt`. Desses pendentes, 552 foram criados em novembro de 2025, 122 em dezembro e 27 em janeiro de 2026: 701 antecedem a implementação de sincronização da API registrada no Git em fevereiro de 2026. Os outros 17 estão distribuídos entre fevereiro (1), maio (7), agosto (8) e setembro (1).

O schema com `processedAt` aparece no commit `4eccb99` de 17/02/2026; o endpoint de sincronização e marcação aparece em `6ced883` de 22/02/2026. Datas de commits não provam a data de implantação ou ausência de outros processadores, mas demonstram que `processedAt == null` não basta para concluir que eventos históricos nunca tiveram efeito. A auditoria anterior já constatava 705 de 708 pares pendentes com estado atual coincidente com o último evento; os 85 eventos anteriores a um sucessor processado também não podem ser reproduzidos sobre a projeção atual.

## Z-Coins

Antes do commit `2c4d26b` de 22/05/2026, uma mudança de status debitava a recompensa do status anterior e creditava a próxima; uma nova curtida podia premiar novamente. Esse commit introduziu a premiação monotônica por `maxStatusReached` e `likedEver`. Comparar o extrato histórico inteiro à regra atual de premiação não demonstra créditos faltantes.

A reconciliação preserva o extrato e os saldos existentes sem novos créditos ou débitos. O extrato não identifica cada evento/jogo de origem, portanto não há base demonstrável para atribuir diferenças a eventos específicos. O backup mantém todos os dados necessários para auditoria financeira posterior; nenhuma suposição financeira é convertida em escrita.

## Reparação autorizada

1. Com as escritas suspensas, capturar as linhas completas de eventos, projeções, perfis, contadores e extrato; persistir backup local restrito e hashes antes de escrever.
2. Para cada par com evento pendente, usar o histórico completo ordenado por `$createdAt` e `$id` para projetar o estado atual. Preservar estados anti-spam já mais fortes (`likedEver` verdadeiro e maior `maxStatusReached`). Corrigir ou criar apenas a projeção correspondente, mantendo campos não relacionados.
3. Recalcular os contadores derivados de status, curtidas, hype e tempo de conclusão a partir de todas as projeções atuais, incluindo as reparadas. Preservar campos de avaliação, interação social, conexões e quaisquer outros contadores fora desse conjunto.
4. Validar que eventos, extrato e saldos continuam íntegros e que as projeções e contadores correspondem ao plano. Só depois marcar os eventos pendentes como reconciliados em `processedAt`, sem reproduzir handlers, notificações ou recompensas.
5. Aplicar operações em transações limitadas, com validação das imagens anteriores e registro de progresso para retomada. Nunca excluir eventos ou substituir linhas completas por versões reduzidas.
6. Conferir novamente integridade dos eventos (exceto `processedAt` e metadados de atualização), extrato e saldos; ausência de eventos pendentes; projeções e contadores esperados. Rodar os backfills próprios de feed e conquistas separadamente, com suas próprias verificações.

`processedAt` após este procedimento significa que o evento foi incorporado à projeção histórica reconciliada. Não é uma afirmação de que o handler original foi executado ou que uma recompensa individual foi paga.
