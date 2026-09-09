# Game endpoints

## `POST /games/:gameId/ai-briefing`

Gera ou reutiliza um briefing em português usando
os dados catalogados do jogo. A resposta tem `overview`, `highlights`,
`bestFor`, `contentWarning`, `generatedAt` e `source` (`generated` ou `stored`).

O identificador é validado antes da consulta. Jogo inexistente retorna `404`;
indisponibilidade do provedor ou resposta fora do contrato retorna `502`.
O briefing é persistido. Jogos sem lançamento nos últimos 90 dias reutilizam o
registro existente indefinidamente; jogos recentes são regenerados após 45 dias.
O serviço usa o modelo configurado no provedor OpenAI do `AiModule`, portanto
requer `OPENAI_KEY` no ambiente de execução.
