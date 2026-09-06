# Briefings de jogo por IA persistidos

- Status: `ready`
- Review mode: `spec-consolidated`

## Objetivo

Fazer com que `POST /games/:gameId/ai-briefing` devolva um briefing persistido
para o jogo e invoque a IA somente na primeira geração ou quando um briefing de
um jogo recente estiver vencido.

## Contexto

- A rota atual é autenticada, busca o jogo por ID e gera um briefing estruturado
  via Genkit/OpenAI em cada chamada (`src/modules/game/game-briefing.service.ts`).
- `games` já contém `releaseDate`, usado pelo módulo Game para identificar
  lançamentos futuros, e possui o ID Appwrite estável do jogo.
- O repositório versiona o schema Appwrite em `appwrite.config.json`; os serviços
  usam `TablesDB` do `node-appwrite`.
- Decisão de produto aprovada: jogo recente = lançamento há no máximo 90 dias;
  briefing de jogo recente vence após 45 dias.

## Requisitos

1. Deve existir um registro persistido único por jogo contendo o briefing,
   data de geração e metadados suficientes para identificar o modelo/prompt.
2. Se não houver briefing para o jogo, a rota deve gerar, persistir e devolver
   o briefing.
3. Para jogo sem `releaseDate` ou lançado há mais de 90 dias, um briefing
   existente nunca deve disparar uma nova chamada de IA automaticamente.
4. Para jogo lançado nos últimos 90 dias, um briefing existente só deve ser
   regenerado quando tiver mais de 45 dias; briefing com exatamente 45 dias
   ainda é válido.
5. O registro deve ser atualizado somente depois que a saída da IA passar pelo
   schema estruturado existente. Falha da IA não pode sobrescrever um briefing
   válido.
6. Chamadas concorrentes para o mesmo jogo não podem produzir mais de uma
   geração persistida para o mesmo estado de ausência/expiração.
7. A resposta deve informar se o conteúdo foi obtido do cache persistido ou
   acabou de ser gerado, sem mudar os campos atuais do briefing.
8. O schema versionado e o ambiente Appwrite devem conter a tabela/índice
   necessários à execução.

## Critérios de aceite

1. Sem registro existente, uma chamada autenticada devolve `201`, chama a IA
   uma vez e cria o registro. Prova: teste unitário com `createRow` e mock da IA.
2. Com registro válido, a chamada não aciona a IA nem escreve no banco e devolve
   o briefing persistido. Prova: teste unitário com briefing recente armazenado.
3. Com jogo lançado há 91 dias e registro com mais de 45 dias, a chamada ainda
   reutiliza o registro. Prova: teste unitário de fronteira temporal.
4. Com jogo lançado há 90 dias e briefing gerado há mais de 45 dias, a chamada
   aciona a IA e substitui o registro apenas após saída válida. Prova: teste
   unitário e inspeção de `updateRow`.
5. Com jogo lançado há 90 dias e briefing gerado há exatamente 45 dias, a rota
   reutiliza o registro. Prova: teste unitário de fronteira.
6. Falha do provedor ou saída inválida retorna erro compatível com o contrato
   atual e preserva o briefing persistido anterior. Prova: teste unitário.
7. `pnpm test -- game-briefing.service.spec.ts --runInBand`, `pnpm build` e
   `git diff --check` terminam com sucesso. Resultado reprovador: qualquer
   falha, erro de tipos ou whitespace inválido.

## Contrato de interface

`POST /games/:gameId/ai-briefing` continua autenticado. A resposta preserva
`overview`, `highlights`, `bestFor` e `contentWarning`, e acrescenta:

```json
{ "generatedAt": "ISO-8601", "source": "generated | stored" }
```

## Tarefas

1. Versionar e aplicar o schema Appwrite para o briefing único por jogo, com
   índice/garantia de unicidade e tipagem local. Pronto: schema e ambiente
   aceitam escrita e leitura do registro.
2. Implementar a política temporal, leitura/escrita persistente e proteção
   contra geração concorrente no serviço. Depende da tarefa 1. Pronto: todos os
   requisitos 1–6 têm testes unitários.
3. Atualizar contrato/documentação, executar gates de delivery e fazer a
   chamada de demonstração. Depende da tarefa 2. Pronto: critério 7 e resposta
   real registrados.

## Gates e handoff

- `task`: testes focados da tarefa e validação do schema Appwrite.
- `delivery`: teste focado, build, `git diff --check` e uma chamada autenticada
  no ambiente configurado.
- `review`: inspeção independente do diff contra todos os critérios acima.

Risco conhecido: o catálogo pode não ter `releaseDate`; nesse caso o requisito
3 manda reutilizar o briefing existente indefinidamente, evitando custo e
regeneração especulativa.
