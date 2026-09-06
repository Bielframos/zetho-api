# Game endpoints

## `POST /games/:gameId/ai-briefing`

Gera, para uma sessão autenticada, um briefing em português usando os dados já
catalogados do jogo. A resposta tem `overview`, `highlights`, `bestFor` e
`contentWarning`.

O identificador é validado antes da consulta. Jogo inexistente retorna `404`;
indisponibilidade do provedor ou resposta fora do contrato retorna `502`.
O serviço usa o modelo configurado no provedor OpenAI do `AiModule`, portanto
requer `OPENAI_KEY` no ambiente de execução.
