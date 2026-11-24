# Build console

Where a site build stands, read from the site rather than remembered — for Claude Code over MCP,
and for a person in a browser. Kit tooling, never part of `template/`: it is about a build, and
nothing in it reaches a delivered site.

⚠ **Status:** working and tested, not yet used on a real build. See `docs/roadmap.md`.

## Open the page

```bash
cd console && npm ci
npm start -- --site /path/to/client-site     # builds the page, serves http://127.0.0.1:4319
```

Dark by default; the toggle in the sidebar remembers a choice. The page and the MCP server are
separate processes sharing one ledger, lock and live log on disk — so a gate Claude Code runs
shows up on the page while it runs, and the page refuses to start a second one alongside it.

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
