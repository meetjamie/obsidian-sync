import { describe, expect, it } from 'vitest'
import type { MeetingDetail } from '../api/types'
import {
  buildBaseName,
  contentHash,
  renderNoteFile,
  renderSection,
  renderTranscript,
  upsertMeetingBlock
} from './note-renderer'
import { sampleMeeting } from './sample'

const opts = {
  includeShortSummaryCallout: true,
  includeTasks: true,
  includeTranscriptLink: true,
  transcriptFileName: 'T',
  frontmatterParticipants: true,
  frontmatterTags: true
}

describe('buildBaseName', () => {
  it('prefixes the start date and keeps the title', () => {
    expect(buildBaseName({ startTime: '2026-06-15T14:00:00.000Z', title: 'Weekly Sync' })).toBe(
      '2026-06-15 Weekly Sync'
    )
  })
  it('sanitizes characters Obsidian disallows in file names', () => {
    expect(buildBaseName({ startTime: '2026-06-15T00:00:00Z', title: 'A/B: C?*' })).toBe(
      '2026-06-15 A B C'
    )
  })
  it('falls back to a default title', () => {
    expect(buildBaseName({ startTime: '2026-06-15T00:00:00Z', title: '' })).toBe(
      '2026-06-15 Untitled meeting'
    )
  })
})

describe('contentHash', () => {
  it('is stable for identical content', () => {
    expect(contentHash(sampleMeeting)).toBe(contentHash(sampleMeeting))
  })
  it('changes when the summary changes', () => {
    const edited: MeetingDetail = {
      ...sampleMeeting,
      summary: { markdown: 'changed', html: '', short: 'x' }
    }
    expect(contentHash(edited)).not.toBe(contentHash(sampleMeeting))
  })
})

describe('renderNoteFile', () => {
  const out = renderNoteFile(sampleMeeting, opts)
  it('starts with YAML frontmatter carrying the jamie id and date', () => {
    expect(out.startsWith('---\n')).toBe(true)
    expect(out).toContain(`jamie-id: ${sampleMeeting.id}`)
    expect(out).toContain('date: 2026-06-15T14:00:00.000Z')
  })
  it('includes the summary callout and task checkboxes', () => {
    expect(out).toContain('> [!summary] Overview')
    expect(out).toContain('- [ ] Draft the onboarding flow spec')
    expect(out).toContain('- [x] Book the design review')
  })
  it('links the transcript', () => {
    expect(out).toContain('Transcript: [[T]]')
  })

  it('normalizes •-run-on summary bullets into Markdown list items', () => {
    const bullety: MeetingDetail = {
      ...sampleMeeting,
      summary: { markdown: '## Heading\n• alpha• beta• gamma', html: '', short: 's' }
    }
    const rendered = renderNoteFile(bullety, opts)
    expect(rendered).toContain('## Heading')
    expect(rendered).toContain('- alpha')
    expect(rendered).toContain('- beta')
    expect(rendered).toContain('- gamma')
    expect(rendered).not.toContain('• alpha')
  })
})

describe('renderSection', () => {
  it('is heading-led (h2) with no frontmatter', () => {
    const out = renderSection(sampleMeeting, opts)
    expect(out.startsWith('## ')).toBe(true)
    expect(out.startsWith('---')).toBe(false)
  })
})

describe('renderTranscript', () => {
  it('links back to the note and includes the transcript text', () => {
    const out = renderTranscript(sampleMeeting, 'Note Name')
    expect(out).toContain('type: transcript')
    expect(out).toContain('Notes: [[Note Name]]')
    expect(out).toContain('lock the priorities')
  })
})

describe('upsertMeetingBlock', () => {
  it('appends a wrapped block when absent, preserving existing content', () => {
    const out = upsertMeetingBlock('# Daily', 'abc', '## Meeting')
    expect(out.startsWith('# Daily')).toBe(true)
    expect(out).toContain('%% jamie-meeting:abc %%')
    expect(out).toContain('## Meeting')
    expect(out).toContain('%% /jamie-meeting:abc %%')
  })
  it('replaces the block in place and stays idempotent', () => {
    const once = upsertMeetingBlock('# Daily', 'abc', '## V1')
    const twice = upsertMeetingBlock(once, 'abc', '## V2')
    expect(twice).toContain('## V2')
    expect(twice).not.toContain('## V1')
    expect(twice.split('%% jamie-meeting:abc %%').length).toBe(2) // exactly one block
  })
})
