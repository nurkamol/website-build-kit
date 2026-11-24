# Build console

Where a site build stands, read from the site rather than remembered — for Claude Code over MCP,
and (next) for a person in a browser. Kit tooling, never part of `template/`: it is about a
build, and nothing in it reaches a delivered site.

⚠ **Status:** the MCP server works and is tested. The page in `src/` is a **sketch on fixture
data** — it does not talk to the server yet. See `docs/roadmap.md`.

## Connect it to Claude Code

```bash
cd console && npm ci
cd /path/to/client-site
claude mcp add kit -- node /path/to/website-build-kit/console/server/mcp.mjs --site .
```

stdio only — nothing listens on a port.

| Tool | Does |
| --- | --- |
| `kit_status` | Phase from `BUILD-STATE.md`, every gate's last result **and whether it still holds**, blockers, integrations. Read-only. Call it first when resuming |
| `run_gate` | Runs the site's own `npm run <gate>` and records the result against the current tree. Waits up to 40s, then hands back a job id |
| `gate_result` | Polls a job from `run_gate` |

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

**Not available, on purpose:** deploys, `indexnow`, `dns`, `recon`, `shots`, `changes`, `seo`.
They ship, submit, or crawl a live site and write a client's material to disk. Run them yourself.

## Work on it

```bash
npm test          # the server's refusal cases — runs in kit.yml on ubuntu and windows
npm run dev       # the page sketch, http://127.0.0.1:4319
```

Kumo needs Tailwind v4 with the `@source` line in `src/styles.css`, before the Kumo import.
Without it the components render unstyled and nothing reports an error. Kumo's standalone CSS
was tried first and dropped: it carries only the classes Kumo itself uses, so the page's own
layout classes silently do not exist.
