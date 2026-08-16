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

## Step 1 — get your connection string

1. Go to **supabase.com** and open your project.
2. Click **Connect** at the top of the page.
3. Choose the **Session pooler** tab (not Transaction pooler — `\copy` needs a
   session, and the transaction pooler will drop you mid-load).
4. Click the **copy button** on the connection string. Use Supabase's own copy
   button — do not select the text by hand, and do not use `pbcopy`, which
   truncated a 64-character key to 15 on this Mac on 2 August.

It looks like `postgresql://postgres.xxxx:[YOUR-PASSWORD]@aws-0-...pooler.supabase.com:5432/postgres`

## Step 2 — put it in your shell without it landing in scrollback

Type this line **on its own** and press Enter. Do not paste it together with the
next command — a block whose first line is `read` swallows the following line as
its input, which cost an hour on 1 August.

```
read -rs PGURL
```

The cursor will sit there with no prompt. Press **⌘V**, then Enter. Nothing
appears on screen — that is correct, it is hidden deliberately.

## Step 3 — check psql is installed

```
psql --version
```

**If that errors**, install it: `brew install libpq && brew link --force libpq`

## Step 4 — create the tables

```
cd ~/Developer/Tax-Appeal-
psql "$PGURL" -f scripts/tx/schema.sql
```

**Success:** several `CREATE TABLE` lines and no errors.
**If it says a table already exists** — fine, the file is `create table if not
exists` throughout and re-running it is safe.

## Step 5 — load the five counties

Run this as one block. Each county takes a few seconds.

```
for f in tx-data/*/*_parcels.csv; do
  echo "== $f"
  psql "$PGURL" -c "\copy tx_parcels (cad_id,account_number,tax_year,market_value,appraised_value,homestead_cap_loss,nhs_cap_loss,land_value,improvement_value,living_area,year_built,quality_class,land_size_acres,land_size_sqft,neighborhood_code,abs_subdv_cd,state_class_code,situs_street,situs_city,situs_zip,has_homestead,arb_protest_flag,source_format) from '$f' with (format csv, header true)"
done
```

**Success:** five `COPY nnnnn` lines, summing to 348,453.

**If a county fails partway**, the whole `\copy` for that county rolls back — it
is one transaction — so you can fix and re-run just that file. To re-run a county
that already loaded, clear it first:

```
psql "$PGURL" -c "delete from tx_parcels where cad_id = 178"
```

## Step 6 — build the indexes

Only now.

```
psql "$PGURL" -f scripts/tx/indexes.sql
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

## Step 8 — prove the comp query works

This is the whole point of the exercise: can we find comparable properties for a
real parcel using the district's own neighbourhood stratification?

```
psql "$PGURL" -c "
with subject as (
  select * from tx_parcels
  where cad_id = 178 and neighborhood_code = 'G100' and living_area between 1400 and 1600
  limit 1
)
select s.account_number as subject, s.living_area, s.appraised_value,
       count(c.*) as comps,
       round(percentile_cont(0.5) within group (order by c.appraised_value::numeric / nullif(c.living_area,0))) as median_ppsf,
       round(s.appraised_value::numeric / nullif(s.living_area,0)) as subject_ppsf
from subject s
join tx_parcels c
  on c.cad_id = s.cad_id
 and c.tax_year = s.tax_year
 and c.neighborhood_code = s.neighborhood_code
 and c.state_class_code = s.state_class_code
 and c.account_number <> s.account_number
 and c.living_area between s.living_area * 0.8 and s.living_area * 1.2
 and c.year_built between s.year_built - 10 and s.year_built + 10
group by s.account_number, s.living_area, s.appraised_value, s.year_built"
```

**Success:** one row with a comp count of at least 5 and two price-per-square-foot
figures. If the subject's `subject_ppsf` is above `median_ppsf`, that parcel has a
§ 41.43(b)(3) equal-and-uniform case — which is the entire product.

## Step 9 — clear the secret

```
unset PGURL
```

---

## Notes

- `tx-data/` is gitignored. The CSVs are re-creatable at any time from
  `scripts/tx/load.mjs`, and one export is 161 MB, so they do not belong in git.
- Re-loading a county is safe: the primary key is
  `(cad_id, account_number, tax_year)`, so delete that `cad_id` and `\copy` again.
- Roll year is in the key deliberately. A 2026 roll is a separate legal snapshot,
  not a correction of 2025, and the § 23.23 cap ceiling is computed from the
  prior year's appraised value — so verifying a district applied the cap
  correctly requires holding both years.
