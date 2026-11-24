#!/usr/bin/env node
/**
 * Build-state MCP server for sites built from website-build-kit.
 *
 *   claude mcp add kit -- node /path/to/website-build-kit/console/server/mcp.mjs --site .
 *
 * --site defaults to the directory Claude Code was started in. stdio only:
 * nothing listens on a port, so nothing on the network can reach it.
 */
import { resolve } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { GATES, kitStatus } from './state.mjs';
import { startGate, view, waitFor } from './runner.mjs';

const flag = process.argv.indexOf('--site');
const SITE = resolve(flag > -1 ? process.argv[flag + 1] : process.env.KIT_SITE ?? process.cwd());

const server = new McpServer({ name: 'website-build-kit', version: '0.1.0' });

const json = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
const refuse = (message) => ({ content: [{ type: 'text', text: message }], isError: true });

server.registerTool(
  'kit_status',
  {
    title: 'Build status',
    description:
      'Where this site build stands: the phase from BUILD-STATE.md, every gate with its last result and whether that ' +
      'result is still valid for the code as it is now (pass, warn, fail, stale, never), blockers, and integrations. ' +
      'Call this first when resuming a build. A gate that passed on an older tree is reported "stale", not passed — ' +
      'do not treat it as passed. Read-only.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () => {
    const status = kitStatus(SITE);
    return status.error ? refuse(status.error) : json(status);
  },
);

server.registerTool(
  'run_gate',
  {
    title: 'Run a gate',
    description:
      `Runs one of the site's own gate scripts (npm run <script>) and records the result against the current tree. ` +
      `Allowed: ${Object.keys(GATES).join(', ')}. Gates that read dist/ rebuild first if dist/ was not built from this tree. ` +
      'Waits up to wait_seconds; if the gate is still running it returns a job id for gate_result. ' +
      'Deploys, indexnow and live-site crawls are not available here by design.',
    inputSchema: {
      script: z.enum(Object.keys(GATES)).describe('The npm script to run'),
      url: z.string().optional().describe('Origin to check — required by verify, optional for a11y, reflow and console'),
      wait_seconds: z.number().min(0).max(50).default(40).describe('How long to wait before returning a job id'),
    },
  },
  async ({ script, url, wait_seconds }) => {
    const started = startGate(SITE, script, url, 'Claude Code');
    if (started.error) return refuse(started.error);
    const { job } = await waitFor(started.job.id, wait_seconds);
    return json(view(job));
  },
);

server.registerTool(
  'gate_result',
  {
    title: 'Gate result',
    description: 'The state and output of a gate started by run_gate. Waits up to wait_seconds for it to finish.',
    inputSchema: {
      job: z.string().describe('Job id from run_gate'),
      wait_seconds: z.number().min(0).max(50).default(40),
      tail: z.number().min(200).max(50_000).default(3000).describe('Characters of output to return, from the end'),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ job: id, wait_seconds, tail }) => {
    const r = await waitFor(id, wait_seconds);
    return r.error ? refuse(r.error) : json(view(r.job, { tail }));
  },
);

await server.connect(new StdioServerTransport());
