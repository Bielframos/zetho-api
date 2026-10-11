# Editorial quality evaluation — issue #100

## Scope and execution

The captured sample contains 60 real stories from production feeds plus a review feed to exercise excluded subjects. Source URLs, dates, expected categories and event groups are recorded in `sample-2026-10-11.json`. Initial labels were reviewed by an engineering agent from titles/excerpts, not an independent human editorial panel. This convenience sample is not a statistical estimate of production accuracy.

Run the old and new actual prompts with the same candidate and recent-event context:

```sh
EDITOR_EVAL_WRITING=true EDITOR_EVAL_ENV_FILE=/secure/path/.env pnpm exec ts-node -r tsconfig-paths/register scripts/evaluate-editorial.ts docs/editorial/sample-2026-10-11.json /tmp/editorial-results.json
```

With `EDITOR_EVAL_WRITING=true`, eligible stories also run the writer and factual verifier, saving drafts locally for claim-by-claim review. Catalog/video tools return empty results in this prose-only evaluation: no matches or links are invented, and integrations are covered separately by tests. The script only reads sources and calls the configured AI. It does not initialize Appwrite or publish anything. The historical prompt is frozen under `scripts/editorial-evaluation/prompts`; proposed calls include the deterministic exclusions, semantic eligibility and event deduplication. An optional local sample with `title` and `excerpt` reproduces the original capture when publisher pages become unavailable. Record failed fetches separately, never count them as correct rejections.

## Completed model comparison

The corrected local credential allowed **60/60 successful paired comparisons**, with no source/model errors. Both pipelines received identical captured source text (47 sources longer than 1,000 characters; all nonempty), limited to 12,000 characters. The historical baseline, eligibility, selection and verifier use `openai/gpt-5.4-mini`; the writer uses `openai/gpt-5.4`. No production posts or notifications were created by this evaluation.

An independent engineering agent reviewed the source labels before opening model results. It corrected case 41 from duplicate to guide; the original sample and the separate blind annotation review are preserved. Final scoring uses 12 accepted stories, 40 rejected subjects, 6 ambiguous cases and 2 duplicates. Case 50 remains a title-level accepted announcement with explicitly insufficient captured body; it is not a valid basis for detailed writing. Mixed cases and alternatives are documented in `annotation-review-2026-10-11.json`.

| Same final source sample                   | Historical selection | Final proposed selection |
| ------------------------------------------ | -------------------- | ------------------------ |
| False positives among 40 rejected subjects | 38/40 (95%)          | 1/40 (2.5%)              |
| False negatives among 12 accepted stories  | 1/12 (8.3%)          | 2/12 (16.7%)             |
| Selected duplicate events                  | 0/2                  | 0/2                      |
| Same-game/different-event control 18       | Rejected             | Selected                 |

The remaining false positive is case 45, a mixed retrospective interview that also mentions released content; its generated draft failed verification. False negatives 9 and 14 reflect conservative rejection of official but nonspecific future franchise/tools plans. This tradeoff is recorded rather than hidden by relabeling outputs. No explicitly excluded subject passed the final editorial gates in this sample.

The initial complete run is preserved in `results-original-2026-10-11.json`. An intermediate revision was stopped after 16 cases because a physical trading-card announcement was selected; `results-intermediate-2026-10-11.json` records it. The final prompt run completed 60 cases and produced 15 drafts. Its raw selection had three false positives (41/43/45). Explicit guide/podcast title filters subsequently rejected 41/43, and a final generated-text price/promotion guard retained the otherwise factually approved case 40. We replayed these deterministic guards over the unchanged 60 snapshots and ran the two affected selection cases live again; we did **not** regenerate 60 drafts after this guard change. `results-final-2026-10-11.json` records both raw and replayed metrics, hashes and case decisions.

Independent source-grounding review covered all 15 drafts. Six (3/15/18/25/34/38) passed factual and final editorial checks without material unsupported claims. These are candidate editorial approvals, not actual publications: production length/source/slug checks remain additional gates. The factual verifier rejected eight other drafts; case 40 passed factual verification but its promotion was caught by the new final guard. Cases 39/50 also contained promotional text and were already factually rejected. `writing-review-2026-10-11.md` records real defects and verifier false alarms. The verifier remains conservative and sometimes lists supported statements as objections; do not interpret its verdict as ground truth or promise universal factual accuracy.

All revisions were tuned on this same convenience sample. This is a regression evaluation, not a holdout or production accuracy estimate. Only curation has a historical baseline; no before/after writing-quality gain is measured. Calls were singleton candidates, not competitive ranking. Full source/draft snapshots remain local. Model usage was not instrumented for every stage, so no complete dollar-cost estimate is claimed; the separate image experiment below made no model calls.

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
- Live comparison, blind label review, independent draft audit and final deterministic replay are attached in this directory. Generated promotional copy is retained as draft even when factual verification approves it, without publication notifications.

## Audit output and limitations

The local result file includes the exact truncated text supplied to both pipelines, its SHA-256 and capture timestamp, and recent-event context. Keep these full source snapshots local; commit only derived findings and references. Each case distinguishes baseline selection, proposed eligibility, proposed selection and whether the generated draft passed the automated factual verifier. A verifier approval is not a completed manual factual review.

The summary separates extraction/model errors, ambiguous labels and duplicate-event cases from classification false-positive/false-negative denominators. At least 30 successful curation comparisons are required; source or curation failures do not meet that gate. Later writing/verifier failures retain the completed curation decisions and are reported separately; fully successful cases are counted independently. Report sample counts with all rates and inspect source labels before interpreting disagreements. The same-game/different-event control is article 18 with article 17 supplied as recent context; it should remain eligible despite the shared game.

Calls contain one candidate each. They measure rejection and deduplication, not competitive ranking among several news stories. Only curation has a frozen historical baseline; proposed prose receives a factual audit, without claiming a measured improvement over historical writing.
