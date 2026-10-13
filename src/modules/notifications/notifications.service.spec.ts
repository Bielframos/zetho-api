import { EmailTemplateService } from './email-template.service';

const originalWhatsAppEnv = {
  channel: process.env.ZETHO_WPP_CHANNEL,
  endpoint: process.env.EVOLUTION_ENDPOINT,
  token: process.env.EVOLUTION_INSTANCE_TOKEN,
  frontendAppUrl: process.env.FRONTEND_APP_URL,
};

beforeEach(() => {
  process.env.ZETHO_WPP_CHANNEL = 'test-channel';
  process.env.EVOLUTION_ENDPOINT = 'https://evolution.invalid';
  process.env.EVOLUTION_INSTANCE_TOKEN = 'test-token';
  process.env.FRONTEND_APP_URL =
    'https://news.example///,https://secondary.example';
});

afterAll(() => {
  if (originalWhatsAppEnv.channel === undefined)
    delete process.env.ZETHO_WPP_CHANNEL;
  else process.env.ZETHO_WPP_CHANNEL = originalWhatsAppEnv.channel;
  if (originalWhatsAppEnv.endpoint === undefined)
    delete process.env.EVOLUTION_ENDPOINT;
  else process.env.EVOLUTION_ENDPOINT = originalWhatsAppEnv.endpoint;
  if (originalWhatsAppEnv.token === undefined)
    delete process.env.EVOLUTION_INSTANCE_TOKEN;
  else process.env.EVOLUTION_INSTANCE_TOKEN = originalWhatsAppEnv.token;
  if (originalWhatsAppEnv.frontendAppUrl === undefined)
    delete process.env.FRONTEND_APP_URL;
  else process.env.FRONTEND_APP_URL = originalWhatsAppEnv.frontendAppUrl;
});

function createService(
  evolutionService: Record<string, jest.Mock>,
  appwrite: Record<string, any>,
  cache = createInMemoryCache(),
) {
  const { NotificationsService } =
    require('./notifications.service') as typeof import('./notifications.service');
  return new NotificationsService(
    evolutionService as never,
    appwrite as never,
    new EmailTemplateService(),
    cache as never,
  );
}

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
  it('renders Zetho news emails and sends them to topic subscribers', async () => {
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

    const service = createService(evolutionService, appwrite);

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
      expect.stringContaining('https://news.example/noticias/hades-ii-review'),
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

  it('supports legacy media in the subscriber email body when provided', async () => {
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

    const service = createService(evolutionService, appwrite);

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

    const service = createService(evolutionService, {});

    const post = {
      title: 'Hades II chegou',
      subtitle: 'Primeiras impressoes',
      postUrl: 'https://www.zetho.app/noticias/hades-ii-chegou',
    };

    await service.sharePost(post);
    await service.sharePost(post); // simulates the outbox handler retrying the whole event

    expect(evolutionService.sendTextMessage).toHaveBeenCalledTimes(1);
  });

  it('skips WhatsApp delivery when credentials or destination are missing', async () => {
    delete process.env.ZETHO_WPP_CHANNEL;
    delete process.env.EVOLUTION_ENDPOINT;
    delete process.env.EVOLUTION_INSTANCE_TOKEN;
    jest.resetModules();
    const { NotificationsService } =
      require('./notifications.service') as typeof import('./notifications.service');
    const evolutionService = {
      sendTextMessage: jest.fn(),
      sendMediaMessage: jest.fn(),
    };
    const cache = createInMemoryCache();
    const service = new NotificationsService(
      evolutionService as never,
      {} as never,
      new EmailTemplateService(),
      cache as never,
    );

    await service.sharePost({
      title: 'Hades II chegou',
      subtitle: '',
      postUrl: 'https://www.zetho.app/noticias/hades-ii-chegou',
    });

    expect(evolutionService.sendTextMessage).not.toHaveBeenCalled();
    expect(evolutionService.sendMediaMessage).not.toHaveBeenCalled();
    expect(cache.get).not.toHaveBeenCalled();
  });
});
