# Catálogo de plataformas da jogatina

O select lê `app.game_platforms`, com paginação por cursor e busca local por nome/sigla/slug. Registros usam `playedPlatformId` (ID do catálogo); `playedPlatform` permanece para compatibilidade com os registros antigos, sem backfill obrigatório.

## Schema

Adicionar `playedPlatformId`, string opcional de 36 caracteres, em `z_entries` e `z_entries_read`. Não converter/remover o enum antigo.

- Conferência: `node scripts/provision-platform-catalog.cjs`
- Aplicação: `node scripts/provision-platform-catalog.cjs --apply --backup=/caminho/novo-backup.json`

O script verifica colunas existentes, índices e permissões contra o config antes das duas adições. Não faz push geral, nem altera registros ou colunas existentes.

Aplicado em 22/09/2026; schema disponível nas duas tabelas. Backup operacional: `.ops-backups/platform-catalog-schema-before-20260922.json` na raiz do workspace.

## Publicação

Publicar a API e todos os consumidores da outbox antes do front. A versão anterior da projeção não copia `playedPlatformId` para o modelo de leitura. Em desenvolvimento, o Appwrite compartilhado com produção continua sujeito aos consumidores da versão antiga até a atualização da API de produção.

## Validação

Testes cobrem seleção por busca/sigla, teclado, validação do ID do catálogo, manutenção da plataforma ao trocar status, remoção explícita e projeção do ID em `z_entries_read`.
