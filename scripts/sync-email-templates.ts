import 'dotenv/config';
import { execFileSync } from 'child_process';
import { EmailTemplateService } from '../src/modules/notifications/email-template.service';

const emailTemplateService = new EmailTemplateService();

function syncRecoveryTemplate() {
  const subject = emailTemplateService.getPasswordRecoveryEmailSubject('Zetho');
  const message = emailTemplateService.renderPasswordRecoveryEmail();

  console.log('Updating password recovery template in Appwrite...');

  // Update pt locale
  execFileSync('pnpm', [
    'exec',
    'appwrite',
    'project',
    'update-email-template',
    '--template-id',
    'recovery',
    '--locale',
    'pt',
    '--subject',
    subject,
    '--message',
    message,
  ]);
  console.log('✓ Updated locale "pt"');

  // Update default (en) fallback locale
  execFileSync('pnpm', [
    'exec',
    'appwrite',
    'project',
    'update-email-template',
    '--template-id',
    'recovery',
    '--locale',
    'en',
    '--subject',
    subject,
    '--message',
    message,
  ]);
  console.log('✓ Updated locale "en"');
}

try {
  syncRecoveryTemplate();
  console.log('All email templates synced successfully!');
} catch (error) {
  console.error('Failed to sync email templates:', error);
  process.exit(1);
}
