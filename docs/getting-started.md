# Getting started

Installing the kit, and the mechanical setup of a new site. For running an actual project
end to end, see [how-to-start.md](how-to-start.md).

## Install

```bash
git clone git@github.com:nurkamol/website-build-kit.git ~/coding/website-build-kit
cd ~/coding/website-build-kit
./install.sh              # symlinks — updates when you pull
./install.sh --copy       # copies instead, if you prefer snapshots
```

Verify: open any project in Claude Code and type `/` — `website-build` should be listed.

Because `install.sh` symlinks by default, `git pull` in the kit updates every project at once.
That is usually what you want; use `--copy` if you would rather pin a version.

## Use

```
/website-build https://old-site.com     # migration — recon runs before any question
/website-build "Acme Plumbing"          # greenfield
/website-build                          # it will ask
```

The skill also matches on description, so "rebuild this WordPress site on Astro", "migrate us
off Elementor" or "does our site meet WCAG?" picks it up without the command.

## What happens

1. **"Is there anything to import?"** — asked first, on its own
2. **Recon** — if given a URL: sitemap, rendered HTML, source builder, SEO plugin export,
   template families, forms, integrations, accessibility baseline, unpublished drafts
3. **Three discovery rounds** — the business and the one action that counts as a win; scope,
   content, integrations, providers and which laws apply; design direction and mobile
4. **Spec** — restated for confirmation before any code
5. **Build** — phases with gates, from `template/` if the stack is the default
6. **Verify** — against the deployed site, not the build
7. **Go live** — cutover in order, then watch the first week
8. **Hand over** — architecture, configuration, content guide, runbook, traps

---

## Setting up a new site from the template

```bash
npx degit nurkamol/website-build-kit/template my-site
cd my-site && npm install
```

**Node 22.12+ is required** — `.node-version` pins the version this was built against.

Then, in order. Each step is read by everything after it:

1. **`src/data/business.ts`** — name, phone, address, hours, service areas. Everything else
   reads from it, including the structured data
2. **`src/data/services.ts`**, `areas.ts`, `categories.ts` — on a migration, category slugs must
   match the source CMS exactly or every `/category/<slug>/` URL breaks
3. **`src/styles/tokens.css`** — brand colours and the type scale
4. **`src/data/site.ts`** — `PRODUCTION_HOSTS`, and the client's **own** analytics IDs. Leave
   them empty rather than inheriting an ID from another project
5. **`wrangler.jsonc`** — worker name, and real KV namespace ids:
   ```bash
   npx wrangler kv namespace create "<site>-leads"
   npx wrangler kv namespace create "<site>-leads-staging"
   ```
   Paste the ids in. An undeclared binding is auto-created on deploy, which works exactly once
6. **`package.json`** — the staging and production URLs in the build scripts
7. **`src/pages/accessibility.astro`** — the statement's dates, known gaps and contact route
8. **Brand assets** into `media/source/brand/`, then `npm run media`

```bash
npm run recon -- https://old-site.com        # on a migration, BEFORE designing routes
npm run dev                                  # layout and content work
npm run tells                                # what is undecided, and the design tells
npm run check                                # types — a bad edit should fail the build
npm run build:staging && npx wrangler dev    # real bindings, forms, redirects, 404s
npm run verify -- https://new.example.com    # the DEPLOYED site. exits non-zero
npm run a11y                                 # accessibility check, one URL per family
npm run handover                             # docs/handover.md → PDF, for the client
```

Use `wrangler dev` for anything touching `/api/*`, redirects or status codes — the Astro dev
server models none of them, and they are exactly where things break.

## Secrets

```bash
npx wrangler secret put BREVO_API_KEY
npx wrangler secret put LEADS_EXPORT_TOKEN     # openssl rand -base64 32
```

Locally, copy `.dev.vars.example` to `.dev.vars` — gitignored. Never the repo, never chat.

## Then

The template's own `docs/runbook.md` carries the verification matrix, the go-live order and the
first-week watch list, with the commands filled in.
