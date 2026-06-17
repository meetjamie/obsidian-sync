import type { MeetingDetail } from '../api/types'

// Synthetic sample so the renderer and engine can be demoed without a live key.
// Intentionally generic — this file ships in the public repo.
export const sampleMeeting: MeetingDetail = {
  id: '7893456789012345678',
  title: 'Weekly Team Sync',
  startTime: '2026-06-15T14:00:00.000Z',
  endTime: '2026-06-15T14:42:00.000Z',
  locked: false,
  user: { id: 'user-1', email: 'alex@example.com' },
  summary: {
    shortText: 'Reviewed progress, set priorities for the week, and assigned follow-ups.',
    fullText: [
      '## Key decisions',
      '',
      '- Prioritize the onboarding flow for this sprint.',
      '- Ship the reporting dashboard behind a flag.',
      '',
      '## Discussion',
      '',
      '- **Onboarding**: the first-run experience needs fewer steps.',
      '- **Reporting**: start with weekly active users, add cohorts later.'
    ].join('\n')
  },
  transcript: [
    '**Alex**',
    'Let’s lock the priorities for the week before we dive in.',
    '',
    '**Sam**',
    'Agreed — onboarding first, then the dashboard behind a flag.'
  ].join('\n'),
  participants: [
    { id: 'p1', name: 'Alex', email: 'alex@example.com' },
    { id: 'p2', name: 'Sam', email: 'sam@example.com' }
  ],
  tasks: [
    {
      content: 'Draft the onboarding flow spec',
      completed: false,
      assignee: { name: 'Sam', email: 'sam@example.com' }
    },
    { content: 'Book the design review', completed: true, assignee: null }
  ],
  tags: [
    { name: 'Team', color: '#4A90D9' },
    { name: 'Planning', color: '#E2A03F' }
  ],
  event: {
    externalId: 'cal-evt-123',
    title: 'Weekly Team Sync',
    scheduledTime: '2026-06-15T14:00:00.000Z',
    endTime: '2026-06-15T14:30:00.000Z',
    attendees: [
      { name: 'Alex', email: 'alex@example.com', responseStatus: 'accepted', organizer: true },
      { name: 'Sam', email: 'sam@example.com', responseStatus: 'accepted', organizer: false }
    ]
  }
}
