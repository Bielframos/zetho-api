import { Injectable } from '@nestjs/common';

type EmailSection =
  | {
      kind: 'paragraph';
      text: string;
    }
  | {
      kind: 'quote';
      text: string;
    }
  | {
      kind: 'metadata';
      rows: Array<{ label: string; value: string }>;
    }
  | {
      kind: 'image';
      url: string;
      alt?: string;
    };

type EmailCta = {
  label: string;
  href: string;
};

type TransactionalEmailOptions = {
  title: string;
  preheader?: string;
  intro?: string;
  sections?: EmailSection[];
  cta?: EmailCta;
  footerNote?: string;
};

type CommentReplyEmailOptions = {
  recipientName: string;
  replyAuthor: string;
  commentContent: string;
  gameName: string;
  gameUrl: string;
};

type GazethoPostEmailOptions = {
  gameName: string;
  title: string;
  subtitle?: string | null;
  mediaUrl?: string | null;
  postUrl: string;
};

const palette = {
  blue9: '#3e63dd',
  blue10: '#5a73ff',
  blue11: '#93b4ff',
  gray1: '#101113',
  gray2: '#18191b',
  gray3: '#212225',
  gray6: '#373a3f',
  gray11: '#b0b4ba',
  gray12: '#edeef0',
};

@Injectable()
export class EmailTemplateService {
  renderCommentReplyEmail({
    recipientName,
    replyAuthor,
    commentContent,
    gameName,
    gameUrl,
  }: CommentReplyEmailOptions) {
    return this.renderTransactionalEmail({
      preheader: `${replyAuthor || 'Alguém'} respondeu ao seu comentário em ${gameName} no Zetho.`,
      title: 'Nova resposta ao seu comentário',
      intro: `Olá, ${recipientName || 'Gamer'}!`,
      sections: [
        {
          kind: 'paragraph',
          text: `${replyAuthor || 'Alguém'} respondeu ao seu comentário em ${gameName} no Zetho.`,
        },
        {
          kind: 'quote',
          text: commentContent,
        },
      ],
      cta: {
        label: `Ver comentário em ${gameName}`,
        href: gameUrl,
      },
      footerNote: 'Esta mensagem foi gerada automaticamente pelo Zetho.',
    });
  }

  renderGazethoPostEmail({
    gameName,
    title,
    subtitle,
    mediaUrl,
    postUrl,
  }: GazethoPostEmailOptions) {
    // Corpo alinhado ao caption enviado no WhatsApp: imagem, título e descrição.
    const sections: EmailSection[] = [
      ...(mediaUrl
        ? ([{ kind: 'image', url: mediaUrl, alt: title }] as EmailSection[])
        : []),
      {
        kind: 'paragraph',
        text: `Uma nova matéria sobre ${gameName} foi publicada no Gazetho.`,
      },
      ...(subtitle
        ? ([{ kind: 'paragraph', text: subtitle }] as EmailSection[])
        : []),
    ];

    return this.renderTransactionalEmail({
      preheader: `Nova matéria sobre ${gameName} no Gazetho.`,
      title,
      sections,
      cta: {
        label: 'Ler matéria completa',
        href: postUrl,
      },
      footerNote:
        'Você recebeu este e-mail porque ativou notificações para este jogo.',
    });
  }

  renderSessionInviteEmail({
    recipientName,
    hostName,
    sessionTitle,
    gameName,
    scheduledAt,
  }: {
    recipientName: string;
    hostName: string;
    sessionTitle: string;
    gameName: string;
    scheduledAt: string;
  }) {
    return this.renderTransactionalEmail({
      preheader: `${hostName} te convidou para jogar ${gameName} no Zetho.`,
      title: 'Convite para uma Jogatina',
      intro: `Olá, ${recipientName || 'Gamer'}!`,
      sections: [
        {
          kind: 'paragraph',
          text: `${hostName} convidou você para a Jogatina "${sessionTitle}" do jogo ${gameName}.`,
        },
        {
          kind: 'metadata',
          rows: [
            { label: 'Jogo', value: gameName },
            { label: 'Jogatina', value: sessionTitle },
            { label: 'Data/Hora', value: scheduledAt },
          ],
        },
      ],
      footerNote: 'Esta mensagem foi gerada automaticamente pelo Zetho.',
    });
  }

  renderSessionRsvpEmail({
    hostName,
    participantName,
    sessionTitle,
    status,
  }: {
    hostName: string;
    participantName: string;
    sessionTitle: string;
    status: 'confirmed' | 'declined';
  }) {
    const statusText =
      status === 'confirmed' ? 'confirmou presença' : 'recusou o convite';
    return this.renderTransactionalEmail({
      preheader: `${participantName} ${statusText} na sua Jogatina "${sessionTitle}".`,
      title: 'Atualização na Jogatina',
      intro: `Olá, ${hostName}!`,
      sections: [
        {
          kind: 'paragraph',
          text: `${participantName} ${statusText} para a Jogatina "${sessionTitle}".`,
        },
      ],
      footerNote: 'Esta mensagem foi gerada automaticamente pelo Zetho.',
    });
  }

  renderSessionStartReminderEmail({
    recipientName,
    sessionTitle,
    gameName,
    scheduledAt,
  }: {
    recipientName: string;
    sessionTitle: string;
    gameName: string;
    scheduledAt: string;
  }) {
    return this.renderTransactionalEmail({
      preheader: `Sua Jogatina "${sessionTitle}" está prestes a começar!`,
      title: 'Lembrete de Início da Partida',
      intro: `Olá, ${recipientName || 'Gamer'}!`,
      sections: [
        {
          kind: 'paragraph',
          text: `Sua partida de ${gameName} ("${sessionTitle}") agendada para ${scheduledAt} vai começar! Prepare seu controle e divirta-se.`,
        },
      ],
      footerNote: 'Esta mensagem foi gerada automaticamente pelo Zetho.',
    });
  }

  renderSessionCancellationEmail({
    recipientName,
    sessionTitle,
    gameName,
  }: {
    recipientName: string;
    sessionTitle: string;
    gameName: string;
  }) {
    return this.renderTransactionalEmail({
      preheader: `A Jogatina "${sessionTitle}" foi cancelada.`,
      title: 'Jogatina cancelada',
      intro: `Olá, ${recipientName || 'Gamer'}!`,
      sections: [
        {
          kind: 'paragraph',
          text: `A Jogatina "${sessionTitle}" (${gameName}) foi cancelada pelo host.`,
        },
      ],
      footerNote: 'Esta mensagem foi gerada automaticamente pelo Zetho.',
    });
  }

  renderTransactionalEmail({
    title,
    preheader,
    intro,
    sections = [],
    cta,
    footerNote,
  }: TransactionalEmailOptions) {
    const safeTitle = this.escapeHtml(title);
    const preheaderHtml = preheader
      ? `<div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">${this.escapeHtml(preheader)}</div>`
      : '';
    const introHtml = intro
      ? `<p style="margin:0 0 20px; font-size:16px; line-height:1.6; color:${palette.gray12};">${this.escapeHtml(intro)}</p>`
      : '';

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle} - Zetho</title>
</head>
<body style="margin:0; padding:0; background-color:${palette.gray1}; font-family:'Readex Pro', Arial, Helvetica, sans-serif; color:${palette.gray12};">
  ${preheaderHtml}
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:${palette.gray1}; padding:32px 12px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px; background-color:${palette.gray2}; border:1px solid ${palette.gray6}; border-radius:0; overflow:hidden;">
          <tr>
            <td style="padding:28px 32px; text-align:left; background-color:${palette.gray3}; border-bottom:1px solid ${palette.gray6};">
              <p style="margin:0 0 8px; color:${palette.blue11}; font-size:13px; line-height:1.4; letter-spacing:0; text-transform:uppercase;">Zetho</p>
              <h1 style="margin:0; color:${palette.gray12}; font-size:28px; line-height:1.2; font-weight:700; letter-spacing:0;">${safeTitle}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              ${introHtml}
              ${sections.map((section) => this.renderSection(section)).join('')}
              ${cta ? this.renderCta(cta) : ''}
              ${
                footerNote
                  ? `<p style="margin:24px 0 0; font-size:13px; line-height:1.5; color:${palette.gray11};">${this.escapeHtml(footerNote)}</p>`
                  : ''
              }
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px; background-color:${palette.gray3}; text-align:center; border-top:1px solid ${palette.gray6};">
              <p style="margin:0; font-size:12px; line-height:1.5; color:${palette.gray11};">© 2026 Zetho. Todos os direitos reservados.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  private renderSection(section: EmailSection) {
    if (section.kind === 'paragraph') {
      return `<p style="margin:0 0 18px; font-size:16px; line-height:1.6; color:${palette.gray12};">${this.escapeHtml(section.text)}</p>`;
    }

    if (section.kind === 'quote') {
      return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:22px 0; background-color:${palette.gray3}; border:1px solid ${palette.gray6}; border-left:4px solid ${palette.blue9}; border-radius:0;">
        <tr>
          <td style="padding:16px; color:${palette.gray12}; font-size:15px; line-height:1.6;">${this.escapeHtml(section.text)}</td>
        </tr>
      </table>`;
    }

    if (section.kind === 'image') {
      return `<img src="${this.escapeAttribute(section.url)}" alt="${this.escapeAttribute(section.alt ?? '')}" width="536" style="display:block; width:100%; max-width:536px; height:auto; margin:0 0 22px; border:1px solid ${palette.gray6};" />`;
    }

    const rows = section.rows
      .map(
        ({ label, value }) =>
          `<tr>
            <td style="padding:6px 0; color:${palette.gray11}; font-size:14px; line-height:1.5; width:90px;">${this.escapeHtml(label)}</td>
            <td style="padding:6px 0; color:${palette.gray12}; font-size:14px; line-height:1.5;">${this.escapeHtml(value)}</td>
          </tr>`,
      )
      .join('');

    return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:22px 0; background-color:${palette.gray3}; border:1px solid ${palette.gray6}; border-radius:0;">
      <tr>
        <td style="padding:14px 16px;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            ${rows}
          </table>
        </td>
      </tr>
    </table>`;
  }

  private renderCta({ label, href }: EmailCta) {
    return `<table cellpadding="0" cellspacing="0" role="presentation" style="margin:30px 0 4px;">
      <tr>
        <td style="background-color:${palette.blue9}; border:1px solid ${palette.blue10}; border-radius:0;">
          <a href="${this.escapeAttribute(href)}" style="display:inline-block; padding:12px 20px; color:#ffffff; text-decoration:none; font-size:15px; line-height:1.4; font-weight:700; border-radius:0;">${this.escapeHtml(label)}</a>
        </td>
      </tr>
    </table>`;
  }

  private escapeHtml(value: string) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private escapeAttribute(value: string) {
    return this.escapeHtml(value).replace(/`/g, '&#96;');
  }
}
