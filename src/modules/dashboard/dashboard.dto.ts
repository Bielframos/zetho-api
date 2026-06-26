import { IsEnum, IsNotEmpty } from 'class-validator';

export class VoteCommentDto {
  @IsNotEmpty()
  @IsEnum(['up', 'down'])
  operation: 'up' | 'down';
}
