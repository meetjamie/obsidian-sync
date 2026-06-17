import type { MeetingDetail } from '../api/types'

export interface RenderOptions {
  includeShortSummaryCallout: boolean
  includeTasks: boolean
  includeTranscriptLink: boolean
  // Basename (no folder, no `.md`) of the transcript note, for the wikilink.
  transcriptFileName?: string
  frontmatterParticipants: boolean
  frontmatterTags: boolean
}

// Obsidian disallows these in file names; collapse them to spaces.
const sanitizeFileName = (name: string) =>
  name
    .replace(/[\\/:*?"<>|#^[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'Untitled meeting'

export const formatDay = (isoLike: string) => isoLike.slice(0, 10) // YYYY-MM-DD

// Single source of truth for a meeting's display title, so the daily-note heading
// and the transcript's back-link anchor can't drift apart.
export const meetingTitle = (meeting: Pick<MeetingDetail, 'title'>) =>
  meeting.title || 'Untitled meeting'

export const buildBaseName = (meeting: Pick<MeetingDetail, 'startTime' | 'title'>) =>
  `${formatDay(meeting.startTime)} ${sanitizeFileName(meetingTitle(meeting))}`

// Jamie app base for the `source:` backlink in note frontmatter.
const APP_BASE_URL = 'https://app.meetjamie.ai'

const yamlScalar = (value: string) => {
  // Quote anything that could confuse a YAML parser.
  if (value.trim() !== value || /[:#\-?{}[\],&*!|>'"%@`]/.test(value) || value === '') {
    return JSON.stringify(value)
  }
  return value
}

const yamlList = (items: string[]) =>
  items.length === 0 ? ' []' : `\n${items.map((i) => `  - ${yamlScalar(i)}`).join('\n')}`

// FNV-1a 32-bit — stable and dependency-free. Lets the sync engine detect when a
// meeting's Jamie-side content changed so it can re-sync without a `modifiedSince`.
export const contentHash = (meeting: MeetingDetail) => {
  const material = JSON.stringify({
    title: meeting.title,
    summary: meeting.summary,
    transcript: meeting.transcript,
    tasks: meeting.tasks,
    tags: meeting.tags
  })
  let hash = 0x811c9dc5
  for (let i = 0; i < material.length; i++) {
    hash ^= material.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

const renderBody = (meeting: MeetingDetail, opts: RenderOptions, headingLevel: 1 | 2) => {
  const title = meetingTitle(meeting)
  const heading = '#'.repeat(headingLevel)
  const lines: string[] = [`${heading} ${title}`]

  if (opts.includeShortSummaryCallout && meeting.summary?.shortText) {
    lines.push('', '> [!summary] Overview', `> ${meeting.summary.shortText.replace(/\n/g, '\n> ')}`)
  }
  if (meeting.summary?.fullText) {
    lines.push('', meeting.summary.fullText.trim())
  }
  if (opts.includeTasks && meeting.tasks.length > 0) {
    lines.push('', `${heading}# Action items`)
    for (const task of meeting.tasks) {
      const who = task.assignee?.name ? ` (@${task.assignee.name})` : ''
      lines.push(`- [${task.completed ? 'x' : ' '}] ${task.content}${who}`)
    }
  }
  if (opts.includeTranscriptLink && opts.transcriptFileName) {
    lines.push('', `Transcript: [[${opts.transcriptFileName}]]`)
  }
  return lines.join('\n')
}

const frontmatter = (meeting: MeetingDetail, opts: RenderOptions) => {
  const lines = [
    '---',
    `jamie-id: ${meeting.id}`,
    `title: ${yamlScalar(meetingTitle(meeting))}`,
    `date: ${meeting.startTime}`
  ]
  if (meeting.endTime) lines.push(`end: ${meeting.endTime}`)
  if (opts.frontmatterParticipants) {
    lines.push(`participants:${yamlList(meeting.participants.map((p) => p.name))}`)
  }
  if (opts.frontmatterTags) {
    lines.push(`tags:${yamlList(meeting.tags.map((t) => t.name))}`)
  }
  lines.push(`source: ${APP_BASE_URL}/meeting/${meeting.id}`)
  lines.push('---')
  return lines.join('\n')
}

// A standalone note file (frontmatter + body). Used by the folder / per-day modes.
export const renderNoteFile = (meeting: MeetingDetail, opts: RenderOptions) =>
  `${frontmatter(meeting, opts)}\n\n${renderBody(meeting, opts, 1)}\n`

// A heading-led section (no frontmatter). Used when appending into a daily note.
export const renderSection = (meeting: MeetingDetail, opts: RenderOptions) =>
  renderBody(meeting, opts, 2)

export const renderTranscript = (meeting: MeetingDetail, noteLinkTarget: string) => {
  const title = meetingTitle(meeting)
  const fm = [
    '---',
    `jamie-id: ${meeting.id}`,
    'type: transcript',
    `title: ${yamlScalar(title)}`,
    `date: ${meeting.startTime}`,
    '---'
  ]
  const body = [
    `# Transcript — ${title}`,
    '',
    `Notes: [[${noteLinkTarget}]]`,
    '',
    (meeting.transcript ?? '_No transcript available._').trim()
  ]
  return `${fm.join('\n')}\n\n${body.join('\n')}\n`
}

// Daily-note block markers use Obsidian comments (`%% ... %%`): invisible in
// reading view, but let us replace a meeting's block in place (idempotent re-sync).
const blockStart = (id: string) => `%% jamie-meeting:${id} %%`
const blockEnd = (id: string) => `%% /jamie-meeting:${id} %%`

export const upsertMeetingBlock = (existing: string, id: string, block: string) => {
  const wrapped = `${blockStart(id)}\n${block}\n${blockEnd(id)}`
  const start = existing.indexOf(blockStart(id))
  if (start === -1) {
    const base = existing.replace(/\s+$/, '')
    return base.length > 0 ? `${base}\n\n${wrapped}\n` : `${wrapped}\n`
  }
  const endToken = blockEnd(id)
  const end = existing.indexOf(endToken, start)
  if (end === -1) {
    return `${existing.replace(/\s+$/, '')}\n\n${wrapped}\n`
  }
  return `${existing.slice(0, start)}${wrapped}${existing.slice(end + endToken.length)}`
}
