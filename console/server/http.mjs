#!/usr/bin/env node
/**
 * The page's server. Same state and runner as the MCP server; they share the
 * ledger, the lock and the live log on disk, so a gate Claude Code runs shows
 * up here while it runs.
 *
 *   npm start -- --site ../template          builds the page, then serves it
 *   node server/http.mjs --site . --port 4319
 *
 * Bound to 127.0.0.1 only. Two more locks, because a page any website can
 * reach is a page any website can drive:
 *   - Host must be a loopback name — defeats DNS rebinding, where a hostile
 *     domain re-resolves to 127.0.0.1 and becomes same-origin with this server
 *   - POST needs a custom header — a cross-origin request carrying one needs a
 *     CORS preflight, which this server never answers, so a drive-by form or
 *     fetch from another tab cannot start a gate
 */
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GATES, kitStatus, liveLogPath, readLedger, readRunning } from './state.mjs';
import { startGate, view, waitFor } from './runner.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const SITE = resolve(arg('site', process.env.KIT_SITE ?? process.cwd()));
const PORT = Number(arg('port', 4319));
const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

const TYPES = { '.png': 'image/png', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}

async function body(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 10_000) throw new Error('body too large');
  }
  return raw ? JSON.parse(raw) : {};
}

function tailOf(path, n) {
  try {
    const text = readFileSync(path, 'utf8');
    return text.slice(-n);
  } catch {
    return '';
  }
}

const server = createServer(async (req, res) => {
  const host = (req.headers.host ?? '').replace(/:\d+$/, '');
  if (!LOOPBACK.has(host)) return send(res, 421, { error: 'Loopback hosts only' });

  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  try {
    if (path.startsWith('/api/')) {
      if (req.method === 'POST' && req.headers['x-kit-console'] !== '1') {
        return send(res, 403, { error: 'Missing X-Kit-Console header' });
      }

      if (req.method === 'GET' && path === '/api/status') {
        const s = kitStatus(SITE);
        return send(res, s.error ? 422 : 200, s);
      }

      // The last recorded run of one gate, with its output.
      const gate = path.match(/^\/api\/gates\/([\w:%-]+)$/);
      if (req.method === 'GET' && gate) {
        const rec = readLedger(SITE)[decodeURIComponent(gate[1])];
        return rec ? send(res, 200, rec) : send(res, 404, { error: 'Never run on this machine' });
      }

      // Whatever is running now, from either process, and its output so far.
      if (req.method === 'GET' && path === '/api/running') {
        const running = readRunning(SITE);
        const tail = Math.min(Number(url.searchParams.get('tail')) || 20_000, 200_000);
        return send(res, 200, { running, output: running ? tailOf(liveLogPath(SITE), tail) : '' });
      }

      if (req.method === 'POST' && path === '/api/run') {
        const { script, url: target, old, new: next } = await body(req);
        const started = startGate(SITE, script, { url: target || undefined, old, new: next }, 'the console');
        if (started.error) return send(res, 409, { error: started.error });
        const { job } = await waitFor(started.job.id, 0);
        return send(res, 202, view(job));
      }

      const job = path.match(/^\/api\/jobs\/(\w+)$/);
      if (req.method === 'GET' && job) {
        const r = await waitFor(job[1], 0);
        return r.error ? send(res, 404, r) : send(res, 200, view(r.job, { tail: 20_000 }));
      }

      return send(res, 404, { error: 'No such endpoint' });
    }

    if (req.method !== 'GET') return send(res, 405, { error: 'GET only' });

    // A gate's own HTML report — match writes old | new | diff per section.
    // Served from that one directory of the site and nothing above it.
    const report = path.match(/^\/report\/([\w:-]+)\/(.*)$/);
    if (report) {
      const dir = GATES[report[1]]?.report;
      if (!dir) return send(res, 404, { error: 'No report for that gate' });
      const root = join(SITE, dir);
      let file = normalize(join(root, decodeURIComponent(report[2]) || 'index.html'));
      if (!file.startsWith(root)) return send(res, 400, { error: 'Bad path' });
      if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
      if (!existsSync(file)) return send(res, 404, 'No report yet — run the gate first.', 'text/plain; charset=utf-8');
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' });
      return createReadStream(file).pipe(res);
    }
    if (!existsSync(DIST)) {
      return send(res, 503, 'The page is not built. Run `npm start` (builds, then serves) or `npm run build` first.', 'text/plain; charset=utf-8');
    }
    let file = normalize(join(DIST, path));
    if (!file.startsWith(DIST)) return send(res, 400, { error: 'Bad path' });
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'x-frame-options': 'DENY',
    });
    createReadStream(file).pipe(res);
  } catch (e) {
    send(res, 400, { error: e.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const s = kitStatus(SITE);
  if (s.error) console.error(`⚠ ${s.error}`);
  console.log(`Build console → http://127.0.0.1:${PORT}   site: ${SITE}`);
});
