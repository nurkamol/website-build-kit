# create-website-build-kit

Scaffold a production marketing site: **Astro, static, on Cloudflare Workers** — with the
gates, the migration playbook and the accessibility work already wired.

```bash
npm create website-build-kit@latest my-site
```

Node 22.12+. It builds green immediately, with no content, no images and no secrets.

## What you get

A skeleton, not a theme. It ships **no palette, no typeface and no home page** — deliberately,
so that two sites built from it cannot look alike. What it does ship is the part that takes
longest to get right and is easiest to get subtly wrong:

- **A form endpoint** with server-side validation, a honeypot, and the lead written to
  durable storage **before** the email provider is called — so a provider outage costs a
  notification, never a lead. It works with JavaScript off.
- **Environment derived from one build variable** — indexability, analytics, canonical host,
  which store leads land in, who gets notified. Nothing toggled by hand at go-live, and a bare
  build with no environment set is refused rather than quietly publishing `localhost`
  canonicals.
- **A media pipeline** — AVIF and WebP per width, a dimensions manifest so nothing shifts,
  favicons rendered from the vector.
- **Verification against the deployed site**, as a gate that exits non-zero: routes, a real
  404, every redirect rule *and whether its target resolves*, security headers, the meta
  sweep, page weight, and the form submissions the API is supposed to refuse.
- **WCAG 2.2 AA as a build constraint** — a published accessibility statement, `pa11y-ci`
  wired up, a reflow check at 320px and 200% text, and a dated evidence pack.
- **A migration path**: inventory the old site, extract its content to markdown, propose a
  redirect map, and fail the build if a URL the old site served no longer resolves.

## Migrating off WordPress?

```bash
npm run recon -- https://old-site.com   # URLs, preserved paths, integrations, DNS
npm run extract                          # captured HTML → clean markdown
npm run redirects                        # proposes a map; never writes it for you
```

Run recon **before** you design routes. For any page builder — Elementor, Divi, WPBakery,
Bricks — the extractable copy is the rendered HTML, never the database.

## The method

The template is half of it. The other half is a Claude Code skill and the written method
behind it, including a file of failures that were **green in a build**: clean build, clean
types, clean deploy, wrong result.

**https://github.com/nurkamol/website-build-kit**

MIT.
