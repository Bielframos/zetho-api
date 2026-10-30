# Listas do sistema e publicação

As listas oficiais expandem `lists` e `list_items`. `ownerType=user|system` identifica a origem, `status=draft|published|archived` define o estado e `isPublic` continua sendo a visibilidade. Listas pessoais existentes ficam `user/published`; listas do sistema usam a identidade reservada `system:zetho`. Publicar, arquivar ou voltar para rascunho preserva a lista, os itens, URLs e vínculos sociais.

## Fluxo

Em `/listas`, administradores criam uma lista pelo diálogo existente e selecionam “Lista oficial do Zetho”. A mesma página de detalhe `/listas/:slug` oferece edição de título, descrição, jogos e ordem, além dos critérios, fontes e datas. A publicação exige salvar e conferir a revisão atual. Listas publicadas precisam voltar para rascunho antes de editar; isso retira também o post daquela versão. Arquivadas ficam disponíveis apenas à administração. Os antigos caminhos `/listas-editoriais` redirecionam para `/listas`.

O MCP `submit_editorial_list_draft` e `POST /lists/drafts` (chave de sistema) criam diretamente uma lista em rascunho. Não há nova geração autônoma, cron ou contratação de IA. O material recebido é dado: campos desconhecidos são rejeitados, fontes não são executadas e o servidor não busca suas URLs.

## Permissões e instalação

As tabelas `lists` e `list_items` usam row security e **nenhuma permissão global**. Somente listas públicas publicadas têm `read(any)` na linha; listas pessoais também têm leitura pelo dono. Itens pessoais são legíveis pelo dono; os demais acessos aos itens passam pela API, que verifica o estado e a visibilidade da lista. Rascunhos oficiais são lidos via sessão administrativa na API. Feed, vitrine, salvos, ações sociais e sitemap filtram publicação.

`node scripts/provision-list-lifecycle.cjs` mostra um dry-run offline. `--apply` altera somente a instância configurada e é uma operação de manutenção, nunca um teste na instalação oficial.

1. Faça backup e pause escritas/acesso ao recurso durante a manutenção. Valide primeiro em uma instância própria.
2. Execute `--apply` para criar colunas/índices; aguarde ficarem disponíveis e repita quando solicitado.
3. O script retira permissões globais, importa `editorial_drafts` se existir e atribui permissões por linha. Falhas deixam acesso restrito e permitem retomar. Listas privadas sem conta proprietária exigem correção manual.
4. Publique esta API após concluir a migração e depois o frontend correspondente. A versão antiga do cliente que lê itens públicos diretamente não é compatível com as novas permissões; mantenha o recurso em manutenção até atualizar o frontend e limpar caches antigos. Não reverta para a API anterior após criar rascunhos nas listas.
5. Verifique uma lista pública, uma privada como dono/visitante e um rascunho como admin/visitante antes de reabrir acesso.

A tabela legada fica como backup, sem uso em runtime. Importações preservam IDs e os itens já existentes. Posts legados `ed-*` voltam para rascunho para evitar conteúdo público desatualizado; gere e revise o post da lista importada pelo fluxo atual. Nenhum script foi aplicado automaticamente em produção.

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


## API e concorrência

- `GET /lists/system`: administração, incluindo rascunhos e arquivadas.
- `GET /lists/detail/:slug`, `GET /lists/by-id/:id` e `GET /lists/:id/items`: leitura autorizada, sem cache compartilhado. Ausência de acesso retorna 404.
- `POST /social/lists` aceita `ownerType=system` somente para administrador; CRUD de listas/itens continua no módulo social.
- `PATCH /lists/:id/editorial`: `{revision, content}` salva metadados e jogos, mantendo IDs dos itens existentes.
- `POST /lists/:id/status`: `{status, revision, sourcesVerified}`. Publicação exige rascunho, revisão exata, confirmação explícita e validação de catálogo/fontes/datas.
- `POST /lists/:id/post`: gera um post em rascunho por revisão. `POST /lists/:id/publish-post` exige a revisão pré-visualizada. Textos são escapados; publicação do post é uma ação separada.

Edições e publicação disputam a mesma linha em transação. Mudanças de conteúdo invalidam a revisão; voltar para rascunho também invalida aprovações antigas. Um conflito exige recarregar e revisar novamente. Nenhuma transição recria a lista. A revisão é editorial e humana: datas mensais devem coincidir com o catálogo; seleções temáticas não fazem afirmações de lançamento.


## Conversões e convites

`POST social/entries/ensure { gameId, requestId }` exige sessão. O servidor resolve o perfil, valida o catálogo e serializa inclusões concorrentes por pessoa em `app_logs`. Um recibo vincula o requestId ao jogo. Retries retornam sucesso sem regravar; chave reutilizada em outro jogo é rejeitada. Status existente nunca é trocado. O log de escrita, outbox e marco de primeiro jogo são transacionais.

O retorno `firstGameSaved` só é verdadeiro no commit que cria o primeiro status da biblioteca para a pessoa; histórico/projeção legada evita tratar conta antiga como recém-ativada. Marcadores ficam em `app_logs`, privado no schema atual. Não há backfill nem dados reais alterados. O campo é aditivo na escrita de entradas legada.

Cadastro tem recibos `registration_pending` e `registration_complete`. Perfil e pendência são criados juntos. Bônus de boas-vindas usa ID determinístico na transação de saldo; recompensa de convite e confirmação de aceite são persistidas juntas. Retry retoma a pendência sem pagar de novo. Convite inválido/self/de conta em exclusão é rejeitado antes de criar o perfil. Se for removido após validação e antes do aceite, o cadastro conclui sem atribuição de convite. Se já tiver sido aceito, o recibo preserva a atribuição mesmo após remoção. Contas legadas nunca viram novos cadastros. O frontend só recebe `registration: { created, inviteAccepted }`; os códigos e IDs pessoais ficam fora dos eventos GA.

Não existe garantia de entrega exatamente uma vez em GA: recibo perdido na rede, bloqueadores ou Firebase ausente podem subcontar. Nenhum evento GA é emitido pela API; isso evita duplicação frontend/API. Recebimento no DebugView deve ser verificado em ambiente de teste, sem alterar propriedades de produção.

