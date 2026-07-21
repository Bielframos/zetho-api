import { EmailTemplateService } from './email-template.service';
import { NotificationsService } from './notifications.service';

function createInMemoryCache() {
  const store = new Map<string, string>();
  return {
    get: jest.fn(async (key: string) => store.get(key)),
    set: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
  };
}

describe('NotificationsService', () => {
  it('renders Gazetho post emails with the current Gazetho URL and sends them to topic subscribers', async () => {
    const createEmail = jest.fn().mockResolvedValue({});
    const tablesDB = {
      getRow: jest.fn().mockResolvedValue({ name: 'Hades II' }),
    };
    const appwrite = {
      tablesDB,
      messaging: { createEmail },
    };
    const evolutionService = {
      sendTextMessage: jest.fn(),
      sendMediaMessage: jest.fn(),
    };

    const service = new NotificationsService(
      evolutionService as never,
      appwrite as never,
      new EmailTemplateService(),
      createInMemoryCache() as never,
    );

    await service.sendGameSubscriberEmails({
      postId: 'post-1',
      relatedGameIds: ['game-1'],
      slug: 'hades-ii-review',
      title: 'Hades II chegou',
      subtitle: 'Primeiras impressoes',
    });

    expect(createEmail).toHaveBeenCalledWith(
      'post-1_game-1',
      '[Zetho] Novidade sobre Hades II!',
      expect.stringContaining('https://ga.zetho.app/posts/hades-ii-review'),
      ['game_game-1'],
      [],
      [],
      [],
      [],
      [],
      false,
      true,
    );
    const emailCalls = createEmail.mock.calls as string[][];
    const emailBody = emailCalls[0][2];
    expect(emailBody).not.toContain('zetho.com.br');
  });

  it('includes the post image in the subscriber email body when mediaUrl is provided', async () => {
    const createEmail = jest.fn().mockResolvedValue({});
    const appwrite = {
      tablesDB: {
        getRow: jest.fn().mockResolvedValue({ name: 'Hades II' }),
      },
      messaging: { createEmail },
    };
    const evolutionService = {
      sendTextMessage: jest.fn(),
      sendMediaMessage: jest.fn(),
    };

    const service = new NotificationsService(
      evolutionService as never,
      appwrite as never,
      new EmailTemplateService(),
      createInMemoryCache() as never,
    );

    await service.sendGameSubscriberEmails({
      postId: 'post-1',
      relatedGameIds: ['game-1'],
      slug: 'hades-ii-review',
      title: 'Hades II chegou',
      subtitle: 'Primeiras impressoes',
      mediaUrl: 'https://cdn.zetho.app/posts/hades-ii.jpg',
    });

    const emailBody = (createEmail.mock.calls as string[][])[0][2];
    expect(emailBody).toContain(
      'src="https://cdn.zetho.app/posts/hades-ii.jpg"',
    );
  });

  it('only sends one WhatsApp message per postUrl even if sharePost is called again (outbox retry)', async () => {
    const evolutionService = {
      sendTextMessage: jest.fn().mockResolvedValue(undefined),
      sendMediaMessage: jest.fn().mockResolvedValue(undefined),
    };

    const service = new NotificationsService(
      evolutionService as never,
      {} as never,
      new EmailTemplateService(),
      createInMemoryCache() as never,
    );

    const post = {
      title: 'Hades II chegou',
      subtitle: 'Primeiras impressoes',
      postUrl: 'https://www.zetho.app/gazetho/hades-ii-chegou',
    };

    await service.sharePost(post);
    await service.sharePost(post); // simulates the outbox handler retrying the whole event

    expect(evolutionService.sendTextMessage).toHaveBeenCalledTimes(1);
  });
});
