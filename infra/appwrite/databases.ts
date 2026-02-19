import {
  Client,
  TablesDB,
  ID,
  Query,
  type Models,
  Permission,
  Role,
} from 'node-appwrite';
import type {
  DatabaseHandle,
  DatabaseId,
  DatabaseTableMap,
  DatabaseTables,
  QueryBuilder,
  PermissionBuilder,
  RoleBuilder,
  RoleString,
} from './types';
import { PROJECT_ID, ENDPOINT, API_KEY } from './constants';

const createQueryBuilder = <T>(): QueryBuilder<T> => ({
  equal: (field, value) => Query.equal(String(field), value as any),
  notEqual: (field, value) => Query.notEqual(String(field), value as any),
  lessThan: (field, value) => Query.lessThan(String(field), value as any),
  lessThanEqual: (field, value) =>
    Query.lessThanEqual(String(field), value as any),
  greaterThan: (field, value) => Query.greaterThan(String(field), value as any),
  greaterThanEqual: (field, value) =>
    Query.greaterThanEqual(String(field), value as any),
  contains: (field, value) => Query.contains(String(field), value as any),
  search: (field, value) => Query.search(String(field), value),
  isNull: (field) => Query.isNull(String(field)),
  isNotNull: (field) => Query.isNotNull(String(field)),
  startsWith: (field, value) => Query.startsWith(String(field), value),
  endsWith: (field, value) => Query.endsWith(String(field), value),
  between: (field, start, end) =>
    Query.between(String(field), start as any, end as any),
  select: (fields) => Query.select(fields.map(String)),
  orderAsc: (field) => Query.orderAsc(String(field)),
  orderDesc: (field) => Query.orderDesc(String(field)),
  limit: (value) => Query.limit(value),
  offset: (value) => Query.offset(value),
  cursorAfter: (documentId) => Query.cursorAfter(documentId),
  cursorBefore: (documentId) => Query.cursorBefore(documentId),
  or: (...queries) => Query.or(queries),
  and: (...queries) => Query.and(queries),
});

const tableIdMap: Record<string, Record<string, string>> = Object.create(null);
tableIdMap['app'] = Object.create(null);
tableIdMap['app']['IGDB Tokens'] = 'igdb_tokens';
tableIdMap['app']['Games'] = 'games';
tableIdMap['app']['Game Types'] = 'game_types';
tableIdMap['app']['User Profiles'] = 'user_profiles';
tableIdMap['app']['Z Entries'] = 'z_entries';
tableIdMap['app']['Genres'] = 'genres';
tableIdMap['app']['Companies'] = 'companies';
tableIdMap['app']['Z Entry Count'] = 'z_entry_count';
tableIdMap['app']['Game Comments'] = 'game_comments';
tableIdMap['app']['Game Comment Votes'] = 'game_comment_votes';
tableIdMap['app']['Lists'] = 'lists';
tableIdMap['app']['List Items'] = 'list_items';
tableIdMap['app']['Z Entries (Read-only)'] = 'z_entries_read';
tableIdMap['app']['Game Platforms'] = 'game_platforms';
tableIdMap['app']['Avaliações'] = 'ratings';
tableIdMap['app']['RPG Stories'] = 'rpg_stories';
tableIdMap['app']['RPG Chapters'] = 'rpg_chapters';
tableIdMap['app']['RPG Options'] = 'rpg_options';
tableIdMap['app']['RPG Votes'] = 'rpg_votes';

const tablesWithRelationships = new Set<string>([
  'app:Games',
  'app:Z Entry Count',
  'app:Game Comments',
  'app:Game Comment Votes',
  'app:List Items',
  'app:RPG Stories',
  'app:RPG Chapters',
  'app:RPG Options',
  'app:RPG Votes',
]);

const roleBuilder: RoleBuilder = {
  any: () => Role.any() as RoleString,
  user: (userId, status?) => Role.user(userId, status) as RoleString,
  users: (status?) => Role.users(status) as RoleString,
  guests: () => Role.guests() as RoleString,
  team: (teamId, role?) => Role.team(teamId, role) as RoleString,
  member: (memberId) => Role.member(memberId) as RoleString,
  label: (label) => Role.label(label) as RoleString,
};

const permissionBuilder: PermissionBuilder = {
  read: (role) => Permission.read(role),
  write: (role) => Permission.write(role),
  create: (role) => Permission.create(role),
  update: (role) => Permission.update(role),
  delete: (role) => Permission.delete(role),
};

const resolvePermissions = (
  callback?: (
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
  ) => string[],
): string[] | undefined => callback?.(permissionBuilder, roleBuilder);

function createTableApi<T extends Models.Row>(
  tablesDB: TablesDB,
  databaseId: string,
  tableId: string,
) {
  return {
    create: (
      data: any,
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
    ) =>
      tablesDB.createRow<T>({
        databaseId,
        tableId,
        rowId: options?.rowId ?? ID.unique(),
        data,
        permissions: resolvePermissions(options?.permissions),
        transactionId: options?.transactionId,
      }),
    get: (id: string) =>
      tablesDB.getRow<T>({
        databaseId,
        tableId,
        rowId: id,
      }),
    update: (
      id: string,
      data: any,
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
    ) =>
      tablesDB.updateRow<T>({
        databaseId,
        tableId,
        rowId: id,
        data,
        ...(options?.permissions
          ? { permissions: resolvePermissions(options.permissions) }
          : {}),
        transactionId: options?.transactionId,
      }),
    delete: async (id: string, options?: { transactionId?: string }) => {
      await tablesDB.deleteRow({
        databaseId,
        tableId,
        rowId: id,
        transactionId: options?.transactionId,
      });
    },
    list: (options?: { queries?: (q: any) => string[] }) =>
      tablesDB.listRows<T>({
        databaseId,
        tableId,
        queries: options?.queries?.(createQueryBuilder<T>()),
      }),
    createMany: (rows: any[], options?: { transactionId?: string }) =>
      tablesDB.createRows({
        databaseId,
        tableId,
        rows,
        transactionId: options?.transactionId,
      }),
    updateMany: (
      data: any,
      options?: { queries?: (q: any) => string[]; transactionId?: string },
    ) =>
      tablesDB.updateRows({
        databaseId,
        tableId,
        data,
        queries: options?.queries?.(createQueryBuilder()),
        transactionId: options?.transactionId,
      }),
    deleteMany: (options?: {
      queries?: (q: any) => string[];
      transactionId?: string;
    }) =>
      tablesDB.deleteRows({
        databaseId,
        tableId,
        queries: options?.queries?.(createQueryBuilder()),
        transactionId: options?.transactionId,
      }),
  };
}

const hasBulkMethods = (dbId: string, tableId: string) =>
  !tablesWithRelationships.has(`${dbId}:${tableId}`);

const hasOwn = (obj: unknown, key: string): boolean =>
  obj != null && Object.prototype.hasOwnProperty.call(obj, key);

function createDatabaseHandle<D extends DatabaseId>(
  tablesDB: TablesDB,
  databaseId: D,
): DatabaseHandle<D> {
  const tableApiCache = new Map<string, unknown>();
  const dbMap = tableIdMap[databaseId];

  return {
    use: <T extends keyof DatabaseTableMap[D] & string>(
      tableId: T,
    ): DatabaseTableMap[D][T] => {
      if (!hasOwn(dbMap, tableId)) {
        throw new Error(
          `Unknown table "${tableId}" in database "${databaseId}"`,
        );
      }

      if (!tableApiCache.has(tableId)) {
        const resolvedTableId = dbMap[tableId];
        const api = createTableApi(tablesDB, databaseId, resolvedTableId);

        // Remove bulk methods for tables with relationships
        if (!hasBulkMethods(databaseId, tableId)) {
          delete (api as any).createMany;
          delete (api as any).updateMany;
          delete (api as any).deleteMany;
        }
        tableApiCache.set(tableId, api);
      }
      return tableApiCache.get(tableId) as DatabaseTableMap[D][T];
    },
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
    ) =>
      tablesDB.createTable({
        databaseId,
        tableId,
        name,
        permissions: resolvePermissions(options?.permissions),
        rowSecurity: options?.rowSecurity,
        enabled: options?.enabled,
        columns: options?.columns,
        indexes: options?.indexes,
      }),
    update: (
      tableId: string,
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
    ) => {
      if (!hasOwn(dbMap, tableId)) {
        throw new Error(
          `Unknown table "${tableId}" in database "${databaseId}"`,
        );
      }
      const resolvedTableId = dbMap[tableId];
      return tablesDB.updateTable({
        databaseId,
        tableId: resolvedTableId,
        name: options?.name ?? tableId, // TODO: remove this fallback once fixed in other SDKs
        permissions: resolvePermissions(options?.permissions),
        rowSecurity: options?.rowSecurity,
        enabled: options?.enabled,
      });
    },
    delete: async (tableId: string) => {
      if (!hasOwn(dbMap, tableId)) {
        throw new Error(
          `Unknown table "${tableId}" in database "${databaseId}"`,
        );
      }
      const resolvedTableId = dbMap[tableId];
      await tablesDB.deleteTable({
        databaseId,
        tableId: resolvedTableId,
      });
    },
  };
}

export function createDatabasesApi(tablesDB: TablesDB): DatabaseTables {
  const dbCache = new Map<
    DatabaseId,
    ReturnType<typeof createDatabaseHandle>
  >();

  return {
    use: (databaseId: DatabaseId) => {
      if (!hasOwn(tableIdMap, databaseId)) {
        throw new Error(`Unknown database "${databaseId}"`);
      }

      if (!dbCache.has(databaseId)) {
        dbCache.set(databaseId, createDatabaseHandle(tablesDB, databaseId));
      }
      return dbCache.get(databaseId);
    },
    create: (
      databaseId: string,
      name: string,
      options?: { enabled?: boolean },
    ) =>
      tablesDB.create({
        databaseId,
        name,
        enabled: options?.enabled,
      }),
    update: (
      databaseId: DatabaseId,
      options?: { name?: string; enabled?: boolean },
    ) => {
      return tablesDB.update({
        databaseId,
        name: options?.name ?? databaseId,
        enabled: options?.enabled,
      });
    },
    delete: async (databaseId: DatabaseId) => {
      await tablesDB.delete({
        databaseId,
      });
    },
  } as DatabaseTables;
}

// Initialize client
const client = new Client()
  .setEndpoint(ENDPOINT)
  .setProject(PROJECT_ID)
  .setKey(API_KEY);

const tablesDB = new TablesDB(client);

export const databases: DatabaseTables = createDatabasesApi(tablesDB);
