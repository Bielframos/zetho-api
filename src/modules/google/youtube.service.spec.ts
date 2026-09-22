import { YoutubeService } from './youtube.service';

describe('YoutubeService', () => {
  const originalApiKey = process.env.GOOGLE_API_KEY;

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.GOOGLE_API_KEY;
    } else {
      process.env.GOOGLE_API_KEY = originalApiKey;
    }
    jest.restoreAllMocks();
  });

  it('creates a v3 client with API key auth and maps search results', async () => {
    process.env.GOOGLE_API_KEY = 'test-api-key';
    const service = new YoutubeService();
    const client = Reflect.get(service, 'youtube');

    expect(client.constructor.name).toBe('Youtube');
    expect(client.context._options).toMatchObject({ auth: 'test-api-key' });
    expect(typeof client.search.list).toBe('function');

    const search = jest.spyOn(client.search, 'list').mockResolvedValue({
      data: {
        items: [
          {
            id: { videoId: 'video-1' },
            snippet: {
              title: 'Title',
              channelTitle: 'Channel',
              description: 'Description',
            },
          },
        ],
      },
    });

    await expect(service.searchVideos('query')).resolves.toEqual([
      {
        id: 'video-1',
        title: 'Title',
        channel: 'Channel',
        description: 'Description',
      },
    ]);
    expect(search).toHaveBeenCalledWith({
      part: ['snippet'],
      q: 'query',
      type: ['video'],
      maxResults: 8,
    });
  });
});
