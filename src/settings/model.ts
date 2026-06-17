export type DestinationMode = 'folder' | 'daily-folder' | 'daily-note'

export interface JamieSyncSettings {
  apiKey: string
  baseUrl: string
  destinationMode: DestinationMode
  notesFolder: string
  transcriptsFolder: string
  dailyNoteFolder: string
  includeTranscript: boolean
  includeShortSummaryCallout: boolean
  includeTasks: boolean
  frontmatterParticipants: boolean
  frontmatterTags: boolean
  syncIntervalMinutes: number
  backfillLookbackDays: number
  resyncEditedNotes: boolean
  recentWindowDays: number
}

export const DEFAULT_SETTINGS: JamieSyncSettings = {
  apiKey: '',
  baseUrl: 'https://api.meetjamie.ai',
  destinationMode: 'folder',
  notesFolder: 'Jamie/Meetings',
  transcriptsFolder: 'Jamie/Transcripts',
  dailyNoteFolder: 'Daily',
  includeTranscript: true,
  includeShortSummaryCallout: true,
  includeTasks: true,
  frontmatterParticipants: true,
  frontmatterTags: true,
  syncIntervalMinutes: 30,
  backfillLookbackDays: 90,
  resyncEditedNotes: false,
  recentWindowDays: 7
}
