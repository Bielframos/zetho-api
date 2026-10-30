import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ID, Query, Models } from 'node-appwrite';
import { createHash } from 'node:crypto';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import { TransactionService } from 'src/infra/appwrite/transaction.service';
import {
  editorialDraftSchema,
  EditorialDraft,
  escapeText,
} from './editorial-list.schema';

type Editor = { $id: string; labels?: string[] };
type DraftRow = Models.Row & {
  status: string;
  payload: string;
  revision: string;
  reviewedAt?: string;
};
type GameRow = Models.Row & {
  name: string;
  slug: string;
  releaseDate?: string;
  coverUrl?: string;
};

const OWNER = 'system:zetho';
const AUTHOR = 'zetho-editorial';
@Injectable()
export class EditorialListsService {
  constructor(
    private readonly appwrite: Appwrite,
    private readonly transactions: TransactionService,
  ) {}
  private get db() {
    return this.appwrite.tablesDB;
  }
  private async row(id: string) {
    try {
      return await this.db.getRow<DraftRow>({
        databaseId: 'app',
        tableId: 'editorial_drafts',
        rowId: id,
      });
    } catch (error) {
      if ((error as { code?: number }).code === 404)
        throw new NotFoundException();
      throw error;
    }
  }
  private requireEditor(user: { labels?: string[] }) {
    if (!user.labels?.includes('admin')) throw new ForbiddenException();
  }
  private parse(input: unknown) {
    const parsed = editorialDraftSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException(parsed.error.issues.map((i) => i.message));
    if (JSON.stringify(parsed.data).length > 15000)
      throw new BadRequestException('Rascunho muito grande');
    return parsed.data;
  }
  private revision(draft: EditorialDraft) {
    return createHash('sha256').update(JSON.stringify(draft)).digest('hex');
  }
  private async games(draft: EditorialDraft) {
    return Promise.all(
      draft.items.map(async (item) => {
        let game: GameRow;
        try {
          game = await this.db.getRow<GameRow>({
            databaseId: 'app',
            tableId: 'games',
            rowId: item.gameId,
          });
        } catch (error) {
          if ((error as { code?: number }).code === 404)
            throw new BadRequestException('Jogo fora do catálogo');
          throw error;
        }
        if (!game.name || !game.slug)
          throw new BadRequestException('Jogo sem dados públicos suficientes');
        if (
          draft.kind === 'monthly' &&
          (!game.releaseDate ||
            String(game.releaseDate).slice(0, 10) !== item.releaseDate)
        )
          throw new BadRequestException(
            'Data ausente ou conflitante no catálogo; revise a pauta antes de aprovar',
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
  /** Agent ingestion only creates a private draft. No model output can approve it. */
  async submit(input: unknown) {
    const draft = this.parse(input);
    await this.games(draft);
    return this.db.createRow({
      databaseId: 'app',
      tableId: 'editorial_drafts',
      rowId: ID.unique(),
      data: {
        status: 'draft',
        payload: JSON.stringify(draft),
        revision: this.revision(draft),
      },
    });
  }
  async inspect(user: Editor, id: string) {
    this.requireEditor(user);
    return this.reviewPreview(await this.row(id));
  }
  private async reviewPreview(row: DraftRow) {
    try {
      return {
        ...row,
        games: await this.games(this.parse(JSON.parse(row.payload))),
      };
    } catch {
      return {
        ...row,
        games: [],
        validationError:
          'Confira os jogos e as datas do catálogo antes de aprovar.',
      };
    }
  }
  async reviewQueue(user: Editor) {
    this.requireEditor(user);
    const result = await this.db.listRows<DraftRow>({
      databaseId: 'app',
      tableId: 'editorial_drafts',
      queries: [
        Query.notEqual('status', 'withdrawn'),
        Query.orderDesc('$createdAt'),
        Query.limit(100),
      ],
    });
    return {
      ...result,
      rows: await Promise.all(
        result.rows.map((row) => this.reviewPreview(row)),
      ),
    };
  }
  async revise(user: Editor, id: string, input: unknown) {
    this.requireEditor(user);
    const row = await this.row(id);
    if (row.status !== 'draft')
      throw new ConflictException('Retire a publicação antes de revisar');
    const draft = this.parse(input);
    await this.games(draft);
    return this.transactions.runInTransaction(async ({ txId }) => {
      const current = await this.db.getRow<DraftRow>({
        databaseId: 'app',
        tableId: 'editorial_drafts',
        rowId: id,
        transactionId: txId,
      });
      if (current.status !== 'draft' || current.revision !== row.revision)
        throw new ConflictException('A revisão mudou');
      return this.db.updateRow({
        databaseId: 'app',
        tableId: 'editorial_drafts',
        rowId: id,
        transactionId: txId,
        data: {
          payload: JSON.stringify(draft),
          revision: this.revision(draft),
        },
      });
    });
  }
  async approve(
    user: Editor,
    id: string,
    input: { revision?: string; sourcesVerified?: boolean },
  ) {
    this.requireEditor(user);
    const row = await this.row(id);
    if (input.sourcesVerified !== true || input.revision !== row.revision)
      throw new ConflictException(
        'Confirme a revisão atual e a checagem das fontes',
      );
    const draft = this.parse(JSON.parse(row.payload));
    const games = await this.games(draft);
    if (row.status === 'published') return { id, slug: `zetho-${id}` };
    return this.transactions.runInTransaction(async ({ txId }) => {
      // Read and update in the transaction: concurrent revisions must conflict.
      const current = await this.db.getRow<DraftRow>({
        databaseId: 'app',
        tableId: 'editorial_drafts',
        rowId: id,
        transactionId: txId,
      });
      if (current.revision !== input.revision || current.status !== 'draft')
        throw new ConflictException('A revisão mudou');
      await this.db.createRow({
        databaseId: 'app',
        tableId: 'lists',
        rowId: id,
        transactionId: txId,
        data: {
          ownerFingerprint: OWNER,
          title: draft.title,
          description: draft.description,
          slug: `zetho-${id}`,
          isPublic: true,
          itemCount: games.length,
          coverImageUrls: games
            .map((g) => g.coverUrl)
            .filter(Boolean)
            .slice(0, 5),
          latestAdditions: games
            .slice(0, 5)
            .map((game) =>
              JSON.stringify({
                gameId: game.id,
                gameName: game.name,
                gameSlug: game.slug,
                gameCoverUrl: game.coverUrl,
              }),
            )
            .filter((value) => value.length <= 240),
        },
      });
      for (let index = 0; index < games.length; index++) {
        await this.db.createRow({
          databaseId: 'app',
          tableId: 'list_items',
          rowId: ID.unique(),
          transactionId: txId,
          data: {
            list: id,
            game: games[index].id,
            orderKey: `0|${String(index).padStart(6, '0')}:`,
          },
        });
      }
      await this.db.updateRow({
        databaseId: 'app',
        tableId: 'editorial_drafts',
        rowId: id,
        transactionId: txId,
        data: {
          status: 'published',
          reviewedAt: new Date().toISOString(),
          reviewerId: user.$id,
        },
      });
      return { id, slug: `zetho-${id}` };
    });
  }
  async publicList(slug: string) {
    if (!/^zetho-[a-zA-Z0-9_-]{1,36}$/.test(slug))
      throw new NotFoundException();
    const row = await this.row(slug.slice(6));
    if (row.status !== 'published') throw new NotFoundException();
    const draft = this.parse(JSON.parse(row.payload));
    const games = await this.games(draft);
    return {
      id: row.$id,
      slug,
      title: draft.title,
      description: draft.description,
      criteria: draft.criteria,
      month: draft.month,
      author: 'Zetho',
      updatedAt: row.$updatedAt,
      items: draft.items.map((item, index) => ({
        ...item,
        game: games[index],
      })),
    };
  }
  async publicIndex() {
    const rows = await this.db.listRows<DraftRow>({
      databaseId: 'app',
      tableId: 'editorial_drafts',
      queries: [
        Query.equal('status', 'published'),
        Query.orderDesc('$createdAt'),
        Query.limit(100),
      ],
    });
    return rows.rows.map((row) => {
      const draft = this.parse(JSON.parse(row.payload));
      return {
        id: row.$id,
        slug: `zetho-${row.$id}`,
        title: draft.title,
        description: draft.description,
      };
    });
  }
  async convert(user: Editor, id: string) {
    this.requireEditor(user);
    const row = await this.row(id);
    if (row.status !== 'published')
      throw new ConflictException('Aprove a lista antes de gerar o post');
    const draft = this.parse(JSON.parse(row.payload));
    const games = await this.games(draft);
    const postId = `ed-${id}`;
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
      `<p>Seleção editorial do Zetho, com apoio de IA e revisão humana.</p><p>${escapeText(draft.criteria)}</p>` +
      (draft.month ? `<p>Período: ${escapeText(draft.month)}.</p>` : '') +
      `<ol>${draft.items.map((item, index) => `<li><h2>${escapeText(games[index].name)}</h2><p>${escapeText(item.reason)}</p>${item.releaseDate ? `<p>Lançamento: ${escapeText(item.releaseDate)}</p>` : ''}<p>${item.sources.map((url) => `<a href="${escapeText(url)}" rel="nofollow noopener noreferrer">Fonte</a>`).join(' · ')}</p></li>`).join('')}</ol>` +
      `<p><a href="/listas-editoriais/zetho-${id}">Veja a lista editorial no Zetho</a></p>`;
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
          slug: `editorial-${id}`,
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
    if (row.status !== 'published' || row.revision !== revision)
      throw new ConflictException('Revisão não aprovada');
    await this.games(this.parse(JSON.parse(row.payload)));
    return this.transactions.runInTransaction(async ({ txId }) => {
      await this.lockPublishedRevision(id, revision, txId);
      return this.db.updateRow({
        databaseId: 'app',
        tableId: 'posts',
        rowId: `ed-${id}`,
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
    const row = await this.db.getRow<DraftRow>({
      databaseId: 'app',
      tableId: 'editorial_drafts',
      rowId: id,
      transactionId: txId,
    });
    if (row.status !== 'published' || row.revision !== revision)
      throw new ConflictException('A revisão mudou');
    await this.db.updateRow({
      databaseId: 'app',
      tableId: 'editorial_drafts',
      rowId: id,
      transactionId: txId,
      data: { reviewedAt: row.reviewedAt },
    });
  }
  async withdraw(user: Editor, id: string) {
    this.requireEditor(user);
    await this.row(id);
    return this.transactions.runInTransaction(async ({ txId }) => {
      await this.db.updateRow({
        databaseId: 'app',
        tableId: 'editorial_drafts',
        rowId: id,
        transactionId: txId,
        data: { status: 'withdrawn' },
      });
      await this.db.deleteRow({
        databaseId: 'app',
        tableId: 'lists',
        rowId: id,
        transactionId: txId,
      });
      try {
        await this.db.updateRow({
          databaseId: 'app',
          tableId: 'posts',
          rowId: `ed-${id}`,
          transactionId: txId,
          data: { status: 'draft' },
        });
      } catch (error) {
        if ((error as { code?: number }).code !== 404) throw error;
      }
      return { withdrawn: true };
    });
  }
}
