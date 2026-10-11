import {
  evaluationFailure,
  selectedByTrend,
  summarize,
  EvaluationResult,
} from './report';

describe('editorial evaluation evidence', () => {
  it('accepts only the supplied candidate and respects both rejection sentinels', () => {
    expect(selectedByTrend({ id: '1', title: 'News' }, 1)).toBe(true);
    expect(selectedByTrend({ id: '1', title: 'N/A' }, 1)).toBe(false);
    expect(selectedByTrend({ id: 'N/A', title: 'News' }, 1)).toBe(false);
    expect(selectedByTrend({ id: ' n/a ', title: 'News' }, 1)).toBe(false);
    expect(selectedByTrend({ id: '1', title: ' n/a ' }, 1)).toBe(false);
    for (const invalid of [null, {}, { id: '2', title: 'News' }])
      expect(() => selectedByTrend(invalid, 1)).toThrow();
  });
  it('excludes failures, ambiguities and duplicates from classification denominators', () => {
    const results: EvaluationResult[] = [
      {
        id: 1,
        expected: 'accept',
        decisions: { baselineSelected: false, proposedSelected: true },
      },
      {
        id: 2,
        expected: 'reject_review',
        decisions: { baselineSelected: true, proposedSelected: false },
      },
      {
        id: 3,
        expected: 'duplicate',
        decisions: { baselineSelected: true, proposedSelected: false },
      },
      {
        id: 4,
        expected: 'ambiguous',
        decisions: { baselineSelected: true, proposedSelected: true },
      },
      ...Array.from({ length: 30 }, (_, n) => ({
        id: n + 5,
        expected: 'reject_review',
        stage: 'source',
        error: 'unavailable',
      })),
    ];
    const summary = summarize(results);
    expect(summary.curationSuccessful).toBe(4);
    expect(summary.minimumThirtySuccessful).toBe(false);
    expect(summary.scored).toBe(2);
    expect(summary.baseline.falsePositiveRate).toBe(1);
    expect(summary.baseline.falseNegativeRate).toBe(1);
    expect(summary.proposed.falsePositiveRate).toBe(0);
    expect(summary.proposed.falseNegativeRate).toBe(0);
    expect(summary.baseline.duplicatesSelected).toEqual([3]);
    expect(summary.ambiguous).toEqual([4]);
    expect(summary.errors).toHaveLength(30);
  });
  it('retains curation decisions when writing fails', () => {
    const summary = summarize([
      {
        id: 1,
        expected: 'accept',
        stage: 'writing',
        error: 'model timeout',
        decisions: { baselineSelected: false, proposedSelected: true },
      },
    ]);
    expect(summary.curationSuccessful).toBe(1);
    expect(summary.fullySuccessful).toBe(0);
    expect(summary.proposed.falseNegativeRate).toBe(0);
    expect(summary.errors).toHaveLength(1);
  });
  it('reports absent denominators as unknown rather than perfect scores', () => {
    expect(summarize([]).proposed.falsePositiveRate).toBeNull();
    expect(summarize([]).proposed.falseNegativeRate).toBeNull();
  });
});

describe('evaluation credential failures', () => {
  it('redacts provider key fragments and stops on invalid model credentials', () => {
    const failure = evaluationFailure(
      new Error('401 Incorrect API key provided: sk-proj-***abcd'),
      'baseline',
    );
    expect(failure).toEqual({
      error: '401 Incorrect API key provided: [redacted]',
      fatal: true,
    });
  });
  it('does not confuse publisher access denial with model authentication', () => {
    expect(
      evaluationFailure(new Error('Editorial source HTTP 401'), 'source').fatal,
    ).toBe(false);
    expect(
      evaluationFailure(new Error('Editorial source HTTP 403'), 'source').fatal,
    ).toBe(false);
  });
});
