# IntelliDev

A polished, zero-dependency project launcher for Windows. Pick a project under your development root, pick a CLI, IDE, or AI coding agent, confirm, and it opens that tool pointed at the project.

## Run it

```powershell
node index.js
```

or double-click / run:

```powershell
.\devopen.cmd
```

## Open the web UI in one click

Double-click `IntelliDev.lnk` (or run `.\open-web.cmd` from PowerShell). It starts the server silently in the background, waits for the UI to become ready, then opens `http://127.0.0.1:8787` in your default browser.

When the browser session is closed, the background server stops itself after a short heartbeat timeout. No console window is left behind.

The web UI includes a command palette, project search, pinned projects, recent launches, tool cards, compliance scan, code check, cleanup preview, and new-project scaffold.

## Docker

The web UI can run in a Linux container for browsing, compliance scans, and read-only inspection:

```powershell
docker compose up --build
```

Then open `http://localhost:8787`.

The compose file mounts `D:/TMK75 - Development` read-only at `/workspace`. Launching Windows editors, terminals, and AI agents is intentionally disabled inside the container; run the native `IntelliDev` command for those actions.

## Commands

| Command | What it does |
| --- | --- |
| `node index.js` | Interactive picker: project → tool → confirm → launch |
| `node index.js list` | List projects with Git branch/dirty state and secret-file hints |
| `node index.js tools` | List detected CLIs/IDEs/agents and their resolved paths |
| `node index.js providers` | Show AI providers and current routing |
| `node index.js provider` | Interactively set an editor/agent's provider |
| `node index.js compliance <name>` | Run a CSL/DSL/PIPL code-level check on a project |
| `node index.js web` | Start the browser UI on `http://localhost:8787` |
| `node index.js profile` | List identity profiles |
| `node index.js profile add <name> <gitName> <gitEmail>` | Add an identity profile |
| `node index.js profile <name>` | Set the default profile |
| `node index.js favorite <name>` | Toggle a project favorite |
| `node index.js stats` | Show your own launch usage |
| `node index.js gh <name>` | Open the project's GitHub remote in your browser |

## How it works

- **Projects** come from `config.json` → `developmentRoot`, excluding folders in `excludeFolders`.
- **Tools** are declared in `tools.json`. Each entry has detection paths and a launch template. Detection resolves `%VAR%` environment variables and shows a tool only if its executable exists.
- **Launch kinds** are:
  - `terminal` — opens a new window with the project as working directory.
  - `ide` — opens the project folder in the editor.
  - `agent` — runs the interactive AI CLI in the current console with the project as its working directory.
- **Providers** are declared in `providers.json`. Routing is stored in `config.json` → `providerRouting`. Tools with a native model (QoderCN → Qwen, Grok → xAI) have sensible defaults; override with `provider`.
- **Git** is surfaced read-only (branch, ahead/behind, dirty count). The launcher does not commit or push; do that in the tool you launch or the `git`/`gh` CLI.
- **Security** scan flags obvious secrets (`*.pem`, `*.key`, `id_rsa`, API-key CSVs, `.env`) inside a project before launching.
- **Compliance** check is a heuristic CSL/DSL/PIPL scanner. The project list shows a checkbox (`comp:☐` not enabled, `comp:☑` framework enabled, `comp:⚠` high-risk signals). Run `devopen compliance <name>` for a full report. Toggle with `complianceCheck` in `config.json`.
- **State** lives in `state.json` (auto-created): last launch, favorites, and a rolling usage log. It is git-ignored.
- **Profiles** let you set Git author identity and extra environment variables per launch target.

## Editing the tool list

Add a new tool by appending to `tools.json`:

```json
{
  "id": "my-tool",
  "label": "My Tool",
  "kind": "ide",
  "detect": ["C:\\Path\\To\\my-tool.exe"],
  "launch": {
    "type": "exe-folder",
    "exe": "C:\\Path\\To\\my-tool.exe",
    "args": ["{project}"]
  }
}
```

Supported `launch.type` values: `wt`, `powershell`, `cmd`, `git-bash`, `wsl`, `cmd-folder`, `exe-folder`, `agent`.

## Notes

- `code` on this machine resolves to **QoderCN**, a VS Code fork with Qwen built in. It is labeled accordingly.
- Some Electron editors (Kiro, Antigravity, Qwen) may not accept a folder argument; the launcher passes the path and also sets the process working directory as a fallback. If one behaves oddly, remove its `args` entry.
- For DeepSeek/Qwen in a stock VS Code-style editor, install Cline, Roo Code, or Continue and point it at the `baseUrl` shown by `providers`. The launcher records routing but does not modify editor internals.
