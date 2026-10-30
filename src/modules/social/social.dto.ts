import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
export class EntryInput {
  @IsString() gameId!: string;
  @ValidateIf((o) => o.status !== null && o.status !== undefined)
  @IsIn(['completed', 'backlog', 'dropped', 'playing', 'wishlist'])
  status?: string | null;
  @IsOptional() @IsBoolean() liked?: boolean;
  @IsOptional() @IsBoolean() hyped?: boolean;
  @ValidateIf(
    (o) => o.playedPlatform !== null && o.playedPlatform !== undefined,
  )
  @IsIn([
    'PC/Steam',
    'PS5',
    'Xbox Series',
    'Nintendo Switch',
    'Retro/Emulador',
    'Mobile',
  ])
  playedPlatform?: string | null;
  @ValidateIf(
    (o) => o.playedPlatformId !== null && o.playedPlatformId !== undefined,
  )
  @IsString()
  @MaxLength(36)
  playedPlatformId?: string | null;
  @ValidateIf(
    (o) => o.completionType !== null && o.completionType !== undefined,
  )
  @IsIn(['Campanha Principal', 'História + Extras', '100%/Platina/Mestre'])
  completionType?: string | null;
  @IsOptional() @IsInt() @Min(0) playtimeMinutes?: number | null;
}
export class CommentInput {
  @IsString() gameId!: string;
  @IsOptional() @IsString() @MaxLength(255) title?: string;
  @IsString() @MaxLength(8000) content!: string;
  @IsOptional() @IsString() parentId?: string;
}
export class CommentUpdateInput {
  @IsOptional() @IsString() @MaxLength(255) title?: string;
  @IsOptional() @IsString() @MaxLength(8000) content?: string;
}
export class ForumPostsQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) pageSize = 12;
  @IsOptional() @IsString() gameId?: string;
  @IsOptional() @IsString() gameSlug?: string;
  @IsOptional() @IsIn(['recent', 'top']) sort: 'recent' | 'top' = 'recent';
}
export class ForumRepliesQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) pageSize = 10;
  @IsOptional() @IsIn(['recent', 'top']) sort: 'recent' | 'top' = 'top';
}
export class VoteInput {
  @ValidateIf((o) => o.type !== null) @IsIn(['up', 'down']) type!:
    | 'up'
    | 'down'
    | null;
}
export class ListInput {
  @IsString() @MaxLength(64) title!: string;
  @IsOptional() @IsString() @MaxLength(128) description?: string;
  @IsOptional() @IsBoolean() isPublic?: boolean;
}
export class ListUpdateInput {
  @IsOptional() @IsString() @MaxLength(64) title?: string;
  @IsOptional() @IsString() @MaxLength(128) description?: string;
  @IsOptional() @IsBoolean() isPublic?: boolean;
  @IsOptional() @IsString({ each: true }) coverImageUrls?: string[];
}
export class ItemInput {
  @IsString() gameId!: string;
  @IsString() @MaxLength(48) orderKey!: string;
}
export class ItemOrderInput {
  @IsString() @MaxLength(48) orderKey!: string;
}
export class FollowInput {
  @IsString() targetProfileId!: string;
}

export class EnsureEntryInput {
  @IsString() @MaxLength(36) gameId!: string;
  @IsString() @MaxLength(64) requestId!: string;
}
