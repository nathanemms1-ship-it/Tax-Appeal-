#!/usr/bin/env bash
#
# Load every downloaded DOR roll file into Postgres.
#
#   ./scripts/dor/load-all.sh ~/Downloads
#
# It will ask for your Supabase database password and work out the rest.
#
# ============================================================================
# WHY THIS PROMPTS INSTEAD OF READING A CONNECTION STRING
# ============================================================================
# Building the URI by hand is where every attempt at this went wrong:
#
#   - a password containing ' or " breaks shell quoting and the error surfaces
#     as a connection failure, which sends you debugging the network
#   - a password containing @ : / # silently truncates the URI, because @ is
#     what separates the password from the host
#   - the direct host (db.<ref>.supabase.co) is IPv6-only unless you buy the
#     IPv4 add-on, so it fails on most home connections — sometimes with
#     "connection refused", which reads like the server is down
#   - the pooler needs a DIFFERENT username (postgres.<ref>, not postgres),
#     which is easy to miss
#
# So: read the password with `read -s` (never echoed, never in shell history,
# never in an environment variable another process can read), assemble the URI
# here where the quoting is controlled, and TRY EACH ENDPOINT until one answers.
#
# ============================================================================
# WHAT IT DOES
# ============================================================================
# For each "* NAL 2026.zip" / "* SDF 2026.zip" in the given directory:
#   1. unzip to a temp dir
#   2. parse to a COPY-ready CSV (residential parcels only)
#   3. copy into Postgres via a staging table + upsert
#   4. delete the temp files before the next county, so peak disk stays at one
#      county rather than the ~5 GB all thirteen need uncompressed at once
#
# Safe to re-run. Rows are keyed on (county, parcel, roll year), so a repeat
# load collides with itself instead of duplicating.

set -euo pipefail

SRC="${1:-$HOME/Downloads}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

command -v psql >/dev/null || {
  echo "✗ psql not found."
  echo "  Install Postgres.app from postgresapp.com, then:"
  echo "    echo 'export PATH=\"/Applications/Postgres.app/Contents/Versions/latest/bin:\$PATH\"' >> ~/.bash_profile"
  echo "    source ~/.bash_profile"
  exit 1
}
command -v node >/dev/null || { echo "✗ node not found."; exit 1; }

# ── Work out how to connect ─────────────────────────────────────────────────
if [ -n "${DATABASE_URL:-}" ]; then
  echo "Using DATABASE_URL from the environment."
else
  DEFAULT_REF="wilueytnkfjpovhpghbw"
  read -r -p "Supabase project ref [$DEFAULT_REF]: " REF
  REF="${REF:-$DEFAULT_REF}"

  # -s: not echoed to the screen. The password never appears on screen, in
  # ~/.bash_history, or in `ps` output the way a command-line argument would.
  read -r -s -p "Supabase database password: " PW
  echo ""

  [ -z "$PW" ] && { echo "✗ No password entered."; exit 1; }

  # Percent-encode the characters that would otherwise break a URI. Done here so
  # the password can contain anything and still work.
  enc() {
    local s="$1" out="" c
    for (( i=0; i<${#s}; i++ )); do
      c="${s:i:1}"
      case "$c" in
        [a-zA-Z0-9._~-]) out+="$c" ;;
        *) out+=$(printf '%%%02X' "'$c") ;;
      esac
    done
    printf '%s' "$out"
  }
  PWE="$(enc "$PW")"

  # Ordered by likelihood of working, not by preference. The session pooler is
  # IPv4 and is what Supabase now steers everyone toward; the direct host is
  # tried second because it is IPv6-only without the paid add-on.
  #
  # Transaction pooler (port 6543) is deliberately NOT in this list: it returns
  # your connection to the pool between statements, which breaks \copy.
  CANDIDATES=(
    "postgresql://postgres.$REF:$PWE@aws-0-us-east-1.pooler.supabase.com:5432/postgres|session pooler (us-east-1)"
    "postgresql://postgres.$REF:$PWE@aws-1-us-east-1.pooler.supabase.com:5432/postgres|session pooler (us-east-1, alt)"
    "postgresql://postgres:$PWE@db.$REF.supabase.co:5432/postgres|direct connection"
  )

  DATABASE_URL=""
  for entry in "${CANDIDATES[@]}"; do
    url="${entry%%|*}"; label="${entry##*|}"
    printf "  trying %-34s " "$label..."
    if timeout 25 psql "$url" -tAc "select 1" >/dev/null 2>&1; then
      echo "OK"
      DATABASE_URL="$url"
      break
    fi
    echo "no"
  done

  if [ -z "$DATABASE_URL" ]; then
    echo ""
    echo "✗ Could not connect on any endpoint."
    echo "  Every candidate was refused or rejected the password, which almost"
    echo "  always means the password is wrong rather than the host."
    echo "  Supabase -> Connect -> Reset database password, then run this again."
    echo "  If it still fails, check Connect -> Session pooler for the exact host;"
    echo "  the region prefix may differ from the ones tried above."
    exit 1
  fi
  export DATABASE_URL
  echo ""
fi

PARCEL_COLS="co_no,parcel_id,asmnt_yr,dor_uc,jv,av_sd,av_nsd,tv_sd,tv_nsd,jv_hmstd,av_hmstd,jv_non_hmstd_resd,av_non_hmstd_resd,lnd_val,tot_lvg_area,act_yr_blt,eff_yr_blt,no_buldng,no_res_unts,lnd_sqfoot,nbrhd_cd,mkt_ar,census_bk,phy_addr1,phy_addr2,phy_city,phy_zipcd,own_name,exmpt_01,exmpt_02,ass_dif_trns,sale_prc1,sale_yr1,sale_mo1,qual_cd1,vi_cd1"
SALE_COLS="co_no,parcel_id,asmnt_yr,sale_id_cd,qual_cd,is_qualified,vi_cd,sale_date,sale_prc,dor_uc,nbrhd_cd,mkt_ar,census_bk,multi_par_sal"

echo "Applying schema (tables only — indexes are built after the load)..."
psql "$DATABASE_URL" -q -f "$REPO/scripts/dor/schema.sql"

shopt -s nullglob
found=0
for zip in "$SRC"/*NAL*.zip "$SRC"/*SDF*.zip; do
  found=1
  name="$(basename "$zip")"
  case "$name" in *SDF*) kind=sdf; table=sales; cols="$SALE_COLS";;
                  *)      kind=nal; table=parcels; cols="$PARCEL_COLS";; esac

  rm -rf "$TMP/x"; mkdir -p "$TMP/x"
  unzip -o -q "$zip" -d "$TMP/x"
  csv="$(find "$TMP/x" -iname '*.csv' | head -1)"
  [ -z "$csv" ] && { echo "  ! no CSV inside $name, skipping"; continue; }

  echo ""
  echo "── $name"
  # PIPESTATUS, not the pipeline's exit code.
  #
  # This previously read `node ... | grep ... || true`, which discarded the
  # loader's exit status entirely — so its layout-mismatch guard (>5% unusable
  # rows, or >1% ragged) could fire and the script would carry on to the next
  # county reporting success. A safety check whose failure is swallowed is worse
  # than no check, because it reads as reassurance.
  set +e
  node "$REPO/scripts/dor/load.mjs" --kind "$kind" --in "$csv" --out "$TMP/out.csv" 2>&1 \
    | grep -E '^\s+(read|written|skipped|excluded|filtered|ragged)'
  loader_status=${PIPESTATUS[0]}
  set -e
  if [ "$loader_status" -ne 0 ]; then
    echo ""
    echo "✗ $name failed its integrity check — NOT loaded."
    echo "  Re-run the loader on this file alone to see the reason."
    echo "  Continuing with the remaining counties."
    continue
  fi

  # Staging table + upsert rather than a bare \copy: a direct copy aborts the
  # whole county the moment it meets a row already present, which makes re-runs
  # and partial loads impossible to recover from.
  # NOTE THE EXPLICIT TRANSACTION, AND THE ABSENCE OF `on commit drop`.
  #
  # psql runs each statement in its own implicit transaction unless you open one.
  # So `create temp table stage ... ON COMMIT DROP` committed immediately and the
  # ON COMMIT clause fired straight away — the staging table was dropped before
  # \copy could reach it, and every county loaded zero rows while reporting a
  # successful parse. Silent, and it would have looked like the parser's fault.
  #
  # A plain temp table lives for the psql session, which is exactly this one
  # county. BEGIN/COMMIT then makes the county atomic: a failure part-way leaves
  # the table untouched rather than half-loaded.
  psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 <<SQL
begin;
create temp table stage (like $table including defaults);
\\copy stage ($cols) from '$TMP/out.csv' with (format csv, header true)
insert into $table ($cols) select $cols from stage on conflict do nothing;
commit;
SQL

  rows=$(psql "$DATABASE_URL" -tAc "select count(*) from $table")
  echo "   $table now holds $rows rows"
done

[ "$found" = 0 ] && { echo "✗ No *NAL*.zip or *SDF*.zip files found in $SRC"; exit 1; }

# INDEXES LAST. Building each once over a finished table costs a fraction of the
# disk and time that maintaining six of them across five million inserts does.
# The first full run filled a 2 GB Supabase volume partway through Miami-Dade
# doing it the other way round.
echo ""
echo "Building indexes (several minutes — the trigram index is the slow one)..."
psql "$DATABASE_URL" -q -f "$REPO/scripts/dor/indexes.sql"

echo ""
echo "=== Loaded ==="
psql "$DATABASE_URL" -c "select co_no, count(*) as parcels, min(asmnt_yr) as roll_year from parcels group by co_no order by co_no;"
psql "$DATABASE_URL" -c "select pg_size_pretty(pg_database_size(current_database())) as database_size;"
