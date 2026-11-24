// Every POST carries X-Kit-Console: the server refuses one without it, which is
// what stops another tab from starting a gate (see server/http.mjs).
async function call(path, init) {
  const res = await fetch(path, init);
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) throw Object.assign(new Error(data.error ?? `HTTP ${res.status}`), { status: res.status, data });
  return data;
}

export const api = {
  status: () => call('/api/status'),
  gate: (script) => call(`/api/gates/${encodeURIComponent(script)}`),
  running: () => call('/api/running'),
  run: (script, opts = {}) =>
    call('/api/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-kit-console': '1' },
      body: JSON.stringify({ script, ...opts }),
    }),
};
