/** Dates describe registration of the current status, never real-world completion. */
export type StatusSnapshot = {
  $id: string;
  $createdAt?: string;
  status?: string | null;
};

export function validStatusDate(value?: string | null): string | null {
  return value && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : null;
}

export function resolveStatusChangedAt(
  previousStatus: string | null | undefined,
  currentStatus: string | null | undefined,
  previousDate: string | null | undefined,
  eventDate: string | undefined,
): string | null {
  if (!currentStatus) return null;
  return previousStatus === currentStatus
    ? validStatusDate(previousDate)
    : validStatusDate(eventDate);
}

/** Replay complete snapshots; likes/edits retain the previous transition date. */
export function statusChangedAtFromHistory(
  history: readonly StatusSnapshot[],
): string | null {
  if (history.some((entry) => !validStatusDate(entry.$createdAt))) return null;
  const ordered = [...history].sort(
    (a, b) =>
      Date.parse(a.$createdAt!) - Date.parse(b.$createdAt!) ||
      a.$id.localeCompare(b.$id),
  );
  let status: string | null = null;
  let date: string | null = null;
  for (const entry of ordered) {
    date = resolveStatusChangedAt(status, entry.status, date, entry.$createdAt);
    status = entry.status ?? null;
  }
  return date;
}
