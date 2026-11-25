import { useEffect, useState } from 'react';
import { Badge, ClipboardText, LinkButton, Tabs } from '@cloudflare/kumo';
import {
  ArrowRightIcon,
  BrowsersIcon,
  CheckCircleIcon,
  ClockCounterClockwiseIcon,
  FolderLockIcon,
  GithubLogoIcon,
  ListChecksIcon,
  MoonIcon,
  PlugsConnectedIcon,
  SquareSplitHorizontalIcon,
  SunIcon,
  TerminalWindowIcon,
  XCircleIcon,
} from '@phosphor-icons/react';

const REPO = 'https://github.com/nurkamol/website-build-kit';
const VERSION = '0.2.1';
/* The console's eyebrow names the release it arrived in, not the current one. */
const CONSOLE_SINCE = '0.2.0';
const MCPB = `${REPO}/releases/download/v${VERSION}/website-build-kit-${VERSION}.mcpb`;
/* ⚠ A PLAIN RELATIVE PATH, NOT import.meta.env.BASE_URL. The server-render build resolved the
   base to "/", so the prerendered page asked for /showcase/… — the domain root, not the project
   path GitHub Pages serves it under — and every screenshot 404'd on the live site while the gate,
   which fetched the files by their own path, passed. React keeps the server's attribute on
   hydration, so it never corrected itself. pages.yml now resolves every src the page USES. */
const img = (name) => `showcase/${name}.webp`;

// ── Content ──────────────────────────────────────────────────────────────────

const FAILURES = [
  ['A migration that dropped 15 of 18 pages', 'Every route the new site emitted returned 200, so verification passed. Nothing compared the new site against the old site’s inventory.'],
  ['Every blog date one day early', 'toLocaleDateString with no timezone formats in the build machine’s zone. Correct in London, wrong in Los Angeles, same commit.'],
  ['Moving the apex killed the client’s email', 'MX left behind in the old zone. Bounces go to the sender, so the people who find out cannot tell the client.'],
  ['A bare CI build published localhost canonicals', 'No environment set, no error, no warning. The bundler ran perfectly and the site told Google it lived on localhost.'],
  ['The last client’s analytics on a new site', 'An inherited container ID in the template sent a real business’s traffic to another company’s property, for weeks.'],
  ['A skip link that scrolled but never moved focus', 'The page jumps, so it looks like it worked. Keyboard users land back in the navigation.'],
  ['Disallow: / and noindex cancelling out', 'A blocked crawler never fetches the page, so it never reads the noindex — and the staging URL gets indexed anyway.'],
  ['A mega-menu compared closed against closed', 'The parity check hovered the menu and measured its toggle button instead of the panel. A menu that lost a whole column passed at 0%.'],
];

const SHOTS = [
  { value: 'overview', label: 'Overview', alt: 'The build console overview: phase 7 of 10 in progress, 10 of 17 gates green on this tree, a failed contact check and a stale form check needing attention, and the blockers from BUILD-STATE.md.' },
  { value: 'match', label: 'Visual parity', alt: 'The match gate: seven routes of the rebuild compared against the old site, worst first — /services/ 7.8% of a section different, past the 3% tolerance — with a link to the old, new and diff report.' },
  { value: 'gate', label: 'Gate output', alt: 'A gate opened in the console: which commit it ran on, that it is current against this tree, how long it took, and its output in a terminal panel.' },
  { value: 'running', label: 'Live run', alt: 'A gate running live: its output streams into a panel at the bottom of the console while the rest of the page stays current.' },
  { value: 'overview-light', label: 'Light', alt: 'The same overview in light mode.' },
];

const CONSOLE_FEATURES = [
  { icon: ClockCounterClockwiseIcon, title: 'Stale is not passed', body: 'Every gate is recorded against a fingerprint of the site as it is — committed and uncommitted. A pass on any other tree reads stale, with how many commits behind, and the phase cannot close on it.' },
  { icon: SquareSplitHorizontalIcon, title: 'Visual parity, worst first', body: 'match compares the rebuild with the live old site section by section, in pixels and in words, including the open menu, the hover dropdowns and the scrolled header. The worst routes come first, against the tolerance line.' },
  { icon: TerminalWindowIcon, title: 'Paired with Claude Code', body: 'An MCP server gives Claude the same state the page shows — kit_status, run_gate, gate_result. A gate Claude runs streams onto the page live, and the page will not start a second one beside it.' },
];

const RECON_FEATURES = [
  { icon: BrowsersIcon, title: 'Knows what it is migrating from', body: 'WordPress with its page builder, Squarespace, Wix, Webflow, Shopify, Ghost, Drupal, Joomla, Framer — named with the evidence that gave it away, for the client to confirm.' },
  { icon: PlugsConnectedIcon, title: 'Reads the plugins', body: 'Every WordPress plugin visible in the markup, with the data it holds and the export to ask for: SEO titles and redirects, form fields, snippets nobody remembers adding, ACF field groups.' },
  { icon: FolderLockIcon, title: 'A place for what the owner sends', body: 'client-files/ — inside the project so the build can read it, ignored by git so a backup is never committed, and refused outright on a site whose .gitignore would let it through.' },
];

const IN_THE_BOX = [
  'Form endpoint with durable storage written before the email provider is called',
  'One build variable deriving indexability, analytics, canonical host and lead routing',
  'Verification against the deployed site, as a gate that exits non-zero',
  'WCAG 2.2 AA as a build constraint, with a dated evidence pack',
  'Migration path: inventory, extract to markdown, propose redirects, fail on a lost URL',
  'AVIF and WebP per width, with a manifest so nothing shifts',
];
const ABSENT = [
  'A palette, a typeface, a home page or a hero treatment',
  'A component library or a design system',
  'A CMS — one gets picked per project, not per template',
  'Testimonials, pricing tables and galleries; those are project-shaped',
  'Any provider recommendation that has not shipped on a real deploy',
];

// ── Pieces ───────────────────────────────────────────────────────────────────

/*
 * ⚠ NO CONTROL THAT LOOKS LIVE WITH JAVASCRIPT OFF. The page is prerendered, so anything
 *   rendered on the server is on screen before — and without — React. A copy button, a mode
 *   toggle or a tab strip that does nothing is worse than none, so they render only once
 *   hydrated; until then a command is plain text and the showcase shows its first picture.
 */
function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}

function ModeToggle() {
  const hydrated = useHydrated();
  const [mode, setMode] = useState('dark');
  useEffect(() => setMode(document.documentElement.dataset.mode || 'dark'), []);
  if (!hydrated) return null;
  const next = mode === 'dark' ? 'light' : 'dark';
  const flip = () => {
    document.documentElement.dataset.mode = next;
    try { localStorage.setItem('kit-site-mode', next); } catch { /* a preference, not state */ }
    setMode(next);
  };
  return (
    <button
      type="button"
      onClick={flip}
      aria-label={`Switch to ${next} mode`}
      className="grid size-9 place-items-center rounded-lg text-kumo-strong ring-1 ring-kumo-hairline transition-colors hover:bg-kumo-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kumo-focus"
    >
      {mode === 'dark' ? <SunIcon size={17} aria-hidden="true" /> : <MoonIcon size={17} aria-hidden="true" />}
    </button>
  );
}

function Eyebrow({ children }) {
  return <p className="m-0 text-xs font-medium uppercase tracking-[0.12em] text-kumo-subtle">{children}</p>;
}

function SectionHead({ id, eyebrow, title, lead }) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 id={id} className="mt-3 mb-0 text-3xl font-semibold tracking-tight text-kumo-default sm:text-4xl">{title}</h2>
      {lead && <p className="mx-auto mt-4 mb-0 max-w-2xl text-base leading-relaxed text-kumo-strong sm:text-lg">{lead}</p>}
    </div>
  );
}

function Card({ icon: Icon, title, children }) {
  return (
    <div className="rounded-xl bg-kumo-base p-6 ring-1 ring-kumo-hairline">
      {Icon && (
        <div className="mb-4 grid size-10 place-items-center rounded-lg bg-kumo-elevated ring-1 ring-kumo-hairline">
          <Icon size={20} className="text-kumo-default" aria-hidden="true" />
        </div>
      )}
      <h3 className="m-0 text-base font-semibold tracking-tight text-kumo-default">{title}</h3>
      <p className="mt-2 mb-0 text-sm leading-relaxed text-kumo-strong">{children}</p>
    </div>
  );
}

function Shot({ name, alt, eager, height = 1000 }) {
  return (
    <figure className="shot m-0 bg-kumo-base shadow-2xl ring-1 ring-kumo-line">
      <div aria-hidden="true" className="flex items-center gap-1.5 border-b border-kumo-hairline bg-kumo-elevated px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-kumo-fill" />
        <span className="size-2.5 rounded-full bg-kumo-fill" />
        <span className="size-2.5 rounded-full bg-kumo-fill" />
        <span className="ml-3 font-mono text-[11px] text-kumo-subtle">127.0.0.1:4319</span>
      </div>
      <img src={img(name)} alt={alt} width="1600" height={height} loading={eager ? 'eager' : 'lazy'} decoding="async" />
    </figure>
  );
}

/* A command wraps rather than truncates: on a phone, an install command cut off with an
   ellipsis hides the part you have to read. The copy button still copies all of it.
   min-w-0 on the text, because a flex item's minimum width is its content's — without it
   the field pushed a 768px page to 870px. */
function Command({ label, text }) {
  const hydrated = useHydrated();
  return (
    <div className="min-w-0">
      {label && <p className="mt-0 mb-2 text-xs font-medium text-kumo-subtle">{label}</p>}
      {!hydrated ? (
        <code className="block rounded-lg bg-kumo-base px-4 py-2 text-sm leading-snug break-all text-kumo-default ring ring-kumo-line">{text}</code>
      ) : (
      <ClipboardText
        text={text}
        size="base"
        className="h-auto min-h-9 w-full items-stretch [&>span]:min-w-0 [&>span]:py-2 [&>span]:break-all [&>span]:whitespace-normal [&>span]:leading-snug"
      />
      )}
    </div>
  );
}

/* Numbered steps as a real <ol> with the browser's own markers. ⚠ Not a ::before badge: a
   positioned pseudo-element with a background left axe unable to tell what sat behind the
   <code> and <strong> beside it, and pa11y counts "needs review" as a failure. */
function Steps({ children }) {
  return <ol className="mt-5 mb-0 grid list-decimal gap-4 pl-5 marker:font-semibold marker:text-kumo-default">{children}</ol>;
}

function Step({ children }) {
  return <li className="min-w-0 pl-1 text-sm leading-relaxed text-kumo-strong">{children}</li>;
}

function ConnectCard({ icon: Icon, title, lead, children }) {
  return (
    <div className="min-w-0 rounded-xl bg-kumo-base p-6 ring-1 ring-kumo-hairline">
      <div className="flex items-center gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-kumo-elevated ring-1 ring-kumo-hairline">
          <Icon size={20} className="text-kumo-default" aria-hidden="true" />
        </div>
        <h3 className="m-0 text-base font-semibold tracking-tight text-kumo-default">{title}</h3>
      </div>
      <p className="mt-3 mb-0 text-sm leading-relaxed text-kumo-strong">{lead}</p>
      {children}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function App() {
  const hydrated = useHydrated();
  // The hero already shows the overview; the showcase opens on what it cannot show.
  const [shot, setShot] = useState('match');
  const current = SHOTS.find((s) => s.value === shot);

  return (
    <div className="min-h-screen bg-kumo-canvas text-kumo-default">
      <a href="#main" className="skip absolute left-4 top-4 z-50 rounded-md bg-kumo-contrast px-3 py-2 text-sm text-kumo-inverse">Skip to content</a>

      <header className="sticky top-0 z-40 border-b border-kumo-hairline bg-kumo-canvas/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <a href="./" className="flex items-center gap-2.5 text-kumo-default no-underline">
            <span aria-hidden="true" className="grid size-8 place-items-center rounded-lg bg-kumo-contrast text-kumo-inverse">
              <ListChecksIcon size={17} weight="bold" />
            </span>
            <span className="text-sm font-semibold tracking-tight">website-build-kit</span>
          </a>
          <nav aria-label="Sections" className="hidden items-center gap-6 text-sm md:flex">
            <a href="#console" className="text-kumo-strong no-underline hover:text-kumo-default">The console</a>
            <a href="#failures" className="text-kumo-strong no-underline hover:text-kumo-default">The failures</a>
            <a href="#install" className="text-kumo-strong no-underline hover:text-kumo-default">Connect</a>
            <a href="#ships" className="text-kumo-strong no-underline hover:text-kumo-default">What it ships</a>
          </nav>
          <div className="flex items-center gap-2">
            <a href={REPO} aria-label="website-build-kit on GitHub" className="grid size-9 place-items-center rounded-lg text-kumo-strong ring-1 ring-kumo-hairline hover:bg-kumo-tint">
              <GithubLogoIcon size={18} aria-hidden="true" />
            </a>
            <ModeToggle />
          </div>
        </div>
      </header>

      <main id="main">
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section aria-labelledby="hero-title" className="relative overflow-hidden">
          <div className="mx-auto max-w-6xl px-4 pt-16 pb-10 text-center sm:px-6 sm:pt-24">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Badge variant="primary">New in {VERSION}: the build console</Badge>
              <Badge variant="outline">Astro · Cloudflare Workers · Claude Code</Badge>
            </div>
            <h1 id="hero-title" className="mx-auto mt-6 mb-0 max-w-4xl text-4xl font-semibold tracking-tight text-kumo-default sm:text-6xl">
              Your build was green.<br />The site was wrong.
            </h1>
            <p className="mx-auto mt-6 mb-0 max-w-2xl text-base leading-relaxed text-kumo-strong sm:text-lg">
              A method for shipping production marketing sites, a catalogue of 45 failures that passed every check on
              the way out — clean build, clean types, clean deploy, wrong result — and a console that shows which checks
              still hold for the code as it is now.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <LinkButton href="#install" variant="primary" size="lg">Get started</LinkButton>
              <LinkButton href="#console" variant="secondary" size="lg">See the console</LinkButton>
            </div>
          </div>
          <div className="glow mx-auto max-w-6xl px-4 pt-6 pb-20 sm:px-6">
            <Shot name="overview-hero" alt={SHOTS[0].alt} height={722} eager />
          </div>
        </section>

        {/* ── The console ──────────────────────────────────────────────── */}
        <section aria-labelledby="console" className="border-t border-kumo-hairline py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHead
              id="console"
              eyebrow={`New in ${CONSOLE_SINCE}`}
              title="A build you can see, and Claude can read"
              lead="A build spans weeks and more sessions than a context window holds. The console reads where it stands from the site itself — the phase, every gate, the blockers — so nobody resumes from memory, and no tick outlives the code it vouched for."
            />
            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {CONSOLE_FEATURES.map((f) => <Card key={f.title} icon={f.icon} title={f.title}>{f.body}</Card>)}
            </div>

            <div className="mt-14">
              {/* The strip scrolls inside itself on a phone; the page never gains a second axis. */}
              {hydrated && (
                <div className="mb-5 overflow-x-auto pb-1">
                  <div className="mx-auto w-max">
                    <Tabs variant="segmented" value={shot} onValueChange={setShot} tabs={SHOTS.map(({ value, label }) => ({ value, label }))} />
                  </div>
                </div>
              )}
              <Shot name={current.value} alt={current.alt} />
              <p className="mx-auto mt-4 mb-0 max-w-3xl text-center text-sm text-kumo-subtle">{current.alt}</p>
            </div>

            <div className="mx-auto mt-14 max-w-3xl rounded-xl bg-kumo-base p-6 ring-1 ring-kumo-hairline">
              <h3 className="m-0 text-base font-semibold text-kumo-default">Run it beside a build</h3>
              <div className="mt-5 grid gap-5">
                <Command label="The page, at 127.0.0.1:4319" text="cd console && npm ci && npm start -- --site /path/to/client-site" />
                <Command label="The same state, for Claude Code — already there with the plugin; without it" text="claude mcp add kit -- node /path/to/website-build-kit/console/bin/kit-mcp.mjs" />
              </div>
              <p className="mt-5 mb-0 text-sm leading-relaxed text-kumo-subtle">
                Deploys, search-engine submission and live-site crawls are not on its allowlist — they are absent, not
                hidden behind a confirmation. Bound to loopback; refuses a request from any other origin.
              </p>
            </div>
          </div>
        </section>

        {/* ── Recon ────────────────────────────────────────────────────── */}
        <section aria-labelledby="recon" className="border-t border-kumo-hairline bg-kumo-elevated py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHead
              id="recon"
              eyebrow="Also new"
              title="Detect first, ask second"
              lead="The crawl sees the old site as it is today. What it cannot see — drafts, original images, the redirect table, a snippet added for last spring's campaign — recon now asks the owner for, platform by platform, with the reason on every line."
            />
            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {RECON_FEATURES.map((f) => <Card key={f.title} icon={f.icon} title={f.title}>{f.body}</Card>)}
            </div>
          </div>
        </section>

        {/* ── Failures ─────────────────────────────────────────────────── */}
        <section aria-labelledby="failures" className="border-t border-kumo-hairline py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHead
              id="failures"
              eyebrow="45 documented"
              title="Every one of these shipped"
              lead="Not hypotheticals, and not general advice. Each failed silently on a real rebuild — the compiler was happy, the deploy was clean, and nothing anywhere reported it."
            />
            <ul className="mt-12 grid list-none gap-4 p-0 sm:grid-cols-2">
              {FAILURES.map(([title, body]) => (
                <li key={title} className="rounded-xl bg-kumo-base p-6 ring-1 ring-kumo-hairline">
                  <div className="flex items-start gap-3">
                    <XCircleIcon size={20} weight="fill" className="mt-0.5 shrink-0 text-kumo-danger" aria-hidden="true" />
                    <div>
                      <h3 className="m-0 text-base font-semibold tracking-tight text-kumo-default">{title}</h3>
                      <p className="mt-2 mb-0 text-sm leading-relaxed text-kumo-strong">{body}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-10 text-center">
              <LinkButton href={`${REPO}/blob/master/skills/website-build/references/traps.md`} variant="secondary">
                Read all of them <ArrowRightIcon size={14} aria-hidden="true" />
              </LinkButton>
            </div>
          </div>
        </section>

        {/* ── Connect ──────────────────────────────────────────────────── */}
        <section aria-labelledby="install" className="border-t border-kumo-hairline bg-kumo-elevated py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHead
              id="install"
              eyebrow="Get started"
              title="Connect it where you work"
              lead="Claude Code builds the site. The page in a browser and Claude Desktop watch the same build and run its checks. All three read the same site, and you can run them side by side."
            />
            <div className="mt-12 grid gap-4 lg:grid-cols-3">
              <ConnectCard icon={TerminalWindowIcon} title="Claude Code, in the terminal" lead="The skill and the console's tools in one install. Nothing to configure.">
                <Steps>
                  <Step>
                    Install the plugin, inside Claude Code:
                    <div className="mt-2 grid gap-2">
                      <Command text="/plugin marketplace add nurkamol/website-build-kit" />
                      <Command text="/plugin install website-build@website-build-kit" />
                    </div>
                  </Step>
                  <Step>
                    Make a site, or use one you have:
                    <div className="mt-2"><Command text="npm create website-build-kit@latest my-site" /></div>
                  </Step>
                  <Step>
                    Start Claude Code <strong className="text-kumo-default">in the site's folder</strong> — that is the site it reads:
                    <div className="mt-2"><Command text="cd my-site && claude" /></div>
                  </Step>
                  <Step><code>/mcp</code> lists the kit's server as connected.</Step>
                  <Step>Ask: <em>"Rebuild https://acmeplumbing.com on Astro"</em>, or <em>"Where does this build stand?"</em></Step>
                </Steps>
              </ConnectCard>

              <ConnectCard icon={BrowsersIcon} title="The console, in a browser" lead="Phase, gates, blockers and match, for a person. On your machine only.">
                <Steps>
                  <Step>
                    Get the kit:
                    <div className="mt-2"><Command text="git clone https://github.com/nurkamol/website-build-kit.git" /></div>
                  </Step>
                  <Step>
                    Install the console, once:
                    <div className="mt-2"><Command text="cd website-build-kit/console && npm ci" /></div>
                  </Step>
                  <Step>
                    Start it, pointed at a site:
                    <div className="mt-2"><Command text="npm start -- --site /path/to/your-site" /></div>
                  </Step>
                  <Step>Open <code>http://127.0.0.1:4319</code>. Run a gate from its row; one Claude Code runs shows up live.</Step>
                </Steps>
              </ConnectCard>

              <ConnectCard icon={PlugsConnectedIcon} title="Claude Desktop" lead="The console's three tools in a Desktop chat. One file, no terminal.">
                <Steps>
                  <Step>
                    Download the extension:
                    <div className="mt-2">
                      <LinkButton href={MCPB} variant="secondary">website-build-kit-{VERSION}.mcpb</LinkButton>
                    </div>
                  </Step>
                  <Step>Double-click it, and click <strong className="text-kumo-default">Install</strong> in Claude Desktop. Its unverified-extension warning appears for every extension.</Step>
                  <Step>Click <strong className="text-kumo-default">Configure</strong>, then <strong className="text-kumo-default">Browse</strong> to the site's folder (the one holding <code>BUILD-STATE.md</code>), then <strong className="text-kumo-default">Save</strong>.</Step>
                  <Step>Ask in a new chat: <em>"Where does the build in my site stand?"</em></Step>
                </Steps>
                <p className="mt-5 mb-0 text-xs leading-relaxed text-kumo-subtle">
                  Running gates needs Node and npm on the machine. nvm, Volta, Homebrew and the official installer are found on their own.
                </p>
              </ConnectCard>
            </div>
            <div className="mt-10 flex justify-center">
              <LinkButton href={`${REPO}/blob/master/docs/connect.md`} variant="secondary">
                Every step, with what to check <ArrowRightIcon size={14} aria-hidden="true" />
              </LinkButton>
            </div>
          </div>
        </section>

        {/* ── What it ships ────────────────────────────────────────────── */}
        <section aria-labelledby="ships" className="border-t border-kumo-hairline py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHead
              id="ships"
              eyebrow="The template"
              title="A skeleton, not a theme"
              lead="It ships no palette, no typeface and no home page — deliberately, so that two sites built from it cannot look alike. What it does ship is the part that takes longest to get right and is easiest to get subtly wrong."
            />
            <div className="mt-12 grid gap-4 md:grid-cols-2">
              {[['In the box', IN_THE_BOX, CheckCircleIcon, 'text-kumo-success'], ['Deliberately absent', ABSENT, XCircleIcon, 'text-kumo-subtle']].map(([title, items, Icon, tone]) => (
                <div key={title} className="rounded-xl bg-kumo-base p-6 ring-1 ring-kumo-hairline">
                  <h3 className="m-0 text-base font-semibold text-kumo-default">{title}</h3>
                  <ul className="mt-4 mb-0 grid list-none gap-3 p-0">
                    {items.map((t) => (
                      <li key={t} className="flex gap-3 text-sm leading-relaxed text-kumo-strong">
                        <Icon size={18} weight="fill" className={`mt-0.5 shrink-0 ${tone}`} aria-hidden="true" />
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-kumo-hairline py-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 text-sm text-kumo-subtle sm:px-6">
          <p className="m-0">MIT licensed. Extracted from real WordPress rebuilds onto Astro and Cloudflare Workers. Version {VERSION}.</p>
          <p className="m-0 flex gap-4">
            <a href={REPO} className="text-kumo-strong hover:text-kumo-default">GitHub</a>
            <a href="https://www.npmjs.com/package/create-website-build-kit" className="text-kumo-strong hover:text-kumo-default">npm</a>
            <a href={`${REPO}/blob/master/CHANGELOG.md`} className="text-kumo-strong hover:text-kumo-default">Changelog</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
