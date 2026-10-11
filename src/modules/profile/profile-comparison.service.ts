import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Client, Models, Query, TablesDB } from 'node-appwrite';
import { ENDPOINT, PROJECT_ID } from 'src/infra/appwrite/constants';
import { ENTRY_STATUSES } from './profile-entries.dto';
import { ProfileComparisonQuery } from './profile-comparison.dto';

type Row = Models.Row & { [key: string]: any };
const names = new Intl.Collator('pt-BR', {
  sensitivity: 'base',
  numeric: true,
});
const idOrder = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

@Injectable()
export class ComparisonSessionReader {
  create(jwt: string) {
    if (!jwt) throw new UnauthorizedException('Sessão necessária');
    // Deliberately no API key: Appwrite applies the visitor's table/row ACLs.
    return new TablesDB(
      new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setJWT(jwt),
    );
  }
}

@Injectable()
export class ProfileComparisonService {
  constructor(private readonly sessions: ComparisonSessionReader) {}

  async compare(
    userId: string,
    jwt: string,
    gamertag: string,
    query: ProfileComparisonQuery,
  ) {
    const db = this.sessions.create(jwt);
    const [mine, theirs] = await Promise.all([
      this.rows(db, 'user_profiles', [Query.equal('userId', userId)]),
      this.rows(db, 'user_profiles', [Query.equal('gamertag', gamertag)]),
    ]);
    const me = mine[0];
    const other = theirs[0];
    if (!me || !other || !me.fingerprint || !other.fingerprint)
      throw new NotFoundException('Perfil indisponível');
    if (me.$id === other.$id)
      throw new BadRequestException('Escolha outro jogador para comparar');
    const [myEntries, theirEntries, myRatings, theirRatings] =
      await Promise.all([
        this.rows(db, 'z_entries_read', [
          Query.equal('ownerFingerprint', me.fingerprint),
        ]),
        this.rows(db, 'z_entries_read', [
          Query.equal('ownerFingerprint', other.fingerprint),
        ]),
        this.rows(db, 'ratings', [
          Query.equal('ownerFingerprint', me.fingerprint),
        ]),
        this.rows(db, 'ratings', [
          Query.equal('ownerFingerprint', other.fingerprint),
        ]),
      ]);
    const own = this.latest(
      [...this.latest(myEntries).values()].filter((row) =>
        ENTRY_STATUSES.includes(row.status),
      ),
    );
    const peer = this.latest(
      [...this.latest(theirEntries).values()].filter((row) =>
        ENTRY_STATUSES.includes(row.status),
      ),
    );
    const validRating = (row: Row) =>
      typeof row.rating === 'number' &&
      Number.isFinite(row.rating) &&
      row.rating >= 0.5 &&
      row.rating <= 5 &&
      !row.deletedAt &&
      row.deleted !== true;
    const ownRatings = this.latest(
      [...this.latest(myRatings).values()].filter(validRating),
    );
    const peerRatings = this.latest(
      [...this.latest(theirRatings).values()].filter(validRating),
    );
    const ids =
      query.view === 'common'
        ? [...own.keys()].filter((id) => peer.has(id))
        : query.view === 'opinions'
          ? [...ownRatings.keys()].filter((id) => peerRatings.has(id))
          : [...peerRatings.keys()].filter((id) => !own.has(id));
    const games: Row[] = [];
    // Both enrichment and total use session-visible games; inaccessible catalog rows never leak.
    for (let offset = 0; offset < ids.length; offset += 100) {
      games.push(
        ...(await this.rows(db, 'games', [
          Query.equal('$id', ids.slice(offset, offset + 100)),
        ])),
      );
    }
    const rows = games.map((game) => {
      const myRating = ownRatings.get(game.$id)?.rating ?? null;
      const theirRating = peerRatings.get(game.$id)?.rating ?? null;
      return {
        game: {
          id: game.$id,
          name: game.name,
          slug: game.slug,
          coverUrl: game.coverUrl ?? null,
        },
        me: { status: own.get(game.$id)?.status ?? null, rating: myRating },
        other: {
          status: peer.get(game.$id)?.status ?? null,
          rating: theirRating,
        },
        difference:
          myRating !== null && theirRating !== null
            ? Math.abs(myRating - theirRating)
            : null,
      };
    });
    rows.sort((a, b) => {
      const primary =
        query.view === 'opinions'
          ? ((a.difference ?? 0) - (b.difference ?? 0)) *
            (query.order === 'different' ? -1 : 1)
          : query.view === 'discoveries'
            ? b.other.rating - a.other.rating
            : 0;
      return (
        primary ||
        names.compare(a.game.name, b.game.name) ||
        idOrder(a.game.id, b.game.id)
      );
    });
    return {
      me: { id: me.$id, gamertag: me.gamertag },
      other: { id: other.$id, gamertag: other.gamertag },
      total: rows.length,
      offset: query.offset,
      limit: query.limit,
      rows: rows.slice(query.offset, query.offset + query.limit),
    };
  }

  private latest(rows: Row[]) {
    rows.sort(
      (a, b) => idOrder(b.$updatedAt, a.$updatedAt) || idOrder(a.$id, b.$id),
    );
    const result = new Map<string, Row>();
    for (const row of rows)
      if (row.gameId && !result.has(row.gameId)) result.set(row.gameId, row);
    return result;
  }

  private async rows(db: TablesDB, tableId: string, queries: string[]) {
    const result: Row[] = [];
    let cursor: string | undefined;
    for (;;) {
      const page = await db.listRows<Row>({
        databaseId: 'app',
        tableId,
        queries: [
          ...queries,
          Query.orderAsc('$id'),
          Query.limit(100),
          ...(cursor ? [Query.cursorAfter(cursor)] : []),
        ],
      });
      result.push(...page.rows);
      if (page.rows.length < 100) return result;
      cursor = page.rows[page.rows.length - 1].$id;
    }
  }
}
