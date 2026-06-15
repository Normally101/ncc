#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# deploy.sh — Chauffeur Empire · pubblicazione SICURA su GitHub Pages (gh-pages)
#
# Pubblica SOLO i file di runtime dell'app. I file interni (documentazione,
# migrazioni SQL, script Python/shell, Edge Functions server-side, config di
# build) restano su `main` (repo privato) e NON finiscono sul sito pubblico.
#
# ⚠️ USARE QUESTO al posto di `git push main:gh-pages` (che pubblicava TUTTO,
#    inclusi i .sql con l'architettura di sicurezza — leak confermato 15/06/26).
#
# Uso:  ./deploy.sh        (dal branch main, working tree pulito)
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

BR="$(git rev-parse --abbrev-ref HEAD)"
[ "$BR" = main ] || { echo "✋ Sei su '$BR', non su main. Annullo."; exit 1; }
git diff --quiet && git diff --cached --quiet || { echo "✋ Working tree sporco — committa o stasha prima."; exit 1; }

# File/cartelle INTERNI da NON pubblicare (restano solo su main, privato).
EXCLUDES=(
  '*.md' '*.sql' '*.py' '*.sh'
  'supabase' 'docs' '.github' '.agents' '.claude' '_mockups'
  'tailwind.input.css' 'tailwind.config.js'
  'package.json' 'package-lock.json' 'skills-lock.json' '.gitignore'
)

echo "→ Fetch gh-pages…"
git fetch -q origin gh-pages || true

WT="$(mktemp -d)"
cleanup() { git worktree remove --force "$WT" 2>/dev/null || true; rm -rf "$WT"; }
trap cleanup EXIT

if git show-ref -q --verify refs/remotes/origin/gh-pages; then
  git worktree add -q -B gh-pages "$WT" origin/gh-pages
else
  git worktree add -q -B gh-pages "$WT" main
fi

# Svuota il worktree (tranne .git) e ripopola con l'albero di main.
find "$WT" -mindepth 1 -maxdepth 1 ! -name '.git' -exec rm -rf {} +
git archive main | tar -x -C "$WT"

# Rimuovi i file interni dalla copia da pubblicare.
( cd "$WT"
  shopt -s nullglob
  for pat in "${EXCLUDES[@]}"; do rm -rf $pat; done
)

( cd "$WT"
  git add -A
  if git diff --cached --quiet; then
    echo "✓ gh-pages già aggiornato — niente da pubblicare."
  else
    git commit -qm "deploy: $(date -u +%FT%TZ) — solo file app"
    git push -q origin gh-pages
    echo "✅ Pubblicato su gh-pages (solo file app). Il sito si aggiorna in ~1 min."
  fi
)
