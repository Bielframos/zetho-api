import { Injectable } from '@nestjs/common';
import { Query } from 'node-appwrite';
import { EditorService } from 'src/common/ai/agents/editor/editor.service';
import { Appwrite } from 'src/common/appwrite/appwrite.provider';
import { YoutubeService } from '../google/youtube.service';
import { TranslatorService } from 'src/common/ai/agents/editor/translator/translator.service';

@Injectable()
export class SandboxService {
  private games: Appwrite['databases']['games'];
  private tablesDB: Appwrite['databases']['api'];

  constructor(
    private readonly appwrite: Appwrite,
    private readonly editorService: EditorService,
    private readonly translateService: TranslatorService,
    private readonly youtubeService: YoutubeService,
  ) {
    this.games = this.appwrite.databases.games;
    this.tablesDB = this.appwrite.databases.api;
  }

  async runEditor() {
    return this.editorService.execute();
  }

  async backfillDuplicatedCompanies() {
    const PAGE_SIZE = 100;
    let offset = 0;
    let hasMore = true;
    let fixed = 0;
    let inspected = 0;

    while (hasMore) {
      const { rows } = await this.games.list({
        queries: (q) => [
          q.select(['$id', 'involvedCompanies.$id'] as any),
          q.limit(PAGE_SIZE),
          q.offset(offset),
        ],
      });

      if (rows.length < PAGE_SIZE) hasMore = false;
      offset += rows.length;
      inspected += rows.length;

      for (const game of rows) {
        const ids: string[] = (game.involvedCompanies ?? [])
          .map((c: any) => c?.$id)
          .filter((id: unknown): id is string => !!id);

        const unique = Array.from(new Set(ids));

        if (unique.length === ids.length) continue;

        await this.games.update(game.$id, {
          involvedCompanies: [],
        } as any);

        if (unique.length > 0) {
          await this.games.update(game.$id, {
            involvedCompanies: unique,
          } as any);
        }

        fixed++;
      }
    }

    return {
      message: 'Backfill de companies duplicadas concluído',
      inspected,
      fixed,
    };
  }

  async getImageFromUnsplash(query: string) {
    const url = new URL('https://api.unsplash.com/search/photos');

    url.searchParams.set('query', query);
    url.searchParams.set('per_page', '10');
    url.searchParams.set('orientation', 'landscape');

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`,
      },
    });

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as {
      results: {
        id: string;
        urls: { regular: string };
        alt_description: string | null;
        description: string | null;
        user: { name: string; username: string };
      }[];
    };

    return data.results.map((img) => ({
      id: img.id,
      url: img.urls.regular,
      alt: img.alt_description ?? '',
      description: img.description ?? img.alt_description ?? '',
      authorName: img.user.name,
      authorUsername: img.user.username,
    }));
  }

  async searchVideosFromYoutube(query: string) {
    return this.youtubeService.searchVideos(query);
  }

  async translate(text: string, targetLanguage?: string) {
    return this.translateService.translate(text, targetLanguage);
  }

  async deleteGenresWithNullNamePt() {
    const PAGE_SIZE = 100;
    let deleted = 0;

    while (true) {
      const result = await this.tablesDB.listRows({
        databaseId: 'app',
        tableId: 'genres',
        queries: [
          Query.isNull('namePt'),
          Query.select(['$id'] as any),
          Query.limit(PAGE_SIZE),
        ],
      });

      const ids = (result.rows as Array<{ $id: string }>)
        .map((row) => row.$id)
        .filter(Boolean);

      if (!ids.length) {
        break;
      }

      await this.tablesDB.deleteRows({
        databaseId: 'app',
        tableId: 'genres',
        queries: [Query.equal('$id' as any, ids as any)],
      });

      deleted += ids.length;
    }

    return {
      deleted,
    };
  }
}
