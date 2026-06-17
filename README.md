# Jamie Sync — Obsidian plugin (beta)

Syncs your Jamie meeting **notes** and **transcripts** into an Obsidian vault by polling Jamie's public API and writing Markdown files — continuous, configurable folder-sync driven by an API key.

## What it does

- Settings tab: API key + base URL, **destination mode**, notes/transcripts/daily-note folders, toggles, sync interval, re-sync controls, **Test connection**.
- Commands: **Jamie: Sync now**, **Jamie: Reset sync state**. Auto-syncs on Obsidian load and on a configurable interval.
- Polls `meetings.list` + `meetings.get`, renders each meeting to a Markdown note (frontmatter, short-summary callout, action-item checkboxes) plus a linked transcript file, with note↔transcript wikilinks.
- **Three destination modes** (matching Granola): a dedicated folder, per-day folders, or appending each meeting as a block into the day's **daily note**.
- **Idempotent + edits:** re-running never duplicates (keyed on the Jamie meeting id; daily-note blocks are replaced in place). With *re-sync edited notes* on, meetings changed in Jamie within the recent window are detected via a content hash and rewritten.

**Not yet implemented:** "private notes at top" (Jamie has no equivalent — approximated with the short-summary callout), conflict handling for locally-edited files, and an instant webhook→synced-folder push path.

## Tests

```bash
pnpm install
pnpm test          # vitest run
pnpm run typecheck
```

Vitest unit tests (no live API key needed) cover the Markdown rendering (`src/render/*.test.ts`) and the sync engine (`src/sync/*.test.ts`) against an in-memory filesystem — folder / per-day / daily-note destinations, idempotency, edited-note re-sync, locked-meeting and auth-error handling.

## Build and run inside Obsidian (live demo)

Requires a Jamie account on a paid plan and a personal API key (`jk_…`, from Jamie → Settings → Developers).

```bash
pnpm install
pnpm run build          # produces main.js
```

Then side-load it:

1. Copy `manifest.json` and `main.js` into `<your-vault>/.obsidian/plugins/jamie-sync/`.
2. Enable **Jamie Sync** in Obsidian → Settings → Community plugins.
3. Open the plugin settings, paste your API key, click **Test connection**.
4. Run the **Jamie: Sync now** command. Notes and transcripts appear under the configured folders.

## Install via BRAT (beta channel)

[BRAT](https://github.com/TfTHacker/obsidian42-brat) installs and auto-updates the plugin from a GitHub repo, with no community-store review.

**Maintainer — one-time setup:**
1. Host this folder as its own **public** GitHub repo.
2. Cut a GitHub release whose tag exactly matches `manifest.json`'s `version` (no `v` prefix, e.g. `0.1.0`), with `manifest.json`, `main.js`, `versions.json` attached. The included `.github/workflows/release.yml` does this automatically on every tag push.

**Users — one-time install:**
1. Install the **BRAT** plugin from the community store and enable it.
2. Command palette → **BRAT: Add a beta plugin for testing** → paste the repo URL.
3. Enable **Jamie Sync** under Community plugins, then configure the API key.

New releases then auto-update.

## Network use

This plugin sends authenticated HTTPS requests to the configured Jamie API base URL (default `https://beta-api.meetjamie.ai`) to read your meetings, and stores your API key in the plugin's `data.json` inside the vault. It makes no other network calls. (This must be disclosed in a community-store submission.)

## Layout

- `src/api/` — typed client for Jamie's tRPC-over-HTTP public API (handles the `input=`/`result.data.json` envelope, auth, 401/429).
- `src/render/` — pure meeting → Markdown rendering (no Obsidian dependency).
- `src/sync/` — the sync engine; writes through a small `FileWriter` interface so it runs in both Obsidian and the tests.
- `src/settings/` — settings model + settings tab.
- `src/main.ts` — Obsidian plugin entry (commands, interval, vault-backed `FileWriter`).
- `src/**/*.test.ts` — Vitest unit tests for the pure render + sync logic.
