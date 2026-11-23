/**
 * The crawler's host guard — shared by `recon` and `design`, which both point
 * a client at the OLD site, a server that is not ours.
 *
 * Moved here from recon.mjs when `design` became the second crawler. Two
 * copies of a security check drift the first time one of them is fixed.
 */

/*
 * ── WHAT THIS BLOCKS, AND WHAT IT DOES NOT ─────────────────────────────────
 * Loopback, the RFC1918 private ranges, link-local (which is where the cloud
 * metadata services live, at 169.254.169.254) and localhost. The threat is a
 * redirect: the OLD site is not ours, and a 302 it issues must not be able to
 * steer this crawler at infrastructure on the operator's network.
 *
 * ⚠ THIS IS A STRING BLOCKLIST AND IT ONLY SEES LITERAL ADDRESSES. A HOSTNAME
 *   THAT *RESOLVES* TO LOOPBACK WALKS STRAIGHT THROUGH — `localtest.me` is a
 *   public name that resolves to ::1 today, and any attacker can point their
 *   own name wherever they like. Closing that needs resolution before connect
 *   plus a pinned socket, which fetch does not expose.
 *
 *   So treat this as defence in depth, not a barrier. It raises the cost of
 *   the obvious attack; it does not make the crawler safe to point at a host
 *   you do not trust.
 *
 * Node's URL parser canonicalises before we ever see the host, which is why
 * the short forms need no special handling: 127.1, 2130706433 and 0177.0.0.1
 * all arrive as 127.0.0.1, and [0:0:0:0:0:0:0:1] arrives as ::1.
 *
 * ⚠ IT CANONICALISES IPv4-MAPPED IPv6 THE WRONG WAY FOR US. `::ffff:127.0.0.1`
 *   comes back as `[::ffff:7f00:1]` — the same address in hex — so a blocklist
 *   written in dotted quad never matches it. It has to be folded back by hand,
 *   which is what unmapV4 does. Stripping the literal `::ffff:` prefix is NOT
 *   enough and looks like it works.
 */
export const BLOCKED_HOST_RE =
  /^(127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|192\.168(?:\.\d{1,3}){2}|169\.254(?:\.\d{1,3}){2}|0\.0\.0\.0|localhost|::1|metadata\.google\.internal)$/i;

/** `::ffff:7f00:1` → `127.0.0.1`. Returns the host unchanged if it is not mapped. */
export function unmapV4(host) {
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(host);
  if (hex) {
    const [hi, lo] = [parseInt(hex[1], 16), parseInt(hex[2], 16)];
    return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join('.');
  }
  return host.replace(/^::ffff:/i, '');
}

/**
 * Why this URL is refused, or null if it is fine. Never throws.
 *
 * The `kind` matters: only a `host` refusal is something --allow-internal can
 * excuse. A bad protocol is a typo, and telling someone to pass a flag that
 * cannot help them is worse than saying nothing.
 */
export function blockedReason(url, { allowInternal = false } = {}) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { kind: 'url', reason: `unparseable URL: ${url}` };
  }
  const { protocol, hostname } = parsed;
  if (protocol !== 'http:' && protocol !== 'https:') {
    return { kind: 'protocol', reason: `blocked protocol: ${protocol}` };
  }
  if (allowInternal) return null;
  const host = unmapV4(hostname.replace(/^\[|\]$/g, ''));
  if (BLOCKED_HOST_RE.test(host)) return { kind: 'host', reason: `blocked internal host: ${hostname}` };
  return null;
}
