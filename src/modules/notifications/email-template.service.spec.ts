import { EmailTemplateService } from './email-template.service';

describe('EmailTemplateService', () => {
  const service = new EmailTemplateService();

  it('renders the Zetho email design with dark palette and square corners', () => {
    const html = service.renderTransactionalEmail({
      title: 'Teste de e-mail',
      intro: 'Configuracao funcionando',
      cta: {
        label: 'Acessar Zetho',
        href: 'https://www.zetho.app/',
      },
    });

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html lang="pt-BR">');
    expect(html).toContain('background-color:#101113');
    expect(html).toContain('background-color:#18191b');
    expect(html).toContain('background-color:#3e63dd');
    expect(html).toContain('border-radius:0');
    expect(html).toContain("font-family:'Readex Pro'");
    expect(html).toContain('href="https://www.zetho.app/"');
  });

  it('escapes dynamic content before inserting it into the email body', () => {
    const html = service.renderCommentReplyEmail({
      recipientName: '<Admin>',
      replyAuthor: 'Player & Co',
      commentContent: '<script>alert("xss")</script>',
      gameName: '<Cool Game>',
      gameUrl: 'https://www.zetho.app/jogo/cool-game?next=<profile>',
    });

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<Admin>');
    expect(html).toContain('&lt;Admin&gt;');
    expect(html).toContain('Player &amp; Co');
    expect(html).toContain(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
    );
    expect(html).toContain('&lt;Cool Game&gt;');
    expect(html).toContain(
      'href="https://www.zetho.app/jogo/cool-game?next=&lt;profile&gt;"',
    );
  });

  describe('renderPasswordRecoveryEmail', () => {
    it('renders password recovery email with default Appwrite variables', () => {
      const html = service.renderPasswordRecoveryEmail();

      expect(html).toContain('Recuperação de Senha');
      expect(html).toContain('Olá, {{user}}!');
      expect(html).toContain('href="{{redirect}}"');
      expect(html).toContain('Redefinir senha');
      expect(html).toContain('Recuperação de senha da sua conta no Zetho.');
      expect(html).toContain(
        'Recebemos uma solicitação para redefinir a senha da sua conta no Zetho.',
      );
      expect(html).toContain('Por segurança, este link é temporário.');
      expect(html).toContain('background-color:#101113');
      expect(html).toContain('border-radius:0');
    });

    it('renders password recovery email with customized recipient and URL', () => {
      const html = service.renderPasswordRecoveryEmail({
        recipientName: 'Gabriel',
        resetUrl: 'https://www.zetho.app/redefinir-senha?token=abc-123',
        projectName: 'Zetho Gaming',
      });

      expect(html).toContain('Olá, Gabriel!');
      expect(html).toContain(
        'href="https://www.zetho.app/redefinir-senha?token=abc-123"',
      );
      expect(html).toContain(
        'Recuperação de senha da sua conta no Zetho Gaming.',
      );
      expect(html).toContain('Redefinir senha');
    });

    it('escapes dynamic content in password recovery email', () => {
      const html = service.renderPasswordRecoveryEmail({
        recipientName: '<script>alert(1)</script>',
        resetUrl: 'https://www.zetho.app/reset?ref=<malicious>',
      });

      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(html).toContain(
        'href="https://www.zetho.app/reset?ref=&lt;malicious&gt;"',
      );
    });

    it('returns the default subject line', () => {
      expect(service.getPasswordRecoveryEmailSubject()).toBe(
        'Recuperação de senha - Zetho',
      );
      expect(service.getPasswordRecoveryEmailSubject('Zetho Play')).toBe(
        'Recuperação de senha - Zetho Play',
      );
    });
  });
});
