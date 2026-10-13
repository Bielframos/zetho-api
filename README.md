# Zetho API

API do Zetho, uma plataforma para registrar sua vida nos jogos e compartilhar com sua comunidade. Implementa biblioteca, avaliações, listas, perfis, conexões, jogatinas e rankings. Recomendações de IA, curadoria editorial e integrações de catálogo são recursos opcionais.

*Zetho's NestJS API powers a gaming journal and community app. Contributions in Portuguese and English are welcome.*

Frontend: [Bielframos/zerei](https://github.com/Bielframos/zerei).

## Começar

Requisitos: Node.js 22.12 ou superior (referência em `.node-version`), pnpm 10.34.5, Redis e um projeto Appwrite com TablesDB e suporte às transações usadas pelo SDK `node-appwrite` 29. Para instalar pnpm: `npm install --global pnpm@10.34.5`.

```bash
git clone https://github.com/Bielframos/zetho-api.git
cd zetho-api
pnpm install --frozen-lockfile
cp .env.example .env
docker compose up -d
```

Edite `.env` com endpoint, ID e chave do **seu próprio projeto Appwrite**. O Compose inicia somente Redis. Instale e autentique a CLI do Appwrite, habilite autenticação por email/senha no seu projeto e registre `localhost` como plataforma Web. Gere a configuração local e confira o projeto de destino antes de importar o schema:

```bash
pnpm appwrite:configure
appwrite push teams --all --config-file appwrite.local.json
appwrite push tables --all --config-file appwrite.local.json
appwrite push buckets --all --config-file appwrite.local.json
pnpm demo:seed
pnpm demo:seed --apply
```

Aguarde a criação de colunas e índices antes do seed. `demo:seed` apenas mostra uma prévia; `--apply` cria os dados fictícios sem substituir linhas existentes. Para um projeto remoto de desenvolvimento, acrescente `--allow-remote`. A configuração local não copia usuários, membros de equipes ou dados da instalação oficial.

Depois, inicie a API:

```bash
pnpm start:dev
```

A API escuta em http://localhost:3000. `GET /health` verifica o processo; `/health/ready` verifica disponibilidade do Appwrite. Uma resposta de liveness não comprova que o schema foi instalado.

## Comandos

```bash
pnpm test:tooling       # ferramentas de configuração e dados fictícios
pnpm test:ci            # testes unitários e de contrato com mocks
pnpm build             # compila NestJS
pnpm start:prod        # inicia dist/main
pnpm appwrite:configure
pnpm demo:seed          # somente prévia, sem gravar
```

`pnpm secrets:check` requer Gitleaks 8.30.1 e examina arquivos atuais rastreados e novos não ignorados. A CI executa essa verificação sem credenciais de produção. Os testes não substituem uma validação ponta a ponta com Appwrite real.

## Arquitetura

- `src/modules`: regras de negócio e endpoints por domínio.
- `src/agents`: recomendação, tradução e curadoria editorial.
- `src/infra`: adaptadores Appwrite, IA e eventos persistidos.
- `src/common`: autenticação, resiliência e observabilidade compartilhadas.
- `src/system`: saúde, timeline e sitemap.
- `scripts`: configuração, dados fictícios e manutenção do schema.
- `appwrite.config.json`: schema de referência. Gere `appwrite.local.json` antes de usar a CLI em outra instância.

Appwrite é responsável por autenticação, tabelas e arquivos; Redis coordena caches e tarefas. Operações de escrita social passam pela API. Não exponha `APPWRITE_API_KEY` ao frontend.

## Contribuir e operar

Leia [CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), [SECURITY.md](SECURITY.md).

A branch padrão atual é `master`. As regras preparadas acompanham a branch padrão, incluindo uma eventual migração para `main`. O arquivo [.github/default-branch.ruleset.json](.github/default-branch.ruleset.json) contém as regras; a proteção depende de ativação no GitHub, conforme o plano do repositório.

## Licença e conteúdo

O código do Zetho é distribuído sob a **GNU Affero General Public License, versão 3 exclusivamente** (`AGPL-3.0-only`). Consulte o texto completo em [LICENSE](LICENSE). Dependências mantêm suas próprias licenças. Catálogos, imagens e outros conteúdos de terceiros não são dados livres distribuídos pelo projeto; veja [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
