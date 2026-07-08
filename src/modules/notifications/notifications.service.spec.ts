import { EmailTemplateService } from './email-template.service';
import { NotificationsService } from './notifications.service';

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
});
