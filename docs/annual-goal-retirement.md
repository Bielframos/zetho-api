# Retirada de Meta do ano — zerei #99

## Publicação

Publicar primeiro a PR de retirada do widget em Bielframos/zerei. Só então publicar esta API. Clientes de frontend antigos podem continuar em cache: GET e PUT `achievements/:profileId/goals/:year` viram tombstones HTTP 410 com mensagem para atualizar o aplicativo. Não consultam nem gravam no banco. O PUT continua autenticado.

## Inventário

O consumidor era `AnnualGoalWidget` no perfil do frontend. Foram removidos `GoalDto`, `getAnnualGoal`, `setAnnualGoal` e seus testes exclusivos. Os caminhos descontinuados servem apenas como tombstones para versões cacheadas, sem manter o recurso operacional.

A tabela `annual_goals` permanece com dados e campos intactos (`profileId`, `year`, `target`, identificador e timestamps), mas sem leitores/escritores na aplicação. Os scripts históricos de provisionamento e backup mantêm a referência para não perder rastreabilidade nem excluir dados inadvertidamente. Remoção física exige migração independente e revisável.

`completion_events`, eventos de conclusão, biblioteca, estatísticas, badges, catálogo e showcase continuam ativos. A validação de ano permanece por ser usada nos eventos de conclusão, independentemente das metas.
