# Local data durability

QuoteLens coordinates editing tabs with the origin-scoped Web Lock `quotelens.writer.v1`. A tab starts read only while access is checked. The lock is requested without a waiting queue (`ifAvailable`); one tab holds it for its editing session. Every primary/undo persistence operation checks ownership. Read-only tabs cannot edit/import/replace the basket or write an undo checkpoint, but can inspect and export their snapshot.

Close the editing tab, then choose **Try editing here** in the other tab. A newly granted owner first reads the current saved basket and undo snapshot. It never automatically persists its old in-memory view. The lock is released on page hide; a restored page returns read only and must check again.

If Web Locks is absent or denied, the safe default is read only. **Work without autosave** explicitly enables an in-memory session. That session never writes either localStorage key. Import/edit/undo and JSON export remain available, with an unsaved warning. Use a compatible browser/origin for coordinated autosave; there is no localStorage lease or silent check-then-set fallback.

## Failed writes and conflicts

An edit stays dirty until the current version is successfully saved by the owner. If saving the undo checkpoint fails, the old primary record is preserved and the new version stays in memory. **Retry saving** retries the pending undo snapshot and current basket. Storage denial/corrupt records are not overwritten on startup; explicit new/import recovery retains the existing deliberate replacement behavior.

An external primary-storage change stops writing and makes the current editing version dirty/recoverable. Export the current JSON before proceeding. Loading a saved version over unsaved memory requires a separate explicit confirmation; cancelling keeps that memory version. Read-only views may be stale until the user acquires access and loads the latest saved state.

Downloading hands data to the browser; it does not prove a completed durable backup and does not clear dirty. Verify the actual saved JSON file. Unknown values, explicit zeros and all existing backup v1 fields are unchanged.

Dirty work requests the browser's normal `beforeunload` warning via `preventDefault`/`returnValue`. A warning is **not guaranteed**, particularly on mobile, process termination, power loss, or without browser user activation. The persistent unsaved status and JSON export are the primary recovery instructions. No background unload write, cloud copy or account is added.

The Web Lock coordinates cooperating current QuoteLens tabs in the same origin/storage partition. Old cached versions or other scripts can ignore that protocol; storage-event conflict detection stops the current app and preserves its in-memory view, but is not a transaction against unrelated writers. This is not a universal crash-proof persistence guarantee.

## Verification

The two audit scenarios failed before this change: delayed events allowed B to overwrite A, and quota-failed work did not request an unload warning. They pass after the change, with regressions for both persistence keys, takeover freshness/no stale write, rejected/missing locks, explicit memory mode, checkpoint failure, external conflicts, dirty export, retry success and corrupt/denied storage.

Node tests: **72/72**. Local browser tests: **11/11** on Windows, existing Chrome155.0.8059.85, Node24.15.0. Three new isolated scenarios verify real Web Locks/two-page scheduling; no-lock memory fallback; and synthetic quota failure with actual headless Chrome beforeunload dialog/cancel, real backup download, then successful retry/no prompt. The existing eight smoke scenarios still pass, including 390px keyboard and import/export/reload. The guard is not claimed to be a headed OS-modal or physical-mobile test.

The completed smoke-suite branch and public checkout are unchanged. No workflow, permission, dependency, backup schema or arithmetic change was needed. The local static allowlist/manifest now includes the eighth asset `src/writer.js`.
