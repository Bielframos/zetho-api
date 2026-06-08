# Spec — Fluxo de geração de post orientado pelo usuário

- **Data:** 2026-06-08
- **Status:** Aprovado (design)
- **Componente:** `EditorService` (agente editor / Gazetho)

## 1. Problema

O agente editor hoje tem **um único** ponto de entrada, totalmente autônomo
([`EditorService.execute`](../../../src/common/ai/agents/editor/editor.service.ts)):

1. `getNews` — coleta notícias dos feeds RSS;
2. `trendAnalysis` — escolhe **um** tópico e devolve `relatedGames` (slugs);
3. `writeArticle` — redige o artigo a partir do conteúdo + lista de jogos;
4. `resolveMainImage` — escolhe a imagem principal;
5. `saveGeneratedPost` → `sharePost` → `invalidateFrontendCache` — publica.

Precisamos de um **segundo ponto de entrada**, orientado pelo usuário: o usuário
fornece uma **URL de contexto** e **instruções para a IA**. A URL passa por um
fluxo de extração de conteúdo (fetch + JSDOM + Readability) e o resultado segue
pela mesma "ponta de trás" (redação → imagem → publicação), gerando o **mesmo
desfecho** do fluxo autônomo: um post publicado.

## 2. Decisões tomadas

- **Jogos relacionados:** a responsabilidade de casar jogos sai do
  `trendAnalysis` e vira uma **tool** (`gameSearchTool`) que o agente de redação
  chama sob demanda, espelhando o `youtubeTool`. Isso unifica os dois fluxos no
  mesmo mecanismo e casa os jogos no momento em que eles são de fato citados no
  texto (mais preciso que casar no analyzer).
- **Saída:** o fluxo guiado **publica igual ao autônomo** (status `PUBLISHED`,
  dispara notificação e invalida o cache do frontend).
- **Instruções do usuário:** estender o prompt `write_article` existente com um
  campo opcional `humanInstructions` (reaproveita 100% das regras de
  formatação/SEO/HTML), em vez de criar um prompt dedicado.

## 3. Tradeoff aceito e mitigação

Extrair o casamento de jogos do `trendAnalysis` **altera o fluxo autônomo**: ele
passa a vincular jogos via tool em vez de pré-busca. O risco é regressão
silenciosa (o agente *pode escolher não chamar* a tool e vincular menos jogos que
antes).

**Mitigação obrigatória:** o prompt `write_article` deve instruir explicitamente
que o agente **deve** usar a `gameSearchTool` para **todo** jogo citado no corpo
do artigo, e conferir o `name`/`slug` retornados antes de usar o `$id`.

## 4. Dependências novas

```
npm i jsdom @mozilla/readability
npm i -D @types/jsdom
```

## 5. Componentes

### 5.1 `ContentExtractorService` (novo)

- **Local:** `src/common/ai/agents/editor/content-extractor.service.ts`,
  registrado em `EditorModule`.
- **API:** `extract(url: string): Promise<{ title: string; text: string }>`.
- **Implementação:**
  1. `fetch(url, { headers: { 'User-Agent': '<browser UA>' } })` — `fetch`
     nativo, **sem axios**;
  2. se `!response.ok`, lança erro com status;
  3. `new JSDOM(html, { url })`;
  4. `new Readability(dom.window.document).parse()`;
  5. se `article` for `null`, lança erro ("não foi possível extrair o conteúdo
     principal");
  6. retorna `{ title: article.title, text: article.textContent.trim() }`.
- O serviço **propaga** erros (não engole com `console.error`); o NestJS trata.

### 5.2 `gameSearchTool` (novo getter em `EditorService`)

- Padrão idêntico ao `youtubeTool`.
- `inputSchema: { query: string }`.
- `outputSchema: array<{ $id: string, name: string, slug: string }>`.
- Implementação: `gameService.search({ q: query, pageSize: 5 })` → mapeia
  resultados para `{ $id, name, slug }`. Retorna `[]` quando não há match.

## 6. Mudanças no fluxo compartilhado (afeta também o autônomo)

### 6.1 `write_article.prompt`

- Remove `games` do `input.schema`.
- Adiciona `humanInstructions?: string` ao `input.schema`.
- Adiciona `gameSearchTool` à lista `tools` (junto de `youtubeTool`).
- Reescreve a seção **GAME MATCHING**: o agente **deve** usar `gameSearchTool`
  para localizar todo jogo citado no corpo, conferir `name`/`slug` e usar os
  `$id` retornados como `relatedGameIds`. Se nada casar, array vazio. Nunca
  inventar jogos.
- Bloco condicional para `humanInstructions`: quando presente, são diretrizes
  editoriais **prioritárias** do usuário (sem violar as regras de
  formatação/HTML/factualidade existentes).

### 6.2 `trend_analysis.prompt`

- Remove `relatedGames` do `output.schema`.
- Remove a FIELD RULE correspondente a `relatedGames`.

### 6.3 `EditorService`

- `writeArticle(post, options?: { humanInstructions?: string })` — assinatura
  passa de `(post, games)`; passa `tools: [this.youtubeTool, this.gameSearchTool]`
  e `{ post, humanInstructions }` ao prompt.
- `resolveMainImage(article)` — assinatura passa de `(article, relatedGames)`.
  Quando `imageStrategy.type === 'game'`, busca o jogo via
  `GameService.findById(article.post.relatedGameIds[0], 'name,slug')` para o
  screenshot; sem id disponível, segue para o caminho genérico/null.
- `execute()` (autônomo) — remove `getRelatedGames`/`relatedGames`; chama
  `writeArticle(post)` e `resolveMainImage(article)`.
- `getRelatedGames` é **removido** (não há mais consumidores).
- Tipo `TrendAnalysis` perde o campo `relatedGames`.

### 6.4 `GameService`

- Adiciona `findById(id: string, select?: string): Promise<Game>` — espelha
  `findBySlug`, consultando a tabela `games` por `$id` (sem enriquecimento
  pesado; usado só para nome/slug do screenshot).

## 7. Novo fluxo guiado

### 7.1 DTO — `GenerateGuidedPostDto` (em `gazetho.dto.ts`)

```ts
url: string;          // @IsUrl(), obrigatório
instructions?: string; // @IsOptional @IsString @MaxLength(2000)
```

### 7.2 Endpoint (em `GazethoController`)

`POST /gazetho/editor/generate-guided-article` — mesmo `SystemApiKeyGuard` e
`ValidationPipe` do controller. Delega para `editorService.generateGuidedArticle`.

### 7.3 `EditorService.generateGuidedArticle({ url, instructions })`

Envolto em `loggerContext.trackLifecycle` (operação `editor.generateGuided`),
como `execute`:

1. `const { title, text } = await contentExtractor.extract(url)`.
2. Monta `post`:
   ```ts
   {
     id: ID.unique(),
     title,
     description: text.slice(0, 500),
     content: text,
     link: url,
     pubDate: new Date().toISOString(),
   }
   ```
3. Guarda de duplicidade: se `await sourceUrlAlreadyPublished(url)` →
   `return { skipped: true, reason: 'Source URL already published: ' + url }`.
4. `const article = await writeArticle(post, { humanInstructions: instructions })`.
5. `article.post.body = postProcessContent(article.post.body)`.
6. `const mainImage = await resolveMainImage(article)`.
7. `const savedPost = await saveGeneratedPost({ article, fallbackMainImage: url, pickedMainImage: mainImage })`.
8. `await notificationsService.sharePost({ ... })` (igual ao autônomo).
9. `invalidateFrontendCache()`.
10. `return { skipped: false, savedPost }`.

## 8. Testes

- **Unit `ContentExtractorService`:** `fetch` mockado retornando HTML de exemplo
  → assert título/texto; Readability devolvendo `null` → erro;
  `response.ok === false` → erro com status.
- **Unit `EditorService.generateGuidedArticle`:** mocks de `contentExtractor`,
  prompt `write_article`, `tablesDB`, `notificationsService`. Verifica:
  - montagem correta do `post` (id/title/content/link/pubDate);
  - repasse de `humanInstructions` ao `writeArticle`;
  - guarda de duplicidade (`sourceUrlAlreadyPublished` → skipped);
  - publicação completa (save + share + invalidate) no caminho feliz.
- **Regressão `gameSearchTool`:** input `{ query }` → `gameService.search`
  chamado e mapeamento `{ $id, name, slug }`.

## 9. Fora de escopo (YAGNI)

- Revisão/rascunho humano antes de publicar (decidido: publica direto).
- Reaproveitar `ContentExtractorService` fora do editor.
- Prompt dedicado para o fluxo guiado.
- Suporte a múltiplas URLs por request.
