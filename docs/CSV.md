# CSV input schema

Download `examples/template.csv` or export the current basket in the app. UTF-8; comma delimiter; quote fields containing commas, quotes or newlines. Escape embedded quotes by doubling them. A decimal comma must be inside a quoted cell (for example `"12,50"`). IDs use A–Z/a–z/0–9/underscore/hyphen, 1–50 characters.

| Column | Meaning |
|---|---|
| comparison_currency | RUB, USD, EUR, GBP. Same on every row. |
| item_id | Stable ID, repeated for that item across suppliers. |
| item_name | Item name, up to 150 characters. |
| item_spec | Required specification/model/quality, up to 500 characters. |
| required_qty | Integer 1–1,000,000 in the required unit. |
| required_unit | `pcs`, `pair`, `set`; exact matching only. |
| supplier_id | Stable supplier ID. 2–4 distinct suppliers. |
| supplier_name | Name, up to 150 characters. |
| supplier_currency | Quote currency; mismatch with comparison currency excludes quote. |
| price | Price ≥ 0, up to 4 decimals, maximum 100,000,000. |
| price_basis | `unit` (one item unit) or `pack` (one full pack). |
| pack_qty | Integer units in a pack, 1–1,000,000. |
| moq_units | Minimum order **in item units**, integer 0–1,000,000. 0 = none. |
| available_units | Optional known available item units. Blank = not verified. |
| offer_unit | Offered unit: must exactly match required_unit. |
| offer_spec | Offered specification; manually confirm equivalence after import. |
| shipping | Delivery for the entire order, ≥ 0, up to 2 decimals. Blank = unknown. |
| fees | Sum of **all** other mandatory charges, ≥ 0, up to 2 decimals. Blank = unknown. |
| discount_pct | 0–100% on goods only, up to 2 decimals; explicit 0 = no discount. |
| min_goods | Minimum goods value **before discount**, up to 2 decimals; explicit 0 = none. |
| lead_time | Optional text, up to 150 characters. |
| terms | Optional conditions / fee breakdown, up to 500 characters. |

Repeat item data identically across suppliers and supplier terms identically across that supplier's rows. Include the complete item × supplier matrix, with at most 48 data rows. Missing prices may remain blank for draft quotes, which will be excluded. The importer rejects missing rows, duplicate pairs, inconsistent repeated data, bad headers, unknown units/currencies and unsupported schema. It does not silently merge or partially apply rows. Numeric drafts such as negatives stay visible but are excluded from comparisons.

`shipping`, `fees`, `discount_pct` and `min_goods` cannot be silently blank when comparing. Enter 0 explicitly where applicable. CSV cannot carry approval of quality/cost completeness: confirm those again in the app. JSON backup does preserve those flags.

Export prefixes spreadsheet formula-like cells with `'`; formula strings never execute inside QuoteLens. Use JSON for an exact text roundtrip. `quotelens-results.csv` is a report, not an input template.
