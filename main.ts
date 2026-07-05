import { App, Notice, Plugin, PluginSettingTab, requestUrl, Setting } from 'obsidian'

interface ForgejoInstallerSettings {
    baseUrl: string
    token: string
    // One "owner/repo" or "owner/repo@branch" per entry.
    repos: string[]
    checkOnStartup: boolean
}

const DEFAULT_SETTINGS: ForgejoInstallerSettings = {
    baseUrl: '',
    token: '',
    repos: [],
    checkOnStartup: false,
}

interface RepoRef {
    owner: string
    repo: string
    branch: string
}

function parseRepoLine(line: string): RepoRef | null {
    const match = line.trim().match(/^([^/\s]+)\/([^@\s]+)(?:@(\S+))?$/)
    if (!match) {
        return null
    }
    return { owner: match[1], repo: match[2], branch: match[3] ?? 'main' }
}

export default class ForgejoInstallerPlugin extends Plugin {
    settings: ForgejoInstallerSettings = DEFAULT_SETTINGS

    async onload() {
        await this.loadSettings()
        this.addSettingTab(new ForgejoInstallerSettingTab(this.app, this))

        this.addCommand({
            id: 'update-all',
            name: 'Check all repositories and install updates',
            callback: () => this.updateAll(true),
        })

        if (this.settings.checkOnStartup) {
            // Let Obsidian finish loading before hitting the network.
            this.app.workspace.onLayoutReady(() => this.updateAll(false))
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
    }

    async saveSettings() {
        await this.saveData(this.settings)
    }

    async updateAll(verbose: boolean) {
        if (this.settings.baseUrl === '') {
            new Notice('Forgejo Installer: set the base URL in settings first')
            return
        }
        let changed = 0
        let failed = 0
        for (const line of this.settings.repos) {
            if (line.trim() === '') {
                continue
            }
            const ref = parseRepoLine(line)
            if (ref === null) {
                new Notice(`Forgejo Installer: cannot parse "${line}" (expected owner/repo[@branch])`)
                failed++
                continue
            }
            try {
                const result = await this.installOrUpdate(ref)
                if (result !== 'up-to-date') {
                    changed++
                    new Notice(`Forgejo Installer: ${ref.repo} ${result}`)
                }
            } catch (error) {
                failed++
                new Notice(`Forgejo Installer: ${ref.repo} failed — ${error instanceof Error ? error.message : error}`)
            }
        }
        if (verbose && changed === 0 && failed === 0) {
            new Notice('Forgejo Installer: everything up to date')
        }
    }

    // Fetches a file from the repo via the Forgejo API raw endpoint (works
    // with private repos when a token is set). Returns null on 404.
    async fetchFile(ref: RepoRef, path: string): Promise<string | null> {
        const base = this.settings.baseUrl.replace(/\/+$/, '')
        const url = `${base}/api/v1/repos/${ref.owner}/${ref.repo}/raw/${path}?ref=${encodeURIComponent(ref.branch)}`
        const headers: Record<string, string> = {}
        if (this.settings.token !== '') {
            headers.Authorization = `token ${this.settings.token}`
        }
        const res = await requestUrl({ url, headers, throw: false })
        if (res.status === 404) {
            return null
        }
        if (res.status !== 200) {
            throw new Error(`${path}: HTTP ${res.status}`)
        }
        return res.text
    }

    async installOrUpdate(ref: RepoRef): Promise<'installed' | 'updated' | 'up-to-date'> {
        const manifestText = await this.fetchFile(ref, 'manifest.json')
        if (manifestText === null) {
            throw new Error('manifest.json not found (commit the built plugin files to the repo root)')
        }
        const manifest = JSON.parse(manifestText)
        if (typeof manifest.id !== 'string' || typeof manifest.version !== 'string') {
            throw new Error('manifest.json has no id/version')
        }

        const adapter = this.app.vault.adapter
        const dir = `${this.app.vault.configDir}/plugins/${manifest.id}`
        const installedManifestPath = `${dir}/manifest.json`
        let installedVersion: string | null = null
        if (await adapter.exists(installedManifestPath)) {
            try {
                installedVersion = JSON.parse(await adapter.read(installedManifestPath)).version ?? null
            } catch {
                installedVersion = null
            }
        }
        if (installedVersion === manifest.version) {
            return 'up-to-date'
        }

        const mainJs = await this.fetchFile(ref, 'main.js')
        if (mainJs === null) {
            throw new Error('main.js not found (commit the built plugin files to the repo root)')
        }
        const styles = await this.fetchFile(ref, 'styles.css')

        if (!(await adapter.exists(dir))) {
            await adapter.mkdir(dir)
        }
        await adapter.write(`${dir}/main.js`, mainJs)
        if (styles !== null) {
            await adapter.write(`${dir}/styles.css`, styles)
        }
        // Manifest last, so a failed download never leaves a "current" version
        // with stale code.
        await adapter.write(installedManifestPath, manifestText)

        await this.reloadPlugin(manifest.id)
        return installedVersion === null ? 'installed' : 'updated'
    }

    // Same technique BRAT uses: not part of the public API, so keep it fenced.
    async reloadPlugin(id: string) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const plugins = (this.app as any).plugins
        if (!plugins) {
            return
        }
        await plugins.loadManifests()
        if (plugins.enabledPlugins?.has(id)) {
            await plugins.disablePlugin(id)
            await plugins.enablePlugin(id)
        }
    }
}

class ForgejoInstallerSettingTab extends PluginSettingTab {
    plugin: ForgejoInstallerPlugin

    constructor(app: App, plugin: ForgejoInstallerPlugin) {
        super(app, plugin)
        this.plugin = plugin
    }

    display() {
        const { containerEl } = this
        containerEl.empty()

        new Setting(containerEl)
            .setName('Forgejo base URL')
            .setDesc('For example https://forgejo.example.com')
            .addText((text) =>
                text
                    .setPlaceholder('https://forgejo.example.com')
                    .setValue(this.plugin.settings.baseUrl)
                    .onChange(async (value) => {
                        this.plugin.settings.baseUrl = value.trim()
                        await this.plugin.saveSettings()
                    })
            )

        new Setting(containerEl)
            .setName('API token')
            .setDesc('Optional; required for private repositories (read:repository scope)')
            .addText((text) => {
                text.inputEl.type = 'password'
                text
                    .setValue(this.plugin.settings.token)
                    .onChange(async (value) => {
                        this.plugin.settings.token = value.trim()
                        await this.plugin.saveSettings()
                    })
            })

        new Setting(containerEl)
            .setName('Repositories')
            .setDesc('One per line: owner/repo or owner/repo@branch. The repo root must contain the built manifest.json and main.js.')
            .addTextArea((text) => {
                text.inputEl.rows = 6
                text.inputEl.cols = 36
                text
                    .setPlaceholder('arudev/my-plugin\narudev/other-plugin@dev')
                    .setValue(this.plugin.settings.repos.join('\n'))
                    .onChange(async (value) => {
                        this.plugin.settings.repos = value.split('\n')
                        await this.plugin.saveSettings()
                    })
            })

        new Setting(containerEl)
            .setName('Check for updates on startup')
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.checkOnStartup)
                    .onChange(async (value) => {
                        this.plugin.settings.checkOnStartup = value
                        await this.plugin.saveSettings()
                    })
            )

        new Setting(containerEl)
            .setName('Update now')
            .setDesc('Check every repository and install anything new')
            .addButton((button) =>
                button
                    .setButtonText('Check and install')
                    .setCta()
                    .onClick(() => this.plugin.updateAll(true))
            )
    }
}
