import { BadRequestException, Injectable } from '@nestjs/common';
import { Models, Query } from 'node-appwrite';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import type {
  EntryGroup,
  EntryStatus,
  ProfileEntriesQuery,
} from './profile-entries.dto';

type Entry = Models.Row & {
  ownerFingerprint: string;
  gameId: string;
  status: EntryStatus;
  statusChangedAt?: string | null;
  liked?: boolean | null;
  hyped?: boolean | null;
  playedPlatformId?: string | null;
  playedPlatform?: string | null;
  completionType?: string | null;
  playtimeMinutes?: number | null;
};
type Game = Models.Row & {
  name: string;
  slug: string;
  releaseYear?: string | null;
  releaseDate?: string | null;
  coverUrl?: string | null;
};

const names = new Intl.Collator('pt-BR', {
  sensitivity: 'base',
  numeric: true,
});
const compareId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function dateYear(value?: string | null): string {
  if (!value) return 'unknown';
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? String(new Date(timestamp).getUTCFullYear())
    : 'unknown';
}

function groupKey(game: Game, group: EntryGroup): string {
  switch (group) {
    case 'release-year': {
      const year = game.releaseYear?.trim();
      return year && /^\d{4}$/.test(year) && Number(year) > 0
        ? year
        : dateYear(game.releaseDate);
    }
    case 'alphabetical': {
      const initial = game.name
        .trim()
        .normalize('NFKD')
        .replace(/\p{M}/gu, '')
        .toUpperCase()
        .charAt(0);
      return /^[A-Z]$/.test(initial) ? initial : '#';
    }
    case 'none':
      return 'all';
  }
}

function compareGroup(a: string, b: string, group: EntryGroup): number {
  if (a === b) return 0;
  if (a === 'unknown' || a === '#') return 1;
  if (b === 'unknown' || b === '#') return -1;
  return group === 'alphabetical' ? compareId(a, b) : Number(b) - Number(a);
}

/** Public profile library. Enrich and order the complete set before slicing it. */
@Injectable()
export class ProfileEntriesService {
  constructor(private readonly appwrite: Appwrite) {}

  async list(fingerprint: string, query: ProfileEntriesQuery) {
    if (!/^[\w-]{1,96}$/.test(fingerprint)) {
      throw new BadRequestException('Perfil inválido');
    }

    const entries = await this.entries(fingerprint, query.status);
    const games = await this.games(entries.map((entry) => entry.gameId));
    const rows = entries.flatMap((entry) => {
      const game = games.get(entry.gameId);
      // Removed catalog records must not become broken game links or inflate total.
      if (!game) return [];
      return [{ entry, game, groupKey: groupKey(game, query.group) }];
    });

    rows.sort((a, b) => {
      if (query.group === 'none') {
        return (
          compareId(b.entry.$updatedAt, a.entry.$updatedAt) ||
          compareId(a.entry.$id, b.entry.$id)
        );
      }
      return (
        compareGroup(a.groupKey, b.groupKey, query.group) ||
        names.compare(a.game.name, b.game.name) ||
        compareId(a.entry.$id, b.entry.$id)
      );
    });

    return {
      total: rows.length,
      rows: rows
        .slice(query.offset, query.offset + query.limit)
        .map(({ entry, game, groupKey }) => ({
          $id: entry.$id,
          $createdAt: entry.$createdAt,
          $updatedAt: entry.$updatedAt,
          ownerFingerprint: entry.ownerFingerprint,
          gameId: entry.gameId,
          status: entry.status,
          statusChangedAt: entry.statusChangedAt ?? null,
          liked: entry.liked ?? false,
          hyped: entry.hyped ?? false,
          playedPlatformId: entry.playedPlatformId ?? null,
          playedPlatform: entry.playedPlatform ?? null,
          completionType: entry.completionType ?? null,
          playtimeMinutes: entry.playtimeMinutes ?? null,
          groupKey,
          game: {
            $id: game.$id,
            name: game.name,
            slug: game.slug,
            releaseYear: game.releaseYear ?? null,
            releaseDate: game.releaseDate ?? null,
            coverUrl: game.coverUrl ?? null,
          },
        })),
    };
  }

  private async entries(fingerprint: string, status: EntryStatus) {
    const entries = new Map<string, Entry>();
    let cursor: string | undefined;
    for (;;) {
      const page = await this.appwrite.tablesDB.listRows<Entry>({
        databaseId: 'app',
        tableId: 'z_entries_read',
        queries: [
          Query.equal('ownerFingerprint', fingerprint),
          Query.equal('status', status),
          Query.orderDesc('$updatedAt'),
          Query.limit(100),
          ...(cursor ? [Query.cursorAfter(cursor)] : []),
        ],
      });
      for (const entry of page.rows) entries.set(entry.$id, entry);
      if (page.rows.length < 100) break;
      cursor = page.rows[page.rows.length - 1].$id;
    }
    return [...entries.values()];
  }

  private async games(ids: string[]) {
    const uniqueIds = [...new Set(ids)];
    const games = new Map<string, Game>();
    // At most four requests in flight, each selecting only card metadata.
    for (let offset = 0; offset < uniqueIds.length; offset += 400) {
      const batches: string[][] = [];
      for (
        let i = offset;
        i < Math.min(offset + 400, uniqueIds.length);
        i += 100
      ) {
        batches.push(uniqueIds.slice(i, i + 100));
      }
      const pages = await Promise.all(
        batches.map((batch) =>
          this.appwrite.tablesDB.listRows<Game>({
            databaseId: 'app',
            tableId: 'games',
            queries: [
              Query.equal('$id', batch),
              Query.select([
                '$id',
                'name',
                'slug',
                'releaseYear',
                'releaseDate',
                'coverUrl',
              ]),
              Query.limit(100),
            ],
          }),
        ),
      );
      for (const page of pages)
        for (const game of page.rows) games.set(game.$id, game);
    }
    return games;
  }
}
