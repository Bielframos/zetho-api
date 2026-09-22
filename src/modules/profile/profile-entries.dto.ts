import { Type } from 'class-transformer';
import { IsIn, IsInt, Max, Min } from 'class-validator';

export const ENTRY_STATUSES = [
  'completed',
  'backlog',
  'playing',
  'dropped',
  'wishlist',
] as const;
export const ENTRY_GROUPS = [
  'release-year',
  'alphabetical',
  'none',
] as const;
export type EntryStatus = (typeof ENTRY_STATUSES)[number];
export type EntryGroup = (typeof ENTRY_GROUPS)[number];

export class ProfileEntriesQuery {
  @IsIn(ENTRY_STATUSES)
  status: EntryStatus = 'completed';

  @IsIn(ENTRY_GROUPS)
  group: EntryGroup = 'none';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 32;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  offset = 0;
}
