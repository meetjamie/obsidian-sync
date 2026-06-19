import type { ListMeetingsParams, MeetingDetail, MeetingListResult } from './types'

export class JamieAuthError extends Error {
  constructor(message = 'Invalid or missing API key') {
    super(message)
    this.name = 'JamieAuthError'
  }
}

export class JamieRateLimitError extends Error {
  constructor(public resetAtMs: number) {
    super('Rate limited')
    this.name = 'JamieRateLimitError'
  }
}

export class JamieHttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
    this.name = 'JamieHttpError'
  }
}

// Minimal HTTP surface the client needs. Inside Obsidian this is backed by
// `requestUrl` (CORS-safe, reaches localhost); in Node/tests it can be `fetch`
// or a fake. Keeping the client off the WHATWG fetch types lets the core run
// anywhere without bundling Obsidian.
export interface HttpResponse {
  status: number
  header(name: string): string | null
  text(): Promise<string>
}

export type HttpGet = (url: string, headers: Record<string, string>) => Promise<HttpResponse>

const fetchHttpGet: HttpGet = async (url, headers) => {
  const response = await fetch(url, { method: 'GET', headers })
  return {
    status: response.status,
    header: (name) => response.headers.get(name),
    text: () => response.text()
  }
}

interface ClientOptions {
  apiKey: string
  httpGet?: HttpGet
}

// Production Jamie public API. To test against a local instance, change this temporarily.
const JAMIE_API_BASE_URL = 'https://beta-api.meetjamie.ai'

// Jamie's public API is tRPC-over-HTTP: GET params are JSON-encoded under the
// `input` query param as `{ json: {...} }`, and the response payload is nested
// at `result.data.json`. This client hides both quirks behind plain methods.
export class JamieClient {
  private readonly apiKey: string
  private readonly httpGet: HttpGet

  constructor(opts: ClientOptions) {
    this.apiKey = opts.apiKey
    this.httpGet = opts.httpGet ?? fetchHttpGet
  }

  async verifyKey() {
    // tags.list is a cheap authenticated call — a 200 proves the key works.
    await this.get('/v1/me/tags.list', {})
    return true
  }

  async listMeetings(params: ListMeetingsParams = {}) {
    const input: Record<string, unknown> = {}
    if (params.limit !== undefined) input.limit = params.limit
    if (params.cursor !== undefined) input.cursor = params.cursor
    if (params.startDate !== undefined) input.startDate = params.startDate
    if (params.endDate !== undefined) input.endDate = params.endDate
    if (params.tag !== undefined) input.tag = params.tag
    const data = await this.get('/v1/me/meetings.list', input)
    return data as MeetingListResult
  }

  async getMeeting(meetingId: string) {
    const data = await this.get('/v1/me/meetings.get', { meetingId })
    return data as MeetingDetail
  }

  private buildUrl(path: string, input: Record<string, unknown>) {
    const url = new URL(JAMIE_API_BASE_URL + path)
    if (Object.keys(input).length > 0) {
      url.searchParams.set('input', JSON.stringify({ json: input }))
    }
    return url.toString()
  }

  private async get(path: string, input: Record<string, unknown>) {
    const response = await this.httpGet(this.buildUrl(path, input), {
      'x-api-key': this.apiKey,
      accept: 'application/json'
    })

    const body = await response.text()
    // The API returns `{ "error": "..." }` on failure — surface it for debugging.
    const serverError = () => {
      try {
        const parsed = JSON.parse(body)
        return typeof parsed?.error === 'string' ? parsed.error : null
      } catch {
        return null
      }
    }

    if (response.status === 401)
      throw new JamieAuthError(serverError() ?? 'Invalid or missing API key')
    if (response.status === 429) {
      const resetSeconds = Number(response.header('x-ratelimit-reset') ?? '0')
      throw new JamieRateLimitError(resetSeconds * 1000)
    }
    if (response.status < 200 || response.status >= 300) {
      throw new JamieHttpError(response.status, serverError() ?? body ?? `HTTP ${response.status}`)
    }

    const json = body ? JSON.parse(body) : null
    // Unwrap the tRPC envelope; fall back to the raw body if it isn't wrapped.
    return json?.result?.data?.json ?? json
  }
}
