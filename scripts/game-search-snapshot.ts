import { createReadStream } from 'node:fs';

/** JSON permits U+2028/U+2029 inside strings; readline may split them on newer Node versions. */
export async function* readSnapshot(
  file: string,
): AsyncGenerator<Record<string, any>> {
  let pending = '';
  for await (const chunk of createReadStream(file, { encoding: 'utf8' })) {
    pending += chunk;
    let end: number;
    while ((end = pending.indexOf('\n')) !== -1) {
      const line = pending.slice(0, end);
      pending = pending.slice(end + 1);
      if (line.trim()) yield JSON.parse(line);
    }
  }
  if (pending.trim()) yield JSON.parse(pending);
}
