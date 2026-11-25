#!/usr/bin/env node
/**
 * The one command Claude Code needs to reach the build console. Use this, not
 * server/mcp.mjs, in any MCP config.
 *
 *   claude mcp add kit -- node /path/to/website-build-kit/console/bin/kit-mcp.mjs
 *
 * It does the things a fresh clone, a freshly installed plugin or Claude
 * Desktop cannot do for themselves, then starts the server:
 *
 *   0. Finds npm and git when the PATH it was given has neither (below).
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
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CONSOLE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WIN = process.platform === 'win32';

/*
 * ⚠ AN APP LAUNCHED FROM THE DOCK HAS NO SHELL PATH. Claude Desktop runs this
 *   server on its own built-in Node and hands it /usr/bin:/bin:/usr/sbin:/sbin —
 *   no nvm, no Homebrew, no Volta. kit_status still works, then every run_gate
 *   dies at its first `npm`. So when npm or git cannot be found, append the
 *   places they are usually installed. Appended, never prepended: whatever the
 *   PATH already resolves keeps winning.
 */
const onPath = (bin) =>
  (process.env.PATH ?? '').split(delimiter).some((d) =>
    d && (WIN ? ['.cmd', '.exe'].some((x) => existsSync(join(d, bin + x))) : existsSync(join(d, bin))),
  );

function nvmBin() {
  const root = process.env.NVM_DIR || join(homedir(), '.nvm');
  const versions = join(root, 'versions', 'node');
  if (!existsSync(versions)) return [];
  const installed = readdirSync(versions).filter((v) => /^v\d+\.\d+\.\d+$/.test(v));
  const num = (v) => v.slice(1).split('.').map(Number);
  const newest = installed.sort((a, b) => num(b)[0] - num(a)[0] || num(b)[1] - num(a)[1] || num(b)[2] - num(a)[2])[0];
  let pick = newest;
  try {
    /* nvm's default alias names a major, a full version, or another alias — use it when it resolves. */
    const alias = readFileSync(join(root, 'alias', 'default'), 'utf8').trim().replace(/^v/, '');
    pick = installed.find((v) => v === `v${alias}` || v.startsWith(`v${alias}.`)) ?? newest;
  } catch {}
  return pick ? [join(versions, pick, 'bin')] : [];
}

if (!onPath('npm') || !onPath('git')) {
  const home = homedir();
  const extra = WIN
    ? [
        join(process.env.ProgramFiles ?? 'C:\\Program Files', 'nodejs'),
        join(process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'npm'),
        join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Git', 'cmd'),
        join(home, 'AppData', 'Local', 'Volta', 'bin'),
      ]
    : [
        ...nvmBin(),
        join(home, '.volta', 'bin'),
        join(home, '.local', 'share', 'fnm', 'aliases', 'default', 'bin'),
        '/opt/homebrew/bin',
        '/usr/local/bin',
      ];
  const have = new Set((process.env.PATH ?? '').split(delimiter));
  const add = extra.filter((d) => !have.has(d) && existsSync(d));
  if (add.length) process.env.PATH = [process.env.PATH, ...add].filter(Boolean).join(delimiter);
  if (!onPath('npm')) {
    process.stderr.write('website-build-kit: npm not found on PATH or in the usual places; run_gate will fail until it is\n');
  }
}

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
