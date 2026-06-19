import { Notice, normalizePath, Plugin, TFile } from 'obsidian'
import { JamieClient } from './api/client'
import { obsidianHttpGet } from './obsidian-http'
import { DEFAULT_SETTINGS, type JamieSyncSettings } from './settings/model'
import { JamieSettingTab } from './settings/tab'
import { type FileWriter, runSync, type SyncState } from './sync/engine'

interface PersistedData {
  settings: JamieSyncSettings
  state: SyncState
}

export default class JamieSyncPlugin extends Plugin {
  settings: JamieSyncSettings = DEFAULT_SETTINGS
  state: SyncState = { syncedMeetings: {} }
  private syncing = false

  async onload() {
    const data = ((await this.loadData()) ?? {}) as Partial<PersistedData>
    this.settings = { ...DEFAULT_SETTINGS, ...data.settings }
    this.state = data.state ?? { syncedMeetings: {} }

    this.addSettingTab(new JamieSettingTab(this.app, this))

    this.addCommand({ id: 'sync-now', name: 'Sync now', callback: () => this.syncNow() })
    this.addCommand({
      id: 'reset-sync-state',
      name: 'Reset sync state',
      callback: async () => {
        this.state = { syncedMeetings: {} }
        await this.persist()
        new Notice('Jamie: sync state reset.')
      }
    })

    this.scheduleInterval()

    // Catch up the moment Obsidian opens (deferred so it never blocks startup).
    this.app.workspace.onLayoutReady(() => {
      if (this.settings.apiKey) void this.syncNow()
    })
  }

  scheduleInterval() {
    const minutes = this.settings.syncIntervalMinutes
    if (minutes > 0) {
      // registerInterval ties the timer to the plugin lifecycle (auto-cleared on unload).
      this.registerInterval(window.setInterval(() => this.syncNow(), minutes * 60_000))
    }
  }

  async persist() {
    await this.saveData({ settings: this.settings, state: this.state })
  }

  private makeWriter(): FileWriter {
    const { vault } = this.app
    return {
      read: async (path) => {
        const file = vault.getAbstractFileByPath(normalizePath(path))
        return file instanceof TFile ? vault.read(file) : null
      },
      write: async (path, content) => {
        const normalized = normalizePath(path)
        const dir = normalized.split('/').slice(0, -1).join('/')
        if (dir && !vault.getAbstractFileByPath(dir)) {
          await vault.createFolder(dir).catch(() => undefined)
        }
        const existing = vault.getAbstractFileByPath(normalized)
        if (existing instanceof TFile) {
          await vault.modify(existing, content)
        } else {
          await vault.create(normalized, content)
        }
      }
    }
  }

  async syncNow() {
    if (this.syncing) {
      new Notice('Jamie: a sync is already running.')
      return
    }
    if (!this.settings.apiKey) {
      new Notice('Jamie: add your API key in settings first.')
      return
    }

    this.syncing = true
    const notice = new Notice('Jamie: syncing…', 0)
    try {
      const client = new JamieClient({
        apiKey: this.settings.apiKey,
        httpGet: obsidianHttpGet
      })
      const result = await runSync({
        client,
        writer: this.makeWriter(),
        settings: this.settings,
        state: this.state,
        log: (message) => notice.setMessage(`Jamie: ${message}`),
        now: () => new Date()
      })
      await this.persist()
      notice.setMessage(
        result.ok
          ? `Jamie: synced ${result.written} note(s) (written/updated).`
          : 'Jamie: sync failed — open the developer console (Cmd/Ctrl+Opt+I) for details.'
      )
    } catch (error) {
      console.error('Jamie sync error', error)
      notice.setMessage(`Jamie: error — ${(error as Error).message}`)
    } finally {
      this.syncing = false
      window.setTimeout(() => notice.hide(), 4000)
    }
  }
}
