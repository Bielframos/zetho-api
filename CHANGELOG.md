# CHANGELOG

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

Seguindo o formato "Keep a Changelog" e o versionamento semântico.

## [Unreleased]

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
