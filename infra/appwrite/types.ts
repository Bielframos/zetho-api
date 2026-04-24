import { type Models } from 'node-appwrite';

export enum ZEntriesStatus {
  COMPLETED = 'completed',
  BACKLOG = 'backlog',
  DROPPED = 'dropped',
  PLAYING = 'playing',
  WISHLIST = 'wishlist',
  HYPED = 'hyped',
}

export enum GameCommentVotesType {
  UP = 'up',
  DOWN = 'down',
}

export enum ZEntriesReadOnlyStatus {
  COMPLETED = 'completed',
  BACKLOG = 'backlog',
  DROPPED = 'dropped',
  PLAYING = 'playing',
  WISHLIST = 'wishlist',
  HYPED = 'hyped',
}

export enum GamePlatformsType {
  CONSOLE = 'console',
  PC = 'pc',
  MOBILE = 'mobile',
}

export enum RpgStoriesStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  FINISHED = 'finished',
}
export type IgdbTokensCreate = {
  secret: string;
  expiresAt: string;
};

export type IgdbTokens = Models.Row & {
  secret: string;
  expiresAt: string;
};

export type GamesCreate = {
  name: string;
  slug: string;
  coverUrl?: string | null;
  releaseYear?: string | null;
  summary?: string | null;
  externalReference: number;
  gameType?:
    | (GameTypesCreate & { $id?: string; $permissions?: string[] })
    | string;
  similarGames?: string[] | null;
  checksum?: string | null;
  releaseDate?: string | null;
  genres?: (
    | (GenresCreate & { $id?: string; $permissions?: string[] })
    | string
  )[];
  involvedCompanies?: (
    | (CompaniesCreate & { $id?: string; $permissions?: string[] })
    | string
  )[];
  syncedAt?: string | null;
  zStats?:
    | (ZEntryCountCreate & { $id?: string; $permissions?: string[] })
    | string;
  syncStatus?: string | null;
  ratingAvg?: number;
  ratingCount?: number;
  ratingSum?: number;
};

export type Games = Models.Row & {
  name: string;
  slug: string;
  coverUrl?: string | null;
  releaseYear?: string | null;
  summary?: string | null;
  externalReference: number;
  gameType?: GameTypes;
  similarGames?: string[] | null;
  checksum?: string | null;
  releaseDate?: string | null;
  genres?: Genres[];
  involvedCompanies?: Companies[];
  syncedAt?: string | null;
  zStats?: ZEntryCount;
  syncStatus?: string | null;
  hypes?: number;
  ratingAvg?: number;
  ratingCount?: number;
  ratingSum?: number;
};

export type GameTypesCreate = {
  type: string;
  checksum?: string | null;
};

export type GameTypes = Models.Row & {
  type: string;
  checksum?: string | null;
};

export type UserProfilesCreate = {
  userId: string;
  gamertag: string;
  avatarUrl?: string | null;
  bio?: string | null;
  totalsCompleted?: number;
  totalsBacklog?: number;
  totalsDropped?: number;
  totalsPlaying?: number;
  totalsWishlist?: number;
  totalsHyped?: number;
  fingerprint: string;
};

export type UserProfiles = Models.Row & {
  userId: string;
  gamertag: string;
  avatarUrl?: string | null;
  bio?: string | null;
  totalsCompleted?: number;
  totalsBacklog?: number;
  totalsDropped?: number;
  totalsPlaying?: number;
  totalsWishlist?: number;
  totalsHyped?: number;
  fingerprint: string;
};

export type ZEntriesCreate = {
  status?: ZEntriesStatus | null;
  liked?: boolean | null;
  gameId: string;
  ownerFingerprint: string;
  processedAt?: string | null;
};

export type ZEntries = Models.Row & {
  status?: ZEntriesStatus | null;
  liked?: boolean | null;
  gameId: string;
  ownerFingerprint: string;
  processedAt?: string | null;
};

export type GenresCreate = {
  name: string;
  slug: string;
  checksum: string;
  namePt?: string | null;
};

export type Genres = Models.Row & {
  name: string;
  slug: string;
  checksum: string;
  namePt?: string | null;
};

export type CompaniesCreate = {
  name: string;
  checksum?: string | null;
  slug: string;
};

export type Companies = Models.Row & {
  name: string;
  checksum?: string | null;
  slug: string;
};

export type ZEntryCountCreate = {
  completedCount?: number;
  backlogCount?: number;
  droppedCount?: number;
  playingCount?: number;
  wishlistCount?: number;
  hypedCount?: number;
  game?: (GamesCreate & { $id?: string; $permissions?: string[] }) | string;
  likes?: number;
};

export type ZEntryCount = Models.Row & {
  completedCount?: number;
  backlogCount?: number;
  droppedCount?: number;
  playingCount?: number;
  wishlistCount?: number;
  hypedCount?: number;
  game?: Games;
  likes?: number;
};

export type GameCommentsCreate = {
  gameId: string;
  userProfile?:
    | (UserProfilesCreate & { $id?: string; $permissions?: string[] })
    | string;
  content: string;
  parentId?: string | null;
  voteCount?: number;
  replyCount?: number;
  depth?: number;
  votes?: (
    | (GameCommentVotesCreate & { $id?: string; $permissions?: string[] })
    | string
  )[];
};

export type GameComments = Models.Row & {
  gameId: string;
  userProfile?: UserProfiles;
  content: string;
  parentId?: string | null;
  voteCount?: number;
  replyCount?: number;
  depth?: number;
  votes?: GameCommentVotes[];
};

export type GameCommentVotesCreate = {
  type: GameCommentVotesType;
  comment?:
    | (GameCommentsCreate & { $id?: string; $permissions?: string[] })
    | string;
  userId: string;
};

export type GameCommentVotes = Models.Row & {
  type: GameCommentVotesType;
  comment?: GameComments;
  userId: string;
};

export type ListsCreate = {
  ownerFingerprint: string;
  title: string;
  description?: string | null;
  isPublic?: boolean;
  slug: string;
  itemCount?: number;
  latestAdditions?: string[] | null;
  lastOrderKey?: string | null;
};

export type Lists = Models.Row & {
  ownerFingerprint: string;
  title: string;
  description?: string | null;
  isPublic?: boolean;
  slug: string;
  itemCount?: number;
  latestAdditions?: string[] | null;
  lastOrderKey?: string | null;
};

export type ListItemsCreate = {
  list?: (ListsCreate & { $id?: string; $permissions?: string[] }) | string;
  game?: (GamesCreate & { $id?: string; $permissions?: string[] }) | string;
  orderKey: string;
};

export type ListItems = Models.Row & {
  list?: Lists;
  game?: Games;
  orderKey: string;
};

export type ZEntriesReadOnlyCreate = {
  status?: ZEntriesReadOnlyStatus | null;
  liked?: boolean | null;
  gameId: string;
  ownerFingerprint: string;
};

export type ZEntriesReadOnly = Models.Row & {
  status?: ZEntriesReadOnlyStatus | null;
  liked?: boolean | null;
  gameId: string;
  ownerFingerprint: string;
};

export type GamePlatformsCreate = {
  slug: string;
  name: string;
  shortName?: string | null;
  manufacturer?: string | null;
  type?: GamePlatformsType | null;
  generation?: number | null;
  releasedAt?: string | null;
};

export type GamePlatforms = Models.Row & {
  slug: string;
  name: string;
  shortName?: string | null;
  manufacturer?: string | null;
  type?: GamePlatformsType | null;
  generation?: number | null;
  releasedAt?: string | null;
};

export type AvaliaesCreate = {
  ownerFingerprint: string;
  gameId: string;
  rating: number;
  comment?: string | null;
};

export type Avaliaes = Models.Row & {
  ownerFingerprint: string;
  gameId: string;
  rating: number;
  comment?: string | null;
};

export type RpgStoriesCreate = {
  game?: (GamesCreate & { $id?: string; $permissions?: string[] }) | string;
  title: string;
  slug: string;
  summary?: string | null;
  chapterCount?: number;
  status?: RpgStoriesStatus;
  currentChapterId?: string | null;
};

export type RpgStories = Models.Row & {
  game?: Games;
  title: string;
  slug: string;
  summary?: string | null;
  chapterCount?: number;
  status?: RpgStoriesStatus;
  currentChapterId?: string | null;
};

export type RpgChaptersCreate = {
  story?:
    | (RpgStoriesCreate & { $id?: string; $permissions?: string[] })
    | string;
  number: number;
  content: string;
  finishedAt?: string | null;
  options?: (
    | (RpgOptionsCreate & { $id?: string; $permissions?: string[] })
    | string
  )[];
};

export type RpgChapters = Models.Row & {
  story?: RpgStories;
  number: number;
  content: string;
  finishedAt?: string | null;
  options?: RpgOptions[];
};

export type RpgOptionsCreate = {
  chapter?:
    | (RpgChaptersCreate & { $id?: string; $permissions?: string[] })
    | string;
  description?: string | null;
  voteCount?: number;
  votes?: (
    | (RpgVotesCreate & { $id?: string; $permissions?: string[] })
    | string
  )[];
};

export type RpgOptions = Models.Row & {
  chapter?: RpgChapters;
  description?: string | null;
  voteCount?: number;
  votes?: RpgVotes[];
};

export type RpgVotesCreate = {
  ownerFingerprint: string;
  option?:
    | (RpgOptionsCreate & { $id?: string; $permissions?: string[] })
    | string;
  weight?: number;
};

export type RpgVotes = Models.Row & {
  ownerFingerprint: string;
  option?: RpgOptions;
  weight?: number;
};

declare const __roleStringBrand: unique symbol;
export type RoleString = string & { readonly [__roleStringBrand]: never };

export type RoleBuilder = {
  any: () => RoleString;
  user: (userId: string, status?: string) => RoleString;
  users: (status?: string) => RoleString;
  guests: () => RoleString;
  team: (teamId: string, role?: string) => RoleString;
  member: (memberId: string) => RoleString;
  label: (label: string) => RoleString;
};

export type PermissionBuilder = {
  read: (role: RoleString) => string;
  write: (role: RoleString) => string;
  create: (role: RoleString) => string;
  update: (role: RoleString) => string;
  delete: (role: RoleString) => string;
};

export type PermissionCallback = (
  permission: PermissionBuilder,
  role: RoleBuilder,
) => string[];

export type QueryValue = string | number | boolean;

export type ExtractQueryValue<T> = T extends (infer U)[]
  ? U extends QueryValue
    ? U
    : never
  : T extends QueryValue | null
    ? NonNullable<T>
    : never;

export type QueryableKeys<T> = {
  [K in keyof T]: ExtractQueryValue<T[K]> extends never ? never : K;
}[keyof T] &
  keyof T;

export type QueryBuilder<T> = {
  equal: <K extends QueryableKeys<T>>(
    field: K,
    value: ExtractQueryValue<T[K]>,
  ) => string;
  notEqual: <K extends QueryableKeys<T>>(
    field: K,
    value: ExtractQueryValue<T[K]>,
  ) => string;
  lessThan: <K extends QueryableKeys<T>>(
    field: K,
    value: ExtractQueryValue<T[K]>,
  ) => string;
  lessThanEqual: <K extends QueryableKeys<T>>(
    field: K,
    value: ExtractQueryValue<T[K]>,
  ) => string;
  greaterThan: <K extends QueryableKeys<T>>(
    field: K,
    value: ExtractQueryValue<T[K]>,
  ) => string;
  greaterThanEqual: <K extends QueryableKeys<T>>(
    field: K,
    value: ExtractQueryValue<T[K]>,
  ) => string;
  contains: <K extends QueryableKeys<T>>(
    field: K,
    value: ExtractQueryValue<T[K]>,
  ) => string;
  search: <K extends QueryableKeys<T>>(field: K, value: string) => string;
  isNull: <K extends QueryableKeys<T>>(field: K) => string;
  isNotNull: <K extends QueryableKeys<T>>(field: K) => string;
  startsWith: <K extends QueryableKeys<T>>(field: K, value: string) => string;
  endsWith: <K extends QueryableKeys<T>>(field: K, value: string) => string;
  between: <K extends QueryableKeys<T>>(
    field: K,
    start: ExtractQueryValue<T[K]>,
    end: ExtractQueryValue<T[K]>,
  ) => string;
  select: <K extends keyof T>(fields: K[]) => string;
  orderAsc: <K extends keyof T>(field: K) => string;
  orderDesc: <K extends keyof T>(field: K) => string;
  limit: (value: number) => string;
  offset: (value: number) => string;
  cursorAfter: (documentId: string) => string;
  cursorBefore: (documentId: string) => string;
  or: (...queries: string[]) => string;
  and: (...queries: string[]) => string;
};

export type DatabaseId = 'app';

export type DatabaseTableMap = {
  app: {
    'IGDB Tokens': {
      create: (
        data: {
          secret: string;
          expiresAt: string;
        },
        options?: {
          rowId?: string;
          permissions?: (
            permission: {
              read: (role: RoleString) => string;
              write: (role: RoleString) => string;
              create: (role: RoleString) => string;
              update: (role: RoleString) => string;
              delete: (role: RoleString) => string;
            },
            role: {
              any: () => RoleString;
              user: (userId: string, status?: string) => RoleString;
              users: (status?: string) => RoleString;
              guests: () => RoleString;
              team: (teamId: string, role?: string) => RoleString;
              member: (memberId: string) => RoleString;
              label: (label: string) => RoleString;
            },
          ) => string[];
          transactionId?: string;
        },
      ) => Promise<IgdbTokens>;
      get: (id: string) => Promise<IgdbTokens>;
      update: (
        id: string,
        data: Partial<{
          secret: string;
          expiresAt: string;
        }>,
        options?: {
          permissions?: (
            permission: {
              read: (role: RoleString) => string;
              write: (role: RoleString) => string;
              create: (role: RoleString) => string;
              update: (role: RoleString) => string;
              delete: (role: RoleString) => string;
            },
            role: {
              any: () => RoleString;
              user: (userId: string, status?: string) => RoleString;
              users: (status?: string) => RoleString;
              guests: () => RoleString;
              team: (teamId: string, role?: string) => RoleString;
              member: (memberId: string) => RoleString;
              label: (label: string) => RoleString;
            },
          ) => string[];
          transactionId?: string;
        },
      ) => Promise<IgdbTokens>;
      delete: (
        id: string,
        options?: { transactionId?: string },
      ) => Promise<void>;
      list: (options?: {
        queries?: (q: {
          equal: <K extends QueryableKeys<IgdbTokens>>(
            field: K,
            value: ExtractQueryValue<IgdbTokens[K]>,
          ) => string;
          notEqual: <K extends QueryableKeys<IgdbTokens>>(
            field: K,
            value: ExtractQueryValue<IgdbTokens[K]>,
          ) => string;
          lessThan: <K extends QueryableKeys<IgdbTokens>>(
            field: K,
            value: ExtractQueryValue<IgdbTokens[K]>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<IgdbTokens>>(
            field: K,
            value: ExtractQueryValue<IgdbTokens[K]>,
          ) => string;
          greaterThan: <K extends QueryableKeys<IgdbTokens>>(
            field: K,
            value: ExtractQueryValue<IgdbTokens[K]>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<IgdbTokens>>(
            field: K,
            value: ExtractQueryValue<IgdbTokens[K]>,
          ) => string;
          contains: <K extends QueryableKeys<IgdbTokens>>(
            field: K,
            value: ExtractQueryValue<IgdbTokens[K]>,
          ) => string;
          search: <K extends QueryableKeys<IgdbTokens>>(
            field: K,
            value: string,
          ) => string;
          isNull: <K extends QueryableKeys<IgdbTokens>>(field: K) => string;
          isNotNull: <K extends QueryableKeys<IgdbTokens>>(field: K) => string;
          startsWith: <K extends QueryableKeys<IgdbTokens>>(
            field: K,
            value: string,
          ) => string;
          endsWith: <K extends QueryableKeys<IgdbTokens>>(
            field: K,
            value: string,
          ) => string;
          between: <K extends QueryableKeys<IgdbTokens>>(
            field: K,
            start: ExtractQueryValue<IgdbTokens[K]>,
            end: ExtractQueryValue<IgdbTokens[K]>,
          ) => string;
          select: <K extends keyof IgdbTokens>(fields: K[]) => string;
          orderAsc: <K extends keyof IgdbTokens>(field: K) => string;
          orderDesc: <K extends keyof IgdbTokens>(field: K) => string;
          limit: (value: number) => string;
          offset: (value: number) => string;
          cursorAfter: (documentId: string) => string;
          cursorBefore: (documentId: string) => string;
          or: (...queries: string[]) => string;
          and: (...queries: string[]) => string;
        }) => string[];
      }) => Promise<{ total: number; rows: IgdbTokens[] }>;
      createMany: (
        rows: Array<
          {
            secret: string;
            expiresAt: string;
          } & { $id?: string; $permissions?: string[] }
        >,
        options?: { transactionId?: string },
      ) => Promise<{ total: number; rows: IgdbTokens[] }>;
      updateMany: (
        data: Partial<{
          secret: string;
          expiresAt: string;
        }>,
        options?: {
          queries?: (q: {
            equal: <K extends QueryableKeys<IgdbTokens>>(
              field: K,
              value: ExtractQueryValue<IgdbTokens[K]>,
            ) => string;
            notEqual: <K extends QueryableKeys<IgdbTokens>>(
              field: K,
              value: ExtractQueryValue<IgdbTokens[K]>,
            ) => string;
            lessThan: <K extends QueryableKeys<IgdbTokens>>(
              field: K,
              value: ExtractQueryValue<IgdbTokens[K]>,
            ) => string;
            lessThanEqual: <K extends QueryableKeys<IgdbTokens>>(
              field: K,
              value: ExtractQueryValue<IgdbTokens[K]>,
            ) => string;
            greaterThan: <K extends QueryableKeys<IgdbTokens>>(
              field: K,
              value: ExtractQueryValue<IgdbTokens[K]>,
            ) => string;
            greaterThanEqual: <K extends QueryableKeys<IgdbTokens>>(
              field: K,
              value: ExtractQueryValue<IgdbTokens[K]>,
            ) => string;
            contains: <K extends QueryableKeys<IgdbTokens>>(
              field: K,
              value: ExtractQueryValue<IgdbTokens[K]>,
            ) => string;
            search: <K extends QueryableKeys<IgdbTokens>>(
              field: K,
              value: string,
            ) => string;
            isNull: <K extends QueryableKeys<IgdbTokens>>(field: K) => string;
            isNotNull: <K extends QueryableKeys<IgdbTokens>>(
              field: K,
            ) => string;
            startsWith: <K extends QueryableKeys<IgdbTokens>>(
              field: K,
              value: string,
            ) => string;
            endsWith: <K extends QueryableKeys<IgdbTokens>>(
              field: K,
              value: string,
            ) => string;
            between: <K extends QueryableKeys<IgdbTokens>>(
              field: K,
              start: ExtractQueryValue<IgdbTokens[K]>,
              end: ExtractQueryValue<IgdbTokens[K]>,
            ) => string;
            select: <K extends keyof IgdbTokens>(fields: K[]) => string;
            orderAsc: <K extends keyof IgdbTokens>(field: K) => string;
            orderDesc: <K extends keyof IgdbTokens>(field: K) => string;
            limit: (value: number) => string;
            offset: (value: number) => string;
            cursorAfter: (documentId: string) => string;
            cursorBefore: (documentId: string) => string;
            or: (...queries: string[]) => string;
            and: (...queries: string[]) => string;
          }) => string[];
          transactionId?: string;
        },
      ) => Promise<{ total: number; rows: IgdbTokens[] }>;
      deleteMany: (options?: {
        queries?: (q: {
          equal: <K extends QueryableKeys<IgdbTokens>>(
            field: K,
            value: ExtractQueryValue<IgdbTokens[K]>,
          ) => string;
          notEqual: <K extends QueryableKeys<IgdbTokens>>(
            field: K,
            value: ExtractQueryValue<IgdbTokens[K]>,
          ) => string;
          lessThan: <K extends QueryableKeys<IgdbTokens>>(
            field: K,
            value: ExtractQueryValue<IgdbTokens[K]>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<IgdbTokens>>(
            field: K,
            value: ExtractQueryValue<IgdbTokens[K]>,
          ) => string;
          greaterThan: <K extends QueryableKeys<IgdbTokens>>(
            field: K,
            value: ExtractQueryValue<IgdbTokens[K]>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<IgdbTokens>>(
            field: K,
            value: ExtractQueryValue<IgdbTokens[K]>,
          ) => string;
          contains: <K extends QueryableKeys<IgdbTokens>>(
            field: K,
            value: ExtractQueryValue<IgdbTokens[K]>,
          ) => string;
          search: <K extends QueryableKeys<IgdbTokens>>(
            field: K,
            value: string,
          ) => string;
          isNull: <K extends QueryableKeys<IgdbTokens>>(field: K) => string;
          isNotNull: <K extends QueryableKeys<IgdbTokens>>(field: K) => string;
          startsWith: <K extends QueryableKeys<IgdbTokens>>(
            field: K,
            value: string,
          ) => string;
          endsWith: <K extends QueryableKeys<IgdbTokens>>(
            field: K,
            value: string,
          ) => string;
          between: <K extends QueryableKeys<IgdbTokens>>(
            field: K,
            start: ExtractQueryValue<IgdbTokens[K]>,
            end: ExtractQueryValue<IgdbTokens[K]>,
          ) => string;
          select: <K extends keyof IgdbTokens>(fields: K[]) => string;
          orderAsc: <K extends keyof IgdbTokens>(field: K) => string;
          orderDesc: <K extends keyof IgdbTokens>(field: K) => string;
          limit: (value: number) => string;
          offset: (value: number) => string;
          cursorAfter: (documentId: string) => string;
          cursorBefore: (documentId: string) => string;
          or: (...queries: string[]) => string;
          and: (...queries: string[]) => string;
        }) => string[];
        transactionId?: string;
      }) => Promise<{ total: number; rows: IgdbTokens[] }>;
    };
    Games: {
      create: (
        data: {
          name: string;
          slug: string;
          coverUrl?: string | null;
          releaseYear?: string | null;
          summary?: string | null;
          externalReference: number;
          gameType?:
            | (GameTypesCreate & { $id?: string; $permissions?: string[] })
            | string;
          similarGames?: string[] | null;
          checksum?: string | null;
          releaseDate?: string | null;
          genres?: (
            | (GenresCreate & { $id?: string; $permissions?: string[] })
            | string
          )[];
          involvedCompanies?: (
            | (CompaniesCreate & { $id?: string; $permissions?: string[] })
            | string
          )[];
          syncedAt?: string | null;
          zStats?:
            | (ZEntryCountCreate & { $id?: string; $permissions?: string[] })
            | string;
          syncStatus?: string | null;
          ratingAvg?: number;
          ratingCount?: number;
          ratingSum?: number;
        },
        options?: {
          rowId?: string;
          permissions?: (
            permission: {
              read: (role: RoleString) => string;
              write: (role: RoleString) => string;
              create: (role: RoleString) => string;
              update: (role: RoleString) => string;
              delete: (role: RoleString) => string;
            },
            role: {
              any: () => RoleString;
              user: (userId: string, status?: string) => RoleString;
              users: (status?: string) => RoleString;
              guests: () => RoleString;
              team: (teamId: string, role?: string) => RoleString;
              member: (memberId: string) => RoleString;
              label: (label: string) => RoleString;
            },
          ) => string[];
          transactionId?: string;
        },
      ) => Promise<Games>;
      get: (id: string) => Promise<Games>;
      update: (
        id: string,
        data: Partial<{
          name: string;
          slug: string;
          coverUrl?: string | null;
          releaseYear?: string | null;
          summary?: string | null;
          externalReference: number;
          gameType?:
            | (GameTypesCreate & { $id?: string; $permissions?: string[] })
            | string;
          similarGames?: string[] | null;
          checksum?: string | null;
          releaseDate?: string | null;
          genres?: (
            | (GenresCreate & { $id?: string; $permissions?: string[] })
            | string
          )[];
          involvedCompanies?: (
            | (CompaniesCreate & { $id?: string; $permissions?: string[] })
            | string
          )[];
          syncedAt?: string | null;
          zStats?:
            | (ZEntryCountCreate & { $id?: string; $permissions?: string[] })
            | string;
          syncStatus?: string | null;
          ratingAvg?: number;
          ratingCount?: number;
          ratingSum?: number;
        }>,
        options?: {
          permissions?: (
            permission: {
              read: (role: RoleString) => string;
              write: (role: RoleString) => string;
              create: (role: RoleString) => string;
              update: (role: RoleString) => string;
              delete: (role: RoleString) => string;
            },
            role: {
              any: () => RoleString;
              user: (userId: string, status?: string) => RoleString;
              users: (status?: string) => RoleString;
              guests: () => RoleString;
              team: (teamId: string, role?: string) => RoleString;
              member: (memberId: string) => RoleString;
              label: (label: string) => RoleString;
            },
          ) => string[];
          transactionId?: string;
        },
      ) => Promise<Games>;
      delete: (
        id: string,
        options?: { transactionId?: string },
      ) => Promise<void>;
      list: (options?: {
        queries?: (q: {
          equal: <K extends QueryableKeys<Games>>(
            field: K,
            value: ExtractQueryValue<Games[K]>,
          ) => string;
          notEqual: <K extends QueryableKeys<Games>>(
            field: K,
            value: ExtractQueryValue<Games[K]>,
          ) => string;
          lessThan: <K extends QueryableKeys<Games>>(
            field: K,
            value: ExtractQueryValue<Games[K]>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<Games>>(
            field: K,
            value: ExtractQueryValue<Games[K]>,
          ) => string;
          greaterThan: <K extends QueryableKeys<Games>>(
            field: K,
            value: ExtractQueryValue<Games[K]>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<Games>>(
            field: K,
            value: ExtractQueryValue<Games[K]>,
          ) => string;
          contains: <K extends QueryableKeys<Games>>(
            field: K,
            value: ExtractQueryValue<Games[K]>,
          ) => string;
          search: <K extends QueryableKeys<Games>>(
            field: K,
            value: string,
          ) => string;
          isNull: <K extends QueryableKeys<Games>>(field: K) => string;
          isNotNull: <K extends QueryableKeys<Games>>(field: K) => string;
          startsWith: <K extends QueryableKeys<Games>>(
            field: K,
            value: string,
          ) => string;
          endsWith: <K extends QueryableKeys<Games>>(
            field: K,
            value: string,
          ) => string;
          between: <K extends QueryableKeys<Games>>(
            field: K,
            start: ExtractQueryValue<Games[K]>,
            end: ExtractQueryValue<Games[K]>,
          ) => string;
          select: <K extends keyof Games>(fields: K[]) => string;
          orderAsc: <K extends keyof Games>(field: K) => string;
          orderDesc: <K extends keyof Games>(field: K) => string;
          limit: (value: number) => string;
          offset: (value: number) => string;
          cursorAfter: (documentId: string) => string;
          cursorBefore: (documentId: string) => string;
          or: (...queries: string[]) => string;
          and: (...queries: string[]) => string;
        }) => string[];
      }) => Promise<{ total: number; rows: Games[] }>;
    };
    'Game Types': {
      create: (
        data: {
          type: string;
          checksum?: string | null;
        },
        options?: {
          rowId?: string;
          permissions?: (
            permission: {
              read: (role: RoleString) => string;
              write: (role: RoleString) => string;
              create: (role: RoleString) => string;
              update: (role: RoleString) => string;
              delete: (role: RoleString) => string;
            },
            role: {
              any: () => RoleString;
              user: (userId: string, status?: string) => RoleString;
              users: (status?: string) => RoleString;
              guests: () => RoleString;
              team: (teamId: string, role?: string) => RoleString;
              member: (memberId: string) => RoleString;
              label: (label: string) => RoleString;
            },
          ) => string[];
          transactionId?: string;
        },
      ) => Promise<GameTypes>;
      get: (id: string) => Promise<GameTypes>;
      update: (
        id: string,
        data: Partial<{
          type: string;
          checksum?: string | null;
        }>,
        options?: {
          permissions?: (
            permission: {
              read: (role: RoleString) => string;
              write: (role: RoleString) => string;
              create: (role: RoleString) => string;
              update: (role: RoleString) => string;
              delete: (role: RoleString) => string;
            },
            role: {
              any: () => RoleString;
              user: (userId: string, status?: string) => RoleString;
              users: (status?: string) => RoleString;
              guests: () => RoleString;
              team: (teamId: string, role?: string) => RoleString;
              member: (memberId: string) => RoleString;
              label: (label: string) => RoleString;
            },
          ) => string[];
          transactionId?: string;
        },
      ) => Promise<GameTypes>;
      delete: (
        id: string,
        options?: { transactionId?: string },
      ) => Promise<void>;
      list: (options?: {
        queries?: (q: {
          equal: <K extends QueryableKeys<GameTypes>>(
            field: K,
            value: ExtractQueryValue<GameTypes[K]>,
          ) => string;
          notEqual: <K extends QueryableKeys<GameTypes>>(
            field: K,
            value: ExtractQueryValue<GameTypes[K]>,
          ) => string;
          lessThan: <K extends QueryableKeys<GameTypes>>(
            field: K,
            value: ExtractQueryValue<GameTypes[K]>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<GameTypes>>(
            field: K,
            value: ExtractQueryValue<GameTypes[K]>,
          ) => string;
          greaterThan: <K extends QueryableKeys<GameTypes>>(
            field: K,
            value: ExtractQueryValue<GameTypes[K]>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<GameTypes>>(
            field: K,
            value: ExtractQueryValue<GameTypes[K]>,
          ) => string;
          contains: <K extends QueryableKeys<GameTypes>>(
            field: K,
            value: ExtractQueryValue<GameTypes[K]>,
          ) => string;
          search: <K extends QueryableKeys<GameTypes>>(
            field: K,
            value: string,
          ) => string;
          isNull: <K extends QueryableKeys<GameTypes>>(field: K) => string;
          isNotNull: <K extends QueryableKeys<GameTypes>>(field: K) => string;
          startsWith: <K extends QueryableKeys<GameTypes>>(
            field: K,
            value: string,
          ) => string;
          endsWith: <K extends QueryableKeys<GameTypes>>(
            field: K,
            value: string,
          ) => string;
          between: <K extends QueryableKeys<GameTypes>>(
            field: K,
            start: ExtractQueryValue<GameTypes[K]>,
            end: ExtractQueryValue<GameTypes[K]>,
          ) => string;
          select: <K extends keyof GameTypes>(fields: K[]) => string;
          orderAsc: <K extends keyof GameTypes>(field: K) => string;
          orderDesc: <K extends keyof GameTypes>(field: K) => string;
          limit: (value: number) => string;
          offset: (value: number) => string;
          cursorAfter: (documentId: string) => string;
          cursorBefore: (documentId: string) => string;
          or: (...queries: string[]) => string;
          and: (...queries: string[]) => string;
        }) => string[];
      }) => Promise<{ total: number; rows: GameTypes[] }>;
      createMany: (
        rows: Array<
          {
            type: string;
            checksum?: string | null;
          } & { $id?: string; $permissions?: string[] }
        >,
        options?: { transactionId?: string },
      ) => Promise<{ total: number; rows: GameTypes[] }>;
      updateMany: (
        data: Partial<{
          type: string;
          checksum?: string | null;
        }>,
        options?: {
          queries?: (q: {
            equal: <K extends QueryableKeys<GameTypes>>(
              field: K,
              value: ExtractQueryValue<GameTypes[K]>,
            ) => string;
            notEqual: <K extends QueryableKeys<GameTypes>>(
              field: K,
              value: ExtractQueryValue<GameTypes[K]>,
            ) => string;
            lessThan: <K extends QueryableKeys<GameTypes>>(
              field: K,
              value: ExtractQueryValue<GameTypes[K]>,
            ) => string;
            lessThanEqual: <K extends QueryableKeys<GameTypes>>(
              field: K,
              value: ExtractQueryValue<GameTypes[K]>,
            ) => string;
            greaterThan: <K extends QueryableKeys<GameTypes>>(
              field: K,
              value: ExtractQueryValue<GameTypes[K]>,
            ) => string;
            greaterThanEqual: <K extends QueryableKeys<GameTypes>>(
              field: K,
              value: ExtractQueryValue<GameTypes[K]>,
            ) => string;
            contains: <K extends QueryableKeys<GameTypes>>(
              field: K,
              value: ExtractQueryValue<GameTypes[K]>,
            ) => string;
            search: <K extends QueryableKeys<GameTypes>>(
              field: K,
              value: string,
            ) => string;
            isNull: <K extends QueryableKeys<GameTypes>>(field: K) => string;
            isNotNull: <K extends QueryableKeys<GameTypes>>(field: K) => string;
            startsWith: <K extends QueryableKeys<GameTypes>>(
              field: K,
              value: string,
            ) => string;
            endsWith: <K extends QueryableKeys<GameTypes>>(
              field: K,
              value: string,
            ) => string;
            between: <K extends QueryableKeys<GameTypes>>(
              field: K,
              start: ExtractQueryValue<GameTypes[K]>,
              end: ExtractQueryValue<GameTypes[K]>,
            ) => string;
            select: <K extends keyof GameTypes>(fields: K[]) => string;
            orderAsc: <K extends keyof GameTypes>(field: K) => string;
            orderDesc: <K extends keyof GameTypes>(field: K) => string;
            limit: (value: number) => string;
            offset: (value: number) => string;
            cursorAfter: (documentId: string) => string;
            cursorBefore: (documentId: string) => string;
            or: (...queries: string[]) => string;
            and: (...queries: string[]) => string;
          }) => string[];
          transactionId?: string;
        },
      ) => Promise<{ total: number; rows: GameTypes[] }>;
      deleteMany: (options?: {
        queries?: (q: {
          equal: <K extends QueryableKeys<GameTypes>>(
            field: K,
            value: ExtractQueryValue<GameTypes[K]>,
          ) => string;
          notEqual: <K extends QueryableKeys<GameTypes>>(
            field: K,
            value: ExtractQueryValue<GameTypes[K]>,
          ) => string;
          lessThan: <K extends QueryableKeys<GameTypes>>(
            field: K,
            value: ExtractQueryValue<GameTypes[K]>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<GameTypes>>(
            field: K,
            value: ExtractQueryValue<GameTypes[K]>,
          ) => string;
          greaterThan: <K extends QueryableKeys<GameTypes>>(
            field: K,
            value: ExtractQueryValue<GameTypes[K]>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<GameTypes>>(
            field: K,
            value: ExtractQueryValue<GameTypes[K]>,
          ) => string;
          contains: <K extends QueryableKeys<GameTypes>>(
            field: K,
            value: ExtractQueryValue<GameTypes[K]>,
          ) => string;
          search: <K extends QueryableKeys<GameTypes>>(
            field: K,
            value: string,
          ) => string;
          isNull: <K extends QueryableKeys<GameTypes>>(field: K) => string;
          isNotNull: <K extends QueryableKeys<GameTypes>>(field: K) => string;
          startsWith: <K extends QueryableKeys<GameTypes>>(
            field: K,
            value: string,
          ) => string;
          endsWith: <K extends QueryableKeys<GameTypes>>(
            field: K,
            value: string,
          ) => string;
          between: <K extends QueryableKeys<GameTypes>>(
            field: K,
            start: ExtractQueryValue<GameTypes[K]>,
            end: ExtractQueryValue<GameTypes[K]>,
          ) => string;
          select: <K extends keyof GameTypes>(fields: K[]) => string;
          orderAsc: <K extends keyof GameTypes>(field: K) => string;
          orderDesc: <K extends keyof GameTypes>(field: K) => string;
          limit: (value: number) => string;
          offset: (value: number) => string;
          cursorAfter: (documentId: string) => string;
          cursorBefore: (documentId: string) => string;
          or: (...queries: string[]) => string;
          and: (...queries: string[]) => string;
        }) => string[];
        transactionId?: string;
      }) => Promise<{ total: number; rows: GameTypes[] }>;
    };
    'User Profiles': {
      create: (
        data: {
          userId: string;
          gamertag: string;
          avatarUrl?: string | null;
          bio?: string | null;
          totalsCompleted?: number;
          totalsBacklog?: number;
          totalsDropped?: number;
          totalsPlaying?: number;
          totalsWishlist?: number;
          fingerprint: string;
        },
        options?: {
          rowId?: string;
          permissions?: (
            permission: {
              read: (role: RoleString) => string;
              write: (role: RoleString) => string;
              create: (role: RoleString) => string;
              update: (role: RoleString) => string;
              delete: (role: RoleString) => string;
            },
            role: {
              any: () => RoleString;
              user: (userId: string, status?: string) => RoleString;
              users: (status?: string) => RoleString;
              guests: () => RoleString;
              team: (teamId: string, role?: string) => RoleString;
              member: (memberId: string) => RoleString;
              label: (label: string) => RoleString;
            },
          ) => string[];
          transactionId?: string;
        },
      ) => Promise<UserProfiles>;
      get: (id: string) => Promise<UserProfiles>;
      update: (
        id: string,
        data: Partial<{
          userId: string;
          gamertag: string;
          avatarUrl?: string | null;
          bio?: string | null;
          totalsCompleted?: number;
          totalsBacklog?: number;
          totalsDropped?: number;
          totalsPlaying?: number;
          totalsWishlist?: number;
          fingerprint: string;
        }>,
        options?: {
          permissions?: (
            permission: {
              read: (role: RoleString) => string;
              write: (role: RoleString) => string;
              create: (role: RoleString) => string;
              update: (role: RoleString) => string;
              delete: (role: RoleString) => string;
            },
            role: {
              any: () => RoleString;
              user: (userId: string, status?: string) => RoleString;
              users: (status?: string) => RoleString;
              guests: () => RoleString;
              team: (teamId: string, role?: string) => RoleString;
              member: (memberId: string) => RoleString;
              label: (label: string) => RoleString;
            },
          ) => string[];
          transactionId?: string;
        },
      ) => Promise<UserProfiles>;
      delete: (
        id: string,
        options?: { transactionId?: string },
      ) => Promise<void>;
      list: (options?: {
        queries?: (q: {
          equal: <K extends QueryableKeys<UserProfiles>>(
            field: K,
            value: ExtractQueryValue<UserProfiles[K]>,
          ) => string;
          notEqual: <K extends QueryableKeys<UserProfiles>>(
            field: K,
            value: ExtractQueryValue<UserProfiles[K]>,
          ) => string;
          lessThan: <K extends QueryableKeys<UserProfiles>>(
            field: K,
            value: ExtractQueryValue<UserProfiles[K]>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<UserProfiles>>(
            field: K,
            value: ExtractQueryValue<UserProfiles[K]>,
          ) => string;
          greaterThan: <K extends QueryableKeys<UserProfiles>>(
            field: K,
            value: ExtractQueryValue<UserProfiles[K]>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<UserProfiles>>(
            field: K,
            value: ExtractQueryValue<UserProfiles[K]>,
          ) => string;
          contains: <K extends QueryableKeys<UserProfiles>>(
            field: K,
            value: ExtractQueryValue<UserProfiles[K]>,
          ) => string;
          search: <K extends QueryableKeys<UserProfiles>>(
            field: K,
            value: string,
          ) => string;
          isNull: <K extends QueryableKeys<UserProfiles>>(field: K) => string;
          isNotNull: <K extends QueryableKeys<UserProfiles>>(
            field: K,
          ) => string;
          startsWith: <K extends QueryableKeys<UserProfiles>>(
            field: K,
            value: string,
          ) => string;
          endsWith: <K extends QueryableKeys<UserProfiles>>(
            field: K,
            value: string,
          ) => string;
          between: <K extends QueryableKeys<UserProfiles>>(
            field: K,
            start: ExtractQueryValue<UserProfiles[K]>,
            end: ExtractQueryValue<UserProfiles[K]>,
          ) => string;
          select: <K extends keyof UserProfiles>(fields: K[]) => string;
          orderAsc: <K extends keyof UserProfiles>(field: K) => string;
          orderDesc: <K extends keyof UserProfiles>(field: K) => string;
          limit: (value: number) => string;
          offset: (value: number) => string;
          cursorAfter: (documentId: string) => string;
          cursorBefore: (documentId: string) => string;
          or: (...queries: string[]) => string;
          and: (...queries: string[]) => string;
        }) => string[];
      }) => Promise<{ total: number; rows: UserProfiles[] }>;
      createMany: (
        rows: Array<
          {
            userId: string;
            gamertag: string;
            avatarUrl?: string | null;
            bio?: string | null;
            totalsCompleted?: number;
            totalsBacklog?: number;
            totalsDropped?: number;
            totalsPlaying?: number;
            totalsWishlist?: number;
            fingerprint: string;
          } & { $id?: string; $permissions?: string[] }
        >,
        options?: { transactionId?: string },
      ) => Promise<{ total: number; rows: UserProfiles[] }>;
      updateMany: (
        data: Partial<{
          userId: string;
          gamertag: string;
          avatarUrl?: string | null;
          bio?: string | null;
          totalsCompleted?: number;
          totalsBacklog?: number;
          totalsDropped?: number;
          totalsPlaying?: number;
          totalsWishlist?: number;
          fingerprint: string;
        }>,
        options?: {
          queries?: (q: {
            equal: <K extends QueryableKeys<UserProfiles>>(
              field: K,
              value: ExtractQueryValue<UserProfiles[K]>,
            ) => string;
            notEqual: <K extends QueryableKeys<UserProfiles>>(
              field: K,
              value: ExtractQueryValue<UserProfiles[K]>,
            ) => string;
            lessThan: <K extends QueryableKeys<UserProfiles>>(
              field: K,
              value: ExtractQueryValue<UserProfiles[K]>,
            ) => string;
            lessThanEqual: <K extends QueryableKeys<UserProfiles>>(
              field: K,
              value: ExtractQueryValue<UserProfiles[K]>,
            ) => string;
            greaterThan: <K extends QueryableKeys<UserProfiles>>(
              field: K,
              value: ExtractQueryValue<UserProfiles[K]>,
            ) => string;
            greaterThanEqual: <K extends QueryableKeys<UserProfiles>>(
              field: K,
              value: ExtractQueryValue<UserProfiles[K]>,
            ) => string;
            contains: <K extends QueryableKeys<UserProfiles>>(
              field: K,
              value: ExtractQueryValue<UserProfiles[K]>,
            ) => string;
            search: <K extends QueryableKeys<UserProfiles>>(
              field: K,
              value: string,
            ) => string;
            isNull: <K extends QueryableKeys<UserProfiles>>(field: K) => string;
            isNotNull: <K extends QueryableKeys<UserProfiles>>(
              field: K,
            ) => string;
            startsWith: <K extends QueryableKeys<UserProfiles>>(
              field: K,
              value: string,
            ) => string;
            endsWith: <K extends QueryableKeys<UserProfiles>>(
              field: K,
              value: string,
            ) => string;
            between: <K extends QueryableKeys<UserProfiles>>(
              field: K,
              start: ExtractQueryValue<UserProfiles[K]>,
              end: ExtractQueryValue<UserProfiles[K]>,
            ) => string;
            select: <K extends keyof UserProfiles>(fields: K[]) => string;
            orderAsc: <K extends keyof UserProfiles>(field: K) => string;
            orderDesc: <K extends keyof UserProfiles>(field: K) => string;
            limit: (value: number) => string;
            offset: (value: number) => string;
            cursorAfter: (documentId: string) => string;
            cursorBefore: (documentId: string) => string;
            or: (...queries: string[]) => string;
            and: (...queries: string[]) => string;
          }) => string[];
          transactionId?: string;
        },
      ) => Promise<{ total: number; rows: UserProfiles[] }>;
      deleteMany: (options?: {
        queries?: (q: {
          equal: <K extends QueryableKeys<UserProfiles>>(
            field: K,
            value: ExtractQueryValue<UserProfiles[K]>,
          ) => string;
          notEqual: <K extends QueryableKeys<UserProfiles>>(
            field: K,
            value: ExtractQueryValue<UserProfiles[K]>,
          ) => string;
          lessThan: <K extends QueryableKeys<UserProfiles>>(
            field: K,
            value: ExtractQueryValue<UserProfiles[K]>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<UserProfiles>>(
            field: K,
            value: ExtractQueryValue<UserProfiles[K]>,
          ) => string;
          greaterThan: <K extends QueryableKeys<UserProfiles>>(
            field: K,
            value: ExtractQueryValue<UserProfiles[K]>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<UserProfiles>>(
            field: K,
            value: ExtractQueryValue<UserProfiles[K]>,
          ) => string;
          contains: <K extends QueryableKeys<UserProfiles>>(
            field: K,
            value: ExtractQueryValue<UserProfiles[K]>,
          ) => string;
          search: <K extends QueryableKeys<UserProfiles>>(
            field: K,
            value: string,
          ) => string;
          isNull: <K extends QueryableKeys<UserProfiles>>(field: K) => string;
          isNotNull: <K extends QueryableKeys<UserProfiles>>(
            field: K,
          ) => string;
          startsWith: <K extends QueryableKeys<UserProfiles>>(
            field: K,
            value: string,
          ) => string;
          endsWith: <K extends QueryableKeys<UserProfiles>>(
            field: K,
            value: string,
          ) => string;
          between: <K extends QueryableKeys<UserProfiles>>(
            field: K,
            start: ExtractQueryValue<UserProfiles[K]>,
            end: ExtractQueryValue<UserProfiles[K]>,
          ) => string;
          select: <K extends keyof UserProfiles>(fields: K[]) => string;
          orderAsc: <K extends keyof UserProfiles>(field: K) => string;
          orderDesc: <K extends keyof UserProfiles>(field: K) => string;
          limit: (value: number) => string;
          offset: (value: number) => string;
          cursorAfter: (documentId: string) => string;
          cursorBefore: (documentId: string) => string;
          or: (...queries: string[]) => string;
          and: (...queries: string[]) => string;
        }) => string[];
        transactionId?: string;
      }) => Promise<{ total: number; rows: UserProfiles[] }>;
    };
    'Z Entries': {
      create: (
        data: {
          status?: ZEntriesStatus | null;
          liked?: boolean | null;
          gameId: string;
          ownerFingerprint: string;
          processedAt?: string | null;
        },
        options?: {
          rowId?: string;
          permissions?: (
            permission: {
              read: (role: RoleString) => string;
              write: (role: RoleString) => string;
              create: (role: RoleString) => string;
              update: (role: RoleString) => string;
              delete: (role: RoleString) => string;
            },
            role: {
              any: () => RoleString;
              user: (userId: string, status?: string) => RoleString;
              users: (status?: string) => RoleString;
              guests: () => RoleString;
              team: (teamId: string, role?: string) => RoleString;
              member: (memberId: string) => RoleString;
              label: (label: string) => RoleString;
            },
          ) => string[];
          transactionId?: string;
        },
      ) => Promise<ZEntries>;
      get: (id: string) => Promise<ZEntries>;
      update: (
        id: string,
        data: Partial<{
          status?: ZEntriesStatus | null;
          liked?: boolean | null;
          gameId: string;
          ownerFingerprint: string;
          processedAt?: string | null;
        }>,
        options?: {
          permissions?: (
            permission: {
              read: (role: RoleString) => string;
              write: (role: RoleString) => string;
              create: (role: RoleString) => string;
              update: (role: RoleString) => string;
              delete: (role: RoleString) => string;
            },
            role: {
              any: () => RoleString;
              user: (userId: string, status?: string) => RoleString;
              users: (status?: string) => RoleString;
              guests: () => RoleString;
              team: (teamId: string, role?: string) => RoleString;
              member: (memberId: string) => RoleString;
              label: (label: string) => RoleString;
            },
          ) => string[];
          transactionId?: string;
        },
      ) => Promise<ZEntries>;
      delete: (
        id: string,
        options?: { transactionId?: string },
      ) => Promise<void>;
      list: (options?: {
        queries?: (q: {
          equal: <K extends QueryableKeys<ZEntries>>(
            field: K,
            value: ExtractQueryValue<ZEntries[K]>,
          ) => string;
          notEqual: <K extends QueryableKeys<ZEntries>>(
            field: K,
            value: ExtractQueryValue<ZEntries[K]>,
          ) => string;
          lessThan: <K extends QueryableKeys<ZEntries>>(
            field: K,
            value: ExtractQueryValue<ZEntries[K]>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<ZEntries>>(
            field: K,
            value: ExtractQueryValue<ZEntries[K]>,
          ) => string;
          greaterThan: <K extends QueryableKeys<ZEntries>>(
            field: K,
            value: ExtractQueryValue<ZEntries[K]>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<ZEntries>>(
            field: K,
            value: ExtractQueryValue<ZEntries[K]>,
          ) => string;
          contains: <K extends QueryableKeys<ZEntries>>(
            field: K,
            value: ExtractQueryValue<ZEntries[K]>,
          ) => string;
          search: <K extends QueryableKeys<ZEntries>>(
            field: K,
            value: string,
          ) => string;
          isNull: <K extends QueryableKeys<ZEntries>>(field: K) => string;
          isNotNull: <K extends QueryableKeys<ZEntries>>(field: K) => string;
          startsWith: <K extends QueryableKeys<ZEntries>>(
            field: K,
            value: string,
          ) => string;
          endsWith: <K extends QueryableKeys<ZEntries>>(
            field: K,
            value: string,
          ) => string;
          between: <K extends QueryableKeys<ZEntries>>(
            field: K,
            start: ExtractQueryValue<ZEntries[K]>,
            end: ExtractQueryValue<ZEntries[K]>,
          ) => string;
          select: <K extends keyof ZEntries>(fields: K[]) => string;
          orderAsc: <K extends keyof ZEntries>(field: K) => string;
          orderDesc: <K extends keyof ZEntries>(field: K) => string;
          limit: (value: number) => string;
          offset: (value: number) => string;
          cursorAfter: (documentId: string) => string;
          cursorBefore: (documentId: string) => string;
          or: (...queries: string[]) => string;
          and: (...queries: string[]) => string;
        }) => string[];
      }) => Promise<{ total: number; rows: ZEntries[] }>;
      createMany: (
        rows: Array<
          {
            status?: ZEntriesStatus | null;
            liked?: boolean | null;
            gameId: string;
            ownerFingerprint: string;
            processedAt?: string | null;
          } & { $id?: string; $permissions?: string[] }
        >,
        options?: { transactionId?: string },
      ) => Promise<{ total: number; rows: ZEntries[] }>;
      updateMany: (
        data: Partial<{
          status?: ZEntriesStatus | null;
          liked?: boolean | null;
          gameId: string;
          ownerFingerprint: string;
          processedAt?: string | null;
        }>,
        options?: {
          queries?: (q: {
            equal: <K extends QueryableKeys<ZEntries>>(
              field: K,
              value: ExtractQueryValue<ZEntries[K]>,
            ) => string;
            notEqual: <K extends QueryableKeys<ZEntries>>(
              field: K,
              value: ExtractQueryValue<ZEntries[K]>,
            ) => string;
            lessThan: <K extends QueryableKeys<ZEntries>>(
              field: K,
              value: ExtractQueryValue<ZEntries[K]>,
            ) => string;
            lessThanEqual: <K extends QueryableKeys<ZEntries>>(
              field: K,
              value: ExtractQueryValue<ZEntries[K]>,
            ) => string;
            greaterThan: <K extends QueryableKeys<ZEntries>>(
              field: K,
              value: ExtractQueryValue<ZEntries[K]>,
            ) => string;
            greaterThanEqual: <K extends QueryableKeys<ZEntries>>(
              field: K,
              value: ExtractQueryValue<ZEntries[K]>,
            ) => string;
            contains: <K extends QueryableKeys<ZEntries>>(
              field: K,
              value: ExtractQueryValue<ZEntries[K]>,
            ) => string;
            search: <K extends QueryableKeys<ZEntries>>(
              field: K,
              value: string,
            ) => string;
            isNull: <K extends QueryableKeys<ZEntries>>(field: K) => string;
            isNotNull: <K extends QueryableKeys<ZEntries>>(field: K) => string;
            startsWith: <K extends QueryableKeys<ZEntries>>(
              field: K,
              value: string,
            ) => string;
            endsWith: <K extends QueryableKeys<ZEntries>>(
              field: K,
              value: string,
            ) => string;
            between: <K extends QueryableKeys<ZEntries>>(
              field: K,
              start: ExtractQueryValue<ZEntries[K]>,
              end: ExtractQueryValue<ZEntries[K]>,
            ) => string;
            select: <K extends keyof ZEntries>(fields: K[]) => string;
            orderAsc: <K extends keyof ZEntries>(field: K) => string;
            orderDesc: <K extends keyof ZEntries>(field: K) => string;
            limit: (value: number) => string;
            offset: (value: number) => string;
            cursorAfter: (documentId: string) => string;
            cursorBefore: (documentId: string) => string;
            or: (...queries: string[]) => string;
            and: (...queries: string[]) => string;
          }) => string[];
          transactionId?: string;
        },
      ) => Promise<{ total: number; rows: ZEntries[] }>;
      deleteMany: (options?: {
        queries?: (q: {
          equal: <K extends QueryableKeys<ZEntries>>(
            field: K,
            value: ExtractQueryValue<ZEntries[K]>,
          ) => string;
          notEqual: <K extends QueryableKeys<ZEntries>>(
            field: K,
            value: ExtractQueryValue<ZEntries[K]>,
          ) => string;
          lessThan: <K extends QueryableKeys<ZEntries>>(
            field: K,
            value: ExtractQueryValue<ZEntries[K]>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<ZEntries>>(
            field: K,
            value: ExtractQueryValue<ZEntries[K]>,
          ) => string;
          greaterThan: <K extends QueryableKeys<ZEntries>>(
            field: K,
            value: ExtractQueryValue<ZEntries[K]>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<ZEntries>>(
            field: K,
            value: ExtractQueryValue<ZEntries[K]>,
          ) => string;
          contains: <K extends QueryableKeys<ZEntries>>(
            field: K,
            value: ExtractQueryValue<ZEntries[K]>,
          ) => string;
          search: <K extends QueryableKeys<ZEntries>>(
            field: K,
            value: string,
          ) => string;
          isNull: <K extends QueryableKeys<ZEntries>>(field: K) => string;
          isNotNull: <K extends QueryableKeys<ZEntries>>(field: K) => string;
          startsWith: <K extends QueryableKeys<ZEntries>>(
            field: K,
            value: string,
          ) => string;
          endsWith: <K extends QueryableKeys<ZEntries>>(
            field: K,
            value: string,
          ) => string;
          between: <K extends QueryableKeys<ZEntries>>(
            field: K,
            start: ExtractQueryValue<ZEntries[K]>,
            end: ExtractQueryValue<ZEntries[K]>,
          ) => string;
          select: <K extends keyof ZEntries>(fields: K[]) => string;
          orderAsc: <K extends keyof ZEntries>(field: K) => string;
          orderDesc: <K extends keyof ZEntries>(field: K) => string;
          limit: (value: number) => string;
          offset: (value: number) => string;
          cursorAfter: (documentId: string) => string;
          cursorBefore: (documentId: string) => string;
          or: (...queries: string[]) => string;
          and: (...queries: string[]) => string;
        }) => string[];
        transactionId?: string;
      }) => Promise<{ total: number; rows: ZEntries[] }>;
    };
    Genres: {
      create: (
        data: {
          name: string;
          slug: string;
          checksum: string;
          namePt?: string | null;
        },
        options?: {
          rowId?: string;
          permissions?: (
            permission: {
              read: (role: RoleString) => string;
              write: (role: RoleString) => string;
              create: (role: RoleString) => string;
              update: (role: RoleString) => string;
              delete: (role: RoleString) => string;
            },
            role: {
              any: () => RoleString;
              user: (userId: string, status?: string) => RoleString;
              users: (status?: string) => RoleString;
              guests: () => RoleString;
              team: (teamId: string, role?: string) => RoleString;
              member: (memberId: string) => RoleString;
              label: (label: string) => RoleString;
            },
          ) => string[];
          transactionId?: string;
        },
      ) => Promise<Genres>;
      get: (id: string) => Promise<Genres>;
      update: (
        id: string,
        data: Partial<{
          name: string;
          slug: string;
          checksum: string;
          namePt?: string | null;
        }>,
        options?: {
          permissions?: (
            permission: {
              read: (role: RoleString) => string;
              write: (role: RoleString) => string;
              create: (role: RoleString) => string;
              update: (role: RoleString) => string;
              delete: (role: RoleString) => string;
            },
            role: {
              any: () => RoleString;
              user: (userId: string, status?: string) => RoleString;
              users: (status?: string) => RoleString;
              guests: () => RoleString;
              team: (teamId: string, role?: string) => RoleString;
              member: (memberId: string) => RoleString;
              label: (label: string) => RoleString;
            },
          ) => string[];
          transactionId?: string;
        },
      ) => Promise<Genres>;
      delete: (
        id: string,
        options?: { transactionId?: string },
      ) => Promise<void>;
      list: (options?: {
        queries?: (q: {
          equal: <K extends QueryableKeys<Genres>>(
            field: K,
            value: ExtractQueryValue<Genres[K]>,
          ) => string;
          notEqual: <K extends QueryableKeys<Genres>>(
            field: K,
            value: ExtractQueryValue<Genres[K]>,
          ) => string;
          lessThan: <K extends QueryableKeys<Genres>>(
            field: K,
            value: ExtractQueryValue<Genres[K]>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<Genres>>(
            field: K,
            value: ExtractQueryValue<Genres[K]>,
          ) => string;
          greaterThan: <K extends QueryableKeys<Genres>>(
            field: K,
            value: ExtractQueryValue<Genres[K]>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<Genres>>(
            field: K,
            value: ExtractQueryValue<Genres[K]>,
          ) => string;
          contains: <K extends QueryableKeys<Genres>>(
            field: K,
            value: ExtractQueryValue<Genres[K]>,
          ) => string;
          search: <K extends QueryableKeys<Genres>>(
            field: K,
            value: string,
          ) => string;
          isNull: <K extends QueryableKeys<Genres>>(field: K) => string;
          isNotNull: <K extends QueryableKeys<Genres>>(field: K) => string;
          startsWith: <K extends QueryableKeys<Genres>>(
            field: K,
            value: string,
          ) => string;
          endsWith: <K extends QueryableKeys<Genres>>(
            field: K,
            value: string,
          ) => string;
          between: <K extends QueryableKeys<Genres>>(
            field: K,
            start: ExtractQueryValue<Genres[K]>,
            end: ExtractQueryValue<Genres[K]>,
          ) => string;
          select: <K extends keyof Genres>(fields: K[]) => string;
          orderAsc: <K extends keyof Genres>(field: K) => string;
          orderDesc: <K extends keyof Genres>(field: K) => string;
          limit: (value: number) => string;
          offset: (value: number) => string;
          cursorAfter: (documentId: string) => string;
          cursorBefore: (documentId: string) => string;
          or: (...queries: string[]) => string;
          and: (...queries: string[]) => string;
        }) => string[];
      }) => Promise<{ total: number; rows: Genres[] }>;
      createMany: (
        rows: Array<
          {
            name: string;
            slug: string;
            checksum: string;
            namePt?: string | null;
          } & { $id?: string; $permissions?: string[] }
        >,
        options?: { transactionId?: string },
      ) => Promise<{ total: number; rows: Genres[] }>;
      updateMany: (
        data: Partial<{
          name: string;
          slug: string;
          checksum: string;
          namePt?: string | null;
        }>,
        options?: {
          queries?: (q: {
            equal: <K extends QueryableKeys<Genres>>(
              field: K,
              value: ExtractQueryValue<Genres[K]>,
            ) => string;
            notEqual: <K extends QueryableKeys<Genres>>(
              field: K,
              value: ExtractQueryValue<Genres[K]>,
            ) => string;
            lessThan: <K extends QueryableKeys<Genres>>(
              field: K,
              value: ExtractQueryValue<Genres[K]>,
            ) => string;
            lessThanEqual: <K extends QueryableKeys<Genres>>(
              field: K,
              value: ExtractQueryValue<Genres[K]>,
            ) => string;
            greaterThan: <K extends QueryableKeys<Genres>>(
              field: K,
              value: ExtractQueryValue<Genres[K]>,
            ) => string;
            greaterThanEqual: <K extends QueryableKeys<Genres>>(
              field: K,
              value: ExtractQueryValue<Genres[K]>,
            ) => string;
            contains: <K extends QueryableKeys<Genres>>(
              field: K,
              value: ExtractQueryValue<Genres[K]>,
            ) => string;
            search: <K extends QueryableKeys<Genres>>(
              field: K,
              value: string,
            ) => string;
            isNull: <K extends QueryableKeys<Genres>>(field: K) => string;
            isNotNull: <K extends QueryableKeys<Genres>>(field: K) => string;
            startsWith: <K extends QueryableKeys<Genres>>(
              field: K,
              value: string,
            ) => string;
            endsWith: <K extends QueryableKeys<Genres>>(
              field: K,
              value: string,
            ) => string;
            between: <K extends QueryableKeys<Genres>>(
              field: K,
              start: ExtractQueryValue<Genres[K]>,
              end: ExtractQueryValue<Genres[K]>,
            ) => string;
            select: <K extends keyof Genres>(fields: K[]) => string;
            orderAsc: <K extends keyof Genres>(field: K) => string;
            orderDesc: <K extends keyof Genres>(field: K) => string;
            limit: (value: number) => string;
            offset: (value: number) => string;
            cursorAfter: (documentId: string) => string;
            cursorBefore: (documentId: string) => string;
            or: (...queries: string[]) => string;
            and: (...queries: string[]) => string;
          }) => string[];
          transactionId?: string;
        },
      ) => Promise<{ total: number; rows: Genres[] }>;
      deleteMany: (options?: {
        queries?: (q: {
          equal: <K extends QueryableKeys<Genres>>(
            field: K,
            value: ExtractQueryValue<Genres[K]>,
          ) => string;
          notEqual: <K extends QueryableKeys<Genres>>(
            field: K,
            value: ExtractQueryValue<Genres[K]>,
          ) => string;
          lessThan: <K extends QueryableKeys<Genres>>(
            field: K,
            value: ExtractQueryValue<Genres[K]>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<Genres>>(
            field: K,
            value: ExtractQueryValue<Genres[K]>,
          ) => string;
          greaterThan: <K extends QueryableKeys<Genres>>(
            field: K,
            value: ExtractQueryValue<Genres[K]>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<Genres>>(
            field: K,
            value: ExtractQueryValue<Genres[K]>,
          ) => string;
          contains: <K extends QueryableKeys<Genres>>(
            field: K,
            value: ExtractQueryValue<Genres[K]>,
          ) => string;
          search: <K extends QueryableKeys<Genres>>(
            field: K,
            value: string,
          ) => string;
          isNull: <K extends QueryableKeys<Genres>>(field: K) => string;
          isNotNull: <K extends QueryableKeys<Genres>>(field: K) => string;
          startsWith: <K extends QueryableKeys<Genres>>(
            field: K,
            value: string,
          ) => string;
          endsWith: <K extends QueryableKeys<Genres>>(
            field: K,
            value: string,
          ) => string;
          between: <K extends QueryableKeys<Genres>>(
            field: K,
            start: ExtractQueryValue<Genres[K]>,
            end: ExtractQueryValue<Genres[K]>,
          ) => string;
          select: <K extends keyof Genres>(fields: K[]) => string;
          orderAsc: <K extends keyof Genres>(field: K) => string;
          orderDesc: <K extends keyof Genres>(field: K) => string;
          limit: (value: number) => string;
          offset: (value: number) => string;
          cursorAfter: (documentId: string) => string;
          cursorBefore: (documentId: string) => string;
          or: (...queries: string[]) => string;
          and: (...queries: string[]) => string;
        }) => string[];
        transactionId?: string;
      }) => Promise<{ total: number; rows: Genres[] }>;
    };
    Companies: {
      create: (
        data: {
          name: string;
          checksum?: string | null;
          slug: string;
        },
        options?: {
          rowId?: string;
          permissions?: (
            permission: {
              read: (role: RoleString) => string;
              write: (role: RoleString) => string;
              create: (role: RoleString) => string;
              update: (role: RoleString) => string;
              delete: (role: RoleString) => string;
            },
            role: {
              any: () => RoleString;
              user: (userId: string, status?: string) => RoleString;
              users: (status?: string) => RoleString;
              guests: () => RoleString;
              team: (teamId: string, role?: string) => RoleString;
              member: (memberId: string) => RoleString;
              label: (label: string) => RoleString;
            },
          ) => string[];
          transactionId?: string;
        },
      ) => Promise<Companies>;
      get: (id: string) => Promise<Companies>;
      update: (
        id: string,
        data: Partial<{
          name: string;
          checksum?: string | null;
          slug: string;
        }>,
        options?: {
          permissions?: (
            permission: {
              read: (role: RoleString) => string;
              write: (role: RoleString) => string;
              create: (role: RoleString) => string;
              update: (role: RoleString) => string;
              delete: (role: RoleString) => string;
            },
            role: {
              any: () => RoleString;
              user: (userId: string, status?: string) => RoleString;
              users: (status?: string) => RoleString;
              guests: () => RoleString;
              team: (teamId: string, role?: string) => RoleString;
              member: (memberId: string) => RoleString;
              label: (label: string) => RoleString;
            },
          ) => string[];
          transactionId?: string;
        },
      ) => Promise<Companies>;
      delete: (
        id: string,
        options?: { transactionId?: string },
      ) => Promise<void>;
      list: (options?: {
        queries?: (q: {
          equal: <K extends QueryableKeys<Companies>>(
            field: K,
            value: ExtractQueryValue<Companies[K]>,
          ) => string;
          notEqual: <K extends QueryableKeys<Companies>>(
            field: K,
            value: ExtractQueryValue<Companies[K]>,
          ) => string;
          lessThan: <K extends QueryableKeys<Companies>>(
            field: K,
            value: ExtractQueryValue<Companies[K]>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<Companies>>(
            field: K,
            value: ExtractQueryValue<Companies[K]>,
          ) => string;
          greaterThan: <K extends QueryableKeys<Companies>>(
            field: K,
            value: ExtractQueryValue<Companies[K]>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<Companies>>(
            field: K,
            value: ExtractQueryValue<Companies[K]>,
          ) => string;
          contains: <K extends QueryableKeys<Companies>>(
            field: K,
            value: ExtractQueryValue<Companies[K]>,
          ) => string;
          search: <K extends QueryableKeys<Companies>>(
            field: K,
            value: string,
          ) => string;
          isNull: <K extends QueryableKeys<Companies>>(field: K) => string;
          isNotNull: <K extends QueryableKeys<Companies>>(field: K) => string;
          startsWith: <K extends QueryableKeys<Companies>>(
            field: K,
            value: string,
          ) => string;
          endsWith: <K extends QueryableKeys<Companies>>(
            field: K,
            value: string,
          ) => string;
          between: <K extends QueryableKeys<Companies>>(
            field: K,
            start: ExtractQueryValue<Companies[K]>,
            end: ExtractQueryValue<Companies[K]>,
          ) => string;
          select: <K extends keyof Companies>(fields: K[]) => string;
          orderAsc: <K extends keyof Companies>(field: K) => string;
          orderDesc: <K extends keyof Companies>(field: K) => string;
          limit: (value: number) => string;
          offset: (value: number) => string;
          cursorAfter: (documentId: string) => string;
          cursorBefore: (documentId: string) => string;
          or: (...queries: string[]) => string;
          and: (...queries: string[]) => string;
        }) => string[];
      }) => Promise<{ total: number; rows: Companies[] }>;
      createMany: (
        rows: Array<
          {
            name: string;
            checksum?: string | null;
            slug: string;
          } & { $id?: string; $permissions?: string[] }
        >,
        options?: { transactionId?: string },
      ) => Promise<{ total: number; rows: Companies[] }>;
      updateMany: (
        data: Partial<{
          name: string;
          checksum?: string | null;
          slug: string;
        }>,
        options?: {
          queries?: (q: {
            equal: <K extends QueryableKeys<Companies>>(
              field: K,
              value: ExtractQueryValue<Companies[K]>,
            ) => string;
            notEqual: <K extends QueryableKeys<Companies>>(
              field: K,
              value: ExtractQueryValue<Companies[K]>,
            ) => string;
            lessThan: <K extends QueryableKeys<Companies>>(
              field: K,
              value: ExtractQueryValue<Companies[K]>,
            ) => string;
            lessThanEqual: <K extends QueryableKeys<Companies>>(
              field: K,
              value: ExtractQueryValue<Companies[K]>,
            ) => string;
            greaterThan: <K extends QueryableKeys<Companies>>(
              field: K,
              value: ExtractQueryValue<Companies[K]>,
            ) => string;
            greaterThanEqual: <K extends QueryableKeys<Companies>>(
              field: K,
              value: ExtractQueryValue<Companies[K]>,
            ) => string;
            contains: <K extends QueryableKeys<Companies>>(
              field: K,
              value: ExtractQueryValue<Companies[K]>,
            ) => string;
            search: <K extends QueryableKeys<Companies>>(
              field: K,
              value: string,
            ) => string;
            isNull: <K extends QueryableKeys<Companies>>(field: K) => string;
            isNotNull: <K extends QueryableKeys<Companies>>(field: K) => string;
            startsWith: <K extends QueryableKeys<Companies>>(
              field: K,
              value: string,
            ) => string;
            endsWith: <K extends QueryableKeys<Companies>>(
              field: K,
              value: string,
            ) => string;
            between: <K extends QueryableKeys<Companies>>(
              field: K,
              start: ExtractQueryValue<Companies[K]>,
              end: ExtractQueryValue<Companies[K]>,
            ) => string;
            select: <K extends keyof Companies>(fields: K[]) => string;
            orderAsc: <K extends keyof Companies>(field: K) => string;
            orderDesc: <K extends keyof Companies>(field: K) => string;
            limit: (value: number) => string;
            offset: (value: number) => string;
            cursorAfter: (documentId: string) => string;
            cursorBefore: (documentId: string) => string;
            or: (...queries: string[]) => string;
            and: (...queries: string[]) => string;
          }) => string[];
          transactionId?: string;
        },
      ) => Promise<{ total: number; rows: Companies[] }>;
      deleteMany: (options?: {
        queries?: (q: {
          equal: <K extends QueryableKeys<Companies>>(
            field: K,
            value: ExtractQueryValue<Companies[K]>,
          ) => string;
          notEqual: <K extends QueryableKeys<Companies>>(
            field: K,
            value: ExtractQueryValue<Companies[K]>,
          ) => string;
          lessThan: <K extends QueryableKeys<Companies>>(
            field: K,
            value: ExtractQueryValue<Companies[K]>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<Companies>>(
            field: K,
            value: ExtractQueryValue<Companies[K]>,
          ) => string;
          greaterThan: <K extends QueryableKeys<Companies>>(
            field: K,
            value: ExtractQueryValue<Companies[K]>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<Companies>>(
            field: K,
            value: ExtractQueryValue<Companies[K]>,
          ) => string;
          contains: <K extends QueryableKeys<Companies>>(
            field: K,
            value: ExtractQueryValue<Companies[K]>,
          ) => string;
          search: <K extends QueryableKeys<Companies>>(
            field: K,
            value: string,
          ) => string;
          isNull: <K extends QueryableKeys<Companies>>(field: K) => string;
          isNotNull: <K extends QueryableKeys<Companies>>(field: K) => string;
          startsWith: <K extends QueryableKeys<Companies>>(
            field: K,
            value: string,
          ) => string;
          endsWith: <K extends QueryableKeys<Companies>>(
            field: K,
            value: string,
          ) => string;
          between: <K extends QueryableKeys<Companies>>(
            field: K,
            start: ExtractQueryValue<Companies[K]>,
            end: ExtractQueryValue<Companies[K]>,
          ) => string;
          select: <K extends keyof Companies>(fields: K[]) => string;
          orderAsc: <K extends keyof Companies>(field: K) => string;
          orderDesc: <K extends keyof Companies>(field: K) => string;
          limit: (value: number) => string;
          offset: (value: number) => string;
          cursorAfter: (documentId: string) => string;
          cursorBefore: (documentId: string) => string;
          or: (...queries: string[]) => string;
          and: (...queries: string[]) => string;
        }) => string[];
        transactionId?: string;
      }) => Promise<{ total: number; rows: Companies[] }>;
    };
    'Z Entry Count': {
      create: (
        data: {
          completedCount?: number;
          backlogCount?: number;
          droppedCount?: number;
          playingCount?: number;
          wishlistCount?: number;
          game?:
            | (GamesCreate & { $id?: string; $permissions?: string[] })
            | string;
          likes?: number;
        },
        options?: {
          rowId?: string;
          permissions?: (
            permission: {
              read: (role: RoleString) => string;
              write: (role: RoleString) => string;
              create: (role: RoleString) => string;
              update: (role: RoleString) => string;
              delete: (role: RoleString) => string;
            },
            role: {
              any: () => RoleString;
              user: (userId: string, status?: string) => RoleString;
              users: (status?: string) => RoleString;
              guests: () => RoleString;
              team: (teamId: string, role?: string) => RoleString;
              member: (memberId: string) => RoleString;
              label: (label: string) => RoleString;
            },
          ) => string[];
          transactionId?: string;
        },
      ) => Promise<ZEntryCount>;
      get: (id: string) => Promise<ZEntryCount>;
      update: (
        id: string,
        data: Partial<{
          completedCount?: number;
          backlogCount?: number;
          droppedCount?: number;
          playingCount?: number;
          wishlistCount?: number;
          game?:
            | (GamesCreate & { $id?: string; $permissions?: string[] })
            | string;
          likes?: number;
        }>,
        options?: {
          permissions?: (
            permission: {
              read: (role: RoleString) => string;
              write: (role: RoleString) => string;
              create: (role: RoleString) => string;
              update: (role: RoleString) => string;
              delete: (role: RoleString) => string;
            },
            role: {
              any: () => RoleString;
              user: (userId: string, status?: string) => RoleString;
              users: (status?: string) => RoleString;
              guests: () => RoleString;
              team: (teamId: string, role?: string) => RoleString;
              member: (memberId: string) => RoleString;
              label: (label: string) => RoleString;
            },
          ) => string[];
          transactionId?: string;
        },
      ) => Promise<ZEntryCount>;
      delete: (
        id: string,
        options?: { transactionId?: string },
      ) => Promise<void>;
      list: (options?: {
        queries?: (q: {
          equal: <K extends QueryableKeys<ZEntryCount>>(
            field: K,
            value: ExtractQueryValue<ZEntryCount[K]>,
          ) => string;
          notEqual: <K extends QueryableKeys<ZEntryCount>>(
            field: K,
            value: ExtractQueryValue<ZEntryCount[K]>,
          ) => string;
          lessThan: <K extends QueryableKeys<ZEntryCount>>(
            field: K,
            value: ExtractQueryValue<ZEntryCount[K]>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<ZEntryCount>>(
            field: K,
            value: ExtractQueryValue<ZEntryCount[K]>,
          ) => string;
          greaterThan: <K extends QueryableKeys<ZEntryCount>>(
            field: K,
            value: ExtractQueryValue<ZEntryCount[K]>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<ZEntryCount>>(
            field: K,
            value: ExtractQueryValue<ZEntryCount[K]>,
          ) => string;
          contains: <K extends QueryableKeys<ZEntryCount>>(
            field: K,
            value: ExtractQueryValue<ZEntryCount[K]>,
          ) => string;
          search: <K extends QueryableKeys<ZEntryCount>>(
            field: K,
            value: string,
          ) => string;
          isNull: <K extends QueryableKeys<ZEntryCount>>(field: K) => string;
          isNotNull: <K extends QueryableKeys<ZEntryCount>>(field: K) => string;
          startsWith: <K extends QueryableKeys<ZEntryCount>>(
            field: K,
            value: string,
          ) => string;
          endsWith: <K extends QueryableKeys<ZEntryCount>>(
            field: K,
            value: string,
          ) => string;
          between: <K extends QueryableKeys<ZEntryCount>>(
            field: K,
            start: ExtractQueryValue<ZEntryCount[K]>,
            end: ExtractQueryValue<ZEntryCount[K]>,
          ) => string;
          select: <K extends keyof ZEntryCount>(fields: K[]) => string;
          orderAsc: <K extends keyof ZEntryCount>(field: K) => string;
          orderDesc: <K extends keyof ZEntryCount>(field: K) => string;
          limit: (value: number) => string;
          offset: (value: number) => string;
          cursorAfter: (documentId: string) => string;
          cursorBefore: (documentId: string) => string;
          or: (...queries: string[]) => string;
          and: (...queries: string[]) => string;
        }) => string[];
      }) => Promise<{ total: number; rows: ZEntryCount[] }>;
    };
    'Game Comments': {
      create: (
        data: {
          gameId: string;
          userProfile?:
            | (UserProfilesCreate & { $id?: string; $permissions?: string[] })
            | string;
          content: string;
          parentId?: string | null;
          voteCount?: number;
          replyCount?: number;
          depth?: number;
          votes?: (
            | (GameCommentVotesCreate & {
                $id?: string;
                $permissions?: string[];
              })
            | string
          )[];
        },
        options?: {
          rowId?: string;
          permissions?: (
            permission: {
              read: (role: RoleString) => string;
              write: (role: RoleString) => string;
              create: (role: RoleString) => string;
              update: (role: RoleString) => string;
              delete: (role: RoleString) => string;
            },
            role: {
              any: () => RoleString;
              user: (userId: string, status?: string) => RoleString;
              users: (status?: string) => RoleString;
              guests: () => RoleString;
              team: (teamId: string, role?: string) => RoleString;
              member: (memberId: string) => RoleString;
              label: (label: string) => RoleString;
            },
          ) => string[];
          transactionId?: string;
        },
      ) => Promise<GameComments>;
      get: (id: string) => Promise<GameComments>;
      update: (
        id: string,
        data: Partial<{
          gameId: string;
          userProfile?:
            | (UserProfilesCreate & { $id?: string; $permissions?: string[] })
            | string;
          content: string;
          parentId?: string | null;
          voteCount?: number;
          replyCount?: number;
          depth?: number;
          votes?: (
            | (GameCommentVotesCreate & {
                $id?: string;
                $permissions?: string[];
              })
            | string
          )[];
        }>,
        options?: {
          permissions?: (
            permission: {
              read: (role: RoleString) => string;
              write: (role: RoleString) => string;
              create: (role: RoleString) => string;
              update: (role: RoleString) => string;
              delete: (role: RoleString) => string;
            },
            role: {
              any: () => RoleString;
              user: (userId: string, status?: string) => RoleString;
              users: (status?: string) => RoleString;
              guests: () => RoleString;
              team: (teamId: string, role?: string) => RoleString;
              member: (memberId: string) => RoleString;
              label: (label: string) => RoleString;
            },
          ) => string[];
          transactionId?: string;
        },
      ) => Promise<GameComments>;
      delete: (
        id: string,
        options?: { transactionId?: string },
      ) => Promise<void>;
      list: (options?: {
        queries?: (q: {
          equal: <K extends QueryableKeys<GameComments>>(
            field: K,
            value: ExtractQueryValue<GameComments[K]>,
          ) => string;
          notEqual: <K extends QueryableKeys<GameComments>>(
            field: K,
            value: ExtractQueryValue<GameComments[K]>,
          ) => string;
          lessThan: <K extends QueryableKeys<GameComments>>(
            field: K,
            value: ExtractQueryValue<GameComments[K]>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<GameComments>>(
            field: K,
            value: ExtractQueryValue<GameComments[K]>,
          ) => string;
          greaterThan: <K extends QueryableKeys<GameComments>>(
            field: K,
            value: ExtractQueryValue<GameComments[K]>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<GameComments>>(
            field: K,
            value: ExtractQueryValue<GameComments[K]>,
          ) => string;
          contains: <K extends QueryableKeys<GameComments>>(
            field: K,
            value: ExtractQueryValue<GameComments[K]>,
          ) => string;
          search: <K extends QueryableKeys<GameComments>>(
            field: K,
            value: string,
          ) => string;
          isNull: <K extends QueryableKeys<GameComments>>(field: K) => string;
          isNotNull: <K extends QueryableKeys<GameComments>>(
            field: K,
          ) => string;
          startsWith: <K extends QueryableKeys<GameComments>>(
            field: K,
            value: string,
          ) => string;
          endsWith: <K extends QueryableKeys<GameComments>>(
            field: K,
            value: string,
          ) => string;
          between: <K extends QueryableKeys<GameComments>>(
            field: K,
            start: ExtractQueryValue<GameComments[K]>,
            end: ExtractQueryValue<GameComments[K]>,
          ) => string;
          select: <K extends keyof GameComments>(fields: K[]) => string;
          orderAsc: <K extends keyof GameComments>(field: K) => string;
          orderDesc: <K extends keyof GameComments>(field: K) => string;
          limit: (value: number) => string;
          offset: (value: number) => string;
          cursorAfter: (documentId: string) => string;
          cursorBefore: (documentId: string) => string;
          or: (...queries: string[]) => string;
          and: (...queries: string[]) => string;
        }) => string[];
      }) => Promise<{ total: number; rows: GameComments[] }>;
    };
    'Game Comment Votes': {
      create: (
        data: {
          type: GameCommentVotesType;
          comment?:
            | (GameCommentsCreate & { $id?: string; $permissions?: string[] })
            | string;
          userId: string;
        },
        options?: {
          rowId?: string;
          permissions?: (
            permission: {
              read: (role: RoleString) => string;
              write: (role: RoleString) => string;
              create: (role: RoleString) => string;
              update: (role: RoleString) => string;
              delete: (role: RoleString) => string;
            },
            role: {
              any: () => RoleString;
              user: (userId: string, status?: string) => RoleString;
              users: (status?: string) => RoleString;
              guests: () => RoleString;
              team: (teamId: string, role?: string) => RoleString;
              member: (memberId: string) => RoleString;
              label: (label: string) => RoleString;
            },
          ) => string[];
          transactionId?: string;
        },
      ) => Promise<GameCommentVotes>;
      get: (id: string) => Promise<GameCommentVotes>;
      update: (
        id: string,
        data: Partial<{
          type: GameCommentVotesType;
          comment?:
            | (GameCommentsCreate & { $id?: string; $permissions?: string[] })
            | string;
          userId: string;
        }>,
        options?: {
          permissions?: (
            permission: {
              read: (role: RoleString) => string;
              write: (role: RoleString) => string;
              create: (role: RoleString) => string;
              update: (role: RoleString) => string;
              delete: (role: RoleString) => string;
            },
            role: {
              any: () => RoleString;
              user: (userId: string, status?: string) => RoleString;
              users: (status?: string) => RoleString;
              guests: () => RoleString;
              team: (teamId: string, role?: string) => RoleString;
              member: (memberId: string) => RoleString;
              label: (label: string) => RoleString;
            },
          ) => string[];
          transactionId?: string;
        },
      ) => Promise<GameCommentVotes>;
      delete: (
        id: string,
        options?: { transactionId?: string },
      ) => Promise<void>;
      list: (options?: {
        queries?: (q: {
          equal: <K extends QueryableKeys<GameCommentVotes>>(
            field: K,
            value: ExtractQueryValue<GameCommentVotes[K]>,
          ) => string;
          notEqual: <K extends QueryableKeys<GameCommentVotes>>(
            field: K,
            value: ExtractQueryValue<GameCommentVotes[K]>,
          ) => string;
          lessThan: <K extends QueryableKeys<GameCommentVotes>>(
            field: K,
            value: ExtractQueryValue<GameCommentVotes[K]>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<GameCommentVotes>>(
            field: K,
            value: ExtractQueryValue<GameCommentVotes[K]>,
          ) => string;
          greaterThan: <K extends QueryableKeys<GameCommentVotes>>(
            field: K,
            value: ExtractQueryValue<GameCommentVotes[K]>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<GameCommentVotes>>(
            field: K,
            value: ExtractQueryValue<GameCommentVotes[K]>,
          ) => string;
          contains: <K extends QueryableKeys<GameCommentVotes>>(
            field: K,
            value: ExtractQueryValue<GameCommentVotes[K]>,
          ) => string;
          search: <K extends QueryableKeys<GameCommentVotes>>(
            field: K,
            value: string,
          ) => string;
          isNull: <K extends QueryableKeys<GameCommentVotes>>(
            field: K,
          ) => string;
          isNotNull: <K extends QueryableKeys<GameCommentVotes>>(
            field: K,
          ) => string;
          startsWith: <K extends QueryableKeys<GameCommentVotes>>(
            field: K,
            value: string,
          ) => string;
          endsWith: <K extends QueryableKeys<GameCommentVotes>>(
            field: K,
            value: string,
          ) => string;
          between: <K extends QueryableKeys<GameCommentVotes>>(
            field: K,
            start: ExtractQueryValue<GameCommentVotes[K]>,
            end: ExtractQueryValue<GameCommentVotes[K]>,
          ) => string;
          select: <K extends keyof GameCommentVotes>(fields: K[]) => string;
          orderAsc: <K extends keyof GameCommentVotes>(field: K) => string;
          orderDesc: <K extends keyof GameCommentVotes>(field: K) => string;
          limit: (value: number) => string;
          offset: (value: number) => string;
          cursorAfter: (documentId: string) => string;
          cursorBefore: (documentId: string) => string;
          or: (...queries: string[]) => string;
          and: (...queries: string[]) => string;
        }) => string[];
      }) => Promise<{ total: number; rows: GameCommentVotes[] }>;
    };
    Lists: {
      create: (
        data: {
          ownerFingerprint: string;
          title: string;
          description?: string | null;
          isPublic?: boolean;
          slug: string;
          itemCount?: number;
          latestAdditions?: string[] | null;
          lastOrderKey?: string | null;
        },
        options?: {
          rowId?: string;
          permissions?: (
            permission: {
              read: (role: RoleString) => string;
              write: (role: RoleString) => string;
              create: (role: RoleString) => string;
              update: (role: RoleString) => string;
              delete: (role: RoleString) => string;
            },
            role: {
              any: () => RoleString;
              user: (userId: string, status?: string) => RoleString;
              users: (status?: string) => RoleString;
              guests: () => RoleString;
              team: (teamId: string, role?: string) => RoleString;
              member: (memberId: string) => RoleString;
              label: (label: string) => RoleString;
            },
          ) => string[];
          transactionId?: string;
        },
      ) => Promise<Lists>;
      get: (id: string) => Promise<Lists>;
      update: (
        id: string,
        data: Partial<{
          ownerFingerprint: string;
          title: string;
          description?: string | null;
          isPublic?: boolean;
          slug: string;
          itemCount?: number;
          latestAdditions?: string[] | null;
          lastOrderKey?: string | null;
        }>,
        options?: {
          permissions?: (
            permission: {
              read: (role: RoleString) => string;
              write: (role: RoleString) => string;
              create: (role: RoleString) => string;
              update: (role: RoleString) => string;
              delete: (role: RoleString) => string;
            },
            role: {
              any: () => RoleString;
              user: (userId: string, status?: string) => RoleString;
              users: (status?: string) => RoleString;
              guests: () => RoleString;
              team: (teamId: string, role?: string) => RoleString;
              member: (memberId: string) => RoleString;
              label: (label: string) => RoleString;
            },
          ) => string[];
          transactionId?: string;
        },
      ) => Promise<Lists>;
      delete: (
        id: string,
        options?: { transactionId?: string },
      ) => Promise<void>;
      list: (options?: {
        queries?: (q: {
          equal: <K extends QueryableKeys<Lists>>(
            field: K,
            value: ExtractQueryValue<Lists[K]>,
          ) => string;
          notEqual: <K extends QueryableKeys<Lists>>(
            field: K,
            value: ExtractQueryValue<Lists[K]>,
          ) => string;
          lessThan: <K extends QueryableKeys<Lists>>(
            field: K,
            value: ExtractQueryValue<Lists[K]>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<Lists>>(
            field: K,
            value: ExtractQueryValue<Lists[K]>,
          ) => string;
          greaterThan: <K extends QueryableKeys<Lists>>(
            field: K,
            value: ExtractQueryValue<Lists[K]>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<Lists>>(
            field: K,
            value: ExtractQueryValue<Lists[K]>,
          ) => string;
          contains: <K extends QueryableKeys<Lists>>(
            field: K,
            value: ExtractQueryValue<Lists[K]>,
          ) => string;
          search: <K extends QueryableKeys<Lists>>(
            field: K,
            value: string,
          ) => string;
          isNull: <K extends QueryableKeys<Lists>>(field: K) => string;
          isNotNull: <K extends QueryableKeys<Lists>>(field: K) => string;
          startsWith: <K extends QueryableKeys<Lists>>(
            field: K,
            value: string,
          ) => string;
          endsWith: <K extends QueryableKeys<Lists>>(
            field: K,
            value: string,
          ) => string;
          between: <K extends QueryableKeys<Lists>>(
            field: K,
            start: ExtractQueryValue<Lists[K]>,
            end: ExtractQueryValue<Lists[K]>,
          ) => string;
          select: <K extends keyof Lists>(fields: K[]) => string;
          orderAsc: <K extends keyof Lists>(field: K) => string;
          orderDesc: <K extends keyof Lists>(field: K) => string;
          limit: (value: number) => string;
          offset: (value: number) => string;
          cursorAfter: (documentId: string) => string;
          cursorBefore: (documentId: string) => string;
          or: (...queries: string[]) => string;
          and: (...queries: string[]) => string;
        }) => string[];
      }) => Promise<{ total: number; rows: Lists[] }>;
      createMany: (
        rows: Array<
          {
            ownerFingerprint: string;
            title: string;
            description?: string | null;
            isPublic?: boolean;
            slug: string;
            itemCount?: number;
            latestAdditions?: string[] | null;
            lastOrderKey?: string | null;
          } & { $id?: string; $permissions?: string[] }
        >,
        options?: { transactionId?: string },
      ) => Promise<{ total: number; rows: Lists[] }>;
      updateMany: (
        data: Partial<{
          ownerFingerprint: string;
          title: string;
          description?: string | null;
          isPublic?: boolean;
          slug: string;
          itemCount?: number;
          latestAdditions?: string[] | null;
          lastOrderKey?: string | null;
        }>,
        options?: {
          queries?: (q: {
            equal: <K extends QueryableKeys<Lists>>(
              field: K,
              value: ExtractQueryValue<Lists[K]>,
            ) => string;
            notEqual: <K extends QueryableKeys<Lists>>(
              field: K,
              value: ExtractQueryValue<Lists[K]>,
            ) => string;
            lessThan: <K extends QueryableKeys<Lists>>(
              field: K,
              value: ExtractQueryValue<Lists[K]>,
            ) => string;
            lessThanEqual: <K extends QueryableKeys<Lists>>(
              field: K,
              value: ExtractQueryValue<Lists[K]>,
            ) => string;
            greaterThan: <K extends QueryableKeys<Lists>>(
              field: K,
              value: ExtractQueryValue<Lists[K]>,
            ) => string;
            greaterThanEqual: <K extends QueryableKeys<Lists>>(
              field: K,
              value: ExtractQueryValue<Lists[K]>,
            ) => string;
            contains: <K extends QueryableKeys<Lists>>(
              field: K,
              value: ExtractQueryValue<Lists[K]>,
            ) => string;
            search: <K extends QueryableKeys<Lists>>(
              field: K,
              value: string,
            ) => string;
            isNull: <K extends QueryableKeys<Lists>>(field: K) => string;
            isNotNull: <K extends QueryableKeys<Lists>>(field: K) => string;
            startsWith: <K extends QueryableKeys<Lists>>(
              field: K,
              value: string,
            ) => string;
            endsWith: <K extends QueryableKeys<Lists>>(
              field: K,
              value: string,
            ) => string;
            between: <K extends QueryableKeys<Lists>>(
              field: K,
              start: ExtractQueryValue<Lists[K]>,
              end: ExtractQueryValue<Lists[K]>,
            ) => string;
            select: <K extends keyof Lists>(fields: K[]) => string;
            orderAsc: <K extends keyof Lists>(field: K) => string;
            orderDesc: <K extends keyof Lists>(field: K) => string;
            limit: (value: number) => string;
            offset: (value: number) => string;
            cursorAfter: (documentId: string) => string;
            cursorBefore: (documentId: string) => string;
            or: (...queries: string[]) => string;
            and: (...queries: string[]) => string;
          }) => string[];
          transactionId?: string;
        },
      ) => Promise<{ total: number; rows: Lists[] }>;
      deleteMany: (options?: {
        queries?: (q: {
          equal: <K extends QueryableKeys<Lists>>(
            field: K,
            value: ExtractQueryValue<Lists[K]>,
          ) => string;
          notEqual: <K extends QueryableKeys<Lists>>(
            field: K,
            value: ExtractQueryValue<Lists[K]>,
          ) => string;
          lessThan: <K extends QueryableKeys<Lists>>(
            field: K,
            value: ExtractQueryValue<Lists[K]>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<Lists>>(
            field: K,
            value: ExtractQueryValue<Lists[K]>,
          ) => string;
          greaterThan: <K extends QueryableKeys<Lists>>(
            field: K,
            value: ExtractQueryValue<Lists[K]>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<Lists>>(
            field: K,
            value: ExtractQueryValue<Lists[K]>,
          ) => string;
          contains: <K extends QueryableKeys<Lists>>(
            field: K,
            value: ExtractQueryValue<Lists[K]>,
          ) => string;
          search: <K extends QueryableKeys<Lists>>(
            field: K,
            value: string,
          ) => string;
          isNull: <K extends QueryableKeys<Lists>>(field: K) => string;
          isNotNull: <K extends QueryableKeys<Lists>>(field: K) => string;
          startsWith: <K extends QueryableKeys<Lists>>(
            field: K,
            value: string,
          ) => string;
          endsWith: <K extends QueryableKeys<Lists>>(
            field: K,
            value: string,
          ) => string;
          between: <K extends QueryableKeys<Lists>>(
            field: K,
            start: ExtractQueryValue<Lists[K]>,
            end: ExtractQueryValue<Lists[K]>,
          ) => string;
          select: <K extends keyof Lists>(fields: K[]) => string;
          orderAsc: <K extends keyof Lists>(field: K) => string;
          orderDesc: <K extends keyof Lists>(field: K) => string;
          limit: (value: number) => string;
          offset: (value: number) => string;
          cursorAfter: (documentId: string) => string;
          cursorBefore: (documentId: string) => string;
          or: (...queries: string[]) => string;
          and: (...queries: string[]) => string;
        }) => string[];
        transactionId?: string;
      }) => Promise<{ total: number; rows: Lists[] }>;
    };
    'List Items': {
      create: (
        data: {
          list?:
            | (ListsCreate & { $id?: string; $permissions?: string[] })
            | string;
          game?:
            | (GamesCreate & { $id?: string; $permissions?: string[] })
            | string;
          orderKey: string;
        },
        options?: {
          rowId?: string;
          permissions?: (
            permission: {
              read: (role: RoleString) => string;
              write: (role: RoleString) => string;
              create: (role: RoleString) => string;
              update: (role: RoleString) => string;
              delete: (role: RoleString) => string;
            },
            role: {
              any: () => RoleString;
              user: (userId: string, status?: string) => RoleString;
              users: (status?: string) => RoleString;
              guests: () => RoleString;
              team: (teamId: string, role?: string) => RoleString;
              member: (memberId: string) => RoleString;
              label: (label: string) => RoleString;
            },
          ) => string[];
          transactionId?: string;
        },
      ) => Promise<ListItems>;
      get: (id: string) => Promise<ListItems>;
      update: (
        id: string,
        data: Partial<{
          list?:
            | (ListsCreate & { $id?: string; $permissions?: string[] })
            | string;
          game?:
            | (GamesCreate & { $id?: string; $permissions?: string[] })
            | string;
          orderKey: string;
        }>,
        options?: {
          permissions?: (
            permission: {
              read: (role: RoleString) => string;
              write: (role: RoleString) => string;
              create: (role: RoleString) => string;
              update: (role: RoleString) => string;
              delete: (role: RoleString) => string;
            },
            role: {
              any: () => RoleString;
              user: (userId: string, status?: string) => RoleString;
              users: (status?: string) => RoleString;
              guests: () => RoleString;
              team: (teamId: string, role?: string) => RoleString;
              member: (memberId: string) => RoleString;
              label: (label: string) => RoleString;
            },
          ) => string[];
          transactionId?: string;
        },
      ) => Promise<ListItems>;
      delete: (
        id: string,
        options?: { transactionId?: string },
      ) => Promise<void>;
      list: (options?: {
        queries?: (q: {
          equal: <K extends QueryableKeys<ListItems>>(
            field: K,
            value: ExtractQueryValue<ListItems[K]>,
          ) => string;
          notEqual: <K extends QueryableKeys<ListItems>>(
            field: K,
            value: ExtractQueryValue<ListItems[K]>,
          ) => string;
          lessThan: <K extends QueryableKeys<ListItems>>(
            field: K,
            value: ExtractQueryValue<ListItems[K]>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<ListItems>>(
            field: K,
            value: ExtractQueryValue<ListItems[K]>,
          ) => string;
          greaterThan: <K extends QueryableKeys<ListItems>>(
            field: K,
            value: ExtractQueryValue<ListItems[K]>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<ListItems>>(
            field: K,
            value: ExtractQueryValue<ListItems[K]>,
          ) => string;
          contains: <K extends QueryableKeys<ListItems>>(
            field: K,
            value: ExtractQueryValue<ListItems[K]>,
          ) => string;
          search: <K extends QueryableKeys<ListItems>>(
            field: K,
            value: string,
          ) => string;
          isNull: <K extends QueryableKeys<ListItems>>(field: K) => string;
          isNotNull: <K extends QueryableKeys<ListItems>>(field: K) => string;
          startsWith: <K extends QueryableKeys<ListItems>>(
            field: K,
            value: string,
          ) => string;
          endsWith: <K extends QueryableKeys<ListItems>>(
            field: K,
            value: string,
          ) => string;
          between: <K extends QueryableKeys<ListItems>>(
            field: K,
            start: ExtractQueryValue<ListItems[K]>,
            end: ExtractQueryValue<ListItems[K]>,
          ) => string;
          select: <K extends keyof ListItems>(fields: K[]) => string;
          orderAsc: <K extends keyof ListItems>(field: K) => string;
          orderDesc: <K extends keyof ListItems>(field: K) => string;
          limit: (value: number) => string;
          offset: (value: number) => string;
          cursorAfter: (documentId: string) => string;
          cursorBefore: (documentId: string) => string;
          or: (...queries: string[]) => string;
          and: (...queries: string[]) => string;
        }) => string[];
      }) => Promise<{ total: number; rows: ListItems[] }>;
    };
    'Z Entries (Read-only)': {
      create: (
        data: {
          status?: ZEntriesReadOnlyStatus | null;
          liked?: boolean | null;
          gameId: string;
          ownerFingerprint: string;
        },
        options?: {
          rowId?: string;
          permissions?: (
            permission: {
              read: (role: RoleString) => string;
              write: (role: RoleString) => string;
              create: (role: RoleString) => string;
              update: (role: RoleString) => string;
              delete: (role: RoleString) => string;
            },
            role: {
              any: () => RoleString;
              user: (userId: string, status?: string) => RoleString;
              users: (status?: string) => RoleString;
              guests: () => RoleString;
              team: (teamId: string, role?: string) => RoleString;
              member: (memberId: string) => RoleString;
              label: (label: string) => RoleString;
            },
          ) => string[];
          transactionId?: string;
        },
      ) => Promise<ZEntriesReadOnly>;
      get: (id: string) => Promise<ZEntriesReadOnly>;
      update: (
        id: string,
        data: Partial<{
          status?: ZEntriesReadOnlyStatus | null;
          liked?: boolean | null;
          gameId: string;
          ownerFingerprint: string;
        }>,
        options?: {
          permissions?: (
            permission: {
              read: (role: RoleString) => string;
              write: (role: RoleString) => string;
              create: (role: RoleString) => string;
              update: (role: RoleString) => string;
              delete: (role: RoleString) => string;
            },
            role: {
              any: () => RoleString;
              user: (userId: string, status?: string) => RoleString;
              users: (status?: string) => RoleString;
              guests: () => RoleString;
              team: (teamId: string, role?: string) => RoleString;
              member: (memberId: string) => RoleString;
              label: (label: string) => RoleString;
            },
          ) => string[];
          transactionId?: string;
        },
      ) => Promise<ZEntriesReadOnly>;
      delete: (
        id: string,
        options?: { transactionId?: string },
      ) => Promise<void>;
      list: (options?: {
        queries?: (q: {
          equal: <K extends QueryableKeys<ZEntriesReadOnly>>(
            field: K,
            value: ExtractQueryValue<ZEntriesReadOnly[K]>,
          ) => string;
          notEqual: <K extends QueryableKeys<ZEntriesReadOnly>>(
            field: K,
            value: ExtractQueryValue<ZEntriesReadOnly[K]>,
          ) => string;
          lessThan: <K extends QueryableKeys<ZEntriesReadOnly>>(
            field: K,
            value: ExtractQueryValue<ZEntriesReadOnly[K]>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<ZEntriesReadOnly>>(
            field: K,
            value: ExtractQueryValue<ZEntriesReadOnly[K]>,
          ) => string;
          greaterThan: <K extends QueryableKeys<ZEntriesReadOnly>>(
            field: K,
            value: ExtractQueryValue<ZEntriesReadOnly[K]>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<ZEntriesReadOnly>>(
            field: K,
            value: ExtractQueryValue<ZEntriesReadOnly[K]>,
          ) => string;
          contains: <K extends QueryableKeys<ZEntriesReadOnly>>(
            field: K,
            value: ExtractQueryValue<ZEntriesReadOnly[K]>,
          ) => string;
          search: <K extends QueryableKeys<ZEntriesReadOnly>>(
            field: K,
            value: string,
          ) => string;
          isNull: <K extends QueryableKeys<ZEntriesReadOnly>>(
            field: K,
          ) => string;
          isNotNull: <K extends QueryableKeys<ZEntriesReadOnly>>(
            field: K,
          ) => string;
          startsWith: <K extends QueryableKeys<ZEntriesReadOnly>>(
            field: K,
            value: string,
          ) => string;
          endsWith: <K extends QueryableKeys<ZEntriesReadOnly>>(
            field: K,
            value: string,
          ) => string;
          between: <K extends QueryableKeys<ZEntriesReadOnly>>(
            field: K,
            start: ExtractQueryValue<ZEntriesReadOnly[K]>,
            end: ExtractQueryValue<ZEntriesReadOnly[K]>,
          ) => string;
          select: <K extends keyof ZEntriesReadOnly>(fields: K[]) => string;
          orderAsc: <K extends keyof ZEntriesReadOnly>(field: K) => string;
          orderDesc: <K extends keyof ZEntriesReadOnly>(field: K) => string;
          limit: (value: number) => string;
          offset: (value: number) => string;
          cursorAfter: (documentId: string) => string;
          cursorBefore: (documentId: string) => string;
          or: (...queries: string[]) => string;
          and: (...queries: string[]) => string;
        }) => string[];
      }) => Promise<{ total: number; rows: ZEntriesReadOnly[] }>;
      createMany: (
        rows: Array<
          {
            status?: ZEntriesReadOnlyStatus | null;
            liked?: boolean | null;
            gameId: string;
            ownerFingerprint: string;
          } & { $id?: string; $permissions?: string[] }
        >,
        options?: { transactionId?: string },
      ) => Promise<{ total: number; rows: ZEntriesReadOnly[] }>;
      updateMany: (
        data: Partial<{
          status?: ZEntriesReadOnlyStatus | null;
          liked?: boolean | null;
          gameId: string;
          ownerFingerprint: string;
        }>,
        options?: {
          queries?: (q: {
            equal: <K extends QueryableKeys<ZEntriesReadOnly>>(
              field: K,
              value: ExtractQueryValue<ZEntriesReadOnly[K]>,
            ) => string;
            notEqual: <K extends QueryableKeys<ZEntriesReadOnly>>(
              field: K,
              value: ExtractQueryValue<ZEntriesReadOnly[K]>,
            ) => string;
            lessThan: <K extends QueryableKeys<ZEntriesReadOnly>>(
              field: K,
              value: ExtractQueryValue<ZEntriesReadOnly[K]>,
            ) => string;
            lessThanEqual: <K extends QueryableKeys<ZEntriesReadOnly>>(
              field: K,
              value: ExtractQueryValue<ZEntriesReadOnly[K]>,
            ) => string;
            greaterThan: <K extends QueryableKeys<ZEntriesReadOnly>>(
              field: K,
              value: ExtractQueryValue<ZEntriesReadOnly[K]>,
            ) => string;
            greaterThanEqual: <K extends QueryableKeys<ZEntriesReadOnly>>(
              field: K,
              value: ExtractQueryValue<ZEntriesReadOnly[K]>,
            ) => string;
            contains: <K extends QueryableKeys<ZEntriesReadOnly>>(
              field: K,
              value: ExtractQueryValue<ZEntriesReadOnly[K]>,
            ) => string;
            search: <K extends QueryableKeys<ZEntriesReadOnly>>(
              field: K,
              value: string,
            ) => string;
            isNull: <K extends QueryableKeys<ZEntriesReadOnly>>(
              field: K,
            ) => string;
            isNotNull: <K extends QueryableKeys<ZEntriesReadOnly>>(
              field: K,
            ) => string;
            startsWith: <K extends QueryableKeys<ZEntriesReadOnly>>(
              field: K,
              value: string,
            ) => string;
            endsWith: <K extends QueryableKeys<ZEntriesReadOnly>>(
              field: K,
              value: string,
            ) => string;
            between: <K extends QueryableKeys<ZEntriesReadOnly>>(
              field: K,
              start: ExtractQueryValue<ZEntriesReadOnly[K]>,
              end: ExtractQueryValue<ZEntriesReadOnly[K]>,
            ) => string;
            select: <K extends keyof ZEntriesReadOnly>(fields: K[]) => string;
            orderAsc: <K extends keyof ZEntriesReadOnly>(field: K) => string;
            orderDesc: <K extends keyof ZEntriesReadOnly>(field: K) => string;
            limit: (value: number) => string;
            offset: (value: number) => string;
            cursorAfter: (documentId: string) => string;
            cursorBefore: (documentId: string) => string;
            or: (...queries: string[]) => string;
            and: (...queries: string[]) => string;
          }) => string[];
          transactionId?: string;
        },
      ) => Promise<{ total: number; rows: ZEntriesReadOnly[] }>;
      deleteMany: (options?: {
        queries?: (q: {
          equal: <K extends QueryableKeys<ZEntriesReadOnly>>(
            field: K,
            value: ExtractQueryValue<ZEntriesReadOnly[K]>,
          ) => string;
          notEqual: <K extends QueryableKeys<ZEntriesReadOnly>>(
            field: K,
            value: ExtractQueryValue<ZEntriesReadOnly[K]>,
          ) => string;
          lessThan: <K extends QueryableKeys<ZEntriesReadOnly>>(
            field: K,
            value: ExtractQueryValue<ZEntriesReadOnly[K]>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<ZEntriesReadOnly>>(
            field: K,
            value: ExtractQueryValue<ZEntriesReadOnly[K]>,
          ) => string;
          greaterThan: <K extends QueryableKeys<ZEntriesReadOnly>>(
            field: K,
            value: ExtractQueryValue<ZEntriesReadOnly[K]>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<ZEntriesReadOnly>>(
            field: K,
            value: ExtractQueryValue<ZEntriesReadOnly[K]>,
          ) => string;
          contains: <K extends QueryableKeys<ZEntriesReadOnly>>(
            field: K,
            value: ExtractQueryValue<ZEntriesReadOnly[K]>,
          ) => string;
          search: <K extends QueryableKeys<ZEntriesReadOnly>>(
            field: K,
            value: string,
          ) => string;
          isNull: <K extends QueryableKeys<ZEntriesReadOnly>>(
            field: K,
          ) => string;
          isNotNull: <K extends QueryableKeys<ZEntriesReadOnly>>(
            field: K,
          ) => string;
          startsWith: <K extends QueryableKeys<ZEntriesReadOnly>>(
            field: K,
            value: string,
          ) => string;
          endsWith: <K extends QueryableKeys<ZEntriesReadOnly>>(
            field: K,
            value: string,
          ) => string;
          between: <K extends QueryableKeys<ZEntriesReadOnly>>(
            field: K,
            start: ExtractQueryValue<ZEntriesReadOnly[K]>,
            end: ExtractQueryValue<ZEntriesReadOnly[K]>,
          ) => string;
          select: <K extends keyof ZEntriesReadOnly>(fields: K[]) => string;
          orderAsc: <K extends keyof ZEntriesReadOnly>(field: K) => string;
          orderDesc: <K extends keyof ZEntriesReadOnly>(field: K) => string;
          limit: (value: number) => string;
          offset: (value: number) => string;
          cursorAfter: (documentId: string) => string;
          cursorBefore: (documentId: string) => string;
          or: (...queries: string[]) => string;
          and: (...queries: string[]) => string;
        }) => string[];
        transactionId?: string;
      }) => Promise<{ total: number; rows: ZEntriesReadOnly[] }>;
    };
    'Game Platforms': {
      create: (
        data: {
          slug: string;
          name: string;
          shortName?: string | null;
          manufacturer?: string | null;
          type?: GamePlatformsType | null;
          generation?: number | null;
          releasedAt?: string | null;
        },
        options?: {
          rowId?: string;
          permissions?: (
            permission: {
              read: (role: RoleString) => string;
              write: (role: RoleString) => string;
              create: (role: RoleString) => string;
              update: (role: RoleString) => string;
              delete: (role: RoleString) => string;
            },
            role: {
              any: () => RoleString;
              user: (userId: string, status?: string) => RoleString;
              users: (status?: string) => RoleString;
              guests: () => RoleString;
              team: (teamId: string, role?: string) => RoleString;
              member: (memberId: string) => RoleString;
              label: (label: string) => RoleString;
            },
          ) => string[];
          transactionId?: string;
        },
      ) => Promise<GamePlatforms>;
      get: (id: string) => Promise<GamePlatforms>;
      update: (
        id: string,
        data: Partial<{
          slug: string;
          name: string;
          shortName?: string | null;
          manufacturer?: string | null;
          type?: GamePlatformsType | null;
          generation?: number | null;
          releasedAt?: string | null;
        }>,
        options?: {
          permissions?: (
            permission: {
              read: (role: RoleString) => string;
              write: (role: RoleString) => string;
              create: (role: RoleString) => string;
              update: (role: RoleString) => string;
              delete: (role: RoleString) => string;
            },
            role: {
              any: () => RoleString;
              user: (userId: string, status?: string) => RoleString;
              users: (status?: string) => RoleString;
              guests: () => RoleString;
              team: (teamId: string, role?: string) => RoleString;
              member: (memberId: string) => RoleString;
              label: (label: string) => RoleString;
            },
          ) => string[];
          transactionId?: string;
        },
      ) => Promise<GamePlatforms>;
      delete: (
        id: string,
        options?: { transactionId?: string },
      ) => Promise<void>;
      list: (options?: {
        queries?: (q: {
          equal: <K extends QueryableKeys<GamePlatforms>>(
            field: K,
            value: ExtractQueryValue<GamePlatforms[K]>,
          ) => string;
          notEqual: <K extends QueryableKeys<GamePlatforms>>(
            field: K,
            value: ExtractQueryValue<GamePlatforms[K]>,
          ) => string;
          lessThan: <K extends QueryableKeys<GamePlatforms>>(
            field: K,
            value: ExtractQueryValue<GamePlatforms[K]>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<GamePlatforms>>(
            field: K,
            value: ExtractQueryValue<GamePlatforms[K]>,
          ) => string;
          greaterThan: <K extends QueryableKeys<GamePlatforms>>(
            field: K,
            value: ExtractQueryValue<GamePlatforms[K]>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<GamePlatforms>>(
            field: K,
            value: ExtractQueryValue<GamePlatforms[K]>,
          ) => string;
          contains: <K extends QueryableKeys<GamePlatforms>>(
            field: K,
            value: ExtractQueryValue<GamePlatforms[K]>,
          ) => string;
          search: <K extends QueryableKeys<GamePlatforms>>(
            field: K,
            value: string,
          ) => string;
          isNull: <K extends QueryableKeys<GamePlatforms>>(field: K) => string;
          isNotNull: <K extends QueryableKeys<GamePlatforms>>(
            field: K,
          ) => string;
          startsWith: <K extends QueryableKeys<GamePlatforms>>(
            field: K,
            value: string,
          ) => string;
          endsWith: <K extends QueryableKeys<GamePlatforms>>(
            field: K,
            value: string,
          ) => string;
          between: <K extends QueryableKeys<GamePlatforms>>(
            field: K,
            start: ExtractQueryValue<GamePlatforms[K]>,
            end: ExtractQueryValue<GamePlatforms[K]>,
          ) => string;
          select: <K extends keyof GamePlatforms>(fields: K[]) => string;
          orderAsc: <K extends keyof GamePlatforms>(field: K) => string;
          orderDesc: <K extends keyof GamePlatforms>(field: K) => string;
          limit: (value: number) => string;
          offset: (value: number) => string;
          cursorAfter: (documentId: string) => string;
          cursorBefore: (documentId: string) => string;
          or: (...queries: string[]) => string;
          and: (...queries: string[]) => string;
        }) => string[];
      }) => Promise<{ total: number; rows: GamePlatforms[] }>;
      createMany: (
        rows: Array<
          {
            slug: string;
            name: string;
            shortName?: string | null;
            manufacturer?: string | null;
            type?: GamePlatformsType | null;
            generation?: number | null;
            releasedAt?: string | null;
          } & { $id?: string; $permissions?: string[] }
        >,
        options?: { transactionId?: string },
      ) => Promise<{ total: number; rows: GamePlatforms[] }>;
      updateMany: (
        data: Partial<{
          slug: string;
          name: string;
          shortName?: string | null;
          manufacturer?: string | null;
          type?: GamePlatformsType | null;
          generation?: number | null;
          releasedAt?: string | null;
        }>,
        options?: {
          queries?: (q: {
            equal: <K extends QueryableKeys<GamePlatforms>>(
              field: K,
              value: ExtractQueryValue<GamePlatforms[K]>,
            ) => string;
            notEqual: <K extends QueryableKeys<GamePlatforms>>(
              field: K,
              value: ExtractQueryValue<GamePlatforms[K]>,
            ) => string;
            lessThan: <K extends QueryableKeys<GamePlatforms>>(
              field: K,
              value: ExtractQueryValue<GamePlatforms[K]>,
            ) => string;
            lessThanEqual: <K extends QueryableKeys<GamePlatforms>>(
              field: K,
              value: ExtractQueryValue<GamePlatforms[K]>,
            ) => string;
            greaterThan: <K extends QueryableKeys<GamePlatforms>>(
              field: K,
              value: ExtractQueryValue<GamePlatforms[K]>,
            ) => string;
            greaterThanEqual: <K extends QueryableKeys<GamePlatforms>>(
              field: K,
              value: ExtractQueryValue<GamePlatforms[K]>,
            ) => string;
            contains: <K extends QueryableKeys<GamePlatforms>>(
              field: K,
              value: ExtractQueryValue<GamePlatforms[K]>,
            ) => string;
            search: <K extends QueryableKeys<GamePlatforms>>(
              field: K,
              value: string,
            ) => string;
            isNull: <K extends QueryableKeys<GamePlatforms>>(
              field: K,
            ) => string;
            isNotNull: <K extends QueryableKeys<GamePlatforms>>(
              field: K,
            ) => string;
            startsWith: <K extends QueryableKeys<GamePlatforms>>(
              field: K,
              value: string,
            ) => string;
            endsWith: <K extends QueryableKeys<GamePlatforms>>(
              field: K,
              value: string,
            ) => string;
            between: <K extends QueryableKeys<GamePlatforms>>(
              field: K,
              start: ExtractQueryValue<GamePlatforms[K]>,
              end: ExtractQueryValue<GamePlatforms[K]>,
            ) => string;
            select: <K extends keyof GamePlatforms>(fields: K[]) => string;
            orderAsc: <K extends keyof GamePlatforms>(field: K) => string;
            orderDesc: <K extends keyof GamePlatforms>(field: K) => string;
            limit: (value: number) => string;
            offset: (value: number) => string;
            cursorAfter: (documentId: string) => string;
            cursorBefore: (documentId: string) => string;
            or: (...queries: string[]) => string;
            and: (...queries: string[]) => string;
          }) => string[];
          transactionId?: string;
        },
      ) => Promise<{ total: number; rows: GamePlatforms[] }>;
      deleteMany: (options?: {
        queries?: (q: {
          equal: <K extends QueryableKeys<GamePlatforms>>(
            field: K,
            value: ExtractQueryValue<GamePlatforms[K]>,
          ) => string;
          notEqual: <K extends QueryableKeys<GamePlatforms>>(
            field: K,
            value: ExtractQueryValue<GamePlatforms[K]>,
          ) => string;
          lessThan: <K extends QueryableKeys<GamePlatforms>>(
            field: K,
            value: ExtractQueryValue<GamePlatforms[K]>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<GamePlatforms>>(
            field: K,
            value: ExtractQueryValue<GamePlatforms[K]>,
          ) => string;
          greaterThan: <K extends QueryableKeys<GamePlatforms>>(
            field: K,
            value: ExtractQueryValue<GamePlatforms[K]>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<GamePlatforms>>(
            field: K,
            value: ExtractQueryValue<GamePlatforms[K]>,
          ) => string;
          contains: <K extends QueryableKeys<GamePlatforms>>(
            field: K,
            value: ExtractQueryValue<GamePlatforms[K]>,
          ) => string;
          search: <K extends QueryableKeys<GamePlatforms>>(
            field: K,
            value: string,
          ) => string;
          isNull: <K extends QueryableKeys<GamePlatforms>>(field: K) => string;
          isNotNull: <K extends QueryableKeys<GamePlatforms>>(
            field: K,
          ) => string;
          startsWith: <K extends QueryableKeys<GamePlatforms>>(
            field: K,
            value: string,
          ) => string;
          endsWith: <K extends QueryableKeys<GamePlatforms>>(
            field: K,
            value: string,
          ) => string;
          between: <K extends QueryableKeys<GamePlatforms>>(
            field: K,
            start: ExtractQueryValue<GamePlatforms[K]>,
            end: ExtractQueryValue<GamePlatforms[K]>,
          ) => string;
          select: <K extends keyof GamePlatforms>(fields: K[]) => string;
          orderAsc: <K extends keyof GamePlatforms>(field: K) => string;
          orderDesc: <K extends keyof GamePlatforms>(field: K) => string;
          limit: (value: number) => string;
          offset: (value: number) => string;
          cursorAfter: (documentId: string) => string;
          cursorBefore: (documentId: string) => string;
          or: (...queries: string[]) => string;
          and: (...queries: string[]) => string;
        }) => string[];
        transactionId?: string;
      }) => Promise<{ total: number; rows: GamePlatforms[] }>;
    };
    Avaliações: {
      create: (
        data: {
          ownerFingerprint: string;
          gameId: string;
          rating: number;
          comment?: string | null;
        },
        options?: {
          rowId?: string;
          permissions?: (
            permission: {
              read: (role: RoleString) => string;
              write: (role: RoleString) => string;
              create: (role: RoleString) => string;
              update: (role: RoleString) => string;
              delete: (role: RoleString) => string;
            },
            role: {
              any: () => RoleString;
              user: (userId: string, status?: string) => RoleString;
              users: (status?: string) => RoleString;
              guests: () => RoleString;
              team: (teamId: string, role?: string) => RoleString;
              member: (memberId: string) => RoleString;
              label: (label: string) => RoleString;
            },
          ) => string[];
          transactionId?: string;
        },
      ) => Promise<Avaliaes>;
      get: (id: string) => Promise<Avaliaes>;
      update: (
        id: string,
        data: Partial<{
          ownerFingerprint: string;
          gameId: string;
          rating: number;
          comment?: string | null;
        }>,
        options?: {
          permissions?: (
            permission: {
              read: (role: RoleString) => string;
              write: (role: RoleString) => string;
              create: (role: RoleString) => string;
              update: (role: RoleString) => string;
              delete: (role: RoleString) => string;
            },
            role: {
              any: () => RoleString;
              user: (userId: string, status?: string) => RoleString;
              users: (status?: string) => RoleString;
              guests: () => RoleString;
              team: (teamId: string, role?: string) => RoleString;
              member: (memberId: string) => RoleString;
              label: (label: string) => RoleString;
            },
          ) => string[];
          transactionId?: string;
        },
      ) => Promise<Avaliaes>;
      delete: (
        id: string,
        options?: { transactionId?: string },
      ) => Promise<void>;
      list: (options?: {
        queries?: (q: {
          equal: <K extends QueryableKeys<Avaliaes>>(
            field: K,
            value: ExtractQueryValue<Avaliaes[K]>,
          ) => string;
          notEqual: <K extends QueryableKeys<Avaliaes>>(
            field: K,
            value: ExtractQueryValue<Avaliaes[K]>,
          ) => string;
          lessThan: <K extends QueryableKeys<Avaliaes>>(
            field: K,
            value: ExtractQueryValue<Avaliaes[K]>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<Avaliaes>>(
            field: K,
            value: ExtractQueryValue<Avaliaes[K]>,
          ) => string;
          greaterThan: <K extends QueryableKeys<Avaliaes>>(
            field: K,
            value: ExtractQueryValue<Avaliaes[K]>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<Avaliaes>>(
            field: K,
            value: ExtractQueryValue<Avaliaes[K]>,
          ) => string;
          contains: <K extends QueryableKeys<Avaliaes>>(
            field: K,
            value: ExtractQueryValue<Avaliaes[K]>,
          ) => string;
          search: <K extends QueryableKeys<Avaliaes>>(
            field: K,
            value: string,
          ) => string;
          isNull: <K extends QueryableKeys<Avaliaes>>(field: K) => string;
          isNotNull: <K extends QueryableKeys<Avaliaes>>(field: K) => string;
          startsWith: <K extends QueryableKeys<Avaliaes>>(
            field: K,
            value: string,
          ) => string;
          endsWith: <K extends QueryableKeys<Avaliaes>>(
            field: K,
            value: string,
          ) => string;
          between: <K extends QueryableKeys<Avaliaes>>(
            field: K,
            start: ExtractQueryValue<Avaliaes[K]>,
            end: ExtractQueryValue<Avaliaes[K]>,
          ) => string;
          select: <K extends keyof Avaliaes>(fields: K[]) => string;
          orderAsc: <K extends keyof Avaliaes>(field: K) => string;
          orderDesc: <K extends keyof Avaliaes>(field: K) => string;
          limit: (value: number) => string;
          offset: (value: number) => string;
          cursorAfter: (documentId: string) => string;
          cursorBefore: (documentId: string) => string;
          or: (...queries: string[]) => string;
          and: (...queries: string[]) => string;
        }) => string[];
      }) => Promise<{ total: number; rows: Avaliaes[] }>;
      createMany: (
        rows: Array<
          {
            ownerFingerprint: string;
            gameId: string;
            rating: number;
            comment?: string | null;
          } & { $id?: string; $permissions?: string[] }
        >,
        options?: { transactionId?: string },
      ) => Promise<{ total: number; rows: Avaliaes[] }>;
      updateMany: (
        data: Partial<{
          ownerFingerprint: string;
          gameId: string;
          rating: number;
          comment?: string | null;
        }>,
        options?: {
          queries?: (q: {
            equal: <K extends QueryableKeys<Avaliaes>>(
              field: K,
              value: ExtractQueryValue<Avaliaes[K]>,
            ) => string;
            notEqual: <K extends QueryableKeys<Avaliaes>>(
              field: K,
              value: ExtractQueryValue<Avaliaes[K]>,
            ) => string;
            lessThan: <K extends QueryableKeys<Avaliaes>>(
              field: K,
              value: ExtractQueryValue<Avaliaes[K]>,
            ) => string;
            lessThanEqual: <K extends QueryableKeys<Avaliaes>>(
              field: K,
              value: ExtractQueryValue<Avaliaes[K]>,
            ) => string;
            greaterThan: <K extends QueryableKeys<Avaliaes>>(
              field: K,
              value: ExtractQueryValue<Avaliaes[K]>,
            ) => string;
            greaterThanEqual: <K extends QueryableKeys<Avaliaes>>(
              field: K,
              value: ExtractQueryValue<Avaliaes[K]>,
            ) => string;
            contains: <K extends QueryableKeys<Avaliaes>>(
              field: K,
              value: ExtractQueryValue<Avaliaes[K]>,
            ) => string;
            search: <K extends QueryableKeys<Avaliaes>>(
              field: K,
              value: string,
            ) => string;
            isNull: <K extends QueryableKeys<Avaliaes>>(field: K) => string;
            isNotNull: <K extends QueryableKeys<Avaliaes>>(field: K) => string;
            startsWith: <K extends QueryableKeys<Avaliaes>>(
              field: K,
              value: string,
            ) => string;
            endsWith: <K extends QueryableKeys<Avaliaes>>(
              field: K,
              value: string,
            ) => string;
            between: <K extends QueryableKeys<Avaliaes>>(
              field: K,
              start: ExtractQueryValue<Avaliaes[K]>,
              end: ExtractQueryValue<Avaliaes[K]>,
            ) => string;
            select: <K extends keyof Avaliaes>(fields: K[]) => string;
            orderAsc: <K extends keyof Avaliaes>(field: K) => string;
            orderDesc: <K extends keyof Avaliaes>(field: K) => string;
            limit: (value: number) => string;
            offset: (value: number) => string;
            cursorAfter: (documentId: string) => string;
            cursorBefore: (documentId: string) => string;
            or: (...queries: string[]) => string;
            and: (...queries: string[]) => string;
          }) => string[];
          transactionId?: string;
        },
      ) => Promise<{ total: number; rows: Avaliaes[] }>;
      deleteMany: (options?: {
        queries?: (q: {
          equal: <K extends QueryableKeys<Avaliaes>>(
            field: K,
            value: ExtractQueryValue<Avaliaes[K]>,
          ) => string;
          notEqual: <K extends QueryableKeys<Avaliaes>>(
            field: K,
            value: ExtractQueryValue<Avaliaes[K]>,
          ) => string;
          lessThan: <K extends QueryableKeys<Avaliaes>>(
            field: K,
            value: ExtractQueryValue<Avaliaes[K]>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<Avaliaes>>(
            field: K,
            value: ExtractQueryValue<Avaliaes[K]>,
          ) => string;
          greaterThan: <K extends QueryableKeys<Avaliaes>>(
            field: K,
            value: ExtractQueryValue<Avaliaes[K]>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<Avaliaes>>(
            field: K,
            value: ExtractQueryValue<Avaliaes[K]>,
          ) => string;
          contains: <K extends QueryableKeys<Avaliaes>>(
            field: K,
            value: ExtractQueryValue<Avaliaes[K]>,
          ) => string;
          search: <K extends QueryableKeys<Avaliaes>>(
            field: K,
            value: string,
          ) => string;
          isNull: <K extends QueryableKeys<Avaliaes>>(field: K) => string;
          isNotNull: <K extends QueryableKeys<Avaliaes>>(field: K) => string;
          startsWith: <K extends QueryableKeys<Avaliaes>>(
            field: K,
            value: string,
          ) => string;
          endsWith: <K extends QueryableKeys<Avaliaes>>(
            field: K,
            value: string,
          ) => string;
          between: <K extends QueryableKeys<Avaliaes>>(
            field: K,
            start: ExtractQueryValue<Avaliaes[K]>,
            end: ExtractQueryValue<Avaliaes[K]>,
          ) => string;
          select: <K extends keyof Avaliaes>(fields: K[]) => string;
          orderAsc: <K extends keyof Avaliaes>(field: K) => string;
          orderDesc: <K extends keyof Avaliaes>(field: K) => string;
          limit: (value: number) => string;
          offset: (value: number) => string;
          cursorAfter: (documentId: string) => string;
          cursorBefore: (documentId: string) => string;
          or: (...queries: string[]) => string;
          and: (...queries: string[]) => string;
        }) => string[];
        transactionId?: string;
      }) => Promise<{ total: number; rows: Avaliaes[] }>;
    };
    'RPG Stories': {
      create: (
        data: {
          game?:
            | (GamesCreate & { $id?: string; $permissions?: string[] })
            | string;
          title: string;
          slug: string;
          summary?: string | null;
          chapterCount?: number;
          status?: RpgStoriesStatus;
          currentChapterId?: string | null;
        },
        options?: {
          rowId?: string;
          permissions?: (
            permission: {
              read: (role: RoleString) => string;
              write: (role: RoleString) => string;
              create: (role: RoleString) => string;
              update: (role: RoleString) => string;
              delete: (role: RoleString) => string;
            },
            role: {
              any: () => RoleString;
              user: (userId: string, status?: string) => RoleString;
              users: (status?: string) => RoleString;
              guests: () => RoleString;
              team: (teamId: string, role?: string) => RoleString;
              member: (memberId: string) => RoleString;
              label: (label: string) => RoleString;
            },
          ) => string[];
          transactionId?: string;
        },
      ) => Promise<RpgStories>;
      get: (id: string) => Promise<RpgStories>;
      update: (
        id: string,
        data: Partial<{
          game?:
            | (GamesCreate & { $id?: string; $permissions?: string[] })
            | string;
          title: string;
          slug: string;
          summary?: string | null;
          chapterCount?: number;
          status?: RpgStoriesStatus;
          currentChapterId?: string | null;
        }>,
        options?: {
          permissions?: (
            permission: {
              read: (role: RoleString) => string;
              write: (role: RoleString) => string;
              create: (role: RoleString) => string;
              update: (role: RoleString) => string;
              delete: (role: RoleString) => string;
            },
            role: {
              any: () => RoleString;
              user: (userId: string, status?: string) => RoleString;
              users: (status?: string) => RoleString;
              guests: () => RoleString;
              team: (teamId: string, role?: string) => RoleString;
              member: (memberId: string) => RoleString;
              label: (label: string) => RoleString;
            },
          ) => string[];
          transactionId?: string;
        },
      ) => Promise<RpgStories>;
      delete: (
        id: string,
        options?: { transactionId?: string },
      ) => Promise<void>;
      list: (options?: {
        queries?: (q: {
          equal: <K extends QueryableKeys<RpgStories>>(
            field: K,
            value: ExtractQueryValue<RpgStories[K]>,
          ) => string;
          notEqual: <K extends QueryableKeys<RpgStories>>(
            field: K,
            value: ExtractQueryValue<RpgStories[K]>,
          ) => string;
          lessThan: <K extends QueryableKeys<RpgStories>>(
            field: K,
            value: ExtractQueryValue<RpgStories[K]>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<RpgStories>>(
            field: K,
            value: ExtractQueryValue<RpgStories[K]>,
          ) => string;
          greaterThan: <K extends QueryableKeys<RpgStories>>(
            field: K,
            value: ExtractQueryValue<RpgStories[K]>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<RpgStories>>(
            field: K,
            value: ExtractQueryValue<RpgStories[K]>,
          ) => string;
          contains: <K extends QueryableKeys<RpgStories>>(
            field: K,
            value: ExtractQueryValue<RpgStories[K]>,
          ) => string;
          search: <K extends QueryableKeys<RpgStories>>(
            field: K,
            value: string,
          ) => string;
          isNull: <K extends QueryableKeys<RpgStories>>(field: K) => string;
          isNotNull: <K extends QueryableKeys<RpgStories>>(field: K) => string;
          startsWith: <K extends QueryableKeys<RpgStories>>(
            field: K,
            value: string,
          ) => string;
          endsWith: <K extends QueryableKeys<RpgStories>>(
            field: K,
            value: string,
          ) => string;
          between: <K extends QueryableKeys<RpgStories>>(
            field: K,
            start: ExtractQueryValue<RpgStories[K]>,
            end: ExtractQueryValue<RpgStories[K]>,
          ) => string;
          select: <K extends keyof RpgStories>(fields: K[]) => string;
          orderAsc: <K extends keyof RpgStories>(field: K) => string;
          orderDesc: <K extends keyof RpgStories>(field: K) => string;
          limit: (value: number) => string;
          offset: (value: number) => string;
          cursorAfter: (documentId: string) => string;
          cursorBefore: (documentId: string) => string;
          or: (...queries: string[]) => string;
          and: (...queries: string[]) => string;
        }) => string[];
      }) => Promise<{ total: number; rows: RpgStories[] }>;
    };
    'RPG Chapters': {
      create: (
        data: {
          story?:
            | (RpgStoriesCreate & { $id?: string; $permissions?: string[] })
            | string;
          number: number;
          content: string;
          finishedAt?: string | null;
          options?: (
            | (RpgOptionsCreate & { $id?: string; $permissions?: string[] })
            | string
          )[];
        },
        options?: {
          rowId?: string;
          permissions?: (
            permission: {
              read: (role: RoleString) => string;
              write: (role: RoleString) => string;
              create: (role: RoleString) => string;
              update: (role: RoleString) => string;
              delete: (role: RoleString) => string;
            },
            role: {
              any: () => RoleString;
              user: (userId: string, status?: string) => RoleString;
              users: (status?: string) => RoleString;
              guests: () => RoleString;
              team: (teamId: string, role?: string) => RoleString;
              member: (memberId: string) => RoleString;
              label: (label: string) => RoleString;
            },
          ) => string[];
          transactionId?: string;
        },
      ) => Promise<RpgChapters>;
      get: (id: string) => Promise<RpgChapters>;
      update: (
        id: string,
        data: Partial<{
          story?:
            | (RpgStoriesCreate & { $id?: string; $permissions?: string[] })
            | string;
          number: number;
          content: string;
          finishedAt?: string | null;
          options?: (
            | (RpgOptionsCreate & { $id?: string; $permissions?: string[] })
            | string
          )[];
        }>,
        options?: {
          permissions?: (
            permission: {
              read: (role: RoleString) => string;
              write: (role: RoleString) => string;
              create: (role: RoleString) => string;
              update: (role: RoleString) => string;
              delete: (role: RoleString) => string;
            },
            role: {
              any: () => RoleString;
              user: (userId: string, status?: string) => RoleString;
              users: (status?: string) => RoleString;
              guests: () => RoleString;
              team: (teamId: string, role?: string) => RoleString;
              member: (memberId: string) => RoleString;
              label: (label: string) => RoleString;
            },
          ) => string[];
          transactionId?: string;
        },
      ) => Promise<RpgChapters>;
      delete: (
        id: string,
        options?: { transactionId?: string },
      ) => Promise<void>;
      list: (options?: {
        queries?: (q: {
          equal: <K extends QueryableKeys<RpgChapters>>(
            field: K,
            value: ExtractQueryValue<RpgChapters[K]>,
          ) => string;
          notEqual: <K extends QueryableKeys<RpgChapters>>(
            field: K,
            value: ExtractQueryValue<RpgChapters[K]>,
          ) => string;
          lessThan: <K extends QueryableKeys<RpgChapters>>(
            field: K,
            value: ExtractQueryValue<RpgChapters[K]>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<RpgChapters>>(
            field: K,
            value: ExtractQueryValue<RpgChapters[K]>,
          ) => string;
          greaterThan: <K extends QueryableKeys<RpgChapters>>(
            field: K,
            value: ExtractQueryValue<RpgChapters[K]>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<RpgChapters>>(
            field: K,
            value: ExtractQueryValue<RpgChapters[K]>,
          ) => string;
          contains: <K extends QueryableKeys<RpgChapters>>(
            field: K,
            value: ExtractQueryValue<RpgChapters[K]>,
          ) => string;
          search: <K extends QueryableKeys<RpgChapters>>(
            field: K,
            value: string,
          ) => string;
          isNull: <K extends QueryableKeys<RpgChapters>>(field: K) => string;
          isNotNull: <K extends QueryableKeys<RpgChapters>>(field: K) => string;
          startsWith: <K extends QueryableKeys<RpgChapters>>(
            field: K,
            value: string,
          ) => string;
          endsWith: <K extends QueryableKeys<RpgChapters>>(
            field: K,
            value: string,
          ) => string;
          between: <K extends QueryableKeys<RpgChapters>>(
            field: K,
            start: ExtractQueryValue<RpgChapters[K]>,
            end: ExtractQueryValue<RpgChapters[K]>,
          ) => string;
          select: <K extends keyof RpgChapters>(fields: K[]) => string;
          orderAsc: <K extends keyof RpgChapters>(field: K) => string;
          orderDesc: <K extends keyof RpgChapters>(field: K) => string;
          limit: (value: number) => string;
          offset: (value: number) => string;
          cursorAfter: (documentId: string) => string;
          cursorBefore: (documentId: string) => string;
          or: (...queries: string[]) => string;
          and: (...queries: string[]) => string;
        }) => string[];
      }) => Promise<{ total: number; rows: RpgChapters[] }>;
    };
    'RPG Options': {
      create: (
        data: {
          chapter?:
            | (RpgChaptersCreate & { $id?: string; $permissions?: string[] })
            | string;
          description?: string | null;
          voteCount?: number;
          votes?: (
            | (RpgVotesCreate & { $id?: string; $permissions?: string[] })
            | string
          )[];
        },
        options?: {
          rowId?: string;
          permissions?: (
            permission: {
              read: (role: RoleString) => string;
              write: (role: RoleString) => string;
              create: (role: RoleString) => string;
              update: (role: RoleString) => string;
              delete: (role: RoleString) => string;
            },
            role: {
              any: () => RoleString;
              user: (userId: string, status?: string) => RoleString;
              users: (status?: string) => RoleString;
              guests: () => RoleString;
              team: (teamId: string, role?: string) => RoleString;
              member: (memberId: string) => RoleString;
              label: (label: string) => RoleString;
            },
          ) => string[];
          transactionId?: string;
        },
      ) => Promise<RpgOptions>;
      get: (id: string) => Promise<RpgOptions>;
      update: (
        id: string,
        data: Partial<{
          chapter?:
            | (RpgChaptersCreate & { $id?: string; $permissions?: string[] })
            | string;
          description?: string | null;
          voteCount?: number;
          votes?: (
            | (RpgVotesCreate & { $id?: string; $permissions?: string[] })
            | string
          )[];
        }>,
        options?: {
          permissions?: (
            permission: {
              read: (role: RoleString) => string;
              write: (role: RoleString) => string;
              create: (role: RoleString) => string;
              update: (role: RoleString) => string;
              delete: (role: RoleString) => string;
            },
            role: {
              any: () => RoleString;
              user: (userId: string, status?: string) => RoleString;
              users: (status?: string) => RoleString;
              guests: () => RoleString;
              team: (teamId: string, role?: string) => RoleString;
              member: (memberId: string) => RoleString;
              label: (label: string) => RoleString;
            },
          ) => string[];
          transactionId?: string;
        },
      ) => Promise<RpgOptions>;
      delete: (
        id: string,
        options?: { transactionId?: string },
      ) => Promise<void>;
      list: (options?: {
        queries?: (q: {
          equal: <K extends QueryableKeys<RpgOptions>>(
            field: K,
            value: ExtractQueryValue<RpgOptions[K]>,
          ) => string;
          notEqual: <K extends QueryableKeys<RpgOptions>>(
            field: K,
            value: ExtractQueryValue<RpgOptions[K]>,
          ) => string;
          lessThan: <K extends QueryableKeys<RpgOptions>>(
            field: K,
            value: ExtractQueryValue<RpgOptions[K]>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<RpgOptions>>(
            field: K,
            value: ExtractQueryValue<RpgOptions[K]>,
          ) => string;
          greaterThan: <K extends QueryableKeys<RpgOptions>>(
            field: K,
            value: ExtractQueryValue<RpgOptions[K]>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<RpgOptions>>(
            field: K,
            value: ExtractQueryValue<RpgOptions[K]>,
          ) => string;
          contains: <K extends QueryableKeys<RpgOptions>>(
            field: K,
            value: ExtractQueryValue<RpgOptions[K]>,
          ) => string;
          search: <K extends QueryableKeys<RpgOptions>>(
            field: K,
            value: string,
          ) => string;
          isNull: <K extends QueryableKeys<RpgOptions>>(field: K) => string;
          isNotNull: <K extends QueryableKeys<RpgOptions>>(field: K) => string;
          startsWith: <K extends QueryableKeys<RpgOptions>>(
            field: K,
            value: string,
          ) => string;
          endsWith: <K extends QueryableKeys<RpgOptions>>(
            field: K,
            value: string,
          ) => string;
          between: <K extends QueryableKeys<RpgOptions>>(
            field: K,
            start: ExtractQueryValue<RpgOptions[K]>,
            end: ExtractQueryValue<RpgOptions[K]>,
          ) => string;
          select: <K extends keyof RpgOptions>(fields: K[]) => string;
          orderAsc: <K extends keyof RpgOptions>(field: K) => string;
          orderDesc: <K extends keyof RpgOptions>(field: K) => string;
          limit: (value: number) => string;
          offset: (value: number) => string;
          cursorAfter: (documentId: string) => string;
          cursorBefore: (documentId: string) => string;
          or: (...queries: string[]) => string;
          and: (...queries: string[]) => string;
        }) => string[];
      }) => Promise<{ total: number; rows: RpgOptions[] }>;
    };
    'RPG Votes': {
      create: (
        data: {
          ownerFingerprint: string;
          option?:
            | (RpgOptionsCreate & { $id?: string; $permissions?: string[] })
            | string;
          weight?: number;
        },
        options?: {
          rowId?: string;
          permissions?: (
            permission: {
              read: (role: RoleString) => string;
              write: (role: RoleString) => string;
              create: (role: RoleString) => string;
              update: (role: RoleString) => string;
              delete: (role: RoleString) => string;
            },
            role: {
              any: () => RoleString;
              user: (userId: string, status?: string) => RoleString;
              users: (status?: string) => RoleString;
              guests: () => RoleString;
              team: (teamId: string, role?: string) => RoleString;
              member: (memberId: string) => RoleString;
              label: (label: string) => RoleString;
            },
          ) => string[];
          transactionId?: string;
        },
      ) => Promise<RpgVotes>;
      get: (id: string) => Promise<RpgVotes>;
      update: (
        id: string,
        data: Partial<{
          ownerFingerprint: string;
          option?:
            | (RpgOptionsCreate & { $id?: string; $permissions?: string[] })
            | string;
          weight?: number;
        }>,
        options?: {
          permissions?: (
            permission: {
              read: (role: RoleString) => string;
              write: (role: RoleString) => string;
              create: (role: RoleString) => string;
              update: (role: RoleString) => string;
              delete: (role: RoleString) => string;
            },
            role: {
              any: () => RoleString;
              user: (userId: string, status?: string) => RoleString;
              users: (status?: string) => RoleString;
              guests: () => RoleString;
              team: (teamId: string, role?: string) => RoleString;
              member: (memberId: string) => RoleString;
              label: (label: string) => RoleString;
            },
          ) => string[];
          transactionId?: string;
        },
      ) => Promise<RpgVotes>;
      delete: (
        id: string,
        options?: { transactionId?: string },
      ) => Promise<void>;
      list: (options?: {
        queries?: (q: {
          equal: <K extends QueryableKeys<RpgVotes>>(
            field: K,
            value: ExtractQueryValue<RpgVotes[K]>,
          ) => string;
          notEqual: <K extends QueryableKeys<RpgVotes>>(
            field: K,
            value: ExtractQueryValue<RpgVotes[K]>,
          ) => string;
          lessThan: <K extends QueryableKeys<RpgVotes>>(
            field: K,
            value: ExtractQueryValue<RpgVotes[K]>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<RpgVotes>>(
            field: K,
            value: ExtractQueryValue<RpgVotes[K]>,
          ) => string;
          greaterThan: <K extends QueryableKeys<RpgVotes>>(
            field: K,
            value: ExtractQueryValue<RpgVotes[K]>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<RpgVotes>>(
            field: K,
            value: ExtractQueryValue<RpgVotes[K]>,
          ) => string;
          contains: <K extends QueryableKeys<RpgVotes>>(
            field: K,
            value: ExtractQueryValue<RpgVotes[K]>,
          ) => string;
          search: <K extends QueryableKeys<RpgVotes>>(
            field: K,
            value: string,
          ) => string;
          isNull: <K extends QueryableKeys<RpgVotes>>(field: K) => string;
          isNotNull: <K extends QueryableKeys<RpgVotes>>(field: K) => string;
          startsWith: <K extends QueryableKeys<RpgVotes>>(
            field: K,
            value: string,
          ) => string;
          endsWith: <K extends QueryableKeys<RpgVotes>>(
            field: K,
            value: string,
          ) => string;
          between: <K extends QueryableKeys<RpgVotes>>(
            field: K,
            start: ExtractQueryValue<RpgVotes[K]>,
            end: ExtractQueryValue<RpgVotes[K]>,
          ) => string;
          select: <K extends keyof RpgVotes>(fields: K[]) => string;
          orderAsc: <K extends keyof RpgVotes>(field: K) => string;
          orderDesc: <K extends keyof RpgVotes>(field: K) => string;
          limit: (value: number) => string;
          offset: (value: number) => string;
          cursorAfter: (documentId: string) => string;
          cursorBefore: (documentId: string) => string;
          or: (...queries: string[]) => string;
          and: (...queries: string[]) => string;
        }) => string[];
      }) => Promise<{ total: number; rows: RpgVotes[] }>;
    };
  };
};

export type DatabaseHandle<D extends DatabaseId> = {
  use: <T extends keyof DatabaseTableMap[D] & string>(
    tableId: T,
  ) => DatabaseTableMap[D][T];
  create: (
    tableId: string,
    name: string,
    options?: {
      permissions?: (
        permission: {
          read: (role: RoleString) => string;
          write: (role: RoleString) => string;
          create: (role: RoleString) => string;
          update: (role: RoleString) => string;
          delete: (role: RoleString) => string;
        },
        role: {
          any: () => RoleString;
          user: (userId: string, status?: string) => RoleString;
          users: (status?: string) => RoleString;
          guests: () => RoleString;
          team: (teamId: string, role?: string) => RoleString;
          member: (memberId: string) => RoleString;
          label: (label: string) => RoleString;
        },
      ) => string[];
      rowSecurity?: boolean;
      enabled?: boolean;
      columns?: any[];
      indexes?: any[];
    },
  ) => Promise<Models.Table>;
  update: <T extends keyof DatabaseTableMap[D] & string>(
    tableId: T,
    options?: {
      name?: string;
      permissions?: (
        permission: {
          read: (role: RoleString) => string;
          write: (role: RoleString) => string;
          create: (role: RoleString) => string;
          update: (role: RoleString) => string;
          delete: (role: RoleString) => string;
        },
        role: {
          any: () => RoleString;
          user: (userId: string, status?: string) => RoleString;
          users: (status?: string) => RoleString;
          guests: () => RoleString;
          team: (teamId: string, role?: string) => RoleString;
          member: (memberId: string) => RoleString;
          label: (label: string) => RoleString;
        },
      ) => string[];
      rowSecurity?: boolean;
      enabled?: boolean;
    },
  ) => Promise<Models.Table>;
  delete: <T extends keyof DatabaseTableMap[D] & string>(
    tableId: T,
  ) => Promise<void>;
};

export type DatabaseTables = {
  use: <D extends DatabaseId>(databaseId: D) => DatabaseHandle<D>;
  create: (
    databaseId: string,
    name: string,
    options?: { enabled?: boolean },
  ) => Promise<Models.Database>;
  update: <D extends DatabaseId>(
    databaseId: D,
    options?: { name?: string; enabled?: boolean },
  ) => Promise<Models.Database>;
  delete: <D extends DatabaseId>(databaseId: D) => Promise<void>;
};
