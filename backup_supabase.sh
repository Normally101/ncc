#!/usr/bin/env bash
# ============================================================================
# backup_supabase.sh — Chauffeur Empire
# Backup del database Supabase via pg_dump. NESSUN segreto nel file.
#
# USO:
#   1. Prendi la connection string da Supabase:
#      Dashboard → Project Settings → Database → Connection string → URI
#      → scegli "Session pooler" (l'host diretto db.*.supabase.co NON risolve più).
#      Es: postgresql://postgres.twstjbykstaioaahfqbe:NUOVA_PASSWORD@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
#   2. Esegui passando la stringa come variabile d'ambiente (così non finisce in chiaro nel file):
#      SUPABASE_DB_URL='postgresql://...' ./backup_supabase.sh
#   3. (Opzionale) Schedula con cron, es. ogni giorno alle 3:00:
#      0 3 * * * SUPABASE_DB_URL='postgresql://...' /Users/vlad/Documents/ncc_game/backup_supabase.sh >> ~/ce-backups/cron.log 2>&1
#      NB: per cron, valuta di mettere la URL in un file ~/.ce_db_url con `chmod 600` e fare `source` qui.
#
# RIPRISTINO (test almeno una volta!):
#   gunzip -c ~/ce-backups/ce_backup_TIMESTAMP.sql.gz | psql 'SUPABASE_DB_URL'
#   (oppure ripristina su un progetto Supabase di staging per provare senza rischi)
# ============================================================================
set -euo pipefail

# --- Config ---
BACKUP_DIR="${CE_BACKUP_DIR:-$HOME/ce-backups}"
KEEP_LAST="${CE_BACKUP_KEEP:-14}"   # quante copie tenere (rotazione)

# --- Trova pg_dump (PATH o brew libpq, keg-only) ---
PG_DUMP=""
if command -v pg_dump >/dev/null 2>&1; then
    PG_DUMP="$(command -v pg_dump)"
elif [ -x /opt/homebrew/opt/libpq/bin/pg_dump ]; then
    PG_DUMP=/opt/homebrew/opt/libpq/bin/pg_dump
elif [ -x /usr/local/opt/libpq/bin/pg_dump ]; then
    PG_DUMP=/usr/local/opt/libpq/bin/pg_dump
else
    echo "ERRORE: pg_dump non trovato. Installalo con:  brew install libpq" >&2
    echo "(poi pg_dump sarà in /opt/homebrew/opt/libpq/bin/pg_dump)" >&2
    exit 1
fi

# --- Verifica la connection string ---
if [ -z "${SUPABASE_DB_URL:-}" ]; then
    echo "ERRORE: imposta SUPABASE_DB_URL con la connection string del pooler Supabase." >&2
    echo "Esempio:  SUPABASE_DB_URL='postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres' ./backup_supabase.sh" >&2
    exit 1
fi

mkdir -p "$BACKUP_DIR"
TS="$(date +%Y%m%d_%H%M%S)"
OUT="$BACKUP_DIR/ce_backup_${TS}.sql.gz"

echo "[$(date '+%H:%M:%S')] Backup in corso → $OUT"
# --no-owner/--no-privileges: il dump si ripristina pulito su un altro progetto.
# Esclude lo schema interno di Supabase (auth/storage gestiti dalla piattaforma); fa backup dello schema 'public' (i tuoi dati).
"$PG_DUMP" "$SUPABASE_DB_URL" \
    --no-owner --no-privileges \
    --schema=public \
    | gzip > "$OUT"

SIZE="$(du -h "$OUT" | cut -f1)"
echo "[$(date '+%H:%M:%S')] OK — $SIZE"

# --- Rotazione: tieni solo le ultime N copie ---
ls -1t "$BACKUP_DIR"/ce_backup_*.sql.gz 2>/dev/null | tail -n +"$((KEEP_LAST+1))" | xargs -I{} rm -f {} 2>/dev/null || true
echo "[$(date '+%H:%M:%S')] Rotazione: tenute max $KEEP_LAST copie in $BACKUP_DIR"
echo "RICORDA: testa un restore almeno una volta. Un backup mai ripristinato non è un backup."
