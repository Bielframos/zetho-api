import { Injectable } from '@nestjs/common';
import { EditorService } from 'src/common/ai/editor.service';
import { Appwrite } from 'src/common/appwrite/appwrite.provider';

@Injectable()
export class SandboxService {
  private games: Appwrite['databases']['games'];

  constructor(
    private readonly appwrite: Appwrite,
    private readonly editorService: EditorService,
  ) {
    this.games = this.appwrite.databases.games;
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
}
