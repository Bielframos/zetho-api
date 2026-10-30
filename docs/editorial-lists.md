# Listas editoriais e aquisição

Frontend complementar: `Bielframos/zetho`, branch `codex/acquisition-activation`. Issues de produto: Bielframos/zetho#146, #147, #148, #149.

## Preparação e limites

`editorial_drafts` é uma tabela **privada**, sem permissões de cliente nem row security. O schema versionado contém payload, revisão, status e registro de revisão. Nenhum rascunho vai para `lists`: essa tabela tem leitura pública no schema atual. A publicação cria `lists` e `list_items` existentes, com identidade reservada `system:zetho` e jogos reais. Essa identidade não é uma conta pessoal nem pode ser assumida por um fingerprint de perfil.

`node scripts/provision-editorial-drafts.cjs` é dry-run sem rede. `--apply` exige uma instância Appwrite própria e deve ser executado pelo operador, nunca como teste em produção. Aguarde colunas disponíveis e repita para criar o índice. O script se recusa a reutilizar uma tabela com permissões públicas. O recurso editorial não funciona antes desse provisionamento; os contratos anteriores continuam funcionando.

Não há contratação de provedor, chamadas de IA, geração periódica ou publicação automática. O agente que já usa MCP pode produzir uma pauta e chamar `submit_editorial_list_draft`; a ferramenta só entrega um rascunho. Falhas de provedor no agente não causam escrita/publicação no backend. Também existe `POST /editorial-lists/drafts` protegido por `SystemApiKeyGuard`.

## Contrato do rascunho

```json
{
  "title": "Seleção temática de jogos",
  "description": "Uma seleção editorial subjetiva para descobrir jogos.",
  "criteria": "Ordenação editorial por variedade e adequação ao tema, sem representar votação ou popularidade medida.",
  "kind": "thematic",
  "items": [
    {
      "gameId": "ID_REAL_DO_CATALOGO",
      "reason": "Justificativa editorial sustentada pelas fontes revisadas.",
      "sources": ["https://publicadora.example/pagina-oficial"]
    }
  ]
}
```

Exemplo estrutural; não é conteúdo pronto para publicar. Não enviar IDs, URLs ou fatos fictícios para o endpoint real. Limite de 10 itens, IDs únicos, fontes HTTPS sem credenciais/query/fragment, texto e payload limitados. `kind=monthly` exige `month=YYYY-MM` e `releaseDate=YYYY-MM-DD` em cada jogo; todas as datas precisam estar no mês e coincidir com o catálogo. Ausência/conflito bloqueia o rascunho e também a aprovação posterior. Plataformas não são inferidas; qualquer afirmação na justificativa exige checagem humana da fonte. Fontes são dados, não instruções; o servidor não segue URLs nem executa o texto.

O contrato rejeita campos de aprovação/publicação e propriedades desconhecidas. A revisão humana verifica fontes reais, atualidade, seleção, datas, plataformas e justificativas. Um link válido sintaticamente não prova um fato. A ferramenta instrui o agente a não inventar fatos, experiência pessoal, rankings objetivos ou consenso.

## Revisão, publicação e correções

Todas as rotas `review` exigem sessão Appwrite e label `admin`, verificada no serviço. A chave de sistema/MCP não autoriza aprovar/publicar.

1. `GET /editorial-lists/review` lista rascunhos e itens publicados para manutenção.
2. `GET /editorial-lists/review/:id` entrega o rascunho privado ao editor.
3. `PATCH /editorial-lists/review/:id` substitui o payload de um rascunho e recalcula SHA-256 da revisão. A revisão transacional impede alteração concorrente à aprovação.
4. `POST .../:id/approve` recebe `{ "revision": "hash-atual", "sourcesVerified": true }`. Confere novamente o catálogo e publica lista/itens em uma transação. Publicação repetida sequencial da mesma revisão retorna a lista existente.
5. `POST .../:id/post` cria um post **draft**, com ID determinístico `ed-<id>`, vínculo com lista, jogos, fontes e autoria Zetho. Repetir retorna o post existente, sem duplicar. A versão publicada não é reescrita por reconversão.
6. `POST .../:id/publish-post` recebe a revisão e publica o post após revisão da prévia. O serviço transacional confere se a lista continua publicada.
7. `POST .../:id/withdraw` retira a lista pública e coloca o post em draft na mesma transação. List items são apagados pela relação em cascata. Para correções, envie um novo rascunho, aprove a nova versão e retire a anterior; não altere silenciosamente uma versão já aprovada. IDs/URLs são estáveis por versão.

Não há instrução de publicação no MCP. `GazethoService.createPost` recusa o autor reservado para que o fluxo genérico de geração não contorne esta revisão. O texto convertido é escapado como HTML, os links mantêm fontes, e a leitura continua sanitizada no frontend. A API pública só projeta listas publicadas e não expõe reviewerId, payload privado ou metadados de aprovação. Posts editoriais usam `Article` no frontend. A seleção pública possui `ItemList` e CTAs por jogo.

Conflitos simultâneos podem retornar 409; o editor recarrega a revisão e tenta novamente. Nenhuma falha parcial de transação pode publicar lista/itens incompletos. Validação dessa atomicidade em Appwrite real é uma etapa de homologação obrigatória.

## Conversões e convites

`POST social/entries/ensure { gameId, requestId }` exige sessão. O servidor resolve o perfil, valida o catálogo e serializa inclusões concorrentes por pessoa em `app_logs`. Um recibo vincula o requestId ao jogo. Retries retornam sucesso sem regravar; chave reutilizada em outro jogo é rejeitada. Status existente nunca é trocado. O log de escrita, outbox e marco de primeiro jogo são transacionais.

O retorno `firstGameSaved` só é verdadeiro no commit que cria o primeiro status da biblioteca para a pessoa; histórico/projeção legada evita tratar conta antiga como recém-ativada. Marcadores ficam em `app_logs`, privado no schema atual. Não há backfill nem dados reais alterados. O campo é aditivo na escrita de entradas legada.

Cadastro tem recibos `registration_pending` e `registration_complete`. Perfil e pendência são criados juntos. Bônus de boas-vindas usa ID determinístico na transação de saldo; recompensa de convite e confirmação de aceite são persistidas juntas. Retry retoma a pendência sem pagar de novo. Convite inválido/self/de conta em exclusão é rejeitado antes de criar o perfil. Se for removido após validação e antes do aceite, o cadastro conclui sem atribuição de convite. Se já tiver sido aceito, o recibo preserva a atribuição mesmo após remoção. Contas legadas nunca viram novos cadastros. O frontend só recebe `registration: { created, inviteAccepted }`; os códigos e IDs pessoais ficam fora dos eventos GA.

Não existe garantia de entrega exatamente uma vez em GA: recibo perdido na rede, bloqueadores ou Firebase ausente podem subcontar. Nenhum evento GA é emitido pela API; isso evita duplicação frontend/API. Recebimento no DebugView deve ser verificado em ambiente de teste, sem alterar propriedades de produção.

## Fórum

SSR, canonical, sanitização, `DiscussionForumPosting` e sitemap já existiam. O frontend acrescenta navegação rastreável de feed e respostas e status 404/503 corretos. A API de fórum agora declara `private, no-store`, impedindo cache compartilhado de respostas com estado de voto. Sitemap expira em cinco minutos e inclui listas editoriais aprovadas. A tabela privada ainda não provisionada é tratada como recurso editorial indisponível no sitemap, sem derrubar notícias/jogos/fórum.

A exclusão física/cascata de comentários e as restrições de escrita continuam no serviço social. O schema atual não possui discussões privadas. Uma futura modalidade privada requer política única de elegibilidade em leitura, sitemap e caches antes da exposição. Não se declarou conteúdo indexado no Google.
