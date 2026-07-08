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
});
