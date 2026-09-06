import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RatingsController } from './ratings.controller';
import { RatingsFeedQueryDto } from './ratings.dto';

describe('Ratings feed controller contract', () => {
  it('applies the pagination defaults', async () => {
    const query = plainToInstance(RatingsFeedQueryDto, {});

    await expect(validate(query)).resolves.toHaveLength(0);
    expect(query).toEqual(expect.objectContaining({ page: 1, pageSize: 12 }));
  });

  it('transforms valid query strings and rejects values outside the bounds', async () => {
    const valid = plainToInstance(RatingsFeedQueryDto, {
      page: '3',
      pageSize: '50',
    });

    await expect(validate(valid)).resolves.toHaveLength(0);
    expect(valid).toEqual(expect.objectContaining({ page: 3, pageSize: 50 }));

    for (const input of [
      { page: '0' },
      { page: '1.5' },
      { pageSize: '0' },
      { pageSize: '51' },
    ]) {
      const errors = await validate(
        plainToInstance(RatingsFeedQueryDto, input),
      );
      expect(errors.length).toBeGreaterThan(0);
    }
  });

  it('dispatches normalized pagination to the service', async () => {
    const response = {
      items: [],
      total: 0,
      page: 3,
      pageSize: 24,
      totalPages: 0,
    };
    const ratingsService = {
      getRatingsFeed: jest.fn().mockResolvedValue(response),
    };
    const controller = new RatingsController(ratingsService as any);
    const query = plainToInstance(RatingsFeedQueryDto, {
      page: '3',
      pageSize: '24',
    });

    await expect(controller.getRatingsFeed(query)).resolves.toBe(response);
    expect(ratingsService.getRatingsFeed).toHaveBeenCalledWith(3, 24);
  });

  it('dispatches default pagination to the service', async () => {
    const ratingsService = {
      getRatingsFeed: jest.fn().mockResolvedValue({ items: [] }),
    };
    const controller = new RatingsController(ratingsService as any);

    await controller.getRatingsFeed(new RatingsFeedQueryDto());

    expect(ratingsService.getRatingsFeed).toHaveBeenCalledWith(1, 12);
  });
});
