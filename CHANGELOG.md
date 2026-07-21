# CHANGELOG

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

Seguindo o formato "Keep a Changelog" e o versionamento semântico.

## [Unreleased]

## [0.1.4] - 2026-07-21

### Added

- Endpoint autenticado `GET /dashboard/connections-list-activity`, retornando jogos adicionados recentemente às listas públicas de quem o usuário segue.
- Endpoint autenticado `GET /dashboard/suggested-connections`, sugerindo jogadores com avaliações em jogos em comum.
- Endpoint público `GET /profile/invite/:code`, retornando o mini-perfil de quem é dono de um código de convite.

### Changed

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
