import { Injectable } from '@nestjs/common';
import { JSDOM } from 'jsdom';
import { safeEditorialFetch } from './safe-editorial-fetch';

export type EditorialImage = {
  url: string;
  alt: string;
  credit: string;
  sourceUrl: string;
};

@Injectable()
export class EditorialImageService {
  /** No publication until a source-specific, rights-reviewed image has been approved. */
  async forPublication(sourceUrl: string): Promise<EditorialImage | null> {
    if (process.env.EDITOR_IMAGES_ENABLED !== 'true') return null;
    try {
      const approvals = JSON.parse(
        process.env.EDITOR_APPROVED_IMAGES ?? '{}',
      ) as Record<string, EditorialImage>;
      const image = approvals[sourceUrl];
      if (
        !image?.url ||
        !image.alt?.trim() ||
        !image.credit?.trim() ||
        image.sourceUrl !== sourceUrl
      )
        return null;
      const candidates = await this.inspect(sourceUrl);
      if (!candidates.some((candidate) => candidate.url === image.url))
        return null;
      await this.validateImage(image.url);
      // mainImage is an existing bounded JSON string column.
      return JSON.stringify(image).length <= 1024 ? image : null;
    } catch {
      return null;
    }
  }

  /** Read-only experiment: candidates are source-derived, never model-invented. */
  async inspect(sourceUrl: string) {
    const page = await safeEditorialFetch(sourceUrl);
    if (!['text/html', 'application/xhtml+xml'].includes(page.contentType))
      throw new Error('Image source is not HTML');
    const document = new JSDOM(page.bytes.toString('utf8')).window.document;
    const images = [
      ...Array.from(
        document.querySelectorAll(
          'meta[property="og:image"],meta[name="twitter:image"]',
        ),
      ).map((el) => ({ raw: el.getAttribute('content'), alt: '' })),
      ...Array.from(document.querySelectorAll('article img')).map((el) => ({
        raw: el.getAttribute('src'),
        alt: el.getAttribute('alt') ?? '',
      })),
    ];
    const result: { url: string; alt: string; sourceUrl: string }[] = [];
    for (const image of images) {
      if (!image.raw) continue;
      try {
        const url = new URL(image.raw, page.url);
        if (
          url.protocol !== 'https:' ||
          result.some((item) => item.url === url.href)
        )
          continue;
        result.push({ url: url.href, alt: image.alt, sourceUrl });
      } catch {
        /* Malformed publisher metadata is not an image. */
      }
    }
    return result.slice(0, 10);
  }

  async validateImage(url: string) {
    const result = await safeEditorialFetch(url, 5_000_000);
    const data = result.bytes;
    const png = data
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = data[0] === 255 && data[1] === 216 && data[2] === 255;
    const webp =
      data.toString('ascii', 0, 4) === 'RIFF' &&
      data.toString('ascii', 8, 12) === 'WEBP';
    if (
      !(png && result.contentType === 'image/png') &&
      !(jpeg && result.contentType === 'image/jpeg') &&
      !(webp && result.contentType === 'image/webp')
    )
      throw new Error('Unsupported or invalid editorial image');
    return {
      url: result.url,
      contentType: result.contentType,
      bytes: data.length,
      elapsedMs: result.elapsedMs,
    };
  }
}
