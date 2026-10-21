# Checks and practical limits

Run on Node.js 22+ with no npm dependencies:

```sh
npm run check
npm test
npm run build
```

The 52 tests cover exact decimal parsing and rounding, unit/pack pricing, whole packs, MOQ in item units, surplus, minimum order, stock, zero/empty/negative values, unknown costs, manual comparability, mismatched currency/units, ties, CSV/JSON roundtrips, malformed/oversized input, CSV formula escaping, storage-adapter failures, clean build output, and keyboard focus after add/remove/navigation actions.

Money is tested as integer minor units, including the 20-unit example A 380,000 / B 390,000 / C 388,000 with 4 surplus units, with insufficient-stock D excluded.

Browser scenarios have been checked in Chromium on desktop and at 390 px: default demo, RU/EN, manual edits, unknown → zero → unknown delivery, CSV preview/apply/edit, JSON restore, exports, ties, incompatible units/currencies, reload, new basket/undo and repeated keyboard Enter/Tab through supplier/item limits. Example screenshots contain fictional data only.

CI runs syntax checks, all tests and a clean static build before Pages deployment. Only `dist/` is deployed. Its six application assets are listed in a SHA-256 manifest; source, tests and documentation are not deployed as app assets.

This is not cross-browser, screen-reader, real-device or spreadsheet-application certification. Quota/corrupt-storage behavior has adapter tests; multi-tab conflict detection is not a transactional lock. Product equivalence and completeness of fees still require human review. See the README for supported scope and assumptions.
