# Loading the Texas parcels into Supabase

Step by step. Nothing here needs a secret to pass through chat — you copy your
connection string from Supabase's own page straight into your terminal.

**Order matters and is not negotiable:** schema → data → indexes. Loading into an
indexed table tripled write-ahead-log churn on the Florida side and filled the
volume mid-county. See the header of `indexes.sql`.

---

## What you are loading

| County | cad_id | Rows |
|---|---|---|
| Nueces | 178 | 115,001 |
| Jefferson | 123 | 80,553 |
| Kaufman | 129 | 65,012 |
| Taylor | 221 | 45,638 |
| Wichita | 243 | 42,249 |
| **Total** | | **348,453** |

About 60 MB of CSV. This is public appraisal-roll data — no personal data beyond
what the districts publish themselves, and no secrets.

---

## Step 1 — install the Postgres driver

`psql` is not on this Mac and neither is Homebrew, so the load runs through Node
instead. `--no-save` is deliberate: it keeps these out of `package.json` so
Vercel never installs them and the production build is unchanged.

```
cd ~/Developer/Tax-Appeal-
npm install pg pg-copy-streams --no-save
```

## Step 2 — get your connection string

1. Go to **supabase.com** and open your project.
2. Click **Connect** at the top of the page.
3. Choose the **Session pooler** tab — NOT Transaction pooler. `COPY` needs a
   session and the transaction pooler will drop you mid-load.
4. Use Supabase's own **copy button**. Do not select the text by hand, and do not
   use `pbcopy` — it truncated a 64-character key to 15 on this Mac on 2 August.
5. Supabase shows the password as `[YOUR-PASSWORD]`. Replace that placeholder
   with your actual database password. The script checks for this and refuses if
   the placeholder is still there.

## Step 3 — nothing. There is no step 3.

The earlier version of this runbook told you to do:

```
read -rs PGURL
export PGURL
```

**Do not do that.** Pasted as a block, the shell hands the second line to `read`
as its input, so `PGURL` becomes the literal string `export PGURL` and the export
never runs. `START_HERE` records this trap costing an hour once already, and it
caught us again anyway — a warning in a document does not stop two lines being
pasted together.

The script now just asks, and hides your typing. Skip to step 4.

## Step 4 — create the tables

```
cd ~/Developer/Tax-Appeal-
node scripts/tx/push.mjs --schema
```

**Success:** several `CREATE TABLE` lines and no errors.
**If it says a table already exists** — fine, the file is `create table if not
exists` throughout and re-running it is safe.

## Step 5 — load the five counties

Run this as one block. Each county takes a few seconds.

```
node scripts/tx/push.mjs
```

It clears each district before loading it, so re-running is safe and idempotent —
the primary key is `(cad_id, account_number, tax_year)`.

**Success:** five `COPY nnnnn` lines, summing to 348,453.

**If a county fails partway**, the whole `\copy` for that county rolls back — it
is one transaction — so you can fix and re-run just that file. To re-run a county
that already loaded, clear it first:

```
node scripts/tx/push.mjs --county Nueces
```

## Step 6 — build the indexes

Only now.

```
node scripts/tx/push.mjs --indexes
```

**Success:** `CREATE INDEX` × 7 and one `ANALYZE`. This takes a minute or two.

## Step 7 — verify

```
psql "$PGURL" -c "
select cad_id, count(*) rows,
       count(*) filter (where homestead_cap_loss > 0 or nhs_cap_loss > 0) capped,
       round(100.0 * count(*) filter (where homestead_cap_loss > 0 or nhs_cap_loss > 0) / count(*), 1) pct_capped,
       count(distinct neighborhood_code) hoods,
       round(avg(living_area)) avg_sqft
from tx_parcels group by cad_id order by rows desc"
```

**Expected:**

```
 cad_id |  rows  | capped | pct_capped | hoods | avg_sqft
--------+--------+--------+------------+-------+----------
    178 | 115001 |  28019 |       24.4 |   792 |     1600ish
    123 |  80553 |  25368 |       31.5 |       |
    129 |  65012 |   9670 |       14.9 |       |
    221 |  45638 |   8452 |       18.5 |       |
    243 |  42249 |   5586 |       13.2 |       |
```

The `pct_capped` column is the one to check — those five numbers came out of the
loader independently, so if the database agrees, the load is faithful.

## That's it

`--verify` already runs the comp query, and there is no secret left in your shell
to clear because the script asked for it rather than making you export it.

---

## Notes

- `tx-data/` is gitignored. The CSVs are re-creatable from `scripts/tx/load.mjs`
  at any time and one export is 161 MB, so they do not belong in git.
- Re-loading a county is safe and idempotent: `push.mjs` clears that `cad_id`
  before copying it back in.
- `pg` and `pg-copy-streams` were installed with `--no-save`, so `npm ci` will
  remove them. If the driver goes missing, the script tells you the exact command.
- Roll year is in the primary key deliberately. A 2026 roll is a separate legal
  snapshot, not a correction of 2025, and the § 23.23 cap ceiling is computed
  from the prior year's appraised value — so verifying a district applied the cap
  correctly requires holding both years.
