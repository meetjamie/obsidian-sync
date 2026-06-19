import { type App, Notice, PluginSettingTab, Setting } from 'obsidian'
import { JamieClient } from '../api/client'
import type JamieSyncPlugin from '../main'
import { obsidianHttpGet } from '../obsidian-http'

export class JamieSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: JamieSyncPlugin
  ) {
    super(app, plugin)
  }

  // NB: must not be named `setting` — Obsidian's SettingTab base (1.13+) has an instance
  // member of that name that would shadow this method at runtime.
  private makeSetting(name: string, desc: string | null) {
    const setting = new Setting(this.containerEl).setName(name)
    if (desc) setting.setDesc(desc)
    return setting
  }

  private textSetting(
    name: string,
    desc: string | null,
    get: () => string,
    set: (value: string) => void
  ) {
    this.makeSetting(name, desc).addText((text) =>
      text.setValue(get()).onChange(async (value) => {
        set(value)
        await this.plugin.persist()
      })
    )
  }

  private toggleSetting(
    name: string,
    desc: string | null,
    get: () => boolean,
    set: (value: boolean) => void
  ) {
    this.makeSetting(name, desc).addToggle((toggle) =>
      toggle.setValue(get()).onChange(async (value) => {
        set(value)
        await this.plugin.persist()
      })
    )
  }

  private numberSetting(
    name: string,
    desc: string | null,
    min: number,
    get: () => number,
    set: (value: number) => void
  ) {
    this.makeSetting(name, desc).addText((text) =>
      text.setValue(String(get())).onChange(async (value) => {
        const parsed = Number(value)
        if (!Number.isNaN(parsed) && parsed >= min) {
          set(parsed)
          await this.plugin.persist()
        }
      })
    )
  }

  display() {
    const { containerEl } = this
    containerEl.empty()

    const settings = this.plugin.settings

    new Setting(containerEl)
      .setName('API key')
      .setDesc(
        'Personal Jamie API key (starts with jk_). Create one in Jamie → Settings → Developers.'
      )
      .addText((text) => {
        text.inputEl.type = 'password' // mask the key on screen (screen-share / shoulder-surf)
        text
          .setPlaceholder('jk_…')
          .setValue(settings.apiKey)
          .onChange(async (value) => {
            settings.apiKey = value.trim()
            await this.plugin.persist()
          })
      })

    new Setting(containerEl).setName('Test connection').addButton((button) =>
      button.setButtonText('Test').onClick(async () => {
        try {
          await new JamieClient({
            apiKey: settings.apiKey,
            httpGet: obsidianHttpGet
          }).verifyKey()
          new Notice('Jamie: connection OK ✅')
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          new Notice(`Jamie: ❌ ${message}`)
        }
      })
    )

    new Setting(containerEl)
      .setName('Destination')
      .setDesc('Where synced notes go.')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('folder', 'Dedicated folder')
          .addOption('daily-folder', 'Per-day folders')
          .addOption('daily-note', 'Append to daily note')
          .setValue(settings.destinationMode)
          .onChange(async (value) => {
            if (value === 'folder' || value === 'daily-folder' || value === 'daily-note') {
              settings.destinationMode = value
              await this.plugin.persist()
            }
          })
      )

    this.textSetting(
      'Notes folder',
      null,
      () => settings.notesFolder,
      (v) => {
        settings.notesFolder = v
      }
    )
    this.textSetting(
      'Transcripts folder',
      null,
      () => settings.transcriptsFolder,
      (v) => {
        settings.transcriptsFolder = v
      }
    )
    this.textSetting(
      'Daily note folder',
      'Used by the "Append to daily note" destination (file: <folder>/YYYY-MM-DD.md).',
      () => settings.dailyNoteFolder,
      (v) => {
        settings.dailyNoteFolder = v
      }
    )

    this.toggleSetting(
      'Include transcripts',
      null,
      () => settings.includeTranscript,
      (v) => {
        settings.includeTranscript = v
      }
    )
    this.toggleSetting(
      'Short-summary callout at top',
      'Jamie has no "private notes"; this surfaces the one-line summary as a callout instead.',
      () => settings.includeShortSummaryCallout,
      (v) => {
        settings.includeShortSummaryCallout = v
      }
    )
    this.toggleSetting(
      'Include action items',
      null,
      () => settings.includeTasks,
      (v) => {
        settings.includeTasks = v
      }
    )
    this.toggleSetting(
      'Participants in frontmatter',
      null,
      () => settings.frontmatterParticipants,
      (v) => {
        settings.frontmatterParticipants = v
      }
    )
    this.toggleSetting(
      'Tags in frontmatter',
      null,
      () => settings.frontmatterTags,
      (v) => {
        settings.frontmatterTags = v
      }
    )

    this.numberSetting(
      'Sync interval (minutes)',
      '0 = manual only.',
      0,
      () => settings.syncIntervalMinutes,
      (v) => {
        settings.syncIntervalMinutes = v
      }
    )
    this.numberSetting(
      'Backfill lookback (days)',
      null,
      1,
      () => settings.backfillLookbackDays,
      (v) => {
        settings.backfillLookbackDays = v
      }
    )
    this.toggleSetting(
      'Re-sync edited notes',
      'Re-fetch already-synced meetings within the recent window and rewrite them if they changed.',
      () => settings.resyncEditedNotes,
      (v) => {
        settings.resyncEditedNotes = v
      }
    )
    this.numberSetting(
      'Recent window (days)',
      'How far back "re-sync edited notes" re-checks meetings.',
      1,
      () => settings.recentWindowDays,
      (v) => {
        settings.recentWindowDays = v
      }
    )
  }
}
