import { Test, TestingModule } from '@nestjs/testing';
import { RpgAiService } from './rpg.ai.service';


describe('RpgAiService', () => {
  let service: RpgAiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RpgAiService],
    }).compile();

    service = module.get<RpgAiService>(RpgAiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
