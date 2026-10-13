import { MODULE_METADATA } from '@nestjs/common/constants';
import { WebhookModule } from './webhook.module';
import { ZethoHandler } from './handlers/zetho.handler';
import { CommentNotificationService } from './handlers/comment-notification.service';

describe('WebhookModule provider wiring', () => {
  it('registers comment delivery as a required handler collaborator', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      WebhookModule,
    );
    expect(providers).toEqual(
      expect.arrayContaining([ZethoHandler, CommentNotificationService]),
    );
  });
});
