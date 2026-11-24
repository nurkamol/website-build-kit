import { useMemo, useState } from 'react';
import { Badge, Banner, Button, LayerCard, Table, Tabs, Text } from '@cloudflare/kumo';
import {
  CheckCircleIcon,
  CircleDashedIcon,
  ClockCounterClockwiseIcon,
  GitCommitIcon,
  PlayIcon,
  QuestionIcon,
  WarningIcon,
  XCircleIcon,
} from '@phosphor-icons/react';
import fixture from './fixture.json';

/*
 * SKETCH. Every number comes from fixture.json, whose shape is the proposed
 * kit_status contract for the MCP server. "Run" plays back canned output.
 */

// A result is only as good as the commit it ran on. A pass on an older commit
// is reported as STALE, never as a pass — a tick that predates the code it
// vouches for is the failure this console exists to show.
function statusOf(gate, site) {
  if (gate.result === 'never') return { key: 'never', behind: null };
  const behind = site.commitsSince[gate.sha] ?? null;
  if (gate.result === 'fail') return { key: 'fail', behind };
  if (behind === null || behind > 0) return { key: 'stale', behind };
  return { key: gate.result, behind };
}

const STATUS = {
  pass: { label: 'Passed', variant: 'success', icon: CheckCircleIcon },
  warn: { label: 'Warnings', variant: 'warning', icon: WarningIcon },
  fail: { label: 'Failed', variant: 'error', icon: XCircleIcon },
  stale: { label: 'Stale', variant: 'orange', icon: ClockCounterClockwiseIcon },
  never: { label: 'Never run', variant: 'neutral', icon: CircleDashedIcon },
};

// Full class names, never built by interpolation: Tailwind only compiles what
// it can find written out in the source.
const ICON_TONE = {
  pass: 'text-kumo-success',
  warn: 'text-kumo-warning',
  fail: 'text-kumo-danger',
  stale: 'text-kumo-warning',
  never: 'text-kumo-subtle',
};

const INTEGRATION = {
  verified: { label: 'Verified', variant: 'success' },
  dropped: { label: 'Dropped', variant: 'neutral' },
  open: { label: 'Open', variant: 'error' },
};

function ago(iso) {
  if (!iso) return '—';
  const now = new Date('2026-11-25T10:00:00Z'); // fixed so the sketch reads the same every day
  const h = Math.round((now - new Date(iso)) / 36e5);
  if (h < 1) return 'just now';
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function StatusBadge({ status }) {
  const s = STATUS[status.key];
  const Icon = s.icon;
  return (
    <Badge variant={s.variant} icon={<Icon weight="fill" />}>
      {s.label}
    </Badge>
  );
}

function Behind({ status }) {
  if (status.behind === null) return <Text variant="secondary" size="sm">—</Text>;
  if (status.behind === 0) return <Text variant="success" size="sm">at HEAD</Text>;
  return (
    <Text variant="error" size="sm">
      {status.behind} commit{status.behind === 1 ? '' : 's'} behind
    </Text>
  );
}

function Header({ site }) {
  return (
    <header className="border-b border-kumo-hairline bg-kumo-base">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <div>
          <Text variant="heading2" as="h1">{site.name}</Text>
          <Text variant="secondary" size="sm">
            {site.origin} · kit {site.kitVersion}
          </Text>
        </div>
        <div className="flex items-center gap-2 text-kumo-subtle">
          <GitCommitIcon size={18} />
          <Text variant="mono" size="sm">{site.head.sha}</Text>
          <Text variant="secondary" size="sm" className="hidden max-w-80 truncate md:block">
            {site.head.subject}
          </Text>
        </div>
      </div>
    </header>
  );
}

function PhaseStrip({ phases }) {
  return (
    <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {phases.map((p, i) => {
        const tone =
          p.state === 'done'
            ? 'ring-kumo-hairline'
            : p.state === 'active'
              ? 'ring-2 ring-kumo-brand'
              : 'ring-kumo-hairline opacity-60';
        return (
          <li key={p.id} className={`rounded-lg bg-kumo-base p-3 ring-1 ${tone}`}>
            <Text variant="secondary" size="xs">Phase {i}</Text>
            <div className="mt-1 flex items-center justify-between gap-2">
              <Text variant="heading3" as="span">{p.label}</Text>
              {p.state === 'done' && <CheckCircleIcon weight="fill" className="text-kumo-success" size={18} />}
              {p.state === 'active' && <Badge variant="primary">Active</Badge>}
            </div>
            <Text variant="secondary" size="xs">
              {p.gatedAt ? `Gate passed ${ago(p.gatedAt)}` : p.state === 'active' ? 'In progress' : 'Not started'}
            </Text>
          </li>
        );
      })}
    </ol>
  );
}

function Counts({ rows }) {
  const order = ['fail', 'stale', 'warn', 'never', 'pass'];
  return (
    <div className="flex flex-wrap gap-2">
      {order.map((k) => {
        const n = rows.filter((r) => r.status.key === k).length;
        if (!n) return null;
        return (
          <Badge key={k} variant={STATUS[k].variant} appearance="dot">
            {n} {STATUS[k].label.toLowerCase()}
          </Badge>
        );
      })}
    </div>
  );
}

function GateTable({ rows, onOpen }) {
  return (
    <LayerCard>
      <LayerCard.Secondary className="flex flex-wrap items-center justify-between gap-2">
        <span>Gates</span>
        <Counts rows={rows} />
      </LayerCard.Secondary>
      <LayerCard.Primary className="overflow-x-auto p-0">
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.Head>Script</Table.Head>
              <Table.Head>Phase</Table.Head>
              <Table.Head>Status</Table.Head>
              <Table.Head>Ran on</Table.Head>
              <Table.Head>Summary</Table.Head>
              <Table.Head className="sr-only">Open</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map(({ gate, status }) => (
              <Table.Row key={gate.script}>
                <Table.Cell><Text variant="mono" size="sm">npm run {gate.script}</Text></Table.Cell>
                <Table.Cell><Text variant="secondary" size="sm">{gate.phase}</Text></Table.Cell>
                <Table.Cell><StatusBadge status={status} /></Table.Cell>
                <Table.Cell>
                  <div className="flex flex-col">
                    {gate.sha ? <Text variant="mono-secondary" size="xs">{gate.sha} · {ago(gate.at)}</Text> : null}
                    <Behind status={status} />
                  </div>
                </Table.Cell>
                <Table.Cell className="max-w-72"><Text size="sm">{gate.summary}</Text></Table.Cell>
                <Table.Cell>
                  <Button variant="ghost" size="sm" onClick={() => onOpen(gate.script)}>Details</Button>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </LayerCard.Primary>
    </LayerCard>
  );
}

function Blockers({ blockers }) {
  if (!blockers.length) return null;
  return (
    <div className="space-y-3">
      {blockers.map((b) =>
        b.kind === 'blocking' ? (
          <Banner key={b.text} variant="error" icon={<XCircleIcon weight="fill" />} title="Blocking" description={`${b.text} — open since ${b.since}`} />
        ) : (
          <Banner key={b.text} variant="alert" icon={<QuestionIcon weight="fill" />} title="Open question" description={`${b.text} — asked ${b.since}`} />
        ),
      )}
    </div>
  );
}

function Overview({ data, rows, onOpen }) {
  const activeIndex = data.phases.findIndex((p) => p.state === 'active');
  const active = data.phases[activeIndex];
  const upTo = new Set(data.phases.slice(0, activeIndex + 1).map((p) => p.id));
  // The gate for the active phase needs its own gates and every earlier phase's.
  const phaseRows = rows.filter((r) => upTo.has(r.gate.phase));
  const ready = phaseRows.every((r) => r.status.key === 'pass');
  return (
    <div className="space-y-6">
      <PhaseStrip phases={data.phases} />
      {!ready && (
        <Banner
          variant="secondary"
          icon={<ClockCounterClockwiseIcon weight="fill" />}
          title={`${active.label} gate cannot pass yet`}
          description="Every gate must be green at HEAD. A pass on an older commit counts as stale, not passed."
        />
      )}
      <Blockers blockers={data.blockers} />
      <GateTable rows={rows} onOpen={onOpen} />
    </div>
  );
}

function GateDetail({ data, rows, selected, onSelect, onRun, running }) {
  const row = rows.find((r) => r.gate.script === selected) ?? rows[0];
  const output = data.output[row.gate.script];
  return (
    <div className="grid gap-6 md:grid-cols-[16rem_1fr]">
      <nav aria-label="Gates" className="flex flex-col gap-1">
        {rows.map(({ gate, status }) => {
          const Icon = STATUS[status.key].icon;
          const current = gate.script === row.gate.script;
          return (
            <button
              key={gate.script}
              type="button"
              aria-current={current ? 'true' : undefined}
              onClick={() => onSelect(gate.script)}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-kumo-default hover:bg-kumo-tint focus-visible:outline-2 focus-visible:outline-kumo-brand ${current ? 'bg-kumo-tint font-medium' : ''}`}
            >
              <Icon weight="fill" size={16} className={`shrink-0 ${ICON_TONE[status.key]}`} />
              <span className="truncate font-mono">{gate.script}</span>
            </button>
          );
        })}
      </nav>

      <LayerCard>
        <LayerCard.Secondary className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Text variant="mono">npm run {row.gate.script}</Text>
            <StatusBadge status={row.status} />
          </div>
          <Button
            variant="primary"
            size="sm"
            icon={PlayIcon}
            loading={running === row.gate.script}
            onClick={() => onRun(row.gate.script)}
          >
            Run at {data.site.head.sha}
          </Button>
        </LayerCard.Secondary>
        <LayerCard.Primary className="space-y-4">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            <Fact term="Ran on" value={row.gate.sha ?? '—'} mono />
            <Fact term="When" value={ago(row.gate.at)} />
            <Fact term="Against HEAD" value={<Behind status={row.status} />} />
            <Fact term="Took" value={row.gate.durationMs ? `${(row.gate.durationMs / 1000).toFixed(1)}s` : '—'} />
          </dl>
          <div>
            <Text variant="secondary" size="sm">Summary</Text>
            <Text>{row.gate.summary}</Text>
          </div>
          <div>
            <Text variant="secondary" size="sm">Output</Text>
            {output ? (
              <pre className="mt-2 max-h-96 overflow-auto rounded-md bg-kumo-recessed p-4 font-mono text-sm leading-relaxed text-kumo-default">
                {output}
              </pre>
            ) : (
              <Text variant="secondary" size="sm" className="mt-2 block">No output captured in the sketch for this gate.</Text>
            )}
          </div>
        </LayerCard.Primary>
      </LayerCard>
    </div>
  );
}

function Fact({ term, value, mono }) {
  return (
    <div>
      <dt><Text variant="secondary" size="xs">{term}</Text></dt>
      <dd className="m-0">{typeof value === 'string' ? <Text variant={mono ? 'mono' : 'body'} size="sm">{value}</Text> : value}</dd>
    </div>
  );
}

function Integrations({ items }) {
  const open = items.filter((i) => i.state === 'open').length;
  return (
    <div className="space-y-6">
      {open > 0 && (
        <Banner
          variant="error"
          icon={<WarningIcon weight="fill" />}
          title={`${open} integration${open === 1 ? '' : 's'} in neither state`}
          description="Every line ends verified in the provider's own dashboard, or dropped on a date. There is no third state — it is the one that silently ships at 80%."
        />
      )}
      <LayerCard>
        <LayerCard.Secondary>Integrations · from BUILD-STATE.md</LayerCard.Secondary>
        <LayerCard.Primary className="overflow-x-auto p-0">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.Head>Integration</Table.Head>
                <Table.Head>Identifier</Table.Head>
                <Table.Head>State</Table.Head>
                <Table.Head>Evidence</Table.Head>
                <Table.Head>Date</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {items.map((i) => (
                <Table.Row key={i.name}>
                  <Table.Cell><Text size="sm">{i.name}</Text></Table.Cell>
                  <Table.Cell><Text variant="mono-secondary" size="sm">{i.id}</Text></Table.Cell>
                  <Table.Cell><Badge variant={INTEGRATION[i.state].variant}>{INTEGRATION[i.state].label}</Badge></Table.Cell>
                  <Table.Cell><Text variant="secondary" size="sm">{i.note}</Text></Table.Cell>
                  <Table.Cell><Text variant={i.date ? 'secondary' : 'error'} size="sm">{i.date ?? 'missing'}</Text></Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </LayerCard.Primary>
      </LayerCard>
    </div>
  );
}

export default function App() {
  const [data, setData] = useState(fixture);
  const [tab, setTab] = useState('overview');
  const [selected, setSelected] = useState('check:contact');
  const [running, setRunning] = useState(null);

  const rows = useMemo(() => {
    const rank = { fail: 0, stale: 1, warn: 2, never: 3, pass: 4 };
    return data.gates
      .map((gate) => ({ gate, status: statusOf(gate, data.site) }))
      .sort((a, b) => rank[a.status.key] - rank[b.status.key]);
  }, [data]);

  const open = (script) => {
    setSelected(script);
    setTab('gates');
  };

  // Sketch only: pretend the gate ran at HEAD. A stale pass becomes a fresh
  // pass; a failure stays a failure — re-running does not fix anything.
  const run = (script) => {
    setRunning(script);
    setTimeout(() => {
      setData((d) => ({
        ...d,
        site: { ...d.site, commitsSince: { ...d.site.commitsSince, [d.site.head.sha]: 0 } },
        gates: d.gates.map((g) =>
          g.script !== script
            ? g
            : {
                ...g,
                sha: d.site.head.sha,
                at: '2026-11-25T10:00:00Z',
                result: g.result === 'never' ? 'pass' : g.result,
                summary: g.result === 'never' ? 'Ran at HEAD (sketch)' : g.summary,
              },
        ),
      }));
      setRunning(null);
    }, 1400);
  };

  return (
    <div className="min-h-screen bg-kumo-canvas text-kumo-default">
      <Header site={data.site} />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        <Tabs
          variant="underline"
          value={tab}
          onValueChange={setTab}
          tabs={[
            { value: 'overview', label: 'Overview' },
            { value: 'gates', label: 'Gates' },
            { value: 'integrations', label: 'Integrations' },
          ]}
        />
        {tab === 'overview' && <Overview data={data} rows={rows} onOpen={open} />}
        {tab === 'gates' && (
          <GateDetail data={data} rows={rows} selected={selected} onSelect={setSelected} onRun={run} running={running} />
        )}
        {tab === 'integrations' && <Integrations items={data.integrations} />}
        <Text variant="secondary" size="xs" className="block pt-4">
          Sketch · fixture data · nothing here talks to a site or to Claude Code yet
        </Text>
      </main>
    </div>
  );
}
