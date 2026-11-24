import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Banner, Button, Empty, Input, Loader, Tooltip } from '@cloudflare/kumo';
import {
  ArrowClockwiseIcon,
  CaretRightIcon,
  CheckCircleIcon,
  CircleDashedIcon,
  ClockCounterClockwiseIcon,
  GaugeIcon,
  GitCommitIcon,
  LinkIcon,
  ListChecksIcon,
  MinusCircleIcon,
  MoonIcon,
  PlayIcon,
  PlugsConnectedIcon,
  QuestionIcon,
  SunIcon,
  TerminalWindowIcon,
  WarningIcon,
  XCircleIcon,
  XIcon,
} from '@phosphor-icons/react';
import { api } from './api.js';

// ── Vocabulary ───────────────────────────────────────────────────────────────
// Full class names only: Tailwind compiles what it finds written out, so a
// class assembled by interpolation silently does not exist.

const STATUS = {
  fail: { label: 'Failed', icon: XCircleIcon, text: 'text-kumo-danger', dot: 'bg-kumo-danger', badge: 'error' },
  stale: { label: 'Stale', icon: ClockCounterClockwiseIcon, text: 'text-kumo-warning', dot: 'bg-kumo-warning', badge: 'warning' },
  warn: { label: 'Warnings', icon: WarningIcon, text: 'text-kumo-warning', dot: 'bg-kumo-warning', badge: 'warning' },
  never: { label: 'Never run', icon: CircleDashedIcon, text: 'text-kumo-subtle', dot: 'bg-kumo-fill', badge: 'neutral' },
  missing: { label: 'Not in site', icon: MinusCircleIcon, text: 'text-kumo-inactive', dot: 'bg-kumo-fill', badge: 'neutral' },
  pass: { label: 'Passed', icon: CheckCircleIcon, text: 'text-kumo-success', dot: 'bg-kumo-success', badge: 'success' },
};
const RANK = { fail: 0, stale: 1, never: 2, warn: 3, pass: 4, missing: 5 };

const INTEGRATION = {
  verified: { label: 'Verified', badge: 'success' },
  dropped: { label: 'Dropped', badge: 'neutral' },
  open: { label: 'Open', badge: 'error' },
};

const VIEWS = [
  { id: 'overview', label: 'Overview', icon: GaugeIcon },
  { id: 'gates', label: 'Gates', icon: ListChecksIcon },
  { id: 'integrations', label: 'Integrations', icon: PlugsConnectedIcon },
  { id: 'preserve', label: 'Preserved paths', icon: LinkIcon },
];

// ── Time ─────────────────────────────────────────────────────────────────────

function ago(iso, now) {
  if (!iso) return '—';
  const s = Math.max(0, Math.round((now - new Date(iso)) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 172800) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
function clock(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function took(ms) {
  if (ms == null) return '—';
  return ms < 1000 ? `${ms}ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)}s` : clock(ms);
}

function useNow(fast) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), fast ? 1000 : 15000);
    return () => clearInterval(t);
  }, [fast]);
  return now;
}

// ── Data ─────────────────────────────────────────────────────────────────────

function useConsole() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [live, setLive] = useState({ running: null, output: '' });
  const [updatedAt, setUpdatedAt] = useState(null);
  const running = live.running ?? status?.running ?? null;

  const refresh = useCallback(async () => {
    try {
      const s = await api.status();
      setStatus(s);
      setError(null);
      setUpdatedAt(Date.now());
    } catch (e) {
      setError(e.data?.error ?? (e.status ? e.message : 'The console server is not answering. Is `npm run serve` running?'));
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, running ? 2000 : 5000);
    return () => clearInterval(t);
  }, [refresh, running]);

  // While anything runs — from this page or from Claude Code — follow its log.
  const wasRunning = useRef(false);
  useEffect(() => {
    if (!running) {
      if (wasRunning.current) { wasRunning.current = false; refresh(); }
      return undefined;
    }
    wasRunning.current = true;
    let stop = false;
    const tick = async () => {
      try {
        const r = await api.running();
        if (!stop) setLive(r);
      } catch { /* the status poll reports the outage */ }
    };
    tick();
    const t = setInterval(tick, 900);
    return () => { stop = true; clearInterval(t); };
  }, [running, refresh]);

  const run = useCallback(async (script, url) => {
    const r = await api.run(script, url);
    setLive({ running: { script, by: 'the console', startedAt: r.startedAt, job: r.job }, output: '' });
    return r;
  }, []);

  return { status, error, live, running, updatedAt, refresh, run };
}

// ── Atoms ────────────────────────────────────────────────────────────────────

function Dot({ status, pulse }) {
  return <span aria-hidden="true" className={`inline-block size-2 shrink-0 rounded-full ${STATUS[status].dot} ${pulse ? 'pulse' : ''}`} />;
}

function StatusPill({ status }) {
  const s = STATUS[status];
  const Icon = s.icon;
  return (
    <Badge variant={s.badge} icon={<Icon weight="fill" />}>
      {s.label}
    </Badge>
  );
}

function Kbd({ children }) {
  return <span className="font-mono text-[12px] tracking-tight text-kumo-default">{children}</span>;
}

function Section({ title, aside, children, className = '' }) {
  return (
    <section className={`overflow-hidden rounded-xl bg-kumo-base ring-1 ring-kumo-hairline ${className}`}>
      {title && (
        <header className="flex items-center justify-between gap-3 border-b border-kumo-hairline px-5 py-3">
          <h2 className="m-0 text-[13px] font-medium tracking-tight text-kumo-default">{title}</h2>
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}

function Metric({ label, value, tone = 'text-kumo-default', sub }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-kumo-subtle">{label}</div>
      <div className={`tabular mt-1 text-2xl font-semibold tracking-tight ${tone}`}>{value}</div>
      {sub && <div className="mt-0.5 truncate text-xs text-kumo-subtle">{sub}</div>}
    </div>
  );
}

function Terminal({ text, title, meta, className = '' }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [text]);
  const lines = (text || '').replace(/\s+$/, '').split('\n');
  const tone = (l) =>
    /^\s*(✗|✖|error|Error)|\bexit [1-9]/.test(l) ? 'bad'
      : /^\s*(✓|✔)/.test(l) ? 'ok'
        : /⚠|warn/i.test(l) ? 'warn'
          : /^\s*›/.test(l) ? 'dim' : '';
  return (
    <div className={`terminal overflow-hidden rounded-lg ring-1 ring-black/40 ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-2 text-xs">
        <span className="flex items-center gap-2 font-mono text-[12px]">
          <TerminalWindowIcon size={14} className="dim" />
          {title}
        </span>
        <span className="dim font-mono text-[11px]">{meta}</span>
      </div>
      <pre ref={ref} className="scroll-thin m-0 max-h-[26rem] overflow-auto px-4 py-3 text-[12.5px] leading-[1.6]">
        {text ? lines.map((l, i) => <div key={i} className={tone(l)}>{l || ' '}</div>) : <span className="dim">No output yet.</span>}
      </pre>
    </div>
  );
}

// ── Shell ────────────────────────────────────────────────────────────────────

function ModeToggle() {
  const [mode, setMode] = useState(() => document.documentElement.dataset.mode || 'dark');
  const next = mode === 'dark' ? 'light' : 'dark';
  const flip = () => {
    document.documentElement.dataset.mode = next;
    try { localStorage.setItem('kit-console-mode', next); } catch { /* a preference, not state */ }
    setMode(next);
  };
  return (
    <Button variant="ghost" size="sm" shape="square" aria-label={`Switch to ${next} mode`} onClick={flip}>
      {mode === 'dark' ? <SunIcon size={16} /> : <MoonIcon size={16} />}
    </Button>
  );
}

function Sidebar({ view, setView, status, counts, error, updatedAt, now }) {
  return (
    <aside className="flex shrink-0 flex-col border-kumo-hairline bg-kumo-elevated md:sticky md:top-0 md:h-screen md:w-64 md:border-r">
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <div aria-hidden="true" className="grid size-8 place-items-center rounded-lg bg-kumo-contrast text-kumo-inverse">
          <ListChecksIcon size={17} weight="bold" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold tracking-tight text-kumo-default">{status?.site.name ?? 'Build console'}</div>
          <div className="truncate text-[11px] text-kumo-subtle">
            {status?.site.kitVersion ? `kit ${status.site.kitVersion}` : 'kit version unstamped'}
          </div>
        </div>
      </div>

      <nav aria-label="Views" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible">
        {VIEWS.map((v) => {
          const Icon = v.icon;
          const current = v.id === view;
          const n = counts[v.id];
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => setView(v.id)}
              aria-current={current ? 'page' : undefined}
              className={`group flex shrink-0 items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kumo-focus ${current ? 'bg-kumo-base font-medium text-kumo-default ring-1 ring-kumo-hairline' : 'text-kumo-strong hover:bg-kumo-tint'}`}
            >
              <Icon size={16} weight={current ? 'fill' : 'regular'} className={current ? 'text-kumo-default' : 'text-kumo-subtle'} />
              <span className="flex-1 whitespace-nowrap">{v.label}</span>
              {n > 0 && <span className="tabular rounded-full bg-kumo-danger-tint px-1.5 text-[11px] font-medium text-kumo-danger">{n}</span>}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto hidden border-t border-kumo-hairline px-5 py-4 md:block">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-[11px] text-kumo-subtle">
            <span className={`size-1.5 rounded-full ${error ? 'bg-kumo-danger' : 'bg-kumo-success pulse'}`} />
            {error ? 'Disconnected' : `Live · ${ago(updatedAt, now)}`}
          </span>
          <ModeToggle />
        </div>
        {status && <div className="mt-2 truncate font-mono text-[10.5px] text-kumo-inactive" title={status.site.path}>{status.site.path}</div>}
      </div>
    </aside>
  );
}

function TopBar({ title, status, running, now }) {
  const head = status?.site.head;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pb-6">
      <h1 className="m-0 text-xl font-semibold tracking-tight text-kumo-default">{title}</h1>
      <div className="flex flex-wrap items-center gap-2">
        {running && (
          <span className="flex items-center gap-2 rounded-full bg-kumo-info-tint px-3 py-1 text-xs text-kumo-info">
            <Loader size={12} />
            <Kbd>{running.script}</Kbd>
            <span className="opacity-80">· {running.by} · {clock(now - new Date(running.startedAt))}</span>
          </span>
        )}
        {head && (
          <Tooltip content={head.subject ?? ''}>
            <span className="flex items-center gap-1.5 rounded-full bg-kumo-base px-3 py-1 text-xs text-kumo-strong ring-1 ring-kumo-hairline">
              <GitCommitIcon size={14} />
              <Kbd>{head.sha}</Kbd>
              {head.dirty && <span className="text-kumo-warning">· uncommitted changes</span>}
            </span>
          </Tooltip>
        )}
        <span className="md:hidden"><ModeToggle /></span>
      </div>
    </div>
  );
}

// ── Overview ─────────────────────────────────────────────────────────────────

function PhaseTrack({ phases }) {
  return (
    <ol className="scroll-thin m-0 flex list-none gap-1.5 overflow-x-auto p-0 pb-1">
      {phases.map((p) => {
        const bar = p.state === 'done' ? 'bg-kumo-success' : p.state === 'active' ? 'bg-kumo-brand' : 'bg-kumo-fill';
        return (
          <li key={p.id} className="min-w-[4.75rem] flex-1" aria-current={p.state === 'active' ? 'step' : undefined}>
            <div className={`h-1.5 rounded-full ${bar}`} />
            <div className={`mt-2 text-[11px] leading-tight ${p.state === 'active' ? 'font-medium text-kumo-default' : p.state === 'done' ? 'text-kumo-strong' : 'text-kumo-inactive'}`}>
              <span className="tabular text-kumo-subtle">{p.id}</span> {p.label}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Hero({ status, gates }) {
  const { buildState, phaseGate, phases } = status;
  const active = phases.find((p) => p.state === 'active');
  const real = gates.filter((g) => g.status.key !== 'missing');
  const fresh = real.filter((g) => ['pass', 'warn'].includes(g.status.key)).length;
  const problems = real.filter((g) => ['fail', 'stale'].includes(g.status.key)).length;

  let verdict;
  if (!phaseGate) verdict = { tone: 'text-kumo-subtle', icon: QuestionIcon, text: 'No phase recorded in BUILD-STATE.md' };
  else if (phaseGate.ready === null) verdict = { tone: 'text-kumo-strong', icon: QuestionIcon, text: 'No script gates this phase — its gate is a judgement in build.md §3' };
  else if (phaseGate.ready) verdict = { tone: 'text-kumo-success', icon: CheckCircleIcon, text: 'Every gate is green on this tree — the phase can close' };
  else verdict = { tone: 'text-kumo-danger', icon: XCircleIcon, text: `Waiting on ${phaseGate.waitingOn.length} gate${phaseGate.waitingOn.length === 1 ? '' : 's'} before the phase can close` };
  const V = verdict.icon;

  return (
    <Section>
      <div className="grid gap-6 p-5 lg:grid-cols-[1.4fr_1fr] lg:p-6">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-kumo-subtle">
            {active ? `Phase ${active.id}` : 'Phase'}
            {buildState.phaseState ? ` · ${buildState.phaseState}` : ''}
          </div>
          <div className="mt-1 text-3xl font-semibold tracking-tight text-kumo-default">{active?.label ?? 'Not started'}</div>
          <div className={`mt-3 flex items-start gap-2 text-sm ${verdict.tone}`}>
            <V size={18} weight="fill" className="mt-px shrink-0" />
            <span>{verdict.text}</span>
          </div>
          {buildState.next && (
            <div className="mt-3 flex items-center gap-2 text-sm text-kumo-strong">
              <CaretRightIcon size={14} className="text-kumo-subtle" />
              <span className="text-kumo-subtle">Next</span> {buildState.next}
            </div>
          )}
        </div>
        <div className="grid grid-cols-3 gap-4 self-end rounded-lg bg-kumo-elevated p-4 ring-1 ring-kumo-hairline">
          <Metric label="Green" value={`${fresh}/${real.length}`} sub="on this tree" />
          <Metric label="Problems" value={problems} tone={problems ? 'text-kumo-danger' : 'text-kumo-default'} sub="failed or stale" />
          <Metric label="Blockers" value={status.blockers.filter((b) => b.kind === 'blocking').length} tone={status.blockers.some((b) => b.kind === 'blocking') ? 'text-kumo-danger' : 'text-kumo-default'} sub="from BUILD-STATE" />
        </div>
      </div>
      <div className="border-t border-kumo-hairline px-5 py-4 lg:px-6">
        <PhaseTrack phases={phases} />
      </div>
    </Section>
  );
}

function GateRow({ gate, now, onOpen, onRun, running, selected }) {
  const s = gate.status;
  const busy = running?.script === gate.script;
  return (
    <li className={`group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-kumo-tint ${selected ? 'bg-kumo-tint' : ''}`}>
      <Dot status={busy ? 'never' : s.key} pulse={busy} />
      <button type="button" onClick={() => onOpen(gate.script)} className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-kumo-focus">
        <div className="flex items-baseline gap-2">
          <Kbd>{gate.script}</Kbd>
          <span className={`text-xs ${STATUS[s.key].text}`}>{busy ? 'Running…' : STATUS[s.key].label}</span>
          {s.key === 'stale' && s.behind > 0 && <span className="tabular text-xs text-kumo-subtle">· {s.behind} commit{s.behind === 1 ? '' : 's'} behind</span>}
        </div>
        <div className="mt-0.5 truncate text-xs text-kumo-subtle">{gate.summary}</div>
      </button>
      <span className="tabular hidden w-20 text-right text-xs text-kumo-subtle sm:block">{ago(gate.at, now)}</span>
      {onRun && (
        <Button
          variant="ghost"
          size="sm"
          shape="square"
          aria-label={`Run ${gate.script}`}
          disabled={!!running || gate.status.key === 'missing'}
          loading={busy}
          onClick={() => onRun(gate)}
        >
          <PlayIcon size={14} weight="fill" />
        </Button>
      )}
    </li>
  );
}

function Overview({ status, gates, now, open, runGate, running }) {
  const attention = gates
    .filter((g) => status.phaseGate && g.phase <= status.phaseGate.phase && !['pass', 'warn', 'missing'].includes(g.status.key))
    .sort((a, b) => RANK[a.status.key] - RANK[b.status.key]);
  const ints = status.integrations;

  return (
    <div className="space-y-5">
      {!status.buildState.exists && (
        <Banner variant="alert" icon={<WarningIcon weight="fill" />} title="No BUILD-STATE.md" description="The phase, blockers and integrations come from it. The template ships a stub — build.md §3 says what goes in it." />
      )}
      {status.buildState.unfilled > 0 && status.buildState.exists && (
        <Banner variant="secondary" icon={<QuestionIcon weight="fill" />} title={`${status.buildState.unfilled} line${status.buildState.unfilled === 1 ? '' : 's'} in BUILD-STATE.md still carry the stub's ⚠ placeholder`} description="They are reported as unfilled, never as data." />
      )}
      <Hero status={status} gates={gates} />

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Section
          title="Needs attention"
          aside={<span className="tabular text-xs text-kumo-subtle">{attention.length ? `${attention.length} gate${attention.length === 1 ? '' : 's'}` : ''}</span>}
        >
          {attention.length ? (
            <ul className="m-0 list-none divide-y divide-kumo-hairline p-0">
              {attention.map((g) => (
                <GateRow key={g.script} gate={g} now={now} onOpen={open} onRun={runGate} running={running} />
              ))}
            </ul>
          ) : (
            <div className="flex items-center gap-3 px-5 py-8 text-sm text-kumo-subtle">
              <CheckCircleIcon size={20} weight="fill" className="text-kumo-success" />
              Nothing due for this phase is failed, stale or unrun.
            </div>
          )}
        </Section>

        <div className="space-y-5">
          <Section title="Open in BUILD-STATE">
            {status.blockers.length ? (
              <ul className="m-0 list-none divide-y divide-kumo-hairline p-0">
                {status.blockers.map((b) => (
                  <li key={b.text} className="flex gap-3 px-5 py-3 text-[13px]">
                    {b.kind === 'blocking'
                      ? <XCircleIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-kumo-danger" />
                      : <QuestionIcon size={16} weight="fill" className="mt-0.5 shrink-0 text-kumo-warning" />}
                    <span className="text-kumo-default">{b.text}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 px-5 py-6 text-sm text-kumo-subtle">No <Kbd>!</Kbd> blockers or <Kbd>?</Kbd> questions recorded.</p>
            )}
          </Section>

          <Section title="Integrations">
            <div className="grid grid-cols-3 gap-4 px-5 py-4">
              <Metric label="Verified" value={ints.filter((i) => i.state === 'verified').length} />
              <Metric label="Dropped" value={ints.filter((i) => i.state === 'dropped').length} />
              <Metric label="Open" value={ints.filter((i) => i.state === 'open').length} tone={ints.some((i) => i.state === 'open') ? 'text-kumo-danger' : 'text-kumo-default'} />
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

// ── Gates ────────────────────────────────────────────────────────────────────

function GateDetail({ gate, now, onRun, running, onClose, runError }) {
  const [record, setRecord] = useState(null);
  const [url, setUrl] = useState(gate.url ?? '');
  const busy = running?.script === gate.script;

  useEffect(() => {
    let stop = false;
    setRecord(null);
    api.gate(gate.script).then((r) => !stop && setRecord(r)).catch(() => !stop && setRecord(false));
    return () => { stop = true; };
  }, [gate.script, gate.at]);
  useEffect(() => setUrl(gate.url ?? ''), [gate.script, gate.url]);

  const s = gate.status;
  const needsUrl = gate.needsUrl === 'required';
  const facts = [
    ['Ran on', gate.sha ? <Kbd key="sha">{gate.sha}</Kbd> : '—'],
    ['When', ago(gate.at, now)],
    ['Against this tree', s.fresh ? <span key="f" className="text-kumo-success">current</span> : gate.at ? <span key="f" className="text-kumo-warning">{s.behind ? `${s.behind} commit${s.behind === 1 ? '' : 's'} behind` : 'different tree'}</span> : '—'],
    ['Took', took(gate.durationMs)],
  ];

  return (
    <Section className="lg:sticky lg:top-6">
      <header className="flex items-start justify-between gap-3 border-b border-kumo-hairline px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[15px] font-medium text-kumo-default">npm run {gate.script}</span>
            <StatusPill status={s.key} />
          </div>
          <div className="mt-1 text-xs text-kumo-subtle">
            Phase {gate.phase}{gate.readsDist ? ' · reads dist/, rebuilds first if dist/ is not from this tree' : ''}
          </div>
        </div>
        <Button variant="ghost" size="sm" shape="square" aria-label="Close" onClick={onClose}><XIcon size={14} /></Button>
      </header>

      <div className="space-y-5 px-5 py-5">
        <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-kumo-subtle">{k}</dt>
              <dd className="tabular m-0 mt-1 text-[13px] text-kumo-default">{v}</dd>
            </div>
          ))}
        </dl>

        {gate.changedTree && (
          <Banner size="sm" variant="alert" icon={<WarningIcon weight="fill" />} description="This run edited tracked files, so it measured a tree that no longer exists." />
        )}

        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => { e.preventDefault(); onRun(gate, url.trim() || undefined); }}
        >
          {gate.needsUrl && (
            <div className="min-w-56 flex-1">
              <Input
                size="sm"
                label={needsUrl ? 'Origin to check' : 'Origin (optional — defaults to localhost)'}
                placeholder="https://staging.example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required={needsUrl}
                type="url"
              />
            </div>
          )}
          <Button type="submit" variant="primary" size="sm" icon={<PlayIcon weight="fill" />} loading={busy} disabled={(!!running && !busy) || s.key === 'missing' || (needsUrl && !url.trim())}>
            {busy ? 'Running' : 'Run on this tree'}
          </Button>
          {running && !busy && <span className="text-xs text-kumo-subtle"><Kbd>{running.script}</Kbd> is running — one gate at a time</span>}
        </form>
        {runError && <Banner size="sm" variant="error" icon={<XCircleIcon weight="fill" />} description={runError} />}

        <div>
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-kumo-subtle">Summary</div>
          <p className="m-0 text-[13px] text-kumo-default">{gate.summary}</p>
        </div>

        {record === null && gate.at ? (
          <div className="flex items-center gap-2 text-xs text-kumo-subtle"><Loader size={12} /> Loading output</div>
        ) : record ? (
          <Terminal title={`npm run ${gate.script}${record.args?.length ? ` -- ${record.args.join(' ')}` : ''}`} meta={`exit ${record.exitCode} · ${took(record.durationMs)}`} text={record.outputTail} />
        ) : null}
      </div>
    </Section>
  );
}

function Gates({ status, gates, now, selected, setSelected, runGate, running, runError }) {
  const byPhase = useMemo(() => {
    const m = new Map();
    for (const g of gates) m.set(g.phase, [...(m.get(g.phase) ?? []), g]);
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [gates]);
  const gate = gates.find((g) => g.script === selected);
  const current = status.phaseGate?.phase ?? null;

  return (
    <div className={`grid items-start gap-5 ${gate ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]' : ''}`}>
      <Section>
        {byPhase.map(([phase, list]) => (
          <div key={phase} className="border-b border-kumo-hairline last:border-b-0">
            <div className="flex items-center justify-between bg-kumo-elevated px-5 py-2">
              <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-kumo-subtle">
                Phase {phase} · {status.phases[phase]?.label}
              </span>
              {current !== null && phase > current && <span className="text-[11px] text-kumo-inactive">not due yet</span>}
            </div>
            <ul className="m-0 list-none divide-y divide-kumo-hairline p-0">
              {list.map((g) => (
                <GateRow key={g.script} gate={g} now={now} onOpen={setSelected} running={running} selected={g.script === selected} />
              ))}
            </ul>
          </div>
        ))}
      </Section>
      {gate && <GateDetail gate={gate} now={now} onRun={runGate} running={running} onClose={() => setSelected(null)} runError={runError} />}
    </div>
  );
}

// ── Lists from BUILD-STATE ───────────────────────────────────────────────────

function StateList({ items, kind }) {
  const open = items.filter((i) => i.state === 'open').length;
  if (!items.length) {
    return (
      <Section>
        <Empty
          icon={kind === 'integrations' ? <PlugsConnectedIcon size={28} /> : <LinkIcon size={28} />}
          title={`No ${kind === 'integrations' ? 'integrations' : 'preserved paths'} recorded yet`}
          description={`One line each under “## ${kind === 'integrations' ? 'Integrations' : 'Preserve'}” in BUILD-STATE.md, ending verified or dropped on a date.`}
        />
      </Section>
    );
  }
  return (
    <div className="space-y-5">
      {open > 0 && (
        <Banner
          variant="error"
          icon={<WarningIcon weight="fill" />}
          title={`${open} line${open === 1 ? '' : 's'} in neither state`}
          description="Every line ends verified, or dropped with a date. There is no third state — it is the one that silently ships at 80%."
        />
      )}
      <Section>
        <ul className="m-0 list-none divide-y divide-kumo-hairline p-0">
          {items.map((i) => (
            <li key={i.raw} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
              <span className="min-w-40 flex-1 text-[13px] font-medium text-kumo-default">{i.name}</span>
              <span className="min-w-0 flex-[2] truncate text-xs text-kumo-subtle" title={i.detail}>{i.detail || '—'}</span>
              <span className="tabular w-24 text-xs text-kumo-subtle">{i.date ?? (i.state === 'open' ? '' : '—')}</span>
              <Badge variant={INTEGRATION[i.state].badge}>{INTEGRATION[i.state].label}</Badge>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

// ── Live run dock ────────────────────────────────────────────────────────────

function LiveDock({ live, now }) {
  const [open, setOpen] = useState(true);
  if (!live.running) return null;
  const r = live.running;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-4 md:left-64 md:px-8">
      <div className="mx-auto max-w-6xl rounded-xl bg-kumo-base shadow-2xl ring-1 ring-kumo-line">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px]">
          <Loader size={14} />
          <span className="text-kumo-default">Running <Kbd>{r.script}</Kbd></span>
          <span className="text-kumo-subtle">from {r.by}</span>
          <span className="tabular ml-auto font-mono text-xs text-kumo-subtle">{clock(now - new Date(r.startedAt))}</span>
          <CaretRightIcon size={14} className={`text-kumo-subtle transition-transform ${open ? 'rotate-90' : ''}`} />
        </button>
        {open && (
          <div className="px-3 pb-3">
            <Terminal title={`npm run ${r.script}`} meta="live" text={live.output} className="[&_pre]:max-h-64" />
          </div>
        )}
      </div>
    </div>
  );
}

// ── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const { status, error, live, running, updatedAt, refresh, run } = useConsole();
  const [view, setView] = useState('overview');
  const [selected, setSelected] = useState(null);
  const [runError, setRunError] = useState(null);
  const now = useNow(!!running);

  const gates = useMemo(() => status?.gates ?? [], [status]);
  const counts = useMemo(() => ({
    gates: gates.filter((g) => ['fail', 'stale'].includes(g.status.key)).length,
    integrations: (status?.integrations ?? []).filter((i) => i.state === 'open').length,
    preserve: (status?.preserve ?? []).filter((i) => i.state === 'open').length,
  }), [gates, status]);

  const runGate = useCallback(async (gate, url) => {
    setRunError(null);
    if (gate.needsUrl === 'required' && !url) {
      setSelected(gate.script);
      setView('gates');
      return;
    }
    try {
      await run(gate.script, url);
    } catch (e) {
      setRunError(e.message);
      setSelected(gate.script);
      setView('gates');
    }
  }, [run]);

  const openGate = (script) => { setSelected(script); setView('gates'); };
  const title = VIEWS.find((v) => v.id === view).label;

  return (
    <div className="min-h-screen bg-kumo-canvas text-kumo-default md:flex">
      <Sidebar view={view} setView={setView} status={status} counts={counts} error={error} updatedAt={updatedAt} now={now} />
      <main className={`min-w-0 flex-1 px-4 py-6 sm:px-8 md:py-8 ${live.running ? 'pb-80' : ''}`}>
        <div className="mx-auto max-w-6xl">
          <TopBar title={title} status={status} running={running} now={now} />

          {error && (
            <div className="mb-5">
              <Banner
                variant="error"
                icon={<XCircleIcon weight="fill" />}
                title="Cannot read the site"
                description={error}
                action={<Button size="sm" variant="secondary" icon={<ArrowClockwiseIcon />} onClick={refresh}>Retry</Button>}
              />
            </div>
          )}

          {!status ? (
            !error && <div className="flex items-center gap-2 py-24 text-sm text-kumo-subtle"><Loader size={16} /> Reading the site…</div>
          ) : view === 'overview' ? (
            <Overview status={status} gates={gates} now={now} open={openGate} runGate={runGate} running={running} />
          ) : view === 'gates' ? (
            <Gates status={status} gates={gates} now={now} selected={selected} setSelected={setSelected} runGate={runGate} running={running} runError={runError} />
          ) : view === 'integrations' ? (
            <StateList items={status.integrations} kind="integrations" />
          ) : (
            <StateList items={status.preserve} kind="preserve" />
          )}
        </div>
      </main>
      <LiveDock live={live} now={now} />
    </div>
  );
}
