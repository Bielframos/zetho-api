import { GoneException } from '@nestjs/common';
import { AchievementsController } from './achievements.controller';
import { AchievementsService } from './achievements.service';

describe('Retired annual goal endpoints', () => {
  it('returns 410 for cached readers and writers without invoking any data operation', () => {
    const service = new Proxy(
      {},
      {
        get: () => {
          throw new Error('Unexpected service call');
        },
      },
    );
    const controller = new AchievementsController(
      service as AchievementsService,
    );
    for (const operation of [
      () => controller.retiredGoal(),
      () => controller.retiredGoalUpdate(),
    ]) {
      expect(operation).toThrow(GoneException);
      try {
        operation();
      } catch (error) {
        expect((error as GoneException).getStatus()).toBe(410);
      }
    }
  });
});
