import { Test, TestingModule } from '@nestjs/testing';
import { RpgService } from './rpg.service';

describe('RpgService', () => {
  let service: RpgService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RpgService],
    }).compile();

    service = module.get<RpgService>(RpgService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
