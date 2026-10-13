import { PostsStatus } from 'src/infra/appwrite/appwrite.enums';
import { EditorialPostService } from './editorial-post.service';

describe('EditorialPostService', () => {
  it('retains generated articles as drafts when factual verification is absent', async () => {
    const tablesDB = {
      listRows: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
      createRow: jest.fn().mockImplementation(async ({ data }) => data),
    };
    const service = new EditorialPostService(
      { tablesDB } as never,
      { registerHandler: jest.fn() } as never,
      { sharePost: jest.fn(), sendGameSubscriberEmails: jest.fn() } as never,
      { forPublication: jest.fn().mockResolvedValue(null) } as never,
    );

    await service.saveGeneratedPost(
      {
        post: {
          title: 'A sufficiently long and verified sounding article title',
          subtitle: '',
          slug: 'article-title',
          body: `<p>${'Editorial body text. '.repeat(100)}</p>`,
          status: 'published',
          tags: [],
          relatedGameIds: [],
          seo: { title: '', description: '' },
          originalSourceUrl: 'https://source.example/article',
        },
      },
      'https://source.example/article',
    );

    expect(tablesDB.createRow).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: PostsStatus.DRAFT }),
      }),
    );
  });

  it('propagates publication notification failures so the outbox can retry', async () => {
    const failure = new Error('subscriber delivery unavailable');
    const handler = jest.fn();
    const notifications = {
      sharePost: jest.fn().mockRejectedValue(failure),
      sendGameSubscriberEmails: jest.fn(),
    };
    const outbox = {
      registerHandler: jest.fn((_type, callback) =>
        handler.mockImplementation(callback),
      ),
    };
    const service = new EditorialPostService(
      { tablesDB: {} } as never,
      outbox as never,
      notifications as never,
      { forPublication: jest.fn().mockResolvedValue(null) } as never,
    );
    service.registerPublicationHandler();

    await expect(
      handler({ title: 'Article', subtitle: 'News', slug: 'article' }),
    ).rejects.toBe(failure);
    expect(notifications.sharePost).toHaveBeenCalledTimes(1);
  });
});
