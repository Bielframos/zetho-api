import { Type } from 'class-transformer';
import { IsIn, IsInt, Max, Min } from 'class-validator';

export class ProfileComparisonQuery {
  @IsIn(['common', 'opinions', 'discoveries'])
  view: 'common' | 'opinions' | 'discoveries' = 'common';

  @IsIn(['similar', 'different'])
  order: 'similar' | 'different' = 'similar';

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  offset = 0;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}
