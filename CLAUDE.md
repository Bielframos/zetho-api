# Claude Workflow Guide

## Purpose
This repository uses explicit phase-based delivery. Every commit and pull request should make it obvious:

1. which phase is being executed,
2. which plan or slice is included,
3. what changed, and
4. how it was verified.

## Commit rules

- Use a phase-aware conventional commit subject.
- Prefer this format:
  `feat(phase-02): execute operational observability baseline`
- If a commit is narrower than the full phase, include the phase and plan id:
  `fix(phase-02-01): preserve correlation header in legacy e2e test`
- Do not use vague subjects like `docs update`, `fixes`, or `work`.
- The body should state:
  - phase name and number,
  - plan ids included,
  - the behavioral change,
  - validation commands run.
- Always include the required trailer:
  `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`

## Pull request rules

- PR title should name the phase, not just the branch.
- Prefer:
  `Phase 2 — Operational Observability Baseline`
- The PR body should include:
  - summary of the phase goal,
  - list of implemented areas,
  - verification performed,
  - any known follow-up items.
- If the PR closes a phase, say so explicitly.
- Keep PRs scoped to one phase unless the user asks otherwise.

## Phase execution etiquette

- Make the phase obvious in every user-facing artifact.
- Update planning artifacts when a phase is completed.
- Prefer one logical commit per completed slice or wave.
- If you need to ship partial work, say which plan ids are included and which remain open.

