# Jamie Sync — Obsidian plugin

Syncs your Jamie meeting **notes** and **transcripts** into an Obsidian vault by polling Jamie's public API and writing Markdown files — continuous, configurable folder-sync driven by an API key.

## What it does

- Settings tab: API key, **destination mode**, notes/transcripts/daily-note folders, toggles, sync interval, re-sync controls, **Test connection**.
- Commands: **Jamie: Sync now**, **Jamie: Reset sync state**. Auto-syncs on Obsidian load and on a configurable interval.
- Polls `meetings.list` + `meetings.get`, renders each meeting to a Markdown note (frontmatter, short-summary callout, action-item checkboxes) plus a linked transcript file, with note↔transcript wikilinks.
- **Three destination modes:** a dedicated folder, per-day folders, or appending each meeting as a section into the day's **daily note**.
- **Idempotent + edits:** re-running never duplicates (keyed on the Jamie meeting id; daily-note entries are deduped by their `## <title>` heading). With *re-sync edited notes* on, meetings changed in Jamie within the recent window are detected via a content hash and rewritten in place in the folder and per-day modes, where each meeting owns its own file.

**Not yet implemented:** "private notes at top" (Jamie has no equivalent — approximated with the short-summary callout), conflict handling for locally-edited files, and an instant webhook→synced-folder push path.

## Install

In Obsidian, open **Settings → Community plugins → Browse**, search for **Jamie Sync**, then install and enable it (a Jamie account on a paid plan is required). Obsidian keeps it up to date automatically.

Then configure it:

1. Open the plugin's settings and paste your personal Jamie API key (`jk_…`, from Jamie → Settings → Developers).
2. Click **Test connection** to confirm the key works.
3. Run **Jamie: Sync now** — notes and transcripts appear under the configured folders. Auto-sync also runs on Obsidian launch and on the interval you set.

## Tests

```bash
pnpm install
pnpm test          # vitest run
pnpm run typecheck
```

Vitest unit tests (no live API key needed) cover the Markdown rendering (`src/render/*.test.ts`) and the sync engine (`src/sync/*.test.ts`) against an in-memory filesystem — folder / per-day / daily-note destinations, idempotency, edited-note re-sync, locked-meeting and auth-error handling.

## Build from source

For development, or to run an unreleased build:

```bash
pnpm install
pnpm run build          # produces main.js
```

Copy `manifest.json` and `main.js` into `<your-vault>/.obsidian/plugins/jamie-sync/`, enable **Jamie Sync** under **Settings → Community plugins**, then configure it as described in [Install](#install).

## Network use

This plugin sends authenticated HTTPS requests to the Jamie public API (`https://beta-api.meetjamie.ai`) to read your meetings, and stores your API key in the plugin's `data.json` inside the vault. It makes no other network calls. (This must be disclosed in a community-store submission.)

## Layout

- `src/api/` — typed client for Jamie's tRPC-over-HTTP public API (handles the `input=`/`result.data.json` envelope, auth, 401/429).
- `src/render/` — pure meeting → Markdown rendering (no Obsidian dependency).
- `src/sync/` — the sync engine; writes through a small `FileWriter` interface so it runs in both Obsidian and the tests.
- `src/settings/` — settings model + settings tab.
- `src/main.ts` — Obsidian plugin entry (commands, interval, vault-backed `FileWriter`).
- `src/**/*.test.ts` — Vitest unit tests for the pure render + sync logic.
