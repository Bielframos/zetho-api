import { JSDOM } from 'jsdom';

const ALLOWED_TAGS = new Set([
  'P',
  'H1',
  'H2',
  'H3',
  'UL',
  'OL',
  'LI',
  'STRONG',
  'B',
  'EM',
  'I',
  'S',
  'STRIKE',
  'DEL',
  'BLOCKQUOTE',
  'CODE',
  'PRE',
  'BR',
  'HR',
  'A',
]);

const REMOVED_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'IFRAME',
  'OBJECT',
  'EMBED',
  'SVG',
  'FORM',
  'INPUT',
  'BUTTON',
  'TEXTAREA',
  'SELECT',
  'META',
  'LINK',
  'BASE',
  'TEMPLATE',
]);

export function sanitizeRichTextHtml(raw: string): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const hasHtmlTags = /<[a-z!/][\s\S]*?>/i.test(trimmed);
  if (!hasHtmlTags) {
    return trimmed.replace(/\r\n/g, '\n');
  }

  const dom = new JSDOM(`<body>${trimmed}</body>`);
  const { document } = dom.window;

  for (const element of Array.from(document.body.querySelectorAll('*'))) {
    const tag = element.tagName.toUpperCase();
    if (!ALLOWED_TAGS.has(tag)) {
      if (REMOVED_TAGS.has(tag)) {
        element.remove();
      } else {
        element.replaceWith(...Array.from(element.childNodes));
      }
      continue;
    }

    for (const attribute of Array.from(element.attributes)) {
      const attrName = attribute.name.toLowerCase();
      if (
        tag === 'A' &&
        attrName === 'href' &&
        /^https?:\/\//i.test(attribute.value.trim())
      ) {
        element.setAttribute('href', attribute.value.trim());
        element.setAttribute('rel', 'noopener noreferrer nofollow');
        element.setAttribute('target', '_blank');
        continue;
      }
      element.removeAttribute(attribute.name);
    }
  }

  return document.body.innerHTML
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, ' ')
    .trim();
}

export function extractPlainTextFromHtml(raw?: string | null): string {
  if (typeof raw !== 'string' || !raw.trim()) return '';
  const dom = new JSDOM(
    `<body>${raw.replace(/<br\b[^>]*>|<\/(?:p|div|li|h[1-6]|blockquote|pre)>/gi, '$& ')}</body>`,
  );
  return (dom.window.document.body.textContent ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
