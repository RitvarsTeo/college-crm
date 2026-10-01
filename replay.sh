#!/bin/bash
set -e
finish() {   # commit what is staged, or skip when the pick became empty
  if git -c commit.gpgsign=false cherry-pick --continue --no-edit >/dev/null 2>&1; then echo "  applied"
  elif git diff --cached --quiet; then git cherry-pick --skip >/dev/null 2>&1; echo "  EMPTY, skipped (its only change was the backlog)"
  else git -c commit.gpgsign=false commit -q --no-edit; git cherry-pick --continue --no-edit >/dev/null 2>&1 || true; echo "  committed"; fi
}
git cherry-pick --skip >/dev/null 2>&1 || true
for c in 06de128 a2884e8 7f0e7cb; do
  echo "$c  $(git log -1 --format=%s "$c" | cut -c1-55)"
  if git cherry-pick "$c" >/dev/null 2>&1; then echo "  clean"
  else
    for f in $(git diff --name-only --diff-filter=U); do
      if [ "$f" = "docs/BACKLOG.md" ]; then git checkout --ours "$f"; git add "$f"
      else echo "  !! STOP: conflict in $f"; exit 1; fi
    done
    finish
  fi
done
