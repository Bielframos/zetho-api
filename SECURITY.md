# Segurança

As correções são destinadas à versão mais recente da branch padrão. Versões antigas não têm manutenção de segurança garantida.

## Relatar uma vulnerabilidade

Use [Report a vulnerability](https://github.com/Bielframos/zetho-api/security/advisories/new) quando o relato privado estiver habilitado. Se não estiver disponível, procure os canais de contato do [mantenedor](https://github.com/Bielframos) para combinar uma comunicação privada. Não publique tokens, dados pessoais ou detalhes de exploração em issues abertas.

Inclua o commit afetado, os passos mínimos de reprodução, o impacto e, se possível, uma correção. Use dados fictícios. Não há prazo de resposta ou programa de recompensa garantido.

## Credenciais e configuração

Arquivos `.env` e configuração local gerada não são versionados. Valores `PUBLIC_*` do frontend são públicos: nunca coloque neles chaves de servidor. Chaves Appwrite com privilégios, IA e tokens de integração pertencem apenas à API.

`pnpm secrets:check` usa Gitleaks para examinar os arquivos atuais rastreados e novos não ignorados. `bash scripts/check-secrets.sh --history` examina o histórico Git disponível. A CI verifica o conteúdo atual; um resultado limpo não apaga exposições históricas. Se uma credencial real vazar, revogue-a antes de discutir remoção do histórico.

Não use a base oficial do Zetho para desenvolvimento. O código aberto não inclui dados de usuários nem acesso à infraestrutura hospedada.
