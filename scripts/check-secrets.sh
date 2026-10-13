#!/usr/bin/env bash
set -euo pipefail

# The default scan snapshots tracked and nonignored untracked files, including
# local edits. This keeps ignored local artifacts out of the scan. `--history` is
# an opt-in full-history audit; it can report credentials intentionally present
# in older commits, so review its redacted findings separately.

usage() {
  printf 'Usage: %s [--history]\n' "${0##*/}" >&2
}

include_history=false
if [[ $# -gt 1 ]]; then usage; exit 2; fi
if [[ $# -eq 1 ]]; then
  if [[ $1 != --history ]]; then usage; exit 2; fi
  include_history=true
fi

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
gitleaks_bin=${GITLEAKS_BIN:-gitleaks}
if ! command -v "$gitleaks_bin" >/dev/null 2>&1; then
  printf 'gitleaks is required; install v8.30.1 or set GITLEAKS_BIN.\n' >&2
  exit 127
fi

snapshot=$(mktemp -d)
trap 'rm -rf -- "$snapshot"' EXIT
(
  cd -- "$repo_root"
  while IFS= read -r -d '' path; do
    [[ -f $path || -L $path ]] || continue
    cp -a --parents -- "$path" "$snapshot"
  done < <(git ls-files --cached --others --exclude-standard -z | sort -zu)
)

"$gitleaks_bin" dir --no-banner --redact --config "$repo_root/.gitleaks.toml" "$snapshot"

if [[ $include_history == true ]]; then
  "$gitleaks_bin" git --no-banner --redact --config "$repo_root/.gitleaks.toml" \
    --log-opts='--all' "$repo_root"
fi
