import {
  extractPlainTextFromHtml,
  sanitizeRichTextHtml,
} from './sanitize-rich-text';

describe('sanitizeRichTextHtml', () => {
  it('preserves allowed Tiptap formatting tags and removes dangerous elements and attributes', () => {
    const input = `
      <h2>Análise de Builds</h2>
      <p onclick="alert(1)">Texto com <strong>negrito</strong>, <em>itálico</em> e <s>tachado</s>.</p>
      <blockquote><p>Uma citação importante</p></blockquote>
      <ul><li>Item 1</li><li>Item 2</li></ul>
      <script>window.pwned = true;</script>
      <iframe src="https://evil.example"></iframe>
      <a href="javascript:alert(1)">Link malicioso</a>
      <a href="https://zetho.app/jogo/elden-ring" class="custom">Link seguro</a>
    `;

    const sanitized = sanitizeRichTextHtml(input);

    expect(sanitized).toContain('<h2>Análise de Builds</h2>');
    expect(sanitized).toContain(
      '<p>Texto com <strong>negrito</strong>, <em>itálico</em> e <s>tachado</s>.</p>',
    );
    expect(sanitized).toContain(
      '<blockquote><p>Uma citação importante</p></blockquote>',
    );
    expect(sanitized).toContain('<ul><li>Item 1</li><li>Item 2</li></ul>');
    expect(sanitized).not.toContain('<script');
    expect(sanitized).not.toContain('<iframe');
    expect(sanitized).not.toContain('onclick');
    expect(sanitized).not.toContain('javascript:');
    expect(sanitized).toContain(
      '<a href="https://zetho.app/jogo/elden-ring" rel="noopener noreferrer nofollow" target="_blank">Link seguro</a>',
    );
  });

  it('preserves plain text without HTML tags as-is', () => {
    const sanitized = sanitizeRichTextHtml('Primeira linha\nSegunda linha');
    expect(sanitized).toBe('Primeira linha\nSegunda linha');
  });

  it('extracts normalized plain text from rich text HTML preserving word boundaries', () => {
    const html = '<h2>Título</h2><p>Primeiro parágrafo.</p><p>Segundo.</p>';
    expect(extractPlainTextFromHtml(html)).toBe(
      'Título Primeiro parágrafo. Segundo.',
    );
  });
});
