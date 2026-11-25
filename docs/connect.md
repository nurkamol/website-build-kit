# Connect the kit

Step by step, for the three places you can use it. Pick one — they read the same state from the
same site, and you can run all three at once.

| | What you get | Needs |
| --- | --- | --- |
| ✅ **[Claude Code](#1-claude-code-in-the-terminal)** | The skill that runs the build, and the build console's tools | Claude Code, Node 22.19+ |
| **[The page in a browser](#2-the-build-console-in-a-browser)** | The build console for you to look at: phase, gates, blockers, `match` | Node 22.19+, a clone of this repo |
| **[Claude Desktop](#3-claude-desktop)** | The build console's tools in a Desktop chat — not the skill | Claude Desktop, Node 22.19+, and a terminal once for the first setup |

Claude Code is the default because it is the only one that **builds** the site. The other two
watch a build and run its checks.

---

## 1. Claude Code, in the terminal

**1. Install the plugin.** Inside Claude Code, anywhere:

```text
/plugin marketplace add nurkamol/website-build-kit
/plugin install website-build@website-build-kit
```

On Claude Code 2.1.292 or later, the same from your shell in one line:

```bash
claude plugin install website-build --marketplace nurkamol/website-build-kit
```

That installs the skill **and** the build console's MCP server. There is nothing to configure.

**2. Make a site** — or skip this and open one you already have:

```bash
npm create website-build-kit@latest my-site
cd my-site
```

Already made an empty folder? `cd` into it and use `.` instead of `my-site`. From 0.2.2 you can also
start Claude Code in the empty folder and ask it to *make the site here*.

**3. Start Claude Code in the site's folder.** The folder matters: the console reads the site
Claude Code was started in.

```bash
claude
```

The first start installs the console's dependencies, once per version — a few seconds.

**4. Check it is connected.** Type `/mcp`. The kit's server is listed as connected. `/` lists
`website-build`.

**5. Ask.** No command to remember:

```text
Rebuild https://acmeplumbing.com on Astro and Cloudflare.
Where does this build stand?
Run the contact gate.
```

The first is the skill. The other two are the console: Claude calls `kit_status` and `run_gate`
and answers from the site as it is now, not from memory.

**If `/mcp` shows it failed:** run `node --version` — anything under 22.19 is the cause. Then run
`/mcp` again and read the server's log line; the launcher says what it could not do.

**Without the plugin** — a clone of this repo instead, from the site's folder:

```bash
git clone https://github.com/nurkamol/website-build-kit.git ~/coding/website-build-kit
cd ~/coding/website-build-kit && ./install.sh          # the skill
cd /path/to/your-site
claude mcp add kit -- node ~/coding/website-build-kit/console/bin/kit-mcp.mjs   # the console
```

Always the launcher, `bin/kit-mcp.mjs` — never `server/mcp.mjs` directly. The reason is in
[console/README.md](../console/README.md).

---

## 2. The build console, in a browser

The same state, for a person: the phase, every gate and whether its pass still holds, the
blockers, and `match` worst route first. Runs on your machine only.

**1. Get the kit** — skip if you cloned it above:

```bash
git clone https://github.com/nurkamol/website-build-kit.git ~/coding/website-build-kit
```

**2. Install the console**, once:

```bash
cd ~/coding/website-build-kit/console
npm ci
```

**3. Start it, pointed at a site:**

```bash
npm start -- --site /path/to/your-site
```

**4. Open http://127.0.0.1:4319.** It builds the page on first start, so give it a few seconds.

**5. Use it.**

- **Overview** — the phase, how many gates are green **on this tree**, and what needs attention.
  A pass recorded on older code reads *stale*, never passed
- **Gates** — every gate with its last result. **Run** on a row starts it, and the output streams
  in live. A gate Claude Code is running shows here too, and the page will not start a second one
  beside it
- **`match`**, opened from Gates — the rebuild against the live old site, section by section,
  worst route first, with the old | new | diff report a click away
- **Integrations** and **Preserved paths** — each integration and whether it is verified or
  dropped, and the paths other systems point at, both from `BUILD-STATE.md`

`Ctrl+C` in the terminal stops it. Another site is another `--site`.

**It cannot deploy, submit to search engines or crawl a live site** — those are not on its
allowlist at all. It listens on loopback only and refuses requests from any other origin, so
nothing on your network can reach it.

---

## 3. Claude Desktop

The console's tools — `kit_status`, `run_gate`, `gate_result`, and from 0.2.2 `make_site` — in a
Desktop chat. The skill is a Claude Code skill and does not come with it.

### Before you start: a one-time setup in a terminal

Desktop runs the extension for you every time after this. It cannot install Node for you, and an
extension from before 0.2.2 cannot make the site either, so the first time needs a terminal
(Terminal on a Mac, PowerShell on Windows):

**a. Check Node.** It must say v22.19 or later:

```bash
node --version
```

No Node, or older? Install the LTS from [nodejs.org](https://nodejs.org/) (an installer, no
commands) or with `nvm install 24`, then open a new terminal and check again.

**b. Make the site**, if there is not one yet. Into a new folder:

```bash
npm create website-build-kit@latest my-site      # makes my-site/
```

Or into an empty folder you already made. The `.` means *here*:

```bash
cd /path/to/that-folder
npm create website-build-kit@latest .
```

A folder holding only what Finder or Explorer left in it (`.DS_Store`, `Thumbs.db`, `desktop.ini`)
counts as empty. Anything else and it refuses, so it never writes over your work.

**From 0.2.2 you can skip b.** Choose the empty folder in step 3 below, then ask Claude in a chat to
*make the site here*: the `make_site` tool scaffolds it and installs its dependencies, the same as
the command above. The first install downloads a few hundred packages and takes a few minutes; Claude reports
progress and keeps waiting. Step a still applies, because the tool runs on your Node.

### Install the extension

**1. Download** `website-build-kit-<version>.mcpb` from the
[latest release](https://github.com/nurkamol/website-build-kit/releases/latest), under *Assets*.

**2. Double-click it.** Claude Desktop opens the extension's page. Read the warning, then click
**Install**. Desktop shows that warning for every extension it has not verified: the extension runs
on your machine with your permissions. This one reads the site folder you give it, runs that site's
own `npm run` checks, and (from 0.2.2) makes a site only in an empty folder. The source is this
repository, and the file was built from the release tag by `publish.yml`.

**3. Configure it.** The page now says the connector needs configuration. Click **Configure**:

| In the dialog | Do |
| --- | --- |
| *Site folder (required)* | Click **Browse** and pick the site's folder: the one holding its `package.json` and `BUILD-STATE.md`, e.g. the `my-site` from step b. Or paste its full path into *Directory path* |
| **Save** | Greyed out until a folder is chosen. Click it |

⚠ **Pick the site, not this kit's repository.** The kit's own folder has no `BUILD-STATE.md`, so the
extension would install and connect, then report there is no build to read.

**4. Check it is on.** The extension's page shows *All requirements met*, and Settings → Extensions
lists *Website Build Kit — build console*, enabled. If it is off, switch it on there.

**5. Ask in a new chat:**

```text
Where does the build in my site stand?
Run the contact gate and tell me what failed.
Make the site here.            ← from 0.2.2, when the folder is still empty
```

If the folder is empty, Claude says so and how to fill it. Run step b (or, from 0.2.2, ask it to
make the site), then ask again. Nothing needs reconnecting.

**Another site:** Settings → Extensions → the kit → **Configure** → **Browse** to the other folder →
**Save**. Desktop has no project folder of its own, so the site is a setting rather than where you
opened it.

**Node and npm must stay installed.** Desktop starts the server without your shell's PATH, so the
launcher looks in the usual places itself: nvm, Volta, fnm, Homebrew and the official installer.
`kit_status` works without npm; `run_gate` and `make_site` do not.

**claude.ai in a browser cannot use this.** The server runs on your machine and reads files on
disk; only Claude Desktop and Claude Code can start it.

---

## Updating

| | How |
| --- | --- |
| Claude Code plugin | `/plugin marketplace update website-build-kit`, then restart Claude Code |
| Clone | `git pull` in the kit — `install.sh` symlinked, so the skill is current at once — then `npm ci` in `console/` |
| Claude Desktop | Download the new `.mcpb` and double-click it; it replaces the old one |

A site built from the template does not update with the kit — it is a copy.
`npm run check:drift` in the site lists what it is behind on.
