// Shapes returned by Jamie's public API (`/v1/me/*`), verified against the codebase.
// See docs/obsidian-integration-evaluation.md (Appendix) for the source endpoints.

export interface MeetingSummary {
  id: string
  title: string
  startTime: string
  endTime: string | null
  calendarEventId: string | null
  userId: string
  isShared?: boolean
}

export interface MeetingListResult {
  meetings: MeetingSummary[]
  nextCursor: string | null
}

export interface Participant {
  id: string
  name: string
  email: string | null
}

export interface MeetingTask {
  content: string
  completed: boolean
  assignee: { name: string | null; email: string | null } | null
}

export interface MeetingTag {
  name: string
  color: string
}

export interface CalendarAttendee {
  name: string
  email: string
  responseStatus: string | null
  organizer: boolean
}

export interface CalendarEvent {
  externalId: string | null
  title: string
  scheduledTime: string
  endTime: string | null
  attendees: CalendarAttendee[]
}

export interface MeetingDetail {
  id: string
  title: string
  startTime: string
  endTime: string | null
  locked: boolean
  user: { id: string; email: string }
  // The API converts the stored Tiptap summary to these: `markdown` is the body,
  // `short` the one-liner. `transcript` likewise already arrives as Markdown.
  summary: { markdown: string; html: string; short: string } | null
  transcript: string | null
  participants: Participant[]
  tasks: MeetingTask[]
  tags: MeetingTag[]
  event: CalendarEvent | null
}

export interface ListMeetingsParams {
  limit?: number
  cursor?: string
  startDate?: string
  endDate?: string
  tag?: string
}
