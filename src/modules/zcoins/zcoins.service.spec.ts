import { BadRequestException } from '@nestjs/common';
import { Appwrite } from 'src/common/appwrite/appwrite.provider';
import { ZCoinsService } from './zcoins.service';

describe('ZCoinsService', () => {
  const createService = () => {
    const api = {
      getRow: jest.fn(),
      createTransaction: jest.fn(),
      createOperations: jest.fn(),
      createRow: jest.fn(),
      updateTransaction: jest.fn(),
    };

    const userProfiles = {
      list: jest.fn(),
    };

    const appwrite = {
      databases: {
        api,
        userProfiles,
      },
    };

    return {
      service: new ZCoinsService(appwrite as unknown as Appwrite),
      api,
      userProfiles,
    };
  };

  it('aplica ganho de zcoins com valor calculado no backend', async () => {
    const { service, api, userProfiles } = createService();

    userProfiles.list.mockResolvedValue({
      rows: [{ $id: 'profile-1', userId: 'user-1' }],
    });
    api.createTransaction.mockResolvedValue({ $id: 'tx-1' });
    api.getRow.mockResolvedValue({ zcoin_balance: 20 });

    const result = await service.applyInput('user-1', 'quest_complete');

    expect(api.createOperations).toHaveBeenCalledWith({
      transactionId: 'tx-1',
      operations: [
        {
          action: 'increment',
          databaseId: 'app',
          tableId: 'user_profiles',
          rowId: 'profile-1',
          data: { value: 20, column: 'zcoin_balance' },
        },
      ],
    });
    expect(api.createRow).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId: 'zcoin_transactions',
        transactionId: 'tx-1',
      }),
    );
    const expectedInputData = expect.objectContaining({
      userId: 'user-1',
      amount: 20,
      type: 'input',
      reason: 'quest_complete',
    }) as unknown;
    expect(api.createRow).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expectedInputData,
      }),
    );
    expect(api.updateTransaction).toHaveBeenCalledWith({
      transactionId: 'tx-1',
      commit: true,
    });
    expect(result.balance).toBe(20);
  });

  it('bloqueia reason inválido', async () => {
    const { service, api } = createService();

    await expect(
      service.applyInput('user-1', 'hack_attempt'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(api.createTransaction).not.toHaveBeenCalled();
  });

  it('impede débito com saldo insuficiente', async () => {
    const { service, api, userProfiles } = createService();

    userProfiles.list.mockResolvedValue({
      rows: [{ $id: 'profile-1', userId: 'user-1' }],
    });
    api.getRow.mockResolvedValue({ zcoin_balance: 10 });

    await expect(
      service.applyOutput('user-1', 'marketplace_item'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(api.createTransaction).not.toHaveBeenCalled();
  });

  it('aplica débito de zcoins de forma atômica', async () => {
    const { service, api, userProfiles } = createService();

    userProfiles.list.mockResolvedValue({
      rows: [{ $id: 'profile-1', userId: 'user-1' }],
    });
    api.getRow
      .mockResolvedValueOnce({ zcoin_balance: 80 })
      .mockResolvedValueOnce({ zcoin_balance: 40 });
    api.createTransaction.mockResolvedValue({ $id: 'tx-1' });

    const result = await service.applyOutput('user-1', 'marketplace_item');

    expect(api.createOperations).toHaveBeenCalledWith({
      transactionId: 'tx-1',
      operations: [
        {
          action: 'decrement',
          databaseId: 'app',
          tableId: 'user_profiles',
          rowId: 'profile-1',
          data: { value: 40, column: 'zcoin_balance' },
        },
      ],
    });
    const expectedOutputData = expect.objectContaining({
      amount: -40,
      type: 'output',
      reason: 'marketplace_item',
    }) as unknown;
    expect(api.createRow).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expectedOutputData,
      }),
    );
    expect(result.balance).toBe(40);
  });
});
