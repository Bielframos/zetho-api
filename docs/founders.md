# Edição Fundador e autorização de divulgação

A edição tem 1.001 reservas: Zero é #0000; os primeiros mil outros usuários são #0001–#1000, ordenados pela criação da **conta Appwrite**, com desempate por `$id`. Contas sem perfil também ocupam uma posição. O número fica na conta, independentemente da gamertag, da vitrine, de autorização de divulgação ou da exclusão posterior da conta. Números não são reciclados em exclusões normais. A reserva acompanha a criação da conta, mas a insígnia e o número só são concedidos/exibidos para contas ativas com e-mail confirmado; confirmar depois não altera a posição reservada.

## Ativação e migração

Use o ambiente Appwrite correto, com escopos de leitura de usuários e escrita de tabelas/transações. Não use seed nem cópias dos dados oficiais como testes.

1. `pnpm founders:provision` mostra as quatro tabelas novas, sem gravações.
2. `pnpm founders:provision --apply` adiciona tabelas, colunas e índices. Aguarda disponibilidade e recusa permissões públicas. Não altera as tabelas atuais.
3. `pnpm founders:backfill` procura o perfil Zero e mostra o ID de sua conta, a ordem histórica dos demais usuários e seus números, sem gravar. Confira esse ID antes de inicializar a edição. A prévia inicial não substitui reservas já persistidas.
4. `pnpm founders:backfill --apply --zero-user-id=<ID conferido>` fixa #0000 e preenche as reservas históricas. A inicialização é transacional; não se pode trocar #0000 por outro usuário. A sincronização retoma do checkpoint em reexecuções.
5. Publique a API e depois o frontend. Provisione o schema antes da API: a criação de perfil agora registra a autorização nas novas tabelas.

Após a ativação, o cron a cada minuto e a criação de perfil chamam o mesmo sincronizador. Uma margem de dois segundos evita fechar um grupo de contas com timestamps iguais enquanto ainda está sendo criado. Pode haver até aproximadamente um minuto de espera na identificação de uma conta nova. A apresentação compartilha um diretório público em memória por sessão de aplicação, atualizado na próxima consulta após 60 segundos, sem uma requisição por avatar. A API compartilha o diretório público em cache por 30 segundos.

A primeira ativação depende do histórico de contas ainda existente no Appwrite. Contas excluídas antes da ativação não podem ser reconstruídas apenas a partir dessa fonte. Após a ativação, as reservas sobrevivem à exclusão. Importações administrativas com datas retroativas não renumeram a edição: precisam de análise específica antes de serem feitas.

A imagem exibida vem do Storage Appwrite: bucket `badges`, arquivo `founder-badge`. Como o bucket é privado, a API serve exclusivamente essa mídia em `GET /achievements/founder-badge/image`, com cache público de um dia. As permissões do bucket permanecem privadas. Em caso de falha no carregamento, a interface preserva o número e mostra um ícone de reserva.

## Confirmação de e-mail e reconhecimento

`/verificacao` é uma rota pública que consome o link Appwrite apenas no navegador. A validade do token é conferida pelo Appwrite, sem depender do relógio do dispositivo. Após a confirmação, os parâmetros sensíveis saem da URL. Se a sessão corresponde à conta confirmada, ela é atualizada e segue para `/fundador`. Em outro dispositivo, a confirmação funciona sem sessão e a pessoa entra com a conta confirmada para ver seu reconhecimento. O login aceita somente o sinalizador `founder=1` para voltar a essa tela; não aceita um redirecionamento externo.

A tela `/fundador` exige uma requisição autenticada para consultar a própria insígnia e trata e-mail pendente, processamento, edição encerrada e falha de rede. A API consulta a conta diretamente no Appwrite para não depender de um JWT guardado antes da confirmação. A insígnia não depende da autorização de divulgação.

O e-mail usa o mesmo renderer dos outros e-mails transacionais. `pnpm email:sync-templates` mostra a prévia; `pnpm email:sync-templates --template=verification --apply` atualiza somente o template de confirmação nos locales `pt`, `pt-br` e `en`, preservando `{{user}}` e `{{redirect}}`. Requer uma sessão administrativa válida na CLI Appwrite para o projeto definido em `APPWRITE_PROJECT`. Nenhum e-mail é enviado pela sincronização. Para recuperação de senha, use `--template=recovery`; para ambos, `--template=all`.

## Correção administrativa de contas duplicadas

`scripts/repair-founder-accounts.ts --remove-user-id=<ID>` aceita IDs explícitos e mostra uma prévia sem gravações. Com `--apply`, pausa a reserva automática, exclui as contas indicadas e, em uma transação, remove seus perfis/reservas, fecha os espaços da sequência e atualiza o checkpoint. A operação é excepcional e limitada a uma edição pequena para respeitar o limite transacional. Zero é protegido. A prévia rejeita um plano que aumentaria números de contas existentes. Em caso de falha, as reservas ficam pausadas até a retomada com os mesmos IDs; 404 é aceito apenas para os alvos explícitos já excluídos. A verificação final exige contas e perfis ausentes, números corretos e nenhuma lacuna.

## Contratos

- `GET /achievements/me/founder`: autenticado, sem cache, retorna `status` (`awarded`, `verification_required`, `pending` ou `not_eligible`); somente `awarded` contém `number` e `code`. Não aceita um ID de outra conta.
- `GET /achievements/founders`: array de `{ gamertag, number, profileId, avatarUrl }`, ordenado por número (incluindo Zero #0000), dos perfis ativos associados a reservas cujas contas estão ativas e têm e-mail confirmado. `avatarUrl` é `null` quando não há foto. Os campos novos são aditivos para preservar clientes que leem apenas gamertag e número. Não revela contas sem perfil nem autorizações, IDs de conta ou e-mails.
- `GET /achievements/:profileId/badges` e `/badges/catalog`: incluem a conquista `founder` e o campo `number`; #0000 é um número válido. A vitrine aceita `founder`, mas a identificação junto ao nome independe dela. Fundador não concede Z-Coins.
- `POST /profile`: aceita `profileSharingAllowed` booleano, opcional, padrão `false`. Clientes antigos continuam funcionando. Uma repetição do cadastro não substitui uma autorização já registrada.
- `GET /profile/me/profile-sharing` e `PATCH /profile/me/profile-sharing` com `{ "allowed": false }`: leitura e mudança da própria autorização, autenticadas.

As tabelas de autorização e eventos são privadas, sem permissões para clientes Appwrite. Cada alteração registra usuário, escolha, data do servidor, origem e versão `profile-sharing-v1`. O texto autorizado é: divulgar gamertag, foto e link do perfil nas redes do Zetho para valorizar a participação na comunidade; a escolha é opcional, revogável em Minha conta e não condiciona a insígnia. Usuários anteriores não recebem consentimento retroativo. Antes de uma publicação, confira a autorização atual; a reserva de Fundador ou a visibilidade pública do perfil não concedem permissão de divulgação.

Os testes com mocks cobrem regras e rollback simulado, mas não substituem uma validação em uma instância Appwrite própria para queries de usuários, provisionamento assíncrono e conflitos reais de transações.
