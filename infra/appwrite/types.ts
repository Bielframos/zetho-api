import { type Models } from 'node-appwrite';

export enum GamesSyncStage {
  BASIC = 'basic',
  FULL = 'full',
}

export enum UserProfilesStatus {
  ACTIVE = 'active',
  PENDING_DELETION = 'pending_deletion',
}

export enum ZEntriesStatus {
  COMPLETED = 'completed',
  BACKLOG = 'backlog',
  DROPPED = 'dropped',
  PLAYING = 'playing',
  WISHLIST = 'wishlist',
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
}

export enum GamePlatformsType {
  CONSOLE = 'console',
  PC = 'pc',
  MOBILE = 'mobile',
}

export enum GameMediasType {
  KEY_ART = 'key_art',
  SCREENSHOT = 'screenshot',
  VIDEO = 'video',
}

export enum PostsStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
}

export enum PostsPostType {
  ARTICLE = 'article',
  REVIEW = 'review',
}

export enum SorteiosRewardPolicy {
  ONE_KEY = 'one_key',
  ALL_KEYS = 'all_keys',
}

export enum ChavesDeJogosStatus {
  AVAILABLE = 'available',
  DELIVERED = 'delivered',
}

export enum ChavesDeJogosPlatform {
  STEAM = 'steam',
  XBOX = 'xbox',
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
  involvedCompanies?: (
    | (CompaniesCreate & { $id?: string; $permissions?: string[] })
    | string
  )[];
  zStats?:
    | (ZEntryCountCreate & { $id?: string; $permissions?: string[] })
    | string;
  ratingAvg?: number;
  ratingCount?: number;
  ratingSum?: number;
  genres?: string[] | null;
  hypes?: number | null;
  zethoVersion?: number;
  syncStage?: GamesSyncStage | null;
  summaryPt?: string | null;
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
  involvedCompanies?: Companies[];
  zStats?: ZEntryCount;
  ratingAvg?: number;
  ratingCount?: number;
  ratingSum?: number;
  genres?: string[] | null;
  hypes?: number | null;
  zethoVersion?: number;
  syncStage?: GamesSyncStage | null;
  summaryPt?: string | null;
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
  fingerprint: string;
  status?: UserProfilesStatus;
  deletedAt?: string | null;
  socialXbox?: string | null;
  socialSteam?: string | null;
  socialPsn?: string | null;
  totalsHyped?: number;
  zcoinBalance?: number;
  inviteCode?: string | null;
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
  fingerprint: string;
  status?: UserProfilesStatus;
  deletedAt?: string | null;
  socialXbox?: string | null;
  socialSteam?: string | null;
  socialPsn?: string | null;
  totalsHyped?: number;
  zcoinBalance?: number;
  inviteCode?: string | null;
};

export type ZEntriesCreate = {
  status?: ZEntriesStatus | null;
  liked?: boolean | null;
  gameId: string;
  ownerFingerprint: string;
  processedAt?: string | null;
  hyped?: boolean | null;
};

export type ZEntries = Models.Row & {
  status?: ZEntriesStatus | null;
  liked?: boolean | null;
  gameId: string;
  ownerFingerprint: string;
  processedAt?: string | null;
  hyped?: boolean | null;
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
  game?: (GamesCreate & { $id?: string; $permissions?: string[] }) | string;
  likes?: number;
  hypedCount?: number;
};

export type ZEntryCount = Models.Row & {
  completedCount?: number;
  backlogCount?: number;
  droppedCount?: number;
  playingCount?: number;
  wishlistCount?: number;
  game?: Games;
  likes?: number;
  hypedCount?: number;
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
  hyped?: boolean | null;
  likedEver?: boolean | null;
  maxStatusReached?: ZEntriesReadOnlyStatus | null;
};

export type ZEntriesReadOnly = Models.Row & {
  status?: ZEntriesReadOnlyStatus | null;
  liked?: boolean | null;
  gameId: string;
  ownerFingerprint: string;
  hyped?: boolean | null;
  likedEver?: boolean | null;
  maxStatusReached?: ZEntriesReadOnlyStatus | null;
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

export type ConexesCreate = {
  requesterProfileId: string;
  targetProfileId: string;
};

export type Conexes = Models.Row & {
  requesterProfileId: string;
  targetProfileId: string;
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

export type GameMediasCreate = {
  game?: (GamesCreate & { $id?: string; $permissions?: string[] }) | string;
  type: GameMediasType;
  mediaId: string;
  name?: string | null;
};

export type GameMedias = Models.Row & {
  game?: Games;
  type: GameMediasType;
  mediaId: string;
  name?: string | null;
};

export type AutoresCreate = {
  name: string;
  slug: string;
  bio?: string | null;
  avatarUrl?: string | null;
  websiteUrl?: string | null;
};

export type Autores = Models.Row & {
  name: string;
  slug: string;
  bio?: string | null;
  avatarUrl?: string | null;
  websiteUrl?: string | null;
};

export type PostsCreate = {
  title: string;
  subtitle?: string | null;
  slug: string;
  body: string;
  mainImage?: string | null;
  status: PostsStatus;
  tags?: string[] | null;
  relatedGameIds?: string[] | null;
  seo?: string | null;
  originalSourceUrl?: string | null;
  author?: (AutoresCreate & { $id?: string; $permissions?: string[] }) | string;
  postType?: PostsPostType;
  reviewMeta?: string | null;
};

export type Posts = Models.Row & {
  title: string;
  subtitle?: string | null;
  slug: string;
  body: string;
  mainImage?: string | null;
  status: PostsStatus;
  tags?: string[] | null;
  relatedGameIds?: string[] | null;
  seo?: string | null;
  originalSourceUrl?: string | null;
  author?: Autores;
  postType?: PostsPostType;
  reviewMeta?: string | null;
};

export type ZCoinTransactionsCreate = {
  userId: string;
  amount: number;
  type: string;
  reason: string;
};

export type ZCoinTransactions = Models.Row & {
  userId: string;
  amount: number;
  type: string;
  reason: string;
};

export type SorteiosCreate = {
  game?: (GamesCreate & { $id?: string; $permissions?: string[] }) | string;
  rewardPolicy?: SorteiosRewardPolicy;
  basicProbability?: number;
  ticketPrice?: number;
  active?: boolean;
  activatedAt?: string | null;
  closedAt?: string | null;
};

export type Sorteios = Models.Row & {
  game?: Games;
  rewardPolicy?: SorteiosRewardPolicy;
  basicProbability?: number;
  ticketPrice?: number;
  active?: boolean;
  activatedAt?: string | null;
  closedAt?: string | null;
};

export type EntradasDeSorteioCreate = {
  raffleId: string;
  userId: string;
  ticketCount: number;
  totalCost: number;
  luckyNumbers?: string[] | null;
  won?: boolean;
  drawNumber: string;
};

export type EntradasDeSorteio = Models.Row & {
  raffleId: string;
  userId: string;
  ticketCount: number;
  totalCost: number;
  luckyNumbers?: string[] | null;
  won?: boolean;
  drawNumber: string;
};

export type ChavesDeJogosCreate = {
  gameId: string;
  raffleId: string;
  key: string;
  status?: ChavesDeJogosStatus;
  platform?: ChavesDeJogosPlatform;
  userWinnerId?: string | null;
};

export type ChavesDeJogos = Models.Row & {
  gameId: string;
  raffleId: string;
  key: string;
  status?: ChavesDeJogosStatus;
  platform?: ChavesDeJogosPlatform;
  userWinnerId?: string | null;
};

export type LogsDoAplicativoCreate = {
  type: string;
  relatedUserId?: string | null;
  metadata: string;
};

export type LogsDoAplicativo = Models.Row & {
  type: string;
  relatedUserId?: string | null;
  metadata: string;
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
}[keyof T];

export type QueryableFieldValue<T, K> = K extends keyof T
  ? ExtractQueryValue<T[K]>
  : never;

export type QueryBuilder<T> = {
  equal: <K extends QueryableKeys<T>>(
    field: K,
    value: QueryableFieldValue<T, K>,
  ) => string;
  notEqual: <K extends QueryableKeys<T>>(
    field: K,
    value: QueryableFieldValue<T, K>,
  ) => string;
  lessThan: <K extends QueryableKeys<T>>(
    field: K,
    value: QueryableFieldValue<T, K>,
  ) => string;
  lessThanEqual: <K extends QueryableKeys<T>>(
    field: K,
    value: QueryableFieldValue<T, K>,
  ) => string;
  greaterThan: <K extends QueryableKeys<T>>(
    field: K,
    value: QueryableFieldValue<T, K>,
  ) => string;
  greaterThanEqual: <K extends QueryableKeys<T>>(
    field: K,
    value: QueryableFieldValue<T, K>,
  ) => string;
  contains: <K extends QueryableKeys<T>>(
    field: K,
    value: QueryableFieldValue<T, K>,
  ) => string;
  search: <K extends QueryableKeys<T>>(field: K, value: string) => string;
  isNull: <K extends QueryableKeys<T>>(field: K) => string;
  isNotNull: <K extends QueryableKeys<T>>(field: K) => string;
  startsWith: <K extends QueryableKeys<T>>(field: K, value: string) => string;
  endsWith: <K extends QueryableKeys<T>>(field: K, value: string) => string;
  between: <K extends QueryableKeys<T>>(
    field: K,
    start: QueryableFieldValue<T, K>,
    end: QueryableFieldValue<T, K>,
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
            value: QueryableFieldValue<IgdbTokens, K>,
          ) => string;
          notEqual: <K extends QueryableKeys<IgdbTokens>>(
            field: K,
            value: QueryableFieldValue<IgdbTokens, K>,
          ) => string;
          lessThan: <K extends QueryableKeys<IgdbTokens>>(
            field: K,
            value: QueryableFieldValue<IgdbTokens, K>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<IgdbTokens>>(
            field: K,
            value: QueryableFieldValue<IgdbTokens, K>,
          ) => string;
          greaterThan: <K extends QueryableKeys<IgdbTokens>>(
            field: K,
            value: QueryableFieldValue<IgdbTokens, K>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<IgdbTokens>>(
            field: K,
            value: QueryableFieldValue<IgdbTokens, K>,
          ) => string;
          contains: <K extends QueryableKeys<IgdbTokens>>(
            field: K,
            value: QueryableFieldValue<IgdbTokens, K>,
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
            start: QueryableFieldValue<IgdbTokens, K>,
            end: QueryableFieldValue<IgdbTokens, K>,
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
              value: QueryableFieldValue<IgdbTokens, K>,
            ) => string;
            notEqual: <K extends QueryableKeys<IgdbTokens>>(
              field: K,
              value: QueryableFieldValue<IgdbTokens, K>,
            ) => string;
            lessThan: <K extends QueryableKeys<IgdbTokens>>(
              field: K,
              value: QueryableFieldValue<IgdbTokens, K>,
            ) => string;
            lessThanEqual: <K extends QueryableKeys<IgdbTokens>>(
              field: K,
              value: QueryableFieldValue<IgdbTokens, K>,
            ) => string;
            greaterThan: <K extends QueryableKeys<IgdbTokens>>(
              field: K,
              value: QueryableFieldValue<IgdbTokens, K>,
            ) => string;
            greaterThanEqual: <K extends QueryableKeys<IgdbTokens>>(
              field: K,
              value: QueryableFieldValue<IgdbTokens, K>,
            ) => string;
            contains: <K extends QueryableKeys<IgdbTokens>>(
              field: K,
              value: QueryableFieldValue<IgdbTokens, K>,
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
              start: QueryableFieldValue<IgdbTokens, K>,
              end: QueryableFieldValue<IgdbTokens, K>,
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
            value: QueryableFieldValue<IgdbTokens, K>,
          ) => string;
          notEqual: <K extends QueryableKeys<IgdbTokens>>(
            field: K,
            value: QueryableFieldValue<IgdbTokens, K>,
          ) => string;
          lessThan: <K extends QueryableKeys<IgdbTokens>>(
            field: K,
            value: QueryableFieldValue<IgdbTokens, K>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<IgdbTokens>>(
            field: K,
            value: QueryableFieldValue<IgdbTokens, K>,
          ) => string;
          greaterThan: <K extends QueryableKeys<IgdbTokens>>(
            field: K,
            value: QueryableFieldValue<IgdbTokens, K>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<IgdbTokens>>(
            field: K,
            value: QueryableFieldValue<IgdbTokens, K>,
          ) => string;
          contains: <K extends QueryableKeys<IgdbTokens>>(
            field: K,
            value: QueryableFieldValue<IgdbTokens, K>,
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
            start: QueryableFieldValue<IgdbTokens, K>,
            end: QueryableFieldValue<IgdbTokens, K>,
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
          involvedCompanies?: (
            | (CompaniesCreate & { $id?: string; $permissions?: string[] })
            | string
          )[];
          zStats?:
            | (ZEntryCountCreate & { $id?: string; $permissions?: string[] })
            | string;
          ratingAvg?: number;
          ratingCount?: number;
          ratingSum?: number;
          genres?: string[] | null;
          hypes?: number | null;
          zethoVersion?: number;
          syncStage?: GamesSyncStage | null;
          summaryPt?: string | null;
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
          involvedCompanies?: (
            | (CompaniesCreate & { $id?: string; $permissions?: string[] })
            | string
          )[];
          zStats?:
            | (ZEntryCountCreate & { $id?: string; $permissions?: string[] })
            | string;
          ratingAvg?: number;
          ratingCount?: number;
          ratingSum?: number;
          genres?: string[] | null;
          hypes?: number | null;
          zethoVersion?: number;
          syncStage?: GamesSyncStage | null;
          summaryPt?: string | null;
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
            value: QueryableFieldValue<Games, K>,
          ) => string;
          notEqual: <K extends QueryableKeys<Games>>(
            field: K,
            value: QueryableFieldValue<Games, K>,
          ) => string;
          lessThan: <K extends QueryableKeys<Games>>(
            field: K,
            value: QueryableFieldValue<Games, K>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<Games>>(
            field: K,
            value: QueryableFieldValue<Games, K>,
          ) => string;
          greaterThan: <K extends QueryableKeys<Games>>(
            field: K,
            value: QueryableFieldValue<Games, K>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<Games>>(
            field: K,
            value: QueryableFieldValue<Games, K>,
          ) => string;
          contains: <K extends QueryableKeys<Games>>(
            field: K,
            value: QueryableFieldValue<Games, K>,
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
            start: QueryableFieldValue<Games, K>,
            end: QueryableFieldValue<Games, K>,
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
            value: QueryableFieldValue<GameTypes, K>,
          ) => string;
          notEqual: <K extends QueryableKeys<GameTypes>>(
            field: K,
            value: QueryableFieldValue<GameTypes, K>,
          ) => string;
          lessThan: <K extends QueryableKeys<GameTypes>>(
            field: K,
            value: QueryableFieldValue<GameTypes, K>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<GameTypes>>(
            field: K,
            value: QueryableFieldValue<GameTypes, K>,
          ) => string;
          greaterThan: <K extends QueryableKeys<GameTypes>>(
            field: K,
            value: QueryableFieldValue<GameTypes, K>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<GameTypes>>(
            field: K,
            value: QueryableFieldValue<GameTypes, K>,
          ) => string;
          contains: <K extends QueryableKeys<GameTypes>>(
            field: K,
            value: QueryableFieldValue<GameTypes, K>,
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
            start: QueryableFieldValue<GameTypes, K>,
            end: QueryableFieldValue<GameTypes, K>,
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
              value: QueryableFieldValue<GameTypes, K>,
            ) => string;
            notEqual: <K extends QueryableKeys<GameTypes>>(
              field: K,
              value: QueryableFieldValue<GameTypes, K>,
            ) => string;
            lessThan: <K extends QueryableKeys<GameTypes>>(
              field: K,
              value: QueryableFieldValue<GameTypes, K>,
            ) => string;
            lessThanEqual: <K extends QueryableKeys<GameTypes>>(
              field: K,
              value: QueryableFieldValue<GameTypes, K>,
            ) => string;
            greaterThan: <K extends QueryableKeys<GameTypes>>(
              field: K,
              value: QueryableFieldValue<GameTypes, K>,
            ) => string;
            greaterThanEqual: <K extends QueryableKeys<GameTypes>>(
              field: K,
              value: QueryableFieldValue<GameTypes, K>,
            ) => string;
            contains: <K extends QueryableKeys<GameTypes>>(
              field: K,
              value: QueryableFieldValue<GameTypes, K>,
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
              start: QueryableFieldValue<GameTypes, K>,
              end: QueryableFieldValue<GameTypes, K>,
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
            value: QueryableFieldValue<GameTypes, K>,
          ) => string;
          notEqual: <K extends QueryableKeys<GameTypes>>(
            field: K,
            value: QueryableFieldValue<GameTypes, K>,
          ) => string;
          lessThan: <K extends QueryableKeys<GameTypes>>(
            field: K,
            value: QueryableFieldValue<GameTypes, K>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<GameTypes>>(
            field: K,
            value: QueryableFieldValue<GameTypes, K>,
          ) => string;
          greaterThan: <K extends QueryableKeys<GameTypes>>(
            field: K,
            value: QueryableFieldValue<GameTypes, K>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<GameTypes>>(
            field: K,
            value: QueryableFieldValue<GameTypes, K>,
          ) => string;
          contains: <K extends QueryableKeys<GameTypes>>(
            field: K,
            value: QueryableFieldValue<GameTypes, K>,
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
            start: QueryableFieldValue<GameTypes, K>,
            end: QueryableFieldValue<GameTypes, K>,
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
          status?: UserProfilesStatus;
          deletedAt?: string | null;
          socialXbox?: string | null;
          socialSteam?: string | null;
          socialPsn?: string | null;
          totalsHyped?: number;
          zcoinBalance?: number;
          inviteCode?: string | null;
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
          status?: UserProfilesStatus;
          deletedAt?: string | null;
          socialXbox?: string | null;
          socialSteam?: string | null;
          socialPsn?: string | null;
          totalsHyped?: number;
          zcoinBalance?: number;
          inviteCode?: string | null;
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
            value: QueryableFieldValue<UserProfiles, K>,
          ) => string;
          notEqual: <K extends QueryableKeys<UserProfiles>>(
            field: K,
            value: QueryableFieldValue<UserProfiles, K>,
          ) => string;
          lessThan: <K extends QueryableKeys<UserProfiles>>(
            field: K,
            value: QueryableFieldValue<UserProfiles, K>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<UserProfiles>>(
            field: K,
            value: QueryableFieldValue<UserProfiles, K>,
          ) => string;
          greaterThan: <K extends QueryableKeys<UserProfiles>>(
            field: K,
            value: QueryableFieldValue<UserProfiles, K>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<UserProfiles>>(
            field: K,
            value: QueryableFieldValue<UserProfiles, K>,
          ) => string;
          contains: <K extends QueryableKeys<UserProfiles>>(
            field: K,
            value: QueryableFieldValue<UserProfiles, K>,
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
            start: QueryableFieldValue<UserProfiles, K>,
            end: QueryableFieldValue<UserProfiles, K>,
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
            status?: UserProfilesStatus;
            deletedAt?: string | null;
            socialXbox?: string | null;
            socialSteam?: string | null;
            socialPsn?: string | null;
            totalsHyped?: number;
            zcoinBalance?: number;
            inviteCode?: string | null;
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
          status?: UserProfilesStatus;
          deletedAt?: string | null;
          socialXbox?: string | null;
          socialSteam?: string | null;
          socialPsn?: string | null;
          totalsHyped?: number;
          zcoinBalance?: number;
          inviteCode?: string | null;
        }>,
        options?: {
          queries?: (q: {
            equal: <K extends QueryableKeys<UserProfiles>>(
              field: K,
              value: QueryableFieldValue<UserProfiles, K>,
            ) => string;
            notEqual: <K extends QueryableKeys<UserProfiles>>(
              field: K,
              value: QueryableFieldValue<UserProfiles, K>,
            ) => string;
            lessThan: <K extends QueryableKeys<UserProfiles>>(
              field: K,
              value: QueryableFieldValue<UserProfiles, K>,
            ) => string;
            lessThanEqual: <K extends QueryableKeys<UserProfiles>>(
              field: K,
              value: QueryableFieldValue<UserProfiles, K>,
            ) => string;
            greaterThan: <K extends QueryableKeys<UserProfiles>>(
              field: K,
              value: QueryableFieldValue<UserProfiles, K>,
            ) => string;
            greaterThanEqual: <K extends QueryableKeys<UserProfiles>>(
              field: K,
              value: QueryableFieldValue<UserProfiles, K>,
            ) => string;
            contains: <K extends QueryableKeys<UserProfiles>>(
              field: K,
              value: QueryableFieldValue<UserProfiles, K>,
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
              start: QueryableFieldValue<UserProfiles, K>,
              end: QueryableFieldValue<UserProfiles, K>,
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
            value: QueryableFieldValue<UserProfiles, K>,
          ) => string;
          notEqual: <K extends QueryableKeys<UserProfiles>>(
            field: K,
            value: QueryableFieldValue<UserProfiles, K>,
          ) => string;
          lessThan: <K extends QueryableKeys<UserProfiles>>(
            field: K,
            value: QueryableFieldValue<UserProfiles, K>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<UserProfiles>>(
            field: K,
            value: QueryableFieldValue<UserProfiles, K>,
          ) => string;
          greaterThan: <K extends QueryableKeys<UserProfiles>>(
            field: K,
            value: QueryableFieldValue<UserProfiles, K>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<UserProfiles>>(
            field: K,
            value: QueryableFieldValue<UserProfiles, K>,
          ) => string;
          contains: <K extends QueryableKeys<UserProfiles>>(
            field: K,
            value: QueryableFieldValue<UserProfiles, K>,
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
            start: QueryableFieldValue<UserProfiles, K>,
            end: QueryableFieldValue<UserProfiles, K>,
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
          hyped?: boolean | null;
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
          hyped?: boolean | null;
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
            value: QueryableFieldValue<ZEntries, K>,
          ) => string;
          notEqual: <K extends QueryableKeys<ZEntries>>(
            field: K,
            value: QueryableFieldValue<ZEntries, K>,
          ) => string;
          lessThan: <K extends QueryableKeys<ZEntries>>(
            field: K,
            value: QueryableFieldValue<ZEntries, K>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<ZEntries>>(
            field: K,
            value: QueryableFieldValue<ZEntries, K>,
          ) => string;
          greaterThan: <K extends QueryableKeys<ZEntries>>(
            field: K,
            value: QueryableFieldValue<ZEntries, K>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<ZEntries>>(
            field: K,
            value: QueryableFieldValue<ZEntries, K>,
          ) => string;
          contains: <K extends QueryableKeys<ZEntries>>(
            field: K,
            value: QueryableFieldValue<ZEntries, K>,
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
            start: QueryableFieldValue<ZEntries, K>,
            end: QueryableFieldValue<ZEntries, K>,
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
            hyped?: boolean | null;
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
          hyped?: boolean | null;
        }>,
        options?: {
          queries?: (q: {
            equal: <K extends QueryableKeys<ZEntries>>(
              field: K,
              value: QueryableFieldValue<ZEntries, K>,
            ) => string;
            notEqual: <K extends QueryableKeys<ZEntries>>(
              field: K,
              value: QueryableFieldValue<ZEntries, K>,
            ) => string;
            lessThan: <K extends QueryableKeys<ZEntries>>(
              field: K,
              value: QueryableFieldValue<ZEntries, K>,
            ) => string;
            lessThanEqual: <K extends QueryableKeys<ZEntries>>(
              field: K,
              value: QueryableFieldValue<ZEntries, K>,
            ) => string;
            greaterThan: <K extends QueryableKeys<ZEntries>>(
              field: K,
              value: QueryableFieldValue<ZEntries, K>,
            ) => string;
            greaterThanEqual: <K extends QueryableKeys<ZEntries>>(
              field: K,
              value: QueryableFieldValue<ZEntries, K>,
            ) => string;
            contains: <K extends QueryableKeys<ZEntries>>(
              field: K,
              value: QueryableFieldValue<ZEntries, K>,
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
              start: QueryableFieldValue<ZEntries, K>,
              end: QueryableFieldValue<ZEntries, K>,
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
            value: QueryableFieldValue<ZEntries, K>,
          ) => string;
          notEqual: <K extends QueryableKeys<ZEntries>>(
            field: K,
            value: QueryableFieldValue<ZEntries, K>,
          ) => string;
          lessThan: <K extends QueryableKeys<ZEntries>>(
            field: K,
            value: QueryableFieldValue<ZEntries, K>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<ZEntries>>(
            field: K,
            value: QueryableFieldValue<ZEntries, K>,
          ) => string;
          greaterThan: <K extends QueryableKeys<ZEntries>>(
            field: K,
            value: QueryableFieldValue<ZEntries, K>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<ZEntries>>(
            field: K,
            value: QueryableFieldValue<ZEntries, K>,
          ) => string;
          contains: <K extends QueryableKeys<ZEntries>>(
            field: K,
            value: QueryableFieldValue<ZEntries, K>,
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
            start: QueryableFieldValue<ZEntries, K>,
            end: QueryableFieldValue<ZEntries, K>,
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
            value: QueryableFieldValue<Companies, K>,
          ) => string;
          notEqual: <K extends QueryableKeys<Companies>>(
            field: K,
            value: QueryableFieldValue<Companies, K>,
          ) => string;
          lessThan: <K extends QueryableKeys<Companies>>(
            field: K,
            value: QueryableFieldValue<Companies, K>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<Companies>>(
            field: K,
            value: QueryableFieldValue<Companies, K>,
          ) => string;
          greaterThan: <K extends QueryableKeys<Companies>>(
            field: K,
            value: QueryableFieldValue<Companies, K>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<Companies>>(
            field: K,
            value: QueryableFieldValue<Companies, K>,
          ) => string;
          contains: <K extends QueryableKeys<Companies>>(
            field: K,
            value: QueryableFieldValue<Companies, K>,
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
            start: QueryableFieldValue<Companies, K>,
            end: QueryableFieldValue<Companies, K>,
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
              value: QueryableFieldValue<Companies, K>,
            ) => string;
            notEqual: <K extends QueryableKeys<Companies>>(
              field: K,
              value: QueryableFieldValue<Companies, K>,
            ) => string;
            lessThan: <K extends QueryableKeys<Companies>>(
              field: K,
              value: QueryableFieldValue<Companies, K>,
            ) => string;
            lessThanEqual: <K extends QueryableKeys<Companies>>(
              field: K,
              value: QueryableFieldValue<Companies, K>,
            ) => string;
            greaterThan: <K extends QueryableKeys<Companies>>(
              field: K,
              value: QueryableFieldValue<Companies, K>,
            ) => string;
            greaterThanEqual: <K extends QueryableKeys<Companies>>(
              field: K,
              value: QueryableFieldValue<Companies, K>,
            ) => string;
            contains: <K extends QueryableKeys<Companies>>(
              field: K,
              value: QueryableFieldValue<Companies, K>,
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
              start: QueryableFieldValue<Companies, K>,
              end: QueryableFieldValue<Companies, K>,
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
            value: QueryableFieldValue<Companies, K>,
          ) => string;
          notEqual: <K extends QueryableKeys<Companies>>(
            field: K,
            value: QueryableFieldValue<Companies, K>,
          ) => string;
          lessThan: <K extends QueryableKeys<Companies>>(
            field: K,
            value: QueryableFieldValue<Companies, K>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<Companies>>(
            field: K,
            value: QueryableFieldValue<Companies, K>,
          ) => string;
          greaterThan: <K extends QueryableKeys<Companies>>(
            field: K,
            value: QueryableFieldValue<Companies, K>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<Companies>>(
            field: K,
            value: QueryableFieldValue<Companies, K>,
          ) => string;
          contains: <K extends QueryableKeys<Companies>>(
            field: K,
            value: QueryableFieldValue<Companies, K>,
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
            start: QueryableFieldValue<Companies, K>,
            end: QueryableFieldValue<Companies, K>,
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
          hypedCount?: number;
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
          hypedCount?: number;
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
            value: QueryableFieldValue<ZEntryCount, K>,
          ) => string;
          notEqual: <K extends QueryableKeys<ZEntryCount>>(
            field: K,
            value: QueryableFieldValue<ZEntryCount, K>,
          ) => string;
          lessThan: <K extends QueryableKeys<ZEntryCount>>(
            field: K,
            value: QueryableFieldValue<ZEntryCount, K>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<ZEntryCount>>(
            field: K,
            value: QueryableFieldValue<ZEntryCount, K>,
          ) => string;
          greaterThan: <K extends QueryableKeys<ZEntryCount>>(
            field: K,
            value: QueryableFieldValue<ZEntryCount, K>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<ZEntryCount>>(
            field: K,
            value: QueryableFieldValue<ZEntryCount, K>,
          ) => string;
          contains: <K extends QueryableKeys<ZEntryCount>>(
            field: K,
            value: QueryableFieldValue<ZEntryCount, K>,
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
            start: QueryableFieldValue<ZEntryCount, K>,
            end: QueryableFieldValue<ZEntryCount, K>,
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
            value: QueryableFieldValue<GameComments, K>,
          ) => string;
          notEqual: <K extends QueryableKeys<GameComments>>(
            field: K,
            value: QueryableFieldValue<GameComments, K>,
          ) => string;
          lessThan: <K extends QueryableKeys<GameComments>>(
            field: K,
            value: QueryableFieldValue<GameComments, K>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<GameComments>>(
            field: K,
            value: QueryableFieldValue<GameComments, K>,
          ) => string;
          greaterThan: <K extends QueryableKeys<GameComments>>(
            field: K,
            value: QueryableFieldValue<GameComments, K>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<GameComments>>(
            field: K,
            value: QueryableFieldValue<GameComments, K>,
          ) => string;
          contains: <K extends QueryableKeys<GameComments>>(
            field: K,
            value: QueryableFieldValue<GameComments, K>,
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
            start: QueryableFieldValue<GameComments, K>,
            end: QueryableFieldValue<GameComments, K>,
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
            value: QueryableFieldValue<GameCommentVotes, K>,
          ) => string;
          notEqual: <K extends QueryableKeys<GameCommentVotes>>(
            field: K,
            value: QueryableFieldValue<GameCommentVotes, K>,
          ) => string;
          lessThan: <K extends QueryableKeys<GameCommentVotes>>(
            field: K,
            value: QueryableFieldValue<GameCommentVotes, K>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<GameCommentVotes>>(
            field: K,
            value: QueryableFieldValue<GameCommentVotes, K>,
          ) => string;
          greaterThan: <K extends QueryableKeys<GameCommentVotes>>(
            field: K,
            value: QueryableFieldValue<GameCommentVotes, K>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<GameCommentVotes>>(
            field: K,
            value: QueryableFieldValue<GameCommentVotes, K>,
          ) => string;
          contains: <K extends QueryableKeys<GameCommentVotes>>(
            field: K,
            value: QueryableFieldValue<GameCommentVotes, K>,
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
            start: QueryableFieldValue<GameCommentVotes, K>,
            end: QueryableFieldValue<GameCommentVotes, K>,
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
            value: QueryableFieldValue<Lists, K>,
          ) => string;
          notEqual: <K extends QueryableKeys<Lists>>(
            field: K,
            value: QueryableFieldValue<Lists, K>,
          ) => string;
          lessThan: <K extends QueryableKeys<Lists>>(
            field: K,
            value: QueryableFieldValue<Lists, K>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<Lists>>(
            field: K,
            value: QueryableFieldValue<Lists, K>,
          ) => string;
          greaterThan: <K extends QueryableKeys<Lists>>(
            field: K,
            value: QueryableFieldValue<Lists, K>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<Lists>>(
            field: K,
            value: QueryableFieldValue<Lists, K>,
          ) => string;
          contains: <K extends QueryableKeys<Lists>>(
            field: K,
            value: QueryableFieldValue<Lists, K>,
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
            start: QueryableFieldValue<Lists, K>,
            end: QueryableFieldValue<Lists, K>,
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
              value: QueryableFieldValue<Lists, K>,
            ) => string;
            notEqual: <K extends QueryableKeys<Lists>>(
              field: K,
              value: QueryableFieldValue<Lists, K>,
            ) => string;
            lessThan: <K extends QueryableKeys<Lists>>(
              field: K,
              value: QueryableFieldValue<Lists, K>,
            ) => string;
            lessThanEqual: <K extends QueryableKeys<Lists>>(
              field: K,
              value: QueryableFieldValue<Lists, K>,
            ) => string;
            greaterThan: <K extends QueryableKeys<Lists>>(
              field: K,
              value: QueryableFieldValue<Lists, K>,
            ) => string;
            greaterThanEqual: <K extends QueryableKeys<Lists>>(
              field: K,
              value: QueryableFieldValue<Lists, K>,
            ) => string;
            contains: <K extends QueryableKeys<Lists>>(
              field: K,
              value: QueryableFieldValue<Lists, K>,
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
              start: QueryableFieldValue<Lists, K>,
              end: QueryableFieldValue<Lists, K>,
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
            value: QueryableFieldValue<Lists, K>,
          ) => string;
          notEqual: <K extends QueryableKeys<Lists>>(
            field: K,
            value: QueryableFieldValue<Lists, K>,
          ) => string;
          lessThan: <K extends QueryableKeys<Lists>>(
            field: K,
            value: QueryableFieldValue<Lists, K>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<Lists>>(
            field: K,
            value: QueryableFieldValue<Lists, K>,
          ) => string;
          greaterThan: <K extends QueryableKeys<Lists>>(
            field: K,
            value: QueryableFieldValue<Lists, K>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<Lists>>(
            field: K,
            value: QueryableFieldValue<Lists, K>,
          ) => string;
          contains: <K extends QueryableKeys<Lists>>(
            field: K,
            value: QueryableFieldValue<Lists, K>,
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
            start: QueryableFieldValue<Lists, K>,
            end: QueryableFieldValue<Lists, K>,
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
            value: QueryableFieldValue<ListItems, K>,
          ) => string;
          notEqual: <K extends QueryableKeys<ListItems>>(
            field: K,
            value: QueryableFieldValue<ListItems, K>,
          ) => string;
          lessThan: <K extends QueryableKeys<ListItems>>(
            field: K,
            value: QueryableFieldValue<ListItems, K>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<ListItems>>(
            field: K,
            value: QueryableFieldValue<ListItems, K>,
          ) => string;
          greaterThan: <K extends QueryableKeys<ListItems>>(
            field: K,
            value: QueryableFieldValue<ListItems, K>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<ListItems>>(
            field: K,
            value: QueryableFieldValue<ListItems, K>,
          ) => string;
          contains: <K extends QueryableKeys<ListItems>>(
            field: K,
            value: QueryableFieldValue<ListItems, K>,
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
            start: QueryableFieldValue<ListItems, K>,
            end: QueryableFieldValue<ListItems, K>,
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
          hyped?: boolean | null;
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
          hyped?: boolean | null;
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
            value: QueryableFieldValue<ZEntriesReadOnly, K>,
          ) => string;
          notEqual: <K extends QueryableKeys<ZEntriesReadOnly>>(
            field: K,
            value: QueryableFieldValue<ZEntriesReadOnly, K>,
          ) => string;
          lessThan: <K extends QueryableKeys<ZEntriesReadOnly>>(
            field: K,
            value: QueryableFieldValue<ZEntriesReadOnly, K>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<ZEntriesReadOnly>>(
            field: K,
            value: QueryableFieldValue<ZEntriesReadOnly, K>,
          ) => string;
          greaterThan: <K extends QueryableKeys<ZEntriesReadOnly>>(
            field: K,
            value: QueryableFieldValue<ZEntriesReadOnly, K>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<ZEntriesReadOnly>>(
            field: K,
            value: QueryableFieldValue<ZEntriesReadOnly, K>,
          ) => string;
          contains: <K extends QueryableKeys<ZEntriesReadOnly>>(
            field: K,
            value: QueryableFieldValue<ZEntriesReadOnly, K>,
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
            start: QueryableFieldValue<ZEntriesReadOnly, K>,
            end: QueryableFieldValue<ZEntriesReadOnly, K>,
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
            hyped?: boolean | null;
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
          hyped?: boolean | null;
        }>,
        options?: {
          queries?: (q: {
            equal: <K extends QueryableKeys<ZEntriesReadOnly>>(
              field: K,
              value: QueryableFieldValue<ZEntriesReadOnly, K>,
            ) => string;
            notEqual: <K extends QueryableKeys<ZEntriesReadOnly>>(
              field: K,
              value: QueryableFieldValue<ZEntriesReadOnly, K>,
            ) => string;
            lessThan: <K extends QueryableKeys<ZEntriesReadOnly>>(
              field: K,
              value: QueryableFieldValue<ZEntriesReadOnly, K>,
            ) => string;
            lessThanEqual: <K extends QueryableKeys<ZEntriesReadOnly>>(
              field: K,
              value: QueryableFieldValue<ZEntriesReadOnly, K>,
            ) => string;
            greaterThan: <K extends QueryableKeys<ZEntriesReadOnly>>(
              field: K,
              value: QueryableFieldValue<ZEntriesReadOnly, K>,
            ) => string;
            greaterThanEqual: <K extends QueryableKeys<ZEntriesReadOnly>>(
              field: K,
              value: QueryableFieldValue<ZEntriesReadOnly, K>,
            ) => string;
            contains: <K extends QueryableKeys<ZEntriesReadOnly>>(
              field: K,
              value: QueryableFieldValue<ZEntriesReadOnly, K>,
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
              start: QueryableFieldValue<ZEntriesReadOnly, K>,
              end: QueryableFieldValue<ZEntriesReadOnly, K>,
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
            value: QueryableFieldValue<ZEntriesReadOnly, K>,
          ) => string;
          notEqual: <K extends QueryableKeys<ZEntriesReadOnly>>(
            field: K,
            value: QueryableFieldValue<ZEntriesReadOnly, K>,
          ) => string;
          lessThan: <K extends QueryableKeys<ZEntriesReadOnly>>(
            field: K,
            value: QueryableFieldValue<ZEntriesReadOnly, K>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<ZEntriesReadOnly>>(
            field: K,
            value: QueryableFieldValue<ZEntriesReadOnly, K>,
          ) => string;
          greaterThan: <K extends QueryableKeys<ZEntriesReadOnly>>(
            field: K,
            value: QueryableFieldValue<ZEntriesReadOnly, K>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<ZEntriesReadOnly>>(
            field: K,
            value: QueryableFieldValue<ZEntriesReadOnly, K>,
          ) => string;
          contains: <K extends QueryableKeys<ZEntriesReadOnly>>(
            field: K,
            value: QueryableFieldValue<ZEntriesReadOnly, K>,
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
            start: QueryableFieldValue<ZEntriesReadOnly, K>,
            end: QueryableFieldValue<ZEntriesReadOnly, K>,
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
            value: QueryableFieldValue<GamePlatforms, K>,
          ) => string;
          notEqual: <K extends QueryableKeys<GamePlatforms>>(
            field: K,
            value: QueryableFieldValue<GamePlatforms, K>,
          ) => string;
          lessThan: <K extends QueryableKeys<GamePlatforms>>(
            field: K,
            value: QueryableFieldValue<GamePlatforms, K>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<GamePlatforms>>(
            field: K,
            value: QueryableFieldValue<GamePlatforms, K>,
          ) => string;
          greaterThan: <K extends QueryableKeys<GamePlatforms>>(
            field: K,
            value: QueryableFieldValue<GamePlatforms, K>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<GamePlatforms>>(
            field: K,
            value: QueryableFieldValue<GamePlatforms, K>,
          ) => string;
          contains: <K extends QueryableKeys<GamePlatforms>>(
            field: K,
            value: QueryableFieldValue<GamePlatforms, K>,
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
            start: QueryableFieldValue<GamePlatforms, K>,
            end: QueryableFieldValue<GamePlatforms, K>,
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
              value: QueryableFieldValue<GamePlatforms, K>,
            ) => string;
            notEqual: <K extends QueryableKeys<GamePlatforms>>(
              field: K,
              value: QueryableFieldValue<GamePlatforms, K>,
            ) => string;
            lessThan: <K extends QueryableKeys<GamePlatforms>>(
              field: K,
              value: QueryableFieldValue<GamePlatforms, K>,
            ) => string;
            lessThanEqual: <K extends QueryableKeys<GamePlatforms>>(
              field: K,
              value: QueryableFieldValue<GamePlatforms, K>,
            ) => string;
            greaterThan: <K extends QueryableKeys<GamePlatforms>>(
              field: K,
              value: QueryableFieldValue<GamePlatforms, K>,
            ) => string;
            greaterThanEqual: <K extends QueryableKeys<GamePlatforms>>(
              field: K,
              value: QueryableFieldValue<GamePlatforms, K>,
            ) => string;
            contains: <K extends QueryableKeys<GamePlatforms>>(
              field: K,
              value: QueryableFieldValue<GamePlatforms, K>,
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
              start: QueryableFieldValue<GamePlatforms, K>,
              end: QueryableFieldValue<GamePlatforms, K>,
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
            value: QueryableFieldValue<GamePlatforms, K>,
          ) => string;
          notEqual: <K extends QueryableKeys<GamePlatforms>>(
            field: K,
            value: QueryableFieldValue<GamePlatforms, K>,
          ) => string;
          lessThan: <K extends QueryableKeys<GamePlatforms>>(
            field: K,
            value: QueryableFieldValue<GamePlatforms, K>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<GamePlatforms>>(
            field: K,
            value: QueryableFieldValue<GamePlatforms, K>,
          ) => string;
          greaterThan: <K extends QueryableKeys<GamePlatforms>>(
            field: K,
            value: QueryableFieldValue<GamePlatforms, K>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<GamePlatforms>>(
            field: K,
            value: QueryableFieldValue<GamePlatforms, K>,
          ) => string;
          contains: <K extends QueryableKeys<GamePlatforms>>(
            field: K,
            value: QueryableFieldValue<GamePlatforms, K>,
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
            start: QueryableFieldValue<GamePlatforms, K>,
            end: QueryableFieldValue<GamePlatforms, K>,
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
            value: QueryableFieldValue<Avaliaes, K>,
          ) => string;
          notEqual: <K extends QueryableKeys<Avaliaes>>(
            field: K,
            value: QueryableFieldValue<Avaliaes, K>,
          ) => string;
          lessThan: <K extends QueryableKeys<Avaliaes>>(
            field: K,
            value: QueryableFieldValue<Avaliaes, K>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<Avaliaes>>(
            field: K,
            value: QueryableFieldValue<Avaliaes, K>,
          ) => string;
          greaterThan: <K extends QueryableKeys<Avaliaes>>(
            field: K,
            value: QueryableFieldValue<Avaliaes, K>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<Avaliaes>>(
            field: K,
            value: QueryableFieldValue<Avaliaes, K>,
          ) => string;
          contains: <K extends QueryableKeys<Avaliaes>>(
            field: K,
            value: QueryableFieldValue<Avaliaes, K>,
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
            start: QueryableFieldValue<Avaliaes, K>,
            end: QueryableFieldValue<Avaliaes, K>,
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
              value: QueryableFieldValue<Avaliaes, K>,
            ) => string;
            notEqual: <K extends QueryableKeys<Avaliaes>>(
              field: K,
              value: QueryableFieldValue<Avaliaes, K>,
            ) => string;
            lessThan: <K extends QueryableKeys<Avaliaes>>(
              field: K,
              value: QueryableFieldValue<Avaliaes, K>,
            ) => string;
            lessThanEqual: <K extends QueryableKeys<Avaliaes>>(
              field: K,
              value: QueryableFieldValue<Avaliaes, K>,
            ) => string;
            greaterThan: <K extends QueryableKeys<Avaliaes>>(
              field: K,
              value: QueryableFieldValue<Avaliaes, K>,
            ) => string;
            greaterThanEqual: <K extends QueryableKeys<Avaliaes>>(
              field: K,
              value: QueryableFieldValue<Avaliaes, K>,
            ) => string;
            contains: <K extends QueryableKeys<Avaliaes>>(
              field: K,
              value: QueryableFieldValue<Avaliaes, K>,
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
              start: QueryableFieldValue<Avaliaes, K>,
              end: QueryableFieldValue<Avaliaes, K>,
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
            value: QueryableFieldValue<Avaliaes, K>,
          ) => string;
          notEqual: <K extends QueryableKeys<Avaliaes>>(
            field: K,
            value: QueryableFieldValue<Avaliaes, K>,
          ) => string;
          lessThan: <K extends QueryableKeys<Avaliaes>>(
            field: K,
            value: QueryableFieldValue<Avaliaes, K>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<Avaliaes>>(
            field: K,
            value: QueryableFieldValue<Avaliaes, K>,
          ) => string;
          greaterThan: <K extends QueryableKeys<Avaliaes>>(
            field: K,
            value: QueryableFieldValue<Avaliaes, K>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<Avaliaes>>(
            field: K,
            value: QueryableFieldValue<Avaliaes, K>,
          ) => string;
          contains: <K extends QueryableKeys<Avaliaes>>(
            field: K,
            value: QueryableFieldValue<Avaliaes, K>,
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
            start: QueryableFieldValue<Avaliaes, K>,
            end: QueryableFieldValue<Avaliaes, K>,
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
    Conexões: {
      create: (
        data: {
          requesterProfileId: string;
          targetProfileId: string;
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
      ) => Promise<Conexes>;
      get: (id: string) => Promise<Conexes>;
      update: (
        id: string,
        data: Partial<{
          requesterProfileId: string;
          targetProfileId: string;
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
      ) => Promise<Conexes>;
      delete: (
        id: string,
        options?: { transactionId?: string },
      ) => Promise<void>;
      list: (options?: {
        queries?: (q: {
          equal: <K extends QueryableKeys<Conexes>>(
            field: K,
            value: QueryableFieldValue<Conexes, K>,
          ) => string;
          notEqual: <K extends QueryableKeys<Conexes>>(
            field: K,
            value: QueryableFieldValue<Conexes, K>,
          ) => string;
          lessThan: <K extends QueryableKeys<Conexes>>(
            field: K,
            value: QueryableFieldValue<Conexes, K>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<Conexes>>(
            field: K,
            value: QueryableFieldValue<Conexes, K>,
          ) => string;
          greaterThan: <K extends QueryableKeys<Conexes>>(
            field: K,
            value: QueryableFieldValue<Conexes, K>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<Conexes>>(
            field: K,
            value: QueryableFieldValue<Conexes, K>,
          ) => string;
          contains: <K extends QueryableKeys<Conexes>>(
            field: K,
            value: QueryableFieldValue<Conexes, K>,
          ) => string;
          search: <K extends QueryableKeys<Conexes>>(
            field: K,
            value: string,
          ) => string;
          isNull: <K extends QueryableKeys<Conexes>>(field: K) => string;
          isNotNull: <K extends QueryableKeys<Conexes>>(field: K) => string;
          startsWith: <K extends QueryableKeys<Conexes>>(
            field: K,
            value: string,
          ) => string;
          endsWith: <K extends QueryableKeys<Conexes>>(
            field: K,
            value: string,
          ) => string;
          between: <K extends QueryableKeys<Conexes>>(
            field: K,
            start: QueryableFieldValue<Conexes, K>,
            end: QueryableFieldValue<Conexes, K>,
          ) => string;
          select: <K extends keyof Conexes>(fields: K[]) => string;
          orderAsc: <K extends keyof Conexes>(field: K) => string;
          orderDesc: <K extends keyof Conexes>(field: K) => string;
          limit: (value: number) => string;
          offset: (value: number) => string;
          cursorAfter: (documentId: string) => string;
          cursorBefore: (documentId: string) => string;
          or: (...queries: string[]) => string;
          and: (...queries: string[]) => string;
        }) => string[];
      }) => Promise<{ total: number; rows: Conexes[] }>;
      createMany: (
        rows: Array<
          {
            requesterProfileId: string;
            targetProfileId: string;
          } & { $id?: string; $permissions?: string[] }
        >,
        options?: { transactionId?: string },
      ) => Promise<{ total: number; rows: Conexes[] }>;
      updateMany: (
        data: Partial<{
          requesterProfileId: string;
          targetProfileId: string;
        }>,
        options?: {
          queries?: (q: {
            equal: <K extends QueryableKeys<Conexes>>(
              field: K,
              value: QueryableFieldValue<Conexes, K>,
            ) => string;
            notEqual: <K extends QueryableKeys<Conexes>>(
              field: K,
              value: QueryableFieldValue<Conexes, K>,
            ) => string;
            lessThan: <K extends QueryableKeys<Conexes>>(
              field: K,
              value: QueryableFieldValue<Conexes, K>,
            ) => string;
            lessThanEqual: <K extends QueryableKeys<Conexes>>(
              field: K,
              value: QueryableFieldValue<Conexes, K>,
            ) => string;
            greaterThan: <K extends QueryableKeys<Conexes>>(
              field: K,
              value: QueryableFieldValue<Conexes, K>,
            ) => string;
            greaterThanEqual: <K extends QueryableKeys<Conexes>>(
              field: K,
              value: QueryableFieldValue<Conexes, K>,
            ) => string;
            contains: <K extends QueryableKeys<Conexes>>(
              field: K,
              value: QueryableFieldValue<Conexes, K>,
            ) => string;
            search: <K extends QueryableKeys<Conexes>>(
              field: K,
              value: string,
            ) => string;
            isNull: <K extends QueryableKeys<Conexes>>(field: K) => string;
            isNotNull: <K extends QueryableKeys<Conexes>>(field: K) => string;
            startsWith: <K extends QueryableKeys<Conexes>>(
              field: K,
              value: string,
            ) => string;
            endsWith: <K extends QueryableKeys<Conexes>>(
              field: K,
              value: string,
            ) => string;
            between: <K extends QueryableKeys<Conexes>>(
              field: K,
              start: QueryableFieldValue<Conexes, K>,
              end: QueryableFieldValue<Conexes, K>,
            ) => string;
            select: <K extends keyof Conexes>(fields: K[]) => string;
            orderAsc: <K extends keyof Conexes>(field: K) => string;
            orderDesc: <K extends keyof Conexes>(field: K) => string;
            limit: (value: number) => string;
            offset: (value: number) => string;
            cursorAfter: (documentId: string) => string;
            cursorBefore: (documentId: string) => string;
            or: (...queries: string[]) => string;
            and: (...queries: string[]) => string;
          }) => string[];
          transactionId?: string;
        },
      ) => Promise<{ total: number; rows: Conexes[] }>;
      deleteMany: (options?: {
        queries?: (q: {
          equal: <K extends QueryableKeys<Conexes>>(
            field: K,
            value: QueryableFieldValue<Conexes, K>,
          ) => string;
          notEqual: <K extends QueryableKeys<Conexes>>(
            field: K,
            value: QueryableFieldValue<Conexes, K>,
          ) => string;
          lessThan: <K extends QueryableKeys<Conexes>>(
            field: K,
            value: QueryableFieldValue<Conexes, K>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<Conexes>>(
            field: K,
            value: QueryableFieldValue<Conexes, K>,
          ) => string;
          greaterThan: <K extends QueryableKeys<Conexes>>(
            field: K,
            value: QueryableFieldValue<Conexes, K>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<Conexes>>(
            field: K,
            value: QueryableFieldValue<Conexes, K>,
          ) => string;
          contains: <K extends QueryableKeys<Conexes>>(
            field: K,
            value: QueryableFieldValue<Conexes, K>,
          ) => string;
          search: <K extends QueryableKeys<Conexes>>(
            field: K,
            value: string,
          ) => string;
          isNull: <K extends QueryableKeys<Conexes>>(field: K) => string;
          isNotNull: <K extends QueryableKeys<Conexes>>(field: K) => string;
          startsWith: <K extends QueryableKeys<Conexes>>(
            field: K,
            value: string,
          ) => string;
          endsWith: <K extends QueryableKeys<Conexes>>(
            field: K,
            value: string,
          ) => string;
          between: <K extends QueryableKeys<Conexes>>(
            field: K,
            start: QueryableFieldValue<Conexes, K>,
            end: QueryableFieldValue<Conexes, K>,
          ) => string;
          select: <K extends keyof Conexes>(fields: K[]) => string;
          orderAsc: <K extends keyof Conexes>(field: K) => string;
          orderDesc: <K extends keyof Conexes>(field: K) => string;
          limit: (value: number) => string;
          offset: (value: number) => string;
          cursorAfter: (documentId: string) => string;
          cursorBefore: (documentId: string) => string;
          or: (...queries: string[]) => string;
          and: (...queries: string[]) => string;
        }) => string[];
        transactionId?: string;
      }) => Promise<{ total: number; rows: Conexes[] }>;
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
            value: QueryableFieldValue<Genres, K>,
          ) => string;
          notEqual: <K extends QueryableKeys<Genres>>(
            field: K,
            value: QueryableFieldValue<Genres, K>,
          ) => string;
          lessThan: <K extends QueryableKeys<Genres>>(
            field: K,
            value: QueryableFieldValue<Genres, K>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<Genres>>(
            field: K,
            value: QueryableFieldValue<Genres, K>,
          ) => string;
          greaterThan: <K extends QueryableKeys<Genres>>(
            field: K,
            value: QueryableFieldValue<Genres, K>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<Genres>>(
            field: K,
            value: QueryableFieldValue<Genres, K>,
          ) => string;
          contains: <K extends QueryableKeys<Genres>>(
            field: K,
            value: QueryableFieldValue<Genres, K>,
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
            start: QueryableFieldValue<Genres, K>,
            end: QueryableFieldValue<Genres, K>,
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
              value: QueryableFieldValue<Genres, K>,
            ) => string;
            notEqual: <K extends QueryableKeys<Genres>>(
              field: K,
              value: QueryableFieldValue<Genres, K>,
            ) => string;
            lessThan: <K extends QueryableKeys<Genres>>(
              field: K,
              value: QueryableFieldValue<Genres, K>,
            ) => string;
            lessThanEqual: <K extends QueryableKeys<Genres>>(
              field: K,
              value: QueryableFieldValue<Genres, K>,
            ) => string;
            greaterThan: <K extends QueryableKeys<Genres>>(
              field: K,
              value: QueryableFieldValue<Genres, K>,
            ) => string;
            greaterThanEqual: <K extends QueryableKeys<Genres>>(
              field: K,
              value: QueryableFieldValue<Genres, K>,
            ) => string;
            contains: <K extends QueryableKeys<Genres>>(
              field: K,
              value: QueryableFieldValue<Genres, K>,
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
              start: QueryableFieldValue<Genres, K>,
              end: QueryableFieldValue<Genres, K>,
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
            value: QueryableFieldValue<Genres, K>,
          ) => string;
          notEqual: <K extends QueryableKeys<Genres>>(
            field: K,
            value: QueryableFieldValue<Genres, K>,
          ) => string;
          lessThan: <K extends QueryableKeys<Genres>>(
            field: K,
            value: QueryableFieldValue<Genres, K>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<Genres>>(
            field: K,
            value: QueryableFieldValue<Genres, K>,
          ) => string;
          greaterThan: <K extends QueryableKeys<Genres>>(
            field: K,
            value: QueryableFieldValue<Genres, K>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<Genres>>(
            field: K,
            value: QueryableFieldValue<Genres, K>,
          ) => string;
          contains: <K extends QueryableKeys<Genres>>(
            field: K,
            value: QueryableFieldValue<Genres, K>,
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
            start: QueryableFieldValue<Genres, K>,
            end: QueryableFieldValue<Genres, K>,
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
    'Game Medias': {
      create: (
        data: {
          game?:
            | (GamesCreate & { $id?: string; $permissions?: string[] })
            | string;
          type: GameMediasType;
          mediaId: string;
          name?: string | null;
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
      ) => Promise<GameMedias>;
      get: (id: string) => Promise<GameMedias>;
      update: (
        id: string,
        data: Partial<{
          game?:
            | (GamesCreate & { $id?: string; $permissions?: string[] })
            | string;
          type: GameMediasType;
          mediaId: string;
          name?: string | null;
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
      ) => Promise<GameMedias>;
      delete: (
        id: string,
        options?: { transactionId?: string },
      ) => Promise<void>;
      list: (options?: {
        queries?: (q: {
          equal: <K extends QueryableKeys<GameMedias>>(
            field: K,
            value: QueryableFieldValue<GameMedias, K>,
          ) => string;
          notEqual: <K extends QueryableKeys<GameMedias>>(
            field: K,
            value: QueryableFieldValue<GameMedias, K>,
          ) => string;
          lessThan: <K extends QueryableKeys<GameMedias>>(
            field: K,
            value: QueryableFieldValue<GameMedias, K>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<GameMedias>>(
            field: K,
            value: QueryableFieldValue<GameMedias, K>,
          ) => string;
          greaterThan: <K extends QueryableKeys<GameMedias>>(
            field: K,
            value: QueryableFieldValue<GameMedias, K>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<GameMedias>>(
            field: K,
            value: QueryableFieldValue<GameMedias, K>,
          ) => string;
          contains: <K extends QueryableKeys<GameMedias>>(
            field: K,
            value: QueryableFieldValue<GameMedias, K>,
          ) => string;
          search: <K extends QueryableKeys<GameMedias>>(
            field: K,
            value: string,
          ) => string;
          isNull: <K extends QueryableKeys<GameMedias>>(field: K) => string;
          isNotNull: <K extends QueryableKeys<GameMedias>>(field: K) => string;
          startsWith: <K extends QueryableKeys<GameMedias>>(
            field: K,
            value: string,
          ) => string;
          endsWith: <K extends QueryableKeys<GameMedias>>(
            field: K,
            value: string,
          ) => string;
          between: <K extends QueryableKeys<GameMedias>>(
            field: K,
            start: QueryableFieldValue<GameMedias, K>,
            end: QueryableFieldValue<GameMedias, K>,
          ) => string;
          select: <K extends keyof GameMedias>(fields: K[]) => string;
          orderAsc: <K extends keyof GameMedias>(field: K) => string;
          orderDesc: <K extends keyof GameMedias>(field: K) => string;
          limit: (value: number) => string;
          offset: (value: number) => string;
          cursorAfter: (documentId: string) => string;
          cursorBefore: (documentId: string) => string;
          or: (...queries: string[]) => string;
          and: (...queries: string[]) => string;
        }) => string[];
      }) => Promise<{ total: number; rows: GameMedias[] }>;
    };
    Autores: {
      create: (
        data: {
          name: string;
          slug: string;
          bio?: string | null;
          avatarUrl?: string | null;
          websiteUrl?: string | null;
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
      ) => Promise<Autores>;
      get: (id: string) => Promise<Autores>;
      update: (
        id: string,
        data: Partial<{
          name: string;
          slug: string;
          bio?: string | null;
          avatarUrl?: string | null;
          websiteUrl?: string | null;
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
      ) => Promise<Autores>;
      delete: (
        id: string,
        options?: { transactionId?: string },
      ) => Promise<void>;
      list: (options?: {
        queries?: (q: {
          equal: <K extends QueryableKeys<Autores>>(
            field: K,
            value: QueryableFieldValue<Autores, K>,
          ) => string;
          notEqual: <K extends QueryableKeys<Autores>>(
            field: K,
            value: QueryableFieldValue<Autores, K>,
          ) => string;
          lessThan: <K extends QueryableKeys<Autores>>(
            field: K,
            value: QueryableFieldValue<Autores, K>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<Autores>>(
            field: K,
            value: QueryableFieldValue<Autores, K>,
          ) => string;
          greaterThan: <K extends QueryableKeys<Autores>>(
            field: K,
            value: QueryableFieldValue<Autores, K>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<Autores>>(
            field: K,
            value: QueryableFieldValue<Autores, K>,
          ) => string;
          contains: <K extends QueryableKeys<Autores>>(
            field: K,
            value: QueryableFieldValue<Autores, K>,
          ) => string;
          search: <K extends QueryableKeys<Autores>>(
            field: K,
            value: string,
          ) => string;
          isNull: <K extends QueryableKeys<Autores>>(field: K) => string;
          isNotNull: <K extends QueryableKeys<Autores>>(field: K) => string;
          startsWith: <K extends QueryableKeys<Autores>>(
            field: K,
            value: string,
          ) => string;
          endsWith: <K extends QueryableKeys<Autores>>(
            field: K,
            value: string,
          ) => string;
          between: <K extends QueryableKeys<Autores>>(
            field: K,
            start: QueryableFieldValue<Autores, K>,
            end: QueryableFieldValue<Autores, K>,
          ) => string;
          select: <K extends keyof Autores>(fields: K[]) => string;
          orderAsc: <K extends keyof Autores>(field: K) => string;
          orderDesc: <K extends keyof Autores>(field: K) => string;
          limit: (value: number) => string;
          offset: (value: number) => string;
          cursorAfter: (documentId: string) => string;
          cursorBefore: (documentId: string) => string;
          or: (...queries: string[]) => string;
          and: (...queries: string[]) => string;
        }) => string[];
      }) => Promise<{ total: number; rows: Autores[] }>;
      createMany: (
        rows: Array<
          {
            name: string;
            slug: string;
            bio?: string | null;
            avatarUrl?: string | null;
            websiteUrl?: string | null;
          } & { $id?: string; $permissions?: string[] }
        >,
        options?: { transactionId?: string },
      ) => Promise<{ total: number; rows: Autores[] }>;
      updateMany: (
        data: Partial<{
          name: string;
          slug: string;
          bio?: string | null;
          avatarUrl?: string | null;
          websiteUrl?: string | null;
        }>,
        options?: {
          queries?: (q: {
            equal: <K extends QueryableKeys<Autores>>(
              field: K,
              value: QueryableFieldValue<Autores, K>,
            ) => string;
            notEqual: <K extends QueryableKeys<Autores>>(
              field: K,
              value: QueryableFieldValue<Autores, K>,
            ) => string;
            lessThan: <K extends QueryableKeys<Autores>>(
              field: K,
              value: QueryableFieldValue<Autores, K>,
            ) => string;
            lessThanEqual: <K extends QueryableKeys<Autores>>(
              field: K,
              value: QueryableFieldValue<Autores, K>,
            ) => string;
            greaterThan: <K extends QueryableKeys<Autores>>(
              field: K,
              value: QueryableFieldValue<Autores, K>,
            ) => string;
            greaterThanEqual: <K extends QueryableKeys<Autores>>(
              field: K,
              value: QueryableFieldValue<Autores, K>,
            ) => string;
            contains: <K extends QueryableKeys<Autores>>(
              field: K,
              value: QueryableFieldValue<Autores, K>,
            ) => string;
            search: <K extends QueryableKeys<Autores>>(
              field: K,
              value: string,
            ) => string;
            isNull: <K extends QueryableKeys<Autores>>(field: K) => string;
            isNotNull: <K extends QueryableKeys<Autores>>(field: K) => string;
            startsWith: <K extends QueryableKeys<Autores>>(
              field: K,
              value: string,
            ) => string;
            endsWith: <K extends QueryableKeys<Autores>>(
              field: K,
              value: string,
            ) => string;
            between: <K extends QueryableKeys<Autores>>(
              field: K,
              start: QueryableFieldValue<Autores, K>,
              end: QueryableFieldValue<Autores, K>,
            ) => string;
            select: <K extends keyof Autores>(fields: K[]) => string;
            orderAsc: <K extends keyof Autores>(field: K) => string;
            orderDesc: <K extends keyof Autores>(field: K) => string;
            limit: (value: number) => string;
            offset: (value: number) => string;
            cursorAfter: (documentId: string) => string;
            cursorBefore: (documentId: string) => string;
            or: (...queries: string[]) => string;
            and: (...queries: string[]) => string;
          }) => string[];
          transactionId?: string;
        },
      ) => Promise<{ total: number; rows: Autores[] }>;
      deleteMany: (options?: {
        queries?: (q: {
          equal: <K extends QueryableKeys<Autores>>(
            field: K,
            value: QueryableFieldValue<Autores, K>,
          ) => string;
          notEqual: <K extends QueryableKeys<Autores>>(
            field: K,
            value: QueryableFieldValue<Autores, K>,
          ) => string;
          lessThan: <K extends QueryableKeys<Autores>>(
            field: K,
            value: QueryableFieldValue<Autores, K>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<Autores>>(
            field: K,
            value: QueryableFieldValue<Autores, K>,
          ) => string;
          greaterThan: <K extends QueryableKeys<Autores>>(
            field: K,
            value: QueryableFieldValue<Autores, K>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<Autores>>(
            field: K,
            value: QueryableFieldValue<Autores, K>,
          ) => string;
          contains: <K extends QueryableKeys<Autores>>(
            field: K,
            value: QueryableFieldValue<Autores, K>,
          ) => string;
          search: <K extends QueryableKeys<Autores>>(
            field: K,
            value: string,
          ) => string;
          isNull: <K extends QueryableKeys<Autores>>(field: K) => string;
          isNotNull: <K extends QueryableKeys<Autores>>(field: K) => string;
          startsWith: <K extends QueryableKeys<Autores>>(
            field: K,
            value: string,
          ) => string;
          endsWith: <K extends QueryableKeys<Autores>>(
            field: K,
            value: string,
          ) => string;
          between: <K extends QueryableKeys<Autores>>(
            field: K,
            start: QueryableFieldValue<Autores, K>,
            end: QueryableFieldValue<Autores, K>,
          ) => string;
          select: <K extends keyof Autores>(fields: K[]) => string;
          orderAsc: <K extends keyof Autores>(field: K) => string;
          orderDesc: <K extends keyof Autores>(field: K) => string;
          limit: (value: number) => string;
          offset: (value: number) => string;
          cursorAfter: (documentId: string) => string;
          cursorBefore: (documentId: string) => string;
          or: (...queries: string[]) => string;
          and: (...queries: string[]) => string;
        }) => string[];
        transactionId?: string;
      }) => Promise<{ total: number; rows: Autores[] }>;
    };
    Posts: {
      create: (
        data: {
          title: string;
          subtitle?: string | null;
          slug: string;
          body: string;
          mainImage?: string | null;
          status: PostsStatus;
          tags?: string[] | null;
          relatedGameIds?: string[] | null;
          seo?: string | null;
          originalSourceUrl?: string | null;
          author?:
            | (AutoresCreate & { $id?: string; $permissions?: string[] })
            | string;
          postType?: PostsPostType;
          reviewMeta?: string | null;
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
      ) => Promise<Posts>;
      get: (id: string) => Promise<Posts>;
      update: (
        id: string,
        data: Partial<{
          title: string;
          subtitle?: string | null;
          slug: string;
          body: string;
          mainImage?: string | null;
          status: PostsStatus;
          tags?: string[] | null;
          relatedGameIds?: string[] | null;
          seo?: string | null;
          originalSourceUrl?: string | null;
          author?:
            | (AutoresCreate & { $id?: string; $permissions?: string[] })
            | string;
          postType?: PostsPostType;
          reviewMeta?: string | null;
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
      ) => Promise<Posts>;
      delete: (
        id: string,
        options?: { transactionId?: string },
      ) => Promise<void>;
      list: (options?: {
        queries?: (q: {
          equal: <K extends QueryableKeys<Posts>>(
            field: K,
            value: QueryableFieldValue<Posts, K>,
          ) => string;
          notEqual: <K extends QueryableKeys<Posts>>(
            field: K,
            value: QueryableFieldValue<Posts, K>,
          ) => string;
          lessThan: <K extends QueryableKeys<Posts>>(
            field: K,
            value: QueryableFieldValue<Posts, K>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<Posts>>(
            field: K,
            value: QueryableFieldValue<Posts, K>,
          ) => string;
          greaterThan: <K extends QueryableKeys<Posts>>(
            field: K,
            value: QueryableFieldValue<Posts, K>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<Posts>>(
            field: K,
            value: QueryableFieldValue<Posts, K>,
          ) => string;
          contains: <K extends QueryableKeys<Posts>>(
            field: K,
            value: QueryableFieldValue<Posts, K>,
          ) => string;
          search: <K extends QueryableKeys<Posts>>(
            field: K,
            value: string,
          ) => string;
          isNull: <K extends QueryableKeys<Posts>>(field: K) => string;
          isNotNull: <K extends QueryableKeys<Posts>>(field: K) => string;
          startsWith: <K extends QueryableKeys<Posts>>(
            field: K,
            value: string,
          ) => string;
          endsWith: <K extends QueryableKeys<Posts>>(
            field: K,
            value: string,
          ) => string;
          between: <K extends QueryableKeys<Posts>>(
            field: K,
            start: QueryableFieldValue<Posts, K>,
            end: QueryableFieldValue<Posts, K>,
          ) => string;
          select: <K extends keyof Posts>(fields: K[]) => string;
          orderAsc: <K extends keyof Posts>(field: K) => string;
          orderDesc: <K extends keyof Posts>(field: K) => string;
          limit: (value: number) => string;
          offset: (value: number) => string;
          cursorAfter: (documentId: string) => string;
          cursorBefore: (documentId: string) => string;
          or: (...queries: string[]) => string;
          and: (...queries: string[]) => string;
        }) => string[];
      }) => Promise<{ total: number; rows: Posts[] }>;
    };
    'Z Coin Transactions': {
      create: (
        data: {
          userId: string;
          amount: number;
          type: string;
          reason: string;
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
      ) => Promise<ZCoinTransactions>;
      get: (id: string) => Promise<ZCoinTransactions>;
      update: (
        id: string,
        data: Partial<{
          userId: string;
          amount: number;
          type: string;
          reason: string;
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
      ) => Promise<ZCoinTransactions>;
      delete: (
        id: string,
        options?: { transactionId?: string },
      ) => Promise<void>;
      list: (options?: {
        queries?: (q: {
          equal: <K extends QueryableKeys<ZCoinTransactions>>(
            field: K,
            value: QueryableFieldValue<ZCoinTransactions, K>,
          ) => string;
          notEqual: <K extends QueryableKeys<ZCoinTransactions>>(
            field: K,
            value: QueryableFieldValue<ZCoinTransactions, K>,
          ) => string;
          lessThan: <K extends QueryableKeys<ZCoinTransactions>>(
            field: K,
            value: QueryableFieldValue<ZCoinTransactions, K>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<ZCoinTransactions>>(
            field: K,
            value: QueryableFieldValue<ZCoinTransactions, K>,
          ) => string;
          greaterThan: <K extends QueryableKeys<ZCoinTransactions>>(
            field: K,
            value: QueryableFieldValue<ZCoinTransactions, K>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<ZCoinTransactions>>(
            field: K,
            value: QueryableFieldValue<ZCoinTransactions, K>,
          ) => string;
          contains: <K extends QueryableKeys<ZCoinTransactions>>(
            field: K,
            value: QueryableFieldValue<ZCoinTransactions, K>,
          ) => string;
          search: <K extends QueryableKeys<ZCoinTransactions>>(
            field: K,
            value: string,
          ) => string;
          isNull: <K extends QueryableKeys<ZCoinTransactions>>(
            field: K,
          ) => string;
          isNotNull: <K extends QueryableKeys<ZCoinTransactions>>(
            field: K,
          ) => string;
          startsWith: <K extends QueryableKeys<ZCoinTransactions>>(
            field: K,
            value: string,
          ) => string;
          endsWith: <K extends QueryableKeys<ZCoinTransactions>>(
            field: K,
            value: string,
          ) => string;
          between: <K extends QueryableKeys<ZCoinTransactions>>(
            field: K,
            start: QueryableFieldValue<ZCoinTransactions, K>,
            end: QueryableFieldValue<ZCoinTransactions, K>,
          ) => string;
          select: <K extends keyof ZCoinTransactions>(fields: K[]) => string;
          orderAsc: <K extends keyof ZCoinTransactions>(field: K) => string;
          orderDesc: <K extends keyof ZCoinTransactions>(field: K) => string;
          limit: (value: number) => string;
          offset: (value: number) => string;
          cursorAfter: (documentId: string) => string;
          cursorBefore: (documentId: string) => string;
          or: (...queries: string[]) => string;
          and: (...queries: string[]) => string;
        }) => string[];
      }) => Promise<{ total: number; rows: ZCoinTransactions[] }>;
      createMany: (
        rows: Array<
          {
            userId: string;
            amount: number;
            type: string;
            reason: string;
          } & { $id?: string; $permissions?: string[] }
        >,
        options?: { transactionId?: string },
      ) => Promise<{ total: number; rows: ZCoinTransactions[] }>;
      updateMany: (
        data: Partial<{
          userId: string;
          amount: number;
          type: string;
          reason: string;
        }>,
        options?: {
          queries?: (q: {
            equal: <K extends QueryableKeys<ZCoinTransactions>>(
              field: K,
              value: QueryableFieldValue<ZCoinTransactions, K>,
            ) => string;
            notEqual: <K extends QueryableKeys<ZCoinTransactions>>(
              field: K,
              value: QueryableFieldValue<ZCoinTransactions, K>,
            ) => string;
            lessThan: <K extends QueryableKeys<ZCoinTransactions>>(
              field: K,
              value: QueryableFieldValue<ZCoinTransactions, K>,
            ) => string;
            lessThanEqual: <K extends QueryableKeys<ZCoinTransactions>>(
              field: K,
              value: QueryableFieldValue<ZCoinTransactions, K>,
            ) => string;
            greaterThan: <K extends QueryableKeys<ZCoinTransactions>>(
              field: K,
              value: QueryableFieldValue<ZCoinTransactions, K>,
            ) => string;
            greaterThanEqual: <K extends QueryableKeys<ZCoinTransactions>>(
              field: K,
              value: QueryableFieldValue<ZCoinTransactions, K>,
            ) => string;
            contains: <K extends QueryableKeys<ZCoinTransactions>>(
              field: K,
              value: QueryableFieldValue<ZCoinTransactions, K>,
            ) => string;
            search: <K extends QueryableKeys<ZCoinTransactions>>(
              field: K,
              value: string,
            ) => string;
            isNull: <K extends QueryableKeys<ZCoinTransactions>>(
              field: K,
            ) => string;
            isNotNull: <K extends QueryableKeys<ZCoinTransactions>>(
              field: K,
            ) => string;
            startsWith: <K extends QueryableKeys<ZCoinTransactions>>(
              field: K,
              value: string,
            ) => string;
            endsWith: <K extends QueryableKeys<ZCoinTransactions>>(
              field: K,
              value: string,
            ) => string;
            between: <K extends QueryableKeys<ZCoinTransactions>>(
              field: K,
              start: QueryableFieldValue<ZCoinTransactions, K>,
              end: QueryableFieldValue<ZCoinTransactions, K>,
            ) => string;
            select: <K extends keyof ZCoinTransactions>(fields: K[]) => string;
            orderAsc: <K extends keyof ZCoinTransactions>(field: K) => string;
            orderDesc: <K extends keyof ZCoinTransactions>(field: K) => string;
            limit: (value: number) => string;
            offset: (value: number) => string;
            cursorAfter: (documentId: string) => string;
            cursorBefore: (documentId: string) => string;
            or: (...queries: string[]) => string;
            and: (...queries: string[]) => string;
          }) => string[];
          transactionId?: string;
        },
      ) => Promise<{ total: number; rows: ZCoinTransactions[] }>;
      deleteMany: (options?: {
        queries?: (q: {
          equal: <K extends QueryableKeys<ZCoinTransactions>>(
            field: K,
            value: QueryableFieldValue<ZCoinTransactions, K>,
          ) => string;
          notEqual: <K extends QueryableKeys<ZCoinTransactions>>(
            field: K,
            value: QueryableFieldValue<ZCoinTransactions, K>,
          ) => string;
          lessThan: <K extends QueryableKeys<ZCoinTransactions>>(
            field: K,
            value: QueryableFieldValue<ZCoinTransactions, K>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<ZCoinTransactions>>(
            field: K,
            value: QueryableFieldValue<ZCoinTransactions, K>,
          ) => string;
          greaterThan: <K extends QueryableKeys<ZCoinTransactions>>(
            field: K,
            value: QueryableFieldValue<ZCoinTransactions, K>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<ZCoinTransactions>>(
            field: K,
            value: QueryableFieldValue<ZCoinTransactions, K>,
          ) => string;
          contains: <K extends QueryableKeys<ZCoinTransactions>>(
            field: K,
            value: QueryableFieldValue<ZCoinTransactions, K>,
          ) => string;
          search: <K extends QueryableKeys<ZCoinTransactions>>(
            field: K,
            value: string,
          ) => string;
          isNull: <K extends QueryableKeys<ZCoinTransactions>>(
            field: K,
          ) => string;
          isNotNull: <K extends QueryableKeys<ZCoinTransactions>>(
            field: K,
          ) => string;
          startsWith: <K extends QueryableKeys<ZCoinTransactions>>(
            field: K,
            value: string,
          ) => string;
          endsWith: <K extends QueryableKeys<ZCoinTransactions>>(
            field: K,
            value: string,
          ) => string;
          between: <K extends QueryableKeys<ZCoinTransactions>>(
            field: K,
            start: QueryableFieldValue<ZCoinTransactions, K>,
            end: QueryableFieldValue<ZCoinTransactions, K>,
          ) => string;
          select: <K extends keyof ZCoinTransactions>(fields: K[]) => string;
          orderAsc: <K extends keyof ZCoinTransactions>(field: K) => string;
          orderDesc: <K extends keyof ZCoinTransactions>(field: K) => string;
          limit: (value: number) => string;
          offset: (value: number) => string;
          cursorAfter: (documentId: string) => string;
          cursorBefore: (documentId: string) => string;
          or: (...queries: string[]) => string;
          and: (...queries: string[]) => string;
        }) => string[];
        transactionId?: string;
      }) => Promise<{ total: number; rows: ZCoinTransactions[] }>;
    };
    Sorteios: {
      create: (
        data: {
          game?:
            | (GamesCreate & { $id?: string; $permissions?: string[] })
            | string;
          rewardPolicy?: SorteiosRewardPolicy;
          basicProbability?: number;
          ticketPrice?: number;
          active?: boolean;
          activatedAt?: string | null;
          closedAt?: string | null;
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
      ) => Promise<Sorteios>;
      get: (id: string) => Promise<Sorteios>;
      update: (
        id: string,
        data: Partial<{
          game?:
            | (GamesCreate & { $id?: string; $permissions?: string[] })
            | string;
          rewardPolicy?: SorteiosRewardPolicy;
          basicProbability?: number;
          ticketPrice?: number;
          active?: boolean;
          activatedAt?: string | null;
          closedAt?: string | null;
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
      ) => Promise<Sorteios>;
      delete: (
        id: string,
        options?: { transactionId?: string },
      ) => Promise<void>;
      list: (options?: {
        queries?: (q: {
          equal: <K extends QueryableKeys<Sorteios>>(
            field: K,
            value: QueryableFieldValue<Sorteios, K>,
          ) => string;
          notEqual: <K extends QueryableKeys<Sorteios>>(
            field: K,
            value: QueryableFieldValue<Sorteios, K>,
          ) => string;
          lessThan: <K extends QueryableKeys<Sorteios>>(
            field: K,
            value: QueryableFieldValue<Sorteios, K>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<Sorteios>>(
            field: K,
            value: QueryableFieldValue<Sorteios, K>,
          ) => string;
          greaterThan: <K extends QueryableKeys<Sorteios>>(
            field: K,
            value: QueryableFieldValue<Sorteios, K>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<Sorteios>>(
            field: K,
            value: QueryableFieldValue<Sorteios, K>,
          ) => string;
          contains: <K extends QueryableKeys<Sorteios>>(
            field: K,
            value: QueryableFieldValue<Sorteios, K>,
          ) => string;
          search: <K extends QueryableKeys<Sorteios>>(
            field: K,
            value: string,
          ) => string;
          isNull: <K extends QueryableKeys<Sorteios>>(field: K) => string;
          isNotNull: <K extends QueryableKeys<Sorteios>>(field: K) => string;
          startsWith: <K extends QueryableKeys<Sorteios>>(
            field: K,
            value: string,
          ) => string;
          endsWith: <K extends QueryableKeys<Sorteios>>(
            field: K,
            value: string,
          ) => string;
          between: <K extends QueryableKeys<Sorteios>>(
            field: K,
            start: QueryableFieldValue<Sorteios, K>,
            end: QueryableFieldValue<Sorteios, K>,
          ) => string;
          select: <K extends keyof Sorteios>(fields: K[]) => string;
          orderAsc: <K extends keyof Sorteios>(field: K) => string;
          orderDesc: <K extends keyof Sorteios>(field: K) => string;
          limit: (value: number) => string;
          offset: (value: number) => string;
          cursorAfter: (documentId: string) => string;
          cursorBefore: (documentId: string) => string;
          or: (...queries: string[]) => string;
          and: (...queries: string[]) => string;
        }) => string[];
      }) => Promise<{ total: number; rows: Sorteios[] }>;
    };
    'Entradas de Sorteio': {
      create: (
        data: {
          raffleId: string;
          userId: string;
          ticketCount: number;
          totalCost: number;
          luckyNumbers?: string[] | null;
          won?: boolean;
          drawNumber: string;
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
      ) => Promise<EntradasDeSorteio>;
      get: (id: string) => Promise<EntradasDeSorteio>;
      update: (
        id: string,
        data: Partial<{
          raffleId: string;
          userId: string;
          ticketCount: number;
          totalCost: number;
          luckyNumbers?: string[] | null;
          won?: boolean;
          drawNumber: string;
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
      ) => Promise<EntradasDeSorteio>;
      delete: (
        id: string,
        options?: { transactionId?: string },
      ) => Promise<void>;
      list: (options?: {
        queries?: (q: {
          equal: <K extends QueryableKeys<EntradasDeSorteio>>(
            field: K,
            value: QueryableFieldValue<EntradasDeSorteio, K>,
          ) => string;
          notEqual: <K extends QueryableKeys<EntradasDeSorteio>>(
            field: K,
            value: QueryableFieldValue<EntradasDeSorteio, K>,
          ) => string;
          lessThan: <K extends QueryableKeys<EntradasDeSorteio>>(
            field: K,
            value: QueryableFieldValue<EntradasDeSorteio, K>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<EntradasDeSorteio>>(
            field: K,
            value: QueryableFieldValue<EntradasDeSorteio, K>,
          ) => string;
          greaterThan: <K extends QueryableKeys<EntradasDeSorteio>>(
            field: K,
            value: QueryableFieldValue<EntradasDeSorteio, K>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<EntradasDeSorteio>>(
            field: K,
            value: QueryableFieldValue<EntradasDeSorteio, K>,
          ) => string;
          contains: <K extends QueryableKeys<EntradasDeSorteio>>(
            field: K,
            value: QueryableFieldValue<EntradasDeSorteio, K>,
          ) => string;
          search: <K extends QueryableKeys<EntradasDeSorteio>>(
            field: K,
            value: string,
          ) => string;
          isNull: <K extends QueryableKeys<EntradasDeSorteio>>(
            field: K,
          ) => string;
          isNotNull: <K extends QueryableKeys<EntradasDeSorteio>>(
            field: K,
          ) => string;
          startsWith: <K extends QueryableKeys<EntradasDeSorteio>>(
            field: K,
            value: string,
          ) => string;
          endsWith: <K extends QueryableKeys<EntradasDeSorteio>>(
            field: K,
            value: string,
          ) => string;
          between: <K extends QueryableKeys<EntradasDeSorteio>>(
            field: K,
            start: QueryableFieldValue<EntradasDeSorteio, K>,
            end: QueryableFieldValue<EntradasDeSorteio, K>,
          ) => string;
          select: <K extends keyof EntradasDeSorteio>(fields: K[]) => string;
          orderAsc: <K extends keyof EntradasDeSorteio>(field: K) => string;
          orderDesc: <K extends keyof EntradasDeSorteio>(field: K) => string;
          limit: (value: number) => string;
          offset: (value: number) => string;
          cursorAfter: (documentId: string) => string;
          cursorBefore: (documentId: string) => string;
          or: (...queries: string[]) => string;
          and: (...queries: string[]) => string;
        }) => string[];
      }) => Promise<{ total: number; rows: EntradasDeSorteio[] }>;
      createMany: (
        rows: Array<
          {
            raffleId: string;
            userId: string;
            ticketCount: number;
            totalCost: number;
            luckyNumbers?: string[] | null;
            won?: boolean;
            drawNumber: string;
          } & { $id?: string; $permissions?: string[] }
        >,
        options?: { transactionId?: string },
      ) => Promise<{ total: number; rows: EntradasDeSorteio[] }>;
      updateMany: (
        data: Partial<{
          raffleId: string;
          userId: string;
          ticketCount: number;
          totalCost: number;
          luckyNumbers?: string[] | null;
          won?: boolean;
          drawNumber: string;
        }>,
        options?: {
          queries?: (q: {
            equal: <K extends QueryableKeys<EntradasDeSorteio>>(
              field: K,
              value: QueryableFieldValue<EntradasDeSorteio, K>,
            ) => string;
            notEqual: <K extends QueryableKeys<EntradasDeSorteio>>(
              field: K,
              value: QueryableFieldValue<EntradasDeSorteio, K>,
            ) => string;
            lessThan: <K extends QueryableKeys<EntradasDeSorteio>>(
              field: K,
              value: QueryableFieldValue<EntradasDeSorteio, K>,
            ) => string;
            lessThanEqual: <K extends QueryableKeys<EntradasDeSorteio>>(
              field: K,
              value: QueryableFieldValue<EntradasDeSorteio, K>,
            ) => string;
            greaterThan: <K extends QueryableKeys<EntradasDeSorteio>>(
              field: K,
              value: QueryableFieldValue<EntradasDeSorteio, K>,
            ) => string;
            greaterThanEqual: <K extends QueryableKeys<EntradasDeSorteio>>(
              field: K,
              value: QueryableFieldValue<EntradasDeSorteio, K>,
            ) => string;
            contains: <K extends QueryableKeys<EntradasDeSorteio>>(
              field: K,
              value: QueryableFieldValue<EntradasDeSorteio, K>,
            ) => string;
            search: <K extends QueryableKeys<EntradasDeSorteio>>(
              field: K,
              value: string,
            ) => string;
            isNull: <K extends QueryableKeys<EntradasDeSorteio>>(
              field: K,
            ) => string;
            isNotNull: <K extends QueryableKeys<EntradasDeSorteio>>(
              field: K,
            ) => string;
            startsWith: <K extends QueryableKeys<EntradasDeSorteio>>(
              field: K,
              value: string,
            ) => string;
            endsWith: <K extends QueryableKeys<EntradasDeSorteio>>(
              field: K,
              value: string,
            ) => string;
            between: <K extends QueryableKeys<EntradasDeSorteio>>(
              field: K,
              start: QueryableFieldValue<EntradasDeSorteio, K>,
              end: QueryableFieldValue<EntradasDeSorteio, K>,
            ) => string;
            select: <K extends keyof EntradasDeSorteio>(fields: K[]) => string;
            orderAsc: <K extends keyof EntradasDeSorteio>(field: K) => string;
            orderDesc: <K extends keyof EntradasDeSorteio>(field: K) => string;
            limit: (value: number) => string;
            offset: (value: number) => string;
            cursorAfter: (documentId: string) => string;
            cursorBefore: (documentId: string) => string;
            or: (...queries: string[]) => string;
            and: (...queries: string[]) => string;
          }) => string[];
          transactionId?: string;
        },
      ) => Promise<{ total: number; rows: EntradasDeSorteio[] }>;
      deleteMany: (options?: {
        queries?: (q: {
          equal: <K extends QueryableKeys<EntradasDeSorteio>>(
            field: K,
            value: QueryableFieldValue<EntradasDeSorteio, K>,
          ) => string;
          notEqual: <K extends QueryableKeys<EntradasDeSorteio>>(
            field: K,
            value: QueryableFieldValue<EntradasDeSorteio, K>,
          ) => string;
          lessThan: <K extends QueryableKeys<EntradasDeSorteio>>(
            field: K,
            value: QueryableFieldValue<EntradasDeSorteio, K>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<EntradasDeSorteio>>(
            field: K,
            value: QueryableFieldValue<EntradasDeSorteio, K>,
          ) => string;
          greaterThan: <K extends QueryableKeys<EntradasDeSorteio>>(
            field: K,
            value: QueryableFieldValue<EntradasDeSorteio, K>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<EntradasDeSorteio>>(
            field: K,
            value: QueryableFieldValue<EntradasDeSorteio, K>,
          ) => string;
          contains: <K extends QueryableKeys<EntradasDeSorteio>>(
            field: K,
            value: QueryableFieldValue<EntradasDeSorteio, K>,
          ) => string;
          search: <K extends QueryableKeys<EntradasDeSorteio>>(
            field: K,
            value: string,
          ) => string;
          isNull: <K extends QueryableKeys<EntradasDeSorteio>>(
            field: K,
          ) => string;
          isNotNull: <K extends QueryableKeys<EntradasDeSorteio>>(
            field: K,
          ) => string;
          startsWith: <K extends QueryableKeys<EntradasDeSorteio>>(
            field: K,
            value: string,
          ) => string;
          endsWith: <K extends QueryableKeys<EntradasDeSorteio>>(
            field: K,
            value: string,
          ) => string;
          between: <K extends QueryableKeys<EntradasDeSorteio>>(
            field: K,
            start: QueryableFieldValue<EntradasDeSorteio, K>,
            end: QueryableFieldValue<EntradasDeSorteio, K>,
          ) => string;
          select: <K extends keyof EntradasDeSorteio>(fields: K[]) => string;
          orderAsc: <K extends keyof EntradasDeSorteio>(field: K) => string;
          orderDesc: <K extends keyof EntradasDeSorteio>(field: K) => string;
          limit: (value: number) => string;
          offset: (value: number) => string;
          cursorAfter: (documentId: string) => string;
          cursorBefore: (documentId: string) => string;
          or: (...queries: string[]) => string;
          and: (...queries: string[]) => string;
        }) => string[];
        transactionId?: string;
      }) => Promise<{ total: number; rows: EntradasDeSorteio[] }>;
    };
    'Chaves de Jogos': {
      create: (
        data: {
          gameId: string;
          raffleId: string;
          key: string;
          status?: ChavesDeJogosStatus;
          platform?: ChavesDeJogosPlatform;
          userWinnerId?: string | null;
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
      ) => Promise<ChavesDeJogos>;
      get: (id: string) => Promise<ChavesDeJogos>;
      update: (
        id: string,
        data: Partial<{
          gameId: string;
          raffleId: string;
          key: string;
          status?: ChavesDeJogosStatus;
          platform?: ChavesDeJogosPlatform;
          userWinnerId?: string | null;
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
      ) => Promise<ChavesDeJogos>;
      delete: (
        id: string,
        options?: { transactionId?: string },
      ) => Promise<void>;
      list: (options?: {
        queries?: (q: {
          equal: <K extends QueryableKeys<ChavesDeJogos>>(
            field: K,
            value: QueryableFieldValue<ChavesDeJogos, K>,
          ) => string;
          notEqual: <K extends QueryableKeys<ChavesDeJogos>>(
            field: K,
            value: QueryableFieldValue<ChavesDeJogos, K>,
          ) => string;
          lessThan: <K extends QueryableKeys<ChavesDeJogos>>(
            field: K,
            value: QueryableFieldValue<ChavesDeJogos, K>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<ChavesDeJogos>>(
            field: K,
            value: QueryableFieldValue<ChavesDeJogos, K>,
          ) => string;
          greaterThan: <K extends QueryableKeys<ChavesDeJogos>>(
            field: K,
            value: QueryableFieldValue<ChavesDeJogos, K>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<ChavesDeJogos>>(
            field: K,
            value: QueryableFieldValue<ChavesDeJogos, K>,
          ) => string;
          contains: <K extends QueryableKeys<ChavesDeJogos>>(
            field: K,
            value: QueryableFieldValue<ChavesDeJogos, K>,
          ) => string;
          search: <K extends QueryableKeys<ChavesDeJogos>>(
            field: K,
            value: string,
          ) => string;
          isNull: <K extends QueryableKeys<ChavesDeJogos>>(field: K) => string;
          isNotNull: <K extends QueryableKeys<ChavesDeJogos>>(
            field: K,
          ) => string;
          startsWith: <K extends QueryableKeys<ChavesDeJogos>>(
            field: K,
            value: string,
          ) => string;
          endsWith: <K extends QueryableKeys<ChavesDeJogos>>(
            field: K,
            value: string,
          ) => string;
          between: <K extends QueryableKeys<ChavesDeJogos>>(
            field: K,
            start: QueryableFieldValue<ChavesDeJogos, K>,
            end: QueryableFieldValue<ChavesDeJogos, K>,
          ) => string;
          select: <K extends keyof ChavesDeJogos>(fields: K[]) => string;
          orderAsc: <K extends keyof ChavesDeJogos>(field: K) => string;
          orderDesc: <K extends keyof ChavesDeJogos>(field: K) => string;
          limit: (value: number) => string;
          offset: (value: number) => string;
          cursorAfter: (documentId: string) => string;
          cursorBefore: (documentId: string) => string;
          or: (...queries: string[]) => string;
          and: (...queries: string[]) => string;
        }) => string[];
      }) => Promise<{ total: number; rows: ChavesDeJogos[] }>;
      createMany: (
        rows: Array<
          {
            gameId: string;
            raffleId: string;
            key: string;
            status?: ChavesDeJogosStatus;
            platform?: ChavesDeJogosPlatform;
            userWinnerId?: string | null;
          } & { $id?: string; $permissions?: string[] }
        >,
        options?: { transactionId?: string },
      ) => Promise<{ total: number; rows: ChavesDeJogos[] }>;
      updateMany: (
        data: Partial<{
          gameId: string;
          raffleId: string;
          key: string;
          status?: ChavesDeJogosStatus;
          platform?: ChavesDeJogosPlatform;
          userWinnerId?: string | null;
        }>,
        options?: {
          queries?: (q: {
            equal: <K extends QueryableKeys<ChavesDeJogos>>(
              field: K,
              value: QueryableFieldValue<ChavesDeJogos, K>,
            ) => string;
            notEqual: <K extends QueryableKeys<ChavesDeJogos>>(
              field: K,
              value: QueryableFieldValue<ChavesDeJogos, K>,
            ) => string;
            lessThan: <K extends QueryableKeys<ChavesDeJogos>>(
              field: K,
              value: QueryableFieldValue<ChavesDeJogos, K>,
            ) => string;
            lessThanEqual: <K extends QueryableKeys<ChavesDeJogos>>(
              field: K,
              value: QueryableFieldValue<ChavesDeJogos, K>,
            ) => string;
            greaterThan: <K extends QueryableKeys<ChavesDeJogos>>(
              field: K,
              value: QueryableFieldValue<ChavesDeJogos, K>,
            ) => string;
            greaterThanEqual: <K extends QueryableKeys<ChavesDeJogos>>(
              field: K,
              value: QueryableFieldValue<ChavesDeJogos, K>,
            ) => string;
            contains: <K extends QueryableKeys<ChavesDeJogos>>(
              field: K,
              value: QueryableFieldValue<ChavesDeJogos, K>,
            ) => string;
            search: <K extends QueryableKeys<ChavesDeJogos>>(
              field: K,
              value: string,
            ) => string;
            isNull: <K extends QueryableKeys<ChavesDeJogos>>(
              field: K,
            ) => string;
            isNotNull: <K extends QueryableKeys<ChavesDeJogos>>(
              field: K,
            ) => string;
            startsWith: <K extends QueryableKeys<ChavesDeJogos>>(
              field: K,
              value: string,
            ) => string;
            endsWith: <K extends QueryableKeys<ChavesDeJogos>>(
              field: K,
              value: string,
            ) => string;
            between: <K extends QueryableKeys<ChavesDeJogos>>(
              field: K,
              start: QueryableFieldValue<ChavesDeJogos, K>,
              end: QueryableFieldValue<ChavesDeJogos, K>,
            ) => string;
            select: <K extends keyof ChavesDeJogos>(fields: K[]) => string;
            orderAsc: <K extends keyof ChavesDeJogos>(field: K) => string;
            orderDesc: <K extends keyof ChavesDeJogos>(field: K) => string;
            limit: (value: number) => string;
            offset: (value: number) => string;
            cursorAfter: (documentId: string) => string;
            cursorBefore: (documentId: string) => string;
            or: (...queries: string[]) => string;
            and: (...queries: string[]) => string;
          }) => string[];
          transactionId?: string;
        },
      ) => Promise<{ total: number; rows: ChavesDeJogos[] }>;
      deleteMany: (options?: {
        queries?: (q: {
          equal: <K extends QueryableKeys<ChavesDeJogos>>(
            field: K,
            value: QueryableFieldValue<ChavesDeJogos, K>,
          ) => string;
          notEqual: <K extends QueryableKeys<ChavesDeJogos>>(
            field: K,
            value: QueryableFieldValue<ChavesDeJogos, K>,
          ) => string;
          lessThan: <K extends QueryableKeys<ChavesDeJogos>>(
            field: K,
            value: QueryableFieldValue<ChavesDeJogos, K>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<ChavesDeJogos>>(
            field: K,
            value: QueryableFieldValue<ChavesDeJogos, K>,
          ) => string;
          greaterThan: <K extends QueryableKeys<ChavesDeJogos>>(
            field: K,
            value: QueryableFieldValue<ChavesDeJogos, K>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<ChavesDeJogos>>(
            field: K,
            value: QueryableFieldValue<ChavesDeJogos, K>,
          ) => string;
          contains: <K extends QueryableKeys<ChavesDeJogos>>(
            field: K,
            value: QueryableFieldValue<ChavesDeJogos, K>,
          ) => string;
          search: <K extends QueryableKeys<ChavesDeJogos>>(
            field: K,
            value: string,
          ) => string;
          isNull: <K extends QueryableKeys<ChavesDeJogos>>(field: K) => string;
          isNotNull: <K extends QueryableKeys<ChavesDeJogos>>(
            field: K,
          ) => string;
          startsWith: <K extends QueryableKeys<ChavesDeJogos>>(
            field: K,
            value: string,
          ) => string;
          endsWith: <K extends QueryableKeys<ChavesDeJogos>>(
            field: K,
            value: string,
          ) => string;
          between: <K extends QueryableKeys<ChavesDeJogos>>(
            field: K,
            start: QueryableFieldValue<ChavesDeJogos, K>,
            end: QueryableFieldValue<ChavesDeJogos, K>,
          ) => string;
          select: <K extends keyof ChavesDeJogos>(fields: K[]) => string;
          orderAsc: <K extends keyof ChavesDeJogos>(field: K) => string;
          orderDesc: <K extends keyof ChavesDeJogos>(field: K) => string;
          limit: (value: number) => string;
          offset: (value: number) => string;
          cursorAfter: (documentId: string) => string;
          cursorBefore: (documentId: string) => string;
          or: (...queries: string[]) => string;
          and: (...queries: string[]) => string;
        }) => string[];
        transactionId?: string;
      }) => Promise<{ total: number; rows: ChavesDeJogos[] }>;
    };
    'Logs do Aplicativo': {
      create: (
        data: {
          type: string;
          relatedUserId?: string | null;
          metadata: string;
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
      ) => Promise<LogsDoAplicativo>;
      get: (id: string) => Promise<LogsDoAplicativo>;
      update: (
        id: string,
        data: Partial<{
          type: string;
          relatedUserId?: string | null;
          metadata: string;
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
      ) => Promise<LogsDoAplicativo>;
      delete: (
        id: string,
        options?: { transactionId?: string },
      ) => Promise<void>;
      list: (options?: {
        queries?: (q: {
          equal: <K extends QueryableKeys<LogsDoAplicativo>>(
            field: K,
            value: QueryableFieldValue<LogsDoAplicativo, K>,
          ) => string;
          notEqual: <K extends QueryableKeys<LogsDoAplicativo>>(
            field: K,
            value: QueryableFieldValue<LogsDoAplicativo, K>,
          ) => string;
          lessThan: <K extends QueryableKeys<LogsDoAplicativo>>(
            field: K,
            value: QueryableFieldValue<LogsDoAplicativo, K>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<LogsDoAplicativo>>(
            field: K,
            value: QueryableFieldValue<LogsDoAplicativo, K>,
          ) => string;
          greaterThan: <K extends QueryableKeys<LogsDoAplicativo>>(
            field: K,
            value: QueryableFieldValue<LogsDoAplicativo, K>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<LogsDoAplicativo>>(
            field: K,
            value: QueryableFieldValue<LogsDoAplicativo, K>,
          ) => string;
          contains: <K extends QueryableKeys<LogsDoAplicativo>>(
            field: K,
            value: QueryableFieldValue<LogsDoAplicativo, K>,
          ) => string;
          search: <K extends QueryableKeys<LogsDoAplicativo>>(
            field: K,
            value: string,
          ) => string;
          isNull: <K extends QueryableKeys<LogsDoAplicativo>>(
            field: K,
          ) => string;
          isNotNull: <K extends QueryableKeys<LogsDoAplicativo>>(
            field: K,
          ) => string;
          startsWith: <K extends QueryableKeys<LogsDoAplicativo>>(
            field: K,
            value: string,
          ) => string;
          endsWith: <K extends QueryableKeys<LogsDoAplicativo>>(
            field: K,
            value: string,
          ) => string;
          between: <K extends QueryableKeys<LogsDoAplicativo>>(
            field: K,
            start: QueryableFieldValue<LogsDoAplicativo, K>,
            end: QueryableFieldValue<LogsDoAplicativo, K>,
          ) => string;
          select: <K extends keyof LogsDoAplicativo>(fields: K[]) => string;
          orderAsc: <K extends keyof LogsDoAplicativo>(field: K) => string;
          orderDesc: <K extends keyof LogsDoAplicativo>(field: K) => string;
          limit: (value: number) => string;
          offset: (value: number) => string;
          cursorAfter: (documentId: string) => string;
          cursorBefore: (documentId: string) => string;
          or: (...queries: string[]) => string;
          and: (...queries: string[]) => string;
        }) => string[];
      }) => Promise<{ total: number; rows: LogsDoAplicativo[] }>;
      createMany: (
        rows: Array<
          {
            type: string;
            relatedUserId?: string | null;
            metadata: string;
          } & { $id?: string; $permissions?: string[] }
        >,
        options?: { transactionId?: string },
      ) => Promise<{ total: number; rows: LogsDoAplicativo[] }>;
      updateMany: (
        data: Partial<{
          type: string;
          relatedUserId?: string | null;
          metadata: string;
        }>,
        options?: {
          queries?: (q: {
            equal: <K extends QueryableKeys<LogsDoAplicativo>>(
              field: K,
              value: QueryableFieldValue<LogsDoAplicativo, K>,
            ) => string;
            notEqual: <K extends QueryableKeys<LogsDoAplicativo>>(
              field: K,
              value: QueryableFieldValue<LogsDoAplicativo, K>,
            ) => string;
            lessThan: <K extends QueryableKeys<LogsDoAplicativo>>(
              field: K,
              value: QueryableFieldValue<LogsDoAplicativo, K>,
            ) => string;
            lessThanEqual: <K extends QueryableKeys<LogsDoAplicativo>>(
              field: K,
              value: QueryableFieldValue<LogsDoAplicativo, K>,
            ) => string;
            greaterThan: <K extends QueryableKeys<LogsDoAplicativo>>(
              field: K,
              value: QueryableFieldValue<LogsDoAplicativo, K>,
            ) => string;
            greaterThanEqual: <K extends QueryableKeys<LogsDoAplicativo>>(
              field: K,
              value: QueryableFieldValue<LogsDoAplicativo, K>,
            ) => string;
            contains: <K extends QueryableKeys<LogsDoAplicativo>>(
              field: K,
              value: QueryableFieldValue<LogsDoAplicativo, K>,
            ) => string;
            search: <K extends QueryableKeys<LogsDoAplicativo>>(
              field: K,
              value: string,
            ) => string;
            isNull: <K extends QueryableKeys<LogsDoAplicativo>>(
              field: K,
            ) => string;
            isNotNull: <K extends QueryableKeys<LogsDoAplicativo>>(
              field: K,
            ) => string;
            startsWith: <K extends QueryableKeys<LogsDoAplicativo>>(
              field: K,
              value: string,
            ) => string;
            endsWith: <K extends QueryableKeys<LogsDoAplicativo>>(
              field: K,
              value: string,
            ) => string;
            between: <K extends QueryableKeys<LogsDoAplicativo>>(
              field: K,
              start: QueryableFieldValue<LogsDoAplicativo, K>,
              end: QueryableFieldValue<LogsDoAplicativo, K>,
            ) => string;
            select: <K extends keyof LogsDoAplicativo>(fields: K[]) => string;
            orderAsc: <K extends keyof LogsDoAplicativo>(field: K) => string;
            orderDesc: <K extends keyof LogsDoAplicativo>(field: K) => string;
            limit: (value: number) => string;
            offset: (value: number) => string;
            cursorAfter: (documentId: string) => string;
            cursorBefore: (documentId: string) => string;
            or: (...queries: string[]) => string;
            and: (...queries: string[]) => string;
          }) => string[];
          transactionId?: string;
        },
      ) => Promise<{ total: number; rows: LogsDoAplicativo[] }>;
      deleteMany: (options?: {
        queries?: (q: {
          equal: <K extends QueryableKeys<LogsDoAplicativo>>(
            field: K,
            value: QueryableFieldValue<LogsDoAplicativo, K>,
          ) => string;
          notEqual: <K extends QueryableKeys<LogsDoAplicativo>>(
            field: K,
            value: QueryableFieldValue<LogsDoAplicativo, K>,
          ) => string;
          lessThan: <K extends QueryableKeys<LogsDoAplicativo>>(
            field: K,
            value: QueryableFieldValue<LogsDoAplicativo, K>,
          ) => string;
          lessThanEqual: <K extends QueryableKeys<LogsDoAplicativo>>(
            field: K,
            value: QueryableFieldValue<LogsDoAplicativo, K>,
          ) => string;
          greaterThan: <K extends QueryableKeys<LogsDoAplicativo>>(
            field: K,
            value: QueryableFieldValue<LogsDoAplicativo, K>,
          ) => string;
          greaterThanEqual: <K extends QueryableKeys<LogsDoAplicativo>>(
            field: K,
            value: QueryableFieldValue<LogsDoAplicativo, K>,
          ) => string;
          contains: <K extends QueryableKeys<LogsDoAplicativo>>(
            field: K,
            value: QueryableFieldValue<LogsDoAplicativo, K>,
          ) => string;
          search: <K extends QueryableKeys<LogsDoAplicativo>>(
            field: K,
            value: string,
          ) => string;
          isNull: <K extends QueryableKeys<LogsDoAplicativo>>(
            field: K,
          ) => string;
          isNotNull: <K extends QueryableKeys<LogsDoAplicativo>>(
            field: K,
          ) => string;
          startsWith: <K extends QueryableKeys<LogsDoAplicativo>>(
            field: K,
            value: string,
          ) => string;
          endsWith: <K extends QueryableKeys<LogsDoAplicativo>>(
            field: K,
            value: string,
          ) => string;
          between: <K extends QueryableKeys<LogsDoAplicativo>>(
            field: K,
            start: QueryableFieldValue<LogsDoAplicativo, K>,
            end: QueryableFieldValue<LogsDoAplicativo, K>,
          ) => string;
          select: <K extends keyof LogsDoAplicativo>(fields: K[]) => string;
          orderAsc: <K extends keyof LogsDoAplicativo>(field: K) => string;
          orderDesc: <K extends keyof LogsDoAplicativo>(field: K) => string;
          limit: (value: number) => string;
          offset: (value: number) => string;
          cursorAfter: (documentId: string) => string;
          cursorBefore: (documentId: string) => string;
          or: (...queries: string[]) => string;
          and: (...queries: string[]) => string;
        }) => string[];
        transactionId?: string;
      }) => Promise<{ total: number; rows: LogsDoAplicativo[] }>;
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
      columns?: object[];
      indexes?: object[];
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
