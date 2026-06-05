# Agent Instructions

## How to work here

- Use the GSD workflow for planned work.
- Keep changes phase-scoped and explicit.
- Update planning artifacts when a phase is executed or completed.
- Verify the result before shipping.

## Commit standards

- Commit subjects must mention the phase when the work belongs to a phase.
- Good:
  - `feat(phase-02): execute operational observability baseline`
  - `fix(phase-02-03): tighten structured lifecycle logging`
- Bad:
  - `misc updates`
  - `docs`
  - `fix stuff`
- Include a body when the change is more than trivial.
- Mention:
  - phase number/name,
  - plan ids,
  - what changed,
  - what was validated.
- Add the `Co-authored-by` trailer required by this repository.

## Pull request standards

- PR titles must describe the phase outcome.
- Prefer:
  - `Phase 2 — Operational Observability Baseline`
- PR descriptions should summarize:
  - goal,
  - implementation areas,
  - verification,
  - any limitations or follow-up work.
- If the PR ships a phase, say that directly in the description.
- Keep PRs focused. Do not mix unrelated work into a phase PR.

## When in doubt

- Choose clarity over brevity.
- If a commit or PR would not make the phase obvious to a reviewer, rewrite it.

