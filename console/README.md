# Build console

Where a site build stands, read from the site rather than remembered — for Claude Code over MCP,
and for a person in a browser. Kit tooling, never part of `template/`: it is about a build, and
nothing in it reaches a delivered site.

⚠ **Status:** working and tested, not yet used on a real build. See `docs/roadmap.md`.

Step by step for Claude Code, the browser and Claude Desktop: [docs/connect.md](../docs/connect.md).

## Open the page

```bash
cd console && npm ci
npm start -- --site /path/to/client-site     # builds the page, serves http://127.0.0.1:4319
```

Dark by default; the toggle in the sidebar remembers a choice. The page and the MCP server are
separate processes sharing one ledger, lock and live log on disk — so a gate Claude Code runs
shows up on the page while it runs, and the page refuses to start a second one alongside it.

## Connect it to Claude Code

**With the plugin, there is nothing to do.** `/plugin install website-build@website-build-kit`
declares this server in `.claude-plugin/plugin.json`; open Claude Code in a site's directory and
`kit_status` reads that site.

**Without it**, from the site's directory — `--scope project` instead writes it to the site's
`.mcp.json`, which carries this machine's path, so keep it out of a shared repository:

```bash
claude mcp add kit -- node /path/to/website-build-kit/console/bin/kit-mcp.mjs
```

Always start it through `bin/kit-mcp.mjs`, never `server/mcp.mjs` directly. The launcher installs
this directory's dependencies on first run — a plugin install copies files and runs nothing here,
so a bare `server/mcp.mjs` dies on its first import and Claude Code shows the server as *failed*
with no reason — and finds the site from `--site`, `KIT_SITE`, `CLAUDE_PROJECT_DIR` or the working
directory, in that order. ⚠ Stdout is the protocol: everything the install prints goes to stderr.

**Claude Desktop:** the release carries `website-build-kit-<version>.mcpb` — double-click it and pick
the site's folder. The first time needs a terminal for Node 22.19+ and, before 0.2.2, for
`npm create website-build-kit` — from 0.2.2 `make_site` makes the site in an empty folder instead. Step
by step: [docs/connect.md](../docs/connect.md) §3. Desktop has no project directory, so the folder is a setting; another site means
changing it. `npm run build:mcpb` at the kit's root builds the same file into `dist-mcpb/`, holding
only the server and its two runtime dependencies (3.7 MB, not the page's React and Kumo).

⚠ **An app launched from the Dock has no shell PATH.** Desktop runs the server on its built-in Node
with `/usr/bin:/bin:/usr/sbin:/sbin` — so `kit_status` worked and every `run_gate` died at its first
`npm`. The launcher appends nvm's default, Volta, fnm, Homebrew and the official installer's
directories when npm or git is missing, never ahead of what the PATH already finds.

stdio only — nothing listens on a port.

| Tool | Does |
| --- | --- |
| `kit_status` | Phase from `BUILD-STATE.md`, every gate's last result **and whether it still holds**, blockers, integrations. Read-only. Call it first when resuming |
| `run_gate` | Runs the site's own `npm run <gate>` and records the result against the current tree. Waits up to 40s, then hands back a job id |
| `gate_result` | Polls a job from `run_gate` |
| `make_site` | Scaffolds a new site into the configured folder and installs it: `npm create website-build-kit` without a terminal, at this server's own version, never `@latest`. **Only into an empty folder**: `.DS_Store`, `Thumbs.db` and `desktop.ini` do not count, anything else is refused, and so is a folder that is already a site. The install takes minutes, so it runs in the background; calling it again reports progress and never starts a second |

## What a status means

| Status | Means |
| --- | --- |
| **pass** / **warn** | Ran on exactly this tree — HEAD plus every uncommitted change |
| **stale** | Passed, on a different tree. Not a pass. `behind` says how many commits |
| **fail** | The last run failed. Stays failed on a newer tree until a run passes |
| **never** | No record on this machine |

Results live in the site's `node_modules/.cache/website-build-kit/gates.json` — per machine, and
gone with a clean install. A result nobody can reproduce reads as **never**, which is correct.

**Gates that read `dist/`** (`tells`, `check:alt`, `check:copy`, `check:form`, `check:sitemap`)
rebuild first unless a staging build passed on the same tree. `dist/` is gitignored, so no
fingerprint can tell a stale one from a fresh one.

**`match` — how close the rebuild is to the old site.** It takes `old` and `new` (staging, or
`http://localhost:4321` beside `astro dev`), compares every route section by section in pixels and
in words, and takes minutes — over MCP it hands back a job id. The result carries a parity summary
(worst routes first, the failures, the thresholds), and the page links the old | new | diff
report it wrote to `shots/match/`, which every site ignores, so the run cannot change the tree
it is recorded against. An older `match.json` is never shown as this run's result.

**Not available, on purpose:** deploys, `indexnow`, `dns`, `recon`, `shots`, `changes`, `seo`.
They ship, submit, or copy a client's site into the project. Run them yourself.

## Work on it

```bash
npm test                                # refusal cases — runs in kit.yml on ubuntu and windows
node server/http.mjs --site ../template   # the API on 4319, without rebuilding the page
npm run dev                             # the page with hot reload on 4318; /api goes to 4319
```

The page server answers loopback `Host` names only (DNS rebinding) and refuses a POST without an
`X-Kit-Console` header (a cross-origin request carrying one needs a preflight it never gets).
Both have refusal cases.

Kumo needs Tailwind v4 with the `@source` line in `src/styles.css`, before the Kumo import.
Without it the components render unstyled and nothing reports an error. Kumo's standalone CSS
was tried first and dropped: it carries only the classes Kumo itself uses, so the page's own
layout classes silently do not exist.
