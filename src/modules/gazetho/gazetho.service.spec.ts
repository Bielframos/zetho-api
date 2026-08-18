import { NotFoundException } from '@nestjs/common';
import { GazethoService } from './gazetho.service';

describe('GazethoService public news', () => {
  const tablesDB = { listRows: jest.fn() };
  const service = new GazethoService({ tablesDB } as never);

  beforeEach(() => jest.clearAllMocks());

  it('lists only published news with parsed main images', async () => {
    tablesDB.listRows.mockResolvedValue({
      total: 1,
      rows: [
        {
          $id: 'post-1',
          $createdAt: '2026-01-01',
          $updatedAt: '2026-01-01',
          title: 'Título',
          slug: 'titulo',
          tags: ['rpg'],
          author: { name: 'Zetho' },
          mainImage: JSON.stringify({
            url: 'https://cdn.zetho.com.br/news/post-1.jpg',
          }),
        },
      ],
    });

    const result = await service.listPublishedNews({
      gameId: 'game-1',
      page: 1,
      pageSize: 20,
    });

    expect(result.items[0].mainImage).toEqual({
      url: 'https://cdn.zetho.com.br/news/post-1.jpg',
    });
    expect(tablesDB.listRows).toHaveBeenCalledWith(
      expect.objectContaining({
        queries: expect.arrayContaining([expect.stringContaining('status')]),
      }),
    );
  });

  it('does not reveal drafts through slug lookup', async () => {
    tablesDB.listRows.mockResolvedValue({ rows: [] });
    await expect(
      service.findPublishedNewsBySlug('draft'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
