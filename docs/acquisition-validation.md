# Validação de aquisição e ativação

Complementa [o contrato e a homologação](editorial-lists.md). PRs: [API #51](https://github.com/Bielframos/zetho-api/pull/51) e [frontend #150](https://github.com/Bielframos/zetho/pull/150).

## ESLint: origem dos diagnósticos

Comparação somente leitura com a base `abc0e027cedc2de902ebdb567697b0cd7e032f49`, usando a mesma configuração e dependências. Escopo: todos os arquivos TypeScript tocados pelo PR. A versão da base foi passada a `eslint --stdin --stdin-filename <arquivo> --format=json`; a versão final foi verificada com `eslint --format=json <arquivos>`. Diagnósticos remanescentes foram associados à mesma regra, mensagem e linha de código da base, usando o mapeamento de linhas do diff.

| Arquivo | Base: erros / avisos | Final: erros / avisos |
| --- | ---: | ---: |
| `gazetho.service.ts` | 67 / 21 | 67 / 20 |
| `profile.service.ts` | 3 / 0 | 3 / 0 |
| `forum.controller.ts` | 6 / 0 | 6 / 0 |
| `social.controller.ts` | 17 / 13 | 17 / 13 |
| `social.dto.ts` | 9 / 0 | 9 / 0 |
| `social.service.ts` | 243 / 19 | 232 / 18 |
| `sitemap.service.ts` | 4 / 1 | 3 / 1 |
| Demais arquivos tocados e arquivos novos | 0 / 0 | 0 / 0 |
| **Total** | **349 / 54** | **337 / 52** |

Nenhum diagnóstico remanescente está em código novo. Os erros introduzidos foram corrigidos tipando recibos, respostas de cadastro/inclusão, autoria editorial, argumentos HTTP e mocks. Não foram desabilitadas regras. Os diagnósticos herdados são majoritariamente uso inseguro de `any`, além de imports não usados e padrões legados; não foi feita uma refatoração geral. O comando amplo ainda retorna falha e não deve ser apresentado como lint verde. O frontend não possui script/configuração de ESLint.

## Checks

Após as correções: API 401 testes em 76 suítes, tooling 2 testes, `tsc --noEmit` e build NestJS aprovados. Os 13 testes focados de cadastro, inclusão e revisão editorial também passaram. Frontend permanece no head `e0c2b154f76a674195d3e8c8b0d45f63edd27a32`: 220 testes, tooling, build e 9 verificações HTTP/SSR já passaram; esta revisão não altera seu código.

Gitleaks é executado pelo workflow existente `.github/workflows/security.yml`: versão 8.30.1, download com checksum e `scripts/check-secrets.sh`. Os scans dos heads iniciais passaram no GitHub Actions. O executável não estava disponível localmente e nenhum software foi instalado. Os resultados dos checks do head final estão registrados no PR.

O GitHub registrou um deploy automático Vercel do frontend como `environment=Preview` e `production_environment=false` (deployment 7441346444). Nenhuma promoção para produção foi solicitada. Não houve merge, provisionamento Appwrite ou alteração de GA/GSC.

## Homologação pendente

Em uma instância de teste autorizada, provisionar a tabela privada conforme o dry-run; verificar índices/permissões, transações concorrentes, retries de cadastro/convite, inclusão de biblioteca, revisão/publicação/retirada editorial e acesso anônimo. Os testes com mocks não comprovam atomicidade no Appwrite real.

Validar consentimento/coleta e os eventos no GA DebugView de uma propriedade de teste, incluindo origem do CTA, cadastro por convite e primeira inclusão. Bloqueadores ou perda de resposta podem subcontar eventos; não há promessa de entrega exatamente uma vez ao GA. Nenhuma propriedade foi configurada por esta tarefa.
