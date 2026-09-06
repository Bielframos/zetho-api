import { Injectable } from '@nestjs/common';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

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
    const response = await fetch(url, {
      headers: { 'User-Agent': BROWSER_USER_AGENT },
    });

    if (!response.ok) {
      throw new Error(
        `Falha ao baixar a URL (${response.status} ${response.statusText}): ${url}`,
      );
    }

    const html = await response.text();
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
