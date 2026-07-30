import 'dotenv/config';
import { Client, Models, Query, TablesDB } from 'node-appwrite';

type ParticipantRow = Models.Row & {
  sessionId: string;
  profileId: string;
  status: string;
  isHost: boolean;
};

const apply = process.argv.includes('--apply');
const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT ?? '')
  .setProject(process.env.APPWRITE_PROJECT ?? '')
  .setKey(process.env.APPWRITE_API_KEY ?? '');
const tablesDB = new TablesDB(client);
const databaseId = 'app';
const participantsTable = 'gameplay_session_participants';

const statusPriority: Record<string, number> = {
  confirmed: 80,
  pending: 70,
  invited: 60,
  declined: 50,
  rejected: 40,
  removed: 30,
  left: 20,
  cancelled: 10,
};

async function listAllParticipants() {
  const rows: ParticipantRow[] = [];
  let offset = 0;
  while (true) {
    const page = await tablesDB.listRows<ParticipantRow>({
      databaseId,
      tableId: participantsTable,
      queries: [Query.limit(100), Query.offset(offset)],
    });
    rows.push(...page.rows);
    if (page.rows.length < 100) return rows;
    offset += page.rows.length;
  }
}

function chooseKeeper(rows: ParticipantRow[]) {
  return [...rows].sort((a, b) => {
    if (a.isHost !== b.isHost) return a.isHost ? -1 : 1;
    const priority =
      (statusPriority[b.status] ?? 0) - (statusPriority[a.status] ?? 0);
    if (priority) return priority;
    return b.$updatedAt.localeCompare(a.$updatedAt);
  })[0];
}

async function dedupeGroup(rows: ParticipantRow[]) {
  const keeper = chooseKeeper(rows);
  const duplicates = rows.filter((row) => row.$id !== keeper.$id);
  if (!apply) return { keeper, duplicates };

  const transaction = await tablesDB.createTransaction();
  try {
    for (const duplicate of duplicates) {
      await tablesDB.deleteRow({
        databaseId,
        tableId: participantsTable,
        rowId: duplicate.$id,
        transactionId: transaction.$id,
      });
    }
    const confirmed = await tablesDB.listRows<ParticipantRow>({
      databaseId,
      tableId: participantsTable,
      queries: [
        Query.equal('sessionId', keeper.sessionId),
        Query.equal('status', 'confirmed'),
        Query.limit(100),
      ],
      transactionId: transaction.$id,
    });
    await tablesDB.updateRow({
      databaseId,
      tableId: 'gameplay_sessions',
      rowId: keeper.sessionId,
      data: {
        confirmedCount: confirmed.total,
      },
      transactionId: transaction.$id,
    });
    await tablesDB.updateTransaction({
      transactionId: transaction.$id,
      commit: true,
    });
    return { keeper, duplicates };
  } catch (error) {
    await tablesDB.updateTransaction({
      transactionId: transaction.$id,
      rollback: true,
    });
    throw error;
  }
}

async function main() {
  const rows = await listAllParticipants();
  const groups = new Map<string, ParticipantRow[]>();
  for (const row of rows) {
    const key = `${row.sessionId}:${row.profileId}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const duplicateGroups = [...groups.values()].filter(
    (group) => group.length > 1,
  );
  let removed = 0;
  for (const group of duplicateGroups) {
    const result = await dedupeGroup(group);
    removed += result.duplicates.length;
  }

  console.log(
    `${apply ? 'Aplicado' : 'Dry run'}: ${duplicateGroups.length} vínculos duplicados; ${removed} linhas ${apply ? 'removidas' : 'a remover'}.`,
  );
  if (!apply && removed) {
    console.log(
      'Execute novamente com --apply antes de publicar o índice uniq_session_profile.',
    );
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
