import 'dotenv/config';
import { execFileSync } from 'child_process';
import { EmailTemplateService } from '../src/modules/notifications/email-template.service';
import { PROJECT_ID } from '../src/infra/appwrite/constants';

const apply = process.argv.includes('--apply');
const requested =
  process.argv.find((arg) => arg.startsWith('--template='))?.slice(11) ??
  'verification';
if (!['verification', 'recovery', 'all'].includes(requested))
  throw new Error('Template inválido');
const service = new EmailTemplateService();
const templates = [
  {
    id: 'verification',
    subject: service.getVerificationEmailSubject(),
    message: service.renderVerificationEmail(),
  },
  {
    id: 'recovery',
    subject: service.getPasswordRecoveryEmailSubject(),
    message: service.renderPasswordRecoveryEmail(),
  },
];
try {
  for (const template of templates.filter(
    (t) => requested === 'all' || t.id === requested,
  )) {
    for (const locale of ['pt', 'pt-br', 'en']) {
      console.log(
        `${apply ? 'Atualizando' : 'Prévia'}: ${template.id} (${locale}) — ${template.subject}`,
      );
      if (apply) {
        if (!PROJECT_ID) throw new Error('APPWRITE_PROJECT ausente');
        execFileSync(
          'appwrite',
          [
            'project',
            'update-email-template',
            '--project-id',
            PROJECT_ID,
            '--template-id',
            template.id,
            '--locale',
            locale,
            '--subject',
            template.subject,
            '--message',
            template.message,
          ],
          { stdio: 'pipe' },
        );
      }
    }
  }
  console.log(
    apply
      ? 'Templates atualizados. Nenhum e-mail enviado.'
      : 'Nada alterado. Use --apply para sincronizar.',
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
