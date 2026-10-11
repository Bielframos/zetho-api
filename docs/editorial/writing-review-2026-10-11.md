# Source-grounding review

An independent engineering agent compared generated drafts with the exact captured source supplied to the model. This is not a human editorial panel or external verification that a publisher's statements are true. Automated verifier decisions are recorded separately; they are not ground truth.

## Original prompt run

All 60 curation comparisons completed. Ten drafts were generated; all ten were retained by the automatic verifier, so none passed the simulated publication gate. The review found both real defects and false alarms in verification.

| Case | Independent finding                                                                                                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Supported update details, but completed-tense wording could incorrectly imply a still-running free weekend had ended. Mixed promotional/metrics focus remains ambiguous. |
| 3    | Calling an earlier release window “maintained” implies a reconfirmation absent from the supplied source. Most cast/gameplay details were supported.                      |
| 15   | Closing expectation of future details was unsupported.                                                                                                                   |
| 17   | Low win rate became a losing streak in the title, changing the source's claim. Several verifier allegations of missing details were incorrect.                           |
| 19   | Xbox wording could imply current availability despite a future release.                                                                                                  |
| 25   | Subtitle attached Halloween to a December update although the source placed the event in October–November. Body chronology was correct.                                  |
| 38   | Cast and forthcoming information were supported by the source; verifier objections to those claims were false alarms.                                                    |
| 39   | “First DLC” overgeneralized “first DLC character”; attribution should identify the actual producer rather than the hosting platform.                                     |
| 40   | Future regional/platform confirmations were not supported; attribution to the publishing platform was imprecise.                                                         |
| 50   | Title plus 57-character unrelated excerpt cannot support an expanded article. Repetition/padding should be prevented at selection.                                       |

## Intermediate run

Stopped after 16 cases when case 6, a physical trading-card set, was incorrectly selected. The snapshot is preserved separately. Case 9 improved: the draft attributed official franchise plans without inventing a specific title or date. Case 3 still had reconfirmation/absence-of-Brazil wording; case 1 conflated a simultaneous promotional event with update content. These findings prompted an explicit digital-game scope and more precise writing/verifier instructions.

## Final prompt run and deterministic guard replay

All 15 final-run drafts were reviewed against their supplied snapshots:

| Cases             | Finding and disposition                                                                                                                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3, 15, 18, 25, 38 | Factually supported with source attribution and no material invented details; final editorial gates pass. The case 25 Halloween/December chronology is now separated correctly.                           |
| 34                | Shutdown date and history supported; minor wording combines a team appreciation quote with separate community thanks. No material date/platform/action error; gates pass.                                 |
| 1                 | Mixed promotional/update framing persists in the subtitle; verifier retains draft.                                                                                                                        |
| 17                | Direction of saturation change and map-layout explanation were inferred more specifically than the source; verifier retains draft.                                                                        |
| 19                | Title presents an undeclared/developing feature as delayed; verifier retains draft.                                                                                                                       |
| 39                | Publisher attribution absent from supplied text, SEO loses the character qualifier, and promotional content remains; factual and final editorial checks retain draft.                                     |
| 40                | Main game facts supported, but 10% preorder promotion is inappropriate; the final deterministic guard retains draft despite factual approval.                                                             |
| 41, 43            | Guide/podcast format was wrongly selected. New deterministic title filters reject the source before writing; live follow-up confirms both rejections. Their original drafts had also failed verification. |
| 45                | Mixed retrospective interview remains a classification false positive; speaker attribution is uncertain after source extraction. Verifier retains draft.                                                  |
| 50                | Insufficient captured source; generated pass/publisher details are unsupported and price text remains. Factual and editorial gates retain draft.                                                          |

The verifier has residual false alarms (for example, treating supported paraphrases or present details as problems). These can withhold useful articles; automatic approval is not a substitute for independent review. Six drafts pass the measured editorial gates; none were actually published by this read-only evaluation. Existing production length and slug checks were not simulated.

## Interpretation

Prompt revisions use this same sample, including event-deduplication and factual-precision examples. Subsequent evaluation is a regression check after tuning, not a holdout study or evidence of generalization. Source excerpts and full generated drafts remain local; committed artifacts contain derived findings, source references and hashes only.
