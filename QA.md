# Checks and practical limits

Run the core checks on Node.js 22+ with no runtime npm dependencies:

```sh
npm run check
npm test
npm run build
```

Optional reproducible browser smoke: `npm ci --ignore-scripts`, then `npm run test:browser` with Chrome already installed. The eleven scenarios use a fresh context for each test, a separate loopback server, synthetic fixtures, real file downloads/uploads, explicit assertions, and failure reports. The suite does not attach to an existing browser session. See [setup and coverage](docs/BROWSER-SMOKE.md). The existing GitHub workflow has not been changed to run it.

The 72 tests cover exact decimal parsing and rounding, unit/pack pricing, whole packs, MOQ in item units, surplus, minimum order, stock, zero/empty/negative values, unknown costs, manual comparability, mismatched currency/units, ties, CSV/JSON roundtrips, malformed/oversized input, CSV formula escaping, storage-adapter failures, clean build output, keyboard focus after add/remove/navigation actions, exact signed cost explanations, and normalized line previews.

Money is tested as integer minor units, including the 20-unit example A 380,000 / B 390,000 / C 388,000 with 4 surplus units, with insufficient-stock D excluded.

Browser scenarios have been checked in Chromium on desktop and at 390 px: default demo, RU/EN, manual edits, unknown → zero → unknown delivery, CSV preview/apply/edit, JSON restore, exports, ties, incompatible units/currencies, reload, new basket/undo and repeated keyboard Enter/Tab through supplier/item limits. Example screenshots contain fictional data only.

The explanation regression includes North 360 / Box 390: goods −50 + delivery 80 + fees 0 + discount effect 0 = total difference 30. Another case includes rounded discounts and fees, including negative discount contributions. Ties and one/zero complete quotes are separate states. Price previews test 100 per pack of 12 versus 100 per unit, updates to quantity/pack/MOQ/price, invalid inputs and indicative unit prices that never feed back into the exact line cost.

Browser checks for these changes include RU/EN, the 360/390 explanation, fees/discounts, ties, unknown → zero → unknown delivery, one/zero complete quotes, CSV preview/apply/undo, JSON restore, reload, and native keyboard unit/pack changes at 390 px. Price, pack, MOQ and required-quantity edits update the preview while preserving the active control.

CI runs syntax checks, all tests and a clean static build before Pages deployment. Only `dist/` is deployed. Its eight application assets are listed in a SHA-256 manifest; source, tests and documentation are not deployed as app assets.

This is not cross-browser, screen-reader, real-device or spreadsheet-application certification. Quota/corrupt-storage behavior has adapter tests; Web Locks coordinates one cooperating editing tab per origin; no-lock fallback writes nothing unless safe ownership is available (memory-only work never autosaves). External writers outside that protocol and process/mobile termination remain limits. See [data durability checks](docs/DATA-DURABILITY.md). Product equivalence and completeness of fees still require human review. See the README for supported scope and assumptions.

The data-durability audit regressions were reproduced before the fix (2 expected failures), then passed after it. Eight new Node cases cover single-writer/current+undo gates, fresh takeover, missing/rejected locks, dirty quota/export/retry, failed checkpoint, conflict recovery and corrupt/denied storage. Three new browser cases exercise real Web Locks, explicit no-lock memory mode and a native headless Chrome beforeunload dialog after synthetic quota failure; the existing eight browser scenarios still pass. No guarantee is made for mobile unload prompts.
