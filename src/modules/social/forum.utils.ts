import { extractPlainTextFromHtml } from 'src/common/utils/sanitize-rich-text';
import { slugify } from 'src/common/utils/slugify';

export const MAX_FORUM_REPLY_DEPTH = 3;
export const MAX_FORUM_POST_CONTENT_LENGTH = 8000;
export const MAX_FORUM_REPLY_CONTENT_LENGTH = 2000;

export function buildForumPostSlug(
  titleOrContent: string,
  rowId: string,
): string {
  const plain = extractPlainTextFromHtml(titleOrContent) || titleOrContent;
  const baseSlug = slugify(plain).slice(0, 96).replace(/-+$/g, '');
  const prefix = baseSlug || 'discussao';
  return `${prefix}--${rowId}`;
}

export function extractIdFromForumSlug(slugOrId: string): string | null {
  const trimmed = slugOrId?.trim() ?? '';
  if (!trimmed) return null;
  const separatorIndex = trimmed.lastIndexOf('--');
  if (separatorIndex === -1) return null;
  const candidateId = trimmed.slice(separatorIndex + 2).trim();
  return candidateId || null;
}

export function deriveForumPostTitle(
  rawTitle?: string | null,
  rawContent?: string | null,
  gameName?: string | null,
): string {
  const explicitTitle = rawTitle?.trim();
  if (explicitTitle) return explicitTitle;

  const plain = extractPlainTextFromHtml(rawContent);
  if (plain) {
    if (plain.length <= 80) return plain;
    return `${plain.slice(0, 80).trimEnd()}…`;
  }

  return gameName?.trim()
    ? `Discussão sobre ${gameName.trim()}`
    : 'Discussão da comunidade';
}

export function deriveForumPostExcerpt(
  rawContent?: string | null,
  maxLength = 220,
): string {
  const plain = extractPlainTextFromHtml(rawContent);
  if (!plain) return '';
  if (plain.length <= maxLength) return plain;
  return `${plain.slice(0, maxLength).trimEnd()}…`;
}
