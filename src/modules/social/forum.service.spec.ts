import { NotFoundException } from '@nestjs/common';
import { ForumService } from './forum.service';

describe('ForumService', () => {
  const createService = (tablesDB: any) =>
    new ForumService({ tablesDB } as any);

  it('lists root forum posts with hydrated game, author, slug, and viewerVote', async () => {
    const listRows = jest.fn().mockImplementation(async ({ tableId }) => {
      if (tableId === 'game_comments') {
        return {
          total: 1,
          rows: [
            {
              $id: 'post-1',
              $createdAt: '2026-10-15T12:00:00Z',
              $updatedAt: '2026-10-15T12:00:00Z',
              gameId: 'game-1',
              userProfile: 'profile-1',
              title: 'Qual a melhor build de fé em Elden Ring?',
              slug: 'qual-a-melhor-build-de-fe-em-elden-ring--post-1',
              content:
                '<p>Estou testando encantamentos da chama frenética e queria dicas.</p>',
              parentId: null,
              depth: 0,
              voteCount: 5,
              replyCount: 2,
            },
          ],
        };
      }
      if (tableId === 'games') {
        return {
          rows: [
            {
              $id: 'game-1',
              name: 'Elden Ring',
              slug: 'elden-ring',
              coverUrl: 'https://example.com/er.jpg',
              releaseYear: '2022',
            },
          ],
        };
      }
      if (tableId === 'user_profiles') {
        return {
          rows: [
            {
              $id: 'profile-1',
              gamertag: 'tarnished',
              avatarUrl: 'https://example.com/avatar.jpg',
            },
          ],
        };
      }
      if (tableId === 'game_comment_votes') {
        return {
          rows: [{ comment: 'post-1', userId: 'viewer-1', type: 'up' }],
        };
      }
      return { rows: [], total: 0 };
    });

    const service = createService({ listRows });
    const result = await service.listPosts({
      page: 1,
      pageSize: 12,
      sort: 'recent',
      viewerUserId: 'viewer-1',
    });

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        $id: 'post-1',
        title: 'Qual a melhor build de fé em Elden Ring?',
        slug: 'qual-a-melhor-build-de-fe-em-elden-ring--post-1',
        voteCount: 5,
        replyCount: 2,
        viewerVote: 'up',
        game: expect.objectContaining({
          name: 'Elden Ring',
          slug: 'elden-ring',
        }),
        author: expect.objectContaining({
          gamertag: 'tarnished',
        }),
      }),
    );
  });

  it('resolves a post by composite slug or reply ID and walks up to the root post with focused thread', async () => {
    const rowsById: Record<string, any> = {
      'root-1': {
        $id: 'root-1',
        $createdAt: '2026-10-15T10:00:00Z',
        $updatedAt: '2026-10-15T10:00:00Z',
        gameId: 'game-1',
        userProfile: 'profile-1',
        title: 'Debate sobre o final secreto',
        slug: 'debate-sobre-o-final-secreto--root-1',
        content: '<p>O que vocês acharam do final das estrelas?</p>',
        parentId: null,
        depth: 0,
        voteCount: 3,
        replyCount: 1,
      },
      'reply-1': {
        $id: 'reply-1',
        $createdAt: '2026-10-15T11:00:00Z',
        $updatedAt: '2026-10-15T11:00:00Z',
        gameId: 'game-1',
        userProfile: 'profile-2',
        content: 'É o meu final favorito da campanha.',
        parentId: 'root-1',
        depth: 1,
        voteCount: 1,
        replyCount: 0,
      },
    };

    const getRow = jest.fn().mockImplementation(async ({ tableId, rowId }) => {
      if (tableId === 'game_comments' && rowsById[rowId]) {
        return rowsById[rowId];
      }
      throw new NotFoundException();
    });

    const listRows = jest.fn().mockImplementation(async ({ tableId }) => {
      if (tableId === 'game_comments') {
        return {
          total: 1,
          rows: [rowsById['reply-1']],
        };
      }
      if (tableId === 'games') {
        return {
          rows: [
            {
              $id: 'game-1',
              name: 'Elden Ring',
              slug: 'elden-ring',
              coverUrl: null,
              releaseYear: '2022',
            },
          ],
        };
      }
      if (tableId === 'user_profiles') {
        return {
          rows: [
            { $id: 'profile-1', gamertag: 'ranni', avatarUrl: null },
            { $id: 'profile-2', gamertag: 'blaidd', avatarUrl: null },
          ],
        };
      }
      return { rows: [], total: 0 };
    });

    const service = createService({ getRow, listRows });
    const detail = await service.getPostBySlugOrId('reply-1');

    expect(detail.post.$id).toBe('root-1');
    expect(detail.post.seo.indexable).toBe(true);
    expect(detail.post.seo.canonicalSlug).toBe(
      'debate-sobre-o-final-secreto--root-1',
    );
    expect(detail.focusedThread?.targetId).toBe('reply-1');
    expect(detail.focusedThread?.ancestorIds).toEqual(['root-1']);
  });
});
