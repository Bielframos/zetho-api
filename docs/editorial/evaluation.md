# Editorial quality evaluation — issue #100

## Scope and execution

The captured sample contains 60 real stories from production feeds plus a review feed to exercise excluded subjects. Source URLs, dates, expected categories and event groups are recorded in `sample-2026-10-11.json`. Initial labels were reviewed by an engineering agent from titles/excerpts, not an independent human editorial panel. This convenience sample is not a statistical estimate of production accuracy.

Run the old and new actual prompts with the same candidate and recent-event context:

```sh
EDITOR_EVAL_WRITING=true EDITOR_EVAL_ENV_FILE=/secure/path/.env pnpm exec ts-node -r tsconfig-paths/register scripts/evaluate-editorial.ts docs/editorial/sample-2026-10-11.json /tmp/editorial-results.json
```

With `EDITOR_EVAL_WRITING=true`, eligible stories also run the writer and factual verifier, saving drafts locally for claim-by-claim review. Catalog/video tools return empty results in this prose-only evaluation: no matches or links are invented, and integrations are covered separately by tests. The script only reads sources and calls the configured AI. It does not initialize Appwrite or publish anything. The historical prompt is frozen under `scripts/editorial-evaluation/prompts`; proposed calls include the deterministic exclusions, semantic eligibility and event deduplication. An optional local sample with `title` and `excerpt` reproduces the original capture when publisher pages become unavailable. Record failed fetches separately, never count them as correct rejections.

**Execution pending:** the first local key became available after implementation, but the provider rejected it with HTTP 401. No model comparison succeeded; publisher access failures are also recorded separately. Replace the local credential before retrying. The runner now stops on a model authentication failure and redacts provider key fragments. No before/after accuracy, false-positive/negative rate or factual-writing quality is claimed yet. Complete the live comparison and inspect generated writing against source facts before closing the evaluation requirement. Automated tests cover enforcement and failures but do not substitute model evaluation.

## Image experiment and decision

`images-2026-10-11.json` records 16 real publisher-embedded candidates. Fourteen returned HTTP 200 and decoded as PNG/JPEG in the initial capture. Re-running all 16 through the actual bounded downloader accepted 12 raster files (21–342 ms per successful request), rejected two over the 5 MB limit and two HTTP 403 responses. These implementation results and timings are stored alongside the initial capture. Visual inspection accepted 11 as relevant to the game; rejected 3 generic/speculative images. Two downloads returned 403. Two relevant thumbnails were only 480×360. The experiment generated no images and made no model calls; incremental model cost was zero. Network time is not a production SLA; the implementation records `elapsedMs` for subsequent bounded downloads.

A publisher embedding an asset is not proof of permission to republish. Attribution identifies the source, without inventing a rights holder. Therefore automatic image publication remains **disabled**. Never replace a missing asset with a generic or generated image.

The source inspector extracts actual OpenGraph/Twitter/article image URLs. Downloads permit public HTTPS only, pin the resolved public address (including redirects), cap redirects, time and bytes, and check raster MIME/signature. Source metadata alone does not establish relevance, authenticity or rights; those require editorial review.

After obtaining permission for a specific asset and confirming relevance, configure `EDITOR_IMAGES_ENABLED=true` and `EDITOR_APPROVED_IMAGES` as a JSON map keyed by the exact article URL, with `{url, alt, credit, sourceUrl}`. The approved URL must still be present on that source page and pass download validation. The existing `posts.mainImage` JSON column stores this metadata (no schema migration). A failed, unapproved or oversized asset falls back to no image. Disabling the flag does not disable the new text policy. No approvals were configured during this delivery.

Frontend detail renders an approved image responsively with alt and source credit; legacy images without attribution and failed loads fall back to text. Both generated and legacy HTML are sanitized, with only trusted YouTube embeds reconstructed.

## Release checks

- Automated/suggested/guided URL paths enforce the same eligibility policy.
- No eligible candidate produces a skip, never a forced story.
- Guided URLs also pass event-level deduplication.
- Writer preserves Brazilian Portuguese, source attribution, actual dates/platforms/regions; a separate grounding check retains unverified articles as drafts without notifications.
- Tests cover excluded topics, invalid classification, source sanitization, private IPs, missing image approvals and fallback.
- Remaining live-model evidence must be attached before treating #100 as fully verified.

## Audit output and limitations

The local result file includes the exact truncated text supplied to both pipelines, its SHA-256 and capture timestamp, and recent-event context. Keep these full source snapshots local; commit only derived findings and references. Each case distinguishes baseline selection, proposed eligibility, proposed selection and whether the generated draft passed the automated factual verifier. A verifier approval is not a completed manual factual review.

The summary separates extraction/model errors, ambiguous labels and duplicate-event cases from classification false-positive/false-negative denominators. At least 30 successful curation comparisons are required; source or curation failures do not meet that gate. Later writing/verifier failures retain the completed curation decisions and are reported separately; fully successful cases are counted independently. Report sample counts with all rates and inspect source labels before interpreting disagreements. The same-game/different-event control is article 18 with article 17 supplied as recent context; it should remain eligible despite the shared game.

Calls contain one candidate each. They measure rejection and deduplication, not competitive ranking among several news stories. Only curation has a frozen historical baseline; proposed prose receives a factual audit, without claiming a measured improvement over historical writing.
