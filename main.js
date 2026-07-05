"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => ForgejoInstallerPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  baseUrl: "",
  token: "",
  repos: [],
  checkOnStartup: false
};
function parseRepoLine(line) {
  var _a;
  const match = line.trim().match(/^([^/\s]+)\/([^@\s]+)(?:@(\S+))?$/);
  if (!match) {
    return null;
  }
  return { owner: match[1], repo: match[2], branch: (_a = match[3]) != null ? _a : "main" };
}
var ForgejoInstallerPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
  }
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new ForgejoInstallerSettingTab(this.app, this));
    this.addCommand({
      id: "update-all",
      name: "Check all repositories and install updates",
      callback: () => this.updateAll(true)
    });
    if (this.settings.checkOnStartup) {
      this.app.workspace.onLayoutReady(() => this.updateAll(false));
    }
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  async updateAll(verbose) {
    if (this.settings.baseUrl === "") {
      new import_obsidian.Notice("Forgejo Installer: set the base URL in settings first");
      return;
    }
    let changed = 0;
    let failed = 0;
    for (const line of this.settings.repos) {
      if (line.trim() === "") {
        continue;
      }
      const ref = parseRepoLine(line);
      if (ref === null) {
        new import_obsidian.Notice(`Forgejo Installer: cannot parse "${line}" (expected owner/repo[@branch])`);
        failed++;
        continue;
      }
      try {
        const result = await this.installOrUpdate(ref);
        if (result !== "up-to-date") {
          changed++;
          new import_obsidian.Notice(`Forgejo Installer: ${ref.repo} ${result}`);
        }
      } catch (error) {
        failed++;
        new import_obsidian.Notice(`Forgejo Installer: ${ref.repo} failed \u2014 ${error instanceof Error ? error.message : error}`);
      }
    }
    if (verbose && changed === 0 && failed === 0) {
      new import_obsidian.Notice("Forgejo Installer: everything up to date");
    }
  }
  // Fetches a file from the repo via the Forgejo API raw endpoint (works
  // with private repos when a token is set). Returns null on 404.
  async fetchFile(ref, path) {
    const base = this.settings.baseUrl.replace(/\/+$/, "");
    const url = `${base}/api/v1/repos/${ref.owner}/${ref.repo}/raw/${path}?ref=${encodeURIComponent(ref.branch)}`;
    const headers = {};
    if (this.settings.token !== "") {
      headers.Authorization = `token ${this.settings.token}`;
    }
    const res = await (0, import_obsidian.requestUrl)({ url, headers, throw: false });
    if (res.status === 404) {
      return null;
    }
    if (res.status !== 200) {
      throw new Error(`${path}: HTTP ${res.status}`);
    }
    return res.text;
  }
  async installOrUpdate(ref) {
    var _a;
    const manifestText = await this.fetchFile(ref, "manifest.json");
    if (manifestText === null) {
      throw new Error("manifest.json not found (commit the built plugin files to the repo root)");
    }
    const manifest = JSON.parse(manifestText);
    if (typeof manifest.id !== "string" || typeof manifest.version !== "string") {
      throw new Error("manifest.json has no id/version");
    }
    const adapter = this.app.vault.adapter;
    const dir = `${this.app.vault.configDir}/plugins/${manifest.id}`;
    const installedManifestPath = `${dir}/manifest.json`;
    let installedVersion = null;
    if (await adapter.exists(installedManifestPath)) {
      try {
        installedVersion = (_a = JSON.parse(await adapter.read(installedManifestPath)).version) != null ? _a : null;
      } catch (e) {
        installedVersion = null;
      }
    }
    if (installedVersion === manifest.version) {
      return "up-to-date";
    }
    const mainJs = await this.fetchFile(ref, "main.js");
    if (mainJs === null) {
      throw new Error("main.js not found (commit the built plugin files to the repo root)");
    }
    const styles = await this.fetchFile(ref, "styles.css");
    if (!await adapter.exists(dir)) {
      await adapter.mkdir(dir);
    }
    await adapter.write(`${dir}/main.js`, mainJs);
    if (styles !== null) {
      await adapter.write(`${dir}/styles.css`, styles);
    }
    await adapter.write(installedManifestPath, manifestText);
    await this.reloadPlugin(manifest.id);
    return installedVersion === null ? "installed" : "updated";
  }
  // Same technique BRAT uses: not part of the public API, so keep it fenced.
  async reloadPlugin(id) {
    var _a;
    const plugins = this.app.plugins;
    if (!plugins) {
      return;
    }
    await plugins.loadManifests();
    if ((_a = plugins.enabledPlugins) == null ? void 0 : _a.has(id)) {
      await plugins.disablePlugin(id);
      await plugins.enablePlugin(id);
    }
  }
};
var ForgejoInstallerSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian.Setting(containerEl).setName("Forgejo base URL").setDesc("For example https://forgejo.example.com").addText(
      (text) => text.setPlaceholder("https://forgejo.example.com").setValue(this.plugin.settings.baseUrl).onChange(async (value) => {
        this.plugin.settings.baseUrl = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("API token").setDesc("Optional; required for private repositories (read:repository scope)").addText((text) => {
      text.inputEl.type = "password";
      text.setValue(this.plugin.settings.token).onChange(async (value) => {
        this.plugin.settings.token = value.trim();
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian.Setting(containerEl).setName("Repositories").setDesc("One per line: owner/repo or owner/repo@branch. The repo root must contain the built manifest.json and main.js.").addTextArea((text) => {
      text.inputEl.rows = 6;
      text.inputEl.cols = 36;
      text.setPlaceholder("arudev/my-plugin\narudev/other-plugin@dev").setValue(this.plugin.settings.repos.join("\n")).onChange(async (value) => {
        this.plugin.settings.repos = value.split("\n");
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian.Setting(containerEl).setName("Check for updates on startup").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.checkOnStartup).onChange(async (value) => {
        this.plugin.settings.checkOnStartup = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Update now").setDesc("Check every repository and install anything new").addButton(
      (button) => button.setButtonText("Check and install").setCta().onClick(() => this.plugin.updateAll(true))
    );
  }
};
