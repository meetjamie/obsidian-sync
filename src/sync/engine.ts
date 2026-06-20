import { JamieAuthError, type JamieClient, JamieRateLimitError } from '../api/client'
import type { MeetingDetail, MeetingListResult } from '../api/types'
import {
  appendMeetingSection,
  buildBaseName,
  contentHash,
  formatDay,
  meetingTitle,
  type RenderOptions,
  renderNoteFile,
  renderSection,
  renderTranscript,
  stripLegacyMeetingMarkers
} from '../render/note-renderer'
import type { JamieSyncSettings } from '../settings/model'

export interface SyncState {
  // meetingId -> where it landed + a content hash, the durable keys for idempotency.
  syncedMeetings: Record<
    string,
    { notePath: string; transcriptPath?: string; contentHash: string; lastSyncedAt: string }
  >
  lastSyncStartedAt?: string
}

// The engine writes through this interface, not the Obsidian vault directly, so it
// runs unchanged against an in-memory filesystem in the offline demo. `read` returns
// null when the file is absent (needed for idempotent daily-note appends).
export interface FileWriter {
  read(path: string): Promise<string | null>
  write(path: string, content: string): Promise<void>
}

export interface SyncDeps {
  client: Pick<JamieClient, 'listMeetings' | 'getMeeting'>
  writer: FileWriter
  settings: JamieSyncSettings
  state: SyncState
  log: (message: string) => void
  now: () => Date
  // Injected so the pure engine holds no timer; Obsidian passes a window.setTimeout-based wait.
  wait: (ms: number) => Promise<void>
}

export interface SyncResult {
  scanned: number
  written: number
  ok: boolean
}

const renderOptionsFor = (
  settings: JamieSyncSettings,
  transcriptFileName: string
): RenderOptions => ({
  includeShortSummaryCallout: settings.includeShortSummaryCallout,
  includeTasks: settings.includeTasks,
  includeTranscriptLink: settings.includeTranscript,
  transcriptFileName,
  frontmatterParticipants: settings.frontmatterParticipants,
  frontmatterTags: settings.frontmatterTags
})

// Writes a meeting to the vault per the configured destination mode and returns the
// paths recorded in sync state. Daily-note mode appends a `## <title>` section to the
// day's note (deduped by heading); the other modes own a standalone file.
const writeMeeting = async (
  detail: MeetingDetail,
  settings: JamieSyncSettings,
  writer: FileWriter
) => {
  const base = buildBaseName(detail)
  const day = formatDay(detail.startTime)
  const transcriptBase = `${base} (transcript)`
  const opts = renderOptionsFor(settings, transcriptBase)

  // In per-day mode each file nests under a YYYY-MM-DD subfolder; otherwise it's flat.
  const folderFor = (baseFolder: string) =>
    settings.destinationMode === 'daily-folder' ? `${baseFolder}/${day}` : baseFolder

  let notePath: string
  let noteLinkTarget: string

  if (settings.destinationMode === 'daily-note') {
    notePath = `${settings.dailyNoteFolder}/${day}.md`
    const original = (await writer.read(notePath)) ?? ''
    // Strip any legacy `%%` markers, then append this meeting's section (deduped by heading).
    const next = appendMeetingSection(
      stripLegacyMeetingMarkers(original),
      renderSection(detail, opts)
    )
    if (next !== original) await writer.write(notePath, next)
    // Transcript links back to the meeting's heading inside the daily note.
    noteLinkTarget = `${day}#${meetingTitle(detail)}`
  } else {
    notePath = `${folderFor(settings.notesFolder)}/${base}.md`
    await writer.write(notePath, renderNoteFile(detail, opts))
    noteLinkTarget = base
  }

  let transcriptPath: string | undefined
  if (settings.includeTranscript) {
    transcriptPath = `${folderFor(settings.transcriptsFolder)}/${transcriptBase}.md`
    await writer.write(transcriptPath, renderTranscript(detail, noteLinkTarget))
  }

  return { notePath, transcriptPath }
}

export const runSync = async (deps: SyncDeps): Promise<SyncResult> => {
  const { client, writer, settings, state, log, now, wait } = deps
  const start = now()
  const backfillCutoff = new Date(start.getTime() - settings.backfillLookbackDays * 86_400_000)
  const recentCutoffMs = start.getTime() - settings.recentWindowDays * 86_400_000

  let cursor: string | undefined
  let scanned = 0
  let written = 0

  // Walk pages newest-first until we run out or pass the lookback cutoff.
  for (;;) {
    let page: MeetingListResult
    try {
      page = await client.listMeetings({
        limit: 50,
        cursor,
        startDate: backfillCutoff.toISOString()
      })
    } catch (error) {
      if (error instanceof JamieAuthError) {
        log('Invalid API key — check the plugin settings.')
        return { scanned, written, ok: false }
      }
      if (error instanceof JamieRateLimitError) {
        await wait(Math.max(0, error.resetAtMs - Date.now()))
        continue
      }
      log(`List failed: ${(error as Error).message}`)
      return { scanned, written, ok: false }
    }

    for (const summary of page.meetings) {
      scanned++
      const existing = state.syncedMeetings[summary.id]

      // Already synced: only re-fetch if re-sync is on and it's within the recent
      // window — otherwise skip without spending a `getMeeting` call.
      if (existing) {
        const recent = new Date(summary.startTime).getTime() >= recentCutoffMs
        if (!settings.resyncEditedNotes || !recent) continue
      }

      let detail: MeetingDetail
      try {
        detail = await client.getMeeting(summary.id)
      } catch (error) {
        if (error instanceof JamieRateLimitError) {
          await wait(Math.max(0, error.resetAtMs - Date.now()))
          continue
        }
        log(`Skipped ${summary.id}: ${(error as Error).message}`)
        continue
      }

      if (detail.locked) {
        log(`Skipped locked meeting ${summary.id}`)
        continue
      }

      const hash = contentHash(detail)
      if (existing && existing.contentHash === hash) continue // unchanged since last sync

      const { notePath, transcriptPath } = await writeMeeting(detail, settings, writer)
      state.syncedMeetings[detail.id] = {
        notePath,
        transcriptPath,
        contentHash: hash,
        lastSyncedAt: start.toISOString()
      }
      written++
    }

    if (!page.nextCursor) break
    cursor = page.nextCursor
  }

  state.lastSyncStartedAt = start.toISOString()
  log(`Sync complete — ${written} note(s) written/updated, ${scanned} scanned.`)
  return { scanned, written, ok: true }
}
