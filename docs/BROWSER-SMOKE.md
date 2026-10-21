# Local browser smoke

This optional suite tests the built application through its UI. It changes no production code, GitHub settings, credentials, workflow permissions or public data. It is prepared for a future CI decision; the current Pages workflow is unchanged.

## Install and run

Requirements: Node 22+, npm, and an existing Chrome installation. This checkout pins `@playwright/test`, `playwright` and `playwright-core` to 1.64.1 through `package-lock.json`. There are three development packages and no application runtime dependencies.

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run test:browser
```

`npm ci --ignore-scripts` installs the lockfile and does not run install hooks. The commands do not download browser binaries or system packages. `test:browser` builds `dist`, starts its own static server on `127.0.0.1:4832`, runs eight tests in headless Chrome, and stops its server. It does not connect to the public demo or a user's Chrome profile. Each test gets a new isolated browser context and empty storage. No saved authentication, persistent browser profile or app-state injection is used.

The port must be free. The runner refuses to reuse an existing server rather than test an unknown app. To use another port in PowerShell:

```powershell
$env:QUOTELENS_SMOKE_PORT='4833'
npm run test:browser
Remove-Item Env:QUOTELENS_SMOKE_PORT
```

`QUOTELENS_SMOKE_BROWSER=msedge` uses an already installed Edge; `chromium` uses an already provisioned Playwright Chromium. These options never install a browser. Chrome is the default and the locally verified target. If a browser is missing, the run fails with the Playwright launch diagnostic; there is no automatic fallback/download. Package versions are locked; an installed Chrome channel can update independently, so record its version with results.

For an independently provisioned CI runner with Chrome, the same commands apply. Set `CI=true` in that runner's normal environment. There is no CI YAML change in this candidate, no secrets, and no new access. Do not add browser-install steps or publish artifacts without considering that separate environment's constraints.

## Assertions and scope

The tests deliberately use visible controls and real file events. Expected monetary values are literal independently established examples, not recalculated by importing the production engine or IO code.

| Scenario | Assertions |
| --- | --- |
| Clean context / demo | RU default, EN switch, River 1,658, Atlas 2,060, delta 402; partial Quick excluded |
| Exact explanations | North 360 / Box 390: goods −50, delivery +80, total +30; rounded fees +3.33 and discount effect +20.01 give +53.34; explicit tie and one/zero-complete states |
| Eligibility edits | Unknown delivery → explicit 0 wins at 268 → clearing excludes again; incompatible units reset quality confirmation and prevent ranking |
| Normalized preview / save | 100 per pack of 12 gives 2 packs, 24 units, exact 200; keyboard per-unit gives 2,400; blank/negative invalid, zero valid; decimal comma, half-up rounding, MOQ and reload preserve original inputs |
| JSON export/import | Actual backup and calculation downloads, exact input equality, integer money, unknown vs zero, Unicode/quotes/commas; file upload into a new basket and reload restore the baseline |
| CSV export/import | Actual input/results downloads; 22/17 headers, expected rows/amounts, escaped quotes/commas/Unicode, apostrophe formula guard; file import clears trust; manual edit/reconfirmation changes minimum to 300; reload and undo |
| Reference basket | Required 20: A 380,000, B 390,000, C 388,000; C buys 24 with surplus 4; insufficient stock D excluded |
| 390 px keyboard | RU/EN and no horizontal overflow; native basis Arrow/Tab; repeated actual focused Enter adds suppliers 2→3→4 and items 1→2→3; removals retain usable focus |

The synthetic fixture has a distinct `Isolated browser smoke v1` title. Its spreadsheet-formula text uses `example.invalid` only; it is never executed. All app network requests outside the owned loopback origin are aborted and fail the test. Uncaught page errors and browser console errors/warnings also fail the test.

The JSON backup test is a new local test with a fresh browser context. It neither retries nor establishes the outcome of any old public-session download. A historical uncertain public download remains a separate observation.

## Reports and failures

There are no automatic retries or sleep-based synchronization. Locators and assertions wait for specific states. Tests have 30-second timeouts and a three-minute suite limit. An assertion failure names the expected state, shows the locator/value mismatch, and retains a screenshot plus trace. Server/browser startup failures are failures, never skipped successes.

Ignored outputs are under `browser-artifacts/`:

- `results.json`: machine-readable statuses and assertion errors.
- `report/`: local HTML report, opened only when requested.
- `runs/`: actual downloaded files, checkpoint screenshots and failure traces/screenshots.

To view the HTML report yourself, use `npx --no-install playwright show-report browser-artifacts/report`. The runner starts fresh artifact output on another run; preserve any evidence you need first. Only synthetic test data should be attached. These generated files are not in commits or `dist`.

## Limits

Local verification on 2026-10-21: Node 24.15.0, npm 11.12.1, Windows, installed Chrome 155.0.8059.85. A clean offline `npm ci --ignore-scripts` from the populated package cache installed the three locked packages. Syntax checks and 64/64 Node tests passed; the final browser run passed 8/8 in 10.3 seconds, with zero skipped/flaky tests. `npm audit` reported zero known vulnerabilities for this dependency set at that check. Installed npm tooling occupied about 18.7 MB; no browser binary was installed.

This smoke suite complements the 64 Node tests. It does not replace exhaustive decimal-boundary, malformed/oversized input, quota/corrupt-storage or concurrency tests already covered at adapter/unit level. It is not real-device, screen-reader, Firefox/WebKit, spreadsheet-application or operating-system matrix certification. The local result verifies Chrome on Windows; Linux CI and other channels remain unverified until executed there. Viewport emulation checks layout and keyboard, not a touch keyboard or physical phone.

Official references: [Playwright configuration](https://playwright.dev/docs/test-configuration), [installed browser channels](https://playwright.dev/docs/browsers), [download events and saving files](https://playwright.dev/docs/downloads).
