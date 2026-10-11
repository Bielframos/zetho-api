/** An invalid model response is an evaluation error, never a correct rejection. */
export function selectedByTrend(value: unknown, expectedId: number): boolean {
  if (!value || typeof value !== 'object')
    throw new Error('Missing trend output');
  const { id, title } = value as Record<string, unknown>;
  if (
    typeof id !== 'string' ||
    typeof title !== 'string' ||
    !id.trim() ||
    !title.trim()
  )
    throw new Error('Invalid trend output');
  if (id.trim().toUpperCase() === 'N/A' || title.trim().toUpperCase() === 'N/A')
    return false;
  if (id.trim() !== String(expectedId))
    throw new Error('Trend selected an unknown candidate');
  return true;
}

export type EvaluationResult = {
  id: number;
  expected: string;
  error?: string;
  stage?: string;
  decisions?: {
    baselineSelected: boolean;
    proposedSelected: boolean;
    proposedEligible?: boolean;
    proposedDraftSupported?: boolean | null;
  };
};

export function summarize(results: EvaluationResult[]) {
  const successful = results.filter(
    (r) =>
      r.decisions &&
      (!r.error || r.stage === 'writing' || r.stage === 'verification'),
  );
  const scored = successful.filter(
    (r) => r.expected === 'accept' || r.expected.startsWith('reject_'),
  );
  const counts = (key: 'baselineSelected' | 'proposedSelected') => {
    const falsePositives = scored
      .filter((r) => r.expected.startsWith('reject_') && r.decisions![key])
      .map((r) => r.id);
    const falseNegatives = scored
      .filter((r) => r.expected === 'accept' && !r.decisions![key])
      .map((r) => r.id);
    const positives = scored.filter((r) => r.expected === 'accept').length;
    const negatives = scored.length - positives;
    return {
      falsePositives,
      falseNegatives,
      falsePositiveRate: negatives ? falsePositives.length / negatives : null,
      falseNegativeRate: positives ? falseNegatives.length / positives : null,
      duplicatesSelected: successful
        .filter((r) => r.expected === 'duplicate' && r.decisions![key])
        .map((r) => r.id),
    };
  };
  return {
    attempted: results.length,
    curationSuccessful: successful.length,
    fullySuccessful: results.filter((r) => !r.error && r.decisions).length,
    minimumThirtySuccessful: successful.length >= 30,
    scored: scored.length,
    ambiguous: successful
      .filter((r) => r.expected === 'ambiguous')
      .map((r) => r.id),
    duplicates: successful
      .filter((r) => r.expected === 'duplicate')
      .map((r) => r.id),
    errors: results
      .filter((r) => r.error)
      .map(({ id, stage, error }) => ({ id, stage, error })),
    baseline: counts('baselineSelected'),
    proposed: counts('proposedSelected'),
    factualWritingReview: 'pending_manual_review',
  };
}
