# Forgejo Installer

Install and update Obsidian plugins straight from Forgejo (or Gitea) repositories —
what BRAT does for GitHub, for your self-hosted forge.

## How it works

For each configured repository the plugin fetches `manifest.json`, `main.js` and
(optionally) `styles.css` from the repository root via the Forgejo API raw
endpoint, writes them into `.obsidian/plugins/<plugin-id>/`, and reloads the
plugin. A plugin is reinstalled whenever the version in the repo's
`manifest.json` differs from the installed one.

**Contract for installable plugins**: commit the *built* `manifest.json` and
`main.js` (plus `styles.css` if any) to the repository root. No releases or
CI required.

## Setup

1. Install this plugin with [BRAT](https://github.com/TfTHacker/obsidian42-brat):
   add `Arutyun2312/arudev-obsidian-installer` as a beta plugin. This repo is
   private, so set a GitHub personal access token in BRAT's settings first.
   (Manual alternative: copy `manifest.json` and `main.js` into
   `.obsidian/plugins/forgejo-installer/`.)
2. In the plugin settings set:
   - **Forgejo base URL** — e.g. `https://forgejo.example.com`
   - **API token** — only needed for private repositories
     (scope: `read:repository`)
   - **Repositories** — one `owner/repo` or `owner/repo@branch` per line
3. Run the command **"Check all repositories and install updates"** (or use the
   button in settings, or enable the startup check).

Works on mobile (`requestUrl` is used throughout, no Node APIs).

## Development

```sh
npm install
npm run build   # typecheck + bundle to main.js
npm run dev     # watch mode
```

The built `main.js` is committed so the plugin can install (and update) itself
from this repository.
