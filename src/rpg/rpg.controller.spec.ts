import { Test, TestingModule } from '@nestjs/testing';
import { RpgController } from './rpg.controller';

describe('RpgController', () => {
  let controller: RpgController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RpgController],
    }).compile();

    controller = module.get<RpgController>(RpgController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
