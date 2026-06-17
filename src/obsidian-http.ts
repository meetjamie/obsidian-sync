import { requestUrl } from 'obsidian'
import type { HttpGet } from './api/client'

// Routes requests through Obsidian's `requestUrl`, which runs in Electron's main
// process: it bypasses browser CORS (the public API doesn't allow the Obsidian
// origin) and can reach `http://localhost` for a locally-running Jamie instance.
export const obsidianHttpGet: HttpGet = async (url, headers) => {
  const response = await requestUrl({ url, method: 'GET', headers, throw: false })
  return {
    status: response.status,
    header: (name) => response.headers[name] ?? response.headers[name.toLowerCase()] ?? null,
    text: async () => response.text
  }
}
