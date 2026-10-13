# Zetho API — instruções para agentes

Backend NestJS do Zetho: biblioteca, avaliações, perfis, comunidade, jogatinas e rankings. Appwrite fornece autenticação, tabelas e arquivos; Redis coordena caches e tarefas. IA e integrações de catálogo/editoriais são opcionais.

## Começar e verificar

Execute os comandos na raiz deste repositório. Use o Node de `.node-version` e o pnpm de `package.json`; mantenha `pnpm-lock.yaml` como lockfile do backend.

| Objetivo | Comando |
| --- | --- |
| Instalar dependências | `pnpm install --frozen-lockfile` |
| Desenvolvimento | `pnpm start:dev` |
| Testes de configuração e seed | `pnpm test:tooling` |
| Testes Jest com mocks | `pnpm test:ci` |
| Teste focado, exemplo | `pnpm exec jest --runInBand src/modules/game/game.service.spec.ts` |
| Tipos, incluindo testes | `pnpm exec tsc --noEmit` |
| Compilar NestJS | `pnpm build` |
| Segredos nos arquivos atuais | `pnpm secrets:check` (requer Gitleaks; aceita `GITLEAKS_BIN`) |

- Siga [README.md](README.md) para configurar Redis e um projeto Appwrite próprio. Crie `.env` a partir de `.env.example` apenas se ainda não existir; não substitua credenciais locais.
- `docker compose up -d` inicia somente Redis. O schema e os dados fictícios do Appwrite exigem os passos separados do README.
- `pnpm demo:seed` mostra uma prévia; `--apply` grava dados. Não use scripts de seed, backfill, migração ou deploy como testes contra a instalação oficial.
- `pnpm lint` e `pnpm format` alteram arquivos. Restrinja formatação ao escopo da tarefa e confira o diff; não execute correções globais como se fossem verificações somente leitura.

## Onde alterar

- `src/modules`: endpoints e regras por domínio; mantenha controllers voltados ao contrato HTTP e serviços voltados ao comportamento.
- `src/agents`: recomendação, tradução e curadoria; prompts em `src/infra/ai/prompts`.
- `src/infra/appwrite`: adaptador, tipos e transações; `appwrite.config.json` é o schema de referência.
- `src/infra/events`: outbox e entrega de eventos persistidos.
- `src/common`: guards, validação, resiliência e observabilidade compartilhadas.
- `src/system`: dashboard, timeline, saúde e sitemap.
- `scripts`: provisionamento e manutenção; `test`: contratos e integração de módulos com mocks.

## Invariantes de arquitetura

- Extraia responsabilidades por domínio, como consultas, notificações ou reservas. Evite dependências circulares e serviços genéricos que concentrem lógica de vários módulos.
- Ao extrair um serviço, registre o provider no módulo e atualize imports/exports e testes de resolução Nest. Não torne dependências obrigatórias opcionais apenas para facilitar testes.
- Preserve guards, identidade da sessão, autorização por linha e limites das consultas. O cliente administrativo Appwrite não substitui a verificação de permissão do usuário.
- Preserve as fronteiras transacionais de saldo, cota, reserva, reembolso e estado de recomendação. Idempotência e concorrência devem continuar cobertas por testes.
- Preserve eventos e chaves de idempotência do outbox. Não troque entrega persistida por envio direto que possa se perder ou duplicar durante retry.
- Ao mover métodos, confira também `@Cron`, hooks de inicialização, handlers registrados, cache e contexto de logs. Cada rotina agendada/handler deve continuar registrado uma única vez.
- Preserve a separação entre geração por IA, verificação factual e decisão de publicação. Conteúdo reprovado permanece como rascunho, sem evento de publicação; preserve sanitização e atribuição das imagens.
- Integrações sem credenciais devem manter o comportamento opcional documentado. Não introduza chamadas reais de IA, IGDB, email ou WhatsApp em testes unitários.

## Contratos e validação

- Mudanças de schema devem incluir provisionamento, índices/permissões e estratégia de compatibilidade. Gere `appwrite.local.json` para sua instância; não copie usuários ou dados oficiais.
- Mudanças de DTOs, paginação, erros ou autenticação exigem conferir os consumidores no frontend. Não presuma deploy simultâneo dos dois projetos.
- Execute os testes afetados durante a edição. Para mudanças de código destinadas a merge, execute `pnpm test:tooling`, `pnpm test:ci`, `pnpm exec tsc --noEmit` e `pnpm build`.
- Prefira testes de comportamento: acesso negado, retries, rollback, idempotência e disputa entre requisições. Para extrações Nest, confira também a composição real dos módulos com infraestrutura externa simulada.
- Os testes usam mocks e não provam o funcionamento de uma instância Appwrite real. `/health` indica liveness; `/health/ready` verifica disponibilidade do Appwrite. Não confunda essas verificações com validação completa do schema.
- Para mudanças somente em Markdown, confira comandos, caminhos, links locais e `git diff --check`; não é necessário repetir o build. Relate os checks executados e suas limitações.

## Configuração, contribuição e manutenção

- Nunca versione `.env`, credenciais, dumps ou dados de usuários. Não imprima segredos ao inspecionar configuração. Use `.env.example` para documentar novas variáveis.
- URLs de notificações e sitemap devem acompanhar a instância configurada; não reintroduza o domínio oficial como fallback de produção.
- Siga [CONTRIBUTING.md](CONTRIBUTING.md) e [SECURITY.md](SECURITY.md). Preserve a licença [AGPL-3.0-only](LICENSE) e os avisos de terceiros.
- A branch padrão é `master`; confirme o estado remoto antes de operações Git. Preserve trabalho local e de outros agentes, sem reformatações ou alterações alheias à tarefa.
- Mantenha estas instruções alinhadas aos scripts e à arquitetura. Use instruções locais para detalhes de um módulo, evitando repetir regras. `CLAUDE.md` importa este arquivo e não deve manter uma cópia independente.
