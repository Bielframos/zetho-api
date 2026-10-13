# Contribuindo com o Zetho

Obrigado por contribuir. Código, testes, documentação, acessibilidade e traduções são bem-vindos. Issues e PRs podem ser escritas em português ou inglês.

## Começar

1. Leia o [README](README.md) e execute a instalação com seu próprio projeto Appwrite.
2. Para uma mudança pequena, abra uma PR diretamente. Para mudanças de arquitetura, produto ou schema, descreva a proposta em uma issue antes de implementar.
3. Crie um fork e uma branch para a alteração. Nunca use dados, contas ou chaves da instalação oficial em testes.
4. Mantenha a mudança focada e execute `pnpm test:tooling`, `pnpm test:ci` e `pnpm build`.
5. Na PR, explique o problema, a solução e a validação. Identifique mudanças de contrato entre frontend e API.

O mantenedor revisa e decide o merge. Não é necessário receber permissão de escrita para contribuir. Novos mantenedores são convidados conforme o histórico de colaboração; ser autor de uma PR não concede acesso de escrita.

## Convenções

- Preserve a organização por domínio e reaproveite os componentes e serviços existentes.
- Adicione testes para comportamento novo e correções com risco de regressão; não crie testes que apenas reproduzem detalhes da implementação.
- Não inclua reformatações amplas, arquivos gerados, `.env`, snapshots de usuários ou credenciais.
- Alterações de schema precisam de instruções de provisionamento e compatibilidade. Não execute migrações na instalação oficial.
- Documente configuração opcional e forneça mensagens claras quando uma integração estiver desabilitada.

## Primeiras contribuições

Boas tarefas iniciais: reproduzir um bug com teste, melhorar um passo da instalação, corrigir navegação por teclado e documentar contratos de API. Escolha uma tarefa com resultado verificável.

Consulte o [código de conduta](CODE_OF_CONDUCT.md) e a [política de segurança](SECURITY.md).

## Licença das contribuições

As contribuições ao código são recebidas sob a mesma licença do projeto: [AGPL-3.0-only](LICENSE). Ao enviar uma contribuição, confirme que tem o direito de disponibilizá-la nesses termos. Preserve os avisos e licenças de componentes de terceiros.
