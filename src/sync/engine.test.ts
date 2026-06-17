import { describe, expect, it } from 'vitest'
import { JamieAuthError, type JamieClient } from '../api/client'
import type { MeetingDetail } from '../api/types'
import { sampleMeeting } from '../render/sample'
import { DEFAULT_SETTINGS, type JamieSyncSettings } from '../settings/model'
import { type FileWriter, runSync, type SyncState } from './engine'

const at = (iso: string) => () => new Date(iso)
const noop = () => undefined

const makeFs = () => {
  const files = new Map<string, string>()
  const writer: FileWriter = {
    read: async (path) => files.get(path) ?? null,
    write: async (path, content) => {
      files.set(path, content)
    }
  }
  return { files, writer }
}

const makeClient = (
  meetings: MeetingDetail[]
): Pick<JamieClient, 'listMeetings' | 'getMeeting'> => ({
  listMeetings: async () => ({
    meetings: meetings.map((m) => ({
      id: m.id,
      title: m.title,
      startTime: m.startTime,
      endTime: m.endTime,
      calendarEventId: null,
      userId: m.user.id
    })),
    nextCursor: null
  }),
  getMeeting: async (id) => {
    const found = meetings.find((m) => m.id === id)
    if (!found) throw new Error('not found')
    return found
  }
})

const settings = (over: Partial<JamieSyncSettings> = {}): JamieSyncSettings => ({
  ...DEFAULT_SETTINGS,
  ...over
})

describe('runSync — folder mode', () => {
  it('writes a note + transcript and is idempotent on re-run', async () => {
    const { files, writer } = makeFs()
    const state: SyncState = { syncedMeetings: {} }
    const client = makeClient([sampleMeeting])
    const config = settings({ destinationMode: 'folder' })
    const first = await runSync({
      client,
      writer,
      settings: config,
      state,
      log: noop,
      now: at('2026-06-16T09:00:00Z')
    })
    const second = await runSync({
      client,
      writer,
      settings: config,
      state,
      log: noop,
      now: at('2026-06-16T09:30:00Z')
    })
    expect(first.written).toBe(1)
    expect(second.written).toBe(0)
    expect(files.size).toBe(2)
  })
})

describe('runSync — daily-note mode', () => {
  it('appends multiple meetings from one day into a single daily note', async () => {
    const second: MeetingDetail = {
      ...sampleMeeting,
      id: '999',
      title: 'Design Review',
      startTime: '2026-06-15T16:00:00.000Z'
    }
    const { files, writer } = makeFs()
    const state: SyncState = { syncedMeetings: {} }
    const client = makeClient([sampleMeeting, second])
    const config = settings({ destinationMode: 'daily-note' })
    const first = await runSync({
      client,
      writer,
      settings: config,
      state,
      log: noop,
      now: at('2026-06-16T09:00:00Z')
    })
    const again = await runSync({
      client,
      writer,
      settings: config,
      state,
      log: noop,
      now: at('2026-06-16T09:30:00Z')
    })
    const daily = files.get(`${config.dailyNoteFolder}/2026-06-15.md`) ?? ''
    expect(first.written).toBe(2)
    expect(again.written).toBe(0)
    expect(daily).toContain(sampleMeeting.id)
    expect(daily).toContain('999')
    expect(files.size).toBe(3) // one daily note + two transcripts
  })
})

describe('runSync — re-sync edited notes', () => {
  it('rewrites a meeting whose content changed when re-sync is enabled', async () => {
    const meeting: MeetingDetail = JSON.parse(JSON.stringify(sampleMeeting))
    const { writer } = makeFs()
    const state: SyncState = { syncedMeetings: {} }
    const config = settings({ destinationMode: 'folder', resyncEditedNotes: true })
    await runSync({
      client: makeClient([meeting]),
      writer,
      settings: config,
      state,
      log: noop,
      now: at('2026-06-16T09:00:00Z')
    })
    meeting.summary = { shortText: 'edited', fullText: 'edited body' }
    const re = await runSync({
      client: makeClient([meeting]),
      writer,
      settings: config,
      state,
      log: noop,
      now: at('2026-06-16T09:30:00Z')
    })
    expect(re.written).toBe(1)
  })

  it('skips unchanged meetings even with re-sync enabled', async () => {
    const { writer } = makeFs()
    const state: SyncState = { syncedMeetings: {} }
    const config = settings({ destinationMode: 'folder', resyncEditedNotes: true })
    await runSync({
      client: makeClient([sampleMeeting]),
      writer,
      settings: config,
      state,
      log: noop,
      now: at('2026-06-16T09:00:00Z')
    })
    const re = await runSync({
      client: makeClient([sampleMeeting]),
      writer,
      settings: config,
      state,
      log: noop,
      now: at('2026-06-16T09:30:00Z')
    })
    expect(re.written).toBe(0)
  })
})

describe('runSync — error handling', () => {
  it('skips locked meetings without writing', async () => {
    const locked: MeetingDetail = { ...sampleMeeting, locked: true }
    const { files, writer } = makeFs()
    const result = await runSync({
      client: makeClient([locked]),
      writer,
      settings: settings(),
      state: { syncedMeetings: {} },
      log: noop,
      now: at('2026-06-16T09:00:00Z')
    })
    expect(result.written).toBe(0)
    expect(files.size).toBe(0)
  })

  it('returns ok:false on auth failure instead of throwing', async () => {
    const client: Pick<JamieClient, 'listMeetings' | 'getMeeting'> = {
      listMeetings: async () => {
        throw new JamieAuthError()
      },
      getMeeting: async () => sampleMeeting
    }
    const { writer } = makeFs()
    const result = await runSync({
      client,
      writer,
      settings: settings(),
      state: { syncedMeetings: {} },
      log: noop,
      now: at('2026-06-16T09:00:00Z')
    })
    expect(result.ok).toBe(false)
  })
})
