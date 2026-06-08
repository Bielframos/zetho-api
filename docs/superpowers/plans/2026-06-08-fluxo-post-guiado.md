# Fluxo de Geração de Post Orientado pelo Usuário — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um segundo ponto de entrada ao agente editor onde o usuário fornece uma URL de contexto + instruções, o conteúdo é extraído (fetch + JSDOM + Readability) e segue pela mesma redação/imagem/publicação do fluxo autônomo.

**Architecture:** Um novo `ContentExtractorService` extrai o conteúdo principal de uma URL. O casamento de jogos sai do `trendAnalysis` e vira uma tool (`gameSearchTool`) que o agente de `writeArticle` chama sob demanda, unificando os dois fluxos. O prompt `write_article` ganha um campo opcional `humanInstructions`. Um novo método `EditorService.generateGuidedArticle` orquestra o fluxo guiado e publica igual ao autônomo.

**Tech Stack:** NestJS 11, Genkit (OpenAI plugin), node-appwrite, jsdom, @mozilla/readability, Jest + ts-jest.

---

## File Structure

- **Create:** `src/common/ai/agents/editor/content-extractor.service.ts` — extração de conteúdo de URL (fetch nativo + JSDOM + Readability).
- **Create:** `src/common/ai/agents/editor/content-extractor.service.spec.ts` — testes do extrator.
- **Create:** `src/common/ai/agents/editor/editor.service.spec.ts` — testes do `gameSearchTool` e de `generateGuidedArticle`.
- **Modify:** `src/common/ai/agents/editor/editor.module.ts` — registrar `ContentExtractorService`.
- **Modify:** `src/common/ai/agents/editor/editor.service.ts` — `gameSearchTool`, `writeArticle`, `resolveMainImage`, `execute`, `generateGuidedArticle`, remover `getRelatedGames`, ajustar tipo `TrendAnalysis`.
- **Modify:** `src/modules/game/game.service.ts` — adicionar `findById`.
- **Modify:** `src/common/ai/prompts/editor/write_article.prompt` — remover `games`, adicionar `humanInstructions` + `gameSearchTool` + regra de uso obrigatório da tool.
- **Modify:** `src/common/ai/prompts/editor/trend_analysis.prompt` — remover `relatedGames`.
- **Modify:** `src/modules/gazetho/gazetho.dto.ts` — `GenerateGuidedPostDto`.
- **Modify:** `src/modules/gazetho/gazetho.controller.ts` — endpoint `generate-guided-article`.

---

## Task 1: Instalar dependências

**Files:**
- Modify: `package.json` (via npm)

- [ ] **Step 1: Instalar runtime e tipos**

Run:
```bash
npm i jsdom @mozilla/readability && npm i -D @types/jsdom
```
Expected: instala sem erros; `jsdom` e `@mozilla/readability` aparecem em `dependencies`, `@types/jsdom` em `devDependencies`.

- [ ] **Step 2: Confirmar que o build ainda compila**

Run: `npm run build`
Expected: build conclui sem erros.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "$(cat <<'EOF'
chore: add jsdom e @mozilla/readability para extração de conteúdo

Dependências do fluxo de post guiado: extração do conteúdo principal de
uma URL via JSDOM + Readability.

Validação: npm run build.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `ContentExtractorService`

**Files:**
- Create: `src/common/ai/agents/editor/content-extractor.service.ts`
- Test: `src/common/ai/agents/editor/content-extractor.service.spec.ts`

- [ ] **Step 1: Escrever os testes que falham**

Create `src/common/ai/agents/editor/content-extractor.service.spec.ts`:
```ts
import { ContentExtractorService } from './content-extractor.service';

describe('ContentExtractorService', () => {
  const service = new ContentExtractorService();
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  const buildHtml = (body: string) =>
    `<!DOCTYPE html><html><head><title>Título da Página</title></head><body>${body}</body></html>`;

  it('extrai título e texto principal de um HTML válido', async () => {
    const article = `
      <article>
        <h1>Manchete do Artigo</h1>
        <p>Primeiro parágrafo com conteúdo relevante e suficiente para o Readability identificar o corpo principal do texto sem problemas.</p>
        <p>Segundo parágrafo reforçando o conteúdo principal com mais frases densas para passar no heurístico de extração.</p>
      </article>`;
    global.fetch = jest.fn(async () =>
      new Response(buildHtml(article), {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    ) as unknown as typeof fetch;

    const result = await service.extract('https://exemplo.com/post');

    expect(result.title).toEqual(expect.any(String));
    expect(result.title.length).toBeGreaterThan(0);
    expect(result.text).toContain('conteúdo relevante');
    expect(result.text).not.toContain('<p>');
  });

  it('envia User-Agent de browser no fetch', async () => {
    const fetchMock = jest.fn(async () =>
      new Response(buildHtml('<article><p>Conteúdo denso o suficiente para o Readability extrair o corpo principal da página de teste.</p></article>'), {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    await service.extract('https://exemplo.com/post');

    const [, init] = fetchMock.mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({
      'User-Agent': expect.stringContaining('Mozilla/5.0'),
    });
  });

  it('lança erro quando a resposta não é ok', async () => {
    global.fetch = jest.fn(async () =>
      new Response('not found', { status: 404 }),
    ) as unknown as typeof fetch;

    await expect(service.extract('https://exemplo.com/x')).rejects.toThrow(
      /404/,
    );
  });

  it('lança erro quando o Readability não encontra conteúdo principal', async () => {
    global.fetch = jest.fn(async () =>
      new Response('<html><body></body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    ) as unknown as typeof fetch;

    await expect(service.extract('https://exemplo.com/vazio')).rejects.toThrow(
      /conteúdo principal/i,
    );
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx jest src/common/ai/agents/editor/content-extractor.service.spec.ts`
Expected: FAIL com erro de módulo não encontrado (`Cannot find module './content-extractor.service'`).

- [ ] **Step 3: Implementar o serviço**

Create `src/common/ai/agents/editor/content-extractor.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export type ExtractedContent = {
  title: string;
  text: string;
};

@Injectable()
export class ContentExtractorService {
  /**
   * Baixa a página, limpa o HTML com o Readability e retorna o conteúdo
   * principal pronto para a IA.
   */
  async extract(url: string): Promise<ExtractedContent> {
    const response = await fetch(url, {
      headers: { 'User-Agent': BROWSER_USER_AGENT },
    });

    if (!response.ok) {
      throw new Error(
        `Falha ao baixar a URL (${response.status} ${response.statusText}): ${url}`,
      );
    }

    const html = await response.text();
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article || !article.textContent?.trim()) {
      throw new Error(
        `Não foi possível extrair o conteúdo principal da URL: ${url}`,
      );
    }

    return {
      title: article.title?.trim() ?? '',
      text: article.textContent.trim(),
    };
  }
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx jest src/common/ai/agents/editor/content-extractor.service.spec.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/common/ai/agents/editor/content-extractor.service.ts src/common/ai/agents/editor/content-extractor.service.spec.ts
git commit -m "$(cat <<'EOF'
feat: ContentExtractorService extrai conteúdo principal de URL

fetch nativo + JSDOM + Readability. Propaga erro em resposta não-ok e
quando o Readability não encontra conteúdo principal.

Validação: npx jest content-extractor.service.spec.ts (4 testes).

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `GameService.findById`

**Files:**
- Modify: `src/modules/game/game.service.ts` (adicionar método público após `findBySlug`, ~linha 97)
- Test: `src/modules/game/game.service.spec.ts` (criar)

- [ ] **Step 1: Escrever o teste que falha**

Create `src/modules/game/game.service.spec.ts`:
```ts
import { NotFoundException } from '@nestjs/common';
import { GameService } from './game.service';

describe('GameService.findById', () => {
  const tablesDB = { listRows: jest.fn() };
  const appwrite = { tablesDB } as never;
  const cache = { get: jest.fn(), set: jest.fn() } as never;

  const buildService = () =>
    new GameService(appwrite, {} as never, {} as never, cache);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('retorna o jogo pelo $id', async () => {
    tablesDB.listRows.mockResolvedValue({
      rows: [{ $id: 'g1', name: 'Hades II', slug: 'hades-ii' }],
    });

    const game = await buildService().findById('g1', 'name,slug');

    expect(game).toMatchObject({ $id: 'g1', name: 'Hades II' });
    expect(tablesDB.listRows).toHaveBeenCalledTimes(1);
  });

  it('lança NotFoundException quando o id não existe', async () => {
    tablesDB.listRows.mockResolvedValue({ rows: [] });

    await expect(buildService().findById('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx jest src/modules/game/game.service.spec.ts`
Expected: FAIL com `service.findById is not a function`.

- [ ] **Step 3: Implementar `findById`**

In `src/modules/game/game.service.ts`, adicione este método logo após o fim de `findBySlug` (depois da linha `}` em ~linha 97):
```ts
  /**
   * Busca um jogo pelo $id. Usado para resolver dados leves (nome/slug) de
   * jogos já vinculados por id, sem enriquecimento pesado.
   */
  async findById(id: string, select?: string): Promise<Game> {
    const requestedFields = select
      ? (select
          .split(',')
          .map((f) => f.trim())
          .filter(Boolean) as any[])
      : undefined;

    const result = await this.tablesDB.listRows<Game>({
      databaseId: GameService.DB_ID,
      tableId: 'games',
      queries: [
        Query.equal('$id', id),
        Query.limit(1),
        ...(requestedFields?.length ? [Query.select(requestedFields)] : []),
      ],
    });

    const game = result.rows[0];
    if (!game) {
      throw new NotFoundException(`Jogo com id "${id}" não encontrado`);
    }

    return game;
  }
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx jest src/modules/game/game.service.spec.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add src/modules/game/game.service.ts src/modules/game/game.service.spec.ts
git commit -m "$(cat <<'EOF'
feat: GameService.findById busca jogo por \$id

Lookup leve (nome/slug) usado para resolver dados de jogos vinculados por
id na resolução da imagem principal do editor.

Validação: npx jest game.service.spec.ts (2 testes).

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Migrar casamento de jogos para tool (refatora fluxo compartilhado)

Esta task altera o fluxo autônomo: `trendAnalysis` deixa de produzir `relatedGames` e o `writeArticle` passa a casar jogos via `gameSearchTool`.

**Files:**
- Modify: `src/common/ai/prompts/editor/write_article.prompt`
- Modify: `src/common/ai/prompts/editor/trend_analysis.prompt`
- Modify: `src/common/ai/agents/editor/editor.service.ts`
- Modify: `src/common/ai/agents/editor/editor.module.ts` (registrar `ContentExtractorService`)
- Test: `src/common/ai/agents/editor/editor.service.spec.ts` (criar)

- [ ] **Step 1: Escrever o teste do `gameSearchTool` (falha)**

Create `src/common/ai/agents/editor/editor.service.spec.ts`:
```ts
import { EditorService } from './editor.service';

const buildAi = () => {
  const definedTools: Record<string, (input: any) => Promise<any>> = {};
  return {
    definedTools,
    defineTool: jest.fn((config: { name: string }, handler: any) => {
      definedTools[config.name] = handler;
      return { name: config.name };
    }),
    prompt: jest.fn(),
  };
};

const buildService = (overrides: Partial<Record<string, any>> = {}) => {
  const ai = overrides.ai ?? buildAi();
  const gameService = overrides.gameService ?? { search: jest.fn() };
  const appwrite = overrides.appwrite ?? { tablesDB: { listRows: jest.fn(), createRow: jest.fn() } };
  const youtubeService = overrides.youtubeService ?? { searchVideos: jest.fn() };
  const notificationsService = overrides.notificationsService ?? { sharePost: jest.fn() };
  const contentExtractor = overrides.contentExtractor ?? { extract: jest.fn() };
  const correlationContext = { runWithGeneratedCorrelationId: (fn: any) => fn() };
  const loggerContext = { trackLifecycle: (_l: any, _m: any, fn: any) => fn() };

  const service = new EditorService(
    ai as never,
    gameService as never,
    appwrite as never,
    youtubeService as never,
    notificationsService as never,
    correlationContext as never,
    loggerContext as never,
    contentExtractor as never,
  );
  return { service, ai, gameService, appwrite, notificationsService, contentExtractor };
};

describe('EditorService gameSearchTool', () => {
  it('busca jogos via gameService.search e mapeia $id/name/slug', async () => {
    const gameService = {
      search: jest.fn().mockResolvedValue({
        results: [
          { $id: 'g1', name: 'Hades II', slug: 'hades-ii', coverUrl: 'x' },
          { $id: 'g2', name: 'Hades', slug: 'hades', coverUrl: 'y' },
        ],
      }),
    };
    const { service, ai } = buildService({ gameService });

    // força a criação das tools (getter)
    void (service as any).gameSearchTool;

    const handler = (ai as any).definedTools['gameSearchTool'];
    const out = await handler({ query: 'Hades' });

    expect(gameService.search).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'Hades' }),
    );
    expect(out).toEqual([
      { $id: 'g1', name: 'Hades II', slug: 'hades-ii' },
      { $id: 'g2', name: 'Hades', slug: 'hades' },
    ]);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx jest src/common/ai/agents/editor/editor.service.spec.ts`
Expected: FAIL — o construtor do `EditorService` ainda não aceita o 8º parâmetro (`contentExtractor`) e `gameSearchTool` não existe (TypeScript/execução falha).

- [ ] **Step 3: Adicionar `contentExtractor` ao construtor e o getter `gameSearchTool`**

In `src/common/ai/agents/editor/editor.service.ts`:

3a. Adicione o import no topo (junto dos outros imports relativos):
```ts
import { ContentExtractorService } from './content-extractor.service';
```

3b. Adicione o parâmetro ao construtor, após `loggerContext`:
```ts
    private readonly loggerContext: LoggerContextService,
    private readonly contentExtractor: ContentExtractorService,
  ) {
```

3c. Adicione o getter `gameSearchTool` logo após o getter `youtubeTool` (após a linha `}` que fecha o getter, ~linha 304):
```ts
  /**
   * Tool que permite ao agente de redação buscar jogos no catálogo Zetho
   * para vinculá-los ao artigo. O agente deve conferir name/slug antes de
   * usar o $id retornado.
   */
  private get gameSearchTool() {
    return this.ai.defineTool(
      {
        name: 'gameSearchTool',
        description:
          'Busca jogos no catálogo Zetho por nome para vincular ao artigo. Retorna $id, name e slug.',
        inputSchema: z.object({ query: z.string() }),
        outputSchema: z.array(
          z.object({
            $id: z.string(),
            name: z.string(),
            slug: z.string(),
          }),
        ),
      },
      async (input) => {
        const { query } = input;
        const { results } = await this.gameService.search({
          q: query,
          pageSize: 5,
        });
        return results.map((game) => ({
          $id: game.$id,
          name: game.name,
          slug: game.slug,
        }));
      },
    );
  }
```

3d. Registre o `ContentExtractorService` no `EditorModule` agora (a nova dependência do construtor precisa ser resolvível pelo DI, senão a app não sobe — o `npm run build` por si só não pega isso). In `src/common/ai/agents/editor/editor.module.ts`, adicione o import e o provider:
```ts
import { ContentExtractorService } from './content-extractor.service';
```
E em `providers`:
```ts
  providers: [EditorService, ContentExtractorService],
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx jest src/common/ai/agents/editor/editor.service.spec.ts`
Expected: PASS (1 teste).

- [ ] **Step 5: Atualizar `writeArticle` para usar a tool e `humanInstructions`**

In `src/common/ai/agents/editor/editor.service.ts`, substitua o método `writeArticle` (atual, com assinatura `(post, games)`):
```ts
  private async writeArticle(
    post: Feed['posts'][number],
    options: { humanInstructions?: string } = {},
  ): Promise<AiArticle> {
    const prompt = this.ai.prompt('editor/write_article');
    const { output } = await prompt(
      { post, humanInstructions: options.humanInstructions },
      { tools: [this.youtubeTool, this.gameSearchTool] },
    );
    return output;
  }
```

Nota: **mantenha** o import `import type { Games } from 'src/common/appwrite/appwrite';` — `pickGameScreenshot(game: Games)` continua usando esse tipo mesmo após a remoção de `getRelatedGames`.

- [ ] **Step 6: Atualizar `resolveMainImage` para resolver o jogo por id**

In `src/common/ai/agents/editor/editor.service.ts`, substitua o método `resolveMainImage`:
```ts
  private async resolveMainImage(
    article: AiArticle,
  ): Promise<PickedImage | null> {
    if (!article.imageStrategy.needsImage) {
      return null;
    }

    if (article.imageStrategy.type === 'game') {
      const gameId = article.post.relatedGameIds[0];
      if (gameId) {
        const game = await this.gameService.findById(gameId, 'name,slug');
        return this.pickGameScreenshot(game);
      }
    }

    if (article.imageStrategy.query) {
      const images = await this.searchUnsplash(article.imageStrategy.query);
      return images.length > 0 ? this.pickImage(images) : null;
    }

    return null;
  }
```

- [ ] **Step 7: Atualizar `execute` e remover `getRelatedGames`**

In `src/common/ai/agents/editor/editor.service.ts`, dentro de `execute`, remova as linhas que obtêm `relatedGames` e ajuste as chamadas. Substitua o bloco que vai de `const relatedGames = await this.getRelatedGames(analysis.relatedGames);` até `const mainImage = await this.resolveMainImage(article, relatedGames);` por:
```ts
        const article = await this.writeArticle(post);

        const processedBody = this.postProcessContent(article.post.body);
        article.post.body = processedBody;

        const mainImage = await this.resolveMainImage(article);
```

Em seguida, remova por completo o método `private async getRelatedGames(...)`.

- [ ] **Step 8: Atualizar o tipo `TrendAnalysis` e a chamada de `trendAnalysis`**

8a. Remova o campo `relatedGames: string;` do tipo `TrendAnalysis`.

8b. No fallback de `trendAnalysis` (objeto retornado quando `posts.length === 0`), remova a linha `relatedGames: 'N/A',`.

- [ ] **Step 9: Atualizar `write_article.prompt`**

In `src/common/ai/prompts/editor/write_article.prompt`:

9a. No frontmatter, remova o bloco `games(array): ...` do `input.schema` e adicione `humanInstructions?: string` no `input.schema`. O `input.schema` fica:
```yaml
input:
  schema:
    humanInstructions?: string
    post:
      id: string
      title: string
      description: string
      link: string
      pubDate: string
      content: string
```

9b. Substitua a seção `GAME MATCHING` (itens 4 a 8) por:
```
GAME MATCHING 4. Identify every game mentioned in the article body. 5. For
EACH mentioned game you MUST call gameSearchTool with the game name to find
it in the Zetho catalog. 6. Confirm the returned name/slug matches the game
before using it; use the matched $id values as relatedGameIds. 7. If no
result matches, do not link that game and leave it out of relatedGameIds;
if none match at all, return an empty array. 8. Never invent games or ids
outside the gameSearchTool results.
```

9c. Atualize a seção GAME LINKING (item 20-21) para usar o `slug` retornado pelo `gameSearchTool` (a redação já usa "use the provided slug" — troque "provided slug" por "slug returned by gameSearchTool").

9d. No final do prompt, remova o bloco Handlebars `Games:` / `{{#each games}} ... {{/each}}` e adicione, antes da linha `{{post.id}}`, um bloco condicional de instruções do usuário:
```
{{#if humanInstructions}}
USER EDITORIAL INSTRUCTIONS (HIGH PRIORITY — follow unless they violate the
formatting, HTML, language, or factual-accuracy rules above):
{{humanInstructions}}
{{/if}}
```

- [ ] **Step 10: Atualizar `trend_analysis.prompt`**

In `src/common/ai/prompts/editor/trend_analysis.prompt`:

10a. Remova `relatedGames: string` do `output.schema`.

10b. Na seção FIELD RULES, remova a linha que descreve `relatedGames` (`- relatedGames: Return explicit game titles as URL slugs ...`).

10c. No item 6.1 e no item 15/fallback, remova as menções a `relatedGames: "N/A"` do texto do fallback (deixe `id: "N/A", title: "N/A", publisher: "N/A"`).

- [ ] **Step 11: Rodar a suíte do editor + build**

Run: `npx jest src/common/ai/agents/editor && npm run build`
Expected: testes do editor PASS; build compila sem erros (sem referências a `getRelatedGames`, `relatedGames` ou à assinatura antiga de `writeArticle`/`resolveMainImage`).

- [ ] **Step 12: Commit**

```bash
git add src/common/ai/agents/editor/editor.service.ts src/common/ai/agents/editor/editor.service.spec.ts src/common/ai/agents/editor/editor.module.ts src/common/ai/prompts/editor/write_article.prompt src/common/ai/prompts/editor/trend_analysis.prompt
git commit -m "$(cat <<'EOF'
feat: casamento de jogos via gameSearchTool no agente editor

Move a responsabilidade de casar jogos do trendAnalysis para uma tool
(gameSearchTool) usada pelo writeArticle, que passa a casar jogos no
momento em que são citados. Prompt write_article ganha humanInstructions
e regra de uso obrigatório da tool. resolveMainImage resolve o jogo por
id (GameService.findById). execute deixa de pré-buscar jogos.

Validação: npx jest src/common/ai/agents/editor; npm run build.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Fluxo guiado — `generateGuidedArticle`, DTO e endpoint

**Files:**
- Modify: `src/common/ai/agents/editor/editor.service.ts` (método `generateGuidedArticle`)
- Modify: `src/modules/gazetho/gazetho.dto.ts` (`GenerateGuidedPostDto`)
- Modify: `src/modules/gazetho/gazetho.controller.ts` (endpoint)
- Test: `src/common/ai/agents/editor/editor.service.spec.ts` (adicionar describe)

- [ ] **Step 1: Escrever o teste de `generateGuidedArticle` (falha)**

In `src/common/ai/agents/editor/editor.service.spec.ts`, adicione no final do arquivo (reusa o `buildService` já definido no Task 4):
```ts
describe('EditorService.generateGuidedArticle', () => {
  const buildArticleOutput = () => ({
    post: {
      title: 'Título Final',
      subtitle: 'sub',
      slug: 'titulo-final',
      body: '<p>corpo</p>',
      status: 'published',
      tags: ['hades-ii'],
      relatedGameIds: [],
      seo: { title: 't', description: 'd' },
      originalSourceUrl: 'https://fonte.com/post',
    },
    imageStrategy: { needsImage: false, type: 'generic' as const },
  });

  const setup = () => {
    const ai = buildAi();
    ai.prompt.mockReturnValue(
      jest.fn().mockResolvedValue({ output: buildArticleOutput() }),
    );
    const contentExtractor = {
      extract: jest.fn().mockResolvedValue({
        title: 'Manchete',
        text: 'Texto longo extraído da página de contexto fornecida.',
      }),
    };
    const appwrite = {
      tablesDB: {
        listRows: jest.fn().mockResolvedValue({ rows: [] }), // não publicado ainda
        createRow: jest.fn().mockResolvedValue({
          title: 'Título Final',
          subtitle: 'sub',
          slug: 'titulo-final',
        }),
      },
    };
    const notificationsService = { sharePost: jest.fn().mockResolvedValue(undefined) };
    global.fetch = jest.fn(async () => new Response('{}', { status: 200 })) as any;

    return buildService({ ai, contentExtractor, appwrite, notificationsService });
  };

  it('extrai a URL, repassa humanInstructions e publica o post', async () => {
    const { service, contentExtractor, ai, appwrite, notificationsService } = setup();

    const result = await service.generateGuidedArticle({
      url: 'https://fonte.com/post',
      instructions: 'Foque no modo cooperativo.',
    });

    expect(contentExtractor.extract).toHaveBeenCalledWith('https://fonte.com/post');

    // humanInstructions repassado ao prompt write_article
    const promptFn = ai.prompt.mock.results[0].value;
    expect(promptFn).toHaveBeenCalledWith(
      expect.objectContaining({
        humanInstructions: 'Foque no modo cooperativo.',
        post: expect.objectContaining({
          content: 'Texto longo extraído da página de contexto fornecida.',
          link: 'https://fonte.com/post',
        }),
      }),
      expect.objectContaining({ tools: expect.any(Array) }),
    );

    expect(appwrite.tablesDB.createRow).toHaveBeenCalledTimes(1);
    expect(notificationsService.sharePost).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ skipped: false });
  });

  it('pula quando a URL de origem já foi publicada', async () => {
    const { service, appwrite, notificationsService } = setup();
    appwrite.tablesDB.listRows.mockResolvedValue({ rows: [{ $id: 'existente' }] });

    const result = await service.generateGuidedArticle({
      url: 'https://fonte.com/post',
    });

    expect(result).toMatchObject({ skipped: true });
    expect(notificationsService.sharePost).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx jest src/common/ai/agents/editor/editor.service.spec.ts -t generateGuidedArticle`
Expected: FAIL com `service.generateGuidedArticle is not a function`.

- [ ] **Step 3: Implementar `generateGuidedArticle`**

In `src/common/ai/agents/editor/editor.service.ts`, adicione o tipo de opções junto aos outros types do topo:
```ts
type GenerateGuidedArticleOptions = {
  url: string;
  instructions?: string;
};
```

E adicione o método público logo após `execute` (antes de `trendAnalysis`):
```ts
  async generateGuidedArticle(options: GenerateGuidedArticleOptions) {
    return this.loggerContext.trackLifecycle(
      this.logger,
      {
        component: EditorService.name,
        operation: 'editor.generateGuided',
      },
      async () => {
        const { url, instructions } = options;

        if (await this.sourceUrlAlreadyPublished(url)) {
          return {
            skipped: true as const,
            reason: `Source URL already published: ${url}`,
          };
        }

        const { title, text } = await this.contentExtractor.extract(url);

        const post: Feed['posts'][number] = {
          id: ID.unique(),
          title,
          description: text.slice(0, 500),
          link: url,
          pubDate: new Date().toISOString(),
          content: text,
        };

        const article = await this.writeArticle(post, {
          humanInstructions: instructions,
        });

        article.post.body = this.postProcessContent(article.post.body);

        const mainImage = await this.resolveMainImage(article);

        const savedPost = await this.saveGeneratedPost({
          article,
          fallbackMainImage: url,
          pickedMainImage: mainImage,
        });

        await this.notificationsService.sharePost({
          title: savedPost.title,
          subtitle: savedPost.subtitle ?? '',
          postUrl: this.buildPostUrl(savedPost.slug),
          mediaUrl: mainImage?.url,
        });

        this.invalidateFrontendCache();

        return { skipped: false as const, savedPost };
      },
    );
  }
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx jest src/common/ai/agents/editor/editor.service.spec.ts`
Expected: PASS (todos os testes do arquivo).

- [ ] **Step 5: Confirmar o registro do módulo**

`ContentExtractorService` já foi registrado no `EditorModule` no Task 4 (Step 3d). Confirme que `providers: [EditorService, ContentExtractorService]` está presente em `src/common/ai/agents/editor/editor.module.ts`. Nenhuma alteração necessária aqui.

- [ ] **Step 6: Adicionar o DTO**

In `src/modules/gazetho/gazetho.dto.ts`, adicione após `GeneratePostDto`:
```ts
export class GenerateGuidedPostDto {
  @IsUrl()
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  instructions?: string;
}
```
(`IsUrl`, `IsOptional`, `IsString`, `MaxLength` já estão importados no arquivo.)

- [ ] **Step 7: Adicionar o endpoint**

In `src/modules/gazetho/gazetho.controller.ts`:

7a. Adicione `GenerateGuidedPostDto` ao import de `./gazetho.dto`.

7b. Adicione o handler após `generateArticle`:
```ts
  @Post('editor/generate-guided-article')
  generateGuidedArticle(@Body() dto: GenerateGuidedPostDto) {
    return this.editorService.generateGuidedArticle({
      url: dto.url,
      instructions: dto.instructions,
    });
  }
```

- [ ] **Step 8: Rodar a suíte completa + build**

Run: `npm run build && npx jest`
Expected: build compila; toda a suíte de testes PASS.

- [ ] **Step 9: Commit**

```bash
git add src/common/ai/agents/editor/editor.service.ts src/common/ai/agents/editor/editor.service.spec.ts src/modules/gazetho/gazetho.dto.ts src/modules/gazetho/gazetho.controller.ts
git commit -m "$(cat <<'EOF'
feat: fluxo de geração de post orientado pelo usuário

Novo endpoint POST /gazetho/editor/generate-guided-article: usuário
fornece URL + instruções, conteúdo é extraído (ContentExtractorService)
e segue pela mesma redação/imagem/publicação do fluxo autônomo. Guarda de
duplicidade por URL de origem e publicação completa (save + share +
invalidate cache).

Validação: npm run build; npx jest.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Verificação final

- [ ] `npm run build` — compila sem erros.
- [ ] `npx jest` — suíte completa verde.
- [ ] `npm run lint` — sem erros novos.
- [ ] Sanidade manual (opcional, requer `SYSTEM_API_KEY` e chaves de IA):
  ```bash
  curl -X POST http://localhost:3000/gazetho/editor/generate-guided-article \
    -H "Content-Type: application/json" \
    -H "x-api-key: $SYSTEM_API_KEY" \
    -d '{"url":"https://exemplo.com/post","instructions":"Tom informativo, foco no multiplayer."}'
  ```
  Expected: `{ "skipped": false, "savedPost": { ... } }` e post publicado.

---

## Notas de cobertura do spec

- Seção 4 (deps) → Task 1.
- Seção 5.1 (`ContentExtractorService`) → Task 2.
- Seção 5.2 (`gameSearchTool`) → Task 4.
- Seção 6.1/6.2 (prompts) → Task 4 (Steps 9-10).
- Seção 6.3 (`EditorService` shared) → Task 4 (Steps 5-8).
- Seção 6.4 (`GameService.findById`) → Task 3.
- Seção 7 (fluxo guiado: DTO, endpoint, método) → Task 5.
- Seção 8 (testes) → Tasks 2, 4, 5.
- Mitigação seção 3 (uso obrigatório da tool no prompt) → Task 4 (Step 9b).
