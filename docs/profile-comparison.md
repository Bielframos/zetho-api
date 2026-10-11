# Comparação de perfis

`GET /profile/:gamertag/compare` exige Bearer JWT validado pelo guard. Query: `view=common|opinions|discoveries`, `order=similar|different`, `offset>=0`, `limit=1..50` (padrão 20). Retorna identificação pública dos dois jogadores, `total`, `offset`, `limit` e `rows` com jogo, status/notas de cada jogador e diferença absoluta.

Todas as consultas usam um cliente Appwrite criado com o JWT do visitante, sem API key. As ACLs de tabelas e registros são aplicadas pelo Appwrite antes do cruzamento, enriquecimento, contagem e paginação. A resposta tem `Cache-Control: private, no-store`; não utiliza cache compartilhado.

O backend percorre as páginas de 100 registros para cruzar as coleções, escolhe o registro mais recente por jogo (empate por ID), descarta estados inválidos e notas fora da escala 0.5–5, ordena e só então recorta a página. Notas ausentes são `null`. Descobertas excluem qualquer status de biblioteca, incluindo wishlist. Jogos inacessíveis ou removidos não entram no total.

Desempate: título pelo collator pt-BR e ID. Paginação é determinística enquanto os dados não mudam; alterações nas bibliotecas durante a navegação podem mudar os resultados. Não há IA, criação de ranking de afinidade ou débito de Zcoins.

A ação de wishlist permanece no endpoint social existente; esta API é somente leitura. Para publicar a interface, disponibilizar este endpoint antes do frontend de comparação.
