# CHANGELOG

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

Seguindo o formato "Keep a Changelog" e o versionamento semântico.

## [Unreleased]

### Fixed

- A troca de e-mail preserva o perfil e permite entrar novamente, sem repetir bônus de cadastro.

### Added

- Inclusão idempotente de jogos por CTA e marcos persistidos de primeiro jogo e conclusão de cadastro/convite.
- Retomada de cadastro parcial com bônus e atribuição protegidos contra repetição.
- Rascunhos editoriais privados via MCP, aprovação administrativa, listas oficiais e conversão revisável em posts.
- Provisionamento de estados e permissões nas listas existentes, com importação retomável dos rascunhos anteriores.

### Changed

- Listas pessoais e oficiais usam `lists`/`list_items`, com estados de rascunho, publicada e arquivada; a revisão preserva IDs e vínculos sociais.

- Respostas de fórum não usam cache compartilhado; sitemap inclui listas editoriais e expira em cinco minutos.

## [0.15.0] - 2026-10-22

### Added

- Fórum da comunidade (`/social/forum/posts`, `/social/forum/posts/:id`) com criação de publicações em rich text vinculadas a qualquer jogo, ordenação por recentes ou mais votados, filtro por jogo, exclusão pelo autor e árvore de respostas até 3 níveis.
- Sanitização de HTML rich text no servidor para publicações e respostas do fórum e comentários de jogos.
- Inclusão das páginas públicas `/forum` e `/forum/:id-:slug` no `sitemap.xml` com roteamento de notificações para discussões do fórum.
- Script de migração aditiva (`appwrite:provision-forum`) para provisionar `title`, `slug` e expandir `content` na tabela `game_comments`.

## [0.14.2] - 2026-10-13

### Changed

- Preparação para distribuição sob AGPL-3.0-only, com configuração de instância, contribuição, segurança e validação contínua.
- Responsabilidades de catálogo, dashboard, sessões, editor, recomendador e webhooks separadas em serviços específicos, preservando permissões, transações e agendamentos.

### Fixed

- Integrações opcionais sem credenciais deixam de impedir a inicialização; URLs de notificações e sitemap acompanham a instância configurada.

## [0.14.1] - 2026-10-11

### Fixed

- Curadoria distingue eventos novos do mesmo jogo, rejeita formatos explícitos de guias e podcasts e considera mudanças oficiais de disponibilidade.
- Notícias geradas com preços ou promoções são retidas como rascunhos, mesmo com aprovação factual, sem notificações de publicação.
- Redação e verificação preservam cronologia, atribuições e limites das fontes, sem exigir tradução literal nem conclusões especulativas.

### Changed

- Avaliação editorial real concluída com 60 casos, revisão independente das fontes e rascunhos, replay dos filtros finais e confirmação dos casos afetados. Limites e falsos positivos/negativos estão documentados; imagens automáticas permanecem desativadas.
- Runner registra contexto, falhas por etapa e aprovação factual separada da aprovação editorial; falhas de credencial interrompem a execução com mensagem redigida.

## [0.14.0] - 2026-10-11

### Added

- Comparação autenticada entre jogadores, com jogos em comum, diferenças entre notas e descobertas paginadas; consultas usam a sessão do visitante e respeitam permissões em linhas e contagens.
- Classificação editorial e verificação factual separadas para notícias automáticas, sugestões humanas e URLs, com motivos de rejeição registrados.
- Experimento documentado com 60 matérias e 16 imagens reais; publicação de imagens depende de aprovação específica e permanece desativada. A comparação real antes/depois dos modelos ainda aguarda credencial de avaliação.

### Changed

- Próximo jogo custa 5 Zcoins por recomendação concluída e permite 5 usos diários no fuso America/Sao_Paulo, incluindo reservas pendentes e usos anteriores à implantação.
- Cota, usos restantes e próxima liberação acompanham respostas e histórico de recomendações.
- Curadoria prioriza anúncios e novidades concretas de jogos; exclui preços, promoções, mercado e reviews, preservando fonte, região e fatos verificáveis. Artigos sem verificação positiva permanecem em rascunho.

### Removed

- Operações de leitura e escrita de Meta do ano retiradas após o frontend 1.31.0. Endpoints legados retornam 410 para clientes em cache; dados históricos, conclusões e conquistas são preservados.

### Fixed

- Reservas de Zcoins e cota usam slots únicos e transações; falhas e reservas abandonadas liberam cota e estornam o valor histórico, com proteção contra conclusão concorrente.
- Downloads editoriais restringem destinos públicos HTTPS, redirecionamentos, tempo, tamanho e formato; HTML gerado é sanitizado.
- Endpoint de release informa a versão 0.14.0.

## [0.13.0] - 2026-09-22

### Added

- Endpoint público de biblioteca do perfil, com agrupamento por lançamento ou A–Z, ordenação antes da paginação e recentes como padrão.
- Suporte ao ID do catálogo de plataformas nos registros, com validação e projeção no modelo de leitura.
- Data estável de mudança de status no modelo de leitura, com provisionamento aditivo e recuperação histórica transacional.

### Changed

- A reconciliação mantém a data da última transição efetiva, sem alterá-la por curtidas ou edições.
- Endpoint de readiness informa a versão 0.13.0.

### Fixed

- Paginação dos perfis considera toda a biblioteca antes de ordenar e separa anos desconhecidos e iniciais numéricas/símbolos.

## [0.12.1] - 2026-09-22

### Fixed

- Redução do consumo de memória no build e inicialização usando o código compilado, sem recompilar no startup.

## [0.12.0] - 2026-09-21

### Added

- Timeline social persistida por usuário, com paginação por cursor, cache Redis de 45 segundos e migração do histórico.
- Registro de plataforma, tipo de conclusão e horas jogadas, com média comunitária de tempo para zerar por jogo.
- Metas anuais, três Z-Badges desbloqueáveis, recompensas únicas em Z-Coins e API para selecionar medalhas exibidas no perfil.

### Changed

- O feed das conexões deixa de combinar janelas de até 100 registros por fonte a cada requisição.
- Registros de jogos, comentários, listas, conexões e perfis passam pela API, que processa o histórico e as notificações sem depender de webhooks do Appwrite.
- Provisionamento aditivo do schema Appwrite com verificação do remoto e backfills com dry run por padrão.

## [0.11.0] - 2026-09-18

### Added

- Servidor MCP (Model Context Protocol) integrado (`McpModule`) com suporte dual a transporte Stdio (CLI local) e HTTP/SSE (clientes remotos e agentes de IA).
- Ferramenta MCP `register_igdb_game` para busca, pré-visualização e ingestão automática de jogos diretamente do catálogo IGDB.
- Ferramenta MCP `register_manual_game` para cadastro de jogos autorais e títulos independentes não listados no IGDB, com alocação determinística de identificadores negativos (`externalReference`), indexação e inicialização de contadores `zStats`.
- Serviço de domínio `ManualGameService` com cadastro automatizado e resolução de identificadores de desenvolvedoras e publicadoras na tabela `companies`.
- Utilitário `slugify` para normalização e geração de slugs seguros para URLs.
- Endpoints remotos `/mcp/sse`, `/mcp/messages` e `/mcp/tools` protegidos por autenticação com API Key (`MCP_API_KEY` ou `SYSTEM_API_KEY`).
- Entrypoint Stdio em `src/mcp.ts` com isolamento estrito de logs em stderr para comunicação JSON-RPC íntegra via stdout, adicionando os scripts `pnpm mcp` e `pnpm mcp:prod`.

## [0.10.0] - 2026-09-14

### Added

- Módulo dedicado de ranking (`RankingModule`) com endpoints `/ranking/zcoins/weekly` e `/ranking/connections/completed-games`.
- Endpoint autenticado `/ranking/connections/completed-games` com ordenação por quantidade de jogos zerados entre conexões mútuas do usuário logado.
- Cache unificado do placar Top 100 de Z-Coins em Redis (`ranking:zcoins:weekly:v2`) com TTL de 15 minutos e controle de concorrência.
- Rotina cron em background a cada 10 minutos (`*/10 * * * *`) para pré-aquecer o cache do ranking semanal de Z-Coins.

### Changed

- `ZCoinsController.weeklyLeaderboard` passa a delegar para `RankingService`, mantendo compatibilidade com clientes existentes.

### Performance

- Eliminação de N+1 queries na hidratação dos perfis de usuários do ranking através de busca única em batch por IDs (`Query.equal('$id', userIds)`).

## [0.9.0] - 2026-09-12

### Added

- Endpoint público `GET /games/companies?q` para sugestões de empresas no filtro de desenvolvedora da busca.
- Busca por trecho do nome, com até 20 resultados contendo identificador, nome e slug, e validação da consulta.
- Documentação do contrato e testes para sugestões iniciais, consulta normalizada e falhas de acesso aos dados.

## [0.8.0] - 2026-09-10

### Added

- Fluxo de ingestão de jogos em três etapas: registro básico pelo webhook, enriquecimento assíncrono para descoberta e ingestão completa ao abrir o jogo.
- Fila durável `game_search_jobs`, com reserva, retentativas, recuperação de lease e atualizações atômicas entre o índice e o job.
- Busca por siglas, títulos alternativos e prefixos, cobrindo consultas como `fear`, `gta`, `gow` e `tlou`.
- Filtros de busca por desenvolvedora e publisher, usando os identificadores de empresa da IGDB.
- Ferramentas de schema, backfill e auditoria para preencher e conferir o índice de busca sem reexecutar a ingestão completa.
- Template e script para sincronizar o e-mail de recuperação de senha.

### Changed

- A busca de jogos passa a ser somente leitura no catálogo local; capas, aliases, empresas, gêneros e datas são preparados pelo worker assíncrono.
- A abertura de um jogo completa a ingestão mesmo quando o checksum do IGDB é o mesmo de um registro ainda incompleto.
- Atualizado o SDK `node-appwrite` para a versão 29.0.0.

### Fixed

- O webhook da IGDB agora trata referências não expandidas sem limpar dados já enriquecidos.
- O cache distingue leituras com e sem enriquecimento, evitando que dados básicos impeçam a ingestão completa.

## [0.7.0] - 2026-09-09

### Added

- Endpoints autenticados para gerar uma recomendação personalizada de jogo e consultar o histórico paginado do usuário.
- Seleção de candidatos do backlog ou do catálogo, combinando atividade recente, curtidas, avaliações, popularidade, gêneros e jogos similares.
- Persistência privada das recomendações, tentativas e metadados de geração na tabela `game_recommendations`.
- Reserva atômica de 10 zCoins com idempotência, estorno automático em falhas e reconciliação periódica de reservas abandonadas.
- Limite de uma recomendação concluída ou em andamento por usuário a cada dia, considerando o fuso `America/Sao_Paulo`.

### Changed

- O modelo padrão do agente de recomendação passa a ser `openai/gpt-5.4`, com prompt v3 voltado a compatibilidade real de gameplay e justificativas mais naturais.
- O schema Appwrite inclui índices para histórico e backlog, além das restrições únicas de idempotência e limite diário.
- Os tipos Appwrite foram regenerados a partir do schema atualizado e os tipos auxiliares de escrita foram separados dos modelos gerados.

### Fixed

- Ajustados consumidores dos tipos Appwrite regenerados nos módulos de jogatinas, importação da IGDB e webhook.

## [0.6.0] - 2026-09-09

### Added

- Endpoint autenticado `POST /games/:gameId/ai-briefing`, que produz um briefing estruturado em português para um jogo do catálogo.
- Persistência de briefings em `game_ai_briefings`, com rastreabilidade da data, modelo e versão do prompt usados na geração.

### Changed

- Briefings de jogos lançados há mais de 90 dias são reutilizados; jogos recentes só são regenerados após 45 dias.
- O endpoint informa se o briefing foi gerado na chamada ou reutilizado do armazenamento persistente.

### Fixed

- Restaurada a coluna `coverImageUrls` das listas e regenerados os tipos Appwrite derivados do schema sincronizado.
- Recompostos os estados `isHost` de participantes de jogatinas e `read` de notificações após a reconciliação do schema Appwrite.

### Security

- A tabela de posts não permite mais leitura pública direta pelo Appwrite; as notícias públicas continuam servidas pelas rotas da API.

## [0.5.0] - 2026-09-06

### Added

- Endpoint `GET /dashboard/public-lists` para listar listas públicas de jogos dos usuários de forma paginada.
- Endpoint `GET /ratings/feed` para feed paginado de avaliações da comunidade.
- Notificações de comentários ancorados em jogos com hidratação de alvos e contexto.

### Changed

- Reorganização arquitetural das camadas da aplicação:
  - Criação da camada `src/infra/` centralizando os drivers técnicos e persistência (`appwrite`, `events` com outbox e motor de IA com `ai` e prompts).
  - Criação da camada `src/agents/` isolando os trabalhadores e agentes autônomos de aplicação (`editor` editorial de notícias e `translator` de IA) no mesmo plano de domínios.
  - Criação da camada `src/system/` para módulos operacionais e de suporte da plataforma (`health`, `sitemap`, `dashboard`, `sandbox`).
  - Saneamento da camada `src/common/` contendo exclusivamente utilitários transversais agnósticos (`guards`, `interceptors`, `middleware`, `observability`, `pipes`, `integration/retry-policy`), eliminando acoplamento reverso com regras de negócio.
  - O diretório `src/modules/` permanece estritamente dedicado aos domínios e regras de negócio do Zetho.

## [0.4.0] - 2026-08-13

### Added

- A consulta de um jogo passa a informar se a página deve ser indexada pelos buscadores e quantas críticas com texto ela possui, considerando indexável apenas o jogo que já recebeu ao menos uma crítica escrita.
- A consulta de um jogo aceita dispensar o enriquecimento sob demanda, permitindo que a renderização no servidor responda sem aguardar importação externa e tradução por IA.
- O sitemap passa a incluir as páginas institucionais, as notícias publicadas e os jogos indexáveis, com data real de última modificação e cache de uma hora.
- A API pública de notícias passa a expor imagem principal, dados de SEO e a autoria da matéria, sinalizando explicitamente quando a autoria é automatizada.

### Changed

- O agente editorial de IA aplica um piso de qualidade antes de publicar — título e corpo com tamanho mínimo, fonte original presente e slug inédito — e o que não passa fica como rascunho para revisão humana, sem alterar a cadência de publicação.
- Rascunhos retidos pelo piso de qualidade deixam de disparar o compartilhamento no WhatsApp e o e-mail aos inscritos.
- A URL pública do site usada no sitemap passa a vir de variável de ambiente em vez de valor fixo no código.
- A contagem de críticas com texto de um jogo é atualizada assim que uma avaliação é criada, editada ou removida.
- O schema Appwrite inclui índices para as avaliações por jogo e para a ordenação de jogos por número de avaliações.

### Fixed

- As respostas em produção voltam a trazer a liberação de origem para o site: a origem permitida é normalizada, aceita mais de um domínio e a aplicação não sobe em produção sem a variável configurada.
- A listagem de notícias tolera registros com campos malformados, evitando que uma única matéria inválida derrube a resposta.

### Removed

- Frequência de alteração e prioridade do sitemap, ignoradas pelos buscadores.

### Security

- Removida a permissão de criação sem autenticação nas tabelas de perfis de usuário e de transações de Z-Coins.
- O histórico de transações de Z-Coins deixa de ser publicamente legível.
- Removidas as permissões de escrita nos temas de perfil, que permitiam a qualquer usuário autenticado alterar ou apagar o tema de outro.

## [0.3.0] - 2026-08-12

### Added

- Endpoints públicos para listar notícias publicadas, consultar uma notícia por slug e filtrar matérias relacionadas a um jogo.
- DTO público dedicado, evitando a exposição de imagem principal e campos editoriais internos.
- Cobertura de testes para impedir que imagens e rascunhos sejam retornados pela API pública.

### Changed

- O editor de IA agora publica matérias sem gerar ou selecionar imagem principal.
- Notificações, e-mails e sitemap passam a direcionar as matérias para a seção de notícias do Zetho.
- A coleção de posts deixa de permitir leitura pública direta; o conteúdo público passa a ser servido pela API.
- O sitemap inclui somente matérias publicadas e utiliza as novas URLs do Zetho.

### Removed

- Prompt e integração de seleção de imagens do antigo fluxo editorial do Gazetho.
- Invalidação de cache específica do frontend descontinuado do Gazetho.

## [0.2.1] - 2026-08-05

### Added

- Curtidas e comentários em threads nos registros de status exibidos no feed, com contadores persistidos e notificações para o autor.
- Escopo `mine` no feed do dashboard para que o usuário acompanhe seus próprios registros e as interações recebidas.

### Changed

- O contrato dos registros do feed agora informa contagens de curtidas e comentários e se o usuário autenticado já curtiu o registro.
- O schema Appwrite inclui as tabelas de curtidas e comentários de registros e os respectivos índices de consulta e unicidade.

### Fixed

- A atualização de registros de gameplay preserva os contadores sociais existentes.

## [0.2.0] - 2026-07-29

### Added

- APIs autenticadas para criar, listar, consultar, responder e cancelar jogatinas públicas, privadas e por convite.
- Notificações internas persistentes para convites, confirmações, recusas e cancelamentos, com leitura e exclusão pelo próprio destinatário.
- E-mails transacionais de convite, confirmação e cancelamento de jogatinas.
- Script de manutenção para deduplicar participantes antes da ativação da restrição única no Appwrite.

### Changed

- As tabelas de jogatinas, participantes e notificações internas agora são acessadas exclusivamente pela API, com índices para os principais filtros e limites alinhados aos DTOs.
- A criação da jogatina e do anfitrião participante é atômica por transação do Appwrite.

### Fixed

- O build de produção agora compila somente `src`, mantendo `main.js` e `app.module.js` diretamente em `dist` mesmo com scripts TypeScript fora da aplicação.
- O acesso a jogatinas privadas não aceita relações encerradas e as datas de criação precisam estar no futuro.

## [0.1.4] - 2026-07-21

### Added

- Endpoint autenticado `GET /dashboard/suggested-connections`, sugerindo jogadores com avaliações em jogos em comum.
- Endpoint público `GET /profile/invite/:code`, retornando o mini-perfil de quem é dono de um código de convite.

### Changed

- O feed do dashboard (`GET /dashboard/feed`) agora é um fluxo social unificado: além de reviews, comentários e listas, inclui os registros de status dos seguidos (marcos `completed`/`backlog`/`playing`/`dropped`, deduplicados por jogo para o mais recente) e as adições de jogos às listas públicas deles.
- Aplicar um código de convite agora cria conexão mútua: convidado e convidante passam a se seguir automaticamente.

## [0.1.2] - 2026-07-08

### Added

- O feed do dashboard agora retorna o comentário pai direto para respostas.
- Adicionado endpoint autenticado para upvote e downvote em comentários pelo feed.
- O e-mail de notificação de matéria do Gazetho agora inclui a imagem da matéria, alinhando o corpo do e-mail ao conteúdo enviado no WhatsApp (imagem, título e descrição).

### Fixed

- Corrigida a contagem de votos de comentários para respeitar pontuação mínima zero.
- Corrigida a resolução do nickname do autor no contexto de respostas do feed.
- A notificação por e-mail de resposta a comentário agora informa em qual jogo o comentário foi feito e o CTA leva direto para a página do jogo.
- O webhook de comentários agora processa apenas eventos de criação, ignorando eventos de atualização e exclusão.
- Corrigido o envio duplicado de mensagens no WhatsApp para o mesmo post, causado pelo reprocessamento de eventos no outbox.
