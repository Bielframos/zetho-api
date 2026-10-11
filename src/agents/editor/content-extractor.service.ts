import { Injectable } from '@nestjs/common';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

import { safeEditorialFetch } from './safe-editorial-fetch';

export type ExtractedContent = {
  title: string;
  text: string;
};

@Injectable()
export class ContentExtractorService {
  /**
   * Baixa a página, limpa o HTML com o Readability e retorna o conteúdo
   * principal pronto para a IA.
   */
  async extract(url: string): Promise<ExtractedContent> {
    const response = await safeEditorialFetch(url);
    if (!['text/html', 'application/xhtml+xml'].includes(response.contentType))
      throw new Error('Editorial source is not HTML');
    const html = response.bytes.toString('utf8');
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article || !article.textContent?.trim()) {
      throw new Error(
        `Não foi possível extrair o conteúdo principal da URL: ${url}`,
      );
    }

    return {
      title: article.title?.trim() ?? '',
      text: article.textContent.trim(),
    };
  }
}
