# CHANGELOG

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

Seguindo o formato "Keep a Changelog" e o versionamento semântico.

## [Unreleased]

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
