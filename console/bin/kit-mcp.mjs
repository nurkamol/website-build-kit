#!/usr/bin/env node
/**
 * The one command Claude Code needs to reach the build console. Use this, not
 * server/mcp.mjs, in any MCP config.
 *
 *   claude mcp add kit -- node /path/to/website-build-kit/console/bin/kit-mcp.mjs
 *
 * It does the two things a fresh clone or a freshly installed plugin cannot do
 * for itself, then starts the server:
 *
 *   1. Installs the console's dependencies on first run. Installing a plugin
 *      copies files and runs nothing, so a bare `node server/mcp.mjs` dies on
 *      its first import, and the error goes to a log nobody opens. Claude Code
 *      shows the server as "failed" with no reason given.
 *   2. Finds the site: --site, then KIT_SITE, then CLAUDE_PROJECT_DIR, then the
 *      working directory.
 *
 * ⚠ STDOUT IS THE PROTOCOL. One line of npm output on stdout corrupts the MCP
 *   handshake. Everything the install prints is routed to stderr.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CONSOLE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WIN = process.platform === 'win32';

if (!existsSync(join(CONSOLE, 'node_modules', '@modelcontextprotocol', 'sdk', 'package.json'))) {
  process.stderr.write(`website-build-kit: first run, installing the console's dependencies in ${CONSOLE}\n`);
  const r = spawnSync('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: CONSOLE,
    stdio: ['ignore', process.stderr, process.stderr],
    shell: WIN,
  });
  if (r.status !== 0) {
    process.stderr.write(
      `website-build-kit: npm ci failed (exit ${r.status ?? r.signal}). ` +
        `Run it yourself: cd "${CONSOLE}" && npm ci\n`,
    );
    process.exit(1);
  }
}

if (!process.argv.includes('--site') && !process.env.KIT_SITE) {
  process.env.KIT_SITE = process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

await import('../server/mcp.mjs');
