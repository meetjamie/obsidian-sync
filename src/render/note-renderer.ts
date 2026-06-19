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

// Jamie serializes summary bullet lists as a single "• a• b• c" line, and `•` is not a
// Markdown list marker — so Obsidian renders the whole run as one paragraph. Split any
// line starting with `•` into proper "- " list items so it renders as a real list.
const normalizeSummaryMarkdown = (markdown: string) =>
  markdown
    .trim()
    .split('\n')
    .map((line) =>
      line.trimStart().startsWith('•')
        ? line
            .split('•')
            .map((part) => part.trim())
            .filter(Boolean)
            .map((part) => `- ${part}`)
            .join('\n')
        : line
    )
    .join('\n')

const renderBody = (
  meeting: MeetingDetail,
  opts: RenderOptions,
  headingLevel: 1 | 2,
  emitTitleHeading: boolean
) => {
  const subHeading = '#'.repeat(headingLevel + 1)
  const blocks: string[] = []

  // Standalone-file modes skip the title heading — the filename (date + title) already
  // shows it. Daily-note mode keeps it to delineate each meeting's block.
  if (emitTitleHeading) blocks.push(`${'#'.repeat(headingLevel)} ${meetingTitle(meeting)}`)

  if (opts.includeShortSummaryCallout && meeting.summary?.short) {
    blocks.push(`> [!summary] Overview\n> ${meeting.summary.short.replace(/\n/g, '\n> ')}`)
  }
  if (meeting.summary?.markdown) {
    blocks.push(normalizeSummaryMarkdown(meeting.summary.markdown))
  }
  if (opts.includeTasks && meeting.tasks.length > 0) {
    const items = meeting.tasks.map((task) => {
      const who = task.assignee?.name ? ` (@${task.assignee.name})` : ''
      return `- [${task.completed ? 'x' : ' '}] ${task.content}${who}`
    })
    blocks.push(`${subHeading} Action items\n${items.join('\n')}`)
  }
  if (opts.includeTranscriptLink && opts.transcriptFileName) {
    blocks.push(`Transcript: [[${opts.transcriptFileName}]]`)
  }
  return blocks.join('\n\n')
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
// No title heading — the filename (date + title) already serves as the note's title.
export const renderNoteFile = (meeting: MeetingDetail, opts: RenderOptions) =>
  `${frontmatter(meeting, opts)}\n\n${renderBody(meeting, opts, 1, false)}\n`

// A heading-led section (no frontmatter). Used when appending into a daily note, where
// the `## title` heading delineates each meeting's block (and anchors the transcript link).
export const renderSection = (meeting: MeetingDetail, opts: RenderOptions) =>
  renderBody(meeting, opts, 2, true)

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
