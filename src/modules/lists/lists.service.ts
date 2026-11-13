import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ID, Query, Models } from 'node-appwrite';
import { createHash, randomUUID } from 'node:crypto';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import { TransactionService } from 'src/infra/appwrite/transaction.service';
import {
  editorialDraftSchema,
  EditorialDraft,
  escapeText,
} from './list-editorial.schema';
import {
  isPublishedList,
  isSystemList,
  listReadPermissions,
  requirePrivateListTables,
} from './list-policy';

type Editor = { $id: string; labels?: string[] };
type ListRow = Models.Row & {
  title: string;
  description?: string;
  slug: string;
  ownerFingerprint: string;
  ownerType?: string;
  status?: string;
  isPublic?: boolean;
  revision: string;
  itemCount?: number;
  lastOrderKey?: string;
  latestAdditions?: string[];
  coverImageUrls?: string[];
  criteria?: string;
  kind?: string;
  month?: string | null;
  reviewedAt?: string;
  reviewerId?: string;
};
type GameRow = Models.Row & {
  name: string;
  slug: string;
  releaseDate?: string;
  coverUrl?: string;
};
type ItemRow = Models.Row & {
  list: string;
  game: string | GameRow;
  orderKey: string;
  reason?: string;
  sources?: string[];
  releaseDate?: string;
};
const OWNER = 'system:zetho';
const AUTHOR = 'zetho-editorial';

@Injectable()
export class ListsService {
  constructor(
    private readonly appwrite: Appwrite,
    private readonly transactions: TransactionService,
  ) {}
  private get db() {
    return this.appwrite.tablesDB;
  }
  private async row(id: string, transactionId?: string) {
    try {
      return await this.db.getRow<ListRow>({
        databaseId: 'app',
        tableId: 'lists',
        rowId: id,
        ...(transactionId ? { transactionId } : {}),
      });
    } catch (error) {
      if ((error as { code?: number }).code === 404)
        throw new NotFoundException();
      throw error;
    }
  }
  private requireEditor(user: Editor) {
    if (!user.labels?.includes('admin')) throw new ForbiddenException();
  }
  private requireSystem(row: ListRow) {
    if (!isSystemList(row))
      throw new BadRequestException(
        'Esta ação é exclusiva de listas do sistema.',
      );
  }
  private parse(input: unknown) {
    const parsed = editorialDraftSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException(parsed.error.issues.map((i) => i.message));
    return parsed.data;
  }
  private async items(id: string, transactionId?: string) {
    const rows: ItemRow[] = [];
    for (;;) {
      const page = await this.db.listRows<ItemRow>({
        databaseId: 'app',
        tableId: 'list_items',
        ...(transactionId ? { transactionId } : {}),
        queries: [
          Query.equal('list', id),
          Query.orderAsc('orderKey'),
          Query.orderAsc('$id'),
          Query.limit(100),
          Query.offset(rows.length),
        ],
      });
      rows.push(...page.rows);
      if (page.rows.length < 100) return rows;
    }
  }
  private async content(
    row: ListRow,
    transactionId?: string,
  ): Promise<EditorialDraft> {
    const items = await this.items(row.$id, transactionId);
    return this.parse({
      title: row.title,
      description: row.description,
      criteria: row.criteria,
      kind: row.kind ?? 'thematic',
      ...(row.month ? { month: row.month } : {}),
      items: items.map((item) => ({
        gameId: typeof item.game === 'string' ? item.game : item.game.$id,
        reason: item.reason,
        sources: item.sources,
        ...(item.releaseDate ? { releaseDate: item.releaseDate } : {}),
      })),
    });
  }
  private async games(draft: EditorialDraft) {
    return Promise.all(
      draft.items.map(async (item) => {
        const game = await this.db.getRow<GameRow>({
          databaseId: 'app',
          tableId: 'games',
          rowId: item.gameId,
        });
        if (!game.name || !game.slug)
          throw new BadRequestException('Jogo sem dados públicos suficientes');
        if (
          draft.kind === 'monthly' &&
          (!game.releaseDate ||
            game.releaseDate.slice(0, 10) !== item.releaseDate)
        )
          throw new BadRequestException(
            'Data ausente ou conflitante no catálogo',
          );
        return {
          id: game.$id,
          name: game.name,
          slug: game.slug,
          coverUrl: game.coverUrl ?? null,
        };
      }),
    );
  }
  async submit(input: unknown) {
    const draft = this.parse(input);
    const games = await this.games(draft);
    await requirePrivateListTables(this.db);
    const id = ID.unique();
    return this.transactions.runInTransaction(async ({ txId }) => {
      const row = await this.db.createRow<ListRow>({
        databaseId: 'app',
        tableId: 'lists',
        rowId: id,
        transactionId: txId,
        permissions: [],
        data: {
          title: draft.title,
          description: draft.description,
          criteria: draft.criteria,
          kind: draft.kind,
          month: draft.month ?? null,
          slug: `zetho-${id}`,
          ownerType: 'system',
          ownerFingerprint: OWNER,
          status: 'draft',
          isPublic: true,
          revision: randomUUID(),
          itemCount: draft.items.length,
          lastOrderKey: `0|${String(draft.items.length).padStart(6, '0')}:`,
          coverImageUrls: games
            .map((g) => g.coverUrl)
            .filter((url): url is string => !!url)
            .slice(0, 3),
        },
      });
      for (let i = 0; i < draft.items.length; i++)
        await this.writeItem(id, draft.items[i], i, txId);
      return row;
    });
  }
  private writeItem(
    id: string,
    item: EditorialDraft['items'][number],
    index: number,
    transactionId: string,
    rowId = ID.unique(),
  ) {
    return this.db.createRow({
      databaseId: 'app',
      tableId: 'list_items',
      rowId,
      transactionId,
      permissions: [],
      data: {
        list: id,
        game: item.gameId,
        orderKey: `0|${String(index + 1).padStart(6, '0')}:`,
        reason: item.reason,
        sources: item.sources,
        releaseDate: item.releaseDate ?? null,
      },
    });
  }
  async managed(user: Editor) {
    this.requireEditor(user);
    return this.db.listRows<ListRow>({
      databaseId: 'app',
      tableId: 'lists',
      queries: [
        Query.equal('ownerType', 'system'),
        Query.orderDesc('$createdAt'),
        Query.limit(100),
      ],
    });
  }
  private async canRead(row: ListRow, user?: Editor | null) {
    if (isPublishedList(row)) return;
    if (isSystemList(row) && user?.labels?.includes('admin')) return;
    if (!isSystemList(row) && user) {
      const profiles = await this.db.listRows({
        databaseId: 'app',
        tableId: 'user_profiles',
        queries: [
          Query.equal('userId', user.$id),
          Query.equal('fingerprint', row.ownerFingerprint),
          Query.limit(1),
        ],
      });
      if (profiles.rows.length) return;
    }
    throw new NotFoundException();
  }
  async byId(id: string, user?: Editor | null) {
    const row = await this.row(id);
    await this.canRead(row, user);
    const { reviewerId, ...list } = row;
    void reviewerId;
    return list;
  }
  async detail(slug: string, user?: Editor | null) {
    const result = await this.db.listRows<ListRow>({
      databaseId: 'app',
      tableId: 'lists',
      queries: [
        Query.equal('slug', slug),
        Query.equal('ownerType', 'system'),
        Query.limit(1),
      ],
    });
    const row = result.rows[0];
    if (!row) throw new NotFoundException();
    await this.canRead(row, user);
    // Public projection excludes reviewer identity and operational metadata.
    const { reviewerId, reviewedAt, ...list } = row;
    void reviewerId;
    void reviewedAt;
    return list;
  }
  async listItems(id: string, user?: Editor | null, offset = 0, limit = 50) {
    const row = await this.row(id);
    await this.canRead(row, user);
    return this.db.listRows<ItemRow>({
      databaseId: 'app',
      tableId: 'list_items',
      queries: [
        Query.equal('list', id),
        Query.orderAsc('orderKey'),
        Query.orderAsc('$id'),
        Query.select(['*', 'game.*']),
        Query.limit(
          Number.isFinite(limit)
            ? Math.max(1, Math.min(Math.floor(limit) || 50, 100))
            : 50,
        ),
        Query.offset(
          Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0,
        ),
      ],
    });
  }
  async revise(user: Editor, id: string, revision: string, input: unknown) {
    this.requireEditor(user);
    const draft = this.parse(input);
    const games = await this.games(draft);
    return this.transactions.runInTransaction(async ({ txId }) => {
      const row = await this.row(id, txId);
      this.requireSystem(row);
      if (row.status !== 'draft' || row.revision !== revision)
        throw new ConflictException(
          'A lista mudou. Recarregue antes de salvar.',
        );
      const previous = await this.items(id, txId);
      // Keep item IDs for games already present, including order-only edits.
      for (const item of previous) {
        const gameId =
          typeof item.game === 'string' ? item.game : item.game.$id;
        const index = draft.items.findIndex((i) => i.gameId === gameId);
        if (index < 0)
          await this.db.deleteRow({
            databaseId: 'app',
            tableId: 'list_items',
            rowId: item.$id,
            transactionId: txId,
          });
        else {
          const next = draft.items[index];
          await this.db.updateRow({
            databaseId: 'app',
            tableId: 'list_items',
            rowId: item.$id,
            transactionId: txId,
            permissions: [],
            data: {
              reason: next.reason,
              sources: next.sources,
              releaseDate: next.releaseDate ?? null,
              orderKey: `0|${String(index + 1).padStart(6, '0')}:`,
            },
          });
        }
      }
      for (let i = 0; i < draft.items.length; i++)
        if (
          !previous.some(
            (p) =>
              (typeof p.game === 'string' ? p.game : p.game.$id) ===
              draft.items[i].gameId,
          )
        )
          await this.writeItem(id, draft.items[i], i, txId);
      return this.db.updateRow<ListRow>({
        databaseId: 'app',
        tableId: 'lists',
        rowId: id,
        transactionId: txId,
        permissions: [],
        data: {
          title: draft.title,
          description: draft.description,
          criteria: draft.criteria,
          kind: draft.kind,
          month: draft.month ?? null,
          revision: randomUUID(),
          itemCount: draft.items.length,
          lastOrderKey: `0|${String(draft.items.length).padStart(6, '0')}:`,
          latestAdditions: [],
          coverImageUrls: games
            .map((g) => g.coverUrl)
            .filter((url): url is string => !!url)
            .slice(0, 3),
        },
      });
    });
  }
  async setStatus(
    user: Editor,
    id: string,
    input: { status?: string; revision?: string; sourcesVerified?: boolean },
  ) {
    this.requireEditor(user);
    if (!['draft', 'published', 'archived'].includes(input.status ?? ''))
      throw new BadRequestException('Estado inválido');
    await requirePrivateListTables(this.db);
    return this.transactions.runInTransaction(async ({ txId }) => {
      const row = await this.row(id, txId);
      this.requireSystem(row);
      if (input.revision !== row.revision)
        throw new ConflictException(
          'A lista mudou. Recarregue antes de continuar.',
        );
      if (input.status === 'published') {
        if (row.status !== 'draft' || input.sourcesVerified !== true)
          throw new ConflictException(
            'Revise o rascunho e confirme as fontes antes de publicar.',
          );
        await this.games(await this.content(row, txId));
      }
      if (row.status === 'published' && input.status !== 'published') {
        try {
          await this.db.getRow({
            databaseId: 'app',
            tableId: 'posts',
            rowId: this.postId(id, row.revision),
            transactionId: txId,
          });
          await this.db.updateRow({
            databaseId: 'app',
            tableId: 'posts',
            rowId: this.postId(id, row.revision),
            transactionId: txId,
            data: { status: 'draft' },
          });
        } catch (error) {
          if ((error as { code?: number }).code !== 404) throw error;
        }
      }
      return this.db.updateRow<ListRow>({
        databaseId: 'app',
        tableId: 'lists',
        rowId: id,
        transactionId: txId,
        permissions: listReadPermissions({ ...row, status: input.status }),
        data: {
          status: input.status,
          ...(input.status === 'draft' && row.status !== 'draft'
            ? { revision: randomUUID() }
            : {}),
          ...(input.status === 'published'
            ? { reviewedAt: new Date().toISOString() }
            : {}),
        },
      });
    });
  }
  async publicIndex() {
    const result = await this.db.listRows<ListRow>({
      databaseId: 'app',
      tableId: 'lists',
      queries: [
        Query.equal('ownerType', 'system'),
        Query.equal('status', 'published'),
        Query.equal('isPublic', true),
        Query.limit(100),
      ],
    });
    return result.rows.map((row) => ({
      id: row.$id,
      slug: row.slug,
      title: row.title,
      description: row.description,
    }));
  }
  private postId(id: string, revision: string) {
    return createHash('sha256')
      .update(`list-post:${id}:${revision}`)
      .digest('hex')
      .slice(0, 36);
  }
  async convert(user: Editor, id: string) {
    this.requireEditor(user);
    const row = await this.row(id);
    this.requireSystem(row);
    if (!isPublishedList(row))
      throw new ConflictException('Aprove a lista antes de gerar o post');
    const draft = await this.content(row);
    const games = await this.games(draft);
    const postId = this.postId(id, row.revision);
    try {
      return await this.db.getRow({
        databaseId: 'app',
        tableId: 'posts',
        rowId: postId,
      });
    } catch (error) {
      if ((error as { code?: number }).code !== 404) throw error;
    }
    const body =
      `<p>Seleção editorial do Zetho, revisada pela equipe.</p><p>${escapeText(draft.criteria)}</p>` +
      (draft.month ? `<p>Período: ${escapeText(draft.month)}.</p>` : '') +
      `<ol>${draft.items.map((item, index) => `<li><h2>${escapeText(games[index].name)}</h2><p>${escapeText(item.reason)}</p>${item.releaseDate ? `<p>Lançamento: ${escapeText(item.releaseDate)}</p>` : ''}<p>${item.sources.map((url) => `<a href="${escapeText(url)}" rel="nofollow noopener noreferrer">Fonte</a>`).join(' · ')}</p></li>`).join('')}</ol>` +
      `<p><a href="/listas/${escapeText(row.slug)}">Veja a lista editorial no Zetho</a></p>`;
    if (body.length > 8000)
      throw new BadRequestException('Reduza o texto para gerar o post');
    return this.transactions.runInTransaction(async ({ txId }) => {
      await this.lockPublishedRevision(id, row.revision, txId);
      await this.db.upsertRow({
        databaseId: 'app',
        tableId: 'authors',
        rowId: AUTHOR,
        transactionId: txId,
        data: { name: 'Zetho', slug: 'zetho-editorial' },
      });
      return this.db.createRow({
        databaseId: 'app',
        tableId: 'posts',
        rowId: postId,
        transactionId: txId,
        data: {
          title: draft.title,
          subtitle: draft.description,
          slug: `editorial-${id}-${row.revision.slice(0, 8)}`,
          body,
          status: 'draft',
          tags: ['curadoria'],
          relatedGameIds: games.map((g) => g.id),
          author: AUTHOR,
          seo: JSON.stringify({
            contentType: 'editorial_list',
            editorialListId: id,
          }),
        },
      });
    });
  }
  async publishPost(user: Editor, id: string, revision: string) {
    this.requireEditor(user);
    const row = await this.row(id);
    this.requireSystem(row);
    if (!isPublishedList(row) || row.revision !== revision)
      throw new ConflictException('Revisão não aprovada');
    await this.games(await this.content(row));
    return this.transactions.runInTransaction(async ({ txId }) => {
      await this.lockPublishedRevision(id, revision, txId);
      return this.db.updateRow({
        databaseId: 'app',
        tableId: 'posts',
        rowId: this.postId(id, revision),
        transactionId: txId,
        data: { status: 'published' },
      });
    });
  }
  private async lockPublishedRevision(
    id: string,
    revision: string,
    txId: string,
  ) {
    const row = await this.db.getRow<ListRow>({
      databaseId: 'app',
      tableId: 'lists',
      rowId: id,
      transactionId: txId,
    });
    if (!isPublishedList(row) || row.revision !== revision)
      throw new ConflictException('A revisão mudou');
    await this.db.updateRow({
      databaseId: 'app',
      tableId: 'lists',
      rowId: id,
      transactionId: txId,
      data: { reviewedAt: row.reviewedAt },
    });
  }
}
