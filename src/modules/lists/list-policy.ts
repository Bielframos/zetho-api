import { ServiceUnavailableException } from '@nestjs/common';
import { Permission, Query, Role } from 'node-appwrite';
import type { Appwrite } from 'src/infra/appwrite/appwrite.provider';

export type ListState = {
  isPublic?: boolean;
  status?: string | null;
  ownerType?: string | null;
  ownerFingerprint?: string;
};
export const isSystemList = (list: ListState) =>
  list.ownerType === 'system' || list.ownerFingerprint === 'system:zetho';
export const isPublishedList = (list: ListState) =>
  list.isPublic === true && (list.status ?? 'published') === 'published';
export const publishedListQuery = () =>
  Query.or([Query.equal('status', 'published'), Query.isNull('status')]);
export function listReadPermissions(list: ListState, userId?: string) {
  return [
    ...(!isSystemList(list) && userId
      ? [Permission.read(Role.user(userId))]
      : []),
    ...(isPublishedList(list) ? [Permission.read(Role.any())] : []),
  ];
}
export async function requirePrivateListTables(db: Appwrite['tablesDB']) {
  for (const tableId of ['lists', 'list_items']) {
    const table = await db.getTable({ databaseId: 'app', tableId });
    if (table.$permissions.length || !table.rowSecurity)
      throw new ServiceUnavailableException(
        'As permissões de listas ainda precisam ser configuradas.',
      );
  }
}
