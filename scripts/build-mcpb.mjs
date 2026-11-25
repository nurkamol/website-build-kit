#!/usr/bin/env node
/**
 * Builds the Claude Desktop bundle of the build console's MCP server.
 *
 *   npm run build:mcpb          # → dist-mcpb/website-build-kit-<version>.mcpb
 *
 * Double-click the file and Claude Desktop installs it, asking for the site's
 * folder. Same server as the plugin and `claude mcp add`, same launcher.
 *
 * What goes in, and why only that:
 *   - console/bin and console/server (not the tests): the launcher and the server
 *   - node_modules for the server's two runtime imports — the MCP SDK and zod —
 *     at the versions console/package.json pins. Not the page's React, Kumo and
 *     ECharts: Desktop never serves the page, and they would triple the download
 *
 * ⚠ DESKTOP HAS NO PROJECT DIRECTORY. Claude Code starts the server inside the
 *   site and says so in CLAUDE_PROJECT_DIR; Desktop starts it from nowhere in
 *   particular. So the bundle asks for the site at install time and passes it
 *   as KIT_SITE — another site means changing that setting, not opening a folder.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WIN = process.platform === 'win32';
const MCPB = '@anthropic-ai/mcpb@2.1.2';

const kit = JSON.parse(readFileSync(join(ROOT, 'create', 'package.json'), 'utf8'));
const consolePkg = JSON.parse(readFileSync(join(ROOT, 'console', 'package.json'), 'utf8'));
const plugin = JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
if (consolePkg.version !== kit.version || plugin.version !== kit.version) {
  console.error(`✗ versions disagree: create ${kit.version}, console ${consolePkg.version}, plugin ${plugin.version}`);
  process.exit(1);
}

const OUT = join(ROOT, 'dist-mcpb');
const STAGE = join(OUT, 'stage');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(STAGE, { recursive: true });

cpSync(join(ROOT, 'console', 'bin'), join(STAGE, 'bin'), { recursive: true });
cpSync(join(ROOT, 'console', 'server'), join(STAGE, 'server'), {
  recursive: true,
  filter: (src) => !src.endsWith('.test.mjs'),
});
cpSync(join(ROOT, 'site', 'brand', 'apple-touch-icon.png'), join(STAGE, 'icon.png'));

const pick = (name) => {
  const v = consolePkg.dependencies[name];
  if (!v) throw new Error(`console/package.json no longer depends on ${name}`);
  return v;
};
/* The server reads its version from ../package.json, so the stage carries one. */
writeFileSync(
  join(STAGE, 'package.json'),
  JSON.stringify(
    {
      name: 'website-build-kit-console-mcp',
      version: kit.version,
      private: true,
      type: 'module',
      dependencies: { '@modelcontextprotocol/sdk': pick('@modelcontextprotocol/sdk'), zod: pick('zod') },
    },
    null,
    2,
  ) + '\n',
);
execFileSync('npm', ['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock'], {
  cwd: STAGE,
  stdio: 'inherit',
  shell: WIN,
});

const manifest = {
  manifest_version: '0.3',
  name: 'website-build-kit',
  display_name: 'Website Build Kit — build console',
  version: kit.version,
  description:
    "Where a site build stands, read from the site itself: phase, blockers, and every gate's last result — stale when the code has moved on.",
  long_description:
    'The build console of [website-build-kit](https://github.com/nurkamol/website-build-kit), for a site built from its template. ' +
    '`kit_status` reads the phase, blockers and integrations from BUILD-STATE.md and every gate run recorded against the site as it is now — ' +
    'a pass on an older tree reads stale, never passed. `run_gate` runs one of the site\'s own checks (npm run …) and records it; ' +
    '`match` compares the rebuild with the live old site section by section. Deploys, search-engine submission and live-site crawls are not available, by design.\n\n' +
    'Needs Node.js and npm installed on this machine for running gates (nvm, Volta, Homebrew and the official installer are found automatically).',
  author: { name: 'Nurkamol Vakhidov', url: 'https://github.com/nurkamol' },
  repository: { type: 'git', url: 'https://github.com/nurkamol/website-build-kit' },
  homepage: 'https://nurkamol.github.io/website-build-kit/',
  documentation: 'https://github.com/nurkamol/website-build-kit/blob/master/console/README.md',
  support: 'https://github.com/nurkamol/website-build-kit/issues',
  icon: 'icon.png',
  license: 'MIT',
  keywords: ['website', 'astro', 'cloudflare', 'wordpress-migration', 'accessibility', 'build'],
  server: {
    type: 'node',
    entry_point: 'bin/kit-mcp.mjs',
    mcp_config: {
      command: 'node',
      args: ['${__dirname}/bin/kit-mcp.mjs'],
      env: { KIT_SITE: '${user_config.site}' },
    },
  },
  tools: [
    { name: 'kit_status', description: 'Where the build stands: phase, gates and whether each result still holds, blockers, integrations. Read-only.' },
    { name: 'run_gate', description: "Runs one of the site's own gate scripts and records the result against the current tree." },
    { name: 'gate_result', description: 'The result of a gate started with run_gate.' },
  ],
  user_config: {
    site: {
      type: 'directory',
      title: 'Site folder',
      description: 'The site built from the website-build-kit template — the folder holding its package.json and BUILD-STATE.md.',
      required: true,
    },
  },
  compatibility: { platforms: ['darwin', 'win32'], runtimes: { node: '>=20.0.0' } },
};
writeFileSync(join(STAGE, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

const file = join(OUT, `website-build-kit-${kit.version}.mcpb`);
execFileSync('npx', ['--yes', MCPB, 'validate', join(STAGE, 'manifest.json')], { stdio: 'inherit', shell: WIN });
execFileSync('npx', ['--yes', MCPB, 'pack', STAGE, file], { stdio: 'inherit', shell: WIN });
if (!existsSync(file)) {
  console.error('✗ mcpb pack reported success and wrote nothing');
  process.exit(1);
}
console.log(`\n✓ ${file}`);
