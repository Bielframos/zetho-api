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
    global.fetch = jest.fn(
      async () =>
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
    const fetchMock = jest.fn(
      async () =>
        new Response(
          buildHtml(
            '<article><p>Conteúdo denso o suficiente para o Readability extrair o corpo principal da página de teste.</p></article>',
          ),
          {
            status: 200,
            headers: { 'content-type': 'text/html' },
          },
        ),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    await service.extract('https://exemplo.com/post');

    const [, init] = fetchMock.mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({
      'User-Agent': expect.stringContaining('Mozilla/5.0'),
    });
  });

  it('lança erro quando a resposta não é ok', async () => {
    global.fetch = jest.fn(
      async () => new Response('not found', { status: 404 }),
    ) as unknown as typeof fetch;

    await expect(service.extract('https://exemplo.com/x')).rejects.toThrow(
      /404/,
    );
  });

  it('lança erro quando o Readability não encontra conteúdo principal', async () => {
    global.fetch = jest.fn(
      async () =>
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
