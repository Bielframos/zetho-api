import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import type { TransactionService } from 'src/infra/appwrite/transaction.service';
import { ProfileService } from './profile.service';
import { ProfileUpdateDto } from './profile-update.dto';

describe('Profile favorite games', () => {
  function setup(existingGameIds: string[]) {
    const db = {
      listRows: jest.fn(({ tableId }: { tableId: string }) =>
        Promise.resolve(
          tableId === 'games'
            ? { rows: existingGameIds.map(($id) => ({ $id })) }
            : { rows: [{ $id: 'profile-1', userId: 'user-1' }] },
        ),
      ),
      updateRow: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ $id: 'profile-1', ...data }),
      ),
    };
    const service = new ProfileService(
      { tablesDB: db } as unknown as Appwrite,
      {} as TransactionService,
      {} as any,
      {} as any,
    );
    return { service, db };
  }

  it('stores the ordered favorites when every game exists', async () => {
    const { service, db } = setup(['g1', 'g2']);
    await service.updateMe('user-1', { favoriteGameIds: ['g2', 'g1'] });
    expect(db.updateRow).toHaveBeenCalledWith(
      expect.objectContaining({ data: { favoriteGameIds: ['g2', 'g1'] } }),
    );
  });

  it('rejects a favorite that does not exist and writes nothing', async () => {
    const { service, db } = setup(['g1']);
    await expect(
      service.updateMe('user-1', { favoriteGameIds: ['g1', 'missing'] }),
    ).rejects.toThrow('Jogo favorito inválido');
    expect(db.updateRow).not.toHaveBeenCalled();
  });

  it('clears favorites with an empty list', async () => {
    const { service, db } = setup([]);
    await service.updateMe('user-1', { favoriteGameIds: [] });
    expect(db.updateRow).toHaveBeenCalledWith(
      expect.objectContaining({ data: { favoriteGameIds: [] } }),
    );
  });

  it.each([
    [['a', 'b', 'c', 'd']],
    [['a', 'a']],
    [[1, 2]],
    [['x'.repeat(37)]],
  ])('DTO rejects %j', async (favoriteGameIds) => {
    const dto = plainToInstance(ProfileUpdateDto, { favoriteGameIds });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });

  it('DTO accepts up to three unique ids', async () => {
    const dto = plainToInstance(ProfileUpdateDto, {
      favoriteGameIds: ['a', 'b', 'c'],
    });
    expect(await validate(dto)).toHaveLength(0);
  });
});
