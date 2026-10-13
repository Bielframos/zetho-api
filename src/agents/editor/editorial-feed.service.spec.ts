import { EditorialFeedService } from './editorial-feed.service';

describe('EditorialFeedService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('combines recent RSS entries in descending date order and keeps item content paired', async () => {
    const now = Date.now();
    const feed = `<rss xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>
      <item><title>Older</title><link>https://example.test/older</link><description>Summary</description><content:encoded><![CDATA[full older]]></content:encoded><pubDate>${new Date(now - 2 * 60 * 60 * 1000).toISOString()}</pubDate></item>
      <item><title>Newer</title><link>https://example.test/newer</link><description>Summary</description><content:encoded><![CDATA[full newer]]></content:encoded><pubDate>${new Date(now - 60 * 60 * 1000).toISOString()}</pubDate></item>
      <item><title>Expired</title><link>https://example.test/expired</link><pubDate>${new Date(now - 3 * 60 * 60 * 1000).toISOString()}</pubDate></item>
    </channel></rss>`;
    let request = 0;
    global.fetch = jest.fn(async () => {
      request += 1;
      return new Response(
        request === 1 ? feed : '<rss><channel></channel></rss>',
      );
    }) as typeof fetch;

    const result = await new EditorialFeedService().getNews({
      captureWindowHours: 2.5,
    });

    expect(global.fetch).toHaveBeenCalledTimes(5);
    expect(result.posts.map(({ title }) => title)).toEqual(['Newer', 'Older']);
    const contentByPostId = new Map(
      result.contents.map(({ id, content }) => [id, content]),
    );
    expect(contentByPostId.get(result.posts[0].id)).toBe('full newer');
    expect(contentByPostId.get(result.posts[1].id)).toBe('full older');
  });
});
